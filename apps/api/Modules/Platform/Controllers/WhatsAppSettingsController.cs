using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// WhatsApp provider (wabanow BSP) - super-admin. Central Anjaninex key + per-firm number mapping.
// Key kabhi return nahi hoti (sirf apiKeySet true/false).
public record WaSettingsDto(string? Provider, string? BaseUrl, bool Enabled, bool ApiKeySet);
public record SaveWaSettingsDto(string? Provider, string? BaseUrl, string? ApiKey, bool Enabled);
public record SaveFirmWaDto(string? WabaNumber, string? PhoneNumberId, string? WabaAccountId,
    string? BusinessId, string? DisplayName, bool Enabled);

[ApiController]
[Route("api/admin/whatsapp")]
[Authorize]
public class WhatsAppSettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    public WhatsAppSettingsController(AppDbContext db) => _db = db;

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // ---- Central provider settings ----
    [HttpGet("settings")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> GetSettings()
    {
        await using var cmd = await CmdAsync(
            @"SELECT provider, base_url, enabled,
                     (api_key IS NOT NULL AND api_key <> '') AS key_set
              FROM platform.wa_provider_settings WHERE id = 1");
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync())
            return Ok(new WaSettingsDto("wabanow", null, false, false));
        return Ok(new WaSettingsDto(
            r["provider"] as string, r["base_url"] as string,
            r["enabled"] is bool b && b, r["key_set"] is bool s && s));
    }

    [HttpPut("settings")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> SaveSettings([FromBody] SaveWaSettingsDto dto)
    {
        // Row ensure
        await using (var ins = await CmdAsync(
            "INSERT INTO platform.wa_provider_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING"))
            await ins.ExecuteNonQueryAsync();

        await using var cmd = await CmdAsync(
            @"UPDATE platform.wa_provider_settings SET
                provider = COALESCE(@prov, provider),
                base_url = @base,
                enabled  = @en,
                api_key  = CASE WHEN @key::text IS NULL OR @key::text = ''
                                THEN api_key ELSE @key::text END,
                updated_at = now()
              WHERE id = 1");
        cmd.Parameters.Add(new NpgsqlParameter("prov", (object?)dto.Provider ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("base", (object?)dto.BaseUrl ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("en", dto.Enabled));
        cmd.Parameters.Add(new NpgsqlParameter("key", (object?)dto.ApiKey ?? DBNull.Value));
        await cmd.ExecuteNonQueryAsync();
        return await GetSettings();
    }

    // ---- Per-firm number mapping ----
    [HttpGet("firms")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Firms()
    {
        await using var cmd = await CmdAsync(
            @"SELECT f.id AS firm_id, f.name AS firm_name,
                     w.waba_number, w.phone_number_id, w.waba_account_id, w.business_id,
                     w.display_name, w.status, COALESCE(w.enabled, false) AS enabled
              FROM platform.firms f
              LEFT JOIN platform.firm_whatsapp w ON w.firm_id = f.id
              ORDER BY f.name");
        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                firmId = (Guid)r["firm_id"],
                firmName = r["firm_name"] as string,
                wabaNumber = r["waba_number"] as string,
                phoneNumberId = r["phone_number_id"] as string,
                wabaAccountId = r["waba_account_id"] as string,
                businessId = r["business_id"] as string,
                displayName = r["display_name"] as string,
                status = r["status"] as string,
                enabled = r["enabled"] is bool b && b,
                linked = r["phone_number_id"] is string pid && !string.IsNullOrWhiteSpace(pid)
            });
        }
        return Ok(list);
    }

    [HttpPut("firms/{firmId}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> SaveFirm(Guid firmId, [FromBody] SaveFirmWaDto dto)
    {
        await using var cmd = await CmdAsync(
            @"INSERT INTO platform.firm_whatsapp
                (firm_id, waba_number, phone_number_id, waba_account_id, business_id, display_name, enabled, updated_at)
              VALUES (@fid, @num, @pid, @waid, @bid, @dn, @en, now())
              ON CONFLICT (firm_id) DO UPDATE SET
                waba_number = EXCLUDED.waba_number,
                phone_number_id = EXCLUDED.phone_number_id,
                waba_account_id = EXCLUDED.waba_account_id,
                business_id = EXCLUDED.business_id,
                display_name = EXCLUDED.display_name,
                enabled = EXCLUDED.enabled,
                updated_at = now()");
        cmd.Parameters.Add(new NpgsqlParameter("fid", firmId));
        cmd.Parameters.Add(new NpgsqlParameter("num", (object?)dto.WabaNumber ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("pid", (object?)dto.PhoneNumberId ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("waid", (object?)dto.WabaAccountId ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("bid", (object?)dto.BusinessId ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("dn", (object?)dto.DisplayName ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("en", dto.Enabled));
        await cmd.ExecuteNonQueryAsync();
        return Ok(new { success = true });
    }

    [HttpDelete("firms/{firmId}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> DeleteFirm(Guid firmId)
    {
        await using var cmd = await CmdAsync("DELETE FROM platform.firm_whatsapp WHERE firm_id = @fid");
        cmd.Parameters.Add(new NpgsqlParameter("fid", firmId));
        await cmd.ExecuteNonQueryAsync();
        return Ok(new { success = true });
    }
}
