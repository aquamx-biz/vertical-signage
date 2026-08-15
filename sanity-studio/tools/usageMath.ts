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

export const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—')
export const num = (n: number | undefined) => (n || 0).toLocaleString('th-TH')
