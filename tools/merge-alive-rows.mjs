#!/usr/bin/env node
/**
 * merge-alive-rows.mjs — เติม "ครึ่ง re-scrape ของ portal ที่ยิงตรงไม่ได้" เข้าไฟล์รอบ
 *
 * Usage: node --env-file=.env tools/merge-alive-rows.mjs --date YYYY-MM-DD
 *   อ่าน:  _rounds/round-<date>.json              (ครึ่งที่ยิงตรงได้ — DotProperty/PropertyScout/LivingInsider)
 *          Downloads/aquamx-phfull-<date>.json    (PropertyHub ทั้งตลาด เก็บผ่าน Chrome ตัวจริง)
 *          Downloads/aquamx-fzalive-<date>.json   (FazWaz ใบที่รู้จักและยังโชว์อยู่ เก็บผ่าน Chrome)
 *   เขียน: _rounds/round-<date>.json (แทนที่ — สำรองเป็น round-<date>.direct.json ครั้งแรก)
 *
 * ทำไมต้องมีขั้นนี้ (เจอจริงรอบ 2026-08-17):
 *   ingest ตัดสิน expired จาก "ห้องที่ไม่อยู่ในไฟล์รอบ" · FazWaz เพิ่งขึ้น Cloudflare challenge
 *   กับการยิงตรง (403 "Just a moment...") — rescrape-listings จึงได้ noPrice ครบ 1,752/1,752 ใบ
 *   และไฟล์รอบไม่มีแถว FazWaz เลยสักแถว ส่วน PropertyHub ยิงตรงไม่ได้อยู่แล้ว
 *   ผลคือห้องที่ลงไว้เฉพาะสองเจ้านี้ (575 ห้องจาก 2,837) จะถูกตราหน้าว่าหายจากตลาดทั้งแผง
 *   ทั้งที่ยังประกาศอยู่ · แถวที่เติมตรงนี้ผูกกับห้องเดิมด้วย refCode (ไม่ใช่ลายนิ้วมือ)
 *   ราคา/วันที่มาจากหน้าเว็บ ส่วน bed/sqm/floor ใช้ของเดิมตามกติกาเดียวกับ rescrape-listings
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const DATE = argOf('--date') ?? new Date().toISOString().slice(0, 10)
const DL = 'C:/Users/Lenovo/Downloads/'

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const q = async (query, ds) => (await (await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).result

const [src, profs] = await Promise.all([
  q(`*[_type == "unitSource"]{ refCode, floorActual,
    "L": coalesce(rentListings[]{portal, url, "intent": "rent", posterType, posterName}, [])
       + coalesce(saleListings[]{portal, url, "intent": "sale", posterType, posterName}, []) }`, 'internal'),
  q(`*[_type == "unitProfile"]{ refCode, intent, projectName, bedType, sqm }`, 'production'),
])
const PROF = new Map(profs.map(p => [`${p.refCode}·${p.intent}`, p]))
const BED = b => { const m = String(b ?? '').match(/(\d+)/); return /studio/i.test(b ?? '') ? 0 : m ? +m[1] : null }

// URL ที่ระบบรู้จัก → ห้องไหน (ผูกด้วย refCode ไม่ต้องเดาลายนิ้วมือ)
const byUrl = new Map()
for (const s of src) for (const l of s.L ?? []) {
  if (!l.url) continue
  byUrl.set(l.url, { refCode: s.refCode, floor: s.floorActual ?? null, intent: l.intent,
    portal: l.portal, posterType: l.posterType ?? null, posterName: l.posterName ?? null })
}
// PropertyHub เก็บ id มา ไม่ใช่ URL เดิมเป๊ะ — ทำดัชนี id → ห้อง เพิ่มอีกชั้น
const phById = new Map()
for (const [url, v] of byUrl) {
  const m = url.match(/propertyhub\.in\.th\/.*?(\d{5,9})\/?$/)
  if (m) phById.set(m[1], { ...v, url })
}
const fzById = new Map()
for (const [url, v] of byUrl) {
  const m = url.match(/fazwaz\.com\/.*-u(\d{4,8})/)
  if (m) fzById.set(m[1], { ...v, url })
}
const ddById = new Map()
for (const [url, v] of byUrl) {
  const m = url.match(/ddproperty\.com\/.*?(\d{7,})\/?$/)
  if (m) ddById.set(m[1], { ...v, url })
}

const round = JSON.parse(readFileSync(`_rounds/round-${DATE}.json`, 'utf8'))
if (!existsSync(`_rounds/round-${DATE}.direct.json`)) copyFileSync(`_rounds/round-${DATE}.json`, `_rounds/round-${DATE}.direct.json`)
const have = new Set(round.map(r => r.url).filter(Boolean))
const added = { PropertyHub: 0, FazWaz: 0 }
const skipped = { noRoom: 0, noPrice: 0, dup: 0 }

const rowFor = (hit, portal, price, extra) => {
  const pr = PROF.get(`${hit.refCode}·${hit.intent}`)
  if (!pr) return null
  return { refCode: hit.refCode, building: pr.projectName, intent: hit.intent,
    bed: BED(pr.bedType), sqm: pr.sqm ?? null, floor: hit.floor,
    price, portal, url: hit.url,
    posterType: hit.posterType, posterName: hit.posterName,
    postCreatedAt: extra.postCreatedAt ?? null, postUpdatedAt: extra.postUpdatedAt ?? null,
    availableFrom: extra.availableFrom ?? null }
}

if (existsSync(`${DL}aquamx-phfull-${DATE}.json`))
  for (const r of JSON.parse(readFileSync(`${DL}aquamx-phfull-${DATE}.json`, 'utf8'))) {
    const hit = phById.get(String(r.id)); if (!hit) { skipped.noRoom++; continue }
    if (have.has(hit.url)) { skipped.dup++; continue }
    if (r.price == null) { skipped.noPrice++; continue }
    const row = rowFor(hit, 'PropertyHub', r.price, r)
    if (!row) { skipped.noRoom++; continue }
    round.push(row); have.add(hit.url); added.PropertyHub++
  }

if (existsSync(`${DL}aquamx-fzalive-${DATE}.json`))
  for (const r of JSON.parse(readFileSync(`${DL}aquamx-fzalive-${DATE}.json`, 'utf8'))) {
    if (r.error) continue
    const hit = fzById.get(String(r.id)); if (!hit) { skipped.noRoom++; continue }
    if (have.has(hit.url)) { skipped.dup++; continue }
    if (r.price == null) { skipped.noPrice++; continue }
    const row = rowFor(hit, 'FazWaz', r.price, r)
    if (!row) { skipped.noRoom++; continue }
    round.push(row); have.add(hit.url); added.FazWaz++
  }

if (existsSync(`${DL}aquamx-ddalive-${DATE}.json`))
  for (const r of JSON.parse(readFileSync(`${DL}aquamx-ddalive-${DATE}.json`, 'utf8'))) {
    if (r.error || r.gone) continue                 // ถูกถอด/challenge = ไม่ยืนยันว่ายังอยู่ ปล่อยให้ ingest ตัดสิน
    const hit = ddById.get(String(r.id)); if (!hit) { skipped.noRoom++; continue }
    if (have.has(hit.url)) { skipped.dup++; continue }
    if (r.price == null) { skipped.noPrice++; continue }
    const row = rowFor(hit, 'DDproperty', r.price, r)
    if (!row) { skipped.noRoom++; continue }
    round.push(row); have.add(hit.url); added.DDproperty = (added.DDproperty ?? 0) + 1
  }

writeFileSync(`_rounds/round-${DATE}.json`, JSON.stringify(round, null, 1))
const by = {}
for (const r of round) by[r.portal] = (by[r.portal] ?? 0) + 1
console.log(`เติมแถว: ${Object.entries(added).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`ข้าม: ไม่ใช่ห้องที่ระบบรู้จัก ${skipped.noRoom} · ไม่มีราคา ${skipped.noPrice} · มีในไฟล์แล้ว ${skipped.dup}`)
console.log(`ไฟล์รอบตอนนี้ ${round.length} แถว —`, Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · '))
