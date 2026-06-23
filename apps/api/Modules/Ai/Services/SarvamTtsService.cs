using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Ai.Services;

// =============================================================================
// SARVAM AI — Natural Indian TTS for the Anji help-desk assistant.
// Anji ki robotic browser voice (Web Speech API) ki jagah Sarvam ki natural
// Indian awaaz. Key platform.billing_settings (id=1, ai_sarvam_key) se aati hai
// (DB key wins, warna appsettings AI:SarvamApiKey). Key khali ho to TTS null
// return karta hai → frontend apne aap browser voice par fallback ho jaata hai.
// =============================================================================
public interface ISarvamTtsService
{
    // Returns base64 WAV chunks in order, or null if no key / Sarvam fail
    // (frontend ko null milne par browser voice fallback chalti hai).
    // voice = "male" | "female" (default female).
    Task<List<string>?> SynthesizeAsync(string text, string lang, string voice, CancellationToken ct);
}

public class SarvamTtsService : ISarvamTtsService
{
    private readonly AppDbContext _db;
    private readonly HttpClient _http;
    private readonly IOptionsMonitor<AiSettings> _opts;
    private readonly ILogger<SarvamTtsService> _log;

    private const string SarvamUrl = "https://api.sarvam.ai/text-to-speech";
    private const string SarvamTranslateUrl = "https://api.sarvam.ai/translate";
    private const int MaxChunkChars = 450;    // Sarvam ~500 char/request limit — safe margin
    private const int MaxTotalChars = 1500;   // poori reply cap (Anji answers chote hote hain)

    public SarvamTtsService(
        AppDbContext db,
        IHttpClientFactory httpFactory,
        IOptionsMonitor<AiSettings> opts,
        ILogger<SarvamTtsService> log)
    {
        _db = db;
        _http = httpFactory.CreateClient("sarvam");
        _opts = opts;
        _log = log;
    }

    public async Task<List<string>?> SynthesizeAsync(string text, string lang, string voice, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;

        // Voice: male / female. Sarvam bulbul:v2 speakers — female "anushka", male "abhilash".
        var speaker = (voice?.Trim().ToLowerInvariant() == "male") ? "abhilash" : "anushka";

        // Resolve key: DB platform key wins, warna appsettings AI:SarvamApiKey.
        var apiKey = await ReadPlatformSarvamKeyAsync(ct);
        if (string.IsNullOrWhiteSpace(apiKey))
            apiKey = _opts.CurrentValue.SarvamApiKey;
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            // Koi key nahi → null → frontend browser voice par fallback.
            return null;
        }

        var targetLang = MapLang(lang);
        var trimmed = text.Trim();
        if (trimmed.Length > MaxTotalChars) trimmed = trimmed.Substring(0, MaxTotalChars);
        var chunks = ChunkText(trimmed, MaxChunkChars);

