# -- AquaMX "ตรวจผ่าน VPN" worker - Task Scheduler every 2 min, hidden ----------
# The LINE fleet card has a 🩺 button. Pressing it queues a diagnosis request on
# the server; this script (the only machine on the tailnet with adb) picks it up,
# probes the box over Tailscale + adb, applies the SAFE fixes we have used by hand
# all of Sept/Oct 2026, takes a screenshot, and posts the result back - the server
# turns it into a result card in the admin group.
#
# Contract (server side lives in aquamx-handoff, homeapp session):
#   GET  /api/kiosk-diag/pending  -> { pending: [ {docId, deviceId, label, requestedAt, requestedBy} ] }
#                                    (claim-on-read: returned items are already 'running')
#   POST /api/kiosk-diag/result   <- { docId, deviceId, reachable, ok, summary, findings[], fixes[], screenshot? }
#   both with header x-diag-key = HKCU\Environment KIOSK_DIAG_KEY
#
# Never touches: player/WebView content, Tailscale itself, the screen schedule, OTA.
# Fixes only run inside the box's on-hours (a dark screen at night is the schedule).
# PowerShell 5.1. Manual run:  powershell -ExecutionPolicy Bypass -File kiosk-diag.ps1
# Dry run against one box (no server):  ... -File kiosk-diag.ps1 -Probe AX-EKTYC4

param([string]$Probe = '')

