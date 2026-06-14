using Microsoft.EntityFrameworkCore;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Modules.Trading.Services;

// =============================================================================
// DTOs
// =============================================================================
public record OrderLineDto(
    Guid? Id,
    Guid? ItemId,
    string ItemName,
    string? Description,
    string? HsnSac,
    decimal Qty,
    string? Unit,
    decimal Rate,
    decimal Rd,
    decimal SgstPct,
    decimal CgstPct,
    decimal TaxableAmount,
    decimal TaxAmount,
    decimal TotalAmount);

public record OrderListItemDto(
    Guid Id,
    string OrderType,
    string OrderNo,
    DateOnly OrderDate,
    Guid PartyId,
    string PartyName,
    Guid? BuyerPartyId,
    string? BuyerName,
    decimal Total,
    string Status,
    string? PaymentTerms,
    string? PreparedBy = null,
    bool IsDeleted = false,             // list me DELETED tag ke liye
    DateTimeOffset? CreatedAt = null,   // entry kab punch hui (time ke saath)
    DateOnly? BilledDate = null);       // is order ka bill kab bana (linked bill ki date)

public record OrderDetailDto(
    Guid Id,
    string OrderType,
    string OrderNo,
    DateOnly OrderDate,
    Guid PartyId,
    string PartyName,
    Guid? BuyerPartyId,
    string? BuyerName,
    decimal Subtotal,
    decimal TaxAmount,
    decimal Total,
    decimal CdPercent,
    decimal CdAmount,
    string CdType,
    Guid? TransporterId,
    string? SupplierOrderNo,
    string? PaymentTerms,
    string Status,
    string? Notes,
    List<OrderLineDto> Lines,
    string? PreparedBy = null);

public record CreateOrderDto(
    string OrderType,
    DateOnly OrderDate,
    Guid PartyId,            // supplier
    Guid? BuyerPartyId,      // buyer (optional)
    decimal CdPercent,
    string? SupplierOrderNo,
    string? PaymentTerms,
    string Status,
    string? Notes,
    List<OrderLineDto> Lines,
    string? CdType = "before",       // before = GST se pehle discount | after = GST ke baad
    decimal? CdAmount = null,        // manual override (null = % se auto)
    Guid? TransporterId = null,      // freight partner
    string? OrderNo = null);         // edit (delete+recreate) me purana number reuse — renumber na ho

// =============================================================================
// Service
// =============================================================================
public interface IOrderService
{
    Task<(List<OrderListItemDto> items, int total)> List(string? type, DateOnly? from, DateOnly? to, Guid? partyId, string? status, int page, int size);
    Task<OrderDetailDto?> Get(Guid id);
    Task<OrderDetailDto> Create(CreateOrderDto dto, Guid firmId, Guid branchId, Guid userId);
    Task<OrderDetailDto?> Update(Guid id, CreateOrderDto dto, Guid userId);
    Task Delete(Guid id);
}

public class OrderService : IOrderService
{
    private readonly AppDbContext _db;
    public OrderService(AppDbContext db) => _db = db;

    public async Task<(List<OrderListItemDto> items, int total)> List(
        string? type, DateOnly? from, DateOnly? to, Guid? partyId, string? status, int page, int size)
    {
        // Deleted orders BHI dikhao (DELETED tag) — numbering gap clear rahe
        var q = _db.Orders.IgnoreQueryFilters().AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(type)) q = q.Where(o => o.OrderType == type);
        if (from.HasValue) q = q.Where(o => o.OrderDate >= from.Value);
        if (to.HasValue) q = q.Where(o => o.OrderDate <= to.Value);
        if (partyId.HasValue) q = q.Where(o => o.PartyId == partyId.Value);
        if (!string.IsNullOrEmpty(status)) q = q.Where(o => o.Status == status);

        var total = await q.CountAsync();

        var orders = await q.OrderByDescending(o => o.OrderDate).ThenByDescending(o => o.CreatedAt)
            .Skip((page - 1) * size).Take(size)
            .ToListAsync();

        var partyIds = orders.Select(o => o.PartyId)
            .Concat(orders.Where(o => o.BuyerPartyId.HasValue).Select(o => o.BuyerPartyId!.Value))
            .Distinct().ToList();

