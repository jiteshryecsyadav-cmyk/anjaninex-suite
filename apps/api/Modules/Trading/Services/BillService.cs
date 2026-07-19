using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;
using Namokara.Api.Modules.Trading.Entities;
using Namokara.Api.Modules.Platform.Entities;   // Notification (credit-limit alert)

namespace Namokara.Api.Modules.Trading.Services;

// =============================================================================
// DTOs
// =============================================================================
public record BillLineDto(
    Guid? Id,
    Guid? ItemId,
    string ItemName,
    string? HsnSac,
    decimal Qty,
    string? Unit,
    decimal Rate,
    decimal DiscountPct,
    decimal TaxRate,
    decimal TaxableAmount,
    decimal TotalAmount,
    string? Description = null);

public record BillListItemDto(
    Guid Id,
    string BillType,
    string BillNo,
    DateOnly BillDate,
    Guid PartyId,
    string PartyName,           // PartyId's name (= supplier OR legacy-buyer for old sales bills)
    string? PartyGst,
    Guid? BuyerPartyId,
    string? BuyerName,          // BuyerPartyId's name (only set for new bills with separate buyer)
    string? BuyerGst,
    string? PoNumber,
    string? EwayBillNo,         // For search + display
    DateOnly? EwayBillDate,     // migration 41 — e-Way bill date
    string? LrNo,
    decimal Total,
    decimal PaidAmount,
    string Status,
    Guid? VoucherId,
    bool AiExtracted,
    string? PreparedBy = null,
    bool IsDeleted = false,             // numbering gap samjhane ke liye list me DELETED tag
    DateTimeOffset? CreatedAt = null,   // entry kab punch hui (time ke saath)
    decimal TaxableAmount = 0,          // payment receipt me NET AMT ke liye
    decimal TaxAmount = 0,              // CGST+SGST+IGST
    decimal GrAmount = 0,               // is bill ka ASLI goods-return total (0 = koi GR nahi)
    decimal AdvanceExtra = 0,           // buyer ne bill se ZYADA diya — extra/advance amount
    string? SupplierBillNo = null,      // supplier ka original invoice no — list me dikhane ke liye
    string? PartyGroup = null,          // supplier/party ka group name (sister firms)
    string? BuyerGroup = null,          // buyer ka group name
    decimal EntitledDisc = 0);          // buyer group ka banta-hua disc% (bill date ke hisaab se) — payment/commission popup ke liye

public record BillDetailDto(
    Guid Id,
    string BillType,
    string BillNo,
    DateOnly BillDate,
    Guid PartyId,
    string PartyName,
    string? InvoiceType,
    string? PoNumber,
    DateOnly? DeliveryDate,
    decimal Subtotal,
    decimal Discount,
    decimal TaxableAmount,
    decimal Cgst,
    decimal Sgst,
    decimal Igst,
    decimal RoundOff,
    decimal Total,
    decimal PaidAmount,
    string Status,
    Guid? VoucherId,
    string? VoucherNo,
    string? Notes,
    List<BillLineDto> Lines,
    string? PreparedBy = null,
    Guid? BuyerPartyId = null,    // BUYER (alag party) — edit form me load ke liye
    string? BuyerName = null,
    string? BuyerGst = null,
    string? PartyGst = null,      // SUPPLIER ka GST
    string? SupplierBillNo = null,  // supplier ka invoice no — edit me dikhane ke liye
    // Transport / E-Way — DB columns (Bill entity). Edit form ab notes-regex ke bajaye seedhe inhe load karta hai.
    string? EwayBillNo = null,
    DateOnly? EwayBillDate = null,
    Guid? TransporterId = null,
    string? LrNo = null,
    DateOnly? LrDate = null);

public record CreateBillDto(
    string BillType,
    DateOnly BillDate,
    Guid PartyId,                  // SUPPLIER for sales/purchase (goods provider)
    Guid? BuyerPartyId,            // BUYER (customer) — separate party for commission flow
    string? InvoiceType,
    string? PoNumber,
    string? SupplierBillNo,        // Supplier's invoice no (for duplicate detection)
    DateOnly? DeliveryDate,
    decimal Discount,
    decimal RoundOff,
    string? Notes,
    // Transport / E-Way (migration 19)
    string? EwayBillNo,
    DateOnly? EwayBillDate,        // migration 41 — e-Way bill date
    Guid? TransporterId,
    string? LrNo,
    DateOnly? LrDate,
    List<BillLineDto> Lines,
    string? CdType = "before",     // before = GST se pehle discount | after = GST ke baad
    Guid? OrderId = null,          // jis order se bill bana — wo auto-BILLED hoga
    decimal OtherCharges = 0,      // Sweet/L.S + Interest + Insurance − Bank Charge (net me judte hain)
    decimal FoldAmt = 0);          // Fold Less — Discount me shaamil NAHI, alag bhejo (migration 88)

public static class BillMath
{
    /// <summary>
    /// GST kis base par lage — frontend ke cdTaxFactor se BILKUL match karta hai.
    ///   CD "before" → fold + discount dono tax base se ghatte hain
    ///   CD "after"  → sirf FOLD ghatta hai (discount GST ke baad lagta hai)
    /// Dono jagah (Create + Update) yahi method use ho, taaki formula kabhi alag na ho.
    /// </summary>
    public static decimal ApplyCdTaxFactor(decimal totalTax, decimal subtotal,
                                           decimal discount, decimal foldAmt, string? cdType)
    {
        if (subtotal <= 0 || totalTax == 0) return totalTax;
        var deduction = cdType == "after" ? foldAmt : foldAmt + discount;
        if (deduction <= 0) return totalTax;
        var factor = Math.Max(0m, (subtotal - deduction) / subtotal);
        return Math.Round(totalTax * factor, 2, MidpointRounding.AwayFromZero);
    }
}

public class BillDuplicateException : Exception
{
    public Guid ExistingBillId { get; }
    public string ExistingBillNo { get; }
    public DateOnly BillDate { get; }
    public decimal Total { get; }
    public string Status { get; }

    public BillDuplicateException(Guid id, string billNo, DateOnly date, decimal total, string status)
        : base($"Duplicate bill: {billNo} already exists with same supplier + bill no + date.")
    { ExistingBillId = id; ExistingBillNo = billNo; BillDate = date; Total = total; Status = status; }
}

// =============================================================================
// Service
// =============================================================================
public interface IBillService
{
    Task<(List<BillListItemDto> items, int total)> List(string? type, DateOnly? from, DateOnly? to, Guid? partyId, string? status, int page, int size);
    Task<BillDetailDto?> Get(Guid id);
    Task<BillDetailDto> Create(CreateBillDto dto, Guid firmId, Guid branchId, Guid userId);
    Task<BillDetailDto?> Update(Guid id, CreateBillDto dto, Guid firmId, Guid userId);
    Task Delete(Guid id);
    Task<string> GenerateBillNo(string billType, Guid firmId, Guid branchId);
}

public class BillService : IBillService
{
    private readonly AppDbContext _db;
    private readonly ILogger<BillService> _log;

