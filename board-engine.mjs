/**
 * board-engine.mjs — selection engine for the unit-price boards (board.html)
 *
 * Picks board rows from unitProfile documents (Market Intelligence pipeline)
 * according to the curation criteria:
 *   1. Every bed type present in the pool gets at least one row (studio → largest).
 *   2. Contact gating happens UPSTREAM (caller passes only contactable profiles) —
 *      the engine itself is pure selection.
 *   3. Flag coverage: at least one SUPER, one BEST, one HOT, one NEGOTIABLE
 *      (+ one GOOD INVEST for sale boards), each chosen by its best number
 *      (deepest vs-floor discount, most competing listings, widest spread,
 *      highest yield) so the highlight is defensible.
 *   4. Multi-flag units carry up to 3 remark chips — board.html flips them.
 *
 * Sanity filters guard against scraper garbage (the dry-run surfaced a
 * "399 sqm 1bed at ฿37k, -88% vs floor" and a 2,071% price spread — real rows
 * in the dataset). Anything that trips a bound is left for human review
 * instead of airing.
 */

export const BED_ORDER = ['studio', '1bed', '2bed', '3bed', '4bed']
const BED_LABEL  = { studio: 'STUDIO', '1bed': '1BED', '2bed': '2BED', '3bed': '3BED', '4bed': '4BED+' }
// 3bed stays a wide catch-all until the scrape pipeline starts emitting '4bed'
// (existing penthouses are tagged 3bed — HQ-U260 is a real 470sqm unit).
/* 4bed เริ่มที่ 100 ไม่ใช่ 120 — ห้อง "combine" ที่ทุบรวมสองยูนิตมีจริงและอยู่ต่ำกว่า 120
   (P24-U893/894 ขนาด 108.68 ตร.ม. ลงประกาศว่า 4 นอน 3 น้ำ ตรงกันสองพอร์ทัล) เกณฑ์เดิม
   ตัดทิ้งทั้งที่ข้อมูลถูก — สำเนาใน sanity-studio/tools/UnitBoardsTool.tsx KEEP IN SYNC */
const SQM_BOUNDS = { studio: [20, 50], '1bed': [25, 80], '2bed': [45, 150], '3bed': [80, 500], '4bed': [100, 700] }
const PRICE_BOUNDS = { rent: [5000, 300000], sale: [1000000, 100000000] }
// ฿/sqm bounds catch mis-parsed prices that total-price bounds miss
// (a real row: 1bed 33sqm at ฿69,000,001 = ฿2.09M/sqm — scraper garbage)
const PSQM_BOUNDS = { rent: [250, 3500], sale: [50000, 600000] }
const TIER_RANK  = { super: 0, best: 1, good: 2 }

export function passesSanity(p, mode) {
  const [lo, hi] = SQM_BOUNDS[p.bedType] ?? [15, 400]
  if (!(p.sqm >= lo && p.sqm <= hi)) return false
  const [plo, phi] = PRICE_BOUNDS[mode] ?? [0, Infinity]
  if (!(p.priceTHB >= plo && p.priceTHB <= phi)) return false
  const [qlo, qhi] = PSQM_BOUNDS[mode] ?? [0, Infinity]
  const psqm = p.priceTHB / p.sqm
  if (!(psqm >= qlo && psqm <= qhi)) return false
  if (p.vsFloorPct != null && p.vsFloorPct < -50) return false  // too good to be true
  if (p.spreadPct  != null && p.spreadPct  > 60)  return false  // portals disagree wildly
  return true
}

const tierRank = p => TIER_RANK[p.dealTier] ?? 3
const byDeal   = (a, b) => tierRank(a) - tierRank(b) || (a.vsFloorPct ?? 0) - (b.vsFloorPct ?? 0)

/** Board policy: quota + per-flag bucket quotas. Stored on the unitBoard doc
 * (per project × mode) — this is the DEFAULT when none is set, and it matches
 * the original hardcoded behaviour: guarantee 1 of each highlight. */
