using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Suppliers.Entities;

namespace Namokara.Api.Modules.Suppliers.Services;

// =============================================================================
// DTOs
// =============================================================================
public record SampleDto(string Name, decimal Qty, string Unit);

public record AppointmentStaffDto(Guid EmployeeId, string Name, bool IsLead);

public record AppointmentListItemDto(
    Guid Id, string VisitDirection, string? Title,
    Guid? SupplierId, string? SupplierName, Guid? BuyerId, string? BuyerName,
    Guid? BranchId, string? BranchName,
    DateOnly AppointmentDate, TimeOnly? AppointmentTime, int DurationMinutes,
    string? City, string Status, List<string> StaffNames);

public record AppointmentDetailDto(
    Guid Id, string VisitDirection, string? Title,
    Guid? SupplierId, string? SupplierName, Guid? BuyerId, string? BuyerName,
    Guid? BranchId, string? BranchName,
    DateOnly AppointmentDate, TimeOnly? AppointmentTime, int DurationMinutes,
    string? City, string? Address, string? OnlineLink,
    List<SampleDto> Samples, string? Agenda, string Status, string? Outcome,
    List<AppointmentStaffDto> Staff);

public record CreateAppointmentDto(
    string VisitDirection, string? Title,
    Guid? SupplierId, Guid? BuyerId, Guid? BranchId,
    DateOnly AppointmentDate, TimeOnly? AppointmentTime, int? DurationMinutes,
    string? City, string? Address, string? OnlineLink,
    List<SampleDto>? Samples, string? Agenda, string? Status,
    List<Guid>? StaffIds, Guid? LeadStaffId);

// Lookup options for the form (supplier / buyer / branch-filtered staff)
public record OptionDto(Guid Id, string Name, string? Sub);

// =============================================================================
// Service
// =============================================================================
public interface IAppointmentService
{
    Task<List<AppointmentListItemDto>> List(string? status, DateOnly? from, DateOnly? to);
    Task<AppointmentDetailDto?> Get(Guid id);
    Task<AppointmentDetailDto> Create(CreateAppointmentDto dto, Guid firmId, Guid userId);
    Task<AppointmentDetailDto> Update(Guid id, CreateAppointmentDto dto, Guid firmId);
    Task UpdateStatus(Guid id, string status);
    Task Delete(Guid id);

    // Form lookups
    Task<List<OptionDto>> SupplierOptions(Guid firmId);
    Task<List<OptionDto>> BuyerOptions(Guid firmId);
    Task<List<OptionDto>> StaffOptions(Guid firmId, Guid? branchId);  // branch-filtered!
}

public class AppointmentService : IAppointmentService
{
    private readonly AppDbContext _db;
    public AppointmentService(AppDbContext db) => _db = db;

    public async Task<List<AppointmentListItemDto>> List(string? status, DateOnly? from, DateOnly? to)
    {
        var q = _db.Appointments.Where(a => a.DeletedAt == null);
        if (!string.IsNullOrEmpty(status)) q = q.Where(a => a.Status == status);
        if (from.HasValue) q = q.Where(a => a.AppointmentDate >= from);
        if (to.HasValue) q = q.Where(a => a.AppointmentDate <= to);

        var appts = await q.OrderByDescending(a => a.AppointmentDate)
            .ThenByDescending(a => a.AppointmentTime).Take(300).ToListAsync();

        var supNames = await SupplierNameMap();
        var buyNames = await BuyerNameMap();
        var branchNames = await _db.Branches.ToDictionaryAsync(b => b.Id, b => b.Name);

        var apptIds = appts.Select(a => a.Id).ToList();
        var staffByAppt = await StaffNamesByAppointment(apptIds);

        return appts.Select(a => new AppointmentListItemDto(
            a.Id, a.VisitDirection, a.Title,
            a.SupplierId, a.SupplierId.HasValue ? supNames.GetValueOrDefault(a.SupplierId.Value) : null,
            a.BuyerId, a.BuyerId.HasValue ? buyNames.GetValueOrDefault(a.BuyerId.Value) : null,
            a.BranchId, a.BranchId.HasValue ? branchNames.GetValueOrDefault(a.BranchId.Value) : null,
            a.AppointmentDate, a.AppointmentTime, a.DurationMinutes,
            a.City, a.Status,
            staffByAppt.GetValueOrDefault(a.Id) ?? new())).ToList();
    }

