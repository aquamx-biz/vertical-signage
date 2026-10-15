/**
 * AccountingEntryInput
 *
 * Rendered on `accountingEntry.entrySummary` inside Payment, Receipt, Funding,
 * and Procurement.
 *
 * Payment  → DR accountCode (1.9 GL Account) / CR bankAccount (2.4 Bank Used)
 *            + DR Purchase VAT line (code 145001) if vatType === 'exclusive'
 *            + CR WHT Payable line if whtAmount > 0:
 *              - vendor is individual → code 14200 (PND 3)
 *              - vendor is corporate  → code 14300 (PND 53)
 * Receipt  → CR revenue lines (from lineItems[].accountCode) + CR Output VAT
 *            DR bank/cash (net received = totalAmount − whtAmount)
 *            + DR WHT Receivable (asset) if whtAmount > 0
 *              fixed to code 1113100 (stored as "113100")
 * Funding  → inflow:  DR bankAccount / CR accountCode (liability/equity)
 *            outflow: DR accountCode / CR bankAccount
 * Procurement → DR accountCode (asset/expense) / CR accounts payable (user sets)
 *
 * Auto-populate: fires automatically when lines are empty + required fields
 * present + special account codes resolved from DB.  User reviews, then Posts.
 */

import { useState, useEffect, useRef } from 'react'
import { useClient, useFormValue }      from 'sanity'
import { useRouter }                    from 'sanity/router'
import { Card, Stack, Flex, Text, Box, Button, Badge, useToast } from '@sanity/ui'
import type { StringInputProps } from 'sanity'

interface Line {
  _key?:        string
  accountCode?: { _ref?: string; _type?: string }
  description?: string
  debitAmount?: number
  creditAmount?: number
}
interface LineItem {
  accountCode?:    { _ref?: string }
  description_en?: string
  description_th?: string
  quantity?:       number
  unitPrice?:      number
  lineTotal?:      number
}

const genKey = () => Math.random().toString(36).slice(2, 10)
const fmt    = (n: number) =>
  Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mkRef  = (ref: string | undefined) =>
  ref ? { _type: 'reference' as const, _ref: ref } : undefined

