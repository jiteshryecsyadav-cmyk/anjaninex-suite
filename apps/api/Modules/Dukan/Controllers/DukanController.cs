using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Dukan.Entities;

namespace Namokara.Api.Modules.Dukan.Controllers;

// ============================================================================
// ONLINE DUKAN — per-firm e-commerce API (ported from the KALINDI Express backend).
//
// Routing base: /api/dukan
//
// Three caller types:
//   1. PUBLIC storefront — no Anjaninex login. Firm context aata hai ?firmId=
//      query se (catalog browsing) ya buyer JWT se. RLS context middleware sirf
//      authed requests par chalta hai, isliye public endpoints connection par
//      firm context KHUD set karte hain (SetFirmContextAsync).
//   2. DUKAN ADMIN — logged-in Anjaninex firm user (existing JWT, firm_id claim).
//      RLS context middleware (Program.cs) already app.current_firm_id set kar deta hai.
//   3. DUKAN BUYER — external customer (phone + 6-digit PIN). Alag buyer JWT
//      (role 'dukan_buyer', firm_id, buyer_id) — same signing key se mint hota hai.
//      Buyer JWT me firm_id claim hota hai → RLS middleware context set kar deta hai.
// ============================================================================

public abstract class DukanControllerBase : ControllerBase
{
    protected readonly AppDbContext Db;
    protected readonly IConfiguration Config;

    protected DukanControllerBase(AppDbContext db, IConfiguration config)
    {
        Db = db;
        Config = config;
    }

    // ---- Anjaninex firm admin (existing JWT) ----
    protected Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    // ---- Dukan buyer token ----
    protected bool IsDukanBuyer => User.IsInRole("dukan_buyer");

    protected Guid? BuyerFirmId =>
        Guid.TryParse(User.FindFirst("firm_id")?.Value, out var f) ? f : (Guid?)null;

    protected Guid? BuyerId =>
        Guid.TryParse(User.FindFirst("buyer_id")?.Value, out var b) ? b : (Guid?)null;

    // For PUBLIC endpoints (no auth): set tenant context explicitly on the held
    // connection so FORCE RLS lets the firm-scoped SELECTs through. Mirrors the
    // per-request context block in Program.cs. Idempotent within a request.
    protected async Task SetFirmContextAsync(Guid firmId)
    {
        var conn = Db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await Db.Database.OpenConnectionAsync();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT set_config('app.current_firm_id', @f, false);";
        var p = cmd.CreateParameter();
        p.ParameterName = "@f";
        p.Value = firmId.ToString();
        cmd.Parameters.Add(p);
        await cmd.ExecuteNonQueryAsync();
    }

    // Resolve the firm a PUBLIC request is for: buyer token firm_id, else ?firmId=,
    // else admin firm_id claim. Throws 400 if none.
    protected async Task<Guid> ResolvePublicFirmAsync(Guid? firmIdQuery)
    {
        Guid firmId;
        if (BuyerFirmId is Guid bf) firmId = bf;
        else if (firmIdQuery is Guid q && q != Guid.Empty) firmId = q;
        else if (Guid.TryParse(User.FindFirst("firm_id")?.Value, out var cf)) firmId = cf;
        else throw new DukanBadRequest("firmId required");

        // If the caller is NOT already firm-scoped by the RLS middleware (i.e. a
        // pure-public ?firmId= request with no firm_id claim), set context manually.
        if (User.FindFirst("firm_id")?.Value is null)
            await SetFirmContextAsync(firmId);

        return firmId;
    }

