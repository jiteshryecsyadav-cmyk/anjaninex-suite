using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Dukan.Entities;

// ============================================================================
// ONLINE DUKAN — per-firm e-commerce module (ported from KALINDI Express backend).
// Har firm ka apna dukan: settings, categories, products, buyers, orders, reviews.
// snake_case columns UseSnakeCaseNamingConvention se auto-map ho jaate hain.
// ============================================================================

// 1. SETTINGS — seller profile, 1 row per firm (firm_id is the PK).
public class DukanSettings
{
    [Key]
    public Guid FirmId { get; set; }

    [MaxLength(200)]
    public string Name { get; set; } = "";

    public string? Upi { get; set; }
    public string? Acc { get; set; }
    public string? Ifsc { get; set; }
    public string? Bank { get; set; }
    public string? City { get; set; }
    public string? Gst { get; set; }
    public string? Mobile { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? Whatsapp { get; set; }
    public string? Instagram { get; set; }
    public string? Facebook { get; set; }

    [Column(TypeName = "numeric(3,2)")]
    public decimal Rating { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

// 2. CATEGORY
public class DukanCategory
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    [MaxLength(20)]
    public string Status { get; set; } = "active";   // active|inactive

    public string? Descr { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

// 3. PRODUCT
public class DukanProduct
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid? CatId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    [MaxLength(50)]
    public string? Code { get; set; }

    [Column(TypeName = "numeric(12,2)")] public decimal Mrp { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }

    public int Stock { get; set; }

    public string? Img { get; set; }

    [Column(TypeName = "numeric(5,2)")] public decimal Gst { get; set; }
    public bool GstInc { get; set; } = true;
    public bool Combo { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

// 4. BUYER — external customer (phone + 6-digit PIN), unique (firm_id, phone)
public class DukanBuyer
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    [Required, MaxLength(20)]
    public string Phone { get; set; } = "";

    [Required]
    public string PinHash { get; set; } = "";

    public string? Email { get; set; }
    public string? Gstin { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public List<DukanBuyerAddress> Addresses { get; set; } = new();
}

// 5. BUYER ADDRESS
public class DukanBuyerAddress
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid BuyerId { get; set; }

    public string? Label { get; set; }
    public string? Receiver { get; set; }
    public string? Mobile { get; set; }
    public string? Line { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? Pin { get; set; }

    public bool IsDefault { get; set; }

    [Column(TypeName = "numeric(10,6)")] public decimal? Lat { get; set; }
    [Column(TypeName = "numeric(10,6)")] public decimal? Lng { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DukanBuyer? Buyer { get; set; }
}

// 6. ORDER
public class DukanOrder
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [MaxLength(50)]
    public string? BillNo { get; set; }

    public Guid? BuyerId { get; set; }
    public string? BuyerName { get; set; }

    public DateTimeOffset OrderDate { get; set; }

    [Column(TypeName = "numeric(14,2)")] public decimal Subtotal { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Delivery { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Gst { get; set; }
    [Column(TypeName = "numeric(14,2)")] public decimal Total { get; set; }

    public string? Receiver { get; set; }
    public string? Address { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "PAID";

    public DateTimeOffset CreatedAt { get; set; }

    public List<DukanOrderItem> Items { get; set; } = new();
}

// 7. ORDER ITEM
public class DukanOrderItem
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid OrderId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    public int Qty { get; set; } = 1;

    [Column(TypeName = "numeric(12,2)")] public decimal Rate { get; set; }
    [Column(TypeName = "numeric(5,2)")]  public decimal Gst { get; set; }
    public bool GstInc { get; set; } = true;

    public DukanOrder? Order { get; set; }
}

// 8. REVIEW — 1 per order, PK (firm_id, order_id)
public class DukanReview
{
    public Guid FirmId { get; set; }
    public Guid OrderId { get; set; }

    public int Stars { get; set; }
    public string? Text { get; set; }
    public string? Buyer { get; set; }
    public DateTimeOffset ReviewDate { get; set; }
    public string? Reply { get; set; }
    public DateTimeOffset? ReplyDate { get; set; }
}
