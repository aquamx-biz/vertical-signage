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
const src = await q(`*[_type == "unitSource"]{ "L": coalesce(rentListings[].url, []) + coalesce(saleListings[].url, []) }`, 'internal')
const knownUrls = new Set(src.flatMap(s => s.L).filter(Boolean))
console.log(`URL ที่รู้จักแล้ว ${knownUrls.size} ใบ (ประตูกันซ้ำ)`)

const SLUG2BLD = {
  'hq-by-sansiri': 'HQ by Sansiri', 'ideo-morph-38': 'Ideo Morph 38', 'the-lumpini-24': 'The Lumpini 24',
  'noble-be19': 'Noble BE19', 'park-origin-phrom-phong': 'Park 24', 'rhythm-sukhumvit-36-38': 'Rhythm Sukhumvit 36-38',
  '39-by-sansiri': '39 by Sansiri', 'the-room-sukhumvit-21': 'The Room Sukhumvit 21',
}
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
      posterType: 'unknown', posterName: null,
      postCreatedAt: r.postCreatedAt ?? null, postUpdatedAt: r.postUpdatedAt ?? null, availNote: r.availNote ?? null })
  }

// FazWaz — ไม่มีชั้น (หน้าไม่บอก) · bed จาก slug ปลายทาง
if (existsSync(DL + `aquamx-fzdet-${DATE}.json`))
  for (const r of JSON.parse(readFileSync(DL + `aquamx-fzdet-${DATE}.json`, 'utf8'))) {
    if (r.error || r.gone || r.noPrice) { drop.err++; continue }
    push({ building: SLUG2BLD[r.slug] ?? r.slug, intent: r.intent, bed: r.bed, bath: r.bath ?? null, sqm: r.sqm,
      floor: null, price: r.price, portal: 'FazWaz', url: r.url ?? null,
      posterType: 'unknown', posterName: null,
      postCreatedAt: r.postCreatedAt ?? null, postUpdatedAt: r.postUpdatedAt ?? null, availableFrom: r.availableFrom ?? null })
  }

// LivingInsider
if (existsSync(`_rounds/_lidet-${DATE}.json`))
  for (const r of JSON.parse(readFileSync(`_rounds/_lidet-${DATE}.json`, 'utf8'))) {
    if (r.error) { drop.err++; continue }
    push({ building: r.building, intent: r.intent, bed: r.bed, bath: r.bath ?? null, sqm: r.sqm,
      floor: r.floor ?? null, price: r.price, portal: 'LivingInsider', url: r.url ?? null,
      posterType: 'unknown', posterName: null,
      postCreatedAt: r.postCreatedAt ?? null, postUpdatedAt: r.postUpdatedAt ?? null })
  }

writeFileSync(`_rounds/discovered-${DATE}.json`, JSON.stringify(rows, null, 1))
const by = {}
for (const r of rows) by[r.portal] = (by[r.portal] ?? 0) + 1
console.log(`ประกาศใหม่พร้อมเข้า ingest: ${rows.length} ใบ — ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`ตัดทิ้ง: ซ้ำกับที่รู้จัก ${drop.dup} · ข้อมูลไม่ครบ ${drop.incomplete} · เก็บพลาด ${drop.err}`)
console.log(`\ndry-run:  node --env-file=.env tools/ingest-units.mjs --round "_rounds/discovered-${DATE}.json" --date ${DATE}`)
