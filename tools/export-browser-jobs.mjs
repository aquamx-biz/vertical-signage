#!/usr/bin/env node
/**
 * export-browser-jobs.mjs — เตรียมรายการงานให้ browser loops ของรอบ (DD/PH/FW)
 * เขียน _rounds/_browser-jobs-<date>.json : { DDproperty: [id...], PropertyHub: [id...],
 *   FazWaz: [{id,intent,url}...] } — ดึงจาก unitSource (internal)
 * ไม่มีข้อมูล contact ในไฟล์นี้ — แค่ id/url ของประกาศ
 */
const DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10)
import { writeFileSync, mkdirSync } from 'node:fs'

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const q = async (query, ds) => (await (await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).result

const src = await q(`*[_type == "unitSource"]{
  "L": coalesce(rentListings[]{portal, url, "intent": "rent"}, [])
     + coalesce(saleListings[]{portal, url, "intent": "sale"}, []) }`, 'internal')

const idOf = u => (String(u).match(/(\d{4,})\/?(?:[?#].*)?$/) ?? [])[1] ?? null
const out = { DDproperty: [], PropertyHub: [], FazWaz: [] }
const seen = new Set()
for (const s of src) for (const l of s.L ?? []) {
  if (!l.url) continue
  const key = `${l.portal}·${l.url}·${l.intent}`
  if (seen.has(key)) continue
  seen.add(key)
  if (l.portal === 'DDproperty') { const id = idOf(l.url); if (id) out.DDproperty.push(id) }
  else if (l.portal === 'PropertyHub') { const id = idOf(l.url); if (id) out.PropertyHub.push(id) }
  else if (l.portal === 'FazWaz') { const id = idOf(l.url); if (id) out.FazWaz.push({ id, intent: l.intent, url: l.url }) }
}
out.DDproperty = [...new Set(out.DDproperty)]
out.PropertyHub = [...new Set(out.PropertyHub)]
mkdirSync('_rounds', { recursive: true })
writeFileSync(`_rounds/_browser-jobs-${DATE}.json`, JSON.stringify(out))
console.log(`browser jobs: DD ${out.DDproperty.length} · PH ${out.PropertyHub.length} · FW ${out.FazWaz.length}`)
