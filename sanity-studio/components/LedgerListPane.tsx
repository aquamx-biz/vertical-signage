import { useState, useEffect, useCallback } from 'react'
import { useClient }   from 'sanity'
import { useRouter }   from 'sanity/router'
import { Box, Card, TextInput, Flex, Text, Stack, Spinner, Button } from '@sanity/ui'
import { SearchIcon, ComposeIcon, ChevronLeftIcon } from '@sanity/icons'
import { useFiscalYears, FiscalYearOption } from '../hooks/useFiscalYears'

const GL_FILTER_KEY = 'gl:periodFilter'

interface LedgerRow {
  _id:              string
  code?:            string
  nameTh?:          string
  nameEn?:          string
  type?:            string
  depth?:           number
  isParent?:        boolean
  accountId?:       string
  parentAccountId?: string
  hasFiles?:        boolean
  linkedSchedule?:  string
}

const fmtBal = (n: number): string =>
  Math.abs(n) < 0.005
    ? '—'
    : Number(Math.abs(n)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TYPE_OPTIONS = [
  { value: '',          label: 'All'           },
  { value: 'asset',     label: '🏦 Assets'     },
  { value: 'liability', label: '📋 Liabilities' },
  { value: 'equity',    label: '📊 Equity'      },
  { value: 'revenue',   label: '💰 Revenue'     },
  { value: 'expense',   label: '💸 Expenses'    },
]

type DepthFilter = 'all' | 'leaf' | 'depth2' | 'depth1' | 'depth0'

const DEPTH_OPTIONS: { value: DepthFilter; label: string; title: string }[] = [
  { value: 'all',    label: 'All Levels',       title: 'Show all accounts'              },
  { value: 'leaf',   label: '🍃 Leaf',          title: 'Transactional accounts only'    },
  { value: 'depth2', label: '📄 Sub-sub-group', title: 'Group accounts at depth 2'      },
  { value: 'depth1', label: '📂 Sub-group',     title: 'Group accounts at depth 1'      },
  { value: 'depth0', label: '📁 Group',         title: 'Top-level group accounts only'  },
]

const TYPE_ICON: Record<string, string> = {
  asset: '🏦', liability: '📋', equity: '📊', revenue: '💰', expense: '💸',
}

const DEPTH_ICON: Record<number, string> = { 0: '📁', 1: '📂', 2: '📄' }

const DEPTH_TO_PARAM: Record<DepthFilter, string> = {
  all: 'all', leaf: 'leaf', depth2: 'sub-sub-group', depth1: 'sub-group', depth0: 'group',
}
const PARAM_TO_DEPTH: Record<string, DepthFilter> = {
  all: 'all', leaf: 'leaf', 'sub-sub-group': 'depth2', 'sub-group': 'depth1', group: 'depth0',
}

function getInitialFromURL() {
  try {
    const p = new URLSearchParams(window.location.search)
    const VALID_TYPES = ['', 'asset', 'liability', 'equity', 'revenue', 'expense']
    return {
      fyYear: p.get('fy')    ?? '',
      type:   VALID_TYPES.includes(p.get('type') ?? '') ? (p.get('type') ?? '') : '',
      depth:  PARAM_TO_DEPTH[p.get('depth') ?? ''] ?? 'all' as DepthFilter,
      query:  p.get('q')     ?? '',
    }
  } catch {
    return { fyYear: '', type: '', depth: 'all' as DepthFilter, query: '' }
  }
}

export function LedgerListPane() {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const router  = useRouter()
  const fyYears = useFiscalYears(5)

  const [{ fyYear: initFyYear, type: initType, depth: initDepth, query: initQuery }] =
    useState(getInitialFromURL)

  // null = showing fiscal year list; set = showing account list for that year
  const [selectedFY,   setSelectedFY]   = useState<FiscalYearOption | null>(null)
  const [fyHovered,    setFyHovered]    = useState<string | null>(null)
  const [targetFyYear, setTargetFyYear] = useState(initFyYear)

  const [query,     setQuery]     = useState(initQuery)
  const [type,      setType]      = useState(initType)
  const [depth,     setDepth]     = useState<DepthFilter>(initDepth)
  const [rows,      setRows]      = useState<LedgerRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [hovered,     setHovered]     = useState<string | null>(null)
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)
  const [leafNet,   setLeafNet]   = useState<Record<string, number>>({})
  const [rollupNet, setRollupNet] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!selectedFY) { setRows([]); setLoading(false); return }

    let cancelled = false
    setLoading(true)

    const q = query.trim()

    const typeClause = type
      ? `&& accountCode->type == "${type}"`
      : ''

    // Use live accountCode fields — cached values (isParentCache, accountDepthCache)
    // can be stale if accounts were added after the ledger document was created.
    const depthClause =
      depth === 'leaf'   ? '&& accountCode->isParent != true'
      : depth === 'depth0' ? '&& accountCode->isParent == true && !defined(accountCode->parentCode._ref)'
      : depth === 'depth1' ? '&& accountCode->isParent == true && defined(accountCode->parentCode._ref) && !defined(accountCode->parentCode->parentCode._ref)'
      : depth === 'depth2' ? '&& accountCode->isParent == true && defined(accountCode->parentCode->parentCode._ref)'
      : ''

    const searchClause = q
      ? `&& (codeCache match $q || accountCode->nameTh match $q || accountCode->nameEn match $q)`
      : ''

    const groq = `*[_type == "ledger" && !(_id in path("drafts.**"))
      ${typeClause} ${depthClause} ${searchClause}
    ] | order(codeCache asc) {
      _id,
      "code":     coalesce(codeCache, accountCode->code),
      "nameTh":   accountCode->nameTh,
      "nameEn":   accountCode->nameEn,
      "type":            accountCode->type,
      "isParent":        accountCode->isParent,
      "accountId":       accountCode._ref,
      "parentAccountId": accountCode->parentCode._ref,
      "hasFiles":        count(supportingDocs) > 0,
      "linkedSchedule":  accountCode->linkedSchedule,
      "depth": select(
        !defined(accountCode->parentCode._ref)                                        => 0,
        !defined(accountCode->parentCode->parentCode._ref)                            => 1,
        !defined(accountCode->parentCode->parentCode->parentCode._ref)                => 2,
        3
      ),
    }`

    client
      .fetch<LedgerRow[]>(groq, q ? { q: `*${q}*` } : {})
      .then(data => { if (!cancelled) { setRows(data); setLoading(false) } })
      .catch(()  => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [selectedFY, query, type, depth, client])

  // Fetch period transactions + build parent→leaf rollup whenever FY changes
  useEffect(() => {
    if (!selectedFY) { setLeafNet({}); setRollupNet({}); return }
    let cancelled = false

    client
      .fetch<{
        pmData: { accountId: string; parentAccountId?: string }[]
        bfData: { accountId: string; bfDr: number; bfCr: number }[]
        txns:   { lines: { accountId: string; dr: number; cr: number }[] }[]
      }>(
        `{
          "pmData": *[_type == "accountCode"] {
            "accountId":       _id,
            "parentAccountId": parentCode._ref
          },
          "bfData": *[_type == "ledger" && !(_id in path("drafts.**"))] {
            "accountId": accountCode._ref,
            "bfDr":      coalesce(broughtForwardDebit, 0),
            "bfCr":      coalesce(broughtForwardCredit, 0)
          },
          "txns": *[
            _type in ["payment","invoiceReceipt","funding","procurement","journalEntry"]
            && accountingEntry.glStatus == "posted"
            && accountingEntry.entryDate >= $from
            && accountingEntry.entryDate <= $to
            && !(_id in path("drafts.**"))
          ] {
            "lines": accountingEntry.lines[] {
              "accountId": accountCode._ref,
              "dr": coalesce(debitAmount, 0),
              "cr": coalesce(creditAmount, 0)
            }
          }
        }`,
        { from: selectedFY.from, to: selectedFY.to }
      )
      .then(({ pmData, bfData, txns }) => {
        if (cancelled) return

        console.log('[GL] pmData rows:', pmData.length)
        console.log('[GL] bfData rows:', bfData.length, 'sample first 5:', bfData.slice(0, 5))
        console.log('[GL] bfData with non-zero BF:', bfData.filter(r => (r.bfDr ?? 0) !== 0 || (r.bfCr ?? 0) !== 0).length)
        console.log('[GL] txns docs:', txns.length)

        // parentMap: accountCode._id → parent accountCode._id (full chart of accounts)
        const parentMap: Record<string, string> = {}
        for (const r of pmData) {
          if (r.accountId && r.parentAccountId) parentMap[r.accountId] = r.parentAccountId
        }

        // leaf closing balance: accountCode._id → (BF + period net), debit-positive
        const leaf: Record<string, number> = {}
        for (const r of bfData) {
          if (!r.accountId) continue
          leaf[r.accountId] = (r.bfDr ?? 0) - (r.bfCr ?? 0)
        }
        for (const doc of txns) {
          for (const line of (doc.lines ?? [])) {
            if (!line.accountId) continue
            leaf[line.accountId] = (leaf[line.accountId] ?? 0) + (line.dr ?? 0) - (line.cr ?? 0)
          }
        }

        // rollup: walk up from each leaf and accumulate balance into every ancestor
        const rollup: Record<string, number> = {}
        for (const [accountId, balance] of Object.entries(leaf)) {
          let cur = parentMap[accountId]
          while (cur) { rollup[cur] = (rollup[cur] ?? 0) + balance; cur = parentMap[cur] }
        }

        setLeafNet(leaf)
        setRollupNet(rollup)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [selectedFY, client])

  // Resolve ?fy=YYYY → selectedFY once fyYears has loaded
  useEffect(() => {
    if (!targetFyYear || selectedFY || fyYears.length === 0) return
    const match = fyYears.find(fy => fy.from.startsWith(targetFyYear))
    if (match) { setSelectedFY(match); setLoading(true) }
    setTargetFyYear('')
  }, [fyYears, targetFyYear, selectedFY])

  // Sync filter state → URL query params (no page reload)
  useEffect(() => {
    try {
      const p = new URLSearchParams()
      if (selectedFY)       p.set('fy',    selectedFY.from.slice(0, 4))
      if (type)             p.set('type',  type)
      if (depth !== 'all')  p.set('depth', DEPTH_TO_PARAM[depth])
      if (query.trim())     p.set('q',     query.trim())
      const qs  = p.toString()
      const url = qs
        ? `${window.location.pathname}?${qs}${window.location.hash}`
        : `${window.location.pathname}${window.location.hash}`
      window.history.replaceState(null, '', url)
    } catch {}
  }, [selectedFY, type, depth, query])

  const openOverview = useCallback(
    (id: string) => {
      if (selectedFY) {
        localStorage.setItem(GL_FILTER_KEY, JSON.stringify({ from: selectedFY.from, to: selectedFY.to, activeId: selectedFY.id }))
      }
      router.navigateIntent('edit', { id: id.replace(/^drafts\./, ''), type: 'ledger' })
    },
    [router, selectedFY],
  )

  const openStatement = useCallback(
    (id: string) => {
      if (selectedFY) {
        localStorage.setItem(GL_FILTER_KEY, JSON.stringify({ from: selectedFY.from, to: selectedFY.to, activeId: selectedFY.id }))
      }
      const cleanId  = id.replace(/^drafts\./, '')
      const base     = window.location.origin +
        (window.location.pathname.includes('/structure')
          ? window.location.pathname.split('/structure')[0]
          : '')
      window.location.href = `${base}/intent/edit/id=${cleanId};type=ledger;view=edit`
    },
    [selectedFY],
  )

  const navigateToAR = useCallback(
    (accountId: string) => {
      localStorage.setItem('ar:accountFilter', JSON.stringify({ accountCodeRef: accountId }))
      if (selectedFY) {
        localStorage.setItem('ar:periodFilter', JSON.stringify({ from: selectedFY.from, to: selectedFY.to, activeId: selectedFY.id }))
      }
      router.navigateIntent('edit', { id: 'asset-register-singleton', type: 'assetRegister' })
    },
    [router, selectedFY],
  )

  useEffect(() => {
    if (!selectedFY) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedFY(null); setQuery(''); setType(''); setDepth('all') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedFY])

  const printPDF = useCallback(() => {
    if (!selectedFY || rows.length === 0) return

    const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const typeLabel  = TYPE_OPTIONS.find(o => o.value === type)?.label ?? 'All'
    const depthLabel = DEPTH_OPTIONS.find(o => o.value === depth)?.label ?? 'All Levels'
    const fySlug     = selectedFY.label.replace(/\s+/g, '-')

    const tableRows = rows.map(row => {
      const net      = row.isParent ? rollupNet[row.accountId ?? ''] : leafNet[row.accountId ?? '']
      const bal      = net !== undefined ? fmtBal(net) : '—'
      const negStyle = net !== undefined && net < 0 ? ' color:#c00;' : ''
      const bwStyle  = row.isParent ? 'font-weight:700;' : ''
      const indentPx = depth === 'all' ? (row.depth ?? 0) * 18 : 0
      const icon     = row.isParent ? (DEPTH_ICON[row.depth ?? 0] ?? '📂') : '&middot;'
      const typeIcon = row.type ? TYPE_ICON[row.type] : ''
      const attach   = row.hasFiles ? ' 📎' : ''
      return `<tr>
        <td style="padding-left:${indentPx + 4}px; white-space:nowrap; ${bwStyle}">${icon} ${row.code ?? ''}</td>
        <td style="padding-left:4px; ${bwStyle}">${row.nameTh || row.nameEn || ''}${attach}</td>
        <td style="text-align:right; font-family:monospace; ${bwStyle}${negStyle}">${bal}</td>
        <td style="text-align:center; font-size:11px; opacity:0.6">${typeIcon}</td>
      </tr>`
    }).join('\n')

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>General Ledger — ${selectedFY.label}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 14mm; }
  body { font-family: 'Sarabun', 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
  h2 { margin: 0 0 4px; font-size: 16px; }
  .meta { color: #555; font-size: 10px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;
       padding: 5px 6px; border-bottom: 2px solid #d1d5db; text-align: left; }
  td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<h2>General Ledger</h2>
<div class="meta">
  Period: ${selectedFY.label} (${selectedFY.from} – ${selectedFY.to})
  &nbsp;·&nbsp; Type: ${typeLabel}
  &nbsp;·&nbsp; Level: ${depthLabel}
  ${query ? `&nbsp;·&nbsp; Search: "${query}"` : ''}
  &nbsp;·&nbsp; Generated: ${now}
</div>
<table>
  <thead>
    <tr>
      <th style="width:100px">Code</th>
      <th>Account Name</th>
      <th style="width:110px; text-align:right">Balance</th>
      <th style="width:32px; text-align:center">Type</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
</table>
</body>
</html>`

    const win = window.open('', '_blank', 'width=820,height=1060')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.document.title = `general-ledger-${fySlug}-${type || 'all'}-${depth}.pdf`
    setTimeout(() => win.print(), 400)
  }, [rows, selectedFY, leafNet, rollupNet, query, type, depth])

  // Indent only when showing all levels — visually conveys hierarchy
  const indent = (row: LedgerRow) =>
    depth === 'all' ? (row.depth ?? 0) * 14 : 0

  // ── Fiscal year list ─────────────────────────────────────────────────────
  if (!selectedFY) {
    return (
      <Card tone="default" height="fill" style={{ display: 'flex', flexDirection: 'column' }}>

        {fyYears.length === 0 ? (
          <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
            <Spinner muted />
          </Flex>
        ) : (
          <Box style={{ flex: 1, overflowY: 'auto' }}>
            {fyYears.map(fy => (
              <Box
                key={fy.id}
                onClick={() => { setSelectedFY(fy); setLoading(true) }}
                onMouseEnter={() => setFyHovered(fy.id)}
                onMouseLeave={() => setFyHovered(null)}
                style={{
                  cursor:       'pointer',
                  borderBottom: '1px solid var(--card-border-color)',
                  background:   fyHovered === fy.id ? 'var(--card-muted-bg-color)' : undefined,
                  padding:      '9px 16px',
                }}
              >
                <Stack space={1}>
                  <Text size={1}>{fy.label}</Text>
                  <Text size={0} muted>{fy.from} – {fy.to}</Text>
                </Stack>
              </Box>
            ))}
          </Box>
        )}

      </Card>
    )
  }

  // ── Account list (fiscal year selected) ──────────────────────────────────
  return (
    <Card tone="default" height="fill" style={{
      position: 'fixed', top: 60, left: 0, right: 0, bottom: 0,
      zIndex: 999999,
      background: 'var(--card-bg-color)',
      overflow: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Toolbar ── */}
      <Box style={{ borderBottom: '1px solid var(--card-border-color)', flexShrink: 0 }}>

        {/* FY context bar */}
        <Flex align="center" gap={2} style={{ borderBottom: '1px solid var(--card-border-color)', padding: '5px 8px' }}>
          <Button
            icon={ChevronLeftIcon}
            mode="ghost"
            fontSize={1}
            padding={2}
            text="Back"
            onClick={() => { setSelectedFY(null); setQuery(''); setType(''); setDepth('all') }}
          />
          <Flex align="center" gap={1}>
            <span style={{ fontSize: 11 }}>📅</span>
            <Text size={1} weight="medium">{selectedFY.label}</Text>
          </Flex>
          <Text size={0} muted>{selectedFY.from} – {selectedFY.to}</Text>
          <Box style={{ marginLeft: 'auto' }}>
            <Button
              mode="ghost"
              fontSize={1}
              padding={2}
              text="🖨 Print PDF"
              title="Print / Export PDF"
              disabled={rows.length === 0}
              onClick={printPDF}
            />
          </Box>
        </Flex>

        {/* Search */}
        <Box padding={2}>
          <TextInput
            icon={SearchIcon}
            placeholder="Search code or account name…"
            value={query}
            onChange={e => setQuery(e.currentTarget.value)}
            clearButton={!!query}
            onClear={() => setQuery('')}
          />
        </Box>

        {/* Account type filter */}
        <Flex
          paddingX={2} paddingBottom={1} gap={1} wrap="wrap"
          style={{ borderTop: '1px solid var(--card-border-color)' }}
        >
          {TYPE_OPTIONS.map(o => (
            <Button
              key={o.value}
              text={o.label}
              fontSize={1} padding={2}
              mode={type === o.value ? 'default' : 'ghost'}
              tone={type === o.value ? 'primary' : 'default'}
              onClick={() => setType(o.value)}
            />
          ))}
        </Flex>

        {/* Depth / level filter */}
        <Flex
          paddingX={2} paddingBottom={2} gap={1} wrap="wrap" align="center"
          style={{ borderTop: '1px solid var(--card-border-color)' }}
        >
          {DEPTH_OPTIONS.map(o => (
            <Button
              key={o.value}
              text={o.label}
              title={o.title}
              fontSize={1} padding={2}
              mode={depth === o.value ? 'default' : 'ghost'}
              tone={depth === o.value ? 'primary' : 'default'}
              onClick={() => setDepth(o.value)}
            />
          ))}
          <Box style={{ marginLeft: 'auto' }}>
            <Button
              icon={ComposeIcon}
              mode="ghost"
              tone="primary"
              title="Create new ledger account"
              onClick={() => router.navigateIntent('create', { type: 'ledger' })}
            />
          </Box>
        </Flex>
      </Box>

      {/* ── List ── */}
      {loading ? (
        <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
          <Spinner muted />
        </Flex>
      ) : rows.length === 0 ? (
        <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
          <Text muted size={1}>{query ? 'No accounts match' : 'No ledger accounts found'}</Text>
        </Flex>
      ) : (
        <Box style={{ flex: 1, overflowY: 'auto' }}>
          {rows.map(row => (
            <Box
              key={row._id}
              onClick={() => openOverview(row._id)}
              onMouseEnter={() => setHovered(row._id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                cursor: 'pointer',
                borderBottom: '1px solid var(--card-border-color)',
                background: hovered === row._id ? 'var(--card-muted-bg-color)' : undefined,
                padding: `7px 12px 7px ${12 + indent(row)}px`,
              }}
            >
              <Flex align="center" gap={2} style={{ minWidth: 0 }}>
                {/* Group / leaf icon */}
                {row.isParent
                  ? <span style={{ fontSize: 11, flexShrink: 0 }}>{DEPTH_ICON[row.depth ?? 0] ?? '📂'}</span>
                  : <span style={{ fontSize: 10, flexShrink: 0, opacity: 0.35 }}>·</span>
                }

                {/* Code — clicks to statement view */}
                <span
                  onClick={e => { e.stopPropagation(); openStatement(row._id) }}
                  onMouseEnter={() => setHoveredLink(`${row._id}:code`)}
                  onMouseLeave={() => setHoveredLink(null)}
                  style={{
                    fontFamily: 'monospace', fontSize: 12, fontWeight: 600, flexShrink: 0,
                    color: '#3b82f6',
                    cursor: 'pointer',
                    textDecoration: hoveredLink === `${row._id}:code` ? 'underline' : 'none',
                  }}
                >
                  {row.code}
                </span>

                {/* Name — clicks to statement view */}
                <span
                  onClick={e => { e.stopPropagation(); openStatement(row._id) }}
                  onMouseEnter={() => setHoveredLink(`${row._id}:name`)}
                  onMouseLeave={() => setHoveredLink(null)}
                  style={{
                    fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    textDecoration: hoveredLink === `${row._id}:name` ? 'underline' : 'none',
                  }}
                >
                  {row.nameTh || row.nameEn}
                </span>

                {/* Right cluster: 🔍 · 📎 · balance · type icon */}
                <Flex align="center" gap={1} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  {row.linkedSchedule === 'asset_register' && row.accountId && (
                    <button
                      onClick={e => { e.stopPropagation(); navigateToAR(row.accountId!) }}
                      title="View in Asset Register"
                      style={{
                        background: 'none', border: 'none', padding: '0 2px',
                        cursor: 'pointer', fontSize: 11, flexShrink: 0,
                        opacity: 0.55, lineHeight: 1,
                      }}
                    >
                      🔍
                    </button>
                  )}
                  {row.hasFiles && (
                    <button
                      onClick={e => { e.stopPropagation(); openOverview(row._id) }}
                      title="Open supporting documents"
                      style={{
                        background: 'none', border: 'none', padding: '0 2px',
                        cursor: 'pointer', fontSize: 10, flexShrink: 0, lineHeight: 1,
                      }}
                    >
                      📎
                    </button>
                  )}
                  {selectedFY && (() => {
                    const net   = row.isParent ? rollupNet[row.accountId ?? ''] : leafNet[row.accountId ?? '']
                    const label = net !== undefined ? fmtBal(net) : '—'
                    return (
                      <span style={{
                        fontFamily: 'monospace',
                        fontSize:   row.isParent ? 12 : 11,
                        fontWeight: row.isParent ? 700 : 400,
                        color:      label === '—' ? 'var(--card-muted-fg-color)' : 'inherit',
                        opacity:    label === '—' ? 0.35 : 1,
                        minWidth:   72,
                        textAlign:  'right',
                        flexShrink: 0,
                      }}>
                        {label}
                      </span>
                    )
                  })()}
                  {row.type && (
                    <span style={{ fontSize: 11, flexShrink: 0, opacity: 0.45, marginLeft: 2 }}>
                      {TYPE_ICON[row.type]}
                    </span>
                  )}
                </Flex>
              </Flex>
            </Box>
          ))}
        </Box>
      )}

    </Card>
  )
}
