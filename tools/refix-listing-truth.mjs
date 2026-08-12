#!/usr/bin/env node
/**
 * refix-listing-truth.mjs — เอาความจริงจากหน้าประกาศมาทับค่าที่ scraper อ่านผิด
 *
 * Usage: node --env-file=.env tools/refix-listing-truth.mjs [--write]
 *
 * ทำไมต้องมี: ตัวเก็บข้อมูลของ Dot Property เอา "จำนวนห้องนอน" ไปต่อท้าย "ราคา"
 * (12,000,000 + 1 นอน → 120000001) และบางใบเลขห้องนอนก็เพี้ยนเป็น 8882/9991
 * ผลคือห้อง 28 ตร.ม. ราคา 58 ล้าน และห้อง 1 นอนกลายเป็น 3 นอน
 *
 * วิธีตรวจ — ใช้พยานที่ไม่ผ่านมือ scraper สองปาก:
 *   1. slug ของ URL ประกาศ บอกจำนวนห้องนอนไว้เอง (1-bedroom-condo-for-sale-…)
 *   2. ตัวหน้าประกาศเอง อ่านราคา/นอน/น้ำ สดจากหน้า
 * ค่าไหนพิสูจน์ไม่ได้ ไม่เดา — ปล่อยไว้แล้วรายงาน
 */
