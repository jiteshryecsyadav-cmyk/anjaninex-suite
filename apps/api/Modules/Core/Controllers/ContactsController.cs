using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Core.Controllers;

// =============================================================================
// CORE MASTER (Phase 2)
// core.contacts is the single source of truth for a person/business's common
// data (name, phone, GST, PAN, address). Trading / Active Directory / HR all
// SHARE this. Common fields are edited ONLY here — so they can never go out of
// sync across modules.
// =============================================================================

public record CoreContactDto(
    Guid Id,
    string DisplayName,
    string? LegalName,
    string? Phone,
    string? Email,
    string? Gst,
    string? Pan,
    string? Address,
    string? City,
    string? State,
    string? Pincode,
    bool IsParty,
    bool IsSupplier,
    bool IsStaff,
    bool IsBuyer = false,
    string? SupplierWa = null,
    string? BuyerWa = null,
    string? GroupName = null);

public record UpdateCoreContactDto(
    string DisplayName,
    string? LegalName,
    string? Phone,
    string? Email,
    string? Gst,
    string? Pan,
    string? Address,
    string? City,
    string? State,
    string? Pincode,
    string? SupplierWa = null,
    string? BuyerWa = null,
    string? GroupName = null);

public record SaveGroupMembersDto(string GroupName, List<Guid> MemberIds);

