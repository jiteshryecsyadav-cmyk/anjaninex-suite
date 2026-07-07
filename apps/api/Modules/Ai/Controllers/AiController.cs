using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Ai.Services;

namespace Namokara.Api.Modules.Ai.Controllers;

[ApiController]
[Route("api/ai")]
[Authorize]
[ModuleAccess("ai_scan")]     // 🔒 Backend gate — firm must have AI module enabled
[EnableRateLimiting("ai")]    // P0-11: 30 AI scans/min per firm
public class AiController : ControllerBase
{
    private readonly IBillExtractorService _billExtractor;
    private readonly ILogger<AiController> _log;
    private readonly AppDbContext _db;

    public AiController(IBillExtractorService billExtractor, ILogger<AiController> log, AppDbContext db)
    {
        _billExtractor = billExtractor;
        _log = log;
        _db = db;
    }

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    [HttpPost("extract-bill")]
    [HasPermission("ai.bill_scan.use.branch")]
    [RequestSizeLimit(25 * 1024 * 1024)]    // 25 MB — multi-page bill set (max 5 pages)
    public async Task<IActionResult> ExtractBill(CancellationToken ct)
    {
        // Multi-page: read ALL uploaded files (works for single + multiple).
        // Frontend appends each page under the same 'image' field name.
        var images = Request.Form.Files.ToList();

        if (images.Count == 0 || images.All(f => f.Length == 0))
            return BadRequest(new { error = "Image file required" });

        if (images.Count > 5)
            return BadRequest(new { error = "Too many pages (max 5)" });

        if (images.Any(f => f.Length > 5 * 1024 * 1024))
            return BadRequest(new { error = "A page is too large (max 5 MB each)" });

        if (images.Sum(f => f.Length) > 12 * 1024 * 1024)
            return BadRequest(new { error = "Total upload too large (max 12 MB)" });

        // bill ya order — scan report me alag dikhane ke liye
        var source = Request.Form["source"].FirstOrDefault() == "order" ? "order" : "bill";

        // Scan model chooser: flash | pro | sonnet (query param ?model= ya form field 'model').
        // Koi aur value ya khali → null bhejo → backend default (firm BYOK / Flash) behave karega.
        var modelChoice = Request.Query["model"].FirstOrDefault()
                          ?? Request.Form["model"].FirstOrDefault();

        try
        {
            var result = await _billExtractor.ExtractBill(images, CurrentFirmId, CurrentUserId, ct, source, modelChoice);
            return Ok(result);
        }
        catch (InsufficientWalletException ex)
        {
            return StatusCode(402, new { error = ex.Message, code = "WALLET_INSUFFICIENT" });
        }
        catch (ArgumentException ex)
        {
            // e.g. Sonnet chuna par Claude key set nahi — clean 400, frontend banner dikhayega.
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Bill extraction failed");
            // Asli wajah frontend ko bhejo (sirf message, stack nahi) taaki user/dev ko pata chale
            return StatusCode(500, new { error = "AI scan fail: " + ex.Message });
        }
    }

    [HttpPost("extract-cheque")]
    [HasPermission("ai.bill_scan.use.branch")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> ExtractCheque(CancellationToken ct)
    {
        var images = Request.Form.Files.ToList();
        if (images.Count == 0 || images.All(f => f.Length == 0))
            return BadRequest(new { error = "Cheque image required" });
        if (images.Any(f => f.Length > 5 * 1024 * 1024))
            return BadRequest(new { error = "Image too large (max 5 MB)" });
        try
        {
            var result = await _billExtractor.ExtractCheque(images.Take(1).ToList(), CurrentFirmId, ct);
            return Ok(result);
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _log.LogError(ex, "Cheque extraction failed");
            return StatusCode(500, new { error = "Cheque scan fail: " + ex.Message });
        }
    }

    // Scan count — is month + total (ai_extraction_logs se real count, cache-hit free hote hain)
    [HttpGet("usage")]
    [HasPermission("ai.bill_scan.use.branch")]
    public async Task<IActionResult> Usage()
    {
        var firmId = CurrentFirmId;
        var now = DateTimeOffset.UtcNow;
        var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);

        var usedThisMonth = await _db.AiExtractionLogs
            .CountAsync(l => l.FirmId == firmId && l.CreatedAt >= monthStart);
        var total = await _db.AiExtractionLogs.CountAsync(l => l.FirmId == firmId);
        var quota = await _db.Firms.Where(f => f.Id == firmId)
            .Select(f => f.AiQuotaMonthly).FirstOrDefaultAsync();

        // Har scan ka date-time punch hota hai (created_at) — last scan IST me dikhao
        var lastUtc = await _db.AiExtractionLogs
            .Where(l => l.FirmId == firmId)
            .OrderByDescending(l => l.CreatedAt)
            .Select(l => (DateTimeOffset?)l.CreatedAt)
            .FirstOrDefaultAsync();
        var ist = TimeSpan.FromMinutes(330);
        var lastScanAt = lastUtc.HasValue
            ? lastUtc.Value.ToOffset(ist).ToString("dd-MMM HH:mm")
            : null;

        return Ok(new { usedThisMonth, total, quotaMonthly = quota, lastScanAt });
    }

    // Scan Report — S.No (frontend), Date, Time, Bill/Order, model, confidence, user
    [HttpGet("scan-report")]
    [HasPermission("ai.bill_scan.use.branch")]
    public async Task<IActionResult> ScanReport([FromQuery] int limit = 200)
    {
        var firmId = CurrentFirmId;
        var ist = TimeSpan.FromMinutes(330);

        var rows = await _db.AiExtractionLogs
            .Where(l => l.FirmId == firmId)
            .OrderByDescending(l => l.CreatedAt)
            .Take(limit)
            .Select(l => new { l.AgentName, l.ModelUsed, l.Confidence, l.CreatedAt, l.UserId })
            .ToListAsync();

        var userIds = rows.Select(r => r.UserId).Distinct().ToList();
        var users = await _db.Users
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        return Ok(rows.Select(r => new
        {
            date = r.CreatedAt.ToOffset(ist).ToString("dd-MM-yyyy"),
            time = r.CreatedAt.ToOffset(ist).ToString("HH:mm:ss"),
            type = r.AgentName == "order_scan" ? "Order" : "Bill",
            model = r.ModelUsed,
            confidence = r.Confidence,
            user = users.TryGetValue(r.UserId, out var n) ? n : ""
        }));
    }

    [HttpGet("recent-extractions")]
    [HasPermission("ai.bill_scan.use.branch")]
    public async Task<IActionResult> Recent([FromQuery] int limit = 20)
        => Ok(await _billExtractor.RecentExtractions(CurrentFirmId, limit));

    [HttpPost("mark-corrected/{id}")]
    [HasPermission("ai.bill_scan.use.branch")]
    public async Task<IActionResult> MarkCorrected(Guid id, [FromBody] object diff)
    {
        await _billExtractor.MarkCorrected(id, diff);
        return NoContent();
    }
}
