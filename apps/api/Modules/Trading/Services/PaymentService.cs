using System.Data;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Trading.Services;

// =============================================================================
// DTOs
// =============================================================================
public record PaymentAllocationDto(Guid BillId, string BillNo, decimal Allocated);

public record PaymentListItemDto(
    Guid Id, string PaymentType, string PaymentNo, DateOnly PaymentDate,
    Guid PartyId, string PartyName, string? PartyGst,
    string PaymentMode, decimal Amount, string? ReferenceNo,
    Guid? VoucherId, string? VoucherNo,
    string? BillNos,
    DateTimeOffset? CreatedAt = null,   // entry kab punch hui
    decimal BalancePending = 0,         // is payment ke bills par ABHI kitna baki
    string? SupplierName = null);       // notes ke "Supplier: X" se

public record PaymentDetailDto(
    Guid Id, string PaymentType, string PaymentNo, DateOnly PaymentDate,
    Guid PartyId, string PartyName,
    string PaymentMode, decimal Amount,
    string? ReferenceNo, string? BankName, string? BankBranch,
    Guid? BankLedgerId, string? BankLedgerName,
    Guid? VoucherId, string? VoucherNo,
    string? Notes,
    List<PaymentAllocationDto> Allocations,
    bool MoneyToAgency = false);

public record CreatePaymentDto(
    string PaymentType,
    DateOnly PaymentDate,
    Guid PartyId,
    string PaymentMode,
    decimal Amount,
    string? ReferenceNo,
    string? BankName,
    Guid? BankLedgerId,   // optional — broker receipt (sales settlement) me cash/bank lagta hi nahi
    string? Notes,
    List<PaymentAllocationDto>? Allocations,
    string? ReuseNo = null,    // edit (delete+recreate) me purana number reuse — renumber na ho
    bool MoneyToAgency = false);   // true = paisa agency ko mila (Dr Cash/Bank, Cr Buyer)

// =============================================================================
// Service
// =============================================================================
public interface IPaymentService
{
    Task<(List<PaymentListItemDto> items, int total)> List(string? type, DateOnly? from, DateOnly? to, Guid? partyId, int page, int size);
    Task<PaymentDetailDto?> Get(Guid id);
    Task<PaymentDetailDto> Create(CreatePaymentDto dto, Guid firmId, Guid branchId, Guid userId);
    Task Delete(Guid id);
    Task<List<BillListItemDto>> GetOutstandingBills(Guid partyId, Guid? supplierId = null);
}

public class PaymentService : IPaymentService
{
    private readonly AppDbContext _db;
    private readonly ILogger<PaymentService> _log;

    public PaymentService(AppDbContext db, ILogger<PaymentService> log)
    {
        _db = db; _log = log;
    }

