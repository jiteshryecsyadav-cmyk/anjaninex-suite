using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

public record RecipeMaterialDto(
    Guid Id, Guid MaterialId, string MaterialName, decimal MaterialRate,
    decimal AvgQty, string Unit,
    /// <summary>Ek piece me is material ka kitna paisa — AvgQty × rate.</summary>
    decimal Cost);

public record RecipeDto(
    Guid Id, Guid DesignId, string Part, decimal JobRate, string RateUnit,
    List<RecipeMaterialDto> Materials,
    decimal MaterialCost,
    /// <summary>Is hisse ki poori lagat — kapda + majoori.</summary>
    decimal PartCost);

public record DesignCostDto(
    Guid DesignId, string DesignName, decimal SaleRate,
    List<RecipeDto> Parts,
    /// <summary>Saare hisso ka jod — ek piece banane me kitna kharcha.</summary>
    decimal TotalCost,
    /// <summary>Bechne ke daam se kitna bacha. Rin me ho to GHAATA hai.</summary>
    decimal Margin);

public record SaveRecipeMaterialDto(Guid MaterialId, decimal AvgQty, string Unit);
public record SaveRecipeDto(string Part, decimal JobRate, string RateUnit,
                            List<SaveRecipeMaterialDto> Materials);

/// <summary>
/// Design ka nuskha, HISSE ke hisab se.
///
/// Ek suit ke teen hisse hote hain (Top, Bottom, Dupatta) aur teeno ka kapda
/// alag aur majoori alag. Isliye recipe hisse par bandhi hai, ek lambi list
/// nahi. Do faayde:
///   1. Job slip me hissa chunte hi us hisse ka material apne aap bhar jata hai
///   2. Ek piece ki asli lagat daam tay karte waqt hi dikh jati hai
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/designs/{designId}/recipe")]
[ModuleAccess("manufacturer")]
public class RecipesController : ControllerBase
{
    private readonly AppDbContext _db;
    public RecipesController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);

    /// <summary>Poora nuskha + lagat ka hisaab.</summary>
    [HttpGet]
    [HasPermission("stock.design.view.firm")]
    public async Task<IActionResult> Get(Guid designId)
    {
        var firmId = CurrentFirmId;

        var design = await _db.Items.AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == designId && i.FirmId == firmId);
        if (design is null) return NotFound();

        var parts = await Build(firmId, designId);
        var total = parts.Sum(p => p.PartCost);

        return Ok(new DesignCostDto(
            designId, design.Name, design.DefaultRate,
            parts, total,
            // Daam tay nahi hua to margin ka koi matlab nahi — 0 hi rakho
            design.DefaultRate > 0 ? design.DefaultRate - total : 0));
    }

    /// <summary>
    /// Ek hisse ka nuskha rakho. Wahi hissa dobara aaye to purana badal jata
    /// hai (design + part par unique index hai).
    /// </summary>
    [HttpPut]
    [HasPermission("stock.design.edit.firm")]
    public async Task<IActionResult> Save(Guid designId, [FromBody] SaveRecipeDto dto)
    {
        var firmId = CurrentFirmId;

        if (string.IsNullOrWhiteSpace(dto.Part))
            return BadRequest(new { error = "Hissa chuniye — Top / Bottom / Dupatta" });

        var design = await _db.Items.FirstOrDefaultAsync(i => i.Id == designId && i.FirmId == firmId);
        if (design is null) return NotFound();
        if (design.ItemKind != "design")
            return BadRequest(new { error = "Recipe sirf design par banti hai, material par nahi" });

        // Ek hi material do baar — jodna galti hai, warna kapda dugna ginta hai
        var dupes = dto.Materials.GroupBy(m => m.MaterialId).Where(g => g.Count() > 1).ToList();
        if (dupes.Count > 0)
            return BadRequest(new { error = "Ek hi material do baar likha hai — usko ek hi line me rakhiye" });

        foreach (var m in dto.Materials)
        {
            if (m.AvgQty <= 0)
                return BadRequest(new { error = "Har material ka 'ek piece me kitna' bharna zaroori hai" });

            var ok = await _db.Items.AnyAsync(i => i.Id == m.MaterialId && i.FirmId == firmId
                                                && i.ItemKind == "material");
            if (!ok)
                return BadRequest(new { error = "Koi line design ko material bana rahi hai — sirf material chuniye" });
        }

        var part = dto.Part.Trim();
        var recipe = await _db.DesignRecipes
            .FirstOrDefaultAsync(r => r.FirmId == firmId && r.DesignId == designId && r.Part == part);

        if (recipe is null)
        {
            recipe = new DesignRecipe
            {
                Id = Guid.NewGuid(), FirmId = firmId, DesignId = designId, Part = part
            };
            _db.DesignRecipes.Add(recipe);
        }
        recipe.JobRate = dto.JobRate;
        recipe.RateUnit = string.IsNullOrWhiteSpace(dto.RateUnit) ? "Pcs" : dto.RateUnit;
        recipe.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        // Material poore badal dete hain — line-by-line milaane se aadha purana
        // aadha naya reh jane ka khatra rehta hai
        var old = await _db.DesignRecipeMaterials.Where(m => m.RecipeId == recipe.Id).ToListAsync();
        _db.DesignRecipeMaterials.RemoveRange(old);
        foreach (var m in dto.Materials)
            _db.DesignRecipeMaterials.Add(new DesignRecipeMaterial
            {
                Id = Guid.NewGuid(), FirmId = firmId, RecipeId = recipe.Id,
                MaterialId = m.MaterialId, AvgQty = m.AvgQty,
                Unit = string.IsNullOrWhiteSpace(m.Unit) ? "Meter" : m.Unit
            });
        await _db.SaveChangesAsync();

        return Ok(new { recipe.Id });
    }

    [HttpDelete("{part}")]
    [HasPermission("stock.design.edit.firm")]
    public async Task<IActionResult> Delete(Guid designId, string part)
    {
        var firmId = CurrentFirmId;
        var recipe = await _db.DesignRecipes
            .FirstOrDefaultAsync(r => r.FirmId == firmId && r.DesignId == designId && r.Part == part);
        if (recipe is null) return NotFound();

        _db.DesignRecipes.Remove(recipe);   // material cascade se hat jayenge
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── madad ──

    private async Task<List<RecipeDto>> Build(Guid firmId, Guid designId)
    {
        var recipes = await _db.DesignRecipes.AsNoTracking()
            .Where(r => r.FirmId == firmId && r.DesignId == designId)
            .OrderBy(r => r.Part)
            .ToListAsync();
        if (recipes.Count == 0) return new();

        var ids = recipes.Select(r => r.Id).ToList();

        var mats = await (from m in _db.DesignRecipeMaterials.AsNoTracking()
                          join i in _db.Items.AsNoTracking() on m.MaterialId equals i.Id
                          where ids.Contains(m.RecipeId)
                          select new { m.Id, m.RecipeId, m.MaterialId, i.Name, i.DefaultRate,
                                       m.AvgQty, m.Unit })
                         .ToListAsync();

        return recipes.Select(r =>
        {
            var lines = mats.Where(m => m.RecipeId == r.Id)
                .Select(m => new RecipeMaterialDto(
                    m.Id, m.MaterialId, m.Name, m.DefaultRate, m.AvgQty, m.Unit,
                    Math.Round(m.AvgQty * m.DefaultRate, 2)))
                .ToList();

            var matCost = lines.Sum(l => l.Cost);
            return new RecipeDto(r.Id, r.DesignId, r.Part, r.JobRate, r.RateUnit,
                                 lines, matCost, matCost + r.JobRate);
        }).ToList();
    }
}
