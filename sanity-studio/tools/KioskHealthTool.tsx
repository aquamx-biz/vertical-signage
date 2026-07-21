import { useEffect, useState, useCallback } from 'react'
import { Box, Card, Flex, Stack, Text, Heading, Button, Spinner, Badge } from '@sanity/ui'

// Kiosk Fleet Health — merges two sources into one matrix (projects = columns):
//  • beacon  (/api/kiosk-beacon)  — pushed by each screen every 5 min, always-on
//  • health  (/api/kiosk-health)  — collected by a PC over adb/VPN every 4h
// Both APIs live on aquamx-handoff (app.aquamx.biz) with CORS '*', so the Studio
// fetches them cross-origin — no Netlify page, no API route here.

const API = 'https://app.aquamx.biz'
const GREEN = '#2E9E5B', AMBER = '#C9864C', RED = '#B23B2E'

// device rename map — a box relabelled on the adb side but still beaconing its
// old project name folds into ONE column here (health + beacon = same physical
// box). e.g. the home unit: adb=SD2603-001 but its player still beacons
// mahogany-tower until it's deployed to a real project.
const ALIAS: Record<string, string> = { 'mahogany-tower': 'SD2603-001' }
const aka = (n: string) => ALIAS[n] || n

interface Beacon { project: string; bid: string; slide: string; upMin: number; minAgo: number; online: boolean; scr: string; board: string; andr: string; err: string; imgFails: string }

// screen resolution string ("3840x2160@2") → a short spec label + is4k flag
function resSpec(scr: string): { label: string; dims: string; is4k: boolean } {
  const m = String(scr || '').match(/(\d+)\s*x\s*(\d+)/)
  if (!m) return { label: '', dims: '', is4k: false }
  const w = +m[1], h = +m[2], big = Math.max(w, h)
  const is4k = big >= 3200
  const label = is4k ? '4K' : big >= 1800 ? '1080p' : big >= 1200 ? '720p' : `${big}p`
  return { label, dims: `${w}×${h}`, is4k }
}
interface Health { device: string; anrToday: number; anrYesterday: number; anr7d: number; anr7dPrev: number; topCpu: string; cores: number; ramUsedPct: number; ramFreeMB: number; ramTotalMB: number; storagePct: number; storageTotalMB: number; storageFreeMB: number; cacheMB: number; apps: string; focus: string; screenRes: string; wifiRssi: number; wifiLink: number; wifiFreq: number; wifiReachLost: number; netType: string; chip: string; screenAwake: string; checkedMinAgo: number; anrCause: string; anrFixed: string; anrPending: string; anrAssessed: string }
interface Row { device: string; beacon?: Beacon; health?: Health; ghosts?: number }

const fmtUp = (m: number) => (m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)
const fmtAgo = (m: number) => (m < 1 ? 'now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`)
// Thai "how long ago" for the adb-health snapshot age
const fmtAgeTh = (m: number) => (m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : `${Math.floor(m / 60)} ชม. ${m % 60} น.ที่แล้ว`)

// how many whole days ago the human ANR diagnosis was made (from a YYYY-MM-DD)
function assessedDaysAgo(d: string): number | null {
  const t = Date.parse(`${d}T00:00:00`)
  return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000)
}
function assessedLabel(d: string): string {
  const days = assessedDaysAgo(d)
  if (days === null) return ''
  const th = new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
  const ago = days <= 0 ? 'วันนี้' : days === 1 ? 'เมื่อวาน' : `${days} วันก่อน`
  return `${th} · ${ago}`
}

function anrColor(n: number) { return n <= 0 ? GREEN : n <= 3 ? AMBER : RED }
// trend of one window vs the previous — fewer ANR = better (green). prev===0 is
// treated as "no baseline yet" (monitoring hasn't covered the older window), NOT
// as a perfect week — so cur>0 doesn't falsely read as a regression.
function trendColor(cur: number, prev: number) { return prev === 0 ? (cur === 0 ? GREEN : '#64748b') : cur < prev ? GREEN : cur > prev ? RED : AMBER }
function trendArrow(cur: number, prev: number) { return prev === 0 ? (cur === 0 ? '' : 'รอฐาน') : cur < prev ? '↓ ดีขึ้น' : cur > prev ? '↑ แย่ลง' : '→ เท่าเดิม' }
function ramColor(p: number) { return p < 85 ? GREEN : p < 93 ? AMBER : RED }
function stColor(p: number) { return p < 70 ? GREEN : p < 90 ? AMBER : RED }
function cpuNum(s: string) { const m = s.match(/([\d.]+)%/); return m ? parseFloat(m[1]) : 0 }
function cpuColor(n: number) { return n < 50 ? GREEN : n <= 80 ? AMBER : RED }
// WiFi: RSSI dBm (negative — closer to 0 = stronger); reachability losses = IP drops
function rssiColor(r: number) { return r >= -55 ? GREEN : r >= -67 ? AMBER : RED }
const wifiBand = (mhz: number) => (mhz >= 5000 ? '5GHz' : mhz > 0 ? '2.4GHz' : '')

