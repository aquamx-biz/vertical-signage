// Service-account → OAuth access token, no dependencies (node:crypto signs the JWT).
// Shared by backup-firestore.mjs (datastore scope) and upload-drive.mjs (drive scope).

import { createSign } from 'node:crypto'

const b64url = s => Buffer.from(s).toString('base64url')

/** Parse a service-account JSON from an env var, with a readable error instead of a stack. */
export function serviceAccountFromEnv(name) {
  const raw = process.env[name]
  if (!raw) throw new Error(`${name} is empty — add it as a repo secret`)
  try {
    const sa = JSON.parse(raw)
    if (!sa.client_email || !sa.private_key) throw new Error('missing client_email / private_key')
    return sa
  } catch (err) {
    throw new Error(`${name} is not a service-account JSON (${err.message})`)
  }
}

export async function accessToken(sa, scopes) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${sig}`,
    }),
  })
  if (!res.ok) throw new Error(`token exchange for ${sa.client_email} failed ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()).access_token
}
