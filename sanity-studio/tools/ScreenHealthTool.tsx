import { useEffect, useState, useCallback } from 'react'
import { useClient } from 'sanity'
import { Box, Card, Flex, Grid, Stack, Text, Badge, Spinner, Heading, Button } from '@sanity/ui'

// Screen Health tool — renders `screenStatus` documents that are kept in sync
// from Yodeck offline / "came back online" alert emails (Gmail → Sanity sync).
// Read-only view: no writes happen here.

interface ScreenStatus {
  _id: string
  screenName?: string
  status?: 'down' | 'stale' | 'ok'
  downSince?: string
  lastEventType?: string
  lastEventAt?: string
  incidents?: number
  offlineAlerts?: number
  windowDays?: number
  syncedAt?: string
}

const QUERY = `*[_type == "screenStatus"]{
  _id, screenName, status, downSince, lastEventType, lastEventAt, incidents, offlineAlerts, windowDays, syncedAt
}`

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const humanDur = (from?: string) => {
  if (!from) return '—'
  const h = (Date.now() - new Date(from).getTime()) / 3.6e6
  if (h < 1) return `${Math.round(h * 60)} นาที`
  if (h < 48) return `${h.toFixed(1)} ชม.`
  return `${Math.round(h / 24)} วัน`
}

const tone = (s?: string) => (s === 'down' ? 'critical' : s === 'stale' ? 'caution' : 'positive')
const label = (s?: string) => (s === 'down' ? 'ยังดับอยู่' : s === 'stale' ? 'ไม่แน่ใจ' : 'ปกติ/หายเอง')

function StatCard({ num, lbl, tone }: { num: number; lbl: string; tone?: 'critical' | 'caution' | 'positive' | 'default' }) {
  return (
    <Card padding={3} radius={3} shadow={1} tone={tone ?? 'default'}>
      <Stack space={2}>
        <Heading size={4}>{num}</Heading>
        <Text size={1} muted>{lbl}</Text>
      </Stack>
    </Card>
  )
}

