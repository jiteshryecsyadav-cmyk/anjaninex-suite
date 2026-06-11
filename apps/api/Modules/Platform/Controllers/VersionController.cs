using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

[ApiController]
[Route("api/version")]
[AllowAnonymous]
public class VersionController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly IChangelogService _changelog;

    public VersionController(IConfiguration config, IChangelogService changelog)
    {
        _config = config;
        _changelog = changelog;
    }

    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        version = _config["Versioning:ApiVersion"] ?? "1.0.0",
        minClientVersion = _config["Versioning:MinClientVersion"] ?? "1.0.0",
        forceUpdateOnMismatch = _config.GetValue<bool>("Versioning:ForceUpdateOnMismatch"),
        serverTime = DateTimeOffset.UtcNow,
        poweredBy = "Anjaninex",
        environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production"
    });

    [HttpGet("changelog")]
    public async Task<IActionResult> Changelog([FromQuery] int count = 10)
    {
        var history = await _changelog.GetHistory(count);
        return Ok(history);
    }

    [HttpGet("changelog/latest")]
    public async Task<IActionResult> Latest()
    {
        var latest = await _changelog.GetLatest();
        return latest is null ? NotFound() : Ok(latest);
    }
}
