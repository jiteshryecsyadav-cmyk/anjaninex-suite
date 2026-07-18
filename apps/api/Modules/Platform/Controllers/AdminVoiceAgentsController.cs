using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// Multi-tenant Voice Agent — Anjaninex super-admin har firm ka AI phone agent set karta hai
// (naam, script/prompt, awaaz, bhasha, Exotel number, ON/OFF). Sarvam self-host bridge inhi
// values ko platform.voice_agents se load karta hai. Firm khud edit nahi karti.
public record SaveVoiceAgentDto(
    bool Enabled, string? AgentName, string? FirstMessage, string? SystemPrompt,
    string? Language, string? VoiceSpeaker, string? ExotelNumber);

[ApiController]
[Route("api/admin/voice-agents")]
[Authorize]
public class AdminVoiceAgentsController : ControllerBase
{
    private readonly AppDbContext _db;
    public AdminVoiceAgentsController(AppDbContext db) => _db = db;

    private Guid? CurrentUserId => Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // Saari firms + unki voice-agent config (LEFT JOIN so config-less firms bhi dikhe).
    [HttpGet]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> List()
    {
        var list = new List<object>();
        await using var cmd = await CmdAsync(
            @"SELECT f.id AS firm_id, f.name AS firm_name,
                     COALESCE(v.enabled,false) AS enabled,
                     v.agent_name, v.first_message, v.system_prompt,
                     COALESCE(v.language,'hi-IN') AS language,
                     COALESCE(v.voice_speaker,'anushka') AS voice_speaker,
                     v.exotel_number
              FROM platform.firms f
              LEFT JOIN platform.voice_agents v ON v.firm_id = f.id
              ORDER BY f.name");
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                firmId = (Guid)r["firm_id"],
                firmName = r["firm_name"] as string,
                enabled = r["enabled"] is bool b && b,
                agentName = r["agent_name"] as string ?? "Riddhi",
                firstMessage = r["first_message"] as string ?? "",
                systemPrompt = r["system_prompt"] as string ?? "",
                language = r["language"] as string,
                voiceSpeaker = r["voice_speaker"] as string,
                exotelNumber = r["exotel_number"] as string ?? ""
            });
        }
        return Ok(list);
    }

    // Per-firm config save (upsert).
    [HttpPut("{firmId}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Save(Guid firmId, [FromBody] SaveVoiceAgentDto dto)
    {
        await using var cmd = await CmdAsync(
            @"INSERT INTO platform.voice_agents
                (firm_id, enabled, agent_name, first_message, system_prompt,
                 language, voice_speaker, exotel_number, updated_at, updated_by)
              VALUES (@fid, @en, @name, @first, @prompt, @lang, @spk, @num, now(), @uid)
              ON CONFLICT (firm_id) DO UPDATE SET
                enabled       = EXCLUDED.enabled,
                agent_name    = EXCLUDED.agent_name,
                first_message = EXCLUDED.first_message,
                system_prompt = EXCLUDED.system_prompt,
                language      = EXCLUDED.language,
                voice_speaker = EXCLUDED.voice_speaker,
                exotel_number = EXCLUDED.exotel_number,
                updated_at    = now(),
                updated_by    = EXCLUDED.updated_by");
        cmd.Parameters.Add(new NpgsqlParameter("fid", firmId));
        cmd.Parameters.Add(new NpgsqlParameter("en", dto.Enabled));
        cmd.Parameters.Add(new NpgsqlParameter("name", (object?)(dto.AgentName?.Trim()) ?? "Riddhi"));
        cmd.Parameters.Add(new NpgsqlParameter("first", (object?)dto.FirstMessage ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("prompt", (object?)dto.SystemPrompt ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("lang", (object?)(dto.Language ?? "hi-IN")));
        cmd.Parameters.Add(new NpgsqlParameter("spk", (object?)(dto.VoiceSpeaker ?? "anushka")));
        cmd.Parameters.Add(new NpgsqlParameter("num", (object?)dto.ExotelNumber ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("uid", (object?)CurrentUserId ?? DBNull.Value));
        await cmd.ExecuteNonQueryAsync();
        return Ok(new { success = true });
    }
}
