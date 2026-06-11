using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Trading.Services;

public record ItemDto(
    Guid Id, string? Code, string Name, string? HsnSac, string Unit,
    decimal DefaultRate, decimal TaxRate, string? Category, bool IsActive);

public record CreateItemDto(
    string? Code, string Name, string? HsnSac, string Unit,
    decimal DefaultRate, decimal TaxRate, string? Category);

public interface IItemService
{
    Task<List<ItemDto>> List(string? search = null);
    Task<ItemDto> Create(CreateItemDto dto, Guid firmId);
    Task<ItemDto> Update(Guid id, CreateItemDto dto);
    Task Delete(Guid id);
}

public class ItemService : IItemService
{
    private readonly AppDbContext _db;
    public ItemService(AppDbContext db) => _db = db;

    public async Task<List<ItemDto>> List(string? search = null)
    {
        var q = _db.Items.Where(i => i.IsActive).AsQueryable();
        if (!string.IsNullOrEmpty(search))
            q = q.Where(i => EF.Functions.ILike(i.Name, $"%{search}%") || i.Code!.Contains(search));
        var items = await q.OrderBy(i => i.Name).Take(500).ToListAsync();
        return items.Select(i => new ItemDto(
            i.Id, i.Code, i.Name, i.HsnSac, i.Unit,
            i.DefaultRate, i.TaxRate, i.Category, i.IsActive)).ToList();
    }

    public async Task<ItemDto> Create(CreateItemDto dto, Guid firmId)
    {
        // Code blank ho to auto-generate (warna har item Code='' se duplicate ho jata
        // tha aur unique constraint ki wajah se doosra item save hi nahi hota).
        var code = string.IsNullOrWhiteSpace(dto.Code)
            ? await GenerateItemCode(firmId)
            : dto.Code.Trim();

        var item = new Item
        {
            Id = Guid.NewGuid(), FirmId = firmId,
            Code = code, Name = Namokara.Api.Common.Text.NameCase.TitleCase(dto.Name), HsnSac = dto.HsnSac,
            Unit = dto.Unit, DefaultRate = dto.DefaultRate, TaxRate = dto.TaxRate,
            Category = dto.Category, IsActive = true, CreatedAt = DateTimeOffset.UtcNow
        };
        _db.Items.Add(item);
        await _db.SaveChangesAsync();
        return new ItemDto(item.Id, item.Code, item.Name, item.HsnSac, item.Unit,
            item.DefaultRate, item.TaxRate, item.Category, true);
    }

    private async Task<string> GenerateItemCode(Guid firmId)
    {
        var n = await _db.Items.CountAsync(i => i.FirmId == firmId);
        string code;
        do { n++; code = $"ITM-{n}"; }
        while (await _db.Items.AnyAsync(i => i.FirmId == firmId && i.Code == code));
        return code;
    }

    public async Task<ItemDto> Update(Guid id, CreateItemDto dto)
    {
        var item = await _db.Items.SingleAsync(i => i.Id == id);
        item.Code = dto.Code; item.Name = Namokara.Api.Common.Text.NameCase.TitleCase(dto.Name); item.HsnSac = dto.HsnSac;
        item.Unit = dto.Unit; item.DefaultRate = dto.DefaultRate;
        item.TaxRate = dto.TaxRate; item.Category = dto.Category;
        await _db.SaveChangesAsync();
        return new ItemDto(item.Id, item.Code, item.Name, item.HsnSac, item.Unit,
            item.DefaultRate, item.TaxRate, item.Category, true);
    }

    public async Task Delete(Guid id)
    {
        var item = await _db.Items.SingleAsync(i => i.Id == id);
        item.IsActive = false;
        await _db.SaveChangesAsync();
    }
}