    protected string MintBuyerToken(DukanBuyer b)
    {
        var key = Config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key not configured");
        var issuer = Config["Jwt:Issuer"]!;
        var audience = Config["Jwt:Audience"]!;
        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            // user_id present taaki Program.cs ka OnTokenValidated (jo userId != null
            // require karta hai) buyer token bhi accept kare. Buyer core.users me nahi
            // hota — ye id sirf claim ke liye hai, koi DB lookup nahi hota.
            new("user_id", b.Id.ToString()),
            new("buyer_id", b.Id.ToString()),
            new("firm_id", b.FirmId.ToString()),   // RLS middleware isse context set karta hai
            new("name", b.Name),
            new(ClaimTypes.Role, "dukan_buyer"),
        };

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddDays(30),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    protected static object PublicBuyer(DukanBuyer b) => new
    {
        id = b.Id,
        name = b.Name,
        phone = b.Phone,
        email = b.Email ?? "",
        gstin = b.Gstin ?? "",
        addresses = (b.Addresses ?? new()).Select(PublicAddress).ToList()
    };

    protected static object PublicAddress(DukanBuyerAddress a) => new
    {
        id = a.Id,
        label = a.Label,
        receiver = a.Receiver,
        mobile = a.Mobile,
        line = a.Line,
        city = a.City,
        state = a.State,
        pin = a.Pin,
        isDefault = a.IsDefault,
        lat = a.Lat,
        lng = a.Lng
    };
}

public class DukanBadRequest : Exception
{
    public DukanBadRequest(string msg) : base(msg) { }
}

// ============================================================================
// PUBLIC — storefront catalog (no auth; firm via ?firmId= or buyer token).
// ============================================================================
[ApiController]
[Route("api/dukan")]
public class DukanPublicController : DukanControllerBase
{
    public DukanPublicController(AppDbContext db, IConfiguration config) : base(db, config) { }

    [HttpGet("categories")]
    [AllowAnonymous]
    public async Task<IActionResult> Categories([FromQuery] Guid? firmId)
    {
        var fid = await ResolvePublicFirmAsync(firmId);
        var list = await Db.DukanCategories.Where(c => c.FirmId == fid)
            .OrderBy(c => c.Name).ToListAsync();
        return Ok(list.Select(c => new
        {
            id = c.Id, name = c.Name, status = c.Status, descr = c.Descr, parentId = c.ParentId
        }));
    }

    [HttpGet("products")]
    [AllowAnonymous]
    public async Task<IActionResult> Products([FromQuery] Guid? firmId)
    {
        var fid = await ResolvePublicFirmAsync(firmId);
        var list = await Db.DukanProducts.Where(p => p.FirmId == fid)
            .OrderBy(p => p.Name).ToListAsync();
        return Ok(list.Select(p => new
        {
            id = p.Id, catId = p.CatId, name = p.Name, code = p.Code,
            mrp = p.Mrp, rate = p.Rate, stock = p.Stock, img = p.Img,
            gst = p.Gst, gstInc = p.GstInc, combo = p.Combo
        }));
    }

    // GET /api/dukan/seller  → seller (= dukan settings) profile
    [HttpGet("seller")]
    [AllowAnonymous]
    public async Task<IActionResult> Seller([FromQuery] Guid? firmId)
    {
        var fid = await ResolvePublicFirmAsync(firmId);
        var s = await Db.DukanSettings.FirstOrDefaultAsync(x => x.FirmId == fid);
        if (s is null) return Ok(new { name = "", rating = 0 });
        return Ok(DukanController_Mappers.Seller(s));
    }

    // GET /api/dukan/reviews  → { "<orderId>": { stars, text, date, buyer, reply, replyDate } }
    [HttpGet("reviews")]
    [AllowAnonymous]
    public async Task<IActionResult> Reviews([FromQuery] Guid? firmId)
    {
        var fid = await ResolvePublicFirmAsync(firmId);
        var list = await Db.DukanReviews.Where(r => r.FirmId == fid).ToListAsync();
        var dict = list.ToDictionary(
            r => r.OrderId.ToString(),
            r => (object)new
            {
                stars = r.Stars, text = r.Text ?? "", date = r.ReviewDate,
                buyer = r.Buyer ?? "", reply = r.Reply, replyDate = r.ReplyDate
            });
        return Ok(dict);
    }
}

