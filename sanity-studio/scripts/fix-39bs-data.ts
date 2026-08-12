/**
 * fix-39bs-data.ts — ล้างผล audit 39BS (2026-08-09) ฝั่งข้อมูลใน Sanity
 * อ้างอิง: _audit-39bs.md (§1 ห้องผี · §3 ประกาศ 404) + _audit-39bs-remaining.md ④
 *
 * 1. ลบ 17 ห้องผี (sqm/ราคา LI เพี้ยนยกชุด — ห้องไม่มีจริง): profiles ทั้งสอง intent + source
 * 2. ถอดประกาศ 404 (16 ใบ) ออกจาก rentListings/saleListings ของ 12 ห้อง
 *    แล้วซ่อม profile ฝั่งที่กระทบ: ไม่เหลือประกาศ → expired · ราคา min เปลี่ยน → อัพเดท + โน้ต
 * 3. backfill firstSeenAt ให้ profile ทุกตึกที่ยังเป็น null (ใช้ priceHistory[0].date →
 *    lastCheckedAt → 2026-07-29) — กันทุกห้องติดป้าย NEW พร้อมกันในรอบ ingest ถัดไป
 *
 * รัน:  npx sanity exec scripts/fix-39bs-data.ts --with-user-token
 *
 * ⚠ บทเรียนรอบแรก (audit ตรวจซ้ำครั้งที่ 3): ถ้าจะเอาไปรันกับตึกอื่น ต้องสลับลำดับเป็น
 *   backfill firstSeenAt "ก่อน" ขั้นถอด 404 — เพราะขั้นถอดจะ set lastCheckedAt เป็นวันรัน
 *   แล้ว backfill (ที่ fallback ไป lastCheckedAt) จะได้วันตรวจแทนวันรอบข้อมูล → ป้าย NEW ปลอม
 */
import { getCliClient } from 'sanity/cli'

const client = getCliClient({ apiVersion: '2025-01-01' })
const prod = client.withConfig({ dataset: 'production' })
const internal = client.withConfig({ dataset: 'internal' })
const TODAY = '2026-08-09'

// §1 — 17 ห้องผี
const PHANTOMS = ['U074','U075','U076','U077','U078','U079','U080','U081','U082','U083',
                  'U084','U085','U086','U150','U151','U152','U161'].map(u => `39BS-${u}`)

// §3 — ประกาศ 404 (ตัด listing รายใบด้วย url)
const DEAD: Record<string, string[]> = {
  '39BS-U023': ['5427c1f6b36d-3441-2f62-1487-c500a089'],
  '39BS-U030': ['45031f76ba6e-9040-cf42-ab06-65f3a089'],
  '39BS-U033': ['7ad7590e7df1-0d5f-e432-c49d-6906a089'],
  '39BS-U045': ['6e3a09ccad53-c331-fad2-74bd-4673a089'],
  '39BS-U051': ['25464923aafb-1f3e-0f92-ba6f-bd85b089'],
  '39BS-U052': ['19bdb0c6226d-ee9f-18a2-ba18-66170089', '59adef17969c-f3ef-7322-0e11-5650b089'],
  '39BS-U055': ['cdc1612af532-f3e1-df32-e36a-5610a089'],
  '39BS-U056': ['d254c59d3697-151f-6582-f277-b499a089'],
  '39BS-U066': ['propertyscout.co.th/en/1-br-condo-39-by-sansiri-near-bts-phrom-phong-2307470'],
  '39BS-U099': ['81a3ba2a6130-695e-1b82-dc5b-be15a089'],
  '39BS-U118': ['propertyscout.co.th/en/2-br-condo-39-by-sansiri-near-bts-phrom-phong-2307471'],
  '39BS-U119': ['adf689c182f8-0890-9242-0ca4-0500a089'],
  '39BS-U153': ['7f90043164a7-3f31-fc52-e0c7-6e10a089'],
  '39BS-U154': ['b834029a8159-b9c0-f592-5f4d-36dac089'],
}

