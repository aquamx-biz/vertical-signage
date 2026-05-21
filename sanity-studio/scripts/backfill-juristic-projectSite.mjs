#!/usr/bin/env node
/**
 * backfill-juristic-projectSite.mjs
 *
 * One-off migration: set the `projectSite` reference on the 5 existing
 * juristic-office providers. The field was added to provider.ts in commit
 * d330304 to enable AI Notice Reader → provider scoping.
 *
 * Mapping: provider name fragment → kiosk project code. Verified manually
 * against names_th/en pulled from Sanity on 2026-05-21.
 *
 *   Noble B19          → noble-be19
 *   Noble Geo          → noble-geo
 *   Lumpini 24         → lumpini-24
 *   The Room Sukhumvit → the-room-skv21
 *   Mahogany Tower     → mahogany-tower
 *
 * The script:
 *   1. Looks up each provider by name match (TH or EN)
 *   2. Resolves the target projectSite via project.code.current → project.projectSite._ref
 *   3. Patches each provider with { projectSite: { _ref: <id> } }
 *
 * Idempotent — providers that already have a matching projectSite are skipped.
 * Patches both draft and published versions if both exist (keeps them in sync).
 *
 * Usage from vertical-signage/ root:
 *   node sanity-studio/scripts/backfill-juristic-projectSite.mjs           # dry-run
 *   node sanity-studio/scripts/backfill-juristic-projectSite.mjs --apply   # write
 *
 * Requires SANITY_TOKEN in vertical-signage/.env (same token as build.mjs).
 */

import fs from 'fs'

const PROJECT_ID  = 'awjj9g8u'
const DATASET     = 'production'
const API_VERSION = '2024-01-01'

// Provider name fragment → kiosk project code. Matches against name_th OR name_en.
const MAPPING = [
  { match: 'Noble B19',          projectCode: 'noble-be19'     },
  { match: 'Noble Geo',          projectCode: 'noble-geo'      },
  { match: 'Lumpini 24',         projectCode: 'lumpini-24'     },
  { match: 'The Room Sukhumvit', projectCode: 'the-room-skv21' },
  { match: 'Mahogany Tower',     projectCode: 'mahogany-tower' },
]

const env = fs.readFileSync('.env', 'utf8')
const tokenMatch = env.match(/SANITY_TOKEN\s*=\s*(.+)/)
if (!tokenMatch) {
  console.error('ERROR: No SANITY_TOKEN found in .env (run from vertical-signage/ root)')
  process.exit(1)
}
const TOKEN = tokenMatch[1].trim().replace(/^["']|["']$/g, '')

const APPLY = process.argv.includes('--apply')

async function sanityFetch(query) {
  const url = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`Sanity fetch ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}

async function sanityMutate(mutations) {
  const url = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/mutate/${DATASET}`
  const r = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body:    JSON.stringify({ mutations }),
  })
  if (!r.ok) throw new Error(`Sanity mutate ${r.status}: ${await r.text()}`)
  return await r.json()
}

console.log(APPLY ? '🛠  APPLY mode — will write patches' : '🔍 DRY-RUN — no writes (pass --apply to commit)')
console.log('')

const plan = []

for (const { match, projectCode } of MAPPING) {
  // Find the projectSite via the project's projectSite._ref
  const projectSiteId = await sanityFetch(
    `*[_type == "project" && code.current == "${projectCode}"][0].projectSite._ref`
  )
  if (!projectSiteId) {
    console.warn(`⚠  No projectSite found for project code "${projectCode}" — skipping`)
    continue
  }

  // Find every juristic provider matching the name fragment (catches draft + published)
  const providers = await sanityFetch(
    `*[_type == "provider" && providerType == "juristicOffice" && (name_th match "*${match}*" || name_en match "*${match}*")]{ _id, name_en, name_th, projectSite }`
  )
  if (providers.length === 0) {
    console.warn(`⚠  No juristic provider found for name match "${match}" — skipping`)
    continue
  }

  for (const prov of providers) {
    let status
    if (prov.projectSite?._ref === projectSiteId) {
      status = '✓ already set     '
    } else if (prov.projectSite?._ref) {
      status = '⚠ ref differs (would overwrite)'
    } else {
      status = '→ will set         '
    }
    plan.push({ providerId: prov._id, projectSiteId, status, name: prov.name_en ?? prov.name_th ?? '' })
    console.log(`  ${status}  ${prov._id}  →  projectSite=${projectSiteId}  (${prov.name_en ?? prov.name_th})`)
  }
}

console.log('')
const toWrite = plan.filter(p => p.status.startsWith('→') || p.status.startsWith('⚠ ref differs'))

if (!APPLY) {
  console.log(`Would write ${toWrite.length} patch(es). Re-run with --apply to commit.`)
  process.exit(0)
}

if (toWrite.length === 0) {
  console.log('Nothing to write — all providers already have correct projectSite ref.')
  process.exit(0)
}

const mutations = toWrite.map(p => ({
  patch: {
    id:  p.providerId,
    set: { projectSite: { _type: 'reference', _ref: p.projectSiteId } },
  },
}))

console.log(`Writing ${mutations.length} patch(es)…`)
const result = await sanityMutate(mutations)
console.log(`✅ Done. transactionId: ${result.transactionId}`)
