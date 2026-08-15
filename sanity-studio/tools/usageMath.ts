// Aggregation for the การใช้งานจอ tool — kept out of the component so the rules
// that decide what the numbers MEAN can be tested without mounting Studio.
//
// Three of them carry judgement, not arithmetic:
//   · a screen that aired nothing was OFF — never the same as "nobody touched it"
//   · media rank by rate per airing, because a slide that has been on the loop
//     for a month out-taps a better one added on Friday
//   · a slide that aired plenty and was never touched is the actionable finding

export interface UsageRow {
  project: string
  date: string
  air: number
  tap: number
  sess: number
  scan: number
  funnel?: { detail: number; gallery: number; cta: number; qr: number; phone: number; menu: number; cat: number }
  end?:   { back: number; cta: number; idle: number }
  dwell?: { d0: number; d3: number; d10: number; d30: number }
  hours?: Record<string, Record<string, number>>
  media?: Record<string, { air: number; tap: number }>
  /** Property-popup room picks, keyed "<sale|rent>-<refCode>". */
  units?: Record<string, number>
}

export interface ProjectRow { project: string; air: number; tap: number; sess: number; scan: number; daysRunning: number }
export interface MediaRow   { id: string; air: number; tap: number }

/** The screens run 06:00–22:00, so the day is 16 buckets, not 24. */
export const SCREEN_HOURS = ['06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21']

/** Aired plenty, never once touched. Below this the slide simply hasn't had
 *  enough exposure to conclude anything — roughly a day on a 5-minute loop. */
export const DEAD_AIR_THRESHOLD = 200

export function aggregateByProject(rows: UsageRow[]): ProjectRow[] {
  const m = new Map<string, ProjectRow>()
  for (const r of rows) {
    const cur = m.get(r.project) || { project: r.project, air: 0, tap: 0, sess: 0, scan: 0, daysRunning: 0 }
    cur.air  += r.air  || 0
    cur.tap  += r.tap  || 0
    cur.sess += r.sess || 0
    cur.scan += r.scan || 0
    if ((r.air || 0) > 0) cur.daysRunning++   // it aired something, so it was alive that day
    m.set(r.project, cur)
  }
  return Array.from(m.values()).sort((a, b) => b.tap - a.tap || a.project.localeCompare(b.project))
}

export function aggregateByMedia(rows: UsageRow[]): MediaRow[] {
  const m = new Map<string, MediaRow>()
  for (const r of rows) {
    for (const [id, v] of Object.entries(r.media || {})) {
      const cur = m.get(id) || { id, air: 0, tap: 0 }
      cur.air += v.air || 0
      cur.tap += v.tap || 0
      m.set(id, cur)
    }
  }
  // Rate first, raw count only to break ties. Never the other way round.
  return Array.from(m.values()).sort((a, b) =>
    (b.tap / Math.max(b.air, 1)) - (a.tap / Math.max(a.air, 1)) || b.tap - a.tap || a.id.localeCompare(b.id))
}

export const isDeadMedia = (m: MediaRow) => m.air >= DEAD_AIR_THRESHOLD && m.tap === 0
/** A screen with no airings at all in the period was off / unreachable. */
export const screenWasOff = (p: ProjectRow) => p.air === 0

export function sumTotals(rows: UsageRow[]) {
  const t = { air: 0, tap: 0, sess: 0, scan: 0, detail: 0, gallery: 0, cta: 0, qr: 0, phone: 0,
              back: 0, endCta: 0, idle: 0, d0: 0, d3: 0, d10: 0, d30: 0 }
  for (const r of rows) {
    t.air += r.air || 0; t.tap += r.tap || 0; t.sess += r.sess || 0; t.scan += r.scan || 0
    t.detail  += r.funnel?.detail  || 0
    t.gallery += r.funnel?.gallery || 0
    t.cta     += r.funnel?.cta     || 0
    t.qr      += r.funnel?.qr      || 0
    t.phone   += r.funnel?.phone   || 0
    t.back    += r.end?.back || 0
    t.endCta  += r.end?.cta  || 0
    t.idle    += r.end?.idle || 0
    t.d0  += r.dwell?.d0  || 0
    t.d3  += r.dwell?.d3  || 0
    t.d10 += r.dwell?.d10 || 0
    t.d30 += r.dwell?.d30 || 0
  }
  return t
}

