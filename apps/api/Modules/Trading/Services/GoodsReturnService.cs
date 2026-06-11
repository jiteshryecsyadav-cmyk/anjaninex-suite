using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Trading.Services;

// =============================================================================
// DTOs
// =============================================================================
public record GoodsReturnLineDto(
    Guid? Id,
    Guid? BillLineId,
    Guid? ItemId,
    string ItemName,
    string? Description,
    string? HsnSac,
    decimal Qty,
    string? Unit,
    decimal Rate,
    decimal Rd,
    decimal IgstPct,
    decimal TaxableAmount,
    decimal TaxAmount,
    decimal TotalAmount);

public record GoodsReturnListItemDto(
    Guid Id,
    string GrNo,
    DateOnly GrDate,
    Guid SupplierPartyId,
    string SupplierName,
    Guid? BuyerPartyId,
    string? BuyerName,
    Guid? OriginalBillId,
    string? OriginalBillNo,
    decimal TotalReturnAmount,
    string EffectMode,
    string Status,
    DateTimeOffset? CreatedAt = null);  // entry kab punch hui

public record GoodsReturnDetailDto(
    Guid Id,
    string GrNo,
    DateOnly GrDate,
    Guid SupplierPartyId,
    string SupplierName,
    Guid? BuyerPartyId,
    string? BuyerName,
    Guid? OriginalBillId,
    string? OriginalBillNo,
    string? Transport,
    string? LrNo,
    string? Reason,
    string? Remark,
    string EffectMode,
    decimal OriginalBillAmount,
    decimal TotalReturnAmount,
    decimal TaxableAmount,
    decimal TaxAmount,
    decimal NetBillAfterGr,
    DateOnly? CreditNoteValidTill,
    bool CreditNoteAdjustFuture,
    decimal CommissionPct,
    decimal CommissionAmount,
    string Status,
    DateTimeOffset? ApprovedAt,
    string? RejectionReason,
    List<GoodsReturnLineDto> Lines);

public record CreateGoodsReturnDto(
    DateOnly GrDate,
    Guid SupplierPartyId,
    Guid? BuyerPartyId,
    Guid? OriginalBillId,
    string? Transport,
    string? LrNo,
    string? Reason,
    string? Remark,
    string EffectMode,
    decimal OriginalBillAmount,
    DateOnly? CreditNoteValidTill,
    bool CreditNoteAdjustFuture,
    decimal CommissionPct,
    string Status,
    List<GoodsReturnLineDto> Lines);

// =============================================================================
// Service
// =============================================================================
public interface IGoodsReturnService
{
    Task<(List<GoodsReturnListItemDto> items, int total)> List(string? status, DateOnly? from, DateOnly? to, Guid? partyId, int page, int size);
    Task<GoodsReturnDetailDto?> Get(Guid id);
    Task<GoodsReturnDetailDto> Create(CreateGoodsReturnDto dto, Guid firmId, Guid branchId, Guid userId);
    Task<GoodsReturnDetailDto?> Update(Guid id, CreateGoodsReturnDto dto, Guid firmId, Guid userId);
    Task<GoodsReturnDetailDto> Approve(Guid id, Guid userId);
    Task<GoodsReturnDetailDto> Reject(Guid id, string reason, Guid userId);
    Task Delete(Guid id);
}

public class GoodsReturnService : IGoodsReturnService
{
    private readonly AppDbContext _db;
    public GoodsReturnService(AppDbContext db) => _db = db;

    public async Task<(List<GoodsReturnListItemDto> items, int total)> List(
        string? status, DateOnly? from, DateOnly? to, Guid? partyId, int page, int size)
    {
        var q = _db.GoodsReturns.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(status)) q = q.Where(g => g.Status == status);
        if (from.HasValue) q = q.Where(g => g.GrDate >= from.Value);
        if (to.HasValue) q = q.Where(g => g.GrDate <= to.Value);
        if (partyId.HasValue) q = q.Where(g => g.SupplierPartyId == partyId.Value || g.BuyerPartyId == partyId.Value);

        var total = await q.CountAsync();
        var grs = await q.OrderByDescending(g => g.GrDate).ThenByDescending(g => g.CreatedAt)
            .Skip((page - 1) * size).Take(size).ToListAsync();

        var partyIds = grs.Select(g => g.SupplierPartyId)
            .Concat(grs.Where(g => g.BuyerPartyId.HasValue).Select(g => g.BuyerPartyId!.Value))
            .Distinct().ToList();
        var billIds = grs.Where(g => g.OriginalBillId.HasValue).Select(g => g.OriginalBillId!.Value).Distinct().ToList();

