/**
 * PlaylistView
 *
 * Full-page document view shown as the "Playlist" tab on a Project document.
 * Displays ALL playlist items for this project in one visual page.
 * Supports reordering via drag handle (⋮⋮) and shows total playlist duration.
 * Export PDF generates a clean A4 document with all slot metadata.
 */

import { useEffect, useState, useCallback } from 'react'
import { useClient }                         from 'sanity'
import { Stack, Flex, Text, Card, Badge, Box, Grid, Spinner, Button } from '@sanity/ui'
import { TrashIcon }                         from '@sanity/icons'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface PlaylistItem {
  _id:              string
  mediaId?:         string
  order:            number
  enabled:          boolean
  notes?:           string
  startAt?:         string
  endAt?:           string
  displayDuration?: number
  touchCategory?:   string
  touchProvider?:   string
  mediaTitle?:      string
  mediaType?:       string
  mediaKind?:       string
  mediaActive?:     boolean
  thumbnail?:       string
  videoUrl?:        string
  videoDuration?:   number
  imageCount?:      number
  defaultImageDuration?: number
}

const CATEGORY_LABEL: Record<string, string> = {
  food: 'Food', groceries: 'Groceries', services: 'Services',
  forRent: 'For Rent', forSale: 'For Sale', buildingUpdates: 'Building Updates',
}

