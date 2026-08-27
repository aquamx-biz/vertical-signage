#!/usr/bin/env node
/**
 * verify-building.mjs — ยาม "ตึกถูกไหม" สำหรับ portal ที่ค้นแบบ keyword/ย่าน
 *
 * ทำไมต้องมี: ZmyHome (และ portal ค้นด้วยคำ/ย่านอื่น) ตอน discovery จะติดป้าย
 * ชื่อตึกตาม "คำที่ค้น" ไม่ได้ตรวจว่าประกาศนั้นเป็นตึกนั้นจริง — ผลค้นแบบย่านจึงลาก
 * ตึกข้างเคียงติดมาด้วย แล้วถูก filed ผิดตึกยกชุด (ตรวจ 2026-08-27: ZmyHome 68/75 ผิดตึก
 * เช่น The Esse Asoke ถูก filed เป็น Noble BE19) — ดู memory zmyhome-wrong-building
 *
 * วิธีตรวจที่ได้ผล: หน้า ZmyHome ดึงฝั่ง server ได้ (200) · ชื่อตึกจริงอยู่ใน og:title +
 * og:description (บางใบมี "ชื่อโครงการ : X" ใน JSON-LD) → เทียบกับ alias ของตึกที่ card อ้าง
 *   ตรง            → เก็บ (verified)
 *   og:title บอกตึกอื่นชัด ไม่มี alias ที่คาด → ทิ้ง (ผิดตึก) เขียนลง <out>.rejects.json
 *   อ่านหน้าไม่ได้ / ไม่มีชื่อ → เก็บไว้ แต่ติดธง _buildingUnverified (ไม่ทิ้ง กันฆ่าใบดีพลาด)
 *
 * portal ที่ค้นด้วย project-ID (PropertyHub/DDproperty/DotProperty/FazWaz-known-id)
 * เชื่อถือได้อยู่แล้ว — ผ่านเลย ไม่แตะ
 *
 * Usage:
 *   node tools/verify-building.mjs --in <round.json> [--out <clean.json>] [--portals ZmyHome,Hipflat] [--conc 6]
 *   ไม่ใส่ --out = ตรวจอย่างเดียว (report) ไม่เขียนไฟล์ · ใส่ --out = เขียนไฟล์ที่กรองแล้ว + <out>.rejects.json
 */
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const IN = argOf('--in')
const OUT = argOf('--out')
const CONC = +(argOf('--conc') ?? 6)
const PORTALS = new Set((argOf('--portals') ?? 'ZmyHome').split(',').map(s => s.trim()).filter(Boolean))
if (!IN) { console.error('ต้องมี --in <round.json>'); process.exit(1) }

// alias ของแต่ละตึก (substring ตัวพิมพ์เล็ก) — เจอสักตัวใน og:title/desc = ยืนยันตึกถูก
// ครอบทั้งอังกฤษ/ไทย/รูปย่อ · คีย์ = ชื่อตึกแบบที่ card.building ใช้
const ALIASES = {
  '39 by Sansiri': ['39 by sansiri', '39 บาย แสนสิริ', '39 บายแสนสิริ', 'สามสิบเก้า บาย'],
  'HQ by Sansiri': ['hq by sansiri', 'เอชคิว บาย', 'เอช คิว บาย', 'hq thonglor', 'เอชคิว ทองหล่อ', 'เอชคิว (hq'],
  'Ideo Morph 38': ['ideo morph 38', 'ไอดีโอ มอร์ฟ 38', 'ไอดีโอมอร์ฟ 38', 'ideo morph38'],
  'The Lumpini 24': ['the lumpini 24', 'เดอะ ลุมพินี 24', 'ลุมพินี 24', 'lumpini 24', 'ลุมพินี ทเวนตี้โฟร์', 'ลุมพินี ทเวนตี้ โฟร์'],
  'Noble BE19': ['noble be19', 'noble be 19', 'โนเบิล บีอี19', 'โนเบิล บี19', 'โนเบิล บี 19', 'โนเบิล บีอี 19', 'be19', 'โนเบิล บีอี'],
  'Park 24': ['park 24', 'พาร์ค 24', 'พาร์ค24', 'park24', 'park origin phrom'],
  'The Room Sukhumvit 21': ['the room sukhumvit 21', 'the room sukhumvit21', 'เดอะ รูม สุขุมวิท 21', 'เดอะรูม สุขุมวิท 21', 'รูม สุขุมวิท 21', 'the room 21'],
  'Rhythm Sukhumvit 36-38': ['rhythm sukhumvit 36-38', 'rhythm sukhumvit 36', 'rhythm sukhumvit38', 'rhythm sukhumvit 38', 'ริทึ่ม สุขุมวิท 36', 'ริทึม สุขุมวิท 36', 'rhythm 36-38'],
  'Mahogany Tower': ['mahogany tower', 'มะฮอกกานี'],
}