internal static class DukanController_Mappers
{
    public static object Seller(DukanSettings s) => new
    {
        name = s.Name, upi = s.Upi, acc = s.Acc, ifsc = s.Ifsc, bank = s.Bank,
        city = s.City, gst = s.Gst, mobile = s.Mobile, email = s.Email,
        address = s.Address, whatsapp = s.Whatsapp, instagram = s.Instagram,
        facebook = s.Facebook, rating = s.Rating
    };
}

// ============================================================================
// BUYER AUTH — signup / login (firm-scoped). Returns buyer JWT.
// ============================================================================
public record DukanSignupDto(string? Name, string? Phone, string? Pin, Guid? FirmId);
public record DukanLoginDto(string? IdOrName, string? Pin, Guid? FirmId);

[ApiController]
[Route("api/dukan/auth")]
public class DukanAuthController : DukanControllerBase
{
    public DukanAuthController(AppDbContext db, IConfiguration config) : base(db, config) { }

    [HttpPost("signup")]
    [AllowAnonymous]
    public async Task<IActionResult> Signup([FromBody] DukanSignupDto dto)
    {
        var firmId = dto.FirmId ?? Guid.Empty;
        if (firmId == Guid.Empty) return BadRequest(new { error = "firmId required" });
        var phone = (dto.Phone ?? "").Trim();
        var pin = (dto.Pin ?? "").Trim();
        if (string.IsNullOrWhiteSpace(dto.Name)
            || !System.Text.RegularExpressions.Regex.IsMatch(phone, @"^\d{10}$")
            || !System.Text.RegularExpressions.Regex.IsMatch(pin, @"^\d{6}$"))
            return BadRequest(new { error = "Bad input" });

        await SetFirmContextAsync(firmId);

        var dup = await Db.DukanBuyers.AnyAsync(b => b.FirmId == firmId && b.Phone == phone);
        if (dup) return Conflict(new { error = "Phone already registered" });

        var buyer = new DukanBuyer
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            Name = dto.Name!.Trim(),
            Phone = phone,
            PinHash = BCrypt.Net.BCrypt.HashPassword(pin),
            Email = "",
            Gstin = "",
            CreatedAt = DateTimeOffset.UtcNow
        };
        Db.DukanBuyers.Add(buyer);
        await Db.SaveChangesAsync();

        buyer.Addresses = new();
        return Ok(new { token = MintBuyerToken(buyer), buyer = PublicBuyer(buyer) });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] DukanLoginDto dto)
    {
        var firmId = dto.FirmId ?? Guid.Empty;
        if (firmId == Guid.Empty) return BadRequest(new { error = "firmId required" });
        var q = (dto.IdOrName ?? "").Trim();
        var qLower = q.ToLower();

        await SetFirmContextAsync(firmId);

        // Match by name (case-insensitive), phone, or id — all within the firm.
        var candidates = await Db.DukanBuyers
            .Where(b => b.FirmId == firmId)
            .Include(b => b.Addresses)
            .ToListAsync();
        var buyer = candidates.FirstOrDefault(b =>
            b.Name.ToLower() == qLower
            || b.Phone == q
            || b.Id.ToString().ToLower() == qLower);

        if (buyer is null || !BCrypt.Net.BCrypt.Verify(dto.Pin ?? "", buyer.PinHash))
            return Unauthorized(new { error = "Invalid login" });

        return Ok(new { token = MintBuyerToken(buyer), buyer = PublicBuyer(buyer) });
    }
}

// ============================================================================
// ADMIN — Anjaninex firm user manages categories / products / settings.
// RLS context already set by Program.cs middleware (firm_id claim present).
// ============================================================================
public record DukanCategoryDto(string? Name, string? Status, string? Descr, Guid? ParentId);
public record DukanProductDto(Guid? CatId, string? Name, string? Code, decimal? Mrp,
    decimal? Rate, int? Stock, string? Img, decimal? Gst, bool? GstInc, bool? Combo);
