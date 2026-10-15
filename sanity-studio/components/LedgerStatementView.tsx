/**
 * LedgerStatementView
 *
 * Leaf account  — same format as before: B/F from Setup + individual transaction rows + C/F
 * Parent account — B/F = sum of all children's brought-forward balances;
 *                  transactions = all posted lines across every child account (same row format);
 *                  C/F = combined B/F + all child transactions
 */

import { useState, useEffect, useCallback } from 'react'
import { useClient, useFormValue }           from 'sanity'
import { useRouter }                          from 'sanity/router'
import { Badge, Card, Stack, Flex, Text, Button, Spinner, TextInput } from '@sanity/ui'
import type { StringInputProps } from 'sanity'
import { useFiscalYears } from '../hooks/useFiscalYears'

interface Line { debitAmount?: number; creditAmount?: number; description?: string }
interface Txn  {
  _id:                  string
  _type:                string
  entryDate:            string
  ref:                  string
  vendorName?:          string
  paymentMode?:         string
  paymentType?:         string
  direction?:           string
  expenseCategoryName?: string
  expenseDescription?:  string
  withholdingTaxRate?:  string
  journalType?:         string
  memo?:                string
  lines:                Line[]
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function toCSV(rows: string[][]): string {
  return rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}
function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function rangeFor(mode: string): [string, string] {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()
  if (mode === 'thisMonth')  return [new Date(y, m,     1).toISOString().slice(0, 10), new Date(y, m + 1, 0).toISOString().slice(0, 10)]
  if (mode === 'lastMonth')  return [new Date(y, m - 1, 1).toISOString().slice(0, 10), new Date(y, m,     0).toISOString().slice(0, 10)]
  if (mode === 'thisQuarter') {
    const q = Math.floor(m / 3)
    return [new Date(y, q * 3, 1).toISOString().slice(0, 10), new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10)]
  }
  if (mode === 'thisYear') return [`${y}-01-01`, `${y}-12-31`]
  return ['', '']
}

// $accountIds is always an array — [singleId] for leaf, [child1, child2, ...] for parent
const QUERY_TXN = `
*[
  _type in ["payment","invoiceReceipt","funding","procurement","journalEntry"]
  && !(_id in path("drafts.**"))
  && accountingEntry.glStatus == "posted"
  && count(accountingEntry.lines[accountCode._ref in $accountIds]) > 0
  && ($from == "" || accountingEntry.entryDate >= $from)
  && ($to   == "" || accountingEntry.entryDate <= $to  )
] | order(accountingEntry.entryDate asc, _createdAt asc) {
  _id, _type,
  "entryDate": accountingEntry.entryDate,
  "ref": select(
    _type == "payment"     => paymentNumber,
    _type == "invoiceReceipt"     => receiptNumber,
    _type == "funding"     => fundingNumber,
    _type == "procurement" => purchaseOrderNumber,
    _type == "journalEntry" => journalEntryNumber,
    _id
  ),
  vendorName,
  paymentMode,
  paymentType,
  direction,
  expenseCategoryName,
  expenseDescription,
  withholdingTaxRate,
  journalType,
  memo,
  "lines": accountingEntry.lines[accountCode._ref in $accountIds]{
    description, debitAmount, creditAmount
  }
}
`

const MODE_LABEL: Record<string, string> = {
  procurement:              'Purchase',
  direct_expense:           'Direct Expense',
  rent_payment:             'Rent Payment',
  service_contract_payment: 'Service Fee',
  interest_payment:         'Interest Expense',
  installment:              'Installment Payment',
}
const PAY_TYPE_LABEL: Record<string, string> = {
  transfer: 'Bank Transfer', cheque: 'Cheque', cash: 'Cash Payment', swift: 'SWIFT Transfer',
}

