#!/usr/bin/env node
/**
 * discover-pscout.mjs — เก็บประกาศเข้าใหม่จาก PropertyScout (Node ล้วน)
 *
 * เส้นทางที่พิสูจน์แล้ว (2026-08-10): SERP กรองตึก = /en/bangkok/condo/<slug>/{rentals,sales}/condo/[page-N/]
 * (ไม่มีลิงก์ไหนบนเว็บพาไป — ได้จากการกดค้นหาในหน้าจริงแล้วดู URL) · server-rendered ผ่าน __NEXT_DATA__
 * ⚠ slug ผิด = ไม่ error แต่ได้ "ทั้งกรุงเทพ" เงียบ ๆ (91,622 ใบ) — ต้องตรวจ 2 ชั้น:
 *   total ต้อง < 3000 และ buildingName ของทุกใบต้องตรงกับชื่อฝั่ง PScout
 * detail ใบใหม่: /en/condo-<id>/ redirect หา canonical เอง (พฤติกรรมเดียวกับที่เจอในบั๊ก redirect)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8' }
const num = v => { const n = +String(v ?? '').replace(/[^\d.]/g, ''); return Number.isFinite(n) && n > 0 ? n : null }
/* ชั้นจาก portal มาเป็นช่วงได้ ("21 - 25", "28+29", "9 / building 5") — num() จะเชื่อมเลข
   ติดกันเป็น 2125/2829 (ชั้นผี) · เอาเลขจำนวนเต็มตัวแรก = ชั้นต่ำสุด ตามที่ตกลงกับเจ้าของงาน */
const lowFloor = v => { const m = String(v ?? '').match(/\d{1,3}/); const n = m ? +m[0] : NaN
  return Number.isFinite(n) && n > 0 && n <= 120 ? n : null }
const iso = v => { if (v == null || v === '' || v === 0) return null
  const d = new Date(v); return isNaN(+d) || d.getUTCFullYear() < 2000 ? null : d.toISOString().slice(0, 10) }

// ชื่อฝั่ง PScout (จาก pageSeen ของรอบ re-scrape) — Mahogany/Noble เดา slug แล้วให้ด่านตรวจคัดเอง
const B = [
  ['39 by Sansiri', '39 By Sansiri', '39-by-sansiri'],
  ['HQ by Sansiri', 'HQ Thonglor', 'hq-thonglor'],
  ['Ideo Morph 38', 'Ideo Morph 38', 'ideo-morph-38'],
  ['The Lumpini 24', 'The Lumpini 24', 'the-lumpini-24'],
  ['Mahogany Tower', 'Mahogany Tower', 'mahogany-tower'],
  ['Noble BE19', 'Noble BE19', 'noble-be19'],
  ['Park 24', 'Park Origin Phrom Phong', 'park-origin-phrom-phong'],
  ['Rhythm Sukhumvit 36-38', 'Rhythm Sukhumvit 36-38', 'rhythm-sukhumvit-36-38'],
  ['The Room Sukhumvit 21', 'The Room Sukhumvit 21', 'the-room-sukhumvit-21'],
]

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const src = await (await fetch(`${API}/data/query/internal?query=${encodeURIComponent(
  `*[_type == "unitSource"]{ "L": coalesce(rentListings[]{portal, url}, []) + coalesce(saleListings[]{portal, url}, []) }`)}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } })).json()
const known = new Set()
for (const s of src.result) for (const l of s.L ?? [])
  if (l.portal === 'PropertyScout' && l.url) { const m = l.url.match(/-(\d{5,})\/?$/); if (m) known.add(m[1]) }
console.log(`known PScout ids: ${known.size}`)

const nextData = h => { const m = h.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); if (!m) return null
  try { return JSON.parse(m[1]).props?.pageProps } catch { return null } }

const newOnes = []
for (const [ours, theirs, slug] of B) {
  for (const intent of ['rent', 'sale']) {
    const seg = intent === 'rent' ? 'rentals' : 'sales'
    for (let pg = 1; pg <= 30; pg++) {
      const u = `https://propertyscout.co.th/en/bangkok/condo/${slug}/${seg}/condo/${pg > 1 ? `page-${pg}/` : ''}`
      let pp; try { pp = nextData(await (await fetch(u, { headers: UA })).text()) } catch { break }
      const box = pp?.rentals ?? pp?.sales
      const data = box?.data ?? []
      if (!data.length) break
      if (box.total > 3000) { console.log(`  ⚠ ${ours}|${intent}: slug ไม่กรอง (total ${box.total}) — ข้ามทั้งฝั่ง`); break }
      const wrong = data.filter(x => x.buildingName !== theirs).length
      if (wrong > data.length / 2) { console.log(`  ⚠ ${ours}|${intent}: ตึกไม่ตรง ${wrong}/${data.length} — ข้าม`); break }
      for (const x of data) {
        if (x.buildingName !== theirs) continue
        if (known.has(String(x.id))) continue
        newOnes.push({ building: ours, intent, id: String(x.id),
          bed: (v => v === 'studio' ? 0 : ({ one: 1, two: 2, three: 3, four: 4 })[String(v).replace('_bedroom', '').replace('one_', 'one')] ?? num(v))(x.numberBedrooms ?? x.unitType),
          bath: Number.isFinite(+x.numberBathrooms) && +x.numberBathrooms > 0 ? +x.numberBathrooms : null,
          sqm: num(x.floorSize), floor: lowFloor(x.floorLevel),
          price: intent === 'rent' ? num(x.lowestPrice) : num(x.salePrice ?? x.lowestPrice),
          postCreatedAt: iso(x.extsourceCreatedAt ?? x.created_at), postUpdatedAt: iso(x.updated_at) })
      }
      if (data.length < 20) break
      await new Promise(r => setTimeout(r, 400))
    }
  }
}
console.log(`ใบใหม่จาก SERP: ${newOnes.length}`)

