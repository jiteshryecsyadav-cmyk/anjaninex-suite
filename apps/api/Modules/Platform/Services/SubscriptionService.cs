using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Entities;

namespace Namokara.Api.Modules.Platform.Services;

public interface ISubscriptionService
{
    /// <summary>Status info that the frontend banner / lockout uses.</summary>
    Task<SubscriptionStatusDto> GetStatusAsync(Guid firmId);
    /// <summary>Extend trial by N days (Anjaninex admin only).</summary>
    Task ExtendTrialAsync(Guid firmId, int days, string reason, Guid adminUserId);
    /// <summary>Force-suspend a firm (admin action).</summary>
    Task ForceSuspendAsync(Guid firmId, string reason, Guid adminUserId);
    /// <summary>Reactivate a suspended firm (admin action OR after payment).</summary>
    Task ReactivateAsync(Guid firmId, DateTimeOffset subscriptionEndsAt, Guid adminUserId);
    Task<DateTimeOffset> ExtendAsync(Guid firmId, int days, Guid adminUserId);   // current end me din jodo
    Task<int> ExtendBulkAsync(int days, Guid? planId, Guid adminUserId);          // sab / ek plan ke saare firms
    /// <summary>Daily cron — sends notifications and auto-suspends.</summary>
    Task<LifecycleRunResult> RunDailyLifecycleAsync(CancellationToken ct = default);
}

public record SubscriptionStatusDto(
    string Status,                  // 'trial' | 'active' | 'grace_period' | 'suspended'
    DateTimeOffset? TrialEndsAt,
    DateTimeOffset? SubscriptionEndsAt,
    DateTimeOffset? GraceUntil,
    int DaysLeft,
    string Health,                  // '🟢' | '🟡' | '🟠' | '🔴'
    bool ShowBanner,                // true when ≤7 days left
    bool IsLocked,                  // true when grace also expired
    string? SuspendedReason,
    string? PlanName = null,
    string? PlanCode = null,
    decimal? MonthlyPrice = null);

public record LifecycleRunResult(
    int FirmsScanned,
    int Notifications7d,
    int Notifications3d,
    int Notifications1d,
    int MovedToGrace,
    int Suspended,
    int Errors,
    TimeSpan Duration);

public class SubscriptionService : ISubscriptionService
{
    private readonly AppDbContext _db;
    private readonly ILogger<SubscriptionService> _log;

    private const int TrialDays = 15;
    private const int GraceDays = 3;

    public SubscriptionService(AppDbContext db, ILogger<SubscriptionService> log)
    {
        _db = db;
        _log = log;
    }

    public async Task<SubscriptionStatusDto> GetStatusAsync(Guid firmId)
    {
        var f = await _db.Firms
            .Where(x => x.Id == firmId)
            .Select(x => new {
                x.Status,
                x.TrialEndsAt,
                x.SubscriptionEndsAt,
                x.GraceUntil,
                x.SuspendedReason,
                PlanName = x.Plan != null ? x.Plan.Name : null,
                PlanCode = x.Plan != null ? x.Plan.Code : null,
                MonthlyPrice = x.Plan != null ? x.Plan.MonthlyInr : null
            })
            .SingleAsync();

        var now = DateTimeOffset.UtcNow;
        DateTimeOffset? targetDate = f.Status switch
        {
            "trial"        => f.TrialEndsAt,
            "active"       => f.SubscriptionEndsAt,
            "grace_period" => f.GraceUntil,
            _              => null
        };

        int daysLeft = targetDate.HasValue
            ? (int)Math.Max(0, (targetDate.Value - now).TotalDays)
            : 0;

        string health = f.Status switch
        {
            "suspended"    => "🔴",
            "grace_period" => "🟠",
            "trial" when daysLeft <= 1 => "🔴",
            "trial" when daysLeft <= 3 => "🟠",
            "trial" when daysLeft <= 7 => "🟡",
            "active" when daysLeft <= 3 => "🟡",
            _              => "🟢"
        };

        return new SubscriptionStatusDto(
            Status: f.Status,
            TrialEndsAt: f.TrialEndsAt,
            SubscriptionEndsAt: f.SubscriptionEndsAt,
            GraceUntil: f.GraceUntil,
            DaysLeft: daysLeft,
            Health: health,
            ShowBanner: daysLeft <= 7 && f.Status is "trial" or "active" or "grace_period",
            IsLocked: f.Status == "suspended",
            SuspendedReason: f.SuspendedReason,
            PlanName: f.PlanName,
            PlanCode: f.PlanCode,
            MonthlyPrice: f.MonthlyPrice);
    }

