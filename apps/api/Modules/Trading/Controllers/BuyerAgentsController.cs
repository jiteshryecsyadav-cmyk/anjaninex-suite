using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Trading.Controllers;

// Buyer Agent (del-credere): buyer ka agent jo payment guarantee leta hai;
// hamari commission ka X% leta hai. Master + earnings ledger + payouts.

public record BuyerAgentDto(string Name, string? Phone, string? City, decimal DefaultSharePct, string? Notes, bool IsActive);
public record BuyerAgentPayoutDto(Guid BuyerAgentId, string? PayoutDate, decimal Amount, string? Mode, string? RefNo, string? Notes);

[ApiController]
[Authorize]
[Route("api/trading/buyer-agents")]
public class BuyerAgentsController : ControllerBase
{
    private readonly AppDbContext _db;
    public BuyerAgentsController(AppDbContext db) => _db = db;

    private Guid FirmId => Guid.Parse(User.FindFirst("firm_id")?.Value
        ?? throw new InvalidOperationException("firm_id claim missing"));
    private Guid? UserId => Guid.TryParse(User.FindFirst("user_id")?.Value, out var u) ? u : (Guid?)null;

    // ---- Master ----
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool all = false)
    {
        var q = _db.BuyerAgents.AsNoTracking().Where(a => a.FirmId == FirmId);
        if (!all) q = q.Where(a => a.IsActive);
        var rows = await q.OrderBy(a => a.Name).ToListAsync();
        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] BuyerAgentDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { error = "Agent ka naam zaroori hai." });
        var a = new BuyerAgent
        {
            Id = Guid.NewGuid(), FirmId = FirmId,
            Name = dto.Name.Trim(), Phone = dto.Phone?.Trim(), City = dto.City?.Trim(),
            DefaultSharePct = dto.DefaultSharePct, Notes = dto.Notes, IsActive = dto.IsActive,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.BuyerAgents.Add(a);
        await _db.SaveChangesAsync();
        return Ok(a);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] BuyerAgentDto dto)
    {
        var a = await _db.BuyerAgents.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == FirmId);
        if (a is null) return NotFound();
        a.Name = dto.Name.Trim(); a.Phone = dto.Phone?.Trim(); a.City = dto.City?.Trim();
        a.DefaultSharePct = dto.DefaultSharePct; a.Notes = dto.Notes; a.IsActive = dto.IsActive;
        await _db.SaveChangesAsync();
        return Ok(a);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var a = await _db.BuyerAgents.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == FirmId);
        if (a is null) return NotFound();
        var hasEarnings = await _db.BuyerAgentEarnings.AnyAsync(e => e.BuyerAgentId == id && e.FirmId == FirmId);
        if (hasEarnings) { a.IsActive = false; await _db.SaveChangesAsync(); return Ok(new { softDeleted = true }); }
        _db.BuyerAgents.Remove(a);
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // ---- Agent-wise summary: earned / paid / balance ----
    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        var firmId = FirmId;
        var agents = await _db.BuyerAgents.AsNoTracking().Where(a => a.FirmId == firmId).ToListAsync();
        var earned = await _db.BuyerAgentEarnings.AsNoTracking().Where(e => e.FirmId == firmId)
            .GroupBy(e => e.BuyerAgentId)
            .Select(g => new { Id = g.Key, Sum = g.Sum(x => x.ShareAmount) })
            .ToDictionaryAsync(x => x.Id, x => x.Sum);
        var paid = await _db.BuyerAgentPayouts.AsNoTracking().Where(p => p.FirmId == firmId)
            .GroupBy(p => p.BuyerAgentId)
            .Select(g => new { Id = g.Key, Sum = g.Sum(x => x.Amount) })
            .ToDictionaryAsync(x => x.Id, x => x.Sum);
        var rows = agents.Select(a => new
        {
            a.Id, a.Name, a.Phone, a.City, a.DefaultSharePct, a.IsActive,
            Earned = earned.GetValueOrDefault(a.Id, 0m),
            Paid = paid.GetValueOrDefault(a.Id, 0m),
            Balance = earned.GetValueOrDefault(a.Id, 0m) - paid.GetValueOrDefault(a.Id, 0m)
        }).OrderByDescending(x => x.Balance).ToList();
        return Ok(rows);
    }

    // ---- One agent ka ledger: earnings + payouts ----
    [HttpGet("{id}/ledger")]
    public async Task<IActionResult> Ledger(Guid id)
    {
        var firmId = FirmId;
        var agent = await _db.BuyerAgents.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id && a.FirmId == firmId);
        if (agent is null) return NotFound();
        var earnings = await _db.BuyerAgentEarnings.AsNoTracking()
            .Where(e => e.BuyerAgentId == id && e.FirmId == firmId)
            .OrderByDescending(e => e.CreatedAt).Take(1000).ToListAsync();
        var payouts = await _db.BuyerAgentPayouts.AsNoTracking()
            .Where(p => p.BuyerAgentId == id && p.FirmId == firmId)
            .OrderByDescending(p => p.PayoutDate).Take(1000).ToListAsync();
        var earned = earnings.Sum(e => e.ShareAmount);
        var paidSum = payouts.Sum(p => p.Amount);
        return Ok(new { agent, earnings, payouts, earned, paid = paidSum, balance = earned - paidSum });
    }

    // ---- Report: saari earnings (from/to filter) with buyer name ----
    [HttpGet("earnings")]
    public async Task<IActionResult> Earnings([FromQuery] string? from, [FromQuery] string? to, [FromQuery] Guid? agentId)
    {
        var firmId = FirmId;
        var q = _db.BuyerAgentEarnings.AsNoTracking().Where(e => e.FirmId == firmId);
        if (agentId.HasValue) q = q.Where(e => e.BuyerAgentId == agentId.Value);
        var list = await q.OrderByDescending(e => e.CreatedAt).Take(2000).ToListAsync();
        if (DateTimeOffset.TryParse(from, out var f)) list = list.Where(e => e.CreatedAt >= f).ToList();
        if (DateTimeOffset.TryParse(to, out var t)) list = list.Where(e => e.CreatedAt <= t.AddDays(1)).ToList();
        var names = await _db.BuyerAgents.AsNoTracking().Where(a => a.FirmId == firmId)
            .ToDictionaryAsync(a => a.Id, a => a.Name);
        var rows = list.Select(e => new
        {
            e.Id, e.CreatedAt, e.CommissionInvoiceId, e.RefNo,
            AgentId = e.BuyerAgentId, AgentName = names.GetValueOrDefault(e.BuyerAgentId, "-"),
            e.BuyerName, e.GrossCommission, e.SharePct, e.ShareAmount
        }).ToList();
        return Ok(rows);
    }

    // ---- Payout: hamne agent ko diya ----
    [HttpPost("payout")]
    public async Task<IActionResult> Payout([FromBody] BuyerAgentPayoutDto dto)
    {
        var agent = await _db.BuyerAgents.FirstOrDefaultAsync(a => a.Id == dto.BuyerAgentId && a.FirmId == FirmId);
        if (agent is null) return BadRequest(new { error = "Agent valid nahi hai." });
        var p = new BuyerAgentPayout
        {
            Id = Guid.NewGuid(), FirmId = FirmId, BuyerAgentId = dto.BuyerAgentId,
            PayoutDate = DateOnly.TryParse(dto.PayoutDate, out var d) ? d : DateOnly.FromDateTime(DateTime.UtcNow),
            Amount = dto.Amount, Mode = dto.Mode, RefNo = dto.RefNo, Notes = dto.Notes,
            CreatedBy = UserId, CreatedAt = DateTimeOffset.UtcNow
        };
        _db.BuyerAgentPayouts.Add(p);
        await _db.SaveChangesAsync();
        return Ok(p);
    }

    [HttpDelete("payout/{id}")]
    public async Task<IActionResult> DeletePayout(Guid id)
    {
        var p = await _db.BuyerAgentPayouts.FirstOrDefaultAsync(x => x.Id == id && x.FirmId == FirmId);
        if (p is null) return NotFound();
        _db.BuyerAgentPayouts.Remove(p);
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }
}
