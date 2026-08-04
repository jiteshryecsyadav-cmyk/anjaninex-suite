using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Manufacturer.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record PoLineDto(Guid Id, Guid ItemId, string ItemName, string? Colour, string? Size,
                        decimal Qty, string Unit, decimal Rate,
                        string? DealerCode, string? LotNo,
                        decimal Received, decimal Pending);

public record PurchaseOrderDto(
    Guid Id, string PoNo, Guid PartyId, string PartyName,
    Guid? AgentId, string? AgentName, Guid? GodownId, string? GodownName,
    DateOnly OrderDate, DateOnly? DueAt, string? Transport, string? Note,
    string Status, List<PoLineDto> Lines,
    decimal TotalQty, decimal TotalAmount, decimal PendingQty);

// ── likhne ke liye ──
public record SavePoLineDto(Guid ItemId, string? Colour, string? Size,
                            decimal Qty, string? Unit, decimal Rate,
                            string? DealerCode, string? LotNo);
public record SavePurchaseOrderDto(
    Guid PartyId, Guid? AgentId, Guid? GodownId,
    DateOnly? OrderDate, DateOnly? DueAt, string? Transport, string? Note,
    List<SavePoLineDto> Lines);

/// <summary>
/// Purchase Order — mill ko diya hua order.
///
/// PO khud stock nahi badalta — maal abhi aaya hi nahi. Stock tab chalta hai
/// jab Purchase Inward banti hai. PO ka kaam sirf itna hai ki "kya mangaya tha"
/// yaad rahe, aur inward ke waqt usse mila kar bataya ja sake ki kitna baki hai.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/purchase-orders")]
[ModuleAccess("manufacturer")]
public class PurchaseOrdersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMfgCounterService _counter;
    public PurchaseOrdersController(AppDbContext db, IMfgCounterService counter)
    { _db = db; _counter = counter; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    /// <param name="status">open | partial | done | cancelled | all — khali to chalu wale.</param>
    [HttpGet]
    [HasPermission("purchase.po.view.place")]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? search,
                                          [FromQuery] Guid? partyId)
    {
        var firmId = CurrentFirmId;
        var q = _db.MfgPurchaseOrders.AsNoTracking().Where(p => p.FirmId == firmId);

        q = status switch
        {
            "all"      => q,
            null or "" => q.Where(p => p.Status == "open" || p.Status == "partial"),
            _          => q.Where(p => p.Status == status)
        };
        if (partyId is Guid pid) q = q.Where(p => p.PartyId == pid);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLower();
            q = q.Where(p => p.PoNo.ToLower().Contains(t));
        }

        var pos = await q.OrderByDescending(p => p.OrderDate).ThenByDescending(p => p.CreatedAt)
                         .Take(200).ToListAsync();
        return Ok(await BuildMany(firmId, pos));
    }

    [HttpGet("{id}")]
    [HasPermission("purchase.po.view.place")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var po = await _db.MfgPurchaseOrders.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id && p.FirmId == firmId);
        if (po is null) return NotFound();
        return Ok((await BuildMany(firmId, new List<PurchaseOrder> { po })).First());
    }

    /// <summary>
    /// Inward banate waqt "kya-kya baki hai" — sirf wahi lines jo poori nahi hui.
    /// </summary>
    [HttpGet("{id}/pending")]
    [HasPermission("purchase.inward.create.place")]
    public async Task<IActionResult> Pending(Guid id)
    {
        var firmId = CurrentFirmId;
        var po = await _db.MfgPurchaseOrders.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id && p.FirmId == firmId);
        if (po is null) return NotFound();

        var full = (await BuildMany(firmId, new List<PurchaseOrder> { po })).First();
        return Ok(full with { Lines = full.Lines.Where(l => l.Pending > 0).ToList() });
    }

    [HttpPost]
    [HasPermission("purchase.po.create.place")]
    public async Task<IActionResult> Create([FromBody] SavePurchaseOrderDto dto)
    {
        var firmId = CurrentFirmId;
        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var po = new PurchaseOrder
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            GodownId = dto.GodownId,
            PoNo = await _counter.NextAsync(firmId, dto.GodownId, "po", "PO"),
            PartyId = dto.PartyId,
            AgentId = dto.AgentId,
            OrderDate = dto.OrderDate ?? Today(),
            DueAt = dto.DueAt,
            Transport = Trim(dto.Transport),
            Note = Trim(dto.Note),
            CreatedBy = CurrentUserId
        };
        _db.MfgPurchaseOrders.Add(po);
        await _db.SaveChangesAsync();

        AddLines(firmId, po.Id, dto.Lines);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { po.Id, po.PoNo });
    }

    [HttpPut("{id}")]
    [HasPermission("purchase.po.edit.place")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SavePurchaseOrderDto dto)
    {
        var firmId = CurrentFirmId;
        var po = await _db.MfgPurchaseOrders
            .FirstOrDefaultAsync(p => p.Id == id && p.FirmId == firmId);
        if (po is null) return NotFound();

        if (po.Status == "cancelled")
            return BadRequest(new { error = "Cancel ho chuka order badla nahi ja sakta" });

        // Maal aana shuru ho gaya to line badalne se "baki kitna" ki ginti
        // jhooth bolne lagegi — pehle jo inward hui hai wo kis line ki thi,
        // ye ab tay nahi ho sakta.
        var aaya = await _db.MfgPurchaseInwards.AnyAsync(i => i.PoId == id);
        if (aaya)
            return BadRequest(new { error =
                "Is order ka maal aana shuru ho chuka hai — ab lines nahi badal sakti" });

        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        po.PartyId   = dto.PartyId;
        po.AgentId   = dto.AgentId;
        po.GodownId  = dto.GodownId;
        po.OrderDate = dto.OrderDate ?? po.OrderDate;
        po.DueAt     = dto.DueAt;
        po.Transport = Trim(dto.Transport);
        po.Note      = Trim(dto.Note);
        po.UpdatedAt = DateTimeOffset.UtcNow;

        var old = await _db.MfgPurchaseOrderLines.Where(l => l.PoId == id).ToListAsync();
        _db.MfgPurchaseOrderLines.RemoveRange(old);
        await _db.SaveChangesAsync();

        AddLines(firmId, id, dto.Lines);
        await _db.SaveChangesAsync();
        return Ok(new { po.Id, po.PoNo });
    }

    /// <summary>
    /// Order band karna. Mita nahi rahe — PO number kisi ne mill ko bola hoga,
    /// wo kaagaz par rehna chahiye.
    /// </summary>
    [HttpPost("{id}/cancel")]
    [HasPermission("purchase.po.delete.place")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var firmId = CurrentFirmId;
        var po = await _db.MfgPurchaseOrders
            .FirstOrDefaultAsync(p => p.Id == id && p.FirmId == firmId);
        if (po is null) return NotFound();

        var aaya = await _db.MfgPurchaseInwards.AnyAsync(i => i.PoId == id);
        if (aaya)
            return BadRequest(new { error =
                "Is order ka maal aa chuka hai — ab cancel nahi hota" });

        po.Status = "cancelled";
        po.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { po.Status });
    }

    // ══════════ madad ══════════

    private void AddLines(Guid firmId, Guid poId, List<SavePoLineDto> lines)
    {
        foreach (var l in lines)
            _db.MfgPurchaseOrderLines.Add(new PurchaseOrderLine
            {
                Id = Guid.NewGuid(), FirmId = firmId, PoId = poId,
                ItemId = l.ItemId, Colour = Trim(l.Colour), Size = Trim(l.Size),
                Qty = l.Qty, Unit = string.IsNullOrWhiteSpace(l.Unit) ? "Meter" : l.Unit.Trim(),
                Rate = l.Rate, DealerCode = Trim(l.DealerCode), LotNo = Trim(l.LotNo)
            });
    }

    private async Task<string?> ValidateAsync(Guid firmId, SavePurchaseOrderDto dto)
    {
        if (dto.Lines is null || dto.Lines.Count == 0)
            return "Kam se kam ek maal to daaliye";
        if (dto.Lines.Any(l => l.Qty <= 0))
            return "Har line me quantity 0 se zyada honi chahiye";

        var party = await _db.PartyProfiles.AsNoTracking()
            .AnyAsync(p => p.Id == dto.PartyId && p.FirmId == firmId);
        if (!party) return "Supplier nahi mila — pehle Masters → Suppliers me jodiye";

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

    private async Task<List<PurchaseOrderDto>> BuildMany(Guid firmId, List<PurchaseOrder> pos)
    {
        if (pos.Count == 0) return new List<PurchaseOrderDto>();
        var ids = pos.Select(p => p.Id).ToList();

        var lines = await _db.MfgPurchaseOrderLines.AsNoTracking()
            .Where(l => ids.Contains(l.PoId)).ToListAsync();

        // Har line par ab tak kitna aa chuka
        var lineIds = lines.Select(l => (Guid?)l.Id).ToList();
        var aaya = await _db.MfgPurchaseInwardLines.AsNoTracking()
            .Where(x => x.PoLineId != null && lineIds.Contains(x.PoLineId))
            .GroupBy(x => x.PoLineId!.Value)
            .Select(g => new { LineId = g.Key, Qty = g.Sum(x => x.Qty) })
            .ToDictionaryAsync(x => x.LineId, x => x.Qty);

        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var itemNames = await _db.Items.AsNoTracking()
            .Where(i => itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Name);

        var partyIds = pos.Select(p => p.PartyId).Distinct().ToList();
        var partyNames = await PartyNames(_db, partyIds);

        var agentIds = pos.Where(p => p.AgentId != null).Select(p => p.AgentId!.Value).Distinct().ToList();
        var agentNames = agentIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.MfgAgents.AsNoTracking()
                .Where(a => agentIds.Contains(a.Id))
                .ToDictionaryAsync(a => a.Id, a => a.Name);

        var godownIds = pos.Where(p => p.GodownId != null).Select(p => p.GodownId!.Value).Distinct().ToList();
        var godownNames = godownIds.Count == 0 ? new Dictionary<Guid, string>()
            : await _db.Godowns.AsNoTracking()
                .Where(g => godownIds.Contains(g.Id))
                .ToDictionaryAsync(g => g.Id, g => g.Name);

        var outp = new List<PurchaseOrderDto>();
        foreach (var p in pos)
        {
            var ls = lines.Where(l => l.PoId == p.Id).Select(l =>
            {
                var got = aaya.TryGetValue(l.Id, out var r) ? r : 0m;
                return new PoLineDto(
                    l.Id, l.ItemId, itemNames.GetValueOrDefault(l.ItemId, "—"),
                    l.Colour, l.Size, l.Qty, l.Unit, l.Rate, l.DealerCode, l.LotNo,
                    got, Math.Max(0, l.Qty - got));
            }).ToList();

            outp.Add(new PurchaseOrderDto(
                p.Id, p.PoNo, p.PartyId, partyNames.GetValueOrDefault(p.PartyId, "—"),
                p.AgentId, p.AgentId is Guid a ? agentNames.GetValueOrDefault(a) : null,
                p.GodownId, p.GodownId is Guid g ? godownNames.GetValueOrDefault(g) : null,
                p.OrderDate, p.DueAt, p.Transport, p.Note, p.Status, ls,
                ls.Sum(x => x.Qty), ls.Sum(x => x.Qty * x.Rate), ls.Sum(x => x.Pending)));
        }
        return outp;
    }

    /// <summary>
    /// Party ka naam <c>core.contacts.display_name</c> me hai, party_profiles me
    /// nahi — profile sirf udhaar/rate wali baatein rakhti hai.
    /// </summary>
    internal static async Task<Dictionary<Guid, string>> PartyNames(
        AppDbContext db, List<Guid> partyIds)
    {
        if (partyIds.Count == 0) return new Dictionary<Guid, string>();
        var rows = await (from p in db.PartyProfiles.AsNoTracking()
                          join c in db.Contacts.AsNoTracking() on p.ContactId equals c.Id
                          where partyIds.Contains(p.Id)
                          select new { p.Id, c.DisplayName }).ToListAsync();
        return rows.ToDictionary(x => x.Id, x => x.DisplayName);
    }

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
