using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

public record GodownDto(
    Guid Id, string Name, string Mobile,
    string? State, string? City, string? Address, string? Pincode,
    string? PhotoUrl, bool IsMain, bool IsActive);

public record SaveGodownDto(
    string Name, string Mobile,
    string? State, string? City, string? Address, string? Pincode,
    string? PhotoUrl, bool IsMain = false, bool IsActive = true);

/// <summary>
/// Jagah (godown / office). Iske bina stock ka koi matlab nahi — "Surat wale
/// godown me kitna maal hai" ka jawab tabhi milta hai.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/godowns")]
[ModuleAccess("manufacturer")]
public class GodownsController : ControllerBase
{
    private readonly AppDbContext _db;
    public GodownsController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);

    [HttpGet]
    [HasPermission("masters.office.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search,
                                          [FromQuery] bool includeInactive = false)
    {
        var firmId = CurrentFirmId;
        var q = _db.Godowns.AsNoTracking().Where(g => g.FirmId == firmId);
        if (!includeInactive) q = q.Where(g => g.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(g => g.Name.ToLower().Contains(s)
                          || (g.City != null && g.City.ToLower().Contains(s))
                          || g.Mobile.Contains(s));
        }

        // MAIN sabse upar — usi par sabse zyada kaam hota hai
        var rows = await q.OrderByDescending(g => g.IsMain).ThenBy(g => g.Name)
            .Select(g => new GodownDto(g.Id, g.Name, g.Mobile, g.State, g.City,
                g.Address, g.Pincode, g.PhotoUrl, g.IsMain, g.IsActive))
            .ToListAsync();

        return Ok(rows);
    }

    [HttpPost]
    [HasPermission("masters.office.create.firm")]
    public async Task<IActionResult> Create([FromBody] SaveGodownDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });

        var firmId = CurrentFirmId;
        var name = dto.Name.Trim();

        // Ek naam ki do jagah ban gayi to stock kis me hai — kabhi pata nahi chalega
        if (await _db.Godowns.AnyAsync(g => g.FirmId == firmId && g.Name.ToLower() == name.ToLower()))
            return BadRequest(new { error = "Is naam ki jagah pehle se hai — doosra naam rakhiye" });

        // MAIN sirf EK. DB par bhi partial unique index hai; yahan pehle hata
        // dete hain taaki user ko 23505 ki jagah kaam hota hua dikhe.
        if (dto.IsMain) await ClearMain(firmId);

        var g = new Godown
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            Name = Namokara.Api.Common.Text.NameCase.TitleCase(name),
            Mobile = OnlyDigits(dto.Mobile),
            State = dto.State, City = dto.City, Address = dto.Address, Pincode = dto.Pincode,
            PhotoUrl = dto.PhotoUrl,
            // Pehli jagah apne aap MAIN — warna firm banate hi har entry me
            // "jagah chuniye" poochta rehta aur koi default hi nahi hota
            IsMain = dto.IsMain || !await _db.Godowns.AnyAsync(x => x.FirmId == firmId),
            IsActive = dto.IsActive
        };
        _db.Godowns.Add(g);
        await _db.SaveChangesAsync();
        return Ok(new { g.Id });
    }

    [HttpPut("{id}")]
    [HasPermission("masters.office.edit.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SaveGodownDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });

        var firmId = CurrentFirmId;
        var g = await _db.Godowns.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (g is null) return NotFound();

        var name = dto.Name.Trim();
        if (await _db.Godowns.AnyAsync(x => x.FirmId == firmId
                                         && x.Name.ToLower() == name.ToLower() && x.Id != id))
            return BadRequest(new { error = "Is naam ki doosri jagah pehle se hai" });

        // Akhri MAIN ka tick hata rahe hain — phir default kaunsa hoga?
        if (g.IsMain && !dto.IsMain)
            return BadRequest(new { error =
                "MAIN ka tick seedha nahi hatta — doosri jagah ko MAIN banaiye, ye apne aap hat jayegi" });

        if (dto.IsMain && !g.IsMain) await ClearMain(firmId);

        g.Name = Namokara.Api.Common.Text.NameCase.TitleCase(name);
        g.Mobile = OnlyDigits(dto.Mobile);
        g.State = dto.State; g.City = dto.City; g.Address = dto.Address; g.Pincode = dto.Pincode;
        g.PhotoUrl = dto.PhotoUrl;
        g.IsMain = dto.IsMain;
        g.IsActive = dto.IsActive;
        g.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { g.Id });
    }

    [HttpPost("{id}/toggle")]
    [HasPermission("masters.office.edit.firm")]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var firmId = CurrentFirmId;
        var g = await _db.Godowns.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (g is null) return NotFound();

        // MAIN jagah band ho gayi to nayi entry ka default gayab
        if (g.IsActive && g.IsMain)
            return BadRequest(new { error =
                "MAIN jagah band nahi hoti — pehle doosri jagah ko MAIN banaiye" });

        // Jis godown me maal pada hai use band karna ganda hai — wo stock
        // kisi list me nahi dikhega aur ginti hamesha ke liye galat ho jayegi
        if (g.IsActive)
        {
            var onHand = await _db.StockLedger
                .Where(s => s.FirmId == firmId && s.GodownId == id)
                .SumAsync(s => (decimal?)(s.QtyIn - s.QtyOut)) ?? 0m;
            if (onHand > 0)
                return BadRequest(new { error =
                    $"Is jagah par abhi {onHand:0.##} maal pada hai — pehle doosri jagah bhejiye" });
        }

        g.IsActive = !g.IsActive;
        g.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { g.Id, g.IsActive });
    }

    // ── madad ──
    private async Task ClearMain(Guid firmId)
    {
        var old = await _db.Godowns.Where(x => x.FirmId == firmId && x.IsMain).ToListAsync();
        foreach (var o in old) o.IsMain = false;
        if (old.Count > 0) await _db.SaveChangesAsync();
    }

    private static string OnlyDigits(string s) => new(s.Where(char.IsDigit).ToArray());

    private static string? Validate(SaveGodownDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))  return "Jagah ka naam zaroori hai";
        if (OnlyDigits(dto.Mobile).Length != 10)  return "10 ank ka mobile number daaliye";
        return null;
    }
}
