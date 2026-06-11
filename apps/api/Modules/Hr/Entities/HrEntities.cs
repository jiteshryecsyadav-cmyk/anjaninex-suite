using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Hr.Entities;

public class AttendancePolicy
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid? BranchId { get; set; }
    [Required, MaxLength(150)] public string Name { get; set; } = "";
    public TimeOnly WorkStartTime { get; set; } = new(9, 30);
    public TimeOnly WorkEndTime { get; set; } = new(18, 30);
    public int LateGraceMin { get; set; } = 15;
    public int HalfDayThresholdMin { get; set; } = 240;
    public int FullDayMin { get; set; } = 480;

    [Column(TypeName = "jsonb")] public string WeekendDays { get; set; } = "[0]";
    [Column(TypeName = "jsonb")] public string HalfDayWeekends { get; set; } = "[]";

    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public class Holiday
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid? BranchId { get; set; }
    public DateOnly HolidayDate { get; set; }
    [Required, MaxLength(150)] public string Name { get; set; } = "";
    [MaxLength(20)] public string HolidayType { get; set; } = "mandatory";
    public DateTimeOffset CreatedAt { get; set; }
}

public class SalaryStructure
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    [Required, MaxLength(150)] public string Name { get; set; } = "";
    [Column(TypeName = "numeric(12,2)")] public decimal MonthlyCtc { get; set; }
    [Column(TypeName = "numeric(5,2)")]  public decimal BasicPercent { get; set; } = 50;
    [Column(TypeName = "numeric(5,2)")]  public decimal HraPercent { get; set; } = 20;
    [Column(TypeName = "jsonb")] public string Components { get; set; } = "{}";
    public bool PfApplicable { get; set; } = true;
    public bool EsiApplicable { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public class EmployeeProfile
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid ContactId { get; set; }
    public Guid? UserId { get; set; }
    [MaxLength(50)] public string? EmployeeCode { get; set; }
    public string? Designation { get; set; }
    public string? Department { get; set; }
    public DateOnly? JoiningDate { get; set; }
    public DateOnly? LeavingDate { get; set; }
    public Guid? SalaryStructureId { get; set; }
    public Guid? BranchId { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? ReportingTo { get; set; }
    public string? AadhaarHash { get; set; }
    public string? PanNumber { get; set; }
    public string? PfNumber { get; set; }
    public string? EsiNumber { get; set; }
    public string? BankAccountNoHash { get; set; }
    public string? BankIfsc { get; set; }
    public string? BankName { get; set; }
    public string? ProfileSelfieUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class AttendanceLog
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid EmployeeId { get; set; }
    public DateOnly LogDate { get; set; }

    public DateTimeOffset? CheckInAt { get; set; }
    [Column(TypeName = "numeric(9,6)")] public decimal? CheckInLat { get; set; }
    [Column(TypeName = "numeric(9,6)")] public decimal? CheckInLng { get; set; }
    public string? CheckInSelfieUrl { get; set; }
    public string? CheckInAddress { get; set; }
    [Column(TypeName = "numeric(6,2)")] public decimal? CheckInAccuracy { get; set; }

    public DateTimeOffset? CheckOutAt { get; set; }
    [Column(TypeName = "numeric(9,6)")] public decimal? CheckOutLat { get; set; }
    [Column(TypeName = "numeric(9,6)")] public decimal? CheckOutLng { get; set; }
    public string? CheckOutSelfieUrl { get; set; }
    public string? CheckOutAddress { get; set; }
    [Column(TypeName = "numeric(6,2)")] public decimal? CheckOutAccuracy { get; set; }

    public int? TotalMinutes { get; set; }
    [MaxLength(20)] public string? Status { get; set; }
    public bool IsLate { get; set; }
    public bool IsEarlyOut { get; set; }
    public string? Notes { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class LocationTrail
{
    public long Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid EmployeeId { get; set; }
    public DateTimeOffset CapturedAt { get; set; }
    [Column(TypeName = "numeric(9,6)")] public decimal Latitude { get; set; }
    [Column(TypeName = "numeric(9,6)")] public decimal Longitude { get; set; }
    [Column(TypeName = "numeric(6,2)")] public decimal? Accuracy { get; set; }
    [Column(TypeName = "numeric(6,2)")] public decimal? Speed { get; set; }
    public short? BatteryPct { get; set; }
    public bool IsBackground { get; set; }
    public string? Address { get; set; }
}

public class Selfie
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid EmployeeId { get; set; }
    [Required] public string StorageUrl { get; set; } = "";
    public string? ThumbnailUrl { get; set; }
    [Required, MaxLength(20)] public string Context { get; set; } = "";
    public DateTimeOffset CapturedAt { get; set; }
    [Column(TypeName = "numeric(9,6)")] public decimal? Lat { get; set; }
    [Column(TypeName = "numeric(9,6)")] public decimal? Lng { get; set; }
    [Column(TypeName = "numeric(6,2)")] public decimal? Accuracy { get; set; }
    public bool? FaceVerified { get; set; }
    public string? Notes { get; set; }
}

public class LeaveBalance
{
    public Guid EmployeeId { get; set; }
    public int Year { get; set; }
    [Required, MaxLength(20)] public string LeaveType { get; set; } = "";
    [Column(TypeName = "numeric(5,2)")] public decimal TotalAllocated { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal Used { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal Available { get; set; }
}

public class LeaveRequest
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid EmployeeId { get; set; }
    [Required, MaxLength(20)] public string LeaveType { get; set; } = "";
    public DateOnly FromDate { get; set; }
    public DateOnly ToDate { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal DaysCount { get; set; }
    public bool HalfDayStart { get; set; }
    public bool HalfDayEnd { get; set; }
    public string? Reason { get; set; }
    public string? DocumentUrl { get; set; }
    [MaxLength(20)] public string Status { get; set; } = "pending";
    public Guid? ApprovedBy { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public string? Remarks { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class PayrollRecord
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }
    public Guid EmployeeId { get; set; }
    public int PeriodYear { get; set; }
    public int PeriodMonth { get; set; }

    [Column(TypeName = "numeric(12,2)")] public decimal Basic { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Hra { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Da { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Special { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Conveyance { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Medical { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Bonus { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Incentive { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal OvertimeAmount { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal OtherEarnings { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal? GrossSalary { get; set; }

    [Column(TypeName = "numeric(12,2)")] public decimal PfEmployee { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal EsiEmployee { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal Tds { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal ProfessionalTax { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal LoanDeduction { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal AdvanceDeduction { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal LopDeduction { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal OtherDeductions { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal? TotalDeductions { get; set; }

    [Column(TypeName = "numeric(12,2)")] public decimal PfEmployer { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal EsiEmployer { get; set; }
    [Column(TypeName = "numeric(12,2)")] public decimal? NetSalary { get; set; }

    public int? DaysInMonth { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal? DaysPresent { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal? DaysAbsent { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal? DaysPaidLeave { get; set; }
    [Column(TypeName = "numeric(6,2)")] public decimal? OvertimeHours { get; set; }

    public bool IsPaid { get; set; }
    public DateTimeOffset? PaidAt { get; set; }
    public Guid? VoucherId { get; set; }
    public string? BankTxnRef { get; set; }
    public string? PayslipUrl { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
