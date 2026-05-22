/**
 * AutoGlAccountPaymentInput
 *
 * Smart GL Account field for Payment — behaviour depends on Payment Mode:
 *
 * Procurement Payment:
 *   Auto-fills from first linked Procurement's GL account.
 *   Read-only display + ✏️ pencil to override · ↩ undo to revert.
 *
 * Direct Expense + Expense Category selected:
 *   Auto-fills from the expense category's GL account (set in Process Setup).
 *   Same read-only + pencil + undo pattern.
 *
 * Direct Expense + no category:
 *   Free dropdown — expense accounts + fixed/intangible asset accounts (115000, 116000).
 *
 * Override state survives page reload: on mount, the saved value is compared
 * against what would be auto-filled; if they differ, override mode is restored.
 */

import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { set, unset, useClient, useFormValue }              from 'sanity'
import { Autocomplete, Box, Flex, Text, Spinner, Button }   from '@sanity/ui'
import { EditIcon, UndoIcon }                               from '@sanity/icons'

const GROUP_PREFIX: Record<string, string> = {
  asset: '1', liability: '2', equity: '3', revenue: '4', expense: '5',
}

interface AccountOption {
  value:  string
  code:   string
  name:   string
  nameEn: string
}

// GL from first linked Procurement (draft-first)
const PROC_GL_QUERY = `coalesce(
  *[_type == "procurement" && _id == ("drafts." + $procId)][0].accountCode._ref,
  *[_type == "procurement" && _id == $procId][0].accountCode._ref
)`

// GL for Rent Payment — always 513100 Rent Expense
const RENT_GL_QUERY = `*[_type == "accountCode" && code == "513100" && !(_id in path("drafts.**"))][0]._id`

// GL from Expense Category in Process Setup (draft-first)
const EXPENSE_CAT_GL_QUERY = `coalesce(
  *[_type == "contractType" && useForExpense == true && isActive == true
    && _id in path("drafts.**")][0].expenseCategories[key == $key][0].accountCode._ref,
  *[_type == "contractType" && useForExpense == true && isActive == true
    && !(_id in path("drafts.**"))][0].expenseCategories[key == $key][0].accountCode._ref
)`

// Eligible accounts for free-select:
//   • All leaf expense accounts
//   • Fixed / intangible asset accounts under 115000 / 116000
//   • Deposit asset accounts (114000 / 14000) — leaf or children
//   • All leaf liability accounts (payables, accruals, WHT payable, VAT payable, loans, etc.)
const ACCOUNTS_QUERY = `*[_type == "accountCode"
    && !(_id in path("drafts.**"))
    && isActive != false
    && !(_id in *[_type == "accountCode" && defined(parentCode._ref)].parentCode._ref)
    && (
      type == "expense"
      || (type == "asset" && (
           code in ["114000", "14000"]
           || (defined(parentCode._ref) && (
                parentCode->code in ["115000", "116000", "114000", "14000"]
                || parentCode->parentCode->code in ["115000", "116000", "114000", "14000"]
                || parentCode->parentCode->parentCode->code in ["115000", "116000", "114000", "14000"]
              ))
         ))
      || type == "liability"
    )
  ] | order(sortKey asc) { _id, code, nameTh, nameEn, type, sortKey }`