const APP_NAMES: Record<string, string> = {
  'de.ozerov.fully': 'Fully Kiosk (player)',
  'de.ozerov.fully:foreground': 'Fully Kiosk (บริการเบื้องหลัง)',
  'com.yodeck.android': 'Yodeck',
  'com.android.launcher3': 'Android Launcher (จอหลุด!)',
  'com.android.settings': 'Settings',
  'com.tailscale.ipn': 'Tailscale (VPN)',
  'system': 'ระบบ Android (system_server)',
  'com.android.systemui': 'System UI',
  'com.google.android.gms': 'Google Play Services',
  'com.google.android.gms.persistent': 'Google Play Services (persistent)',
  'com.google.process.gapps': 'Google Apps',
  'com.google.process.gservices': 'Google Services',
  'com.android.vending': 'Google Play Store',
  'com.google.android.tts': 'Google TTS',
  'com.android.chrome': 'Chrome',
  'org.zwanoo.android.speedtest': 'Ookla Speedtest',
  'volumelock.vlocker': 'vlocker (ปิดไปแล้ว)',
  'surfaceflinger': 'กราฟิก (SurfaceFlinger)',
  'zygote64': 'ระบบ (zygote)',
  'zygote': 'ระบบ (zygote)',
  'webview_zygote': 'WebView (zygote)',
  '?': 'ไม่ทราบ',
}
const appName = (pkg: string) => {
  if (APP_NAMES[pkg]) return APP_NAMES[pkg]
  if (/webview.*sandboxed|chromium/.test(pkg)) return 'WebView (หน้าจอเรนเดอร์)'
  if (/^com\.google\.android\.gms/.test(pkg)) return 'Google Play Services'
  if (/vending/.test(pkg)) return 'Google Play Store (เบื้องหลัง)'
  if (/bluetooth/.test(pkg)) return 'Bluetooth'
  if (/wellbeing/.test(pkg)) return 'Digital Wellbeing'
  return pkg.replace(/^com\.(google\.)?android\./, '').replace(/:[^:]*$/, '')
}
const isKeyApp = (pkg: string) => /fully|yodeck|tailscale|vlocker|speedtest|launcher3/.test(pkg)

// The collector reports the PLAYER that's actually running (stable), not a momentary
// window snapshot. Map it to a label + colour: a running player = fine (green),
// two players = wasteful (amber), no player = the box fell off (red).
function playerCell(focus: string): { txt: string; col: string } {
  switch (focus) {
    case 'de.ozerov.fully':    return { txt: 'Fully Kiosk (player)', col: '#1b5e3a' }
    case 'com.yodeck.android': return { txt: 'Yodeck (player)',      col: '#1b5e3a' }
    case 'multi':              return { txt: 'Fully + Yodeck — ซ้ำ 2 ตัว ⚠', col: AMBER }
    case 'none':
    case '':                   return { txt: 'ไม่มี player รัน ⚠', col: RED }
    default:                   return { txt: `${appName(focus)} ⚠ (จอหลุด)`, col: RED }
  }
}

// GB label from MB (1 decimal under 100GB, whole above)
const gb = (mb: number) => `${(mb / 1024).toFixed(mb < 102400 ? 1 : 0)} GB`

// static SoC capability table — Rockchip specs are fixed per chip, so this lookup
// shows the real difference (cores/clock/GPU/tier), not just the model name
// gflops = approximate FP32 GPU compute (the standard "how strong" unit for comparing)
const CHIP_SPEC: Record<string, { cpu: string; clock: string; gpu: string; gflops: number; tier: string; rank: number }> = {
  RK3566:  { cpu: '4×A55',       clock: '1.8GHz', gpu: 'Mali-G52',      gflops: 60,  tier: 'เริ่มต้น', rank: 1 },
  RK3568:  { cpu: '4×A55',       clock: '2.0GHz', gpu: 'Mali-G52',      gflops: 60,  tier: 'กลาง',    rank: 2 },
  RK3588:  { cpu: '4×A76+4×A55', clock: '2.4GHz', gpu: 'Mali-G610 MP4', gflops: 450, tier: 'เรือธง',  rank: 3 },
  RK3588S: { cpu: '4×A76+4×A55', clock: '2.4GHz', gpu: 'Mali-G610 MP4', gflops: 450, tier: 'เรือธง',  rank: 3 },
}
const GFLOPS_MAX = 450  // bar scale (strongest chip in the fleet)
const tierStyle = (rank: number) => rank >= 3 ? { color: '#7a4a1e', background: '#F6E5D0' } : rank === 2 ? { color: '#0E3361', background: '#E3EEFB' } : { color: '#5c6b82', background: '#EEF1F6' }

// color cutoffs — kept in lockstep with the *Color() functions above; rendered as
// a reference table in the legend so a glance tells you when a bar turns amber/red
const THRESHOLDS: { m: string; g: string; a: string; r: string }[] = [
  { m: 'ANR วันนี้',               g: '0',        a: '1–3',       r: '> 3' },
  { m: 'RAM ใช้',                  g: '< 85%',    a: '85–92%',    r: '≥ 93%' },
  { m: 'Storage ใช้',              g: '< 70%',    a: '70–89%',    r: '≥ 90%' },
  { m: 'Top CPU (ของเต็มเครื่อง)', g: '< 50%',    a: '50–80%',    r: '> 80%' },
  { m: 'Cache (Fully)',            g: '< 300MB',  a: '300–499MB', r: '≥ 500MB' },
]