function fmtDate(dt: string) {
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s > 0 ? s + 's' : ''}`.trim() : `${s}s`
}

function itemDuration(item: PlaylistItem): number | null {
  if (item.mediaType === 'video') {
    return item.videoDuration ?? null
  }
  if (item.mediaType === 'image' || item.mediaKind === 'notice') {
    const dur   = item.displayDuration ?? item.defaultImageDuration ?? 10
    const count = item.mediaKind === 'notice' ? 1
      : (item.imageCount && item.imageCount > 0 ? item.imageCount : 1)
    return dur * count
  }
  return null
}

// Fetch thumbnail as JPEG base64 data URL for PDF embedding.
// Forces JPEG via &fm=jpg so jsPDF always gets a supported format.
async function fetchThumbAsDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(`${url}?w=80&h=144&fit=crop&fm=jpg`, { credentials: 'omit' })
    if (!res.ok) return ''
    const blob = await res.blob()
    return await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

// ── SortableRow ───────────────────────────────────────────────────────────────

interface SortableRowProps {
  item:        PlaylistItem
  idx:         number
  deleting:    boolean
  onEdit:      () => void
  onDelete:    () => void
  onOpenMedia: () => void
}

function SortableRow({ item, idx, deleting, onEdit, onDelete, onOpenMedia }: SortableRowProps) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: item._id })

  const off      = item.enabled === false
  const duration = itemDuration(item)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity:   isDragging ? 0.5 : 1,
        zIndex:    isDragging ? 1 : undefined,
      }}
    >
      <Card
        padding={4}
        radius={2}
        border
        tone={off ? 'caution' : item.mediaActive === false ? 'critical' : 'default'}
        style={{ opacity: off ? 0.55 : 1 }}
      >
        <Flex gap={4} align="flex-start">

          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            style={{
              flexShrink:  0,
              alignSelf:   'center',
              display:     'flex',
              alignItems:  'center',
              cursor:      isDragging ? 'grabbing' : 'grab',
              color:       'var(--card-muted-fg-color)',
              padding:     '4px 0',
              fontSize:    14,
              userSelect:  'none',
              touchAction: 'none',
            }}
            title="Drag to reorder"
          >
            ⋮⋮
          </div>

          {/* Position number */}
          <Flex align="center" justify="center" style={{
            flexShrink: 0, alignSelf: 'center',
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(128,128,128,0.2)',
          }}>
            <Text size={1} weight="semibold" style={{ lineHeight: 1 }}>
              {idx + 1}
            </Text>
          </Flex>

          {/* Thumbnail — click to open the linked media doc (when one is linked) */}
          <Box
            onClick={item.mediaId ? onOpenMedia : undefined}
            title={item.mediaId ? 'Open media in Media Library' : undefined}
            style={{
              flexShrink: 0, width: 40, height: 72,
              borderRadius: 4, overflow: 'hidden', background: '#1a1a2e',
              cursor: item.mediaId ? 'pointer' : 'default',
            }}
          >
            {item.thumbnail
              ? <img src={`${item.thumbnail}?w=80&h=144&fit=crop`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : item.videoUrl
                ? <video src={item.videoUrl} muted preload="metadata"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}><Text size={0} muted>—</Text></Flex>
            }
          </Box>

          {/* Info */}
          <Stack space={3} style={{ flex: 1, minWidth: 0 }}>

            <Flex gap={2} align="center" wrap="wrap">
              <Text
                size={2}
                weight="semibold"
                onClick={item.mediaId ? onOpenMedia : undefined}
                title={item.mediaId ? 'Open media in Media Library' : undefined}
                style={{
                  textDecoration: off ? 'line-through' : 'none',
                  cursor:         item.mediaId ? 'pointer' : 'default',
                  color:          item.mediaId ? 'var(--card-link-fg-color)' : undefined,
                }}
              >
                {item.mediaTitle ?? '(no media linked)'}
              </Text>
              {item.mediaId && (
                <Badge
                  mode="outline"
                  tone="default"
                  fontSize={0}
                  title="Stable last-6 of the media doc ID — same value shown in Media Library"
                  style={{ fontFamily: 'monospace' }}
                >
                  #{item.mediaId.slice(-6)}
                </Badge>
              )}
              {item.mediaType && (
                <Badge mode="outline" tone={item.mediaType === 'video' ? 'primary' : 'default'} fontSize={0}>
                  {item.mediaType === 'video' ? '▶ Video' : '🖼 Image'}
                </Badge>
              )}
              {off && <Badge tone="caution" mode="outline" fontSize={0}>Disabled</Badge>}
              {item.mediaActive === false && <Badge tone="critical" mode="outline" fontSize={0}>Media inactive</Badge>}
            </Flex>

            <Grid columns={2} gap={2}>
              {duration != null && (
                <Text size={1} muted>⏱ {fmtDuration(duration)}</Text>
              )}
              {item.mediaType === 'video' && !item.videoDuration && (
                <Text size={1} muted style={{ color: 'orange' }}>⏱ duration not set</Text>
              )}
              {item.touchCategory && (
                <Text size={1} muted>👆 {CATEGORY_LABEL[item.touchCategory] ?? item.touchCategory}</Text>
              )}
              {item.touchProvider && (
                <Text size={1} muted>🏪 {item.touchProvider}</Text>
              )}
              {(item.startAt || item.endAt) && (
                <Text size={1} muted>
                  📅 {item.startAt ? fmtDate(item.startAt) : '∞'} → {item.endAt ? fmtDate(item.endAt) : '∞'}
                </Text>
              )}
              {item.notes && (
                <Text size={1} muted style={{ gridColumn: '1 / -1' }}>📝 {item.notes}</Text>
              )}
            </Grid>

          </Stack>

          {/* Edit + Remove buttons */}
          <Flex gap={2} style={{ flexShrink: 0, alignSelf: 'center' }}>
            <Button
              text="Edit slot"
              mode="ghost"
              tone="primary"
              fontSize={1}
              onClick={onEdit}
            />
            <Button
              icon={TrashIcon}
              mode="bleed"
              tone="critical"
              fontSize={1}
              title="Remove from playlist"
              disabled={deleting}
              onClick={onDelete}
            />
          </Flex>

        </Flex>
      </Card>
    </div>
  )
}

// ── PlaylistView ──────────────────────────────────────────────────────────────

export function PlaylistView({ document: doc }: { document?: { displayed?: any } }) {
  const client       = useClient({ apiVersion: '2024-01-01' })
  const projectId    = doc?.displayed?._id?.replace(/^drafts\./, '')
  const projectTitle = doc?.displayed?.title ?? doc?.displayed?.code?.current ?? ''
  const isActive     = doc?.displayed?.isActive as boolean | undefined
  const deployCode   = doc?.displayed?.code?.current as string | undefined

  const [items,     setItems]    = useState<PlaylistItem[]>([])
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState('')
  const [deleting,  setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const fetchItems = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    client.fetch<PlaylistItem[]>(
      `*[_type == "playlistItem" && project._ref == $projectId] | order(order asc) {
        _id, order, enabled, notes, startAt, endAt, displayDuration,
        "mediaId":              media->_id,
        "touchCategory":        touchExploreCategory,
        "touchProvider":        touchExploreDefaultProvider->name_th,
        "mediaTitle":           media->title,
        "mediaType":            media->type,
        "mediaKind":            media->kind,
        "mediaActive":          media->isActive,
        "videoDuration":        media->videoDuration,
        "imageCount":           count(media->imageFiles),
        "defaultImageDuration": media->defaultImageDuration,
        "thumbnail":            coalesce(
          media->posterImage.asset->url,
          media->imageFiles[0].asset->url
        ),
        "videoUrl":             media->videoFile.asset->url
      }`,
      { projectId },
    )
    .then(rows => setItems(rows ?? []))
    .catch(e  => setError(e?.message ?? 'Failed to load'))
    .finally(() => setLoading(false))
  }, [projectId, client])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex(i => i._id === String(active.id))
    const newIndex = items.findIndex(i => i._id === String(over.id))
    const reordered = arrayMove(items, oldIndex, newIndex)
    setItems(reordered)

    try {
      const tx = client.transaction()
      reordered.forEach((item, idx) => {
        tx.patch(item._id, { set: { order: idx + 1 } })
      })
      await tx.commit()
      fetchItems()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save order')
    }
  }

  function openItem(id: string) {
    const base  = window.location.href.split('/intent')[0].split('/structure')[0]
    const clean = id.replace(/^drafts\./, '')
    window.location.href = `${base}/intent/edit/id=${clean};type=playlistItem/`
  }

  function openMedia(id: string) {
    const base  = window.location.href.split('/intent')[0].split('/structure')[0]
    const clean = id.replace(/^drafts\./, '')
    window.location.href = `${base}/intent/edit/id=${clean};type=media/`
  }

  async function deleteItem(item: PlaylistItem, slotNumber: number) {
    if (!window.confirm(`Remove slot ${slotNumber} "${item.mediaTitle ?? '(no media)'}" from playlist?`)) return
    setDeleting(true)
    try {
      await client.delete(item._id)
      fetchItems()
    } finally {
      setDeleting(false)
    }
  }

  async function cleanUpStale() {
    const stale = items.filter(i => i.enabled === false || i.mediaActive === false)
    if (stale.length === 0) return
    if (!window.confirm(
      `Delete ${stale.length} stale slot${stale.length !== 1 ? 's' : ''} from playlist?\n\nThis removes slots that are disabled or whose linked media is inactive.`
    )) return
    setDeleting(true)
    try {
      const tx = client.transaction()
      stale.forEach(i => tx.delete(i._id))
      await tx.commit()
      fetchItems()
    } finally {
      setDeleting(false)
    }
  }

  // ── PDF export ──────────────────────────────────────────────────────────────

  async function exportPdf() {
    if (items.length === 0) return
    setExporting(true)
    try {
      const { jsPDF } = await import('jspdf')

      // Fetch all thumbnails in parallel before building the PDF
      const thumbs = await Promise.all(
        items.map(item => item.thumbnail ? fetchThumbAsDataUrl(item.thumbnail) : Promise.resolve(''))
      )

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      // Layout constants (mm)
      const PW      = 210
      const PH      = 297
      const MX      = 14    // horizontal margin
      const MY      = 14    // vertical margin
      const THUMB_W = 11
      const THUMB_H = 18
      const NUM_CX  = MX + 4       // centre-x of position circle
      const NUM_R   = 3.5          // circle radius
      const THUMB_X = NUM_CX + NUM_R + 3
      const TEXT_X  = THUMB_X + THUMB_W + 4
      const TEXT_W  = PW - MX - TEXT_X
      const ROW_PAD = 3            // top/bottom padding inside each row
      const TITLE_H = 5            // mm per title line
      const META_H  = 4.5          // mm per metadata line

      // Draw first-page header, return starting y for rows
      function drawHeader(isFirst: boolean): number {
        let y = MY
        if (isFirst) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(15)
          doc.setTextColor(30, 30, 30)
          doc.text(projectTitle || 'Playlist', MX, y + 8)

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)
          doc.setTextColor(110, 110, 110)
          const durStr = totalSeconds > 0 ? fmtDuration(totalSeconds) : '—'
          doc.text(`${items.length} slots  |  Total duration: ${durStr}`, MX, y + 16)

          const today = new Date().toLocaleDateString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
          })
          doc.text(`Generated: ${today}`, MX, y + 21)

          doc.setDrawColor(210, 210, 210)
          doc.line(MX, y + 26, PW - MX, y + 26)
          return y + 31
        } else {
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(8)
          doc.setTextColor(110, 110, 110)
          doc.text(`${projectTitle} — continued`, MX, y + 6)
          doc.setDrawColor(210, 210, 210)
          doc.line(MX, y + 10, PW - MX, y + 10)
          return y + 15
        }
      }

      let y = drawHeader(true)

      for (let i = 0; i < items.length; i++) {
        const item     = items[i]
        const off      = item.enabled === false
        const duration = itemDuration(item)

        // ── Compute text lines for height calculation ──────────────────────────

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        const titleLines: string[] = doc.splitTextToSize(
          item.mediaTitle ?? '(no media linked)', TEXT_W
        )

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)

        const metaLines: string[] = []

        // Type + status badges
        const badges: string[] = []
        if (item.mediaType === 'video') badges.push('[Video]')
        else if (item.mediaType === 'image') badges.push('[Image]')
        if (off) badges.push('[Disabled]')
        if (item.mediaActive === false) badges.push('[Media inactive]')
        if (badges.length > 0) metaLines.push(badges.join('  '))

        // Duration
        if (duration != null) {
          metaLines.push(`Duration: ${fmtDuration(duration)}`)
        } else if (item.mediaType === 'video') {
          metaLines.push('Duration: not set')
        }

        // Touch category + provider
        const touchParts: string[] = []
        if (item.touchCategory) touchParts.push(`Touch: ${CATEGORY_LABEL[item.touchCategory] ?? item.touchCategory}`)
        if (item.touchProvider)  touchParts.push(`Provider: ${item.touchProvider}`)
        if (touchParts.length > 0) metaLines.push(touchParts.join('  '))

        // Schedule
        if (item.startAt || item.endAt) {
          const from = item.startAt ? fmtDate(item.startAt) : 'anytime'
          const to   = item.endAt   ? fmtDate(item.endAt)   : 'ongoing'
          metaLines.push(`Schedule: ${from} - ${to}`)
        }

        // Notes (wrapped, max 2 lines)
        let noteLines: string[] = []
        if (item.notes) {
          noteLines = (doc.splitTextToSize(`Notes: ${item.notes}`, TEXT_W) as string[]).slice(0, 2)
        }

        // Total text height → row height
        const textH = titleLines.length * TITLE_H + (metaLines.length + noteLines.length) * META_H
        const rowH  = Math.max(THUMB_H + ROW_PAD * 2, textH + ROW_PAD * 2)

        // ── Page overflow ──────────────────────────────────────────────────────
        if (y + rowH > PH - MY - 10) {
          doc.addPage()
          y = drawHeader(false)
        }

        const centY = y + rowH / 2

        // ── Position circle ────────────────────────────────────────────────────
        doc.setFillColor(59, 130, 246)
        doc.circle(NUM_CX, centY, NUM_R, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(255, 255, 255)
        doc.text(String(i + 1), NUM_CX, centY, { align: 'center', baseline: 'middle' })

        // ── Thumbnail ──────────────────────────────────────────────────────────
        const thumbTop = centY - THUMB_H / 2
        if (thumbs[i]) {
          try {
            doc.addImage(thumbs[i], 'JPEG', THUMB_X, thumbTop, THUMB_W, THUMB_H)
          } catch {
            // Fallback if image format not supported
            doc.setFillColor(200, 200, 200)
            doc.rect(THUMB_X, thumbTop, THUMB_W, THUMB_H, 'F')
          }
        } else if (item.mediaType === 'video') {
          doc.setFillColor(26, 26, 46)
          doc.rect(THUMB_X, thumbTop, THUMB_W, THUMB_H, 'F')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.setTextColor(160, 160, 180)
          doc.text('Video', THUMB_X + THUMB_W / 2, centY, { align: 'center', baseline: 'middle' })
        } else {
          doc.setFillColor(235, 235, 235)
          doc.rect(THUMB_X, thumbTop, THUMB_W, THUMB_H, 'F')
        }

        // ── Text content ───────────────────────────────────────────────────────
        let ty = y + ROW_PAD + TITLE_H

        // Title
        doc.setFont('helvetica', off ? 'bolditalic' : 'bold')
        doc.setFontSize(10)
        doc.setTextColor(30, 30, 30)
        for (let li = 0; li < titleLines.length; li++) {
          doc.text(titleLines[li], TEXT_X, ty + li * TITLE_H)
        }
        ty += (titleLines.length - 1) * TITLE_H

        // Metadata lines
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(110, 110, 110)
        for (const line of [...metaLines, ...noteLines]) {
          ty += META_H
          doc.text(line, TEXT_X, ty)
        }

        // ── Row separator ──────────────────────────────────────────────────────
        doc.setDrawColor(230, 230, 230)
        doc.line(MX, y + rowH, PW - MX, y + rowH)

        y += rowH
      }

      // ── Page footers ─────────────────────────────────────────────────────────
      const totalPages = doc.getNumberOfPages()
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(`Page ${p} of ${totalPages}`, PW / 2, PH - 8, { align: 'center' })
      }

      // ── Save ─────────────────────────────────────────────────────────────────
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const slug    = deployCode ?? (projectTitle.replace(/\s+/g, '-').toLowerCase() || 'playlist')
      doc.save(`playlist-${slug}-${dateStr}.pdf`)

    } finally {
      setExporting(false)
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────────

  const enabled      = items.filter(i => i.enabled !== false)
  const disabled     = items.filter(i => i.enabled === false)
  const staleCount   = items.filter(i => i.enabled === false || i.mediaActive === false).length
  const videos       = items.filter(i => i.mediaType === 'video')
  const images       = items.filter(i => i.mediaType === 'image')
  const notices      = items.filter(i => i.mediaKind === 'notice')
  const missingMedia = items.filter(i => !i.mediaTitle)
  const unknownDur   = items.filter(i => itemDuration(i) === null)

  const totalSeconds   = items.reduce((sum, item) => sum + (itemDuration(item) ?? 0), 0)
  const knownDurations = items.filter(i => itemDuration(i) !== null).length

  if (loading) return (
    <Flex align="center" justify="center" gap={3} style={{ height: 300 }}>
      <Spinner /><Text muted size={1}>Loading playlist…</Text>
    </Flex>
  )

  if (error) return (
    <Card tone="critical" padding={4} margin={4} radius={2} border>
      <Text size={1}>{error}</Text>
    </Card>
  )

  return (
    <Box padding={5} style={{ maxWidth: 900 }}>
      <Stack space={5}>

        {/* Header */}
        <Stack space={4}>
          <Flex align="center" justify="space-between">
            <Text size={3} weight="semibold">{projectTitle} — Playlist</Text>
            <Button
              text={exporting ? 'Generating PDF…' : 'Export PDF'}
              mode="ghost"
              tone="default"
              fontSize={1}
              disabled={exporting || items.length === 0}
              onClick={exportPdf}
            />
          </Flex>

          {/* Summary stats */}
          <Grid columns={4} gap={3}>
            {/* Total slots */}
            <Card padding={3} radius={2} border tone="default">
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Slots</Text>
                <Text size={4} weight="semibold">{items.length}</Text>
                <Flex gap={2} wrap="wrap" align="center">
                  <Badge tone="positive" mode="outline" fontSize={0}>{enabled.length} active</Badge>
                  {disabled.length > 0 && <Badge tone="caution" mode="outline" fontSize={0}>{disabled.length} off</Badge>}
                  {staleCount > 0 && (
                    <Button
                      text={`Clean up (${staleCount})`}
                      tone="caution"
                      mode="ghost"
                      fontSize={0}
                      padding={2}
                      disabled={deleting}
                      onClick={cleanUpStale}
                    />
                  )}
                </Flex>
              </Stack>
            </Card>

            {/* Total duration */}
            <Card padding={3} radius={2} border tone="default">
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Duration</Text>
                <Text size={4} weight="semibold">{totalSeconds > 0 ? fmtDuration(totalSeconds) : '—'}</Text>
                {unknownDur.length > 0 && (
                  <Text size={0} muted style={{ color: 'orange' }}>⚠ {unknownDur.length} unknown</Text>
                )}
                {unknownDur.length === 0 && knownDurations > 0 && (
                  <Text size={0} muted>complete</Text>
                )}
              </Stack>
            </Card>

            {/* Media types */}
            <Card padding={3} radius={2} border tone="default">
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Media Types</Text>
                <Text size={4} weight="semibold">{videos.length + images.length + notices.length}</Text>
                <Flex gap={2} wrap="wrap">
                  {videos.length   > 0 && <Badge tone="primary" mode="outline" fontSize={0}>▶ {videos.length} video</Badge>}
                  {images.length   > 0 && <Badge tone="default" mode="outline" fontSize={0}>🖼 {images.length} image</Badge>}
                  {notices.length  > 0 && <Badge tone="default" mode="outline" fontSize={0}>📢 {notices.length} notice</Badge>}
                </Flex>
              </Stack>
            </Card>

            {/* Issues */}
            <Card padding={3} radius={2} border tone={missingMedia.length > 0 ? 'critical' : 'positive'}>
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Issues</Text>
                <Text size={4} weight="semibold">{missingMedia.length + unknownDur.length}</Text>
                <Flex gap={2} wrap="wrap">
                  {missingMedia.length > 0 && <Badge tone="critical" mode="outline" fontSize={0}>{missingMedia.length} no media</Badge>}
                  {unknownDur.length   > 0 && <Badge tone="caution" mode="outline" fontSize={0}>{unknownDur.length} no duration</Badge>}
                  {missingMedia.length === 0 && unknownDur.length === 0 && <Text size={0} muted>All good ✓</Text>}
                </Flex>
              </Stack>
            </Card>
          </Grid>
        </Stack>

        {/* Deploy status banner */}
        <Card padding={3} radius={2} border tone={isActive ? 'positive' : 'caution'}>
          <Flex gap={3} align="flex-start">
            <Text size={1}>{isActive ? '🚀' : '⏸'}</Text>
            <Stack space={2}>
              <Text size={1} weight="semibold">
                {isActive
                  ? 'This playlist is live — deployed to GitHub'
                  : 'This playlist is not deployed (project is inactive)'}
              </Text>
              {isActive && deployCode && (
                <Stack space={1}>
                  <Text size={1} muted>To push this project only:</Text>
                  <Text size={1}><code>{`cd "C:\\Users\\Lenovo\\OneDrive - MBK Group\\Documents\\Visual" && .\\deploy.ps1 -Project ${deployCode}`}</code></Text>
                  <Text size={1} muted>To push all projects:</Text>
                  <Text size={1}><code>{`cd "C:\\Users\\Lenovo\\OneDrive - MBK Group\\Documents\\Visual" && .\\deploy.ps1`}</code></Text>
                </Stack>
              )}
              {!isActive && (
                <Text size={1} muted>Enable "Is Active" on the project to include it in the next deploy.</Text>
              )}
            </Stack>
          </Flex>
        </Card>

        {items.length === 0 && (
          <Card padding={4} radius={2} border tone="caution">
            <Text size={1} muted>No playlist items yet for this project.</Text>
          </Card>
        )}

        {/* Items */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map(i => i._id)}
            strategy={verticalListSortingStrategy}
          >
            {items.map((item, idx) => (
              <SortableRow
                key={item._id}
                item={item}
                idx={idx}
                deleting={deleting}
                onEdit={() => openItem(item._id)}
                onDelete={() => deleteItem(item, idx + 1)}
                onOpenMedia={() => item.mediaId && openMedia(item.mediaId)}
              />
            ))}
          </SortableContext>
        </DndContext>

      </Stack>
    </Box>
  )
}
