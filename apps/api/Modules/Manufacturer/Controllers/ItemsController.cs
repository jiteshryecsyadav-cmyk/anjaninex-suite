using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

public record ItemDto(
    Guid Id, string ItemKind, string? Code, string Name,
    string? HsnSac, decimal TaxRate, string Unit,
    decimal DefaultRate, string? Category, string? Notes,
    string? PhotoUrl, string? ColourHint,
    decimal? MinStockQty, decimal? MinOrderQty, short? SetPieces,
    bool ShowOutOfStock, decimal? SamplePrice, string? SampleSource,
    bool IsActive,
    /// <summary>Abhi kitna maal hai — stock ledger se joda hua.</summary>
    decimal OnHand,
    /// <summary>MinStockQty se neeche gir gaya? List me laal dikhana hai.</summary>
    bool IsLow,
    string[] Tags);

public record SaveItemDto(
    string ItemKind, string? Code, string Name,
    string? HsnSac, decimal TaxRate, string Unit,
    decimal DefaultRate, string? Category, string? Notes,
    string? PhotoUrl, string? ColourHint,
    decimal? MinStockQty, decimal? MinOrderQty, short? SetPieces,
    bool ShowOutOfStock, decimal? SamplePrice, string? SampleSource,
    string[]? Tags, bool IsActive = true);