    public async Task<(List<PaymentListItemDto> items, int total)> List(
        string? type, DateOnly? from, DateOnly? to, Guid? partyId, int page, int size)
    {
        var query = _db.Payments.AsQueryable();
        if (!string.IsNullOrEmpty(type)) query = query.Where(p => p.PaymentType == type);
        if (from.HasValue) query = query.Where(p => p.PaymentDate >= from);
        if (to.HasValue) query = query.Where(p => p.PaymentDate <= to);
        if (partyId.HasValue) query = query.Where(p => p.PartyId == partyId);

        var total = await query.CountAsync();
        var raw = await query
            .OrderByDescending(p => p.PaymentDate).ThenByDescending(p => p.CreatedAt)
            .Skip((page - 1) * size).Take(size)
            .ToListAsync();

        var partyIds = raw.Select(p => p.PartyId).Distinct().ToList();
        var parties = await (from p in _db.PartyProfiles
                             join c in _db.Contacts on p.ContactId equals c.Id
                             where partyIds.Contains(p.Id)
                             select new { p.Id, c.DisplayName, c.GstNumber })
                            .ToDictionaryAsync(x => x.Id, x => new { x.DisplayName, x.GstNumber });

        // Voucher numbers for the payments
        var voucherIds = raw.Where(p => p.VoucherId.HasValue).Select(p => p.VoucherId!.Value).Distinct().ToList();
        var voucherNos = await _db.Vouchers
            .Where(v => voucherIds.Contains(v.Id))
            .Select(v => new { v.Id, v.VoucherNo })
            .ToDictionaryAsync(x => x.Id, x => x.VoucherNo);

        // Allocated bill numbers for each payment (search by bill no)
        var paymentIds = raw.Select(p => p.Id).ToList();
        var allocs = await (from a in _db.PaymentAllocations
                            join b in _db.Bills on a.BillId equals b.Id
                            where paymentIds.Contains(a.PaymentId)
                            select new { a.PaymentId, a.BillId, b.BillNo, b.Total, b.PaidAmount })
                           .ToListAsync();
        var billNosMap = allocs
            .GroupBy(x => x.PaymentId)
            .ToDictionary(g => g.Key, g => string.Join(", ", g.Select(x => x.BillNo)));

        // Har bill par PENDING GR (return) total — pending me se ye bhi minus hoga.
        // NOTE: APPROVED GR ab bill.PaidAmount me fold ho jaata hai (GoodsReturnService.Approve),
        // is liye yahan sirf "pending" GR ghatao — warna approved GR DO BAAR minus hota.
        var allocBillIds = allocs.Select(x => x.BillId).Distinct().ToList();
        var grByBill = await _db.GoodsReturns
            .Where(g => g.OriginalBillId != null && allocBillIds.Contains(g.OriginalBillId.Value)
                     && g.Status == "pending")
            .GroupBy(g => g.OriginalBillId!.Value)
            .Select(g => new { BillId = g.Key, Amt = g.Sum(x => x.TotalReturnAmount) })
            .ToDictionaryAsync(x => x.BillId, x => x.Amt);

        // BAL PENDING = Total − Paid − GR (GR approve hua to wo bhi nikal jaye)
        var pendingMap = allocs
            .GroupBy(x => x.PaymentId)
            .ToDictionary(g => g.Key, g => g.Sum(x =>
                Math.Max(0, x.Total - x.PaidAmount - grByBill.GetValueOrDefault(x.BillId, 0m))));

        var items = raw.Select(p =>
        {
            var party = parties.GetValueOrDefault(p.PartyId);
            // Supplier name notes ke "Supplier: X" piece se
            var supName = (p.Notes ?? "").Split(" | ")
                .FirstOrDefault(s => s.StartsWith("Supplier: "))?.Substring(10);
            return new PaymentListItemDto(
                p.Id, p.PaymentType, p.PaymentNo, p.PaymentDate,
                p.PartyId, party?.DisplayName ?? "—", party?.GstNumber,
                p.PaymentMode, p.Amount, p.ReferenceNo,
                p.VoucherId,
                p.VoucherId.HasValue ? voucherNos.GetValueOrDefault(p.VoucherId.Value) : null,
                billNosMap.GetValueOrDefault(p.Id),
                p.CreatedAt,
                pendingMap.GetValueOrDefault(p.Id, 0m),
                supName);
        }).ToList();

        return (items, total);
    }

