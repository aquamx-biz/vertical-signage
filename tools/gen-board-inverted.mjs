#!/usr/bin/env node
/**
 * gen-board-inverted.mjs — สร้าง mockup-board-inverted.html จาก board.html
 * (สลับสี ส้ม/บรอนซ์ ↔ กรม เพื่อเทียบว่าบอร์ดกลืนกับกรอบ navy ของ player ไหม)
 * แล้ว re-bake _board-39bs-{rent,sale}-inv/ ด้วยข้อมูลชุดเดียวกับเวอร์ชัน navy
 *
 * Usage:  node tools/gen-board-inverted.mjs
 * รันซ้ำทุกครั้งหลังแก้ board.html เพื่อให้ mockup ตามทัน
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
let h = readFileSync(join(root, 'board.html'), 'utf8')

const R = (a, b) => {
  if (!h.includes(a)) throw new Error('anchor missing (board.html เปลี่ยนโครง?): ' + a.slice(0, 60))
  h = h.split(a).join(b)
}

R('<title>aquamx board</title>', '<title>aquamx board — inverted mockup</title>')
R('#stage{width:1080px;height:1920px;background:#072147', '#stage{width:1080px;height:1920px;background:#C9864C')
R('.tile i.mid{position:absolute;left:0;right:0;top:50%;height:3px;background:#072147}',
  '.tile i.mid{position:absolute;left:0;right:0;top:50%;height:3px;background:#C9864C}')
R('.ltile{display:inline-block;width:44px;height:68px;line-height:68px;background:#FAF6ED',
  '.ltile{display:inline-block;width:44px;height:68px;line-height:68px;background:#072147')
R('font-weight:700;text-align:center;color:#072147;position:relative;overflow:hidden}',
  'font-weight:700;text-align:center;color:#FAF6ED;position:relative;overflow:hidden}')
R('.ltile i.mid{position:absolute;left:0;right:0;top:50%;height:3px;background:#D9D2C0}',
  '.ltile i.mid{position:absolute;left:0;right:0;top:50%;height:3px;background:#0E3361}')
// .ctxt (TYPE/SQM) เป็นครีมทั้งสองธีม — ไม่ต้องแปลง
R('.bl{color:#9fb3d1}', '.bl{color:#6b3f1d}')
// ส่วนข้อมูลภาพ (เตียง/บาร์ ตรม./ขีดชั้น) บนพื้นบรอนซ์
R('.bedic{font-size:36px;color:#FAF6ED;margin-right:4px}', '.bedic{font-size:36px;color:#072147;margin-right:4px}')
R('.sqbar i{display:block;height:100%;background:#C9864C;border-radius:3px}', '.sqbar i{display:block;height:100%;background:#FAF6ED;border-radius:3px}')
R('.lvl i.on{background:#9fb3d1}', '.lvl i.on{background:#072147}')
R('.lvl i{width:9px;background:#1d3a66;border-radius:2px}', '.lvl i{width:9px;background:#a9713c;border-radius:2px}')
R('.rg{color:#7BC99A}.ro{color:#E8A66B}.rw{color:#FAF6ED}', '.rg{color:#14532d}.ro{color:#7c2d12}.rw{color:#072147}')
R(".colh{font-family:'IBM Plex Mono',Consolas,monospace;font-size:26px;letter-spacing:.05em;color:#C9864C",
  ".colh{font-family:'IBM Plex Mono',Consolas,monospace;font-size:26px;letter-spacing:.05em;color:#072147")
R('font-size:58px;font-weight:500;color:#FAF6ED;letter-spacing:.02em', 'font-size:58px;font-weight:500;color:#072147;letter-spacing:.02em')
R('font-size:50px;color:#C9864C;margin-right:18px', 'font-size:50px;color:#072147;margin-right:18px')
R('font-size:28px;color:#9fb3d1">All prices', 'font-size:28px;color:#6b3f1d">All prices')

writeFileSync(join(root, 'mockup-board-inverted.html'), h)
console.log('✓ mockup-board-inverted.html')

for (const m of ['rent', 'sale']) {
  const src = readFileSync(join(root, `_board-39bs-${m}/index.html`), 'utf8')
  const inj = src.match(/<script>\/\* MOCKUP[^<]*window.__BOARD__ = .*?;<\/script>/s)[0]
  mkdirSync(join(root, `_board-39bs-${m}-inv`), { recursive: true })
  writeFileSync(join(root, `_board-39bs-${m}-inv/index.html`), h.replace('</head>', inj + '\n</head>'))
  console.log(`✓ _board-39bs-${m}-inv/`)
}