export function AccountingEntryInput(_props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const router = useRouter()
  const toast  = useToast()

  // ── Document-level fields ─────────────────────────────────────────────────
  const rawId     = useFormValue(['_id'])   as string | undefined
  const docType   = useFormValue(['_type']) as string | undefined
  const glStatus  = useFormValue(['accountingEntry', 'glStatus'])  as string | undefined
  const entryDate = useFormValue(['accountingEntry', 'entryDate']) as string | undefined
  const lines     = useFormValue(['accountingEntry', 'lines'])     as Line[] | undefined

  // ── Payment (sections 1 + 2) ──────────────────────────────────────────────
  const vendorRef     = useFormValue(['vendor'])       as { _ref?: string } | undefined  // party ref
  const payGlRef      = useFormValue(['accountCode'])  as { _ref?: string } | undefined  // 1.9 GL Account
  const payBankRef    = useFormValue(['bankAccount'])  as { _ref?: string } | undefined  // Payment 2.4 · Bank Used / Receipt 2.9 · Bank Account Received Into
  const paidAmount    = useFormValue(['paidAmount'])   as number | undefined              // 2.6 Gross Amount
  const paymentNumber = useFormValue(['paymentNumber']) as string | undefined
  const paymentDate   = useFormValue(['paymentDate'])  as string | undefined
  const whtAmount     = useFormValue(['whtAmount'])    as number | undefined              // 2.7 WHT
  const vatType       = useFormValue(['vatType'])      as string | undefined              // 1.12
  const vatAmount     = useFormValue(['vatAmount'])    as number | undefined              // 1.13
  const vatClaimableRaw     = useFormValue(['vatClaimable'])
  const vatClaimable        = vatClaimableRaw === true                                    // null/false/undefined → false
  const paymentMode         = useFormValue(['paymentMode'])         as string | undefined
  const paymentType         = useFormValue(['paymentType'])         as string | undefined
  const vendorName          = useFormValue(['vendorName'])          as string | undefined
  const expenseCategoryName = useFormValue(['expenseCategoryName']) as string | undefined
  const expenseDescription  = useFormValue(['expenseDescription'])  as string | undefined
  const whtRate             = useFormValue(['withholdingTaxRate'])  as string | undefined
  const procurements        = useFormValue(['procurements'])        as Array<{ _ref?: string }> | undefined
  const firstProcRef        = procurements?.[0]?._ref

  // ── Receipt ───────────────────────────────────────────────────────────────
  const lineItems     = useFormValue(['lineItems'])      as LineItem[] | undefined
  const totalAmount   = useFormValue(['totalAmount'])    as number | undefined
  const rcptVat       = useFormValue(['vatAmount'])      as number | undefined
  const receiptNumber = useFormValue(['receiptNumber'])  as string | undefined
  const issueDate     = useFormValue(['issueDate'])      as string | undefined

  // ── Funding ───────────────────────────────────────────────────────────────
  const fundGlRef     = useFormValue(['accountCode'])    as { _ref?: string } | undefined
  const fundBankRef   = useFormValue(['bankAccount'])    as { _ref?: string } | undefined
  const fundAmount    = useFormValue(['amount'])         as number | undefined
  const direction     = useFormValue(['direction'])      as string | undefined
  const fundingNumber = useFormValue(['fundingNumber'])  as string | undefined
  const fundingDate   = useFormValue(['date'])           as string | undefined

  // ── Procurement ───────────────────────────────────────────────────────────
  const procGlRef       = useFormValue(['accountCode'])         as { _ref?: string } | undefined
  const procAmount      = useFormValue(['invoiceAmount'])        as number | undefined
  const procApRef       = useFormValue(['apAccount'])            as { _ref?: string } | undefined
  const poNumber        = useFormValue(['purchaseOrderNumber'])  as string | undefined
  const orderPlacedDate = useFormValue(['orderPlacedDate'])      as string | undefined

  // ── Derived amounts ───────────────────────────────────────────────────────
  const wht = whtAmount ?? 0
  const vat = vatType === 'exclusive' ? (vatAmount ?? 0) : 0

  // ── Special account lookup (WHT + Purchase VAT) ───────────────────────────
  // vendorIdentityType drives PND 3 vs PND 53 selection
  // undefined = not yet loaded; null = not found in DB; string = Sanity _id
  const [vendorIdentityType,    setVendorIdentityType]    = useState<string | undefined>()
  const [whtAccountId,         setWhtAccountId]         = useState<string | null | undefined>()
  const [vatAccountId,         setVatAccountId]         = useState<string | null | undefined>()
  const [rcptWhtAccountId,     setRcptWhtAccountId]     = useState<string | null | undefined>()
  const [procLinkedApRef,      setProcLinkedApRef]      = useState<string | null | undefined>()

  // Step 1: resolve vendor identityType
  useEffect(() => {
    const ref = vendorRef?._ref
    if (!ref) { setVendorIdentityType(undefined); return }
    client
      .fetch<{ identityType?: string }>(`*[_id == $id][0]{ identityType }`, { id: ref })
      .then(doc => setVendorIdentityType(doc?.identityType ?? 'corporate'))
      .catch(() => setVendorIdentityType('corporate'))
  }, [vendorRef?._ref, client]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: resolve WHT account (only when vendor type is known and WHT > 0)
  useEffect(() => {
    if (docType !== 'payment' || wht === 0) { setWhtAccountId(null); return }
    if (!vendorIdentityType)                { return }  // still loading vendor type
    const code = vendorIdentityType === 'individual' ? '214200' : '214300'
    setWhtAccountId(undefined)  // loading
    client
      .fetch<{ _id: string } | null>(`*[_type == "accountCode" && code == $code][0]{ _id }`, { code })
      .then(doc => setWhtAccountId(doc?._id ?? null))
      .catch(() => setWhtAccountId(null))
  }, [docType, wht, vendorIdentityType, client]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step 3: resolve Purchase VAT account (code 145001) — only when claimable
  useEffect(() => {
    if (docType !== 'payment' || vat === 0 || vatClaimable !== true) { setVatAccountId(null); return }
    setVatAccountId(undefined)  // loading
    client
      .fetch<{ _id: string } | null>(`*[_type == "accountCode" && code == "2145001"][0]{ _id }`, {})
      .then(doc => setVatAccountId(doc?._id ?? null))
      .catch(() => setVatAccountId(null))
  }, [docType, vat, vatClaimable, client]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step 4: resolve WHT Receivable account for receipts — code 1113100 (stored as "113100")
  useEffect(() => {
    if (docType !== 'invoiceReceipt' || wht === 0) { setRcptWhtAccountId(null); return }
    setRcptWhtAccountId(undefined)  // loading
    client
      .fetch<{ _id: string } | null>(
        `*[_type == "accountCode" && code == "113100"][0]{ _id }`,
        {}
      )
      .then(doc => setRcptWhtAccountId(doc?._id ?? null))
      .catch(() => setRcptWhtAccountId(null))
  }, [docType, wht, client]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step 5: resolve AP account from first linked procurement (payment mode = procurement)
  useEffect(() => {
    if (docType !== 'payment' || paymentMode !== 'procurement') { setProcLinkedApRef(null); return }
    if (!firstProcRef) { setProcLinkedApRef(null); return }
    setProcLinkedApRef(undefined)
    client
      .fetch<{ apAccount?: { _ref?: string } } | null>(
        `coalesce(
          *[_type == "procurement" && _id == ("drafts." + $id)][0],
          *[_type == "procurement" && _id == $id][0]
        ) { apAccount }`,
        { id: firstProcRef }
      )
      .then(doc => setProcLinkedApRef(doc?.apAccount?._ref ?? null))
      .catch(() => setProcLinkedApRef(null))
  }, [docType, paymentMode, firstProcRef, client]) // eslint-disable-line react-hooks/exhaustive-deps

  // Are all special accounts resolved? (null = not found is still "resolved" — we just leave blank)
  const specialAccountsReady =
    (docType !== 'payment' ||
      (
        (wht === 0 || whtAccountId !== undefined) &&
        (vat === 0 || vatClaimable !== true || vatAccountId !== undefined) &&
        (paymentMode !== 'procurement' || procLinkedApRef !== undefined)
      )
    ) &&
    (docType !== 'invoiceReceipt' || wht === 0 || rcptWhtAccountId !== undefined)

  // ── State ─────────────────────────────────────────────────────────────────
  const [accountNames, setAccountNames] = useState<Record<string, string>>({})
  const [saving,       setSaving]       = useState(false)
  const autoFiredRef       = useRef(false)
  const prevVatClaimableRef = useRef<boolean | undefined>()

  const draftId  = rawId?.startsWith('drafts.') ? rawId : `drafts.${rawId}`
  const isPosted = glStatus === 'posted'
  const isVoided = glStatus === 'voided'

  // ── Safe patch — creates draft from published doc if none exists yet ──────
  const safePatch = async (data: Record<string, any>) => {
    if (!draftId || !docType) return
    if (rawId?.startsWith('drafts.')) {
      await client.patch(draftId).set(data).commit()
      return
    }
    const published = await client.fetch<Record<string, any>>(
      `*[_id == $id][0]`, { id: rawId }
    )
    if (!published) return
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, _rev, _updatedAt, _createdAt, ...fields } = published
    await client.transaction()
      .createIfNotExists({ _id: draftId, _type: docType, ...fields })
      .patch(draftId, (p: any) => p.set(data))
      .commit()
  }

  // ── Auto-fill entryDate from transaction date ─────────────────────────────
  const txnDate =
    docType === 'payment'      ? paymentDate    :
    docType === 'invoiceReceipt'      ? issueDate      :
    docType === 'funding'      ? fundingDate    :
    docType === 'journalEntry' ? fundingDate    : // fundingDate reads ['date'], same field
    docType === 'procurement'  ? orderPlacedDate :
    undefined

  // entryDate is stored at post time (see handlePost) — no separate effect needed

  // ── Auto-refresh procurement lines when invoice amount / accounts change ─
  // The standard auto-populate only fires when lines are empty. For procurement,
  // all amounts are fully derived from invoiceAmount, so regenerate automatically
  // whenever the source fields change — even when lines already exist.
  useEffect(() => {
    if (docType !== 'procurement' || isPosted || isVoided || !draftId) return
    if ((lines ?? []).length === 0) return  // let main auto-populate handle the first fill
    const result = buildSuggested()
    if (!result) return
    safePatch({ 'accountingEntry.lines': result.lines }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procAmount, procApRef?._ref, procGlRef?._ref])

  // ── Auto-regenerate when vatClaimable is toggled ─────────────────────────
  useEffect(() => {
    if (docType !== 'payment' || isPosted || !draftId || !specialAccountsReady) return
    if (prevVatClaimableRef.current === undefined) {
      prevVatClaimableRef.current = vatClaimable  // record initial value, don't fire
      return
    }
    if (prevVatClaimableRef.current === vatClaimable) return  // no change
    prevVatClaimableRef.current = vatClaimable
    const result = buildSuggested()
    if (result) {
      const patch: Record<string, any> = { 'accountingEntry.lines': result.lines }
      safePatch(patch).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatClaimable])

  // ── Resolve display names for line account codes ──────────────────────────
  const lineRefs = (lines ?? []).map(l => l.accountCode?._ref).filter(Boolean) as string[]
  useEffect(() => {
    if (lineRefs.length === 0) { setAccountNames({}); return }
    client
      .fetch<{ _id: string; code: string; nameTh: string }[]>(
        `*[_id in $ids]{ _id, code, nameTh }`, { ids: lineRefs },
      )
      .then(docs => {
        const map: Record<string, string> = {}
        for (const d of docs) map[d._id] = `${d.code} · ${d.nameTh}`
        setAccountNames(map)
      })
      .catch(() => {})
  }, [lineRefs.join(','), client]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build suggested lines ─────────────────────────────────────────────────
  function buildSuggested(): { lines: Line[]; date?: string } | null {
    if (docType === 'payment') {
      const gross    = paidAmount ?? 0
      if (gross === 0) return null
      const netBank  = Math.round((gross + vat - wht) * 100) / 100
      const bankRef  = payBankRef?._ref
      const pndLabel = vendorIdentityType === 'individual' ? 'PND 3' : 'PND 53'
      const claimable = vatClaimable === true   // undefined or false = not claimable

      // Procurement payments clear the AP created by the procurement — DR AP, not DR Expense.
      // All other modes (direct expense, rent, etc.) book the expense at payment time — DR Expense.
      const isProcPayment = paymentMode === 'procurement'
      const expRef  = isProcPayment ? (procLinkedApRef ?? undefined) : payGlRef?._ref

      // DR Expense: absorb VAT into cost when not claimable (only relevant for non-procurement modes)
      const expenseAmt = (!isProcPayment && claimable) ? gross : Math.round((gross + vat) * 100) / 100

      // ── Description helpers ──────────────────────────────────────────────
      const modeLabel: Record<string, string> = {
        direct_expense:           'Direct Expense',
        rent_payment:             'Rent Payment',
        service_contract_payment: 'Service Fee',
        interest_payment:         'Interest Expense',
        installment:              'Installment Payment',
      }
      const payTypeLabel: Record<string, string> = {
        transfer: 'Bank Transfer', cheque: 'Cheque', cash: 'Cash Payment', swift: 'SWIFT Transfer',
      }
      const expLabel   = isProcPayment
        ? `Accounts Payable${!procLinkedApRef ? ' ⚠ set AP account on Procurement (3.4)' : ''}`
        : (modeLabel[paymentMode ?? ''] ?? 'Payment')
      const vendorPart = paymentMode === 'direct_expense'
        ? (expenseCategoryName || expenseDescription || vendorName)
        : vendorName
      const expDesc    = [expLabel, vendorPart, paymentNumber].filter(Boolean).join(' · ')
      const bankDesc   = [payTypeLabel[paymentType ?? ''] ?? 'Bank Payment', paymentNumber].filter(Boolean).join(' · ')
      const whtRatePart = whtRate && whtRate !== 'none' && whtRate !== 'custom' ? `${whtRate}%` : pndLabel
      const whtDesc    = ['WHT', whtRatePart, vendorName, paymentNumber].filter(Boolean).join(' · ')

      return {
        date:  paymentDate ?? undefined,
        lines: [
          { _key: genKey(), accountCode: mkRef(expRef),  description: expDesc,  debitAmount: expenseAmt, creditAmount: 0       },
          // Purchase VAT line — only for non-procurement modes (procurement already handled VAT in the procurement entry)
          ...(!isProcPayment && vat > 0 && claimable ? [{
            _key: genKey(), accountCode: mkRef(vatAccountId ?? undefined),
            description: `Purchase VAT 7%${!vatAccountId ? ' ⚠ create code 2145001' : ''}`,
            debitAmount: vat, creditAmount: 0,
          }] : []),
          ...(wht > 0 ? [{
            _key: genKey(), accountCode: mkRef(whtAccountId ?? undefined),
            description: `${whtDesc}${!whtAccountId ? ` ⚠ create code ${vendorIdentityType === 'individual' ? '214200' : '214300'}` : ''}`,
            debitAmount: 0, creditAmount: wht,
          }] : []),
          { _key: genKey(), accountCode: mkRef(bankRef),  description: bankDesc, debitAmount: 0,          creditAmount: netBank },
        ],
      }
    }

    if (docType === 'invoiceReceipt') {
      if (!lineItems?.length && !totalAmount) return null
      const rcptLines: Line[] = (lineItems ?? []).map(li => ({
        _key:         genKey(),
        accountCode:  mkRef(li.accountCode?._ref),
        description:  li.description_en ?? li.description_th ?? 'Revenue',
        debitAmount:  0,
        // always recompute from live qty × price — lineTotal is a stale snapshot
        creditAmount: Math.round(((li.quantity ?? 1) * (li.unitPrice ?? 0)) * 100) / 100,
      }))
      const vatLine: Line | null = (rcptVat ?? 0) > 0
        ? { _key: genKey(), description: 'Output VAT 7%', debitAmount: 0, creditAmount: rcptVat! }
        : null
      const netReceived = Math.round(((totalAmount ?? 0) - wht) * 100) / 100
      const bankLine: Line = {
        _key:         genKey(),
        accountCode:  mkRef(payBankRef?._ref),
        description:  'bank / cash received',
        debitAmount:  wht > 0 ? netReceived : (totalAmount ?? 0),
        creditAmount: 0,
      }
      const whtReceivableLine: Line | null = wht > 0 ? {
        _key:         genKey(),
        accountCode:  mkRef(rcptWhtAccountId ?? undefined),
        description:  `WHT Receivable${!rcptWhtAccountId ? ' ⚠ no WHT Receivable asset account found' : ''}`,
        debitAmount:  wht,
        creditAmount: 0,
      } : null
      return {
        lines: [
          ...rcptLines,
          ...(vatLine            ? [vatLine]            : []),
          ...(whtReceivableLine  ? [whtReceivableLine]  : []),
          bankLine,
        ],
        date: issueDate ?? undefined,
      }
    }

    if (docType === 'funding') {
      const amt     = fundAmount ?? 0
      if (amt === 0) return null
      const glRef   = fundGlRef?._ref
      const bankRef = fundBankRef?._ref
      return {
        date:  fundingDate ?? undefined,
        lines: direction === 'inflow'
          ? [
              { _key: genKey(), accountCode: mkRef(bankRef), description: 'bank / cash received', debitAmount: amt, creditAmount: 0   },
              { _key: genKey(), accountCode: mkRef(glRef),   description: 'liability / equity',   debitAmount: 0,   creditAmount: amt },
            ]
          : [
              { _key: genKey(), accountCode: mkRef(glRef),   description: 'liability / equity',   debitAmount: amt, creditAmount: 0   },
              { _key: genKey(), accountCode: mkRef(bankRef), description: 'bank / cash paid',      debitAmount: 0,   creditAmount: amt },
            ],
      }
    }

    if (docType === 'procurement') {
      const amount = procAmount ?? 0
      if (amount === 0) return null
      const desc = poNumber ? `· ${poNumber}` : ''
      return {
        lines: [
          {
            _key:         genKey(),
            accountCode:  mkRef(procGlRef?._ref),
            description:  `Asset / Expense ${desc}`.trim(),
            debitAmount:  amount,
            creditAmount: 0,
          },
          {
            _key:         genKey(),
            accountCode:  mkRef(procApRef?._ref),
            description:  `Accounts Payable ${desc}${!procApRef ? ' ⚠ set 3.4 AP account' : ''}`.trim(),
            debitAmount:  0,
            creditAmount: amount,
          },
        ],
      }
    }

    return null
  }

  // ── Auto-populate when lines empty + data ready ───────────────────────────
  useEffect(() => {
    if (isPosted || isVoided)           return
    if ((lines ?? []).length > 0)       return   // already has lines
    if (!draftId || !docType)           return
    if (!specialAccountsReady)          return   // still resolving WHT/VAT accounts
    if (autoFiredRef.current)           return

    const result = buildSuggested()
    if (!result) return

    autoFiredRef.current = true
    const patch: Record<string, any> = { 'accountingEntry.lines': result.lines }
    if (!entryDate && result.date) patch['accountingEntry.entryDate'] = result.date
    safePatch(patch).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialAccountsReady, docType, paidAmount, payGlRef?._ref, payBankRef?._ref,
      fundAmount, fundGlRef?._ref, fundBankRef?._ref, whtAccountId, vatAccountId, rcptWhtAccountId,
      procAmount, procApRef?._ref, firstProcRef, procLinkedApRef])

  // ── Patch helpers ─────────────────────────────────────────────────────────
  const applyLines = async (result: { lines: Line[]; date?: string } | null) => {
    if (!result || !draftId) return
    setSaving(true)
    try {
      const patch: Record<string, any> = { 'accountingEntry.lines': result.lines }
      if (!entryDate && result.date) patch['accountingEntry.entryDate'] = result.date
      await safePatch(patch)
    } finally { setSaving(false) }
  }

  const handleRefresh = () => applyLines(buildSuggested())

  const handlePost = async () => {
    if (!canPost || isPosted || !draftId) return
    setSaving(true)
    try {
      await safePatch({
        'accountingEntry.glStatus':   'posted',
        'accountingEntry.postedAt':   new Date().toISOString(),
        ...(txnDate ? { 'accountingEntry.entryDate': txnDate } : {}),
      })
    } finally { setSaving(false) }
  }

  const handleUnpost = async () => {
    if (!draftId) return
    setSaving(true)
    try {
      await safePatch({ 'accountingEntry.glStatus': 'draft' })
    } finally { setSaving(false) }
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalDr             = (lines ?? []).reduce((s, l) => s + (l.debitAmount  ?? 0), 0)
  const totalCr             = (lines ?? []).reduce((s, l) => s + (l.creditAmount ?? 0), 0)
  const diff                = Math.abs(totalDr - totalCr)
  const isBalanced          = diff < 0.005 && totalDr > 0
  const missingAccountLines = (lines ?? []).filter(l => !l.accountCode?._ref).length
  const allLinesHaveAccount = missingAccountLines === 0
  const canPost             = isBalanced && allLinesHaveAccount

  // ── Navigate to GL for a given accountCode ref ───────────────────────────
  const navigateToGL = async (accountCodeRef: string) => {
    try {
      const ledger = await client.fetch<{ _id: string } | null>(
        `*[_type == "ledger" && accountCode._ref == $ref && !(_id in path("drafts.**"))][0]{ _id }`,
        { ref: accountCodeRef }
      )
      if (!ledger) {
        toast.push({ status: 'warning', title: 'No GL account found', description: 'No ledger entry exists for this account code yet.' })
        return
      }
      router.navigateIntent('edit', { id: ledger._id, type: 'ledger' })
    } catch {
      toast.push({ status: 'error', title: 'Navigation failed', description: 'Could not open the General Ledger for this account.' })
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const tone  = isPosted ? 'positive' : isVoided ? 'critical' : 'default'
  const cellSt = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '4px 10px', textAlign: align, fontSize: 12,
    borderBottom: '1px solid var(--card-border-color)',
  })
  const headSt = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    ...cellSt(align), fontWeight: 600, background: 'var(--card-muted-bg-color)',
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card padding={3} radius={2} border tone={tone}>
      <Stack space={3}>

        {/* Header */}
        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">Journal Entry</Text>
          <Badge
            tone={isPosted ? 'positive' : isVoided ? 'critical' : 'caution'}
            mode="outline" fontSize={1}
          >
            {isPosted ? '✅ Posted' : isVoided ? '🚫 Voided' : '📝 Draft'}
          </Badge>
        </Flex>

        {/* Lines table */}
        {(lines ?? []).length > 0 ? (
          <Box style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={headSt()}>Account</th>
                  <th style={headSt()}>Description</th>
                  <th style={headSt('right')}>Debit</th>
                  <th style={headSt('right')}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {(lines ?? []).map((ln, i) => (
                  <tr key={ln._key ?? i}>
                    <td style={cellSt()}>
                      {ln.accountCode?._ref ? (
                        <button
                          onClick={() => navigateToGL(ln.accountCode!._ref!)}
                          title="Open in General Ledger"
                          style={{
                            background: 'none', border: 'none', padding: 0, margin: 0,
                            cursor: 'pointer', textAlign: 'left', color: 'inherit',
                            fontSize: 12, fontFamily: 'inherit',
                            textDecoration: 'underline',
                            textDecorationStyle: 'dotted',
                            textDecorationColor: 'var(--card-muted-fg-color)',
                          }}
                        >
                          {accountNames[ln.accountCode._ref] ?? '…'}
                        </button>
                      ) : (
                        <Text size={1}>
                          <span style={{ color: 'var(--card-muted-fg-color)' }}>— set account above</span>
                        </Text>
                      )}
                    </td>
                    <td style={cellSt()}><Text size={1}>{ln.description ?? ''}</Text></td>
                    <td style={cellSt('right')}>
                      {(ln.debitAmount ?? 0) > 0 && <Text size={1}>{fmt(ln.debitAmount!)}</Text>}
                    </td>
                    <td style={cellSt('right')}>
                      {(ln.creditAmount ?? 0) > 0 && <Text size={1}>{fmt(ln.creditAmount!)}</Text>}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ ...cellSt(), fontWeight: 600, background: 'var(--card-muted-bg-color)' }}>
                    Total
                  </td>
                  <td style={{ ...cellSt('right'), fontWeight: 600, background: 'var(--card-muted-bg-color)' }}>
                    {fmt(totalDr)}
                  </td>
                  <td style={{ ...cellSt('right'), fontWeight: 600, background: 'var(--card-muted-bg-color)' }}>
                    {fmt(totalCr)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Box>
        ) : (
          <Card padding={3} tone="caution" radius={2}>
            <Text size={1} muted>
              {saving
                ? 'Generating entries…'
                : 'Generating entries — complete Section 1 Setup and Section 2 Execution first.'}
            </Text>
          </Card>
        )}

        {/* Balance check + account completeness */}
        {(lines ?? []).length > 0 && (
          <Flex align="center" gap={2} wrap="wrap">
            {isBalanced
              ? <Badge tone="positive" mode="outline" fontSize={1}>✓ Balanced</Badge>
              : <Badge tone="critical"  mode="outline" fontSize={1}>⚠ Out of balance — {fmt(diff)}</Badge>
            }
            {!allLinesHaveAccount && (
              <Badge tone="critical" mode="outline" fontSize={1}>
                ⚠ {missingAccountLines} line{missingAccountLines > 1 ? 's' : ''} missing account code
              </Badge>
            )}
          </Flex>
        )}

        {/* Action buttons */}
        {!isPosted && !isVoided && (
          <Flex gap={2} wrap="wrap" align="center">
            {docType !== 'journalEntry' && (
              <Button
                text={saving ? 'Working…' : '↺ Refresh Entries'}
                mode="ghost" fontSize={1} padding={2}
                onClick={handleRefresh} disabled={saving}
                title="Re-generate entries from current amounts — use after editing payment amount or bank account"
              />
            )}
            <Button
              text={saving ? 'Posting…' : 'Post to Ledger ▶'}
              tone="positive" mode="default" fontSize={1} padding={2}
              onClick={handlePost} disabled={!canPost || saving}
              title={!isBalanced ? 'Entry is not balanced' : !allLinesHaveAccount ? 'All lines must have an account code before posting' : undefined}
            />
          </Flex>
        )}


        {isPosted && (
          <Flex gap={2} align="center" justify="space-between">
            <Text size={1} muted>Posted to ledger — lines are locked.</Text>
            <Button
              text="Unpost" tone="caution" mode="ghost" fontSize={1} padding={2}
              onClick={handleUnpost} disabled={saving}
            />
          </Flex>
        )}

      </Stack>
    </Card>
  )
}
