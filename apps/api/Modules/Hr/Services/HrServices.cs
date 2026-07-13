using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;
using Namokara.Api.Modules.Core.Entities;
using Namokara.Api.Modules.Hr.Entities;

namespace Namokara.Api.Modules.Hr.Services;

// =============================================================================
// DTOs
// =============================================================================
public record EmployeeListItemDto(
    Guid Id, Guid ContactId, string EmployeeCode,
    string FullName, string? Designation, string? Department,
    string? Phone, string? Email,
    DateOnly? JoiningDate, Guid? BranchId,
    decimal? MonthlyCtc, string? SalaryStructureName,
    bool IsActive,
    int LeavesAvailable,
    Guid? UserId = null, string? Username = null);

public record EmployeeDetailDto(
    Guid Id, Guid ContactId, Guid? UserId,
    string EmployeeCode, string FullName,
    string? Phone, string? Email,
    string? Designation, string? Department,
    DateOnly? JoiningDate, DateOnly? LeavingDate,
    Guid? SalaryStructureId, string? SalaryStructureName,
    decimal? MonthlyCtc,
    Guid? BranchId, string? BranchName,
    string? PanNumber, string? PfNumber, string? EsiNumber,
    string? BankName, string? BankIfsc,
    string? ProfileSelfieUrl,
    bool IsActive);

public record CreateEmployeeDto(
    string FullName, string? Phone, string? Email,
    string? Designation, string? Department,
    DateOnly JoiningDate,
    Guid? SalaryStructureId, Guid? BranchId,
    string? PanNumber, string? PfNumber, string? EsiNumber,
    string? BankName, string? BankIfsc,
    decimal? MonthlyCtc = null,
    Guid? UserId = null);   // staff ko login user se link karo — check-in isi se chalti hai

public record AttendanceLogDto(
    Guid Id, Guid EmployeeId, string EmployeeName,
    DateOnly LogDate,
    DateTimeOffset? CheckInAt, DateTimeOffset? CheckOutAt,
    decimal? CheckInLat, decimal? CheckInLng,
    decimal? CheckOutLat, decimal? CheckOutLng,
    string? CheckInSelfieUrl, string? CheckOutSelfieUrl,
    string? CheckInAddress, string? CheckOutAddress,
    int? TotalMinutes, string? Status, bool IsLate, bool IsEarlyOut);

public record CheckInOutDto(
    decimal Latitude, decimal Longitude, decimal? Accuracy, string? Address,
    string? SelfieUrl);

public record LeaveRequestDto(
    Guid Id, Guid EmployeeId, string EmployeeName,
    string LeaveType, DateOnly FromDate, DateOnly ToDate, decimal DaysCount,
    string? Reason, string Status, DateTimeOffset CreatedAt,
    string? ApprovedByName, DateTimeOffset? ApprovedAt, string? Remarks);

public record ApplyLeaveDto(
    string LeaveType, DateOnly FromDate, DateOnly ToDate,
    bool HalfDayStart, bool HalfDayEnd, string? Reason);

public record LeaveBalanceDto(string LeaveType, decimal TotalAllocated, decimal Used, decimal Available);

public record LocationPingDto(decimal Latitude, decimal Longitude, decimal? Accuracy, decimal? Speed, short? BatteryPct, bool IsBackground);

public record LocationPointDto(DateTimeOffset CapturedAt, decimal Latitude, decimal Longitude, decimal? Accuracy);

public record HrDashboardDto(
    int TotalEmployees, int ActiveEmployees,
    int PresentToday, int AbsentToday, int OnLeaveToday,
    decimal AttendancePercent,
    int PendingLeaveRequests,
    decimal MonthlyPayrollBudget,
    int BirthdaysThisWeek);

public record PayrollRunDto(int Year, int Month, List<Guid>? EmployeeIds);

