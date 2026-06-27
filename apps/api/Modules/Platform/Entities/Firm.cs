using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Platform.Entities;

public class Firm
{
    public Guid Id { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    [MaxLength(200)]
    public string? LegalName { get; set; }

    // proprietorship | partnership | llp | pvt_ltd
    [MaxLength(30)]
    public string? FirmType { get; set; }

    [MaxLength(15)]
    public string? GstNumber { get; set; }

    [MaxLength(10)]
    public string? PanNumber { get; set; }

    [MaxLength(100)]
    public string? Industry { get; set; }

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(100)]
    public string? State { get; set; }

    [Required, MaxLength(200)]
    public string ContactEmail { get; set; } = "";

    [Required, MaxLength(20)]
    public string ContactPhone { get; set; } = "";

    // Firm ki apni bank details (invoices / payouts)
    [MaxLength(120)] public string? BankName { get; set; }
    [MaxLength(40)]  public string? AccountNo { get; set; }
    [MaxLength(20)]  public string? Ifsc { get; set; }

    public Guid? PlanId { get; set; }
    public SubscriptionPlan? Plan { get; set; }

    // Reseller/agent link (migration 48) — jisne ye firm refer ki.
    public Guid? AgentId { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal WalletBalance { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal CreditLimit { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "trial"; // trial|active|grace_period|suspended|cancelled|low_wallet

    public DateTimeOffset? TrialStartedAt { get; set; }
    public DateTimeOffset? TrialEndsAt { get; set; }
    public DateTimeOffset? ActivatedAt { get; set; }
    public DateTimeOffset? SubscriptionStartedAt { get; set; }
    public DateTimeOffset? SubscriptionEndsAt { get; set; }

    // Subscription lifecycle (added 12-subscription-lifecycle.sql)
    // Explicit column names because EF snake_case converter doesn't add
    // underscore between letters and digits (Notif7d → notif7d, not notif_7d)
    public DateTimeOffset? GraceUntil { get; set; }

    [Column("notif_7d_sent_at")]
    public DateTimeOffset? Notif7dSentAt { get; set; }

    [Column("notif_3d_sent_at")]
    public DateTimeOffset? Notif3dSentAt { get; set; }

    [Column("notif_1d_sent_at")]
    public DateTimeOffset? Notif1dSentAt { get; set; }

    public DateTimeOffset? NotifExpiredSentAt { get; set; }
    public DateTimeOffset? SuspendedAt { get; set; }
    public string? SuspendedReason { get; set; }
    public DateTimeOffset? ReactivatedAt { get; set; }
    public int TrialExtendedCount { get; set; }
    public Guid? LastExtendedBy { get; set; }

    // -- Module entitlements & limits (migration 17) --
    [Column("enabled_modules", TypeName = "jsonb")]
    public string EnabledModules { get; set; } = "{}";

    [Column("plan_code"), MaxLength(50)]
    public string? PlanCode { get; set; }

    public int AiQuotaMonthly { get; set; }
    public int AiUsedThisMonth { get; set; }
    public int UserLimit { get; set; } = 3;
    public int BranchLimit { get; set; } = 1;
    public DateTimeOffset? AiQuotaResetAt { get; set; }

    public string? LogoUrl { get; set; }

    // Fixed UI theme color — set ONLY by Anjaninex super-admin (migration 43).
    // classic | theme-sunset | theme-aurora | theme-neon | theme-violet | theme-gold
    [MaxLength(40)]
    public string? Theme { get; set; }

    public string Timezone { get; set; } = "Asia/Kolkata";
    public string Locale { get; set; } = "en-IN";
    public string Currency { get; set; } = "INR";

    [Column(TypeName = "jsonb")]
    public string Meta { get; set; } = "{}";

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class SubscriptionPlan
{
    public Guid Id { get; set; }

    [Required, MaxLength(50)]
    public string Code { get; set; } = "";

    [Required, MaxLength(100)]
    public string Name { get; set; } = "";

    [Column(TypeName = "numeric(10,2)")]
    public decimal? MonthlyInr { get; set; }

    [Column(TypeName = "numeric(10,2)")]
    public decimal? AnnualInr { get; set; }

    public int MaxBranches { get; set; }
    public int MaxUsers { get; set; }
    public int MaxAiCalls { get; set; }
    public int MaxWaMessages { get; set; }

    [Column(TypeName = "jsonb")]
    public string Features { get; set; } = "{}";

    public bool IsActive { get; set; }
    public int? SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class WalletLedgerEntry
{
    public long Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(50)]
    public string TxnType { get; set; } = "";

    [Column(TypeName = "numeric(14,2)")]
    public decimal Amount { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal BalanceAfter { get; set; }

    public string? ReferenceId { get; set; }
    public string? Description { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class PlatformRevenueEntry
{
    public long Id { get; set; }
    public Guid? SourceFirmId { get; set; }

    [Required, MaxLength(50)]
    public string SourceType { get; set; } = "";

    [Column(TypeName = "numeric(14,2)")]
    public decimal GrossInr { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal CostInr { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal MarginInr { get; set; }

    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class ChangelogEntry
{
    public Guid Id { get; set; }

    [Required, MaxLength(20)]
    public string Version { get; set; } = "";

    public DateOnly ReleaseDate { get; set; }

    [Column(TypeName = "jsonb")]
    public string NewFeatures { get; set; } = "[]";

    [Column(TypeName = "jsonb")]
    public string Improvements { get; set; } = "[]";

    [Column(TypeName = "jsonb")]
    public string Fixes { get; set; } = "[]";

    [Column(TypeName = "jsonb")]
    public string BreakingChanges { get; set; } = "[]";

    public bool RequiresForceUpdate { get; set; }
    public Guid? PublishedBy { get; set; }
    public DateTimeOffset PublishedAt { get; set; }
}

/// <summary>In-app notification (paired with email/SMS via Hangfire).</summary>
[Table("notifications", Schema = "platform")]
public class Notification
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid? UserId { get; set; }

    [Required, MaxLength(50)]
    public string Type { get; set; } = "";    // trial_warn_7d, subscription_expired, wallet_low, ...

    [Required, MaxLength(20)]
    public string Severity { get; set; } = "info"; // info|warning|urgent|critical

    [Required, MaxLength(200)]
    public string Title { get; set; } = "";
    public string? Body { get; set; }

    [MaxLength(50)]
    public string? CtaLabel { get; set; }

    [MaxLength(500)]
    public string? CtaUrl { get; set; }

    [Column(TypeName = "jsonb")]
    public string ChannelsSent { get; set; } = "{}";

    public DateTimeOffset? ReadAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
}

/// <summary>BYOK: per-firm AI/Maps API keys — set ONLY by Anjaninex super-admin.</summary>
[Table("firm_api_keys", Schema = "platform")]
public class FirmApiKeys
{
    [Key]
    public Guid FirmId { get; set; }

    [Required, MaxLength(20)]
    public string AiProvider { get; set; } = "gemini"; // gemini | claude | openai

    public string? AiApiKey { get; set; }

    [MaxLength(80)]
    public string? AiModel { get; set; }

    public string? MapsApiKey { get; set; }

    public Guid? UpdatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>Global activity log — kisne kya banaya/badla/delete kiya (auto via interceptor).</summary>
[Table("audit_logs", Schema = "platform")]
public class AuditLog
{
    public long Id { get; set; }
    public Guid? FirmId { get; set; }
    public Guid? UserId { get; set; }

    [Required, MaxLength(30)]
    public string Module { get; set; } = "";

    [Required, MaxLength(80)]
    public string TableName { get; set; } = "";

    [MaxLength(60)]
    public string? EntityId { get; set; }

    [MaxLength(200)]
    public string? EntityLabel { get; set; }

    [Required, MaxLength(10)]
    public string Action { get; set; } = "";   // insert | update | delete

    [Column(TypeName = "jsonb")]
    public string? Changes { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Audit row for every trial extension by admin.</summary>
[Table("trial_extensions", Schema = "platform")]
public class TrialExtension
{
    public long Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid ExtendedBy { get; set; }
    public int DaysAdded { get; set; }
    public string? Reason { get; set; }
    public DateTimeOffset? PreviousEndsAt { get; set; }
    public DateTimeOffset NewEndsAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