export const DEFAULT_POLICY = {
  quota: 7,
  superQ: 1, bestQ: 1, hotQ: 1, negoQ: 1, investQ: 1,
  studioMin: 1, b1Min: 1, b2Min: 1, b3Min: 1, b4Min: 1,   // ขั้นต่ำรายไซซ์ (คอลัมน์ของ matrix)
}
const BED_MIN_KEY = { studio: 'studioMin', '1bed': 'b1Min', '2bed': 'b2Min', '3bed': 'b3Min', '4bed': 'b4Min' }

const BUCKETS = [
  ['superQ',  'SUPER',      p => p.dealTier === 'super', (a, b) => (a.vsFloorPct ?? 0) - (b.vsFloorPct ?? 0)],
  ['bestQ',   'BEST',       p => p.dealTier === 'best',  (a, b) => (a.vsFloorPct ?? 0) - (b.vsFloorPct ?? 0)],
  ['hotQ',    'HOT',        p => p.hotDeal,              (a, b) => (b.nListings ?? 0) - (a.nListings ?? 0)],
  ['negoQ',   'NEGO',       p => p.negotiable,           (a, b) => (b.spreadPct ?? 0) - (a.spreadPct ?? 0)],
  ['investQ', 'INVESTABLE', p => p.goodInvest,           (a, b) => (b.yieldPct ?? 0) - (a.yieldPct ?? 0)],
]

/** Policy-driven selection for ONE project × ONE intent.
 * Returns { rows, warnings }. Buckets fill in priority order (a unit counts
 * toward the FIRST bucket it qualifies for); short buckets roll their empty
 * seats into the final best-deal fill (board always fills to quota when the
 * pool allows) — every shortfall is reported as a warning, never silent.
 * expired/taken units are excluded at this level so no caller can surface them. */
export function selectWithPolicy(profiles, mode, policy = {}) {
  const P = { ...DEFAULT_POLICY, ...policy }
  const warnings = []
  const pool = profiles.filter(p =>
    p.status !== 'expired' && p.status !== 'taken' && passesSanity(p, mode) && !p.hideFromBoard)
  const picked = new Map()
  // Every successful take records WHY the unit made the board (p.__pick):
  // PIN / BED (size coverage) / SUPER·BEST·HOT·NEGO·INVESTABLE (flag quota) / FILL.
  const take = (p, reason) => {
    if (p && !picked.has(p.refCode) && picked.size < P.quota) {
      picked.set(p.refCode, p); p.__pick = reason; return true
    }
    return false
  }

  // Team pins always ride first.
  pool.filter(p => p.pinToBoard).sort(byDeal).forEach(p => take(p, 'PIN'))

  // Bed-type coverage — per-size minimums, best deals of each size class first.
  // (legacy bedTypeMin still honoured as a fallback for all sizes)
  for (const bed of BED_ORDER) {
    const min = P[BED_MIN_KEY[bed]] ?? P.bedTypeMin ?? 1
    if (min <= 0) continue
    const of = pool.filter(p => p.bedType === bed).sort(byDeal)
    of.slice(0, min).forEach(p => take(p, 'BED'))
    if (!of.length && profiles.some(p => p.bedType === bed))
      warnings.push(`${bed.toUpperCase()}: ไม่มีห้องผ่านตัวกรองเลย — บอร์ดไม่มีไซซ์นี้`)
    else if (of.length && of.length < min)
      warnings.push(`${bed.toUpperCase()}: ขอขั้นต่ำ ${min} · มีจริง ${of.length} — เติมจากไซซ์อื่นแทน`)
  }

  // Flag buckets by quota, numerically-best first.
  for (const [key, label, match, rank] of BUCKETS) {
    const q = P[key] ?? 0
    if (q <= 0) continue
    if (key === 'investQ' && mode !== 'sale' && (policy.investQ == null)) continue  // default invest = sale only
    const already = [...picked.values()].filter(match).length
    let got = already
    for (const p of pool.filter(p => match(p) && !picked.has(p.refCode)).sort(rank)) {
      if (got >= q) break
      if (take(p, label)) got++
    }
    if (got < q)
      warnings.push(`${label}: ขอ ${q} · ได้จริง ${got} — เติมที่ว่างจากดีลดีสุดแทน`)
  }

  // Fill to quota with the best remaining deals.
  ;[...pool].sort(byDeal).forEach(p => take(p, 'FILL'))
  if (picked.size < P.quota)
    warnings.push(`ได้ ${picked.size}/${P.quota} แถว — ห้องผ่านเกณฑ์ไม่พอเติมให้เต็มบอร์ด`)

  // Display order: size class small → large, cheapest first within each.
  const rows = [...picked.values()].sort((a, b) =>
    BED_ORDER.indexOf(a.bedType) - BED_ORDER.indexOf(b.bedType) || a.priceTHB - b.priceTHB)
  return { rows, warnings }
}

