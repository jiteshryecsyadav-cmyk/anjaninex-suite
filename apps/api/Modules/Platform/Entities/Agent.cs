using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Platform.Entities;

/// <summary>Reseller / referral agent. Unique CODE se firms refer hoti hain;
/// firm recharge par commission milti hai (signup% pehli baar + recharge% har baar).</summary>
[Table("agents", Schema = "platform")]
public class Agent
{
    public Guid Id { get; set; }

    [Required, MaxLength(40)]
    public string Code { get; set; } = "";

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    [MaxLength(200)]
    public string? Email { get; set; }

    [MaxLength(20)]
    public string? Phone { get; set; }

    [Column(TypeName = "numeric(5,2)")]
    public decimal SignupCommissionPct { get; set; }

    [Column(TypeName = "numeric(5,2)")]
    public decimal RechargeCommissionPct { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal WalletBalance { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "active"; // active | suspended

    public string? Notes { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>Ek commission earning row (kind = signup | recharge).</summary>
[Table("agent_commissions", Schema = "platform")]
public class AgentCommission
{
    public long Id { get; set; }
    public Guid AgentId { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(20)]
    public string Kind { get; set; } = "";  // signup | recharge

    [Column(TypeName = "numeric(14,2)")]
    public decimal RechargeAmount { get; set; }

    [Column(TypeName = "numeric(5,2)")]
    public decimal CommissionPct { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal CommissionAmt { get; set; }

    public string? ReferenceId { get; set; }

    [Required, MaxLength(20)]
    public string Status { get; set; } = "pending"; // pending | paid

    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Agent ko diya gaya payout (commission settle).</summary>
[Table("agent_payouts", Schema = "platform")]
public class AgentPayout
{
    public long Id { get; set; }
    public Guid AgentId { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal Amount { get; set; }

    [MaxLength(50)]
    public string? Method { get; set; }

    public string? Reference { get; set; }
    public string? Notes { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
