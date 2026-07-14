using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;

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
    public PartyChatController(AppDbContext db) => _db = db;

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
        await using var cmd = await CmdAsync(@"
            SELECT t.id, t.party_name, t.phone, t.last_msg_at,
                   (SELECT COUNT(*) FROM platform.party_chat_messages m
                     WHERE m.thread_id = t.id AND m.sender = 'party' AND m.read_at IS NULL) AS unread,
                   (SELECT m.body FROM platform.party_chat_messages m
                     WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_body
            FROM platform.party_chat_threads t
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
            SELECT m.id, m.sender, m.sender_name, m.body, m.read_at, m.created_at
            FROM platform.party_chat_messages m
            JOIN platform.party_chat_threads t ON t.id = m.thread_id
            WHERE m.thread_id = @t AND t.firm_id = @f
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
                    createdAt = r.GetFieldValue<DateTimeOffset>(5)
                });
        }
        return Ok(list);
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
        return Ok(new { ok = true });
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
    private static readonly HttpClient Http = new HttpClient();
    public PartyChatPublicController(AppDbContext db) => _db = db;

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

    // Phone se firm ki party dhundo (last-10-digit match)
    private async Task<(Guid partyId, string name)?> FindParty(Guid firmId, string phoneDigits)
    {
        var last10 = phoneDigits.Length > 10 ? phoneDigits[^10..] : phoneDigits;
        await using var cmd = await CmdAsync(@"
            SELECT p.id, c.display_name
            FROM trading.party_profiles p JOIN core.contacts c ON c.id = p.contact_id
            WHERE p.firm_id = @f AND regexp_replace(COALESCE(c.phone_primary,''), '\D', '', 'g') LIKE '%' || @ph
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

    // Token → threadId (expired = null)
    private async Task<Guid?> ThreadFromToken(string token)
    {
        await using var cmd = await CmdAsync(
            "SELECT thread_id FROM platform.party_chat_sessions WHERE token = @t AND expires_at > now()");
        cmd.Parameters.Add(new NpgsqlParameter("t", token ?? ""));
        var v = await cmd.ExecuteScalarAsync();
        return v is Guid g ? g : null;
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
            SELECT id, sender, sender_name, body, read_at, created_at
            FROM platform.party_chat_messages WHERE thread_id = @t ORDER BY created_at"))
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
                    createdAt = r.GetFieldValue<DateTimeOffset>(5)
                });
        }
        return Ok(new { firmName, partyName, messages = list });
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
        await using (var touch = await CmdAsync("UPDATE platform.party_chat_threads SET last_msg_at = now() WHERE id = @t"))
        {
            touch.Parameters.Add(new NpgsqlParameter("t", threadId.Value));
            await touch.ExecuteNonQueryAsync();
        }
        return Ok(new { ok = true });
    }
}
