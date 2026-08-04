using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Manufacturer.Entities;

// ============================================================================
// MANUFACTURER — Recipe, Job Slip, Taka, Stock
// ============================================================================

/// <summary>
/// Design ka nuskha, HISSE ke hisab se. Ek suit ke teen hisse hote hain
/// (Top, Bottom, Dupatta) aur teeno ka kapda alag aur majoori alag — isliye
/// recipe hisse par bandhi hai, ek lambi list nahi.
///
/// Do faayde: job slip me hissa chunte hi material khud bhar jata hai, aur
/// ek piece ki asli lagat daam tay karte waqt hi dikh jaati hai.
/// </summary>
public class DesignRecipe
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    /// <summary>trading.items ka wo row jiska item_kind = 'design'.</summary>
    public Guid DesignId { get; set; }

    /// <summary>Top / Bottom / Dupatta / Blouse / Lining</summary>
    [Required, MaxLength(40)] public string Part { get; set; } = "";

    /// <summary>Is hisse ki majoori.</summary>
    [Column(TypeName = "numeric(12,2)")] public decimal JobRate { get; set; }
    [MaxLength(20)] public string RateUnit { get; set; } = "Pcs";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Recipe me kaunsa material, ek piece me kitna.</summary>
public class DesignRecipeMaterial
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid RecipeId { get; set; }
    public Guid MaterialId { get; set; }

    /// <summary>
    /// EK PIECE me kitna. Kul = piece × AvgQty — 156 × 2.25 = 351 mtr.
    /// Ye hisab pehle kaagaz par hota tha aur har baar naye sire se lagana padta tha.
    /// </summary>
    [Column(TypeName = "numeric(12,3)")] public decimal AvgQty { get; set; }
    [MaxLength(20)] public string Unit { get; set; } = "Meter";
}

/// <summary>
/// Karigar ko diya gaya kaam. Do hisse hote hain — MATERIAL (kya diya) aur
/// PROGRAM (kya banana hai). Dono milane se pata chalta hai ki kitna maal
/// bahar gaya aur kitna wapas aana baki hai.
/// </summary>
public class JobSlip
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid? GodownId { get; set; }

    /// <summary>ReserveCounterAsync se — MAX(no)+1 kabhi nahi.</summary>
    [Required, MaxLength(40)] public string SlipNo { get; set; } = "";
    [MaxLength(40)] public string? LotNo { get; set; }

    public Guid KarigarId { get; set; }
    [Required, MaxLength(60)] public string JobType { get; set; } = "";

    /// <summary>Kis order ke liye. Khali bhi ho sakta hai — stock ke liye bhi maal banta hai.</summary>
    public Guid? SalesOrderId { get; set; }

    public DateTimeOffset IssuedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateOnly? DueAt { get; set; }

    /// <summary>open | partial | done | cancelled</summary>
    [MaxLength(20)] public string Status { get; set; } = "open";

    public string? Note { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Karigar ko KYA DIYA.</summary>
public class JobSlipMaterial
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid JobSlipId { get; set; }
    public Guid MaterialId { get; set; }
    [MaxLength(60)] public string? Colour { get; set; }
    [Column(TypeName = "numeric(12,3)")] public decimal Qty { get; set; }
    [MaxLength(20)] public string Unit { get; set; } = "Meter";
}

/// <summary>Karigar ko KYA BANANA hai.</summary>
public class JobSlipProgram
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid JobSlipId { get; set; }
    public Guid DesignId { get; set; }
    [Required, MaxLength(40)] public string Part { get; set; } = "";
    [Column(TypeName = "numeric(12,2)")] public decimal JobRate { get; set; }
    [MaxLength(20)] public string RateUnit { get; set; } = "Pcs";
}

/// <summary>
/// "S ka 1, M ka 1, L ka 2" wala hisab. Kul piece aur ratio batao, kaunse
/// size ke kitne banenge wo app khud baant deti hai (160 piece, 1:1:2 →
/// 40/40/80). Pehle ye ek line me likhwate the aur likhne me galti hoti thi.
/// </summary>
public class JobSlipRatio
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid ProgramId { get; set; }
    [Required, MaxLength(40)] public string Size { get; set; } = "";
    public int Ratio { get; set; }
}

/// <summary>Ratio se nikla hua asli batwara — kaunse size/rang ke kitne piece.</summary>
public class JobSlipProgramSize
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid ProgramId { get; set; }
    [Required, MaxLength(40)] public string Size { get; set; } = "";
    [MaxLength(60)] public string? Colour { get; set; }
    public int Qty { get; set; }
}

/// <summary>Karigar se maal WAPAS aaya. Kharab nikla maal alag ginte hain — uski majoori nahi banti.</summary>
public class JobSlipReceipt
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid JobSlipId { get; set; }
    public DateTimeOffset ReceivedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? DesignId { get; set; }
    [MaxLength(40)] public string? Size { get; set; }
    [MaxLength(60)] public string? Colour { get; set; }
    public int Qty { get; set; }
    public int RejectedQty { get; set; }
    public string? Note { get; set; }
    public string? PhotoUrl { get; set; }
    public Guid? CreatedBy { get; set; }
}

/// <summary>
/// Kapde ka than aur uska apna meter. Taka challan, job slip, inward aur PO —
/// chaaron jagah aata hai, isliye ek hi table. <see cref="OwnerType"/> +
/// <see cref="OwnerId"/> se us line se juda hai jispar wo laga hai.
/// </summary>
public class Taka
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    /// <summary>challan_line | jobslip_material | inward_line | po_material</summary>
    [Required, MaxLength(30)] public string OwnerType { get; set; } = "";
    public Guid OwnerId { get; set; }

    /// <summary>1, 2, 3… kaunsa taka.</summary>
    public int Seq { get; set; }
    [Column(TypeName = "numeric(10,2)")] public decimal Meters { get; set; }
}

/// <summary>
/// Stock ki har aawajaahi. Stock ko kabhi ek column me mat rakhna — ek column
/// rakhte to "stock 40 dikha raha hai par godown me 12 hai" wali haalat aati
/// aur wajah kabhi nahi milti. Ledger se peeche jaakar dekh sakte hain ki
/// kis kagaz se kya hua.
/// </summary>
public class StockLedgerEntry
{
    public long Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid GodownId { get; set; }
    public Guid ItemId { get; set; }

    /// <summary>design | material</summary>
    [Required, MaxLength(20)] public string ItemKind { get; set; } = "design";
    [MaxLength(60)] public string? Colour { get; set; }
    [MaxLength(40)] public string? Size { get; set; }

    [Column(TypeName = "numeric(14,3)")] public decimal QtyIn { get; set; }
    [Column(TypeName = "numeric(14,3)")] public decimal QtyOut { get; set; }

    /// <summary>opening | challan | inward | jobslip | receipt | transfer | sreturn | preturn | adjust</summary>
    [Required, MaxLength(20)] public string RefType { get; set; } = "";
    public Guid RefId { get; set; }

    public DateTimeOffset HappenedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedBy { get; set; }
}
