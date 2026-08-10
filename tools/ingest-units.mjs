#!/usr/bin/env node
/**
 * ingest-units.mjs — รับ card JSON จากรอบ scrape → sync เข้า Sanity แบบสะสมประวัติ
 *
 * Usage:  node --env-file=.env tools/ingest-units.mjs [--dir <cardsDir>] [--date YYYY-MM-DD] [--write]
 *         default: dry-run (สรุปว่าจะเกิดอะไร ไม่เขียนจริง) · dir = C:/Users/Lenovo/Downloads
 *
 * กติกาการ sync (หัวใจของระบบประวัติ):
 * - unitProfile: ทับตัวเลขล่าสุด แต่ "สงวน" งานทีมเสมอ (status, pinToBoard,
 *   hideFromBoard, internalNote, firstSeenAt) · ราคาเปลี่ยน → APPEND priceHistory
 *   (ห้ามลบของเก่า) · ห้องพบครั้งแรก → firstSeenAt = รอบนี้
 * - ห้องที่หายจากตลาด (เคย active แต่รอบนี้ไม่พบ) → status = expired อัตโนมัติ
 * - unitSource (dataset internal): เพิ่ม/อัปเดต listing ตาม sourceId — สงวน
 *   bestContact / cobrokeStatus / cobrokeNote ของทีมเสมอ
 * - marketSnapshot: ใบใหม่ต่อ (ตึก × รอบ) — time-series ระดับตลาด
 * - scrapeRound: ใบสรุปรอบ (ห้องใหม่/ราคาเปลี่ยน/expired/คำเตือน) ให้ทีมเห็นใน Studio
 *
 * refCode: จับคู่ห้องเดิมด้วย fingerprint (ตึก·ประเภท·ตร.ม.·ชั้นจริง) ให้ตรงกับ
 * refCode ที่มีอยู่ — ห้องใหม่ได้เลขรันต่อท้าย prefix เดิมของตึก
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { passesSanity } from '../board-engine.mjs'

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const CARDS_DIR = argOf('--dir') ?? 'C:/Users/Lenovo/Downloads'
const ROUND = argOf('--date') ?? new Date().toISOString().slice(0, 10)

// เขียนต้องใช้ token สิทธิ์ Editor (SANITY_WRITE_TOKEN) — SANITY_TOKEN ตัวเดิมอ่านได้อย่างเดียว
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
if (!TOKEN) { console.error('SANITY_WRITE_TOKEN / SANITY_TOKEN not set'); process.exit(1) }
if (WRITE && !process.env.SANITY_WRITE_TOKEN) {
  console.error('--write ต้องมี SANITY_WRITE_TOKEN (สิทธิ์ Editor) ใน .env — ตัวอ่านอย่างเดียวจะโดน 403')
  process.exit(1)
}
const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'

async function q(query, dataset = 'production') {
  const r = await fetch(`${API}/data/query/${dataset}?query=${encodeURIComponent(query)}&perspective=published`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}
async function mutate(mutations, dataset = 'production') {
  if (!WRITE) return { dryRun: mutations.length }
  for (let i = 0; i < mutations.length; i += 80) {   // batch กัน payload ใหญ่เกิน
    const r = await fetch(`${API}/data/mutate/${dataset}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutations: mutations.slice(i, i + 80) }),
    })
    if (!r.ok) throw new Error(`mutate ${r.status}: ${await r.text()}`)
  }
  return { written: mutations.length }
}

// ── 1. โหลด cards ของรอบ (ไฟล์ต่อ portal — โครงเดียวกับ pipeline เดิม) ──────
const FILES = {
  'DDproperty': ['new4-dd.json', 'dd-3buildings-cards.json', 'mh-dd.json'],
  'Dot Property': ['new4-dp.json', 'dp-3buildings-cards.json', 'dp-39bs-cards.json', 'mh-dp.json'],
  'Living Insider': ['new4-li.json', 'new4-li2.json', 'new4-li3.json', 'li-3buildings-cards.json', 'mh-li.json'],
  'PropertyHub': ['new4-ph.json', 'new4-ph2.json', 'ph-3buildings-cards.json', 'ph-cards-v4.json', 'mh-ph.json'],
  'PropertyScout': ['new4-ps.json', 'new4-ps3.json', 'new4-ps-sale.json', 'new4-ps-sale2.json',
    'ps-3buildings-cards.json', 'ps-cards-1785239157125.json', '39bs-normalized.json'],
  'FazWaz': ['new4-fw.json', 'new4-fw2.json', 'new4-fw3.json', 'fw-3buildings-cards.json',
    'fw-cards-1785239136793.json', 'mh-fw.json'],
  'Mahogany': ['mh-cards.json'],
}
/* ">3 นอน = 4bed (4 Bed+/Penthouse)" คือกติกาที่ตกลงกันไว้ แต่ "มากกว่า 3" ต้องเป็นเลข
   ห้องนอนจริง ๆ ก่อน — พอร์ทัลบางใบส่งขยะมาเป็นเลขห้องนอน (8882, 9991, 7901 บนห้อง
   33–56 ตร.ม. ที่ประกาศบอกเองว่า 1–2 นอน) ถ้าปล่อยผ่าน ทุกใบจะกลายเป็น 4bed เงียบ ๆ
   แล้วห้องเล็กจะไปโผล่ในโควตา 4BED+ ของบอร์ด · เกิน 8 นอนถือว่าอ่านผิด ทิ้งการ์ดทิ้ง
   (เดาไม่ได้ว่ากี่นอน และ bedType เป็นส่วนหนึ่งของ fingerprint จะเดาแล้วยุบห้องผิด) */
