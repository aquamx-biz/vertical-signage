#!/usr/bin/env node
/**
 * collect-server.mjs — คิวงานเล็ก ๆ บนเครื่อง สำหรับสองพอร์ทัลที่ต้องยิงจากในเบราว์เซอร์
 *
 * Usage: node --env-file=.env tools/collect-server.mjs [--date YYYY-MM-DD] [--port 8899]
 *
 * ทำไมต้องมี: DDproperty ติด Cloudflare และ PropertyHub ตอบ 403 ถ้ายิงจาก Node
 * แต่ถ้า fetch จาก "ในหน้าเว็บ" ที่เปิดใน Chrome ของเจ้าของเครื่อง มันพก cookie ที่ผ่าน
 * ด่านมาแล้ว → ผ่านฉลุย (พิสูจน์แล้ว 2026-08-10: status 200, challenge false)
 *
 * ทำไมไม่ส่งผลกลับทาง MCP: 4,330 ใบ × ~100 ไบต์ = ครึ่งเมกะไบต์ที่ต้องวิ่งผ่านบทสนทนา
 * ให้หน้าเว็บ POST กลับมาที่นี่ตรง ๆ แทน (ตั้ง CORS ให้เอง) แล้วดูความคืบหน้าจาก /status
 * บทสนทนาเห็นแค่ตัวเลขสรุป ไม่ต้องขนข้อมูลดิบผ่าน
 *
 * เขียนต่อท้ายไฟล์ checkpoint ชุดเดียวกับ rescrape-listings.mjs — รวมเป็นรอบเดียวกัน
 */
import { createServer } from 'node:http'
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const DATE = argOf('--date') ?? new Date().toISOString().slice(0, 10)
const PORT = +(argOf('--port') ?? 8899)

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const q = async (query, ds) => {
  const r = await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}`)
  return (await r.json()).result
}

const BROWSER_ONLY = new Set(['DDproperty', 'PropertyHub'])
const [src, profs] = await Promise.all([
  q(`*[_type == "unitSource"]{ refCode, floorActual,
    "L": coalesce(rentListings[]{portal, url, "intent": "rent", posterType, posterName}, [])
       + coalesce(saleListings[]{portal, url, "intent": "sale", posterType, posterName}, []) }`, 'internal'),
  q(`*[_type == "unitProfile"]{ refCode, intent, projectName, bedType, sqm }`, 'production'),
])
const PROF = new Map(profs.map(p => [`${p.refCode}·${p.intent}`, p]))

mkdirSync(join(process.cwd(), '_rounds'), { recursive: true })
const progressPath = join(process.cwd(), '_rounds', `_progress-${DATE}.jsonl`)
const already = new Set()
if (existsSync(progressPath))
  for (const line of readFileSync(progressPath, 'utf8').split('\n'))
    if (line.trim()) { try { already.add(JSON.parse(line).url) } catch {} }

const seen = new Set()
const queue = []
for (const s of src) for (const l of s.L ?? []) {
  if (!l.url || seen.has(l.url) || already.has(l.url)) continue
  seen.add(l.url)
  if (!BROWSER_ONLY.has(l.portal)) continue
  const pr = PROF.get(`${s.refCode}·${l.intent}`)
  queue.push({ url: l.url, portal: l.portal, intent: l.intent, refCode: s.refCode,
    building: pr?.projectName ?? null, bedType: pr?.bedType ?? null, sqm: pr?.sqm ?? null,
    floor: s.floorActual ?? null, posterType: l.posterType ?? null, posterName: l.posterName ?? null })
}

let handed = 0
const stat = { ok: 0, gone: 0, noPrice: 0, err: 0 }
const started = Date.now()

/* หน้าเว็บที่ยิงกลับมาเป็น https ส่วนตัวนี้เป็น http://localhost — Chrome ถือว่าเป็นการ
   ข้ามเข้ามาใน "private network" และจะบล็อกทิ้งเงียบ ๆ (fetch ค้างจนหมดเวลา ไม่มี error บอก)
   จนกว่าจะตอบ preflight ด้วย Access-Control-Allow-Private-Network: true */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8',
}
const body = req => new Promise(res => { let b = ''; req.on('data', c => b += c); req.on('end', () => res(b)) })

createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end()

  if (u.pathname === '/next') {
    /* ต้องแยกตามพอร์ทัล — หน้าเว็บอ่านผลของ fetch ได้เฉพาะ origin เดียวกับตัวเอง
       แท็บที่เปิด ddproperty ดึง propertyhub ไม่ได้ (CORS) จึงให้แต่ละแท็บขอเฉพาะของตัวเอง */
    const n = Math.min(+(u.searchParams.get('n') ?? 25), 100)
    const want = u.searchParams.get('portal')
    const batch = []
    for (const j of queue) {
      if (batch.length >= n) break
      if (j.taken) continue
      if (want && j.portal !== want) continue
      j.taken = true; batch.push(j); handed++
    }
    return res.writeHead(200, CORS).end(JSON.stringify(
      batch.map(({ taken, ...rest }) => rest)))
  }
  if (u.pathname === '/done' && req.method === 'POST') {
    let rows = []
    try { rows = JSON.parse(await body(req)) } catch {}
    for (const r of rows) {
      if (r.error) stat.err++
      else if (r.gone) stat.gone++
      else if (r.price == null) { r.noPrice = true; stat.noPrice++ }
      else stat.ok++
      appendFileSync(progressPath, JSON.stringify({ ...r, at: DATE }) + '\n')
    }
    return res.writeHead(200, CORS).end(JSON.stringify({ got: rows.length }))
  }
  if (u.pathname === '/status') {
    const done = stat.ok + stat.gone + stat.noPrice + stat.err
    const mins = (Date.now() - started) / 60000
    return res.writeHead(200, CORS).end(JSON.stringify({
      total: queue.length, handed, done, ...stat,
      rate: done ? +(done / Math.max(mins, 0.01)).toFixed(1) : 0,
      etaMin: done ? Math.round((queue.length - done) / Math.max(done / Math.max(mins, 0.01), 0.1)) : null,
    }))
  }
  res.writeHead(404, CORS).end('{}')
}).listen(PORT)

const byPortal = {}
for (const j of queue) byPortal[j.portal] = (byPortal[j.portal] ?? 0) + 1
console.log(`คิวพร้อม ${queue.length} ใบ — ${Object.entries(byPortal).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`ข้ามที่ทำไปแล้ว ${already.size} ใบ · ฟังอยู่ที่ http://localhost:${PORT}`)
console.log(`เขียนต่อท้าย ${progressPath}`)