    public BillService(AppDbContext db, ILogger<BillService> log)
    {
        _db = db;
        _log = log;
    }

    public async Task<(List<BillListItemDto> items, int total)> List(
        string? type, DateOnly? from, DateOnly? to, Guid? partyId, string? status, int page, int size)
    {
        // Deleted bills BHI dikhao (DELETED tag ke saath) — numbering gap clear rahe
        var query = _db.Bills.IgnoreQueryFilters().AsQueryable();
        if (!string.IsNullOrEmpty(type))    query = query.Where(b => b.BillType == type);
        if (from.HasValue)                  query = query.Where(b => b.BillDate >= from);
        if (to.HasValue)                    query = query.Where(b => b.BillDate <= to);
        if (partyId.HasValue)               query = query.Where(b => b.PartyId == partyId);
        if (!string.IsNullOrEmpty(status))  query = query.Where(b => b.Status == status);

        var total = await query.CountAsync();

        var rawItems = await query
            .OrderByDescending(b => b.BillDate).ThenByDescending(b => b.CreatedAt)
            .Skip((page - 1) * size).Take(size)
            .ToListAsync();

        // Collect both supplier (partyId) and buyer (buyerPartyId) ids
        var allPartyIds = rawItems.Select(b => b.PartyId)
            .Concat(rawItems.Where(b => b.BuyerPartyId.HasValue).Select(b => b.BuyerPartyId!.Value))
            .Distinct().ToList();
        var parties = await (from p in _db.PartyProfiles
                             join c in _db.Contacts on p.ContactId equals c.Id
                             where allPartyIds.Contains(p.Id)
                             select new { p.Id, c.DisplayName, c.GstNumber, c.GroupName })
                            .ToDictionaryAsync(x => x.Id, x => new { x.DisplayName, x.GstNumber, x.GroupName });

        // SUPPLIER ka committed PURCHASE DISC % (party pe ho to wo, warna uske group ka).
        // Recoverable = purchase disc − bill pe diya sales disc → agency commission me claim karti hai.
        // ⚠️ Ye ek SAJAWAT (enrichment) query hai — bill list ka ASLI data ise bina bhi poora hai.
        // Isliye try/catch me hai: agar ye fail ho to sirf disc% 0 dikhega, POORI LIST GAYAB NAHI hogi.
        // (Ek baar isi tarah ki query fail hui thi aur users ko laga saara data delete ho gaya.)
        var purchDisc = new Dictionary<Guid, decimal>();
        try
        {
        if (allPartyIds.Count > 0)
        {
            var gconn = (NpgsqlConnection)_db.Database.GetDbConnection();
            if (gconn.State != ConnectionState.Open) await gconn.OpenAsync();
            await using var gcmd = new NpgsqlCommand(@"
                SELECT pp.id,
                       COALESCE(c.purchase_disc_pct, g.purchase_disc_pct, 0) AS pdisc
                FROM trading.party_profiles pp
                JOIN core.contacts c ON c.id = pp.contact_id
                LEFT JOIN core.party_groups g
                       ON g.firm_id = c.firm_id AND g.name = c.group_name
                WHERE pp.id = ANY(@ids)", gconn);
            gcmd.Parameters.AddWithValue("ids", allPartyIds.ToArray());
            await using var gr = await gcmd.ExecuteReaderAsync();
            while (await gr.ReadAsync())
                purchDisc[gr.GetGuid(0)] = gr.GetDecimal(1);
        }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Purchase-disc lookup fail hua — bill list bina disc% ke bheji ja rahi hai");
            purchDisc.Clear();
        }

        // Prepared by — login user (created_by) ka naam
        var creatorIds = rawItems.Select(b => b.CreatedBy).Distinct().ToList();
        var creators = await _db.Users.AsNoTracking()
            .Where(u => creatorIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        // ADVANCE (Extra Received) — bill se jude payments me received > allocated ho to extra
        var listBillIds = rawItems.Select(b => b.Id).ToList();
        var allocRows = await _db.PaymentAllocations.AsNoTracking()
            .Join(_db.Payments.AsNoTracking(), a => a.PaymentId, p => p.Id,
                  (a, p) => new { a.BillId, a.PaymentId, a.Allocated, p.Amount })
            .Where(x => listBillIds.Contains(x.BillId))
            .ToListAsync();
        var extraByPayment = allocRows.GroupBy(x => x.PaymentId)
            .ToDictionary(g => g.Key, g => g.First().Amount - g.Sum(x => x.Allocated));
        var advanceByBill = allocRows.GroupBy(x => x.BillId)
            .ToDictionary(g => g.Key,
                          g => g.Select(x => extraByPayment.GetValueOrDefault(x.PaymentId, 0m))
                                .Where(e => e > 0.01m).Sum());

        var items = rawItems.Select(b =>
        {
            var supplier = parties.GetValueOrDefault(b.PartyId);
            var buyer = b.BuyerPartyId.HasValue ? parties.GetValueOrDefault(b.BuyerPartyId.Value) : null;
            // Supplier ka committed % − bill pe diya gaya sales disc % = recoverable %
            // NOTE: denominator SUBTOTAL hai (discount se PEHLE ka gross), TaxableAmount nahi —
            // user bhi disc% isi base par daalta hai. TaxableAmount lene se % zyada nikalta tha
            // aur agency har bill par kam recover karti thi.
            var pDisc = purchDisc.GetValueOrDefault(b.PartyId, 0m);
            var discBase = b.Subtotal - b.FoldAmt;   // fold gross me se pehle katta hai
            var salesDisc = discBase > 0
                ? Math.Round(b.Discount / discBase * 100m, 2, MidpointRounding.AwayFromZero)
                : 0m;
            var entDisc = Math.Max(0m, pDisc - salesDisc);   // = balance disc, commission me claim
            return new BillListItemDto(
                b.Id, b.BillType, b.BillNo, b.BillDate, b.PartyId,
                supplier?.DisplayName ?? "—",
                supplier?.GstNumber,
                b.BuyerPartyId,
                buyer?.DisplayName,
                buyer?.GstNumber,
                b.PoNumber,
                b.EwayBillNo,
                b.EwayBillDate,
                b.LrNo,
                b.Total, b.PaidAmount, b.Status, b.VoucherId, b.AiExtracted,
                creators.GetValueOrDefault(b.CreatedBy),
                b.DeletedAt != null,
                b.CreatedAt,
                TaxableAmount: b.TaxableAmount,
                TaxAmount: b.Cgst + b.Sgst + b.Igst,
                AdvanceExtra: advanceByBill.GetValueOrDefault(b.Id, 0m),
                SupplierBillNo: b.SupplierBillNo,
                PartyGroup: supplier?.GroupName,
                BuyerGroup: buyer?.GroupName,
                EntitledDisc: entDisc);
        }).ToList();

        return (items, total);
    }

    public async Task<BillDetailDto?> Get(Guid id)
    {
        var bill = await _db.Bills
            .Include(b => b.Lines)
            .FirstOrDefaultAsync(b => b.Id == id);
        if (bill is null) return null;

        var party = await (from p in _db.PartyProfiles
                           join c in _db.Contacts on p.ContactId equals c.Id
                           where p.Id == bill.PartyId
                           select new { Name = c.DisplayName, c.GstNumber }).FirstOrDefaultAsync();

        // BUYER (alag party) — edit form me load karne ke liye
        var buyer = bill.BuyerPartyId.HasValue
            ? await (from p in _db.PartyProfiles
                     join c in _db.Contacts on p.ContactId equals c.Id
                     where p.Id == bill.BuyerPartyId.Value
                     select new { Name = c.DisplayName, c.GstNumber }).FirstOrDefaultAsync()
            : null;

        string? voucherNo = null;
        if (bill.VoucherId.HasValue)
        {
            voucherNo = await _db.Vouchers
                .Where(v => v.Id == bill.VoucherId.Value)
                .Select(v => v.VoucherNo).FirstOrDefaultAsync();
        }

        var preparedBy = await _db.Users.AsNoTracking()
            .Where(u => u.Id == bill.CreatedBy)
            .Select(u => u.FullName)
            .FirstOrDefaultAsync();

        return new BillDetailDto(
            bill.Id, bill.BillType, bill.BillNo, bill.BillDate,
            bill.PartyId, party?.Name ?? "",
            bill.InvoiceType, bill.PoNumber, bill.DeliveryDate,
            bill.Subtotal, bill.Discount, bill.TaxableAmount,
            bill.Cgst, bill.Sgst, bill.Igst, bill.RoundOff,
            bill.Total, bill.PaidAmount, bill.Status,
            bill.VoucherId, voucherNo, bill.Notes,
            bill.Lines.OrderBy(l => l.SortOrder).Select(l => new BillLineDto(
                l.Id, l.ItemId, l.ItemName, l.HsnSac,
                l.Qty, l.Unit, l.Rate, l.DiscountPct, l.TaxRate,
                l.TaxableAmount, l.TotalAmount, l.Description)).ToList(),
            preparedBy,
            bill.BuyerPartyId,
            buyer?.Name,
            buyer?.GstNumber,
            party?.GstNumber,
            bill.SupplierBillNo,
            bill.EwayBillNo,
            bill.EwayBillDate,
            bill.TransporterId,
            bill.LrNo,
            bill.LrDate);
    }

    public async Task<BillDetailDto> Create(CreateBillDto dto, Guid firmId, Guid branchId, Guid userId)
    {
        if (dto.Lines.Count == 0)
            throw new ArgumentException("Bill must have at least one line item");

        if (dto.BillType != "sales" && dto.BillType != "purchase")
            throw new ArgumentException($"Invalid bill type: {dto.BillType}. Must be 'sales' or 'purchase'.");

        // MANDATORY: Supplier Bill No required (audit trail + duplicate detection both need it)
        var supBillNo = dto.SupplierBillNo?.Trim();
        if (string.IsNullOrEmpty(supBillNo))
            throw new ArgumentException(
                "Supplier Bill No is required. Supplier ke original invoice ka number daalo (e.g. 'INV-2026/045').");

        // STRICT DUPLICATE CHECK — same firm + same supplier + same supplier_bill_no + same date
        // If user accidentally double-clicks Save OR re-enters the same bill, block it.
        var existing = await _db.Bills
            .Where(b => b.FirmId == firmId
                     && b.PartyId == dto.PartyId
                     && b.SupplierBillNo == supBillNo
                     && b.BillDate == dto.BillDate)
            .Select(b => new { b.Id, b.BillNo, b.BillDate, b.Total, b.Status })
            .FirstOrDefaultAsync();

        if (existing != null)
            throw new BillDuplicateException(
                existing.Id, existing.BillNo, existing.BillDate, existing.Total, existing.Status);

        using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            // Determine inter-state vs intra-state by comparing GST state codes
            // (first 2 digits of GSTIN; e.g., '08' = Rajasthan, '07' = Delhi)
            var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                  ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                  ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");
            var party = await _db.PartyProfiles
                .Where(p => p.Id == dto.PartyId)
                .Select(p => new { p.LedgerId, p.ContactId })
                .SingleAsync();
            var partyContact = await _db.Contacts
                .Where(c => c.Id == party.ContactId)
                .Select(c => new { c.GstNumber })
                .SingleAsync();

            var branchStateCode = ResolveBranchStateCode(branch);
            var partyStateCode = string.IsNullOrEmpty(partyContact.GstNumber) ? null
                : partyContact.GstNumber.Substring(0, 2);

            var isInterState = !string.IsNullOrEmpty(branchStateCode)
                && !string.IsNullOrEmpty(partyStateCode)
                && branchStateCode != partyStateCode;

            // Calculate totals — CD 2 type:
            //   before = GST se pehle discount → tax discounted base par (proportional)
            //   after  = GST poore par → discount total (incl GST) par
            var subtotal = dto.Lines.Sum(l => l.TaxableAmount);
            var totalTax = BillMath.ApplyCdTaxFactor(
                dto.Lines.Sum(l => l.TotalAmount - l.TaxableAmount),
                subtotal, dto.Discount, dto.FoldAmt, dto.CdType);
            // OtherCharges = Sweet/L.S + Interest + Insurance − Bank Charge (frontend jaisa hi)
            var total = subtotal + totalTax - dto.FoldAmt - dto.Discount + dto.OtherCharges + dto.RoundOff;

            // Correct Indian GST split: intra-state → CGST + SGST (50/50), inter-state → IGST (full)
            decimal cgst = 0, sgst = 0, igst = 0;
            if (isInterState)
            {
                igst = totalTax;
            }
            else
            {
                cgst = totalTax / 2m;
                sgst = totalTax / 2m;
            }

            var billNo = await GenerateBillNo(dto.BillType, firmId, branchId);
            var bill = new Bill
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                BranchId = branchId,
                BillType = dto.BillType,
                BillNo = billNo,
                BillDate = dto.BillDate,
                PartyId = dto.PartyId,
                BuyerPartyId = dto.BuyerPartyId,
                EwayBillNo = dto.EwayBillNo,
                EwayBillDate = dto.EwayBillDate,
                TransporterId = dto.TransporterId,
                LrNo = dto.LrNo,
                LrDate = dto.LrDate,
                SupplierBillNo = supBillNo,
                InvoiceType = dto.InvoiceType,
                PoNumber = dto.PoNumber,
                DeliveryDate = dto.DeliveryDate,
                Subtotal = subtotal,
                Discount = dto.Discount,
                FoldAmt = dto.FoldAmt,
                TaxableAmount = subtotal - dto.FoldAmt - dto.Discount,
                Cgst = cgst,
                Sgst = sgst,
                Igst = igst,
                RoundOff = dto.RoundOff,
                Total = total,
                PaidAmount = 0,
                Status = "pending",
                Notes = dto.Notes,
                CreatedBy = userId,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            int order = 0;
            foreach (var line in dto.Lines)
            {
                bill.Lines.Add(new BillLine
                {
                    Id = Guid.NewGuid(),
                    BillId = bill.Id,
                    ItemId = line.ItemId,
                    ItemName = line.ItemName,
                    Description = line.Description,
                    HsnSac = line.HsnSac,
                    Qty = line.Qty,
                    Unit = line.Unit,
                    Rate = line.Rate,
                    DiscountPct = line.DiscountPct,
                    TaxRate = line.TaxRate,
                    TaxableAmount = line.TaxableAmount,
                    TotalAmount = line.TotalAmount,
                    SortOrder = order++
                });
            }

            // ===== ORDER ko AUTO-BILLED mark karo (jis order se ye bill bana) =====
            Guid? linkedOrderId = dto.OrderId;
            if (linkedOrderId == null && !string.IsNullOrWhiteSpace(dto.PoNumber))
            {
                linkedOrderId = await _db.Orders
                    .Where(o => o.FirmId == firmId && o.OrderNo == dto.PoNumber.Trim())
                    .Select(o => (Guid?)o.Id)
                    .FirstOrDefaultAsync();
            }
            if (linkedOrderId != null)
            {
                bill.OrderId = linkedOrderId;
                var linkedOrder = await _db.Orders
                    .FirstOrDefaultAsync(o => o.Id == linkedOrderId.Value && o.FirmId == firmId);
                if (linkedOrder != null && linkedOrder.Status != "billed" && linkedOrder.Status != "cancelled")
                {
                    linkedOrder.Status = "billed";
                    linkedOrder.UpdatedAt = DateTimeOffset.UtcNow;
                }
            }

            _db.Bills.Add(bill);
            await _db.SaveChangesAsync();

            // ===== AUTO-POST TO ACCOUNTING =====
            // Sales:    Dr BUYER (debtor)   Cr Sales   Cr CGST+SGST (or IGST)
            // Purchase: Cr SUPPLIER (creditor)   Dr Purchase   Dr CGST+SGST (or IGST) [ITC]
            //
            // KHATA FIX: broker model me ek bill par DO party hoti hain —
            //   party_id        = SUPPLIER (jisne maal bheja)
            //   buyer_party_id  = BUYER    (jisne kharida — customer)
            // SALES bill ka DEBTOR (receivable) BUYER hai, supplier nahi. Pehle yahan
            // hamesha party_id (supplier) ka ledger Dr hota tha → buyer khata khaali rehta
            // aur supplier ke khate me galat sale chadh jaati. Ab:
            //   sales    → BROKER 2-line: Dr BUYER (Sundry Debtors), Cr SUPPLIER (Sundry Creditors)
            //   purchase → supplier ka ledger (Sundry Creditors)  [UNCHANGED]
            Guid voucherId;
            if (dto.BillType == "sales")
            {
                // BROKER model — dono ledger chahiye (buyer Dr + supplier Cr).
                Guid? buyerLedgerId = null, supplierLedgerId = null;
                if (dto.BuyerPartyId.HasValue)
                {
                    buyerLedgerId    = await GetOrCreatePartyLedgerAsync(dto.BuyerPartyId.Value, firmId, "Sundry Debtors");
                    supplierLedgerId = await GetOrCreatePartyLedgerAsync(dto.PartyId, firmId, "Sundry Creditors");
                }
                // Legacy fallback (bina buyer ke sales): party_id ka ledger Dr / Cr Sales.
                var fallbackLedgerId = party.LedgerId
                    ?? await GetOrCreatePartyLedgerAsync(dto.PartyId, firmId, "Sundry Debtors");
                voucherId = await PostSalesVoucherForBill(
                    bill, buyerLedgerId, supplierLedgerId, fallbackLedgerId, firmId, branchId, userId);
            }
            else
            {
                // PURCHASE — party_id (supplier) ka ledger Cr. [UNCHANGED]
                var partyLedgerId = party.LedgerId
                    ?? await GetOrCreatePartyLedgerAsync(dto.PartyId, firmId, "Sundry Creditors");
                voucherId = await PostPurchaseVoucherForBill(bill, partyLedgerId, firmId, branchId, userId);
            }

            bill.VoucherId = voucherId;
            await _db.SaveChangesAsync();

            await tx.CommitAsync();
            _log.LogInformation("Bill {No} ({Type}) created (₹{Total}, inter-state={InterState}) → voucher {VoucherId}",
                billNo, dto.BillType, total, isInterState, voucherId);

            return (await Get(bill.Id))!;
        }
        catch
        {
            // SAFE rollback — if the transaction is already in a failed state, suppress the
            // rollback exception so the ORIGINAL exception (the real cause) propagates up.
            try { await tx.RollbackAsync(); } catch { /* original exception is what matters */ }
            throw;
        }
    }

    // =========================================================================
    // IN-PLACE UPDATE — same Bill (Id + BillNo same), lines replace, voucher re-post.
    // (Pehle edit = delete+recreate tha → number badalta + duplicate-check phasta tha.)
    // =========================================================================
    public async Task<BillDetailDto?> Update(Guid id, CreateBillDto dto, Guid firmId, Guid userId)
    {
        var bill = await _db.Bills.Include(b => b.Lines).FirstOrDefaultAsync(b => b.Id == id && b.FirmId == firmId);
        if (bill == null) return null;

        if (dto.Lines.Count == 0)
            throw new ArgumentException("Bill must have at least one line item");
        if (dto.BillType != "sales" && dto.BillType != "purchase")
            throw new ArgumentException($"Invalid bill type: {dto.BillType}. Must be 'sales' or 'purchase'.");

        // BillType edit par IMMUTABLE — BillNo series original type ke liye mint hui thi
        // (sales/purchase ka alag counter). Type badalne se number-series + voucher mismatch
        // ho jaata. Sales↔Purchase ke liye purana delete kar ke naya bill banao.
        if (dto.BillType != bill.BillType)
            throw new ArgumentException(
                $"Bill type edit nahi ho sakta (ye '{bill.BillType}' bill hai). " +
                "Type badalne ke liye is bill ko delete kar ke naya banao.");

        var supBillNo = dto.SupplierBillNo?.Trim();
        if (string.IsNullOrEmpty(supBillNo))
            throw new ArgumentException("Supplier Bill No is required.");

        // Duplicate check — KHUD ko chhod ke (b.Id != id) — warna apni hi edit block ho jaati
        var dup = await _db.Bills.AnyAsync(b => b.Id != id && b.FirmId == firmId
            && b.PartyId == dto.PartyId && b.SupplierBillNo == supBillNo && b.BillDate == dto.BillDate);
        if (dup)
            throw new ArgumentException("Same supplier + bill no + date par doosra bill pehle se hai.");

        using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var branch = await _db.Branches.SingleAsync(b => b.Id == bill.BranchId);
            var party = await _db.PartyProfiles
                .Where(p => p.Id == dto.PartyId)
                .Select(p => new { p.LedgerId, p.ContactId })
                .SingleAsync();
            var partyContact = await _db.Contacts
                .Where(c => c.Id == party.ContactId).Select(c => new { c.GstNumber }).SingleAsync();

            var branchStateCode = ResolveBranchStateCode(branch);
            var partyStateCode = string.IsNullOrEmpty(partyContact.GstNumber) ? null : partyContact.GstNumber.Substring(0, 2);
            var isInterState = !string.IsNullOrEmpty(branchStateCode) && !string.IsNullOrEmpty(partyStateCode)
                && branchStateCode != partyStateCode;

            var subtotal = dto.Lines.Sum(l => l.TaxableAmount);
            var totalTax = BillMath.ApplyCdTaxFactor(
                dto.Lines.Sum(l => l.TotalAmount - l.TaxableAmount),
                subtotal, dto.Discount, dto.FoldAmt, dto.CdType);
            var total = subtotal + totalTax - dto.FoldAmt - dto.Discount + dto.OtherCharges + dto.RoundOff;
            decimal cgst = 0, sgst = 0, igst = 0;
            if (isInterState) igst = totalTax; else { cgst = totalTax / 2m; sgst = totalTax / 2m; }

            // Scalar update — Id + BillNo + CreatedBy/CreatedAt waise ke waise
            bill.BillType = dto.BillType;
            bill.BillDate = dto.BillDate;
            bill.PartyId = dto.PartyId;
            bill.BuyerPartyId = dto.BuyerPartyId;
            bill.EwayBillNo = dto.EwayBillNo;
            bill.EwayBillDate = dto.EwayBillDate;
            bill.TransporterId = dto.TransporterId;
            bill.LrNo = dto.LrNo;
            bill.LrDate = dto.LrDate;
            bill.SupplierBillNo = supBillNo;
            bill.InvoiceType = dto.InvoiceType;
            bill.PoNumber = dto.PoNumber;
            bill.DeliveryDate = dto.DeliveryDate;
            bill.Subtotal = subtotal;
            bill.Discount = dto.Discount;
            bill.FoldAmt = dto.FoldAmt;
            bill.TaxableAmount = subtotal - dto.FoldAmt - dto.Discount;
            bill.Cgst = cgst; bill.Sgst = sgst; bill.Igst = igst;
            bill.RoundOff = dto.RoundOff;
            bill.Total = total;
            bill.Notes = dto.Notes;
            bill.UpdatedAt = DateTimeOffset.UtcNow;

            // Lines replace
            _db.BillLines.RemoveRange(bill.Lines);
            int order = 0;
            var newLines = dto.Lines.Select(line => new BillLine
            {
                Id = Guid.NewGuid(), BillId = bill.Id, ItemId = line.ItemId, ItemName = line.ItemName,
                Description = line.Description,
                HsnSac = line.HsnSac, Qty = line.Qty, Unit = line.Unit, Rate = line.Rate,
                DiscountPct = line.DiscountPct, TaxRate = line.TaxRate,
                TaxableAmount = line.TaxableAmount, TotalAmount = line.TotalAmount, SortOrder = order++
            }).ToList();
            _db.BillLines.AddRange(newLines);

            // Purana voucher hatao (cascade lines), naya post karo — same bill number par
            if (bill.VoucherId.HasValue)
            {
                var oldV = await _db.Vouchers.FirstOrDefaultAsync(v => v.Id == bill.VoucherId.Value);
                if (oldV != null) _db.Vouchers.Remove(oldV);
                bill.VoucherId = null;
            }
            await _db.SaveChangesAsync();

            // ===== BROKER model (same rule as AddBill) =====
            //   sales    → 2-line: Dr BUYER (Sundry Debtors), Cr SUPPLIER (Sundry Creditors)
            //   purchase → SUPPLIER (party_id) ka ledger (Sundry Creditors)  [UNCHANGED]
            Guid voucherId;
            if (dto.BillType == "sales")
            {
                Guid? buyerLedgerId = null, supplierLedgerId = null;
                if (dto.BuyerPartyId.HasValue)
                {
                    buyerLedgerId    = await GetOrCreatePartyLedgerAsync(dto.BuyerPartyId.Value, firmId, "Sundry Debtors");
                    supplierLedgerId = await GetOrCreatePartyLedgerAsync(dto.PartyId, firmId, "Sundry Creditors");
                }
                var fallbackLedgerId = party.LedgerId
                    ?? await GetOrCreatePartyLedgerAsync(dto.PartyId, firmId, "Sundry Debtors");
                voucherId = await PostSalesVoucherForBill(
                    bill, buyerLedgerId, supplierLedgerId, fallbackLedgerId, firmId, bill.BranchId, userId);
            }
            else
            {
                var partyLedgerId = party.LedgerId ?? throw new InvalidOperationException(
                    "Is party ka ledger nahi mila. Pehle Chart of Accounts initialize karein.");
                voucherId = await PostPurchaseVoucherForBill(bill, partyLedgerId, firmId, bill.BranchId, userId);
            }
            bill.VoucherId = voucherId;
            await _db.SaveChangesAsync();

            await tx.CommitAsync();

            // Credit limit cross hua to firm ko bell-notification (non-critical —
            // bill commit ho chuka, notification fail ho to bhi bill safe rahe).
            try { await CheckCreditLimitAndNotifyAsync(firmId, dto.PartyId, dto.BuyerPartyId); }
            catch { /* notification optional — ignore */ }

            return await Get(bill.Id);
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }
    }

