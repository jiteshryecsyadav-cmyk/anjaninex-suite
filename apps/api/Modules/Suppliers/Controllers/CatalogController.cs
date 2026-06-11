using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Suppliers.Controllers;

// =============================================================================
// SUPPLIER PRODUCT CATALOG — varieties + rates + photos (sample jaisa).
// Photos local folder (ContentRoot/uploads/catalog) me save, GET se serve.
// =============================================================================
public record CreateVarietyDto(Guid? CategoryId, string? CategoryName, string Name, string? DNo);
public record AddVarietyRateDto(decimal? Rate, string? Unit, decimal? MinQty);

[ApiController]
[Authorize]
[Route("api/catalog")]
public class CatalogController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    public CatalogController(AppDbContext db, IWebHostEnvironment env) { _db = db; _env = env; }

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value ?? throw new InvalidOperationException("firm_id claim missing"));

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }
    private string UploadDir
    {
        get
        {
            var dir = Path.Combine(_env.ContentRootPath, "uploads", "catalog");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    // ---- Get full catalog for a supplier ----
    [HttpGet("{supplierId:guid}")]
    public async Task<IActionResult> Get(Guid supplierId)
    {
        var varieties = new List<dynamic>();
        await using (var cmd = await CmdAsync(
            @"SELECT id, category_id, category_name, name, d_no
                FROM suppliers.varieties WHERE firm_id=@f AND supplier_id=@s ORDER BY created_at"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            cmd.Parameters.Add(new NpgsqlParameter("s", supplierId));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                varieties.Add(new {
                    id = (Guid)r["id"],
                    categoryId = r["category_id"] is DBNull ? (Guid?)null : (Guid)r["category_id"],
                    categoryName = r["category_name"] as string,
                    name = (string)r["name"],
                    dNo = r["d_no"] as string,
                    rates = new List<object>(),
                    photos = new List<object>()
                });
        }
        if (varieties.Count == 0) return Ok(varieties);

        var ids = varieties.Select(v => (Guid)v.id).ToList();
        var rateMap = new Dictionary<Guid, List<object>>();
        var photoMap = new Dictionary<Guid, List<object>>();

        await using (var cmd = await CmdAsync(
            "SELECT id, variety_id, rate, unit, min_qty FROM suppliers.variety_rates WHERE variety_id = ANY(@ids)"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("ids", ids));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var vid = (Guid)r["variety_id"];
                if (!rateMap.TryGetValue(vid, out var l)) { l = new(); rateMap[vid] = l; }
                l.Add(new {
                    id = (Guid)r["id"],
                    rate = r["rate"] is DBNull ? (decimal?)null : Convert.ToDecimal(r["rate"]),
                    unit = r["unit"] as string,
                    minQty = r["min_qty"] is DBNull ? (decimal?)null : Convert.ToDecimal(r["min_qty"])
                });
            }
        }
        await using (var cmd = await CmdAsync(
            "SELECT id, variety_id, url FROM suppliers.variety_photos WHERE variety_id = ANY(@ids)"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("ids", ids));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var vid = (Guid)r["variety_id"];
                if (!photoMap.TryGetValue(vid, out var l)) { l = new(); photoMap[vid] = l; }
                l.Add(new { id = (Guid)r["id"], url = (string)r["url"] });
            }
        }

        var result = varieties.Select(v => new {
            v.id, v.categoryId, v.categoryName, v.name, v.dNo,
            rates = rateMap.GetValueOrDefault((Guid)v.id, new List<object>()),
            photos = photoMap.GetValueOrDefault((Guid)v.id, new List<object>())
        });
        return Ok(result);
    }

    [HttpPost("{supplierId:guid}/varieties")]
    public async Task<IActionResult> AddVariety(Guid supplierId, [FromBody] CreateVarietyDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { error = "Variety naam zaroori hai." });
        await using var cmd = await CmdAsync(
            @"INSERT INTO suppliers.varieties (firm_id, supplier_id, category_id, category_name, name, d_no)
              VALUES (@f,@s,@cid,@cn,@n,@d) RETURNING id");
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        cmd.Parameters.Add(new NpgsqlParameter("s", supplierId));
        cmd.Parameters.Add(new NpgsqlParameter("cid", (object?)dto.CategoryId ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("cn", (object?)dto.CategoryName ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("n", dto.Name.Trim()));
        cmd.Parameters.Add(new NpgsqlParameter("d", (object?)dto.DNo ?? DBNull.Value));
        var id = await cmd.ExecuteScalarAsync();
        return Ok(new { id });
    }

    [HttpDelete("varieties/{id:guid}")]
    public async Task<IActionResult> DeleteVariety(Guid id)
    {
        await using var cmd = await CmdAsync(
            "DELETE FROM suppliers.varieties WHERE id=@id AND firm_id=@f");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }

    [HttpPost("varieties/{vid:guid}/rates")]
    public async Task<IActionResult> AddRate(Guid vid, [FromBody] AddVarietyRateDto dto)
    {
        await using var cmd = await CmdAsync(
            @"INSERT INTO suppliers.variety_rates (variety_id, rate, unit, min_qty)
              SELECT @vid, @r, @u, @m
              WHERE EXISTS (SELECT 1 FROM suppliers.varieties WHERE id=@vid AND firm_id=@f)
              RETURNING id");
        cmd.Parameters.Add(new NpgsqlParameter("vid", vid));
        cmd.Parameters.Add(new NpgsqlParameter("r", (object?)dto.Rate ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("u", (object?)(dto.Unit ?? "mtr")));
        cmd.Parameters.Add(new NpgsqlParameter("m", (object?)dto.MinQty ?? DBNull.Value));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        var id = await cmd.ExecuteScalarAsync();
        if (id is null) return NotFound(new { error = "Variety nahi mili." });
        return Ok(new { id });
    }

    [HttpDelete("rates/{id:guid}")]
    public async Task<IActionResult> DeleteRate(Guid id)
    {
        await using var cmd = await CmdAsync(
            @"DELETE FROM suppliers.variety_rates vr
              USING suppliers.varieties v
              WHERE vr.id=@id AND v.id=vr.variety_id AND v.firm_id=@f");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }

    // ---- Photo upload (multipart) ----
    [HttpPost("varieties/{vid:guid}/photo")]
    [RequestSizeLimit(15_000_000)]
    public async Task<IActionResult> UploadPhoto(Guid vid, IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest(new { error = "File nahi mili." });
        // variety firm ki hai?
        await using (var chk = await CmdAsync("SELECT 1 FROM suppliers.varieties WHERE id=@v AND firm_id=@f"))
        {
            chk.Parameters.Add(new NpgsqlParameter("v", vid));
            chk.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            if (await chk.ExecuteScalarAsync() is null) return NotFound(new { error = "Variety nahi mili." });
        }

        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrEmpty(ext)) ext = ".jpg";
        var fileName = $"{vid}-{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(UploadDir, fileName);
        await using (var fs = System.IO.File.Create(fullPath))
            await file.CopyToAsync(fs);

        var url = $"/api/catalog/photo/{fileName}";
        await using var cmd = await CmdAsync(
            "INSERT INTO suppliers.variety_photos (variety_id, url) VALUES (@v,@u) RETURNING id");
        cmd.Parameters.Add(new NpgsqlParameter("v", vid));
        cmd.Parameters.Add(new NpgsqlParameter("u", url));
        var id = await cmd.ExecuteScalarAsync();
        return Ok(new { id, url });
    }

    [HttpDelete("photos/{id:guid}")]
    public async Task<IActionResult> DeletePhoto(Guid id)
    {
        await using var cmd = await CmdAsync(
            @"DELETE FROM suppliers.variety_photos vp
              USING suppliers.varieties v
              WHERE vp.id=@id AND v.id=vp.variety_id AND v.firm_id=@f");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }

    // ---- Serve uploaded photo ----
    [AllowAnonymous]
    [HttpGet("photo/{file}")]
    public IActionResult Photo(string file)
    {
        var safe = Path.GetFileName(file);   // path traversal se bachao
        var path = Path.Combine(UploadDir, safe);
        if (!System.IO.File.Exists(path)) return NotFound();
        var ct = safe.EndsWith(".png") ? "image/png" : safe.EndsWith(".webp") ? "image/webp" : "image/jpeg";
        return PhysicalFile(path, ct);
    }
}