public record PayslipDto(
    Guid Id, Guid EmployeeId, string EmployeeName, int Year, int Month,
    decimal Basic, decimal Hra, decimal Da, decimal Special, decimal Conveyance, decimal Medical,
    decimal Bonus, decimal Incentive, decimal OvertimeAmount, decimal OtherEarnings,
    decimal GrossSalary,
    decimal PfEmployee, decimal EsiEmployee, decimal Tds, decimal ProfessionalTax,
    decimal LoanDeduction, decimal AdvanceDeduction, decimal LopDeduction, decimal OtherDeductions,
    decimal TotalDeductions,
    decimal PfEmployer, decimal EsiEmployer,
    decimal NetSalary,
    int? DaysInMonth, decimal? DaysPresent, decimal? DaysAbsent, decimal? DaysPaidLeave,
    bool IsPaid, DateTimeOffset? PaidAt, Guid? VoucherId, string? VoucherNo);

// =============================================================================
// EmployeeService
// =============================================================================
public interface IEmployeeService
{
    Task<List<EmployeeListItemDto>> List(string? search = null);
    Task<EmployeeDetailDto?> Get(Guid id);
    Task<EmployeeDetailDto> Create(CreateEmployeeDto dto, Guid firmId, Guid byUserId);
    Task<EmployeeDetailDto> Update(Guid id, CreateEmployeeDto dto);
    Task Delete(Guid id);
}

public class EmployeeService : IEmployeeService
{
    private readonly AppDbContext _db;
    public EmployeeService(AppDbContext db) => _db = db;

    public async Task<List<EmployeeListItemDto>> List(string? search = null)
    {
        var query = from e in _db.EmployeeProfiles
                    join c in _db.Contacts on e.ContactId equals c.Id
                    where e.IsActive
                    select new { e, c };

        if (!string.IsNullOrEmpty(search))
            query = query.Where(x => EF.Functions.ILike(x.c.DisplayName, $"%{search}%")
                                  || x.e.EmployeeCode!.Contains(search));

        var rows = await query.OrderBy(x => x.c.DisplayName).Take(500).ToListAsync();

        // Salary structures
        var structIds = rows.Where(r => r.e.SalaryStructureId.HasValue).Select(r => r.e.SalaryStructureId!.Value).Distinct().ToList();
        var structs = await _db.SalaryStructures.Where(s => structIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => new { s.Name, s.MonthlyCtc });

        // Leave balances current year
        var year = DateTime.Now.Year;
        var empIds = rows.Select(r => r.e.Id).ToList();
        var balances = await _db.LeaveBalances
            .Where(lb => empIds.Contains(lb.EmployeeId) && lb.Year == year)
            .GroupBy(lb => lb.EmployeeId)
            .Select(g => new { EmpId = g.Key, Total = g.Sum(x => x.Available) })
            .ToDictionaryAsync(x => x.EmpId, x => x.Total);

        // Linked login usernames (staff ↔ login link Team page se ek hi jagah dikhe)
        var userIds = rows.Where(r => r.e.UserId.HasValue).Select(r => r.e.UserId!.Value).Distinct().ToList();
        var usernames = await _db.Users.Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Username);

