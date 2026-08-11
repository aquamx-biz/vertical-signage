#!/usr/bin/env node
/**
 * seed-board-offers.mjs — สร้าง/อัปเดต offer ของบอร์ดการ์ด (drafts เสมอ — ไม่มีวันขึ้นจอเอง)
 *
 * Usage: node --env-file=.env tools/seed-board-offers.mjs [--project <code>] [--write]
 *   default: ทุกโครงการที่มี unitBoard · dry-run จนกว่าจะใส่ --write
 *
 * ต่อโครงการ×โหมด: drafts.offer-board-<code>-<mode>
 *  - ยังไม่มี → สร้างโครงครบ (provider aquamx, scope=project, category forRent/forSale,
 *    ctaType order, slug board-<code>-<mode>) + orderItems จาก lineup
 *  - มีแล้ว → อัปเดตเฉพาะ orderItems (field อื่นที่ทีมแต่งไว้ไม่ถูกแตะ)
 *
 * orderItems ตามสัญญา cart (2026-08-04): { _key/refCode = รหัสห้อง, maxQty:1 → ปุ่ม "เลือก ✓",
 * name_th/name_en, price เป็นสตริงจัดรูปแล้ว } — UnitBoardsTool.save() มี mirror
 * ของ formatter ชุดนี้ (KEEP IN SYNC)
 */
import { closedTooLong } from '../board-engine.mjs'
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const ONLY = argOf('--project')