        var parties = await _db.PartyProfiles.AsNoTracking()
            .Where(p => partyIds.Contains(p.Id))
            .Join(_db.Contacts.AsNoTracking(), pp => pp.ContactId, c => c.Id,
                  (pp, c) => new { pp.Id, c.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

        // Prepared by — login user (created_by) ka naam
        var creatorIds = orders.Select(o => o.CreatedBy).Distinct().ToList();
        var creators = await _db.Users.AsNoTracking()
            .Where(u => creatorIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        // Har order ka BILL kab bana — linked bill (OrderId) ya PoNumber=OrderNo se
        var orderIds = orders.Select(o => o.Id).ToList();
        var orderNos = orders.Select(o => o.OrderNo).ToList();
        var billedDates = await _db.Bills.AsNoTracking()
            .Where(b => (b.OrderId != null && orderIds.Contains(b.OrderId.Value))
                     || (b.PoNumber != null && orderNos.Contains(b.PoNumber)))
            .Select(b => new { b.OrderId, b.PoNumber, b.BillDate })
            .ToListAsync();
        DateOnly? BilledOf(Order o)
        {
            var hit = billedDates.FirstOrDefault(b => b.OrderId == o.Id)
                   ?? billedDates.FirstOrDefault(b => b.PoNumber == o.OrderNo);
            return hit?.BillDate;
        }

        var items = orders.Select(o => new OrderListItemDto(
            o.Id, o.OrderType, o.OrderNo, o.OrderDate,
            o.PartyId, parties.GetValueOrDefault(o.PartyId, ""),
            o.BuyerPartyId, o.BuyerPartyId.HasValue ? parties.GetValueOrDefault(o.BuyerPartyId.Value, "") : null,
            o.Total, o.Status, o.PaymentTerms,
            creators.GetValueOrDefault(o.CreatedBy),
            o.DeletedAt != null,
            o.CreatedAt,
            BilledOf(o))).ToList();

        return (items, total);
    }

    public async Task<OrderDetailDto?> Get(Guid id)
    {
        var o = await _db.Orders.AsNoTracking()
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (o is null) return null;

        var ids = new[] { o.PartyId }.Concat(o.BuyerPartyId.HasValue ? new[] { o.BuyerPartyId.Value } : Array.Empty<Guid>())
            .Distinct().ToList();
        var names = await _db.PartyProfiles.AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .Join(_db.Contacts.AsNoTracking(), pp => pp.ContactId, c => c.Id,
                  (pp, c) => new { pp.Id, c.DisplayName })
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName);

        var preparedBy = await _db.Users.AsNoTracking()
            .Where(u => u.Id == o.CreatedBy)
            .Select(u => u.FullName)
            .FirstOrDefaultAsync();

        return new OrderDetailDto(
            o.Id, o.OrderType, o.OrderNo, o.OrderDate,
            o.PartyId, names.GetValueOrDefault(o.PartyId, ""),
            o.BuyerPartyId, o.BuyerPartyId.HasValue ? names.GetValueOrDefault(o.BuyerPartyId.Value, "") : null,
            o.Subtotal, o.TaxAmount, o.Total, o.CdPercent, o.CdAmount, o.CdType ?? "before",
            o.TransporterId,
            o.SupplierOrderNo, o.PaymentTerms, o.Status, o.Notes,
            o.Lines.OrderBy(l => l.SortOrder).Select(l => new OrderLineDto(
                l.Id, l.ItemId, l.ItemName, l.Description, l.HsnSac,
                l.Qty, l.Unit, l.Rate, l.Rd, l.SgstPct, l.CgstPct,
                l.TaxableAmount, l.TaxAmount, l.TotalAmount)).ToList(),
            preparedBy);
    }

    public async Task<OrderDetailDto> Create(CreateOrderDto dto, Guid firmId, Guid branchId, Guid userId)
    {
        if (dto.Lines is null || dto.Lines.Count == 0)
            throw new ArgumentException("At least one item line is required");

        // Edit (delete+recreate) me purana number diya ho to wahi rakho, warna naya generate karo.
        var orderNo = !string.IsNullOrWhiteSpace(dto.OrderNo)
            ? dto.OrderNo.Trim()
            : await GenerateOrderNo(dto.OrderType, firmId, branchId);

        var subtotal = dto.Lines.Sum(l => l.TaxableAmount);
        var tax = dto.Lines.Sum(l => l.TaxAmount);

        // CD 2 type: before = GST se pehle (tax discounted base par) | after = GST ke baad
        var cdType = dto.CdType == "after" ? "after" : "before";
        var cdBase = cdType == "after" ? subtotal + tax : subtotal;
        var cdAmount = (dto.CdAmount.HasValue && dto.CdAmount.Value > 0)
            ? dto.CdAmount.Value
            : cdBase * (dto.CdPercent / 100m);

        decimal total;
        if (cdType == "before")
        {
            var factor = subtotal > 0 ? (subtotal - cdAmount) / subtotal : 1m;
            total = (subtotal - cdAmount) + tax * factor;
        }
        else
        {
            total = subtotal + tax - cdAmount;
        }

        // Round-off: order total poore rupee me (form ke NET AMOUNT se match — list + detail same)
        total = Math.Round(total, 0, MidpointRounding.AwayFromZero);

        var order = new Order
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            BranchId = branchId,
            OrderType = dto.OrderType,
            OrderNo = orderNo,
            OrderDate = dto.OrderDate,
            PartyId = dto.PartyId,
            BuyerPartyId = dto.BuyerPartyId,
            Status = dto.Status ?? "pending",
            Subtotal = subtotal,
            TaxAmount = tax,
            Total = total,
            CdPercent = dto.CdPercent,
            CdAmount = cdAmount,
            CdType = cdType,
            TransporterId = dto.TransporterId,
            SupplierOrderNo = dto.SupplierOrderNo,
            PaymentTerms = dto.PaymentTerms,
            Notes = dto.Notes,
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            Lines = dto.Lines.Select((l, idx) => new OrderLine
            {
                Id = Guid.NewGuid(),
                ItemId = l.ItemId,
                ItemName = l.ItemName,
                Description = l.Description,
                HsnSac = l.HsnSac,
                Qty = l.Qty,
                Unit = l.Unit,
                Rate = l.Rate,
                Rd = l.Rd,
                SgstPct = l.SgstPct,
                CgstPct = l.CgstPct,
                TaxableAmount = l.TaxableAmount,
                TaxAmount = l.TaxAmount,
                TotalAmount = l.TotalAmount,
                SortOrder = idx
            }).ToList()
        };

        _db.Orders.Add(order);
        await _db.SaveChangesAsync();
        return (await Get(order.Id))!;
    }

