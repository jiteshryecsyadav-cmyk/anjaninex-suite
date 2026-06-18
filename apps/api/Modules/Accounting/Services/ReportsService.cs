using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Accounting.Services;

// =============================================================================
// DTOs
// =============================================================================
public record TrialBalanceRow(
    Guid LedgerId, string LedgerName, string GroupName, string HeadName,
    decimal OpeningDr, decimal OpeningCr,
    decimal PeriodDr, decimal PeriodCr,
    decimal ClosingDr, decimal ClosingCr);

public record TrialBalanceReport(
    DateOnly AsOf,
    List<TrialBalanceRow> Rows,
    decimal TotalDr, decimal TotalCr,
    bool IsBalanced);

public record ProfitLossReport(
    DateOnly From, DateOnly To,
    List<TrialBalanceRow> IncomeRows,
    List<TrialBalanceRow> ExpenseRows,
    decimal TotalIncome, decimal TotalExpense,
    decimal NetProfit);

public record BalanceSheetRow(string Section, string Name, decimal Amount);
public record BalanceSheetReport(
    DateOnly AsOf,
    List<BalanceSheetRow> Assets,
    List<BalanceSheetRow> Liabilities,
    decimal TotalAssets, decimal TotalLiabilities);

// =============================================================================
// Service
// =============================================================================
public interface IReportsService
{
    // firmId null = current tenant (RLS); value = explicit firm (AP/Anjaninex Books ke liye)
    Task<TrialBalanceReport> TrialBalance(DateOnly asOf, Guid? firmId = null);
    Task<ProfitLossReport> ProfitLoss(DateOnly from, DateOnly to, Guid? firmId = null);
    Task<BalanceSheetReport> BalanceSheet(DateOnly asOf, Guid? firmId = null);
    Task<List<LedgerTransactionDto>> LedgerStatement(Guid ledgerId, DateOnly from, DateOnly to);
    // Party Master shortcut → resolve the accounting ledger for a trading party.
    // Returns null if the party has no ledger yet (no bill/payment booked).
    Task<PartyLedgerDto?> ResolvePartyLedger(Guid partyId, Guid firmId);
}

public record LedgerTransactionDto(
    DateOnly Date, string VoucherNo, string VoucherType, string? Narration,
    decimal Debit, decimal Credit, decimal Balance, string BalanceType);

// Party Master "📒 Ledger" shortcut payload.
public record PartyLedgerDto(Guid LedgerId, string LedgerName);

public class ReportsService : IReportsService
{
    private readonly AppDbContext _db;

    public ReportsService(AppDbContext db) => _db = db;

    public async Task<TrialBalanceReport> TrialBalance(DateOnly asOf, Guid? firmId = null)
    {
        var ledgers = await _db.Ledgers
            .Include(l => l.SubGroup)!.ThenInclude(s => s!.Group)!.ThenInclude(g => g!.Head)
            .Where(l => l.IsActive && (firmId == null || l.FirmId == firmId.Value))
            .ToListAsync();

        var ledgerIds = ledgers.Select(l => l.Id).ToList();

        // Get all voucher lines up to asOf date
        var lines = await _db.VoucherLines
            .Where(vl => ledgerIds.Contains(vl.LedgerId))
            .Join(_db.Vouchers,
                vl => vl.VoucherId,
                v => v.Id,
                (vl, v) => new { vl.LedgerId, vl.DebitCredit, vl.Amount, v.VoucherDate })
            .Where(x => x.VoucherDate <= asOf)
            .ToListAsync();

        var rows = ledgers.Select(l =>
        {
            var ledgerLines = lines.Where(x => x.LedgerId == l.Id).ToList();
            var periodDr = ledgerLines.Where(x => x.DebitCredit == "Dr").Sum(x => x.Amount);
            var periodCr = ledgerLines.Where(x => x.DebitCredit == "Cr").Sum(x => x.Amount);

            var openingDr = l.OpeningType == "Dr" ? l.OpeningBalance : 0;
            var openingCr = l.OpeningType == "Cr" ? l.OpeningBalance : 0;

            var net = (openingDr + periodDr) - (openingCr + periodCr);
            var closingDr = net > 0 ? net : 0;
            var closingCr = net < 0 ? -net : 0;

            return new TrialBalanceRow(
                l.Id, l.Name,
                l.SubGroup?.Group?.Name ?? "",
                l.SubGroup?.Group?.Head?.Name ?? "",
                openingDr, openingCr,
                periodDr, periodCr,
                closingDr, closingCr);
        })
        .Where(r => r.ClosingDr > 0 || r.ClosingCr > 0 || r.PeriodDr > 0 || r.PeriodCr > 0)
        .OrderBy(r => r.HeadName).ThenBy(r => r.GroupName).ThenBy(r => r.LedgerName)
        .ToList();

        var totalDr = rows.Sum(r => r.ClosingDr);
        var totalCr = rows.Sum(r => r.ClosingCr);

        return new TrialBalanceReport(
            asOf, rows, totalDr, totalCr,
            IsBalanced: Math.Abs(totalDr - totalCr) < 0.01m);
    }

    public async Task<ProfitLossReport> ProfitLoss(DateOnly from, DateOnly to, Guid? firmId = null)
    {
        var tb = await TrialBalance(to, firmId);

        // Income = ledgers under Income head, Expense = under Expenses
        var income = tb.Rows.Where(r => r.HeadName == "Income").ToList();
        var expense = tb.Rows.Where(r => r.HeadName == "Expenses").ToList();

        var totalInc = income.Sum(r => r.ClosingCr - r.ClosingDr);
        var totalExp = expense.Sum(r => r.ClosingDr - r.ClosingCr);
        var netProfit = totalInc - totalExp;

        return new ProfitLossReport(from, to, income, expense, totalInc, totalExp, netProfit);
    }

