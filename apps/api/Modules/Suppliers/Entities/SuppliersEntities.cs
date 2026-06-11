using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Suppliers.Entities;

public class SupplierCategory
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(150)]
    public string Name { get; set; } = "";

    public string? Slug { get; set; }
    public string? Icon { get; set; }
    public string? Color { get; set; }
    public bool IsSystem { get; set; }
    public int? SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class SupplierProfile
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid ContactId { get; set; }

    [MaxLength(50)]
    public string? SupplierCode { get; set; }

    [MaxLength(50)]
    public string? BusinessType { get; set; }

    [Column(TypeName = "jsonb")]
    public string Categories { get; set; } = "[]";

    [MaxLength(20)]
    public string RateUnit { get; set; } = "mtr";

    public string? WaGroupId { get; set; }
    public string? WaPhone { get; set; }

    public DateTimeOffset? LastRateUpdate { get; set; }

    [Column(TypeName = "numeric(3,2)")]
    public decimal? ReliabilityScore { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal? MinOrderValue { get; set; }

    public int? DeliveryLeadDays { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

// Buyer in the Active Directory (Phase 4). Common data lives in core.contacts
// (Core Master); this holds buyer-specific business fields.
public class BuyerProfile
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid ContactId { get; set; }

    [MaxLength(50)]
    public string? BuyerCode { get; set; }

    [MaxLength(50)]
    public string? BuyerType { get; set; }

    public string? BrandName { get; set; }

    [Column(TypeName = "jsonb")]
    public string Categories { get; set; } = "[]";

    [Column(TypeName = "numeric(14,2)")]
    public decimal? BudgetMin { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal? BudgetMax { get; set; }

    [MaxLength(20)]
    public string BudgetUnit { get; set; } = "mtr";

    [MaxLength(20)]
    public string? OrderFrequency { get; set; }

    public string? PaymentTerms { get; set; }

    [MaxLength(20)]
    public string? QualityPref { get; set; }

    [MaxLength(10)]
    public string? TargetCustomer { get; set; }

    public string? WaPhone { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

// Appointments (Phase 5) — supplier<->buyer meeting, branch + staff ke saath.
public class Appointment
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid? BranchId { get; set; }

    [MaxLength(10)]
    public string VisitDirection { get; set; } = "s2b";

    public string? Title { get; set; }
    public Guid? SupplierId { get; set; }
    public Guid? BuyerId { get; set; }

    public DateOnly AppointmentDate { get; set; }
    public TimeOnly? AppointmentTime { get; set; }
    public int DurationMinutes { get; set; } = 60;

    public string? City { get; set; }
    public string? Address { get; set; }
    public string? OnlineLink { get; set; }

    [Column(TypeName = "jsonb")]
    public string Samples { get; set; } = "[]";

    public string? Agenda { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "draft";

    public string? Outcome { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
}

public class AppointmentStaff
{
    public Guid Id { get; set; }
    public Guid AppointmentId { get; set; }
    public Guid EmployeeId { get; set; }
    public bool IsLead { get; set; }
}

public class SupplierPhoto
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid SupplierId { get; set; }

    [Required]
    public string StorageUrl { get; set; } = "";

    public string? ThumbnailUrl { get; set; }
    public string? Title { get; set; }

    [Column(TypeName = "numeric(10,2)")]
    public decimal? Rate { get; set; }

    public string? RateUnit { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset UploadedAt { get; set; }
}

public class SupplierRate
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid SupplierId { get; set; }
    public Guid? CategoryId { get; set; }
    public string? CategoryName { get; set; }

    [Column(TypeName = "numeric(10,2)")]
    public decimal Rate { get; set; }

    [Required, MaxLength(20)]
    public string RateUnit { get; set; } = "mtr";

    [Column(TypeName = "numeric(10,2)")]
    public decimal? MinQty { get; set; }

    public DateOnly? ValidFrom { get; set; }
    public DateOnly? ValidTo { get; set; }
    public string Source { get; set; } = "manual";
    public DateTimeOffset CreatedAt { get; set; }
}
