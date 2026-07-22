/**
 * MediaOverview — dedicated read-only landing view for `media` documents.
 *
 * The generic DocumentOverview is an alphabetical field dump — useless for the
 * most visual document in the system. This view answers the admin's three real
 * questions at a glance:
 *   1. What does it look like?  → big poster / video preview up top
 *   2. Where is it playing?     → playlist usage grouped by project
 *   3. What's its status?       → active / kind / type / duration badges
 * Everything else lives on the Edit tab. (Overview stays the default tab so a
 * first-time visitor lands on a safe read-only page, not an edit form.)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useClient } from 'sanity'
import { IntentLink } from 'sanity/router'
import { Badge, Box, Card, Flex, Heading, Spinner, Stack, Text } from '@sanity/ui'
import { useEditWhenNew } from './useEditWhenNew'

interface Props {
  document: {
    draft:     Record<string, any> | null
    published: Record<string, any> | null
    displayed: Record<string, any>
  }
  schemaType: { name: string; title?: string }
}

interface UseRow {
  _id: string; order?: number; enabled?: boolean
  projectId?: string; projectTitle?: string; projectCode?: string
}
interface RefRow { _id: string; title?: string | null; logo?: string | null }
interface OfferRow {
  _id: string; title?: string | null; title_en?: string | null
  category?: string | null; price?: string | null
  description_th?: string | null; description_en?: string | null
  displayLang?: string | null
  ctaType?: string | null; ctaLabel?: string | null
  ctaType2?: string | null; ctaLabel2?: string | null
  img?: string | null
}

// The kiosk preview is the REAL player embedded in preview mode — any deployed
// site works (preview mode never touches that project's data; it renders only
// the item we postMessage in). Updating the player automatically updates this
// preview: there is no hand-mirrored mock code to drift.
const PREVIEW_PLAYER_URL = 'https://mahogany-tower.netlify.app/?preview=1'

/* Build a CDN URL straight from an asset _ref (no extra fetch needed).
   image-<hash>-<dims>-<ext> → /images/...  ·  file-<hash>-<ext> → /files/... */
function assetUrl(ref: string | undefined, projectId: string, dataset: string, w?: number): string | null {
  if (!ref) return null
  const p = ref.split('-')
  if (p[0] === 'image' && p.length >= 4) {
    return `https://cdn.sanity.io/images/${projectId}/${dataset}/${p[1]}-${p[2]}.${p[3]}${w ? `?w=${w}&auto=format` : ''}`
  }
  if (p[0] === 'file' && p.length >= 3) {
    return `https://cdn.sanity.io/files/${projectId}/${dataset}/${p[1]}.${p[2]}`
  }
  return null
}