    public async Task<BalanceSheetReport> BalanceSheet(DateOnly asOf, Guid? firmId = null)
    {
        var tb = await TrialBalance(asOf, firmId);

        // Group assets by head
        var assets = tb.Rows.Where(r => r.HeadName == "Assets")
            .GroupBy(r => r.GroupName)
            .Select(g => new BalanceSheetRow("Assets", g.Key, g.Sum(r => r.ClosingDr - r.ClosingCr)))
            .Where(r => r.Amount != 0)
            .OrderBy(r => r.Name)
            .ToList();

        var liabilities = tb.Rows.Where(r => r.HeadName == "Liabilities" || r.HeadName == "Capital Account")
            .GroupBy(r => r.GroupName)
            .Select(g => new BalanceSheetRow(
                tb.Rows.First(r => r.GroupName == g.Key).HeadName,
                g.Key,
                g.Sum(r => r.ClosingCr - r.ClosingDr)))
            .Where(r => r.Amount != 0)
            .OrderBy(r => r.Name)
            .ToList();

        // Add net profit to capital side
        var pl = await ProfitLoss(new DateOnly(asOf.Year, 4, 1), asOf, firmId);
        if (pl.NetProfit != 0)
            liabilities.Add(new BalanceSheetRow("Capital Account",
                pl.NetProfit > 0 ? "Net Profit (Current Period)" : "Net Loss (Current Period)",
                Math.Abs(pl.NetProfit)));

        return new BalanceSheetReport(
            asOf, assets, liabilities,
            assets.Sum(a => a.Amount),
            liabilities.Sum(l => l.Amount));
    }

    public async Task<List<LedgerTransactionDto>> LedgerStatement(
        Guid ledgerId, DateOnly from, DateOnly to)
    {
        var ledger = await _db.Ledgers.SingleAsync(l => l.Id == ledgerId);

        var openingDr = ledger.OpeningType == "Dr" ? ledger.OpeningBalance : 0;
        var openingCr = ledger.OpeningType == "Cr" ? ledger.OpeningBalance : 0;

        // Add transactions BEFORE 'from' to compute opening
        var beforeFrom = await _db.VoucherLines
            .Where(vl => vl.LedgerId == ledgerId)
            .Join(_db.Vouchers, vl => vl.VoucherId, v => v.Id, (vl, v) => new { vl, v })
            .Where(x => x.v.VoucherDate < from)
            .ToListAsync();

        foreach (var x in beforeFrom)
        {
            if (x.vl.DebitCredit == "Dr") openingDr += x.vl.Amount;
            else openingCr += x.vl.Amount;
        }

        var openingBalance = openingDr - openingCr;

        // Transactions in period
        var inPeriod = await _db.VoucherLines
            .Where(vl => vl.LedgerId == ledgerId)
            .Join(_db.Vouchers, vl => vl.VoucherId, v => v.Id, (vl, v) => new { vl, v })
            .Where(x => x.v.VoucherDate >= from && x.v.VoucherDate <= to)
            .OrderBy(x => x.v.VoucherDate)
            .ThenBy(x => x.v.CreatedAt)
            .ToListAsync();

        var rows = new List<LedgerTransactionDto>();
        decimal runBal = openingBalance;

        // Opening row
        rows.Add(new LedgerTransactionDto(
            from, "Opening", "—", null,
            0, 0,
            Math.Abs(runBal), runBal >= 0 ? "Dr" : "Cr"));

        foreach (var x in inPeriod)
        {
            decimal dr = x.vl.DebitCredit == "Dr" ? x.vl.Amount : 0;
            decimal cr = x.vl.DebitCredit == "Cr" ? x.vl.Amount : 0;
            runBal += dr - cr;
            rows.Add(new LedgerTransactionDto(
                x.v.VoucherDate, x.v.VoucherNo, x.v.VoucherType, x.v.Narration,
                dr, cr, Math.Abs(runBal), runBal >= 0 ? "Dr" : "Cr"));
        }

        return rows;
    }

    public async Task<PartyLedgerDto?> ResolvePartyLedger(Guid partyId, Guid firmId)
    {
        // 1) Trading party → its profile (firm-scoped; RLS also enforces firm).
        var party = await _db.PartyProfiles
            .Where(p => p.Id == partyId && p.FirmId == firmId)
            .Select(p => new { p.LedgerId, p.ContactId })
            .FirstOrDefaultAsync();

        if (party == null) return null;

        // 2) Preferred link: party.LedgerId (set by BillService.FindOrCreatePartyLedger).
        if (party.LedgerId.HasValue)
        {
            var byId = await _db.Ledgers
                .Where(l => l.Id == party.LedgerId.Value && l.FirmId == firmId)
                .Select(l => new PartyLedgerDto(l.Id, l.Name))
                .FirstOrDefaultAsync();
            if (byId != null) return byId;
        }

        // 3) Fallback: ledger linked to the same contact (party-ledgers carry contact_id).
        var byContact = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.ContactId == party.ContactId)
            .Select(l => new PartyLedgerDto(l.Id, l.Name))
            .FirstOrDefaultAsync();

        return byContact; // null = no accounting entry yet → friendly message on the UI
    }
}
