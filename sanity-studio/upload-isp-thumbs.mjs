/**
 * upload-isp-thumbs.mjs — อัปโหลดรูปย่อของแพ็กเกจเน็ตเข้า Sanity
 *
 * วิธีใช้:  cd sanity-studio  แล้ว  node upload-isp-thumbs.mjs
 *
 * สคริปต์นี้ "อัปโหลดอย่างเดียว" ไม่แตะเอกสารใด ๆ — มันจะพิมพ์ asset id ออกมา
 * แล้วค่อยเอา id นั้นไปผูกกับแพ็กเกจทีหลัง (แยกขั้นตอนไว้เพื่อให้ย้อนกลับง่าย
 * ถ้ารูปไม่สวยก็แค่ไม่ผูก ไม่มีอะไรเสียหายในข้อมูล)
 *
 * ต้องมี Node 18+ (ใช้ fetch ที่มากับ Node ไม่ต้องลง dependency อะไรเพิ่ม)
 */
import { readFileSync, existsSync } from 'node:fs'

const PROJECT = 'awjj9g8u'
const DATASET = 'production'

const FILES = [
  'isp-thumb-ais-fibre3.jpg',
  'isp-thumb-ais-condo.jpg',
  'isp-thumb-true.jpg',
]

// ── อ่าน token จาก .env.local / .env — ไม่ต้องพิมพ์ token ลงที่ไหน ─────────────
function readToken() {
  if (process.env.SANITY_WRITE_TOKEN) return process.env.SANITY_WRITE_TOKEN
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue
    const line = readFileSync(f, 'utf8')
      .split(/\r?\n/)
      .find(l => /^\s*(SANITY_WRITE_TOKEN|SANITY_STUDIO_WRITE_TOKEN)\s*=/.test(l))
    if (line) return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const token = readToken()
if (!token) {
  console.error('✗ หา SANITY_WRITE_TOKEN ไม่เจอ — ต้องรันในโฟลเดอร์ sanity-studio')
  process.exit(1)
}

const missing = FILES.filter(f => !existsSync(f))
if (missing.length) {
  console.error('✗ ไม่พบไฟล์รูป: ' + missing.join(', '))
  console.error('  ต้องวางไฟล์ .jpg ไว้ในโฟลเดอร์เดียวกับสคริปต์นี้')
  process.exit(1)
}

console.log(`อัปโหลดเข้า ${PROJECT}/${DATASET} …\n`)

const results = {}
for (const file of FILES) {
  const url = `https://${PROJECT}.api.sanity.io/v2021-06-07/assets/images/${DATASET}`
            + `?filename=${encodeURIComponent(file)}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
      body: readFileSync(file),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error(`✗ ${file} → HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`)
      continue
    }
    const id = body?.document?._id
    results[file] = id
    console.log(`✓ ${file}\n    ${id}\n`)
  } catch (err) {
    console.error(`✗ ${file} → ${err.message}`)
  }
}

const ok = Object.keys(results).length
console.log('─'.repeat(60))
console.log(`เสร็จ ${ok}/${FILES.length} ไฟล์`)
if (ok) {
  console.log('\nก็อปบล็อกข้างล่างนี้ส่งกลับให้ Claude เพื่อผูกรูปเข้ากับแต่ละแพ็กเกจ:\n')
  console.log(JSON.stringify(results, null, 2))
}
