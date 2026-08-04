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
    /// <param name="remember">
    /// "Mujhe yaad rakho" — cookie ko PAKKA (persistent) banao taaki app band hone
    /// par bhi bachi rahe. Bina iske ye SESSION cookie hai: APK band hote hi ud
    /// jati thi aur staff ko har baar poora id/password daalna padta tha.
    /// </param>
    private CookieOptions RefreshCookieOptions(int days, bool remember) => new()
    {
        HttpOnly = true,         // JS cannot read — defeats XSS exfiltration
        Secure = !HttpContext.Request.Host.Host.StartsWith("localhost"),
        SameSite = SameSiteMode.Strict,
        IsEssential = true,
        Path = "/api/auth",
        Domain = SharedCookieDomain(),
        Expires = remember ? DateTimeOffset.UtcNow.AddDays(days) : null
    };

    /// <summary>
    /// Cookie ko PAAS wale app tak bhi pahunchana hai.
    ///
    /// Login sabka ek hi jagah hota hai (vyaparsetu.anjaninex.com), par MFG firm
    /// ka aadmi wahan se mfg.vyaparsetu.anjaninex.com par bheja jata hai. Cookie
    /// par Domain na ho to wo sirf usi host ki rehti hai — aur naye app par
    /// pahunchte hi aadmi ko DOBARA login karna padta hai.
    ///
    /// Isliye ".vyaparsetu.anjaninex.com" par rakhte hain — ek hi ghar ke saare
    /// app use padh sakte hain. Bahar koi nahi (Domain sirf apne suffix par
    /// lag sakta hai, kisi aur site par nahi).
    ///
    /// localhost / IP par null — wahan Domain lagane se cookie girti hi nahi.
    /// </summary>
    private string? SharedCookieDomain()
    {
        var host = HttpContext.Request.Host.Host;
        const string shared = "vyaparsetu.anjaninex.com";
        if (host.Equals(shared, StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith("." + shared, StringComparison.OrdinalIgnoreCase))
            return "." + shared;
        return null;
    }

    /// Refresh/switch ke waqt bhi "yaad rakho" wali baat pata honi chahiye, warna
    /// pehli hi refresh par cookie session-cookie ban kar wapas gir jati.
    /// Isme koi raaz nahi — sirf haan/na ka nishan hai.
    private const string RememberCookieName = "nmk_rm";
    private bool WasRemembered() => Request.Cookies[RememberCookieName] == "1";
    private void MarkRemembered(bool remember)
    {
        if (remember)
            Response.Cookies.Append(RememberCookieName, "1", new CookieOptions
            {
                HttpOnly = false,
                Secure = !HttpContext.Request.Host.Host.StartsWith("localhost"),
                SameSite = SameSiteMode.Strict,
                IsEssential = true,
                Path = "/api/auth",
                Domain = SharedCookieDomain(),
                Expires = DateTimeOffset.UtcNow.AddDays(90)
            });
        else
            Response.Cookies.Delete(RememberCookieName,
                new CookieOptions { Path = "/api/auth", Domain = SharedCookieDomain() });
    }

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
            Response.Cookies.Append(RefreshCookieName, result.RefreshToken, RefreshCookieOptions(90, req.Remember));
            MarkRemembered(req.Remember);

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
            Response.Cookies.Append(RefreshCookieName, result.RefreshToken, RefreshCookieOptions(90, WasRemembered()));
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
        // Domain wahi dena zaroori hai jispar cookie lagi thi — warna delete
        // ek doosri (host-only) cookie ko dhoondta hai aur asli wahin padi
        // reh jati hai. Aadmi "logout" dabata hai par andar hi rehta hai.
        Response.Cookies.Delete(RefreshCookieName,
            new CookieOptions { Path = "/api/auth", Domain = SharedCookieDomain() });
        MarkRemembered(false);   // khud logout kiya hai to yaad bhi mat rakho
        return NoContent();
    }

    /// <summary>MULTI-FIRM: current user ki saari firms (same phone/email/username linked).</summary>
    [HttpGet("my-firms")]
    [Authorize]
    public async Task<IActionResult> MyFirms()
    {
        var userIdClaim = User.FindFirst("user_id")?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId)) return Unauthorized();
        return Ok(await _auth.MyFirms(userId));
    }

    /// <summary>MULTI-FIRM: bina password dusri firm me switch (linked login se naya token).</summary>
    [HttpPost("switch-firm")]
    [Authorize]
    public async Task<IActionResult> SwitchFirm([FromBody] SwitchFirmRequest req)
    {
        var userIdClaim = User.FindFirst("user_id")?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId)) return Unauthorized();
        try
        {
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
            var ua = Request.Headers.UserAgent.ToString();
            var result = await _auth.SwitchFirm(userId, req.FirmId, ip, ua);
            Response.Cookies.Append(RefreshCookieName, result.RefreshToken, RefreshCookieOptions(90, WasRemembered()));
            return Ok(result with { RefreshToken = "" });
        }
        catch (AuthFailedException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
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
public record SwitchFirmRequest(Guid FirmId);
