using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

[ApiController]
[Route("api/subscription")]
[Authorize]
public class SubscriptionController : ControllerBase
{
    private readonly ISubscriptionService _svc;
    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    public SubscriptionController(ISubscriptionService svc) { _svc = svc; }

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
