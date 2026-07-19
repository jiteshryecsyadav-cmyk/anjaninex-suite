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
            JOIN core.contacts buy ON buy.id = b.buyer_party_id
            LEFT JOIN core.contacts sup ON sup.id = b.party_id
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
                pct, Math.Round(taxable * pct / 100m, 2)));
        }
        return Ok(new
        {
            rows,
            totalTaxable = rows.Sum(x => x.Taxable),
            totalShare = rows.Sum(x => x.Share),
            count = rows.Count
        });
    }
}