        return rows.Select(r => new EmployeeListItemDto(
            r.e.Id, r.c.Id, r.e.EmployeeCode ?? "",
            r.c.DisplayName, r.e.Designation, r.e.Department,
            r.c.PhonePrimary, r.c.EmailPrimary,
            r.e.JoiningDate, r.e.BranchId,
            r.e.SalaryStructureId.HasValue && structs.TryGetValue(r.e.SalaryStructureId.Value, out var s) ? s.MonthlyCtc : null,
            r.e.SalaryStructureId.HasValue && structs.TryGetValue(r.e.SalaryStructureId.Value, out var s2) ? s2.Name : null,
            r.e.IsActive,
            (int)balances.GetValueOrDefault(r.e.Id, 0),
            r.e.UserId,
            r.e.UserId.HasValue ? usernames.GetValueOrDefault(r.e.UserId.Value) : null)).ToList();
    }

    public async Task<EmployeeDetailDto?> Get(Guid id)
    {
        var data = await (from e in _db.EmployeeProfiles
                          join c in _db.Contacts on e.ContactId equals c.Id
                          where e.Id == id
                          select new { e, c }).FirstOrDefaultAsync();
        if (data == null) return null;

        var s = data.e.SalaryStructureId.HasValue
            ? await _db.SalaryStructures.FirstOrDefaultAsync(x => x.Id == data.e.SalaryStructureId.Value)
            : null;

        var b = data.e.BranchId.HasValue
            ? await _db.Branches.FirstOrDefaultAsync(x => x.Id == data.e.BranchId.Value)
            : null;

        return new EmployeeDetailDto(
            data.e.Id, data.c.Id, data.e.UserId, data.e.EmployeeCode ?? "",
            data.c.DisplayName, data.c.PhonePrimary, data.c.EmailPrimary,
            data.e.Designation, data.e.Department,
            data.e.JoiningDate, data.e.LeavingDate,
            data.e.SalaryStructureId, s?.Name, s?.MonthlyCtc,
            data.e.BranchId, b?.Name,
            data.e.PanNumber, data.e.PfNumber, data.e.EsiNumber,
            data.e.BankName, data.e.BankIfsc,
            data.e.ProfileSelfieUrl, data.e.IsActive);
    }

    public async Task<EmployeeDetailDto> Create(CreateEmployeeDto dto, Guid firmId, Guid byUserId)
    {
        // Ek login sirf ek active staff se link ho sakta hai (check-in FirstOrDefault pe chalti hai)
        if (dto.UserId.HasValue && await _db.EmployeeProfiles.AnyAsync(e => e.UserId == dto.UserId && e.IsActive))
            throw new InvalidOperationException("Ye login pehle se kisi staff se linked hai");

        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            // RLS context is transaction ke liye pakka set karo — warna leave_balances ki
            // EXISTS-subquery policy me current_firm_id() NULL/miss ho ke 42501 (insufficient_privilege) aata hai.
            await _db.Database.ExecuteSqlRawAsync("SELECT set_config('app.current_firm_id', {0}, false)", firmId.ToString());

            var contact = new Contact
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                DisplayName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.FullName),
                EntityType = "individual",
                PhonePrimary = dto.Phone,
                EmailPrimary = dto.Email,
                Flags = "{\"is_employee\":true}",
                SourceModule = "hr",
                CreatedBy = byUserId,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.Contacts.Add(contact);

            // CTC diya ho to auto salary-structure bana ke link karo (payroll usi se chalti hai)
            Guid? structureId = dto.SalaryStructureId;
            if (structureId == null && dto.MonthlyCtc is decimal ctc && ctc > 0)
            {
                var st = new SalaryStructure
                {
                    Id = Guid.NewGuid(),
                    FirmId = firmId,
                    Name = $"{dto.FullName} — CTC",
                    MonthlyCtc = ctc,
                    BasicPercent = 50,
                    HraPercent = 20,
                    PfApplicable = true,
                    EsiApplicable = true,
                    IsActive = true,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                _db.SalaryStructures.Add(st);
                structureId = st.Id;
            }

            // Contact + salary structure pehle persist karo. Warna EF galat order me EmployeeProfile
            // insert kar de to contact_id / salary_structure_id FK fail hota hai (23503).
            await _db.SaveChangesAsync();

            var emp = new EmployeeProfile
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                ContactId = contact.Id,
                UserId = dto.UserId,
                EmployeeCode = await GenerateCode(firmId),
                Designation = dto.Designation,
                Department = dto.Department,
                JoiningDate = dto.JoiningDate,
                SalaryStructureId = structureId,
                BranchId = dto.BranchId,
                PanNumber = dto.PanNumber,
                PfNumber = dto.PfNumber,
                EsiNumber = dto.EsiNumber,
                BankName = dto.BankName,
                BankIfsc = dto.BankIfsc,
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.EmployeeProfiles.Add(emp);
            await _db.SaveChangesAsync();   // emp persist -> leave_balances ka employee_id FK valid rahe

            // Init leave balances
            var year = DateTime.Now.Year;
            _db.LeaveBalances.Add(new LeaveBalance { EmployeeId = emp.Id, Year = year, LeaveType = "sick", TotalAllocated = 12, Used = 0 });
            _db.LeaveBalances.Add(new LeaveBalance { EmployeeId = emp.Id, Year = year, LeaveType = "casual", TotalAllocated = 12, Used = 0 });
            _db.LeaveBalances.Add(new LeaveBalance { EmployeeId = emp.Id, Year = year, LeaveType = "earned", TotalAllocated = 15, Used = 0 });

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            return (await Get(emp.Id))!;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public async Task<EmployeeDetailDto> Update(Guid id, CreateEmployeeDto dto)
    {
        if (dto.UserId.HasValue && await _db.EmployeeProfiles.AnyAsync(e => e.UserId == dto.UserId && e.IsActive && e.Id != id))
            throw new InvalidOperationException("Ye login pehle se kisi aur staff se linked hai");

        var emp = await _db.EmployeeProfiles.SingleAsync(e => e.Id == id);
        var contact = await _db.Contacts.SingleAsync(c => c.Id == emp.ContactId);

        contact.DisplayName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.FullName);
        contact.PhonePrimary = dto.Phone;
        contact.EmailPrimary = dto.Email;
        contact.UpdatedAt = DateTimeOffset.UtcNow;

        emp.Designation = dto.Designation;
        emp.Department = dto.Department;
        emp.JoiningDate = dto.JoiningDate;
        emp.UserId = dto.UserId;
        emp.SalaryStructureId = dto.SalaryStructureId;

        // CTC update: linked structure ho to uska CTC badlo, warna naya banao
        if (dto.MonthlyCtc is decimal ctc && ctc > 0)
        {
            var st = emp.SalaryStructureId.HasValue
                ? await _db.SalaryStructures.FirstOrDefaultAsync(x => x.Id == emp.SalaryStructureId.Value)
                : null;
            if (st != null)
            {
                st.MonthlyCtc = ctc;
            }
            else
            {
                st = new SalaryStructure
                {
                    Id = Guid.NewGuid(),
                    FirmId = emp.FirmId,
                    Name = $"{dto.FullName} — CTC",
                    MonthlyCtc = ctc,
                    BasicPercent = 50,
                    HraPercent = 20,
                    PfApplicable = true,
                    EsiApplicable = true,
                    IsActive = true,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                _db.SalaryStructures.Add(st);
                emp.SalaryStructureId = st.Id;
            }
        }

        emp.BranchId = dto.BranchId;
        emp.PanNumber = dto.PanNumber;
        emp.PfNumber = dto.PfNumber;
        emp.EsiNumber = dto.EsiNumber;
        emp.BankName = dto.BankName;
        emp.BankIfsc = dto.BankIfsc;
        emp.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return (await Get(id))!;
    }

    public async Task Delete(Guid id)
    {
        var emp = await _db.EmployeeProfiles.SingleAsync(e => e.Id == id);
        emp.IsActive = false;
        emp.LeavingDate = DateOnly.FromDateTime(DateTime.Now);
        await _db.SaveChangesAsync();
    }

    private async Task<string> GenerateCode(Guid firmId)
    {
        var count = await _db.EmployeeProfiles.CountAsync(e => e.FirmId == firmId);
        return $"EMP-{(count + 1):D3}";
    }
}

