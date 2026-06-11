using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Namokara.Api.Modules.Core.Services;

namespace Namokara.Api.Modules.Core.Controllers;

[ApiController]
[Route("api/auth")]
[EnableRateLimiting("auth")]    // P0-11: 5 attempts/min per IP
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly ILogger<AuthController> _log;

    public AuthController(IAuthService auth, ILogger<AuthController> log)
    {
        _auth = auth;
        _log = log;
    }

    private const string RefreshCookieName = "nmk_refresh";

    /// <summary>P0-13: standard secure cookie options for refresh token.</summary>
    private CookieOptions RefreshCookieOptions(int days) => new()
    {
        HttpOnly = true,         // JS cannot read — defeats XSS exfiltration
        Secure = !HttpContext.Request.Host.Host.StartsWith("localhost"),
        SameSite = SameSiteMode.Strict,
        IsEssential = true,
        Path = "/api/auth",      // narrow path — only sent to auth endpoints
        Expires = DateTimeOffset.UtcNow.AddDays(days)
    };

    /// <summary>
    /// Login with username/email/phone + password.
    /// P0-13: refresh token returned in HttpOnly cookie instead of response body.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Identifier) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "Identifier and password required" });

        try
        {
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
            var ua = Request.Headers.UserAgent.ToString();
            var result = await _auth.Login(req, ip, ua);

            // Set refresh token as HttpOnly cookie
            Response.Cookies.Append(RefreshCookieName, result.RefreshToken, RefreshCookieOptions(7));

            // Strip refresh token from response body — client only needs access token
            var safeResult = result with { RefreshToken = "" };
            return Ok(safeResult);
        }
        catch (AuthFailedException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Refresh access token. Reads refresh token from HttpOnly cookie (P0-13).
    /// Body param accepted as fallback for legacy clients but cookie takes precedence.
    /// </summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest? req = null)
    {
        var cookieToken = Request.Cookies[RefreshCookieName];
        var token = !string.IsNullOrEmpty(cookieToken) ? cookieToken : req?.RefreshToken;
        if (string.IsNullOrEmpty(token))
            return Unauthorized(new { error = "No refresh token" });

        try
        {
            var result = await _auth.Refresh(token);
            // Rotate refresh cookie
            Response.Cookies.Append(RefreshCookieName, result.RefreshToken, RefreshCookieOptions(7));
            var safeResult = result with { RefreshToken = "" };
            return Ok(safeResult);
        }
        catch (AuthFailedException ex)
        {
            Response.Cookies.Delete(RefreshCookieName);
            return Unauthorized(new { error = ex.Message });
        }
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var sessionIdClaim = User.FindFirst("session_id")?.Value;
        if (Guid.TryParse(sessionIdClaim, out var sessionId))
        {
            await _auth.Logout(sessionId);
        }
        Response.Cookies.Delete(RefreshCookieName, new CookieOptions { Path = "/api/auth" });
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var userIdClaim = User.FindFirst("user_id")?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId)) return Unauthorized();
        var info = await _auth.Me(userId);
        return Ok(info);
    }
}

public record RefreshRequest(string RefreshToken);
