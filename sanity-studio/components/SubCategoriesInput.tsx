import { useCallback, useEffect, useState } from 'react'
import { set, unset, useFormValue, useClient } from 'sanity'
import type { ArrayOfPrimitivesInputProps } from 'sanity'
import { Stack, Flex, Checkbox, Text, Card, Box, Spinner } from '@sanity/ui'

// Subcategory options are sourced live from the Global Category Config singleton
// (categoryConfig-global), keyed by the offer's selected `category`. Adding a
// subcategory there flows through here automatically — nothing is hardcoded.
// Prefers the draft so editors see freshly-added subcategories before publishing.

interface SubcatOption { title: string; value: string }

const CONFIG_QUERY = `
  coalesce(
    *[_id == "drafts.categoryConfig-global"][0],
    *[_id == "categoryConfig-global"][0]
  ).categories[id == $category][0].subcategories[]{
    "value": id,
    "title": coalesce(label.en, label.th, id)
  }
`

export function SubCategoriesInput(props: ArrayOfPrimitivesInputProps) {
  const { value = [], onChange } = props
  const client   = useClient({ apiVersion: '2024-01-01' })
  const category = useFormValue(['category']) as string | undefined
  const current  = value as string[]

  const [options, setOptions] = useState<SubcatOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!category) {
      setOptions([])
      return
    }
    let cancelled = false
    setLoading(true)
    client
      .fetch<SubcatOption[] | null>(CONFIG_QUERY, { category })
      .then(rows => {
        if (cancelled) return
        setOptions((rows ?? []).filter(o => o?.value))
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [category, client])

  const toggle = useCallback(
    (optValue: string, checked: boolean) => {
      const next = checked
        ? [...current, optValue]
        : current.filter(v => v !== optValue)
      onChange(next.length > 0 ? set(next) : unset())
    },
    [current, onChange],
  )

  if (!category) {
    return (
      <Card padding={3} tone="caution" border radius={2}>
        <Text size={1} muted>Select a Category first.</Text>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card padding={3} border radius={2}>
        <Flex align="center" gap={3}>
          <Spinner muted />
          <Text size={1} muted>Loading sub-categories…</Text>
        </Flex>
      </Card>
    )
  }

  if (options.length === 0) {
    return (
      <Card padding={3} tone="caution" border radius={2}>
        <Text size={1} muted>No subcategories defined for "{category}" in Global Category Config.</Text>
      </Card>
    )
  }

  return (
    <Card padding={3} border radius={2}>
      <Stack space={3}>
        {options.map(opt => (
          <Flex key={opt.value} align="center" gap={3}>
            <Checkbox
              id={`subcat-${opt.value}`}
              checked={current.includes(opt.value)}
              onChange={e => toggle(opt.value, e.currentTarget.checked)}
            />
            <Box>
              <Text
                as="label"
                size={1}
                weight="medium"
                style={{ cursor: 'pointer' }}
              >
                {opt.title}
              </Text>
            </Box>
          </Flex>
        ))}
      </Stack>
    </Card>
  )
}
