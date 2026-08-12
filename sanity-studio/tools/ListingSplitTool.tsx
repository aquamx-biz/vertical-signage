/**
 * ListingSplitTool — แยก/รวม/ล็อกห้อง จากชั้น listing (โมเดล 2 ชั้น · workspace internal)
 *
 * กางดู listing ใต้ห้อง → ติ๊กที่ยุบผิด → "แยกเป็นห้องใหม่ + ล็อก" (สร้าง unitSource ใหม่ +
 * ย้าย listing.unit + unitLocked=true) → รอบ scrape หน้าที่เปิด --respect-locks จะไม่ยุบกลับ
 * ค่าเริ่มต้นโชว์เฉพาะห้อง "น่าสงสัย" (ราคากระจาย >18% หรือ imgHash รูปต่าง) — ตัวที่ควรดู
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useClient } from 'sanity'
import { Badge, Box, Button, Card, Checkbox, Flex, Select, Spinner, Stack, Text, useToast } from '@sanity/ui'

interface Lst { _id: string; url?: string; portal?: string; intent?: string; price?: number; posterName?: string; unitLocked?: boolean; imgHash?: string; uref: string }
interface Unit { _id: string; refCode: string; floorActual?: number }

const ham = (a?: string, b?: string) => { if (!a || !b) return 0; let x = BigInt('0x' + a) ^ BigInt('0x' + b), n = 0; while (x) { n += Number(x & 1n); x >>= 1n } return n }
const fmt = (p?: number) => p == null ? '?' : p >= 1e6 ? (p / 1e6).toFixed(1) + 'M' : (p / 1e3).toFixed(0) + 'K'
const idNum = (u?: string) => (String(u || '').match(/(\d{6,})/) || [])[1] || ''

function suspicious(ls: Lst[]): string | null {
  const pr = ls.map(l => l.price).filter((x): x is number => x != null)
  if (pr.length >= 2) { const lo = Math.min(...pr), hi = Math.max(...pr); if ((hi - lo) / lo > 0.18) return `ราคา ${fmt(lo)}–${fmt(hi)}` }
  const hs = ls.map(l => l.imgHash).filter(Boolean) as string[]
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) if (ham(hs[i], hs[j]) > 18) return 'รูปต่าง'
  return null
}

export function ListingSplitTool() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const internal = useMemo(() => client.withConfig({ dataset: 'internal' }), [client])
  const toast = useToast()
  const [projects, setProjects] = useState<string[]>([])
  const [proj, setProj] = useState('')
  const [units, setUnits] = useState<Unit[]>([])
  const [lsByUnit, setLsByUnit] = useState<Record<string, Lst[]>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [suspOnly, setSuspOnly] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { internal.fetch<string[]>(`array::unique(*[_type=="unitSource"].projectName)`).then(p => { const s = (p || []).filter(Boolean).sort(); setProjects(s); if (!proj && s[0]) setProj(s[0]) }) }, [internal])

  const load = useCallback(async (p: string) => {
    if (!p) return
    setLoading(true); setSel(new Set()); setOpen({})
    const [u, l] = await Promise.all([
      internal.fetch<Unit[]>(`*[_type=="unitSource" && projectName==$p]{_id,refCode,floorActual}|order(refCode)`, { p }),
      internal.fetch<Lst[]>(`*[_type=="listing" && unit->projectName==$p]{_id,url,portal,intent,price,posterName,unitLocked,imgHash,"uref":unit._ref}`, { p }),
    ])
    const by: Record<string, Lst[]> = {}
    for (const x of l) (by[x.uref] ??= []).push(x)
    setUnits(u); setLsByUnit(by); setLoading(false)
  }, [internal])
  useEffect(() => { load(proj) }, [proj, load])

  const toggleLock = async (l: Lst) => {
    setBusy(true)
    try { await internal.patch(l._id).set({ unitLocked: !l.unitLocked }).commit(); await load(proj); toast.push({ status: 'success', title: l.unitLocked ? 'ปลดล็อก' : 'ล็อกแล้ว' }) }
    catch (e: any) { toast.push({ status: 'error', title: 'พลาด', description: e.message }) } finally { setBusy(false) }
  }

  const splitOut = async (fromUnit: Unit) => {
    const ids = [...sel].filter(id => (lsByUnit[fromUnit._id] || []).some(l => l._id === id))
    if (!ids.length) return
    setBusy(true)
    try {
      const nums = units.map(u => +((u.refCode.match(/-U(\d+)/) || [])[1] || 0))
      const prefix = fromUnit.refCode.replace(/-U\d+.*$/, '')
      const newRef = `${prefix}-U${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`
      await internal.createIfNotExists({ _id: `unitSource-${newRef}`, _type: 'unitSource', refCode: newRef, projectName: proj, floorActual: fromUnit.floorActual, cobrokeStatus: 'not_contacted' } as any)
      await Promise.all(ids.map(id => internal.patch(id).set({ unit: { _type: 'reference', _ref: `unitSource-${newRef}` }, unitLocked: true }).commit()))
      await load(proj)
      toast.push({ status: 'success', title: `แยก ${ids.length} ประกาศ → ${newRef} (ล็อกแล้ว)` })
    } catch (e: any) { toast.push({ status: 'error', title: 'แยกไม่สำเร็จ', description: e.message }) } finally { setBusy(false) }
  }

  const shown = units.filter(u => { const ls = lsByUnit[u._id] || []; return !suspOnly || (ls.length >= 2 && suspicious(ls)) })

  return (
    <Box padding={4} style={{ maxWidth: 900, margin: '0 auto' }}>
      <Flex align="center" gap={3} marginBottom={4}>
        <Text weight="semibold" size={2}>แยก / ล็อกห้อง (listing)</Text>
        <Box style={{ minWidth: 220 }}>
          <Select value={proj} onChange={e => setProj(e.currentTarget.value)}>{projects.map(p => <option key={p} value={p}>{p}</option>)}</Select>
        </Box>
        <Flex align="center" gap={2}><Checkbox checked={suspOnly} onChange={() => setSuspOnly(v => !v)} /><Text size={1} muted>เฉพาะน่าสงสัย</Text></Flex>
        {busy && <Spinner muted />}
        <Box flex={1} />
        <Text size={1} muted>{shown.length}/{units.length} ห้อง</Text>
      </Flex>

      {loading ? <Flex justify="center" padding={5}><Spinner /></Flex> : (
        <Stack space={2}>
          {shown.map(u => {
            const ls = lsByUnit[u._id] || []
            const warn = suspicious(ls)
            const isOpen = open[u._id]
            const selN = ls.filter(l => sel.has(l._id)).length
            return (
              <Card key={u._id} radius={2} border tone={warn ? 'caution' : 'default'}>
                <Flex align="center" gap={3} padding={3} style={{ cursor: 'pointer' }} onClick={() => setOpen(o => ({ ...o, [u._id]: !o[u._id] }))}>
                  <Text size={1}>{isOpen ? '▾' : '▸'}</Text>
                  <Text weight="medium" size={1}>{u.refCode}</Text>
                  <Text size={1} muted>ชั้น {u.floorActual ?? '?'} · {ls.length} ประกาศ</Text>
                  {warn && <Badge tone="caution" fontSize={0}>อาจยุบผิด · {warn}</Badge>}
                </Flex>
                {isOpen && (
                  <Stack space={0}>
                    {ls.map(l => (
                      <Flex key={l._id} align="center" gap={3} padding={3} style={{ borderTop: '1px solid var(--card-border-color)', background: sel.has(l._id) ? 'var(--card-bg2-color)' : undefined }}>
                        {l.unitLocked
                          ? <Badge tone="primary" fontSize={0}>🔒</Badge>
                          : <Checkbox checked={sel.has(l._id)} onChange={() => setSel(s => { const n = new Set(s); n.has(l._id) ? n.delete(l._id) : n.add(l._id); return n })} />}
                        <Badge fontSize={0} tone="default">{l.portal}</Badge>
                        <Text size={1}>{l.intent === 'sale' ? 'ขาย' : 'เช่า'} {fmt(l.price)}</Text>
                        <Text size={1} muted>{l.posterName || '—'} · {idNum(l.url)}</Text>
                        <Box flex={1} />
                        <Button mode="ghost" fontSize={0} padding={2} text={l.unitLocked ? 'ปลดล็อก' : 'ล็อกไว้ห้องนี้'} disabled={busy} onClick={() => toggleLock(l)} />
                      </Flex>
                    ))}
                    {selN > 0 && (
                      <Flex align="center" gap={3} padding={3} style={{ borderTop: '1px solid var(--card-border-color)' }}>
                        <Text size={1} weight="medium">เลือก {selN} ประกาศ</Text>
                        <Box flex={1} />
                        <Button tone="primary" fontSize={1} padding={2} text="✂ แยกเป็นห้องใหม่ + ล็อก" disabled={busy} onClick={() => splitOut(u)} />
                      </Flex>
                    )}
                  </Stack>
                )}
              </Card>
            )
          })}
          {!shown.length && <Text muted size={1} align="center">ไม่มีห้องน่าสงสัยในโครงการนี้</Text>}
        </Stack>
      )}
    </Box>
  )
}
