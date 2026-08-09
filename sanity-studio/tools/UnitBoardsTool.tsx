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
 * พอร์ตครบจาก _units-all.html แล้ว: freeze 6 คอลัมน์ · sorting ทุกคอลัมน์ตัวเลข ·
 * Excel filters (Type/Zone/Posted by/Status) · tooltip หัวคอลัมน์ · ฿/SQM/Spread/Update ·
 * Preview บอร์ด (#sim=) — เหลือโดยตั้งใจ: archive รายรอบ (อยู่หน้า static ตามบทบาทเดิม)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useClient } from 'sanity'
import { Badge, Box, Button, Card, Checkbox, Flex, Inline, Spinner, Stack, Text, TextInput, useToast } from '@sanity/ui'

// ── engine mirror — ต้อง sync กับ ../../board-engine.mjs (Studio bundle
//    import ข้ามรากโปรเจกต์ไม่ได้ จึงคัดลอกแกน logic มาโดยตรง) ──────────────
const BED_ORDER = ['studio', '1bed', '2bed', '3bed', '4bed']
const BED_LABEL: Record<string, string> = { studio: 'STUDIO', '1bed': '1BED', '2bed': '2BED', '3bed': '3BED', '4bed': '4BED+' }
/* 4bed เริ่มที่ 100 — ห้อง combine ที่ทุบรวมสองยูนิตอยู่ต่ำกว่า 120 จริง (ดู board-engine.mjs) */
const SQM_BOUNDS: Record<string, [number, number]> = { studio: [20, 50], '1bed': [25, 80], '2bed': [45, 150], '3bed': [80, 500], '4bed': [100, 700] }
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
  dealStage?: string; dealStageAt?: string
  priceHistory?: Array<{ date?: string; price?: number; nListings?: number }>
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
/* คอลัมน์ Deal ไม่ใช่ตัวเลขเดียว (เป็นธงหลายใบ) — ยุบเป็นคะแนน "ดีลแรงแค่ไหน" ชุดเดียว
   กับที่บอร์ดใช้คัดจริง (byDeal): tier มาก่อน แล้วแพ้ชนะกันที่ vs Floor · หนีบ vs Floor
   ไว้ ±99 แล้วบวก 150 กันไม่ให้ค่าไปตรงกับ -1/9999 ที่ตัวเปรียบเทียบอ่านว่า "ไม่มีข้อมูล" */
const dealScore = (p?: Profile) =>
  p ? tierRank(p) * 300 + Math.max(-99, Math.min(99, p.vsFloorPct ?? 0)) + 150 : 9999

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
  nListings, nPortals, postedByOwner, dualListed, pinToBoard, hideFromBoard, status, lastCheckedAt, firstSeenAt,
  dealStage, dealStageAt,
  priceHistory`

interface SourceDoc { refCode: string; floorActual?: number; listings?: Array<{ portal?: string; url?: string; intent?: string; posterType?: string; posterName?: string }> }
interface Unit { refCode: string; bed?: string; sqm?: number; zone?: string; rent?: Profile; sale?: Profile }

const fmtK = (n?: number) => n == null ? '—' : (n / 1000).toFixed(1) + 'K'
const fmtM = (n?: number) => n == null ? '—' : (n / 1e6).toFixed(1) + 'M'
const cleanAgent = (n: string) =>
  /[A-Za-zก-๙]{3}/.test(n) && !/^[([]/.test(n) && !['line', 'k.', 'tel', 'whatsapp'].includes(n.toLowerCase())
/* เจ้าเดียวกันสะกดไม่ตรงกันข้ามพอร์ทัล (PropertyScout / Propertyscout) — ถ้านับตามตัวอักษร
   ตรง ๆ รายใหญ่จะถูกซอยเป็นหลายเจ้าและอันดับเพี้ยน · ยุบเฉพาะพิมพ์เล็ก-ใหญ่กับช่องว่าง
   เท่านั้น ไม่แตะตัวคำ เพราะ "Serve Service Solution" กับ "…Solutions" เป็นคนละเจ้ากันได้จริง
   (สำเนาใน tools/gen-analysis.mjs — KEEP IN SYNC) */
const agentKey = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()
/* สะกดที่พบบ่อยสุดชนะ · เสมอกันเอาตัวยาวกว่า (มักเป็นชื่อเต็ม) แล้วค่อยเรียงตัวอักษรกันผลสุ่ม */
const pickSpelling = (m: Map<string, number>) =>
  [...m].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))[0][0]

const th: React.CSSProperties = { position: 'sticky', top: 0, background: '#0f3460', color: '#fff', padding: '7px 8px', fontSize: 11, textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', zIndex: 2 }
const td: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid #eef1f5', whiteSpace: 'nowrap', fontSize: 13, verticalAlign: 'top' }
/* freeze 6 คอลัมน์แรก (# ถึง Floor) ติดซ้ายระหว่างเลื่อน — ตามหน้า units-all เดิม */
const FROZEN_W = [44, 112, 78, 66, 78, 70]
const fzLeft = (i: number) => FROZEN_W.slice(0, i).reduce((a, b) => a + b, 0)
const fzSize = (i: number): React.CSSProperties => ({ minWidth: FROZEN_W[i] - 16, maxWidth: FROZEN_W[i] - 16, overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'content-box' })
const thFz = (i: number): React.CSSProperties => ({ ...th, left: fzLeft(i), zIndex: 4, ...fzSize(i) })
const tdFz = (i: number, bg: string): React.CSSProperties => ({ ...td, position: 'sticky', left: fzLeft(i), background: bg, zIndex: 1, ...fzSize(i) })
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const chipStyle = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-block', background: bg, color: fg, borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700, marginRight: 4 })

/** unitProfile → row ที่ board.html อ่าน — mirror ของ profileToRow/remarksFor
 *  ใน board-engine.mjs (KEEP IN SYNC) · ใช้กับปุ่ม Preview (#sim= hash) */
function profileToRow(p: Profile & { floorActual?: number }) {
  const remarks: Array<{ text: string; tone: string }> = []
  if (p.dealTier) remarks.push({ text: p.dealTier.toUpperCase(), tone: 'green' })
  if (p.hotDeal) remarks.push({ text: 'HOT', tone: 'orange' })
  if (p.goodInvest) remarks.push({ text: 'INVESTABLE', tone: 'green' })
  if (p.negotiable) remarks.push({ text: 'NEGO', tone: 'white' })
  if (p.postedByOwner) remarks.push({ text: 'OWNER', tone: 'green' })
  return {
    type: BED_LABEL[p.bedType ?? ''] ?? String(p.bedType ?? '').toUpperCase(),
    sqm: p.sqm, floor: String(p.floorZone ?? '').toUpperCase(),
    floorNo: p.floorActual ?? null,
    updated: p.lastCheckedAt, price: p.priceTHB, remarks: remarks.slice(0, 4),
  }
}

/** ราคาขยับจากรอบก่อน (priceHistory สะสมโดยวงจรรายสัปดาห์) — ชี้เมาส์ดูทั้งเส้น */
function PriceMove({ p }: { p?: Profile }) {
  const h = p?.priceHistory
  if (!h || h.length < 2) return null
  const prev = h[h.length - 2]?.price, now = h[h.length - 1]?.price
  if (!prev || !now || prev === now) return null
  const pct = Math.round((now / prev - 1) * 100)
  const hist = h.map(x => `${x.date ?? '—'} · ฿${(x.price ?? 0).toLocaleString('en-US')}`).join('\n')
  return (
    <span title={`ประวัติราคา:\n${hist}`}
      style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, cursor: 'help', color: pct < 0 ? '#166534' : '#c2410c' }}>
      {pct < 0 ? '▼' : '▲'}{Math.abs(pct)}%
    </span>
  )
}

/* เหตุผลจริงที่ห้องตกตัวกรองคุณภาพ (กันขยะ scraper ขึ้นจอ) — โชว์ใน tooltip */
function sanityFailReason(p: Profile, mode: string): string | null {
  const [lo, hi] = SQM_BOUNDS[p.bedType ?? ''] ?? [15, 400]
  if (!(p.sqm != null && p.sqm >= lo && p.sqm <= hi))
    return `ขนาด ${p.sqm ?? '?'} ตรม. ผิดช่วงของ ${(p.bedType ?? '').toUpperCase()} (${lo}–${hi} ตรม.)`
  const [plo, phi] = PRICE_BOUNDS[mode] ?? [0, Infinity]
  if (!(p.priceTHB != null && p.priceTHB >= plo && p.priceTHB <= phi))
    return `ราคา ฿${(p.priceTHB ?? 0).toLocaleString('en-US')} อยู่นอกช่วงที่เป็นไปได้`
  const [qlo, qhi] = PSQM_BOUNDS[mode] ?? [0, Infinity]
  const psqm = (p.priceTHB ?? 0) / (p.sqm || 1)
  if (!(psqm >= qlo && psqm <= qhi))
    return `฿/ตรม. = ${Math.round(psqm).toLocaleString('en-US')} นอกช่วงปกติ (${qlo.toLocaleString('en-US')}–${qhi.toLocaleString('en-US')})`
  if (p.vsFloorPct != null && p.vsFloorPct < -50) return `ถูกกว่าชั้นถึง ${Math.abs(p.vsFloorPct)}% — ถูกเกินจริง น่าจะกรอกราคาผิด`
  if (p.spreadPct != null && p.spreadPct > 60) return `ราคาแต่ละพอร์ทัลต่างกัน ${p.spreadPct}% — ข้อมูลไม่น่าไว้ใจ`
  return null
}

function DealChip({ p }: { p?: Profile }) {
  if (!p) return null
  const out: React.ReactNode[] = []
  if (p.dealTier === 'super') out.push(<span key="d" style={chipStyle('#166534', '#fff')} title={`ถูกกว่าค่าเฉลี่ยชั้น ${Math.abs(p.vsFloorPct ?? 0)}%`}>SUPER</span>)
  else if (p.dealTier === 'best') out.push(<span key="d" style={chipStyle('#d1f2dd', '#166534')} title={`ถูกกว่าค่าเฉลี่ยชั้น ${Math.abs(p.vsFloorPct ?? 0)}%`}>BEST</span>)
  else if (p.dealTier === 'good') out.push(<span key="d" style={chipStyle('#d1f2dd', '#166534')} title={`ถูกกว่าค่าเฉลี่ยโซน ${Math.abs(p.vsZonePct ?? 0)}%`}>GOOD</span>)
  const reason = sanityFailReason(p, p.intent)
  if (reason) out.push(
    <span key="x" style={{ ...chipStyle('#fde8e8', '#c2410c'), cursor: 'help' }}
      title={`ข้อมูลน่าสงสัยว่าผิด — ระบบกันไม่ให้ถูกคัดขึ้นบอร์ดอัตโนมัติ (ยังเลือกมือได้ถ้าตรวจแล้วว่าจริง)\nสาเหตุ: ${reason}`}>
      ตกตัวกรอง</span>)
  if (!out.length) return null
  /* เรียงแนวตั้ง — คอลัมน์ Deal แคบลง ป้ายไม่ดันกันในแนวนอน */
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>{out}</div>
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
  const [dataRound, setDataRound] = useState<string | null>(null)

  const [proj, setProj] = useState<string>('')
  const [polR, setPolR] = useState<Policy>({ ...DEFAULT_POLICY, investQ: 0 })
  const [polS, setPolS] = useState<Policy>({ ...DEFAULT_POLICY })
  const [selR, setSelR] = useState<Set<string>>(new Set())
  const [selS, setSelS] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ k: string; d: number }>({ k: '', d: 1 })
  const [saving, setSaving] = useState(false)
  const [colF, setColF] = useState<Record<string, Set<string>>>({})   // Excel filters รายคอลัมน์
  const [numF, setNumF] = useState<Record<string, { min?: number; max?: number }>>({}) // range filters คอลัมน์ตัวเลข
  const [openF, setOpenF] = useState<string | null>(null)
  // ช่องค้นในแผงตัวกรอง — เก็บไว้ที่นี่เพราะ FilterHead ถูกสร้างใหม่ทุก render
  // ถ้าเก็บ state ไว้ข้างใน มันจะโดนรีเซ็ตทุกครั้งที่ตารางวาดใหม่ · เปิดได้ทีละแผงจึงใช้ตัวเดียวพอ
  const [fq, setFq] = useState('')

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const [pf, src, pj, bd, rd] = await Promise.all([
          client.fetch<Profile[]>(`*[_type == "unitProfile" && status != "expired"]{ ${PROJ} }`),
          internal.fetch<SourceDoc[]>(`*[_type == "unitSource"]{ refCode, floorActual, "listings": coalesce(rentListings[]{ portal, url, "intent": "rent", posterType, posterName }, []) + coalesce(saleListings[]{ portal, url, "intent": "sale", posterType, posterName }, []) }`).catch(() => []),
          client.fetch<Array<{ _id: string; code: string }>>(`*[_type == "project"]{ _id, "code": code.current }`),
          client.fetch<Array<{ code: string; mode: string; policy?: Partial<Policy> }>>(`*[_type == "unitBoard"]{ "code": project->code.current, mode, policy }`),
          // รอบข้อมูลล่าสุด — ใบ scrapeRound จากวงจรรายสัปดาห์; ยังไม่มีรอบแรกถอยไปใช้ dataDate
          // ของ marketSnapshot (audit ⑤: ห้ามใช้ max lastCheckedAt — โดน spot-verify รายห้อง
          // ปนวันที่ใหม่ แล้วหัวข้อโชว์วันตรวจแทนวันของข้อมูลทั้งชุด)
          client.fetch<string | null>(`coalesce(*[_type == "scrapeRound"] | order(roundDate desc)[0].roundDate,
            *[_type == "marketSnapshot"] | order(dataDate desc)[0].dataDate)`).catch(() => null),
        ])
        if (dead) return
        setDataRound(rd ?? null)
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

  /* ชื่อ agent มาตรฐานของทั้งชุดข้อมูล — สร้างครั้งเดียวเพื่อให้ทุกแถวเรียกเจ้าเดียวกันด้วย
     สะกดเดียวกัน (ไม่งั้นแถวหนึ่งขึ้น PropertyScout อีกแถวขึ้น Propertyscout) */
  const agentCanon = useMemo(() => {
    const spell = new Map<string, Map<string, number>>()
    sources.forEach(s => (s.listings ?? []).forEach(l => {
      const n = (l.posterName ?? '').trim()
      if (!n || l.posterType === 'owner') return
      const k = agentKey(n)
      const m = spell.get(k) ?? new Map<string, number>()
      m.set(n, (m.get(n) ?? 0) + 1)
      spell.set(k, m)
    }))
    const out = new Map<string, string>()
    spell.forEach((m, k) => out.set(k, pickSpelling(m)))
    return out
  }, [sources])
  const agentsOf = useCallback((refCode: string) => {
    const seen = new Map<string, string>()
    ;(sources.get(refCode)?.listings ?? []).forEach(l => {
      const n = (l.posterName ?? '').trim()
      if (!n || l.posterType === 'owner') return
      const k = agentKey(n)
      seen.set(k, agentCanon.get(k) ?? n)
    })
    return [...seen.values()]
  }, [sources, agentCanon])

  /* ── Excel filters (Type / Zone / Posted by / Status) — ค่าเริ่มต้น = ติ๊กครบทุกค่า ──
     หนึ่งแถวให้ได้ "หลายค่า" ตามไฟล์เดิม (_units-all.html · FCOLS บรรทัด 61408):
     Posted by คืน 🏠 Owner + ชื่อ agent ทีละเจ้า ไม่ใช่ป้ายรวมว่า "Agent" — คนถึงจะ
     ติ๊กดูเฉพาะ PropertyScout หรือเอา PropertyScout ออกได้ · แถวผ่านถ้าค่าใดค่าหนึ่งถูกติ๊ก */
  const statusesOf = (u: Unit) => [u.rent?.status, u.sale?.status].filter(Boolean) as string[]
  const fvals = (fk: string, u: Unit): string[] => {
    if (fk === 'type') return [BED_LABEL[u.bed ?? ''] ?? u.bed ?? '—']
    if (fk === 'zone') return [u.zone ?? '—']
    if (fk === 'status') return statusesOf(u)
    if (fk === 'posted') {
      const src = sources.get(u.refCode)
      const out: string[] = []
      if (u.rent?.postedByOwner || u.sale?.postedByOwner || (src?.listings ?? []).some(l => l.posterType === 'owner'))
        out.push('🏠 Owner')
      agentsOf(u.refCode).filter(cleanAgent).forEach(a => out.push(a))
      return out.length ? out : ['(ไม่ระบุ)']
    }
    return []
  }
  /* เรียงตามจำนวนมากไปน้อยเหมือนไฟล์เดิม — เรียงตามตัวอักษรแล้วรายใหญ่จมกลางลิสต์ 80+ ชื่อ */
  const valCounts = (fk: string) => {
    const c = new Map<string, number>()
    units.forEach(u => fvals(fk, u).forEach(v => c.set(v, (c.get(v) ?? 0) + 1)))
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
  }
  const distinctVals = (fk: string) => valCounts(fk).map(([v]) => v)
  const passF = (u: Unit) => Object.entries(colF).every(([fk, set]) => fvals(fk, u).some(v => set.has(v)))
  /* ค่าตัวเลขต่อคอลัมน์ — หน่วยเดียวกับที่ตาแสดง (Rent เป็น K, Sale เป็น M) จะได้พิมพ์ตามที่เห็น */
  const nval = (nk: string, u: Unit): number | undefined => {
    if (nk === 'nsqm') return u.sqm
    if (nk === 'nfl') return sources.get(u.refCode)?.floorActual
    if (nk === 'nrent') return u.rent?.priceTHB != null ? u.rent.priceTHB / 1000 : undefined
    if (nk === 'nsale') return u.sale?.priceTHB != null ? u.sale.priceTHB / 1e6 : undefined
    return undefined
  }
  const passN = (u: Unit) => Object.entries(numF).every(([nk, r]) => {
    if (r.min == null && r.max == null) return true
    const v = nval(nk, u)
    if (v == null) return false                     // กรอง range อยู่ = ห้องไม่มีค่านั้นไม่ต้องโชว์
    return (r.min == null || v >= r.min) && (r.max == null || v <= r.max)
  })
  const toggleF = (fk: string, v: string) => {
    const all = distinctVals(fk)
    const cur = colF[fk] ? new Set(colF[fk]) : new Set(all)
    cur.has(v) ? cur.delete(v) : cur.add(v)
    const n = { ...colF }
    if (cur.size === all.length) delete n[fk]; else n[fk] = cur
    setColF(n)
  }
  const setAllF = (fk: string, on: boolean) => {
    const n = { ...colF }
    if (on) delete n[fk]; else n[fk] = new Set<string>()
    setColF(n)
  }

  const shown = useMemo(() => {
    const s = q.trim().toUpperCase()
    let list = units.filter(u => {
      if (!passF(u)) return false
      if (!passN(u)) return false
      const agents = agentsOf(u.refCode)
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
          case 'rpsqm': return u.rent?.pricePerSqm ?? -1
          case 'spsqm': return u.sale?.pricePerSqm ?? -1
          case 'yield': return u.rent?.yieldPct ?? u.sale?.yieldPct ?? -1
          case 'vsr': return u.rent?.vsFloorPct ?? 9999
          case 'vss': return u.sale?.vsFloorPct ?? 9999
          case 'rdeal': return dealScore(u.rent)
          case 'sdeal': return dealScore(u.sale)
          case 'spread': return Math.max(u.rent?.spreadPct ?? -1, u.sale?.spreadPct ?? -1)
          case 'upd': return u.rent?.lastCheckedAt ?? u.sale?.lastCheckedAt ?? ''
          case 'fl': return sources.get(u.refCode)?.floorActual ?? -1
          /* ธงเปิด/ปิด — เรียงให้ห้องที่ติดธงขึ้นก่อน แล้วแพ้ชนะกันด้วยตัวเลขชุดเดียวกับที่
             bucket ของ engine ใช้จัดอันดับ (HOT=จำนวนประกาศแข่ง · NEGO=spread · INVEST=yield) */
          case 'hotr': return u.rent?.hotDeal ? -(u.rent.nListings ?? 0) : 1e6
          case 'hots': return u.sale?.hotDeal ? -(u.sale.nListings ?? 0) : 1e6
          case 'inv': return (u.rent?.goodInvest || u.sale?.goodInvest)
            ? -(u.rent?.yieldPct ?? u.sale?.yieldPct ?? 0) : 1e6
          case 'nego': return (u.rent?.negotiable || u.sale?.negotiable)
            ? -Math.max(u.rent?.spreadPct ?? 0, u.sale?.spreadPct ?? 0) : 1e6
          case 'board': return -((onR.has(u.refCode) ? 1 : 0) + (onS.has(u.refCode) ? 1 : 0))
          case 'type': return BED_ORDER.indexOf(u.bed ?? '')
          case 'zone': return ['low', 'mid', 'high'].indexOf(u.zone ?? '')
          case 'posted': return agentsOf(u.refCode).filter(cleanAgent)[0] ?? 'zzz'
          case 'status': return statusesOf(u).join(' ')
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
  }, [units, mode, q, sort, sources, onR, onS, colF, numF, agentsOf])

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

  /* lineup → orderItems ของ offer บอร์ด (mirror ของ tools/seed-board-offers.mjs — KEEP IN SYNC) */
  const BED_TH: Record<string, string> = { studio: 'สตูดิโอ', '1bed': '1 ห้องนอน', '2bed': '2 ห้องนอน', '3bed': '3 ห้องนอน', '4bed': '4 ห้องนอน+' }
  const BED_EN: Record<string, string> = { studio: 'Studio', '1bed': '1 Bedroom', '2bed': '2 Bedroom', '3bed': '3 Bedroom', '4bed': '4 Bed+' }
  const ZONE_TH: Record<string, string> = { low: 'ชั้นล่าง', mid: 'ชั้นกลาง', high: 'ชั้นสูง' }
  const ZONE_EN: Record<string, string> = { low: 'Low floor', mid: 'Mid floor', high: 'High floor' }
  /* ชั้นจริงมาก่อนโซน — โซนยุบ 24 ชั้นเหลือ 3 คำ ห้องคนละชั้นเลยอ่านเหมือนกัน */
  const toOrderItem = (p: Profile, m2: string) => {
    const f = sources.get(p.refCode)?.floorActual
    const flTh = f != null ? `ชั้น ${f}` : `${ZONE_TH[p.floorZone ?? ''] ?? ''} (${(p.floorZone ?? '').toUpperCase()})`
    const flEn = f != null ? `Floor ${f}` : (ZONE_EN[p.floorZone ?? ''] ?? '')
    return {
      _key: p.refCode, refCode: p.refCode, maxQty: 1,
      name_th: `${BED_TH[p.bedType ?? ''] ?? p.bedType} · ${p.sqm} ตรม. · ${flTh}`,
      name_en: `${BED_EN[p.bedType ?? ''] ?? p.bedType} · ${p.sqm} sqm · ${flEn}`,
      price: m2 === 'rent' ? `${((p.priceTHB ?? 0) / 1e3).toFixed(1)}K ฿/ด.` : `${((p.priceTHB ?? 0) / 1e6).toFixed(1)}M`,
    }
  }

  async function save() {
    if (!projDoc) return
    setSaving(true)
    try {
      const code = NAME_TO_CODE[proj]
      let offersTouched = 0, offersMissing: string[] = []
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
        // เขียน orderItems เข้า offer ของบอร์ดด้วย — modal ลิสต์ห้อง/cart บนจอใช้ชุดเดียวกับ lineup เป๊ะ
        const oid = `offer-board-${code}-${m2}`
        const existing = (await client.getDocument(`drafts.${oid}`)) ?? (await client.getDocument(oid))
        if (existing) {
          const { _rev, _createdAt, _updatedAt, ...rest } = existing as any
          await client.createOrReplace({ ...rest, _id: `drafts.${oid}`, orderItems: sim.rows.map(p => toOrderItem(p, m2)) })
          offersTouched++
        } else offersMissing.push(m2)
      }
      toast.push({
        status: 'success', title: 'บันทึกเป็น draft แล้ว',
        description: `rent ${simR.rows.length} · sale ${simS.rows.length} แถว`
          + (offersTouched ? ` · อัปเดตลิสต์ห้องใน offer บอร์ด ${offersTouched} ฝั่ง` : '')
          + (offersMissing.length ? ` · ⚠ ยังไม่มี offer บอร์ดฝั่ง ${offersMissing.join('/')} (รัน seed-board-offers ก่อน)` : '')
          + ' — กด publish ใน Pending Publish เพื่อปล่อยขึ้นจอ',
      })
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


  /* ── สถานะดีล ─────────────────────────────────────────────────────────────
     เขียนลง "ใบที่ publish แล้ว" ตรง ๆ ไม่ผ่าน draft ต่างจากปุ่ม Save ด้านบน
     เพราะสองอย่างนี้คนละชนิดกัน: lineup คือการตัดสินใจว่าจะโชว์อะไร (ควรมีคนรีวิว)
     ส่วนสถานะดีลคือข้อเท็จจริงที่เพิ่งเกิด (ห้องเช่าไปแล้ว) — ถ้าต้องรอ publish
     จอจะโชว์ว่าห้องยังว่างทั้งที่ปิดไปแล้ว ซึ่งแย่กว่าการข้ามขั้นรีวิว */
  const STAGES: Array<[string, string, string]> = [
    ['', 'ว่าง', '#e5e7eb'],
    ['viewing', '👀 นัดชม', '#fde68a'],
    ['talking', '💬 กำลังคุย', '#bfdbfe'],
    ['closed', '✅ ปิดดีล', '#bbf7d0'],
  ]
  const [stageBusy, setStageBusy] = useState<string | null>(null)
  const setStage = async (p: Profile, m2: 'rent' | 'sale', v: string) => {
    const id = `unitProfile-${p.refCode}-${m2}`
    setStageBusy(id)
    try {
      const patch = client.patch(id)
      await (v ? patch.set({ dealStage: v, dealStageAt: new Date().toISOString().slice(0, 10) })
                : patch.unset(['dealStage', 'dealStageAt'])).commit()
      setProfiles(ps => ps.map(x => x.refCode === p.refCode && x.intent === m2
        ? { ...x, dealStage: v || undefined, dealStageAt: v ? new Date().toISOString().slice(0, 10) : undefined } : x))
      toast.push({ status: 'success', title: `${p.refCode} → ${STAGES.find(t => t[0] === v)?.[1] ?? 'ว่าง'}` })
    } catch (e: any) {
      toast.push({ status: 'error', title: 'เปลี่ยนสถานะไม่สำเร็จ', description: e?.message })
    } finally { setStageBusy(null) }
  }
  const stageRow = (p: Profile, m2: 'rent' | 'sale') => {
    const cur = p.dealStage ?? ''
    const id = `unitProfile-${p.refCode}-${m2}`
    return (
      <Flex key={p.refCode + m2} align="center" gap={2} style={{ padding: '3px 0', opacity: stageBusy === id ? 0.45 : 1 }}>
        <Text size={1} style={{ width: 92, fontFamily: 'monospace' }}>{p.refCode}</Text>
        <Text size={1} muted style={{ width: 168, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {BED_LABEL[p.bedType ?? ''] ?? p.bedType} · {p.sqm} ตรม. · {sources.get(p.refCode)?.floorActual != null ? `ชั้น ${sources.get(p.refCode)!.floorActual}` : (p.floorZone ?? '').toUpperCase()}
        </Text>
        <Flex gap={1}>
          {STAGES.map(([v, label, bg]) => (
            <button key={v || 'none'} onClick={() => setStage(p, m2, v)} disabled={stageBusy === id}
              style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
                border: cur === v ? '1px solid #0f3460' : '1px solid #d1d5db',
                background: cur === v ? bg : '#fff', fontWeight: cur === v ? 700 : 400 }}>{label}</button>
          ))}
        </Flex>
        {p.dealStageAt && cur === 'closed' && <Text size={0} muted>ปิดเมื่อ {p.dealStageAt}</Text>}
      </Flex>
    )
  }

  const FILTERS: Array<[string, string]> = [
    ['all', 'All'], ['rent', 'Has rent'], ['sale', 'Has sale'], ['dual', 'Dual'],
    ['brent', 'On board · rent'], ['bsale', 'On board · sale'], ['fx', 'Filtered out'],
  ]
  const H = (label: string, key?: string, title?: string) => (
    <th style={th} title={title} onClick={() => key && setSort(s => ({ k: key, d: s.k === key ? -s.d : 1 }))}>{label}{key ? ' ↕' : ''}</th>
  )
  /* หัวคอลัมน์แบบมี Excel filter — ▾ เปิดแผงติ๊กเลือกค่า
     ครบตามแผงของไฟล์เดิม: ช่องพิมพ์ค้นในลิสต์ · Select all / Clear · เลขจำนวนต่อท้ายทุกค่า ·
     เรียงตามจำนวนมากไปน้อย (Posted by มี 80+ ชื่อ ถ้าไม่มีสามอย่างนี้คือใช้งานไม่ได้จริง) */
  const linkS: React.CSSProperties = { fontSize: 11.5, color: '#0f3460', cursor: 'pointer', fontWeight: 700 }
  /* คลิกที่ชื่อคอลัมน์ = เรียง · คลิกที่ ▾ = เปิดแผงกรอง (แยกเป้าคลิกแบบไฟล์เดิม
     ที่ th ทั้งใบเรียงได้ ส่วน .cf หยุด propagation ไว้เอง) */
  const FilterHead = ({ label, fk, style, title, sk }: { label: string; fk: string; style?: React.CSSProperties; title?: string; sk?: string }) => {
    const caret = (
      <span onClick={e => { e.stopPropagation(); setOpenF(openF === fk ? null : fk); setFq('') }}
        style={{ cursor: 'pointer', color: colF[fk] ? '#ffd28a' : undefined, marginLeft: 4 }}>{colF[fk] ? '▼' : '▾'}</span>
    )
    const onSort = () => sk && setSort(s => ({ k: sk, d: s.k === sk ? -s.d : 1 }))
    if (openF !== fk) return (
      <th style={style ?? th} title={title} onClick={onSort}>{label}{sk ? ' ↕' : ''}{caret}</th>
    )
    const t = fq.trim().toUpperCase()
    const rows = valCounts(fk).filter(([v]) => !t || v.toUpperCase().includes(t))
    return (
      /* overflow:visible ตอนแผงเปิด — คอลัมน์ freeze มี overflow:hidden ซึ่งจะ clip แผงกรองจนเหลือแต่ช่องพิมพ์ */
      <th style={{ ...(style ?? th), overflow: 'visible', zIndex: 40 }} title={title} onClick={onSort}>
        {label}{sk ? ' ↕' : ''}{caret}
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', color: '#14213A', border: '1px solid #d1d5db', borderRadius: 8, padding: 8, zIndex: 30, minWidth: 240, boxShadow: '0 10px 24px rgba(0,0,0,0.18)', textTransform: 'none', fontWeight: 400, cursor: 'default' }}>
          <input value={fq} onChange={e => setFq(e.currentTarget.value)} placeholder="พิมพ์กรองรายชื่อ..." autoFocus
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 5, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
            <span style={linkS} onClick={() => setAllF(fk, true)}>Select all</span>
            <span style={linkS} onClick={() => setAllF(fk, false)}>Clear</span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {rows.map(([v, c]) => (
              <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, padding: '2px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={colF[fk] ? colF[fk].has(v) : true} onChange={() => toggleF(fk, v)} />
                <span title={v} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                <span style={{ color: '#9aa3b2', fontSize: 11 }}>{c}</span>
              </label>
            ))}
            {!rows.length && <div style={{ fontSize: 12, color: '#9aa3b2', padding: '4px 0' }}>ไม่พบชื่อที่ตรง</div>}
          </div>
        </div>
      </th>
    )
  }

  /* หัวคอลัมน์ตัวเลข — ประกาศนอก render ไม่ได้เพราะปิดทับ state หลายตัว แต่ถ้าประกาศในนี้
     ตรง ๆ React จะเห็นเป็นคนละ component ทุก render → input โดน remount → โฟกัสหลุดทุกตัวอักษร
     ทางออก: ใช้ useCallback-ref pattern ไม่ได้กับ component — จึงประกาศเป็นฟังก์ชันแล้ว "เรียก"
     เป็น expression {NumHead({...})} แทนการใช้เป็น <NumHead/> เพื่อไม่สร้าง component boundary */
  const NumHead = ({ label, nk, sk, style, title }: { label: string; nk: string; sk?: string; style?: React.CSSProperties; title?: string }) => {
    const r = numF[nk]
    const active = r != null && (r.min != null || r.max != null)
    const caret = (
      <span onClick={e => { e.stopPropagation(); setOpenF(openF === nk ? null : nk) }}
        style={{ cursor: 'pointer', color: active ? '#ffd28a' : undefined, marginLeft: 4 }}>{active ? '▼' : '▾'}</span>
    )
    const onSort = () => sk && setSort(s => ({ k: sk, d: s.k === sk ? -s.d : 1 }))
    if (openF !== nk) return (
      <th style={style ?? th} title={title} onClick={onSort}>{label}{sk ? ' ↕' : ''}{caret}</th>
    )
    const setR = (part: 'min' | 'max', raw: string) => {
      const v = raw.trim() === '' ? undefined : Number(raw)
      const cur = { ...(numF[nk] ?? {}) , [part]: (v != null && Number.isFinite(v)) ? v : undefined }
      const n = { ...numF }
      if (cur.min == null && cur.max == null) delete n[nk]; else n[nk] = cur
      setNumF(n)
    }
    const inpS: React.CSSProperties = { width: 86, boxSizing: 'border-box', fontSize: 12.5, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 5 }
    return (
      <th style={{ ...(style ?? th), overflow: 'visible', zIndex: 40 }} title={title} onClick={onSort}>
        {label}{sk ? ' ↕' : ''}{caret}
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', color: '#14213A', border: '1px solid #d1d5db', borderRadius: 8, padding: 10, zIndex: 30, minWidth: 210, boxShadow: '0 10px 24px rgba(0,0,0,0.18)', textTransform: 'none', fontWeight: 400, cursor: 'default' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" placeholder="ต่ำสุด" autoFocus value={r?.min ?? ''} onChange={e => setR('min', e.currentTarget.value)} style={inpS} />
            <span style={{ color: '#9aa3b2' }}>–</span>
            <input type="number" placeholder="สูงสุด" value={r?.max ?? ''} onChange={e => setR('max', e.currentTarget.value)} style={inpS} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <span style={linkS} onClick={() => { const n = { ...numF }; delete n[nk]; setNumF(n) }}>Clear</span>
            <span style={{ fontSize: 11, color: '#9aa3b2' }}>เว้นว่าง = ไม่จำกัดด้านนั้น · ห้องที่ไม่มีค่านี้จะถูกซ่อน</span>
          </div>
        </div>
      </th>
    )
  }

  return (
    <Flex direction="column" padding={4} gap={4} style={{ height: '100%', minHeight: 0 }}>
      <style>{`.ub-scroll::-webkit-scrollbar{height:13px;width:13px}
        .ub-scroll::-webkit-scrollbar-thumb{background:#8fa0b8;border-radius:7px;border:2px solid #eef1f5}
        .ub-scroll::-webkit-scrollbar-track{background:#eef1f5}`}</style>
      <Stack space={4} style={{ flexShrink: 0 }}>
        <Flex align="center" gap={3} wrap="wrap">
          <Text size={2} weight="bold">Unit Boards · คัดห้องขึ้นบอร์ดราคา</Text>
          <select value={proj} onChange={e => setProj(e.currentTarget.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
            {projectNames.map(n => <option key={n} value={n}>{n}{NAME_TO_CODE[n] ? '' : ' (ยังไม่มี project doc)'}</option>)}
          </select>
          <Button text={saving ? 'Saving…' : 'Save to lineup (draft)'} tone="primary" disabled={!projDoc || saving || overQuota}
            title={!projDoc ? 'โครงการนี้ยังไม่มี project doc — สร้างก่อนจึงบันทึกได้' : 'เขียน drafts.unitBoard พร้อม policy + lineup ปัจจุบัน'}
            onClick={save} />
          {([['Preview เช่า', 'rent', simR], ['Preview ขาย', 'sale', simS]] as const).map(([label, m2, sim]) => (
            <Button key={m2} text={label} mode="ghost" fontSize={1} disabled={!sim.rows.length}
              title="เห็นเหมือนบนจอจริง: บอร์ดการ์ดในกรอบ player (header/footer navy) ด้วย lineup ที่เห็นอยู่ตอนนี้ — ยังไม่ต้อง Save"
              onClick={() => {
                const payload = { project: proj.toUpperCase(), mode: m2, dataAsOf: dataRound ?? undefined, rows: sim.rows.map(p => profileToRow({ ...p, floorActual: sources.get(p.refCode)?.floorActual })) }
                window.open(`/static/board-preview.html?tpl=cards#sim=${encodeURIComponent(JSON.stringify(payload))}`, '_blank')
              }} />
          ))}
          {([['flap เช่า', 'rent', simR], ['flap ขาย', 'sale', simS]] as const).map(([label, m2, sim]) => (
            <Button key={'f' + m2} text={label} mode="bleed" fontSize={0} disabled={!sim.rows.length}
              title="บอร์ด split-flap (หน้ายืนเดี่ยว /board/) ในกรอบจอจริง"
              onClick={() => {
                const payload = { project: proj.toUpperCase(), mode: m2, dataAsOf: dataRound ?? undefined, rows: sim.rows.map(p => profileToRow({ ...p, floorActual: sources.get(p.refCode)?.floorActual })) }
                window.open(`/static/board-preview.html?tpl=flap#sim=${encodeURIComponent(JSON.stringify(payload))}`, '_blank')
              }} />
          ))}
          {dataRound && (() => {
            const days = Math.floor((Date.now() - new Date(dataRound).getTime()) / 86400000)
            const stale = days > 9   // วงจรรายสัปดาห์ + ผ่อน 2 วัน — เกินนี้คือรอบวันอาทิตย์พลาด
            return (
              <Badge tone={stale ? 'caution' : 'primary'} fontSize={1}
                title={stale ? `ข้อมูลค้าง ${days} วัน — รอบ scrape วันอาทิตย์อาจไม่ได้รัน` : 'รอบเก็บข้อมูลล่าสุดที่ตารางนี้ใช้'}>
                ข้อมูลรอบ · {dataRound}{stale ? ` (ค้าง ${days} วัน!)` : ''}
              </Badge>
            )
          })()}
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

        {/* สถานะดีลของเฉพาะห้องที่ถูกเลือกขึ้นบอร์ด — ไม่ใช่ทั้ง 234 ห้อง */}
        <Card padding={3} radius={2} border tone="transparent">
          <Stack space={3}>
            <Text size={1} weight="bold">สถานะดีล · เฉพาะห้องที่จะขึ้นจอ ({simR.rows.length + simS.rows.length} ห้อง)</Text>
            {([['บอร์ดเช่า', 'rent', simR], ['บอร์ดขาย', 'sale', simS]] as const).map(([label, m2, sim]) => sim.rows.length > 0 && (
              <Stack key={m2} space={1}>
                <Text size={1} muted weight="semibold">{label}</Text>
                {sim.rows.map(p => stageRow(p, m2))}
              </Stack>
            ))}
            <Text size={0} muted>กดแล้วมีผลทันที ไม่ต้อง publish · ห้องที่ปิดดีลจะโชว์บนจอ 30 วันแล้วหลุดเอง</Text>
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
      </Stack>

      {/* ตารางกินพื้นที่ที่เหลือของจอ — แถบเลื่อนแนวนอน/แนวตั้งอยู่ในสายตาเสมอ ไม่จมใต้ fold */}
      <div className="ub-scroll" style={{ flex: 1, minHeight: 220, overflow: 'auto', border: '1px solid #e3e8ef', borderRadius: 6, background: '#fff' }}>
          <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
            <thead><tr>
              <th style={thFz(0)} title="ลำดับตามการเรียง/กรองปัจจุบัน">#</th>
              <th style={thFz(1)} title="รหัสห้องอ้างอิงภายใน" onClick={() => setSort(s => ({ k: 'ref', d: s.k === 'ref' ? -s.d : 1 }))}>Ref ↕</th>
              <FilterHead label="Type" fk="type" sk="type" style={thFz(2)} title="ประเภทห้อง — กดชื่อคอลัมน์เพื่อเรียง กด ▾ กรองได้" />
              {NumHead({ label: 'SQM', nk: 'nsqm', sk: 'sqm', style: thFz(3), title: 'ขนาดห้อง (ตร.ม.) — กด ▾ กรองช่วงต่ำสุด-สูงสุดได้' })}
              <FilterHead label="Zone" fk="zone" sk="zone" style={thFz(4)} title="โซนชั้น แบ่งจากช่วงชั้นของตึก — กดชื่อคอลัมน์เพื่อเรียง กด ▾ กรองได้" />
              {NumHead({ label: 'Floor', nk: 'nfl', sk: 'fl', style: thFz(5), title: 'ชั้นจริง (internal dataset) — กด ▾ กรองช่วงชั้นได้' })}
              {NumHead({ label: 'Rent (K)', nk: 'nrent', sk: 'rent', title: 'ค่าเช่า/เดือน ต่ำสุดที่พบข้ามพอร์ทัล — กด ▾ กรองช่วงได้ (หน่วย K เช่น 20 = 20,000)' })}
              {H('฿/SQM', 'rpsqm', 'ค่าเช่าต่อตร.ม./เดือน')}
              {H('vs Floor', 'vsr', 'เทียบค่าเฉลี่ย ฿/ตรม. ของชั้นเดียวกัน — ติดลบ = ถูกกว่าชั้น')}
              {H('Rent Deal', 'rdeal', 'ธงดีลฝั่งเช่า (ชี้ที่ธงดูเหตุผล+ตัวเลข) — เรียงจากดีลแรงสุด: SUPER → BEST → GOOD → ไม่มีธง')}
              {H('Select R', undefined, 'เลือกมือขึ้นบอร์ดเช่า — นับรวมใน quota')}
              {H('Hot', 'hotr', 'HOT = agent ≥2 รายแข่งปล่อยห้องนี้')}
              {NumHead({ label: 'Sale (M)', nk: 'nsale', sk: 'sale', title: 'ราคาขายต่ำสุดที่พบข้ามพอร์ทัล — กด ▾ กรองช่วงได้ (หน่วย M เช่น 8.5 = 8,500,000)' })}
              {H('฿/SQM', 'spsqm', 'ราคาขายต่อตร.ม.')}
              {H('vs Floor', 'vss', 'เทียบค่าเฉลี่ย ฿/ตรม. ของชั้นเดียวกัน — ติดลบ = ถูกกว่าชั้น')}
              {H('Sale Deal', 'sdeal', 'ธงดีลฝั่งขาย (ชี้ที่ธงดูเหตุผล+ตัวเลข) — เรียงจากดีลแรงสุด: SUPER → BEST → GOOD → ไม่มีธง')}
              {H('Select S', undefined, 'เลือกมือขึ้นบอร์ดขาย — นับรวมใน quota')}
              {H('Hot', 'hots', 'HOT = agent ≥2 รายแข่งขายห้องนี้')}
              {H('Invest', 'inv', 'INVESTABLE = มีทั้งเช่าและขาย และ yield สูงกว่าค่าเฉลี่ยตึก')}
              {H('Yield', 'yield', 'ค่าเช่าทั้งปี ÷ ราคาขาย (%) — เฉพาะห้อง dual')}
              {H('Nego', 'nego', 'NEGO = ลงประกาศ ≥3 พอร์ทัล และราคาต่างกัน ≥5% — มีช่องต่อรอง')}
              {H('Spread', 'spread', 'ช่วงราคาข้ามพอร์ทัล (สูงสุด−ต่ำสุด)/ต่ำสุด — กว้าง = ต่อรองได้')}
              {H('Update', 'upd', 'รอบข้อมูลล่าสุดที่ยังพบห้องนี้ในตลาด')}
              <FilterHead label="Posted by" fk="posted" sk="posted" title="ใครลงประกาศ — 🏠 Owner = เจ้าของโพสต์เอง (ไม่มีชื่อ agent โดยนิยาม) · ชื่อ = agent/agency ที่โพสต์ — กดชื่อคอลัมน์เพื่อเรียง กด ▾ ติ๊กเลือก/เอาออกรายเจ้าได้" />
              <FilterHead label="Status" fk="status" sk="status" title="สถานะ cleansing ของทีม (แยกฝั่งเช่า/ขาย) — กดชื่อคอลัมน์เพื่อเรียง กด ▾ กรองได้" />
              {H('Board', 'board', 'ติด lineup ปัจจุบัน + เหตุผลที่ถูกคัด (SELECT/BED/ธง/FILL)')}
              {H('Sources', undefined, 'ลิงก์ประกาศต้นทางทุกพอร์ทัล')}
            </tr></thead>
            <tbody>
              {shown.map((u, i) => {
                const src = sources.get(u.refCode)
                const rzR = onR.get(u.refCode), rzS = onS.get(u.refCode)
                const agents = agentsOf(u.refCode).filter(cleanAgent)
                const owner = u.rent?.postedByOwner || u.sale?.postedByOwner || (src?.listings ?? []).some(l => l.posterType === 'owner')
                const onBoard = rzR != null || rzS != null
                const y = u.rent?.yieldPct ?? u.sale?.yieldPct
                const links = [...new Map((src?.listings ?? []).filter(l => l.url).map(l => [l.url!, l])).values()]
                return (
                  <tr key={u.refCode} style={{ background: onBoard ? '#f4fbf6' : undefined }}>
                    <td style={{ ...tdFz(0, onBoard ? '#f4fbf6' : '#fff'), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                    <td style={{ ...tdFz(1, onBoard ? '#f4fbf6' : '#fff'), fontWeight: 700 }}>
                      {/* Ref → เปิด unitProfile ใน Structure (เช่าก่อน ถ้ามีแต่ขายก็ขาย) · src → unitSource ฝั่ง internal (จด contact log) */}
                      <a href={`/studio/intent/edit/id=unitProfile-${u.refCode}-${u.rent ? 'rent' : 'sale'};type=unitProfile`}
                        target="_blank" rel="noreferrer" title="เปิดแก้ unitProfile (status/pin/โน้ต)"
                        style={{ color: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>{u.refCode}</a>
                      {u.rent && u.sale && (
                        <a href={`/studio/intent/edit/id=unitProfile-${u.refCode}-sale;type=unitProfile`} target="_blank" rel="noreferrer"
                          title="เปิดแก้ profile ฝั่งขาย" style={{ marginLeft: 4, fontSize: 10, color: '#0f766e' }}>S</a>
                      )}
                      <a href={`/internal/intent/edit/id=unitSource-${u.refCode};type=unitSource`} target="_blank" rel="noreferrer"
                        title="เปิด unitSource (internal) — ลิงก์ต้นทาง + จด Contact Log หลังโทร"
                        style={{ marginLeft: 4, fontSize: 10, color: '#92400e' }}>src</a>
                    </td>
                    <td style={tdFz(2, onBoard ? '#f4fbf6' : '#fff')}>{BED_LABEL[u.bed ?? ''] ?? u.bed ?? '—'}</td>
                    <td style={{ ...tdFz(3, onBoard ? '#f4fbf6' : '#fff'), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.sqm ?? '—'}</td>
                    <td style={tdFz(4, onBoard ? '#f4fbf6' : '#fff')}>{u.zone ?? '—'}</td>
                    <td style={{ ...tdFz(5, onBoard ? '#f4fbf6' : '#fff'), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{src?.floorActual ?? '—'}</td>
                    <td style={num}>{fmtK(u.rent?.priceTHB)}<PriceMove p={u.rent} /></td>
                    <td style={num}>{u.rent?.pricePerSqm != null ? u.rent.pricePerSqm.toLocaleString('en-US') : '—'}</td>
                    <td style={{ ...num, color: (u.rent?.vsFloorPct ?? 0) < 0 ? '#166534' : '#9aa3b2', fontWeight: (u.rent?.vsFloorPct ?? 0) < 0 ? 700 : 400 }}>
                      {u.rent?.vsFloorPct != null ? `${u.rent.vsFloorPct > 0 ? '+' : ''}${u.rent.vsFloorPct}%` : '—'}</td>
                    <td style={td}><DealChip p={u.rent} /></td>
                    <td style={td}>{u.rent && <Checkbox checked={selR.has(u.refCode)} onChange={() => {
                      const s = new Set(selR); s.has(u.refCode) ? s.delete(u.refCode) : s.add(u.refCode); setSelR(s)
                    }} />}</td>
                    <td style={td}>{u.rent?.hotDeal
                      ? <span style={chipStyle('#ffedd5', '#c2410c')} title={`มี ${u.rent.nListings ?? 0} ประกาศแข่งปล่อยห้องนี้`}>HOT</span> : ''}</td>
                    <td style={num}>{fmtM(u.sale?.priceTHB)}<PriceMove p={u.sale} /></td>
                    <td style={num}>{u.sale?.pricePerSqm != null ? u.sale.pricePerSqm.toLocaleString('en-US') : '—'}</td>
                    <td style={{ ...num, color: (u.sale?.vsFloorPct ?? 0) < 0 ? '#166534' : '#9aa3b2', fontWeight: (u.sale?.vsFloorPct ?? 0) < 0 ? 700 : 400 }}>
                      {u.sale?.vsFloorPct != null ? `${u.sale.vsFloorPct > 0 ? '+' : ''}${u.sale.vsFloorPct}%` : '—'}</td>
                    <td style={td}><DealChip p={u.sale} /></td>
                    <td style={td}>{u.sale && <Checkbox checked={selS.has(u.refCode)} onChange={() => {
                      const s = new Set(selS); s.has(u.refCode) ? s.delete(u.refCode) : s.add(u.refCode); setSelS(s)
                    }} />}</td>
                    <td style={td}>{u.sale?.hotDeal
                      ? <span style={chipStyle('#ffedd5', '#c2410c')} title={`มี ${u.sale.nListings ?? 0} ประกาศแข่งขายห้องนี้`}>HOT</span> : ''}</td>
                    <td style={td}>{(u.rent?.goodInvest || u.sale?.goodInvest)
                      ? <span style={chipStyle('#d1f2dd', '#166534')} title="มีทั้งเช่าและขาย และ yield สูงกว่าค่าเฉลี่ยตึก">INVEST</span> : ''}</td>
                    <td style={{ ...num, color: (y ?? 0) >= 5 ? '#166534' : undefined, fontWeight: (y ?? 0) >= 5 ? 700 : 400 }}>{y != null ? y.toFixed(1) + '%' : '—'}</td>
                    <td style={td}>{(u.rent?.negotiable || u.sale?.negotiable)
                      ? <span style={chipStyle('#f3f4f6', '#374151')} title="ลงหลายพอร์ทัลและราคาต่างกัน ≥5% — มีช่องต่อรอง">NEGO</span> : ''}</td>
                    <td style={num}>{(() => { const sp = Math.max(u.rent?.spreadPct ?? -1, u.sale?.spreadPct ?? -1); return sp >= 0 ? sp + '%' : '—' })()}</td>
                    <td style={{ ...td, fontSize: 12 }}>{(u.rent?.lastCheckedAt ?? u.sale?.lastCheckedAt ?? '—').slice(5)}</td>
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
                      {links.length ? links.map((l, j) => (
                        <a key={j} href={l.url} target="_blank" rel="noreferrer"
                          title={`${l.intent ?? ''} · ${l.posterType === 'owner' ? 'เจ้าของโพสต์เอง' : (l.posterName || 'agent')}`}
                          style={{ marginRight: 6, ...(l.posterType === 'owner' ? { color: '#166534', fontWeight: 700 } : {}) }}>
                          {l.posterType === 'owner' ? '🏠' : ''}{l.portal}
                        </a>
                      )) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      </div>
      <Text size={1} muted style={{ flexShrink: 0 }}>internal use only — มีชั้นจริง + ลิงก์ต้นทาง · Save = draft เท่านั้น ทีมยัง publish ผ่าน Pending Publish ตามเดิม</Text>
    </Flex>
  )
}
