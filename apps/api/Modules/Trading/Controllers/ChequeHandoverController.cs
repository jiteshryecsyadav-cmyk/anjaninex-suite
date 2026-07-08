using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Trading.Controllers;

public record ChequeHandoverDto(
    string? PaymentRef, string? SupplierName, string? ChequeNo, string? BankName,
    decimal Amount, string? ChequeDate, string TakenBy, string? HandedDate,
    bool CommissionPaid, decimal CommissionAmount, string? Remark);

public record SetCommissionDto(bool Paid, decimal Amount);

// Cheque Handover Register: supplier ka staff kaunsa cheque le gaya, kab, commission paid/unpaid.
[ApiController]
[Authorize]
[Route("api/trading/cheque-handovers")]
public class ChequeHandoverController : ControllerBase
{
    private readonly AppDbContext _db;
    public ChequeHandoverController(AppDbContext db) => _db = db;

    private Guid FirmId => Guid.Parse(User.FindFirst("firm_id")?.Value
        ?? throw new InvalidOperationException("firm_id claim missing"));
    private string? MyName => User.FindFirst("username")?.Value
        ?? User.FindFirst("name")?.Value ?? User.FindFirst("unique_name")?.Value;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? commission, [FromQuery] string? from,
        [FromQuery] string? to, [FromQuery] string? search)
    {
        var q = _db.ChequeHandovers.AsNoTracking().Where(c => c.FirmId == FirmId);
        if (commission == "paid") q = q.Where(c => c.CommissionPaid);
        else if (commission == "unpaid") q = q.Where(c => !c.CommissionPaid);
        if (DateOnly.TryParse(from, out var f)) q = q.Where(c => c.HandedDate >= f);
        if (DateOnly.TryParse(to, out var t)) q = q.Where(c => c.HandedDate <= t);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(c => (c.SupplierName ?? "").Contains(s) || (c.TakenBy ?? "").Contains(s) || (c.ChequeNo ?? "").Contains(s));
        }
        var rows = await q.OrderByDescending(c => c.HandedDate).ThenByDescending(c => c.CreatedAt).Take(1000).ToListAsync();
        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ChequeHandoverDto dto)
    {
        var c = new ChequeHandover
        {
            Id = Guid.NewGuid(),
            FirmId = FirmId,
            PaymentRef = dto.PaymentRef,
            SupplierName = dto.SupplierName,
            ChequeNo = dto.ChequeNo,
            BankName = dto.BankName,
            Amount = dto.Amount,
            TakenBy = string.IsNullOrWhiteSpace(dto.TakenBy) ? null : dto.TakenBy.Trim(),
            HandedBy = MyName,
            CommissionPaid = dto.CommissionPaid,
            CommissionAmount = dto.CommissionAmount,
            Remark = dto.Remark,
            HandedDate = DateOnly.TryParse(dto.HandedDate, out var hd) ? hd : (DateOnly?)null,
            CreatedAt = DateTimeOffset.UtcNow
        };
        if (DateOnly.TryParse(dto.ChequeDate, out var cd)) c.ChequeDate = cd;
        _db.ChequeHandovers.Add(c);
        await _db.SaveChangesAsync();
        return Ok(c);
    }

    public record SetHandoverDto(string TakenBy, string? HandedDate);
    [HttpPut("{id}/handover")]
    public async Task<IActionResult> SetHandover(Guid id, [FromBody] SetHandoverDto dto)
    {
        var c = await _db.ChequeHandovers.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == FirmId);
        if (c is null) return NotFound();
        c.TakenBy = string.IsNullOrWhiteSpace(dto.TakenBy) ? null : dto.TakenBy.Trim();
        if (DateOnly.TryParse(dto.HandedDate, out var hd)) c.HandedDate = hd;
        else c.HandedDate = DateOnly.FromDateTime(DateTime.UtcNow);
        c.HandedBy = MyName;
        await _db.SaveChangesAsync();
        return Ok(c);
    }

    [HttpPut("{id}/commission")]
    public async Task<IActionResult> SetCommission(Guid id, [FromBody] SetCommissionDto dto)
    {
        var c = await _db.ChequeHandovers.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == FirmId);
        if (c is null) return NotFound();
        c.CommissionPaid = dto.Paid;
        c.CommissionAmount = dto.Amount;
        await _db.SaveChangesAsync();
        return Ok(c);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var c = await _db.ChequeHandovers.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == FirmId);
        if (c is null) return NotFound();
        _db.ChequeHandovers.Remove(c);
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }
}
