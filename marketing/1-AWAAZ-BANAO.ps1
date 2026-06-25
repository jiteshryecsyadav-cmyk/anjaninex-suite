# ============================================================
#  Anjaninex Walkthrough — AWAAZ (voiceover) banane wala script
#  Bas is file pe RIGHT-CLICK -> "Run with PowerShell"
#  (ya PowerShell me:  .\1-AWAAZ-BANAO.ps1 )
#  Sarvam key puchega -> paste karo -> Enter. Bas.
# ============================================================

$ErrorActionPreference = "Stop"

# 1) Hamesha marketing folder me chalo
Set-Location "G:\Indian B2B SaaS platform\marketing"
Write-Host ""
Write-Host "==== Anjaninex Awaaz Generator ====" -ForegroundColor Cyan
Write-Host "Folder: $(Get-Location)" -ForegroundColor DarkGray
Write-Host ""

# 2) Sarvam key — agar set nahi hai to abhi pucho (chat me kabhi mat daalo)
if (-not $env:SARVAM_API_KEY) {
    $env:SARVAM_API_KEY = Read-Host "Apni SARVAM API key yahan paste karo aur Enter dabao"
}
if (-not $env:SARVAM_API_KEY) {
    Write-Host "Key nahi mili. Dobara chalao." -ForegroundColor Red
    Read-Host "Band karne ke liye Enter"
    exit 1
}

# 3) Python dhoondo (python ya py dono try)
$py = $null
foreach ($c in @("python","py")) {
    try { & $c --version *> $null; if ($LASTEXITCODE -eq 0) { $py = $c; break } } catch {}
}
if (-not $py) {
    Write-Host "Python nahi mila. Pehle Python install karo (python.org)." -ForegroundColor Red
    Read-Host "Band karne ke liye Enter"
    exit 1
}
Write-Host "Python mila: $py" -ForegroundColor Green
Write-Host ""

# 3b) Purani awaaz hata do (taaki koi stale slide na bache)
Remove-Item "voiceover\female\slide-*.wav" -ErrorAction SilentlyContinue
Remove-Item "voiceover\male\slide-*.wav"   -ErrorAction SilentlyContinue

# 4) Awaaz banao (female + male, dono)
Write-Host "Awaaz ban rahi hai... (female + male, 20-20 file)" -ForegroundColor Yellow
& $py make-voiceover.py

# 5) Kitni file bani — gin ke dikhao
Write-Host ""
$f = (Get-ChildItem "voiceover\female\slide-*.wav" -ErrorAction SilentlyContinue).Count
$m = (Get-ChildItem "voiceover\male\slide-*.wav"   -ErrorAction SilentlyContinue).Count
Write-Host "==== HO GAYA ====" -ForegroundColor Cyan
Write-Host "Female files: $f" -ForegroundColor Green
Write-Host "Male   files: $m" -ForegroundColor Green
Write-Host ""
Write-Host "Ab Claude ko bolo: 'ho gaya' — main dono video bana dunga." -ForegroundColor White
Read-Host "Band karne ke liye Enter"
