using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Manufacturer.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record TransferLineDto(Guid Id, Guid ItemId, string ItemName, string ItemKind,
                              string? Colour, string? Size, decimal Qty, string Unit);

public record StockTransferDto(
    Guid Id, string TransferNo,
    Guid FromGodownId, string FromGodownName,
    Guid ToGodownId, string ToGodownName,
    DateOnly TransferDate, string? Transport, string? LrNo, string? VehicleNo, string? Note,
    List<TransferLineDto> Lines, decimal TotalQty);

/// <summary>Ek godown me kya-kya pada hai — transfer bharte waqt yahi list chahiye.</summary>
public record GodownStockDto(Guid ItemId, string ItemName, string ItemKind,
                             string? Colour, string? Size, decimal OnHand);

// ── likhne ke liye ──
public record SaveTransferLineDto(Guid ItemId, string? Colour, string? Size,
                                  decimal Qty, string? Unit);
public record SaveStockTransferDto(
    Guid FromGodownId, Guid ToGodownId, DateOnly? TransferDate,
    string? Transport, string? LrNo, string? VehicleNo, string? Note,
    List<SaveTransferLineDto> Lines);

/// <summary>
/// Stock Transfer — maal ek godown se doosre me.
///
/// Har line par DO ledger entry banti hain: nikalne wale godown se ghata,
/// aane wale me jama. Kul stock waisa ka waisa rehta hai — sirf jagah badalti
/// hai. Ek hi entry banate to kul stock hi badal jata, jo galat hota.
///
/// Nikalne wale godown me jitna hai usse zyada nahi ja sakta — wahi rok jo
/// challan par hai.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/stock-transfers")]
[ModuleAccess("manufacturer")]
public class StockTransfersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMfgCounterService _counter;
    public StockTransfersController(AppDbContext db, IMfgCounterService counter)
    { _db = db; _counter = counter; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    [HttpGet]
    [HasPermission("stock.design.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] Guid? godownId)
    {
        var firmId = CurrentFirmId;
        var q = _db.MfgStockTransfers.AsNoTracking().Where(t => t.FirmId == firmId);
        if (godownId is Guid g)
            q = q.Where(t => t.FromGodownId == g || t.ToGodownId == g);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(t => t.TransferNo.ToLower().Contains(s)
                          || (t.LrNo != null && t.LrNo.ToLower().Contains(s))
                          || (t.VehicleNo != null && t.VehicleNo.ToLower().Contains(s)));
        }

        var rows = await q.OrderByDescending(t => t.TransferDate).ThenByDescending(t => t.CreatedAt)
                          .Take(200).ToListAsync();
        return Ok(await BuildMany(firmId, rows));
    }

    [HttpGet("{id}")]
    [HasPermission("stock.design.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var t = await _db.MfgStockTransfers.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (t is null) return NotFound();
        return Ok((await BuildMany(firmId, new List<StockTransfer> { t })).First());
    }

    /// <summary>
    /// Chune hue godown me kya-kya pada hai. Screen isi se maal chunwati hai —
    /// warna aadmi wo cheez chun leta jo us godown me hai hi nahi.
    /// </summary>
    [HttpGet("godown/{godownId}/stock")]
    [HasPermission("stock.design.view.firm")]
    public async Task<IActionResult> GodownStock(Guid godownId)
    {
        var firmId = CurrentFirmId;

        var rows = await _db.StockLedger.AsNoTracking()
            .Where(s => s.FirmId == firmId && s.GodownId == godownId)
            .GroupBy(s => new { s.ItemId, s.ItemKind, s.Colour, s.Size })
            .Select(g => new { g.Key.ItemId, g.Key.ItemKind, g.Key.Colour, g.Key.Size,
                               OnHand = g.Sum(x => x.QtyIn - x.QtyOut) })
            .Where(x => x.OnHand > 0)
            .ToListAsync();
        if (rows.Count == 0) return Ok(Array.Empty<GodownStockDto>());

        var items = await _db.Items.AsNoTracking()
            .Where(i => rows.Select(r => r.ItemId).Distinct().Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Name);

        return Ok(rows.OrderByDescending(r => r.OnHand).Select(r => new GodownStockDto(
            r.ItemId, items.GetValueOrDefault(r.ItemId, "—"), r.ItemKind,
            r.Colour, r.Size, r.OnHand)));
    }

    [HttpPost]
    [HasPermission("stock.design.edit.firm")]
    public async Task<IActionResult> Create([FromBody] SaveStockTransferDto dto)
    {
        var firmId = CurrentFirmId;
        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var tr = new StockTransfer
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            TransferNo = await _counter.NextAsync(firmId, dto.FromGodownId, "transfer", "TR"),
            FromGodownId = dto.FromGodownId,
            ToGodownId = dto.ToGodownId,
            TransferDate = dto.TransferDate ?? Today(),
            Transport = Trim(dto.Transport),
            LrNo = Trim(dto.LrNo),
            VehicleNo = Trim(dto.VehicleNo),
            Note = Trim(dto.Note),
            CreatedBy = CurrentUserId
        };
        _db.MfgStockTransfers.Add(tr);
        await _db.SaveChangesAsync();

        var kinds = await ItemKinds(firmId, dto.Lines.Select(l => l.ItemId));

        foreach (var l in dto.Lines)
        {
            _db.MfgStockTransferLines.Add(new StockTransferLine
            {
                Id = Guid.NewGuid(), FirmId = firmId, TransferId = tr.Id,
                ItemId = l.ItemId, Colour = Trim(l.Colour), Size = Trim(l.Size),
                Qty = l.Qty, Unit = string.IsNullOrWhiteSpace(l.Unit) ? "Pcs" : l.Unit.Trim()
            });

            var kind = kinds.GetValueOrDefault(l.ItemId, "design");

            // DO entry — ek nikalne wale se, ek aane wale me. Kul stock nahi badalta.
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = dto.FromGodownId, ItemId = l.ItemId,
                ItemKind = kind, Colour = Trim(l.Colour), Size = Trim(l.Size),
                QtyOut = l.Qty, RefType = "transfer", RefId = tr.Id,
                CreatedBy = CurrentUserId
            });
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = dto.ToGodownId, ItemId = l.ItemId,
                ItemKind = kind, Colour = Trim(l.Colour), Size = Trim(l.Size),
                QtyIn = l.Qty, RefType = "transfer", RefId = tr.Id,
                CreatedBy = CurrentUserId
            });
        }
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { tr.Id, tr.TransferNo });
    }

    /// <summary>Transfer hatao — dono taraf ka asar ulta ho jata hai.</summary>
    [HttpDelete("{id}")]
    [HasPermission("stock.design.edit.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var firmId = CurrentFirmId;
        var tr = await _db.MfgStockTransfers
            .FirstOrDefaultAsync(t => t.Id == id && t.FirmId == firmId);
        if (tr is null) return NotFound();

        await using var tx = await _db.Database.BeginTransactionAsync();

        var lines = await _db.MfgStockTransferLines.Where(l => l.TransferId == id).ToListAsync();
        var kinds = await ItemKinds(firmId, lines.Select(l => l.ItemId));

        foreach (var l in lines)
        {
            var kind = kinds.GetValueOrDefault(l.ItemId, "design");
            // Ulta: jahan se gaya tha wahan wapas, jahan aaya tha wahan se nikal
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = tr.FromGodownId, ItemId = l.ItemId,
                ItemKind = kind, Colour = l.Colour, Size = l.Size,
                QtyIn = l.Qty, RefType = "transfer", RefId = id, CreatedBy = CurrentUserId
            });
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = tr.ToGodownId, ItemId = l.ItemId,
                ItemKind = kind, Colour = l.Colour, Size = l.Size,
                QtyOut = l.Qty, RefType = "transfer", RefId = id, CreatedBy = CurrentUserId
            });
        }

        _db.MfgStockTransferLines.RemoveRange(lines);
        _db.MfgStockTransfers.Remove(tr);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { deleted = true });
    }

    // ══════════ madad ══════════

    private async Task<string?> ValidateAsync(Guid firmId, SaveStockTransferDto dto)
    {
        if (dto.Lines is null || dto.Lines.Count == 0)
            return "Kam se kam ek maal to daaliye";
        if (dto.Lines.Any(l => l.Qty <= 0))
            return "Har line me quantity 0 se zyada honi chahiye";
        if (dto.FromGodownId == dto.ToGodownId)
            return "Ek hi godown me transfer ka koi matlab nahi — doosri jagah chuniye";

        var godowns = await _db.Godowns.AsNoTracking()
            .Where(g => g.FirmId == firmId && g.IsActive
                     && (g.Id == dto.FromGodownId || g.Id == dto.ToGodownId))
            .Select(g => g.Id).ToListAsync();
        if (godowns.Count != 2) return "Dono godown chalu hone chahiye";

        var itemIds = dto.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Name);
        if (items.Count != itemIds.Count)
            return "Koi maal list me nahi mila — page refresh karke dobara chuniye";

        // Jitna wahan hai usse zyada nahi ja sakta. Rang/size par nahi, sirf
        // maal + godown par — wahi rok jo challan par hai (ek chhoti rang ki
        // galti se poora transfer nahi rukna chahiye).
        var stock = await _db.StockLedger.AsNoTracking()
            .Where(s => s.FirmId == firmId && s.GodownId == dto.FromGodownId
                     && itemIds.Contains(s.ItemId))
            .GroupBy(s => s.ItemId)
            .Select(g => new { ItemId = g.Key, OnHand = g.Sum(x => x.QtyIn - x.QtyOut) })
            .ToDictionaryAsync(x => x.ItemId, x => x.OnHand);

        foreach (var grp in dto.Lines.GroupBy(l => l.ItemId))
        {
            var hai = stock.GetValueOrDefault(grp.Key, 0m);
            var chahiye = grp.Sum(x => x.Qty);
            if (chahiye > hai)
                return $"{items[grp.Key]} — is godown me sirf {hai:0.##} hai, {chahiye:0.##} nahi bhej sakte.";
        }
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

    private async Task<List<StockTransferDto>> BuildMany(Guid firmId, List<StockTransfer> trs)
    {
        if (trs.Count == 0) return new List<StockTransferDto>();
        var ids = trs.Select(t => t.Id).ToList();

        var lines = await _db.MfgStockTransferLines.AsNoTracking()
            .Where(l => ids.Contains(l.TransferId)).ToListAsync();

        var items = await _db.Items.AsNoTracking()
            .Where(i => lines.Select(l => l.ItemId).Distinct().Contains(i.Id))
            .Select(i => new { i.Id, i.Name, i.ItemKind })
            .ToDictionaryAsync(i => i.Id, i => i);

        var godownIds = trs.SelectMany(t => new[] { t.FromGodownId, t.ToGodownId })
                           .Distinct().ToList();
        var godowns = await _db.Godowns.AsNoTracking()
            .Where(g => godownIds.Contains(g.Id)).ToDictionaryAsync(g => g.Id, g => g.Name);

        return trs.Select(t =>
        {
            var ls = lines.Where(l => l.TransferId == t.Id).Select(l =>
            {
                var it = items.GetValueOrDefault(l.ItemId);
                return new TransferLineDto(l.Id, l.ItemId, it?.Name ?? "—",
                    it?.ItemKind ?? "design", l.Colour, l.Size, l.Qty, l.Unit);
            }).ToList();

            return new StockTransferDto(
                t.Id, t.TransferNo,
                t.FromGodownId, godowns.GetValueOrDefault(t.FromGodownId, "—"),
                t.ToGodownId, godowns.GetValueOrDefault(t.ToGodownId, "—"),
                t.TransferDate, t.Transport, t.LrNo, t.VehicleNo, t.Note,
                ls, ls.Sum(x => x.Qty));
        }).ToList();
    }

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
