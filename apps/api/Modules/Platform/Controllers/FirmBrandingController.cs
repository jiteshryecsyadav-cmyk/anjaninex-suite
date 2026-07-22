using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Entities;

namespace Namokara.Api.Modules.Platform.Controllers;

/// <summary>
/// PUBLIC (login se pehle) — subdomain se firm ki pehchan.
/// riddhi.vyaparsetu... kholne par login page firm ka naam/theme/logo dikhata hai.
/// Sirf branding deta hai — koi bhi private data yahan NAHI (endpoint khula hai).
/// </summary>
[ApiController]
[Route("api/public/firm-branding")]
[AllowAnonymous]
public class FirmBrandingController : ControllerBase
{
    private readonly AppDbContext _db;
    public FirmBrandingController(AppDbContext db) => _db = db;

    /// <summary>?sub=riddhi → { firmName, theme, logoUrl } · na mile to 404.</summary>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string sub)
    {
        sub = (sub ?? "").Trim().ToLowerInvariant();
        if (sub.Length < 3 || sub.Length > 30) return NotFound();

        // Firms table par RLS nahi hai (platform-level), aur ye request anonymous hai —
        // isliye seedha query. Sirf active-ish firms ka branding dikhate hain.
        var f = await _db.Set<Firm>()
            .Where(x => x.Subdomain != null && x.Subdomain.ToLower() == sub
                     && x.Status != "cancelled")
            .Select(x => new { firmName = x.Name, theme = x.Theme ?? "classic", logoUrl = x.LogoUrl })
            .FirstOrDefaultAsync();

        return f is null ? NotFound() : Ok(f);
    }
}
