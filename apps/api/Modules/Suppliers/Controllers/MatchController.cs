using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Suppliers.Services;

namespace Namokara.Api.Modules.Suppliers.Controllers;

[ApiController]
[Authorize]
[ModuleAccess("active_directory")]
[Route("api/match")]
public class MatchController : ControllerBase
{
    private readonly IMatchService _svc;
    public MatchController(IMatchService svc) => _svc = svc;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    [HttpPost]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> Match([FromBody] MatchRequestDto req)
        => Ok(await _svc.Match(req, CurrentFirmId));
}
