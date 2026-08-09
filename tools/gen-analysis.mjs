#!/usr/bin/env node
/**
 * gen-analysis.mjs — Building Analysis จากข้อมูล Sanity สด (แทน snapshot จาก pipeline เก่า)
 *
 * Usage: node --env-file=.env tools/gen-analysis.mjs [--date YYYY-MM-DD] [--studio]
 *   --date    ป้ายรอบของไฟล์ (default วันนี้)
 *   --studio  เขียนเข้า sanity-studio/static/analysis/<date>.html + อัปเดต manifest
 *             (ยังต้อง `sanity deploy` ให้ขึ้นเว็บ)
 *
 * จุดตั้งใจ: ข้อมูล = สถานะที่ทีม cleansing แล้วใน Sanity — expired/taken แยกออกจาก
 * ตาราง active เสมอ, ห้องที่ทีมยืนยัน (verified/published) ติดเครื่องหมายให้เห็น
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { marketModel, floorPremiumOf, iqrKeep } from '../market-model.mjs'
import { dirname, join } from 'path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const DATE = argOf('--date') ?? new Date().toISOString().slice(0, 10)
const TO_STUDIO = args.includes('--studio')

const TOKEN = process.env.SANITY_TOKEN
const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
async function q(query, dataset = 'production') {
  const r = await fetch(`${API}/data/query/${dataset}?query=${encodeURIComponent(query)}&perspective=published`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}`)
  return (await r.json()).result
}

const [profiles, sources, rounds] = await Promise.all([
  q(`*[_type == "unitProfile"]{ refCode, intent, projectName, bedType, sqm, floorZone, priceTHB,
      pricePerSqm, vsFloorPct, vsZonePct, dealTier, hotDeal, goodInvest, negotiable, yieldPct,
      spreadPct, nListings, nPortals, postedByOwner, dualListed, status, firstSeenAt, lastCheckedAt,
      priceHistory }`),
  q(`*[_type == "unitSource"]{ refCode, projectName, floorActual, listings[]{portal, posterType, posterName, intent} }`, 'internal'),
  q(`*[_type == "scrapeRound"] | order(roundDate desc)[0..5]{ roundDate, listings, newUnits, priceChanges, expired }`),
])

/* สำเนาใน sanity-studio/tools/UnitBoardsTool.tsx — KEEP IN SYNC · ยุบเฉพาะพิมพ์เล็ก-ใหญ่
   กับช่องว่าง ไม่แตะตัวคำ เพราะชื่อที่ต่างกันหนึ่งตัวอักษรอาจเป็นคนละบริษัทจริง ๆ */
const agentKey = n => n.toLowerCase().replace(/\s+/g, ' ').trim()
const pickSpelling = m =>
  Object.entries(m).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))[0][0]

/* สะกดมาตรฐานคิดจากข้อมูลทั้งชุด ไม่ใช่รายโครงการ — ไม่งั้นเจ้าเดียวกันขึ้น "PropertyScout"
   ในตึกหนึ่งและ "Propertyscout" ในอีกตึก เพราะแต่ละตึกมีสะกดที่พบบ่อยไม่ตรงกัน */
const AGENT_NAME = (() => {
  const spell = {}
  sources.forEach(s => (s.listings ?? []).forEach(l => {
    const n = (l.posterName ?? '').trim()
    if (!n) return
    ;(spell[agentKey(n)] ??= {})[n] = (spell[agentKey(n)][n] ?? 0) + 1
  }))
  const out = {}
  for (const [k, m] of Object.entries(spell)) out[k] = pickSpelling(m)
  return out
})()

const BLDS = [...new Set(profiles.map(p => p.projectName))].sort()
const BEDS = ['studio', '1bed', '2bed', '3bed', '4bed']
const BED_TH = { studio: 'Studio', '1bed': '1 Bed', '2bed': '2 Bed', '3bed': '3 Bed', '4bed': '4 Bed+' }
const ZONES = ['low', 'mid', 'high']
const ACTIVE = ['candidate', 'verified', 'published']

const floorByRef = new Map(sources.map(s => [s.refCode, s.floorActual]))

