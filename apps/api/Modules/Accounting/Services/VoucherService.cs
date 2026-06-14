using System.Data;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;

namespace Namokara.Api.Modules.Accounting.Services;

// =============================================================================
// DTOs
// =============================================================================
public record VoucherLineDto(Guid LedgerId, string LedgerName, string DebitCredit, decimal Amount, string? Narration);

public record VoucherListItemDto(
    Guid Id, string VoucherType, string VoucherNo, DateOnly VoucherDate,
    decimal TotalAmount, string? Narration, int LineCount, string CreatedBy);

public record VoucherDetailDto(
    Guid Id, string VoucherType, string VoucherNo, DateOnly VoucherDate,
    decimal TotalAmount, string? Narration,
    Guid BranchId, string BranchName,
    string? SourceModule, Guid? SourceRefId,
    List<VoucherLineDto> Lines);

public record CreateVoucherLineDto(Guid LedgerId, string DebitCredit, decimal Amount, string? Narration);
public record CreateVoucherDto(
    string VoucherType, DateOnly VoucherDate, string? Narration,
    List<CreateVoucherLineDto> Lines);

public class VoucherUnbalancedException : Exception
{
    public VoucherUnbalancedException(decimal dr, decimal cr)
        : base($"Voucher unbalanced: Dr ₹{dr:N2} ≠ Cr ₹{cr:N2}") { }
}

// =============================================================================
// Service
// =============================================================================
public interface IVoucherService
{
    Task<(List<VoucherListItemDto> items, int total)> List(string? type, DateOnly? from, DateOnly? to, int page, int size);
    Task<VoucherDetailDto?> Get(Guid id);
    Task<VoucherDetailDto> Create(CreateVoucherDto dto, Guid firmId, Guid branchId, Guid userId);
    Task<VoucherDetailDto> Update(Guid id, CreateVoucherDto dto, Guid userId);
    Task Delete(Guid id);
    Task<string> GenerateVoucherNo(string voucherType, Guid firmId, Guid branchId);
}

public class VoucherService : IVoucherService
{
    private readonly AppDbContext _db;
    private readonly ILogger<VoucherService> _log;

    public VoucherService(AppDbContext db, ILogger<VoucherService> log)
    {
        _db = db;
        _log = log;
    }

