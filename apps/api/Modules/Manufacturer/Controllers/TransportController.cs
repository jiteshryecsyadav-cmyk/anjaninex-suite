using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Infrastructure.Storage;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record TransportRowDto(string Transport, int Challans,
                              int Bheja, int RasteMe, int Pahuncha, int Mila,
                              int PodBaki, DateOnly? Pehla, DateOnly? Aakhri,
                              decimal KulMaal, decimal KulRakam);

public record TransportShipDto(
    Guid Id, string DcNo, DateOnly ChallanDate, string PartyName,
    string GodownName, string? LrNo, string? TransportLr, string? VehicleNo,
    int? Packages, decimal TotalQty, decimal TotalAmount,
    string DeliveryStatus, string? PodReceivedBy, DateOnly? PodAt,
    string? PodNote, bool PodHai, bool Billed);

public record TransportDetailDto(string Transport, int Challans,
                                 int Bheja, int RasteMe, int Pahuncha, int Mila,
                                 decimal KulMaal, decimal KulRakam,
                                 List<TransportShipDto> Ships);

// ── likhne ke liye ──
public record SetStatusDto(string Status, string? TransportLr);
public record SavePodDto(string? ReceivedBy, DateOnly? PodAt, string? Note);

/// <summary>
/// Maal transport ko de diya — ab wo kahan hai?
///
/// Challan par transport ka naam, LR aur gaadi pehle se likhte the, par uske
/// BAAD ka kuch nahi tha. Maal nikla aur phir andhera: pahuncha ya nahi, kisne
/// liya, POD aayi ya nahi. Karkhane me sabse zyada phone isi baat ke ghumte
/// hain — "wo Surat wala maal pahuncha?"
///
/// Yahan transport ke NAAM se hisaab jodte hain, kisi master se nahi. Wajah:
/// challan par transport free-text hai (munshi jo likh de wahi). Master banane
/// se purane saare challan bahar reh jaate — jo hai usi se kaam chalana behtar.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/transport")]
[ModuleAccess("manufacturer")]
public class TransportController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IStorageService _storage;
    public TransportController(AppDbContext db, IStorageService storage)
    { _db = db; _storage = storage; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);

    /// <summary>Kis-kis transport ko maal diya — ek nazar me.</summary>
    [HttpGet]
    [HasPermission("sales.challan.view.place")]
    public async Task<IActionResult> List()
    {
        var firmId = CurrentFirmId;

        var cs = await _db.MfgDeliveryChallans.AsNoTracking()
            .Where(c => c.FirmId == firmId)
            .Select(c => new { c.Id, c.Transport, c.ChallanDate, c.DeliveryStatus })
            .ToListAsync();
        if (cs.Count == 0) return Ok(Array.Empty<TransportRowDto>());

        var totals = await LineTotals(cs.Select(c => c.Id).ToList());

        var rows = cs
            .GroupBy(c => string.IsNullOrWhiteSpace(c.Transport)
                          ? "(transport nahi likha)" : c.Transport!.Trim())
            .Select(g => new TransportRowDto(
                g.Key, g.Count(),
                g.Count(x => x.DeliveryStatus == "bheja"),
                g.Count(x => x.DeliveryStatus == "raste_me"),
                g.Count(x => x.DeliveryStatus == "pahuncha"),
                g.Count(x => x.DeliveryStatus == "mila"),
                g.Count(x => x.DeliveryStatus != "mila"),
                g.Min(x => (DateOnly?)x.ChallanDate),
                g.Max(x => (DateOnly?)x.ChallanDate),
                g.Sum(x => totals.GetValueOrDefault(x.Id).Qty),
                g.Sum(x => totals.GetValueOrDefault(x.Id).Amt)))
            // Jinki POD sabse zyada baki hai wo sabse upar — dabaav wahin dena hai
            .OrderByDescending(r => r.PodBaki).ThenByDescending(r => r.Challans)
            .ToList();

        return Ok(rows);
    }

    /// <summary>Ek transport ka poora hisaab — uske saare challan.</summary>
    [HttpGet("{transport}")]
    [HasPermission("sales.challan.view.place")]
    public async Task<IActionResult> Detail(string transport,
                                            [FromQuery] string? status)
    {
        var firmId = CurrentFirmId;
        var naam = (transport ?? "").Trim();
        var binaNaam = naam == "(transport nahi likha)";

        var q = _db.MfgDeliveryChallans.AsNoTracking().Where(c => c.FirmId == firmId);
        q = binaNaam
            ? q.Where(c => c.Transport == null || c.Transport.Trim() == "")
            : q.Where(c => c.Transport != null && c.Transport.Trim().ToLower() == naam.ToLower());

        var cs = await q.OrderByDescending(c => c.ChallanDate)
                        .ThenByDescending(c => c.CreatedAt).Take(300).ToListAsync();
        if (cs.Count == 0) return NotFound();

        if (!string.IsNullOrWhiteSpace(status) && status != "all")
            cs = cs.Where(c => c.DeliveryStatus == status).ToList();

        var totals = await LineTotals(cs.Select(c => c.Id).ToList());

        var partyNames = await PurchaseOrdersController.PartyNames(
            _db, cs.Select(c => c.PartyId).Distinct().ToList());
        var godowns = await _db.Godowns.AsNoTracking()
            .Where(g => cs.Select(c => c.GodownId).Distinct().Contains(g.Id))
            .ToDictionaryAsync(g => g.Id, g => g.Name);

        var ships = cs.Select(c =>
        {
            var t = totals.GetValueOrDefault(c.Id);
            return new TransportShipDto(
                c.Id, c.DcNo, c.ChallanDate,
                partyNames.GetValueOrDefault(c.PartyId, "—"),
                godowns.GetValueOrDefault(c.GodownId, "—"),
                c.LrNo, c.TransportLr, c.VehicleNo, c.Packages,
                t.Qty, t.Amt, c.DeliveryStatus,
                c.PodReceivedBy, c.PodAt, c.PodNote,
                !string.IsNullOrWhiteSpace(c.PodPhoto), c.BilledRefId is not null);
        }).ToList();

        return Ok(new TransportDetailDto(
            naam, cs.Count,
            cs.Count(c => c.DeliveryStatus == "bheja"),
            cs.Count(c => c.DeliveryStatus == "raste_me"),
            cs.Count(c => c.DeliveryStatus == "pahuncha"),
            cs.Count(c => c.DeliveryStatus == "mila"),
            ships.Sum(s => s.TotalQty), ships.Sum(s => s.TotalAmount), ships));
    }

    /// <summary>Maal ab kahan hai — bheja / raste_me / pahuncha / mila.</summary>
    [HttpPost("challan/{id}/status")]
    [HasPermission("sales.challan.edit.place")]
    public async Task<IActionResult> SetStatus(Guid id, [FromBody] SetStatusDto dto)
    {
        var firmId = CurrentFirmId;
        var c = await _db.MfgDeliveryChallans
            .FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (c is null) return NotFound();

        var s = (dto.Status ?? "").Trim().ToLowerInvariant();
        if (s is not ("bheja" or "raste_me" or "pahuncha" or "mila"))
            return BadRequest(new { error = "Halat galat hai — bheja, raste_me, pahuncha ya mila" });

        // "mila" ka matlab POD haath me hai. Bina uske ye halat lagane se
        // paisa maangte waqt saboot kuch bhi nahi rehta.
        if (s == "mila" && string.IsNullOrWhiteSpace(c.PodReceivedBy)
                        && string.IsNullOrWhiteSpace(c.PodPhoto))
            return BadRequest(new { error =
                "\"Mil gaya\" likhne se pehle POD bhariye — kisne liya, ya kaagaz ki photo" });

        c.DeliveryStatus = s;
        if (!string.IsNullOrWhiteSpace(dto.TransportLr)) c.TransportLr = dto.TransportLr.Trim();
        await _db.SaveChangesAsync();

        return Ok(new { c.DeliveryStatus, c.TransportLr });
    }

    /// <summary>POD ka byora — kisne liya, kab liya.</summary>
    [HttpPost("challan/{id}/pod")]
    [HasPermission("sales.challan.edit.place")]
    public async Task<IActionResult> SavePod(Guid id, [FromBody] SavePodDto dto)
    {
        var firmId = CurrentFirmId;
        var c = await _db.MfgDeliveryChallans
            .FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (c is null) return NotFound();

        if (string.IsNullOrWhiteSpace(dto.ReceivedBy))
            return BadRequest(new { error = "Kisne liya — naam likhna zaroori hai" });

        c.PodReceivedBy = dto.ReceivedBy.Trim();
        c.PodAt = dto.PodAt ?? Today();
        c.PodNote = string.IsNullOrWhiteSpace(dto.Note) ? null : dto.Note.Trim();
        // POD aa gayi to maal mil hi chuka hai — alag se halat badalne ki zarurat nahi
        c.DeliveryStatus = "mila";
        await _db.SaveChangesAsync();

        return Ok(new { c.DeliveryStatus, c.PodReceivedBy, c.PodAt });
    }

    /// <summary>POD kaagaz ki photo.</summary>
    [HttpPost("challan/{id}/pod-photo")]
    [HasPermission("sales.challan.edit.place")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadPod(Guid id, IFormFile file)
    {
        var firmId = CurrentFirmId;
        var c = await _db.MfgDeliveryChallans
            .FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (c is null) return NotFound();
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "Photo nahi mili" });

        var key = await _storage.UploadDocument(file, firmId, "pod");
        c.PodPhoto = key;
        if (c.DeliveryStatus != "mila" && !string.IsNullOrWhiteSpace(c.PodReceivedBy))
            c.DeliveryStatus = "mila";
        await _db.SaveChangesAsync();

        return Ok(new { photo = key });
    }

    /// <summary>Photo dekhne ka thodi der ka link (seedha object key kaam nahi karti).</summary>
    [HttpGet("challan/{id}/pod-photo")]
    [HasPermission("sales.challan.view.place")]
    public async Task<IActionResult> PodPhotoUrl(Guid id)
    {
        var firmId = CurrentFirmId;
        var c = await _db.MfgDeliveryChallans.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (c is null) return NotFound();
        if (string.IsNullOrWhiteSpace(c.PodPhoto))
            return BadRequest(new { error = "Is challan ki POD photo nahi hai" });

        var url = await _storage.GetPresignedUrl("documents", c.PodPhoto);
        return Ok(new { url });
    }

    // ══════════ madad ══════════

    private async Task<Dictionary<Guid, (decimal Qty, decimal Amt)>> LineTotals(List<Guid> dcIds)
    {
        if (dcIds.Count == 0) return new();
        var rows = await _db.MfgDeliveryChallanLines.AsNoTracking()
            .Where(l => dcIds.Contains(l.DcId))
            .GroupBy(l => l.DcId)
            .Select(g => new { DcId = g.Key, Qty = g.Sum(x => x.Qty),
                               Amt = g.Sum(x => x.Qty * x.Rate) })
            .ToListAsync();
        return rows.ToDictionary(r => r.DcId, r => (r.Qty, r.Amt));
    }

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
