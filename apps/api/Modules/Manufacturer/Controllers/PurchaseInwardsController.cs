using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Manufacturer.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record InwardLineDto(Guid Id, Guid? PoLineId, Guid ItemId, string ItemName,
                            string ItemKind, string? Colour, string? Size,
                            decimal Qty, string Unit, decimal Rate,
                            string? DealerCode, string? LotNo);

public record PurchaseInwardDto(
    Guid Id, string InwardNo, Guid GodownId, string GodownName,
    Guid? PoId, string? PoNo, Guid PartyId, string PartyName,
    DateOnly InwardDate, string? SupplierChallanNo, string? LrNo,
    string? Transport, string? ChallanPhoto, string? Note,
    List<InwardLineDto> Lines, decimal TotalQty, decimal TotalAmount);

// ── likhne ke liye ──
public record SaveInwardLineDto(Guid? PoLineId, Guid ItemId, string? Colour, string? Size,
                                decimal Qty, string? Unit, decimal Rate,
                                string? DealerCode, string? LotNo);
public record SavePurchaseInwardDto(
    Guid GodownId, Guid? PoId, Guid PartyId, DateOnly? InwardDate,
    string? SupplierChallanNo, string? LrNo, string? Transport,
    string? ChallanPhoto, string? Note, List<SaveInwardLineDto> Lines);

