using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Manufacturer.Entities;

// ============================================================================
// MANUFACTURER — Opening Stock · Stock Transfer  (db/init/125)
// ============================================================================

/// <summary>
/// App shuru karne se PEHLE jo maal pada tha.
///
/// Iske bina har purana maal minus me chala jata hai — job slip usse bahar
/// bhejta hai par andar wo kabhi aaya hi nahi hota.
/// </summary>
public class OpeningStock
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid GodownId { get; set; }
    [Required, MaxLength(40)] public string EntryNo { get; set; } = "";

    /// <summary>Kis din ka stock — aam taur par FY ki 1 April.</summary>
    public DateOnly AsOn { get; set; }
    public string? Note { get; set; }

    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class OpeningStockLine
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid OpeningId { get; set; }
    public Guid ItemId { get; set; }
    [MaxLength(60)] public string? Colour { get; set; }
    [MaxLength(40)] public string? Size { get; set; }
    [Column(TypeName = "numeric(14,3)")] public decimal Qty { get; set; }
    [MaxLength(20)] public string Unit { get; set; } = "Pcs";

    /// <summary>Sirf hisaab ke liye — stock ki value. Ledger qty par chalta hai.</summary>
    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
}

/// <summary>
/// Maal ek godown se doosre me. Do ledger entry banti hain — nikalne wale se
/// ghata, aane wale me jama. Kul stock waisa ka waisa rehta hai.
/// </summary>
public class StockTransfer
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    [Required, MaxLength(40)] public string TransferNo { get; set; } = "";

    public Guid FromGodownId { get; set; }
    public Guid ToGodownId { get; set; }
    public DateOnly TransferDate { get; set; }

    /// <summary>Do jagah ke beech maal gaadi se hi jata hai — raste ka hisaab.</summary>
    [MaxLength(150)] public string? Transport { get; set; }
    [MaxLength(60)] public string? LrNo { get; set; }
    [MaxLength(30)] public string? VehicleNo { get; set; }
    public string? Note { get; set; }

    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class StockTransferLine
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid TransferId { get; set; }
    public Guid ItemId { get; set; }
    [MaxLength(60)] public string? Colour { get; set; }
    [MaxLength(40)] public string? Size { get; set; }
    [Column(TypeName = "numeric(14,3)")] public decimal Qty { get; set; }
    [MaxLength(20)] public string Unit { get; set; } = "Pcs";
}
