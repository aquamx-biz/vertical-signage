# One-shot catch-up for the 39-by-sansiri box (100.102.67.15).
# Its Tailscale was down when the fleet got the Tailscale keep-alive config on
# 2026-10-08, and its panel brightness had reset to 25/255 after the OTA restart.
# Runs every 15 min (hidden) from Task Scheduler "AquaMX 39BS pending"; the first
# time adb gets through it applies both, logs the result, and deletes its own task.
$ip  = '100.102.67.15'
$log = Join-Path $PSScriptRoot 'health\apply-39bs-pending.log'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) { exit 0 }

$conn = & $adb connect "${ip}:5555" 2>&1 | Out-String
if ($conn -notmatch 'connected to') { exit 0 }   # still unreachable — try again next run

function Sh([string]$cmd) { (& $adb -s "${ip}:5555" shell $cmd 2>&1 | Out-String).Trim() }

Sh 'settings put secure always_on_vpn_app com.tailscale.ipn' | Out-Null
Sh 'settings put secure always_on_vpn_lockdown 0' | Out-Null          # never lockdown: VPN drop would kill the player's internet
Sh 'dumpsys deviceidle whitelist +com.tailscale.ipn' | Out-Null
Sh 'cmd appops set com.tailscale.ipn RUN_IN_BACKGROUND allow' | Out-Null
Sh 'cmd appops set com.tailscale.ipn RUN_ANY_IN_BACKGROUND allow' | Out-Null
Sh 'am set-standby-bucket com.tailscale.ipn active' | Out-Null
Sh "su 0 sh -c 'echo 102 > /sys/class/backlight/backlight/brightness'" | Out-Null
Sh 'settings put system screen_brightness 102' | Out-Null

$state = "always-on=$(Sh 'settings get secure always_on_vpn_app')/$(Sh 'settings get secure always_on_vpn_lockdown')" +
         " bucket=$(Sh 'am get-standby-bucket com.tailscale.ipn')" +
         " bl=$(Sh 'cat /sys/class/backlight/backlight/bl_power'):$(Sh 'cat /sys/class/backlight/backlight/brightness')" +
         " uptime=$([math]::Round([double]((Sh 'cat /proc/uptime') -split ' ')[0] / 3600, 1))h"
Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm') applied · $state" -Encoding utf8
Unregister-ScheduledTask -TaskName 'AquaMX 39BS pending' -Confirm:$false -ErrorAction SilentlyContinue
