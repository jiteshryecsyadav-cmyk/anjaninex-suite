using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Suppliers.Services;

namespace Namokara.Api.Modules.Suppliers.Controllers;

[ApiController]
[Authorize]
[ModuleAccess("active_directory")]
[Route("api/appointments")]
public class AppointmentsController : ControllerBase
{
    private readonly IAppointmentService _svc;
    public AppointmentsController(IAppointmentService svc) => _svc = svc;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    [HttpGet]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to)
        => Ok(await _svc.List(status, from, to));

    [HttpGet("{id}")]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var a = await _svc.Get(id);
        return a is null ? NotFound() : Ok(a);
    }

    [HttpPost]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Create([FromBody] CreateAppointmentDto dto)
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
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateAppointmentDto dto)
    {
        try { return Ok(await _svc.Update(id, dto, CurrentFirmId)); }
        catch (Exception ex)
        {
            var root = ex; while (root.InnerException != null) root = root.InnerException;
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(root) });
        }
    }

    [HttpPatch("{id}/status")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] StatusDto dto)
    {
        await _svc.UpdateStatus(id, dto.Status);
        return NoContent();
    }

    [HttpDelete("{id}")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }

    // ---- form lookups ----
    [HttpGet("options/suppliers")]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> SupplierOptions() => Ok(await _svc.SupplierOptions(CurrentFirmId));

    [HttpGet("options/buyers")]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> BuyerOptions() => Ok(await _svc.BuyerOptions(CurrentFirmId));

    // Branch-filtered staff — pass branchId to get only that branch's staff.
    [HttpGet("options/staff")]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> StaffOptions([FromQuery] Guid? branchId)
        => Ok(await _svc.StaffOptions(CurrentFirmId, branchId));
}

public record StatusDto(string Status);
