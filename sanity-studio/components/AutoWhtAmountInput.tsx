/**
 * AutoWhtAmountInput
 *
 * Auto-calculates W/H Tax as paymentAmount × rate / 100.
 * Shows a read-only display with a ✏️ pencil button to switch to manual override.
 * Clicking ↩ undo icon resets back to auto-calculated value.
 * On document reload, detects if stored value differs from calculated → stays in override mode.
 */

import { useState, useEffect, useCallback } from 'react'
import { set, unset, useFormValue }          from 'sanity'
import { Flex, Box, TextInput, Button }      from '@sanity/ui'
import { EditIcon, UndoIcon }                from '@sanity/icons'

function computeCalc(amount: number | undefined, rate: string | undefined): number | undefined {
  if (!amount || !rate || rate === 'none' || rate === '0' || rate === 'custom') return undefined
  const r = parseFloat(rate)
  if (isNaN(r)) return undefined
  return Math.round(amount * r) / 100
}

export function AutoWhtAmountInput(props: any) {
  const { value, onChange, elementProps } = props

  const paymentAmount      = useFormValue(['paymentAmount'])      as number | undefined
  const withholdingTaxRate = useFormValue(['withholdingTaxRate']) as string | undefined

  const calcValue = computeCalc(paymentAmount, withholdingTaxRate)

  const [isOverride, setIsOverride] = useState(false)

  // On mount: if the saved value differs from what auto-calc would produce, it was manually set
  useEffect(() => {
    if (value !== undefined && calcValue !== undefined && value !== calcValue) {
      setIsOverride(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-apply calculated value whenever rate or amount changes (unless overridden)
  useEffect(() => {
    if (props.readOnly) return
    if (isOverride) return
    if (!withholdingTaxRate || withholdingTaxRate === 'none' || withholdingTaxRate === '0') {
      onChange(unset())
      return
    }
    if (calcValue !== undefined) {
      onChange(set(calcValue))
    }
  }, [calcValue, isOverride, withholdingTaxRate, onChange, props.readOnly])

  const handleOverride = useCallback(() => setIsOverride(true), [])

  const handleReset = useCallback(() => {
    setIsOverride(false)
    if (calcValue !== undefined) onChange(set(calcValue))
    else onChange(unset())
  }, [calcValue, onChange])

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // ── Auto-calc display (read-only + pencil) ────────────────────────────────────
  if (!isOverride) {
    return (
      <Flex align="center" gap={2}>
        <Box flex={1}>
          <TextInput
            {...elementProps}
            readOnly
            value={value !== undefined ? fmt(value) : '—'}
            style={{ color: 'var(--card-muted-fg-color)', cursor: 'default' }}
          />
        </Box>
        <Button
          icon={EditIcon}
          mode="bleed"
          tone="default"
          padding={2}
          title="Override manually"
          onClick={handleOverride}
        />
      </Flex>
    )
  }

  // ── Manual override (editable + undo) ─────────────────────────────────────────
  return (
    <Flex align="center" gap={2}>
      <Box flex={1}>
        <TextInput
          {...elementProps}
          type="number"
          value={value !== undefined ? String(value) : ''}
          onChange={e => {
            const v = parseFloat(e.currentTarget.value)
            onChange(isNaN(v) ? unset() : set(v))
          }}
        />
      </Box>
      <Button
        icon={UndoIcon}
        mode="bleed"
        tone="caution"
        padding={2}
        title="Reset to auto-calculated"
        onClick={handleReset}
      />
    </Flex>
  )
}
