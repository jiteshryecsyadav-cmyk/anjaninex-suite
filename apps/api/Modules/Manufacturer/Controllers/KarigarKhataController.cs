using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Common.Db;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Manufacturer.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record KhataRowDto(Guid KarigarId, string Name, string? Mobile, string? JobType,
                          bool IsActive,
                          decimal MajooriBani, int AchhePiece, int KharabPiece,
                          decimal MajooriDi, decimal AdvanceDiya, decimal KulDiya,
                          decimal Bakaya);

public record KhataEntryDto(DateOnly Date, string Kism, string Ref,
                            string? Detail, decimal Bani, decimal Diya);

public record KhataDetailDto(KhataRowDto Karigar, List<KhataEntryDto> Entries);

// ── likhne ke liye ──
public record PayKarigarDto(Guid KarigarId, DateOnly? PaidOn, decimal Amount,
                            string? Mode, string? RefNo, bool IsAdvance,
                            Guid? JobSlipId, string? Note);

/// <summary>
/// Karigar ka khata — kiska kitna bakaya hai.
///
/// Job slip se ye to pata chal jata tha ki majoori KITNI BANI, par ye kahin
/// nahi tha ki usko DIYA kitna. Karkhane me sabse zyada jhagda isi baat par
/// hota hai. Ab dono ek hi jagah:
///
///     BANI (achhe piece × rate)  −  DIYA (advance samet)  =  BAKAYA
///
/// Majoori sirf ACHHE piece par banti hai — kharab nikle maal ki nahi.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/karigar-khata")]
[ModuleAccess("manufacturer")]
public class KarigarKhataController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMfgCounterService _counter;
    public KarigarKhataController(AppDbContext db, IMfgCounterService counter)
    { _db = db; _counter = counter; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    /// <param name="onlyDue">true = sirf wo jinka kuch bakaya hai.</param>
    [HttpGet]
    [HasPermission("production.khata.view.place")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] bool? onlyDue)
    {
        var rows = await KhataRows(CurrentFirmId, null);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLowerInvariant();
            rows = rows.Where(r => r.Name.ToLowerInvariant().Contains(t)
                                || (r.Mobile ?? "").Contains(t)).ToList();
        }
        if (onlyDue == true) rows = rows.Where(r => r.Bakaya != 0).ToList();

        return Ok(rows.OrderByDescending(r => r.Bakaya).ToList());
    }

    /// <summary>Ek karigar ka poora khata — kab kya bana, kab kya diya.</summary>
    [HttpGet("{karigarId}")]
    [HasPermission("production.khata.view.place")]
    public async Task<IActionResult> Detail(Guid karigarId)
    {
        var firmId = CurrentFirmId;
        var rows = await KhataRows(firmId, karigarId);
        if (rows.Count == 0) return NotFound();

        var entries = new List<KhataEntryDto>();

        // ── BANI: har khep jo karigar se wapas aayi ──
        var receipts = await (from r in _db.JobSlipReceipts.AsNoTracking()
                              join s in _db.JobSlips.AsNoTracking() on r.JobSlipId equals s.Id
                              where s.FirmId == firmId && s.KarigarId == karigarId
                              select new { r.ReceivedAt, r.Qty, r.RejectedQty, r.DesignId,
                                           s.SlipNo, s.Id })
                             .ToListAsync();

        var slipIds = receipts.Select(x => x.Id).Distinct().ToList();
        var programs = await _db.JobSlipPrograms.AsNoTracking()
            .Where(p => slipIds.Contains(p.JobSlipId))
            .Select(p => new { p.JobSlipId, p.DesignId, p.JobRate })
            .ToListAsync();

        foreach (var r in receipts)
        {
            // Receipt jis design ki hai usi program ka rate; design na likha ho
            // to slip ka pehla program (aam taur par ek hi hota hai)
            var rate = programs.FirstOrDefault(p => p.JobSlipId == r.Id
                                                && (r.DesignId == null || p.DesignId == r.DesignId))
                       ?? programs.FirstOrDefault(p => p.JobSlipId == r.Id);
            var bani = r.Qty * (rate?.JobRate ?? 0m);
            var kharab = r.RejectedQty > 0 ? $" · {r.RejectedQty} kharab (majoori nahi)" : "";

            entries.Add(new KhataEntryDto(
                DateOnly.FromDateTime(r.ReceivedAt.UtcDateTime),
                "bani", r.SlipNo, $"{r.Qty} piece{kharab}", bani, 0));
        }

        // ── DIYA: bhugtan aur advance ──
        var pays = await _db.MfgKarigarPayments.AsNoTracking()
            .Where(p => p.FirmId == firmId && p.KarigarId == karigarId)
            .ToListAsync();

        foreach (var p in pays)
        {
            var kya = p.IsAdvance ? "advance" : "diya";
            var det = ModeLabel(p.Mode) + (string.IsNullOrWhiteSpace(p.RefNo) ? "" : $" · {p.RefNo}");
            entries.Add(new KhataEntryDto(p.PaidOn, kya, p.PaymentNo, det, 0, p.Amount));
        }

        return Ok(new KhataDetailDto(rows[0],
            entries.OrderByDescending(e => e.Date).ToList()));
    }

    [HttpPost("pay")]
    [HasPermission("production.khata.edit.place")]
    public async Task<IActionResult> Pay([FromBody] PayKarigarDto dto)
    {
        var firmId = CurrentFirmId;

        if (dto.Amount <= 0)
            return BadRequest(new { error = "Rakam 0 se zyada honi chahiye" });

        var k = await _db.Karigars.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == dto.KarigarId && x.FirmId == firmId);
        if (k is null) return BadRequest(new { error = "Karigar nahi mila" });

        var mode = (dto.Mode ?? "cash").Trim().ToLowerInvariant();
        if (mode is not ("cash" or "bank" or "upi" or "cheque"))
            return BadRequest(new { error = "Paisa kaise diya — cash, bank, UPI ya cheque" });

        if (dto.JobSlipId is Guid sid)
        {
            var ok = await _db.JobSlips.AsNoTracking()
                .AnyAsync(s => s.Id == sid && s.FirmId == firmId && s.KarigarId == dto.KarigarId);
            if (!ok) return BadRequest(new { error = "Ye job slip is karigar ki nahi hai" });
        }

        var pay = new KarigarPayment
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            KarigarId = dto.KarigarId,
            PaymentNo = await _counter.NextAsync(firmId, null, "karigarpay", "KP"),
            PaidOn = dto.PaidOn ?? Today(),
            Amount = dto.Amount,
            Mode = mode,
            RefNo = Trim(dto.RefNo),
            IsAdvance = dto.IsAdvance,
            JobSlipId = dto.JobSlipId,
            Note = Trim(dto.Note),
            CreatedBy = CurrentUserId
        };
        _db.MfgKarigarPayments.Add(pay);
        await _db.SaveChangesAsync();

        return Ok(new { pay.Id, pay.PaymentNo });
    }

    [HttpDelete("pay/{id}")]
    [HasPermission("production.khata.delete.place")]
    public async Task<IActionResult> DeletePay(Guid id)
    {
        var firmId = CurrentFirmId;
        var pay = await _db.MfgKarigarPayments
            .FirstOrDefaultAsync(p => p.Id == id && p.FirmId == firmId);
        if (pay is null) return NotFound();

        _db.MfgKarigarPayments.Remove(pay);
        await _db.SaveChangesAsync();
        return Ok(new { deleted = true });
    }

    // ══════════ madad ══════════

    /// <summary>
    /// Khata `mfg.v_karigar_khata` view se aata hai — hisaab ek hi jagah likha
    /// hai (SQL me), do jagah nahi. EF is view ko nahi jaanta, isliye seedha
    /// ADO. Connection pehle se khuli hai (RLS ka tenant context usi par set
    /// hai) — usko OpenAsync mat karna.
    /// </summary>
    private async Task<List<KhataRowDto>> KhataRows(Guid firmId, Guid? karigarId)
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
SELECT karigar_id, name, mobile, job_type, is_active,
       majoori_bani, achhe_piece, kharab_piece,
       majoori_di, advance_diya, kul_diya, bakaya
  FROM mfg.v_karigar_khata
 WHERE firm_id = @f AND (@k IS NULL OR karigar_id = @k)
 ORDER BY name";

        var pf = cmd.CreateParameter(); pf.ParameterName = "@f"; pf.Value = firmId;
        cmd.Parameters.Add(pf);
        var pk = cmd.CreateParameter(); pk.ParameterName = "@k";
        pk.Value = (object?)karigarId ?? DBNull.Value;
        cmd.Parameters.Add(pk);

        var outp = new List<KhataRowDto>();
        await using var rd = await cmd.ExecuteReaderAsync();
        while (await rd.ReadAsync())
        {
            outp.Add(new KhataRowDto(
                rd.GetGuid(0), rd.GetString(1),
                rd.IsDBNull(2) ? null : rd.GetString(2),
                rd.IsDBNull(3) ? null : rd.GetString(3),
                rd.GetBoolean(4),
                rd.GetDecimal(5), (int)rd.GetInt64(6), (int)rd.GetInt64(7),
                rd.GetDecimal(8), rd.GetDecimal(9), rd.GetDecimal(10), rd.GetDecimal(11)));
        }
        return outp;
    }

    private static string ModeLabel(string m) => m switch
    {
        "bank"   => "Bank",
        "upi"    => "UPI",
        "cheque" => "Cheque",
        _        => "Cash"
    };

    private static string? Trim(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
