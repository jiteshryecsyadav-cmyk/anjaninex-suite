using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Entities;
using Namokara.Api.Modules.Core.Entities;   // Branch, Role, User, RolePermission, UserRole, UserBranchAccess

namespace Namokara.Api.Modules.Platform.Services;

// =============================================================================
// DTOs
// =============================================================================
public record AnjaninexKpiDto(
    int TotalFirms,
    int ActiveFirms,
    int TrialFirms,
    int SuspendedFirms,
    decimal MrrInr,
    decimal MtdRevenue,
    decimal MtdMargin,
    decimal TodayRevenue,
    int NewFirmsThisMonth,
    decimal TotalWalletBalance,
    int AiCallsToday,
    decimal AiRevenueToday,
    decimal AiCostToday);

public record FirmListItemDto(
    Guid Id,
    string Name,
    string? Gst,
    string? City,
    string ContactEmail,
    string PlanCode,
    string Status,
    decimal WalletBalance,
    decimal MtdSpend,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ActivatedAt);

public record FirmDetailDto(
    Guid Id,
    string Name,
    string? LegalName,
    string? Gst,
    string? Pan,
    string? City,
    string? State,
    string ContactEmail,
    string ContactPhone,
    string PlanCode,
    string PlanName,
    decimal? PlanMonthlyInr,
    string Status,
    decimal WalletBalance,
    decimal CreditLimit,
    DateTimeOffset? TrialEndsAt,
    DateTimeOffset? ActivatedAt,
    DateTimeOffset CreatedAt,
    int BranchCount,
    int UserCount,
    int BillCount,
    int VoucherCount,
    int SupplierCount,
    decimal LifetimeSpend,
    decimal LifetimeRevenue,
    string Theme);

public record WalletTxnDto(
    long Id, string TxnType, decimal Amount, decimal BalanceAfter,
    string? Description, string? ReferenceId, DateTimeOffset CreatedAt);

public record RevenuePointDto(string Day, decimal Gross, decimal Cost, decimal Margin);

public record AgentCostDto(string AgentName, int Calls, decimal CostInr, decimal RevenueInr, decimal MarginInr, decimal AvgConfidence);

public record PlanDto(
    Guid Id, string Code, string Name,
    decimal? MonthlyInr, decimal? AnnualInr,
    int MaxBranches, int MaxUsers, int MaxAiCalls, int MaxWaMessages,
    string Features, bool IsActive,
    int FirmCount);

public record CreatePlanDto(
    string Code, string Name,
    decimal? MonthlyInr, decimal? AnnualInr,
    int MaxBranches, int MaxUsers, int MaxAiCalls, int MaxWaMessages,
    string Features);

public record CreateFirmDto(
    string Name, string? LegalName, string? Gst, string? Pan, string? City, string? State,
    string ContactEmail, string ContactPhone, Guid? PlanId,
    string AdminFullName, string AdminUsername, string AdminPassword,
    string? BankName = null, string? AccountNo = null, string? Ifsc = null,
    string? AgentCode = null);

// =============================================================================
// Service
// =============================================================================
public interface IPlatformAdminService
{
    Task<AnjaninexKpiDto> AnjaninexKpi();
    Task<List<RevenuePointDto>> DailyRevenue(int days);
    Task<List<FirmListItemDto>> ListFirms(string? search = null, string? status = null);
    Task<FirmDetailDto?> GetFirm(Guid id);
    Task<List<WalletTxnDto>> FirmWalletHistory(Guid firmId, int limit);
    Task RechargeFirmWallet(Guid firmId, decimal amount, string source, string reference, Guid byUserId);
    Task SuspendFirm(Guid firmId);
    Task ActivateFirm(Guid firmId);
    Task ChangePlan(Guid firmId, Guid newPlanId);
    Task SetFirmTheme(Guid firmId, string theme);

    Task<List<AgentCostDto>> AiCostBreakdown(int days);
    Task<List<RevenuePointDto>> AiDailyRevenue(int days);

    Task<List<PlanDto>> ListPlans();
    Task<PlanDto> CreatePlan(CreatePlanDto dto);
    Task<PlanDto> UpdatePlan(Guid id, CreatePlanDto dto);
    Task TogglePlanActive(Guid id);
    Task<bool> DeletePlan(Guid id);   // false = firms is plan par hain, delete block
    Task<object> CreateFirm(CreateFirmDto dto, Guid byUserId);   // naya tenant: firm + branch + role + admin user
    Task<Guid> EnsureBooksFirm();   // Anjaninex ki apni accounting ke liye Books firm (1-click setup)

    Task<List<TopFirmDto>> TopFirmsByRevenue(int top);
    Task<List<LowBalanceFirmDto>> LowBalanceFirms();

    // ---- Firm login users (super-admin) ----
    Task<List<FirmUserDto>> ListFirmUsers(Guid firmId);
    Task<bool> ResetUserPassword(Guid firmId, Guid userId, string newPassword);   // false = user firm ka nahi
    Task<bool> UpdateFirmUser(Guid firmId, Guid userId, UpdateFirmUserDto dto);    // false = user firm ka nahi
    Task<(bool ok, string? error, bool notFound)> DeleteFirmUser(Guid firmId, Guid userId);
}

