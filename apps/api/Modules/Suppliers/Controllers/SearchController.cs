using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Suppliers.Services;

namespace Namokara.Api.Modules.Suppliers.Controllers;

[ApiController]
[Authorize]
[ModuleAccess("active_directory")]
[Route("api/ad-search")]
public class SearchController : ControllerBase
{
    private readonly ISearchService _svc;
    public SearchController(ISearchService svc) => _svc = svc;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    [HttpGet]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] string? type)
        => Ok(await _svc.Search(q ?? "", type, CurrentFirmId));
}
