using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Trading.Controllers;

public record ChequeHandoverDto(
    string? PaymentRef, string? SupplierName, string? BuyerName, string? ChequeNo, string? BankName,
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
            BuyerName = dto.BuyerName,
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

    // Purani cheque payments (notes me TXN:Cheque...) ko register me laao (dedupe).
    [HttpPost("backfill")]
    public async Task<IActionResult> Backfill()
    {
        var firmId = FirmId;
        var payments = await _db.Payments.AsNoTracking()
            .Where(p => p.FirmId == firmId && p.DeletedAt == null && p.Notes != null && p.Notes.Contains("TXN:"))
            .Select(p => new { p.PaymentNo, p.PartyId, p.BuyerPartyId, p.Notes }).ToListAsync();
        var existing = (await _db.ChequeHandovers.AsNoTracking().Where(c => c.FirmId == firmId)
            .Select(c => new { c.PaymentRef, c.ChequeNo }).ToListAsync())
            .Select(x => (x.PaymentRef ?? "") + "|" + (x.ChequeNo ?? "")).ToHashSet();
        var partyIds = payments.Select(p => p.PartyId)
            .Concat(payments.Where(p => p.BuyerPartyId.HasValue).Select(p => p.BuyerPartyId!.Value))
            .Distinct().ToList();
        var names = await _db.PartyProfiles.AsNoTracking()
            .Where(pp => partyIds.Contains(pp.Id))
            .Join(_db.Contacts, pp => pp.ContactId, c => c.Id, (pp, c) => new { pp.Id, c.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName);
        int added = 0;
        foreach (var p in payments)
        {
            foreach (var piece in (p.Notes ?? "").Split(" | "))
            {
                if (!piece.StartsWith("TXN:")) continue;
                var parts = piece.Substring(4).Split('|');
                if (parts.Length < 5 || !parts[0].Equals("Cheque", StringComparison.OrdinalIgnoreCase)) continue;
                var key = (p.PaymentNo ?? "") + "|" + (parts[2] ?? "");
                if (existing.Contains(key)) continue;
                decimal.TryParse(parts[4], out var amt);
                var ch = new ChequeHandover
                {
                    Id = Guid.NewGuid(), FirmId = firmId, PaymentRef = p.PaymentNo,
                    SupplierName = names.GetValueOrDefault(p.PartyId),
                    BuyerName = p.BuyerPartyId.HasValue ? names.GetValueOrDefault(p.BuyerPartyId.Value) : null,
                    ChequeNo = parts[2], BankName = parts[1],
                    Amount = amt, TakenBy = null, HandedDate = null, CommissionPaid = false, CommissionAmount = 0,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                if (DateOnly.TryParse(parts[3], out var cd)) ch.ChequeDate = cd;
                _db.ChequeHandovers.Add(ch);
                existing.Add(key);
                added++;
            }
        }
        if (added > 0) await _db.SaveChangesAsync();
        return Ok(new { added });
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
