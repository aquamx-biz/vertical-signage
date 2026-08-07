/**
 * seedRevenueConfig — fills the charge catalogue that Order and Receipt read.
 *
 * Prices are NOT invented: they come from the live Rate Card SME document,
 * row `row_price`, whose `sub` value is the monthly billed amount per kiosk
 * (the `big` value, ฿55/฿90/฿128/฿160, is the per-week framing shown to
 * customers). Change a price here and you have changed only what a new order
 * starts with — orders already raised keep their own snapshot.
 *
 * VAT is 'none' on every charge: AquaMX is not VAT-registered as of
 * 2026-08-08. See the VAT note in schemas/order.ts before changing that.
 *
 * Dry run by default — prints the mutations and sends nothing:
 *   npx tsx scripts/seedRevenueConfig.ts
 * Apply for real:
 *   npx tsx scripts/seedRevenueConfig.ts --apply
 *
 * Safe to re-run: the Advertising Deal patch is a set() of the whole
 * catalogue, and Property Brokerage is createIfNotExists on a fixed _id.
 */

import { readFileSync } from 'node:fs'
import { join }         from 'node:path'

const PROJECT = 'awjj9g8u'
const DATASET = 'production'
const API     = '2024-01-01'

// Resolved from production, not guessed.
const GL_ADVERTISING = 'rxxWf9x75mxHsS6RdP94vj'   // 410100 รายได้ค่าโฆษณา
const GL_COMMISSION  = 'rxxWf9x75mxHsS6RdP6p8J'   // 411000 รายได้ค่านายหน้า
const ADVERTISING_DEAL = '66a27552-33a3-4dc0-9fae-8a32c123a135'
const BROKERAGE_ID     = 'processSetup-property-brokerage'

const ref = (id: string) => ({ _type: 'reference', _ref: id, _weak: true })

const charge = (key: string, en: string, th: string, amount: number | undefined, gl: string) => ({
  _type: 'receiptCharge',
  _key:  key,
  label_en:       en,
  label_th:       th,
  accountCode:    ref(gl),
  defaultAmount:  amount,
  defaultVatType: 'none',
  isActive:       true,
})

const mutations = [
  {
    patch: {
      id: ADVERTISING_DEAL,
      set: {
        useForOrder:         true,
        useForReceipt:       true,
        defaultBillingModel: 'recurring',
        receiptCharges: [
          charge('starter',  'Kiosk placement — Starter',  'ค่าลงจอ Starter',  220, GL_ADVERTISING),
          charge('booster',  'Kiosk placement — Booster',  'ค่าลงจอ Booster',  360, GL_ADVERTISING),
          charge('pro',      'Kiosk placement — Pro',      'ค่าลงจอ Pro',      510, GL_ADVERTISING),
          charge('premium',  'Kiosk placement — Premium',  'ค่าลงจอ Premium',  640, GL_ADVERTISING),
        ],
      },
    },
  },
  {
    createIfNotExists: {
      _id:   BROKERAGE_ID,
      _type: 'contractType',
      name:  'Property Brokerage',
      description: 'Listing a property is free — revenue is a share of the brokerage commission, known only when the deal closes.',
      isActive:    true,
      useForOrder: true,
      defaultBillingModel: 'success_fee',
      receiptCharges: [
        // No default amount on purpose: the fee is a share of a commission
        // that does not exist until closing. A 0 here would read as "free".
        charge('brokerage', 'Brokerage fee share', 'ส่วนแบ่งค่านายหน้า', undefined, GL_COMMISSION),
      ],
    },
  },
]

function token(): string {
  const envPath = join(__dirname, '..', '..', '..', 'aquamx-handoff', '.env.local')
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find(l => l.startsWith('SANITY_WRITE_TOKEN='))
  const t = line?.slice('SANITY_WRITE_TOKEN='.length).trim()
  if (!t) throw new Error(`SANITY_WRITE_TOKEN not found in ${envPath}`)
  return t
}

async function main() {
  const apply = process.argv.includes('--apply')

  console.log(JSON.stringify({ mutations }, null, 2))
  console.log('')

  if (!apply) {
    console.log('DRY RUN — nothing sent. Re-run with --apply to write to production.')
    return
  }

  const res = await fetch(
    `https://${PROJECT}.api.sanity.io/v${API}/data/mutate/${DATASET}?returnIds=true`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mutations }),
    },
  )
  const body = await res.text()
  if (!res.ok) throw new Error(`Sanity mutate failed ${res.status}: ${body}`)
  console.log('APPLIED:', body)
}

main().catch(err => { console.error(err); process.exit(1) })
