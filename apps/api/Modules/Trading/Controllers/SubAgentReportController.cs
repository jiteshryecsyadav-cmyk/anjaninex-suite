using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Trading.Controllers;

[ApiController]
[Authorize]
[Route("api/trading/reports")]
public class SubAgentReportController : TradingControllerBase
{
    private readonly AppDbContext _db;
    public SubAgentReportController(AppDbContext db) => _db = db;

    public record SubAgentRow(string Supplier, string Buyer, string? SupplierBillNo,
        string BillNo, DateOnly BillDate, decimal Taxable, string? SubAgent,
        decimal SubAgentPct, decimal Share);

    // Bill-wise sub-agent report (date range). Sub-agent % ka koi calc effect nahi —
    // yaha bill ke taxable par % laga ke sub-agent ka hissa (share) dikhaya jata hai.
    [HttpGet("sub-agent")]
    public async Task<IActionResult> SubAgent([FromQuery] DateOnly from, [FromQuery] DateOnly to,
                                              [FromQuery] string? subAgent = null)
    {
        var firmId = CurrentFirmId;
        var rows = new List<SubAgentRow>();
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(@"
            SELECT COALESCE(sup.display_name,'') AS supplier,
                   COALESCE(buy.display_name,'') AS buyer,
                   b.supplier_bill_no, b.bill_no, b.bill_date,
                   COALESCE(b.taxable_amount,0) AS taxable,
                   buy.sub_agent, COALESCE(buy.sub_agent_pct,0) AS sub_pct
            FROM trading.bills b
            JOIN trading.party_profiles bpp ON bpp.id = b.buyer_party_id
            JOIN core.contacts buy          ON buy.id = bpp.contact_id
            LEFT JOIN trading.party_profiles spp ON spp.id = b.party_id
            LEFT JOIN core.contacts sup          ON sup.id = spp.contact_id
            WHERE b.firm_id = @f
              AND b.bill_date BETWEEN @from AND @to
              AND b.status <> 'cancelled'
              AND buy.sub_agent IS NOT NULL AND buy.sub_agent <> ''
              AND (@sa IS NULL OR buy.sub_agent ILIKE @sa)
            ORDER BY b.bill_date, b.bill_no", conn);
        cmd.Parameters.AddWithValue("f", firmId);
        cmd.Parameters.AddWithValue("from", from);
        cmd.Parameters.AddWithValue("to", to);
        cmd.Parameters.AddWithValue("sa", string.IsNullOrWhiteSpace(subAgent) ? (object)DBNull.Value : subAgent.Trim());
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var taxable = r.GetDecimal(5);
            var pct = r.GetDecimal(7);
            rows.Add(new SubAgentRow(
                r.GetString(0), r.GetString(1),
                r.IsDBNull(2) ? null : r.GetString(2),
                r.GetString(3), DateOnly.FromDateTime(r.GetDateTime(4)),
                taxable, r.IsDBNull(6) ? null : r.GetString(6),
                pct, Math.Round(taxable * pct / 100m, 2, MidpointRounding.AwayFromZero)));
        }
        return Ok(new
        {
            rows,
            totalTaxable = rows.Sum(x => x.Taxable),
            totalShare = rows.Sum(x => x.Share),
            count = rows.Count
        });
    }

    public record LedgerRow(DateOnly Date, string Kind, string Ref, string? VoucherNo,
        decimal Debit, decimal Credit, decimal Balance, string? Remark);

