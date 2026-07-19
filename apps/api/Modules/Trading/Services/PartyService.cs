using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;
using Namokara.Api.Modules.Core.Entities;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Trading.Services;

// =============================================================================
// DTOs
// =============================================================================
public record PartyAddressDto(string? Line = null, string? City = null, string? State = null, string? Pincode = null);

public record PartyDto(
    Guid Id,
    Guid ContactId,
    string? PartyCode,
    string DisplayName,
    string? Phone,
    string? Email,
    string? Gst,
    string? City,
    string PartyType,
    decimal CreditLimit,
    int CreditDays,
    decimal CommissionRate,
    decimal OutstandingBalance,
    Guid? LedgerId,
    bool IsActive,
    string? WaSupplier = null,
    string? WaBuyer = null,
    string? Pan = null,
    string? GroupName = null,
    Guid? BuyerAgentId = null,
    decimal? BuyerAgentSharePct = null,
    decimal DiscountNormal = 0,
    decimal DiscountExhibition = 0,
    decimal DiscountSpecial = 0,
    string? SupplierType = null,
    string? BuyerType = null,
    string? UdyamNo = null,
    string? MsmeType = null,
    string? WaExtra = null,
    string? WaExtraRole = null,
    string? SubAgent = null,
    decimal? SubAgentPct = null,
    string? Addresses = null);

public record CreatePartyDto(
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
    string PartyType,
    decimal CreditLimit,
    int CreditDays,
    decimal CommissionRate,
    decimal OpeningBalance,
    string OpeningType,
    string? WaSupplier = null,
    string? WaBuyer = null,
    string? GroupName = null,
    Guid? BuyerAgentId = null,
    decimal? BuyerAgentSharePct = null,
    decimal DiscountNormal = 0,
    decimal DiscountExhibition = 0,
    decimal DiscountSpecial = 0,
    string? SupplierType = null,
    string? BuyerType = null,
    string? UdyamNo = null,
    string? MsmeType = null,
    string? WaExtra = null,
    string? WaExtraRole = null,
    string? SubAgent = null,
    decimal? SubAgentPct = null,
    List<PartyAddressDto>? ExtraAddresses = null);

// =============================================================================
// Service
// =============================================================================
public record UpdateCreditDto(decimal CreditLimit, int CreditDays);

public class PartyExistsException : Exception
{
    public Guid ExistingPartyId { get; }
    public string DisplayName { get; }
    public string? Gst { get; }
    public string? Phone { get; }
    public string? City { get; }
    public DateTimeOffset CreatedAt { get; }

    public PartyExistsException(Guid id, string name, string? gst, string? phone, string? city, DateTimeOffset createdAt)
        : base($"Party with GST '{gst}' already exists: {name}")
    {
        ExistingPartyId = id; DisplayName = name; Gst = gst;
        Phone = phone; City = city; CreatedAt = createdAt;
    }
}

public interface IPartyService
{
    Task<List<PartyDto>> List(string? search = null);
    Task<PartyDto?> Get(Guid id);
    Task<PartyDto> Create(CreatePartyDto dto, Guid firmId, Guid userId);
    Task<PartyDto> Update(Guid id, CreatePartyDto dto);
    Task UpdateCredit(Guid id, UpdateCreditDto dto);
    Task Delete(Guid id);
}

public class PartyService : IPartyService
{
    private readonly AppDbContext _db;

    public PartyService(AppDbContext db) => _db = db;

    public async Task<List<PartyDto>> List(string? search = null)
    {
        var query = from p in _db.PartyProfiles
                    join c in _db.Contacts on p.ContactId equals c.Id
                    where p.IsActive
                    select new { p, c };

        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(x => EF.Functions.ILike(x.c.DisplayName, $"%{search}%")
                                  || x.c.PhonePrimary!.Contains(search)
                                  || x.c.GstNumber!.Contains(search));
        }

        // Take limit raised 200 → 5000: trading forms (bill/order entry) saari parties
        // client-side load karke dropdown/duplicate-check karte hain. 200 cap se 200+ wali
        // firms me peechli parties (alphabetically) load hi nahi hoti thi → "No buyer found"
        // aur GST/PAN duplicate detect fail. 5000 SME size ke liye kaafi + safe.
        var rows = await query.OrderBy(x => x.c.DisplayName).Take(5000).ToListAsync();

