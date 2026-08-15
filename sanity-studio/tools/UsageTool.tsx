import { useEffect, useState, useCallback, useMemo } from 'react'
import { useClient } from 'sanity'
import { Box, Card, Flex, Grid, Stack, Text, Badge, Spinner, Heading, Button } from '@sanity/ui'
import {
  aggregateByProject, aggregateByMedia, sumTotals, sumHourly, daysWithData,
  isDeadMedia, screenWasOff, SCREEN_HOURS, pct, num, type UsageRow,
} from './usageMath'

// การใช้งานจอ — what people actually DO with the screens.
//
// Counters ride the health beacon (player → /api/kiosk-beacon), are folded into
// one document per project per day, and come back through /api/kiosk-usage.
// Scans are counted where the mobile page is served. See the spec in the repo
// root: _spec-usage-tracking.md
//
// Two rules this screen exists to respect:
//
//  1. NEVER a trend line. Real numbers here are single digits at first, and a
//     line from 3 to 5 reads as a signal when it is noise. Totals over a period
//     and a ranking say the true thing: which slide earns its slot.
//  2. NEVER report a raw tap count as performance. A slide that has been on the
//     loop for a month out-taps a better one added on Friday. Rate per airing
//     is the honest comparison, so it leads and the raw count follows.
//
// And what it must never claim: viewers. There is no camera and no sensor. The
// denominator is airings — times the slide was on screen — not people.

const API = 'https://app.aquamx.biz'

interface MediaDoc { _id: string; title?: string; offerTitle?: string; type?: string }

