// ============================================================================
// Namokara Suite — .NET Core 8 API
// Built by Anjaninex
// ============================================================================

using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Namokara.Api.Common.Auth;
using Namokara.Api.Common.Middleware;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Core.Services;
using Namokara.Api.Modules.Platform.Services;
using Serilog;
using Serilog.Formatting.Compact;

// ---------------- Bootstrap Serilog ----------------
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console(new CompactJsonFormatter())
    .CreateBootstrapLogger();

try
{
    Log.Information("Starting Anjaninex Suite API v{Version}", "1.0.0");

    var builder = WebApplication.CreateBuilder(args);

    // ---------------- Configuration ----------------
    builder.Configuration
        .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
        .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
        .AddEnvironmentVariables(prefix: "NAMOKARA_");

    // ---------------- Logging ----------------
    builder.Host.UseSerilog((ctx, sp, config) => config
        .ReadFrom.Configuration(ctx.Configuration)
        .ReadFrom.Services(sp)
        .Enrich.FromLogContext()
        .Enrich.WithProperty("Application", "Namokara.Api")
        .Enrich.WithProperty("Version", "1.0.0"));

    // ---------------- Database ----------------
    // P0-7: HttpContextAccessor + TenantConnectionInterceptor required for RLS.
    builder.Services.AddHttpContextAccessor();
    builder.Services.AddSingleton<Namokara.Api.Infrastructure.Persistence.TenantConnectionInterceptor>();
    builder.Services.AddSingleton<Namokara.Api.Infrastructure.Persistence.AuditSaveChangesInterceptor>();

    builder.Services.AddDbContext<AppDbContext>((sp, opts) => opts
        .UseNpgsql(
            builder.Configuration.GetConnectionString("Postgres"),
            npg => npg
                .MigrationsHistoryTable("__ef_migrations_history", "core"))
        // NOTE: EnableRetryOnFailure() removed — it conflicts with our many user-initiated
        // transactions (PartyService, WalletService, BillService, VoucherService, etc.).
        // For production cloud deployments we should either:
        //   (a) wrap every BeginTransactionAsync in db.Database.CreateExecutionStrategy().ExecuteAsync(...)
        //   (b) accept native Npgsql retries via connection string Keepalive + Pool config
        .AddInterceptors(
            sp.GetRequiredService<Namokara.Api.Infrastructure.Persistence.TenantConnectionInterceptor>(),
            sp.GetRequiredService<Namokara.Api.Infrastructure.Persistence.AuditSaveChangesInterceptor>())
        .UseSnakeCaseNamingConvention()
        .EnableSensitiveDataLogging(builder.Environment.IsDevelopment()));

    // ---------------- Cache ----------------
    // In Development: use in-memory cache (no Redis required).
    // In Production: use Redis for distributed cache across instances.
    if (builder.Environment.IsDevelopment())
    {
        builder.Services.AddDistributedMemoryCache();
    }
    else
    {
        builder.Services.AddStackExchangeRedisCache(opts =>
        {
            opts.Configuration = builder.Configuration["Redis:ConnectionString"];
            opts.InstanceName = builder.Configuration["Redis:InstanceName"];
        });
    }

    // ---------------- JWT Authentication (P0-12 hardened) ----------------
    var jwtKey = builder.Configuration["Jwt:Key"]
        ?? throw new InvalidOperationException("Jwt:Key not configured");
    var jwtIssuer = builder.Configuration["Jwt:Issuer"]!;
    var jwtAudience = builder.Configuration["Jwt:Audience"]!;

    // SECURITY: fail-fast on weak / placeholder keys in production
    if (!builder.Environment.IsDevelopment())
    {
        if (jwtKey.Length < 64)
            throw new InvalidOperationException(
                $"Jwt:Key must be at least 64 chars in non-Development environments (got {jwtKey.Length}).");
        if (jwtKey.Contains("dev_only") || jwtKey.Contains("PLEASE-OVERRIDE")
            || jwtKey.Contains("change_me") || jwtKey.StartsWith("${"))
            throw new InvalidOperationException(
                "Jwt:Key looks like a placeholder. Set NAMOKARA_JWT_KEY env var to a real 64+ byte secret.");
    }

    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(opts =>
        {
            opts.SaveToken = true;
            opts.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwtIssuer,
                ValidAudience = jwtAudience,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
                ClockSkew = TimeSpan.FromMinutes(1),
                // P0-12: whitelist only HS256 — prevents algorithm-confusion attacks
                ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 }
            };

            // Reject tokens for suspended firms or revoked sessions at every request
            opts.Events = new JwtBearerEvents
            {
                OnTokenValidated = async ctx =>
                {
                    var firmId = ctx.Principal?.FindFirst("firm_id")?.Value;
                    var userId = ctx.Principal?.FindFirst("user_id")?.Value
                                ?? ctx.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                    if (userId == null) { ctx.Fail("Missing user claim"); return; }

                    // SUPER ADMIN (Anjaninex) ki koi firm nahi hoti — firm checks skip.
                    // (Pehle yahan firm_id na hone par har request reject ho jati thi →
                    //  super admin ko har call par 401 milta tha = login flash/bounce bug.)
                    var isSuperAdmin = ctx.Principal?.IsInRole("super_admin") == true
                                    || ctx.Principal?.IsInRole("SUPER_ADMIN") == true;
                    // Reseller/agent login: koi firm nahi hoti (agent_id claim present).
                    // Firm checks skip — agent self endpoints (/api/agent/*) ko authorize hone do.
                    var isAgent = ctx.Principal?.FindFirst("agent_id")?.Value != null;
                    if (firmId == null)
                    {
                        if (isSuperAdmin) return;   // platform admin — full access, no firm needed
                        if (isAgent) return;        // agent — no firm; self endpoints allowed
                        ctx.Fail("Missing tenant claim");
                        return;
                    }

                    var db = ctx.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                    var firm = await db.Set<Namokara.Api.Modules.Platform.Entities.Firm>()
                        .Where(f => f.Id == Guid.Parse(firmId))
                        .Select(f => new { f.Status, f.GraceUntil })
                        .FirstOrDefaultAsync();

                    if (firm == null) { ctx.Fail("Firm not found"); return; }

                    // Allow auth/wallet/subscription endpoints even when suspended (so user can renew)
                    var path = ctx.HttpContext.Request.Path.Value ?? "";
                    var alwaysAllowed = path.StartsWith("/api/auth")
                                     || path.StartsWith("/api/wallet")
                                     || path.StartsWith("/api/subscription")
                                     || path.StartsWith("/api/notifications");

                    // Allow trial, active, grace_period to use everything
                    if (firm.Status is "trial" or "active" or "grace_period")
                    {
                        // OK — full access (frontend will show banner for trial/grace)
                    }
                    else if (firm.Status == "suspended" && !alwaysAllowed)
                    {
                        // Suspended firm: only allow wallet / auth / subscription endpoints
                        ctx.Response.StatusCode = StatusCodes.Status402PaymentRequired;
                        ctx.Response.Headers["X-Firm-Status"] = "suspended";
                        ctx.Fail($"Firm suspended — renew subscription to restore access");
                    }
                    else if (firm.Status is "cancelled" or "low_wallet")
                    {
                        ctx.Fail($"Firm status: {firm.Status}");
                    }
                }
            };
        });

    builder.Services.AddAuthorization();
    builder.Services.AddPermissionAuthorization();
    builder.Services.AddModuleAccessAuthorization();   // composite provider — handles BOTH perm: + mod: policies

    // ---------------- P0-11: Rate limiting ----------------
    builder.Services.AddRateLimiter(opts =>
    {
        opts.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        opts.OnRejected = async (ctx, ct) =>
        {
            ctx.HttpContext.Response.Headers.RetryAfter = "60";
            await ctx.HttpContext.Response.WriteAsJsonAsync(
                new { error = "rate_limited", message = "Too many requests. Try again in 60 seconds." }, ct);
        };

        // /api/auth/login + /api/auth/refresh — strict per-IP
        opts.AddPolicy("auth", httpContext =>
            System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "anon",
                factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                {
                    // 5 bahut strict tha — SPA ka har page-load /auth/refresh call karta hai,
                    // isliye legit users hi lock ho jate the. 20/min per IP ab bhi brute-force rokta hai.
                    PermitLimit = 20,
                    Window = TimeSpan.FromMinutes(1),
                    QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst,
                    QueueLimit = 0
                }));

        // /api/ai/* — per-firm (firm_id from claims when authenticated, else IP)
        opts.AddPolicy("ai", httpContext =>
            System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: httpContext.User.FindFirst("firm_id")?.Value
                              ?? httpContext.Connection.RemoteIpAddress?.ToString()
                              ?? "anon",
                factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                {
                    PermitLimit = 30,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));

        // Global fallback.
        // Logged-in: PER-USER budget (1200/min) — taaki ek office ke kai staff EK hi
        //   public IP (NAT) se kaam karein to bhi har user ka apna limit ho, galat 429
        //   na mile. Anonymous: PER-IP (600/min) — abuse/brute se bachav.
        opts.GlobalLimiter = System.Threading.RateLimiting.PartitionedRateLimiter.Create<HttpContext, string>(
            httpContext =>
            {
                var userId = httpContext.User.FindFirst("user_id")?.Value;
                if (!string.IsNullOrEmpty(userId))
                    return System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                        partitionKey: "user:" + userId,
                        factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                        {
                            PermitLimit = 1200,
                            Window = TimeSpan.FromMinutes(1),
                            QueueLimit = 0
                        });
                return System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: "ip:" + (httpContext.Connection.RemoteIpAddress?.ToString() ?? "anon"),
                    factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 600,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    });
            });
    });

    // ---------------- Application services ----------------
    builder.Services.AddScoped<IAuthService, AuthService>();
    builder.Services.AddScoped<IPermissionService, PermissionService>();
    builder.Services.AddScoped<IWalletService, WalletService>();
    builder.Services.AddScoped<ISubscriptionService, SubscriptionService>();
    builder.Services.AddHostedService<Namokara.Api.Modules.Platform.Services.SubscriptionLifecycleHostedService>();
    builder.Services.AddScoped<IChangelogService, ChangelogService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Platform.Services.IPlatformAdminService,
        Namokara.Api.Modules.Platform.Services.PlatformAdminService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Platform.Services.IAgentService,
        Namokara.Api.Modules.Platform.Services.AgentService>();

    // Accounting module
    builder.Services.AddScoped<Namokara.Api.Modules.Accounting.Services.IChartOfAccountsService,
        Namokara.Api.Modules.Accounting.Services.ChartOfAccountsService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Accounting.Services.IVoucherService,
        Namokara.Api.Modules.Accounting.Services.VoucherService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Accounting.Services.IReportsService,
        Namokara.Api.Modules.Accounting.Services.ReportsService>();

    // Trading module
    builder.Services.AddScoped<Namokara.Api.Modules.Trading.Services.IPartyService,
        Namokara.Api.Modules.Trading.Services.PartyService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Trading.Services.IItemService,
        Namokara.Api.Modules.Trading.Services.ItemService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Trading.Services.IBillService,
        Namokara.Api.Modules.Trading.Services.BillService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Trading.Services.IOrderService,
        Namokara.Api.Modules.Trading.Services.OrderService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Trading.Services.IGoodsReturnService,
        Namokara.Api.Modules.Trading.Services.GoodsReturnService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Trading.Services.IPaymentService,
        Namokara.Api.Modules.Trading.Services.PaymentService>();

    // Reports module
    builder.Services.AddScoped<Namokara.Api.Modules.Reports.Services.IReportsAggregateService,
        Namokara.Api.Modules.Reports.Services.ReportsAggregateService>();

    // Import & Migration module — bulk-import purana data (Tally/Busy/Marg/Excel)
    builder.Services.AddScoped<Namokara.Api.Modules.Migration.Services.IMigrationService,
        Namokara.Api.Modules.Migration.Services.MigrationService>();

    // Suppliers module
    builder.Services.AddScoped<Namokara.Api.Modules.Suppliers.Services.ISupplierService,
        Namokara.Api.Modules.Suppliers.Services.SupplierService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Suppliers.Services.IBuyerService,
        Namokara.Api.Modules.Suppliers.Services.BuyerService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Suppliers.Services.IAppointmentService,
        Namokara.Api.Modules.Suppliers.Services.AppointmentService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Suppliers.Services.IMatchService,
        Namokara.Api.Modules.Suppliers.Services.MatchService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Suppliers.Services.ISearchService,
        Namokara.Api.Modules.Suppliers.Services.SearchService>();

    // AI module
    builder.Services.Configure<Namokara.Api.Modules.Ai.Services.AiSettings>(
        builder.Configuration.GetSection("AI"));
    builder.Services.AddHttpClient("gemini", c =>
    {
        // Gemini vision calls on bill images regularly take 30-90s; 30s was too short
        // and caused "request canceled due to HttpClient.Timeout" → mock fallback.
        c.Timeout = TimeSpan.FromSeconds(120);
        c.DefaultRequestHeaders.Add("User-Agent", "Namokara/1.0");
    });
    builder.Services.AddScoped<Namokara.Api.Modules.Ai.Services.IBillExtractorService,
        Namokara.Api.Modules.Ai.Services.BillExtractorService>();

    // Sarvam AI — Anji ki natural Indian TTS (browser voice fallback ke saath).
    builder.Services.AddHttpClient("sarvam", c =>
    {
        c.Timeout = TimeSpan.FromSeconds(30);   // chote TTS chunks — 30s kaafi hai
        c.DefaultRequestHeaders.Add("User-Agent", "Namokara/1.0");
    });
    builder.Services.AddScoped<Namokara.Api.Modules.Ai.Services.ISarvamTtsService,
        Namokara.Api.Modules.Ai.Services.SarvamTtsService>();

    // Storage (MinIO)
    builder.Services.Configure<Namokara.Api.Infrastructure.Storage.StorageSettings>(
        builder.Configuration.GetSection("Storage"));
    builder.Services.AddSingleton<Namokara.Api.Infrastructure.Storage.IStorageService,
        Namokara.Api.Infrastructure.Storage.MinioStorageService>();

    // HR module
    builder.Services.AddScoped<Namokara.Api.Modules.Hr.Services.IEmployeeService,
        Namokara.Api.Modules.Hr.Services.EmployeeService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Hr.Services.IAttendanceService,
        Namokara.Api.Modules.Hr.Services.AttendanceService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Hr.Services.ILocationService,
        Namokara.Api.Modules.Hr.Services.LocationService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Hr.Services.ILeaveService,
        Namokara.Api.Modules.Hr.Services.LeaveService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Hr.Services.IPayrollService,
        Namokara.Api.Modules.Hr.Services.PayrollService>();
    builder.Services.AddScoped<Namokara.Api.Modules.Hr.Services.IHrDashboardService,
        Namokara.Api.Modules.Hr.Services.HrDashboardService>();

    // ---------------- CORS ----------------
    var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
        ?? new[] { "http://localhost:4200" };

    builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
        .WithOrigins(corsOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

    // ---------------- Controllers + Swagger ----------------
    builder.Services.AddControllers()
        .AddJsonOptions(o =>
        {
            o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
            o.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
        });

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "Namokara Suite API",
            Version = "v1",
            Description = "Multi-tenant B2B SaaS platform — Built by Anjaninex",
            Contact = new OpenApiContact { Name = "Anjaninex", Email = "support@anjaninex.com" }
        });
        c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Description = "JWT token. Format: Bearer {token}",
            Name = "Authorization",
            In = ParameterLocation.Header,
            Type = SecuritySchemeType.ApiKey,
            Scheme = "Bearer"
        });
        c.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
                },
                Array.Empty<string>()
            }
        });
    });

    // ---------------- Health checks ----------------
    var healthBuilder = builder.Services.AddHealthChecks()
        .AddNpgSql(builder.Configuration.GetConnectionString("Postgres")!, name: "postgres", tags: new[] { "ready" });
    // Only check Redis in non-Development environments
    if (!builder.Environment.IsDevelopment())
    {
        healthBuilder.AddRedis(builder.Configuration["Redis:ConnectionString"]!, name: "redis", tags: new[] { "ready" });
    }

    // ---------------- HttpContextAccessor ----------------
    builder.Services.AddHttpContextAccessor();

    // ---------------- Build app ----------------
    var app = builder.Build();

    // ---------------- Middleware pipeline (ORDER MATTERS) ----------------
    app.UseSerilogRequestLogging();

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI(c =>
        {
            c.SwaggerEndpoint("/swagger/v1/swagger.json", "Namokara Suite API v1");
            c.RoutePrefix = "swagger";
            c.DocumentTitle = "Namokara API — Powered by Anjaninex";
        });
    }

    // GLOBAL ERROR HANDLER — any uncaught exception anywhere in the app is caught
    // here and returned as a SIMPLE Hinglish message (never a raw stack trace / SQL
    // error). Covers every module: Bill, Order, Payment, Commission, Accounts, HR, etc.
    app.Use(async (ctx, next) =>
    {
        try
        {
            await next();
        }
        catch (Exception ex)
        {
            Serilog.Log.Error(ex, "Unhandled exception on {Path}", ctx.Request.Path);
            if (!ctx.Response.HasStarted)
            {
                ctx.Response.Clear();
                ctx.Response.StatusCode = 400;
                ctx.Response.ContentType = "application/json";
                var msg = Namokara.Api.Common.Errors.FriendlyError.From(ex);
                await ctx.Response.WriteAsJsonAsync(new { error = msg });
            }
        }
    });

    // Security headers (P1)
    app.Use(async (ctx, next) =>
    {
        ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
        ctx.Response.Headers["X-Frame-Options"] = "DENY";
        ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        ctx.Response.Headers["Permissions-Policy"] = "camera=(self), geolocation=(self), microphone=()";
        if (!app.Environment.IsDevelopment())
        {
            ctx.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            ctx.Response.Headers["Content-Security-Policy"] =
                "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:";
        }
        await next();
    });

    app.UseCors();
    // Load-test ke liye TEST instance par limiter band kar sakte ho:
    //   DISABLE_RATE_LIMIT=1 dotnet ... (sirf isolated test env me — PRODUCTION par NAHI)
    if (Environment.GetEnvironmentVariable("DISABLE_RATE_LIMIT") != "1")
        app.UseRateLimiter();         // P0-11 (production me hamesha ON)
    app.UseAuthentication();
    // P0-7: TenantContextMiddleware is now redundant — tenant context is set
    // by TenantConnectionInterceptor on the actual DB connection. Keeping no-op
    // for backwards compat with any code that reads HttpContext.Items["FirmId"].
    app.UseMiddleware<TenantContextMiddleware>();
    app.UseAuthorization();

    // ---------------- P0-RLS: hold ONE context-carrying DB connection per request ----------------
    // BUG (42501 "new row violates row-level security policy"): EF auto-closes the DB
    // connection between operations, and several hot code paths grab the RAW ADO connection
    // directly (ReserveCounterAsync in Order/Bill/GR/Commission/Payment/Voucher/Payroll,
    // WalletService, admin controllers, etc.) via:
    //     var conn = _db.Database.GetDbConnection();
    //     if (conn.State != Open) await conn.OpenAsync();   // <-- bypasses EF interceptor
    // A raw OpenAsync() does NOT fire TenantConnectionInterceptor, so app.current_firm_id
    // is never set on that connection → core.current_firm_id() returns NULL → every INSERT's
    // RLS WITH CHECK fails → document save (order/bill/voucher/...) breaks app-wide.
    //
    // Fix: at the start of every AUTHENTICATED request, open the EF connection ONCE (this
    // DOES fire the interceptor → tenant context is set) and keep it open for the whole
    // request. Now `conn.State == Open` is already true everywhere, so the raw paths reuse
    // the SAME context-carrying connection instead of opening a fresh context-less one.
    // RLS isolation is fully preserved — the context is simply now applied consistently.
    app.Use(async (ctx, next) =>
    {
        var firmId = ctx.User?.FindFirst("firm_id")?.Value;
        var isSuper = ctx.User?.IsInRole("super_admin") == true
                   || ctx.User?.IsInRole("SUPER_ADMIN") == true;

        if (ctx.User?.Identity?.IsAuthenticated == true && (!string.IsNullOrEmpty(firmId) || isSuper))
        {
            var branchId = ctx.User?.FindFirst("default_branch_id")?.Value
                        ?? ctx.Request.Headers["X-Branch-Id"].FirstOrDefault();

            var db = ctx.RequestServices.GetRequiredService<AppDbContext>();
            await db.Database.OpenConnectionAsync();
            try
            {
                // Set tenant context EXPLICITLY on this held-open connection. We do NOT rely
                // on TenantConnectionInterceptor here because OpenConnectionAsync() only fires
                // the interceptor on a *physical* open — if the connection was already opened
                // earlier in the request, the interceptor is skipped and context stays unset.
                // Setting it here guarantees app.current_firm_id is present for EVERY operation
                // on this connection, including raw GetDbConnection() paths (ReserveCounterAsync,
                // WalletService, admin controllers) that bypass EF's interceptor.
                var conn = db.Database.GetDbConnection();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText =
                        "SELECT set_config('app.current_firm_id', @f, false), " +
                        "set_config('app.current_branch_id', @b, false), " +
                        "set_config('app.is_platform_admin', @a, false);";
                    void Add(string n, string v)
                    {
                        var p = cmd.CreateParameter();
                        p.ParameterName = n;
                        p.Value = v;
                        cmd.Parameters.Add(p);
                    }
                    Add("@f", firmId ?? "");
                    Add("@b", branchId ?? "");
                    Add("@a", isSuper ? "true" : "false");
                    await cmd.ExecuteNonQueryAsync();
                }

                await next();
            }
            finally
            {
                await db.Database.CloseConnectionAsync();
            }
        }
        else
        {
            await next();
        }
    });

    app.MapControllers();

    // Health endpoints
    app.MapHealthChecks("/healthz");
    app.MapHealthChecks("/healthz/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
    {
        Predicate = r => r.Tags.Contains("ready")
    });
    app.MapHealthChecks("/healthz/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
    {
        Predicate = _ => false
    });

    // Root → swagger
    app.MapGet("/", () => Results.Redirect("/swagger"));

    Log.Information("Anjaninex Suite API ready on {Urls}", string.Join(", ", app.Urls));
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Namokara API terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

public partial class Program { }    // for integration tests
