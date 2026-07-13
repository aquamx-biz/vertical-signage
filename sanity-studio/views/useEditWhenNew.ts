import { useEffect, useRef } from 'react'
import { usePaneRouter } from 'sanity/structure'

/**
 * "+ Create new" used to land on an EMPTY Overview — a read-only summary of
 * nothing. If the document has never been saved (no published version, and no
 * user-entered draft fields), hop to the Edit tab so the editor can start
 * typing; existing documents keep Overview as the safe read-only landing.
 *
 * Same battle-tested logic as the generic DocumentOverview: 150ms debounce so
 * the draft has a beat to arrive, decide once per mount.
 */
export function useEditWhenNew(doc: { draft: Record<string, any> | null; published: unknown | null }) {
  const { setParams } = usePaneRouter()
  const decided = useRef(false)

  useEffect(() => {
    if (decided.current) return
    const timer = setTimeout(() => {
      if (decided.current) return
      decided.current = true
      const userKeys = Object.keys(doc.draft ?? {}).filter(k => !k.startsWith('_'))
      const isNew    = !doc.published && userKeys.length === 0
      if (isNew) setParams({ view: 'edit' })
    }, 150)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.published, doc.draft])
}
