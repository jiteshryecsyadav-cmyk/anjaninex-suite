using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;
using Namokara.Api.Modules.Accounting.Services;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// ADMIN — Manual payment requests review (Anjaninex super-admin).
// Pending claims dekho -> Approve (wallet recharge) ya Reject.
// =============================================================================
public record AdminPaymentReqDto(
    Guid Id, Guid FirmId, string? FirmName, decimal Amount, string? Method,
    string? Reference, string? Note, string Status, string? CreatedAt);

public record RejectDto(string? Reason);

[ApiController]
[Route("api/admin/payment-requests")]
[Authorize]
public class AdminPaymentRequestsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPlatformAdminService _svc;
    private readonly IVoucherService _vouchers;
    private readonly ILogger<AdminPaymentRequestsController> _log;
    public AdminPaymentRequestsController(AppDbContext db, IPlatformAdminService svc,
        IVoucherService vouchers, ILogger<AdminPaymentRequestsController> log)
    {
        _db = db;
        _svc = svc;
        _vouchers = vouchers;
        _log = log;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirst("user_id")?.Value!);

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    [HttpGet]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> List([FromQuery] string status = "pending")
    {
        var sql = @"SELECT pr.id, pr.firm_id, f.name AS firm_name, pr.amount, pr.method,
                           pr.reference, pr.note, pr.status,
                           to_char(pr.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD""T""HH24:MI:SS') AS created_at
                    FROM platform.payment_requests pr
                    LEFT JOIN platform.firms f ON f.id = pr.firm_id"
                  + (status == "all" ? "" : " WHERE pr.status = @status")
                  + " ORDER BY pr.created_at DESC LIMIT 200";
        await using var cmd = await CmdAsync(sql);
        if (status != "all") cmd.Parameters.Add(new NpgsqlParameter("status", status));
        var list = new List<AdminPaymentReqDto>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new AdminPaymentReqDto(
                (Guid)r["id"], (Guid)r["firm_id"], r["firm_name"] as string,
                Convert.ToDecimal(r["amount"]), r["method"] as string, r["reference"] as string,
                r["note"] as string, (string)r["status"], r["created_at"] as string));
        }
        return Ok(list);
    }

    [HttpPost("{id}/approve")]
    [HasPermission("platform.wallet.recharge.platform")]
    public async Task<IActionResult> Approve(Guid id)
    {
        // Pending row ko atomically approve karo (double-credit se bachne ke liye).
        Guid firmId; decimal amount; string? reference;
        await using (var sel = await CmdAsync(
            "SELECT firm_id, amount, reference FROM platform.payment_requests WHERE id = @id AND status = 'pending'"))
        {
            sel.Parameters.Add(new NpgsqlParameter("id", id));
            await using var r = await sel.ExecuteReaderAsync();
            if (!await r.ReadAsync()) return BadRequest(new { error = "Request nahi mili ya pehle hi process ho gayi." });
            firmId = (Guid)r["firm_id"];
            amount = Convert.ToDecimal(r["amount"]);
            reference = r["reference"] as string;
        }

        await using (var upd = await CmdAsync(
            "UPDATE platform.payment_requests SET status='approved', reviewed_by=@uid, reviewed_at=now() WHERE id=@id AND status='pending'"))
        {
            upd.Parameters.Add(new NpgsqlParameter("uid", CurrentUserId));
            upd.Parameters.Add(new NpgsqlParameter("id", id));
            var n = await upd.ExecuteNonQueryAsync();
            if (n == 0) return BadRequest(new { error = "Pehle hi process ho chuki hai." });
        }

        await _svc.RechargeFirmWallet(firmId, amount, "manual-upi", reference ?? $"payreq:{id}", CurrentUserId);

        // GST + invoice number: FY turnover 20 lakh tak GST 0%, uske baad 18% (amount GST-inclusive maana jata hai)
        var (taxable, gst, gstRate) = await ComputeGstAndInvoice(id, amount);

        // Anjaninex ke apne books me income voucher auto-post (fail ho to approve nahi rukta)
        await PostIncomeToBooks(firmId, amount, taxable, gst, reference ?? $"payreq:{id}");

        return Ok(new { success = true });
    }

    // -------------------------------------------------------------------------
    // Invoice no + GST: current FY (Apr–Mar) ka approved turnover dekho.
    // < 20,00,000 → GST 0% (threshold ke neeche). >= 20L → 18% (inclusive split).
    // -------------------------------------------------------------------------
    private async Task<(decimal taxable, decimal gst, decimal rate)> ComputeGstAndInvoice(Guid payReqId, decimal amount)
    {
        var today = DateTime.Today;
        var fyStartDate = today.Month >= 4 ? new DateTime(today.Year, 4, 1) : new DateTime(today.Year - 1, 4, 1);
        var fyLabel = $"{fyStartDate.Year % 100:D2}-{(fyStartDate.Year + 1) % 100:D2}";

        decimal fyTurnover = 0;
        await using (var cmd = await CmdAsync(
            @"SELECT COALESCE(SUM(amount), 0) FROM platform.payment_requests
              WHERE status = 'approved' AND reviewed_at >= @fyStart AND id <> @id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("fyStart", fyStartDate));
            cmd.Parameters.Add(new NpgsqlParameter("id", payReqId));
            var v = await cmd.ExecuteScalarAsync();
            fyTurnover = v is decimal d ? d : Convert.ToDecimal(v ?? 0);
        }

        decimal rate = fyTurnover >= 2000000m ? 18m : 0m;
        decimal taxable = rate > 0 ? Math.Round(amount / 1.18m, 2) : amount;
        decimal gst = amount - taxable;

        long seq = 1;
        await using (var s = await CmdAsync("SELECT nextval('platform.invoice_seq')"))
            seq = Convert.ToInt64(await s.ExecuteScalarAsync());
        var invoiceNo = $"ANJ-{fyLabel}-{seq:D4}";

        await using (var upd = await CmdAsync(
            @"UPDATE platform.payment_requests
              SET invoice_no=@inv, taxable=@tax, gst_amount=@gst, gst_rate=@rate WHERE id=@id"))
        {
            upd.Parameters.Add(new NpgsqlParameter("inv", invoiceNo));
            upd.Parameters.Add(new NpgsqlParameter("tax", taxable));
            upd.Parameters.Add(new NpgsqlParameter("gst", gst));
            upd.Parameters.Add(new NpgsqlParameter("rate", rate));
            upd.Parameters.Add(new NpgsqlParameter("id", payReqId));
            await upd.ExecuteNonQueryAsync();
        }

        return (taxable, gst, rate);
    }

    // FY turnover card (admin dashboard ke liye)
    [HttpGet("turnover")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Turnover()
    {
        var today = DateTime.Today;
        var fyStartDate = today.Month >= 4 ? new DateTime(today.Year, 4, 1) : new DateTime(today.Year - 1, 4, 1);

        decimal turnover = 0, gstCollected = 0;
        await using (var cmd = await CmdAsync(
            @"SELECT COALESCE(SUM(amount),0) AS t, COALESCE(SUM(gst_amount),0) AS g
              FROM platform.payment_requests WHERE status='approved' AND reviewed_at >= @fyStart"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("fyStart", fyStartDate));
            await using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                turnover = Convert.ToDecimal(r["t"]);
                gstCollected = Convert.ToDecimal(r["g"]);
            }
        }

        return Ok(new
        {
            fyLabel = $"FY {fyStartDate.Year}-{(fyStartDate.Year + 1) % 100:D2}",
            turnover,
            threshold = 2000000m,
            gstApplicable = turnover >= 2000000m,
            gstCollected
        });
    }

    // -------------------------------------------------------------------------
    // Anjaninex Books: Dr Bank / Cr Subscription Income — payment approve par
    // -------------------------------------------------------------------------
    private async Task PostIncomeToBooks(Guid payerFirmId, decimal amount, decimal taxable, decimal gst, string reference)
    {
        try
        {
            // 1. Books firm set hai?
            Guid? booksFirmId = null;
            await using (var cmd = await CmdAsync("SELECT books_firm_id FROM platform.billing_settings WHERE id = 1"))
            {
                var v = await cmd.ExecuteScalarAsync();
                if (v is Guid g && g != Guid.Empty) booksFirmId = g;
            }
            if (booksFirmId == null) return;   // set nahi → skip (koi error nahi)

            // 2. Books firm ki head-office branch
            var branchId = await _db.Branches
                .Where(b => b.FirmId == booksFirmId.Value)
                .OrderByDescending(b => b.IsHeadOffice)
                .Select(b => (Guid?)b.Id)
                .FirstOrDefaultAsync();
            if (branchId == null) { _log.LogWarning("Books firm {Id} me branch nahi mili — income post skip", booksFirmId); return; }

            // 3. Ledgers ensure
            var bankLedger = await EnsureLedger(booksFirmId.Value, "Bank Accounts", "Bank A/c", "Dr");
            var incomeLedger = await EnsureLedger(booksFirmId.Value, "Sales", "Subscription Income", "Cr");

            // 4. Receipt voucher
            var payerName = await _db.Firms.IgnoreQueryFilters()
                .Where(f => f.Id == payerFirmId).Select(f => f.Name).FirstOrDefaultAsync() ?? "firm";

            var lines = new List<CreateVoucherLineDto>
            {
                new(bankLedger, "Dr", amount, null),
                new(incomeLedger, "Cr", taxable, null)
            };
            if (gst > 0)
            {
                var gstLedger = await EnsureLedger(booksFirmId.Value, "Duties & Taxes", "GST Payable", "Cr");
                lines.Add(new CreateVoucherLineDto(gstLedger, "Cr", gst, null));
            }

            var dto = new CreateVoucherDto(
                "receipt", DateOnly.FromDateTime(DateTime.Today),
                $"Subscription/recharge received from {payerName} · ref: {reference}",
                lines);

            await _vouchers.Create(dto, booksFirmId.Value, branchId.Value, CurrentUserId);
            _log.LogInformation("Anjaninex Books me ₹{Amt} income voucher posted (from {Payer})", amount, payerName);
        }
        catch (Exception ex)
        {
            // Books posting fail hone par approve fail NAHI hona chahiye — wallet already recharged.
            _log.LogError(ex, "Anjaninex Books income auto-post fail (amount ₹{Amt})", amount);
        }
    }

    private async Task<Guid> EnsureLedger(Guid firmId, string subGroupName, string ledgerName, string type)
    {
        var existing = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == ledgerName)
            .Select(l => (Guid?)l.Id).FirstOrDefaultAsync();
        if (existing != null) return existing.Value;

        var sg = await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId && s.Name == subGroupName)
              ?? await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId);
        if (sg == null)
            throw new InvalidOperationException("Books firm me chart of accounts nahi hai — pehle accounting setup karein.");

        var led = new Ledger
        {
            Id = Guid.NewGuid(), FirmId = firmId, SubGroupId = sg.Id,
            Name = ledgerName, OpeningBalance = 0, OpeningType = type
        };
        _db.Ledgers.Add(led);
        await _db.SaveChangesAsync();
        return led.Id;
    }

    [HttpPost("{id}/reject")]
    [HasPermission("platform.wallet.recharge.platform")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectDto dto)
    {
        await using var cmd = await CmdAsync(
            "UPDATE platform.payment_requests SET status='rejected', review_note=@note, reviewed_by=@uid, reviewed_at=now() WHERE id=@id AND status='pending'");
        cmd.Parameters.Add(new NpgsqlParameter("note", (object?)dto.Reason ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("uid", CurrentUserId));
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        var n = await cmd.ExecuteNonQueryAsync();
        if (n == 0) return BadRequest(new { error = "Request nahi mili ya pehle hi process ho gayi." });
        return Ok(new { success = true });
    }
}
