using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// Firm-facing runtime config. Central Google Maps key (referrer-restricted browser key)
// is exposed to any logged-in firm user so the Live Map can load Google Maps JS.
[ApiController]
[Route("api/config")]
[Authorize]
public class ConfigController : ControllerBase
{
    private readonly AppDbContext _db;
    public ConfigController(AppDbContext db) => _db = db;

    [HttpGet("maps-key")]
    public async Task<IActionResult> MapsKey()
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT maps_key FROM platform.billing_settings WHERE id = 1";
        var v = await cmd.ExecuteScalarAsync();
        var key = v as string;
        return Ok(new { key = string.IsNullOrWhiteSpace(key) ? null : key });
    }
}
