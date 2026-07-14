using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Core.Entities;

namespace Namokara.Api.Modules.Core.Controllers;

// =============================================================================
// DTOs
// =============================================================================
public record UserListDto(
    Guid Id,
    string FullName,
    string Username,
    string? Email,
    string? Phone,
    string? AvatarUrl,
    Guid? DefaultBranchId,
    string? DefaultBranchName,
    string? RoleName,
    Guid? RoleId,
    bool IsActive,
    bool IsLocked,
    DateTimeOffset? LastLoginAt,
    DateTimeOffset CreatedAt,
    int ActiveSessionsCount);

public record UserDetailDto(
    Guid Id,
    string FullName,
    string Username,
    string? Email,
    string? Phone,
    string? AvatarUrl,
    Guid? DefaultBranchId,
    string? DefaultBranchName,
    Guid? RoleId,
    string? RoleName,
    bool IsActive,
    bool IsLocked,
    bool Requires2fa,
    bool CanViewAllBranches,
    string Locale,
    string Theme,
    DateTimeOffset? LastLoginAt,
    DateTimeOffset CreatedAt,
    List<Guid> AccessibleBranchIds);

public record CreateUserDto(
    string FullName,
    string Username,
    string Password,
    string? Email,
    string? Phone,
    Guid? DefaultBranchId,
    Guid? RoleId,
    bool IsActive = true,
    bool Requires2fa = false);

public record UpdateUserDto(
    string FullName,
    string? Email,
    string? Phone,
    Guid? DefaultBranchId,
    Guid? RoleId,
    bool IsActive,
    bool Requires2fa);

public record ResetPasswordDto(string NewPassword);

public record UserKpiDto(
    int Total,
    int Active,
    int Locked,
    int LoggedInToday,
    int CreatedThisMonth);

public record SessionDto(
    Guid Id,
    string? IpAddress,
    string? UserAgent,
    DateTimeOffset LastSeenAt,
    DateTimeOffset ExpiresAt,
    bool IsRevoked);

