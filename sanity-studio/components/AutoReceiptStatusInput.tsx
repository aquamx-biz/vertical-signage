import { useEffect }             from 'react'
import { Card, Text }            from '@sanity/ui'
import { set }                   from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue }          from 'sanity'

function deriveStatus(doc: {
  receiptNumber?:    string
  invoiceNumber?:    string
  voidedAt?:         string
  accountingEntry?:  { glStatus?: string }
}): string {
  if (doc.voidedAt)                                              return 'voided'
  if (doc.receiptNumber && doc.accountingEntry?.glStatus === 'posted') return 'posted'
  if (doc.receiptNumber)                                         return 'issued'
  if (doc.invoiceNumber)                                         return 'invoiced'
  return 'draft'
}

const STATUS_LABELS: Record<string, string> = {
  draft:    '📝 Draft',
  invoiced: '🧾 Invoiced — awaiting payment',
  issued:   '✅ Issued',
  posted: '📒 Posted',
  voided: '🚫 Voided',
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  draft:  'Receipt not yet issued. Assign a receipt number (section 1.1) to issue it.',
  invoiced: 'Invoice sent, payment not yet received. The receipt number is assigned when the payment is recorded (LINE: 💰 รับชำระ).',
  issued: 'Receipt number assigned and document is ready. Go to Accounting section and post the journal entry to finalize.',
  posted: 'Journal entry posted to the general ledger. This receipt is fully recorded.',
  voided: 'Receipt has been cancelled. Set Voided At to record the cancellation date.',
}

const STATUS_TONE: Record<string, 'default' | 'caution' | 'positive' | 'critical'> = {
  draft:    'default',
  invoiced: 'caution',
  issued:   'caution',
  posted: 'positive',
  voided: 'critical',
}

export function AutoReceiptStatusInput(props: StringInputProps) {
  const doc    = useFormValue([]) as any
  const status = deriveStatus(doc)

  useEffect(() => {
    if (props.value === status || props.readOnly) return
    try { props.onChange(set(status)) } catch { /* locked */ }
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card padding={3} radius={2} tone={STATUS_TONE[status] ?? 'default'} border>
      <Text size={2} weight="semibold">{STATUS_LABELS[status] ?? status}</Text>
      <Text size={1} muted style={{ marginTop: 6 }}>
        {STATUS_DESCRIPTIONS[status] ?? ''}
      </Text>
    </Card>
  )
}
