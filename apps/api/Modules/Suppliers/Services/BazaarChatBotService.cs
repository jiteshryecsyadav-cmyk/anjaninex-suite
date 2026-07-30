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
    /// replyToId = jis message par quote-reply hua (photo par reply → wahi photo ki baat).
    Task HandlePartyMessageAsync(Guid threadId, string? body, string? attachmentFileName, string? attachmentType, Guid? replyToId = null);
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

    public async Task HandlePartyMessageAsync(Guid threadId, string? body, string? attachmentFileName, string? attachmentType, Guid? replyToId = null)
    {
        try { await Handle(threadId, body, attachmentFileName, attachmentType, replyToId); }
        catch (Exception ex) { _log.LogWarning(ex, "Bazaar bot fail-soft (thread {Thread})", threadId); }
    }

    // ---------------- core ----------------

    private async Task Handle(Guid threadId, string? body, string? attachFile, string? attachType, Guid? replyToId = null)
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
            await HandlePhoto(threadId, firmId, partyName, phone10, text, attachFile!, state);
            return;
        }
        if (text.Length == 0) return;

        // 📌 PHOTO PAR REPLY (quote) — reply hi photo ki PEHCHAN hai:
        //   • BUYER broadcast-photo par reply kare ("700"/"order") → usi photo ka order/bhav
        //   • SUPPLIER APNI photo par reply kare ("1050") → usi photo ka RATE set
        if (replyToId.HasValue && FindTrackCode(text) == null)
        {
            string? quotedBody = null, quotedAttach = null;
            await using (var qc = await Cmd(
                "SELECT body, attachment_url FROM platform.party_chat_messages WHERE id = @m AND thread_id = @t"))
            {
                qc.Parameters.Add(new NpgsqlParameter("m", replyToId.Value));
                qc.Parameters.Add(new NpgsqlParameter("t", threadId));
                await using var qr = await qc.ExecuteReaderAsync();
                if (await qr.ReadAsync())
                {
                    quotedBody = qr.IsDBNull(0) ? null : qr.GetString(0);
                    quotedAttach = qr.IsDBNull(1) ? null : qr.GetString(1);
                }
            }

            // BUYER path — quoted message me ORDER code hai.
            // ⚠️ SUPPLIER wale states (order accept / rate ka mol-bhav) me haath NAHI lagana:
            // supplier apni hi photo/order ko quote karke "Yes" likhta hai — pehle isse
            // "naya buyer-order" samajh kar state UDA di jati thi aur uska Yes kho jata tha.
            var supplierSideState = state is "ORDER_ACCEPT" or "ORDER_BARGAIN_SUP" or "ORDER_BARGAIN_WAIT";
            var quotedCode = FindTrackCode(quotedBody);
            if (quotedCode != null && state != "ASK_RATE" && !supplierSideState
                && await FindBuyerByPhone(firmId, phone10) is not null   // sirf REGISTERED buyer hi order shuru kare
                && !string.Equals(quotedCode, CtxStr(ctx, "track_code"), StringComparison.OrdinalIgnoreCase))
            {
                await ClearState(threadId);
                await StartBuyerOrder(threadId, firmId, partyName, phone10, quotedCode);
                // Jo saath me likha tha ("700" / "yes") use turant aage badhao — dobara na poochna pade
                var (st2, ctx2) = await GetState(threadId);
                if (st2 == "ORDER_CONFIRM" && text.Length > 0)
                    await HandleOrderReply(threadId, firmId, text, st2, ctx2);
                return;
            }

            // SUPPLIER path — apni bheji photo par reply + number = USI photo ka rate
            if (quotedCode == null && quotedAttach != null && SmartNumber(text) > 0
                && await FindSupplierByPhone(firmId, phone10) is not null)
            {
                var fname = quotedAttach.Split('/').Last();
                Guid qInc = Guid.Empty; string qStatus = ""; decimal qRate = 0; string? qTc = null;
                await using (var ic = await Cmd(@"
                    SELECT id, status, rate, track_code FROM wa.incoming
                    WHERE pchat_thread_id = @t AND image_path LIKE @pat
                    ORDER BY created_at DESC LIMIT 1"))
                {
                    ic.Parameters.Add(new NpgsqlParameter("t", threadId));
                    ic.Parameters.Add(new NpgsqlParameter("pat", "%" + fname));
                    await using var ir = await ic.ExecuteReaderAsync();
                    if (await ir.ReadAsync())
                    {
                        qInc = ir.GetGuid(0);
                        qStatus = ir.IsDBNull(1) ? "" : ir.GetString(1);
                        qRate = ir.IsDBNull(2) ? 0 : ir.GetDecimal(2);
                        qTc = ir.IsDBNull(3) ? null : ir.GetString(3);
                    }
                }
                if (qInc != Guid.Empty && qStatus == "awaiting_rate")
                {
                    await HandleRateReply(threadId, firmId, partyName, phone10, text,
                        new Dictionary<string, JsonElement>
                        { ["incoming_id"] = JsonSerializer.SerializeToElement(qInc.ToString()) });
                    return;
                }
                if (qInc != Guid.Empty && qStatus == "processed")
                {
                    await BotReply(threadId, firmId,
                        $"Is photo ka rate ₹{qRate:0.##} pehle hi pakka ho chuka hai (Code: {qTc}).\nNaya rate chahiye to photo DOBARA bhejein caption ke saath.");
                    return;
                }
            }
        }

        if (state is "ORDER_CONFIRM" or "ORDER_QTY" or "ORDER_ACCEPT" or "ORDER_PARTIAL"
                  or "ORDER_BARGAIN_SUP" or "ORDER_BARGAIN_BUY" or "ORDER_BARGAIN_WAIT")
        { await HandleOrderReply(threadId, firmId, text, state, ctx); return; }

        if (state == "ASK_RATE")
        { await HandleRateReply(threadId, firmId, partyName, phone10, text, ctx); return; }

        // SUPPLIER: "BZ-XXXXXX 1050" — Photo-ID ke saath rate (kai photos me bhi zero confusion).
        // ID ke andar ke ank rate na ban jayein isliye ID hata kar number padhte hain.
        var idm = Regex.Match(text, @"\b(?:BZ|NAM)-([0-9A-Za-z]{6})\b", RegexOptions.IgnoreCase);
        if (idm.Success)
        {
            var numTxt = text.Replace(idm.Value, " ");
            if (SmartNumber(numTxt) > 0 && await FindSupplierByPhone(firmId, phone10) is not null)
            {
                var pref = idm.Groups[1].Value.ToLowerInvariant();
                Guid pInc = Guid.Empty; string pStatus = ""; decimal pRate2 = 0; string? pTc = null;
                await using (var pc = await Cmd(@"
                    SELECT id, status, rate, track_code FROM wa.incoming
                    WHERE pchat_thread_id = @t AND replace(id::text, '-', '') LIKE @p || '%'
                    ORDER BY created_at DESC LIMIT 1"))
                {
                    pc.Parameters.Add(new NpgsqlParameter("t", threadId));
                    pc.Parameters.Add(new NpgsqlParameter("p", pref));
                    await using var prr = await pc.ExecuteReaderAsync();
                    if (await prr.ReadAsync())
                    {
                        pInc = prr.GetGuid(0);
                        pStatus = prr.IsDBNull(1) ? "" : prr.GetString(1);
                        pRate2 = prr.IsDBNull(2) ? 0 : prr.GetDecimal(2);
                        pTc = prr.IsDBNull(3) ? null : prr.GetString(3);
                    }
                }
                if (pInc != Guid.Empty && pStatus == "awaiting_rate")
                {
                    await HandleRateReply(threadId, firmId, partyName, phone10, numTxt,
                        new Dictionary<string, JsonElement>
                        { ["incoming_id"] = JsonSerializer.SerializeToElement(pInc.ToString()) });
                    return;
                }
                if (pInc != Guid.Empty && pStatus == "processed")
                {
                    await BotReply(threadId, firmId,
                        $"Us photo ka rate ₹{pRate2:0.##} pehle hi pakka hai (Code: {pTc}).\nNaya rate chahiye to photo DOBARA bhejein caption ke saath.");
                    return;
                }
                // apni chat me aisi photo nahi mili — neeche order-code wale raste par girne do
            }
        }

        // 🔁 SUPPLIER ke PENDING ORDER — chahe uski yaaddasht (state) kho gayi ho ya kai
        // order ek saath aa gaye hon. Pehle sirf AAKHRI order ka jawab liya jata tha aur
        // baki hamesha ke liye "supplier baki" me atak jate the. Ab DB se pakadte hain:
        //   ek hi pending ho → wahi · kai hon → code poochho ("yes ORD-000011")
        var ordMatch = Regex.Match(text, @"ORD-0*(\d{1,8})", RegexOptions.IgnoreCase);
        var textNoCode = ordMatch.Success ? text.Replace(ordMatch.Value, " ").Trim() : text;
        var lowNoCode = textNoCode.ToLowerInvariant();
        if (state == "IDLE" && (IsYes(lowNoCode) || IsNo(lowNoCode) || SmartNumber(textNoCode) > 0 || ordMatch.Success))
        {
            var pend = new List<Dictionary<string, object?>>();
            await using (var pc = await Cmd(@"
                SELECT id, order_code, quantity, rate, rate_unit, amount, category_name,
                       buyer_thread_id, buyer_name, track_code
                  FROM wa.orders
                 WHERE firm_id = @f AND status = 'pending_supplier' AND supplier_thread_id = @t
                 ORDER BY created_at"))
            {
                pc.Parameters.Add(new NpgsqlParameter("f", firmId));
                pc.Parameters.Add(new NpgsqlParameter("t", threadId));
                await using var pr = await pc.ExecuteReaderAsync();
                while (await pr.ReadAsync())
                    pend.Add(new Dictionary<string, object?>
                    {
                        ["order_id"] = pr.GetGuid(0),
                        ["order_code"] = pr.IsDBNull(1) ? null : pr.GetString(1),
                        ["quantity"] = pr.IsDBNull(2) ? 0m : pr.GetDecimal(2),
                        ["rate"] = pr.IsDBNull(3) ? 0m : pr.GetDecimal(3),
                        ["rate_unit"] = pr.IsDBNull(4) ? "mtr" : pr.GetString(4),
                        ["amount"] = pr.IsDBNull(5) ? 0m : pr.GetDecimal(5),
                        ["category_name"] = pr.IsDBNull(6) ? null : pr.GetString(6),
                        ["buyer_thread_id"] = pr.IsDBNull(7) ? null : pr.GetGuid(7),
                        ["buyer_name"] = pr.IsDBNull(8) ? null : pr.GetString(8),
                        ["track_code"] = pr.IsDBNull(9) ? null : pr.GetString(9)
                    });
            }

            if (pend.Count > 0)
            {
                Dictionary<string, object?>? pick = null;
                if (ordMatch.Success)
                {
                    var want = "ORD-" + ordMatch.Groups[1].Value.PadLeft(6, '0');
                    pick = pend.FirstOrDefault(o => string.Equals(o["order_code"] as string, want, StringComparison.OrdinalIgnoreCase));
                    if (pick is null)
                    {
                        await BotReply(threadId, firmId, $"Order {want} pending nahi mila. Pending: " +
                            string.Join(", ", pend.Select(o => o["order_code"])));
                        return;
                    }
                }
                else if (pend.Count == 1) pick = pend[0];

                if (pick is null)
                {
                    var lines = pend.Select(o =>
                        $"• {o["order_code"]} — {(decimal)(o["quantity"] ?? 0m):0.##} {o["rate_unit"]} @ ₹{(decimal)(o["rate"] ?? 0m):0.##}");
                    await BotReply(threadId, firmId,
                        "Aapke paas ye order pending hain:\n" + string.Join("\n", lines) +
                        "\n\nKaunsa? Aise likhein: *yes ORD-000011* (ya no / qty ke saath bhi).");
                    return;
                }

                var rebuilt = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                    JsonSerializer.Serialize(pick))!;
                await HandleOrderReply(threadId, firmId, textNoCode, "ORDER_ACCEPT", rebuilt);
                return;
            }
        }

        var code = FindTrackCode(text);
        if (code != null)
        { await StartBuyerOrder(threadId, firmId, partyName, phone10, code); return; }

        // ANATH PHOTO ka rate — supplier ne AKELA SHUDDH NUMBER bheja (jaise "1050") aur
        // pichhle 60 min me isi chat ki koi bina-rate photo padi ho, to wahi uska rate hai.
        // (Asli case: 2 photo jaldi-jaldi aayin, pehli ka rate baad me akela aaya — kho jata tha.)
        if (Regex.IsMatch(text, @"^(?:rate\s*)?\d+(?:\.\d+)?$", RegexOptions.IgnoreCase)
            && await FindSupplierByPhone(firmId, phone10) is not null)
        {
            Guid orphanId = Guid.Empty;
            await using (var oc = await Cmd(@"
                SELECT id FROM wa.incoming
                WHERE pchat_thread_id = @t AND status = 'awaiting_rate'
                  AND created_at > now() - interval '60 minutes'
                ORDER BY created_at DESC LIMIT 1"))
            {
                oc.Parameters.Add(new NpgsqlParameter("t", threadId));
                if (await oc.ExecuteScalarAsync() is Guid og) orphanId = og;
            }
            if (orphanId != Guid.Empty)
            {
                await HandleRateReply(threadId, firmId, partyName, phone10, text,
                    new Dictionary<string, JsonElement>
                    {
                        ["incoming_id"] = JsonSerializer.SerializeToElement(orphanId.ToString())
                    });
                return;
            }
        }

        // Buyer ne sirf "order" likha (bina code) — jo AAKHRI photo USI ko bheji thi, wahi
        if (Regex.IsMatch(text, @"^(order|book)\b", RegexOptions.IgnoreCase)
            && await FindBuyerByPhone(firmId, phone10) is not null)
        {
            string? lastCode = null;
            await using (var fc = await Cmd(@"
                SELECT f.track_code FROM wa.forwards f
                JOIN wa.incoming i ON i.id = f.incoming_id
                WHERE i.firm_id = @f AND f.to_phone = @p AND f.sent_at > now() - interval '48 hours'
                ORDER BY f.sent_at DESC LIMIT 1"))
            {
                fc.Parameters.Add(new NpgsqlParameter("f", firmId));
                fc.Parameters.Add(new NpgsqlParameter("p", phone10));
                lastCode = (await fc.ExecuteScalarAsync()) as string;
            }
            if (lastCode != null)
            { await StartBuyerOrder(threadId, firmId, partyName, phone10, lastCode); return; }
            await BotReply(threadId, firmId,
                "Kaunsi photo ka order? Photo ke neeche 🛒 ORDER button dabaein, ya photo par reply karke 'order' likhein.");
            return;
        }

        // Buyer search — "Cotton 100-150" jaisa saaf pattern ho tabhi
        if ((RangeRx.IsMatch(text) || FabricRx.IsMatch(text))
            && await FindBuyerByPhone(firmId, phone10) is not null)
            await BuyerSearch(threadId, firmId, text);
        // warna CHUP — ye firm↔party ki aam chat hai
    }

    // ---------------- photo ----------------

    private async Task HandlePhoto(Guid threadId, Guid firmId, string partyName, string phone10, string caption, string attachFile, string prevState = "IDLE")
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
               rate, rate_unit, category_id, category_name, status, model_used, source, pchat_thread_id)
            VALUES (@f, @ph, @sid, @h, @p, @c, @r, @u, @cid, @cn, @st, 'regex', 'pchat', @tid)
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
            cmd.Parameters.Add(new NpgsqlParameter("tid", threadId));   // supplier ki APNI chat — order/bargain isi par jayega
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

        // HAR PHOTO KI APNI ID — "BZ-" + id ke pehle 6 akshar (rate lagte hi yahi code
        // BZ-XXXXXX-R749 ban jata hai). Kai photos ek saath hon to bhi har ek ka rate
        // ID se set ho sakta hai: "BZ-XXXXXX 850".
        var newId = "BZ-" + incId.ToString("N")[..6].ToUpperInvariant();
        var pendingIds = new List<string>();
        await using (var pq = await Cmd(@"
            SELECT id FROM wa.incoming
            WHERE pchat_thread_id = @t AND status = 'awaiting_rate'
              AND created_at > now() - interval '24 hours'
            ORDER BY created_at DESC LIMIT 5"))
        {
            pq.Parameters.Add(new NpgsqlParameter("t", threadId));
            await using var pr = await pq.ExecuteReaderAsync();
            while (await pr.ReadAsync())
                pendingIds.Add("BZ-" + pr.GetGuid(0).ToString("N")[..6].ToUpperInvariant());
        }

        await BotReply(threadId, firmId, pendingIds.Count > 1
            ? $"📷 Nayi photo mil gayi! (Photo ID: {newId})\n" +
              $"Rate ke intezar me: {string.Join(", ", pendingIds)}\n\n" +
              $"Har photo ka rate aise bhejein:\n{newId} 850\n" +
              "(ya akela number = sabse NAYI photo ka rate)\n💡 Caption me \"Rate 699\" likho to poochhna hi nahi padega."
            : $"📷 Photo mil gayi! (Photo ID: {newId})\nIs fabric ka *rate* kya hai?\n(sirf number bhejein, jaise 699)");
    }

    private async Task HandleRateReply(Guid threadId, Guid firmId, string partyName, string phone10, string text, Dictionary<string, JsonElement> ctx)
    {
        var rate = SmartNumber(text);
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
        Guid? supId = null; decimal rate = 0; Guid incId = Guid.Empty; Guid? supThreadId = null;
        await using (var cmd = await Cmd(@"
            SELECT id, from_phone, supplier_id, rate, rate_unit, category_name, image_path, pchat_thread_id
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
                supThreadId = r.IsDBNull(7) ? null : r.GetGuid(7);
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
            ["supplier_thread_id"] = supThreadId,   // photo wali chat — phone-duplicate se bachne ko
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

        // Buyer ne beech-baat me DOOSRI photo ka ORDER code bhej diya? → purani baat
        // chhod kar nayi photo par aao. (Warna code ke numbers rate/qty samjhe jate the!)
        var switchCode = FindTrackCode(text);
        if (switchCode != null && CtxStr(ctx, "buyer_phone") != null   // sirf BUYER-side states me
            && !string.Equals(switchCode, CtxStr(ctx, "track_code"), StringComparison.OrdinalIgnoreCase))
        {
            await ClearState(threadId);
            await BotReply(threadId, firmId, "Theek hai — pichhli photo ki baat wahin chhodi, ab nayi photo par:");
            var pName = "";
            await using (var cmd = await Cmd("SELECT party_name FROM platform.party_chat_threads WHERE id = @t"))
            { cmd.Parameters.Add(new NpgsqlParameter("t", threadId)); pName = (await cmd.ExecuteScalarAsync()) as string ?? ""; }
            await StartBuyerOrder(threadId, firmId, pName, Last10(CtxStr(ctx, "buyer_phone") ?? ""), switchCode);
            return;
        }

        // BUYER ke paas supplier ka COUNTER-OFFER pada hai ("500 nahi, 300 bhej sakta hoon")
        // — sabse pehle, warna neeche wala generic 'no' isse adhura chhod deta
        if (state == "ORDER_PARTIAL")
        {
            var oid = CtxGuid(ctx, "order_id");
            var supThread = CtxGuid(ctx, "supplier_thread_id");
            var offerQty = CtxDec(ctx, "offer_qty");
            var pRate = CtxDec(ctx, "rate");
            var pUnit = CtxStr(ctx, "rate_unit") ?? "mtr";
            var pAmt = CtxDec(ctx, "amount");
            var pCode = CtxStr(ctx, "order_code");

            if (IsYes(low))
            {
                if (oid != Guid.Empty)
                    await using (var cmd = await Cmd(@"
                        UPDATE wa.orders SET quantity = @q, amount = @a, status = 'pending_agency', updated_at = now()
                        WHERE id = @o"))
                    {
                        cmd.Parameters.Add(new NpgsqlParameter("q", offerQty));
                        cmd.Parameters.Add(new NpgsqlParameter("a", pAmt));
                        cmd.Parameters.Add(new NpgsqlParameter("o", oid));
                        await cmd.ExecuteNonQueryAsync();
                    }
                await ClearState(threadId);
                await BotReply(threadId, firmId,
                    $"✅ Order {pCode} ab {offerQty:0.##} {pUnit} ka ho gaya.\n" +
                    $"₹{pRate:0.##}/{pUnit} × {offerQty:0.##} = ₹{pAmt:0.##}\n\n🕐 Ab AGENCY ki aakhri manzoori baki hai — muhar lagte hi pakka.");
                if (supThread != Guid.Empty)
                    await BotReply(supThread, firmId,
                        $"🎉 Buyer maan gaya! Order {pCode} ab {offerQty:0.##} {pUnit} ka.\n🕐 AGENCY ki manzoori ka intezar — approve hote hi DISPATCH ka message milega.");
                return;
            }
            if (IsNo(low))
            {
                if (oid != Guid.Empty)
                    await using (var cmd = await Cmd("UPDATE wa.orders SET status = 'rejected', updated_at = now() WHERE id = @o"))
                    { cmd.Parameters.Add(new NpgsqlParameter("o", oid)); await cmd.ExecuteNonQueryAsync(); }
                await ClearState(threadId);
                await BotReply(threadId, firmId, $"Theek hai, order {pCode} cancel kar diya. Supplier ko bata diya.");
                if (supThread != Guid.Empty)
                    await BotReply(supThread, firmId,
                        $"😔 Buyer ko {offerQty:0.##} {pUnit} manzoor nahi — order {pCode} cancel ho gaya.");
                return;
            }
            // BUYER ne apna QTY likha — wapas supplier ke paas (qty ka ping-pong, rate jaisa)
            var buyerQty = SmartNumber(text);
            if (buyerQty > 0 && buyerQty != offerQty)
            {
                var supTh = CtxGuid(ctx, "supplier_thread_id");
                if (supTh != Guid.Empty)
                {
                    var newAmt2 = Math.Round(pRate * buyerQty, 2, MidpointRounding.AwayFromZero);
                    var backCtx = ToObjDict(ctx);
                    backCtx["quantity"] = buyerQty;
                    backCtx["amount"] = newAmt2;
                    backCtx.Remove("offer_qty");
                    backCtx["buyer_thread_id"] = threadId;
                    await SetState(supTh, "ORDER_ACCEPT", backCtx);
                    await ClearState(threadId);
                    await BotReply(threadId, firmId,
                        $"🕐 Aapka {buyerQty:0.##} {pUnit} ka offer supplier ko bhej diya — jawab ka intezar karein.");
                    await BotReply(supTh, firmId,
                        $"🔁 Buyer ne qty badli: *{buyerQty:0.##} {pUnit}* (₹{pRate:0.##} × {buyerQty:0.##} = ₹{newAmt2:0.##}) — order {pCode}.\n" +
                        "Accept karte ho? (reply: yes / no / ya apna qty likhein)");
                    // wa.orders me bhi nayi qty yaad rakho (aakhri haan par yahi pakki hogi)
                    if (oid != Guid.Empty)
                        await using (var uq = await Cmd("UPDATE wa.orders SET quantity = @q, amount = @a, updated_at = now() WHERE id = @o"))
                        {
                            uq.Parameters.Add(new NpgsqlParameter("q", buyerQty));
                            uq.Parameters.Add(new NpgsqlParameter("a", newAmt2));
                            uq.Parameters.Add(new NpgsqlParameter("o", oid));
                            await uq.ExecuteNonQueryAsync();
                        }
                    return;
                }
            }

            await BotReply(threadId, firmId,
                $"Supplier {offerQty:0.##} {pUnit} bhej sakta hai — reply karein: yes (manzoor) · no (cancel) · ya apna qty likhein.");
            return;
        }

        // ===== RATE BARGAIN — buyer/supplier rate par mol-bhav (yes / no / naya rate) =====
        if (state == "ORDER_BARGAIN_WAIT")
        {
            await BotReply(threadId, firmId, "🕐 Doosri taraf ke jawab ka intezar hai — jawab aate hi yahin bata denge.");
            return;
        }
        if (state is "ORDER_BARGAIN_SUP" or "ORDER_BARGAIN_BUY")
        {
            // SUP = supplier decide kar raha hai (buyer ka offer aaya); BUY = buyer decide kar raha hai (supplier ka counter)
            var otherThread = CtxGuid(ctx, "other_thread_id");
            var offerRate = CtxDec(ctx, "offer_rate");
            var unit2 = CtxStr(ctx, "rate_unit") ?? "mtr";
            var cat2 = CtxStr(ctx, "category_name");

            if (IsYes(low))
            {
                // Sauda pakka is rate par → buyer se quantity (aage wahi purana flow)
                var buyerThread = state == "ORDER_BARGAIN_SUP" ? otherThread : threadId;
                var supThread2 = state == "ORDER_BARGAIN_SUP" ? threadId : otherThread;
                var qtyCtx = ToObjDict(ctx);
                qtyCtx["rate"] = offerRate;
                qtyCtx.Remove("offer_rate"); qtyCtx.Remove("other_thread_id");
                await ClearState(threadId);
                if (otherThread != Guid.Empty) await ClearState(otherThread);
                await SetState(buyerThread, "ORDER_QTY", qtyCtx);
                await BotReply(buyerThread, firmId,
                    $"🤝 Rate ₹{offerRate:0.##}/{unit2} par sauda pakka!\nKitni quantity chahiye? (sirf number bhejein, jaise 500)");
                if (supThread2 != Guid.Empty && supThread2 != buyerThread)
                    await BotReply(supThread2, firmId,
                        $"🤝 Rate ₹{offerRate:0.##}/{unit2} par sauda pakka — buyer quantity bata raha hai.");
                return;
            }
            if (IsNo(low))
            {
                await ClearState(threadId);
                if (otherThread != Guid.Empty) await ClearState(otherThread);
                if (state == "ORDER_BARGAIN_SUP")
                {
                    // Supplier ne buyer ka rate thukraya → buyer ko original rate par wapas poochho
                    var origRate = CtxDec(ctx, "orig_rate");
                    var backCtx = ToObjDict(ctx);
                    backCtx["rate"] = origRate;
                    backCtx.Remove("offer_rate"); backCtx.Remove("other_thread_id"); backCtx.Remove("orig_rate");
                    await SetState(otherThread, "ORDER_CONFIRM", backCtx);
                    await BotReply(threadId, firmId, $"Theek hai — buyer ko bata diya ki ₹{origRate:0.##}/{unit2} par hi milega.");
                    if (otherThread != Guid.Empty)
                        await BotReply(otherThread, firmId,
                            $"Supplier ₹{CtxDec(ctx, "offer_rate"):0.##} par raazi nahi — ₹{origRate:0.##}/{unit2} par hi dega.\nUs rate par order karna hai? (reply: yes / no)");
                }
                else
                {
                    // Buyer ne supplier ka counter thukraya → baat khatam
                    await BotReply(threadId, firmId, "Theek hai, order cancel kar diya. Naya offer dena ho to dobara ORDER code bhejein.");
                    if (otherThread != Guid.Empty)
                        await BotReply(otherThread, firmId, $"😔 Buyer ₹{offerRate:0.##}/{unit2} par raazi nahi hua — baat aage nahi badhi.");
                }
                return;
            }
            var counter = SmartNumber(text);
            if (counter > 0)
            {
                // Naya rate saamne wale ko — ping-pong (jitni baar chaahe mol-bhav)
                var flipState = state == "ORDER_BARGAIN_SUP" ? "ORDER_BARGAIN_BUY" : "ORDER_BARGAIN_SUP";
                var nextCtx = ToObjDict(ctx);
                nextCtx["offer_rate"] = counter;
                nextCtx["other_thread_id"] = threadId;
                await SetState(otherThread, flipState, nextCtx);
                var waitCtx = ToObjDict(ctx);
                waitCtx["offer_rate"] = counter;
                await SetState(threadId, "ORDER_BARGAIN_WAIT", waitCtx);
                await BotReply(threadId, firmId, $"🕐 Aapka ₹{counter:0.##}/{unit2} ka rate saamne wale ko bhej diya — jawab ka intezar karein.");
                if (otherThread != Guid.Empty)
                    await BotReply(otherThread, firmId,
                        $"💬 {cat2 ?? "Fabric"} ({CtxStr(ctx, "track_code")}): saamne se naya rate aaya — *₹{counter:0.##}/{unit2}*.\nManzoor hai? (reply: yes / no / ya apna rate likhein, jaise 950)");
                return;
            }
            await BotReply(threadId, firmId, "Reply karein: yes (manzoor) · no (nahi) · ya apna rate likhein (jaise 950).");
            return;
        }

        if (IsNo(low) && state != "ORDER_QTY")
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
            if (IsYes(low))
            {
                await SetState(threadId, "ORDER_QTY", ToObjDict(ctx));
                await BotReply(threadId, firmId, "Kitni quantity chahiye? (sirf number bhejein, jaise 500)");
                return;
            }
            // BUYER ne NUMBER likha = rate ka mol-bhav ("₹999 nahi, 950 me do")
            var rateOffer = SmartNumber(text);
            var listedRate = CtxDec(ctx, "rate");
            if (rateOffer > 0 && listedRate > 0)
            {
                if (rateOffer >= listedRate)
                {
                    // Wahi ya zyada rate = haan hi hai
                    await SetState(threadId, "ORDER_QTY", ToObjDict(ctx));
                    await BotReply(threadId, firmId, "Kitni quantity chahiye? (sirf number bhejein, jaise 500)");
                    return;
                }
                // PEHLE photo wali chat (pakka sahi supplier) — phone se tabhi dhundo jab wo na ho
                // (ek number kai parties par ho to phone-lookup galat party pakad leta tha)
                var supThread3 = CtxGuid(ctx, "supplier_thread_id");
                if (supThread3 == Guid.Empty)
                {
                    var supPhone2 = CtxStr(ctx, "supplier_phone");
                    var supParty2 = string.IsNullOrEmpty(supPhone2) ? null : await FindPartyByPhone(firmId, Last10(supPhone2));
                    if (supParty2 is null)
                    {
                        await BotReply(threadId, firmId,
                            "Supplier abhi Party Chat me nahi hai — rate ki baat firm se karein, ya listed rate par yes bhejein.");
                        return;
                    }
                    supThread3 = await UpsertThread(firmId, supParty2.Value.id, supParty2.Value.name, Last10(supPhone2!));
                }
                var unit3 = CtxStr(ctx, "rate_unit") ?? "mtr";

                var supCtx = ToObjDict(ctx);
                supCtx["offer_rate"] = rateOffer;
                supCtx["orig_rate"] = listedRate;
                supCtx["other_thread_id"] = threadId;
                await SetState(supThread3, "ORDER_BARGAIN_SUP", supCtx);

                var waitCtx2 = ToObjDict(ctx);
                waitCtx2["offer_rate"] = rateOffer;
                waitCtx2["orig_rate"] = listedRate;
                waitCtx2["other_thread_id"] = supThread3;
                await SetState(threadId, "ORDER_BARGAIN_WAIT", waitCtx2);

                await BotReply(threadId, firmId,
                    $"🕐 Aapka ₹{rateOffer:0.##}/{unit3} ka offer supplier ko bhej diya — jawab ka intezar karein.");
                await BotReply(supThread3, firmId,
                    $"💬 {CtxStr(ctx, "category_name") ?? "Fabric"} ({CtxStr(ctx, "track_code")}): buyer *₹{rateOffer:0.##}/{unit3}* bol raha hai (listed ₹{listedRate:0.##}).\n" +
                    $"Manzoor hai? (reply: yes / no / ya apna rate likhein, jaise 975)");
                return;
            }
            await BotReply(threadId, firmId, "Reply karein: yes (order karna hai) · no (cancel) · ya apna rate likhein (jaise 950).");
            return;
        }

        if (state == "ORDER_QTY")
        {
            var qty = SmartNumber(text);
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

            // Supplier ki chat PEHLE taay karo (photo wali chat = pakki pehchan) — order me bhi
            // save hogi taaki AGENCY-approval ke messages seedha sahi chats me jayein
            var supThreadK = CtxGuid(ctx, "supplier_thread_id");
            if (supThreadK == Guid.Empty && !string.IsNullOrEmpty(supPhone))
            {
                var supPartyPre = await FindPartyByPhone(firmId, Last10(supPhone));
                if (supPartyPre is not null)
                    supThreadK = await UpsertThread(firmId, supPartyPre.Value.id, supPartyPre.Value.name, Last10(supPhone));
            }

            Guid orderId; string orderCode;
            await using (var cmd = await Cmd(@"
                INSERT INTO wa.orders
                  (firm_id, order_code, incoming_id, track_code, buyer_phone, buyer_id, buyer_name,
                   supplier_phone, supplier_id, supplier_name, category_name,
                   rate, rate_unit, quantity, amount, image_path, status, source,
                   buyer_thread_id, supplier_thread_id)
                VALUES (@f, 'ORD-' || lpad(nextval('wa.order_code_seq')::text, 6, '0'),
                        @inc, @tc, @bph, @bid, @bn, @sph, @sid, @sn, @cn,
                        @r, @u, @q, @a, @img, 'pending_supplier', 'pchat', @bt, @st)
                RETURNING id, order_code"))
            {
                cmd.Parameters.Add(new NpgsqlParameter("bt", threadId));
                cmd.Parameters.Add(new NpgsqlParameter("st", NullableGuid(supThreadK)));
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
            {
                if (supThreadK != Guid.Empty)
                {
                    var supThread = supThreadK;
                    await SetState(supThread, "ORDER_ACCEPT", new Dictionary<string, object?>
                    {
                        ["order_id"] = orderId, ["order_code"] = orderCode,
                        ["buyer_thread_id"] = threadId, ["buyer_name"] = CtxStr(ctx, "buyer_name"),
                        ["quantity"] = qty, ["rate"] = rate, ["rate_unit"] = unit,
                        ["category_name"] = catName, ["amount"] = amount
                    });
                    await InsertBotMsg(supThread,
                        $"🛒 *Naya Order!* ({orderCode})\n{catName ?? "Fabric"} · ₹{rate:0.##}/{unit}\n" +
                        $"Qty: {qty:0.##} {unit}\nTotal: ₹{amount:0.##}\n\nIs order ko accept karte ho? (reply: yes / no)",
                        null, null, null);
                    await TouchNotify(supThread, firmId);
                    notified = true;
                }
            }

            await BotReply(threadId, firmId,
                $"✅ Aapka order ({orderCode}) bhej diya.\n{catName ?? "Fabric"} — {qty:0.##} {unit} @ ₹{rate:0.##} = ₹{amount:0.##}\n\n" +
                (notified ? "Supplier ke confirmation ka wait karein. ⏳"
                          : "Firm aapse aage ki baat ke liye sampark karegi. ⏳") +
                "\n\n💡 Aur koi photo pasand ho to uske neeche wala 🛒 ORDER button dabaein — ek-ek karke sab le sakte hain.");
            return;
        }

        if (state == "ORDER_ACCEPT")
        {
            // SUPPLIER ne NUMBER likha = quantity ka counter — DONO taraf:
            //   kam  ("500 nahi, 300 bhej sakta hoon")  ya  zyada ("minimum 100 lene honge")
            // Dono me buyer se poochha jayega — wahi haan/na/apna qty bolega.
            var qtyOffer = SmartNumber(text);
            var askedQty = CtxDec(ctx, "quantity");
            if (!IsYes(low) && qtyOffer > 0 && askedQty > 0 && qtyOffer != askedQty)
            {
                var aRate = CtxDec(ctx, "rate");
                var aUnit = CtxStr(ctx, "rate_unit") ?? "mtr";
                var newAmt = Math.Round(aRate * qtyOffer, 2, MidpointRounding.AwayFromZero);
                var bThread = CtxGuid(ctx, "buyer_thread_id");
                if (bThread == Guid.Empty)
                {
                    await BotReply(threadId, firmId, "Buyer ki chat nahi mili — firm se baat karein.");
                    return;
                }
                var pCtx = ToObjDict(ctx);
                pCtx["offer_qty"] = qtyOffer;
                pCtx["amount"] = newAmt;
                pCtx["supplier_thread_id"] = threadId;
                await SetState(bThread, "ORDER_PARTIAL", pCtx);
                await ClearState(threadId);
                await BotReply(threadId, firmId,
                    $"🕐 Aapka {qtyOffer:0.##} {aUnit} ka offer buyer ko bhej diya — uske jawab ka intezar karein.");
                await BotReply(bThread, firmId,
                    (qtyOffer > askedQty
                        ? $"📦 Aapke order ({CtxStr(ctx, "order_code")}) par supplier ne kaha: KAM SE KAM *{qtyOffer:0.##} {aUnit}* lene honge (aapne {askedQty:0.##} maange the).\n"
                        : $"📦 Aapke order ({CtxStr(ctx, "order_code")}) par supplier ne kaha: {askedQty:0.##} ki jagah *{qtyOffer:0.##} {aUnit}* bhej sakta hai.\n") +
                    $"₹{aRate:0.##}/{aUnit} × {qtyOffer:0.##} = ₹{newAmt:0.##}\n\nManzoor hai? (reply: yes / no / ya apna qty likhein, jaise 80)");
                return;
            }
            // Number >= mangi hui qty = poora de sakta hai = accept hi hai
            if (IsYes(low) || (qtyOffer > 0 && askedQty > 0 && qtyOffer >= askedQty))
            {
                var oid = CtxGuid(ctx, "order_id");
                if (oid != Guid.Empty)
                    await using (var cmd = await Cmd("UPDATE wa.orders SET status = 'pending_agency', updated_at = now() WHERE id = @o"))
                    { cmd.Parameters.Add(new NpgsqlParameter("o", oid)); await cmd.ExecuteNonQueryAsync(); }
                await ClearState(threadId);
                var bt = CtxGuid(ctx, "buyer_thread_id");
                if (bt != Guid.Empty)
                    await BotReply(bt, firmId,
                        $"🎉 Supplier ne aapka order *{CtxStr(ctx, "order_code")}* ACCEPT kar liya!\n" +
                        $"{CtxStr(ctx, "category_name") ?? "Fabric"} — {CtxDec(ctx, "quantity"):0.##} {CtxStr(ctx, "rate_unit") ?? "mtr"} " +
                        $"@ ₹{CtxDec(ctx, "rate"):0.##} = ₹{CtxDec(ctx, "amount"):0.##}\n\n🕐 Ab AGENCY ki aakhri manzoori baki hai — muhar lagte hi pakka.");
                await BotReply(threadId, firmId,
                    $"✅ Order {CtxStr(ctx, "order_code")} accept ho gaya!\n🕐 AGENCY ki manzoori ka intezar — approve hote hi DISPATCH ka message milega.");
            }
            else await BotReply(threadId, firmId,
                "Reply karein: yes (accept) · no (reject) · ya apna qty likhein — kam YA zyada dono (jaise 300 ya minimum 100).");
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

    // INSAAN JAISA PADHNA — "Rate 1050 hai", "₹1050", "1050 rs", "1050/mtr", "1050" sab chalega.
    // Label (rate/₹/rs/@) mile to wahi number; warna message me EK HI number ho to wahi.
    // Do+ number bina label = 0 (bot saaf poochh lega — galat pakadne se poochhna behtar).
    private static decimal SmartNumber(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return 0;
        var clean = text.Replace(",", "");
        var lm = LabeledRateRx.Match(clean);
        if (lm.Success && decimal.TryParse(lm.Groups[1].Value, out var lv)) return lv;
        var all = Regex.Matches(clean, @"\d+(?:\.\d+)?");
        return all.Count == 1 && decimal.TryParse(all[0].Value, out var v) ? v : 0;
    }

    // HAAN ke sau roop: haan/ji/thik hai/pakka/chalega/manzoor/kar do/bhej do...
    private static bool IsYes(string low) => Regex.IsMatch(low,
        @"^(yes|y|haan|haanji|han|ha|ji|ok|okay|okey|thik|theek|sahi|pakka|chalega|manzoor|manjur|confirm|accept|done|kar do|kardo|bhej do|bhejdo|ho jayega)\b");
    // NA ke sau roop: nahi/nhi/mat/ruko/cancel...
    private static bool IsNo(string low) => Regex.IsMatch(low,
        @"^(no|nahi|nahin|nhi|na|mat|cancel|reset|reject|ruko|band|rehne do)\b");

    private async Task<(decimal rate, string unit, Guid? catId, string? catName)> ExtractRate(Guid firmId, string? caption)
    {
        decimal rate = 0;
        if (!string.IsNullOrEmpty(caption))
        {
            var m = LabeledRateRx.Match(caption.Replace(",", ""));
            if (m.Success) decimal.TryParse(m.Groups[1].Value, out rate);
            // Caption me bas EK number ho (jaise "699") to wahi rate maan lo —
            // par 10 se chhota nahi ("3 pic" jaisi ginti rate na ban jaye)
            if (rate == 0)
            {
                var sn = SmartNumber(caption);
                if (sn >= 10) rate = sn;
            }
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
