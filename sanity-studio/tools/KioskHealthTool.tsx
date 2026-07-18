import { useEffect, useState, useCallback } from 'react'
import { Box, Card, Flex, Stack, Text, Heading, Button, Spinner, Badge } from '@sanity/ui'

// Kiosk Fleet Health — merges two sources into one matrix (projects = columns):
//  • beacon  (/api/kiosk-beacon)  — pushed by each screen every 5 min, always-on
//  • health  (/api/kiosk-health)  — collected by a PC over adb/VPN every 4h
// Both APIs live on aquamx-handoff (app.aquamx.biz) with CORS '*', so the Studio
// fetches them cross-origin — no Netlify page, no API route here.

const API = 'https://app.aquamx.biz'
const GREEN = '#2E9E5B', AMBER = '#C9864C', RED = '#B23B2E'

interface Beacon { project: string; bid: string; slide: string; upMin: number; minAgo: number; online: boolean; scr: string; err: string; imgFails: string }
interface Health { device: string; anrToday: number; topCpu: string; cores: number; ramUsedPct: number; ramFreeMB: number; ramTotalMB: number; storagePct: number; storageTotalMB: number; storageFreeMB: number; cacheMB: number; apps: string; focus: string; screenAwake: string; checkedMinAgo: number; anrCause: string; anrFixed: string; anrPending: string; anrAssessed: string }
interface Row { device: string; beacon?: Beacon; health?: Health; ghosts?: number }

const fmtUp = (m: number) => (m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)
const fmtAgo = (m: number) => (m < 1 ? 'now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`)

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
function ramColor(p: number) { return p < 85 ? GREEN : p < 93 ? AMBER : RED }
function stColor(p: number) { return p < 70 ? GREEN : p < 90 ? AMBER : RED }
function cpuNum(s: string) { const m = s.match(/([\d.]+)%/); return m ? parseFloat(m[1]) : 0 }
function cpuColor(n: number) { return n < 50 ? GREEN : n <= 80 ? AMBER : RED }

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

// GB label from MB (1 decimal under 100GB, whole above)
const gb = (mb: number) => `${(mb / 1024).toFixed(mb < 102400 ? 1 : 0)} GB`

// `cap` = capacity read shown right-aligned on the bar line ("ว่าง/รวม")
const METRICS: { label: string; val: (h: Health) => string; cap?: (h: Health) => string; pct?: (h: Health) => number; col: (h: Health) => string }[] = [
  { label: 'ANR วันนี้', val: h => String(h.anrToday), pct: h => Math.min(h.anrToday / 20 * 100, 100), col: h => anrColor(h.anrToday) },
  { label: 'RAM ใช้', val: h => `${h.ramUsedPct}%`, cap: h => h.ramTotalMB > 0 ? `${gb(h.ramFreeMB)} / ${gb(h.ramTotalMB)}` : '', pct: h => h.ramUsedPct, col: h => ramColor(h.ramUsedPct) },
  { label: 'Storage ใช้', val: h => `${h.storagePct}%`, cap: h => h.storageTotalMB > 0 ? `${gb(h.storageFreeMB)} / ${gb(h.storageTotalMB)}` : '', pct: h => h.storagePct, col: h => stColor(h.storagePct) },
  { label: 'Cache (Fully)', val: h => h.cacheMB >= 0 ? `${h.cacheMB} MB` : '—', pct: h => Math.min(h.cacheMB / 500 * 100, 100), col: h => h.cacheMB < 300 ? GREEN : h.cacheMB < 500 ? AMBER : RED },
  { label: 'Top CPU', val: h => `${h.topCpu || '—'}${h.cores ? ` · ${h.cores} คอร์` : ''}`, pct: h => cpuNum(h.topCpu) / Math.max(1, h.cores), col: h => cpuColor(cpuNum(h.topCpu) / Math.max(1, h.cores)) },
]

const lbl: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: '#5c6b82', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }
const cell: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' }

function Bar({ pct, color }: { pct: number; color: string }) {
  return <div style={{ height: 6, borderRadius: 4, background: '#EEF1F6', marginTop: 4 }}><div style={{ width: `${Math.max(3, Math.min(100, pct))}%`, height: '100%', borderRadius: 4, background: color }} /></div>
}

