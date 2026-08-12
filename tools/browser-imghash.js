/**
 * browser-imghash.js — คำนวณ dHash รูปห้อง "ในเบราว์เซอร์" (Chrome จริงตอน scrape)
 *
 * ทำไมต้องในเบราว์เซอร์: PropertyHub/FazWaz/DDproperty บล็อกการดึงฝั่ง server ทั้งหมด
 * (curl/node fetch โดน Cloudflare · URL รูป CDN เซ็น token หมดอายุ) — เบราว์เซอร์จริง
 * ที่คุณ scrape อยู่ผ่านด่านนั้นได้ จึงคำนวณ hash ตรงนั้นเลย
 *
 * dHash 64-bit: greyscale → ย่อ 9×8 → เทียบพิกเซลข้างกัน (ซ้าย>ขวา = 1)
 *   ทนต่อการ resize/บีบอัด · รูปเดียว/ห้องเดียว ห่าง ~<10 · คนละห้อง >~18 (จาก 64)
 *
 * ใช้ในลูป scrape: บนหน้า listing แต่ละใบ →  record.imgHash = await aqxListingImgHash()
 * แล้วส่ง imgHash ไปกับ record (ผ่าน round JSON) · ingest ฝั่ง node จะใช้เป็นตัวแยกห้อง
 */
(function (g) {
  // dHash ของ URL รูป (fetch เป็น blob ก่อน → canvas ไม่ tainted แม้ข้าม origin)
  async function aqxImgHash(url) {
    const res = await fetch(url, { credentials: 'omit' })
    if (!res.ok) throw new Error('img ' + res.status)
    const bmp = await createImageBitmap(await res.blob())
    const cv = new OffscreenCanvas(9, 8)
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bmp, 0, 0, 9, 8)
    const d = ctx.getImageData(0, 0, 9, 8).data
    let h = 0n
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const i = (y * 9 + x) * 4, j = (y * 9 + x + 1) * 4
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const R = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]
      h = (h << 1n) | (L > R ? 1n : 0n)
    }
    return h.toString(16).padStart(16, '0')   // 16 hex = 64 bit
  }

  // หา "รูปห้องหลัก" ของหน้า listing — og:image เป็นรูปหลักของทุก portal (ห้อง ไม่ใช่ปกตึก)
  // สำรอง: รูปใหญ่สุดบนหน้า (กว้าง >200px) เผื่อ portal ไม่มี og:image
  function aqxRoomImageUrl() {
    const og = document.querySelector('meta[property="og:image"], meta[name="og:image"]')
    if (og && og.content && /^https?:/.test(og.content)) return og.content
    let best = null, area = 0
    for (const im of document.images) {
      const a = (im.naturalWidth || 0) * (im.naturalHeight || 0)
      if (a > area && im.naturalWidth > 200 && !/logo|icon|avatar|qr|line|whatsapp/i.test(im.src || '')) { area = a; best = im.currentSrc || im.src }
    }
    return best
  }

  // เรียกบนหน้า listing → คืน hash (หรือ null ถ้าไม่มีรูป/อ่านไม่ได้) — ไม่ throw ให้ scrape สะดุด
  async function aqxListingImgHash() {
    const url = aqxRoomImageUrl()
    if (!url) return null
    try { return await aqxImgHash(url) } catch (e) { return null }
  }

  g.aqxImgHash = aqxImgHash
  g.aqxRoomImageUrl = aqxRoomImageUrl
  g.aqxListingImgHash = aqxListingImgHash
})(typeof window !== 'undefined' ? window : globalThis)
