using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Trading.Entities;

public class PartyProfile
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid ContactId { get; set; }

    [MaxLength(50)]
    public string? PartyCode { get; set; }

    [Required, MaxLength(20)]
    public string PartyType { get; set; } = "buyer";   // buyer|seller|both

    [Column(TypeName = "numeric(14,2)")]
    public decimal CreditLimit { get; set; }

    public int CreditDays { get; set; } = 30;

    [Column(TypeName = "numeric(5,2)")]
    public decimal CommissionRate { get; set; }

    public Guid? DefaultTransporterId { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal OpeningBalance { get; set; }

    [MaxLength(2)]
    public string OpeningType { get; set; } = "Dr";

    public Guid? LedgerId { get; set; }

    [MaxLength(1)]
    public string? CreditRating { get; set; }

    public Guid? PriceListId { get; set; }
    public string? TaxTreatment { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class Item
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [MaxLength(50)]
    public string? Code { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    [MaxLength(20)]
    public string? HsnSac { get; set; }

    [MaxLength(20)]
    public string Unit { get; set; } = "PCS";

    [Column(TypeName = "numeric(12,2)")]
    public decimal DefaultRate { get; set; }

    [Column(TypeName = "numeric(5,2)")]
    public decimal TaxRate { get; set; }

    public string? Category { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public class Bill
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid BranchId { get; set; }

    [Required, MaxLength(20)]
    public string BillType { get; set; } = "sales";

    [Required, MaxLength(50)]
    public string BillNo { get; set; } = "";

    public DateOnly BillDate { get; set; }
    public Guid PartyId { get; set; }            // SUPPLIER for both sales/purchase (legacy: was buyer for sales)
    public Guid? BuyerPartyId { get; set; }      // BUYER — separately stored from migration 18+
    public Guid? OrderId { get; set; }

    public string? InvoiceType { get; set; }
    public string? PoNumber { get; set; }
    public DateOnly? DeliveryDate { get; set; }

    [Column(TypeName = "numeric(14,2)")] public decimal Subtotal { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Discount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TaxableAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Cgst { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Sgst { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Igst { get; set; }
    [Column(TypeName = "numeric(6,2)")]  public decimal RoundOff { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Total { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal PaidAmount { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "pending";

    public Guid? VoucherId { get; set; }
    public bool AiExtracted { get; set; }
    public Guid? AiExtractionId { get; set; }
    public string? BillImageUrl { get; set; }
    public string? Notes { get; set; }

    // Transport / e-Way bill fields (migration 19)
    [MaxLength(20)] public string? EwayBillNo { get; set; }
    public Guid? TransporterId { get; set; }
    [MaxLength(50)] public string? LrNo { get; set; }
    public DateOnly? LrDate { get; set; }
    public DateOnly? EwayBillDate { get; set; }   // migration 41 — e-Way bill generation date

    // Duplicate protection (migration 20) — supplier's own bill no on their invoice
    [MaxLength(50)] public string? SupplierBillNo { get; set; }

    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public List<BillLine> Lines { get; set; } = new();
}

public class BillLine
{
    public Guid Id { get; set; }
    public Guid BillId { get; set; }
    public Guid? ItemId { get; set; }

    [Required, MaxLength(200)]
    public string ItemName { get; set; } = "";

    public string? HsnSac { get; set; }

    [Column(TypeName = "numeric(12,3)")]
    public decimal Qty { get; set; }

    public string? Unit { get; set; }

    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
    [Column(TypeName = "numeric(5,2)")]  public decimal DiscountPct { get; set; }
    [Column(TypeName = "numeric(5,2)")]  public decimal TaxRate { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TaxableAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TotalAmount { get; set; }

    public int? SortOrder { get; set; }

    public Bill? Bill { get; set; }
}

public class Payment
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid BranchId { get; set; }

    [Required, MaxLength(20)]
    public string PaymentType { get; set; } = "receipt";

    [Required, MaxLength(50)]
    public string PaymentNo { get; set; } = "";

    public DateOnly PaymentDate { get; set; }
    public Guid PartyId { get; set; }

    [Required, MaxLength(20)]
    public string PaymentMode { get; set; } = "cash";

    [Column(TypeName = "numeric(14,2)")]
    public decimal Amount { get; set; }

    public string? ReferenceNo { get; set; }
    public string? BankName { get; set; }
    public string? BankBranch { get; set; }
    public Guid? BankLedgerId { get; set; }
    public Guid? VoucherId { get; set; }
    public string? Notes { get; set; }

    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public List<PaymentAllocation> Allocations { get; set; } = new();
}

public class PaymentAllocation
{
    public Guid PaymentId { get; set; }
    public Guid BillId { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal Allocated { get; set; }
}

public class Order
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid BranchId { get; set; }

    [Required, MaxLength(20)]
    public string OrderType { get; set; } = "sales";

    [Required, MaxLength(50)]
    public string OrderNo { get; set; } = "";

    public DateOnly OrderDate { get; set; }
    public Guid PartyId { get; set; }
    public Guid? BuyerPartyId { get; set; }
    public DateOnly? ExpectedDelivery { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "pending";

    [Column(TypeName = "numeric(14,2)")] public decimal Subtotal { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TaxAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Total { get; set; }

    // Order-specific fields
    [Column(TypeName = "numeric(5,2)")] public decimal CdPercent { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal CdAmount { get; set; }
    [MaxLength(10)] public string? CdType { get; set; } = "before";   // before|after GST
    public Guid? TransporterId { get; set; }                          // freight partner (dropdown)
    [MaxLength(50)] public string? SupplierOrderNo { get; set; }
    [MaxLength(50)] public string? PaymentTerms { get; set; }

    public string? Notes { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public List<OrderLine> Lines { get; set; } = new();
}

public class GoodsReturn
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid BranchId { get; set; }

    [Required, MaxLength(50)]
    public string GrNo { get; set; } = "";

    public DateOnly GrDate { get; set; }

    public Guid SupplierPartyId { get; set; }
    public Guid? BuyerPartyId { get; set; }
    public Guid? OriginalBillId { get; set; }

    [MaxLength(50)] public string? Transport { get; set; }
    [MaxLength(50)] public string? LrNo { get; set; }
    [MaxLength(100)] public string? Reason { get; set; }
    public string? Remark { get; set; }

    [MaxLength(30)]
    public string EffectMode { get; set; } = "direct_adjustment";  // direct_adjustment | credit_note

    [Column(TypeName = "numeric(14,2)")] public decimal OriginalBillAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TotalReturnAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TaxableAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TaxAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal NetBillAfterGr { get; set; }

    // Credit note specific (when effect_mode = credit_note)
    public DateOnly? CreditNoteValidTill { get; set; }
    public bool CreditNoteAdjustFuture { get; set; } = true;

    // Commission recalc
    [Column(TypeName = "numeric(5,2)")] public decimal CommissionPct { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal CommissionAmount { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "pending";   // pending | approved | rejected

    public Guid? ApprovedBy { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public string? RejectionReason { get; set; }

    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public List<GoodsReturnLine> Lines { get; set; } = new();
}

public class GoodsReturnLine
{
    public Guid Id { get; set; }
    public Guid GoodsReturnId { get; set; }
    public Guid? BillLineId { get; set; }    // FK to original bill line
    public Guid? ItemId { get; set; }

    [Required, MaxLength(200)]
    public string ItemName { get; set; } = "";

    public string? Description { get; set; }
    public string? HsnSac { get; set; }

    [Column(TypeName = "numeric(12,3)")] public decimal Qty { get; set; }
    public string? Unit { get; set; }

    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Rd { get; set; }
    [Column(TypeName = "numeric(5,2)")]  public decimal IgstPct { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TaxableAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TaxAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TotalAmount { get; set; }

    public int? SortOrder { get; set; }
    public GoodsReturn? GoodsReturn { get; set; }
}

public class OrderLine
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public Guid? ItemId { get; set; }

    [Required, MaxLength(200)]
    public string ItemName { get; set; } = "";

    public string? Description { get; set; }
    public string? HsnSac { get; set; }

    [Column(TypeName = "numeric(12,3)")] public decimal Qty { get; set; }
    public string? Unit { get; set; }

    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Rd { get; set; }         // Rate Discount per unit
    [Column(TypeName = "numeric(5,2)")]  public decimal SgstPct { get; set; }
    [Column(TypeName = "numeric(5,2)")]  public decimal CgstPct { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TaxableAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TaxAmount { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal TotalAmount { get; set; }

    public int? SortOrder { get; set; }
    public Order? Order { get; set; }
}