/* detail ใบใหม่ — /en/condo-<id>/ redirect หา canonical · ใช้ extractor แบบเดียวกับ re-scrape */
const out = [], stat = { ok: 0, gone: 0, bad: 0 }
let n = 0
async function worker(list) {
  for (const r of list) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000)
      const res = await fetch(`https://propertyscout.co.th/en/condo-${r.id}/`, { headers: UA, redirect: 'follow', signal: c.signal })
      clearTimeout(t)
      if (res.status !== 200 || !res.url.includes(r.id)) { stat.gone++; continue }
      const h = await res.text()
      const m = h.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      const p = m ? JSON.parse(m[1]).props?.pageProps?.property : null
      if (!p) { stat.bad++; continue }
      const isSale = /sale|sell/i.test(p.tenure ?? '')
      const price = isSale ? num(p.salePrice) : num(p.lowestPrice)
      if (!price) { stat.bad++; continue }
      out.push({ building: r.building, intent: isSale ? 'sale' : 'rent',
        bed: p.bedroomsCount ?? r.bed, bath: p.bathroomsCount ?? r.bath ?? null,
        sqm: num(p.floorSize) ?? r.sqm, floor: lowFloor(p.floorLevel) ?? r.floor,
        price, portal: 'PropertyScout', url: res.url,
        posterType: p.postBy === 'landlord' ? 'owner' : p.postBy ? 'agent' : 'unknown', posterName: null,
        postCreatedAt: iso(p.extsourceCreatedAt ?? p.createdAt) ?? r.postCreatedAt,
        postUpdatedAt: iso(p.ae_man_event_date) ?? r.postUpdatedAt,
        availableFrom: iso(p.ae_man_unavailable_enddate) })
      stat.ok++
    } catch { stat.bad++ }
    if (++n % 50 === 0) console.log(`  detail ${n}/${newOnes.length}`)
    await new Promise(x => setTimeout(x, 250))
  }
}
const CONC = 5
await Promise.all(Array.from({ length: CONC }, (_, i) => worker(newOnes.filter((_, k) => k % CONC === i))))
console.log(`detail: อยู่ ${stat.ok} · ตาย ${stat.gone} · อ่านไม่ได้ ${stat.bad}`)

const path = `_rounds/discovered-${DATE}.json`
const prev = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
const prevUrls = new Set(prev.map(x => x.url).filter(Boolean))
const add = out.filter(x => x.url && !prevUrls.has(x.url) && x.price != null && x.bed != null && x.sqm != null)
writeFileSync(path, JSON.stringify([...prev, ...add], null, 1))
const by = {}
for (const r of add) by[`${r.building}|${r.intent}`] = (by[`${r.building}|${r.intent}`] ?? 0) + 1
for (const [k, v] of Object.entries(by)) console.log(`  ${k.padEnd(38)} ${v}`)
console.log(`เขียนเพิ่ม ${add.length} → ${path} (รวม ${prev.length + add.length})`)
