using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Manufacturer.Entities;

// ============================================================================
// MANUFACTURER — Sales Order · Delivery Challan  (db/init/123)
//
// Tax Invoice yahan nahi hai — wo trading.bills me jayega, taaki Credil
// (GST par network score) manufacturer ka bill bhi padh sake.
// ============================================================================

/// <summary>Grahak ka order. Stock nahi hilta — wo challan par hilta hai.</summary>
public class SalesOrder
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid? GodownId { get; set; }

    [Required, MaxLength(40)] public string SoNo { get; set; } = "";
    public Guid PartyId { get; set; }
    public Guid? AgentId { get; set; }

    public DateOnly OrderDate { get; set; }
    public DateOnly? DueAt { get; set; }
    [MaxLength(150)] public string? Transport { get; set; }

    /// <summary>Grahak ka apna order number — wo isi se poochta hai.</summary>
    [MaxLength(60)] public string? BuyerRef { get; set; }
    public string? Note { get; set; }

    /// <summary>open | partial | done | cancelled</summary>
    [MaxLength(20)] public string Status { get; set; } = "open";

    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class SalesOrderLine
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid SoId { get; set; }
    public Guid ItemId { get; set; }
    [MaxLength(60)] public string? Colour { get; set; }
    [MaxLength(40)] public string? Size { get; set; }
    [Column(TypeName = "numeric(14,3)")] public decimal Qty { get; set; }
    [MaxLength(20)] public string Unit { get; set; } = "Pcs";
    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }

    /// <summary>
    /// Ratio se bhari line ka nishaan (jaise "S:1"). Sirf dikhane ke liye —
    /// ginti hamesha Qty se hoti hai, ratio se kabhi nahi.
    /// </summary>
    [MaxLength(60)] public string? RatioNote { get; set; }
}

/// <summary>
/// Delivery Challan — maal sach me godown se nikla. YAHI stock ghatata hai.
/// </summary>
public class DeliveryChallan
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid GodownId { get; set; }

    [Required, MaxLength(40)] public string DcNo { get; set; } = "";
    /// <summary>Bina order ke bhi maal nikal sakta hai — tab khali.</summary>
    public Guid? SoId { get; set; }
    public Guid PartyId { get; set; }
    public DateOnly ChallanDate { get; set; }

    public Guid? TransporterId { get; set; }
    [MaxLength(150)] public string? Transport { get; set; }
    [MaxLength(60)] public string? LrNo { get; set; }
    [MaxLength(30)] public string? VehicleNo { get; set; }

    /// <summary>Kitne gathar/bore gaye — grahak yahi ginta hai, piece nahi.</summary>
    public int? Packages { get; set; }
    public string? Note { get; set; }

    /// <summary>Bill ban chuka to uski id — dobara bill na bane.</summary>
    public Guid? BilledRefId { get; set; }

    // ── Maal nikalne ke BAAD ka hisaab (db/init/128) ──

    /// <summary>
    /// bheja | raste_me | pahuncha | mila
    ///
    /// Chaar hi padaav jaan-boojh kar. Zyada rakhne se koi update hi nahi
    /// karta aur poora hisaab jhootha ho jata hai.
    /// </summary>
    [MaxLength(20)] public string DeliveryStatus { get; set; } = "bheja";

    /// <summary>POD kaagaz ki photo — paisa maangte waqt yahi saboot hai.</summary>
    public string? PodPhoto { get; set; }
    [MaxLength(150)] public string? PodReceivedBy { get; set; }
    public DateOnly? PodAt { get; set; }
    public string? PodNote { get; set; }

    /// <summary>Transporter ne apni taraf se jo LR diya — hamare LrNo se alag ho sakta hai.</summary>
    [MaxLength(60)] public string? TransportLr { get; set; }

    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class DeliveryChallanLine
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid DcId { get; set; }
    /// <summary>Kis order line ka maal — isi se "kitna baki" ginta hai.</summary>
    public Guid? SoLineId { get; set; }
    public Guid ItemId { get; set; }
    [MaxLength(60)] public string? Colour { get; set; }
    [MaxLength(40)] public string? Size { get; set; }
    [Column(TypeName = "numeric(14,3)")] public decimal Qty { get; set; }
    [MaxLength(20)] public string Unit { get; set; } = "Pcs";
    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
}
