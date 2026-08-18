#!/usr/bin/env node
/**
 * assemble-discovery.mjs — รวมผล discovery (ประกาศเข้าใหม่) เป็นไฟล์รอบให้ ingest
 *
 * Usage: node --env-file=.env tools/assemble-discovery.mjs [--date YYYY-MM-DD]
 *   อ่าน: Downloads/aquamx-phdet-<date>.json · aquamx-fzdet-<date>.json · _rounds/_lidet-<date>.json
 *   เขียน: _rounds/discovered-<date>.json (รูปแบบเดียวกับ round file — ingest --round อ่านได้)
 *
 * ต่างจากรอบ re-scrape: แถวพวกนี้ "ไม่มี refCode" — ให้ ingest จับคู่ด้วยลายนิ้วมือ
 * (ตึก|นอน|ตรม.|ชั้น) กับห้องเดิม ตรงไหนไม่เจอค่อยออกเลขห้องใหม่ · ประตูกันซ้ำชั้นสุดท้าย:
 * ตัด URL ที่มีอยู่ใน unitSource แล้วทิ้งเสมอ (กติกาเจ้าของงาน: ห้ามให้ของซ้ำงอกเป็นขยะ)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const DATE = argOf('--date') ?? new Date().toISOString().slice(0, 10)
const DL = 'C:/Users/Lenovo/Downloads/'

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const q = async (query, ds) => (await (await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).result

// ประตูกันซ้ำ: URL ทุกใบที่ระบบรู้จักแล้ว
/* --ignore-known-urls = ปิดประตูกันซ้ำชั้น URL สำหรับ "ingest รอบเดิมซ้ำ" เท่านั้น
   ประตูนี้เป็นชั้นที่สอง — ชั้นแรกคือตัวเก็บแต่ละเจ้ากรองด้วยเลขประกาศไปแล้วตอนเก็บ
   พอ ingest รอบแรกเขียนลง Sanity ปุ๊บ URL ของใบใหม่กลายเป็น "รู้จักแล้ว" ทันที
   assemble รอบสองจึงคายมันทิ้ง → ห้องที่มีหลักฐานเป็นใบ discovery ใบเดียวหายจากไฟล์รอบ
   → ingest อ่านว่า "ไม่เจอในรอบ" แล้วตั้ง expired ทั้งที่เพิ่งยืนยันไปเมื่อกี้ (เจอจริง 15 ห้อง)
   ห้ามใช้กับรอบใหม่ — ในรอบใหม่ประตูนี้คือตัวกันประกาศเก่างอกซ้ำ */
const IGNORE_GATE = args.includes('--ignore-known-urls')
const src = await q(`*[_type == "unitSource"]{ "L": coalesce(rentListings[].url, []) + coalesce(saleListings[].url, []) }`, 'internal')
const knownUrls = IGNORE_GATE ? new Set() : new Set(src.flatMap(s => s.L).filter(Boolean))
console.log(IGNORE_GATE
  ? `⚠ ปิดประตูกันซ้ำชั้น URL (--ignore-known-urls) — ใช้ได้เฉพาะตอน ingest รอบเดิมซ้ำ`
  : `URL ที่รู้จักแล้ว ${knownUrls.size} ใบ (ประตูกันซ้ำ)`)

const SLUG2BLD = {
  'hq-by-sansiri': 'HQ by Sansiri', 'ideo-morph-38': 'Ideo Morph 38', 'the-lumpini-24': 'The Lumpini 24',
  'noble-be19': 'Noble BE19', 'park-origin-phrom-phong': 'Park 24', 'rhythm-sukhumvit-36-38': 'Rhythm Sukhumvit 36-38',
  '39-by-sansiri': '39 by Sansiri', 'the-room-sukhumvit-21': 'The Room Sukhumvit 21',
  'mahogany-tower': 'Mahogany Tower',
}
/* slug ที่ไม่มีในแมพจะกลายเป็นชื่อตึกดิบ ("mahogany-tower") แล้วงอกเป็นตึกใหม่ใน Sanity
   เงียบ ๆ — กันไว้ที่นี่ ดีกว่าไปตามลบทีหลัง */
for (const s of Object.keys(SLUG2BLD)) if (!SLUG2BLD[s]) throw new Error(`SLUG2BLD ${s} ว่าง`)
const rows = [], drop = { dup: 0, incomplete: 0, err: 0 }
const push = r => {
  if (r.url && knownUrls.has(r.url)) { drop.dup++; return }
  if (r.price == null || r.bed == null || r.sqm == null) { drop.incomplete++; return }
  rows.push(r)
}

