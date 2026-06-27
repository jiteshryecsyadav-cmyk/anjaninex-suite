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
    // firmId + hasReportPermission live-data lookup (party balance/sales/last bill) ke liye —
    // data sirf tabhi nikalta hai jab user ke paas report-permission ho.
    Task<string?> AnswerAsync(string question, string pageContext, string lang,
        Guid firmId, bool hasReportPermission, CancellationToken ct);
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

    public async Task<string?> AnswerAsync(string question, string pageContext, string lang,
        Guid firmId, bool hasReportPermission, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(question)) return null;

        // LIVE DATA — agar sawaal balance/sales/last-bill type hai to asli aankde nikaalo
        // (firm-scoped). Ye block sirf tab data deta hai jab user ke paas report-permission ho.
        var liveData = await BuildLiveDataAsync(question, firmId, hasReportPermission, ct);

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
            "'model', or any vendor name. " +
            "If a LIVE DATA section is provided, use those EXACT figures in your answer (do not invent numbers). " +
            "If LIVE DATA says permission is missing, politely tell the user they don't have access to see that figure. " +
            langLine;

        var userMsg =
            "PAGE CONTEXT:\n" + (string.IsNullOrWhiteSpace(pageContext) ? "(none)" : pageContext) +
            (string.IsNullOrWhiteSpace(liveData) ? "" : "\n\nLIVE DATA (use these exact figures):\n" + liveData) +
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

    // ── LIVE DATA lookup ── sawaal balance/sales/last-bill type ho to asli aankde (firm-scoped).
    private async Task<string> BuildLiveDataAsync(string question, Guid firmId, bool hasReportPermission, CancellationToken ct)
    {
        var q = (question ?? "").ToLowerInvariant();
        bool wantsBalance = ContainsAny(q, "outstanding", "balance", "baki", "baaki", "bakaya", "udhar", "udhaar", "len den", "lena dena", "kitna baki", "kitne paise");
        bool wantsSales = ContainsAny(q, "sales", "bikri", "becha", " sale", "vikri", "vechan");
        bool wantsLastBill = ContainsAny(q, "last bill", "aakhri bill", "akhri bill", "pichla bill", "pichhla bill", "recent bill", "last invoice", "aakhri invoice");
        bool wantsLastPay = ContainsAny(q, "last payment", "aakhri payment", "akhri payment", "payment kab", "last receipt", "aakhri receipt", "bhugtan kab");

        if (!wantsBalance && !wantsSales && !wantsLastBill && !wantsLastPay) return "";

        // Permission gate — live figure sirf report-permission walon ko.
        if (!hasReportPermission)
            return "PERMISSION MISSING: user ko ye figure dekhne ki ijazat nahi.";

        var sb = new StringBuilder();
        var todayIst = DateOnly.FromDateTime(DateTime.UtcNow.AddMinutes(330));

        if (wantsSales)
        {
            bool today = ContainsAny(q, "aaj", "today", "aj ka", "aaj ka");
            var from = today ? todayIst : new DateOnly(todayIst.Year, todayIst.Month, 1);
            var total = await _db.Bills
                .Where(b => b.FirmId == firmId && b.BillType == "sales" && b.DeletedAt == null
                         && b.BillDate >= from && b.BillDate <= todayIst)
                .SumAsync(b => (decimal?)b.Total, ct) ?? 0m;
            sb.AppendLine($"Sales {(today ? "aaj" : "is mahine")}: Rs {total:N2}");
        }

        if (wantsBalance || wantsLastBill || wantsLastPay)
        {
            var party = await ResolvePartyAsync(q, firmId, ct);
            if (party == null)
            {
                sb.AppendLine("Party nahi mili: sawaal me party ka naam saaf likho (jaise 'Riddhi Agency ka balance').");
            }
            else
            {
                if (wantsBalance)
                {
                    var outstanding = await _db.Bills
                        .Where(b => b.FirmId == firmId && b.BillType == "sales"
                                 && b.Status != "paid" && b.Status != "cancelled" && b.DeletedAt == null
                                 && b.PartyId == party.Value.Id)
                        .SumAsync(b => (decimal?)(b.Total - b.PaidAmount), ct) ?? 0m;
                    sb.AppendLine($"{party.Value.Name} ka outstanding (baaki): Rs {outstanding:N2}");
                }
                if (wantsLastBill)
                {
                    var lb = await _db.Bills
                        .Where(b => b.FirmId == firmId && b.DeletedAt == null
                                 && (b.PartyId == party.Value.Id || b.BuyerPartyId == party.Value.Id))
                        .OrderByDescending(b => b.BillDate).ThenByDescending(b => b.CreatedAt)
                        .Select(b => new { b.BillNo, b.BillDate, b.Total })
                        .FirstOrDefaultAsync(ct);
                    sb.AppendLine(lb == null
                        ? $"{party.Value.Name} ka koi bill nahi mila."
                        : $"{party.Value.Name} ka aakhri bill: No {lb.BillNo}, date {lb.BillDate:dd-MM-yyyy}, Rs {lb.Total:N2}");
                }
                if (wantsLastPay)
                {
                    var lp = await _db.Payments
                        .Where(p => p.FirmId == firmId && p.DeletedAt == null && p.PartyId == party.Value.Id)
                        .OrderByDescending(p => p.PaymentDate).ThenByDescending(p => p.CreatedAt)
                        .Select(p => new { p.PaymentNo, p.PaymentDate, p.Amount, p.PaymentType })
                        .FirstOrDefaultAsync(ct);
                    sb.AppendLine(lp == null
                        ? $"{party.Value.Name} ka koi payment/receipt nahi mila."
                        : $"{party.Value.Name} ka aakhri {(lp.PaymentType == "payment" ? "payment" : "receipt")}: No {lp.PaymentNo}, date {lp.PaymentDate:dd-MM-yyyy}, Rs {lp.Amount:N2}");
                }
            }
        }
        return sb.ToString().Trim();
    }

    private static bool ContainsAny(string hay, params string[] needles)
    {
        foreach (var n in needles) if (hay.Contains(n)) return true;
        return false;
    }

    // Party name resolve — firm ke saare party naam load karke jo naam sawaal me aata hai
    // (longest match) wahi party. Galat/aadha naam pe bhi best match dhundhta hai.
    private async Task<(Guid Id, string Name)?> ResolvePartyAsync(string qLower, Guid firmId, CancellationToken ct)
    {
        var parties = await _db.PartyProfiles
            .Where(p => p.FirmId == firmId)
            .Join(_db.Contacts, p => p.ContactId, c => c.Id, (p, c) => new { p.Id, c.DisplayName })
            .ToListAsync(ct);
        var match = parties
            .Where(x => !string.IsNullOrWhiteSpace(x.DisplayName) && qLower.Contains(x.DisplayName.ToLowerInvariant()))
            .OrderByDescending(x => x.DisplayName.Length)
            .FirstOrDefault();
        return match == null ? null : (match.Id, match.DisplayName);
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
