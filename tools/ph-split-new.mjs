#!/usr/bin/env node
/**
 * ph-split-new.mjs — แยก "ประกาศ PropertyHub ที่ยังไม่รู้จัก" ออกจากไฟล์เก็บทั้งตลาด
 *
 * Usage: node --env-file=.env tools/ph-split-new.mjs --date YYYY-MM-DD
 *   อ่าน:  Downloads/aquamx-phfull-<date>.json (ทุกใบที่หน้าโครงการโชว์ — เก็บผ่าน Chrome ตัวจริง)
 *   เขียน: Downloads/aquamx-phdet-<date>.json  (เฉพาะใบใหม่ — assemble-discovery.mjs อ่านไฟล์นี้)
 *          _rounds/_ph-new-ids.json            (id → ตึก ให้ assemble ใช้เติมชื่อตึก)
 *
 * ทำไมต้องแยกตรงนี้ ไม่ใช่ในหน้าเว็บ: รายการ id ที่ระบบรู้จักมี ~4,000 ใบ การยัดเข้าไปในหน้า
 * แพงกว่าการดาวน์โหลดผลดิบออกมา diff ข้างนอก · และ diff ที่นี่ตรวจซ้ำได้ ไม่หายไปกับแท็บ
 *
 * หน้าโครงการของ PH ให้ครบทุกฟิลด์ใน __NEXT_DATA__ อยู่แล้ว (ราคา/นอน/น้ำ/ตร.ม./ชั้น/วันที่)
 * จึงไม่ต้องเปิดหน้า detail รายใบเหมือน portal อื่น
 */
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const DATE = argOf('--date') ?? new Date().toISOString().slice(0, 10)
const DL = 'C:/Users/Lenovo/Downloads/'

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const q = async (query, ds) => (await (await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).result

const src = await q(`*[_type == "unitSource"]{ "L": coalesce(rentListings[].url, []) + coalesce(saleListings[].url, []) }`, 'internal')
const knownIds = new Set(), knownUrls = new Set()
for (const s of src) for (const u of s.L ?? []) {
  if (!u) continue
  knownUrls.add(u)
  const m = u.match(/propertyhub\.in\.th\/.*?(\d{5,9})\/?$/)
  if (m) knownIds.add(m[1])
}

const all = JSON.parse(readFileSync(`${DL}aquamx-phfull-${DATE}.json`, 'utf8'))
/* ชั้นของ PH เป็นสตริงอิสระที่คนกรอกเอง ("19", "high", "29/A") — เอาเฉพาะที่เป็นเลขล้วน
   สมเหตุสมผล · ชั้นอยู่ในลายนิ้วมือที่ ingest ใช้จับคู่ห้อง เดาผิด = ห้องผี */
const plausFloor = v => {
  const s = String(v ?? '').trim()
  if (!/^\d{1,3}$/.test(s)) return null
  const n = +s
  return n > 0 && n <= 120 ? n : null
}

const fresh = all.filter(r => !knownIds.has(String(r.id)) && !knownUrls.has(r.url))
const rows = fresh.map(r => ({
  id: String(r.id), intent: r.intent,
  bed: r.bed ?? null, bath: r.bath ?? null, sqm: r.sqm ?? null,
  floor: plausFloor(r.floor), price: r.price ?? null, url: r.url,
  postCreatedAt: r.postCreatedAt ?? null, postUpdatedAt: r.postUpdatedAt ?? null,
  noPrice: r.price == null,
}))

writeFileSync(`${DL}aquamx-phdet-${DATE}.json`, JSON.stringify(rows, null, 1))
writeFileSync('_rounds/_ph-new-ids.json', JSON.stringify(fresh.map(r => ({ id: String(r.id), building: r.building })), null, 1))

const by = {}
for (const r of fresh) by[r.building] = (by[r.building] ?? 0) + 1
console.log(`เก็บจากหน้าโครงการทั้งหมด ${all.length} ใบ · รู้จักแล้ว ${all.length - fresh.length} · ใหม่ ${fresh.length}`)
console.log(Object.entries(by).map(([k, v]) => `  ${k}: ${v}`).join('\n'))
console.log(`ใบใหม่ที่ข้อมูลครบ (ราคา+นอน+ตร.ม.+ชั้น): ${rows.filter(r => r.price && r.bed != null && r.sqm && r.floor).length}`)
console.log(`เขียน ${DL}aquamx-phdet-${DATE}.json · _rounds/_ph-new-ids.json`)
