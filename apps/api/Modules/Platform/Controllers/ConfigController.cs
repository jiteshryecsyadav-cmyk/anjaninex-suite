using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// Firm-facing runtime config. Live Map provider + its browser key (referrer-restricted).
//   provider: osm (no key) | google (maps_key) | ola (maps_ola_key)
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
        cmd.CommandText = @"SELECT COALESCE(maps_provider, 'osm') AS provider, maps_key, maps_ola_key
                            FROM platform.billing_settings WHERE id = 1";
        await using var r = await cmd.ExecuteReaderAsync();
        string provider = "osm"; string? gKey = null, oKey = null;
        if (await r.ReadAsync())
        {
            provider = (r["provider"] as string) ?? "osm";
            gKey = r["maps_key"] as string;
            oKey = r["maps_ola_key"] as string;
        }
        string? key = provider == "google" ? gKey : provider == "ola" ? oKey : null;
        return Ok(new { provider, key = string.IsNullOrWhiteSpace(key) ? null : key });
    }
}