/** Back-compat wrapper — default policy, rows only. */
export function selectBoardRows(profiles, mode, n = 19) {
  return selectWithPolicy(profiles, mode, { quota: n }).rows
}

/** Remark chips from the analysis flags (deal / hot / invest / multi-portal / owner).
 * Labels are the tier WORDS per the curation spec — numbers (vsFloorPct, yieldPct,
 * spreadPct) are used only to RANK highlights during selection, never displayed. */
export function remarksFor(p) {
  const r = []
  if (p.dealTier) r.push({ text: p.dealTier.toUpperCase(), tone: 'green' })
  if (p.hotDeal) r.push({ text: 'HOT', tone: 'orange' })
  if (p.goodInvest) r.push({ text: 'INVESTABLE', tone: 'green' })
  if (p.negotiable) r.push({ text: 'NEGO', tone: 'white' })
  if (p.postedByOwner) r.push({ text: 'OWNER', tone: 'green' })
  return r.slice(0, 4)
}

/** unitProfile → the row shape board.html reads (window.__BOARD__.rows[i]). */
export function profileToRow(p) {
  return {
    type:    BED_LABEL[p.bedType] ?? String(p.bedType ?? '').toUpperCase(),
    sqm:     p.sqm,
    floor:   String(p.floorZone ?? '').toUpperCase(),
    // Real storey when we have it (internal dataset). The zone above still
    // drives the split-flap level bars; the card board prints this instead,
    // because "ชั้น 21" tells a passer-by more than "ชั้นกลาง" — and it stops
    // three different units from rendering as the same line.
    floorNo: p.floorActual ?? null,
    updated: p.lastCheckedAt,
    price:   p.priceTHB,
    remarks: remarksFor(p),
    // Everything below was already fetched and then dropped here. The card
    // board's second line used to repeat the bed type that its own segment
    // header states; with the type gone it prints why the room is worth a
    // look instead, which needs these.
    pricePerSqm: p.pricePerSqm ?? null,
    vsFloorPct:  p.vsFloorPct ?? null,
    // Team-set sales state — the board dims a closed room and labels it
    // RENTED/SOLD rather than letting it vanish without explanation.
    takenLabel:  p.dealStage === 'closed' ? (p.intent === 'sale' ? 'sale' : 'rent') : null,
    actTalking:  p.dealStage === 'talking' || null,
    actViewing:  p.dealStage === 'viewing' || null,
  }
}

/** ห้องที่ปิดดีลเกิน N วันหลุดจากบอร์ดเอง — ไม่งั้นบอร์ดจะกลายเป็นสุสานดีลเก่า */
export const CLOSED_DAYS = 30
export function closedTooLong(p, today = new Date().toISOString().slice(0, 10)) {
  if (p.dealStage !== 'closed') return false
  if (!p.dealStageAt) return false            // ไม่รู้วันที่ → ปล่อยไว้ ให้คนมาเคลียร์เอง
  return (Date.parse(today) - Date.parse(p.dealStageAt)) / 86400000 > CLOSED_DAYS
}

/** GROQ projection both build.mjs and the shortlist tool fetch for the engine. */
export const PROFILE_PROJECTION = `
  refCode, intent, bedType, sqm, floorZone, priceTHB, pricePerSqm,
  vsFloorPct, vsZonePct, vsBuildingPct, dealTier, hotDeal, goodInvest,
  negotiable, yieldPct, spreadPct, nListings, nPortals, postedByOwner,
  dualListed, pinToBoard, hideFromBoard, status, lastCheckedAt, firstSeenAt,
  dealStage, dealStageAt`
