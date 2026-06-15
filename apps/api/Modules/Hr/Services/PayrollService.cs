using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;
using Namokara.Api.Modules.Hr.Entities;

namespace Namokara.Api.Modules.Hr.Services;

public interface IPayrollService
{
    Task<List<PayslipDto>> RunPayroll(int year, int month, List<Guid>? employeeIds, Guid firmId, Guid branchId, Guid byUserId);
    Task<List<PayslipDto>> GetPayrollMonth(int year, int month);
    Task<PayslipDto?> GetPayslip(Guid id);
    Task<List<PayslipDto>> MyPayslips(Guid employeeId);
    Task MarkPaid(Guid payrollId, Guid firmId, Guid branchId, Guid byUserId);
}

public class PayrollService : IPayrollService
{
    private readonly AppDbContext _db;
    private readonly ILogger<PayrollService> _log;

    public PayrollService(AppDbContext db, ILogger<PayrollService> log)
    {
        _db = db;
        _log = log;
    }

    public async Task<List<PayslipDto>> RunPayroll(int year, int month, List<Guid>? employeeIds, Guid firmId, Guid branchId, Guid byUserId)
    {
        var employees = await _db.EmployeeProfiles
            .Where(e => e.FirmId == firmId && e.IsActive && e.SalaryStructureId.HasValue)
            .ToListAsync();

        if (employeeIds != null && employeeIds.Count > 0)
            employees = employees.Where(e => employeeIds.Contains(e.Id)).ToList();

        var monthStart = new DateOnly(year, month, 1);
        var monthEnd = monthStart.AddMonths(1);
        var daysInMonth = (monthEnd.DayNumber - monthStart.DayNumber);

        var results = new List<PayslipDto>();

        foreach (var emp in employees)
        {
            var existing = await _db.PayrollRecords
                .FirstOrDefaultAsync(p => p.EmployeeId == emp.Id && p.PeriodYear == year && p.PeriodMonth == month);
            if (existing != null && existing.IsPaid) continue;  // already paid, skip

            var structure = await _db.SalaryStructures.SingleAsync(s => s.Id == emp.SalaryStructureId!.Value);

            // Compute attendance
            var attendance = await _db.AttendanceLogs
                .Where(a => a.EmployeeId == emp.Id && a.LogDate >= monthStart && a.LogDate < monthEnd)
                .ToListAsync();

            var daysPresent = attendance.Count(a => a.Status == "present");
            var daysHalf = attendance.Count(a => a.Status == "half_day") * 0.5m;

            // Approved leave days
            var paidLeave = await _db.LeaveRequests
                .Where(l => l.EmployeeId == emp.Id && l.Status == "approved"
                    && l.LeaveType != "lop"
                    && l.FromDate < monthEnd && l.ToDate >= monthStart)
                .SumAsync(l => (decimal?)l.DaysCount) ?? 0;

            var totalPaidDays = daysPresent + daysHalf + paidLeave;
            var lopDays = Math.Max(0, daysInMonth - totalPaidDays - GetWeekendsInMonth(year, month));
            lopDays = Math.Max(0, lopDays);

            // Calculate components
            var basic = structure.MonthlyCtc * structure.BasicPercent / 100;
            var hra = structure.MonthlyCtc * structure.HraPercent / 100;

            decimal special = 0, conveyance = 0, medical = 0;
            try
            {
                var comp = JsonDocument.Parse(structure.Components).RootElement;
                if (comp.TryGetProperty("special", out var sp)) special = sp.GetDecimal();
                if (comp.TryGetProperty("conveyance", out var co)) conveyance = co.GetDecimal();
                if (comp.TryGetProperty("medical", out var me)) medical = me.GetDecimal();
            }
            catch { }

            // Full (un-prorated) monthly gross — needed for ESI eligibility before LOP.
            var fullGross = basic + hra + special + conveyance + medical;

            // Pro-rate for LOP
            var lopFactor = lopDays > 0 ? (decimal)(daysInMonth - lopDays) / daysInMonth : 1m;
            basic *= lopFactor;
            hra *= lopFactor;
            special *= lopFactor;
            conveyance *= lopFactor;
            medical *= lopFactor;

            var gross = basic + hra + special + conveyance + medical;

            // ESI eligibility is assessed on the FULL (un-prorated) monthly gross wage
            // (captured above), not the LOP-reduced gross — otherwise an employee with
            // absences could wrongly cross the ₹21,000 threshold mid-period.
            var esiEligible = structure.EsiApplicable && fullGross < 21000;

            // Deductions
            // NOTE: basic/hra/etc. are ALREADY pro-rated by lopFactor above, so `gross`
            // already reflects the LOP reduction. We must NOT also subtract a separate
            // LOP amount or LOP would be deducted twice (understating net pay).
            var pfEmp = structure.PfApplicable ? Math.Min(basic, 15000) * 0.12m : 0;
            var esiEmp = esiEligible ? gross * 0.0075m : 0;
            var lopDeduction = 0m;  // LOP is baked into pro-rated gross; shown via DaysAbsent
            var totalDed = pfEmp + esiEmp + lopDeduction;

            // Employer contributions
            var pfEmployer = structure.PfApplicable ? Math.Min(basic, 15000) * 0.12m : 0;
            var esiEmployer = esiEligible ? gross * 0.0325m : 0;

            var net = gross - totalDed;

            PayrollRecord payroll;
            if (existing != null)
            {
                payroll = existing;
            }
            else
            {
                payroll = new PayrollRecord
                {
                    Id = Guid.NewGuid(),
                    FirmId = firmId,
                    EmployeeId = emp.Id,
                    PeriodYear = year,
                    PeriodMonth = month,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                _db.PayrollRecords.Add(payroll);
            }

            payroll.Basic = Math.Round(basic, 2);
            payroll.Hra = Math.Round(hra, 2);
            payroll.Special = Math.Round(special, 2);
            payroll.Conveyance = Math.Round(conveyance, 2);
            payroll.Medical = Math.Round(medical, 2);
            payroll.GrossSalary = Math.Round(gross, 2);
            payroll.PfEmployee = Math.Round(pfEmp, 2);
            payroll.EsiEmployee = Math.Round(esiEmp, 2);
            payroll.LopDeduction = Math.Round(lopDeduction, 2);
            payroll.TotalDeductions = Math.Round(totalDed, 2);
            payroll.PfEmployer = Math.Round(pfEmployer, 2);
            payroll.EsiEmployer = Math.Round(esiEmployer, 2);
            payroll.NetSalary = Math.Round(net, 2);
            payroll.DaysInMonth = daysInMonth;
            payroll.DaysPresent = daysPresent + daysHalf;
            payroll.DaysAbsent = lopDays;
            payroll.DaysPaidLeave = paidLeave;
            payroll.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();
        return await GetPayrollMonth(year, month);
    }

    public async Task MarkPaid(Guid payrollId, Guid firmId, Guid branchId, Guid byUserId)
    {
        using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var payroll = await _db.PayrollRecords.SingleAsync(p => p.Id == payrollId);
            if (payroll.IsPaid) return;

            payroll.IsPaid = true;
            payroll.PaidAt = DateTimeOffset.UtcNow;

            // Auto-post to accounting
            // Dr Salary Expense (gross)
            // Cr Bank Account (net)
            // Cr PF Payable (employee + employer)
            // Cr ESI Payable
            var voucherId = await PostSalaryVoucher(payroll, firmId, branchId, byUserId);
            payroll.VoucherId = voucherId;
            payroll.UpdatedAt = DateTimeOffset.UtcNow;

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    /// <summary>
    /// P0-4 fix: Posts a properly-balanced salary Journal Voucher.
    /// Build ALL liability/expense lines first, derive net-to-bank as the plug so the books balance correctly.
    /// Books:
    ///   Dr Salary & Wages Expense      (gross)
    ///   Dr Employer PF Expense          (employer PF contribution)
    ///   Dr Employer ESI Expense         (employer ESI contribution)
    ///       Cr PF Payable               (employee + employer combined)
    ///       Cr ESI Payable              (employee + employer combined)
    ///       Cr TDS Payable              (income tax deducted)
    ///       Cr Professional Tax Payable
    ///       Cr Salary Advance / Loan Recovered
    ///       Cr Bank                     (= net actually paid; plug to balance)
    /// </summary>
    private async Task<Guid> PostSalaryVoucher(PayrollRecord payroll, Guid firmId, Guid branchId, Guid userId)
    {
        // Expense ledgers
        var salaryExpense = await FindOrCreateLedger(firmId, "Salary & Wages", "Indirect Expenses");
        var pfEmployerExpense = await FindOrCreateLedger(firmId, "PF Employer Contribution", "Indirect Expenses");
        var esiEmployerExpense = await FindOrCreateLedger(firmId, "ESI Employer Contribution", "Indirect Expenses");

        // Payable/liability ledgers
        var pfPayable = await FindOrCreateLedger(firmId, "PF Payable", "Duties & Taxes");
        var esiPayable = await FindOrCreateLedger(firmId, "ESI Payable", "Duties & Taxes");
        var tdsPayable = await FindOrCreateLedger(firmId, "TDS Payable", "Duties & Taxes");
        var ptPayable = await FindOrCreateLedger(firmId, "Professional Tax Payable", "Duties & Taxes");
        var advanceRecovered = await FindOrCreateLedger(firmId, "Salary Advance Recovered", "Current Liabilities");
        var loanRecovered = await FindOrCreateLedger(firmId, "Staff Loan Recovered", "Current Liabilities");

        // Bank (defaults to first bank ledger; if none, falls back to Cash)
        var bankLedger = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name.Contains("Bank"))
            .Select(l => l.Id).FirstOrDefaultAsync();
        if (bankLedger == Guid.Empty)
            bankLedger = await FindOrCreateLedger(firmId, "Cash", "Cash-in-Hand");

        // P0-3: atomic voucher_no via voucher_counters
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                  ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                  ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");
        var prefix = branch.VoucherPrefix ?? $"{branch.Code}-V-";
        var voucherSeq = await ReserveCounterAsync(firmId, branchId, "voucher.journal", GetFyYear());
        var voucherNo = $"{prefix}J{voucherSeq:D4}";

        var voucher = new Voucher
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            BranchId = branchId,
            VoucherType = "journal",                // Per audit: payroll is a JV, not a payment
            VoucherNo = voucherNo,
            VoucherDate = DateOnly.FromDateTime(DateTime.Now),
            Narration = $"Salary JV for {payroll.PeriodMonth:00}/{payroll.PeriodYear} (Emp {payroll.EmployeeId})",
            TotalAmount = (payroll.GrossSalary ?? 0) + payroll.PfEmployer + payroll.EsiEmployer,
            SourceModule = "hr",
            SourceRefId = payroll.Id,
            IsPosted = true,
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        int order = 0;
        decimal totalDr = 0, totalCr = 0;

        // ===== DEBITS (Expenses) =====
        var gross = payroll.GrossSalary ?? 0;
        voucher.Lines.Add(new VoucherLine
        {
            Id = Guid.NewGuid(), VoucherId = voucher.Id,
            LedgerId = salaryExpense, DebitCredit = "Dr",
            Amount = gross,
            Narration = "Gross salary expense", SortOrder = order++
        });
        totalDr += gross;

        if (payroll.PfEmployer > 0)
        {
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = pfEmployerExpense, DebitCredit = "Dr",
                Amount = payroll.PfEmployer,
                Narration = "Employer PF contribution", SortOrder = order++
            });
            totalDr += payroll.PfEmployer;
        }
        if (payroll.EsiEmployer > 0)
        {
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = esiEmployerExpense, DebitCredit = "Dr",
                Amount = payroll.EsiEmployer,
                Narration = "Employer ESI contribution", SortOrder = order++
            });
            totalDr += payroll.EsiEmployer;
        }

        // ===== CREDITS (Liabilities) =====
        var pfTotal = payroll.PfEmployee + payroll.PfEmployer;
        if (pfTotal > 0)
        {
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = pfPayable, DebitCredit = "Cr",
                Amount = pfTotal,
                Narration = $"PF Payable (Emp ₹{payroll.PfEmployee} + Empr ₹{payroll.PfEmployer})", SortOrder = order++
            });
            totalCr += pfTotal;
        }
        var esiTotal = payroll.EsiEmployee + payroll.EsiEmployer;
        if (esiTotal > 0)
        {
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = esiPayable, DebitCredit = "Cr",
                Amount = esiTotal,
                Narration = $"ESI Payable (Emp ₹{payroll.EsiEmployee} + Empr ₹{payroll.EsiEmployer})", SortOrder = order++
            });
            totalCr += esiTotal;
        }
        if (payroll.Tds > 0)
        {
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = tdsPayable, DebitCredit = "Cr",
                Amount = payroll.Tds, Narration = "TDS u/s 192", SortOrder = order++
            });
            totalCr += payroll.Tds;
        }
        if (payroll.ProfessionalTax > 0)
        {
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = ptPayable, DebitCredit = "Cr",
                Amount = payroll.ProfessionalTax, Narration = "Professional Tax", SortOrder = order++
            });
            totalCr += payroll.ProfessionalTax;
        }
        if (payroll.AdvanceDeduction > 0)
        {
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = advanceRecovered, DebitCredit = "Cr",
                Amount = payroll.AdvanceDeduction, Narration = "Salary advance recovered", SortOrder = order++
            });
            totalCr += payroll.AdvanceDeduction;
        }
        if (payroll.LoanDeduction > 0)
        {
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = loanRecovered, DebitCredit = "Cr",
                Amount = payroll.LoanDeduction, Narration = "Loan EMI recovered", SortOrder = order++
            });
            totalCr += payroll.LoanDeduction;
        }

        // ===== PLUG: Net-to-Bank (derived to balance the books) =====
        var netToBank = totalDr - totalCr;
        if (netToBank < 0)
        {
            // Net is negative — employee owes the firm. Cr Salary Advance Receivable instead.
            var advanceReceivable = await FindOrCreateLedger(firmId, "Salary Advance Receivable", "Current Assets");
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = advanceReceivable, DebitCredit = "Dr",
                Amount = -netToBank,
                Narration = "Negative net (advance receivable)", SortOrder = order++
            });
        }
        else if (netToBank > 0)
        {
            voucher.Lines.Add(new VoucherLine
            {
                Id = Guid.NewGuid(), VoucherId = voucher.Id,
                LedgerId = bankLedger, DebitCredit = "Cr",
                Amount = netToBank,
                Narration = "Net salary paid (bank)", SortOrder = order++
            });
        }
        // If netToBank == 0, no bank line needed; ledger already balances.

        // Final balance assertion (DB trigger will also catch this, but fail fast)
        var finalDr = voucher.Lines.Where(l => l.DebitCredit == "Dr").Sum(l => l.Amount);
        var finalCr = voucher.Lines.Where(l => l.DebitCredit == "Cr").Sum(l => l.Amount);
        if (Math.Abs(finalDr - finalCr) > 0.01m)
            throw new InvalidOperationException(
                $"Salary voucher unbalanced: Dr={finalDr}, Cr={finalCr}, diff={finalDr - finalCr}");

        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
        return voucher.Id;
    }

    private static int GetFyYear()
    {
        var today = DateTime.Now;
        return today.Month >= 4 ? today.Year : today.Year - 1;
    }

    /// <summary>Atomic counter shared with BillService pattern.</summary>
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

    private async Task<Guid> FindOrCreateLedger(Guid firmId, string ledgerName, string subGroupName)
    {
        var existing = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == ledgerName)
            .Select(l => l.Id).FirstOrDefaultAsync();
        if (existing != Guid.Empty) return existing;

        var subGroup = await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId && s.Name == subGroupName);
        if (subGroup == null)
            throw new InvalidOperationException($"Sub group '{subGroupName}' not found");

        var ledger = new Ledger
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            SubGroupId = subGroup.Id,
            Name = ledgerName,
            OpeningBalance = 0,
            OpeningType = "Dr",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Ledgers.Add(ledger);
        await _db.SaveChangesAsync();
        return ledger.Id;
    }

    private async Task<string> GenerateVoucherNo(Guid firmId, Guid branchId, string prefix)
    {
        var fyStart = GetFyStart();
        var count = await _db.Vouchers.IgnoreQueryFilters()
            .CountAsync(v => v.FirmId == firmId && v.BranchId == branchId
                && v.VoucherType == "payment" && v.VoucherDate >= fyStart);
        return $"{prefix}P{(count + 1):D4}";
    }

    private DateOnly GetFyStart()
    {
        var t = DateTime.Now;
        return t.Month >= 4 ? new DateOnly(t.Year, 4, 1) : new DateOnly(t.Year - 1, 4, 1);
    }

    public async Task<List<PayslipDto>> GetPayrollMonth(int year, int month)
    {
        var records = await _db.PayrollRecords
            .Where(p => p.PeriodYear == year && p.PeriodMonth == month)
            .ToListAsync();
        return await ToDtos(records);
    }

    public async Task<PayslipDto?> GetPayslip(Guid id)
    {
        var p = await _db.PayrollRecords.FirstOrDefaultAsync(x => x.Id == id);
        if (p == null) return null;
        return (await ToDtos(new() { p })).First();
    }

    public async Task<List<PayslipDto>> MyPayslips(Guid employeeId)
    {
        var records = await _db.PayrollRecords
            .Where(p => p.EmployeeId == employeeId)
            .OrderByDescending(p => p.PeriodYear).ThenByDescending(p => p.PeriodMonth)
            .Take(12)
            .ToListAsync();
        return await ToDtos(records);
    }

    private async Task<List<PayslipDto>> ToDtos(List<PayrollRecord> records)
    {
        var empIds = records.Select(r => r.EmployeeId).Distinct().ToList();
        var names = await (from e in _db.EmployeeProfiles
                           join c in _db.Contacts on e.ContactId equals c.Id
                           where empIds.Contains(e.Id)
                           select new { e.Id, c.DisplayName })
                          .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

        var voucherIds = records.Where(r => r.VoucherId.HasValue).Select(r => r.VoucherId!.Value).Distinct().ToList();
        var voucherNos = await _db.Vouchers
            .Where(v => voucherIds.Contains(v.Id))
            .ToDictionaryAsync(v => v.Id, v => v.VoucherNo);

        return records.Select(r => new PayslipDto(
            r.Id, r.EmployeeId, names.GetValueOrDefault(r.EmployeeId, "—"),
            r.PeriodYear, r.PeriodMonth,
            r.Basic, r.Hra, r.Da, r.Special, r.Conveyance, r.Medical,
            r.Bonus, r.Incentive, r.OvertimeAmount, r.OtherEarnings,
            r.GrossSalary ?? 0,
            r.PfEmployee, r.EsiEmployee, r.Tds, r.ProfessionalTax,
            r.LoanDeduction, r.AdvanceDeduction, r.LopDeduction, r.OtherDeductions,
            r.TotalDeductions ?? 0,
            r.PfEmployer, r.EsiEmployer,
            r.NetSalary ?? 0,
            r.DaysInMonth, r.DaysPresent, r.DaysAbsent, r.DaysPaidLeave,
            r.IsPaid, r.PaidAt, r.VoucherId,
            r.VoucherId.HasValue ? voucherNos.GetValueOrDefault(r.VoucherId.Value) : null
        )).ToList();
    }

    private int GetWeekendsInMonth(int year, int month)
    {
        var firstDay = new DateTime(year, month, 1);
        var daysInMonth = DateTime.DaysInMonth(year, month);
        int weekends = 0;
        for (int i = 0; i < daysInMonth; i++)
        {
            var d = firstDay.AddDays(i);
            if (d.DayOfWeek == DayOfWeek.Sunday) weekends++;
        }
        return weekends;
    }
}

