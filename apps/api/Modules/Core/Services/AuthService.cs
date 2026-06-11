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

public record LoginRequest(string Identifier, string Password);
public record LoginResponse(
    string AccessToken,
    string RefreshToken,
    UserInfoDto User);

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
    List<string> Permissions);

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
        var user = await _db.Users
            .Where(u => u.Username == req.Identifier
                     || u.Email == req.Identifier
                     || u.Phone == req.Identifier)
            .FirstOrDefaultAsync();

        if (user is null) throw new AuthFailedException("Invalid credentials");

        if (user.IsLocked && user.LockedUntil > DateTimeOffset.UtcNow)
            throw new AuthFailedException("Account temporarily locked. Try again later.");

        if (!user.IsActive) throw new AuthFailedException("Account is inactive");

        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            _log.LogWarning("Failed login attempt for {Username} from {IP}", req.Identifier, ip);
            throw new AuthFailedException("Invalid credentials");
        }

        // Update last login
        user.LastLoginAt = DateTimeOffset.UtcNow;

        // Create session
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
                perms.ToList()));
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
                user.CanViewAllBranches, roles, perms.ToList()));
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
            user.CanViewAllBranches, roles, perms.ToList());
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