export function KioskHealthTool() {
  const [rows, setRows] = useState<Row[]>([])
  const [updated, setUpdated] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

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
        return m ? m[1] : String(b.project)
      }
      const freshest = new Map<string, Beacon>()
      const ghostCount = new Map<string, number>()
      for (const b of beacons) {
        if (String(b.project).startsWith('test-')) continue
        const id = identOf(b)
        if (id === '__AQDEV__') continue
        const cur = freshest.get(id)
        if (!cur || b.minAgo < cur.minAgo) freshest.set(id, b)
        if (cur) ghostCount.set(id, (ghostCount.get(id) || 0) + 1)
      }

      const byDevice = new Map<string, Row>()
      for (const h of healths) byDevice.set(h.device, { device: h.device, health: h })
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

  return (
    <Box padding={4}>
      <Flex align="center" justify="space-between" style={{ marginBottom: 16 }}>
        <Stack space={2}>
          <Heading size={3}>AquaMX Fleet — สุขภาพจอ</Heading>
          <Text size={1} muted>beacon สดทุก 5 นาที · adb health ทุก 4 ชม.{updated && ` · อัปเดต ${updated}`}</Text>
        </Stack>
        <Flex align="center" gap={3}>
          <Badge tone={online === rows.length ? 'positive' : 'caution'}>{online} / {rows.length} online</Badge>
          <Button text="Refresh" mode="ghost" onClick={load} />
        </Flex>
      </Flex>

      {err && <Card padding={3} tone="critical" radius={3} style={{ marginBottom: 12 }}><Text size={1}>{err}</Text></Card>}

      <Card radius={3} shadow={1} style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e6e9f1' }}>
              <th style={{ ...lbl, minWidth: 116 }}></th>
              {rows.map(r => {
                const on = !!r.beacon?.online
                return (
                  <th key={r.device} style={{ padding: '10px 12px', textAlign: 'left', verticalAlign: 'bottom', minWidth: 132 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 8, flex: 'none', background: on ? GREEN : RED }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0b1b33', whiteSpace: 'nowrap' }}>{r.device}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#8b98ae', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {r.beacon ? `${on ? 'online' : 'offline'} · up ${fmtUp(r.beacon.upMin)} · ${fmtAgo(r.beacon.minAgo)}` : 'ไม่มี beacon'}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lbl}>แอปบนจอ</td>
              {rows.map(r => {
                const h = r.health
                if (!h?.focus) return <td key={r.device} style={{ ...cell, color: '#cbd2dd', fontSize: 12 }}>—</td>
                const drift = h.focus !== 'de.ozerov.fully'
                return <td key={r.device} style={{ ...cell, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', color: drift ? RED : '#1b5e3a' }}>{appName(h.focus)}{drift ? ' ⚠' : ''}</td>
              })}
            </tr>
            {METRICS.map(m => (
              <tr key={m.label} style={{ borderBottom: '1px solid #f1f3f6' }}>
                <td style={lbl}>{m.label}</td>
                {rows.map(r => {
                  const h = r.health
                  if (!h) return <td key={r.device} style={{ ...cell, color: '#cbd2dd', fontSize: 12 }}>—</td>
                  const col = m.col(h), pct = m.pct ? m.pct(h) : null
                  const cap = m.cap ? m.cap(h) : ''
                  return (
                    <td key={r.device} style={cell}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: col }}>{m.val(h)}</span>
                        {cap && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b98ae' }}>{cap}</span>}
                      </div>
                      {pct !== null && <Bar pct={pct} color={col} />}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !err && <Text size={1} muted style={{ display: 'block', textAlign: 'center', padding: 24 }}>กำลังโหลด…</Text>}
      </Card>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', marginBottom: 14 }}>
        {rows.filter(r => r.health).map(r => {
          const h = r.health!
          const apps = h.apps ? h.apps.split('|').map(s => { const i = s.lastIndexOf(':'); return { pkg: s.slice(0, i), mb: parseInt(s.slice(i + 1)) || 0 } }).filter(x => x.pkg) : []
          const max = Math.max(...apps.map(x => x.mb), 1)
          const total = apps.reduce((a, x) => a + x.mb, 0)
          return (
            <Stack key={r.device} space={3}>
              {apps.length > 0 && (
                <Card padding={4} radius={3} shadow={1}>
                  <Text size={1} weight="semibold" style={{ marginBottom: 8, display: 'block' }}>{r.device} · แอปที่รันอยู่ ({apps.length}) · รวม ~{total} MB</Text>
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
              )}
              {(h.anrCause || h.anrFixed || h.anrPending) && (
                <Card padding={4} radius={3} shadow={1}>
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
              )}
            </Stack>
          )
        })}
      </div>

      <Card padding={4} radius={3} shadow={1}>
        <Text size={1} weight="semibold" style={{ color: '#0E3361', marginBottom: 8, display: 'block' }}>อ่านค่ายังไง</Text>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: '#1e293b' }}>
          <li><b>ANR</b> = <b>A</b>pplication <b>N</b>ot <b>R</b>esponding — แอปค้างไม่ตอบสนอง (นานเกิน ~5 วินาที) จนระบบเด้งถาม &quot;ปิดแอป / รอ&quot; · เกิดบ่อย = จอมีปัญหา</li>
          <li><b>สด (beacon)</b> — จอ push เองทุก 5 นาที 24 ชม. · บอก online / เปิดมานาน / หน้าเรนเดอร์ไหม</li>
          <li><b>ระบบ (adb)</b> — คอมดึงผ่าน VPN ทุก 4 ชม. · <b>ANR/วัน</b> คือตัวชี้สุขภาพหลัก (0 ดีเยี่ยม เกิน 3 มีปัญหา)</li>
          <li><b>RAM ใช้ / Storage ใช้</b> — เลขซ้าย = %ที่ใช้ · เลขขวา (ชิด status bar) = <b>ว่าง / ความจุรวม</b> เช่น <code>1.9 GB / 3.9 GB</code> · RAM Android ใช้สูงเป็นปกติ เขียว &lt;85%</li>
          <li><b>Top CPU</b> — โปรเซสที่กิน CPU สูงสุด (สเกลตามจำนวนคอร์) · ไว้จับแอปวิ่งเพี้ยน</li>
          <li><b>แอปที่รันอยู่</b> — ควรเป็น Fully Kiosk (เขียว) · ถ้าแดง = จอหลุดไปแอปอื่น</li>
        </ul>
        <Text size={1} muted style={{ marginTop: 10, display: 'block' }}>
          <span style={{ color: GREEN }}>เขียว=ปกติ</span> · <span style={{ color: AMBER }}>เหลือง=เฝ้าดู</span> · <span style={{ color: RED }}>แดง=มีปัญหา</span>
        </Text>
      </Card>
    </Box>
  )
}

export default KioskHealthTool