public record DukanSettingsDto(string? Name, string? Upi, string? Acc, string? Ifsc,
    string? Bank, string? City, string? Gst, string? Mobile, string? Email,
    string? Address, string? Whatsapp, string? Instagram, string? Facebook, decimal? Rating);

[ApiController]
[Route("api/dukan")]
[Authorize]
public class DukanAdminController : DukanControllerBase
{
    public DukanAdminController(AppDbContext db, IConfiguration config) : base(db, config) { }

    // ---------- Categories ----------
    [HttpPost("categories")]
    public async Task<IActionResult> CreateCategory([FromBody] DukanCategoryDto dto)
    {
        var c = new DukanCategory
        {
            Id = Guid.NewGuid(),
            FirmId = CurrentFirmId,
            Name = dto.Name ?? "",
            Status = string.IsNullOrWhiteSpace(dto.Status) ? "active" : dto.Status!,
            Descr = dto.Descr,
            ParentId = dto.ParentId,
            CreatedAt = DateTimeOffset.UtcNow
        };
        Db.DukanCategories.Add(c);
        await Db.SaveChangesAsync();
        return Ok(new { id = c.Id, name = c.Name, status = c.Status, descr = c.Descr, parentId = c.ParentId });
    }

    [HttpPut("categories/{id}")]
    public async Task<IActionResult> UpdateCategory(Guid id, [FromBody] DukanCategoryDto dto)
    {
        var c = await Db.DukanCategories.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (c is null) return NotFound();
        if (dto.Name is not null) c.Name = dto.Name;
        if (dto.Status is not null) c.Status = dto.Status;
        if (dto.Descr is not null) c.Descr = dto.Descr;
        c.ParentId = dto.ParentId;   // null = top-level, set = sub-category
        await Db.SaveChangesAsync();
        return Ok(new { id = c.Id, name = c.Name, status = c.Status, descr = c.Descr, parentId = c.ParentId });
    }

