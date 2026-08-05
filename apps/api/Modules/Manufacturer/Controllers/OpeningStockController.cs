using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Manufacturer.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record OpeningLineDto(Guid Id, Guid ItemId, string ItemName, string ItemKind,
                             string? Colour, string? Size, decimal Qty, string Unit, decimal Rate);

public record OpeningStockDto(
    Guid Id, string EntryNo, Guid GodownId, string GodownName,
    DateOnly AsOn, string? Note,
    List<OpeningLineDto> Lines, decimal TotalQty, decimal TotalValue);

/// <summary>Jis maal ka stock minus me hai — Opening bharte waqt sabse pehle yahi chahiye.</summary>
public record MinusItemDto(Guid ItemId, string ItemName, string ItemKind,
                           Guid GodownId, string GodownName, decimal OnHand);

// ── likhne ke liye ──
public record SaveOpeningLineDto(Guid ItemId, string? Colour, string? Size,
                                 decimal Qty, string? Unit, decimal Rate);
public record SaveOpeningStockDto(Guid GodownId, DateOnly? AsOn, string? Note,
                                  List<SaveOpeningLineDto> Lines);

/// <summary>
/// Opening Stock — app shuru karne se PEHLE jo maal pada tha.
///
/// Iske bina har purana maal minus me chala jata hai: job slip usse bahar
/// bhejta hai, challan usse nikalta hai, par andar wo kabhi aaya hi nahi
/// hota. Ledger jhooth nahi bolta — hum maal andar dikhana bhool jaate hain.
///
/// Isliye is screen par sabse upar wahi maal dikhta hai jo abhi minus me hai.
/// Ek click me line bhar jati hai aur hisaab seedha ho jata hai.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/opening-stock")]
[ModuleAccess("manufacturer")]
public class OpeningStockController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMfgCounterService _counter;
    public OpeningStockController(AppDbContext db, IMfgCounterService counter)
    { _db = db; _counter = counter; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    [HttpGet]
    [HasPermission("stock.design.view.firm")]
    public async Task<IActionResult> List([FromQuery] Guid? godownId)
    {
        var firmId = CurrentFirmId;
        var q = _db.MfgOpeningStocks.AsNoTracking().Where(o => o.FirmId == firmId);
        if (godownId is Guid g) q = q.Where(o => o.GodownId == g);

        var rows = await q.OrderByDescending(o => o.AsOn).ThenByDescending(o => o.CreatedAt)
                          .Take(200).ToListAsync();
        return Ok(await BuildMany(firmId, rows));
    }

    [HttpGet("{id}")]
    [HasPermission("stock.design.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var o = await _db.MfgOpeningStocks.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (o is null) return NotFound();
        return Ok((await BuildMany(firmId, new List<OpeningStock> { o })).First());
    }

    /// <summary>
    /// Jo maal minus me hai — godown ke saath. Screen isi se lines bharti hai,
    /// taaki aadmi ko dhoondhna na pade ki kis cheez ka hisaab bigda hua hai.
    /// </summary>
    [HttpGet("minus")]
    [HasPermission("stock.design.view.firm")]
    public async Task<IActionResult> Minus()
    {
        var firmId = CurrentFirmId;

        var rows = await _db.StockLedger.AsNoTracking()
            .Where(s => s.FirmId == firmId)
            .GroupBy(s => new { s.GodownId, s.ItemId, s.ItemKind })
            .Select(g => new { g.Key.GodownId, g.Key.ItemId, g.Key.ItemKind,
                               OnHand = g.Sum(x => x.QtyIn - x.QtyOut) })
            .Where(x => x.OnHand < 0)
            .ToListAsync();
        if (rows.Count == 0) return Ok(Array.Empty<MinusItemDto>());

        var itemIds = rows.Select(r => r.ItemId).Distinct().ToList();
        var items = await _db.Items.AsNoTracking()
            .Where(i => itemIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, i => i.Name);

        var godownIds = rows.Select(r => r.GodownId).Distinct().ToList();
        var godowns = await _db.Godowns.AsNoTracking()
            .Where(g => godownIds.Contains(g.Id)).ToDictionaryAsync(g => g.Id, g => g.Name);

        return Ok(rows.OrderBy(r => r.OnHand).Select(r => new MinusItemDto(
            r.ItemId, items.GetValueOrDefault(r.ItemId, "—"), r.ItemKind,
            r.GodownId, godowns.GetValueOrDefault(r.GodownId, "—"), r.OnHand)));
    }

    [HttpPost]
    [HasPermission("stock.design.edit.firm")]
    public async Task<IActionResult> Create([FromBody] SaveOpeningStockDto dto)
    {
        var firmId = CurrentFirmId;
        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var op = new OpeningStock
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            GodownId = dto.GodownId,
            EntryNo = await _counter.NextAsync(firmId, dto.GodownId, "opening", "OP"),
            AsOn = dto.AsOn ?? Today(),
            Note = Trim(dto.Note),
            CreatedBy = CurrentUserId
        };
        _db.MfgOpeningStocks.Add(op);
        await _db.SaveChangesAsync();

        var kinds = await ItemKinds(firmId, dto.Lines.Select(l => l.ItemId));

        foreach (var l in dto.Lines)
        {
            _db.MfgOpeningStockLines.Add(new OpeningStockLine
            {
                Id = Guid.NewGuid(), FirmId = firmId, OpeningId = op.Id,
                ItemId = l.ItemId, Colour = Trim(l.Colour), Size = Trim(l.Size),
                Qty = l.Qty, Unit = string.IsNullOrWhiteSpace(l.Unit) ? "Pcs" : l.Unit.Trim(),
                Rate = l.Rate
            });

            // Maal ANDAR — bina tareekh ki chinta ke, kyunki ye sabse pehli entry hai
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = dto.GodownId, ItemId = l.ItemId,
                ItemKind = kinds.GetValueOrDefault(l.ItemId, "design"),
                Colour = Trim(l.Colour), Size = Trim(l.Size),
                QtyIn = l.Qty, RefType = "opening", RefId = op.Id,
                CreatedBy = CurrentUserId
            });
        }
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { op.Id, op.EntryNo });
    }

    /// <summary>Galat bhar diya to poori entry hatao — stock bhi utna hi ghategaa.</summary>
    [HttpDelete("{id}")]
    [HasPermission("stock.design.edit.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var firmId = CurrentFirmId;
        var op = await _db.MfgOpeningStocks
            .FirstOrDefaultAsync(o => o.Id == id && o.FirmId == firmId);
        if (op is null) return NotFound();

        await using var tx = await _db.Database.BeginTransactionAsync();

        var lines = await _db.MfgOpeningStockLines.Where(l => l.OpeningId == id).ToListAsync();
        var kinds = await ItemKinds(firmId, lines.Select(l => l.ItemId));

        foreach (var l in lines)
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = op.GodownId, ItemId = l.ItemId,
                ItemKind = kinds.GetValueOrDefault(l.ItemId, "design"),
                Colour = l.Colour, Size = l.Size,
                QtyOut = l.Qty, RefType = "opening", RefId = id,
                CreatedBy = CurrentUserId
            });

        _db.MfgOpeningStockLines.RemoveRange(lines);
        _db.MfgOpeningStocks.Remove(op);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { deleted = true });
    }

    // ══════════ madad ══════════

    private async Task<string?> ValidateAsync(Guid firmId, SaveOpeningStockDto dto)
    {
        if (dto.Lines is null || dto.Lines.Count == 0)
            return "Kam se kam ek maal to daaliye";
        if (dto.Lines.Any(l => l.Qty <= 0))
            return "Har line me quantity 0 se zyada honi chahiye";

        var godown = await _db.Godowns.AsNoTracking()
            .AnyAsync(g => g.Id == dto.GodownId && g.FirmId == firmId && g.IsActive);
        if (!godown) return "Godown chuniye — maal kahan pada hai ye batana zaroori hai";

        var itemIds = dto.Lines.Select(l => l.ItemId).Distinct().ToList();
        var mile = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && itemIds.Contains(i.Id))
            .Select(i => i.Id).ToListAsync();
        if (mile.Count != itemIds.Count)
            return "Koi maal list me nahi mila — page refresh karke dobara chuniye";

        return null;
    }

    private async Task<Dictionary<Guid, string>> ItemKinds(Guid firmId, IEnumerable<Guid> ids)
    {
        var list = ids.Distinct().ToList();
        if (list.Count == 0) return new Dictionary<Guid, string>();
        return await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && list.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.ItemKind == "material" ? "material" : "design");
    }

    private async Task<List<OpeningStockDto>> BuildMany(Guid firmId, List<OpeningStock> ops)
    {
        if (ops.Count == 0) return new List<OpeningStockDto>();
        var ids = ops.Select(o => o.Id).ToList();

        var lines = await _db.MfgOpeningStockLines.AsNoTracking()
            .Where(l => ids.Contains(l.OpeningId)).ToListAsync();

        var items = await _db.Items.AsNoTracking()
            .Where(i => lines.Select(l => l.ItemId).Distinct().Contains(i.Id))
            .Select(i => new { i.Id, i.Name, i.ItemKind })
            .ToDictionaryAsync(i => i.Id, i => i);

        var godownIds = ops.Select(o => o.GodownId).Distinct().ToList();
        var godowns = await _db.Godowns.AsNoTracking()
            .Where(g => godownIds.Contains(g.Id)).ToDictionaryAsync(g => g.Id, g => g.Name);

        return ops.Select(o =>
        {
            var ls = lines.Where(l => l.OpeningId == o.Id).Select(l =>
            {
                var it = items.GetValueOrDefault(l.ItemId);
                return new OpeningLineDto(l.Id, l.ItemId, it?.Name ?? "—",
                    it?.ItemKind ?? "design", l.Colour, l.Size, l.Qty, l.Unit, l.Rate);
            }).ToList();

            return new OpeningStockDto(
                o.Id, o.EntryNo, o.GodownId, godowns.GetValueOrDefault(o.GodownId, "—"),
                o.AsOn, o.Note, ls, ls.Sum(x => x.Qty), ls.Sum(x => x.Qty * x.Rate));
        }).ToList();
    }

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
