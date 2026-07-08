using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Trading.Controllers;

public record CommissionInvoiceLineDto(
    Guid BillId, string BillNo, DateOnly BillDate,
    decimal BillAmount, decimal CommissionPct, decimal CommissionAmount);

public record CreateCommissionInvoiceDto(
    Guid PartyId,
    decimal CommissionPct,
    decimal GstPct,
    string? Notes,
    List<CommissionInvoiceLineDto> Lines);

public record CommissionInvoiceListDto(
    Guid Id, string InvoiceNo, DateOnly InvoiceDate,
    Guid PartyId, string PartyName,
    decimal GrossAmount, decimal CommissionAmount, decimal GstAmount, decimal TotalAmount,
    int BillCount, string Status, DateTimeOffset CreatedAt);

public record CommissionInvoiceDetailDto(
    Guid Id, string InvoiceNo, DateOnly InvoiceDate,
    Guid PartyId, string PartyName,
    decimal CommissionPct, decimal GrossAmount, decimal CommissionAmount,
    decimal GstPct, decimal GstAmount, decimal TotalAmount,
    string Status, string? Notes,
    List<CommissionInvoiceLineDto> Lines);

[Authorize]
[ModuleAccess("commission")]   // 🔒 Backend gate
[ApiController]
[Route("api/trading/commission-invoices")]
public class CommissionInvoicesController : ControllerBase
{
    private readonly AppDbContext _db;
    public CommissionInvoicesController(AppDbContext db) => _db = db;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);
    private Guid CurrentBranchId
    {
        get
        {
            var b = Request.Headers["X-Branch-Id"].FirstOrDefault()
                ?? User.FindFirst("default_branch_id")?.Value;
            return Guid.Parse(b ?? throw new InvalidOperationException("Branch not selected"));
        }
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var firmId = CurrentFirmId;
        var invoices = await _db.CommissionInvoices.AsNoTracking()
            .Where(c => c.FirmId == firmId)
            .OrderByDescending(c => c.InvoiceDate).ThenByDescending(c => c.CreatedAt)
            .ToListAsync();

        // Fetch party names + line counts
        var partyIds = invoices.Select(i => i.PartyId).Distinct().ToList();
        var invoiceIds = invoices.Select(i => i.Id).ToList();

        var parties = await _db.PartyProfiles.AsNoTracking()
            .Where(p => partyIds.Contains(p.Id))
            .Join(_db.Contacts.AsNoTracking(), p => p.ContactId, c => c.Id,
                (p, c) => new { p.Id, c.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

        var lineCounts = await _db.CommissionInvoiceLines.AsNoTracking()
            .Where(l => invoiceIds.Contains(l.CommissionInvoiceId))
            .GroupBy(l => l.CommissionInvoiceId)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count);

        var result = invoices.Select(i => new CommissionInvoiceListDto(
            i.Id, i.InvoiceNo, i.InvoiceDate,
            i.PartyId, parties.GetValueOrDefault(i.PartyId, "—"),
            i.GrossAmount, i.CommissionAmount, i.GstAmount, i.TotalAmount,
            lineCounts.GetValueOrDefault(i.Id, 0),
            i.Status, i.CreatedAt
        )).ToList();

        return Ok(result);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var firmId = CurrentFirmId;
        var inv = await _db.CommissionInvoices.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id && c.FirmId == firmId);
        if (inv == null) return NotFound();

        var partyName = await _db.PartyProfiles.AsNoTracking()
            .Where(p => p.Id == inv.PartyId)
            .Join(_db.Contacts.AsNoTracking(), p => p.ContactId, c => c.Id, (p, c) => c.DisplayName)
            .FirstOrDefaultAsync() ?? "—";

        var lines = await _db.CommissionInvoiceLines.AsNoTracking()
            .Where(l => l.CommissionInvoiceId == id)
            .OrderBy(l => l.SortOrder)
            .Select(l => new CommissionInvoiceLineDto(
                l.BillId, l.BillNo, l.BillDate,
                l.BillAmount, l.CommissionPct, l.CommissionAmount))
            .ToListAsync();

        return Ok(new CommissionInvoiceDetailDto(
            inv.Id, inv.InvoiceNo, inv.InvoiceDate,
            inv.PartyId, partyName,
            inv.CommissionPct, inv.GrossAmount, inv.CommissionAmount,
            inv.GstPct, inv.GstAmount, inv.TotalAmount,
            inv.Status, inv.Notes,
            lines
        ));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCommissionInvoiceDto dto)
    {
        try
        {
            if (dto.Lines == null || dto.Lines.Count == 0)
                return BadRequest(new { error = "At least one bill line is required" });

            var firmId = CurrentFirmId;
            var branchId = CurrentBranchId;

            // Branch resilience: agar header/claim wali branch is firm me valid nahi hai
            // (stale localStorage etc.) to firm ki pehli real branch use karo — FK fail na ho.
            var branchValid = await _db.Branches.AnyAsync(b => b.Id == branchId && b.FirmId == firmId);
            if (!branchValid)
            {
                var fallback = await _db.Branches
                    .Where(b => b.FirmId == firmId)
                    .OrderBy(b => b.Code)
                    .Select(b => (Guid?)b.Id)
                    .FirstOrDefaultAsync();
                if (fallback == null)
                    return BadRequest(new { error = "Is firm me koi branch nahi mili. Pehle ek branch banayein." });
                branchId = fallback.Value;
            }

            // Party valid hai? (stale selection / delete guard)
            var partyValid = await _db.PartyProfiles.AnyAsync(p => p.Id == dto.PartyId && p.FirmId == firmId);
            if (!partyValid)
                return BadRequest(new { error = "Selected party valid nahi hai (ya delete ho chuki hai). Party dobara select karein." });

            // Saari bills valid hain?
            var billIds = dto.Lines.Select(l => l.BillId).Distinct().ToList();
            var validBillCount = await _db.Bills.CountAsync(b => billIds.Contains(b.Id) && b.FirmId == firmId);
            if (validBillCount != billIds.Count)
                return BadRequest(new { error = "Ek ya zyada selected bill ab valid nahi hai. Page refresh karke bills dobara fetch karein." });

            var grossAmount = dto.Lines.Sum(l => l.BillAmount);
            var commissionAmount = dto.Lines.Sum(l => l.CommissionAmount);
            var gstAmount = Math.Round(commissionAmount * dto.GstPct / 100m, 2);
            // Round-off: final invoice amount poore rupee me (e.g. 907.70 -> 908).
            var totalAmount = Math.Round(commissionAmount + gstAmount, 0, MidpointRounding.AwayFromZero);

            // Header + lines must be atomic, and the invoice number must be race-safe
            // (the old CountAsync+1 gave duplicate numbers under concurrent requests).
            using var tx = await _db.Database.BeginTransactionAsync();
            try
            {
                // Short format: JPR-C1, JPR-C2 ... (C = Commission) — FY-wise race-safe counter
                var branchRow = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                          ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                          ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");
                var fyYear = DateTime.UtcNow.Month >= 4 ? DateTime.UtcNow.Year : DateTime.UtcNow.Year - 1;
                var nextNo = await ReserveCounterAsync(firmId, branchId, "commission", fyYear);
                var invoiceNo = $"{branchRow.Code}-C{nextNo}";

                var inv = new CommissionInvoice
                {
                    Id = Guid.NewGuid(),
                    FirmId = firmId,
                    BranchId = branchId,
                    InvoiceNo = invoiceNo,
                    InvoiceDate = DateOnly.FromDateTime(DateTime.UtcNow),
                    PartyId = dto.PartyId,
                    CommissionPct = dto.CommissionPct,
                    GrossAmount = grossAmount,
                    CommissionAmount = commissionAmount,
                    GstPct = dto.GstPct,
                    GstAmount = gstAmount,
                    TotalAmount = totalAmount,
                    Status = "pending",
                    Notes = dto.Notes,
                    CreatedBy = CurrentUserId,
                    CreatedAt = DateTimeOffset.UtcNow,
                    UpdatedAt = DateTimeOffset.UtcNow
                };
                _db.CommissionInvoices.Add(inv);
                await _db.SaveChangesAsync();   // PEHLE parent invoice insert — warna lines ka FK fail hota hai

                int sort = 1;
                foreach (var line in dto.Lines)
                {
                    _db.CommissionInvoiceLines.Add(new CommissionInvoiceLine
                    {
                        Id = Guid.NewGuid(),
                        CommissionInvoiceId = inv.Id,
                        BillId = line.BillId,
                        BillNo = line.BillNo,
                        BillDate = line.BillDate,
                        BillAmount = line.BillAmount,
                        CommissionPct = line.CommissionPct,
                        CommissionAmount = line.CommissionAmount,
                        SortOrder = sort++
                    });
                }

                // Buyer Agent (del-credere) earnings: har line ke bill ka buyer -> uska agent -> share%.
                var lineBillIds = dto.Lines.Select(l => l.BillId).Distinct().ToList();
                var billBuyers = await _db.Bills.AsNoTracking()
                    .Where(b => lineBillIds.Contains(b.Id) && b.FirmId == firmId)
                    .Select(b => new { b.Id, b.BuyerPartyId }).ToListAsync();
                var billToBuyer = billBuyers.Where(b => b.BuyerPartyId.HasValue)
                    .ToDictionary(b => b.Id, b => b.BuyerPartyId!.Value);
                var buyerPartyIds = billToBuyer.Values.Distinct().ToList();
                if (buyerPartyIds.Count > 0)
                {
                    var buyerInfo = await _db.PartyProfiles.AsNoTracking()
                        .Where(p => buyerPartyIds.Contains(p.Id))
                        .Join(_db.Contacts.AsNoTracking(), p => p.ContactId, c => c.Id,
                            (p, c) => new { PartyId = p.Id, c.BuyerAgentId, c.BuyerAgentSharePct, c.DisplayName })
                        .ToListAsync();
                    var buyerMap = buyerInfo.ToDictionary(x => x.PartyId, x => x);
                    var agentIds = buyerInfo.Where(x => x.BuyerAgentId.HasValue)
                        .Select(x => x.BuyerAgentId!.Value).Distinct().ToList();
                    var agentDefaults = await _db.BuyerAgents.AsNoTracking()
                        .Where(a => agentIds.Contains(a.Id) && a.FirmId == firmId)
                        .ToDictionaryAsync(a => a.Id, a => a.DefaultSharePct);

                    var acc = new Dictionary<Guid, (decimal gross, decimal share, decimal pct, HashSet<string> buyers)>();
                    foreach (var line in dto.Lines)
                    {
                        if (!billToBuyer.TryGetValue(line.BillId, out var bpid)) continue;
                        if (!buyerMap.TryGetValue(bpid, out var bi) || bi.BuyerAgentId == null) continue;
                        var aid = bi.BuyerAgentId.Value;
                        var pct = bi.BuyerAgentSharePct ?? agentDefaults.GetValueOrDefault(aid, 0m);
                        if (pct <= 0) continue;
                        var sh = Math.Round(line.CommissionAmount * pct / 100m, 2);
                        (decimal gross, decimal share, decimal pct, HashSet<string> buyers) cur;
                        if (!acc.TryGetValue(aid, out cur)) cur = (0m, 0m, pct, new HashSet<string>());
                        cur.gross += line.CommissionAmount;
                        cur.share += sh;
                        cur.pct = pct;
                        if (!string.IsNullOrWhiteSpace(bi.DisplayName)) cur.buyers.Add(bi.DisplayName);
                        acc[aid] = cur;
                    }
                    foreach (var kv in acc)
                    {
                        _db.BuyerAgentEarnings.Add(new BuyerAgentEarning
                        {
                            Id = Guid.NewGuid(), FirmId = firmId, BuyerAgentId = kv.Key,
                            CommissionInvoiceId = inv.Id,
                            BuyerName = kv.Value.buyers.Count == 1 ? kv.Value.buyers.First()
                                        : (kv.Value.buyers.Count > 1 ? "(multiple)" : null),
                            GrossCommission = kv.Value.gross, SharePct = kv.Value.pct, ShareAmount = kv.Value.share,
                            RefNo = inv.InvoiceNo, CreatedAt = DateTimeOffset.UtcNow
                        });
                    }
                }

                await _db.SaveChangesAsync();
                await tx.CommitAsync();
                return Ok(new { id = inv.Id, invoiceNo = inv.InvoiceNo, totalAmount });
            }
            catch
            {
                try { await tx.RollbackAsync(); } catch { }
                throw;
            }
        }
        catch (Exception ex)
        {
            // VERBOSE diagnostic — asli wajah browser popup me dikhe (constraint/table/detail).
            var root = ex;
            while (root.InnerException != null) root = root.InnerException;
            if (root is Npgsql.PostgresException pg)
                Console.WriteLine($"[CommissionInvoice.Create] PG {pg.SqlState} constraint='{pg.ConstraintName}' table='{pg.TableName}' detail='{pg.Detail}'");
            else
                Console.WriteLine($"[CommissionInvoice.Create] {root.GetType().Name}: {root.Message}");
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    /// <summary>
    /// Atomic counter using PostgreSQL UPSERT + RETURNING. Race-safe across concurrent
    /// requests. Shares platform.voucher_counters with BillService/VoucherService.
    /// </summary>
    private async Task<long> ReserveCounterAsync(Guid firmId, Guid branchId, string counterKey, int fyYear)
    {
        var sql = @"
INSERT INTO platform.voucher_counters (firm_id, branch_id, counter_key, fy_year, next_no)
VALUES ({0}, {1}, {2}, {3}, 1)
ON CONFLICT (firm_id, branch_id, counter_key, fy_year)
DO UPDATE SET next_no = platform.voucher_counters.next_no + 1
RETURNING next_no;";
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
        // RLS: raw connection bypasses EF interceptor — set tenant context before the write.
        await Namokara.Api.Common.Db.TenantContextSetter.ApplyAsync(conn, firmId, branchId);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = string.Format(sql,
            $"'{firmId}'::uuid", $"'{branchId}'::uuid",
            $"'{counterKey.Replace("'", "''")}'", fyYear);
        var result = await cmd.ExecuteScalarAsync();
        return Convert.ToInt64(result);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var inv = await _db.CommissionInvoices
            .FirstOrDefaultAsync(c => c.Id == id && c.FirmId == CurrentFirmId);
        if (inv == null) return NotFound();
        _db.CommissionInvoices.Remove(inv);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
