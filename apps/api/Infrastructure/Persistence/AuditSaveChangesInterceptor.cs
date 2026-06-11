using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Namokara.Api.Modules.Platform.Entities;

namespace Namokara.Api.Infrastructure.Persistence;

/// <summary>
/// Global audit: har SaveChanges par insert/update/(soft)delete pakad kar
/// platform.audit_logs me likh deta hai — kisne, kab, kya badla.
/// </summary>
public class AuditSaveChangesInterceptor : SaveChangesInterceptor
{
    private readonly IHttpContextAccessor _http;

    // In par log NAHI banta (ye khud log/cache/internal tables hain)
    private static readonly HashSet<string> Excluded = new()
    {
        "AuditLog", "AiCacheEntry", "AiExtractionLog", "Notification",
        "WalletLedgerEntry", "PlatformRevenueEntry", "AttendanceLog"
    };

    // Bade/sensitive fields changes-JSON me skip
    private static readonly HashSet<string> SkipProps = new()
    {
        "OutputJson", "Payload", "CorrectionDiff", "Components", "Meta",
        "EnabledModules", "Features", "ChannelsSent", "PasswordHash",
        "AiApiKey", "MapsApiKey", "RazorpayKeySecret",
        "CreatedAt", "UpdatedAt"
    };

    private static readonly string[] LabelProps =
    {
        "DisplayName", "FullName", "Name", "BillNo", "OrderNo", "VoucherNo",
        "GrNo", "InvoiceNo", "EmployeeCode", "Username", "Code", "Title", "OrderCode"
    };

    public AuditSaveChangesInterceptor(IHttpContextAccessor http) => _http = http;

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData, InterceptionResult<int> result)
    {
        AddAuditRows(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
    {
        AddAuditRows(eventData.Context);
        return base.SavingChangesAsync(eventData, result, ct);
    }

    private void AddAuditRows(DbContext? ctx)
    {
        if (ctx is null) return;

        var user = _http.HttpContext?.User;
        Guid? userId = Guid.TryParse(user?.FindFirst("user_id")?.Value, out var u) ? u : null;
        Guid? claimFirm = Guid.TryParse(user?.FindFirst("firm_id")?.Value, out var f) ? f : null;

        var rows = new List<AuditLog>();

        foreach (var entry in ctx.ChangeTracker.Entries().ToList())
        {
            if (entry.State != EntityState.Added && entry.State != EntityState.Modified && entry.State != EntityState.Deleted)
                continue;

            var typeName = entry.Entity.GetType().Name;
            if (Excluded.Contains(typeName)) continue;

            string action;
            string? changes = null;

            if (entry.State == EntityState.Added) action = "insert";
            else if (entry.State == EntityState.Deleted) action = "delete";
            else
            {
                // soft-delete detect: DeletedAt null→value YA IsActive true→false
                var del = entry.Properties.FirstOrDefault(p => p.Metadata.Name == "DeletedAt");
                var act = entry.Properties.FirstOrDefault(p => p.Metadata.Name == "IsActive");
                bool softDeleted =
                    (del != null && del.IsModified && del.OriginalValue == null && del.CurrentValue != null) ||
                    (act != null && act.IsModified && Equals(act.OriginalValue, true) && Equals(act.CurrentValue, false));

                action = softDeleted ? "delete" : "update";

                if (action == "update")
                {
                    var diff = new Dictionary<string, object?>();
                    foreach (var p in entry.Properties)
                    {
                        if (!p.IsModified || SkipProps.Contains(p.Metadata.Name)) continue;
                        if (Equals(p.OriginalValue, p.CurrentValue)) continue;
                        diff[p.Metadata.Name] = new { old = Short(p.OriginalValue), @new = Short(p.CurrentValue) };
                    }
                    if (diff.Count == 0) continue;   // kuch badla hi nahi → log mat karo
                    changes = JsonSerializer.Serialize(diff);
                }
            }

            rows.Add(new AuditLog
            {
                FirmId = GetGuid(entry, "FirmId") ?? claimFirm,
                UserId = userId ?? GetGuid(entry, "CreatedBy"),
                Module = ModuleOf(entry.Entity.GetType().Namespace ?? ""),
                TableName = typeName,
                EntityId = GetVal(entry, "Id")?.ToString(),
                EntityLabel = Label(entry),
                Action = action,
                Changes = changes,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        if (rows.Count > 0) ctx.Set<AuditLog>().AddRange(rows);
    }

    private static string ModuleOf(string ns)
    {
        if (ns.Contains(".Trading")) return "trading";
        if (ns.Contains(".Accounting")) return "accounting";
        if (ns.Contains(".Hr")) return "hr";
        if (ns.Contains(".Suppliers")) return "ad";
        if (ns.Contains(".Core")) return "core";
        if (ns.Contains(".Platform")) return "platform";
        if (ns.Contains(".Ai")) return "ai";
        return "other";
    }

    private static object? GetVal(EntityEntry e, string prop)
    {
        var p = e.Properties.FirstOrDefault(x => x.Metadata.Name == prop);
        return p?.CurrentValue;
    }

    private static Guid? GetGuid(EntityEntry e, string prop)
        => GetVal(e, prop) is Guid g && g != Guid.Empty ? g : null;

    private static string? Label(EntityEntry e)
    {
        foreach (var name in LabelProps)
        {
            var v = GetVal(e, name)?.ToString();
            if (!string.IsNullOrWhiteSpace(v)) return v.Length > 200 ? v[..200] : v;
        }
        return null;
    }

    private static string? Short(object? v)
    {
        var s = v?.ToString();
        if (s == null) return null;
        return s.Length > 180 ? s[..180] + "…" : s;
    }
}
