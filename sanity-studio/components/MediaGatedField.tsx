import { useEffect, useState } from 'react'
import { useClient, useFormValue, type FieldProps } from 'sanity'

/**
 * MediaGatedField — shows a field ONLY when this offer actually has a media
 * document in the Media library (any media whose `offer` reference points here,
 * draft or published).
 *
 * THE RULE (set by the owner): an offer with NO media in the library is a
 * menu/catalog ad → it gets a SINGLE CTA. The 2nd-CTA fields therefore only
 * appear once real media exists — not based on the displayMode flag, which is
 * only the vendor's intent and defaults to "media" before any media is made.
 *
 * (A plain `hidden` callback can't do this — it's synchronous and can't query.
 * A field component can: it queries once per document open.)
 */
export function MediaGatedField(props: FieldProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const docId = useFormValue(['_id']) as string | undefined
  const [hasMedia, setHasMedia] = useState<boolean | null>(null)

  useEffect(() => {
    const baseId = (docId || '').replace(/^drafts\./, '')
    if (!baseId) { setHasMedia(false); return }
    client
      .fetch<number>('count(*[_type == "media" && offer._ref == $id])', { id: baseId })
      .then(n => setHasMedia(n > 0))
      .catch(() => setHasMedia(true))   // query failed → fail open (show the field)
  }, [docId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasMedia) return null            // loading or no media → hidden (single CTA)
  return props.renderDefault(props)
}