public record TopFirmDto(Guid FirmId, string Name, string PlanCode, decimal Revenue, int Days);
public record LowBalanceFirmDto(Guid FirmId, string Name, decimal Balance, decimal LastDailySpend);

// Firm login user — PasswordHash KABHI bahar nahi jata (security).
public record FirmUserDto(
    Guid Id,
    string FullName,
    string Username,
    string? Email,
    string? Phone,
    bool IsActive,
    string[] Roles,
    DateTimeOffset CreatedAt);

public record UpdateFirmUserDto(
    string FullName,
    string Username,
    string? Email,
    string? Phone,
    bool IsActive);

public class PlatformAdminService : IPlatformAdminService
{
    private readonly AppDbContext _db;
    private readonly ILogger<PlatformAdminService> _log;

    public PlatformAdminService(AppDbContext db, ILogger<PlatformAdminService> log)
    {
        _db = db;
        _log = log;
    }

    // -------------------------------------------------------------------------
    // KPIs
    // -------------------------------------------------------------------------
    public async Task<AnjaninexKpiDto> AnjaninexKpi()
    {
        var monthStart = new DateTimeOffset(DateTime.Today.Year, DateTime.Today.Month, 1, 0, 0, 0, TimeSpan.Zero);
        // .Date DateTime banata hai jo DB param me LOCAL (+5:30) offset le leta hai → Npgsql reject.
        // Explicit UTC offset zaroori hai.
        var todayStart = new DateTimeOffset(DateTime.UtcNow.Date, TimeSpan.Zero);

        var firms = await _db.Firms.IgnoreQueryFilters().ToListAsync();
        var totalFirms = firms.Count;
        var activeFirms = firms.Count(f => f.Status == "active");
        var trialFirms = firms.Count(f => f.Status == "trial");
        var suspendedFirms = firms.Count(f => f.Status == "suspended");
        var totalWallet = firms.Sum(f => f.WalletBalance);
        var newThisMonth = firms.Count(f => f.CreatedAt >= monthStart);

        // MRR from plan prices of active firms
        var plans = await _db.SubscriptionPlans.IgnoreQueryFilters().ToDictionaryAsync(p => p.Id, p => p.MonthlyInr ?? 0);
        var mrr = firms
            .Where(f => f.Status == "active" && f.PlanId.HasValue)
            .Sum(f => plans.GetValueOrDefault(f.PlanId!.Value, 0));

        // Revenue MTD
        var mtdRev = await _db.PlatformRevenue.IgnoreQueryFilters()
            .Where(r => r.CreatedAt >= monthStart)
            .SumAsync(r => (decimal?)r.GrossInr) ?? 0;

        var mtdMargin = await _db.PlatformRevenue.IgnoreQueryFilters()
            .Where(r => r.CreatedAt >= monthStart)
            .SumAsync(r => (decimal?)r.MarginInr) ?? 0;

        var todayRev = await _db.PlatformRevenue.IgnoreQueryFilters()
            .Where(r => r.CreatedAt >= todayStart)
            .SumAsync(r => (decimal?)r.GrossInr) ?? 0;

        // AI today
        var aiToday = await _db.AiExtractionLogs.IgnoreQueryFilters()
            .Where(l => l.CreatedAt >= todayStart)
            .ToListAsync();
        var aiCalls = aiToday.Count;
        var aiRevenue = aiToday.Sum(l => l.CostInr ?? 0);
        var aiCost = aiRevenue * 0.33m; // Gemini cost estimate

        return new AnjaninexKpiDto(
            totalFirms, activeFirms, trialFirms, suspendedFirms,
            mrr, mtdRev, mtdMargin, todayRev,
            newThisMonth, totalWallet,
            aiCalls, aiRevenue, aiCost);
    }

    public async Task<List<RevenuePointDto>> DailyRevenue(int days)
    {
        var from = DateTime.UtcNow.Date.AddDays(-days + 1);
        var fromUtc = new DateTimeOffset(from, TimeSpan.Zero);   // UTC offset — Npgsql ko yahi chahiye
        var rows = await _db.PlatformRevenue.IgnoreQueryFilters()
            .Where(r => r.CreatedAt >= fromUtc)
            .ToListAsync();

        return Enumerable.Range(0, days)
            .Select(i => from.AddDays(i))
            .Select(d =>
            {
                var dayRows = rows.Where(r => r.CreatedAt.Date == d).ToList();
                return new RevenuePointDto(
                    d.ToString("yyyy-MM-dd"),
                    dayRows.Sum(r => r.GrossInr),
                    dayRows.Sum(r => r.CostInr),
                    dayRows.Sum(r => r.MarginInr));
            })
            .ToList();
    }