async function main() {
  // ── 1. ลบห้องผี ──
  const phantomProfIds = await prod.fetch(
    `*[_type=="unitProfile" && refCode in $refs]._id`, { refs: PHANTOMS })
  const phantomSrcIds = await internal.fetch(
    `*[_type=="unitSource" && refCode in $refs]._id`, { refs: PHANTOMS })
  if (phantomProfIds.length) {
    const tx = prod.transaction(); phantomProfIds.forEach((id: string) => tx.delete(id)); await tx.commit()
  }
  if (phantomSrcIds.length) {
    const tx = internal.transaction(); phantomSrcIds.forEach((id: string) => tx.delete(id)); await tx.commit()
  }
  console.log(`✔ ห้องผีลบแล้ว: ${phantomProfIds.length} profiles + ${phantomSrcIds.length} sources (${PHANTOMS.length} refCodes)`)

  // ── 2. ถอดประกาศ 404 + ซ่อม profile ที่กระทบ ──
  let removed = 0
  for (const [ref, frags] of Object.entries(DEAD)) {
    const src = await internal.fetch(`*[_type=="unitSource" && refCode==$r][0]`, { r: ref })
    if (!src) { console.warn(`  ⚠ ${ref}: ไม่พบ source`); continue }
    const hit = (u?: string) => !!u && frags.some(f => u.includes(f))
    const newRent = (src.rentListings ?? []).filter((l: any) => !hit(l.url))
    const newSale = (src.saleListings ?? []).filter((l: any) => !hit(l.url))
    const cut = ((src.rentListings?.length ?? 0) - newRent.length) + ((src.saleListings?.length ?? 0) - newSale.length)
    if (!cut) { console.warn(`  ⚠ ${ref}: ไม่เจอ url ที่ระบุ (อาจถูกถอดไปแล้ว)`); continue }
    removed += cut
    await internal.patch(src._id).set({
      rentListings: newRent, saleListings: newSale,
      cobrokeNote: [(src.cobrokeNote ?? ''), `${TODAY}: ถอดประกาศ 404 ออก ${cut} ใบ (audit 39BS)`]
        .filter(Boolean).join('\n'),
    }).commit()

    // ซ่อม profile ต่อ intent ที่โดนตัด
    for (const [intent, arr] of [['rent', newRent], ['sale', newSale]] as const) {
      const pid = `unitProfile-${ref}-${intent}`
      const p = await prod.fetch(`*[_id==$id][0]{_id, priceTHB, sqm, status}`, { id: pid })
      if (!p) continue
      const prices = arr.map((l: any) => l.price).filter((v: any) => v != null)
      if (!prices.length) {
        // ฝั่งนี้ยังมี listing มั๊ยจริง ๆ (ตัดเฉพาะเมื่อฝั่งนี้เคยโดน)
        const hadCut = (intent === 'rent'
          ? (src.rentListings?.length ?? 0) !== newRent.length
          : (src.saleListings?.length ?? 0) !== newSale.length)
        if (hadCut) {
          await prod.patch(pid).set({ status: 'expired', lastCheckedAt: TODAY,
            internalNote: `${TODAY}: ประกาศฝั่งนี้ตาย (404) หมดแล้ว → expired (audit 39BS)` }).commit()
          console.log(`  ${pid} → expired (ไม่เหลือประกาศ)`)
        }
        continue
      }
      const min = Math.min(...prices)
      if (p.priceTHB != null && p.priceTHB < min) {
        await prod.patch(pid).set({
          priceTHB: min,
          pricePerSqm: p.sqm ? Math.round(min / p.sqm) : undefined,
          lastCheckedAt: TODAY,
          internalNote: `${TODAY}: ราคา min เดิม ${p.priceTHB.toLocaleString()} มาจากประกาศ 404 → ปรับเป็น ${min.toLocaleString()} จากประกาศที่ยังอยู่ (audit 39BS)`,
        }).commit()
        console.log(`  ${pid} ราคา ${p.priceTHB.toLocaleString()} → ${min.toLocaleString()}`)
      }
    }
  }
  console.log(`✔ ถอดประกาศ 404: ${removed} ใบ`)

  // ── 3. backfill firstSeenAt (ทุกตึก) ──
  let done = 0
  for (;;) {
    const batch = await prod.fetch(
      `*[_type=="unitProfile" && !defined(firstSeenAt)][0...200]{_id, lastCheckedAt, "h0": priceHistory[0].date}`)
    if (!batch.length) break
    const tx = prod.transaction()
    for (const d of batch)
      tx.patch(d._id, pt => pt.set({ firstSeenAt: d.h0 ?? d.lastCheckedAt ?? '2026-07-29' }))
    await tx.commit()
    done += batch.length
    console.log(`  backfill firstSeenAt ${done}...`)
  }
  console.log(`✔ backfill firstSeenAt: ${done} profiles`)
  console.log('Done — ข้อมูล 39BS สอดคล้องกับ audit แล้ว · ingest รอบหน้าปลอดภัย')
}
main().catch(e => { console.error(e); process.exit(1) })
