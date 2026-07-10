import { useState } from 'react'
import { useClient } from 'sanity'
import type { DocumentActionProps } from 'sanity'

type SlotResult = { projectId: string; ok: boolean; text: string }

/**
 * Manual "Add to Playlist" fallback action — appears in the ••• menu on Media docs.
 *
 * Uses the same exclude-based target resolution as MediaPublishAction:
 *   kind="notice" or scope="project" → targets = media.projects[]
 *   scope="global"                   → targets = all active projects MINUS media.excludedProjects[]
 *
 * No project picker. Targets are pre-configured in the form via the checklist.
 * Always shows a result dialog summarising what was created / skipped.
 *
 * For removal of existing slots, use the "Remove from Playlist on Publish" checkbox
 * on the form and press Publish (handled by MediaPublishAction).
 */
export function AddToPlaylistAction(props: DocumentActionProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [busy,    setBusy]    = useState(false)
  const [open,    setOpen]    = useState(false)
  const [results, setResults] = useState<SlotResult[]>([])

  const doc           = (props.published ?? props.draft) as Record<string, any> | null
  const kind          = doc?.kind             as string | undefined
  const scope         = doc?.scope            as string | undefined
  const docProjs      = (doc?.projects        ?? []) as Array<{ _ref: string }>
  const excludedProjs = (doc?.excludedProjects ?? []) as Array<{ _ref: string }>

  // ── Resolve target project refs ─────────────────────────────────────────────
  // Notices: the scope field is hidden in the form and defaults to 'global',
  // which would wrongly target every active project. Notices always target
  // exactly the project(s) listed in their projects[] field instead.
  async function resolveTargets(): Promise<string[]> {
    if (kind === 'notice' || scope === 'project') {
      return docProjs.map(p => p._ref)
    }
    if (scope === 'global') {
      const allIds = await client.fetch<string[]>(
        `*[_type == "project" && isActive == true]._id`,
        {}
      )
      const excludedIds = new Set(excludedProjs.map(p => p._ref))
      return allIds.filter(id => !excludedIds.has(id))
    }
    return []
  }

  // ── Create one slot, return result ─────────────────────────────────────────
  async function createSlot(projectId: string): Promise<SlotResult> {
    try {
      const dup = await client.fetch<string | null>(
        `*[_type == "playlistItem" && media._ref == $m && project._ref == $p][0]._id`,
        { m: props.id, p: projectId }
      )
      if (dup) {
        return { projectId, ok: false, text: 'Slot already exists — skipped.' }
      }

      const orders = await client.fetch<number[]>(
        `*[_type == "playlistItem" && project._ref == $p].order`,
        { p: projectId }
      )
      const next = (orders.length ? Math.max(...orders) : 0) + 10

      await client.create({
        // published directly — the kiosk build reads published-only; a draft slot never airs
        _id:     crypto.randomUUID(),
        _type:   'playlistItem',
        project: { _type: 'reference', _ref: projectId },
        media:   { _type: 'reference', _ref: props.id },
        order:   next,
        enabled: true,
      })
      return { projectId, ok: true, text: `Slot created at order ${next}.` }
    } catch (err: any) {
      return { projectId, ok: false, text: err?.message ?? String(err) }
    }
  }

  // ── Main handler ───────────────────────────────────────────────────────────
  async function onHandle() {
    setBusy(true)
    setResults([])

    let targets: string[]
    try {
      targets = await resolveTargets()
    } catch (err: any) {
      setResults([{ projectId: '', ok: false, text: err?.message ?? String(err) }])
      setBusy(false)
      setOpen(true)
      return
    }

    if (targets.length === 0) {
      setResults([{
        projectId: '',
        ok: false,
        text: scope === 'project' || kind === 'notice'
          ? 'No project assigned. Pick at least one project in the Projects field first.'
          : 'All projects are excluded. Uncheck some projects in the "Excluded Projects" checklist.',
      }])
      setBusy(false)
      setOpen(true)
      return
    }

    const slotResults: SlotResult[] = []
    for (const id of targets) {
      slotResults.push(await createSlot(id))
    }

    setBusy(false)
    setResults(slotResults)
    setOpen(true)
  }

  const okCount  = results.filter(r => r.ok).length
  const errCount = results.filter(r => !r.ok).length

  return {
    label:    busy ? 'Adding…' : 'Add to Playlist',
    disabled: busy,
    tone:     'positive' as const,

    onHandle,

    dialog: open ? {
      type:   'dialog' as const,
      id:     'add-to-playlist',
      header: 'Add to Playlist — Results',
      onClose: () => {
        setOpen(false)
        setResults([])
        props.onComplete()
      },
      content: (
        <div style={{ padding: '1.5rem', minWidth: 300, maxWidth: 480 }}>
          {results.length > 1 && (
            <p style={{ marginBottom: '0.75rem', fontWeight: 600 }}>
              {okCount} slot{okCount !== 1 ? 's' : ''} created
              {errCount > 0 ? `, ${errCount} skipped` : ''}.
            </p>
          )}
          <ul
            style={{
              listStyle:     'none',
              margin:        0,
              padding:       0,
              display:       'flex',
              flexDirection: 'column',
              gap:           '0.4rem',
              maxHeight:     300,
              overflowY:     'auto',
            }}
          >
            {results.map((r, i) => (
              <li key={i} style={{ color: r.ok ? 'green' : 'crimson', fontSize: '0.9em' }}>
                {r.ok ? '✓' : '✗'} {r.text}
              </li>
            ))}
          </ul>
          {okCount > 0 && (
            <p style={{ marginTop: '1rem', fontSize: '0.82em', color: '#666' }}>
              Go to <strong>Playlist Items</strong> to publish newly created slots.
            </p>
          )}
        </div>
      ),
    } : undefined,
  }
}