// =============================================================================
// Controller
// =============================================================================
[Authorize]
[ApiController]
[Route("api/core/users")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    public UsersController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value!);

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    // -------------------------------------------------------------------------
    // KPI cards for dashboard top strip
    // -------------------------------------------------------------------------
    [HttpGet("kpi")]
    public async Task<IActionResult> Kpi()
    {
        var firmId = CurrentFirmId;
        var todayStart = new DateTimeOffset(DateTime.UtcNow.Date, TimeSpan.Zero);   // UTC offset — Npgsql requirement
        var monthStart = new DateTimeOffset(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, TimeSpan.Zero);

        var users = _db.Users.AsNoTracking().Where(u => u.FirmId == firmId);
        var total = await users.CountAsync();
        var active = await users.CountAsync(u => u.IsActive && !u.IsLocked);
        var locked = await users.CountAsync(u => u.IsLocked);
        var loggedInToday = await users.CountAsync(u => u.LastLoginAt != null && u.LastLoginAt >= todayStart);
        var createdThisMonth = await users.CountAsync(u => u.CreatedAt >= monthStart);

        return Ok(new UserKpiDto(total, active, locked, loggedInToday, createdThisMonth));
    }

    // -------------------------------------------------------------------------
    // List with filters
    // -------------------------------------------------------------------------
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] Guid? roleId,
        [FromQuery] Guid? branchId,
        [FromQuery] string? status)         // active | inactive | locked
    {
        var firmId = CurrentFirmId;
        var q = _db.Users.AsNoTracking().Where(u => u.FirmId == firmId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            q = q.Where(u => u.FullName.ToLower().Contains(s)
                || u.Username.ToLower().Contains(s)
                || (u.Email != null && u.Email.ToLower().Contains(s))
                || (u.Phone != null && u.Phone.Contains(s)));
        }

        if (status == "active") q = q.Where(u => u.IsActive && !u.IsLocked);
        else if (status == "inactive") q = q.Where(u => !u.IsActive);
        else if (status == "locked") q = q.Where(u => u.IsLocked);

        if (branchId.HasValue) q = q.Where(u => u.DefaultBranchId == branchId.Value);

        var branches = await _db.Branches.AsNoTracking()
            .Where(b => b.FirmId == firmId)
            .ToDictionaryAsync(b => b.Id, b => b.Name);

        // Fetch primary role per user
        var userIds = await q.Select(u => u.Id).ToListAsync();
        var userRoles = await _db.Set<UserRole>().AsNoTracking()
            .Where(ur => userIds.Contains(ur.UserId))
            .ToListAsync();
        var roles = await _db.Roles.AsNoTracking()
            .Where(r => r.FirmId == null || r.FirmId == firmId)
            .ToDictionaryAsync(r => r.Id);

        var userRoleMap = userRoles
            .GroupBy(ur => ur.UserId)
            .ToDictionary(g => g.Key, g => g.OrderBy(x => x.AssignedAt).First().RoleId);

        if (roleId.HasValue)
        {
            var filteredIds = userRoleMap.Where(kv => kv.Value == roleId.Value).Select(kv => kv.Key).ToHashSet();
            q = q.Where(u => filteredIds.Contains(u.Id));
        }

        var activeSessions = await _db.Sessions.AsNoTracking()
            .Where(s => userIds.Contains(s.UserId)
                && s.RevokedAt == null
                && s.ExpiresAt > DateTimeOffset.UtcNow)
            .GroupBy(s => s.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count);

        var list = await q.OrderBy(u => u.FullName).ToListAsync();

        var result = list.Select(u =>
        {
            string? roleName = null;
            Guid? userRoleId = null;
            if (userRoleMap.TryGetValue(u.Id, out var rid) && roles.TryGetValue(rid, out var r))
            {
                roleName = r.Name;
                userRoleId = r.Id;
            }
            return new UserListDto(
                u.Id,
                u.FullName,
                u.Username,
                u.Email,
                u.Phone,
                u.AvatarUrl,
                u.DefaultBranchId,
                u.DefaultBranchId.HasValue && branches.TryGetValue(u.DefaultBranchId.Value, out var bn) ? bn : null,
                roleName,
                userRoleId,
                u.IsActive,
                u.IsLocked,
                u.LastLoginAt,
                u.CreatedAt,
                activeSessions.TryGetValue(u.Id, out var c) ? c : 0
            );
        }).ToList();

        return Ok(result);
    }

    // -------------------------------------------------------------------------
    // Get user detail
    // -------------------------------------------------------------------------
    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var u = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (u is null) return NotFound();

        string? branchName = null;
        if (u.DefaultBranchId.HasValue)
        {
            branchName = await _db.Branches.AsNoTracking()
                .Where(b => b.Id == u.DefaultBranchId.Value)
                .Select(b => b.Name).FirstOrDefaultAsync();
        }

        var userRole = await _db.Set<UserRole>().AsNoTracking()
            .Where(ur => ur.UserId == u.Id)
            .OrderBy(ur => ur.AssignedAt)
            .Join(_db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { r.Id, r.Name })
            .FirstOrDefaultAsync();

        var branchAccess = await _db.Set<UserBranchAccess>().AsNoTracking()
            .Where(ba => ba.UserId == u.Id)
            .Select(ba => ba.BranchId)
            .ToListAsync();

        return Ok(new UserDetailDto(
            u.Id, u.FullName, u.Username, u.Email, u.Phone, u.AvatarUrl,
            u.DefaultBranchId, branchName,
            userRole?.Id, userRole?.Name,
            u.IsActive, u.IsLocked, u.Requires2fa, u.CanViewAllBranches,
            u.Locale, u.Theme,
            u.LastLoginAt, u.CreatedAt,
            branchAccess
        ));
    }

    // -------------------------------------------------------------------------
    // Create user
    // -------------------------------------------------------------------------
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.FullName)) return BadRequest(new { error = "Full name is required" });
            if (string.IsNullOrWhiteSpace(dto.Username)) return BadRequest(new { error = "Username is required" });
            if (string.IsNullOrWhiteSpace(dto.Password) || dto.Password.Length < 6)
                return BadRequest(new { error = "Password must be at least 6 characters" });

            var firmId = CurrentFirmId;

            // MULTI-FIRM: username firm ke andar unique — dusri firm me same chalega
            var usernameTaken = await _db.Users.AnyAsync(u => u.Username == dto.Username.Trim() && u.FirmId == firmId);
            if (usernameTaken) return BadRequest(new { error = $"Username '{dto.Username}' is firm me already taken" });

            var user = new User
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                FullName = dto.FullName.Trim(),
                Username = dto.Username.Trim(),
                Email = dto.Email,
                Phone = dto.Phone,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
                DefaultBranchId = dto.DefaultBranchId,
                IsActive = dto.IsActive,
                Requires2fa = dto.Requires2fa,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.Users.Add(user);

            if (dto.RoleId.HasValue)
            {
                _db.Set<UserRole>().Add(new UserRole
                {
                    UserId = user.Id,
                    RoleId = dto.RoleId.Value,
                    AssignedAt = DateTimeOffset.UtcNow
                });
            }

            if (dto.DefaultBranchId.HasValue)
            {
                _db.Set<UserBranchAccess>().Add(new UserBranchAccess
                {
                    UserId = user.Id,
                    BranchId = dto.DefaultBranchId.Value,
                    IsDefault = true
                });
            }

            await _db.SaveChangesAsync();
            return Ok(new { id = user.Id });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    // -------------------------------------------------------------------------
    // Update user
    // -------------------------------------------------------------------------
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserDto dto)
    {
        var firmId = CurrentFirmId;
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (u is null) return NotFound();

        u.FullName = dto.FullName.Trim();
        u.Email = dto.Email;
        u.Phone = dto.Phone;
        u.DefaultBranchId = dto.DefaultBranchId;
        u.IsActive = dto.IsActive;
        u.Requires2fa = dto.Requires2fa;
        u.UpdatedAt = DateTimeOffset.UtcNow;

        // Update role assignment (replace primary role)
        if (dto.RoleId.HasValue)
        {
            var existing = await _db.Set<UserRole>().Where(ur => ur.UserId == u.Id).ToListAsync();
            _db.Set<UserRole>().RemoveRange(existing);
            _db.Set<UserRole>().Add(new UserRole
            {
                UserId = u.Id,
                RoleId = dto.RoleId.Value,
                AssignedAt = DateTimeOffset.UtcNow
            });
        }

        await _db.SaveChangesAsync();
        return Ok();
    }

    // -------------------------------------------------------------------------
    // Soft delete (deactivate)
    // -------------------------------------------------------------------------
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var firmId = CurrentFirmId;
        if (id == CurrentUserId) return BadRequest(new { error = "Cannot deactivate yourself" });

        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (u is null) return NotFound();
        u.IsActive = false;
        u.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // -------------------------------------------------------------------------
    // Reset password
    // -------------------------------------------------------------------------
    [HttpPost("{id}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, [FromBody] ResetPasswordDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 6)
            return BadRequest(new { error = "Password must be at least 6 characters" });

        var firmId = CurrentFirmId;
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (u is null) return NotFound();
        u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        u.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok();
    }

    // -------------------------------------------------------------------------
    // Lock / Unlock
    // -------------------------------------------------------------------------
    [HttpPost("{id}/lock")]
    public async Task<IActionResult> Lock(Guid id)
    {
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (u is null) return NotFound();
        u.IsLocked = true;
        u.LockedUntil = DateTimeOffset.UtcNow.AddYears(10);
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpPost("{id}/unlock")]
    public async Task<IActionResult> Unlock(Guid id)
    {
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (u is null) return NotFound();
        u.IsLocked = false;
        u.LockedUntil = null;
        await _db.SaveChangesAsync();
        return Ok();
    }

    // -------------------------------------------------------------------------
    // List sessions for a user
    // -------------------------------------------------------------------------
    [HttpGet("{id}/sessions")]
    public async Task<IActionResult> Sessions(Guid id)
    {
        var firmId = CurrentFirmId;
        var userExists = await _db.Users.AnyAsync(u => u.Id == id && u.FirmId == firmId);
        if (!userExists) return NotFound();

        var sessions = await _db.Sessions.AsNoTracking()
            .Where(s => s.UserId == id)
            .OrderByDescending(s => s.LastSeenAt)
            .Select(s => new SessionDto(s.Id, s.IpAddress, s.UserAgent, s.LastSeenAt, s.ExpiresAt, s.RevokedAt != null))
            .ToListAsync();
        return Ok(sessions);
    }

    [HttpPost("{id}/sessions/revoke-all")]
    public async Task<IActionResult> RevokeAllSessions(Guid id)
    {
        var firmId = CurrentFirmId;
        var userExists = await _db.Users.AnyAsync(u => u.Id == id && u.FirmId == firmId);
        if (!userExists) return NotFound();
        var sessions = await _db.Sessions.Where(s => s.UserId == id && s.RevokedAt == null).ToListAsync();
        foreach (var s in sessions) s.RevokedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok();
    }
}
