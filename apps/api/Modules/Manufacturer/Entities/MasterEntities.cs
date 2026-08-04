using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Manufacturer.Entities;

// ============================================================================
// MANUFACTURER — Masters
// Inke bina koi document ban hi nahi sakta, isliye sabse pehle.
// Table mapping AppDbContext.OnModelCreating me — schema "mfg".
// ============================================================================

/// <summary>
/// Maal banane wala. Ek MOBILE par ek hi karigar — iske bina "Chintan" aur
/// "Chintan Bhai" do alag aadmi ban jaate the aur majoori ka khata do jagah
/// bat jata tha.
/// </summary>
public class Karigar
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(150)] public string Name { get; set; } = "";
    [MaxLength(200)] public string? FirmName { get; set; }
    [Required, MaxLength(20)] public string Mobile { get; set; } = "";

    /// <summary>Cutting / Silai / Finishing / Rangai / Printing / Embroidery …</summary>
    [Required, MaxLength(60)] public string JobType { get; set; } = "";

    /// <summary>Kis agent ke through aaya — sirf karigar-wale agent hi lagenge.</summary>
    public Guid? AgentId { get; set; }

    [MaxLength(100)] public string? State { get; set; }
    [MaxLength(100)] public string? City { get; set; }
    public string? Address { get; set; }
    [MaxLength(10)] public string? Pincode { get; set; }
    [MaxLength(20)] public string? Gstin { get; set; }
    [MaxLength(40)] public string? GstType { get; set; }
    [MaxLength(10)] public string? Pan { get; set; }
    public string? PhotoUrl { get; set; }

    /// <summary>
    /// Aadmi chhod ke jaye to row mat mitao — ye false kar do. Uske banaye
    /// job slip aur majoori ka hisab salaamat rehna chahiye.
    /// </summary>
    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Do bilkul alag kaam ke agent hote hain aur log inhe ek list me mila dete
/// the — isliye job slip par galat aadmi ka commission chadh jata tha.
/// <see cref="IsKarigarAgent"/> hi ye tay karta hai ki naam kis khaane me dikhega.
/// </summary>
public class MfgAgent
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(150)] public string Name { get; set; } = "";
    [MaxLength(200)] public string? AgencyName { get; set; }
    [Required, MaxLength(20)] public string Mobile { get; set; } = "";

    /// <summary>
    /// true  = karigar dilwane wala → job slip / karigar ke khaane me dikhe.
    /// false = grahak laane wala    → order / challan / invoice me dikhe.
    /// </summary>
    public bool IsKarigarAgent { get; set; }

    [MaxLength(100)] public string? State { get; set; }
    [MaxLength(100)] public string? City { get; set; }
    public string? Address { get; set; }
    [MaxLength(10)] public string? Pincode { get; set; }
    [MaxLength(20)] public string? Gstin { get; set; }
    [MaxLength(40)] public string? GstType { get; set; }
    [MaxLength(10)] public string? Pan { get; set; }
    public string? PhotoUrl { get; set; }

    /// <summary>all | selected | no_rate | none — apni dukan me kya dikhe.</summary>
    [MaxLength(20)] public string Visibility { get; set; } = "all";

    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Jagah. Iske bina stock ka koi matlab nahi — "Surat wale godown me kitna
/// hai" ka jawab tabhi milta hai.
/// </summary>
public class Godown
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(150)] public string Name { get; set; } = "";
    [Required, MaxLength(20)] public string Mobile { get; set; } = "";

    [MaxLength(100)] public string? State { get; set; }
    [MaxLength(100)] public string? City { get; set; }
    public string? Address { get; set; }
    [MaxLength(10)] public string? Pincode { get; set; }
    public string? PhotoUrl { get; set; }

    /// <summary>
    /// Nayi entry me yahi jagah pehle se chuni aayegi. DB par partial unique
    /// index hai — ek firm me MAIN sirf ek ho sakti hai.
    /// </summary>
    public bool IsMain { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Size ki master list — warna "XL" aur "xl" alag ban jaate hain.</summary>
public class MfgSize
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    [Required, MaxLength(40)] public string Name { get; set; } = "";
    public int SortOrder { get; set; } = 100;
}

/// <summary>Rang ki master list. <see cref="Hex"/> se list me gol nishaan banta hai.</summary>
public class MfgColour
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    [Required, MaxLength(60)] public string Name { get; set; } = "";
    [MaxLength(9)] public string? Hex { get; set; }
    public int SortOrder { get; set; } = 100;
}

/// <summary>
/// Design ka tag. Master list se isliye ki koi "cotton" likhta hai koi
/// "Cotton" — dono alag tag ban jaate the aur filter me aadha maal gayab.
/// </summary>
public class DesignTag
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    [Required, MaxLength(60)] public string Name { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Design ↔ tag ka jod.</summary>
public class ItemTag
{
    public Guid FirmId { get; set; }
    public Guid ItemId { get; set; }
    public Guid TagId { get; set; }
}
