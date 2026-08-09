/**
 * market-model.mjs — ค่าคงที่ของตลาดต่อตึก: floor premium · yield · ราคาอ้างอิง
 *
 * ใช้ร่วมกันระหว่าง tools/gen-analysis.mjs (แสดงผล) และ build.mjs (คิดความคุ้ม)
 * เพื่อไม่ให้ตัวเลขบนหน้า Analysis กับบนจอมาจากสูตรคนละชุด
 *
 * กติกาที่ตกลงกันไว้ (2026-08-09):
 *   ตัด noise      IQR — ทิ้งห้องที่อยู่นอก Q1−1.5×IQR ถึง Q3+1.5×IQR
 *   floor premium  แบ่งห้องเป็น 3 กลุ่มตามชั้น เทียบ median กลุ่มบนกับกลุ่มล่าง
 *                  (กลุ่มกลางไม่ใช้ — ชั้นใกล้กันราคาไม่ต่าง ทำให้ตัวหารเล็กจนผลพอง)
 *   ราคาอ้างอิง     mean ของห้องที่เหลือหลังตัด IQR
 *   ชั้นอ้างอิง     mean ของชั้น จากห้องชุดเดียวกับที่ใช้หาราคาอ้างอิง
 *   yield          (ค่าเช่าอ้างอิง × 12) ÷ ราคาขายอ้างอิง — ตัด noise ทั้งสองฝั่ง
 *                  ตัดฝั่งเดียวจะทำให้ตัวหารเล็กลงข้างเดียว yield พองขึ้น
 *   ตึกที่ floor premium ติดลบ หรือข้อมูลน้อยกว่า MIN_N → ใช้ค่ากลางของทุกตึกแทน
 *
 * ค่ากลางของทุกตึกใช้ median โดยรวมทุกตึกที่คำนวณได้ รวมตึกที่ติดลบด้วย
 * (median ทนต่อค่าเดียวที่หลุดอยู่แล้ว — ตัดออกก่อนจะเป็นการเลือกข้อมูลให้ตรงกับที่อยากเห็น)
 */
export const MIN_N = 20          // ห้องขั้นต่ำต่อฝั่งถึงจะเชื่อค่าของตึกตัวเอง
export const BANDS = 3           // แบ่งกี่กลุ่มตามชั้น

export const mean = a => a.reduce((x, y) => x + y, 0) / a.length
export const median = a => {
  const s = [...a].sort((x, y) => x - y), n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
/** คืน "แถว" ที่รอด ไม่ใช่แค่ตัวเลข — ชั้นอ้างอิงต้องมาจากห้องชุดเดียวกัน */
export const iqrKeep = (rows, pick = r => r.psqm) => {
  if (rows.length < 4) return rows
  const s = rows.map(pick).sort((a, b) => a - b)
  const Q = p => s[Math.floor((s.length - 1) * p)]
  const iqr = Q(0.75) - Q(0.25)
  return rows.filter(r => pick(r) >= Q(0.25) - 1.5 * iqr && pick(r) <= Q(0.75) + 1.5 * iqr)
}

/** floor premium ของตึกเดียว (บาท/ตร.ม./ชั้น) — null เมื่อคำนวณไม่ได้ */
export function floorPremiumOf(rows) {
  const withFloor = rows.filter(r => r.floor != null)
  if (withFloor.length < BANDS * 2) return null
  const s = [...withFloor].sort((a, b) => a.floor - b.floor)
  const k = Math.floor(s.length / BANDS)
  const lo = s.slice(0, k), hi = s.slice(-k)
  const dF = median(hi.map(r => r.floor)) - median(lo.map(r => r.floor))
  if (!dF) return null
  return {
    value: (median(hi.map(r => r.psqm)) - median(lo.map(r => r.psqm))) / dF,
    n: s.length, k,
    loFloor: median(lo.map(r => r.floor)), loPsqm: median(lo.map(r => r.psqm)),
    hiFloor: median(hi.map(r => r.floor)), hiPsqm: median(hi.map(r => r.psqm)),
  }
}

/**
 * rows: [{ building, intent:'rent'|'sale', psqm, floor }]
 * คืน { fpSale, avgYield, byBuilding{} }
 */
export function marketModel(rows) {
  const names = [...new Set(rows.map(r => r.building))].sort()
  const per = {}
  for (const b of names) {
    const S = iqrKeep(rows.filter(r => r.building === b && r.intent === 'sale'))
    const R = iqrKeep(rows.filter(r => r.building === b && r.intent === 'rent'))
    const fp = S.length >= MIN_N ? floorPremiumOf(S) : null
    per[b] = {
      nSale: S.length, nRent: R.length,
      saleRef:  S.length ? mean(S.map(r => r.psqm)) : null,
      rentRef:  R.length ? mean(R.map(r => r.psqm)) : null,
      refFloorSale: S.filter(r => r.floor != null).length ? mean(S.filter(r => r.floor != null).map(r => r.floor)) : null,
      refFloorRent: R.filter(r => r.floor != null).length ? mean(R.filter(r => r.floor != null).map(r => r.floor)) : null,
      fpRaw: fp,
      yieldOwn: (S.length >= MIN_N && R.length >= MIN_N)
        ? mean(R.map(r => r.psqm)) * 12 / mean(S.map(r => r.psqm)) : null,
    }
  }
  const fps = Object.values(per).map(x => x.fpRaw?.value).filter(v => v != null)
  const yls = Object.values(per).map(x => x.yieldOwn).filter(v => v != null)
  const fpSale = fps.length ? median(fps) : 0
  const avgYield = yls.length ? median(yls) : 0
  for (const b of names) {
    const x = per[b]
    // ติดลบ = ขัดกับสมมติฐานว่าชั้นสูงมีค่ามากกว่า · ข้อมูลน้อย = เชื่อค่าตัวเองไม่ได้
    const bad = x.fpRaw == null || x.fpRaw.value <= 0
    x.usedGlobalFp = bad
    x.fpSale = bad ? fpSale : x.fpRaw.value
    x.yieldUsed = x.yieldOwn ?? avgYield
    x.usedGlobalYield = x.yieldOwn == null
    x.fpRentOwn   = x.fpSale * x.yieldUsed / 12      // แบบ A — yield ของตึกเอง
    x.fpRentAvg   = x.fpSale * avgYield / 12         // แบบ B — yield กลาง
    x.rentRefAvg  = x.saleRef != null ? x.saleRef * avgYield / 12 : null
  }
  return { fpSale, avgYield, byBuilding: per }
}

/** ราคาที่ "ควรเป็น" ของชั้นนั้น แล้วเทียบกับราคาจริง — ติดลบ = ถูกกว่าที่ควร */
export function expectedPsqm(ref, premium, refFloor, floor) {
  if (ref == null || refFloor == null || floor == null) return null
  return ref + premium * (floor - refFloor)
}
export function valueVsExpected(actual, expected) {
  return expected ? (actual - expected) / expected : null
}