export function UsageTool() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [days, setDays]       = useState(7)
  const [rows, setRows]       = useState<UsageRow[]>([])
  const [names, setNames]     = useState<Record<string, MediaDoc>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')
  const [updated, setUpdated] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/kiosk-usage?days=${days}`, { cache: 'no-store' })
      const json = await res.json()
      setRows(json.rows || [])
      setUpdated(new Date().toLocaleTimeString('th-TH'))
      setErr('')
    } catch {
      setErr('โหลดข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง')
    } finally { setLoading(false) }
  }, [days])

  useEffect(() => { load() }, [load])

  // Media ids mean nothing to a human. Resolving them is the whole reason this
  // lives inside Studio rather than as a standalone page.
  const mediaIds = useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => Object.keys(r.media || {}).forEach(id => s.add(id)))
    return Array.from(s)
  }, [rows])

  useEffect(() => {
    if (!mediaIds.length) return
    client.fetch<MediaDoc[]>(
      `*[_id in $ids]{ _id, title, "offerTitle": offer->title_th, type }`, { ids: mediaIds },
    ).then(docs => {
      // merge, don't replace — the API's server-side names got here first
      setNames(prev => {
        const map: Record<string, MediaDoc> = { ...prev }
        docs.forEach(d => { map[d._id] = d })
        return map
      })
    }).catch(err => console.error('[UsageTool] media name lookup failed:', err))
  }, [client, mediaIds])

  // ── aggregate ────────────────────────────────────────────────────────────
  const byProject = useMemo(() => aggregateByProject(rows), [rows])

  const byMedia = useMemo(() => aggregateByMedia(rows), [rows])

  const totals = useMemo(() => sumTotals(rows), [rows])

  const hourly = useMemo(() => sumHourly(rows), [rows])

  const dataDays = useMemo(() => daysWithData(rows), [rows])

  if (loading && !rows.length) return <Flex align="center" justify="center" padding={5}><Spinner /></Flex>

  const funnel = [
    { label: 'ออกอากาศ',        n: totals.air,     note: 'ครั้งที่สไลด์ขึ้นจอ' },
    { label: 'แตะสไลด์',        n: totals.tap,     note: '' },
    { label: 'เปิดป๊อปอัป',      n: totals.detail,  note: '' },
    { label: 'เลื่อนดูรูป',       n: totals.gallery, note: '' },
    { label: 'กดปุ่ม CTA',       n: totals.cta,     note: '' },
    { label: 'เห็น QR',         n: totals.qr,      note: '' },
    { label: 'สแกนสำเร็จ',      n: totals.scan,    note: 'นับที่หน้ามือถือ' },
    { label: 'ให้เบอร์บนจอ',     n: totals.phone,   note: 'ทางเลือกแทนการสแกน' },
  ]
  const maxHour = Math.max(1, ...Object.values(hourly))

  return (
    <Box padding={4}>
      <Flex align="center" justify="space-between" marginBottom={4}>
        <Stack space={2}>
          <Heading size={2}>การใช้งานจอ</Heading>
          <Text size={1} muted>
            นับการสัมผัสจริงบนจอ · ไม่มีกล้อง จึงไม่ใช่จำนวนผู้ชม — ตัวส่วนคือ “จำนวนครั้งที่ออกอากาศ”
          </Text>
        </Stack>
        <Flex gap={2} align="center">
          {[7, 30].map(d => (
            <Button key={d} text={`${d} วัน`} mode={days === d ? 'default' : 'ghost'}
                    tone={days === d ? 'primary' : 'default'} onClick={() => setDays(d)} />
          ))}
          <Button text="รีเฟรช" mode="ghost" onClick={load} disabled={loading} />
        </Flex>
      </Flex>

      {err && <Card padding={3} radius={2} tone="critical" marginBottom={3}><Text size={1}>{err}</Text></Card>}

      {/* Small-n warning. With a handful of touches a day, a week is the floor
          before any of this deserves to change a decision. */}
      {dataDays > 0 && dataDays < 7 && (
        <Card padding={3} radius={2} tone="caution" marginBottom={3}>
          <Text size={1}>
            มีข้อมูลจริงแค่ {dataDays} วัน — ยังน้อยเกินกว่าจะสรุปอะไร รอให้ครบ 2–4 สัปดาห์ก่อน
          </Text>
        </Card>
      )}
      {!rows.length && !loading && (
        <Card padding={4} radius={2} tone="transparent" border>
          <Text size={1} muted>ยังไม่มีข้อมูลในช่วงนี้ — จอเริ่มส่งตัวเลขหลังอัปเดตเวอร์ชันที่มีตัวนับแล้วเท่านั้น</Text>
        </Card>
      )}

      {rows.length > 0 && (
        <Stack space={5}>
          {/* ── fleet totals ─────────────────────────────────────────────── */}
          <Grid columns={[2, 2, 4]} gap={3}>
            {[
              { k: 'ออกอากาศ', v: totals.air,  s: 'ครั้ง' },
              { k: 'ถูกแตะ',    v: totals.tap,  s: `${pct(totals.tap, totals.air)} ของการออกอากาศ` },
              { k: 'ผู้ใช้',     v: totals.sess, s: 'แตะห่างกันเกิน 1 นาที = คนใหม่' },
              { k: 'สแกน QR',   v: totals.scan, s: `${pct(totals.scan, totals.qr)} ของคนที่เห็น QR` },
            ].map(x => (
              <Card key={x.k} padding={3} radius={2} tone="transparent" border>
                <Stack space={2}>
                  <Text size={1} muted>{x.k}</Text>
                  <Heading size={3}>{num(x.v)}</Heading>
                  <Text size={0} muted>{x.s}</Text>
                </Stack>
              </Card>
            ))}
          </Grid>

          {/* ── A. which screens get used ────────────────────────────────── */}
          <Stack space={3}>
            <Heading size={1}>จอไหนมีคนใช้</Heading>
            <Card radius={2} border overflow="auto">
              <Stack space={0}>
                <Card padding={3} tone="transparent" borderBottom>
                  <Grid columns={6} gap={2}>
                    <Text size={0} weight="semibold" muted>จอ</Text>
                    <Text size={0} weight="semibold" muted align="right">ออกอากาศ</Text>
                    <Text size={0} weight="semibold" muted align="right">แตะ</Text>
                    <Text size={0} weight="semibold" muted align="right">อัตราแตะ</Text>
                    <Text size={0} weight="semibold" muted align="right">ผู้ใช้</Text>
                    <Text size={0} weight="semibold" muted align="right">สแกน</Text>
                  </Grid>
                </Card>
                {byProject.map(p => {
                  // air == 0 means the screen never aired a slide that day: it was
                  // off or unreachable. That is a different fact from "nobody
                  // touched it", and the two must never look the same here.
                  const off = screenWasOff(p)
                  return (
                    <Card key={p.project} padding={3} borderBottom tone={off ? 'transparent' : 'default'}>
                      <Grid columns={6} gap={2}>
                        <Flex align="center" gap={2}>
                          <Text size={1} weight="medium" muted={off}>{p.project}</Text>
                          {off && <Badge tone="default" fontSize={0}>จอไม่ได้เปิด</Badge>}
                        </Flex>
                        <Text size={1} align="right" muted={off}>{num(p.air)}</Text>
                        <Text size={1} align="right" weight="semibold" muted={off}>{num(p.tap)}</Text>
                        <Text size={1} align="right" muted={off}>{pct(p.tap, p.air)}</Text>
                        <Text size={1} align="right" muted={off}>{num(p.sess)}</Text>
                        <Text size={1} align="right" muted={off}>{num(p.scan)}</Text>
                      </Grid>
                    </Card>
                  )
                })}
              </Stack>
            </Card>
            <Text size={0} muted>
              “จอไม่ได้เปิด” = ไม่มีการออกอากาศเลยในช่วงนี้ (จอปิด/เน็ตหลุด/ยังไม่ได้อัปเดต) — คนละเรื่องกับจอที่เปิดแล้วไม่มีคนแตะ
            </Text>
          </Stack>

          {/* ── B. which media earns its slot ────────────────────────────── */}
          <Stack space={3}>
            <Heading size={1}>สื่อไหนถูกแตะ</Heading>
            <Card radius={2} border overflow="auto">
              <Stack space={0}>
                <Card padding={3} tone="transparent" borderBottom>
                  <Grid columns={5} gap={2}>
                    <Box style={{ gridColumn: 'span 2' }}><Text size={0} weight="semibold" muted>สื่อ</Text></Box>
                    <Text size={0} weight="semibold" muted align="right">ออกอากาศ</Text>
                    <Text size={0} weight="semibold" muted align="right">แตะ</Text>
                    <Text size={0} weight="semibold" muted align="right">อัตราแตะ</Text>
                  </Grid>
                </Card>
                {byMedia.map(m => {
                  const doc  = names[m.id]
                  const name = doc?.title || doc?.offerTitle || m.id.slice(0, 12) + '…'
                  // Aired plenty and never once touched — the finding that is
                  // actually actionable: change the creative or drop the slot.
                  const dead = isDeadMedia(m)
                  return (
                    <Card key={m.id} padding={3} borderBottom>
                      <Grid columns={5} gap={2}>
                        <Box style={{ gridColumn: 'span 2' }}>
                          <Flex align="center" gap={2}>
                            <Text size={1} weight="medium" textOverflow="ellipsis">{name}</Text>
                            {dead && <Badge tone="critical" fontSize={0}>ยังไม่เคยถูกแตะ</Badge>}
                          </Flex>
                        </Box>
                        <Text size={1} align="right" muted>{num(m.air)}</Text>
                        <Text size={1} align="right" weight="semibold">{num(m.tap)}</Text>
                        <Text size={1} align="right" weight="semibold"
                              style={{ color: m.tap ? undefined : 'inherit' }}>{pct(m.tap, m.air)}</Text>
                      </Grid>
                    </Card>
                  )
                })}
              </Stack>
            </Card>
            <Text size={0} muted>
              เรียงตามอัตราแตะ ไม่ใช่ยอดดิบ — สื่อที่อยู่บนจอมานานกว่าย่อมมียอดสูงกว่าโดยไม่เกี่ยวกับคุณภาพ
            </Text>
          </Stack>

          {/* ── C. where people drop off ─────────────────────────────────── */}
          <Stack space={3}>
            <Heading size={1}>คนหลุดตรงไหน</Heading>
            <Card padding={3} radius={2} border>
              <Stack space={3}>
                {funnel.map((step, i) => {
                  const prev = i === 0 ? null : funnel[i - 1].n
                  const w    = totals.air > 0 ? Math.max((step.n / totals.air) * 100, step.n > 0 ? 1.5 : 0) : 0
                  return (
                    <Stack space={2} key={step.label}>
                      <Flex justify="space-between" align="center">
                        <Text size={1}>{step.label}{step.note ? <Text as="span" size={0} muted> · {step.note}</Text> : null}</Text>
                        <Flex gap={3} align="center">
                          {prev != null && prev > 0 && (
                            <Text size={0} muted>เหลือ {pct(step.n, prev)} จากขั้นก่อน</Text>
                          )}
                          <Text size={1} weight="semibold">{num(step.n)}</Text>
                        </Flex>
                      </Flex>
                      <Box style={{ height: 6, background: 'var(--card-border-color)', borderRadius: 3 }}>
                        <Box style={{ height: 6, width: `${w}%`, background: 'var(--card-focus-ring-color)', borderRadius: 3 }} />
                      </Box>
                    </Stack>
                  )
                })}
              </Stack>
            </Card>

            <Grid columns={[1, 1, 2]} gap={3}>
              <Card padding={3} radius={2} border>
                <Stack space={3}>
                  <Text size={1} weight="semibold">ป๊อปอัปจบยังไง</Text>
                  <Flex justify="space-between"><Text size={1} muted>อ่านแล้วปิดเอง</Text><Text size={1}>{num(totals.back)}</Text></Flex>
                  <Flex justify="space-between"><Text size={1} muted>ไปต่อขั้นถัดไป</Text><Text size={1}>{num(totals.endCta)}</Text></Flex>
                  <Flex justify="space-between">
                    <Text size={1} muted>หมดเวลาเอง (เดินหนี)</Text>
                    <Text size={1}>{num(totals.idle)}</Text>
                  </Flex>
                </Stack>
              </Card>
              <Card padding={3} radius={2} border>
                <Stack space={3}>
                  <Text size={1} weight="semibold">อยู่ในป๊อปอัปนานแค่ไหน</Text>
                  <Flex justify="space-between">
                    <Text size={1} muted>ต่ำกว่า 3 วิ · น่าจะแตะโดนบังเอิญ</Text><Text size={1}>{num(totals.d0)}</Text>
                  </Flex>
                  <Flex justify="space-between"><Text size={1} muted>3–10 วิ</Text><Text size={1}>{num(totals.d3)}</Text></Flex>
                  <Flex justify="space-between">
                    <Text size={1} muted>10–30 วิ · สนใจจริง</Text><Text size={1}>{num(totals.d10)}</Text>
                  </Flex>
                  <Flex justify="space-between"><Text size={1} muted>เกิน 30 วิ</Text><Text size={1}>{num(totals.d30)}</Text></Flex>
                </Stack>
              </Card>
            </Grid>

            {/* hour strip — the screens run 06:00–22:00, so 16 cells is the day */}
            <Card padding={3} radius={2} border>
              <Stack space={3}>
                <Text size={1} weight="semibold">ช่วงเวลาที่คนแตะ (6:00–22:00)</Text>
                <Flex gap={1}>
                  {SCREEN_HOURS.map(h => {
                    const v = hourly[h]
                    return (
                      <Stack key={h} space={2} flex={1}>
                        <Box style={{
                          height: 44, borderRadius: 3,
                          background: v ? 'var(--card-focus-ring-color)' : 'var(--card-border-color)',
                          opacity: v ? 0.25 + 0.75 * (v / maxHour) : 1,
                        }} />
                        <Text size={0} muted align="center">{h}</Text>
                      </Stack>
                    )
                  })}
                </Flex>
                <Text size={0} muted>เข้มที่สุด = {num(maxHour)} ครั้ง</Text>
              </Stack>
            </Card>
          </Stack>

          <Text size={0} muted>อัปเดตล่าสุด {updated} · ข้อมูล {days} วันล่าสุด (เวลากรุงเทพ)</Text>
        </Stack>
      )}
    </Box>
  )
}
