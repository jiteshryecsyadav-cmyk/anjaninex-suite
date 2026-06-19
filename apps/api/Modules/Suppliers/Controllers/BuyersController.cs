using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Suppliers.Services;

namespace Namokara.Api.Modules.Suppliers.Controllers;

[ApiController]
[Authorize]
[ModuleAccess("active_directory")]
[Route("api/buyers")]
public class BuyersController : ControllerBase
{
    private readonly IBuyerService _svc;
    public BuyersController(IBuyerService svc) => _svc = svc;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    [HttpGet]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search)
        => Ok(await _svc.List(search));

    [HttpGet("{id}")]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var b = await _svc.Get(id);
        return b is null ? NotFound() : Ok(b);
    }

    [HttpPost]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Create([FromBody] CreateBuyerDto dto)
    {
        try { return Ok(await _svc.Create(dto, CurrentFirmId, CurrentUserId)); }
        catch (Exception ex)
        {
            var root = ex; while (root.InnerException != null) root = root.InnerException;
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(root) });
        }
    }

    [HttpPut("{id}")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateBuyerDto dto)
    {
        try { return Ok(await _svc.Update(id, dto)); }
        catch (Exception ex)
        {
            var root = ex; while (root.InnerException != null) root = root.InnerException;
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(root) });
        }
    }

    [HttpDelete("{id}")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }

    // Live duplicate-check — buyer form GST/mobile par debounced call.
    [HttpPost("check-duplicate")]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> CheckDuplicate([FromBody] BuyerCheckDuplicateDto dto)
        => Ok(await _svc.CheckDuplicate(CurrentFirmId, dto.Gst, dto.Phone, dto.ExcludeId));
}

public record BuyerCheckDuplicateDto(string? Gst, string? Phone, Guid? ExcludeId);
