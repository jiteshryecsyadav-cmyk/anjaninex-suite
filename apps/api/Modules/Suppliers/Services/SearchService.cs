using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Suppliers.Services;

// Unified search result across Active Directory (supplier + buyer).
public record SearchResultDto(
    string Type,          // "supplier" | "buyer"
    Guid Id,              // profile id (supplier_profiles.id / buyer_profiles.id)
    Guid ContactId,
    string DisplayName,
    string? Phone,
    string? Gst,
    string? City,
    string? Extra);       // business type / buyer type

public interface ISearchService
{
    Task<List<SearchResultDto>> Search(string q, string? type, Guid firmId);
}

public class SearchService : ISearchService
{
    private readonly AppDbContext _db;
    public SearchService(AppDbContext db) => _db = db;

    public async Task<List<SearchResultDto>> Search(string q, string? type, Guid firmId)
    {
        var results = new List<SearchResultDto>();
        if (string.IsNullOrWhiteSpace(q)) return results;
        var s = q.Trim();

        if (type != "buyer")  // all or supplier
        {
            var sup = await (from sp in _db.SupplierProfiles
                             where sp.FirmId == firmId && sp.IsActive
                             join c in _db.Contacts on sp.ContactId equals c.Id
                             where EF.Functions.ILike(c.DisplayName, $"%{s}%")
                                || (c.PhonePrimary != null && c.PhonePrimary.Contains(s))
                                || (c.GstNumber != null && c.GstNumber.Contains(s))
                             select new { sp.Id, sp.ContactId, sp.BusinessType, c.DisplayName, c.PhonePrimary, c.GstNumber, c.Addresses })
                            .Take(50).ToListAsync();
            results.AddRange(sup.Select(x => new SearchResultDto(
                "supplier", x.Id, x.ContactId, x.DisplayName, x.PhonePrimary, x.GstNumber, City(x.Addresses), x.BusinessType)));
        }

        if (type != "supplier")  // all or buyer
        {
            var buy = await (from bp in _db.BuyerProfiles
                             where bp.FirmId == firmId && bp.IsActive
                             join c in _db.Contacts on bp.ContactId equals c.Id
                             where EF.Functions.ILike(c.DisplayName, $"%{s}%")
                                || (c.PhonePrimary != null && c.PhonePrimary.Contains(s))
                                || (c.GstNumber != null && c.GstNumber.Contains(s))
                             select new { bp.Id, bp.ContactId, bp.BuyerType, c.DisplayName, c.PhonePrimary, c.GstNumber, c.Addresses })
                            .Take(50).ToListAsync();
            results.AddRange(buy.Select(x => new SearchResultDto(
                "buyer", x.Id, x.ContactId, x.DisplayName, x.PhonePrimary, x.GstNumber, City(x.Addresses), x.BuyerType)));
        }

        return results.OrderBy(r => r.DisplayName).ToList();
    }

    private static string? City(string? addresses)
    {
        try
        {
            using var doc = JsonDocument.Parse(addresses ?? "[]");
            if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0
                && doc.RootElement[0].TryGetProperty("city", out var c))
                return c.GetString();
        }
        catch { }
        return null;
    }
}
