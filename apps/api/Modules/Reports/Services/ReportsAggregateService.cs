using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Reports.Services;

// =============================================================================
// DTOs
// =============================================================================
public record ExecutiveKpiDto(
    decimal TodaysSales,
    decimal TodaysReceipts,
    decimal MtdSales,
    decimal MtdReceipts,
    decimal MtdProfit,
    decimal OutstandingTotal,
    int    BillsToday,
    int    PendingBillsCount,
    int    PartiesActive,
    decimal CashInHand,
    decimal BankBalance);

public record DailySalesPointDto(string Day, decimal Sales, decimal Receipts, int BillsCount);

public record SalesRegisterRowDto(
    string BillNo, DateOnly BillDate, string PartyName, string? Gst, string BuyerName,
    decimal Subtotal, decimal Discount, decimal Cgst, decimal Sgst, decimal Igst,
    decimal Total, decimal PaidAmount, string Status);

public record OutstandingRowDto(
    Guid PartyId, string PartyName, string BillNo, DateOnly BillDate, decimal Total, decimal Paid,
    decimal Pending, int DaysOverdue, string AgingBucket);

public record PartyOutstandingDto(
    string PartyName, string? Phone, string? Gst,
    decimal TotalOutstanding,
    decimal Bucket_0_30, decimal Bucket_31_60, decimal Bucket_61_90, decimal Bucket_90Plus,
    int BillCount);

public record PartySalesDto(
    Guid PartyId, string PartyName, int BillCount,
    decimal TotalSales, decimal TotalPaid, decimal Outstanding);

public record ItemSalesDto(
    string ItemName, string? HsnSac, decimal TotalQty, string Unit,
    decimal TotalRevenue, int BillCount, decimal AvgRate);

public record GstSummaryDto(
    decimal TotalTaxable, decimal TotalCgst, decimal TotalSgst, decimal TotalIgst,
    decimal GrandTotal, int BillCount);

public record GstByRateDto(decimal TaxRate, decimal Taxable, decimal Cgst, decimal Sgst, decimal Igst, int Count);

public record PaymentModeDto(string Mode, int Count, decimal Amount);

public record DayReceiptDto(string Day, decimal Receipts, decimal Payments, decimal NetCashflow);

// =============================================================================
// Service
// =============================================================================
public interface IReportsAggregateService
{
    Task<ExecutiveKpiDto> ExecutiveKpi();
    Task<List<DailySalesPointDto>> DailySalesTrend(int days);
    Task<List<SalesRegisterRowDto>> SalesRegister(DateOnly from, DateOnly to, string? status);
    Task<List<OutstandingRowDto>> Outstanding(DateOnly asOf);
    Task<List<PartyOutstandingDto>> PartyWiseOutstanding(DateOnly asOf);
    Task<List<PartySalesDto>> TopParties(DateOnly from, DateOnly to, int top);
    Task<List<ItemSalesDto>> TopItems(DateOnly from, DateOnly to, int top);
    Task<(GstSummaryDto summary, List<GstByRateDto> byRate)> GstSummary(DateOnly from, DateOnly to);
    Task<List<PaymentModeDto>> PaymentModeBreakdown(DateOnly from, DateOnly to);
    Task<List<DayReceiptDto>> DailyCashflow(int days);
}

public class ReportsAggregateService : IReportsAggregateService
{
    private readonly AppDbContext _db;

    public ReportsAggregateService(AppDbContext db) => _db = db;

