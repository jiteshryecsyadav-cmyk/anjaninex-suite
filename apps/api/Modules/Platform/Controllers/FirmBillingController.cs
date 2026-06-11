using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// FIRM BILLING — firm-facing payment info + manual payment claim.
// Firm Anjaninex ka UPI/QR/Bank dekhe, pay kare, reference daale (pending),
// admin approve kare to wallet recharge ho jata hai.
// =============================================================================
public record PayInfoDto(
    string? PayeeName, string? UpiId, string? BankName, string? AccountName,
    string? AccountNo, string? Ifsc, string? QrImageUrl, string? Instructions);

public record PaymentClaimDto(decimal Amount, string? Method, string? Reference, string? Note);

public record MyPaymentRequestDto(
    Guid Id, decimal Amount, string? Method, string? Reference, string? Note,
    string Status, string? CreatedAt, string? ReviewNote);

[ApiController]
[Route("api/billing")]
[Authorize]
public class FirmBillingController : ControllerBase
{
    private readonly AppDbContext _db;
    public FirmBillingController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // BYOK: firm ko sirf itna dikhao — kaunsa AI provider active hai + recharge/console link.
    // Key KABHI return nahi hoti.
    [HttpGet("ai-info")]
    public async Task<IActionResult> AiInfo()
    {
        var k = await _db.FirmApiKeys.FindAsync(CurrentFirmId);
        var provider = k?.AiProvider ?? "gemini";
        var keySet = !string.IsNullOrEmpty(k?.AiApiKey);
        var (name, consoleUrl) = provider switch
        {
            "claude" => ("Claude (Anthropic)", "https://console.anthropic.com/settings/billing"),
            "openai" => ("OpenAI", "https://platform.openai.com/settings/organization/billing"),
            _ => ("Gemini (Google)", "https://aistudio.google.com/")
        };
        return Ok(new
        {
            provider,
            providerName = name,
            keySet,
            consoleUrl,
            mapsKeySet = !string.IsNullOrEmpty(k?.MapsApiKey)
        });
    }

