# ===================================================================
# NUCLEAR RESTART - guaranteed clean ng serve
# ===================================================================

$ErrorActionPreference = "Continue"
Set-Location "G:\Indian B2B SaaS platform\apps\web"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " STEP 1/8: Listing all node.exe processes" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
$procs = Get-Process node -EA SilentlyContinue
if ($procs) {
    $procs | Format-Table Id, ProcessName, StartTime
} else {
    Write-Host "  No node processes running."
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " STEP 2/8: Killing ALL node.exe processes" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Get-Process node -EA SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
$still = Get-Process node -EA SilentlyContinue
if ($still) {
    Write-Host "  STILL RUNNING (force kill again)" -ForegroundColor Red
    $still | Stop-Process -Force
    Start-Sleep -Seconds 2
} else {
    Write-Host "  All node processes killed." -ForegroundColor Green
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " STEP 3/8: Deleting .angular cache folder" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
if (Test-Path ".angular") {
    Remove-Item -Recurse -Force ".angular"
    if (Test-Path ".angular") {
        Write-Host "  WARNING: Could not delete .angular!" -ForegroundColor Red
    } else {
        Write-Host "  Deleted .angular successfully." -ForegroundColor Green
    }
} else {
    Write-Host "  .angular does not exist."
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " STEP 4/8: Deleting node_modules\.cache" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
if (Test-Path "node_modules\.cache") {
    Remove-Item -Recurse -Force "node_modules\.cache"
    Write-Host "  Deleted." -ForegroundColor Green
} else {
    Write-Host "  Doesn't exist."
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " STEP 5/8: Deleting dist folder" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "  Deleted." -ForegroundColor Green
} else {
    Write-Host "  Doesn't exist."
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " STEP 6/8: Verifying tsconfig.json content" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
$content = Get-Content "tsconfig.json"
$lineNum = 0
foreach ($line in $content) {
    $lineNum++
    if ($lineNum -ge 19 -and $lineNum -le 26) {
        Write-Host ("  Line {0,2}: {1}" -f $lineNum, $line)
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " STEP 7/8: Verifying anjaninex-dashboard.component.ts" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
$content = Get-Content "src\app\modules\admin\pages\anjaninex-dashboard.component.ts"
$lineNum = 0
foreach ($line in $content) {
    $lineNum++
    if ($lineNum -ge 40 -and $lineNum -le 45) {
        Write-Host ("  Line {0,2}: {1}" -f $lineNum, $line)
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " STEP 8/8: Starting fresh npm start (60+ sec)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
npm start
