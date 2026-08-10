#!/usr/bin/env node
/**
 * patch-dates.mjs — เติมวันที่ (โพสต์/อัพเดท/จะว่าง) จากรอบเก็บวันที่ ลง checkpoint เดิม
 *
 * Usage: node --env-file=.env tools/patch-dates.mjs <ไฟล์ dates.json> [--date YYYY-MM-DD]
 *
 * ต่างจาก merge-browser-round: ไม่สร้างแถวใหม่ — หยิบแถวเดิมของ url นั้นจาก checkpoint
 * มาเติมเฉพาะ field วันที่แล้ว append (ผู้อ่านใช้แถวหลังชนะ) ราคา/สถานะเดิมไม่ถูกแตะ
 * เว้นแต่รอบวันที่เห็นราคาใหม่กว่า — อัพเดทให้ด้วยเพราะสดกว่าเสมอ
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const FILE = args.find(a => !a.startsWith('--'))
const DATE = (args.indexOf('--date') >= 0 ? args[args.indexOf('--date') + 1] : null) ?? new Date().toISOString().slice(0, 10)
if (!FILE) { console.error('ต้องระบุไฟล์'); process.exit(1) }

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const q = async (query, ds) => (await (await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).result

const src = await q(`*[_type == "unitSource"]{ refCode,
  "L": coalesce(rentListings[]{portal, url, "intent": "rent"}, [])
     + coalesce(saleListings[]{portal, url, "intent": "sale"}, []) }`, 'internal')
const idOf = u => (String(u).match(/(\d{4,})\/?(?:[?#].*)?$/) ?? [])[1] ?? null
const URLBY = new Map()          // portal·id·intent → url
for (const s of src) for (const l of s.L ?? []) {
  const id = idOf(l.url); if (!id) continue
  URLBY.set(`${l.portal}·${id}·${l.intent}`, l.url)
}

const progressPath = join(process.cwd(), '_rounds', `_progress-${DATE}.jsonl`)
const CUR = new Map()
for (const line of readFileSync(progressPath, 'utf8').split('\n'))
  if (line.trim()) { try { const r = JSON.parse(line); CUR.set(r.url, r) } catch {} }

const rows = JSON.parse(readFileSync(FILE, 'utf8'))
let patched = 0, noBase = 0, stats = { upd: 0, posted: 0, avail: 0 }
for (const r of rows) {
  if (r.error || r.gone) continue
  const intents = r.intent ? [r.intent] : ['rent', 'sale']
  let url = null
  for (const p of ['FazWaz', 'DDproperty', 'PropertyHub']) for (const it of intents)
    url ??= URLBY.get(`${p}·${r.id}·${it}`)
  const base = url ? CUR.get(url) : null
  if (!base || base.gone) { noBase++; continue }
  const rec = { ...base, at: DATE }
  if (r.postCreatedAt && !rec.postCreatedAt) { rec.postCreatedAt = r.postCreatedAt; stats.posted++ }
  if (r.postUpdatedAt) { rec.postUpdatedAt = r.postUpdatedAt; stats.upd++ }
  if (r.availableFrom) { rec.availableFrom = r.availableFrom; stats.avail++ }
  if (r.price != null) rec.price = r.price          // รอบวันที่สดกว่า — ราคาตามไปด้วย
  appendFileSync(progressPath, JSON.stringify(rec) + '\n')
  CUR.set(url, rec); patched++
}
console.log(`เติมวันที่ ${patched} แถว — วันโพสต์ +${stats.posted} · วันอัพเดท +${stats.upd} · วันจะว่าง +${stats.avail}`)
if (noBase) console.log(`  ข้าม ${noBase} ใบ (ไม่มีแถวฐานใน checkpoint หรือถูกถอดไปแล้ว)`)
