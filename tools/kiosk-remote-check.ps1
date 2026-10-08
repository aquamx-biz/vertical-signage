# -- AquaMX remote-reachability probe - Task Scheduler every 15 min -----------
# Answers one question per box: can this PC still reach it over Tailscale
# (ping) and adb? A box can play and beacon happily while its VPN is down
# (39-by-sansiri 2026-10-08), and nothing on the box can tell us - only the
# other end of the tunnel can. Posts ONE fleet snapshot to /api/kiosk-remote;
# the beacon feed shows it as remote=ok|down and fleet-health raises a LINE
# card when it stays down. Box list = the same table as kiosk-health.ps1.
# PowerShell 5.1. Manual run:  powershell -ExecutionPolicy Bypass -File kiosk-remote-check.ps1

$ErrorActionPreference = "Continue"
$Adb = "C:\Users\Lenovo\OneDrive - MBK Group\Documents\SDK-platform\platform-tools\adb.exe"

$Boxes = @(
    @{ Name = "noble-be19a";    Ip = "100.100.123.43"; HomeAppId = "AX-4RADKY" },
    @{ Name = "noble-be19b";    Ip = "100.87.197.15";  HomeAppId = "AX-TJTX8G" },
    @{ Name = "SD2603-001";     Ip = "100.71.132.15";  HomeAppId = "SD2603-001" },
    @{ Name = "lumpini-24";     Ip = "100.103.74.106"; HomeAppId = "AX-EKTYC4" },
    @{ Name = "the-room-skv21"; Ip = "100.109.31.88";  HomeAppId = "AX-8DW84X" },
    @{ Name = "mahogany-tower"; Ip = "100.123.35.91";  HomeAppId = "AX-RXWDNM" },
    @{ Name = "39-by-sansiri";  Ip = "100.102.67.15";  HomeAppId = "AX-AA5KNK" }
)

# If THIS PC is off the tailnet the answer is "unknown", not "every box is
# down" - skip the post rather than page the owner for our own VPN.
$self = (tailscale status --self --json 2>$null | ConvertFrom-Json)
if (-not $self -or -not $self.Self -or -not $self.Self.Online) {
    Write-Host "collector not online on tailscale - skipping"
    exit 0
}

$Results = @()
foreach ($Box in $Boxes) {
    $Ip = $Box.Ip; $Serial = "${Ip}:5555"
    $null = tailscale ping --c 1 --timeout 4s $Ip 2>$null
    $PingOk = ($LASTEXITCODE -eq 0)
    $AdbOk = $false
    # adb can succeed when ping does not (DERP relays) - probe it regardless.
    $null = & $Adb connect $Serial 2>$null
    $Probe = (& $Adb -s $Serial shell "echo alive" 2>$null) -join ""
    if ($Probe -match "alive") { $AdbOk = $true }
    $Results += @{ device = $Box.Name; homeappId = $Box.HomeAppId; ping = $PingOk; adb = $AdbOk }
    Write-Host ("{0,-16} ping={1} adb={2}" -f $Box.Name, $PingOk, $AdbOk)
}

$payload = @{ boxes = $Results } | ConvertTo-Json -Compress -Depth 4
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
try {
    Invoke-RestMethod -Uri 'https://app.aquamx.biz/api/kiosk-remote' -Method Post -ContentType 'application/json; charset=utf-8' -Body $bodyBytes -TimeoutSec 15 | Out-Null
    Write-Host "posted $($Results.Count) boxes"
} catch { Write-Warning "remote POST failed: $_" }
