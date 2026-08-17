#!/usr/bin/env node
/**
 * merge-round-full.mjs — รวมสองครึ่งของรอบเป็นไฟล์เดียวก่อน ingest
 *
 * Usage: node tools/merge-round-full.mjs --date YYYY-MM-DD
 *   อ่าน:  _rounds/round-<date>.json      (ครึ่ง re-scrape — เปิดลิงก์เดิมซ้ำ)
 *          _rounds/discovered-<date>.json (ครึ่ง discovery — ประกาศเข้าใหม่)
 *   เขียน: _rounds/round-<date>-full.json
 *
 * ทำไมต้องรวมก่อน (เกือบพลาดจริง 2026-08-10):
 *   ingest ตัดสิน "หายจากตลาด → expired" จาก *ห้องที่ไม่อยู่ในไฟล์รอบ* — ถ้า ingest ไฟล์
 *   discovery เดี่ยว ๆ ห้อง 2,400+ ที่เพิ่งยืนยันด้วยครึ่งแรกว่ายังอยู่ จะโดนประหารทั้งแผง
 *   ในคำสั่งเดียว · กันซ้ำด้วย url: ครึ่ง re-scrape ชนะเสมอ (มี refCode ผูกห้องเดิมไว้แล้ว)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const DATE = argOf('--date') ?? new Date().toISOString().slice(0, 10)

const load = p => existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
const round = load(`_rounds/round-${DATE}.json`)
const disc = load(`_rounds/discovered-${DATE}.json`) ?? []

if (!round) { console.error(`ไม่มี _rounds/round-${DATE}.json — ครึ่ง re-scrape ยังไม่เสร็จ หยุด`); process.exit(1) }

const out = [...round]
const seen = new Set(round.map(r => r.url).filter(Boolean))
let dup = 0
for (const r of disc) {
  if (r.url && seen.has(r.url)) { dup++; continue }
  if (r.url) seen.add(r.url)
  out.push(r)
}

writeFileSync(`_rounds/round-${DATE}-full.json`, JSON.stringify(out, null, 1))
const by = {}
for (const r of out) by[r.portal] = (by[r.portal] ?? 0) + 1
console.log(`re-scrape ${round.length} + discovery ${disc.length} (ซ้ำกับครึ่งแรก ${dup}) = ${out.length} แถว`)
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n'))
console.log(`เขียน _rounds/round-${DATE}-full.json`)
