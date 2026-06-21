using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

// Agent ka apna login view — sirf [Authorize] (koi platform permission nahi).
// agent_id claim se hi pehchaan; na ho to 403.
[ApiController]
[Route("api/agent")]
[Authorize]
public class AgentSelfController : ControllerBase
{
    private readonly IAgentService _svc;

    public AgentSelfController(IAgentService svc) => _svc = svc;

    private Guid? CurrentAgentId
    {
        get
        {
            var v = User.FindFirst("agent_id")?.Value;
            return Guid.TryParse(v, out var g) ? g : null;
        }
    }

    [HttpGet("me/dashboard")]
    public async Task<IActionResult> Dashboard()
    {
        var agentId = CurrentAgentId;
        if (agentId is null) return Forbid();
        var d = await _svc.GetDashboardForAgentAsync(agentId.Value);
        return d is null ? NotFound() : Ok(d);
    }

    [HttpGet("me/commissions")]
    public async Task<IActionResult> Commissions([FromQuery] int limit = 100)
    {
        var agentId = CurrentAgentId;
        if (agentId is null) return Forbid();
        return Ok(await _svc.GetCommissionsForAgentAsync(agentId.Value, limit));
    }
}
