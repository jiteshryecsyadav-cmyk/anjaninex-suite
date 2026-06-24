using System.IO.Compression;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Ai.Entities;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Ai.Services;

// =============================================================================
// DTOs returned to frontend
// =============================================================================
public class ExtractedBillDto
{
    public decimal Confidence { get; set; }
    public bool FromCache { get; set; }
    public decimal Cost { get; set; }
    public string ModelUsed { get; set; } = "";
    public string ImageHash { get; set; } = "";
    public Guid ExtractionId { get; set; }
    public string? FailureReason { get; set; }   // NEW — surface why Gemini failed (so user can fix it)

    public PartyInfo Supplier { get; set; } = new();
    public PartyInfo Buyer { get; set; } = new();
    public InvoiceInfo Invoice { get; set; } = new();
    public List<BillItem> Items { get; set; } = new();
    public TotalsInfo Totals { get; set; } = new();
    public TransportInfo Transport { get; set; } = new();
    public BankInfo Bank { get; set; } = new();
}

public class PartyInfo
{
    public string Name { get; set; } = "";
    public string Gst { get; set; } = "";
    public string Pan { get; set; } = "";
    public string Address { get; set; } = "";
    public string City { get; set; } = "";
    public string State { get; set; } = "";
    public string Pincode { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
}

public class InvoiceInfo
{
    public string Number { get; set; } = "";
    public string Date { get; set; } = "";
    public string DueDate { get; set; } = "";
    public string PoNumber { get; set; } = "";
}

public class BillItem
{
    public string Name { get; set; } = "";
    public string HsnSac { get; set; } = "";
    public decimal Qty { get; set; }
    public string Unit { get; set; } = "PCS";
    public decimal Rate { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal TaxRate { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal TotalAmount { get; set; }
}

public class TotalsInfo
{
    public decimal TaxableTotal { get; set; }
    public decimal Cgst { get; set; }
    public decimal Sgst { get; set; }
    public decimal Igst { get; set; }
    public decimal RoundOff { get; set; }
    public decimal GrandTotal { get; set; }
    public string AmountInWords { get; set; } = "";
}

public class TransportInfo
{
    public string Name { get; set; } = "";
    public string Gst { get; set; } = "";          // NEW — for reliable match
    public string VehicleNo { get; set; } = "";
    public string LrNo { get; set; } = "";
    public string LrDate { get; set; } = "";
    public string EwayBillNo { get; set; } = "";   // NEW — 12-digit e-Way bill
    public string EwayBillDate { get; set; } = ""; // NEW — e-Way bill generation date
}

public class BankInfo
{
    public string Name { get; set; } = "";
    public string AccountNo { get; set; } = "";
    public string Ifsc { get; set; } = "";
}

public class AiSettings
{
    public bool Enabled { get; set; }
    public string GeminiApiKey { get; set; } = "";
    public string GeminiModel { get; set; } = "gemini-2.5-flash";
    // Platform/global Claude key — optional. Sirf tab set hoti hai jab admin platform key se
    // Sonnet enable karna chahe. Khali ho to Sonnet sirf firm BYOK Claude key se chalega.
    public string ClaudeApiKey { get; set; } = "";
    // Platform/global OpenAI key — optional (GPT-4o ke liye). Khali ho to GPT-4o sirf firm BYOK OpenAI key se chalega.
    public string OpenAiApiKey { get; set; } = "";
    // Platform/global Sarvam AI key — optional (Anji ki natural Indian TTS ke liye). Khali ho to
    // Anji apne aap browser Web Speech voice par fallback ho jaata hai.
    public string SarvamApiKey { get; set; } = "";
    public decimal ConfidenceThreshold { get; set; } = 0.8m;
    public int CacheTtlHours { get; set; } = 24;
    public bool EnableMockResponses { get; set; } = true;
    public Dictionary<string, decimal> Pricing { get; set; } = new();
}

public class InsufficientWalletException : Exception
{
    public InsufficientWalletException(string msg) : base(msg) { }
}

// =============================================================================
// Service
// =============================================================================
public interface IBillExtractorService
{
    Task<ExtractedBillDto> ExtractBill(IReadOnlyList<IFormFile> images, Guid firmId, Guid userId, CancellationToken ct, string source = "bill", string? modelChoice = null);
    Task<List<AiExtractionLog>> RecentExtractions(Guid firmId, int limit);
    Task MarkCorrected(Guid extractionId, object correctionDiff);
}

public class BillExtractorService : IBillExtractorService
{
    private readonly AppDbContext _db;
    private readonly IWalletService _wallet;
    private readonly HttpClient _http;
    private readonly IOptionsMonitor<AiSettings> _opts;
    private readonly ILogger<BillExtractorService> _log;
    private string? _lastFailureReason;

    private const decimal BillScanCost = 0m;   // TEMP: free during testing — change to 0.15m for production

    // Scan model chooser — firm scan ke time 3 options me se model chun sakti hai.
    // Short key → (provider, modelId). Sirf in 3 ko hi allow karo (allowlist).
    //   flash  → Gemini 2.5 Flash (sasta/fast) — default
    //   pro    → Gemini 2.5 Pro   (accurate)
    //   sonnet → Claude Sonnet 4.6 (best)  — Claude key chahiye (BYOK ya platform)
    private static readonly Dictionary<string, (string Provider, string Model)> ModelAllowlist = new()
    {
        ["flash"]  = ("gemini", "gemini-2.5-flash"),
        ["pro"]    = ("gemini", "gemini-2.5-pro"),
        ["sonnet"] = ("claude", "claude-sonnet-4-6"),
        ["haiku"]  = ("claude", "claude-haiku-4-5-20251001"),
        ["gpt4o"]  = ("openai", "gpt-4o"),
        // Sarvam Vision (option B) — OCR (Sarvam doc-digitization) + AI structuring (Gemini Flash).
        ["sarvam"] = ("sarvam", "sarvam-vision"),
    };

    public BillExtractorService(
        AppDbContext db,
        IWalletService wallet,
        IHttpClientFactory httpFactory,
        IOptionsMonitor<AiSettings> opts,
        ILogger<BillExtractorService> log)
    {
        _db = db;
        _wallet = wallet;
        _http = httpFactory.CreateClient("gemini");
        _opts = opts;
        _log = log;
    }

    public async Task<ExtractedBillDto> ExtractBill(IReadOnlyList<IFormFile> images, Guid firmId, Guid userId, CancellationToken ct, string source = "bill", string? modelChoice = null)
    {
        var settings = _opts.CurrentValue;
        var sw = System.Diagnostics.Stopwatch.StartNew();

        // 0. MONTHLY SCAN LIMIT — is mahine ki AI scan quota khatam ho to scan BLOCK karo
        //    aur recharge message do. (firm.AiQuotaMonthly = 0 → unlimited, skip.)
        var monthlyQuota = await _db.Firms.Where(f => f.Id == firmId)
            .Select(f => f.AiQuotaMonthly).FirstOrDefaultAsync(ct);
        if (monthlyQuota > 0)
        {
            var now = DateTimeOffset.UtcNow;
            var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
            var usedThisMonth = await _db.AiExtractionLogs
                .CountAsync(l => l.FirmId == firmId && l.CreatedAt >= monthStart, ct);
            if (usedThisMonth >= monthlyQuota)
                throw new InsufficientWalletException(
                    $"Aapki AI scan limit ({usedThisMonth}/{monthlyQuota}) is mahine khatam ho gayi hai. " +
                    "Aur scan ke liye wallet recharge karein ya plan upgrade karein.");
        }

        // 1. Compute hash over ALL pages combined → multi-page set gets its own cache key.
        var hash = await ComputeHashAsync(images);
        var inputSizeKb = (int)(images.Sum(i => i.Length) / 1024);

        // BYOK: firm-specific provider/key (Anjaninex admin sets it) overrides global settings.
        // Firm apni key se scan karti hai → kharcha unke provider account par, hamara zero.
        var firmKeys = await _db.FirmApiKeys.FindAsync(firmId);
        var hasFirmKey = !string.IsNullOrEmpty(firmKeys?.AiApiKey);

        // PLATFORM KEYS (Anjaninex admin, common for all firms) — DB key appsettings se
        // PRECEDENCE leti hai. DB blank ho to appsettings fallback (= pehle jaisa behavior).
        var dbKeys = await ReadPlatformAiKeysAsync(ct);
        var platformGeminiKey = !string.IsNullOrEmpty(dbKeys.Gemini) ? dbKeys.Gemini : settings.GeminiApiKey;
        var platformClaudeKey = !string.IsNullOrEmpty(dbKeys.Claude) ? dbKeys.Claude : settings.ClaudeApiKey;
        var platformOpenAiKey = !string.IsNullOrEmpty(dbKeys.OpenAi) ? dbKeys.OpenAi : settings.OpenAiApiKey;
        var platformSarvamKey = !string.IsNullOrEmpty(dbKeys.Sarvam) ? dbKeys.Sarvam : settings.SarvamApiKey;
        // Sarvam Vision (option B) hybrid ke 2nd step (OCR text -> structured JSON) ke liye
        // Gemini Flash use hoti hai. Key: firm BYOK Gemini, warna platform Gemini.
        var structuringGeminiKey = (hasFirmKey && firmKeys!.AiProvider == "gemini")
            ? firmKeys!.AiApiKey! : platformGeminiKey;

        // SCAN MODEL CHOOSER: firm scan ke time flash/pro/sonnet chun sakti hai.
        // Valid choice ho to firm-default switch ki jagah allowlist ka provider+model use hoga.
        // (null/blank → niche existing default behavior chalega — kuch change nahi.)
        var choice = modelChoice?.Trim().ToLowerInvariant();
        var hasChoice = !string.IsNullOrEmpty(choice) && ModelAllowlist.ContainsKey(choice);

        string provider;
        string model;
        string apiKey;
        bool usingFirmKey;   // wallet charge sirf platform key par hota hai

        if (hasChoice)
        {
            var picked = ModelAllowlist[choice!];
            provider = picked.Provider;
            model = picked.Model;

            if (provider == "claude")
            {
                // Sonnet → firm BYOK Claude key, warna platform Claude key, warna friendly error.
                if (hasFirmKey && firmKeys!.AiProvider == "claude")
                {
                    apiKey = firmKeys.AiApiKey!;
                    usingFirmKey = true;
                }
                else if (!string.IsNullOrEmpty(platformClaudeKey))
                {
                    apiKey = platformClaudeKey;
                    usingFirmKey = false;
                }
                else
                {
                    throw new ArgumentException(
                        "Sonnet ke liye Claude API key chahiye — Admin se Settings me Claude key set karwayen (ya Gemini Pro use karein).");
                }
            }
            else if (provider == "openai")
            {
                // GPT-4o → firm BYOK OpenAI key, warna platform OpenAI key, warna friendly error.
                if (hasFirmKey && firmKeys!.AiProvider == "openai")
                {
                    apiKey = firmKeys.AiApiKey!;
                    usingFirmKey = true;
                }
                else if (!string.IsNullOrEmpty(platformOpenAiKey))
                {
                    apiKey = platformOpenAiKey;
                    usingFirmKey = false;
                }
                else
                {
                    throw new ArgumentException(
                        "GPT-4o ke liye OpenAI API key chahiye — Admin se Settings me OpenAI key set karwayen (ya Gemini Pro use karein).");
                }
            }
            else if (provider == "sarvam")
            {
                // Sarvam Vision (OCR+AI) → platform Sarvam key (Platform AI Keys page).
                // Structuring step Gemini Flash se hoti hai (structuringGeminiKey).
                if (string.IsNullOrEmpty(platformSarvamKey))
                    throw new ArgumentException(
                        "Sarvam Vision ke liye Sarvam API key chahiye — Admin → Platform AI Keys me Sarvam key set karein (ya doosra model chunein).");
                if (string.IsNullOrEmpty(structuringGeminiKey))
                    throw new ArgumentException(
                        "Sarvam Vision ko text→JSON ke liye Gemini key chahiye — Admin → Platform AI Keys me Gemini key set karein.");
                apiKey = platformSarvamKey;   // wallet charge hota hai (platform key)
                usingFirmKey = false;
            }
            else
            {
                // Gemini (flash/pro) → firm BYOK Gemini key, warna platform Gemini key.
                if (hasFirmKey && firmKeys!.AiProvider == "gemini")
                {
                    apiKey = firmKeys.AiApiKey!;
                    usingFirmKey = true;
                }
                else
                {
                    apiKey = platformGeminiKey;
                    usingFirmKey = false;
                }
            }
        }
        else
        {
            // EXISTING behavior — firm BYOK provider/model, warna global Gemini default.
            provider = hasFirmKey ? (firmKeys!.AiProvider ?? "gemini") : "gemini";
            apiKey = hasFirmKey ? firmKeys!.AiApiKey! : platformGeminiKey;
            model = hasFirmKey && !string.IsNullOrEmpty(firmKeys!.AiModel)
                ? firmKeys.AiModel!
                : provider switch
                {
                    "claude" => "claude-haiku-4-5-20251001",
                    "openai" => "gpt-4o-mini",
                    _ => settings.GeminiModel
                };
            usingFirmKey = hasFirmKey;
        }

        // 2. Check cache — but skip poisoned cache entries (low confidence / empty extraction)
        //    PromptVersion key me hai → jab bhi AI prompt badle, version bump karo (neeche
        //    BillPrompt ke paas) → purana cache apne aap ignore (auto-bust), fresh scan hoga.
        //    Effective model bhi key me hai → Flash/Pro/Sonnet ke results alag-alag cache hote
        //    hain, ek doosre se collide nahi karte.
        var cacheKey = $"bill:{PromptVersion}:{model}:{firmId}:{hash}";
        var cached = await _db.AiCache
            .FirstOrDefaultAsync(c => c.CacheKey == cacheKey && c.ExpiresAt > DateTimeOffset.UtcNow);
        if (cached != null)
        {
            var cachedDto = JsonSerializer.Deserialize<ExtractedBillDto>(cached.Payload,
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })!;

            // POISON CHECK: if cached result is garbage (no items / 0 confidence / 0 total),
            // delete it and re-extract fresh. This auto-heals after a bad scan.
            bool isPoisoned = cachedDto.Confidence < 0.3m
                              || cachedDto.Items.Count == 0
                              || cachedDto.Totals.GrandTotal == 0;

            if (isPoisoned)
            {
                _log.LogWarning("Poisoned cache detected for {Hash} — deleting and re-extracting", hash);
                _db.AiCache.Remove(cached);
                await _db.SaveChangesAsync(ct);
                // fall through to re-extract
            }
            else
            {
                _log.LogInformation("AI cache hit for bill scan {Hash}", hash);
                cachedDto.FromCache = true;
                cachedDto.Cost = 0;
                return cachedDto;
            }
        }

        // 3. P0-5 fix: DEBIT WALLET FIRST (atomic, SELECT FOR UPDATE inside).
        //    Mock mode = free, otherwise pre-debit. Refund on confirmed failure with idempotency key.
        //    usingFirmKey → firm apni key se scan kar rahi (BYOK) → hamesha real call, wallet charge nahi.
        //    platform key → global Gemini settings ke hisab se mock/real + wallet charge.
        var isMockMode = usingFirmKey
            ? false   // firm ki apni key hai → hamesha real call
            : (!settings.Enabled || string.IsNullOrEmpty(apiKey) || settings.EnableMockResponses);
        // PER-MODEL CHARGE: har model ki apni rate (admin-editable addon_services me:
        // bill_scan_flash / _pro / _sonnet / _haiku / _gpt4o). Choice na ho to purana 'bill_scan'.
        // Charge sirf REAL scan + PLATFORM key par hota hai. BYOK (usingFirmKey) → kharcha firm
        // ke apne provider account par → wallet charge ZERO. Mock → free.
        var serviceCode = hasChoice ? $"bill_scan_{choice}" : "bill_scan";
        decimal scanCost = 0m;
        var idempotencyRef = $"{serviceCode}:{hash}:{Guid.NewGuid()}";  // unique per attempt

        if (!isMockMode && !usingFirmKey)
        {
            // Admin-managed per-model rate se charge + usage log (firm 'self' mode me ho to free).
            var charge = await _wallet.ChargeServiceAsync(firmId, serviceCode, 1, idempotencyRef, userId);
            if (charge.Ok)
            {
                scanCost = charge.Charged;   // 0 agar firm 'self' mode me — refund bhi 0
            }
            else if (charge.Reason == "unknown_service")
            {
                // is model ka service catalog me nahi → default 'bill_scan' try; wo bhi na ho to free (scan block na ho)
                var fb = await _wallet.ChargeServiceAsync(firmId, "bill_scan", 1, idempotencyRef, userId);
                scanCost = fb.Ok ? fb.Charged : 0m;
            }
            else
            {
                throw new InsufficientWalletException(
                    "Wallet balance kam hai — is AI model se scan ke liye wallet recharge karein (ya sasta model chunein).");
            }
        }

        // 4. Call AI (real Gemini OR mock) — wallet already debited if real
        ExtractedBillDto result;
        string modelUsed;
        bool geminiFailed = false;

        if (isMockMode)
        {
            _log.LogInformation("AI mock mode — returning sample bill extraction");
            result = GenerateMockBill();
            modelUsed = "mock";
        }
        else
        {
            try
            {
                // Transient errors (503 overload / rate limit) par auto-retry — 3 attempts
                var attempt = 0;
                while (true)
                {
                    try
                    {
                        result = provider switch
                        {
                            "claude" => await CallClaudeAsync(images, apiKey, model, ct),
                            "openai" => await CallOpenAiAsync(images, apiKey, model, ct),
                            "sarvam" => await CallSarvamHybridAsync(images, apiKey, structuringGeminiKey, ct),
                            _ => await CallGeminiAsync(images, apiKey, model, ct)
                        };
                        break;
                    }
                    catch (Exception rex) when (++attempt < 4
                        && (rex.Message.Contains("503")
                            || rex.Message.Contains("500")                       // Google InternalServerError — transient
                            || rex.Message.Contains("INTERNAL", StringComparison.OrdinalIgnoreCase)
                            || rex.Message.Contains("internal error", StringComparison.OrdinalIgnoreCase)
                            || rex.Message.Contains("Please retry", StringComparison.OrdinalIgnoreCase)
                            || rex.Message.Contains("UNAVAILABLE")
                            || rex.Message.Contains("overloaded", StringComparison.OrdinalIgnoreCase)
                            || rex.Message.Contains("high demand", StringComparison.OrdinalIgnoreCase)
                            || rex.Message.Contains("JSON parse fail")))
                    {
                        _log.LogWarning("AI transient fail (attempt {A}/4) — {S}s me retry: {Msg}", attempt, attempt * 2, rex.Message);
                        await Task.Delay(attempt * 2000, ct);   // 2s, 4s, 6s — Google ko thoda time
                    }
                }
                modelUsed = model;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "{Provider} API failed for firm {FirmId}, image {Hash}. Message: {Msg}",
                    provider, firmId, hash, ex.Message);
                geminiFailed = true;
                // User-friendly failure reason (raw JSON nahi) — frontend par dikhega
                var m = ex.Message;
                _lastFailureReason =
                    (m.Contains("500") || m.Contains("INTERNAL", StringComparison.OrdinalIgnoreCase) || m.Contains("Please retry", StringComparison.OrdinalIgnoreCase))
                        ? "AI service abhi busy hai (Google server). 10-15 second baad 'Try Again' dabao — ya manually bhar lo."
                    : (m.Contains("429") || m.Contains("quota", StringComparison.OrdinalIgnoreCase) || m.Contains("RESOURCE_EXHAUSTED"))
                        ? "AI scan quota khatam / billing verify pending. AI Studio billing me 'Verify now' karo, ya manually bhar lo."
                    : (m.Contains("API key", StringComparison.OrdinalIgnoreCase) || m.Contains("API_KEY", StringComparison.OrdinalIgnoreCase) || m.Contains("401") || m.Contains("403"))
                        ? "AI key galat ya expire — Core Master me AI key check karo."
                    : "AI scan abhi nahi ho paya. Dobara try karo ya manually bhar lo.";

                // P0-5 fix: refund pre-debited amount since the call failed.
                // IMPORTANT: use CancellationToken.None — when Gemini times out the request's
                // ct is already canceled, and reusing it here would make the refund (a DB write)
                // throw OperationCanceledException, leaving the user debited AND crashing the
                // whole endpoint with a 500 instead of a graceful mock fallback.
                if (scanCost > 0)
                {
                    try
                    {
                        await _wallet.Recharge(firmId, scanCost, "refund",
                            $"refund:{idempotencyRef}",
                            userId);
                        _log.LogInformation("Refunded ₹{Cost} for failed Gemini call (firm {FirmId})", scanCost, firmId);
                    }
                    catch (Exception refundEx)
                    {
                        _log.LogError(refundEx, "CRITICAL: refund failed for firm {FirmId} ref {Ref}",
                            firmId, idempotencyRef);
                        // Don't swallow — but proceed with mock fallback so user gets something
                    }
                }

                // Koi fake/sample bill NAHI — khali result + failure reason, taaki user
                // galti se demo data save na kar de. Frontend error banner dikhayega.
                result = new ExtractedBillDto();
                result.Confidence = 0;
                modelUsed = "failed";
            }
        }

        sw.Stop();

        // 5. Validate / post-process — HTML-encode strings to defeat AI prompt injection (P1)
        result.Supplier.Gst = ValidateGst(result.Supplier.Gst);
        result.Buyer.Gst = ValidateGst(result.Buyer.Gst);
        result.Supplier.Name = System.Net.WebUtility.HtmlEncode(result.Supplier.Name);
        result.Buyer.Name = System.Net.WebUtility.HtmlEncode(result.Buyer.Name);
        // Phone: sirf valid 10-digit mobile (6-9 se shuru) — labels/landline/kachra hatao
        result.Supplier.Phone = CleanPhone(result.Supplier.Phone);
        result.Buyer.Phone = CleanPhone(result.Buyer.Phone);
        result.Confidence = AdjustConfidence(result);
        result.ModelUsed = modelUsed;
        result.ImageHash = hash;
        result.FailureReason = geminiFailed ? _lastFailureReason : null;
        // Cost = what we ACTUALLY charged (after refund if applicable)
        result.Cost = (modelUsed == "mock" || geminiFailed) ? 0 : scanCost;

        // 7. Audit log
        var logEntry = new AiExtractionLog
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            UserId = userId,
            AgentName = source == "order" ? "order_scan" : "bill_scan",   // Bill vs Order scan report ke liye
            ModelUsed = modelUsed,
            ImageHash = hash,
            InputSizeKb = inputSizeKb,
            OutputJson = JsonSerializer.Serialize(result),
            Confidence = result.Confidence,
            LatencyMs = (int)sw.ElapsedMilliseconds,
            CostInr = result.Cost,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.AiExtractionLogs.Add(logEntry);

        // 8. Cache (24hr) — but ONLY if the result is actually useful.
        //    Otherwise we poison the cache and every retry returns garbage.
        //    Skip caching when: low confidence, no items, mock fallback, or Gemini failed.
        var shouldCache =
            result.Confidence >= 0.5m
            && result.Items.Count > 0
            && !geminiFailed
            && modelUsed != "mock"
            && modelUsed != "mock_fallback";

        if (shouldCache)
        {
            // UPSERT: wahi CacheKey ka purana (expired/poisoned) row pehle se ho sakta hai —
            // tracker me dhundo ya DB se laao, mile to UPDATE, warna naya ADD.
            // (Pehle seedha Add karte the → "cache_pkey duplicate" crash aata tha)
            var existing = await _db.AiCache.FirstOrDefaultAsync(c => c.CacheKey == cacheKey);
            if (existing != null)
            {
                existing.FirmId = firmId;
                existing.AgentName = "bill_extractor";
                existing.Payload = JsonSerializer.Serialize(result);
                existing.CostSaved = BillScanCost;
                existing.ExpiresAt = DateTimeOffset.UtcNow.AddHours(settings.CacheTtlHours);
                existing.CreatedAt = DateTimeOffset.UtcNow;
            }
            else
            {
                _db.AiCache.Add(new AiCacheEntry
                {
                    CacheKey = cacheKey,
                    FirmId = firmId,
                    AgentName = "bill_extractor",
                    Payload = JsonSerializer.Serialize(result),
                    CostSaved = BillScanCost,
                    ExpiresAt = DateTimeOffset.UtcNow.AddHours(settings.CacheTtlHours),
                    CreatedAt = DateTimeOffset.UtcNow
                });
            }
        }
        else
        {
            _log.LogWarning("Skipping cache write — confidence={Conf}, items={Items}, model={Model}, geminiFailed={Failed}",
                result.Confidence, result.Items.Count, modelUsed, geminiFailed);
        }

        // Use a non-cancelable token for the final persist: if Gemini timed out, `ct` is
        // already canceled and SaveChangesAsync(ct) would throw OperationCanceledException →
        // 500 error + lost audit log + un-refunded debit. The audit/cache write must complete
        // regardless so the user gets the graceful mock-fallback response (200).
        // EXTRA SAFETY: agar audit/cache save bhi fail ho (RLS/constraint) to bhi request
        // crash na ho — user ko extraction result (ya graceful fail) milna chahiye, 500 nahi.
        try
        {
            await _db.SaveChangesAsync(geminiFailed ? CancellationToken.None : ct);
            result.ExtractionId = logEntry.Id;
        }
        catch (Exception persistEx)
        {
            _log.LogError(persistEx, "Bill extraction audit/cache persist failed — returning result anyway");
            if (geminiFailed && string.IsNullOrEmpty(result.FailureReason))
                result.FailureReason = "AI service abhi available nahi — thodi der baad try karo ya manually bharo.";
        }

        _log.LogInformation("Bill extracted via {Model} in {Ms}ms, confidence {Conf}, cost ₹{Cost}",
            modelUsed, sw.ElapsedMilliseconds, result.Confidence, result.Cost);

        return result;
    }

