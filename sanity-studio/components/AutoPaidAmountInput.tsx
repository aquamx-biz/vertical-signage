/**
 * AutoPaidAmountInput
 *
 * Root payment  → auto-fills with paymentAmount (pay in full by default).
 * Installment   → calculates remaining balance (obligation − all prior
 *                 installments' paidAmounts) and auto-fills with that.
 *
 * Only fills when the field is currently empty. User can always override.
 */

import { useEffect, useState }   from 'react'
import { set }                    from 'sanity'
import { useFormValue, useClient } from 'sanity'
import type { NumberInputProps }  from 'sanity'
import { Stack, Text, Flex, Spinner, Badge } from '@sanity/ui'

export function AutoPaidAmountInput(props: NumberInputProps) {
  const client        = useClient({ apiVersion: '2024-01-01' })
  const paymentAmount = useFormValue(['paymentAmount']) as number | undefined
  const parentRef     = useFormValue(['parentPayment'])  as { _ref?: string } | undefined
  const docId         = useFormValue(['_id'])            as string | undefined

  const [loading,   setLoading]   = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)

  const currentId = docId?.replace(/^drafts\./, '')
  const rootId    = parentRef?._ref

  useEffect(() => {
    if (props.readOnly) return

    // ── Root payment: auto-fill with full obligation ───────────────────────
    if (!rootId) {
      setRemaining(null)
      if (props.value == null && paymentAmount != null) {
        props.onChange(set(paymentAmount))
      }
      return
    }

    // ── Installment: calculate remaining balance ───────────────────────────
    if (!paymentAmount) return
    setLoading(true)

    client
      .fetch<Array<{ paidAmount?: number }>>(
        // Fetch root + all published installments, excluding this draft
        `*[_type == "payment" &&
          (_id == $rootId || parentPayment._ref == $rootId) &&
          !(_id in path("drafts.**")) &&
          _id != $currentId
        ]{ paidAmount }`,
        { rootId, currentId: currentId ?? '' },
      )
      .then(siblings => {
        const paidByOthers = (siblings ?? []).reduce((s, e) => s + (e.paidAmount ?? 0), 0)
        const balance      = Math.max(0, paymentAmount - paidByOthers)
        setRemaining(balance)
        // Fill when empty, OR when the old logic set it to the full obligation
        // (props.value === paymentAmount means it was auto-filled incorrectly before)
        if (props.value == null || props.value === paymentAmount) {
          props.onChange(set(balance))
        }
      })
      .catch(() => setRemaining(null))
      .finally(() => setLoading(false))
  }, [rootId, paymentAmount, currentId, props.readOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="payment-base-amount-input">
    <Stack space={2}>
      {props.renderDefault(props)}

      {loading && (
        <Flex align="center" gap={2}>
          <Spinner muted />
          <Text size={1} muted>Calculating remaining balance…</Text>
        </Flex>
      )}

      {!loading && rootId && remaining != null && (
        <Flex align="center" gap={2}>
          <Badge tone="primary" mode="outline" fontSize={0}>Remaining</Badge>
          <Text size={0} muted>
            {Number(remaining).toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB left on this series. Edit to pay a different amount.
          </Text>
        </Flex>
      )}

      {!loading && !rootId && paymentAmount != null && (
        <Text size={0} muted>
          Auto-filled from Total Obligation ({Number(paymentAmount).toLocaleString()}). Edit to override for partial payments.
        </Text>
      )}
    </Stack>
    </div>
  )
}