$ErrorActionPreference = 'Continue'
$Api   = 'https://app.aquamx.biz/api/kiosk-diag'
$LogF  = Join-Path $PSScriptRoot 'health\kiosk-diag.log'
New-Item -ItemType Directory -Force (Split-Path $LogF) | Out-Null
function Log([string]$m) { Add-Content -Path $LogF -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" -Encoding utf8 }

# Same table as kiosk-remote-check.ps1 / kiosk-health.ps1 (HomeApp device id -> tailnet IP).
$Boxes = @{
    'AX-4RADKY'  = @{ Name = 'noble-be19a';    Ip = '100.100.123.43' }
    'AX-TJTX8G'  = @{ Name = 'noble-be19b';    Ip = '100.87.197.15'  }
    'SD2603-001' = @{ Name = 'SD2603-001';     Ip = '100.71.132.15'  }
    'AX-EKTYC4'  = @{ Name = 'lumpini-24';     Ip = '100.103.74.106' }
    'AX-8DW84X'  = @{ Name = 'the-room-skv21'; Ip = '100.109.31.88'  }
    'AX-RXWDNM'  = @{ Name = 'mahogany-tower'; Ip = '100.123.35.91'  }
    'AX-AA5KNK'  = @{ Name = '39-by-sansiri';  Ip = '100.102.67.15'  }
}

$Adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
$Ts  = (Get-Command tailscale -ErrorAction SilentlyContinue).Source

function Sh([string]$serial, [string]$cmd) {
    $out = & $Adb -s $serial shell $cmd 2>&1 | Out-String
    return $out.Trim()
}
function ShRoot([string]$serial, [string]$cmd) { Sh $serial ("su 0 sh -c '" + $cmd + "'") }

function Parse-Hm([string]$s) {
    if ($s -match '^\s*(\d{1,2}):(\d{2})\s*$') { return [int]$matches[1] * 60 + [int]$matches[2] }
    return $null
}
function In-OnHours($on, $off) {
    if ($null -eq $on -or $null -eq $off -or $on -eq $off) { return $true }   # no schedule = always on
    $now = (Get-Date).Hour * 60 + (Get-Date).Minute
    if ($on -lt $off) { return ($now -ge $on -and $now -lt $off) }
    return ($now -ge $on -or $now -lt $off)
}

function Get-State([string]$serial) {
    $s = @{}
    $s.uptimeH   = try { [math]::Round([double]((Sh $serial 'cat /proc/uptime') -split ' ')[0] / 3600, 1) } catch { $null }
    $s.boot      = Sh $serial 'getprop sys.boot.reason'
    $pw          = Sh $serial 'dumpsys power'
    $s.wake      = if ($pw -match 'mWakefulness=(\w+)') { $matches[1] } else { '?' }
    $s.blPower   = ShRoot $serial 'cat /sys/class/backlight/backlight/bl_power'
    $s.bright    = ShRoot $serial 'cat /sys/class/backlight/backlight/brightness'
    $s.pid       = Sh $serial 'pidof biz.aquamx.homeapp'
    $pk          = Sh $serial 'dumpsys package biz.aquamx.homeapp'
    $s.version   = if ($pk -match 'versionName=(\S+)') { $matches[1] } else { '?' }
    $win         = Sh $serial 'dumpsys window'
    $s.focus     = if ($win -match 'mCurrentFocus=Window\{\S+ u0 ([^\s/}]+)') { $matches[1] } else { '' }
    $s.home      = ((Sh $serial 'cmd package resolve-activity --brief -c android.intent.category.HOME -a android.intent.action.MAIN') -split "`n")[-1].Trim()
    $wifi        = Sh $serial 'dumpsys wifi'
    $s.ssid      = if ($wifi -match 'SSID: "([^"]+)"') { $matches[1] } else { '' }
    $s.net       = (Sh $serial 'ping -c 2 -W 2 8.8.8.8') -match ' 0% packet loss|, [12] received'
    $prefs       = ShRoot $serial 'cat /data/data/biz.aquamx.homeapp/shared_prefs/homeapp.xml'
    $s.on        = if ($prefs -match 'name="screen_on">([^<]*)') { $matches[1] } else { '' }
    $s.off       = if ($prefs -match 'name="screen_off">([^<]*)') { $matches[1] } else { '' }
    $s.onHours   = In-OnHours (Parse-Hm $s.on) (Parse-Hm $s.off)
    $kills       = Sh $serial 'logcat -d -b all -v time -t 20000'
    $since       = (Get-Date).AddHours(-2).ToString('MM-dd HH:mm')
    $s.kills     = @(($kills -split "`n") | Where-Object { $_ -match 'Killing \d+:biz\.aquamx\.homeapp' -and $_.Substring(0, [Math]::Min(11, $_.Length)) -ge $since }).Count
    return $s
}

function Diagnose([string]$deviceId) {
    $r = @{ reachable = $false; ok = $false; summary = ''; findings = @(); fixes = @(); screenshot = $null }
    $box = $Boxes[$deviceId]
    if (-not $box) { $r.summary = "ไม่รู้จักกล่อง $deviceId ในตารางของคอมตรวจ"; return $r }
    $ip = $box.Ip; $serial = "${ip}:5555"

    if ($Ts) {
        $tsLine = (& $Ts status 2>$null | Select-String -SimpleMatch $ip | Select-Object -First 1)
        if ($tsLine -and "$tsLine" -match 'offline') { $r.findings += "Tailscale ของกล่อง offline ($(("$tsLine" -replace '.*offline,?\s*','').Trim()))" }
    }
    $conn = & $Adb connect $serial 2>&1 | Out-String
    if ($conn -notmatch 'connected to') {
        $r.summary = 'เข้ากล่องทาง VPN ไม่ได้ — Tailscale หรือเน็ตของกล่องหลุด'
        $r.findings += 'adb ต่อไม่ได้ (timeout)'
        $r.findings += 'ถ้า beacon ยังส่งอยู่ = จอยังเล่น แค่รีโมทไม่ได้ · ลองกด Reboot บนการ์ดเพื่อให้ Tailscale ต่อใหม่'
        return $r
    }
    $r.reachable = $true

    $s = Get-State $serial
    $r.findings += "รันมา $($s.uptimeH) ชม. · boot=$($s.boot) · wifi=$($s.ssid) · เน็ต $(if ($s.net) {'ปกติ'} else {'ใช้ไม่ได้'})"
    $r.findings += "HomeApp $($s.version) · หน้าจอ=$($s.focus) · จอ $($s.wake) · ไฟจอ $($s.blPower):$($s.bright)"
    $r.findings += "ตาราง $($s.on)–$($s.off) · ตอนนี้$(if ($s.onHours) {'อยู่ในเวลาเปิด'} else {'อยู่นอกเวลาเปิด (จอดับตามตารางเป็นปกติ)'})"
    if ($s.kills -gt 0) { $r.findings += "HomeApp ถูกระบบ kill $($s.kills) ครั้งใน 2 ชม.ที่ผ่านมา" }
    if ($s.uptimeH -ne $null -and $s.uptimeH -lt 2) { $r.findings += "กล่องเพิ่งบูต ($($s.boot)) — ถ้า boot ไม่ใช่ userrequested มักเป็นไฟดับ/ถอดปลั๊ก" }
    if (-not $s.net) { $r.findings += 'กล่องต่อ wifi ได้แต่ออกเน็ตไม่ได้ — เช็คเราเตอร์ของตึก' }

    if ($s.onHours) {
        if ($s.focus -match 'ResolverActivity' -or $s.home -notmatch 'biz\.aquamx\.homeapp') {
            Sh $serial 'cmd package set-home-activity biz.aquamx.homeapp/.MainActivity' | Out-Null
            Sh $serial 'am start -n biz.aquamx.homeapp/.MainActivity' | Out-Null
            $r.fixes += 'ตั้ง HomeApp เป็นแอปหน้าหลัก + เปิด HomeApp (เดิมค้างหน้าเลือกแอป Home)'
        } elseif ($s.focus -match 'NotificationShade') {
            Sh $serial 'cmd statusbar collapse' | Out-Null
            $r.fixes += 'ปิดแถบแจ้งเตือนที่ถูกดึงลงมาบังจอ'
        } elseif (-not $s.pid -or $s.focus -ne 'biz.aquamx.homeapp') {
            Sh $serial 'am start -n biz.aquamx.homeapp/.MainActivity' | Out-Null
            $r.fixes += "เปิด HomeApp กลับขึ้นหน้าจอ (เดิม: $(if ($s.pid) {$s.focus} else {'HomeApp ไม่ได้รัน'}))"
        }
        if ($s.wake -ne 'Awake') {
            Sh $serial 'input keyevent 224' | Out-Null
            $r.fixes += 'ปลุกจอ (เครื่องหลับอยู่ทั้งที่อยู่ในเวลาเปิด)'
        }
        if ($s.blPower -ne '0' -or $s.wake -ne 'Awake') {
            ShRoot $serial 'for d in /sys/class/backlight/*/; do echo 0 > $d/bl_power; done' | Out-Null
            if ($s.blPower -ne '0') { $r.fixes += "เปิดไฟจอ (bl_power เดิม $($s.blPower))" }
        }
        if ($s.bright -match '^\d+$' -and [int]$s.bright -lt 40) {
            ShRoot $serial 'echo 102 > /sys/class/backlight/backlight/brightness' | Out-Null
            Sh $serial 'settings put system screen_brightness 102' | Out-Null
            $r.fixes += "เพิ่มความสว่างจอ $($s.bright) → 102"
        }
    }

    if ($r.fixes.Count -gt 0) { Start-Sleep -Seconds 20; $s = Get-State $serial
        $r.findings += "หลังแก้: หน้าจอ=$($s.focus) · จอ $($s.wake) · ไฟจอ $($s.blPower):$($s.bright)" }

    $healthy = (-not $s.onHours) -or ($s.focus -eq 'biz.aquamx.homeapp' -and $s.wake -eq 'Awake' -and $s.blPower -eq '0')
    $r.ok = [bool]($healthy -and $s.net)
    $r.summary = if (-not $s.onHours) { 'นอกเวลาเปิดจอ — กล่องปกติ จอดับตามตาราง' }
                 elseif ($r.ok -and $r.fixes.Count -gt 0) { 'เจอปัญหาและแก้แล้ว — จอกลับมาเล่นปกติ' }
                 elseif ($r.ok) { 'กล่องปกติ จอเล่นอยู่ (ถ้าที่ตึกยังเห็นดำ ให้เช็คทีวี/สายจอ)' }
                 else { 'ยังมีปัญหาหลังพยายามแก้ — ดูรายละเอียดด้านล่าง' }

    # screenshot: root screencap -> pull -> downscale to 540px wide JPEG (<300KB)
    try {
        ShRoot $serial 'screencap -p /sdcard/diag.png' | Out-Null
        $png = Join-Path $env:TEMP "kiosk-diag-$deviceId.png"
        & $Adb -s $serial pull /sdcard/diag.png $png 2>&1 | Out-Null
        Sh $serial 'rm /sdcard/diag.png' | Out-Null
        if ((Test-Path $png) -and (Get-Item $png).Length -gt 20000) {
            Add-Type -AssemblyName System.Drawing
            $img = [System.Drawing.Image]::FromFile($png)
            $w = 540; $h = [int]($img.Height * $w / $img.Width)
            $bmp = New-Object System.Drawing.Bitmap $w, $h
            $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($img, 0, 0, $w, $h)
            $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
            $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
            $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 60L
            $ms = New-Object System.IO.MemoryStream
            $bmp.Save($ms, $enc, $ep); $g.Dispose(); $bmp.Dispose(); $img.Dispose()
            if ($ms.Length -le 300KB) { $r.screenshot = [Convert]::ToBase64String($ms.ToArray()) }
            Remove-Item $png -ErrorAction SilentlyContinue
        } elseif (Test-Path $png) { $r.findings += 'ภาพหน้าจอจากกล่องว่างเปล่า (ภาพดำ)'; Remove-Item $png -ErrorAction SilentlyContinue }
    } catch { $r.findings += "ถ่ายภาพหน้าจอไม่สำเร็จ: $($_.Exception.Message)" }
    return $r
}

# ---------------------------------------------------------------------------
if (-not $Adb) { Log 'adb not found'; exit 0 }

if ($Probe) {   # local dry run, prints instead of posting
    $r = Diagnose $Probe; $r.screenshot = if ($r.screenshot) { "<$($r.screenshot.Length) b64 chars>" } else { $null }
    $r | ConvertTo-Json -Depth 4; exit 0
}

$Key = (Get-ItemProperty -Path 'HKCU:\Environment' -Name 'KIOSK_DIAG_KEY' -ErrorAction SilentlyContinue).KIOSK_DIAG_KEY
if (-not $Key) { exit 0 }   # server side not provisioned yet
$H = @{ 'x-diag-key' = $Key }

try { $resp = Invoke-RestMethod -Uri "$Api/pending" -Headers $H -TimeoutSec 20 } catch { Log "pending failed: $($_.Exception.Message)"; exit 0 }
foreach ($req in @($resp.pending)) {
    if (-not $req.deviceId) { continue }
    Log "diag start $($req.deviceId) ($($req.label)) requested by $($req.requestedBy)"
    $r = Diagnose $req.deviceId
    $body = @{ docId = $req.docId; deviceId = $req.deviceId; reachable = $r.reachable; ok = $r.ok
               summary = $r.summary; findings = @($r.findings); fixes = @($r.fixes) }
    if ($r.screenshot) { $body.screenshot = $r.screenshot }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 4 -Compress))
    try {
        Invoke-RestMethod -Uri "$Api/result" -Method Post -Headers $H -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 60 | Out-Null
        Log "diag done $($req.deviceId): reachable=$($r.reachable) ok=$($r.ok) fixes=$($r.fixes.Count) - $($r.summary)"
    } catch { Log "result post failed $($req.deviceId): $($_.Exception.Message)" }
}
