using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Core.Entities;
using Namokara.Api.Common.Text;

namespace Namokara.Api.Modules.Core.Controllers;

// =============================================================================
// TEAM & SECURITY — firm admin ke liye: Branches, Users (staff login),
// Roles aur Role-Permissions manage karne ka pura section.
// Sirf firm ka admin (role code: admin/owner) ye sab kar sakta hai.
// =============================================================================

public record SaveBranchDto(string Code, string Name, string? Address, string? City,
    string? State, string? Pincode, string? Phone, string? GstStateCode, bool IsActive = true);

public record CreateTeamUserDto(string FullName, string Username, string? Email, string? Phone,
    string Password, Guid RoleId, List<Guid>? BranchIds, bool CanViewAllBranches = false);

public record UpdateTeamUserDto(string FullName, string? Email, string? Phone,
    Guid RoleId, List<Guid>? BranchIds, bool CanViewAllBranches, bool IsActive);

public record TeamResetPasswordDto(string Password);

public record SaveRoleDto(string Code, string Name, string? Description, string? Color);

public record SetRolePermissionsDto(List<long> PermissionIds);

[ApiController]
[Authorize]
[Route("api/core/team")]
public class TeamController : ControllerBase
{
    private readonly AppDbContext _db;
    public TeamController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    /// <summary>Sirf firm-admin aage badh sakta hai (role code admin/owner).</summary>
    private async Task<bool> IsAdmin()
    {
        var uid = CurrentUserId;
        return await (from ur in _db.UserRoles
                      join r in _db.Roles on ur.RoleId equals r.Id
                      where ur.UserId == uid
                         && (r.Code == "firm_admin" || r.Code == "firm_owner"
                             || r.Code == "admin" || r.Code == "owner")
                      select r.Id).AnyAsync();
    }

    private async Task<IActionResult?> GuardAdmin()
        => await IsAdmin() ? null : StatusCode(403, new { error = "Sirf firm admin Team & Security manage kar sakta hai" });

