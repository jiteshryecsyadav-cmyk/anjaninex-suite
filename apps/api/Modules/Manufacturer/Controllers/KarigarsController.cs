using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

public record KarigarDto(
    Guid Id, string Name, string? FirmName, string Mobile, string JobType,
    Guid? AgentId, string? AgentName,
    string? State, string? City, string? Address, string? Pincode,
    string? Gstin, string? GstType, string? Pan, string? PhotoUrl,
    bool IsActive,
    decimal MajooriBaki);

public record SaveKarigarDto(
    string Name, string? FirmName, string Mobile, string JobType,
    Guid? AgentId,
    string? State, string? City, string? Address, string? Pincode,
    string? Gstin, string? GstType, string? Pan, string? PhotoUrl,
    bool IsActive = true);

[Authorize]
[ApiController]
[Route("api/mfg/karigars")]
[ModuleAccess("manufacturer")]
public class KarigarsController : ControllerBase
{
    private readonly AppDbContext _db;
    public KarigarsController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);

    /// <summary>
    /// Karigar ki list. Har naam ke saath "kitni majoori baki hai" bhi —
    /// yahi sabse zyada poocha jane wala sawal hai, aur uske liye alag screen
    /// kholna padta tha.
    /// </summary>
    [HttpGet]
    [HasPermission("masters.karigar.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search,
                                          [FromQuery] bool includeInactive = false)
    {
        var firmId = CurrentFirmId;

        var q = _db.Karigars.AsNoTracking().Where(k => k.FirmId == firmId);
        if (!includeInactive) q = q.Where(k => k.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(k => k.Name.ToLower().Contains(s)
                          || k.Mobile.Contains(s)
                          || (k.FirmName != null && k.FirmName.ToLower().Contains(s)));
        }

        // Majoori baki — view se (db/init/118). Ek hi query me jodte hain,
        // warna 50 karigar par 50 alag query chalti.
        //
        // ⚠️ Column ke naam snake_case me hi rakhne hain. DbContext par
        // snake_case naming convention lagi hai, isliye EF `KarigarId` property
        // ke liye `karigar_id` column dhoondhta hai — PascalCase alias dene par
        // "required column 'karigar_id' was not present" aata hai.
        var pending = await _db.Database.SqlQueryRaw<KarigarDue>(
                @"SELECT karigar_id,
                         COALESCE(SUM(majoori_bani), 0)::numeric AS majoori
                    FROM mfg.v_karigar_pending
                   GROUP BY karigar_id")
            .ToListAsync();
        var dueMap = pending.ToDictionary(x => x.KarigarId, x => x.Majoori);

        var agents = await _db.MfgAgents.AsNoTracking()
            .Where(a => a.FirmId == firmId)
            .Select(a => new { a.Id, a.Name })
            .ToListAsync();
        var agentMap = agents.ToDictionary(a => a.Id, a => a.Name);

        var rows = await q.OrderBy(k => k.Name).ToListAsync();

        return Ok(rows.Select(k => new KarigarDto(
            k.Id, k.Name, k.FirmName, k.Mobile, k.JobType,
            k.AgentId, k.AgentId is Guid ag && agentMap.TryGetValue(ag, out var an) ? an : null,
            k.State, k.City, k.Address, k.Pincode,
            k.Gstin, k.GstType, k.Pan, k.PhotoUrl, k.IsActive,
            dueMap.TryGetValue(k.Id, out var d) ? d : 0m)));
    }

    private sealed record KarigarDue(Guid KarigarId, decimal Majoori);

    [HttpGet("{id}")]
    [HasPermission("masters.karigar.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var k = await _db.Karigars.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        return k is null ? NotFound() : Ok(k);
    }

    [HttpPost]
    [HasPermission("masters.karigar.create.firm")]
    public async Task<IActionResult> Create([FromBody] SaveKarigarDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });

        var firmId = CurrentFirmId;
        var mobile = OnlyDigits(dto.Mobile);

        // Ek mobile par ek hi karigar. DB par bhi unique index hai — ye check
        // sirf isliye ki user ko saaf Hinglish message mile, 23505 nahi.
        if (await _db.Karigars.AnyAsync(k => k.FirmId == firmId && k.Mobile == mobile))
            return BadRequest(new { error = "Is mobile par pehle se karigar hai — dobara mat jodein" });

        if (dto.AgentId is Guid agId && !await IsKarigarAgent(firmId, agId))
            return BadRequest(new { error = "Ye agent karigar wala nahi hai — Masters → Agents me tick lagaiye" });

        var k = new Karigar
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            Name = Namokara.Api.Common.Text.NameCase.TitleCase(dto.Name.Trim()),
            FirmName = string.IsNullOrWhiteSpace(dto.FirmName) ? null
                     : Namokara.Api.Common.Text.NameCase.TitleCase(dto.FirmName.Trim()),
            Mobile = mobile,
            JobType = dto.JobType.Trim(),
            AgentId = dto.AgentId,
            State = dto.State, City = dto.City, Address = dto.Address, Pincode = dto.Pincode,
            Gstin = dto.Gstin?.Trim().ToUpper(), GstType = dto.GstType,
            Pan = dto.Pan?.Trim().ToUpper(), PhotoUrl = dto.PhotoUrl,
            IsActive = dto.IsActive
        };
        _db.Karigars.Add(k);
        await _db.SaveChangesAsync();
        return Ok(new { k.Id });
    }

    [HttpPut("{id}")]
    [HasPermission("masters.karigar.edit.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SaveKarigarDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });

        var firmId = CurrentFirmId;
        var k = await _db.Karigars.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (k is null) return NotFound();

        var mobile = OnlyDigits(dto.Mobile);
        if (await _db.Karigars.AnyAsync(x => x.FirmId == firmId && x.Mobile == mobile && x.Id != id))
            return BadRequest(new { error = "Is mobile par doosra karigar pehle se hai" });

        if (dto.AgentId is Guid agId && !await IsKarigarAgent(firmId, agId))
            return BadRequest(new { error = "Ye agent karigar wala nahi hai — Masters → Agents me tick lagaiye" });

        k.Name = Namokara.Api.Common.Text.NameCase.TitleCase(dto.Name.Trim());
        k.FirmName = string.IsNullOrWhiteSpace(dto.FirmName) ? null
                   : Namokara.Api.Common.Text.NameCase.TitleCase(dto.FirmName.Trim());
        k.Mobile = mobile;
        k.JobType = dto.JobType.Trim();
        k.AgentId = dto.AgentId;
        k.State = dto.State; k.City = dto.City; k.Address = dto.Address; k.Pincode = dto.Pincode;
        k.Gstin = dto.Gstin?.Trim().ToUpper(); k.GstType = dto.GstType;
        k.Pan = dto.Pan?.Trim().ToUpper(); k.PhotoUrl = dto.PhotoUrl;
        k.IsActive = dto.IsActive;
        k.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { k.Id });
    }

    /// <summary>
    /// Karigar ko BAND karo — mitao nahi. Uske banaye job slip aur majoori ka
    /// hisab salaamat rehna chahiye. Isliye delete endpoint hai hi nahi.
    /// </summary>
    [HttpPost("{id}/toggle")]
    [HasPermission("masters.karigar.edit.firm")]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var firmId = CurrentFirmId;
        var k = await _db.Karigars.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (k is null) return NotFound();

        // Jiska maal abhi bahar hai usko band nahi kar sakte — warna wo slip
        // kisi list me nahi dikhegi aur maal hamesha ke liye atak jayega
        if (k.IsActive)
        {
            var openSlips = await _db.JobSlips.CountAsync(s =>
                s.FirmId == firmId && s.KarigarId == id &&
                (s.Status == "open" || s.Status == "partial"));
            if (openSlips > 0)
                return BadRequest(new { error =
                    $"Iske paas {openSlips} job slip abhi chal rahi hai — pehle maal wapas lijiye" });
        }

        k.IsActive = !k.IsActive;
        k.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { k.Id, k.IsActive });
    }

    // ── madad ──

    private static string OnlyDigits(string s) => new(s.Where(char.IsDigit).ToArray());

    private static string? Validate(SaveKarigarDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))    return "Karigar ka naam zaroori hai";
        if (OnlyDigits(dto.Mobile).Length != 10)    return "10 ank ka mobile number daaliye";
        if (string.IsNullOrWhiteSpace(dto.JobType)) return "Kaam kaunsa karta hai — ye chunna zaroori hai";
        return null;
    }

    /// <summary>
    /// Karigar par sirf karigar-wala agent hi lag sakta hai. Dono tarah ke
    /// agent ek list me mila diye jaate the aur galat aadmi par commission
    /// chadh jata tha — isliye yahan rok.
    /// </summary>
    private Task<bool> IsKarigarAgent(Guid firmId, Guid agentId) =>
        _db.MfgAgents.AnyAsync(a => a.Id == agentId && a.FirmId == firmId && a.IsKarigarAgent);
}