    public async Task<PaymentDetailDto?> Get(Guid id)
    {
        var p = await _db.Payments
            .Include(x => x.Allocations)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return null;

        var partyName = await (from pp in _db.PartyProfiles
                               join c in _db.Contacts on pp.ContactId equals c.Id
                               where pp.Id == p.PartyId
                               select c.DisplayName).FirstOrDefaultAsync();

        string? bankLedgerName = null;
        if (p.BankLedgerId.HasValue)
            bankLedgerName = await _db.Ledgers.Where(l => l.Id == p.BankLedgerId.Value)
                .Select(l => l.Name).FirstOrDefaultAsync();

        string? voucherNo = null;
        if (p.VoucherId.HasValue)
            voucherNo = await _db.Vouchers.Where(v => v.Id == p.VoucherId.Value)
                .Select(v => v.VoucherNo).FirstOrDefaultAsync();

        var allocations = new List<PaymentAllocationDto>();
        var billIds = p.Allocations.Select(a => a.BillId).ToList();
        var billNos = await _db.Bills.Where(b => billIds.Contains(b.Id))
            .ToDictionaryAsync(b => b.Id, b => b.BillNo);
        foreach (var a in p.Allocations)
            allocations.Add(new PaymentAllocationDto(a.BillId, billNos.GetValueOrDefault(a.BillId, "—"), a.Allocated));

        return new PaymentDetailDto(
            p.Id, p.PaymentType, p.PaymentNo, p.PaymentDate,
            p.PartyId, partyName ?? "",
            p.PaymentMode, p.Amount,
            p.ReferenceNo, p.BankName, p.BankBranch,
            p.BankLedgerId, bankLedgerName,
            p.VoucherId, voucherNo, p.Notes, allocations,
            p.MoneyToAgency);
    }

