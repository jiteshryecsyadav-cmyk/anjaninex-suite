using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Manufacturer.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── padhne ke liye ──
public record JsMaterialDto(Guid Id, Guid MaterialId, string MaterialName,
                            string? Colour, decimal Qty, string Unit, decimal[] Takas);
public record JsSizeDto(Guid Id, string Size, string? Colour, int Qty);
public record JsRatioDto(Guid Id, string Size, int Ratio, int Banenge);
public record JsProgramDto(Guid Id, Guid DesignId, string DesignName, string Part,
                           decimal JobRate, string RateUnit,
                           List<JsRatioDto> Ratios, List<JsSizeDto> Sizes, int TotalPieces);
public record JsReceiptDto(Guid Id, DateTimeOffset ReceivedAt, Guid? DesignId,
                           string? Size, string? Colour, int Qty, int RejectedQty, string? Note);

public record JobSlipDto(
    Guid Id, string SlipNo, string? LotNo,
    Guid KarigarId, string KarigarName, string JobType,
    Guid? GodownId, Guid? SalesOrderId,
    DateTimeOffset IssuedAt, DateOnly? DueAt, string Status, string? Note,
    List<JsMaterialDto> Materials, List<JsProgramDto> Programs, List<JsReceiptDto> Receipts,
    int BananeHain, int Aaye, int Kharab, int Baki, decimal MajooriBani);

// ── likhne ke liye ──
public record SaveJsMaterialDto(Guid MaterialId, string? Colour, decimal Qty, string Unit,
                                decimal[]? Takas);
public record SaveJsRatioDto(string Size, int Ratio);
public record SaveJsSizeDto(string Size, string? Colour, int Qty);
public record SaveJsProgramDto(Guid DesignId, string Part, decimal JobRate, string RateUnit,
                               List<SaveJsRatioDto>? Ratios, List<SaveJsSizeDto>? Sizes);
public record SaveJobSlipDto(
    Guid KarigarId, string JobType, string? LotNo, Guid? GodownId, Guid? SalesOrderId,
    DateOnly? DueAt, string? Note,
    List<SaveJsMaterialDto> Materials, List<SaveJsProgramDto> Programs);

public record AddReceiptDto(Guid? DesignId, string? Size, string? Colour,
                            int Qty, int RejectedQty, string? Note, string? PhotoUrl);

