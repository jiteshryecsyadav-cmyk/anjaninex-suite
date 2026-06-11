using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Core.Entities;
using Namokara.Api.Modules.Suppliers.Entities;

namespace Namokara.Api.Modules.Suppliers.Services;

// =============================================================================
// DTOs
// =============================================================================
public record BuyerListItemDto(
    Guid Id, Guid ContactId, string? BuyerCode, string DisplayName,
    string? Phone, string? Gst, string? City, string? BuyerType, string? BrandName,
    decimal? BudgetMin, decimal? BudgetMax, string BudgetUnit, bool IsActive);

public record BuyerDetailDto(
    Guid Id, Guid ContactId, string? BuyerCode, string DisplayName, string? LegalName,
    string? Phone, string? Email, string? Gst, string? Pan,
    string? Address, string? City, string? State, string? Pincode,
    string? BuyerType, string? BrandName, List<Guid> CategoryIds,
    decimal? BudgetMin, decimal? BudgetMax, string BudgetUnit,
    string? OrderFrequency, string? PaymentTerms, string? QualityPref, string? TargetCustomer,
    string? WaPhone, string? Notes, bool IsActive);

public record CreateBuyerDto(
    string DisplayName, string? LegalName, string? Phone, string? Email,
    string? Gst, string? Pan, string? Address, string? City, string? State, string? Pincode,
    string? BuyerType, string? BrandName, List<Guid> CategoryIds,
    decimal? BudgetMin, decimal? BudgetMax, string? BudgetUnit,
    string? OrderFrequency, string? PaymentTerms, string? QualityPref, string? TargetCustomer,
    string? WaPhone, string? Notes);

// =============================================================================
// Service
// =============================================================================
public interface IBuyerService
{
    Task<List<BuyerListItemDto>> List(string? search = null);
    Task<BuyerDetailDto?> Get(Guid id);
    Task<BuyerDetailDto> Create(CreateBuyerDto dto, Guid firmId, Guid userId);
    Task<BuyerDetailDto> Update(Guid id, CreateBuyerDto dto);
    Task Delete(Guid id);
}

public class BuyerService : IBuyerService
{
    private readonly AppDbContext _db;
    public BuyerService(AppDbContext db) => _db = db;

    public async Task<List<BuyerListItemDto>> List(string? search = null)
    {
        var q = from b in _db.BuyerProfiles
                join c in _db.Contacts on b.ContactId equals c.Id
                where b.IsActive
                select new { b, c };

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(x => EF.Functions.ILike(x.c.DisplayName, $"%{s}%")
                          || (x.c.PhonePrimary != null && x.c.PhonePrimary.Contains(s))
                          || (x.c.GstNumber != null && x.c.GstNumber.Contains(s)));
        }

