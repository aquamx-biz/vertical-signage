/**
 * MediaUsageSummary
 *
 * Read-only field input shown on the media doc.
 * Lists every playlistItem (slot) that references this media, grouped by
 * project, with a deep-link to that project's Playlist view in Studio
 * (structure path: digital-signage;playlist;<projectId>).
 *
 * Empty state renders nothing — keeps the form quiet for unused media.
 */

import { useEffect, useState } from 'react'
import { useFormValue, useClient } from 'sanity'
import { useRouter } from 'sanity/router'
import { Card, Stack, Flex, Text, Box, Badge, Spinner, Button } from '@sanity/ui'
import { LinkIcon } from '@sanity/icons'

interface SlotRow {
  _id:           string
  order?:        number
  enabled?:      boolean
  projectId?:    string
  projectTitle?: string
  projectCode?:  string
}

interface ProjectGroup {
  projectId:    string
  projectTitle: string
  projectCode?: string
  slots:        SlotRow[]
}

export function MediaUsageSummary(_props: any) {
  const client    = useClient({ apiVersion: '2024-01-01' })
  const router    = useRouter()
  const docId     = useFormValue(['_id']) as string | undefined
  const mediaId   = docId?.replace(/^drafts\./, '')

  const [loading, setLoading] = useState(false)
  const [rows,    setRows]    = useState<SlotRow[]>([])

  useEffect(() => {
    if (!mediaId) return
    setLoading(true)
    client
      .fetch<SlotRow[]>(
        `*[_type == "playlistItem" && media._ref == $mediaId] | order(project->title asc, order asc) {
          _id,
          order,
          enabled,
          "projectId":    project._ref,
          "projectTitle": project->title,
          "projectCode":  project->code.current
        }`,
        { mediaId },
      )
      .then(r => setRows(r ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [mediaId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>Loading playlist usage…</Text>
      </Flex>
    )
  }

  if (!rows.length) {
    return (
      <Text size={1} muted>Not added to any playlist yet.</Text>
    )
  }

  // Group by project
  const groups: ProjectGroup[] = []
  for (const r of rows) {
    if (!r.projectId) continue
    let g = groups.find(x => x.projectId === r.projectId)
    if (!g) {
      g = {
        projectId:    r.projectId,
        projectTitle: r.projectTitle ?? '(unnamed project)',
        projectCode:  r.projectCode,
        slots:        [],
      }
      groups.push(g)
    }
    g.slots.push(r)
  }

  const totalSlots    = rows.length
  const enabledSlots  = rows.filter(r => r.enabled !== false).length
  const disabledSlots = totalSlots - enabledSlots

  const openPlaylist = (projectId: string) => {
    router.navigateUrl({ path: `/structure/digital-signage;playlist;${projectId}` })
  }

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Stack space={3}>

        {/* Header */}
        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">Used in Playlists</Text>
          <Flex gap={2}>
            <Badge tone="primary" mode="outline" fontSize={0}>
              {groups.length} project{groups.length === 1 ? '' : 's'}
            </Badge>
            <Badge tone="positive" mode="outline" fontSize={0}>
              {enabledSlots} active slot{enabledSlots === 1 ? '' : 's'}
            </Badge>
            {disabledSlots > 0 && (
              <Badge tone="caution" mode="outline" fontSize={0}>
                {disabledSlots} disabled
              </Badge>
            )}
          </Flex>
        </Flex>

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        {/* Each project group */}
        {groups.map(g => (
          <Stack key={g.projectId} space={2}>
            <Flex justify="space-between" align="center" gap={2}>
              <Flex align="center" gap={2}>
                <Text size={1} weight="semibold">{g.projectTitle}</Text>
                {g.projectCode && (
                  <Text size={0} muted>[{g.projectCode}]</Text>
                )}
                <Text size={0} muted>
                  · {g.slots.length} slot{g.slots.length === 1 ? '' : 's'}
                </Text>
              </Flex>
              <Button
                icon={LinkIcon}
                mode="ghost"
                tone="primary"
                padding={2}
                fontSize={0}
                text="Open Playlist"
                onClick={() => openPlaylist(g.projectId)}
              />
            </Flex>
            <Flex gap={1} wrap="wrap">
              {g.slots.map(s => (
                <Badge
                  key={s._id}
                  tone={s.enabled === false ? 'caution' : 'default'}
                  mode="outline"
                  fontSize={0}
                >
                  #{s.order ?? '?'}{s.enabled === false ? ' · off' : ''}
                </Badge>
              ))}
            </Flex>
          </Stack>
        ))}

      </Stack>
    </Card>
  )
}
