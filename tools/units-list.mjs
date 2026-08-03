#!/usr/bin/env node
/**
 * units-list.mjs — ลิสต์ห้องทุกโครงการจาก Sanity (live) — หนึ่งแถวต่อห้องจริง
 *
 * Usage:  node --env-file=.env tools/units-list.mjs
 * Output: _units-all.html                 — ทุกโครงการ, แท็บเลือกตึก, filter, ค้นหา, sorting, key stats
 *         _units-archive/<dataDate>.html  — สำเนา snapshot ของรอบนั้น (pipeline ทับข้อมูลในที่เดิมทุกรอบ)
 *         _board-<tag>-{rent,sale}/       — บอร์ด mockup ต่อโครงการจาก engine ตัวเดียวกับจอจริง
 *
 * โครงหนึ่งแถวต่อ refCode (เหมือน units-review.html ต้นแบบ): ฝั่งเช่า/ขายของห้อง
 * เดียวกันรวมอยู่ในแถวเดียว มีคอลัมน์ราคาเช่า + ราคาขาย + จุดเด่นแยกฝั่ง + Yield
 * ฟอนต์ตามต้นแบบ: Cordia New / Sarabun · ไม่รวมห้อง expired
 */
import { writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { selectBoardRows, passesSanity, profileToRow, PROFILE_PROJECTION } from '../board-engine.mjs'

const __dirname = dirname(dirname(fileURLToPath(import.meta.url)))
const TOKEN = process.env.SANITY_TOKEN
if (!TOKEN) { console.error('SANITY_TOKEN not set — run with node --env-file=.env'); process.exit(1) }

async function fetchGroq(query, dataset) {
  const url = `https://awjj9g8u.api.sanity.io/v2024-01-01/data/query/${dataset}` +
              `?query=${encodeURIComponent(query)}&perspective=published`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`Sanity ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}

console.log('Fetching ALL unit profiles + sources from Sanity…')
const [profiles, sources] = await Promise.all([
  fetchGroq(`*[_type == "unitProfile" && status != "expired"] | order(projectName asc, refCode asc, intent asc){ projectName, ${PROFILE_PROJECTION} }`, 'production'),
  fetchGroq(`*[_type == "unitSource"]{ refCode, floorActual, "listings": listings[]{ portal, url, intent, posterType, posterName } }`, 'internal'),
])
const srcByRef = new Map(sources.map(s => [s.refCode, s]))
const dataDate = profiles.map(p => p.lastCheckedAt).filter(Boolean).sort().at(-1) ?? new Date().toISOString().slice(0, 10)

// การบันทึก lineup ย้ายไปอยู่ใน Studio (tools/UnitBoardsTool.tsx) — หน้านี้
// เหลือบทบาท snapshot/archive รายรอบเท่านั้น
const NAME_TO_CODE = {
  '39 by Sansiri': '39-by-sansiri', 'The Lumpini 24': 'lumpini-24',
  'The Room Sukhumvit 21': 'the-room-skv21', 'Noble BE19': 'noble-be19',
  'Mahogany Tower': 'mahogany-tower', 'Park 24': 'park24',
}

const byProject = new Map()
for (const p of profiles) {
  if (!byProject.has(p.projectName)) byProject.set(p.projectName, [])
  byProject.get(p.projectName).push(p)
}
const projectNames = [...byProject.keys()].sort()
console.log(`  ${profiles.length} profiles · ${projectNames.length} projects · round ${dataDate}`)

const isNewP = p => p?.firstSeenAt && Math.abs(new Date(p.firstSeenAt) - new Date(dataDate)) < 8 * 864e5
const chip = (t, c, tip = '') => `<span class="chip ${c}"${tip ? ` title="${tip}"` : ''}>${t}</span>`

// per-unit tooltip = ตัวเลขจริงของห้องนั้น (หัวคอลัมน์อธิบายเกณฑ์รวม)
const dealCell = p => {
  if (!p) return ''
  const out = []
  if (p.dealTier === 'super' || p.dealTier === 'best')
    out.push(chip(p.dealTier.toUpperCase(), p.dealTier === 'super' ? 'g2' : 'g1',
      `ถูกกว่าค่าเฉลี่ยชั้นเดียวกัน ${Math.abs(p.vsFloorPct ?? 0)}%`))
  else if (p.dealTier === 'good')
    out.push(chip('GOOD', 'g1', `ถูกกว่าค่าเฉลี่ยโซน ${Math.abs(p.vsZonePct ?? 0)}%`))
  if (!passesSanity(p, p.intent))
    out.push(chip('ตกตัวกรอง', 'x', 'ข้อมูลผิดปกติ (ตรม./ราคา/฿ต่อตรม./สเปรด) — ไม่เข้าคัดอัตโนมัติ'))
  return out.join('')
}
const hotCell = p => p?.hotDeal ? chip('HOT', 'o', `${p.nListings ?? '?'} ประกาศ — agent แข่งกันปล่อย`) : ''
const vsCell = v => v == null ? '—' : `<span class="${v < 0 ? 'neg' : 'mut'}">${v > 0 ? '+' : ''}${v}%</span>`

const boardTemplate = readFileSync(join(__dirname, 'board.html'), 'utf8')

const sections = projectNames.map((name, bi) => {
  const pool = byProject.get(name)
  const tag = (pool[0]?.refCode ?? 'x-U').split('-U')[0].toLowerCase()

  // ── Board picks + per-project board mockup bakes ──────────────────────────
  const onBoard = { rent: new Map(), sale: new Map() }   // refCode → pick reason
  const boardLinks = []
  for (const mode of ['rent', 'sale']) {
    const picks = selectBoardRows(pool.filter(p => p.intent === mode), mode, 19)
    picks.forEach(p => onBoard[mode].set(p.refCode, p.__pick ?? ''))
    if (!picks.length) continue
    const boardData = {
      project: name, mode,
      dataAsOf: picks.map(p => p.lastCheckedAt).filter(Boolean).sort().at(-1) ?? dataDate,
      rows: picks.map(profileToRow),
    }
    const dir = join(__dirname, `_board-${tag}-${mode}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), boardTemplate.replace('</head>',
      `<script>/* MOCKUP — engine picks, pre-verification */\nwindow.__BOARD__ = ${JSON.stringify(boardData)};</script>\n</head>`), 'utf8')
    boardLinks.push(`<a href="@@BASE@@_board-${tag}-${mode}/" target="_blank">บอร์ด${mode === 'rent' ? 'เช่า' : 'ขาย'} ↗</a>`)
  }

  // ── Merge per-intent profiles → one record per physical unit ──────────────
  const units = new Map()
  for (const p of pool) {
    const u = units.get(p.refCode) ?? { refCode: p.refCode, bedType: p.bedType, sqm: p.sqm, zone: p.floorZone }
    u[p.intent] = p
    units.set(p.refCode, u)
  }
  const unitArr = [...units.values()]

  // ไซซ์ที่มีจริงในข้อมูลต่อฝั่ง — ช่อง Min ของไซซ์ที่ไม่มี = disabled (value 0)
  const bedsPresent = {
    r: new Set(pool.filter(p => p.intent === 'rent').map(p => p.bedType)),
    s: new Set(pool.filter(p => p.intent === 'sale').map(p => p.bedType)),
  }
  const minInput = (m, bed, dataP) => {
    const ok = bedsPresent[m].has(bed)
    return `<input type="number" class="sq" data-m="${m}" data-p="${dataP}" value="${ok ? 1 : 0}" min="0"${ok ? '' : ' disabled title="ตึกนี้ไม่มีไซซ์นี้ในข้อมูล"'}>`
  }
  const nRent = pool.filter(p => p.intent === 'rent').length
  const stat = {
    units: unitArr.length,
    rent: nRent,
    sale: pool.length - nRent,
    dual: unitArr.filter(u => u.rent && u.sale).length,
    board: onBoard.rent.size + onBoard.sale.size,
    candidate: pool.filter(p => p.status === 'candidate').length,
    verified: pool.filter(p => p.status === 'verified').length,
    published: pool.filter(p => p.status === 'published').length,
    newRound: unitArr.filter(u => isNewP(u.rent) || isNewP(u.sale)).length,
    filtered: pool.filter(p => !passesSanity(p, p.intent)).length,
  }
  const statChip = (label, val, cls = '') =>
    `<div class="st ${cls}"><div class="stl">${label}</div><div class="stv">${val}</div></div>`
  const statsHtml = [
    statChip('ห้องจริง', stat.units),
    statChip('ประกาศเช่า / ขาย', `${stat.rent} / ${stat.sale}`),
    statChip('Dual (เช่า+ขาย)', stat.dual),
    statChip('ขึ้นบอร์ด', stat.board, 'stg'),
    statChip('รอตรวจ (candidate)', stat.candidate),
    statChip('ตรวจแล้ว (verified)', stat.verified, stat.verified ? 'stb' : ''),
    statChip('ขึ้นจอได้ (published)', stat.published, stat.published ? 'stg' : 'str'),
    statChip('ใหม่รอบนี้', stat.newRound),
    statChip('ตกตัวกรอง', stat.filtered, stat.filtered ? 'sto' : ''),
  ].join('')

  const rows = unitArr.map(u => {
    const src = srcByRef.get(u.refCode)
    const br = u.rent && onBoard.rent.has(u.refCode)
    const bs = u.sale && onBoard.sale.has(u.refCode)
    const rzr = br ? (onBoard.rent.get(u.refCode) ?? '') : ''
    const rzs = bs ? (onBoard.sale.get(u.refCode) ?? '') : ''
    const anyFiltered = (u.rent && !passesSanity(u.rent, 'rent')) || (u.sale && !passesSanity(u.sale, 'sale'))
    const yieldPct = u.rent?.yieldPct ?? u.sale?.yieldPct
    const nego = [u.rent, u.sale].find(p => p?.negotiable)
    const spread = Math.max(u.rent?.spreadPct ?? -1, u.sale?.spreadPct ?? -1)
    const ownerSides = [u.rent?.postedByOwner && 'เช่า', u.sale?.postedByOwner && 'ขาย'].filter(Boolean)
    // Posted by: owner-posted (ไม่มีชื่อ agent โดยนิยาม) และ/หรือรายชื่อ agent จากประกาศ
    const srcListings = srcByRef.get(u.refCode)?.listings ?? []
    const ownerPosted = ownerSides.length > 0 || srcListings.some(l => l.posterType === 'owner')
    const agentNames = [...new Set(srcListings
      .filter(l => l.posterType !== 'owner' && l.posterName)
      .map(l => l.posterName.trim())
      .filter(n => /[A-Za-zก-๙]{3}/.test(n) && !/^[([]/.test(n) && !['line', 'k.', 'tel', 'whatsapp'].includes(n.toLowerCase())))]
    const agentTip = [...new Set(srcListings.filter(l => l.posterName).map(l => `${l.posterName.trim()} (${l.portal})`))].join(' · ')
    const postedBy = [
      ownerPosted ? '<span class="chip g1" title="เจ้าของโพสต์เอง — ติดต่อตรงไม่มีคอมซ้อน">🏠 Owner</span>' : '',
      agentNames.slice(0, 2).map(n => `<span class="agn" title="${agentTip}">${n}</span>`).join(''),
      agentNames.length > 2 ? `<span class="agn mut" title="${agentTip}">+${agentNames.length - 2}</span>` : '',
    ].filter(Boolean).join(' ') || '—'
    const rpsqm = u.rent ? Math.round(u.rent.pricePerSqm ?? (u.rent.priceTHB / u.rent.sqm)) : null
    const spsqm = u.sale ? Math.round((u.sale.pricePerSqm ?? (u.sale.priceTHB / u.sale.sqm)) / 1000) : null
    const links = [...new Map((src?.listings ?? []).map(l => [l.url, l])).values()]
      .map(l => `<a href="${l.url}" target="_blank">${l.portal}</a>`).join(' · ')
    const statusCell = [
      u.rent && `เช่า·${u.rent.status}`,
      u.sale && `ขาย·${u.sale.status}`,
    ].filter(Boolean).join('<br>')
    const simAttrs = ['rent', 'sale'].map(side => {
      const p = u[side], x = side === 'rent' ? 'r' : 's'
      if (!p) return `data-ok${x}="0"`
      return `data-ok${x}="${passesSanity(p, side) ? 1 : 0}" data-dt${x}="${(p.dealTier ?? '')[0] ?? ''}" data-h${x}="${p.hotDeal ? 1 : 0}" data-iv${x}="${p.goodInvest ? 1 : 0}" data-ng${x}="${p.negotiable ? 1 : 0}" data-ow${x}="${p.postedByOwner ? 1 : 0}" data-nl${x}="${p.nListings ?? 0}" data-spr${x}="${p.spreadPct ?? 0}"`
    }).join(' ')
    return `<tr data-r="${u.rent ? 1 : 0}" data-s="${u.sale ? 1 : 0}" data-br="${br ? 1 : 0}" data-bs="${bs ? 1 : 0}" data-obr="${br ? 1 : 0}" data-obs="${bs ? 1 : 0}" data-rzr="${rzr}" data-rzs="${rzs}" data-orzr="${rzr}" data-orzs="${rzs}" data-bed="${u.bedType ?? ''}" ${simAttrs} data-f="${anyFiltered ? 1 : 0}" data-n="${isNewP(u.rent) || isNewP(u.sale) ? 1 : 0}" data-ref="${u.refCode}" data-ag="${agentNames.join('|')}" data-own="${ownerPosted ? 1 : 0}" data-sqm="${u.sqm ?? -1}" data-fl="${src?.floorActual ?? -1}" data-rent="${u.rent?.priceTHB ?? -1}" data-sale="${u.sale?.priceTHB ?? -1}" data-rpsqm="${rpsqm ?? -1}" data-spsqm="${spsqm ?? -1}" data-yield="${yieldPct ?? -1}" data-vsr="${u.rent?.vsFloorPct ?? 9999}" data-vss="${u.sale?.vsFloorPct ?? 9999}" data-spread="${spread}">
      <td class="num idx"></td>
      <td><b>${u.refCode}</b></td>
      <td>${u.bedType ?? '—'}</td><td class="num">${u.sqm ?? '—'}</td><td>${u.zone ?? '—'}</td>
      <td class="num">${src?.floorActual ?? '—'}</td>
      <td class="num">${u.rent ? (u.rent.priceTHB / 1000).toFixed(1) + 'K' : '—'}</td>
      <td class="num">${rpsqm != null ? '฿' + rpsqm.toLocaleString('en-US') : '—'}</td>
      <td class="num">${u.rent ? vsCell(u.rent.vsFloorPct) : '—'}</td>
      <td class="fc">${dealCell(u.rent)}</td>
      <td class="pncell">${u.rent ? `<label class="pnl"><input type="checkbox" class="pn" data-m="r"${u.rent.pinToBoard ? ' checked' : ''}></label>` : ''}</td>
      <td class="fc">${hotCell(u.rent)}</td>
      <td class="num">${u.sale ? (u.sale.priceTHB / 1e6).toFixed(1) + 'M' : '—'}</td>
      <td class="num">${spsqm != null ? spsqm + 'K' : '—'}</td>
      <td class="num">${u.sale ? vsCell(u.sale.vsFloorPct) : '—'}</td>
      <td class="fc">${dealCell(u.sale)}</td>
      <td class="pncell">${u.sale ? `<label class="pnl"><input type="checkbox" class="pn" data-m="s"${u.sale.pinToBoard ? ' checked' : ''}></label>` : ''}</td>
      <td class="fc">${hotCell(u.sale)}</td>
      <td class="fc">${(u.rent?.goodInvest || u.sale?.goodInvest) ? chip('INVESTABLE', 'g1', `dual + yield ${yieldPct != null ? yieldPct.toFixed(1) + '%' : '?'} สูงกว่าค่าเฉลี่ยตึก`) : ''}</td>
      <td class="num ${yieldPct >= 5 ? 'neg' : ''}">${yieldPct != null ? yieldPct.toFixed(1) + '%' : '—'}</td>
      <td class="fc">${nego ? chip('NEGO', 'n', `${nego.nPortals ?? '?'} portals · ราคาต่างกัน ${nego.spreadPct ?? '?'}% (ฝั่ง${nego.intent === 'rent' ? 'เช่า' : 'ขาย'})`) : ''}</td>
      <td class="num">${spread >= 0 ? spread + '%' : '—'}</td>
      <td class="fc" style="min-width:120px">${postedBy}</td>
      <td style="font-size:12.5px;line-height:1.5">${statusCell}</td>
      <td>${br ? `<span class="bd">บอร์ดเช่า</span><span class="rz" title="เกณฑ์ที่ทำให้ติดบอร์ด">${rzr === 'PIN' ? 'SELECT' : rzr}</span> ` : ''}${bs ? `<span class="bd">บอร์ดขาย</span><span class="rz" title="เกณฑ์ที่ทำให้ติดบอร์ด">${rzs === 'PIN' ? 'SELECT' : rzs}</span>` : ''}</td>
      <td class="links"><div class="lw">${links || '—'}</div></td>
    </tr>`
  }).join('\n')

  return {
    tab: `<button class="tab${bi === 0 ? ' active' : ''}" onclick="showB(${bi},this)">${name}</button>`,
    section: `<div id="b${bi}" class="sect${bi === 0 ? ' active' : ''}" data-name="${name}">
      <div class="bh hstick"><h2>${name}</h2><span class="bm">${boardLinks.length ? boardLinks.join(' · ') : ''}</span></div>
      <div class="stats hstick">${statsHtml}</div>
      <div class="sim hstick">
        <b>Board policy simulator</b>
        <span class="simnote">simulates on this round's full data — the live board bakes only published + contactable units · real policy is set in Studio (unitBoard → Selection Policy)</span>
        <div class="simrow"><span class="simlabel">Rent board</span>
          Quota <input type="number" class="sq" data-m="r" data-p="quota" value="19" min="1" max="19">
          SUPER <input type="number" class="sq" data-m="r" data-p="superQ" value="1" min="0">
          BEST <input type="number" class="sq" data-m="r" data-p="bestQ" value="1" min="0">
          HOT <input type="number" class="sq" data-m="r" data-p="hotQ" value="1" min="0">
          NEGO <input type="number" class="sq" data-m="r" data-p="negoQ" value="1" min="0">
          INVEST <input type="number" class="sq" data-m="r" data-p="investQ" value="0" min="0">
        </div>
        <div class="simrow"><span class="simlabel simsub">Min sizes</span>
          STUDIO ${minInput('r', 'studio', 'studioMin')}
          1BED ${minInput('r', '1bed', 'b1Min')}
          2BED ${minInput('r', '2bed', 'b2Min')}
          3BED ${minInput('r', '3bed', 'b3Min')}
          4BED+ ${minInput('r', '4bed', 'b4Min')}
          <span class="simsum" data-m="r"></span>
        </div>
        <div class="simrow simgap"><span class="simlabel">Sale board</span>
          Quota <input type="number" class="sq" data-m="s" data-p="quota" value="19" min="1" max="19">
          SUPER <input type="number" class="sq" data-m="s" data-p="superQ" value="1" min="0">
          BEST <input type="number" class="sq" data-m="s" data-p="bestQ" value="1" min="0">
          HOT <input type="number" class="sq" data-m="s" data-p="hotQ" value="1" min="0">
          NEGO <input type="number" class="sq" data-m="s" data-p="negoQ" value="1" min="0">
          INVEST <input type="number" class="sq" data-m="s" data-p="investQ" value="1" min="0">
        </div>
        <div class="simrow"><span class="simlabel simsub">Min sizes</span>
          STUDIO ${minInput('s', 'studio', 'studioMin')}
          1BED ${minInput('s', '1bed', 'b1Min')}
          2BED ${minInput('s', '2bed', 'b2Min')}
          3BED ${minInput('s', '3bed', 'b3Min')}
          4BED+ ${minInput('s', '4bed', 'b4Min')}
          <span class="simsum" data-m="s"></span>
        </div>
        <div class="simrow">
          <button class="ft simapply">Simulate</button>
          <button class="ft simprev" data-m="r" title="เปิดบอร์ดจริงด้วยรายการที่เห็นอยู่ตอนนี้ (รวม pin)">Preview rent board ↗</button>
          <button class="ft simprev" data-m="s" title="เปิดบอร์ดจริงด้วยรายการที่เห็นอยู่ตอนนี้ (รวม pin)">Preview sale board ↗</button>
          <button class="ft simall">Apply to all projects</button>
          <button class="ft simcopy">Copy picks</button>
          <button class="ft simreset">Reset</button>
        </div>
        <div class="siminfo"></div>
        <div class="simwarn"></div>
      </div>
      <div class="hstick">
        <button class="ft active" data-k="all">All</button>
        <button class="ft" data-k="rent">Has rent</button>
        <button class="ft" data-k="sale">Has sale</button>
        <button class="ft" data-k="dual">Dual</button>
        <button class="ft" data-k="brent">On board · rent</button>
        <button class="ft" data-k="bsale">On board · sale</button>
        <button class="ft" data-k="new">New this round</button>
        <button class="ft" data-k="fx">Filtered out</button>
        <input class="q" placeholder="Search Ref / Agent" style="width:200px">
        <span class="n"></span>
      </div>
      <table><thead><tr>
        <th class="noSort">#</th><th title="รหัสอ้างอิงห้อง — คงที่ทุกมุมมอง">Ref</th><th>Type<span class="cf" data-ci="2" title="filter">▼</span></th><th>SQM</th>
        <th title="Low / Mid / High ตามช่วงชั้นของตึก">Zone<span class="cf" data-ci="4" title="filter">▼</span></th><th title="ชั้นจริง (internal เท่านั้น)">Floor</th>
        <th title="ค่าเช่าต่ำสุดที่พบ (พันบาท/เดือน)">Rent (K)</th>
        <th title="ค่าเช่าต่อ ตร.ม. ต่อเดือน">฿/sqm</th>
        <th title="เทียบค่าเฉลี่ย ฿/ตร.ม. ชั้นเดียวกัน (ติดลบ = ถูกกว่า)">vs Floor</th>
        <th title="SUPER = ถูกกว่าชั้น ≥10% · BEST = ถูกกว่าชั้น 0-10% · GOOD = ถูกกว่าโซน >10%">Rent Deal</th>
        <th class="noSort" title="เลือกมือขึ้นบอร์ดเช่า — ติ๊กแล้วติดบอร์ดแน่นอนเมื่อจำลอง">Select Rent</th>
        <th title="HOT = agent ≥2 รายแข่งปล่อย">Hot</th>
        <th title="ราคาขายต่ำสุดที่พบ (ล้านบาท)">Sale (M)</th>
        <th title="ราคาขายต่อ ตร.ม. (พันบาท)">K/sqm</th>
        <th title="เทียบค่าเฉลี่ย ฿/ตร.ม. ชั้นเดียวกัน (ติดลบ = ถูกกว่า)">vs Floor</th>
        <th title="SUPER = ถูกกว่าชั้น ≥10% · BEST = ถูกกว่าชั้น 0-10% · GOOD = ถูกกว่าโซน >10%">Sale Deal</th>
        <th class="noSort" title="เลือกมือขึ้นบอร์ดขาย — ติ๊กแล้วติดบอร์ดแน่นอนเมื่อจำลอง">Select Sale</th>
        <th title="HOT = agent ≥2 รายแข่งขาย">Hot</th>
        <th title="INVESTABLE = มีทั้งเช่า+ขาย และ yield สูงกว่าค่าเฉลี่ยตึกเกิน 1.5 จุด">Invest</th>
        <th title="Yield รายห้อง = เช่าต่ำสุด × 12 ÷ ขายต่ำสุด (เฉพาะห้อง dual)">Yield</th>
        <th title="NEGO = ลงประกาศ ≥3 portals และราคาต่างกัน ≥5% — มีช่องต่อรอง">Nego</th>
        <th title="ราคาห้องเดียวกันต่างกันกี่ % ข้าม portal">Spread</th>
        <th title="ใครลงประกาศ — 🏠 Owner = เจ้าของโพสต์เอง (ไม่มีชื่อ agent โดยนิยาม) · ชื่อ = agent/agency ที่โพสต์">Posted by<span class="cf" data-ci="22" title="filter">▼</span></th>
        <th>Status<span class="cf" data-ci="23" title="filter">▼</span></th><th title="ห้องที่ engine เลือกขึ้นบอร์ด">Board</th><th title="ลิงก์ประกาศต้นทางทุก portal">Sources</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`,
  }
})

