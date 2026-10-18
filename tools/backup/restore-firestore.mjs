// Write a backup-firestore.mjs export back into Firestore. Dry run unless --write.
//
//   node tools/backup/restore-firestore.mjs firestore.ndjson.gz [--only leads,orders] [--write]
//   env FIREBASE_SERVICE_ACCOUNT_JSON
//
// Each document is SET (overwritten) to its backed-up fields; documents created
// after the backup are left alone. Free tier allows 20k writes/day — a full
// restore of ~2k docs fits easily, but check `--only` before restoring config.

import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { serviceAccountFromEnv, accessToken } from './google-auth.mjs'

const args  = process.argv.slice(2)
const file  = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--only')
const write = args.includes('--write')
const only  = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null
if (!file) { console.error('usage: restore-firestore.mjs <file.ndjson.gz> [--only a,b] [--write]'); process.exit(2) }

const docs = []
for await (const line of createInterface({ input: createReadStream(file).pipe(createGunzip()) })) {
  if (!line.trim()) continue
  const d = JSON.parse(line)
  if (!only || only.has(d.path.split('/')[0])) docs.push(d)
}
const per = {}
for (const d of docs) per[d.path.split('/')[0]] = (per[d.path.split('/')[0]] ?? 0) + 1
for (const [c, n] of Object.entries(per).sort()) console.log(`${c.padEnd(28)} ${n}`)
console.log(`${docs.length} documents ${write ? '→ writing' : '(dry run — add --write to restore)'}`)
if (!write) process.exit(0)

const sa    = serviceAccountFromEnv('FIREBASE_SERVICE_ACCOUNT_JSON')
const token = await accessToken(sa, ['https://www.googleapis.com/auth/datastore'])
const db    = `projects/${sa.project_id}/databases/(default)`
for (let i = 0; i < docs.length; i += 400) {
  const writes = docs.slice(i, i + 400).map(d => ({ update: { name: `${db}/documents/${d.path}`, fields: d.fields } }))
  const res = await fetch(`https://firestore.googleapis.com/v1/${db}/documents:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  })
  if (!res.ok) throw new Error(`commit at ${i} → ${res.status}: ${(await res.text()).slice(0, 300)}`)
  console.log(`written ${Math.min(i + 400, docs.length)}/${docs.length}`)
}
