using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Hubs;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// PARTY CHAT — firm ↔ uski party (buyer/supplier) ke beech WhatsApp-jaisi chat.
// - FIRM side: logged-in users inbox dekhte/reply karte hain (Complaint Box pattern).
// - PARTY side: login NAHI — mobile + OTP verify → 7-din ka session token → chat.
// - OTP WhatsApp provider (wa_provider_settings) se jata hai; provider off ho to
//   response me otpPreview aata hai (sirf pilot/testing ke liye — provider on karo production me).
// - Feature flag 'party_chat' — pilot Riddhi, sadmin Feature Flags se rollout.
// =============================================================================

public record PchatStartDto(Guid PartyId);
public record PchatMsgDto(string Body);
public record PchatOtpReqDto(Guid FirmId, string Phone);
public record PchatVerifyDto(Guid FirmId, string Phone, string Otp);
public record PchatPublicMsgDto(string Token, string Body);

[ApiController]
[Route("api/party-chat")]
[Authorize]
public class PartyChatController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly IHubContext<PartyChatHub> _hub;
    public PartyChatController(AppDbContext db, IWebHostEnvironment env, IHubContext<PartyChatHub> hub)
    { _db = db; _env = env; _hub = hub; }

    // ---- Attachment helpers (Complaint Box photo pattern) ----
    internal static string UploadDir(IWebHostEnvironment env)
    {
        var dir = Path.Combine(env.ContentRootPath, "uploads", "partychat");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static readonly string[] ImageExt = { ".jpg", ".jpeg", ".png", ".webp" };
    private static readonly string[] DocExt = { ".pdf", ".doc", ".docx", ".xls", ".xlsx" };

    internal static async Task<(string? url, string? name, string? type, string? error)> SaveFileAsync(IFormFile? file, IWebHostEnvironment env)
    {
        if (file == null || file.Length == 0) return (null, null, null, "File khali hai");
        if (file.Length > 10 * 1024 * 1024) return (null, null, null, "File 10 MB se badi hai");
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        string type;
        if (ImageExt.Contains(ext)) type = "image";
        else if (DocExt.Contains(ext)) type = "document";
        else return (null, null, null, "Sirf photo (JPG/PNG/WEBP) ya document (PDF/Word/Excel) bhej sakte hain");

        var fileName = $"{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(UploadDir(env), fileName);
        await using (var fs = System.IO.File.Create(fullPath))
            await file.CopyToAsync(fs);
        return ($"/api/party-chat/public/file/{fileName}", file.FileName, type, null);
    }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value
        ?? throw new InvalidOperationException("firm_id claim missing"));
    private string CurrentName => User.FindFirst("name")?.Value ?? User.FindFirst("username")?.Value ?? "Firm";

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    // ---- Firm: inbox (threads + unread) ----
    [HttpGet("threads")]
    public async Task<IActionResult> Threads()
    {
        var list = new List<object>();
        // Phone hamesha party MASTER se dikhao (live) — master badle to yahan bhi turant badle
        await using var cmd = await CmdAsync(@"
            SELECT t.id, t.party_name,
                   COALESCE(NULLIF(regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g'), ''), t.phone) AS phone,
                   t.last_msg_at,
                   (SELECT COUNT(*) FROM platform.party_chat_messages m
                     WHERE m.thread_id = t.id AND m.sender = 'party' AND m.read_at IS NULL AND NOT m.deleted_for_firm) AS unread,
                   (SELECT m.body FROM platform.party_chat_messages m
                     WHERE m.thread_id = t.id AND NOT m.deleted_for_firm ORDER BY m.created_at DESC LIMIT 1) AS last_body
            FROM platform.party_chat_threads t
            LEFT JOIN trading.party_profiles p ON p.id = t.party_id
            LEFT JOIN core.contacts c ON c.id = p.contact_id
            WHERE t.firm_id = @f
            ORDER BY unread DESC, t.last_msg_at DESC");
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new
            {
                id = r.GetGuid(0),
                partyName = r.GetString(1),
                phone = r.GetString(2),
                lastMsgAt = r.GetFieldValue<DateTimeOffset>(3),
                unread = r.GetInt64(4),
                lastBody = r.IsDBNull(5) ? null : r.GetString(5)
            });
        return Ok(list);
    }

    // ---- Firm: party se thread start (ya existing lao) ----
    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] PchatStartDto dto)
    {
        string? name = null, phone = null;
        await using (var cmd = await CmdAsync(@"
            SELECT c.display_name, COALESCE(c.phone_primary,'')
            FROM trading.party_profiles p JOIN core.contacts c ON c.id = p.contact_id
            WHERE p.id = @p AND p.firm_id = @f"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("p", dto.PartyId));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            await using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync()) { name = r.GetString(0); phone = r.GetString(1); }
        }
        if (name is null) return NotFound(new { error = "Party nahi mili" });

        var digits = new string((phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length < 10)
            return BadRequest(new { error = $"'{name}' ka mobile number master me nahi hai — pehle party me phone daalo" });

        Guid threadId;
        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_chat_threads (firm_id, party_id, party_name, phone)
            VALUES (@f, @p, @n, @ph)
            ON CONFLICT (firm_id, party_id) DO UPDATE SET party_name = @n, phone = @ph
            RETURNING id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            cmd.Parameters.Add(new NpgsqlParameter("p", dto.PartyId));
            cmd.Parameters.Add(new NpgsqlParameter("n", name));
            cmd.Parameters.Add(new NpgsqlParameter("ph", digits));
            threadId = (Guid)(await cmd.ExecuteScalarAsync())!;
        }
        return Ok(new { threadId, partyName = name, phone = digits, firmId = CurrentFirmId });
    }

    // ---- Firm: thread ke messages (kholte hi party ke msgs read → party ko blue tick) ----
    [HttpGet("threads/{id}/messages")]
    public async Task<IActionResult> Messages(Guid id)
    {
        await using (var up = await CmdAsync(@"
            UPDATE platform.party_chat_messages SET read_at = now()
            WHERE thread_id = @t AND sender = 'party' AND read_at IS NULL
              AND EXISTS (SELECT 1 FROM platform.party_chat_threads th WHERE th.id = @t AND th.firm_id = @f)"))
        {
            up.Parameters.Add(new NpgsqlParameter("t", id));
            up.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            await up.ExecuteNonQueryAsync();
        }

        var list = new List<object>();
        await using (var cmd = await CmdAsync(@"
            SELECT m.id, m.sender, m.sender_name, m.body, m.read_at, m.created_at,
                   m.attachment_url, m.attachment_name, m.attachment_type
            FROM platform.party_chat_messages m
            JOIN platform.party_chat_threads t ON t.id = m.thread_id
            WHERE m.thread_id = @t AND t.firm_id = @f AND NOT m.deleted_for_firm
            ORDER BY m.created_at"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", id));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                list.Add(new
                {
                    id = r.GetGuid(0),
                    sender = r.GetString(1),
                    senderName = r.IsDBNull(2) ? null : r.GetString(2),
                    body = r.GetString(3),
                    readAt = r.IsDBNull(4) ? (DateTimeOffset?)null : r.GetFieldValue<DateTimeOffset>(4),
                    createdAt = r.GetFieldValue<DateTimeOffset>(5),
                    attachmentUrl = r.IsDBNull(6) ? null : r.GetString(6),
                    attachmentName = r.IsDBNull(7) ? null : r.GetString(7),
                    attachmentType = r.IsDBNull(8) ? null : r.GetString(8)
                });
        }
        return Ok(list);
    }

    public record DelModeDto(string Mode);   // "everyone" | "me"

    // ---- Firm: EK message delete — WhatsApp jaisa: everyone (dono taraf) ya me (sirf firm ki taraf) ----
    [HttpPost("messages/{messageId}/delete")]
    public async Task<IActionResult> DeleteMessage(Guid messageId, [FromBody] DelModeDto dto)
    {
        object? tid;
        if (string.Equals(dto.Mode, "everyone", StringComparison.OrdinalIgnoreCase))
        {
            // Everyone = sirf APNE bheje message (WhatsApp rule)
            await using var cmd = await CmdAsync(@"
                DELETE FROM platform.party_chat_messages m
                USING platform.party_chat_threads t
                WHERE m.id = @m AND m.thread_id = t.id AND t.firm_id = @f AND m.sender = 'firm'
                RETURNING m.thread_id");
            cmd.Parameters.Add(new NpgsqlParameter("m", messageId));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            tid = await cmd.ExecuteScalarAsync();
        }
        else
        {
            await using var cmd = await CmdAsync(@"
                UPDATE platform.party_chat_messages m SET deleted_for_firm = true
                FROM platform.party_chat_threads t
                WHERE m.id = @m AND m.thread_id = t.id AND t.firm_id = @f
                RETURNING m.thread_id");
            cmd.Parameters.Add(new NpgsqlParameter("m", messageId));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            tid = await cmd.ExecuteScalarAsync();
        }
        if (tid is null) return NotFound(new { error = "Everyone-delete sirf apne bheje message ka ho sakta hai" });
        if (tid is Guid threadGuid) await PartyChatEvents.Notify(_hub, threadGuid, CurrentFirmId);
        return Ok(new { ok = true });
    }

    // ---- Firm: puri chat DELETE (messages + party sessions bhi CASCADE se ud jaate hain) ----
    [HttpDelete("threads/{id}")]
    public async Task<IActionResult> DeleteThread(Guid id)
    {
        await using var cmd = await CmdAsync(
            "DELETE FROM platform.party_chat_threads WHERE id = @t AND firm_id = @f");
        cmd.Parameters.Add(new NpgsqlParameter("t", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        var n = await cmd.ExecuteNonQueryAsync();
        return n == 0 ? NotFound() : Ok(new { ok = true });
    }

    // ---- Firm: photo/document bhejo (multipart) ----
    [HttpPost("threads/{id}/attachment")]
    public async Task<IActionResult> SendAttachment(Guid id, [FromForm] string? body, IFormFile file)
    {
        var (url, name, type, error) = await SaveFileAsync(file, _env);
        if (error != null) return BadRequest(new { error });

        await using var cmd = await CmdAsync(@"
            WITH t AS (SELECT id FROM platform.party_chat_threads WHERE id = @t AND firm_id = @f)
            INSERT INTO platform.party_chat_messages (thread_id, sender, sender_name, body, attachment_url, attachment_name, attachment_type)
            SELECT id, 'firm', @n, @b, @u, @an, @at FROM t RETURNING id");
        cmd.Parameters.Add(new NpgsqlParameter("t", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        cmd.Parameters.Add(new NpgsqlParameter("n", CurrentName));
        cmd.Parameters.Add(new NpgsqlParameter("b", (body ?? "").Trim()));
        cmd.Parameters.Add(new NpgsqlParameter("u", url!));
        cmd.Parameters.Add(new NpgsqlParameter("an", name!));
        cmd.Parameters.Add(new NpgsqlParameter("at", type!));
        var mid = await cmd.ExecuteScalarAsync();
        if (mid is null) return NotFound();

        await using var touch = await CmdAsync("UPDATE platform.party_chat_threads SET last_msg_at = now() WHERE id = @t");
        touch.Parameters.Add(new NpgsqlParameter("t", id));
        await touch.ExecuteNonQueryAsync();
        await PartyChatEvents.Notify(_hub, id, CurrentFirmId);   // live push — party ko turant dikhe
        return Ok(new { ok = true });
    }

    // ---- Firm: reply bhejo ----
    [HttpPost("threads/{id}/messages")]
    public async Task<IActionResult> Send(Guid id, [FromBody] PchatMsgDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Body)) return BadRequest(new { error = "Message khali hai" });
        await using var cmd = await CmdAsync(@"
            WITH t AS (SELECT id FROM platform.party_chat_threads WHERE id = @t AND firm_id = @f)
            INSERT INTO platform.party_chat_messages (thread_id, sender, sender_name, body)
            SELECT id, 'firm', @n, @b FROM t RETURNING id");
        cmd.Parameters.Add(new NpgsqlParameter("t", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        cmd.Parameters.Add(new NpgsqlParameter("n", CurrentName));
        cmd.Parameters.Add(new NpgsqlParameter("b", dto.Body.Trim()));
        var mid = await cmd.ExecuteScalarAsync();
        if (mid is null) return NotFound();

        await using var touch = await CmdAsync("UPDATE platform.party_chat_threads SET last_msg_at = now() WHERE id = @t");
        touch.Parameters.Add(new NpgsqlParameter("t", id));
        await touch.ExecuteNonQueryAsync();
        await PartyChatEvents.Notify(_hub, id, CurrentFirmId);   // live push — party ko turant dikhe
        return Ok(new { ok = true });
    }

    // ---- BROADCAST — ek message, kai parties (WhatsApp broadcast jaisa) ----
    // Har party ko uske APNE chat me milta hai; use pata nahi chalta ki aur
    // kisko bheja gaya, aur uska jawab sirf hamein dikhta hai.
    // Jinka mobile master me nahi hai unhe skip karke naam wapas bhejte hain —
    // chup-chaap chhodna galat hoga (user samjhega sabko chala gaya).
    public record PchatBroadcastDto(List<Guid> PartyIds, string Body);

    [HttpPost("broadcast")]
    public async Task<IActionResult> Broadcast([FromBody] PchatBroadcastDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Body)) return BadRequest(new { error = "Message khali hai" });
        if (dto.PartyIds is null || dto.PartyIds.Count == 0)
            return BadRequest(new { error = "Koi party nahi chuni" });

        var body = dto.Body.Trim();
        var sent = 0;
        var skipped = new List<string>();

        foreach (var pid in dto.PartyIds.Distinct())
        {
            string? name = null, phone = null;
            await using (var q = await CmdAsync(@"
                SELECT c.display_name, COALESCE(c.phone_primary,'')
                FROM trading.party_profiles p JOIN core.contacts c ON c.id = p.contact_id
                WHERE p.id = @p AND p.firm_id = @f"))
            {
                q.Parameters.Add(new NpgsqlParameter("p", pid));
                q.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
                await using var r = await q.ExecuteReaderAsync();
                if (await r.ReadAsync()) { name = r.GetString(0); phone = r.GetString(1); }
            }
            if (name is null) continue;

            var digits = new string((phone ?? "").Where(char.IsDigit).ToArray());
            if (digits.Length < 10) { skipped.Add(name); continue; }   // mobile nahi → bhej hi nahi sakte

            Guid threadId;
            await using (var t = await CmdAsync(@"
                INSERT INTO platform.party_chat_threads (firm_id, party_id, party_name, phone)
                VALUES (@f, @p, @n, @ph)
                ON CONFLICT (firm_id, party_id) DO UPDATE SET party_name = @n, phone = @ph
                RETURNING id"))
            {
                t.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
                t.Parameters.Add(new NpgsqlParameter("p", pid));
                t.Parameters.Add(new NpgsqlParameter("n", name));
                t.Parameters.Add(new NpgsqlParameter("ph", digits));
                threadId = (Guid)(await t.ExecuteScalarAsync())!;
            }

            await using (var m = await CmdAsync(@"
                INSERT INTO platform.party_chat_messages (thread_id, sender, sender_name, body)
                VALUES (@t, 'firm', @n, @b)"))
            {
                m.Parameters.Add(new NpgsqlParameter("t", threadId));
                m.Parameters.Add(new NpgsqlParameter("n", CurrentName));
                m.Parameters.Add(new NpgsqlParameter("b", body));
                await m.ExecuteNonQueryAsync();
            }
            await using (var touch = await CmdAsync("UPDATE platform.party_chat_threads SET last_msg_at = now() WHERE id = @t"))
            {
                touch.Parameters.Add(new NpgsqlParameter("t", threadId));
                await touch.ExecuteNonQueryAsync();
            }
            await PartyChatEvents.Notify(_hub, threadId, CurrentFirmId);
            sent++;
        }

        return Ok(new { ok = true, sent, skipped });
    }
}

// =============================================================================
// PUBLIC (party side) — login nahi, OTP + session token
// =============================================================================
[ApiController]
[Route("api/party-chat/public")]
[AllowAnonymous]
public class PartyChatPublicController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly IHubContext<PartyChatHub> _hub;
    private static readonly HttpClient Http = new HttpClient();
    public PartyChatPublicController(AppDbContext db, IWebHostEnvironment env, IHubContext<PartyChatHub> hub)
    { _db = db; _env = env; _hub = hub; }

    // Message ke baad thread touch + firm_id nikal ke live push
    private async Task TouchAndNotify(Guid threadId)
    {
        object? firmId;
        await using (var touch = await CmdAsync(
            "UPDATE platform.party_chat_threads SET last_msg_at = now() WHERE id = @t RETURNING firm_id"))
        {
            touch.Parameters.Add(new NpgsqlParameter("t", threadId));
            firmId = await touch.ExecuteScalarAsync();
        }
        if (firmId is Guid f) await PartyChatEvents.Notify(_hub, threadId, f);
    }

    private async Task<NpgsqlCommand> CmdAsync(string sql)
    {
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd;
    }

    private static string Digits(string? s) => new string((s ?? "").Where(char.IsDigit).ToArray());
    private static string Hash(string s) => Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(s))).ToLowerInvariant();

    // Public endpoint par login nahi hota → RLS ke liye firm context khud set karo,
    // warna trading.party_profiles / core.contacts ki rows dikhti hi nahi ("party nahi mili").
    private async Task SetFirmContext(Guid firmId)
    {
        await using var cmd = await CmdAsync("SELECT set_config('app.current_firm_id', @f, false)");
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId.ToString()));
        await cmd.ExecuteNonQueryAsync();
    }

    // Firm ke liye party_chat flag on hai? (enabled_all ya pilot list)
    private async Task<bool> FlagOn(Guid firmId)
    {
        await using var cmd = await CmdAsync(@"
            SELECT 1 FROM platform.feature_flags ff
            WHERE ff.key = 'party_chat' AND (ff.enabled_all
               OR EXISTS (SELECT 1 FROM platform.feature_flag_firms x WHERE x.flag_key = 'party_chat' AND x.firm_id = @f))");
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        return await cmd.ExecuteScalarAsync() != null;
    }

    // Phone se firm ki party dhundo (last-10-digit match).
    // Duplicate numbers ho to: EXACT match pehle, fir sabse nayi party — deterministic.
    private async Task<(Guid partyId, string name)?> FindParty(Guid firmId, string phoneDigits)
    {
        var last10 = phoneDigits.Length > 10 ? phoneDigits[^10..] : phoneDigits;
        await using var cmd = await CmdAsync(@"
            SELECT p.id, c.display_name
            FROM trading.party_profiles p JOIN core.contacts c ON c.id = p.contact_id
            WHERE p.firm_id = @f AND p.is_active
              AND regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g') LIKE '%' || @ph
            ORDER BY (regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g') = @ph) DESC,
                     p.created_at DESC
            LIMIT 1");
        cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
        cmd.Parameters.Add(new NpgsqlParameter("ph", last10));
        await using var r = await cmd.ExecuteReaderAsync();
        if (await r.ReadAsync()) return (r.GetGuid(0), r.GetString(1));
        return null;
    }

    // ---- 1) OTP bhejo ----
    [HttpPost("request-otp")]
    public async Task<IActionResult> RequestOtp([FromBody] PchatOtpReqDto dto)
    {
        var phone = Digits(dto.Phone);
        if (phone.Length < 10) return BadRequest(new { error = "Sahi mobile number daalo" });
        if (!await FlagOn(dto.FirmId)) return BadRequest(new { error = "Is firm ke liye chat abhi chalu nahi hai" });

        await SetFirmContext(dto.FirmId);   // RLS: party master padhne ke liye
        var party = await FindParty(dto.FirmId, phone);
        if (party is null)
            return BadRequest(new { error = "Ye number is firm ke kisi party master me nahi mila — firm se apna number update karwayein" });

        string? firmName = null;
        await using (var fc = await CmdAsync("SELECT name FROM platform.firms WHERE id = @f"))
        {
            fc.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            firmName = (await fc.ExecuteScalarAsync()) as string;
        }

        var otp = RandomNumberGenerator.GetInt32(100000, 999999).ToString();
        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_chat_otps (firm_id, phone, otp_hash, expires_at, attempts)
            VALUES (@f, @ph, @h, now() + interval '10 minutes', 0)
            ON CONFLICT (firm_id, phone) DO UPDATE
              SET otp_hash = @h, expires_at = now() + interval '10 minutes', attempts = 0, created_at = now()"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            cmd.Parameters.Add(new NpgsqlParameter("ph", phone));
            cmd.Parameters.Add(new NpgsqlParameter("h", Hash(otp)));
            await cmd.ExecuteNonQueryAsync();
        }

        var sent = await TrySendOtpWhatsApp(phone, otp, firmName ?? "Firm");
        return Ok(new
        {
            otpSent = sent,
            partyName = party.Value.name,
            // PILOT ONLY: WA provider off ho to OTP yahi dikha do taaki flow ruke nahi.
            // Production me wa_provider_settings enable karo — fir ye null hi rahega.
            otpPreview = sent ? null : otp
        });
    }

    private async Task<bool> TrySendOtpWhatsApp(string toDigits, string otp, string firmName)
    {
        try
        {
            string? baseUrl = null, apiKey = null; bool enabled = false;
            await using (var cmd = await CmdAsync("SELECT base_url, api_key, enabled FROM platform.wa_provider_settings WHERE id = 1"))
            await using (var r = await cmd.ExecuteReaderAsync())
                if (await r.ReadAsync()) { baseUrl = r["base_url"] as string; apiKey = r["api_key"] as string; enabled = r["enabled"] is bool b && b; }
            if (!enabled || string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey)) return false;

            string? sender = null;
            await using (var cmd = await CmdAsync(
                "SELECT waba_number FROM platform.firm_whatsapp WHERE enabled = true AND waba_number IS NOT NULL ORDER BY updated_at DESC LIMIT 1"))
                sender = (await cmd.ExecuteScalarAsync()) as string;
            if (string.IsNullOrWhiteSpace(sender)) return false;

            var msg = $"{firmName} aapse Vyapaar Setu par baat karna chahti hai.\nChat kholne ka OTP: {otp} (10 min me expire)";
            var bodyJson = JsonSerializer.Serialize(new
            {
                messaging_product = "whatsapp",
                recipient_type = "individual",
                to = toDigits,
                type = "text",
                text = new { body = msg }
            });
            var url = baseUrl!.TrimEnd('/') + "/wrapper/waba/message";
            using var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.TryAddWithoutValidation("key", apiKey);
            req.Headers.TryAddWithoutValidation("wabaNumber", sender);
            req.Content = new StringContent(bodyJson, Encoding.UTF8, "application/json");
            var resp = await Http.SendAsync(req);
            return resp.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    // ---- 2) OTP verify → session token + thread ----
    [HttpPost("verify")]
    public async Task<IActionResult> Verify([FromBody] PchatVerifyDto dto)
    {
        var phone = Digits(dto.Phone);
        string? hash = null; DateTime? exp = null; int attempts = 0;
        await using (var cmd = await CmdAsync(@"
            SELECT otp_hash, expires_at, attempts FROM platform.party_chat_otps
            WHERE firm_id = @f AND phone = @ph"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            cmd.Parameters.Add(new NpgsqlParameter("ph", phone));
            await using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                hash = r["otp_hash"] as string;
                exp = (r["expires_at"] as DateTime?) ?? (r["expires_at"] is DateTimeOffset dtoff ? dtoff.UtcDateTime : null);
                attempts = Convert.ToInt32(r["attempts"] ?? 0);
            }
        }
        if (hash is null) return BadRequest(new { error = "Pehle OTP mangao" });
        if (attempts >= 5) return BadRequest(new { error = "Bahut galat koshish — naya OTP mangao" });
        if (exp is not null && exp < DateTime.UtcNow) return BadRequest(new { error = "OTP expire ho gaya — naya mangao" });

        if (Hash((dto.Otp ?? "").Trim()) != hash)
        {
            await using var up = await CmdAsync("UPDATE platform.party_chat_otps SET attempts = attempts + 1 WHERE firm_id = @f AND phone = @ph");
            up.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            up.Parameters.Add(new NpgsqlParameter("ph", phone));
            await up.ExecuteNonQueryAsync();
            return BadRequest(new { error = "OTP galat hai" });
        }

        await SetFirmContext(dto.FirmId);   // RLS: party master padhne ke liye
        var party = await FindParty(dto.FirmId, phone);
        if (party is null) return BadRequest(new { error = "Party nahi mili" });

        // Thread upsert
        Guid threadId;
        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_chat_threads (firm_id, party_id, party_name, phone)
            VALUES (@f, @p, @n, @ph)
            ON CONFLICT (firm_id, party_id) DO UPDATE SET phone = @ph
            RETURNING id"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            cmd.Parameters.Add(new NpgsqlParameter("p", party.Value.partyId));
            cmd.Parameters.Add(new NpgsqlParameter("n", party.Value.name));
            cmd.Parameters.Add(new NpgsqlParameter("ph", phone));
            threadId = (Guid)(await cmd.ExecuteScalarAsync())!;
        }

        // Session token (7 din)
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_chat_sessions (token, thread_id, expires_at)
            VALUES (@t, @th, now() + interval '7 days')"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", token));
            cmd.Parameters.Add(new NpgsqlParameter("th", threadId));
            await cmd.ExecuteNonQueryAsync();
        }

        string? firmName = null;
        await using (var fc = await CmdAsync("SELECT name FROM platform.firms WHERE id = @f"))
        {
            fc.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            firmName = (await fc.ExecuteScalarAsync()) as string;
        }

        return Ok(new { token, threadId, firmName, partyName = party.Value.name });
    }

    // Token → threadId (expired = null).
    // SECURITY: master me party ka number BADAL diya gaya ho to purana session turant band —
    // verify wala number ab master se match nahi karta to session delete + null.
    private async Task<Guid?> ThreadFromToken(string token)
    {
        Guid? threadId = null; Guid firmId = Guid.Empty; string threadPhone = "";
        await using (var cmd = await CmdAsync(@"
            SELECT s.thread_id, t.firm_id, t.phone
            FROM platform.party_chat_sessions s
            JOIN platform.party_chat_threads t ON t.id = s.thread_id
            WHERE s.token = @t AND s.expires_at > now()"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", token ?? ""));
            await using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync()) { threadId = r.GetGuid(0); firmId = r.GetGuid(1); threadPhone = r.GetString(2); }
        }
        if (threadId is null) return null;

        // RLS ke liye firm context, fir master phone se milao
        await SetFirmContext(firmId);
        var last10 = threadPhone.Length > 10 ? threadPhone[^10..] : threadPhone;
        bool stillValid;
        await using (var chk = await CmdAsync(@"
            SELECT 1 FROM platform.party_chat_threads t
            JOIN trading.party_profiles p ON p.id = t.party_id
            JOIN core.contacts c ON c.id = p.contact_id
            WHERE t.id = @th
              AND regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g') LIKE '%' || @ph"))
        {
            chk.Parameters.Add(new NpgsqlParameter("th", threadId.Value));
            chk.Parameters.Add(new NpgsqlParameter("ph", last10));
            stillValid = await chk.ExecuteScalarAsync() != null;
        }
        if (!stillValid)
        {
            await using var del = await CmdAsync("DELETE FROM platform.party_chat_sessions WHERE token = @t");
            del.Parameters.Add(new NpgsqlParameter("t", token ?? ""));
            await del.ExecuteNonQueryAsync();
            return null;
        }
        return threadId;
    }

    // ---- 3) Party: messages (kholte hi firm ke msgs read → firm ko blue tick) ----
    [HttpGet("messages")]
    public async Task<IActionResult> Messages([FromQuery] string token)
    {
        var threadId = await ThreadFromToken(token);
        if (threadId is null) return Unauthorized(new { error = "Session expire — dobara OTP se kholo" });

        await using (var up = await CmdAsync(@"
            UPDATE platform.party_chat_messages SET read_at = now()
            WHERE thread_id = @t AND sender = 'firm' AND read_at IS NULL"))
        {
            up.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
            await up.ExecuteNonQueryAsync();
        }

        string? firmName = null, partyName = null;
        await using (var cmd = await CmdAsync(@"
            SELECT f.name, t.party_name FROM platform.party_chat_threads t
            JOIN platform.firms f ON f.id = t.firm_id WHERE t.id = @t"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
            await using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync()) { firmName = r.GetString(0); partyName = r.GetString(1); }
        }

        var list = new List<object>();
        await using (var cmd = await CmdAsync(@"
            SELECT id, sender, sender_name, body, read_at, created_at,
                   attachment_url, attachment_name, attachment_type
            FROM platform.party_chat_messages
            WHERE thread_id = @t AND NOT deleted_for_party ORDER BY created_at"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                list.Add(new
                {
                    id = r.GetGuid(0),
                    sender = r.GetString(1),
                    senderName = r.IsDBNull(2) ? null : r.GetString(2),
                    body = r.GetString(3),
                    readAt = r.IsDBNull(4) ? (DateTimeOffset?)null : r.GetFieldValue<DateTimeOffset>(4),
                    createdAt = r.GetFieldValue<DateTimeOffset>(5),
                    attachmentUrl = r.IsDBNull(6) ? null : r.GetString(6),
                    attachmentName = r.IsDBNull(7) ? null : r.GetString(7),
                    attachmentType = r.IsDBNull(8) ? null : r.GetString(8)
                });
        }
        return Ok(new { firmName, partyName, messages = list });
    }

    // ---- Party: photo/document bhejo (multipart, token se) ----
    [HttpPost("attachment")]
    public async Task<IActionResult> SendAttachment([FromForm] string token, [FromForm] string? body, IFormFile file)
    {
        var threadId = await ThreadFromToken(token);
        if (threadId is null) return Unauthorized(new { error = "Session expire — dobara OTP se kholo" });

        var (url, name, type, error) = await PartyChatController.SaveFileAsync(file, _env);
        if (error != null) return BadRequest(new { error });

        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_chat_messages (thread_id, sender, sender_name, body, attachment_url, attachment_name, attachment_type)
            SELECT id, 'party', party_name, @b, @u, @an, @at FROM platform.party_chat_threads WHERE id = @t"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("b", (body ?? "").Trim()));
            cmd.Parameters.Add(new NpgsqlParameter("u", url!));
            cmd.Parameters.Add(new NpgsqlParameter("an", name!));
            cmd.Parameters.Add(new NpgsqlParameter("at", type!));
            cmd.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
            await cmd.ExecuteNonQueryAsync();
        }
        await TouchAndNotify(threadId.Value);
        return Ok(new { ok = true });
    }

    public record PchatDelMsgDto(string Token, Guid MessageId, string Mode);   // Mode: "everyone" | "me"

    // ---- Party: message delete — everyone (sirf apne bheje) ya me (koi bhi, sirf apni taraf chhupe) ----
    [HttpPost("messages/delete")]
    public async Task<IActionResult> DeleteMessage([FromBody] PchatDelMsgDto dto)
    {
        var threadId = await ThreadFromToken(dto.Token);
        if (threadId is null) return Unauthorized(new { error = "Session expire — dobara OTP se kholo" });

        int n;
        if (string.Equals(dto.Mode, "everyone", StringComparison.OrdinalIgnoreCase))
        {
            await using var cmd = await CmdAsync(@"
                DELETE FROM platform.party_chat_messages
                WHERE id = @m AND thread_id = @t AND sender = 'party'");
            cmd.Parameters.Add(new NpgsqlParameter("m", dto.MessageId));
            cmd.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
            n = await cmd.ExecuteNonQueryAsync();
        }
        else
        {
            await using var cmd = await CmdAsync(@"
                UPDATE platform.party_chat_messages SET deleted_for_party = true
                WHERE id = @m AND thread_id = @t");
            cmd.Parameters.Add(new NpgsqlParameter("m", dto.MessageId));
            cmd.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
            n = await cmd.ExecuteNonQueryAsync();
        }
        if (n == 0) return NotFound(new { error = "Everyone-delete sirf apne bheje message ka ho sakta hai" });
        await TouchAndNotify(threadId.Value);
        return Ok(new { ok = true });
    }

    // ---- File serve (dono taraf yahi URL use hota hai; GUID filename = guess nahi hota) ----
    [HttpGet("file/{name}")]
    public IActionResult GetFile(string name)
    {
        if (name.Contains("..") || name.Contains('/') || name.Contains('\\')) return NotFound();
        var path = Path.Combine(PartyChatController.UploadDir(_env), name);
        if (!System.IO.File.Exists(path)) return NotFound();
        var ext = Path.GetExtension(name).ToLowerInvariant();
        var mime = ext switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".pdf" => "application/pdf",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls" => "application/vnd.ms-excel",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            _ => "application/octet-stream"
        };
        return PhysicalFile(path, mime);
    }

    // ---- 4) Party: message bhejo ----
    [HttpPost("messages")]
    public async Task<IActionResult> Send([FromBody] PchatPublicMsgDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Body)) return BadRequest(new { error = "Message khali hai" });
        var threadId = await ThreadFromToken(dto.Token);
        if (threadId is null) return Unauthorized(new { error = "Session expire — dobara OTP se kholo" });

        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_chat_messages (thread_id, sender, sender_name, body)
            SELECT id, 'party', party_name, @b FROM platform.party_chat_threads WHERE id = @t"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("b", dto.Body.Trim()));
            cmd.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
            await cmd.ExecuteNonQueryAsync();
        }
        await TouchAndNotify(threadId.Value);
        return Ok(new { ok = true });
    }
}
