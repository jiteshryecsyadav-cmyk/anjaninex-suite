using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Suppliers.Services;

// =============================================================================
// DTOs
// =============================================================================
public record MatchRequestDto(
    Guid? BuyerId,                 // optional — if given, use buyer's categories + budget
    List<Guid>? CategoryIds,       // manual category filter
    decimal? RateMin,
    decimal? RateMax,
    string? City);

public record MatchResultDto(
    Guid SupplierId, string DisplayName, string? Phone, string? City,
    string? BusinessType, List<string> MatchedCategories, int CategoryMatchCount,
    decimal? BestRate, double Score);

// =============================================================================
// Service — ranks suppliers for a buyer's need. Read-only, no new tables.
// =============================================================================
public interface IMatchService
{
    Task<List<MatchResultDto>> Match(MatchRequestDto req, Guid firmId);
}

public class MatchService : IMatchService
{
    private readonly AppDbContext _db;
    public MatchService(AppDbContext db) => _db = db;

    public async Task<List<MatchResultDto>> Match(MatchRequestDto req, Guid firmId)
    {
        // 1. Resolve the wanted categories + budget (from buyer if buyerId given).
        var wantedCats = new HashSet<Guid>(req.CategoryIds ?? new());
        decimal? rateMin = req.RateMin, rateMax = req.RateMax;

        if (req.BuyerId.HasValue)
        {
            var buyer = await _db.BuyerProfiles.FirstOrDefaultAsync(b => b.Id == req.BuyerId && b.FirmId == firmId);
            if (buyer != null)
            {
                try
                {
                    foreach (var g in JsonSerializer.Deserialize<List<Guid>>(buyer.Categories) ?? new())
                        wantedCats.Add(g);
                }
                catch { }
                rateMin ??= buyer.BudgetMin;
                rateMax ??= buyer.BudgetMax;
            }
        }

        // 2. Pull active suppliers (+ their contact + category list).
        var suppliers = await (from s in _db.SupplierProfiles
                               where s.FirmId == firmId && s.IsActive
                               join c in _db.Contacts on s.ContactId equals c.Id
                               select new { s.Id, s.Categories, s.BusinessType, c.DisplayName, c.PhonePrimary, c.Addresses })
                              .ToListAsync();

        // 3. Category name lookup (for showing matched names).
        var catNames = await _db.SupplierCategories
            .Where(c => c.FirmId == firmId)
            .ToDictionaryAsync(c => c.Id, c => c.Name);

        // 4. Best rate per supplier (lowest rate, optionally within range).
        var ratesBySupplier = await _db.SupplierRates
            .Where(r => r.FirmId == firmId)
            .GroupBy(r => r.SupplierId)
            .Select(g => new { SupplierId = g.Key, Rates = g.Select(x => x.Rate).ToList() })
            .ToDictionaryAsync(x => x.SupplierId, x => x.Rates);

        var results = new List<MatchResultDto>();
        foreach (var s in suppliers)
        {
            List<Guid> supCats;
            try { supCats = JsonSerializer.Deserialize<List<Guid>>(s.Categories) ?? new(); }
            catch { supCats = new(); }

            // category overlap
            var matched = supCats.Where(wantedCats.Contains).ToList();
            int catMatch = matched.Count;

            // rate fit
            decimal? bestRate = null;
            double rateScore = 0;
            if (ratesBySupplier.TryGetValue(s.Id, out var rates) && rates.Count > 0)
            {
                bestRate = rates.Min();
                if (rateMin.HasValue || rateMax.HasValue)
                {
                    var lo = rateMin ?? 0;
                    var hi = rateMax ?? decimal.MaxValue;
                    if (rates.Any(r => r >= lo && r <= hi)) rateScore = 1;
                }
            }

            // city bonus
            var city = City(s.Addresses);
            double cityBonus = (!string.IsNullOrWhiteSpace(req.City)
                && city != null && city.Equals(req.City, StringComparison.OrdinalIgnoreCase)) ? 1 : 0;

            // score: category overlap is primary, rate-fit + city are bonuses
            double score = catMatch * 10 + rateScore * 3 + cityBonus * 2;

            // include only if there's at least some relevance (or no filter given -> show all)
            bool hasFilter = wantedCats.Count > 0 || rateMin.HasValue || rateMax.HasValue || !string.IsNullOrWhiteSpace(req.City);
            if (hasFilter && score == 0) continue;

            results.Add(new MatchResultDto(
                s.Id, s.DisplayName, s.PhonePrimary, city, s.BusinessType,
                matched.Select(id => catNames.GetValueOrDefault(id, "?")).ToList(),
                catMatch, bestRate, score));
        }

        return results.OrderByDescending(r => r.Score).ThenByDescending(r => r.CategoryMatchCount).Take(100).ToList();
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
