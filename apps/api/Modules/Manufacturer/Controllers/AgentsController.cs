using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

public record AgentDto(
    Guid Id, string Name, string? AgencyName, string Mobile,
    bool IsKarigarAgent,
    string? State, string? City, string? Address, string? Pincode,
    string? Gstin, string? GstType, string? Pan, string? PhotoUrl,
    string Visibility, bool IsActive,
    /// <summary>Iske through kitne karigar aaye — hatane se pehle dikhana zaroori.</summary>
    int KarigarCount);

public record SaveAgentDto(
    string Name, string? AgencyName, string Mobile,
    bool IsKarigarAgent,
    string? State, string? City, string? Address, string? Pincode,
    string? Gstin, string? GstType, string? Pan, string? PhotoUrl,
    string Visibility = "all", bool IsActive = true);

/// <summary>
/// Agent do bilkul alag tarah ke hote hain aur log inhe ek hi list me mila
/// dete the — isliye job slip par galat aadmi ka commission chadh jata tha.
/// <c>IsKarigarAgent</c> hi tay karta hai ki naam kis khaane me dikhega.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/agents")]
[ModuleAccess("manufacturer")]
public class AgentsController : ControllerBase
{
    private readonly AppDbContext _db;
    public AgentsController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);

    /// <param name="kind">
    /// khali = sab · "karigar" = sirf karigar wale · "grahak" = sirf grahak wale.
    /// Doosri screen (jaise Karigar ka form) sirf apni tarah ke agent maangti hai.
    /// </param>
    [HttpGet]
    [HasPermission("masters.agent.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search,
                                          [FromQuery] string? kind,
                                          [FromQuery] bool includeInactive = false)
    {
        var firmId = CurrentFirmId;
        var q = _db.MfgAgents.AsNoTracking().Where(a => a.FirmId == firmId);

        if (!includeInactive) q = q.Where(a => a.IsActive);
        if (kind == "karigar")  q = q.Where(a => a.IsKarigarAgent);
        if (kind == "grahak")   q = q.Where(a => !a.IsKarigarAgent);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            q = q.Where(a => a.Name.ToLower().Contains(s)
                          || a.Mobile.Contains(s)
                          || (a.AgencyName != null && a.AgencyName.ToLower().Contains(s)));
        }

        var rows = await q.OrderBy(a => a.Name).ToListAsync();

        // Kis agent ke saath kitne karigar jude hain — ek hi query me
        var counts = await _db.Karigars.AsNoTracking()
            .Where(k => k.FirmId == firmId && k.AgentId != null)
            .GroupBy(k => k.AgentId!.Value)
            .Select(g => new { AgentId = g.Key, N = g.Count() })
            .ToDictionaryAsync(x => x.AgentId, x => x.N);

        return Ok(rows.Select(a => new AgentDto(
            a.Id, a.Name, a.AgencyName, a.Mobile, a.IsKarigarAgent,
            a.State, a.City, a.Address, a.Pincode,
            a.Gstin, a.GstType, a.Pan, a.PhotoUrl,
            a.Visibility, a.IsActive,
            counts.TryGetValue(a.Id, out var n) ? n : 0)));
    }

    [HttpPost]
    [HasPermission("masters.agent.create.firm")]
    public async Task<IActionResult> Create([FromBody] SaveAgentDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });

        var firmId = CurrentFirmId;
        var mobile = OnlyDigits(dto.Mobile);

        if (await _db.MfgAgents.AnyAsync(a => a.FirmId == firmId && a.Mobile == mobile))
            return BadRequest(new { error = "Is mobile par pehle se agent hai — dobara mat jodein" });

        var a = new MfgAgent
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            Name = Namokara.Api.Common.Text.NameCase.TitleCase(dto.Name.Trim()),
            AgencyName = Blank(dto.AgencyName) ? null
                       : Namokara.Api.Common.Text.NameCase.TitleCase(dto.AgencyName!.Trim()),
            Mobile = mobile,
            IsKarigarAgent = dto.IsKarigarAgent,
            State = dto.State, City = dto.City, Address = dto.Address, Pincode = dto.Pincode,
            Gstin = dto.Gstin?.Trim().ToUpper(), GstType = dto.GstType,
            Pan = dto.Pan?.Trim().ToUpper(), PhotoUrl = dto.PhotoUrl,
            Visibility = dto.Visibility, IsActive = dto.IsActive
        };
        _db.MfgAgents.Add(a);
        await _db.SaveChangesAsync();
        return Ok(new { a.Id });
    }

    [HttpPut("{id}")]
    [HasPermission("masters.agent.edit.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SaveAgentDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });

        var firmId = CurrentFirmId;
        var a = await _db.MfgAgents.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (a is null) return NotFound();

        var mobile = OnlyDigits(dto.Mobile);
        if (await _db.MfgAgents.AnyAsync(x => x.FirmId == firmId && x.Mobile == mobile && x.Id != id))
            return BadRequest(new { error = "Is mobile par doosra agent pehle se hai" });

        // Karigar-wale se grahak-wale me badal rahe hain, par iske saath karigar
        // jude hue hain — badalte hi wo karigar ke form se gayab ho jayenge aur
        // unka commission kahin nahi dikhega. Isliye pehle rok.
        if (a.IsKarigarAgent && !dto.IsKarigarAgent)
        {
            var n = await _db.Karigars.CountAsync(k => k.FirmId == firmId && k.AgentId == id);
            if (n > 0)
                return BadRequest(new { error =
                    $"Iske saath {n} karigar jude hain — pehle unka agent badliye, phir ye tick hataiye" });
        }

        a.Name = Namokara.Api.Common.Text.NameCase.TitleCase(dto.Name.Trim());
        a.AgencyName = Blank(dto.AgencyName) ? null
                     : Namokara.Api.Common.Text.NameCase.TitleCase(dto.AgencyName!.Trim());
        a.Mobile = mobile;
        a.IsKarigarAgent = dto.IsKarigarAgent;
        a.State = dto.State; a.City = dto.City; a.Address = dto.Address; a.Pincode = dto.Pincode;
        a.Gstin = dto.Gstin?.Trim().ToUpper(); a.GstType = dto.GstType;
        a.Pan = dto.Pan?.Trim().ToUpper(); a.PhotoUrl = dto.PhotoUrl;
        a.Visibility = dto.Visibility; a.IsActive = dto.IsActive;
        a.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { a.Id });
    }

    /// <summary>Band karo — mitao nahi. Purane job slip me uska naam bana rahe.</summary>
    [HttpPost("{id}/toggle")]
    [HasPermission("masters.agent.edit.firm")]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var firmId = CurrentFirmId;
        var a = await _db.MfgAgents.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (a is null) return NotFound();

        a.IsActive = !a.IsActive;
        a.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { a.Id, a.IsActive });
    }

    // ── madad ──
    private static bool Blank(string? s) => string.IsNullOrWhiteSpace(s);
    private static string OnlyDigits(string s) => new(s.Where(char.IsDigit).ToArray());

    private static string? Validate(SaveAgentDto dto)
    {
        if (Blank(dto.Name))                     return "Agent ka naam zaroori hai";
        if (OnlyDigits(dto.Mobile).Length != 10) return "10 ank ka mobile number daaliye";
        return null;
    }
}