/// <summary>
/// Design aur Material — ek hi table (<c>trading.items</c>), farak sirf
/// <c>item_kind</c> ka. Stock hamesha ledger se joda jata hai, kabhi kisi
/// column me nahi rakha — warna "stock 40 dikha raha hai par godown me 12 hai"
/// wali haalat aati hai aur wajah kabhi nahi milti.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/items")]
[ModuleAccess("manufacturer")]
public class ItemsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ItemsController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);

    /// <param name="kind">design | material — khali chhodo to dono.</param>
    /// <param name="tag">Sirf is tag wali design.</param>
    /// <param name="lowOnly">Sirf wo jinka stock kam pad gaya hai.</param>
    [HttpGet]
    [HasPermission("stock.design.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? kind, [FromQuery] string? search,
                                          [FromQuery] string? tag, [FromQuery] bool lowOnly = false,
                                          [FromQuery] bool includeInactive = false)
    {
        var firmId = CurrentFirmId;
        var q = _db.Items.AsNoTracking().Where(i => i.FirmId == firmId);

        // 'other' purana trading data hai — manufacturer app me uska kaam nahi
        q = string.IsNullOrWhiteSpace(kind)
            ? q.Where(i => i.ItemKind == "design" || i.ItemKind == "material")
            : q.Where(i => i.ItemKind == kind);

        if (!includeInactive) q = q.Where(i => i.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(i => i.Name.ToLower().Contains(s)
                          || (i.Code != null && i.Code.ToLower().Contains(s)));
        }

        var items = await q.OrderBy(i => i.Name).ToListAsync();
        if (items.Count == 0) return Ok(Array.Empty<ItemDto>());

        var ids = items.Select(i => i.Id).ToList();

        // Stock — ek hi query me sabka, warna 100 design par 100 query chalti
        var stock = await _db.StockLedger.AsNoTracking()
            .Where(s => s.FirmId == firmId && ids.Contains(s.ItemId))
            .GroupBy(s => s.ItemId)
            .Select(g => new { ItemId = g.Key, OnHand = g.Sum(x => x.QtyIn - x.QtyOut) })
            .ToDictionaryAsync(x => x.ItemId, x => x.OnHand);

        // Tag bhi ek hi baar
        var tags = await (from it in _db.ItemTags.AsNoTracking()
                          join t in _db.DesignTags.AsNoTracking() on it.TagId equals t.Id
                          where it.FirmId == firmId && ids.Contains(it.ItemId)
                          select new { it.ItemId, t.Name })
                         .ToListAsync();
        var tagMap = tags.GroupBy(x => x.ItemId)
                         .ToDictionary(g => g.Key, g => g.Select(x => x.Name).ToArray());

        var rows = items.Select(i =>
        {
            var onHand = stock.TryGetValue(i.Id, out var h) ? h : 0m;
            return new ItemDto(
                i.Id, i.ItemKind, i.Code, i.Name, i.HsnSac, i.TaxRate, i.Unit,
                i.DefaultRate, i.Category, i.Notes, i.PhotoUrl, i.ColourHint,
                i.MinStockQty, i.MinOrderQty, i.SetPieces,
                i.ShowOutOfStock, i.SamplePrice, i.SampleSource, i.IsActive,
                onHand,
                i.MinStockQty is decimal min && onHand < min,
                tagMap.TryGetValue(i.Id, out var tg) ? tg : Array.Empty<string>());
        });

        if (lowOnly) rows = rows.Where(r => r.IsLow);
        if (!string.IsNullOrWhiteSpace(tag))
            rows = rows.Where(r => r.Tags.Any(t => t.Equals(tag, StringComparison.OrdinalIgnoreCase)));

        return Ok(rows.ToList());
    }

    [HttpPost]
    [HasPermission("stock.design.create.firm")]
    public async Task<IActionResult> Create([FromBody] SaveItemDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });

        var firmId = CurrentFirmId;
        var code = string.IsNullOrWhiteSpace(dto.Code) ? null : dto.Code.Trim();

        if (code is not null &&
            await _db.Items.AnyAsync(i => i.FirmId == firmId && i.Code != null
                                       && i.Code.ToLower() == code.ToLower()))
            return BadRequest(new { error = $"\"{code}\" code pehle se hai — doosra rakhiye" });

        var item = new Item
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            ItemKind = dto.ItemKind,
            Code = code,
            Name = dto.Name.Trim(),
            HsnSac = dto.HsnSac, TaxRate = dto.TaxRate,
            Unit = string.IsNullOrWhiteSpace(dto.Unit) ? "PCS" : dto.Unit,
            DefaultRate = dto.DefaultRate,
            Category = dto.Category, Notes = dto.Notes,
            PhotoUrl = dto.PhotoUrl, ColourHint = dto.ColourHint,
            MinStockQty = dto.MinStockQty, MinOrderQty = dto.MinOrderQty,
            SetPieces = dto.SetPieces, ShowOutOfStock = dto.ShowOutOfStock,
            SamplePrice = dto.SamplePrice, SampleSource = dto.SampleSource,
            IsActive = dto.IsActive,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.Items.Add(item);
        await _db.SaveChangesAsync();

        await SyncTags(firmId, item.Id, dto.Tags);
        return Ok(new { item.Id });
    }

    [HttpPut("{id}")]
    [HasPermission("stock.design.edit.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SaveItemDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });

        var firmId = CurrentFirmId;
        var item = await _db.Items.FirstOrDefaultAsync(i => i.Id == id && i.FirmId == firmId);
        if (item is null) return NotFound();

        var code = string.IsNullOrWhiteSpace(dto.Code) ? null : dto.Code.Trim();
        if (code is not null &&
            await _db.Items.AnyAsync(i => i.FirmId == firmId && i.Id != id
                                       && i.Code != null && i.Code.ToLower() == code.ToLower()))
            return BadRequest(new { error = $"\"{code}\" code doosre item par pehle se hai" });

        // design ↔ material badalna khatarnak hai: uska stock, recipe aur
        // purane document sab galat jagah dikhne lagenge
        if (item.ItemKind != dto.ItemKind)
        {
            var used = await _db.StockLedger.AnyAsync(s => s.FirmId == firmId && s.ItemId == id);
            if (used)
                return BadRequest(new { error =
                    "Iska stock chal chuka hai — ab design/material badla nahi ja sakta. " +
                    "Naya item banaiye aur ise band kar dijiye." });
        }

        item.ItemKind = dto.ItemKind;
        item.Code = code;
        item.Name = dto.Name.Trim();
        item.HsnSac = dto.HsnSac; item.TaxRate = dto.TaxRate;
        item.Unit = string.IsNullOrWhiteSpace(dto.Unit) ? "PCS" : dto.Unit;
        item.DefaultRate = dto.DefaultRate;
        item.Category = dto.Category; item.Notes = dto.Notes;
        item.PhotoUrl = dto.PhotoUrl; item.ColourHint = dto.ColourHint;
        item.MinStockQty = dto.MinStockQty; item.MinOrderQty = dto.MinOrderQty;
        item.SetPieces = dto.SetPieces; item.ShowOutOfStock = dto.ShowOutOfStock;
        item.SamplePrice = dto.SamplePrice; item.SampleSource = dto.SampleSource;
        item.IsActive = dto.IsActive;

        await _db.SaveChangesAsync();
        await SyncTags(firmId, id, dto.Tags);
        return Ok(new { item.Id });
    }

    /// <summary>Tag ki master list — filter isi se chalta hai.</summary>
    [HttpGet("tags")]
    [HasPermission("stock.design.view.firm")]
    public async Task<IActionResult> Tags()
    {
        var firmId = CurrentFirmId;
        return Ok(await _db.DesignTags.AsNoTracking()
            .Where(t => t.FirmId == firmId)
            .OrderBy(t => t.Name)
            .Select(t => t.Name)
            .ToListAsync());
    }

    // ── madad ──

    /// <summary>
    /// Tag master list se hi bante hain. Koi "cotton" likhta hai koi "Cotton" —
    /// dono alag tag ban jaate the aur filter me aadha maal gayab ho jata tha.
    /// Isliye naam se dhoondh kar, na mile tabhi naya banate hain.
    /// </summary>
    private async Task SyncTags(Guid firmId, Guid itemId, string[]? names)
    {
        var old = await _db.ItemTags.Where(x => x.ItemId == itemId).ToListAsync();
        _db.ItemTags.RemoveRange(old);

        if (names is { Length: > 0 })
        {
            foreach (var raw in names.Select(n => n.Trim()).Where(n => n.Length > 0).Distinct())
            {
                var tag = await _db.DesignTags
                    .FirstOrDefaultAsync(t => t.FirmId == firmId && t.Name.ToLower() == raw.ToLower());
                if (tag is null)
                {
                    tag = new Entities.DesignTag { Id = Guid.NewGuid(), FirmId = firmId, Name = raw };
                    _db.DesignTags.Add(tag);
                    await _db.SaveChangesAsync();
                }
                _db.ItemTags.Add(new Entities.ItemTag { FirmId = firmId, ItemId = itemId, TagId = tag.Id });
            }
        }
        await _db.SaveChangesAsync();
    }

    private static string? Validate(SaveItemDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return "Naam zaroori hai";
        if (dto.ItemKind is not ("design" or "material"))
            return "Design hai ya material — ye chunna zaroori hai";
        if (dto.DefaultRate < 0)
            return "Rate rin (minus) me nahi ho sakta";
        return null;
    }
}
