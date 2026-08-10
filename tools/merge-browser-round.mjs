#!/usr/bin/env node
/**
 * merge-browser-round.mjs — รวมผลที่เก็บจากในเบราว์เซอร์เข้ากับ checkpoint ของรอบ
 *
 * Usage: node --env-file=.env tools/merge-browser-round.mjs <ไฟล์.json> [--date YYYY-MM-DD]
 *
 * หน้าเว็บของพอร์ทัลที่ยิงตรงไม่ได้ (Cloudflare) รันลูปเก็บผลในตัวเองแล้ว "ดาวน์โหลดเป็นไฟล์"
 * ลง Downloads — วิธีเดียวที่ผ่าน เพราะ POST กลับ localhost โดน mixed-content บล็อก
 * และการส่งผลผ่านช่องสนทนาถูกตัดที่ ~100 แถว
 *
 * ไฟล์เก็บแค่ id + ราคา + วันที่ ส่วน building/bed/sqm/floor ต่อกลับจาก unitSource ที่นี่
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { availableFromIn } from './avail-date.mjs'

const args = process.argv.slice(2)
const FILE = args.find(a => !a.startsWith('--'))
const DATE = (args.indexOf('--date') >= 0 ? args[args.indexOf('--date') + 1] : null) ?? new Date().toISOString().slice(0, 10)
if (!FILE) { console.error('ต้องระบุไฟล์'); process.exit(1) }
/* --replace = เขียนทับของเดิมโดย append (ผู้อ่านทุกตัวใช้แถวหลังชนะ) — ใช้ตอนรอบก่อน
   merge ผิดแล้วต้องซ่อม โดยไม่ต้องผ่าตัดไฟล์ checkpoint */
const REPLACE = args.includes('--replace')

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
/* id สั้นสุดที่พบจริงคือ 4 หลัก (FazWaz u1505) — \d{6,} ทำ 33 ใบหลุดการจับคู่ */
const idOf = u => (String(u).match(/(\d{4,})\/?(?:[?#].*)?$/) ?? [])[1] ?? null

/* index จาก id → งานเดิม · FazWaz ใช้ id เดียวกันทั้งประกาศเช่าและขายของห้องเดียวกัน
   (u1620566 มีทั้งสองฝั่ง) — คีย์แค่ portal+id ทำให้ราคาเช่าถูกบันทึกใส่ฝั่งขายได้
   จึงต้องคีย์ด้วย portal·id·intent เสมอ */
const JOB = new Map()
for (const s of src) for (const l of s.L ?? []) {
  const id = idOf(l.url); if (!id) continue
  const pr = PROF.get(`${s.refCode}·${l.intent}`)
  JOB.set(`${l.portal}·${id}·${l.intent}`, { url: l.url, portal: l.portal, intent: l.intent, refCode: s.refCode,
    building: pr?.projectName ?? null, bedType: pr?.bedType ?? null, sqm: pr?.sqm ?? null,
    floor: s.floorActual ?? null, posterType: l.posterType ?? null, posterName: l.posterName ?? null })
}

const rows = JSON.parse(readFileSync(FILE, 'utf8'))
const progressPath = join(process.cwd(), '_rounds', `_progress-${DATE}.jsonl`)
/* กันซ้ำเฉพาะแถวที่ "สำเร็จหรือถูกถอดจริง" — แถว noPrice/error คือความล้มเหลวชั่วคราว
   (FazWaz โดน Cloudflare ฝั่ง Node ทั้งเจ้า พันกว่าใบ) ผลจากเบราว์เซอร์ต้องทับมันได้
   การ "ทับ" คือ append แถวใหม่ต่อท้าย — ผู้อ่าน checkpoint ทุกตัวใช้ Map คีย์ url
   แถวหลังชนะอยู่แล้ว จึงไม่ต้องลบแถวเก่า */
const seen = new Set()
if (existsSync(progressPath))
  for (const line of readFileSync(progressPath, 'utf8').split('\n'))
    if (line.trim()) { try {
      const r = JSON.parse(line)
      if (!r.noPrice && !r.error) seen.add(r.url)
    } catch {} }

let merged = 0, dup = 0, unmatched = 0
const stat = { ok: 0, gone: 0, noPrice: 0, err: 0 }
for (const r of rows) {
  /* ผลที่มี intent (FazWaz) ต้องจับคู่ด้วย intent ของตัวเอง · ผลที่ไม่มี (DD/PH —
     id หนึ่งคือประกาศเดียวฝั่งเดียว) ลองทั้งสองฝั่ง */
  const intents = r.intent ? [r.intent] : ['rent', 'sale']
  let job = null
  for (const p of ['DDproperty', 'PropertyHub', 'FazWaz']) for (const it of intents)
    job ??= JOB.get(`${p}·${r.id}·${it}`)
  if (!job) { unmatched++; continue }
  if (!REPLACE && seen.has(job.url)) { dup++; continue }
  const rec = { ...job, at: DATE }
  if (r.gone) { rec.gone = r.gone; stat.gone++ }
  else if (r.error) { rec.error = r.error; stat.err++ }
  else if (r.price == null) { rec.noPrice = true; stat.noPrice++ }
  else {
    rec.price = r.price
    rec.postCreatedAt = r.postCreatedAt ?? null
    rec.postUpdatedAt = r.postUpdatedAt ?? null
    /* browser loop เก็บข้อความดิบ (availNote) — แปลงเป็นวันที่ที่นี่ด้วยตัวอ่านตัวเดียว
       กับฝั่ง Node · แปลงไม่ได้ = null ห้ามเดา */
    rec.availableFrom = r.availableFrom ?? (r.availNote ? availableFromIn(r.availNote) : null)
    stat.ok++
  }
  appendFileSync(progressPath, JSON.stringify(rec) + '\n')
  seen.add(job.url); merged++
}
console.log(`รวมเข้ารอบ ${merged} ใบ — ยังอยู่ ${stat.ok} · ถูกถอด ${stat.gone} · แกะไม่ได้ ${stat.noPrice} · error ${stat.err}`)
if (dup) console.log(`  ข้ามที่มีอยู่แล้ว ${dup} ใบ`)
if (unmatched) console.log(`  ⚠ จับคู่ไม่ได้ ${unmatched} ใบ (id ไม่ตรงกับลิงก์ใดใน unitSource)`)
