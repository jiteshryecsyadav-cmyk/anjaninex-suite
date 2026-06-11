using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Ai.Entities;

public class AiExtractionLog
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid UserId { get; set; }

    [Required, MaxLength(50)]
    public string AgentName { get; set; } = "";

    public string? ModelUsed { get; set; }
    public string? ImageHash { get; set; }
    public int? InputSizeKb { get; set; }
    public string? InputUrl { get; set; }

    [Column(TypeName = "jsonb")]
    public string? OutputJson { get; set; }

    [Column(TypeName = "numeric(3,2)")]
    public decimal? Confidence { get; set; }

    public int? LatencyMs { get; set; }

    [Column(TypeName = "numeric(8,4)")]
    public decimal? CostInr { get; set; }

    public bool UserCorrected { get; set; }

    [Column(TypeName = "jsonb")]
    public string? CorrectionDiff { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

public class AiCacheEntry
{
    [Key, MaxLength(200)]
    public string CacheKey { get; set; } = "";

    public Guid FirmId { get; set; }

    [Required, MaxLength(50)]
    public string AgentName { get; set; } = "";

    [Column(TypeName = "jsonb")]
    public string Payload { get; set; } = "{}";

    [Column(TypeName = "numeric(8,4)")]
    public decimal? CostSaved { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