        // Compute outstanding from accounting ledger if linked
        var ledgerIds = rows.Where(r => r.p.LedgerId.HasValue).Select(r => r.p.LedgerId!.Value).ToList();
        var balances = new Dictionary<Guid, decimal>();
        if (ledgerIds.Count > 0)
        {
            var bals = await _db.VoucherLines
                .Where(vl => ledgerIds.Contains(vl.LedgerId))
                .GroupBy(vl => vl.LedgerId)
                .Select(g => new
                {
                    LedgerId = g.Key,
                    Dr = g.Where(x => x.DebitCredit == "Dr").Sum(x => x.Amount),
                    Cr = g.Where(x => x.DebitCredit == "Cr").Sum(x => x.Amount)
                })
                .ToListAsync();
            balances = bals.ToDictionary(x => x.LedgerId, x => x.Dr - x.Cr);
        }

        return rows.Select(x =>
        {
            var addr = x.c.Addresses;
            string? city = null;
            try
            {
                var addrArr = System.Text.Json.JsonDocument.Parse(addr).RootElement;
                if (addrArr.ValueKind == System.Text.Json.JsonValueKind.Array && addrArr.GetArrayLength() > 0)
                    city = addrArr[0].TryGetProperty("city", out var c) ? c.GetString() : null;
            }
            catch { }

            decimal outstanding = 0;
            if (x.p.LedgerId.HasValue && balances.TryGetValue(x.p.LedgerId.Value, out var b))
                outstanding = b;

            return new PartyDto(
                x.p.Id, x.c.Id, x.p.PartyCode,
                x.c.DisplayName, x.c.PhonePrimary, x.c.EmailPrimary, x.c.GstNumber, city,
                x.p.PartyType, x.p.CreditLimit, x.p.CreditDays, x.p.CommissionRate,
                outstanding, x.p.LedgerId, x.p.IsActive, x.c.WaSupplier, x.c.WaBuyer,
                x.c.PanNumber, x.c.GroupName, x.c.BuyerAgentId, x.c.BuyerAgentSharePct,
                x.p.DiscountNormal, x.p.DiscountExhibition, x.p.DiscountSpecial,
                x.c.SupplierType, x.c.BuyerType, x.c.UdyamNo, x.c.MsmeType, x.c.WaExtra, x.c.WaExtraRole,
                x.c.SubAgent, x.c.SubAgentPct,
                x.c.Addresses);
        }).ToList();
    }

    public async Task<PartyDto?> Get(Guid id)
        => (await List()).FirstOrDefault(p => p.Id == id);

    public async Task<PartyDto> Create(CreatePartyDto dto, Guid firmId, Guid userId)
    {
        // FIX: NpgsqlRetryingExecutionStrategy (EnableRetryOnFailure) does NOT allow
        // user-initiated transactions directly. We MUST wrap the whole unit-of-work
        // in CreateExecutionStrategy().ExecuteAsync(...) so EF can retry the entire
        // transactional block on transient failures.
        // Normalize opening_type — DB columns are CHAR(2) so we only accept 'Dr' or 'Cr'.
        // Frontend sends 'debit' / 'credit' (full words) — translate before persisting.
        string normalizedOpeningType = (dto.OpeningType ?? "").Trim().ToLowerInvariant() switch
        {
            "cr" or "credit" => "Cr",
            "dr" or "debit"  => "Dr",
            _                 => "Dr"   // default natural balance for debtors
        };

        // Normalize party_type — DB default 'buyer'. Accept buyer / seller / supplier / both.
        string normalizedPartyType = (dto.PartyType ?? "").Trim().ToLowerInvariant() switch
        {
            "seller" or "supplier" => "seller",
            "both"                  => "both",
            _                        => "buyer"
        };

        // CORE MASTER DUPLICATE CHECK (Phase 1) — runs BEFORE the transaction.
        // Match on GST *or* Phone so the same person is never created twice across
        // modules (Trading / Active Directory / HR all share core.contacts).
        //   1) Contact exists (by GST or phone) AND has a party_profile → block (PartyExists)
        //   2) Contact exists but NO party_profile (came from another module) → reuse it
        //   3) No contact → create fresh
        var gstClean = string.IsNullOrWhiteSpace(dto.Gst) ? null : dto.Gst.Trim().ToUpperInvariant();
        var phoneClean = NormalizePhone(dto.Phone);

        // GST/PAN ka format PEHLE validate karo — warna DB CHECK constraint (23514) cryptic
        // "violates check constraint" error deta hai. Galat ho to user ko SAAF batao ki kya
        // galat hai (aksar AI scan me 0/O ya ek extra char aa jaata hai) taaki wo turant theek kare.
        if (gstClean != null && !System.Text.RegularExpressions.Regex.IsMatch(
                gstClean, "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$"))
            throw new ArgumentException(
                $"GST number ka format galat hai: \"{gstClean}\" ({gstClean.Length} characters). " +
                "Sahi 15-char GSTIN daalein (jaise 24ABCDE1234F1Z5). GST nahi hai to khaali chhod kar URP party banayein.");

        var panCheck = string.IsNullOrWhiteSpace(dto.Pan) ? null : dto.Pan.Trim().ToUpperInvariant();
        if (panCheck != null && !System.Text.RegularExpressions.Regex.IsMatch(
                panCheck, "^[A-Z]{5}[0-9]{4}[A-Z]$"))
            throw new ArgumentException(
                $"PAN number ka format galat hai: \"{panCheck}\". Sahi PAN daalein (jaise AABCO5612R), ya khaali chhod dein.");

        Contact? existingContactToReuse = null;
        if (gstClean != null || phoneClean != null)
        {
            // Prefer GST match (more reliable); fall back to phone match.
            Contact? existingContact = null;
            if (gstClean != null)
                existingContact = await _db.Contacts
                    .FirstOrDefaultAsync(c => c.FirmId == firmId && c.GstNumber == gstClean);

            if (existingContact == null && phoneClean != null)
                existingContact = await _db.Contacts
                    .FirstOrDefaultAsync(c => c.FirmId == firmId
                        && c.PhonePrimary != null && c.PhonePrimary == phoneClean);

            if (existingContact != null)
            {
                var existingParty = await _db.PartyProfiles
                    .FirstOrDefaultAsync(p => p.FirmId == firmId && p.ContactId == existingContact.Id);

                if (existingParty != null)
                {
                    // CASE 1 — full duplicate, party already exists. Strict block.
                    string? city = null;
                    try
                    {
                        using var doc = System.Text.Json.JsonDocument.Parse(existingContact.Addresses ?? "[]");
                        if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array
                            && doc.RootElement.GetArrayLength() > 0)
                        {
                            var first = doc.RootElement[0];
                            if (first.TryGetProperty("city", out var cc)) city = cc.GetString();
                        }
                    }
                    catch { }

                    throw new PartyExistsException(
                        existingParty.Id,
                        existingContact.DisplayName,
                        existingContact.GstNumber,
                        existingContact.PhonePrimary,
                        city,
                        existingContact.CreatedAt);
                }

                // CASE 2 — orphan contact, reuse it for the new party
                existingContactToReuse = existingContact;
            }
        }

        var strategy = _db.Database.CreateExecutionStrategy();
        Guid createdPartyId = await strategy.ExecuteAsync(async () =>
        {
            using var tx = await _db.Database.BeginTransactionAsync();
            try
            {
                // 1. Reuse orphan contact OR create new
                Contact contact;
                bool isNewContact;
                if (existingContactToReuse != null)
                {
                    contact = existingContactToReuse;
                    isNewContact = false;
                }
                else
                {
                    contact = CreateContact(dto, firmId, userId);
                    isNewContact = true;
                }

                if (isNewContact)
                {
                    if (contact.Id == Guid.Empty) contact.Id = Guid.NewGuid();
                    _db.Contacts.Add(contact);
                    await _db.SaveChangesAsync();
                }

                // 2. Find/create the Sundry Debtors ledger
                Guid? ledgerId = null;
                var debtorsSubGroup = await _db.SubGroups
                    .FirstOrDefaultAsync(s => s.FirmId == firmId && s.Name == "Sundry Debtors");
                if (debtorsSubGroup != null)
                {
                    var existingLedger = await _db.Ledgers
                        .FirstOrDefaultAsync(l => l.FirmId == firmId && l.ContactId == contact.Id);
                    if (existingLedger != null)
                    {
                        ledgerId = existingLedger.Id;
                    }
                    else
                    {
                        var ledger = new Ledger
                        {
                            Id = Guid.NewGuid(),
                            FirmId = firmId,
                            SubGroupId = debtorsSubGroup.Id,
                            ContactId = contact.Id,
                            Name = contact.DisplayName,
                            OpeningBalance = dto.OpeningBalance,
                            OpeningType = normalizedOpeningType,
                            IsActive = true,
                            CreatedAt = DateTimeOffset.UtcNow,
                            UpdatedAt = DateTimeOffset.UtcNow
                        };
                        _db.Ledgers.Add(ledger);
                        await _db.SaveChangesAsync();
                        ledgerId = ledger.Id;
                    }
                }

                // 3. Create party profile — but first check if one already exists for this contact
                //    (UNIQUE constraint on firm_id, contact_id — prevents duplicate party for existing contact)
                var existingParty = await _db.PartyProfiles
                    .FirstOrDefaultAsync(p => p.FirmId == firmId && p.ContactId == contact.Id);
                if (existingParty != null)
                {
                    await tx.CommitAsync();
                    return existingParty.Id;   // idempotent — return the existing party
                }

                var party = new PartyProfile
                {
                    Id = Guid.NewGuid(),
                    FirmId = firmId,
                    ContactId = contact.Id,
                    PartyCode = await GeneratePartyCode(firmId),
                    PartyType = normalizedPartyType,
                    CreditLimit = dto.CreditLimit,
                    CreditDays = dto.CreditDays,
                    CommissionRate = dto.CommissionRate,
                    DiscountNormal = dto.DiscountNormal,
                    DiscountExhibition = dto.DiscountExhibition,
                    DiscountSpecial = dto.DiscountSpecial,
                    OpeningBalance = dto.OpeningBalance,
                    OpeningType = normalizedOpeningType,
                    LedgerId = ledgerId,
                    IsActive = true,
                    CreatedAt = DateTimeOffset.UtcNow,
                    UpdatedAt = DateTimeOffset.UtcNow
                };
                _db.PartyProfiles.Add(party);
                await _db.SaveChangesAsync();

                await tx.CommitAsync();
                return party.Id;
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        });

        return (await Get(createdPartyId))!;
    }

    public async Task<PartyDto> Update(Guid id, CreatePartyDto dto)
    {
        var party = await _db.PartyProfiles.SingleAsync(p => p.Id == id);
        var contact = await _db.Contacts.SingleAsync(c => c.Id == party.ContactId);

        contact.DisplayName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.DisplayName);
        contact.LegalName = Namokara.Api.Common.Text.NameCase.TitleCaseOrNull(dto.LegalName);
        contact.PhonePrimary = dto.Phone?.Trim();
        if (dto.WaSupplier != null) contact.WaSupplier = string.IsNullOrWhiteSpace(dto.WaSupplier) ? null : dto.WaSupplier.Trim();
        if (dto.WaBuyer != null) contact.WaBuyer = string.IsNullOrWhiteSpace(dto.WaBuyer) ? null : dto.WaBuyer.Trim();
        if (dto.GroupName != null) contact.GroupName = string.IsNullOrWhiteSpace(dto.GroupName) ? null : dto.GroupName.Trim();
        if (dto.SupplierType != null) contact.SupplierType = string.IsNullOrWhiteSpace(dto.SupplierType) ? null : dto.SupplierType.Trim();
        if (dto.BuyerType != null) contact.BuyerType = string.IsNullOrWhiteSpace(dto.BuyerType) ? null : dto.BuyerType.Trim();
        if (dto.UdyamNo != null) contact.UdyamNo = string.IsNullOrWhiteSpace(dto.UdyamNo) ? null : dto.UdyamNo.Trim();
        if (dto.MsmeType != null) contact.MsmeType = string.IsNullOrWhiteSpace(dto.MsmeType) ? null : dto.MsmeType.Trim();
        if (dto.WaExtra != null) contact.WaExtra = string.IsNullOrWhiteSpace(dto.WaExtra) ? null : dto.WaExtra.Trim();
        if (dto.WaExtraRole != null) contact.WaExtraRole = string.IsNullOrWhiteSpace(dto.WaExtraRole) ? null : dto.WaExtraRole.Trim();
        if (dto.SubAgent != null) contact.SubAgent = string.IsNullOrWhiteSpace(dto.SubAgent) ? null : dto.SubAgent.Trim();
        if (dto.SubAgentPct != null) contact.SubAgentPct = dto.SubAgentPct;
        contact.BuyerAgentId = dto.BuyerAgentId;
        contact.BuyerAgentSharePct = dto.BuyerAgentSharePct;
        contact.EmailPrimary = dto.Email?.Trim();
        contact.GstNumber = string.IsNullOrWhiteSpace(dto.Gst) ? null : dto.Gst.Trim().ToUpperInvariant();
        contact.PanNumber = string.IsNullOrWhiteSpace(dto.Pan) ? null : dto.Pan.Trim().ToUpperInvariant();
        // City/State/Pincode/Address — jo bheja hai wo update, jo nahi bheja wo purana rahe.
        // (Pehle: address khali ho to CITY ka change bhi save NAHI hota tha — bug)
        if (!string.IsNullOrWhiteSpace(dto.Address) || !string.IsNullOrWhiteSpace(dto.City)
            || !string.IsNullOrWhiteSpace(dto.State) || !string.IsNullOrWhiteSpace(dto.Pincode))
        {
            string oldLine1 = "", oldCity = "", oldState = "", oldPin = "";
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(contact.Addresses ?? "[]");
                if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array
                    && doc.RootElement.GetArrayLength() > 0)
                {
                    var a0 = doc.RootElement[0];
                    oldLine1 = a0.TryGetProperty("line1", out var l) ? l.GetString() ?? "" : "";
                    oldCity  = a0.TryGetProperty("city", out var c) ? c.GetString() ?? "" : "";
                    oldState = a0.TryGetProperty("state", out var s) ? s.GetString() ?? "" : "";
                    oldPin   = a0.TryGetProperty("pincode", out var z) ? z.GetString() ?? "" : "";
                }
            }
            catch { /* purana JSON kharab ho to fresh likh do */ }

            var addrList = new List<object>
            {
                new
                {
                    type    = "billing",
                    line1   = string.IsNullOrWhiteSpace(dto.Address) ? oldLine1 : dto.Address,
                    city    = string.IsNullOrWhiteSpace(dto.City) ? oldCity
                              : Namokara.Api.Common.Text.NameCase.TitleCase(dto.City.Trim()),
                    state   = string.IsNullOrWhiteSpace(dto.State) ? oldState : dto.State,
                    pincode = string.IsNullOrWhiteSpace(dto.Pincode) ? oldPin : dto.Pincode
                }
            };
            if (dto.ExtraAddresses != null)
                foreach (var ea in dto.ExtraAddresses)
                    if (!(string.IsNullOrWhiteSpace(ea.Line) && string.IsNullOrWhiteSpace(ea.City)
                          && string.IsNullOrWhiteSpace(ea.Pincode) && string.IsNullOrWhiteSpace(ea.State)))
                        addrList.Add(new { type = "other", line1 = ea.Line ?? "", city = ea.City ?? "",
                                           state = ea.State ?? "", pincode = ea.Pincode ?? "" });
            contact.Addresses = System.Text.Json.JsonSerializer.Serialize(addrList);
        }
        contact.UpdatedAt = DateTimeOffset.UtcNow;

        party.PartyType = (dto.PartyType ?? "").Trim().ToLowerInvariant() switch
        {
            "seller" or "supplier" => "seller",
            "both" => "both",
            _ => "buyer"
        };
        party.CreditLimit = dto.CreditLimit;
        party.CreditDays = dto.CreditDays;
        party.CommissionRate = dto.CommissionRate;
        party.DiscountNormal = dto.DiscountNormal;
        party.DiscountExhibition = dto.DiscountExhibition;
        party.DiscountSpecial = dto.DiscountSpecial;
        party.UpdatedAt = DateTimeOffset.UtcNow;

        // Update linked ledger name
        if (party.LedgerId.HasValue)
        {
            var ledger = await _db.Ledgers.SingleAsync(l => l.Id == party.LedgerId.Value);
            ledger.Name = Namokara.Api.Common.Text.NameCase.TitleCase(dto.DisplayName);
            ledger.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();
        return (await Get(id))!;
    }

    public async Task UpdateCredit(Guid id, UpdateCreditDto dto)
    {
        var party = await _db.PartyProfiles.SingleAsync(p => p.Id == id);
        party.CreditLimit = dto.CreditLimit;
        party.CreditDays = dto.CreditDays;
        party.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task Delete(Guid id)
    {
        var party = await _db.PartyProfiles.SingleAsync(p => p.Id == id);
        party.IsActive = false;
        await _db.SaveChangesAsync();
    }

    private Contact CreateContact(CreatePartyDto dto, Guid firmId, Guid userId)
    {
        // SAFE JSON — use JsonSerializer for the whole array so apostrophes / quotes
        // / backslashes / newlines in address / display name don't break valid JSON.
        var addresses = "[]";
        var addrList = new List<object>();
        if (!string.IsNullOrEmpty(dto.Address))
            addrList.Add(new { type = "billing", line1 = dto.Address, city = dto.City ?? "",
                               state = dto.State ?? "", pincode = dto.Pincode ?? "" });
        if (dto.ExtraAddresses != null)
            foreach (var ea in dto.ExtraAddresses)
                if (!(string.IsNullOrWhiteSpace(ea.Line) && string.IsNullOrWhiteSpace(ea.City)
                      && string.IsNullOrWhiteSpace(ea.Pincode) && string.IsNullOrWhiteSpace(ea.State)))
                    addrList.Add(new { type = "other", line1 = ea.Line ?? "", city = ea.City ?? "",
                                       state = ea.State ?? "", pincode = ea.Pincode ?? "" });
        if (addrList.Count > 0)
            addresses = System.Text.Json.JsonSerializer.Serialize(addrList);

        return new Contact
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            DisplayName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.DisplayName),
            LegalName = Namokara.Api.Common.Text.NameCase.TitleCaseOrNull(dto.LegalName),
            EntityType = "proprietorship",
            // Store normalized phone (digits only, last 10) so duplicate-match is reliable
            // even when the same number is typed as "+91 90571 57731" vs "9057157731".
            PhonePrimary = NormalizePhone(dto.Phone) ?? dto.Phone?.Trim(),
            WaSupplier = string.IsNullOrWhiteSpace(dto.WaSupplier) ? null : dto.WaSupplier.Trim(),
            WaBuyer = string.IsNullOrWhiteSpace(dto.WaBuyer) ? null : dto.WaBuyer.Trim(),
            GroupName = string.IsNullOrWhiteSpace(dto.GroupName) ? null : dto.GroupName.Trim(),
            SupplierType = string.IsNullOrWhiteSpace(dto.SupplierType) ? null : dto.SupplierType.Trim(),
            BuyerType = string.IsNullOrWhiteSpace(dto.BuyerType) ? null : dto.BuyerType.Trim(),
            UdyamNo = string.IsNullOrWhiteSpace(dto.UdyamNo) ? null : dto.UdyamNo.Trim(),
            MsmeType = string.IsNullOrWhiteSpace(dto.MsmeType) ? null : dto.MsmeType.Trim(),
            WaExtra = string.IsNullOrWhiteSpace(dto.WaExtra) ? null : dto.WaExtra.Trim(),
            WaExtraRole = string.IsNullOrWhiteSpace(dto.WaExtraRole) ? null : dto.WaExtraRole.Trim(),
            SubAgent = string.IsNullOrWhiteSpace(dto.SubAgent) ? null : dto.SubAgent.Trim(),
            SubAgentPct = dto.SubAgentPct,
            BuyerAgentId = dto.BuyerAgentId,
            BuyerAgentSharePct = dto.BuyerAgentSharePct,
            EmailPrimary = dto.Email?.Trim(),
            // Trim + upper-case GST/PAN — paste-from-Excel often has trailing spaces or lowercase
            GstNumber = string.IsNullOrWhiteSpace(dto.Gst) ? null : dto.Gst.Trim().ToUpperInvariant(),
            PanNumber = string.IsNullOrWhiteSpace(dto.Pan) ? null : dto.Pan.Trim().ToUpperInvariant(),
            Addresses = addresses,
            Flags = "{\"is_party\":true,\"is_buyer\":true}",
            SourceModule = "trading",
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    private async Task<string> GeneratePartyCode(Guid firmId)
    {
        var count = await _db.PartyProfiles.CountAsync(p => p.FirmId == firmId);
        return $"PRT-{(count + 1):D3}";
    }

    /// <summary>
    /// Normalize an Indian phone for matching: keep digits only, drop a leading 91/0,
    /// return the last 10 digits. Returns null if fewer than 10 digits (not matchable).
    /// e.g. "+91 90571-57731" → "9057157731", "09057157731" → "9057157731".
    /// </summary>
    private static string? NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return null;
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length > 10 && digits.StartsWith("91")) digits = digits.Substring(digits.Length - 10);
        else if (digits.Length > 10 && digits.StartsWith("0")) digits = digits.Substring(digits.Length - 10);
        else if (digits.Length > 10) digits = digits.Substring(digits.Length - 10);
        return digits.Length == 10 ? digits : null;
    }
}
