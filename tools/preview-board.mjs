#!/usr/bin/env node
/**
 * preview-board.mjs — bake สไลด์บอร์ดจาก DRAFT (ยังไม่ publish) ลง _preview/ แล้วดูใน localhost
 * ใช้ตรรกะเดียวกับ build.mjs เป๊ะ (market model · valueOf · profileToRow · แยกชนิด SEG_MIN)
 * ต่างแค่ (1) อ่าน draft ชนะ published (2) เขียนลง _preview ไม่ใช่ deploy (3) มีตัวหมุนเลียนแบบ player
 *
 * Usage: node --env-file=.env tools/preview-board.mjs <project-code>   (เช่น noble-be19)
 * ดูที่: http://localhost:8231/_preview/<code>/
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { profileToRow, closedTooLong, PROFILE_PROJECTION } from '../board-engine.mjs'
import { marketModel, expectedPsqm, valueVsExpected } from '../market-model.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEG_MIN = 1, PER_PAGE = 7, LANGS = 4, LANG_S = 7   // ต้องตรงกับ build.mjs/board-cards.html
const code = process.argv[2]
if (!code) { console.error('ต้องระบุ project-code เช่น noble-be19'); process.exit(1) }

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const fetchQ = async (query, ds = 'production') => {
  const r = await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()).result
}

// ชั้นจริง + market model (เหมือน build.mjs)
const floors = await fetchQ(`*[_type == "unitSource" && defined(floorActual)]{ refCode, floorActual }`, 'internal')
const FLOOR_BY_REF = new Map((floors ?? []).map(f => [f.refCode, f.floorActual]))
const ALL = await fetchQ(`*[_type == "unitProfile" && status in ["candidate","verified","published"] && defined(pricePerSqm)]{ refCode, intent, projectName, pricePerSqm }`)
const MARKET = marketModel((ALL ?? []).map(p => ({ building: p.projectName, intent: p.intent, psqm: p.pricePerSqm, floor: FLOOR_BY_REF.get(p.refCode) ?? null })))

const proj = await fetchQ(`*[_type == "project" && code.current == "${code}"][0]{ _id, title }`)
if (!proj) { console.error(`ไม่พบ project code ${code}`); process.exit(1) }

// draft ชนะ published (สถานะที่กำลังแก้)
const boards = await fetchQ(`*[_type == "unitBoard" && project._ref == "${proj._id}"]{
  _id, mode, "dataAsOf": _updatedAt, "lineup": lineup[]->{ ${PROFILE_PROJECTION} } }`)
const byMode = new Map()
for (const b of boards) { const isD = b._id.startsWith('drafts.'); if (!byMode.has(b.mode) || isD) byMode.set(b.mode, b) }

const cardsTemplate = readFileSync(join(ROOT, 'board-cards.html'), 'utf8')
const outDir = join(ROOT, '_preview', code)
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const valueOf = (p, mode) => {
  const mm = MARKET.byBuilding[proj.title]
  if (!mm || p.pricePerSqm == null) return null
  const exp = expectedPsqm(mode === 'rent' ? mm.rentRef : mm.saleRef,
    mode === 'rent' ? mm.fpRentOwn : mm.fpSale, mode === 'rent' ? mm.refFloorRent : mm.refFloorSale,
    FLOOR_BY_REF.get(p.refCode))
  const v = valueVsExpected(p.pricePerSqm, exp)
  return v == null ? null : Math.round(v * 100)
}

const slides = []   // { mode, seg, slug, n, pages, secs, url }
for (const mode of ['rent', 'sale']) {
  const b = byMode.get(mode); if (!b) continue
  const lineup = (b.lineup ?? []).filter(p => p && p.status !== 'expired' && !closedTooLong(p) && !p.hideFromBoard)
  const rows = lineup.map(p => ({ ...profileToRow({ ...p, floorActual: FLOOR_BY_REF.get(p.refCode) }), valuePct: valueOf(p, mode) }))
  const dataAsOf = lineup.map(p => p.lastCheckedAt).filter(Boolean).sort().at(-1)
  const boardData = { project: proj.title, mode, dataAsOf, rows }

  const bySeg = {}
  for (const r of rows) (bySeg[r.type] ??= []).push(r)
  for (const [seg, segRows] of Object.entries(bySeg)) {
    if (segRows.length < SEG_MIN) continue
    const segData = { ...boardData, rows: segRows, segment: seg }
    segData.rev = createHash('sha1').update(JSON.stringify(segData)).digest('hex').slice(0, 8)
    const slug = seg.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '')
    const dir = join(outDir, mode, slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), cardsTemplate.replace('</head>',
      `<script>window.__TODAY__="${new Date().toISOString().slice(0, 10)}";window.__BOARD__ = ${JSON.stringify(segData)};</script>\n</head>`), 'utf8')
    const pages = Math.ceil(segRows.length / PER_PAGE), secs = pages * LANGS * LANG_S
    slides.push({ mode, seg, slug, n: segRows.length, pages, secs, url: `${mode}/${slug}/` })
  }
}

if (!slides.length) { console.error('บอร์ดนี้ไม่มี lineup — เลือกห้องแล้ว Save ก่อน'); process.exit(1) }

/* ตัวหมุนเลียนแบบ player — วนสไลด์ตามเวลาจริง (หน้า×4ภาษา×7วิ) มีปุ่ม/จุดข้ามได้ */
const rotator = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>Preview หมุนสไลด์ · ${proj.title}</title><style>
*{box-sizing:border-box;margin:0}body{background:#0b1220;font-family:'Anuphan',system-ui,sans-serif;color:#cbd5e1;height:100vh;display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}
.bar b{color:#fff;font-size:16px}.bar .now{color:#6dd5e8;font-weight:700}
.dot{cursor:pointer;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid #334155;background:#1e293b;color:#94a3b8}
.dot.on{background:#0E3361;color:#fff;border-color:#6dd5e8}
button{cursor:pointer;font-size:13px;padding:5px 12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0}
.stage{position:relative;flex:1;aspect-ratio:1080/1920;max-height:calc(100vh - 90px);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
iframe{width:100%;height:100%;border:0;display:block;background:#060B14}
.count{position:absolute;top:8px;right:12px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;padding:3px 9px;border-radius:8px}
</style></head><body>
<div class="bar"><b>${proj.title}</b> · หมุนสไลด์เหมือนจอจริง · <span class="now" id="now"></span>
  <button onclick="jump(-1)">‹ ก่อน</button><button id="pp" onclick="toggle()">⏸ หยุด</button><button onclick="jump(1)">ถัด ›</button></div>
<div class="bar" id="dots"></div>
<div class="stage"><iframe id="fr"></iframe><div class="count" id="cnt"></div></div>
<script>
const S=${JSON.stringify(slides.map(s => ({ label: (s.mode === 'rent' ? 'เช่า' : 'ขาย') + ' ' + s.seg + ' (' + s.n + 'ห้อง/' + s.pages + 'น.)', url: s.url, secs: s.secs })))};
let i=0,playing=true,t=null;
const fr=document.getElementById('fr'),now=document.getElementById('now'),cnt=document.getElementById('cnt'),dots=document.getElementById('dots');
S.forEach((s,k)=>{const d=document.createElement('span');d.className='dot';d.textContent=s.label;d.onclick=()=>go(k);dots.appendChild(d)});
function go(k){i=(k+S.length)%S.length;fr.src=S[i].url+'?t='+Date.now();now.textContent=S[i].label;cnt.textContent=(i+1)+'/'+S.length+' · '+S[i].secs+'วิ';
 [...dots.children].forEach((d,j)=>d.classList.toggle('on',j===i));schedule()}
function schedule(){clearTimeout(t);if(playing)t=setTimeout(()=>go(i+1),S[i].secs*1000)}
function jump(d){go(i+d)}
function toggle(){playing=!playing;document.getElementById('pp').textContent=playing?'⏸ หยุด':'▶ เล่น';schedule()}
go(0);
</script></body></html>`
writeFileSync(join(outDir, 'index.html'), rotator, 'utf8')

console.log(`\n✓ bake ${slides.length} สไลด์ (draft) ของ ${proj.title}`)
for (const s of slides) console.log(`   ${s.mode === 'rent' ? 'เช่า' : 'ขาย'} ${s.seg.padEnd(6)} ${s.n} ห้อง · ${s.pages} หน้า · ${s.secs} วิ`)
console.log(`\nเปิดดู:  http://localhost:8231/_preview/${code}/`)
