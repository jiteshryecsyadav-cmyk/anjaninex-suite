using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;

namespace Namokara.Api.Modules.Accounting.Services;

// =============================================================================
// DTOs
// =============================================================================
public record AccountHeadDto(Guid Id, string Code, string Name, string Nature, string Sign, int? SortOrder, bool IsSystem, int GroupCount);
public record AccountGroupDto(Guid Id, Guid HeadId, string HeadName, string? Code, string Name, bool IsSystem, int SubGroupCount, int LedgerCount);
public record SubGroupDto(Guid Id, Guid GroupId, string GroupName, string HeadName, string? Code, string Name, bool IsSystem, int LedgerCount);
public record LedgerDto(
    Guid Id, Guid SubGroupId, string SubGroupName, string GroupName, string HeadName,
    Guid? ContactId, string? ContactName,
    string? Code, string Name,
    decimal OpeningBalance, string OpeningType,
    decimal CurrentBalance, string CurrentBalanceType,
    bool IsActive);

public record CreateGroupDto(Guid HeadId, string Name, string? Code);
public record CreateSubGroupDto(Guid GroupId, string Name, string? Code);
public record CreateLedgerDto(Guid SubGroupId, string Name, string? Code, Guid? ContactId, decimal OpeningBalance, string OpeningType);

// =============================================================================
// Service interface
// =============================================================================
public interface IChartOfAccountsService
{
    // Heads
    Task<List<AccountHeadDto>> ListHeads();

    // Groups
    Task<List<AccountGroupDto>> ListGroups(Guid? headId = null);
    Task<AccountGroupDto> CreateGroup(CreateGroupDto dto, Guid firmId);
    Task DeleteGroup(Guid id);

    // Sub groups
    Task<List<SubGroupDto>> ListSubGroups(Guid? groupId = null);
    Task<SubGroupDto> CreateSubGroup(CreateSubGroupDto dto, Guid firmId);
    Task DeleteSubGroup(Guid id);

    // Ledgers
    Task<List<LedgerDto>> ListLedgers(Guid? subGroupId = null, string? search = null);
    Task<LedgerDto?> GetLedger(Guid id);
    Task<LedgerDto> CreateLedger(CreateLedgerDto dto, Guid firmId);
    Task<LedgerDto> UpdateLedger(Guid id, CreateLedgerDto dto);
    Task DeleteLedger(Guid id);
}

// =============================================================================
// Implementation
// =============================================================================
public class ChartOfAccountsService : IChartOfAccountsService
{
    private readonly AppDbContext _db;

    public ChartOfAccountsService(AppDbContext db) => _db = db;

