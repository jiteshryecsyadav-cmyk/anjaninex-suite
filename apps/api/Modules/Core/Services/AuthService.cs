using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Core.Entities;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Core.Services;

public record LoginRequest(string Identifier, string Password, Guid? FirmId = null);
public record FirmChoiceDto(Guid FirmId, string FirmName);
public record LoginResponse(
    string AccessToken,
    string RefreshToken,
    UserInfoDto? User,
    // MULTI-FIRM: same identifier kai firms me ho to token ki jagah ye list aati hai —
    // frontend firm chunwa ke FirmId ke saath dobara login karta hai.
    List<FirmChoiceDto>? Firms = null);

public record UserInfoDto(
    Guid Id,
    Guid? FirmId,
    string Username,
    string FullName,
    string? Email,
    string? Phone,
    Guid? DefaultBranchId,
    bool CanViewAllBranches,
    List<string> Roles,
    List<string> Permissions,
    Guid? AgentId = null);

public class AuthFailedException : Exception
{
    public AuthFailedException(string msg) : base(msg) { }
}

public interface IAuthService
{
    Task<LoginResponse> Login(LoginRequest req, string? ip, string? userAgent);
    Task<LoginResponse> Refresh(string refreshToken);
    Task Logout(Guid sessionId);
    Task<UserInfoDto> Me(Guid userId);
    // MULTI-FIRM: ek owner ki kai firms — list + bina password switch
    Task<List<FirmChoiceDto>> MyFirms(Guid userId);
    Task<LoginResponse> SwitchFirm(Guid userId, Guid firmId, string? ip, string? userAgent);
}

