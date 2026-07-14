using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Services;
using System.Data;
using System.Text.Json;
using Npgsql;

namespace Namokara.Api.Modules.Platform.Controllers;

/// <summary>
/// Endpoints that return the current user/firm's view of themselves — modules, limits, usage.
/// Used by the frontend on app startup to drive feature flags.
/// </summary>
[Authorize]
[ApiController]
[Route("api/me")]
public class MeController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPermissionService _perms;
    public MeController(AppDbContext db, IPermissionService perms) { _db = db; _perms = perms; }

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    // =========================================================================
    // SELF-SERVICE: apna profile, password, sessions (super admin bhi — firm zaroori nahi)
    // =========================================================================
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        var u = await _db.Users.AsNoTracking()
            .Where(x => x.Id == CurrentUserId)
            .Select(x => new { x.FullName, x.Email, x.Phone, x.Username })
            .FirstOrDefaultAsync();
        return u == null ? NotFound() : Ok(u);
    }

    public record UpdateProfileDto(string FullName, string? Email, string? Phone);

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.FullName))
            return BadRequest(new { error = "Naam khali nahi ho sakta." });

        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == CurrentUserId);
        if (u == null) return NotFound();
        u.FullName = dto.FullName.Trim();
        u.Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
        u.Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim();
        u.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    public record ChangePasswordDto(string CurrentPassword, string NewPassword);

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 6)
            return BadRequest(new { error = "Naya password kam se kam 6 character ka ho." });

        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == CurrentUserId);
        if (u == null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword ?? "", u.PasswordHash))
            return BadRequest(new { error = "Abhi wala password galat hai." });

        u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        u.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    [HttpGet("sessions")]
    public async Task<IActionResult> MySessions()
    {
        var rows = await _db.Sessions.AsNoTracking()
            .Where(s => s.UserId == CurrentUserId)
            .OrderByDescending(s => s.LastSeenAt)
            .Take(20)
            .Select(s => new
            {
                s.Id,
                ip = s.IpAddress,
                device = s.UserAgent,
                lastSeenAt = s.LastSeenAt,
                expiresAt = s.ExpiresAt,
                revoked = s.RevokedAt != null
            })
            .ToListAsync();
        return Ok(rows);
    }

    // ---- Notifications (bell) ----
    [HttpGet("notifications")]
    public async Task<IActionResult> Notifications([FromQuery] int limit = 20)
    {
        var results = new List<object>();
        var perms = await _perms.GetUserPermissions(CurrentUserId);
        // Super admin / payment-approver: pending manual payment approvals ko live notifications dikhao.
        var isPlatformAdmin = perms.Contains("*") || perms.Any(p => p.EndsWith(".platform", System.StringComparison.OrdinalIgnoreCase));
        if (isPlatformAdmin)
        {
            var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
            if (conn.State != ConnectionState.Open) await conn.OpenAsync();

            // NOTE: Npgsql ek connection par ek waqt me EK hi command chalne deta hai —
            // isliye har reader ko apne { } block me band karna zaroori hai (warna
            // "A command is already in progress" exception -> bell 400 deta tha).
            await using (var pcmd = conn.CreateCommand())
            {
                pcmd.CommandText = @"SELECT pr.id, pr.amount, pr.method, f.name AS firm_name, pr.created_at
                                     FROM platform.payment_requests pr
                                     JOIN platform.firms f ON f.id = pr.firm_id
                                     WHERE pr.status = 'pending'
                                     ORDER BY pr.created_at DESC
                                     LIMIT 50";
                await using var prr = await pcmd.ExecuteReaderAsync();
                while (await prr.ReadAsync())
                {
                    var amt = Convert.ToDecimal(prr["amount"]);
                    results.Add(new
                    {
                        id = (Guid)prr["id"],
                        type = "payment_pending",
                        severity = "warning",
                        title = "Payment approval pending",
                        body = $"{prr["firm_name"]} - Rs {amt:0} ({prr["method"]})",
                        ctaLabel = "Review",
                        ctaUrl = "/admin/billing",
                        read = false,
                        createdAt = Convert.ToDateTime(prr["created_at"])
                    });
                }
            }

            // CREDIL: paid report requests awaiting admin approval.
            await using (var ccmd = conn.CreateCommand())
            {
                ccmd.CommandText = @"SELECT rr.id, rr.target_gst, rr.amount, f.name AS firm_name, rr.created_at
                                     FROM credil.report_requests rr
                                     JOIN platform.firms f ON f.id = rr.requesting_firm_id
                                     WHERE rr.status = 'paid'
                                     ORDER BY rr.created_at DESC LIMIT 50";
                await using var crr = await ccmd.ExecuteReaderAsync();
                while (await crr.ReadAsync())
                {
                    var amt = Convert.ToDecimal(crr["amount"]);
                    results.Add(new
                    {
                        id = (Guid)crr["id"],
                        type = "credil_pending",
                        severity = "warning",
                        title = "CREDIL report approval pending",
                        body = $"{crr["firm_name"]} - GST {crr["target_gst"]} (Rs {amt:0})",
                        ctaLabel = "Review",
                        ctaUrl = "/admin/credil",
                        read = false,
                        createdAt = Convert.ToDateTime(crr["created_at"])
                    });
                }
            }

            // COMPLAINTS: user ke unread messages -> sadmin ke bell me blink.
            // Thread kholte hi read ho jaate hain, to notification apne aap chali jaati hai.
            await using (var compCmd = conn.CreateCommand())
            {
                compCmd.CommandText = @"SELECT c.id, c.subject, f.name AS firm_name,
                                               count(m.id) AS unread, max(m.created_at) AS last_at
                                        FROM platform.complaints c
                                        JOIN platform.firms f ON f.id = c.firm_id
                                        JOIN platform.complaint_messages m
                                             ON m.complaint_id = c.id AND m.sender = 'user' AND m.read_at IS NULL
                                        GROUP BY c.id, c.subject, f.name
                                        ORDER BY last_at DESC LIMIT 50";
                await using var cor = await compCmd.ExecuteReaderAsync();
                while (await cor.ReadAsync())
                {
                    var unread = Convert.ToInt32(cor["unread"]);
                    results.Add(new
                    {
                        id = (Guid)cor["id"],
                        type = "complaint_new",
                        severity = "warning",
                        title = "📢 Nayi complaint aayi hai",
                        body = $"{cor["firm_name"]} - {cor["subject"]} ({unread} naya message)",
                        ctaLabel = "Kholo",
                        ctaUrl = "/admin/complaints",
                        read = false,
                        createdAt = Convert.ToDateTime(cor["last_at"])
                    });
                }
            }
        }

        // Firm ki apni notifications (agar firm_id ho).
        var firmClaim = User.FindFirst("firm_id")?.Value;
        if (firmClaim != null)
        {
            var firmId = Guid.Parse(firmClaim);
            var uid = CurrentUserId;
            var rows = await _db.Notifications.AsNoTracking()
                .Where(n => n.FirmId == firmId
                         && (n.UserId == null || n.UserId == uid)
                         && (n.ExpiresAt == null || n.ExpiresAt > DateTimeOffset.UtcNow))
                .OrderByDescending(n => n.CreatedAt)
                .Take(Math.Clamp(limit, 1, 50))
                .Select(n => new
                {
                    id = n.Id, type = n.Type, severity = n.Severity, title = n.Title, body = n.Body,
                    ctaLabel = n.CtaLabel, ctaUrl = n.CtaUrl,
                    read = n.ReadAt != null, createdAt = n.CreatedAt
                })
                .ToListAsync();
            results.AddRange(rows);
        }

        return Ok(results);
    }

    [HttpPost("notifications/read-all")]
    public async Task<IActionResult> MarkAllNotificationsRead()
    {
        var firmClaim = User.FindFirst("firm_id")?.Value;
        if (firmClaim == null) return Ok(new { read = 0 });

        var firmId = Guid.Parse(firmClaim);
        var uid = CurrentUserId;
        var rows = await _db.Notifications
            .Where(n => n.FirmId == firmId && (n.UserId == null || n.UserId == uid) && n.ReadAt == null)
            .ToListAsync();
        foreach (var n in rows) n.ReadAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { read = rows.Count });
    }

    [HttpPost("sessions/revoke-others")]
    public async Task<IActionResult> RevokeOtherSessions()
    {
        var currentSession = Guid.TryParse(User.FindFirst("session_id")?.Value, out var sid) ? sid : Guid.Empty;
        var sessions = await _db.Sessions
            .Where(s => s.UserId == CurrentUserId && s.RevokedAt == null && s.Id != currentSession)
            .ToListAsync();
        foreach (var s in sessions) s.RevokedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { revoked = sessions.Count });
    }

    /// <summary>
    /// Returns the firm's enabled modules + limits — frontend uses this to gate menu items.
    /// Shape: { modules: ["trading","accounting",...], planCode, limits: {...}, usage: {...} }
    /// </summary>
    [HttpGet("modules")]
    public async Task<IActionResult> GetModules()
    {
        var firmId = CurrentFirmId;
        var firm = await _db.Firms.AsNoTracking()
            .Where(f => f.Id == firmId)
            .Select(f => new
            {
                f.Name,
                f.GstNumber,
                f.PanNumber,
                f.City,
                f.State,
                f.Theme,
                f.EnabledModules,
                f.PlanCode,
                f.UserLimit,
                f.BranchLimit,
                f.AiQuotaMonthly,
                f.AiUsedThisMonth,
                f.WalletBalance,
                f.Status,
                f.TrialEndsAt,
                f.SubscriptionEndsAt
            })
            .FirstOrDefaultAsync();

        if (firm == null) return NotFound();

        // CREDIL feature flag (separate column on platform.firms).
        bool credilEnabled = false;
        {
            var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
            if (conn.State != ConnectionState.Open) await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COALESCE(credil_enabled,false) FROM platform.firms WHERE id = @f";
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
            credilEnabled = (await cmd.ExecuteScalarAsync()) is bool b && b;
        }

        // Feature flags — pilot/rollout switches (sadmin Feature Flags page se control hote hain).
        var features = new List<string>();
        {
            var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
            if (conn.State != ConnectionState.Open) await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT key FROM platform.feature_flags WHERE enabled_all
                UNION
                SELECT flag_key FROM platform.feature_flag_firms WHERE firm_id = @f";
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync()) features.Add(reader.GetString(0));
        }

        // Parse enabled_modules JSON → flat list of enabled module keys
        var enabled = new List<string>();
        if (!string.IsNullOrWhiteSpace(firm.EnabledModules))
        {
            try
            {
                using var doc = JsonDocument.Parse(firm.EnabledModules);
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    if (prop.Value.ValueKind == JsonValueKind.True)
                        enabled.Add(prop.Name);
                }
            }
            catch (JsonException) { }
        }

        // Usage meter (Plans page ke progress bars ke liye) — abhi kitna use ho raha hai
        var usersCount = await _db.Users.IgnoreQueryFilters().CountAsync(u => u.FirmId == firmId && u.IsActive);
        var branchesCount = await _db.Branches.IgnoreQueryFilters().CountAsync(b => b.FirmId == firmId);

        return Ok(new
        {
            firmName = firm.Name,
            firmGst = firm.GstNumber,
            firmPan = firm.PanNumber,
            firmCity = firm.City,
            firmState = firm.State,
            firmTheme = string.IsNullOrWhiteSpace(firm.Theme) ? "classic" : firm.Theme,
            modules = enabled,
            features,
            credilEnabled,
            planCode = firm.PlanCode ?? "starter",
            limits = new
            {
                userLimit = firm.UserLimit,
                branchLimit = firm.BranchLimit,
                aiQuotaMonthly = firm.AiQuotaMonthly
            },
            usage = new
            {
                aiUsedThisMonth = firm.AiUsedThisMonth,
                walletBalance = firm.WalletBalance,
                usersCount,
                branchesCount
            },
            subscription = new
            {
                status = firm.Status,
                trialEndsAt = firm.TrialEndsAt,
                subscriptionEndsAt = firm.SubscriptionEndsAt
            }
        });
    }
}