/* ค่าคงที่ของตลาดต่อตึก — ใช้ตัวเดียวกับที่ build.mjs จะใช้ ไม่ให้ Analysis กับจอคนละเลข */
const MODEL = marketModel(profiles
  .filter(p => ACTIVE.includes(p.status) && p.pricePerSqm)
  .map(p => ({ building: p.projectName, intent: p.intent, psqm: p.pricePerSqm, floor: floorByRef.get(p.refCode) ?? null })))
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
const fmt = n => n == null ? '—' : Math.round(n).toLocaleString('en-US')
const fmtM = n => n == null ? '—' : (n / 1e6).toFixed(1)
const fmtK = n => n == null ? '—' : (n / 1e3).toFixed(1) + 'K'
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
const STATUS_TH = { candidate: 'รอตรวจ', verified: 'ยืนยันแล้ว', published: 'ขึ้นจอ', expired: 'หมดไป', taken: 'ปิดดีลแล้ว' }

function bldStats(name) {
  const all = profiles.filter(p => p.projectName === name)
  const act = all.filter(p => ACTIVE.includes(p.status))
  const rent = act.filter(p => p.intent === 'rent')
  const sale = act.filter(p => p.intent === 'sale')
  const refs = new Set(act.map(p => p.refCode))
  const dual = new Set(act.filter(p => p.dualListed).map(p => p.refCode))
  const byStatus = {}
  all.forEach(p => byStatus[p.status] = (byStatus[p.status] ?? 0) + 1)
  const yields = act.filter(p => p.yieldPct != null).map(p => p.yieldPct)
  /* นับตามชื่อที่ยุบพิมพ์เล็ก-ใหญ่แล้ว ไม่งั้น PropertyScout กับ Propertyscout กลายเป็น
     สองเจ้าและตกอันดับทั้งคู่ · แสดงผลด้วยสะกดที่พบบ่อยสุดของเจ้านั้น */
  const byKey = {}
  sources.filter(s => s.projectName === name).forEach(s =>
    (s.listings ?? []).forEach(l => {
      const n = (l.posterName ?? '').trim()
      if (n) byKey[agentKey(n)] = (byKey[agentKey(n)] ?? 0) + 1
    }))
  const agents = {}
  for (const [k, c] of Object.entries(byKey)) agents[AGENT_NAME[k] ?? k] = c
  return { name, all, act, rent, sale, refs, dual, byStatus, yields, agents }
}

function matrix(list) {
  // bed × zone → { median psqm, n } เฉพาะห้อง active
  const cells = {}
  for (const bed of BEDS) for (const z of ZONES) {
    const g = list.filter(p => p.bedType === bed && p.floorZone === z && p.pricePerSqm)
    if (g.length) cells[`${bed}|${z}`] = { m: med(g.map(p => p.pricePerSqm)), n: g.length }
  }
  return cells
}

function matrixTable(list, intent) {
  const cells = matrix(list)
  if (!Object.keys(cells).length) return '<p class="mut">ไม่มีข้อมูล active</p>'
  const unit = intent === 'rent' ? '฿/ตรม./เดือน (median)' : '฿/ตรม. (median)'
  let h = `<div class="tw"><table class="m"><thead><tr><th>${unit}</th>${ZONES.map(z => `<th>${z.toUpperCase()}</th>`).join('')}</tr></thead><tbody>`
  for (const bed of BEDS) {
    const row = ZONES.map(z => {
      const c = cells[`${bed}|${z}`]
      return c ? `<td><b>${fmt(c.m)}</b><span class="n">n=${c.n}</span></td>` : '<td class="mut">—</td>'
    })
    if (ZONES.some(z => cells[`${bed}|${z}`])) h += `<tr><th>${BED_TH[bed]}</th>${row.join('')}</tr>`
  }
  return h + '</tbody></table></div>'
}