    [HttpDelete("categories/{id}")]
    public async Task<IActionResult> DeleteCategory(Guid id)
    {
        var c = await Db.DukanCategories.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (c is null) return Ok(new { ok = true });
        // Delete the category + its products (matches server.js behaviour).
        var prods = Db.DukanProducts.Where(p => p.FirmId == CurrentFirmId && p.CatId == id);
        Db.DukanProducts.RemoveRange(prods);
        Db.DukanCategories.Remove(c);
        await Db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // ---------- Products ----------
    [HttpPost("products")]
    public async Task<IActionResult> CreateProduct([FromBody] DukanProductDto dto)
    {
        var p = new DukanProduct
        {
            Id = Guid.NewGuid(),
            FirmId = CurrentFirmId,
            CatId = dto.CatId,
            Name = dto.Name ?? "",
            Code = dto.Code,
            Mrp = dto.Mrp ?? 0,
            Rate = dto.Rate ?? 0,
            Stock = dto.Stock ?? 0,
            Img = dto.Img,
            Gst = dto.Gst ?? 0,
            GstInc = dto.GstInc ?? true,
            Combo = dto.Combo ?? false,
            CreatedAt = DateTimeOffset.UtcNow
        };
        Db.DukanProducts.Add(p);
        await Db.SaveChangesAsync();
        return Ok(MapProduct(p));
    }

    [HttpPut("products/{id}")]
    public async Task<IActionResult> UpdateProduct(Guid id, [FromBody] DukanProductDto dto)
    {
        var p = await Db.DukanProducts.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (p is null) return NotFound();
        if (dto.CatId is not null) p.CatId = dto.CatId;
        if (dto.Name is not null) p.Name = dto.Name;
        if (dto.Code is not null) p.Code = dto.Code;
        if (dto.Mrp is not null) p.Mrp = dto.Mrp.Value;
        if (dto.Rate is not null) p.Rate = dto.Rate.Value;
        if (dto.Stock is not null) p.Stock = dto.Stock.Value;
        if (dto.Img is not null) p.Img = dto.Img;
        if (dto.Gst is not null) p.Gst = dto.Gst.Value;
        if (dto.GstInc is not null) p.GstInc = dto.GstInc.Value;
        if (dto.Combo is not null) p.Combo = dto.Combo.Value;
        await Db.SaveChangesAsync();
        return Ok(MapProduct(p));
    }

    [HttpDelete("products/{id}")]
    public async Task<IActionResult> DeleteProduct(Guid id)
    {
        var p = await Db.DukanProducts.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (p is not null) { Db.DukanProducts.Remove(p); await Db.SaveChangesAsync(); }
        return Ok(new { ok = true });
    }

    // ---------- Settings (= seller) ----------
    [HttpPut("seller")]
    public async Task<IActionResult> UpdateSettings([FromBody] DukanSettingsDto dto)
    {
        var s = await Db.DukanSettings.FirstOrDefaultAsync(x => x.FirmId == CurrentFirmId);
        var isNew = s is null;
        if (s is null)
        {
            s = new DukanSettings { FirmId = CurrentFirmId, CreatedAt = DateTimeOffset.UtcNow };
        }
        if (dto.Name is not null) s.Name = dto.Name;
        if (dto.Upi is not null) s.Upi = dto.Upi;
        if (dto.Acc is not null) s.Acc = dto.Acc;
        if (dto.Ifsc is not null) s.Ifsc = dto.Ifsc;
        if (dto.Bank is not null) s.Bank = dto.Bank;
        if (dto.City is not null) s.City = dto.City;
        if (dto.Gst is not null) s.Gst = dto.Gst;
        if (dto.Mobile is not null) s.Mobile = dto.Mobile;
        if (dto.Email is not null) s.Email = dto.Email;
        if (dto.Address is not null) s.Address = dto.Address;
        if (dto.Whatsapp is not null) s.Whatsapp = dto.Whatsapp;
        if (dto.Instagram is not null) s.Instagram = dto.Instagram;
        if (dto.Facebook is not null) s.Facebook = dto.Facebook;
        if (dto.Rating is not null) s.Rating = dto.Rating.Value;
        s.UpdatedAt = DateTimeOffset.UtcNow;

        if (isNew) Db.DukanSettings.Add(s);
        await Db.SaveChangesAsync();
        return Ok(DukanController_Mappers.Seller(s));
    }

    private static object MapProduct(DukanProduct p) => new
    {
        id = p.Id, catId = p.CatId, name = p.Name, code = p.Code,
        mrp = p.Mrp, rate = p.Rate, stock = p.Stock, img = p.Img,
        gst = p.Gst, gstInc = p.GstInc, combo = p.Combo
    };
}

// ============================================================================
// BUYER — profile / pin / addresses (dukan_buyer JWT only).
// ============================================================================
public record DukanProfileDto(string? Name, string? Phone, string? Email, string? Gstin);
public record DukanPinDto(string? OldPin, string? NewPin);
public record DukanAddressDto(string? Label, string? Receiver, string? Mobile, string? Line,
    string? City, string? State, string? Pin, bool? IsDefault, decimal? Lat, decimal? Lng);

[ApiController]
[Route("api/dukan/buyer")]
[Authorize(Roles = "dukan_buyer")]
public class DukanBuyerController : DukanControllerBase
{
    public DukanBuyerController(AppDbContext db, IConfiguration config) : base(db, config) { }