[ApiController]
[Authorize]
[Route("api/core/contacts")]
public class ContactsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ContactsController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search)
    {
        var firmId = CurrentFirmId;
        var q = _db.Contacts.Where(c => c.FirmId == firmId && c.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(c => Microsoft.EntityFrameworkCore.EF.Functions.ILike(c.DisplayName, $"%{s}%")
                          || (c.PhonePrimary != null && c.PhonePrimary.Contains(s))
                          || (c.GstNumber != null && c.GstNumber.Contains(s)));
        }
        var rows = await q.OrderBy(c => c.DisplayName).Take(300).ToListAsync();
        return Ok(rows.Select(ToDto).ToList());
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var c = await _db.Contacts.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (c is null) return NotFound();

        // Bot ke 2 WhatsApp number — supplier/buyer profiles se (Active Directory).
        var sup = await _db.SupplierProfiles.FirstOrDefaultAsync(s => s.FirmId == CurrentFirmId && s.ContactId == id);
        var buy = await _db.BuyerProfiles.FirstOrDefaultAsync(b => b.FirmId == CurrentFirmId && b.ContactId == id);
        var dto = ToDto(c) with
        {
            IsSupplier = sup != null,
            IsBuyer = buy != null,
            SupplierWa = c.WaSupplier,   // common (core.contacts) — single source
            BuyerWa = c.WaBuyer
        };
        return Ok(dto);
    }

    // Group names — MASTER TABLE (khali groups bhi) + contacts par likhe groups (legacy) ka union.
    // Isliye "pehle naam save karo, firms baad me tick karo" flow kaam karta hai.
    [HttpGet("groups")]
    public async Task<IActionResult> Groups()
    {
        var firmId = CurrentFirmId;
        var groups = new List<string>();
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using (var cmd = new NpgsqlCommand(@"
            SELECT name FROM core.party_groups WHERE firm_id = @f
            UNION
            SELECT DISTINCT group_name FROM core.contacts
            WHERE firm_id = @f AND deleted_at IS NULL AND coalesce(group_name,'') <> ''
            ORDER BY 1", conn))
        {
            cmd.Parameters.AddWithValue("f", firmId);
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync()) groups.Add(r.GetString(0));
        }
        return Ok(groups);
    }

    // GROUP MASTER — poori detail. Save par sab member (sister) firms me auto-sync.
    public record GroupDetailDto(
        string Name, string? OwnerName = null, string? Address = null, string? Mobile = null,
        string? Whatsapp = null, string? City = null, string? Pincode = null, string? State = null,
        decimal Commission = 0, decimal DiscountNormal = 0, decimal DiscountExhibition = 0,
        decimal DiscountSpecial = 0, string? PaymentTerms = null,
        string? Address2 = null, string? PartyType = null, string? BuyerType = null,
        string? ExhibitionFrom = null, string? ExhibitionTo = null,
        decimal PurchaseDiscPct = 0);

    [HttpGet("groups/detail")]
    public async Task<IActionResult> GroupDetails()
    {
        var firmId = CurrentFirmId;
        var list = new List<GroupDetailDto>();
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(@"
            SELECT name, owner_name, address, mobile, whatsapp, city, pincode, state,
                   commission, discount_normal, discount_exhibition, discount_special, payment_terms,
                   address2, party_type, buyer_type, exhibition_from, exhibition_to,
                   COALESCE(purchase_disc_pct,0)
            FROM core.party_groups WHERE firm_id = @f ORDER BY name", conn);
        cmd.Parameters.AddWithValue("f", firmId);
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new GroupDetailDto(
                r.GetString(0),
                r.IsDBNull(1) ? null : r.GetString(1), r.IsDBNull(2) ? null : r.GetString(2),
                r.IsDBNull(3) ? null : r.GetString(3), r.IsDBNull(4) ? null : r.GetString(4),
                r.IsDBNull(5) ? null : r.GetString(5), r.IsDBNull(6) ? null : r.GetString(6),
                r.IsDBNull(7) ? null : r.GetString(7),
                r.GetDecimal(8), r.GetDecimal(9), r.GetDecimal(10), r.GetDecimal(11),
                r.IsDBNull(12) ? null : r.GetString(12),
                r.IsDBNull(13) ? null : r.GetString(13), r.IsDBNull(14) ? null : r.GetString(14),
                r.IsDBNull(15) ? null : r.GetString(15),
                r.IsDBNull(16) ? null : r.GetDateTime(16).ToString("yyyy-MM-dd"),
                r.IsDBNull(17) ? null : r.GetDateTime(17).ToString("yyyy-MM-dd"),
                r.GetDecimal(18)));
        return Ok(list);
    }

    [HttpPost("groups")]
    public async Task<IActionResult> CreateGroup([FromBody] GroupDetailDto dto)
    {
        var firmId = CurrentFirmId;
        var name = (dto.Name ?? "").Trim();
        if (string.IsNullOrEmpty(name)) return BadRequest(new { error = "Group naam zaroori hai." });
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using (var cmd = new NpgsqlCommand(@"
            INSERT INTO core.party_groups
                (firm_id, name, owner_name, address, mobile, whatsapp, city, pincode, state,
                 commission, discount_normal, discount_exhibition, discount_special, payment_terms,
                 address2, party_type, buyer_type, exhibition_from, exhibition_to, purchase_disc_pct)
            VALUES (@f, @n, @own, @adr, @mob, @wa, @city, @pin, @st, @com, @dn, @de, @ds, @pt,
                 @adr2, @ptype, @btype, @exf, @ext, @pdisc)
            ON CONFLICT (firm_id, name) DO UPDATE SET
                owner_name = EXCLUDED.owner_name, address = EXCLUDED.address,
                mobile = EXCLUDED.mobile, whatsapp = EXCLUDED.whatsapp,
                city = EXCLUDED.city, pincode = EXCLUDED.pincode, state = EXCLUDED.state,
                commission = EXCLUDED.commission,
                discount_normal = EXCLUDED.discount_normal,
                discount_exhibition = EXCLUDED.discount_exhibition,
                discount_special = EXCLUDED.discount_special,
                payment_terms = EXCLUDED.payment_terms,
                address2 = EXCLUDED.address2, party_type = EXCLUDED.party_type,
                buyer_type = EXCLUDED.buyer_type,
                exhibition_from = EXCLUDED.exhibition_from,
                exhibition_to = EXCLUDED.exhibition_to,
                purchase_disc_pct = EXCLUDED.purchase_disc_pct", conn))
        {
            cmd.Parameters.AddWithValue("f", firmId);
            cmd.Parameters.AddWithValue("n", name);
            cmd.Parameters.AddWithValue("own", (object?)dto.OwnerName ?? DBNull.Value);
            cmd.Parameters.AddWithValue("adr", (object?)dto.Address ?? DBNull.Value);
            cmd.Parameters.AddWithValue("mob", (object?)dto.Mobile ?? DBNull.Value);
            cmd.Parameters.AddWithValue("wa", (object?)dto.Whatsapp ?? DBNull.Value);
            cmd.Parameters.AddWithValue("city", (object?)dto.City ?? DBNull.Value);
            cmd.Parameters.AddWithValue("pin", (object?)dto.Pincode ?? DBNull.Value);
            cmd.Parameters.AddWithValue("st", (object?)dto.State ?? DBNull.Value);
            cmd.Parameters.AddWithValue("com", dto.Commission);
            cmd.Parameters.AddWithValue("dn", dto.DiscountNormal);
            cmd.Parameters.AddWithValue("de", dto.DiscountExhibition);
            cmd.Parameters.AddWithValue("ds", dto.DiscountSpecial);
            cmd.Parameters.AddWithValue("pt", (object?)dto.PaymentTerms ?? DBNull.Value);
            cmd.Parameters.AddWithValue("adr2", (object?)dto.Address2 ?? DBNull.Value);
            cmd.Parameters.AddWithValue("ptype", (object?)(dto.PartyType ?? "supplier"));
            cmd.Parameters.AddWithValue("btype", (object?)dto.BuyerType ?? DBNull.Value);
            cmd.Parameters.AddWithValue("exf", string.IsNullOrWhiteSpace(dto.ExhibitionFrom) ? DBNull.Value : (object)DateOnly.Parse(dto.ExhibitionFrom));
            cmd.Parameters.AddWithValue("ext", string.IsNullOrWhiteSpace(dto.ExhibitionTo) ? DBNull.Value : (object)DateOnly.Parse(dto.ExhibitionTo));
            cmd.Parameters.AddWithValue("pdisc", dto.PurchaseDiscPct);
            await cmd.ExecuteNonQueryAsync();
        }
        await SyncGroupToMembersAsync(conn, firmId, name);
        return Ok(new { group = name });
    }

    // Group ka data uski SAB member firms me utaro — jo field group me bhari hai wahi sync hoti hai
    private static async Task SyncGroupToMembersAsync(NpgsqlConnection conn, Guid firmId, string name)
    {
        // Contacts: mobile + whatsapp (khali ho to member ka apna hi rahe)
        await using (var c1 = new NpgsqlCommand(@"
            UPDATE core.contacts c SET
                phone_primary = COALESCE(NULLIF(g.mobile, ''), c.phone_primary),
                wa_supplier   = COALESCE(NULLIF(g.whatsapp, ''), c.wa_supplier),
                updated_at = now()
            FROM core.party_groups g
            WHERE g.firm_id = @f AND g.name = @n
              AND c.firm_id = @f AND c.group_name = @n AND c.deleted_at IS NULL", conn))
        {
            c1.Parameters.AddWithValue("f", firmId);
            c1.Parameters.AddWithValue("n", name);
            await c1.ExecuteNonQueryAsync();
        }
        // Address (group me address/city/pin/state me se kuch bhi bhara ho tabhi)
        await using (var c2 = new NpgsqlCommand(@"
            UPDATE core.contacts c SET
                addresses = jsonb_build_array(jsonb_build_object(
                    'type','billing',
                    'line1',   COALESCE(g.address, ''),
                    'line2',   COALESCE(g.address2, ''),
                    'city',    COALESCE(g.city, ''),
                    'state',   COALESCE(g.state, ''),
                    'pincode', COALESCE(g.pincode, ''))),
                updated_at = now()
            FROM core.party_groups g
            WHERE g.firm_id = @f AND g.name = @n
              AND c.firm_id = @f AND c.group_name = @n AND c.deleted_at IS NULL
              AND (COALESCE(g.address,'') <> '' OR COALESCE(g.city,'') <> ''
                OR COALESCE(g.pincode,'') <> '' OR COALESCE(g.state,'') <> '')", conn))
        {
            c2.Parameters.AddWithValue("f", firmId);
            c2.Parameters.AddWithValue("n", name);
            await c2.ExecuteNonQueryAsync();
        }
        // Party profile: commission + discounts + payment terms (netXX → credit days)
        await using (var c3 = new NpgsqlCommand(@"
            UPDATE trading.party_profiles p SET
                commission_rate     = CASE WHEN g.commission          > 0 THEN g.commission          ELSE p.commission_rate     END,
                discount_normal     = CASE WHEN g.discount_normal     > 0 THEN g.discount_normal     ELSE p.discount_normal     END,
                discount_exhibition = CASE WHEN g.discount_exhibition > 0 THEN g.discount_exhibition ELSE p.discount_exhibition END,
                discount_special    = CASE WHEN g.discount_special    > 0 THEN g.discount_special    ELSE p.discount_special    END,
                credit_days         = CASE WHEN COALESCE(g.payment_terms,'') ~ '^net[0-9]+$'
                                           THEN substring(g.payment_terms from 4)::int
                                           ELSE p.credit_days END,
                updated_at = now()
            FROM core.party_groups g, core.contacts c
            WHERE g.firm_id = @f AND g.name = @n
              AND c.firm_id = @f AND c.group_name = @n AND c.deleted_at IS NULL
              AND p.contact_id = c.id AND p.firm_id = @f", conn))
        {
            c3.Parameters.AddWithValue("f", firmId);
            c3.Parameters.AddWithValue("n", name);
            await c3.ExecuteNonQueryAsync();
        }
    }

    // Ek group ke members set karo (ticked = is group me, unticked jo pehle the = hata do).
    [HttpPost("groups/save-members")]
    public async Task<IActionResult> SaveGroupMembers([FromBody] SaveGroupMembersDto dto)
    {
        var firmId = CurrentFirmId;
        var name = (dto.GroupName ?? "").Trim();
        if (string.IsNullOrEmpty(name)) return BadRequest(new { error = "Group naam zaroori hai." });
        var ids = dto.MemberIds ?? new List<Guid>();

        var members = await _db.Contacts.Where(c => c.FirmId == firmId && ids.Contains(c.Id)).ToListAsync();

        // EK PARTY = EK GROUP: dusre group wali party yahan add nahi hogi — pehle wahan se hatao
        var clash = members.Where(c => !string.IsNullOrEmpty(c.GroupName) && c.GroupName != name)
                           .Select(c => $"{c.DisplayName} ({c.GroupName})").ToList();
        if (clash.Count > 0)
            return BadRequest(new { error = $"Ye parties pehle se dusre group me hain: {string.Join(", ", clash)}. Pehle wahan se hatao." });

        foreach (var c in members) { c.GroupName = name; c.UpdatedAt = DateTimeOffset.UtcNow; }

        var removed = await _db.Contacts.Where(c => c.FirmId == firmId && c.GroupName == name && !ids.Contains(c.Id)).ToListAsync();
        foreach (var c in removed) { c.GroupName = null; c.UpdatedAt = DateTimeOffset.UtcNow; }

        await _db.SaveChangesAsync();

        // Group naam master me bhi pakka save (0 members par bhi group zinda rahe)
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using (var up = new NpgsqlCommand(
            "INSERT INTO core.party_groups (firm_id, name) VALUES (@f, @n) ON CONFLICT DO NOTHING", conn))
        {
            up.Parameters.AddWithValue("f", firmId);
            up.Parameters.AddWithValue("n", name);
            await up.ExecuteNonQueryAsync();
        }

        // Naye members me group ka data auto-sync (mobile/address/commission/discounts/terms)
        await SyncGroupToMembersAsync(conn, firmId, name);

        return Ok(new { group = name, members = members.Count, removed = removed.Count });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpdateCoreContactDto dto)
    {
        var firmId = CurrentFirmId;
        var gstClean = string.IsNullOrWhiteSpace(dto.Gst) ? null : dto.Gst.Trim().ToUpperInvariant();
        var phoneClean = NormalizePhone(dto.Phone);

        // Duplicate guard — GST ya phone se (Phase 1 logic). Same banda dobara na bane.
        if (gstClean != null)
        {
            var clash = await _db.Contacts.AnyAsync(x => x.FirmId == firmId && x.GstNumber == gstClean && x.DeletedAt == null);
            if (clash) return BadRequest(new { error = "Is GST number par contact pehle se hai." });
        }
        if (phoneClean != null)
        {
            var clash = await _db.Contacts.AnyAsync(x => x.FirmId == firmId && x.PhonePrimary == phoneClean && x.DeletedAt == null);
            if (clash) return BadRequest(new { error = "Is phone number par contact pehle se hai." });
        }

        var addresses = "[]";
        if (!string.IsNullOrEmpty(dto.Address) || !string.IsNullOrEmpty(dto.City))
        {
            var addrList = new[] { new {
                type = "billing", line1 = dto.Address ?? "",
                city = dto.City ?? "", state = dto.State ?? "", pincode = dto.Pincode ?? "" } };
            addresses = System.Text.Json.JsonSerializer.Serialize(addrList);
        }

        var c = new Namokara.Api.Modules.Core.Entities.Contact
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            DisplayName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.DisplayName),
            LegalName = Namokara.Api.Common.Text.NameCase.TitleCaseOrNull(dto.LegalName),
            EntityType = "proprietorship",
            PhonePrimary = phoneClean ?? dto.Phone?.Trim(),
            WaSupplier = string.IsNullOrWhiteSpace(dto.SupplierWa) ? null : dto.SupplierWa.Trim(),
            WaBuyer = string.IsNullOrWhiteSpace(dto.BuyerWa) ? null : dto.BuyerWa.Trim(),
            EmailPrimary = dto.Email?.Trim(),
            GstNumber = gstClean,
            PanNumber = string.IsNullOrWhiteSpace(dto.Pan) ? null : dto.Pan.Trim().ToUpperInvariant(),
            Addresses = addresses,
            Flags = "{}",
            GroupName = string.IsNullOrWhiteSpace(dto.GroupName) ? null : dto.GroupName.Trim(),
            SourceModule = "core_master",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Contacts.Add(c);
        await _db.SaveChangesAsync();
        return Ok(ToDto(c));
    }

    // Counts for dashboards/headers — supplier / buyer / both / total contact.
    [HttpGet("counts")]
    public async Task<IActionResult> Counts()
    {
        var firmId = CurrentFirmId;

        // SINGLE DEFINITION (sab screen same): ek contact supplier hai agar woh
        // Active Directory me supplier ho YA Trading me seller/both party ho.
        // Buyer bhi isi tarah. "both" = dono. Distinct contacts par count.
        var supAd = await _db.SupplierProfiles
            .Where(s => s.FirmId == firmId && s.IsActive).Select(s => s.ContactId).ToListAsync();
        var buyAd = await _db.BuyerProfiles
            .Where(b => b.FirmId == firmId && b.IsActive).Select(b => b.ContactId).ToListAsync();
        var partySup = await _db.PartyProfiles
            .Where(p => p.FirmId == firmId && p.IsActive && (p.PartyType == "seller" || p.PartyType == "both"))
            .Select(p => p.ContactId).ToListAsync();
        var partyBuy = await _db.PartyProfiles
            .Where(p => p.FirmId == firmId && p.IsActive && (p.PartyType == "buyer" || p.PartyType == "both"))
            .Select(p => p.ContactId).ToListAsync();

        var supplierIds = supAd.Union(partySup).Distinct().ToList();
        var buyerIds = buyAd.Union(partyBuy).Distinct().ToList();

        // "both" = woh contact jo supplier AND buyer dono me hai.
        var bothCount = supplierIds.Intersect(buyerIds).Count();
        var contactCount = await _db.Contacts.CountAsync(c => c.FirmId == firmId && c.DeletedAt == null);
        var staffCount = await _db.EmployeeProfiles.CountAsync(e => e.FirmId == firmId && e.IsActive);

        return Ok(new
        {
            suppliers = supplierIds.Count,
            buyers = buyerIds.Count,
            both = bothCount,
            staff = staffCount,
            contacts = contactCount
        });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var firmId = CurrentFirmId;
        var c = await _db.Contacts.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == firmId);
        if (c is null) return NotFound();

        // SAFETY: agar ye contact kisi module me use ho raha hai to delete na karein —
        // warna Trading/AD/HR ka data toot jayega. Pehle wahan se hatao.
        var inParty = await _db.PartyProfiles.AnyAsync(p => p.FirmId == firmId && p.ContactId == id);
        var inSupplier = await _db.SupplierProfiles.AnyAsync(s => s.FirmId == firmId && s.ContactId == id);
        var inBuyer = await _db.BuyerProfiles.AnyAsync(b => b.FirmId == firmId && b.ContactId == id);
        var inStaff = await _db.EmployeeProfiles.AnyAsync(e => e.FirmId == firmId && e.ContactId == id);

        if (inParty || inSupplier || inBuyer || inStaff)
        {
            var used = new List<string>();
            if (inParty) used.Add("Trading");
            if (inSupplier || inBuyer) used.Add("Active Directory");
            if (inStaff) used.Add("HR");
            return BadRequest(new { error = $"Delete nahi ho sakta — ye contact {string.Join(", ", used)} me use ho raha hai. Pehle wahan se hatao." });
        }

        c.DeletedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCoreContactDto dto)
    {
        var c = await _db.Contacts.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (c is null) return NotFound();

        var gstClean = string.IsNullOrWhiteSpace(dto.Gst) ? null : dto.Gst.Trim().ToUpperInvariant();
        var phoneClean = NormalizePhone(dto.Phone);

        // Guard: don't allow editing GST/phone to a value that already belongs to
        // ANOTHER contact in this firm (would create a duplicate / mismatch).
        if (gstClean != null)
        {
            var clash = await _db.Contacts.AnyAsync(x => x.FirmId == CurrentFirmId
                && x.Id != id && x.GstNumber == gstClean && x.DeletedAt == null);
            if (clash) return BadRequest(new { error = "Is GST number par doosri party pehle se hai." });
        }
        if (phoneClean != null)
        {
            var clash = await _db.Contacts.AnyAsync(x => x.FirmId == CurrentFirmId
                && x.Id != id && x.PhonePrimary == phoneClean && x.DeletedAt == null);
            if (clash) return BadRequest(new { error = "Is phone number par doosri party pehle se hai." });
        }

        c.DisplayName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.DisplayName);
        c.LegalName = Namokara.Api.Common.Text.NameCase.TitleCaseOrNull(dto.LegalName);
        c.PhonePrimary = phoneClean ?? dto.Phone?.Trim();
        c.EmailPrimary = dto.Email?.Trim();
        c.GstNumber = gstClean;
        c.PanNumber = string.IsNullOrWhiteSpace(dto.Pan) ? null : dto.Pan.Trim().ToUpperInvariant();
        c.GroupName = string.IsNullOrWhiteSpace(dto.GroupName) ? null : dto.GroupName.Trim();
        if (dto.Address != null || dto.City != null || dto.State != null || dto.Pincode != null)
        {
            // Per-field MERGE — blank aaye to purana value rakho (warna address wipe ho jaata tha).
            string oldLine1 = "", oldCity = "", oldState = "", oldPin = "";
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(c.Addresses ?? "[]");
                if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
                {
                    var a0 = doc.RootElement[0];
                    string G(string k) => a0.TryGetProperty(k, out var v) ? (v.GetString() ?? "") : "";
                    oldLine1 = G("line1"); oldCity = G("city"); oldState = G("state"); oldPin = G("pincode");
                }
            }
            catch { /* corrupt JSON — fresh likho */ }

            string Pick(string? incoming, string old) => string.IsNullOrWhiteSpace(incoming) ? old : incoming.Trim();
            var addrList = new[]
            {
                new
                {
                    type = "billing",
                    line1 = Pick(dto.Address, oldLine1),
                    city = Pick(dto.City, oldCity),
                    state = Pick(dto.State, oldState),
                    pincode = Pick(dto.Pincode, oldPin)
                }
            };
            c.Addresses = System.Text.Json.JsonSerializer.Serialize(addrList);
        }
        c.UpdatedAt = DateTimeOffset.UtcNow;

        // Keep the linked ledger / supplier display name in sync so the new name
        // shows everywhere immediately.
        var ledgers = await _db.Ledgers.Where(l => l.ContactId == c.Id).ToListAsync();
        foreach (var l in ledgers) l.Name = c.DisplayName;

        // Bot ke 2 WhatsApp number — COMMON (core.contacts) = single source.
        if (dto.SupplierWa != null)
            c.WaSupplier = string.IsNullOrWhiteSpace(dto.SupplierWa) ? null : dto.SupplierWa.Trim();
        if (dto.BuyerWa != null)
            c.WaBuyer = string.IsNullOrWhiteSpace(dto.BuyerWa) ? null : dto.BuyerWa.Trim();

        // AD profiles me bhi sync (taaki AD forms consistent rahein).
        var sup = await _db.SupplierProfiles.FirstOrDefaultAsync(s => s.FirmId == CurrentFirmId && s.ContactId == c.Id);
        if (sup != null) { sup.WaPhone = c.WaSupplier; sup.UpdatedAt = DateTimeOffset.UtcNow; }
        var buy = await _db.BuyerProfiles.FirstOrDefaultAsync(b => b.FirmId == CurrentFirmId && b.ContactId == c.Id);
        if (buy != null) { buy.WaPhone = c.WaBuyer; buy.UpdatedAt = DateTimeOffset.UtcNow; }

        await _db.SaveChangesAsync();

        var outDto = ToDto(c) with
        {
            IsSupplier = sup != null, IsBuyer = buy != null,
            SupplierWa = c.WaSupplier, BuyerWa = c.WaBuyer
        };
        return Ok(outDto);
    }

    private CoreContactDto ToDto(Namokara.Api.Modules.Core.Entities.Contact c)
    {
        string? city = null, state = null, pincode = null, line1 = null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(c.Addresses ?? "[]");
            if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array
                && doc.RootElement.GetArrayLength() > 0)
            {
                var a = doc.RootElement[0];
                if (a.TryGetProperty("line1", out var l)) line1 = l.GetString();
                if (a.TryGetProperty("city", out var ci)) city = ci.GetString();
                if (a.TryGetProperty("state", out var s)) state = s.GetString();
                if (a.TryGetProperty("pincode", out var p)) pincode = p.GetString();
            }
        }
        catch { }

        bool flag(string key)
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(c.Flags ?? "{}");
                return doc.RootElement.TryGetProperty(key, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.True;
            }
            catch { return false; }
        }

        return new CoreContactDto(
            c.Id, c.DisplayName, c.LegalName, c.PhonePrimary, c.EmailPrimary,
            c.GstNumber, c.PanNumber, line1, city, state, pincode,
            flag("is_party"), flag("is_supplier"), flag("is_staff"),
            GroupName: c.GroupName);
    }

    /// <summary>Normalize Indian phone: digits only, last 10. Null if &lt;10 digits.</summary>
    private static string? NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return null;
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length > 10) digits = digits.Substring(digits.Length - 10);
        return digits.Length == 10 ? digits : null;
    }
}
