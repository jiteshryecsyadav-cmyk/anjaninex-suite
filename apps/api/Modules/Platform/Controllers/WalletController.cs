using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Platform.Services;

namespace Namokara.Api.Modules.Platform.Controllers;

[ApiController]
[Route("api/wallet")]
[Authorize]
public class WalletController : ControllerBase
{
    private readonly IWalletService _wallet;
    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    // Super-admin (anjaninex) ka firm_id NULL hota hai — uske paas wallet nahi.
    private bool HasFirm => User.FindFirst("firm_id")?.Value is { Length: > 0 };

    public WalletController(IWalletService wallet)
    {
        _wallet = wallet;
    }

    [HttpGet("balance")]
    public async Task<IActionResult> GetBalance()
    {
        if (!HasFirm) return Ok(new { balance = 0m });   // super-admin — no firm wallet
        var balance = await _wallet.GetBalance(CurrentFirmId);
        return Ok(new { balance });
    }

    [HttpGet("history")]
    public async Task<IActionResult> History([FromQuery] int page = 1, [FromQuery] int size = 50)
    {
        if (!HasFirm) return Ok(Array.Empty<object>());   // super-admin — no firm wallet
        var entries = await _wallet.GetHistory(CurrentFirmId, page, size);
        return Ok(entries);
    }

    [HttpPost("recharge")]
    [HasPermission("settings.wallet.recharge.firm")]
    public async Task<IActionResult> Recharge([FromBody] RechargeDto dto)
    {
        await _wallet.Recharge(CurrentFirmId, dto.Amount, dto.Source ?? "manual", dto.Reference ?? "", CurrentUserId, dto.Gstin);
        var newBalance = await _wallet.GetBalance(CurrentFirmId);
        return Ok(new { success = true, newBalance });
    }

    // Service use hone par wallet se charge (bill scan, SMS, WhatsApp, PDF, ...).
    // mode 'self' ho to sirf usage log hota hai, paisa nahi katega.
    [HttpPost("use-service")]
    public async Task<IActionResult> UseService([FromBody] UseServiceDto dto)
    {
        if (!HasFirm) return BadRequest(new { error = "No firm wallet." });
        if (string.IsNullOrWhiteSpace(dto.Code)) return BadRequest(new { error = "Service code chahiye." });
        var res = await _wallet.ChargeServiceAsync(CurrentFirmId, dto.Code.Trim(), dto.Units <= 0 ? 1 : dto.Units, dto.Reference, CurrentUserId);
        if (!res.Ok)
        {
            var msg = res.Reason == "insufficient"
                ? "Wallet balance kam hai — recharge karein."
                : res.Reason == "unknown_service" ? "Service available nahi hai." : "Charge nahi hua.";
            return BadRequest(new { error = msg, reason = res.Reason });
        }
        return Ok(new { success = true, charged = res.Charged, mode = res.Mode, newBalance = res.NewBalance, service = res.Name });
    }

    // Usage report — kis service par kitna use + kitna kata (date filter optional).
    [HttpGet("usage-report")]
    public async Task<IActionResult> UsageReport([FromQuery] string? from, [FromQuery] string? to)
    {
        if (!HasFirm) return Ok(new { summary = Array.Empty<object>(), log = Array.Empty<object>(), totalAmount = 0m });
        DateTimeOffset? f = DateTimeOffset.TryParse(from, out var fv) ? fv : null;
        DateTimeOffset? t = DateTimeOffset.TryParse(to, out var tv) ? tv.AddDays(1) : null;
        var report = await _wallet.GetUsageReportAsync(CurrentFirmId, f, t);
        return Ok(report);
    }
}

public record RechargeDto(decimal Amount, string? Source, string? Reference, string? Gstin);
public record UseServiceDto(string Code, decimal Units, string? Reference);