// PropertyHub — เก็บครบทุกฟิลด์รวมชั้น
const PH_BLD = new Map(JSON.parse(readFileSync('_rounds/_ph-new-ids.json', 'utf8')).map(x => [String(x.id), x.building]))
if (existsSync(DL + `aquamx-phdet-${DATE}.json`))
  for (const r of JSON.parse(readFileSync(DL + `aquamx-phdet-${DATE}.json`, 'utf8'))) {
    if (r.error || r.gone || r.noPrice) { drop.err++; continue }
    push({ building: PH_BLD.get(String(r.id)) ?? null, intent: r.intent, bed: r.bed, bath: r.bath ?? null, sqm: r.sqm,
      floor: r.floor ?? null, price: r.price, portal: 'PropertyHub', url: r.url ?? null,
      posterType: r.posterType ?? ((r.posterName ?? r.agent) ? 'agent' : 'unknown'),
      posterName: r.posterName ?? r.agent ?? null,   // ส่งชื่อ agent ต่อ (ถ้า browser scrape เก็บมา) — เลิก hardcode null
      postCreatedAt: r.postCreatedAt ?? null, postUpdatedAt: r.postUpdatedAt ?? null, availNote: r.availNote ?? null })
  }

/* FazWaz — ใช้ชั้นจากหน้าประกาศได้แล้ว (เปิดใช้ 2026-08-17)
   เดิมทิ้งเป็น null หลังเหตุ 2026-08-05 ที่ตัวเก็บไปหยิบเลขจากบล็อกสิ่งอำนวยความสะดวก
   (ชั้นสระ) ทำให้ทั้งตึกได้ชั้นเดียวกันหมด · ตัวเก็บรอบนี้อ่านจากบล็อกสรุปหัวประกาศ
   ("42 SqM Size 32 Floor") ซึ่งเป็นชั้นของห้องเอง — วัดจริง 2026-08-17: 71 ใบใน 8 ตึก
   ได้ชั้นกระจาย 4-11 ค่าต่อตึก ไม่ใช่อาการค่าเดียวทั้งชุด
   ยามชั้นกองค่าเดียวใน ingest-units ยังทำงานอยู่เป็นตาข่ายรับอีกชั้น ถ้าเว็บเปลี่ยนโครง */
const fzFloor = v => {
  const n = +String(v ?? '').replace(/[^\d]/g, '')
  return Number.isFinite(n) && n > 0 && n <= 120 ? n : null
}
if (existsSync(DL + `aquamx-fzdet-${DATE}.json`))
  for (const r of JSON.parse(readFileSync(DL + `aquamx-fzdet-${DATE}.json`, 'utf8'))) {
    if (r.error || r.gone || r.noPrice) { drop.err++; continue }
    if (!SLUG2BLD[r.slug]) { drop.err++; console.warn(`⚠ FazWaz slug ไม่รู้จัก: ${r.slug} — ทิ้งใบนี้ (กันตึกชื่อ slug งอกใน Sanity)`); continue }
    push({ building: SLUG2BLD[r.slug], intent: r.intent, bed: r.bed, bath: r.bath ?? null, sqm: r.sqm,
      floor: fzFloor(r.floor), price: r.price, portal: 'FazWaz', url: r.url ?? null,
      posterType: r.posterType ?? ((r.posterName ?? r.agent) ? 'agent' : 'unknown'),
      posterName: r.posterName ?? r.agent ?? null,   // ส่งชื่อ agent ต่อ (ถ้า browser scrape เก็บมา) — เลิก hardcode null
      postCreatedAt: r.postCreatedAt ?? null, postUpdatedAt: r.postUpdatedAt ?? null, availableFrom: r.availableFrom ?? null })
  }

// LivingInsider
if (existsSync(`_rounds/_lidet-${DATE}.json`))
  for (const r of JSON.parse(readFileSync(`_rounds/_lidet-${DATE}.json`, 'utf8'))) {
    if (r.error) { drop.err++; continue }
    push({ building: r.building, intent: r.intent, bed: r.bed, bath: r.bath ?? null, sqm: r.sqm,
      floor: r.floor ?? null, price: r.price, portal: 'LivingInsider', url: r.url ?? null,
      posterType: r.posterType ?? ((r.posterName ?? r.agent) ? 'agent' : 'unknown'),
      posterName: r.posterName ?? r.agent ?? null,   // ส่งชื่อ agent ต่อ (ถ้า browser scrape เก็บมา) — เลิก hardcode null
      postCreatedAt: r.postCreatedAt ?? null, postUpdatedAt: r.postUpdatedAt ?? null })
  }

writeFileSync(`_rounds/discovered-${DATE}.json`, JSON.stringify(rows, null, 1))
const by = {}
for (const r of rows) by[r.portal] = (by[r.portal] ?? 0) + 1
console.log(`ประกาศใหม่พร้อมเข้า ingest: ${rows.length} ใบ — ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`ตัดทิ้ง: ซ้ำกับที่รู้จัก ${drop.dup} · ข้อมูลไม่ครบ ${drop.incomplete} · เก็บพลาด ${drop.err}`)
console.log(`\ndry-run:  node --env-file=.env tools/ingest-units.mjs --round "_rounds/discovered-${DATE}.json" --date ${DATE}`)
