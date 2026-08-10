#!/usr/bin/env node
/**
 * sync-preview-templates.mjs — ก๊อปเทมเพลตบอร์ดตัวจริง (ราก) มาไว้ที่ static/ ให้ปุ่ม Preview
 * ใน UnitBoardsTool โหลด · รันอัตโนมัติก่อน build/deploy (predeploy/prebuild ใน package.json)
 *
 * ทำไมต้องมี: preview เปิด iframe ชี้ static/board-cards.html แต่จอจริง bake จาก
 * ../board-cards.html ที่ราก — เป็นสำเนามือ 2 ไฟล์ที่เคยดริฟต์กัน 95 บรรทัด
 * (10 ส.ค. preview โชว์บอร์ดเวอร์ชันก่อนรื้อ ทั้งที่จอจริงเป็นเวอร์ชันใหม่)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
for (const f of ['board-cards.html', 'board.html']) {
  const src = readFileSync(join(root, f), 'utf8')
  const dst = join(root, 'sanity-studio', 'static', f)
  if (readFileSync(dst, 'utf8') === src) { console.log(`= ${f} ตรงกันอยู่แล้ว`); continue }
  writeFileSync(dst, src)
  console.log(`↻ ${f} ซิงก์จากราก → static/`)
}