    /// <summary>
    /// Branch ka GST state code robustly nikaalo (inter-state vs intra-state decide karne ke liye):
    ///   1. branch.GstStateCode (agar set hai)
    ///   2. branch.State agar khud GSTIN/2-digit code jaisa hai (legacy data)
    ///   3. branch.State NAME ("Rajasthan") → GST state code map se
    /// Pehle yahan sirf ExtractStateCodeFromGst(branch.State) tha jo NAME ke liye hamesha null
    /// deta tha → isInterState hamesha false → inter-state par bhi galat CGST+SGST lagta tha.
    /// </summary>
    private static string? ResolveBranchStateCode(Namokara.Api.Modules.Core.Entities.Branch branch)
    {
        if (!string.IsNullOrWhiteSpace(branch.GstStateCode))
            return branch.GstStateCode.Trim();

        var state = branch.State?.Trim();
        if (string.IsNullOrEmpty(state)) return null;

        // 2-digit numeric code direct diya ho ("08")
        if (state.Length == 2 && char.IsDigit(state[0]) && char.IsDigit(state[1]))
            return state;

        // Legacy: state column me poora GSTIN pada ho
        if (state.Length >= 15 && char.IsDigit(state[0]) && char.IsDigit(state[1]))
            return state.Substring(0, 2);

        // State NAME → GST code
        return StateNameToCode.GetValueOrDefault(state.ToLowerInvariant());
    }

