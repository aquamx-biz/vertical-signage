# ── AquaMX kiosk health check — runs via Task Scheduler every 4h ─────────────
# Checks each box over Tailscale VPN: reachability, adb, foreground app,
# screen state, RAM/load, and one screencap. Appends CSV history and
# regenerates kiosk-health.html (open it in any browser).
# PowerShell 5.1 compatible. Run manually:  powershell -ExecutionPolicy Bypass -File kiosk-health.ps1

$ErrorActionPreference = "Continue"

# ── config ────────────────────────────────────────────────────────────────────
$Adb    = "C:\Users\Lenovo\OneDrive - MBK Group\Documents\SDK-platform\platform-tools\adb.exe"
$OutDir = Join-Path $PSScriptRoot "health"
# Screencap OFF for both: screencap on these 4K RK3566 panels hangs Fully into
# ANR (confirmed on be19a AND be19b — matches the documented "no screenshots on
# 4K" rule). Render status comes from the beacon (app.aquamx.biz/api/kiosk-beacon)
# instead. Flip Screencap = $true only for a box proven to tolerate it.
$Boxes  = @(
    @{ Name = "noble-be19a";    Ip = "100.100.123.43"; Screencap = $false },
    @{ Name = "noble-be19b";    Ip = "100.87.197.15";  Screencap = $false },
    @{ Name = "SD2603-001";     Ip = "100.71.132.15";  Screencap = $false },  # Ushida (บ้าน) ZC-H358S — asset id ชั่วคราว ยังไม่วางโครงการ; beacon ยัง=mahogany-tower จนกว่าจะ deploy จริง
    @{ Name = "lumpini-24";     Ip = "100.103.74.106"; Screencap = $false },  # RK3566 rk30sdk — ยังรัน Yodeck (Fully Single App); persist.adb.tcp.port=5555 ตั้งแล้ว
    @{ Name = "the-room-skv21"; Ip = "100.109.31.88";  Screencap = $false },  # YF_020E rk30sdk (yf-020e-2) — persist.adb.tcp.port=5555 ตั้งแล้ว
    @{ Name = "mahogany-tower"; Ip = "100.123.35.91";  Screencap = $false },  # ZC-H358S RK3588 Android 13, 1080x1920 — Fully Single App ครอบ Yodeck; เข้าถึงได้ 20 ก.ค. 69 (Safe Mode → wireless debugging); Tailscale + always-on VPN ตั้งแล้ว
    @{ Name = "39-by-sansiri";  Ip = "100.102.67.15";  Screencap = $false }   # ZC-H358S RK3588 Android 13, 1080x1920 — Fully Kiosk EMM (com.fullykiosk.emm); Tailscale + always-on VPN + persist.adb.tcp.port=5555 ตั้ง 22 ก.ค. 69 (screencap ทนได้ตอนติดตั้ง แต่คงค่า false ตาม fleet default)
)

# Per-screen ANR root-cause analysis, shown on the dashboard so the report
# explains itself. Kept in a SEPARATE UTF-8 JSON file — never inline Thai in a
# .ps1 (PowerShell 5.1 reads scripts as the ANSI codepage and the parser dies).
$Diagnosis = $null
$DiagPath = Join-Path $PSScriptRoot "diagnosis.json"
if (Test-Path $DiagPath) {
    try { $Diagnosis = Get-Content -Raw -Encoding UTF8 $DiagPath | ConvertFrom-Json } catch { }
}
# ──────────────────────────────────────────────────────────────────────────────

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OutDir "thumbs") | Out-Null
$CsvPath  = Join-Path $OutDir "health-log.csv"
$HtmlPath = Join-Path $OutDir "kiosk-health.html"
$Stamp    = Get-Date -Format "yyyy-MM-dd HH:mm"

if (-not (Test-Path $CsvPath)) {
    "time,box,ping,adb,fullyFocus,screenAwake,memFreeMB,load1,storagePct,cacheMB,topCpu,anrToday,status" | Out-File $CsvPath -Encoding utf8
}