function dealsTable(act) {
  const deals = act.filter(p => p.dealTier || p.hotDeal || p.goodInvest || p.negotiable)
    .sort((a, b) => (a.vsFloorPct ?? 0) - (b.vsFloorPct ?? 0)).slice(0, 12)
  if (!deals.length) return '<p class="mut">ยังไม่มีดีลติดธง</p>'
  let h = '<div class="tw"><table class="m"><thead><tr><th>Ref</th><th>Type</th><th>Fl</th><th>ราคา</th><th>vs ชั้น</th><th>ธง</th><th>สถานะ</th></tr></thead><tbody>'
  for (const p of deals) {
    const flags = [p.dealTier?.toUpperCase(), p.hotDeal && 'HOT', p.goodInvest && 'INVESTABLE', p.negotiable && 'NEGO'].filter(Boolean)
    const price = p.intent === 'rent' ? fmtK(p.priceTHB) : fmtM(p.priceTHB) + 'M'
    const vcls = (p.vsFloorPct ?? 0) <= -10 ? 'ok' : (p.vsFloorPct ?? 0) < 0 ? 'okish' : ''
    h += `<tr><td>${esc(p.refCode)} <span class="n">${p.intent}</span></td><td>${BED_TH[p.bedType] ?? '—'}</td><td>${floorByRef.get(p.refCode) ?? '—'}</td><td><b>${price}</b></td><td class="${vcls}">${p.vsFloorPct != null ? p.vsFloorPct + '%' : '—'}</td><td>${flags.map(f => `<span class="chip">${f}</span>`).join('')}</td><td>${STATUS_TH[p.status] ?? p.status}</td></tr>`
  }
  return h + '</tbody></table></div>'
}

function agentsTable(agents) {
  const top = Object.entries(agents).sort((a, b) => b[1] - a[1]).slice(0, 10)
  if (!top.length) return '<p class="mut">ไม่มีชื่อ agent ในข้อมูล</p>'
  return `<div class="tw"><table class="m"><thead><tr><th>Agent / ผู้ลงประกาศ</th><th>ประกาศ</th></tr></thead><tbody>${
    top.map(([n, c]) => `<tr><td>${esc(n)}</td><td><b>${c}</b></td></tr>`).join('')}</tbody></table></div>`
}

function priceMoves(act) {
  const moved = act.filter(p => (p.priceHistory ?? []).length > 1).map(p => {
    const h = p.priceHistory
    const prev = h[h.length - 2].price, now = h[h.length - 1].price
    return { p, prev, now, pct: Math.round((now / prev - 1) * 100) }
  }).sort((a, b) => a.pct - b.pct).slice(0, 10)
  if (!moved.length) return '<p class="mut">ยังไม่มีการเปลี่ยนราคาสะสม (เริ่มเก็บจากรอบแรกของวงจรรายสัปดาห์)</p>'
  return `<div class="tw"><table class="m"><thead><tr><th>Ref</th><th>เดิม</th><th>ล่าสุด</th><th>เปลี่ยน</th></tr></thead><tbody>${
    moved.map(({ p, prev, now, pct }) => `<tr><td>${esc(p.refCode)} <span class="n">${p.intent}</span></td><td>${fmt(prev)}</td><td><b>${fmt(now)}</b></td><td class="${pct < 0 ? 'ok' : 'bad'}">${pct > 0 ? '+' : ''}${pct}%</td></tr>`).join('')}</tbody></table></div>`
}

// ── ประกอบหน้า ────────────────────────────────────────────────────────────────
const stats = BLDS.map(bldStats)
const latestRound = rounds?.[0]

const overviewRows = stats.map(s => {
  const rMed = med(s.rent.map(p => p.pricePerSqm).filter(Boolean))
  const sMed = med(s.sale.map(p => p.pricePerSqm).filter(Boolean))
  const y = s.yields.length ? (s.yields.reduce((a, b) => a + b, 0) / s.yields.length).toFixed(2) : null
  return `<tr><th>${esc(s.name)}</th><td>${s.refs.size}</td><td>${s.rent.length}</td><td>${s.sale.length}</td><td>${s.dual.size}</td><td>${fmt(rMed)}</td><td>${fmt(sMed)}</td><td>${y ?? '—'}${y ? '%' : ''}</td><td>${(s.byStatus.verified ?? 0) + (s.byStatus.published ?? 0)}</td><td class="mut">${s.byStatus.expired ?? 0}</td></tr>`
}).join('')


/* ── Floor Premium ─────────────────────────────────────────────────────────
   บล็อกแรกของทุกตึก เพราะบล็อกอื่นอ้างอิงค่าพวกนี้ · มี note วิธีคำนวณพับไว้
   เพื่อให้ตรวจย้อนได้ว่าเลขมาจากไหน ไม่ต้องเชื่ออย่างเดียว */
