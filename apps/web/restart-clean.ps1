# ===================================================================
# Clean restart script for ng serve
# Kills all node processes, clears caches, restarts fresh
# ===================================================================

Write-Host "[1/6] Killing all node.exe processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "[2/6] Verifying no node processes remain..." -ForegroundColor Yellow
$remaining = Get-Process node -ErrorAction SilentlyContinue
if ($remaining) {
    Write-Host "  WARNING: Some node processes still running:" -ForegroundColor Red
    $remaining | Format-Table Id, ProcessName
} else {
    Write-Host "  OK: No node processes running" -ForegroundColor Green
}

Write-Host "[3/6] Removing .angular cache..." -ForegroundColor Yellow
Remove-Item -Recurse -Force ".angular" -ErrorAction SilentlyContinue
Write-Host "  Done" -ForegroundColor Green

Write-Host "[4/6] Removing node_modules\.cache..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "node_modules\.cache" -ErrorAction SilentlyContinue
Write-Host "  Done" -ForegroundColor Green

Write-Host "[5/6] Removing dist..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
Write-Host "  Done" -ForegroundColor Green

Write-Host "[6/6] Sanity check - verifying anjaninex-dashboard.component.ts has correct @if pattern..." -ForegroundColor Yellow
$check = Select-String -Path "src\app\modules\admin\pages\anjaninex-dashboard.component.ts" -Pattern "@if \(kpi\(\); as k\)"
if ($check) {
    Write-Host "  OK: $($check.Line.Trim())" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Pattern not found - file may have been reverted!" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== ALL CACHES CLEARED. Starting npm start... ===" -ForegroundColor Cyan
Write-Host ""

npm start
