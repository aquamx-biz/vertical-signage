import { useState } from 'react'
import { Stack, Button, Spinner, Flex, Text } from '@sanity/ui'
import { set } from 'sanity'
import { useFormValue } from 'sanity'

// Covers both string and text field props
type AnyStringInputProps = {
  renderDefault: (props: any) => React.ReactNode
  onChange: (patch: any) => void
  value?: string
}

const TRANSLATE_API_URL =
  process.env.SANITY_STUDIO_TRANSLATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/translate'

interface TranslateInputOptions {
  /** Field name to read source text from */
  sourceField: string
  /** BCP-47 language name sent to the API, e.g. 'Thai' or 'English' (default: 'Thai') */
  sourceLang?: string
  /** BCP-47 language name sent to the API, e.g. 'English' or 'Thai' (default: 'English') */
  targetLang?: string
  /** Button label override */
  buttonLabel?: string
  /** Read sourceField from the same object as this field (e.g. inside an array item) */
  sibling?: boolean
}

/**
 * Factory that returns a custom Sanity input component with a
 * translate button that reads from `sourceField`.
 *
 * Usage in schema:
 *   components: { input: createTranslateInput('addressTh') }
 *   components: { input: createTranslateInput({ sourceField: 'legalName_en', sourceLang: 'English', targetLang: 'Thai' }) }
 */
export function createTranslateInput(options: string | TranslateInputOptions) {
  const {
    sourceField,
    sourceLang  = 'Thai',
    targetLang  = 'English',
    buttonLabel,
    sibling     = false,
  } = typeof options === 'string' ? { sourceField: options } : options

  const label      = buttonLabel ?? `✨ Translate from ${sourceLang}`
  const emptyHint  = `Fill in the ${sourceLang} field first`

  function TranslateInput(props: AnyStringInputProps) {
    const [loading, setLoading] = useState(false)
    const [error,   setError]   = useState<string | null>(null)

    const sourcePath  = sibling ? [...(((props as any).path ?? []) as any[]).slice(0, -1), sourceField] : [sourceField]
    const sourceValue = useFormValue(sourcePath) as string | undefined
    const hasSource   = !!sourceValue?.trim()

    const handleTranslate = async () => {
      if (!sourceValue?.trim()) return
      setLoading(true)
      setError(null)
      try {
        const res  = await fetch(TRANSLATE_API_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ text: sourceValue, sourceLang, targetLang }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        props.onChange(set(data.translated))
      } catch (err: any) {
        setError(err?.message ?? 'Translation failed')
      } finally {
        setLoading(false)
      }
    }

    return (
      <Stack space={2}>
        {props.renderDefault(props)}

        <Flex align="center" gap={2}>
          {loading ? (
            <>
              <Spinner muted />
              <Text size={1} muted>Translating…</Text>
            </>
          ) : (
            <Button
              text={label}
              mode="ghost"
              tone="primary"
              disabled={!hasSource}
              title={hasSource ? label : emptyHint}
              onClick={handleTranslate}
            />
          )}
          {!hasSource && !loading && (
            <Text size={0} muted>{emptyHint}</Text>
          )}
        </Flex>

        {error && (
          <Text size={0} style={{ color: '#e05252' }}>{error}</Text>
        )}
      </Stack>
    )
  }

  TranslateInput.displayName = `TranslateInput(${sourceField})`
  return TranslateInput
}
