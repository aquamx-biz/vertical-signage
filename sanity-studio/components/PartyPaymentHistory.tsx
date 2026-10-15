import React, { useState, useEffect } from 'react'
import { useClient, useFormValue }     from 'sanity'
import { useRouter }                   from 'sanity/router'
import { Card, Stack, Flex, Text, Badge, Button, Spinner, Grid } from '@sanity/ui'
import { ChevronDownIcon, ChevronRightIcon } from '@sanity/icons'

// ── Interfaces ─────────────────────────────────────────────────────────────

interface PaymentRow {
  _id:                  string
  paymentNumber?:       string
  paymentMode?:         string
  paymentStatus?:       string
  paymentAmount?:       number
  currency?:            string
  paidAmount?:          number
  whtAmount?:           number
  vatType?:             string
  vatAmount?:           number
  paymentDate?:         string
  dueDate?:             string
  glName?:              string
  glType?:              string
  expenseCategoryName?: string
  projectSiteName?:     string
  servicePeriodStart?:  string
  servicePeriodEnd?:    string
  scId?:                string
  scContractNo?:        string
  scServiceName?:       string
}

interface ReceiptRow {
  _id:             string
  receiptNumber?:  string
  receiptType?:    string
  status?:         string
  issueDate?:      string
  billingPeriod?:  string
  totalAmount?:    number
  whtAmount?:      number
  paymentDate?:    string
  currency?:       string
  projectSiteName?: string
}

interface FundingRow {
  _id:                  string
  fundingNumber?:       string
  fundingCategory?:     string
  fundingType?:         string
  direction?:           string
  status?:              string
  date?:                string
  amount?:              number
  currency?:            string
  newRegisteredCapital?: number
}

// ── Status maps ────────────────────────────────────────────────────────────

const PMT_STATUS_TONE: Record<string, 'positive' | 'caution' | 'critical' | 'default'> = {
  complete: 'positive', paid: 'positive', approved: 'positive',
  condition_met: 'caution', processing: 'caution',
  submitted: 'default', created: 'default',
  rejected: 'critical',
}
const PMT_STATUS_LABEL: Record<string, string> = {
  created: '📝 Created', submitted: '📤 Submitted', approved: '✅ Approved',
  rejected: '❌ Rejected', condition_met: '🔍 Cond. Met', processing: '🔄 Processing',
  paid: '💳 Paid', complete: '🧾 Complete',
}

const RCT_STATUS_TONE: Record<string, 'positive' | 'caution' | 'critical' | 'default'> = {
  draft: 'default', issued: 'caution', posted: 'positive', voided: 'critical',
}
const RCT_STATUS_LABEL: Record<string, string> = {
  draft: '📝 Draft', issued: '✅ Issued', posted: '📒 Posted', voided: '🚫 Voided',
}

const FND_STATUS_TONE: Record<string, 'positive' | 'caution' | 'critical' | 'default'> = {
  confirmed: 'positive', draft: 'default', voided: 'critical',
}
const FND_STATUS_LABEL: Record<string, string> = {
  draft: '📝 Draft', confirmed: '✅ Confirmed', voided: '🚫 Voided',
}

const FND_TYPE_LABEL: Record<string, string> = {
  loan_drawdown:       'Loan Drawdown',
  equity_injection:    'Equity Injection',
  inter_company_loan:  'IC Loan',
  loan_repayment:      'Loan Repayment',
  dividend_payment:    'Dividend',
  inter_company_repay: 'IC Repayment',
}

const PAID_STATUSES    = ['paid', 'complete']
const PENDING_STATUSES = ['approved', 'condition_met', 'processing']

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function shortDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

function periodLabel(start?: string, end?: string): string | null {
  if (!start && !end) return null
  const f = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
  if (start && end) return `${f(start)} – ${f(end)}`
  if (start) return `From ${f(start)}`
  return `Until ${f(end!)}`
}

function pmt_rowLabel(r: PaymentRow): string {
  return (r.glType === 'asset' && r.expenseCategoryName)
    ? r.expenseCategoryName
    : (r.glName ?? (r.paymentMode === 'direct_expense' ? 'Direct Payment' : r.paymentNumber ?? '—'))
}

function pmt_rowIcon(r: PaymentRow): string {
  return r.glType === 'asset' ? '🏦' : r.glType === 'expense' ? '💸' : '💳'
}

