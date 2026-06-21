using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Platform.Entities;
using Namokara.Api.Modules.Core.Entities;

namespace Namokara.Api.Modules.Platform.Services;

// =============================================================================
// DTOs
// =============================================================================
public record AgentListItemDto(
    Guid Id, string Code, string Name, string? Email, string? Phone,
    decimal SignupCommissionPct, decimal RechargeCommissionPct,
    string Status, decimal WalletBalance,
    int FirmsCount, decimal TotalEarned, decimal Pending,
    DateTimeOffset CreatedAt);

public record AgentCommissionDto(
    long Id, string Kind, string FirmName, decimal RechargeAmount,
    decimal CommissionPct, decimal CommissionAmt, string Status,
    string? ReferenceId, DateTimeOffset CreatedAt);

public record AgentPayoutDto(
    long Id, decimal Amount, string? Method, string? Reference,
    string? Notes, DateTimeOffset CreatedAt);

public record AgentReferredFirmDto(
    Guid FirmId, string Name, string Status, DateTimeOffset CreatedAt);

public record AgentDetailDto(
    Guid Id, string Code, string Name, string? Email, string? Phone,
    decimal SignupCommissionPct, decimal RechargeCommissionPct,
    string Status, string? Notes, decimal WalletBalance,
    int FirmsCount, decimal TotalEarned, decimal Pending, decimal Paid,
    List<AgentCommissionDto> RecentCommissions,
    List<AgentPayoutDto> Payouts,
    DateTimeOffset CreatedAt);

public record AgentDashboardDto(
    Guid Id, string Code, string Name, string? Email, string? Phone,
    decimal SignupCommissionPct, decimal RechargeCommissionPct,
    string Status, decimal WalletBalance,
    int FirmsCount, decimal TotalEarned, decimal Pending, decimal Paid,
    List<AgentCommissionDto> RecentCommissions,
    List<AgentReferredFirmDto> Firms);

public record CreateAgentDto(
    string Name, string? Code, string? Email, string? Phone,
    decimal SignupCommissionPct, decimal RechargeCommissionPct,
    string? Notes, string? LoginUsername, string? LoginPassword);

public record CreateAgentResultDto(
    Guid Id, string Code, string Name,
    string LoginUsername, string TempPassword);   // tempPassword sirf EK baar dikhega

public record UpdateAgentDto(
    string Name, string? Email, string? Phone,
    decimal SignupCommissionPct, decimal RechargeCommissionPct, string Status);

public record AgentResolveDto(Guid Id, string Name, string Status);

// =============================================================================
// Service
// =============================================================================
public interface IAgentService
{
    Task<List<AgentListItemDto>> ListAsync();
    Task<AgentDetailDto?> GetAsync(Guid id);
    Task<CreateAgentResultDto> CreateAsync(CreateAgentDto dto);
    Task<bool> UpdateAsync(Guid id, UpdateAgentDto dto);
    Task<AgentResolveDto?> ResolveCodeAsync(string code);
    Task<bool> PayoutAsync(Guid id, decimal amount, string? method, string? reference, string? notes, Guid byUserId);
    Task<AgentDashboardDto?> GetDashboardForAgentAsync(Guid agentId);
    Task<List<AgentCommissionDto>> GetCommissionsForAgentAsync(Guid agentId, int limit = 100);
}

public class AgentService : IAgentService
{
    private readonly AppDbContext _db;
    private readonly ILogger<AgentService> _log;

    public AgentService(AppDbContext db, ILogger<AgentService> log)
    {
        _db = db;
        _log = log;
    }

