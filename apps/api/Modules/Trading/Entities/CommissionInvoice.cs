using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Trading.Entities;

public class CommissionInvoice
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid BranchId { get; set; }

    [Required, MaxLength(50)]
    public string InvoiceNo { get; set; } = "";

    public DateOnly InvoiceDate { get; set; }
    public Guid PartyId { get; set; }

    [Column(TypeName = "numeric(5,2)")]
    public decimal CommissionPct { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal GrossAmount { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal CommissionAmount { get; set; }

    [Column(TypeName = "numeric(5,2)")]
    public decimal GstPct { get; set; } = 18;

    [Column(TypeName = "numeric(14,2)")]
    public decimal GstAmount { get; set; }

    /// Supplier se recover karne wala bacha hua discount (purchase − sales). TotalAmount me shaamil.
    [Column(TypeName = "numeric(14,2)")]
    public decimal DiscRecoveryAmount { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal TotalAmount { get; set; }

    public string Status { get; set; } = "pending";
    public string? Notes { get; set; }

    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class CommissionInvoiceLine
{
    public Guid Id { get; set; }
    public Guid CommissionInvoiceId { get; set; }
    public Guid BillId { get; set; }

    [Required, MaxLength(50)]
    public string BillNo { get; set; } = "";

    public DateOnly BillDate { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal BillAmount { get; set; }

    [Column(TypeName = "numeric(5,2)")]
    public decimal CommissionPct { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal CommissionAmount { get; set; }

    /// Balance disc % = purchase disc % − sales disc % (supplier se recover karna hai)
    [Column(TypeName = "numeric(6,2)")]
    public decimal BalDiscPct { get; set; }

    /// Us bill par recoverable rupees = base × BalDiscPct / 100
    [Column(TypeName = "numeric(14,2)")]
    public decimal DiscAmount { get; set; }

    public int? SortOrder { get; set; }
}
