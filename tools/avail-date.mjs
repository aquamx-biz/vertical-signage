/**
 * avail-date.mjs — อ่าน "ห้องจะว่างเมื่อไหร่" จากข้อความประกาศ
 * แยกเป็นโมดูลเพราะ rescrape-listings.mjs รันงานทันทีที่ถูก import —
 * merge-browser-round.mjs ต้องใช้ตัวอ่านเดียวกันโดยไม่จุดชนวน scrape ทั้งรอบ
 */
/**
 * ห้องเช่าจำนวนมากยังไม่ว่าง — ประกาศเขียนว่า "ว่าง 1 ก.ย." เพราะผู้เช่าเดิมยังอยู่
 * ถ้านับรวมเป็นสต็อกว่าง จอจะโชว์ห้องที่ลูกค้าเข้าอยู่ไม่ได้ และค่ากลางก็เพี้ยนตาม
 * คืนวันที่ที่ห้องจะว่าง (YYYY-MM-DD) — อ่านไม่ออกคืน null ห้ามเดา
 */
const TH_MONTH = { 'ม.ค': 1, 'ก.พ': 2, 'มี.ค': 3, 'เม.ย': 4, 'พ.ค': 5, 'มิ.ย': 6, 'ก.ค': 7, 'ส.ค': 8, 'ก.ย': 9, 'ต.ค': 10, 'พ.ย': 11, 'ธ.ค': 12 }
const EN_MONTH = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
export function availableFromIn(text) {
  const CUE = /(?:available(?:\s+(?:from|on|after))?|ว่าง(?:วันที่)?|เข้าอยู่ได้|พร้อมเข้าอยู่)\s*[:\-]?\s*/i
  const m = text.match(new RegExp(CUE.source + '([^\\n<]{0,40})', 'i'))
  if (!m) return null
  const tail = m[1]
  if (/now|immediate|ทันที|เลย/i.test(tail)) return null       // ว่างแล้ว = ไม่ต้องบันทึก
  let d = null, mo = null, y = null
  const num1 = tail.match(/\b(\d{1,2})\s*([฀-๿.]{2,5})\s*(\d{2,4})?/)
  if (num1 && TH_MONTH[num1[2].replace(/\.$/, '')] != null) {
    d = +num1[1]; mo = TH_MONTH[num1[2].replace(/\.$/, '')]
    y = num1[3] ? (+num1[3] > 2400 ? +num1[3] - 543 : (+num1[3] < 100 ? 2500 + +num1[3] - 543 : +num1[3])) : null
  }
  /* อังกฤษเขียนได้สองแบบ "1 Sep 2026" กับ "Sep 1, 2026" — ต้องลองแบบวันมาก่อนก่อนเสมอ
     ไม่งั้น "1 Sep 2026" จะถูกอ่านเป็นเดือน Sep วันที่ 20 (หยิบ 20 จาก 2026) */
  const dmy = tail.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:,?\s*(\d{4}))?/)
  if (mo == null && dmy && EN_MONTH[dmy[2].toLowerCase()] != null) {
    d = +dmy[1]; mo = EN_MONTH[dmy[2].toLowerCase()]; y = dmy[3] ? +dmy[3] : null
  }
  const mdy = tail.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\b(?!\d)(?:,?\s*(\d{4}))?/)
  if (mo == null && mdy && EN_MONTH[mdy[1].toLowerCase()] != null) {
    mo = EN_MONTH[mdy[1].toLowerCase()]; d = +mdy[2]; y = mdy[3] ? +mdy[3] : null
  }
  const iso = tail.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (mo == null && iso) { y = +iso[1]; mo = +iso[2]; d = +iso[3] }
  if (mo == null || d == null || d < 1 || d > 31 || mo < 1 || mo > 12) return null
  if (y == null) {                       // ไม่ระบุปี = ปีที่ทำให้วันนั้นอยู่ข้างหน้า
    const now = new Date(), cur = now.getFullYear()
    y = (mo - 1 < now.getMonth() || (mo - 1 === now.getMonth() && d < now.getDate())) ? cur + 1 : cur
  }
  if (y < 2020 || y > 2100) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
