using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;
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

        // Display SUPPLIER ka bill no — internal no fallback
        var bills = (await _db.Bills.AsNoTracking()
            .Where(b => billIds.Contains(b.Id))
            .Select(b => new { b.Id, b.BillNo, b.SupplierBillNo })
            .ToListAsync())
            .ToDictionary(b => b.Id, b => string.IsNullOrWhiteSpace(b.SupplierBillNo) ? b.BillNo : b.SupplierBillNo!);

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
            ? await _db.Bills.AsNoTracking().Where(b => b.Id == g.OriginalBillId.Value)
                .Select(b => string.IsNullOrEmpty(b.SupplierBillNo) ? b.BillNo : b.SupplierBillNo).FirstOrDefaultAsync()
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

        using var tx = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        try
        {
            var result = await CreateInternal(dto, firmId, branchId, userId);
            await tx.CommitAsync();
            return result;
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }
    }

    private async Task<GoodsReturnDetailDto> CreateInternal(CreateGoodsReturnDto dto, Guid firmId, Guid branchId, Guid userId)
    {
        var totalReturn = dto.Lines.Sum(l => l.TotalAmount);

        // EK BILL = EK GR. Agar is bill ki GR pehle se ban chuki hai to nayi mat banao —
        // user ko usi GR ko EDIT karna chahiye. (Double-save + alag-amount duplicate dono rukte hain.)
        if (dto.OriginalBillId.HasValue)
        {
            var existingGrNo = await _db.GoodsReturns
                .Where(g => g.FirmId == firmId && g.OriginalBillId == dto.OriginalBillId)
                .Select(g => g.GrNo)
                .FirstOrDefaultAsync();
            if (existingGrNo != null)
                throw new ArgumentException($"Is bill ki GR pehle se bani hai ({existingGrNo}). Nayi banane ke bajaye usi GR ko EDIT karein.");
        }

        var grNo = await GenerateGrNo(firmId, branchId);

        var taxable = dto.Lines.Sum(l => l.TaxableAmount);
        var tax = dto.Lines.Sum(l => l.TaxAmount);
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

        // ===== AUTO-POST GR ACCOUNTING VOUCHER =====
        // Credits the bill's party (same party the bill debited) so the GR reflects in
        // the party khata and reduces the balance. No-op if total is 0.
        gr.VoucherId = await PostVoucherForGr(gr, firmId, branchId, userId);
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

        using var tx = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        try
        {
            // Purana GR voucher hatao, naya post karo — mirror BillService.Update.
            await RemoveGrVoucher(gr);
            await _db.SaveChangesAsync();

            gr.VoucherId = await PostVoucherForGr(gr, firmId, gr.BranchId, userId);
            await _db.SaveChangesAsync();

            await tx.CommitAsync();
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }
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

        // Rejected GR ka accounting effect bhi hatao (party khata se GR credit nikal jaye).
        await RemoveGrVoucher(gr);

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

        // GR ka accounting voucher bhi hatao taaki party khata se GR credit nikal jaye.
        if (gr.DeletedAt == null)
            await RemoveGrVoucher(gr);

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

    // =========================================================================
    // GR ACCOUNTING VOUCHER (the fix — GR was posting NO voucher at all)
    //
    // Broker model:
    //   Sales bill  → Dr Party (= bill.PartyId, the supplier), Cr Sales + Cr Tax.
    //   Sales GR    → REVERSE the party leg: Cr Party (supplier), Dr Sales Return + Dr Tax.
    //                 Party khata me GR ab credit dikhega → balance ghatega.
    //   Purchase GR → Dr Party, Cr Purchase Return + Cr Tax.
    // Voucher ALWAYS exactly balanced (Round Off plug) — same as BillService.
    // =========================================================================
    private async Task<Guid?> PostVoucherForGr(GoodsReturn gr, Guid firmId, Guid branchId, Guid userId)
    {
        if (gr.TotalReturnAmount <= 0) return null;

        // Original bill se decide karo: sales bill ka GR = sales_return, purchase ka = purchase_return.
        // BROKER (dalal) model — sales GR ka double-entry sirf DO line, bill ka exact reverse:
        //   sales bill    → bill tha (Dr BUYER / Cr SUPPLIER)  → GR (Dr SUPPLIER / Cr BUYER)
        //   purchase bill → bill ne SUPPLIER ko Cr kiya         → GR Dr SUPPLIER  [UNCHANGED]
        // Riddhi Agency seller nahi — sales GR me NA Sales-Return ledger, NA GST reversal.
        // Sales case ke liye buyer + supplier DONO ledger chahiye.
        // Agar GR kisi bill se linked nahi (ya buyer ledger nahi) to safe legacy fallback rakhte hain.
        string billType = "sales";
        Guid supplierPartyId = gr.SupplierPartyId;
        Guid? buyerPartyId   = gr.BuyerPartyId;
        if (gr.OriginalBillId.HasValue)
        {
            var bill = await _db.Bills.IgnoreQueryFilters()
                .Where(b => b.Id == gr.OriginalBillId.Value)
                .Select(b => new { b.BillType, b.PartyId, b.BuyerPartyId })
                .FirstOrDefaultAsync();
            if (bill != null)
            {
                billType        = bill.BillType;
                supplierPartyId = bill.PartyId;
                buyerPartyId    = bill.BuyerPartyId ?? gr.BuyerPartyId;
            }
        }

        var isSales = billType != "purchase";
        var voucherType = isSales ? "sales_return" : "purchase_return";
        var voucherNo = await GenerateVoucherNoForGr(voucherType, branchId, firmId);

        var voucher = new Voucher
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            BranchId = branchId,
            VoucherType = voucherType,
            VoucherNo = voucherNo,
            VoucherDate = gr.GrDate,
            Narration = $"Auto-posted from Goods Return {gr.GrNo}",
            TotalAmount = gr.TotalReturnAmount,
            SourceModule = "trading",
            SourceRefId = gr.Id,
            IsPosted = true,
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        int order = 0;

        if (isSales)
        {
            // BROKER 2-LINE sales return — supplier + buyer dono ledger chahiye.
            var supplierLedgerId = await ResolvePartyLedgerId(supplierPartyId, firmId);
            var buyerLedgerId    = buyerPartyId.HasValue
                ? await ResolvePartyLedgerId(buyerPartyId.Value, firmId)
                : null;

            if (supplierLedgerId.HasValue && buyerLedgerId.HasValue)
            {
                // Dr SUPPLIER = return total  (bill ka Cr supplier reverse)
                voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = supplierLedgerId.Value, DebitCredit = "Dr", Amount = gr.TotalReturnAmount, Narration = $"GR {gr.GrNo} (supplier)", SortOrder = order++ });
                // Cr BUYER = return total      (bill ka Dr buyer reverse)
                voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = buyerLedgerId.Value, DebitCredit = "Cr", Amount = gr.TotalReturnAmount, Narration = $"GR {gr.GrNo} (buyer)", SortOrder = order++ });
            }
            else
            {
                // LEGACY FALLBACK (buyer/supplier ledger missing) — purana Cr party / Dr Sales-Return.
                var partyLedgerId = (buyerLedgerId ?? supplierLedgerId)
                    ?? throw new InvalidOperationException(
                        "GR party ka ledger nahi mila. Pehle Chart of Accounts initialize karein.");
                var taxable = gr.TaxableAmount;
                var tax = gr.TaxAmount;
                if (taxable + tax <= 0) { taxable = gr.TotalReturnAmount; tax = 0; }
                var returnLedgerId = await FindOrCreateReturnLedger(firmId, "Sales Return", true);
                voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = partyLedgerId, DebitCredit = "Cr", Amount = gr.TotalReturnAmount, Narration = $"GR {gr.GrNo}", SortOrder = order++ });
                voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = returnLedgerId, DebitCredit = "Dr", Amount = taxable, Narration = "Sales return (taxable)", SortOrder = order++ });
                if (tax > 0)
                {
                    var taxLedger = await FindOrCreateTaxLedger(firmId, "Output Tax Reversal");
                    voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = taxLedger, DebitCredit = "Dr", Amount = tax, Narration = "Tax on sales return", SortOrder = order++ });
                }
            }
        }
        else
        {
            // ===== PURCHASE GR — UNCHANGED (Dr Supplier, Cr Purchase Return + Tax) =====
            var partyLedgerId = await ResolvePartyLedgerId(supplierPartyId, firmId)
                ?? throw new InvalidOperationException(
                    "GR party ka ledger nahi mila. Pehle Chart of Accounts initialize karein.");
            var returnLedgerId = await FindOrCreateReturnLedger(firmId, "Purchase Return", false);
            var taxable = gr.TaxableAmount;
            var tax = gr.TaxAmount;
            if (taxable + tax <= 0) { taxable = gr.TotalReturnAmount; tax = 0; }
            // Reverse the bill's Cr Party → Dr Party
            voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = partyLedgerId, DebitCredit = "Dr", Amount = gr.TotalReturnAmount, Narration = $"GR {gr.GrNo}", SortOrder = order++ });
            voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = returnLedgerId, DebitCredit = "Cr", Amount = taxable, Narration = "Purchase return (taxable)", SortOrder = order++ });
            if (tax > 0)
            {
                var taxLedger = await FindOrCreateTaxLedger(firmId, "Input Tax Reversal");
                voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = taxLedger, DebitCredit = "Cr", Amount = tax, Narration = "Tax on purchase return", SortOrder = order++ });
            }
        }

        // HAMESHA exact balance — Dr/Cr antar Round Off me plug (same as BillService).
        await AddBalancingRoundOffAsync(voucher, firmId, order++);

        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
        return voucher.Id;
    }

    // GR ka linked voucher (+ cascade lines) hatao + reference clear.
    private async Task RemoveGrVoucher(GoodsReturn gr)
    {
        if (!gr.VoucherId.HasValue) return;
        var v = await _db.Vouchers.FirstOrDefaultAsync(x => x.Id == gr.VoucherId.Value);
        if (v != null) _db.Vouchers.Remove(v);
        gr.VoucherId = null;
    }

    // party.LedgerId resolve karo (bill ne isi ledger ko Dr/Cr kiya tha).
    private async Task<Guid?> ResolvePartyLedgerId(Guid partyId, Guid firmId)
    {
        return await _db.PartyProfiles
            .Where(p => p.Id == partyId && p.FirmId == firmId)
            .Select(p => p.LedgerId)
            .FirstOrDefaultAsync();
    }

    // Find-or-create Sales Return / Purchase Return ledger under a sensible income/expense
    // sub-group (mirror BillService.FindOrCreateRoundOffLedger fallback chain).
    private async Task<Guid> FindOrCreateReturnLedger(Guid firmId, string name, bool isSales)
    {
        var existing = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == name)
            .Select(l => l.Id).FirstOrDefaultAsync();
        if (existing != Guid.Empty) return existing;

        // Sales Return → income-side reduction; Purchase Return → expense-side reduction.
        var preferred = isSales
            ? new[] { "Direct Income", "Sales Accounts", "Indirect Income", "Other Income" }
            : new[] { "Direct Expenses", "Purchase Accounts", "Indirect Expenses", "Other Expenses" };

        var subGroup = await _db.SubGroups
            .FirstOrDefaultAsync(s => s.FirmId == firmId && preferred.Contains(s.Name));
        subGroup ??= await _db.SubGroups
            .Where(s => s.FirmId == firmId &&
                (s.Name.ToLower().Contains(isSales ? "income" : "expense")))
            .FirstOrDefaultAsync();
        subGroup ??= await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId);
        if (subGroup is null)
            throw new InvalidOperationException(
                "No sub groups found for this firm. Run accounting seed: Admin → Settings → Initialize Chart of Accounts.");

        var ledger = new Ledger
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            SubGroupId = subGroup.Id,
            Name = name,
            OpeningBalance = 0,
            OpeningType = isSales ? "Dr" : "Cr",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Ledgers.Add(ledger);
        await _db.SaveChangesAsync();
        return ledger.Id;
    }

    private async Task<Guid> FindOrCreateTaxLedger(Guid firmId, string name)
    {
        var existing = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == name)
            .Select(l => l.Id).FirstOrDefaultAsync();
        if (existing != Guid.Empty) return existing;

        var subGroup = await _db.SubGroups
            .FirstOrDefaultAsync(s => s.FirmId == firmId && s.Name == "Duties & Taxes")
            ?? await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId)
            ?? throw new InvalidOperationException("No sub groups found for this firm.");

        var ledger = new Ledger
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            SubGroupId = subGroup.Id,
            Name = name,
            OpeningBalance = 0,
            OpeningType = "Cr",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Ledgers.Add(ledger);
        await _db.SaveChangesAsync();
        return ledger.Id;
    }

    private async Task<Guid> FindOrCreateRoundOffLedger(Guid firmId)
    {
        var existing = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == "Round Off")
            .Select(l => l.Id).FirstOrDefaultAsync();
        if (existing != Guid.Empty) return existing;

        var subGroup = await _db.SubGroups
            .FirstOrDefaultAsync(s => s.FirmId == firmId &&
                (s.Name == "Indirect Income" || s.Name == "Indirect Expenses"
                 || s.Name == "Direct Income" || s.Name == "Direct Expenses"
                 || s.Name == "Other Income" || s.Name == "Other Expenses"));
        subGroup ??= await _db.SubGroups
            .Where(s => s.FirmId == firmId &&
                (s.Name.ToLower().Contains("income") || s.Name.ToLower().Contains("expense")))
            .FirstOrDefaultAsync();
        subGroup ??= await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId);
        if (subGroup is null)
            throw new InvalidOperationException("No sub groups found for this firm.");

        var ledger = new Ledger
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            SubGroupId = subGroup.Id,
            Name = "Round Off",
            OpeningBalance = 0,
            OpeningType = "Cr",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Ledgers.Add(ledger);
        await _db.SaveChangesAsync();
        return ledger.Id;
    }

    // Mirror BillService.AddBalancingRoundOffAsync — voucher ko HAMESHA exactly balance karo.
    private async Task AddBalancingRoundOffAsync(Voucher voucher, Guid firmId, int order)
    {
        foreach (var l in voucher.Lines)
            l.Amount = Math.Round(l.Amount, 2, MidpointRounding.AwayFromZero);

        decimal dr = voucher.Lines.Where(l => l.DebitCredit == "Dr").Sum(l => l.Amount);
        decimal cr = voucher.Lines.Where(l => l.DebitCredit == "Cr").Sum(l => l.Amount);
        decimal diff = Math.Round(dr - cr, 2, MidpointRounding.AwayFromZero);
        if (diff == 0) return;
        Guid roundOffLedger = await FindOrCreateRoundOffLedger(firmId);
        voucher.Lines.Add(new VoucherLine
        {
            Id = Guid.NewGuid(),
            VoucherId = voucher.Id,
            LedgerId = roundOffLedger,
            DebitCredit = diff > 0 ? "Cr" : "Dr",
            Amount = Math.Abs(diff),
            Narration = "Round Off",
            SortOrder = order
        });
    }

    private async Task<string> GenerateVoucherNoForGr(string voucherType, Guid branchId, Guid firmId)
    {
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                  ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                  ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");
        var prefix = branch.VoucherPrefix ?? $"{branch.Code}-V-";
        var typeCode = voucherType == "purchase_return" ? "PR" : "SR";
        var fyYear = GetFyStart().Year;
        var next = await ReserveCounterAsync(firmId, branchId, $"voucher.{voucherType}", fyYear);
        return $"{prefix}{typeCode}{next:D4}";
    }

    private async Task<string> GenerateGrNo(Guid firmId, Guid branchId)
    {
        // branchId galat/empty ho (naye firm me claim mismatch) to firm ke branch pe
        // fallback — warna SingleAsync "Sequence contains no elements" crash deta tha.
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                  ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                  ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");

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
        // RLS: raw connection bypasses EF interceptor — set tenant context before the write.
        await Namokara.Api.Common.Db.TenantContextSetter.ApplyAsync(conn, firmId, branchId);
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
