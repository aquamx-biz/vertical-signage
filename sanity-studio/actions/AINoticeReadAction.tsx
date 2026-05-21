/**
 * AINoticeReadAction
 *
 * Document action for media documents (kind = "notice").
 * Sends the uploaded poster image to Claude vision via /api/read-notice-image
 * and lets the user opt in to apply any combination of:
 *   - Title (Thai)             → media.title
 *   - Title (English)          → media.title (only if Thai not selected)
 *   - Project                  → media.projects[]  (single ref, replaces array)
 *   - Provider (juristic)      → media.provider
 *   - Sub-category             → media.subCategories[] (single string, replaces array)
 *
 * Provider candidates are scoped by Claude to the picked project's projectSite,
 * so a notice for Mahogany will only show juristic providers tied to Mahogany.
 *
 * URL conflict guard: if the form's `projects` field is already populated with a
 * different project than AI's pick, the project card surfaces a warning so the
 * editor sees both values before applying.
 */

import { useState, useCallback } from 'react'
import { useToast, Box, Stack, Text, Button, Flex, Card, Spinner, Badge } from '@sanity/ui'
import type { DocumentActionProps } from 'sanity'
import { useDocumentOperation } from 'sanity'

const API_URL =
  (process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app') +
  '/api/read-notice-image'

const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'

// Build a public Sanity CDN URL from an image asset _ref
// ref format: "image-{hash}-{WxH}-{ext}"  →  cdn.sanity.io/.../hash-WxH.ext
function refToUrl(ref: string): string | null {
  if (!ref?.startsWith('image-')) return null
  const body      = ref.slice('image-'.length)          // "abc123-1080x1920-jpg"
  const lastDash  = body.lastIndexOf('-')
  if (lastDash === -1) return null
  const ext       = body.slice(lastDash + 1)             // "jpg"
  const name      = body.slice(0, lastDash)              // "abc123-1080x1920"
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

export function AINoticeReadAction(props: DocumentActionProps) {
  const { patch }  = useDocumentOperation(props.id, props.type)
  const toast      = useToast()
  const doc        = (props.draft ?? props.published) as any

  const isNotice  = doc?.kind === 'notice'
  const imageRef  = doc?.posterImage?.asset?._ref as string | undefined
  const imageUrl  = imageRef ? refToUrl(imageRef) : null

  // Read current doc state for the conflict-warning rendering on the Project card.
  // NOTE: document actions are rendered outside the FormValueProvider, so we can't
  // use useFormValue() here — read from props.draft (already available) instead.
  const currentProjects   = (doc?.projects ?? []) as Array<{ _ref?: string }>
  const currentProjectRef = currentProjects[0]?._ref

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<ReadResult | null>(null)
  const [selected,   setSelected]   = useState<Record<string, boolean>>({})
  const [error,      setError]      = useState('')

  const runRead = useCallback(async () => {
    if (!imageUrl) return
    setDialogOpen(true)
    setLoading(true)
    setResult(null)
    setError('')
    setSelected({})

    try {
      const res  = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageUrl }),
      })
      const data = await res.json() as ReadResult
      if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`)

      // Pre-select whichever fields came back with a value.
      // English title is OFF by default (editor opts in). All other AI picks
      // are ON by default since they had to match candidate-list IDs to come back.
      const sel: Record<string, boolean> = {}
      if (data.title)         sel.title         = true
      if (data.titleEn)       sel.titleEn       = false
      if (data.projectId)     sel.projectId     = true
      if (data.providerId)    sel.providerId    = true
      if (data.subCategoryId) sel.subCategoryId = true
      setResult(data)
      setSelected(sel)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to read image')
    } finally {
      setLoading(false)
    }
  }, [imageUrl])

  const applySelected = useCallback(() => {
    if (!result) return
    const patches: Record<string, any> = {}

    // ── Title ────────────────────────────────────────────────────────────────
    if (selected.title   && result.title)   patches.title = result.title
    if (selected.titleEn && result.titleEn && !selected.title) patches.title = result.titleEn

    // ── Project (writes single-element projects array — notices target one project) ──
    if (selected.projectId && result.projectId) {
      patches.projects = [{
        _type: 'reference',
        _ref:  result.projectId,
        _key:  Math.random().toString(36).slice(2, 10),
      }]
    }

    // ── Provider (single reference) ───────────────────────────────────────────
    if (selected.providerId && result.providerId) {
      patches.provider = { _type: 'reference', _ref: result.providerId }
    }

    // ── Sub-category (single-element string array) ───────────────────────────
    if (selected.subCategoryId && result.subCategoryId) {
      patches.subCategories = [result.subCategoryId]
    }

    if (Object.keys(patches).length === 0) return

    patch.execute([{ set: patches }])
    toast.push({
      status:      'success',
      title:       `✅ ${Object.keys(patches).length} field${Object.keys(patches).length !== 1 ? 's' : ''} applied`,
      description: 'Verify and publish when ready.',
      duration:    5000,
    })
    setDialogOpen(false)
  }, [result, selected, patch, toast])

  const selectedCount = Object.values(selected).filter(Boolean).length

  const projectConflict =
    !!(result?.projectId && currentProjectRef && currentProjectRef !== result.projectId)

  const disabledReason = !isNotice
    ? 'Only available for Notice (building update) media — change Kind to Notice first'
    : !imageUrl
      ? 'Upload a Poster Image first, then click this button'
      : null

  return {
    label:    '🤖 Read Image',
    title:    disabledReason ?? 'Read the uploaded notice image with AI and fill in fields',
    disabled: !!disabledReason,
    onHandle:  runRead,

    dialog: dialogOpen ? {
      type:    'dialog' as const,
      header:  '🤖 AI Notice Reader',
      onClose: () => setDialogOpen(false),
      content: (
        <Box padding={4}>
          <Stack space={4}>

            {loading && (
              <Flex align="center" gap={3} padding={4} justify="center">
                <Spinner />
                <Text size={2}>Reading notice image…</Text>
              </Flex>
            )}

            {error && (
              <Card tone="critical" padding={3} radius={2} border>
                <Text size={1}>{error}</Text>
              </Card>
            )}

            {!loading && result && (
              <Stack space={3}>
                <Text size={1} muted>
                  Select the fields to apply. <strong>Always verify before publishing.</strong>
                </Text>

                {/* ── Thai title ─────────────────────────────────────────── */}
                {result.title && (
                  <Card
                    padding={3}
                    radius={2}
                    border
                    tone={selected.title ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, title: !p.title }))}
                  >
                    <Flex align="flex-start" gap={3}>
                      <input
                        type="checkbox"
                        checked={!!selected.title}
                        onChange={() => setSelected(p => ({ ...p, title: !p.title }))}
                        style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <Stack space={1} style={{ flex: 1 }}>
                        <Flex align="center" gap={2}>
                          <Text size={0} weight="semibold" muted>Title (Thai)</Text>
                          <Badge tone="primary" mode="outline" fontSize={0}>→ title field</Badge>
                        </Flex>
                        <Text size={1}>{result.title}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* ── English title ──────────────────────────────────────── */}
                {result.titleEn && (
                  <Card
                    padding={3}
                    radius={2}
                    border
                    tone={selected.titleEn ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, titleEn: !p.titleEn }))}
                  >
                    <Flex align="flex-start" gap={3}>
                      <input
                        type="checkbox"
                        checked={!!selected.titleEn}
                        onChange={() => setSelected(p => ({ ...p, titleEn: !p.titleEn }))}
                        style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <Stack space={1} style={{ flex: 1 }}>
                        <Flex align="center" gap={2}>
                          <Text size={0} weight="semibold" muted>Title (English)</Text>
                          <Badge tone="default" mode="outline" fontSize={0}>→ title field (if Thai not selected)</Badge>
                        </Flex>
                        <Text size={1}>{result.titleEn}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* ── Project (with conflict warning if form already has a different project) ── */}
                {result.projectId && result.projectName && (
                  <Card
                    padding={3}
                    radius={2}
                    border
                    tone={selected.projectId ? (projectConflict ? 'caution' : 'positive') : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, projectId: !p.projectId }))}
                  >
                    <Flex align="flex-start" gap={3}>
                      <input
                        type="checkbox"
                        checked={!!selected.projectId}
                        onChange={() => setSelected(p => ({ ...p, projectId: !p.projectId }))}
                        style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <Stack space={1} style={{ flex: 1 }}>
                        <Flex align="center" gap={2}>
                          <Text size={0} weight="semibold" muted>Project</Text>
                          <Badge tone="primary" mode="outline" fontSize={0}>→ projects field</Badge>
                          {projectConflict && (
                            <Badge tone="caution" mode="default" fontSize={0}>⚠ Form has a different project</Badge>
                          )}
                        </Flex>
                        <Text size={1}>{result.projectName}</Text>
                        {projectConflict && (
                          <Text size={0} muted style={{ color: 'var(--card-caution-fg-color)' }}>
                            Applying will overwrite the existing project on this document.
                          </Text>
                        )}
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* ── Provider (juristic) ────────────────────────────────── */}
                {result.providerId && result.providerName && (
                  <Card
                    padding={3}
                    radius={2}
                    border
                    tone={selected.providerId ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, providerId: !p.providerId }))}
                  >
                    <Flex align="flex-start" gap={3}>
                      <input
                        type="checkbox"
                        checked={!!selected.providerId}
                        onChange={() => setSelected(p => ({ ...p, providerId: !p.providerId }))}
                        style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <Stack space={1} style={{ flex: 1 }}>
                        <Flex align="center" gap={2}>
                          <Text size={0} weight="semibold" muted>Provider (Juristic Office)</Text>
                          <Badge tone="primary" mode="outline" fontSize={0}>→ provider field</Badge>
                        </Flex>
                        <Text size={1}>{result.providerName}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* ── Sub-category ───────────────────────────────────────── */}
                {result.subCategoryId && result.subCategoryLabel && (
                  <Card
                    padding={3}
                    radius={2}
                    border
                    tone={selected.subCategoryId ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, subCategoryId: !p.subCategoryId }))}
                  >
                    <Flex align="flex-start" gap={3}>
                      <input
                        type="checkbox"
                        checked={!!selected.subCategoryId}
                        onChange={() => setSelected(p => ({ ...p, subCategoryId: !p.subCategoryId }))}
                        style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <Stack space={1} style={{ flex: 1 }}>
                        <Flex align="center" gap={2}>
                          <Text size={0} weight="semibold" muted>Sub-category</Text>
                          <Badge tone="primary" mode="outline" fontSize={0}>→ subCategories field</Badge>
                        </Flex>
                        <Text size={1}>{result.subCategoryLabel}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* ── Summary (read-only context, not applied) ─────────── */}
                {result.summary && (
                  <Card padding={3} radius={2} border tone="transparent">
                    <Stack space={1}>
                      <Text size={0} weight="semibold" muted>Summary (for reference only)</Text>
                      <Text size={1} muted>{result.summary}</Text>
                    </Stack>
                  </Card>
                )}

                <Card padding={3} radius={2} tone="caution" border>
                  <Text size={0} muted>
                    ⚠ AI extraction may miss text or mistranslate. Always review before publishing.
                  </Text>
                </Card>

                <Flex gap={2} justify="flex-end">
                  <Button text="Cancel" mode="ghost" onClick={() => setDialogOpen(false)} />
                  <Button
                    text={selectedCount > 0 ? `Apply ${selectedCount} field${selectedCount !== 1 ? 's' : ''}` : 'Select a field'}
                    tone="primary"
                    disabled={selectedCount === 0}
                    onClick={applySelected}
                  />
                </Flex>
              </Stack>
            )}

            {!loading && !error && result &&
              !result.title && !result.titleEn &&
              !result.projectId && !result.providerId && !result.subCategoryId && (
              <Stack space={3}>
                <Card padding={4} tone="caution" border radius={2}>
                  <Text size={1} muted align="center">
                    No readable text found in the image, and no project/provider/subcategory could be inferred.
                    Try a clearer or higher-resolution poster image.
                  </Text>
                </Card>
                <Flex justify="flex-end">
                  <Button text="Close" mode="ghost" onClick={() => setDialogOpen(false)} />
                </Flex>
              </Stack>
            )}

          </Stack>
        </Box>
      ),
    } : undefined,
  }
}
