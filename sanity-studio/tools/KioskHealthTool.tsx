import { useEffect, useState, useCallback } from 'react'
import { Box, Card, Flex, Stack, Text, Heading, Button, Spinner, Badge } from '@sanity/ui'

// Fleet status — one column per box, two sources merged:
//  • beacon  (/api/kiosk-beacon)  — HomeApp itself reports every 5 min (slide
//    "homeapp@<deviceId>", err = "wd= cache= store= home= lock= screen= …")
//  • health  (/api/kiosk-health)  — a PC on the VPN collects OS metrics over adb
//    every 4h (ANR, RAM, storage, net, chip) and carries the box's HomeApp id
// Boxes are joined on the HomeApp device id, not on the project name baked into
// the web page: since 2026-09 every box runs HomeApp, Noble A and B share one
// project, and the home box's page still says "mahogany-tower".
//
// Actions (restart, capture, screen on/off) live in the HomeApp console — this
// page only reads. Both APIs are on aquamx-handoff with CORS '*'.

const API = 'https://app.aquamx.biz'
const CONSOLE = 'https://aquamx.web.app/'
const GREEN = '#2E9E5B', AMBER = '#C9864C', RED = '#B23B2E', GREY = '#cbd2dd'

// HomeApp id → adb box name, used until the collector has reported `homeappId`
// itself (it reads the id off the box every run). Re-pairing a box changes the
// id: the collector's box table (tools/kiosk-health.ps1) is the source of truth.
const FALLBACK_IDS: Record<string, string> = {
  'AX-AA5KNK': '39-by-sansiri',
  'AX-RXWDNM': 'mahogany-tower',
  'AX-4RADKY': 'noble-be19a',
  'AX-TJTX8G': 'noble-be19b',
  'AX-EKTYC4': 'lumpini-24',
  'AX-8DW84X': 'the-room-skv21',
  'SD2603-001': 'SD2603-001',
}

interface Beacon { project: string; bid: string; slide: string; upMin: number; minAgo: number; online: boolean; scr: string; board: string; andr: string; err: string }
interface Health { device: string; homeappId: string; anrToday: number; anrYesterday: number; anr7d: number; anr7dPrev: number; topCpu: string; cores: number; ramUsedPct: number; ramFreeMB: number; ramTotalMB: number; storagePct: number; storageTotalMB: number; storageFreeMB: number; apps: string; focus: string; screenRes: string; wifiRssi: number; wifiLink: number; wifiFreq: number; wifiReachLost: number; netType: string; chip: string; homeApp: string; screenAwake: string; checkedMinAgo: number; anrCause: string; anrFixed: string; anrPending: string; anrAssessed: string }
interface Row { device: string; id: string; beacon?: Beacon; health?: Health }

// HomeApp beacon `err` field — "wd=0 cache=801/18 store=36MB home=yes lock=off screen=on cmd=… api=host"
interface AppStats { wd?: number; cacheHits?: number; cacheMiss?: number; storeMB?: number; home?: string; lock?: string; screen?: string; cmd?: string; api?: string }
function parseStats(err: string): AppStats {
  const s: AppStats = {}
  for (const [, k, v] of String(err || '').matchAll(/(\w+)=(\S+)/g)) {
    if (k === 'wd') s.wd = +v
    else if (k === 'cache') { const m = v.match(/^(\d+)\/(\d+)/); if (m) { s.cacheHits = +m[1]; s.cacheMiss = +m[2] } }
    else if (k === 'store') s.storeMB = parseInt(v) || 0
    else if (k === 'home') s.home = v
    else if (k === 'lock') s.lock = v
    else if (k === 'screen') s.screen = v
    else if (k === 'cmd') s.cmd = v
    else if (k === 'api') s.api = v
  }
  return s
}