    // ---- ADMIN: list ----
    public async Task<List<AgentListItemDto>> ListAsync()
    {
        var agents = await _db.Agents.OrderByDescending(a => a.CreatedAt).ToListAsync();

        var firmCounts = await _db.Firms.IgnoreQueryFilters()
            .Where(f => f.AgentId != null)
            .GroupBy(f => f.AgentId!.Value)
            .Select(g => new { AgentId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.AgentId, x => x.Count);

        var earned = await _db.AgentCommissions
            .GroupBy(c => c.AgentId)
            .Select(g => new { AgentId = g.Key, Total = g.Sum(c => c.CommissionAmt) })
            .ToDictionaryAsync(x => x.AgentId, x => x.Total);

        var pending = await _db.AgentCommissions
            .Where(c => c.Status == "pending")
            .GroupBy(c => c.AgentId)
            .Select(g => new { AgentId = g.Key, Total = g.Sum(c => c.CommissionAmt) })
            .ToDictionaryAsync(x => x.AgentId, x => x.Total);

        return agents.Select(a => new AgentListItemDto(
            a.Id, a.Code, a.Name, a.Email, a.Phone,
            a.SignupCommissionPct, a.RechargeCommissionPct,
            a.Status, a.WalletBalance,
            firmCounts.GetValueOrDefault(a.Id, 0),
            earned.GetValueOrDefault(a.Id, 0),
            pending.GetValueOrDefault(a.Id, 0),
            a.CreatedAt)).ToList();
    }

    // ---- ADMIN: detail ----
    public async Task<AgentDetailDto?> GetAsync(Guid id)
    {
        var a = await _db.Agents.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return null;

        var firmsCount = await _db.Firms.IgnoreQueryFilters().CountAsync(f => f.AgentId == id);
        var totalEarned = await _db.AgentCommissions.Where(c => c.AgentId == id).SumAsync(c => (decimal?)c.CommissionAmt) ?? 0;
        var pending = await _db.AgentCommissions.Where(c => c.AgentId == id && c.Status == "pending").SumAsync(c => (decimal?)c.CommissionAmt) ?? 0;
        var paid = await _db.AgentCommissions.Where(c => c.AgentId == id && c.Status == "paid").SumAsync(c => (decimal?)c.CommissionAmt) ?? 0;

        var commissions = await LoadCommissions(id, 50);

        var payouts = await _db.AgentPayouts
            .Where(p => p.AgentId == id)
            .OrderByDescending(p => p.CreatedAt)
            .Take(50)
            .Select(p => new AgentPayoutDto(p.Id, p.Amount, p.Method, p.Reference, p.Notes, p.CreatedAt))
            .ToListAsync();

        return new AgentDetailDto(
            a.Id, a.Code, a.Name, a.Email, a.Phone,
            a.SignupCommissionPct, a.RechargeCommissionPct,
            a.Status, a.Notes, a.WalletBalance,
            firmsCount, totalEarned, pending, paid,
            commissions, payouts, a.CreatedAt);
    }

    // ---- ADMIN: create (agent + login user) ----
    public async Task<CreateAgentResultDto> CreateAsync(CreateAgentDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) throw new ArgumentException("Agent naam zaroori hai.");

        var code = (dto.Code ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
            code = await GenerateUniqueCodeAsync();
        else if (await _db.Agents.AnyAsync(a => a.Code == code))
            throw new ArgumentException($"Agent code '{code}' pehle se le liya gaya hai.");

        var username = string.IsNullOrWhiteSpace(dto.LoginUsername)
            ? code.ToLowerInvariant()
            : dto.LoginUsername.Trim();
        if (await _db.Users.IgnoreQueryFilters().AnyAsync(u => u.Username == username))
            throw new ArgumentException($"Username '{username}' pehle se le liya gaya hai.");

        var tempPassword = string.IsNullOrWhiteSpace(dto.LoginPassword)
            ? GenerateTempPassword()
            : dto.LoginPassword.Trim();
        if (tempPassword.Length < 6) throw new ArgumentException("Password kam se kam 6 character ka ho.");

        var now = DateTimeOffset.UtcNow;
        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            var agent = new Agent
            {
                Id = Guid.NewGuid(),
                Code = code,
                Name = dto.Name.Trim(),
                Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim(),
                Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim(),
                SignupCommissionPct = dto.SignupCommissionPct,
                RechargeCommissionPct = dto.RechargeCommissionPct,
                WalletBalance = 0,
                Status = "active",
                Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim(),
                CreatedAt = now,
                UpdatedAt = now
            };
            _db.Agents.Add(agent);
            await _db.SaveChangesAsync();   // agent pehle (user FK iss par)

            var user = new User
            {
                Id = Guid.NewGuid(),
                FirmId = null,
                AgentId = agent.Id,
                Username = username,
                Email = agent.Email,
                Phone = agent.Phone,
                FullName = agent.Name,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword),
                IsActive = true,
                CanViewAllBranches = false,
                CreatedAt = now,
                UpdatedAt = now
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();

            return new CreateAgentResultDto(agent.Id, agent.Code, agent.Name, username, tempPassword);
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }
    }

    // ---- ADMIN: update ----
    public async Task<bool> UpdateAsync(Guid id, UpdateAgentDto dto)
    {
        var a = await _db.Agents.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return false;
        if (string.IsNullOrWhiteSpace(dto.Name)) throw new ArgumentException("Agent naam zaroori hai.");

        a.Name = dto.Name.Trim();
        a.Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
        a.Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim();
        a.SignupCommissionPct = dto.SignupCommissionPct;
        a.RechargeCommissionPct = dto.RechargeCommissionPct;
        a.Status = string.IsNullOrWhiteSpace(dto.Status) ? a.Status : dto.Status.Trim();
        a.UpdatedAt = DateTimeOffset.UtcNow;

        // suspend agent → uska login user bhi disable; active → wapas enable
        var loginUser = await _db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.AgentId == id);
        if (loginUser != null)
        {
            loginUser.IsActive = a.Status == "active";
            loginUser.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();
        return true;
    }

