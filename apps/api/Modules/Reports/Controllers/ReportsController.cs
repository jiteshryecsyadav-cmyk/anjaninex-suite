using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Reports.Services;

namespace Namokara.Api.Modules.Reports.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize]
public class CrossModuleReportsController : ControllerBase
{
    private readonly IReportsAggregateService _svc;

    public CrossModuleReportsController(IReportsAggregateService svc) => _svc = svc;

    // Report defaults use IST "today" (server runs UTC on prod) so date ranges align with India.
    private static readonly TimeZoneInfo IstZone = ResolveIst();
    private static TimeZoneInfo ResolveIst()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("India Standard Time"); }
    }
    private static DateOnly IstToday()
        => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstZone).Date);

    [HttpGet("kpi")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> Kpi() => Ok(await _svc.ExecutiveKpi());

    [HttpGet("daily-sales-trend")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> DailyTrend([FromQuery] int days = 30)
        => Ok(await _svc.DailySalesTrend(days));

    [HttpGet("sales-register")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> SalesRegister(
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] string? status)
    {
        // FROM na bheja ho to SAARE bills (pehle current month default tha — purane bills gayab ho jate the)
        var f = from ?? new DateOnly(2000, 1, 1);
        var t = to ?? IstToday();
        return Ok(await _svc.SalesRegister(f, t, status));
    }

    [HttpGet("outstanding")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> Outstanding([FromQuery] DateOnly? asOf)
        => Ok(await _svc.Outstanding(asOf ?? IstToday()));

    [HttpGet("party-outstanding")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> PartyOutstanding([FromQuery] DateOnly? asOf)
        => Ok(await _svc.PartyWiseOutstanding(asOf ?? IstToday()));

    [HttpGet("top-parties")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> TopParties(
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int top = 20)
    {
        var f = from ?? new DateOnly(IstToday().Year, 4, 1);
        var t = to ?? IstToday();
        return Ok(await _svc.TopParties(f, t, top));
    }

    [HttpGet("top-items")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> TopItems(
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int top = 20)
    {
        var f = from ?? new DateOnly(IstToday().Year, 4, 1);
        var t = to ?? IstToday();
        return Ok(await _svc.TopItems(f, t, top));
    }

    [HttpGet("gst-summary")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> GstSummary([FromQuery] DateOnly? from, [FromQuery] DateOnly? to)
    {
        var f = from ?? new DateOnly(IstToday().Year, IstToday().Month, 1);
        var t = to ?? IstToday();
        var (summary, byRate) = await _svc.GstSummary(f, t);
        return Ok(new { summary, byRate });
    }

    [HttpGet("payment-mode")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> PaymentMode([FromQuery] DateOnly? from, [FromQuery] DateOnly? to)
    {
        var f = from ?? new DateOnly(IstToday().Year, IstToday().Month, 1);
        var t = to ?? IstToday();
        return Ok(await _svc.PaymentModeBreakdown(f, t));
    }

    [HttpGet("daily-cashflow")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> DailyCashflow([FromQuery] int days = 30)
        => Ok(await _svc.DailyCashflow(days));
}
