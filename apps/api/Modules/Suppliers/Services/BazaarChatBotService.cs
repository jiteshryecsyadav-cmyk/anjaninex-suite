using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Controllers;
using Namokara.Api.Modules.Platform.Hubs;

namespace Namokara.Api.Modules.Suppliers.Services;

// =============================================================================
// BAZAAR BOT — Party Chat ke andar (WhatsApp QR-bot ka flow, apne chat me).
// bot/lib/pipeline.js + orders.js + match.js ka .NET roop:
//   Supplier photo bheje → rate poochho/nikaalo → watermark → wa.incoming →
//   matching buyers ke Party Chat me broadcast (ORDER <code>) →
//   buyer ORDER kare → qty → supplier accept/reject → wa.orders.
// ZAROORI: bot sirf tab bolta hai jab saaf signal ho (supplier ki photo, rate ka
// jawab, ORDER code, buyer search) — warna CHUP, kyunki yehi chat firm↔party ki
// aam baat-cheet bhi hai. Har jagah fail-soft: bot gire to chat kabhi na ruke.
// =============================================================================

public interface IBazaarChatBotService
{
    /// Party (public side) ka message aane ke BAAD call hota hai. Kabhi throw nahi karta.
    Task HandlePartyMessageAsync(Guid threadId, string? body, string? attachmentFileName, string? attachmentType);
}

