// Firestore → gzipped NDJSON, one line per document, every collection and subcollection.
//
//   node tools/backup/backup-firestore.mjs out/firestore.ndjson.gz
//   env FIREBASE_SERVICE_ACCOUNT_JSON  (the handoff service account)
//
// Values are kept in Firestore's typed REST form ({stringValue}, {timestampValue} …)
// so a restore writes back exactly what was read — see tools/backup/RESTORE.md.
//
// Cost: one read per document plus one listCollectionIds call per document
// (subcollection discovery). ~2,000 docs on 2026-10-18 → ~4k reads per daily run, far
// under the free 50k/day the fleet pages also live on (firestore-read-quota).
// The project has no managed export: that needs Blaze, which we do not pay for.

import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createGzip } from 'node:zlib'
import { serviceAccountFromEnv, accessToken } from './google-auth.mjs'

const out = process.argv[2]
if (!out) { console.error('usage: backup-firestore.mjs <out.ndjson.gz>'); process.exit(2) }

const sa    = serviceAccountFromEnv('FIREBASE_SERVICE_ACCOUNT_JSON')
const token = await accessToken(sa, ['https://www.googleapis.com/auth/datastore'])
const ROOT  = `projects/${sa.project_id}/databases/(default)/documents`
const API   = 'https://firestore.googleapis.com/v1'
const HEAD  = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

async function call(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, headers: HEAD })
    if (res.ok) return res.json()
    const body = (await res.text()).slice(0, 300)
    // 429 = quota (the fleet's too) — back off rather than hammer it; anything else is final
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise(r => setTimeout(r, attempt * 5000))
      continue
    }
    throw new Error(`${res.status} ${url.replace(API, '')}: ${body}`)
  }
}

async function collectionIds(parent) {
  const ids = []
  let pageToken
  do {
    const r = await call(`${API}/${parent}:listCollectionIds`, {
      method: 'POST', body: JSON.stringify({ pageSize: 500, pageToken }),
    })
    ids.push(...(r.collectionIds ?? []))
    pageToken = r.nextPageToken
  } while (pageToken)
  return ids
}

const gz = createGzip()
await mkdir(dirname(out), { recursive: true })
const done = new Promise((resolve, reject) => {
  gz.pipe(createWriteStream(out)).on('finish', resolve).on('error', reject)
})
const counts = {}
let total = 0

async function walk(parent, depth) {
  for (const id of await collectionIds(parent)) {
    let pageToken
    do {
      // showMissing: a doc that only holds subcollections has no fields and is
      // otherwise invisible — without it everything beneath it is skipped
      const qs = new URLSearchParams({ pageSize: '300', showMissing: 'true' })
      if (pageToken) qs.set('pageToken', pageToken)
      const r = await call(`${API}/${parent}/${id}?${qs}`)
      for (const doc of r.documents ?? []) {
        const path = doc.name.slice(ROOT.length + 1)
        if (doc.fields || doc.createTime) {
          gz.write(JSON.stringify({ path, fields: doc.fields ?? {}, createTime: doc.createTime, updateTime: doc.updateTime }) + '\n')
          const top = path.split('/')[0]
          counts[top] = (counts[top] ?? 0) + 1
          total++
        }
        if (depth < 8) await walk(doc.name, depth + 1)
      }
      pageToken = r.nextPageToken
    } while (pageToken)
  }
}

await walk(ROOT, 0)
gz.end()
await done

for (const [c, n] of Object.entries(counts).sort()) console.log(`${c.padEnd(28)} ${n}`)
console.log(`firestore: ${total} documents → ${out}`)
if (total === 0) { console.error('::error::firestore export is empty'); process.exit(1) }