    // Indian GST state/UT codes (name → 2-digit). Case-insensitive (keys lowercased).
    private static readonly Dictionary<string, string> StateNameToCode = new(StringComparer.OrdinalIgnoreCase)
    {
        ["jammu and kashmir"] = "01", ["jammu & kashmir"] = "01", ["j&k"] = "01",
        ["himachal pradesh"] = "02",
        ["punjab"] = "03",
        ["chandigarh"] = "04",
        ["uttarakhand"] = "05", ["uttaranchal"] = "05",
        ["haryana"] = "06",
        ["delhi"] = "07", ["new delhi"] = "07",
        ["rajasthan"] = "08",
        ["uttar pradesh"] = "09",
        ["bihar"] = "10",
        ["sikkim"] = "11",
        ["arunachal pradesh"] = "12",
        ["nagaland"] = "13",
        ["manipur"] = "14",
        ["mizoram"] = "15",
        ["tripura"] = "16",
        ["meghalaya"] = "17",
        ["assam"] = "18",
        ["west bengal"] = "19",
        ["jharkhand"] = "20",
        ["odisha"] = "21", ["orissa"] = "21",
        ["chhattisgarh"] = "22", ["chattisgarh"] = "22",
        ["madhya pradesh"] = "23",
        ["gujarat"] = "24",
        ["daman and diu"] = "25", ["daman & diu"] = "25",
        ["dadra and nagar haveli and daman and diu"] = "26",
        ["dadra and nagar haveli"] = "26", ["dadra & nagar haveli"] = "26",
        ["maharashtra"] = "27",
        ["andhra pradesh"] = "37", ["andhra pradesh (old)"] = "28",
        ["karnataka"] = "29",
        ["goa"] = "30",
        ["lakshadweep"] = "31",
        ["kerala"] = "32",
        ["tamil nadu"] = "33", ["tamilnadu"] = "33",
        ["puducherry"] = "34", ["pondicherry"] = "34",
        ["andaman and nicobar islands"] = "35", ["andaman & nicobar islands"] = "35",
        ["telangana"] = "36",
        ["ladakh"] = "38",
        ["other territory"] = "97",
    };