        var rows = await q.OrderBy(x => x.c.DisplayName).Take(200).ToListAsync();
        return rows.Select(x => new BuyerListItemDto(
            x.b.Id, x.b.ContactId, x.b.BuyerCode, x.c.DisplayName,
            x.c.PhonePrimary, x.c.GstNumber, City(x.c.Addresses),
            x.b.BuyerType, x.b.BrandName, x.b.BudgetMin, x.b.BudgetMax, x.b.BudgetUnit,
            x.b.IsActive)).ToList();
    }

    public async Task<BuyerDetailDto?> Get(Guid id)
    {
        var row = await (from b in _db.BuyerProfiles
                         join c in _db.Contacts on b.ContactId equals c.Id
                         where b.Id == id
                         select new { b, c }).FirstOrDefaultAsync();
        if (row is null) return null;

        var (line1, city, state, pincode) = Address(row.c.Addresses);
        List<Guid> cats;
        try { cats = JsonSerializer.Deserialize<List<Guid>>(row.b.Categories) ?? new(); }
        catch { cats = new(); }

        return new BuyerDetailDto(
            row.b.Id, row.b.ContactId, row.b.BuyerCode, row.c.DisplayName, row.c.LegalName,
            row.c.PhonePrimary, row.c.EmailPrimary, row.c.GstNumber, row.c.PanNumber,
            line1, city, state, pincode,
            row.b.BuyerType, row.b.BrandName, cats,
            row.b.BudgetMin, row.b.BudgetMax, row.b.BudgetUnit,
            row.b.OrderFrequency, row.b.PaymentTerms, row.b.QualityPref, row.b.TargetCustomer,
            row.b.WaPhone, row.b.Notes, row.b.IsActive);
    }

    public async Task<BuyerDetailDto> Create(CreateBuyerDto dto, Guid firmId, Guid userId)
    {
        var gstClean = string.IsNullOrWhiteSpace(dto.Gst) ? null : dto.Gst.Trim().ToUpperInvariant();
        var phoneClean = NormalizePhone(dto.Phone);

        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            // CORE MASTER link — reuse existing contact (by GST or phone) or create new.
            Contact? contact = null;
            if (gstClean != null)
                contact = await _db.Contacts.FirstOrDefaultAsync(c => c.FirmId == firmId && c.GstNumber == gstClean);
            if (contact == null && phoneClean != null)
                contact = await _db.Contacts.FirstOrDefaultAsync(c => c.FirmId == firmId
                    && c.PhonePrimary != null && c.PhonePrimary == phoneClean);

            if (contact == null)
            {
                contact = NewContact(dto, firmId, userId, gstClean, phoneClean);
                _db.Contacts.Add(contact);
                await _db.SaveChangesAsync();
            }

            // already a buyer? block duplicate
            var existing = await _db.BuyerProfiles
                .FirstOrDefaultAsync(b => b.FirmId == firmId && b.ContactId == contact.Id);
            if (existing != null)
                throw new InvalidOperationException("Ye party pehle se buyer directory me hai.");

            // mark contact flag
            try
            {
                var flags = JsonNode.Parse(contact.Flags) ?? JsonNode.Parse("{}")!;
                flags["is_buyer_dir"] = true;
                contact.Flags = flags.ToJsonString();
                contact.UpdatedAt = DateTimeOffset.UtcNow;
            }
            catch { }

            // Buyer WhatsApp COMMON me (core.contacts) — bot yahin se padhta hai.
            if (dto.WaPhone != null)
                contact.WaBuyer = string.IsNullOrWhiteSpace(dto.WaPhone) ? null : dto.WaPhone.Trim();

            var buyer = new BuyerProfile
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                ContactId = contact.Id,
                BuyerCode = await GenerateBuyerCode(firmId),
                BuyerType = dto.BuyerType,
                BrandName = dto.BrandName,
                Categories = JsonSerializer.Serialize(dto.CategoryIds ?? new()),
                BudgetMin = dto.BudgetMin,
                BudgetMax = dto.BudgetMax,
                BudgetUnit = string.IsNullOrWhiteSpace(dto.BudgetUnit) ? "mtr" : dto.BudgetUnit,
                OrderFrequency = dto.OrderFrequency,
                PaymentTerms = dto.PaymentTerms,
                QualityPref = dto.QualityPref,
                TargetCustomer = dto.TargetCustomer,
                WaPhone = dto.WaPhone,
                Notes = dto.Notes,
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.BuyerProfiles.Add(buyer);
            await _db.SaveChangesAsync();

            await tx.CommitAsync();
            return (await Get(buyer.Id))!;
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }
    }

    public async Task<BuyerDetailDto> Update(Guid id, CreateBuyerDto dto)
    {
        var buyer = await _db.BuyerProfiles.SingleAsync(b => b.Id == id);
        // Common fields are edited in Core Master, NOT here — only buyer-specific detail.
        buyer.BuyerType = dto.BuyerType;
        buyer.BrandName = dto.BrandName;
        buyer.Categories = JsonSerializer.Serialize(dto.CategoryIds ?? new());
        buyer.BudgetMin = dto.BudgetMin;
        buyer.BudgetMax = dto.BudgetMax;
        buyer.BudgetUnit = string.IsNullOrWhiteSpace(dto.BudgetUnit) ? "mtr" : dto.BudgetUnit;
        buyer.OrderFrequency = dto.OrderFrequency;
        buyer.PaymentTerms = dto.PaymentTerms;
        buyer.QualityPref = dto.QualityPref;
        buyer.TargetCustomer = dto.TargetCustomer;
        buyer.WaPhone = dto.WaPhone;
        buyer.Notes = dto.Notes;
        buyer.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return (await Get(id))!;
    }

    public async Task Delete(Guid id)
    {
        var buyer = await _db.BuyerProfiles.SingleAsync(b => b.Id == id);
        buyer.IsActive = false;
        buyer.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    // ---- helpers ----
    private Contact NewContact(CreateBuyerDto dto, Guid firmId, Guid userId, string? gstClean, string? phoneClean)
    {
        var addresses = "[]";
        if (!string.IsNullOrEmpty(dto.Address) || !string.IsNullOrEmpty(dto.City))
        {
            var addrList = new[] { new {
                type = "billing", line1 = dto.Address ?? "",
                city = dto.City ?? "", state = dto.State ?? "", pincode = dto.Pincode ?? "" } };
            addresses = JsonSerializer.Serialize(addrList);
        }
        return new Contact
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            DisplayName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.DisplayName),
            LegalName = Namokara.Api.Common.Text.NameCase.TitleCaseOrNull(dto.LegalName),
            EntityType = "proprietorship",
            PhonePrimary = phoneClean ?? dto.Phone?.Trim(),
            EmailPrimary = dto.Email?.Trim(),
            GstNumber = gstClean,
            PanNumber = string.IsNullOrWhiteSpace(dto.Pan) ? null : dto.Pan.Trim().ToUpperInvariant(),
            Addresses = addresses,
            Flags = "{\"is_buyer_dir\":true}",
            SourceModule = "active_directory",
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    private async Task<string> GenerateBuyerCode(Guid firmId)
    {
        var count = await _db.BuyerProfiles.CountAsync(b => b.FirmId == firmId);
        return $"BUY-{(count + 1):D3}";
    }

    private static string? NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return null;
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length > 10) digits = digits.Substring(digits.Length - 10);
        return digits.Length == 10 ? digits : null;
    }

    private static string? City(string? addresses)
    {
        var (_, city, _, _) = Address(addresses);
        return city;
    }

    private static (string? line1, string? city, string? state, string? pincode) Address(string? addresses)
    {
        try
        {
            using var doc = JsonDocument.Parse(addresses ?? "[]");
            if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
            {
                var a = doc.RootElement[0];
                return (
                    a.TryGetProperty("line1", out var l) ? l.GetString() : null,
                    a.TryGetProperty("city", out var c) ? c.GetString() : null,
                    a.TryGetProperty("state", out var s) ? s.GetString() : null,
                    a.TryGetProperty("pincode", out var p) ? p.GetString() : null);
            }
        }
        catch { }
        return (null, null, null, null);
    }
}
