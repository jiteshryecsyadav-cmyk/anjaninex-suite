# COA 4-head migration runner (ASCII-safe)
# Run:  cd "G:\Indian B2B SaaS platform"
#       powershell -ExecutionPolicy Bypass -File .\run-coa-migration.ps1

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sqlFile = Join-Path $here "db\init\18-coa-4head-migrate.sql"
$container = "namokara_postgres"
$usersToTry = @("postgres", "namokara", "namokara_app")
$dbsToTry   = @("namokara_prod", "namokara_dev", "namokara")

Write-Host ""
Write-Host "==> COA 4-head migration" -ForegroundColor Cyan

if (-not (Test-Path $sqlFile)) {
    Write-Host "ERROR: SQL file not found: $sqlFile" -ForegroundColor Red
    exit 1
}

function Find-Exe($name, $candidates) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

$docker = Find-Exe "docker" @(
    "C:\Program Files\Docker\Docker\resources\bin\docker.exe",
    "C:\ProgramData\DockerDesktop\version-bin\docker.exe"
)

$psql = Find-Exe "psql" @(
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe",
    "C:\Program Files\PostgreSQL\13\bin\psql.exe"
)

Write-Host ("docker: " + $(if ($docker) { $docker } else { "NOT FOUND" }))
Write-Host ("psql:   " + $(if ($psql)   { $psql }   else { "NOT FOUND" }))

# ---- PATH 1: docker ----
if ($docker) {
    $running = & $docker ps --filter "name=$container" --format "{{.Names}}" 2>$null
    if ($running) {
        foreach ($u in $usersToTry) {
            foreach ($d in $dbsToTry) {
                & $docker exec $container psql -U $u -d $d -c "SELECT 1;" 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "Using docker | user=$u db=$d" -ForegroundColor Green
                    Get-Content $sqlFile -Raw | & $docker exec -i $container psql -U $u -d $d -v ON_ERROR_STOP=1
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "DONE. Restart API (dotnet run) + Ctrl+Shift+R." -ForegroundColor Green
                        exit 0
                    }
                }
            }
        }
    }
    Write-Host "docker route did not work, trying psql..." -ForegroundColor Yellow
}

# ---- PATH 2: psql on localhost:6432 ----
if ($psql) {
    if (-not $env:PGPASSWORD) {
        $env:PGPASSWORD = Read-Host "DB password (namokara_app)"
    }
    foreach ($d in $dbsToTry) {
        & $psql -h localhost -p 6432 -U namokara_app -d $d -c "SELECT 1;" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Using psql | db=$d" -ForegroundColor Green
            & $psql -h localhost -p 6432 -U namokara_app -d $d -v ON_ERROR_STOP=1 -f $sqlFile
            if ($LASTEXITCODE -eq 0) {
                Write-Host "DONE. Restart API (dotnet run) + Ctrl+Shift+R." -ForegroundColor Green
                exit 0
            }
        }
    }
}

Write-Host "Could not run migration automatically." -ForegroundColor Red
Write-Host "Batao Postgres kaise chalta hai (Docker Desktop / native install) - main exact command de dunga." -ForegroundColor Yellow
exit 1
