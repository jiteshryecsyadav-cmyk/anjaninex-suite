using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Ai.Services;

// =============================================================================
// ASSISTANT (Anji) brain — Gemini Flash text Q&A for the help-desk.
// User koi bhi sawaal poochhe → us page ka help-content (context) + sawaal Gemini
// Flash ko jaata hai → simple Hindi/Hinglish me sahi (sirf is app ka) jawab.
// Sabse sasta engine (Gemini Flash). Key platform.billing_settings (ai_gemini_key)
// se aati hai, warna appsettings AI:GeminiApiKey. Key na ho / fail ho → null
// → frontend FAQ/keyword fallback par chala jaata hai (Anji kabhi nahi tootta).
// "AI" word kahin user ko nahi dikhta — naam "Assistant" hi rehta hai.
// =============================================================================
public interface IAnjiAssistantService
{
    // Returns a short answer string, or null if no key / Gemini failed
    // (frontend tab apne hand-written FAQ keyword-match par fallback karta hai).
    Task<string?> AnswerAsync(string question, string pageContext, string lang, CancellationToken ct);
}

public class AnjiAssistantService : IAnjiAssistantService
{
    private readonly AppDbContext _db;
    private readonly HttpClient _http;
    private readonly IOptionsMonitor<AiSettings> _opts;
    private readonly ILogger<AnjiAssistantService> _log;

    private const string Model = "gemini-2.5-flash";   // sabse sasta + tez

    public AnjiAssistantService(
        AppDbContext db,
        IHttpClientFactory httpFactory,
        IOptionsMonitor<AiSettings> opts,
        ILogger<AnjiAssistantService> log)
    {
        _db = db;
        _http = httpFactory.CreateClient("gemini");
        _opts = opts;
        _log = log;
    }

    public async Task<string?> AnswerAsync(string question, string pageContext, string lang, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(question)) return null;

        var apiKey = await ReadPlatformGeminiKeyAsync(ct);
        if (string.IsNullOrWhiteSpace(apiKey)) apiKey = _opts.CurrentValue.GeminiApiKey;
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _log.LogWarning("Assistant: koi Gemini key nahi → frontend FAQ fallback");
            return null;
        }

        // Reply language instruction — simple/aam bolchaal.
        var langLine = (lang?.Trim().ToLowerInvariant()) switch
        {
            "en" or "english" => "Reply in simple English.",
            "gu" or "gujarati" => "Reply in simple, everyday Gujarati.",
            _ => "Reply in simple, everyday Hindi (Devanagari). Common English words (bill, save, scan) waise hi rehne do.",
        };

        // Grounding system prompt — sirf is app ke baare me, chhota jawab, "AI" word mat bolo.
        var system =
            "You are 'Assistant', the in-app help guide for the Anjaninex Business Suite — a broker/trading + " +
            "accounting + GST billing software for Indian textile traders. Answer ONLY about how to use this app, " +
            "based on the PAGE CONTEXT provided. If the answer is not in the context, give the most sensible short " +
            "guidance for such an app, and if truly unrelated, say politely you can only help with this app. " +
            "Keep answers SHORT (2-4 sentences), friendly and step-like. Never mention 'AI', 'LLM', 'Gemini', " +
            "'model', or any vendor name. " + langLine;

        var userMsg =
            "PAGE CONTEXT:\n" + (string.IsNullOrWhiteSpace(pageContext) ? "(none)" : pageContext) +
            "\n\nUSER QUESTION:\n" + question.Trim();

        var body = new
        {
            system_instruction = new { parts = new[] { new { text = system } } },
            contents = new[] { new { role = "user", parts = new[] { new { text = userMsg } } } },
            generationConfig = new { temperature = 0.3, maxOutputTokens = 320, topP = 0.9 }
        };

        try
        {
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{Model}:generateContent?key={apiKey}";
            using var req = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
            };
            var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync(ct);
                _log.LogWarning("Assistant Gemini {Status}: {Err} → FAQ fallback", resp.StatusCode, err);
                return null;
            }
            var respText = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(respText);
            if (doc.RootElement.TryGetProperty("candidates", out var cands)
                && cands.ValueKind == JsonValueKind.Array && cands.GetArrayLength() > 0
                && cands[0].TryGetProperty("content", out var content)
                && content.TryGetProperty("parts", out var parts)
                && parts.ValueKind == JsonValueKind.Array && parts.GetArrayLength() > 0
                && parts[0].TryGetProperty("text", out var t))
            {
                var ans = t.GetString();
                if (!string.IsNullOrWhiteSpace(ans)) return ans!.Trim();
            }
            return null;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Assistant Gemini fail → FAQ fallback");
            return null;
        }
    }

    // Platform Gemini key — platform.billing_settings (id=1). Migration na chali ho to "" (appsettings fallback).
    private async Task<string> ReadPlatformGeminiKeyAsync(CancellationToken ct)
    {
        try
        {
            var conn = (Npgsql.NpgsqlConnection)_db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT ai_gemini_key FROM platform.billing_settings WHERE id = 1";
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
                return r["ai_gemini_key"] as string ?? "";
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Platform Gemini key read fail — appsettings fallback");
        }
        return "";
    }
}