    /// <summary>
    /// Kisi party (party_profiles.id) ka ledger nikaalo; agar null ho to ON-THE-FLY bana do
    /// diye gaye sub-group (Sundry Debtors / Sundry Creditors) ke andar, party ke contact se
    /// linked. Phir party.LedgerId set kar ke save. (AddBill ke purane auto-create block ka
    /// reusable version — sales=buyer, purchase=supplier dono ke liye ek hi jagah.)
    /// </summary>
    private async Task<Guid> GetOrCreatePartyLedgerAsync(Guid partyProfileId, Guid firmId, string subGroupName)
    {
        var party = await _db.PartyProfiles
            .Where(p => p.Id == partyProfileId)
            .Select(p => new { p.LedgerId, p.ContactId })
            .SingleAsync();
        if (party.LedgerId.HasValue)
            return party.LedgerId.Value;

        var subGroup = await _db.SubGroups
            .FirstOrDefaultAsync(s => s.FirmId == firmId && s.Name == subGroupName);
        if (subGroup == null)
            throw new InvalidOperationException(
                $"Cannot auto-create ledger for this party — the '{subGroupName}' sub-group is missing. " +
                "Please run the accounting seed for this firm (Admin → Settings → Initialize Chart of Accounts).");

        var contact = await _db.Contacts.SingleAsync(c => c.Id == party.ContactId);
        var newLedger = new Namokara.Api.Modules.Accounting.Entities.Ledger
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            SubGroupId = subGroup.Id,
            ContactId = contact.Id,
            Name = contact.DisplayName,
            OpeningBalance = 0,
            OpeningType = "Dr",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Ledgers.Add(newLedger);
        await _db.SaveChangesAsync();

        // Link the party to the new ledger
        var partyEntity = await _db.PartyProfiles.SingleAsync(p => p.Id == partyProfileId);
        partyEntity.LedgerId = newLedger.Id;
        await _db.SaveChangesAsync();

        _log.LogInformation("Auto-created ledger {LedgerId} for party {PartyId} under '{SubGroup}'",
            newLedger.Id, partyProfileId, subGroupName);
        return newLedger.Id;
    }