// =============================================================================
// AttendanceService (check-in / check-out with selfie + GPS)
// =============================================================================
public interface IAttendanceService
{
    Task<AttendanceLogDto> CheckIn(Guid employeeId, CheckInOutDto dto, Guid firmId);
    Task<AttendanceLogDto> CheckOut(Guid employeeId, CheckInOutDto dto);
    Task<AttendanceLogDto?> GetTodayLog(Guid employeeId);
    Task<List<AttendanceLogDto>> MonthlyRegister(int year, int month, Guid? branchId);
    Task<List<AttendanceLogDto>> EmployeeMonth(Guid employeeId, int year, int month);
}

public class AttendanceService : IAttendanceService
{
    private readonly AppDbContext _db;

    public AttendanceService(AppDbContext db) => _db = db;

    // Server VPS UTC pe chalta hai — attendance time IST (UTC+5:30) me hona chahiye warna
    // sab "late" mark ho jate the. Saari time/date IST se lo.
    private static readonly TimeSpan IST = new TimeSpan(5, 30, 0);
    private static DateTimeOffset NowIst() => DateTimeOffset.UtcNow.ToOffset(IST);

    public async Task<AttendanceLogDto> CheckIn(Guid employeeId, CheckInOutDto dto, Guid firmId)
    {
        var today = DateOnly.FromDateTime(NowIst().DateTime);
        var existing = await _db.AttendanceLogs
            .FirstOrDefaultAsync(a => a.EmployeeId == employeeId && a.LogDate == today);

        if (existing != null && existing.CheckInAt != null)
            throw new InvalidOperationException("Already checked in today");

        var policy = await _db.AttendancePolicies
            .Where(p => p.FirmId == firmId && p.IsActive)
            .FirstOrDefaultAsync();

        var now = NowIst();
        var isLate = false;
        if (policy != null)
        {
            var workStart = policy.WorkStartTime;
            var graceCutoff = workStart.AddMinutes(policy.LateGraceMin);
            isLate = TimeOnly.FromDateTime(now.DateTime) > graceCutoff;
        }

        AttendanceLog log;
        if (existing != null)
        {
            log = existing;
            log.CheckInAt = now;
            log.CheckInLat = dto.Latitude;
            log.CheckInLng = dto.Longitude;
            log.CheckInAccuracy = dto.Accuracy;
            log.CheckInAddress = dto.Address;
            log.CheckInSelfieUrl = dto.SelfieUrl;
            log.IsLate = isLate;
            log.UpdatedAt = now;
        }
        else
        {
            log = new AttendanceLog
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                EmployeeId = employeeId,
                LogDate = today,
                CheckInAt = now,
                CheckInLat = dto.Latitude,
                CheckInLng = dto.Longitude,
                CheckInAccuracy = dto.Accuracy,
                CheckInAddress = dto.Address,
                CheckInSelfieUrl = dto.SelfieUrl,
                Status = "present",
                IsLate = isLate,
                CreatedAt = now,
                UpdatedAt = now
            };
            _db.AttendanceLogs.Add(log);
        }