    // ---- Firm-create validation: code → agent ----
    public async Task<AgentResolveDto?> ResolveCodeAsync(string code)
    {
        code = (code ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code)) return null;
        var a = await _db.Agents.FirstOrDefaultAsync(x => x.Code == code);
        return a is null ? null : new AgentResolveDto(a.Id, a.Name, a.Status);
    }

    // ---- ADMIN: payout (settle pending commissions) ----
    public async Task<bool> PayoutAsync(Guid id, decimal amount, string? method, string? reference, string? notes, Guid byUserId)
    {
        if (amount <= 0) throw new ArgumentException("Payout amount positive hona chahiye.");
        var a = await _db.Agents.FirstOrDefaultAsync(x => x.Id == id);
        if (a is null) return false;

        var now = DateTimeOffset.UtcNow;
        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            _db.AgentPayouts.Add(new AgentPayout
            {
                AgentId = id,
                Amount = amount,
                Method = string.IsNullOrWhiteSpace(method) ? null : method.Trim(),
                Reference = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim(),
                Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
                CreatedBy = byUserId,
                CreatedAt = now
            });

            // Settle: pending commissions oldest-first, sirf 'amount' tak paid mark karo.
            var pendingRows = await _db.AgentCommissions
                .Where(c => c.AgentId == id && c.Status == "pending")
                .OrderBy(c => c.CreatedAt)
                .ToListAsync();
            var pendingTotal = pendingRows.Sum(c => c.CommissionAmt);
            if (amount > pendingTotal)
                throw new ArgumentException($"Payout (₹{amount}) pending commission (₹{pendingTotal}) se zyada nahi ho sakta.");

            decimal acc = 0;
            foreach (var c in pendingRows)
            {
                if (acc >= amount) break;
                c.Status = "paid";
                acc += c.CommissionAmt;
            }

            a.WalletBalance -= amount;
            if (a.WalletBalance < 0) a.WalletBalance = 0;   // negative se bachao
            a.UpdatedAt = now;

            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            _log.LogInformation("Agent {AgentId} payout ₹{Amount} ({Count} commissions settled)", id, amount, pendingRows.Count);
            return true;
        }
        catch
        {
            try { await tx.RollbackAsync(); } catch { }
            throw;
        }
    }

    // ---- AGENT SELF: dashboard ----
    public async Task<AgentDashboardDto?> GetDashboardForAgentAsync(Guid agentId)
    {
        var a = await _db.Agents.FirstOrDefaultAsync(x => x.Id == agentId);
        if (a is null) return null;

        var firmsCount = await _db.Firms.IgnoreQueryFilters().CountAsync(f => f.AgentId == agentId);
        var totalEarned = await _db.AgentCommissions.Where(c => c.AgentId == agentId).SumAsync(c => (decimal?)c.CommissionAmt) ?? 0;
        var pending = await _db.AgentCommissions.Where(c => c.AgentId == agentId && c.Status == "pending").SumAsync(c => (decimal?)c.CommissionAmt) ?? 0;
        var paid = await _db.AgentCommissions.Where(c => c.AgentId == agentId && c.Status == "paid").SumAsync(c => (decimal?)c.CommissionAmt) ?? 0;

        var commissions = await LoadCommissions(agentId, 50);

        var firms = await _db.Firms.IgnoreQueryFilters()
            .Where(f => f.AgentId == agentId)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new AgentReferredFirmDto(f.Id, f.Name, f.Status, f.CreatedAt))
            .ToListAsync();

        return new AgentDashboardDto(
            a.Id, a.Code, a.Name, a.Email, a.Phone,
            a.SignupCommissionPct, a.RechargeCommissionPct,
            a.Status, a.WalletBalance,
            firmsCount, totalEarned, pending, paid,
            commissions, firms);
    }

    public async Task<List<AgentCommissionDto>> GetCommissionsForAgentAsync(Guid agentId, int limit = 100)
        => await LoadCommissions(agentId, limit);

    // ---- helpers ----
    private async Task<List<AgentCommissionDto>> LoadCommissions(Guid agentId, int limit)
    {
        var rows = await _db.AgentCommissions
            .Where(c => c.AgentId == agentId)
            .OrderByDescending(c => c.CreatedAt)
            .Take(limit)
            .ToListAsync();

        var firmIds = rows.Select(r => r.FirmId).Distinct().ToList();
        var firmNames = await _db.Firms.IgnoreQueryFilters()
            .Where(f => firmIds.Contains(f.Id))
            .ToDictionaryAsync(f => f.Id, f => f.Name);

        return rows.Select(c => new AgentCommissionDto(
            c.Id, c.Kind,
            firmNames.GetValueOrDefault(c.FirmId, "—"),
            c.RechargeAmount, c.CommissionPct, c.CommissionAmt,
            c.Status, c.ReferenceId, c.CreatedAt)).ToList();
    }

    private async Task<string> GenerateUniqueCodeAsync()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ambiguous (0/O,1/I) hatai
        var rng = Random.Shared;
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var suffix = new string(Enumerable.Range(0, 5).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
            var code = "AGT" + suffix;
            if (!await _db.Agents.AnyAsync(a => a.Code == code)) return code;
        }
        // extremely unlikely fallback
        return "AGT" + Guid.NewGuid().ToString("N")[..5].ToUpperInvariant();
    }

    private static string GenerateTempPassword()
    {
        const string chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var rng = Random.Shared;
        return new string(Enumerable.Range(0, 10).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
    }
}