        var parties = await _db.PartyProfiles.AsNoTracking()
            .Where(p => partyIds.Contains(p.Id))
            .Join(_db.Contacts.AsNoTracking(), pp => pp.ContactId, c => c.Id,
                  (pp, c) => new { pp.Id, c.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

        var bills = await _db.Bills.AsNoTracking()
            .Where(b => billIds.Contains(b.Id))
            .ToDictionaryAsync(b => b.Id, b => b.BillNo);

        var items = grs.Select(g => new GoodsReturnListItemDto(
            g.Id, g.GrNo, g.GrDate,
            g.SupplierPartyId, parties.GetValueOrDefault(g.SupplierPartyId, ""),
            g.BuyerPartyId, g.BuyerPartyId.HasValue ? parties.GetValueOrDefault(g.BuyerPartyId.Value, "") : null,
            g.OriginalBillId, g.OriginalBillId.HasValue ? bills.GetValueOrDefault(g.OriginalBillId.Value, "") : null,
            g.TotalReturnAmount, g.EffectMode, g.Status,
            g.CreatedAt)).ToList();

        return (items, total);
    }

    public async Task<GoodsReturnDetailDto?> Get(Guid id)
    {
        var g = await _db.GoodsReturns.AsNoTracking()
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (g is null) return null;

        var ids = new[] { g.SupplierPartyId }
            .Concat(g.BuyerPartyId.HasValue ? new[] { g.BuyerPartyId.Value } : Array.Empty<Guid>())
            .Distinct().ToList();

        var names = await _db.PartyProfiles.AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .Join(_db.Contacts.AsNoTracking(), pp => pp.ContactId, c => c.Id,
                  (pp, c) => new { pp.Id, c.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

        var billNo = g.OriginalBillId.HasValue
            ? await _db.Bills.AsNoTracking().Where(b => b.Id == g.OriginalBillId.Value).Select(b => b.BillNo).FirstOrDefaultAsync()
            : null;

        return new GoodsReturnDetailDto(
            g.Id, g.GrNo, g.GrDate,
            g.SupplierPartyId, names.GetValueOrDefault(g.SupplierPartyId, ""),
            g.BuyerPartyId, g.BuyerPartyId.HasValue ? names.GetValueOrDefault(g.BuyerPartyId.Value, "") : null,
            g.OriginalBillId, billNo,
            g.Transport, g.LrNo, g.Reason, g.Remark, g.EffectMode,
            g.OriginalBillAmount, g.TotalReturnAmount, g.TaxableAmount, g.TaxAmount, g.NetBillAfterGr,
            g.CreditNoteValidTill, g.CreditNoteAdjustFuture,
            g.CommissionPct, g.CommissionAmount,
            g.Status, g.ApprovedAt, g.RejectionReason,
            g.Lines.OrderBy(l => l.SortOrder).Select(l => new GoodsReturnLineDto(
                l.Id, l.BillLineId, l.ItemId, l.ItemName, l.Description, l.HsnSac,
                l.Qty, l.Unit, l.Rate, l.Rd, l.IgstPct,
                l.TaxableAmount, l.TaxAmount, l.TotalAmount)).ToList());
    }

    public async Task<GoodsReturnDetailDto> Create(CreateGoodsReturnDto dto, Guid firmId, Guid branchId, Guid userId)
    {
        if (dto.Lines is null || dto.Lines.Count == 0)
            throw new ArgumentException("At least one return item line is required");

        var grNo = await GenerateGrNo(firmId, branchId);

        var taxable = dto.Lines.Sum(l => l.TaxableAmount);
        var tax = dto.Lines.Sum(l => l.TaxAmount);
        var totalReturn = dto.Lines.Sum(l => l.TotalAmount);
        var netAfter = dto.OriginalBillAmount - totalReturn;
        var netTaxable = Math.Max(0, dto.OriginalBillAmount - totalReturn);
        var commAmount = netTaxable * (dto.CommissionPct / 100m);

        var gr = new GoodsReturn
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            BranchId = branchId,
            GrNo = grNo,
            GrDate = dto.GrDate,
            SupplierPartyId = dto.SupplierPartyId,
            BuyerPartyId = dto.BuyerPartyId,
            OriginalBillId = dto.OriginalBillId,
            Transport = dto.Transport,
            LrNo = dto.LrNo,
            Reason = dto.Reason,
            Remark = dto.Remark,
            EffectMode = dto.EffectMode ?? "direct_adjustment",
            OriginalBillAmount = dto.OriginalBillAmount,
            TotalReturnAmount = totalReturn,
            TaxableAmount = taxable,
            TaxAmount = tax,
            NetBillAfterGr = netAfter,
            CreditNoteValidTill = dto.CreditNoteValidTill,
            CreditNoteAdjustFuture = dto.CreditNoteAdjustFuture,
            CommissionPct = dto.CommissionPct,
            CommissionAmount = commAmount,
            Status = dto.Status ?? "pending",
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            Lines = dto.Lines.Select((l, idx) => new GoodsReturnLine
            {
                Id = Guid.NewGuid(),
                BillLineId = l.BillLineId,
                ItemId = l.ItemId,
                ItemName = l.ItemName,
                Description = l.Description,
                HsnSac = l.HsnSac,
                Qty = l.Qty,
                Unit = l.Unit,
                Rate = l.Rate,
                Rd = l.Rd,
                IgstPct = l.IgstPct,
                TaxableAmount = l.TaxableAmount,
                TaxAmount = l.TaxAmount,
                TotalAmount = l.TotalAmount,
                SortOrder = idx
            }).ToList()
        };

        _db.GoodsReturns.Add(gr);
        await _db.SaveChangesAsync();
        return (await Get(gr.Id))!;
    }

    // IN-PLACE UPDATE — same GR (Id + GrNo same), lines replace. (Pehle delete+recreate = renumber.)
    public async Task<GoodsReturnDetailDto?> Update(Guid id, CreateGoodsReturnDto dto, Guid firmId, Guid userId)
    {
        var gr = await _db.GoodsReturns.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (gr == null) return null;
        if (dto.Lines is null || dto.Lines.Count == 0)
            throw new ArgumentException("At least one return item line is required");

        var taxable = dto.Lines.Sum(l => l.TaxableAmount);
        var tax = dto.Lines.Sum(l => l.TaxAmount);
        var totalReturn = dto.Lines.Sum(l => l.TotalAmount);
        var netAfter = dto.OriginalBillAmount - totalReturn;
        var netTaxable = Math.Max(0, dto.OriginalBillAmount - totalReturn);

        gr.GrDate = dto.GrDate;
        gr.SupplierPartyId = dto.SupplierPartyId;
        gr.BuyerPartyId = dto.BuyerPartyId;
        gr.OriginalBillId = dto.OriginalBillId;
        gr.Transport = dto.Transport;
        gr.LrNo = dto.LrNo;
        gr.Reason = dto.Reason;
        gr.Remark = dto.Remark;
        gr.EffectMode = dto.EffectMode ?? gr.EffectMode;
        gr.OriginalBillAmount = dto.OriginalBillAmount;
        gr.TotalReturnAmount = totalReturn;
        gr.TaxableAmount = taxable;
        gr.TaxAmount = tax;
        gr.NetBillAfterGr = netAfter;
        gr.CreditNoteValidTill = dto.CreditNoteValidTill;
        gr.CreditNoteAdjustFuture = dto.CreditNoteAdjustFuture;
        gr.CommissionPct = dto.CommissionPct;
        gr.CommissionAmount = netTaxable * (dto.CommissionPct / 100m);
        gr.Status = dto.Status ?? gr.Status;
        gr.UpdatedAt = DateTimeOffset.UtcNow;

        _db.GoodsReturnLines.RemoveRange(gr.Lines);
        _db.GoodsReturnLines.AddRange(dto.Lines.Select((l, idx) => new GoodsReturnLine
        {
            Id = Guid.NewGuid(),
            GoodsReturnId = gr.Id,
            BillLineId = l.BillLineId,
            ItemId = l.ItemId,
            ItemName = l.ItemName,
            Description = l.Description,
            HsnSac = l.HsnSac,
            Qty = l.Qty,
            Unit = l.Unit,
            Rate = l.Rate,
            Rd = l.Rd,
            IgstPct = l.IgstPct,
            TaxableAmount = l.TaxableAmount,
            TaxAmount = l.TaxAmount,
            TotalAmount = l.TotalAmount,
            SortOrder = idx
        }).ToList());

        await _db.SaveChangesAsync();
        return await Get(gr.Id);
    }

    public async Task<GoodsReturnDetailDto> Approve(Guid id, Guid userId)
    {
        var gr = await _db.GoodsReturns.FindAsync(id)
            ?? throw new InvalidOperationException("Goods return not found");

        // IDEMPOTENCY GUARD: agar pehle se approved hai to dobara mat lagao —
        // warna linked bill ki PaidAmount me GR amount DO BAAR jud jayegi.
        if (gr.Status == "approved")
            return (await Get(id))!;

        using var tx = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        try
        {
            gr.Status = "approved";
            gr.ApprovedBy = userId;
            gr.ApprovedAt = DateTimeOffset.UtcNow;
            gr.UpdatedAt = DateTimeOffset.UtcNow;

            // ===== APPROVED GR → linked bill ka outstanding kam karo =====
            // GR amount ko bill.PaidAmount me "settled" maan kar jodo aur status recompute karo,
            // taaki "Total − PaidAmount" har jagah (Dashboard, Payments) ek hi sach bole aur
            // GR ke baad fully-settled bill "paid" ho jaye.
            // NOTE: PaymentService sirf NON-approved (pending) GR ko outstanding se ghatata hai,
            // is liye yahan approved amount jodne se double-count nahi hota.
            if (gr.OriginalBillId.HasValue)
            {
                var bill = await _db.Bills.FirstOrDefaultAsync(b => b.Id == gr.OriginalBillId.Value);
                if (bill != null)
                {
                    // Bill ke total se zyada settle na ho (clamp).
                    bill.PaidAmount = Math.Min(bill.Total, bill.PaidAmount + gr.TotalReturnAmount);
                    bill.Status = bill.PaidAmount >= bill.Total ? "paid"
                                  : bill.PaidAmount > 0 ? "partial" : "pending";
                    bill.UpdatedAt = DateTimeOffset.UtcNow;
                }
            }

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }
        return (await Get(id))!;
    }

    public async Task<GoodsReturnDetailDto> Reject(Guid id, string reason, Guid userId)
    {
        var gr = await _db.GoodsReturns.FindAsync(id)
            ?? throw new InvalidOperationException("Goods return not found");

        // Agar pehle approve ho chuka tha to bill me fold kiya gaya GR amount WAPAS nikalo,
        // warna reject ke baad bhi bill galat "settled" rehta.
        var wasApproved = gr.Status == "approved";
        gr.Status = "rejected";
        gr.RejectionReason = reason;
        gr.UpdatedAt = DateTimeOffset.UtcNow;

        if (wasApproved) await ReverseBillSettlement(gr);

        await _db.SaveChangesAsync();
        return (await Get(id))!;
    }

    public async Task Delete(Guid id)
    {
        var gr = await _db.GoodsReturns.FindAsync(id);
        if (gr is null) return;

        // Approved GR delete ho raha hai to pehle bill se fold kiya amount reverse karo.
        if (gr.Status == "approved" && gr.DeletedAt == null)
            await ReverseBillSettlement(gr);

        gr.DeletedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    // Approved GR ke "settled" amount ko linked bill se wapas nikaalo + status recompute.
    // (PaidAmount clamped at 0 — kabhi negative na ho.)
    private async Task ReverseBillSettlement(GoodsReturn gr)
    {
        if (!gr.OriginalBillId.HasValue) return;
        var bill = await _db.Bills.FirstOrDefaultAsync(b => b.Id == gr.OriginalBillId.Value);
        if (bill == null) return;
        bill.PaidAmount = Math.Max(0, bill.PaidAmount - gr.TotalReturnAmount);
        bill.Status = bill.PaidAmount >= bill.Total ? "paid"
                      : bill.PaidAmount > 0 ? "partial" : "pending";
        bill.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private async Task<string> GenerateGrNo(Guid firmId, Guid branchId)
    {
        var branch = await _db.Branches.SingleAsync(b => b.Id == branchId);

        // Race-safe atomic counter (platform.voucher_counters) — same as BillService.
        // Pehle "CountAsync(...) + 1" tha jo concurrent inserts par DUPLICATE gr_no de sakta tha.
        var fyYear = GetFyStart().Year;
        var next = await ReserveCounterAsync(firmId, branchId, "goodsreturn", fyYear);

        // Safety net: legacy data ke saath agar counter peeche ho to existing no skip karo.
        // Short format: JPR-G1, JPR-G2 ... (G = Goods Return)
        string candidate;
        do
        {
            candidate = $"{branch.Code}-G{next}";
            var exists = await _db.GoodsReturns.IgnoreQueryFilters()
                .AnyAsync(g => g.FirmId == firmId && g.BranchId == branchId && g.GrNo == candidate);
            if (!exists) break;
            next = await ReserveCounterAsync(firmId, branchId, "goodsreturn", fyYear);
        } while (true);
        return candidate;
    }

    /// <summary>
    /// Atomic counter using PostgreSQL UPSERT + RETURNING. Race-safe across concurrent
    /// transactions. (BillService me bhi yahi pattern — same table/keys family.)
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
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = string.Format(sql,
            $"'{firmId}'::uuid", $"'{branchId}'::uuid",
            $"'{counterKey.Replace("'", "''")}'", fyYear);
        var result = await cmd.ExecuteScalarAsync();
        return Convert.ToInt64(result);
    }

    private static DateOnly GetFyStart()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var year = today.Month >= 4 ? today.Year : today.Year - 1;
        return new DateOnly(year, 4, 1);
    }
}