    // PARTY LEDGER — opening balance + sales(debit) & receipts(credit) chronological + running balance.
    [HttpGet("party-ledger")]
    public async Task<IActionResult> PartyLedger([FromQuery] Guid partyId,
                                                 [FromQuery] DateOnly from, [FromQuery] DateOnly to)
    {
        var firmId = CurrentFirmId;
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();

        // 1) Opening balance (period se pehle ka). Broker model me ek bill par DO party hoti
        //    hain — party_id = SUPPLIER, buyer_party_id = BUYER. Isliye khata dono taraf banta hai:
        //      party BUYER hai   → bill Dr (usse paisa aana hai),   receipt Cr
        //      party SUPPLIER hai → bill Cr (use paisa dena hai),   payment Dr
        //    LEGACY: purane sales bills me buyer party_id me tha aur buyer_party_id NULL —
        //    isliye "buyer_party_id IS NULL AND bill_type='sales'" bhi buyer-side maana jata hai.
        //    Sign: (+) = humein lena hai (receivable), (−) = humein dena hai (payable).
        decimal opening;
        await using (var ocmd = new NpgsqlCommand(@"
            SELECT COALESCE((SELECT SUM(CASE WHEN (b.buyer_party_id = @p
                                                   OR (b.buyer_party_id IS NULL AND b.bill_type = 'sales'))
                                             THEN b.total ELSE -b.total END)
                             FROM trading.bills b
                             WHERE b.firm_id=@f AND (b.party_id=@p OR b.buyer_party_id=@p)
                               AND b.bill_date < @from AND b.status <> 'cancelled'),0)
                 + COALESCE((SELECT SUM(CASE WHEN pm.payment_type = 'receipt'
                                             THEN -pm.amount ELSE pm.amount END)
                             FROM trading.payments pm
                             WHERE pm.firm_id=@f AND pm.party_id=@p
                               AND pm.payment_date < @from AND pm.deleted_at IS NULL),0)", conn))
        {
            ocmd.Parameters.AddWithValue("f", firmId);
            ocmd.Parameters.AddWithValue("p", partyId);
            ocmd.Parameters.AddWithValue("from", from);
            opening = Convert.ToDecimal(await ocmd.ExecuteScalarAsync() ?? 0m);
        }

        // 2) Period ki entries — bills + payments, date-wise (Dr/Cr upar wale rule se).
        //    Buyer-side row ka remark = SUPPLIER ka naam, supplier-side row ka remark = BUYER ka
        //    naam — taaki broker ko dikhe ki kis ke saath ka lena-dena hai.
        var rows = new List<LedgerRow>();
        var running = opening;
        await using (var cmd = new NpgsqlCommand(@"
            SELECT b.bill_date AS d,
                   CASE WHEN (b.buyer_party_id = @p
                              OR (b.buyer_party_id IS NULL AND b.bill_type = 'sales'))
                        THEN 'SALES' ELSE 'PURCHASE' END AS kind,
                   COALESCE(NULLIF(b.supplier_bill_no,''), b.bill_no) AS ref,
                   b.bill_no AS vno,
                   CASE WHEN (b.buyer_party_id = @p
                              OR (b.buyer_party_id IS NULL AND b.bill_type = 'sales'))
                        THEN b.total ELSE 0::numeric END AS debit,
                   CASE WHEN (b.buyer_party_id = @p
                              OR (b.buyer_party_id IS NULL AND b.bill_type = 'sales'))
                        THEN 0::numeric ELSE b.total END AS credit,
                   CASE WHEN (b.buyer_party_id = @p
                              OR (b.buyer_party_id IS NULL AND b.bill_type = 'sales'))
                        THEN COALESCE(sup.display_name,'')
                        ELSE COALESCE(buy.display_name,'') END AS remark
            FROM trading.bills b
            LEFT JOIN trading.party_profiles spp ON spp.id = b.party_id
            LEFT JOIN core.contacts sup          ON sup.id = spp.contact_id
            LEFT JOIN trading.party_profiles bpp ON bpp.id = b.buyer_party_id
            LEFT JOIN core.contacts buy          ON buy.id = bpp.contact_id
            WHERE b.firm_id=@f AND (b.party_id=@p OR b.buyer_party_id=@p)
              AND b.bill_date BETWEEN @from AND @to AND b.status <> 'cancelled'
            UNION ALL
            SELECT pm.payment_date, UPPER(pm.payment_mode), pm.payment_no, pm.reference_no,
                   CASE WHEN pm.payment_type = 'receipt' THEN 0::numeric ELSE pm.amount END,
                   CASE WHEN pm.payment_type = 'receipt' THEN pm.amount ELSE 0::numeric END,
                   COALESCE((SELECT 'BILL NOS. ' || string_agg(bb.bill_no, ', ')
                             FROM trading.payment_allocations pa
                             JOIN trading.bills bb ON bb.id = pa.bill_id
                             WHERE pa.payment_id = pm.id), COALESCE(pm.notes,''))
            FROM trading.payments pm
            WHERE pm.firm_id=@f AND pm.party_id=@p
              AND pm.payment_date BETWEEN @from AND @to AND pm.deleted_at IS NULL
            ORDER BY d", conn))
        {
            cmd.Parameters.AddWithValue("f", firmId);
            cmd.Parameters.AddWithValue("p", partyId);
            cmd.Parameters.AddWithValue("from", from);
            cmd.Parameters.AddWithValue("to", to);
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var dr = r.GetDecimal(4); var cr = r.GetDecimal(5);
                running += dr - cr;
                rows.Add(new LedgerRow(DateOnly.FromDateTime(r.GetDateTime(0)), r.GetString(1),
                    r.IsDBNull(2) ? "" : r.GetString(2), r.IsDBNull(3) ? null : r.GetString(3),
                    dr, cr, running, r.IsDBNull(6) ? null : r.GetString(6)));
            }
        }

        return Ok(new
        {
            opening,
            rows,
            totalDebit = rows.Sum(x => x.Debit),
            totalCredit = rows.Sum(x => x.Credit),
            closing = running,
            count = rows.Count
        });
    }

    public record IncentiveRow(
        string Buyer, decimal Taxable, decimal IncentivePct, decimal Incentive,
        decimal BalDiscPct, decimal CapAmount, bool Capped, decimal RawIncentive);

    // Buyer-wise YEARLY incentive report — period ka total taxable × buyer ka incentive%.
    // CAP: Sales Disc + Incentive <= Purchase Disc. Yaani incentive us bache hue
    // (purchase − sales) disc se zyada nahi ho sakta — warna agency ko ulta nuksaan.
    [HttpGet("incentive")]
    public async Task<IActionResult> Incentive([FromQuery] DateOnly from, [FromQuery] DateOnly to)
    {
        var firmId = CurrentFirmId;
        var rows = new List<IncentiveRow>();
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(@"
            WITH bill_disc AS (
                SELECT b.buyer_party_id,
                       b.taxable_amount,
                       -- supplier ka committed purchase disc% (party pe ho to wo, warna group ka)
                       COALESCE(sup.purchase_disc_pct, sg.purchase_disc_pct, 0) AS pur_pct,
                       -- bill pe buyer ko diya gaya sales disc%
                       -- base = subtotal − fold (discount se PEHLE ka gross), taxable_amount NAHI
                       CASE WHEN (b.subtotal - COALESCE(b.fold_amt,0)) > 0
                            THEN ROUND(b.discount / (b.subtotal - COALESCE(b.fold_amt,0)) * 100, 2)
                            ELSE 0 END AS sales_pct
                FROM trading.bills b
                JOIN trading.party_profiles spp ON spp.id = b.party_id
                JOIN core.contacts sup       ON sup.id = spp.contact_id
                LEFT JOIN core.party_groups sg
                       ON sg.firm_id = sup.firm_id AND sg.name = sup.group_name
                WHERE b.firm_id = @f
                  AND b.bill_date BETWEEN @from AND @to
                  AND b.status <> 'cancelled'
                  AND b.buyer_party_id IS NOT NULL
            )
            SELECT buy.display_name,
                   COALESCE(SUM(d.taxable_amount),0)                                    AS taxable,
                   COALESCE(buy.incentive_pct,0)                                        AS pct,
                   -- bacha hua disc, rupaye me (per-bill, kyunki har bill ka % alag ho sakta hai)
                   COALESCE(SUM(d.taxable_amount * GREATEST(d.pur_pct - d.sales_pct, 0) / 100),0) AS cap_amt
            FROM bill_disc d
            JOIN trading.party_profiles pp ON pp.id = d.buyer_party_id
            JOIN core.contacts buy      ON buy.id = pp.contact_id
            WHERE COALESCE(buy.incentive_pct,0) > 0
            GROUP BY buy.display_name, buy.incentive_pct
            ORDER BY taxable DESC", conn);
        cmd.Parameters.AddWithValue("f", firmId);
        cmd.Parameters.AddWithValue("from", from);
        cmd.Parameters.AddWithValue("to", to);
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var buyer   = r.GetString(0);
            var taxable = r.GetDecimal(1);
            var pct     = r.GetDecimal(2);
            var capAmt  = Math.Round(r.GetDecimal(3), 2, MidpointRounding.AwayFromZero);

            var raw    = Math.Round(taxable * pct / 100m, 2, MidpointRounding.AwayFromZero);
            var final  = Math.Min(raw, capAmt);          // ← CAP lagta hai yahin
            var capped = final < raw;
            var balPct = taxable > 0 ? Math.Round(capAmt / taxable * 100m, 2, MidpointRounding.AwayFromZero) : 0m;

            rows.Add(new IncentiveRow(buyer, taxable, pct, final, balPct, capAmt, capped, raw));
        }
        return Ok(new
        {
            rows,
            totalTaxable      = rows.Sum(x => x.Taxable),
            totalIncentive    = rows.Sum(x => x.Incentive),
            totalRawIncentive = rows.Sum(x => x.RawIncentive),
            cappedCount       = rows.Count(x => x.Capped),
            count             = rows.Count
        });
    }
}
