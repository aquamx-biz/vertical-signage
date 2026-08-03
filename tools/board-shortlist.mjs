#!/usr/bin/env node
/**
 * board-shortlist.mjs — คัด shortlist ยูนิตให้ทีม verify ก่อนขึ้นบอร์ด
 *
 * Usage:  node --env-file=.env tools/board-shortlist.mjs ["39 by Sansiri"] [39bs]
 *
 * Runs the SAME selection engine as build.mjs, but WITHOUT the
 * status/contact gates (this list is exactly the units the team should go
 * verify and collect contacts for). Outputs:
 *   _shortlist-<tag>.html          — team review page (internal: real floors + source URLs)
 *   _board-<tag>-rent/index.html   — board mockup baked from the rent picks
 *   _board-<tag>-sale/index.html   — board mockup baked from the sale picks
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { selectBoardRows, profileToRow, PROFILE_PROJECTION } from '../board-engine.mjs'

const __dirname = dirname(dirname(fileURLToPath(import.meta.url)))   // repo root
const PROJECT_NAME = process.argv[2] ?? '39 by Sansiri'
const TAG          = process.argv[3] ?? '39bs'
const PER_INTENT   = 20                                              // 20 rent + 20 sale = 40

const TOKEN = process.env.SANITY_TOKEN
if (!TOKEN) { console.error('SANITY_TOKEN not set — run with node --env-file=.env'); process.exit(1) }

async function fetchGroq(query, dataset) {
  const url = `https://awjj9g8u.api.sanity.io/v2024-01-01/data/query/${dataset}` +
              `?query=${encodeURIComponent(query)}&perspective=published`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`Sanity ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}

console.log(`Shortlisting for "${PROJECT_NAME}" …`)
const [profiles, sources] = await Promise.all([
  fetchGroq(`*[_type == "unitProfile" && projectName == ${JSON.stringify(PROJECT_NAME)}]{ ${PROFILE_PROJECTION} }`, 'production'),
  fetchGroq(`*[_type == "unitSource" && projectName == ${JSON.stringify(PROJECT_NAME)}]{ refCode, floorActual, "listings": listings[]{ portal, url, intent, price, posterType } }`, 'internal'),
])
console.log(`  profiles: ${profiles.length} · sources: ${sources.length}`)
const srcByRef = new Map(sources.map(s => [s.refCode, s]))

const fmtPrice = (p, mode) => mode === 'rent'
  ? '฿' + p.toLocaleString('en-US')
  : (p / 1e6).toFixed(2) + 'M'

const chip = (t, c) => `<span class="chip ${c}">${t}</span>`
function flagChips(p) {
  const out = []
  if (p.dealTier)      out.push(chip(p.dealTier.toUpperCase(), p.dealTier === 'super' ? 'g2' : 'g1'))
  if (p.hotDeal)       out.push(chip('HOT', 'o'))
  if (p.goodInvest)    out.push(chip(`INVEST ${p.yieldPct ? p.yieldPct.toFixed(1) + '%' : ''}`, 'g1'))
  if (p.negotiable)    out.push(chip('NEGO', 'n'))
  if (p.postedByOwner) out.push(chip('OWNER', 'g1'))
  return out.join('')
}

const sections = []
const boardPicks = {}
for (const mode of ['rent', 'sale']) {
  const pool = profiles.filter(p => p.intent === mode)
  const onBoard = new Set(selectBoardRows(pool, mode, 19).map(p => p.refCode))
  const picks = selectBoardRows(pool, mode, PER_INTENT)
  boardPicks[mode] = picks.filter(p => onBoard.has(p.refCode))
  console.log(`  ${mode}: pool ${pool.length} → shortlist ${picks.length} (board ${onBoard.size})`)

  const rows = picks.map((p, i) => {
    const src = srcByRef.get(p.refCode)
    const links = (src?.listings ?? [])
      .filter(l => l.intent === mode)
      .map(l => `<a href="${l.url}" target="_blank">${l.portal}${l.price ? ' ฿' + l.price.toLocaleString('en-US') : ''}</a>`)
      .join(' · ')
    return `<tr class="${onBoard.has(p.refCode) ? 'onboard' : ''}">
      <td class="num">${i + 1}</td>
      <td><b>${p.refCode}</b>${onBoard.has(p.refCode) ? ' <span class="bd">ขึ้นบอร์ด</span>' : ' <span class="alt">สำรอง</span>'}</td>
      <td>${p.bedType}</td><td class="num">${p.sqm}</td><td>${p.floorZone}</td>
      <td class="num">${src?.floorActual ?? '—'}</td>
      <td class="num">${fmtPrice(p.priceTHB, mode)}</td>
      <td class="num ${p.vsFloorPct < 0 ? 'neg' : ''}">${p.vsFloorPct != null ? (p.vsFloorPct > 0 ? '+' : '') + p.vsFloorPct + '%' : '—'}</td>
      <td>${flagChips(p)}</td>
      <td class="num">${p.spreadPct != null ? p.spreadPct + '%' : '—'}</td>
      <td class="links">${links || '—'}</td>
    </tr>`
  }).join('\n')

  sections.push(`
  <h2>${mode === 'rent' ? 'FOR RENT' : 'FOR SALE'} — ${picks.length} ห้อง</h2>
  <table><thead><tr>
    <th>#</th><th>Ref</th><th>Type</th><th>SQM</th><th>Zone</th><th>ชั้นจริง</th>
    <th>ราคา</th><th>vs Floor</th><th>จุดเด่น</th><th>Spread</th><th>ประกาศต้นทาง (โทร/ทัก portal เพื่อเก็บ contact)</th>
  </tr></thead><tbody>${rows}</tbody></table>`)
}

const shortlistHtml = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<title>Shortlist — ${PROJECT_NAME}</title><style>
body{font-family:"IBM Plex Sans Thai",Sarabun,Tahoma,sans-serif;background:#f4f5f7;color:#1a1f2e;padding:24px;font-size:15px}
.c{max-width:1500px;margin:0 auto}
h1{font-size:24px;color:#0f3460}h2{font-size:19px;color:#0f3460;margin:22px 0 8px}
.how{background:#fff;border:1px solid #d9dee7;border-left:4px solid #0f3460;border-radius:8px;padding:12px 16px;margin:12px 0;line-height:1.7}
table{width:100%;border-collapse:collapse;background:#fff;font-size:13.5px;border:1px solid #e5e7eb}
th{background:#0f3460;color:#fff;padding:7px 8px;font-size:11.5px;text-transform:uppercase;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #eef1f5;white-space:nowrap}
td.num{text-align:right;font-variant-numeric:tabular-nums}
td.links{white-space:normal;max-width:340px;font-size:12.5px}
tr.onboard{background:#f4fbf6}
.neg{color:#166534;font-weight:700}
.bd{background:#166534;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px}
.alt{background:#9ca3af;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px}
.chip{display:inline-block;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700;margin-right:4px}
.chip.g2{background:#166534;color:#fff}.chip.g1{background:#d1f2dd;color:#166534}
.chip.o{background:#c2410c;color:#fff}.chip.n{background:#e5e7eb;color:#374151}
a{color:#0f3460}
</style></head><body><div class="c">
<h1>Shortlist ขึ้นบอร์ด — ${PROJECT_NAME}</h1>
<div class="how"><b>ขั้นตอนทีม (ต่อห้อง):</b>
① เปิดลิงก์ประกาศต้นทาง เช็คว่ายังอยู่ + ราคาตรง →
② ติดต่อผู้ลงประกาศ เก็บชื่อ/เบอร์ ใส่ <b>Best Contact</b> ใน workspace Internal (unitSource ของ refCode นั้น) →
③ กลับมาที่ Unit Profile เปลี่ยน <b>Status → published</b> —
บอร์ดจะดึงเฉพาะห้องที่ published + มี contact แล้วเท่านั้น (แถวเขียว = ตัวจริง 19 ห้อง, เทา = สำรอง)
· คัดอัตโนมัติด้วยเกณฑ์: ครบทุก bed type · ครบธง SUPER/BEST/HOT/NEGOTIABLE${''}
(+ INVEST ฝั่งขาย) · กรองข้อมูลผิดปกติออกแล้ว (ตรม./ราคา/สเปรดเกินจริง)</div>
${sections.join('\n')}
<p style="color:#6b7280;margin-top:14px">สร้างอัตโนมัติจาก Market Intelligence · engine เดียวกับที่ bake บอร์ดจริง · internal use only (มีชั้นจริง+ลิงก์ต้นทาง ห้ามแชร์ public)</p>
</div></body></html>`
writeFileSync(join(__dirname, `_shortlist-${TAG}.html`), shortlistHtml, 'utf8')
console.log(`  ✓ _shortlist-${TAG}.html`)

// ── Board mockups from the same picks ────────────────────────────────────────
const boardTemplate = readFileSync(join(__dirname, 'board.html'), 'utf8')
for (const mode of ['rent', 'sale']) {
  const picks = boardPicks[mode]
  const data = {
    project:  PROJECT_NAME,
    mode,
    dataAsOf: picks.map(p => p.lastCheckedAt).filter(Boolean).sort().at(-1) ?? null,
    rows:     picks.map(profileToRow),
  }
  const html = boardTemplate.replace('</head>',
    `<script>/* MOCKUP — engine picks, pre-verification */\nwindow.__BOARD__ = ${JSON.stringify(data)};</script>\n</head>`)
  const dir = join(__dirname, `_board-${TAG}-${mode}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html, 'utf8')
  console.log(`  ✓ _board-${TAG}-${mode}/index.html (${picks.length} rows)`)
}
console.log('Done.')
