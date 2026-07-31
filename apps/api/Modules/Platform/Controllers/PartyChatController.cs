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
public record PchatMsgDto(string Body, Guid? ReplyToId = null);
public record PchatOtpReqDto(Guid FirmId, string Phone, string? InviteCode = null);
public record PchatVerifyDto(Guid FirmId, string Phone, string Otp);
public record PchatPublicMsgDto(string Token, string Body, Guid? ReplyToId = null);

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
                   m.attachment_url, m.attachment_name, m.attachment_type,
                   -- Jis message ka jawab hai uska thoda sa hissa (quote dikhane ke liye)
                   rm.body, rm.sender, rm.sender_name
            FROM platform.party_chat_messages m
            JOIN platform.party_chat_threads t ON t.id = m.thread_id
            LEFT JOIN platform.party_chat_messages rm ON rm.id = m.reply_to_id
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
                    attachmentType = r.IsDBNull(8) ? null : r.GetString(8),
                    // Quote — jis message ka jawab hai. Wo delete ho gaya ho to null
                    // (jawab phir bhi rehta hai, bas quote hat jata hai).
                    replyBody = r.IsDBNull(9) ? null : r.GetString(9),
                    replySender = r.IsDBNull(10) ? null : r.GetString(10),
                    replySenderName = r.IsDBNull(11) ? null : r.GetString(11)
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

    private static string OtpHash(string s) =>
        Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(s))).ToLowerInvariant();

    // ---- Firm: PARTY ka abhi ka OTP dekho (jab WhatsApp provider band ho) ----
    // 🔐 Surakshit kyunki: firm LOGGED-IN hai, aur sirf APNI hi party ka OTP dikhta hai.
    // (Pehle OTP khud party ki screen par dikh jata tha = koi bhi kisi ki chat khol leta.)
    // Firm phone karke party ko OTP bata deti hai. Provider ON hote hi ye zaroorat khatam.
    [HttpGet("threads/{id}/otp")]
    public async Task<IActionResult> PartyOtp(Guid id)
    {
        string? phone = null;
        await using (var cmd = await CmdAsync(@"
            SELECT COALESCE(NULLIF(regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g'), ''), t.phone)
            FROM platform.party_chat_threads t
            LEFT JOIN trading.party_profiles p ON p.id = t.party_id
            LEFT JOIN core.contacts c ON c.id = p.contact_id
            WHERE t.id = @t AND t.firm_id = @f"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", id));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            phone = (await cmd.ExecuteScalarAsync()) as string;
        }
        if (phone is null) return NotFound(new { error = "Thread nahi mila" });
        var last10 = phone.Length > 10 ? phone[^10..] : phone;

        // OTP hash me hai (plain kahin nahi rakha) — isliye 10 lakh me se milaan karke
        // nikalte hain. Sirf tab jab party ne abhi-abhi OTP manga ho.
        string? hash = null;
        await using (var cmd = await CmdAsync(@"
            SELECT otp_hash FROM platform.party_chat_otps
            WHERE firm_id = @f AND right(phone, 10) = @ph AND expires_at > now()"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            cmd.Parameters.Add(new NpgsqlParameter("ph", last10));
            hash = (await cmd.ExecuteScalarAsync()) as string;
        }
        if (hash is null)
            return Ok(new { otp = (string?)null, hint = "Party pehle apne phone par link kholkar 'OTP bhejo' dabaye — phir yahan OTP dikhega." });

        for (int i = 100000; i <= 999999; i++)
            if (OtpHash(i.ToString()) == hash)
                return Ok(new { otp = i.ToString(), phone = last10 });
        return Ok(new { otp = (string?)null, hint = "OTP nahi mila — party dobara 'OTP bhejo' dabaye." });
    }

    // ---- Firm: PERSONAL INVITE LINK — har party ka apna code; link sirf usi ke number se khulega ----
    [HttpPost("threads/{id}/invite")]
    public async Task<IActionResult> InviteLink(Guid id)
    {
        Guid partyId;
        await using (var cmd = await CmdAsync(
            "SELECT party_id FROM platform.party_chat_threads WHERE id = @t AND firm_id = @f"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", id));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            var v = await cmd.ExecuteScalarAsync();
            if (v is not Guid pg) return NotFound(new { error = "Thread nahi mila" });
            partyId = pg;
        }
        // Code: 8 akshar, ulajhne wale (0/O/1/I) nahi — ek party ka hamesha WAHI code
        const string set = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
        var buf = RandomNumberGenerator.GetBytes(8);
        var newCode = new string(buf.Select(b => set[b % set.Length]).ToArray());
        string code;
        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_chat_invites (code, firm_id, party_id)
            VALUES (@c, @f, @p)
            ON CONFLICT (firm_id, party_id) DO UPDATE SET firm_id = EXCLUDED.firm_id
            RETURNING code"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("c", newCode));
            cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
            cmd.Parameters.Add(new NpgsqlParameter("p", partyId));
            code = (string)(await cmd.ExecuteScalarAsync())!;
        }
        return Ok(new { code, path = $"/pchat/{CurrentFirmId}?i={code}" });
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
            INSERT INTO platform.party_chat_messages (thread_id, sender, sender_name, body, reply_to_id)
            SELECT id, 'firm', @n, @b,
                   -- reply sirf USI thread ka message ho sakta hai (doosri party ka
                   -- message quote karna galat hoga) — isliye yahin check
                   (SELECT rm.id FROM platform.party_chat_messages rm
                     WHERE rm.id = @rid AND rm.thread_id = @t)
            FROM t RETURNING id");
        cmd.Parameters.Add(new NpgsqlParameter("t", id));
        cmd.Parameters.Add(new NpgsqlParameter("f", CurrentFirmId));
        cmd.Parameters.Add(new NpgsqlParameter("n", CurrentName));
        cmd.Parameters.Add(new NpgsqlParameter("b", dto.Body.Trim()));
        cmd.Parameters.Add(new NpgsqlParameter("rid", (object?)dto.ReplyToId ?? DBNull.Value));
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
    private readonly Namokara.Api.Modules.Suppliers.Services.IBazaarChatBotService _bot;
    private static readonly HttpClient Http = new HttpClient();
    public PartyChatPublicController(AppDbContext db, IWebHostEnvironment env, IHubContext<PartyChatHub> hub,
        Namokara.Api.Modules.Suppliers.Services.IBazaarChatBotService bot)
    { _db = db; _env = env; _hub = hub; _bot = bot; }

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

    // ---- PWA MANIFEST (per-firm) — party link se INSTALL kare to app SIRF PARTY CHAT
    // par khule (us firm ki), poora Vyapaar Setu nahi. Naam bhi firm ka dikhta hai. ----
    [HttpGet("manifest/{firmId}")]
    public async Task<IActionResult> Manifest(Guid firmId)
    {
        string firmName = "Party Chat";
        await using (var cmd = await CmdAsync("SELECT name FROM platform.firms WHERE id = @f"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("f", firmId));
            if (await cmd.ExecuteScalarAsync() is string n && n.Length > 0) firmName = n;
        }
        var shortName = firmName.Split(' ')[0];
        if (shortName.Length > 12) shortName = shortName[..12];
        var json = JsonSerializer.Serialize(new
        {
            name = $"{firmName} — Party Chat",
            short_name = shortName,
            description = $"{firmName} se seedha chat — Vyapaar Setu Party Chat",
            id = $"/pchat/{firmId}",
            start_url = $"/pchat/{firmId}?source=pwa",
            scope = "/pchat/",
            display = "standalone",
            orientation = "portrait",
            background_color = "#FAF7F0",
            theme_color = "#1B2E5C",
            lang = "hi-IN",
            icons = new object[]
            {
                new { src = "/icons/icon-144.png", sizes = "144x144", type = "image/png", purpose = "any" },
                new { src = "/icons/icon-192.png", sizes = "192x192", type = "image/png", purpose = "any" },
                new { src = "/icons/icon-512.png", sizes = "512x512", type = "image/png", purpose = "any" },
                new { src = "/icons/icon-maskable-512.png", sizes = "512x512", type = "image/png", purpose = "maskable" }
            }
        });
        return Content(json, "application/manifest+json");
    }

    // =========================================================================
    // PARTY PORTAL — EK number, SAARI agencies (WhatsApp-ghar jaisa)
    // /pchat (bina firmId): number+OTP ek baar → jitni firms me ye number Party
    // Master me hai, sabki chat-list (DP/unread ke saath) → tap = us firm ki chat.
    // =========================================================================

    public record PortalOtpReqDto(string Phone);
    public record PortalVerifyDto(string Phone, string Otp);
    public record PortalOpenDto(string Token, Guid FirmId);

    /// Is phone wali party JIN firms me hai (party_chat flag ON) — unki list (logo samet)
    private async Task<List<(Guid id, string name, string? logo)>> FirmsForPhone(string phone10)
    {
        var candidates = new List<(Guid id, string name, string? logo)>();
        await using (var cmd = await CmdAsync(@"
            SELECT f.id, f.name, f.logo_url FROM platform.firms f
            WHERE EXISTS (SELECT 1 FROM platform.feature_flags ff WHERE ff.key = 'party_chat'
                   AND (ff.enabled_all OR EXISTS (SELECT 1 FROM platform.feature_flag_firms x
                                                   WHERE x.flag_key = 'party_chat' AND x.firm_id = f.id)))
            ORDER BY f.name"))
        await using (var r = await cmd.ExecuteReaderAsync())
            while (await r.ReadAsync())
                candidates.Add((r.GetGuid(0), r.GetString(1), r.IsDBNull(2) ? null : r.GetString(2)));

        var result = new List<(Guid, string, string?)>();
        foreach (var f in candidates)
        {
            await SetFirmContext(f.id);            // RLS: har firm ka master usi ke context me
            if (await FindParty(f.id, phone10) is not null) result.Add(f);
        }
        return result;
    }

    private async Task<string?> PhoneFromPortalToken(string? token)
    {
        if (string.IsNullOrEmpty(token)) return null;
        await using var cmd = await CmdAsync(
            "SELECT phone FROM platform.party_portal_sessions WHERE token = @t AND expires_at > now()");
        cmd.Parameters.Add(new NpgsqlParameter("t", token));
        return (await cmd.ExecuteScalarAsync()) as string;
    }

    // ---- PORTAL 1) OTP bhejo (bina firm) ----
    [HttpPost("portal/request-otp")]
    public async Task<IActionResult> PortalRequestOtp([FromBody] PortalOtpReqDto dto)
    {
        var phone = Digits(dto.Phone);
        if (phone.Length < 10) return BadRequest(new { error = "Sahi mobile number daalo" });
        phone = phone.Length > 10 ? phone[^10..] : phone;

        var firms = await FirmsForPhone(phone);
        if (firms.Count == 0)
            return BadRequest(new { error = "Ye number kisi bhi agency ke Party Master me nahi mila — apni agency se number judwayein" });

        // 🔐 FLOOD ki rok — 15 min me 3 se zyada OTP nahi
        await using (var fc = await CmdAsync(@"
            SELECT sends FROM platform.party_portal_otps
            WHERE phone = @ph AND created_at > now() - interval '15 minutes'"))
        {
            fc.Parameters.Add(new NpgsqlParameter("ph", phone));
            if (await fc.ExecuteScalarAsync() is int prev && prev >= 3)
                return BadRequest(new { error = "Bahut baar OTP manga — 15 minute baad dobara try karein" });
        }

        var otp = RandomNumberGenerator.GetInt32(100000, 999999).ToString();
        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_portal_otps (phone, otp_hash, expires_at, attempts, sends)
            VALUES (@ph, @h, now() + interval '10 minutes', 0, 1)
            ON CONFLICT (phone) DO UPDATE
              SET otp_hash = @h, expires_at = now() + interval '10 minutes', attempts = 0, created_at = now(),
                  sends = CASE WHEN platform.party_portal_otps.created_at > now() - interval '15 minutes'
                               THEN platform.party_portal_otps.sends + 1 ELSE 1 END"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("ph", phone));
            cmd.Parameters.Add(new NpgsqlParameter("h", Hash(otp)));
            await cmd.ExecuteNonQueryAsync();
        }
        var sent = await TrySendOtpWhatsApp(phone, otp, "Vyapaar Setu");
        // 🔐 OTP sirf DEV me dikhta hai — production me kabhi nahi (warna koi bhi kisi ki chat khol le)
        return Ok(new { otpSent = sent, firmsCount = firms.Count,
                        otpPreview = (!sent && _env.IsDevelopment()) ? otp : null });
    }

    // ---- PORTAL 2) OTP verify → portal token + agencies ki list ----
    [HttpPost("portal/verify")]
    public async Task<IActionResult> PortalVerify([FromBody] PortalVerifyDto dto)
    {
        var phone = Digits(dto.Phone);
        phone = phone.Length > 10 ? phone[^10..] : phone;
        string? hash = null; DateTime? exp = null; int attempts = 0;
        await using (var cmd = await CmdAsync(
            "SELECT otp_hash, expires_at, attempts FROM platform.party_portal_otps WHERE phone = @ph"))
        {
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
            await using var up = await CmdAsync("UPDATE platform.party_portal_otps SET attempts = attempts + 1 WHERE phone = @ph");
            up.Parameters.Add(new NpgsqlParameter("ph", phone));
            await up.ExecuteNonQueryAsync();
            return BadRequest(new { error = "OTP galat hai" });
        }

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_portal_sessions (token, phone, expires_at)
            VALUES (@t, @ph, now() + interval '7 days')"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", token));
            cmd.Parameters.Add(new NpgsqlParameter("ph", phone));
            await cmd.ExecuteNonQueryAsync();
        }
        var firms = await FirmsForPhone(phone);
        return Ok(new { token, firms = firms.Select(f => new { firmId = f.id, firmName = f.name, logoUrl = f.logo }) });
    }

    // ---- PORTAL 3) Agencies ki chat-list (unread + aakhri msg + DP) ----
    [HttpGet("portal/firms")]
    public async Task<IActionResult> PortalFirms([FromQuery] string token)
    {
        var phone = await PhoneFromPortalToken(token);
        if (phone is null) return Unauthorized(new { error = "Session expire — dobara OTP se kholo" });

        var list = new List<object>();
        foreach (var f in await FirmsForPhone(phone))
        {
            Guid? threadId = null; DateTimeOffset? lastAt = null; long unread = 0; string? lastBody = null;
            await using (var cmd = await CmdAsync(@"
                SELECT t.id, t.last_msg_at,
                       (SELECT COUNT(*) FROM platform.party_chat_messages m
                         WHERE m.thread_id = t.id AND m.sender = 'firm' AND m.read_at IS NULL AND NOT m.deleted_for_party),
                       (SELECT m.body FROM platform.party_chat_messages m
                         WHERE m.thread_id = t.id AND NOT m.deleted_for_party ORDER BY m.created_at DESC LIMIT 1)
                FROM platform.party_chat_threads t
                WHERE t.firm_id = @f AND right(regexp_replace(t.phone, '\D', '', 'g'), 10) = @ph
                ORDER BY t.last_msg_at DESC LIMIT 1"))
            {
                cmd.Parameters.Add(new NpgsqlParameter("f", f.id));
                cmd.Parameters.Add(new NpgsqlParameter("ph", phone));
                await using var r = await cmd.ExecuteReaderAsync();
                if (await r.ReadAsync())
                {
                    threadId = r.GetGuid(0);
                    lastAt = r.IsDBNull(1) ? null : r.GetFieldValue<DateTimeOffset>(1);
                    unread = r.IsDBNull(2) ? 0 : r.GetInt64(2);
                    lastBody = r.IsDBNull(3) ? null : r.GetString(3);
                }
            }
            list.Add(new { firmId = f.id, firmName = f.name, logoUrl = f.logo, threadId, lastMsgAt = lastAt, unread, lastBody });
        }
        return Ok(list.OrderByDescending(x => ((dynamic)x).lastMsgAt ?? DateTimeOffset.MinValue).ToList());
    }

    // ---- PORTAL 4) Firm kholo → usi firm ka normal chat-session (sab purana code wahi chalta hai) ----
    [HttpPost("portal/open")]
    public async Task<IActionResult> PortalOpen([FromBody] PortalOpenDto dto)
    {
        var phone = await PhoneFromPortalToken(dto.Token);
        if (phone is null) return Unauthorized(new { error = "Session expire — dobara OTP se kholo" });

        await SetFirmContext(dto.FirmId);
        var party = await FindParty(dto.FirmId, phone);
        if (party is null) return BadRequest(new { error = "Is agency me aapka number ab nahi mila" });

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
        var sessionToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_chat_sessions (token, thread_id, expires_at)
            VALUES (@t, @th, now() + interval '7 days')"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("t", sessionToken));
            cmd.Parameters.Add(new NpgsqlParameter("th", threadId));
            await cmd.ExecuteNonQueryAsync();
        }
        string? firmName = null;
        await using (var fc = await CmdAsync("SELECT name FROM platform.firms WHERE id = @f"))
        {
            fc.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            firmName = (await fc.ExecuteScalarAsync()) as string;
        }
        return Ok(new { token = sessionToken, threadId, firmName, partyName = party.Value.name });
    }

    // ---- Invite ki jankari — link kholte hi "Namaste <party>!" dikhane ko ----
    [HttpGet("invite/{code}")]
    public async Task<IActionResult> InviteInfo(string code)
    {
        Guid firmId = Guid.Empty, partyId = Guid.Empty;
        await using (var cmd = await CmdAsync(
            "SELECT firm_id, party_id FROM platform.party_chat_invites WHERE code = @c"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("c", (code ?? "").Trim().ToUpperInvariant()));
            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync()) return NotFound(new { error = "Invite nahi mila" });
            firmId = r.GetGuid(0); partyId = r.GetGuid(1);
        }
        await SetFirmContext(firmId);
        string? partyName = null, firmName = null;
        await using (var cmd = await CmdAsync(@"
            SELECT c.display_name FROM trading.party_profiles p
            JOIN core.contacts c ON c.id = p.contact_id WHERE p.id = @p"))
        { cmd.Parameters.Add(new NpgsqlParameter("p", partyId)); partyName = (await cmd.ExecuteScalarAsync()) as string; }
        await using (var fc = await CmdAsync("SELECT name FROM platform.firms WHERE id = @f"))
        { fc.Parameters.Add(new NpgsqlParameter("f", firmId)); firmName = (await fc.ExecuteScalarAsync()) as string; }
        return Ok(new { firmId, firmName, partyName });
    }

    // ---- PORTAL manifest — generic "Vyapaar Setu Chat" app, khulti /pchat par ----
    [HttpGet("manifest-portal")]
    public IActionResult ManifestPortal()
    {
        var json = JsonSerializer.Serialize(new
        {
            name = "Vyapaar Setu — Party Chat",
            short_name = "VS Chat",
            description = "Apni saari agencies se ek jagah chat — Vyapaar Setu",
            id = "/pchat",
            start_url = "/pchat?source=pwa",
            scope = "/pchat",
            display = "standalone",
            orientation = "portrait",
            background_color = "#FAF7F0",
            theme_color = "#1B2E5C",
            lang = "hi-IN",
            icons = new object[]
            {
                new { src = "/icons/icon-144.png", sizes = "144x144", type = "image/png", purpose = "any" },
                new { src = "/icons/icon-192.png", sizes = "192x192", type = "image/png", purpose = "any" },
                new { src = "/icons/icon-512.png", sizes = "512x512", type = "image/png", purpose = "any" },
                new { src = "/icons/icon-maskable-512.png", sizes = "512x512", type = "image/png", purpose = "maskable" }
            }
        });
        return Content(json, "application/manifest+json");
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

        // PERSONAL LINK ka pehra — invite-code wala link SIRF usi party ke number se khule
        if (!string.IsNullOrWhiteSpace(dto.InviteCode))
        {
            Guid? invParty = null;
            await using (var ic = await CmdAsync(
                "SELECT party_id FROM platform.party_chat_invites WHERE code = @c AND firm_id = @f"))
            {
                ic.Parameters.Add(new NpgsqlParameter("c", dto.InviteCode.Trim().ToUpperInvariant()));
                ic.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
                invParty = (await ic.ExecuteScalarAsync()) as Guid?;
            }
            if (invParty is null)
                return BadRequest(new { error = "Ye invite link sahi nahi hai — firm se naya link mangwayein" });
            if (invParty.Value != party.Value.partyId)
            {
                string invName = "kisi aur party";
                await using (var nc = await CmdAsync(@"
                    SELECT c.display_name FROM trading.party_profiles p
                    JOIN core.contacts c ON c.id = p.contact_id WHERE p.id = @p"))
                {
                    nc.Parameters.Add(new NpgsqlParameter("p", invParty.Value));
                    invName = ((await nc.ExecuteScalarAsync()) as string) ?? invName;
                }
                return BadRequest(new { error = $"Ye personal link \"{invName}\" ke liye hai — aap apne wale link se kholein ya firm se apna link mangwayein" });
            }
            await using (var uc = await CmdAsync(
                "UPDATE platform.party_chat_invites SET last_used_at = now() WHERE code = @c"))
            { uc.Parameters.Add(new NpgsqlParameter("c", dto.InviteCode.Trim().ToUpperInvariant())); await uc.ExecuteNonQueryAsync(); }
        }

        string? firmName = null;
        await using (var fc = await CmdAsync("SELECT name FROM platform.firms WHERE id = @f"))
        {
            fc.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            firmName = (await fc.ExecuteScalarAsync()) as string;
        }

        // 🔐 FLOOD ki rok — 15 min me 3 se zyada OTP nahi (na spam, na anginat guess-rounds)
        await using (var fc = await CmdAsync(@"
            SELECT sends FROM platform.party_chat_otps
            WHERE firm_id = @f AND phone = @ph AND created_at > now() - interval '15 minutes'"))
        {
            fc.Parameters.Add(new NpgsqlParameter("f", dto.FirmId));
            fc.Parameters.Add(new NpgsqlParameter("ph", phone));
            if (await fc.ExecuteScalarAsync() is int prev && prev >= 3)
                return BadRequest(new { error = "Bahut baar OTP manga — 15 minute baad dobara try karein" });
        }

        var otp = RandomNumberGenerator.GetInt32(100000, 999999).ToString();
        await using (var cmd = await CmdAsync(@"
            INSERT INTO platform.party_chat_otps (firm_id, phone, otp_hash, expires_at, attempts, sends)
            VALUES (@f, @ph, @h, now() + interval '10 minutes', 0, 1)
            ON CONFLICT (firm_id, phone) DO UPDATE
              SET otp_hash = @h, expires_at = now() + interval '10 minutes', attempts = 0, created_at = now(),
                  sends = CASE WHEN platform.party_chat_otps.created_at > now() - interval '15 minutes'
                               THEN platform.party_chat_otps.sends + 1 ELSE 1 END"))
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
            // 🔐 OTP sirf DEV me — production me kabhi screen par nahi
            otpPreview = (!sent && _env.IsDevelopment()) ? otp : null
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
            SELECT m.id, m.sender, m.sender_name, m.body, m.read_at, m.created_at,
                   m.attachment_url, m.attachment_name, m.attachment_type,
                   rm.body, rm.sender, rm.sender_name
            FROM platform.party_chat_messages m
            LEFT JOIN platform.party_chat_messages rm ON rm.id = m.reply_to_id
            WHERE m.thread_id = @t AND NOT m.deleted_for_party ORDER BY m.created_at"))
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
                    attachmentType = r.IsDBNull(8) ? null : r.GetString(8),
                    replyBody = r.IsDBNull(9) ? null : r.GetString(9),
                    replySender = r.IsDBNull(10) ? null : r.GetString(10),
                    replySenderName = r.IsDBNull(11) ? null : r.GetString(11)
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
        // BAZAAR BOT — supplier ki stock-photo ho to watermark + buyers ko bhejo (fail-soft)
        await _bot.HandlePartyMessageAsync(threadId.Value, body, Path.GetFileName(url!), type);
        return Ok(new { ok = true });
    }

    public record PchatMultiOrderDto(string Token, List<string> Codes);

    // ---- Party (buyer): kai photo TICK karke EK SAATH order (ek order, kai item) ----
    [HttpPost("multi-order")]
    public async Task<IActionResult> MultiOrder([FromBody] PchatMultiOrderDto dto)
    {
        var threadId = await ThreadFromToken(dto.Token);
        if (threadId is null) return Unauthorized(new { error = "Session expire — dobara OTP se kholo" });
        if (dto.Codes is null || dto.Codes.Count == 0) return BadRequest(new { error = "Koi photo nahi chuni" });
        if (dto.Codes.Count > 20) return BadRequest(new { error = "Ek baar me 20 se zyada nahi" });

        var (ok, err) = await _bot.StartMultiOrderAsync(threadId.Value, dto.Codes);
        return ok ? Ok(new { ok = true }) : BadRequest(new { error = err ?? "Order shuru nahi hua" });
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
            INSERT INTO platform.party_chat_messages (thread_id, sender, sender_name, body, reply_to_id)
            SELECT id, 'party', party_name, @b,
                   -- reply sirf ISI thread ka message ho sakta hai
                   (SELECT rm.id FROM platform.party_chat_messages rm
                     WHERE rm.id = @rid AND rm.thread_id = @t)
            FROM platform.party_chat_threads WHERE id = @t"))
        {
            cmd.Parameters.Add(new NpgsqlParameter("b", dto.Body.Trim()));
            cmd.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
            cmd.Parameters.Add(new NpgsqlParameter("rid", (object?)dto.ReplyToId ?? DBNull.Value));
            await cmd.ExecuteNonQueryAsync();
        }
        await TouchAndNotify(threadId.Value);
        // BAZAAR BOT — rate/ORDER/search + photo-par-reply (quote se code khud samjhega)
        await _bot.HandlePartyMessageAsync(threadId.Value, dto.Body, null, null, dto.ReplyToId);
        return Ok(new { ok = true });
    }
}
