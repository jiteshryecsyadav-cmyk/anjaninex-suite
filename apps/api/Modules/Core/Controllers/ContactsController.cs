using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

    // Distinct group names (sister-concern) - supplier form ke datalist ke liye.
    [HttpGet("groups")]
    public async Task<IActionResult> Groups()
    {
        var firmId = CurrentFirmId;
        var groups = await _db.Contacts
            .Where(c => c.FirmId == firmId && c.DeletedAt == null
                        && c.GroupName != null && c.GroupName != "")
            .Select(c => c.GroupName!)
            .Distinct()
            .OrderBy(g => g)
            .ToListAsync();
        return Ok(groups);
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
        foreach (var c in members) { c.GroupName = name; c.UpdatedAt = DateTimeOffset.UtcNow; }

        var removed = await _db.Contacts.Where(c => c.FirmId == firmId && c.GroupName == name && !ids.Contains(c.Id)).ToListAsync();
        foreach (var c in removed) { c.GroupName = null; c.UpdatedAt = DateTimeOffset.UtcNow; }

        await _db.SaveChangesAsync();
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