// =============================================================================
// HR Dashboard Service
// =============================================================================
public interface IHrDashboardService
{
    Task<HrDashboardDto> GetDashboard(Guid firmId);
}

public class HrDashboardService : IHrDashboardService
{
    private readonly AppDbContext _db;
    public HrDashboardService(AppDbContext db) => _db = db;

    public async Task<HrDashboardDto> GetDashboard(Guid firmId)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);

        var total = await _db.EmployeeProfiles.CountAsync(e => e.FirmId == firmId);
        var active = await _db.EmployeeProfiles.CountAsync(e => e.FirmId == firmId && e.IsActive);

        var todayLogs = await _db.AttendanceLogs.Where(a => a.FirmId == firmId && a.LogDate == today).ToListAsync();
        var present = todayLogs.Count(l => l.CheckInAt.HasValue);
        var onLeave = await _db.LeaveRequests
            .Where(l => l.FirmId == firmId && l.Status == "approved"
                && l.FromDate <= today && l.ToDate >= today)
            .CountAsync();
        var absent = Math.Max(0, active - present - onLeave);

        var pendingLeaves = await _db.LeaveRequests
            .Where(l => l.FirmId == firmId && l.Status == "pending")
            .CountAsync();

        // Monthly payroll budget (sum of CTC for active employees)
        var monthlyBudget = await (from e in _db.EmployeeProfiles
                                    join s in _db.SalaryStructures on e.SalaryStructureId equals s.Id
                                    where e.FirmId == firmId && e.IsActive
                                    select s.MonthlyCtc).SumAsync();

        return new HrDashboardDto(
            total, active, present, absent, onLeave,
            active > 0 ? (decimal)present / active * 100 : 0,
            pendingLeaves, monthlyBudget, 0);
    }
}