    /// <summary>
    /// BROKER (dalal) model — Sales bill ka double-entry sirf DO line:
    ///     Dr BUYER ledger    (Sundry Debtors)  = bill.Total
    ///     Cr SUPPLIER ledger (Sundry Creditors)= bill.Total
    /// Riddhi Agency seller NAHI hai — sirf supplier↔buyer ka bill re-enter karta hai.
    /// GST supplier↔buyer ka hai → broker ki books me NA Sales Account, NA Output GST.
    /// Payment seedha buyer↔supplier hoti hai; broker cash hold nahi karta.
    ///
    /// LEGACY FALLBACK: agar buyerLedgerId null hai (purane sales bina buyer ke) to
    /// crash mat karo — purana behavior rakho: Dr existing party ledger, Cr Sales
    /// (+ GST) jaise pehle hota tha. Naye normal bills ke liye 2-line broker form.
    /// </summary>
    private async Task<Guid> PostSalesVoucherForBill(
        Bill bill, Guid? buyerLedgerId, Guid? supplierLedgerId, Guid fallbackPartyLedgerId,
        Guid firmId, Guid branchId, Guid userId)
    {
        var voucherNo = await GenerateVoucherNoForBill(branchId, firmId, "sales");

        var voucher = new Voucher
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            BranchId = branchId,
            VoucherType = "sales",
            VoucherNo = voucherNo,
            VoucherDate = bill.BillDate,
            Narration = $"Auto-posted from Sales Bill {bill.BillNo}",
            TotalAmount = bill.Total,
            SourceModule = "trading",
            SourceRefId = bill.Id,
            IsPosted = true,
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        int order = 0;

        // ===== BROKER 2-LINE PATH (normal naye sales: buyer + supplier dono ledger maujood) =====
        if (buyerLedgerId.HasValue && supplierLedgerId.HasValue)
        {
            // Dr BUYER = bill.Total
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = buyerLedgerId.Value, DebitCredit = "Dr",
                Amount = bill.Total,
                Narration = $"Bill {bill.BillNo} (buyer)", SortOrder = order++
            });
            // Cr SUPPLIER = bill.Total  (Dr==Cr==Total → koi round-off nahi chahiye)
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = supplierLedgerId.Value, DebitCredit = "Cr",
                Amount = bill.Total,
                Narration = $"Bill {bill.BillNo} (supplier)", SortOrder = order++
            });
            // Safety net only — Dr==Cr already, ye normally no-op.
            await AddBalancingRoundOffAsync(voucher, firmId, order++);
            _db.Vouchers.Add(voucher);
            await _db.SaveChangesAsync();
            return voucher.Id;
        }

        // ===== LEGACY FALLBACK (sales bina buyer ke) — purana Dr party / Cr Sales (+GST) =====
        var salesLedger = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == "Sales Account")
            .Select(l => l.Id)
            .FirstOrDefaultAsync();
        if (salesLedger == Guid.Empty)
            throw new InvalidOperationException("Sales Account ledger not found. Run accounting seed.");

        Guid cgstLedger = await FindOrCreateTaxLedger(firmId, "CGST Payable");
        Guid sgstLedger = await FindOrCreateTaxLedger(firmId, "SGST Payable");
        Guid igstLedger = await FindOrCreateTaxLedger(firmId, "IGST Payable");

        // Dr Party (full bill total)
        voucher.Lines.Add(new VoucherLine
        {
            Id = Guid.NewGuid(), VoucherId = voucher.Id,
            LedgerId = fallbackPartyLedgerId, DebitCredit = "Dr",
            Amount = bill.Total,
            Narration = $"Bill {bill.BillNo}", SortOrder = order++
        });
        // Cr Sales (taxable amount)
        voucher.Lines.Add(new VoucherLine
        {
            Id = Guid.NewGuid(), VoucherId = voucher.Id,
            LedgerId = salesLedger, DebitCredit = "Cr",
            Amount = bill.TaxableAmount,
            Narration = "Taxable amount", SortOrder = order++
        });
        // Cr tax ledgers — only the ones with non-zero amount
        if (bill.Cgst > 0)
            voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = cgstLedger, DebitCredit = "Cr", Amount = bill.Cgst, Narration = "CGST Output", SortOrder = order++ });
        if (bill.Sgst > 0)
            voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = sgstLedger, DebitCredit = "Cr", Amount = bill.Sgst, Narration = "SGST Output", SortOrder = order++ });
        if (bill.Igst > 0)
            voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = igstLedger, DebitCredit = "Cr", Amount = bill.Igst, Narration = "IGST Output (inter-state)", SortOrder = order++ });

        // ROUND OFF — Dr/Cr ka exact antar plug karo (1-paisa rounding drift bhi safe)
        await AddBalancingRoundOffAsync(voucher, firmId, order++);

        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
        return voucher.Id;
    }

    /// <summary>
    /// Purchase bill → Cr Party (full), Dr Purchase (taxable), Dr CGST+SGST input (intra-state) OR Dr IGST input (inter-state)
    /// Input tax goes into Input ledgers (asset side) for ITC claim.
    /// </summary>
    private async Task<Guid> PostPurchaseVoucherForBill(Bill bill, Guid partyLedgerId, Guid firmId, Guid branchId, Guid userId)
    {
        var purchaseLedger = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == "Purchase Account")
            .Select(l => l.Id)
            .FirstOrDefaultAsync();

        if (purchaseLedger == Guid.Empty)
            throw new InvalidOperationException("Purchase Account ledger not found. Run accounting seed.");

        // Input tax ledgers — these are receivables (asset side) for ITC claim
        Guid cgstInputLedger = await FindOrCreateTaxLedger(firmId, "CGST Input");
        Guid sgstInputLedger = await FindOrCreateTaxLedger(firmId, "SGST Input");
        Guid igstInputLedger = await FindOrCreateTaxLedger(firmId, "IGST Input");

        var voucherNo = await GenerateVoucherNoForBill(branchId, firmId, "purchase");

        var voucher = new Voucher
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            BranchId = branchId,
            VoucherType = "purchase",
            VoucherNo = voucherNo,
            VoucherDate = bill.BillDate,
            Narration = $"Auto-posted from Purchase Bill {bill.BillNo}",
            TotalAmount = bill.Total,
            SourceModule = "trading",
            SourceRefId = bill.Id,
            IsPosted = true,
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        int order = 0;
        // Dr Purchase (taxable amount)
        voucher.Lines.Add(new VoucherLine
        {
            Id = Guid.NewGuid(), VoucherId = voucher.Id,
            LedgerId = purchaseLedger, DebitCredit = "Dr",
            Amount = bill.TaxableAmount,
            Narration = "Goods purchased", SortOrder = order++
        });
        // Dr Input tax (ITC)
        if (bill.Cgst > 0)
            voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = cgstInputLedger, DebitCredit = "Dr", Amount = bill.Cgst, Narration = "CGST Input (ITC)", SortOrder = order++ });
        if (bill.Sgst > 0)
            voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = sgstInputLedger, DebitCredit = "Dr", Amount = bill.Sgst, Narration = "SGST Input (ITC)", SortOrder = order++ });
        if (bill.Igst > 0)
            voucher.Lines.Add(new VoucherLine { Id = Guid.NewGuid(), VoucherId = voucher.Id, LedgerId = igstInputLedger, DebitCredit = "Dr", Amount = bill.Igst, Narration = "IGST Input (ITC, inter-state)", SortOrder = order++ });
        // Cr Party (full bill total)
        voucher.Lines.Add(new VoucherLine
        {
            Id = Guid.NewGuid(), VoucherId = voucher.Id,
            LedgerId = partyLedgerId, DebitCredit = "Cr",
            Amount = bill.Total,
            Narration = $"Bill {bill.BillNo}", SortOrder = order++
        });
        // ROUND OFF — Dr/Cr ka exact antar plug karo (1-paisa rounding drift bhi safe)
        await AddBalancingRoundOffAsync(voucher, firmId, order++);

        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
        return voucher.Id;
    }

    /// <summary>
    /// Credit limit cross hone par firm ko bell-notification. Bill ke party (supplier) +
    /// buyer dono check — jiska bhi RECEIVABLE (ledger Dr-Cr, positive) uski credit limit
    /// se zyada ho. Dedup: same party ka unread notification ho to dobara nahi banata (spam roko).
    /// </summary>
    private async Task CheckCreditLimitAndNotifyAsync(Guid firmId, params Guid?[] partyIds)
    {
        var ids = partyIds.Where(p => p.HasValue).Select(p => p!.Value).Distinct().ToList();
        if (ids.Count == 0) return;

        var parties = await (from p in _db.PartyProfiles
                             join c in _db.Contacts on p.ContactId equals c.Id
                             where p.FirmId == firmId && ids.Contains(p.Id)
                                   && p.LedgerId != null && p.CreditLimit > 0
                             select new { LedgerId = p.LedgerId!.Value, p.CreditLimit, c.DisplayName })
                            .ToListAsync();
        if (parties.Count == 0) return;

        var ledgerIds = parties.Select(p => p.LedgerId).ToList();
        var bals = await _db.VoucherLines
            .Where(vl => ledgerIds.Contains(vl.LedgerId))
            .GroupBy(vl => vl.LedgerId)
            .Select(g => new
            {
                LedgerId = g.Key,
                Dr = g.Where(x => x.DebitCredit == "Dr").Sum(x => x.Amount),
                Cr = g.Where(x => x.DebitCredit == "Cr").Sum(x => x.Amount)
            })
            .ToListAsync();
        var balMap = bals.ToDictionary(x => x.LedgerId, x => x.Dr - x.Cr);

        bool added = false;
        foreach (var p in parties)
        {
            var outstanding = balMap.TryGetValue(p.LedgerId, out var b) ? b : 0m;
            if (outstanding <= p.CreditLimit) continue;   // limit cross nahi hui (ya advance/Cr balance)

            var title = $"⚠️ Credit limit cross: {p.DisplayName}";
            var already = await _db.Notifications.AnyAsync(n =>
                n.FirmId == firmId && n.Type == "credit_limit" && n.Title == title && n.ReadAt == null);
            if (already) continue;

            var pct = (int)Math.Round(outstanding / p.CreditLimit * 100m, MidpointRounding.AwayFromZero);
            _db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                UserId = null,   // poori firm ko dikhe
                Type = "credit_limit",
                Severity = "warning",
                Title = title,
                Body = $"{p.DisplayName} ka outstanding ₹{outstanding:N2} ho gaya — credit limit ₹{p.CreditLimit:N2} ({pct}%) se zyada.",
                CtaLabel = "Party dekho",
                CtaUrl = "/trading/parties",
                ChannelsSent = "{\"inapp\":true}",
                CreatedAt = DateTimeOffset.UtcNow,
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(30)
            });
            added = true;
        }
        if (added) await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Voucher ko HAMESHA exactly balance karo: Dr aur Cr ke actual sum ka antar (1 paisa
    /// rounding drift / discount / insurance etc.) Round Off line me daal do. Isse voucher
    /// kabhi "unbalanced: Dr != Cr" se reject nahi hoga.
    /// </summary>
    private async Task AddBalancingRoundOffAsync(Voucher voucher, Guid firmId, int order)
    {
        // CRITICAL: har line ko pehle 2-decimal pe round karo — bilkul jaise DB NUMERIC(14,2)
        // store karta hai (half AWAY FROM ZERO, banker's-rounding nahi). Warna in-memory sum
        // aur DB-stored sum alag ho jaate hain aur trigger ka Dr=Cr check 1 paisa se fail hota hai.
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
            DebitCredit = diff > 0 ? "Cr" : "Dr",   // Dr zyada → Cr chahiye balance ke liye
            Amount = Math.Abs(diff),
            Narration = "Round Off",
            SortOrder = order
        });
    }

    /// <summary>
    /// Find or create the "Round Off" ledger. Lives under any Income/Expense sub-group;
    /// if none of the standard names exist (firms with incomplete accounting seed),
    /// falls back to ANY available sub group, and if still none, creates a Direct Income
    /// account head + sub group on the fly.
    /// </summary>
    private async Task<Guid> FindOrCreateRoundOffLedger(Guid firmId)
    {
        var existing = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == "Round Off")
            .Select(l => l.Id).FirstOrDefaultAsync();
        if (existing != Guid.Empty) return existing;

        // 1. Try standard income/expense sub group names
        var subGroup = await _db.SubGroups
            .FirstOrDefaultAsync(s => s.FirmId == firmId &&
                (s.Name == "Indirect Income" || s.Name == "Indirect Expenses"
                 || s.Name == "Direct Income"  || s.Name == "Direct Expenses"
                 || s.Name == "Other Income"   || s.Name == "Other Expenses"));

        // 2. Fall back to ANY sub group whose name contains income / expense
        if (subGroup is null)
        {
            subGroup = await _db.SubGroups
                .Where(s => s.FirmId == firmId &&
                    (s.Name.ToLower().Contains("income") || s.Name.ToLower().Contains("expense")))
                .FirstOrDefaultAsync();
        }

        // 3. Last resort: use ANY sub group (so accounting at least balances)
        if (subGroup is null)
        {
            subGroup = await _db.SubGroups
                .FirstOrDefaultAsync(s => s.FirmId == firmId);
        }

        if (subGroup is null)
            throw new InvalidOperationException(
                "No sub groups found at all for this firm. Please run the full accounting seed: " +
                "Admin → Settings → Initialize Chart of Accounts.");

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
        _log.LogInformation("Created 'Round Off' ledger under sub group '{SubGroup}'", subGroup.Name);
        return ledger.Id;
    }

    private async Task<Guid> FindOrCreateTaxLedger(Guid firmId, string name)
    {
        var existing = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == name)
            .Select(l => l.Id).FirstOrDefaultAsync();
        if (existing != Guid.Empty) return existing;

        // Find Duties & Taxes sub group
        var subGroup = await _db.SubGroups
            .FirstOrDefaultAsync(s => s.FirmId == firmId && s.Name == "Duties & Taxes");
        if (subGroup is null)
            throw new InvalidOperationException("Duties & Taxes sub group not found");

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

    private async Task<string> GenerateVoucherNoForBill(Guid branchId, Guid firmId, string voucherType)
    {
        // P0-3 fix: atomic counter via voucher_counters table (UPDATE...RETURNING)
        // prevents race condition where concurrent inserts get duplicate voucher_no.
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                  ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                  ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");
        var prefix = branch.VoucherPrefix ?? $"{branch.Code}-V-";
        var typeSuffix = voucherType switch
        {
            "sales" => "S",
            "purchase" => "PU",
            "payment" => "P",
            "receipt" => "R",
            "journal" => "J",
            "contra" => "C",
            _ => "X"
        };
        var fyStart = GetFyStart();
        var fyYear = fyStart.Year;
        var nextNo = await ReserveCounterAsync(firmId, branchId, $"voucher.{voucherType}", fyYear);
        return $"{prefix}{typeSuffix}{nextNo:D4}";
    }

    /// <summary>
    /// Atomic counter using PostgreSQL UPSERT + RETURNING. Race-safe across concurrent transactions.
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

    public async Task<string> GenerateBillNo(string billType, Guid firmId, Guid branchId)
    {
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                  ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                  ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");
        // Format: JPR-1, JPR-2 ... (chhota saaf number — "BILL" text nahi)
        var prefix = branch.BillPrefix ?? $"{branch.Code}-";
        if (prefix.EndsWith("-BILL-", StringComparison.OrdinalIgnoreCase))
            prefix = prefix.Substring(0, prefix.Length - "BILL-".Length);

        // Use the SAME race-safe atomic counter as vouchers (platform.voucher_counters).
        // The old "COUNT(*) + 1" approach produced DUPLICATE bill numbers (error 23505
        // on idx_bills_no_fy): once any bill was soft-deleted or two saves raced, the
        // count no longer matched the highest existing number, so the next bill collided
        // with a live one. A monotonic counter never repeats.
        var fyYear = GetFyStart().Year;
        var nextNo = await ReserveCounterAsync(firmId, branchId, $"bill.{billType}", fyYear);

        // Safety net: if a counter row is behind (e.g. legacy data created before the
        // counter existed), skip past any bill_no that already exists for this FY.
        string candidate;
        do
        {
            candidate = $"{prefix}{nextNo}";
            var exists = await _db.Bills.IgnoreQueryFilters()
                .AnyAsync(b => b.FirmId == firmId && b.BranchId == branchId
                    && b.BillType == billType && b.BillNo == candidate && b.DeletedAt == null);
            if (!exists) break;
            nextNo = await ReserveCounterAsync(firmId, branchId, $"bill.{billType}", fyYear);
        } while (true);

        return candidate;
    }

    public async Task Delete(Guid id)
    {
        var bill = await _db.Bills.Include(b => b.Lines).SingleAsync(b => b.Id == id);

        // Soft delete bill
        bill.DeletedAt = DateTimeOffset.UtcNow;

        // Mark linked voucher as deleted too
        if (bill.VoucherId.HasValue)
        {
            var voucher = await _db.Vouchers.SingleAsync(v => v.Id == bill.VoucherId.Value);
            voucher.DeletedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();
    }

    private DateOnly GetFyStart()
    {
        var today = DateTime.Now;
        return today.Month >= 4
            ? new DateOnly(today.Year, 4, 1)
            : new DateOnly(today.Year - 1, 4, 1);
    }
}