    public async Task<PaymentDetailDto> Create(CreatePaymentDto dto, Guid firmId, Guid branchId, Guid userId)
    {
        if (dto.Amount <= 0) throw new ArgumentException("Amount must be positive");

        // Double-submit guard: same party + same type + same amount ki payment agar 2 min ke
        // andar ban chuki hai to dobara mat banao (double-click / slow-network se duplicate rokta
        // hai). Partial/installment payments alag amount ki hoti hain to wo chalti rahengi.
        // Edit (ReuseNo set — delete+recreate) ke case me skip.
        if (string.IsNullOrWhiteSpace(dto.ReuseNo))
        {
            var dup = await _db.Payments.AnyAsync(p =>
                p.FirmId == firmId &&
                p.PartyId == dto.PartyId &&
                p.PaymentType == dto.PaymentType &&
                p.Amount == dto.Amount &&
                p.PaymentDate == dto.PaymentDate);
            if (dup)
                throw new ArgumentException("Is party ki itni hi amount ki payment isi date par pehle se hai (duplicate) — list refresh karein ya purani ko edit karein.");
        }

        using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            // Edit (delete+recreate) me purana number diya ho to wahi rakho, warna naya generate
            var paymentNo = !string.IsNullOrWhiteSpace(dto.ReuseNo)
                ? dto.ReuseNo.Trim()
                : await GeneratePaymentNo(dto.PaymentType, firmId, branchId);

            var payment = new Payment
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                BranchId = branchId,
                PaymentType = dto.PaymentType,
                PaymentNo = paymentNo,
                PaymentDate = dto.PaymentDate,
                PartyId = dto.PartyId,
                PaymentMode = dto.PaymentMode,
                Amount = dto.Amount,
                ReferenceNo = dto.ReferenceNo,
                BankName = dto.BankName,
                BankLedgerId = dto.BankLedgerId == Guid.Empty ? null : dto.BankLedgerId,
                MoneyToAgency = dto.MoneyToAgency,
                Notes = dto.Notes,
                CreatedBy = userId,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            // Allocations
            const decimal eps = 0.01m;   // rounding epsilon
            decimal totalAllocated = 0;
            if (dto.Allocations != null && dto.Allocations.Any(a => a.Allocated > 0))
            {
                // PER-BILL over-allocation guard: kisi ek bill par uske BAKI
                // (Total − PaidAmount) se zyada allocate na ho. (PaidAmount me approved GR
                // pehle se fold hai, is liye yahi single source of truth hai.)
                var allocBillIds = dto.Allocations.Where(a => a.Allocated > 0)
                    .Select(a => a.BillId).Distinct().ToList();
                var billDues = await _db.Bills
                    .Where(b => allocBillIds.Contains(b.Id))
                    .Select(b => new { b.Id, b.BillNo, Due = b.Total - b.PaidAmount })
                    .ToDictionaryAsync(x => x.Id, x => new { x.BillNo, x.Due });

                foreach (var a in dto.Allocations)
                {
                    if (a.Allocated <= 0) continue;
                    if (billDues.TryGetValue(a.BillId, out var info) && a.Allocated > info.Due + eps)
                        throw new ArgumentException(
                            $"Bill {info.BillNo} par allocate ₹{a.Allocated} hai par baaki sirf ₹{info.Due} hai. " +
                            "Allocation bill ke outstanding se zyada nahi ho sakta.");

                    payment.Allocations.Add(new PaymentAllocation
                    {
                        PaymentId = payment.Id,
                        BillId = a.BillId,
                        Allocated = a.Allocated
                    });
                    totalAllocated += a.Allocated;
                }
            }

            // Guard: cannot allocate more than the payment amount (data-integrity).
            // ===== AUTO-ALLOCATION =====
            // User ne koi bill select nahi kiya? To party ke UNPAID bills par
            // purane-se-naye (FIFO) khud laga do — bill khud PAID/PARTIAL ho jayega.
            if (totalAllocated == 0)
            {
                var isReceipt = dto.PaymentType == "receipt";
                var billType = isReceipt ? "sales" : "purchase";
                var remaining = payment.Amount;

                var openBills = await _db.Bills
                    .Where(b => b.FirmId == firmId && b.DeletedAt == null
                             && b.BillType == billType
                             && b.Total > b.PaidAmount
                             && (isReceipt
                                  ? (b.BuyerPartyId == dto.PartyId
                                     || (b.BuyerPartyId == null && b.PartyId == dto.PartyId))
                                  : b.PartyId == dto.PartyId))
                    .OrderBy(b => b.BillDate).ThenBy(b => b.BillNo)
                    .ToListAsync();

                foreach (var b in openBills)
                {
                    if (remaining <= 0) break;
                    var due = b.Total - b.PaidAmount;
                    var alloc = Math.Min(due, remaining);
                    payment.Allocations.Add(new PaymentAllocation
                    {
                        PaymentId = payment.Id,
                        BillId = b.Id,
                        Allocated = alloc
                    });
                    totalAllocated += alloc;
                    remaining -= alloc;
                }
            }

            if (totalAllocated > payment.Amount + 0.01m)
                throw new ArgumentException(
                    $"Allocated total (₹{totalAllocated}) exceeds payment amount (₹{payment.Amount}).");

            _db.Payments.Add(payment);
            await _db.SaveChangesAsync();

            // Update bills paid_amount + status
            foreach (var a in payment.Allocations)
            {
                var bill = await _db.Bills.SingleAsync(b => b.Id == a.BillId);
                bill.PaidAmount += a.Allocated;
                bill.Status = bill.PaidAmount >= bill.Total ? "paid"
                              : bill.PaidAmount > 0 ? "partial" : "pending";
            }

            // ===== AUTO-POST TO ACCOUNTING =====
            var voucherId = await PostVoucherForPayment(payment, firmId, branchId, userId);
            payment.VoucherId = voucherId;
            await _db.SaveChangesAsync();

            await tx.CommitAsync();
            _log.LogInformation("Payment {No} ({Type}) created ₹{Amount} → voucher {VoucherId}",
                paymentNo, dto.PaymentType, dto.Amount, voucherId);

            return (await Get(payment.Id))!;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    private async Task<Guid> PostVoucherForPayment(Payment payment, Guid firmId, Guid branchId, Guid userId)
    {
        var voucherType = payment.PaymentType == "receipt" ? "receipt" : "payment";
        var voucherNo = await GenerateVoucherNoForPayment(voucherType, branchId, firmId);

        var voucher = new Voucher
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            BranchId = branchId,
            VoucherType = voucherType,
            VoucherNo = voucherNo,
            VoucherDate = payment.PaymentDate,
            Narration = $"Auto-posted from Payment {payment.PaymentNo} ({payment.PaymentMode})",
            TotalAmount = payment.Amount,
            SourceModule = "trading",
            SourceRefId = payment.Id,
            IsPosted = true,
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        // ===== BROKER (dalal) model — kis tarah ki settlement hai? =====
        // Allocated bills SALES hain to buyer↔supplier DIRECT settle hua — broker cash hold
        // nahi karta. Is liye sales settlement me KOI cash/bank line NAHI:
        //     Dr SUPPLIER ledger = amount   (supplier ka receivable/balance ghata)
        //     Cr BUYER ledger    = amount   (buyer ka payable ghata)
        // PURCHASE-side payments PURANE jaise: Dr Party / Cr Bank (broker apna paisa deta).
        // Multi-bill payment: har SALES bill ka per-bill (allocated) amount lo aur uske apne
        // supplier/buyer ledger par ek Dr-supplier/Cr-buyer pair banao.
        var allocBillIds = payment.Allocations.Select(a => a.BillId).Distinct().ToList();
        var allocByBill = payment.Allocations
            .GroupBy(a => a.BillId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Allocated));

        var allocBills = allocBillIds.Count > 0
            ? await _db.Bills
                .Where(b => allocBillIds.Contains(b.Id))
                .Select(b => new { b.Id, b.BillType, b.PartyId, b.BuyerPartyId })
                .ToListAsync()
            : new();

        var salesBills    = allocBills.Where(b => b.BillType == "sales").ToList();
        var purchaseBills = allocBills.Where(b => b.BillType != "sales").ToList();

        int order = 0;

        // ---------- SALES settlement (BROKER model): NO cash/bank — Dr Supplier / Cr Buyer per bill ----------
        // MoneyToAgency = true ho to ye skip — paisa agency ke cash/bank me aata hai (neeche bank-side branch).
        if (salesBills.Count > 0 && !payment.MoneyToAgency)
        {
            foreach (var b in salesBills)
            {
                var amt = allocByBill.GetValueOrDefault(b.Id, 0m);
                if (amt <= 0) continue;

                // Supplier ledger = bill.PartyId; Buyer ledger = bill.BuyerPartyId (fallback PartyId).
                var supplierLedgerId = await ResolvePartyLedgerId(b.PartyId, firmId)
                    ?? throw new InvalidOperationException("Sales bill ke supplier ka ledger nahi mila.");
                var buyerLedgerId = (b.BuyerPartyId.HasValue
                        ? await ResolvePartyLedgerId(b.BuyerPartyId.Value, firmId)
                        : null)
                    ?? supplierLedgerId;   // legacy sales bina buyer ke — same party dono taraf

                // Dr SUPPLIER = amount
                voucher.Lines.Add(new VoucherLine
                {
                    Id = Guid.NewGuid(), VoucherId = voucher.Id,
                    LedgerId = supplierLedgerId, DebitCredit = "Dr",
                    Amount = amt,
                    Narration = payment.ReferenceNo, SortOrder = order++
                });
                // Cr BUYER = amount
                voucher.Lines.Add(new VoucherLine
                {
                    Id = Guid.NewGuid(), VoucherId = voucher.Id,
                    LedgerId = buyerLedgerId, DebitCredit = "Cr",
                    Amount = amt,
                    Narration = payment.ReferenceNo, SortOrder = order++
                });
            }
        }

        // ---------- PURCHASE settlement (UNCHANGED): Dr/Cr Party vs Bank ----------
        // Purchase bills par payment = broker/firm apna paisa deta → cash/bank line lagti hai.
        // Pure on-account (koi allocation nahi) bhi yahin aata hai — purana behavior.
        var salesAllocated = salesBills.Sum(b => allocByBill.GetValueOrDefault(b.Id, 0m));
        var purchaseAmount = purchaseBills.Sum(b => allocByBill.GetValueOrDefault(b.Id, 0m));
        var unallocated = payment.Amount - salesAllocated - purchaseAmount;
        // Aadhat model: sales allocation bhi bank-side se jati hai (Dr Cash/Bank, Cr Buyer)
        var bankSideAmount = purchaseAmount
            + (payment.MoneyToAgency ? salesAllocated : 0m)
            + Math.Max(0m, unallocated);

        if (bankSideAmount > 0)
        {
            var bankLedger = payment.BankLedgerId
                ?? throw new InvalidOperationException(
                    "Is amount ka kuch hissa firm ke cash/bank se jata hai — pehle Accounting me Cash ya Bank ledger banao");

            // Party ledger: agar purchase bills hain to unka SUPPLIER (party_id),
            // warna (on-account) payment.PartyId.
            Guid partyId = payment.PartyId;
            var purchasePartyIds = purchaseBills.Select(b => b.PartyId).Distinct().ToList();
            if (purchasePartyIds.Count == 1) partyId = purchasePartyIds[0];

            var party = await _db.PartyProfiles
                .Where(p => p.Id == partyId)
                .Select(p => p.LedgerId).SingleAsync()
                ?? throw new InvalidOperationException("Party has no linked ledger");

            // Receipt: Dr Cash/Bank, Cr Party | Payment: Dr Party, Cr Cash/Bank
            var (drLedger, crLedger) = payment.PaymentType == "receipt"
                ? (bankLedger, party)
                : (party, bankLedger);

            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = drLedger, DebitCredit = "Dr",
                Amount = bankSideAmount,
                Narration = payment.ReferenceNo, SortOrder = order++
            });
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = crLedger, DebitCredit = "Cr",
                Amount = bankSideAmount,
                Narration = payment.ReferenceNo, SortOrder = order++
            });
        }

        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
        return voucher.Id;
    }

    // party.LedgerId resolve karo (bill ne isi ledger ko Dr/Cr kiya tha).
    private async Task<Guid?> ResolvePartyLedgerId(Guid partyId, Guid firmId)
    {
        return await _db.PartyProfiles
            .Where(p => p.Id == partyId && p.FirmId == firmId)
            .Select(p => p.LedgerId)
            .FirstOrDefaultAsync();
    }

    public async Task<List<BillListItemDto>> GetOutstandingBills(Guid partyId, Guid? supplierId = null)
    {
        // partyId BUYER ya SUPPLIER dono ho sakta hai (sales bill: PartyId=supplier, BuyerPartyId=buyer).
        // supplierId bhi diya ho to sirf US SUPPLIER-BUYER PAIR ke beech ke bills.
        var q = _db.Bills
            .Where(b => (b.PartyId == partyId || b.BuyerPartyId == partyId)
                     && b.Status != "paid" && b.Status != "cancelled");
        if (supplierId.HasValue && supplierId.Value != partyId)
            q = q.Where(b => b.PartyId == supplierId.Value);

        var bills = await q.OrderBy(b => b.BillDate).ToListAsync();

        // Har bill ka GR total (pending + approved) — GR AMT column me dikhane ke liye.
        // Receipt me toPay = taxable + tax − GR, aur payment save par allocation
        // (= toPay) bill.PaidAmount me add hota hai; approved GR pehle se PaidAmount me
        // fold hai, to PaidAmount = total ho jata hai → koi double-count nahi.
        var billIds = bills.Select(b => b.Id).ToList();
        var grByBill = await _db.GoodsReturns
            .Where(g => g.OriginalBillId != null && billIds.Contains(g.OriginalBillId.Value)
                     && g.Status != "rejected" && g.Status != "cancelled")
            .GroupBy(g => g.OriginalBillId!.Value)
            .Select(g => new { BillId = g.Key, Amt = g.Sum(x => x.TotalReturnAmount) })
            .ToDictionaryAsync(x => x.BillId, x => x.Amt);

        return bills.Select(b => new BillListItemDto(
            b.Id, b.BillType, b.BillNo, b.BillDate, b.PartyId, "",
            null, b.BuyerPartyId, null, null, b.PoNumber,
            b.EwayBillNo, b.EwayBillDate, b.LrNo,
            b.Total, b.PaidAmount, b.Status, b.VoucherId, b.AiExtracted,
            null, false, b.CreatedAt,
            b.TaxableAmount,
            b.Cgst + b.Sgst + b.Igst,
            grByBill.GetValueOrDefault(b.Id, 0m))).ToList();
    }

    public async Task Delete(Guid id)
    {
        var p = await _db.Payments.Include(x => x.Allocations).SingleAsync(x => x.Id == id);

        // IDEMPOTENCY GUARD: if already soft-deleted, do nothing. Without this, a second
        // Delete call would subtract the allocations again and drive bill.PaidAmount
        // negative (flipping status to "partial"/"pending" incorrectly).
        if (p.DeletedAt != null) return;

        using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            // Reverse allocations on bills (clamped at 0 to guard against prior drift)
            foreach (var a in p.Allocations)
            {
                var bill = await _db.Bills.SingleAsync(b => b.Id == a.BillId);
                bill.PaidAmount = Math.Max(0, bill.PaidAmount - a.Allocated);
                bill.Status = bill.PaidAmount >= bill.Total ? "paid"
                              : bill.PaidAmount > 0 ? "partial" : "pending";
            }

            p.DeletedAt = DateTimeOffset.UtcNow;

            if (p.VoucherId.HasValue)
            {
                var v = await _db.Vouchers.SingleAsync(x => x.Id == p.VoucherId.Value);
                v.DeletedAt = DateTimeOffset.UtcNow;
            }

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }
    }

    private async Task<string> GeneratePaymentNo(string type, Guid firmId, Guid branchId)
    {
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                  ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                  ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");
        // Short format: JPR-R1 (Receipt) / JPR-P1 (Payment)
        var prefix = type == "receipt" ? $"{branch.Code}-R" : $"{branch.Code}-P";

        // Race-safe atomic counter (platform.voucher_counters) — same as BillService.
        // Pehle "CountAsync(...) + 1" tha jo concurrent inserts par DUPLICATE payment_no de sakta tha.
        var fyYear = GetFyStart().Year;
        var next = await ReserveCounterAsync(firmId, branchId, $"payment.{type}", fyYear);

        // Safety net: legacy data ke saath agar counter peeche ho to existing no skip karo.
        string candidate;
        do
        {
            candidate = $"{prefix}{next}";
            var exists = await _db.Payments.IgnoreQueryFilters()
                .AnyAsync(p => p.FirmId == firmId && p.BranchId == branchId
                    && p.PaymentType == type && p.PaymentNo == candidate);
            if (!exists) break;
            next = await ReserveCounterAsync(firmId, branchId, $"payment.{type}", fyYear);
        } while (true);
        return candidate;
    }

    private async Task<string> GenerateVoucherNoForPayment(string voucherType, Guid branchId, Guid firmId)
    {
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                  ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                  ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");
        var prefix = branch.VoucherPrefix ?? $"{branch.Code}-V-";
        var typeCode = voucherType == "receipt" ? "R" : "P";

        // Race-safe atomic counter — SAME key family as BillService ("voucher.{type}")
        // taaki receipt/payment vouchers ka sequence bhi share-consistent rahe.
        var fyYear = GetFyStart().Year;
        var next = await ReserveCounterAsync(firmId, branchId, $"voucher.{voucherType}", fyYear);
        return $"{prefix}{typeCode}{next:D4}";
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

    private DateOnly GetFyStart()
    {
        var t = DateTime.Now;
        return t.Month >= 4 ? new DateOnly(t.Year, 4, 1) : new DateOnly(t.Year - 1, 4, 1);
    }
}