public class BazaarChatBotService : IBazaarChatBotService
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly IHubContext<PartyChatHub> _hub;
    private readonly ILogger<BazaarChatBotService> _log;
    public BazaarChatBotService(AppDbContext db, IWebHostEnvironment env,
        IHubContext<PartyChatHub> hub, ILogger<BazaarChatBotService> log)
    { _db = db; _env = env; _hub = hub; _log = log; }

    private const int MaxBroadcast = 50;
    private const string BotName = "Bazaar Bot 🤖";
    private static readonly Regex TrackCodeRx = new(@"(?:NAM|BZ)-\S+", RegexOptions.IgnoreCase);
    private static readonly Regex RangeRx = new(@"\d+\s*-\s*\d+");
    private static readonly Regex FabricRx = new(
        "(cotton|silk|saree|kurti|viscose|rayon|print|fabric|lehenga|dupatta|net|chiffon|jacquard|linen|georgette)",
        RegexOptions.IgnoreCase);
    // "Rate 699", "price: 150", "rs 200", "₹ 90", "@120" → number. Warna 0.
    private static readonly Regex LabeledRateRx = new(
        @"(?:rate|price|rs|inr|rupees|₹|@)\s*[:\-]?\s*(\d+(?:\.\d+)?)", RegexOptions.IgnoreCase);

    public async Task HandlePartyMessageAsync(Guid threadId, string? body, string? attachmentFileName, string? attachmentType)
    {
        try { await Handle(threadId, body, attachmentFileName, attachmentType); }
        catch (Exception ex) { _log.LogWarning(ex, "Bazaar bot fail-soft (thread {Thread})", threadId); }
    }

    // ---------------- core ----------------

    private async Task Handle(Guid threadId, string? body, string? attachFile, string? attachType)
    {
        Guid firmId = Guid.Empty, partyId = Guid.Empty;
        string partyName = "", phone = "";
        await using (var cmd = await Cmd(
            "SELECT firm_id, party_id, party_name, phone FROM platform.party_chat_threads WHERE id = @t"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", threadId));
            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync()) return;
            firmId = r.GetGuid(0); partyId = r.GetGuid(1); partyName = r.GetString(2); phone = r.GetString(3);
        }

        // RLS context (public endpoint par set hota hai — dobara set karna safe hai)
        await using (var cmd = await Cmd("SELECT set_config('app.current_firm_id', @f, false)"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId.ToString()));
            await cmd.ExecuteNonQueryAsync();
        }

        if (!await FlagOn(firmId)) return;

        var phone10 = Last10(phone);
        var (state, ctx) = await GetState(threadId);
        var text = (body ?? "").Trim();
        var isImage = attachType == "image" && !string.IsNullOrEmpty(attachFile);

        if (isImage)
        {
            await HandlePhoto(threadId, firmId, partyName, phone10, text, attachFile!);
            return;
        }
        if (text.Length == 0) return;

        if (state is "ORDER_CONFIRM" or "ORDER_QTY" or "ORDER_ACCEPT")
        { await HandleOrderReply(threadId, firmId, text, state, ctx); return; }

        if (state == "ASK_RATE")
        { await HandleRateReply(threadId, firmId, partyName, phone10, text, ctx); return; }

        var code = FindTrackCode(text);
        if (code != null)
        { await StartBuyerOrder(threadId, firmId, partyName, phone10, code); return; }

        // Buyer search — "Cotton 100-150" jaisa saaf pattern ho tabhi
        if ((RangeRx.IsMatch(text) || FabricRx.IsMatch(text))
            && await FindBuyerByPhone(firmId, phone10) is not null)
            await BuyerSearch(threadId, firmId, text);
        // warna CHUP — ye firm↔party ki aam chat hai
    }

    // ---------------- photo ----------------

    private async Task HandlePhoto(Guid threadId, Guid firmId, string partyName, string phone10, string caption, string attachFile)
    {
        var supplier = await FindSupplierByPhone(firmId, phone10);
        if (supplier is null) return;   // buyer/anjaan ki photo = aam chat, bot chup

        var path = Path.Combine(PartyChatController.UploadDir(_env), attachFile);
        if (!File.Exists(path)) return;
        var bytes = await File.ReadAllBytesAsync(path);

        // Both-firm (supplier+buyer ek hi number): humari watermarked photo wapas aayi
        // ho to wo buyer ki pasand hai, naya stock nahi — chup raho.
        if (await FindBuyerByPhone(firmId, phone10) is not null && PhotoWatermark.HasWatermark(bytes)) return;

        var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()[..16];
        var (rate, unit, catId, catName) = await ExtractRate(firmId, caption);

        Guid incId;
        await using (var cmd = await Cmd(@"
            INSERT INTO wa.incoming
              (firm_id, from_phone, supplier_id, image_hash, image_path, caption,
               rate, rate_unit, category_id, category_name, status, model_used, source)
            VALUES (@f, @ph, @sid, @h, @p, @c, @r, @u, @cid, @cn, @st, 'regex', 'pchat')
            RETURNING id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
            cmd.Parameters.Add(new NpgsqlParameter("ph", phone10));
            cmd.Parameters.Add(new NpgsqlParameter("sid", supplier.Value.id));
            cmd.Parameters.Add(new NpgsqlParameter("h", hash));
            cmd.Parameters.Add(new NpgsqlParameter("p", path));
            cmd.Parameters.Add(new NpgsqlParameter("c", (object?)NullIfEmpty(caption) ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("r", rate));
            cmd.Parameters.Add(new NpgsqlParameter("u", unit));
            cmd.Parameters.Add(new NpgsqlParameter("cid", (object?)catId ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("cn", (object?)catName ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("st", rate > 0 ? "processing" : "awaiting_rate"));
            incId = (Guid)(await cmd.ExecuteScalarAsync())!;
        }

        if (rate > 0)
        {
            var res = await Finalize(threadId, firmId, incId, supplier.Value.name, phone10, path, rate, unit, catId, catName);
            await BotReply(threadId, firmId,
                $"✅ Photo save ho gayi!\nRate: ₹{rate:0.##}/{unit}{(catName != null ? " · " + catName : "")}\n" +
                $"Code: {res.code}\n{res.sent} matching buyer(s) ko bhej di" +
                (res.noChat > 0 ? $" ({res.noChat} ke paas Party Chat nahi)." : "."));
            return;
        }

        await SetState(threadId, "ASK_RATE", new Dictionary<string, object?> { ["incoming_id"] = incId });
        await BotReply(threadId, firmId, "📷 Photo mil gayi! Is fabric ka *rate* kya hai?\n(sirf number bhejein, jaise 699)");
    }

    private async Task HandleRateReply(Guid threadId, Guid firmId, string partyName, string phone10, string text, Dictionary<string, JsonElement> ctx)
    {
        var rate = ParsePlainNumber(text);
        if (rate <= 0) { await BotReply(threadId, firmId, "Sirf number bhejein, jaise 699"); return; }

        var incId = CtxGuid(ctx, "incoming_id");
        string? imagePath = null, unitDb = null, catName = null; Guid? catId = null;
        if (incId != Guid.Empty)
            await using (var cmd = await Cmd(
                "SELECT image_path, rate_unit, category_id, category_name FROM wa.incoming WHERE id = @i"))
            {
                cmd.Parameters.Add(new NpgsqlParameter("i", incId));
                await using var r = await cmd.ExecuteReaderAsync();
                if (await r.ReadAsync())
                {
                    imagePath = r.IsDBNull(0) ? null : r.GetString(0);
                    unitDb = r.IsDBNull(1) ? null : r.GetString(1);
                    catId = r.IsDBNull(2) ? null : r.GetGuid(2);
                    catName = r.IsDBNull(3) ? null : r.GetString(3);
                }
            }
        if (imagePath is null || !File.Exists(imagePath))
        {
            await ClearState(threadId);
            await BotReply(threadId, firmId, "Photo nahi mili, dobara bhejein.");
            return;
        }

        var supplier = await FindSupplierByPhone(firmId, phone10);
        var res = await Finalize(threadId, firmId, incId, supplier?.name ?? partyName, phone10,
                                 imagePath, rate, unitDb ?? "mtr", catId, catName);
        await ClearState(threadId);
        await BotReply(threadId, firmId,
            $"✅ Rate ₹{rate:0.##} set ho gaya!\nCode: {res.code}\n{res.sent} matching buyer(s) ko photo bhej di" +
            (res.noChat > 0 ? $" ({res.noChat} ke paas Party Chat nahi)." : "."));
    }

    // Photo finalize: code do, watermark karo, buyers ke Party Chat me bhejo.
    private async Task<(string code, int sent, int noChat)> Finalize(
        Guid supplierThreadId, Guid firmId, Guid incId, string supplierName, string supplierPhone10,
        string imagePath, decimal rate, string unit, Guid? catId, string? catName)
    {
        var code = "BZ-" + incId.ToString("N")[..6].ToUpperInvariant() + "-R" + rate.ToString("0.##");

        // Watermark (fail-soft: na lage to original hi jayegi)
        var finalPath = imagePath;
        var finalUrl = "/api/party-chat/public/file/" + Path.GetFileName(imagePath);
        try
        {
            string firmPrefix = "Bazaar";
            await using (var cmd = await Cmd("SELECT name FROM platform.firms WHERE id = @f"))
            {
                cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
                if (await cmd.ExecuteScalarAsync() is string fn && fn.Length > 0)
                    firmPrefix = fn.Split(' ')[0];
            }
            var wm = PhotoWatermark.Apply(await File.ReadAllBytesAsync(imagePath), firmPrefix,
                PhotoWatermark.BuildLabel(supplierName, supplierPhone10, rate, unit));
            var wmName = "wm" + Guid.NewGuid().ToString("N") + ".jpg";
            finalPath = Path.Combine(PartyChatController.UploadDir(_env), wmName);
            await File.WriteAllBytesAsync(finalPath, wm);
            finalUrl = "/api/party-chat/public/file/" + wmName;
        }
        catch (Exception ex) { _log.LogWarning(ex, "Watermark fail — original photo hi jayegi"); }

        await using (var cmd = await Cmd(@"
            UPDATE wa.incoming
               SET rate = @r, rate_unit = @u, category_id = @cid, category_name = @cn,
                   track_code = @tc, image_path = @p, status = 'processed', model_used = 'regex'
             WHERE id = @i"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("r", rate));
            cmd.Parameters.Add(new NpgsqlParameter("u", unit));
            cmd.Parameters.Add(new NpgsqlParameter("cid", (object?)catId ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("cn", (object?)catName ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("tc", code));
            cmd.Parameters.Add(new NpgsqlParameter("p", finalPath));
            cmd.Parameters.Add(new NpgsqlParameter("i", incId));
            await cmd.ExecuteNonQueryAsync();
        }

        // Matching buyers → unke Party Chat me photo + ORDER code
        var buyers = await FindBuyersForRate(firmId, rate, catId);
        int sent = 0, noChat = 0;
        var caption = $"🆕 Naya stock!\n{catName ?? "Fabric"} · ₹{rate:0.##}/{unit}\n\nOrder ke liye reply karein:\nORDER {code}";

        foreach (var b in buyers)
        {
            if (sent >= MaxBroadcast) break;
            var bp10 = Last10(b.phone);
            if (bp10.Length < 10 || bp10 == supplierPhone10) continue;

            var party = await FindPartyByPhone(firmId, bp10);
            if (party is null) { noChat++; continue; }   // trading party master me nahi → chat nahi ho sakti

            var btid = await UpsertThread(firmId, party.Value.id, party.Value.name, bp10);
            if (btid == supplierThreadId) continue;

            await InsertBotMsg(btid, caption, finalUrl, "stock.jpg", "image");
            await TouchNotify(btid, firmId);
            await using (var cmd = await Cmd(
                "INSERT INTO wa.forwards (incoming_id, to_phone, buyer_id, track_code) VALUES (@i, @p, @b, @tc)"))
            {
                cmd.Parameters.Add(new NpgsqlParameter("i", incId));
                cmd.Parameters.Add(new NpgsqlParameter("p", bp10));
                cmd.Parameters.Add(new NpgsqlParameter("b", b.id));
                cmd.Parameters.Add(new NpgsqlParameter("tc", code));
                await cmd.ExecuteNonQueryAsync();
            }
            sent++;
        }
        return (code, sent, noChat);
    }

    // ---------------- order flow (buyer ORDER → qty → supplier accept) ----------------

    private async Task StartBuyerOrder(Guid threadId, Guid firmId, string partyName, string phone10, string trackCode)
    {
        var buyer = await FindBuyerByPhone(firmId, phone10);
        if (buyer is null)
        {
            await BotReply(threadId, firmId,
                "Order ke liye aapka BUYER register hona zaroori hai — firm se baat karke apna number Buyer Directory me judwayein.");
            return;
        }

        string? supPhone = null, rateUnit = null, catName = null, imagePath = null;
        Guid? supId = null; decimal rate = 0; Guid incId = Guid.Empty;
        await using (var cmd = await Cmd(@"
            SELECT id, from_phone, supplier_id, rate, rate_unit, category_name, image_path
              FROM wa.incoming WHERE track_code = @tc AND firm_id = @f
             ORDER BY created_at DESC LIMIT 1"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("tc", trackCode));
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
            await using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                incId = r.GetGuid(0);
                supPhone = r.GetString(1);
                supId = r.IsDBNull(2) ? null : r.GetGuid(2);
                rate = r.IsDBNull(3) ? 0 : r.GetDecimal(3);
                rateUnit = r.IsDBNull(4) ? null : r.GetString(4);
                catName = r.IsDBNull(5) ? null : r.GetString(5);
                imagePath = r.IsDBNull(6) ? null : r.GetString(6);
            }
        }
        if (incId == Guid.Empty)
        {
            await BotReply(threadId, firmId, $"❌ Code \"{trackCode}\" nahi mila. Photo ke neeche likha code waise hi bhejein.");
            return;
        }

        await SetState(threadId, "ORDER_CONFIRM", new Dictionary<string, object?>
        {
            ["incoming_id"] = incId, ["track_code"] = trackCode,
            ["supplier_phone"] = supPhone, ["supplier_id"] = supId,
            ["rate"] = rate, ["rate_unit"] = rateUnit ?? "mtr",
            ["category_name"] = catName, ["image_path"] = imagePath,
            ["buyer_name"] = partyName, ["buyer_id"] = buyer.Value.id, ["buyer_phone"] = phone10
        });
        await BotReply(threadId, firmId,
            $"📦 {catName ?? "Fabric"} · ₹{rate:0.##}/{rateUnit ?? "mtr"}\nCode: {trackCode}\n\nOrder confirm karna hai? (reply: yes / no)");
    }

    private static readonly string[] YesWords = { "yes", "haan", "ha", "ok", "okay", "confirm", "accept", "y" };
    private static readonly string[] NoWords = { "cancel", "reset", "no", "nahi", "na" };

    private async Task HandleOrderReply(Guid threadId, Guid firmId, string text, string state, Dictionary<string, JsonElement> ctx)
    {
        var low = text.ToLowerInvariant();

        if (NoWords.Contains(low) && state != "ORDER_QTY")
        {
            await ClearState(threadId);
            if (state == "ORDER_ACCEPT" && CtxGuid(ctx, "order_id") is var oid && oid != Guid.Empty)
            {
                await using (var cmd = await Cmd("UPDATE wa.orders SET status = 'rejected', updated_at = now() WHERE id = @o"))
                { cmd.Parameters.Add(new NpgsqlParameter("o", oid)); await cmd.ExecuteNonQueryAsync(); }
                var bt = CtxGuid(ctx, "buyer_thread_id");
                if (bt != Guid.Empty)
                    await BotReply(bt, firmId, $"😔 Maaf kijiye, supplier ne aapka order ({CtxStr(ctx, "order_code")}) abhi mana kar diya.");
                await BotReply(threadId, firmId, "Theek hai, order reject kar diya. Buyer ko bata diya.");
                return;
            }
            await BotReply(threadId, firmId, "Theek hai, cancel kar diya.");
            return;
        }

        if (state == "ORDER_CONFIRM")
        {
            if (YesWords.Contains(low))
            {
                await SetState(threadId, "ORDER_QTY", ToObjDict(ctx));
                await BotReply(threadId, firmId, "Kitni quantity chahiye? (sirf number bhejein, jaise 500)");
            }
            else await BotReply(threadId, firmId, "Reply karein: yes (order karna hai) ya no (cancel).");
            return;
        }

        if (state == "ORDER_QTY")
        {
            var qty = ParsePlainNumber(text);
            if (qty <= 0) { await BotReply(threadId, firmId, "Sirf number bhejein, jaise 500"); return; }

            var rate = CtxDec(ctx, "rate");
            var unit = CtxStr(ctx, "rate_unit") ?? "mtr";
            var catName = CtxStr(ctx, "category_name");
            var amount = rate * qty;
            var supId = CtxGuid(ctx, "supplier_id");
            var supPhone = CtxStr(ctx, "supplier_phone");

            string? supplierName = null;
            if (supId != Guid.Empty)
                await using (var cmd = await Cmd(@"
                    SELECT c.display_name FROM suppliers.supplier_profiles sp
                    JOIN core.contacts c ON c.id = sp.contact_id WHERE sp.id = @s"))
                {
                    cmd.Parameters.Add(new NpgsqlParameter("s", supId));
                    supplierName = (await cmd.ExecuteScalarAsync()) as string;
                }

            Guid orderId; string orderCode;
            await using (var cmd = await Cmd(@"
                INSERT INTO wa.orders
                  (firm_id, order_code, incoming_id, track_code, buyer_phone, buyer_id, buyer_name,
                   supplier_phone, supplier_id, supplier_name, category_name,
                   rate, rate_unit, quantity, amount, image_path, status, source)
                VALUES (@f, 'ORD-' || lpad(nextval('wa.order_code_seq')::text, 6, '0'),
                        @inc, @tc, @bph, @bid, @bn, @sph, @sid, @sn, @cn,
                        @r, @u, @q, @a, @img, 'pending_supplier', 'pchat')
                RETURNING id, order_code"))
            {
                cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
                cmd.Parameters.Add(new NpgsqlParameter("inc", NullableGuid(CtxGuid(ctx, "incoming_id"))));
                cmd.Parameters.Add(new NpgsqlParameter("tc", (object?)CtxStr(ctx, "track_code") ?? DBNull.Value));
                cmd.Parameters.Add(new NpgsqlParameter("bph", (object?)CtxStr(ctx, "buyer_phone") ?? DBNull.Value));
                cmd.Parameters.Add(new NpgsqlParameter("bid", NullableGuid(CtxGuid(ctx, "buyer_id"))));
                cmd.Parameters.Add(new NpgsqlParameter("bn", (object?)CtxStr(ctx, "buyer_name") ?? DBNull.Value));
                cmd.Parameters.Add(new NpgsqlParameter("sph", (object?)supPhone ?? DBNull.Value));
                cmd.Parameters.Add(new NpgsqlParameter("sid", NullableGuid(supId)));
                cmd.Parameters.Add(new NpgsqlParameter("sn", (object?)supplierName ?? DBNull.Value));
                cmd.Parameters.Add(new NpgsqlParameter("cn", (object?)catName ?? DBNull.Value));
                cmd.Parameters.Add(new NpgsqlParameter("r", rate));
                cmd.Parameters.Add(new NpgsqlParameter("u", unit));
                cmd.Parameters.Add(new NpgsqlParameter("q", qty));
                cmd.Parameters.Add(new NpgsqlParameter("a", amount));
                cmd.Parameters.Add(new NpgsqlParameter("img", (object?)CtxStr(ctx, "image_path") ?? DBNull.Value));
                await using var r2 = await cmd.ExecuteReaderAsync();
                await r2.ReadAsync();
                orderId = r2.GetGuid(0); orderCode = r2.GetString(1);
            }

            await ClearState(threadId);

            // Supplier ke Party Chat me order bhejo + accept ka state
            var notified = false;
            if (!string.IsNullOrEmpty(supPhone))
            {
                var supParty = await FindPartyByPhone(firmId, Last10(supPhone));
                if (supParty is not null)
                {
                    var supThread = await UpsertThread(firmId, supParty.Value.id, supParty.Value.name, Last10(supPhone));
                    await SetState(supThread, "ORDER_ACCEPT", new Dictionary<string, object?>
                    {
                        ["order_id"] = orderId, ["order_code"] = orderCode,
                        ["buyer_thread_id"] = threadId, ["buyer_name"] = CtxStr(ctx, "buyer_name"),
                        ["quantity"] = qty, ["rate"] = rate, ["rate_unit"] = unit,
                        ["category_name"] = catName, ["amount"] = amount
                    });
                    await InsertBotMsg(supThread,
                        $"🛒 *Naya Order!* ({orderCode})\n{catName ?? "Fabric"} · ₹{rate:0.##}/{unit}\n" +
                        $"Quantity: {qty:0.##} {unit}\nTotal: ₹{amount:0.##}\n\nIs order ko accept karte ho? (reply: yes / no)",
                        null, null, null);
                    await TouchNotify(supThread, firmId);
                    notified = true;
                }
            }

            await BotReply(threadId, firmId,
                $"✅ Aapka order ({orderCode}) bhej diya.\n{catName ?? "Fabric"} — {qty:0.##} {unit} @ ₹{rate:0.##} = ₹{amount:0.##}\n\n" +
                (notified ? "Supplier ke confirmation ka wait karein. ⏳"
                          : "Firm aapse aage ki baat ke liye sampark karegi. ⏳"));
            return;
        }

        if (state == "ORDER_ACCEPT")
        {
            if (YesWords.Contains(low))
            {
                var oid = CtxGuid(ctx, "order_id");
                if (oid != Guid.Empty)
                    await using (var cmd = await Cmd("UPDATE wa.orders SET status = 'accepted', updated_at = now() WHERE id = @o"))
                    { cmd.Parameters.Add(new NpgsqlParameter("o", oid)); await cmd.ExecuteNonQueryAsync(); }
                await ClearState(threadId);
                var bt = CtxGuid(ctx, "buyer_thread_id");
                if (bt != Guid.Empty)
                    await BotReply(bt, firmId,
                        $"🎉 Mubarak! Supplier ne aapka order *{CtxStr(ctx, "order_code")}* ACCEPT kar liya.\n" +
                        $"{CtxStr(ctx, "category_name") ?? "Fabric"} — {CtxDec(ctx, "quantity"):0.##} {CtxStr(ctx, "rate_unit") ?? "mtr"} " +
                        $"@ ₹{CtxDec(ctx, "rate"):0.##} = ₹{CtxDec(ctx, "amount"):0.##}\n\nFirm aapse aage ki baat ke liye sampark karegi.");
                await BotReply(threadId, firmId, $"✅ Order {CtxStr(ctx, "order_code")} accept ho gaya. Buyer ko bata diya.");
            }
            else await BotReply(threadId, firmId, "Reply karein: yes (order accept) ya no (reject).");
        }
    }

    // ---------------- buyer search ----------------

    private async Task BuyerSearch(Guid threadId, Guid firmId, string query)
    {
        decimal? min = null, max = null;
        var m = RangeRx.Match(query.Replace(",", ""));
        if (m.Success)
        {
            var parts = m.Value.Split('-');
            min = decimal.Parse(parts[0].Trim()); max = decimal.Parse(parts[1].Trim());
        }

        var results = new List<(string? cat, string? caption, decimal rate, string? unit, string? code)>();
        var sql = @"
            SELECT category_name, caption, rate, rate_unit, track_code
              FROM wa.incoming
             WHERE firm_id = @f AND status = 'processed' AND created_at > now() - interval '30 days'";
        sql += min.HasValue ? " AND rate BETWEEN @a AND @b"
                            : " AND (caption ILIKE @q OR category_name ILIKE @q)";
        sql += " ORDER BY created_at DESC LIMIT 10";
        await using (var cmd = await Cmd(sql))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
            if (min.HasValue)
            {
                cmd.Parameters.Add(new NpgsqlParameter("a", min.Value));
                cmd.Parameters.Add(new NpgsqlParameter("b", max!.Value));
            }
            else cmd.Parameters.Add(new NpgsqlParameter("q", "%" + query.Trim() + "%"));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                results.Add((r.IsDBNull(0) ? null : r.GetString(0), r.IsDBNull(1) ? null : r.GetString(1),
                             r.IsDBNull(2) ? 0 : r.GetDecimal(2), r.IsDBNull(3) ? null : r.GetString(3),
                             r.IsDBNull(4) ? null : r.GetString(4)));
        }

        if (results.Count == 0)
        { await BotReply(threadId, firmId, $"\"{query}\" ke liye abhi koi stock nahi mila. Baad me try karein."); return; }

        var sb = new StringBuilder($"🔍 {results.Count} options \"{query}\":\n\n");
        for (int i = 0; i < results.Count; i++)
        {
            var x = results[i];
            sb.Append($"{i + 1}. {x.cat ?? x.caption ?? "Fabric"} — ₹{x.rate:0.##}/{x.unit ?? "mtr"} (ORDER {x.code})\n");
        }
        sb.Append("\nKisi item ka \"ORDER <code>\" bhej kar order karein.");
        await BotReply(threadId, firmId, sb.ToString());
    }

    // ---------------- lookups (match.js port) ----------------

    private async Task<bool> FlagOn(Guid firmId)
    {
        await using var cmd = await Cmd(@"
            SELECT 1 FROM platform.feature_flags ff
            WHERE ff.key = 'bazaar_chat_bot' AND (ff.enabled_all
               OR EXISTS (SELECT 1 FROM platform.feature_flag_firms x
                           WHERE x.flag_key = 'bazaar_chat_bot' AND x.firm_id = @f))");
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        return await cmd.ExecuteScalarAsync() != null;
    }

    private async Task<(Guid id, string name)?> FindSupplierByPhone(Guid firmId, string phone10)
    {
        await using var cmd = await Cmd(@"
            SELECT sp.id, c.display_name
              FROM suppliers.supplier_profiles sp
              JOIN core.contacts c ON c.id = sp.contact_id
             WHERE sp.firm_id = @f AND sp.is_active = TRUE
               AND (right(regexp_replace(coalesce(c.wa_supplier,''), '\D', '', 'g'), 10) = @p
                    OR right(regexp_replace(coalesce(c.phone_primary,''), '\D', '', 'g'), 10) = @p)
             LIMIT 1");
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        cmd.Parameters.Add(new NpgsqlParameter("p", phone10));
        await using var r = await cmd.ExecuteReaderAsync();
        if (await r.ReadAsync()) return (r.GetGuid(0), r.GetString(1));
        return null;
    }

    private async Task<(Guid id, string name)?> FindBuyerByPhone(Guid firmId, string phone10)
    {
        await using var cmd = await Cmd(@"
            SELECT bp.id, c.display_name
              FROM suppliers.buyer_profiles bp
              JOIN core.contacts c ON c.id = bp.contact_id
             WHERE bp.firm_id = @f AND bp.is_active = TRUE
               AND (right(regexp_replace(coalesce(c.wa_buyer,''), '\D', '', 'g'), 10) = @p
                    OR right(regexp_replace(coalesce(c.phone_primary,''), '\D', '', 'g'), 10) = @p)
             LIMIT 1");
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        cmd.Parameters.Add(new NpgsqlParameter("p", phone10));
        await using var r = await cmd.ExecuteReaderAsync();
        if (await r.ReadAsync()) return (r.GetGuid(0), r.GetString(1));
        return null;
    }

    // Rate budget me + category interest — budget NULL = koi limit nahi; categories [] = sab me interest
    private async Task<List<(Guid id, string phone)>> FindBuyersForRate(Guid firmId, decimal rate, Guid? catId)
    {
        var list = new List<(Guid, string)>();
        await using var cmd = await Cmd(@"
            SELECT bp.id, COALESCE(bp.wa_phone, c.phone_primary) AS phone
              FROM suppliers.buyer_profiles bp
              JOIN core.contacts c ON c.id = bp.contact_id
             WHERE bp.firm_id = @f AND bp.is_active = TRUE
               AND COALESCE(bp.wa_phone, c.phone_primary) IS NOT NULL
               AND (bp.budget_min IS NULL OR bp.budget_min <= @r)
               AND (bp.budget_max IS NULL OR bp.budget_max >= @r)
               AND (@c::text IS NULL OR bp.categories IS NULL
                    OR jsonb_array_length(bp.categories) = 0
                    OR bp.categories @> to_jsonb(@c::text))");
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        cmd.Parameters.Add(new NpgsqlParameter("r", rate));
        cmd.Parameters.Add(new NpgsqlParameter("c", (object?)catId?.ToString() ?? DBNull.Value));
        await using var r2 = await cmd.ExecuteReaderAsync();
        while (await r2.ReadAsync())
            list.Add((r2.GetGuid(0), r2.GetString(1)));
        return list;
    }

    // Phone → trading party (Party Chat isi se bandhta hai) — exact pehle, fir sabse nayi
    private async Task<(Guid id, string name)?> FindPartyByPhone(Guid firmId, string phone10)
    {
        await using var cmd = await Cmd(@"
            SELECT p.id, c.display_name
              FROM trading.party_profiles p JOIN core.contacts c ON c.id = p.contact_id
             WHERE p.firm_id = @f AND p.is_active
               AND regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g') LIKE '%' || @p
             ORDER BY (regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g') = @p) DESC,
                      p.created_at DESC
             LIMIT 1");
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        cmd.Parameters.Add(new NpgsqlParameter("p", phone10));
        await using var r = await cmd.ExecuteReaderAsync();
        if (await r.ReadAsync()) return (r.GetGuid(0), r.GetString(1));
        return null;
    }

    private async Task<Guid> UpsertThread(Guid firmId, Guid partyId, string name, string phone10)
    {
        await using var cmd = await Cmd(@"
            INSERT INTO platform.party_chat_threads (firm_id, party_id, party_name, phone)
            VALUES (@f, @p, @n, @ph)
            ON CONFLICT (firm_id, party_id) DO UPDATE SET party_name = @n, phone = @ph
            RETURNING id");
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        cmd.Parameters.Add(new NpgsqlParameter("p", partyId));
        cmd.Parameters.Add(new NpgsqlParameter("n", name));
        cmd.Parameters.Add(new NpgsqlParameter("ph", phone10));
        return (Guid)(await cmd.ExecuteScalarAsync())!;
    }

    // ---------------- rate/category extraction (extractRate.js port) ----------------

    private static decimal ParsePlainNumber(string? text)
    {
        if (string.IsNullOrEmpty(text)) return 0;
        var m = Regex.Match(text.Replace(",", ""), @"(\d+(?:\.\d+)?)");
        return m.Success && decimal.TryParse(m.Groups[1].Value, out var d) ? d : 0;
    }

    private async Task<(decimal rate, string unit, Guid? catId, string? catName)> ExtractRate(Guid firmId, string? caption)
    {
        decimal rate = 0;
        if (!string.IsNullOrEmpty(caption))
        {
            var m = LabeledRateRx.Match(caption.Replace(",", ""));
            if (m.Success) decimal.TryParse(m.Groups[1].Value, out rate);
        }
        var unit = "mtr";
        if (!string.IsNullOrEmpty(caption))
        {
            if (Regex.IsMatch(caption, "pc|piece|pcs", RegexOptions.IgnoreCase)) unit = "pcs";
            else if (Regex.IsMatch(caption, "kg|kilo", RegexOptions.IgnoreCase)) unit = "kg";
        }

        Guid? catId = null; string? catName = null;
        if (!string.IsNullOrEmpty(caption))
        {
            var low = caption.ToLowerInvariant();
            await using var cmd = await Cmd(
                "SELECT id, name FROM suppliers.categories WHERE firm_id = @f OR firm_id IS NULL ORDER BY name");
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var nm = r.IsDBNull(1) ? null : r.GetString(1);
                if (!string.IsNullOrEmpty(nm) && low.Contains(nm.ToLowerInvariant()))
                { catId = r.GetGuid(0); catName = nm; break; }
            }
        }
        return (rate, unit, catId, catName);
    }

    private static string? FindTrackCode(string? text)
    {
        if (string.IsNullOrEmpty(text)) return null;
        var m = TrackCodeRx.Match(text);
        return m.Success ? m.Value.TrimEnd('.', ',', ';') : null;
    }

    // ---------------- bot state (wa.conversations ki jagah, per-thread) ----------------

    private async Task<(string state, Dictionary<string, JsonElement> ctx)> GetState(Guid threadId)
    {
        await using var cmd = await Cmd(
            "SELECT state, context::text FROM platform.party_chat_bot_state WHERE thread_id = @t");
        cmd.Parameters.Add(new NpgsqlParameter("t", threadId));
        await using var r = await cmd.ExecuteReaderAsync();
        if (await r.ReadAsync())
        {
            var st = r.GetString(0);
            var ctx = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(r.GetString(1))
                      ?? new Dictionary<string, JsonElement>();
            return (st, ctx);
        }
        return ("IDLE", new Dictionary<string, JsonElement>());
    }

    private async Task SetState(Guid threadId, string state, Dictionary<string, object?> ctx)
    {
        await using var cmd = await Cmd(@"
            INSERT INTO platform.party_chat_bot_state (thread_id, state, context, updated_at)
            VALUES (@t, @s, @c, now())
            ON CONFLICT (thread_id) DO UPDATE SET state = @s, context = @c, updated_at = now()");
        cmd.Parameters.Add(new NpgsqlParameter("t", threadId));
        cmd.Parameters.Add(new NpgsqlParameter("s", state));
        cmd.Parameters.Add(new NpgsqlParameter("c", NpgsqlDbType.Jsonb) { Value = JsonSerializer.Serialize(ctx) });
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task ClearState(Guid threadId)
    {
        await using var cmd = await Cmd("DELETE FROM platform.party_chat_bot_state WHERE thread_id = @t");
        cmd.Parameters.Add(new NpgsqlParameter("t", threadId));
        await cmd.ExecuteNonQueryAsync();
    }

    // ---------------- message bhejna ----------------

    private async Task BotReply(Guid threadId, Guid firmId, string text)
    {
        await InsertBotMsg(threadId, text, null, null, null);
        await TouchNotify(threadId, firmId);
    }

    private async Task InsertBotMsg(Guid threadId, string body, string? url, string? name, string? type)
    {
        await using var cmd = await Cmd(@"
            INSERT INTO platform.party_chat_messages
              (thread_id, sender, sender_name, body, attachment_url, attachment_name, attachment_type)
            VALUES (@t, 'firm', @sn, @b, @u, @an, @at)");
        cmd.Parameters.Add(new NpgsqlParameter("t", threadId));
        cmd.Parameters.Add(new NpgsqlParameter("sn", BotName));
        cmd.Parameters.Add(new NpgsqlParameter("b", body));
        cmd.Parameters.Add(new NpgsqlParameter("u", (object?)url ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("an", (object?)name ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("at", (object?)type ?? DBNull.Value));
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task TouchNotify(Guid threadId, Guid firmId)
    {
        await using (var cmd = await Cmd("UPDATE platform.party_chat_threads SET last_msg_at = now() WHERE id = @t"))
        { cmd.Parameters.Add(new NpgsqlParameter("t", threadId)); await cmd.ExecuteNonQueryAsync(); }
        await PartyChatEvents.Notify(_hub, threadId, firmId);
    }

    // ---------------- chhote helpers ----------------

    private async Task<NpgsqlCommand> Cmd(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    private static string Last10(string? s)
    {
        var d = new string((s ?? "").Where(char.IsDigit).ToArray());
        return d.Length > 10 ? d[^10..] : d;
    }

    private static object? NullIfEmpty(string? s) => string.IsNullOrWhiteSpace(s) ? null : s;
    private static object NullableGuid(Guid g) => g == Guid.Empty ? DBNull.Value : g;

    private static string? CtxStr(Dictionary<string, JsonElement> ctx, string key)
        => ctx.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static Guid CtxGuid(Dictionary<string, JsonElement> ctx, string key)
        => ctx.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String
           && Guid.TryParse(v.GetString(), out var g) ? g : Guid.Empty;

    private static decimal CtxDec(Dictionary<string, JsonElement> ctx, string key)
        => ctx.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0;

    private static Dictionary<string, object?> ToObjDict(Dictionary<string, JsonElement> ctx)
        => ctx.ToDictionary(kv => kv.Key, kv => (object?)kv.Value);
}