function derivedDesc(tx: Txn, ln: Line): string {
  if (tx._type === 'payment') {
    const isCredit = (ln.creditAmount ?? 0) > 0
    const vendor   = tx.vendorName ?? ''
    if (isCredit) {
      return [PAY_TYPE_LABEL[tx.paymentType ?? ''] ?? 'Bank Payment', vendor].filter(Boolean).join(' · ')
    }
    const modeLabel   = MODE_LABEL[tx.paymentMode ?? ''] ?? 'Payment'
    const subjectPart = tx.paymentMode === 'direct_expense'
      ? (tx.expenseCategoryName || tx.expenseDescription || vendor)
      : vendor
    return [modeLabel, subjectPart].filter(Boolean).join(' · ')
  }
  if (tx._type === 'funding') {
    const dir = tx.direction === 'inflow' ? 'Loan Drawdown' : 'Loan Repayment'
    return [dir, tx.vendorName].filter(Boolean).join(' · ')
  }
  if (tx._type === 'invoiceReceipt')      return ln.description || 'Revenue'
  if (tx._type === 'journalEntry') return ln.description || tx.memo || tx.journalType || 'Journal Entry'
  if (tx._type === 'procurement') {
    return [tx.vendorName, ln.description].filter(Boolean).join(' · ') || 'Accounts Payable'
  }
  return ln.description ?? ''
}

const QUICK = [
  { id: 'thisMonth',   label: 'This Month'   },
  { id: 'lastMonth',   label: 'Last Month'   },
  { id: 'thisQuarter', label: 'This Quarter' },
  { id: 'thisYear',    label: 'This Year'    },
  { id: 'custom',      label: 'Custom'       },
]

const GL_FILTER_KEY = 'gl:periodFilter'

function getInitialPeriod() {
  try {
    const raw = localStorage.getItem(GL_FILTER_KEY)
    if (raw) {
      localStorage.removeItem(GL_FILTER_KEY)
      const h = JSON.parse(raw) as { from: string; to: string; activeId: string }
      if (h.from || h.to) return { from: h.from, to: h.to, quickMode: h.activeId || 'custom', isHandoff: true }
    }
  } catch {}
  return { from: '', to: '', quickMode: '', isHandoff: false }
}

