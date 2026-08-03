#!/usr/bin/env node
/**
 * board-lineup.mjs — คัด lineup ตาม policy แล้วเขียนลง unitBoard (draft) ให้ทีมรีวิว
 *
 * Usage:  node --env-file=.env tools/board-lineup.mjs              # dry-run ทุกโครงการ
 *         node --env-file=.env tools/board-lineup.mjs "Park 24"    # dry-run เฉพาะโครงการ
 *         node --env-file=.env tools/board-lineup.mjs --write ["Park 24"]
 *
 * Flow: policy (จาก unitBoard doc หรือค่า default) → engine คัด + warnings
 *       → --write: patch ลง drafts.unitBoard-<code>-<mode> (lineup, warnings, generatedAt)
 *       → ทีมรีวิว/สลับ/ถอดใน Studio → publish → build ใช้ lineup ตรง ๆ
 *
 * ข้อมูลไม่พอโควตา = เติมจากดีลดีสุดอัตโนมัติเสมอ + รายงานเป็น warning (ไม่เงียบ)
 * เขียนได้เฉพาะโครงการที่มีเอกสาร project ใน Sanity (ตึกที่ยังไม่เข้าระบบ kiosk = dry-run เท่านั้น)
 */
import { selectWithPolicy, PROFILE_PROJECTION, DEFAULT_POLICY } from '../board-engine.mjs'

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const ONLY = args.find(a => !a.startsWith('--'))
const TOKEN = process.env.SANITY_TOKEN
if (!TOKEN) { console.error('SANITY_TOKEN not set — run with node --env-file=.env'); process.exit(1) }

const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
async function fetchGroq(query, dataset = 'production') {
  const r = await fetch(`${API}/data/query/${dataset}?query=${encodeURIComponent(query)}&perspective=published`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`Sanity ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}
async function mutate(mutations) {
  const r = await fetch(`${API}/data/mutate/production`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations }),
  })
  if (!r.ok) throw new Error(`Sanity mutate ${r.status}: ${await r.text()}`)
  return r.json()
}

// projectName (จาก pipeline) → project doc (ระบบ kiosk)
const NAME_TO_CODE = {
  '39 by Sansiri': '39-by-sansiri', 'The Lumpini 24': 'lumpini-24',
  'The Room Sukhumvit 21': 'the-room-skv21', 'Noble BE19': 'noble-be19',
  'Mahogany Tower': 'mahogany-tower', 'Park 24': 'park24',
}

const [profiles, projects, boards, contacts] = await Promise.all([
  fetchGroq(`*[_type == "unitProfile" && status != "expired"]{ projectName, ${PROFILE_PROJECTION} }`),
  fetchGroq(`*[_type == "project"]{ _id, title, "code": code.current }`),
  fetchGroq(`*[_type == "unitBoard"]{ _id, mode, "code": project->code.current, policy }`),
  fetchGroq(`*[_type == "unitSource" && defined(bestContact.phone) && bestContact.phone != ""].refCode`, 'internal').catch(() => []),
])
const contactSet = new Set(contacts ?? [])
const projByCode = new Map(projects.map(p => [p.code, p]))
const boardByKey = new Map(boards.map(b => [`${b.code}·${b.mode}`, b]))

const byProject = new Map()
for (const p of profiles) {
  if (ONLY && p.projectName !== ONLY) continue
  if (!byProject.has(p.projectName)) byProject.set(p.projectName, [])
  byProject.get(p.projectName).push(p)
}

for (const [name, pool] of [...byProject.entries()].sort()) {
  const code = NAME_TO_CODE[name]
  const proj = code ? projByCode.get(code) : null
  console.log(`\n═══ ${name}${proj ? ` → ${code}` : '  (ไม่มี project doc — dry-run เท่านั้น)'}`)

  for (const mode of ['rent', 'sale']) {
    const board = code ? boardByKey.get(`${code}·${mode}`) : null
    const policy = board?.policy ?? {}
    const { rows, warnings } = selectWithPolicy(pool.filter(p => p.intent === mode), mode, policy)
    if (!rows.length) { console.log(`  [${mode}] ไม่มีห้องผ่านเกณฑ์ — ข้าม`); continue }

    // คุณภาพของ lineup ที่เสนอ — ทีมต้อง verify ก่อน publish
    const unverified = rows.filter(p => p.status !== 'published').length
    const noContact  = rows.filter(p => !contactSet.has(p.refCode)).length
    const allWarnings = [
      ...warnings,
      unverified ? `${unverified}/${rows.length} ห้องยังไม่ status=published — ต้อง verify ก่อน publish lineup` : null,
      noContact ? `${noContact}/${rows.length} ห้องยังไม่มี Best Contact ใน workspace Internal` : null,
    ].filter(Boolean)

    console.log(`  [${mode}] ${rows.length} แถว: ${rows.map(r => r.refCode.split('-U')[1]).join(',')}`)
    allWarnings.forEach(w => console.log(`    ⚠ ${w}`))

    if (WRITE && proj) {
      const docId = board?._id?.replace(/^drafts\./, '') ?? `unitBoard-${code}-${mode}`
      await mutate([{
        createOrReplace: {
          _id: `drafts.${docId}`,
          _type: 'unitBoard',
          project: { _type: 'reference', _ref: proj._id },
          mode,
          isActive: true,
          ...(board?.policy ? { policy: board.policy } : {}),
          lineup: rows.map((p, i) => ({
            _type: 'reference', _key: `lu${i}`,
            _ref: `unitProfile-${p.refCode}-${p.intent}`,
          })),
          lineupWarnings: allWarnings,
          lineupGeneratedAt: new Date().toISOString(),
        },
      }])
      console.log(`    ✓ เขียน drafts.${docId} (รอทีมรีวิว/publish ใน Studio)`)
    }
  }
}
console.log(`\n${WRITE ? 'เขียน draft เสร็จ' : 'dry-run เท่านั้น — เพิ่ม --write เพื่อเขียนลง Studio'}`)
