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
        [FromQuery] string? search, [FromQuery] int limit = 300)
    {
        var firmId = CurrentFirmId;
        var q = _db.AuditLogs.AsNoTracking().Where(a => a.FirmId == firmId);

        if (!string.IsNullOrEmpty(module)) q = q.Where(a => a.Module == module);
        if (!string.IsNullOrEmpty(action)) q = q.Where(a => a.Action == action);
        if (!string.IsNullOrEmpty(search))
            q = q.Where(a => (a.EntityLabel ?? "").Contains(search) || a.TableName.Contains(search));

        var rows = await q.OrderByDescending(a => a.CreatedAt)
            .Take(Math.Clamp(limit, 1, 1000))
            .ToListAsync();

        var userIds = rows.Where(r => r.UserId.HasValue).Select(r => r.UserId!.Value).Distinct().ToList();
        var users = await _db.Users.AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        var ist = TimeSpan.FromMinutes(330);
        return Ok(rows.Select(r => new
        {
            date = r.CreatedAt.ToOffset(ist).ToString("dd-MM-yyyy"),
            time = r.CreatedAt.ToOffset(ist).ToString("HH:mm:ss"),
            user = r.UserId.HasValue && users.TryGetValue(r.UserId.Value, out var n) ? n : "—",
            module = r.Module,
            table = r.TableName,
            label = r.EntityLabel,
            action = r.Action,
            changes = r.Changes
        }));
    }
}