export function LedgerStatementView(_props: StringInputProps) {
  const client       = useClient({ apiVersion: '2024-01-01' })
  const fyYears      = useFiscalYears()
  const { navigateUrl } = useRouter()

  const accountRef = useFormValue(['accountCode']) as { _ref?: string } | undefined
  const bfDate     = useFormValue(['broughtForwardDate'])   as string | undefined
  const bfDebit    = useFormValue(['broughtForwardDebit'])  as number | undefined
  const bfCredit   = useFormValue(['broughtForwardCredit']) as number | undefined
  const accountId  = accountRef?._ref

  // ── Account metadata ─────────────────────────────────────────────────────────
  const [normalBalance, setNormalBalance] = useState<string | undefined>()
  const [isParent,      setIsParent]      = useState(false)

  useEffect(() => {
    if (!accountId) { setNormalBalance(undefined); setIsParent(false); return }
    client
      .fetch<{ normalBalance?: string; isParent?: boolean }>(
        `*[_id == $id][0]{ normalBalance, isParent }`, { id: accountId }
      )
      .then(doc => { setNormalBalance(doc?.normalBalance); setIsParent(doc?.isParent ?? false) })
      .catch(() => {})
  }, [accountId, client]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Leaf descendants (all depths) for parent accounts ───────────────────────
  const [childIds,  setChildIds]  = useState<string[]>([])
  const [childBFDr, setChildBFDr] = useState(0)
  const [childBFCr, setChildBFCr] = useState(0)

  useEffect(() => {
    if (!isParent || !accountId) { setChildIds([]); setChildBFDr(0); setChildBFCr(0); return }
    let cancelled = false

    // Fetch the full chart of accounts in one query, then find all leaf
    // descendants client-side via BFS. This avoids multiple round-trips for
    // deep trees while keeping the query simple.
    client
      .fetch<{ _id: string; parentId?: string; isParent?: boolean }[]>(
        `*[_type == "accountCode"]{ _id, "parentId": parentCode._ref, isParent }`,
      )
      .then(allCodes => {
        if (cancelled) return

        // Build parent → [child, ...] map
        const childrenOf: Record<string, string[]> = {}
        for (const c of allCodes) {
          if (c.parentId) {
            if (!childrenOf[c.parentId]) childrenOf[c.parentId] = []
            childrenOf[c.parentId].push(c._id)
          }
        }

        // BFS from accountId; collect nodes with no children (leaf descendants)
        const leafIds: string[] = []
        const queue   = [...(childrenOf[accountId] ?? [])]
        const visited = new Set<string>()

        while (queue.length > 0) {
          const cur = queue.shift()!
          if (visited.has(cur)) continue
          visited.add(cur)
          const kids = childrenOf[cur] ?? []
          if (kids.length === 0) {
            leafIds.push(cur)
          } else {
            queue.push(...kids)
          }
        }

        setChildIds(leafIds)
        if (leafIds.length === 0) { setChildBFDr(0); setChildBFCr(0); return }

        return client.fetch<{ broughtForwardDebit?: number; broughtForwardCredit?: number }[]>(
          `*[_type == "ledger" && !(_id in path("drafts.**")) && accountCode._ref in $ids]{ broughtForwardDebit, broughtForwardCredit }`,
          { ids: leafIds },
        )
      })
      .then(ledgers => {
        if (cancelled || !ledgers) return
        setChildBFDr(ledgers.reduce((s, l) => s + (l.broughtForwardDebit  ?? 0), 0))
        setChildBFCr(ledgers.reduce((s, l) => s + (l.broughtForwardCredit ?? 0), 0))
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [isParent, accountId, client]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Period selector ──────────────────────────────────────────────────────────
  const [{ from: initFrom, to: initTo, quickMode: initMode, isHandoff }] = useState(getInitialPeriod)
  const [quickMode,    setQuickMode]  = useState(initMode)
  const [from,         setFrom]       = useState(initFrom)
  const [to,           setTo]         = useState(initTo)
  const [showHandoff,  setShowHandoff] = useState(isHandoff)
  const [transactions, setTxns]       = useState<Txn[]>([])
  const [loading,      setLoading]    = useState(false)

  const applyQuick = (mode: string) => {
    setQuickMode(mode)
    setShowHandoff(false)
    if (mode !== 'custom') { const [f, t] = rangeFor(mode); setFrom(f); setTo(t) }
  }

  const load = useCallback(async () => {
    const accountIds = isParent ? childIds : (accountId ? [accountId] : [])
    if (accountIds.length === 0 || (!from && !to)) { setTxns([]); return }
    setLoading(true)
    try {
      const txns = await client.fetch<Txn[]>(QUERY_TXN, { accountIds, from: from ?? '', to: to ?? '' })
      setTxns(txns)
    } finally { setLoading(false) }
  }, [isParent, childIds, accountId, from, to, client]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  if (!accountId) {
    return (
      <Card padding={3} radius={2} tone="caution" border>
        <Text size={1} muted>Select an Account Code in the Setup tab to view the ledger statement.</Text>
      </Card>
    )
  }

  if (isParent && childIds.length === 0 && !loading) {
    return (
      <Card padding={3} radius={2} tone="caution" border>
        <Text size={1} muted>No sub-accounts found for this parent account.</Text>
      </Card>
    )
  }

  // ── Balance computation ──────────────────────────────────────────────────────

  const isDebitNormal = normalBalance !== 'credit'

  // Parent: B/F = sum of all children's ledger B/F values
  // Leaf:   B/F = Setup tab fields
  const bfDr = isParent ? childBFDr : (isDebitNormal ? (bfDebit  ?? 0) : 0)
  const bfCr = isParent ? childBFCr : (isDebitNormal ? 0 : (bfCredit ?? 0))

  const bfBalance = isDebitNormal ? bfDr - bfCr : bfCr - bfDr
  const bfSide    = bfBalance >= 0
    ? (isDebitNormal ? 'Dr' : 'Cr')
    : (isDebitNormal ? 'Cr' : 'Dr')

  // Build running balance rows
  let runDr = bfDr
  let runCr = bfCr
  const rows: {
    date: string; ref: string; desc: string; dr: number; cr: number; balance: number; side: string
    txId: string; txType: string
  }[] = []

  for (const tx of transactions) {
    for (const ln of tx.lines) {
      const dr = ln.debitAmount  ?? 0
      const cr = ln.creditAmount ?? 0
      runDr += dr; runCr += cr
      const bal = isDebitNormal ? runDr - runCr : runCr - runDr
      rows.push({
        date:    tx.entryDate ?? '—',
        ref:     tx.ref ?? tx._id.slice(0, 8),
        desc:    derivedDesc(tx, ln),
        dr, cr,
        balance: Math.abs(bal),
        side:    bal >= 0 ? (isDebitNormal ? 'Dr' : 'Cr') : (isDebitNormal ? 'Cr' : 'Dr'),
        txId:   tx._id,
        txType: tx._type,
      })
    }
  }

  const periodDr = transactions.flatMap(t => t.lines).reduce((s, l) => s + (l.debitAmount  ?? 0), 0)
  const periodCr = transactions.flatMap(t => t.lines).reduce((s, l) => s + (l.creditAmount ?? 0), 0)

  const cfRaw  = isDebitNormal
    ? (bfDr + periodDr) - (bfCr + periodCr)
    : (bfCr + periodCr) - (bfDr + periodDr)
  const cfAbs  = Math.abs(cfRaw)
  const cfSide = cfRaw >= 0 ? (isDebitNormal ? 'Dr' : 'Cr') : (isDebitNormal ? 'Cr' : 'Dr')

  // ── Export ───────────────────────────────────────────────────────────────────

  const exportLedger = () => {
    const out: string[][] = [
      ['Date', 'Reference', 'Description', 'Debit (THB)', 'Credit (THB)', 'Balance (THB)', 'Dr/Cr'],
    ]
    out.push(['', 'B/F', 'Brought Forward', '', '', String(Math.abs(bfBalance)), bfSide])
    for (const r of rows) {
      out.push([r.date, r.ref, r.desc, r.dr > 0 ? String(r.dr) : '', r.cr > 0 ? String(r.cr) : '', String(r.balance), r.side])
    }
    if (rows.length > 0) {
      out.push(['', 'Period Total', '', String(periodDr), String(periodCr), '', ''])
    }
    out.push(['', 'C/F', 'Carried Forward', '', '', String(cfAbs), cfSide])
    const label = [from, to].filter(Boolean).join('_to_') || 'all'
    downloadCSV(toCSV(out), `ledger_${label}.csv`)
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  const cell = (align: 'left' | 'right' = 'left', extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '5px 10px', textAlign: align, fontSize: 12,
    borderBottom: '1px solid var(--card-border-color)', ...extra,
  })
  const head = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    ...cell(align), fontWeight: 600, background: 'var(--card-muted-bg-color)',
  })

  const hasPeriod = !!(from || to)

  return (
    <Stack space={3}>

      {/* Parent account badge */}
      {isParent && (
        <Badge tone="primary" mode="outline" fontSize={1}>
          Parent account — showing combined balance of {childIds.length} sub-account{childIds.length !== 1 ? 's' : ''}
        </Badge>
      )}

      {/* Period handoff badge */}
      {showHandoff && (
        <Badge tone="caution" mode="outline" fontSize={1}>
          Period carried from Financial Statements: {from} → {to}
        </Badge>
      )}

      {/* ── Period selector — always visible ── */}
      <Card padding={3} radius={2} border>
        <Stack space={2}>
          <Flex gap={2} wrap="wrap">
            {QUICK.map(q => (
              <Button key={q.id} text={q.label}
                mode={quickMode === q.id ? 'default' : 'ghost'}
                tone={quickMode === q.id ? 'primary' : 'default'}
                fontSize={1} padding={2}
                onClick={() => applyQuick(q.id)}
              />
            ))}
          </Flex>

          {fyYears.length > 0 && (
            <Flex gap={2} wrap="wrap" align="center">
              <Text size={0} muted>Fiscal Year</Text>
              {fyYears.map(fy => (
                <Button key={fy.id} text={fy.label}
                  mode={quickMode === fy.id ? 'default' : 'ghost'}
                  tone={quickMode === fy.id ? 'primary' : 'default'}
                  fontSize={1} padding={2}
                  onClick={() => { setQuickMode(fy.id); setFrom(fy.from); setTo(fy.to); setShowHandoff(false) }}
                />
              ))}
            </Flex>
          )}

          {quickMode === 'custom' && (
            <Flex gap={2} align="center" wrap="wrap">
              <Text size={1} muted>From</Text>
              <TextInput type="date" value={from} fontSize={1}
                onChange={e => { setFrom((e.target as HTMLInputElement).value); setShowHandoff(false) }}
                style={{ width: 160 }} />
              <Text size={1} muted>To</Text>
              <TextInput type="date" value={to} fontSize={1}
                onChange={e => { setTo((e.target as HTMLInputElement).value); setShowHandoff(false) }}
                style={{ width: 160 }} />
              <Button text="Apply" mode="default" tone="primary" fontSize={1} padding={2} onClick={load} />
            </Flex>
          )}

          <Flex justify="space-between" align="center">
            <Text size={0} muted>
              {hasPeriod ? `Period: ${from}${from && to ? ` → ${to}` : ''}` : 'Select a period above'}
            </Text>
            <Flex gap={2} align="center">
              {hasPeriod && (
                <Button text="⬇ Export CSV" mode="ghost" tone="default" fontSize={1} padding={2}
                  disabled={loading} onClick={exportLedger} />
              )}
              {hasPeriod && (
                <Button text="Clear" mode="ghost" tone="critical" fontSize={1} padding={2}
                  onClick={() => { setQuickMode(''); setFrom(''); setTo(''); setShowHandoff(false) }} />
              )}
            </Flex>
          </Flex>
        </Stack>
      </Card>

      {/* ── Ledger table (period selected only) ─────────────────────────────── */}
      {hasPeriod && (
        <Card radius={2} border style={{ overflowX: 'auto' }}>
          {loading ? (
            <Flex padding={5} justify="center"><Spinner muted /></Flex>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={head()}>Date</th>
                  <th style={head()}>Reference</th>
                  <th style={head()}>Description</th>
                  <th style={head('right')}>Debit</th>
                  <th style={head('right')}>Credit</th>
                  <th style={head('right')}>Balance</th>
                </tr>
              </thead>
              <tbody>

                {/* B/F row */}
                <tr style={{ background: 'var(--card-muted-bg-color)' }}>
                  <td style={cell()}>{isParent ? '—' : (bfDate ?? '—')}</td>
                  <td style={cell()}><em style={{ fontSize: 11 }}>B/F</em></td>
                  <td style={cell()}>
                    Brought Forward
                    {isParent && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--card-muted-fg-color)' }}>sum of sub-accounts</span>}
                  </td>
                  <td style={cell('right')} />
                  <td style={cell('right')} />
                  <td style={cell('right')}>
                    <strong>{fmt(Math.abs(bfBalance))}</strong>
                    {' '}<span style={{ color: 'var(--card-muted-fg-color)', fontSize: 10 }}>{bfSide}</span>
                  </td>
                </tr>

                {/* Transaction rows */}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...cell(), textAlign: 'center', color: 'var(--card-muted-fg-color)', padding: 16 }}>
                      No posted entries for this period.
                    </td>
                  </tr>
                ) : rows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--card-muted-bg-color)' }}>
                    <td style={cell()}>{r.date}</td>
                    <td style={cell()}>
                      <button
                        onClick={() => navigateUrl({ path: `/structure/__edit__${r.txId},type=${r.txType},view=overview` })}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontSize: 12, color: 'var(--card-link-fg-color, #2276fc)', fontFamily: 'inherit',
                        }}
                      >
                        {r.ref}
                        <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 9, verticalAlign: 'middle' }}>↗</span>
                      </button>
                    </td>
                    <td style={cell()}>{r.desc}</td>
                    <td style={cell('right')}>{r.dr > 0 ? fmt(r.dr) : ''}</td>
                    <td style={cell('right')}>{r.cr > 0 ? fmt(r.cr) : ''}</td>
                    <td style={cell('right')}>
                      {fmt(r.balance)}
                      {' '}<span style={{ color: 'var(--card-muted-fg-color)', fontSize: 10 }}>{r.side}</span>
                    </td>
                  </tr>
                ))}

                {/* Period totals */}
                {rows.length > 0 && (
                  <tr style={{ background: 'var(--card-muted-bg-color)' }}>
                    <td colSpan={3} style={cell('left', { fontWeight: 600 })}>Period Total</td>
                    <td style={cell('right', { fontWeight: 600 })}>{fmt(periodDr)}</td>
                    <td style={cell('right', { fontWeight: 600 })}>{fmt(periodCr)}</td>
                    <td style={cell()} />
                  </tr>
                )}

                {/* C/F row */}
                <tr style={{ background: 'var(--card-code-bg-color, #f0f0f0)' }}>
                  <td colSpan={3} style={cell('left', { fontWeight: 700 })}>C/F  —  Carried Forward</td>
                  <td colSpan={2} style={cell()} />
                  <td style={cell('right', { fontWeight: 700 })}>
                    {fmt(cfAbs)}
                    {' '}<span style={{ color: 'var(--card-muted-fg-color)', fontSize: 10 }}>{cfSide}</span>
                  </td>
                </tr>

              </tbody>
            </table>
          )}
        </Card>
      )}

      {hasPeriod && (
        <Text size={0} muted>
          {isParent
            ? 'Parent account — B/F and transactions are the combined sum of all sub-accounts.'
            : 'Showing posted accounting entries only. B/F = brought-forward balance from Setup tab.'}
        </Text>
      )}

    </Stack>
  )
}