// `cap` = capacity read shown right-aligned on the bar line ("ว่าง/รวม")
const METRICS: { label: string; sub?: string; val: (h: Health) => string; cap?: (h: Health) => string; pct?: (h: Health) => number; col: (h: Health) => string }[] = [
  { label: 'ANR วันนี้ (เมื่อวาน)', val: h => `${h.anrToday} (${h.anrYesterday})`, pct: h => Math.min(h.anrToday / 20 * 100, 100), col: h => anrColor(h.anrToday) },
  // 7-day total vs the previous 7 days → trend (fewer = green). Bar scales to the
  // worse of the two windows so a shorter/greener bar = improving week.
  { label: 'ANR 7 วัน (ก่อนหน้า)', val: h => `${h.anr7d} (${h.anr7dPrev})`, cap: h => trendArrow(h.anr7d, h.anr7dPrev), pct: h => (h.anr7d + h.anr7dPrev) > 0 ? h.anr7d / Math.max(h.anr7d, h.anr7dPrev) * 100 : 3, col: h => trendColor(h.anr7d, h.anr7dPrev) },
  // cap = "used / total" (NOT free/total) so it matches the % on the left and the
  // filled bar — no mental subtraction. Derive used from % × total (not total−free)
  // so it reconciles with the shown % exactly, ignoring reserved-block drift.
  { label: 'RAM ใช้', val: h => `${h.ramUsedPct}%`, cap: h => h.ramTotalMB > 0 ? `${gb(h.ramTotalMB * h.ramUsedPct / 100)} / ${gb(h.ramTotalMB)}` : '', pct: h => h.ramUsedPct, col: h => ramColor(h.ramUsedPct) },
  { label: 'Storage ใช้', val: h => `${h.storagePct}%`, cap: h => h.storageTotalMB > 0 ? `${gb(h.storageTotalMB * h.storagePct / 100)} / ${gb(h.storageTotalMB)}` : '', pct: h => h.storagePct, col: h => stColor(h.storagePct) },
  { label: 'Cache (Fully)', val: h => h.cacheMB >= 0 ? `${h.cacheMB} MB` : '—', pct: h => Math.min(h.cacheMB / 500 * 100, 100), col: h => h.cacheMB < 300 ? GREEN : h.cacheMB < 500 ? AMBER : RED },
  // top reports 100% = ONE core, so full capacity = cores×100% (4 cores → 400%).
  // Show "used% / total%" like Storage so a 90% spike on a 4-core box reads as
  // 90-of-400, not near-death. val = process name (wraps); cap = the ratio.
  { label: 'Top CPU', sub: 'เรียงตาม CPU', val: h => h.topCpu ? h.topCpu.replace(/\s+[\d.]+%\s*$/, '') : '—', cap: h => (h.cores > 0 && h.topCpu) ? `${cpuNum(h.topCpu)}% / ${h.cores * 100}%` : '', pct: h => cpuNum(h.topCpu) / Math.max(1, h.cores), col: h => cpuColor(cpuNum(h.topCpu) / Math.max(1, h.cores)) },
  // Network — name the type (LAN wired / WiFi) + RSSI dBm (coloured) + link/band.
  // No bar: this row is a category, not a quantity (the dBm colour shows quality).
  { label: 'ประเภทเน็ต', sub: 'WiFi / LAN', val: h => h.netType === 'eth' ? '🔌 LAN (สาย)' : (h.netType === 'wifi' || h.wifiRssi) ? `📶 WiFi${h.wifiRssi ? ` · ${h.wifiRssi} dBm` : ''}` : '—', cap: h => h.netType === 'eth' ? 'ethernet' : h.wifiRssi ? wifiBand(h.wifiFreq) : '', col: h => h.netType === 'eth' ? GREEN : h.wifiRssi ? rssiColor(h.wifiRssi) : '#cbd2dd' },
  // link speed (negotiated PHY rate for WiFi, or ethernet speed for wired) — a real
  // quantity so the bar is meaningful. NOT an active throughput test.
  { label: 'ความเร็ว (link)', sub: 'wifi/lan', val: h => h.wifiLink ? `${h.wifiLink} Mbps` : '—', pct: h => h.wifiLink ? Math.min(h.wifiLink / 600 * 100, 100) : 0, col: h => !h.wifiLink ? '#cbd2dd' : h.wifiLink >= 50 ? GREEN : h.wifiLink >= 20 ? AMBER : RED },
  // WiFi stability — IP-reachability losses (WiFi up but router unreachable). N/A on wired.
  { label: 'WiFi หลุด (IP)', sub: 'reachability loss', val: h => h.netType === 'eth' ? '—' : h.wifiReachLost >= 0 ? String(h.wifiReachLost) : '—', pct: h => h.netType !== 'eth' && h.wifiReachLost > 0 ? Math.min(h.wifiReachLost / 10 * 100, 100) : 0, col: h => h.netType === 'eth' || h.wifiReachLost < 0 ? '#cbd2dd' : h.wifiReachLost === 0 ? GREEN : h.wifiReachLost <= 3 ? AMBER : RED },
]

const lbl: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: '#5c6b82', lineHeight: 1.3, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }
const cell: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' }

function Bar({ pct, color }: { pct: number; color: string }) {
  return <div style={{ height: 6, borderRadius: 4, background: '#EEF1F6', marginTop: 4 }}><div style={{ width: `${Math.max(3, Math.min(100, pct))}%`, height: '100%', borderRadius: 4, background: color }} /></div>
}

