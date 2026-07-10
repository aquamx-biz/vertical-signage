import { useState } from 'react'
import { useClient } from 'sanity'
import type { DocumentActionProps } from 'sanity'

/**
 * Adds an "Initialize Playlist" button to published Project documents.
 * Clicking it creates a draft playlist item pre-filled with the project
 * reference so the user can immediately open it and add media.
 *
 * Registered in sanity.config.ts under document.actions.
 */
export function initPlaylistAction(props: DocumentActionProps) {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const [busy, setBusy] = useState(false)

  // Hooks must be called before any conditional return
  if (props.type !== 'project' || !props.published) return null

  return {
    label:    busy ? 'Creating…' : 'Initialize Playlist',
    title:    'Create the first playlist item for this project',
    disabled: busy,

    onHandle: async () => {
      setBusy(true)
      try {
        // Check if this project already has playlist items
        const count = await client.fetch<number>(
          `count(*[_type == "playlistItem" && project._ref == $id])`,
          { id: props.id },
        )

        if (count > 0) {
          // Already initialized — just let the user know where to find them
          alert(
            `This project already has ${count} playlist item(s).\n` +
            `Go to Browse by Project → your project → Playlist to manage them.`,
          )
          props.onComplete()
          return
        }

        // Create a draft playlist item pre-filled with this project
        await client.create({
          // published directly — the kiosk build reads published-only; a draft slot never airs
          _id:     crypto.randomUUID(),
          _type:   'playlistItem',
          project: { _type: 'reference', _ref: props.id },
          order:   1,
          enabled: true,
          // `media` is intentionally left blank — user fills it in Studio
        })

        alert(
          'Playlist item created!\n' +
          'Go to Browse by Project → your project → Playlist to open it and assign media.',
        )
      } catch (err: any) {
        alert(`Failed to create playlist item: ${err.message}`)
      } finally {
        setBusy(false)
        props.onComplete()
      }
    },
  }
}
