import React, { useState, useEffect, useCallback } from 'react'
import { useClient }                               from 'sanity'
import { IntentLink }                              from 'sanity/router'
import { Card, Stack, Text, Flex, Button, Spinner } from '@sanity/ui'
import { useFiscalYears }                          from '../hooks/useFiscalYears'

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TYPE_LABEL: Record<string, string> = {
  asset: '🏦 Assets', liability: '📋 Liabilities', equity: '📊 Equity',
  revenue: '💰 Revenue', expense: '💸 Expenses',
}

const TYPE_NAME: Record<string, string> = {
  asset: 'Assets', liability: 'Liabilities', equity: 'Equity',
  revenue: 'Revenue', expense: 'Expenses',
}
const TYPE_SUBTOTAL: Record<string, string> = {
  asset: 'Total Assets', liability: "Total Liabilities",
  equity: "Total Shareholders' Equity", revenue: 'Total Revenue', expense: 'Total Expenses',
}

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

interface SupportingDoc {
  _key:             string
  label:            string
  fiscalYearLabel?: string
  uploadedAt?:      string
  notes?:           string
  fileUrl?:         string
  fileName?:        string
}

interface LedgerAccount {
  _id:                  string
  accountId:            string
  code:                 string
  nameTh:               string
  nameEn:               string
  type:                 string
  normalBalance:        string
  isParent:             boolean
  depth:                number
  bfDebit:              number
  bfCredit:             number
  parentAccountId?:     string
}

interface TxLine {
  accountId:    string
  debitAmount:  number
  creditAmount: number
}

interface Balance { dr: number; cr: number; net: number }

const QUERY_LEDGERS = `
  *[_type == "ledger" && !(_id in path("drafts.**"))] | order(codeCache asc) {
    _id,
    "accountId":             accountCode._ref,
    "code":                  accountCode->code,
    "nameTh":                accountCode->nameTh,
    "nameEn":                accountCode->nameEn,
    "type":                  accountCode->type,
    "normalBalance":         coalesce(normalBalanceCache, accountCode->normalBalance),
    "isParent":              coalesce(isParentCache, accountCode->isParent, false),
    "depth": select(
      !defined(accountCode->parentCode)                                             => 0,
      !defined(accountCode->parentCode->parentCode)                                 => 1,
      !defined(accountCode->parentCode->parentCode->parentCode)                     => 2,
      3
    ),
    "bfDebit":               coalesce(broughtForwardDebit,  0),
    "bfCredit":              coalesce(broughtForwardCredit, 0),
    "parentAccountId":       accountCode->parentCode._ref
  }
`

// Period transactions — for Income Statement (from → to)
const QUERY_TXNS = `
  *[
    _type in ["payment","invoiceReceipt","funding","procurement","journalEntry"]
    && !(_id in path("drafts.**"))
    && accountingEntry.glStatus == "posted"
    && ($from == "" || accountingEntry.entryDate >= $from)
    && ($to   == "" || accountingEntry.entryDate <= $to  )
  ] {
    "lines": accountingEntry.lines[] {
      "accountId":    accountCode._ref,
      "debitAmount":  coalesce(debitAmount,  0),
      "creditAmount": coalesce(creditAmount, 0)
    }
  }
`

// Registered capital — sourced from Funding schema (capital_register category).
// The latest record supplies the DBD-authorised amount.
// All capital_register records with a registeredCapitalAccount set supply the
// GL account IDs to exclude from the equity total (shown as disclosure note instead).
const QUERY_REG_CAP = `
  {
    "latest":     *[_type == "funding" && fundingCategory == "capital_register" && !(_id in path("drafts.**"))]
                  | order(date desc) [0] { newRegisteredCapital, date },
    "accountIds": *[_type == "funding" && fundingCategory == "capital_register"
                    && defined(registeredCapitalAccount) && !(_id in path("drafts.**"))]
                  .registeredCapitalAccount._ref
  }
`

// Cumulative transactions — for Balance Sheet & Trial Balance (up to 'to', no from)
const QUERY_BS_TXNS = `
  *[
    _type in ["payment","invoiceReceipt","funding","procurement","journalEntry"]
    && !(_id in path("drafts.**"))
    && accountingEntry.glStatus == "posted"
    && ($to == "" || accountingEntry.entryDate <= $to)
  ] {
    "lines": accountingEntry.lines[] {
      "accountId":    accountCode._ref,
      "debitAmount":  coalesce(debitAmount,  0),
      "creditAmount": coalesce(creditAmount, 0)
    }
  }
`

// ── Styles ──────────────────────────────────────────────────────────────────

const INDENT = 20  // px per depth level

const S = {
  th: (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '7px 12px', textAlign: align, fontSize: 11, fontWeight: 700,
    background: 'var(--card-muted-bg-color)', borderBottom: '2px solid var(--card-border-color)',
    whiteSpace: 'nowrap', letterSpacing: '0.04em', textTransform: 'uppercase',
  }),
  td: (align: 'left' | 'right' = 'left', indent = 0): React.CSSProperties => ({
    padding: '4px 12px', paddingLeft: align === 'left' ? 12 + indent * INDENT : 12,
    textAlign: align, fontSize: 12, borderBottom: '1px solid var(--card-border-color)',
  }),
  tdGroup: (align: 'left' | 'right' = 'left', indent = 0): React.CSSProperties => ({
    padding: '6px 12px', paddingLeft: align === 'left' ? 12 + indent * INDENT : 12,
    textAlign: align, fontSize: 12, fontWeight: 700,
    background: 'var(--card-muted-bg-color)', borderBottom: '1px solid var(--card-border-color)',
    borderLeft: indent === 0 ? '3px solid var(--card-border-color)' : '2px solid var(--card-border-color)',
  }),
  sectionHead: (): React.CSSProperties => ({
    padding: '10px 12px 4px', fontSize: 13, fontWeight: 700,
    borderBottom: '1px solid var(--card-border-color)',
    background: 'transparent',
  }),
  total: (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '6px 12px', textAlign: align, fontSize: 12, fontWeight: 700,
    background: 'var(--card-muted-bg-color)',
    borderTop: '2px solid var(--card-border-color)', borderBottom: '2px solid var(--card-border-color)',
  }),
}

// ── localStorage handoff (from FiscalYearListPane) ──────────────────────────

const FS_FILTER_KEY = 'fs:periodFilter'

function getInitialFSPeriod() {
  try {
    const raw = localStorage.getItem(FS_FILTER_KEY)
    if (raw) {
      localStorage.removeItem(FS_FILTER_KEY)
      const h = JSON.parse(raw) as { from: string; to: string; activeId: string }
      if (h.from || h.to) return { from: h.from, to: h.to, activeId: h.activeId || '' }
    }
  } catch {}
  return { from: '', to: '', activeId: '' }
}

const TAB_TO_PARAM = { trial: 'trial-balance', income: 'income-statement', balance: 'balance-sheet' } as const
const PARAM_TO_TAB: Record<string, 'trial' | 'income' | 'balance'> = {
  'trial-balance': 'trial', 'income-statement': 'income', 'balance-sheet': 'balance',
}

function getInitialFSFromURL(): {
  fyYear: string
  tab:    'trial' | 'income' | 'balance' | null
  lang:   'th' | 'en' | null
  depth:  string | null
} {
  try {
    const p = new URLSearchParams(window.location.search)
    const langRaw = p.get('lang')
    return {
      fyYear: p.get('fy') ?? '',
      tab:    PARAM_TO_TAB[p.get('type') ?? ''] ?? null,
      lang:   langRaw === 'en' ? 'en' : langRaw === 'th' ? 'th' : null,
      depth:  p.get('depth'),
    }
  } catch {
    return { fyYear: '', tab: null, lang: null, depth: null }
  }
}

