using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

[ApiController]
[Route("api/subscription")]
[Authorize]
public class SubscriptionController : ControllerBase
{
    private readonly ISubscriptionService _svc;
    private readonly AppDbContext _db;
    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    public SubscriptionController(ISubscriptionService svc, AppDbContext db) { _svc = svc; _db = db; }

    /// <summary>
    /// Saare active plans — firm users ko sidebar "Plans" page par dikhte hain
    /// (upgrade sochne ke liye; kharidne ke liye Anjaninex se sampark).
    /// </summary>
    [HttpGet("plans")]
    public async Task<IActionResult> Plans()
    {
        var plans = await _db.SubscriptionPlans.IgnoreQueryFilters()
            .Where(p => p.IsActive)
            .OrderBy(p => p.SortOrder ?? 999).ThenBy(p => p.MonthlyInr)
            .Select(p => new
            {
                p.Code, p.Name, p.MonthlyInr, p.AnnualInr,
                p.MaxBranches, p.MaxUsers, p.MaxAiCalls, p.MaxWaMessages
            })
            .ToListAsync();
        return Ok(plans);
    }

    /// <summary>Returns current trial/subscription state for the logged-in firm.</summary>
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        // Super-admin (anjaninex) ka firm_id NULL — uske paas subscription nahi
        if (User.FindFirst("firm_id")?.Value is not { Length: > 0 })
            return Ok(new { isSuperAdmin = true, active = true });
        var status = await _svc.GetStatusAsync(CurrentFirmId);
        return Ok(status);
    }

    /// <summary>Manually renew subscription (paid via wallet — frontend handles wallet deduction).</summary>
    [HttpPost("renew")]
    [HasPermission("settings.wallet.recharge.firm")]
    public async Task<IActionResult> Renew([FromBody] RenewRequest req)
    {
        var newEnd = DateTimeOffset.UtcNow.AddDays(req.DurationDays);
        await _svc.ReactivateAsync(CurrentFirmId, newEnd, CurrentUserId);
        return Ok(new { success = true, subscriptionEndsAt = newEnd });
    }

    public record PurchasePlanDto(string Code, string Period);   // Period: "monthly" | "yearly"

    /// <summary>
    /// PLAN KHARIDO / CHANGE KARO — wallet se paisa kat ke plan turant switch,
    /// limits update, subscription aage badhti hai. Balance kam ho to saaf error.
    /// (Razorpay se aaye to RazorpayController pehle wallet bharta hai, fir yahi helper chalata hai.)
    /// </summary>
    [HttpPost("purchase")]
    [HasPermission("settings.wallet.recharge.firm")]
    public async Task<IActionResult> Purchase([FromBody] PurchasePlanDto dto)
    {
        var (ok, error, result) = await PlanPurchaseHelper.ApplyFromWallet(_db, CurrentFirmId, dto.Code, dto.Period, CurrentUserId);
        return ok ? Ok(result) : BadRequest(new { error });
    }
}

/// <summary>
/// Shared plan-purchase logic — wallet se paisa kat ke plan apply.
/// SubscriptionController (seedha wallet) aur RazorpayController (gateway ke baad) dono use karte hain.
/// </summary>
public static class PlanPurchaseHelper
{
    public static async Task<(bool ok, string? error, object? result)> ApplyFromWallet(
        AppDbContext db, Guid firmId, string code, string period, Guid userId)
    {
        var yearly = string.Equals(period, "yearly", StringComparison.OrdinalIgnoreCase);

        var plan = await db.SubscriptionPlans.IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.IsActive && p.Code.ToLower() == code.ToLower());
        if (plan is null) return (false, "Plan nahi mila", null);

        var price = yearly ? plan.AnnualInr : plan.MonthlyInr;
        if (price is null || price <= 0)
            return (false, "Is plan ki keemat set nahi hai — Anjaninex se sampark karein", null);

        var firm = await db.Firms.IgnoreQueryFilters().SingleAsync(f => f.Id == firmId);
        if (firm.WalletBalance < price.Value)
            return (false, $"Wallet me ₹{firm.WalletBalance:0} hai, plan ke liye ₹{price.Value:0} chahiye — pehle Wallet recharge karo", null);

        using var tx = await db.Database.BeginTransactionAsync();

