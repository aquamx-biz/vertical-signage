/**
 * PlaylistStatusBadge
 *
 * Tiny live "status light" rendered in the media preview's thumbnail slot so
 * editors can tell, straight from any media list (By Project, All Media, the
 * playlist picker…), whether a media is currently on a playlist — without
 * opening the document.
 *
 * Reverse-looks-up playlistItem slots that reference this media (same query
 * shape as MediaUsageSummary) and collapses the result to one of three states:
 *   green  → on ≥1 ENABLED slot (live on the kiosk rotation)
 *   amber  → only DISABLED slots reference it (parked, not playing)
 *   grey   → not on any playlist
 *
 * The badge shows the active-slot count when > 1. Hover for the full breakdown.
 */

import { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { Tooltip, Box, Flex, Text } from '@sanity/ui'

interface Props {
  id?: string
}

interface Usage {
  total:  number // every slot referencing this media
  active: number // slots with enabled != false
}

export function PlaylistStatusBadge({ id }: Props) {
  const client  = useClient({ apiVersion: '2024-01-01' })
  // playlistItem.media._ref always points at the PUBLISHED media id.
  const mediaId = id?.replace(/^drafts\./, '')

  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    if (!mediaId) return
    let alive = true
    client
      .fetch<Usage>(
        `{
          "total":  count(*[_type == "playlistItem" && media._ref == $mediaId]),
          "active": count(*[_type == "playlistItem" && media._ref == $mediaId && enabled != false])
        }`,
        { mediaId },
      )
      .then(r => { if (alive) setUsage(r) })
      .catch(() => { if (alive) setUsage({ total: 0, active: 0 }) })
    return () => { alive = false }
  }, [mediaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // While loading, render a neutral placeholder so row height stays stable.
  const total  = usage?.total  ?? 0
  const active = usage?.active ?? 0

  let color: string
  let label: string
  if (!usage) {
    color = 'var(--card-border-color)'
    label = 'Checking playlist usage…'
  } else if (active > 0) {
    color = 'var(--card-badge-positive-dot-color, #43d675)'
    label = `On playlist · ${active} active slot${active === 1 ? '' : 's'}` +
            (total > active ? ` (+${total - active} disabled)` : '')
  } else if (total > 0) {
    color = 'var(--card-badge-caution-dot-color, #f5a623)'
    label = `On playlist but parked · ${total} disabled slot${total === 1 ? '' : 's'}, none active`
  } else {
    color = 'transparent'
    label = 'Not on any playlist'
  }

  // Show the active count for multi-slot media; otherwise just the dot.
  const showCount = active > 1

  const dot = (
    <Flex align="center" justify="center" style={{ width: 33, height: 33 }}>
      <Box
        style={{
          minWidth:        14,
          height:          14,
          padding:         showCount ? '0 4px' : 0,
          borderRadius:    7,
          background:      color,
          border:          total === 0 ? '1.5px solid var(--card-border-color)' : 'none',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
        }}
      >
        {showCount && (
          <Text size={0} weight="bold" style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>
            {active}
          </Text>
        )}
      </Box>
    </Flex>
  )

  return (
    <Tooltip
      content={<Box padding={2}><Text size={1}>{label}</Text></Box>}
      placement="top"
      portal
    >
      {dot}
    </Tooltip>
  )
}
