/**
 * PosterImageAIInput
 *
 * Wraps the native Sanity image upload for the posterImage field.
 * When a notice document has an uploaded poster image, shows a
 * "🤖 Read Image with AI" button right under the upload box that
 * calls Claude vision to extract:
 *   - Title (Thai)            → media.title
 *   - English title           → media.altText
 *   - Project                 → media.projects[]   (single ref, replaces array)
 *   - Provider (juristic)     → media.provider
 *   - Sub-category            → media.subCategories[]  (single string, replaces array)
 *
 * Each extracted field is shown as an opt-in card. Nothing is patched until
 * the user explicitly ticks fields + clicks Apply.
 *
 * Project conflict warning: if the form's `projects` field already points at a
 * different project, the project card surfaces a caution badge so the editor
 * sees the override happening before they apply.
 */

import { useState, useCallback }       from 'react'
import { Stack, Button, Flex, Text, Card, Spinner, Badge } from '@sanity/ui'
import { useFormValue, useDocumentOperation }              from 'sanity'
import type { ImageInputProps }                            from 'sanity'

const API_URL =
  (process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app') +
  '/api/read-notice-image'

const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'

function refToUrl(ref: string): string | null {
  if (!ref?.startsWith('image-')) return null
  const body     = ref.slice('image-'.length)
  const lastDash = body.lastIndexOf('-')
  if (lastDash === -1) return null
  const ext  = body.slice(lastDash + 1)
  const name = body.slice(0, lastDash)
  return `https://cdn.sanity.io/images/${PROJECT_ID}/${DATASET}/${name}.${ext}`
}

interface ReadResult {
  title?:            string | null
  titleEn?:          string | null
  summary?:          string | null
  projectId?:        string | null
  projectName?:      string | null
  providerId?:       string | null
  providerName?:     string | null
  subCategoryId?:    string | null
  subCategoryLabel?: string | null
}

export function PosterImageAIInput(props: ImageInputProps) {
  const rawId   = useFormValue(['_id'])   as string | undefined
  const kind    = useFormValue(['kind'])  as string | undefined
  const docId   = (rawId ?? '').replace(/^drafts\./, '')
  const { patch } = useDocumentOperation(docId || 'placeholder', 'media')

  // Current projects field — used for the conflict warning on the Project card.
  const currentProjects   = useFormValue(['projects']) as Array<{ _ref?: string }> | undefined
  const currentProjectRef = currentProjects?.[0]?._ref

  const imageRef = (props.value as any)?.asset?._ref as string | undefined
  const imageUrl = imageRef ? refToUrl(imageRef) : null
  // Show the AI reader for notices AND promos — a promo's poster (e.g. an
  // exhibition/event flyer) can auto-fill the title the same way.
  const showRead = kind === 'notice' || kind === 'promo'

  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<ReadResult | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [error,    setError]    = useState('')
  const [applied,  setApplied]  = useState(false)

  const runRead = useCallback(async () => {
    if (!imageUrl) return
    setLoading(true)
    setResult(null)
    setError('')
    setSelected({})
    setApplied(false)

    try {
      const res  = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageUrl }),
      })
      const data = await res.json() as ReadResult
      if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`)
      setResult(data)
      // Pre-tick everything that came back EXCEPT English (editor opts in to that).
      // The ID-returning fields had to match a candidate list to come back at all,
      // so high-confidence by construction.
      setSelected({
        title:         !!data.title,
        altText:       false,  // English off by default
        projectId:     !!data.projectId,
        providerId:    !!data.providerId,
        subCategoryId: !!data.subCategoryId,
      })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to read image')
    } finally {
      setLoading(false)
    }
  }, [imageUrl])

  const applySelected = useCallback(() => {
    if (!result) return
    const patches: Record<string, any> = {}

    if (selected.title   && result.title)   patches.title   = result.title
    if (selected.altText && result.titleEn) patches.altText = result.titleEn

    if (selected.projectId && result.projectId) {
      patches.projects = [{
        _type: 'reference',
        _ref:  result.projectId,
        _key:  Math.random().toString(36).slice(2, 10),
      }]
    }

    if (selected.providerId && result.providerId) {
      patches.provider = { _type: 'reference', _ref: result.providerId }
    }

    if (selected.subCategoryId && result.subCategoryId) {
      patches.subCategories = [result.subCategoryId]
    }

    if (Object.keys(patches).length === 0) return
    patch.execute([{ set: patches }])
    setApplied(true)
    setResult(null)
  }, [result, selected, patch])

  const projectConflict =
    !!(result?.projectId && currentProjectRef && currentProjectRef !== result.projectId)

  return (
    <Stack space={3}>

      {/* Native image upload */}
      {props.renderDefault(props)}

      {/* AI button — notices + promos with an uploaded image */}
      {showRead && (
        <Stack space={2}>
          <Button
            text={loading ? 'Reading image…' : '🤖 Read Image with AI'}
            mode="ghost"
            tone="primary"
            disabled={!imageUrl || loading}
            onClick={runRead}
            icon={loading ? () => <Spinner /> : undefined}
          />

          {!imageUrl && (
            <Text size={0} muted>Upload an image above first.</Text>
          )}

          {applied && (
            <Card padding={2} radius={2} tone="positive" border>
              <Text size={0}>✅ Fields applied — review and publish.</Text>
            </Card>
          )}

          {error && (
            <Card padding={2} radius={2} tone="critical" border>
              <Text size={0}>{error}</Text>
            </Card>
          )}

          {result && (
            <Card padding={3} radius={2} border tone="primary">
              <Stack space={3}>
                <Text size={0} weight="semibold">Select fields to apply:</Text>

                {/* Title (Thai) */}
                {result.title && (
                  <Card
                    padding={2} radius={2} border
                    tone={selected.title ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, title: !p.title }))}
                  >
                    <Flex align="flex-start" gap={2}>
                      <input
                        type="checkbox"
                        checked={!!selected.title}
                        onChange={() => setSelected(p => ({ ...p, title: !p.title }))}
                        style={{ marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <Stack space={1}>
                        <Flex gap={2} align="center">
                          <Text size={0} muted weight="semibold">Title (Thai)</Text>
                          <Badge tone="primary" mode="outline" fontSize={0}>→ Title field</Badge>
                        </Flex>
                        <Text size={1}>{result.title}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* English title (writes to altText, not title) */}
                {result.titleEn && (
                  <Card
                    padding={2} radius={2} border
                    tone={selected.altText ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, altText: !p.altText }))}
                  >
                    <Flex align="flex-start" gap={2}>
                      <input
                        type="checkbox"
                        checked={!!selected.altText}
                        onChange={() => setSelected(p => ({ ...p, altText: !p.altText }))}
                        style={{ marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <Stack space={1}>
                        <Flex gap={2} align="center">
                          <Text size={0} muted weight="semibold">English</Text>
                          <Badge tone="default" mode="outline" fontSize={0}>→ Alt Text field</Badge>
                        </Flex>
                        <Text size={1}>{result.titleEn}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* Project (with conflict warning if form already holds a different project) */}
                {result.projectId && result.projectName && (
                  <Card
                    padding={2} radius={2} border
                    tone={selected.projectId ? (projectConflict ? 'caution' : 'positive') : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, projectId: !p.projectId }))}
                  >
                    <Flex align="flex-start" gap={2}>
                      <input
                        type="checkbox"
                        checked={!!selected.projectId}
                        onChange={() => setSelected(p => ({ ...p, projectId: !p.projectId }))}
                        style={{ marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <Stack space={1}>
                        <Flex gap={2} align="center">
                          <Text size={0} muted weight="semibold">Project</Text>
                          <Badge tone="primary" mode="outline" fontSize={0}>→ Projects field</Badge>
                          {projectConflict && (
                            <Badge tone="caution" mode="default" fontSize={0}>⚠ Form has a different project</Badge>
                          )}
                        </Flex>
                        <Text size={1}>{result.projectName}</Text>
                        {projectConflict && (
                          <Text size={0} muted style={{ color: 'var(--card-caution-fg-color)' }}>
                            Applying will overwrite the existing project.
                          </Text>
                        )}
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* Provider (juristic office) */}
                {result.providerId && result.providerName && (
                  <Card
                    padding={2} radius={2} border
                    tone={selected.providerId ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, providerId: !p.providerId }))}
                  >
                    <Flex align="flex-start" gap={2}>
                      <input
                        type="checkbox"
                        checked={!!selected.providerId}
                        onChange={() => setSelected(p => ({ ...p, providerId: !p.providerId }))}
                        style={{ marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <Stack space={1}>
                        <Flex gap={2} align="center">
                          <Text size={0} muted weight="semibold">Provider (Juristic Office)</Text>
                          <Badge tone="primary" mode="outline" fontSize={0}>→ Provider field</Badge>
                        </Flex>
                        <Text size={1}>{result.providerName}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* Sub-category */}
                {result.subCategoryId && result.subCategoryLabel && (
                  <Card
                    padding={2} radius={2} border
                    tone={selected.subCategoryId ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, subCategoryId: !p.subCategoryId }))}
                  >
                    <Flex align="flex-start" gap={2}>
                      <input
                        type="checkbox"
                        checked={!!selected.subCategoryId}
                        onChange={() => setSelected(p => ({ ...p, subCategoryId: !p.subCategoryId }))}
                        style={{ marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <Stack space={1}>
                        <Flex gap={2} align="center">
                          <Text size={0} muted weight="semibold">Sub-category</Text>
                          <Badge tone="primary" mode="outline" fontSize={0}>→ Sub-categories field</Badge>
                        </Flex>
                        <Text size={1}>{result.subCategoryLabel}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* Summary — read only */}
                {result.summary && (
                  <Card padding={2} radius={2} tone="transparent" border>
                    <Stack space={1}>
                      <Text size={0} muted weight="semibold">Summary (reference only)</Text>
                      <Text size={0} muted>{result.summary}</Text>
                    </Stack>
                  </Card>
                )}

                <Flex gap={2} justify="flex-end">
                  <Button text="Dismiss" mode="ghost" fontSize={0} onClick={() => setResult(null)} />
                  <Button
                    text="Apply selected"
                    tone="primary"
                    fontSize={0}
                    disabled={!Object.values(selected).some(Boolean)}
                    onClick={applySelected}
                  />
                </Flex>
              </Stack>
            </Card>
          )}
        </Stack>
      )}

    </Stack>
  )
}