    public async Task ExtendTrialAsync(Guid firmId, int days, string reason, Guid adminUserId)
    {
        if (days <= 0 || days > 90)
            throw new ArgumentException("Extension must be 1-90 days");

        using var tx = await _db.Database.BeginTransactionAsync();
        var firm = await _db.Firms.SingleAsync(f => f.Id == firmId);

        var previous = firm.TrialEndsAt;
        var baseDate = firm.TrialEndsAt ?? DateTimeOffset.UtcNow;
        // If trial already expired, extend from now (not from past date)
        if (baseDate < DateTimeOffset.UtcNow) baseDate = DateTimeOffset.UtcNow;
        firm.TrialEndsAt = baseDate.AddDays(days);
        firm.Status = "trial";
        firm.SuspendedAt = null;
        firm.SuspendedReason = null;
        firm.GraceUntil = null;
        firm.TrialExtendedCount++;
        firm.LastExtendedBy = adminUserId;
        // Reset notification flags so new warnings will fire
        firm.Notif7dSentAt = null;
        firm.Notif3dSentAt = null;
        firm.Notif1dSentAt = null;
        firm.NotifExpiredSentAt = null;

        _db.TrialExtensions.Add(new TrialExtension {
            FirmId = firmId,
            ExtendedBy = adminUserId,
            DaysAdded = days,
            Reason = reason,
            PreviousEndsAt = previous,
            NewEndsAt = firm.TrialEndsAt.Value,
            CreatedAt = DateTimeOffset.UtcNow
        });

        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        _log.LogInformation(
            "Trial extended for firm {FirmId} by {Days} days → now ends {NewEnd}",
            firmId, days, firm.TrialEndsAt);
    }

    public async Task ForceSuspendAsync(Guid firmId, string reason, Guid adminUserId)
    {
        var firm = await _db.Firms.SingleAsync(f => f.Id == firmId);
        firm.Status = "suspended";
        firm.SuspendedAt = DateTimeOffset.UtcNow;
        firm.SuspendedReason = $"manual_admin: {reason}";
        await _db.SaveChangesAsync();
        _log.LogWarning("Firm {FirmId} force-suspended by admin {AdminId}: {Reason}", firmId, adminUserId, reason);
    }

    public async Task ReactivateAsync(Guid firmId, DateTimeOffset subscriptionEndsAt, Guid adminUserId)
    {
        var firm = await _db.Firms.SingleAsync(f => f.Id == firmId);
        firm.Status = "active";
        firm.SubscriptionStartedAt = DateTimeOffset.UtcNow;
        firm.SubscriptionEndsAt = subscriptionEndsAt;
        firm.SuspendedAt = null;
        firm.SuspendedReason = null;
        firm.GraceUntil = null;
        firm.ReactivatedAt = DateTimeOffset.UtcNow;
        // Reset notifications
        firm.Notif7dSentAt = null;
        firm.Notif3dSentAt = null;
        firm.Notif1dSentAt = null;
        firm.NotifExpiredSentAt = null;
        await _db.SaveChangesAsync();
        _log.LogInformation("Firm {FirmId} reactivated, subscription until {EndDate}", firmId, subscriptionEndsAt);
    }

