#!/usr/bin/env node
/**
 * dotp-details.mjs — เปิดหน้า detail ของ DotP discovery ทุกใบ เอา วันที่/ราคาจริง/ยืนยันมีชีวิต
 * ใบที่ผ่านถูกเขียนทับใน discovered-<date>.json (ใบ DotP เดิมจาก API ถูกแทนที่ทั้งชุด)
 * URL = แม่แบบ <bed>-bedroom-condo-for-<intent>-in-<ตึก-ย่าน>-bangkok_<uuid> (พิสูจน์ 6/6 + เก่า 6/6)
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
const DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8' }
const num = v => { const n = +String(v ?? '').replace(/[^\d.]/g, ''); return Number.isFinite(n) && n > 0 ? n : null }
const lds = h => [...h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(m => { try { return JSON.parse(m[1].trim()) } catch { return null } }).filter(Boolean)
const deep = (o, ks) => { const st = [o]; while (st.length) { const x = st.pop(); if (!x || typeof x !== 'object') continue
  for (const k of ks) if (x[k] != null && typeof x[k] !== 'object') return x[k]
  for (const v of Object.values(x)) if (v && typeof v === 'object') st.push(v) } return null }

// location slug ต่อตึก จาก URL DotP ที่รู้จัก (ใน discovery file มีตึกกำกับอยู่แล้ว)
const LOC = { '39 by Sansiri': '39-by-sansiri-khlong-tan-nuea', 'HQ by Sansiri': 'hq-by-sansiri-khlong-tan-nuea',
  'Ideo Morph 38': 'ideo-morph-38-phra-khanong', 'The Lumpini 24': 'the-lumpini-24-khlong-tan',
  'Mahogany Tower': 'mahogany-tower-khlong-toei', 'Noble BE19': 'noble-be19-khlong-toei-nuea',
  'Park 24': 'park-24-khlong-tan', 'The Room Sukhumvit 21': 'the-room-sukhumvit-21-khlong-toei-nuea',
  'Rhythm Sukhumvit 36-38': 'rhythm-sukhumvit-36-38-khlong-tan' }

const path = `_rounds/discovered-${DATE}.json`
const all = JSON.parse(readFileSync(path, 'utf8'))
const dp = all.filter(r => r.portal === 'DotProperty')
const rest = all.filter(r => r.portal !== 'DotProperty')
console.log(`DotP รอ detail ${dp.length} ใบ`)

const out = [], stat = { ok: 0, dead: 0, err: 0 }
let n = 0
async function worker(list) {
  for (const r of list) {
    const uuid = (r.url.match(/_([a-z0-9-]+)$/) ?? [])[1]
    const bedSeg = r.bed === 0 ? 'studio-condo' : `${r.bed}-bedroom-condo`
    const loc = LOC[r.building]
    if (!uuid || !loc) { stat.err++; continue }
    const url = `https://www.dotproperty.co.th/en/ads/${bedSeg}-for-${r.intent}-in-${loc}-bangkok_${uuid}`
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000)
      const res = await fetch(url, { headers: UA, redirect: 'follow', signal: c.signal })
      clearTimeout(t)
      const h = await res.text()
      if (res.status !== 200) { stat.dead++; continue }
      const L = lds(h)
      const price = deep(L, ['price']) != null ? num(deep(L, ['price'])) : null
      if (!price) { stat.dead++; continue }
      out.push({ ...r, url, price,
        postCreatedAt: (v => v ? String(v).slice(0, 10) : r.postCreatedAt)(deep(L, ['datePosted', 'datePublished'])),
        postUpdatedAt: (v => v ? String(v).slice(0, 10) : null)(deep(L, ['dateModified'])) })
      stat.ok++
    } catch { stat.err++ }
    if (++n % 200 === 0) console.log(`  ${n}/${dp.length} · อยู่ ${stat.ok} · ตาย ${stat.dead} · err ${stat.err}`)
    await new Promise(x => setTimeout(x, 250))
  }
}
const CONC = 6
const lanes = Array.from({ length: CONC }, (_, i) => dp.filter((_, k) => k % CONC === i))
await Promise.all(lanes.map(worker))
writeFileSync(path, JSON.stringify([...rest, ...out], null, 1))
console.log(`\nสรุป DotP: มีชีวิต ${stat.ok} · ตาย/ไม่มีราคา ${stat.dead} · error ${stat.err}`)
console.log(`เขียน ${path} (รวม ${rest.length + out.length} แถว)`)
