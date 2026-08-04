using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Manufacturer.Entities;

// ============================================================================
// MANUFACTURER — Purchase Order · Inward · Return  (db/init/122)
// ============================================================================

/// <summary>Mill ko diya hua order.</summary>
public class PurchaseOrder
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid? GodownId { get; set; }

    [Required, MaxLength(40)] public string PoNo { get; set; } = "";
    /// <summary>trading.party_profiles ka supplier.</summary>
    public Guid PartyId { get; set; }
    public Guid? AgentId { get; set; }

    public DateOnly OrderDate { get; set; }
    public DateOnly? DueAt { get; set; }
    [MaxLength(150)] public string? Transport { get; set; }
    public string? Note { get; set; }

    /// <summary>open | partial | done | cancelled</summary>
    [MaxLength(20)] public string Status { get; set; } = "open";

    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class PurchaseOrderLine
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid PoId { get; set; }
    public Guid ItemId { get; set; }
    [MaxLength(60)] public string? Colour { get; set; }
    [MaxLength(40)] public string? Size { get; set; }
    [Column(TypeName = "numeric(14,3)")] public decimal Qty { get; set; }
    [MaxLength(20)] public string Unit { get; set; } = "Meter";
    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
    /// <summary>Mill ke yahan is maal ka apna code — unse baat karte waqt yahi bolte hain.</summary>
    [MaxLength(60)] public string? DealerCode { get; set; }
    [MaxLength(40)] public string? LotNo { get; set; }
}

/// <summary>
/// Maal sach me aaya. Ek PO ka maal ek baar me nahi aata, isliye har khep ki
/// apni inward — aur PO line se juda hua, taaki "kitna aur aana baki hai"
/// ka jawab hamesha mile.
/// </summary>
public class PurchaseInward
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid GodownId { get; set; }

    [Required, MaxLength(40)] public string InwardNo { get; set; } = "";
    /// <summary>Bina PO ke bhi maal aa sakta hai — tab khali.</summary>
    public Guid? PoId { get; set; }
    public Guid PartyId { get; set; }
    public DateOnly InwardDate { get; set; }

    /// <summary>Unka apna challan number — milaan me sabse zyada isi ki zarurat.</summary>
    [MaxLength(60)] public string? SupplierChallanNo { get; set; }
    [MaxLength(60)] public string? LrNo { get; set; }
    [MaxLength(150)] public string? Transport { get; set; }
    public string? ChallanPhoto { get; set; }
    public string? Note { get; set; }

    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class PurchaseInwardLine
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid InwardId { get; set; }
    /// <summary>Kis PO line ka maal — isi se "baki kitna" ginta hai.</summary>
    public Guid? PoLineId { get; set; }
    public Guid ItemId { get; set; }
    [MaxLength(60)] public string? Colour { get; set; }
    [MaxLength(40)] public string? Size { get; set; }
    [Column(TypeName = "numeric(14,3)")] public decimal Qty { get; set; }
    [MaxLength(20)] public string Unit { get; set; } = "Meter";
    /// <summary>Mill ke bill ka rate PO se alag ho sakta hai.</summary>
    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
    [MaxLength(60)] public string? DealerCode { get; set; }
    [MaxLength(40)] public string? LotNo { get; set; }
}

/// <summary>
/// Maal wapas bheja — DEBIT note. Sales Return ka ulta: wahan hum credit dete
/// hain, yahan hum paisa wapas maangte hain.
/// </summary>
public class PurchaseReturn
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid GodownId { get; set; }
    [Required, MaxLength(40)] public string DnNo { get; set; } = "";
    public Guid PartyId { get; set; }
    public Guid? InwardId { get; set; }
    public DateOnly ReturnDate { get; set; }
    public string? Reason { get; set; }
    public string? Note { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class PurchaseReturnLine
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid ReturnId { get; set; }
    public Guid ItemId { get; set; }
    [MaxLength(60)] public string? Colour { get; set; }
    [MaxLength(40)] public string? Size { get; set; }
    [Column(TypeName = "numeric(14,3)")] public decimal Qty { get; set; }
    [MaxLength(20)] public string Unit { get; set; } = "Meter";
    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
}