        // Save selfie record if URL provided
        if (!string.IsNullOrEmpty(dto.SelfieUrl))
        {
            _db.Selfies.Add(new Selfie
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                EmployeeId = employeeId,
                StorageUrl = dto.SelfieUrl,
                Context = "check_in",
                CapturedAt = now,
                Lat = dto.Latitude,
                Lng = dto.Longitude,
                Accuracy = dto.Accuracy
            });
        }

        await _db.SaveChangesAsync();
        return await ToDto(log);
    }

    public async Task<AttendanceLogDto> CheckOut(Guid employeeId, CheckInOutDto dto)
    {
        var today = DateOnly.FromDateTime(NowIst().DateTime);
        var log = await _db.AttendanceLogs
            .FirstOrDefaultAsync(a => a.EmployeeId == employeeId && a.LogDate == today);

        if (log == null || log.CheckInAt == null)
            throw new InvalidOperationException("Check-in required before check-out");

        if (log.CheckOutAt != null)
            throw new InvalidOperationException("Already checked out");

        var now = NowIst();
        // Early-out: policy ke work-end-time se pehle nikla to mark karo
        var coPolicy = await _db.AttendancePolicies
            .Where(p => p.FirmId == log.FirmId && p.IsActive)
            .FirstOrDefaultAsync();
        if (coPolicy != null)
            log.IsEarlyOut = TimeOnly.FromDateTime(now.DateTime) < coPolicy.WorkEndTime;
        log.CheckOutAt = now;
        log.CheckOutLat = dto.Latitude;
        log.CheckOutLng = dto.Longitude;
        log.CheckOutAccuracy = dto.Accuracy;
        log.CheckOutAddress = dto.Address;
        log.CheckOutSelfieUrl = dto.SelfieUrl;
        log.TotalMinutes = (int)(now - log.CheckInAt.Value).TotalMinutes;
        log.UpdatedAt = now;

        // Compute status based on total minutes
        if (log.TotalMinutes < 240) log.Status = "half_day";
        else if (log.TotalMinutes < 480) log.Status = "half_day";
        else log.Status = "present";

        if (!string.IsNullOrEmpty(dto.SelfieUrl))
        {
            _db.Selfies.Add(new Selfie
            {
                Id = Guid.NewGuid(),
                FirmId = log.FirmId,
                EmployeeId = employeeId,
                StorageUrl = dto.SelfieUrl,
                Context = "check_out",
                CapturedAt = now,
                Lat = dto.Latitude,
                Lng = dto.Longitude,
                Accuracy = dto.Accuracy
            });
        }

        await _db.SaveChangesAsync();
        return await ToDto(log);
    }

    public async Task<AttendanceLogDto?> GetTodayLog(Guid employeeId)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        var log = await _db.AttendanceLogs
            .FirstOrDefaultAsync(a => a.EmployeeId == employeeId && a.LogDate == today);
        return log == null ? null : await ToDto(log);
    }

    public async Task<List<AttendanceLogDto>> MonthlyRegister(int year, int month, Guid? branchId)
    {
        var firstDay = new DateOnly(year, month, 1);
        var lastDay = firstDay.AddMonths(1);

        var query = _db.AttendanceLogs
            .Where(a => a.LogDate >= firstDay && a.LogDate < lastDay);

        if (branchId.HasValue)
        {
            var empIds = await _db.EmployeeProfiles
                .Where(e => e.BranchId == branchId.Value)
                .Select(e => e.Id).ToListAsync();
            query = query.Where(a => empIds.Contains(a.EmployeeId));
        }

        var logs = await query.ToListAsync();
        return await ToDtos(logs);
    }

    public async Task<List<AttendanceLogDto>> EmployeeMonth(Guid employeeId, int year, int month)
    {
        var firstDay = new DateOnly(year, month, 1);
        var lastDay = firstDay.AddMonths(1);
        var logs = await _db.AttendanceLogs
            .Where(a => a.EmployeeId == employeeId && a.LogDate >= firstDay && a.LogDate < lastDay)
            .OrderBy(a => a.LogDate)
            .ToListAsync();
        return await ToDtos(logs);
    }

    private async Task<AttendanceLogDto> ToDto(AttendanceLog log)
    {
        var name = await (from e in _db.EmployeeProfiles
                          join c in _db.Contacts on e.ContactId equals c.Id
                          where e.Id == log.EmployeeId
                          select c.DisplayName).FirstOrDefaultAsync();
        return new AttendanceLogDto(
            log.Id, log.EmployeeId, name ?? "—",
            log.LogDate,
            log.CheckInAt, log.CheckOutAt,
            log.CheckInLat, log.CheckInLng,
            log.CheckOutLat, log.CheckOutLng,
            log.CheckInSelfieUrl, log.CheckOutSelfieUrl,
            log.CheckInAddress, log.CheckOutAddress,
            log.TotalMinutes, log.Status, log.IsLate, log.IsEarlyOut);
    }

    private async Task<List<AttendanceLogDto>> ToDtos(List<AttendanceLog> logs)
    {
        var empIds = logs.Select(l => l.EmployeeId).Distinct().ToList();
        var names = await (from e in _db.EmployeeProfiles
                           join c in _db.Contacts on e.ContactId equals c.Id
                           where empIds.Contains(e.Id)
                           select new { e.Id, c.DisplayName })
                          .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

        return logs.Select(log => new AttendanceLogDto(
            log.Id, log.EmployeeId, names.GetValueOrDefault(log.EmployeeId, "—"),
            log.LogDate, log.CheckInAt, log.CheckOutAt,
            log.CheckInLat, log.CheckInLng, log.CheckOutLat, log.CheckOutLng,
            log.CheckInSelfieUrl, log.CheckOutSelfieUrl,
            log.CheckInAddress, log.CheckOutAddress,
            log.TotalMinutes, log.Status, log.IsLate, log.IsEarlyOut)).ToList();
    }
}

