using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// FIRM FIELD SETTINGS — har firm apni screen ke fields khud tay kare.
//
// Fields ka CATALOG frontend ki registry me hai (field-registry.ts) — key,
// label, type, default. Yahan sirf us firm ka BADLAAV store hota hai:
// visible / required / label. Jo row nahi hai, uska registry wala default.
//
// Isliye naya field jodne par is API ko chhedna nahi padta — registry me ek
// line jodo, tick har firm ke Settings page me apne aap aa jayega.
//
// screen + field_key = '*'  →  poori screen ka on/off.
// =============================================================================

public record FieldSettingDto(string Screen, string FieldKey, bool? Visible, bool? Required, string? Label);

/// Firm ka apna panel — firm owner apni hi firm ki settings padhta/badalta hai.
[ApiController]
[Route("api/firm-fields")]
[Authorize]
public class FirmFieldSettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    public FirmFieldSettingsController(AppDbContext db) => _db = db;

    private Guid FirmId =>
        Guid.TryParse(User.FindFirst("firm_id")?.Value, out var f)
            ? f
            : throw new InvalidOperationException("Firm nahi mili — dobara login karein.");

    private Guid? UserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    /// Is firm ke saare badlaav. App startup par ek baar load hota hai.
    [HttpGet]
    public async Task<IActionResult> Mine() => Ok(await ReadAsync(_db, FirmId));

    /// Firm owner apni screen set kare. Poori screen ki settings ek saath aati hain —
    /// jo bheja wo rakha jata hai, baaki (us screen ke) hata diye jaate hain.
    [HttpPut("{screen}")]
    [HasPermission("settings.fields.edit.firm")]
    public async Task<IActionResult> SaveMine(string screen, [FromBody] List<FieldSettingDto> rows)
    {
        await SaveAsync(_db, FirmId, screen, rows, UserId);
        return Ok(new { saved = rows.Count });
    }

    // ---------------------------------------------------------------------
    // Shared helpers — sadmin controller bhi yahi use karta hai
    // ---------------------------------------------------------------------

    internal static async Task<List<FieldSettingDto>> ReadAsync(AppDbContext db, Guid firmId)
    {
        var list = new List<FieldSettingDto>();
        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT screen, field_key, visible, required, label
              FROM platform.firm_field_settings
             WHERE firm_id = @f
             ORDER BY screen, field_key";
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add(new FieldSettingDto(
                reader.GetString(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetBoolean(2),
                reader.IsDBNull(3) ? null : reader.GetBoolean(3),
                reader.IsDBNull(4) ? null : reader.GetString(4)));
        return list;
    }

    internal static async Task SaveAsync(
        AppDbContext db, Guid firmId, string screen, List<FieldSettingDto> rows, Guid? userId)
    {
        if (string.IsNullOrWhiteSpace(screen))
            throw new ArgumentException("Screen ka naam nahi mila.");

        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();

        // Poori screen ek saath badalti hai: pehle us screen ke purane rows hatao,
        // fir naye daalo. Isse "tick hata diya" wala case bhi apne aap sambhal jata hai.
        await using (var del = conn.CreateCommand())
        {
            del.CommandText =
                "DELETE FROM platform.firm_field_settings WHERE firm_id = @f AND screen = @s";
            del.Parameters.Add(new NpgsqlParameter("f", firmId));
            del.Parameters.Add(new NpgsqlParameter("s", screen));
            await del.ExecuteNonQueryAsync();
        }

        foreach (var r in rows)
        {
            // Jis row me kuch bhi badla hua nahi hai use save karne ka fayda nahi —
            // registry ka default hi chalega. Table bhi halki rahegi.
            if (r.Visible is null && r.Required is null && string.IsNullOrWhiteSpace(r.Label))
                continue;

            await using var ins = conn.CreateCommand();
            ins.CommandText = @"
                INSERT INTO platform.firm_field_settings
                       (firm_id, screen, field_key, visible, required, label, updated_at, updated_by)
                VALUES (@f, @s, @k, @v, @r, @l, now(), @u)
                ON CONFLICT (firm_id, screen, field_key) DO UPDATE
                   SET visible = EXCLUDED.visible, required = EXCLUDED.required,
                       label = EXCLUDED.label, updated_at = now(), updated_by = EXCLUDED.updated_by";
            ins.Parameters.Add(new NpgsqlParameter("f", firmId));
            ins.Parameters.Add(new NpgsqlParameter("s", screen));
            ins.Parameters.Add(new NpgsqlParameter("k", r.FieldKey));
            ins.Parameters.Add(new NpgsqlParameter("v", (object?)r.Visible ?? DBNull.Value));
            ins.Parameters.Add(new NpgsqlParameter("r", (object?)r.Required ?? DBNull.Value));
            ins.Parameters.Add(new NpgsqlParameter("l",
                string.IsNullOrWhiteSpace(r.Label) ? DBNull.Value : r.Label.Trim()));
            ins.Parameters.Add(new NpgsqlParameter("u", (object?)userId ?? DBNull.Value));
            await ins.ExecuteNonQueryAsync();
        }
    }
}

/// Anjaninex sadmin — kisi bhi firm ki settings dekhe/badle, aur ek firm se
/// doosri me copy kare (naya client set karne me sabse zyada kaam aata hai).
[ApiController]
[Route("api/admin/firm-fields")]
[Authorize]
[HasPermission("platform.firm.view.platform")]
public class AdminFirmFieldSettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    public AdminFirmFieldSettingsController(AppDbContext db) => _db = db;

    private Guid? UserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    [HttpGet("{firmId:guid}")]
    public async Task<IActionResult> Get(Guid firmId)
        => Ok(await FirmFieldSettingsController.ReadAsync(_db, firmId));

    [HttpPut("{firmId:guid}/{screen}")]
    public async Task<IActionResult> Save(Guid firmId, string screen, [FromBody] List<FieldSettingDto> rows)
    {
        await FirmFieldSettingsController.SaveAsync(_db, firmId, screen, rows, UserId);
        return Ok(new { saved = rows.Count });
    }

    /// Ek firm ka poora setup doosri firm me copy — naya client 1 click me taiyaar.
    [HttpPost("copy")]
    public async Task<IActionResult> Copy([FromQuery] Guid fromFirmId, [FromQuery] Guid toFirmId,
                                          [FromQuery] string? screen = null)
    {
        if (fromFirmId == toFirmId)
            throw new ArgumentException("Ek hi firm me copy nahi kar sakte — do alag firms chuniye.");

        var rows = await FirmFieldSettingsController.ReadAsync(_db, fromFirmId);
        if (!string.IsNullOrWhiteSpace(screen))
            rows = rows.Where(r => r.Screen == screen).ToList();

        foreach (var g in rows.GroupBy(r => r.Screen))
            await FirmFieldSettingsController.SaveAsync(_db, toFirmId, g.Key, g.ToList(), UserId);

        return Ok(new { copied = rows.Count, screens = rows.Select(r => r.Screen).Distinct().Count() });
    }
}
