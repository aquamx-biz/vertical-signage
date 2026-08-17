#!/usr/bin/env node
/**
 * rescrape-listings.mjs — รอบ re-scrape: เปิด "ลิงก์ที่เก็บไว้แล้ว" ซ้ำ ไม่ใช่ค้นหาใหม่
 *
 * Usage: node --env-file=.env tools/rescrape-listings.mjs [--portal <ชื่อ>] [--limit N] [--date YYYY-MM-DD]
 *   ผลลัพธ์: _rounds/round-<date>.json (รูปแบบที่ ingest-units.mjs --round อ่านได้)
 *   ระหว่างทางเขียน _rounds/_progress-<date>.jsonl ทุกใบ → รันซ้ำได้ ไม่เริ่มใหม่จากศูนย์
 *
 * ทำไมไม่ค้นหาใหม่ (กติกาจากเจ้าของงาน 2026-08-10):
 *   การค้นคำว่า "39 by Sansiri" ใหม่ทุกสัปดาห์ = ได้ประกาศใบเดิมกลับมาในคีย์ใหม่ ห้องซ้ำงอกทุกรอบ
 *   unitSource เก็บ URL ของทุกประกาศไว้แล้ว (2,333 ห้อง → 10,944 ลิงก์) รอบหนึ่งคือไล่เปิดลิงก์พวกนี้
 *   เพื่อดูว่า (1) ยังอยู่มั้ย (2) ราคาขยับมั้ย เท่านั้น
 *
 * อะไรมาจากหน้าเว็บ อะไรใช้ของเดิม:
 *   จากหน้าเว็บ — ราคา · ยังอยู่/ถูกถอด · วันที่โพสต์ · ผู้โพสต์
 *   ของเดิม     — building · bed · sqm · floor
 * เพราะสามอย่างหลังทีมเคย cleansing มาแล้ว และการแกะใหม่ทุกสัปดาห์คือต้นตอของขยะรอบก่อน
 * (ชั้นสระว่ายน้ำของ FazWaz · ราคาที่ต่อท้ายด้วยจำนวนห้องนอนของ DotProperty) ค่าที่แกะได้จากหน้า
 * ถูกเก็บไว้ใน pageSeen เพื่อ "เทียบให้ดู" ไม่ใช่เพื่อเขียนทับเงียบ ๆ
 */
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { availableFromIn } from './avail-date.mjs'

const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const ONLY = argOf('--portal')
const LIMIT = argOf('--limit') ? +argOf('--limit') : Infinity
const DATE = argOf('--date') ?? new Date().toISOString().slice(0, 10)

const CONC = 5              // ยิงพร้อมกันกี่เส้น — สุภาพพอที่จะไม่โดนแบน
const GAP_MS = 250          // เว้นจังหวะระหว่างใบในเส้นเดียวกัน
const TIMEOUT_MS = 20000
/* Accept ต้องเป็นสตริงเต็มแบบที่เบราว์เซอร์จริงส่ง — ของสั้น ๆ ("text/html,application/xhtml+xml")
   ทำให้ FazWaz ตอบ 403 ทั้งเจ้า (736 ใบในรอบแรก) ทั้งที่ประกาศยังอยู่ครบ ไม่ใช่การจำกัดอัตรา
   ยิงเร็ว 5 เส้นพร้อมกันผ่านฉลุย 24/24 เมื่อ header ถูก */
const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Upgrade-Insecure-Requests': '1',
}

/* DDproperty (Cloudflare) กับ PropertyHub (403) ยิงตรงไม่ได้ ต้องผ่าน Chrome ตัวจริง —
   ยังไม่รวมในรอบนี้ ปล่อยให้ ingest เห็นว่า "ไม่ได้ตรวจ" ดีกว่าเดาว่าหายจากตลาด
   ป้าย DP เป็นชื่อซ้ำของ DotProperty (ข้อมูลเก่าลงไว้สองชื่อ) — ยุบตอนอ่าน */
