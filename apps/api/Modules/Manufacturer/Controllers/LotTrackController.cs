using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

public record LotSlipDto(Guid SlipId, string SlipNo, string KarigarName, string JobType,
                         DateTimeOffset IssuedAt, DateOnly? DueAt, string Status,
                         int BananeHain, int Aaye, int Kharab, int Baki,
                         string Designs, decimal MajooriBani);

public record LotDto(string LotNo, int SlipCount, DateTimeOffset PehliSlip,
                     int BananeHain, int Aaye, int Kharab, int Baki,
                     string Karigars, bool Poora, int? DerDin);

public record LotDetailDto(string LotNo, int BananeHain, int Aaye, int Kharab, int Baki,
                           List<LotSlipDto> Slips);

/// <summary>
/// Track Jobslip Lots — ek lot ka maal abhi kahan hai.
///
/// Ek hi lot ka kapda kai karigaron me bat jata hai: cutting kisi aur ke paas,
/// silai kisi aur ke paas, finishing teesre ke paas. Job Slip screen par har
/// slip alag dikhti hai — par malik poochta hai "wo GREEN wala lot kahan tak
/// pahuncha?" Uska jawab ek jagah kahin nahi tha.
///
/// Naya kuch nahi banaya — job slip ka `lot_no` pehle se hai. Bas usi ke
/// hisaab se jodkar dikha rahe hain.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/lots")]
[ModuleAccess("manufacturer")]
public class LotTrackController : ControllerBase
{
    private readonly AppDbContext _db;
    public LotTrackController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);

    /// <param name="status">chal | poora | all — khali to chalu wale.</param>
    [HttpGet]
    [HasPermission("production.jobslip.view.place")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] string? status)
    {
        var firmId = CurrentFirmId;

        var slips = await _db.JobSlips.AsNoTracking()
            .Where(s => s.FirmId == firmId && s.LotNo != null && s.LotNo != ""
                     && s.Status != "cancelled")
            .Select(s => new { s.Id, s.LotNo, s.KarigarId, s.IssuedAt, s.DueAt })
            .ToListAsync();
        if (slips.Count == 0) return Ok(Array.Empty<LotDto>());

        var counts = await SlipCounts(slips.Select(s => s.Id).ToList());

        var karigarIds = slips.Select(s => s.KarigarId).Distinct().ToList();
        var karigars = await _db.Karigars.AsNoTracking()
            .Where(k => karigarIds.Contains(k.Id)).ToDictionaryAsync(k => k.Id, k => k.Name);

        var aaj = Today();

        var lots = slips.GroupBy(s => s.LotNo!).Select(g =>
        {
            var planned = g.Sum(s => counts.GetValueOrDefault(s.Id).Planned);
            var got     = g.Sum(s => counts.GetValueOrDefault(s.Id).Got);
            var bad     = g.Sum(s => counts.GetValueOrDefault(s.Id).Bad);
            var baki    = Math.Max(0, planned - got);

            // Sabse purani "kab tak" tareekh nikal gayi to lot der se chal raha hai
            var due = g.Where(s => s.DueAt != null).Select(s => s.DueAt!.Value)
                       .DefaultIfEmpty().Min();
            int? der = (baki > 0 && due != default && due < aaj) ? aaj.DayNumber - due.DayNumber : null;

            return new LotDto(
                g.Key, g.Count(), g.Min(s => s.IssuedAt),
                planned, got, bad, baki,
                string.Join(", ", g.Select(s => karigars.GetValueOrDefault(s.KarigarId, "—"))
                                   .Distinct()),
                baki == 0 && planned > 0, der);
        }).ToList();

        lots = status switch
        {
            "all"      => lots,
            "poora"    => lots.Where(l => l.Poora).ToList(),
            null or "" => lots.Where(l => !l.Poora).ToList(),
            _          => lots
        };

        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLowerInvariant();
            lots = lots.Where(l => l.LotNo.ToLowerInvariant().Contains(t)
                                || l.Karigars.ToLowerInvariant().Contains(t)).ToList();
        }

        // Sabse zyada der wala sabse upar — wahi pehle dekhna hota hai
        return Ok(lots.OrderByDescending(l => l.DerDin ?? -1)
                      .ThenByDescending(l => l.Baki).ToList());
    }

    /// <summary>Ek lot — kaunsi slip kis karigar ke paas, aur kitna baki.</summary>
    [HttpGet("{lotNo}")]
    [HasPermission("production.jobslip.view.place")]
    public async Task<IActionResult> Detail(string lotNo)
    {
        var firmId = CurrentFirmId;

        var slips = await _db.JobSlips.AsNoTracking()
            .Where(s => s.FirmId == firmId && s.LotNo == lotNo && s.Status != "cancelled")
            .OrderBy(s => s.IssuedAt)
            .ToListAsync();
        if (slips.Count == 0) return NotFound();

        var ids = slips.Select(s => s.Id).ToList();
        var counts = await SlipCounts(ids);

        var karigarIds = slips.Select(s => s.KarigarId).Distinct().ToList();
        var karigars = await _db.Karigars.AsNoTracking()
            .Where(k => karigarIds.Contains(k.Id)).ToDictionaryAsync(k => k.Id, k => k.Name);

        // Har slip me kaunse design ban rahe hain
        var progs = await (from p in _db.JobSlipPrograms.AsNoTracking()
                           where ids.Contains(p.JobSlipId)
                           join i in _db.Items.AsNoTracking() on p.DesignId equals i.Id
                           select new { p.JobSlipId, p.Part, i.Name, p.JobRate })
                          .ToListAsync();

        var rows = slips.Select(s =>
        {
            var c = counts.GetValueOrDefault(s.Id);
            var mine = progs.Where(p => p.JobSlipId == s.Id).ToList();
            return new LotSlipDto(
                s.Id, s.SlipNo, karigars.GetValueOrDefault(s.KarigarId, "—"), s.JobType,
                s.IssuedAt, s.DueAt, s.Status,
                c.Planned, c.Got, c.Bad, Math.Max(0, c.Planned - c.Got),
                string.Join(", ", mine.Select(p => $"{p.Name} ({p.Part})").Distinct()),
                // Majoori sirf achhe piece par — kharab ki nahi banti
                c.Got * (mine.FirstOrDefault()?.JobRate ?? 0m));
        }).ToList();

        return Ok(new LotDetailDto(lotNo,
            rows.Sum(r => r.BananeHain), rows.Sum(r => r.Aaye),
            rows.Sum(r => r.Kharab), rows.Sum(r => r.Baki), rows));
    }

    // ══════════ madad ══════════

    /// <summary>Har slip par — kitne banane the, kitne aaye, kitne kharab.</summary>
    private async Task<Dictionary<Guid, (int Planned, int Got, int Bad)>> SlipCounts(List<Guid> ids)
    {
        if (ids.Count == 0) return new();

        var planned = await _db.JobSlipPrograms.AsNoTracking()
            .Where(p => ids.Contains(p.JobSlipId))
            .Join(_db.JobSlipProgramSizes.AsNoTracking(), p => p.Id, z => z.ProgramId,
                  (p, z) => new { p.JobSlipId, z.Qty })
            .GroupBy(x => x.JobSlipId)
            .Select(g => new { SlipId = g.Key, Qty = g.Sum(x => x.Qty) })
            .ToDictionaryAsync(x => x.SlipId, x => x.Qty);

        var got = await _db.JobSlipReceipts.AsNoTracking()
            .Where(r => ids.Contains(r.JobSlipId))
            .GroupBy(r => r.JobSlipId)
            .Select(g => new { SlipId = g.Key, Qty = g.Sum(x => x.Qty),
                               Bad = g.Sum(x => x.RejectedQty) })
            .ToDictionaryAsync(x => x.SlipId, x => new { x.Qty, x.Bad });

        return ids.ToDictionary(id => id, id => (
            planned.GetValueOrDefault(id, 0),
            got.TryGetValue(id, out var g) ? g.Qty : 0,
            got.TryGetValue(id, out var b) ? b.Bad : 0));
    }

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