    // -------------------------------------------------------------------------
    // Firms
    // -------------------------------------------------------------------------
    public async Task<List<FirmListItemDto>> ListFirms(string? search = null, string? status = null)
    {
        var query = _db.Firms.IgnoreQueryFilters().AsQueryable();
        if (!string.IsNullOrEmpty(status)) query = query.Where(f => f.Status == status);
        if (!string.IsNullOrEmpty(search))
            query = query.Where(f => EF.Functions.ILike(f.Name, $"%{search}%")
                                  || f.GstNumber!.Contains(search)
                                  || f.ContactEmail.Contains(search));

        var firms = await query.OrderByDescending(f => f.CreatedAt).Take(500).ToListAsync();

        var planCodes = await _db.SubscriptionPlans.IgnoreQueryFilters()
            .ToDictionaryAsync(p => p.Id, p => p.Code);

        var monthStart = new DateTimeOffset(DateTime.Today.Year, DateTime.Today.Month, 1, 0, 0, 0, TimeSpan.Zero);
        var firmIds = firms.Select(f => f.Id).ToList();
        var mtdSpend = await _db.WalletLedger.IgnoreQueryFilters()
            .Where(w => firmIds.Contains(w.FirmId) && w.CreatedAt >= monthStart && w.Amount < 0)
            .GroupBy(w => w.FirmId)
            .Select(g => new { FirmId = g.Key, Total = g.Sum(w => -w.Amount) })
            .ToDictionaryAsync(x => x.FirmId, x => x.Total);

        return firms.Select(f => new FirmListItemDto(
            f.Id, f.Name, f.GstNumber, f.City, f.ContactEmail,
            f.PlanId.HasValue ? planCodes.GetValueOrDefault(f.PlanId.Value, "—") : "—",
            f.Status, f.WalletBalance,
            mtdSpend.GetValueOrDefault(f.Id, 0),
            f.CreatedAt, f.ActivatedAt)).ToList();
    }

    public async Task<FirmDetailDto?> GetFirm(Guid id)
    {
        var firm = await _db.Firms.IgnoreQueryFilters().FirstOrDefaultAsync(f => f.Id == id);
        if (firm is null) return null;

        var plan = firm.PlanId.HasValue
            ? await _db.SubscriptionPlans.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == firm.PlanId.Value)
            : null;

        var branchCount = await _db.Branches.IgnoreQueryFilters().CountAsync(b => b.FirmId == id);
        var userCount = await _db.Users.IgnoreQueryFilters().CountAsync(u => u.FirmId == id);
        var billCount = await _db.Bills.IgnoreQueryFilters().CountAsync(b => b.FirmId == id);
        var voucherCount = await _db.Vouchers.IgnoreQueryFilters().CountAsync(v => v.FirmId == id);
        var supplierCount = await _db.SupplierProfiles.IgnoreQueryFilters().CountAsync(s => s.FirmId == id);

        var lifetimeSpend = await _db.WalletLedger.IgnoreQueryFilters()
            .Where(w => w.FirmId == id && w.Amount < 0)
            .SumAsync(w => (decimal?)-w.Amount) ?? 0;

        var lifetimeRev = await _db.PlatformRevenue.IgnoreQueryFilters()
            .Where(r => r.SourceFirmId == id)
            .SumAsync(r => (decimal?)r.GrossInr) ?? 0;