export function AutoGlAccountPaymentInput(props: any) {
  const { value, onChange, readOnly, elementProps } = props
  const client  = useClient({ apiVersion: '2024-01-01' })
  const inputId = useId()

  const paymentMode       = useFormValue(['paymentMode'])       as string | undefined
  const procurements      = useFormValue(['procurements'])      as Array<{ _ref?: string }> | undefined
  const expenseCategoryKey = useFormValue(['expenseCategory'])  as string | undefined
  const firstProcRef      = procurements?.[0]?._ref

  const isProcMode  = !paymentMode || paymentMode === 'procurement'
  const isExpMode   = paymentMode === 'direct_expense'
  const isRentMode  = paymentMode === 'rent_payment'

  const [options,     setOptions]     = useState<AccountOption[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [autoGlRef,   setAutoGlRef]   = useState<string | null>(null)
  const [isOverride,  setIsOverride]  = useState(false)
  const [initialized, setInitialized] = useState(false)
  const cancelRef = useRef<boolean>(false)

  // ── Fetch dropdown options ────────────────────────────────────────────────
  useEffect(() => {
    client.fetch<any[]>(ACCOUNTS_QUERY)
      .then(data => setOptions(
        data
          .sort((a, b) => {
            const ka = a.sortKey ?? (a.code ?? '').padStart(10, '0')
            const kb = b.sortKey ?? (b.code ?? '').padStart(10, '0')
            return ka < kb ? -1 : ka > kb ? 1 : 0
          })
          .map(d => ({
            value:  d._id as string,
            code:   d.code as string ?? '',
            name:   (d.nameTh ?? d.nameEn ?? '') as string,
            nameEn: (d.nameEn ?? '') as string,
          }))
      ))
      .catch(e => setError(e?.message ?? 'Failed to load accounts'))
      .finally(() => setLoading(false))
  }, [client])

  // ── Helper: fetch the expected auto-GL for current state ──────────────────
  const fetchExpectedGl = useCallback(async (): Promise<string | null> => {
    if (isProcMode && firstProcRef)
      return client.fetch<string | null>(PROC_GL_QUERY, { procId: firstProcRef }).catch(() => null)
    if (isExpMode && expenseCategoryKey)
      return client.fetch<string | null>(EXPENSE_CAT_GL_QUERY, { key: expenseCategoryKey }).catch(() => null)
    if (isRentMode)
      return client.fetch<string | null>(RENT_GL_QUERY).catch(() => null)
    return null
  }, [isProcMode, isExpMode, isRentMode, firstProcRef, expenseCategoryKey, client])

  // ── On mount: detect override OR apply auto-fill if no value saved yet ───
  useEffect(() => {
    cancelRef.current = false
    fetchExpectedGl().then(ref => {
      if (cancelRef.current) return
      setAutoGlRef(ref)
      if (ref && value?._ref && ref !== value._ref) {
        // Saved value differs from auto-fill → was manually overridden
        setIsOverride(true)
      } else if (ref && !value?._ref) {
        // Category already selected but no GL saved yet → apply now
        onChange(set({ _type: 'reference', _ref: ref, _weak: true }))
      }
      setInitialized(true)
    })
    return () => { cancelRef.current = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — mount only

  // ── Re-fetch auto-GL when mode / procurement / expense category changes ───
  useEffect(() => {
    if (!initialized) return
    cancelRef.current = false

    fetchExpectedGl().then(ref => {
      if (cancelRef.current) return
      setAutoGlRef(ref)

      if (isOverride) return // user has manually chosen — don't overwrite

      if (ref) {
        onChange(set({ _type: 'reference', _ref: ref, _weak: true }))
      } else {
        // Source changed but has no GL (or no source at all) → clear
        onChange(unset())
      }
    })
    return () => { cancelRef.current = true }
  }, [paymentMode, firstProcRef, expenseCategoryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset override when trigger source changes ────────────────────────────
  useEffect(() => {
    if (!initialized) return
    setIsOverride(false)
  }, [paymentMode, firstProcRef, expenseCategoryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((id: string | null) => {
    onChange(id ? set({ _type: 'reference', _ref: id, _weak: true }) : unset())
  }, [onChange])

  const handleUndo = useCallback(() => {
    setIsOverride(false)
    // Trigger re-fill by explicitly applying autoGlRef
    if (autoGlRef) onChange(set({ _type: 'reference', _ref: autoGlRef, _weak: true }))
    else           onChange(unset())
  }, [autoGlRef, onChange])

  // ── Determine whether we have an active auto-fill source ─────────────────
  const hasAutoSource = (isProcMode && !!firstProcRef) || (isExpMode && !!expenseCategoryKey) || isRentMode
  const showReadOnly  = hasAutoSource && !isOverride

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <Flex align="center" gap={2} padding={2}>
      <Spinner muted />
      <Text muted size={1}>Loading accounts…</Text>
    </Flex>
  )
  if (error) return (
    <Text size={1} style={{ color: 'var(--card-critical-fg-color)' }}>{error}</Text>
  )

  // ── Read-only display (auto-filled, not overridden) ───────────────────────
  if (showReadOnly) {
    const selected = options.find(o => o.value === value?._ref)
    const hint = isRentMode
      ? '513100 Rent Expense account not found — check Chart of Accounts'
      : isProcMode
        ? (firstProcRef ? 'No GL account set on linked Procurement' : 'Link a Procurement to auto-fill')
        : (expenseCategoryKey ? 'No GL account configured for this category in Process Setup' : '')

    return (
      <Flex align="center" gap={2}>
        <Box flex={1} padding={3} style={{
          background:   'var(--card-code-bg-color)',
          border:       '1px solid var(--card-border-color)',
          borderRadius: 3,
        }}>
          {selected ? (
            <Flex gap={3} align="center">
              <Text size={1} style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {selected.code}
              </Text>
              <Text muted size={1}>{selected.name}</Text>
              {selected.nameEn ? <Text muted size={1}>·  {selected.nameEn}</Text> : null}
            </Flex>
          ) : (
            <Text muted size={1} style={{ fontStyle: 'italic' }}>{hint}</Text>
          )}
        </Box>
        <Button
          icon={EditIcon}
          mode="bleed"
          tone="default"
          padding={2}
          title="Override manually"
          onClick={() => setIsOverride(true)}
          disabled={readOnly}
        />
      </Flex>
    )
  }

  // ── Free dropdown (Direct Expense no category, or manual override) ────────
  return (
    <Flex align="center" gap={2}>
      <Box flex={1}>
        <Autocomplete
          {...elementProps}
          id={inputId}
          disabled={readOnly}
          openButton
          options={options}
          value={value?._ref ?? null}
          placeholder="Search account code or name…"
          onChange={handleChange}
          renderValue={(val, opt) => opt ? `${opt.code}  ·  ${opt.name}${opt.nameEn ? `  ·  ${opt.nameEn}` : ''}` : val}
          renderOption={(opt: AccountOption) => (
            <Box padding={3}>
              <Text size={1} style={{ fontFamily: 'monospace', fontWeight: 600 }}>{opt.code}</Text>
              <Text muted size={0} style={{ marginTop: 2 }}>{opt.name}</Text>
              {opt.nameEn ? <Text muted size={0} style={{ marginTop: 1 }}>{opt.nameEn}</Text> : null}
            </Box>
          )}
          filterOption={(query: string, opt: AccountOption) =>
            `${opt.code} ${opt.name} ${opt.nameEn}`.toLowerCase().includes(query.toLowerCase())
          }
        />
      </Box>
      {hasAutoSource && isOverride && (
        <Button
          icon={UndoIcon}
          mode="bleed"
          tone="caution"
          padding={2}
          title="Reset to auto-filled value"
          onClick={handleUndo}
          disabled={readOnly}
        />
      )}
    </Flex>
  )
}
