using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Manufacturer.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record SoLineDto(Guid Id, Guid ItemId, string ItemName, string? Colour, string? Size,
                        decimal Qty, string Unit, decimal Rate, string? RatioNote,
                        decimal Dispatched, decimal Pending, decimal StockHai);

public record SalesOrderDto(
    Guid Id, string SoNo, Guid PartyId, string PartyName,
    Guid? AgentId, string? AgentName, Guid? GodownId, string? GodownName,
    DateOnly OrderDate, DateOnly? DueAt, string? Transport, string? BuyerRef, string? Note,
    string Status, List<SoLineDto> Lines,
    decimal TotalQty, decimal TotalAmount, decimal PendingQty);

// ── likhne ke liye ──
public record SaveSoLineDto(Guid ItemId, string? Colour, string? Size,
                            decimal Qty, string? Unit, decimal Rate, string? RatioNote);
public record SaveSalesOrderDto(
    Guid PartyId, Guid? AgentId, Guid? GodownId,
    DateOnly? OrderDate, DateOnly? DueAt, string? Transport, string? BuyerRef, string? Note,
    List<SaveSoLineDto> Lines);

/// <summary>
/// Sales Order — grahak ne kya manga.
///
/// Stock yahan nahi hilta (maal abhi gaya hi nahi). Iska asli faayda do jagah
/// hai: Delivery Challan ke waqt "kitna bhejna baki hai", aur Job Slip ke waqt
/// "kya-kya banana hai". Isliye har line par ye bhi batate hain ki us maal ka
/// stock abhi hai ya nahi — order lete waqt hi pata chal jaye ki banana padega.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/sales-orders")]
[ModuleAccess("manufacturer")]
public class SalesOrdersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMfgCounterService _counter;
    public SalesOrdersController(AppDbContext db, IMfgCounterService counter)
    { _db = db; _counter = counter; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    [HttpGet]
    [HasPermission("sales.order.view.place")]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? search,
                                          [FromQuery] Guid? partyId)
    {
        var firmId = CurrentFirmId;
        var q = _db.MfgSalesOrders.AsNoTracking().Where(s => s.FirmId == firmId);

        q = status switch
        {
            "all"      => q,
            null or "" => q.Where(s => s.Status == "open" || s.Status == "partial"),
            _          => q.Where(s => s.Status == status)
        };
        if (partyId is Guid pid) q = q.Where(s => s.PartyId == pid);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLower();
            q = q.Where(s => s.SoNo.ToLower().Contains(t)
                          || (s.BuyerRef != null && s.BuyerRef.ToLower().Contains(t)));
        }

        var sos = await q.OrderByDescending(s => s.OrderDate).ThenByDescending(s => s.CreatedAt)
                         .Take(200).ToListAsync();
        return Ok(await BuildMany(firmId, sos));
    }

    [HttpGet("{id}")]
    [HasPermission("sales.order.view.place")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var so = await _db.MfgSalesOrders.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == id && s.FirmId == firmId);
        if (so is null) return NotFound();
        return Ok((await BuildMany(firmId, new List<SalesOrder> { so })).First());
    }

    /// <summary>Challan banate waqt — sirf wahi lines jo abhi bheji nahi gayi.</summary>
    [HttpGet("{id}/pending")]
    [HasPermission("sales.challan.create.place")]
    public async Task<IActionResult> Pending(Guid id)
    {
        var firmId = CurrentFirmId;
        var so = await _db.MfgSalesOrders.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == id && s.FirmId == firmId);
        if (so is null) return NotFound();

        var full = (await BuildMany(firmId, new List<SalesOrder> { so })).First();
        return Ok(full with { Lines = full.Lines.Where(l => l.Pending > 0).ToList() });
    }

    [HttpPost]
    [HasPermission("sales.order.create.place")]
    public async Task<IActionResult> Create([FromBody] SaveSalesOrderDto dto)
    {
        var firmId = CurrentFirmId;
        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var so = new SalesOrder
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            GodownId = dto.GodownId,
            SoNo = await _counter.NextAsync(firmId, dto.GodownId, "so", "SO"),
            PartyId = dto.PartyId,
            AgentId = dto.AgentId,
            OrderDate = dto.OrderDate ?? Today(),
            DueAt = dto.DueAt,
            Transport = Trim(dto.Transport),
            BuyerRef = Trim(dto.BuyerRef),
            Note = Trim(dto.Note),
            CreatedBy = CurrentUserId
        };
        _db.MfgSalesOrders.Add(so);
        await _db.SaveChangesAsync();

        AddLines(firmId, so.Id, dto.Lines);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { so.Id, so.SoNo });
    }

    [HttpPut("{id}")]
    [HasPermission("sales.order.edit.place")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SaveSalesOrderDto dto)
    {
        var firmId = CurrentFirmId;
        var so = await _db.MfgSalesOrders
            .FirstOrDefaultAsync(s => s.Id == id && s.FirmId == firmId);
        if (so is null) return NotFound();

        if (so.Status == "cancelled")
            return BadRequest(new { error = "Cancel ho chuka order badla nahi ja sakta" });

        // Maal nikalna shuru ho gaya to line badalne se "kitna baki" jhooth
        // bolne lagega — purana challan kis line ka tha, ye tay nahi ho payega
        var nikla = await _db.MfgDeliveryChallans.AnyAsync(c => c.SoId == id);
        if (nikla)
            return BadRequest(new { error =
                "Is order ka maal nikalna shuru ho chuka hai — ab lines nahi badal sakti" });

        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        so.PartyId   = dto.PartyId;
        so.AgentId   = dto.AgentId;
        so.GodownId  = dto.GodownId;
        so.OrderDate = dto.OrderDate ?? so.OrderDate;
        so.DueAt     = dto.DueAt;
        so.Transport = Trim(dto.Transport);
        so.BuyerRef  = Trim(dto.BuyerRef);
        so.Note      = Trim(dto.Note);
        so.UpdatedAt = DateTimeOffset.UtcNow;

        var old = await _db.MfgSalesOrderLines.Where(l => l.SoId == id).ToListAsync();
        _db.MfgSalesOrderLines.RemoveRange(old);
        await _db.SaveChangesAsync();

        AddLines(firmId, id, dto.Lines);
        await _db.SaveChangesAsync();
        return Ok(new { so.Id, so.SoNo });
    }

    /// <summary>Mitate nahi — SO number grahak ko bola ja chuka hoga.</summary>
    [HttpPost("{id}/cancel")]
    [HasPermission("sales.order.delete.place")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var firmId = CurrentFirmId;
        var so = await _db.MfgSalesOrders
            .FirstOrDefaultAsync(s => s.Id == id && s.FirmId == firmId);
        if (so is null) return NotFound();

        var nikla = await _db.MfgDeliveryChallans.AnyAsync(c => c.SoId == id);
        if (nikla)
            return BadRequest(new { error =
                "Is order ka maal nikal chuka hai — ab cancel nahi hota" });

        so.Status = "cancelled";
        so.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { so.Status });
    }

    // ══════════ madad ══════════

    private void AddLines(Guid firmId, Guid soId, List<SaveSoLineDto> lines)
    {
        foreach (var l in lines)
            _db.MfgSalesOrderLines.Add(new SalesOrderLine
            {
                Id = Guid.NewGuid(), FirmId = firmId, SoId = soId,
                ItemId = l.ItemId, Colour = Trim(l.Colour), Size = Trim(l.Size),
                Qty = l.Qty, Unit = string.IsNullOrWhiteSpace(l.Unit) ? "Pcs" : l.Unit.Trim(),
                Rate = l.Rate, RatioNote = Trim(l.RatioNote)
            });
    }

    private async Task<string?> ValidateAsync(Guid firmId, SaveSalesOrderDto dto)
    {
        if (dto.Lines is null || dto.Lines.Count == 0)
            return "Kam se kam ek maal to daaliye";
        if (dto.Lines.Any(l => l.Qty <= 0))
            return "Har line me quantity 0 se zyada honi chahiye";

        var party = await _db.PartyProfiles.AsNoTracking()
            .AnyAsync(p => p.Id == dto.PartyId && p.FirmId == firmId);
        if (!party) return "Customer nahi mila — pehle Masters → Customers me jodiye";

        var itemIds = dto.Lines.Select(l => l.ItemId).Distinct().ToList();
        var mile = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && itemIds.Contains(i.Id))
            .Select(i => i.Id).ToListAsync();
        if (mile.Count != itemIds.Count)
            return "Koi maal list me nahi mila — page refresh karke dobara chuniye";

        if (dto.GodownId is Guid g)
        {
            var ok = await _db.Godowns.AsNoTracking()
                .AnyAsync(x => x.Id == g && x.FirmId == firmId && x.IsActive);
            if (!ok) return "Ye godown chalu nahi hai";
        }
        if (dto.AgentId is Guid a)
        {
            var ok = await _db.MfgAgents.AsNoTracking()
                .AnyAsync(x => x.Id == a && x.FirmId == firmId && x.IsActive);
            if (!ok) return "Ye agent chalu nahi hai";
        }
        return null;
    }

    private async Task<List<SalesOrderDto>> BuildMany(Guid firmId, List<SalesOrder> sos)
    {
        if (sos.Count == 0) return new List<SalesOrderDto>();
        var ids = sos.Select(s => s.Id).ToList();

        var lines = await _db.MfgSalesOrderLines.AsNoTracking()
            .Where(l => ids.Contains(l.SoId)).ToListAsync();

        // Har line par ab tak kitna nikal chuka
        var lineIds = lines.Select(l => (Guid?)l.Id).ToList();
        var nikla = await _db.MfgDeliveryChallanLines.AsNoTracking()
            .Where(x => x.SoLineId != null && lineIds.Contains(x.SoLineId))
            .GroupBy(x => x.SoLineId!.Value)
            .Select(g => new { LineId = g.Key, Qty = g.Sum(x => x.Qty) })
            .ToDictionaryAsync(x => x.LineId, x => x.Qty);

        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var itemNames = await _db.Items.AsNoTracking()
            .Where(i => itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Name);

        // Stock — order lete waqt hi dikh jaye ki banana padega ya maujood hai
        var stock = await _db.StockLedger.AsNoTracking()
            .Where(s => s.FirmId == firmId && itemIds.Contains(s.ItemId))
            .GroupBy(s => s.ItemId)
            .Select(g => new { ItemId = g.Key, OnHand = g.Sum(x => x.QtyIn - x.QtyOut) })
            .ToDictionaryAsync(x => x.ItemId, x => x.OnHand);

        var partyNames = await PurchaseOrdersController.PartyNames(
            _db, sos.Select(s => s.PartyId).Distinct().ToList());

        var agentIds = sos.Where(s => s.AgentId != null).Select(s => s.AgentId!.Value).Distinct().ToList();
        var agentNames = agentIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.MfgAgents.AsNoTracking()
                .Where(a => agentIds.Contains(a.Id))
                .ToDictionaryAsync(a => a.Id, a => a.Name);

        var godownIds = sos.Where(s => s.GodownId != null).Select(s => s.GodownId!.Value).Distinct().ToList();
        var godownNames = godownIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.Godowns.AsNoTracking()
                .Where(g => godownIds.Contains(g.Id))
                .ToDictionaryAsync(g => g.Id, g => g.Name);

        var outp = new List<SalesOrderDto>();
        foreach (var s in sos)
        {
            var ls = lines.Where(l => l.SoId == s.Id).Select(l =>
            {
                var sent = nikla.TryGetValue(l.Id, out var d) ? d : 0m;
                return new SoLineDto(
                    l.Id, l.ItemId, itemNames.GetValueOrDefault(l.ItemId, "—"),
                    l.Colour, l.Size, l.Qty, l.Unit, l.Rate, l.RatioNote,
                    sent, Math.Max(0, l.Qty - sent),
                    stock.GetValueOrDefault(l.ItemId, 0m));
            }).ToList();

            outp.Add(new SalesOrderDto(
                s.Id, s.SoNo, s.PartyId, partyNames.GetValueOrDefault(s.PartyId, "—"),
                s.AgentId, s.AgentId is Guid a ? agentNames.GetValueOrDefault(a) : null,
                s.GodownId, s.GodownId is Guid g ? godownNames.GetValueOrDefault(g) : null,
                s.OrderDate, s.DueAt, s.Transport, s.BuyerRef, s.Note, s.Status, ls,
                ls.Sum(x => x.Qty), ls.Sum(x => x.Qty * x.Rate), ls.Sum(x => x.Pending)));
        }
        return outp;
    }

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