export function MediaOverview(props: Props) {
  useEditWhenNew(props.document)   // brand-new doc → jump to Edit
  const d        = props.document.displayed || {}
  const client   = useClient({ apiVersion: '2024-01-01' })
  const cfg      = client.config() as { projectId?: string; dataset?: string }
  const pid      = cfg.projectId || ''
  const ds       = cfg.dataset || ''
  const mediaId  = String(d._id || '').replace(/^drafts\./, '')

  const [usage, setUsage]       = useState<UseRow[] | null>(null)
  const [offer, setOffer]       = useState<OfferRow | null>(null)
  const [provider, setProvider] = useState<RefRow | null>(null)

  // Where is this media playing? (same query as MediaUsageSummary, minus form context)
  useEffect(() => {
    if (!mediaId) { setUsage([]); return }
    client.fetch<UseRow[]>(
      `*[_type == "playlistItem" && media._ref == $id] | order(project->title asc, order asc) {
        _id, order, enabled,
        "projectId": project._ref, "projectTitle": project->title, "projectCode": project->code.current
      }`, { id: mediaId },
    ).then(r => setUsage(r ?? [])).catch(() => setUsage([]))
  }, [client, mediaId])

  // Linked offer / provider titles (for the "connected to" row)
  const offerRef = d.offer?._ref, provRef = d.provider?._ref
  useEffect(() => {
    if (!offerRef) { setOffer(null); return }
    client.fetch<OfferRow>(
      `*[_id == $id][0]{ _id, "title": coalesce(title_th, title_en), title_en,
        category, price, description_th, description_en, displayLang,
        ctaType, ctaLabel, ctaType2, ctaLabel2,
        "img": coalesce(primaryImage.asset->url, images[0].asset->url, listingImages[0].asset->url) }`, { id: offerRef })
      .then(setOffer).catch(() => setOffer(null))
  }, [client, offerRef])
  useEffect(() => {
    if (!provRef) { setProvider(null); return }
    client.fetch<RefRow>(`*[_id == $id][0]{ _id, "title": coalesce(name_th, name_en), "logo": logo.asset->url }`, { id: provRef })
      .then(setProvider).catch(() => setProvider(null))
  }, [client, provRef])

  // Hero mirrors what the SCREEN actually airs (build.mjs coalesce order):
  // imageFiles first — for image promos posterImage never airs, so showing it
  // here as the hero misled editors about which image is live.
  const heroRef  = d.imageFiles?.[0]?.asset?._ref || d.posterImage?.asset?._ref || d.imageFile?.asset?._ref
  const hero     = assetUrl(heroRef, pid, ds, 1000)
  const videoUrl = assetUrl(d.videoFile?.asset?._ref, pid, ds)
  const isVideo  = d.type === 'video' || !!d.videoFile
  const imgCount = Array.isArray(d.imageFiles) ? d.imageFiles.length : 0

  const duration = isVideo
    ? (d.videoDuration ? `${Math.round(d.videoDuration)} วินาที` : null)
    : (d.defaultImageDuration ? `${d.defaultImageDuration} วิ/รูป` : null)

  const expired = d.expiresAt ? new Date(d.expiresAt) < new Date() : false

  // ── kiosk preview via the REAL player (iframe + postMessage) ──────────────
  // Handshake: the player in ?preview=1 posts 'aq-preview-ready', then we send
  // it ONE playlist-shaped item (same field names the baked/live projection
  // produces) and it renders with the production code path.
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [frameReady, setFrameReady] = useState(false)
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'aq-preview-ready') setFrameReady(true)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const previewItem = useMemo(() => ({
    kind:      d.kind || 'promo',
    title:     d.title || '',
    title_en:  d.altText || offer?.title_en || null,
    eyebrow:   offer?.category || null,
    sub_th:    offer?.description_th || null,
    sub_en:    offer?.description_en || null,
    mediaType: isVideo ? 'video' : 'image',
    url:       isVideo ? videoUrl : hero,
    images:    Array.isArray(d.imageFiles)
                 ? d.imageFiles.map((f: any) => assetUrl(f?.asset?._ref, pid, ds, 1200)).filter(Boolean)
                 : null,
    poster:    assetUrl(d.posterImage?.asset?._ref, pid, ds, 1200),
    category:  offer?.category || null,
    ctaType:   offer?.ctaType  || null, ctaLabel:  offer?.ctaLabel  || null, ctaURL:  null,
    ctaType2:  offer?.ctaType2 || null, ctaLabel2: offer?.ctaLabel2 || null, ctaURL2: null,
    price:     offer?.price || null,
    provider:  provider ? { logo: provider.logo || '', name_th: provider.title, name_en: provider.title } : null,
    defaultImageDuration: d.defaultImageDuration || null,
    videoShowCta: d.videoShowCta !== false,
    videoEndCard: d.videoEndCard === true,
    endCardImg: assetUrl(d.endCardImage?.asset?._ref, pid, ds, 1200),
    offerImg:  offer?.img || null,
  }), [d, offer, provider, isVideo, videoUrl, hero, pid, ds])

  useEffect(() => {
    if (!frameReady || !frameRef.current?.contentWindow) return
    frameRef.current.contentWindow.postMessage(
      { type: 'aq-preview', item: previewItem, lang: d.displayLang === 'en' ? 'en' : 'th' }, '*')
  }, [frameReady, previewItem, d.displayLang])

  const groups = useMemo(() => {
    const g: Record<string, { title: string; code?: string; slots: UseRow[] }> = {}
    for (const r of usage || []) {
      const k = r.projectId || '?'
      if (!g[k]) g[k] = { title: r.projectTitle || '(ไม่ทราบโครงการ)', code: r.projectCode, slots: [] }
      g[k].slots.push(r)
    }
    return Object.values(g)
  }, [usage])

  const detailRows: Array<[string, string]> = []
  if (d.altText) detailRows.push(['Alt text', String(d.altText)])
  if (Array.isArray(d.subCategories) && d.subCategories.length) detailRows.push(['หมวดย่อย', d.subCategories.join(' · ')])
  if (Array.isArray(d.tags) && d.tags.length) detailRows.push(['แท็ก', d.tags.join(' · ')])
  if (d.addToPlaylistOnPublish) detailRows.push(['Playlist อัตโนมัติ', '✓ เพิ่มเข้า playlist เองเมื่อ publish'])
  if (Array.isArray(d.excludedProjects) && d.excludedProjects.length) detailRows.push(['ยกเว้นโครงการ', `${d.excludedProjects.length} โครงการ`])
  if (d.expiresAt) detailRows.push(['หมดอายุ', new Date(d.expiresAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })])

  return (
    <Box padding={4}>
      <Stack space={4} style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* read-only hint — why this tab exists */}
        <Card padding={3} radius={3} tone="primary">
          <Text size={1}>👁️ หน้าสรุป (ดูอย่างเดียว) — ต้องการแก้ไข กดแท็บ <b>Edit</b> ด้านบน</Text>
        </Card>

        {/* 1 — kiosk-slide preview: the REAL player (vertical-signage.html)
            embedded in ?preview=1 mode and scaled down — the exact production
            render path (title clamp, Thai breaks, CTA row, category pill).
            No hand-mirrored mock code to drift when the player changes. */}
        <Stack space={2}>
          <Flex justify="center">
            <div style={{
              width: 300, height: 533, position: 'relative', flexShrink: 0,
              borderRadius: 16, overflow: 'hidden', background: '#0B1526',
              boxShadow: '0 10px 36px rgba(0,0,0,0.35)',
            }}>
              <iframe
                ref={frameRef}
                src={PREVIEW_PLAYER_URL}
                title="kiosk preview"
                style={{
                  width: 1080, height: 1920, border: 0,
                  transform: 'scale(0.27778)', transformOrigin: 'top left',
                  pointerEvents: 'none',   // preview only — no menu taps
                }}
              />
            </div>
          </Flex>
          <Flex justify="center" align="center" gap={3}>
            <Text size={1} muted>
              🖥 ตัวอย่างจากโค้ดจอจริง (player ตัวเดียวกับที่ฉายบนตึก)
            </Text>
          </Flex>
        </Stack>

        {/* title + status badges */}
        <Stack space={3}>
          {d.title && <Heading size={2}>{String(d.title).replace(/\|/g, ' ')}</Heading>}
          <Flex gap={2} wrap="wrap">
            <Badge tone={d.isActive ? 'positive' : 'critical'} fontSize={1} padding={2}>
              {d.isActive ? '● กำลังใช้งาน' : '○ ปิดใช้งาน'}
            </Badge>
            {expired && <Badge tone="critical" fontSize={1} padding={2}>⚠ หมดอายุแล้ว</Badge>}
            {d.kind && <Badge tone="primary" fontSize={1} padding={2}>{d.kind === 'notice' ? '📌 ประกาศ' : '🎬 โปรโม'}</Badge>}
            <Badge mode="outline" fontSize={1} padding={2}>{isVideo ? 'วิดีโอ' : imgCount > 1 ? `รูปภาพ × ${imgCount}` : 'รูปภาพ'}</Badge>
            {duration && <Badge mode="outline" fontSize={1} padding={2}>⏱ {duration}</Badge>}
            {d.scope === 'project' && <Badge mode="outline" fontSize={1} padding={2}>เฉพาะบางโครงการ</Badge>}
          </Flex>
          {videoUrl && (
            <Text size={1}><a href={videoUrl} target="_blank" rel="noreferrer">เปิดไฟล์วิดีโอ ↗</a></Text>
          )}
        </Stack>

        {/* 2 — where it plays */}
        <Stack space={3}>
          <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>📺 กำลังขึ้นจอที่</Text>
          {usage === null ? (
            <Flex justify="center" padding={3}><Spinner /></Flex>
          ) : groups.length === 0 ? (
            <Card padding={3} radius={3} tone="caution">
              <Text size={1}>ยังไม่ได้อยู่ใน playlist ของโครงการใด — สื่อนี้จึงยังไม่แสดงบนจอ</Text>
            </Card>
          ) : (
            groups.map(g => (
              <Card key={g.title} padding={3} radius={3} shadow={1}>
                <Flex align="center" gap={3}>
                  <Box flex={1}>
                    <Text weight="semibold">{g.title}</Text>
                    <Text size={1} muted style={{ marginTop: 4 }}>
                      {g.slots.map(s => `ช่อง #${(s.order ?? 0)}${s.enabled === false ? ' (ปิด)' : ''}`).join(' · ')}
                    </Text>
                  </Box>
                  {g.code && <Badge mode="outline">{g.code}</Badge>}
                </Flex>
              </Card>
            ))
          )}
        </Stack>

        {/* 3 — connections */}
        {(offer || provider) && (
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔗 เชื่อมโยงกับ</Text>
            <Flex gap={2} wrap="wrap">
              {offer && (
                <Card padding={3} radius={3} shadow={1}>
                  <Text size={1}>
                    🎫 <IntentLink intent="edit" params={{ id: offer._id, type: 'offer' }}>{offer.title || 'Offer'}</IntentLink>
                  </Text>
                </Card>
              )}
              {provider && (
                <Card padding={3} radius={3} shadow={1}>
                  <Text size={1}>
                    🏪 <IntentLink intent="edit" params={{ id: provider._id, type: 'provider' }}>{provider.title || 'Provider'}</IntentLink>
                  </Text>
                </Card>
              )}
            </Flex>
          </Stack>
        )}

        {/* the fine print — compact, muted, out of the way */}
        {detailRows.length > 0 && (
          <Card padding={3} radius={3} tone="transparent" border>
            <Stack space={3}>
              {detailRows.map(([k, v]) => (
                <Flex key={k} gap={3}>
                  <Box style={{ width: 130, flexShrink: 0 }}><Text size={1} muted>{k}</Text></Box>
                  <Text size={1}>{v}</Text>
                </Flex>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    </Box>
  )
}
