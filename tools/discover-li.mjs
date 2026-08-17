#!/usr/bin/env node
/**
 * discover-li.mjs — ครึ่ง discovery ของ LivingInsider: หา "ประกาศเข้าใหม่" ของ 9 ตึกที่เราตาม
 *
 * Usage: node --env-file=.env tools/discover-li.mjs [--date YYYY-MM-DD] [--building "ชื่อตึก"]
 *   เขียน: _rounds/_lidisc-<date>.json (id ทั้งหมดต่อตึก + ที่ยังไม่รู้จัก)
 *          _rounds/_lidet-<date>.json  (รายละเอียดใบใหม่ — assemble-discovery.mjs อ่านไฟล์นี้)
 *
 * ทำไมไม่ใช้หน้า searchword (ที่สเปครอบก่อนเขียนไว้):
 *   /searchword/Condo/all/<page>/Park 24.html คืนผลค้นแบบ fuzzy — หน้าแรกไม่มีห้อง Park 24
 *   สักใบ (0/37) แล้วโผล่มา 3 ใบตอนหน้า 2 · รอบ 2026-08-10 เก็บ 39 by Sansiri ได้ 5 ใบ
 *   ทั้งที่ตึกนี้มีประกาศอยู่จริง 48 ใบ = ครึ่ง discovery มองไม่เห็นของ 90%
 *   หน้ารายโครงการ (/living_project/<zone>/<projId>/...) คืนครบทั้งตึกในหน้าเดียว
 *   projId หาเองจาก breadcrumb ของประกาศใบที่เรารู้จักอยู่แล้ว — ไม่ต้อง hardcode
 *
 * ห้ามเดาค่า: อ่านไม่ออกให้เป็น null แล้วปล่อยให้ assemble-discovery ตัดใบที่ข้อมูลไม่ครบทิ้ง
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const DATE = argOf('--date') ?? new Date().toISOString().slice(0, 10)
const ONLY = argOf('--building')

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Upgrade-Insecure-Requests': '1',
}
const GAP_MS = 350
const sleep = ms => new Promise(r => setTimeout(r, ms))
const get = async url => {
  const r = await fetch(url, { headers: UA, redirect: 'follow' })
  return { status: r.status, url: r.url, html: r.ok ? await r.text() : '' }
}

/* slug ของแต่ละตึกใน URL ของ LI — ไม่ตรงกับชื่อที่เราใช้ (HQ by Sansiri = hq-thonglor,
   Park 24 = park-24-sukhumvit-24) เลยต้องแมพมือ · ตัวนี้คือ "ตัวกรอง" ว่าใบไหนเป็นของตึกเรา */
