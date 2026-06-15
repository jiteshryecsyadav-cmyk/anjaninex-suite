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
public record SupplierCategoryDto(Guid Id, string Name, string? Icon, string? Color, int? SortOrder, bool IsSystem, int SupplierCount);

public record SupplierPhotoDto(
    Guid Id, string StorageUrl, string? ThumbnailUrl, string? Title,
    decimal? Rate, string? RateUnit, int SortOrder);

public record SupplierRateDto(
    Guid Id, Guid? CategoryId, string? CategoryName,
    decimal Rate, string RateUnit, decimal? MinQty);

public record SupplierListItemDto(
    Guid Id,
    Guid ContactId,
    string SupplierCode,
    string DisplayName,
    string? Phone,
    string? Gst,
    string? City,
    string? BusinessType,
    List<string> Categories,
    string RateUnit,
    decimal? ReliabilityScore,
    int? DeliveryLeadDays,
    int PhotoCount,
    int RateCount,
    string? PrimaryPhotoUrl,
    bool IsActive);

public record SupplierDetailDto(
    Guid Id,
    Guid ContactId,
    string SupplierCode,
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
    string? BusinessType,
    List<Guid> CategoryIds,
    string RateUnit,
    string? WaPhone,
    string? WaGroupId,
    decimal? ReliabilityScore,
    decimal? MinOrderValue,
    int? DeliveryLeadDays,
    string? Notes,
    List<SupplierPhotoDto> Photos,
    List<SupplierRateDto> Rates,
    bool IsActive,
    string? WaBuyer = null);

public record CreateSupplierDto(
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
    string BusinessType,
    List<Guid> CategoryIds,
    string RateUnit,
    string? WaPhone,
    decimal? MinOrderValue,
    int? DeliveryLeadDays,
    string? Notes,
    string? WaBuyer = null);

public record AddPhotoDto(string StorageUrl, string? Title, decimal? Rate, string? RateUnit);
public record AddRateDto(Guid? CategoryId, string? CategoryName, decimal Rate, string RateUnit, decimal? MinQty);

// A Core Master contact (e.g. a Trading party) that is NOT yet in the supplier directory.
public record LinkableContactDto(Guid ContactId, string DisplayName, string? Gst, string? Phone, string? City);

// =============================================================================
// Service
// =============================================================================
public interface ISupplierService
{
    Task<List<SupplierCategoryDto>> ListCategories();
    Task<SupplierCategoryDto> CreateCategory(string name, Guid firmId);
    Task DeleteCategory(Guid id);

    Task<List<SupplierListItemDto>> List(string? search = null, Guid? categoryId = null);
    Task<SupplierDetailDto?> Get(Guid id);
    Task<SupplierDetailDto> Create(CreateSupplierDto dto, Guid firmId, Guid userId);
    Task<List<LinkableContactDto>> ListLinkableContacts(Guid firmId, string? search);
    Task<SupplierDetailDto> AddFromContact(Guid contactId, Guid firmId, Guid userId);
    Task<SupplierDetailDto> Update(Guid id, CreateSupplierDto dto);
    Task Delete(Guid id);

    Task<SupplierPhotoDto> AddPhoto(Guid supplierId, AddPhotoDto dto, Guid firmId);
    Task DeletePhoto(Guid photoId);

    Task<SupplierRateDto> AddRate(Guid supplierId, AddRateDto dto, Guid firmId);
    Task DeleteRate(Guid rateId);
}

public class SupplierService : ISupplierService
{
    private readonly AppDbContext _db;
    public SupplierService(AppDbContext db) => _db = db;

    // =================================================
    // Categories
    // =================================================
    public async Task<List<SupplierCategoryDto>> ListCategories()
    {
        var cats = await _db.SupplierCategories.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync();

        // Count suppliers per category (parsing the jsonb array)
        var suppliers = await _db.SupplierProfiles.Where(s => s.IsActive).Select(s => s.Categories).ToListAsync();
        var counts = new Dictionary<Guid, int>();
        foreach (var json in suppliers)
        {
            try
            {
                var arr = JsonSerializer.Deserialize<List<Guid>>(json) ?? new();
                foreach (var id in arr)
                    counts[id] = counts.GetValueOrDefault(id, 0) + 1;
            }
            catch { }
        }

        return cats.Select(c => new SupplierCategoryDto(
            c.Id, c.Name, c.Icon, c.Color, c.SortOrder, c.IsSystem,
            counts.GetValueOrDefault(c.Id, 0))).ToList();
    }