export function sumHourly(rows: UsageRow[], metric: 'tap' | 'air' | 'sess' = 'tap'): Record<string, number> {
  const h: Record<string, number> = {}
  SCREEN_HOURS.forEach(k => { h[k] = 0 })
  for (const r of rows) {
    for (const [hh, v] of Object.entries(r.hours || {})) {
      if (h[hh] != null) h[hh] += v[metric] || 0
    }
  }
  return h
}

export interface ProjectHourly { project: string; hours: Record<string, number>; total: number }

/** One hour row per SCREEN, busiest first — "when does THIS building use its
 *  screen", where the fleet strip only answers "when does anybody". Sessions,
 *  not taps: with single-digit hourly numbers, taps are too sparse to place in
 *  time, and one person tapping five slides should paint one cell, not five. */
export function hourlyByProject(rows: UsageRow[], metric: 'tap' | 'air' | 'sess' = 'sess'): ProjectHourly[] {
  const m = new Map<string, ProjectHourly>()
  for (const r of rows) {
    let p = m.get(r.project)
    if (!p) {
      p = { project: r.project, hours: {}, total: 0 }
      SCREEN_HOURS.forEach(k => { p!.hours[k] = 0 })
      m.set(r.project, p)
    }
    for (const [hh, v] of Object.entries(r.hours || {})) {
      if (p.hours[hh] != null) { p.hours[hh] += v[metric] || 0; p.total += v[metric] || 0 }
    }
  }
  return Array.from(m.values()).sort((a, b) => b.total - a.total || a.project.localeCompare(b.project))
}

/** Days on which at least one screen actually ran — the honest sample size. */
export const daysWithData = (rows: UsageRow[]) =>
  new Set(rows.filter(r => (r.air || 0) > 0).map(r => r.date)).size

// ── media × project matrix ──────────────────────────────────────────────────
// One table that answers "which content works, where" across the fleet:
//   · juristic notices are content-by-obligation, not content-on-trial — out
//   · the For Sale / For Rent boards merge across buildings (one row each)
//   · room picks ("สนใจห้องนี้") group by bed type across buildings — the rows
//     the demand question is actually about. Picks are one funnel step deeper
//     than taps, so they are a SEPARATE row group, never summed with taps.

export interface MatrixMeta {
  /** media _id → { kind, cat, type, name } from the media docs (client lookup) */
  media: Record<string, { kind?: string; cat?: string; type?: string; name?: string }>
  /** unit key "<mode>-<refCode>" → bedType, from the API / mirror */
  unitTypes: Record<string, { bedType?: string; intent?: string }>
}

export interface MatrixRow {
  key: string
  label: string
  group: 'room' | 'media'     // room = picks (deeper signal) · media = slide taps
  per: Record<string, number> // project → count; missing project = never aired there
  aired: Record<string, boolean>
  total: number
  air: number                 // media rows only — denominator context (0 for rooms)
}

const BED_LABEL: Record<string, string> = {
  studio: 'Studio', '1bed': '1 bed', '2bed': '2 bed', '3bed': '3 bed', '4bed': '4 bed',
}
const bedLabel = (b: string) => BED_LABEL[b] || b