const n0 = x => x == null ? '—' : Math.round(x).toLocaleString()
const n1 = x => x == null ? '—' : x.toFixed(1)
const n2 = x => x == null ? '—' : x.toFixed(2)
function premiumBlock(name) {
  const m = MODEL.byBuilding[name]
  if (!m) return ''
  const raw = m.fpRaw
  const note = `<details class="fpnote"><summary>วิธีคำนวณ</summary><pre>
Floor Premium (ขาย)  — หน่วย ฿/ตร.ม. ต่อ 1 ชั้น
  1. ตัดห้องผิดปกติออกด้วย IQR        เหลือ ${m.nSale} ห้อง
  2. เรียงตามชั้น แบ่ง 3 กลุ่ม         กลุ่มละ ${raw ? raw.k : '—'} ห้อง (กลุ่มกลางไม่ใช้)
  3. กลุ่มชั้นล่าง  median ชั้น ${n1(raw?.loFloor)}   median ฿/ตร.ม. ${n0(raw?.loPsqm)}
     กลุ่มชั้นบน    median ชั้น ${n1(raw?.hiFloor)}   median ฿/ตร.ม. ${n0(raw?.hiPsqm)}
  4. (${n0(raw?.hiPsqm)} − ${n0(raw?.loPsqm)}) ÷ (${n1(raw?.hiFloor)} − ${n1(raw?.loFloor)}) = ${n0(raw?.value)}
  5. ${m.usedGlobalFp
        ? `ค่าของตึกนี้ ${raw ? (raw.value <= 0 ? 'ติดลบ' : 'คำนวณไม่ได้') : 'คำนวณไม่ได้'} → ใช้ค่ากลางของทุกตึกแทน = ${n0(MODEL.fpSale)}`
        : `ใช้ค่าของตึกนี้เอง = ${n0(m.fpSale)}`}

yield ของตึก
  (ค่าเช่าอ้างอิง ${n1(m.rentRef)} × 12) ÷ ราคาขายอ้างอิง ${n0(m.saleRef)} = ${n2((m.yieldUsed ?? 0) * 100)}%
  ตัด noise ทั้งสองฝั่งก่อนหาร — ตัดฝั่งเดียวจะทำให้ตัวหารเล็กลงข้างเดียว yield พองขึ้น

Floor Premium (เช่า)
  แบบ A ใช้ yield ตึก   ${n0(m.fpSale)} × ${n2((m.yieldUsed ?? 0) * 100)}% ÷ 12 = ${n2(m.fpRentOwn)}
  แบบ B ใช้ yield กลาง  ${n0(m.fpSale)} × ${n2(MODEL.avgYield * 100)}% ÷ 12 = ${n2(m.fpRentAvg)}

ราคาอ้างอิงและชั้นอ้างอิง
  ทั้งคู่มาจากห้องชุดเดียวกัน (หลังตัด IQR) — ราคาใช้ mean ชั้นก็ต้องใช้ mean
  ขาย  ${n0(m.saleRef)} ฿/ตร.ม. ที่ชั้น ${n1(m.refFloorSale)}
  เช่า  ${n1(m.rentRef)} ฿/ตร.ม. ที่ชั้น ${n1(m.refFloorRent)}

ราคาที่ควรเป็นของชั้น F = ราคาอ้างอิง + Floor Premium × (F − ชั้นอ้างอิง)
ความคุ้ม = (ราคาจริง − ราคาที่ควรเป็น) ÷ ราคาที่ควรเป็น    ติดลบ = ถูกกว่าที่ควร
</pre></details>`
  return `<h3>Floor Premium · ค่าชั้นของตึกนี้</h3>
  <div class="tw"><table class="m"><tbody>
    <tr><th>Floor Premium (ขาย)</th><td><b>${n0(m.fpSale)}</b> ฿/ตร.ม. ต่อชั้น${m.usedGlobalFp ? ' <span class="mut">(ใช้ค่ากลางทุกตึก)</span>' : ''}</td></tr>
    <tr><th>Floor Premium (เช่า)</th><td><b>${n2(m.fpRentOwn)}</b> ฿/ตร.ม./เดือน ต่อชั้น <span class="mut">· แบบ yield กลาง ${n2(m.fpRentAvg)}</span></td></tr>
    <tr><th>yield</th><td>ตึกนี้ <b>${n2((m.yieldOwn ?? 0) * 100)}%</b> <span class="mut">· กลางทุกตึก ${n2(MODEL.avgYield * 100)}%</span></td></tr>
    <tr><th>ค่าเช่าอ้างอิง</th><td>A <b>${n1(m.rentRef)}</b> <span class="mut">· B ${n1(m.rentRefAvg)}</span> ฿/ตร.ม./เดือน</td></tr>
    <tr><th>ราคาขายอ้างอิง</th><td><b>${n0(m.saleRef)}</b> ฿/ตร.ม.</td></tr>
    <tr><th>ชั้นอ้างอิง</th><td>เช่า ${n1(m.refFloorRent)} · ขาย ${n1(m.refFloorSale)}</td></tr>
  </tbody></table></div>${note}`
}
function premiumOverview() {
  const rows = Object.entries(MODEL.byBuilding).filter(([, m]) => m.saleRef != null).map(([b, m]) =>
    `<tr><th>${esc(b)}</th><td>${m.fpRaw ? n0(m.fpRaw.value) : '—'}${m.usedGlobalFp ? ' <span class="mut">→ ใช้กลาง</span>' : ''}</td>` +
    `<td>${n0(m.fpSale)}</td><td>${n2((m.yieldOwn ?? 0) * 100)}%</td><td>${n2(m.fpRentOwn)}</td><td>${n2(m.fpRentAvg)}</td>` +
    `<td class="mut">${m.nSale}/${m.nRent}</td></tr>`).join('')
  return `<h2>Floor Premium · ค่าชั้น ทุกตึก</h2>
  <div class="tw"><table class="m"><thead><tr><th>ตึก</th><th>คำนวณได้</th><th>ที่ใช้จริง</th><th>yield ตึก</th><th>เช่า/ชั้น (A)</th><th>เช่า/ชั้น (B)</th><th class="mut">n ขาย/เช่า</th></tr></thead><tbody>${rows}
  <tr><th>ค่ากลางทุกตึก</th><td colspan="2"><b>${n0(MODEL.fpSale)}</b> ฿/ตร.ม./ชั้น</td><td colspan="4"><b>${n2(MODEL.avgYield * 100)}%</b> yield กลาง</td></tr>
  </tbody></table></div>
  <p class="mut">ตึกที่ค่าติดลบหรือห้องขายน้อยกว่า 20 ห้อง ใช้ค่ากลางของทุกตึกแทน · วิธีคำนวณอยู่ในแท็บของแต่ละตึก</p>`
}

