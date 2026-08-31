#!/usr/bin/env node
/**
 * ingest-dryrun.mjs — ตัวห่อ ingest-units.mjs ที่เขียน Sanity ไม่ได้เด็ดขาด
 *
 * มีไว้เพื่อให้รอบอัตโนมัติ (scheduled weekly round) รัน dry-run ได้เองโดยไม่ต้องขออนุมัติ
 * ทุกสัปดาห์ ขณะที่การ "เขียนจริง" ยังต้องให้คนกดอนุมัติเสมอ — กันชนอยู่ที่ชั้นสิทธิ์
 * ไม่ใช่แค่ชั้นคำสั่ง
 *
 * Usage:  node --env-file=.env tools/ingest-dryrun.mjs --round <file> --date YYYY-MM-DD
 *
 * ส่ง --write มาจะไม่รัน (exit 2) — ถ้าจะเขียนจริงให้เรียก tools/ingest-units.mjs --write ตรง ๆ
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)

if (args.includes('--write')) {
  console.error('✗ ingest-dryrun.mjs เขียนเข้า Sanity ไม่ได้ตามออกแบบ')
  console.error('  ถ้าตรวจ warnings แล้วและตั้งใจจะเขียนจริง ให้รัน:')
  console.error('  node --env-file=.env tools/ingest-units.mjs --round <file> --date <ROUND> --write')
  process.exit(2)
}

const here = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [join(here, 'ingest-units.mjs'), ...args], { stdio: 'inherit' })
process.exit(r.status ?? 1)