    // Business "today" must be in IST regardless of server timezone (UTC on prod),
    // otherwise day boundaries shift and reports drop/duplicate a day's data.
    private static readonly TimeZoneInfo IstZone = ResolveIst();
    private static TimeZoneInfo ResolveIst()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("India Standard Time"); }
    }
    private static DateOnly IstToday()
        => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstZone).Date);

    public async Task<ExecutiveKpiDto> ExecutiveKpi()
    {
        var today = IstToday();
        var monthStart = new DateOnly(today.Year, today.Month, 1);

        var todaysSales = await _db.Bills
            .Where(b => b.BillDate == today && b.BillType == "sales")
            .SumAsync(b => (decimal?)b.Total) ?? 0;

        var todaysReceipts = await _db.Payments
            .Where(p => p.PaymentDate == today && p.PaymentType == "receipt")
            .SumAsync(p => (decimal?)p.Amount) ?? 0;

        var mtdSales = await _db.Bills
            .Where(b => b.BillDate >= monthStart && b.BillType == "sales")
            .SumAsync(b => (decimal?)b.Total) ?? 0;

        var mtdReceipts = await _db.Payments
            .Where(p => p.PaymentDate >= monthStart && p.PaymentType == "receipt")
            .SumAsync(p => (decimal?)p.Amount) ?? 0;

        // Profit from voucher lines on income vs expense ledgers
        var income = await GetSumByHead(monthStart, today, "Income");
        var expense = await GetSumByHead(monthStart, today, "Expenses");
        var mtdProfit = income - expense;

        var outstanding = await _db.Bills
            .Where(b => b.BillType == "sales" && b.Status != "paid" && b.Status != "cancelled")
            .SumAsync(b => (decimal?)(b.Total - b.PaidAmount)) ?? 0;

        var billsToday = await _db.Bills.CountAsync(b => b.BillDate == today);
        var pendingBills = await _db.Bills.CountAsync(b => b.Status == "pending" || b.Status == "partial");
        var partiesActive = await _db.PartyProfiles.CountAsync(p => p.IsActive);

        // Cash + Bank balances from voucher_lines
        var cashLedger = await _db.Ledgers
            .Where(l => l.Name.ToLower().Contains("cash"))
            .Select(l => l.Id).FirstOrDefaultAsync();

        decimal cashInHand = 0;
        if (cashLedger != Guid.Empty)
        {
            // Join Vouchers so the global DeletedAt==null query filter excludes
            // lines belonging to soft-deleted vouchers (VoucherLine has no own filter).
            var dr = await _db.VoucherLines
                .Where(vl => vl.LedgerId == cashLedger && vl.DebitCredit == "Dr")
                .Join(_db.Vouchers, vl => vl.VoucherId, v => v.Id, (vl, v) => vl.Amount)
                .SumAsync(a => (decimal?)a) ?? 0;
            var cr = await _db.VoucherLines
                .Where(vl => vl.LedgerId == cashLedger && vl.DebitCredit == "Cr")
                .Join(_db.Vouchers, vl => vl.VoucherId, v => v.Id, (vl, v) => vl.Amount)
                .SumAsync(a => (decimal?)a) ?? 0;
            var openingLedger = await _db.Ledgers.SingleAsync(l => l.Id == cashLedger);
            cashInHand = (openingLedger.OpeningType == "Dr" ? openingLedger.OpeningBalance : -openingLedger.OpeningBalance) + dr - cr;
        }

        var bankSubGroup = await _db.SubGroups
            .Where(s => s.Name == "Bank Accounts").Select(s => s.Id).FirstOrDefaultAsync();
        decimal bankBalance = 0;
        if (bankSubGroup != Guid.Empty)
        {
            var bankLedgers = await _db.Ledgers
                .Where(l => l.SubGroupId == bankSubGroup)
                .ToListAsync();
            foreach (var bl in bankLedgers)
            {
                // Join Vouchers so soft-deleted vouchers' lines are excluded.
                var dr = await _db.VoucherLines
                    .Where(vl => vl.LedgerId == bl.Id && vl.DebitCredit == "Dr")
                    .Join(_db.Vouchers, vl => vl.VoucherId, v => v.Id, (vl, v) => vl.Amount)
                    .SumAsync(a => (decimal?)a) ?? 0;
                var cr = await _db.VoucherLines
                    .Where(vl => vl.LedgerId == bl.Id && vl.DebitCredit == "Cr")
                    .Join(_db.Vouchers, vl => vl.VoucherId, v => v.Id, (vl, v) => vl.Amount)
                    .SumAsync(a => (decimal?)a) ?? 0;
                bankBalance += (bl.OpeningType == "Dr" ? bl.OpeningBalance : -bl.OpeningBalance) + dr - cr;
            }
        }

        return new ExecutiveKpiDto(
            todaysSales, todaysReceipts, mtdSales, mtdReceipts, mtdProfit,
            outstanding, billsToday, pendingBills, partiesActive,
            cashInHand, bankBalance);
    }

    private async Task<decimal> GetSumByHead(DateOnly from, DateOnly to, string headName)
    {
        var ledgers = await _db.Ledgers
            .Include(l => l.SubGroup)!.ThenInclude(s => s!.Group)!.ThenInclude(g => g!.Head)
            .Where(l => l.SubGroup!.Group!.Head!.Name == headName)
            .Select(l => new { l.Id, l.OpeningType, l.OpeningBalance })
            .ToListAsync();

        var ids = ledgers.Select(l => l.Id).ToList();
        if (ids.Count == 0) return 0;

        var lines = await _db.VoucherLines
            .Where(vl => ids.Contains(vl.LedgerId))
            .Join(_db.Vouchers, vl => vl.VoucherId, v => v.Id,
                (vl, v) => new { vl.DebitCredit, vl.Amount, v.VoucherDate })
            .Where(x => x.VoucherDate >= from && x.VoucherDate <= to)
            .ToListAsync();

        var dr = lines.Where(l => l.DebitCredit == "Dr").Sum(l => l.Amount);
        var cr = lines.Where(l => l.DebitCredit == "Cr").Sum(l => l.Amount);

        // Income = Cr - Dr ; Expenses = Dr - Cr
        return headName == "Income" ? cr - dr : dr - cr;
    }

    public async Task<List<DailySalesPointDto>> DailySalesTrend(int days)
    {
        var to = IstToday();
        var from = to.AddDays(-days + 1);

        var sales = await _db.Bills
            .Where(b => b.BillType == "sales" && b.BillDate >= from && b.BillDate <= to)
            .GroupBy(b => b.BillDate)
            .Select(g => new { Date = g.Key, Total = g.Sum(b => b.Total), Count = g.Count() })
            .ToListAsync();

        var receipts = await _db.Payments
            .Where(p => p.PaymentType == "receipt" && p.PaymentDate >= from && p.PaymentDate <= to)
            .GroupBy(p => p.PaymentDate)
            .Select(g => new { Date = g.Key, Total = g.Sum(p => p.Amount) })
            .ToListAsync();

        var allDates = Enumerable.Range(0, days)
            .Select(i => from.AddDays(i))
            .Select(d => new DailySalesPointDto(
                d.ToString("yyyy-MM-dd"),
                sales.FirstOrDefault(s => s.Date == d)?.Total ?? 0,
                receipts.FirstOrDefault(r => r.Date == d)?.Total ?? 0,
                sales.FirstOrDefault(s => s.Date == d)?.Count ?? 0))
            .ToList();

        return allDates;
    }

    public async Task<List<SalesRegisterRowDto>> SalesRegister(DateOnly from, DateOnly to, string? status)
    {
        var query = _db.Bills
            .Where(b => b.BillType == "sales" && b.BillDate >= from && b.BillDate <= to)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status)) query = query.Where(b => b.Status == status);

        var bills = await query.OrderBy(b => b.BillDate).ThenBy(b => b.BillNo).ToListAsync();

        // Broker model: bill.PartyId = SUPPLIER, bill.BuyerPartyId = BUYER — dono ke naam lao
        var partyIds = bills.Select(b => b.PartyId)
            .Concat(bills.Where(b => b.BuyerPartyId != null).Select(b => b.BuyerPartyId!.Value))
            .Distinct().ToList();
        var parties = await (from p in _db.PartyProfiles
                             join c in _db.Contacts on p.ContactId equals c.Id
                             where partyIds.Contains(p.Id)
                             select new { p.Id, c.DisplayName, c.GstNumber })
                            .ToDictionaryAsync(x => x.Id, x => new { x.DisplayName, x.GstNumber });

        return bills.Select(b => new SalesRegisterRowDto(
            b.BillNo, b.BillDate,
            parties.GetValueOrDefault(b.PartyId)?.DisplayName ?? "—",          // SUPPLIER
            parties.GetValueOrDefault(b.PartyId)?.GstNumber,
            b.BuyerPartyId != null
                ? (parties.GetValueOrDefault(b.BuyerPartyId.Value)?.DisplayName ?? "—")
                : "—",                                                          // BUYER
            b.Subtotal, b.Discount, b.Cgst, b.Sgst, b.Igst,
            b.Total, b.PaidAmount, b.Status)).ToList();
    }

    public async Task<List<OutstandingRowDto>> Outstanding(DateOnly asOf)
    {
        var bills = await _db.Bills
            .Where(b => b.BillType == "sales" && b.Status != "paid" && b.Status != "cancelled")
            .OrderBy(b => b.BillDate)
            .ToListAsync();

        var partyIds = bills.Select(b => b.PartyId).Distinct().ToList();
        var parties = await (from p in _db.PartyProfiles
                             join c in _db.Contacts on p.ContactId equals c.Id
                             where partyIds.Contains(p.Id)
                             select new { p.Id, c.DisplayName, p.CreditDays })
                            .ToDictionaryAsync(x => x.Id, x => x);

        return bills.Select(b =>
        {
            var pending = b.Total - b.PaidAmount;
            var creditDays = parties.GetValueOrDefault(b.PartyId)?.CreditDays ?? 30;
            var dueDate = b.BillDate.AddDays(creditDays);
            var daysOverdue = asOf.DayNumber - dueDate.DayNumber;
            var bucket = daysOverdue <= 0 ? "Within Terms"
                       : daysOverdue <= 30 ? "0-30 days"
                       : daysOverdue <= 60 ? "31-60 days"
                       : daysOverdue <= 90 ? "61-90 days"
                       : "90+ days";

            return new OutstandingRowDto(
                b.PartyId,
                parties.GetValueOrDefault(b.PartyId)?.DisplayName ?? "—",
                b.BillNo, b.BillDate, b.Total, b.PaidAmount,
                pending, Math.Max(0, daysOverdue), bucket);
        }).OrderByDescending(r => r.DaysOverdue).ToList();
    }

    public async Task<List<PartyOutstandingDto>> PartyWiseOutstanding(DateOnly asOf)
    {
        var rows = await Outstanding(asOf);

        var parties = await (from p in _db.PartyProfiles
                             join c in _db.Contacts on p.ContactId equals c.Id
                             where p.IsActive
                             select new { p.Id, c.DisplayName, c.PhonePrimary, c.GstNumber })
                            .ToListAsync();

        var grouped = rows
            .GroupBy(r => r.PartyId)   // group by ID — two parties can share a display name
            .Select(g =>
            {
                var p = parties.FirstOrDefault(x => x.Id == g.Key);
                var partyName = g.First().PartyName;
                return new PartyOutstandingDto(
                    partyName, p?.PhonePrimary, p?.GstNumber,
                    g.Sum(r => r.Pending),
                    g.Where(r => r.DaysOverdue <= 30).Sum(r => r.Pending),
                    g.Where(r => r.DaysOverdue > 30 && r.DaysOverdue <= 60).Sum(r => r.Pending),
                    g.Where(r => r.DaysOverdue > 60 && r.DaysOverdue <= 90).Sum(r => r.Pending),
                    g.Where(r => r.DaysOverdue > 90).Sum(r => r.Pending),
                    g.Count());
            })
            .OrderByDescending(d => d.TotalOutstanding)
            .ToList();

        return grouped;
    }

    public async Task<List<PartySalesDto>> TopParties(DateOnly from, DateOnly to, int top)
    {
        var bills = await _db.Bills
            .Where(b => b.BillType == "sales" && b.BillDate >= from && b.BillDate <= to)
            .GroupBy(b => b.PartyId)
            .Select(g => new
            {
                PartyId = g.Key,
                BillCount = g.Count(),
                TotalSales = g.Sum(b => b.Total),
                TotalPaid = g.Sum(b => b.PaidAmount)
            })
            .OrderByDescending(x => x.TotalSales)
            .Take(top)
            .ToListAsync();

        var partyIds = bills.Select(b => b.PartyId).Distinct().ToList();
        var parties = await (from p in _db.PartyProfiles
                             join c in _db.Contacts on p.ContactId equals c.Id
                             where partyIds.Contains(p.Id)
                             select new { p.Id, c.DisplayName })
                            .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

        return bills.Select(b => new PartySalesDto(
            b.PartyId,
            parties.GetValueOrDefault(b.PartyId, "—"),
            b.BillCount, b.TotalSales, b.TotalPaid,
            b.TotalSales - b.TotalPaid)).ToList();
    }

    public async Task<List<ItemSalesDto>> TopItems(DateOnly from, DateOnly to, int top)
    {
        var lines = await (from bl in _db.BillLines
                           join b in _db.Bills on bl.BillId equals b.Id
                           where b.BillType == "sales" && b.BillDate >= @from && b.BillDate <= to
                           select new
                           {
                               bl.ItemName, bl.HsnSac, bl.Qty, bl.Unit,
                               bl.Rate, bl.TotalAmount, b.Id
                           })
                          .ToListAsync();

        return lines
            .GroupBy(l => new { l.ItemName, l.HsnSac, l.Unit })
            .Select(g => new ItemSalesDto(
                g.Key.ItemName, g.Key.HsnSac,
                g.Sum(l => l.Qty), g.Key.Unit ?? "",
                g.Sum(l => l.TotalAmount),
                g.Select(l => l.Id).Distinct().Count(),
                g.Average(l => l.Rate)))
            .OrderByDescending(i => i.TotalRevenue)
            .Take(top)
            .ToList();
    }

    public async Task<(GstSummaryDto summary, List<GstByRateDto> byRate)> GstSummary(DateOnly from, DateOnly to)
    {
        var bills = await _db.Bills
            .Where(b => b.BillType == "sales" && b.BillDate >= from && b.BillDate <= to)
            .ToListAsync();

        var summary = new GstSummaryDto(
            bills.Sum(b => b.TaxableAmount),
            bills.Sum(b => b.Cgst),
            bills.Sum(b => b.Sgst),
            bills.Sum(b => b.Igst),
            bills.Sum(b => b.Total),
            bills.Count);

        var lines = await (from bl in _db.BillLines
                           join b in _db.Bills on bl.BillId equals b.Id
                           where b.BillType == "sales" && b.BillDate >= @from && b.BillDate <= to
                           // Carry the bill-level inter-state flag so the rate breakdown
                           // splits CGST/SGST vs IGST the SAME way the bill was actually posted.
                           select new { bl.TaxRate, bl.TaxableAmount, bl.TotalAmount, IsInterState = b.Igst > 0 })
                          .ToListAsync();

        var byRate = lines.GroupBy(l => l.TaxRate)
            .Select(g =>
            {
                var taxable = g.Sum(x => x.TaxableAmount);
                decimal cgst = 0, sgst = 0, igst = 0;
                foreach (var l in g)
                {
                    var lineTax = l.TotalAmount - l.TaxableAmount;
                    if (l.IsInterState) igst += lineTax;
                    else { cgst += lineTax / 2; sgst += lineTax / 2; }
                }
                return new GstByRateDto(g.Key, taxable, cgst, sgst, igst, g.Count());
            })
            .OrderBy(g => g.TaxRate)
            .ToList();

        return (summary, byRate);
    }

    public async Task<List<PaymentModeDto>> PaymentModeBreakdown(DateOnly from, DateOnly to)
    {
        var payments = await _db.Payments
            .Where(p => p.PaymentType == "receipt" && p.PaymentDate >= from && p.PaymentDate <= to)
            .GroupBy(p => p.PaymentMode)
            .Select(g => new PaymentModeDto(g.Key, g.Count(), g.Sum(p => p.Amount)))
            .OrderByDescending(p => p.Amount)
            .ToListAsync();

        return payments;
    }

    public async Task<List<DayReceiptDto>> DailyCashflow(int days)
    {
        var from = IstToday().AddDays(-days + 1);

        var receipts = await _db.Payments
            .Where(p => p.PaymentType == "receipt" && p.PaymentDate >= from)
            .GroupBy(p => p.PaymentDate)
            .Select(g => new { Date = g.Key, Amount = g.Sum(p => p.Amount) })
            .ToListAsync();

        var pmts = await _db.Payments
            .Where(p => p.PaymentType == "payment" && p.PaymentDate >= from)
            .GroupBy(p => p.PaymentDate)
            .Select(g => new { Date = g.Key, Amount = g.Sum(p => p.Amount) })
            .ToListAsync();

        var allDates = Enumerable.Range(0, days)
            .Select(i => from.AddDays(i))
            .Select(d =>
            {
                var r = receipts.FirstOrDefault(x => x.Date == d)?.Amount ?? 0;
                var p = pmts.FirstOrDefault(x => x.Date == d)?.Amount ?? 0;
                return new DayReceiptDto(d.ToString("yyyy-MM-dd"), r, p, r - p);
            })
            .ToList();

        return allDates;
    }
}
