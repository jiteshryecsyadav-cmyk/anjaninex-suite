using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Entities;

namespace Namokara.Api.Modules.Platform.Services;

public class InsufficientWalletException : Exception
{
    public InsufficientWalletException(string msg) : base(msg) { }
}

public record ChargeResult(bool Ok, string? Reason, decimal Charged, string Mode, decimal NewBalance, string? Name);

// Projection for the addon-service rate/mode lookup (used via Database.SqlQuery).
internal record AddonServiceLookup(string? Name, decimal Rate, bool Enabled, string? Mode);

public interface IWalletService
{
    Task<decimal> GetBalance(Guid firmId);
    Task<bool> CanAfford(Guid firmId, decimal amount);
    Task<bool> Debit(Guid firmId, decimal amount, string usageType, string referenceId, Guid? userId = null);
    Task Recharge(Guid firmId, decimal amount, string source, string reference, Guid byUserId, string? gstin = null);
    Task<List<WalletLedgerEntry>> GetHistory(Guid firmId, int page = 1, int size = 50);

    // Service usage: rate × units wallet se kaat (mode 'self' ho to skip), usage log kar.
    Task<ChargeResult> ChargeServiceAsync(Guid firmId, string code, decimal units, string? reference, Guid? userId = null);
    // Usage report: per-service summary + recent log (date filter optional).
    Task<object> GetUsageReportAsync(Guid firmId, DateTimeOffset? from, DateTimeOffset? to);
}

public class WalletService : IWalletService
{
    private readonly AppDbContext _db;
    private readonly ILogger<WalletService> _log;

    public WalletService(AppDbContext db, ILogger<WalletService> log)
    {
        _db = db;
        _log = log;
    }

    public async Task<decimal> GetBalance(Guid firmId)
    {
        return await _db.Firms
            .Where(f => f.Id == firmId)
            .Select(f => f.WalletBalance)
            .SingleAsync();
    }

    public async Task<bool> CanAfford(Guid firmId, decimal amount)
    {
        var firm = await _db.Firms
            .Where(f => f.Id == firmId)
            .Select(f => new { f.WalletBalance, f.CreditLimit, f.Status })
            .SingleAsync();

        if (firm.Status is not ("active" or "trial")) return false;
        return (firm.WalletBalance + firm.CreditLimit) >= amount;
    }

