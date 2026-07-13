using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// FEATURE FLAGS — Anjaninex sadmin ka pilot/rollout switch-board.
// Naya feature pehle pilot firm (Riddhi) me on karo, test karo, fir
// "Sab firms" ka master switch on kar do. Code dobara chhedne ki zaroorat nahi.
// =============================================================================

[ApiController]
[Route("api/admin/feature-flags")]
[Authorize]
[HasPermission("platform.firm.view.platform")]
public class AdminFeatureFlagsController : ControllerBase
{
    private readonly AppDbContext _db;
    public AdminFeatureFlagsController(AppDbContext db) => _db = db;

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    /// <summary>Saare flags + har flag ki pilot firms + saari firms (dropdown ke liye).</summary>
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var flags = new List<Dictionary<string, object?>>();
        // Ek connection par ek waqt me EK hi command — isliye har reader brace-scope me.
        await using (var cmd = await CmdAsync(@"
            SELECT key, name, description, enabled_all FROM platform.feature_flags ORDER BY created_at"))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
                flags.Add(new Dictionary<string, object?>
                {
                    ["key"] = r.GetString(0),
                    ["name"] = r.GetString(1),
                    ["description"] = r.IsDBNull(2) ? null : r.GetString(2),
                    ["enabledAll"] = r.GetBoolean(3),
                    ["firmIds"] = new List<Guid>()
                });
        }

        await using (var cmd = await CmdAsync(@"
            SELECT flag_key, firm_id FROM platform.feature_flag_firms"))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                var key = r.GetString(0);
                var flag = flags.FirstOrDefault(f => (string)f["key"]! == key);
                if (flag != null) ((List<Guid>)flag["firmIds"]!).Add(r.GetGuid(1));
            }
        }

        var firms = new List<object>();
        await using (var cmd = await CmdAsync(@"
            SELECT id, name FROM platform.firms ORDER BY name"))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
                firms.Add(new { id = r.GetGuid(0), name = r.GetString(1) });
        }

        return Ok(new { flags, firms });
    }

    public record ToggleAllDto(bool Enabled);

    /// <summary>Master switch: feature SAB firms ke liye on/off.</summary>
    [HttpPost("{key}/all")]
    public async Task<IActionResult> ToggleAll(string key, [FromBody] ToggleAllDto dto)
    {
        await using var cmd = await CmdAsync(
            "UPDATE platform.feature_flags SET enabled_all = @e WHERE key = @k");
        cmd.Parameters.Add(new NpgsqlParameter("e", dto.Enabled));
        cmd.Parameters.Add(new NpgsqlParameter("k", key));
        var n = await cmd.ExecuteNonQueryAsync();
        return n == 0 ? NotFound(new { error = "Flag nahi mila" }) : Ok(new { ok = true });
    }

    public record ToggleFirmDto(Guid FirmId, bool Enabled);

    /// <summary>Pilot firm add/remove — is firm ke liye feature on/off.</summary>
    [HttpPost("{key}/firm")]
    public async Task<IActionResult> ToggleFirm(string key, [FromBody] ToggleFirmDto dto)
    {
        if (dto.Enabled)
        {
            await using var cmd = await CmdAsync(@"
                INSERT INTO platform.feature_flag_firms (flag_key, firm_id)
                VALUES (@k, @f) ON CONFLICT DO NOTHING");
            cmd.Parameters.Add(new NpgsqlParameter("k", key));
            cmd.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            await cmd.ExecuteNonQueryAsync();
        }
        else
        {
            await using var cmd = await CmdAsync(
                "DELETE FROM platform.feature_flag_firms WHERE flag_key = @k AND firm_id = @f");
            cmd.Parameters.Add(new NpgsqlParameter("k", key));
            cmd.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            await cmd.ExecuteNonQueryAsync();
        }
        return Ok(new { ok = true });
    }
}
