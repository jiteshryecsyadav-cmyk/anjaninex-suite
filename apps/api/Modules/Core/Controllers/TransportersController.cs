using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Core.Entities;

namespace Namokara.Api.Modules.Core.Controllers;

public record TransporterDto(
    Guid Id,
    string FirmName,
    string? ContactPerson,
    string? Mobile,
    string? Whatsapp,
    string? GstNo,
    string? Pan,
    string? City,
    string? State,
    string? Pincode,
    string? Email,
    string? Address,
    string? ContactMobile,
    string? Landline,
    int? AvgDeliveryDays,
    decimal? DamageRate,
    string? Rating,
    int? Stars,
    string? Remark,
    bool IsActive);

public record CreateTransporterDto(
    string FirmName,
    string? ContactPerson,
    string? Mobile,
    string? Whatsapp,
    string? GstNo,
    string? Pan,
    string? City,
    string? State,
    string? Pincode,
    string? Email,
    string? Address,
    string? ContactMobile,
    string? Landline,
    int? AvgDeliveryDays,
    decimal? DamageRate,
    string? Rating,
    int? Stars,
    string? Remark,
    bool IsActive);

[Authorize]
[ApiController]
[Route("api/core/transporters")]
public class TransportersController : ControllerBase
{
    private readonly AppDbContext _db;
    public TransportersController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value!);

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search)
    {
        var firmId = CurrentFirmId;
        var q = _db.Transporters.AsNoTracking().Where(t => t.FirmId == firmId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            q = q.Where(t => t.FirmName.ToLower().Contains(s)
                || (t.Mobile != null && t.Mobile.Contains(s))
                || (t.GstNo != null && t.GstNo.ToLower().Contains(s))
                || (t.City != null && t.City.ToLower().Contains(s))
                || (t.ContactPerson != null && t.ContactPerson.ToLower().Contains(s)));
        }
        var list = await q.OrderBy(t => t.FirmName)
            .Select(t => new TransporterDto(t.Id, t.FirmName, t.ContactPerson, t.Mobile, t.Whatsapp,
                t.GstNo, t.Pan, t.City, t.State, t.Pincode, t.Email, t.Address,
                t.ContactMobile, t.Landline, t.AvgDeliveryDays, t.DamageRate, t.Rating, t.Stars,
                t.Remark, t.IsActive))
            .ToListAsync();
        return Ok(list);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var t = await _db.Transporters.AsNoTracking()
            .Where(x => x.Id == id && x.FirmId == CurrentFirmId)
            .Select(x => new TransporterDto(x.Id, x.FirmName, x.ContactPerson, x.Mobile, x.Whatsapp,
                x.GstNo, x.Pan, x.City, x.State, x.Pincode, x.Email, x.Address,
                x.ContactMobile, x.Landline, x.AvgDeliveryDays, x.DamageRate, x.Rating, x.Stars,
                x.Remark, x.IsActive))
            .FirstOrDefaultAsync();
        return t is null ? NotFound() : Ok(t);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTransporterDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.FirmName)) return BadRequest(new { error = "Firm name required" });
            var t = new Transporter
            {
                Id = Guid.NewGuid(),
                FirmId = CurrentFirmId,
                FirmName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.FirmName),
                ContactPerson = dto.ContactPerson, Mobile = dto.Mobile, Whatsapp = dto.Whatsapp,
                GstNo = dto.GstNo, Pan = dto.Pan,
                City = dto.City, State = dto.State, Pincode = dto.Pincode, Email = dto.Email,
                Address = dto.Address, ContactMobile = dto.ContactMobile, Landline = dto.Landline,
                AvgDeliveryDays = dto.AvgDeliveryDays, DamageRate = dto.DamageRate,
                Rating = dto.Rating, Stars = dto.Stars, Remark = dto.Remark,
                IsActive = dto.IsActive,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.Transporters.Add(t);
            await _db.SaveChangesAsync();
            return Ok(MapTo(t));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateTransporterDto dto)
    {
        var t = await _db.Transporters.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (t is null) return NotFound();
        t.FirmName = Namokara.Api.Common.Text.NameCase.TitleCase(dto.FirmName);
        t.ContactPerson = dto.ContactPerson; t.Mobile = dto.Mobile; t.Whatsapp = dto.Whatsapp;
        t.GstNo = dto.GstNo; t.Pan = dto.Pan;
        t.City = dto.City; t.State = dto.State; t.Pincode = dto.Pincode; t.Email = dto.Email;
        t.Address = dto.Address; t.ContactMobile = dto.ContactMobile; t.Landline = dto.Landline;
        t.AvgDeliveryDays = dto.AvgDeliveryDays; t.DamageRate = dto.DamageRate;
        t.Rating = dto.Rating; t.Stars = dto.Stars; t.Remark = dto.Remark;
        t.IsActive = dto.IsActive;
        t.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(MapTo(t));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var t = await _db.Transporters.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == CurrentFirmId);
        if (t is null) return NotFound();

        // Kisi bill me use hua hai? To sirf inactive (history bachegi). Warna PURA delete.
        var used = await _db.Bills.IgnoreQueryFilters().AnyAsync(b => b.TransporterId == id);
        if (used)
        {
            t.IsActive = false;
            t.UpdatedAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync();
            return Ok(new { ok = true, soft = true, message = "Bills me use hua hai — inactive kiya (delete nahi)" });
        }

        _db.Transporters.Remove(t);
        await _db.SaveChangesAsync();
        return Ok(new { ok = true, soft = false });
    }

    private static TransporterDto MapTo(Transporter t) => new(
        t.Id, t.FirmName, t.ContactPerson, t.Mobile, t.Whatsapp,
        t.GstNo, t.Pan, t.City, t.State, t.Pincode, t.Email, t.Address,
        t.ContactMobile, t.Landline, t.AvgDeliveryDays, t.DamageRate, t.Rating, t.Stars,
        t.Remark, t.IsActive);
}