    public async Task<AppointmentDetailDto?> Get(Guid id)
    {
        var a = await _db.Appointments.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null);
        if (a is null) return null;

        var supNames = await SupplierNameMap();
        var buyNames = await BuyerNameMap();
        var branchName = a.BranchId.HasValue
            ? await _db.Branches.Where(b => b.Id == a.BranchId).Select(b => b.Name).FirstOrDefaultAsync()
            : null;

        List<SampleDto> samples;
        try { samples = JsonSerializer.Deserialize<List<SampleDto>>(a.Samples) ?? new(); }
        catch { samples = new(); }

        var staff = await (from s in _db.AppointmentStaff
                           where s.AppointmentId == id
                           join e in _db.EmployeeProfiles on s.EmployeeId equals e.Id
                           join c in _db.Contacts on e.ContactId equals c.Id
                           select new AppointmentStaffDto(s.EmployeeId, c.DisplayName, s.IsLead)).ToListAsync();

        return new AppointmentDetailDto(
            a.Id, a.VisitDirection, a.Title,
            a.SupplierId, a.SupplierId.HasValue ? supNames.GetValueOrDefault(a.SupplierId.Value) : null,
            a.BuyerId, a.BuyerId.HasValue ? buyNames.GetValueOrDefault(a.BuyerId.Value) : null,
            a.BranchId, branchName,
            a.AppointmentDate, a.AppointmentTime, a.DurationMinutes,
            a.City, a.Address, a.OnlineLink, samples, a.Agenda, a.Status, a.Outcome, staff);
    }

    public async Task<AppointmentDetailDto> Create(CreateAppointmentDto dto, Guid firmId, Guid userId)
    {
        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            var appt = new Appointment
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                BranchId = dto.BranchId,
                VisitDirection = string.IsNullOrWhiteSpace(dto.VisitDirection) ? "s2b" : dto.VisitDirection,
                Title = dto.Title,
                SupplierId = dto.SupplierId,
                BuyerId = dto.BuyerId,
                AppointmentDate = dto.AppointmentDate,
                AppointmentTime = dto.AppointmentTime,
                DurationMinutes = dto.DurationMinutes ?? 60,
                City = dto.City,
                Address = dto.Address,
                OnlineLink = dto.OnlineLink,
                Samples = JsonSerializer.Serialize(dto.Samples ?? new()),
                Agenda = dto.Agenda,
                Status = string.IsNullOrWhiteSpace(dto.Status) ? "draft" : dto.Status,
                CreatedBy = userId,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.Appointments.Add(appt);
            await _db.SaveChangesAsync();

            await SaveStaff(appt.Id, dto.StaffIds, dto.LeadStaffId);
            await _db.SaveChangesAsync();

            await tx.CommitAsync();
            return (await Get(appt.Id))!;
        }
        catch { try { await tx.RollbackAsync(); } catch { } throw; }
    }

    public async Task<AppointmentDetailDto> Update(Guid id, CreateAppointmentDto dto, Guid firmId)
    {
        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            var a = await _db.Appointments.SingleAsync(x => x.Id == id);
            a.BranchId = dto.BranchId;
            a.VisitDirection = string.IsNullOrWhiteSpace(dto.VisitDirection) ? "s2b" : dto.VisitDirection;
            a.Title = dto.Title;
            a.SupplierId = dto.SupplierId;
            a.BuyerId = dto.BuyerId;
            a.AppointmentDate = dto.AppointmentDate;
            a.AppointmentTime = dto.AppointmentTime;
            a.DurationMinutes = dto.DurationMinutes ?? 60;
            a.City = dto.City;
            a.Address = dto.Address;
            a.OnlineLink = dto.OnlineLink;
            a.Samples = JsonSerializer.Serialize(dto.Samples ?? new());
            a.Agenda = dto.Agenda;
            if (!string.IsNullOrWhiteSpace(dto.Status)) a.Status = dto.Status;
            a.UpdatedAt = DateTimeOffset.UtcNow;

            // replace staff
            var old = _db.AppointmentStaff.Where(s => s.AppointmentId == id);
            _db.AppointmentStaff.RemoveRange(old);
            await _db.SaveChangesAsync();
            await SaveStaff(id, dto.StaffIds, dto.LeadStaffId);
            await _db.SaveChangesAsync();

            await tx.CommitAsync();
            return (await Get(id))!;
        }
        catch { try { await tx.RollbackAsync(); } catch { } throw; }
    }

    public async Task UpdateStatus(Guid id, string status)
    {
        var a = await _db.Appointments.SingleAsync(x => x.Id == id);
        a.Status = status;
        a.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task Delete(Guid id)
    {
        var a = await _db.Appointments.SingleAsync(x => x.Id == id);
        a.DeletedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    // ---- form lookups ----
    public async Task<List<OptionDto>> SupplierOptions(Guid firmId)
        => await (from s in _db.SupplierProfiles
                  where s.FirmId == firmId && s.IsActive
                  join c in _db.Contacts on s.ContactId equals c.Id
                  orderby c.DisplayName
                  select new OptionDto(s.Id, c.DisplayName, c.PhonePrimary)).ToListAsync();

    public async Task<List<OptionDto>> BuyerOptions(Guid firmId)
        => await (from b in _db.BuyerProfiles
                  where b.FirmId == firmId && b.IsActive
                  join c in _db.Contacts on b.ContactId equals c.Id
                  orderby c.DisplayName
                  select new OptionDto(b.Id, c.DisplayName, c.PhonePrimary)).ToListAsync();

    // Staff filtered by BRANCH — Surat meeting -> Surat staff. branchId null = all.
    public async Task<List<OptionDto>> StaffOptions(Guid firmId, Guid? branchId)
    {
        var q = from e in _db.EmployeeProfiles
                where e.FirmId == firmId && e.IsActive
                join c in _db.Contacts on e.ContactId equals c.Id
                select new { e, c };
        if (branchId.HasValue)
            q = q.Where(x => x.e.BranchId == branchId);

        return await q.OrderBy(x => x.c.DisplayName)
            .Select(x => new OptionDto(x.e.Id, x.c.DisplayName, x.e.Designation)).ToListAsync();
    }

    // ---- helpers ----
    private async Task SaveStaff(Guid apptId, List<Guid>? staffIds, Guid? leadId)
    {
        if (staffIds == null) return;
        foreach (var sid in staffIds.Distinct())
        {
            _db.AppointmentStaff.Add(new AppointmentStaff
            {
                Id = Guid.NewGuid(),
                AppointmentId = apptId,
                EmployeeId = sid,
                IsLead = leadId.HasValue && leadId.Value == sid
            });
        }
    }

    private async Task<Dictionary<Guid, string>> SupplierNameMap()
        => await (from s in _db.SupplierProfiles
                  join c in _db.Contacts on s.ContactId equals c.Id
                  select new { s.Id, c.DisplayName }).ToDictionaryAsync(x => x.Id, x => x.DisplayName);

    private async Task<Dictionary<Guid, string>> BuyerNameMap()
        => await (from b in _db.BuyerProfiles
                  join c in _db.Contacts on b.ContactId equals c.Id
                  select new { b.Id, c.DisplayName }).ToDictionaryAsync(x => x.Id, x => x.DisplayName);

    private async Task<Dictionary<Guid, List<string>>> StaffNamesByAppointment(List<Guid> apptIds)
    {
        var rows = await (from s in _db.AppointmentStaff
                          where apptIds.Contains(s.AppointmentId)
                          join e in _db.EmployeeProfiles on s.EmployeeId equals e.Id
                          join c in _db.Contacts on e.ContactId equals c.Id
                          select new { s.AppointmentId, c.DisplayName }).ToListAsync();
        return rows.GroupBy(r => r.AppointmentId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.DisplayName).ToList());
    }
}