    public async Task<List<AiExtractionLog>> RecentExtractions(Guid firmId, int limit)
    {
        return await _db.AiExtractionLogs
            .Where(l => l.FirmId == firmId)
            .OrderByDescending(l => l.CreatedAt)
            .Take(limit)
            .ToListAsync();
    }

    public async Task MarkCorrected(Guid extractionId, object correctionDiff)
    {
        var log = await _db.AiExtractionLogs.FindAsync(extractionId);
        if (log == null) return;
        log.UserCorrected = true;
        log.CorrectionDiff = JsonSerializer.Serialize(correctionDiff);
        await _db.SaveChangesAsync();
    }

    // =================================================
    // Gemini API call
    // =================================================
    // FOCUSED PROMPT — exactly the fields the Bill/Order form uses, nothing extra.
    // Form needs: supplier{name,gst,phone,address,city}, buyer{same},
    //             invoice{number,date}, items{name,hsnSac,qty,unit,rate,taxRate},
    //             totals (for verification), transport{lrNo,ewayBillNo}.
    // Shared by ALL providers (Gemini / Claude / OpenAI).
    // AI prompt badalne par ye version bump karo (v2 → v3 ...) — purana cache auto-bust ho jata hai,
    // taaki naya prompt turant chale aur manual cache-clear ki zaroorat na pade.
    private const string PromptVersion = "v5";