// =============================================================================
// LocationService (GPS tracking)
// =============================================================================
public interface ILocationService
{
    Task RecordPing(Guid employeeId, LocationPingDto dto, Guid firmId);
    Task RecordPingsBatch(Guid employeeId, List<LocationPingDto> pings, Guid firmId);
    Task<List<LocationPointDto>> EmployeeTrail(Guid employeeId, DateOnly date);
    Task<Dictionary<Guid, List<LocationPointDto>>> AllStaffTrails(DateOnly date, Guid firmId);
    Task<List<LocationPointDto>> LiveLast15Min();
}

public class LocationService : ILocationService
{
    private readonly AppDbContext _db;
    public LocationService(AppDbContext db) => _db = db;

    public async Task RecordPing(Guid employeeId, LocationPingDto dto, Guid firmId)
    {
        _db.LocationTrails.Add(new LocationTrail
        {
            FirmId = firmId,
            EmployeeId = employeeId,
            CapturedAt = DateTimeOffset.Now,
            Latitude = dto.Latitude,
            Longitude = dto.Longitude,
            Accuracy = dto.Accuracy,
            Speed = dto.Speed,
            BatteryPct = dto.BatteryPct,
            IsBackground = dto.IsBackground
        });
        await _db.SaveChangesAsync();
    }