/// <summary>
/// Job Slip — manufacturer ka asli kaagaz.
///
/// Do hisse hote hain:
///   MATERIAL — karigar ko KYA DIYA (rang, qty, taka)
///   PROGRAM  — usse KYA BANANA hai (design, hissa, ratio, size-wise)
///
/// Dono milane se pata chalta hai ki kitna maal bahar gaya aur kitna wapas
/// aana baki hai. Iske bina maal karigar ke paas atka reh jata hai aur
/// mahino baad pata chalta hai.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/jobslips")]
[ModuleAccess("manufacturer")]
public class JobSlipsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMfgCounterService _counter;
    public JobSlipsController(AppDbContext db, IMfgCounterService counter)
    { _db = db; _counter = counter; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    /// <param name="status">open | partial | done | cancelled — khali to chalu wale.</param>
    [HttpGet]
    [HasPermission("production.jobslip.view.place")]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? search,
                                          [FromQuery] Guid? karigarId)
    {
        var firmId = CurrentFirmId;
        var q = _db.JobSlips.AsNoTracking().Where(s => s.FirmId == firmId);

        q = status switch
        {
            "all"  => q,
            "done" => q.Where(s => s.Status == "done"),
            null or "" => q.Where(s => s.Status == "open" || s.Status == "partial"),
            _      => q.Where(s => s.Status == status)
        };
        if (karigarId is Guid k) q = q.Where(s => s.KarigarId == k);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim().ToLower();
            q = q.Where(s => s.SlipNo.ToLower().Contains(t)
                          || (s.LotNo != null && s.LotNo.ToLower().Contains(t)));
        }

        var slips = await q.OrderByDescending(s => s.IssuedAt).Take(200).ToListAsync();
        var dtos = new List<JobSlipDto>();
        foreach (var s in slips) dtos.Add(await Build(firmId, s, light: true));
        return Ok(dtos);
    }

    [HttpGet("{id}")]
    [HasPermission("production.jobslip.view.place")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var s = await _db.JobSlips.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        return s is null ? NotFound() : Ok(await Build(firmId, s, light: false));
    }

    [HttpPost]
    [HasPermission("production.jobslip.create.place")]
    public async Task<IActionResult> Create([FromBody] SaveJobSlipDto dto)
    {
        var firmId = CurrentFirmId;

        var err = await ValidateAsync(firmId, dto);
        if (err is not null) return BadRequest(new { error = err });

        await using var tx = await _db.Database.BeginTransactionAsync();

        var slip = new JobSlip
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            GodownId = dto.GodownId,
            SlipNo = await _counter.NextAsync(firmId, dto.GodownId, "jobslip", "JS"),
            LotNo = dto.LotNo,
            KarigarId = dto.KarigarId,
            JobType = dto.JobType.Trim(),
            SalesOrderId = dto.SalesOrderId,
            DueAt = dto.DueAt,
            Note = dto.Note,
            CreatedBy = CurrentUserId
        };
        _db.JobSlips.Add(slip);
        await _db.SaveChangesAsync();

        await WriteLines(firmId, slip.Id, dto);

        // Maal karigar ko GAYA — godown se ghata do. Bina iske stock kaagaz par
        // to kam hai par app me poora dikhta rehta hai.
        if (dto.GodownId is Guid gid)
            foreach (var m in dto.Materials)
                _db.StockLedger.Add(new StockLedgerEntry
                {
                    FirmId = firmId, GodownId = gid, ItemId = m.MaterialId,
                    ItemKind = "material", Colour = m.Colour,
                    QtyOut = m.Qty, RefType = "jobslip", RefId = slip.Id,
                    CreatedBy = CurrentUserId
                });

        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { slip.Id, slip.SlipNo });
    }

    /// <summary>
    /// Karigar se maal wapas aaya. Har baar thoda-thoda aata hai, isliye har
    /// aane par ek entry — poori slip ek saath band nahi hoti.
    /// </summary>
    [HttpPost("{id}/receipts")]
    [HasPermission("production.jobslip.edit.place")]
    public async Task<IActionResult> AddReceipt(Guid id, [FromBody] AddReceiptDto dto)
    {
        var firmId = CurrentFirmId;
        var slip = await _db.JobSlips.FirstOrDefaultAsync(s => s.Id == id && s.FirmId == firmId);
        if (slip is null) return NotFound();

        if (slip.Status == "cancelled")
            return BadRequest(new { error = "Ye slip cancel ho chuki hai" });
        if (dto.Qty < 0 || dto.RejectedQty < 0)
            return BadRequest(new { error = "Ginti rin (minus) me nahi ho sakti" });
        if (dto.Qty == 0 && dto.RejectedQty == 0)
            return BadRequest(new { error = "Kitna maal aaya — wo to likhiye" });

        // Diye se zyada wapas aa raha hai — ye galti hai, pakadni chahiye
        var planned = await PlannedPieces(firmId, id);
        var already = await _db.JobSlipReceipts
            .Where(r => r.JobSlipId == id).SumAsync(r => (int?)r.Qty) ?? 0;
        if (planned > 0 && already + dto.Qty > planned)
            return BadRequest(new { error =
                $"Banane the {planned}, ab tak {already} aa chuke — {dto.Qty} aur nahi ho sakte" });

        await using var tx = await _db.Database.BeginTransactionAsync();

        _db.JobSlipReceipts.Add(new JobSlipReceipt
        {
            Id = Guid.NewGuid(), FirmId = firmId, JobSlipId = id,
            DesignId = dto.DesignId, Size = dto.Size, Colour = dto.Colour,
            Qty = dto.Qty, RejectedQty = dto.RejectedQty,
            Note = dto.Note, PhotoUrl = dto.PhotoUrl, CreatedBy = CurrentUserId
        });

        // Bana hua maal godown me AAYA. Kharab nikla maal stock me nahi jodte —
        // wo bikega hi nahi, aur uski majoori bhi nahi banti.
        if (slip.GodownId is Guid gid && dto.DesignId is Guid did && dto.Qty > 0)
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = gid, ItemId = did,
                ItemKind = "design", Colour = dto.Colour, Size = dto.Size,
                QtyIn = dto.Qty, RefType = "receipt", RefId = id,
                CreatedBy = CurrentUserId
            });

        await _db.SaveChangesAsync();

        // Sab aa gaya to slip khud band — warna wo hamesha "chal rahi" dikhti
        // rehti aur "kitna atka hai" ki ginti galat hoti
        var total = already + dto.Qty;
        slip.Status = planned > 0 && total >= planned ? "done" : "partial";
        slip.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return Ok(new { slip.Status, aaye = total, baki = Math.Max(0, planned - total) });
    }

    [HttpPost("{id}/cancel")]
    [HasPermission("production.jobslip.edit.place")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var firmId = CurrentFirmId;
        var slip = await _db.JobSlips.FirstOrDefaultAsync(s => s.Id == id && s.FirmId == firmId);
        if (slip is null) return NotFound();

        // Jiska maal aana shuru ho gaya use cancel karna galat hai — wo maal
        // stock me chadh chuka hai aur ginti gadbad ho jayegi
        var got = await _db.JobSlipReceipts.AnyAsync(r => r.JobSlipId == id);
        if (got)
            return BadRequest(new { error =
                "Is slip ka maal aana shuru ho chuka hai — ab cancel nahi hoti" });

        slip.Status = "cancelled";
        slip.UpdatedAt = DateTimeOffset.UtcNow;

        // Diya hua material wapas godown me
        if (slip.GodownId is Guid gid)
        {
            var mats = await _db.JobSlipMaterials.Where(m => m.JobSlipId == id).ToListAsync();
            foreach (var m in mats)
                _db.StockLedger.Add(new StockLedgerEntry
                {
                    FirmId = firmId, GodownId = gid, ItemId = m.MaterialId,
                    ItemKind = "material", Colour = m.Colour,
                    QtyIn = m.Qty, RefType = "jobslip", RefId = id,
                    CreatedBy = CurrentUserId
                });
        }
        await _db.SaveChangesAsync();
        return Ok(new { slip.Status });
    }

    // ══════════ madad ══════════

    private async Task<string?> ValidateAsync(Guid firmId, SaveJobSlipDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.JobType)) return "Kaam kaunsa hai — ye chunna zaroori hai";

        var kar = await _db.Karigars.AsNoTracking()
            .FirstOrDefaultAsync(k => k.Id == dto.KarigarId && k.FirmId == firmId);
        if (kar is null)  return "Karigar chuniye";
        if (!kar.IsActive) return $"{kar.Name} band hai — pehle usko chalu kijiye";

        if (dto.Programs is null || dto.Programs.Count == 0)
            return "Kya banana hai — ek bhi design nahi joda";

        foreach (var p in dto.Programs)
        {
            var ok = await _db.Items.AnyAsync(i => i.Id == p.DesignId && i.FirmId == firmId
                                                && i.ItemKind == "design");
            if (!ok) return "Program me koi line design ki nahi hai";
            if (string.IsNullOrWhiteSpace(p.Part)) return "Har design ka hissa chuniye";
        }

        foreach (var m in dto.Materials ?? new())
        {
            if (m.Qty <= 0) return "Har material ki qty bharni zaroori hai";
            var ok = await _db.Items.AnyAsync(i => i.Id == m.MaterialId && i.FirmId == firmId
                                                && i.ItemKind == "material");
            if (!ok) return "Material wali line me design chuna hua hai";

            // Taka likha hai to uska jod qty se milna chahiye — warna challan
            // par kuch aur, ginti me kuch aur
            if (m.Takas is { Length: > 0 })
            {
                var sum = m.Takas.Sum();
                if (Math.Abs(sum - m.Qty) > 0.01m)
                    return $"Taka ka jod {sum} hai par qty {m.Qty} likhi hai — dono barabar hone chahiye";
            }
        }
        return null;
    }

    /// <summary>
    /// ⚠️ Har parent ke baad SaveChanges — jaan-boojh kar.
    ///
    /// In entity par navigation property nahi hai (jaan-boojh kar: raw table
    /// jaisa dhaancha padhna aasaan hai). Uska nateeja ye ki EF ko pata hi
    /// nahi chalta ki program pehle jana chahiye aur uske size baad me — wo
    /// apni marzi se kram lagata hai aur FK toot jati hai
    /// (job_slip_program_sizes_program_id_fkey).
    ///
    /// Sab kuch ek transaction ke andar hai, isliye beech me fail hone par
    /// poora wapas ho jata hai.
    /// </summary>
    private async Task WriteLines(Guid firmId, Guid slipId, SaveJobSlipDto dto)
    {
        foreach (var m in dto.Materials ?? new())
        {
            var line = new JobSlipMaterial
            {
                Id = Guid.NewGuid(), FirmId = firmId, JobSlipId = slipId,
                MaterialId = m.MaterialId, Colour = m.Colour, Qty = m.Qty,
                Unit = string.IsNullOrWhiteSpace(m.Unit) ? "Meter" : m.Unit
            };
            _db.JobSlipMaterials.Add(line);
            await _db.SaveChangesAsync();          // line pehle — taka uspar tikta hai

            if (m.Takas is { Length: > 0 })
            {
                for (var i = 0; i < m.Takas.Length; i++)
                    _db.Takas.Add(new Taka
                    {
                        Id = Guid.NewGuid(), FirmId = firmId,
                        OwnerType = "jobslip_material", OwnerId = line.Id,
                        Seq = i + 1, Meters = m.Takas[i]
                    });
                await _db.SaveChangesAsync();
            }
        }

        foreach (var p in dto.Programs)
        {
            var prog = new JobSlipProgram
            {
                Id = Guid.NewGuid(), FirmId = firmId, JobSlipId = slipId,
                DesignId = p.DesignId, Part = p.Part.Trim(),
                JobRate = p.JobRate,
                RateUnit = string.IsNullOrWhiteSpace(p.RateUnit) ? "Pcs" : p.RateUnit
            };
            _db.JobSlipPrograms.Add(prog);
            await _db.SaveChangesAsync();          // program pehle — ratio/size uspar tikte hain

            foreach (var r in p.Ratios ?? new())
                _db.JobSlipRatios.Add(new JobSlipRatio
                {
                    Id = Guid.NewGuid(), FirmId = firmId, ProgramId = prog.Id,
                    Size = r.Size, Ratio = r.Ratio
                });

            foreach (var s in p.Sizes ?? new())
                _db.JobSlipProgramSizes.Add(new JobSlipProgramSize
                {
                    Id = Guid.NewGuid(), FirmId = firmId, ProgramId = prog.Id,
                    Size = s.Size, Colour = s.Colour, Qty = s.Qty
                });

            await _db.SaveChangesAsync();
        }
    }

    private async Task<int> PlannedPieces(Guid firmId, Guid slipId)
    {
        var progIds = await _db.JobSlipPrograms.Where(p => p.JobSlipId == slipId)
            .Select(p => p.Id).ToListAsync();
        if (progIds.Count == 0) return 0;
        return await _db.JobSlipProgramSizes.Where(s => progIds.Contains(s.ProgramId))
            .SumAsync(s => (int?)s.Qty) ?? 0;
    }

    private async Task<JobSlipDto> Build(Guid firmId, JobSlip s, bool light)
    {
        var karName = await _db.Karigars.AsNoTracking()
            .Where(k => k.Id == s.KarigarId).Select(k => k.Name).FirstOrDefaultAsync() ?? "—";

        var progs = await _db.JobSlipPrograms.AsNoTracking()
            .Where(p => p.JobSlipId == s.Id).ToListAsync();
        var progIds = progs.Select(p => p.Id).ToList();

        var sizes = await _db.JobSlipProgramSizes.AsNoTracking()
            .Where(x => progIds.Contains(x.ProgramId)).ToListAsync();
        var ratios = await _db.JobSlipRatios.AsNoTracking()
            .Where(x => progIds.Contains(x.ProgramId)).ToListAsync();

        var receipts = await _db.JobSlipReceipts.AsNoTracking()
            .Where(r => r.JobSlipId == s.Id).OrderBy(r => r.ReceivedAt).ToListAsync();

        var designNames = await _db.Items.AsNoTracking()
            .Where(i => progs.Select(p => p.DesignId).Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Name);

        var programDtos = progs.Select(p =>
        {
            var mySizes = sizes.Where(x => x.ProgramId == p.Id).ToList();
            var total = mySizes.Sum(x => x.Qty);
            var myRatios = ratios.Where(x => x.ProgramId == p.Id).ToList();
            var ratioSum = myRatios.Sum(x => x.Ratio);

            return new JsProgramDto(
                p.Id, p.DesignId, designNames.GetValueOrDefault(p.DesignId, "—"),
                p.Part, p.JobRate, p.RateUnit,
                myRatios.Select(r => new JsRatioDto(r.Id, r.Size, r.Ratio,
                    // Ratio se batwara — 160 piece, 1:1:2 → 40/40/80
                    ratioSum > 0 ? (int)Math.Round((double)total * r.Ratio / ratioSum) : 0)).ToList(),
                mySizes.Select(x => new JsSizeDto(x.Id, x.Size, x.Colour, x.Qty)).ToList(),
                total);
        }).ToList();

        var materials = new List<JsMaterialDto>();
        if (!light)
        {
            var mats = await _db.JobSlipMaterials.AsNoTracking()
                .Where(m => m.JobSlipId == s.Id).ToListAsync();
            var matIds = mats.Select(m => m.Id).ToList();
            var takas = await _db.Takas.AsNoTracking()
                .Where(t => t.OwnerType == "jobslip_material" && matIds.Contains(t.OwnerId))
                .OrderBy(t => t.Seq).ToListAsync();
            var matNames = await _db.Items.AsNoTracking()
                .Where(i => mats.Select(m => m.MaterialId).Contains(i.Id))
                .ToDictionaryAsync(i => i.Id, i => i.Name);

            materials = mats.Select(m => new JsMaterialDto(
                m.Id, m.MaterialId, matNames.GetValueOrDefault(m.MaterialId, "—"),
                m.Colour, m.Qty, m.Unit,
                takas.Where(t => t.OwnerId == m.Id).Select(t => t.Meters).ToArray())).ToList();
        }

        var banane = programDtos.Sum(p => p.TotalPieces);
        var aaye   = receipts.Sum(r => r.Qty);
        var kharab = receipts.Sum(r => r.RejectedQty);

        // Majoori sirf SAHI maal par — kharab nikle piece par nahi
        var majoori = receipts.Sum(r =>
            r.Qty * (progs.FirstOrDefault(p => p.DesignId == r.DesignId)?.JobRate ?? 0m));

        return new JobSlipDto(
            s.Id, s.SlipNo, s.LotNo, s.KarigarId, karName, s.JobType,
            s.GodownId, s.SalesOrderId, s.IssuedAt, s.DueAt, s.Status, s.Note,
            materials, programDtos,
            receipts.Select(r => new JsReceiptDto(r.Id, r.ReceivedAt, r.DesignId,
                r.Size, r.Colour, r.Qty, r.RejectedQty, r.Note)).ToList(),
            banane, aaye, kharab, Math.Max(0, banane - aaye), majoori);
    }
}
