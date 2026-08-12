/**
 * fix-39bs-round2.ts — ปิด 2 ข้อค้างจาก _audit-39bs-remaining.md (ตรวจซ้ำครั้งที่ 3)
 *
 * ① snap ราคา currency-drift ใน listing ทุกใบ + คำนวณค่าสรุปของ profile ใหม่จาก
 *    listing ที่เหลือจริงหลังถอด 404: nListings / nPortals / spreadPct / negotiable
 *    / priceTHB / pricePerSqm  (สูตรเดียวกับ ingest-units.mjs: nego = nPortals>=3 && spread>=5)
 *    — รันทุกตึก ไม่ใช่แค่ 39BS: โรค nPortals/spread ปน intent กับราคา DP drift มีทุกตึก
 * ② firstSeenAt ที่เพี้ยนเป็นวันตรวจ (2026-08-01/08/09 — เกิดจากลำดับสเต็ปรอบก่อน:
 *    patch lastCheckedAt ก่อน backfill) → ตั้งกลับเป็นวันรอบข้อมูล 2026-07-29
 *
 * รัน:  npx sanity exec scripts/fix-39bs-round2.ts --with-user-token
 */
import { getCliClient } from 'sanity/cli'

const client = getCliClient({ apiVersion: '2025-01-01' })
const prod = client.withConfig({ dataset: 'production' })
const internal = client.withConfig({ dataset: 'internal' })
const ROUND_DATE = '2026-07-29'

const snap = (p?: number | null) => {
  if (p == null || p < 100000) return p ?? null
  const rem = p % 1000
  return rem !== 0 && (rem <= 50 || rem >= 950) ? Math.round(p / 1000) * 1000 : p
}

async function main() {
  // ── ① listing snap + aggregate recompute ──
  const sources = await internal.fetch(
    `*[_type == "unitSource"]{ _id, refCode, projectName, rentListings, saleListings }`)
  let snappedListings = 0
  const srcByRef = new Map<string, any>()
  for (const s of sources) {
    let changed = false
    for (const side of ['rentListings', 'saleListings'] as const) {
      for (const l of s[side] ?? []) {
        const v = snap(l.price)
        if (v !== l.price) { l.price = v; changed = true; snappedListings++ }
      }
    }
    if (changed) await internal.patch(s._id)
      .set({ rentListings: s.rentListings ?? undefined, saleListings: s.saleListings ?? undefined }).commit()
    srcByRef.set(s.refCode, s)
  }
  console.log(`✔ snap ราคา listing: ${snappedListings} ใบ`)

  const profiles = await prod.fetch(
    `*[_type == "unitProfile" && status != "expired"]{ _id, refCode, projectName, intent, sqm,
      priceTHB, nListings, nPortals, spreadPct, negotiable }`)
  const counts: Record<string, number> = { nListings: 0, nPortals: 0, spreadPct: 0, negotiable: 0, priceTHB: 0 }
  let patched = 0
  const perB: Record<string, number> = {}
  for (const p of profiles) {
    const src = srcByRef.get(p.refCode)
    if (!src) continue
    const side = (p.intent === 'rent' ? src.rentListings : src.saleListings) ?? []
    if (!side.length) continue                       // ฝั่งว่าง = เคสหมดอายุ จัดการไปแล้ว ไม่แตะ
    const prices = side.map((l: any) => l.price).filter((v: any) => v != null)
    if (!prices.length) continue
    const min = Math.min(...prices), max = Math.max(...prices)
    const nL = side.length
    const nP = new Set(side.map((l: any) => String(l.portal ?? '').toLowerCase().replace(/\W/g, ''))).size
    const spread = min > 0 ? Math.round(((max - min) / min) * 100) : 0
    const nego = nP >= 3 && spread >= 5
    const set: Record<string, unknown> = {}
    if (p.nListings !== nL) { set.nListings = nL; counts.nListings++ }
    if (p.nPortals !== nP) { set.nPortals = nP; counts.nPortals++ }
    if ((p.spreadPct ?? 0) !== spread) { set.spreadPct = spread; counts.spreadPct++ }
    if ((p.negotiable ?? false) !== nego) { set.negotiable = nego; counts.negotiable++ }
    if (p.priceTHB !== min) { set.priceTHB = min; counts.priceTHB++
      if (p.sqm) set.pricePerSqm = Math.round(min / p.sqm) }
    if (Object.keys(set).length) {
      await prod.patch(p._id).set(set).commit()
      patched++
      perB[p.projectName] = (perB[p.projectName] ?? 0) + 1
    }
  }
  console.log(`✔ recompute aggregates: patch ${patched} profiles`)
  console.log(`   เปลี่ยน: nListings ${counts.nListings} · nPortals ${counts.nPortals} · spread ${counts.spreadPct} · nego ${counts.negotiable} · priceTHB ${counts.priceTHB}`)
  console.log('   ต่อตึก:', JSON.stringify(perB))

  // ── ② firstSeenAt เพี้ยนเป็นวันตรวจ ──
  const bad = await prod.fetch(
    `*[_type == "unitProfile" && firstSeenAt in ["2026-08-01","2026-08-08","2026-08-09"]]._id`)
  for (const id of bad) await prod.patch(id).set({ firstSeenAt: ROUND_DATE }).commit()
  console.log(`✔ firstSeenAt วันตรวจ → ${ROUND_DATE}: ${bad.length} ใบ (${bad.join(', ') || '—'})`)
  console.log('Done')
}
main().catch(e => { console.error(e); process.exit(1) })
