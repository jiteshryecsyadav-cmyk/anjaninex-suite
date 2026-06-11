using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Accounting.Entities;

public class AccountHead
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(20)]
    public string Code { get; set; } = "";

    [Required, MaxLength(100)]
    public string Name { get; set; } = "";

    [Required, MaxLength(20)]
    public string Nature { get; set; } = "";   // assets|liabilities|capital|income|expenses

    [Required, MaxLength(2)]
    public string Sign { get; set; } = "Dr";   // Dr or Cr

    public int? SortOrder { get; set; }
    public bool IsSystem { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class AccountGroup
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid HeadId { get; set; }

    [MaxLength(20)]
    public string? Code { get; set; }

    [Required, MaxLength(150)]
    public string Name { get; set; } = "";

    public bool IsSystem { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public AccountHead? Head { get; set; }
}

public class SubGroup
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid GroupId { get; set; }

    [MaxLength(20)]
    public string? Code { get; set; }

    [Required, MaxLength(150)]
    public string Name { get; set; } = "";

    public bool IsSystem { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public AccountGroup? Group { get; set; }
}

public class Ledger
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid SubGroupId { get; set; }
    public Guid? ContactId { get; set; }

    [MaxLength(20)]
    public string? Code { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    [Column(TypeName = "numeric(14,2)")]
    public decimal OpeningBalance { get; set; }

    [MaxLength(2)]
    public string OpeningType { get; set; } = "Dr";

    public bool IsRevenueAccount { get; set; }

    [Column(TypeName = "jsonb")]
    public string TaxSettings { get; set; } = "{}";

    public string? BankAccountNo { get; set; }
    public string? BankIfsc { get; set; }
    public string? BankBranch { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public SubGroup? SubGroup { get; set; }
}

public class Voucher
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid BranchId { get; set; }

    [Required, MaxLength(20)]
    public string VoucherType { get; set; } = "";    // payment|receipt|contra|journal|sales|purchase

    [Required, MaxLength(50)]
    public string VoucherNo { get; set; } = "";

    public DateOnly VoucherDate { get; set; }

    public string? Narration { get; set; }

    [Column(TypeName = "numeric(14,2)")]
    public decimal TotalAmount { get; set; }

    public string? SourceModule { get; set; }
    public Guid? SourceRefId { get; set; }

    public bool IsPosted { get; set; } = true;
    public bool IsReconciled { get; set; }
    public DateTimeOffset? ReconciledAt { get; set; }

    public Guid CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }

    public List<VoucherLine> Lines { get; set; } = new();
}

public class VoucherLine
{
    public Guid Id { get; set; }
    public Guid VoucherId { get; set; }
    public Guid LedgerId { get; set; }

    [Required, MaxLength(2)]
    public string DebitCredit { get; set; } = "Dr";

    [Column(TypeName = "numeric(14,2)")]
    public decimal Amount { get; set; }

    public string? Narration { get; set; }
    public int? SortOrder { get; set; }

    public Voucher? Voucher { get; set; }
    public Ledger? Ledger { get; set; }
}
