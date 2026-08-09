#!/usr/bin/env node
/**
 * restore-lineups.mjs — สร้าง lineup ของบอร์ดใหม่หลังถูกล้าง แล้วเขียนกลับ
 *
 * Usage: node --env-file=.env tools/restore-lineups.mjs [--write]
 *
 * 2026-08-08 06:20 มีการ re-import ข้อมูลชุด cleaned ทับทั้งระบบ ตัวนำเข้าล้าง
 * lineup ของบอร์ดทุกใบทิ้ง (อ้างถึงเอกสารเก่าที่ถูกแทนแล้ว) จอจึงขึ้นบอร์ดว่าง
 * สคริปต์นี้เรียก selectWithPolicy ตัวเดียวกับที่ปุ่ม generate ใน Unit Boards ใช้
 * ด้วย policy ที่เก็บอยู่บนบอร์ดใบนั้นเอง — ผลจึงเหมือนกดปุ่มในเครื่องมือทุกประการ
 *
 * เขียนทับ "ใบที่ publish แล้ว" โดยตรง เพราะนี่คือการกู้ของที่เคยออกอากาศอยู่
 * ไม่ใช่การปล่อยของใหม่ — แต่ยังต้องกด Deploy Now เองเพื่อให้ขึ้นจอ
 */
import { selectWithPolicy, DEFAULT_POLICY } from '../board-engine.mjs'
const WRITE = process.argv.includes('--write')
const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const q = async (s, ds = 'production') => {
  const r = await fetch(`${API}/data/query/${ds}?query=${encodeURIComponent(s)}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`query ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}
/* ชั้นที่ FazWaz ให้มาเป็นค่าคงที่ประจำตึก (ชั้นสระ/ฟิตเนส ไม่ใช่ชั้นห้อง) —
   ชุดข้อมูลที่ re-import มารอบนี้มีบั๊กเดิมกลับมา จึงต้องรู้ว่าห้องไหนโดน */
const POOL_FLOOR = { 'The Lumpini 24': 41, 'Noble BE19': 44, 'The Room Sukhumvit 21': 4 }

const [boards, profiles, floors] = await Promise.all([
  q(`*[_type=="unitBoard" && !(_id in path("drafts.**"))]{_id,mode,policy,"code":project->code.current,"proj":project->title,"n":count(lineup)}|order(_id)`),
  q(`*[_type=="unitProfile"]{refCode,intent,projectName,bedType,sqm,floorZone,priceTHB,pricePerSqm,
      vsFloorPct,vsZonePct,dealTier,hotDeal,goodInvest,negotiable,yieldPct,spreadPct,nListings,nPortals,
      postedByOwner,dualListed,pinToBoard,hideFromBoard,status,lastCheckedAt}`),
  q(`*[_type=="unitSource" && defined(floorActual)]{refCode,floorActual}`, 'internal'),
])
const FL = new Map(floors.map(f => [f.refCode, f.floorActual]))
/* ชื่อโครงการใน project doc กับใน unitProfile ไม่ตรงกันเป๊ะ — "Lumpini 24" vs
   "The Lumpini 24" · เทียบแบบตัด "the" นำหน้าและไม่สนตัวพิมพ์ ไม่งั้นตึกนั้นถูกข้ามเงียบ ๆ */
const norm = s => String(s ?? '').toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, ' ').trim()
const muts = []
for (const b of boards) {
  if (!b.code || !b.mode) continue
  const pool = profiles.filter(p => norm(p.projectName) === norm(b.proj) && p.intent === b.mode)
  if (!pool.length) { console.log(`⚠ ${b.code}·${b.mode}: ไม่มีห้องในโครงการนี้ — ข้าม`); continue }
  const sim = selectWithPolicy(pool, b.mode, b.policy ?? DEFAULT_POLICY)
  if (!sim.rows.length) { console.log(`⚠ ${b.code}·${b.mode}: engine เลือกไม่ได้สักห้อง — ข้าม`); continue }
  const suspect = sim.rows.filter(p => FL.get(p.refCode) != null && FL.get(p.refCode) === POOL_FLOOR[norm(b.proj) === 'lumpini 24' ? 'The Lumpini 24' : b.proj])
  const beds = {}; sim.rows.forEach(p => beds[p.bedType] = (beds[p.bedType] ?? 0) + 1)
  console.log(`↻ ${String(b.code + '·' + b.mode).padEnd(22)} ${b.n ?? 0} → ${sim.rows.length} ห้อง · ${Object.entries(beds).map(([k, v]) => `${k} ${v}`).join(' ')}`
    + (suspect.length ? `  ⚠ ชั้นน่าสงสัย ${suspect.length} ห้อง (${suspect.map(p => p.refCode).join(' ')})` : ''))
  sim.warnings.forEach(w => console.log(`      ⚠ ${w}`))
  muts.push({ patch: { id: b._id, set: {
    lineup: sim.rows.map((p, i) => ({ _type: 'reference', _key: `lu${i}`, _ref: `unitProfile-${p.refCode}-${b.mode}` })),
    lineupWarnings: [...sim.warnings, 'กู้คืนด้วย restore-lineups.mjs หลังถูกล้างจาก re-import 2026-08-08'],
    lineupGeneratedAt: new Date().toISOString(),
  } } })
}
if (!muts.length) { console.log('\nไม่มีอะไรให้ทำ'); process.exit(0) }
if (!WRITE) { console.log('\n(dry-run — เพิ่ม --write)'); process.exit(0) }
const r = await fetch(`${API}/data/mutate/production`, { method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mutations: muts }) })
if (!r.ok) { console.error(`mutate ${r.status}: ${await r.text()}`); process.exit(1) }
console.log(`\n✓ กู้คืน ${muts.length} บอร์ดแล้ว — กด Deploy Now เพื่อให้ขึ้นจอ`)
