using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// Activity Log — firm ke andar kisne kya banaya / edit kiya / delete kiya
[ApiController]
[Route("api/audit")]
[Authorize]
public class AuditController : ControllerBase
{
    private readonly AppDbContext _db;
    public AuditController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    [HttpGet("logs")]
    public async Task<IActionResult> Logs(
        [FromQuery] string? module, [FromQuery] string? action,
        [FromQuery] string? search, [FromQuery] string? from, [FromQuery] string? to,
        [FromQuery] int limit = 300)
    {
        var firmId = CurrentFirmId;
        var ist = TimeSpan.FromMinutes(330);
        var q = _db.AuditLogs.AsNoTracking().Where(a => a.FirmId == firmId);

        if (!string.IsNullOrEmpty(module)) q = q.Where(a => a.Module == module);
        if (!string.IsNullOrEmpty(action)) q = q.Where(a => a.Action == action);
        if (!string.IsNullOrEmpty(search))
            q = q.Where(a => (a.EntityLabel ?? "").Contains(search) || a.TableName.Contains(search));
        // Date range (IST calendar dates → UTC-aware DateTimeOffset bounds)
        if (DateTime.TryParse(from, out var fd))
        { var f = new DateTimeOffset(fd.Date, ist); q = q.Where(a => a.CreatedAt >= f); }
        if (DateTime.TryParse(to, out var td))
        { var t = new DateTimeOffset(td.Date, ist).AddDays(1); q = q.Where(a => a.CreatedAt < t); }

        var rows = await q.OrderByDescending(a => a.CreatedAt)
            .Take(Math.Clamp(limit, 1, 1000))
            .ToListAsync();

        var userIds = rows.Where(r => r.UserId.HasValue).Select(r => r.UserId!.Value).Distinct().ToList();
        var users = await _db.Users.AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => new { u.FullName, u.Username });

        return Ok(rows.Select(r => new
        {
            date = r.CreatedAt.ToOffset(ist).ToString("dd-MM-yyyy"),
            time = r.CreatedAt.ToOffset(ist).ToString("HH:mm:ss"),
            user = r.UserId.HasValue && users.TryGetValue(r.UserId.Value, out var n) ? n.FullName : "—",
            username = r.UserId.HasValue && users.TryGetValue(r.UserId.Value, out var n2) ? n2.Username : "",
            module = r.Module,
            table = r.TableName,
            label = r.EntityLabel,
            action = r.Action,
            changes = r.Changes
        }));
    }
}
