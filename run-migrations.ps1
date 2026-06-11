# =============================================================================
# Namokara Suite — DB migrations runner (Buyer + Appointments)
# Bas is file par right-click -> "Run with PowerShell" — ya PowerShell me chalao:
#   cd "G:\Indian B2B SaaS platform"
#   powershell -ExecutionPolicy Bypass -File .\run-migrations.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$container = "namokara_postgres"
$db = "namokara_dev"

# Migrations to apply (in order)
$migrations = @(
    "db\init\22-buyer-profiles.sql",
    "db\init\23-appointments.sql"
)

# Try these DB users until one works (app uses 'postgres', compose default is 'namokara')
$usersToTry = @("postgres", "namokara")

Write-Host ""
Write-Host "==> Namokara DB migrations" -ForegroundColor Cyan

# 1. Is the postgres container running?
$running = docker ps --filter "name=$container" --format "{{.Names}}" 2>$null
if (-not $running) {
    Write-Host "ERROR: '$container' container chal nahi raha." -ForegroundColor Red
    Write-Host "Pehle DB start karo:  docker compose up -d postgres" -ForegroundColor Yellow
    exit 1
}
Write-Host "Container '$container' mil gaya." -ForegroundColor Green

# 2. Find a working DB user.
$dbUser = $null
foreach ($u in $usersToTry) {
    docker exec $container psql -U $u -d $db -c "SELECT 1;" *> $null
    if ($LASTEXITCODE -eq 0) { $dbUser = $u; break }
}
if (-not $dbUser) {
    Write-Host "ERROR: koi DB user kaam nahi kiya ($($usersToTry -join ', '))." -ForegroundColor Red
    Write-Host "Apna postgres user/password check karo (appsettings.Development.json)." -ForegroundColor Yellow
    exit 1
}
Write-Host "DB user: $dbUser" -ForegroundColor Green

# 3. Run each migration.
foreach ($m in $migrations) {
    $path = Join-Path $here $m
    if (-not (Test-Path $path)) {
        Write-Host "SKIP (file nahi mili): $m" -ForegroundColor Yellow
        continue
    }
    Write-Host ""
    Write-Host "--> Running $m ..." -ForegroundColor Cyan
    Get-Content $path -Raw | docker exec -i $container psql -U $dbUser -d $db -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $m" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK: $m" -ForegroundColor Green
}

Write-Host ""
Write-Host "==> Sab migrations ho gaye! Ab backend restart karo (dotnet run)." -ForegroundColor Green
Write-Host ""
