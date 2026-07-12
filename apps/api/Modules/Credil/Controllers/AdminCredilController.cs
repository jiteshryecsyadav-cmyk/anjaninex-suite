using System.Data;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Credil.Controllers;

// CREDIL — Anjaninex platform admin: request queue, approve (snapshot + deliver + notify),
// reject, rate-card config, per-firm ON/OFF toggle, manual score refresh.
public record CredilReviewDto(string? Note);
public record CredilConfigDto(decimal FullReportPrice, decimal PerComponentPrice, int MinFirms, int MinDataPoints);
public record CredilToggleDto(bool Enabled);

[ApiController]
[Route("api/admin/credil")]
[Authorize]
public class AdminCredilController : ControllerBase
{
    private readonly AppDbContext _db;
    public AdminCredilController(AppDbContext db) => _db = db;

    private Guid? CurrentUserId => Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;

    private static readonly Dictionary<string, string> CompLabels = new()
    {
        ["pay"] = "Payment Score",
        ["default"] = "Default Risk Score",
        ["trade"] = "Trade / Returns Score",
        ["volume"] = "Volume & Tenure Score"
    };

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    private static string Band(int score) =>
        score >= 750 ? "Excellent" : score >= 650 ? "Good" : score >= 550 ? "Fair" : "Poor";

