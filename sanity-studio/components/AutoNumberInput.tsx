import { useState, useEffect, useRef } from 'react'
import { Stack, Button, Flex, Text, Spinner, Card } from '@sanity/ui'
import { set } from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'

const API_BASE =
  process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app'

/**
 * Factory that returns a custom Sanity input component with:
 *  - A "Generate Number" button (global sequence, format PREFIX-yyyy-mm-001)
 *  - Real-time duplicate check with a warning if the number is already in use
 *  - Prefix resolution: pass `fixedPrefix` to skip the contractType lookup,
 *    otherwise the input reads the doc's contractType reference dynamically.
 *  - Optional `dateField` reads a date from the form and sends it as
 *    `dateOverride` so the YY-MM segment matches the doc's own date.
 *
 * Usage in schema:
 *   components: { input: createAutoNumberInput('contract') }
 *   components: { input: createAutoNumberInput('payment', { fixedPrefix: 'PMT' }) }
 *   components: { input: createAutoNumberInput('journalEntry', { fixedPrefix: 'JE', dateField: 'date' }) }
 */
export function createAutoNumberInput(
  docType: string,
  opts: { fixedPrefix?: string; dateField?: string } = {},
) {
  const { fixedPrefix, dateField } = opts
  function AutoNumberInput(props: StringInputProps) {
    const [generating, setGenerating] = useState(false)
    const [checking,   setChecking]   = useState(false)
    const [duplicate,  setDuplicate]  = useState<{ customerName?: string; projectName?: string } | null>(null)
    const [genError,   setGenError]   = useState<string | null>(null)

    const currentDocId      = useFormValue(['_id'])                as string | undefined
    const contractTypeRef   = useFormValue(['contractType', '_ref']) as string | undefined
    // Always call the hook (Rules of Hooks); ignore the value if dateField wasn't supplied.
    const dateFieldValue    = useFormValue([dateField ?? '__none__']) as string | undefined
    const dateOverride      = dateField ? dateFieldValue : undefined
    const currentValue      = (props.value as string | undefined) ?? ''

    const prefixReady = !!fixedPrefix || !!contractTypeRef

    // ── Debounced duplicate check ──────────────────────────────────────────────
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
      if (!currentValue.trim()) {
        setDuplicate(null)
        setChecking(false)
        return
      }

      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(async () => {
        setChecking(true)
        try {
          const res  = await fetch(`${API_BASE}/api/check-doc-number`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ docType, number: currentValue, currentDocId }),
          })
          const data = await res.json()
          setDuplicate(data.isDuplicate ? (data.usedBy ?? {}) : null)
        } catch {
          // Silently ignore — don't block the user on check failures
          setDuplicate(null)
        } finally {
          setChecking(false)
        }
      }, 500)

      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
      }
    }, [currentValue, currentDocId])

    // ── Generate next number ───────────────────────────────────────────────────
    const handleGenerate = async () => {
      setGenerating(true)
      setGenError(null)
      try {
        const res  = await fetch(`${API_BASE}/api/next-doc-number`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            docType,
            contractTypeId: contractTypeRef,
            fixedPrefix,
            dateOverride,
            currentNumber:  currentValue || undefined,
            currentDocId:   currentDocId?.replace(/^drafts\./, ''),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        props.onChange(set(data.number))
        setDuplicate(null)
      } catch (err: any) {
        setGenError(err?.message ?? 'Failed to generate number')
      } finally {
        setGenerating(false)
      }
    }

    const hasValue = !!currentValue.trim()

    return (
      <Stack space={2}>
        {props.renderDefault(props)}

        {!prefixReady && (
          <Card padding={2} radius={2} tone="caution" border>
            <Text size={1}>Select a Contract Type above before generating a number.</Text>
          </Card>
        )}

        {/* ── Action row ──────────────────────────────────────────────────── */}
        <Flex align="center" gap={2}>
          {generating ? (
            <>
              <Spinner muted />
              <Text size={1} muted>Generating…</Text>
            </>
          ) : (
            <Button
              text={hasValue ? `↺ Regenerate Number` : `🔢 Generate Number`}
              mode="ghost"
              tone={hasValue ? 'caution' : 'primary'}
              disabled={!prefixReady}
              title={
                !prefixReady
                  ? 'Select a Contract Type first'
                  : hasValue
                    ? 'Overwrite with the next available number for this month'
                    : 'Auto-fill the next available number'
              }
              onClick={handleGenerate}
            />
          )}
          {checking && <Text size={0} muted>Checking for duplicates…</Text>}
        </Flex>

        {/* ── Duplicate warning ────────────────────────────────────────────── */}
        {duplicate && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={1}>
              ⚠ This number is already used by{' '}
              <strong>{duplicate.customerName ?? 'another customer'}</strong>
              {duplicate.projectName ? ` — ${duplicate.projectName}` : ''}.
              {' '}You can still save it for a reissue.
            </Text>
          </Card>
        )}

        {/* ── Generation error ─────────────────────────────────────────────── */}
        {genError && (
          <Text size={0} style={{ color: '#e05252' }}>{genError}</Text>
        )}
      </Stack>
    )
  }

  AutoNumberInput.displayName = `AutoNumberInput(${docType})`
  return AutoNumberInput
}
