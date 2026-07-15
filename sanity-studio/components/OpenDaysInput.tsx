/**
 * OpenDaysInput — 7 single-letter day chips (M T W T F S S) on ONE row.
 * Replaces the default array-checkbox grid (which wraps at 4 columns).
 * Value stays a plain string[] of day codes in canonical mon…sun order,
 * so every reader (bake, kiosk, handoff, submit) is untouched.
 */
import { Button, Flex } from '@sanity/ui'
import { set, unset, type ArrayOfPrimitivesInputProps } from 'sanity'

const DAYS: Array<[code: string, label: string]> = [
  ['mon', 'M'], ['tue', 'T'], ['wed', 'W'], ['thu', 'T'],
  ['fri', 'F'], ['sat', 'S'], ['sun', 'S'],
]

export function OpenDaysInput(props: ArrayOfPrimitivesInputProps) {
  const value = (props.value as string[] | undefined) ?? []

  const toggle = (code: string) => {
    const on = value.includes(code)
    // rebuild in canonical order so the stored array never scrambles
    const next = DAYS.map(([c]) => c).filter((c) => (c === code ? !on : value.includes(c)))
    props.onChange(next.length ? set(next) : unset())
  }

  return (
    <Flex gap={2}>
      {DAYS.map(([code, label]) => {
        const on = value.includes(code)
        return (
          <Button
            key={code}
            text={label}
            mode={on ? 'default' : 'ghost'}
            tone={on ? 'primary' : 'default'}
            onClick={() => toggle(code)}
            style={{ flex: 1, textAlign: 'center' }}
          />
        )
      })}
    </Flex>
  )
}
