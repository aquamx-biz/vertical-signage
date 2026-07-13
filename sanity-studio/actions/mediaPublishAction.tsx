import { useState } from 'react'
import { useDocumentOperation, useClient } from 'sanity'
import type { DocumentActionProps } from 'sanity'

type SlotResult = { projectId: string; ok: boolean; text: string }
type DialogMode = 'add' | 'remove' | 'conflict'

/**
 * Replaces the default Publish action on Media documents.
 *
 * Two transient flags on the form can attach playlist work to a publish:
 *
 *   addToPlaylistOnPublish      → after publish, create one playlistItem slot
 *                                  per target project (dedup-skips duplicates).
 *   removeFromPlaylistOnPublish → after publish, delete every existing
 *                                  playlistItem slot whose media._ref matches
 *                                  this doc, across all target projects.
 *
 * Mutually exclusive: if both are true at publish time the publish is blocked
 * and an error dialog explains why. The user must uncheck one and try again.
 *
 * Both flags are reset to false after a successful publish — one-shot triggers.
 *
 * Target resolution (same rules for add and remove):
 *   kind="notice"   → targets = media.projects[]
 *   scope="project" → targets = media.projects[]
 *   scope="global"  → targets = all active projects MINUS media.excludedProjects[]
 *
 * A result dialog is shown only on errors / non-trivial output; pure success is silent.
 */
