using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Suppliers.Services;

namespace Namokara.Api.Modules.Suppliers.Controllers;

[Authorize]
[ModuleAccess("active_directory")]   // 🔒 Backend gate
public abstract class SuppliersControllerBase : ControllerBase
{
    protected Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    protected Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);
}

[ApiController]
[Route("api/suppliers")]
public class SuppliersController : SuppliersControllerBase
{
    private readonly ISupplierService _svc;
    public SuppliersController(ISupplierService svc) => _svc = svc;

    // -----------------------------------------------------------------------
    // Suppliers CRUD
    // -----------------------------------------------------------------------
    [HttpGet]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] Guid? categoryId)
        => Ok(await _svc.List(search, categoryId));

    [HttpGet("{id}")]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var s = await _svc.Get(id);
        return s is null ? NotFound() : Ok(s);
    }

    [HttpPost]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Create([FromBody] CreateSupplierDto dto)
        => Ok(await _svc.Create(dto, CurrentFirmId, CurrentUserId));

    // Phase 3 — list Core Master contacts (e.g. Trading parties) not yet in directory.
    [HttpGet("linkable")]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> Linkable([FromQuery] string? search)
        => Ok(await _svc.ListLinkableContacts(CurrentFirmId, search));

    // Phase 3 — add an existing contact to the directory (one click, no re-typing).
    [HttpPost("from-contact/{contactId}")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> AddFromContact(Guid contactId)
        => Ok(await _svc.AddFromContact(contactId, CurrentFirmId, CurrentUserId));

    [HttpPut("{id}")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateSupplierDto dto)
        => Ok(await _svc.Update(id, dto));

    [HttpDelete("{id}")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }

    // -----------------------------------------------------------------------
    // Photos
    // -----------------------------------------------------------------------
    [HttpPost("{id}/photos")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> AddPhoto(Guid id, [FromBody] AddPhotoDto dto)
        => Ok(await _svc.AddPhoto(id, dto, CurrentFirmId));

    [HttpDelete("photos/{photoId}")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> DeletePhoto(Guid photoId)
    {
        await _svc.DeletePhoto(photoId);
        return NoContent();
    }

    // -----------------------------------------------------------------------
    // Rates
    // -----------------------------------------------------------------------
    [HttpPost("{id}/rates")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> AddRate(Guid id, [FromBody] AddRateDto dto)
        => Ok(await _svc.AddRate(id, dto, CurrentFirmId));

    [HttpDelete("rates/{rateId}")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> DeleteRate(Guid rateId)
    {
        await _svc.DeleteRate(rateId);
        return NoContent();
    }
}

[ApiController]
[Route("api/suppliers/categories")]
public class SupplierCategoriesController : SuppliersControllerBase
{
    private readonly ISupplierService _svc;
    public SupplierCategoriesController(ISupplierService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("suppliers.directory.view.firm")]
    public async Task<IActionResult> List() => Ok(await _svc.ListCategories());

    [HttpPost]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Create([FromBody] CreateCategoryDto dto)
        => Ok(await _svc.CreateCategory(dto.Name, CurrentFirmId));

    [HttpDelete("{id}")]
    [HasPermission("suppliers.directory.create.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            await _svc.DeleteCategory(id);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }
}

public record CreateCategoryDto(string Name);
