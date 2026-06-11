using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// ADMIN — Firms Report (platform-wide): active/inactive count, per-firm
// branches + staff + plan expiry + extension info.
// =============================================================================
[ApiController]
[Authorize]
[Route("api/admin/firms-report")]
public class AdminFirmReportController : ControllerBase
{
    private readonly AppDbContext _db;
    public AdminFirmReportController(AppDbContext db) => _db = db;

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    [HttpGet]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Get()
    {
        // ---- Summary by status ----
        int total = 0, active = 0, trial = 0, grace = 0, suspended = 0, cancelled = 0, extended = 0;
        await using (var cmd = await CmdAsync("SELECT status, COUNT(*) AS n FROM platform.firms GROUP BY status"))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                var st = (r["status"] as string ?? "").ToLowerInvariant();
                var n = Convert.ToInt32(r["n"]);
                total += n;
                switch (st)
                {
                    case "active": active += n; break;
                    case "trial": trial += n; break;
                    case "grace_period": grace += n; break;
                    case "suspended": suspended += n; break;
                    case "cancelled": cancelled += n; break;
                }
            }
        }
        await using (var cmd = await CmdAsync("SELECT COUNT(*) FROM platform.firms WHERE reactivated_at IS NOT NULL"))
            extended = Convert.ToInt32(await cmd.ExecuteScalarAsync());

        // ---- Per-firm rows ----
        var firms = new List<object>();
        await using (var cmd = await CmdAsync(
            @"SELECT f.id, f.name, f.city, f.status, p.name AS plan_name,
                     to_char(COALESCE(f.subscription_ends_at, f.trial_ends_at) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS plan_ends,
                     to_char(f.reactivated_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS extended_on,
                     (SELECT COUNT(*) FROM core.branches b WHERE b.firm_id = f.id AND b.is_active) AS branches,
                     (SELECT COUNT(*) FROM hr.employee_profiles e WHERE e.firm_id = f.id AND e.is_active) AS staff,
                     f.wallet_balance
                FROM platform.firms f
                LEFT JOIN platform.subscription_plans p ON p.id = f.plan_id
               ORDER BY f.name"))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                firms.Add(new
                {
                    id = (Guid)r["id"],
                    name = r["name"] as string,
                    city = r["city"] as string,
                    status = r["status"] as string,
                    planName = r["plan_name"] as string,
                    planEnds = r["plan_ends"] as string,
                    extendedOn = r["extended_on"] as string,
                    branches = Convert.ToInt32(r["branches"]),
                    staff = Convert.ToInt32(r["staff"]),
                    walletBalance = r["wallet_balance"] is DBNull ? 0m : Convert.ToDecimal(r["wallet_balance"])
                });
            }
        }

        return Ok(new
        {
            summary = new { total, active, trial, grace, suspended, cancelled, extended },
            firms
        });
    }
}
