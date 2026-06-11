using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Core.Entities;

namespace Namokara.Api.Modules.Core.Controllers;

public record RoleListDto(
    Guid Id,
    string Code,
    string Name,
    string? Description,
    Guid? InheritsFrom,
    string? InheritsFromName,
    bool IsSystem,
    string? Color,
    int UserCount,
    int PermissionCount);

public record CreateRoleDto(
    string Code,
    string Name,
    string? Description,
    Guid? InheritsFrom,
    string? Color);

[Authorize]
[ApiController]
[Route("api/core/roles")]
public class RolesController : ControllerBase
{
    private readonly AppDbContext _db;
    public RolesController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value!);

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search)
    {
        var firmId = CurrentFirmId;
        // Roles visible: global system roles (FirmId null) + this firm's custom roles
        var q = _db.Roles.AsNoTracking().Where(r => r.FirmId == null || r.FirmId == firmId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            q = q.Where(r => r.Name.ToLower().Contains(s) || r.Code.ToLower().Contains(s));
        }

        var roles = await q.OrderBy(r => r.SortOrder ?? 999).ThenBy(r => r.Name).ToListAsync();

        var roleIds = roles.Select(r => r.Id).ToList();

        var userCounts = await _db.Set<UserRole>().AsNoTracking()
            .Where(ur => roleIds.Contains(ur.RoleId))
            .GroupBy(ur => ur.RoleId)
            .Select(g => new { RoleId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RoleId, x => x.Count);

        var permCounts = await _db.Set<RolePermission>().AsNoTracking()
            .Where(rp => roleIds.Contains(rp.RoleId))
            .GroupBy(rp => rp.RoleId)
            .Select(g => new { RoleId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RoleId, x => x.Count);

        var byId = roles.ToDictionary(r => r.Id);
        var result = roles.Select(r => new RoleListDto(
            r.Id, r.Code, r.Name, r.Description,
            r.InheritsFrom,
            r.InheritsFrom.HasValue && byId.TryGetValue(r.InheritsFrom.Value, out var parent) ? parent.Name : null,
            r.IsSystem, r.Color,
            userCounts.TryGetValue(r.Id, out var uc) ? uc : 0,
            permCounts.TryGetValue(r.Id, out var pc) ? pc : 0
        )).ToList();

        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRoleDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { error = "Role name is required" });

            var firmId = CurrentFirmId;
            var code = string.IsNullOrWhiteSpace(dto.Code)
                ? dto.Name.ToLower().Replace(" ", "_")
                : dto.Code.ToLower().Trim();

            var role = new Role
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                Code = code,
                Name = dto.Name.Trim(),
                Description = dto.Description,
                InheritsFrom = dto.InheritsFrom,
                IsSystem = false,
                Color = dto.Color,
                CreatedAt = DateTimeOffset.UtcNow
            };
            _db.Roles.Add(role);
            await _db.SaveChangesAsync();
            return Ok(new { id = role.Id });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateRoleDto dto)
    {
        var role = await _db.Roles.FirstOrDefaultAsync(r =>
            r.Id == id && (r.FirmId == null || r.FirmId == CurrentFirmId));
        if (role is null) return NotFound();
        if (role.IsSystem) return BadRequest(new { error = "Cannot modify system roles" });
        role.Name = dto.Name.Trim();
        role.Description = dto.Description;
        role.InheritsFrom = dto.InheritsFrom;
        role.Color = dto.Color;
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == id && r.FirmId == CurrentFirmId);
        if (role is null) return NotFound();
        if (role.IsSystem) return BadRequest(new { error = "Cannot delete system roles" });

        var assigned = await _db.Set<UserRole>().AnyAsync(ur => ur.RoleId == id);
        if (assigned) return BadRequest(new { error = "Role is assigned to users — reassign first" });

        _db.Roles.Remove(role);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