export function buildMatrix(rows: UsageRow[], meta: MatrixMeta): MatrixRow[] {
  const out = new Map<string, MatrixRow>()
  const row = (key: string, label: string, group: MatrixRow['group']) => {
    let r = out.get(key)
    if (!r) { r = { key, label, group, per: {}, aired: {}, total: 0, air: 0 }; out.set(key, r) }
    return r
  }

  for (const d of rows) {
    for (const [id, v] of Object.entries(d.media || {})) {
      const m = meta.media[id] || {}
      if (m.kind === 'notice') continue
      // A property BOARD is identified by its deterministic id
      // (media-board-<project>-<mode>[-<bed>]) or, for the legacy aggregate
      // docs, by web-type + property category. Category alone is NOT enough:
      // `forSale` is also the second-hand marketplace category, and a "Rare
      // Item! Urgent Sale!" post must not be folded into the unit boards.
      const bm = /^media-board-.+-(sale|rent)(?:-([A-Za-z0-9]+))?$/.exec(id)
      const legacyBoard = !bm && m.type === 'web' && (m.cat === 'forSale' || m.cat === 'forRent')
      const mode = bm ? bm[1] : m.cat === 'forSale' ? 'sale' : 'rent'
      const modeTxt = mode === 'sale' ? 'for sale' : 'for rent'
      const r = bm && bm[2]
        ? row(`__bt-${mode}-${bm[2]}`, `${bedLabel(bm[2])} · ${modeTxt} (ทุกตึก)`, 'media')
        : (bm || legacyBoard)
          ? row(`__board-${mode}`, `บอร์ด ${modeTxt} รวมชนิดห้อง (ทุกตึก)`, 'media')
          : row(id, m.name || id.slice(0, 12) + '…', 'media')
      r.per[d.project] = (r.per[d.project] || 0) + (v.tap || 0)
      r.aired[d.project] = r.aired[d.project] || (v.air || 0) > 0
      r.total += v.tap || 0
      r.air   += v.air || 0
    }
    for (const [key, nRaw] of Object.entries(d.units || {})) {
      const n = nRaw || 0
      if (!n) continue
      const t = meta.unitTypes[key] || {}
      const mode = t.intent || (/^sale-/.test(key) ? 'sale' : 'rent')
      const bed = t.bedType || 'ไม่ทราบชนิด'
      const r = row(`__room-${mode}-${bed}`,
                    `${bedLabel(bed)} · ${mode === 'sale' ? 'for sale' : 'for rent'}`, 'room')
      r.per[d.project] = (r.per[d.project] || 0) + n
      r.aired[d.project] = true
      r.total += n
    }
  }
  return Array.from(out.values())
}

export type MatrixSort = { col: 'total' | 'label' | string; dir: 1 | -1 }

/** Room rows first (the question the table exists for), then media; within a
 *  group, by the picked column. Sorting must never interleave the two groups —
 *  a pick and a tap are different depths and must not rank against each other. */
export function sortMatrix(rows: MatrixRow[], sort: MatrixSort): MatrixRow[] {
  const val = (r: MatrixRow) =>
    sort.col === 'total' ? r.total : sort.col === 'label' ? r.label : (r.per[sort.col] || 0)
  return [...rows].sort((a, b) => {
    if (a.group !== b.group) return a.group === 'room' ? -1 : 1
    if (sort.col === 'label') return sort.dir * String(val(a)).localeCompare(String(val(b)), 'th')
    return sort.dir * ((val(b) as number) - (val(a) as number)) || b.total - a.total || a.label.localeCompare(b.label, 'th')
  })
}

/** Monday-first ISO weeks present in the loaded rows, newest first — the week
 *  picker offers only ranges the data can actually answer. */
export function weeksInRows(rows: UsageRow[]): Array<{ from: string; to: string }> {
  const seen = new Map<string, { from: string; to: string }>()
  for (const r of rows) {
    // UTC math on the date STRING — new Date('…T00:00:00') is local time, and
    // toISOString would then shift Bangkok midnight back to the previous day.
    const [y, mo, da] = String(r.date || '').split('-').map(Number)
    if (!y || !mo || !da) continue
    const t = Date.UTC(y, mo - 1, da)
    const dow = (new Date(t).getUTCDay() + 6) % 7   // Mon=0
    const mon = t - dow * 86400000
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    seen.set(iso(mon), { from: iso(mon), to: iso(mon + 6 * 86400000) })
  }
  return Array.from(seen.values()).sort((a, b) => b.from.localeCompare(a.from))
}

export const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—')
export const num = (n: number | undefined) => (n || 0).toLocaleString('th-TH')
