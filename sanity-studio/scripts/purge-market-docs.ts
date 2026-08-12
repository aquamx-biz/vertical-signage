/**
 * purge-market-docs.ts — ล้าง unitProfile (production) + unitSource (internal)
 * ก่อน re-import ndjson ชุดใหม่ (refCode เป็น running number — ถ้าไม่ล้าง จะมี doc ค้างจากรอบเก่า)
 *
 * ⚠ ลบ unitSource = ลบ contactLog/cobroke ที่ทีมจดไว้ด้วย!
 *   รอบนี้ยังไม่มีโน้ตจริงจึงปลอดภัย — รอบหน้าให้บอก Claude ทำ merge-import แทน
 *
 * รัน:  npx sanity exec scripts/purge-market-docs.ts --with-user-token
 */
import { getCliClient } from 'sanity/cli'

const client = getCliClient({ apiVersion: '2025-01-01' })

async function purge(dataset: string, type: string) {
  const c = client.withConfig({ dataset })
  let total = 0
  for (;;) {
    const ids: string[] = await c.fetch(`*[_type == $t][0...500]._id`, { t: type })
    if (!ids.length) break
    const tx = c.transaction()
    ids.forEach(id => tx.delete(id))
    await tx.commit({ visibility: 'async' })
    total += ids.length
    console.log(`  ${dataset}/${type}: deleted ${total}...`)
  }
  console.log(`✔ ${dataset}/${type}: ${total} deleted`)
}

async function clearBoardLineups() {
  // unitBoard.lineup = strong refs → block การลบ unitProfile
  // refs ชี้ profile ชุดเก่า (เลข U ชุดเก่า) ใช้ต่อไม่ได้อยู่แล้ว — ล้างแล้วให้ทีม
  // กด generate lineup ใหม่ใน Studio หลัง import เสร็จ
  const c = client.withConfig({ dataset: 'production' })
  const ids: string[] = await c.fetch(`*[_type == "unitBoard" && defined(lineup)]._id`)
  for (const id of ids) {
    await c.patch(id).set({
      lineup: [],
      lineupWarnings: ['lineup ถูกล้างอัตโนมัติ (re-import ข้อมูลชุด cleaned) — กด generate ใหม่ใน Unit Boards tool'],
    }).commit()
    console.log(`  cleared lineup: ${id}`)
  }
  console.log(`✔ unitBoard lineups cleared: ${ids.length}`)
}

async function main() {
  await clearBoardLineups()
  await purge('production', 'unitProfile')
  await purge('internal', 'unitSource')
  console.log('Done — พร้อม import ndjson ชุดใหม่')
}
main().catch(e => { console.error(e); process.exit(1) })
