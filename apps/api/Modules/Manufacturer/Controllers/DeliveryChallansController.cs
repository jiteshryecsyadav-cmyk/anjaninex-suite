using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Manufacturer.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record DcLineDto(Guid Id, Guid? SoLineId, Guid ItemId, string ItemName,
                        string? Colour, string? Size, decimal Qty, string Unit, decimal Rate);

public record DeliveryChallanDto(
    Guid Id, string DcNo, Guid GodownId, string GodownName,
    Guid? SoId, string? SoNo, Guid PartyId, string PartyName,
    DateOnly ChallanDate, string? Transport, string? LrNo, string? VehicleNo,
    int? Packages, string? Note, bool Billed,
    List<DcLineDto> Lines, decimal TotalQty, decimal TotalAmount);

// ── likhne ke liye ──
public record SaveDcLineDto(Guid? SoLineId, Guid ItemId, string? Colour, string? Size,
                            decimal Qty, string? Unit, decimal Rate);
public record SaveDeliveryChallanDto(
    Guid GodownId, Guid? SoId, Guid PartyId, DateOnly? ChallanDate,
    string? Transport, string? LrNo, string? VehicleNo, int? Packages, string? Note,
    List<SaveDcLineDto> Lines);

/// <summary>
/// Delivery Challan — maal godown se sach me nikla. YAHI stock ghatata hai.
///
/// Purchase Inward ka aaina. Order chunte hi baki lines khud bhar jaati hain,
/// aur order se zyada bhejne par rok lagti hai.
///
/// Stock se zyada bhejne par bhi rok hai — wahi rok jiski kami se pehle
/// Chanderi minus me chali gayi thi.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/challans")]
[ModuleAccess("manufacturer")]
public class DeliveryChallansController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMfgCounterService _counter;
    public DeliveryChallansController(AppDbContext db, IMfgCounterService counter)
    { _db = db; _counter = counter; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    /// <param name="unbilled">true = sirf wo challan jinka bill nahi bana.</param>
    [HttpGet]
    [HasPermission("sales.challan.view.place")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] Guid? partyId,
                                          [FromQuery] bool? unbilled)
    {
        var firmId = CurrentFirmId;
        var q = _db.MfgDeliveryChallans.AsNoTracking().Where(c => c.FirmId == firmId);
        if (partyId is Guid p) q = q.Where(c => c.PartyId == p);
        if (unbilled == true) q = q.Where(c => c.BilledRefId == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLower();
            q = q.Where(c => c.DcNo.ToLower().Contains(t)
                          || (c.LrNo != null && c.LrNo.ToLower().Contains(t))
                          || (c.VehicleNo != null && c.VehicleNo.ToLower().Contains(t)));
        }

        var list = await q.OrderByDescending(c => c.ChallanDate).ThenByDescending(c => c.CreatedAt)
                          .Take(200).ToListAsync();
        return Ok(await BuildMany(list));
    }

    [HttpGet("{id}")]
    [HasPermission("sales.challan.view.place")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var dc = await _db.MfgDeliveryChallans.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id && c.FirmId == firmId);
        if (dc is null) return NotFound();
        return Ok((await BuildMany(new List<DeliveryChallan> { dc })).First());
    }

    [HttpPost]
    [HasPermission("sales.challan.create.place")]
    public async Task<IActionResult> Create([FromBody] SaveDeliveryChallanDto dto)
    {
        var firmId = CurrentFirmId;
        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var dc = new DeliveryChallan
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            GodownId = dto.GodownId,
            DcNo = await _counter.NextAsync(firmId, dto.GodownId, "challan", "DC"),
            SoId = dto.SoId,
            PartyId = dto.PartyId,
            ChallanDate = dto.ChallanDate ?? Today(),
            Transport = Trim(dto.Transport),
            LrNo = Trim(dto.LrNo),
            VehicleNo = Trim(dto.VehicleNo),
            Packages = dto.Packages,
            Note = Trim(dto.Note),
            CreatedBy = CurrentUserId
        };
        _db.MfgDeliveryChallans.Add(dc);
        await _db.SaveChangesAsync();

        var kinds = await ItemKinds(firmId, dto.Lines.Select(l => l.ItemId));

        foreach (var l in dto.Lines)
        {
            _db.MfgDeliveryChallanLines.Add(new DeliveryChallanLine
            {
                Id = Guid.NewGuid(), FirmId = firmId, DcId = dc.Id,
                SoLineId = l.SoLineId, ItemId = l.ItemId,
                Colour = Trim(l.Colour), Size = Trim(l.Size), Qty = l.Qty,
                Unit = string.IsNullOrWhiteSpace(l.Unit) ? "Pcs" : l.Unit.Trim(),
                Rate = l.Rate
            });

            // Stock BAHAR
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = dto.GodownId, ItemId = l.ItemId,
                ItemKind = kinds.GetValueOrDefault(l.ItemId, "design"),
                Colour = Trim(l.Colour), Size = Trim(l.Size),
                QtyOut = l.Qty, RefType = "challan", RefId = dc.Id,
                CreatedBy = CurrentUserId
            });
        }
        await _db.SaveChangesAsync();

        if (dto.SoId is Guid soId) await RefreshSoStatus(firmId, soId);

        await tx.CommitAsync();
        return Ok(new { dc.Id, dc.DcNo });
    }

    [HttpDelete("{id}")]
    [HasPermission("sales.challan.delete.place")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var firmId = CurrentFirmId;
        var dc = await _db.MfgDeliveryChallans
            .FirstOrDefaultAsync(c => c.Id == id && c.FirmId == firmId);
        if (dc is null) return NotFound();

        if (dc.BilledRefId is not null)
            return BadRequest(new { error =
                "Is challan ka bill ban chuka hai — pehle bill hataiye" });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var lines = await _db.MfgDeliveryChallanLines.Where(l => l.DcId == id).ToListAsync();
        var kinds = await ItemKinds(firmId, lines.Select(l => l.ItemId));

        // Maal nikla hi nahi — stock wapas
        foreach (var l in lines)
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = dc.GodownId, ItemId = l.ItemId,
                ItemKind = kinds.GetValueOrDefault(l.ItemId, "design"),
                Colour = l.Colour, Size = l.Size,
                QtyIn = l.Qty, RefType = "challan", RefId = id,
                CreatedBy = CurrentUserId
            });

        _db.MfgDeliveryChallanLines.RemoveRange(lines);
        _db.MfgDeliveryChallans.Remove(dc);
        await _db.SaveChangesAsync();

        if (dc.SoId is Guid soId) await RefreshSoStatus(firmId, soId);

        await tx.CommitAsync();
        return Ok(new { deleted = true });
    }

    // ══════════ madad ══════════

    private async Task<string?> ValidateAsync(Guid firmId, SaveDeliveryChallanDto dto)
    {
        if (dto.Lines is null || dto.Lines.Count == 0)
            return "Kam se kam ek maal to daaliye";
        if (dto.Lines.Any(l => l.Qty <= 0))
            return "Har line me quantity 0 se zyada honi chahiye";

        var godown = await _db.Godowns.AsNoTracking()
            .AnyAsync(g => g.Id == dto.GodownId && g.FirmId == firmId && g.IsActive);
        if (!godown) return "Godown chuniye — maal kahan se nikla ye batana zaroori hai";

        var party = await _db.PartyProfiles.AsNoTracking()
            .AnyAsync(p => p.Id == dto.PartyId && p.FirmId == firmId);
        if (!party) return "Customer nahi mila — pehle Masters → Customers me jodiye";

        var itemIds = dto.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Name);
        if (items.Count != itemIds.Count)
            return "Koi maal list me nahi mila — page refresh karke dobara chuniye";

        if (dto.SoId is Guid soId)
        {
            var so = await _db.MfgSalesOrders.AsNoTracking()
                .FirstOrDefaultAsync(s => s.Id == soId && s.FirmId == firmId);
            if (so is null) return "Sales order nahi mila";
            if (so.Status == "cancelled")
                return "Ye order cancel ho chuka hai — iska maal nahi bhej sakte";
            if (so.PartyId != dto.PartyId)
                return "Order kisi aur customer ka hai — customer badal kar dekhiye";

            var soLines = await _db.MfgSalesOrderLines.AsNoTracking()
                .Where(l => l.SoId == soId).ToListAsync();
            var soLineIds = soLines.Select(l => l.Id).ToList();
            var pehle = await _db.MfgDeliveryChallanLines.AsNoTracking()
                .Where(x => x.SoLineId != null && soLineIds.Contains(x.SoLineId!.Value))
                .GroupBy(x => x.SoLineId!.Value)
                .Select(g => new { Id = g.Key, Qty = g.Sum(x => x.Qty) })
                .ToDictionaryAsync(x => x.Id, x => x.Qty);

            foreach (var grp in dto.Lines.Where(l => l.SoLineId != null)
                                         .GroupBy(l => l.SoLineId!.Value))
            {
                var sl = soLines.FirstOrDefault(l => l.Id == grp.Key);
                if (sl is null) return "Order ki koi line nahi mili — page refresh kijiye";
                var gaya = pehle.GetValueOrDefault(grp.Key, 0m);
                var ab = grp.Sum(x => x.Qty);
                if (gaya + ab > sl.Qty)
                    return $"Order me {sl.Qty:0.##} {sl.Unit} the, {gaya:0.##} pehle hi ja chuke — " +
                           $"ab {ab:0.##} aur nahi ja sakte";
            }
        }

        // ── Stock ki rok ──
        // Colour/size par nahi, sirf maal + godown par — warna ek chhoti si
        // rang ki galti se poora challan ruk jata hai. Iske bina hi pehle
        // stock minus me chala gaya tha.
        var stock = await _db.StockLedger.AsNoTracking()
            .Where(s => s.FirmId == firmId && s.GodownId == dto.GodownId
                     && itemIds.Contains(s.ItemId))
            .GroupBy(s => s.ItemId)
            .Select(g => new { ItemId = g.Key, OnHand = g.Sum(x => x.QtyIn - x.QtyOut) })
            .ToDictionaryAsync(x => x.ItemId, x => x.OnHand);

        foreach (var grp in dto.Lines.GroupBy(l => l.ItemId))
        {
            var hai = stock.GetValueOrDefault(grp.Key, 0m);
            var chahiye = grp.Sum(x => x.Qty);
            if (chahiye > hai)
                return $"{items[grp.Key]} — is godown me sirf {hai:0.##} hai, {chahiye:0.##} nahi nikal sakta. " +
                       "Pehle Purchase Inward ya Job Slip se maal andar laaiye.";
        }
        return null;
    }

    /// <summary>Sab nikal gaya to order khud band — warna wo hamesha "chal raha" dikhta rahe.</summary>
    private async Task RefreshSoStatus(Guid firmId, Guid soId)
    {
        var so = await _db.MfgSalesOrders
            .FirstOrDefaultAsync(s => s.Id == soId && s.FirmId == firmId);
        if (so is null || so.Status == "cancelled") return;

        var lines = await _db.MfgSalesOrderLines.AsNoTracking()
            .Where(l => l.SoId == soId).ToListAsync();
        var lineIds = lines.Select(l => (Guid?)l.Id).ToList();

        var gaya = await _db.MfgDeliveryChallanLines.AsNoTracking()
            .Where(x => x.SoLineId != null && lineIds.Contains(x.SoLineId))
            .GroupBy(x => x.SoLineId!.Value)
            .Select(g => new { Id = g.Key, Qty = g.Sum(x => x.Qty) })
            .ToDictionaryAsync(x => x.Id, x => x.Qty);

        var kuch = gaya.Values.Any(v => v > 0);
        var sab  = lines.Count > 0 && lines.All(l => gaya.GetValueOrDefault(l.Id, 0m) >= l.Qty);

        so.Status = sab ? "done" : kuch ? "partial" : "open";
        so.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    private async Task<Dictionary<Guid, string>> ItemKinds(Guid firmId, IEnumerable<Guid> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return new Dictionary<Guid, string>();
        return await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && list.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.ItemKind == "material" ? "material" : "design");
    }

    private async Task<List<DeliveryChallanDto>> BuildMany(List<DeliveryChallan> dcs)
    {
        if (dcs.Count == 0) return new List<DeliveryChallanDto>();
        var ids = dcs.Select(c => c.Id).ToList();

        var lines = await _db.MfgDeliveryChallanLines.AsNoTracking()
            .Where(l => ids.Contains(l.DcId)).ToListAsync();

        var itemNames = await _db.Items.AsNoTracking()
            .Where(i => lines.Select(l => l.ItemId).Distinct().Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Name);

        var partyNames = await PurchaseOrdersController.PartyNames(
            _db, dcs.Select(c => c.PartyId).Distinct().ToList());

        var godownIds = dcs.Select(c => c.GodownId).Distinct().ToList();
        var godownNames = await _db.Godowns.AsNoTracking()
            .Where(g => godownIds.Contains(g.Id))
            .ToDictionaryAsync(g => g.Id, g => g.Name);

        var soIds = dcs.Where(c => c.SoId != null).Select(c => c.SoId!.Value).Distinct().ToList();
        var soNos = soIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.MfgSalesOrders.AsNoTracking()
                .Where(s => soIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id, s => s.SoNo);

        return dcs.Select(c =>
        {
            var ls = lines.Where(l => l.DcId == c.Id).Select(l => new DcLineDto(
                l.Id, l.SoLineId, l.ItemId, itemNames.GetValueOrDefault(l.ItemId, "—"),
                l.Colour, l.Size, l.Qty, l.Unit, l.Rate)).ToList();

            return new DeliveryChallanDto(
                c.Id, c.DcNo, c.GodownId, godownNames.GetValueOrDefault(c.GodownId, "—"),
                c.SoId, c.SoId is Guid s ? soNos.GetValueOrDefault(s) : null,
                c.PartyId, partyNames.GetValueOrDefault(c.PartyId, "—"),
                c.ChallanDate, c.Transport, c.LrNo, c.VehicleNo, c.Packages, c.Note,
                c.BilledRefId is not null,
                ls, ls.Sum(x => x.Qty), ls.Sum(x => x.Qty * x.Rate));
        }).ToList();
    }

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
