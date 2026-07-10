using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// BILLING SETTINGS (Anjaninex super-admin)
// UPI / Bank / QR jisse firms subscription payment karein. Razorpay keys future.
// Single-row table platform.billing_settings (id = 1).
// =============================================================================
public record BillingSettingsDto(
    string? PayeeName, string? UpiId, string? BankName, string? AccountName,
    string? AccountNo, string? Ifsc, string? QrImageUrl, string? Instructions,
    string? Gateway, string? RazorpayKeyId, bool GatewayEnabled, bool RazorpaySecretSet,
    Guid? BooksFirmId = null, string? Gstin = null);

public record SaveBillingSettingsDto(
    string? PayeeName, string? UpiId, string? BankName, string? AccountName,
    string? AccountNo, string? Ifsc, string? QrImageUrl, string? Instructions,
    string? Gateway, string? RazorpayKeyId, string? RazorpayKeySecret, bool GatewayEnabled,
    Guid? BooksFirmId = null, string? Gstin = null);

[ApiController]
[Route("api/admin/billing")]
[Authorize]
public class BillingSettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    public BillingSettingsController(AppDbContext db) => _db = db;

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
    public async Task<IActionResult> Get()
    {
        await using var cmd = await CmdAsync(
            @"SELECT payee_name, upi_id, bank_name, account_name, account_no, ifsc,
                     qr_image_url, instructions, gateway, razorpay_key_id, gateway_enabled,
                     (razorpay_key_secret IS NOT NULL AND razorpay_key_secret <> '') AS secret_set,
                     books_firm_id, gstin
              FROM platform.billing_settings WHERE id = 1");
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync())
            return Ok(new BillingSettingsDto(null, null, null, null, null, null, null, null, null, null, false, false, null, null));

        return Ok(new BillingSettingsDto(
            r["payee_name"] as string, r["upi_id"] as string, r["bank_name"] as string,
            r["account_name"] as string, r["account_no"] as string, r["ifsc"] as string,
            r["qr_image_url"] as string, r["instructions"] as string, r["gateway"] as string,
            r["razorpay_key_id"] as string,
            r["gateway_enabled"] is bool b && b,
            r["secret_set"] is bool s && s,
            r["books_firm_id"] as Guid?,
            r["gstin"] as string));
    }

    [HttpPut]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Save([FromBody] SaveBillingSettingsDto dto)
    {
        // Secret tabhi update karo jab naya non-empty bheja gaya ho (warna purana rahe).
        await using var cmd = await CmdAsync(
            @"UPDATE platform.billing_settings SET
                payee_name=@payee, upi_id=@upi, bank_name=@bank, account_name=@accName,
                account_no=@accNo, ifsc=@ifsc, qr_image_url=@qr, instructions=@instr,
                gateway=@gw, razorpay_key_id=@rzpId, gateway_enabled=@gwEn,
                razorpay_key_secret = CASE WHEN @rzpSecret::text IS NULL OR @rzpSecret::text = ''
                                           THEN razorpay_key_secret ELSE @rzpSecret::text END,
                books_firm_id = @booksFirm,
                gstin = @gstin,
                updated_at = now()
              WHERE id = 1");
        void P(string n, object? v) => cmd.Parameters.Add(new NpgsqlParameter(n, v ?? DBNull.Value));
        P("payee", dto.PayeeName); P("upi", dto.UpiId); P("bank", dto.BankName);
        P("accName", dto.AccountName); P("accNo", dto.AccountNo); P("ifsc", dto.Ifsc);
        P("qr", dto.QrImageUrl); P("instr", dto.Instructions); P("gw", dto.Gateway);
        P("rzpId", dto.RazorpayKeyId); P("rzpSecret", dto.RazorpayKeySecret);
        P("booksFirm", dto.BooksFirmId);
        P("gstin", string.IsNullOrWhiteSpace(dto.Gstin) ? null : dto.Gstin.Trim().ToUpperInvariant());
        cmd.Parameters.Add(new NpgsqlParameter("gwEn", dto.GatewayEnabled));
        await cmd.ExecuteNonQueryAsync();
        return await Get();
    }
}