/// <summary>
/// Purchase Inward — maal sach me godown me aa gaya.
///
/// YAHI wo jagah hai jahan stock BADHTA hai. Job slip material bahar bhejta
/// hai, inward andar laata hai. Agar inward na banayi jaye aur seedha job
/// slip kaat di jaye, to stock minus me chala jata hai — ledger jhooth nahi
/// bolta, bas hum maal andar dikhana bhool gaye hote hain.
///
/// Ek PO ka maal kai khep me aata hai, isliye har line PO line se judi rehti
/// hai — tabhi "kitna aur aana baki hai" ka jawab milta hai.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/inwards")]
[ModuleAccess("manufacturer")]
public class PurchaseInwardsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMfgCounterService _counter;
    public PurchaseInwardsController(AppDbContext db, IMfgCounterService counter)
    { _db = db; _counter = counter; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    [HttpGet]
    [HasPermission("purchase.inward.view.place")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] Guid? partyId,
                                          [FromQuery] Guid? godownId)
    {
        var firmId = CurrentFirmId;
        var q = _db.MfgPurchaseInwards.AsNoTracking().Where(i => i.FirmId == firmId);
        if (partyId is Guid p) q = q.Where(i => i.PartyId == p);
        if (godownId is Guid g) q = q.Where(i => i.GodownId == g);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLower();
            q = q.Where(i => i.InwardNo.ToLower().Contains(t)
                          || (i.SupplierChallanNo != null && i.SupplierChallanNo.ToLower().Contains(t))
                          || (i.LrNo != null && i.LrNo.ToLower().Contains(t)));
        }

        var list = await q.OrderByDescending(i => i.InwardDate).ThenByDescending(i => i.CreatedAt)
                          .Take(200).ToListAsync();
        return Ok(await BuildMany(firmId, list));
    }

    [HttpGet("{id}")]
    [HasPermission("purchase.inward.view.place")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var inw = await _db.MfgPurchaseInwards.AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == id && i.FirmId == firmId);
        if (inw is null) return NotFound();
        return Ok((await BuildMany(firmId, new List<PurchaseInward> { inw })).First());
    }

    [HttpPost]
    [HasPermission("purchase.inward.create.place")]
    public async Task<IActionResult> Create([FromBody] SavePurchaseInwardDto dto)
    {
        var firmId = CurrentFirmId;
        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var inw = new PurchaseInward
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            GodownId = dto.GodownId,
            InwardNo = await _counter.NextAsync(firmId, dto.GodownId, "inward", "IN"),
            PoId = dto.PoId,
            PartyId = dto.PartyId,
            InwardDate = dto.InwardDate ?? Today(),
            SupplierChallanNo = Trim(dto.SupplierChallanNo),
            LrNo = Trim(dto.LrNo),
            Transport = Trim(dto.Transport),
            ChallanPhoto = Trim(dto.ChallanPhoto),
            Note = Trim(dto.Note),
            CreatedBy = CurrentUserId
        };
        _db.MfgPurchaseInwards.Add(inw);
        await _db.SaveChangesAsync();

        // Maal ka kism (design ya material) item se hi aata hai — ledger me
        // dono alag ginte hain, isliye ek baar me nikal lete hain
        var kinds = await ItemKinds(firmId, dto.Lines.Select(l => l.ItemId));

        foreach (var l in dto.Lines)
        {
            _db.MfgPurchaseInwardLines.Add(new PurchaseInwardLine
            {
                Id = Guid.NewGuid(), FirmId = firmId, InwardId = inw.Id,
                PoLineId = l.PoLineId, ItemId = l.ItemId,
                Colour = Trim(l.Colour), Size = Trim(l.Size), Qty = l.Qty,
                Unit = string.IsNullOrWhiteSpace(l.Unit) ? "Meter" : l.Unit.Trim(),
                Rate = l.Rate, DealerCode = Trim(l.DealerCode), LotNo = Trim(l.LotNo)
            });

            // Stock ANDAR — yahi wo entry hai jiske bina baad me sab minus dikhta hai
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = dto.GodownId, ItemId = l.ItemId,
                ItemKind = kinds.GetValueOrDefault(l.ItemId, "material"),
                Colour = Trim(l.Colour), Size = Trim(l.Size),
                QtyIn = l.Qty, RefType = "inward", RefId = inw.Id,
                CreatedBy = CurrentUserId
            });
        }
        await _db.SaveChangesAsync();

        if (dto.PoId is Guid poId) await RefreshPoStatus(firmId, poId);

        await tx.CommitAsync();
        return Ok(new { inw.Id, inw.InwardNo });
    }

    /// <summary>
    /// Inward mitana. Stock ulta karna PADEGA — warna maal kabhi aaya hi nahi
    /// tha par ginti me pada rahega.
    /// </summary>
    [HttpDelete("{id}")]
    [HasPermission("purchase.inward.delete.place")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var firmId = CurrentFirmId;
        var inw = await _db.MfgPurchaseInwards
            .FirstOrDefaultAsync(i => i.Id == id && i.FirmId == firmId);
        if (inw is null) return NotFound();

        // Is inward ka maal wapas bheja ja chuka hai to entry mita nahi sakte —
        // return kis cheez ka tha, ye pata hi nahi chalega
        var wapas = await _db.MfgPurchaseReturns.AnyAsync(r => r.InwardId == id);
        if (wapas)
            return BadRequest(new { error =
                "Is inward par purchase return bana hua hai — pehle wo hataiye" });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var lines = await _db.MfgPurchaseInwardLines.Where(l => l.InwardId == id).ToListAsync();
        var kinds = await ItemKinds(firmId, lines.Select(l => l.ItemId));

        foreach (var l in lines)
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = inw.GodownId, ItemId = l.ItemId,
                ItemKind = kinds.GetValueOrDefault(l.ItemId, "material"),
                Colour = l.Colour, Size = l.Size,
                QtyOut = l.Qty, RefType = "inward", RefId = id,
                CreatedBy = CurrentUserId
            });

        _db.MfgPurchaseInwardLines.RemoveRange(lines);
        _db.MfgPurchaseInwards.Remove(inw);
        await _db.SaveChangesAsync();

        if (inw.PoId is Guid poId) await RefreshPoStatus(firmId, poId);

        await tx.CommitAsync();
        return Ok(new { deleted = true });
    }

    // ══════════ madad ══════════

    private async Task<string?> ValidateAsync(Guid firmId, SavePurchaseInwardDto dto)
    {
        if (dto.Lines is null || dto.Lines.Count == 0)
            return "Kam se kam ek maal to daaliye";
        if (dto.Lines.Any(l => l.Qty <= 0))
            return "Har line me quantity 0 se zyada honi chahiye";

        var godown = await _db.Godowns.AsNoTracking()
            .AnyAsync(g => g.Id == dto.GodownId && g.FirmId == firmId && g.IsActive);
        if (!godown) return "Godown chuniye — maal kahan aaya ye batana zaroori hai";

        var party = await _db.PartyProfiles.AsNoTracking()
            .AnyAsync(p => p.Id == dto.PartyId && p.FirmId == firmId);
        if (!party) return "Supplier nahi mila — pehle Masters → Suppliers me jodiye";

        var itemIds = dto.Lines.Select(l => l.ItemId).Distinct().ToList();
        var mile = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && itemIds.Contains(i.Id))
            .Select(i => i.Id).ToListAsync();
        if (mile.Count != itemIds.Count)
            return "Koi maal list me nahi mila — page refresh karke dobara chuniye";

        if (dto.PoId is Guid poId)
        {
            var po = await _db.MfgPurchaseOrders.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == poId && p.FirmId == firmId);
            if (po is null) return "Purchase order nahi mila";
            if (po.Status == "cancelled")
                return "Ye order cancel ho chuka hai — iska maal andar nahi le sakte";
            if (po.PartyId != dto.PartyId)
                return "Order kisi aur supplier ka hai — supplier badal kar dekhiye";

            // PO se zyada maal aa raha hai to rok do. Mill se zyada aana aam
            // baat hai, par bina bataye chadha diya to PO kabhi "poora" nahi
            // dikhega aur ginti hamesha gadbad rahegi.
            var pending = await _db.MfgPurchaseOrderLines.AsNoTracking()
                .Where(l => l.PoId == poId).ToListAsync();
            var aaya = await _db.MfgPurchaseInwardLines.AsNoTracking()
                .Where(x => x.PoLineId != null && pending.Select(p => p.Id).Contains(x.PoLineId!.Value))
                .GroupBy(x => x.PoLineId!.Value)
                .Select(g => new { Id = g.Key, Qty = g.Sum(x => x.Qty) })
                .ToDictionaryAsync(x => x.Id, x => x.Qty);

            foreach (var grp in dto.Lines.Where(l => l.PoLineId != null)
                                         .GroupBy(l => l.PoLineId!.Value))
            {
                var pl = pending.FirstOrDefault(p => p.Id == grp.Key);
                if (pl is null) return "Order ki koi line nahi mili — page refresh kijiye";
                var pehle = aaya.GetValueOrDefault(grp.Key, 0m);
                var ab = grp.Sum(x => x.Qty);
                if (pehle + ab > pl.Qty)
                    return $"Order me {pl.Qty:0.##} {pl.Unit} the, {pehle:0.##} pehle hi aa chuke — " +
                           $"ab {ab:0.##} aur nahi ho sakte";
            }
        }
        return null;
    }

    /// <summary>
    /// PO ki apni haalat — sab aa gaya to "done", kuch aaya to "partial".
    /// Bina iske chalu orders ki list me poore ho chuke order pade rehte hain.
    /// </summary>
    private async Task RefreshPoStatus(Guid firmId, Guid poId)
    {
        var po = await _db.MfgPurchaseOrders
            .FirstOrDefaultAsync(p => p.Id == poId && p.FirmId == firmId);
        if (po is null || po.Status == "cancelled") return;

        var lines = await _db.MfgPurchaseOrderLines.AsNoTracking()
            .Where(l => l.PoId == poId).ToListAsync();
        var lineIds = lines.Select(l => (Guid?)l.Id).ToList();

        var aaya = await _db.MfgPurchaseInwardLines.AsNoTracking()
            .Where(x => x.PoLineId != null && lineIds.Contains(x.PoLineId))
            .GroupBy(x => x.PoLineId!.Value)
            .Select(g => new { Id = g.Key, Qty = g.Sum(x => x.Qty) })
            .ToDictionaryAsync(x => x.Id, x => x.Qty);

        var kuchAaya = aaya.Values.Any(v => v > 0);
        var sabAaya  = lines.Count > 0 && lines.All(l => aaya.GetValueOrDefault(l.Id, 0m) >= l.Qty);

        po.Status = sabAaya ? "done" : kuchAaya ? "partial" : "open";
        po.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    private async Task<Dictionary<Guid, string>> ItemKinds(Guid firmId, IEnumerable<Guid> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return new Dictionary<Guid, string>();
        return await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && list.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.ItemKind == "design" ? "design" : "material");
    }

    private async Task<List<PurchaseInwardDto>> BuildMany(Guid firmId, List<PurchaseInward> inws)
    {
        if (inws.Count == 0) return new List<PurchaseInwardDto>();
        var ids = inws.Select(i => i.Id).ToList();

        var lines = await _db.MfgPurchaseInwardLines.AsNoTracking()
            .Where(l => ids.Contains(l.InwardId)).ToListAsync();

        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await _db.Items.AsNoTracking()
            .Where(i => itemIds.Contains(i.Id))
            .Select(i => new { i.Id, i.Name, i.ItemKind })
            .ToDictionaryAsync(i => i.Id, i => i);

        var partyNames = await PurchaseOrdersController.PartyNames(
            _db, inws.Select(i => i.PartyId).Distinct().ToList());

        var godownIds = inws.Select(i => i.GodownId).Distinct().ToList();
        var godownNames = await _db.Godowns.AsNoTracking()
            .Where(g => godownIds.Contains(g.Id))
            .ToDictionaryAsync(g => g.Id, g => g.Name);

        var poIds = inws.Where(i => i.PoId != null).Select(i => i.PoId!.Value).Distinct().ToList();
        var poNos = poIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.MfgPurchaseOrders.AsNoTracking()
                .Where(p => poIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, p => p.PoNo);

        return inws.Select(i =>
        {
            var ls = lines.Where(l => l.InwardId == i.Id).Select(l =>
            {
                var it = items.GetValueOrDefault(l.ItemId);
                return new InwardLineDto(l.Id, l.PoLineId, l.ItemId, it?.Name ?? "—",
                    it?.ItemKind ?? "material", l.Colour, l.Size, l.Qty, l.Unit, l.Rate,
                    l.DealerCode, l.LotNo);
            }).ToList();

            return new PurchaseInwardDto(
                i.Id, i.InwardNo, i.GodownId, godownNames.GetValueOrDefault(i.GodownId, "—"),
                i.PoId, i.PoId is Guid p ? poNos.GetValueOrDefault(p) : null,
                i.PartyId, partyNames.GetValueOrDefault(i.PartyId, "—"),
                i.InwardDate, i.SupplierChallanNo, i.LrNo, i.Transport, i.ChallanPhoto, i.Note,
                ls, ls.Sum(x => x.Qty), ls.Sum(x => x.Qty * x.Rate));
        }).ToList();
    }

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
