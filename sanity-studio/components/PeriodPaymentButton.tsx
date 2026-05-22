/**
 * PeriodPaymentButton
 *
 * Shown inside a billingPeriod array item on Rent Space.
 * Creates a Payment document (mode: rent_payment) for the period,
 * patches the array item's linkedPayment + accrualStatus via array key,
 * then navigates to the new payment.
 */

import { useState }               from 'react'
import { useFormValue, useClient } from 'sanity'
import { Button, Text, Stack, Card } from '@sanity/ui'
import type { SanityClient } from '@sanity/client'

async function ensureDraft(client: SanityClient, dId: string) {
  const contractId = dId.replace(/^drafts\./, '')
  const base = await client.fetch(
    `coalesce(*[_id == $dId][0], *[_id == $id][0])`,
    { dId, id: contractId },
  )
  if (base && base._id !== dId) {
    await client.createIfNotExists({ ...base, _id: dId })
  }
}

const PAYMENT_NAV = (id: string) => `/structure/finance;payment;${id}%2Cview%3Dedit`

export function PeriodPaymentButton(props: any) {
  const client     = useClient({ apiVersion: '2024-01-01' })
  const rawDocId   = useFormValue(['_id'])            as string | undefined
  const partyRef   = useFormValue(['party'])          as { _ref?: string } | undefined
  const allPeriods = useFormValue(['billingPeriods']) as any[] | undefined

  // Identify which array item this component belongs to via path
  // props.path = ['billingPeriods', {_key: 'xxx'}, 'createPayment']
  const itemKey = (props.path?.[1] as any)?._key as string | undefined
  const item    = allPeriods?.find((p: any) => p._key === itemKey)

  const rentalAmount    = item?.rentalAmount    as number | undefined
  const meterStart      = item?.meterStart      as number | undefined
  const meterEnd        = item?.meterEnd        as number | undefined
  const electricityRate = item?.electricityRate as number | undefined
  const periodStart     = item?.periodStart     as string | undefined
  const periodEnd       = item?.periodEnd       as string | undefined

  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const contractId = rawDocId?.replace(/^drafts\./, '')

  const unitsUsed  = (meterEnd != null && meterStart != null) ? Math.max(0, meterEnd - meterStart) : 0
  const elecCost   = unitsUsed * (electricityRate ?? 0)
  const total      = (rentalAmount ?? 0) + elecCost

  const handleCreate = async () => {
    if (!contractId || !rentalAmount) {
      setError('Enter Rental Amount (field 3) before recording a payment.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const periodDesc = [periodStart, periodEnd].filter(Boolean).join(' – ')

      const paymentDoc: Record<string, any> = {
        _type:             'payment',
        paymentMode:       'rent_payment',
        paymentStatus:     'created',
        paymentAmount:     total || rentalAmount,
        currency:          'THB',
        linkedRentContract: { _type: 'reference', _ref: contractId },
      }
      if (partyRef?._ref) {
        paymentDoc.vendor = { _type: 'reference', _ref: partyRef._ref }
      }

      const created = await client.create(paymentDoc)

      // Patch the specific array item by key
      if (itemKey) {
        const draftId = contractId.startsWith('drafts.') ? contractId : `drafts.${contractId}`
        await ensureDraft(client, draftId)
        await client
          .patch(draftId)
          .set({
            [`billingPeriods[_key == "${itemKey}"].linkedPayment`]: { _type: 'reference', _ref: created._id },
            [`billingPeriods[_key == "${itemKey}"].accrualStatus`]: 'invoiced',
          })
          .commit({ autoGenerateArrayKeys: true })
          .catch(() => {})
      }

      window.location.href = PAYMENT_NAV(created._id)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to record rent payment.')
      setCreating(false)
    }
  }

  return (
    <Stack space={2}>
      {!rentalAmount && (
        <Card padding={3} radius={2} border tone="caution">
          <Text size={1} muted>Enter Rental Amount (field 3) to enable payment recording.</Text>
        </Card>
      )}
      <Button
        text={creating ? 'Recording payment…' : '💸 Record Rent Payment'}
        tone="primary"
        disabled={creating || !rentalAmount || !contractId}
        onClick={handleCreate}
      />
      {error && (
        <Text size={0} style={{ color: 'var(--card-critical-fg-color)' }}>{error}</Text>
      )}
    </Stack>
  )
}
