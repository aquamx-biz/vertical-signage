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
    : { th: `${ZONE_TH[p.floorZone] ?? ''} (${(p.floorZone ?? '').toUpperCase()})`, en: ZONE_EN[p.floorZone] ?? '' }
  return {
    _key: p.refCode,
    refCode: p.refCode,
    maxQty: 1,
    name_th: `${BED_TH[p.bedType] ?? p.bedType} · ${p.sqm} ตรม. · ${fl.th}`,
    name_en: `${BED_EN[p.bedType] ?? p.bedType} · ${p.sqm} sqm · ${fl.en}`,
    price: mode === 'rent' ? `${(p.priceTHB / 1e3).toFixed(1)}K ฿/ด.` : `${(p.priceTHB / 1e6).toFixed(1)}M`,
  }
}

const floorRows = await q(`*[_type == "unitSource" && defined(floorActual)]{ refCode, floorActual }`, 'internal')
  .catch(() => [])
const FLOOR_BY_REF = new Map((floorRows ?? []).map(f => [f.refCode, f.floorActual]))

const [projects, boards, providers] = await Promise.all([
  q(`*[_type == "project" && !(_id in path("drafts.**"))]{ _id, "code": code.current, title }`),
  q(`*[_type == "unitBoard"]{ _id, mode, "code": project->code.current,
      "rows": lineup[]->{ refCode, bedType, sqm, floorZone, priceTHB } }`),
  q(`*[_type == "provider" && name_en == "aquamx" && !(_id in path("drafts.**"))]{ _id }`),
])
const providerId = providers[0]?._id
if (!providerId) { console.error('ไม่พบ provider "aquamx"'); process.exit(1) }

// ต่อ (code, mode): draft ชนะ published (คือ lineup ล่าสุดที่ทีมกำลังคัด)
const byKey = new Map()
for (const b of boards) {
  if (!b.code || !b.mode) continue
  const k = `${b.code}·${b.mode}`
  const isDraft = b._id.startsWith('drafts.')
  if (!byKey.has(k) || isDraft) byKey.set(k, b)
}

const muts = []
for (const [k, b] of byKey) {
  const [code, mode] = k.split('·')
  if (ONLY && code !== ONLY) continue
  const proj = projects.find(p => p.code === code)
  if (!proj) { console.log(`⚠ ${k}: ไม่พบ project doc`); continue }
  const rows = (b.rows ?? []).filter(r => r?.refCode && r.priceTHB != null)
  if (!rows.length) { console.log(`⚠ ${k}: unitBoard ไม่มี lineup — ข้าม (คัดใน Unit Boards แล้ว Save ก่อน)`); continue }
  const orderItems = rows.map(r => profileToOrderItem({ ...r, floorActual: FLOOR_BY_REF.get(r.refCode) }, mode))

  const oid = `offer-board-${code}-${mode}`
  const existing = (await q(`*[_id in ["drafts.${oid}", "${oid}"]] | order(_id desc)[0]`)) ?? null
  if (existing) {
    const { _rev, _createdAt, _updatedAt, ...rest } = existing
    muts.push({ createOrReplace: { ...rest, _id: `drafts.${oid}`, orderItems } })
    console.log(`↻ ${k}: อัปเดต orderItems ${orderItems.length} ห้อง (field อื่นคงเดิม)`)
  } else {
    muts.push({ createOrReplace: {
      _id: `drafts.${oid}`, _type: 'offer',
      provider: { _type: 'reference', _ref: providerId, _weak: true },
      scope: 'project',
      projects: [{ _type: 'reference', _ref: proj._id, _key: 'p0' }],
      displayLang: 'th',
      title_th: mode === 'rent' ? `ห้องว่างให้เช่า — ${proj.title}` : `ห้องขายราคาพิเศษ — ${proj.title}`,
      title_en: mode === 'rent' ? `Units for rent — ${proj.title}` : `Units for sale — ${proj.title}`,
      slug: { _type: 'slug', current: oid },
      category: mode === 'rent' ? 'forRent' : 'forSale',
      subCategories: ['good-deal'],
      ctaType: 'order',
      ctaLabel: 'เลือกห้องที่สนใจ',
      status: true,
      orderItems,
    } })
    console.log(`＋ ${k}: สร้างใหม่ + orderItems ${orderItems.length} ห้อง`)
  }
}

if (!muts.length) { console.log('ไม่มีอะไรให้ทำ'); process.exit(0) }
await mutate(muts)
console.log(WRITE ? `\n✓ เขียน ${muts.length} draft แล้ว — ตรวจ/publish ใน Studio (Pending Publish)` : '\n(dry-run — เพิ่ม --write เพื่อเขียนจริง)')