        // 1) Wallet se katao + ledger entry
        firm.WalletBalance -= price.Value;
        db.WalletLedger.Add(new Entities.WalletLedgerEntry
        {
            FirmId = firmId,
            TxnType = "subscription",
            Amount = -price.Value,
            BalanceAfter = firm.WalletBalance,
            ReferenceId = plan.Code,
            Description = $"Plan '{plan.Name}' ({(yearly ? "yearly" : "monthly")}) — self-service purchase",
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow
        });
        db.PlatformRevenue.Add(new Entities.PlatformRevenueEntry
        {
            SourceFirmId = firmId,
            SourceType = "subscription",
            GrossInr = price.Value,
            CostInr = 0,
            MarginInr = price.Value,
            Description = $"Plan '{plan.Name}' ({(yearly ? "yearly" : "monthly")}) self-purchase",
            CreatedAt = DateTimeOffset.UtcNow
        });

        // 2) Plan switch + limits turant update
        firm.PlanId = plan.Id;
        firm.UserLimit = plan.MaxUsers;
        firm.BranchLimit = plan.MaxBranches;
        firm.AiQuotaMonthly = plan.MaxAiCalls;

        // 3) Subscription aage badhao — pehle se time bacha ho to uske UPAR jode
        var baseDate = firm.SubscriptionEndsAt > DateTimeOffset.UtcNow
            ? firm.SubscriptionEndsAt!.Value
            : DateTimeOffset.UtcNow;
        firm.SubscriptionEndsAt = baseDate.AddDays(yearly ? 365 : 30);
        firm.SubscriptionStartedAt ??= DateTimeOffset.UtcNow;
        firm.Status = "active";
        firm.ActivatedAt ??= DateTimeOffset.UtcNow;
        firm.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        await tx.CommitAsync();

        return (true, null, new
        {
            success = true,
            plan = plan.Code,
            paid = price.Value,
            walletBalance = firm.WalletBalance,
            subscriptionEndsAt = firm.SubscriptionEndsAt
        });
    }
}

/// <summary>Anjaninex super-admin only endpoints.</summary>
[ApiController]
[Route("api/admin/subscription")]
[Authorize]
public class AdminSubscriptionController : ControllerBase
{
    private readonly ISubscriptionService _svc;
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    public AdminSubscriptionController(ISubscriptionService svc) { _svc = svc; }

    /// <summary>Extend trial for a specific firm by N days.</summary>
    [HttpPost("{firmId:guid}/extend-trial")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> ExtendTrial(Guid firmId, [FromBody] ExtendTrialRequest req)
    {
        await _svc.ExtendTrialAsync(firmId, req.Days, req.Reason ?? "Manual extension", CurrentUserId);
        var status = await _svc.GetStatusAsync(firmId);
        return Ok(new { success = true, status });
    }

    /// <summary>Force-suspend a firm (fraud, abuse, late payment escalation).</summary>
    [HttpPost("{firmId:guid}/suspend")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> ForceSuspend(Guid firmId, [FromBody] SuspendRequest req)
    {
        await _svc.ForceSuspendAsync(firmId, req.Reason, CurrentUserId);
        return Ok(new { success = true });
    }

    /// <summary>Manually reactivate a suspended firm (after admin verification of payment).</summary>
    [HttpPost("{firmId:guid}/reactivate")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Reactivate(Guid firmId, [FromBody] ReactivateRequest req)
    {
        var newEnd = DateTimeOffset.UtcNow.AddDays(req.DurationDays);
        await _svc.ReactivateAsync(firmId, newEnd, CurrentUserId);
        var status = await _svc.GetStatusAsync(firmId);
        return Ok(new { success = true, status });
    }

    /// <summary>Extend subscription validity — current end me din jodo (plan extend).</summary>
    [HttpPost("{firmId:guid}/extend")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Extend(Guid firmId, [FromBody] ExtendDaysRequest req)
    {
        var newEnd = await _svc.ExtendAsync(firmId, req.Days, CurrentUserId);
        var status = await _svc.GetStatusAsync(firmId);
        return Ok(new { success = true, subscriptionEndsAt = newEnd, status });
    }

    /// <summary>Bulk extend — sab firms (planId null) ya ek plan ke saare firms.</summary>
    [HttpPost("extend-bulk")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> ExtendBulk([FromBody] ExtendBulkRequest req)
    {
        var count = await _svc.ExtendBulkAsync(req.Days, req.PlanId, CurrentUserId);
        return Ok(new { success = true, count });
    }

    /// <summary>Run the daily lifecycle job manually (testing).</summary>
    [HttpPost("run-lifecycle-job")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> RunJob()
    {
        var result = await _svc.RunDailyLifecycleAsync();
        return Ok(result);
    }
}

public record RenewRequest(int DurationDays = 30);
public record ExtendTrialRequest(int Days, string? Reason);
public record SuspendRequest(string Reason);
public record ReactivateRequest(int DurationDays = 30);
public record ExtendDaysRequest(int Days);
public record ExtendBulkRequest(int Days, Guid? PlanId);
