using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Auth;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Trading.Services;

namespace Namokara.Api.Modules.Manufacturer.Controllers;

// ── likhne ke liye ──
public record MakeInvoiceLineDto(Guid ItemId, string? Description,
                                 decimal Qty, string? Unit, decimal Rate,
                                 decimal DiscountPct, decimal? TaxRate);

public record MakeInvoiceDto(
    Guid PartyId,
    /// <summary>Jin challan ka bill ban raha hai. Khali ho to bina challan ka bill.</summary>
    List<Guid>? ChallanIds,
    DateOnly? BillDate,
    string? PoNumber,
    string? EwayBillNo, DateOnly? EwayBillDate,
    Guid? TransporterId, string? LrNo, DateOnly? LrDate,
    decimal Discount, decimal RoundOff, decimal OtherCharges,
    string? Notes,
    /// <summary>Challan chune hon to ye khali chhod do — lines wahin se banti hain.</summary>
    List<MakeInvoiceLineDto>? Lines);

/// <summary>
/// Tax Invoice — manufacturer ka pakka bill.
///
/// Ye JAAN-BOOJH KAR `mfg` me apni table nahi banata. Bill seedha
/// <c>trading.bills</c> me jaata hai, wahi jagah jahan agency ka bill jaata hai.
/// Do wajah:
///
///   1. CREDIL — GST par network credit score wahi table padhti hai
///      (<c>COALESCE(buyer_party_id, party_id)</c>). Manufacturer ka bill alag
///      table me rakhte to wo poore platform ke sabse bade faayde se bahar ho
///      jaata — aur grahak ka score adhoora rehta.
///   2. GST ka poora hisab, voucher posting, gap-free bill number — sab
///      <see cref="IBillService"/> me pehle se hai aur test-shuda hai. Dobara
///      likhne ka matlab do jagah do formula, aur ek din dono alag.
///
/// Party kis khaane me: manufacturer khud bechne wala hai, isliye grahak
/// <c>party_id</c> me jaata hai (purane sales bill jaisa) aur
/// <c>buyer_party_id</c> khali. Credil ka COALESCE isi ko uthata hai, aur
/// GST inter/intra-state bhi grahak ke GSTIN se hi tay hota hai — dono sahi.
///
/// Stock yahan NAHI hilta — wo challan par pehle hi ghat chuka. Bill sirf
/// paisa aur GST ka kaagaz hai.
/// </summary>
[Authorize]
[ApiController]
[Route("api/mfg/invoices")]
[ModuleAccess("manufacturer")]
public class InvoicesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IBillService _bills;
    public InvoicesController(AppDbContext db, IBillService bills)
    { _db = db; _bills = bills; }

    private Guid CurrentFirmId => Guid.Parse(User.FindFirst("firm_id")?.Value!);
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("user_id")?.Value!);

    [HttpGet]
    [HasPermission("sales.invoice.view.place")]
    public async Task<IActionResult> List([FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
                                          [FromQuery] Guid? partyId, [FromQuery] string? status,
                                          [FromQuery] int page = 1, [FromQuery] int size = 50)
    {
        var (items, total) = await _bills.List("sales", from, to, partyId, status, page, size);
        return Ok(new { items, total });
    }

    [HttpGet("{id}")]
    [HasPermission("sales.invoice.view.place")]
    public async Task<IActionResult> Get(Guid id)
    {
        var b = await _bills.Get(id);
        return b is null ? NotFound() : Ok(b);
    }

    /// <summary>
    /// Jin challan ka bill nahi bana — bill banate waqt yahi list dikhti hai.
    /// Ek hi grahak ke kai challan ek bill me jud sakte hain (mahine ka bill).
    /// </summary>
    [HttpGet("pending-challans")]
    [HasPermission("sales.invoice.create.place")]
    public async Task<IActionResult> PendingChallans([FromQuery] Guid? partyId)
    {
        var firmId = CurrentFirmId;
        var q = _db.MfgDeliveryChallans.AsNoTracking()
            .Where(c => c.FirmId == firmId && c.BilledRefId == null);
        if (partyId is Guid p) q = q.Where(c => c.PartyId == p);

        var dcs = await q.OrderBy(c => c.ChallanDate).Take(200).ToListAsync();
        if (dcs.Count == 0) return Ok(Array.Empty<object>());

        var ids = dcs.Select(c => c.Id).ToList();
        var lines = await _db.MfgDeliveryChallanLines.AsNoTracking()
            .Where(l => ids.Contains(l.DcId)).ToListAsync();

        var names = await PurchaseOrdersController.PartyNames(
            _db, dcs.Select(c => c.PartyId).Distinct().ToList());

        return Ok(dcs.Select(c =>
        {
            var ls = lines.Where(l => l.DcId == c.Id).ToList();
            return new
            {
                c.Id, c.DcNo, c.ChallanDate, c.PartyId,
                PartyName = names.GetValueOrDefault(c.PartyId, "—"),
                c.LrNo, c.VehicleNo, c.Packages,
                TotalQty = ls.Sum(l => l.Qty),
                TotalAmount = ls.Sum(l => l.Qty * l.Rate),
                LineCount = ls.Count
            };
        }));
    }

    [HttpPost]
    [HasPermission("sales.invoice.create.place")]
    public async Task<IActionResult> Create([FromBody] MakeInvoiceDto dto)
    {
        var firmId = CurrentFirmId;

        var party = await _db.PartyProfiles.AsNoTracking()
            .AnyAsync(p => p.Id == dto.PartyId && p.FirmId == firmId);
        if (!party)
            return BadRequest(new { error = "Customer nahi mila — pehle Masters → Customers me jodiye" });

        var branchId = await HeadOfficeBranchId(firmId);
        if (branchId is null)
            return BadRequest(new { error =
                "Is firm ka koi branch nahi mila — Team → Branches me ek banaiye." });

        // ── Lines: challan se ya haath se ──
        var challanIds = dto.ChallanIds ?? new List<Guid>();
        List<BillLineDto> lines;
        string supplierRef;

        if (challanIds.Count > 0)
        {
            var dcs = await _db.MfgDeliveryChallans
                .Where(c => c.FirmId == firmId && challanIds.Contains(c.Id))
                .ToListAsync();

            if (dcs.Count != challanIds.Count)
                return BadRequest(new { error = "Koi challan nahi mila — page refresh kijiye" });

            var pehleBana = dcs.FirstOrDefault(c => c.BilledRefId is not null);
            if (pehleBana is not null)
                return BadRequest(new { error =
                    $"{pehleBana.DcNo} ka bill pehle hi ban chuka hai" });

            var galatParty = dcs.FirstOrDefault(c => c.PartyId != dto.PartyId);
            if (galatParty is not null)
                return BadRequest(new { error =
                    $"{galatParty.DcNo} kisi aur customer ka hai — ek bill me ek hi grahak" });

            lines = await LinesFromChallans(firmId, challanIds);
            if (lines.Count == 0)
                return BadRequest(new { error = "In challan me koi maal hi nahi hai" });

            // Duplicate ki pakad isi par lagti hai: same grahak + same challan +
            // same tareekh ka bill dobara nahi banega
            supplierRef = string.Join(",", dcs.OrderBy(c => c.DcNo).Select(c => c.DcNo));
        }
        else
        {
            if (dto.Lines is null || dto.Lines.Count == 0)
                return BadRequest(new { error = "Challan chuniye, ya kam se kam ek line daaliye" });

            var made = await LinesFromDto(firmId, dto.Lines);
            if (made is null)
                return BadRequest(new { error =
                    "Koi maal list me nahi mila — page refresh karke dobara chuniye" });
            lines = made;
            supplierRef = $"DIRECT-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}";
        }

        var billDate = dto.BillDate ?? Today();

        var createDto = new CreateBillDto(
            BillType: "sales",
            BillDate: billDate,
            // Manufacturer khud bechne wala hai — grahak party_id me (purane sales
            // bill jaisa). Credil ka COALESCE(buyer_party_id, party_id) isi ko uthata
            // hai, aur GST inter/intra-state bhi isi ke GSTIN se tay hota hai.
            PartyId: dto.PartyId,
            BuyerPartyId: null,
            InvoiceType: "tax",
            PoNumber: dto.PoNumber,
            SupplierBillNo: supplierRef,
            DeliveryDate: null,
            Discount: dto.Discount,
            RoundOff: dto.RoundOff,
            Notes: dto.Notes,
            EwayBillNo: dto.EwayBillNo,
            EwayBillDate: dto.EwayBillDate,
            TransporterId: dto.TransporterId,
            LrNo: dto.LrNo,
            LrDate: dto.LrDate,
            Lines: lines,
            OtherCharges: dto.OtherCharges);

        await using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            var bill = await _bills.Create(createDto, firmId, branchId.Value, CurrentUserId);

            // Challan par nishaan — ab dobara bill nahi banega
            if (challanIds.Count > 0)
            {
                var dcs = await _db.MfgDeliveryChallans
                    .Where(c => c.FirmId == firmId && challanIds.Contains(c.Id))
                    .ToListAsync();
                foreach (var c in dcs) c.BilledRefId = bill.Id;
                await _db.SaveChangesAsync();
            }

            await tx.CommitAsync();
            return Ok(new { bill.Id, bill.BillNo, bill.Total });
        }
        catch (BillDuplicateException ex)
        {
            await tx.RollbackAsync();
            return BadRequest(new { error =
                $"Isi challan ka bill {ex.ExistingBillNo} pehle hi bana hua hai " +
                $"({ex.BillDate:dd MMM}, ₹{ex.Total:0})" });
        }
    }

    /// <summary>
    /// Bill hatao. Challan ka nishaan bhi hatta hai — wo dobara "bill baki"
    /// wali list me aa jata hai. Stock nahi chhedte: maal to nikal hi chuka,
    /// wo challan ka mamla hai.
    /// </summary>
    [HttpDelete("{id}")]
    [HasPermission("sales.invoice.delete.place")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var firmId = CurrentFirmId;
        var bill = await _bills.Get(id);
        if (bill is null) return NotFound();

        await using var tx = await _db.Database.BeginTransactionAsync();

        var dcs = await _db.MfgDeliveryChallans
            .Where(c => c.FirmId == firmId && c.BilledRefId == id).ToListAsync();
        foreach (var c in dcs) c.BilledRefId = null;
        await _db.SaveChangesAsync();

        await _bills.Delete(id);
        await tx.CommitAsync();
        return Ok(new { deleted = true, challansFreed = dcs.Count });
    }

    // ══════════ madad ══════════

    /// <summary>
    /// Challan ki lines ko bill ki lines banao. Ek hi maal alag-alag challan me
    /// aaya ho to bhi alag line rehti hai — grahak ko challan-wise milaan
    /// karna hota hai, jod dene se wo milaan toot jata.
    /// </summary>
    private async Task<List<BillLineDto>> LinesFromChallans(Guid firmId, List<Guid> challanIds)
    {
        var dcLines = await _db.MfgDeliveryChallanLines.AsNoTracking()
            .Where(l => challanIds.Contains(l.DcId)).ToListAsync();

        var itemIds = dcLines.Select(l => l.ItemId).Distinct().ToList();
        var items = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => new { i.Name, i.HsnSac, i.TaxRate });

        var outp = new List<BillLineDto>();
        foreach (var l in dcLines)
        {
            var it = items.GetValueOrDefault(l.ItemId);
            var taxRate = it?.TaxRate ?? 0m;
            var taxable = Math.Round(l.Qty * l.Rate, 2, MidpointRounding.AwayFromZero);
            var total = Math.Round(taxable * (1 + taxRate / 100m), 2, MidpointRounding.AwayFromZero);

            // Rang aur size bill par bhi dikhne chahiye — grahak isi se pehchanta hai
            var kya = string.Join(" · ",
                new[] { l.Colour, l.Size }.Where(x => !string.IsNullOrWhiteSpace(x)));

            outp.Add(new BillLineDto(
                Id: null, ItemId: l.ItemId, ItemName: it?.Name ?? "—",
                HsnSac: it?.HsnSac, Qty: l.Qty, Unit: l.Unit, Rate: l.Rate,
                DiscountPct: 0, TaxRate: taxRate,
                TaxableAmount: taxable, TotalAmount: total,
                Description: string.IsNullOrEmpty(kya) ? null : kya));
        }
        return outp;
    }

    /// <summary>Koi item na mile to null — bulane wala saaf message deta hai.</summary>
    private async Task<List<BillLineDto>?> LinesFromDto(Guid firmId, List<MakeInvoiceLineDto> dto)
    {
        var itemIds = dto.Select(l => l.ItemId).Distinct().ToList();
        var items = await _db.Items.AsNoTracking()
            .Where(i => i.FirmId == firmId && itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => new { i.Name, i.HsnSac, i.TaxRate });
        if (items.Count != itemIds.Count) return null;

        return dto.Select(l =>
        {
            var it = items[l.ItemId];
            var taxRate = l.TaxRate ?? it.TaxRate;
            var gross = l.Qty * l.Rate;
            var taxable = Math.Round(gross * (1 - l.DiscountPct / 100m), 2, MidpointRounding.AwayFromZero);
            var total = Math.Round(taxable * (1 + taxRate / 100m), 2, MidpointRounding.AwayFromZero);
            return new BillLineDto(
                Id: null, ItemId: l.ItemId, ItemName: it.Name, HsnSac: it.HsnSac,
                Qty: l.Qty, Unit: l.Unit, Rate: l.Rate,
                DiscountPct: l.DiscountPct, TaxRate: taxRate,
                TaxableAmount: taxable, TotalAmount: total,
                Description: l.Description);
        }).ToList();
    }

    /// <summary>
    /// Manufacturer app X-Branch-Id header nahi bhejti (usme branch ka koi
    /// switcher hi nahi — jagah godown se chalti hai). Bill ko branch chahiye,
    /// isliye head office uthate hain — wahi MfgCounterService bhi karti hai.
    /// </summary>
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