const tabs = [`<button class="tab on" data-t="t-over">ภาพรวม</button>`]
const panes = [`<section class="pane on" id="t-over">
  <h2>ภาพรวมทุกตึก <span class="n">เฉพาะห้อง active (ทีม cleansing แล้ว — expired/taken ไม่นับ)</span></h2>
  <div class="tw"><table class="m"><thead><tr><th>ตึก</th><th>ห้อง</th><th>เช่า</th><th>ขาย</th><th>Dual</th><th>เช่า ฿/ตรม.</th><th>ขาย ฿/ตรม.</th><th>Yield</th><th>ยืนยันแล้ว</th><th>expired</th></tr></thead><tbody>${overviewRows}</tbody></table></div>
  ${latestRound ? `<p class="mut">รอบเก็บข้อมูลล่าสุด: <b>${latestRound.roundDate}</b> · ${latestRound.listings ?? '—'} ประกาศ · ใหม่ ${latestRound.newUnits ?? 0} · ราคาเปลี่ยน ${latestRound.priceChanges ?? 0} · expired ${latestRound.expired ?? 0}</p>` : '<p class="mut">ยังไม่มีรอบจากวงจรรายสัปดาห์ — ข้อมูลชุดแรกมาจาก pipeline 29 Jul</p>'}
  ${premiumOverview()}
</section>`]

