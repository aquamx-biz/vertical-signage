#!/usr/bin/env node
/**
 * discover-dotp.mjs — เก็บประกาศเข้าใหม่จาก DotProperty ผ่าน GraphQL ของเว็บเอง (รันจาก Node ล้วน)
 *
 * Usage: node --env-file=.env tools/discover-dotp.mjs [--date YYYY-MM-DD]
 *   เขียนต่อท้าย _rounds/discovered-<date>.json (สร้างใหม่ถ้ายังไม่มี)
 *
 * เส้นทางที่พิสูจน์แล้ว (2026-08-10):
 *   1. หน้า listing ของตึก → ลิงก์ /en/condo/<เลขURL>/<slug>
 *   2. TP_getProjectDetailQuery(project_id: เลขURL) → project.project_id = เลขภายใน (1034→458)
 *   3. TP_getAvailableUnitQuery(projectId: เลขภายใน, forSale, page, perPage:50)
 *      → unit_id, uuid, bedrooms, indoor_area(ตรม.), ราคา formatted, created_at
 *   introspection เปิดอยู่ — ถ้าโครงเปลี่ยน ดู __schema ได้เลย
 *
 * กันซ้ำ: uuid ของ unit คือหางของ URL ประกาศ (/en/ads/<slug>_<uuid>) — เทียบกับหาง URL
 * DotProperty ทุกใบใน unitSource ก่อนรับเข้า · ชั้น: API ไม่ให้ → null (เหมือน FazWaz
 * ห้องจะเข้าระบบได้ต่อเมื่อเทียบชั้นจากพอร์ทัลอื่นเจอ)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const DATE = argOf('--date') ?? new Date().toISOString().slice(0, 10)

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
}
const gql = async (query, variables) => {
  const r = await fetch('https://www.dotproperty.co.th/graphql', {
    method: 'POST', headers: { ...UA, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!r.ok) throw new Error(`graphql ${r.status}`)
  const j = await r.json()
  if (j.errors?.length) throw new Error(`graphql: ${j.errors[0].message}`)
  return j.data
}
const num = v => { const n = +String(v ?? '').replace(/[^\d.]/g, ''); return Number.isFinite(n) && n > 0 ? n : null }

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const q = async (query, ds) => (await (await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).result

/* ── 1. หา URL id ของโปรเจกต์ต่อตึก จาก listing ตัวอย่างใน unitSource ─────────── */
const src = await q(`*[_type == "unitSource"]{ refCode,
  "L": coalesce(rentListings[]{portal, url}, []) + coalesce(saleListings[]{portal, url}, []) }`, 'internal')
const profs = await q(`*[_type == "unitProfile"]{ refCode, projectName }`, 'production')
const BLD = new Map(profs.map(p => [p.refCode, p.projectName]))

const sampleByBld = new Map()          // building → listing url ตัวอย่าง
const knownTails = new Set()           // หาง uuid ของ DotP ที่รู้จักแล้ว
for (const s of src) for (const l of s.L ?? []) {
  if (!l.url || !/dotproperty/.test(l.url)) continue
  const tail = (l.url.match(/_([a-z0-9-]+)$/) ?? [])[1]
  if (tail) knownTails.add(tail)
  const b = BLD.get(s.refCode)
  if (b && !sampleByBld.has(b)) sampleByBld.set(b, l.url)
}
console.log(`DotP: ตึกที่มีตัวอย่าง ${sampleByBld.size} · หาง uuid ที่รู้จัก ${knownTails.size}`)