    public async Task<SupplierCategoryDto> CreateCategory(string name, Guid firmId)
    {
        var cat = new SupplierCategory
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            Name = name,
            IsSystem = false,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.SupplierCategories.Add(cat);
        await _db.SaveChangesAsync();
        return new SupplierCategoryDto(cat.Id, cat.Name, cat.Icon, cat.Color, cat.SortOrder, false, 0);
    }

    public async Task DeleteCategory(Guid id)
    {
        var cat = await _db.SupplierCategories.SingleAsync(c => c.Id == id);
        if (cat.IsSystem) throw new InvalidOperationException("Cannot delete system category");
        _db.SupplierCategories.Remove(cat);
        await _db.SaveChangesAsync();
    }

    // =================================================
    // Suppliers
    // =================================================
    public async Task<List<SupplierListItemDto>> List(string? search = null, Guid? categoryId = null)
    {
        var query = from sp in _db.SupplierProfiles
                    join c in _db.Contacts on sp.ContactId equals c.Id
                    where sp.IsActive
                    select new { sp, c };

        if (!string.IsNullOrEmpty(search))
            query = query.Where(x => EF.Functions.ILike(x.c.DisplayName, $"%{search}%")
                                   || x.c.PhonePrimary!.Contains(search)
                                   || x.c.GstNumber!.Contains(search));

        var rows = await query.OrderBy(x => x.c.DisplayName).Take(500).ToListAsync();

        // Filter by category if provided (after fetch since it's jsonb)
        if (categoryId.HasValue)
        {
            rows = rows.Where(r =>
            {
                try
                {
                    var arr = JsonSerializer.Deserialize<List<Guid>>(r.sp.Categories) ?? new();
                    return arr.Contains(categoryId.Value);
                }
                catch { return false; }
            }).ToList();
        }

        var supplierIds = rows.Select(r => r.sp.Id).ToList();
        var photoCounts = await _db.SupplierPhotos
            .Where(p => supplierIds.Contains(p.SupplierId))
            .GroupBy(p => p.SupplierId)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count);

        var primaryPhotos = await _db.SupplierPhotos
            .Where(p => supplierIds.Contains(p.SupplierId))
            .OrderBy(p => p.SortOrder)
            .ToListAsync();
        var primaryMap = primaryPhotos.GroupBy(p => p.SupplierId)
            .ToDictionary(g => g.Key, g => g.First().StorageUrl);