$Results = @()

foreach ($Box in $Boxes) {
    $Name = $Box.Name; $Ip = $Box.Ip; $Serial = "${Ip}:5555"
    $Ping = "FAIL"; $AdbOk = "FAIL"; $Focus = "-"; $Awake = "-"
    $MemFree = -1; $MemTotal = 3900; $Load1 = -1; $Status = "DOWN"
    $StoragePct = -1; $TopCpu = "-"; $AnrToday = -1; $CacheMB = -1; $Apps = ""; $Cores = 0
    $StorageTotalMB = -1; $StorageFreeMB = -1   # /data capacity + free (for the "X/Y GB" capacity label)
    $AnrYest = -1; $Anr7d = -1; $Anr7dPrev = -1  # ANR trend buckets (yesterday, last 7d, prev 7d)
    $ScreenRes = ""  # physical resolution (wm size) for the 4K-vs-1080p spec
    $WifiRssi = 0; $WifiLink = 0; $WifiFreq = 0; $WifiReachLost = -1  # WiFi signal / link speed / band / IP-reachability losses
    $NetType = ""  # "wifi" | "eth" (wired) — a box on ethernet has no WiFi metrics
    $Chip = ""     # real SoC (RK3588/RK3568/RK3566) — beacon 'board' is the model name

    # 1. tailscale reachability
    $null = tailscale ping --c 2 --timeout 5s $Ip 2>$null
    if ($LASTEXITCODE -eq 0) { $Ping = "OK" }

    # 2. adb connect (works even if ping probe failed — DERP relays can be shy)
    $null = & $Adb connect $Serial 2>$null
    $Probe = (& $Adb -s $Serial shell "echo alive" 2>$null) -join ""
    if ($Probe -match "alive") {
        $AdbOk = "OK"

        # 3. PLAYER — which signage app is actually RUNNING (stable), not the momentary
        # window focus (which flips as Fully/Yodeck fight for foreground). This is
        # "what's set to play". Values: de.ozerov.fully | com.yodeck.android | multi | none
        # com.fullykiosk.emm = Fully Kiosk EMM edition (39-by-sansiri) — same player, counts as Fully.
        $fRun = ((& $Adb -s $Serial shell "pidof de.ozerov.fully com.fullykiosk.emm") -join "").Trim()
        $yApp = ((& $Adb -s $Serial shell "pidof com.yodeck.android") -join "").Trim()
        $sWrap = ((& $Adb -s $Serial shell "pidof com.fullykiosk.singleapp") -join "").Trim()
        # "multi" only when Fully fights the REAL Yodeck app. singleapp idling next to
        # Fully EMM (39-by-sansiri leftover provisioning) is not a fight — Fully wins.
        $Focus = if ($fRun -and $yApp) { "multi" } elseif ($fRun) { "de.ozerov.fully" } elseif ($yApp -or $sWrap) { "com.yodeck.android" } else { "none" }
        $IsFully = ($Focus -eq "de.ozerov.fully")

        # 4. screen state
        $Pw = (& $Adb -s $Serial shell "dumpsys power | grep mWakefulness=" 2>$null) -join ""
        if ($Pw -match "Awake") { $Awake = "yes" } else { $Awake = "no" }

        # 5. memory — MemAvailable (reclaimable) is the honest "how loaded is RAM"
        # number on Android; plain 'free' looks alarmingly low because Android
        # parks most RAM in reclaimable cache. RamUsedPct = (total-avail)/total.
        $MemInfo = & $Adb -s $Serial shell "cat /proc/meminfo"
        $mt = ($MemInfo | Select-String "MemTotal:\s+(\d+)").Matches.Groups[1].Value
        $ma = ($MemInfo | Select-String "MemAvailable:\s+(\d+)").Matches.Groups[1].Value
        if ($mt) { $MemTotal = [int]([int]$mt / 1024) }
        if ($ma) { $MemFree = [int]([int]$ma / 1024) }   # MemFree var now holds "available"
        $Up = (& $Adb -s $Serial shell "uptime" 2>$null) -join ""
        if ($Up -match "load average:\s*([\d.]+)") { $Load1 = [double]$Matches[1] }
        # NOTE: load average on these RK3566 boxes reads artificially high (kernel
        # accounting quirk — /proc/loadavg shows a big number with only 2-4 runnable
        # threads). Treat TopCpu and AnrToday as the real signals, not Load1.

        # 5b. metrics that actually affect the player. Filtering is done in
        # PowerShell (not piped through adb shell) to avoid $()/redirect escaping.
        $DfLine = (& $Adb -s $Serial shell "df -k /data" | Select-Object -Last 1)
        if ($DfLine -match "(\d+)%") { $StoragePct = [int]$Matches[1] }
        # df -k columns: Filesystem 1K-blocks Used Available Use% Mounted -> MB
        $DfCols = ($DfLine.Trim() -split '\s+')
        if ($DfCols.Count -ge 4 -and $DfCols[1] -match '^\d+$') {
            $StorageTotalMB = [int]([double]$DfCols[1] / 1024)
            $StorageFreeMB  = [int]([double]$DfCols[3] / 1024)
        }
        # busiest non-idle process right now (name + %CPU) — catches a runaway app
        $TopOut = & $Adb -s $Serial shell "top -b -n 1 -q -o %CPU,CMDLINE"
        $TopLine = $TopOut | Where-Object { $_ -notmatch '^\s*0(\.0)?\s' -and $_ -notmatch 'top -b|zygote|%CPU' } | Select-Object -First 1
        if ($TopLine -match "^\s*([\d.]+)\s+(\S+)") { $TopCpu = ($Matches[2] -split "/")[-1] + " " + $Matches[1] + "%" }
        # ANRs recorded = the real instability metric (was ~12/day with vlocker).
        # Bucket the date-stamped trace files (anr_YYYY-MM-DD-...) into today /
        # yesterday / last-7d / prev-7d so the dashboard shows a trend, not just a
        # snapshot. NOTE: /data/anr keeps only the most recent N traces, so a very
        # busy week can under-count the older windows.
        $Today   = (& $Adb -s $Serial shell "date +%Y-%m-%d").Trim()
        $AnrList = & $Adb -s $Serial shell "ls /data/anr/"
        try { $TodayDt = [datetime]::ParseExact($Today, 'yyyy-MM-dd', $null) } catch { $TodayDt = $null }
        if ($TodayDt) {
            $AnrToday = 0; $AnrYest = 0; $Anr7d = 0; $Anr7dPrev = 0
            foreach ($f in $AnrList) {
                if ($f -match '^anr_(\d{4}-\d{2}-\d{2})') {
                    try { $fd = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd', $null) } catch { continue }
                    $ago = ($TodayDt - $fd).Days
                    if ($ago -eq 0) { $AnrToday++ } elseif ($ago -eq 1) { $AnrYest++ }
                    if ($ago -ge 0 -and $ago -le 6) { $Anr7d++ } elseif ($ago -ge 7 -and $ago -le 13) { $Anr7dPrev++ }
                }
            }
        } else {
            $AnrToday = @($AnrList | Where-Object { $_ -like "*$Today*" }).Count
        }

        # CPU core count — top reports 100% per core, so the dashboard scales the
        # CPU bar to cores*100 (a 103% spike on an 8-core box isn't "danger").
        $npOut = (& $Adb -s $Serial shell "nproc") -join ""
        if ($npOut -match "(\d+)") { $Cores = [int]$Matches[1] }

        # physical screen resolution (accurate, unlike the beacon's CSS-scaled size)
        $WmOut = (& $Adb -s $Serial shell "wm size") -join ""
        if ($WmOut -match "Physical size:\s*(\d+x\d+)") { $ScreenRes = $Matches[1] }

        # real SoC — /proc/cpuinfo is most specific (Rockchip RK3568); rk3588 boxes
        # don't list it there so fall back to ro.board.platform (rk3588)
        $Chip = (((& $Adb -s $Serial shell "grep -ioE 'RK3[0-9]{3}[A-Za-z]?' /proc/cpuinfo | head -1") -join "").Trim()).ToUpper()
        if (-not $Chip) { $plat = ((& $Adb -s $Serial shell "getprop ro.board.platform") -join "").Trim(); if ($plat -match '^rk3[0-9]{3}') { $Chip = $plat.ToUpper() } }

        # WiFi — signal / link speed / band (one cheap passive command, no active test)
        $WifiStat = (& $Adb -s $Serial shell "cmd wifi status") -join " "
        if ($WifiStat -match "Wifi is connected") { $NetType = "wifi" }
        else {
            $EthOut = (& $Adb -s $Serial shell "ip -4 addr show eth0 2>/dev/null") -join ""
            if ($EthOut -match "inet ") {
                $NetType = "eth"
                $es = ((& $Adb -s $Serial shell "cat /sys/class/net/eth0/speed 2>/dev/null") -join "").Trim()
                if ($es -match '^\d+$') { $WifiLink = [int]$es }  # ethernet link speed (Mbps) into the shared link field
            }
        }
        if ($WifiStat -match "RSSI:\s*(-?\d+)")     { $WifiRssi = [int]$Matches[1] }
        if ($WifiStat -match "Link speed:\s*(\d+)") { $WifiLink = [int]$Matches[1] }
        if ($WifiStat -match "Frequency:\s*(\d+)")  { $WifiFreq = [int]$Matches[1] }
        # IP-reachability losses in the recent event buffer (WiFi up but router unreachable)
        $ReachOut = (& $Adb -s $Serial shell "dumpsys wifi | grep -c -iE 'IP_REACHABILITY_LOST|NUD_FAILED'") -join ""
        if ($ReachOut -match "(\d+)") { $WifiReachLost = [int]$Matches[1] }

        # 5c. Fully content cache (WebView + app cache) — how much the player has
        # cached locally right now. Sum du of the cache dirs (KB) in PowerShell.
        $duOut = & $Adb -s $Serial shell "du -sk /data/data/de.ozerov.fully/cache /data/data/de.ozerov.fully/app_webview /data/data/de.ozerov.fully/code_cache /data/data/com.fullykiosk.emm/cache /data/data/com.fullykiosk.emm/app_webview /data/data/com.fullykiosk.emm/code_cache 2>/dev/null"
        $sumKb = 0
        foreach ($ln in $duOut) { if ($ln -match "^\s*(\d+)\s") { $sumKb += [int]$Matches[1] } }
        if ($sumKb -gt 0) { $CacheMB = [int]($sumKb / 1024) }

        # 5d. every running app + its RAM (Total PSS by process) — the full picture,
        # not just the foreground app. 'pkg:MB' pairs joined by '|', biggest first.
        $miOut = & $Adb -s $Serial shell "dumpsys meminfo"
        $appList = New-Object System.Collections.ArrayList
        $inPss = $false
        foreach ($ln in $miOut) {
            if ($ln -match "Total PSS by process") { $inPss = $true; continue }
            if ($inPss) {
                if ($ln -match "^\s*([\d,]+)K:\s+(\S+)") {
                    $appMb = [int](([int]($Matches[1] -replace ',', '')) / 1024)
                    if ($appMb -ge 15) { [void]$appList.Add("$($Matches[2]):$appMb") }
                } elseif ($ln -match "Total PSS by OOM|^\s*$") { break }
            }
        }
        $Apps = ($appList | Select-Object -First 14) -join '|'

        # 6. one screencap — ONLY on boxes flagged safe. On fragile 4K panels a
        # screencap can hang Fully into ANR, so those are skipped (render status
        # comes from the beacon instead).
        if ($Box.Screencap) {
            $Thumb = Join-Path $OutDir ("thumbs\" + $Name + "-latest.png")
            $null = & $Adb -s $Serial shell "screencap -p /sdcard/aq-health.png" 2>$null
            $null = & $Adb -s $Serial pull /sdcard/aq-health.png $Thumb 2>$null
            $null = & $Adb -s $Serial shell "rm -f /sdcard/aq-health.png" 2>$null
        }

        if ($IsFully -and $Awake -eq "yes") { $Status = "OK" }
        elseif ($IsFully) { $Status = "SCREEN-OFF" }
        else { $Status = "WRONG-APP" }
    }
    elseif ($Ping -eq "OK") { $Status = "ADB-LOST" }

    "$Stamp,$Name,$Ping,$AdbOk,$Focus,$Awake,$MemFree,$Load1,$StoragePct,$CacheMB,""$TopCpu"",$AnrToday,$Status" | Out-File $CsvPath -Append -Encoding utf8
    $Results += @{ Name=$Name; Ip=$Ip; Ping=$Ping; Adb=$AdbOk; Focus=$Focus; Awake=$Awake; MemFree=$MemFree; MemTotal=$MemTotal; Load1=$Load1; StoragePct=$StoragePct; CacheMB=$CacheMB; TopCpu=$TopCpu; AnrToday=$AnrToday; Status=$Status; Screencap=[bool]$Box.Screencap }

    # push the adb-only metrics to the unified web dashboard (app.aquamx.biz/kiosk)
    if ($AdbOk -eq "OK") {
        $ramUsedPct = if ($MemTotal -gt 0) { [int](($MemTotal - $MemFree) / $MemTotal * 100) } else { 0 }
        $dx = if ($Diagnosis) { $Diagnosis.$Name } else { $null }
        $dxCause = if ($dx) { [string]$dx.cause } else { "" }
        $dxFixed = if ($dx) { $dx.fixed -join '|' } else { "" }     # ASCII '|' — page renders as bullets (no non-ASCII in this .ps1)
        $dxPending = if ($dx) { $dx.pending -join '|' } else { "" }
        $dxAssessed = if ($dx) { [string]$dx.assessed } else { "" }  # date the human diagnosis was last made (YYYY-MM-DD)
        $payload = @{ device=$Name; anrToday=$AnrToday; anrYesterday=$AnrYest; anr7d=$Anr7d; anr7dPrev=$Anr7dPrev; topCpu=$TopCpu; cores=$Cores; ramUsedPct=$ramUsedPct; ramFreeMB=$MemFree; ramTotalMB=$MemTotal; storagePct=$StoragePct; storageTotalMB=$StorageTotalMB; storageFreeMB=$StorageFreeMB; cacheMB=$CacheMB; apps=$Apps; focus=$Focus; screenRes=$ScreenRes; wifiRssi=$WifiRssi; wifiLink=$WifiLink; wifiFreq=$WifiFreq; wifiReachLost=$WifiReachLost; netType=$NetType; chip=$Chip; screenAwake=$Awake; load1="$Load1";
            anrCause=$dxCause; anrFixed=$dxFixed; anrPending=$dxPending; anrAssessed=$dxAssessed } | ConvertTo-Json -Compress
        # PS 5.1 Invoke-RestMethod sends a string body as Latin-1 (mangles Thai) —
        # hand it UTF-8 bytes so the payload stays intact end to end.
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        try { Invoke-RestMethod -Uri 'https://app.aquamx.biz/api/kiosk-health' -Method Post -ContentType 'application/json; charset=utf-8' -Body $bodyBytes -TimeoutSec 15 | Out-Null }
        catch { Write-Warning "health POST failed for $Name" }
    }
}

# ── dashboard ────────────────────────────────────────────────────────────────
$History = Import-Csv $CsvPath | Select-Object -Last 96   # ~16 days at 4h cadence
# Thai explanations live in a separate UTF-8 file (never inline Thai in a .ps1 —
# PowerShell 5.1 reads scripts as the ANSI codepage and mojibakes UTF-8 Thai).
$NotesPath = Join-Path $OutDir "metric-notes.html"
$Notes = if (Test-Path $NotesPath) { Get-Content -Raw -Encoding UTF8 $NotesPath } else { "" }

$GREEN = "#2E9E5B"; $AMBER = "#C9864C"; $RED = "#B23B2E"
# battery-style gauge: label + rounded track w/ colored fill + terminal nub + value
function Gauge($label, $pct, $valText, $color) {
    $p = [int][Math]::Max(2, [Math]::Min(100, $pct))
    return "<div class='g'><span class='glbl'>$label</span><span class='batt'><span class='bfill' style='width:$p%;background:$color'></span></span><span class='gval'>$valText</span></div>"
}

$Cards = ""
foreach ($R in $Results) {
    $Color = $RED
    if ($R.Status -eq "OK") { $Color = $GREEN }
    elseif ($R.Status -eq "SCREEN-OFF") { $Color = $AMBER }
    $Rows = ""
    $BoxHist = @($History | Where-Object { $_.box -eq $R.Name } | Select-Object -Last 12)
    foreach ($H in $BoxHist) {
        $Dot = $RED; if ($H.status -eq "OK") { $Dot = $GREEN } elseif ($H.status -eq "SCREEN-OFF") { $Dot = $AMBER }
        $Rows = "<tr><td>$($H.time)</td><td><span style='color:$Dot'>&#9679;</span> $($H.status)</td><td>$($H.anrToday)</td><td>$($H.memFreeMB) MB</td><td>$($H.topCpu)</td></tr>" + $Rows
    }

    # RAM used % — (total - available)/total. Android runs high normally, so
    # thresholds are high; ANR count is the real memory-pressure signal.
    $ramUsedPct = if ($R.MemTotal -gt 0) { [int](($R.MemTotal - $R.MemFree) / $R.MemTotal * 100) } else { 0 }
    $ramCol = if ($ramUsedPct -lt 85) { $GREEN } elseif ($ramUsedPct -lt 93) { $AMBER } else { $RED }
    # Storage — fill = used%
    $stCol = if ($R.StoragePct -lt 70) { $GREEN } elseif ($R.StoragePct -lt 90) { $AMBER } else { $RED }
    # ANR today — meter capped at 20; 0 = great
    $anrPct = [int]([Math]::Min($R.AnrToday / 20 * 100, 100))
    $anrCol = if ($R.AnrToday -le 0) { $GREEN } elseif ($R.AnrToday -le 3) { $AMBER } else { $RED }
    # CPU — parse % from "name NN%"
    $cpuNum = 0; $cpuName = $R.TopCpu
    if ($R.TopCpu -match "^(.*?)\s*([\d.]+)%") { $cpuName = $Matches[1]; $cpuNum = [double]$Matches[2] }
    $cpuCol = if ($cpuNum -lt 50) { $GREEN } elseif ($cpuNum -le 80) { $AMBER } else { $RED }

    $g1 = Gauge "ANR today"    $anrPct "$($R.AnrToday)"                     $anrCol
    $g2 = Gauge "RAM used"     $ramUsedPct "$ramUsedPct% ($($R.MemFree) MB free)" $ramCol
    $g3 = Gauge "Storage used" $R.StoragePct "$($R.StoragePct)%"            $stCol
    $g4 = Gauge "Top CPU"      $cpuNum "$cpuName $cpuNum%"                   $cpuCol

    if ($R.Screencap) {
        $Visual = "<img src=""thumbs/$($R.Name)-latest.png"" alt=""latest screen"">"
    } else {
        $Visual = "<div class=""noshot"">No screenshot &mdash; fragile 4K box (screencap risks ANR).<br>Render status via <a href=""https://app.aquamx.biz/api/kiosk-beacon"">beacon</a>.</div>"
    }
    $Cards += @"
<div class="card">
  <div class="head"><span class="dot" style="background:$Color"></span>
    <h2>$($R.Name)</h2><code>$($R.Ip)</code>
    <span class="badge" style="background:$Color">$($R.Status)</span></div>
  <div class="meta">ping $($R.Ping) &middot; adb $($R.Adb) &middot; app $($R.Focus) &middot; screen $($R.Awake) &middot; <span title="load average reads high on RK3566 - ignore">load $($R.Load1)*</span></div>
  <div class="gauges">$g1$g2$g3$g4</div>
  $Visual
  <table><tr><th>time</th><th>status</th><th>ANR</th><th>RAM free</th><th>top CPU</th></tr>$Rows</table>
</div>
"@
}

$Html = @"
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="900">
<title>AquaMX kiosk health</title>
<style>
 body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#F4F6FA;color:#0B1B33;margin:0;padding:24px}
 h1{color:#0E3361;font-size:22px;margin:0 0 4px} .sub{color:#5C6B82;font-size:13px;margin-bottom:20px}
 .grid{display:flex;flex-wrap:wrap;gap:20px}
 .card{background:#fff;border:1px solid #E6E9F1;border-radius:12px;padding:16px;width:420px}
 .head{display:flex;align-items:center;gap:8px} .head h2{font-size:16px;margin:0;color:#0E3361}
 .head code{font-size:11px;color:#5C6B82}
 .dot{width:12px;height:12px;border-radius:50%;display:inline-block}
 .badge{color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;margin-left:auto}
 .meta{font-size:12px;color:#5C6B82;margin:8px 0}
 .gauges{margin:14px 0}
 .g{display:flex;align-items:center;gap:10px;margin:7px 0}
 .glbl{width:96px;font-size:12px;color:#5C6B82}
 .batt{position:relative;flex:1;height:20px;background:#EEF1F6;border:1px solid #DDE2EC;border-radius:5px;overflow:hidden}
 .batt::after{content:"";position:absolute;right:-4px;top:6px;width:3px;height:8px;background:#DDE2EC;border-radius:0 2px 2px 0}
 .bfill{position:absolute;left:0;top:0;height:100%;border-radius:4px 0 0 4px;transition:width .3s}
 .gval{width:118px;text-align:right;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
 img{width:100%;border-radius:8px;border:1px solid #E6E9F1;background:#050608}
 .noshot{font-size:12px;color:#8B98AE;background:#F4F6FA;border:1px dashed #E6E9F1;border-radius:8px;padding:18px;text-align:center;line-height:1.6}
 table{width:100%;font-size:11px;border-collapse:collapse;margin-top:12px}
 th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #E6E9F1} th{color:#5C6B82;font-weight:600}
 .notes{max-width:900px;margin:22px 0 0;background:#fff;border:1px solid #E6E9F1;border-radius:12px;padding:8px 20px 14px}
 .notes h3{color:#0E3361;font-size:14px;margin:12px 0 6px} .notes ul{margin:0;padding-left:18px}
 .notes li{font-size:13px;color:#0B1B33;line-height:1.7;margin:4px 0} .notes b{color:#0E3361}
 .notes code{background:#F4F6FA;padding:1px 5px;border-radius:4px;font-size:12px}
 .notes .foot{font-size:12px;color:#5C6B82;margin:10px 0 2px;line-height:1.7}
</style></head><body>
<h1>AquaMX kiosk health</h1>
<div class="sub">Updated $Stamp &middot; every 4h over Tailscale &middot; live beacon: <a href="https://app.aquamx.biz/api/kiosk-beacon">kiosk-beacon</a></div>
<div class="grid">$Cards</div>
$Notes
</body></html>
"@
$Html | Out-File $HtmlPath -Encoding utf8

Write-Output "done: $(($Results | ForEach-Object { $_.Name + '=' + $_.Status }) -join ' ')"