    private static readonly string BillPrompt = @"You are an expert Indian GST invoice parser. Extract ONLY the fields in the schema below and return ONLY valid JSON. No prose, no markdown, no extra keys.

IMPORTANT — read these fields very carefully, they matter most:
- supplier = the SELLER / manufacturer printed at the TOP of the bill (with its GSTIN).
- buyer = the party the bill is billed TO (Name & Address of Buyer / Bill To).
- GSTIN = exactly 15 characters (e.g. 24AYXP38534B1Z7). Read each char carefully (0 vs O, 1 vs I). Capture BOTH supplier and buyer GSTIN if printed.
- Each item row: name (Description of Goods), hsnSac, qty, unit, rate, taxRate %, taxableAmount, totalAmount.
  * COMPLETENESS — read EVERY item row from top to bottom. Do NOT skip the first or last row. If rows are numbered (Sr/S.No 1,2,3,4...) your items array length MUST equal the highest serial number. CROSS-CHECK: sum of all line amounts MUST equal the bill's Sub Total / Taxable Value. If your sum is less, you missed a row (often the first one) — re-read and add it.
  * Read each column carefully. taxableAmount/totalAmount = the row's Amount as printed (source of truth).
  * rate = MOST IMPORTANT, most reliable field. Read it EXACTLY from the Rate / Price / Rate Rs column (e.g. 315.00). Never alter, round, or compute it. If genuinely no Rate column exists, set rate=0.
  * qty = the number that makes qty × rate = the row Amount (so the line amount comes out correct). A textile row may show a piece count AND meters — pick whichever quantity makes qty × rate = the printed Amount.
  * unit = just ""PCS"" or ""MTR"" (your best guess). DON'T over-think the unit — the USER will choose PCS or MTR from a dropdown. Only these two values: ""PCS"" or ""MTR"".
  * SELF-CHECK every row: qty × rate MUST ≈ the row Amount/taxableAmount. If not, fix qty so the product matches the printed amount.
  * ONLY if there is genuinely NO Rate/Price column anywhere on the bill (just quantity + amount): set rate=0 — do NOT invent or compute a rate (the app will ask the user).
- invoice number + invoice date (top right of bill).
- phone = ONLY a 10-digit Indian MOBILE number (starting 6-9), digits only. NO labels like 'Ph:'/'Accounts'/'Payment', NO landline/STD numbers like (0261)2331456, NO email. If no mobile is printed, leave it """".
- GSTIN STRICT RULE: take a GSTIN ONLY from that party's OWN section. The Transport/Transporter/LR section often prints the TRANSPORTER's GSTIN — NEVER put it in supplier.gst or buyer.gst. If the buyer's (or supplier's) own GSTIN is NOT printed, leave gst = """" — do NOT borrow a GSTIN from anywhere else on the bill.
- pan: if a party has NO GSTIN but a 10-char PAN (e.g. AQIPD4287E) is printed near their name, put it in pan. Otherwise """".
- transport.name = the TRANSPORTER's name printed after labels like 'Transport:', 'Transporter:', 'Transport Name:', 'Despatched through', 'Carrier' (e.g. 'Transport : R Yadav Xpress Cargo Service' → name = ""R Yadav Xpress Cargo Service""). transport.gst = GSTIN printed in that SAME transport section (this is where a transporter GSTIN belongs — NOT in supplier/buyer).
- transport.ewayBillNo = the E-WAY BILL number — a 12-digit number printed near labels like 'E-Way Bill No', 'E-Way Bill', 'EWB No', 'EWB', 'eWay Bill', 'EWAY BILL NO.'. It can appear anywhere (top, near invoice no, or in the transport/despatch box). Return DIGITS ONLY (strip spaces/dashes, e.g. '1234 5678 9012' → '123456789012'). If not printed, leave "".
- transport.ewayBillDate = the E-Way Bill generation DATE printed near the e-way bill number (labels 'E-Way Bill Date', 'EWB Date', 'Date'). Output as YYYY-MM-DD (Indian day-first DD/MM/YYYY). If not printed, leave "".
- transport.lrNo = the LR / GR / Builty / Docket number printed near 'LR No', 'GR No', 'Docket', 'CN No'. If not printed, leave "".

Rules:
- Missing field: empty string """" or 0
- Dates: output as YYYY-MM-DD. IMPORTANT: Indian bills print dates as DD/MM/YYYY or DD-MM-YY (DAY FIRST) — e.g. '04/06/2026' means 4 June 2026 (NOT April 6). Never swap day and month.
- Numbers: no commas (165933.79 not 1,65,933.79)
- confidence: 0.0-1.0
- CGST+SGST: usually equal halves; inter-state uses IGST

Schema (extract ONLY these keys):
{
  ""confidence"": 0.95,
  ""supplier"": {""name"":"""", ""gst"":"""", ""pan"":"""", ""phone"":"""", ""address"":"""", ""city"":"""", ""state"":""""},
  ""buyer"": {""name"":"""", ""gst"":"""", ""pan"":"""", ""phone"":"""", ""address"":"""", ""city"":"""", ""state"":""""},
  ""invoice"": {""number"":"""", ""date"":"""", ""poNumber"":""""},
  ""items"": [{""name"":"""", ""hsnSac"":"""", ""qty"":0, ""unit"":""PCS"", ""rate"":0, ""taxRate"":5, ""taxableAmount"":0, ""totalAmount"":0}],
  ""totals"": {""taxableTotal"":0, ""cgst"":0, ""sgst"":0, ""igst"":0, ""grandTotal"":0},
  ""transport"": {""name"":"""", ""gst"":"""", ""lrNo"":"""", ""ewayBillNo"":"""", ""ewayBillDate"":""""}
}
";

    private async Task<ExtractedBillDto> CallGeminiAsync(IReadOnlyList<IFormFile> images, string apiKey, string model, CancellationToken ct)
    {
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        // MULTI-PAGE: one inlineData entry per page, followed by the text instruction.
        var parts = new List<object>();
        foreach (var image in images)
        {
            using var ms = new MemoryStream();
            await image.CopyToAsync(ms, ct);
            var imageBase64 = Convert.ToBase64String(ms.ToArray());
            parts.Add(new { inlineData = new { mimeType = image.ContentType ?? "image/jpeg", data = imageBase64 } });
        }

        var pageNote = images.Count > 1
            ? " These images are multiple pages of the SAME single invoice — combine all line items from every page into one items array; supplier/buyer/invoice/totals appear once."
            : "";
        parts.Add(new { text = "Extract this Indian GST invoice as JSON." + pageNote });

        // gemini-2.5-PRO sirf "thinking mode" me chalta hai — thinkingBudget=0 reject karta hai
        // ("Budget 0 is invalid. This model only works in thinking mode."). Isliye:
        //   Pro  → thinkingBudget = -1 (dynamic/auto thinking) + zyada output cap (thinking tokens kha jaata)
        //   Flash→ thinkingBudget = 0  (thinking off — fast/sasta)
        var isPro = model.Contains("pro", StringComparison.OrdinalIgnoreCase);
        var thinkBudget = isPro ? -1 : 0;
        var maxTokens = isPro ? 16384 : 8192;

        var requestBody = new
        {
            system_instruction = new { parts = new[] { new { text = BillPrompt } } },
            contents = new[]
            {
                new
                {
                    parts = parts.ToArray()
                }
            },
            generationConfig = new
            {
                responseMimeType = "application/json",
                temperature = 0.1,
                // 4096 was too small — Gemini "thinking" models output tokens internal reasoning par
                // kharch karte hain, JSON beech me cut ho jata tha. Cap raise kiya.
                maxOutputTokens = maxTokens,
                thinkingConfig = new { thinkingBudget = thinkBudget }
            }
        };

        var json = JsonSerializer.Serialize(requestBody, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _http.PostAsync(url, content, ct);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            throw new Exception($"Gemini API {response.StatusCode}: {err}");
        }

        var responseText = await response.Content.ReadAsStringAsync(ct);

        // DEBUG: log first 500 chars of raw response so we can diagnose extraction issues
        var snippet = responseText.Length > 500 ? responseText.Substring(0, 500) + "...[truncated]" : responseText;
        _log.LogInformation("Gemini raw response (pages={PageCount}, firstType={ContentType}, totalSize={SizeKb}KB): {Snippet}",
            images.Count, images[0].ContentType, images.Sum(i => i.Length) / 1024, snippet);

        var parsed = JsonDocument.Parse(responseText);
        var candidate = parsed.RootElement.GetProperty("candidates")[0];

        // If Gemini hit the token cap the reply is incomplete → fail loudly with a clear
        // message instead of throwing an opaque JSON parse error later.
        var finishReason = candidate.TryGetProperty("finishReason", out var fr) ? fr.GetString() : null;

        var text = candidate
            .GetProperty("content")
            .GetProperty("parts")[0]
            .GetProperty("text")
            .GetString() ?? "{}";

        // DEBUG: log the inner JSON text Gemini extracted
        var textSnippet = text.Length > 800 ? text.Substring(0, 800) + "...[truncated]" : text;
        _log.LogInformation("Gemini extracted JSON (finishReason={Reason}): {Json}", finishReason, textSnippet);

        if (finishReason == "MAX_TOKENS")
            throw new Exception(
                "Gemini response was cut off (hit token limit). The bill may have too many items — try a clearer/cropped image.");

        return ParseBillJson(text);
    }

    // =================================================
    // Claude (Anthropic) API call — firm's own key (BYOK)
    // =================================================
    private async Task<ExtractedBillDto> CallClaudeAsync(IReadOnlyList<IFormFile> images, string apiKey, string model, CancellationToken ct)
    {
        // BYOK fallback: Claude path uses only the FIRST page (single-page).
        var image = images[0];
        using var ms = new MemoryStream();
        await image.CopyToAsync(ms, ct);
        var imageBase64 = Convert.ToBase64String(ms.ToArray());

        var requestBody = new
        {
            model,
            max_tokens = 4096,
            temperature = 0.1,
            system = BillPrompt,
            messages = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "image", source = new { type = "base64", media_type = image.ContentType ?? "image/jpeg", data = imageBase64 } },
                        new { type = "text", text = "Extract this Indian GST invoice as JSON." }
                    }
                }
            }
        };

