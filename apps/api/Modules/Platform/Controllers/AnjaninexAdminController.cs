using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Entities;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize]
public class AnjaninexAdminController : ControllerBase
{
    private readonly IPlatformAdminService _svc;
    private readonly IChangelogService _changelog;
    private readonly AppDbContext _db;

    public AnjaninexAdminController(IPlatformAdminService svc, IChangelogService changelog, AppDbContext db)
    {
        _svc = svc;
        _changelog = changelog;
        _db = db;
    }

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    // ---------------- KPI ----------------
    [HttpGet("kpi")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Kpi() => Ok(await _svc.AnjaninexKpi());

    [HttpGet("daily-revenue")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> DailyRevenue([FromQuery] int days = 30)
        => Ok(await _svc.DailyRevenue(days));

    [HttpGet("top-firms")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> TopFirms([FromQuery] int top = 10)
        => Ok(await _svc.TopFirmsByRevenue(top));

    [HttpGet("low-balance")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> LowBalance() => Ok(await _svc.LowBalanceFirms());

    // ---------------- Firms ----------------
    [HttpGet("firms")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Firms([FromQuery] string? search, [FromQuery] string? status)
        => Ok(await _svc.ListFirms(search, status));

    [HttpGet("firms/{id}")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> FirmDetail(Guid id)
    {
        var f = await _svc.GetFirm(id);
        return f is null ? NotFound() : Ok(f);
    }

    [HttpGet("firms/{id}/wallet-history")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> WalletHistory(Guid id, [FromQuery] int limit = 50)
        => Ok(await _svc.FirmWalletHistory(id, limit));

    [HttpPost("firms/{id}/recharge")]
    [HasPermission("platform.wallet.recharge.platform")]
    public async Task<IActionResult> Recharge(Guid id, [FromBody] AdminRechargeDto dto)
    {
        await _svc.RechargeFirmWallet(id, dto.Amount, dto.Source ?? "manual", dto.Reference ?? "", CurrentUserId);
        return Ok(new { success = true });
    }

    [HttpPost("firms/{id}/suspend")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Suspend(Guid id)
    {
        await _svc.SuspendFirm(id);
        return Ok();
    }

    [HttpPost("firms/{id}/activate")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Activate(Guid id)
    {
        await _svc.ActivateFirm(id);
        return Ok();
    }

    [HttpPost("firms/{id}/change-plan")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> ChangePlan(Guid id, [FromBody] ChangePlanDto dto)
    {
        await _svc.ChangePlan(id, dto.PlanId);
        return Ok();
    }

    // ---------------- AI Cost Monitor ----------------
    [HttpGet("ai/cost-breakdown")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> AiCost([FromQuery] int days = 30)
        => Ok(await _svc.AiCostBreakdown(days));

    [HttpGet("ai/daily-revenue")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> AiDailyRev([FromQuery] int days = 30)
        => Ok(await _svc.AiDailyRevenue(days));

    [HttpPost("firms")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> CreateFirm([FromBody] CreateFirmDto dto)
    {
        try { return Ok(await _svc.CreateFirm(dto, CurrentUserId)); }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    // ---------------- BYOK: per-firm API keys (super-admin only) ----------------
    [HttpGet("firms/{id}/api-keys")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> GetApiKeys(Guid id)
    {
        var k = await _db.FirmApiKeys.FindAsync(id);
        return Ok(new
        {
            aiProvider = k?.AiProvider ?? "gemini",
            aiModel = k?.AiModel,
            aiKeySet = !string.IsNullOrEmpty(k?.AiApiKey),
            aiKeyMasked = Mask(k?.AiApiKey),
            mapsKeySet = !string.IsNullOrEmpty(k?.MapsApiKey),
            mapsKeyMasked = Mask(k?.MapsApiKey)
        });
    }

    [HttpPut("firms/{id}/api-keys")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> SaveApiKeys(Guid id, [FromBody] SaveApiKeysDto dto)
    {
        var k = await _db.FirmApiKeys.FindAsync(id);
        if (k == null)
        {
            k = new FirmApiKeys { FirmId = id };
            _db.FirmApiKeys.Add(k);
        }
        k.AiProvider = string.IsNullOrWhiteSpace(dto.AiProvider) ? "gemini" : dto.AiProvider.Trim().ToLowerInvariant();
        if (dto.AiApiKey != null)   // null = no change; "" = clear
            k.AiApiKey = string.IsNullOrWhiteSpace(dto.AiApiKey) ? null : dto.AiApiKey.Trim();
        k.AiModel = string.IsNullOrWhiteSpace(dto.AiModel) ? null : dto.AiModel.Trim();
        if (dto.MapsApiKey != null)
            k.MapsApiKey = string.IsNullOrWhiteSpace(dto.MapsApiKey) ? null : dto.MapsApiKey.Trim();
        k.UpdatedBy = CurrentUserId;
        k.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    private static string? Mask(string? key)
    {
        if (string.IsNullOrEmpty(key)) return null;
        return key.Length <= 8 ? "****" : $"{key[..6]}…{key[^4..]}";
    }

    // ---------------- Plans ----------------
    [HttpGet("plans")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Plans() => Ok(await _svc.ListPlans());

    [HttpPost("plans")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> CreatePlan([FromBody] CreatePlanDto dto)
        => Ok(await _svc.CreatePlan(dto));

    [HttpPut("plans/{id}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> UpdatePlan(Guid id, [FromBody] CreatePlanDto dto)
        => Ok(await _svc.UpdatePlan(id, dto));

    [HttpPost("plans/{id}/toggle")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> TogglePlan(Guid id)
    {
        await _svc.TogglePlanActive(id);
        return Ok();
    }

    [HttpDelete("plans/{id}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> DeletePlan(Guid id)
    {
        var ok = await _svc.DeletePlan(id);
        if (!ok) return BadRequest(new { error = "Is plan par firms hain — pehle unhe doosre plan par bhejo, fir delete." });
        return NoContent();
    }

    // ---------------- Changelog Publisher ----------------
    [HttpGet("changelog")]
    [HasPermission("platform.changelog.publish.platform")]
    public async Task<IActionResult> Changelog() => Ok(await _changelog.GetHistory(50));

    [HttpPost("changelog")]
    [HasPermission("platform.changelog.publish.platform")]
    public async Task<IActionResult> PublishChangelog([FromBody] Namokara.Api.Modules.Platform.Entities.ChangelogEntry entry)
    {
        var saved = await _changelog.Publish(entry);
        return Ok(saved);
    }
}

public record AdminRechargeDto(decimal Amount, string? Source, string? Reference);
public record ChangePlanDto(Guid PlanId);
public record SaveApiKeysDto(string? AiProvider, string? AiApiKey, string? AiModel, string? MapsApiKey);
