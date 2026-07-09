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

    // Purani cheque payments ko register me laao/sync karo.
    // Receipt me Payment.PartyId = BUYER; asli SUPPLIER notes ke "Supplier: X" piece me hota hai.
    // Purani galat rows (jinme buyer ka naam supplier column me tha) ko bhi update kar deta hai.
    [HttpPost("backfill")]
    public async Task<IActionResult> Backfill()
    {
        var firmId = FirmId;
        var payments = await _db.Payments.AsNoTracking()
            .Where(p => p.FirmId == firmId && p.DeletedAt == null && p.Notes != null && p.Notes.Contains("TXN:"))
            .Select(p => new { p.PaymentNo, p.PartyId, p.Notes }).ToListAsync();
        var partyIds = payments.Select(p => p.PartyId).Distinct().ToList();
        var buyerNames = await _db.PartyProfiles.AsNoTracking()
            .Where(pp => partyIds.Contains(pp.Id))
            .Join(_db.Contacts, pp => pp.ContactId, c => c.Id, (pp, c) => new { pp.Id, c.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName);
        var existingRows = await _db.ChequeHandovers.Where(c => c.FirmId == firmId).ToListAsync();
        var existingMap = new Dictionary<string, ChequeHandover>();
        foreach (var r in existingRows)
        {
            var k = (r.PaymentRef ?? "") + "|" + (r.ChequeNo ?? "");
            if (!existingMap.ContainsKey(k)) existingMap[k] = r;
        }
        int added = 0, updated = 0;
        foreach (var p in payments)
        {
            string? supFromNotes = null;
            foreach (var piece in (p.Notes ?? "").Split(" | "))
                if (piece.StartsWith("Supplier: ")) supFromNotes = piece.Substring(10).Trim();
            var buyerNm = buyerNames.GetValueOrDefault(p.PartyId);
            foreach (var piece in (p.Notes ?? "").Split(" | "))
            {
                if (!piece.StartsWith("TXN:")) continue;
                var parts = piece.Substring(4).Split('|');
                if (parts.Length < 5 || !parts[0].Equals("Cheque", StringComparison.OrdinalIgnoreCase)) continue;
                var chequeNo = parts[2];
                var key = (p.PaymentNo ?? "") + "|" + (chequeNo ?? "");
                decimal.TryParse(parts[4], out var amt);
                if (existingMap.TryGetValue(key, out var row))
                {
                    if (!string.IsNullOrWhiteSpace(supFromNotes)) row.SupplierName = supFromNotes;
                    if (!string.IsNullOrWhiteSpace(buyerNm)) row.BuyerName = buyerNm;
                    updated++;
                }
                else
                {
                    var ch = new ChequeHandover
                    {
                        Id = Guid.NewGuid(), FirmId = firmId, PaymentRef = p.PaymentNo,
                        SupplierName = supFromNotes, BuyerName = buyerNm,
                        ChequeNo = chequeNo, BankName = parts[1],
                        Amount = amt, TakenBy = null, HandedDate = null, CommissionPaid = false, CommissionAmount = 0,
                        CreatedAt = DateTimeOffset.UtcNow
                    };
                    if (DateOnly.TryParse(parts[3], out var cd)) ch.ChequeDate = cd;
                    _db.ChequeHandovers.Add(ch);
                    existingMap[key] = ch;
                    added++;
                }
            }
        }
        await _db.SaveChangesAsync();
        return Ok(new { added, updated });
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
