using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;
using Namokara.Api.Modules.Accounting.Services;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// AP ACCOUNTING (Anjaninex Books) — sab AP ke andar:
// income/expense summary, vouchers, expense entry, invoices list + bill/receipt data.
// Data "Anjaninex Books" internal firm me rehta hai; admin ko login nahi karna padta.
// =============================================================================
public record AddExpenseDto(
    string Date,            // yyyy-MM-dd
    decimal Amount,
    Guid? LedgerId,         // existing expense ledger
    string? NewLedgerName,  // ya naya ledger naam
    string PaidFrom,        // bank | cash
    string? Narration);

public record BooksVoucherLineDto(Guid LedgerId, string DrCr, decimal Amount);
public record AddBooksVoucherDto(
    string Type,            // receipt | payment | contra | journal
    string Date,            // yyyy-MM-dd
    string? Narration,
    List<BooksVoucherLineDto> Lines);

public record AddBooksLedgerDto(string Name, Guid SubGroupId, decimal OpeningBalance = 0, string OpeningType = "Dr");

[ApiController]
[Route("api/admin/books")]
[Authorize]
public class AdminBooksController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IVoucherService _vouchers;
    private readonly IPlatformAdminService _admin;
    private readonly IReportsService _reports;

    public AdminBooksController(AppDbContext db, IVoucherService vouchers, IPlatformAdminService admin, IReportsService reports)
    {
        _db = db;
        _vouchers = vouchers;
        _admin = admin;
        _reports = reports;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirst("user_id")?.Value!);

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    private async Task<Guid?> BooksFirmId()
    {
        await using var cmd = await CmdAsync("SELECT books_firm_id FROM platform.billing_settings WHERE id = 1");
        var v = await cmd.ExecuteScalarAsync();
        return v is Guid g && g != Guid.Empty ? g : null;
    }

    // 1-click setup: Books firm + chart of accounts bana ke pointer save
    [HttpPost("init")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Init()
        => Ok(new { booksFirmId = await _admin.EnsureBooksFirm() });

    // Income / Expense / Net summary
    [HttpGet("summary")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Summary()
    {
        var books = await BooksFirmId();
        if (books == null) return Ok(new { ready = false });

        var income = await _db.Vouchers
            .Where(v => v.FirmId == books.Value && v.VoucherType == "receipt")
            .SumAsync(v => (decimal?)v.TotalAmount) ?? 0;
        var expense = await _db.Vouchers
            .Where(v => v.FirmId == books.Value && v.VoucherType == "payment")
            .SumAsync(v => (decimal?)v.TotalAmount) ?? 0;
        var count = await _db.Vouchers.CountAsync(v => v.FirmId == books.Value);

        return Ok(new { ready = true, booksFirmId = books, income, expense, net = income - expense, voucherCount = count });
    }

    // Vouchers list (latest first)
    [HttpGet("vouchers")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Vouchers([FromQuery] int limit = 100)
    {
        var books = await BooksFirmId();
        if (books == null) return Ok(Array.Empty<object>());

        // Pehle DB se raw lao, format memory me karo (DateOnly.ToString SQL me translate nahi hota)
        var raw = await _db.Vouchers.AsNoTracking()
            .Where(v => v.FirmId == books.Value)
            .OrderByDescending(v => v.VoucherDate).ThenByDescending(v => v.CreatedAt)
            .Take(Math.Clamp(limit, 1, 500))
            .Select(v => new { v.Id, v.VoucherType, v.VoucherNo, v.VoucherDate, v.TotalAmount, v.Narration })
            .ToListAsync();

        return Ok(raw.Select(v => new
        {
            id = v.Id,
            type = v.VoucherType,
            no = v.VoucherNo,
            date = v.VoucherDate.ToString("dd-MM-yyyy"),
            amount = v.TotalAmount,
            narration = v.Narration
        }));
    }

    // Expense ledgers (dropdown ke liye) — Expenses head ke neeche ke ledgers
    [HttpGet("expense-ledgers")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> ExpenseLedgers()
    {
        var books = await BooksFirmId();
        if (books == null) return Ok(Array.Empty<object>());

        var rows = await (from l in _db.Ledgers
                          join sg in _db.SubGroups on l.SubGroupId equals sg.Id
                          join g in _db.AccountGroups on sg.GroupId equals g.Id
                          join h in _db.AccountHeads on g.HeadId equals h.Id
                          where l.FirmId == books.Value && h.Nature == "expenses"
                          orderby l.Name
                          select new { l.Id, l.Name })
                         .ToListAsync();
        return Ok(rows);
    }

    // Expense entry → payment voucher (Dr Expense / Cr Bank ya Cash)
    [HttpPost("expense")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> AddExpense([FromBody] AddExpenseDto dto)
    {
        if (dto.Amount <= 0) return BadRequest(new { error = "Amount 0 se zyada ho." });

        var books = await BooksFirmId();
        if (books == null) return BadRequest(new { error = "Pehle Books setup karo (Init button)." });

        var branchId = await _db.Branches
            .Where(b => b.FirmId == books.Value)
            .OrderByDescending(b => b.IsHeadOffice)
            .Select(b => (Guid?)b.Id)
            .FirstOrDefaultAsync();
        if (branchId == null) return BadRequest(new { error = "Books firm me branch nahi mili." });

        // Expense ledger: existing ya naya
        Guid expenseLedger;
        if (dto.LedgerId.HasValue)
        {
            expenseLedger = dto.LedgerId.Value;
        }
        else if (!string.IsNullOrWhiteSpace(dto.NewLedgerName))
        {
            expenseLedger = await EnsureLedger(books.Value, "Office Expenses", dto.NewLedgerName.Trim(), "Dr");
        }
        else
        {
            return BadRequest(new { error = "Expense ledger choose karo ya naya naam do." });
        }

        var sourceLedger = dto.PaidFrom == "cash"
            ? await EnsureLedger(books.Value, "Cash-in-Hand", "Cash", "Dr")
            : await EnsureLedger(books.Value, "Bank Accounts", "Bank A/c", "Dr");

        if (!DateOnly.TryParse(dto.Date, out var vDate))
            vDate = DateOnly.FromDateTime(DateTime.Today);

        var voucher = await _vouchers.Create(new CreateVoucherDto(
            "payment", vDate, dto.Narration,
            new List<CreateVoucherLineDto>
            {
                new(expenseLedger, "Dr", dto.Amount, null),
                new(sourceLedger, "Cr", dto.Amount, null)
            }), books.Value, branchId.Value, CurrentUserId);

        return Ok(new { success = true, voucherNo = voucher.VoucherNo });
    }

    private async Task<Guid> EnsureLedger(Guid firmId, string subGroupName, string ledgerName, string type)
    {
        var existing = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == ledgerName)
            .Select(l => (Guid?)l.Id).FirstOrDefaultAsync();
        if (existing != null) return existing.Value;

        var sg = await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId && s.Name == subGroupName)
              ?? await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId);
        if (sg == null) throw new InvalidOperationException("Books firm me chart of accounts nahi hai.");

        var led = new Ledger
        {
            Id = Guid.NewGuid(), FirmId = firmId, SubGroupId = sg.Id,
            Name = ledgerName, OpeningBalance = 0, OpeningType = type
        };
        _db.Ledgers.Add(led);
        await _db.SaveChangesAsync();
        return led.Id;
    }

    // ==========================================================================
    // PURI ACCOUNTING — saare ledgers, naya ledger, har type ka voucher, reports
    // ==========================================================================

    // Saare ledgers (voucher entry dropdown ke liye) — group/head ke saath
    [HttpGet("ledgers")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> AllLedgers()
    {
        var books = await BooksFirmId();
        if (books == null) return Ok(Array.Empty<object>());

        var rows = await (from l in _db.Ledgers
                          join sg in _db.SubGroups on l.SubGroupId equals sg.Id
                          join g in _db.AccountGroups on sg.GroupId equals g.Id
                          join h in _db.AccountHeads on g.HeadId equals h.Id
                          where l.FirmId == books.Value && l.IsActive
                          orderby h.SortOrder, l.Name
                          select new { l.Id, l.Name, subGroup = sg.Name, head = h.Name })
                         .ToListAsync();
        return Ok(rows);
    }

    // Sub-groups (naya ledger banane ke liye)
    [HttpGet("sub-groups")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> SubGroupsList()
    {
        var books = await BooksFirmId();
        if (books == null) return Ok(Array.Empty<object>());

        // Raw columns lao, label memory me banao (lambi string-interpolation SQL me translate nahi hoti)
        var raw = await (from sg in _db.SubGroups
                         join g in _db.AccountGroups on sg.GroupId equals g.Id
                         join h in _db.AccountHeads on g.HeadId equals h.Id
                         where sg.FirmId == books.Value
                         orderby h.SortOrder, g.Name, sg.Name
                         select new { sg.Id, SgName = sg.Name, GName = g.Name, HName = h.Name })
                        .ToListAsync();

        return Ok(raw.Select(x => new { x.Id, name = $"{x.SgName}  ({x.GName} · {x.HName})" }));
    }

    // Naya ledger
    [HttpPost("ledger")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> AddLedger([FromBody] AddBooksLedgerDto dto)
    {
        var books = await BooksFirmId();
        if (books == null) return BadRequest(new { error = "Pehle Books setup karo." });
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { error = "Ledger ka naam do." });

        var led = new Ledger
        {
            Id = Guid.NewGuid(), FirmId = books.Value, SubGroupId = dto.SubGroupId,
            Name = dto.Name.Trim(), OpeningBalance = dto.OpeningBalance,
            OpeningType = dto.OpeningType == "Cr" ? "Cr" : "Dr"
        };
        _db.Ledgers.Add(led);
        await _db.SaveChangesAsync();
        return Ok(new { led.Id, led.Name });
    }

    // GENERIC VOUCHER — receipt / payment / CONTRA / JOURNAL (multi-line, Dr=Cr zaroori)
    [HttpPost("voucher")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> AddVoucher([FromBody] AddBooksVoucherDto dto)
    {
        var allowed = new[] { "receipt", "payment", "contra", "journal" };
        if (!allowed.Contains(dto.Type)) return BadRequest(new { error = "Type galat hai." });
        if (dto.Lines == null || dto.Lines.Count < 2) return BadRequest(new { error = "Kam se kam 2 lines chahiye (Dr + Cr)." });

        var dr = dto.Lines.Where(l => l.DrCr == "Dr").Sum(l => l.Amount);
        var cr = dto.Lines.Where(l => l.DrCr == "Cr").Sum(l => l.Amount);
        if (Math.Abs(dr - cr) > 0.01m)
            return BadRequest(new { error = $"Voucher balanced nahi: Dr ₹{dr:N2} ≠ Cr ₹{cr:N2}" });

        var books = await BooksFirmId();
        if (books == null) return BadRequest(new { error = "Pehle Books setup karo." });

        var branchId = await _db.Branches
            .Where(b => b.FirmId == books.Value)
            .OrderByDescending(b => b.IsHeadOffice)
            .Select(b => (Guid?)b.Id).FirstOrDefaultAsync();
        if (branchId == null) return BadRequest(new { error = "Books firm me branch nahi mili." });

        if (!DateOnly.TryParse(dto.Date, out var vDate))
            vDate = DateOnly.FromDateTime(DateTime.Today);

        var voucher = await _vouchers.Create(new CreateVoucherDto(
            dto.Type, vDate, dto.Narration,
            dto.Lines.Select(l => new CreateVoucherLineDto(l.LedgerId, l.DrCr == "Cr" ? "Cr" : "Dr", l.Amount, null)).ToList()),
            books.Value, branchId.Value, CurrentUserId);

        return Ok(new { success = true, voucherNo = voucher.VoucherNo });
    }

    // ---- REPORTS: Trial Balance / P&L / Balance Sheet (Books firm ke) ----
    [HttpGet("reports/trial-balance")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> TrialBalance([FromQuery] string? asOf)
    {
        var books = await BooksFirmId();
        if (books == null) return BadRequest(new { error = "Pehle Books setup karo." });
        var d = DateOnly.TryParse(asOf, out var x) ? x : DateOnly.FromDateTime(DateTime.Today);
        return Ok(await _reports.TrialBalance(d, books.Value));
    }

    [HttpGet("reports/pnl")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Pnl([FromQuery] string? from, [FromQuery] string? to)
    {
        var books = await BooksFirmId();
        if (books == null) return BadRequest(new { error = "Pehle Books setup karo." });
        var today = DateOnly.FromDateTime(DateTime.Today);
        var f = DateOnly.TryParse(from, out var x1) ? x1
              : (today.Month >= 4 ? new DateOnly(today.Year, 4, 1) : new DateOnly(today.Year - 1, 4, 1));
        var t = DateOnly.TryParse(to, out var x2) ? x2 : today;
        return Ok(await _reports.ProfitLoss(f, t, books.Value));
    }

    [HttpGet("reports/balance-sheet")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> BalanceSheet([FromQuery] string? asOf)
    {
        var books = await BooksFirmId();
        if (books == null) return BadRequest(new { error = "Pehle Books setup karo." });
        var d = DateOnly.TryParse(asOf, out var x) ? x : DateOnly.FromDateTime(DateTime.Today);
        return Ok(await _reports.BalanceSheet(d, books.Value));
    }

    // ==========================================================================
    // INVOICES — saare issued invoices (approved payments) AP me
    // ==========================================================================
    [HttpGet("invoices")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Invoices([FromQuery] int limit = 300)
    {
        var sql = @"SELECT pr.id, pr.invoice_no, pr.amount, pr.taxable, pr.gst_amount, pr.gst_rate,
                           to_char(pr.reviewed_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY') AS inv_date,
                           f.name AS firm_name
                    FROM platform.payment_requests pr
                    JOIN platform.firms f ON f.id = pr.firm_id
                    WHERE pr.status = 'approved'
                    ORDER BY pr.reviewed_at DESC
                    LIMIT @lim";
        await using var cmd = await CmdAsync(sql);
        cmd.Parameters.Add(new NpgsqlParameter("lim", Math.Clamp(limit, 1, 1000)));
        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var amount = Convert.ToDecimal(r["amount"]);
            list.Add(new
            {
                id = (Guid)r["id"],
                invoiceNo = r["invoice_no"] as string ?? "—",
                date = r["inv_date"] as string,
                firmName = r["firm_name"] as string,
                amount,
                taxable = r["taxable"] is DBNull ? amount : Convert.ToDecimal(r["taxable"]),
                gstAmount = r["gst_amount"] is DBNull ? 0m : Convert.ToDecimal(r["gst_amount"]),
                gstRate = r["gst_rate"] is DBNull ? 0m : Convert.ToDecimal(r["gst_rate"])
            });
        }
        return Ok(list);
    }

    // Ek invoice ka pura data (Bill/Receipt print ke liye) — admin side, koi firm-scope nahi
    [HttpGet("invoice/{id}")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Invoice(Guid id)
    {
        await using var cmd = await CmdAsync(
            @"SELECT pr.invoice_no, pr.amount, pr.taxable, pr.gst_amount, pr.gst_rate,
                     pr.method, pr.reference,
                     to_char(pr.reviewed_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY') AS inv_date,
                     f.name AS firm_name, f.gst_number AS firm_gst, f.city AS firm_city, f.state AS firm_state,
                     bs.payee_name, bs.gstin AS payee_gstin
              FROM platform.payment_requests pr
              JOIN platform.firms f ON f.id = pr.firm_id
              LEFT JOIN platform.billing_settings bs ON bs.id = 1
              WHERE pr.id = @id AND pr.status = 'approved'");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return NotFound(new { error = "Invoice nahi mila." });

        var amount = Convert.ToDecimal(r["amount"]);
        return Ok(new
        {
            invoiceNo = r["invoice_no"] as string ?? "—",
            date = r["inv_date"] as string,
            firmName = r["firm_name"] as string,
            firmGst = r["firm_gst"] as string,
            firmCity = r["firm_city"] as string,
            firmState = r["firm_state"] as string,
            payeeName = r["payee_name"] as string ?? "Anjaninex",
            payeeGstin = r["payee_gstin"] as string,
            amount,
            taxable = r["taxable"] is DBNull ? amount : Convert.ToDecimal(r["taxable"]),
            gstAmount = r["gst_amount"] is DBNull ? 0m : Convert.ToDecimal(r["gst_amount"]),
            gstRate = r["gst_rate"] is DBNull ? 0m : Convert.ToDecimal(r["gst_rate"]),
            method = r["method"] as string,
            reference = r["reference"] as string
        });
    }
}