const BUILDINGS = [
  { name: '39 by Sansiri', slug: 'condo-39-by-sansiri' },
  { name: 'HQ by Sansiri', slug: 'condo-hq-thonglor' },
  { name: 'Ideo Morph 38', slug: 'condo-ideo-morph-38' },
  { name: 'The Lumpini 24', slug: 'condo-the-lumpini-24' },
  { name: 'Noble BE19', slug: 'condo-noble-be-19' },
  { name: 'Park 24', slug: 'condo-park-24-sukhumvit-24' },
  { name: 'Rhythm Sukhumvit 36-38', slug: 'condo-rhythm-sukhumvit-36-38' },
  { name: 'The Room Sukhumvit 21', slug: 'condo-the-room-sukhumvit-21' },
  { name: 'Mahogany Tower', slug: 'condo-mahogany-tower' },
]

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const q = async (query, ds) => (await (await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`,
  { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).result

/* ── ลิงก์ที่ระบบรู้จักแล้ว = ทั้งประตูกันซ้ำ และ "เมล็ด" ที่ใช้หา projId ── */
const [src, profs] = await Promise.all([
  q(`*[_type == "unitSource"]{ refCode, "L": coalesce(rentListings[].url, []) + coalesce(saleListings[].url, []) }`, 'internal'),
  q(`*[_type == "unitProfile"]{ refCode, projectName }`, 'production'),
])
const PROJ = new Map(profs.map(p => [p.refCode, p.projectName]))
const knownUrls = new Set()
/* ประตูกันซ้ำต้องดูที่ "เลขประกาศ" ไม่ใช่ URL เป๊ะ ๆ — LI มีสองเส้นทางไปหน้าเดียวกัน
   /detail_en/<slug>-<id> (อังกฤษ) กับ /detail/<slug>-<id> (ไทย) · ของที่เก็บไว้เป็น _en
   แต่ลิงก์บนหน้าโครงการเป็นแบบไทย ถ้ากันซ้ำด้วยสตริง URL จะได้ "ประกาศใหม่" 1,528 ใบ
   ที่จริงคือใบเดิมทั้งหมด → ประกาศซ้ำงอกเป็นห้องผี (ข้อห้ามข้อแรกของเจ้าของงาน) */
const knownIds = new Set()
const seedByBuilding = new Map()
for (const s of src) for (const u of s.L ?? []) {
  if (!u) continue
  knownUrls.add(u)
  if (!/livinginsider\.com\/detail(_en)?\//.test(u)) continue
  const id = (u.match(/-(\d{6,})$/) ?? [])[1]
  if (id) knownIds.add(id)
  const b = PROJ.get(s.refCode)
  if (b && !seedByBuilding.has(b)) seedByBuilding.set(b, u)
}
const idOfSlug = s => (String(s).match(/-(\d{6,})$/) ?? [])[1] ?? null
console.log(`URL ที่รู้จักแล้ว ${knownUrls.size} ใบ · เลขประกาศ LI ที่รู้จัก ${knownIds.size} · เมล็ด LI ${seedByBuilding.size} ตึก`)

/* เมล็ดสำรองจากรอบก่อน — ตึกที่ยังไม่เคยมีประกาศ LI เข้าระบบ (ยังไม่มีใน unitSource) */
const FALLBACK_SEED = {}
if (existsSync('_rounds/_lidet-2026-08-10.json'))
  for (const r of JSON.parse(readFileSync('_rounds/_lidet-2026-08-10.json', 'utf8')))
    if (r.url && !FALLBACK_SEED[r.building]) FALLBACK_SEED[r.building] = r.url

const num = v => { const n = +String(v ?? '').replace(/[^\d.]/g, ''); return Number.isFinite(n) && n > 0 ? n : null }
const ldBlocks = html => [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(m => { try { return JSON.parse(m[1].trim()) } catch { return null } }).filter(Boolean)
function deepFind(root, pred) {
  const stack = [root]
  while (stack.length) {
    const o = stack.pop()
    if (!o || typeof o !== 'object') continue
    const hit = pred(o); if (hit != null) return hit
    for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v)
  }
  return null
}
const plain = html => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

const linksIn = html => [...new Set([...html.matchAll(/livinginsider\.com\/detail\/([a-z0-9-]+?)-(\d{6,})/g)]
  .map(m => `${m[1]}-${m[2]}`))]

/* ── หา URL หน้ารายโครงการจากประกาศใบเดียว (breadcrumb ld+json ข้อ 3) ── */
async function projectUrlFrom(seedUrl) {
  const { html } = await get(seedUrl)
  if (!html) return null
  const fromLd = deepFind(ldBlocks(html), o =>
    (typeof o.item === 'string' && o.item.includes('/living_project/')) ? o.item : null)
  if (fromLd) return fromLd
  const m = html.match(/https:\/\/www\.livinginsider\.com\/living_project\/[^"'\s>]+/)
  return m ? m[0] : null
}

/* ── แกะรายละเอียดใบใหม่ ──────────────────────────────────────────────────
   บรรทัดสรุปบนหัวประกาศคือแหล่งที่เชื่อได้: "฿ 40,000 /ด. 51 ตร.ม. ・ ชั้นที่ 21-50 ・ 1 ห้องนอน"
   ชั้นของ LI เป็น "ช่วง" (21-50) ไม่ใช่ชั้นจริง — เอาเลขต้นช่วงตามกติกาเดียวกับ rescrape */
function parseDetail(html, slugId, building) {
  const txt = plain(html)
  const price = deepFind(ldBlocks(html), o => num(o.price) ?? num(o.offers?.price))
  const sqm = num((txt.match(/([\d,]+(?:\.\d+)?)\s*ตร\.ม\.\s*(?:・|·|\|)/) ?? [])[1])
  const bed = /ห้องสตูดิโอ\s*(?:・|·|\|)/.test(txt) ? 0
    : num((txt.match(/(?:・|·|\|)\s*(\d+)\s*ห้องนอน/) ?? [])[1])
  const bath = num((txt.match(/(?:・|·|\|)\s*(\d+)\s*ห้องน้ำ/) ?? [])[1])
  /* LI บอกชั้นได้สองแบบ: เลขจริง ("ชั้นที่ 17") หรือ "ช่วง" ("ชั้นที่ 21-50" = ชั้นสูง)
     ห้ามหยิบต้นช่วงมาใช้ — ชั้นเป็นส่วนหนึ่งของลายนิ้วมือที่ ingest ใช้จับคู่ห้อง
     ต้นช่วงจะไปชนห้องชั้น 21 ของจริงบ้าง ไม่ชนใครบ้าง = ห้องผีงอกทุกรอบ (ข้อห้ามของเจ้าของงาน)
     ช่วง = ไม่รู้ชั้น → null → assemble/ingest ตัดแถวทิ้งเอง ปลอดภัยกว่าเดา */
  const flm = txt.match(/ชั้นที่\s*(\d{1,3})\s*(-\s*\d{1,3})?/)
  const floor = flm && !flm[2] && +flm[1] > 0 && +flm[1] <= 120 ? +flm[1] : null

  // วันที่ในหน้าเป็น DD/MM/พ.ศ. ไม่มีป้ายกำกับ — เก่าสุด = ลงประกาศ · ใหม่สุด = อัพเดท
  const seen = new Set()
  for (const m of txt.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    const [, d, mo, y] = m
    const yr = +y > 2400 ? +y - 543 : +y
    if (yr < 2015 || yr > 2100) continue
    seen.add(`${yr}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}`)
  }
  const ds = [...seen].sort()
  return {
    id: slugId.match(/(\d{6,})$/)[1], building,
    intent: slugId.includes('for-rent') ? 'rent' : slugId.includes('for-sale') ? 'sale' : null,
    url: `https://www.livinginsider.com/detail/${slugId}`,
    price, bed, bath, sqm, floor,
    postCreatedAt: ds[0] ?? null, postUpdatedAt: ds[ds.length - 1] ?? null,
  }
}