    public async Task RecordPingsBatch(Guid employeeId, List<LocationPingDto> pings, Guid firmId)
    {
        var now = DateTimeOffset.Now;
        foreach (var p in pings)
        {
            _db.LocationTrails.Add(new LocationTrail
            {
                FirmId = firmId,
                EmployeeId = employeeId,
                CapturedAt = now,
                Latitude = p.Latitude,
                Longitude = p.Longitude,
                Accuracy = p.Accuracy,
                Speed = p.Speed,
                BatteryPct = p.BatteryPct,
                IsBackground = p.IsBackground
            });
        }
        await _db.SaveChangesAsync();
    }

    public async Task<List<LocationPointDto>> EmployeeTrail(Guid employeeId, DateOnly date)
    {
        var from = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Local);
        var to = from.AddDays(1);
        var points = await _db.LocationTrails
            .Where(l => l.EmployeeId == employeeId
                     && l.CapturedAt >= from && l.CapturedAt < to)
            .OrderBy(l => l.CapturedAt)
            .ToListAsync();

        return points.Select(p => new LocationPointDto(
            p.CapturedAt, p.Latitude, p.Longitude, p.Accuracy)).ToList();
    }

    public async Task<Dictionary<Guid, List<LocationPointDto>>> AllStaffTrails(DateOnly date, Guid firmId)
    {
        var from = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Local);
        var to = from.AddDays(1);
        var points = await _db.LocationTrails
            .Where(l => l.FirmId == firmId
                     && l.CapturedAt >= from && l.CapturedAt < to)
            .OrderBy(l => l.CapturedAt)
            .ToListAsync();

        return points
            .GroupBy(p => p.EmployeeId)
            .ToDictionary(g => g.Key, g => g.Select(p =>
                new LocationPointDto(p.CapturedAt, p.Latitude, p.Longitude, p.Accuracy)).ToList());
    }

    public async Task<List<LocationPointDto>> LiveLast15Min()
    {
        var since = DateTimeOffset.Now.AddMinutes(-15);
        var points = await _db.LocationTrails
            .Where(l => l.CapturedAt >= since)
            .OrderByDescending(l => l.CapturedAt)
            .Take(500)
            .ToListAsync();

        return points.Select(p => new LocationPointDto(
            p.CapturedAt, p.Latitude, p.Longitude, p.Accuracy)).ToList();
    }
}

// =============================================================================
// LeaveService
// =============================================================================
public interface ILeaveService
{
    Task<List<LeaveBalanceDto>> MyBalance(Guid employeeId);
    Task<List<LeaveRequestDto>> MyLeaves(Guid employeeId, int limit);
    Task<List<LeaveRequestDto>> PendingApprovals(Guid firmId);
    Task<LeaveRequestDto> Apply(Guid employeeId, ApplyLeaveDto dto, Guid firmId);
    Task<LeaveRequestDto> Approve(Guid id, Guid approverId, string? remarks);
    Task<LeaveRequestDto> Reject(Guid id, Guid approverId, string? remarks);
}

public class LeaveService : ILeaveService
{
    private readonly AppDbContext _db;
    public LeaveService(AppDbContext db) => _db = db;

    public async Task<List<LeaveBalanceDto>> MyBalance(Guid employeeId)
    {
        var year = DateTime.Now.Year;
        var balances = await _db.LeaveBalances
            .Where(lb => lb.EmployeeId == employeeId && lb.Year == year)
            .ToListAsync();
        return balances.Select(b => new LeaveBalanceDto(b.LeaveType, b.TotalAllocated, b.Used, b.Available)).ToList();
    }