    private async Task<DukanBuyer?> MeAsync()
    {
        if (BuyerId is not Guid bid || BuyerFirmId is not Guid fid) return null;
        return await Db.DukanBuyers.Include(b => b.Addresses)
            .FirstOrDefaultAsync(b => b.Id == bid && b.FirmId == fid);
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var b = await MeAsync();
        return b is null ? NotFound() : Ok(PublicBuyer(b));
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] DukanProfileDto dto)
    {
        var b = await MeAsync();
        if (b is null) return NotFound();
        if (dto.Name is not null) b.Name = dto.Name;
        if (dto.Phone is not null) b.Phone = dto.Phone;
        if (dto.Email is not null) b.Email = dto.Email;
        if (dto.Gstin is not null) b.Gstin = dto.Gstin;
        await Db.SaveChangesAsync();
        return Ok(PublicBuyer(b));
    }

    [HttpPut("pin")]
    public async Task<IActionResult> ChangePin([FromBody] DukanPinDto dto)
    {
        var b = await MeAsync();
        if (b is null) return NotFound();
        if (!BCrypt.Net.BCrypt.Verify(dto.OldPin ?? "", b.PinHash))
            return BadRequest(new { error = "Wrong current PIN" });
        if (!System.Text.RegularExpressions.Regex.IsMatch(dto.NewPin ?? "", @"^\d{6}$"))
            return BadRequest(new { error = "PIN must be 6 digits" });
        b.PinHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPin!);
        await Db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // ---------- Addresses (return the full list, like server.js) ----------
    [HttpPost("address")]
    public async Task<IActionResult> AddAddress([FromBody] DukanAddressDto dto)
    {
        var b = await MeAsync();
        if (b is null) return NotFound();

        var a = new DukanBuyerAddress
        {
            Id = Guid.NewGuid(),
            FirmId = b.FirmId,
            BuyerId = b.Id,
            Label = dto.Label, Receiver = dto.Receiver, Mobile = dto.Mobile,
            Line = dto.Line, City = dto.City, State = dto.State, Pin = dto.Pin,
            Lat = dto.Lat, Lng = dto.Lng,
            IsDefault = dto.IsDefault ?? false,
            CreatedAt = DateTimeOffset.UtcNow
        };
        // First address is default automatically.
        if (b.Addresses.Count == 0) a.IsDefault = true;
        if (a.IsDefault) foreach (var x in b.Addresses) x.IsDefault = false;
        b.Addresses.Add(a);
        await Db.SaveChangesAsync();
        return Ok(b.Addresses.Select(PublicAddress));
    }

    [HttpPut("address/{id}")]
    public async Task<IActionResult> UpdateAddress(Guid id, [FromBody] DukanAddressDto dto)
    {
        var b = await MeAsync();
        if (b is null) return NotFound();
        var a = b.Addresses.FirstOrDefault(x => x.Id == id);
        if (a is null) return NotFound();

        if (dto.Label is not null) a.Label = dto.Label;
        if (dto.Receiver is not null) a.Receiver = dto.Receiver;
        if (dto.Mobile is not null) a.Mobile = dto.Mobile;
        if (dto.Line is not null) a.Line = dto.Line;
        if (dto.City is not null) a.City = dto.City;
        if (dto.State is not null) a.State = dto.State;
        if (dto.Pin is not null) a.Pin = dto.Pin;
        if (dto.Lat is not null) a.Lat = dto.Lat;
        if (dto.Lng is not null) a.Lng = dto.Lng;
        if (dto.IsDefault == true)
        {
            foreach (var x in b.Addresses) x.IsDefault = x.Id == id;
        }
        await Db.SaveChangesAsync();
        return Ok(b.Addresses.Select(PublicAddress));
    }

    [HttpDelete("address/{id}")]
    public async Task<IActionResult> DeleteAddress(Guid id)
    {
        var b = await MeAsync();
        if (b is null) return NotFound();
        var a = b.Addresses.FirstOrDefault(x => x.Id == id);
        if (a is not null) { b.Addresses.Remove(a); Db.DukanBuyerAddresses.Remove(a); await Db.SaveChangesAsync(); }
        return Ok(b.Addresses.Select(PublicAddress));
    }