    public async Task<OrderDetailDto?> Update(Guid id, CreateOrderDto dto, Guid userId)
    {
        var order = await _db.Orders.Include(o => o.Lines).FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return null;
        if (dto.Lines is null || dto.Lines.Count == 0)
            throw new ArgumentException("At least one item line is required");

        var subtotal = dto.Lines.Sum(l => l.TaxableAmount);
        var tax = dto.Lines.Sum(l => l.TaxAmount);
        var cdType = dto.CdType == "after" ? "after" : "before";
        var cdBase = cdType == "after" ? subtotal + tax : subtotal;
        var cdAmount = (dto.CdAmount.HasValue && dto.CdAmount.Value > 0)
            ? dto.CdAmount.Value
            : cdBase * (dto.CdPercent / 100m);

        decimal total;
        if (cdType == "before")
        {
            var factor = subtotal > 0 ? (subtotal - cdAmount) / subtotal : 1m;
            total = (subtotal - cdAmount) + tax * factor;
        }
        else
        {
            total = subtotal + tax - cdAmount;
        }
        total = Math.Round(total, 0, MidpointRounding.AwayFromZero);

        // Scalar fields update — Id aur OrderNo waise ke waise rahenge (renumber nahi).
        order.OrderType = dto.OrderType;
        order.OrderDate = dto.OrderDate;
        order.PartyId = dto.PartyId;
        order.BuyerPartyId = dto.BuyerPartyId;
        order.Status = dto.Status ?? order.Status;
        order.Subtotal = subtotal;
        order.TaxAmount = tax;
        order.Total = total;
        order.CdPercent = dto.CdPercent;
        order.CdAmount = cdAmount;
        order.CdType = cdType;
        order.TransporterId = dto.TransporterId;
        order.SupplierOrderNo = dto.SupplierOrderNo;
        order.PaymentTerms = dto.PaymentTerms;
        order.Notes = dto.Notes;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        // Lines replace — purani delete karo, nayi add karo (navigation reassign NAHI — EF conflict se bachne ke liye)
        _db.OrderLines.RemoveRange(order.Lines);
        var newLines = dto.Lines.Select((l, idx) => new OrderLine
        {
            Id = Guid.NewGuid(),
            OrderId = order.Id,
            ItemId = l.ItemId,
            ItemName = l.ItemName,
            Description = l.Description,
            HsnSac = l.HsnSac,
            Qty = l.Qty,
            Unit = l.Unit,
            Rate = l.Rate,
            Rd = l.Rd,
            SgstPct = l.SgstPct,
            CgstPct = l.CgstPct,
            TaxableAmount = l.TaxableAmount,
            TaxAmount = l.TaxAmount,
            TotalAmount = l.TotalAmount,
            SortOrder = idx
        }).ToList();
        _db.OrderLines.AddRange(newLines);

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            var root = ex; while (root.InnerException != null) root = root.InnerException;
            Console.WriteLine($"[Order.Update] {root.GetType().Name}: {root.Message}");
            throw;
        }
        return await Get(order.Id);
    }

    public async Task Delete(Guid id)
    {
        var o = await _db.Orders.FindAsync(id);
        if (o is null) return;
        o.DeletedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    private async Task<string> GenerateOrderNo(string orderType, Guid firmId, Guid branchId)
    {
        var branch = await _db.Branches.SingleAsync(b => b.Id == branchId);
        var prefix = branch.Code ?? "ORD";

        // Race-safe atomic counter (platform.voucher_counters) — same as BillService.
        // Pehle "CountAsync(...) + 1" tha jo concurrent inserts par DUPLICATE order_no de
        // sakta tha (aur delete ke baad count highest number se mismatch hota).
        var fyYear = GetFyStart().Year;
        var next = await ReserveCounterAsync(firmId, branchId, $"order.{orderType}", fyYear);

        // Safety net: agar counter row legacy data se peeche ho to existing number skip karo.
        // Short format: JPR-O1, JPR-O2 ... (O = Order)
        string candidate;
        do
        {
            candidate = $"{prefix}-O{next}";
            var exists = await _db.Orders.IgnoreQueryFilters()
                .AnyAsync(o => o.FirmId == firmId && o.BranchId == branchId
                            && o.OrderType == orderType && o.OrderNo == candidate);
            if (!exists) break;
            next = await ReserveCounterAsync(firmId, branchId, $"order.{orderType}", fyYear);
        } while (true);
        return candidate;
    }

    /// <summary>
    /// Atomic counter using PostgreSQL UPSERT + RETURNING. Race-safe across concurrent
    /// transactions. (BillService me bhi yahi pattern hai — same table/keys family.)
    /// </summary>
    private async Task<long> ReserveCounterAsync(Guid firmId, Guid branchId, string counterKey, int fyYear)
    {
        var sql = @"
INSERT INTO platform.voucher_counters (firm_id, branch_id, counter_key, fy_year, next_no)
VALUES ({0}, {1}, {2}, {3}, 1)
ON CONFLICT (firm_id, branch_id, counter_key, fy_year)
DO UPDATE SET next_no = platform.voucher_counters.next_no + 1
RETURNING next_no;";
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
        // RLS: raw connection bypasses EF interceptor — set tenant context before the write.
        await Namokara.Api.Common.Db.TenantContextSetter.ApplyAsync(conn, firmId, branchId);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = string.Format(sql,
            $"'{firmId}'::uuid", $"'{branchId}'::uuid",
            $"'{counterKey.Replace("'", "''")}'", fyYear);
        var result = await cmd.ExecuteScalarAsync();
        return Convert.ToInt64(result);
    }

    private static DateOnly GetFyStart()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var year = today.Month >= 4 ? today.Year : today.Year - 1;
        return new DateOnly(year, 4, 1);
    }
}
