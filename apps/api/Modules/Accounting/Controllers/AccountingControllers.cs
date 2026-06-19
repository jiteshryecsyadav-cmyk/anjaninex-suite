using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Accounting.Services;

namespace Namokara.Api.Modules.Accounting.Controllers;

// =============================================================================
// Base controller with claim helpers
// =============================================================================
[Authorize]
public abstract class AccountingControllerBase : ControllerBase
{
    protected Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    protected Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    protected Guid CurrentBranchId
    {
        get
        {
            var branchId = Request.Headers["X-Branch-Id"].FirstOrDefault()
                        ?? User.FindFirst("default_branch_id")?.Value;
            return Guid.Parse(branchId ?? throw new InvalidOperationException("Branch not selected"));
        }
    }
}

// =============================================================================
// Chart of Accounts: Heads, Groups, SubGroups
// =============================================================================
[ApiController]
[Route("api/accounting/heads")]
public class AccountHeadsController : AccountingControllerBase
{
    private readonly IChartOfAccountsService _svc;
    public AccountHeadsController(IChartOfAccountsService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> List() => Ok(await _svc.ListHeads());
}

[ApiController]
[Route("api/accounting/groups")]
public class AccountGroupsController : AccountingControllerBase
{
    private readonly IChartOfAccountsService _svc;
    public AccountGroupsController(IChartOfAccountsService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> List([FromQuery] Guid? headId)
        => Ok(await _svc.ListGroups(headId));

    [HttpPost]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> Create([FromBody] CreateGroupDto dto)
        => Ok(await _svc.CreateGroup(dto, CurrentFirmId));

    [HttpPut("{id}")]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGroupDto dto)
    {
        try
        {
            return Ok(await _svc.UpdateGroup(id, dto));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpDelete("{id}")]
    [HasPermission("accounting.voucher.delete.branch")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.DeleteGroup(id);
        return NoContent();
    }
}

[ApiController]
[Route("api/accounting/sub-groups")]
public class SubGroupsController : AccountingControllerBase
{
    private readonly IChartOfAccountsService _svc;
    public SubGroupsController(IChartOfAccountsService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> List([FromQuery] Guid? groupId)
        => Ok(await _svc.ListSubGroups(groupId));

    [HttpPost]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> Create([FromBody] CreateSubGroupDto dto)
        => Ok(await _svc.CreateSubGroup(dto, CurrentFirmId));

    [HttpPut("{id}")]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSubGroupDto dto)
    {
        try
        {
            return Ok(await _svc.UpdateSubGroup(id, dto));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpDelete("{id}")]
    [HasPermission("accounting.voucher.delete.branch")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.DeleteSubGroup(id);
        return NoContent();
    }
}

[ApiController]
[Route("api/accounting/ledgers")]
public class LedgersController : AccountingControllerBase
{
    private readonly IChartOfAccountsService _svc;
    public LedgersController(IChartOfAccountsService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> List([FromQuery] Guid? subGroupId, [FromQuery] string? search)
        => Ok(await _svc.ListLedgers(subGroupId, search));

    [HttpGet("{id}")]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var l = await _svc.GetLedger(id);
        return l is null ? NotFound() : Ok(l);
    }

    [HttpPost]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> Create([FromBody] CreateLedgerDto dto)
        => Ok(await _svc.CreateLedger(dto, CurrentFirmId));

    [HttpPut("{id}")]
    [HasPermission("accounting.ledger.view.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateLedgerDto dto)
        => Ok(await _svc.UpdateLedger(id, dto));

    [HttpDelete("{id}")]
    [HasPermission("accounting.voucher.delete.branch")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.DeleteLedger(id);
        return NoContent();
    }
}

// =============================================================================
// Vouchers
// =============================================================================
[ApiController]
[Route("api/accounting/vouchers")]
public class VouchersController : AccountingControllerBase
{
    private readonly IVoucherService _svc;
    public VouchersController(IVoucherService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("accounting.voucher.view.branch")]
    public async Task<IActionResult> List(
        [FromQuery] string? type,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int page = 1,
        [FromQuery] int size = 50)
    {
        var (items, total) = await _svc.List(type, from, to, page, size);
        return Ok(new { items, total, page, size });
    }

    [HttpGet("{id}")]
    [HasPermission("accounting.voucher.view.branch")]
    public async Task<IActionResult> Get(Guid id)
    {
        var v = await _svc.Get(id);
        return v is null ? NotFound() : Ok(v);
    }

    [HttpPost]
    [HasPermission("accounting.voucher.create.branch")]
    public async Task<IActionResult> Create([FromBody] CreateVoucherDto dto)
    {
        try
        {
            var result = await _svc.Create(dto, CurrentFirmId, CurrentBranchId, CurrentUserId);
            return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
        }
        catch (VoucherUnbalancedException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPut("{id}")]
    [HasPermission("accounting.voucher.create.branch")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateVoucherDto dto)
    {
        try
        {
            return Ok(await _svc.Update(id, dto, CurrentUserId));
        }
        catch (VoucherUnbalancedException ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpDelete("{id}")]
    [HasPermission("accounting.voucher.delete.branch")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }
}

// =============================================================================
// Reports
// =============================================================================
[ApiController]
[Route("api/accounting/reports")]
public class ReportsController : AccountingControllerBase
{
    private readonly IReportsService _svc;
    public ReportsController(IReportsService svc) => _svc = svc;

    [HttpGet("trial-balance")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> TrialBalance([FromQuery] DateOnly? asOf)
        => Ok(await _svc.TrialBalance(asOf ?? DateOnly.FromDateTime(DateTime.Now)));

    [HttpGet("profit-loss")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> ProfitLoss(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to)
    {
        var f = from ?? new DateOnly(DateTime.Now.Year, 4, 1);
        var t = to ?? DateOnly.FromDateTime(DateTime.Now);
        return Ok(await _svc.ProfitLoss(f, t));
    }

    [HttpGet("balance-sheet")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> BalanceSheet([FromQuery] DateOnly? asOf)
        => Ok(await _svc.BalanceSheet(asOf ?? DateOnly.FromDateTime(DateTime.Now)));

    [HttpGet("ledger-statement/{ledgerId}")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> LedgerStatement(
        Guid ledgerId,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to)
    {
        var f = from ?? new DateOnly(DateTime.Now.Year, 4, 1);
        var t = to ?? DateOnly.FromDateTime(DateTime.Now);
        return Ok(await _svc.LedgerStatement(ledgerId, f, t));
    }

    // Party Master "📒 Ledger / Khata" shortcut.
    // 200 + { ledgerId, ledgerName } if the party has an accounting ledger;
    // 404 if no ledger exists yet (no bill/payment booked) → UI shows friendly hint.
    [HttpGet("party-ledger/{partyId}")]
    [HasPermission("accounting.report.view.firm")]
    public async Task<IActionResult> PartyLedger(Guid partyId)
    {
        var dto = await _svc.ResolvePartyLedger(partyId, CurrentFirmId);
        return dto is null ? NotFound() : Ok(dto);
    }
}
