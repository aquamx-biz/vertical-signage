#!/usr/bin/env node
/**
 * seed-board-media.mjs — สร้าง media แบบ web ที่ชี้ไปหน้าบอร์ดการ์ดของแต่ละโปรเจ็กต์
 *
 * Usage: node --env-file=.env tools/seed-board-media.mjs [--project <code>] [--write]
 *   สร้างเป็น draft เสมอ · มีอยู่แล้วไม่แตะ (ทีมอาจแต่งค่าไว้)
 *
 * scope=project + projects=[โปรเจ็กต์เดียว] เป็นหัวใจ — media ตัวนี้ต้องขึ้นเฉพาะ
 * playlist ของตึกตัวเอง ห้ามกลายเป็น global ไปโผล่ทุกจอ
 *
 * ก่อนเอาขึ้น playlist: หน้า /board-cards/{mode}/ ต้องมีอยู่จริงบนเว็บก่อน ซึ่งจะเกิด
 * ต่อเมื่อ unitBoard ถูก publish แล้วรีบิลด์ (build.mjs อ่าน perspective=published)
 * ถ้ายังไม่มี Netlify จะคืน index.html = ตัวเล่นจอ แล้วจอจะเล่นตัวเองซ้อนในตัวเอง
 * สคริปต์นี้จึงเช็คเนื้อหาหน้าให้ก่อน และเตือนถ้ายังไม่พร้อม
 */
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const ONLY = argOf('--project')
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const q = async (query, ds = 'production') => {
  const r = await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}
const TH = { rent: 'For Rent', sale: 'For Sale' }
const EN = { rent: 'Units for rent', sale: 'Selected units for sale' }

const [projects, boards, providers, media] = await Promise.all([
  q(`*[_type=="project" && !(_id in path("drafts.**"))]{_id,"code":code.current,title,kioskBaseUrl}`),
  q(`*[_type=="unitBoard"]{_id,mode,"code":project->code.current,"n":count(lineup)}`),
  q(`*[_type=="provider" && slug.current=="aquamx" && status==true && !(_id in path("drafts.**"))]{_id}`),
  q(`*[_type=="media" && type=="web"]{_id,webUrl}`),
])
const providerId = providers[0]?._id
if (!providerId) { console.error('ไม่พบ provider aquamx'); process.exit(1) }
const haveUrl = new Set(media.map(m => m.webUrl).filter(Boolean))

/* บอร์ดที่มี lineup จริง — draft ชนะ published (คือชุดล่าสุดที่ทีมคัดไว้) */
const seen = new Map()
for (const b of boards) {
  if (!b.code || !b.mode || !b.n) continue
  const k = `${b.code}·${b.mode}`
  if (!seen.has(k) || b._id.startsWith('drafts.')) seen.set(k, b)
}

const muts = []
for (const [k, b] of [...seen].sort()) {
  const [code, mode] = k.split('·')
  if (ONLY && code !== ONLY) continue
  const proj = projects.find(p => p.code === code)
  if (!proj) { console.log(`⚠ ${k}: ไม่พบ project doc`); continue }
  if (!proj.kioskBaseUrl) { console.log(`⚠ ${k}: project ยังไม่ได้ตั้ง kioskBaseUrl — ข้าม`); continue }
  const url = `${proj.kioskBaseUrl.replace(/\/+$/, '')}/board-cards/${mode}/`
  if (haveUrl.has(url)) { console.log(`= ${k}: มี media ชี้ URL นี้อยู่แล้ว — ไม่แตะ`); continue }

  // หน้าปลายทางพร้อมรึยัง — ถ้ายังจะได้ตัวเล่นจอกลับมา ไม่ใช่บอร์ด
  let ready = false, note = ''
  try {
    const r = await fetch(url)
    const t = r.ok ? await r.text() : ''
    ready = /aquamx card board/i.test(t)
    if (!ready) note = /Signage Player/i.test(t) ? 'ยังไม่มีหน้านี้ (Netlify คืนตัวเล่นจอแทน)' : `หน้าไม่ใช่บอร์ด (${r.status})`
  } catch (e) { note = `เปิดไม่ได้: ${e.message}` }

  muts.push({ createOrReplace: {
    _id: `drafts.media-board-${code}-${mode}`, _type: 'media',
    kind: 'promo', type: 'web', webUrl: url,
    title: `${TH[mode]} — ${proj.title}`,
    altText: `${EN[mode]} — ${proj.title}`,
    offer: { _type: 'reference', _ref: `offer-board-${code}-${mode}`, _weak: true },
    provider: { _type: 'reference', _ref: providerId },
    scope: 'project',
    projects: [{ _type: 'reference', _ref: proj._id, _key: 'p0' }],
    displayLang: 'th', isActive: true, defaultImageDuration: 63,
    addToPlaylistOnPublish: false, deployOnPublish: false, removeFromPlaylistOnPublish: false,
  } })
  console.log(`＋ ${k}: ${url}  ${ready ? '✓ หน้าพร้อม' : `⚠ ${note}`}`)
}

if (!muts.length) { console.log('\nไม่มีอะไรให้ทำ'); process.exit(0) }
if (!WRITE) { console.log('\n(dry-run — เพิ่ม --write)'); process.exit(0) }
const r = await fetch(`${API}/data/mutate/production`, { method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mutations: muts }) })
if (!r.ok) { console.error(`mutate ${r.status}: ${await r.text()}`); process.exit(1) }
console.log(`\n✓ เขียน ${muts.length} draft แล้ว — อย่าเพิ่งใส่ playlist จนกว่าหน้าปลายทางจะพร้อม`)