public class AuthService : IAuthService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly IPermissionService _perms;
    private readonly ILogger<AuthService> _log;

    public AuthService(AppDbContext db, IConfiguration config, IPermissionService perms, ILogger<AuthService> log)
    {
        _db = db;
        _config = config;
        _perms = perms;
        _log = log;
    }

    public async Task<LoginResponse> Login(LoginRequest req, string? ip, string? userAgent)
    {
        // MULTI-FIRM: same username/email/phone kai firms me ho sakta hai — SAB candidates lao
        var candidates = await _db.Users
            .Where(u => u.Username == req.Identifier
                     || u.Email == req.Identifier
                     || u.Phone == req.Identifier)
            .ToListAsync();

        if (candidates.Count == 0) throw new AuthFailedException("Invalid credentials");

        // Password jin par lagta hai wahi asli matches
        var matched = candidates.Where(u => BCrypt.Net.BCrypt.Verify(req.Password, u.PasswordHash)).ToList();
        if (matched.Count == 0)
        {
            _log.LogWarning("Failed login attempt for {Username} from {IP}", req.Identifier, ip);
            throw new AuthFailedException("Invalid credentials");
        }

        User user;
        if (matched.Count == 1)
        {
            user = matched[0];
        }
        else if (req.FirmId is Guid chosen && matched.Any(m => m.FirmId == chosen))
        {
            user = matched.First(m => m.FirmId == chosen);
        }
        else
        {
            // Kai firms — frontend ko chunne ke liye list do (token abhi nahi)
            var firmIds = matched.Where(m => m.FirmId != null).Select(m => m.FirmId!.Value).Distinct().ToList();
            var names = await _db.Firms.IgnoreQueryFilters()
                .Where(f => firmIds.Contains(f.Id) && f.Status != "deleted")
                .ToDictionaryAsync(f => f.Id, f => f.Name);
            var choices = matched
                .Where(m => m.FirmId != null && names.ContainsKey(m.FirmId.Value) && m.IsActive)
                .Select(m => new FirmChoiceDto(m.FirmId!.Value, names[m.FirmId!.Value]))
                .GroupBy(c => c.FirmId).Select(g => g.First())
                .OrderBy(c => c.FirmName)
                .ToList();

            if (choices.Count > 1)
                return new LoginResponse("", "", null, choices);
            if (choices.Count == 1)
                user = matched.First(m => m.FirmId == choices[0].FirmId);
            else
                user = matched[0];   // sab firm-less (super admin types) — pehla hi lo
        }

        if (user.IsLocked && user.LockedUntil > DateTimeOffset.UtcNow)
            throw new AuthFailedException("Account temporarily locked. Try again later.");

        if (!user.IsActive) throw new AuthFailedException("Account is inactive");

        return await IssueFor(user, ip, userAgent);
    }

    // Session + tokens banao — Login aur SwitchFirm dono yahi use karte hain
    private async Task<LoginResponse> IssueFor(User user, string? ip, string? userAgent)
    {
        user.LastLoginAt = DateTimeOffset.UtcNow;

        var refreshToken = GenerateRefreshToken();
        var session = new Session
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RefreshTokenHash = HashToken(refreshToken),
            IpAddress = ip,
            UserAgent = userAgent,
            LastSeenAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(_config.GetValue<int>("Jwt:RefreshTokenDays", 7)),
            CreatedAt = DateTimeOffset.UtcNow
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        var perms = await _perms.GetUserPermissions(user.Id);
        var roles = await GetUserRoles(user.Id);

        var accessToken = GenerateAccessToken(user, session.Id, roles, perms);

        return new LoginResponse(
            accessToken,
            refreshToken,
            new UserInfoDto(
                user.Id,
                user.FirmId,
                user.Username,
                user.FullName,
                user.Email,
                user.Phone,
                user.DefaultBranchId,
                user.CanViewAllBranches,
                roles,
                perms.ToList(),
                user.AgentId));
    }

    // Ek hi bande ke (same phone/email/username) alag-alag firms ke ACTIVE logins.
    // Phone DIGITS se milta hai (last 10) — "+91 93270 20834" aur "9327020834" ek hi maane jayenge.
    private async Task<List<User>> LinkedUsersAsync(User me)
    {
        var digits = new string((me.Phone ?? "").Where(char.IsDigit).ToArray());
        var phone10 = digits.Length > 10 ? digits[^10..] : digits;
        var email = (me.Email ?? "").Trim().ToLowerInvariant();
        return await _db.Users.FromSqlInterpolated($@"
            SELECT * FROM core.users u
            WHERE u.is_active AND u.firm_id IS NOT NULL AND (
                  ({phone10} <> '' AND right(regexp_replace(coalesce(u.phone,''), '\D', '', 'g'), 10) = {phone10})
               OR ({email} <> '' AND lower(coalesce(u.email,'')) = {email})
               OR u.username = {me.Username}
            )").ToListAsync();
    }

    public async Task<List<FirmChoiceDto>> MyFirms(Guid userId)
    {
        var me = await _db.Users.SingleAsync(u => u.Id == userId);
        var linked = (await LinkedUsersAsync(me)).Select(u => u.FirmId!.Value).Distinct().ToList();
        return await _db.Firms.IgnoreQueryFilters()
            .Where(f => linked.Contains(f.Id) && f.Status != "deleted" && f.Status != "suspended")
            .OrderBy(f => f.Name)
            .Select(f => new FirmChoiceDto(f.Id, f.Name))
            .ToListAsync();
    }

    public async Task<LoginResponse> SwitchFirm(Guid userId, Guid firmId, string? ip, string? userAgent)
    {
        var me = await _db.Users.SingleAsync(u => u.Id == userId);
        var target = (await LinkedUsersAsync(me)).FirstOrDefault(u => u.FirmId == firmId)
            ?? throw new AuthFailedException("Is firm me aapka login nahi mila");
        if (target.IsLocked && target.LockedUntil > DateTimeOffset.UtcNow)
            throw new AuthFailedException("Us firm ka account locked hai");
        return await IssueFor(target, ip, userAgent);
    }

    public async Task<LoginResponse> Refresh(string refreshToken)
    {
        var hash = HashToken(refreshToken);
        var session = await _db.Sessions
            .Where(s => s.RefreshTokenHash == hash
                     && s.RevokedAt == null
                     && s.ExpiresAt > DateTimeOffset.UtcNow)
            .FirstOrDefaultAsync()
            ?? throw new AuthFailedException("Invalid or expired refresh token");

        var user = await _db.Users.SingleAsync(u => u.Id == session.UserId);

        // Rotate refresh token
        var newRefresh = GenerateRefreshToken();
        session.RefreshTokenHash = HashToken(newRefresh);
        session.LastSeenAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        var perms = await _perms.GetUserPermissions(user.Id);
        var roles = await GetUserRoles(user.Id);
        var accessToken = GenerateAccessToken(user, session.Id, roles, perms);

        return new LoginResponse(
            accessToken,
            newRefresh,
            new UserInfoDto(
                user.Id, user.FirmId, user.Username, user.FullName,
                user.Email, user.Phone, user.DefaultBranchId,
                user.CanViewAllBranches, roles, perms.ToList(), user.AgentId));
    }

    public async Task Logout(Guid sessionId)
    {
        await _db.Sessions
            .Where(s => s.Id == sessionId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, DateTimeOffset.UtcNow));
    }

    public async Task<UserInfoDto> Me(Guid userId)
    {
        var user = await _db.Users.SingleAsync(u => u.Id == userId);
        var perms = await _perms.GetUserPermissions(userId);
        var roles = await GetUserRoles(userId);
        return new UserInfoDto(
            user.Id, user.FirmId, user.Username, user.FullName,
            user.Email, user.Phone, user.DefaultBranchId,
            user.CanViewAllBranches, roles, perms.ToList(), user.AgentId);
    }

    private async Task<List<string>> GetUserRoles(Guid userId)
    {
        return await _db.UserRoles
            .Where(ur => ur.UserId == userId)
            .Join(_db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => r.Code)
            .ToListAsync();
    }

    private string GenerateAccessToken(User user, Guid sessionId, List<string> roles, IEnumerable<string> permissions)
    {
        var key = _config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key not configured");
        var issuer = _config["Jwt:Issuer"]!;
        var audience = _config["Jwt:Audience"]!;
        var minutes = _config.GetValue<int>("Jwt:AccessTokenMinutes", 15);

        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new("user_id", user.Id.ToString()),
            new("session_id", sessionId.ToString()),
            new("username", user.Username),
            new("name", user.FullName)
        };

        if (user.FirmId.HasValue) claims.Add(new Claim("firm_id", user.FirmId.Value.ToString()));
        if (user.AgentId.HasValue) claims.Add(new Claim("agent_id", user.AgentId.Value.ToString()));
        if (user.DefaultBranchId.HasValue) claims.Add(new Claim("default_branch_id", user.DefaultBranchId.Value.ToString()));

        foreach (var role in roles) claims.Add(new Claim(ClaimTypes.Role, role));

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(minutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(bytes);
    }

    private static string HashToken(string token)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(hash);
    }
}
