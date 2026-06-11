using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Trading.Controllers;

// Real Pro Dashboard data — KPIs, 12-month trend, branch breakup — scoped to current firm.
// period: week | month | quarter | year (default) · branchId: optional branch filter
[ApiController]
[Authorize]
[Route("api/dashboard")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;
    public DashboardController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    [HttpGet("pro")]
    public async Task<IActionResult> Pro([FromQuery] string? period, [FromQuery] Guid? branchId)
    {
        var firmId = CurrentFirmId;

        // ---- Period range (buttons: This Week / Month / Quarter / Full Year) ----
        var today = DateOnly.FromDateTime(DateTime.Today);
        var fyStart = today.Month >= 4 ? new DateOnly(today.Year, 4, 1) : new DateOnly(today.Year - 1, 4, 1);
        var fyEnd = new DateOnly(fyStart.Year + 1, 3, 31);

        DateOnly start, end = today;
        string label;
        switch (period)
        {
            case "week":
                start = today.AddDays(-6); label = "Last 7 days"; break;
            case "month":
                start = new DateOnly(today.Year, today.Month, 1); label = "This Month"; break;
            case "quarter":
                var qm = ((today.Month - 1) / 3) * 3 + 1;
                start = new DateOnly(today.Year, qm, 1); label = "This Quarter"; break;
            default:
                start = fyStart; end = fyEnd;
                label = $"FY {fyStart.Year}-{(fyEnd.Year % 100):D2}"; break;
        }

        // Pichla barabar window (delta % ke liye)
        var lenDays = end.DayNumber - start.DayNumber + 1;
        var prevStart = start.AddDays(-lenDays);
        var prevEnd = start.AddDays(-1);

        // ---- KPI totals (selected period + optional branch) ----
        async Task<decimal> SalesSum(DateOnly f, DateOnly t) => await _db.Bills
            .Where(b => b.FirmId == firmId && b.BillType == "sales" && b.BillDate >= f && b.BillDate <= t
                     && (branchId == null || b.BranchId == branchId.Value))
            .SumAsync(b => (decimal?)b.Total) ?? 0;
        // Commission ACCRUED from sales bills (Party Master rate) — broker income.
        // (Pehle sirf generated invoices count hote the → card ₹0 dikhता tha.)
        var partyRates = await _db.PartyProfiles
            .Where(p => p.FirmId == firmId)
            .ToDictionaryAsync(p => p.Id, p => p.CommissionRate);
        const decimal defaultCommPct = 2m;
        decimal RateFor(Guid supId, Guid? buyId)
        {
            var s = partyRates.GetValueOrDefault(supId, 0m);
            if (s > 0) return s;
            var b = buyId.HasValue ? partyRates.GetValueOrDefault(buyId.Value, 0m) : 0m;
            return b > 0 ? b : defaultCommPct;
        }
        var commLoadFrom = prevStart < fyStart ? prevStart : fyStart;
        var commLoadTo = end > fyEnd ? end : fyEnd;
        var commBills = await _db.Bills
            .Where(b => b.FirmId == firmId && b.BillType == "sales"
                     && b.BillDate >= commLoadFrom && b.BillDate <= commLoadTo
                     && (branchId == null || b.BranchId == branchId.Value))
            .Select(b => new { b.BillDate, b.Total, b.PartyId, b.BuyerPartyId })
            .ToListAsync();
        decimal CommSum(DateOnly f, DateOnly t) =>
            commBills.Where(b => b.BillDate >= f && b.BillDate <= t)
                     .Sum(b => b.Total * RateFor(b.PartyId, b.BuyerPartyId) / 100m);
        async Task<decimal> RecvSum(DateOnly f, DateOnly t) => await _db.Payments
            .Where(p => p.FirmId == firmId && p.PaymentType == "receipt" && p.PaymentDate >= f && p.PaymentDate <= t
                     && (branchId == null || p.BranchId == branchId.Value))
            .SumAsync(p => (decimal?)p.Amount) ?? 0;
        async Task<decimal> GrSum(DateOnly f, DateOnly t) => await _db.GoodsReturns
            .Where(g => g.FirmId == firmId && g.GrDate >= f && g.GrDate <= t
                     && (branchId == null || g.BranchId == branchId.Value))
            .SumAsync(g => (decimal?)g.TotalReturnAmount) ?? 0;

        var sales = await SalesSum(start, end);
        var commission = CommSum(start, end);
        var received = await RecvSum(start, end);
        var gr = await GrSum(start, end);
        var grCount = await _db.GoodsReturns
            .CountAsync(g => g.FirmId == firmId && g.GrDate >= start && g.GrDate <= end
                          && (branchId == null || g.BranchId == branchId.Value));

        var prevSales = await SalesSum(prevStart, prevEnd);
        var prevCommission = CommSum(prevStart, prevEnd);
        var prevGr = await GrSum(prevStart, prevEnd);

        var pending = sales - received;
        if (pending < 0) pending = 0;

        // ---- 12-month trend (hamesha FY — monthly chart) + branch filter ----
        var salesM = await _db.Bills
            .Where(b => b.FirmId == firmId && b.BillType == "sales" && b.BillDate >= fyStart && b.BillDate <= fyEnd
                     && (branchId == null || b.BranchId == branchId.Value))
            .GroupBy(b => new { b.BillDate.Year, b.BillDate.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, V = g.Sum(x => x.Total) })
            .ToListAsync();
        var commM = commBills
            .Where(b => b.BillDate >= fyStart && b.BillDate <= fyEnd)
            .GroupBy(b => new { b.BillDate.Year, b.BillDate.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, V = g.Sum(x => x.Total * RateFor(x.PartyId, x.BuyerPartyId) / 100m) })
            .ToList();
        var grM = await _db.GoodsReturns
            .Where(g => g.FirmId == firmId && g.GrDate >= fyStart && g.GrDate <= fyEnd
                     && (branchId == null || g.BranchId == branchId.Value))
            .GroupBy(g => new { g.GrDate.Year, g.GrDate.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, V = g.Sum(x => x.TotalReturnAmount) })
            .ToListAsync();

        var trend = new List<object>();
        for (int i = 0; i < 12; i++)
        {
            var d = fyStart.AddMonths(i);
            decimal s = salesM.FirstOrDefault(x => x.Year == d.Year && x.Month == d.Month)?.V ?? 0;
            decimal c = commM.FirstOrDefault(x => x.Year == d.Year && x.Month == d.Month)?.V ?? 0;
            decimal g = grM.FirstOrDefault(x => x.Year == d.Year && x.Month == d.Month)?.V ?? 0;
            trend.Add(new
            {
                label = new DateTime(d.Year, d.Month, 1).ToString("MMM"),
                sales = s,
                commission = c,
                gr = g
            });
        }

        // ---- Branch-wise breakup (selected period, saari branches) ----
        var branchNames = await _db.Branches
            .Where(br => br.FirmId == firmId)
            .ToDictionaryAsync(br => br.Id, br => br.Name);

        var brSales = await _db.Bills
            .Where(b => b.FirmId == firmId && b.BillType == "sales" && b.BillDate >= start && b.BillDate <= end)
            .GroupBy(b => b.BranchId)
            .Select(g => new { BranchId = g.Key, V = g.Sum(x => x.Total) })
            .ToListAsync();
        var brRecv = await _db.Payments
            .Where(p => p.FirmId == firmId && p.PaymentType == "receipt" && p.PaymentDate >= start && p.PaymentDate <= end)
            .GroupBy(p => p.BranchId)
            .Select(g => new { BranchId = g.Key, V = g.Sum(x => x.Amount) })
            .ToListAsync();

        var branchIds = brSales.Select(x => x.BranchId).Union(brRecv.Select(x => x.BranchId)).Distinct();
        var branches = branchIds
            .Select(id => new
            {
                name = branchNames.TryGetValue(id, out var n) ? n : "—",
                sales = brSales.FirstOrDefault(x => x.BranchId == id)?.V ?? 0,
                received = brRecv.FirstOrDefault(x => x.BranchId == id)?.V ?? 0
            })
            .OrderByDescending(x => x.sales)
            .ToList();

        static decimal Pct(decimal cur, decimal prev) =>
            prev <= 0 ? (cur > 0 ? 100 : 0) : Math.Round((cur - prev) / prev * 100, 0);

        // ================= EXTRA WIDGETS — sab REAL data =================

        // Party lookup (name + credit days + rating)
        var partyRows = await (from pp in _db.PartyProfiles
                               join c in _db.Contacts on pp.ContactId equals c.Id
                               where pp.FirmId == firmId
                               select new { pp.Id, c.DisplayName, pp.CreditDays, pp.CreditRating, pp.ContactId })
                              .ToListAsync();
        var nameOf = partyRows.ToDictionary(x => x.Id, x => x.DisplayName);
        var creditOf = partyRows.ToDictionary(x => x.Id, x => x.CreditDays);
        string PName(Guid id) => nameOf.TryGetValue(id, out var n) ? n : "—";

        // ---- Order status (period) ----
        var orderStatusRaw = await _db.Orders
            .Where(o => o.FirmId == firmId && o.DeletedAt == null && o.OrderDate >= start && o.OrderDate <= end
                     && (branchId == null || o.BranchId == branchId.Value))
            .GroupBy(o => o.Status)
            .Select(g => new { Status = g.Key, N = g.Count() })
            .ToListAsync();
        int OS(string s) => orderStatusRaw.FirstOrDefault(x => x.Status == s)?.N ?? 0;
        var orderStatus = new
        {
            billed = OS("billed"),
            pending = OS("pending"),
            cancelled = OS("cancelled"),
            other = orderStatusRaw.Where(x => x.Status != "billed" && x.Status != "pending" && x.Status != "cancelled").Sum(x => x.N),
            total = orderStatusRaw.Sum(x => x.N)
        };

        // ---- Item category map (segment) ----
        var catRows = await _db.Items.Where(i => i.FirmId == firmId)
            .Select(i => new { i.Name, i.Category }).ToListAsync();
        var catMap = catRows.GroupBy(x => x.Name)
            .ToDictionary(g => g.Key, g => string.IsNullOrWhiteSpace(g.First().Category) ? "Other" : g.First().Category!);

        // ---- Top items (order lines, period) ----
        var olRows = await (from l in _db.OrderLines
                            join o in _db.Orders on l.OrderId equals o.Id
                            where o.FirmId == firmId && o.DeletedAt == null
                               && o.OrderDate >= start && o.OrderDate <= end
                               && (branchId == null || o.BranchId == branchId.Value)
                            select new { l.ItemName, l.Qty, l.TotalAmount, o.Id, Buyer = o.BuyerPartyId ?? o.PartyId })
                           .ToListAsync();
        var topItems = olRows.GroupBy(x => x.ItemName).Select(g => new
        {
            item = g.Key,
            category = catMap.TryGetValue(g.Key, out var c) ? c : "Other",
            orders = g.Select(z => z.Id).Distinct().Count(),
            buyers = g.Select(z => z.Buyer).Distinct().Count(),
            qty = g.Sum(z => z.Qty),
            amount = g.Sum(z => z.TotalAmount)
        }).OrderByDescending(x => x.orders).ThenByDescending(x => x.amount).Take(5).ToList();

        // ---- Segment mix (sales bill lines by item category) ----
        var blRows = await (from l in _db.BillLines
                            join b in _db.Bills on l.BillId equals b.Id
                            where b.FirmId == firmId && b.DeletedAt == null && b.BillType == "sales"
                               && b.BillDate >= start && b.BillDate <= end
                               && (branchId == null || b.BranchId == branchId.Value)
                            select new { l.ItemName, l.TotalAmount }).ToListAsync();
        var segmentMix = blRows
            .GroupBy(x => catMap.TryGetValue(x.ItemName, out var c) ? c : "Other")
            .Select(g => new { segment = g.Key, amount = g.Sum(x => x.TotalAmount) })
            .OrderByDescending(x => x.amount).Take(4).ToList();

        // ---- Outstanding sales bills (balance > 0) ----
        var outRaw = await _db.Bills
            .Where(b => b.FirmId == firmId && b.DeletedAt == null && b.BillType == "sales"
                     && b.Total > b.PaidAmount
                     && (branchId == null || b.BranchId == branchId.Value))
            .OrderBy(b => b.BillDate)
            .Select(b => new { b.BillNo, b.BillDate, Party = b.BuyerPartyId ?? b.PartyId, Balance = b.Total - b.PaidAmount })
            .Take(300).ToListAsync();

        var outComputed = outRaw.Select(b =>
        {
            var cd = creditOf.TryGetValue(b.Party, out var d) && d > 0 ? d : 30;
            var due = b.BillDate.AddDays(cd);
            var overdue = today.DayNumber - due.DayNumber;          // +ve = overdue
            return new
            {
                billNo = b.BillNo,
                buyer = PName(b.Party),
                amount = b.Balance,
                days = Math.Abs(overdue),
                dueDate = due.ToString("dd/MM/yy"),   // year ke saath — purane bill par "15-Apr" confuse karta tha
                status = overdue > 0 ? "overdue" : (overdue >= -7 ? "soon" : "ok"),
                ageDays = today.DayNumber - b.BillDate.DayNumber,
                party = b.Party
            };
        }).ToList();

        var outstanding = outComputed
            .OrderByDescending(x => x.status == "overdue" ? x.days : -x.days)
            .Take(10)
            .Select(x => new { x.billNo, x.buyer, x.amount, x.days, x.dueDate, x.status })
            .ToList();

        // ---- Aging buckets ----
        decimal Bucket(int lo, int hi) => outComputed.Where(x => x.ageDays >= lo && x.ageDays <= hi).Sum(x => x.amount);
        var aging = new[]
        {
            new { label = "0-30d",  amount = Bucket(0, 30) },
            new { label = "31-60d", amount = Bucket(31, 60) },
            new { label = "61-90d", amount = Bucket(61, 90) },
            new { label = "90d+",   amount = outComputed.Where(x => x.ageDays > 90).Sum(x => x.amount) }
        };

        // ---- Receipts by payment mode (period) ----
        var payModes = await _db.Payments
            .Where(p => p.FirmId == firmId && p.DeletedAt == null && p.PaymentType == "receipt"
                     && p.PaymentDate >= start && p.PaymentDate <= end
                     && (branchId == null || p.BranchId == branchId.Value))
            .GroupBy(p => p.PaymentMode)
            .Select(g => new { mode = g.Key, amount = g.Sum(x => x.Amount), n = g.Count() })
            .OrderByDescending(x => x.amount).ToListAsync();

        // ---- GR status + reasons (period) ----
        var grStatus = await _db.GoodsReturns
            .Where(g0 => g0.FirmId == firmId && g0.DeletedAt == null
                      && g0.GrDate >= start && g0.GrDate <= end
                      && (branchId == null || g0.BranchId == branchId.Value))
            .GroupBy(g0 => g0.Status)
            .Select(g => new { status = g.Key, n = g.Count(), amount = g.Sum(x => x.TotalReturnAmount) })
            .ToListAsync();
        var grReasons = await _db.GoodsReturns
            .Where(g0 => g0.FirmId == firmId && g0.DeletedAt == null
                      && g0.GrDate >= start && g0.GrDate <= end
                      && (branchId == null || g0.BranchId == branchId.Value))
            .GroupBy(g0 => g0.Reason ?? "Other")
            .Select(g => new { reason = g.Key, amount = g.Sum(x => x.TotalReturnAmount), n = g.Count() })
            .OrderByDescending(x => x.amount).Take(5).ToListAsync();

        // ---- Supplier performance (sales + returns by supplier, period) ----
        var supSales = await _db.Bills
            .Where(b => b.FirmId == firmId && b.DeletedAt == null && b.BillType == "sales"
                     && b.BillDate >= start && b.BillDate <= end
                     && (branchId == null || b.BranchId == branchId.Value))
            .GroupBy(b => b.PartyId)
            .Select(g => new { Party = g.Key, Sales = g.Sum(x => x.Total), Bills = g.Count() })
            .ToListAsync();
        var supGr = await _db.GoodsReturns
            .Where(g0 => g0.FirmId == firmId && g0.DeletedAt == null
                      && g0.GrDate >= start && g0.GrDate <= end
                      && (branchId == null || g0.BranchId == branchId.Value))
            .GroupBy(g0 => g0.SupplierPartyId)
            .Select(g => new { Party = g.Key, V = g.Sum(x => x.TotalReturnAmount) })
            .ToListAsync();
        var supplierPerf = supSales.OrderByDescending(x => x.Sales).Take(5).Select(s =>
        {
            var grA = supGr.FirstOrDefault(x => x.Party == s.Party)?.V ?? 0;
            return new
            {
                name = PName(s.Party),
                bills = s.Bills,
                sales = s.Sales,
                grAmount = grA,
                returnPct = s.Sales > 0 ? Math.Round(grA / s.Sales * 100, 1) : 0
            };
        }).ToList();

        // ---- Supplier-wise commission (period) ----
        var supCommRaw = await _db.CommissionInvoices
            .Where(ci => ci.FirmId == firmId && ci.InvoiceDate >= start && ci.InvoiceDate <= end
                      && (branchId == null || ci.BranchId == branchId.Value))
            .GroupBy(ci => ci.PartyId)
            .Select(g => new { Party = g.Key, V = g.Sum(x => x.CommissionAmount) })
            .OrderByDescending(x => x.V).Take(5).ToListAsync();
        var supplierComm = supCommRaw.Select(x => new { name = PName(x.Party), amount = x.V }).ToList();

        // ---- Top buyers (period) ----
        var buyRaw = await _db.Bills
            .Where(b => b.FirmId == firmId && b.DeletedAt == null && b.BillType == "sales"
                     && b.BillDate >= start && b.BillDate <= end
                     && (branchId == null || b.BranchId == branchId.Value))
            .GroupBy(b => b.BuyerPartyId ?? b.PartyId)
            .Select(g => new { Party = g.Key, Sales = g.Sum(x => x.Total), Bills = g.Count(), Paid = g.Sum(x => x.PaidAmount) })
            .OrderByDescending(x => x.Sales).Take(6).ToListAsync();
        var topBuyers = buyRaw.Select(x => new
        {
            name = PName(x.Party),
            bills = x.Bills,
            sales = x.Sales,
            outstanding = x.Sales - x.Paid < 0 ? 0 : x.Sales - x.Paid
        }).ToList();

        // ---- Party receivable vs payable ----
        var payableRaw = await _db.Bills
            .Where(b => b.FirmId == firmId && b.DeletedAt == null && b.BillType == "purchase"
                     && b.Total > b.PaidAmount
                     && (branchId == null || b.BranchId == branchId.Value))
            .GroupBy(b => b.PartyId)
            .Select(g => new { Party = g.Key, V = g.Sum(x => x.Total - x.PaidAmount) })
            .ToListAsync();
        var recvBy = outComputed.GroupBy(x => x.party).ToDictionary(g => g.Key, g => g.Sum(x => x.amount));
        var partyOut = recvBy.Keys.Union(payableRaw.Select(x => x.Party)).Distinct()
            .Select(id => new
            {
                name = PName(id),
                receivable = recvBy.TryGetValue(id, out var r) ? r : 0,
                payable = payableRaw.FirstOrDefault(x => x.Party == id)?.V ?? 0
            })
            .OrderByDescending(x => x.receivable + x.payable).Take(6).ToList();

        // ---- Party credit ratings ----
        var ratings = partyRows
            .GroupBy(x => string.IsNullOrWhiteSpace(x.CreditRating) ? "—" : x.CreditRating!)
            .Select(g => new { rating = g.Key, n = g.Count() })
            .OrderBy(x => x.rating).ToList();

        // ---- City-wise parties (contacts.addresses jsonb se) ----
        var contactIds = partyRows.Select(x => x.ContactId).ToList();
        var addrJsons = await _db.Contacts.Where(c => contactIds.Contains(c.Id))
            .Select(c => c.Addresses).ToListAsync();
        var cities = addrJsons.Select(a =>
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(string.IsNullOrWhiteSpace(a) ? "[]" : a);
                if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
                    foreach (var el in doc.RootElement.EnumerateArray())
                        if (el.ValueKind == System.Text.Json.JsonValueKind.Object
                            && el.TryGetProperty("city", out var cv)
                            && cv.ValueKind == System.Text.Json.JsonValueKind.String
                            && !string.IsNullOrWhiteSpace(cv.GetString()))
                            return cv.GetString()!.Trim();
                return "";
            }
            catch { return ""; }
        })
        .Where(c => c != "")
        .GroupBy(c => c, StringComparer.OrdinalIgnoreCase)
        .Select(g => new { city = g.Key, n = g.Count() })
        .OrderByDescending(x => x.n).Take(5).ToList();

        // ---- Smart alerts (sab real se derive) ----
        var alerts = new List<object>();
        foreach (var o in outComputed.Where(x => x.status == "overdue").OrderByDescending(x => x.days).Take(3))
            alerts.Add(new { level = "critical", icon = "🚨", title = $"Payment Overdue – {o.days} din", detail = $"{o.buyer} · ₹{o.amount:N0} · Bill {o.billNo}", time = o.dueDate });
        foreach (var o in outComputed.Where(x => x.status == "soon").OrderBy(x => x.days).Take(2))
            alerts.Add(new { level = "info", icon = "📅", title = $"Payment Due – {o.days} din mein", detail = $"{o.buyer} · ₹{o.amount:N0} · Bill {o.billNo}", time = o.dueDate });
        var grPend = grStatus.FirstOrDefault(x => x.status == "pending");
        if (grPend != null && grPend.n > 0)
            alerts.Add(new { level = "warning", icon = "⏳", title = $"{grPend.n} GR Pending Approval", detail = $"₹{grPend.amount:N0} ka return awaiting", time = "Abhi" });
        if (commission > 0)
            alerts.Add(new { level = "success", icon = "✅", title = "Commission Earned", detail = $"{label} · ₹{commission:N0}", time = "" });
        var sd = Pct(sales, prevSales);
        if (sales > 0 && sd > 0)
            alerts.Add(new { level = "info", icon = "📈", title = $"Sales Up {sd}%", detail = $"Pichhle period se ₹{(sales - prevSales):N0} zyada", time = "" });

        return Ok(new
        {
            fyLabel = label,
            kpis = new
            {
                sales,
                salesDelta = Pct(sales, prevSales),
                commission,
                commissionDelta = Pct(commission, prevCommission),
                received,
                pending,
                gr,
                grDelta = Pct(gr, prevGr),
                grCount
            },
            trend,
            branches,
            orderStatus,
            topItems,
            segmentMix,
            outstanding,
            aging,
            payModes,
            grStatus,
            grReasons,
            supplierPerf,
            supplierComm,
            topBuyers,
            partyOut,
            ratings,
            cities,
            alerts
        });
    }

    // =========================================================================
    // PARTY BEHAVIOUR — Supplier (late dispatch, bina bole maal, quality/GR)
    //                 + Buyer (payment advance/early/ontime/late, GR)
    // Sab REAL data se compute hota hai — kuch store nahi karna padta.
    // =========================================================================
    [HttpGet("behaviour")]
    public async Task<IActionResult> Behaviour()
    {
        var firmId = CurrentFirmId;
        var today = DateOnly.FromDateTime(DateTime.Today);

        // ---- Raw data (firm-scoped, soft-deleted excluded by query filters) ----
        var orders = await _db.Orders.AsNoTracking()
            .Where(o => o.FirmId == firmId)
            .Select(o => new { o.Id, o.PartyId, o.OrderDate, o.Status })
            .ToListAsync();

        var bills = await _db.Bills.AsNoTracking()
            .Where(b => b.FirmId == firmId)
            .Select(b => new { b.Id, b.PartyId, b.BuyerPartyId, b.BillDate, b.Total, b.PaidAmount, b.OrderId, b.PoNumber })
            .ToListAsync();

        var grs = await _db.GoodsReturns.AsNoTracking()
            .Where(g => g.FirmId == firmId && g.Status != "rejected")
            .Select(g => new { g.SupplierPartyId, g.BuyerPartyId, g.TotalReturnAmount })
            .ToListAsync();

        // Receipts + allocations — buyer ke payment timing ke liye
        var allocs = await _db.PaymentAllocations.AsNoTracking()
            .Join(_db.Payments.AsNoTracking().Where(p => p.FirmId == firmId && p.PaymentType == "receipt"),
                  a => a.PaymentId, p => p.Id,
                  (a, p) => new { a.BillId, a.Allocated, p.PaymentDate })
            .ToListAsync();

        var parties = await _db.PartyProfiles.AsNoTracking()
            .Where(p => p.FirmId == firmId && p.IsActive)
            .Join(_db.Contacts.AsNoTracking(), pp => pp.ContactId, c => c.Id,
                  (pp, c) => new { pp.Id, c.DisplayName, pp.PartyType, pp.CreditDays })
            .ToListAsync();

        var orderDateById = orders.ToDictionary(o => o.Id, o => o.OrderDate);
        var billById = bills.ToDictionary(b => b.Id);

        // =================== SUPPLIERS ===================
        var suppliers = new List<(decimal total, object row)>();
        foreach (var p in parties.Where(x => x.PartyType == "seller" || x.PartyType == "both"))
        {
            var pBills = bills.Where(b => b.PartyId == p.Id).ToList();
            var pOrders = orders.Where(o => o.PartyId == p.Id).ToList();
            if (pBills.Count == 0 && pOrders.Count == 0) continue;

            var billTotal = pBills.Sum(b => b.Total);

            // 1) LATE DISPATCH — order date → bill date gap > 7 din = late
            int dispatchKnown = 0, lateCount = 0; double dispatchDaysSum = 0;
            foreach (var b in pBills.Where(x => x.OrderId.HasValue))
            {
                if (!orderDateById.TryGetValue(b.OrderId!.Value, out var od)) continue;
                var gap = b.BillDate.DayNumber - od.DayNumber;
                if (gap < 0) continue;
                dispatchKnown++; dispatchDaysSum += gap;
                if (gap > 7) lateCount++;
            }
            var latePct = dispatchKnown > 0 ? Math.Round(lateCount * 100m / dispatchKnown) : 0;
            var avgDispatch = dispatchKnown > 0 ? Math.Round(dispatchDaysSum / dispatchKnown) : 0;

            // 2) BINA BOLE MAAL — bill bina kisi order ke (na link, na PO no)
            var binaBole = pBills.Count(b => b.OrderId == null && string.IsNullOrWhiteSpace(b.PoNumber));
            var binaBolePct = pBills.Count > 0 ? Math.Round(binaBole * 100m / pBills.Count) : 0;

            // 3) QUALITY — GR return rate (amount basis)
            var grAmt = grs.Where(g => g.SupplierPartyId == p.Id).Sum(g => g.TotalReturnAmount);
            var returnRate = billTotal > 0 ? Math.Round(grAmt * 100m / billTotal, 1) : 0;

            // Score → grade
            var score = 100m - returnRate * 3m - latePct * 0.5m - binaBolePct * 0.3m;
            var grade = score >= 90 ? "A+" : score >= 75 ? "A" : score >= 60 ? "B" : "C";
            var stars = score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 45 ? 2 : 1;

            string badge =
                returnRate > 10 ? "⚠️ Return zyada — quality dekho" :
                binaBolePct > 30 ? "📦 Bina bole maal bhejta hai" :
                latePct > 40 ? "🐌 Late dispatch karta hai" :
                (returnRate <= 1 && latePct <= 10 && pBills.Count > 0) ? "✅ Best supplier" : "";

            suppliers.Add((billTotal, new
            {
                partyId = p.Id, name = p.DisplayName,
                billCount = pBills.Count, orderCount = pOrders.Count, billTotal,
                latePct, avgDispatch, binaBolePct, returnRate,
                grade, stars, badge
            }));
        }

        // =================== BUYERS ===================
        var buyers = new List<(decimal total, object row)>();
        foreach (var p in parties.Where(x => x.PartyType == "buyer" || x.PartyType == "both"))
        {
            var pBills = bills.Where(b => b.BuyerPartyId == p.Id).ToList();
            if (pBills.Count == 0) continue;

            var billTotal = pBills.Sum(b => b.Total);
            var cd = p.CreditDays > 0 ? p.CreditDays : 30;

            // Payment timing — har allocation: advance/early/ontime/late
            int adv = 0, early = 0, ontime = 0, late = 0; double payDaysSum = 0; int payKnown = 0;
            var billIds = pBills.Select(b => b.Id).ToHashSet();
            foreach (var a in allocs.Where(x => billIds.Contains(x.BillId)))
            {
                var bill = billById[a.BillId];
                var due = bill.BillDate.AddDays(cd);
                var diff = a.PaymentDate.DayNumber - due.DayNumber;     // +ve = late
                payDaysSum += a.PaymentDate.DayNumber - bill.BillDate.DayNumber;
                payKnown++;
                if (a.PaymentDate.DayNumber <= bill.BillDate.DayNumber) adv++;
                else if (diff <= -3) early++;
                else if (diff <= 1) ontime++;
                else late++;
            }
            var totalPay = adv + early + ontime + late;
            var goodPct = totalPay > 0 ? Math.Round((adv + early + ontime) * 100m / totalPay) : 0;
            var avgPayDays = payKnown > 0 ? Math.Round(payDaysSum / payKnown) : 0;

            // Abhi tak unpaid + overdue kitna
            var overdueAmt = pBills
                .Where(b => b.Total - b.PaidAmount > 0.01m && b.BillDate.AddDays(cd) < today)
                .Sum(b => b.Total - b.PaidAmount);

            // GR rate (buyer ki taraf se return)
            var grAmt = grs.Where(g => g.BuyerPartyId == p.Id).Sum(g => g.TotalReturnAmount);
            var returnRate = billTotal > 0 ? Math.Round(grAmt * 100m / billTotal, 1) : 0;

            // Score → grade (payment behaviour heavy + GR + overdue penalty)
            var overduePenalty = billTotal > 0 ? Math.Min(40m, overdueAmt * 50m / billTotal) : 0;
            var score = (totalPay > 0 ? goodPct : 50m) - returnRate * 2m - overduePenalty;
            var grade = score >= 90 ? "A+" : score >= 75 ? "A" : score >= 55 ? "B" : "C";
            var stars = score >= 90 ? 5 : score >= 75 ? 4 : score >= 55 ? 3 : score >= 35 ? 2 : 1;

            string badge =
                adv > 0 && adv >= totalPay - adv ? "💎 Advance deta hai" :
                totalPay > 0 && late == 0 ? "✅ Hamesha time par" :
                late > 0 && late >= totalPay / 2 ? "🐌 Payment late karta hai" :
                overdueAmt > 0 && totalPay == 0 ? "⚠️ Payment baki hai" : "";

            buyers.Add((billTotal, new
            {
                partyId = p.Id, name = p.DisplayName,
                billCount = pBills.Count, billTotal,
                advCount = adv, earlyCount = early, ontimeCount = ontime, lateCount = late,
                goodPct, avgPayDays, returnRate, overdueAmt,
                grade, stars, badge
            }));
        }

        return Ok(new
        {
            suppliers = suppliers.OrderByDescending(s => s.total).Select(s => s.row).ToList(),
            buyers = buyers.OrderByDescending(b => b.total).Select(b => b.row).ToList()
        });
    }
}
