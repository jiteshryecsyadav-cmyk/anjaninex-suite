using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Common.Auth;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public class HasPermissionAttribute : AuthorizeAttribute
{
    public HasPermissionAttribute(string permission)
    {
        Policy = $"perm:{permission}";
    }
}

public record PermissionRequirement(string Permission) : IAuthorizationRequirement;

public class PermissionPolicyProvider : IAuthorizationPolicyProvider
{
    private readonly DefaultAuthorizationPolicyProvider _fallback;
    public PermissionPolicyProvider(IOptions<AuthorizationOptions> opts)
        => _fallback = new DefaultAuthorizationPolicyProvider(opts);

    public Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (policyName.StartsWith("perm:", StringComparison.OrdinalIgnoreCase))
        {
            var perm = policyName.Substring(5);
            var policy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .AddRequirements(new PermissionRequirement(perm))
                .Build();
            return Task.FromResult<AuthorizationPolicy?>(policy);
        }
        return _fallback.GetPolicyAsync(policyName);
    }

    public Task<AuthorizationPolicy> GetDefaultPolicyAsync() => _fallback.GetDefaultPolicyAsync();
    public Task<AuthorizationPolicy?> GetFallbackPolicyAsync() => _fallback.GetFallbackPolicyAsync();
}

public class PermissionHandler : AuthorizationHandler<PermissionRequirement>
{
    private readonly IPermissionService _perms;
    private readonly ILogger<PermissionHandler> _log;

    public PermissionHandler(IPermissionService perms, ILogger<PermissionHandler> log)
    {
        _perms = perms;
        _log = log;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext ctx,
        PermissionRequirement req)
    {
        var userIdClaim = ctx.User.FindFirst("user_id")?.Value;
        if (userIdClaim is null || !Guid.TryParse(userIdClaim, out var userId)) return;

        var perms = await _perms.GetUserPermissions(userId);

        // "*" => true all-access (super_admin only).
        if (perms.Contains("*"))
        {
            ctx.Succeed(req);
            return;
        }

        // Explicit grant.
        if (perms.Contains(req.Permission))
        {
            ctx.Succeed(req);
            return;
        }

        // "firm:*" => firm-scoped wildcard (firm_owner / firm_admin): grants
        // everything EXCEPT platform-scoped permissions (codes ending in ".platform").
        if (perms.Contains("firm:*")
            && !req.Permission.EndsWith(".platform", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Succeed(req);
            return;
        }

        // Hierarchical: firm scope satisfies branch scope
        var parts = req.Permission.Split('.');
        if (parts.Length == 4)
        {
            var firmScoped = $"{parts[0]}.{parts[1]}.{parts[2]}.firm";
            if (perms.Contains(firmScoped)) ctx.Succeed(req);
        }
    }
}

public static class PermissionAuthExtensions
{
    public static IServiceCollection AddPermissionAuthorization(this IServiceCollection services)
    {
        services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
        services.AddScoped<IAuthorizationHandler, PermissionHandler>();
        return services;
    }
}
