using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Hubs;
using Namokara.Api.Modules.Suppliers.Entities;
using Npgsql;

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
    private readonly IHubContext<PartyChatHub> _hub;
    public AppointmentService(AppDbContext db, IHubContext<PartyChatHub> hub)
    { _db = db; _hub = hub; }

    // =========================================================================
    // PHASE 2 (Party Chat): appointment banne/badalne/cancel par party ko
    // PARTY CHAT me apne aap message — WhatsApp bot ki zarurat khatam.
    // Supplier/Buyer profile ka contact_id seedha trading party se judta hai.
    // Fail-soft: chat na ja paye to appointment kabhi nahi rukta.
    // =========================================================================
    private async Task TrySendApptChat(Guid firmId, Appointment a, string kind)
    {
        try
        {
            var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
            // Middleware ne connection pehle se khola hai (RLS context ke saath) — OpenAsync NAHI

            // Kis party ko: supplier pehle, warna buyer — contact_id se trading party
            Guid? partyId = null; string? partyName = null; string phone = "";
            await using (var q = conn.CreateCommand())
            {
                q.CommandText = a.SupplierId != null
                    ? @"SELECT tp.id, c.display_name, COALESCE(c.phone_primary,'')
                        FROM suppliers.supplier_profiles sp
                        JOIN core.contacts c ON c.id = sp.contact_id
                        LEFT JOIN trading.party_profiles tp ON tp.contact_id = sp.contact_id AND tp.firm_id = sp.firm_id
                        WHERE sp.id = @id"
                    : @"SELECT tp.id, c.display_name, COALESCE(c.phone_primary,'')
                        FROM suppliers.buyer_profiles bp
                        JOIN core.contacts c ON c.id = bp.contact_id
                        LEFT JOIN trading.party_profiles tp ON tp.contact_id = bp.contact_id AND tp.firm_id = bp.firm_id
                        WHERE bp.id = @id";
                var target = a.SupplierId ?? a.BuyerId;
                if (target == null) return;
                q.Parameters.Add(new NpgsqlParameter("id", target.Value));
                await using var r = await q.ExecuteReaderAsync();
                if (await r.ReadAsync())
                {
                    partyId = r.IsDBNull(0) ? null : r.GetGuid(0);
                    partyName = r.GetString(1);
                    phone = new string(r.GetString(2).Where(char.IsDigit).ToArray());
                }
            }
            if (partyId == null || phone.Length < 10) return;   // trading party/mobile nahi → chup-chaap skip

            string? firmName = null;
            await using (var f = conn.CreateCommand())
            {
                f.CommandText = "SELECT name FROM platform.firms WHERE id = @f";
                f.Parameters.Add(new NpgsqlParameter("f", firmId));
                firmName = (string?)await f.ExecuteScalarAsync();
            }

            var when = a.AppointmentDate.ToString("dd/MM/yyyy")
                     + (a.AppointmentTime != null ? $" {a.AppointmentTime:hh\\:mm}" : "");
            var title = string.IsNullOrWhiteSpace(a.Title) ? "" : $" · {a.Title}";
            var body = kind switch
            {
                "cancel" => $"❌ Appointment CANCEL: {when}{title} — {firmName}. Nayi date ke liye yahin bata dein.",
                "update" => $"📅 Appointment BADLI: nayi date {when}{title} — {firmName}. Theek ho to 👍 bhej dein.",
                _        => $"📅 Appointment pakki: {when}{title} — {firmName}. Kuch badalna ho to yahin bata dein."
            };

            Guid threadId;
            await using (var t = conn.CreateCommand())
            {
                t.CommandText = @"
                    INSERT INTO platform.party_chat_threads (firm_id, party_id, party_name, phone)
                    VALUES (@f, @p, @n, @ph)
                    ON CONFLICT (firm_id, party_id) DO UPDATE SET party_name = @n, phone = @ph
                    RETURNING id";
                t.Parameters.Add(new NpgsqlParameter("f", firmId));
                t.Parameters.Add(new NpgsqlParameter("p", partyId.Value));
                t.Parameters.Add(new NpgsqlParameter("n", partyName ?? "—"));
                t.Parameters.Add(new NpgsqlParameter("ph", phone));
                threadId = (Guid)(await t.ExecuteScalarAsync())!;
            }
            await using (var m = conn.CreateCommand())
            {
                m.CommandText = @"INSERT INTO platform.party_chat_messages (thread_id, sender, sender_name, body)
                                  VALUES (@t, 'firm', @n, @b)";
                m.Parameters.Add(new NpgsqlParameter("t", threadId));
                m.Parameters.Add(new NpgsqlParameter("n", firmName ?? "Firm"));
                m.Parameters.Add(new NpgsqlParameter("b", body));
                await m.ExecuteNonQueryAsync();
            }
            await using (var touch = conn.CreateCommand())
            {
                touch.CommandText = "UPDATE platform.party_chat_threads SET last_msg_at = now() WHERE id = @t";
                touch.Parameters.Add(new NpgsqlParameter("t", threadId));
                await touch.ExecuteNonQueryAsync();
            }
            await PartyChatEvents.Notify(_hub, threadId, firmId);
        }
        catch { /* chat fail-soft — appointment kabhi na ruke */ }
    }

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

            // Party ko Party Chat me khabar (draft ko chhod kar) — fail-soft
            if (appt.Status != "draft" && appt.Status != "cancelled")
                await TrySendApptChat(firmId, appt, "confirm");

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

            // Date/time/details badle — party ko Party Chat me khabar (fail-soft)
            if (a.Status != "draft" && a.Status != "cancelled")
                await TrySendApptChat(firmId, a, "update");

            return (await Get(id))!;
        }
        catch { try { await tx.RollbackAsync(); } catch { } throw; }
    }

    public async Task UpdateStatus(Guid id, string status)
    {
        var a = await _db.Appointments.SingleAsync(x => x.Id == id);
        var was = a.Status;
        a.Status = status;
        a.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        // Cancel hui ya draft se pakki hui — party ko Party Chat me khabar
        if (status == "cancelled" && was != "cancelled")
            await TrySendApptChat(a.FirmId, a, "cancel");
        else if (was == "draft" && status != "draft" && status != "cancelled")
            await TrySendApptChat(a.FirmId, a, "confirm");
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
