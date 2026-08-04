using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Trading.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

/// <summary>
/// Customers aur Suppliers — manufacturer app ke liye.
///
/// JAAN-BOOJH KAR nayi party table nahi banayi. `trading.party_profiles` +
/// `core.contacts` pehle se hain aur wahi agency app bhi use karti hai.
/// Alag list banate to:
///   · "dono" wali firm ko ek hi party do baar bharni padti
///   · Credil (jo GST par network score banati hai) me manufacturer ki party
///     dikhti hi nahi — aur wahi is poore platform ka sabse bada faayda hai
///
/// Isliye yahan sirf ek patla khol hai: wahi PartyService, par manufacturer
/// ki apni permission (`masters.customer.*` / `masters.supplier.*`) ke saath.
/// Ek hi list ke do darwaze — customer wala aur supplier wala.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/parties")]
[ModuleAccess("manufacturer")]
public class PartiesController : ControllerBase
{
    private readonly IPartyService _parties;
    public PartiesController(IPartyService parties) => _parties = parties;

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("user_id")?.Value!);

    /// <param name="kind">
    /// "customer" = jise hum bechte hain · "supplier" = jisse hum khareedte hain.
    /// Khali chhod do to dono. party_type me 'both' bhi hota hai — wo dono me aata hai.
    /// </param>
    [HttpGet]
    [HasPermission("masters.customer.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] string? kind)
    {
        var all = await _parties.List(search);
        return Ok(Filter(all, kind));
    }

    [HttpGet("{id}")]
    [HasPermission("masters.customer.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var p = await _parties.Get(id);
        return p is null ? NotFound() : Ok(p);
    }

    [HttpPost]
    [HasPermission("masters.customer.create.firm")]
    public async Task<IActionResult> Create([FromBody] CreatePartyDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });
        return Ok(await _parties.Create(dto, CurrentFirmId, CurrentUserId));
    }

    [HttpPut("{id}")]
    [HasPermission("masters.customer.edit.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreatePartyDto dto)
    {
        var err = Validate(dto);
        if (err is not null) return BadRequest(new { error = err });
        return Ok(await _parties.Update(id, dto));
    }

    // ── madad ──

    /// <summary>
    /// party_type me 'customer' / 'supplier' / 'both' hota hai. 'both' wali
    /// party dono list me aani chahiye — ek hi firm se kapda bhi lete hain aur
    /// usi ko maal bhi bechte hain, ye aam baat hai.
    /// </summary>
    private static IEnumerable<PartyDto> Filter(IEnumerable<PartyDto> all, string? kind)
    {
        if (string.IsNullOrWhiteSpace(kind)) return all;
        var k = kind.Trim().ToLowerInvariant();
        return all.Where(p =>
        {
            var t = (p.PartyType ?? "").ToLowerInvariant();
            return t == k || t == "both";
        });
    }

    private static string? Validate(CreatePartyDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.DisplayName))
            return "Party ka naam zaroori hai";

        // GST hai to poora 15 ank ka ho — aadha GST bill par chhap kar
        // customer ke ITC me atak jata hai aur wo phone karta hai
        var gst = (dto.Gst ?? "").Trim();
        if (gst.Length > 0 && gst.Length != 15)
            return "GST number 15 ank ka hota hai — poora daaliye ya khali chhod dijiye";

        return null;
    }
}
