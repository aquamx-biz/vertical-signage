import { useFormValue } from 'sanity'
import { Text }         from '@sanity/ui'

export function AccountingDateInput(_props: any) {
  const docType         = useFormValue(['_type'])           as string | undefined
  const paymentDate     = useFormValue(['paymentDate'])     as string | undefined
  const issueDate       = useFormValue(['issueDate'])       as string | undefined
  const fundingDate     = useFormValue(['date'])            as string | undefined
  const orderPlacedDate = useFormValue(['orderPlacedDate']) as string | undefined

  const txnDate =
    docType === 'payment'      ? paymentDate     :
    docType === 'invoiceReceipt'      ? issueDate       :
    docType === 'funding'      ? fundingDate     :
    docType === 'journalEntry' ? fundingDate     :
    docType === 'procurement'  ? orderPlacedDate :
    undefined

  const hint =
    docType === 'procurement' ? '(set 2.1 · Order Placed Date in Ordering first)' :
    '(set transaction date in Setup first)'

  return (
    <Text size={1} muted={!txnDate}>
      {txnDate ?? hint}
    </Text>
  )
}