function pmt_netOf(r: PaymentRow): number {
  const gross = r.paidAmount ?? r.paymentAmount ?? 0
  return gross - (r.whtAmount ?? 0) + (r.vatType === 'exclusive' ? (r.vatAmount ?? 0) : 0)
}

// ── Main component ─────────────────────────────────────────────────────────

export function PartyPaymentHistory(_props: any) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const router = useRouter()
  const docId  = useFormValue(['_id']) as string | undefined

  const [payments,          setPayments]          = useState<PaymentRow[]>([])
  const [receipts,          setReceipts]           = useState<ReceiptRow[]>([])
  const [funding,           setFunding]            = useState<FundingRow[]>([])
  const [loading,           setLoading]            = useState(false)
  const [expandedSections,  setExpandedSections]   = useState<Set<string>>(
    new Set(['payments', 'receipts', 'funding'])
  )
  const [expandedGroups,    setExpandedGroups]     = useState<Set<string>>(new Set())
  const [expandedSubGroups, setExpandedSubGroups]  = useState<Set<string>>(new Set())

  const partyId = docId?.replace(/^drafts\./, '')

  useEffect(() => {
    if (!partyId) return
    setLoading(true)
    Promise.all([
      client.fetch<PaymentRow[]>(
        `*[_type == "payment" && vendor._ref == $partyId && !(_id in path("drafts.**"))]
         | order(paymentDate desc) {
           _id, paymentNumber, paymentMode, paymentStatus, paymentAmount, currency,
           paidAmount, paymentDate, dueDate, whtAmount, vatType, vatAmount,
           "glName":             accountCode->nameEn,
           "glType":             accountCode->type,
           expenseCategoryName,
           "projectSiteName":    expenseProjectSite->projectEn,
           "servicePeriodStart": linkedServiceContract->payments[payment._ref == ^._id][0].servicePeriodStart,
           "servicePeriodEnd":   linkedServiceContract->payments[payment._ref == ^._id][0].servicePeriodEnd,
           "scId":               linkedServiceContract._ref,
           "scContractNo":       linkedServiceContract->vendorContractNo,
           "scServiceName":      linkedServiceContract->serviceName,
         }`,
        { partyId },
      ),
      client.fetch<ReceiptRow[]>(
        `*[_type == "invoiceReceipt" && payer._ref == $partyId && !(_id in path("drafts.**"))]
         | order(issueDate desc) {
           _id, receiptNumber, receiptType, status,
           issueDate, billingPeriod, totalAmount, whtAmount, paymentDate, currency,
           "projectSiteName": projectSite->projectEn,
         }`,
        { partyId },
      ),
      client.fetch<FundingRow[]>(
        `*[_type == "funding" && party._ref == $partyId && !(_id in path("drafts.**"))]
         | order(date desc) {
           _id, fundingNumber, fundingCategory, fundingType, direction,
           status, date, amount, currency, newRegisteredCapital,
         }`,
        { partyId },
      ),
    ])
      .then(([pmts, rcts, fnds]) => {
        setPayments(pmts ?? [])
        setReceipts(rcts ?? [])
        setFunding(fnds  ?? [])
      })
      .catch(() => {
        setPayments([])
        setReceipts([])
        setFunding([])
      })
      .finally(() => setLoading(false))
  }, [partyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    setter(next)
  }

  // ── Summary aggregates ──────────────────────────────────────────────────
  const totalPaid       = payments.filter(r => PAID_STATUSES.includes(r.paymentStatus ?? '')).reduce((s, r) => s + pmt_netOf(r), 0)
  const totalPending    = payments.filter(r => PENDING_STATUSES.includes(r.paymentStatus ?? '')).reduce((s, r) => s + (r.paymentAmount ?? 0), 0)
  const pendingCount    = payments.filter(r => PENDING_STATUSES.includes(r.paymentStatus ?? '')).length
  const totalReceived   = receipts.filter(r => r.status === 'issued').reduce((s, r) => s + ((r.totalAmount ?? 0) - (r.whtAmount ?? 0)), 0)
  const totalFundingIn  = funding.filter(r => r.direction === 'inflow'  && r.status === 'confirmed').reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalFundingOut = funding.filter(r => r.direction === 'outflow' && r.status === 'confirmed').reduce((s, r) => s + (r.amount ?? 0), 0)

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading transaction history…</Text>
      </Flex>
    )
  }

  if (!partyId) {
    return (
      <Card padding={3} radius={2} tone="caution" border>
        <Text size={1}>Save this party first to see transaction history.</Text>
      </Card>
    )
  }

  // ── Payment groups ──────────────────────────────────────────────────────
  const pmt_groupMap = new Map<string, PaymentRow[]>()
  for (const r of payments) {
    const key = pmt_rowLabel(r)
    if (!pmt_groupMap.has(key)) pmt_groupMap.set(key, [])
    pmt_groupMap.get(key)!.push(r)
  }
  for (const gr of pmt_groupMap.values()) {
    gr.sort((a, b) => {
      const cmp = (b.servicePeriodStart ?? b.paymentDate ?? '').localeCompare(a.servicePeriodStart ?? a.paymentDate ?? '')
      if (cmp !== 0) return cmp
      return (b.servicePeriodEnd ?? '').localeCompare(a.servicePeriodEnd ?? '')
    })
  }
  const pmt_groups = Array.from(pmt_groupMap.entries())
    .sort((a, b) => b[1].reduce((s, r) => s + pmt_netOf(r), 0) - a[1].reduce((s, r) => s + pmt_netOf(r), 0))

  // ── Receipt groups (by status) ──────────────────────────────────────────
  const rct_groups = [
    { key: 'issued', label: '✅ Issued',  rows: receipts.filter(r => r.status === 'issued') },
    { key: 'draft',  label: '📝 Draft',   rows: receipts.filter(r => !r.status || r.status === 'draft') },
    { key: 'voided', label: '🚫 Voided',  rows: receipts.filter(r => r.status === 'voided') },
  ].filter(g => g.rows.length > 0)

  // ── Funding groups (by direction) ────────────────────────────────────────
  const fnd_groups = [
    { key: 'inflow',  label: '📥 Inflows',              rows: funding.filter(r => r.direction === 'inflow') },
    { key: 'outflow', label: '📤 Outflows',             rows: funding.filter(r => r.direction === 'outflow') },
    { key: 'cap_reg', label: '📋 Capital Registration', rows: funding.filter(r => r.fundingCategory === 'capital_register') },
  ].filter(g => g.rows.length > 0)

  // ── Row renderers ────────────────────────────────────────────────────────

  const renderPaymentRow = (r: PaymentRow, i: number, total: number, bgDepth = false) => {
    const tone      = PMT_STATUS_TONE[r.paymentStatus ?? ''] ?? 'default'
    const isSettled = PAID_STATUSES.includes(r.paymentStatus ?? '')
    const gross     = r.paidAmount ?? r.paymentAmount
    const net       = gross != null
      ? gross - (r.whtAmount ?? 0) + (r.vatType === 'exclusive' ? (r.vatAmount ?? 0) : 0)
      : null
    const period      = periodLabel(r.servicePeriodStart, r.servicePeriodEnd)
    const headerLabel = period ?? shortDate(r.paymentDate ?? r.dueDate)
    return (
      <Card
        key={r._id}
        padding={3}
        radius={0}
        tone={isSettled ? 'transparent' : 'caution'}
        style={{
          borderBottom: i < total - 1 ? '1px solid var(--card-border-color)' : undefined,
          background: bgDepth ? 'var(--card-bg-color)' : undefined,
        }}
      >
        <Stack space={2}>
          <Flex justify="space-between" align="center" gap={3}>
            <Text size={1} weight="semibold">{headerLabel}</Text>
            <Badge tone={tone} mode="outline" fontSize={0} style={{ flexShrink: 0 }}>
              {PMT_STATUS_LABEL[r.paymentStatus ?? ''] ?? r.paymentStatus ?? '—'}
            </Badge>
          </Flex>
          <Flex justify="space-between" align="center" gap={3}>
            <Stack space={1} style={{ flex: 1, minWidth: 0 }}>
              <Flex align="center" gap={2}>
                <Text size={1}>{r.paymentNumber ?? '(no number)'}</Text>
                {r.projectSiteName && <Text size={0} muted>· 📍 {r.projectSiteName}</Text>}
              </Flex>
              {r.paymentDate && <Text size={0} muted>Paid {shortDate(r.paymentDate)}</Text>}
            </Stack>
            <Flex align="center" gap={3} style={{ flexShrink: 0 }}>
              {gross != null && (
                <Stack space={1} style={{ textAlign: 'right' }}>
                  <Stack space={0}>
                    <Text size={0} muted>Gross</Text>
                    <Text size={1} weight="semibold">{fmt(gross)} {r.currency ?? 'THB'}</Text>
                  </Stack>
                  {net != null && (
                    <Stack space={0}>
                      <Text size={0} muted>Net payable</Text>
                      <Text size={1} weight="semibold">{fmt(net)} {r.currency ?? 'THB'}</Text>
                    </Stack>
                  )}
                </Stack>
              )}
              <Button
                text="Open"
                mode="ghost"
                fontSize={0}
                padding={2}
                onClick={e => { e.stopPropagation(); router.navigateIntent('edit', { id: r._id, type: 'payment' }) }}
              />
            </Flex>
          </Flex>
        </Stack>
      </Card>
    )
  }

  const renderReceiptRow = (r: ReceiptRow, i: number, total: number) => {
    const tone = RCT_STATUS_TONE[r.status ?? ''] ?? 'default'
    const net  = (r.totalAmount ?? 0) - (r.whtAmount ?? 0)
    const headerLabel = r.billingPeriod ?? shortDate(r.issueDate)
    return (
      <Card
        key={r._id}
        padding={3}
        radius={0}
        tone="transparent"
        style={{ borderBottom: i < total - 1 ? '1px solid var(--card-border-color)' : undefined }}
      >
        <Stack space={2}>
          <Flex justify="space-between" align="center" gap={3}>
            <Text size={1} weight="semibold">{headerLabel}</Text>
            <Badge tone={tone} mode="outline" fontSize={0} style={{ flexShrink: 0 }}>
              {RCT_STATUS_LABEL[r.status ?? ''] ?? r.status ?? '—'}
            </Badge>
          </Flex>
          <Flex justify="space-between" align="center" gap={3}>
            <Stack space={1} style={{ flex: 1, minWidth: 0 }}>
              <Flex align="center" gap={2}>
                <Text size={1}>{r.receiptNumber ?? '(no number)'}</Text>
                {r.projectSiteName && <Text size={0} muted>· 📍 {r.projectSiteName}</Text>}
              </Flex>
              {r.paymentDate && <Text size={0} muted>Received {shortDate(r.paymentDate)}</Text>}
            </Stack>
            <Flex align="center" gap={3} style={{ flexShrink: 0 }}>
              <Stack space={1} style={{ textAlign: 'right' }}>
                <Stack space={0}>
                  <Text size={0} muted>Total</Text>
                  <Text size={1} weight="semibold">{fmt(r.totalAmount ?? 0)} {r.currency ?? 'THB'}</Text>
                </Stack>
                {(r.whtAmount ?? 0) > 0 && (
                  <Stack space={0}>
                    <Text size={0} muted>Net received</Text>
                    <Text size={1} weight="semibold">{fmt(net)} {r.currency ?? 'THB'}</Text>
                  </Stack>
                )}
              </Stack>
              <Button
                text="Open"
                mode="ghost"
                fontSize={0}
                padding={2}
                onClick={e => { e.stopPropagation(); router.navigateIntent('edit', { id: r._id, type: 'invoiceReceipt' }) }}
              />
            </Flex>
          </Flex>
        </Stack>
      </Card>
    )
  }

  const renderFundingRow = (r: FundingRow, i: number, total: number) => {
    const tone      = FND_STATUS_TONE[r.status ?? ''] ?? 'default'
    const isCap     = r.fundingCategory === 'capital_register'
    const display   = isCap ? (r.newRegisteredCapital ?? 0) : (r.amount ?? 0)
    const typeLabel = isCap ? 'Capital Registration' : (FND_TYPE_LABEL[r.fundingType ?? ''] ?? r.fundingType ?? '—')
    return (
      <Card
        key={r._id}
        padding={3}
        radius={0}
        tone="transparent"
        style={{ borderBottom: i < total - 1 ? '1px solid var(--card-border-color)' : undefined }}
      >
        <Stack space={2}>
          <Flex justify="space-between" align="center" gap={3}>
            <Text size={1} weight="semibold">{shortDate(r.date)}</Text>
            <Badge tone={tone} mode="outline" fontSize={0} style={{ flexShrink: 0 }}>
              {FND_STATUS_LABEL[r.status ?? ''] ?? r.status ?? '—'}
            </Badge>
          </Flex>
          <Flex justify="space-between" align="center" gap={3}>
            <Stack space={1} style={{ flex: 1, minWidth: 0 }}>
              <Text size={1}>{r.fundingNumber ?? '(no number)'}</Text>
              <Text size={0} muted>{typeLabel}</Text>
            </Stack>
            <Flex align="center" gap={3} style={{ flexShrink: 0 }}>
              <Stack space={0} style={{ textAlign: 'right' }}>
                <Text size={0} muted>{isCap ? 'Reg. Capital' : 'Amount'}</Text>
                <Text size={1} weight="semibold">{fmt(display)} {isCap ? 'THB' : (r.currency ?? 'THB')}</Text>
              </Stack>
              <Button
                text="Open"
                mode="ghost"
                fontSize={0}
                padding={2}
                onClick={e => { e.stopPropagation(); router.navigateIntent('edit', { id: r._id, type: 'funding' }) }}
              />
            </Flex>
          </Flex>
        </Stack>
      </Card>
    )
  }

  // ── Section header renderer (called as function, not JSX tag) ───────────
  const renderSectionHeader = (
    sectionKey: string,
    icon: string,
    title: string,
    count: number,
    amount?: number,
    amountSub?: string,
  ) => {
    const isOpen = expandedSections.has(sectionKey)
    return (
      <Flex
        align="center"
        justify="space-between"
        padding={3}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          background: 'var(--card-muted-bg-color)',
          borderRadius: 4,
        }}
        onClick={() => toggle(expandedSections, sectionKey, setExpandedSections)}
      >
        <Flex align="center" gap={2}>
          <Text size={0}>{isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}</Text>
          <Text size={2} weight="semibold">{icon} {title}</Text>
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 20,
            background: 'var(--card-border-color)',
            color: 'var(--card-muted-fg-color)',
          }}>
            {count}
          </span>
        </Flex>
        {amount != null && (
          <Stack space={0} style={{ textAlign: 'right', flexShrink: 0 }}>
            <Text size={1} weight="semibold">{fmt(amount)} THB</Text>
            {amountSub && <Text size={0} muted>{amountSub}</Text>}
          </Stack>
        )}
      </Flex>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Stack space={4}>

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <Grid columns={[1, 2, 4]} gap={3}>
        <Card padding={3} radius={2} tone="critical" border>
          <Stack space={1}>
            <Text size={0} muted>Total Expenses (THB)</Text>
            <Text size={2} weight="semibold">{fmt(totalPaid)}</Text>
            <Text size={0} muted>
              {payments.filter(r => PAID_STATUSES.includes(r.paymentStatus ?? '')).length} settled
              {pendingCount > 0 && ` · ${pendingCount} pending ${fmt(totalPending)}`}
            </Text>
          </Stack>
        </Card>
        <Card padding={3} radius={2} tone="positive" border>
          <Stack space={1}>
            <Text size={0} muted>Total Received (THB)</Text>
            <Text size={2} weight="semibold">{fmt(totalReceived)}</Text>
            <Text size={0} muted>
              {receipts.filter(r => r.status === 'issued').length} receipts · net of WHT
            </Text>
          </Stack>
        </Card>
        <Card padding={3} radius={2} tone="positive" border>
          <Stack space={1}>
            <Text size={0} muted>Funding In (THB)</Text>
            <Text size={2} weight="semibold">{fmt(totalFundingIn)}</Text>
            <Text size={0} muted>
              {funding.filter(r => r.direction === 'inflow' && r.status === 'confirmed').length} confirmed
            </Text>
          </Stack>
        </Card>
        <Card padding={3} radius={2} tone="caution" border>
          <Stack space={1}>
            <Text size={0} muted>Funding Out (THB)</Text>
            <Text size={2} weight="semibold">{fmt(totalFundingOut)}</Text>
            <Text size={0} muted>
              {funding.filter(r => r.direction === 'outflow' && r.status === 'confirmed').length} confirmed
            </Text>
          </Stack>
        </Card>
      </Grid>

      {/* ── Payments section ──────────────────────────────────────────── */}
      <Stack space={2}>
        {renderSectionHeader('payments', '💸', 'Payments', payments.length, totalPaid, 'settled · net')}
        {expandedSections.has('payments') && (
          payments.length === 0 ? (
            <Card padding={3} radius={2} tone="default" border>
              <Text size={1} muted>No payment records for this party.</Text>
            </Card>
          ) : (
            <Stack space={2}>
              {pmt_groups.map(([key, groupRows]) => {
                const isOpen     = expandedGroups.has(key)
                const icon       = pmt_rowIcon(groupRows[0])
                const groupTotal = groupRows.reduce((s, r) => s + pmt_netOf(r), 0)
                const paidCount  = groupRows.filter(r => PAID_STATUSES.includes(r.paymentStatus ?? '')).length
                const scMap      = new Map<string, PaymentRow[]>()
                for (const r of groupRows) {
                  const scKey = r.scId ?? '__none__'
                  if (!scMap.has(scKey)) scMap.set(scKey, [])
                  scMap.get(scKey)!.push(r)
                }
                const subGroups           = Array.from(scMap.entries())
                const hasMultipleContracts = subGroups.filter(([k]) => k !== '__none__').length > 1

                return (
                  <Card key={key} radius={2} border tone="default">
                    <Flex
                      align="center"
                      justify="space-between"
                      padding={3}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => toggle(expandedGroups, key, setExpandedGroups)}
                    >
                      <Flex align="center" gap={2} style={{ minWidth: 0, flex: 1 }}>
                        <Text size={0}>{isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}</Text>
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {icon} {key}
                        </span>
                        <span style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 20,
                          background: 'var(--card-muted-bg-color)',
                          color: 'var(--card-muted-fg-color)',
                          flexShrink: 0,
                        }}>
                          {groupRows.length} tx
                        </span>
                      </Flex>
                      <Stack space={0} style={{ textAlign: 'right', flexShrink: 0 }}>
                        <Text size={1} weight="semibold">{fmt(groupTotal)} THB</Text>
                        <Text size={0} muted>{paidCount}/{groupRows.length} paid</Text>
                      </Stack>
                    </Flex>

                    {isOpen && (
                      <Stack space={0} style={{ borderTop: '1px solid var(--card-border-color)' }}>
                        {hasMultipleContracts ? (
                          subGroups.map(([scKey, scRows]) => {
                            const sgId    = `${key}::${scKey}`
                            const sgOpen  = expandedSubGroups.has(sgId)
                            const sgTotal = scRows.reduce((s, r) => s + pmt_netOf(r), 0)
                            const sgPaid  = scRows.filter(r => PAID_STATUSES.includes(r.paymentStatus ?? '')).length
                            const fr      = scRows[0]
                            const scLabel = fr.scServiceName ?? fr.scContractNo ?? 'No Contract'
                            const scNo    = fr.scContractNo
                            return (
                              <React.Fragment key={scKey}>
                                <Flex
                                  align="center"
                                  justify="space-between"
                                  padding={3}
                                  style={{
                                    cursor: 'pointer', userSelect: 'none',
                                    background: 'var(--card-muted-bg-color)',
                                    borderBottom: '1px solid var(--card-border-color)',
                                    paddingLeft: 28,
                                  }}
                                  onClick={() => toggle(expandedSubGroups, sgId, setExpandedSubGroups)}
                                >
                                  <Flex align="center" gap={2} style={{ minWidth: 0, flex: 1 }}>
                                    <Text size={0}>{sgOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}</Text>
                                    <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      🔖 {scLabel}
                                    </span>
                                    {scNo && scLabel !== scNo && (
                                      <span style={{ fontSize: 11, color: 'var(--card-muted-fg-color)', flexShrink: 0 }}>
                                        #{scNo}
                                      </span>
                                    )}
                                    <span style={{
                                      fontSize: 10, padding: '1px 6px', borderRadius: 20,
                                      background: 'var(--card-border-color)',
                                      color: 'var(--card-muted-fg-color)',
                                      flexShrink: 0,
                                    }}>
                                      {scRows.length} tx
                                    </span>
                                  </Flex>
                                  <Stack space={0} style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <Text size={1} weight="semibold">{fmt(sgTotal)} THB</Text>
                                    <Text size={0} muted>{sgPaid}/{scRows.length} paid</Text>
                                  </Stack>
                                </Flex>
                                {sgOpen && scRows.map((r, i) => renderPaymentRow(r, i, scRows.length, true))}
                              </React.Fragment>
                            )
                          })
                        ) : (
                          groupRows.map((r, i) => renderPaymentRow(r, i, groupRows.length))
                        )}
                      </Stack>
                    )}
                  </Card>
                )
              })}
            </Stack>
          )
        )}
      </Stack>

      {/* ── Receipts section ──────────────────────────────────────────── */}
      <Stack space={2}>
        {renderSectionHeader('receipts', '🧾', 'Receipts', receipts.length, totalReceived, 'issued · net of WHT')}
        {expandedSections.has('receipts') && (
          receipts.length === 0 ? (
            <Card padding={3} radius={2} tone="default" border>
              <Text size={1} muted>No receipt records for this party.</Text>
            </Card>
          ) : (
            <Stack space={2}>
              {rct_groups.map(({ key, label, rows }) => {
                const isOpen   = expandedGroups.has(`rct::${key}`)
                const grpTotal = rows.reduce((s, r) => s + ((r.totalAmount ?? 0) - (r.whtAmount ?? 0)), 0)
                return (
                  <Card key={key} radius={2} border tone="default">
                    <Flex
                      align="center"
                      justify="space-between"
                      padding={3}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => toggle(expandedGroups, `rct::${key}`, setExpandedGroups)}
                    >
                      <Flex align="center" gap={2} style={{ minWidth: 0, flex: 1 }}>
                        <Text size={0}>{isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}</Text>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                        <span style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 20,
                          background: 'var(--card-muted-bg-color)',
                          color: 'var(--card-muted-fg-color)',
                          flexShrink: 0,
                        }}>
                          {rows.length} tx
                        </span>
                      </Flex>
                      <Stack space={0} style={{ textAlign: 'right', flexShrink: 0 }}>
                        <Text size={1} weight="semibold">{fmt(grpTotal)} THB</Text>
                        <Text size={0} muted>net received</Text>
                      </Stack>
                    </Flex>
                    {isOpen && (
                      <Stack space={0} style={{ borderTop: '1px solid var(--card-border-color)' }}>
                        {rows.map((r, i) => renderReceiptRow(r, i, rows.length))}
                      </Stack>
                    )}
                  </Card>
                )
              })}
            </Stack>
          )
        )}
      </Stack>

      {/* ── Funding section ───────────────────────────────────────────── */}
      <Stack space={2}>
        {renderSectionHeader(
          'funding', '💰', 'Funding', funding.length,
          totalFundingIn - totalFundingOut,
          'net confirmed (in − out)',
        )}
        {expandedSections.has('funding') && (
          funding.length === 0 ? (
            <Card padding={3} radius={2} tone="default" border>
              <Text size={1} muted>No funding records for this party.</Text>
            </Card>
          ) : (
            <Stack space={2}>
              {fnd_groups.map(({ key, label, rows }) => {
                const isOpen   = expandedGroups.has(`fnd::${key}`)
                const isCap    = key === 'cap_reg'
                const fndTotal = rows
                  .filter(r => r.status === 'confirmed')
                  .reduce((s, r) => s + (r.amount ?? r.newRegisteredCapital ?? 0), 0)
                return (
                  <Card key={key} radius={2} border tone="default">
                    <Flex
                      align="center"
                      justify="space-between"
                      padding={3}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => toggle(expandedGroups, `fnd::${key}`, setExpandedGroups)}
                    >
                      <Flex align="center" gap={2} style={{ minWidth: 0, flex: 1 }}>
                        <Text size={0}>{isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}</Text>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                        <span style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 20,
                          background: 'var(--card-muted-bg-color)',
                          color: 'var(--card-muted-fg-color)',
                          flexShrink: 0,
                        }}>
                          {rows.length} tx
                        </span>
                      </Flex>
                      {!isCap && (
                        <Stack space={0} style={{ textAlign: 'right', flexShrink: 0 }}>
                          <Text size={1} weight="semibold">{fmt(fndTotal)} THB</Text>
                          <Text size={0} muted>confirmed</Text>
                        </Stack>
                      )}
                    </Flex>
                    {isOpen && (
                      <Stack space={0} style={{ borderTop: '1px solid var(--card-border-color)' }}>
                        {rows.map((r, i) => renderFundingRow(r, i, rows.length))}
                      </Stack>
                    )}
                  </Card>
                )
              })}
            </Stack>
          )
        )}
      </Stack>

    </Stack>
  )
}