const BED_MAX = 8
const BED = n => n === 0 ? 'studio' : n === 1 ? '1bed' : n === 2 ? '2bed' : n === 3 ? '3bed' : '4bed'
const bedOk = n => Number.isFinite(n) && n >= 0 && n <= BED_MAX
const BED_JUNK = [], RECONCILED = [], SQM_JUNK = []
// วันที่จาก portal (timestamp/ISO/วันที่ไทยที่แปลงแล้ว) → YYYY-MM-DD · แปลงไม่ได้ = null
const isoDate = v => {
  if (v == null || v === '') return null
  const d = typeof v === 'number' ? new Date(v > 1e11 ? v : v * 1000) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const ROUND_WARNINGS = []   // เตือนทุกชั้นก่อนจับคู่ห้อง — ไหลลงใบสรุปรอบ (scrapeRound)

/* ── ตรวจการ์ดกับพยานที่ไม่ผ่านมือ scraper ก่อนรับเข้า ────────────────────────
   ประกาศเข้ารหัสจำนวนห้องนอนไว้ใน slug ของ URL อยู่แล้ว (1-bedroom-condo-for-sale-…)
   เป็นแหล่งที่สองที่เป็นอิสระ ใช้ตัดสินเมื่อเลขที่สแครปมาไม่ตรง — 112 ห้องเคยเก็บผิด
   เพราะไม่มีใครเทียบสองค่านี้

   และ Dot Property เอา "จำนวนห้องนอน" ไปต่อท้าย "ราคา" (12,000,000 + 1 นอน →
   120000001 · ยืนยันกับหน้าจริงมาแล้ว 4 ใบ) ทำให้ห้อง 28 ตร.ม. ราคา 58 ล้าน
   ซ่อมได้เมื่อเลขตัวท้ายเท่ากับจำนวนห้องนอน และตัดแล้ว ฿/ตร.ม. กลับเข้ากรอบ —
   ขาดข้อใดข้อหนึ่งคือไม่ซ่อม ปล่อยให้ passesSanity ตัดทิ้งตามปกติ */
const PSQM_OK = { rent: [250, 3500], sale: [50000, 600000] }
const bedFromUrl = u => {
  let s = String(u ?? ''); try { s = decodeURIComponent(s) } catch {}
  s = s.toLowerCase()
  if (/studio[-_ ]?(condo|apartment|for)/.test(s)) return 0
  const m = /(\d+)[-_ ]?(?:bedroom|bedrooms|bed|beds|br)\b/.exec(s)
  return m && +m[1] <= BED_MAX ? +m[1] : null
}
/* บทเรียน audit 39BS (8 ส.ค. 2026):
   ① LI ชุดหนึ่ง sqm+price+floor เพี้ยน "ยกชุด" (ค่าของประกาศอื่น) — ยามรายฟิลด์จับไม่ได้
     เพราะ ฿/ตร.ม. ของชุดที่เพี้ยนก็อยู่ในกรอบ → ต้องมียามไขว้ฟิลด์: sqm ต้องเข้ากับ bedType
     (1 นอน 90 ตร.ม. ไม่มีจริง) เจอแล้ว "ทิ้ง" ไม่เดาซ่อม เพราะไม่รู้ฟิลด์ไหนถูก
   ② DP บางส่วนแสดงราคาผ่านการแปลงค่าเงินไป-กลับ → เพี้ยนหลักหน่วย (10,000,000 → 9,999,990)
     ราคาจริงในตลาดตั้งเป็นพันถ้วนเสมอ → ≥100K และห่างเลขพันถ้วน ≤30 บาท = snap กลับ */
const SQM_BY_BED = { 0: [18, 46], 1: [24, 72], 2: [45, 130], 3: [78, 260], 4: [100, 500] }
const sqmFitsBed = (bed, sqm) => {
  const b = SQM_BY_BED[Math.min(+bed, 4)]
  return !b || (sqm >= b[0] && sqm <= b[1])
}
let COIN_SNAPPED = 0
function reconcile(r, building) {
  let bed = +r.bed, price = +r.price
  const sqm = +r.sqm
  const slug = bedFromUrl(r.url)
  if (slug != null && slug !== bed) {
    RECONCILED.push(`${building} · นอน ${r.bed}→${slug} ตาม slug · ${r.url ?? ''}`)
    bed = slug
  }
  const [lo, hi] = PSQM_OK[r.intent] ?? [0, Infinity]
  const ps = sqm ? price / sqm : null
  if (ps != null && (ps < lo || ps > hi)) {
    const s = String(price), tail = +s.slice(-1), head = +s.slice(0, -1)
    const ps2 = sqm ? head / sqm : null
    if (tail === bed && ps2 != null && ps2 >= lo && ps2 <= hi) {
      RECONCILED.push(`${building} · ราคา ${price}→${head} (ตัดเลขห้องนอนที่ต่อท้าย) · ${r.url ?? ''}`)
      price = head
    }
  }
  // ② currency round-trip snap — เกณฑ์ ≤50/≥950 (ตรวจซ้ำ 9 ส.ค.: ครบ 36/36, false positive 0/428)
  if (price >= 100000) {
    const rem = price % 1000
    if (rem !== 0 && (rem <= 50 || rem >= 950)) { price = Math.round(price / 1000) * 1000; COIN_SNAPPED++ }
  }
  // ① ยามไขว้ sqm×bedType — คืน reject ให้ผู้เรียกทิ้งการ์ดนี้
  if (sqm && !sqmFitsBed(bed, sqm))
    return { bed, price, reject: `${building} · ${bed}นอน ${sqm}ตร.ม. เป็นไปไม่ได้ · ${r.url ?? ''}` }
  return { bed, price }
}
const cards = []
const seenUrls = new Set()   // ไฟล์บางชุดทับซ้อนกัน — URL เดียวนับครั้งเดียว

// โหมดรอบใหม่: --round <file> = ไฟล์เดียว normalized แล้ว (จาก weekly routine)
// แถวละ {building, intent, bed, sqm, floor, price, portal, url, posterType?, posterName?}
const ROUND_FILE = argOf('--round')
if (ROUND_FILE) {
  const rows = JSON.parse(readFileSync(ROUND_FILE, 'utf8'))
  for (const r of rows) {
    if (!r.building || !['rent', 'sale'].includes(r.intent)) continue
    if (r.price == null || r.sqm == null || r.bed == null) continue
    if (r.floor == null && !r.refCode) continue    // ไม่รู้ทั้งชั้นทั้งห้อง = จับคู่ไม่ได้จริง
    const fix = reconcile(r, r.building)
    if (!bedOk(fix.bed)) { BED_JUNK.push(`${r.building} · bed=${r.bed} · ${r.url ?? ''}`); continue }
    if (fix.reject) { SQM_JUNK.push(fix.reject); continue }
    const floor = Number.isFinite(parseInt(r.floor)) ? parseInt(r.floor) : null
    if (floor == null && !r.refCode) continue
    if (r.url) { if (seenUrls.has(r.url)) continue; seenUrls.add(r.url) }
    if (!passesSanity({ bedType: BED(fix.bed), sqm: +r.sqm, priceTHB: fix.price }, r.intent)) continue
    cards.push({
      /* รอบ re-scrape ระบุห้องมาเลย — ลายนิ้วมือ (ตึก|นอน|ตรม.|ชั้น) มีไว้สำหรับประกาศแปลกหน้า
         การบังคับห้องเดิมไปทายลายนิ้วมือใหม่ทำ 1,440 ห้องที่ยังขายอยู่กลายเป็น expired
         (ชั้น null โดนทิ้งทั้งแถว · bed ที่ reconcile แก้ทำลายนิ้วมือเลื่อน) */
      refCode: r.refCode ?? null,
      building: r.building, intent: r.intent, bedType: BED(fix.bed), sqm: +r.sqm, floor,
      price: fix.price, portal: r.portal ?? 'unknown', url: r.url ?? null,
      sourceId: r.sourceId ?? (r.url ? String(r.portal ?? 'x').toLowerCase().replace(/\W/g, '').slice(0, 2) + ':' + String(r.url).split(/[/_-]/).pop().slice(0, 24) : null),
      posterType: r.posterType ?? 'unknown', posterName: r.posterName ?? null,
      postCreatedAt: isoDate(r.postCreatedAt ?? r.createdAt), postUpdatedAt: isoDate(r.postUpdatedAt ?? r.updatedAt),
      // ห้องเช่าที่ผู้เช่าเดิมยังอยู่ — ก่อนวันนี้ห้ามนับเป็นสต็อกว่าง (rescrape เก็บมาให้)
      availableFrom: isoDate(r.availableFrom),
    })
  }
}
if (!ROUND_FILE) for (const [portal, files] of Object.entries(FILES)) {
  for (const fn of files) {
    const p = join(CARDS_DIR, fn)
    if (!existsSync(p)) continue
    let rows; try { rows = JSON.parse(readFileSync(p, 'utf8')) } catch { continue }
    for (const r of rows) {
      const building = r.building ?? (fn.includes('39bs') ? '39 by Sansiri' : fn.includes('mh-') ? 'Mahogany Tower' : null)
      if (!building || !['rent', 'sale'].includes(r.intent)) continue
      if (r.price == null || r.sqm == null || r.bed == null || r.floor == null) continue
      const fix = reconcile(r, building)
      if (!bedOk(fix.bed)) { BED_JUNK.push(`${building} · bed=${r.bed} · ${r.url ?? ''}`); continue }
      if (fix.reject) { SQM_JUNK.push(fix.reject); continue }
      const floor = parseInt(r.floor); if (!Number.isFinite(floor)) continue
      if (r.url) { if (seenUrls.has(r.url)) continue; seenUrls.add(r.url) }
      // กรองขยะ scraper ด้วยเกณฑ์เดียวกับ board-engine (sqm/ราคา/฿ต่อตรม.)
      if (!passesSanity({ bedType: BED(fix.bed), sqm: +r.sqm, priceTHB: fix.price }, r.intent)) continue
      cards.push({
        building, intent: r.intent, bedType: BED(fix.bed), sqm: +r.sqm, floor,
        price: fix.price, portal: portal === 'Mahogany' ? (r.portal ?? 'FazWaz') : portal,
        url: r.url ?? null,
        sourceId: r.sourceId ?? (r.url ? portal.toLowerCase().replace(/\W/g, '').slice(0, 2) + ':' + String(r.url).split(/[/_-]/).pop().slice(0, 24) : null),
        posterType: r.posterType ?? r.poster ?? 'unknown',
        posterName: r.agent ?? r.posterName ?? null,
        postCreatedAt: isoDate(r.postCreatedAt ?? r.createdAt), postUpdatedAt: isoDate(r.postUpdatedAt ?? r.updatedAt),
      })
    }
  }
}
/* ── ยามชั้นสอง (audit ①): กรอบ ตร.ม. ของ "ตึกนั้นเอง" ต่อ bedType ──────────────
   กรอบระดับประเทศ (SQM_BY_BED) จับ "2นอนแต่ได้ ตร.ม. ของ 1นอน" ไม่ได้ เพราะ 2นอน 52 ตร.ม.
   มีจริงในตึกอื่น — ต้องเทียบกับพยานอิสระ: การ์ดของ portal อื่น ๆ ในตึก×ประเภทเดียวกัน
   (leave-one-portal-out) ถ้า n อื่น ≥ 8 ใช้ [p10×0.9, p90×1.1] เป็นกรอบ · หลุด = ทิ้ง */
{
  const cohort = new Map()   // building|bedType|portal -> [sqm]
  for (const c of cards) {
    const k = `${c.building}|${c.bedType}`
    ;(cohort.get(k) ?? cohort.set(k, new Map()).get(k))
    const m = cohort.get(k)
    ;(m.get(c.portal) ?? m.set(c.portal, []).get(c.portal)).push(c.sqm)
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
  const keep = []
  for (const c of cards) {
    const m = cohort.get(`${c.building}|${c.bedType}`)
    const others = []
    for (const [portal, arr] of m) if (portal !== c.portal) others.push(...arr)
    if (others.length >= 8) {
      const lo = q(others, 0.10) * 0.9, hi = q(others, 0.90) * 1.1
      if (c.sqm < lo || c.sqm > hi) {
        SQM_JUNK.push(`${c.building} · ${c.bedType} ${c.sqm}ตร.ม. หลุดกรอบตึก [${lo.toFixed(0)}–${hi.toFixed(0)}] จาก ${others.length} การ์ด portal อื่น · ${c.url ?? ''}`)
        continue
      }
    }
    keep.push(c)
  }
  if (keep.length < cards.length) {
    const n = cards.length - keep.length
    console.warn(`⚠ ยามกรอบตึก: ทิ้ง ${n} การ์ด sqm หลุดช่วงจริงของตึก×ประเภท`)
    ROUND_WARNINGS.push(`ทิ้ง ${n} การ์ด sqm หลุดกรอบ ตร.ม. ของตึกเอง (เทียบ portal อื่น)`)
  }
  cards.length = 0; cards.push(...keep)
}

/* ── ธง stale: โพสต์ที่ portal บอกเองว่าไม่ถูกแตะเกิน STALE_DAYS วัน ─────────────
   "อัพเดทล่าสุด" ของ portal เชื่อได้ทางเดียว: วันที่เก่ามาก = ประกาศถูกทิ้งร้าง ราคาไม่น่าเชื่อ
   (วันที่สด ≠ ข้อมูลจริง เพราะ agent กดดันประกาศได้) → stale ไม่ให้ค้ำราคา/สถิติของห้อง
   แต่ยังเก็บใน unitSource ให้ทีมเห็น · การ์ดไม่มีวันที่ (portal ไม่ให้/ยังไม่ scrape มา) = ไม่ตัดสิน */
const STALE_DAYS = 90
{
  const cutoff = new Date(ROUND).getTime() - STALE_DAYS * 864e5
  let n = 0
  for (const c of cards)
    if (c.postUpdatedAt && new Date(c.postUpdatedAt).getTime() < cutoff) { c.stale = true; n++ }
  if (n) {
    console.warn(`⚠ ${n} การ์ดเป็นโพสต์ค้าง (ไม่อัพเดทเกิน ${STALE_DAYS} วันตามวันที่ของ portal) — ไม่ใช้ค้ำราคา`)
    ROUND_WARNINGS.push(`โพสต์ค้างเกิน ${STALE_DAYS} วัน ${n} ใบ — เก็บใน source แต่ไม่ใช้คำนวณราคา/สถิติ`)
  }
}

// portal ที่ "เห็นจริง" ในรอบนี้ต่อตึก — ใช้ตัดสินว่า listing เก่าที่ไม่เจอ = ตาย หรือ scrape ล่ม
const normPortal = p => String(p ?? '').toLowerCase().replace(/\W/g, '')
const portalsSeenByBuilding = new Map()
for (const c of cards) {
  ;(portalsSeenByBuilding.get(c.building) ?? portalsSeenByBuilding.set(c.building, new Set()).get(c.building))
    .add(normPortal(c.portal))
}
let PRUNED = 0

console.log(`round ${ROUND} · cards ${cards.length} listings จาก ${CARDS_DIR}`)
if (!cards.length) { console.error('ไม่พบ card files — เช็ค --dir'); process.exit(1) }

if (BED_JUNK.length) {
  console.warn(`⚠ ทิ้ง ${BED_JUNK.length} การ์ดที่เลขห้องนอนเกิน ${BED_MAX} (อ่านผิดแน่ ๆ):`)
  BED_JUNK.slice(0, 8).forEach(x => console.warn(`    ${x}`))
  ROUND_WARNINGS.push(`ทิ้ง ${BED_JUNK.length} การ์ดที่เลขห้องนอนเกิน ${BED_MAX}`)
}
if (RECONCILED.length) {
  console.warn(`⚠ แก้ให้ตรงกับประกาศ ${RECONCILED.length} การ์ด:`)
  RECONCILED.slice(0, 8).forEach(x => console.warn(`    ${x}`))
  ROUND_WARNINGS.push(`แก้ค่าให้ตรงกับประกาศ ${RECONCILED.length} การ์ด (นอนตาม slug / ราคาตัดเลขต่อท้าย)`)
}
if (SQM_JUNK.length) {
  console.warn(`⚠ ทิ้ง ${SQM_JUNK.length} การ์ด sqm ไม่เข้ากับจำนวนห้องนอน (ยามไขว้จาก audit 39BS — ค่าเพี้ยนยกชุดจากประกาศอื่น):`)
  SQM_JUNK.slice(0, 8).forEach(x => console.warn(`    ${x}`))
  ROUND_WARNINGS.push(`ทิ้ง ${SQM_JUNK.length} การ์ด sqm×bedType เป็นไปไม่ได้ (เช่น 1นอน 90ตร.ม.)`)
}
if (COIN_SNAPPED) {
  console.warn(`⚠ snap ราคาเพี้ยนหลักหน่วยจากการแปลงค่าเงิน ${COIN_SNAPPED} การ์ด (เช่น 9,999,990 → 10,000,000)`)
  ROUND_WARNINGS.push(`snap ราคา currency-drift ${COIN_SNAPPED} การ์ดกลับเป็นเลขพันถ้วน`)
}
/* ── ยามชั้นกองค่าเดียว ────────────────────────────────────────────────────
   2026-08-05: รอบเก็บของ FazWaz หยิบเลขชั้นจากบล็อกสิ่งอำนวยความสะดวก (ชั้นสระ)
   แทนช่อง Floor ของห้อง ทุกห้องในตึกเดียวกันจึงได้เลขเดียวกันทั้งชุด — The Lumpini 24
   ได้ 41 ทั้ง 285 การ์ด, Noble BE19 ได้ 44 ทั้ง 139 การ์ด และไม่มีอะไรร้อง จนคนไปเห็นเอง
   บนบอร์ด · ชั้นยังเป็นส่วนหนึ่งของ fingerprint ที่ใช้จับคู่ห้อง ค่าที่กองจึงลามไปยุบห้อง
   คนละห้องเข้าด้วยกันได้ด้วย ต้องดักตั้งแต่ก่อนแตะข้อมูล ไม่ใช่ตอนขึ้นจอ */
{
  const g = {}
  for (const c of cards) {
    if (c.floor == null) continue
    const k = `${c.building}·${c.portal}`
    ;(g[k] ??= new Map()).set(c.floor, ((g[k].get(c.floor)) ?? 0) + 1)
  }
  const poisoned = new Set()
  for (const [k, m] of Object.entries(g)) {
    const n = [...m.values()].reduce((a, b) => a + b, 0)
    if (n >= 5 && m.size === 1) {
      poisoned.add(k)
      console.warn(`⚠ ${k}: ${n} การ์ดได้ชั้น ${[...m.keys()][0]} เท่ากันหมด — ค่านี้คือชั้นของตึก/สิ่งอำนวยความสะดวก ไม่ใช่ของห้อง · ทิ้งชั้นของชุดนี้`)
    }
  }
  if (poisoned.size) {
    let n = 0
    for (const c of cards) if (poisoned.has(`${c.building}·${c.portal}`)) { c.floor = null; n++ }
    console.warn(`⚠ ล้างชั้นทิ้ง ${n} การ์ดจาก ${poisoned.size} ชุด — ห้องที่ไม่มีพอร์ทัลอื่นจะแสดงเป็นโซนแทนเลขชั้น`)
    ROUND_WARNINGS.push(...[...poisoned].map(k => `ชั้นกองค่าเดียวจาก ${k} — ทิ้งค่าชั้นของชุดนี้`))
  }
}

// ── 2. โหลดสถานะปัจจุบันจาก Sanity ──────────────────────────────────────────
const [profiles, sources] = await Promise.all([
  q(`*[_type == "unitProfile"]{ _id, refCode, intent, projectName, bedType, sqm, priceTHB, status,
      pinToBoard, hideFromBoard, internalNote, firstSeenAt, priceHistory }`),
  q(`*[_type == "unitSource"]{ _id, refCode, projectName, floorActual,
      rentListings, saleListings, bestContact, cobrokeStatus, cobrokeNote, contactLog,
      "sids": [...coalesce(rentListings, [])[].sourceId, ...coalesce(saleListings, [])[].sourceId] }`, 'internal'),
])
const srcByRef = new Map(sources.map(s => [s.refCode, s]))
const profByKey = new Map(profiles.map(p => [`${p.refCode}·${p.intent}`, p]))
// fingerprint → refCode ที่มีอยู่ (ตึก|ประเภท|ตรม.ปัดเลข|ชั้นจริง)
// + ดัชนีสำรอง ตึก|ประเภท|ชั้น สำหรับจับคู่แบบ ±1.5 ตรม. (portal ลงเลขเหลื่อมกันเล็กน้อย)
const fpToRef = new Map()
const nearIdx = new Map()
for (const s of sources) {
  const anyProf = profiles.find(p => p.refCode === s.refCode)
  if (anyProf && s.floorActual != null) {
    fpToRef.set(`${s.projectName}|${anyProf.bedType}|${Math.round(anyProf.sqm)}|${s.floorActual}`, s.refCode)
    const k = `${s.projectName}|${anyProf.bedType}|${s.floorActual}`
    ;(nearIdx.get(k) ?? nearIdx.set(k, []).get(k)).push({ ref: s.refCode, sqm: anyProf.sqm })
  }
}
const matchRef = u => {
  if (u.refCode && srcByRef.has(u.refCode)) return u.refCode
  const exact = fpToRef.get(u.fp)
  if (exact) return exact
  const cands = (nearIdx.get(`${u.building}|${u.bedType}|${u.floor}`) ?? [])
    .filter(x => Math.abs(x.sqm - u.sqm) <= 1.5)
    .sort((a, b) => Math.abs(a.sqm - u.sqm) - Math.abs(b.sqm - u.sqm))
  return cands[0]?.ref
}
const prefixOf = {}
const maxNum = {}
for (const s of sources) {
  const m = s.refCode.match(/^([A-Z0-9]+)-U(\d+)$/)
  if (m) { prefixOf[s.projectName] = m[1]; maxNum[s.projectName] = Math.max(maxNum[s.projectName] ?? 0, +m[2]) }
}

// ── 3. รวม cards → หน่วยห้อง (fingerprint) + คำนวณสถิติของรอบ ────────────────
const units = new Map()
for (const c of cards) {
  /* การ์ดที่รู้ refCode เกาะกลุ่มด้วย refCode ตรง ๆ — ลายนิ้วมือใช้เฉพาะการ์ดแปลกหน้า */
  const fp = c.refCode ? `R:${c.refCode}` : `${c.building}|${c.bedType}|${Math.round(c.sqm)}|${c.floor}`
  const u = units.get(fp) ?? { fp, refCode: c.refCode ?? null, building: c.building, bedType: c.bedType, sqm: Math.round(c.sqm), floor: c.floor, listings: [] }
  u.listings.push(c); units.set(fp, u)
}
// โซนชั้น: แบ่งช่วงชั้นของตึกเป็น 3 ส่วนเท่า ๆ กัน
const floorsByBld = {}
units.forEach(u => (floorsByBld[u.building] ??= []).push(u.floor))
const zoneOf = (b, f) => {
  const fs = floorsByBld[b]; const lo = Math.min(...fs), hi = Math.max(...fs)
  const t = (hi - lo) / 3
  return f <= lo + t ? 'low' : f <= lo + 2 * t ? 'mid' : 'high'
}
// ค่าเฉลี่ย ฿/ตรม. ราย ชั้น/โซน/ตึก ต่อ intent
const agg = {}
units.forEach(u => {
  for (const intent of ['rent', 'sale']) {
    const ls = u.listings.filter(l => l.intent === intent && !l.stale)   // stale ไม่ค้ำสถิติ
    if (!ls.length) continue
    const min = Math.min(...ls.map(l => l.price))
    const psqm = min / u.sqm
    const zone = zoneOf(u.building, u.floor)
    for (const key of [`f|${u.building}|${intent}|${u.floor}`, `z|${u.building}|${intent}|${zone}`, `b|${u.building}|${intent}`])
      (agg[key] ??= []).push(psqm)
  }
})
const mean = a => a.reduce((x, y) => x + y, 0) / a.length
const pct = (v, avg) => Math.round((v / avg - 1) * 100)

const unitRows = []
units.forEach(u => {
  const zone = zoneOf(u.building, u.floor)
  const both = {}
  /* นโยบาย 2026-08-10 (ตกลงกับเจ้าของงาน): โพสต์ค้าง "ไม่ฆ่าห้อง" — สเปคเดิม
     (scrape-postdates-spec.md) ให้ stale แค่ไม่ค้ำราคา/สถิติ แต่โค้ดรุ่นก่อนปล่อยให้
     ห้องที่เหลือแต่โพสต์ค้างไหลไป expired ด้วย พอรอบแรกที่เก็บวันอัพเดทได้จริงมาถึง
     59% ของตลาดกลายเป็นโพสต์ค้าง → 1,340 ห้องที่ยังขายอยู่โดนประหารหมู่เงียบ ๆ
     ตอนนี้: ฝั่งที่เหลือแต่โพสต์ค้าง = ยังมีชีวิต (ต่ออายุ lastCheckedAt) แต่ตัวเลข
     ราคา/สถิติเดิมถูกแช่แข็งไว้ ไม่อัพเดทจากข้อมูลค้าง และไม่สร้าง profile ใหม่จากมัน */
  const staleOnly = {}
  for (const intent of ['rent', 'sale']) {
    const ls = u.listings.filter(l => l.intent === intent && !l.stale)
    if (!ls.length) {
      if (u.listings.some(l => l.intent === intent && l.stale)) staleOnly[intent] = true
      continue
    }
    const prices = ls.map(l => l.price)
    const min = Math.min(...prices), max = Math.max(...prices)
    const psqm = min / u.sqm
    const portals = new Set(ls.map(l => l.portal))
    const agents = new Set(ls.map(l => l.posterName).filter(Boolean))
    const fAvg = (agg[`f|${u.building}|${intent}|${u.floor}`] ?? []).length >= 2 ? mean(agg[`f|${u.building}|${intent}|${u.floor}`]) : null
    const zAvg = mean(agg[`z|${u.building}|${intent}|${zone}`] ?? [psqm])
    const bAvg = mean(agg[`b|${u.building}|${intent}`] ?? [psqm])
    const vsF = fAvg ? pct(psqm, fAvg) : null
    const vsZ = pct(psqm, zAvg)
    const spread = min > 0 ? Math.round((max - min) / min * 100) : 0
    both[intent] = {
      price: min, psqm, nListings: ls.length, nPortals: portals.size, spread,
      vsF, vsZ, vsB: pct(psqm, bAvg),
      deal: vsF != null && vsF <= -10 ? 'super' : vsF != null && vsF < 0 ? 'best' : vsZ <= -10 ? 'good' : null,
      hot: agents.size >= 2 || (agents.size === 0 && ls.length >= 2),
      nego: portals.size >= 3 && spread >= 5,
      owner: ls.some(l => l.posterType === 'owner'),
      listings: ls,
    }
  }
  if (both.rent || both.sale || staleOnly.rent || staleOnly.sale)
    unitRows.push({ ...u, zone, ...both, staleOnly, dual: !!(both.rent && both.sale) })
})
// yield + goodInvest (ต้องรู้ค่าเฉลี่ย yield ตึกก่อน)
const yieldByBld = {}
unitRows.forEach(u => { if (u.dual) { u.yield = +(u.rent.price * 12 / u.sale.price * 100).toFixed(2); (yieldByBld[u.building] ??= []).push(u.yield) } })
unitRows.forEach(u => {
  if (u.yield != null) {
    const avg = mean(yieldByBld[u.building])
    if (u.sale) u.sale.invest = u.yield > avg + 1.5
    if (u.rent) u.rent.invest = u.yield > avg + 1.5
  }
})

// ── 4. จับคู่ refCode + สร้าง mutations ──────────────────────────────────────
const seenKeys = new Set()   // refCode·intent ที่พบรอบนี้
const stats = { newUnits: 0, priceChanges: 0, unchanged: 0, expired: 0, matched: 0, staleKept: 0, newRefs: [] }
const prodMut = [], intMut = []
const warnings = [...ROUND_WARNINGS]

for (const u of unitRows) {
  let ref = matchRef(u)
  const freshless = !u.rent && !u.sale        // มีแต่ฝั่งโพสต์ค้าง
  if (!ref && freshless) continue             // ห้ามออกเลขห้องใหม่จากโพสต์ค้างล้วน
  if (!ref) {
    const prefix = prefixOf[u.building]
    if (!prefix) { warnings.push(`ตึกใหม่ไม่รู้จัก prefix: ${u.building} — ข้าม`); continue }
    maxNum[u.building] = (maxNum[u.building] ?? 0) + 1
    ref = `${prefix}-U${String(maxNum[u.building]).padStart(3, '0')}`
    stats.newUnits++; if (stats.newRefs.length < 12) stats.newRefs.push(ref)
  } else stats.matched++

  // ฝั่งที่เหลือแต่โพสต์ค้าง: ต่ออายุอย่างเดียว — profile เดิมอยู่ครบ ตัวเลขแช่แข็ง
  for (const intent of ['rent', 'sale']) {
    if (u[intent] || !u.staleOnly?.[intent]) continue
    const old = profByKey.get(`${ref}·${intent}`)
    if (!old) continue                        // ไม่มี profile เดิม = ไม่สร้างจากของค้าง
    seenKeys.add(`${ref}·${intent}`)
    stats.staleKept++
    prodMut.push({ patch: { id: old._id, set: { lastCheckedAt: ROUND } } })
  }
  for (const intent of ['rent', 'sale']) {
    const d = u[intent]; if (!d) continue
    seenKeys.add(`${ref}·${intent}`)
    const old = profByKey.get(`${ref}·${intent}`)
    const priceChanged = old && old.priceTHB !== d.price
    if (priceChanged) stats.priceChanges++
    else if (old) stats.unchanged++
    const history = [...(old?.priceHistory ?? [])]
    if (!old || priceChanged)
      history.push({ _type: 'pricePoint', _key: `h${ROUND.replace(/-/g, '')}`, date: ROUND, price: d.price, nListings: d.nListings })
    prodMut.push({ createOrReplace: {
      _id: `unitProfile-${ref}-${intent}`, _type: 'unitProfile',
      refCode: ref, projectName: u.building, intent,
      bedType: u.bedType, sqm: u.sqm, floorZone: u.zone,
      priceTHB: d.price, pricePerSqm: Math.round(d.psqm),
      vsFloorPct: d.vsF, vsZonePct: d.vsZ, vsBuildingPct: d.vsB,
      dealTier: d.deal ?? undefined, hotDeal: d.hot, goodInvest: !!d.invest,
      negotiable: d.nego, yieldPct: u.yield ?? undefined,
      spreadPct: d.spread, nListings: d.nListings, nPortals: d.nPortals,
      postedByOwner: d.owner, dualListed: u.dual,
      status: old?.status && old.status !== 'expired' ? old.status : old?.status === 'expired' ? 'candidate' : 'candidate',
      pinToBoard: old?.pinToBoard, hideFromBoard: old?.hideFromBoard, internalNote: old?.internalNote,
      firstSeenAt: old?.firstSeenAt ?? ROUND, lastCheckedAt: ROUND,
      priceHistory: history,
    } })
  }
  // unitSource: merge listings ตาม sourceId — สงวนงาน co-broke ของทีม
  // schema แยก rentListings/saleListings แล้ว (2026-08-08) — merge แยกฝั่ง และ
  // createOrReplace ต้องพกทุก field ที่ทีมกรอกมือ (contactLog/phone/lineId ติดอยู่ใน
  // listing เดิมที่ spread ต่อมา) ไม่งั้นหายทั้งชุดตอน replace
  const oldSrc = srcByRef.get(ref)
  let li = 0
  const mergeSide = (side, fresh) => {
    let merged = [...(oldSrc?.[side] ?? [])]
    const lType = side === 'rentListings' ? 'rentListing' : 'saleListing'
    for (const l of fresh) {
      // เช็คใน "ฝั่งนี้" เท่านั้น — ห้ามใช้ Set รวมสองฝั่ง (audit ③: ประกาศสลับฝั่ง
      // rent↔sale จะเข้าเงื่อนไข has() แต่ find ไม่เจอ → ตกหายเงียบ) เจอในฝั่ง = อัพเดท
      // ไม่เจอ = ใบใหม่ของฝั่งนี้เสมอ แม้เคยอยู่อีกฝั่ง
      /* จับคู่ด้วย URL ก่อนเสมอ — sourceId ที่เก็บไว้ใช้สูตรของ import ดั้งเดิม (ps:883235,
         dp:28bbfbcfee) ซึ่งคำนวณกลับจาก URL ไม่ได้ · รอบ re-scrape ส่ง URL เดิมเป๊ะกลับมา
         การจับด้วย sourceId ที่สังเคราะห์ใหม่ทำให้ 62% ของประกาศถูกมองเป็นใบแปลกหน้า
         (prune 6,843 ใบใน dry-run แรก — เกือบทั้งหมดคือใบเดิมที่ยังอยู่ดี ๆ) */
      const ex = merged.find(m => (l.url && m.url === l.url) || (l.sourceId && m.sourceId === l.sourceId))
      if (ex) {   // แก้ in-place → phone/lineId เดิมอยู่ครบ
        ex.price = l.price; ex.lastSeenAt = ROUND
        if (l.postUpdatedAt) ex.postUpdatedAt = l.postUpdatedAt
        if (l.postCreatedAt && !ex.postCreatedAt) ex.postCreatedAt = l.postCreatedAt
        // วันว่างเขียนทับเสมอ (รวมทั้งลบทิ้งเมื่อประกาศเลิกระบุ = ห้องว่างแล้ว)
        ex.availableFrom = l.availableFrom ?? undefined
      } else merged.push({ _type: lType, _key: `L${ROUND.replace(/-/g, '')}x${li++}`,
        sourceId: l.sourceId, portal: l.portal, url: l.url,
        price: l.price, posterType: l.posterType, posterName: l.posterName, lastSeenAt: ROUND,
        postCreatedAt: l.postCreatedAt ?? undefined, postUpdatedAt: l.postUpdatedAt ?? undefined,
        availableFrom: l.availableFrom ?? undefined })
    }
    // prune ประกาศที่หายจากตลาด — ถ้ารอบนี้ "เห็น portal นั้นของตึกนี้" แต่ไม่เห็นใบนี้ = ใบตาย/ถูกลบ
    // (ถ้า portal ทั้งเจ้าหายจากรอบ = scrape เจ้านั้นล่ม ไม่ตัด กันข้อมูลหายเพราะเก็บไม่ครบ)
    const seenPortals = portalsSeenByBuilding.get(u.building) ?? new Set()
    const before = merged.length
    merged = merged.filter(m => m.lastSeenAt === ROUND || !seenPortals.has(normPortal(m.portal)))
    PRUNED += before - merged.length
    return merged
  }
  // ใช้การ์ดดิบทั้งฝั่ง (รวม stale) — โพสต์ค้างยังมีจริงบน portal ต้องคง lastSeenAt ให้
  // ไม่งั้นโดน prune ทิ้งทั้งที่ยังไม่ตาย · ส่วนราคา/สถิติกรอง stale ไปแล้วตอนสร้าง both[intent]
  const mergedRent = mergeSide('rentListings', u.listings.filter(l => l.intent === 'rent'))
  const mergedSale = mergeSide('saleListings', u.listings.filter(l => l.intent === 'sale'))
  intMut.push({ createOrReplace: {
    _id: oldSrc?._id ?? `unitSource-${ref}`, _type: 'unitSource',
    refCode: ref, projectName: u.building, floorActual: u.floor,
    rentListings: mergedRent.length ? mergedRent : undefined,
    saleListings: mergedSale.length ? mergedSale : undefined,
    bestContact: oldSrc?.bestContact, cobrokeStatus: oldSrc?.cobrokeStatus ?? 'not_contacted',
    cobrokeNote: oldSrc?.cobrokeNote,
    contactLog: oldSrc?.contactLog,           // ⚠ ห้ามหาย — บันทึกการโทรของทีม
  } })
}

// ห้องที่หายจากตลาด → expired
for (const p of profiles) {
  if (['candidate', 'verified', 'published'].includes(p.status) && !seenKeys.has(`${p.refCode}·${p.intent}`)) {
    stats.expired++
    prodMut.push({ patch: { id: p._id, set: { status: 'expired', lastCheckedAt: ROUND } } })
  }
}

// ── 5. marketSnapshot ต่อตึก + scrapeRound สรุปรอบ ───────────────────────────
const CODE = { '39 by Sansiri': '39bs', 'The Lumpini 24': 'l24', 'The Room Sukhumvit 21': 'rm21',
  'Noble BE19': 'nbl', 'Mahogany Tower': 'mhg', 'Park 24': 'p24',
  'Rhythm Sukhumvit 36-38': 'rtm', 'HQ by Sansiri': 'hq', 'Ideo Morph 38': 'ideo' }
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
for (const [building, slug] of Object.entries(CODE)) {
  const us = unitRows.filter(u => u.building === building)
  if (!us.length) continue
  const rents = us.filter(u => u.rent), sales = us.filter(u => u.sale)
  const cells = []
  for (const intent of ['rent', 'sale']) for (const bed of ['studio', '1bed', '2bed', '3bed', '4bed'])
    for (const zone of ['low', 'mid', 'high']) {
      const g = us.filter(u => u[intent] && u.bedType === bed && u.zone === zone).map(u => u[intent].psqm)
      if (!g.length) continue
      const m = mean(g)
      cells.push({ _type: 'cell', _key: `c${intent[0]}${bed}${zone}`, intent, bedType: bed, floorZone: zone,
        median: Math.round(median(g)), mean: Math.round(m), min: Math.round(Math.min(...g)), max: Math.round(Math.max(...g)),
        sd: Math.round(Math.sqrt(mean(g.map(x => (x - m) ** 2)))), n: g.length })
    }
  const yields = us.filter(u => u.yield != null).map(u => u.yield)
  prodMut.push({ createOrReplace: {
    _id: `marketSnapshot-${slug}-${ROUND}`, _type: 'marketSnapshot',
    projectName: building, dataDate: ROUND,
    nListings: cards.filter(c => c.building === building).length,
    nRent: rents.length, nSale: sales.length, nUniqueUnits: us.length,
    nDualListed: us.filter(u => u.dual).length,
    rentMedianPerSqm: median(rents.map(u => u.rent.psqm)) ? Math.round(median(rents.map(u => u.rent.psqm))) : undefined,
    saleMedianPerSqm: median(sales.map(u => u.sale.psqm)) ? Math.round(median(sales.map(u => u.sale.psqm))) : undefined,
    grossYieldPct: yields.length ? +mean(yields).toFixed(2) : undefined,
    activeAgents: new Set(cards.filter(c => c.building === building && c.posterName).map(c => c.posterName)).size,
    cells,
  } })
}
prodMut.push({ createOrReplace: {
  _id: `scrapeRound-${ROUND}`, _type: 'scrapeRound',
  roundDate: ROUND, listings: cards.length, uniqueUnits: unitRows.length,
  newUnits: stats.newUnits, priceChanges: stats.priceChanges, expired: stats.expired,
  warnings: warnings.length ? warnings : undefined,
} })

// ── 6. รายงาน + เขียน ────────────────────────────────────────────────────────
console.log(`\nสรุปรอบ ${ROUND}:`)
console.log(`  ห้องจับคู่กับของเดิม ${stats.matched} · ห้องใหม่ ${stats.newUnits}${stats.newRefs.length ? ' (' + stats.newRefs.join(',') + (stats.newUnits > 12 ? ',…' : '') + ')' : ''}`)
console.log(`  ราคาเปลี่ยน ${stats.priceChanges} · ราคาเดิม ${stats.unchanged} · หายจากตลาด→expired ${stats.expired}`)
console.log(`  ห้องโพสต์ค้างล้วน (คงชีวิตไว้ ตัวเลขแช่แข็ง) ${stats.staleKept}`)
if (PRUNED) console.log(`  prune listing ตาย/หลุดตลาดออกจาก source ${PRUNED} ใบ (portal ที่เห็นในรอบแต่ไม่เห็นใบนั้นแล้ว)`)
warnings.forEach(w => console.log(`  ⚠ ${w}`))
console.log(`  mutations: production ${prodMut.length} · internal ${intMut.length}`)

await mutate(prodMut, 'production')
await mutate(intMut, 'internal')
console.log(WRITE ? '\n✓ เขียนเข้า Sanity แล้ว' : '\n(dry-run — เพิ่ม --write เพื่อเขียนจริง)')