const FETCHABLE = new Set(['DotProperty', 'PropertyScout', 'LivingInsider', 'FazWaz'])
const PORTAL_ALIAS = { DP: 'DotProperty' }

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
async function q(query, dataset) {
  const r = await fetch(`${API}/data/query/${dataset}?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()).result
}

const num = v => { const n = +String(v ?? '').replace(/[^\d.]/g, ''); return Number.isFinite(n) && n > 0 ? n : null }
/* ชั้นจาก portal มาเป็นช่วงได้ ("21 - 25", "28+29", "9 / building 5") — num() จะเชื่อมเลข
   ติดกันเป็น 2125/2829 (ชั้นผี) · เอาเลขจำนวนเต็มตัวแรก = ชั้นต่ำสุด ตามที่ตกลงกับเจ้าของงาน */
const lowFloor = v => { const m = String(v ?? '').match(/\d{1,3}/); const n = m ? +m[0] : NaN
  return Number.isFinite(n) && n > 0 && n <= 120 ? n : null }
/* new Date(null) = 1 ม.ค. 1970 ไม่ใช่ค่าว่าง — ถ้าไม่กันไว้ ห้องที่ "ไม่มีวันที่ไม่ว่าง"
   จะกลายเป็น "ว่างตั้งแต่ปี 1970" ซึ่งดูเหมือนข้อมูลจริงจนไม่มีใครเอะใจ */
const isoDate = v => {
  if (v == null || v === '' || v === 0) return null
  const d = new Date(v)
  return isNaN(+d) || d.getUTCFullYear() < 2000 ? null : d.toISOString().slice(0, 10)
}

const ldBlocks = html => [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(m => { try { return JSON.parse(m[1].trim()) } catch { return null } }).filter(Boolean)
/** เดินทั้งต้นไม้ JSON หา key ที่ต้องการ — โครง ld+json ต่างกันทุกเจ้า (บางเจ้าใช้ @graph) */
function deepFind(root, pred) {
  const stack = [root]
  while (stack.length) {
    const o = stack.pop()
    if (!o || typeof o !== 'object') continue
    const hit = pred(o)
    if (hit != null) return hit
    for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v)
  }
  return null
}


/* ── ตัวแกะรายเจ้า — คืน { price, postCreatedAt, postUpdatedAt, posterType, posterName, gone } ──
   ทุกตัวห้ามเดา: อ่านไม่ได้ให้คืน null แล้วให้ ingest ตัดสินใจเอง */
const EXTRACT = {
  PropertyScout(html) {
    const m = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!m) return null
    let p; try { p = JSON.parse(m[1]).props?.pageProps?.property } catch { return null }
    if (!p) return null
    /* ค่าจริงในข้อมูลคือ "sell" ไม่ใช่ "sale" — เทียบตรง ๆ กับ 'sale' ทำให้ประกาศขายทุกใบ
       ไปหยิบ lowestPrice (ซึ่งเป็น null ฝั่งขาย) แล้วถูกนับว่าแกะราคาไม่ได้ */
    const isSale = /sale|sell/i.test(p.tenure ?? '')
    const price = isSale ? num(p.salePrice) : num(p.lowestPrice)
    return {
      price,
      postCreatedAt: isoDate(p.extsourceCreatedAt ?? p.createdAt),
      postUpdatedAt: isoDate(p.ae_man_event_date),
      posterType: p.postBy === 'landlord' ? 'owner' : p.postBy ? 'agent' : 'unknown',
      posterName: null,
      /* ฟิลด์นี้แปลว่า "ไม่ว่างจนถึง" ตรงตัว — แม่นกว่าการอ่านข้อความในประกาศทุกทาง */
      availableFrom: isoDate(p.ae_man_unavailable_enddate)
        ?? availableFromIn(p.availabilitySubClusterEn?.availabilityLabelText ?? ''),
      pageSeen: { sqm: num(p.floorSize), floor: lowFloor(p.floorLevel), building: p.buildingName ?? null },
    }
  },
  DotProperty(html) {
    const price = deepFind(ldBlocks(html), o => num(o.price) ?? num(o.offers?.price))
    return {
      price,
      postCreatedAt: isoDate(deepFind(ldBlocks(html), o => o.datePosted ?? o.datePublished)),
      postUpdatedAt: isoDate(deepFind(ldBlocks(html), o => o.dateModified)),
      posterType: 'unknown', posterName: null,
      availableFrom: availableFromIn(html.replace(/<[^>]+>/g, ' ')),
      pageSeen: {},
    }
  },
  LivingInsider(html) {
    const price = deepFind(ldBlocks(html), o => num(o.price) ?? num(o.offers?.price))
    /* วันที่มาเป็น DD/MM/พ.ศ. และ "ไม่มีป้ายกำกับติดกัน" — ของเดิมบังคับให้มีคำว่า
       ลงประกาศ/อัพเดท นำหน้าภายใน 20 ตัวอักษร เลยจับไม่ได้เลยสักใบ (0/261)
       เอาทุกวันที่ในหน้า: ที่เก่าสุด = วันลงประกาศ · ใหม่สุด = อัพเดทล่าสุด */
    const txt = html.replace(/<[^>]+>/g, ' ')
    const seen = new Set()
    for (const m of txt.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
      const [, d, mo, y] = m
      const yr = +y > 2400 ? +y - 543 : +y            // พ.ศ. → ค.ศ. เสมอ
      if (yr < 2015 || yr > 2100) continue
      seen.add(`${yr}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}`)
    }
    const ds = [...seen].sort()
    return {
      price, postCreatedAt: ds[0] ?? null, postUpdatedAt: ds[ds.length - 1] ?? null,
      posterType: 'unknown', posterName: null,
      availableFrom: availableFromIn(txt), pageSeen: {},
    }
  },
  FazWaz(html) {
    const price = deepFind(ldBlocks(html), o => num(o.price) ?? num(o.offers?.price))
      ?? num((html.match(/฿\s?([\d,]{4,})/) ?? [])[1])
    const upd = html.match(/Updated on[^\d]{0,12}([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i)
    return {
      price,
      postCreatedAt: isoDate(deepFind(ldBlocks(html), o => o.datePosted)),
      postUpdatedAt: upd ? isoDate(upd[1]) : null,
      posterType: 'unknown', posterName: null,
      availableFrom: availableFromIn(html.replace(/<[^>]+>/g, ' ')),
      pageSeen: {},
    }
  },
}

/**
 * ประกาศถูกถอดแล้วหรือยัง — เชื่อเฉพาะสัญญาณที่ชัด ไม่เดาจากราคาหาย
 *
 * กฎ redirect ของเดิมเขียน /\/(search|listings|properties|home)?\/?$/ ซึ่งวงเล็บเป็น optional
 * แปลว่า "path ใดก็ตามที่ลงท้ายด้วย /" เข้าเงื่อนไขหมด — PropertyScout redirect จาก URL ย่อ
 * (/en/condo-510713/) ไป URL เต็มเป็นปกติ เลยโดนตราหน้าว่าหายจากตลาด 790 ใบ ทั้งที่ยังขายอยู่
 * ตัวตัดสินที่ถูกต้องคือ "เลข id ของประกาศยังอยู่ใน URL ปลายทางมั้ย" ไม่ใช่รูปทรงของ path
 */
const idOf = u => (String(u).match(/(\d{6,})\/?(?:[?#].*)?$/) ?? [])[1] ?? null

/**
 * โดนบอทดีเทคชันกั้นหรือเปล่า — ต้องแยกจาก "ไม่เจอราคา" ให้ขาด
 *
 * 2026-08-17: FazWaz เปิด Cloudflare challenge กับการยิงตรง ตอบ 403 + หน้า "Just a moment..."
 * ทั้ง 1,752 ใบ · โค้ดเดิมไม่มีสถานะนี้ เลยตกถังเดียวกับ noPrice = "ตรวจแล้วแต่อ่านราคาไม่ออก"
 * ซึ่งอ่านเหมือนปัญหาเล็ก ๆ ทั้งที่จริงคือ "ทั้ง portal ตรวจไม่ได้เลย" · ผลคือไฟล์รอบไม่มีแถว
 * FazWaz สักแถว และถ้า --write ต่อไป ห้องที่ประกาศอยู่เฉพาะ FazWaz จะโดน expired ยกแผง
 * ทางแก้ที่ถูกคือเก็บซ้ำผ่านเบราว์เซอร์จริง (ห้าม bypass challenge) — ไม่ใช่เดาราคา
 */
function blockedReason(res, html) {
  const head = html.slice(0, 4000)
  if (/just a moment|cf-browser-verification|cf_chl_|attention required|enable javascript and cookies/i.test(head))
    return 'บอทดีเทคชัน (challenge page)'
  if (res.status === 403) return 'http 403 (ถูกกั้น)'
  if (res.status === 429) return 'http 429 (ยิงถี่เกิน)'
  if (res.status >= 500) return `http ${res.status} (ฝั่งเว็บล่ม)`
  return null
}

function goneReason(res, html, origUrl) {
  if (res.status === 404 || res.status === 410) return `http ${res.status}`
  const id = idOf(origUrl)
  if (res.redirected && id && !res.url.includes(id)) return 'redirect ไปหน้าอื่น (ไม่เหลือ id เดิม)'
  if (/no longer available|has been (rented|sold)|ประกาศนี้ถูกลบ|ไม่พบประกาศ/i.test(html.slice(0, 300000))) return 'หน้าเขียนว่าไม่มีแล้ว'
  return null
}

/* ── โหลดรายการงานจาก unitSource ─────────────────────────────────────────── */
console.log('อ่านลิงก์ที่เก็บไว้จาก unitSource…')
/* URL อยู่ใน unitSource (dataset internal) แต่ building/bed/sqm อยู่ใน unitProfile
   (dataset production) — คนละที่กัน ต้องดึงสองรอบแล้ว join ด้วย refCode+intent */
const [src, profs] = await Promise.all([
  q(`*[_type == "unitSource"]{ refCode, floorActual,
    "L": coalesce(rentListings[]{portal, url, "intent": "rent", posterType, posterName}, [])
       + coalesce(saleListings[]{portal, url, "intent": "sale", posterType, posterName}, []) }`, 'internal'),
  q(`*[_type == "unitProfile"]{ refCode, intent, projectName, bedType, sqm }`, 'production'),
])
const PROF = new Map(profs.map(p => [`${p.refCode}·${p.intent}`, p]))
console.log(`  unitSource ${src.length} ห้อง · unitProfile ${profs.length} ใบ`)

const seenUrl = new Set()
const allPortalsInSource = new Set()     // ไว้เตือนตอนจบว่ารอบนี้ไม่ได้แตะเจ้าไหนบ้าง
let jobs = []
for (const s of src) for (const l of s.L ?? []) {
  if (!l.url || seenUrl.has(l.url)) continue
  seenUrl.add(l.url)
  const portal = PORTAL_ALIAS[l.portal] ?? l.portal
  allPortalsInSource.add(portal)
  if (!FETCHABLE.has(portal)) continue
  if (ONLY && portal !== ONLY) continue
  const pr = PROF.get(`${s.refCode}·${l.intent}`)
  jobs.push({ url: l.url, portal, intent: l.intent, refCode: s.refCode,
    building: pr?.projectName ?? null, bedType: pr?.bedType ?? null, sqm: pr?.sqm ?? null,
    floor: s.floorActual ?? null,
    posterType: l.posterType ?? null, posterName: l.posterName ?? null })
}

mkdirSync(join(process.cwd(), '_rounds'), { recursive: true })
const progressPath = join(process.cwd(), '_rounds', `_progress-${DATE}.jsonl`)
/* รันซ้ำได้: ใบที่ทำไปแล้วในรอบวันเดียวกันไม่ยิงซ้ำ — 10,944 ใบใช้เวลาเป็นชั่วโมง
   ถ้าขาดกลางคันแล้วต้องเริ่มใหม่หมด รอบนี้ก็จะไม่มีวันจบเหมือนที่ผ่านมา */
const done = new Map()
if (existsSync(progressPath)) {
  for (const line of readFileSync(progressPath, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { const r = JSON.parse(line); done.set(r.url, r) } catch {}
  }
  console.log(`  ทำค้างไว้แล้ว ${done.size} ใบ — ข้ามไปทำต่อ`)
}
/* --retry-failed = กลับไปทำเฉพาะใบที่ 403 / แกะราคาไม่ได้ / error (ไม่แตะใบที่สำเร็จ)
   จำเป็นเพราะ checkpoint นับใบที่ "ตรวจแล้วแต่ล้มเหลว" ว่าเสร็จ — ถ้าไม่มีโหมดนี้
   บั๊กหนึ่งตัวจะค้างอยู่ในรอบนั้นตลอดไป แก้โค้ดแล้วก็ไม่มีทางกลับไปเก็บ */
const RETRY = args.includes('--retry-failed')
/* --redo-urls <ไฟล์ JSON array ของ url> = บังคับทำซ้ำเฉพาะรายการนี้ แม้เคยสำเร็จแล้ว
   ใช้เก็บ field ที่เพิ่มทีหลัง (วันที่/วันว่าง) กับแถวที่เก็บด้วยโค้ดรุ่นเก่า —
   แถวใหม่ append ต่อท้าย ผู้อ่านใช้แถวหลังชนะ ราคา+วันที่สดกว่าเสมอ */
const REDO_FILE = argOf('--redo-urls')
if (REDO_FILE) {
  const want = new Set(JSON.parse(readFileSync(REDO_FILE, 'utf8')))
  for (const u of want) done.delete(u)
}
/* ต้องล้าง gone ที่มาจากกฎ redirect ด้วย ไม่ใช่แค่ noPrice/error — ใบพวกนั้นถูกตัดสินผิด
   ด้วยกฎเก่า และ "ถูกถอด" คือสถานะที่ทำให้ห้องหลุดจากตลาด อันตรายกว่าแกะราคาไม่ได้ */
if (RETRY) for (const [u, r] of [...done])
  if (r.noPrice || r.error || r.blocked || (r.gone && r.gone.startsWith('redirect'))) done.delete(u)
const todo = jobs.filter(j => !done.has(j.url)).slice(0, LIMIT)
console.log(`  ลิงก์ที่ยิงตรงได้ ${jobs.length} ใบ · รอบนี้ทำ ${todo.length} ใบ (พอร์ทัล: ${ONLY ?? [...FETCHABLE].join(', ')})\n`)

/* ── ไล่เปิดทีละใบ ────────────────────────────────────────────────────────── */
const stat = { ok: 0, gone: 0, noPrice: 0, err: 0, blocked: 0 }
let n = 0
async function worker(list) {
  for (const j of list) {
    let rec = { ...j, at: DATE }
    try {
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), TIMEOUT_MS)
      const res = await fetch(j.url, { headers: UA, redirect: 'follow', signal: c.signal })
      clearTimeout(t)
      const html = await res.text()
      /* ต้องเช็ค "ถูกกั้น" ก่อน "ถูกถอด" เสมอ — หน้า challenge ตอบ 403 และ redirect ไปหน้ากลาง
         ได้ทั้งคู่ ถ้าเรียงสลับกันประกาศที่ยังขายอยู่จะถูกตราหน้าว่าหายจากตลาด */
      const blocked = blockedReason(res, html)
      const gone = blocked ? null : goneReason(res, html, j.url)
      if (blocked) { rec.blocked = blocked; stat.blocked++ }
      else if (gone) { rec.gone = gone; stat.gone++ }
      else {
        const got = EXTRACT[j.portal]?.(html)
        if (!got || got.price == null) { rec.noPrice = true; stat.noPrice++ }
        else {
          Object.assign(rec, got)
          rec.posterType = got.posterType === 'unknown' ? (j.posterType ?? 'unknown') : got.posterType
          rec.posterName = got.posterName ?? j.posterName
          stat.ok++
        }
      }
    } catch (e) { rec.error = String(e.message ?? e).slice(0, 120); stat.err++ }
    appendFileSync(progressPath, JSON.stringify(rec) + '\n')
    done.set(j.url, rec)
    if (++n % 50 === 0 || n === todo.length)
      console.log(`  ${n}/${todo.length} · ยังอยู่ ${stat.ok} · ถูกถอด ${stat.gone} · ไม่เจอราคา ${stat.noPrice} · ถูกกั้น ${stat.blocked} · error ${stat.err}`)
    await new Promise(r => setTimeout(r, GAP_MS))
  }
}
const lanes = Array.from({ length: CONC }, (_, i) => todo.filter((_, k) => k % CONC === i))
await Promise.all(lanes.map(worker))

/* ── สรุปเป็นไฟล์รอบ ─────────────────────────────────────────────────────── */
const BED_N = { studio: 0, '1bed': 1, '2bed': 2, '3bed': 3, '4bed': 4 }
const rows = []
for (const r of done.values()) {
  if (r.gone || r.error || r.noPrice || r.blocked || r.price == null) continue
  if (!r.building || !['rent', 'sale'].includes(r.intent)) continue
  rows.push({
    refCode: r.refCode ?? null,     // รอบ re-scrape รู้ห้องอยู่แล้ว — ให้ ingest จับคู่ตรง ไม่ต้องทายลายนิ้วมือ
    building: r.building, intent: r.intent,
    bed: BED_N[r.bedType] ?? null, sqm: r.sqm ?? null, floor: r.floor ?? null,
    price: r.price, portal: r.portal, url: r.url,
    posterType: r.posterType ?? 'unknown', posterName: r.posterName ?? null,
    postCreatedAt: r.postCreatedAt ?? null, postUpdatedAt: r.postUpdatedAt ?? null,
    availableFrom: r.availableFrom ?? null,
  })
}
const roundPath = join(process.cwd(), '_rounds', `round-${DATE}.json`)
writeFileSync(roundPath, JSON.stringify(rows, null, 1), 'utf8')

const all = [...done.values()]
console.log(`\nรอบ ${DATE}`)
console.log(`  ตรวจแล้ว ${all.length} ใบ`)
console.log(`  ยังอยู่ ${all.filter(r => r.price != null && !r.gone && !r.blocked).length} · ถูกถอด ${all.filter(r => r.gone).length} · ไม่เจอราคา ${all.filter(r => r.noPrice).length} · ถูกกั้น ${all.filter(r => r.blocked).length} · error ${all.filter(r => r.error).length}`)
console.log(`  เขียน ${rows.length} แถว → ${roundPath}`)

/* ── ใบเตือนความครบของรอบ ────────────────────────────────────────────────────
   ingest ตัดสิน expired จาก "ห้องที่ไม่อยู่ในไฟล์รอบ" — portal ที่เก็บไม่ได้จึงไม่ใช่
   ข้อมูลขาดเฉย ๆ แต่แปลว่า "ห้องที่ลงเฉพาะเจ้านั้นจะถูกประหาร" · เดิมบรรทัดนี้ hardcode
   ชื่อ DDproperty/PropertyHub ไว้ พอ FazWaz ล้มยกเจ้าในรอบ 2026-08-17 จึงไม่มีใครเตือน
   ตอนนี้นับจากผลจริงต่อ portal ทุกครั้ง */
const perPortal = new Map()
for (const j of jobs) {
  const p = perPortal.get(j.portal) ?? { jobs: 0, ok: 0, blocked: 0 }
  p.jobs++; perPortal.set(j.portal, p)
}
for (const r of all) {
  const p = perPortal.get(r.portal); if (!p) continue
  if (r.blocked) p.blocked++
  else if (r.price != null && !r.gone) p.ok++
}
const dead = [], hurt = []
for (const [portal, p] of perPortal) {
  if (p.jobs && p.ok === 0) dead.push(`${portal} (${p.jobs} ใบ · ถูกกั้น ${p.blocked})`)
  else if (p.blocked > p.jobs * 0.1) hurt.push(`${portal} ถูกกั้น ${p.blocked}/${p.jobs}`)
}
const notRun = ONLY ? [] : [...allPortalsInSource].filter(p => !perPortal.has(p))
if (dead.length) {
  console.log(`\n‼ portal ที่เก็บไม่ได้เลยสักใบรอบนี้: ${dead.join(' · ')}`)
  console.log(`  → ต้องเก็บซ้ำผ่านเบราว์เซอร์จริงก่อน --write (ห้าม bypass challenge)`)
  console.log(`  → ถ้า ingest ทั้งที่ขาด ห้องที่ลงเฉพาะเจ้านี้จะถูกตั้ง expired ทั้งที่ยังขายอยู่`)
}
if (hurt.length) console.log(`\n! เก็บได้ไม่ครบ: ${hurt.join(' · ')}`)
if (notRun.length) {
  console.log(`\n! portal ที่รอบนี้ไม่ได้แตะเลย (ยิงตรงไม่ได้ ต้องผ่าน Chrome): ${notRun.join(', ')}`)
  console.log(`  → อย่าเพิ่ง --write ถ้ายังไม่ครบ ห้องที่ลงไว้เฉพาะเจ้าพวกนี้จะถูกตั้งเป็น expired`)
}
console.log(`\nขั้นต่อไป (dry-run ก่อนเสมอ):`)
console.log(`  node --env-file=.env tools/ingest-units.mjs --round "${roundPath}" --date ${DATE}`)