        try
        {
            var audios = new List<string>(chunks.Count);
            foreach (var chunk in chunks)
            {
                // HINDI VOICE FIX — Anji ka content romanized Hinglish hai (e.g. "purchase bill
                // enter karte hain"). Sirf transliterate karne se English words (purchase/bill/
                // enter) waise hi reh jaate the — Hinglish jaisa sunai deta tha. Isliye ab
                // TRANSLATE (Mayura) karte hain → asli shudh Hindi ("खरीद बिल दर्ज करते हैं") →
                // fir TTS. Translate fail ho to original text par gracefully chalega (TTS na tute).
                var textForTts = chunk;
                if (targetLang == "hi-IN")
                    textForTts = await TranslateToHindiAsync(chunk, apiKey, ct);

                var body = new
                {
                    text = textForTts,
                    target_language_code = targetLang,
                    speaker = speaker,
                    model = "bulbul:v2",
                    pace = 1.0,
                    speech_sample_rate = 22050
                };
                var json = JsonSerializer.Serialize(body);
                using var req = new HttpRequestMessage(HttpMethod.Post, SarvamUrl);
                req.Headers.Add("api-subscription-key", apiKey);
                req.Content = new StringContent(json, Encoding.UTF8, "application/json");

                var resp = await _http.SendAsync(req, ct);
                if (!resp.IsSuccessStatusCode)
                {
                    var errBody = await resp.Content.ReadAsStringAsync(ct);
                    _log.LogWarning("Sarvam TTS {Status}: {Err}", resp.StatusCode, errBody);
                    return null;   // ek chunk fail → browser voice fallback (Anji kabhi na tute)
                }

                var respText = await resp.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(respText);
                if (doc.RootElement.TryGetProperty("audios", out var arr)
                    && arr.ValueKind == JsonValueKind.Array
                    && arr.GetArrayLength() > 0)
                {
                    var b64 = arr[0].GetString();
                    if (!string.IsNullOrEmpty(b64)) audios.Add(b64);
                }
            }

            return audios.Count > 0 ? audios : null;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Sarvam TTS failed — frontend browser voice par fallback karega");
            return null;
        }
    }

    // Romanized Hinglish → asli shudh Hindi (Devanagari) — Sarvam TRANSLATE (Mayura).
    // source auto (Hinglish detect), target hi-IN, mode modern-colloquial (natural bolchaal).
    // Translate English words ko bhi Hindi me badalta hai (transliterate sirf script badalta tha).
    // Koi bhi error / khali result par original text wapas (graceful — TTS na tute).
    private async Task<string> TranslateToHindiAsync(string text, string apiKey, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(text)) return text;
        try
        {
            var body = new
            {
                input = text.Length > 1000 ? text.Substring(0, 1000) : text,  // Mayura cap 1000 chars
                source_language_code = "auto",          // Hinglish/English auto-detect
                target_language_code = "hi-IN",
                model = "mayura:v1",
                mode = "modern-colloquial",             // natural spoken Hindi
                numerals_format = "international"
            };
            var json = JsonSerializer.Serialize(body);
            using var req = new HttpRequestMessage(HttpMethod.Post, SarvamTranslateUrl);
            req.Headers.Add("api-subscription-key", apiKey);
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");

            var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync(ct);
                _log.LogWarning("Sarvam translate {Status}: {Err} — original text par TTS chalega", resp.StatusCode, err);
                return text;
            }
            var respText = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(respText);
            if (doc.RootElement.TryGetProperty("translated_text", out var t)
                && t.ValueKind == JsonValueKind.String)
            {
                var hindi = t.GetString();
                if (!string.IsNullOrWhiteSpace(hindi)) return hindi!;
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Sarvam translate fail — original text par TTS chalega");
        }
        return text;
    }

    // "hi"/"hinglish" → hi-IN, "en" → en-IN, "gu" → gu-IN. Default hi-IN.
    private static string MapLang(string? lang)
        => (lang?.Trim().ToLowerInvariant()) switch
        {
            "en" or "english" or "en-in" => "en-IN",
            "gu" or "gujarati" or "gu-in" => "gu-IN",
            _ => "hi-IN",   // hi / hinglish / default
        };

    // Sentence/space boundary par split — har piece <= maxLen.
    private static List<string> ChunkText(string text, int maxLen)
    {
        var chunks = new List<string>();
        if (text.Length <= maxLen) { chunks.Add(text); return chunks; }

        // Pehle sentences (. ! ? । devanagari danda) par todo, fir chote pieces ko jodo.
        var parts = System.Text.RegularExpressions.Regex
            .Split(text, @"(?<=[\.\!\?।])\s+");

        var sb = new StringBuilder();
        foreach (var raw in parts)
        {
            var s = raw.Trim();
            if (s.Length == 0) continue;

            // Akela sentence hi maxLen se bada ho → space boundary par tod do.
            if (s.Length > maxLen)
            {
                if (sb.Length > 0) { chunks.Add(sb.ToString().Trim()); sb.Clear(); }
                foreach (var piece in SplitOnSpaces(s, maxLen)) chunks.Add(piece);
                continue;
            }

            if (sb.Length + s.Length + 1 > maxLen)
            {
                chunks.Add(sb.ToString().Trim());
                sb.Clear();
            }
            if (sb.Length > 0) sb.Append(' ');
            sb.Append(s);
        }
        if (sb.Length > 0) chunks.Add(sb.ToString().Trim());
        return chunks;
    }

    private static IEnumerable<string> SplitOnSpaces(string s, int maxLen)
    {
        var words = s.Split(' ');
        var sb = new StringBuilder();
        foreach (var w in words)
        {
            if (sb.Length + w.Length + 1 > maxLen && sb.Length > 0)
            {
                yield return sb.ToString().Trim();
                sb.Clear();
            }
            if (sb.Length > 0) sb.Append(' ');
            sb.Append(w);
        }
        if (sb.Length > 0) yield return sb.ToString().Trim();
    }

    // Platform Sarvam key — platform.billing_settings (id=1). DB key appsettings par
    // precedence leti hai. Migration na chali ho to gracefully "" return (appsettings fallback).
    private async Task<string> ReadPlatformSarvamKeyAsync(CancellationToken ct)
    {
        try
        {
            var conn = (Npgsql.NpgsqlConnection)_db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT ai_sarvam_key FROM platform.billing_settings WHERE id = 1";
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
                return r["ai_sarvam_key"] as string ?? "";
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Platform Sarvam key read fail — appsettings fallback");
        }
        return "";
    }
}