for (const s of stats) {
  const id = 't-' + s.name.toLowerCase().replace(/\W+/g, '')
  tabs.push(`<button class="tab" data-t="${id}">${esc(s.name)}</button>`)
  panes.push(`<section class="pane" id="${id}">
    <h2>${esc(s.name)} <span class="n">active ${s.refs.size} ห้อง · ${Object.entries(s.byStatus).map(([k, v]) => `${STATUS_TH[k] ?? k} ${v}`).join(' · ')}</span></h2>
    ${premiumBlock(s.name)}
    <div class="cols">
      <div><h3>เช่า — ราคากลางต่อตรม.</h3>${matrixTable(s.rent, 'rent')}</div>
      <div><h3>ขาย — ราคากลางต่อตรม.</h3>${matrixTable(s.sale, 'sale')}</div>
    </div>
    <h3>ดีลติดธง (เรียงถูกกว่าชั้นมากสุด)</h3>${dealsTable(s.act)}
    <div class="cols">
      <div><h3>ราคาขยับล่าสุด</h3>${priceMoves(s.act)}</div>
      <div><h3>Agent ที่ลงประกาศมากสุด</h3>${agentsTable(s.agents)}</div>
    </div>
  </section>`)
}

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Building Analysis · ${DATE}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;600;700&family=IBM+Plex+Sans+Thai:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--navy:#0E3361;--ink:#14213A;--bronze:#C9864C;--line:#E6E9F1;--bg:#F4F6FA;--ok:#1B7A4B;--bad:#B3402E}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 Anuphan,'IBM Plex Sans Thai',sans-serif}
header{background:#fff;border-bottom:1px solid var(--line);padding:14px 22px}
header h1{margin:0;font-size:19px;color:var(--navy)}header p{margin:2px 0 0;font-size:13px;color:#5A6478}
.tabs{position:sticky;top:0;z-index:5;display:flex;gap:4px;overflow-x:auto;background:#fff;border-bottom:1px solid var(--line);padding:8px 18px}
.tab{border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 13px;font:600 13px Anuphan,'IBM Plex Sans Thai',sans-serif;color:var(--ink);cursor:pointer;white-space:nowrap}
.tab.on{background:var(--navy);border-color:var(--navy);color:#fff}
main{padding:20px 22px;max-width:1200px}
.pane{display:none}.pane.on{display:block}
h2{font-size:17px;color:var(--navy);margin:4px 0 14px}h3{font-size:14px;margin:20px 0 8px;color:var(--navy)}
.n{font-weight:400;font-size:12px;color:#5A6478;margin-left:6px}
.mut{color:#7A849B;font-size:13px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px}
.tw{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:10px}
table.m{border-collapse:collapse;width:100%;font-size:13.5px}
.m th,.m td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;white-space:nowrap}
.m thead th{background:#FAFBFD;color:var(--navy);font-size:12.5px;position:sticky;top:0}
.m tbody tr:last-child td,.m tbody tr:last-child th{border-bottom:0}
.m tbody th{font-weight:600}
.chip{display:inline-block;background:#F3E7DA;color:#8A5526;border-radius:6px;padding:1px 7px;font-size:11px;font-weight:600;margin-right:4px}
.fpnote{margin:6px 0 18px}
.fpnote summary{cursor:pointer;font-size:13px;color:#0f3460;font-weight:600;user-select:none}
.fpnote pre{background:#f6f8fb;border:1px solid #e3e8ef;border-radius:6px;padding:12px 14px;
  font-size:12.5px;line-height:1.6;overflow-x:auto;white-space:pre-wrap}
.ok{color:var(--ok);font-weight:600}.okish{color:#3E6E2F}.bad{color:var(--bad);font-weight:600}
</style></head><body>
<header><h1>Building Analysis <span class="n">ข้อมูลสดจาก Sanity · สร้าง ${DATE}</span></h1>
<p>ตัวเลขสะท้อนการ cleansing ของทีม — expired / taken ถูกแยกออกจากตาราง active แล้ว</p></header>
<nav class="tabs">${tabs.join('')}</nav>
<main>${panes.join('')}</main>
<script>
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===b))
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('on',p.id===b.dataset.t))
}))
</script></body></html>`

const out = join(ROOT, '_analysis-live.html')
writeFileSync(out, html)
console.log(`✓ ${out} (${Math.round(html.length / 1024)} KB · ${BLDS.length} ตึก · ${profiles.length} profiles)`)

if (TO_STUDIO) {
  const dir = join(ROOT, 'sanity-studio', 'static', 'analysis')
  writeFileSync(join(dir, `${DATE}.html`), html)
  const mf = join(dir, 'manifest.json')
  const m = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { rounds: [] }
  if (!m.rounds.includes(DATE)) m.rounds.push(DATE)
  writeFileSync(mf, JSON.stringify(m))
  console.log(`✓ studio static: analysis/${DATE}.html + manifest (${m.rounds.length} รอบ) — อย่าลืม sanity deploy`)
}