const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
async function q(query, dataset = 'production') {   // raw (ไม่ใส่ perspective) — ต้องเห็น drafts ด้วย
  const r = await fetch(`${API}/data/query/${dataset}?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}
async function mutate(mutations) {
  if (!WRITE) return
  const r = await fetch(`${API}/data/mutate/production`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations }),
  })
  if (!r.ok) throw new Error(`mutate ${r.status}: ${await r.text()}`)
}

/* ── formatters (mirror ใน UnitBoardsTool.unitToOrderItem — KEEP IN SYNC) ── */
const BED_TH = { studio: 'สตูดิโอ', '1bed': '1 ห้องนอน', '2bed': '2 ห้องนอน', '3bed': '3 ห้องนอน', '4bed': '4 ห้องนอน+' }
const BED_EN = { studio: 'Studio', '1bed': '1 Bedroom', '2bed': '2 Bedroom', '3bed': '3 Bedroom', '4bed': '4 Bed+' }
const ZONE_TH = { low: 'ชั้นล่าง', mid: 'ชั้นกลาง', high: 'ชั้นสูง' }
const ZONE_EN = { low: 'Low floor', mid: 'Mid floor', high: 'High floor' }
/* ชั้นจริงมาก่อนโซนเสมอ — โซนยุบ 24 ชั้นเหลือ 3 คำ ทำให้ห้องคนละชั้นอ่านเหมือนกัน
   (ชั้น 17/21/22 กลายเป็น "ชั้นกลาง" หมด ลูกค้าและทีมแยกไม่ออกว่าห้องไหนเป็นห้องไหน) */
export function profileToOrderItem(p, mode) {
  const fl = p.floorActual != null
    ? { th: `ชั้น ${p.floorActual}`, en: `Floor ${p.floorActual}` }
    /* ไม่ต่อท้ายด้วยรหัสโซนในวงเล็บ — "ชั้นล่าง" บอกครบแล้ว และฝั่งอังกฤษไม่เคยมีวงเล็บ
       ลูกค้าไทยเห็น "ชั้นล่าง (LOW)" ส่วนต่างชาติเห็น "Low floor" มาตลอด */
    : { th: ZONE_TH[p.floorZone] ?? '', en: ZONE_EN[p.floorZone] ?? '' }
  return {
    _key: p.refCode,
    refCode: p.refCode,
    maxQty: 1,
    name_th: `${BED_TH[p.bedType] ?? p.bedType} · ${p.sqm} ตรม. · ${fl.th}`,
    name_en: `${BED_EN[p.bedType] ?? p.bedType} · ${p.sqm} sqm · ${fl.en}`,
    price: mode === 'rent' ? `${(p.priceTHB / 1e3).toFixed(1)}K ฿/ด.` : `${(p.priceTHB / 1e6).toFixed(1)}M`,
    // ปิดดีลแล้ว → โชว์ในลิสต์แต่กดเลือกไม่ได้ (player เรนเดอร์แถว sold เป็นเทา)
    ...(p.dealStage === 'closed' ? { sold: true } : {}),
  }
}

const floorRows = await q(`*[_type == "unitSource" && defined(floorActual)]{ refCode, floorActual }`, 'internal')
  .catch(() => [])
const FLOOR_BY_REF = new Map((floorRows ?? []).map(f => [f.refCode, f.floorActual]))

const [projects, boards, providers] = await Promise.all([
  q(`*[_type == "project" && !(_id in path("drafts.**"))]{ _id, "code": code.current, title }`),
  q(`*[_type == "unitBoard"]{ _id, mode, "code": project->code.current,
      "rows": lineup[]->{ refCode, bedType, sqm, floorZone, priceTHB, dealStage, dealStageAt } }`),
  // slug + status, NOT name_en: two provider docs carried name_en "aquamx" for
  // months (one made by hand, one auto-created by a LINE login), so [0] picked
  // whichever the index returned first and board offers landed on the wrong
  // record. slug is unique by schema and the retired twin fails `status`.
  q(`*[_type == "provider" && slug.current == "aquamx" && status == true && !(_id in path("drafts.**"))]{ _id }`),
])
if (providers.length > 1) {
  console.error(`มี provider slug "aquamx" ที่ status=true มากกว่าหนึ่งใบ (${providers.length}) — รวมให้เหลือใบเดียวก่อน`)
  process.exit(1)
}
const providerId = providers[0]?._id
if (!providerId) { console.error('ไม่พบ provider slug "aquamx" ที่เปิดใช้งานอยู่'); process.exit(1) }

// ต่อ (code, mode): draft ชนะ published (คือ lineup ล่าสุดที่ทีมกำลังคัด)
const byKey = new Map()
for (const b of boards) {
  if (!b.code || !b.mode) continue
  const k = `${b.code}·${b.mode}`
  const isDraft = b._id.startsWith('drafts.')
  if (!byKey.has(k) || isDraft) byKey.set(k, b)
}

/* บอร์ดแยกชนิด → offer ต่อ bed (popup โชว์เฉพาะชนิดนั้น) · บอร์ดรวม (เช่น Mahogany) → ตัว mode-level
   ต้องตรงกับ SLUG/SEG_MIN ใน seed-board-media.mjs + build.mjs */
const SLUG = { studio: 'studio', '1bed': '1bed', '2bed': '2bed', '3bed': '3bed', '4bed': '4bedplus' }
const SEG_TH = { studio: 'สตูดิโอ', '1bed': '1 นอน', '2bed': '2 นอน', '3bed': '3 นอน', '4bed': '4 นอน+' }
const SEG_EN = { studio: 'Studio', '1bed': '1 Bed', '2bed': '2 Bed', '3bed': '3 Bed', '4bed': '4 Bed+' }
const ORDER = ['studio', '1bed', '2bed', '3bed', '4bed']
const SEG_MIN = 1

const muts = []
async function emitOffer(code, mode, proj, suffix, thSuffix, enSuffix, orderItems) {
  const oid = `offer-board-${code}-${mode}${suffix}`
  const existing = (await q(`*[_id in ["drafts.${oid}", "${oid}"]] | order(_id desc)[0]`)) ?? null
  if (existing) {   // อัปเดตเฉพาะ orderItems — field ที่ทีมแต่งไว้ไม่ถูกแตะ
    const { _rev, _createdAt, _updatedAt, ...rest } = existing
    muts.push({ createOrReplace: { ...rest, _id: `drafts.${oid}`, orderItems } })
    console.log(`↻ ${code}·${mode}${suffix}: อัปเดต orderItems ${orderItems.length} ห้อง`)
  } else {
    muts.push({ createOrReplace: {
      _id: `drafts.${oid}`, _type: 'offer',
      provider: { _type: 'reference', _ref: providerId, _weak: true },
      scope: 'project',
      projects: [{ _type: 'reference', _ref: proj._id, _key: 'p0' }],
      displayLang: 'th',
      /* title_th เป็น "For Rent/For Sale" เพราะบนจอมันอยู่คู่ชิปหมวดที่เป็นอังกฤษ */
      title_th: `${mode === 'rent' ? 'For Rent' : 'For Sale'}${thSuffix} — ${proj.title}`,
      title_en: `${mode === 'rent' ? 'Units for rent' : 'Selected units for sale'}${enSuffix} — ${proj.title}`,
      slug: { _type: 'slug', current: oid },
      category: mode === 'rent' ? 'forRent' : 'forSale',
      subCategories: ['good-deal'],
      ctaType: 'order',
      ctaLabel: 'Find your unit',   // อังกฤษภาษาเดียวทุก offer (เจ้าของสั่ง 2026-08-11)
      status: true,
      orderItems,
    } })
    console.log(`＋ ${code}·${mode}${suffix}: สร้างใหม่ + orderItems ${orderItems.length} ห้อง`)
  }
}

for (const [k, b] of byKey) {
  const [code, mode] = k.split('·')
  if (ONLY && code !== ONLY) continue
  const proj = projects.find(p => p.code === code)
  if (!proj) { console.log(`⚠ ${k}: ไม่พบ project doc`); continue }
  // closedTooLong (ปิดเกิน CLOSED_DAYS) ตัดออกให้ตรงกับบอร์ด · ปิด recent คงไว้ (จะติดธง sold)
  const rows = (b.rows ?? []).filter(r => r?.refCode && r.priceTHB != null && !closedTooLong(r))
  if (!rows.length) { console.log(`⚠ ${k}: unitBoard ไม่มี lineup — ข้าม (คัดใน Unit Boards แล้ว Save ก่อน)`); continue }
  const toItem = r => profileToOrderItem({ ...r, floorActual: FLOOR_BY_REF.get(r.refCode) }, mode)
  // ตัวรวมทุกชนิด — บอร์ดรวมยังใช้ (เช่น Mahogany)
  await emitOffer(code, mode, proj, '', '', '', rows.map(toItem))
  // ตัวแยกต่อ bed — บอร์ดแยกชนิดชี้มาที่ของตัวเอง
  const byBed = {}; rows.forEach(r => (byBed[r.bedType] ??= []).push(r))
  for (const seg of ORDER) {
    const br = byBed[seg]; if (!br || br.length < SEG_MIN) continue
    await emitOffer(code, mode, proj, `-${SLUG[seg]}`, ` · ${SEG_TH[seg]}`, ` · ${SEG_EN[seg]}`, br.map(toItem))
  }
}

if (!muts.length) { console.log('ไม่มีอะไรให้ทำ'); process.exit(0) }
await mutate(muts)
console.log(WRITE ? `\n✓ เขียน ${muts.length} draft แล้ว — ตรวจ/publish ใน Studio (Pending Publish)` : '\n(dry-run — เพิ่ม --write เพื่อเขียนจริง)')
