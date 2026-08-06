using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Logistics.Entities;

// ============================================================================
// LOGISTICS — transport company ka apna hissa  (db/init/130)
//
// ⚠️ Naam ka dhyaan: yahan "GR" ka matlab GOODS RECEIPT hai — transport ka
//    bhejne wala kaagaz. Agency app me bhi GR hai par wahan uska matlab
//    GOODS RETURN (maal wapas aana) hai. Schema alag hain isliye takraav
//    nahi, par padhte waqt yaad rakhna.
// ============================================================================

/// <summary>Gaadi. Kaagaz ki tareekh bhi yahin — raste me pakdi jaye to poora maal atakta hai.</summary>
public class Vehicle
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(30)] public string VehicleNo { get; set; } = "";
    /// <summary>truck | tempo | container | trailer | pickup</summary>
    [MaxLength(20)] public string Kind { get; set; } = "truck";
    [Column(TypeName = "numeric(12,2)")] public decimal? CapacityKg { get; set; }

    /// <summary>Apni gaadi ya kiraye ki — bhada aur hisaab dono me farak.</summary>
    public bool IsOwn { get; set; } = true;
    [MaxLength(150)] public string? OwnerName { get; set; }
    [MaxLength(20)] public string? OwnerMobile { get; set; }

    public DateOnly? InsuranceTill { get; set; }
    public DateOnly? FitnessTill { get; set; }
    public DateOnly? PermitTill { get; set; }
    public DateOnly? PucTill { get; set; }

    public bool IsActive { get; set; } = true;
    public string? Note { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class Driver
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    [Required, MaxLength(150)] public string Name { get; set; } = "";
    [Required, MaxLength(20)] public string Mobile { get; set; } = "";
    [MaxLength(40)] public string? LicenceNo { get; set; }
    public DateOnly? LicenceTill { get; set; }
    public string? Address { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// GR — Goods Receipt. Maal book hone ka kaagaz, aur is app ka dil.
/// Baaki sab (loading, dispatch, inward, delivery, TBB bill) isi ke ird-gird.
/// </summary>
public class Gr
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    /// <summary>Kis office ne kaata — transport har shehar par branch rakhta hai.</summary>
    public Guid? BranchId { get; set; }

    [Required, MaxLength(40)] public string GrNo { get; set; } = "";
    public DateOnly GrDate { get; set; }

    /// <summary>Dono trading.party_profiles se — alag list nahi banayi.</summary>
    public Guid ConsignorId { get; set; }
    public Guid ConsigneeId { get; set; }
    /// <summary>Bill teesre ko bhi ja sakta hai — aam baat hai.</summary>
    public Guid? BillPartyId { get; set; }

    [Required, MaxLength(100)] public string FromCity { get; set; } = "";
    [Required, MaxLength(100)] public string ToCity { get; set; } = "";
    public string? Goods { get; set; }
    public int Boxes { get; set; }
    [Column(TypeName = "numeric(12,3)")] public decimal WeightKg { get; set; }

    /// <summary>kg | box | fixed — bhada kis par laga.</summary>
    [MaxLength(10)] public string RateBasis { get; set; } = "kg";
    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }

    [Column(TypeName = "numeric(14,2)")] public decimal Freight { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal OtherCharges { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Gst { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Total { get; set; }

    /// <summary>paid | topay | tbb | cod</summary>
    [MaxLength(10)] public string PayType { get; set; } = "topay";
    [Column(TypeName = "numeric(14,2)")] public decimal CodAmount { get; set; }

    /// <summary>booked | loaded | in_transit | arrived | out_for_delivery | delivered | cancelled</summary>
    [MaxLength(20)] public string Status { get; set; } = "booked";

    [MaxLength(20)] public string? EwayBillNo { get; set; }
    public DateOnly? EwayTill { get; set; }
    /// <summary>Grahak ke maal ka apna bill number — hamara nahi.</summary>
    [MaxLength(50)] public string? InvoiceNo { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal? InvoiceValue { get; set; }

    public DateOnly? DeliveredAt { get; set; }
    public string? PodPhoto { get; set; }
    [MaxLength(150)] public string? PodReceivedBy { get; set; }
    public string? Note { get; set; }

    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class GrLine
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid GrId { get; set; }
    [Required] public string Goods { get; set; } = "";
    /// <summary>bora, gathar, carton, than</summary>
    [MaxLength(40)] public string? Packing { get; set; }
    public int Boxes { get; set; }
    [Column(TypeName = "numeric(12,3)")] public decimal WeightKg { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Amount { get; set; }
}

/// <summary>
/// GR ki chaal — har padaav ka nishaan.
///
/// Sirf status badalne se kaam nahi chalta: grahak poochta hai "maal kab
/// chala, kahan tak pahuncha?" — uska jawab poore itihaas se hi milta hai.
/// </summary>
public class GrEvent
{
    public long Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid GrId { get; set; }
    [Required, MaxLength(20)] public string Status { get; set; } = "";
    [MaxLength(100)] public string? Place { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset HappenedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedBy { get; set; }
}
