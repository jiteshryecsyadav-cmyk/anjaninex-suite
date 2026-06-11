using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Common.Middleware;

/// <summary>
/// Reads JWT claims, sets PostgreSQL session variables for RLS:
///   app.current_firm_id, app.current_user_id, app.current_branch_id
/// </summary>
public class TenantContextMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TenantContextMiddleware> _log;

    public TenantContextMiddleware(RequestDelegate next, ILogger<TenantContextMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task InvokeAsync(HttpContext ctx, AppDbContext db)
    {
        var firmId = ctx.User?.FindFirst("firm_id")?.Value;
        var userId = ctx.User?.FindFirst("user_id")?.Value;
        var branchId = ctx.Request.Headers["X-Branch-Id"].FirstOrDefault()
                    ?? ctx.User?.FindFirst("default_branch_id")?.Value;

        if (ctx.User?.Identity?.IsAuthenticated == true)
        {
            try
            {
                if (!string.IsNullOrEmpty(firmId))
                    await db.Database.ExecuteSqlRawAsync(
                        "SELECT set_config('app.current_firm_id', {0}, true)", firmId);

                if (!string.IsNullOrEmpty(userId))
                    await db.Database.ExecuteSqlRawAsync(
                        "SELECT set_config('app.current_user_id', {0}, true)", userId);

                if (!string.IsNullOrEmpty(branchId))
                    await db.Database.ExecuteSqlRawAsync(
                        "SELECT set_config('app.current_branch_id', {0}, true)", branchId);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Failed to set tenant context");
            }
        }

        await _next(ctx);
    }
}