    public async Task<(List<VoucherListItemDto> items, int total)> List(
        string? type, DateOnly? from, DateOnly? to, int page, int size)
    {
        var query = _db.Vouchers.AsQueryable();

        if (!string.IsNullOrEmpty(type)) query = query.Where(v => v.VoucherType == type);
        if (from.HasValue) query = query.Where(v => v.VoucherDate >= from.Value);
        if (to.HasValue) query = query.Where(v => v.VoucherDate <= to.Value);

        var total = await query.CountAsync();

        var rawItems = await query
            .OrderByDescending(v => v.VoucherDate)
            .ThenByDescending(v => v.CreatedAt)
            .Skip((page - 1) * size)
            .Take(size)
            .Select(v => new
            {
                v.Id, v.VoucherType, v.VoucherNo, v.VoucherDate,
                v.TotalAmount, v.Narration,
                LineCount = v.Lines.Count,
                v.CreatedBy
            })
            .ToListAsync();

        // Resolve creator names
        var creatorIds = rawItems.Select(r => r.CreatedBy).Distinct().ToList();
        var creators = await _db.Users
            .Where(u => creatorIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        var items = rawItems.Select(r => new VoucherListItemDto(
            r.Id, r.VoucherType, r.VoucherNo, r.VoucherDate,
            r.TotalAmount, r.Narration, r.LineCount,
            creators.GetValueOrDefault(r.CreatedBy, "—"))).ToList();

        return (items, total);
    }

    public async Task<VoucherDetailDto?> Get(Guid id)
    {
        var v = await _db.Vouchers
            .Include(x => x.Lines).ThenInclude(l => l.Ledger)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (v is null) return null;

        var branch = await _db.Branches.SingleOrDefaultAsync(b => b.Id == v.BranchId);

        return new VoucherDetailDto(
            v.Id, v.VoucherType, v.VoucherNo, v.VoucherDate,
            v.TotalAmount, v.Narration,
            v.BranchId, branch?.Name ?? "",
            v.SourceModule, v.SourceRefId,
            v.Lines
                .OrderBy(l => l.SortOrder)
                .Select(l => new VoucherLineDto(
                    l.LedgerId, l.Ledger?.Name ?? "",
                    l.DebitCredit, l.Amount, l.Narration))
                .ToList());
    }

    public async Task<VoucherDetailDto> Create(
        CreateVoucherDto dto, Guid firmId, Guid branchId, Guid userId)
    {
        // Validate balance Dr == Cr
        var dr = dto.Lines.Where(l => l.DebitCredit == "Dr").Sum(l => l.Amount);
        var cr = dto.Lines.Where(l => l.DebitCredit == "Cr").Sum(l => l.Amount);
        if (Math.Abs(dr - cr) > 0.01m) throw new VoucherUnbalancedException(dr, cr);

        if (dto.Lines.Count < 2)
            throw new ArgumentException("Voucher must have at least 2 lines (one debit, one credit)");

        if (dto.Lines.Any(l => l.Amount <= 0))
            throw new ArgumentException("All line amounts must be positive");

        using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var voucherNo = await GenerateVoucherNo(dto.VoucherType, firmId, branchId);
            var voucher = new Voucher
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                BranchId = branchId,
                VoucherType = dto.VoucherType,
                VoucherNo = voucherNo,
                VoucherDate = dto.VoucherDate,
                Narration = dto.Narration,
                TotalAmount = dr,
                SourceModule = "accounting",
                IsPosted = true,
                CreatedBy = userId,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            int order = 0;
            foreach (var line in dto.Lines)
            {
                voucher.Lines.Add(new VoucherLine
                {
                    Id = Guid.NewGuid(),
                    VoucherId = voucher.Id,
                    LedgerId = line.LedgerId,
                    DebitCredit = line.DebitCredit,
                    Amount = line.Amount,
                    Narration = line.Narration,
                    SortOrder = order++
                });
            }

            _db.Vouchers.Add(voucher);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();

            _log.LogInformation("Voucher {No} ({Type}) created with ₹{Amount}",
                voucherNo, dto.VoucherType, dr);

            return (await Get(voucher.Id))!;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public async Task<VoucherDetailDto> Update(Guid id, CreateVoucherDto dto, Guid userId)
    {
        var dr = dto.Lines.Where(l => l.DebitCredit == "Dr").Sum(l => l.Amount);
        var cr = dto.Lines.Where(l => l.DebitCredit == "Cr").Sum(l => l.Amount);
        if (Math.Abs(dr - cr) > 0.01m) throw new VoucherUnbalancedException(dr, cr);

        using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var voucher = await _db.Vouchers
                .Include(v => v.Lines)
                .SingleAsync(v => v.Id == id);

            voucher.VoucherDate = dto.VoucherDate;
            voucher.Narration = dto.Narration;
            voucher.TotalAmount = dr;
            voucher.UpdatedAt = DateTimeOffset.UtcNow;

            // Replace lines
            _db.VoucherLines.RemoveRange(voucher.Lines);

            int order = 0;
            foreach (var line in dto.Lines)
            {
                voucher.Lines.Add(new VoucherLine
                {
                    Id = Guid.NewGuid(),
                    VoucherId = voucher.Id,
                    LedgerId = line.LedgerId,
                    DebitCredit = line.DebitCredit,
                    Amount = line.Amount,
                    Narration = line.Narration,
                    SortOrder = order++
                });
            }

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            return (await Get(id))!;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public async Task Delete(Guid id)
    {
        var v = await _db.Vouchers.SingleAsync(x => x.Id == id);
        v.DeletedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task<string> GenerateVoucherNo(string voucherType, Guid firmId, Guid branchId)
    {
        var branch = await _db.Branches.SingleAsync(b => b.Id == branchId);
        var prefix = branch.VoucherPrefix ?? $"{branch.Code}-V-";

        var typeCode = voucherType switch
        {
            "payment" => "P",
            "receipt" => "R",
            "contra" => "C",
            "journal" => "J",
            "sales" => "S",
            "purchase" => "PU",
            _ => "X"
        };

        // Race-safe atomic counter (same pattern as BillService) — the old
        // CountAsync+1 approach gave duplicate numbers under concurrent inserts.
        var fyYear = GetFinancialYearStart(DateOnly.FromDateTime(DateTime.Now)).Year;
        var nextNo = await ReserveCounterAsync(firmId, branchId, $"voucher.{voucherType}", fyYear);
        return $"{prefix}{typeCode}{nextNo:D4}";
    }

    /// <summary>
    /// Atomic counter using PostgreSQL UPSERT + RETURNING. Race-safe across concurrent transactions.
    /// Shares the platform.voucher_counters table with BillService.
    /// </summary>
    private async Task<long> ReserveCounterAsync(Guid firmId, Guid branchId, string counterKey, int fyYear)
    {
        var sql = @"
INSERT INTO platform.voucher_counters (firm_id, branch_id, counter_key, fy_year, next_no)
VALUES ({0}, {1}, {2}, {3}, 1)
ON CONFLICT (firm_id, branch_id, counter_key, fy_year)
DO UPDATE SET next_no = platform.voucher_counters.next_no + 1
RETURNING next_no;";
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
        // RLS: raw connection bypasses EF interceptor — set tenant context before the write.
        await Namokara.Api.Common.Db.TenantContextSetter.ApplyAsync(conn, firmId, branchId);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = string.Format(sql,
            $"'{firmId}'::uuid", $"'{branchId}'::uuid",
            $"'{counterKey.Replace("'", "''")}'", fyYear);
        var result = await cmd.ExecuteScalarAsync();
        return Convert.ToInt64(result);
    }

    private DateOnly GetFinancialYearStart(DateOnly date)
    {
        // Indian FY: April 1 to March 31
        return date.Month >= 4
            ? new DateOnly(date.Year, 4, 1)
            : new DateOnly(date.Year - 1, 4, 1);
    }
}
