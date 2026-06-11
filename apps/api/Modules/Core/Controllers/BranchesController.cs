using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Core.Entities;

namespace Namokara.Api.Modules.Core.Controllers;

public record BranchDto(
    Guid Id,
    string Code,
    string Name,
    string? Phone,
    string? Email,
    string? Address,
    string? City,
    string? State,
    string? Pincode,
    bool IsHeadOffice,
    bool IsActive);

public record CreateBranchDto(
    string Code,
    string Name,
    string? Phone,
    string? Email,
    string? Address,
    string? City,
    string? State,
    string? Pincode,
    bool IsActive);

[Authorize]
[ApiController]
[Route("api/core/branches")]
public class BranchesController : ControllerBase
{
    private readonly AppDbContext _db;
    public BranchesController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value!);

    [HttpGet]
    [HasPermission("core.branch.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search)
    {
        var firmId = CurrentFirmId;
        var q = _db.Branches.AsNoTracking().Where(b => b.FirmId == firmId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            q = q.Where(b => b.Name.ToLower().Contains(s)
                || (b.Code != null && b.Code.ToLower().Contains(s))
                || (b.City != null && b.City.ToLower().Contains(s))
                || (b.Phone != null && b.Phone.Contains(s)));
        }
        var list = await q.OrderBy(b => b.Name)
            .Select(b => new BranchDto(b.Id, b.Code, b.Name, b.Phone, b.Email, b.Address,
                b.City, b.State, b.Pincode, b.IsHeadOffice, b.IsActive))
            .ToListAsync();
        return Ok(list);
    }

    [HttpGet("{id}")]
    [HasPermission("core.branch.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var b = await _db.Branches.AsNoTracking()
            .Where(x => x.Id == id && x.FirmId == CurrentFirmId)
            .Select(x => new BranchDto(x.Id, x.Code, x.Name, x.Phone, x.Email, x.Address,
                x.City, x.State, x.Pincode, x.IsHeadOffice, x.IsActive))
            .FirstOrDefaultAsync();
        return b is null ? NotFound() : Ok(b);
    }

    [HttpPost]
    [HasPermission("core.branch.create.firm")]
    public async Task<IActionResult> Create([FromBody] CreateBranchDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { error = "Name is required" });

            var firmId = CurrentFirmId;
            var code = string.IsNullOrWhiteSpace(dto.Code) ? await AutoCode(firmId, dto.Name) : dto.Code.Trim();

            var branch = new Branch
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                Code = code,
                Name = dto.Name.Trim(),
                Phone = dto.Phone,
                Email = dto.Email,
                Address = dto.Address,
                City = dto.City,
                State = dto.State,
                Pincode = dto.Pincode,
                IsActive = dto.IsActive,
                CreatedAt = DateTimeOffset.UtcNow
            };
            _db.Branches.Add(branch);
            await _db.SaveChangesAsync();

            return Ok(new BranchDto(branch.Id, branch.Code, branch.Name, branch.Phone, branch.Email,
                branch.Address, branch.City, branch.State, branch.Pincode,
                branch.IsHeadOffice, branch.IsActive));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPut("{id}")]
    [HasPermission("core.branch.edit.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateBranchDto dto)
    {
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == id && b.FirmId == CurrentFirmId);
        if (branch is null) return NotFound();
        if (!string.IsNullOrWhiteSpace(dto.Code)) branch.Code = dto.Code.Trim();
        branch.Name = dto.Name.Trim();
        branch.Phone = dto.Phone;
        branch.Email = dto.Email;
        branch.Address = dto.Address;
        branch.City = dto.City;
        branch.State = dto.State;
        branch.Pincode = dto.Pincode;
        branch.IsActive = dto.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new BranchDto(branch.Id, branch.Code, branch.Name, branch.Phone, branch.Email,
            branch.Address, branch.City, branch.State, branch.Pincode,
            branch.IsHeadOffice, branch.IsActive));
    }

    [HttpDelete("{id}")]
    [HasPermission("core.branch.edit.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == id && b.FirmId == CurrentFirmId);
        if (branch is null) return NotFound();
        // Soft delete by deactivating (avoids FK issues with users/bills)
        branch.IsActive = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<string> AutoCode(Guid firmId, string name)
    {
        var prefix = (name.Length >= 3 ? name.Substring(0, 3) : name).ToUpper().Replace(" ", "");
        var count = await _db.Branches.CountAsync(b => b.FirmId == firmId);
        return $"{prefix}-{(count + 1):D2}";
    }
}
