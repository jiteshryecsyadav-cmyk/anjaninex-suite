using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// COMPLAINT BOX — firm user -> Anjaninex super-admin chat (WhatsApp-style ticks).
// - User apni complaint bhejta hai (subject + message + optional photo).
// - Anjaninex sadmin panel me queue dekhta hai; thread kholte hi user ke messages
//   read ho jaate hain -> user ko blue ✓✓ dikhta hai (WhatsApp jaisa).
// - Admin reply karta hai; user thread kholta hai to admin ke messages read -> admin ko blue ✓✓.
// - Photos local disk (ContentRoot/uploads/complaints) — Catalog photo pattern.
// - RLS nahi (platform.* — Credil pattern): yaha har user-query firm_id + created_by se
//   filter hoti hai; admin endpoints platform permission se guarded.
// =============================================================================

[ApiController]
[Route("api/complaints")]
[Authorize]
public class ComplaintsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    public ComplaintsController(AppDbContext db, IWebHostEnvironment env) { _db = db; _env = env; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value
        ?? throw new InvalidOperationException("firm_id claim missing"));
    // Fail-fast: user_id ke bina complaint ownership match hi nahi hogi (created_by = NULL kabhi true nahi).
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("user_id")?.Value
        ?? throw new InvalidOperationException("user_id claim missing"));
    private string CurrentName => User.FindFirst("name")?.Value ?? User.FindFirst("username")?.Value ?? "User";

    // "" ko NULL banao (frontend hamesha message field bhejta hai, bhale khali ho).
    private static object BodyOrNull(string? message) =>
        string.IsNullOrWhiteSpace(message) ? DBNull.Value : message.Trim();

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    internal static string UploadDir(IWebHostEnvironment env)
    {
        var dir = Path.Combine(env.ContentRootPath, "uploads", "complaints");
        Directory.CreateDirectory(dir);
        return dir;
    }

    // Photo save (image-only) -> serve URL return. Catalog UploadPhoto jaisi validation.
    internal static async Task<(string? url, string? error)> SavePhotoAsync(IFormFile? file, IWebHostEnvironment env)
    {
        if (file == null || file.Length == 0) return (null, null);   // photo optional
        var allowedExt = new[] { ".jpg", ".jpeg", ".png", ".webp" };
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var ctype = (file.ContentType ?? "").ToLowerInvariant();
        if (!allowedExt.Contains(ext) || !ctype.StartsWith("image/"))
            return (null, "Sirf image file (JPG/PNG/WEBP) allowed hai.");
        var fileName = $"{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(UploadDir(env), fileName);
        await using (var fs = System.IO.File.Create(fullPath))
            await file.CopyToAsync(fs);
        return ($"/api/complaints/photo/{fileName}", null);
    }

    // ---- Meri complaints (list, latest chat upar) ----
    [HttpGet]
    public async Task<IActionResult> MyComplaints()
    {
        var list = new List<object>();
        await using var cmd = await CmdAsync(
            @"SELECT c.id, c.subject, c.status, c.created_at, c.last_msg_at,
                     -- Admin ke unread replies (user badge ke liye)
                     (SELECT count(*) FROM platform.complaint_messages m
                       WHERE m.complaint_id = c.id AND m.sender = 'admin' AND m.read_at IS NULL) AS unread,
                     -- Mere sab messages admin ne padh liye? (list me tick dikhane ke liye)
                     NOT EXISTS (SELECT 1 FROM platform.complaint_messages m
                       WHERE m.complaint_id = c.id AND m.sender = 'user' AND m.read_at IS NULL) AS all_read
              FROM platform.complaints c
              WHERE c.firm_id = @f AND c.created_by = @u
              ORDER BY c.last_msg_at DESC LIMIT 100");
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        cmd.Parameters.Add(new NpgsqlParameter("u", CurrentUserId));
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = (Guid)r["id"],
                subject = r["subject"] as string,
                status = r["status"] as string,
                createdAt = Convert.ToDateTime(r["created_at"]),
                lastMsgAt = Convert.ToDateTime(r["last_msg_at"]),
                unread = Convert.ToInt32(r["unread"]),
                allRead = r["all_read"] is bool b && b
            });
        }
        return Ok(list);
    }

    // ---- Nayi complaint (subject + pehla message + optional photo, multipart) ----
    [HttpPost]
    [RequestSizeLimit(15_000_000)]
    public async Task<IActionResult> Create([FromForm] string subject, [FromForm] string? message, IFormFile? photo)
    {
        subject = (subject ?? "").Trim();
        if (subject.Length < 3) return BadRequest(new { error = "Subject kam se kam 3 akshar ka likhein." });
        if (string.IsNullOrWhiteSpace(message) && (photo == null || photo.Length == 0))
            return BadRequest(new { error = "Message ya photo — kuch to bhejein." });

        var (photoUrl, err) = await SavePhotoAsync(photo, _env);
        if (err != null) return BadRequest(new { error = err });

        // Thread + pehla message ek transaction me — beech me fail hua to khali thread nahi banega.
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        Guid complaintId;
        await using (var cmd = await CmdAsync(
            @"INSERT INTO platform.complaints (firm_id, created_by, created_by_name, subject)
              VALUES (@f, @u, @n, @s) RETURNING id"))
        {
            cmd.Transaction = tx;
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            cmd.Parameters.Add(new NpgsqlParameter("u", CurrentUserId));
            cmd.Parameters.Add(new NpgsqlParameter("n", CurrentName));
            cmd.Parameters.Add(new NpgsqlParameter("s", subject));
            complaintId = (Guid)(await cmd.ExecuteScalarAsync())!;
        }
        await using (var cmd = await CmdAsync(
            @"INSERT INTO platform.complaint_messages (complaint_id, sender, sender_user_id, sender_name, body, photo_url)
              VALUES (@c, 'user', @u, @n, @b, @p)"))
        {
            cmd.Transaction = tx;
            cmd.Parameters.Add(new NpgsqlParameter("c", complaintId));
            cmd.Parameters.Add(new NpgsqlParameter("u", CurrentUserId));
            cmd.Parameters.Add(new NpgsqlParameter("n", CurrentName));
            cmd.Parameters.Add(new NpgsqlParameter("b", BodyOrNull(message)));
            cmd.Parameters.Add(new NpgsqlParameter("p", (object?)photoUrl ?? DBNull.Value));
            await cmd.ExecuteNonQueryAsync();
        }
        await tx.CommitAsync();
        return Ok(new { id = complaintId });
    }

    // ---- Thread messages (kholte hi admin ke messages read -> admin ko blue tick) ----
    [HttpGet("{id:guid}/messages")]
    public async Task<IActionResult> Messages(Guid id)
    {
        // Ownership check — sirf apni complaint.
        await using (var chk = await CmdAsync(
            "SELECT 1 FROM platform.complaints WHERE id = @id AND firm_id = @f AND created_by = @u"))
        {
            chk.Parameters.Add(new NpgsqlParameter("id", id));
            chk.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            chk.Parameters.Add(new NpgsqlParameter("u", CurrentUserId));
            if (await chk.ExecuteScalarAsync() is null) return NotFound(new { error = "Complaint nahi mili." });
        }

        // Admin ke unread messages ab padh liye (read receipt).
        await using (var up = await CmdAsync(
            @"UPDATE platform.complaint_messages SET read_at = now()
              WHERE complaint_id = @id AND sender = 'admin' AND read_at IS NULL"))
        {
            up.Parameters.Add(new NpgsqlParameter("id", id));
            await up.ExecuteNonQueryAsync();
        }

        return Ok(await ReadThreadAsync(id));
    }

    private async Task<object> ReadThreadAsync(Guid id)
    {
        string? subject = null, status = null;
        await using (var cmd = await CmdAsync("SELECT subject, status FROM platform.complaints WHERE id = @id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            await using var r0 = await cmd.ExecuteReaderAsync();
            if (await r0.ReadAsync()) { subject = r0["subject"] as string; status = r0["status"] as string; }
        }

        var msgs = new List<object>();
        await using (var cmd = await CmdAsync(
            @"SELECT id, sender, sender_name, body, photo_url, created_at, read_at
              FROM platform.complaint_messages WHERE complaint_id = @id ORDER BY created_at"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                msgs.Add(new
                {
                    id = (Guid)r["id"],
                    sender = r["sender"] as string,
                    senderName = r["sender_name"] as string,
                    body = r["body"] as string,
                    photoUrl = r["photo_url"] as string,
                    createdAt = Convert.ToDateTime(r["created_at"]),
                    readAt = r["read_at"] as DateTime?    // null = grey ✓✓, set = blue ✓✓
                });
            }
        }
        return new { subject, status, messages = msgs };
    }

    // ---- Reply (user ki taraf se, multipart: message + optional photo) ----
    [HttpPost("{id:guid}/messages")]
    [RequestSizeLimit(15_000_000)]
    public async Task<IActionResult> Reply(Guid id, [FromForm] string? message, IFormFile? photo)
    {
        await using (var chk = await CmdAsync(
            "SELECT status FROM platform.complaints WHERE id = @id AND firm_id = @f AND created_by = @u"))
        {
            chk.Parameters.Add(new NpgsqlParameter("id", id));
            chk.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            chk.Parameters.Add(new NpgsqlParameter("u", CurrentUserId));
            if (await chk.ExecuteScalarAsync() is null) return NotFound(new { error = "Complaint nahi mili." });
        }
        if (string.IsNullOrWhiteSpace(message) && (photo == null || photo.Length == 0))
            return BadRequest(new { error = "Message ya photo — kuch to bhejein." });

        var (photoUrl, err) = await SavePhotoAsync(photo, _env);
        if (err != null) return BadRequest(new { error = err });

        await using (var cmd = await CmdAsync(
            @"INSERT INTO platform.complaint_messages (complaint_id, sender, sender_user_id, sender_name, body, photo_url)
              VALUES (@c, 'user', @u, @n, @b, @p)"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("c", id));
            cmd.Parameters.Add(new NpgsqlParameter("u", CurrentUserId));
            cmd.Parameters.Add(new NpgsqlParameter("n", CurrentName));
            cmd.Parameters.Add(new NpgsqlParameter("b", BodyOrNull(message)));
            cmd.Parameters.Add(new NpgsqlParameter("p", (object?)photoUrl ?? DBNull.Value));
            await cmd.ExecuteNonQueryAsync();
        }
        // Naya message aaya to thread reopen + last_msg_at update.
        await using (var up = await CmdAsync(
            "UPDATE platform.complaints SET last_msg_at = now(), status = 'open' WHERE id = @id"))
        {
            up.Parameters.Add(new NpgsqlParameter("id", id));
            await up.ExecuteNonQueryAsync();
        }
        return Ok(new { ok = true });
    }

    // ---- Photo serve (GUID filename = unguessable; Catalog Photo pattern) ----
    [AllowAnonymous]
    [HttpGet("photo/{file}")]
    public IActionResult Photo(string file)
    {
        var safe = Path.GetFileName(file);   // path traversal se bachao
        var path = Path.Combine(UploadDir(_env), safe);
        if (!System.IO.File.Exists(path)) return NotFound();
        var ct = safe.EndsWith(".png") ? "image/png" : safe.EndsWith(".webp") ? "image/webp" : "image/jpeg";
        return PhysicalFile(path, ct);
    }
}

// =============================================================================
// ANJANINEX SADMIN — complaints queue + thread + reply + resolve.
// Thread kholte hi user ke messages read -> user ko WhatsApp jaisa blue ✓✓.
// =============================================================================
[ApiController]
[Route("api/admin/complaints")]
[Authorize]
public class AdminComplaintsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    public AdminComplaintsController(AppDbContext db, IWebHostEnvironment env) { _db = db; _env = env; }

    private Guid? CurrentUserId => Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : null;
    // User ko hamesha "Team Vyapaar Setu" dikhe — staff ka personal naam expose nahi hota.
    private string CurrentName => "Team Vyapaar Setu";

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // ---- Queue (saari firms; unread pehle) ----
    [HttpGet]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> All([FromQuery] string? status = null)
    {
        var list = new List<object>();
        var sql = @"SELECT c.id, c.subject, c.status, c.created_at, c.last_msg_at, c.created_by_name,
                           f.name AS firm_name,
                           (SELECT count(*) FROM platform.complaint_messages m
                             WHERE m.complaint_id = c.id AND m.sender = 'user' AND m.read_at IS NULL) AS unread
                    FROM platform.complaints c
                    JOIN platform.firms f ON f.id = c.firm_id
                    " + (string.IsNullOrWhiteSpace(status) ? "" : "WHERE c.status = @st") + @"
                    ORDER BY unread DESC, c.last_msg_at DESC
                    LIMIT 300";
        await using var cmd = await CmdAsync(sql);
        if (!string.IsNullOrWhiteSpace(status)) cmd.Parameters.Add(new NpgsqlParameter("st", status));
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = (Guid)r["id"],
                subject = r["subject"] as string,
                status = r["status"] as string,
                firmName = r["firm_name"] as string,
                createdByName = r["created_by_name"] as string,
                createdAt = Convert.ToDateTime(r["created_at"]),
                lastMsgAt = Convert.ToDateTime(r["last_msg_at"]),
                unread = Convert.ToInt32(r["unread"])
            });
        }
        return Ok(list);
    }

    // ---- Thread (kholte hi user ke messages read -> user ko blue tick) ----
    [HttpGet("{id:guid}/messages")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> Messages(Guid id)
    {
        await using (var up = await CmdAsync(
            @"UPDATE platform.complaint_messages SET read_at = now()
              WHERE complaint_id = @id AND sender = 'user' AND read_at IS NULL"))
        {
            up.Parameters.Add(new NpgsqlParameter("id", id));
            await up.ExecuteNonQueryAsync();
        }

        string? subject = null, status = null, firmName = null, createdByName = null;
        await using (var cmd = await CmdAsync(
            @"SELECT c.subject, c.status, c.created_by_name, f.name AS firm_name
              FROM platform.complaints c JOIN platform.firms f ON f.id = c.firm_id
              WHERE c.id = @id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            await using var r0 = await cmd.ExecuteReaderAsync();
            if (!await r0.ReadAsync()) return NotFound(new { error = "Complaint nahi mili." });
            subject = r0["subject"] as string; status = r0["status"] as string;
            firmName = r0["firm_name"] as string; createdByName = r0["created_by_name"] as string;
        }

        var msgs = new List<object>();
        await using (var cmd = await CmdAsync(
            @"SELECT id, sender, sender_name, body, photo_url, created_at, read_at
              FROM platform.complaint_messages WHERE complaint_id = @id ORDER BY created_at"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("id", id));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                msgs.Add(new
                {
                    id = (Guid)r["id"],
                    sender = r["sender"] as string,
                    senderName = r["sender_name"] as string,
                    body = r["body"] as string,
                    photoUrl = r["photo_url"] as string,
                    createdAt = Convert.ToDateTime(r["created_at"]),
                    readAt = r["read_at"] as DateTime?
                });
            }
        }
        return Ok(new { subject, status, firmName, createdByName, messages = msgs });
    }

    // ---- Admin reply (multipart: message + optional photo) ----
    [HttpPost("{id:guid}/reply")]
    [HasPermission("platform.firm.view.platform")]
    [RequestSizeLimit(15_000_000)]
    public async Task<IActionResult> Reply(Guid id, [FromForm] string? message, IFormFile? photo)
    {
        await using (var chk = await CmdAsync("SELECT 1 FROM platform.complaints WHERE id = @id"))
        {
            chk.Parameters.Add(new NpgsqlParameter("id", id));
            if (await chk.ExecuteScalarAsync() is null) return NotFound(new { error = "Complaint nahi mili." });
        }
        if (string.IsNullOrWhiteSpace(message) && (photo == null || photo.Length == 0))
            return BadRequest(new { error = "Message ya photo — kuch to bhejein." });

        var (photoUrl, err) = await ComplaintsController.SavePhotoAsync(photo, _env);
        if (err != null) return BadRequest(new { error = err });

        await using (var cmd = await CmdAsync(
            @"INSERT INTO platform.complaint_messages (complaint_id, sender, sender_user_id, sender_name, body, photo_url)
              VALUES (@c, 'admin', @u, @n, @b, @p)"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("c", id));
            cmd.Parameters.Add(new NpgsqlParameter("u", (object?)CurrentUserId ?? DBNull.Value));
            cmd.Parameters.Add(new NpgsqlParameter("n", CurrentName));
            cmd.Parameters.Add(new NpgsqlParameter("b",
                string.IsNullOrWhiteSpace(message) ? DBNull.Value : (object)message.Trim()));
            cmd.Parameters.Add(new NpgsqlParameter("p", (object?)photoUrl ?? DBNull.Value));
            await cmd.ExecuteNonQueryAsync();
        }
        await using (var up = await CmdAsync(
            "UPDATE platform.complaints SET last_msg_at = now() WHERE id = @id"))
        {
            up.Parameters.Add(new NpgsqlParameter("id", id));
            await up.ExecuteNonQueryAsync();
        }
        return Ok(new { ok = true });
    }

    // ---- Status badlo (open <-> resolved) ----
    [HttpPost("{id:guid}/status")]
    [HasPermission("platform.firm.view.platform")]
    public async Task<IActionResult> SetStatus(Guid id, [FromBody] ComplaintStatusDto dto)
    {
        var st = (dto.Status ?? "").Trim().ToLowerInvariant();
        if (st is not ("open" or "resolved")) return BadRequest(new { error = "Status 'open' ya 'resolved' hi ho sakta hai." });
        await using var cmd = await CmdAsync("UPDATE platform.complaints SET status = @st WHERE id = @id");
        cmd.Parameters.Add(new NpgsqlParameter("st", st));
        cmd.Parameters.Add(new NpgsqlParameter("id", id));
        var n = await cmd.ExecuteNonQueryAsync();
        if (n == 0) return NotFound(new { error = "Complaint nahi mili." });
        return Ok(new { ok = true });
    }
}

public record ComplaintStatusDto(string? Status);