const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ')
const attr = (t, re) => { const m = t.match(re); return m ? m[1] : '' }
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36' }

async function pageBuildingText(url) {
  try {
    const r = await fetch(url, { headers: UA })
    if (!r.ok) return { err: 'http ' + r.status }
    const t = await r.text()
    const ogt = attr(t, /og:title[^>]+content="([^"]+)"/i)
    const ogd = attr(t, /og:description[^>]+content="([^"]+)"/i)
    let desc = ''
    const ld = (t.match(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i) || [])[1]
    if (ld) { try { for (const o of [].concat(JSON.parse(ld))) { const it = o.itemOffered || o; if (it && it.description) desc = it.description } } catch {} }
    return { ogt, text: norm(ogt + ' \n ' + ogd + ' \n ' + desc) }
  } catch (e) { return { err: String(e).slice(0, 80) } }
}

function verdictFor(card, page) {
  const aliases = ALIASES[card.building] || []
  if (page.err) return { v: 'unverified', why: page.err }
  const hay = page.text || ''
  if (aliases.some(a => hay.includes(a))) return { v: 'ok' }
  const hasName = page.ogt && norm(page.ogt) !== 'zmyhome' && page.ogt.length > 3
  if (hasName) return { v: 'wrong', why: page.ogt.slice(0, 90) }
  return { v: 'unverified', why: 'no building name on page' }
}

const cards = JSON.parse(readFileSync(IN, 'utf8'))
const targets = cards.map((c, i) => ({ c, i })).filter(x => x.c && PORTALS.has(x.c.portal) && x.c.url)
if (!targets.length) { console.log(`ไม่มี card ของ portal ${[...PORTALS].join('/')} ในไฟล์นี้ — ไม่ต้องตรวจ`); process.exit(0) }
console.log(`ตรวจ ${targets.length} card (${[...PORTALS].join('/')}) จากทั้งหมด ${cards.length} · conc ${CONC}`)

const drops = new Set(), rejects = []
let done = 0
async function worker(queue) {
  for (;;) {
    const t = queue.shift(); if (!t) return
    if (ALIASES[t.c.building] === undefined) {   // ตึกที่ไม่มี alias — เตือนแล้วปล่อยผ่าน (กันฆ่าพลาด)
      console.warn(`\n⚠ ไม่มี alias สำหรับตึก "${t.c.building}" — ข้ามการตรวจใบนี้`)
    } else {
      const page = await pageBuildingText(t.c.url)
      const r = verdictFor(t.c, page)
      if (r.v === 'wrong') { drops.add(t.i); rejects.push({ building: t.c.building, url: t.c.url, actual: r.why, bed: t.c.bed, sqm: t.c.sqm }) }
      else if (r.v === 'unverified') t.c._buildingUnverified = r.why
    }
    process.stderr.write(`\r${++done}/${targets.length}`)
  }
}
const queue = targets.slice()
await Promise.all(Array.from({ length: CONC }, () => worker(queue)))
process.stderr.write('\n')

const kept = cards.filter((_, i) => !drops.has(i))
const byBld = {}
for (const r of rejects) byBld[r.building] = (byBld[r.building] ?? 0) + 1
console.log(`\nผิดตึก (ทิ้ง): ${rejects.length} ใบ`)
for (const [b, n] of Object.entries(byBld).sort((a, b) => b[1] - a[1])) console.log(`  ${b}: ${n}`)
const unver = kept.filter(c => c && c._buildingUnverified).length
console.log(`ยืนยันตึกไม่ได้ (เก็บไว้ ติดธง): ${unver} ใบ`)
console.log(`เหลือเข้า ingest: ${kept.length} / ${cards.length}`)

if (OUT) {
  writeFileSync(OUT, JSON.stringify(kept, null, 1))
  writeFileSync(OUT.replace(/\.json$/, '') + '.rejects.json', JSON.stringify(rejects, null, 1))
  console.log(`\nเขียนแล้ว: ${OUT} · ${OUT.replace(/\.json$/, '')}.rejects.json`)
} else {
  console.log(`\n(ไม่ใส่ --out — ตรวจอย่างเดียว ยังไม่เขียนไฟล์)`)
  if (rejects.length) console.log('\nตัวอย่างที่ผิดตึก:\n' + rejects.slice(0, 12).map(r => `  [${r.building}]  →  ${r.actual}`).join('\n'))
}
