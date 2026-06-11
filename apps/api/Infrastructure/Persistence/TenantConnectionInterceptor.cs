using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Namokara.Api.Infrastructure.Persistence;

/// <summary>
/// P0-7 fix: sets app.current_firm_id / app.current_branch_id ON THE SAME CONNECTION
/// that the business query will use. Prevents PgBouncer transaction-pool from losing
/// the tenant context between SET and SELECT.
///
/// Replaces the broken TenantContextMiddleware approach (which used per-statement
/// session-local variables that evaporated under pooling).
/// </summary>
public class TenantConnectionInterceptor : DbConnectionInterceptor
{
    private readonly IHttpContextAccessor _http;
    private readonly ILogger<TenantConnectionInterceptor> _log;

    public TenantConnectionInterceptor(IHttpContextAccessor http, ILogger<TenantConnectionInterceptor> log)
    {
        _http = http;
        _log = log;
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await ApplyTenantContextAsync(connection, cancellationToken);
        await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);
    }

    public override void ConnectionOpened(
        DbConnection connection,
        ConnectionEndEventData eventData)
    {
        ApplyTenantContextAsync(connection, default).GetAwaiter().GetResult();
        base.ConnectionOpened(connection, eventData);
    }

    private async Task ApplyTenantContextAsync(DbConnection connection, CancellationToken ct)
    {
        var ctx = _http.HttpContext;
        if (ctx?.User?.Identity?.IsAuthenticated != true) return;

        var firmIdClaim = ctx.User.FindFirst("firm_id")?.Value;
        var branchIdClaim = ctx.User.FindFirst("default_branch_id")?.Value
                          ?? ctx.Request.Headers["X-Branch-Id"].FirstOrDefault();
        // Role claim lowercase 'super_admin' hota hai — case-sensitive match dono cover karo
        var isSuper = ctx.User.IsInRole("super_admin") || ctx.User.IsInRole("SUPER_ADMIN");
        var isPlatformAdmin = isSuper ? "true" : "false";

        // Super admin ki koi firm nahi hoti — phir bhi is_platform_admin SET karna zaroori hai,
        // warna RLS use saare rows se block kar deta hai (admin panel khali dikhta tha).
        if (string.IsNullOrEmpty(firmIdClaim) && !isSuper) return;

        // Use set_config with `false` (session-level, not transaction-local)
        // so the value persists across multiple queries on the same connection.
        // Then EF Core/Npgsql resets the connection back to the pool, which clears
        // session settings via DISCARD ALL — so leakage between requests is prevented.
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT set_config('app.current_firm_id', @firm_id, false),
                   set_config('app.current_branch_id', @branch_id, false),
                   set_config('app.is_platform_admin', @is_admin, false);";

        AddParam(cmd, "@firm_id", firmIdClaim ?? "");
        AddParam(cmd, "@branch_id", branchIdClaim ?? "");
        AddParam(cmd, "@is_admin", isPlatformAdmin);

        await cmd.ExecuteNonQueryAsync(ct);
        _log.LogDebug("Tenant context set: firm={Firm} branch={Branch}", firmIdClaim, branchIdClaim);
    }

    private static void AddParam(DbCommand cmd, string name, string value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        cmd.Parameters.Add(p);
    }
}
