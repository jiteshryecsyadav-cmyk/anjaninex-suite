using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Modules.Trading.Services;

namespace Namokara.Api.Modules.Trading.Controllers;

[Authorize]
public abstract class TradingControllerBase : ControllerBase
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
// Parties
// =============================================================================
[ApiController]
[Route("api/trading/parties")]
public class PartiesController : TradingControllerBase
{
    private readonly IPartyService _svc;
    public PartiesController(IPartyService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("trading.party.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search)
        => Ok(await _svc.List(search));

    [HttpGet("{id}")]
    [HasPermission("trading.party.view.firm")]
    public async Task<IActionResult> Get(Guid id)
    {
        var p = await _svc.Get(id);
        return p is null ? NotFound() : Ok(p);
    }

    [HttpPost]
    [HasPermission("trading.party.create.firm")]
    public async Task<IActionResult> Create([FromBody] CreatePartyDto dto)
    {
        try
        {
            return Ok(await _svc.Create(dto, CurrentFirmId, CurrentUserId));
        }
        catch (Namokara.Api.Modules.Trading.Services.PartyExistsException ex)
        {
            // 409 Conflict — strict GST duplicate
            return Conflict(new
            {
                error = "PARTY_EXISTS",
                message = "Is GSTIN par party pehle se save hai.",
                existing = new
                {
                    id = ex.ExistingPartyId,
                    displayName = ex.DisplayName,
                    gst = ex.Gst,
                    phone = ex.Phone,
                    city = ex.City,
                    createdAt = ex.CreatedAt
                }
            });
        }
    }

    [HttpPut("{id}")]
    [HasPermission("trading.party.edit.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreatePartyDto dto)
        => Ok(await _svc.Update(id, dto));

    [HttpPatch("{id}/credit")]
    [HasPermission("trading.party.edit.firm")]
    public async Task<IActionResult> UpdateCredit(Guid id, [FromBody] UpdateCreditDto dto)
    {
        await _svc.UpdateCredit(id, dto);
        return Ok();
    }

    [HttpDelete("{id}")]
    [HasPermission("trading.party.edit.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }
}

// =============================================================================
// Items
// =============================================================================
[ApiController]
[Route("api/trading/items")]
public class ItemsController : TradingControllerBase
{
    private readonly IItemService _svc;
    public ItemsController(IItemService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("trading.party.view.firm")]
    public async Task<IActionResult> List([FromQuery] string? search)
        => Ok(await _svc.List(search));

    [HttpPost]
    [HasPermission("trading.party.create.firm")]
    public async Task<IActionResult> Create([FromBody] CreateItemDto dto)
        => Ok(await _svc.Create(dto, CurrentFirmId));

    [HttpPut("{id}")]
    [HasPermission("trading.party.edit.firm")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateItemDto dto)
        => Ok(await _svc.Update(id, dto));

    [HttpDelete("{id}")]
    [HasPermission("trading.party.edit.firm")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }
}

// =============================================================================
// Bills
// =============================================================================
[ApiController]
[Route("api/trading/bills")]
public class BillsController : TradingControllerBase
{
    private readonly IBillService _svc;
    public BillsController(IBillService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("trading.bill.view.branch")]
    public async Task<IActionResult> List(
        [FromQuery] string? type, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] Guid? partyId, [FromQuery] string? status,
        [FromQuery] int page = 1, [FromQuery] int size = 50)
    {
        var (items, total) = await _svc.List(type, from, to, partyId, status, page, size);
        return Ok(new { items, total, page, size });
    }

    [HttpGet("{id}")]
    [HasPermission("trading.bill.view.branch")]
    public async Task<IActionResult> Get(Guid id)
    {
        var b = await _svc.Get(id);
        return b is null ? NotFound() : Ok(b);
    }

    [HttpPost]
    [HasPermission("trading.bill.create.branch")]
    public async Task<IActionResult> Create([FromBody] CreateBillDto dto)
    {
        try
        {
            var result = await _svc.Create(dto, CurrentFirmId, CurrentBranchId, CurrentUserId);
            return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
        }
        catch (Namokara.Api.Modules.Trading.Services.BillDuplicateException dup)
        {
            // 409 Conflict — strict block, NO override allowed
            return Conflict(new
            {
                error = "DUPLICATE_BILL",
                message = "Ye bill pehle se save hai (same supplier + bill no + date).",
                existing = new
                {
                    id = dup.ExistingBillId,
                    billNo = dup.ExistingBillNo,
                    billDate = dup.BillDate,
                    total = dup.Total,
                    status = dup.Status
                }
            });
        }
        catch (Exception ex)
        {
            // Surface the REAL cause. EF's outer message is the useless generic
            // "An error occurred while saving the entity changes." — the actual DB
            // error (FK violation, NOT NULL, CHECK, etc.) lives in InnerException.
            var root = ex;
            while (root.InnerException != null) root = root.InnerException;
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPut("{id}")]
    [HasPermission("trading.bill.create.branch")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateBillDto dto)
    {
        try
        {
            var result = await _svc.Update(id, dto, CurrentFirmId, CurrentUserId);
            return result is null ? NotFound(new { error = "Bill nahi mila." }) : Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpDelete("{id}")]
    [HasPermission("trading.bill.delete.branch")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }
}

// =============================================================================
// Orders
// =============================================================================
[ApiController]
[Route("api/trading/orders")]
public class OrdersController : TradingControllerBase
{
    private readonly IOrderService _svc;
    public OrdersController(IOrderService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("trading.bill.view.branch")]
    public async Task<IActionResult> List(
        [FromQuery] string? type, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] Guid? partyId, [FromQuery] string? status,
        [FromQuery] int page = 1, [FromQuery] int size = 50)
    {
        var (items, total) = await _svc.List(type, from, to, partyId, status, page, size);
        return Ok(new { items, total, page, size });
    }

    [HttpGet("{id}")]
    [HasPermission("trading.bill.view.branch")]
    public async Task<IActionResult> Get(Guid id)
    {
        var o = await _svc.Get(id);
        return o is null ? NotFound() : Ok(o);
    }

    [HttpPost]
    [HasPermission("trading.bill.create.branch")]
    public async Task<IActionResult> Create([FromBody] CreateOrderDto dto)
    {
        try
        {
            var result = await _svc.Create(dto, CurrentFirmId, CurrentBranchId, CurrentUserId);
            return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPut("{id}")]
    [HasPermission("trading.bill.create.branch")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateOrderDto dto)
    {
        try
        {
            var result = await _svc.Update(id, dto, CurrentUserId);
            if (result == null) return NotFound(new { error = "Order nahi mila." });
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpDelete("{id}")]
    [HasPermission("trading.bill.delete.branch")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }
}

// =============================================================================
// Goods Returns
// =============================================================================
[ApiController]
[Route("api/trading/goods-returns")]
public class GoodsReturnsController : TradingControllerBase
{
    private readonly IGoodsReturnService _svc;
    public GoodsReturnsController(IGoodsReturnService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("trading.bill.view.branch")]
    public async Task<IActionResult> List(
        [FromQuery] string? status, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] Guid? partyId,
        [FromQuery] int page = 1, [FromQuery] int size = 50)
    {
        var (items, total) = await _svc.List(status, from, to, partyId, page, size);
        return Ok(new { items, total, page, size });
    }

    [HttpGet("{id}")]
    [HasPermission("trading.bill.view.branch")]
    public async Task<IActionResult> Get(Guid id)
    {
        var g = await _svc.Get(id);
        return g is null ? NotFound() : Ok(g);
    }

    [HttpPost]
    [HasPermission("trading.bill.create.branch")]
    public async Task<IActionResult> Create([FromBody] CreateGoodsReturnDto dto)
    {
        try
        {
            var result = await _svc.Create(dto, CurrentFirmId, CurrentBranchId, CurrentUserId);
            return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpPut("{id}")]
    [HasPermission("trading.bill.create.branch")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreateGoodsReturnDto dto)
    {
        try
        {
            var result = await _svc.Update(id, dto, CurrentFirmId, CurrentUserId);
            return result is null ? NotFound(new { error = "GR nahi mila." }) : Ok(result);
        }
        catch (Exception ex) { return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) }); }
    }

    [HttpPost("{id}/approve")]
    [HasPermission("trading.bill.create.branch")]
    public async Task<IActionResult> Approve(Guid id)
    {
        try { return Ok(await _svc.Approve(id, CurrentUserId)); }
        catch (Exception ex) { return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) }); }
    }

    [HttpPost("{id}/reject")]
    [HasPermission("trading.bill.create.branch")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectGrDto dto)
    {
        try { return Ok(await _svc.Reject(id, dto.Reason ?? "", CurrentUserId)); }
        catch (Exception ex) { return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) }); }
    }

    [HttpDelete("{id}")]
    [HasPermission("trading.bill.delete.branch")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }
}

