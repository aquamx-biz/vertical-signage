#!/usr/bin/env node
/**
 * seed-board-media.mjs — สร้าง media แบบ web ที่ชี้ไปหน้าบอร์ดการ์ด "แยกตามชนิดห้อง"
 *
 * Usage: node --env-file=.env tools/seed-board-media.mjs [--project <code>] [--write]
 *   สร้างเป็น draft เสมอ · ใบที่มี URL นั้นอยู่แล้วไม่ถูกแตะ (ทีมอาจแต่งค่าไว้)
 *
 * ทำไมแยกตามชนิดห้อง: คนหา 1 นอนไม่รอดู 3 นอนผ่านไป และป๊อปอัปเปิดมาตรงชนิดเลย
 * ทำไมชนิดที่มีน้อยกว่า SEG_MIN ไม่ได้สไลด์: สไลด์หนึ่งใบกินเวลาออกอากาศเท่ากันหมด
 * ไม่ว่าจะมีการ์ด 1 ใบหรือ 7 ใบ — เอา 28 วินาทีไปโชว์ห้องเดียวคือเบียดเวลาของ
 * คอนเทนต์ที่ผู้ประกอบการจ่ายเงินซื้อ (ห้องพวกนั้นยังอยู่ในป๊อปอัปครบ)
 *
 * scope=project + projects=[โปรเจ็กต์เดียว] เป็นหัวใจ — ห้ามกลายเป็น global
 */
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const ONLY = argOf('--project')
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'

const SEG_MIN = 3          // ต้องตรงกับ build.mjs
const PER_PAGE = 7         // ต้องตรงกับ board-cards.html
const LANGS = 4, LANG_S = 7

const q = async (query, ds = 'production') => {
  const r = await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}
const BED_TH = { studio: 'สตูดิโอ', '1bed': '1 นอน', '2bed': '2 นอน', '3bed': '3 นอน', '4bed': '4 นอน+' }
const BED_EN = { studio: 'Studio', '1bed': '1 Bed', '2bed': '2 Bed', '3bed': '3 Bed', '4bed': '4 Bed+' }
const SLUG   = { studio: 'studio', '1bed': '1bed', '2bed': '2bed', '3bed': '3bed', '4bed': '4bedplus' }
const TH = { rent: 'For Rent', sale: 'For Sale' }
const EN = { rent: 'Units for rent', sale: 'Selected units for sale' }
const ORDER = ['studio', '1bed', '2bed', '3bed', '4bed']

const [projects, boards, providers, media] = await Promise.all([
  q(`*[_type=="project" && !(_id in path("drafts.**"))]{_id,"code":code.current,title,kioskBaseUrl}`),
  q(`*[_type=="unitBoard"]{_id,mode,"code":project->code.current,"beds":lineup[]->bedType}`),
  q(`*[_type=="provider" && slug.current=="aquamx" && status==true && !(_id in path("drafts.**"))]{_id}`),
  q(`*[_type=="media" && type=="web"]{_id,webUrl}`),
])
const providerId = providers[0]?._id
if (!providerId) { console.error('ไม่พบ provider aquamx'); process.exit(1) }
const haveUrl = new Set(media.map(m => m.webUrl).filter(Boolean))

const best = new Map()                       // (code·mode) → บอร์ดล่าสุด (draft ชนะ published)
for (const b of boards) {
  if (!b.code || !b.mode || !b.beds?.length) continue
  const k = `${b.code}·${b.mode}`
  if (!best.has(k) || b._id.startsWith('drafts.')) best.set(k, b)
}

const muts = [], retire = []
for (const [k, b] of [...best].sort()) {
  const [code, mode] = k.split('·')
  if (ONLY && code !== ONLY) continue
  const proj = projects.find(p => p.code === code)
  if (!proj?.kioskBaseUrl) { console.log(`⚠ ${k}: ไม่มี project doc หรือยังไม่ตั้ง kioskBaseUrl — ข้าม`); continue }
  const base = proj.kioskBaseUrl.replace(/\/+$/, '')
  const c = {}; b.beds.forEach(x => c[x] = (c[x] ?? 0) + 1)
  const keep = ORDER.filter(x => (c[x] ?? 0) >= SEG_MIN)
  const drop = ORDER.filter(x => c[x] && (c[x] ?? 0) < SEG_MIN)
  if (!keep.length) { console.log(`⚠ ${k}: ไม่มีชนิดไหนถึง ${SEG_MIN} ห้อง — ข้าม (${Object.entries(c).map(([x,n])=>`${BED_TH[x]} ${n}`).join(' ')})`); continue }

  for (const seg of keep) {
    const url = `${base}/board-cards/${mode}/${SLUG[seg]}/`
    const secs = Math.ceil(c[seg] / PER_PAGE) * LANGS * LANG_S
    if (haveUrl.has(url)) { console.log(`= ${k}·${BED_TH[seg]}: มี media ชี้ URL นี้แล้ว — ไม่แตะ`); continue }
    muts.push({ createOrReplace: {
      _id: `drafts.media-board-${code}-${mode}-${SLUG[seg]}`, _type: 'media',
      kind: 'promo', type: 'web', webUrl: url,
      title: `${TH[mode]} · ${BED_TH[seg]} — ${proj.title}`,
      altText: `${EN[mode]} · ${BED_EN[seg]} — ${proj.title}`,
      offer: { _type: 'reference', _ref: `offer-board-${code}-${mode}`, _weak: true },
      provider: { _type: 'reference', _ref: providerId },
      scope: 'project',
      projects: [{ _type: 'reference', _ref: proj._id, _key: 'p0' }],
      displayLang: 'th', isActive: true,
      // เวลาต้องพอเล่นครบทุกหน้า × ทุกภาษา ไม่งั้นภาษาสุดท้ายไม่มีวันได้แสดง
      defaultImageDuration: secs,
      addToPlaylistOnPublish: false, deployOnPublish: false, removeFromPlaylistOnPublish: false,
    } })
    console.log(`＋ ${k}·${BED_TH[seg]} (${c[seg]} ห้อง · ${secs} วิ)  ${url}`)
  }
  if (drop.length) console.log(`   ↳ ไม่ทำสไลด์ให้: ${drop.map(x => `${BED_TH[x]} ${c[x]} ห้อง`).join(' · ')}`)
  retire.push(`${base}/board-cards/${mode}/`)
}

if (retire.length) {
  const old = media.filter(m => retire.includes(m.webUrl))
  if (old.length) {
    console.log(`\n⚠ media แบบรวมทุกชนิดที่ควรถอดออกจาก playlist หลังใบใหม่ขึ้นแล้ว ${old.length} ใบ:`)
    old.forEach(m => console.log(`    ${m._id}  ${m.webUrl}`))
    console.log('   (ไม่ลบให้อัตโนมัติ — ถอดเองเมื่อพร้อม ไม่งั้นจอจะว่างช่วงสลับ)')
  }
}
if (!muts.length) { console.log('\nไม่มีอะไรให้ทำ'); process.exit(0) }
console.log(`\nจะสร้าง ${muts.length} ใบ`)
if (!WRITE) { console.log('(dry-run — เพิ่ม --write)'); process.exit(0) }
const r = await fetch(`${API}/data/mutate/production`, { method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mutations: muts }) })
if (!r.ok) { console.error(`mutate ${r.status}: ${await r.text()}`); process.exit(1) }
console.log(`✓ เขียน ${muts.length} draft แล้ว`)