    [HttpPut("address/{id}/default")]
    public async Task<IActionResult> SetDefaultAddress(Guid id)
    {
        var b = await MeAsync();
        if (b is null) return NotFound();
        foreach (var x in b.Addresses) x.IsDefault = x.Id == id;
        await Db.SaveChangesAsync();
        return Ok(b.Addresses.Select(PublicAddress));
    }
}

// ============================================================================
// ORDERS — buyer places; admin sees all firm orders, buyer sees own.
// ============================================================================
public record DukanOrderLineDto(Guid? Id, int? Qty);
public record DukanPlaceOrderDto(List<DukanOrderLineDto>? Items, string? Receiver,
    string? Address, bool? IncludeGst, bool? IncludeDelivery);

[ApiController]
[Route("api/dukan/orders")]
[Authorize]
public class DukanOrdersController : DukanControllerBase
{
    private const decimal DELIVERY = 49m;

    public DukanOrdersController(AppDbContext db, IConfiguration config) : base(db, config) { }

    // POST — buyer only (dukan_buyer token).
    [HttpPost]
    [Authorize(Roles = "dukan_buyer")]
    public async Task<IActionResult> Place([FromBody] DukanPlaceOrderDto dto)
    {
        if (BuyerId is not Guid bid || BuyerFirmId is not Guid fid)
            return Unauthorized();

        var buyer = await Db.DukanBuyers.FirstOrDefaultAsync(b => b.Id == bid && b.FirmId == fid);

        var ids = (dto.Items ?? new()).Where(i => i.Id is Guid).Select(i => i.Id!.Value).Distinct().ToList();
        var products = await Db.DukanProducts
            .Where(p => p.FirmId == fid && ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id);

        var lines = new List<DukanOrderItem>();
        foreach (var it in dto.Items ?? new())
        {
            if (it.Id is not Guid pid || !products.TryGetValue(pid, out var p)) continue;
            var qty = Math.Max(1, it.Qty ?? 0);
            lines.Add(new DukanOrderItem
            {
                Id = Guid.NewGuid(),
                FirmId = fid,
                Name = p.Name,
                Qty = qty,
                Rate = p.Rate,
                Gst = p.Gst,
                GstInc = p.GstInc
            });
        }
        if (lines.Count == 0) return BadRequest(new { error = "No valid items in order" });

        var subtotal = lines.Sum(l => l.Rate * l.Qty);
        var delivery = dto.IncludeDelivery == false ? 0m : DELIVERY;
        var gst = dto.IncludeGst == false ? 0m
            : lines.Sum(l => (l.GstInc && l.Gst > 0)
                ? Math.Round(l.Rate * l.Qty * l.Gst / 100m, MidpointRounding.AwayFromZero)
                : 0m);

        // Atomic bill number per firm: INV-#### based on existing order count.
        var billSeq = await Db.DukanOrders.CountAsync(o => o.FirmId == fid) + 1;

        var order = new DukanOrder
        {
            Id = Guid.NewGuid(),
            FirmId = fid,
            BillNo = "INV-" + billSeq.ToString("D4"),
            BuyerId = bid,
            BuyerName = buyer?.Name ?? bid.ToString(),
            OrderDate = DateTimeOffset.UtcNow,
            Subtotal = subtotal,
            Delivery = delivery,
            Gst = gst,
            Total = subtotal + delivery + gst,
            Receiver = dto.Receiver,
            Address = dto.Address,
            Status = "PAID",
            CreatedAt = DateTimeOffset.UtcNow,
            Items = lines
        };
        // Set order_id on items (FK).
        foreach (var l in lines) l.OrderId = order.Id;

        Db.DukanOrders.Add(order);
        await Db.SaveChangesAsync();

        return Ok(MapOrder(order));
    }

