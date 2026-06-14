using System.Data.Common;

namespace Namokara.Api.Common.Db;

/// <summary>
/// Sets the RLS tenant context (app.current_firm_id / app.current_branch_id) on a RAW
/// ADO connection that was opened OUTSIDE EF Core's TenantConnectionInterceptor — e.g.
/// any code that does `_db.Database.GetDbConnection().OpenAsync()` and then runs a raw
/// SqlCommand (the voucher/bill/order number counters, wallet ledger, etc.).
///
/// WHY THIS EXISTS: a raw OpenAsync() does NOT fire EF's connection interceptor, so
/// `app.current_firm_id` is never set on that connection. Then core.current_firm_id()
/// returns NULL and every INSERT's RLS WITH CHECK fails with SQLSTATE 42501
/// ("new row violates row-level security policy"). Calling ApplyAsync() right before the
/// raw write guarantees the context is present on the exact connection doing the write.
///
/// firmId/branchId are GUIDs (or empty), so direct interpolation is injection-safe and
/// matches the existing counter SQL style in these services.
/// </summary>
public static class TenantContextSetter
{
    public static async Task ApplyAsync(DbConnection conn, Guid firmId, Guid branchId)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            $"SELECT set_config('app.current_firm_id','{firmId}',false)," +
            $"set_config('app.current_branch_id','{(branchId == Guid.Empty ? "" : branchId.ToString())}',false);";
        await cmd.ExecuteNonQueryAsync();
    }
}