        var json = JsonSerializer.Serialize(requestBody);
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
        req.Headers.Add("x-api-key", apiKey);
        req.Headers.Add("anthropic-version", "2023-06-01");
        req.Content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _http.SendAsync(req, ct);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            throw new Exception($"Claude API {response.StatusCode}: {err}");
        }

        var responseText = await response.Content.ReadAsStringAsync(ct);
        var parsed = JsonDocument.Parse(responseText);
        var text = parsed.RootElement.GetProperty("content")[0].GetProperty("text").GetString() ?? "{}";
        _log.LogInformation("Claude extracted JSON ({Len} chars)", text.Length);
        return ParseBillJson(text);
    }

    // =================================================
    // OpenAI API call — firm's own key (BYOK)
    // =================================================
    private async Task<ExtractedBillDto> CallOpenAiAsync(IReadOnlyList<IFormFile> images, string apiKey, string model, CancellationToken ct)
    {
        // BYOK fallback: OpenAI path uses only the FIRST page (single-page).
        var image = images[0];
        using var ms = new MemoryStream();
        await image.CopyToAsync(ms, ct);
        var imageBase64 = Convert.ToBase64String(ms.ToArray());
        var dataUrl = $"data:{image.ContentType ?? "image/jpeg"};base64,{imageBase64}";

        var requestBody = new
        {
            model,
            max_tokens = 4096,
            temperature = 0.1,
            response_format = new { type = "json_object" },
            messages = new object[]
            {
                new { role = "system", content = BillPrompt },
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "text", text = "Extract this Indian GST invoice as JSON." },
                        new { type = "image_url", image_url = new { url = dataUrl } }
                    }
                }
            }
        };

        var json = JsonSerializer.Serialize(requestBody);
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions");
        req.Headers.Add("Authorization", $"Bearer {apiKey}");
        req.Content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _http.SendAsync(req, ct);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            throw new Exception($"OpenAI API {response.StatusCode}: {err}");
        }

        var responseText = await response.Content.ReadAsStringAsync(ct);
        var parsed = JsonDocument.Parse(responseText);
        var text = parsed.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "{}";
        _log.LogInformation("OpenAI extracted JSON ({Len} chars)", text.Length);
        return ParseBillJson(text);
    }

    // =================================================
    // Sarvam Vision (option B) — OCR + AI hybrid
    // -------------------------------------------------
    // Step 1: Sarvam Document Intelligence (doc-digitization) image(s) ko OCR karke
    //         markdown text deta hai (Indian scripts/handwriting acche se padhta hai).
    // Step 2: Us OCR text ko Gemini Flash (text-only) se structured JSON me badalte hain
    //         (wahi BillPrompt + ParseBillJson — sasta + deterministic).
    // Sarvam doc-digitization async batch hai: create job -> upload (zip) -> start -> poll
    // -> download (zip) -> unzip text. Server hi poll karta hai; frontend ko 1 hi response.
    // =================================================
    private const string SarvamDocBase = "https://api.sarvam.ai/doc-digitization/job/v1";

    private async Task<ExtractedBillDto> CallSarvamHybridAsync(
        IReadOnlyList<IFormFile> images, string sarvamKey, string geminiKey, CancellationToken ct)
    {
        // ---- 1. Saare pages ko ek flat ZIP me daalo (Sarvam ZIP me JPEG/PNG maangta hai) ----
        byte[] zipBytes;
        using (var zipMs = new MemoryStream())
        {
            using (var zip = new ZipArchive(zipMs, ZipArchiveMode.Create, true))
            {
                var idx = 0;
                foreach (var img in images)
                {
                    idx++;
                    var ext = (img.ContentType ?? "").Contains("png", StringComparison.OrdinalIgnoreCase) ? "png" : "jpg";
                    var entry = zip.CreateEntry($"page{idx}.{ext}", CompressionLevel.Fastest);
                    await using var es = entry.Open();
                    await img.CopyToAsync(es, ct);
                }
            }
            zipBytes = zipMs.ToArray();
        }

        // ---- 2. Create job (output md, language en-IN — GST bills mostly English/Hinglish) ----
        var createBody = JsonSerializer.Serialize(new
        {
            job_parameters = new { language = "en-IN", output_format = "md" }
        });
        var createResp = await SarvamPostAsync(SarvamDocBase, sarvamKey, createBody, ct);
        using var createDoc = JsonDocument.Parse(createResp);
        var jobId = createDoc.RootElement.GetProperty("job_id").GetString()
                    ?? throw new Exception("Sarvam: job_id missing");
        var storage = createDoc.RootElement.TryGetProperty("storage_container_type", out var st)
            ? st.GetString() ?? "" : "";

        // ---- 3. Upload URL maango (exactly 1 file: zip) ----
        var zipName = "bill_pages.zip";
        var upBody = JsonSerializer.Serialize(new { job_id = jobId, files = new[] { zipName } });
        var upResp = await SarvamPostAsync($"{SarvamDocBase}/upload-files", sarvamKey, upBody, ct);
        using var upDoc = JsonDocument.Parse(upResp);
        var uploadUrl = upDoc.RootElement.GetProperty("upload_urls").GetProperty(zipName)
            .GetProperty("file_url").GetString()
            ?? throw new Exception("Sarvam: upload_url missing");

        // ---- 4. Presigned URL par ZIP PUT karo (Azure ke liye x-ms-blob-type chahiye) ----
        using (var putReq = new HttpRequestMessage(HttpMethod.Put, uploadUrl))
        {
            putReq.Content = new ByteArrayContent(zipBytes);
            putReq.Content.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
            if (storage.Contains("Azure", StringComparison.OrdinalIgnoreCase))
                putReq.Headers.TryAddWithoutValidation("x-ms-blob-type", "BlockBlob");
            var putResp = await _http.SendAsync(putReq, ct);
            if (!putResp.IsSuccessStatusCode)
            {
                var e = await putResp.Content.ReadAsStringAsync(ct);
                throw new Exception($"Sarvam upload PUT {putResp.StatusCode}: {e}");
            }
        }

        // ---- 5. Job start ----
        await SarvamPostAsync($"{SarvamDocBase}/{jobId}/start", sarvamKey, "{}", ct);

        // ---- 6. Status poll (terminal: Completed / PartiallyCompleted / Failed) ----
        string state = "Pending";
        for (var i = 0; i < 40; i++)   // ~40 * 2.5s = 100s max
        {
            await Task.Delay(2500, ct);
            var stResp = await SarvamGetAsync($"{SarvamDocBase}/{jobId}/status", sarvamKey, ct);
            using var stDoc = JsonDocument.Parse(stResp);
            state = stDoc.RootElement.GetProperty("job_state").GetString() ?? "";
            if (state is "Completed" or "PartiallyCompleted" or "Failed") break;
        }
        if (state == "Failed")
            throw new Exception("Sarvam OCR job Failed — clearer image try karo ya doosra model chunein.");
        if (state is not ("Completed" or "PartiallyCompleted"))
            throw new Exception("Sarvam OCR abhi busy/slow hai (timeout). Thodi der baad try karo ya doosra model chunein.");

        // ---- 7. Download URLs (POST) → har URL GET → text nikaalo (zip ho to unzip) ----
        var dlResp = await SarvamPostAsync($"{SarvamDocBase}/{jobId}/download-files", sarvamKey, "{}", ct);
        using var dlDoc = JsonDocument.Parse(dlResp);
        var sb = new StringBuilder();
        foreach (var prop in dlDoc.RootElement.GetProperty("download_urls").EnumerateObject())
        {
            var fileUrl = prop.Value.GetProperty("file_url").GetString();
            if (string.IsNullOrEmpty(fileUrl)) continue;
            var bytes = await _http.GetByteArrayAsync(fileUrl, ct);
            sb.Append(ExtractTextFromDownload(bytes));
            sb.Append('\n');
        }
        var ocrText = sb.ToString().Trim();
        if (string.IsNullOrWhiteSpace(ocrText))
            throw new Exception("Sarvam OCR se text nahi mila — clearer image try karo ya doosra model chunein.");

        _log.LogInformation("Sarvam OCR text ({Len} chars) extracted — Gemini se structure kar rahe", ocrText.Length);

        // ---- 8. OCR text → structured JSON (Gemini Flash text-only) ----
        return await CallGeminiTextAsync(ocrText, geminiKey, "gemini-2.5-flash", ct);
    }

    // Download bytes ko text me badlo. ZIP (PK header) ho to andar ke .md/.json/.txt/.html
    // entries ka content jodo; warna seedha UTF-8 text maan lo.
    private static string ExtractTextFromDownload(byte[] bytes)
    {
        // ZIP signature: 'P''K' (0x50 0x4B)
        if (bytes.Length > 4 && bytes[0] == 0x50 && bytes[1] == 0x4B)
        {
            var sb = new StringBuilder();
            using var ms = new MemoryStream(bytes);
            using var zip = new ZipArchive(ms, ZipArchiveMode.Read);
            foreach (var entry in zip.Entries)
            {
                var n = entry.FullName.ToLowerInvariant();
                if (n.EndsWith(".md") || n.EndsWith(".json") || n.EndsWith(".txt") || n.EndsWith(".html") || n.EndsWith(".htm"))
                {
                    using var es = entry.Open();
                    using var sr = new StreamReader(es, Encoding.UTF8);
                    sb.Append(sr.ReadToEnd());
                    sb.Append('\n');
                }
            }
            return sb.ToString();
        }
        return Encoding.UTF8.GetString(bytes);
    }

    private async Task<string> SarvamPostAsync(string url, string key, string jsonBody, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Add("api-subscription-key", key);
        req.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
        var resp = await _http.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            throw new Exception($"Sarvam {resp.StatusCode}: {body}");
        return body;
    }

    private async Task<string> SarvamGetAsync(string url, string key, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Add("api-subscription-key", key);
        var resp = await _http.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            throw new Exception($"Sarvam {resp.StatusCode}: {body}");
        return body;
    }

    // Gemini Flash TEXT-only structuring — image nahi, OCR text se JSON (Sarvam hybrid step 2).
    private async Task<ExtractedBillDto> CallGeminiTextAsync(string ocrText, string apiKey, string model, CancellationToken ct)
    {
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
        var userText =
            "Below is the OCR text (markdown) extracted from an Indian GST invoice. " +
            "Extract it as JSON per the schema. Use ONLY this text.\n\n----- OCR TEXT -----\n" + ocrText;

        var requestBody = new
        {
            system_instruction = new { parts = new[] { new { text = BillPrompt } } },
            contents = new[] { new { parts = new object[] { new { text = userText } } } },
            generationConfig = new
            {
                responseMimeType = "application/json",
                temperature = 0.1,
                maxOutputTokens = 8192,
                thinkingConfig = new { thinkingBudget = 0 }
            }
        };

        var json = JsonSerializer.Serialize(requestBody, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        var response = await _http.PostAsync(url, content, ct);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            throw new Exception($"Gemini (structuring) {response.StatusCode}: {err}");
        }
        var responseText = await response.Content.ReadAsStringAsync(ct);
        var parsed = JsonDocument.Parse(responseText);
        var candidate = parsed.RootElement.GetProperty("candidates")[0];
        var finishReason = candidate.TryGetProperty("finishReason", out var fr) ? fr.GetString() : null;
        var text = candidate.GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString() ?? "{}";
        if (finishReason == "MAX_TOKENS")
            throw new Exception("Gemini structuring response cut off (token limit) — bill bahut bada hai, clearer/cropped image try karo.");
        return ParseBillJson(text);
    }

    // =================================================
    // Shared lenient JSON → DTO parsing (all providers)
    // =================================================
    private ExtractedBillDto ParseBillJson(string text)
    {
        // Defensive: strip any accidental ```json fences before parsing.
        var cleaned = text.Trim();
        if (cleaned.StartsWith("```"))
            cleaned = cleaned.Trim('`').Replace("json\n", "", StringComparison.OrdinalIgnoreCase).Trim();

        // Trim anything before the first '{' / after the last '}' (stray prose/markers).
        var firstBrace = cleaned.IndexOf('{');
        var lastBrace = cleaned.LastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace)
            cleaned = cleaned.Substring(firstBrace, lastBrace - firstBrace + 1);

        // LENIENT parsing — models occasionally emit trailing commas or numbers as
        // strings ("88" instead of 88). Without these options System.Text.Json throws
        // opaque errors like "'{' is an invalid start of a property name … Path: $.items[0]".
        var jsonOpts = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            AllowTrailingCommas = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
            NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString
        };

        try
        {
            return JsonSerializer.Deserialize<ExtractedBillDto>(cleaned, jsonOpts)!;
        }
        catch (JsonException)
        {
            // REPAIR PASS — sabse common wajah: string ke andar raw newline/control chars
            // (item name me 60" WIDTH jaisi cheezein bhi aati hain). Newlines ko space se
            // badal kar dobara try karo — token ke beech whitespace valid hai, string ke
            // andar wala invalid newline bhi theek ho jata hai.
            var repaired = new string(cleaned.Select(c => char.IsControl(c) ? ' ' : c).ToArray());
            try
            {
                return JsonSerializer.Deserialize<ExtractedBillDto>(repaired, jsonOpts)!;
            }
            catch (JsonException)
            {
                // REPAIR PASS 2 — string ke ANDAR unescaped quote (textile bills me aam:
                // 60" PRINT, 44" WIDTH). Use \" me badal kar last try.
                try
                {
                    return JsonSerializer.Deserialize<ExtractedBillDto>(FixUnescapedQuotes(repaired), jsonOpts)!;
                }
                catch (JsonException jex2)
                {
                    _log.LogError("AI returned unparseable JSON: {Err}. Raw: {Raw}", jex2.Message, cleaned);
                    throw new Exception(
                        "AI ne galat format mein data bheja (JSON parse fail). Dobara Analyze karein ya clearer image use karein.");
                }
            }
        }
    }

    // =================================================
    // Mock — realistic sample bill
    // =================================================
    private ExtractedBillDto GenerateMockBill()
    {
        var random = new Random();
        var billNo = random.Next(100, 999).ToString();
        var qty1 = random.Next(40, 100);
        var qty2 = random.Next(40, 100);
        var rate = random.Next(400, 550);

        return new ExtractedBillDto
        {
            Confidence = 0.92m,
            ModelUsed = "mock",
            Supplier = new PartyInfo
            {
                Name = "Parvati Export",
                Gst = "08PQRST5678B2Z6",
                Address = "Plot 14, Industrial Area",
                City = "Jaipur",
                State = "Rajasthan",
                Pincode = "302001",
                Phone = "+91 98222 23333"
            },
            Buyer = new PartyInfo
            {
                Name = "Bawa Collection",
                Gst = "07ABCDE1234A1Z5",
                Address = "Karol Bagh",
                City = "Delhi",
                State = "Delhi",
                Pincode = "110005"
            },
            Invoice = new InvoiceInfo
            {
                Number = billNo,
                Date = DateTime.Today.ToString("yyyy-MM-dd")
            },
            Items = new List<BillItem>
            {
                new() { Name = "Design 3030", HsnSac = "63062200", Qty = qty1, Unit = "PCS",
                        Rate = rate, TaxRate = 5,
                        TaxableAmount = qty1 * rate,
                        TotalAmount = qty1 * rate * 1.05m },
                new() { Name = "Karina", HsnSac = "63062200", Qty = qty2, Unit = "PCS",
                        Rate = rate, TaxRate = 5,
                        TaxableAmount = qty2 * rate,
                        TotalAmount = qty2 * rate * 1.05m }
            },
            Totals = BuildMockTotals(qty1, qty2, rate),
            Transport = new TransportInfo { Name = "By Road", VehicleNo = "RJ-14-AB-1234" }
        };
    }

    private TotalsInfo BuildMockTotals(decimal qty1, decimal qty2, decimal rate)
    {
        var taxable = qty1 * rate + qty2 * rate;
        var tax = taxable * 0.05m;
        return new TotalsInfo
        {
            TaxableTotal = taxable,
            Cgst = tax / 2,
            Sgst = tax / 2,
            Igst = 0,
            GrandTotal = taxable + tax,
            AmountInWords = $"Rupees {ToWords(taxable + tax)} Only"
        };
    }

    private string ToWords(decimal amount)
    {
        // Very simple stub — real impl would convert to Indian number words
        return $"{(int)amount:N0}";
    }

    // =================================================
    // Helpers
    // =================================================
    // Hash over ALL pages combined so a multi-page set has its own distinct cache key
    // (incremental SHA-256 over each page's bytes in order).
    private static async Task<string> ComputeHashAsync(IReadOnlyList<IFormFile> files)
    {
        using var sha = SHA256.Create();
        for (var i = 0; i < files.Count; i++)
        {
            using var ms = new MemoryStream();
            await files[i].CopyToAsync(ms);
            var bytes = ms.ToArray();
            sha.TransformBlock(bytes, 0, bytes.Length, null, 0);
        }
        sha.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
        return Convert.ToHexString(sha.Hash!);
    }

    // Platform AI keys — Anjaninex super-admin EK BAAR set karta hai (platform.billing_settings id=1).
    // DB keys appsettings ke fallbacks par PRECEDENCE leti hain. Raw SQL (same as BillingSettingsController).
    // Khali ho to behavior pehle jaisa = appsettings/BYOK.
    private readonly record struct PlatformAiKeys(string Gemini, string Claude, string OpenAi, string Sarvam);

    private async Task<PlatformAiKeys> ReadPlatformAiKeysAsync(CancellationToken ct)
    {
        try
        {
            var conn = (Npgsql.NpgsqlConnection)_db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText =
                @"SELECT ai_gemini_key, ai_claude_key, ai_openai_key, ai_sarvam_key
                  FROM platform.billing_settings WHERE id = 1";
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
                return new PlatformAiKeys(
                    r["ai_gemini_key"] as string ?? "",
                    r["ai_claude_key"] as string ?? "",
                    r["ai_openai_key"] as string ?? "",
                    r["ai_sarvam_key"] as string ?? "");
        }
        catch (Exception ex)
        {
            // Migration na chali ho / table na ho — gracefully appsettings fallback par chalo.
            _log.LogWarning(ex, "Platform AI keys read fail — appsettings/BYOK par fallback");
        }
        return new PlatformAiKeys("", "", "", "");
    }

    // JSON string ke ANDAR aaye unescaped quotes ko \" me badlo.
    // Textile bills me item names me inch-mark hota hai: "name": "60" PRINT"
    // Rule: string ke andar " mile aur uske baad (spaces chhod kar) , } ] : ya
    // line-end NA ho, to wo string ka end nahi — escape kar do.
    private static string FixUnescapedQuotes(string s)
    {
        var sb = new StringBuilder(s.Length + 16);
        var inStr = false;
        for (var i = 0; i < s.Length; i++)
        {
            var c = s[i];
            if (!inStr)
            {
                if (c == '"') inStr = true;
                sb.Append(c);
                continue;
            }
            if (c == '\\' && i + 1 < s.Length) { sb.Append(c); sb.Append(s[++i]); continue; }
            if (c == '"')
            {
                var j = i + 1;
                while (j < s.Length && (s[j] == ' ' || s[j] == '\t')) j++;
                var n = j < s.Length ? s[j] : ',';
                if (n == ',' || n == '}' || n == ']' || n == ':' || n == '\r' || n == '\n')
                {
                    inStr = false;
                    sb.Append(c);          // asli string-end
                }
                else
                {
                    sb.Append("\\\"");     // inch-mark jaisa andar wala quote → escape
                }
                continue;
            }
            sb.Append(c);
        }
        return sb.ToString();
    }

    // Phone field se SIRF 10-digit Indian mobile (6-9 se shuru) nikalo.
    // '(Mo):9929161841 (Ph):0141-2577800' → '9929161841'
    // Labels, landline/STD ((0261)2331456), +91 prefix — sab hata do. Mobile na mile to "".
    private static string CleanPhone(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";
        foreach (System.Text.RegularExpressions.Match m in
                 System.Text.RegularExpressions.Regex.Matches(raw, @"\d[\d\s\-]{7,}\d"))
        {
            var d = new string(m.Value.Where(char.IsDigit).ToArray());
            if (d.Length == 12 && d.StartsWith("91")) d = d.Substring(2);   // +91XXXXXXXXXX
            if (d.Length == 11 && d.StartsWith("0")) d = d.Substring(1);    // 0XXXXXXXXXX
            if (d.Length == 10 && d[0] >= '6' && d[0] <= '9') return d;     // valid mobile
        }
        return "";
    }

    private static string ValidateGst(string? gst)
    {
        if (string.IsNullOrWhiteSpace(gst)) return "";
        var clean = gst.Trim().ToUpperInvariant().Replace(" ", "").Replace("-", "");

        // DO NOT blank out an imperfect GSTIN. The old code returned "" whenever the value
        // wasn't a textbook-perfect PAN-pattern GSTIN — so a real/OCR-slightly-off GSTIN like
        // 24AYXP38534B1Z7 was SILENTLY WIPED, leaving supplier GST empty. That was the #1
        // recurring "GST nahi padha" failure.
        //
        // New: accept any 15 alphanumeric chars as-is. If not exactly 15 but still partial
        // GSTIN-like (>=10 chars), keep it so the user SEES it and fixes one char instead of
        // re-typing. Only blank genuine garbage.
        if (Regex.IsMatch(clean, @"^[0-9A-Z]{15}$"))
            return clean;
        return clean.Length >= 10 ? clean : "";
    }

    private static decimal AdjustConfidence(ExtractedBillDto dto)
    {
        decimal c = dto.Confidence;
        if (string.IsNullOrEmpty(dto.Supplier.Name)) c -= 0.2m;
        if (string.IsNullOrEmpty(dto.Invoice.Number)) c -= 0.2m;
        if (dto.Totals.GrandTotal == 0) c -= 0.2m;
        if (dto.Items.Count == 0) c -= 0.1m;
        return Math.Max(0, Math.Min(1, c));
    }
}