    public async Task<List<LeaveRequestDto>> MyLeaves(Guid employeeId, int limit)
    {
        var leaves = await _db.LeaveRequests
            .Where(l => l.EmployeeId == employeeId)
            .OrderByDescending(l => l.CreatedAt)
            .Take(limit)
            .ToListAsync();
        return await ToDtos(leaves);
    }

    public async Task<List<LeaveRequestDto>> PendingApprovals(Guid firmId)
    {
        var leaves = await _db.LeaveRequests
            .Where(l => l.FirmId == firmId && l.Status == "pending")
            .OrderBy(l => l.FromDate)
            .ToListAsync();
        return await ToDtos(leaves);
    }

    public async Task<LeaveRequestDto> Apply(Guid employeeId, ApplyLeaveDto dto, Guid firmId)
    {
        if (dto.FromDate > dto.ToDate) throw new ArgumentException("From date must be before To date");

        var days = (decimal)(dto.ToDate.DayNumber - dto.FromDate.DayNumber + 1);
        if (dto.HalfDayStart) days -= 0.5m;
        if (dto.HalfDayEnd) days -= 0.5m;

        var req = new LeaveRequest
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            EmployeeId = employeeId,
            LeaveType = dto.LeaveType,
            FromDate = dto.FromDate,
            ToDate = dto.ToDate,
            DaysCount = days,
            HalfDayStart = dto.HalfDayStart,
            HalfDayEnd = dto.HalfDayEnd,
            Reason = dto.Reason,
            Status = "pending",
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.LeaveRequests.Add(req);
        await _db.SaveChangesAsync();
        return (await ToDtos(new() { req })).First();
    }

    public async Task<LeaveRequestDto> Approve(Guid id, Guid approverId, string? remarks)
    {
        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            var req = await _db.LeaveRequests.SingleAsync(l => l.Id == id);
            if (req.Status != "pending") throw new InvalidOperationException("Already processed");

            req.Status = "approved";
            req.ApprovedBy = approverId;
            req.ApprovedAt = DateTimeOffset.UtcNow;
            req.Remarks = remarks;

            // Deduct from balance
            var year = req.FromDate.Year;
            var balance = await _db.LeaveBalances
                .FirstOrDefaultAsync(b => b.EmployeeId == req.EmployeeId && b.Year == year && b.LeaveType == req.LeaveType);
            if (balance != null)
            {
                balance.Used += req.DaysCount;
            }

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            return (await ToDtos(new() { req })).First();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public async Task<LeaveRequestDto> Reject(Guid id, Guid approverId, string? remarks)
    {
        var req = await _db.LeaveRequests.SingleAsync(l => l.Id == id);
        if (req.Status != "pending") throw new InvalidOperationException("Already processed");
        req.Status = "rejected";
        req.ApprovedBy = approverId;
        req.ApprovedAt = DateTimeOffset.UtcNow;
        req.Remarks = remarks;
        await _db.SaveChangesAsync();
        return (await ToDtos(new() { req })).First();
    }

    private async Task<List<LeaveRequestDto>> ToDtos(List<LeaveRequest> reqs)
    {
        var empIds = reqs.Select(r => r.EmployeeId).Distinct().ToList();
        var names = await (from e in _db.EmployeeProfiles
                           join c in _db.Contacts on e.ContactId equals c.Id
                           where empIds.Contains(e.Id)
                           select new { e.Id, c.DisplayName })
                          .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

        var approverIds = reqs.Where(r => r.ApprovedBy.HasValue).Select(r => r.ApprovedBy!.Value).Distinct().ToList();
        var approverNames = await _db.Users
            .Where(u => approverIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        return reqs.Select(r => new LeaveRequestDto(
            r.Id, r.EmployeeId,
            names.GetValueOrDefault(r.EmployeeId, "—"),
            r.LeaveType, r.FromDate, r.ToDate, r.DaysCount,
            r.Reason, r.Status, r.CreatedAt,
            r.ApprovedBy.HasValue ? approverNames.GetValueOrDefault(r.ApprovedBy.Value) : null,
            r.ApprovedAt, r.Remarks)).ToList();
    }
}