public record RejectGrDto(string? Reason);

// =============================================================================
// Payments
// =============================================================================
[ApiController]
[Route("api/trading/payments")]
public class PaymentsController : TradingControllerBase
{
    private readonly IPaymentService _svc;
    public PaymentsController(IPaymentService svc) => _svc = svc;

    [HttpGet]
    [HasPermission("trading.payment.view.branch")]
    public async Task<IActionResult> List(
        [FromQuery] string? type, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] Guid? partyId,
        [FromQuery] int page = 1, [FromQuery] int size = 50)
    {
        var (items, total) = await _svc.List(type, from, to, partyId, page, size);
        return Ok(new { items, total, page, size });
    }

    [HttpGet("{id}")]
    [HasPermission("trading.payment.view.branch")]
    public async Task<IActionResult> Get(Guid id)
    {
        var p = await _svc.Get(id);
        return p is null ? NotFound() : Ok(p);
    }

    [HttpGet("outstanding-bills")]
    [HasPermission("trading.payment.view.branch")]
    public async Task<IActionResult> Outstanding([FromQuery] Guid partyId, [FromQuery] Guid? supplierId)
        => Ok(await _svc.GetOutstandingBills(partyId, supplierId));

    [HttpPost]
    [HasPermission("trading.payment.create.branch")]
    public async Task<IActionResult> Create([FromBody] CreatePaymentDto dto)
    {
        try
        {
            var result = await _svc.Create(dto, CurrentFirmId, CurrentBranchId, CurrentUserId);
            return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = Namokara.Api.Common.Errors.FriendlyError.From(ex) });
        }
    }

    [HttpDelete("{id}")]
    [HasPermission("trading.payment.create.branch")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _svc.Delete(id);
        return NoContent();
    }
}