/* ── เดินทีละตึก ─────────────────────────────────────────────────────────── */
mkdirSync('_rounds', { recursive: true })
const disc = [], det = []
for (const b of BUILDINGS) {
  if (ONLY && b.name !== ONLY) continue
  const seed = seedByBuilding.get(b.name) ?? FALLBACK_SEED[b.name] ?? null
  if (!seed) { console.log(`${b.name} — ไม่มีเมล็ด (ยังไม่เคยมีประกาศ LI เข้าระบบ) ข้าม`); disc.push({ building: b.name, ids: [], new: [], note: 'no-seed' }); continue }
  const projUrl = await projectUrlFrom(seed)
  await sleep(GAP_MS)
  if (!projUrl) { console.log(`${b.name} — หาหน้าโครงการไม่เจอ ข้าม`); disc.push({ building: b.name, ids: [], new: [], note: 'no-project-page' }); continue }

  /* หน้าโครงการโชว์ 48 ใบต่อหน้า — ต้องเดินหน้าถัดไปจนหมด ไม่งั้นทุกตึกจะได้ 48 ใบเท่ากันเป๊ะ
     (สัญญาณว่ากำลังอ่านแค่หน้าแรก) · เลขหน้าอยู่ segment ที่ 7:
     /living_project/<zone>/<projId>/Condo/all/all/<page>/<slug>.html
     ใส่เลขผิดตำแหน่ง LI จะ normalize กลับมาหน้า 1 เงียบ ๆ — ต้องแทนที่ segment ให้ถูก */
  const ids = []
  let status = 0
  /* URL ใน breadcrumb เป็นรูป /<zone>/<projId>/1/all/all/1/<slug> ซึ่ง LI จะ normalize เอง
     เป็น /<zone>/<projId>/Condo/all/all/1/<slug> — ถ้าเอารูปดิบไปใส่เลขหน้า LI จะเด้งกลับ
     หน้า 1 ทุกครั้งแบบเงียบ ๆ (ทุกตึกได้ 48 ใบเท่ากันเป๊ะ = อาการของบั๊กนี้)
     ต้องยิงหนึ่งครั้งก่อนแล้วใช้ "URL ปลายทาง" เป็นแม่แบบใส่เลขหน้า */
  const first = await get(projUrl)
  await sleep(GAP_MS)
  const canon = first.url || projUrl
  for (let p = 1; p <= 30; p++) {
    const pageUrl = canon.replace(/(\/living_project\/\d+\/\d+\/[^/]+\/[^/]+\/[^/]+\/)\d+(\/)/, `$1${p}$2`)
    if (p > 1 && pageUrl === canon) break          // แทนที่ไม่ติด = รูป URL ไม่ตรงที่คาด อย่าวนเปล่า
    const r = p === 1 ? first : await get(pageUrl)
    await sleep(GAP_MS)
    status = r.status
    const got = linksIn(r.html).filter(s => s.includes(b.slug))
    const fresh = got.filter(s => !ids.includes(s))
    if (!fresh.length) break
    ids.push(...fresh)
    if (got.length < 40) break                     // หน้าไม่เต็ม = หน้าสุดท้าย
  }
  const fresh = ids.filter(s => {
    const id = idOfSlug(s)
    return id ? !knownIds.has(id) : !knownUrls.has(`https://www.livinginsider.com/detail/${s}`)
  })
  console.log(`${b.name} — หน้าโครงการ ${status} · ประกาศในตึก ${ids.length} ใบ · ยังไม่รู้จัก ${fresh.length} ใบ`)
  disc.push({ building: b.name, projectUrl: projUrl, ids, new: fresh })

  for (const slugId of fresh) {
    try {
      const r = await get(`https://www.livinginsider.com/detail/${slugId}`)
      if (!r.html) { det.push({ id: slugId, building: b.name, error: `http ${r.status}` }); continue }
      det.push(parseDetail(r.html, slugId, b.name))
    } catch (e) {
      det.push({ id: slugId, building: b.name, error: String(e).slice(0, 120) })
    }
    await sleep(GAP_MS)
  }
}

writeFileSync(`_rounds/_lidisc-${DATE}.json`, JSON.stringify(disc, null, 1))
writeFileSync(`_rounds/_lidet-${DATE}.json`, JSON.stringify(det, null, 1))
const ok = det.filter(r => !r.error)
console.log(`\nเก็บรายละเอียดใบใหม่ ${ok.length} ใบ (พลาด ${det.length - ok.length})`)
console.log(`  มีราคาครบ ${ok.filter(r => r.price).length} · มี sqm ${ok.filter(r => r.sqm).length} · มี bed ${ok.filter(r => r.bed != null).length} · มีชั้น ${ok.filter(r => r.floor).length}`)
console.log(`เขียน _rounds/_lidisc-${DATE}.json · _rounds/_lidet-${DATE}.json`)
