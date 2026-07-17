import { useEffect, useState, useCallback } from 'react'
import { useClient } from 'sanity'
import { Box, Card, Flex, Stack, Text, Heading, Button, Spinner } from '@sanity/ui'

// Content Footprint — media size + file counts per project (playlist + menu
// category), projects as columns / metrics as rows. Queries Sanity directly via
// the Studio client (asset docs carry `size` in bytes). No API route / Netlify.

const NAVY = '#0E3361', BRONZE = '#C9864C'
const mb = (b: number) => (b / 1048576).toFixed(1)

const OF_BYTES = `coalesce(primaryImage.asset->size,0)+coalesce(math::sum(images[].asset->size),0)+coalesce(math::sum(listingImages[].asset->size),0)+coalesce(math::sum(menuItems[].image.asset->size),0)+coalesce(math::sum(orderItems[].image.asset->size),0)`
const OF_FILES = `select(defined(primaryImage.asset)=>1,0)+coalesce(count(images[].asset),0)+coalesce(count(listingImages[].asset),0)+coalesce(count(menuItems[].image.asset),0)+coalesce(count(orderItems[].image.asset),0)`
const PL_BYTES = `coalesce(media->videoFile.asset->size,0)+coalesce(media->posterImage.asset->size,0)+coalesce(media->imageFile.asset->size,0)+coalesce(math::sum(media->imageFiles[].asset->size),0)`

const QUERY = `{
  "projects": *[_type=="project" && isActive==true] | order(code.current){
    "code": code.current,
    "playlistBytes": math::sum(*[_type=="playlistItem" && project._ref==^._id]{"b": ${PL_BYTES}}.b),
    "items":  count(*[_type=="playlistItem" && project._ref==^._id]),
    "videos": count(*[_type=="playlistItem" && project._ref==^._id && defined(media->videoFile.asset)]),
    "imageFiles": math::sum(*[_type=="playlistItem" && project._ref==^._id]{"n": coalesce(count(media->imageFiles[].asset),0)+select(defined(media->imageFile.asset)=>1,0)}.n),
    "menuBytes": math::sum(*[_type=="offer" && (scope=="global" || ^._id in projects[]._ref)]{"b": ${OF_BYTES}}.b),
    "menuFiles": math::sum(*[_type=="offer" && (scope=="global" || ^._id in projects[]._ref)]{"n": ${OF_FILES}}.n)
  },
  "offers": *[_type=="offer"]{ "cat": coalesce(category,"อื่นๆ"), "scope": scope, "bytes": ${OF_BYTES}, "files": ${OF_FILES} }
}`

interface Proj { code: string; playlistBytes: number; items: number; videos: number; imageFiles: number; menuBytes: number; menuFiles: number }
interface Off { cat: string; scope: string; bytes: number; files: number }
interface Cat { cat: string; bytes: number; files: number; offers: number; projectScoped: boolean }

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#8b98ae', fontWeight: 500, whiteSpace: 'nowrap' }
const rowTd: React.CSSProperties = { padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }
const lblTd: React.CSSProperties = { ...rowTd, color: '#5c6b82', position: 'sticky', left: 0, background: '#fff' }

function Bar({ pct, color }: { pct: number; color: string }) {
  return <div style={{ height: 6, borderRadius: 4, background: '#EEF1F6', marginTop: 4 }}><div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%', borderRadius: 4, background: color }} /></div>
}

