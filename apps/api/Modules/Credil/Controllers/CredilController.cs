using System.Data;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Credil.Controllers;

// CREDIL (Credit Index Link) — firm-facing report request flow.
// Flow: firm apne CREDIL page se target GST + components choose kare -> OTP party ke
// registered mobile pe (consent) -> verify -> Razorpay pay -> request Anjaninex admin ke
// pass approval ke liye -> admin approve -> report snapshot deliver + bell notification.
// credil.* pe RLS nahi (network dataset); yaha har query requesting_firm_id se filter hoti hai.
public record CredilRequestDto(string TargetGst, string[]? Components, Guid? GroupId);
public record CredilOtpDto(string Otp);
public record CredilPayVerifyDto(string OrderId, string PaymentId, string Signature);

[ApiController]
[Route("api/credil")]
[Authorize]
public class CredilController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPermissionService _perms;
    private static readonly HttpClient Http = new HttpClient();

    // Available scoring components (Phase 1 — buyer/payment side).
    private static readonly string[] AllComponents = { "pay", "default", "trade", "volume" };

    public CredilController(AppDbContext db, IPermissionService perms) { _db = db; _perms = perms; }

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

    private async Task<bool> IsPlatformAdmin()
    {
        if (CurrentUserId == null) return false;
        var perms = await _perms.GetUserPermissions(CurrentUserId.Value);
        return perms.Contains("*") || perms.Any(p => p.EndsWith(".platform", StringComparison.OrdinalIgnoreCase));
    }

    // ---- Config (rate card + firm feature flag) ----
    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        bool enabled = false;
        await using (var cmd = await CmdAsync("SELECT COALESCE(credil_enabled,false) FROM platform.firms WHERE id = @f"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            var v = await cmd.ExecuteScalarAsync();
            enabled = v is bool b && b;
        }

        decimal fullPrice = 500, perComp = 150; int minFirms = 2, minPts = 5;
        await using (var cmd = await CmdAsync(
            "SELECT full_report_price, per_component_price, min_firms, min_data_points FROM credil.config WHERE id = 1"))
        await using (var r = await cmd.ExecuteReaderAsync())
            if (await r.ReadAsync())
            {
                fullPrice = Convert.ToDecimal(r["full_report_price"]);
                perComp = Convert.ToDecimal(r["per_component_price"]);
                minFirms = Convert.ToInt32(r["min_firms"]);
                minPts = Convert.ToInt32(r["min_data_points"]);
            }

        return Ok(new
        {
            enabled,
            fullReportPrice = fullPrice,
            perComponentPrice = perComp,
            minFirms, minDataPoints = minPts,
            components = AllComponents
        });
    }

    private decimal PriceFor(string[] comps, decimal fullPrice, decimal perComp)
    {
        var n = comps.Length;
        if (n >= AllComponents.Length) return fullPrice;         // saare = full report rate
        return Math.Min(fullPrice, perComp * n);
    }

    // ---- 1) Request banao + OTP bhejo ----
    [HttpPost("request")]
    public async Task<IActionResult> CreateRequest([FromBody] CredilRequestDto dto)
    {
        // Feature enabled?
        await using (var cmd = await CmdAsync("SELECT COALESCE(credil_enabled,false) FROM platform.firms WHERE id = @f"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            if ((await cmd.ExecuteScalarAsync()) is not bool en || !en)
                return BadRequest(new { error = "CREDIL feature aapke liye enable nahi hai. Anjaninex admin se enable karwayein." });
        }

        var gst = (dto.TargetGst ?? "").Trim().ToUpperInvariant();
        if (gst.Length < 10) return BadRequest(new { error = "Sahi GST number daalein." });

        var comps = (dto.Components ?? Array.Empty<string>())
            .Select(c => c.Trim().ToLowerInvariant())
            .Where(c => AllComponents.Contains(c))
            .Distinct().ToArray();
        if (comps.Length == 0) comps = AllComponents; // kuch na chuna -> full report

        // Party ka registered mobile network se (kisi bhi firm ke contact se, GST match).
        string? mobile = null; string? partyName = null;
        await using (var cmd = await CmdAsync(
            @"SELECT COALESCE(phone_primary, wa_buyer, wa_supplier) AS mob, display_name
              FROM core.contacts
              WHERE upper(replace(gst_number,' ','')) = @g
                AND COALESCE(phone_primary, wa_buyer, wa_supplier) IS NOT NULL
                AND deleted_at IS NULL
              ORDER BY updated_at DESC NULLS LAST LIMIT 1"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("g", gst));
            await using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync()) { mobile = r["mob"] as string; partyName = r["display_name"] as string; }
        }

        var digits = new string((mobile ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length < 10)
            return BadRequest(new { error = "Is GST ke liye network me koi registered mobile nahi mila. OTP consent nahi bhej sakte." });

        // Rate card.
        decimal fullPrice = 500, perComp = 150;
        await using (var cmd = await CmdAsync("SELECT full_report_price, per_component_price FROM credil.config WHERE id = 1"))
        await using (var r = await cmd.ExecuteReaderAsync())
            if (await r.ReadAsync()) { fullPrice = Convert.ToDecimal(r["full_report_price"]); perComp = Convert.ToDecimal(r["per_component_price"]); }
        var amount = PriceFor(comps, fullPrice, perComp);

        // OTP: 6-digit, SHA256 hash, 10 min expiry.
        var otp = RandomNumberGenerator.GetInt32(100000, 999999).ToString();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(otp))).ToLowerInvariant();
        var masked = digits.Length >= 4 ? new string('X', digits.Length - 4) + digits[^4..] : digits;

        Guid reqId;
        await using (var cmd = await CmdAsync(
            @"INSERT INTO credil.report_requests
                (requesting_firm_id, requested_by, target_gst, target_group_id, components,
                 otp_hash, otp_sent_to, otp_expires_at, amount, status)
              VALUES (@firm, @uid, @gst, @grp, @comps::jsonb, @oh, @mask, now() + interval '10 minutes', @amt, 'pending')
              RETURNING id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("firm", CurrentFirmId));
            cmd.Parameters.Add(new NpgsqlParameter("uid", (object?)CurrentUserId ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("gst", gst));
            cmd.Parameters.Add(new NpgsqlParameter("grp", (object?)dto.GroupId ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("comps", JsonSerializer.Serialize(comps)) { NpgsqlDbType = NpgsqlDbType.Jsonb });
            cmd.Parameters.Add(new NpgsqlParameter("oh", otpHash));
            cmd.Parameters.Add(new NpgsqlParameter("mask", masked));
            cmd.Parameters.Add(new NpgsqlParameter("amt", amount));
            reqId = (Guid)(await cmd.ExecuteScalarAsync())!;
        }

        // OTP WhatsApp pe bhejo (best-effort).
        var sent = await TrySendOtpWhatsApp(digits, otp, partyName);

        // Sirf platform-admin (Anjaninex testing) ko OTP preview dikhao — real firm ko nahi.
        string? otpPreview = await IsPlatformAdmin() ? otp : null;

        return Ok(new
        {
            requestId = reqId,
            maskedMobile = masked,
            amount,
            components = comps,
            otpSent = sent,
            partyName,
            otpPreview   // null for normal firms
        });
    }

    private async Task<bool> TrySendOtpWhatsApp(string toDigits, string otp, string? partyName)
    {
        try
        {
            string? baseUrl = null, apiKey = null; bool enabled = false;
            await using (var cmd = await CmdAsync("SELECT base_url, api_key, enabled FROM platform.wa_provider_settings WHERE id = 1"))
            await using (var r = await cmd.ExecuteReaderAsync())
                if (await r.ReadAsync()) { baseUrl = r["base_url"] as string; apiKey = r["api_key"] as string; enabled = r["enabled"] is bool b && b; }
            if (!enabled || string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey)) return false;

            // Sender: koi bhi enabled Anjaninex WABA number.
            string? sender = null;
            await using (var cmd = await CmdAsync(
                "SELECT waba_number FROM platform.firm_whatsapp WHERE enabled = true AND waba_number IS NOT NULL ORDER BY updated_at DESC LIMIT 1"))
                sender = (await cmd.ExecuteScalarAsync()) as string;
            if (string.IsNullOrWhiteSpace(sender)) return false;

            var msg = $"CREDIL consent OTP: {otp}\nAapki CREDIL (payment/trust) report kisi ne Anjaninex network par request ki hai. Sehmati ho to yeh OTP unhe batayein. 10 min me expire. Aapne request nahi ki to ignore karein.";
            var bodyJson = JsonSerializer.Serialize(new
            {
                messaging_product = "whatsapp",
                recipient_type = "individual",
                to = toDigits,
                type = "text",
                text = new { body = msg }
            });
            var url = baseUrl!.TrimEnd('/') + "/wrapper/waba/message";
            using var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.TryAddWithoutValidation("key", apiKey);
            req.Headers.TryAddWithoutValidation("wabaNumber", sender);
            req.Content = new StringContent(bodyJson, Encoding.UTF8, "application/json");
            var resp = await Http.SendAsync(req);
            return resp.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    // ---- 2) OTP verify ----
    [HttpPost("request/{id}/verify-otp")]
    public async Task<IActionResult> VerifyOtp(Guid id, [FromBody] CredilOtpDto dto)
    {
        string? hash = null; DateTime? exp = null; bool verified = false; int attempts = 0;
        await using (var cmd = await CmdAsync(
            @"SELECT otp_hash, otp_expires_at, otp_verified, COALESCE(otp_attempts,0) AS att
              FROM credil.report_requests WHERE id = @id AND requesting_firm_id = @f"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync()) return NotFound(new { error = "Request nahi mila." });
            hash = r["otp_hash"] as string;
            exp = r["otp_expires_at"] as DateTime?;
            verified = r["otp_verified"] is bool b && b;
            attempts = Convert.ToInt32(r["att"]);
        }
        if (verified) return Ok(new { ok = true, already = true });
        if (attempts >= 5) return BadRequest(new { error = "Bahut zyada galat koshish. Nayi request banayein." });
        if (exp == null || exp.Value < DateTime.UtcNow)
            return BadRequest(new { error = "OTP expire ho gaya. Nayi request banayein." });

        var given = Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes((dto.Otp ?? "").Trim()))).ToLowerInvariant();
        if (!string.Equals(given, hash, StringComparison.OrdinalIgnoreCase))
        {
            await using var up = await CmdAsync("UPDATE credil.report_requests SET otp_attempts = COALESCE(otp_attempts,0)+1 WHERE id = @id");
            up.Parameters.Add(new NpgsqlParameter("id", id));
            await up.ExecuteNonQueryAsync();
            return BadRequest(new { error = "OTP galat hai." });
        }

        await using (var up = await CmdAsync(
            "UPDATE credil.report_requests SET otp_verified = true, status = 'otp_ok' WHERE id = @id AND status = 'pending'"))
        {
            up.Parameters.Add(new NpgsqlParameter("id", id));
            await up.ExecuteNonQueryAsync();
        }
        return Ok(new { ok = true });
    }

    // ---- 3) Razorpay order (report fee) ----
    private async Task<(string? keyId, string? secret, bool enabled)> LoadKeysAsync()
    {
        await using var cmd = await CmdAsync(
            "SELECT razorpay_key_id, razorpay_key_secret, gateway_enabled FROM platform.billing_settings WHERE id = 1");
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return (null, null, false);
        return (r["razorpay_key_id"] as string, r["razorpay_key_secret"] as string, r["gateway_enabled"] is bool b && b);
    }

    [HttpPost("request/{id}/pay/order")]
    public async Task<IActionResult> PayOrder(Guid id)
    {
        decimal amount = 0; string status = "";
        await using (var cmd = await CmdAsync(
            "SELECT amount, status FROM credil.report_requests WHERE id = @id AND requesting_firm_id = @f"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync()) return NotFound(new { error = "Request nahi mila." });
            amount = Convert.ToDecimal(r["amount"]); status = (r["status"] as string) ?? "";
        }
        if (status is not ("otp_ok" or "paid"))
            return BadRequest(new { error = "Pehle OTP verify karein." });
        if (amount <= 0) return BadRequest(new { error = "Amount galat hai." });

        var (keyId, secret, enabled) = await LoadKeysAsync();
        if (!enabled || string.IsNullOrWhiteSpace(keyId) || string.IsNullOrWhiteSpace(secret))
            return BadRequest(new { error = "Razorpay gateway configure/enable nahi hai." });

        long paise = (long)Math.Round(amount * 100m);
        var body = JsonSerializer.Serialize(new
        {
            amount = paise, currency = "INR",
            receipt = $"credil_{id.ToString("N").Substring(0, 8)}_{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}"
        });
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.razorpay.com/v1/orders");
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic",
            Convert.ToBase64String(Encoding.ASCII.GetBytes($"{keyId}:{secret}")));
        req.Content = new StringContent(body, Encoding.UTF8, "application/json");

        HttpResponseMessage resp; string text;
        try { resp = await Http.SendAsync(req); text = await resp.Content.ReadAsStringAsync(); }
        catch (Exception ex) { return BadRequest(new { error = "Razorpay se connect nahi ho paya: " + ex.Message }); }
        if (!resp.IsSuccessStatusCode) return BadRequest(new { error = "Razorpay order fail. " + text });

        using var doc = JsonDocument.Parse(text);
        var orderId = doc.RootElement.GetProperty("id").GetString();
        var firm = await _db.Firms.Where(f => f.Id == CurrentFirmId)
            .Select(f => new { f.ContactEmail, f.ContactPhone }).FirstOrDefaultAsync();

        return Ok(new
        {
            orderId, keyId, amount = paise, currency = "INR", name = "CREDIL Report",
            email = firm?.ContactEmail, contact = firm?.ContactPhone
        });
    }

    // ---- 4) Payment verify -> status 'paid' (admin approval pending) ----
    [HttpPost("request/{id}/pay/verify")]
    public async Task<IActionResult> PayVerify(Guid id, [FromBody] CredilPayVerifyDto dto)
    {
        var (_, secret, _) = await LoadKeysAsync();
        if (string.IsNullOrWhiteSpace(secret)) return BadRequest(new { error = "Gateway secret set nahi hai." });
        if (string.IsNullOrWhiteSpace(dto.OrderId) || string.IsNullOrWhiteSpace(dto.PaymentId) || string.IsNullOrWhiteSpace(dto.Signature))
            return BadRequest(new { error = "Payment details adhoore hain." });

        var payload = $"{dto.OrderId}|{dto.PaymentId}";
        using var hmac = new HMACSHA256(Encoding.ASCII.GetBytes(secret));
        var expected = Convert.ToHexString(hmac.ComputeHash(Encoding.ASCII.GetBytes(payload))).ToLowerInvariant();
        if (!string.Equals(expected, dto.Signature, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Payment verification fail." });

        await using (var cmd = await CmdAsync(
            @"UPDATE credil.report_requests
              SET paid = true, payment_ref = @ref, status = 'paid'
              WHERE id = @id AND requesting_firm_id = @f AND status IN ('otp_ok','paid')"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("ref", dto.PaymentId));
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            var n = await cmd.ExecuteNonQueryAsync();
            if (n == 0) return BadRequest(new { error = "Request is state me pay nahi ho sakta. OTP verify hua tha?" });
        }
        return Ok(new { success = true });
    }

    // ---- 5) My requests / reports ----
    [HttpGet("requests")]
    public async Task<IActionResult> MyRequests()
    {
        var list = new List<object>();
        await using var cmd = await CmdAsync(
            @"SELECT id, target_gst, components, amount, status, paid, otp_verified,
                     created_at, reviewed_at, review_note, (report_json IS NOT NULL) AS has_report
              FROM credil.report_requests
              WHERE requesting_firm_id = @f
              ORDER BY created_at DESC LIMIT 100");
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = (Guid)r["id"],
                targetGst = r["target_gst"] as string,
                components = JsonSerializer.Deserialize<string[]>(r["components"]?.ToString() ?? "[]"),
                amount = Convert.ToDecimal(r["amount"]),
                status = r["status"] as string,
                paid = r["paid"] is bool p && p,
                otpVerified = r["otp_verified"] is bool o && o,
                createdAt = Convert.ToDateTime(r["created_at"]),
                reviewedAt = r["reviewed_at"] as DateTime?,
                reviewNote = r["review_note"] as string,
                hasReport = r["has_report"] is bool h && h
            });
        }
        return Ok(list);
    }

    // ---- 6) Report (only after admin delivered) ----
    [HttpGet("report/{id}")]
    public async Task<IActionResult> GetReport(Guid id)
    {
        await using var cmd = await CmdAsync(
            @"SELECT status, report_json, target_gst, created_at, reviewed_at
              FROM credil.report_requests WHERE id = @id AND requesting_firm_id = @f");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return NotFound(new { error = "Report nahi mili." });
        var status = r["status"] as string;
        var json = r["report_json"]?.ToString();
        if (status != "delivered" || string.IsNullOrWhiteSpace(json))
            return BadRequest(new { error = "Report abhi ready nahi hai (admin approval pending)." });

        using var doc = JsonDocument.Parse(json);
        return Ok(doc.RootElement.Clone());
    }
}