        return new FirmDetailDto(
            firm.Id, firm.Name, firm.LegalName, firm.GstNumber, firm.PanNumber,
            firm.City, firm.State, firm.ContactEmail, firm.ContactPhone,
            plan?.Code ?? "—", plan?.Name ?? "—", plan?.MonthlyInr,
            firm.Status, firm.WalletBalance, firm.CreditLimit,
            firm.TrialEndsAt, firm.ActivatedAt, firm.CreatedAt,
            branchCount, userCount, billCount, voucherCount, supplierCount,
            lifetimeSpend, lifetimeRev,
            string.IsNullOrWhiteSpace(firm.Theme) ? "classic" : firm.Theme);
    }

    public async Task<List<WalletTxnDto>> FirmWalletHistory(Guid firmId, int limit)
    {
        var entries = await _db.WalletLedger.IgnoreQueryFilters()
            .Where(w => w.FirmId == firmId)
            .OrderByDescending(w => w.CreatedAt)
            .Take(limit)
            .ToListAsync();

        return entries.Select(e => new WalletTxnDto(
            e.Id, e.TxnType, e.Amount, e.BalanceAfter,
            e.Description, e.ReferenceId, e.CreatedAt)).ToList();
    }

    public async Task RechargeFirmWallet(Guid firmId, decimal amount, string source, string reference, Guid byUserId)
    {
        var firm = await _db.Firms.IgnoreQueryFilters().SingleAsync(f => f.Id == firmId);
        firm.WalletBalance += amount;
        firm.UpdatedAt = DateTimeOffset.UtcNow;

        _db.WalletLedger.Add(new WalletLedgerEntry
        {
            FirmId = firmId,
            TxnType = "recharge",
            Amount = amount,
            BalanceAfter = firm.WalletBalance,
            ReferenceId = reference,
            Description = $"Anjaninex manual recharge via {source}",
            CreatedBy = byUserId,
            CreatedAt = DateTimeOffset.UtcNow
        });

        _db.PlatformRevenue.Add(new PlatformRevenueEntry
        {
            SourceFirmId = firmId,
            SourceType = "wallet_recharge",
            GrossInr = amount,
            CostInr = 0,
            MarginInr = amount,
            Description = $"Manual recharge by Anjaninex",
            CreatedAt = DateTimeOffset.UtcNow
        });

        await _db.SaveChangesAsync();
        _log.LogInformation("Anjaninex recharged firm {FirmId} ₹{Amount}", firmId, amount);
    }

    public async Task SuspendFirm(Guid firmId)
    {
        var firm = await _db.Firms.IgnoreQueryFilters().SingleAsync(f => f.Id == firmId);
        firm.Status = "suspended";
        firm.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task ActivateFirm(Guid firmId)
    {
        var firm = await _db.Firms.IgnoreQueryFilters().SingleAsync(f => f.Id == firmId);
        firm.Status = "active";
        if (!firm.ActivatedAt.HasValue) firm.ActivatedAt = DateTimeOffset.UtcNow;
        firm.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    public async Task ChangePlan(Guid firmId, Guid newPlanId)
    {
        var firm = await _db.Firms.IgnoreQueryFilters().SingleAsync(f => f.Id == firmId);
        firm.PlanId = newPlanId;
        firm.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    // Allowed UI theme keys (must match frontend shell.component colorThemes).
    private static readonly HashSet<string> AllowedThemes = new()
    {
        "classic", "theme-sunset", "theme-aurora", "theme-neon", "theme-violet", "theme-gold",
        "theme-path1", "theme-path2", "theme-path3", "theme-path4", "theme-anjaninex"
    };

    public async Task SetFirmTheme(Guid firmId, string theme)
    {
        theme = (theme ?? "").Trim();
        if (!AllowedThemes.Contains(theme))
            throw new ArgumentException("Invalid theme. Allowed: " + string.Join(", ", AllowedThemes));

        var firm = await _db.Firms.IgnoreQueryFilters().SingleAsync(f => f.Id == firmId);
        firm.Theme = theme;
        firm.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    // -------------------------------------------------------------------------
    // AI Cost Monitor
    // -------------------------------------------------------------------------
    public async Task<List<AgentCostDto>> AiCostBreakdown(int days)
    {
        var from = DateTimeOffset.UtcNow.AddDays(-days);
        var logs = await _db.AiExtractionLogs.IgnoreQueryFilters()
            .Where(l => l.CreatedAt >= from)
            .GroupBy(l => l.AgentName)
            .Select(g => new
            {
                AgentName = g.Key,
                Calls = g.Count(),
                Revenue = g.Sum(l => l.CostInr ?? 0),
                AvgConf = g.Average(l => l.Confidence ?? 0)
            })
            .ToListAsync();

        return logs.Select(l => new AgentCostDto(
            l.AgentName, l.Calls,
            l.Revenue * 0.33m,  // estimated Gemini cost
            l.Revenue,
            l.Revenue * 0.67m,  // estimated margin
            l.AvgConf)).ToList();
    }

    public async Task<List<RevenuePointDto>> AiDailyRevenue(int days)
    {
        var from = DateTime.UtcNow.Date.AddDays(-days + 1);
        var fromUtc = new DateTimeOffset(from, TimeSpan.Zero);   // UTC offset — Npgsql ko yahi chahiye
        var rows = await _db.AiExtractionLogs.IgnoreQueryFilters()
            .Where(l => l.CreatedAt >= fromUtc)
            .ToListAsync();

        return Enumerable.Range(0, days)
            .Select(i => from.AddDays(i))
            .Select(d =>
            {
                var dayLogs = rows.Where(l => l.CreatedAt.Date == d).ToList();
                var rev = dayLogs.Sum(l => l.CostInr ?? 0);
                return new RevenuePointDto(d.ToString("yyyy-MM-dd"), rev, rev * 0.33m, rev * 0.67m);
            }).ToList();
    }

    // -------------------------------------------------------------------------
    // Plans
    // -------------------------------------------------------------------------
    public async Task<List<PlanDto>> ListPlans()
    {
        var plans = await _db.SubscriptionPlans.IgnoreQueryFilters().OrderBy(p => p.SortOrder).ToListAsync();
        var firmCounts = await _db.Firms.IgnoreQueryFilters()
            .Where(f => f.PlanId.HasValue)
            .GroupBy(f => f.PlanId!.Value)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count);

        return plans.Select(p => new PlanDto(
            p.Id, p.Code, p.Name, p.MonthlyInr, p.AnnualInr,
            p.MaxBranches, p.MaxUsers, p.MaxAiCalls, p.MaxWaMessages,
            p.Features, p.IsActive,
            firmCounts.GetValueOrDefault(p.Id, 0))).ToList();
    }

    public async Task<PlanDto> CreatePlan(CreatePlanDto dto)
    {
        var plan = new SubscriptionPlan
        {
            Id = Guid.NewGuid(),
            Code = dto.Code,
            Name = dto.Name,
            MonthlyInr = dto.MonthlyInr,
            AnnualInr = dto.AnnualInr,
            MaxBranches = dto.MaxBranches,
            MaxUsers = dto.MaxUsers,
            MaxAiCalls = dto.MaxAiCalls,
            MaxWaMessages = dto.MaxWaMessages,
            Features = dto.Features,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.SubscriptionPlans.Add(plan);
        await _db.SaveChangesAsync();
        return new PlanDto(plan.Id, plan.Code, plan.Name, plan.MonthlyInr, plan.AnnualInr,
            plan.MaxBranches, plan.MaxUsers, plan.MaxAiCalls, plan.MaxWaMessages,
            plan.Features, plan.IsActive, 0);
    }

    public async Task<PlanDto> UpdatePlan(Guid id, CreatePlanDto dto)
    {
        var plan = await _db.SubscriptionPlans.IgnoreQueryFilters().SingleAsync(p => p.Id == id);
        plan.Name = dto.Name;
        plan.MonthlyInr = dto.MonthlyInr;
        plan.AnnualInr = dto.AnnualInr;
        plan.MaxBranches = dto.MaxBranches;
        plan.MaxUsers = dto.MaxUsers;
        plan.MaxAiCalls = dto.MaxAiCalls;
        plan.MaxWaMessages = dto.MaxWaMessages;
        plan.Features = dto.Features;
        await _db.SaveChangesAsync();
        return new PlanDto(plan.Id, plan.Code, plan.Name, plan.MonthlyInr, plan.AnnualInr,
            plan.MaxBranches, plan.MaxUsers, plan.MaxAiCalls, plan.MaxWaMessages,
            plan.Features, plan.IsActive, 0);
    }

    public async Task TogglePlanActive(Guid id)
    {
        var plan = await _db.SubscriptionPlans.IgnoreQueryFilters().SingleAsync(p => p.Id == id);
        plan.IsActive = !plan.IsActive;
        await _db.SaveChangesAsync();
    }

    // -------------------------------------------------------------------------
    // Anjaninex Books — platform ki apni accounting wali internal firm.
    // billing_settings.books_firm_id set ho to wahi; warna nayi firm + chart of accounts
    // bana ke pointer save karta hai. Login user ki zaroorat nahi — AP se hi sab hota hai.
    // -------------------------------------------------------------------------
    public async Task<Guid> EnsureBooksFirm()
    {
        var conn = (Npgsql.NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();

        await using (var sel = conn.CreateCommand())
        {
            sel.CommandText = "SELECT books_firm_id FROM platform.billing_settings WHERE id = 1";
            var v = await sel.ExecuteScalarAsync();
            if (v is Guid g && g != Guid.Empty) return g;
        }

        var now = DateTimeOffset.UtcNow;
        var firm = new Firm
        {
            Id = Guid.NewGuid(),
            Name = "Anjaninex Books",
            LegalName = "Anjaninex (Internal Books)",
            ContactEmail = "books@anjaninex.com",
            ContactPhone = "",
            Status = "active",
            ActivatedAt = now,
            EnabledModules = "{\"accounting\":true,\"reports_core\":true}",
            CreatedAt = now,
            UpdatedAt = now
        };
        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            // PEHLE firm save (FK order: account_heads/branches firm ke baad hi ja sakte hain)
            _db.Firms.Add(firm);
            await _db.SaveChangesAsync();

            var branch = new Branch
            {
                Id = Guid.NewGuid(), FirmId = firm.Id, Code = "HO", Name = "Head Office",
                IsHeadOffice = true, IsActive = true, CreatedAt = now
            };
            _db.Branches.Add(branch);

            await SeedChartOfAccounts(firm.Id, now);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }

        await using (var upd = conn.CreateCommand())
        {
            upd.CommandText = "UPDATE platform.billing_settings SET books_firm_id = @id WHERE id = 1";
            var p = upd.CreateParameter(); p.ParameterName = "id"; p.Value = firm.Id;
            upd.Parameters.Add(p);
            await upd.ExecuteNonQueryAsync();
        }

        return firm.Id;
    }

    public async Task<object> CreateFirm(CreateFirmDto dto, Guid byUserId)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) throw new ArgumentException("Firm naam zaroori hai.");
        if (string.IsNullOrWhiteSpace(dto.ContactEmail)) throw new ArgumentException("Contact email zaroori hai.");
        if (string.IsNullOrWhiteSpace(dto.AdminUsername)) throw new ArgumentException("Admin username zaroori hai.");
        if (string.IsNullOrWhiteSpace(dto.AdminPassword) || dto.AdminPassword.Length < 6)
            throw new ArgumentException("Password kam se kam 6 character ka ho.");
        if (await _db.Users.AnyAsync(u => u.Username == dto.AdminUsername.Trim()))
            throw new ArgumentException($"Username '{dto.AdminUsername}' pehle se le liya gaya hai.");

        // Agent/reseller code (optional) → resolve to active agent. Galat code = error.
        Guid? agentId = null;
        if (!string.IsNullOrWhiteSpace(dto.AgentCode))
        {
            var code = dto.AgentCode.Trim().ToUpperInvariant();
            var agent = await _db.Agents.FirstOrDefaultAsync(a => a.Code == code && a.Status == "active");
            if (agent is null) throw new ArgumentException("Invalid agent code");
            agentId = agent.Id;
        }

        var now = DateTimeOffset.UtcNow;
        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            var firm = new Firm
            {
                Id = Guid.NewGuid(),
                Name = dto.Name.Trim(),
                LegalName = dto.LegalName?.Trim(),
                GstNumber = string.IsNullOrWhiteSpace(dto.Gst) ? null : dto.Gst.Trim().ToUpperInvariant(),
                PanNumber = string.IsNullOrWhiteSpace(dto.Pan) ? null : dto.Pan.Trim().ToUpperInvariant(),
                City = dto.City, State = dto.State,
                ContactEmail = dto.ContactEmail.Trim(), ContactPhone = (dto.ContactPhone ?? "").Trim(),
                BankName = string.IsNullOrWhiteSpace(dto.BankName) ? null : dto.BankName.Trim(),
                AccountNo = string.IsNullOrWhiteSpace(dto.AccountNo) ? null : dto.AccountNo.Trim(),
                Ifsc = string.IsNullOrWhiteSpace(dto.Ifsc) ? null : dto.Ifsc.Trim().ToUpperInvariant(),
                PlanId = dto.PlanId, AgentId = agentId, Status = "trial",
                TrialStartedAt = now, TrialEndsAt = now.AddDays(15),
                WalletBalance = 0, CreatedAt = now, UpdatedAt = now
            };
            _db.Firms.Add(firm);
            await _db.SaveChangesAsync();   // firm PEHLE save — baaki rows iski FK par depend hain

            var branch = new Branch
            {
                Id = Guid.NewGuid(), FirmId = firm.Id, Code = "HO", Name = "Head Office",
                City = dto.City, State = dto.State, IsHeadOffice = true, IsActive = true, CreatedAt = now
            };
            _db.Branches.Add(branch);

            var role = new Role
            {
                Id = Guid.NewGuid(), FirmId = firm.Id, Code = "firm_owner", Name = "Firm Owner",
                IsSystem = true, CreatedAt = now
            };
            _db.Roles.Add(role);
            await _db.SaveChangesAsync();   // FK order: branch + role pehle persist

            // Owner ko saari permissions do (full access)
            var permIds = await _db.Permissions.Select(p => p.Id).ToListAsync();
            foreach (var pid in permIds)
                _db.RolePermissions.Add(new RolePermission { RoleId = role.Id, PermissionId = pid, GrantedBy = byUserId, GrantedAt = now });

            var user = new User
            {
                Id = Guid.NewGuid(), FirmId = firm.Id,
                FullName = string.IsNullOrWhiteSpace(dto.AdminFullName) ? dto.Name.Trim() : dto.AdminFullName.Trim(),
                Username = dto.AdminUsername.Trim(), Email = dto.ContactEmail.Trim(), Phone = dto.ContactPhone?.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.AdminPassword),
                DefaultBranchId = branch.Id, CanViewAllBranches = true, IsActive = true,
                CreatedAt = now, UpdatedAt = now
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();   // FK order: user pehle persist (role_permissions+user)
            _db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = role.Id, AssignedAt = now });
            _db.UserBranchAccess.Add(new UserBranchAccess { UserId = user.Id, BranchId = branch.Id, IsDefault = true });

            // Standard Indian chart of accounts — nayi firm accounting-ready mile
            await SeedChartOfAccounts(firm.Id, now);

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            return new { firmId = firm.Id, username = user.Username, status = firm.Status };
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }
    }

    // -------------------------------------------------------------------------
    // Default chart of accounts (Tally-style Indian structure) — CreateFirm se call hota hai.
    // 5 heads (Assets/Liabilities/Capital/Income/Expenses) + groups + sub-groups + basic ledgers.
    // -------------------------------------------------------------------------
    private async Task SeedChartOfAccounts(Guid firmId, DateTimeOffset now)
    {
        Namokara.Api.Modules.Accounting.Entities.AccountHead Head(string code, string name, string nature, string sign, int sort) =>
            new() { Id = Guid.NewGuid(), FirmId = firmId, Code = code, Name = name, Nature = nature, Sign = sign, SortOrder = sort, IsSystem = true, CreatedAt = now };

        // 4 fundamental heads (Tally) — Capital ab Liabilities ke neeche group hai.
        var assets = Head("A", "Assets", "assets", "Dr", 1);
        var liab   = Head("L", "Liabilities", "liabilities", "Cr", 2);
        var inc    = Head("I", "Income", "income", "Cr", 3);
        var exp    = Head("E", "Expenses", "expenses", "Dr", 4);
        _db.AccountHeads.AddRange(assets, liab, inc, exp);
        await _db.SaveChangesAsync();   // FK order: heads pehle

        Namokara.Api.Modules.Accounting.Entities.AccountGroup Grp(Guid headId, string name) =>
            new() { Id = Guid.NewGuid(), FirmId = firmId, HeadId = headId, Name = name, IsSystem = true, CreatedAt = now };

        var gCurAssets = Grp(assets.Id, "Current Assets");
        var gFixAssets = Grp(assets.Id, "Fixed Assets");
        var gInvest    = Grp(assets.Id, "Investments");
        var gCurLiab   = Grp(liab.Id, "Current Liabilities");
        var gLoans     = Grp(liab.Id, "Loans & Liabilities");
        var gCapital   = Grp(liab.Id, "Capital Account");      // Capital -> Liabilities
        var gReserves  = Grp(liab.Id, "Reserves & Surplus");   // Reserves -> Liabilities
        var gSales     = Grp(inc.Id, "Sales / Income");
        var gOtherInc  = Grp(inc.Id, "Other Income");
        var gDirExp    = Grp(exp.Id, "Direct Expenses");
        var gIndExp    = Grp(exp.Id, "Indirect Expenses");
        _db.AccountGroups.AddRange(gCurAssets, gFixAssets, gInvest, gCurLiab, gLoans, gCapital, gReserves, gSales, gOtherInc, gDirExp, gIndExp);
        await _db.SaveChangesAsync();   // FK order: groups pehle

        Namokara.Api.Modules.Accounting.Entities.SubGroup Sub(Guid groupId, string name) =>
            new() { Id = Guid.NewGuid(), FirmId = firmId, GroupId = groupId, Name = name, IsSystem = true, CreatedAt = now };

        var sBank     = Sub(gCurAssets.Id, "Bank Accounts");
        var sCash     = Sub(gCurAssets.Id, "Cash-in-Hand");
        var sDebtors  = Sub(gCurAssets.Id, "Sundry Debtors");
        var sStock    = Sub(gCurAssets.Id, "Stock-in-Hand");
        var sCreditors= Sub(gCurLiab.Id, "Sundry Creditors");
        var sDuties   = Sub(gCurLiab.Id, "Duties & Taxes");
        var sOwnerCap = Sub(gCapital.Id, "Owner's Capital");
        var sPurchase = Sub(gDirExp.Id, "Purchase");
        var sFreight  = Sub(gDirExp.Id, "Freight & Carriage");
        var sOffice   = Sub(gIndExp.Id, "Office Expenses");
        var sTravel   = Sub(gIndExp.Id, "Travel Expenses");
        var sSalary   = Sub(gIndExp.Id, "Salary & Wages");
        var sBankChg  = Sub(gIndExp.Id, "Bank Charges");
        var sSales    = Sub(gSales.Id, "Sales");
        var sCommRecv = Sub(gSales.Id, "Commission Received");
        _db.SubGroups.AddRange(sBank, sCash, sDebtors, sStock, sCreditors, sDuties, sOwnerCap,
            sPurchase, sFreight, sOffice, sTravel, sSalary, sBankChg, sSales, sCommRecv);
        await _db.SaveChangesAsync();   // FK order: sub-groups pehle (ledgers inke FK par)

        Namokara.Api.Modules.Accounting.Entities.Ledger Led(Guid subGroupId, string name, string type) =>
            new() { Id = Guid.NewGuid(), FirmId = firmId, SubGroupId = subGroupId, Name = name, OpeningBalance = 0, OpeningType = type, CreatedAt = now };

        _db.Ledgers.AddRange(
            Led(sCash.Id, "Cash", "Dr"),
            Led(sSales.Id, "Sales Account", "Cr"),
            Led(sCommRecv.Id, "Commission Received", "Cr"),
            Led(sPurchase.Id, "Purchase Account", "Dr"),
            Led(sOwnerCap.Id, "Owner's Capital", "Cr"),
            Led(sOffice.Id, "Office Rent", "Dr"),
            Led(sBankChg.Id, "Bank Charges", "Dr"));
    }

    public async Task<bool> DeletePlan(Guid id)
    {
        // Koi firm is plan par ho to delete mat karo (warna unka plan toot jayega).
        var inUse = await _db.Firms.IgnoreQueryFilters().AnyAsync(f => f.PlanId == id);
        if (inUse) return false;
        var plan = await _db.SubscriptionPlans.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == id);
        if (plan != null)
        {
            _db.SubscriptionPlans.Remove(plan);
            await _db.SaveChangesAsync();
        }
        return true;
    }

    // -------------------------------------------------------------------------
    // Top firms / Alerts
    // -------------------------------------------------------------------------
    public async Task<List<TopFirmDto>> TopFirmsByRevenue(int top)
    {
        var monthStart = new DateTimeOffset(DateTime.Today.Year, DateTime.Today.Month, 1, 0, 0, 0, TimeSpan.Zero);

        var revenues = await _db.PlatformRevenue.IgnoreQueryFilters()
            .Where(r => r.SourceFirmId.HasValue && r.CreatedAt >= monthStart)
            .GroupBy(r => r.SourceFirmId!.Value)
            .Select(g => new { FirmId = g.Key, Total = g.Sum(r => r.GrossInr) })
            .OrderByDescending(x => x.Total)
            .Take(top)
            .ToListAsync();

        var firmIds = revenues.Select(r => r.FirmId).ToList();
        var firms = await _db.Firms.IgnoreQueryFilters()
            .Where(f => firmIds.Contains(f.Id))
            .ToDictionaryAsync(f => f.Id);

        var planCodes = await _db.SubscriptionPlans.IgnoreQueryFilters()
            .ToDictionaryAsync(p => p.Id, p => p.Code);

        return revenues.Select(r =>
        {
            var f = firms.GetValueOrDefault(r.FirmId);
            return new TopFirmDto(
                r.FirmId,
                f?.Name ?? "—",
                f?.PlanId.HasValue == true ? planCodes.GetValueOrDefault(f.PlanId!.Value, "—") : "—",
                r.Total,
                (DateTimeOffset.UtcNow - monthStart).Days);
        }).ToList();
    }

    public async Task<List<LowBalanceFirmDto>> LowBalanceFirms()
    {
        var firms = await _db.Firms.IgnoreQueryFilters()
            .Where(f => f.Status == "active" && f.WalletBalance < 500)
            .OrderBy(f => f.WalletBalance)
            .ToListAsync();

        // Get last 7-day average spend per firm
        var weekAgo = DateTimeOffset.UtcNow.AddDays(-7);
        var firmIds = firms.Select(f => f.Id).ToList();
        var weekSpend = await _db.WalletLedger.IgnoreQueryFilters()
            .Where(w => firmIds.Contains(w.FirmId) && w.CreatedAt >= weekAgo && w.Amount < 0)
            .GroupBy(w => w.FirmId)
            .Select(g => new { Id = g.Key, Avg = g.Sum(w => -w.Amount) / 7m })
            .ToDictionaryAsync(x => x.Id, x => x.Avg);

        return firms.Select(f => new LowBalanceFirmDto(
            f.Id, f.Name, f.WalletBalance,
            weekSpend.GetValueOrDefault(f.Id, 0))).ToList();
    }

    // -------------------------------------------------------------------------
    // Firm login users (super-admin) — har firm ke login users dekho/manage karo.
    // RLS bypass ke liye IgnoreQueryFilters() (baaki firm endpoints jaisa).
    // PasswordHash KABHI bahar nahi bhejte — sirf RESET (naya set) ho sakta hai.
    // -------------------------------------------------------------------------
    public async Task<List<FirmUserDto>> ListFirmUsers(Guid firmId)
    {
        var users = await _db.Users.IgnoreQueryFilters()
            .Where(u => u.FirmId == firmId)
            .OrderByDescending(u => u.CreatedAt)
            .ToListAsync();

        var userIds = users.Select(u => u.Id).ToList();

        // user -> role names (firm-scoped roles)
        var roleLinks = await _db.UserRoles.IgnoreQueryFilters()
            .Where(ur => userIds.Contains(ur.UserId))
            .ToListAsync();
        var roleIds = roleLinks.Select(r => r.RoleId).Distinct().ToList();
        var roleNames = await _db.Roles.IgnoreQueryFilters()
            .Where(r => roleIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, r => r.Name);

        var rolesByUser = roleLinks
            .GroupBy(r => r.UserId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(x => roleNames.GetValueOrDefault(x.RoleId))
                      .Where(n => !string.IsNullOrEmpty(n))
                      .Select(n => n!)
                      .ToArray());

        return users.Select(u => new FirmUserDto(
            u.Id, u.FullName, u.Username, u.Email, u.Phone, u.IsActive,
            rolesByUser.GetValueOrDefault(u.Id, Array.Empty<string>()),
            u.CreatedAt)).ToList();
    }

    public async Task<bool> ResetUserPassword(Guid firmId, Guid userId, string newPassword)
    {
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 6)
            throw new ArgumentException("Password kam se kam 6 character ka ho.");

        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || user.FirmId != firmId) return false;   // firm-ownership guard

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        _log.LogInformation("Anjaninex reset password for user {UserId} of firm {FirmId}", userId, firmId);
        return true;
    }

    public async Task<bool> UpdateFirmUser(Guid firmId, Guid userId, UpdateFirmUserDto dto)
    {
        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || user.FirmId != firmId) return false;   // firm-ownership guard

        if (string.IsNullOrWhiteSpace(dto.FullName)) throw new ArgumentException("Naam zaroori hai.");
        if (string.IsNullOrWhiteSpace(dto.Username)) throw new ArgumentException("User ID (username) zaroori hai.");

        // password ko HAATH nahi lagate
        user.FullName = dto.FullName.Trim();
        user.Username = dto.Username.Trim();
        user.Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
        user.Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim();
        user.IsActive = dto.IsActive;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<(bool ok, string? error, bool notFound)> DeleteFirmUser(Guid firmId, Guid userId)
    {
        var user = await _db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || user.FirmId != firmId)
            return (false, null, true);   // firm-ownership guard → 404

        // Firm ka aakhri ACTIVE user hard-delete mat karo.
        var activeCount = await _db.Users.IgnoreQueryFilters()
            .CountAsync(u => u.FirmId == firmId && u.IsActive);
        if (user.IsActive && activeCount <= 1)
            return (false, "Firm ka aakhri active user delete nahi kar sakte — pehle dusra admin banao", false);

        // FK rows pehle hatao (warna FK error).
        var roleLinks = await _db.UserRoles.IgnoreQueryFilters().Where(ur => ur.UserId == userId).ToListAsync();
        if (roleLinks.Count > 0) _db.UserRoles.RemoveRange(roleLinks);

        var branchLinks = await _db.UserBranchAccess.IgnoreQueryFilters().Where(b => b.UserId == userId).ToListAsync();
        if (branchLinks.Count > 0) _db.UserBranchAccess.RemoveRange(branchLinks);

        var permOverrides = await _db.UserPermissionOverrides.IgnoreQueryFilters().Where(p => p.UserId == userId).ToListAsync();
        if (permOverrides.Count > 0) _db.UserPermissionOverrides.RemoveRange(permOverrides);

        var sessions = await _db.Sessions.IgnoreQueryFilters().Where(s => s.UserId == userId).ToListAsync();
        if (sessions.Count > 0) _db.Sessions.RemoveRange(sessions);

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        _log.LogInformation("Anjaninex deleted user {UserId} of firm {FirmId}", userId, firmId);
        return (true, null, false);
    }
}