export function MediaPublishAction(props: DocumentActionProps) {
  const { publish } = useDocumentOperation(props.id, props.type)
  const client      = useClient({ apiVersion: '2024-01-01' })

  const [busy,       setBusy]       = useState(false)
  const [open,       setOpen]       = useState(false)
  const [results,    setResults]    = useState<SlotResult[]>([])
  const [dialogMode, setDialogMode] = useState<DialogMode>('add')

  // Read from draft (current editing state).
  const doc           = (props.draft ?? props.published) as Record<string, any> | null
  const kind          = doc?.kind             as string | undefined
  const scope         = doc?.scope            as string | undefined
  const docProjs      = (doc?.projects        ?? []) as Array<{ _ref: string }>
  const excludedProjs = (doc?.excludedProjects ?? []) as Array<{ _ref: string }>
  const addOnPub      = !!(doc?.addToPlaylistOnPublish)
  const removeOnPub   = !!(doc?.removeFromPlaylistOnPublish)
  const deployOnPub   = !!(doc?.deployOnPublish)

  // ── Resolve target project refs ────────────────────────────────────────────
  // Notices: scope is hidden in the form and defaults to 'global', which would
  // wrongly target every active project. Use projects[] directly for notices.
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

  // ── Delete every existing slot for this media within the target projects ──
  // Returns one ok:true entry per deleted slot, or one error entry on commit failure.
  // Returns [] when there are no slots to remove (silent no-op).
  async function deleteSlots(targets: string[]): Promise<SlotResult[]> {
    try {
      const slots = await client.fetch<Array<{ _id: string; projectId: string }>>(
        `*[_type == "playlistItem" && media._ref == $m && project._ref in $projects]{
          _id, "projectId": project._ref
        }`,
        { m: props.id, projects: targets },
      )
      if (slots.length === 0) return []
      const tx = client.transaction()
      slots.forEach(s => tx.delete(s._id))
      await tx.commit()
      return slots.map(s => ({ projectId: s.projectId, ok: true, text: 'Slot removed.' }))
    } catch (err: any) {
      return [{ projectId: '', ok: false, text: err?.message ?? String(err) }]
    }
  }

  // ── Reset both flags on the published doc — one-shot triggers ──────────────
  // Patches the published version directly (no draft created). If the reset
  // fails for any reason it is non-critical: the worst case is the next form
  // load still shows the flags ticked, which the user can fix manually.
  async function resetFlags() {
    try {
      await client
        .patch(props.id)
        .set({ addToPlaylistOnPublish: false, removeFromPlaylistOnPublish: false, deployOnPublish: false })
        .commit()
    } catch {
      /* non-critical */
    }
  }

  // ── Fire exactly ONE manual rebuild (the ?manual=1 gate is required) ───────
  // This is the per-publish "ส่งขึ้นจอทันที" choice that replaced the deleted
  // unfiltered Sanity webhook.
  async function fireDeploy(): Promise<boolean> {
    const url = 'https://app.aquamx.biz/api/sanity-webhook?manual=1'
    try {
      const res = await fetch(url, { method: 'POST' })
      const out = await res.json().catch(() => null)
      return !!out?.success
    } catch {
      try { await fetch(url, { method: 'POST', mode: 'no-cors' }); return true }
      catch { return false }
    }
  }

  // ── Main handler ───────────────────────────────────────────────────────────
  async function onHandle() {
    // Mutual exclusivity — refuse to publish when both flags are set.
    // We do NOT call publish.execute() in this branch; the user fixes and retries.
    if (addOnPub && removeOnPub) {
      setResults([{
        projectId: '',
        ok:        false,
        text:      '"Add to Playlist on Publish" and "Remove from Playlist on Publish" are both ticked. Untick one before publishing.',
      }])
      setDialogMode('conflict')
      setOpen(true)
      return
    }

    setBusy(true)
    publish.execute()

    // No flags set → standard publish, nothing else to do.
    if (!addOnPub && !removeOnPub && !deployOnPub) {
      setBusy(false)
      props.onComplete()
      return
    }

    // Give publish time to settle before we run patches / transactions.
    await new Promise(r => setTimeout(r, 800))

    let slotResults: SlotResult[] = []
    if (addOnPub || removeOnPub) {
      const targets = await resolveTargets()
      if (targets.length > 0) {
        if (addOnPub) {
          setDialogMode('add')
          for (const id of targets) {
            slotResults.push(await createSlot(id))
          }
        } else if (removeOnPub) {
          setDialogMode('remove')
          slotResults = await deleteSlots(targets)
        }
      }
    }

    // The per-publish deploy choice — runs AFTER slot work so the rebuild
    // bakes the slots this publish just created.
    if (deployOnPub) {
      const ok = await fireDeploy()
      slotResults.push({
        projectId: '',
        ok,
        text: ok
          ? '🚀 สั่งส่งขึ้นจอแล้ว — จอทุกตึกได้ของใหม่ใน ~5 นาที'
          : 'สั่งส่งขึ้นจอไม่สำเร็จ (เน็ต/Netlify มีปัญหา) — publish สำเร็จแล้ว ไปกด Deploy Now ที่ Pending Publish อีกครั้ง',
      })
    }

    await resetFlags()
    setBusy(false)

    if (slotResults.some(r => !r.ok)) {
      setResults(slotResults)
      setOpen(true)
    } else {
      props.onComplete()
    }
  }

  // ── Dialog text per mode ──────────────────────────────────────────────────
  const headerText =
    dialogMode === 'conflict' ? 'Publish blocked'
    : dialogMode === 'remove' ? 'Media published — Playlist slot removal results'
    :                           'Media published — Playlist slot results'

  const introText =
    dialogMode === 'conflict' ? null
    : dialogMode === 'remove' ? 'Media published. Playlist slot removal results:'
    :                           'Media published. Playlist slot results:'

  const footerText =
    dialogMode === 'add'
      ? 'Go to Playlist Items to publish newly created slots.'
      : null

  return {
    label:    busy ? 'Publishing…' : 'Publish',
    tone:     'positive' as const,
    disabled: !!publish.disabled || busy,

    onHandle,

    dialog: open ? {
      type:   'dialog' as const,
      id:     'media-publish-result',
      header: headerText,
      onClose: () => {
        setOpen(false)
        setResults([])
        props.onComplete()
      },
      content: (
        <div style={{ padding: '1.5rem', minWidth: 300, maxWidth: 480 }}>
          {introText && (
            <p style={{ marginBottom: '1rem', fontWeight: 600 }}>
              {introText}
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {results.map((r, i) => (
              <li key={i} style={{ color: r.ok ? 'green' : 'crimson', fontSize: '0.9em' }}>
                {r.ok ? '✓' : '✗'}{r.projectId ? ` [${r.projectId.slice(-6)}]` : ''} {r.text}
              </li>
            ))}
          </ul>
          {footerText && (
            <p style={{ marginTop: '1rem', fontSize: '0.82em', color: '#666' }}>
              {footerText}
            </p>
          )}
        </div>
      ),
    } : undefined,
  }
}
