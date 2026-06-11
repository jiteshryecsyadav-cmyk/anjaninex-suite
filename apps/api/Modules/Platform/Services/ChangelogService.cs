using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Entities;

namespace Namokara.Api.Modules.Platform.Services;

public interface IChangelogService
{
    Task<ChangelogEntry?> GetLatest();
    Task<List<ChangelogEntry>> GetHistory(int count = 10);
    Task<ChangelogEntry> Publish(ChangelogEntry entry);
}

public class ChangelogService : IChangelogService
{
    private readonly AppDbContext _db;

    public ChangelogService(AppDbContext db) => _db = db;

    public async Task<ChangelogEntry?> GetLatest()
    {
        return await _db.Changelog
            .OrderByDescending(c => c.ReleaseDate)
            .FirstOrDefaultAsync();
    }

    public async Task<List<ChangelogEntry>> GetHistory(int count = 10)
    {
        return await _db.Changelog
            .OrderByDescending(c => c.ReleaseDate)
            .Take(count)
            .ToListAsync();
    }

    public async Task<ChangelogEntry> Publish(ChangelogEntry entry)
    {
        entry.Id = Guid.NewGuid();
        entry.PublishedAt = DateTimeOffset.UtcNow;
        _db.Changelog.Add(entry);
        await _db.SaveChangesAsync();
        return entry;
    }
}
