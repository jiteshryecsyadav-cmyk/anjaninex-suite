using Microsoft.Extensions.Hosting;

namespace Namokara.Api.Modules.Platform.Services;

/// <summary>
/// Runs <see cref="ISubscriptionService.RunDailyLifecycleAsync"/> every 6 hours
/// (so 7/3/1 day notifications fire promptly, and grace-period suspend is timely).
/// Production: replace with Hangfire RecurringJob for distributed scheduling.
/// </summary>
public class SubscriptionLifecycleHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SubscriptionLifecycleHostedService> _log;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    public SubscriptionLifecycleHostedService(
        IServiceScopeFactory scopeFactory,
        ILogger<SubscriptionLifecycleHostedService> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("📅 SubscriptionLifecycle service started — runs every {Hours}h", Interval.TotalHours);

        // Wait 30s after boot so DB connections are ready
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (TaskCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var svc = scope.ServiceProvider.GetRequiredService<ISubscriptionService>();
                var result = await svc.RunDailyLifecycleAsync(stoppingToken);
                _log.LogInformation(
                    "Lifecycle run: scanned={Scanned}, notif7d={N7}, notif3d={N3}, notif1d={N1}, →grace={Grace}, suspended={Susp}, errors={Err}",
                    result.FirmsScanned, result.Notifications7d, result.Notifications3d,
                    result.Notifications1d, result.MovedToGrace, result.Suspended, result.Errors);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Subscription lifecycle job crashed — will retry next interval");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (TaskCanceledException) { break; }
        }

        _log.LogInformation("📅 SubscriptionLifecycle service stopped");
    }
}
