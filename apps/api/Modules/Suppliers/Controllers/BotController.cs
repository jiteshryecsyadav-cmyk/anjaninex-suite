using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Suppliers.Controllers;

// =============================================================================
// BOT (WhatsApp) — read-only views for the Suite.
// The bot is a separate Node app writing to the `wa` schema in the SAME DB.
// Here we expose Order List, WA Inbox, Metrics and Status for the Active
// Directory's "Bot" pages. All queries are scoped to the current firm.
// =============================================================================
[ApiController]
[Authorize]
[Route("api/bot")]
public class BotController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpFactory;
    public BotController(AppDbContext db, IHttpClientFactory httpFactory)
    {
        _db = db;
        _httpFactory = httpFactory;
    }

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // Bot ke local image_path -> Suite me dikhane wala URL (bot /uploads serve karta hai).
    private static string? ImageUrl(object? pathObj)
    {
        var p = pathObj as string;
        if (string.IsNullOrEmpty(p)) return null;
        var file = p.Replace('\\', '/').Split('/').Last();
        var baseUrl = Environment.GetEnvironmentVariable("BOT_UPLOADS_URL") ?? "http://localhost:5050/uploads";
        return $"{baseUrl}/{file}";
    }

    // ---- Order list (wa.orders) -------------------------------------------------
    [HttpGet("orders")]
    public async Task<IActionResult> Orders([FromQuery] string? status)
    {
        var sql = @"SELECT order_code, track_code, buyer_phone, buyer_name, supplier_phone,
                           supplier_name, category_name, rate, rate_unit, quantity, amount,
                           image_path, status, commission_pct, commission_amount,
                           to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD""T""HH24:MI:SS') AS created_at
                    FROM wa.orders
                    WHERE firm_id = @firmId" +
                  (string.IsNullOrWhiteSpace(status) ? "" : " AND status = @status") +
                  " ORDER BY created_at DESC LIMIT 300";
        await using var cmd = await CmdAsync(sql);
        cmd.Parameters.Add(new NpgsqlParameter("firmId", CurrentFirmId));
        if (!string.IsNullOrWhiteSpace(status)) cmd.Parameters.Add(new NpgsqlParameter("status", status));

        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                orderCode = r["order_code"] as string,
                trackCode = r["track_code"] as string,
                buyerPhone = r["buyer_phone"] as string,
                buyerName = r["buyer_name"] as string,
                supplierPhone = r["supplier_phone"] as string,
                supplierName = r["supplier_name"] as string,
                categoryName = r["category_name"] as string,
                rate = r["rate"] is DBNull ? (decimal?)null : Convert.ToDecimal(r["rate"]),
                rateUnit = r["rate_unit"] as string,
                quantity = r["quantity"] is DBNull ? (decimal?)null : Convert.ToDecimal(r["quantity"]),
                amount = r["amount"] is DBNull ? (decimal?)null : Convert.ToDecimal(r["amount"]),
                imagePath = r["image_path"] as string,
                imageUrl = ImageUrl(r["image_path"]),
                status = r["status"] as string,
                commissionPct = r["commission_pct"] is DBNull ? (decimal?)null : Convert.ToDecimal(r["commission_pct"]),
                commissionAmount = r["commission_amount"] is DBNull ? (decimal?)null : Convert.ToDecimal(r["commission_amount"]),
                createdAt = r["created_at"] as string
            });
        }
        return Ok(list);
    }

    // ---- Set broker commission on an order -------------------------------------
    public record SetCommissionDto(decimal Pct);

    [HttpPost("orders/{orderCode}/commission")]
    public async Task<IActionResult> SetCommission(string orderCode, [FromBody] SetCommissionDto dto)
    {
        if (dto.Pct < 0 || dto.Pct > 100) return BadRequest(new { error = "Commission % 0-100 ke beech ho." });
        await using var cmd = await CmdAsync(
            @"UPDATE wa.orders
                 SET commission_pct = @pct,
                     commission_amount = ROUND(COALESCE(amount,0) * @pct / 100.0, 2),
                     commission_at = now()
               WHERE firm_id = @firmId AND order_code = @code
              RETURNING commission_amount");
        cmd.Parameters.Add(new NpgsqlParameter("pct", dto.Pct));
        cmd.Parameters.Add(new NpgsqlParameter("firmId", CurrentFirmId));
        cmd.Parameters.Add(new NpgsqlParameter("code", orderCode));
        var amt = await cmd.ExecuteScalarAsync();
        if (amt is null || amt is DBNull) return NotFound(new { error = "Order nahi mila." });
        return Ok(new { commissionAmount = Convert.ToDecimal(amt) });
    }

    // ---- WA Inbox (wa.incoming) -------------------------------------------------
    [HttpGet("inbox")]
    public async Task<IActionResult> Inbox([FromQuery] string? status)
    {
        var sql = @"SELECT from_phone, caption, rate, rate_unit, category_name, track_code,
                           status, model_used, image_path,
                           to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD""T""HH24:MI:SS') AS created_at
                    FROM wa.incoming
                    WHERE firm_id = @firmId" +
                  (string.IsNullOrWhiteSpace(status) || status == "all" ? "" : " AND status = @status") +
                  " ORDER BY created_at DESC LIMIT 300";
        await using var cmd = await CmdAsync(sql);
        cmd.Parameters.Add(new NpgsqlParameter("firmId", CurrentFirmId));
        if (!string.IsNullOrWhiteSpace(status) && status != "all") cmd.Parameters.Add(new NpgsqlParameter("status", status));

        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                fromPhone = r["from_phone"] as string,
                caption = r["caption"] as string,
                rate = r["rate"] is DBNull ? (decimal?)null : Convert.ToDecimal(r["rate"]),
                rateUnit = r["rate_unit"] as string,
                categoryName = r["category_name"] as string,
                trackCode = r["track_code"] as string,
                status = r["status"] as string,
                modelUsed = r["model_used"] as string,
                imagePath = r["image_path"] as string,
                imageUrl = ImageUrl(r["image_path"]),
                createdAt = r["created_at"] as string
            });
        }
        return Ok(list);
    }

    // ---- Metrics ---------------------------------------------------------------
    [HttpGet("metrics")]
    public async Task<IActionResult> Metrics()
    {
        var sql = @"
            SELECT
              (SELECT COUNT(*) FROM wa.incoming WHERE firm_id=@firmId)                              AS photos,
              (SELECT COUNT(*) FROM wa.incoming WHERE firm_id=@firmId AND status='processed')        AS processed,
              (SELECT COUNT(*) FROM wa.incoming WHERE firm_id=@firmId AND status='awaiting_rate')     AS awaiting,
              (SELECT COUNT(*) FROM wa.orders   WHERE firm_id=@firmId)                                AS orders,
              (SELECT COUNT(*) FROM wa.orders   WHERE firm_id=@firmId AND status='pending_supplier')  AS pending,
              (SELECT COUNT(*) FROM wa.orders   WHERE firm_id=@firmId AND status='accepted')          AS accepted,
              (SELECT COALESCE(SUM(commission_amount),0) FROM wa.orders WHERE firm_id=@firmId)        AS commission,
              (SELECT COUNT(*) FROM wa.forwards f JOIN wa.incoming i ON i.id=f.incoming_id
                 WHERE i.firm_id=@firmId)                                                             AS forwards";
        await using var cmd = await CmdAsync(sql);
        cmd.Parameters.Add(new NpgsqlParameter("firmId", CurrentFirmId));
        await using var r = await cmd.ExecuteReaderAsync();
        await r.ReadAsync();
        return Ok(new
        {
            photos    = Convert.ToInt32(r["photos"]),
            processed = Convert.ToInt32(r["processed"]),
            awaiting  = Convert.ToInt32(r["awaiting"]),
            orders    = Convert.ToInt32(r["orders"]),
            pending   = Convert.ToInt32(r["pending"]),
            accepted  = Convert.ToInt32(r["accepted"]),
            commission = Convert.ToDecimal(r["commission"]),
            forwards  = Convert.ToInt32(r["forwards"])
        });
    }

    // ---- Status (bot connected?) ----------------------------------------------
    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        // Last message time se andaaza + bot health endpoint best-effort.
        string? lastSeen = null;
        await using (var cmd = await CmdAsync(
            "SELECT to_char(MAX(created_at) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD\"T\"HH24:MI:SS') AS t FROM wa.incoming WHERE firm_id=@firmId"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("firmId", CurrentFirmId));
            var v = await cmd.ExecuteScalarAsync();
            lastSeen = v as string;
        }

        bool connected = false;
        var url = Environment.GetEnvironmentVariable("BOT_HEALTH_URL") ?? "http://localhost:5050/health";
        try
        {
            var http = _httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(2);
            var resp = await http.GetAsync(url);
            connected = resp.IsSuccessStatusCode;
        }
        catch { connected = false; }

        return Ok(new { connected, lastSeen, healthUrl = url });
    }

    private string BotBase =>
        (Environment.GetEnvironmentVariable("BOT_BASE_URL") ?? "http://localhost:5050").TrimEnd('/');

    // ---- Pairing status (QR / phone-code) — Bot tab me "Pair Device" ke liye ----
    [HttpGet("pair")]
    public async Task<IActionResult> Pair()
    {
        try
        {
            var http = _httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(4);
            var resp = await http.GetAsync($"{BotBase}/pair-status");
            var json = await resp.Content.ReadAsStringAsync();
            return Content(json, "application/json");
        }
        catch
        {
            return Ok(new { connected = false, qr = (string?)null, code = (string?)null, offline = true });
        }
    }

    // ---- Re-link / re-pair device (admin) — bot ko fresh QR/code banane ko bolo ----
    [HttpPost("pair/restart")]
    public async Task<IActionResult> PairRestart()
    {
        try
        {
            var http = _httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(4);
            await http.PostAsync($"{BotBase}/pair-restart", null);
            return Ok(new { ok = true });
        }
        catch
        {
            return StatusCode(503, new { error = "Bot service reachable nahi hai. VPS pe bot chal raha hai?" });
        }
    }
}
