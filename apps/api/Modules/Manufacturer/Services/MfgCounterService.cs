using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Manufacturer.Services;

public interface IMfgCounterService
{
    Task<string> NextAsync(Guid firmId, Guid? godownId, string key, string prefix);
}

/// <summary>
/// Document number — gap-free aur ek jaisa kabhi do baar nahi.
///
/// <c>MAX(number) + 1</c> KABHI mat likhna: do aadmi ek saath slip banayenge to
/// dono ko wahi number milega. Isliye UPSERT … RETURNING — Postgres row par
/// lock leta hai aur agla number pakka alag milta hai.
///
/// ⚠️ `platform.voucher_counters` par <c>branch_id</c> ka FK <c>core.branches</c>
/// par hai — usme godown ki id nahi daali ja sakti. Isliye godown ko
/// COUNTER_KEY me daalte hain (`jobslip:&lt;godownId&gt;`) aur branch_id me firm ka
/// pehla branch. Table chhedne se ye tareeka kahin surakshit hai — wo table
/// abhi bill aur voucher dono ke liye chal rahi hai.
/// </summary>
public class MfgCounterService : IMfgCounterService
{
    private readonly AppDbContext _db;
    public MfgCounterService(AppDbContext db) => _db = db;

    public async Task<string> NextAsync(Guid firmId, Guid? godownId, string key, string prefix)
    {
        var branchId = await _db.Branches.AsNoTracking()
            .Where(b => b.FirmId == firmId)
            .OrderByDescending(b => b.IsHeadOffice)
            .Select(b => (Guid?)b.Id)
            .FirstOrDefaultAsync()
            ?? throw new InvalidOperationException(
                   "Is firm ka koi branch nahi mila — Team → Branches me ek banaiye.");

        var counterKey = godownId is Guid g ? $"mfg.{key}:{g}" : $"mfg.{key}";
        var fy = FinancialYear(DateTimeOffset.UtcNow);

        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
        // Raw ADO EF ke interceptor ko bypass karta hai — RLS ke liye tenant
        // context yahan khud lagana padta hai, warna WITH CHECK fail hoga.
        await Namokara.Api.Common.Db.TenantContextSetter.ApplyAsync(conn, firmId, branchId);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
INSERT INTO platform.voucher_counters (firm_id, branch_id, counter_key, fy_year, next_no)
VALUES (@f, @b, @k, @y, 1)
ON CONFLICT (firm_id, branch_id, counter_key, fy_year)
DO UPDATE SET next_no = platform.voucher_counters.next_no + 1, updated_at = now()
RETURNING next_no;";

        AddParam(cmd, "@f", firmId);
        AddParam(cmd, "@b", branchId);
        AddParam(cmd, "@k", counterKey);
        AddParam(cmd, "@y", fy);

        var n = Convert.ToInt64(await cmd.ExecuteScalarAsync());
        return $"{prefix}-{n:0000}";
    }

    /// <summary>2026 = FY 2026-27. April se nayi ginti shuru.</summary>
    private static int FinancialYear(DateTimeOffset at)
    {
        var ist = TimeZoneInfo.ConvertTime(at,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")).DateTime;
        return ist.Month >= 4 ? ist.Year : ist.Year - 1;
    }

    private static void AddParam(System.Data.Common.DbCommand cmd, string name, object value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        cmd.Parameters.Add(p);
    }
}
