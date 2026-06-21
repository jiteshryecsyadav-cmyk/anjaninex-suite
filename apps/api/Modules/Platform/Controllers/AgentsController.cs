using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Common.Errors;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

// Reseller / agent management — super-admin (platform) only.
// Same permissions jo firm management use karta hai (platform.firm.view/edit.platform).
[ApiController]
[Route("api/admin/agents")]
[Authorize]
public class AgentsController : ControllerBase
{
    private readonly IAgentService _svc;

    public AgentsController(IAgentService svc) => _svc = svc;

    private Guid CurrentUserId => Guid.Parse(User.FindFirst("user_id")?.Value!);

    [HttpGet]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> List() => Ok(await _svc.ListAsync());

    // Firm-create validation helper: code → {id,name,status} (ya 404).
    // NOTE: route order — "resolve" se pehle declare taaki "{id}" se na takraye.
    [HttpGet("resolve")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Resolve([FromQuery] string code)
    {
        var a = await _svc.ResolveCodeAsync(code ?? "");
        return a is null ? NotFound(new { error = "Invalid agent code" }) : Ok(a);
    }

    [HttpGet("{id}")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Get(Guid id)
    {
        var a = await _svc.GetAsync(id);
        return a is null ? NotFound() : Ok(a);
    }

    [HttpPost]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Create([FromBody] CreateAgentDto dto)
    {
        try { return Ok(await _svc.CreateAsync(dto)); }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex) { return BadRequest(new { error = FriendlyError.From(ex) }); }
    }

    [HttpPut("{id}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAgentDto dto)
    {
        try
        {
            var ok = await _svc.UpdateAsync(id, dto);
            return ok ? Ok(new { ok = true }) : NotFound();
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex) { return BadRequest(new { error = FriendlyError.From(ex) }); }
    }

    [HttpPost("{id}/payout")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Payout(Guid id, [FromBody] AgentPayoutRequest dto)
    {
        try
        {
            var ok = await _svc.PayoutAsync(id, dto.Amount, dto.Method, dto.Reference, dto.Notes, CurrentUserId);
            return ok ? Ok(new { ok = true }) : NotFound();
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex) { return BadRequest(new { error = FriendlyError.From(ex) }); }
    }
}

public record AgentPayoutRequest(decimal Amount, string? Method, string? Reference, string? Notes);
