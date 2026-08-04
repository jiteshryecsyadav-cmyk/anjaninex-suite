using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Manufacturer.Entities;
using Namokara.Api.Modules.Trading.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── likhne ke liye ──
public record SReturnLineDto(Guid? BillLineId, Guid ItemId, string? Description,
                             decimal Qty, string? Unit, decimal Rate, decimal? TaxRate);

public record MakeSalesReturnDto(
    Guid PartyId, Guid GodownId, Guid? BillId,
    DateOnly? ReturnDate, string? Transport, string? LrNo,
    string? Reason, string? Remark,
    /// <summary>direct_adjustment = bill me hi katega · credit_note = alag credit note</summary>
    string? EffectMode,
    List<SReturnLineDto> Lines);

/// <summary>
/// Sales Return — becha hua maal grahak ne wapas kar diya.
///
/// Ye `trading.goods_returns` me jaata hai, `mfg` me apni table nahi banayi —
/// wahi wajah jo Tax Invoice ki thi: GR ka voucher posting (grahak ko credit,
/// Sales Return ledger Dr, output GST ulta) pehle se likha aur chal raha hai.
/// Dobara likhne ka matlab do jagah do hisab.
///
/// Do cheezein saath chalti hain aur dono zaroori hain:
///   PAISA  — grahak ka khata (goods_returns + voucher)
///   MAAL   — godown me wapas (mfg.stock_ledger, ref_type 'sreturn')
/// Agency ko sirf pehli chahiye thi, manufacturer ko dono — maal sach me
/// godown me wapas aata hai aur dobara bik sakta hai.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/sales-returns")]
[ModuleAccess("manufacturer")]
public class SalesReturnsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IGoodsReturnService _grs;
    private readonly IBillService _bills;
    public SalesReturnsController(AppDbContext db, IGoodsReturnService grs, IBillService bills)
    { _db = db; _grs = grs; _bills = bills; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("user_id")?.Value!);

    [HttpGet]
    [HasPermission("sales.sreturn.view.place")]
    public async Task<IActionResult> List([FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
                                          [FromQuery] Guid? partyId, [FromQuery] string? status,
                                          [FromQuery] int page = 1, [FromQuery] int size = 50)
    {
        var (items, total) = await _grs.List(status, from, to, partyId, page, size);
        return Ok(new { items, total });
    }

    [HttpGet("{id}")]
    [HasPermission("sales.sreturn.view.place")]
    public async Task<IActionResult> Get(Guid id)
    {
        var gr = await _grs.Get(id);
        return gr is null ? NotFound() : Ok(gr);
    }

    /// <summary>
    /// Kis bill ka maal wapas aaya — grahak ke wo bill jinki return abhi nahi bani.
    /// (Ek bill ki ek hi GR banti hai — service ka apna niyam.)
    /// </summary>
    [HttpGet("billable")]
    [HasPermission("sales.sreturn.create.place")]
    public async Task<IActionResult> Billable([FromQuery] Guid partyId)
    {
        var firmId = CurrentFirmId;

        var hoChuki = await _db.GoodsReturns.AsNoTracking()
            .Where(g => g.FirmId == firmId && g.OriginalBillId != null)
            .Select(g => g.OriginalBillId!.Value)
            .ToListAsync();

        var bills = await _db.Bills.AsNoTracking()
            .Where(b => b.FirmId == firmId && b.BillType == "sales"
                     && b.PartyId == partyId && b.DeletedAt == null
                     && !hoChuki.Contains(b.Id))
            .OrderByDescending(b => b.BillDate)
            .Take(100)
            .Select(b => new { b.Id, b.BillNo, b.BillDate, b.Total })
            .ToListAsync();

        return Ok(bills);
    }

    /// <summary>Bill ki lines — return form inhi se bharta hai (qty 0 se shuru).</summary>
    [HttpGet("bill/{billId}/lines")]
    [HasPermission("sales.sreturn.create.place")]
    public async Task<IActionResult> BillLines(Guid billId)
    {
        var firmId = CurrentFirmId;
        var bill = await _db.Bills.AsNoTracking()
            .FirstOrDefaultAsync(b => b.Id == billId && b.FirmId == firmId);
        if (bill is null) return NotFound();

        var lines = await _db.BillLines.AsNoTracking()
            .Where(l => l.BillId == billId)
            .OrderBy(l => l.SortOrder)
            .Select(l => new
            {
                BillLineId = l.Id, l.ItemId, l.ItemName, l.Description, l.HsnSac,
                BechiQty = l.Qty, l.Unit, l.Rate, l.TaxRate
            })
            .ToListAsync();

        return Ok(new { bill.Id, bill.BillNo, bill.BillDate, bill.Total, Lines = lines });
    }

    [HttpPost]
    [HasPermission("sales.sreturn.create.place")]
    public async Task<IActionResult> Create([FromBody] MakeSalesReturnDto dto)
    {
        var firmId = CurrentFirmId;

        if (dto.Lines is null || dto.Lines.Count == 0)
            return BadRequest(new { error = "Kam se kam ek maal to daaliye" });
        if (dto.Lines.Any(l => l.Qty <= 0))
            return BadRequest(new { error = "Har line me quantity 0 se zyada honi chahiye" });

        var party = await _db.PartyProfiles.AsNoTracking()
            .AnyAsync(p => p.Id == dto.PartyId && p.FirmId == firmId);
        if (!party) return BadRequest(new { error = "Customer nahi mila" });

        var godown = await _db.Godowns.AsNoTracking()
            .AnyAsync(g => g.Id == dto.GodownId && g.FirmId == firmId && g.IsActive);
        if (!godown)
            return BadRequest(new { error = "Godown chuniye — maal kahan wapas aaya ye batana zaroori hai" });

        var branchId = await HeadOfficeBranchId(firmId);
        if (branchId is null)
            return BadRequest(new { error =
                "Is firm ka koi branch nahi mila — Team → Branches me ek banaiye." });

        decimal billAmount = 0;
        if (dto.BillId is Guid bid)
        {
            var bill = await _db.Bills.AsNoTracking()
                .FirstOrDefaultAsync(b => b.Id == bid && b.FirmId == firmId
                                       && b.BillType == "sales" && b.DeletedAt == null);
            if (bill is null) return BadRequest(new { error = "Bill nahi mila" });
            if (bill.PartyId != dto.PartyId)
                return BadRequest(new { error = "Ye bill kisi aur customer ka hai" });
            billAmount = bill.Total;
        }

        var itemIds = dto.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => new { i.Name, i.HsnSac, i.TaxRate, i.ItemKind });
        if (items.Count != itemIds.Count)
            return BadRequest(new { error = "Koi maal list me nahi mila — page refresh kijiye" });

        var grLines = dto.Lines.Select(l =>
        {
            var it = items[l.ItemId];
            var taxRate = l.TaxRate ?? it.TaxRate;
            var taxable = Math.Round(l.Qty * l.Rate, 2, MidpointRounding.AwayFromZero);
            var tax = Math.Round(taxable * taxRate / 100m, 2, MidpointRounding.AwayFromZero);
            return new GoodsReturnLineDto(
                Id: null, BillLineId: l.BillLineId, ItemId: l.ItemId,
                ItemName: it.Name, Description: l.Description, HsnSac: it.HsnSac,
                Qty: l.Qty, Unit: l.Unit, Rate: l.Rate, Rd: 0, IgstPct: taxRate,
                TaxableAmount: taxable, TaxAmount: tax, TotalAmount: taxable + tax);
        }).ToList();

        // ⚠️ SupplierPartyId me grahak, BuyerPartyId KHALI — jaan-boojh kar.
        //
        // Manufacturer khud bechne wala hai, beech me koi teesra supplier hai
        // hi nahi. Dono khaano me grahak daalte to voucher "Dr grahak / Cr
        // grahak" ban jaata — yaani kuch hua hi nahi. Buyer khali rakhne par
        // service ka wahi rasta chalta hai jo sahi hai:
        //     Cr grahak · Dr Sales Return · Dr Output Tax Reversal
        var createDto = new CreateGoodsReturnDto(
            GrDate: dto.ReturnDate ?? Today(),
            SupplierPartyId: dto.PartyId,
            BuyerPartyId: null,
            OriginalBillId: dto.BillId,
            Transport: dto.Transport,
            LrNo: dto.LrNo,
            Reason: dto.Reason,
            Remark: dto.Remark,
            EffectMode: string.IsNullOrWhiteSpace(dto.EffectMode) ? "direct_adjustment" : dto.EffectMode,
            OriginalBillAmount: billAmount,
            CreditNoteValidTill: null,
            CreditNoteAdjustFuture: true,
            CommissionPct: 0,
            Status: "approved",
            Lines: grLines);

        await using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            var gr = await _grs.Create(createDto, firmId, branchId.Value, CurrentUserId);

            // MAAL wapas godown me — yahi hissa agency me nahi hota
            foreach (var l in dto.Lines)
                _db.StockLedger.Add(new StockLedgerEntry
                {
                    FirmId = firmId, GodownId = dto.GodownId, ItemId = l.ItemId,
                    ItemKind = items[l.ItemId].ItemKind == "material" ? "material" : "design",
                    QtyIn = l.Qty, RefType = "sreturn", RefId = gr.Id,
                    CreatedBy = CurrentUserId
                });
            await _db.SaveChangesAsync();

            await tx.CommitAsync();
            return Ok(new { gr.Id, gr.GrNo, gr.TotalReturnAmount });
        }
        catch (ArgumentException ex)
        {
            await tx.RollbackAsync();
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Return hatao. Maal jo stock me wapas aaya tha wo phir se nikal jayega —
    /// warna wo maal do baar bikne ke liye pada rehta.
    /// </summary>
    [HttpDelete("{id}")]
    [HasPermission("sales.sreturn.delete.place")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var firmId = CurrentFirmId;
        var gr = await _grs.Get(id);
        if (gr is null) return NotFound();

        await using var tx = await _db.Database.BeginTransactionAsync();

        var pehle = await _db.StockLedger
            .Where(s => s.FirmId == firmId && s.RefType == "sreturn" && s.RefId == id)
            .ToListAsync();
        foreach (var s in pehle)
            _db.StockLedger.Add(new StockLedgerEntry
            {
                FirmId = firmId, GodownId = s.GodownId, ItemId = s.ItemId,
                ItemKind = s.ItemKind, Colour = s.Colour, Size = s.Size,
                QtyOut = s.QtyIn, RefType = "sreturn", RefId = id,
                CreatedBy = CurrentUserId
            });
        await _db.SaveChangesAsync();

        await _grs.Delete(id);
        await tx.CommitAsync();
        return Ok(new { deleted = true });
    }

    // ══════════ madad ══════════

    private async Task<Guid?> HeadOfficeBranchId(Guid firmId) =>
        await _db.Branches.AsNoTracking()
            .Where(b => b.FirmId == firmId)
            .OrderByDescending(b => b.IsHeadOffice)
            .Select(b => (Guid?)b.Id)
            .FirstOrDefaultAsync();

    private static DateOnly Today() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime);
}