    public async Task<bool> Debit(Guid firmId, decimal amount, string usageType, string referenceId, Guid? userId = null)
    {
        if (amount <= 0) throw new ArgumentException("Amount must be positive");

        using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            // P0-5 fix: SELECT FOR UPDATE — pessimistic row lock prevents concurrent debits
            // from both reading the same balance and both committing.
            var firm = await _db.Firms.FromSqlInterpolated($@"
                SELECT * FROM platform.firms WHERE id = {firmId} FOR UPDATE")
                .SingleAsync();

            if (firm.Status is not ("active" or "trial"))
            {
                _log.LogWarning("Wallet debit refused for firm {FirmId}: status={Status}", firmId, firm.Status);
                return false;
            }
            if ((firm.WalletBalance + firm.CreditLimit) < amount)
            {
                _log.LogWarning("Wallet debit refused for firm {FirmId}: insufficient balance (balance={Balance}, cost={Amount})",
                    firmId, firm.WalletBalance, amount);
                return false;
            }

            firm.WalletBalance -= amount;
            firm.UpdatedAt = DateTimeOffset.UtcNow;

            _db.WalletLedger.Add(new WalletLedgerEntry
            {
                FirmId = firmId,
                TxnType = $"debit_{usageType}",
                Amount = -amount,
                BalanceAfter = firm.WalletBalance,
                ReferenceId = referenceId,
                Description = $"Usage: {usageType}",
                CreatedBy = userId,
                CreatedAt = DateTimeOffset.UtcNow
            });

            var cost = CalculateAnjaninexCost(usageType, amount);
            _db.PlatformRevenue.Add(new PlatformRevenueEntry
            {
                SourceFirmId = firmId,
                SourceType = $"{usageType}_markup",
                GrossInr = amount,
                CostInr = cost,
                MarginInr = amount - cost,
                Description = $"Firm {firmId} used {usageType}",
                CreatedAt = DateTimeOffset.UtcNow
            });

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            return true;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public async Task Recharge(Guid firmId, decimal amount, string source, string reference, Guid byUserId, string? gstin = null)
    {
        if (amount <= 0) throw new ArgumentException("Amount must be positive");

        using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var firm = await _db.Firms.SingleAsync(f => f.Id == firmId);
            firm.WalletBalance += amount;
            firm.UpdatedAt = DateTimeOffset.UtcNow;

            // GSTIN has no dedicated WalletLedgerEntry column — capture it in the
            // description so it isn't silently dropped (used for GST invoice on recharge).
            var gstNote = string.IsNullOrWhiteSpace(gstin) ? "" : $" (GSTIN: {gstin.Trim()})";

            _db.WalletLedger.Add(new WalletLedgerEntry
            {
                FirmId = firmId,
                TxnType = "recharge",
                Amount = amount,
                BalanceAfter = firm.WalletBalance,
                ReferenceId = reference,
                Description = $"Recharge via {source}{gstNote}",
                CreatedBy = byUserId,
                CreatedAt = DateTimeOffset.UtcNow
            });

            // TODO(cashback/GST): No cashback scheme/columns exist in schema yet.
            // When a recharge cashback offer is defined, credit it here as a second
            // positive ledger entry (TxnType = "cashback") AFTER the recharge entry,
            // updating firm.WalletBalance and BalanceAfter accordingly, and persist the
            // GST breakup (currently only captured in the description above) once a
            // dedicated GST/tax column or table is added. Left as TODO to avoid
            // inventing schema. See gstin param above.

            _db.PlatformRevenue.Add(new PlatformRevenueEntry
            {
                SourceFirmId = firmId,
                SourceType = source == "subscription" ? "subscription" : "wallet_recharge",
                GrossInr = amount,
                CostInr = 0,
                MarginInr = amount,
                Description = $"Wallet recharge: ₹{amount}",
                CreatedAt = DateTimeOffset.UtcNow
            });

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }

        // ─── Reseller/agent commission hook (recharge COMMIT ke BAAD) ──────────
        // Recharge transaction commit ho chuki — wallet/ledger safe hai. Commission ab
        // ALAG se save hoti hai taaki commission ka koi bhi DB error pehle se committed
        // recharge ko na giraye (poisoned-transaction se bacho). Error aaye to sirf log.
        // FIRST EVER recharge → signup% + recharge%; har agle → recharge% only.
        try
        {
            var firm = await _db.Firms.SingleOrDefaultAsync(f => f.Id == firmId);
            if (firm?.AgentId != null)
            {
                var agent = await _db.Agents.SingleOrDefaultAsync(a => a.Id == firm.AgentId.Value);
                if (agent != null && agent.Status == "active")
                {
                    var now = DateTimeOffset.UtcNow;
                    bool firstEver = !await _db.AgentCommissions.AnyAsync(c => c.FirmId == firmId);
                    decimal totalCommission = 0;

                    // recharge commission — har baar
                    var rechargeAmt = Math.Round(amount * agent.RechargeCommissionPct / 100m, 2);
                    _db.AgentCommissions.Add(new AgentCommission
                    {
                        AgentId = agent.Id,
                        FirmId = firmId,
                        Kind = "recharge",
                        RechargeAmount = amount,
                        CommissionPct = agent.RechargeCommissionPct,
                        CommissionAmt = rechargeAmt,
                        ReferenceId = reference,
                        Status = "pending",
                        CreatedAt = now
                    });
                    totalCommission += rechargeAmt;

                    // signup commission — sirf pehli baar (aur agar pct > 0)
                    if (firstEver && agent.SignupCommissionPct > 0)
                    {
                        var signupAmt = Math.Round(amount * agent.SignupCommissionPct / 100m, 2);
                        _db.AgentCommissions.Add(new AgentCommission
                        {
                            AgentId = agent.Id,
                            FirmId = firmId,
                            Kind = "signup",
                            RechargeAmount = amount,
                            CommissionPct = agent.SignupCommissionPct,
                            CommissionAmt = signupAmt,
                            ReferenceId = reference,
                            Status = "pending",
                            CreatedAt = now
                        });
                        totalCommission += signupAmt;
                    }

                    agent.WalletBalance += totalCommission;
                    agent.UpdatedAt = now;
                    await _db.SaveChangesAsync();
                }
            }
        }
        catch (Exception ex)
        {
            // Commission fail ho to recharge (jo commit ho chuki) ko koi farak nahi — sirf log.
            _log.LogError(ex, "Agent commission failed for firm {FirmId} recharge ₹{Amount}", firmId, amount);
        }
    }

    public async Task<List<WalletLedgerEntry>> GetHistory(Guid firmId, int page = 1, int size = 50)
    {
        return await _db.WalletLedger
            .Where(w => w.FirmId == firmId)
            .OrderByDescending(w => w.CreatedAt)
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SERVICE USAGE — rate × units wallet se kaat + usage log
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<ChargeResult> ChargeServiceAsync(Guid firmId, string code, decimal units, string? reference, Guid? userId = null)
    {
        if (units <= 0) units = 1;

        // 1. Service rate + firm selection (enabled / mode) lookup.
        //    Use EF's SqlQuery so the connection lifecycle is fully managed by EF
        //    (no manually-opened shared connection left behind). Debit() below then
        //    owns the only transaction on a clean connection.
        decimal rate = 0; string name = code; bool enabled = false; string mode = "anjaninex"; bool found = false;
        var row = await _db.Database.SqlQuery<AddonServiceLookup>($@"
                SELECT s.name AS ""Name"", s.rate AS ""Rate"",
                       COALESCE(fas.enabled, false) AS ""Enabled"",
                       COALESCE(fas.mode, 'anjaninex') AS ""Mode""
                FROM platform.addon_services s
                LEFT JOIN platform.firm_addon_services fas
                       ON fas.service_id = s.id AND fas.firm_id = {firmId}
                WHERE s.code = {code}")
            .ToListAsync();
        if (row.Count > 0)
        {
            found = true;
            name = row[0].Name ?? code;
            rate = row[0].Rate;
            enabled = row[0].Enabled;
            mode = row[0].Mode ?? "anjaninex";
        }
        if (!found)
            return new ChargeResult(false, "unknown_service", 0, mode, await GetBalance(firmId), null);

        // 2. self mode → koi wallet charge nahi, sirf usage count log
        if (enabled && mode == "self")
        {
            await LogUsageAsync(firmId, code, name, units, rate, 0, "self", reference);
            return new ChargeResult(true, null, 0, "self", await GetBalance(firmId), name);
        }

        // 3. anjaninex (ya opt-in nahi kiya) → rate × units charge
        var amount = Math.Round(rate * units, 2);
        if (amount > 0)
        {
            var ok = await Debit(firmId, amount, code, reference ?? $"{code}_{DateTime.UtcNow.Ticks}", userId);
            if (!ok)
                return new ChargeResult(false, "insufficient", 0, "anjaninex", await GetBalance(firmId), name);
        }
        await LogUsageAsync(firmId, code, name, units, rate, amount, "anjaninex", reference);
        return new ChargeResult(true, null, amount, "anjaninex", await GetBalance(firmId), name);
    }

    private async Task LogUsageAsync(Guid firmId, string code, string name, decimal units, decimal rate, decimal amount, string mode, string? reference)
    {
        await _db.Database.ExecuteSqlInterpolatedAsync($@"
            INSERT INTO platform.service_usage (firm_id, code, name, units, rate, amount, mode, reference)
            VALUES ({firmId}, {code}, {name}, {units}, {rate}, {amount}, {mode}, {reference})");
    }

    public async Task<object> GetUsageReportAsync(Guid firmId, DateTimeOffset? from, DateTimeOffset? to)
    {
        var fromD = from ?? DateTimeOffset.UtcNow.AddDays(-30);
        var toD = to ?? DateTimeOffset.UtcNow.AddDays(1);

        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();

        var summary = new List<object>();
        decimal totalAmount = 0;
        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = @"SELECT code, max(name) AS name, count(*) AS cnt,
                                       sum(units) AS units, sum(amount) AS amount, max(rate) AS rate
                                FROM platform.service_usage
                                WHERE firm_id=@firm AND created_at >= @from AND created_at < @to
                                GROUP BY code ORDER BY sum(amount) DESC";
            cmd.Parameters.Add(new NpgsqlParameter("firm", firmId));
            cmd.Parameters.Add(new NpgsqlParameter("from", fromD));
            cmd.Parameters.Add(new NpgsqlParameter("to", toD));
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var amt = Convert.ToDecimal(r["amount"]);
                totalAmount += amt;
                summary.Add(new
                {
                    code = (string)r["code"],
                    name = r["name"] as string,
                    count = Convert.ToInt32(r["cnt"]),
                    units = Convert.ToDecimal(r["units"]),
                    amount = amt,
                    rate = Convert.ToDecimal(r["rate"])
                });
            }
        }

        var log = new List<object>();
        await using (var cmd2 = conn.CreateCommand())
        {
            cmd2.CommandText = @"SELECT code, name, units, rate, amount, mode, reference,
                                        to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD""T""HH24:MI:SS') AS created_at
                                 FROM platform.service_usage
                                 WHERE firm_id=@firm AND created_at >= @from AND created_at < @to
                                 ORDER BY created_at DESC LIMIT 100";
            cmd2.Parameters.Add(new NpgsqlParameter("firm", firmId));
            cmd2.Parameters.Add(new NpgsqlParameter("from", fromD));
            cmd2.Parameters.Add(new NpgsqlParameter("to", toD));
            await using var r2 = await cmd2.ExecuteReaderAsync();
            while (await r2.ReadAsync())
                log.Add(new
                {
                    code = (string)r2["code"],
                    name = r2["name"] as string,
                    units = Convert.ToDecimal(r2["units"]),
                    rate = Convert.ToDecimal(r2["rate"]),
                    amount = Convert.ToDecimal(r2["amount"]),
                    mode = r2["mode"] as string,
                    reference = r2["reference"] as string,
                    createdAt = r2["created_at"] as string
                });
        }

        return new { summary, log, totalAmount };
    }

    private decimal CalculateAnjaninexCost(string usageType, decimal grossInr) => usageType switch
    {
        "ai" => grossInr * 0.33m,
        "wa_utility" => grossInr * 0.55m,
        "wa_marketing" => grossInr * 0.67m,
        "sms" => grossInr * 0.45m,
        "email" => grossInr * 0.40m,
        "storage" => grossInr * 0.30m,
        _ => grossInr * 0.50m
    };
}
