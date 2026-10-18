// Push a plain-text alert to the "aquamx notify" LINE group.
//
//   node tools/backup/notify-line.mjs "message"
//
// Same sources the handoff uses (lib/line.ts, lib/team-groups.ts), so no LINE
// secret has to be copied into this repo:
//   token  env LINE_CHANNEL_ACCESS_TOKEN, else Firestore config/line.lineToken
//          (read with FIREBASE_SERVICE_ACCOUNT_JSON)
//   group  Sanity line-keywords.teamGroups[key=="notify"].groupId
//          (read with SANITY_BACKUP_TOKEN), else env LINE_GROUP_ID, else the
//          code default handoff's lib/team-groups.ts uses (keep the two equal)
// Never exits non-zero: an alert that fails must not mask the failure it reports.

import { serviceAccountFromEnv, accessToken } from './google-auth.mjs'

const text = process.argv.slice(2).join(' ').trim() || 'aquamx backup: (no message)'

async function lineToken() {
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) return process.env.LINE_CHANNEL_ACCESS_TOKEN.trim().replace(/^"|"$/g, '')
  const sa = serviceAccountFromEnv('FIREBASE_SERVICE_ACCOUNT_JSON')
  const tok = await accessToken(sa, ['https://www.googleapis.com/auth/datastore'])
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/config/line`,
    { headers: { Authorization: `Bearer ${tok}` } })
  if (!res.ok) throw new Error(`config/line → ${res.status}`)
  return (await res.json()).fields?.lineToken?.stringValue
}

async function notifyGroup() {
  const q = encodeURIComponent('*[_id == "line-keywords"][0].teamGroups[key == "notify"][0].groupId')
  const res = await fetch(`https://awjj9g8u.api.sanity.io/v2024-01-01/data/query/production?query=${q}`,
    { headers: process.env.SANITY_BACKUP_TOKEN ? { Authorization: `Bearer ${process.env.SANITY_BACKUP_TOKEN}` } : {} })
  const id = res.ok ? (await res.json()).result : null
  return id || process.env.LINE_GROUP_ID || 'C8589858156ac06d913bf758002dcf2c3'   // "aquamx notify"
}

try {
  const [token, to] = await Promise.all([lineToken(), notifyGroup()])
  if (!token || !to) throw new Error(`missing ${!token ? 'LINE token' : 'notify group id'}`)
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  })
  if (!res.ok) throw new Error(`LINE push ${res.status}: ${(await res.text()).slice(0, 200)}`)
  console.log('LINE alert sent')
} catch (err) {
  console.log(`::warning::LINE alert not sent — ${err.message}`)
}