    /// <summary>Current subscription/trial end me 'days' jodo (expired ho to now se). Status active.</summary>
    public async Task<DateTimeOffset> ExtendAsync(Guid firmId, int days, Guid adminUserId)
    {
        if (days == 0) throw new ArgumentException("Days 0 nahi ho sakte.");
        var firm = await _db.Firms.SingleAsync(f => f.Id == firmId);
        var now = DateTimeOffset.UtcNow;
        var baseDate = firm.SubscriptionEndsAt ?? firm.TrialEndsAt ?? now;
        if (baseDate < now) baseDate = now;   // expire ho gaya to aaj se aage
        firm.SubscriptionEndsAt = baseDate.AddDays(days);
        firm.Status = "active";
        firm.SubscriptionStartedAt ??= now;
        firm.SuspendedAt = null;
        firm.SuspendedReason = null;
        firm.GraceUntil = null;
        firm.ReactivatedAt = now;
        firm.Notif7dSentAt = null;
        firm.Notif3dSentAt = null;
        firm.Notif1dSentAt = null;
        firm.NotifExpiredSentAt = null;
        await _db.SaveChangesAsync();
        _log.LogInformation("Firm {FirmId} extended by {Days}d, until {EndDate}", firmId, days, firm.SubscriptionEndsAt);
        return firm.SubscriptionEndsAt.Value;
    }

    /// <summary>Bulk extend — planId diya to us plan ke saare firms, warna SAB firms. Returns count.</summary>
    public async Task<int> ExtendBulkAsync(int days, Guid? planId, Guid adminUserId)
    {
        if (days == 0) throw new ArgumentException("Days 0 nahi ho sakte.");
        var q = _db.Firms.IgnoreQueryFilters().AsQueryable();
        if (planId.HasValue) q = q.Where(f => f.PlanId == planId.Value);
        var firms = await q.ToListAsync();
        var now = DateTimeOffset.UtcNow;
        foreach (var firm in firms)
        {
            var baseDate = firm.SubscriptionEndsAt ?? firm.TrialEndsAt ?? now;
            if (baseDate < now) baseDate = now;
            firm.SubscriptionEndsAt = baseDate.AddDays(days);
            firm.Status = "active";
            firm.SubscriptionStartedAt ??= now;
            firm.SuspendedAt = null;
            firm.SuspendedReason = null;
            firm.GraceUntil = null;
            firm.ReactivatedAt = now;
            firm.Notif7dSentAt = null;
            firm.Notif3dSentAt = null;
            firm.Notif1dSentAt = null;
            firm.NotifExpiredSentAt = null;
        }
        await _db.SaveChangesAsync();
        _log.LogInformation("Bulk extend {Days}d, plan {PlanId}, {Count} firms", days, planId, firms.Count);
        return firms.Count;
    }

    /// <summary>
    /// Hangfire-scheduled daily job. Idempotent — uses notif_*_sent_at columns
    /// to avoid sending the same notification twice.
    /// </summary>
    public async Task<LifecycleRunResult> RunDailyLifecycleAsync(CancellationToken ct = default)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var now = DateTimeOffset.UtcNow;
        int n7 = 0, n3 = 0, n1 = 0, grace = 0, suspended = 0, errors = 0;

        // 1. All firms in trial/active that haven't been suspended
        var firms = await _db.Firms
            .Where(f => f.Status == "trial" || f.Status == "active" || f.Status == "grace_period")
            .ToListAsync(ct);