const archDir = join(__dirname, '_units-archive')
mkdirSync(archDir, { recursive: true })
const pastRounds = existsSync(archDir)
  ? readdirSync(archDir).filter(f => f.endsWith('.html')).map(f => f.replace('.html', '')).filter(d => d !== dataDate).sort().reverse()
  : []

function page(isArchive) {
  const base = isArchive ? '../' : ''
  const roundPicker = isArchive
    ? `<a href="../_units-all.html" style="font-size:15px">← กลับรอบล่าสุด</a>`
    : `<label style="font-size:15px;color:#6b7280">รอบข้อมูล:
        <select onchange="if(this.value)location=this.value" style="font-family:inherit;font-size:15px;padding:4px 8px;border:1px solid #d1d5db;border-radius:6px">
          <option value="">${dataDate} (ล่าสุด)</option>
          ${pastRounds.map(d => `<option value="_units-archive/${d}.html">${d}</option>`).join('')}
        </select></label>`
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<title>Units ทุกโครงการ — รอบ ${dataDate}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{font-family:"Anuphan","IBM Plex Sans Thai","Sarabun",Tahoma,sans-serif;background:#f4f5f7;color:#1a1f2e;padding:24px;font-size:15px}
/* ความกว้างจริงตั้งด้วย JS (fitC) = กว้างเท่าตารางที่ active เพื่อให้ .hstick
 * มีระยะเกาะขอบจอ — width:max-content ใช้ไม่ได้ (Chrome คำนวณ intrinsic ของ
 * ตารางโดยไม่สนตัวคุมความกว้างในเซลล์ ทำให้บวมผิดจริง) */
.c{min-width:100%;margin:0}
h1{font-size:26px;color:#0f3460;margin:0 0 2px}
h2{font-size:21px;color:#0f3460;display:inline;margin:0}
.bh{margin:14px 0 8px}
.bm{color:#6b7280;font-size:14px;margin-left:12px}
.sub{color:#6b7280;font-size:14px;margin:2px 0 12px}
/* ส่วนหัวทั้งหมดปักขอบซ้ายจอ — เลื่อนขวาได้เฉพาะตาราง */
.hstick{position:sticky;left:24px;max-width:calc(100vw - 48px);box-sizing:border-box}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 4px}
.tab{background:#fff;border:1px solid #d1d5db;padding:8px 14px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;color:#374151;font-family:inherit}
.tab.active{background:#0f3460;color:#fff;border-color:#0f3460}
.ft{background:#fff;border:1px solid #d1d5db;padding:7px 16px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;color:#374151;font-family:inherit;margin:0 6px 10px 0}
.ft.active{background:#0f3460;color:#fff;border-color:#0f3460}
input.q{padding:7px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;font-family:inherit;width:180px}
.sect{display:none}.sect.active{display:block}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 12px}
.st{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:7px 16px;min-width:86px}
.stl{color:#6b7280;font-size:12.5px;white-space:nowrap}
.stv{color:#0f3460;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.st.stg .stv{color:#166534}.st.sto .stv{color:#c2410c}.st.stb .stv{color:#0f3460}
.st.str .stv{color:#9ca3af}
.sim{background:#fff;border:1px solid #d9dee7;border-left:4px solid #0f3460;border-radius:8px;padding:10px 14px;margin:0 0 12px;font-size:14px}
.simnote{color:#6b7280;font-size:12.5px;margin-left:8px}
.simrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
.simlabel{font-weight:700;color:#0f3460;min-width:80px}
.simsub{font-weight:400;color:#6b7280;font-size:13px}
.simgap{margin-top:14px;padding-top:10px;border-top:1px dashed #e5e7eb}
.simdiv{color:#d1d5db;margin:0 2px}
.sq{width:52px;padding:5px 6px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:14px;text-align:right}
.simsum{font-weight:700;margin:0 6px}
.simsum.over{color:#c2410c}
.simrow .ft{margin:0}
.simwarn{margin-top:6px;color:#c2410c;font-size:13px;line-height:1.6;white-space:pre-line}
.simwarn:empty{display:none}
.siminfo{margin-top:6px;color:#0f3460;font-size:13px;line-height:1.6;white-space:pre-line}
.siminfo:empty{display:none}
.rz{color:#6b7280;font-size:11px;margin-left:4px;vertical-align:1px}
.pncell{white-space:nowrap}
.agn{display:inline-block;font-size:12.5px;color:#374151;background:#f3f4f6;border-radius:4px;padding:1px 6px;margin:1px 4px 1px 0;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}
/* Excel-style column filter (generic — data-ci ชี้คอลัมน์) */
.cf{cursor:pointer;margin-left:5px;font-size:9px;opacity:.75;user-select:none}
.cf.on{color:#fbbf24;opacity:1}
.cfp{position:fixed;z-index:50;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 8px 24px rgba(15,52,96,.18);padding:10px;width:260px;font-size:13.5px;color:#1a1f2e}
.cfp input.cfq{width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:13.5px;margin-bottom:6px}
.cfp .cfa{display:flex;gap:10px;margin-bottom:6px}
.cfp .cfa a{cursor:pointer;font-weight:600}
.cfl{max-height:260px;overflow-y:auto}
.cfl label{display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer}
.cfl .cnt{color:#9ca3af;margin-left:auto;font-variant-numeric:tabular-nums}
.cfl label span.vt{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pnl{display:inline-flex;align-items:center;gap:2px;font-size:12px;color:#374151;margin-right:6px;cursor:pointer}
.pn{accent-color:#0f3460;cursor:pointer}
/* width:auto = คอลัมน์แน่นตามเนื้อหา (ห้ามยืดตาม .c ที่กว้างเท่าเนื้อหาทั้งหน้า) */
table{width:auto;min-width:calc(100vw - 48px);border-collapse:separate;border-spacing:0;background:#fff;font-size:14px;border:1px solid #e5e7eb;border-radius:8px;margin-top:8px}
th{position:sticky;top:0;z-index:5;background:#0f3460;color:#fff;padding:8px 8px;font-size:11.5px;text-transform:uppercase;letter-spacing:.02em;text-align:left;vertical-align:top;border-right:1px solid #1a4576;cursor:pointer;user-select:none}
th::after{content:"↕";font-size:8px;margin-left:3px;opacity:.5}
th.noSort::after{content:""}
td{padding:5px 8px;border-bottom:1px solid #eef1f5;border-right:1px solid #f3f5f8;white-space:nowrap;vertical-align:top}
/* freeze 6 คอลัมน์แรก (# → Floor): sticky left ต่อเนื่อง — ความกว้างต้องล็อกคงที่
 * เพื่อให้ offset ของคอลัมน์ถัดไปแม่น */
td:nth-child(-n+6){position:sticky;background:#fff;z-index:3}
th:nth-child(-n+6){position:sticky;z-index:8;background:#0f3460}
:is(td,th):nth-child(1){left:0;min-width:48px;max-width:48px}
:is(td,th):nth-child(2){left:48px;min-width:104px;max-width:104px}
:is(td,th):nth-child(3){left:152px;min-width:76px;max-width:76px}
:is(td,th):nth-child(4){left:228px;min-width:56px;max-width:56px}
:is(td,th):nth-child(5){left:284px;min-width:72px;max-width:72px}
:is(td,th):nth-child(6){left:356px;min-width:64px;max-width:64px;box-shadow:2px 0 0 #e5e7eb}
tr[data-br="1"] td:nth-child(-n+6),
tr[data-bs="1"] td:nth-child(-n+6){background:#f4fbf6}
tbody tr:hover td:nth-child(-n+6){background:#f0f4ff}
td.num{text-align:right;font-variant-numeric:tabular-nums}
td.links{white-space:normal;font-size:13px}
.lw{width:220px;white-space:normal}
td.fc{white-space:normal;width:1%;min-width:64px}
td.fc .chip{margin:1px 4px 1px 0}
tr[data-br="1"],tr[data-bs="1"]{background:#f4fbf6}
tbody tr:hover{background:#f0f4ff}
.neg{color:#166534;font-weight:700}
.mut{color:#9aa3b2}
.bd{background:#166534;color:#fff;border-radius:4px;padding:1px 6px;font-size:12px}
.chip{display:inline-block;border-radius:4px;padding:1px 6px;font-size:12px;font-weight:700;margin-right:4px}
.chip.g2{background:#166534;color:#fff}.chip.g1{background:#d1f2dd;color:#166534}
.chip.o{background:#c2410c;color:#fff}.chip.n{background:#e5e7eb;color:#374151}
.chip.x{background:#fde8e8;color:#c2410c}
a{color:#0f3460}
</style></head><body><div class="c">
<h1 class="hstick">Units ทุกโครงการ — รายห้องจาก Sanity</h1>
<div class="sub hstick">รอบข้อมูล ${dataDate} · หนึ่งแถว = หนึ่งห้องจริง (เช่า+ขายรวมกัน) · ไม่รวมห้อง expired · แถวเขียว = ห้องที่ engine เลือกขึ้นบอร์ด · สร้างใหม่: node --env-file=.env tools/units-list.mjs</div>
<div class="hstick">${roundPicker}</div>
<div class="tabs hstick">${sections.map(s => s.tab).join('')}</div>
${sections.map(s => s.section).join('\n').replaceAll('@@BASE@@', base)}
<p style="color:#6b7280;margin-top:14px">internal use only — มีชั้นจริง + ลิงก์ต้นทาง ห้ามแชร์ public</p>
</div>
<script>
const DDATE=${JSON.stringify(dataDate)};
function fitC(){
  const t=document.querySelector('.sect.active table');
  const w=t?Math.max(Math.ceil(t.getBoundingClientRect().width)+48,innerWidth):innerWidth;
  document.querySelector('.c').style.width=w+'px';
}
function showB(i,btn){
  document.querySelectorAll('.sect').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('b'+i).classList.add('active');btn.classList.add('active');
  fitC();
}
addEventListener('resize',fitC);
document.querySelectorAll('.sect').forEach(sec=>{
  const rows=[...sec.querySelectorAll('tbody tr')];
  const q=sec.querySelector('.q'),n=sec.querySelector('.n');let mode='all';
  function renumber(){
    let i=0;
    sec.querySelectorAll('tbody tr').forEach(r=>{
      if(r.style.display!=='none') r.querySelector('.idx').textContent=++i;
    });
  }
  // ── Excel-style column filters (generic) ──
  const FCOLS={
    2:{get:t=>[t.dataset.bed||'—']},
    4:{get:t=>[(t.cells[4].textContent||'').trim()||'—']},
    22:{get:t=>{const v=[];if(t.dataset.own==='1')v.push('🏠 Owner');
      (t.dataset.ag||'').split('|').filter(Boolean).forEach(a=>v.push(a));
      return v.length?v:['(ไม่ระบุ)'];}},
    23:{get:t=>{const p=(t.cells[23].textContent||'').trim().split(/\\s+/).filter(Boolean);return p.length?p:['—'];}},
  };
  const colSel={};   // ci -> Set of allowed values, or undefined = ไม่กรอง
  function apply(){
    const s=q.value.trim().toUpperCase();let c=0;
    rows.forEach(r=>{
      let ok = mode==='all' || (mode==='rent'&&r.dataset.r==='1') || (mode==='sale'&&r.dataset.s==='1')
        || (mode==='dual'&&r.dataset.r==='1'&&r.dataset.s==='1')
        || (mode==='brent'&&r.dataset.br==='1') || (mode==='bsale'&&r.dataset.bs==='1')
        || (mode==='new'&&r.dataset.n==='1') || (mode==='fx'&&r.dataset.f==='1');
      if(ok && s) ok = r.dataset.ref.toUpperCase().includes(s) || (r.dataset.ag||'').toUpperCase().includes(s);
      if(ok)for(const ci in colSel){const sel=colSel[ci];if(sel&&!FCOLS[ci].get(r).some(v=>sel.has(v))){ok=false;break;}}
      r.style.display = ok ? '' : 'none'; if(ok)c++;
    });
    n.textContent = c + ' units';
    renumber();
  }
  sec.querySelectorAll('.ft').forEach(b=>b.onclick=()=>{
    sec.querySelectorAll('.ft').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');mode=b.dataset.k;apply();
  });
  q.oninput=apply;apply();
  if(sec.classList.contains('active'))fitC();
  // ── column filter panel (shared per section) ──
  let cfPanel=null;
  function closePanel(){if(cfPanel){cfPanel.remove();cfPanel=null;document.removeEventListener('mousedown',onDocDown);}}
  function onDocDown(e){if(cfPanel&&!cfPanel.contains(e.target))closePanel();}
  sec.querySelectorAll('.cf').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const ci=btn.dataset.ci;
      if(cfPanel){closePanel();return;}
      const counts=new Map();
      rows.forEach(r=>FCOLS[ci].get(r).forEach(v=>counts.set(v,(counts.get(v)||0)+1)));
      const vals=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
      const sel=colSel[ci];
      cfPanel=document.createElement('div');cfPanel.className='cfp';
      cfPanel.innerHTML='<input class="cfq" placeholder="พิมพ์กรองรายชื่อ...">'
        +'<div class="cfa"><a class="ca">Select all</a><a class="cc">Clear</a></div>'
        +'<div class="cfl">'+vals.map(([v,cnt])=>
          '<label><input type="checkbox" data-v="'+encodeURIComponent(v)+'"'
          +(!sel||sel.has(v)?' checked':'')+'><span class="vt" title="'+v.replace(/"/g,'&quot;')+'">'+v+'</span>'
          +'<span class="cnt">'+cnt+'</span></label>').join('')+'</div>';
      document.body.appendChild(cfPanel);
      const rc=btn.getBoundingClientRect();
      cfPanel.style.top=Math.min(rc.bottom+4,innerHeight-340)+'px';
      cfPanel.style.left=Math.min(rc.left,innerWidth-280)+'px';
      const sync=()=>{
        const boxes=[...cfPanel.querySelectorAll('.cfl input')];
        const on=boxes.filter(b=>b.checked).map(b=>decodeURIComponent(b.dataset.v));
        colSel[ci]=(on.length===boxes.length)?undefined:new Set(on);
        btn.classList.toggle('on',!!colSel[ci]);
        apply();
      };
      cfPanel.querySelectorAll('.cfl input').forEach(b=>b.onchange=sync);
      cfPanel.querySelector('.ca').onclick=()=>{cfPanel.querySelectorAll('.cfl input').forEach(b=>b.checked=true);sync();};
      cfPanel.querySelector('.cc').onclick=()=>{cfPanel.querySelectorAll('.cfl input').forEach(b=>b.checked=false);sync();};
      cfPanel.querySelector('.cfq').oninput=e2=>{
        const t=e2.target.value.trim().toUpperCase();
        cfPanel.querySelectorAll('.cfl label').forEach(l=>{
          l.style.display=!t||l.querySelector('.vt').textContent.toUpperCase().includes(t)?'':'none';});
      };
      setTimeout(()=>document.addEventListener('mousedown',onDocDown),0);
    });
  });
  const NUMCOL={3:'sqm',5:'fl',6:'rent',7:'rpsqm',8:'vsr',12:'sale',13:'spsqm',14:'vss',19:'yield',21:'spread'};
  sec.querySelectorAll('th').forEach((th,ci)=>{
    if(th.classList.contains('noSort'))return;
    th.onclick=()=>{
    const tb=sec.querySelector('tbody');
    const dir=th.dataset.d==='1'?-1:1;
    sec.querySelectorAll('th').forEach(x=>delete x.dataset.d);
    th.dataset.d=dir===1?'1':'0';
    const sorted=[...tb.rows].sort((a,b)=>{
      if(NUMCOL[ci]){
        const av=parseFloat(a.dataset[NUMCOL[ci]]),bv=parseFloat(b.dataset[NUMCOL[ci]]);
        const am=(av===-1||av===9999),bm=(bv===-1||bv===9999);
        if(am!==bm)return am?1:-1;          // แถวไม่มีข้อมูล (—) ไปท้ายเสมอ
        return (av-bv)*dir;
      }
      if(ci===24)return (((+b.dataset.br)+(+b.dataset.bs))-((+a.dataset.br)+(+a.dataset.bs)))*dir;
      return a.cells[ci].textContent.localeCompare(b.cells[ci].textContent,'th')*dir;
    });
    sorted.forEach(r=>tb.appendChild(r));
    renumber();
  }});

  // ── simulator: นโยบายคัดเลือก (mirror ของ board-engine.mjs) ──
  const BEDS=['studio','1bed','2bed','3bed','4bed'];
  const TIER={s:0,b:1,g:2};
  function readP(x){
    const P={};sec.querySelectorAll('.sq[data-m="'+x+'"]').forEach(i=>P[i.dataset.p]=Math.max(0,parseInt(i.value)||0));
    return P;
  }
  const BEDKEY={studio:'studioMin','1bed':'b1Min','2bed':'b2Min','3bed':'b3Min','4bed':'b4Min'};
  function simSum(){
    let ok=true;
    for(const x of ['r','s']){
      const P=readP(x);
      const flags=P.superQ+P.bestQ+P.hotQ+P.negoQ+P.investQ;
      const mins=P.studioMin+P.b1Min+P.b2Min+P.b3Min;
      const el=sec.querySelector('.simsum[data-m="'+x+'"]');
      el.textContent='flags '+flags+' · min '+mins+' / quota '+P.quota;
      const over=flags>P.quota||mins>P.quota;
      el.classList.toggle('over',over);
      if(over)ok=false;
    }
    return ok;
  }
  function redrawBoard(t){
    t.cells[24].innerHTML=
      (t.dataset.br==='1'?'<span class="bd">บอร์ดเช่า</span><span class="rz">'+(t.dataset.rzr||'')+'</span> ':'')+
      (t.dataset.bs==='1'?'<span class="bd">บอร์ดขาย</span><span class="rz">'+(t.dataset.rzs||'')+'</span>':'');
  }
  function simulate(){
    if(!simSum()){sec.querySelector('.simwarn').textContent='⚠ flag quotas exceed total quota — reduce before simulating';return;}
    const allWarn=[];const allInfo=[];
    for(const x of ['r','s']){
      const P=readP(x);
      const modeName=x==='r'?'rent':'sale';
      const items=rows.filter(t=>t.dataset[x]==='1'&&t.dataset['ok'+x]==='1')
        .map(t=>({t,bed:t.dataset.bed,dt:t.dataset['dt'+x],hot:t.dataset['h'+x]==='1',
          iv:t.dataset['iv'+x]==='1',ng:t.dataset['ng'+x]==='1',
          pin:t.querySelector('.pn[data-m="'+x+'"]')?.checked??false,
          vs:parseFloat(t.dataset[x==='r'?'vsr':'vss']),nl:+t.dataset['nl'+x],
          spr:parseFloat(t.dataset['spr'+x]),yld:parseFloat(t.dataset.yield),
          price:parseFloat(t.dataset[x==='r'?'rent':'sale'])}));
      const byDeal=(a,b)=>((TIER[a.dt]??3)-(TIER[b.dt]??3))||((a.vs===9999?0:a.vs)-(b.vs===9999?0:b.vs));
      const picked=new Set();
      const take=(it,rz)=>{if(it&&!picked.has(it)&&picked.size<P.quota){picked.add(it);it.rz=rz;return true}return false};
      const pins=items.filter(i=>i.pin).sort(byDeal);
      pins.forEach(it=>take(it,'SELECT'));
      if(pins.length>P.quota)allWarn.push('⛔ '+modeName+': selected '+pins.length+' units > quota '+P.quota+' — only the best '+P.quota+' by deal rank are placed, '+(pins.length-P.quota)+' left off the board');
      const pinnedOff=rows.filter(t=>t.querySelector('.pn[data-m="'+x+'"]')?.checked&&t.dataset['ok'+x]!=='1').length;
      if(pinnedOff)allWarn.push(modeName+': '+pinnedOff+' selected unit(s) fail the data-quality filters — not placed');
      for(const bed of BEDS){
        const min=P[BEDKEY[bed]]||0;
        if(min<=0)continue;
        const of=items.filter(i=>i.bed===bed).sort(byDeal);
        of.slice(0,min).forEach(it=>take(it,'BED'));
        if(!of.length&&rows.some(t=>t.dataset[x]==='1'&&t.dataset.bed===bed))
          allWarn.push(modeName+' · '+bed.toUpperCase()+': no unit passes the filters');
        else if(of.length&&of.length<min)
          allWarn.push(modeName+' · '+bed.toUpperCase()+': requested min '+min+' · found '+of.length+' — filled from other sizes');
      }
      const buckets=[['superQ','SUPER',i=>i.dt==='s',(a,b)=>a.vs-b.vs],['bestQ','BEST',i=>i.dt==='b',(a,b)=>a.vs-b.vs],
        ['hotQ','HOT',i=>i.hot,(a,b)=>b.nl-a.nl],['negoQ','NEGO',i=>i.ng,(a,b)=>b.spr-a.spr],
        ['investQ','INVESTABLE',i=>i.iv,(a,b)=>b.yld-a.yld]];
      for(const [k,label,match,rank] of buckets){
        const q=P[k];if(q<=0)continue;
        let got=[...picked].filter(match).length;
        for(const it of items.filter(i=>match(i)&&!picked.has(i)).sort(rank)){if(got>=q)break;if(take(it,label))got++;}
        if(got<q)allWarn.push(modeName+' · '+label+': requested '+q+' · found '+got+' — seats filled from best deals');
      }
      [...items].sort(byDeal).forEach(it=>take(it,'FILL'));
      if(picked.size<P.quota)allWarn.push(modeName+': '+picked.size+'/'+P.quota+' rows — not enough qualifying units to fill the board');
      const key=x==='r'?'br':'bs',rzKey=x==='r'?'rzr':'rzs';
      rows.forEach(t=>{t.dataset[key]='0';t.dataset[rzKey]='';});
      picked.forEach(it=>{it.t.dataset[key]='1';it.t.dataset[rzKey]=it.rz;});
      const tally={};picked.forEach(it=>tally[it.rz]=(tally[it.rz]||0)+1);
      allInfo.push(modeName+' picks: '+['SELECT','BED','SUPER','BEST','HOT','NEGO','INVESTABLE','FILL']
        .filter(k=>tally[k]).map(k=>k+' '+tally[k]).join(' · '));
    }
    rows.forEach(redrawBoard);
    const stv=[...sec.querySelectorAll('.st')].find(s=>s.querySelector('.stl').textContent==='ขึ้นบอร์ด')?.querySelector('.stv');
    if(stv)stv.textContent=rows.filter(t=>t.dataset.br==='1').length+rows.filter(t=>t.dataset.bs==='1').length;
    sec.querySelector('.siminfo').textContent=allInfo.join('\\n');
    sec.querySelector('.simwarn').textContent=allWarn.map(w=>'⚠ '+w).join('\\n');
    apply();
  }
  sec.querySelectorAll('.sq').forEach(i=>i.oninput=simSum);simSum();
  sec.querySelectorAll('.pn').forEach(c=>c.onchange=simulate);   // ติ๊ก pin = จำลองใหม่ทันที
  sec.querySelector('.simapply').onclick=simulate;
  sec.querySelector('.simcopy').onclick=()=>{
    const lines=['r','s'].map(x=>{
      const key=x==='r'?'br':'bs';
      const refs=rows.filter(t=>t.dataset[key]==='1').map(t=>t.dataset.ref);
      return (x==='r'?'rent':'sale')+' ('+refs.length+'): '+refs.join(', ');
    });
    navigator.clipboard.writeText(lines.join('\\n')).then(()=>{
      const b=sec.querySelector('.simcopy');const old=b.textContent;
      b.textContent='Copied ✓';setTimeout(()=>b.textContent=old,1500);
    });
  };
  const BEDLBL={studio:'STUDIO','1bed':'1BED','2bed':'2BED','3bed':'3BED','4bed':'4BED+'};
  sec.querySelectorAll('.simprev').forEach(b=>b.onclick=()=>{
    const x=b.dataset.m,key=x==='r'?'br':'bs';
    const picks=rows.filter(t=>t.dataset[key]==='1').map(t=>{
      const rem=[];const dt=t.dataset['dt'+x];
      if(dt==='s')rem.push({text:'SUPER',tone:'green'});
      else if(dt==='b')rem.push({text:'BEST',tone:'green'});
      else if(dt==='g')rem.push({text:'GOOD',tone:'green'});
      if(t.dataset['h'+x]==='1')rem.push({text:'HOT',tone:'orange'});
      if(t.dataset['iv'+x]==='1')rem.push({text:'INVESTABLE',tone:'green'});
      if(t.dataset['ng'+x]==='1')rem.push({text:'NEGO',tone:'white'});
      if(t.dataset['ow'+x]==='1')rem.push({text:'OWNER',tone:'green'});
      return {bed:t.dataset.bed,type:BEDLBL[t.dataset.bed]||'',sqm:+t.dataset.sqm,
        floor:(t.cells[4].textContent||'').toUpperCase(),updated:DDATE,
        price:+t.dataset[x==='r'?'rent':'sale'],remarks:rem.slice(0,4)};
    }).sort((a,b)=>Object.keys(BEDLBL).indexOf(a.bed)-Object.keys(BEDLBL).indexOf(b.bed)||a.price-b.price)
      .map(({bed,...r})=>r);
    if(!picks.length){sec.querySelector('.simwarn').textContent='⚠ no rows on this board to preview';return;}
    const data={project:sec.dataset.name,mode:x==='r'?'rent':'sale',dataAsOf:DDATE,rows:picks};
    window.open('board.html#sim='+encodeURIComponent(JSON.stringify(data)),'_blank');
  });
  sec.querySelector('.simreset').onclick=()=>{
    sec.querySelectorAll('.sq').forEach(i=>{if(i.disabled)return;i.value=i.dataset.p==='quota'?19:(i.dataset.p==='investQ'&&i.dataset.m==='r'?0:1);});   // disabled (ไซซ์ที่ตึกไม่มี) คงค่า 0
    rows.forEach(t=>{t.dataset.br=t.dataset.obr;t.dataset.bs=t.dataset.obs;
      t.dataset.rzr=t.dataset.orzr;t.dataset.rzs=t.dataset.orzs;redrawBoard(t);});
    const stv=[...sec.querySelectorAll('.st')].find(s=>s.querySelector('.stl').textContent==='ขึ้นบอร์ด')?.querySelector('.stv');
    if(stv)stv.textContent=rows.filter(t=>t.dataset.br==='1').length+rows.filter(t=>t.dataset.bs==='1').length;
    sec.querySelector('.siminfo').textContent='';
    sec.querySelector('.simwarn').textContent='';simSum();apply();
  };
  sec.querySelector('.simall').onclick=()=>{
    document.querySelectorAll('.sect').forEach(o=>{
      o.querySelectorAll('.sq').forEach(i=>{
        if(i.disabled)return;   // ไซซ์ที่ตึกปลายทางไม่มี — คง 0
        const src=sec.querySelector('.sq[data-m="'+i.dataset.m+'"][data-p="'+i.dataset.p+'"]');
        if(src)i.value=src.value;
      });
      o.querySelector('.simapply').click();
    });
  };
});
</script>
</body></html>`
}

writeFileSync(join(__dirname, '_units-all.html'), page(false), 'utf8')
writeFileSync(join(archDir, `${dataDate}.html`), page(true), 'utf8')
const totalUnits = sections.length
console.log(`  ✓ _units-all.html (${profiles.length} profiles → one-row-per-unit, ${totalUnits} tabs)`)
console.log(`  ✓ _units-archive/${dataDate}.html (snapshot)`)
