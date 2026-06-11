using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Namokara.Api.Infrastructure.Persistence;
using System.Text.Json;

namespace Namokara.Api.Common.Auth;

/// <summary>
/// Gate a controller / action behind a module entitlement.
/// Reads the firm's `enabled_modules` JSONB and 403s if the module is OFF.
/// Usage: [ModuleAccess("hr")]
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public class ModuleAccessAttribute : AuthorizeAttribute
{
    public ModuleAccessAttribute(string module)
    {
        Policy = $"mod:{module}";
    }
}

public record ModuleRequirement(string Module) : IAuthorizationRequirement;

/// <summary>Policy provider — registers `mod:xxx` policies dynamically.</summary>
public class ModulePolicyProvider : IAuthorizationPolicyProvider
{
    private readonly DefaultAuthorizationPolicyProvider _fallback;
    public ModulePolicyProvider(IOptions<AuthorizationOptions> opts)
        => _fallback = new DefaultAuthorizationPolicyProvider(opts);

    public Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (policyName.StartsWith("mod:", StringComparison.OrdinalIgnoreCase))
        {
            var module = policyName.Substring(4);
            var policy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .AddRequirements(new ModuleRequirement(module))
                .Build();
            return Task.FromResult<AuthorizationPolicy?>(policy);
        }
        return _fallback.GetPolicyAsync(policyName);
    }

    public Task<AuthorizationPolicy> GetDefaultPolicyAsync() => _fallback.GetDefaultPolicyAsync();
    public Task<AuthorizationPolicy?> GetFallbackPolicyAsync() => _fallback.GetFallbackPolicyAsync();
}

/// <summary>Reads enabled_modules from the firm row and gates access.</summary>
public class ModuleAccessHandler : AuthorizationHandler<ModuleRequirement>
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ModuleAccessHandler> _log;
    // Tiny per-request cache (handler is scoped — but we still have a Dictionary for the rare case multiple modules check in one request)
    private static readonly Dictionary<Guid, (HashSet<string> mods, DateTime cachedAt)> _cache = new();
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(30);

    public ModuleAccessHandler(IServiceScopeFactory scopeFactory, ILogger<ModuleAccessHandler> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext ctx, ModuleRequirement req)
    {
        var firmClaim = ctx.User.FindFirst("firm_id")?.Value;
        if (firmClaim is null || !Guid.TryParse(firmClaim, out var firmId))
        {
            // Super-admin (no firm) bypass
            if (ctx.User.IsInRole("super_admin")) ctx.Succeed(req);
            return;
        }

        var modules = await GetEnabledModules(firmId);
        if (modules.Contains(req.Module))
        {
            ctx.Succeed(req);
        }
        else
        {
            _log.LogWarning("Module access denied for firm {FirmId}: '{Module}' not enabled", firmId, req.Module);
        }
    }

    private async Task<HashSet<string>> GetEnabledModules(Guid firmId)
    {
        if (_cache.TryGetValue(firmId, out var cached)
            && DateTime.UtcNow - cached.cachedAt < CacheTtl)
        {
            return cached.mods;
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var json = await db.Firms.AsNoTracking()
            .Where(f => f.Id == firmId)
            .Select(f => f.EnabledModules)
            .FirstOrDefaultAsync();

        var mods = new HashSet<string>();
        if (!string.IsNullOrWhiteSpace(json))
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    if (prop.Value.ValueKind == JsonValueKind.True)
                        mods.Add(prop.Name);
                }
            }
            catch (JsonException) { /* leave empty */ }
        }

        _cache[firmId] = (mods, DateTime.UtcNow);
        return mods;
    }

    /// <summary>Clear cache entry — call after admin toggles modules.</summary>
    public static void Invalidate(Guid firmId) => _cache.Remove(firmId);
}

public static class ModuleAccessExtensions
{
    public static IServiceCollection AddModuleAccessAuthorization(this IServiceCollection services)
    {
        // Composite provider: if Permission provider already registered, this will REPLACE it,
        // so we wrap it in a multi-provider below.
        services.AddSingleton<IAuthorizationPolicyProvider, CompositeAuthPolicyProvider>();
        services.AddScoped<IAuthorizationHandler, ModuleAccessHandler>();
        return services;
    }
}

/// <summary>Single provider that dispatches `perm:`, `mod:`, or default policies.</summary>
public class CompositeAuthPolicyProvider : IAuthorizationPolicyProvider
{
    private readonly DefaultAuthorizationPolicyProvider _fallback;
    public CompositeAuthPolicyProvider(IOptions<AuthorizationOptions> opts)
        => _fallback = new DefaultAuthorizationPolicyProvider(opts);

    public Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (policyName.StartsWith("perm:", StringComparison.OrdinalIgnoreCase))
        {
            var perm = policyName.Substring(5);
            return Task.FromResult<AuthorizationPolicy?>(
                new AuthorizationPolicyBuilder()
                    .RequireAuthenticatedUser()
                    .AddRequirements(new PermissionRequirement(perm))
                    .Build());
        }
        if (policyName.StartsWith("mod:", StringComparison.OrdinalIgnoreCase))
        {
            var module = policyName.Substring(4);
            return Task.FromResult<AuthorizationPolicy?>(
                new AuthorizationPolicyBuilder()
                    .RequireAuthenticatedUser()
                    .AddRequirements(new ModuleRequirement(module))
                    .Build());
        }
        return _fallback.GetPolicyAsync(policyName);
    }

    public Task<AuthorizationPolicy> GetDefaultPolicyAsync() => _fallback.GetDefaultPolicyAsync();
    public Task<AuthorizationPolicy?> GetFallbackPolicyAsync() => _fallback.GetFallbackPolicyAsync();
}
