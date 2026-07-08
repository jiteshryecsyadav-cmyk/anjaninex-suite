using Microsoft.EntityFrameworkCore;
using Namokara.Api.Modules.Accounting.Entities;
using Namokara.Api.Modules.Ai.Entities;
using Namokara.Api.Modules.Core.Entities;
using Namokara.Api.Modules.Dukan.Entities;
using Namokara.Api.Modules.Hr.Entities;
using Namokara.Api.Modules.Platform.Entities;
using Namokara.Api.Modules.Suppliers.Entities;
using Namokara.Api.Modules.Trading.Entities;

namespace Namokara.Api.Infrastructure.Persistence;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    // Platform schema
    public DbSet<Firm> Firms => Set<Firm>();
    public DbSet<SubscriptionPlan> SubscriptionPlans => Set<SubscriptionPlan>();
    public DbSet<WalletLedgerEntry> WalletLedger => Set<WalletLedgerEntry>();
    public DbSet<PlatformRevenueEntry> PlatformRevenue => Set<PlatformRevenueEntry>();
    public DbSet<ChangelogEntry> Changelog => Set<ChangelogEntry>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<TrialExtension> TrialExtensions => Set<TrialExtension>();
    public DbSet<FirmApiKeys> FirmApiKeys => Set<FirmApiKeys>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    // Agent / reseller program (migration 48) — plain platform tables, NO firm RLS.
    public DbSet<Agent> Agents => Set<Agent>();
    public DbSet<AgentCommission> AgentCommissions => Set<AgentCommission>();
    public DbSet<AgentPayout> AgentPayouts => Set<AgentPayout>();

    // Core schema
    public DbSet<User> Users => Set<User>();
    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<UserBranchAccess> UserBranchAccess => Set<UserBranchAccess>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<UserPermissionOverride> UserPermissionOverrides => Set<UserPermissionOverride>();
    public DbSet<Contact> Contacts => Set<Contact>();

    // Accounting schema
    public DbSet<AccountHead> AccountHeads => Set<AccountHead>();
    public DbSet<AccountGroup> AccountGroups => Set<AccountGroup>();
    public DbSet<SubGroup> SubGroups => Set<SubGroup>();
    public DbSet<Ledger> Ledgers => Set<Ledger>();
    public DbSet<Voucher> Vouchers => Set<Voucher>();
    public DbSet<VoucherLine> VoucherLines => Set<VoucherLine>();

    // Core extras
    public DbSet<Transporter> Transporters => Set<Transporter>();

    // Trading schema
    public DbSet<PartyProfile> PartyProfiles => Set<PartyProfile>();
    public DbSet<Item> Items => Set<Item>();
    public DbSet<Bill> Bills => Set<Bill>();
    public DbSet<BillLine> BillLines => Set<BillLine>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Namokara.Api.Modules.Trading.Entities.ChequeHandover> ChequeHandovers => Set<Namokara.Api.Modules.Trading.Entities.ChequeHandover>();
    public DbSet<PaymentAllocation> PaymentAllocations => Set<PaymentAllocation>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<GoodsReturn> GoodsReturns => Set<GoodsReturn>();
    public DbSet<GoodsReturnLine> GoodsReturnLines => Set<GoodsReturnLine>();
    public DbSet<CommissionInvoice> CommissionInvoices => Set<CommissionInvoice>();
    public DbSet<CommissionInvoiceLine> CommissionInvoiceLines => Set<CommissionInvoiceLine>();
    public DbSet<Namokara.Api.Modules.Trading.Entities.BuyerAgent> BuyerAgents => Set<Namokara.Api.Modules.Trading.Entities.BuyerAgent>();
    public DbSet<Namokara.Api.Modules.Trading.Entities.BuyerAgentEarning> BuyerAgentEarnings => Set<Namokara.Api.Modules.Trading.Entities.BuyerAgentEarning>();
    public DbSet<Namokara.Api.Modules.Trading.Entities.BuyerAgentPayout> BuyerAgentPayouts => Set<Namokara.Api.Modules.Trading.Entities.BuyerAgentPayout>();

    // Suppliers schema
    public DbSet<SupplierCategory> SupplierCategories => Set<SupplierCategory>();
    public DbSet<SupplierProfile> SupplierProfiles => Set<SupplierProfile>();
    public DbSet<BuyerProfile> BuyerProfiles => Set<BuyerProfile>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<AppointmentStaff> AppointmentStaff => Set<AppointmentStaff>();
    public DbSet<SupplierPhoto> SupplierPhotos => Set<SupplierPhoto>();
    public DbSet<SupplierRate> SupplierRates => Set<SupplierRate>();
    // Buyer product catalog (Phase B) — demand + supply
    public DbSet<BuyerVariety> BuyerVarieties => Set<BuyerVariety>();
    public DbSet<BuyerVarietyRate> BuyerVarietyRates => Set<BuyerVarietyRate>();
    public DbSet<BuyerVarietyPhoto> BuyerVarietyPhotos => Set<BuyerVarietyPhoto>();

    // AI schema
    public DbSet<AiExtractionLog> AiExtractionLogs => Set<AiExtractionLog>();
    public DbSet<AiCacheEntry> AiCache => Set<AiCacheEntry>();

    // HR schema
    public DbSet<AttendancePolicy> AttendancePolicies => Set<AttendancePolicy>();
    public DbSet<Holiday> Holidays => Set<Holiday>();
    public DbSet<SalaryStructure> SalaryStructures => Set<SalaryStructure>();
    public DbSet<EmployeeProfile> EmployeeProfiles => Set<EmployeeProfile>();
    public DbSet<AttendanceLog> AttendanceLogs => Set<AttendanceLog>();
    public DbSet<LocationTrail> LocationTrails => Set<LocationTrail>();
    public DbSet<Selfie> Selfies => Set<Selfie>();
    public DbSet<LeaveBalance> LeaveBalances => Set<LeaveBalance>();
    public DbSet<LeaveRequest> LeaveRequests => Set<LeaveRequest>();
    public DbSet<PayrollRecord> PayrollRecords => Set<PayrollRecord>();

    // Online Dukan schema (per-firm e-commerce)
    public DbSet<DukanSettings> DukanSettings => Set<DukanSettings>();
    public DbSet<DukanCategory> DukanCategories => Set<DukanCategory>();
    public DbSet<DukanProduct> DukanProducts => Set<DukanProduct>();
    public DbSet<DukanBuyer> DukanBuyers => Set<DukanBuyer>();
    public DbSet<DukanBuyerAddress> DukanBuyerAddresses => Set<DukanBuyerAddress>();
    public DbSet<DukanOrder> DukanOrders => Set<DukanOrder>();
    public DbSet<DukanOrderItem> DukanOrderItems => Set<DukanOrderItem>();
    public DbSet<DukanReview> DukanReviews => Set<DukanReview>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Platform
        modelBuilder.Entity<Firm>().ToTable("firms", "platform");
        modelBuilder.Entity<SubscriptionPlan>().ToTable("subscription_plans", "platform");
        modelBuilder.Entity<WalletLedgerEntry>().ToTable("wallet_ledger", "platform");
        modelBuilder.Entity<PlatformRevenueEntry>(e =>
        {
            e.ToTable("platform_revenue", "platform");
            // margin_inr DB me GENERATED ALWAYS hai — EF isse INSERT/UPDATE me na bheje
            e.Property(x => x.MarginInr).HasComputedColumnSql("gross_inr - cost_inr", stored: true);
        });
        modelBuilder.Entity<ChangelogEntry>().ToTable("changelog", "platform");

        // Core
        modelBuilder.Entity<User>().ToTable("users", "core");
        modelBuilder.Entity<Branch>().ToTable("branches", "core");
        modelBuilder.Entity<Transporter>().ToTable("transporters", "core");
        modelBuilder.Entity<Department>().ToTable("departments", "core");
        modelBuilder.Entity<UserBranchAccess>(e =>
        {
            e.ToTable("user_branch_access", "core");
            e.HasKey(x => new { x.UserId, x.BranchId });
        });
        modelBuilder.Entity<Session>().ToTable("sessions", "core");
        modelBuilder.Entity<Role>().ToTable("roles", "core");
        modelBuilder.Entity<Permission>().ToTable("permissions", "core");
        modelBuilder.Entity<RolePermission>(e =>
        {
            e.ToTable("role_permissions", "core");
            e.HasKey(x => new { x.RoleId, x.PermissionId });
        });
        modelBuilder.Entity<UserRole>(e =>
        {
            e.ToTable("user_roles", "core");
            e.HasKey(x => new { x.UserId, x.RoleId });
        });
        modelBuilder.Entity<UserPermissionOverride>(e =>
        {
            e.ToTable("user_permission_overrides", "core");
            e.HasKey(x => new { x.UserId, x.PermissionId });
        });
        modelBuilder.Entity<Contact>().ToTable("contacts", "core");

        // Accounting
        modelBuilder.Entity<AccountHead>().ToTable("account_heads", "accounting");
        modelBuilder.Entity<AccountGroup>(e =>
        {
            e.ToTable("account_groups", "accounting");
            e.HasOne(x => x.Head).WithMany().HasForeignKey(x => x.HeadId);
        });
        modelBuilder.Entity<SubGroup>(e =>
        {
            e.ToTable("sub_groups", "accounting");
            e.HasOne(x => x.Group).WithMany().HasForeignKey(x => x.GroupId);
        });
        modelBuilder.Entity<Ledger>(e =>
        {
            e.ToTable("ledgers", "accounting");
            e.HasOne(x => x.SubGroup).WithMany().HasForeignKey(x => x.SubGroupId);
        });
        modelBuilder.Entity<Voucher>(e =>
        {
            e.ToTable("vouchers", "accounting");
            e.HasMany(x => x.Lines).WithOne(l => l.Voucher!).HasForeignKey(l => l.VoucherId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(v => v.DeletedAt == null);
        });
        modelBuilder.Entity<VoucherLine>(e =>
        {
            e.ToTable("voucher_lines", "accounting");
            e.HasOne(x => x.Ledger).WithMany().HasForeignKey(x => x.LedgerId);
        });

        // Trading
        modelBuilder.Entity<PartyProfile>().ToTable("party_profiles", "trading");
        modelBuilder.Entity<Item>().ToTable("items", "trading");
        modelBuilder.Entity<Order>(e =>
        {
            e.ToTable("orders", "trading");
            e.HasMany(x => x.Lines).WithOne(l => l.Order!).HasForeignKey(l => l.OrderId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(o => o.DeletedAt == null);
        });
        modelBuilder.Entity<OrderLine>().ToTable("order_lines", "trading");
        modelBuilder.Entity<GoodsReturn>(e =>
        {
            e.ToTable("goods_returns", "trading");
            e.HasMany(x => x.Lines).WithOne(l => l.GoodsReturn!).HasForeignKey(l => l.GoodsReturnId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(g => g.DeletedAt == null);
        });
        modelBuilder.Entity<GoodsReturnLine>().ToTable("goods_return_lines", "trading");
        modelBuilder.Entity<CommissionInvoice>().ToTable("commission_invoices", "trading");
        modelBuilder.Entity<CommissionInvoiceLine>().ToTable("commission_invoice_lines", "trading");
        modelBuilder.Entity<Bill>(e =>
        {
            e.ToTable("bills", "trading");
            e.HasMany(x => x.Lines).WithOne(l => l.Bill!).HasForeignKey(l => l.BillId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(b => b.DeletedAt == null);
        });
        modelBuilder.Entity<BillLine>().ToTable("bill_lines", "trading");
        modelBuilder.Entity<Payment>(e =>
        {
            e.ToTable("payments", "trading");
            e.HasMany(x => x.Allocations).WithOne().HasForeignKey(a => a.PaymentId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(p => p.DeletedAt == null);
        });
        modelBuilder.Entity<PaymentAllocation>(e =>
        {
            e.ToTable("payment_allocations", "trading");
            e.HasKey(x => new { x.PaymentId, x.BillId });
        });

        // Suppliers
        modelBuilder.Entity<SupplierCategory>().ToTable("categories", "suppliers");
        modelBuilder.Entity<SupplierProfile>().ToTable("supplier_profiles", "suppliers");
        modelBuilder.Entity<BuyerProfile>().ToTable("buyer_profiles", "suppliers");
        modelBuilder.Entity<Appointment>().ToTable("appointments", "suppliers");
        modelBuilder.Entity<AppointmentStaff>().ToTable("appointment_staff", "suppliers");
        modelBuilder.Entity<SupplierPhoto>().ToTable("photos", "suppliers");
        modelBuilder.Entity<SupplierRate>().ToTable("rates", "suppliers");
        // Buyer product catalog (Phase B) — migration 49 tables
        modelBuilder.Entity<BuyerVariety>().ToTable("buyer_varieties", "suppliers");
        modelBuilder.Entity<BuyerVarietyRate>().ToTable("buyer_variety_rates", "suppliers");
        modelBuilder.Entity<BuyerVarietyPhoto>().ToTable("buyer_variety_photos", "suppliers");

        // AI
        modelBuilder.Entity<AiExtractionLog>().ToTable("extraction_logs", "ai");
        modelBuilder.Entity<AiCacheEntry>().ToTable("cache", "ai");

        // HR
        modelBuilder.Entity<AttendancePolicy>().ToTable("attendance_policies", "hr");
        modelBuilder.Entity<Holiday>().ToTable("holidays", "hr");
        modelBuilder.Entity<SalaryStructure>().ToTable("salary_structures", "hr");
        modelBuilder.Entity<EmployeeProfile>().ToTable("employee_profiles", "hr");
        modelBuilder.Entity<AttendanceLog>().ToTable("attendance_logs", "hr");
        modelBuilder.Entity<LocationTrail>(e =>
        {
            e.ToTable("location_trails", "hr");
            e.HasKey(x => new { x.Id, x.CapturedAt });
        });
        modelBuilder.Entity<Selfie>().ToTable("selfies", "hr");
        modelBuilder.Entity<LeaveBalance>(e =>
        {
            e.ToTable("leave_balances", "hr");
            e.HasKey(x => new { x.EmployeeId, x.Year, x.LeaveType });
            // available DB me GENERATED ALWAYS (total_allocated - used) hai — EF isse
            // INSERT/UPDATE me na bheje warna 428C9 crash (employee-add + leave-approve).
            e.Property(x => x.Available).HasComputedColumnSql("total_allocated - used", stored: true);
        });
        modelBuilder.Entity<LeaveRequest>().ToTable("leave_requests", "hr");
        modelBuilder.Entity<PayrollRecord>().ToTable("payroll_records", "hr");

        // Online Dukan
        modelBuilder.Entity<DukanSettings>(e =>
        {
            e.ToTable("settings", "dukan");
            e.HasKey(x => x.FirmId);
            e.Property(x => x.FirmId).ValueGeneratedNever();   // firm_id is the PK, app-supplied
        });
        modelBuilder.Entity<DukanCategory>().ToTable("categories", "dukan");
        modelBuilder.Entity<DukanProduct>().ToTable("products", "dukan");
        modelBuilder.Entity<DukanBuyer>(e =>
        {
            e.ToTable("buyers", "dukan");
            e.HasMany(x => x.Addresses).WithOne(a => a.Buyer!).HasForeignKey(a => a.BuyerId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<DukanBuyerAddress>().ToTable("buyer_addresses", "dukan");
        modelBuilder.Entity<DukanOrder>(e =>
        {
            e.ToTable("orders", "dukan");
            e.HasMany(x => x.Items).WithOne(i => i.Order!).HasForeignKey(i => i.OrderId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<DukanOrderItem>().ToTable("order_items", "dukan");
        modelBuilder.Entity<DukanReview>(e =>
        {
            e.ToTable("reviews", "dukan");
            e.HasKey(x => new { x.FirmId, x.OrderId });
        });
    }
}