// ── Main Component ──────────────────────────────────────────────────────────

export function FinancialStatementView(_props: any) {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const fyYears = useFiscalYears()

  const [initURL] = useState(getInitialFSFromURL)

  const [lang, setLang] = useState<'th' | 'en'>(initURL.lang ?? 'th')
  const [tab,  setTab]  = useState<'trial' | 'income' | 'balance'>(initURL.tab ?? 'trial')

  const [{ from: initFrom, to: initTo, activeId: initActiveId }] = useState(getInitialFSPeriod)
  const [activeId,     setActiveId]     = useState(initActiveId)
  const [from,         setFrom]         = useState(initFrom)
  const [to,           setTo]           = useState(initTo)
  const [leafOnly,     setLeafOnly]     = useState<boolean>(initURL.depth === 'leaf')
  const [targetFyYear, setTargetFyYear] = useState(initURL.fyYear)
  const [loading,        setLoading]        = useState(false)
  const [accounts,       setAccounts]       = useState<LedgerAccount[]>([])
  const [balances,       setBalances]       = useState<Map<string, Balance>>(new Map())  // cumulative: BF + all txns up to 'to'
  const [incomeBalances, setIncomeBalances] = useState<Map<string, Balance>>(new Map())  // period only: txns from → to, no BF
  const [regCapData,     setRegCapData]     = useState<{ amount: number | null; accountIds: Set<string> }>({ amount: null, accountIds: new Set() })
  const [supportingDocs, setSupportingDocs] = useState<SupportingDoc[]>([])
  const [hoveredDoc,     setHoveredDoc]     = useState<string | null>(null)

  // Resolve ?fy=YYYY → activeId once fyYears has loaded
  // (skipped if localStorage handoff already pre-set activeId)
  useEffect(() => {
    if (!targetFyYear || activeId || fyYears.length === 0) return
    const match = fyYears.find(fy => fy.from.startsWith(targetFyYear))
    if (match) { setActiveId(match.id); setFrom(match.from); setTo(match.to) }
    setTargetFyYear('')
  }, [fyYears, targetFyYear, activeId])

  // Sync filter state → URL query params (no page reload, no defaults written)
  useEffect(() => {
    try {
      const p = new URLSearchParams()
      const fyMatch = fyYears.find(fy => fy.id === activeId)
      if (fyMatch)         p.set('fy',    fyMatch.from.slice(0, 4))
      if (tab !== 'trial') p.set('type',  TAB_TO_PARAM[tab])
      if (lang !== 'th')   p.set('lang',  lang)
      if (leafOnly)        p.set('depth', 'leaf')
      const qs  = p.toString()
      const url = qs
        ? `${window.location.pathname}?${qs}${window.location.hash}`
        : `${window.location.pathname}${window.location.hash}`
      window.history.replaceState(null, '', url)
    } catch {}
  }, [activeId, tab, lang, leafOnly, fyYears])

  const load = useCallback(async () => {
    if (!from && !to) {
      setAccounts([])
      setBalances(new Map())
      setIncomeBalances(new Map())
      return
    }
    setLoading(true)
    try {
      const [ledgers, txns, bsTxns, regCap] = await Promise.all([
        client.fetch<LedgerAccount[]>(QUERY_LEDGERS),
        client.fetch<{ lines: TxLine[] | null }[]>(QUERY_TXNS,    { from: from || '', to: to || '' }),
        client.fetch<{ lines: TxLine[] | null }[]>(QUERY_BS_TXNS, { to: to || '' }),
        client.fetch<{ latest?: { newRegisteredCapital?: number }; accountIds?: string[] }>(QUERY_REG_CAP, {}),
      ])

      const buildAgg = (source: { lines: TxLine[] | null }[]) => {
        const agg: Record<string, { dr: number; cr: number }> = {}
        for (const tx of source) {
          for (const ln of tx.lines ?? []) {
            if (!ln?.accountId) continue
            if (!agg[ln.accountId]) agg[ln.accountId] = { dr: 0, cr: 0 }
            agg[ln.accountId].dr += ln.debitAmount
            agg[ln.accountId].cr += ln.creditAmount
          }
        }
        return agg
      }

      const buildBalances = (
        agg: Record<string, { dr: number; cr: number }>,
        includeBF: boolean,
      ) => {
        const bal = new Map<string, Balance>()
        for (const a of ledgers) {
          if (a.isParent) continue
          const txDr = agg[a.accountId]?.dr ?? 0
          const txCr = agg[a.accountId]?.cr ?? 0
          const dr   = (includeBF ? a.bfDebit  : 0) + txDr
          const cr   = (includeBF ? a.bfCredit : 0) + txCr
          const isDebitNormal = a.normalBalance !== 'credit'
          bal.set(a.accountId, { dr, cr, net: isDebitNormal ? dr - cr : cr - dr })
        }
        const byDepth = [...ledgers].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))
        for (const a of byDepth) {
          if (!a.isParent) continue
          const children = ledgers.filter(c => c.parentAccountId === a.accountId)
          let sumDr = 0, sumCr = 0
          for (const c of children) {
            const cb = bal.get(c.accountId)
            if (cb) { sumDr += cb.dr; sumCr += cb.cr }
          }
          const isDebitNormal = a.normalBalance !== 'credit'
          bal.set(a.accountId, { dr: sumDr, cr: sumCr, net: isDebitNormal ? sumDr - sumCr : sumCr - sumDr })
        }
        return bal
      }

      setAccounts(ledgers)
      setRegCapData({
        amount:     regCap?.latest?.newRegisteredCapital ?? null,
        accountIds: new Set((regCap?.accountIds ?? []).filter(Boolean)),
      })
      // Balance Sheet & Trial Balance: BF + ALL posted txns up to 'to' (no from filter)
      setBalances(buildBalances(buildAgg(bsTxns), true))
      // Income Statement: period txns (from → to) only, no BF (revenue/expense are reset each period)
      setIncomeBalances(buildBalances(buildAgg(txns), false))
    } finally {
      setLoading(false)
    }
  }, [from, to, client]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    client
      .fetch<{ docs: SupportingDoc[] } | null>(
        `*[_type == "financialStatement" && !(_id in path("drafts.**"))][0] {
          "docs": supportingDocs[] | order(uploadedAt desc) {
            _key, label, fiscalYearLabel, uploadedAt, notes,
            "fileUrl":  file.asset->url,
            "fileName": file.asset->originalFilename
          }
        }`
      )
      .then(data => setSupportingDocs(data?.docs ?? []))
      .catch(() => {})
  }, [client])

  const name = (a: LedgerAccount) =>
    lang === 'th' ? (a.nameTh || a.nameEn) : (a.nameEn || a.nameTh)

  const acctLink = (a: LedgerAccount, children: React.ReactNode) => {
    const saveFilter = () => {
      if (from || to) {
        localStorage.setItem('gl:periodFilter', JSON.stringify({ from, to, activeId }))
      }
    }
    return (
      <IntentLink intent="edit" params={{ id: a._id, type: 'ledger' }}
        style={{ color: 'var(--card-link-fg-color, #2276fc)', textDecoration: 'none' }}
        onClick={saveFilter}
      >
        {children}
        <span style={{ marginLeft: 5, opacity: 0.5, fontSize: 9, verticalAlign: 'middle' }}>↗</span>
      </IntentLink>
    )
  }

  // ── CSV Export ───────────────────────────────────────────────────────────

  const periodLabel = [from, to].filter(Boolean).join('_to_') || 'all'

  const exportTrialBalance = () => {
    const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense']
    const out: string[][] = [['Code', 'Account Name', 'Debit (THB)', 'Credit (THB)']]
    let grandDr = 0, grandCr = 0

    for (const type of TYPES) {
      const typeAccts = accounts.filter(a => a.type === type)
      if (!typeAccts.length) continue
      out.push(['', `--- ${TYPE_NAME[type]} ---`, '', ''])
      let typeDr = 0, typeCr = 0

      for (const a of typeAccts) {
        const b = balances.get(a.accountId); if (!b) continue
        if (leafOnly && a.isParent) continue
        const isDebitNormal = a.normalBalance !== 'credit'
        const drBal = isDebitNormal ? Math.max(b.net, 0)  : Math.max(-b.net, 0)
        const crBal = isDebitNormal ? Math.max(-b.net, 0) : Math.max(b.net, 0)
        if (!a.isParent) { typeDr += drBal; typeCr += crBal }
        out.push([a.code, name(a), drBal > 0 ? String(drBal) : '', crBal > 0 ? String(crBal) : ''])
      }
      out.push(['', TYPE_SUBTOTAL[type] ?? '', String(typeDr), String(typeCr)])
      grandDr += typeDr; grandCr += typeCr
    }
    out.push(['', 'Grand Total', String(grandDr), String(grandCr)])
    downloadCSV(toCSV(out), `trial-balance_${periodLabel}.csv`)
  }

  const exportIncomeStatement = () => {
    const out: string[][] = [['Code', 'Account Name', 'Amount (THB)']]
    const revenueAccts = accounts.filter(a => a.type === 'revenue')
    const expenseAccts = accounts.filter(a => a.type === 'expense')

    out.push(['', '--- Revenue ---', ''])
    for (const a of revenueAccts) {
      const b = incomeBalances.get(a.accountId); if (!b) continue
      if (leafOnly && a.isParent) continue
      out.push([a.code, name(a), b.net !== 0 ? String(b.net) : ''])
    }
    const totalRevenue = revenueAccts.filter(a => !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0)
    out.push(['', 'Total Revenue', String(totalRevenue)])

    out.push(['', '--- Expenses ---', ''])
    for (const a of expenseAccts) {
      const b = incomeBalances.get(a.accountId); if (!b) continue
      if (leafOnly && a.isParent) continue
      out.push([a.code, name(a), b.net !== 0 ? String(b.net) : ''])
    }
    const totalExpense = expenseAccts.filter(a => !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0)
    out.push(['', 'Total Expenses', String(totalExpense)])
    out.push(['', totalRevenue - totalExpense >= 0 ? 'Net Profit' : 'Net Loss', String(Math.abs(totalRevenue - totalExpense))])
    downloadCSV(toCSV(out), `income-statement_${periodLabel}.csv`)
  }

  const exportBalanceSheet = () => {
    const out: string[][] = [['Code', 'Account Name', 'Amount (THB)']]
    const assetAccts   = accounts.filter(a => a.type === 'asset')
    const liabAccts    = accounts.filter(a => a.type === 'liability')
    const equityAccts  = accounts.filter(a => a.type === 'equity')
    const paidUpEquity = equityAccts.filter(a => !regCapData.accountIds.has(a.accountId))

    const bsSum = (accts: LedgerAccount[], catDrNormal: boolean) =>
      accts.filter(a => !a.isParent).reduce((s, a) => {
        const net = balances.get(a.accountId)?.net ?? 0
        return s + (a.normalBalance !== 'credit' !== catDrNormal ? -net : net)
      }, 0)

    const addSection = (label: string, accts: LedgerAccount[], catDrNormal: boolean, total: number) => {
      out.push(['', `--- ${label} ---`, ''])
      for (const a of accts) {
        const b = balances.get(a.accountId); if (!b) continue
        if (leafOnly && a.isParent) continue
        const isContra = (a.normalBalance !== 'credit') !== catDrNormal
        const amt = isContra ? -b.net : b.net
        out.push([a.code, name(a), amt !== 0 ? String(amt) : ''])
      }
      out.push(['', `Total ${label}`, String(total)])
    }

    addSection('Assets',      assetAccts,   true,  bsSum(assetAccts, true))
    addSection('Liabilities', liabAccts,    false, bsSum(liabAccts, false))
    addSection('Equity',      paidUpEquity, false, bsSum(paidUpEquity, false))

    const netIncome =
      accounts.filter(a => a.type === 'revenue' && !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0) -
      accounts.filter(a => a.type === 'expense' && !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0)
    out.push(['', '--- Net Income ---', ''])
    out.push(['', netIncome >= 0 ? 'Net Profit' : 'Net Loss', String(Math.abs(netIncome))])
    out.push(['', 'Total Liabilities & Equity', String(bsSum(liabAccts, false) + bsSum(paidUpEquity, false) + netIncome)])
    downloadCSV(toCSV(out), `balance-sheet_${to || 'all'}.csv`)
  }

  const exportCurrentTab = () => {
    if (tab === 'trial')  exportTrialBalance()
    else if (tab === 'income') exportIncomeStatement()
    else exportBalanceSheet()
  }

  // ── PDF Export ────────────────────────────────────────────────────────────

  const printPDF = () => {
    const esc = (s: string | null | undefined) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const tabLabel = tab === 'trial' ? 'Trial Balance' : tab === 'income' ? 'Income Statement' : 'Balance Sheet'
    const tabSlug  = tab === 'trial' ? 'trial-balance' : tab === 'income' ? 'income-statement' : 'balance-sheet'

    const activeFY   = fyYears.find(fy => fy.id === activeId)
    const fySlug     = activeFY ? activeFY.label.replace(/\s+/g, '') : (to ? to.replace(/-/g, '') : 'all')
    const filename   = `financial-statement-${tabSlug}-${fySlug}.pdf`

    const periodStr  = activeFY ? activeFY.label : [from, to].filter(Boolean).join(' – ') || 'All periods'
    const todayStr   = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const langStr    = lang === 'th' ? 'ไทย' : 'English'
    const depthStr   = leafOnly ? 'Leaf Only' : 'All Levels'

    const IND = 16  // px indent per depth level

    const thSt  = (align = 'left') => `background:#f0f0f0;padding:5px 9px;text-align:${align};font-size:9px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #bbb;white-space:nowrap;font-weight:700;`
    const tdSt  = (align = 'left', indent = 0) => `padding:4px 9px;padding-left:${9 + indent * IND}px;text-align:${align};font-size:10px;border-bottom:1px solid #eee;`
    const grpSt = (indent = 0) => `padding:5px 9px;padding-left:${9 + indent * IND}px;font-size:10px;font-weight:700;background:#f5f5f5;border-bottom:1px solid #ddd;border-left:${indent === 0 ? '3px' : '2px'} solid #bbb;`
    const totSt = (align = 'left') => `padding:5px 9px;text-align:${align};font-size:10px;font-weight:700;background:#f5f5f5;border-top:2px solid #bbb;border-bottom:2px solid #bbb;`
    const gndSt = (align = 'left') => `padding:6px 9px;text-align:${align};font-size:11px;font-weight:700;background:#ececec;border-top:3px double #999;border-bottom:3px double #999;`
    const secSt = () => `padding:8px 9px 3px;font-size:11px;font-weight:700;border-bottom:1px solid #ddd;`

    // ── Trial Balance ──────────────────────────────────────────────────────
    const buildTrialHTML = () => {
      const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense']
      const SUB: Record<string, string> = {
        asset: 'Total Assets', liability: 'Total Liabilities',
        equity: "Total Shareholders' Equity", revenue: 'Total Revenue', expense: 'Total Expenses',
      }
      let grandDr = 0, grandCr = 0
      let rows = `<tr><th style="${thSt()}">Account</th><th style="${thSt('right')}">Debit (Dr)</th><th style="${thSt('right')}">Credit (Cr)</th></tr>`

      for (const type of TYPES) {
        const typeAccts = accounts.filter(a => a.type === type)
        if (!typeAccts.length) continue
        let typeDr = 0, typeCr = 0
        rows += `<tr><td colspan="3" style="${secSt()}">${esc(TYPE_LABEL[type] ?? type)}</td></tr>`

        for (const a of typeAccts) {
          const b = balances.get(a.accountId); if (!b) continue
          if (leafOnly && a.isParent) continue
          const isDebitNormal = a.normalBalance !== 'credit'
          const drBal = isDebitNormal ? Math.max(b.net, 0)  : Math.max(-b.net, 0)
          const crBal = isDebitNormal ? Math.max(-b.net, 0) : Math.max(b.net, 0)
          if (!a.isParent) { typeDr += drBal; typeCr += crBal }
          const st = a.isParent ? grpSt(a.depth) : tdSt('left', a.depth)
          rows += `<tr>
            <td style="${st}"><span style="font-family:monospace">${esc(a.code)}</span> · <span style="color:#666">${esc(name(a))}</span></td>
            <td style="${a.isParent ? grpSt() + 'text-align:right;' : tdSt('right')}">${drBal > 0 ? esc(fmt(drBal)) : '—'}</td>
            <td style="${a.isParent ? grpSt() + 'text-align:right;' : tdSt('right')}">${crBal > 0 ? esc(fmt(crBal)) : '—'}</td>
          </tr>`
        }

        rows += `<tr>
          <td style="${totSt()}">${esc(SUB[type] ?? type)}</td>
          <td style="${totSt('right')}">${esc(fmt(typeDr))}</td>
          <td style="${totSt('right')}">${esc(fmt(typeCr))}</td>
        </tr>`
        grandDr += typeDr; grandCr += typeCr

        if (type === 'equity') {
          rows += `<tr>
            <td style="${totSt()};font-style:italic">Total Liabilities &amp; Shareholders' Equity</td>
            <td style="${totSt('right')}">${esc(fmt(grandDr))}</td>
            <td style="${totSt('right')}">${esc(fmt(grandCr))}</td>
          </tr>`
        }
      }

      const balanced = Math.abs(grandDr - grandCr) < 0.01
      rows += `<tr>
        <td style="${gndSt()}">Grand Total</td>
        <td style="${gndSt('right')}">${esc(fmt(grandDr))}</td>
        <td style="${gndSt('right')}">${esc(fmt(grandCr))}</td>
      </tr>
      <tr><td colspan="3" style="padding:6px 9px;text-align:center;font-size:10px;font-weight:600;color:${balanced ? 'green' : 'red'}">
        ${balanced ? '✓ Trial balance is balanced' : `⚠ Out of balance by ${esc(fmt(Math.abs(grandDr - grandCr)))}`}
      </td></tr>`
      return rows
    }

    // ── Income Statement ───────────────────────────────────────────────────
    const buildIncomeHTML = () => {
      const revenueAccts = accounts.filter(a => a.type === 'revenue')
      const expenseAccts = accounts.filter(a => a.type === 'expense')
      const totalRevenue = revenueAccts.filter(a => !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0)
      const totalExpense = expenseAccts.filter(a => !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0)
      const netIncome    = totalRevenue - totalExpense

      const renderSec = (accts: LedgerAccount[]) => accts.map(a => {
        const b = incomeBalances.get(a.accountId); if (!b) return ''
        if (leafOnly && a.isParent) return ''
        const st = a.isParent ? grpSt(a.depth) : tdSt('left', a.depth)
        return `<tr>
          <td style="${st}"><span style="font-family:monospace;margin-right:6px">${esc(a.code)}</span><span style="color:#666">${esc(name(a))}</span></td>
          <td style="${a.isParent ? grpSt() + 'text-align:right;' : tdSt('right')}">${b.net !== 0 ? esc(fmt(b.net)) : '—'}</td>
        </tr>`
      }).join('')

      let rows = `<tr><th style="${thSt()}">Account</th><th style="${thSt('right')}">Amount (THB)</th></tr>`
      rows += `<tr><td colspan="2" style="${secSt()}">💰 Revenue</td></tr>`
      rows += renderSec(revenueAccts)
      rows += `<tr><td style="${totSt()}">Total Revenue</td><td style="${totSt('right')}">${esc(fmt(totalRevenue))}</td></tr>`
      rows += `<tr><td colspan="2" style="${secSt()};padding-top:14px">💸 Expenses</td></tr>`
      rows += renderSec(expenseAccts)
      rows += `<tr><td style="${totSt()}">Total Expenses</td><td style="${totSt('right')}">${esc(fmt(totalExpense))}</td></tr>`
      rows += `<tr style="background:${netIncome >= 0 ? 'rgba(0,160,0,0.08)' : 'rgba(200,0,0,0.08)'}">
        <td style="${gndSt()}">${netIncome >= 0 ? '✅ Net Profit' : '⚠️ Net Loss'}</td>
        <td style="${gndSt('right')}">${esc(fmt(Math.abs(netIncome)))}</td>
      </tr>`
      return rows
    }

    // ── Balance Sheet ──────────────────────────────────────────────────────
    const buildBalanceHTML = () => {
      const assetAccts  = accounts.filter(a => a.type === 'asset')
      const liabAccts   = accounts.filter(a => a.type === 'liability')
      const equityAccts = accounts.filter(a => a.type === 'equity')
      const regCapAccts  = equityAccts.filter(a => regCapData.accountIds.has(a.accountId))
      const paidUpEquity = equityAccts.filter(a => !regCapData.accountIds.has(a.accountId))

      const sum = (accts: LedgerAccount[], catDr: boolean) =>
        accts.filter(a => !a.isParent).reduce((s, a) => {
          const net = balances.get(a.accountId)?.net ?? 0
          return s + ((a.normalBalance !== 'credit') !== catDr ? -net : net)
        }, 0)

      const totalAssets = sum(assetAccts, true)
      const totalLiab   = sum(liabAccts, false)
      const totalEquity = sum(paidUpEquity, false)
      const netIncome   =
        accounts.filter(a => a.type === 'revenue' && !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0) -
        accounts.filter(a => a.type === 'expense' && !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0)
      const totalLE   = totalLiab + totalEquity + netIncome
      const balanced  = Math.abs(totalAssets - totalLE) < 0.01

      const renderSec = (accts: LedgerAccount[], catDr: boolean) => accts.map(a => {
        const b = balances.get(a.accountId); if (!b) return ''
        if (leafOnly && a.isParent) return ''
        const isContra  = (a.normalBalance !== 'credit') !== catDr
        const displayAmt = isContra ? -b.net : b.net
        const st = a.isParent ? grpSt(a.depth) : tdSt('left', a.depth)
        return `<tr>
          <td style="${st}"><span style="font-family:monospace">${esc(a.code)}</span> · <span style="color:#666">${esc(name(a))}</span></td>
          <td style="${a.isParent ? grpSt() + 'text-align:right;' : tdSt('right')}">${displayAmt !== 0 ? esc(fmt(displayAmt)) : '—'}</td>
        </tr>`
      }).join('')

      let rows = `<tr><th style="${thSt()}">Account</th><th style="${thSt('right')}">Amount (THB)</th></tr>`

      rows += `<tr><td colspan="2" style="${secSt()}">🏦 Assets</td></tr>`
      rows += renderSec(assetAccts, true)
      rows += `<tr><td style="${totSt()}">Total Assets</td><td style="${totSt('right')}">${esc(fmt(totalAssets))}</td></tr>`

      rows += `<tr><td colspan="2" style="${secSt()};padding-top:14px">📋 Liabilities</td></tr>`
      rows += renderSec(liabAccts, false)
      rows += `<tr><td style="${totSt()}">Total Liabilities</td><td style="${totSt('right')}">${esc(fmt(totalLiab))}</td></tr>`

      rows += `<tr><td colspan="2" style="${secSt()};padding-top:14px">📊 Equity</td></tr>`
      rows += renderSec(paidUpEquity, false)
      rows += `<tr><td style="${totSt()}">Total Equity</td><td style="${totSt('right')}">${esc(fmt(totalEquity))}</td></tr>`

      if (regCapAccts.length > 0 || regCapData.amount != null) {
        rows += `<tr><td colspan="2" style="${tdSt()};padding-top:10px;font-size:9px;font-style:italic;color:#888">ทุนจดทะเบียน · Authorised Capital — DBD (disclosure only, not in equity total)</td></tr>`
        if (regCapAccts.length > 0) {
          rows += regCapAccts.map(a => {
            const b = balances.get(a.accountId); if (!b) return ''
            const displayAmt = (a.normalBalance !== 'credit') ? -b.net : b.net
            return `<tr style="opacity:.65"><td style="${tdSt('left', 1)};font-style:italic;color:#888">${esc(a.code)} · ${esc(name(a))}</td><td style="${tdSt('right')};font-style:italic;color:#888">${displayAmt !== 0 ? esc(fmt(displayAmt)) : '—'}</td></tr>`
          }).join('')
        } else if (regCapData.amount != null) {
          rows += `<tr style="opacity:.65"><td style="${tdSt('left', 1)};font-style:italic;color:#888">ทุนจดทะเบียน (from Funding record)</td><td style="${tdSt('right')};font-style:italic;color:#888">${esc(fmt(regCapData.amount))}</td></tr>`
        }
      }

      rows += `<tr><td colspan="2" style="${secSt()};padding-top:14px">📈 Net Income (current period)</td></tr>`
      rows += `<tr><td style="${tdSt('left', 1)}">${netIncome >= 0 ? 'Net Profit' : 'Net Loss'}</td><td style="${tdSt('right')}">${esc(fmt(Math.abs(netIncome)))}</td></tr>`
      rows += `<tr><td style="${totSt()};font-style:italic">Total Liabilities &amp; Shareholders' Equity</td><td style="${totSt('right')}">${esc(fmt(totalLE))}</td></tr>`
      rows += `<tr style="background:${balanced ? 'rgba(0,160,0,0.08)' : 'rgba(200,0,0,0.08)'}"><td colspan="2" style="padding:6px 9px;text-align:center;font-size:10px;font-weight:600;color:${balanced ? 'green' : 'red'}">
        ${balanced ? `✓ Balance sheet balances (Assets ${esc(fmt(totalAssets))} = L+E+NI ${esc(fmt(totalLE))})` : `⚠ Out of balance by ${esc(fmt(Math.abs(totalAssets - totalLE)))}`}
      </td></tr>`
      return rows
    }

    const tableRows = tab === 'trial' ? buildTrialHTML() : tab === 'income' ? buildIncomeHTML() : buildBalanceHTML()

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${esc(tabLabel)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', Arial, sans-serif; font-size: 10px; color: #111; padding: 20px; }
  h1   { font-size: 15px; font-weight: 700; margin-bottom: 3px; }
  .meta { font-size: 9.5px; color: #555; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  @media print { @page { size: A4 portrait; margin: 12mm; } body { padding: 0; } }
</style>
</head><body>
  <h1>${esc(tabLabel)}</h1>
  <div class="meta">
    Period: ${esc(periodStr)} &nbsp;·&nbsp;
    Language: ${esc(langStr)} &nbsp;·&nbsp;
    Depth: ${esc(depthStr)} &nbsp;·&nbsp;
    Generated: ${esc(todayStr)}
  </div>
  <table><tbody>${tableRows}</tbody></table>
</body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.document.title = filename; win.print() }, 400)
  }

  // ── Trial Balance ─────────────────────────────────────────────────────────

  const renderTrialBalance = () => {
    let grandDr = 0, grandCr = 0
    const rows: React.ReactNode[] = []

    // Group accounts by type so we can add subtotal rows
    const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense']
    const TYPE_SUBTOTAL: Record<string, string> = {
      asset:     'Total Assets',
      liability: 'Total Liabilities',
      equity:    "Total Shareholders' Equity",
      revenue:   'Total Revenue',
      expense:   'Total Expenses',
    }

    for (const type of TYPES) {
      const typeAccts = accounts.filter(a => a.type === type)
      if (typeAccts.length === 0) continue

      let typeDr = 0, typeCr = 0
      rows.push(
        <tr key={`hd-${type}`}>
          <td colSpan={3} style={S.sectionHead()}>{TYPE_LABEL[type] ?? type}</td>
        </tr>
      )

      for (const a of typeAccts) {
        const b = balances.get(a.accountId)
        if (!b) continue
        if (leafOnly && a.isParent) continue
        const isDebitNormal = a.normalBalance !== 'credit'
        const drBal = isDebitNormal ? Math.max(b.net, 0)  : Math.max(-b.net, 0)
        const crBal = isDebitNormal ? Math.max(-b.net, 0) : Math.max(b.net, 0)

        if (!a.isParent) { typeDr += drBal; typeCr += crBal }

        rows.push(
          <tr key={a._id}>
            <td style={a.isParent ? S.tdGroup('left', a.depth) : S.td('left', a.depth)}>
              {acctLink(a, <>
                <span style={{ fontFamily: 'monospace' }}>{a.code}</span>
                <span style={{ margin: '0 6px', color: 'var(--card-border-color)' }}>·</span>
                <span style={{ color: a.isParent ? undefined : 'var(--card-muted-fg-color)' }}>{name(a)}</span>
              </>)}
            </td>
            <td style={a.isParent ? S.tdGroup('right') : S.td('right')}>
              {drBal > 0 ? fmt(drBal) : '—'}
            </td>
            <td style={a.isParent ? S.tdGroup('right') : S.td('right')}>
              {crBal > 0 ? fmt(crBal) : '—'}
            </td>
          </tr>
        )
      }

      // Subtotal row for this type
      rows.push(
        <tr key={`sub-${type}`} style={{ background: 'var(--card-muted-bg-color)' }}>
          <td style={{ ...S.total(), borderTop: '2px solid var(--card-border-color)' }}>
            {TYPE_SUBTOTAL[type]}
          </td>
          <td style={{ ...S.total('right'), borderTop: '2px solid var(--card-border-color)' }}>
            {fmt(typeDr)}
          </td>
          <td style={{ ...S.total('right'), borderTop: '2px solid var(--card-border-color)' }}>
            {fmt(typeCr)}
          </td>
        </tr>
      )

      grandDr += typeDr
      grandCr += typeCr

      // Extra combined row after Equity: Liabilities & Shareholders' Equity
      if (type === 'equity') {
        const liabDrBal = accounts
          .filter(a => a.type === 'liability' && !a.isParent)
          .reduce((s, a) => {
            const b = balances.get(a.accountId)
            if (!b) return s
            return s + Math.max(-b.net, 0) // liabilities are credit-normal so dr = abnormal
          }, 0)
        const liabCrBal = accounts
          .filter(a => a.type === 'liability' && !a.isParent)
          .reduce((s, a) => {
            const b = balances.get(a.accountId)
            if (!b) return s
            return s + Math.max(b.net, 0)
          }, 0)
        // Already accumulated: liability subtotal was typeDr/typeCr for 'liability' pass
        // Re-compute combined L+E from running grand totals so far
        rows.push(
          <tr key="combined-le" style={{ background: 'var(--card-muted-bg-color)', borderTop: '2px solid var(--card-border-color)' }}>
            <td style={{ ...S.total(), fontStyle: 'italic' }}>
              Total Liabilities &amp; Shareholders&apos; Equity
            </td>
            <td style={S.total('right')}>{fmt(grandDr)}</td>
            <td style={S.total('right')}>{fmt(grandCr)}</td>
          </tr>
        )
      }
    }

    const balanced = Math.abs(grandDr - grandCr) < 0.01
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th()}>Account</th>
              <th style={S.th('right')}>Debit (Dr)</th>
              <th style={S.th('right')}>Credit (Cr)</th>
            </tr>
          </thead>
          <tbody>
            {rows}
            <tr>
              <td style={{ ...S.total(), borderTop: '3px double var(--card-border-color)', fontSize: 13 }}>Grand Total</td>
              <td style={{ ...S.total('right'), borderTop: '3px double var(--card-border-color)', fontSize: 13 }}>{fmt(grandDr)}</td>
              <td style={{ ...S.total('right'), borderTop: '3px double var(--card-border-color)', fontSize: 13 }}>{fmt(grandCr)}</td>
            </tr>
            <tr>
              <td colSpan={3} style={{
                padding: '6px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600,
                color: balanced ? 'var(--card-positive-fg-color, green)' : 'var(--card-critical-fg-color, red)',
              }}>
                {balanced ? '✓ Trial balance is balanced' : `⚠ Out of balance by ${fmt(Math.abs(grandDr - grandCr))}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // ── Income Statement ──────────────────────────────────────────────────────

  const renderIncomeStatement = () => {
    const revenueAccts = accounts.filter(a => a.type === 'revenue')
    const expenseAccts = accounts.filter(a => a.type === 'expense')

    const totalRevenue = revenueAccts
      .filter(a => !a.isParent)
      .reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0)

    const totalExpense = expenseAccts
      .filter(a => !a.isParent)
      .reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0)

    const netIncome = totalRevenue - totalExpense

    const renderSection = (accts: LedgerAccount[]) =>
      accts.map(a => {
        const b = incomeBalances.get(a.accountId)
        if (!b) return null
        if (leafOnly && a.isParent) return null
        const isAbnormal = b.net < 0
        return (
          <tr key={a._id}>
            <td style={a.isParent ? S.tdGroup('left', a.depth) : S.td('left', a.depth)}>
              {acctLink(a, <>
                <span style={{ fontFamily: 'monospace', marginRight: 8 }}>{a.code}</span>
                <span style={{ color: a.isParent ? undefined : 'var(--card-muted-fg-color)' }}>{name(a)}</span>
              </>)}
            </td>
            <td style={{
              ...(a.isParent ? S.tdGroup('right') : S.td('right')),
              ...(isAbnormal ? { color: 'var(--card-critical-fg-color, #c0392b)', fontStyle: 'italic' } : {}),
            }}>
              {b.net !== 0 ? fmt(b.net) : '—'}
            </td>
          </tr>
        )
      })

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th()}>Account</th>
              <th style={S.th('right')}>Amount (THB)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={2} style={S.sectionHead()}>💰 Revenue</td></tr>
            {renderSection(revenueAccts)}
            <tr>
              <td style={S.total()}>Total Revenue</td>
              <td style={S.total('right')}>{fmt(totalRevenue)}</td>
            </tr>

            <tr><td colSpan={2} style={{ ...S.sectionHead(), paddingTop: 16 }}>💸 Expenses</td></tr>
            {renderSection(expenseAccts)}
            <tr>
              <td style={S.total()}>Total Expenses</td>
              <td style={S.total('right')}>{fmt(totalExpense)}</td>
            </tr>

            <tr style={{ background: netIncome >= 0 ? 'rgba(0,160,0,0.08)' : 'rgba(200,0,0,0.08)' }}>
              <td style={{ ...S.total(), fontSize: 13, borderTop: '3px double var(--card-border-color)' }}>
                {netIncome >= 0 ? '✅ Net Profit' : '⚠️ Net Loss'}
              </td>
              <td style={{ ...S.total('right'), fontSize: 13, borderTop: '3px double var(--card-border-color)' }}>
                {fmt(Math.abs(netIncome))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // ── Balance Sheet ─────────────────────────────────────────────────────────

  const renderBalanceSheet = () => {
    const assetAccts  = accounts.filter(a => a.type === 'asset')
    const liabAccts   = accounts.filter(a => a.type === 'liability')
    const equityAccts = accounts.filter(a => a.type === 'equity')
    // Accounts that received credits from capital_register Fundings = disclosure-only, excluded from equity total
    const regCapAccts  = equityAccts.filter(a => regCapData.accountIds.has(a.accountId))
    const paidUpEquity = equityAccts.filter(a => !regCapData.accountIds.has(a.accountId))

    // catIsDebitNormal: assets = true, liabilities/equity = false
    // Contra accounts (opposite direction to category, e.g. Acc. Depreciation in Assets)
    // have their net subtracted from the section total.
    const sum = (accts: LedgerAccount[], catIsDebitNormal: boolean) =>
      accts.filter(a => !a.isParent).reduce((s, a) => {
        const net = balances.get(a.accountId)?.net ?? 0
        const acctIsDebitNormal = a.normalBalance !== 'credit'
        return s + (acctIsDebitNormal !== catIsDebitNormal ? -net : net)
      }, 0)

    const totalAssets = sum(assetAccts, true)
    const totalLiab   = sum(liabAccts, false)
    const totalEquity = sum(paidUpEquity, false)

    const netIncome =
      accounts.filter(a => a.type === 'revenue' && !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0) -
      accounts.filter(a => a.type === 'expense' && !a.isParent).reduce((s, a) => s + (incomeBalances.get(a.accountId)?.net ?? 0), 0)

    const totalLiabEquity = totalLiab + totalEquity + netIncome
    const balanced        = Math.abs(totalAssets - totalLiabEquity) < 0.01

    // displayAmt: contra accounts (e.g. Acc. Dep.) show as negative in their section.
    // Deficit balances (e.g. negative retained earnings) are already negative in net — shown as-is.
    const renderSection = (accts: LedgerAccount[], catIsDebitNormal: boolean) =>
      accts.map(a => {
        const b = balances.get(a.accountId)
        if (!b) return null
        if (leafOnly && a.isParent) return null
        const acctIsDebitNormal = a.normalBalance !== 'credit'
        const isContra = acctIsDebitNormal !== catIsDebitNormal
        const displayAmt = isContra ? -b.net : b.net
        return (
          <tr key={a._id}>
            <td style={a.isParent ? S.tdGroup('left', a.depth) : S.td('left', a.depth)}>
              {acctLink(a, <>
                <span style={{ fontFamily: 'monospace' }}>{a.code}</span>
                <span style={{ margin: '0 6px', color: 'var(--card-border-color)' }}>·</span>
                <span style={{ color: a.isParent ? undefined : 'var(--card-muted-fg-color)' }}>{name(a)}</span>
              </>)}
            </td>
            <td style={a.isParent ? S.tdGroup('right') : S.td('right')}>
              {displayAmt !== 0 ? fmt(displayAmt) : '—'}
            </td>
          </tr>
        )
      })

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th()}>Account</th>
              <th style={S.th('right')}>Amount (THB)</th>
            </tr>
          </thead>
          <tbody>

            {/* Assets */}
            <tr><td colSpan={2} style={S.sectionHead()}>🏦 Assets</td></tr>
            {renderSection(assetAccts, true)}
            <tr>
              <td style={S.total()}>Total Assets</td>
              <td style={S.total('right')}>{fmt(totalAssets)}</td>
            </tr>

            {/* Liabilities */}
            <tr><td colSpan={2} style={{ ...S.sectionHead(), paddingTop: 16 }}>📋 Liabilities</td></tr>
            {renderSection(liabAccts, false)}
            <tr>
              <td style={S.total()}>Total Liabilities</td>
              <td style={S.total('right')}>{fmt(totalLiab)}</td>
            </tr>

            {/* Equity */}
            <tr><td colSpan={2} style={{ ...S.sectionHead(), paddingTop: 16 }}>📊 Equity</td></tr>

            {renderSection(paidUpEquity, false)}

            <tr>
              <td style={S.total()}>Total Equity</td>
              <td style={S.total('right')}>{fmt(totalEquity)}</td>
            </tr>

            {/* Registered Capital — sourced from Funding (capital_register), disclosure only, NOT in equity total */}
            {(regCapAccts.length > 0 || regCapData.amount != null) && (
              <>
                <tr>
                  <td colSpan={2} style={{ ...S.td('left'), paddingTop: 10, fontSize: 11, fontStyle: 'italic', color: 'var(--card-muted-fg-color)', borderBottom: 'none' }}>
                    ทุนจดทะเบียน · Authorised Capital — DBD registration (disclosure only, not included in equity total)
                  </td>
                </tr>
                {regCapAccts.map(a => {
                  const b = balances.get(a.accountId)
                  if (!b) return null
                  const acctIsDebitNormal = a.normalBalance !== 'credit'
                  const displayAmt = acctIsDebitNormal ? -b.net : b.net
                  return (
                    <tr key={a._id} style={{ opacity: 0.6 }}>
                      <td style={{ ...S.td('left', a.depth), fontStyle: 'italic' }}>
                        {acctLink(a, <>
                          <span style={{ fontFamily: 'monospace' }}>{a.code}</span>
                          <span style={{ margin: '0 6px', color: 'var(--card-border-color)' }}>·</span>
                          <span style={{ color: 'var(--card-muted-fg-color)' }}>{name(a)}</span>
                        </>)}
                      </td>
                      <td style={{ ...S.td('right'), fontStyle: 'italic', color: 'var(--card-muted-fg-color)' }}>
                        {displayAmt !== 0 ? fmt(displayAmt) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {/* If no GL account is linked yet, fall back to showing the Funding amount */}
                {regCapAccts.length === 0 && regCapData.amount != null && (
                  <tr style={{ opacity: 0.6 }}>
                    <td style={{ ...S.td('left', 1), fontStyle: 'italic', color: 'var(--card-muted-fg-color)' }}>
                      ทุนจดทะเบียน (from Funding record)
                    </td>
                    <td style={{ ...S.td('right'), fontStyle: 'italic', color: 'var(--card-muted-fg-color)' }}>
                      {fmt(regCapData.amount)}
                    </td>
                  </tr>
                )}
              </>
            )}

            {/* Net Income */}
            <tr><td colSpan={2} style={{ ...S.sectionHead(), paddingTop: 16 }}>📈 Net Income (current period)</td></tr>
            <tr>
              <td style={S.td('left', 1)}>{netIncome >= 0 ? 'Net Profit' : 'Net Loss'}</td>
              <td style={S.td('right')}>{fmt(Math.abs(netIncome))}</td>
            </tr>

            {/* Total Liabilities & Shareholders' Equity */}
            <tr>
              <td style={{ ...S.total(), borderTop: '3px double var(--card-border-color)', fontStyle: 'italic' }}>
                Total Liabilities &amp; Shareholders&apos; Equity
              </td>
              <td style={{ ...S.total('right'), borderTop: '3px double var(--card-border-color)' }}>
                {fmt(totalLiabEquity)}
              </td>
            </tr>

            {/* Balance check */}
            <tr style={{ background: balanced ? 'rgba(0,160,0,0.08)' : 'rgba(200,0,0,0.08)' }}>
              <td colSpan={2} style={{
                padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600,
                color: balanced ? 'var(--card-positive-fg-color, green)' : 'var(--card-critical-fg-color, red)',
              }}>
                {balanced
                  ? `✓ Balance sheet balances  (Assets ${fmt(totalAssets)} = L+E+NI ${fmt(totalLiabEquity)})`
                  : `⚠ Out of balance by ${fmt(Math.abs(totalAssets - totalLiabEquity))}`}
              </td>
            </tr>

          </tbody>
        </table>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasPeriod = !!(from || to)

  const inputStyle: React.CSSProperties = {
    padding: '5px 10px', borderRadius: 4, fontSize: 12,
    border: '1px solid var(--card-border-color)',
    background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
  }

  return (
    <Card padding={4} tone="default">
      <Stack space={4}>

        {/* ── Supporting Documents compact card — above period filter ── */}
        {supportingDocs.length > 0 && (() => {
          const highlightYear = from ? from.slice(0, 4) : null
          return (
            <Card padding={3} radius={2} border>
              <Stack space={2}>
                <Text size={0} weight="semibold" muted>
                  📎 Supporting Documents ({supportingDocs.length})
                </Text>
                {supportingDocs.map(doc => {
                  const isHighlighted = !!(highlightYear && doc.fiscalYearLabel && doc.fiscalYearLabel.includes(highlightYear))
                  const isHovered     = hoveredDoc === doc._key && !!doc.fileUrl
                  return (
                    <a
                      key={doc._key}
                      href={doc.fileUrl ?? undefined}
                      download={doc.fileUrl ? (doc.fileName ?? true) : undefined}
                      target="_blank"
                      rel="noreferrer"
                      onMouseEnter={() => doc.fileUrl && setHoveredDoc(doc._key)}
                      onMouseLeave={() => setHoveredDoc(null)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        padding: '4px 8px', borderRadius: 3,
                        background: isHighlighted
                          ? 'rgba(34,197,94,0.07)'
                          : isHovered ? 'var(--card-muted-bg-color)' : undefined,
                        border:  `1px solid ${isHighlighted ? 'var(--card-positive-fg-color, #22c55e)' : 'transparent'}`,
                        cursor:  doc.fileUrl ? 'pointer' : 'default',
                        textDecoration: 'none', color: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ fontSize: 10, color: 'var(--card-muted-fg-color)', flexShrink: 0 }}>•</span>
                        <span style={{
                          fontSize: 12, lineHeight: '1.4', flexShrink: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {doc.label}
                        </span>
                        {doc.fiscalYearLabel && (
                          <span style={{
                            fontSize: 10, padding: '1px 5px', borderRadius: 99, flexShrink: 0,
                            background: isHighlighted ? 'rgba(34,197,94,0.18)' : 'var(--card-muted-bg-color)',
                            color: isHighlighted ? 'var(--card-positive-fg-color, #16a34a)' : 'var(--card-muted-fg-color)',
                            fontWeight: isHighlighted ? 700 : 400,
                            border: `1px solid ${isHighlighted ? 'var(--card-positive-fg-color, #22c55e)' : 'var(--card-border-color)'}`,
                          }}>
                            {doc.fiscalYearLabel}
                          </span>
                        )}
                      </div>
                      {doc.fileUrl && (
                        <span style={{
                          fontSize: 11, flexShrink: 0,
                          color: 'var(--card-link-fg-color, #2276fc)',
                        }}>
                          ⬇
                        </span>
                      )}
                    </a>
                  )
                })}
              </Stack>
            </Card>
          )
        })()}

        {/* ── Period filter — always visible ── */}
        <Card padding={3} radius={2} border>
          <Stack space={2}>
            {fyYears.length > 0 && (
              <Flex gap={2} wrap="wrap" align="center">
                <Text size={0} muted>Fiscal Year</Text>
                {fyYears.map(fy => (
                  <Button key={fy.id} text={fy.label}
                    mode={activeId === fy.id ? 'default' : 'ghost'}
                    tone={activeId === fy.id ? 'primary' : 'default'}
                    fontSize={1} padding={2}
                    onClick={() => { setActiveId(fy.id); setFrom(fy.from); setTo(fy.to) }}
                  />
                ))}
              </Flex>
            )}
            <Flex gap={3} align="center" wrap="wrap">
              <Flex align="center" gap={2}>
                <Text size={1} muted>From</Text>
                <input type="date" value={from}
                  onChange={e => { setActiveId(''); setFrom(e.target.value) }}
                  style={inputStyle} />
              </Flex>
              <Flex align="center" gap={2}>
                <Text size={1} muted>To</Text>
                <input type="date" value={to}
                  onChange={e => { setActiveId(''); setTo(e.target.value) }}
                  style={inputStyle} />
              </Flex>
              {(from || to) && (
                <Button mode="ghost" tone="critical" text="Clear" padding={2} fontSize={1}
                  onClick={() => { setActiveId(''); setFrom(''); setTo('') }}
                />
              )}
              {loading && <Spinner muted />}
            </Flex>
          </Stack>
        </Card>

        {/* ── Tab switcher + controls (period selected only) ── */}
        {hasPeriod && (
          <Flex gap={2} justify="space-between" align="center" wrap="wrap">
            <Flex gap={2}>
              {(['trial', 'income', 'balance'] as const).map(t => (
                <Button key={t}
                  mode={tab === t ? 'default' : 'ghost'}
                  tone={tab === t ? 'primary' : 'default'}
                  text={t === 'trial' ? 'Trial Balance' : t === 'income' ? 'Income Statement' : 'Balance Sheet'}
                  onClick={() => setTab(t)}
                  padding={3} fontSize={1}
                />
              ))}
            </Flex>
            <Flex gap={1} align="center">
              <Button text="ไทย" fontSize={1} padding={2}
                mode={lang === 'th' ? 'default' : 'ghost'}
                tone={lang === 'th' ? 'primary' : 'default'}
                onClick={() => setLang('th')}
              />
              <Button text="EN" fontSize={1} padding={2}
                mode={lang === 'en' ? 'default' : 'ghost'}
                tone={lang === 'en' ? 'primary' : 'default'}
                onClick={() => setLang('en')}
              />
              <div style={{ width: 1, height: 20, background: 'var(--card-border-color)', margin: '0 4px' }} />
              <Button text="All Levels" fontSize={1} padding={2}
                mode={!leafOnly ? 'default' : 'ghost'}
                tone={!leafOnly ? 'primary' : 'default'}
                onClick={() => setLeafOnly(false)}
              />
              <Button text="Leaf Only" fontSize={1} padding={2}
                mode={leafOnly ? 'default' : 'ghost'}
                tone={leafOnly ? 'primary' : 'default'}
                onClick={() => setLeafOnly(true)}
              />
              <div style={{ width: 1, height: 20, background: 'var(--card-border-color)', margin: '0 4px' }} />
              <Button text="⬇ Export CSV" mode="ghost" tone="default" fontSize={1} padding={2}
                disabled={loading || accounts.length === 0}
                onClick={exportCurrentTab}
              />
              <Button text="🖨 Print PDF" mode="ghost" tone="default" fontSize={1} padding={2}
                disabled={loading || accounts.length === 0}
                onClick={printPDF}
              />
            </Flex>
          </Flex>
        )}

        {/* ── Content (period selected only) ── */}
        {hasPeriod && (
          loading ? (
            <Flex justify="center" padding={6}><Spinner /></Flex>
          ) : accounts.length === 0 ? (
            <Text size={1} muted>No ledger accounts found.</Text>
          ) : tab === 'trial'  ? renderTrialBalance()
            : tab === 'income' ? renderIncomeStatement()
            : renderBalanceSheet()
        )}

        {/* ── Supporting Documents — always visible ── */}
        <Card padding={3} radius={2} border>
          <Stack space={3}>
            <Text size={1} weight="semibold">📂 Supporting Documents</Text>

            {supportingDocs.length === 0 ? (
              <Text size={1} muted>
                No documents uploaded yet — open the document's Settings tab to add files.
              </Text>
            ) : (() => {
              const highlightYear = from ? from.slice(0, 4) : null
              return supportingDocs.map(doc => {
                const isHighlighted = !!(highlightYear && doc.fiscalYearLabel && doc.fiscalYearLabel.includes(highlightYear))
                const isHovered     = hoveredDoc === doc._key && !!doc.fileUrl
                const dateLabel     = doc.uploadedAt ? doc.uploadedAt.slice(0, 10) : null
                return (
                  <a
                    key={doc._key}
                    href={doc.fileUrl ?? undefined}
                    download={doc.fileUrl ? (doc.fileName ?? true) : undefined}
                    target="_blank"
                    rel="noreferrer"
                    onMouseEnter={() => doc.fileUrl && setHoveredDoc(doc._key)}
                    onMouseLeave={() => setHoveredDoc(null)}
                    style={{
                      display: 'block',
                      padding: '8px 10px', borderRadius: 4,
                      border: `1px solid ${isHighlighted ? 'var(--card-positive-fg-color, #22c55e)' : 'var(--card-border-color)'}`,
                      background: isHighlighted
                        ? 'rgba(34,197,94,0.07)'
                        : isHovered ? 'var(--card-muted-bg-color)' : undefined,
                      cursor: doc.fileUrl ? 'pointer' : 'default',
                      textDecoration: 'none', color: 'inherit',
                    }}
                  >
                    <Flex align="center" justify="space-between" gap={3}>
                      <Flex align="flex-start" gap={2} style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📎</span>
                        <Stack space={1} style={{ minWidth: 0 }}>
                          <Text size={1} weight="semibold">{doc.label}</Text>
                          {doc.notes && (
                            <Text size={0} muted style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.notes}
                            </Text>
                          )}
                        </Stack>
                      </Flex>
                      <Flex align="center" gap={2} style={{ flexShrink: 0 }}>
                        {doc.fiscalYearLabel && (
                          <span style={{
                            fontSize: 11, padding: '2px 7px', borderRadius: 99,
                            background: isHighlighted ? 'rgba(34,197,94,0.18)' : 'var(--card-muted-bg-color)',
                            color: isHighlighted ? 'var(--card-positive-fg-color, #16a34a)' : 'var(--card-muted-fg-color)',
                            fontWeight: isHighlighted ? 700 : 400,
                            border: `1px solid ${isHighlighted ? 'var(--card-positive-fg-color, #22c55e)' : 'var(--card-border-color)'}`,
                          }}>
                            {doc.fiscalYearLabel}
                          </span>
                        )}
                        {dateLabel && (
                          <Text size={0} muted>{dateLabel}</Text>
                        )}
                        {doc.fileUrl && (
                          <span style={{
                            fontSize: 12, color: 'var(--card-link-fg-color, #2276fc)',
                            whiteSpace: 'nowrap',
                          }}>
                            ⬇ Download
                          </span>
                        )}
                      </Flex>
                    </Flex>
                  </a>
                )
              })
            })()}
          </Stack>
        </Card>

      </Stack>
    </Card>
  )
}