    // ---- Queue ----
    [HttpGet("requests")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Requests([FromQuery] string? status = null)
    {
        var list = new List<object>();
        var sql = @"SELECT rr.id, rr.target_gst, rr.components, rr.amount, rr.status, rr.paid,
                           rr.otp_verified, rr.created_at, rr.reviewed_at, rr.review_note, rr.payment_ref,
                           f.name AS firm_name
                    FROM credil.report_requests rr
                    JOIN platform.firms f ON f.id = rr.requesting_firm_id
                    " + (string.IsNullOrWhiteSpace(status)
                        ? "WHERE rr.status IN ('paid','approved','delivered','rejected')"
                        : "WHERE rr.status = @st") + @"
                    ORDER BY (rr.status = 'paid') DESC, rr.created_at DESC
                    LIMIT 200";
        await using var cmd = await CmdAsync(sql);
        if (!string.IsNullOrWhiteSpace(status)) cmd.Parameters.Add(new NpgsqlParameter("st", status));
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = (Guid)r["id"],
                firmName = r["firm_name"] as string,
                targetGst = r["target_gst"] as string,
                components = JsonSerializer.Deserialize<string[]>(r["components"]?.ToString() ?? "[]"),
                amount = Convert.ToDecimal(r["amount"]),
                status = r["status"] as string,
                paid = r["paid"] is bool p && p,
                otpVerified = r["otp_verified"] is bool o && o,
                paymentRef = r["payment_ref"] as string,
                createdAt = Convert.ToDateTime(r["created_at"]),
                reviewedAt = r["reviewed_at"] as DateTime?,
                reviewNote = r["review_note"] as string
            });
        }
        return Ok(list);
    }

    // Build report snapshot from credil.scores (purchased components only).
    private async Task<string?> BuildReportJson(string gst, string[] comps)
    {
        await using var cmd = await CmdAsync(
            @"SELECT entity_type, total_score, pay_score, default_score, trade_score, volume_score,
                     red_flags, narrative, data_points, firms_count, computed_at
              FROM credil.scores WHERE party_gst = @g");
        cmd.Parameters.Add(new NpgsqlParameter("g", gst));
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        int total = r["total_score"] is DBNull ? 0 : Convert.ToInt32(r["total_score"]);
        var subs = new Dictionary<string, int>
        {
            ["pay"] = r["pay_score"] is DBNull ? 0 : Convert.ToInt32(r["pay_score"]),
            ["default"] = r["default_score"] is DBNull ? 0 : Convert.ToInt32(r["default_score"]),
            ["trade"] = r["trade_score"] is DBNull ? 0 : Convert.ToInt32(r["trade_score"]),
            ["volume"] = r["volume_score"] is DBNull ? 0 : Convert.ToInt32(r["volume_score"]),
        };
        var components = comps.Where(c => CompLabels.ContainsKey(c)).Select(c => new
        {
            key = c,
            label = CompLabels[c],
            score = subs.TryGetValue(c, out var s) ? s : 0
        }).ToList();

        var redFlagsRaw = r["red_flags"]?.ToString() ?? "[]";
        object[] redFlags;
        try { redFlags = JsonSerializer.Deserialize<object[]>(redFlagsRaw) ?? Array.Empty<object>(); }
        catch { redFlags = Array.Empty<object>(); }

        var report = new
        {
            gst,
            entityType = r["entity_type"] as string ?? "buyer",
            totalScore = total,
            band = Band(total),
            components,
            redFlags,
            narrative = r["narrative"] as string,
            dataPoints = r["data_points"] is DBNull ? 0 : Convert.ToInt32(r["data_points"]),
            firmsCount = r["firms_count"] is DBNull ? 0 : Convert.ToInt32(r["firms_count"]),
            computedAt = r["computed_at"] is DBNull ? (DateTime?)null : Convert.ToDateTime(r["computed_at"]),
            generatedAt = DateTime.UtcNow
        };
        return JsonSerializer.Serialize(report);
    }

    // ---- Approve -> snapshot + deliver + firm ko bell notification ----
    [HttpPost("requests/{id}/approve")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Approve(Guid id)
    {
        // Load request.
        Guid firmId; string gst = ""; string[] comps = Array.Empty<string>(); string status = "";
        await using (var cmd = await CmdAsync(
            "SELECT requesting_firm_id, target_gst, components, status FROM credil.report_requests WHERE id = @id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync()) return NotFound(new { error = "Request nahi mila." });
            firmId = (Guid)r["requesting_firm_id"];
            gst = r["target_gst"] as string ?? "";
            comps = JsonSerializer.Deserialize<string[]>(r["components"]?.ToString() ?? "[]") ?? Array.Empty<string>();
            status = r["status"] as string ?? "";
        }
        if (status is "delivered") return Ok(new { success = true, already = true });
        if (status is not ("paid" or "approved"))
            return BadRequest(new { error = "Sirf paid request approve ho sakti hai." });

        var reportJson = await BuildReportJson(gst, comps);
        if (reportJson == null)
            return BadRequest(new { error = "Is GST ka koi CREDIL score nahi mila. Pehle score refresh karein / data insufficient hai." });

        await using (var cmd = await CmdAsync(
            @"UPDATE credil.report_requests
              SET status = 'delivered', report_json = @rj::jsonb, reviewed_by = @uid, reviewed_at = now()
              WHERE id = @id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("rj", reportJson) { NpgsqlDbType = NpgsqlDbType.Jsonb });
            cmd.Parameters.Add(new NpgsqlParameter("uid", (object?)CurrentUserId ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            await cmd.ExecuteNonQueryAsync();
        }

        // Firm ko bell notification.
        await using (var cmd = await CmdAsync(
            @"INSERT INTO platform.notifications (firm_id, type, severity, title, body, cta_label, cta_url)
              VALUES (@f, 'credil_ready', 'info', 'CREDIL report ready',
                      @body, 'View Report', '/credil')"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
            cmd.Parameters.Add(new NpgsqlParameter("body", $"GST {gst} ki CREDIL report taiyaar hai. Ab download kar sakte hain."));
            await cmd.ExecuteNonQueryAsync();
        }

        return Ok(new { success = true });
    }

    [HttpPost("requests/{id}/reject")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] CredilReviewDto dto)
    {
        Guid firmId; string gst = "";
        await using (var cmd = await CmdAsync(
            "SELECT requesting_firm_id, target_gst FROM credil.report_requests WHERE id = @id AND status IN ('paid','approved')"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync()) return BadRequest(new { error = "Request reject nahi ho sakta." });
            firmId = (Guid)r["requesting_firm_id"]; gst = r["target_gst"] as string ?? "";
        }
        await using (var cmd = await CmdAsync(
            @"UPDATE credil.report_requests SET status = 'rejected', review_note = @note,
              reviewed_by = @uid, reviewed_at = now() WHERE id = @id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("note", (object?)dto.Note ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("uid", (object?)CurrentUserId ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            await cmd.ExecuteNonQueryAsync();
        }
        await using (var cmd = await CmdAsync(
            @"INSERT INTO platform.notifications (firm_id, type, severity, title, body, cta_label, cta_url)
              VALUES (@f, 'credil_rejected', 'warning', 'CREDIL request rejected', @body, 'Details', '/credil')"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
            cmd.Parameters.Add(new NpgsqlParameter("body", $"GST {gst} ki CREDIL request reject hui. " + (dto.Note ?? "")));
            await cmd.ExecuteNonQueryAsync();
        }
        return Ok(new { success = true });
    }

    // ---- Rate card config ----
    [HttpGet("config")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> GetConfig()
    {
        await using var cmd = await CmdAsync(
            "SELECT full_report_price, per_component_price, min_firms, min_data_points FROM credil.config WHERE id = 1");
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return Ok(new { fullReportPrice = 500m, perComponentPrice = 150m, minFirms = 2, minDataPoints = 5 });
        return Ok(new
        {
            fullReportPrice = Convert.ToDecimal(r["full_report_price"]),
            perComponentPrice = Convert.ToDecimal(r["per_component_price"]),
            minFirms = Convert.ToInt32(r["min_firms"]),
            minDataPoints = Convert.ToInt32(r["min_data_points"])
        });
    }

    [HttpPut("config")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> SaveConfig([FromBody] CredilConfigDto dto)
    {
        await using (var ins = await CmdAsync("INSERT INTO credil.config (id) VALUES (1) ON CONFLICT (id) DO NOTHING"))
            await ins.ExecuteNonQueryAsync();
        await using var cmd = await CmdAsync(
            @"UPDATE credil.config SET full_report_price = @fp, per_component_price = @pc,
              min_firms = @mf, min_data_points = @mp, updated_at = now() WHERE id = 1");
        cmd.Parameters.Add(new NpgsqlParameter("fp", dto.FullReportPrice));
        cmd.Parameters.Add(new NpgsqlParameter("pc", dto.PerComponentPrice));
        cmd.Parameters.Add(new NpgsqlParameter("mf", dto.MinFirms));
        cmd.Parameters.Add(new NpgsqlParameter("mp", dto.MinDataPoints));
        await cmd.ExecuteNonQueryAsync();
        return await GetConfig();
    }

    // ---- Per-firm ON/OFF ----
    [HttpGet("firms")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Firms()
    {
        var list = new List<object>();
        await using var cmd = await CmdAsync(
            "SELECT id, name, COALESCE(credil_enabled,false) AS en FROM platform.firms ORDER BY name");
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new { firmId = (Guid)r["id"], firmName = r["name"] as string, enabled = r["en"] is bool b && b });
        return Ok(list);
    }

    [HttpPut("firms/{firmId}")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> ToggleFirm(Guid firmId, [FromBody] CredilToggleDto dto)
    {
        await using var cmd = await CmdAsync("UPDATE platform.firms SET credil_enabled = @en WHERE id = @f");
        cmd.Parameters.Add(new NpgsqlParameter("en", dto.Enabled));
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        await cmd.ExecuteNonQueryAsync();
        return Ok(new { success = true, enabled = dto.Enabled });
    }

    // ---- Manual score refresh (nightly cron ka manual trigger) ----
    [HttpPost("refresh")]
    [HasPermission("platform.firm.edit.platform")]
    public async Task<IActionResult> Refresh()
    {
        await using var cmd = await CmdAsync("SELECT credil.refresh_scores()");
        var n = Convert.ToInt32(await cmd.ExecuteScalarAsync() ?? 0);
        return Ok(new { success = true, scored = n });
    }
}