export function ScreenHealthTool() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [rows, setRows] = useState<ScreenStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await client.fetch<ScreenStatus[]>(QUERY)
      setRows(res || [])
      setUpdated(new Date())
      setError(null)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  if (loading) return <Flex align="center" justify="center" padding={5}><Spinner /></Flex>
  if (error) return <Box padding={4}><Card padding={4} tone="critical" radius={3}><Text>โหลดข้อมูลไม่สำเร็จ: {error}</Text></Card></Box>

  const down = rows.filter(r => r.status === 'down').sort((a, b) => (a.downSince || '').localeCompare(b.downSince || ''))
  const stale = rows.filter(r => r.status === 'stale')
  const ok = rows.filter(r => r.status === 'ok')
  const totalIncidents = rows.reduce((s, r) => s + (r.incidents || 0), 0)
  const maxInc = Math.max(1, ...rows.map(r => r.incidents || 0))
  const byInc = [...rows].sort((a, b) => (b.incidents || 0) - (a.incidents || 0))

  return (
    <Box padding={4}>
      <Flex align="center" justify="space-between" style={{ marginBottom: 16 }}>
        <Stack space={2}>
          <Heading size={3}>จอ Signage — สรุปสุขภาพ</Heading>
          <Text size={1} muted>ยังดับอยู่ = ต้องไปดู · ปกติ/หายเอง = blip · จาก Yodeck alert emails</Text>
        </Stack>
        <Flex align="center" gap={3}>
          {updated && <Text size={1} muted>อัปเดต {fmt(updated.toISOString())}</Text>}
          <Button text="Refresh" mode="ghost" onClick={fetchData} />
        </Flex>
      </Flex>

      <Grid columns={4} gap={3} style={{ marginBottom: 20 }}>
        <StatCard num={down.length} lbl="ยังดับอยู่ (ต้องไปดู)" tone="critical" />
        <StatCard num={stale.length} lbl="ไม่แน่ใจ (เช็กเพิ่ม)" tone="caution" />
        <StatCard num={ok.length} lbl="ปกติ / หายเอง" tone="positive" />
        <StatCard num={totalIncidents} lbl="รวมครั้งที่ดับ" />
      </Grid>

      <Card padding={4} radius={3} shadow={1} style={{ marginBottom: 16 }}>
        <Heading size={1} style={{ marginBottom: 12 }}>🔴 ยังดับอยู่ — ต้องไปดูจริง</Heading>
        {down.length === 0 ? (
          <Text size={1} muted>ไม่มีจอที่ยังดับอยู่ตอนนี้ 🎉</Text>
        ) : (
          <Stack space={3}>
            {down.map(r => (
              <Flex key={r._id} align="center" justify="space-between">
                <Flex align="center" gap={3}>
                  <Badge tone="critical">DOWN</Badge>
                  <Text weight="semibold">{r.screenName}</Text>
                </Flex>
                <Text size={1} muted>ดับตั้งแต่ {fmt(r.downSince)} · {humanDur(r.downSince)}</Text>
              </Flex>
            ))}
          </Stack>
        )}
      </Card>

      <Card padding={4} radius={3} shadow={1} style={{ marginBottom: 16 }}>
        <Heading size={1} style={{ marginBottom: 12 }}>📊 จอที่ดับบ่อยที่สุด</Heading>
        <Stack space={3}>
          {byInc.slice(0, 12).map(r => (
            <Flex key={r._id} align="center" gap={3}>
              <Box style={{ width: 140, flex: 'none' }}><Text size={1}>{r.screenName}</Text></Box>
              <Box style={{ flex: 1, background: '#eef1f5', borderRadius: 6, height: 18 }}>
                <Box style={{
                  width: `${Math.round(((r.incidents || 0) / maxInc) * 100)}%`,
                  minWidth: r.incidents ? 18 : 0,
                  height: 18, borderRadius: 6,
                  background: r.status === 'down' ? '#e02424' : r.status === 'stale' ? '#d97706' : '#3b82f6',
                }} />
              </Box>
              <Box style={{ width: 32, flex: 'none', textAlign: 'right' }}><Text size={1} weight="semibold">{r.incidents || 0}</Text></Box>
            </Flex>
          ))}
        </Stack>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Heading size={1} style={{ marginBottom: 12 }}>รายจอทั้งหมด</Heading>
        <Stack space={0}>
          <Flex style={{ padding: '8px 0', borderBottom: '1px solid #e6e9ee' }}>
            <Box style={{ flex: 2 }}><Text size={1} muted>จอ</Text></Box>
            <Box style={{ flex: 1 }}><Text size={1} muted>สถานะ</Text></Box>
            <Box style={{ flex: 1, textAlign: 'right' }}><Text size={1} muted>ครั้งที่ดับ</Text></Box>
            <Box style={{ flex: 1, textAlign: 'right' }}><Text size={1} muted>อีเมลเตือน</Text></Box>
            <Box style={{ flex: 2, textAlign: 'right' }}><Text size={1} muted>ล่าสุด</Text></Box>
          </Flex>
          {byInc.map(r => (
            <Flex key={r._id} align="center" style={{ padding: '8px 0', borderBottom: '1px solid #f1f3f6' }}>
              <Box style={{ flex: 2 }}><Text size={1} weight="semibold">{r.screenName}</Text></Box>
              <Box style={{ flex: 1 }}><Badge tone={tone(r.status)}>{label(r.status)}</Badge></Box>
              <Box style={{ flex: 1, textAlign: 'right' }}><Text size={1}>{r.incidents || 0}</Text></Box>
              <Box style={{ flex: 1, textAlign: 'right' }}><Text size={1}>{r.offlineAlerts || 0}</Text></Box>
              <Box style={{ flex: 2, textAlign: 'right' }}><Text size={1} muted>{r.lastEventType === 'online' ? 'กลับมาปกติ' : 'แจ้งดับ'} · {fmt(r.lastEventAt)}</Text></Box>
            </Flex>
          ))}
        </Stack>
      </Card>
    </Box>
  )
}

export default ScreenHealthTool
