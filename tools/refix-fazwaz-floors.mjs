#!/usr/bin/env node
/**
 * refix-fazwaz-floors.mjs — เก็บ "ชั้นจริงของห้อง" จากหน้า FazWaz มาทับค่าที่ผิด
 *
 * Usage: node --env-file=.env tools/refix-fazwaz-floors.mjs [--project <ชื่อตึก>] [--write]
 *
 * ทำไมต้องมี: รอบเก็บข้อมูลเดิมหยิบเลขชั้นจากบล็อกสิ่งอำนวยความสะดวก (ชั้นสระว่ายน้ำ)
 * ทุกห้องในตึกเดียวกันจึงได้เลขเดียวกันหมด — The Lumpini 24 ได้ 41 ทั้ง 285 การ์ด,
 * Noble BE19 ได้ 44 ทั้ง 139 การ์ด · หน้าเว็บมีสองช่องที่คนละความหมาย:
 *   basic-information-topic  ">Floor"   = ชั้นของห้อง      ← ใช้ตัวนี้
 *   project-information-topic">Floors:" = จำนวนชั้นของตึก  ← ห้ามใช้
 * สคริปต์นี้อ่านช่องแรกเท่านั้น และปฏิเสธค่าที่ดันไปเท่ากับจำนวนชั้นของตึก
 */
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const argOf = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const ONLY = argOf('--project')

const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const q = async (query, ds = 'production') => {
  const r = await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}

const RE_UNIT = /basic-information-topic">Floor<\/span>\s*<span class="basic-information-info[^"]*">\s*(\d+)\s*<\/span>/
const RE_BLD  = /project-information-topic">Floors:<\/span>\s*<span class="project-information-info[^"]*">\s*(\d+)\s*<\/span>/

async function floorOf(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } })
      if (r.status === 404 || r.status === 410) return { err: `หน้าหาย (${r.status}) — ประกาศถูกลบ` }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const t = await r.text()
      const u = RE_UNIT.exec(t), b = RE_BLD.exec(t)
      if (!u) return { err: 'หน้าไม่มีช่อง Floor ของห้อง' }
      const floor = Number(u[1]), total = b ? Number(b[1]) : null
      // ค่าที่เท่ากับจำนวนชั้นของตึกพอดี น่าสงสัยว่าอ่านผิดช่อง — ไม่รับ
      if (total && floor === total) return { err: `ชั้นห้อง (${floor}) เท่ากับจำนวนชั้นตึกพอดี — ไม่รับ` }
      return { floor, total }
    } catch (e) {
      if (attempt === 2) return { err: String(e.message ?? e) }
      await new Promise(r2 => setTimeout(r2, 800 * (attempt + 1)))
    }
  }
}

/* ห้องที่ต้องแก้ = ทุกห้องที่ประกาศมาจาก FazWaz ล้วน (ไม่มีพอร์ทัลอื่นมาเขียนทับชั้นให้) */
const src = await q(`*[_type == "unitSource" && defined(listings)]{ _id, refCode, projectName, floorActual,
  "l": listings[]{ portal, url } }`, 'internal')
const targets = src.filter(s => {
  if (ONLY && s.projectName !== ONLY) return false
  const ports = [...new Set((s.l ?? []).map(x => x.portal))]
  return ports.length === 1 && ports[0] === 'FazWaz'
})
console.log(`ห้องที่ต้องเก็บชั้นใหม่ (ประกาศมาจาก FazWaz ล้วน): ${targets.length} ห้อง\n`)

const out = []
const LIMIT = 4
for (let i = 0; i < targets.length; i += LIMIT) {
  await Promise.all(targets.slice(i, i + LIMIT).map(async s => {
    const url = (s.l ?? []).find(x => x.url)?.url
    if (!url) { out.push({ s, err: 'ไม่มี url' }); return }
    const r = await floorOf(url)
    out.push({ s, ...r })
  }))
  process.stdout.write(`\r  อ่านแล้ว ${Math.min(i + LIMIT, targets.length)}/${targets.length}`)
}
console.log('\n')

const ok = out.filter(x => x.floor != null)
const bad = out.filter(x => x.floor == null)
const changed = ok.filter(x => x.floor !== x.s.floorActual)

const byProj = {}
for (const x of ok) (byProj[x.s.projectName] ??= []).push(x)
for (const [p, rows] of Object.entries(byProj)) {
  const c = {}; rows.forEach(x => c[x.floor] = (c[x.floor] ?? 0) + 1)
  const spread = Object.keys(c).length
  console.log(`${p} — อ่านได้ ${rows.length} ห้อง · ชั้นไม่ซ้ำ ${spread} ค่า ${spread === 1 ? '⚠ ยังกองค่าเดียว' : '✓ กระจายแล้ว'}`)
  console.log('  ' + rows.slice(0, 8).map(x => `${x.s.refCode}: ${x.s.floorActual}→${x.floor}`).join(' · '))
}
if (bad.length) {
  console.log(`\nอ่านไม่ได้ ${bad.length} ห้อง (จะล้างชั้นทิ้งให้กลับไปแสดงเป็นโซน ดีกว่าปล่อยเลขผิดค้าง):`)
  bad.slice(0, 10).forEach(x => console.log(`  ${x.s.refCode}  ${x.err}`))
}
console.log(`\nสรุป: เปลี่ยนค่า ${changed.length} · เท่าเดิม ${ok.length - changed.length} · ล้างทิ้ง ${bad.length}`)

if (!WRITE) { console.log('\n(dry-run — เพิ่ม --write เพื่อเขียนจริง)'); process.exit(0) }

const mutations = [
  ...changed.map(x => ({ patch: { id: x.s._id, set: { floorActual: x.floor } } })),
  ...bad.map(x => ({ patch: { id: x.s._id, unset: ['floorActual'] } })),
]
if (!mutations.length) { console.log('ไม่มีอะไรต้องเขียน'); process.exit(0) }
const r = await fetch(`${API}/data/mutate/internal`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mutations }),
})
if (!r.ok) { console.error(`mutate ${r.status}: ${await r.text()}`); process.exit(1) }
console.log(`\n✓ เขียนแล้ว ${mutations.length} ห้อง — อย่าลืมรัน seed-board-offers ซ้ำเพื่ออัปเดตชื่อห้องใน offer`)
