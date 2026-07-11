using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Storage;
using Namokara.Api.Modules.Hr.Services;

namespace Namokara.Api.Modules.Hr.Controllers;

[Authorize]
[ModuleAccess("hr")]   // 🔒 Backend enforcement: all HR endpoints require firm to have HR module enabled
public abstract class HrControllerBase : ControllerBase
{
    protected Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    protected Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    protected Guid CurrentBranchId
    {
        get
        {
            var branchId = Request.Headers["X-Branch-Id"].FirstOrDefault()
                        ?? User.FindFirst("default_branch_id")?.Value;
            return Guid.Parse(branchId ?? throw new InvalidOperationException("Branch not selected"));
        }
    }
}

// =============================================================================
// Employees
// =============================================================================
[ApiController]
[Route("api/hr/employees")]
public class EmployeesController : HrControllerBase
{
    private readonly IEmployeeService _svc;
    public EmployeesController(IEmployeeService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("hr.staff.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search)
        => Ok(await _svc.List(search));

    [HttpGet("{id}")]
    [HasPermission("hr.staff.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var e = await _svc.Get(id);
        return e is null ? NotFound() : Ok(e);
    }

    [HttpPost]
    [HasPermission("hr.staff.create.firm")]
    public async Task<IActionResult> Create([FromBody] CreateEmployeeDto dto)
        => Ok(await _svc.Create(dto, CurrentFirmId, CurrentUserId));

    [HttpPut("{id}")]
    [HasPermission("hr.staff.create.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateEmployeeDto dto)
        => Ok(await _svc.Update(id, dto));

    [HttpDelete("{id}")]
    [HasPermission("hr.staff.create.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }
}

// =============================================================================
// Attendance
// =============================================================================
[ApiController]
[Route("api/hr/attendance")]
public class AttendanceController : HrControllerBase
{
    private readonly IAttendanceService _svc;
    private readonly IStorageService _storage;
    private readonly Namokara.Api.Infrastructure.Persistence.AppDbContext _db;

    public AttendanceController(IAttendanceService svc, IStorageService storage, Namokara.Api.Infrastructure.Persistence.AppDbContext db)
    {
        _svc = svc;
        _storage = storage;
        _db = db;
    }

    private async Task<Guid?> ResolveEmployeeIdFromUser()
    {
        var emp = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                _db.EmployeeProfiles.Where(e => e.UserId == CurrentUserId && e.IsActive));
        return emp?.Id;
    }

    [HttpGet("today")]
    [HasPermission("hr.attendance.viewown.self")]
    public async Task<IActionResult> Today()
    {
        var empId = await ResolveEmployeeIdFromUser();
        if (empId == null) return NotFound(new { error = "Not registered as employee" });
        var log = await _svc.GetTodayLog(empId.Value);
        return Ok(log);
    }

    [HttpPost("check-in")]
    [HasPermission("hr.attendance.viewown.self")]
    public async Task<IActionResult> CheckIn(
        [FromForm] decimal latitude,
        [FromForm] decimal longitude,
        [FromForm] decimal? accuracy,
        [FromForm] string? address,
        IFormFile? selfie)
    {
        var empId = await ResolveEmployeeIdFromUser();
        if (empId == null) return NotFound(new { error = "Not registered as employee" });

        string? selfieUrl = null;
        if (selfie != null && selfie.Length > 0)
        {
            selfieUrl = await _storage.UploadSelfie(selfie, CurrentFirmId, empId.Value, "check_in");
        }

        try
        {
            var log = await _svc.CheckIn(empId.Value, new CheckInOutDto(latitude, longitude, accuracy, address, selfieUrl), CurrentFirmId);
            return Ok(log);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPost("check-out")]
    [HasPermission("hr.attendance.viewown.self")]
    public async Task<IActionResult> CheckOut(
        [FromForm] decimal latitude,
        [FromForm] decimal longitude,
        [FromForm] decimal? accuracy,
        [FromForm] string? address,
        IFormFile? selfie)
    {
        var empId = await ResolveEmployeeIdFromUser();
        if (empId == null) return NotFound(new { error = "Not registered as employee" });

        string? selfieUrl = null;
        if (selfie != null && selfie.Length > 0)
        {
            selfieUrl = await _storage.UploadSelfie(selfie, CurrentFirmId, empId.Value, "check_out");
        }

        try
        {
            var log = await _svc.CheckOut(empId.Value, new CheckInOutDto(latitude, longitude, accuracy, address, selfieUrl));
            return Ok(log);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpGet("register/{year}/{month}")]
    [HasPermission("hr.attendance.view.firm")]
    public async Task<IActionResult> Register(int year, int month, [FromQuery] Guid? branchId)
        => Ok(await _svc.MonthlyRegister(year, month, branchId));

    [HttpGet("employee/{employeeId}/{year}/{month}")]
    [HasPermission("hr.attendance.view.firm")]
    public async Task<IActionResult> EmployeeMonth(Guid employeeId, int year, int month)
        => Ok(await _svc.EmployeeMonth(employeeId, year, month));
}

// =============================================================================
// Location tracking
// =============================================================================
[ApiController]
[Route("api/hr/location")]
public class LocationController : HrControllerBase
{
    private readonly ILocationService _svc;
    private readonly Namokara.Api.Infrastructure.Persistence.AppDbContext _db;
    public LocationController(ILocationService svc, Namokara.Api.Infrastructure.Persistence.AppDbContext db)
    {
        _svc = svc; _db = db;
    }

    [HttpPost("ping")]
    [HasPermission("hr.attendance.viewown.self")]
    public async Task<IActionResult> Ping([FromBody] LocationPingDto dto)
    {
        var emp = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(_db.EmployeeProfiles.Where(e => e.UserId == CurrentUserId && e.IsActive));
        if (emp == null) return NotFound(new { error = "Not registered as employee" });

        await _svc.RecordPing(emp.Id, dto, CurrentFirmId);
        return NoContent();
    }

    [HttpPost("batch")]
    [HasPermission("hr.attendance.viewown.self")]
    public async Task<IActionResult> Batch([FromBody] List<LocationPingDto> pings)
    {
        var emp = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(_db.EmployeeProfiles.Where(e => e.UserId == CurrentUserId && e.IsActive));
        if (emp == null) return NotFound();
        await _svc.RecordPingsBatch(emp.Id, pings, CurrentFirmId);
        return NoContent();
    }

    [HttpGet("trail/{employeeId}")]
    [HasPermission("hr.attendance.view.firm")]
    public async Task<IActionResult> Trail(Guid employeeId, [FromQuery] DateOnly? date)
        => Ok(await _svc.EmployeeTrail(employeeId, date ?? DateOnly.FromDateTime(DateTime.Now)));

    [HttpGet("all-trails")]
    [HasPermission("hr.attendance.view.firm")]
    public async Task<IActionResult> AllTrails([FromQuery] DateOnly? date)
    {
        var trails = await _svc.AllStaffTrails(date ?? DateOnly.FromDateTime(DateTime.Now), CurrentFirmId);
        return Ok(trails.Select(kv => new { employeeId = kv.Key, points = kv.Value }));
    }

    [HttpGet("live")]
    [HasPermission("hr.attendance.view.firm")]
    public async Task<IActionResult> Live() => Ok(await _svc.LiveLast15Min());

    // Ola/Rapido style: har staff ka LATEST location (last 30 min) - live moving marker ke liye poll hota hai.
    [HttpGet("live-latest")]
    [HasPermission("hr.attendance.view.firm")]
    public async Task<IActionResult> LiveLatest()
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"SELECT DISTINCT ON (lt.employee_id)
                   lt.employee_id, lt.latitude, lt.longitude, lt.captured_at, lt.speed,
                   COALESCE(c.display_name, ep.employee_code, 'Staff') AS emp_name
            FROM hr.location_trails lt
            JOIN hr.employee_profiles ep ON ep.id = lt.employee_id
            LEFT JOIN core.contacts c ON c.id = ep.contact_id
            WHERE lt.firm_id = @firm
              AND lt.captured_at >= now() - interval '30 minutes'
            ORDER BY lt.employee_id, lt.captured_at DESC";
        cmd.Parameters.Add(new NpgsqlParameter("firm", CurrentFirmId));
        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var cap = (DateTimeOffset)r["captured_at"];
            list.Add(new
            {
                employeeId = (Guid)r["employee_id"],
                name = r["emp_name"] as string,
                latitude = (decimal)r["latitude"],
                longitude = (decimal)r["longitude"],
                capturedAt = cap,
                speed = r["speed"] is DBNull ? (decimal?)null : (decimal?)r["speed"],
                minutesAgo = (int)System.Math.Round((DateTimeOffset.Now - cap).TotalMinutes)
            });
        }
        return Ok(list);
    }
}

// =============================================================================
// Leaves
// =============================================================================
[ApiController]
[Route("api/hr/leaves")]
public class LeavesController : HrControllerBase
{
    private readonly ILeaveService _svc;
    private readonly Namokara.Api.Infrastructure.Persistence.AppDbContext _db;
    public LeavesController(ILeaveService svc, Namokara.Api.Infrastructure.Persistence.AppDbContext db)
    {
        _svc = svc; _db = db;
    }

    private async Task<Guid?> ResolveEmployeeId()
    {
        var emp = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(_db.EmployeeProfiles.Where(e => e.UserId == CurrentUserId && e.IsActive));
        return emp?.Id;
    }

    [HttpGet("my-balance")]
    [HasPermission("hr.leave.create.self")]
    public async Task<IActionResult> MyBalance()
    {
        var empId = await ResolveEmployeeId();
        if (empId == null) return NotFound();
        return Ok(await _svc.MyBalance(empId.Value));
    }

    [HttpGet("my-leaves")]
    [HasPermission("hr.leave.create.self")]
    public async Task<IActionResult> MyLeaves([FromQuery] int limit = 20)
    {
        var empId = await ResolveEmployeeId();
        if (empId == null) return NotFound();
        return Ok(await _svc.MyLeaves(empId.Value, limit));
    }

    [HttpGet("pending")]
    [HasPermission("hr.leave.approve.branch")]
    public async Task<IActionResult> Pending() => Ok(await _svc.PendingApprovals(CurrentFirmId));

    [HttpPost("apply")]
    [HasPermission("hr.leave.create.self")]
    public async Task<IActionResult> Apply([FromBody] ApplyLeaveDto dto)
    {
        var empId = await ResolveEmployeeId();
        if (empId == null) return NotFound();
        try
        {
            return Ok(await _svc.Apply(empId.Value, dto, CurrentFirmId));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPost("{id}/approve")]
    [HasPermission("hr.leave.approve.branch")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveDto dto)
    {
        try
        {
            return Ok(await _svc.Approve(id, CurrentUserId, dto.Remarks));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPost("{id}/reject")]
    [HasPermission("hr.leave.approve.branch")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] ApproveDto dto)
    {
        try
        {
            return Ok(await _svc.Reject(id, CurrentUserId, dto.Remarks));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }
}

public record ApproveDto(string? Remarks);

// =============================================================================
// Payroll
// =============================================================================
[ApiController]
[Route("api/hr/payroll")]
public class PayrollController : HrControllerBase
{
    private readonly IPayrollService _svc;
    public PayrollController(IPayrollService svc) => _svc = svc;

    [HttpPost("run")]
    [HasPermission("hr.salary.view.firm")]
    public async Task<IActionResult> Run([FromBody] PayrollRunDto dto)
    {
        var slips = await _svc.RunPayroll(dto.Year, dto.Month, dto.EmployeeIds, CurrentFirmId, CurrentBranchId, CurrentUserId);
        return Ok(slips);
    }

    [HttpGet("month/{year}/{month}")]
    [HasPermission("hr.salary.view.firm")]
    public async Task<IActionResult> Month(int year, int month)
        => Ok(await _svc.GetPayrollMonth(year, month));

    [HttpGet("{id}")]
    [HasPermission("hr.salary.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var p = await _svc.GetPayslip(id);
        return p is null ? NotFound() : Ok(p);
    }

    [HttpPost("{id}/mark-paid")]
    [HasPermission("hr.salary.view.firm")]
    public async Task<IActionResult> MarkPaid(Guid id)
    {
        await _svc.MarkPaid(id, CurrentFirmId, CurrentBranchId, CurrentUserId);
        return Ok();
    }
}

// =============================================================================
// HR Dashboard
// =============================================================================
[ApiController]
[Route("api/hr/dashboard")]
public class HrDashboardController : HrControllerBase
{
    private readonly IHrDashboardService _svc;
    public HrDashboardController(IHrDashboardService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("hr.staff.view.firm")]
    public async Task<IActionResult> Get() => Ok(await _svc.GetDashboard(CurrentFirmId));
}