        var rateCounts = await _db.SupplierRates
            .Where(r => supplierIds.Contains(r.SupplierId))
            .GroupBy(r => r.SupplierId)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count);

        // Category names
        var allCats = await _db.SupplierCategories.ToDictionaryAsync(c => c.Id, c => c.Name);

        return rows.Select(r =>
        {
            // Parse city from contact addresses
            string? city = null;
            try
            {
                var arr = JsonDocument.Parse(r.c.Addresses).RootElement;
                if (arr.ValueKind == JsonValueKind.Array && arr.GetArrayLength() > 0)
                    city = arr[0].TryGetProperty("city", out var c) ? c.GetString() : null;
            }
            catch { }

            // Parse category names
            var catNames = new List<string>();
            try
            {
                var ids = JsonSerializer.Deserialize<List<Guid>>(r.sp.Categories) ?? new();
                foreach (var id in ids)
                    if (allCats.TryGetValue(id, out var name)) catNames.Add(name);
            }
            catch { }

            return new SupplierListItemDto(
                r.sp.Id, r.c.Id,
                r.sp.SupplierCode ?? "",
                r.c.DisplayName, r.c.PhonePrimary, r.c.GstNumber, city,
                r.sp.BusinessType, catNames, r.sp.RateUnit,
                r.sp.ReliabilityScore, r.sp.DeliveryLeadDays,
                photoCounts.GetValueOrDefault(r.sp.Id, 0),
                rateCounts.GetValueOrDefault(r.sp.Id, 0),
                primaryMap.GetValueOrDefault(r.sp.Id),
                r.sp.IsActive);
        }).ToList();
    }

    public async Task<SupplierDetailDto?> Get(Guid id)
    {
        var data = await (from sp in _db.SupplierProfiles
                          join c in _db.Contacts on sp.ContactId equals c.Id
                          where sp.Id == id
                          select new { sp, c }).FirstOrDefaultAsync();
        if (data == null) return null;

        var photos = await _db.SupplierPhotos
            .Where(p => p.SupplierId == id)
            .OrderBy(p => p.SortOrder)
            .Select(p => new SupplierPhotoDto(p.Id, p.StorageUrl, p.ThumbnailUrl, p.Title, p.Rate, p.RateUnit, p.SortOrder))
            .ToListAsync();

        var rates = await _db.SupplierRates
            .Where(r => r.SupplierId == id)
            .Select(r => new SupplierRateDto(r.Id, r.CategoryId, r.CategoryName, r.Rate, r.RateUnit, r.MinQty))
            .ToListAsync();

        // Parse address from contact
        string? address = null, cityName = null, stateName = null, pincode = null;
        try
        {
            var arr = JsonDocument.Parse(data.c.Addresses).RootElement;
            if (arr.ValueKind == JsonValueKind.Array && arr.GetArrayLength() > 0)
            {
                var a = arr[0];
                address = a.TryGetProperty("line1", out var l) ? l.GetString() : null;
                cityName = a.TryGetProperty("city", out var ci) ? ci.GetString() : null;
                stateName = a.TryGetProperty("state", out var s) ? s.GetString() : null;
                pincode = a.TryGetProperty("pincode", out var p) ? p.GetString() : null;
            }
        }
        catch { }

        var catIds = new List<Guid>();
        try { catIds = JsonSerializer.Deserialize<List<Guid>>(data.sp.Categories) ?? new(); } catch { }

        return new SupplierDetailDto(
            data.sp.Id, data.c.Id, data.sp.SupplierCode ?? "",
            data.c.DisplayName, data.c.LegalName,
            data.c.PhonePrimary, data.c.EmailPrimary,
            data.c.GstNumber, data.c.PanNumber,
            address, cityName, stateName, pincode,
            data.sp.BusinessType, catIds, data.sp.RateUnit,
            data.c.WaSupplier, data.sp.WaGroupId,
            data.sp.ReliabilityScore, data.sp.MinOrderValue, data.sp.DeliveryLeadDays,
            data.sp.Notes, photos, rates, data.sp.IsActive, data.c.WaBuyer);
    }

    public async Task<SupplierDetailDto> Create(CreateSupplierDto dto, Guid firmId, Guid userId)
    {
        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            // Find/create contact
            Contact contact;
            bool isNewContact;
            if (!string.IsNullOrEmpty(dto.Gst))
            {
                var existing = await _db.Contacts
                    .FirstOrDefaultAsync(c => c.FirmId == firmId && c.GstNumber == dto.Gst);
                if (existing != null) { contact = existing; isNewContact = false; }
                else { contact = CreateContact(dto, firmId, userId); isNewContact = true; }
            }
            else
            {
                contact = CreateContact(dto, firmId, userId);
                isNewContact = true;
            }
            // BUG FIX: CreateContact pehle se Id assign karta hai, isliye purana
            // `Id == Guid.Empty` check kabhi true nahi hota tha → naya contact INSERT hi
            // nahi hota tha → supplier insert par FK violation. Ab newly-created contact
            // ko hamesha add+save karo (BuyerService jaisा).
            if (isNewContact)
            {
                if (contact.Id == Guid.Empty) contact.Id = Guid.NewGuid();
                _db.Contacts.Add(contact);
                await _db.SaveChangesAsync();
            }

            // Mark contact as supplier
            try
            {
                var flags = JsonNode.Parse(contact.Flags) ?? JsonNode.Parse("{}")!;
                flags["is_supplier"] = true;
                contact.Flags = flags.ToJsonString();
                contact.UpdatedAt = DateTimeOffset.UtcNow;
            }
            catch { }

            // 2 WhatsApp COMMON me (core.contacts) — bot yahin se padhta hai.
            if (dto.WaPhone != null)
                contact.WaSupplier = string.IsNullOrWhiteSpace(dto.WaPhone) ? null : dto.WaPhone.Trim();
            if (dto.WaBuyer != null)
                contact.WaBuyer = string.IsNullOrWhiteSpace(dto.WaBuyer) ? null : dto.WaBuyer.Trim();

            var supplier = new SupplierProfile
            {
                Id = Guid.NewGuid(),
                FirmId = firmId,
                ContactId = contact.Id,
                SupplierCode = await GenerateSupplierCode(firmId),
                BusinessType = dto.BusinessType,
                Categories = JsonSerializer.Serialize(dto.CategoryIds),
                RateUnit = string.IsNullOrWhiteSpace(dto.RateUnit) ? "mtr" : dto.RateUnit,
                WaPhone = dto.WaPhone,
                MinOrderValue = dto.MinOrderValue,
                DeliveryLeadDays = dto.DeliveryLeadDays,
                Notes = dto.Notes,
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.SupplierProfiles.Add(supplier);
            await _db.SaveChangesAsync();

            await tx.CommitAsync();
            return (await Get(supplier.Id))!;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public async Task<SupplierDetailDto> Update(Guid id, CreateSupplierDto dto)
    {
        var sp = await _db.SupplierProfiles.SingleAsync(s => s.Id == id);
        var contact = await _db.Contacts.SingleAsync(c => c.Id == sp.ContactId);

        contact.DisplayName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.DisplayName);
        contact.LegalName = Namokara.Api.Common.Text.NameCase.TitleCaseOrNull(dto.LegalName);
        contact.PhonePrimary = dto.Phone;
        if (dto.WaPhone != null) contact.WaSupplier = string.IsNullOrWhiteSpace(dto.WaPhone) ? null : dto.WaPhone.Trim();
        if (dto.WaBuyer != null) contact.WaBuyer = string.IsNullOrWhiteSpace(dto.WaBuyer) ? null : dto.WaBuyer.Trim();
        contact.EmailPrimary = dto.Email;
        contact.GstNumber = dto.Gst;
        contact.PanNumber = dto.Pan;
        if (!string.IsNullOrEmpty(dto.Address))
        {
            var addr = new {
                type = "billing",
                line1 = dto.Address,
                city = dto.City ?? "",
                state = dto.State ?? "",
                pincode = dto.Pincode ?? ""
            };
            contact.Addresses = $"[{JsonSerializer.Serialize(addr)}]";
        }
        contact.UpdatedAt = DateTimeOffset.UtcNow;

        sp.BusinessType = dto.BusinessType;
        sp.Categories = JsonSerializer.Serialize(dto.CategoryIds);
        sp.RateUnit = string.IsNullOrWhiteSpace(dto.RateUnit) ? "mtr" : dto.RateUnit;
        sp.WaPhone = dto.WaPhone;
        sp.MinOrderValue = dto.MinOrderValue;
        sp.DeliveryLeadDays = dto.DeliveryLeadDays;
        sp.Notes = dto.Notes;
        sp.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return (await Get(id))!;
    }

    public async Task Delete(Guid id)
    {
        var sp = await _db.SupplierProfiles.SingleAsync(s => s.Id == id);
        sp.IsActive = false;
        await _db.SaveChangesAsync();
    }

    private Contact CreateContact(CreateSupplierDto dto, Guid firmId, Guid userId)
    {
        var addresses = "[]";
        if (!string.IsNullOrEmpty(dto.Address))
        {
            var addr = new {
                type = "billing",
                line1 = dto.Address,
                city = dto.City ?? "",
                state = dto.State ?? "",
                pincode = dto.Pincode ?? ""
            };
            addresses = $"[{JsonSerializer.Serialize(addr)}]";
        }

        return new Contact
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            DisplayName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.DisplayName),
            LegalName = Namokara.Api.Common.Text.NameCase.TitleCaseOrNull(dto.LegalName),
            EntityType = "proprietorship",
            PhonePrimary = dto.Phone,
            EmailPrimary = dto.Email,
            GstNumber = dto.Gst,
            PanNumber = dto.Pan,
            Addresses = addresses,
            Flags = "{\"is_supplier\":true}",
            SourceModule = "suppliers",
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    private async Task<string> GenerateSupplierCode(Guid firmId)
    {
        var count = await _db.SupplierProfiles.CountAsync(s => s.FirmId == firmId);
        return $"SUP-{(count + 1):D3}";
    }

    // =================================================
    // Core Master linking (Phase 3) — bring an existing contact (e.g. a Trading
    // party created from a bill scan) INTO the supplier directory, WITHOUT
    // re-typing. Common data stays in core.contacts; we only add a supplier_profile.
    // =================================================
    public async Task<List<LinkableContactDto>> ListLinkableContacts(Guid firmId, string? search)
    {
        // Contacts that already have a supplier_profile — exclude these.
        var alreadySuppliers = _db.SupplierProfiles
            .Where(sp => sp.FirmId == firmId)
            .Select(sp => sp.ContactId);

        var q = _db.Contacts
            .Where(c => c.FirmId == firmId && c.DeletedAt == null
                     && !alreadySuppliers.Contains(c.Id));

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(c => EF.Functions.ILike(c.DisplayName, $"%{s}%")
                          || (c.PhonePrimary != null && c.PhonePrimary.Contains(s))
                          || (c.GstNumber != null && c.GstNumber.Contains(s)));
        }

        var rows = await q.OrderBy(c => c.DisplayName).Take(50).ToListAsync();

        return rows.Select(c =>
        {
            string? city = null;
            try
            {
                using var doc = JsonDocument.Parse(c.Addresses ?? "[]");
                if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0
                    && doc.RootElement[0].TryGetProperty("city", out var cc))
                    city = cc.GetString();
            }
            catch { }
            return new LinkableContactDto(c.Id, c.DisplayName, c.GstNumber, c.PhonePrimary, city);
        }).ToList();
    }

    public async Task<SupplierDetailDto> AddFromContact(Guid contactId, Guid firmId, Guid userId)
    {
        var contact = await _db.Contacts.FirstOrDefaultAsync(c => c.Id == contactId && c.FirmId == firmId)
            ?? throw new InvalidOperationException("Contact nahi mila.");

        var already = await _db.SupplierProfiles
            .FirstOrDefaultAsync(sp => sp.FirmId == firmId && sp.ContactId == contactId);
        if (already != null)
            return (await Get(already.Id))!;   // already in directory — just return it

        // Mark contact as supplier in flags
        try
        {
            var flags = JsonNode.Parse(contact.Flags) ?? JsonNode.Parse("{}")!;
            flags["is_supplier"] = true;
            contact.Flags = flags.ToJsonString();
            contact.UpdatedAt = DateTimeOffset.UtcNow;
        }
        catch { }

        var supplier = new SupplierProfile
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            ContactId = contactId,
            SupplierCode = await GenerateSupplierCode(firmId),
            BusinessType = "trader",
            Categories = "[]",
            RateUnit = "mtr",
            WaPhone = contact.PhonePrimary,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.SupplierProfiles.Add(supplier);
        await _db.SaveChangesAsync();
        return (await Get(supplier.Id))!;
    }

    // =================================================
    // Photos
    // =================================================
    public async Task<SupplierPhotoDto> AddPhoto(Guid supplierId, AddPhotoDto dto, Guid firmId)
    {
        var supplier = await _db.SupplierProfiles.SingleAsync(s => s.Id == supplierId);
        var photoCount = await _db.SupplierPhotos.CountAsync(p => p.SupplierId == supplierId);

        var photo = new SupplierPhoto
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            SupplierId = supplierId,
            StorageUrl = dto.StorageUrl,
            Title = dto.Title,
            Rate = dto.Rate,
            RateUnit = dto.RateUnit,
            SortOrder = photoCount,
            UploadedAt = DateTimeOffset.UtcNow
        };
        _db.SupplierPhotos.Add(photo);

        supplier.LastRateUpdate = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return new SupplierPhotoDto(photo.Id, photo.StorageUrl, photo.ThumbnailUrl,
            photo.Title, photo.Rate, photo.RateUnit, photo.SortOrder);
    }

    public async Task DeletePhoto(Guid photoId)
    {
        var photo = await _db.SupplierPhotos.SingleAsync(p => p.Id == photoId);
        _db.SupplierPhotos.Remove(photo);
        await _db.SaveChangesAsync();
    }

    // =================================================
    // Rates
    // =================================================
    public async Task<SupplierRateDto> AddRate(Guid supplierId, AddRateDto dto, Guid firmId)
    {
        var rate = new SupplierRate
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            SupplierId = supplierId,
            CategoryId = dto.CategoryId,
            CategoryName = dto.CategoryName,
            Rate = dto.Rate,
            RateUnit = dto.RateUnit,
            MinQty = dto.MinQty,
            Source = "manual",
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.SupplierRates.Add(rate);
        await _db.SaveChangesAsync();
        return new SupplierRateDto(rate.Id, rate.CategoryId, rate.CategoryName,
            rate.Rate, rate.RateUnit, rate.MinQty);
    }

    public async Task DeleteRate(Guid rateId)
    {
        var rate = await _db.SupplierRates.SingleAsync(r => r.Id == rateId);
        _db.SupplierRates.Remove(rate);
        await _db.SaveChangesAsync();
    }
}
