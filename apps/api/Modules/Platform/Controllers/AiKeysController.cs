using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// PLATFORM AI KEYS (Anjaninex super-admin) — SAB firms ke liye common.
// Gemini / Claude / OpenAI keys EK BAAR yahan set hoti hain. Saari firms ke
// bill + order scan inhi platform keys se chalte hain (default). Firm apni BYOK
// key daale to wo override karti hai.
// Same single-row table platform.billing_settings (id = 1) — billing settings
// jaise hi pattern (raw SQL, masked GET, "keep old if blank" PUT).
// =============================================================================
public record AiKeysDto(
    bool GeminiSet, string GeminiLast4,
    bool ClaudeSet, string ClaudeLast4,
    bool OpenaiSet, string OpenaiLast4);

public record SaveAiKeysDto(string? GeminiKey, string? ClaudeKey, string? OpenaiKey);

[ApiController]
[Route("api/admin/ai-keys")]
[Authorize]
public class AiKeysController : ControllerBase
{
    private readonly AppDbContext _db;
    public AiKeysController(AppDbContext db) => _db = db;

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // Last 4 chars only — full key kabhi return nahi hota.
    private static string Last4(object? v)
    {
        var s = v as string;
        if (string.IsNullOrEmpty(s)) return "";
        return s.Length <= 4 ? s : s.Substring(s.Length - 4);
    }

    [HttpGet]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Get()
    {
        await using var cmd = await CmdAsync(
            @"SELECT ai_gemini_key, ai_claude_key, ai_openai_key
              FROM platform.billing_settings WHERE id = 1");
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync())
            return Ok(new AiKeysDto(false, "", false, "", false, ""));

        var gemini = r["ai_gemini_key"] as string;
        var claude = r["ai_claude_key"] as string;
        var openai = r["ai_openai_key"] as string;

        return Ok(new AiKeysDto(
            !string.IsNullOrEmpty(gemini), Last4(gemini),
            !string.IsNullOrEmpty(claude), Last4(claude),
            !string.IsNullOrEmpty(openai), Last4(openai)));
    }

    [HttpPut]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Save([FromBody] SaveAiKeysDto dto)
    {
        // Har key tabhi update karo jab naya non-empty bheja gaya ho (warna purana rahe).
        // Same "keep old if blank" pattern jaise razorpay_key_secret me hai.
        await using var cmd = await CmdAsync(
            @"UPDATE platform.billing_settings SET
                ai_gemini_key = CASE WHEN @gemini IS NULL OR @gemini = ''
                                     THEN ai_gemini_key ELSE @gemini END,
                ai_claude_key = CASE WHEN @claude IS NULL OR @claude = ''
                                     THEN ai_claude_key ELSE @claude END,
                ai_openai_key = CASE WHEN @openai IS NULL OR @openai = ''
                                     THEN ai_openai_key ELSE @openai END,
                updated_at = now()
              WHERE id = 1");
        // Blank ke liye EMPTY STRING bhejo (null nahi) — SQL '' ko "keep old" maanta hai.
        // null/DBNull bhejne par Postgres parameter ka type infer nahi kar pata → error 42P08
        // ("could not determine data type of parameter"). Explicit text param se ye theek.
        void P(string n, string v) => cmd.Parameters.Add(new NpgsqlParameter(n, NpgsqlTypes.NpgsqlDbType.Text) { Value = v });
        P("gemini", string.IsNullOrWhiteSpace(dto.GeminiKey) ? "" : dto.GeminiKey.Trim());
        P("claude", string.IsNullOrWhiteSpace(dto.ClaudeKey) ? "" : dto.ClaudeKey.Trim());
        P("openai", string.IsNullOrWhiteSpace(dto.OpenaiKey) ? "" : dto.OpenaiKey.Trim());
        await cmd.ExecuteNonQueryAsync();
        return await Get();
    }
}
