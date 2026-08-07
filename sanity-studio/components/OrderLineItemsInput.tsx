/**
 * OrderLineItemsInput
 *
 * Wraps the default array editor for Order.lines and adds a
 * "Pre-fill from Revenue Config" button.
 *
 * On click:
 *  1. Reads the Order's own processSetup reference (no contract needed — an ad
 *     placement or a brokerage fee has no Rent Space contract behind it)
 *  2. Reads receiptCharges[] (active entries only)
 *  3. Copies each charge as a snapshot into lines[] on the draft document
 *
 * Same one-way snapshot rule as ReceiptLineItemsInput: later edits to the
 * Process Setup catalogue never rewrite an order that already exists.
 * sourceChargeKey preserves traceability back to the catalogue entry.
 */

import { useState, useCallback }   from 'react'
import { useClient, useFormValue } from 'sanity'
import type { ArrayOfObjectsInputProps } from 'sanity'
import { Stack, Card, Flex, Text, Button, Spinner } from '@sanity/ui'

interface ReceiptCharge {
  _key:            string
  label_en:        string
  label_th?:       string
  accountCode?:    { _ref: string; _type: string }
  defaultAmount?:  number
  defaultVatType?: string
  isActive?:       boolean
}

function newKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function OrderLineItemsInput(props: ArrayOfObjectsInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const rawId   = useFormValue(['_id']) as string | undefined
  const draftId = rawId
    ? (rawId.startsWith('drafts.') ? rawId : `drafts.${rawId}`)
    : undefined

  const processSetupRef = useFormValue(['processSetup', '_ref']) as string | undefined

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [copied,  setCopied]  = useState(false)

  const handlePrefill = useCallback(async () => {
    if (!processSetupRef || !draftId) return
    setLoading(true)
    setError(null)
    setCopied(false)

    try {
      // Draft first, then published — the catalogue is often still being edited
      const result = await client.fetch<{ receiptCharges?: ReceiptCharge[] } | null>(
        `coalesce(
          *[_id == $draftId][0],
          *[_id == $id][0]
        ){
          receiptCharges[]{ _key, label_en, label_th, accountCode, defaultAmount, defaultVatType, isActive }
        }`,
        { id: processSetupRef, draftId: `drafts.${processSetupRef}` },
      )

      const charges = (result?.receiptCharges ?? []).filter(c => c.isActive !== false)

      if (charges.length === 0) {
        setError(
          'No active charges on this Process Setup. Open it, tick "Use for Order", ' +
          'then add entries under the Revenue Config tab.',
        )
        return
      }

      const lines = charges.map(charge => ({
        _type:           'orderLine',
        _key:            newKey(),
        sourceChargeKey: charge._key,
        description_en:  charge.label_en,
        description_th:  charge.label_th ?? '',
        accountCode:     charge.accountCode
          ? { _type: 'reference', _ref: charge.accountCode._ref, _weak: true }
          : undefined,
        quantity:        1,
        // A success-fee charge legitimately has no price yet — leave it blank
        // rather than writing a fake 0 that reads like "free".
        unitPrice:       charge.defaultAmount,
        vatType:         charge.defaultVatType ?? 'exclusive',
        lineTotal:       charge.defaultAmount,
      }))

      await client.patch(draftId).set({ lines }).commit()
      setCopied(true)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load the charge catalogue.')
    } finally {
      setLoading(false)
    }
  }, [client, draftId, processSetupRef])

  return (
    <Stack space={3}>

      {processSetupRef ? (
        <Flex align="center" gap={2}>
          {loading ? (
            <>
              <Spinner muted />
              <Text size={1} muted>Loading charge catalogue…</Text>
            </>
          ) : (
            <Button
              text={copied ? '✓ Pre-filled — edit below if needed' : '📋 Pre-fill from Revenue Config'}
              mode="ghost"
              tone={copied ? 'positive' : 'primary'}
              onClick={handlePrefill}
              disabled={loading || !draftId}
            />
          )}
        </Flex>
      ) : (
        <Card padding={2} radius={2} tone="caution" border>
          <Text size={1}>Pick a Revenue Stream in 1.5 to enable pre-fill from its charge catalogue.</Text>
        </Card>
      )}

      {error && (
        <Card padding={2} radius={2} tone="critical" border>
          <Text size={1}>{error}</Text>
        </Card>
      )}

      {props.renderDefault(props)}

    </Stack>
  )
}