export function ContentFootprintTool() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [projects, setProjects] = useState<Proj[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const d = await client.fetch<{ projects: Proj[]; offers: Off[] }>(QUERY)
      const m = new Map<string, Cat>()
      for (const o of d.offers || []) {
        const c = m.get(o.cat) || { cat: o.cat, bytes: 0, files: 0, offers: 0, projectScoped: false }
        c.bytes += o.bytes || 0; c.files += o.files || 0; c.offers += 1
        if (o.scope && o.scope !== 'global') c.projectScoped = true
        m.set(o.cat, c)
      }
      setProjects(d.projects || [])
      setCats(Array.from(m.values()).sort((a, b) => b.bytes - a.bytes))
      setUpdated(new Date()); setError(null)
    } catch (e: any) { setError(e?.message || String(e)) } finally { setLoading(false) }
  }, [client])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <Flex align="center" justify="center" padding={5}><Spinner /></Flex>
  if (error) return <Box padding={4}><Card padding={4} tone="critical" radius={3}><Text>โหลดข้อมูลไม่สำเร็จ: {error}</Text></Card></Box>

  const maxPlay = Math.max(...projects.map(p => p.playlistBytes), 1)
  const maxMenu = Math.max(...projects.map(p => p.menuBytes), 1)
  const maxTotal = Math.max(...projects.map(p => p.playlistBytes + p.menuBytes), 1)
  const catMax = Math.max(...cats.map(c => c.bytes), 1)
  const grand = projects.reduce((a, p) => a + p.playlistBytes + p.menuBytes, 0)

  return (
    <Box padding={4}>
      <Flex align="center" justify="space-between" style={{ marginBottom: 16 }}>
        <Stack space={2}>
          <Heading size={3}>ขนาดคอนเทนต์ต่อโครงการ</Heading>
          <Text size={1} muted>playlist + menu category · จาก Sanity (asset size จริง) · รวม {mb(grand)} MB</Text>
        </Stack>
        <Flex align="center" gap={3}>
          {updated && <Text size={1} muted>อัปเดต {updated.toLocaleTimeString('th-TH')}</Text>}
          <Button text="Refresh" mode="ghost" onClick={fetchData} />
        </Flex>
      </Flex>

      <Card radius={3} shadow={1} style={{ overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e6e9f1' }}>
              <th style={{ ...th, position: 'sticky', left: 0, background: '#fff', minWidth: 140 }}></th>
              {projects.map(p => (
                <th key={p.code} style={{ ...th, minWidth: 118 }}>
                  <div style={{ fontSize: 13, color: '#0b1b33', fontWeight: 500 }}>{p.code}</div>
                  <div style={{ fontSize: 11, color: '#8b98ae', fontWeight: 400 }}>{p.items} slots</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lblTd}>Playlist — ขนาด</td>
              {projects.map(p => <td key={p.code} style={{ ...rowTd, verticalAlign: 'top' }}><div style={{ color: NAVY, fontWeight: 500 }}>{mb(p.playlistBytes)} MB</div><Bar pct={p.playlistBytes / maxPlay * 100} color={NAVY} /></td>)}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lblTd}>Playlist — ไฟล์</td>
              {projects.map(p => <td key={p.code} style={{ ...rowTd, color: '#334155' }}>{p.videos} วิดีโอ · {p.imageFiles} รูป</td>)}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lblTd}>Menu category — ขนาด</td>
              {projects.map(p => <td key={p.code} style={{ ...rowTd, verticalAlign: 'top' }}><div style={{ color: NAVY, fontWeight: 500 }}>{mb(p.menuBytes)} MB</div><Bar pct={p.menuBytes / maxMenu * 100} color={NAVY} /></td>)}
            </tr>
            <tr style={{ borderBottom: '1px solid #f1f3f6' }}>
              <td style={lblTd}>Menu category — ไฟล์</td>
              {projects.map(p => <td key={p.code} style={{ ...rowTd, color: '#334155' }}>{p.menuFiles} ไฟล์</td>)}
            </tr>
            <tr style={{ borderTop: '2px solid #e6e9f1', background: '#fafbfc' }}>
              <td style={{ ...lblTd, background: '#fafbfc', color: NAVY, fontWeight: 500 }}>รวมขนาด</td>
              {projects.map(p => { const t = p.playlistBytes + p.menuBytes; return <td key={p.code} style={{ ...rowTd, verticalAlign: 'top' }}><div style={{ color: NAVY, fontWeight: 600, fontSize: 13 }}>{mb(t)} MB</div><Bar pct={t / maxTotal * 100} color={BRONZE} /></td> })}
            </tr>
          </tbody>
        </table>
      </Card>

      <Heading size={1} style={{ marginBottom: 10 }}>รายละเอียด Menu Category (offer รูป — ส่วนใหญ่ global แชร์ทุกจอ)</Heading>
      <Card radius={3} shadow={1} style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e6e9f1' }}>
              <th style={th}>Category</th>
              <th style={{ ...th, textAlign: 'right' }}>offers</th>
              <th style={{ ...th, textAlign: 'right' }}>ไฟล์</th>
              <th style={th}>ขนาด</th>
              <th style={th}>ขอบเขต</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(c => (
              <tr key={c.cat} style={{ borderBottom: '1px solid #f1f3f6' }}>
                <td style={{ ...rowTd, fontWeight: 500, color: '#0b1b33' }}>{c.cat}</td>
                <td style={{ ...rowTd, textAlign: 'right', color: '#5c6b82' }}>{c.offers}</td>
                <td style={{ ...rowTd, textAlign: 'right', fontWeight: 500 }}>{c.files}</td>
                <td style={rowTd}><Flex align="center" gap={2}><div style={{ width: 64, height: 6, borderRadius: 4, background: '#EEF1F6', overflow: 'hidden' }}><div style={{ width: `${Math.max(2, c.bytes / catMax * 100)}%`, height: '100%', background: NAVY }} /></div><span>{mb(c.bytes)} MB</span></Flex></td>
                <td style={{ ...rowTd, color: c.projectScoped ? BRONZE : '#94a3b8' }}>{c.projectScoped ? 'เฉพาะบางจอ' : 'global (ทุกจอ)'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Text size={1} muted style={{ marginTop: 16, display: 'block', lineHeight: 1.6 }}>
        Playlist = ไฟล์ที่จอแต่ละโครงการเล่นจริง (แยกตามโครงการ) · Menu category = รูป offer ในเมนู —
        ส่วนใหญ่ scope global จึงแชร์ทุกจอ (ยกเว้นบาง category เช่น forSale) · ขนาด menu ต่อโครงการเป็นค่าประมาณสูงสุด · byte จริงของ asset ใน Sanity
      </Text>
    </Box>
  )
}

export default ContentFootprintTool