/* ── 2. urlId → internal id ─────────────────────────────────────────────────── */
const projects = []
for (const [building, sample] of sampleByBld) {
  try {
    const h = await (await fetch(sample, { headers: UA })).text()
    const m = h.match(/\/en\/condo\/(\d+)\//)
    if (!m) { console.log(`  ⚠ ${building}: ไม่พบลิงก์โปรเจกต์`); continue }
    const d = await gql(
      `query($id:Int){ TP_getProjectDetailQuery(project_id:$id){ project { project_id name } } }`,
      { id: +m[1] })
    const internal = d?.TP_getProjectDetailQuery?.project?.project_id
    if (!internal) { console.log(`  ⚠ ${building}: map ภายในไม่ได้`); continue }
    projects.push({ building, urlId: +m[1], internal })
    console.log(`  ${building.padEnd(24)} url:${m[1]} → internal:${internal}`)
    await new Promise(r => setTimeout(r, 400))
  } catch (e) { console.log(`  ⚠ ${building}: ${e.message.slice(0, 60)}`) }
}

/* ── 3. ดึงยูนิตทั้งตึก แล้วคัดเฉพาะใบใหม่ ──────────────────────────────────── */
const UNIT_Q = `query($input: TP_AvailableUnitInput!) { TP_getAvailableUnitQuery(input: $input) {
  units { unit_id uuid title bedrooms bathrooms indoor_area is_rental is_sold transaction_type
    formatted_price formatted_rental_price first_price_formatted first_rental_price_formatted created_at } } }`
const rows = []
let dup = 0
for (const p of projects) {
  for (const forSale of [false, true]) {
    for (let page = 1; page <= 20; page++) {
      let units
      try {
        const d = await gql(UNIT_Q, { input: { projectId: p.internal, isSale: false, forSale,
          page, sortBy: null, perPage: 50, bedroom: null, propertyTypeId: null, unitTypeName: null,
          priceMin: null, priceMax: null } })
        units = d?.TP_getAvailableUnitQuery?.units ?? []
      } catch (e) { console.log(`  ⚠ ${p.building} ${forSale ? 'sale' : 'rent'} p${page}: ${e.message.slice(0, 50)}`); break }
      if (!units.length) break
      for (const u of units) {
        if (u.uuid && knownTails.has(u.uuid)) { dup++; continue }
        const intent = forSale ? 'sale' : 'rent'
        const price = intent === 'rent'
          ? num(u.formatted_rental_price) ?? num(u.first_rental_price_formatted)
          : num(u.formatted_price) ?? num(u.first_price_formatted)
        rows.push({
          building: p.building, intent,
          bed: Number.isFinite(+u.bedrooms) ? +u.bedrooms : null,
          bath: Number.isFinite(+u.bathrooms) && +u.bathrooms > 0 ? +u.bathrooms : null,
          sqm: num(u.indoor_area), floor: null, price,
          portal: 'DotProperty',
          /* slug ย่อใช้ไม่ได้ (พิสูจน์แล้ว 404) — ประกอบจาก title ไม่ได้เสถียร จึงเก็บ
             เป็น URL รูปแบบที่หางถูก: ingest ใช้หางเป็น sourceId และ dedupe ด้วยหางอยู่แล้ว */
          url: `https://www.dotproperty.co.th/en/ads/${(u.title ?? 'unit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)}_${u.uuid}`,
          posterType: 'unknown', posterName: null,
          postCreatedAt: u.created_at ? String(u.created_at).slice(0, 10) : null, postUpdatedAt: null,
        })
      }
      if (units.length < 50) break
      await new Promise(r => setTimeout(r, 500))
    }
  }
}

const usable = rows.filter(r => r.price != null && r.bed != null && r.sqm != null)
console.log(`\nยูนิตที่เจอใหม่ ${rows.length} · ใช้ได้ (มีราคา+นอน+ตรม.) ${usable.length} · ซ้ำกับที่รู้จัก ${dup}`)
const by = {}
for (const r of usable) by[`${r.building}|${r.intent}`] = (by[`${r.building}|${r.intent}`] ?? 0) + 1
for (const [k, v] of Object.entries(by)) console.log(`  ${k.padEnd(38)} ${v}`)

const path = `_rounds/discovered-${DATE}.json`
const prev = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
const prevUrls = new Set(prev.map(r => r.url).filter(Boolean))
const add = usable.filter(r => !prevUrls.has(r.url))
writeFileSync(path, JSON.stringify([...prev, ...add], null, 1))
console.log(`\nเขียนเพิ่ม ${add.length} แถว → ${path} (รวม ${prev.length + add.length})`)