    public async Task<List<AccountHeadDto>> ListHeads()
    {
        var heads = await _db.AccountHeads
            .OrderBy(h => h.SortOrder)
            .ToListAsync();

        var groupCounts = await _db.AccountGroups
            .GroupBy(g => g.HeadId)
            .Select(g => new { HeadId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.HeadId, x => x.Count);

        return heads.Select(h => new AccountHeadDto(
            h.Id, h.Code, h.Name, h.Nature, h.Sign, h.SortOrder, h.IsSystem,
            groupCounts.GetValueOrDefault(h.Id, 0))).ToList();
    }

    public async Task<List<AccountGroupDto>> ListGroups(Guid? headId = null)
    {
        var query = _db.AccountGroups.Include(g => g.Head).AsQueryable();
        if (headId.HasValue) query = query.Where(g => g.HeadId == headId);

        var groups = await query.OrderBy(g => g.Name).ToListAsync();

        var subGroupCounts = await _db.SubGroups
            .GroupBy(s => s.GroupId)
            .Select(s => new { GroupId = s.Key, Count = s.Count() })
            .ToDictionaryAsync(x => x.GroupId, x => x.Count);

        var ledgerCounts = await _db.Ledgers
            .Join(_db.SubGroups, l => l.SubGroupId, s => s.Id, (l, s) => new { l.SubGroupId, s.GroupId })
            .GroupBy(x => x.GroupId)
            .Select(x => new { GroupId = x.Key, Count = x.Count() })
            .ToDictionaryAsync(x => x.GroupId, x => x.Count);

        return groups.Select(g => new AccountGroupDto(
            g.Id, g.HeadId, g.Head?.Name ?? "", g.Code, g.Name, g.IsSystem,
            subGroupCounts.GetValueOrDefault(g.Id, 0),
            ledgerCounts.GetValueOrDefault(g.Id, 0))).ToList();
    }

    public async Task<AccountGroupDto> CreateGroup(CreateGroupDto dto, Guid firmId)
    {
        var group = new AccountGroup
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            HeadId = dto.HeadId,
            Name = dto.Name,
            Code = dto.Code,
            IsSystem = false,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.AccountGroups.Add(group);
        await _db.SaveChangesAsync();

        var head = await _db.AccountHeads.SingleAsync(h => h.Id == dto.HeadId);
        return new AccountGroupDto(group.Id, group.HeadId, head.Name, group.Code, group.Name, group.IsSystem, 0, 0);
    }

    public async Task DeleteGroup(Guid id)
    {
        var group = await _db.AccountGroups.SingleAsync(g => g.Id == id);
        if (group.IsSystem) throw new InvalidOperationException("System groups cannot be deleted");

        var hasSubGroups = await _db.SubGroups.AnyAsync(s => s.GroupId == id);
        if (hasSubGroups) throw new InvalidOperationException("Delete sub-groups first");

        _db.AccountGroups.Remove(group);
        await _db.SaveChangesAsync();
    }

    public async Task<List<SubGroupDto>> ListSubGroups(Guid? groupId = null)
    {
        var query = _db.SubGroups
            .Include(s => s.Group)!.ThenInclude(g => g!.Head)
            .AsQueryable();
        if (groupId.HasValue) query = query.Where(s => s.GroupId == groupId);

        var subs = await query.OrderBy(s => s.Name).ToListAsync();

        var ledgerCounts = await _db.Ledgers
            .GroupBy(l => l.SubGroupId)
            .Select(g => new { SubGroupId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.SubGroupId, x => x.Count);

        return subs.Select(s => new SubGroupDto(
            s.Id, s.GroupId,
            s.Group?.Name ?? "",
            s.Group?.Head?.Name ?? "",
            s.Code, s.Name, s.IsSystem,
            ledgerCounts.GetValueOrDefault(s.Id, 0))).ToList();
    }

    public async Task<SubGroupDto> CreateSubGroup(CreateSubGroupDto dto, Guid firmId)
    {
        var sg = new SubGroup
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            GroupId = dto.GroupId,
            Name = dto.Name,
            Code = dto.Code,
            IsSystem = false,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.SubGroups.Add(sg);
        await _db.SaveChangesAsync();

        var group = await _db.AccountGroups
            .Include(g => g.Head)
            .SingleAsync(g => g.Id == dto.GroupId);

        return new SubGroupDto(sg.Id, sg.GroupId, group.Name, group.Head?.Name ?? "",
            sg.Code, sg.Name, sg.IsSystem, 0);
    }

    public async Task DeleteSubGroup(Guid id)
    {
        var sg = await _db.SubGroups.SingleAsync(s => s.Id == id);
        if (sg.IsSystem) throw new InvalidOperationException("System sub-groups cannot be deleted");

        var hasLedgers = await _db.Ledgers.AnyAsync(l => l.SubGroupId == id);
        if (hasLedgers) throw new InvalidOperationException("Delete ledgers first");

        _db.SubGroups.Remove(sg);
        await _db.SaveChangesAsync();
    }

    public async Task<List<LedgerDto>> ListLedgers(Guid? subGroupId = null, string? search = null)
    {
        var query = _db.Ledgers
            .Include(l => l.SubGroup)!.ThenInclude(s => s!.Group)!.ThenInclude(g => g!.Head)
            .Where(l => l.IsActive)
            .AsQueryable();

        if (subGroupId.HasValue) query = query.Where(l => l.SubGroupId == subGroupId);
        if (!string.IsNullOrEmpty(search))
            query = query.Where(l => EF.Functions.ILike(l.Name, $"%{search}%"));

        var ledgers = await query.OrderBy(l => l.Name).Take(500).ToListAsync();

        // Compute current balance for each ledger
        var ledgerIds = ledgers.Select(l => l.Id).ToList();
        var balances = await _db.VoucherLines
            .Where(vl => ledgerIds.Contains(vl.LedgerId))
            .GroupBy(vl => vl.LedgerId)
            .Select(g => new
            {
                LedgerId = g.Key,
                Dr = g.Where(x => x.DebitCredit == "Dr").Sum(x => x.Amount),
                Cr = g.Where(x => x.DebitCredit == "Cr").Sum(x => x.Amount)
            })
            .ToDictionaryAsync(x => x.LedgerId);

        // Get contact names
        var contactIds = ledgers.Where(l => l.ContactId.HasValue).Select(l => l.ContactId!.Value).Distinct().ToList();
        var contactNames = await _db.Contacts
            .Where(c => contactIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.DisplayName);

        return ledgers.Select(l =>
        {
            decimal currentBal = l.OpeningType == "Dr" ? l.OpeningBalance : -l.OpeningBalance;
            if (balances.TryGetValue(l.Id, out var b)) currentBal += (b.Dr - b.Cr);
            return new LedgerDto(
                l.Id, l.SubGroupId,
                l.SubGroup?.Name ?? "",
                l.SubGroup?.Group?.Name ?? "",
                l.SubGroup?.Group?.Head?.Name ?? "",
                l.ContactId,
                l.ContactId.HasValue ? contactNames.GetValueOrDefault(l.ContactId.Value) : null,
                l.Code, l.Name,
                l.OpeningBalance, l.OpeningType,
                Math.Abs(currentBal), currentBal >= 0 ? "Dr" : "Cr",
                l.IsActive);
        }).ToList();
    }

    public async Task<LedgerDto?> GetLedger(Guid id)
    {
        var list = await ListLedgers();
        return list.FirstOrDefault(l => l.Id == id);
    }

    public async Task<LedgerDto> CreateLedger(CreateLedgerDto dto, Guid firmId)
    {
        var ledger = new Ledger
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            SubGroupId = dto.SubGroupId,
            Name = dto.Name,
            Code = dto.Code,
            ContactId = dto.ContactId,
            OpeningBalance = dto.OpeningBalance,
            OpeningType = dto.OpeningType,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Ledgers.Add(ledger);
        await _db.SaveChangesAsync();
        return (await GetLedger(ledger.Id))!;
    }

    public async Task<LedgerDto> UpdateLedger(Guid id, CreateLedgerDto dto)
    {
        var ledger = await _db.Ledgers.SingleAsync(l => l.Id == id);
        ledger.SubGroupId = dto.SubGroupId;
        ledger.Name = dto.Name;
        ledger.Code = dto.Code;
        ledger.ContactId = dto.ContactId;
        ledger.OpeningBalance = dto.OpeningBalance;
        ledger.OpeningType = dto.OpeningType;
        ledger.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return (await GetLedger(id))!;
    }

    public async Task DeleteLedger(Guid id)
    {
        var hasLines = await _db.VoucherLines.AnyAsync(vl => vl.LedgerId == id);
        if (hasLines)
        {
            // Soft delete (mark inactive) — preserve transaction history
            var ledger = await _db.Ledgers.SingleAsync(l => l.Id == id);
            ledger.IsActive = false;
            ledger.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            _db.Ledgers.Remove(await _db.Ledgers.SingleAsync(l => l.Id == id));
        }
        await _db.SaveChangesAsync();
    }
}
