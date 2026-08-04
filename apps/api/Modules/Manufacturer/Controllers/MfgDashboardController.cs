using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

public record KpiDto(string Key, string Label, decimal Value, string? Sub, string Tone);

/// <summary>Jise abhi haath lagana chahiye — dashboard ka sabse upar wala hissa.</summary>
public record AlertDto(string Text, string? Link, string Tone);

public record TrendPointDto(string Label, decimal Value);
public record RankDto(string Name, decimal Value, string? Sub);

public record MfgDashboardDto(
    string FirmName, DateOnly From, DateOnly To, string Period,
    List<KpiDto> Sales, List<KpiDto> Production, List<KpiDto> Stock, List<KpiDto> Purchase,
    List<AlertDto> Alerts, List<TrendPointDto> Trend,
    List<RankDto> TopParties, List<RankDto> TopDesigns, List<RankDto> Godowns,
    List<RankDto> TopKarigars);

/// <summary>
/// Manufacturer ka dashboard.
///
/// Ek hi call me sab — chaar tab (Bikri, Kaam, Maal, Khareed) ka data saath
/// aata hai. Tab badalne par dobara call karte to har baar ruk-ruk kar chalta;
/// aankde chhote hain, ek saath bhejna sasta bhi hai aur tez bhi.
///
/// Sabse upar "Dhyan do" — wo cheezein jo aaj haath maangti hain: bill baki
/// challan, maal jo karigar ke paas atka hai, stock jo minus me hai. Malik
/// subah app kholta hai to yahi teen baatein sabse pehle dikhni chahiye.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/dashboard")]
[ModuleAccess("manufacturer")]
public class MfgDashboardController : ControllerBase
{
    private readonly AppDbContext _db;
    public MfgDashboardController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);

    /// <param name="period">week | month | quarter | year (financial year)</param>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string period = "month")
    {
        var firmId = CurrentFirmId;
        var (from, to) = Range(period);

        var firmName = await _db.Firms.AsNoTracking()
            .Where(f => f.Id == firmId).Select(f => f.Name).FirstOrDefaultAsync() ?? "Manufacturer";

        // ── BIKRI ──
        var bills = await _db.Bills.AsNoTracking()
            .Where(b => b.FirmId == firmId && b.BillType == "sales" && b.DeletedAt == null
                     && b.BillDate >= from && b.BillDate <= to)
            .Select(b => new { b.Total, b.PaidAmount, b.Status })
            .ToListAsync();

        var kulBikri = bills.Sum(b => b.Total);
        var milaPaisa = bills.Sum(b => b.PaidAmount);
        var bakaya = kulBikri - milaPaisa;

        var wapasAaya = await _db.GoodsReturns.AsNoTracking()
            .Where(g => g.FirmId == firmId && g.DeletedAt == null
                     && g.GrDate >= from && g.GrDate <= to)
            .SumAsync(g => (decimal?)g.TotalReturnAmount) ?? 0m;

        var sales = new List<KpiDto>
        {
            new("bikri",  "Kul bikri",     kulBikri,   $"{bills.Count} bill",       "navy"),
            new("mila",   "Paisa aaya",    milaPaisa,  null,                        "green"),
            new("bakaya", "Bakaya",        bakaya,     bakaya > 0 ? "vasooli baki" : "sab saaf", bakaya > 0 ? "amber" : "green"),
            new("wapas",  "Maal wapas",    wapasAaya,  null,                        wapasAaya > 0 ? "red" : "slate")
        };

        // ── KAAM (production) ──
        var chaluSlips = await _db.JobSlips.AsNoTracking()
            .Where(s => s.FirmId == firmId && (s.Status == "open" || s.Status == "partial"))
            .Select(s => s.Id).ToListAsync();

        var banane = await _db.JobSlipPrograms.AsNoTracking()
            .Where(p => chaluSlips.Contains(p.JobSlipId))
            .Join(_db.JobSlipProgramSizes.AsNoTracking(), p => p.Id, z => z.ProgramId, (p, z) => z.Qty)
            .SumAsync(q => (int?)q) ?? 0;

        var aaChuke = await _db.JobSlipReceipts.AsNoTracking()
            .Where(r => chaluSlips.Contains(r.JobSlipId))
            .SumAsync(r => (int?)r.Qty) ?? 0;

        var kharab = await _db.JobSlipReceipts.AsNoTracking()
            .Where(r => chaluSlips.Contains(r.JobSlipId))
            .SumAsync(r => (int?)r.RejectedQty) ?? 0;

        var production = new List<KpiDto>
        {
            new("slips",   "Job slip chal rahi", chaluSlips.Count, null, "navy"),
            // Yahi wo number hai jo malik sabse pehle poochta hai
            new("baahar",  "Karigar ke paas",    Math.Max(0, banane - aaChuke), "piece", "amber"),
            new("aaye",    "Ab tak bane",        aaChuke, "piece", "green"),
            new("kharab",  "Kharab nikle",       kharab,  "piece", kharab > 0 ? "red" : "slate")
        };

        // ── MAAL (stock) ──
        var stockRows = await _db.StockLedger.AsNoTracking()
            .Where(s => s.FirmId == firmId)
            .GroupBy(s => new { s.ItemId, s.ItemKind })
            .Select(g => new { g.Key.ItemId, g.Key.ItemKind, OnHand = g.Sum(x => x.QtyIn - x.QtyOut) })
            .ToListAsync();

        var minusWale = stockRows.Count(r => r.OnHand < 0);
        var stock = new List<KpiDto>
        {
            new("design",   "Design stock",   stockRows.Where(r => r.ItemKind == "design").Sum(r => r.OnHand),   "piece", "navy"),
            new("material", "Material stock", stockRows.Where(r => r.ItemKind == "material").Sum(r => r.OnHand), null,    "navy"),
            new("items",    "Maal ke naam",   stockRows.Count, "design + material", "slate"),
            // Minus ka matlab: maal bahar gaya par andar kabhi aaya hi nahi
            new("minus",    "Minus me",       minusWale, minusWale > 0 ? "hisaab adhoora" : "sab theek", minusWale > 0 ? "red" : "green")
        };

        // ── KHAREED ──
        var inwards = await _db.MfgPurchaseInwards.AsNoTracking()
            .Where(i => i.FirmId == firmId && i.InwardDate >= from && i.InwardDate <= to)
            .Select(i => i.Id).ToListAsync();

        var khareedRakam = await _db.MfgPurchaseInwardLines.AsNoTracking()
            .Where(l => inwards.Contains(l.InwardId))
            .SumAsync(l => (decimal?)(l.Qty * l.Rate)) ?? 0m;

        var khulePo = await _db.MfgPurchaseOrders.AsNoTracking()
            .CountAsync(p => p.FirmId == firmId && (p.Status == "open" || p.Status == "partial"));

        var pReturn = await _db.MfgPurchaseReturnLines.AsNoTracking()
            .Join(_db.MfgPurchaseReturns.AsNoTracking().Where(r => r.FirmId == firmId
                     && r.ReturnDate >= from && r.ReturnDate <= to),
                  l => l.ReturnId, r => r.Id, (l, r) => l.Qty * l.Rate)
            .SumAsync(x => (decimal?)x) ?? 0m;

        var purchase = new List<KpiDto>
        {
            new("khareed", "Maal andar aaya", khareedRakam, $"{inwards.Count} inward", "navy"),
            new("po",      "Order khule",     khulePo,      "mill ko diye",            khulePo > 0 ? "amber" : "green"),
            new("preturn", "Wapas bheja",     pReturn,      null,                      pReturn > 0 ? "red" : "slate")
        };

        // ── DHYAN DO ──
        var alerts = new List<AlertDto>();

        var billBaki = await _db.MfgDeliveryChallans.AsNoTracking()
            .CountAsync(c => c.FirmId == firmId && c.BilledRefId == null);
        if (billBaki > 0)
            alerts.Add(new($"{billBaki} challan ka bill abhi nahi bana — maal ja chuka hai",
                           "/sales/invoice", "amber"));

        var bhejnaBaki = await _db.MfgSalesOrders.AsNoTracking()
            .CountAsync(s => s.FirmId == firmId && (s.Status == "open" || s.Status == "partial"));
        if (bhejnaBaki > 0)
            alerts.Add(new($"{bhejnaBaki} order ka maal bhejna baki hai",
                           "/sales/order", "navy"));

        if (minusWale > 0)
            alerts.Add(new($"{minusWale} maal stock me minus me hai — andar aaya hi nahi par bahar chala gaya",
                           "/stock/items", "red"));

        var atka = Math.Max(0, banane - aaChuke);
        if (atka > 0)
            alerts.Add(new($"{atka} piece karigar ke paas atka hai", "/production/jobslip", "amber"));

        if (bakaya > 0)
            alerts.Add(new($"₹{bakaya:0} vasooli baki hai", "/sales/invoice", "amber"));

        // ── TREND — is saal mahine-wise bikri ──
        var fyStart = FyStart(Today());
        var saalKeBill = await _db.Bills.AsNoTracking()
            .Where(b => b.FirmId == firmId && b.BillType == "sales" && b.DeletedAt == null
                     && b.BillDate >= fyStart)
            .Select(b => new { b.BillDate, b.Total })
            .ToListAsync();

        var trend = Enumerable.Range(0, 12)
            .Select(i => fyStart.AddMonths(i))
            .Where(m => m <= Today())
            .Select(m => new TrendPointDto(
                MonthName(m.Month),
                saalKeBill.Where(b => b.BillDate.Year == m.Year && b.BillDate.Month == m.Month)
                          .Sum(b => b.Total)))
            .ToList();

        // ── KAUN SABSE AAGE ──
        // Malik ye roz poochta hai: kaun sa grahak sabse zyada le raha, kaun sa
        // design chal raha, kis godown me kitna maal, kaun sa karigar sabse tez.
        var topParties = await TopParties(firmId, from, to);
        var topDesigns = await TopDesigns(firmId, from, to);
        var godowns    = await GodownStock(firmId);
        var karigars   = await TopKarigars(firmId, chaluSlips);

        return Ok(new MfgDashboardDto(firmName, from, to, period,
                                      sales, production, stock, purchase, alerts, trend,
                                      topParties, topDesigns, godowns, karigars));
    }

    /// <summary>Kaunse grahak se sabse zyada bikri — is samay me.</summary>
    private async Task<List<RankDto>> TopParties(Guid firmId, DateOnly se, DateOnly tak)
    {
        var rows = await (from b in _db.Bills.AsNoTracking()
                          where b.FirmId == firmId && b.BillType == "sales" && b.DeletedAt == null
                             && b.BillDate >= se && b.BillDate <= tak
                          group b by b.PartyId into g
                          select new { PartyId = g.Key, Rakam = g.Sum(x => x.Total), Bill = g.Count() })
                         .OrderByDescending(x => x.Rakam).Take(5).ToListAsync();
        if (rows.Count == 0) return new();

        var names = await PurchaseOrdersController.PartyNames(_db, rows.Select(r => r.PartyId).ToList());
        return rows.Select(r => new RankDto(
            names.GetValueOrDefault(r.PartyId, "—"), r.Rakam, $"{r.Bill} bill")).ToList();
    }

    /// <summary>Kaunsa design sabse zyada nikla — challan se, kyunki maal wahin se jaata hai.</summary>
    private async Task<List<RankDto>> TopDesigns(Guid firmId, DateOnly se, DateOnly tak)
    {
        var rows = await (from l in _db.MfgDeliveryChallanLines.AsNoTracking()
                          join c in _db.MfgDeliveryChallans.AsNoTracking() on l.DcId equals c.Id
                          where c.FirmId == firmId && c.ChallanDate >= se && c.ChallanDate <= tak
                          group l by l.ItemId into g
                          select new { ItemId = g.Key, Qty = g.Sum(x => x.Qty),
                                       Rakam = g.Sum(x => x.Qty * x.Rate) })
                         .OrderByDescending(x => x.Qty).Take(5).ToListAsync();
        if (rows.Count == 0) return new();

        var ids = rows.Select(r => r.ItemId).ToList();
        var names = await _db.Items.AsNoTracking()
            .Where(i => ids.Contains(i.Id)).ToDictionaryAsync(i => i.Id, i => i.Name);

        return rows.Select(r => new RankDto(
            names.GetValueOrDefault(r.ItemId, "—"), r.Qty, $"₹{r.Rakam:0}")).ToList();
    }

    /// <summary>Kis godown me kitna maal pada hai — abhi ka, samay se matlab nahi.</summary>
    private async Task<List<RankDto>> GodownStock(Guid firmId)
    {
        var rows = await _db.StockLedger.AsNoTracking()
            .Where(s => s.FirmId == firmId)
            .GroupBy(s => s.GodownId)
            .Select(g => new { GodownId = g.Key, OnHand = g.Sum(x => x.QtyIn - x.QtyOut) })
            .ToListAsync();
        if (rows.Count == 0) return new();

        var ids = rows.Select(r => r.GodownId).ToList();
        var names = await _db.Godowns.AsNoTracking()
            .Where(g => ids.Contains(g.Id)).ToDictionaryAsync(g => g.Id, g => g.Name);

        return rows.OrderByDescending(r => r.OnHand)
                   .Select(r => new RankDto(names.GetValueOrDefault(r.GodownId, "—"), r.OnHand, null))
                   .ToList();
    }

    /// <summary>Kis karigar ke paas sabse zyada maal atka hai — dabaav wahin lagta hai.</summary>
    private async Task<List<RankDto>> TopKarigars(Guid firmId, List<Guid> chaluSlips)
    {
        if (chaluSlips.Count == 0) return new();

        var slips = await _db.JobSlips.AsNoTracking()
            .Where(s => chaluSlips.Contains(s.Id))
            .Select(s => new { s.Id, s.KarigarId }).ToListAsync();

        var planned = await _db.JobSlipPrograms.AsNoTracking()
            .Where(p => chaluSlips.Contains(p.JobSlipId))
            .Join(_db.JobSlipProgramSizes.AsNoTracking(), p => p.Id, z => z.ProgramId,
                  (p, z) => new { p.JobSlipId, z.Qty })
            .GroupBy(x => x.JobSlipId)
            .Select(g => new { SlipId = g.Key, Qty = g.Sum(x => x.Qty) })
            .ToDictionaryAsync(x => x.SlipId, x => x.Qty);

        var got = await _db.JobSlipReceipts.AsNoTracking()
            .Where(r => chaluSlips.Contains(r.JobSlipId))
            .GroupBy(r => r.JobSlipId)
            .Select(g => new { SlipId = g.Key, Qty = g.Sum(x => x.Qty) })
            .ToDictionaryAsync(x => x.SlipId, x => x.Qty);

        var perKarigar = slips
            .GroupBy(s => s.KarigarId)
            .Select(g => new
            {
                KarigarId = g.Key,
                Atka = g.Sum(s => Math.Max(0, planned.GetValueOrDefault(s.Id, 0)
                                            - got.GetValueOrDefault(s.Id, 0))),
                Slips = g.Count()
            })
            .Where(x => x.Atka > 0)
            .OrderByDescending(x => x.Atka).Take(5).ToList();
        if (perKarigar.Count == 0) return new();

        var ids = perKarigar.Select(k => k.KarigarId).ToList();
        var names = await _db.Karigars.AsNoTracking()
            .Where(k => ids.Contains(k.Id)).ToDictionaryAsync(k => k.Id, k => k.Name);

        return perKarigar.Select(k => new RankDto(
            names.GetValueOrDefault(k.KarigarId, "—"), k.Atka, $"{k.Slips} slip")).ToList();
    }

    // ══════════ madad ══════════

    /// <summary>
    /// "Full year" ka matlab financial year hai, January-December nahi —
    /// Indian trader isi hisab se sochta hai aur bill number bhi isi se chalte hain.
    /// </summary>
    private static (DateOnly from, DateOnly to) Range(string period)
    {
        var aaj = Today();
        return period switch
        {
            "week"    => (aaj.AddDays(-6), aaj),
            "quarter" => (aaj.AddMonths(-2) is var q ? new DateOnly(q.Year, q.Month, 1) : aaj, aaj),
            "year"    => (FyStart(aaj), aaj),
            _         => (new DateOnly(aaj.Year, aaj.Month, 1), aaj)
        };
    }

    /// <summary>April se nayi financial year.</summary>
    private static DateOnly FyStart(DateOnly d) =>
        d.Month >= 4 ? new DateOnly(d.Year, 4, 1) : new DateOnly(d.Year - 1, 4, 1);

    private static string MonthName(int m) => m switch
    {
        1 => "Jan", 2 => "Feb", 3 => "Mar", 4 => "Apr", 5 => "May", 6 => "Jun",
        7 => "Jul", 8 => "Aug", 9 => "Sep", 10 => "Oct", 11 => "Nov", _ => "Dec"
    };

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
