using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Entities;
using System.Text.Json;

namespace Namokara.Api.Modules.Platform.Controllers;

public record FirmSubscriptionDto(
    Guid FirmId,
    string FirmName,
    string Status,
    string? PlanCode,
    string PlanName,
    decimal? MonthlyInr,
    Dictionary<string, bool> EnabledModules,
    int UserLimit, int BranchLimit, int AiQuotaMonthly,
    int AiUsedThisMonth, decimal WalletBalance,
    DateTimeOffset? TrialEndsAt, DateTimeOffset? SubscriptionEndsAt);

public record UpdateFirmModulesDto(
    Dictionary<string, bool>? EnabledModules,
    string? PlanCode,
    int? UserLimit, int? BranchLimit, int? AiQuotaMonthly);

public record SubscriptionPlanDto(
    Guid Id, string Code, string Name,
    decimal? MonthlyInr, decimal? AnnualInr,
    int MaxBranches, int MaxUsers, int MaxAiCalls,
    Dictionary<string, bool> Features, int? SortOrder);

[Authorize]
[ApiController]
[Route("api/admin/firms/{firmId:guid}")]
public class AdminFirmModulesController : ControllerBase
{
    private readonly AppDbContext _db;
    public AdminFirmModulesController(AppDbContext db) => _db = db;

    [HttpGet("subscription")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> GetSubscription(Guid firmId)
    {
        var firm = await _db.Firms.AsNoTracking()
            .Where(f => f.Id == firmId)
            .FirstOrDefaultAsync();
        if (firm == null) return NotFound();

        var planName = firm.PlanCode != null
            ? await _db.SubscriptionPlans.Where(p => p.Code == firm.PlanCode)
                .Select(p => p.Name).FirstOrDefaultAsync() ?? firm.PlanCode
            : "—";

        var planPrice = firm.PlanCode != null
            ? await _db.SubscriptionPlans.Where(p => p.Code == firm.PlanCode)
                .Select(p => p.MonthlyInr).FirstOrDefaultAsync()
            : null;

        return Ok(new FirmSubscriptionDto(
            firm.Id, firm.Name, firm.Status,
            firm.PlanCode, planName, planPrice,
            ParseModules(firm.EnabledModules),
            firm.UserLimit, firm.BranchLimit, firm.AiQuotaMonthly,
            firm.AiUsedThisMonth, firm.WalletBalance,
            firm.TrialEndsAt, firm.SubscriptionEndsAt
        ));
    }

    /// <summary>List all available plan templates (for the dropdown).</summary>
    [HttpGet("/api/admin/plans/templates")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> ListPlans()
    {
        var plans = await _db.SubscriptionPlans.AsNoTracking()
            .Where(p => p.IsActive)
            .OrderBy(p => p.SortOrder)
            .ToListAsync();

        return Ok(plans.Select(p => new SubscriptionPlanDto(
            p.Id, p.Code, p.Name, p.MonthlyInr, p.AnnualInr,
            p.MaxBranches, p.MaxUsers, p.MaxAiCalls,
            ParseModules(p.Features), p.SortOrder
        )));
    }

    /// <summary>Update firm's modules/plan/limits. Admin-only.</summary>
    [HttpPatch("subscription")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> UpdateSubscription(Guid firmId, [FromBody] UpdateFirmModulesDto dto)
    {
        var firm = await _db.Firms.FirstOrDefaultAsync(f => f.Id == firmId);
        if (firm == null) return NotFound();

        if (dto.PlanCode != null)
        {
            var plan = await _db.SubscriptionPlans.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Code == dto.PlanCode);
            if (plan == null) return BadRequest(new { error = $"Unknown plan code: {dto.PlanCode}" });
            firm.PlanCode = plan.Code;
        }

        if (dto.EnabledModules != null && dto.EnabledModules.Count > 0)
        {
            firm.EnabledModules = JsonSerializer.Serialize(dto.EnabledModules);
        }

        if (dto.UserLimit.HasValue) firm.UserLimit = dto.UserLimit.Value;
        if (dto.BranchLimit.HasValue) firm.BranchLimit = dto.BranchLimit.Value;
        if (dto.AiQuotaMonthly.HasValue) firm.AiQuotaMonthly = dto.AiQuotaMonthly.Value;

        firm.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        // Invalidate the module-access cache for this firm so changes take effect immediately
        ModuleAccessHandler.Invalidate(firmId);

        return Ok(new { ok = true, message = "Subscription updated. Customer will see changes immediately." });
    }

    /// <summary>Quick action: apply a plan's defaults to a firm (overwrites enabled_modules + limits).</summary>
    [HttpPost("apply-plan/{planCode}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> ApplyPlan(Guid firmId, string planCode)
    {
        var firm = await _db.Firms.FirstOrDefaultAsync(f => f.Id == firmId);
        if (firm == null) return NotFound();

        var plan = await _db.SubscriptionPlans.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Code == planCode);
        if (plan == null) return BadRequest(new { error = $"Plan '{planCode}' not found" });

        firm.PlanCode = plan.Code;
        firm.EnabledModules = plan.Features;
        firm.UserLimit = plan.MaxUsers;
        firm.BranchLimit = plan.MaxBranches;
        firm.AiQuotaMonthly = plan.MaxAiCalls;
        firm.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        ModuleAccessHandler.Invalidate(firmId);

        return Ok(new { ok = true, message = $"Plan '{plan.Name}' applied to firm." });
    }

    private static Dictionary<string, bool> ParseModules(string json)
    {
        var result = new Dictionary<string, bool>();
        if (string.IsNullOrWhiteSpace(json)) return result;
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                result[prop.Name] = prop.Value.ValueKind == JsonValueKind.True;
            }
        }
        catch (JsonException) { }
        return result;
    }
}
