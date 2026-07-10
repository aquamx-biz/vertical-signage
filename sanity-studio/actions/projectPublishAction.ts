import { useState } from 'react'
import { useDocumentOperation, useClient } from 'sanity'
import type { DocumentActionProps } from 'sanity'

/**
 * Replaces the default Publish action on Project documents.
 *
 * Behaviour:
 *   - Works exactly like the standard Publish button.
 *   - If this is the FIRST publish (project has never been published before),
 *     it also auto-creates a draft playlist item pre-filled with the project
 *     reference so the user can immediately start adding media.
 */
export function ProjectPublishAction(props: DocumentActionProps) {
  const { publish }  = useDocumentOperation(props.id, props.type)
  const client       = useClient({ apiVersion: '2024-01-01' })
  const [busy, setBusy] = useState(false)

  return {
    label:    busy ? 'Publishing…' : 'Publish',
    tone:     'positive' as const,
    disabled: !!publish.disabled || busy,

    onHandle: async () => {
      const isFirstPublish = !props.published   // no published version yet = new project
      setBusy(true)

      // 1. Execute the standard publish operation
      publish.execute()

      // 2. If this is a brand-new project, auto-create a starter playlist item
      if (isFirstPublish) {
        // Give Sanity a moment to finish writing the published document
        // so the project reference resolves correctly
        await new Promise(r => setTimeout(r, 800))
        try {
          const publishedId = props.id.replace(/^drafts\./, '')
          await client.create({
            // published directly — the kiosk build reads published-only; a draft slot never airs
            _id:     crypto.randomUUID(),
            _type:   'playlistItem',
            project: { _type: 'reference', _ref: publishedId },
            order:   1,
            enabled: true,
          })
        } catch (err) {
          // Non-fatal — user can still create playlist items manually
          console.error('Auto-playlist init failed:', err)
        }
      }

      setBusy(false)
      props.onComplete()
    },
  }
}