        foreach (var f in firms)
        {
            try
            {
                var (target, kind) = f.Status switch
                {
                    "trial"        => (f.TrialEndsAt, "trial"),
                    "active"       => (f.SubscriptionEndsAt, "subscription"),
                    "grace_period" => (f.GraceUntil, "grace"),
                    _              => (null as DateTimeOffset?, "")
                };
                if (target == null) continue;

                var daysLeft = (target.Value - now).TotalDays;

                // —— 7-day warning ——
                if (daysLeft <= 7 && daysLeft > 3 && f.Notif7dSentAt == null && f.Status != "grace_period")
                {
                    await CreateNotificationAsync(f.Id, $"{kind}_warn_7d", "warning",
                        kind == "trial"
                            ? "⏰ Trial ends in 7 days"
                            : "⏰ Subscription renewal due in 7 days",
                        kind == "trial"
                            ? $"Your free trial ends on {target:dd MMM yyyy}. Subscribe to keep your data."
                            : $"Subscription renews on {target:dd MMM yyyy}. Recharge wallet to auto-renew.",
                        "Subscribe Now", "/wallet");
                    f.Notif7dSentAt = now;
                    n7++;
                }

                // —— 3-day warning ——
                if (daysLeft <= 3 && daysLeft > 1 && f.Notif3dSentAt == null && f.Status != "grace_period")
                {
                    await CreateNotificationAsync(f.Id, $"{kind}_warn_3d", "urgent",
                        kind == "trial"
                            ? "⚠️ Trial ends in 3 days"
                            : "⚠️ Subscription renewal in 3 days",
                        $"Only 3 days left. After expiry, services will be limited.",
                        "Renew Now", "/wallet");
                    f.Notif3dSentAt = now;
                    n3++;
                }

                // —— 1-day warning ——
                if (daysLeft <= 1 && daysLeft > 0 && f.Notif1dSentAt == null && f.Status != "grace_period")
                {
                    await CreateNotificationAsync(f.Id, $"{kind}_warn_1d", "critical",
                        "🚨 Final reminder: 1 day left",
                        $"Your {kind} expires tomorrow. Renew now to avoid service interruption.",
                        "Renew Immediately", "/wallet");
                    f.Notif1dSentAt = now;
                    n1++;
                }

                // —— Expired: move to grace_period ——
                if (daysLeft <= 0 && (f.Status == "trial" || f.Status == "active"))
                {
                    f.Status = "grace_period";
                    f.GraceUntil = now.AddDays(GraceDays);
                    await CreateNotificationAsync(f.Id, $"{kind}_expired", "critical",
                        kind == "trial"
                            ? $"🔴 Trial expired — {GraceDays}-day grace started"
                            : $"🔴 Subscription expired — {GraceDays}-day grace started",
                        $"You have {GraceDays} days to renew. After that, services will be suspended.",
                        "Renew Now", "/wallet");
                    f.NotifExpiredSentAt = now;
                    grace++;
                }

                // —— Grace expired: SUSPEND ——
                if (f.Status == "grace_period" && f.GraceUntil != null && f.GraceUntil < now)
                {
                    f.Status = "suspended";
                    f.SuspendedAt = now;
                    f.SuspendedReason = kind == "trial" ? "trial_expired" : "subscription_expired";
                    await CreateNotificationAsync(f.Id, "suspended", "critical",
                        "🔒 Account suspended",
                        "Grace period ended. Renew subscription to restore access.",
                        "Renew Now", "/wallet");
                    suspended++;
                }
            }
            catch (Exception ex)
            {
                errors++;
                _log.LogError(ex, "Lifecycle check failed for firm {FirmId}", f.Id);
            }
        }

        await _db.SaveChangesAsync(ct);

        sw.Stop();
        var result = new LifecycleRunResult(
            firms.Count, n7, n3, n1, grace, suspended, errors, sw.Elapsed);
        _log.LogInformation(
            "📅 Lifecycle job done: scanned={Scanned}, 7d={N7}, 3d={N3}, 1d={N1}, → grace={Grace}, suspended={Susp}, errors={Err}, took={Took}ms",
            firms.Count, n7, n3, n1, grace, suspended, errors, sw.ElapsedMilliseconds);
        return result;
    }

    private async Task CreateNotificationAsync(
        Guid firmId, string type, string severity,
        string title, string body, string ctaLabel, string ctaUrl)
    {
        _db.Notifications.Add(new Notification {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            Type = type,
            Severity = severity,
            Title = title,
            Body = body,
            CtaLabel = ctaLabel,
            CtaUrl = ctaUrl,
            ChannelsSent = "{\"inapp\":true,\"email\":false,\"sms\":false}",  // TODO: wire real email/SMS
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(30)
        });
        await Task.CompletedTask;
        // Real implementation would also queue email + SMS via Hangfire
        _log.LogInformation("📨 Notification [{Severity}] for firm {FirmId}: {Title}", severity, firmId, title);
    }
}