    // GET — admin sees all firm orders, buyer sees own.
    [HttpGet]
    public async Task<IActionResult> List()
    {
        Guid fid;
        if (IsDukanBuyer)
        {
            if (BuyerFirmId is not Guid bf) return Unauthorized();
            fid = bf;
        }
        else
        {
            fid = CurrentFirmId;   // Anjaninex admin
        }

        var q = Db.DukanOrders.Include(o => o.Items).Where(o => o.FirmId == fid);
        if (IsDukanBuyer && BuyerId is Guid bid) q = q.Where(o => o.BuyerId == bid);

        var orders = await q.OrderByDescending(o => o.OrderDate).ToListAsync();
        return Ok(orders.Select(MapOrder));
    }

    private static object MapOrder(DukanOrder o) => new
    {
        id = o.Id,
        billNo = o.BillNo,
        date = o.OrderDate,
        buyerId = o.BuyerId,
        buyerName = o.BuyerName,
        items = o.Items.Select(i => new { name = i.Name, qty = i.Qty, rate = i.Rate, gst = i.Gst, gstInc = i.GstInc }),
        subtotal = o.Subtotal,
        delivery = o.Delivery,
        gst = o.Gst,
        total = o.Total,
        receiver = o.Receiver,
        address = o.Address,
        status = o.Status
    };
}

// ============================================================================
// REVIEWS — buyer submits; admin replies.
// ============================================================================
public record DukanReviewDto(Guid? OrderId, int? Stars, string? Text);
public record DukanReplyDto(string? Text);

[ApiController]
[Route("api/dukan/reviews")]
[Authorize]
public class DukanReviewsController : DukanControllerBase
{
    public DukanReviewsController(AppDbContext db, IConfiguration config) : base(db, config) { }

    [HttpPost]
    [Authorize(Roles = "dukan_buyer")]
    public async Task<IActionResult> Submit([FromBody] DukanReviewDto dto)
    {
        if (BuyerFirmId is not Guid fid || dto.OrderId is not Guid orderId)
            return BadRequest(new { error = "Bad input" });

        var buyer = BuyerId is Guid bid
            ? await Db.DukanBuyers.FirstOrDefaultAsync(b => b.Id == bid && b.FirmId == fid)
            : null;

        var existing = await Db.DukanReviews.FirstOrDefaultAsync(r => r.FirmId == fid && r.OrderId == orderId);
        if (existing is null)
        {
            Db.DukanReviews.Add(new DukanReview
            {
                FirmId = fid,
                OrderId = orderId,
                Stars = dto.Stars ?? 0,
                Text = dto.Text ?? "",
                Buyer = buyer?.Name ?? BuyerId?.ToString(),
                ReviewDate = DateTimeOffset.UtcNow
                // reply / replyDate preserved as null on first review
            });
        }
        else
        {
            existing.Stars = dto.Stars ?? 0;
            existing.Text = dto.Text ?? "";
            existing.Buyer = buyer?.Name ?? BuyerId?.ToString();
            existing.ReviewDate = DateTimeOffset.UtcNow;
            // reply / replyDate untouched (matches server.js merge)
        }
        await Db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // POST /api/dukan/reviews/{orderId}/reply  — admin (Anjaninex firm user)
    [HttpPost("{orderId}/reply")]
    public async Task<IActionResult> Reply(Guid orderId, [FromBody] DukanReplyDto dto)
    {
        if (IsDukanBuyer) return Forbid();   // only the dukan admin can reply
        var fid = CurrentFirmId;
        var r = await Db.DukanReviews.FirstOrDefaultAsync(x => x.FirmId == fid && x.OrderId == orderId);
        if (r is not null)
        {
            r.Reply = dto.Text;
            r.ReplyDate = DateTimeOffset.UtcNow;
            await Db.SaveChangesAsync();
        }
        return Ok(new { ok = true });
    }
}
