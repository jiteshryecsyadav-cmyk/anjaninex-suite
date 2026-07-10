using System.Data;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

// Razorpay online checkout (firm subscription recharge). Secret sirf server par rehta hai:
// order create (basic auth) + signature verify (HMAC). Verified payment -> approved
// payment_request + wallet recharge (manual flow jaisa hi, bas auto).
public record RzpOrderReqDto(decimal Amount);
public record RzpVerifyDto(string OrderId, string PaymentId, string Signature, decimal Amount);

[ApiController]
[Route("api/billing/razorpay")]
[Authorize]
public class RazorpayController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPlatformAdminService _svc;
    private static readonly HttpClient Http = new HttpClient();
    public RazorpayController(AppDbContext db, IPlatformAdminService svc) { _db = db; _svc = svc; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value
        ?? throw new InvalidOperationException("firm_id claim missing"));
    private Guid? CurrentUserId => Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    private async Task<(string? keyId, string? secret, bool enabled)> LoadKeysAsync()
    {
        await using var cmd = await CmdAsync(
            "SELECT razorpay_key_id, razorpay_key_secret, gateway_enabled FROM platform.billing_settings WHERE id = 1");
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return (null, null, false);
        return (r["razorpay_key_id"] as string, r["razorpay_key_secret"] as string, r["gateway_enabled"] is bool b && b);
    }

    // 1) Order banao (amount rupees me).
    [HttpPost("order")]
    public async Task<IActionResult> CreateOrder([FromBody] RzpOrderReqDto dto)
    {
        if (dto.Amount <= 0) return BadRequest(new { error = "Amount sahi daalein." });
        var (keyId, secret, enabled) = await LoadKeysAsync();
        if (!enabled || string.IsNullOrWhiteSpace(keyId) || string.IsNullOrWhiteSpace(secret))
            return BadRequest(new { error = "Razorpay gateway abhi configure/enable nahi hai. Admin -> Billing me keys daalo + Gateway enable karo." });

        long paise = (long)Math.Round(dto.Amount * 100m);
        var body = JsonSerializer.Serialize(new
        {
            amount = paise,
            currency = "INR",
            receipt = $"rcpt_{CurrentFirmId:N}_{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}"
        });
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.razorpay.com/v1/orders");
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic",
            Convert.ToBase64String(Encoding.ASCII.GetBytes($"{keyId}:{secret}")));
        req.Content = new StringContent(body, Encoding.UTF8, "application/json");

        HttpResponseMessage resp;
        string text;
        try
        {
            resp = await Http.SendAsync(req);
            text = await resp.Content.ReadAsStringAsync();
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = "Razorpay se connect nahi ho paya: " + ex.Message });
        }
        if (!resp.IsSuccessStatusCode)
            return BadRequest(new { error = "Razorpay order fail. Keys sahi/live hain? " + text });

        using var doc = JsonDocument.Parse(text);
        var orderId = doc.RootElement.GetProperty("id").GetString();
        return Ok(new { orderId, keyId, amount = paise, currency = "INR", name = "Vyapaar Setu" });
    }

    // 2) Payment verify + auto-approve + wallet recharge.
    [HttpPost("verify")]
    public async Task<IActionResult> Verify([FromBody] RzpVerifyDto dto)
    {
        var (_, secret, _) = await LoadKeysAsync();
        if (string.IsNullOrWhiteSpace(secret)) return BadRequest(new { error = "Gateway secret set nahi hai." });
        if (string.IsNullOrWhiteSpace(dto.OrderId) || string.IsNullOrWhiteSpace(dto.PaymentId) || string.IsNullOrWhiteSpace(dto.Signature))
            return BadRequest(new { error = "Payment details adhoore hain." });

        // Razorpay signature: HMAC_SHA256(order_id + '|' + payment_id) using key_secret.
        var payload = $"{dto.OrderId}|{dto.PaymentId}";
        using var hmac = new HMACSHA256(Encoding.ASCII.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.ASCII.GetBytes(payload));
        var expected = Convert.ToHexString(hash).ToLowerInvariant();
        if (!string.Equals(expected, dto.Signature, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Payment verification fail. Agar paisa kat gaya ho to support se sampark karo." });

        if (dto.Amount <= 0) return BadRequest(new { error = "Amount galat." });
        var firmId = CurrentFirmId;

        // Dedupe: same payment_id pehle process ho chuka?
        await using (var chk = await CmdAsync(
            "SELECT 1 FROM platform.payment_requests WHERE reference = @ref AND method = 'razorpay' LIMIT 1"))
        {
            chk.Parameters.Add(new NpgsqlParameter("ref", dto.PaymentId));
            if (await chk.ExecuteScalarAsync() != null)
                return Ok(new { success = true, already = true });
        }

        Guid payReqId;
        await using (var cmd = await CmdAsync(
            @"INSERT INTO platform.payment_requests
                (firm_id, amount, method, reference, note, created_by, status, reviewed_by, reviewed_at)
              VALUES (@firm, @amt, 'razorpay', @ref, 'Razorpay online payment (auto-verified)', @uid, 'approved', @uid, now())
              RETURNING id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("firm", firmId));
            cmd.Parameters.Add(new NpgsqlParameter("amt", dto.Amount));
            cmd.Parameters.Add(new NpgsqlParameter("ref", dto.PaymentId));
            cmd.Parameters.Add(new NpgsqlParameter("uid", (object?)CurrentUserId ?? DBNull.Value));
            payReqId = (Guid)(await cmd.ExecuteScalarAsync())!;
        }

        var invoiceNo = await ComputeGstInvoice(payReqId, dto.Amount);
        await _svc.RechargeFirmWallet(firmId, dto.Amount, "razorpay", dto.PaymentId, CurrentUserId ?? Guid.Empty);

        return Ok(new { success = true, invoiceNo });
    }

    // GST + invoice no (AdminPaymentRequestsController jaisa hi: FY 20L tak GST 0%, uske baad 18% inclusive).
    private async Task<string> ComputeGstInvoice(Guid payReqId, decimal amount)
    {
        var today = DateTime.Today;
        var fyStart = today.Month >= 4 ? new DateTime(today.Year, 4, 1) : new DateTime(today.Year - 1, 4, 1);
        var fyLabel = $"{fyStart.Year % 100:D2}-{(fyStart.Year + 1) % 100:D2}";

        decimal fyTurnover = 0;
        await using (var cmd = await CmdAsync(
            @"SELECT COALESCE(SUM(amount),0) FROM platform.payment_requests
              WHERE status='approved' AND reviewed_at >= @fy AND id <> @id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("fy", fyStart));
            cmd.Parameters.Add(new NpgsqlParameter("id", payReqId));
            var v = await cmd.ExecuteScalarAsync();
            fyTurnover = v is decimal d ? d : Convert.ToDecimal(v ?? 0);
        }

        decimal rate = fyTurnover >= 2000000m ? 18m : 0m;
        decimal taxable = rate > 0 ? Math.Round(amount / 1.18m, 2) : amount;
        decimal gst = amount - taxable;

        long seq;
        await using (var s = await CmdAsync("SELECT nextval('platform.invoice_seq')"))
            seq = Convert.ToInt64(await s.ExecuteScalarAsync());
        var invoiceNo = $"ANJ-{fyLabel}-{seq:D4}";

        await using (var upd = await CmdAsync(
            @"UPDATE platform.payment_requests SET invoice_no=@inv, taxable=@tax, gst_amount=@gst, gst_rate=@rate WHERE id=@id"))
        {
            upd.Parameters.Add(new NpgsqlParameter("inv", invoiceNo));
            upd.Parameters.Add(new NpgsqlParameter("tax", taxable));
            upd.Parameters.Add(new NpgsqlParameter("gst", gst));
            upd.Parameters.Add(new NpgsqlParameter("rate", rate));
            upd.Parameters.Add(new NpgsqlParameter("id", payReqId));
            await upd.ExecuteNonQueryAsync();
        }
        return invoiceNo;
    }
}
