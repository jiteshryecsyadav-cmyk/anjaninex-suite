using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Core.Entities;
using Namokara.Api.Modules.Platform.Services;

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

// ── Permission catalog (matrix grid) DTOs ──────────────────────────────────
// Ek single permission cell: code + uska scope (branch/firm/self/all) + meta.
public record PermissionCellDto(
    string Code,
    string Action,
    string Scope,
    string? Description,
    bool IsDangerous);

// Ek resource row (e.g. Trading › Bill) — actions/cells uske niche.
public record PermissionResourceDto(
    string Resource,
    string Label,
    List<PermissionCellDto> Permissions);

// Ek module group (e.g. Trading) — resources uske andar.
public record PermissionModuleDto(
    string Module,
    string Label,
    List<PermissionResourceDto> Resources);

// PUT body — role ko exactly ye codes do (replace-all).
public record SetRolePermissionCodesDto(List<string> Codes);

[Authorize]
[ApiController]
[Route("api/core/roles")]
public class RolesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPermissionService _perms;
    public RolesController(AppDbContext db, IPermissionService perms)
    {
        _db = db;
        _perms = perms;
    }

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value!);

    /// <summary>snake/under_score wala code → "Title Case" label.</summary>
    private static string Humanize(string s) =>
        System.Globalization.CultureInfo.CurrentCulture.TextInfo
            .ToTitleCase(s.Replace('_', ' '));

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

    // =========================================================================
    // PERMISSIONS MATRIX
    // =========================================================================

    /// <summary>
    /// Pura permission catalog — module › resource › actions(+scope) tree.
    /// Matrix grid isi se render hota hai. Platform-scope module firm ko nahi dikhte.
    /// </summary>
    [HttpGet("/api/core/permissions")]
    public async Task<IActionResult> Catalog()
    {
        var perms = await _db.Permissions.AsNoTracking()
            // 'platform' module Anjaninex-only — firm admin ko nahi dikhana.
            .Where(p => p.Module != "platform")
            .OrderBy(p => p.Module).ThenBy(p => p.Resource).ThenBy(p => p.Action)
            .Select(p => new { p.Code, p.Module, p.Resource, p.Action, p.Scope, p.Description, p.IsDangerous })
            .ToListAsync();

        var modules = perms
            .GroupBy(p => p.Module)
            .Select(mg => new PermissionModuleDto(
                mg.Key,
                Humanize(mg.Key),
                mg.GroupBy(p => p.Resource)
                  .Select(rg => new PermissionResourceDto(
                      rg.Key,
                      Humanize(rg.Key),
                      rg.Select(p => new PermissionCellDto(
                          p.Code, p.Action, p.Scope, p.Description, p.IsDangerous)).ToList()))
                  .ToList()))
            .ToList();

        return Ok(modules);
    }

    /// <summary>Selected role ko abhi diye gaye permission CODES (matrix pre-check ke liye).</summary>
    [HttpGet("{id}/permissions")]
    public async Task<IActionResult> GetRolePermissions(Guid id)
    {
        var role = await _db.Roles.AsNoTracking().FirstOrDefaultAsync(r =>
            r.Id == id && (r.FirmId == null || r.FirmId == CurrentFirmId));
        if (role is null) return NotFound();

        var codes = await _db.Set<RolePermission>().AsNoTracking()
            .Where(rp => rp.RoleId == id)
            .Join(_db.Permissions, rp => rp.PermissionId, p => p.Id, (rp, p) => p.Code)
            .ToListAsync();

        return Ok(codes);
    }

    /// <summary>
    /// Role ke permissions ko EXACTLY in codes se replace karo (purane sab hata ke).
    /// Transactional. Codes ko core.permissions se validate karte hain.
    /// super_admin / firm_admin / firm_owner roles lock — lockout se bachne ke liye.
    /// </summary>
    [HttpPut("{id}/permissions")]
    public async Task<IActionResult> SetRolePermissions(Guid id, [FromBody] SetRolePermissionCodesDto dto)
    {
        try
        {
            var role = await _db.Roles.FirstOrDefaultAsync(r =>
                r.Id == id && (r.FirmId == null || r.FirmId == CurrentFirmId));
            if (role is null) return NotFound();

            // Protected roles — inke rights badalna mana (TeamController jaisa hi rule).
            if (role.Code == "super_admin")
                return BadRequest(new { error = "Cannot modify super admin role" });
            if (role.IsSystem && (role.Code == "firm_admin" || role.Code == "firm_owner"))
                return BadRequest(new { error = "Admin/Owner role ke permissions nahi badal sakte (lockout se bachne ke liye)" });

            var codes = (dto.Codes ?? new()).Distinct().ToList();

            // Sirf wahi codes lo jo core.permissions me hain (platform-scope chhod ke) — invalid skip.
            var valid = await _db.Permissions
                .Where(p => codes.Contains(p.Code) && p.Module != "platform")
                .Select(p => new { p.Id, p.Code })
                .ToListAsync();

            using var tx = await _db.Database.BeginTransactionAsync();

            var existing = await _db.Set<RolePermission>().Where(rp => rp.RoleId == id).ToListAsync();
            _db.Set<RolePermission>().RemoveRange(existing);

            var uid = User.FindFirst("user_id") is { } c && Guid.TryParse(c.Value, out var u) ? (Guid?)u : null;
            var now = DateTimeOffset.UtcNow;
            foreach (var p in valid)
                _db.Set<RolePermission>().Add(new RolePermission
                {
                    RoleId = id, PermissionId = p.Id, GrantedBy = uid, GrantedAt = now
                });

            await _db.SaveChangesAsync();
            await tx.CommitAsync();

            // Permission cache bust — warna in-role users ko purane rights 5 min tak dikhte rahenge.
            await _perms.InvalidateRole(id);

            return Ok(new { ok = true, count = valid.Count });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }
}