import { setTimeout as sleep } from 'timers/promises'
const WRITE = process.argv.includes('--write')
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const q = async (s, ds = 'production') => {
  const r = await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(s)}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}`)
  return (await r.json()).result
}
const BED = n => n === 0 ? 'studio' : n === 1 ? '1bed' : n === 2 ? '2bed' : n === 3 ? '3bed' : '4bed'
const PSQM = { rent: [250, 3500], sale: [50000, 600000] }
const lower = u => { let s = String(u); try { s = decodeURIComponent(s) } catch {} return s.toLowerCase() }
const bedFromUrl = u => {
  const s = lower(u)
  if (/studio[-_ ]?(condo|apartment|for)/.test(s)) return 0
  const m = /(\d+)[-_ ]?(?:bedroom|bedrooms|bed|beds|br)\b/.exec(s)
  return m && +m[1] <= 8 ? +m[1] : null
}
async function readPage(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } })
      if (r.status === 404 || r.status === 410) return { gone: true }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const t = await r.text()
      const nums = s => [...t.matchAll(s)].map(m => +String(m[1] ?? m[2]).replace(/,/g, '')).filter(Number.isFinite)
      const price = nums(/([\d,]{7,})\s*(?:฿|THB|Baht)|(?:฿|THB)\s*([\d,]{7,})/gi)
      const bed = nums(/(\d+)\s*(?:Bedroom|Bed\b)/gi)
      // ค่าที่พบบ่อยที่สุดในหน้า = ค่าของประกาศนี้ (ตัวเลขอื่นเป็นของประกาศแนะนำข้าง ๆ)
      const mode = arr => { const c = new Map(); arr.forEach(v => c.set(v, (c.get(v) ?? 0) + 1))
        return [...c].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null }
      return { price: mode(price), bed: mode(bed) }
    } catch (e) { if (a === 2) return { err: String(e.message ?? e) }; await sleep(700 * (a + 1)) }
  }
}

const [src, prof] = await Promise.all([
  // schema แยก rentListings/saleListings แล้ว (2026-08-08) — ยุบกลับเป็น l เดียวพร้อมแปะ intent
  q(`*[_type=="unitSource"]{refCode,"l": [...coalesce(rentListings, [])[]{portal,url,price,"intent":"rent"},
      ...coalesce(saleListings, [])[]{portal,url,price,"intent":"sale"}]}`, 'internal'),
  q(`*[_type=="unitProfile" && status != "expired"]{_id,refCode,intent,bedType,sqm,priceTHB,pricePerSqm}`),
])
const lOf = new Map(src.map(s => [s.refCode, s.l ?? []]))

/* หาแถวที่น่าสงสัย: ราคา/ตร.ม. หลุดกรอบ หรือ ประเภทห้องไม่ตรง slug */
const suspects = []
for (const p of prof) {
  const ls = lOf.get(p.refCode) ?? []
  const beds = ls.map(x => bedFromUrl(x.url)).filter(v => v != null)
  const [lo, hi] = PSQM[p.intent] ?? [0, Infinity]
  const psqm = p.pricePerSqm ?? (p.priceTHB && p.sqm ? Math.round(p.priceTHB / p.sqm) : null)
  const priceBad = psqm != null && (psqm < lo || psqm > hi)
  const bedBad = beds.length > 0 && ![...new Set(beds.map(BED))].includes(p.bedType)
  if (priceBad || bedBad) suspects.push({ p, ls, beds, priceBad, bedBad, psqm })
}
console.log(`แถวน่าสงสัย ${suspects.length} (ราคาเพี้ยน ${suspects.filter(s=>s.priceBad).length} · ประเภทห้องไม่ตรง slug ${suspects.filter(s=>s.bedBad).length})\n`)

const fixes = [], unresolved = []
let done = 0
for (let i = 0; i < suspects.length; i += 4) {
  await Promise.all(suspects.slice(i, i + 4).map(async s => {
    const set = {}
    // ── ประเภทห้อง: slug คือพยานที่เชื่อได้ ไม่ต้องเปิดหน้า ──
    if (s.bedBad) {
      const want = BED([...new Set(s.beds)].sort((a, b) => a - b)[0])
      if (want !== s.p.bedType) set.bedType = want
    }
    // ── ราคา: ต้องอ่านจากหน้าจริง ห้ามตัดเลขท้ายเอาเอง ──
    if (s.priceBad) {
      const cand = s.ls.filter(x => x.url && x.intent === s.p.intent)
      let best = null
      for (const c of cand) {
        const r = await readPage(c.url)
        if (r?.price) { const v = r.price; if (best == null || v < best) best = v }
        if (best != null) break
      }
      const [lo, hi] = PSQM[s.p.intent] ?? [0, Infinity]
      if (best != null && s.p.sqm) {
        const ps = Math.round(best / s.p.sqm)
        if (ps >= lo && ps <= hi) { set.priceTHB = best; set.pricePerSqm = ps }
        else unresolved.push(`${s.p.refCode} ${s.p.intent} · หน้าให้ ${best.toLocaleString()} → ${ps.toLocaleString()}/ตร.ม. ยังหลุดกรอบ`)
      } else unresolved.push(`${s.p.refCode} ${s.p.intent} · อ่านราคาจากหน้าไม่ได้`)
    }
    if (Object.keys(set).length) fixes.push({ id: s.p._id, ref: s.p.refCode, intent: s.p.intent, was: { bedType: s.p.bedType, priceTHB: s.p.priceTHB }, set })
  }))
  done = Math.min(i + 4, suspects.length)
  process.stdout.write(`\r  ตรวจแล้ว ${done}/${suspects.length}`)
}
console.log('\n')
const bedFix = fixes.filter(f => f.set.bedType), priceFix = fixes.filter(f => f.set.priceTHB)
console.log(`แก้ประเภทห้อง ${bedFix.length} · แก้ราคา ${priceFix.length} · พิสูจน์ไม่ได้ ${unresolved.length}\n`)
priceFix.slice(0, 10).forEach(f => console.log(`  ${f.ref.padEnd(10)} ${f.intent.padEnd(5)} ${String(f.was.priceTHB).padStart(11)} → ${String(f.set.priceTHB).padStart(11)}`))
bedFix.slice(0, 10).forEach(f => console.log(`  ${f.ref.padEnd(10)} ${f.intent.padEnd(5)} ${f.was.bedType} → ${f.set.bedType}`))
if (unresolved.length) { console.log('\nพิสูจน์ไม่ได้ (ไม่แตะ รายงานไว้):'); unresolved.slice(0, 10).forEach(x => console.log(`  ${x}`)) }

if (!WRITE) console.log('\n(dry-run — เพิ่ม --write)')
for (let i = 0; WRITE && i < fixes.length; i += 100) {
  const r = await fetch(`${API}/data/mutate/production`, { method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations: fixes.slice(i, i + 100).map(f => ({ patch: { id: f.id, set: f.set } })) }) })
  if (!r.ok) { console.error(`mutate ${r.status}: ${await r.text()}`); process.exit(1) }
}
console.log(`\n✓ เขียนแล้ว ${fixes.length} profile`)

/* ── รอบสอง: แถวที่ไม่มีลิงก์ให้เปิด แต่เข้าแพตเทิร์น "ราคา+เลขห้องนอนต่อท้าย" ──
   ยืนยันแพตเทิร์นกับหน้าจริงมาแล้ว 4 ใบ (12,000,000+1 · 11,800,000+2 · 5,809,330+1 ·
   13,999,888+2) จึงซ่อมได้โดยไม่ต้องเดา แต่ต้องผ่านสองด่านพร้อมกัน:
     ก. เลขตัวท้ายต้องเท่ากับจำนวนห้องนอนของห้องนั้น
     ข. ราคาที่ตัดแล้วต้องทำให้ ฿/ตร.ม. กลับเข้ากรอบ
   ขาดข้อใดข้อหนึ่งคือไม่ซ่อม ปล่อยไว้แล้วรายงาน */
const BED_DIGIT = { studio: 0, '1bed': 1, '2bed': 2, '3bed': 3, '4bed': 4 }
const prof2 = await q(`*[_type=="unitProfile" && status != "expired"]{_id,refCode,intent,bedType,sqm,priceTHB,pricePerSqm}`)
const tailFix = [], tailSkip = []
for (const p of prof2) {
  const [lo, hi] = PSQM[p.intent] ?? [0, Infinity]
  const ps = p.pricePerSqm ?? (p.priceTHB && p.sqm ? Math.round(p.priceTHB / p.sqm) : null)
  if (ps == null || (ps >= lo && ps <= hi)) continue
  const s = String(p.priceTHB ?? '')
  const tail = +s.slice(-1), head = +s.slice(0, -1)
  const want = BED_DIGIT[p.bedType]
  const ps2 = p.sqm ? Math.round(head / p.sqm) : null
  if (want != null && tail === want && ps2 != null && ps2 >= lo && ps2 <= hi)
    tailFix.push({ id: p._id, ref: p.refCode, intent: p.intent, from: p.priceTHB, to: head, ps2 })
  else tailSkip.push(`${p.refCode} ${p.intent} · ${p.priceTHB?.toLocaleString()} · ${p.bedType} · ${ps?.toLocaleString()}/ตร.ม.`)
}
console.log(`\nรอบสอง — ซ่อมได้ ${tailFix.length} · ซ่อมไม่ได้ ${tailSkip.length}`)
tailFix.forEach(f => console.log(`  ${f.ref.padEnd(10)} ${f.intent.padEnd(5)} ${String(f.from).padStart(11)} → ${String(f.to).padStart(10)} (${f.ps2.toLocaleString()}/ตร.ม.)`))
if (tailSkip.length) { console.log('ซ่อมไม่ได้ — ไม่แตะ:'); tailSkip.forEach(x => console.log(`  ${x}`)) }
if (WRITE && tailFix.length) {
  const r = await fetch(`${API}/data/mutate/production`, { method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations: tailFix.map(f => ({ patch: { id: f.id, set: { priceTHB: f.to, pricePerSqm: f.ps2 } } })) }) })
  console.log(r.ok ? `✓ เขียนรอบสอง ${tailFix.length}` : `mutate ${r.status}: ${await r.text()}`)
}
