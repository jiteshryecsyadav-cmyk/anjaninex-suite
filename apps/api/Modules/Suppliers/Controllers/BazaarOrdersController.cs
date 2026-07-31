using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Hubs;
using Namokara.Api.Modules.Trading.Services;

namespace Namokara.Api.Modules.Suppliers.Controllers;

// =============================================================================
// BAZAAR BOT ORDERS — AGENCY APPROVAL
// Buyer + Supplier dono haan bol dein to order 'pending_agency' hota hai.
// Agency yahan se APPROVE kare tabhi:
//   1. TRADING me asli order banta hai (number ReserveCounter se, gap-free)
//      — REMARK me bazaar order no + date-time, Supplier Order No me bazaar code
//   2. Supplier ko chat me "DISPATCH karein" + buyer ko "pakka ho gaya"
// REJECT par dono ko saaf message (wajah ke saath).
// =============================================================================

public record BzRejectDto(string? Reason);

[ApiController]
[Authorize]
[ModuleAccess("active_directory")]
[Route("api/bazaar-orders")]
public class BazaarOrdersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IOrderService _orders;
    private readonly IHubContext<PartyChatHub> _hub;
    public BazaarOrdersController(AppDbContext db, IOrderService orders, IHubContext<PartyChatHub> hub)
    { _db = db; _orders = orders; _hub = hub; }

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value ?? throw new InvalidOperationException("firm_id claim missing"));
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("user_id")?.Value!);
    private Guid CurrentBranchId
    {
        get
        {
            var branchId = Request.Headers["X-Branch-Id"].FirstOrDefault()
                        ?? User.FindFirst("default_branch_id")?.Value;
            return Guid.Parse(branchId ?? throw new InvalidOperationException("Branch not selected"));
        }
    }

    private async Task<NpgsqlCommand> Cmd(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // ---- List — default: agency ki manzoori wale pehle ----
    [HttpGet]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? status)
    {
        var list = new List<object>();
        var sql = @"
            SELECT o.id, o.order_code, o.track_code, o.buyer_name, o.buyer_phone,
                   o.supplier_name, o.supplier_phone, o.category_name,
                   o.rate, o.rate_unit, o.quantity, o.amount, o.status,
                   o.created_at, o.trading_order_no, o.reject_reason,
                   -- buyer ki credit-jhalak (trading party se, phone match)
                   pp.credit_limit, pp.credit_rating
            FROM wa.orders o
            LEFT JOIN LATERAL (
                SELECT p.credit_limit, p.credit_rating
                FROM trading.party_profiles p JOIN core.contacts c ON c.id = p.contact_id
                WHERE p.firm_id = o.firm_id AND p.is_active
                  AND right(regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g'), 10)
                      = right(regexp_replace(COALESCE(o.buyer_phone,''), '\D', '', 'g'), 10)
                ORDER BY (p.party_type = 'buyer') DESC, p.created_at DESC LIMIT 1
            ) pp ON true
            WHERE o.firm_id = @f" +
            (string.IsNullOrEmpty(status) ? "" : " AND o.status = @st") + @"
            ORDER BY (o.status = 'pending_agency') DESC, o.created_at DESC
            LIMIT 200";
        await using var cmd = await Cmd(sql);
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        if (!string.IsNullOrEmpty(status)) cmd.Parameters.Add(new NpgsqlParameter("st", status));
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new
            {
                id = r.GetGuid(0),
                orderCode = r.IsDBNull(1) ? null : r.GetString(1),
                trackCode = r.IsDBNull(2) ? null : r.GetString(2),
                buyerName = r.IsDBNull(3) ? null : r.GetString(3),
                buyerPhone = r.IsDBNull(4) ? null : r.GetString(4),
                supplierName = r.IsDBNull(5) ? null : r.GetString(5),
                supplierPhone = r.IsDBNull(6) ? null : r.GetString(6),
                categoryName = r.IsDBNull(7) ? null : r.GetString(7),
                rate = r.IsDBNull(8) ? 0 : r.GetDecimal(8),
                rateUnit = r.IsDBNull(9) ? "mtr" : r.GetString(9),
                quantity = r.IsDBNull(10) ? 0 : r.GetDecimal(10),
                amount = r.IsDBNull(11) ? 0 : r.GetDecimal(11),
                status = r.IsDBNull(12) ? "" : r.GetString(12),
                createdAt = r.GetFieldValue<DateTimeOffset>(13),
                tradingOrderNo = r.IsDBNull(14) ? null : r.GetString(14),
                rejectReason = r.IsDBNull(15) ? null : r.GetString(15),
                buyerCreditLimit = r.IsDBNull(16) ? (decimal?)null : r.GetDecimal(16),
                buyerRating = r.IsDBNull(17) ? null : r.GetString(17)
            });
        return Ok(list);
    }

    // ---- APPROVE — Trading order banao + dono chats me khabar ----
    [HttpPost("{id}/approve")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Approve(Guid id)
    {
        var o = await LoadOrder(id);
        if (o is null) return NotFound(new { error = "Order nahi mila" });
        if (o.Status is not ("pending_agency" or "accepted"))
            return BadRequest(new { error = $"Ye order '{o.Status}' me hai — sirf manzoori-wale approve hote hain." });

        // Supplier/Buyer ki TRADING parties — chat-threads se (pakki pehchan)
        var supParty = await PartyFromThread(o.SupplierThreadId) ?? await PartyByPhone(o.SupplierPhone);
        var buyParty = await PartyFromThread(o.BuyerThreadId) ?? await PartyByPhone(o.BuyerPhone);
        if (supParty is null)
            return BadRequest(new { error = "Supplier ki Trading party nahi mili — Party Master me phone milao, phir approve karo." });

        // TRADING ORDER — remark me bazaar order no + date-time (user ki maang)
        var ist = o.CreatedAt.ToOffset(TimeSpan.FromMinutes(330));
        var remark = $"Bazaar Link order {o.OrderCode} · {ist:dd-MMM-yyyy h:mm tt} · photo {o.TrackCode}";
        // Order me jitne ITEM hain utni LINE (kai photo ka ek order — asli bill jaisa).
        // Purane single-photo order me bhi ek line item table me pehle se hai (migration 110).
        var lines = new List<OrderLineDto>();
        await using (var lc = await Cmd(@"
            SELECT track_code, category_name, rate, rate_unit, quantity, amount
              FROM wa.order_items WHERE order_id = @o ORDER BY sort_order, created_at"))
        {
            lc.Parameters.Add(new NpgsqlParameter("o", id));
            await using var lr = await lc.ExecuteReaderAsync();
            while (await lr.ReadAsync())
            {
                var tc = lr.IsDBNull(0) ? o.TrackCode : lr.GetString(0);
                var cat = lr.IsDBNull(1) ? o.CategoryName : lr.GetString(1);
                var rt = lr.IsDBNull(2) ? 0m : lr.GetDecimal(2);
                var un = lr.IsDBNull(3) ? o.RateUnit : lr.GetString(3);
                var qt = lr.IsDBNull(4) ? 0m : lr.GetDecimal(4);
                var am = lr.IsDBNull(5) ? 0m : lr.GetDecimal(5);
                var isPcs = string.Equals(un, "pcs", StringComparison.OrdinalIgnoreCase);
                lines.Add(new OrderLineDto(
                    null, null,
                    ItemName: $"Fabric — {tc}", Description: cat, HsnSac: null,
                    Qty: qt, Unit: un, Rate: rt, Rd: 0, SgstPct: 0, CgstPct: 0,
                    TaxableAmount: am, TaxAmount: 0, TotalAmount: am,
                    Pcs: isPcs ? qt : null, Meters: isPcs ? null : qt,
                    RateBasis: isPcs ? "PCS" : "MTR"));
            }
        }
        if (lines.Count == 0)   // purana order jisme items table me kuch nahi
        {
            var isPcs0 = string.Equals(o.RateUnit, "pcs", StringComparison.OrdinalIgnoreCase);
            lines.Add(new OrderLineDto(
                null, null,
                ItemName: $"Fabric — {o.TrackCode}", Description: o.CategoryName, HsnSac: null,
                Qty: o.Quantity, Unit: o.RateUnit, Rate: o.Rate, Rd: 0, SgstPct: 0, CgstPct: 0,
                TaxableAmount: o.Amount, TaxAmount: 0, TotalAmount: o.Amount,
                Pcs: isPcs0 ? o.Quantity : null, Meters: isPcs0 ? null : o.Quantity,
                RateBasis: isPcs0 ? "PCS" : "MTR"));
        }
        var dto = new CreateOrderDto(
            OrderType: "sales",
            OrderDate: DateOnly.FromDateTime(DateTime.UtcNow.AddMinutes(330)),
            PartyId: supParty.Value,
            BuyerPartyId: buyParty,
            CdPercent: 0,
            SupplierOrderNo: o.OrderCode,      // bazaar ka order no yahan bhi dikhe
            PaymentTerms: null,
            Status: "pending",
            Notes: remark,
            Lines: lines);
        var created = await _orders.Create(dto, CurrentFirmId, CurrentBranchId, CurrentUserId);

        // 📷 Bazaar ki STOCK-PHOTO Trading order ke document me — dhundhni na pade
        if (!string.IsNullOrEmpty(o.ImagePath))
        {
            var photoUrl = "/api/party-chat/public/file/" + o.ImagePath.Split('/', '\\').Last();
            await using var pd = await Cmd(
                "UPDATE trading.orders SET doc_url = @u, doc_name = @n WHERE id = @o");
            pd.Parameters.Add(new NpgsqlParameter("u", photoUrl));
            pd.Parameters.Add(new NpgsqlParameter("n", $"Bazaar photo — {o.TrackCode}.jpg"));
            pd.Parameters.Add(new NpgsqlParameter("o", created.Id));
            await pd.ExecuteNonQueryAsync();
        }

        await using (var up = await Cmd(@"
            UPDATE wa.orders SET status = 'approved', approved_at = now(), approved_by = @u,
                   trading_order_id = @tid, trading_order_no = @tno, updated_at = now()
            WHERE id = @o"))
        {
            up.Parameters.Add(new NpgsqlParameter("u", CurrentUserId));
            up.Parameters.Add(new NpgsqlParameter("tid", created.Id));
            up.Parameters.Add(new NpgsqlParameter("tno", created.OrderNo));
            up.Parameters.Add(new NpgsqlParameter("o", id));
            await up.ExecuteNonQueryAsync();
        }

        await ChatMsg(o.SupplierThreadId,
            $"🚚 AGENCY NE APPROVE KAR DIYA!\nOrder {o.OrderCode} pakka — ab DISPATCH karein.\n" +
            $"{o.CategoryName ?? "Fabric"} — {o.Quantity:0.##} {o.RateUnit} @ ₹{o.Rate:0.##} = ₹{o.Amount:0.##}\n" +
            $"Trading Order: {created.OrderNo}");
        await ChatMsg(o.BuyerThreadId,
            $"🎉 Agency ne bhi muhar laga di — order {o.OrderCode} PAKKA!\nMaal jald ravana hoga. 🚚");

        return Ok(new { ok = true, tradingOrderNo = created.OrderNo, tradingOrderId = created.Id });
    }

    // ---- REJECT — wajah ke saath, dono ko khabar ----
    [HttpPost("{id}/reject")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] BzRejectDto dto)
    {
        var o = await LoadOrder(id);
        if (o is null) return NotFound(new { error = "Order nahi mila" });
        if (o.Status is not ("pending_agency" or "accepted" or "pending_supplier"))
            return BadRequest(new { error = $"Ye order '{o.Status}' me hai — reject nahi ho sakta." });

        await using (var up = await Cmd(@"
            UPDATE wa.orders SET status = 'rejected', reject_reason = @rr, approved_by = @u, updated_at = now()
            WHERE id = @o"))
        {
            up.Parameters.Add(new NpgsqlParameter("rr", (object?)dto.Reason ?? DBNull.Value));
            up.Parameters.Add(new NpgsqlParameter("u", CurrentUserId));
            up.Parameters.Add(new NpgsqlParameter("o", id));
            await up.ExecuteNonQueryAsync();
        }
        var why = string.IsNullOrWhiteSpace(dto.Reason) ? "" : $"\nWajah: {dto.Reason}";
        await ChatMsg(o.SupplierThreadId, $"😔 Agency ne order {o.OrderCode} manzoor NAHI kiya — dispatch na karein.{why}");
        await ChatMsg(o.BuyerThreadId, $"😔 Maaf kijiye — order {o.OrderCode} agency se manzoor nahi hua.{why}");
        return Ok(new { ok = true });
    }

    // ================= helpers =================

    private record BzOrder(Guid Id, string? OrderCode, string? TrackCode, string? CategoryName,
        string? BuyerPhone, string? SupplierPhone, decimal Rate, string RateUnit,
        decimal Quantity, decimal Amount, string Status, DateTimeOffset CreatedAt,
        Guid? BuyerThreadId, Guid? SupplierThreadId, string? ImagePath);

    private async Task<BzOrder?> LoadOrder(Guid id)
    {
        await using var cmd = await Cmd(@"
            SELECT id, order_code, track_code, category_name, buyer_phone, supplier_phone,
                   rate, rate_unit, quantity, amount, status, created_at,
                   buyer_thread_id, supplier_thread_id, image_path
            FROM wa.orders WHERE id = @o AND firm_id = @f");
        cmd.Parameters.Add(new NpgsqlParameter("o", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;
        return new BzOrder(
            r.GetGuid(0),
            r.IsDBNull(1) ? null : r.GetString(1),
            r.IsDBNull(2) ? null : r.GetString(2),
            r.IsDBNull(3) ? null : r.GetString(3),
            r.IsDBNull(4) ? null : r.GetString(4),
            r.IsDBNull(5) ? null : r.GetString(5),
            r.IsDBNull(6) ? 0 : r.GetDecimal(6),
            r.IsDBNull(7) ? "mtr" : r.GetString(7),
            r.IsDBNull(8) ? 0 : r.GetDecimal(8),
            r.IsDBNull(9) ? 0 : r.GetDecimal(9),
            r.IsDBNull(10) ? "" : r.GetString(10),
            r.GetFieldValue<DateTimeOffset>(11),
            r.IsDBNull(12) ? null : r.GetGuid(12),
            r.IsDBNull(13) ? null : r.GetGuid(13),
            r.IsDBNull(14) ? null : r.GetString(14));
    }

    private async Task<Guid?> PartyFromThread(Guid? threadId)
    {
        if (threadId is null) return null;
        await using var cmd = await Cmd(
            "SELECT party_id FROM platform.party_chat_threads WHERE id = @t AND firm_id = @f");
        cmd.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        return (await cmd.ExecuteScalarAsync()) as Guid?;
    }

    private async Task<Guid?> PartyByPhone(string? phone)
    {
        var d = new string((phone ?? "").Where(char.IsDigit).ToArray());
        if (d.Length < 10) return null;
        var last10 = d[^10..];
        await using var cmd = await Cmd(@"
            SELECT p.id FROM trading.party_profiles p JOIN core.contacts c ON c.id = p.contact_id
            WHERE p.firm_id = @f AND p.is_active
              AND right(regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g'), 10) = @ph
            ORDER BY p.created_at DESC LIMIT 1");
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        cmd.Parameters.Add(new NpgsqlParameter("ph", last10));
        return (await cmd.ExecuteScalarAsync()) as Guid?;
    }

    // Chat me "Bazaar Bot 🤖" ki taraf se message + live push (fail-soft)
    private async Task ChatMsg(Guid? threadId, string body)
    {
        if (threadId is null) return;
        try
        {
            await using (var cmd = await Cmd(@"
                INSERT INTO platform.party_chat_messages (thread_id, sender, sender_name, body)
                VALUES (@t, 'firm', 'Bazaar Bot 🤖', @b)"))
            {
                cmd.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
                cmd.Parameters.Add(new NpgsqlParameter("b", body));
                await cmd.ExecuteNonQueryAsync();
            }
            await using (var touch = await Cmd("UPDATE platform.party_chat_threads SET last_msg_at = now() WHERE id = @t"))
            { touch.Parameters.Add(new NpgsqlParameter("t", threadId.Value)); await touch.ExecuteNonQueryAsync(); }
            await PartyChatEvents.Notify(_hub, threadId.Value, CurrentFirmId);
        }
        catch { /* khabar na jaye to bhi approval nahi rukna chahiye */ }
    }
}
