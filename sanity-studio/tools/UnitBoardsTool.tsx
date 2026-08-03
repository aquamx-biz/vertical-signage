/**
 * UnitBoardsTool — เครื่องมือคัดห้องขึ้นบอร์ดราคา (ย้ายจาก _units-all.html เข้า Studio)
 *
 * ทำไมอยู่ใน Studio: ปุ่ม Save เขียน unitBoard.lineup เป็น DRAFT ด้วยสิทธิ์
 * ของคนที่ล็อกอินโดยตรง — ไม่มี endpoint สาธารณะ ไม่มี key ฝังไฟล์ ตรวจย้อนได้
 * ว่าใครบันทึก · draft ไม่มีวันขึ้นจอจนกว่าจะ publish (กติกาเดิมของระบบ)
 *
 * ครอบคลุม: หนึ่งแถวต่อห้องจริง (เช่า+ขายรวม) · filter หมวด + ค้นหา Ref/Agent ·
 * sorting · policy simulator แยกเช่า/ขาย (quota + ธง + ขั้นต่ำรายไซซ์) ·
 * Select มือแยกฝั่งพร้อมเตือนเกิน quota · เหตุผลการคัด (SELECT/BED/ธง/FILL) ·
 * Posted by (Owner/agent) · Save ลง drafts.unitBoard-<code>-<mode>
 *
 * ยังไม่พอร์ต (อยู่บนหน้า _units-all.html เดิม): Excel column filter panels ·
 * archive รายรอบ · ปุ่ม Preview บอร์ด split-flap
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useClient } from 'sanity'
import { Badge, Box, Button, Card, Checkbox, Flex, Inline, Spinner, Stack, Text, TextInput, useToast } from '@sanity/ui'

// ── engine mirror — ต้อง sync กับ ../../board-engine.mjs (Studio bundle
//    import ข้ามรากโปรเจกต์ไม่ได้ จึงคัดลอกแกน logic มาโดยตรง) ──────────────
const BED_ORDER = ['studio', '1bed', '2bed', '3bed', '4bed']
const BED_LABEL: Record<string, string> = { studio: 'STUDIO', '1bed': '1BED', '2bed': '2BED', '3bed': '3BED', '4bed': '4BED+' }
const SQM_BOUNDS: Record<string, [number, number]> = { studio: [20, 50], '1bed': [25, 80], '2bed': [45, 150], '3bed': [80, 500], '4bed': [120, 700] }
const PRICE_BOUNDS: Record<string, [number, number]> = { rent: [5000, 300000], sale: [1000000, 100000000] }
const PSQM_BOUNDS: Record<string, [number, number]> = { rent: [250, 3500], sale: [50000, 600000] }
const TIER_RANK: Record<string, number> = { super: 0, best: 1, good: 2 }

export interface Profile {
  refCode: string; intent: 'rent' | 'sale'; projectName: string
  bedType?: string; sqm?: number; floorZone?: string; priceTHB?: number; pricePerSqm?: number
  vsFloorPct?: number; vsZonePct?: number; dealTier?: string
  hotDeal?: boolean; goodInvest?: boolean; negotiable?: boolean
  yieldPct?: number; spreadPct?: number; nListings?: number; nPortals?: number
  postedByOwner?: boolean; dualListed?: boolean; pinToBoard?: boolean; hideFromBoard?: boolean
  status?: string; lastCheckedAt?: string; firstSeenAt?: string
  __pick?: string
}
export interface Policy {
  quota: number; superQ: number; bestQ: number; hotQ: number; negoQ: number; investQ: number
  studioMin: number; b1Min: number; b2Min: number; b3Min: number; b4Min: number
}
const DEFAULT_POLICY: Policy = { quota: 19, superQ: 1, bestQ: 1, hotQ: 1, negoQ: 1, investQ: 1, studioMin: 1, b1Min: 1, b2Min: 1, b3Min: 1, b4Min: 1 }
const BED_MIN_KEY: Record<string, keyof Policy> = { studio: 'studioMin', '1bed': 'b1Min', '2bed': 'b2Min', '3bed': 'b3Min', '4bed': 'b4Min' }

function passesSanity(p: Profile, mode: string): boolean {
  const [lo, hi] = SQM_BOUNDS[p.bedType ?? ''] ?? [15, 400]
  if (!(p.sqm != null && p.sqm >= lo && p.sqm <= hi)) return false
  const [plo, phi] = PRICE_BOUNDS[mode] ?? [0, Infinity]
  if (!(p.priceTHB != null && p.priceTHB >= plo && p.priceTHB <= phi)) return false
  const [qlo, qhi] = PSQM_BOUNDS[mode] ?? [0, Infinity]
  const psqm = p.priceTHB / (p.sqm || 1)
  if (!(psqm >= qlo && psqm <= qhi)) return false
  if (p.vsFloorPct != null && p.vsFloorPct < -50) return false
  if (p.spreadPct != null && p.spreadPct > 60) return false
  return true
}
const tierRank = (p: Profile) => TIER_RANK[p.dealTier ?? ''] ?? 3
const byDeal = (a: Profile, b: Profile) => tierRank(a) - tierRank(b) || (a.vsFloorPct ?? 0) - (b.vsFloorPct ?? 0)

const BUCKETS: Array<[keyof Policy, string, (p: Profile) => boolean, (a: Profile, b: Profile) => number]> = [
  ['superQ', 'SUPER', p => p.dealTier === 'super', (a, b) => (a.vsFloorPct ?? 0) - (b.vsFloorPct ?? 0)],
  ['bestQ', 'BEST', p => p.dealTier === 'best', (a, b) => (a.vsFloorPct ?? 0) - (b.vsFloorPct ?? 0)],
  ['hotQ', 'HOT', p => !!p.hotDeal, (a, b) => (b.nListings ?? 0) - (a.nListings ?? 0)],
  ['negoQ', 'NEGO', p => !!p.negotiable, (a, b) => (b.spreadPct ?? 0) - (a.spreadPct ?? 0)],
  ['investQ', 'INVESTABLE', p => !!p.goodInvest, (a, b) => (b.yieldPct ?? 0) - (a.yieldPct ?? 0)],
]

function selectWithPolicy(profiles: Profile[], mode: 'rent' | 'sale', policy: Policy, selected: Set<string>) {
  const P = policy
  const warnings: string[] = []
  const pool = profiles.filter(p =>
    p.status !== 'expired' && p.status !== 'taken' && passesSanity(p, mode) && !p.hideFromBoard)
  const picked = new Map<string, Profile>()
  const take = (p: Profile | undefined, reason: string) => {
    if (p && !picked.has(p.refCode) && picked.size < P.quota) { picked.set(p.refCode, p); p.__pick = reason; return true }
    return false
  }
  // เลือกมือ (Select ในตาราง หรือ pinToBoard จาก Studio) มาก่อนเสมอ
  const pins = pool.filter(p => p.pinToBoard || selected.has(p.refCode)).sort(byDeal)
  pins.forEach(p => take(p, 'SELECT'))
  const selInPool = pool.filter(p => selected.has(p.refCode)).length
  if (pins.length > P.quota)
    warnings.push(`⛔ เลือกไว้ ${pins.length} > quota ${P.quota} — วางให้ ${P.quota} ตัวที่ดีลดีสุด เหลือ ${pins.length - P.quota} ตกบอร์ด`)
  const selOff = [...selected].filter(r => profiles.some(p => p.refCode === r) && !pool.some(p => p.refCode === r)).length
  if (selOff) warnings.push(`${selOff} ห้องที่เลือกตกตัวกรองคุณภาพ — ไม่ถูกวาง`)
  void selInPool

  for (const bed of BED_ORDER) {
    const min = P[BED_MIN_KEY[bed]] ?? 1
    if (min <= 0) continue
    const of = pool.filter(p => p.bedType === bed).sort(byDeal)
    of.slice(0, min).forEach(p => take(p, 'BED'))
    if (!of.length && profiles.some(p => p.bedType === bed))
      warnings.push(`${bed.toUpperCase()}: ไม่มีห้องผ่านตัวกรอง — บอร์ดไม่มีไซซ์นี้`)
    else if (of.length && of.length < min)
      warnings.push(`${bed.toUpperCase()}: ขอขั้นต่ำ ${min} · มีจริง ${of.length}`)
  }
  for (const [key, label, match, rank] of BUCKETS) {
    const q = P[key] ?? 0
    if (q <= 0) continue
    let got = [...picked.values()].filter(match).length
    for (const p of pool.filter(p => match(p) && !picked.has(p.refCode)).sort(rank)) {
      if (got >= q) break
      if (take(p, label)) got++
    }
    if (got < q) warnings.push(`${label}: ขอ ${q} · ได้จริง ${got} — เติมจากดีลดีสุดแทน`)
  }
  ;[...pool].sort(byDeal).forEach(p => take(p, 'FILL'))
  if (picked.size < P.quota) warnings.push(`ได้ ${picked.size}/${P.quota} แถว — ห้องผ่านเกณฑ์ไม่พอ`)
  const rows = [...picked.values()].sort((a, b) =>
    BED_ORDER.indexOf(a.bedType ?? '') - BED_ORDER.indexOf(b.bedType ?? '') || (a.priceTHB ?? 0) - (b.priceTHB ?? 0))
  return { rows, warnings }
}

const NAME_TO_CODE: Record<string, string> = {
  '39 by Sansiri': '39-by-sansiri', 'The Lumpini 24': 'lumpini-24',
  'The Room Sukhumvit 21': 'the-room-skv21', 'Noble BE19': 'noble-be19',
  'Mahogany Tower': 'mahogany-tower', 'Park 24': 'park24',
}

const PROJ = `refCode, intent, projectName, bedType, sqm, floorZone, priceTHB, pricePerSqm,
  vsFloorPct, vsZonePct, dealTier, hotDeal, goodInvest, negotiable, yieldPct, spreadPct,
  nListings, nPortals, postedByOwner, dualListed, pinToBoard, hideFromBoard, status, lastCheckedAt, firstSeenAt`

interface SourceDoc { refCode: string; floorActual?: number; listings?: Array<{ portal?: string; url?: string; intent?: string; posterType?: string; posterName?: string }> }
interface Unit { refCode: string; bed?: string; sqm?: number; zone?: string; rent?: Profile; sale?: Profile }

const fmtK = (n?: number) => n == null ? '—' : (n / 1000).toFixed(1) + 'K'
const fmtM = (n?: number) => n == null ? '—' : (n / 1e6).toFixed(1) + 'M'
const cleanAgent = (n: string) =>
  /[A-Za-zก-๙]{3}/.test(n) && !/^[([]/.test(n) && !['line', 'k.', 'tel', 'whatsapp'].includes(n.toLowerCase())

const th: React.CSSProperties = { position: 'sticky', top: 0, background: '#0f3460', color: '#fff', padding: '7px 8px', fontSize: 11, textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', zIndex: 2 }
const td: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid #eef1f5', whiteSpace: 'nowrap', fontSize: 13, verticalAlign: 'top' }
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const chipStyle = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-block', background: bg, color: fg, borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700, marginRight: 4 })

function DealChip({ p }: { p?: Profile }) {
  if (!p) return null
  const out: React.ReactNode[] = []
  if (p.dealTier === 'super') out.push(<span key="d" style={chipStyle('#166534', '#fff')} title={`ถูกกว่าค่าเฉลี่ยชั้น ${Math.abs(p.vsFloorPct ?? 0)}%`}>SUPER</span>)
  else if (p.dealTier === 'best') out.push(<span key="d" style={chipStyle('#d1f2dd', '#166534')} title={`ถูกกว่าค่าเฉลี่ยชั้น ${Math.abs(p.vsFloorPct ?? 0)}%`}>BEST</span>)
  else if (p.dealTier === 'good') out.push(<span key="d" style={chipStyle('#d1f2dd', '#166534')} title={`ถูกกว่าค่าเฉลี่ยโซน ${Math.abs(p.vsZonePct ?? 0)}%`}>GOOD</span>)
  if (!passesSanity(p, p.intent)) out.push(<span key="x" style={chipStyle('#fde8e8', '#c2410c')} title="ข้อมูลผิดปกติ — ไม่เข้าคัดอัตโนมัติ">ตกตัวกรอง</span>)
  return <>{out}</>
}

export function UnitBoardsTool() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const internal = useMemo(() => client.withConfig({ dataset: 'internal' }), [client])
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sources, setSources] = useState<Map<string, SourceDoc>>(new Map())
  const [projDocs, setProjDocs] = useState<Array<{ _id: string; code: string }>>([])
  const [boardPolicies, setBoardPolicies] = useState<Record<string, Partial<Policy>>>({})

  const [proj, setProj] = useState<string>('')
  const [polR, setPolR] = useState<Policy>({ ...DEFAULT_POLICY, investQ: 0 })
  const [polS, setPolS] = useState<Policy>({ ...DEFAULT_POLICY })
  const [selR, setSelR] = useState<Set<string>>(new Set())
  const [selS, setSelS] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ k: string; d: number }>({ k: '', d: 1 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const [pf, src, pj, bd] = await Promise.all([
          client.fetch<Profile[]>(`*[_type == "unitProfile" && status != "expired"]{ ${PROJ} }`),
          internal.fetch<SourceDoc[]>(`*[_type == "unitSource"]{ refCode, floorActual, "listings": listings[]{ portal, url, intent, posterType, posterName } }`).catch(() => []),
          client.fetch<Array<{ _id: string; code: string }>>(`*[_type == "project"]{ _id, "code": code.current }`),
          client.fetch<Array<{ code: string; mode: string; policy?: Partial<Policy> }>>(`*[_type == "unitBoard"]{ "code": project->code.current, mode, policy }`),
        ])
        if (dead) return
        setProfiles(pf ?? [])
        setSources(new Map((src ?? []).map(s => [s.refCode, s])))
        setProjDocs(pj ?? [])
        const pol: Record<string, Partial<Policy>> = {}
        ;(bd ?? []).forEach(b => { if (b.code && b.policy) pol[`${b.code}·${b.mode}`] = b.policy })
        setBoardPolicies(pol)
        const names = [...new Set((pf ?? []).map(p => p.projectName))].sort()
        setProj(names[0] ?? '')
      } finally { if (!dead) setLoading(false) }
    })()
    return () => { dead = true }
  }, [client, internal])

  const projectNames = useMemo(() => [...new Set(profiles.map(p => p.projectName))].sort(), [profiles])
  const pool = useMemo(() => profiles.filter(p => p.projectName === proj), [profiles, proj])

  // เปลี่ยนโครงการ → รีเซ็ต select + โหลด policy ที่ตั้งไว้ใน unitBoard (ถ้ามี)
  useEffect(() => {
    setSelR(new Set()); setSelS(new Set()); setMode('all'); setQ('')
    const code = NAME_TO_CODE[proj]
    setPolR({ ...DEFAULT_POLICY, investQ: 0, ...(code ? boardPolicies[`${code}·rent`] : {}) })
    setPolS({ ...DEFAULT_POLICY, ...(code ? boardPolicies[`${code}·sale`] : {}) })
  }, [proj, boardPolicies])

  const units = useMemo(() => {
    const m = new Map<string, Unit>()
    for (const p of pool) {
      const u = m.get(p.refCode) ?? { refCode: p.refCode, bed: p.bedType, sqm: p.sqm, zone: p.floorZone }
      ;(u as any)[p.intent] = p
      m.set(p.refCode, u)
    }
    return [...m.values()]
  }, [pool])

  const simR = useMemo(() => selectWithPolicy(pool.filter(p => p.intent === 'rent'), 'rent', polR, selR), [pool, polR, selR])
  const simS = useMemo(() => selectWithPolicy(pool.filter(p => p.intent === 'sale'), 'sale', polS, selS), [pool, polS, selS])
  const onR = useMemo(() => new Map(simR.rows.map(p => [p.refCode, p.__pick ?? ''])), [simR])
  const onS = useMemo(() => new Map(simS.rows.map(p => [p.refCode, p.__pick ?? ''])), [simS])

  const flagsSum = (P: Policy) => P.superQ + P.bestQ + P.hotQ + P.negoQ + P.investQ
  const minsSum = (P: Policy) => P.studioMin + P.b1Min + P.b2Min + P.b3Min + P.b4Min
  const overQuota = flagsSum(polR) > polR.quota || minsSum(polR) > polR.quota || flagsSum(polS) > polS.quota || minsSum(polS) > polS.quota

  const shown = useMemo(() => {
    const s = q.trim().toUpperCase()
    let list = units.filter(u => {
      const agents = [...new Set((sources.get(u.refCode)?.listings ?? []).filter(l => l.posterType !== 'owner' && l.posterName).map(l => l.posterName!))]
      const ok =
        mode === 'all' ? true :
        mode === 'rent' ? !!u.rent :
        mode === 'sale' ? !!u.sale :
        mode === 'dual' ? !!u.rent && !!u.sale :
        mode === 'brent' ? onR.has(u.refCode) :
        mode === 'bsale' ? onS.has(u.refCode) :
        mode === 'fx' ? (!!u.rent && !passesSanity(u.rent, 'rent')) || (!!u.sale && !passesSanity(u.sale, 'sale')) : true
      if (!ok) return false
      if (s) return u.refCode.toUpperCase().includes(s) || agents.some(a => a.toUpperCase().includes(s))
      return true
    })
    if (sort.k) {
      const get = (u: Unit): number | string => {
        switch (sort.k) {
          case 'sqm': return u.sqm ?? -1
          case 'rent': return u.rent?.priceTHB ?? -1
          case 'sale': return u.sale?.priceTHB ?? -1
          case 'yield': return u.rent?.yieldPct ?? u.sale?.yieldPct ?? -1
          case 'vsr': return u.rent?.vsFloorPct ?? 9999
          case 'vss': return u.sale?.vsFloorPct ?? 9999
          case 'fl': return sources.get(u.refCode)?.floorActual ?? -1
          default: return u.refCode
        }
      }
      list = [...list].sort((a, b) => {
        const av = get(a), bv = get(b)
        if (typeof av === 'number' && typeof bv === 'number') {
          const am = av === -1 || av === 9999, bm = bv === -1 || bv === 9999
          if (am !== bm) return am ? 1 : -1
          return (av - bv) * sort.d
        }
        return String(av).localeCompare(String(bv)) * sort.d
      })
    }
    return list
  }, [units, mode, q, sort, sources, onR, onS])

  const stat = useMemo(() => ({
    units: units.length,
    rent: pool.filter(p => p.intent === 'rent').length,
    sale: pool.filter(p => p.intent === 'sale').length,
    dual: units.filter(u => u.rent && u.sale).length,
    board: onR.size + onS.size,
    candidate: pool.filter(p => p.status === 'candidate').length,
    verified: pool.filter(p => p.status === 'verified').length,
    published: pool.filter(p => p.status === 'published').length,
  }), [units, pool, onR, onS])

  const projDoc = projDocs.find(d => d.code === NAME_TO_CODE[proj])

  async function save() {
    if (!projDoc) return
    setSaving(true)
    try {
      const code = NAME_TO_CODE[proj]
      for (const [m2, sim, pol] of [['rent', simR, polR], ['sale', simS, polS]] as const) {
        if (!sim.rows.length) continue
        await client.createOrReplace({
          _id: `drafts.unitBoard-${code}-${m2}`,
          _type: 'unitBoard',
          project: { _type: 'reference', _ref: projDoc._id },
          mode: m2,
          isActive: true,
          policy: pol,
          lineup: sim.rows.map((p, i) => ({ _type: 'reference' as const, _key: `lu${i}`, _ref: `unitProfile-${p.refCode}-${m2}` })),
          lineupWarnings: [...sim.warnings, 'บันทึกจาก Studio · Unit Boards tool'],
          lineupGeneratedAt: new Date().toISOString(),
        })
      }
      toast.push({ status: 'success', title: 'บันทึกเป็น draft แล้ว', description: `rent ${simR.rows.length} · sale ${simS.rows.length} แถว — กด publish ใน Pending Publish เพื่อปล่อยขึ้นจอ` })
    } catch (e: any) {
      toast.push({ status: 'error', title: 'บันทึกไม่สำเร็จ', description: e?.message })
    } finally { setSaving(false) }
  }

  if (loading) return <Flex align="center" justify="center" padding={6}><Spinner muted /></Flex>

  const numIn = (P: Policy, set: (p: Policy) => void, k: keyof Policy, disabled = false) => (
    <input type="number" min={0} value={P[k]} disabled={disabled}
      onChange={e => set({ ...P, [k]: Math.max(0, parseInt(e.currentTarget.value) || 0) })}
      style={{ width: 46, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 5, textAlign: 'right', background: disabled ? '#f3f4f6' : '#fff' }} />
  )
  const bedsIn = (m2: 'r' | 's') => new Set(pool.filter(p => p.intent === (m2 === 'r' ? 'rent' : 'sale')).map(p => p.bedType))
  const polRow = (label: string, P: Policy, set: (p: Policy) => void, m2: 'r' | 's') => {
    const present = bedsIn(m2)
    const fSum = flagsSum(P), mSum = minsSum(P)
    const over = fSum > P.quota || mSum > P.quota
    return (
      <Stack space={2}>
        <Inline space={2}>
          <Text size={1} weight="bold" style={{ minWidth: 76 }}>{label}</Text>
          <Text size={1}>Quota</Text>{numIn(P, set, 'quota')}
          <Text size={1}>SUPER</Text>{numIn(P, set, 'superQ')}
          <Text size={1}>BEST</Text>{numIn(P, set, 'bestQ')}
          <Text size={1}>HOT</Text>{numIn(P, set, 'hotQ')}
          <Text size={1}>NEGO</Text>{numIn(P, set, 'negoQ')}
          <Text size={1}>INVEST</Text>{numIn(P, set, 'investQ')}
        </Inline>
        <Inline space={2}>
          <Text size={1} muted style={{ minWidth: 76 }}>Min sizes</Text>
          <Text size={1}>STUDIO</Text>{numIn(P, set, 'studioMin', !present.has('studio'))}
          <Text size={1}>1BED</Text>{numIn(P, set, 'b1Min', !present.has('1bed'))}
          <Text size={1}>2BED</Text>{numIn(P, set, 'b2Min', !present.has('2bed'))}
          <Text size={1}>3BED</Text>{numIn(P, set, 'b3Min', !present.has('3bed'))}
          <Text size={1}>4BED+</Text>{numIn(P, set, 'b4Min', !present.has('4bed'))}
          <Text size={1} weight="bold" style={{ color: over ? '#c2410c' : '#0f3460' }}>flags {fSum} · min {mSum} / quota {P.quota}</Text>
        </Inline>
      </Stack>
    )
  }

  const FILTERS: Array<[string, string]> = [
    ['all', 'All'], ['rent', 'Has rent'], ['sale', 'Has sale'], ['dual', 'Dual'],
    ['brent', 'On board · rent'], ['bsale', 'On board · sale'], ['fx', 'Filtered out'],
  ]
  const H = (label: string, key?: string, title?: string) => (
    <th style={th} title={title} onClick={() => key && setSort(s => ({ k: key, d: s.k === key ? -s.d : 1 }))}>{label}{key ? ' ↕' : ''}</th>
  )

  return (
    <Box padding={4} style={{ height: '100%', overflow: 'auto' }}>
      <Stack space={4}>
        <Flex align="center" gap={3} wrap="wrap">
          <Text size={2} weight="bold">Unit Boards · คัดห้องขึ้นบอร์ดราคา</Text>
          <select value={proj} onChange={e => setProj(e.currentTarget.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
            {projectNames.map(n => <option key={n} value={n}>{n}{NAME_TO_CODE[n] ? '' : ' (ยังไม่มี project doc)'}</option>)}
          </select>
          <Button text={saving ? 'Saving…' : 'Save to lineup (draft)'} tone="primary" disabled={!projDoc || saving || overQuota}
            title={!projDoc ? 'โครงการนี้ยังไม่มี project doc — สร้างก่อนจึงบันทึกได้' : 'เขียน drafts.unitBoard พร้อม policy + lineup ปัจจุบัน'}
            onClick={save} />
        </Flex>

        <Inline space={2}>
          {([['ห้องจริง', stat.units], ['เช่า/ขาย', `${stat.rent}/${stat.sale}`], ['Dual', stat.dual], ['ขึ้นบอร์ด', stat.board],
            ['รอตรวจ', stat.candidate], ['ตรวจแล้ว', stat.verified], ['ขึ้นจอได้', stat.published]] as Array<[string, number | string]>).map(([l, v]) => (
            <Card key={l} padding={2} radius={2} border><Stack space={1}>
              <Text size={0} muted>{l}</Text><Text size={2} weight="bold">{v}</Text>
            </Stack></Card>
          ))}
        </Inline>

        <Card padding={3} radius={2} border tone="transparent">
          <Stack space={3}>
            {polRow('Rent board', polR, setPolR, 'r')}
            {polRow('Sale board', polS, setPolS, 's')}
            {(simR.warnings.length > 0 || simS.warnings.length > 0) && (
              <Stack space={1}>
                {simR.warnings.map((w, i) => <Text key={'r' + i} size={1} style={{ color: '#c2410c' }}>⚠ rent · {w}</Text>)}
                {simS.warnings.map((w, i) => <Text key={'s' + i} size={1} style={{ color: '#c2410c' }}>⚠ sale · {w}</Text>)}
              </Stack>
            )}
          </Stack>
        </Card>

        <Flex gap={2} wrap="wrap" align="center">
          {FILTERS.map(([k, l]) => (
            <Button key={k} text={l} mode={mode === k ? 'default' : 'ghost'} tone={mode === k ? 'primary' : 'default'} fontSize={1} padding={2}
              onClick={() => setMode(k)} />
          ))}
          <Box style={{ width: 220 }}><TextInput fontSize={1} placeholder="Search Ref / Agent" value={q} onChange={e => setQ(e.currentTarget.value)} /></Box>
          <Text size={1} muted>{shown.length} units</Text>
        </Flex>

        <Card radius={2} border style={{ overflow: 'auto', maxHeight: '62vh' }}>
          <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
            <thead><tr>
              {H('#')}{H('Ref', 'ref')}{H('Type')}{H('SQM', 'sqm')}{H('Zone')}{H('Floor', 'fl', 'ชั้นจริง (internal)')}
              {H('Rent (K)', 'rent')}{H('vs Floor', 'vsr')}{H('Rent Deal')}{H('Select R')}
              {H('Sale (M)', 'sale')}{H('vs Floor', 'vss')}{H('Sale Deal')}{H('Select S')}
              {H('Yield', 'yield')}{H('Posted by')}{H('Status')}{H('Board')}{H('Sources')}
            </tr></thead>
            <tbody>
              {shown.map((u, i) => {
                const src = sources.get(u.refCode)
                const rzR = onR.get(u.refCode), rzS = onS.get(u.refCode)
                const agents = [...new Set((src?.listings ?? []).filter(l => l.posterType !== 'owner' && l.posterName).map(l => l.posterName!.trim()).filter(cleanAgent))]
                const owner = u.rent?.postedByOwner || u.sale?.postedByOwner || (src?.listings ?? []).some(l => l.posterType === 'owner')
                const onBoard = rzR != null || rzS != null
                const y = u.rent?.yieldPct ?? u.sale?.yieldPct
                const links = [...new Map((src?.listings ?? []).filter(l => l.url).map(l => [l.url!, l])).values()]
                return (
                  <tr key={u.refCode} style={{ background: onBoard ? '#f4fbf6' : undefined }}>
                    <td style={num}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{u.refCode}</td>
                    <td style={td}>{BED_LABEL[u.bed ?? ''] ?? u.bed ?? '—'}</td>
                    <td style={num}>{u.sqm ?? '—'}</td>
                    <td style={td}>{u.zone ?? '—'}</td>
                    <td style={num}>{src?.floorActual ?? '—'}</td>
                    <td style={num}>{fmtK(u.rent?.priceTHB)}</td>
                    <td style={{ ...num, color: (u.rent?.vsFloorPct ?? 0) < 0 ? '#166534' : '#9aa3b2', fontWeight: (u.rent?.vsFloorPct ?? 0) < 0 ? 700 : 400 }}>
                      {u.rent?.vsFloorPct != null ? `${u.rent.vsFloorPct > 0 ? '+' : ''}${u.rent.vsFloorPct}%` : '—'}</td>
                    <td style={td}><DealChip p={u.rent} /></td>
                    <td style={td}>{u.rent && <Checkbox checked={selR.has(u.refCode)} onChange={() => {
                      const s = new Set(selR); s.has(u.refCode) ? s.delete(u.refCode) : s.add(u.refCode); setSelR(s)
                    }} />}</td>
                    <td style={num}>{fmtM(u.sale?.priceTHB)}</td>
                    <td style={{ ...num, color: (u.sale?.vsFloorPct ?? 0) < 0 ? '#166534' : '#9aa3b2', fontWeight: (u.sale?.vsFloorPct ?? 0) < 0 ? 700 : 400 }}>
                      {u.sale?.vsFloorPct != null ? `${u.sale.vsFloorPct > 0 ? '+' : ''}${u.sale.vsFloorPct}%` : '—'}</td>
                    <td style={td}><DealChip p={u.sale} /></td>
                    <td style={td}>{u.sale && <Checkbox checked={selS.has(u.refCode)} onChange={() => {
                      const s = new Set(selS); s.has(u.refCode) ? s.delete(u.refCode) : s.add(u.refCode); setSelS(s)
                    }} />}</td>
                    <td style={{ ...num, color: (y ?? 0) >= 5 ? '#166534' : undefined, fontWeight: (y ?? 0) >= 5 ? 700 : 400 }}>{y != null ? y.toFixed(1) + '%' : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 180 }}>
                      {owner && <span style={chipStyle('#d1f2dd', '#166534')} title="เจ้าของโพสต์เอง">🏠 Owner</span>}
                      {agents.slice(0, 2).map(a => <span key={a} style={chipStyle('#f3f4f6', '#374151')} title={agents.join(' · ')}>{a}</span>)}
                      {agents.length > 2 && <span style={chipStyle('#f3f4f6', '#9ca3af')}>+{agents.length - 2}</span>}
                      {!owner && agents.length === 0 && '—'}
                    </td>
                    <td style={{ ...td, fontSize: 11.5 }}>
                      {u.rent && <div>เช่า·{u.rent.status}</div>}{u.sale && <div>ขาย·{u.sale.status}</div>}
                    </td>
                    <td style={td}>
                      {rzR != null && <><Badge tone="positive" fontSize={0}>บอร์ดเช่า</Badge><span style={{ fontSize: 10, color: '#6b7280', marginRight: 6 }}> {rzR}</span></>}
                      {rzS != null && <><Badge tone="positive" fontSize={0}>บอร์ดขาย</Badge><span style={{ fontSize: 10, color: '#6b7280' }}> {rzS}</span></>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 200, fontSize: 12 }}>
                      {links.length ? links.map((l, j) => <a key={j} href={l.url} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>{l.portal}</a>) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
        <Text size={1} muted>internal use only — มีชั้นจริง + ลิงก์ต้นทาง · Save = draft เท่านั้น ทีมยัง publish ผ่าน Pending Publish ตามเดิม</Text>
      </Stack>
    </Box>
  )
}
