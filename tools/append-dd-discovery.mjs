#!/usr/bin/env node
/**
 * append-dd-discovery.mjs — เติมผล detail DDproperty (จากเบราว์เซอร์) เข้า discovered-<date>.json
 * แบบ append เท่านั้น — ไฟล์นี้ถูกหลายสคริปต์ผลัดกันเติม (assemble → dotp → pscout → dd)
 * ใครก็ห้ามเขียนทับทั้งไฟล์หลังจุดนี้ ไม่งั้นของเจ้าก่อนหน้าหาย
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const det = JSON.parse(readFileSync(`C:/Users/Lenovo/Downloads/aquamx-dddet-${DATE}.json`, 'utf8'))
const BLD = new Map(JSON.parse(readFileSync('_rounds/_dd-new-ids.json', 'utf8')).map(x => [String(x.id), x]))

const path = `_rounds/discovered-${DATE}.json`
const prev = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
const prevUrls = new Set(prev.map(x => x.url).filter(Boolean))

const stat = { ok: 0, gone: 0, noPrice: 0, err: 0, mismatch: 0, dup: 0, incomplete: 0 }
const add = []
for (const r of det) {
  if (r.gone) { stat.gone++; continue }
  if (r.noPrice) { stat.noPrice++; continue }
  if (r.error) { stat.err++; continue }
  const w = BLD.get(String(r.id))
  if (!w) { stat.mismatch++; continue }
  /* intent จากหน้าจริงชนะ worklist (freetext ค้นเจอใบข้ามฝั่งได้) · ไม่มี intent = ทิ้ง ไม่เดา */
  const intent = r.intent ?? w.intent
  if (!intent) { stat.incomplete++; continue }
  if (r.price == null || r.bed == null || r.sqm == null) { stat.incomplete++; continue }
  if (r.url && prevUrls.has(r.url)) { stat.dup++; continue }
  add.push({ building: w.building, intent, bed: r.bed, sqm: r.sqm, floor: null,
    price: r.price, portal: 'DDproperty', url: r.url ?? null,
    posterType: r.posterName ? 'agent' : 'unknown', posterName: r.posterName ?? null,
    postCreatedAt: r.postCreatedAt ?? null, postUpdatedAt: null })
  if (r.url) prevUrls.add(r.url)
  stat.ok++
}
writeFileSync(path, JSON.stringify([...prev, ...add], null, 1))
console.log(`DD: เพิ่ม ${stat.ok} · ตาย ${stat.gone} · ไม่มีราคา ${stat.noPrice} · error ${stat.err} · ไม่ครบ ${stat.incomplete} · ซ้ำ ${stat.dup}`)
console.log(`รวมในไฟล์: ${prev.length + add.length}`)
