// Upload one backup set to the aquamx-backup Shared Drive, then prune old sets.
//
//   node tools/backup/upload-drive.mjs <dir> <setName> [keep=8]
//   env GDRIVE_SA_JSON   drive-backup@aquamx-handoff — Content manager on the drive
//       GDRIVE_DRIVE_ID  optional; defaults to the aquamx-backup Shared Drive
//
// Every file in <dir> lands in a folder <setName> (e.g. 2026-10-25). Pruning
// keeps the newest <keep> sets by name rather than by age, so weeks of failed
// runs never delete the last good backups. Pruned folders go to the Shared
// Drive's trash (recoverable for 30 days), never a hard delete.

import { readdir, stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serviceAccountFromEnv, accessToken } from './google-auth.mjs'

const [dir, setName, keepArg = '8'] = process.argv.slice(2)
if (!dir || !/^\d{4}-\d{2}-\d{2}/.test(setName ?? '')) {
  console.error('usage: upload-drive.mjs <dir> <YYYY-MM-DD…> [keep]'); process.exit(2)
}
const KEEP     = Math.max(1, Number(keepArg) || 8)
const DRIVE_ID = process.env.GDRIVE_DRIVE_ID || '0AELUbtPLaWdRUk9PVA'   // aquamx-backup
const FOLDER   = 'application/vnd.google-apps.folder'
const API      = 'https://www.googleapis.com/drive/v3'
const UPLOAD   = 'https://www.googleapis.com/upload/drive/v3'
const ALL      = 'supportsAllDrives=true'

const sa    = serviceAccountFromEnv('GDRIVE_SA_JSON')
const token = await accessToken(sa, ['https://www.googleapis.com/auth/drive'])
const auth  = { Authorization: `Bearer ${token}` }

async function drive(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...auth, ...init.headers } })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url.split('?')[0]} → ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.status === 204 ? null : res.json()
}

async function listSets() {
  const q = encodeURIComponent(`'${DRIVE_ID}' in parents and mimeType='${FOLDER}' and trashed=false`)
  const r = await drive(`${API}/files?q=${q}&corpora=drive&driveId=${DRIVE_ID}&includeItemsFromAllDrives=true&${ALL}&fields=files(id,name)&pageSize=200`)
  return r.files.filter(f => /^\d{4}-\d{2}-\d{2}/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name))
}

// Re-running a day replaces that day's folder instead of leaving two of them
for (const old of (await listSets()).filter(f => f.name === setName)) {
  await drive(`${API}/files/${old.id}?${ALL}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
  console.log(`replaced earlier ${setName} folder`)
}

const folder = await drive(`${API}/files?${ALL}&fields=id`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: setName, mimeType: FOLDER, parents: [DRIVE_ID] }),
})

for (const name of (await readdir(dir)).sort()) {
  const path = join(dir, name)
  const { size } = await stat(path)
  // resumable session: one PUT carries the whole file (largest today ≈ 450 MB,
  // fine in a runner's memory); the session survives a slow link better than multipart
  const init = await fetch(`${UPLOAD}/files?uploadType=resumable&${ALL}&fields=id,size,md5Checksum`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(size) },
    body: JSON.stringify({ name, parents: [folder.id] }),
  })
  if (!init.ok) throw new Error(`upload session for ${name} → ${init.status}: ${(await init.text()).slice(0, 300)}`)
  const put = await fetch(init.headers.get('location'), {
    method: 'PUT', body: await readFile(path),
  })
  if (!put.ok) throw new Error(`upload ${name} → ${put.status}: ${(await put.text()).slice(0, 300)}`)
  const meta = await put.json()
  if (Number(meta.size) !== size) throw new Error(`${name}: Drive has ${meta.size} bytes, local ${size}`)
  console.log(`uploaded ${name.padEnd(36)} ${(size / 1e6).toFixed(1).padStart(8)} MB  md5 ${meta.md5Checksum}`)
}

const sets = await listSets()
for (const old of sets.slice(0, Math.max(0, sets.length - KEEP))) {
  await drive(`${API}/files/${old.id}?${ALL}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
  console.log(`pruned ${old.name} (trash)`)
}
console.log(`drive: ${setName} done, ${Math.min(sets.length, KEEP)} set(s) kept`)
