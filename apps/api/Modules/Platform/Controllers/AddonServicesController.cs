using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// ADD-ON SERVICES (Anjaninex super-admin)
// Extra services ka catalog: rate set + add / edit / delete.
// Firm in services ko choose karke use karti hai (FirmBillingController).
// =============================================================================
public record AddonServiceDto(
    Guid Id, string Code, string Name, string? Icon, string? Unit,
    decimal Rate, string? FreeNote, string BillingType, bool Active,
    bool AllowSelf, int SortOrder);

public record SaveAddonServiceDto(
    string? Code, string Name, string? Icon, string? Unit,
    decimal Rate, string? FreeNote, string? BillingType, bool Active,
    bool AllowSelf, int SortOrder);

[ApiController]
[Route("api/admin/addon-services")]
[Authorize]
public class AddonServicesController : ControllerBase
{
    private readonly AppDbContext _db;
    public AddonServicesController(AppDbContext db) => _db = db;

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    private static AddonServiceDto Read(NpgsqlDataReader r) => new(
        (Guid)r["id"], (string)r["code"], (string)r["name"],
        r["icon"] as string, r["unit"] as string,
        Convert.ToDecimal(r["rate"]), r["free_note"] as string,
        (string)r["billing_type"], (bool)r["active"], (bool)r["allow_self"],
        Convert.ToInt32(r["sort_order"]));

    // ── LIST (admin) ──────────────────────────────────────────────────────
    [HttpGet]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> List()
    {
        await using var cmd = await CmdAsync(
            @"SELECT id, code, name, icon, unit, rate, free_note, billing_type,
                     active, allow_self, sort_order
              FROM platform.addon_services ORDER BY sort_order, name");
        var list = new List<AddonServiceDto>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync()) list.Add(Read((NpgsqlDataReader)r));
        return Ok(list);
    }

    // ── CREATE ────────────────────────────────────────────────────────────
    [HttpPost]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Create([FromBody] SaveAddonServiceDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { error = "Service ka naam chahiye." });

        var code = string.IsNullOrWhiteSpace(dto.Code)
            ? System.Text.RegularExpressions.Regex.Replace(dto.Name.Trim().ToLowerInvariant(), "[^a-z0-9]+", "_").Trim('_')
            : dto.Code.Trim().ToLowerInvariant();

        await using var cmd = await CmdAsync(
            @"INSERT INTO platform.addon_services
                (code, name, icon, unit, rate, free_note, billing_type, active, allow_self, sort_order)
              VALUES (@code,@name,@icon,@unit,@rate,@note,@btype,@active,@self,@sort)
              RETURNING id, code, name, icon, unit, rate, free_note, billing_type, active, allow_self, sort_order");
        Bind(cmd, code, dto);
        await using var r = await cmd.ExecuteReaderAsync();
        await r.ReadAsync();
        return Ok(Read((NpgsqlDataReader)r));
    }

    // ── UPDATE ────────────────────────────────────────────────────────────
    [HttpPut("{id:guid}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SaveAddonServiceDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { error = "Service ka naam chahiye." });

        await using var cmd = await CmdAsync(
            @"UPDATE platform.addon_services SET
                name=@name, icon=@icon, unit=@unit, rate=@rate, free_note=@note,
                billing_type=@btype, active=@active, allow_self=@self, sort_order=@sort,
                updated_at=now()
              WHERE id=@id
              RETURNING id, code, name, icon, unit, rate, free_note, billing_type, active, allow_self, sort_order");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        Bind(cmd, null, dto);   // code update nahi hota (stable key)
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return NotFound(new { error = "Service nahi mili." });
        return Ok(Read((NpgsqlDataReader)r));
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    [HttpDelete("{id:guid}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await using var cmd = await CmdAsync(
            "DELETE FROM platform.addon_services WHERE id=@id");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        var n = await cmd.ExecuteNonQueryAsync();
        if (n == 0) return NotFound(new { error = "Service nahi mili." });
        return Ok(new { success = true });
    }

    // code null ho to code parameter bind na karo (update path)
    private static void Bind(NpgsqlCommand cmd, string? code, SaveAddonServiceDto dto)
    {
        if (code != null) cmd.Parameters.Add(new NpgsqlParameter("code", code));
        void P(string n, object? v) => cmd.Parameters.Add(new NpgsqlParameter(n, v ?? DBNull.Value));
        P("name", dto.Name.Trim());
        P("icon", dto.Icon);
        P("unit", dto.Unit);
        cmd.Parameters.Add(new NpgsqlParameter("rate", dto.Rate));
        P("note", dto.FreeNote);
        P("btype", string.IsNullOrWhiteSpace(dto.BillingType) ? "per_use" : dto.BillingType);
        cmd.Parameters.Add(new NpgsqlParameter("active", dto.Active));
        cmd.Parameters.Add(new NpgsqlParameter("self", dto.AllowSelf));
        cmd.Parameters.Add(new NpgsqlParameter("sort", dto.SortOrder));
    }
}
