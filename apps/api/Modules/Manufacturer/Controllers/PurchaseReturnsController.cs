using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Manufacturer.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record PReturnLineDto(Guid Id, Guid ItemId, string ItemName, string? Colour,
                             string? Size, decimal Qty, string Unit, decimal Rate);

public record PurchaseReturnDto(
    Guid Id, string DnNo, Guid GodownId, string GodownName,
    Guid PartyId, string PartyName, Guid? InwardId, string? InwardNo,
    DateOnly ReturnDate, string? Reason, string? Note,
    List<PReturnLineDto> Lines, decimal TotalQty, decimal TotalAmount);

// ── likhne ke liye ──
public record SavePReturnLineDto(Guid ItemId, string? Colour, string? Size,
                                 decimal Qty, string? Unit, decimal Rate);
public record SavePurchaseReturnDto(
    Guid GodownId, Guid PartyId, Guid? InwardId, DateOnly? ReturnDate,
    string? Reason, string? Note, List<SavePReturnLineDto> Lines);

/// <summary>
/// Purchase Return — kharab maal mill ko wapas.
///
/// Ye DEBIT note hai: hum paisa wapas MAANGTE hain (sales return me hum credit
/// dete hain — ulta). Stock godown se GHATTA hai, kyunki maal ab hamare paas
/// hai hi nahi.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/purchase-returns")]
[ModuleAccess("manufacturer")]
public class PurchaseReturnsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMfgCounterService _counter;
    public PurchaseReturnsController(AppDbContext db, IMfgCounterService counter)
    { _db = db; _counter = counter; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    [HttpGet]
    [HasPermission("purchase.preturn.view.place")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] Guid? partyId)
    {
        var firmId = CurrentFirmId;
        var q = _db.MfgPurchaseReturns.AsNoTracking().Where(r => r.FirmId == firmId);
        if (partyId is Guid p) q = q.Where(r => r.PartyId == p);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLower();
            q = q.Where(r => r.DnNo.ToLower().Contains(t));
        }

        var list = await q.OrderByDescending(r => r.ReturnDate).ThenByDescending(r => r.CreatedAt)
                          .Take(200).ToListAsync();
        return Ok(await BuildMany(list));
    }

    [HttpGet("{id}")]
    [HasPermission("purchase.preturn.view.place")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var r = await _db.MfgPurchaseReturns.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (r is null) return NotFound();
        return Ok((await BuildMany(new List<PurchaseReturn> { r })).First());
    }

    [HttpPost]
    [HasPermission("purchase.preturn.create.place")]
    public async Task<IActionResult> Create([FromBody] SavePurchaseReturnDto dto)
    {
        var firmId = CurrentFirmId;
        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var ret = new PurchaseReturn
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            GodownId = dto.GodownId,
            DnNo = await _counter.NextAsync(firmId, dto.GodownId, "preturn", "DN"),
            PartyId = dto.PartyId,
            InwardId = dto.InwardId,
            ReturnDate = dto.ReturnDate ?? Today(),
            Reason = Trim(dto.Reason),
            Note = Trim(dto.Note),
            CreatedBy = CurrentUserId
        };
        _db.MfgPurchaseReturns.Add(ret);
        await _db.SaveChangesAsync();

        var kinds = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && dto.Lines.Select(l => l.ItemId).Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.ItemKind == "design" ? "design" : "material");

        foreach (var l in dto.Lines)
        {
            _db.MfgPurchaseReturnLines.Add(new PurchaseReturnLine
            {
                Id = Guid.NewGuid(), FirmId = firmId, ReturnId = ret.Id,
                ItemId = l.ItemId, Colour = Trim(l.Colour), Size = Trim(l.Size),
                Qty = l.Qty,
                Unit = string.IsNullOrWhiteSpace(l.Unit) ? "Meter" : l.Unit.Trim(),
                Rate = l.Rate
            });

            // Maal BAHAR — wapas mill ke paas chala gaya
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = dto.GodownId, ItemId = l.ItemId,
                ItemKind = kinds.GetValueOrDefault(l.ItemId, "material"),
                Colour = Trim(l.Colour), Size = Trim(l.Size),
                QtyOut = l.Qty, RefType = "preturn", RefId = ret.Id,
                CreatedBy = CurrentUserId
            });
        }
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { ret.Id, ret.DnNo });
    }

    [HttpDelete("{id}")]
    [HasPermission("purchase.preturn.delete.place")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var firmId = CurrentFirmId;
        var ret = await _db.MfgPurchaseReturns
            .FirstOrDefaultAsync(r => r.Id == id && r.FirmId == firmId);
        if (ret is null) return NotFound();

        await using var tx = await _db.Database.BeginTransactionAsync();

        var lines = await _db.MfgPurchaseReturnLines.Where(l => l.ReturnId == id).ToListAsync();
        var kinds = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && lines.Select(l => l.ItemId).Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.ItemKind == "design" ? "design" : "material");

        // Maal wapas nahi gaya — stock me lauta do
        foreach (var l in lines)
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = ret.GodownId, ItemId = l.ItemId,
                ItemKind = kinds.GetValueOrDefault(l.ItemId, "material"),
                Colour = l.Colour, Size = l.Size,
                QtyIn = l.Qty, RefType = "preturn", RefId = id,
                CreatedBy = CurrentUserId
            });

        _db.MfgPurchaseReturnLines.RemoveRange(lines);
        _db.MfgPurchaseReturns.Remove(ret);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { deleted = true });
    }

    // ══════════ madad ══════════

    private async Task<string?> ValidateAsync(Guid firmId, SavePurchaseReturnDto dto)
    {
        if (dto.Lines is null || dto.Lines.Count == 0)
            return "Kam se kam ek maal to daaliye";
        if (dto.Lines.Any(l => l.Qty <= 0))
            return "Har line me quantity 0 se zyada honi chahiye";

        var godown = await _db.Godowns.AsNoTracking()
            .AnyAsync(g => g.Id == dto.GodownId && g.FirmId == firmId && g.IsActive);
        if (!godown) return "Godown chuniye — maal kahan se gaya ye batana zaroori hai";

        var party = await _db.PartyProfiles.AsNoTracking()
            .AnyAsync(p => p.Id == dto.PartyId && p.FirmId == firmId);
        if (!party) return "Supplier nahi mila";

        var itemIds = dto.Lines.Select(l => l.ItemId).Distinct().ToList();
        var mile = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && itemIds.Contains(i.Id))
            .Select(i => i.Id).ToListAsync();
        if (mile.Count != itemIds.Count)
            return "Koi maal list me nahi mila — page refresh karke dobara chuniye";

        if (dto.InwardId is Guid inwId)
        {
            var inw = await _db.MfgPurchaseInwards.AsNoTracking()
                .FirstOrDefaultAsync(i => i.Id == inwId && i.FirmId == firmId);
            if (inw is null) return "Inward nahi mila";
            if (inw.PartyId != dto.PartyId)
                return "Ye inward kisi aur supplier ka hai";

            // Jitna aaya tha usse zyada wapas nahi ja sakta
            var aaya = await _db.MfgPurchaseInwardLines.AsNoTracking()
                .Where(l => l.InwardId == inwId)
                .GroupBy(l => l.ItemId)
                .Select(g => new { Id = g.Key, Qty = g.Sum(x => x.Qty) })
                .ToDictionaryAsync(x => x.Id, x => x.Qty);

            var pehleWapas = await (from rl in _db.MfgPurchaseReturnLines.AsNoTracking()
                                   join r in _db.MfgPurchaseReturns.AsNoTracking()
                                        on rl.ReturnId equals r.Id
                                   where r.InwardId == inwId
                                   group rl by rl.ItemId into g
                                   select new { Id = g.Key, Qty = g.Sum(x => x.Qty) })
                                  .ToDictionaryAsync(x => x.Id, x => x.Qty);

            foreach (var grp in dto.Lines.GroupBy(l => l.ItemId))
            {
                var tha  = aaya.GetValueOrDefault(grp.Key, 0m);
                var gaya = pehleWapas.GetValueOrDefault(grp.Key, 0m);
                var ab   = grp.Sum(x => x.Qty);
                if (gaya + ab > tha)
                    return $"Is inward me {tha:0.##} aaya tha, {gaya:0.##} pehle hi wapas ja chuka — " +
                           $"ab {ab:0.##} aur wapas nahi ho sakta";
            }
        }
        return null;
    }

    private async Task<List<PurchaseReturnDto>> BuildMany(List<PurchaseReturn> rets)
    {
        if (rets.Count == 0) return new List<PurchaseReturnDto>();
        var ids = rets.Select(r => r.Id).ToList();

        var lines = await _db.MfgPurchaseReturnLines.AsNoTracking()
            .Where(l => ids.Contains(l.ReturnId)).ToListAsync();

        var itemNames = await _db.Items.AsNoTracking()
            .Where(i => lines.Select(l => l.ItemId).Distinct().Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Name);

        var partyNames = await PurchaseOrdersController.PartyNames(
            _db, rets.Select(r => r.PartyId).Distinct().ToList());

        var godownIds = rets.Select(r => r.GodownId).Distinct().ToList();
        var godownNames = await _db.Godowns.AsNoTracking()
            .Where(g => godownIds.Contains(g.Id))
            .ToDictionaryAsync(g => g.Id, g => g.Name);

        var inwIds = rets.Where(r => r.InwardId != null).Select(r => r.InwardId!.Value).Distinct().ToList();
        var inwNos = inwIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.MfgPurchaseInwards.AsNoTracking()
                .Where(i => inwIds.Contains(i.Id))
                .ToDictionaryAsync(i => i.Id, i => i.InwardNo);

        return rets.Select(r =>
        {
            var ls = lines.Where(l => l.ReturnId == r.Id).Select(l => new PReturnLineDto(
                l.Id, l.ItemId, itemNames.GetValueOrDefault(l.ItemId, "—"),
                l.Colour, l.Size, l.Qty, l.Unit, l.Rate)).ToList();

            return new PurchaseReturnDto(
                r.Id, r.DnNo, r.GodownId, godownNames.GetValueOrDefault(r.GodownId, "—"),
                r.PartyId, partyNames.GetValueOrDefault(r.PartyId, "—"),
                r.InwardId, r.InwardId is Guid i ? inwNos.GetValueOrDefault(i) : null,
                r.ReturnDate, r.Reason, r.Note,
                ls, ls.Sum(x => x.Qty), ls.Sum(x => x.Qty * x.Rate));
        }).ToList();
    }

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
