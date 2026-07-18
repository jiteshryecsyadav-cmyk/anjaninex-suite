using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Core.Entities;

public class User
{
    public Guid Id { get; set; }
    public Guid? FirmId { get; set; }

    // Agent/reseller login link (migration 48) — set ho to ye user ek agent hai (FirmId null).
    public Guid? AgentId { get; set; }

    [Required, MaxLength(150)]
    public string Username { get; set; } = "";

    [MaxLength(200)]
    public string? Email { get; set; }

    [MaxLength(20)]
    public string? Phone { get; set; }

    [MaxLength(20)]
    public string? Whatsapp { get; set; }

    [Required, MaxLength(200)]
    public string FullName { get; set; } = "";

    [Required, MaxLength(500)]
    public string PasswordHash { get; set; } = "";

    public Guid? DefaultBranchId { get; set; }
    public Guid? DepartmentId { get; set; }
    public bool CanViewAllBranches { get; set; }
    [Column("requires_2fa")]
    public bool Requires2fa { get; set; }
    public string? TotpSecret { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsLocked { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }
    public string? AvatarUrl { get; set; }
    public string Locale { get; set; } = "en-IN";
    public string Theme { get; set; } = "light";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class Branch
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(20)]
    public string Code { get; set; } = "";

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    public string? Address { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? Pincode { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }

    [Column(TypeName = "numeric(9,6)")]
    public decimal? Latitude { get; set; }

    [Column(TypeName = "numeric(9,6)")]
    public decimal? Longitude { get; set; }

    [MaxLength(2)]
    public string? GstStateCode { get; set; }

    public string? BillPrefix { get; set; }
    public string? VoucherPrefix { get; set; }
    public bool IsHeadOffice { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public class Department
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid? BranchId { get; set; }

    [Required, MaxLength(150)]
    public string Name { get; set; } = "";

    public string? Code { get; set; }
    public Guid? HeadUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class UserBranchAccess
{
    public Guid UserId { get; set; }
    public Guid BranchId { get; set; }
    public bool IsDefault { get; set; }
}

public class Session
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    [Required, MaxLength(500)]
    public string RefreshTokenHash { get; set; } = "";

    [Column(TypeName = "jsonb")]
    public string? DeviceInfo { get; set; }

    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class Role
{
    public Guid Id { get; set; }
    public Guid? FirmId { get; set; }

    [Required, MaxLength(50)]
    public string Code { get; set; } = "";

    [Required, MaxLength(150)]
    public string Name { get; set; } = "";

    public string? Description { get; set; }
    public Guid? InheritsFrom { get; set; }
    public bool IsSystem { get; set; }
    public string? Color { get; set; }
    public int? SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class Permission
{
    public long Id { get; set; }

    [Required, MaxLength(150)]
    public string Code { get; set; } = "";

    [Required, MaxLength(50)]
    public string Module { get; set; } = "";

    [Required, MaxLength(50)]
    public string Resource { get; set; } = "";

    [Required, MaxLength(50)]
    public string Action { get; set; } = "";

    [Required, MaxLength(50)]
    public string Scope { get; set; } = "";

    public string? Description { get; set; }
    public bool IsDangerous { get; set; }
    [Column("requires_2fa")]
    public bool Requires2fa { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class RolePermission
{
    public Guid RoleId { get; set; }
    public long PermissionId { get; set; }
    public Guid? GrantedBy { get; set; }
    public DateTimeOffset GrantedAt { get; set; }
}

public class UserRole
{
    public Guid UserId { get; set; }
    public Guid RoleId { get; set; }
    public DateTimeOffset AssignedAt { get; set; }
}

public class UserPermissionOverride
{
    public Guid UserId { get; set; }
    public long PermissionId { get; set; }
    public bool Granted { get; set; }
    public string? Reason { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public Guid? GrantedBy { get; set; }
    public DateTimeOffset GrantedAt { get; set; }
}

public class Contact
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(200)]
    public string DisplayName { get; set; } = "";

    public string? LegalName { get; set; }
    public string EntityType { get; set; } = "individual";
    public string? PhonePrimary { get; set; }

    // Common WhatsApp numbers (single source) — bot inhi se supplier/buyer pehchaanta hai.
    [MaxLength(20)] public string? WaSupplier { get; set; }
    [MaxLength(20)] public string? WaBuyer { get; set; }

    // Sister-concern grouping: "Gupta Group" (member firms ka same group_name).
    [MaxLength(200)] public string? GroupName { get; set; }

    // Party classification + MSME (party master ke naye fields).
    [MaxLength(30)] public string? SupplierType { get; set; }   // manufacturer/wholesaler/trader/...
    [MaxLength(30)] public string? BuyerType { get; set; }      // wholesale/retailer/distributor/...
    [MaxLength(25)] public string? UdyamNo { get; set; }        // Udyam Aadhaar number
    [MaxLength(30)] public string? MsmeType { get; set; }       // micro/small/medium/trader/...
    [MaxLength(20)] public string? WaExtra { get; set; }        // 3rd WhatsApp number
    [MaxLength(20)] public string? WaExtraRole { get; set; }    // accountant/manager/staff

    // Buyer ka default agent (del-credere / payment guarantee) + uska commission share%.
    public Guid? BuyerAgentId { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal? BuyerAgentSharePct { get; set; }

    [Column(TypeName = "jsonb")]
    public string Phones { get; set; } = "[]";

    public string? EmailPrimary { get; set; }

    [Column(TypeName = "jsonb")]
    public string Emails { get; set; } = "[]";

    [MaxLength(15)]
    public string? GstNumber { get; set; }

    [MaxLength(10)]
    public string? PanNumber { get; set; }

    [Column(TypeName = "jsonb")]
    public string Addresses { get; set; } = "[]";

    [Column(TypeName = "jsonb")]
    public string Tags { get; set; } = "[]";

    [Column(TypeName = "jsonb")]
    public string Flags { get; set; } = "{}";

    public string? SourceModule { get; set; }
    public string? Notes { get; set; }
    public string? AvatarUrl { get; set; }
    public Guid? MergedIntoId { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
}