    // =========================================================================
    // BRANCHES
    // =========================================================================
    [HttpGet("branches")]
    public async Task<IActionResult> Branches()
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        var rows = await _db.Branches.Where(b => b.FirmId == firmId)
            .OrderByDescending(b => b.IsHeadOffice).ThenBy(b => b.Name)
            .Select(b => new { b.Id, b.Code, b.Name, b.Address, b.City, b.State, b.Pincode,
                               b.Phone, b.GstStateCode, b.IsHeadOffice, b.IsActive })
            .ToListAsync();
        return Ok(rows);
    }

    [HttpPost("branches")]
    public async Task<IActionResult> CreateBranch([FromBody] SaveBranchDto dto)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        var code = dto.Code.Trim().ToUpper();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { error = "Branch code aur naam dono zaroori hain" });
        if (await _db.Branches.AnyAsync(b => b.FirmId == firmId && b.Code == code))
            return BadRequest(new { error = $"Branch code '{code}' pehle se hai" });

        var br = new Branch
        {
            Id = Guid.NewGuid(), FirmId = firmId, Code = code, Name = NameCase.TitleCase(dto.Name),
            Address = dto.Address, City = dto.City, State = dto.State, Pincode = dto.Pincode,
            Phone = dto.Phone, GstStateCode = dto.GstStateCode,
            IsActive = dto.IsActive, CreatedAt = DateTimeOffset.UtcNow
        };
        _db.Branches.Add(br);
        await _db.SaveChangesAsync();
        return Ok(new { br.Id });
    }

    [HttpPut("branches/{id}")]
    public async Task<IActionResult> UpdateBranch(Guid id, [FromBody] SaveBranchDto dto)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        var br = await _db.Branches.FirstOrDefaultAsync(b => b.Id == id && b.FirmId == firmId);
        if (br is null) return NotFound();
        var code = dto.Code.Trim().ToUpper();
        if (await _db.Branches.AnyAsync(b => b.FirmId == firmId && b.Code == code && b.Id != id))
            return BadRequest(new { error = $"Branch code '{code}' kisi aur branch ka hai" });

        br.Code = code; br.Name = NameCase.TitleCase(dto.Name);
        br.Address = dto.Address; br.City = dto.City; br.State = dto.State; br.Pincode = dto.Pincode;
        br.Phone = dto.Phone; br.GstStateCode = dto.GstStateCode; br.IsActive = dto.IsActive;
        await _db.SaveChangesAsync();
        return Ok(new { br.Id });
    }

    [HttpDelete("branches/{id}")]
    public async Task<IActionResult> DeleteBranch(Guid id)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        var br = await _db.Branches.FirstOrDefaultAsync(b => b.Id == id && b.FirmId == firmId);
        if (br is null) return NotFound();
        if (br.IsHeadOffice)
            return BadRequest(new { error = "Head Office branch delete nahi ho sakti" });

        // Data wali branch delete nahi — sirf inactive (warna bills/orders anath ho jayenge)
        var hasBills = await _db.Bills.IgnoreQueryFilters().AnyAsync(b => b.BranchId == id);
        var hasOrders = await _db.Orders.IgnoreQueryFilters().AnyAsync(o => o.BranchId == id);
        var hasUsers = await _db.Users.AnyAsync(u => u.DefaultBranchId == id);
        if (hasBills || hasOrders || hasUsers)
            return BadRequest(new { error = "Is branch me bills/orders/users hain — delete nahi, Edit me jaakar Inactive karo" });

        var access = await _db.UserBranchAccess.Where(a => a.BranchId == id).ToListAsync();
        _db.UserBranchAccess.RemoveRange(access);
        _db.Branches.Remove(br);
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // =========================================================================
    // USERS (staff logins)
    // =========================================================================
    [HttpGet("users")]
    public async Task<IActionResult> Users()
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;

        var users = await _db.Users.Where(u => u.FirmId == firmId)
            .OrderBy(u => u.FullName).ToListAsync();
        var ids = users.Select(u => u.Id).ToList();

        var roleMap = await (from ur in _db.UserRoles
                             join r in _db.Roles on ur.RoleId equals r.Id
                             where ids.Contains(ur.UserId)
                             select new { ur.UserId, r.Id, r.Name, r.Code }).ToListAsync();
        var branchMap = await _db.UserBranchAccess.Where(x => ids.Contains(x.UserId)).ToListAsync();

        return Ok(users.Select(u => new
        {
            u.Id, u.FullName, u.Username, u.Email, u.Phone, u.IsActive, u.LastLoginAt,
            u.CanViewAllBranches,
            roles = roleMap.Where(r => r.UserId == u.Id).Select(r => new { r.Id, r.Name, r.Code }).ToList(),
            branchIds = branchMap.Where(b => b.UserId == u.Id).Select(b => b.BranchId).ToList()
        }).ToList());
    }

    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] CreateTeamUserDto dto)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;

        var uname = dto.Username.Trim().ToLower();
        if (string.IsNullOrWhiteSpace(uname) || string.IsNullOrWhiteSpace(dto.FullName))
            return BadRequest(new { error = "Naam aur username dono zaroori hain" });
        if (dto.Password.Length < 6)
            return BadRequest(new { error = "Password kam se kam 6 characters ka ho" });
        // MULTI-FIRM: username firm ke andar unique — dusri firm me same username chalega
        if (await _db.Users.AnyAsync(u => u.Username == uname && u.FirmId == firmId))
            return BadRequest(new { error = $"Username '{uname}' is firm me pehle se liya hua hai" });

        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == dto.RoleId
            && (r.FirmId == firmId || r.FirmId == null) && r.Code != "super_admin");
        if (role is null) return BadRequest(new { error = "Role valid nahi hai" });

        using var tx = await _db.Database.BeginTransactionAsync();
        var u = new User
        {
            Id = Guid.NewGuid(), FirmId = firmId,
            Username = uname, Email = dto.Email?.Trim(), Phone = dto.Phone?.Trim(),
            FullName = NameCase.TitleCase(dto.FullName),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            CanViewAllBranches = dto.CanViewAllBranches,
            // FirstOrDefault() khali list par Guid.Empty deta hai → FK fail. Null bhejo.
            DefaultBranchId = (dto.BranchIds != null && dto.BranchIds.Count > 0) ? dto.BranchIds[0] : null,
            IsActive = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
        };
        // PEHLE user save karo (FK order) — phir role + branch access
        _db.Users.Add(u);
        await _db.SaveChangesAsync();

        _db.UserRoles.Add(new UserRole { UserId = u.Id, RoleId = role.Id, AssignedAt = DateTimeOffset.UtcNow });
        foreach (var (bid, idx) in (dto.BranchIds ?? new()).Select((b, i) => (b, i)))
            _db.UserBranchAccess.Add(new UserBranchAccess { UserId = u.Id, BranchId = bid, IsDefault = idx == 0 });
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return Ok(new { u.Id });
    }

    [HttpPut("users/{id}")]
    public async Task<IActionResult> UpdateUser(Guid id, [FromBody] UpdateTeamUserDto dto)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (u is null) return NotFound();
        if (id == CurrentUserId && !dto.IsActive)
            return BadRequest(new { error = "Khud ko deactivate nahi kar sakte" });

        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == dto.RoleId
            && (r.FirmId == firmId || r.FirmId == null) && r.Code != "super_admin");
        if (role is null) return BadRequest(new { error = "Role valid nahi hai" });

        using var tx = await _db.Database.BeginTransactionAsync();
        u.FullName = NameCase.TitleCase(dto.FullName);
        u.Email = dto.Email?.Trim(); u.Phone = dto.Phone?.Trim();
        u.CanViewAllBranches = dto.CanViewAllBranches;
        u.IsActive = dto.IsActive;
        u.DefaultBranchId = (dto.BranchIds != null && dto.BranchIds.Count > 0) ? dto.BranchIds[0] : null;
        u.UpdatedAt = DateTimeOffset.UtcNow;

        // Role replace (ek user = ek role, simple model)
        var oldRoles = await _db.UserRoles.Where(x => x.UserId == id).ToListAsync();
        _db.UserRoles.RemoveRange(oldRoles);
        _db.UserRoles.Add(new UserRole { UserId = id, RoleId = role.Id, AssignedAt = DateTimeOffset.UtcNow });

        // Branch access replace
        var oldAccess = await _db.UserBranchAccess.Where(x => x.UserId == id).ToListAsync();
        _db.UserBranchAccess.RemoveRange(oldAccess);
        foreach (var (bid, idx) in (dto.BranchIds ?? new()).Select((b, i) => (b, i)))
            _db.UserBranchAccess.Add(new UserBranchAccess { UserId = id, BranchId = bid, IsDefault = idx == 0 });

        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return Ok(new { u.Id });
    }

    [HttpDelete("users/{id}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        if (id == CurrentUserId)
            return BadRequest(new { error = "Khud ko delete nahi kar sakte" });

        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (u is null) return NotFound();

        // Jis user ne entries banayi hain use delete nahi — sirf Inactive
        var hasBills = await _db.Bills.IgnoreQueryFilters().AnyAsync(b => b.CreatedBy == id);
        var hasOrders = await _db.Orders.IgnoreQueryFilters().AnyAsync(o => o.CreatedBy == id);
        var hasPayments = await _db.Payments.IgnoreQueryFilters().AnyAsync(p => p.CreatedBy == id);
        if (hasBills || hasOrders || hasPayments)
            return BadRequest(new { error = "Is user ne entries banayi hain — delete nahi, Edit me jaakar Inactive karo (history bachegi)" });

        using var tx = await _db.Database.BeginTransactionAsync();
        _db.Sessions.RemoveRange(await _db.Sessions.Where(s => s.UserId == id).ToListAsync());
        _db.UserRoles.RemoveRange(await _db.UserRoles.Where(r => r.UserId == id).ToListAsync());
        _db.UserBranchAccess.RemoveRange(await _db.UserBranchAccess.Where(a => a.UserId == id).ToListAsync());
        await _db.SaveChangesAsync();
        _db.Users.Remove(u);
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return Ok(new { ok = true });
    }

    [HttpPost("users/{id}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, [FromBody] TeamResetPasswordDto dto)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        if (dto.Password.Length < 6)
            return BadRequest(new { error = "Password kam se kam 6 characters ka ho" });
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (u is null) return NotFound();
        u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);
        u.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // =========================================================================
    // ROLES + PERMISSIONS
    // =========================================================================
    [HttpGet("roles")]
    public async Task<IActionResult> Roles()
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        var roles = await _db.Roles
            .Where(r => (r.FirmId == firmId || r.FirmId == null) && r.Code != "super_admin")
            .OrderBy(r => r.SortOrder).ThenBy(r => r.Name)
            .Select(r => new { r.Id, r.Code, r.Name, r.Description, r.Color, r.IsSystem })
            .ToListAsync();

        var roleIds = roles.Select(r => r.Id).ToList();
        var counts = await _db.UserRoles.Where(ur => roleIds.Contains(ur.RoleId))
            .GroupBy(ur => ur.RoleId).Select(g => new { g.Key, N = g.Count() }).ToListAsync();
        var permCounts = await _db.RolePermissions.Where(rp => roleIds.Contains(rp.RoleId))
            .GroupBy(rp => rp.RoleId).Select(g => new { g.Key, N = g.Count() }).ToListAsync();

        return Ok(roles.Select(r => new
        {
            r.Id, r.Code, r.Name, r.Description, r.Color, r.IsSystem,
            users = counts.FirstOrDefault(c => c.Key == r.Id)?.N ?? 0,
            permissions = permCounts.FirstOrDefault(c => c.Key == r.Id)?.N ?? 0
        }).ToList());
    }

    [HttpPost("roles")]
    public async Task<IActionResult> CreateRole([FromBody] SaveRoleDto dto)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        var code = dto.Code.Trim().ToLower().Replace(" ", "_");
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { error = "Role code aur naam dono zaroori hain" });
        if (await _db.Roles.AnyAsync(r => r.FirmId == firmId && r.Code == code))
            return BadRequest(new { error = $"Role code '{code}' pehle se hai" });

        var role = new Role
        {
            Id = Guid.NewGuid(), FirmId = firmId, Code = code, Name = NameCase.TitleCase(dto.Name),
            Description = dto.Description, Color = dto.Color, IsSystem = false,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.Roles.Add(role);
        await _db.SaveChangesAsync();
        return Ok(new { role.Id });
    }

    [HttpDelete("roles/{id}")]
    public async Task<IActionResult> DeleteRole(Guid id)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == id && r.FirmId == firmId);
        if (role is null) return NotFound();
        if (role.IsSystem)
            return BadRequest(new { error = "System role delete nahi ho sakta" });
        if (await _db.UserRoles.AnyAsync(ur => ur.RoleId == id))
            return BadRequest(new { error = "Is role par users lage hain — pehle unka role badlo" });

        var perms = await _db.RolePermissions.Where(rp => rp.RoleId == id).ToListAsync();
        _db.RolePermissions.RemoveRange(perms);
        _db.Roles.Remove(role);
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    /// <summary>Saare permissions — module-wise UI grid ke liye.</summary>
    [HttpGet("permissions")]
    public async Task<IActionResult> Permissions()
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var rows = await _db.Permissions
            .OrderBy(p => p.Module).ThenBy(p => p.Resource).ThenBy(p => p.Action)
            .Select(p => new { p.Id, p.Code, p.Module, p.Resource, p.Action, p.Scope, p.Description, p.IsDangerous })
            .ToListAsync();
        return Ok(rows);
    }

    [HttpGet("roles/{id}/permissions")]
    public async Task<IActionResult> RolePermissions(Guid id)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var ids = await _db.RolePermissions.Where(rp => rp.RoleId == id)
            .Select(rp => rp.PermissionId).ToListAsync();
        return Ok(ids);
    }

    [HttpPut("roles/{id}/permissions")]
    public async Task<IActionResult> SetRolePermissions(Guid id, [FromBody] SetRolePermissionsDto dto)
    {
        var guard = await GuardAdmin(); if (guard != null) return guard;
        var firmId = CurrentFirmId;
        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == id
            && (r.FirmId == firmId || r.FirmId == null) && r.Code != "super_admin");
        if (role is null) return NotFound();
        if (role.IsSystem && (role.Code == "firm_admin" || role.Code == "firm_owner"))
            return BadRequest(new { error = "Admin/Owner role ke permissions nahi badal sakte (lockout se bachne ke liye)" });

        using var tx = await _db.Database.BeginTransactionAsync();
        var old = await _db.RolePermissions.Where(rp => rp.RoleId == id).ToListAsync();
        _db.RolePermissions.RemoveRange(old);
        var uid = CurrentUserId;
        var now = DateTimeOffset.UtcNow;
        foreach (var pid in dto.PermissionIds.Distinct())
            _db.RolePermissions.Add(new RolePermission { RoleId = id, PermissionId = pid, GrantedBy = uid, GrantedAt = now });
        await _db.SaveChangesAsync();
        await tx.CommitAsync();
        return Ok(new { ok = true, count = dto.PermissionIds.Count });
    }
}
