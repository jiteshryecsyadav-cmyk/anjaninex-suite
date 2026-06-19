using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Suppliers.Controllers;

// =============================================================================
// BUYER PRODUCT CATALOG (Phase B) — varieties + rates + photos for BUYERS.
// Mirrors CatalogController (supplier) exactly, but split by catalog_type:
//   'demand' = jo buyer khareedna chahta hai (always shown)
//   'supply' = jo buyer khud banake bechta hai (only when buyer.isSupplier)
// Photos local folder (ContentRoot/uploads/catalog) me save — same folder + serve
// route as the supplier catalog (reuse /api/catalog/photo/{file}).
// CRITICAL: raw connection bypasses EF's TenantConnectionInterceptor, so we MUST
// call TenantContextSetter.ApplyAsync() before every write or RLS (42501) blocks it.
// =============================================================================
public record CreateBuyerVarietyDto(string? CatalogType, Guid? CategoryId, string? CategoryName, string Name, string? DNo);
public record AddBuyerVarietyRateDto(decimal? Rate, string? Unit, decimal? MinQty);

[ApiController]
[Authorize]
[Route("api/buyer-catalog")]
public class BuyerCatalogController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    public BuyerCatalogController(AppDbContext db, IWebHostEnvironment env) { _db = db; _env = env; }

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value ?? throw new InvalidOperationException("firm_id claim missing"));

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        // RLS: raw connection EF interceptor ko bypass karta hai — tenant context set karo
        // warna buyer catalog tables (RLS-protected) par 42501 aayega.
        await Namokara.Api.Common.Db.TenantContextSetter.ApplyAsync(conn, CurrentFirmId, Guid.Empty);
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // Photos same folder as supplier catalog — served by CatalogController's
    // [AllowAnonymous] GET /api/catalog/photo/{file}.
    private string UploadDir
    {
        get
        {
            var dir = Path.Combine(_env.ContentRootPath, "uploads", "catalog");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    private static string NormalizeType(string? t)
        => (t ?? "demand").Trim().ToLowerInvariant() == "supply" ? "supply" : "demand";

    // ---- Get full catalog for a buyer (optionally filtered by catalogType) ----
    [HttpGet("{buyerId:guid}")]
    public async Task<IActionResult> Get(Guid buyerId, [FromQuery] string? catalogType)
    {
        var filterType = !string.IsNullOrWhiteSpace(catalogType);
        var type = NormalizeType(catalogType);

        var varieties = new List<dynamic>();
        await using (var cmd = await CmdAsync(
            @"SELECT id, catalog_type, category_id, category_name, name, d_no
                FROM suppliers.buyer_varieties
               WHERE firm_id=@f AND buyer_id=@b
                 AND (@all OR catalog_type=@t)
               ORDER BY created_at"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            cmd.Parameters.Add(new NpgsqlParameter("b", buyerId));
            cmd.Parameters.Add(new NpgsqlParameter("all", !filterType));
            cmd.Parameters.Add(new NpgsqlParameter("t", type));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                varieties.Add(new {
                    id = (Guid)r["id"],
                    catalogType = (string)r["catalog_type"],
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
            "SELECT id, variety_id, rate, unit, min_qty FROM suppliers.buyer_variety_rates WHERE variety_id = ANY(@ids)"))
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
            "SELECT id, variety_id, url FROM suppliers.buyer_variety_photos WHERE variety_id = ANY(@ids)"))
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
            v.id, v.catalogType, v.categoryId, v.categoryName, v.name, v.dNo,
            rates = rateMap.GetValueOrDefault((Guid)v.id, new List<object>()),
            photos = photoMap.GetValueOrDefault((Guid)v.id, new List<object>())
        });
        return Ok(result);
    }

    [HttpPost("{buyerId:guid}/varieties")]
    public async Task<IActionResult> AddVariety(Guid buyerId, [FromBody] CreateBuyerVarietyDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { error = "Variety naam zaroori hai." });
        await using var cmd = await CmdAsync(
            @"INSERT INTO suppliers.buyer_varieties (firm_id, buyer_id, catalog_type, category_id, category_name, name, d_no)
              VALUES (@f,@b,@ct,@cid,@cn,@n,@d) RETURNING id");
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        cmd.Parameters.Add(new NpgsqlParameter("b", buyerId));
        cmd.Parameters.Add(new NpgsqlParameter("ct", NormalizeType(dto.CatalogType)));
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
            "DELETE FROM suppliers.buyer_varieties WHERE id=@id AND firm_id=@f");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }

    [HttpPost("varieties/{vid:guid}/rates")]
    public async Task<IActionResult> AddRate(Guid vid, [FromBody] AddBuyerVarietyRateDto dto)
    {
        await using var cmd = await CmdAsync(
            @"INSERT INTO suppliers.buyer_variety_rates (variety_id, rate, unit, min_qty)
              SELECT @vid, @r, @u, @m
              WHERE EXISTS (SELECT 1 FROM suppliers.buyer_varieties WHERE id=@vid AND firm_id=@f)
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
            @"DELETE FROM suppliers.buyer_variety_rates vr
              USING suppliers.buyer_varieties v
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
        // SECURITY: sirf image hi allow karo (extension + content-type) — non-image upload block.
        var allowedExt = new[] { ".jpg", ".jpeg", ".png", ".webp" };
        var uext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var ctype = (file.ContentType ?? "").ToLowerInvariant();
        if (!allowedExt.Contains(uext) || !ctype.StartsWith("image/"))
            return BadRequest(new { error = "Sirf image file (JPG/PNG/WEBP) allowed hai." });
        // variety firm ki hai?
        await using (var chk = await CmdAsync("SELECT 1 FROM suppliers.buyer_varieties WHERE id=@v AND firm_id=@f"))
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

        // Reuse supplier catalog's photo-serve route (same uploads/catalog folder).
        var url = $"/api/catalog/photo/{fileName}";
        await using var cmd = await CmdAsync(
            "INSERT INTO suppliers.buyer_variety_photos (variety_id, url) VALUES (@v,@u) RETURNING id");
        cmd.Parameters.Add(new NpgsqlParameter("v", vid));
        cmd.Parameters.Add(new NpgsqlParameter("u", url));
        var id = await cmd.ExecuteScalarAsync();
        return Ok(new { id, url });
    }

    [HttpDelete("photos/{id:guid}")]
    public async Task<IActionResult> DeletePhoto(Guid id)
    {
        await using var cmd = await CmdAsync(
            @"DELETE FROM suppliers.buyer_variety_photos vp
              USING suppliers.buyer_varieties v
              WHERE vp.id=@id AND v.id=vp.variety_id AND v.firm_id=@f");
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        await cmd.ExecuteNonQueryAsync();
        return NoContent();
    }
}