    // Bill/Receipt data — sirf apni firm ki APPROVED payment ka (download ke liye)
    [HttpGet("invoice/{id}")]
    public async Task<IActionResult> Invoice(Guid id)
    {
        await using var cmd = await CmdAsync(
            @"SELECT pr.invoice_no, pr.amount, pr.taxable, pr.gst_amount, pr.gst_rate,
                     pr.method, pr.reference,
                     to_char(pr.reviewed_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY') AS inv_date,
                     f.name AS firm_name, f.gst_number AS firm_gst, f.city AS firm_city, f.state AS firm_state,
                     bs.payee_name, bs.gstin AS payee_gstin
              FROM platform.payment_requests pr
              JOIN platform.firms f ON f.id = pr.firm_id
              LEFT JOIN platform.billing_settings bs ON bs.id = 1
              WHERE pr.id = @id AND pr.firm_id = @firm AND pr.status = 'approved'");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        cmd.Parameters.Add(new NpgsqlParameter("firm", CurrentFirmId));
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync())
            return NotFound(new { error = "Approved payment nahi mili." });

        var amount = Convert.ToDecimal(r["amount"]);
        var taxable = r["taxable"] is DBNull ? amount : Convert.ToDecimal(r["taxable"]);
        var gstAmount = r["gst_amount"] is DBNull ? 0m : Convert.ToDecimal(r["gst_amount"]);
        var gstRate = r["gst_rate"] is DBNull ? 0m : Convert.ToDecimal(r["gst_rate"]);

        return Ok(new
        {
            invoiceNo = r["invoice_no"] as string ?? "—",
            date = r["inv_date"] as string,
            firmName = r["firm_name"] as string,
            firmGst = r["firm_gst"] as string,
            firmCity = r["firm_city"] as string,
            firmState = r["firm_state"] as string,
            payeeName = r["payee_name"] as string ?? "Anjaninex",
            payeeGstin = r["payee_gstin"] as string,
            amount, taxable, gstAmount, gstRate,
            method = r["method"] as string,
            reference = r["reference"] as string
        });
    }

    // Anjaninex ke payment details (secret kabhi nahi).
    [HttpGet("pay-info")]
    public async Task<IActionResult> PayInfo()
    {
        await using var cmd = await CmdAsync(
            @"SELECT payee_name, upi_id, bank_name, account_name, account_no, ifsc, qr_image_url, instructions
              FROM platform.billing_settings WHERE id = 1");
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync())
            return Ok(new PayInfoDto(null, null, null, null, null, null, null, null));
        return Ok(new PayInfoDto(
            r["payee_name"] as string, r["upi_id"] as string, r["bank_name"] as string,
            r["account_name"] as string, r["account_no"] as string, r["ifsc"] as string,
            r["qr_image_url"] as string, r["instructions"] as string));
    }

    // Firm payment claim daale (pending).
    [HttpPost("claim")]
    public async Task<IActionResult> Claim([FromBody] PaymentClaimDto dto)
    {
        if (dto.Amount <= 0) return BadRequest(new { error = "Amount sahi daalein." });
        await using var cmd = await CmdAsync(
            @"INSERT INTO platform.payment_requests (firm_id, amount, method, reference, note, created_by)
              VALUES (@firm, @amt, @method, @ref, @note, @uid)");
        cmd.Parameters.Add(new NpgsqlParameter("firm", CurrentFirmId));
        cmd.Parameters.Add(new NpgsqlParameter("amt", dto.Amount));
        cmd.Parameters.Add(new NpgsqlParameter("method", (object?)dto.Method ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("ref", (object?)dto.Reference ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("note", (object?)dto.Note ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("uid", (object?)CurrentUserId ?? DBNull.Value));
        await cmd.ExecuteNonQueryAsync();
        return Ok(new { success = true });
    }

    // ── ADD-ON SERVICES ─────────────────────────────────────────────────────
    // Firm dekhe kaunsi extra services available hain (admin rate) + apni chosen
    // services. mode 'self' = firm khud direct le rahi (Anjaninex sirf integrate).
    [HttpGet("services")]
    public async Task<IActionResult> Services()
    {
        await using var cmd = await CmdAsync(
            @"SELECT s.id, s.code, s.name, s.icon, s.unit, s.rate, s.free_note,
                     s.billing_type, s.allow_self,
                     fas.enabled, fas.mode, fas.self_note
              FROM platform.addon_services s
              LEFT JOIN platform.firm_addon_services fas
                     ON fas.service_id = s.id AND fas.firm_id = @firm
              WHERE s.active = TRUE
              ORDER BY s.sort_order, s.name");
        cmd.Parameters.Add(new NpgsqlParameter("firm", CurrentFirmId));
        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = (Guid)r["id"],
                code = (string)r["code"],
                name = (string)r["name"],
                icon = r["icon"] as string,
                unit = r["unit"] as string,
                rate = Convert.ToDecimal(r["rate"]),
                freeNote = r["free_note"] as string,
                billingType = (string)r["billing_type"],
                allowSelf = (bool)r["allow_self"],
                enabled = r["enabled"] is bool b && b,
                mode = r["mode"] as string ?? "anjaninex",
                selfNote = r["self_note"] as string
            });
        }
        return Ok(list);
    }

    public record FirmServiceSelectionDto(Guid ServiceId, bool Enabled, string? Mode, string? SelfNote);
    public record SaveFirmServicesDto(List<FirmServiceSelectionDto> Items);

    // Firm apni service selections save kare (checkbox + Anjaninex/Self mode).
    [HttpPost("services")]
    public async Task<IActionResult> SaveServices([FromBody] SaveFirmServicesDto dto)
    {
        if (dto?.Items == null) return BadRequest(new { error = "Koi selection nahi mili." });

        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();
        try
        {
            foreach (var it in dto.Items)
            {
                var mode = it.Mode == "self" ? "self" : "anjaninex";
                if (it.Enabled)
                {
                    await using var up = conn.CreateCommand();
                    up.Transaction = tx;
                    up.CommandText =
                        @"INSERT INTO platform.firm_addon_services (firm_id, service_id, enabled, mode, self_note, enabled_at)
                          VALUES (@firm, @svc, TRUE, @mode, @note, now())
                          ON CONFLICT (firm_id, service_id)
                          DO UPDATE SET enabled = TRUE, mode = @mode, self_note = @note";
                    up.Parameters.Add(new NpgsqlParameter("firm", CurrentFirmId));
                    up.Parameters.Add(new NpgsqlParameter("svc", it.ServiceId));
                    up.Parameters.Add(new NpgsqlParameter("mode", mode));
                    up.Parameters.Add(new NpgsqlParameter("note", (object?)it.SelfNote ?? DBNull.Value));
                    await up.ExecuteNonQueryAsync();
                }
                else
                {
                    await using var del = conn.CreateCommand();
                    del.Transaction = tx;
                    del.CommandText =
                        "DELETE FROM platform.firm_addon_services WHERE firm_id=@firm AND service_id=@svc";
                    del.Parameters.Add(new NpgsqlParameter("firm", CurrentFirmId));
                    del.Parameters.Add(new NpgsqlParameter("svc", it.ServiceId));
                    await del.ExecuteNonQueryAsync();
                }
            }
            await tx.CommitAsync();
            return Ok(new { success = true });
        }
        catch
        {
            await tx.RollbackAsync();
            return StatusCode(500, new { error = "Services save nahi hui. Dobara try karein." });
        }
    }

    // Firm ke apne claims.
    [HttpGet("my-claims")]
    public async Task<IActionResult> MyClaims()
    {
        await using var cmd = await CmdAsync(
            @"SELECT id, amount, method, reference, note, status, review_note,
                     to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD""T""HH24:MI:SS') AS created_at
              FROM platform.payment_requests
              WHERE firm_id = @firm ORDER BY created_at DESC LIMIT 50");
        cmd.Parameters.Add(new NpgsqlParameter("firm", CurrentFirmId));
        var list = new List<MyPaymentRequestDto>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new MyPaymentRequestDto(
                (Guid)r["id"], Convert.ToDecimal(r["amount"]), r["method"] as string,
                r["reference"] as string, r["note"] as string, (string)r["status"],
                r["created_at"] as string, r["review_note"] as string));
        }
        return Ok(list);
    }
}
