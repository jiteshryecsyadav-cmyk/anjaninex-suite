using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Services;

public interface IPermissionService
{
    Task<HashSet<string>> GetUserPermissions(Guid userId);
    Task InvalidateUser(Guid userId);
    Task InvalidateRole(Guid roleId);
}

public class PermissionService : IPermissionService
{
    private readonly AppDbContext _db;
    private readonly IDistributedCache _cache;
    private readonly ILogger<PermissionService> _log;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    public PermissionService(AppDbContext db, IDistributedCache cache, ILogger<PermissionService> log)
    {
        _db = db;
        _cache = cache;
        _log = log;
    }

    public async Task<HashSet<string>> GetUserPermissions(Guid userId)
    {
        var key = $"perms:user:{userId}";
        var cached = await _cache.GetStringAsync(key);
        if (!string.IsNullOrEmpty(cached))
        {
            return JsonSerializer.Deserialize<HashSet<string>>(cached) ?? new();
        }

        // Get all roles for user (including inheritance)
        var directRoleIds = await _db.UserRoles
            .Where(ur => ur.UserId == userId)
            .Select(ur => ur.RoleId)
            .ToListAsync();

        var allRoleIds = new HashSet<Guid>(directRoleIds);
        var toProcess = new Queue<Guid>(directRoleIds);
        while (toProcess.Count > 0)
        {
            var rid = toProcess.Dequeue();
            var parent = await _db.Roles
                .Where(r => r.Id == rid)
                .Select(r => r.InheritsFrom)
                .FirstOrDefaultAsync();
            if (parent.HasValue && allRoleIds.Add(parent.Value))
                toProcess.Enqueue(parent.Value);
        }

        // Aggregate role permissions
        var perms = await _db.RolePermissions
            .Where(rp => allRoleIds.Contains(rp.RoleId))
            .Join(_db.Permissions, rp => rp.PermissionId, p => p.Id, (rp, p) => p.Code)
            .Distinct()
            .ToListAsync();

        var permSet = perms.ToHashSet();

        // Apply user overrides
        var overrides = await _db.UserPermissionOverrides
            .Where(o => o.UserId == userId
                && (o.ExpiresAt == null || o.ExpiresAt > DateTimeOffset.UtcNow))
            .Join(_db.Permissions, o => o.PermissionId, p => p.Id,
                (o, p) => new { p.Code, o.Granted })
            .ToListAsync();

        foreach (var o in overrides)
        {
            if (o.Granted) permSet.Add(o.Code);
            else permSet.Remove(o.Code);
        }

        // Role-based wildcards — these roles have implicit elevated access:
        //   super_admin: Anjaninex platform admin (sees everything across all firms)
        //                gets the unscoped all-access "*".
        //   firm_owner:  Owner of the firm (full access within their firm)
        //   firm_admin:  Admin of the firm (full access within their firm)
        //                get the firm-scoped wildcard "firm:*" which grants
        //                everything EXCEPT platform-scoped (".platform") permissions.
        var elevatedRoles = await _db.Roles
            .Where(r => allRoleIds.Contains(r.Id)
                && (r.Code == "super_admin" || r.Code == "firm_owner" || r.Code == "firm_admin"))
            .Select(r => r.Code)
            .ToListAsync();
        if (elevatedRoles.Contains("super_admin")) permSet.Add("*");
        if (elevatedRoles.Contains("firm_owner") || elevatedRoles.Contains("firm_admin")) permSet.Add("firm:*");

        await _cache.SetStringAsync(key, JsonSerializer.Serialize(permSet),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = CacheTtl });

        return permSet;
    }

    public Task InvalidateUser(Guid userId)
        => _cache.RemoveAsync($"perms:user:{userId}");

    public async Task InvalidateRole(Guid roleId)
    {
        var userIds = await _db.UserRoles
            .Where(ur => ur.RoleId == roleId)
            .Select(ur => ur.UserId)
            .ToListAsync();
        await Task.WhenAll(userIds.Select(InvalidateUser));
    }
}
