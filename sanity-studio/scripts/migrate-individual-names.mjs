/**
 * migrate-individual-names.mjs
 *
 * Migrates individual Party documents from firstName+lastName → nameTh.
 * - Sets `nameTh` = trimmed concatenation of firstName + lastName
 * - Also refreshes `vendorName` cache on any Payment that references this party
 *
 * Run once after deploying the party.ts schema change.
 * Safe to re-run — uses setIfMissing so it won't overwrite a nameTh already set.
 */

import { createClient } from '@sanity/client'

const token = process.env.SANITY_WRITE_TOKEN
if (!token) throw new Error('SANITY_WRITE_TOKEN is not set. Export it or add it to .env.local')

const client = createClient({
  projectId:  'awjj9g8u',
  dataset:    'production',
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

// 1. Fetch all individual party documents that still have firstName but no nameTh
const individuals = await client.fetch(
  `*[_type == "party" && identityType == "individual" && defined(firstName) && !defined(nameTh)]
   { _id, firstName, lastName }`
)

console.log(`Found ${individuals.length} individual party doc(s) to migrate`)

for (const p of individuals) {
  const nameTh = [p.firstName?.trim(), p.lastName?.trim()].filter(Boolean).join(' ')
  if (!nameTh) {
    console.log(`  SKIP ${p._id} — no usable name`)
    continue
  }

  await client.patch(p._id).set({ nameTh }).commit()
  console.log(`  ✓ ${p._id}  →  nameTh: "${nameTh}"`)
}

// 2. Refresh vendorName cache on payments referencing these parties
if (individuals.length === 0) {
  console.log('No payments to refresh.')
  process.exit(0)
}

const partyIds = individuals.map(p => p._id)

const payments = await client.fetch(
  `*[_type == "payment" && vendor._ref in $ids]{ _id, vendor }`,
  { ids: partyIds }
)

console.log(`\nRefreshing vendorName on ${payments.length} payment(s)…`)

for (const pay of payments) {
  const partyId = pay.vendor?._ref
  const party   = individuals.find(p => p._id === partyId)
  if (!party) continue

  const nameTh = [party.firstName?.trim(), party.lastName?.trim()].filter(Boolean).join(' ')
  if (!nameTh) continue

  // Use draft-first patch so the update appears immediately in Studio
  const draftId = `drafts.${pay._id}`
  const exists  = await client.fetch(`*[_id == $id][0]._id`, { id: draftId })

  const targetId = exists ? draftId : pay._id
  await client.patch(targetId).set({ vendorName: nameTh }).commit()
  console.log(`  ✓ payment ${pay._id}  →  vendorName: "${nameTh}"`)
}

console.log('\nDone.')