export function KioskHealthTool() {
  const [rows, setRows] = useState<Row[]>([])
  const [updated, setUpdated] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  // App matrix: '' = default sort (apps on the most screens first), else a device
  // name = sort every app by that project's RAM so its biggest apps rise to top.
  const [appSort, setAppSort] = useState('')
  // Hide the system apps that run on EVERY screen (system_server, WebView, launcher…):
  // identical everywhere = no comparison value, just clutter. Key apps (player/VPN)
  // and anything NOT on every screen (the real differences) always stay. Toggleable
  // so a ballooning system_server/WebView is still one click from view.
  const [hideCommon, setHideCommon] = useState(true)

  const load = useCallback(async () => {
    try {
      const [bRes, hRes] = await Promise.all([
        fetch(`${API}/api/kiosk-beacon`, { cache: 'no-store' }),
        fetch(`${API}/api/kiosk-health`, { cache: 'no-store' }),
      ])
      const beacons: Beacon[] = (await bRes.json()).screens || []
      const healths: Health[] = (await hRes.json()).boxes || []

      const identOf = (b: Beacon) => {
        const m = String(b.slide || '').match(/@([A-Za-z0-9_-]+)/)
        return aka(m ? m[1] : String(b.project))
      }
      const freshest = new Map<string, Beacon>()
      const ghostCount = new Map<string, number>()
      for (const b of beacons) {
        if (String(b.project).startsWith('test-')) continue
        const id = identOf(b)
        // Skip screens that never identified themselves: __AQDEV__ (unbaked
        // placeholder) and 'unknown'/'' (a screen that beaconed with no project
        // code). These have no fleet column to belong to — e.g. a long-dead
        // 'unknown' ghost was showing up as its own empty column.
        if (id === '__AQDEV__' || id === 'unknown' || id === '') continue
        const cur = freshest.get(id)
        if (!cur || b.minAgo < cur.minAgo) freshest.set(id, b)
        if (cur) ghostCount.set(id, (ghostCount.get(id) || 0) + 1)
      }

      const byDevice = new Map<string, Row>()
      // A health doc's device name is authoritative (the collector sets it), so it
      // is NEVER aliased — otherwise the real mahogany-tower SITE box collapses into
      // the home box's SD2603-001 column and vanishes. The alias applies ONLY to the
      // home box's stray BEACON (project=mahogany-tower, its placeholder content),
      // which folds into SD2603-001 below. If two health docs still collide keep the
      // freshest by checkedMinAgo.
      for (const h of healths) {
        const dev = h.device
        const cur = byDevice.get(dev)
        if (!cur || !cur.health || h.checkedMinAgo < cur.health.checkedMinAgo) byDevice.set(dev, { device: dev, health: h })
      }
      for (const b of Array.from(freshest.values())) {
        const id = identOf(b)
        let key = id
        for (const dk of Array.from(byDevice.keys())) { if (dk === id || dk.includes(id) || id.includes(dk)) { key = dk; break } }
        const row = byDevice.get(key) || { device: key }
        row.beacon = b
        row.ghosts = ghostCount.get(id) || 0
        byDevice.set(key, row)
      }
      setRows(Array.from(byDevice.values()).sort((a, b) => a.device.localeCompare(b.device)))
      setUpdated(new Date().toLocaleTimeString('th-TH'))
      setErr('')
    } catch { setErr('โหลดข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [load])

  if (loading && rows.length === 0) return <Flex align="center" justify="center" padding={5}><Spinner /></Flex>

  const online = rows.filter(r => r.beacon?.online).length
  // age of the newest adb-health snapshot — Refresh re-reads stored data, it does NOT
  // re-poll the boxes (the collector does that every 4h), so surface how old it is
  const healthAges = rows.filter(r => r.health).map(r => r.health!.checkedMinAgo)
  const healthAge = healthAges.length ? Math.min(...healthAges) : null

  // ── App × Project matrix ────────────────────────────────────────────────
  // One row per app (keyed by DISPLAY name so a project's several WebView render
  // processes collapse into one "WebView" row), one column per project. Answers
  // "is this app on every screen?" (read across) and "which app is biggest on
  // this project?" (click a column header to sort by it).
  const appDevices = rows.filter(r => r.health && r.health.apps).map(r => r.device)
  const focusLabelByDev: Record<string, string> = {}
  const appMap = new Map<string, { label: string; key: boolean; per: Record<string, number>; screens: number; total: number }>()
  for (const r of rows) {
    if (!r.health || !r.health.apps) continue
    const dev = r.device
    if (r.health.focus) focusLabelByDev[dev] = appName(r.health.focus)
    const seen = new Set<string>()
    for (const s of r.health.apps.split('|')) {
      const i = s.lastIndexOf(':'); const pkg = s.slice(0, i); const mb = parseInt(s.slice(i + 1)) || 0
      if (!pkg) continue
      const label = appName(pkg)
      let e = appMap.get(label)
      if (!e) { e = { label, key: false, per: {}, screens: 0, total: 0 }; appMap.set(label, e) }
      if (isKeyApp(pkg)) e.key = true
      if (!seen.has(label)) { seen.add(label); e.screens++ }
      e.per[dev] = (e.per[dev] || 0) + mb
      e.total += mb
    }
  }
  const colMax: Record<string, number> = {}
  for (const dev of appDevices) colMax[dev] = Math.max(1, ...Array.from(appMap.values()).map(e => e.per[dev] || 0))
  const sortedApps = Array.from(appMap.values()).sort((a, b) => {
    if (appSort) return (b.per[appSort] || 0) - (a.per[appSort] || 0)   // by clicked project's RAM
    if (b.screens !== a.screens) return b.screens - a.screens           // default: most-ubiquitous first
    return b.total - a.total
  })
  // A non-key app on every screen is identical noise → hide unless asked. Key apps
  // and partial-coverage apps (the actual differences between projects) always show.
  const isCommon = (e: { key: boolean; screens: number }) => !e.key && appDevices.length > 1 && e.screens === appDevices.length
  const shownApps = hideCommon ? sortedApps.filter(e => !isCommon(e)) : sortedApps
  const hiddenCount = sortedApps.length - shownApps.length

  return (
    <Box padding={4}>
      <Flex align="center" justify="space-between" style={{ marginBottom: 16 }}>
        <Stack space={2}>
          <Heading size={3}>AquaMX Fleet — สุขภาพจอ</Heading>
          <Text size={1} muted>
            beacon สดทุก 5 นาที · <b>ข้อมูลระบบ (adb) เก็บ{healthAge === null ? '—' : fmtAgeTh(healthAge)}</b>
            {updated && ` · โหลดหน้า ${updated}`}
          </Text>
          <Text size={0} muted style={{ color: '#9aa7b8' }}>
            ปุ่ม Refresh = อ่านค่าที่เก็บไว้ใหม่ · <b>ไม่ได้ไปดึงจากจอสดๆ</b> — ตัวเลขระบบจะเปลี่ยนเมื่อ collector รันรอบถัดไป (ทุก 4 ชม.)
          </Text>
        </Stack>
        <Flex align="center" gap={3}>
          <Badge tone={online === rows.length ? 'positive' : 'caution'}>{online} / {rows.length} online</Badge>
          <Button text="Refresh" mode="ghost" onClick={load} />
        </Flex>
      </Flex>

      {err && <Card padding={3} tone="critical" radius={3} style={{ marginBottom: 12 }}><Text size={1}>{err}</Text></Card>}

      <Card radius={3} shadow={1} style={{ overflowX: 'auto', marginBottom: 16 }}>
        {/* fixed layout → every project column is exactly equal width; long values
            (e.g. a long Top-CPU process name) wrap to 2 lines instead of stretching */}
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 132 + rows.length * 152 }}>
          <colgroup>
            <col style={{ width: 132 }} />
            {rows.map(r => <col key={r.device} style={{ width: 152 }} />)}
          </colgroup>
          <thead>
            {/* header = project name ONLY, pinned to the top edge — every status
                detail lives in its own row below so all names sit level */}
            <tr style={{ borderBottom: '1px solid #e6e9f1' }}>
              <th style={lbl}></th>
              {rows.map(r => (
                <th key={r.device} style={{ padding: '10px 12px', textAlign: 'left', verticalAlign: 'top' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0b1b33', wordBreak: 'break-word' }}>{r.device}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* status rows — pulled out of the header */}
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>สถานะ</td>
              {rows.map(r => {
                const on = !!r.beacon?.online
                return (
                  <td key={r.device} style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 8, flex: 'none', background: r.beacon ? (on ? GREEN : RED) : '#cbd2dd' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: r.beacon ? (on ? '#1b5e3a' : RED) : '#cbd2dd' }}>{r.beacon ? (on ? 'online' : 'offline') : 'ไม่มี beacon'}</span>
                    </div>
                    {r.beacon && <div style={{ fontSize: 11, color: '#8b98ae', marginTop: 2 }}>เปิดมา {fmtUp(r.beacon.upMin)}</div>}
                  </td>
                )
              })}
            </tr>
            {/* newest signal of ANY kind (beacon vs adb) as an absolute date+time */}
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>อัพเดทล่าสุด<span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9aa7b8' }}>beacon หรือ adb</span></td>
              {rows.map(r => {
                const ages: { min: number; src: string }[] = []
                if (r.beacon) ages.push({ min: r.beacon.minAgo, src: 'beacon' })
                if (r.health) ages.push({ min: r.health.checkedMinAgo, src: 'adb' })
                if (!ages.length) return <td key={r.device} style={{ ...cell, color: '#cbd2dd', fontSize: 12 }}>—</td>
                const newest = ages.reduce((a, b) => (b.min < a.min ? b : a))
                const d = new Date(Date.now() - newest.min * 60000)
                return (
                  <td key={r.device} style={cell}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#334155', whiteSpace: 'nowrap' }}>
                      {d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · {d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 10, color: '#b4bcc9', marginTop: 1 }}>จาก {newest.src}</div>
                  </td>
                )
              })}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>beacon ล่าสุด<span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9aa7b8' }}>จอ push ทุก 5 นาที</span></td>
              {rows.map(r => (
                <td key={r.device} style={{ ...cell, fontSize: 12, color: r.beacon ? '#334155' : '#cbd2dd' }}>
                  {r.beacon ? fmtAgo(r.beacon.minAgo) : '—'}
                </td>
              ))}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>ระบบ (adb)<span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9aa7b8' }}>เก็บทุก 4 ชม.</span></td>
              {rows.map(r => (
                <td key={r.device} style={{ ...cell, fontSize: 12, color: r.health ? (r.health.checkedMinAgo > 330 ? AMBER : '#334155') : '#cbd2dd' }}>
                  {r.health ? <>{fmtAgeTh(r.health.checkedMinAgo)}{r.health.checkedMinAgo > 330 ? ' ⚠' : ''}</> : '—'}
                </td>
              ))}
            </tr>
            {/* hardware spec rows — resolution (4K/1080p) + chip, easier to compare
                across columns than cramming them into the header */}
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>จอ<span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9aa7b8' }}>ความละเอียด</span></td>
              {rows.map(r => {
                const s = resSpec(r.health?.screenRes || r.beacon?.scr || '')
                if (!s.label) return <td key={r.device} style={{ ...cell, color: '#cbd2dd', fontSize: 12 }}>—</td>
                return (
                  <td key={r.device} style={cell}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '1px 6px', borderRadius: 3, color: s.is4k ? '#7a4a1e' : '#5c6b82', background: s.is4k ? '#F6E5D0' : '#EEF1F6' }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: '#8b98ae', marginLeft: 6, whiteSpace: 'nowrap' }}>{s.dims}</span>
                  </td>
                )
              })}
            </tr>
            {/* hardware — split into 3 rows so each is easy to compare across columns */}
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>ชิป (SoC)</td>
              {rows.map(r => {
                const chip = r.health?.chip, model = r.beacon?.board
                const spec = chip ? CHIP_SPEC[chip] : undefined
                if (!chip && !model) return <td key={r.device} style={{ ...cell, color: '#cbd2dd', fontSize: 12 }}>—</td>
                return (
                  <td key={r.device} style={{ ...cell, wordBreak: 'break-word' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {chip && <span style={{ fontSize: 12, fontWeight: 600, color: '#0E3361' }}>{chip}</span>}
                      {spec && <span style={{ fontSize: 10, fontWeight: 700, padding: '0 5px', borderRadius: 3, ...tierStyle(spec.rank) }}>{spec.tier}</span>}
                    </div>
                    {model && <div style={{ fontSize: 10, color: '#b4bcc9', marginTop: 1 }}>{model}</div>}
                  </td>
                )
              })}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>CPU</td>
              {rows.map(r => {
                const spec = r.health?.chip ? CHIP_SPEC[r.health.chip] : undefined
                const txt = spec ? `${spec.cpu} · ${spec.clock}` : (r.health?.cores ? `${r.health.cores} คอร์` : '')
                return <td key={r.device} style={{ ...cell, fontSize: 12, color: txt ? '#334155' : '#cbd2dd', wordBreak: 'break-word' }}>{txt || '—'}</td>
              })}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>GPU<span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9aa7b8' }}>~GFLOPS (พลัง)</span></td>
              {rows.map(r => {
                const spec = r.health?.chip ? CHIP_SPEC[r.health.chip] : undefined
                if (!spec) return <td key={r.device} style={{ ...cell, color: '#cbd2dd', fontSize: 12 }}>—</td>
                return (
                  <td key={r.device} style={{ ...cell, height: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#0E3361', wordBreak: 'break-word', minWidth: 0 }}>{spec.gpu}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b98ae', flex: 'none', whiteSpace: 'nowrap' }}>~{spec.gflops}</span>
                      </div>
                      <div style={{ marginTop: 'auto' }}><Bar pct={Math.min(spec.gflops / GFLOPS_MAX * 100, 100)} color="#0E3361" /></div>
                    </div>
                  </td>
                )
              })}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>Player ที่รัน<span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9aa7b8' }}>ตัวที่ตั้งให้เล่น</span></td>
              {rows.map(r => {
                const h = r.health
                if (!h?.focus) return <td key={r.device} style={{ ...cell, color: '#cbd2dd', fontSize: 12 }}>—</td>
                const p = playerCell(h.focus)
                return <td key={r.device} style={{ ...cell, fontSize: 12, fontWeight: 500, wordBreak: 'break-word', color: p.col }}>{p.txt}</td>
              })}
            </tr>
            {METRICS.map(m => (
              <tr key={m.label} style={{ borderBottom: '1px solid #f1f3f6' }}>
                <td style={lbl}>{m.label}{m.sub && <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9aa7b8' }}>{m.sub}</span>}</td>
                {rows.map(r => {
                  const h = r.health
                  if (!h) return <td key={r.device} style={{ ...cell, color: '#cbd2dd', fontSize: 12 }}>—</td>
                  const col = m.col(h), pct = m.pct ? m.pct(h) : null
                  const cap = m.cap ? m.cap(h) : ''
                  // height:1px + inner 100% column → the bar pins to the cell's
                  // BOTTOM edge, so bars line up across a row even when another
                  // column's text wraps taller (e.g. long Top-CPU process names)
                  return (
                    <td key={r.device} style={{ ...cell, height: 1 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: col, wordBreak: 'break-word', minWidth: 0 }}>{m.val(h)}</span>
                          {cap && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b98ae', flex: 'none', whiteSpace: 'nowrap' }}>{cap}</span>}
                        </div>
                        {pct !== null && <div style={{ marginTop: 'auto' }}><Bar pct={pct} color={col} /></div>}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !err && <Text size={1} muted style={{ display: 'block', textAlign: 'center', padding: 24 }}>กำลังโหลด…</Text>}
      </Card>

      {/* App × Project matrix — cross-screen comparison. Rows = apps, columns =
          projects; click a project header to sort every app by its RAM there. */}
      {sortedApps.length > 0 && (
        <Card radius={3} shadow={1} style={{ overflowX: 'auto', marginBottom: 16 }}>
          <Flex align="center" justify="space-between" gap={3} style={{ padding: '12px 12px 0', flexWrap: 'wrap' }}>
            <Text size={1} weight="semibold">แอปทุกจอ (matrix) · <span style={{ fontWeight: 400, color: '#8b98ae' }}>
              {appSort ? <>เรียงตาม RAM ของ <b style={{ color: '#0E3361' }}>{appSort}</b> · <span onClick={() => setAppSort('')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>ล้าง</span></> : 'เรียงตามจำนวนจอที่รัน · กดหัวคอลัมน์เพื่อเรียงตามจอนั้น'}
            </span></Text>
            <span onClick={() => setHideCommon(v => !v)} style={{ cursor: 'pointer', userSelect: 'none', fontSize: 12, color: '#5C6B82', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-block', width: 13, height: 13, borderRadius: 3, border: '1.5px solid #9aa7b8', background: hideCommon ? '#0E3361' : '#fff', color: '#fff', textAlign: 'center', lineHeight: '11px', fontSize: 10, marginRight: 6, verticalAlign: '-2px' }}>{hideCommon ? '✓' : ''}</span>
              ซ่อนแอประบบที่อยู่ครบทุกจอ{hiddenCount > 0 || hideCommon ? <span style={{ color: '#9aa7b8' }}> ({hideCommon ? `ซ่อน ${hiddenCount}` : `${sortedApps.filter(isCommon).length} รายการ`})</span> : null}
            </span>
          </Flex>
          <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', marginTop: 8 }}>
            <colgroup>
              <col style={{ width: 200 }} />
              {appDevices.map(d => <col key={d} style={{ width: 116 }} />)}
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '2px solid #E4E8EF' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#8b98ae', fontWeight: 500 }}>แอป <span style={{ color: '#c0c8d4' }}>(จอที่รัน)</span></th>
                {appDevices.map(d => {
                  const active = appSort === d
                  return (
                    <th key={d} onClick={() => setAppSort(active ? '' : d)}
                        title="กดเพื่อเรียงตามจอนี้"
                        style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, cursor: 'pointer', userSelect: 'none', wordBreak: 'break-word', color: active ? '#0E3361' : '#5C6B82', fontWeight: active ? 700 : 500, background: active ? '#EEF3FA' : 'transparent' }}>
                      {d}{active ? ' ▼' : ''}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {shownApps.map((e, ri) => (
                <tr key={e.label} style={{ borderBottom: '1px solid #F0F2F6', background: ri % 2 ? '#FBFCFE' : '#fff' }}>
                  <td style={{ padding: '7px 12px', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: e.key ? '#0E3361' : '#475569', fontWeight: e.key ? 600 : 400 }}>
                    {e.label}
                    <span style={{ marginLeft: 6, fontSize: 10, color: e.screens === appDevices.length ? '#2E9E5B' : '#b0b8c4', fontWeight: 500 }}>{e.screens}/{appDevices.length}</span>
                  </td>
                  {appDevices.map(d => {
                    const mb = e.per[d]
                    if (!mb) return <td key={d} style={{ padding: '7px 10px', textAlign: 'right', color: '#d4dae2', fontSize: 12 }}>·</td>
                    const onScr = focusLabelByDev[d] === e.label
                    const a = 0.05 + 0.22 * (mb / colMax[d])
                    return (
                      <td key={d} style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: e.key ? '#0E3361' : '#334155', fontWeight: e.key ? 600 : 400, background: `rgba(14,51,97,${a.toFixed(3)})` }}>
                        {mb}{onScr && <span title="แอปที่กำลังโชว์บนจอ" style={{ marginLeft: 4, color: '#1b5e3a' }}>●</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* running-apps cards — their OWN grid, separate from the ANR cards below, so
          a box with only an apps card no longer leaves a tall empty cell beside a
          box that also has an ANR card (that empty cell read as a gap "in front of"
          the taller card). */}
      <Text size={1} weight="semibold" style={{ display: 'block', marginBottom: 8, color: '#5C6B82' }}>รายจอ (ละเอียด)</Text>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', alignItems: 'start', marginBottom: 14 }}>
        {rows.filter(r => r.health && r.health.apps).map(r => {
          const h = r.health!
          const apps = h.apps.split('|').map(s => { const i = s.lastIndexOf(':'); return { pkg: s.slice(0, i), mb: parseInt(s.slice(i + 1)) || 0 } }).filter(x => x.pkg)
          if (!apps.length) return null
          const max = Math.max(...apps.map(x => x.mb), 1)
          const total = apps.reduce((a, x) => a + x.mb, 0)
          return (
            <Card key={r.device} padding={4} radius={3} shadow={1}>
              <Text size={1} weight="semibold" style={{ marginBottom: 8, display: 'block' }}>{r.device} · แอปที่รันอยู่ ({apps.length}) · <span style={{ fontWeight: 400, color: '#8b98ae' }}>เรียงตาม RAM</span> · รวม ~{total} MB</Text>
              <Stack space={1}>
                {apps.map((x, i) => {
                  const onScreen = x.pkg === h.focus
                  return (
                    <Flex key={i} align="center" gap={2} style={{ fontSize: 12 }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isKeyApp(x.pkg) ? '#0E3361' : '#5C6B82', fontWeight: (isKeyApp(x.pkg) || onScreen) ? 500 : 400 }}>{appName(x.pkg)}{onScreen && <span style={{ marginLeft: 6, color: '#1b5e3a' }}>● บนจอ</span>}</span>
                      <span style={{ width: 56, height: 8, borderRadius: 4, overflow: 'hidden', flex: 'none', background: '#EEF1F6' }}><span style={{ display: 'block', height: '100%', width: `${x.mb / max * 100}%`, background: isKeyApp(x.pkg) ? '#0E3361' : '#B4B2A9' }} /></span>
                      <span style={{ width: 48, textAlign: 'right', color: '#475569', flex: 'none' }}>{x.mb} MB</span>
                    </Flex>
                  )
                })}
              </Stack>
            </Card>
          )
        })}
      </div>

      {/* ANR-cause cards — separate grid, only boxes that carry a diagnosis */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', alignItems: 'start', marginBottom: 14 }}>
        {rows.filter(r => r.health && (r.health.anrCause || r.health.anrFixed || r.health.anrPending)).map(r => {
          const h = r.health!
          return (
            <Card key={r.device} padding={4} radius={3} shadow={1}>
              <Text size={1} weight="semibold" style={{ color: '#0E3361', display: 'block' }}>{r.device} · สาเหตุ ANR</Text>
              {h.anrAssessed && (() => {
                const days = assessedDaysAgo(h.anrAssessed) ?? 0
                const stale = days >= 2 && h.anrToday > 0   // old diagnosis but ANR still biting → re-assess
                return (
                  <Text size={0} style={{ display: 'block', marginTop: 2, marginBottom: 8, color: stale ? RED : '#8b98ae' }}>
                    ประเมินเมื่อ {assessedLabel(h.anrAssessed)}{stale ? ' · ⚠ เก่าแล้ว แต่ ANR ยังเกิด — ควรประเมินใหม่' : ''}
                  </Text>
                )
              })()}
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                {h.anrCause && <p style={{ color: '#334155', margin: 0 }}>{h.anrCause}</p>}
                {h.anrFixed && <div style={{ marginTop: 6, color: '#1b5e3a' }}><b>✓ แก้แล้ว</b><ul style={{ margin: '2px 0 0', paddingLeft: 20 }}>{h.anrFixed.split('|').map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                {h.anrPending && <div style={{ marginTop: 6, color: '#8a5a1f' }}><b>⚠ ยังไม่แก้</b><ul style={{ margin: '2px 0 0', paddingLeft: 20 }}>{h.anrPending.split('|').map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              </div>
            </Card>
          )
        })}
      </div>

      <Card padding={4} radius={3} shadow={1}>
        <Text size={1} weight="semibold" style={{ color: '#0E3361', marginBottom: 8, display: 'block' }}>อ่านค่ายังไง</Text>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: '#1e293b' }}>
          <li><b>ANR</b> = <b>A</b>pplication <b>N</b>ot <b>R</b>esponding — แอปค้างไม่ตอบสนอง (นานเกิน ~5 วินาที) จนระบบเด้งถาม &quot;ปิดแอป / รอ&quot; · เกิดบ่อย = จอมีปัญหา</li>
          <li><b>สด (beacon)</b> — จอ push เองทุก 5 นาที 24 ชม. · บอก online / เปิดมานาน / หน้าเรนเดอร์ไหม</li>
          <li><b>ระบบ (adb)</b> — คอมดึงผ่าน VPN ทุก 4 ชม. · <b>ANR วันนี้ (เมื่อวาน)</b> = จำนวนวันนี้ · ในวงเล็บ = เมื่อวาน (กันเข้าใจผิดว่าเงียบทั้งที่เมื่อวานเยอะ) · <b>ANR 7 วัน (ก่อนหน้า)</b> = รวม 7 วันล่าสุด เทียบ 7 วันก่อนในวงเล็บ — เขียว/↓ = ลดลง (ดีขึ้น), แดง/↑ = เพิ่มขึ้น, เทา/<b>รอฐาน</b> = ยังเก็บประวัติไม่ถึง 2 สัปดาห์ เทียบเทรนด์ไม่ได้ (prev7d=0 เพราะไม่มีข้อมูล ไม่ใช่ปลอดภัย) · หมายเหตุ: เครื่องเก็บไฟล์ ANR จำกัด สัปดาห์ไหน ANR เยอะมากตัวเลขย้อนหลังอาจนับไม่ครบ</li>
          <li><b>ชิป / CPU / GPU</b> — สเปกฮาร์ดแวร์ · <b>tier</b> (เริ่มต้น/กลาง/เรือธง) = ภาพรวมความแรง · GPU วัดด้วย <b>GFLOPS</b> (พลังคำนวณ ยิ่งเยอะยิ่งแรง — แถบเทียบกับชิปแรงสุดในฟลีต RK3588 ~450) · ตัวเลข GFLOPS เป็นค่า<b>โดยประมาณ</b> · หมายเหตุ: วิดีโอใช้ตัวถอด (VPU) แยก ไม่ใช่ GPU</li>
          <li><b>RAM ใช้ / Storage ใช้</b> — เลขซ้าย = %ที่ใช้ · เลขขวา (ชิด status bar) = <b>ที่ใช้ / ความจุรวม</b> ตรงกับ % เลย เช่น 30% → <code>2.3 / 7.7 GB</code> (ที่ว่างดูจากช่องว่างของแถบ) · RAM Android ใช้สูงเป็นปกติ เขียว &lt;85%</li>
          <li><b>Top CPU</b> — โปรเซสที่กิน CPU สูงสุด · เลขขวา = <b>ใช้ / เต็ม</b> โดยเต็ม = จำนวนคอร์×100% (เช่น <code>90% / 400%</code> = ใช้ 90 จาก 4 คอร์) · ไว้จับแอปวิ่งเพี้ยน</li>
          <li><b>Cache (Fully)</b> — MB จริง (ไม่มี "เต็ม" ตายตัว — cache ยืดหดเองตามพื้นที่ว่าง) · เป็นค่าที่ควร<b>เล็ก</b> เขียว &lt;300MB · โตผิดปกติ (&gt;500MB) ค่อยสงสัย</li>
          <li><b>ประเภทเน็ต</b> — 🔌 <b>LAN (สาย)</b> = ต่อ ethernet นิ่งสุด (เขียว) · 📶 <b>WiFi</b> โชว์ RSSI (dBm ใกล้ 0 = แรง) เขียว ≥-55 / เหลือง -55~-67 / แดง &lt;-67 · เลขขวา = link speed + ย่าน (2.4/5GHz)</li>
          <li><b>ความเร็ว (link)</b> — ความเร็วลิงก์ที่เจรจาได้ (WiFi PHY rate / ความเร็ว ethernet) หน่วย Mbps · <b>ไม่ใช่ speed test จริง</b> (ไม่โหลดข้อมูลมาวัด) · เขียว ≥50 · เหลือง 20-50 · แดง &lt;20 (ช้า)</li>
          <li><b>WiFi หลุด (IP)</b> — จำนวนครั้งที่ <b>WiFi ต่ออยู่แต่เข้าถึง router ไม่ได้</b> (IP reachability loss) ในช่วงล่าสุด · &gt;0 = เน็ต/router มีปัญหา → content โหลดสะดุด → เสี่ยง ANR · เขียว 0</li>
          <li><b>Player ที่รัน</b> — <b>ตัวที่ตั้งให้เล่นจริง</b> (เช็กจาก process ที่รันอยู่ ไม่ใช่ snapshot วินาทีเดียว) · Fully/Yodeck รันอยู่ = เขียว (ปกติ) · <b>2 ตัวพร้อมกัน</b> = เหลือง (ซ้ำ เปลือง RAM) · <b>ไม่มี player รัน</b> = แดง (จอหลุด/พัง)</li>
        </ul>
        <Text size={1} style={{ marginTop: 12, marginBottom: 6, display: 'block', fontWeight: 500, color: '#0E3361' }}>เกณฑ์สีของแถบ (status bar)</Text>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#8b98ae' }}>
                <th style={{ textAlign: 'left', padding: '4px 14px 4px 0', fontWeight: 500 }}></th>
                <th style={{ textAlign: 'left', padding: '4px 14px 4px 0', fontWeight: 500, whiteSpace: 'nowrap' }}><span style={{ color: GREEN }}>● ปกติ</span></th>
                <th style={{ textAlign: 'left', padding: '4px 14px 4px 0', fontWeight: 500, whiteSpace: 'nowrap' }}><span style={{ color: AMBER }}>● เฝ้าดู</span></th>
                <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 500, whiteSpace: 'nowrap' }}><span style={{ color: RED }}>● มีปัญหา</span></th>
              </tr>
            </thead>
            <tbody>
              {THRESHOLDS.map(t => (
                <tr key={t.m} style={{ borderTop: '1px solid #f1f3f6' }}>
                  <td style={{ padding: '4px 14px 4px 0', color: '#334155', fontWeight: 500, whiteSpace: 'nowrap' }}>{t.m}</td>
                  <td style={{ padding: '4px 14px 4px 0', color: GREEN, whiteSpace: 'nowrap' }}>{t.g}</td>
                  <td style={{ padding: '4px 14px 4px 0', color: AMBER, whiteSpace: 'nowrap' }}>{t.a}</td>
                  <td style={{ padding: '4px 0', color: RED, whiteSpace: 'nowrap' }}>{t.r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Text size={0} muted style={{ marginTop: 8, display: 'block' }}>
          RAM/Storage/CPU สเกลต่างกันตามความเสี่ยงจริง — RAM ตั้งเกณฑ์สูงเพราะ Android ใช้แรมสูงเป็นปกติ, Storage ระวังตั้งแต่ 70%, CPU เทียบกับเต็มเครื่อง (คอร์×100%) · แถว <b>ANR 7 วัน</b> ใช้สีจาก<b>เทรนด์</b> (เทียบสัปดาห์ก่อน) ไม่ใช่เกณฑ์ตายตัว
        </Text>
      </Card>
    </Box>
  )
}

export default KioskHealthTool