// screen resolution string ("3840x2160@2") → a short spec label + is4k flag
function resSpec(scr: string): { label: string; dims: string; is4k: boolean } {
  const m = String(scr || '').match(/(\d+)\s*x\s*(\d+)/)
  if (!m) return { label: '', dims: '', is4k: false }
  const w = +m[1], h = +m[2], big = Math.max(w, h)
  const is4k = big >= 3200
  const label = is4k ? '4K' : big >= 1800 ? '1080p' : big >= 1200 ? '720p' : `${big}p`
  return { label, dims: `${w}×${h}`, is4k }
}

const fmtUp = (m: number) => (m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)
const fmtAgo = (m: number) => (m < 1 ? 'now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`)
const fmtAgeTh = (m: number) => (m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : `${Math.floor(m / 60)} ชม. ${m % 60} น.ที่แล้ว`)

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
// prev===0 = no baseline yet (monitoring hasn't covered the older window), NOT a perfect week
function trendColor(cur: number, prev: number) { return prev === 0 ? (cur === 0 ? GREEN : '#64748b') : cur < prev ? GREEN : cur > prev ? RED : AMBER }
function trendArrow(cur: number, prev: number) { return prev === 0 ? (cur === 0 ? '' : 'รอฐาน') : cur < prev ? '↓ ดีขึ้น' : cur > prev ? '↑ แย่ลง' : '→ เท่าเดิม' }
function ramColor(p: number) { return p < 85 ? GREEN : p < 93 ? AMBER : RED }
function stColor(p: number) { return p < 70 ? GREEN : p < 90 ? AMBER : RED }
function cpuNum(s: string) { const m = s.match(/([\d.]+)%/); return m ? parseFloat(m[1]) : 0 }
function cpuColor(n: number) { return n < 50 ? GREEN : n <= 80 ? AMBER : RED }
function rssiColor(r: number) { return r >= -55 ? GREEN : r >= -67 ? AMBER : RED }
const wifiBand = (mhz: number) => (mhz >= 5000 ? '5GHz' : mhz > 0 ? '2.4GHz' : '')

const APP_NAMES: Record<string, string> = {
  'biz.aquamx.homeapp': 'AquaMX HomeApp (player)',
  'de.ozerov.fully': 'Fully Kiosk (จอดไว้)',
  'de.ozerov.fully:foreground': 'Fully Kiosk (บริการเบื้องหลัง)',
  'com.fullykiosk.emm': 'Fully EMM (จอดไว้)',
  'com.fullykiosk.singleapp': 'Fully SingleApp (จอดไว้)',
  'com.yodeck.android': 'Yodeck (จอดไว้)',
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
// Always shown in the app matrix even when on every screen: the player, the
// parked players (a Fully that woke up is news), VPN, and the drift launcher.
const isKeyApp = (pkg: string) => /aquamx|fully|yodeck|tailscale|vlocker|speedtest|launcher3/.test(pkg)

// The collector reports the PLAYER that's actually running (stable), not a
// momentary window snapshot. HomeApp = fine. A legacy player still running =
// amber (it should be parked). Nothing = the box fell off.
function playerCell(focus: string): { txt: string; col: string } {
  switch (focus) {
    case 'biz.aquamx.homeapp': return { txt: 'AquaMX HomeApp ✓', col: '#1b5e3a' }
    case 'de.ozerov.fully':    return { txt: 'Fully Kiosk ⚠ (ควรจอดไว้)', col: AMBER }
    case 'com.yodeck.android': return { txt: 'Yodeck ⚠ (ควรจอดไว้)', col: AMBER }
    case 'multi':              return { txt: 'Fully + Yodeck — ซ้ำ 2 ตัว ⚠', col: AMBER }
    case 'none':
    case '':                   return { txt: 'ไม่มี player รัน ⚠', col: RED }
    default:                   return { txt: `${appName(focus)} ⚠ (จอหลุด)`, col: RED }
  }
}

// HOME app = what the OS shows when the player dies. A stock launcher means NO
// kiosk home → the screen drifts to a blank launcher on any crash.
function homeCell(pkg: string): { txt: string; col: string } {
  if (!pkg) return { txt: '—', col: GREY }
  if (/launcher3|nexuslauncher|quickstep|trebuchet/i.test(pkg)) return { txt: 'Launcher เปล่า ⚠ (จอหลุดง่าย)', col: RED }
  if (pkg === 'android')          return { txt: 'ไม่ได้ตั้ง home ⚠ (resolver)', col: RED }
  if (/aquamx|homeapp/i.test(pkg)) return { txt: 'AquaMX HomeApp ✓', col: '#1b5e3a' }
  if (/fully|ozerov/i.test(pkg))  return { txt: 'Fully (kiosk home)', col: AMBER }
  if (/yodeck/i.test(pkg))        return { txt: 'Yodeck (kiosk home)', col: AMBER }
  return { txt: appName(pkg), col: '#334155' }
}

const gb = (mb: number) => `${(mb / 1024).toFixed(mb < 102400 ? 1 : 0)} GB`

// static SoC table — the real difference between boxes (cores/clock/GPU/tier)
const CHIP_SPEC: Record<string, { cpu: string; clock: string; gpu: string; tier: string; rank: number }> = {
  RK3566:  { cpu: '4×A55',       clock: '1.8GHz', gpu: 'Mali-G52',      tier: 'เริ่มต้น', rank: 1 },
  RK3568:  { cpu: '4×A55',       clock: '2.0GHz', gpu: 'Mali-G52',      tier: 'กลาง',    rank: 2 },
  RK3588:  { cpu: '4×A76+4×A55', clock: '2.4GHz', gpu: 'Mali-G610 MP4', tier: 'เรือธง',  rank: 3 },
  RK3588S: { cpu: '4×A76+4×A55', clock: '2.4GHz', gpu: 'Mali-G610 MP4', tier: 'เรือธง',  rank: 3 },
}
const tierStyle = (rank: number) => rank >= 3 ? { color: '#7a4a1e', background: '#F6E5D0' } : rank === 2 ? { color: '#0E3361', background: '#E3EEFB' } : { color: '#5c6b82', background: '#EEF1F6' }

// colour cutoffs — in lockstep with the *Color() functions above
const THRESHOLDS: { m: string; g: string; a: string; r: string }[] = [
  { m: 'ANR วันนี้',               g: '0',        a: '1–3',       r: '> 3' },
  { m: 'RAM ใช้',                  g: '< 85%',    a: '85–92%',    r: '≥ 93%' },
  { m: 'Storage ใช้',              g: '< 70%',    a: '70–89%',    r: '≥ 90%' },
  { m: 'Top CPU (ของเต็มเครื่อง)', g: '< 50%',    a: '50–80%',    r: '> 80%' },
  { m: 'Watchdog รีโหลด',          g: '0',        a: '1–3',       r: '> 3' },
]

const METRICS: { label: string; sub?: string; val: (h: Health) => string; cap?: (h: Health) => string; pct?: (h: Health) => number; col: (h: Health) => string }[] = [
  { label: 'ANR วันนี้ (เมื่อวาน)', val: h => `${h.anrToday} (${h.anrYesterday})`, pct: h => Math.min(h.anrToday / 20 * 100, 100), col: h => anrColor(h.anrToday) },
  { label: 'ANR 7 วัน (ก่อนหน้า)', val: h => `${h.anr7d} (${h.anr7dPrev})`, cap: h => trendArrow(h.anr7d, h.anr7dPrev), pct: h => (h.anr7d + h.anr7dPrev) > 0 ? h.anr7d / Math.max(h.anr7d, h.anr7dPrev) * 100 : 3, col: h => trendColor(h.anr7d, h.anr7dPrev) },
  { label: 'RAM ใช้', val: h => `${h.ramUsedPct}%`, cap: h => h.ramTotalMB > 0 ? `${gb(h.ramTotalMB * h.ramUsedPct / 100)} / ${gb(h.ramTotalMB)}` : '', pct: h => h.ramUsedPct, col: h => ramColor(h.ramUsedPct) },
  { label: 'Storage ใช้', val: h => `${h.storagePct}%`, cap: h => h.storageTotalMB > 0 ? `${gb(h.storageTotalMB * h.storagePct / 100)} / ${gb(h.storageTotalMB)}` : '', pct: h => h.storagePct, col: h => stColor(h.storagePct) },
  // top reports 100% = ONE core, so full capacity = cores×100%
  { label: 'Top CPU', sub: 'เรียงตาม CPU', val: h => h.topCpu ? h.topCpu.replace(/\s+[\d.]+%\s*$/, '') : '—', cap: h => (h.cores > 0 && h.topCpu) ? `${cpuNum(h.topCpu)}% / ${h.cores * 100}%` : '', pct: h => cpuNum(h.topCpu) / Math.max(1, h.cores), col: h => cpuColor(cpuNum(h.topCpu) / Math.max(1, h.cores)) },
  { label: 'ประเภทเน็ต', sub: 'WiFi / LAN', val: h => h.netType === 'eth' ? '🔌 LAN (สาย)' : (h.netType === 'wifi' || h.wifiRssi) ? `📶 WiFi${h.wifiRssi ? ` · ${h.wifiRssi} dBm` : ''}` : '—', cap: h => h.netType === 'eth' ? 'ethernet' : h.wifiRssi ? wifiBand(h.wifiFreq) : '', col: h => h.netType === 'eth' ? GREEN : h.wifiRssi ? rssiColor(h.wifiRssi) : GREY },
  { label: 'ความเร็ว (link)', sub: 'wifi/lan', val: h => h.wifiLink ? `${h.wifiLink} Mbps` : '—', pct: h => h.wifiLink ? Math.min(h.wifiLink / 600 * 100, 100) : 0, col: h => !h.wifiLink ? GREY : h.wifiLink >= 50 ? GREEN : h.wifiLink >= 20 ? AMBER : RED },
  { label: 'WiFi หลุด (IP)', sub: 'reachability loss', val: h => h.netType === 'eth' ? '—' : h.wifiReachLost >= 0 ? String(h.wifiReachLost) : '—', pct: h => h.netType !== 'eth' && h.wifiReachLost > 0 ? Math.min(h.wifiReachLost / 10 * 100, 100) : 0, col: h => h.netType === 'eth' || h.wifiReachLost < 0 ? GREY : h.wifiReachLost === 0 ? GREEN : h.wifiReachLost <= 3 ? AMBER : RED },
]

const lbl: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: '#5c6b82', lineHeight: 1.3, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }
const cell: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' }
const sub = (t: string) => <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9aa7b8' }}>{t}</span>
const dash = (key: string) => <td key={key} style={{ ...cell, color: GREY, fontSize: 12 }}>—</td>

function Bar({ pct, color }: { pct: number; color: string }) {
  return <div style={{ height: 6, borderRadius: 4, background: '#EEF1F6', marginTop: 4 }}><div style={{ width: `${Math.max(3, Math.min(100, pct))}%`, height: '100%', borderRadius: 4, background: color }} /></div>
}

export function KioskHealthTool() {
  const [rows, setRows] = useState<Row[]>([])
  const [updated, setUpdated] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [appSort, setAppSort] = useState('')     // '' = most-ubiquitous first, else sort by that box's RAM
  const [hideCommon, setHideCommon] = useState(true)

  const load = useCallback(async () => {
    try {
      const [bRes, hRes] = await Promise.all([
        fetch(`${API}/api/kiosk-beacon`, { cache: 'no-store' }),
        fetch(`${API}/api/kiosk-health`, { cache: 'no-store' }),
      ])
      const beacons: Beacon[] = (await bRes.json()).screens || []
      const healths: Health[] = (await hRes.json()).boxes || []

      // HomeApp beacons only — the page's own project-named beacon can't tell
      // boxes apart. Keep the freshest per device id.
      const appBeacon = new Map<string, Beacon>()
      for (const b of beacons) {
        const m = String(b.slide || '').match(/^homeapp@([A-Za-z0-9_-]+)$/)
        if (!m) continue
        const cur = appBeacon.get(m[1])
        if (!cur || b.minAgo < cur.minAgo) appBeacon.set(m[1], b)
      }

      // One row per adb box, joined to its beacon by HomeApp id (collector-
      // reported, else the fallback table). A box that beacons but has no adb
      // entry yet still gets a column, so a freshly paired box is never invisible.
      const byId = new Map<string, Row>()
      const nameOfId = (id: string) => FALLBACK_IDS[id] || id
      for (const h of healths) {
        const id = h.homeappId || Object.keys(FALLBACK_IDS).find(k => FALLBACK_IDS[k] === h.device) || h.device
        const cur = byId.get(id)
        if (!cur || !cur.health || h.checkedMinAgo < cur.health.checkedMinAgo) byId.set(id, { device: h.device, id, health: h })
      }
      for (const [id, b] of Array.from(appBeacon.entries())) {
        // a beacon silent for over a week is a retired/re-paired box, not a column
        if (b.minAgo > 7 * 1440 && !byId.has(id)) continue
        const row = byId.get(id) || { device: nameOfId(id), id }
        row.beacon = b
        byId.set(id, row)
      }
      setRows(Array.from(byId.values()).sort((a, b) => a.device.localeCompare(b.device)))
      setUpdated(new Date().toLocaleTimeString('th-TH'))
      setErr('')
    } catch { setErr('โหลดข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง') } finally { setLoading(false) }
  }, [])

  // Every poll costs the beacon feed a Firestore round; boxes report every
  // 5 min and adb every 4 h, so a 60 s poll bought nothing and (with the
  // console's own poll) burned the free read quota on 2026-09-20. 10 min +
  // the Refresh button.
  useEffect(() => { load(); const t = setInterval(load, 10 * 60_000); return () => clearInterval(t) }, [load])

  if (loading && rows.length === 0) return <Flex align="center" justify="center" padding={5}><Spinner /></Flex>

  const online = rows.filter(r => r.beacon?.online).length
  const healthAges = rows.filter(r => r.health).map(r => r.health!.checkedMinAgo)
  const healthAge = healthAges.length ? Math.min(...healthAges) : null

  // ── App × box matrix ────────────────────────────────────────────────────
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
    if (appSort) return (b.per[appSort] || 0) - (a.per[appSort] || 0)
    if (b.screens !== a.screens) return b.screens - a.screens
    return b.total - a.total
  })
  const isCommon = (e: { key: boolean; screens: number }) => !e.key && appDevices.length > 1 && e.screens === appDevices.length
  const shownApps = hideCommon ? sortedApps.filter(e => !isCommon(e)) : sortedApps
  const hiddenCount = sortedApps.length - shownApps.length

  return (
    <Box padding={4}>
      <Flex align="center" justify="space-between" style={{ marginBottom: 16 }}>
        <Stack space={2}>
          <Heading size={3}>AquaMX Fleet — สถานะจอ</Heading>
          <Text size={1} muted>
            beacon จากกล่องทุก 5 นาที · <b>ข้อมูลระบบ (adb) เก็บ{healthAge === null ? '—' : fmtAgeTh(healthAge)}</b>
            {updated && ` · โหลดหน้า ${updated}`}
          </Text>
          <Text size={0} muted style={{ color: '#9aa7b8' }}>
            หน้านี้อ่านอย่างเดียว — สั่งงานกล่อง (รีสตาร์ต, จับภาพหน้าจอ, เปิด/ปิดจอ) ที่ <a href={CONSOLE} target="_blank" rel="noreferrer" style={{ color: '#0E3361' }}>aquamx.web.app</a> · Refresh = อ่านค่าที่เก็บไว้ใหม่ ตัวเลข adb เปลี่ยนเมื่อ collector รันรอบถัดไป (ทุก 4 ชม.)
          </Text>
        </Stack>
        <Flex align="center" gap={3}>
          <Badge tone={online === rows.length ? 'positive' : 'caution'}>{online} / {rows.length} online</Badge>
          <Button text="Refresh" mode="ghost" onClick={load} />
        </Flex>
      </Flex>

      {err && <Card padding={3} tone="critical" radius={3} style={{ marginBottom: 12 }}><Text size={1}>{err}</Text></Card>}

      <Card radius={3} shadow={1} style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 132 + rows.length * 152 }}>
          <colgroup>
            <col style={{ width: 132 }} />
            {rows.map(r => <col key={r.id} style={{ width: 152 }} />)}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid #e6e9f1' }}>
              <th style={lbl}></th>
              {rows.map(r => (
                <th key={r.id} style={{ padding: '10px 12px', textAlign: 'left', verticalAlign: 'top' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0b1b33', wordBreak: 'break-word' }}>{r.device}</span>
                  <span style={{ display: 'block', fontSize: 10, color: '#b4bcc9', marginTop: 1 }}>{r.id}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* liveness — from the app's own beacon; uptime is the APP's, not the page's hourly reload */}
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>สถานะ{sub('beacon ทุก 5 นาที')}</td>
              {rows.map(r => {
                const on = !!r.beacon?.online
                return (
                  <td key={r.id} style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 8, flex: 'none', background: r.beacon ? (on ? GREEN : RED) : GREY }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: r.beacon ? (on ? '#1b5e3a' : RED) : GREY }}>{r.beacon ? (on ? 'online' : 'offline') : 'ไม่มี beacon'}</span>
                    </div>
                    {r.beacon && <div style={{ fontSize: 11, color: '#8b98ae', marginTop: 2 }}>เปิดมา {fmtUp(r.beacon.upMin)} · {fmtAgo(r.beacon.minAgo)}</div>}
                  </td>
                )
              })}
            </tr>
            {/* panel on/off — the box reports it; off outside on-hours is the schedule, not a fault */}
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>จอ{sub('เปิด/ปิด ตามตาราง')}</td>
              {rows.map(r => {
                const s = r.beacon ? parseStats(r.beacon.err).screen : undefined
                if (!s) return dash(r.id)
                const on = s === 'on'
                return (
                  <td key={r.id} style={{ ...cell, fontSize: 12, fontWeight: 500, color: on ? '#1b5e3a' : '#5c6b82' }}>
                    {on ? '🟢 จอเปิด' : '🌙 จอปิด'}
                    {r.health?.screenAwake && <span style={{ fontSize: 10, color: '#b4bcc9', marginLeft: 6 }}>adb: {r.health.screenAwake === 'yes' ? 'awake' : 'asleep'}</span>}
                  </td>
                )
              })}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>ระบบ (adb){sub('เก็บทุก 4 ชม.')}</td>
              {rows.map(r => (
                <td key={r.id} style={{ ...cell, fontSize: 12, color: r.health ? (r.health.checkedMinAgo > 330 ? AMBER : '#334155') : GREY }}>
                  {r.health ? <>{fmtAgeTh(r.health.checkedMinAgo)}{r.health.checkedMinAgo > 330 ? ' ⚠' : ''}</> : '—'}
                </td>
              ))}
            </tr>
            {/* HomeApp self-report: watchdog reloads + local asset store */}
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>Watchdog{sub('รีโหลดหน้าเว็บเอง')}</td>
              {rows.map(r => {
                const s = r.beacon ? parseStats(r.beacon.err) : undefined
                if (!s || s.wd == null) return dash(r.id)
                const col = s.wd === 0 ? GREEN : s.wd <= 3 ? AMBER : RED
                return (
                  <td key={r.id} style={{ ...cell, height: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: col }}>{s.wd} ครั้ง</span>
                        {s.storeMB != null && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b98ae', whiteSpace: 'nowrap' }}>store {s.storeMB} MB</span>}
                      </div>
                      <div style={{ marginTop: 'auto' }}><Bar pct={Math.min(s.wd / 10 * 100, 100)} color={col} /></div>
                    </div>
                  </td>
                )
              })}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>Player ที่รัน{sub('ตัวที่เล่นอยู่จริง')}</td>
              {rows.map(r => {
                const h = r.health
                if (!h?.focus) return dash(r.id)
                const p = playerCell(h.focus)
                return <td key={r.id} style={{ ...cell, fontSize: 12, fontWeight: 500, wordBreak: 'break-word', color: p.col }}>{p.txt}</td>
              })}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>Home app{sub('ตัวที่คุมจอเมื่อ player ตาย')}</td>
              {rows.map(r => {
                if (!r.health) return dash(r.id)
                const hc = homeCell(r.health.homeApp)
                return <td key={r.id} style={{ ...cell, fontSize: 12, fontWeight: 500, wordBreak: 'break-word', color: hc.col }}>{hc.txt}</td>
              })}
            </tr>
            {/* hardware in ONE row — static facts, compared at a glance, details on hover */}
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>สเปก{sub('จอ · ชิป · Android')}</td>
              {rows.map(r => {
                const phys = resSpec(r.health?.screenRes || '')
                const render = resSpec(r.beacon?.scr || '')
                const chip = r.health?.chip, spec = chip ? CHIP_SPEC[chip] : undefined
                if (!phys.label && !render.label && !chip) return dash(r.id)
                const title = [spec && `${chip}: ${spec.cpu} ${spec.clock} · ${spec.gpu}`, phys.dims && `panel ${phys.dims}`, render.dims && `render ${render.dims}`].filter(Boolean).join('\n')
                return (
                  <td key={r.id} style={cell} title={title}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {(phys.label || render.label) && <span style={{ fontSize: 12, fontWeight: 700, padding: '1px 6px', borderRadius: 3, color: phys.is4k ? '#7a4a1e' : '#5c6b82', background: phys.is4k ? '#F6E5D0' : '#EEF1F6' }}>{phys.label || render.label}</span>}
                      {phys.is4k && render.label && !render.is4k && <span style={{ fontSize: 10, color: '#8b98ae' }}>เรนเดอร์ {render.label}</span>}
                      {chip && <span style={{ fontSize: 12, fontWeight: 600, color: '#0E3361' }}>{chip}</span>}
                      {spec && <span style={{ fontSize: 10, fontWeight: 700, padding: '0 5px', borderRadius: 3, ...tierStyle(spec.rank) }}>{spec.tier}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#b4bcc9', marginTop: 1 }}>{[r.beacon?.board, r.beacon?.andr && `Android ${r.beacon.andr}`].filter(Boolean).join(' · ')}</div>
                  </td>
                )
              })}
            </tr>
            {METRICS.map(m => (
              <tr key={m.label} style={{ borderBottom: '1px solid #f1f3f6' }}>
                <td style={lbl}>{m.label}{m.sub && sub(m.sub)}</td>
                {rows.map(r => {
                  const h = r.health
                  if (!h) return dash(r.id)
                  const col = m.col(h), pct = m.pct ? m.pct(h) : null
                  const cap = m.cap ? m.cap(h) : ''
                  return (
                    <td key={r.id} style={{ ...cell, height: 1 }}>
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

      {/* App × box matrix — the one place to compare what runs where */}
      {sortedApps.length > 0 && (
        <Card radius={3} shadow={1} style={{ overflowX: 'auto', marginBottom: 16 }}>
          <Flex align="center" justify="space-between" gap={3} style={{ padding: '12px 12px 0', flexWrap: 'wrap' }}>
            <Text size={1} weight="semibold">แอปทุกจอ (RAM MB) · <span style={{ fontWeight: 400, color: '#8b98ae' }}>
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
                    <th key={d} onClick={() => setAppSort(active ? '' : d)} title="กดเพื่อเรียงตามจอนี้"
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

      {/* ANR-cause cards — only boxes that carry a diagnosis */}
      {rows.some(r => r.health && (r.health.anrCause || r.health.anrFixed || r.health.anrPending)) && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', alignItems: 'start', marginBottom: 14 }}>
          {rows.filter(r => r.health && (r.health.anrCause || r.health.anrFixed || r.health.anrPending)).map(r => {
            const h = r.health!
            return (
              <Card key={r.id} padding={4} radius={3} shadow={1}>
                <Text size={1} weight="semibold" style={{ color: '#0E3361', display: 'block' }}>{r.device} · สาเหตุ ANR</Text>
                {h.anrAssessed && (() => {
                  const days = assessedDaysAgo(h.anrAssessed) ?? 0
                  const stale = days >= 2 && h.anrToday > 0
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
      )}

      {/* legend — folded, it's reference not status */}
      <Card padding={4} radius={3} shadow={1}>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0E3361' }}>อ่านค่ายังไง · เกณฑ์สี</summary>
          <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: '#1e293b' }}>
            <li><b>สถานะ</b> — beacon จากแอป HomeApp ในกล่องเองทุก 5 นาที · <b>เปิดมา</b> = อายุของแอปตั้งแต่บูต (ไม่ใช่หน้าเว็บที่รีโหลดทุกชั่วโมง)</li>
            <li><b>จอ</b> — กล่องบอกว่าจอเปิดหรือปิด · ปิดนอกเวลาเปิดตามตาราง = ปกติ · ปิดในเวลาทำการ = fleet-health ส่งการ์ด LINE ให้แล้ว</li>
            <li><b>Watchdog</b> — จำนวนครั้งที่แอปต้องรีโหลดหน้าเว็บเอง (ค้าง/ขาว) ตั้งแต่บูต · <b>store</b> = สื่อที่ดาวน์โหลดเก็บในเครื่อง</li>
            <li><b>ANR</b> = <b>A</b>pplication <b>N</b>ot <b>R</b>esponding — แอปค้างเกิน ~5 วิ · <b>วันนี้ (เมื่อวาน)</b> · <b>7 วัน (ก่อนหน้า)</b> เขียว/↓ = ลดลง, แดง/↑ = เพิ่ม, เทา/<b>รอฐาน</b> = ยังเก็บประวัติไม่ถึง 2 สัปดาห์</li>
            <li><b>Player ที่รัน / Home app</b> — ต้องเป็น AquaMX HomeApp ทั้งคู่ · Fully/Yodeck โผล่ = แอปที่จอดไว้ตื่นขึ้นมา (เหลือง) · Launcher เปล่า = จอหลุดง่าย (แดง)</li>
            <li><b>สเปก</b> — ป้าย 4K/1080p คือพาเนล · กล่อง 4K เรนเดอร์ที่ 1080p โดยตั้งใจ (ชิปไม่ไหว) · ชี้ที่ช่องเพื่อดู CPU/GPU</li>
            <li><b>RAM / Storage</b> — เลขซ้าย = %ที่ใช้ · เลขขวา = <b>ที่ใช้ / ความจุรวม</b> · RAM Android ใช้สูงเป็นปกติ เขียว &lt;85%</li>
            <li><b>Top CPU</b> — โปรเซสที่กิน CPU สูงสุด · เลขขวา = ใช้ / เต็ม (คอร์×100%)</li>
            <li><b>เน็ต</b> — 🔌 LAN นิ่งสุด · 📶 WiFi โชว์ RSSI (dBm ใกล้ 0 = แรง) เขียว ≥-55 / เหลือง ถึง -67 / แดง ต่ำกว่า · <b>link</b> = ความเร็วที่เจรจาได้ ไม่ใช่ speed test · <b>WiFi หลุด</b> = ต่ออยู่แต่ถึง router ไม่ได้ กี่ครั้ง</li>
          </ul>
          <Text size={1} style={{ marginTop: 12, marginBottom: 6, display: 'block', fontWeight: 500, color: '#0E3361' }}>เกณฑ์สีของแถบ</Text>
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
        </details>
      </Card>
    </Box>
  )
}

export default KioskHealthTool
