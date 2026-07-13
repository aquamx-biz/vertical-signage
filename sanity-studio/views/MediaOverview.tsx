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
import { Badge, Box, Button, Card, Flex, Heading, Spinner, Stack, Text } from '@sanity/ui'
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
interface RefRow { _id: string; title?: string | null }
interface OfferRow {
  _id: string; title?: string | null
  category?: string | null; price?: string | null
  description_th?: string | null; description_en?: string | null
  displayLang?: string | null
  ctaType?: string | null; ctaLabel?: string | null
  ctaType2?: string | null; ctaLabel2?: string | null
}

// Display-only copies of the player's fallback maps (category eyebrow + CTA labels)
const CAT_TH: Record<string, string> = {
  food: 'อาหาร', groceries: 'ของใช้/ของชำ', services: 'บริการ',
  healthBeauty: 'สุขภาพ & ความงาม', leisureTravel: 'ท่องเที่ยว & พักผ่อน',
  shopping: 'ช้อปปิ้ง', education: 'การศึกษา', events: 'อีเวนต์',
  forRent: 'ให้เช่า', forSale: 'ขาย', buildingUpdates: 'ประกาศอาคาร',
}
const CTA_TH: Record<string, string> = {
  viewMenu: 'ดูเมนู', order: 'สั่งซื้อ', book: 'จองคิว', viewListing: 'ดูประกาศ',
  viewStore: 'ดูร้าน', contact: 'ดูข้อเสนอ', signup: 'สมัคร', event: 'อีเวนต์',
}

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
      `*[_id == $id][0]{ _id, "title": coalesce(title_th, title_en),
        category, price, description_th, description_en, displayLang,
        ctaType, ctaLabel, ctaType2, ctaLabel2 }`, { id: offerRef })
      .then(setOffer).catch(() => setOffer(null))
  }, [client, offerRef])
  useEffect(() => {
    if (!provRef) { setProvider(null); return }
    client.fetch<RefRow>(`*[_id == $id][0]{ _id, "title": coalesce(name_th, name_en) }`, { id: provRef })
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

  // ── kiosk-mock values — mirror the player's fallback logic ────────────────
  const isNotice    = d.kind === 'notice'
  const mockEyebrow = isNotice
    ? 'ข่าวสารอาคาร'
    : (offer?.category ? (CAT_TH[offer.category] || offer.category) : 'โปรโมชั่น')
  // caption language follows THIS media's displayLang (what the screen's default
  // mode shows) — not the offer's flag, which once made the mock show English
  // under a Thai-primary media
  const mockDesc = offer
    ? (d.displayLang === 'en'
        ? (offer.description_en || offer.description_th)
        : (offer.description_th || offer.description_en))
    : null
  const mockCtas: string[] = []
  if (!isNotice) {   // notices never get a CTA on screen
    mockCtas.push(offer?.ctaLabel || (offer?.ctaType ? CTA_TH[offer.ctaType] || offer.ctaType : '') || 'ดูเพิ่มเติม')
    if (offer?.ctaType2) mockCtas.push(offer.ctaLabel2 || CTA_TH[offer.ctaType2] || offer.ctaType2)
  }

  // ── save the mock as a shareable PNG (client-side DOM → canvas → download) ──
  // Sanity CDN sends CORS headers for the studio origin, so images inline fine.
  const mockRef = useRef<HTMLDivElement>(null)
  const [savingPng, setSavingPng] = useState(false)
  async function saveMockPng() {
    if (!mockRef.current) return
    setSavingPng(true)
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(mockRef.current, { pixelRatio: 3, cacheBust: true })
      const a = document.createElement('a')
      a.href = url
      a.download = `${String(d.title || 'media-preview').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)}.png`
      a.click()
    } catch (e) {
      alert('บันทึกรูปไม่สำเร็จ: ' + String(e))
    }
    setSavingPng(false)
  }

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

        {/* 1 — kiosk-slide mock: 9:16 frame laid out like renderSlot() in
            vertical-signage.html (eyebrow pill → title → price → sub → CTA dock)
            so editors see roughly what airs, not just the raw image. */}
        <Stack space={2}>
          <Flex justify="center">
            <div ref={mockRef} style={{
              width: 300, height: 533, position: 'relative', flexShrink: 0,
              borderRadius: 16, overflow: 'hidden', background: '#0B1526',
              boxShadow: '0 10px 36px rgba(0,0,0,0.35)',
              fontFamily: "'Prompt','IBM Plex Sans Thai',sans-serif",
            }}>
              {hero ? (
                <img src={hero} alt={d.altText || d.title || 'media'}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Flex align="center" justify="center" style={{ position: 'absolute', inset: 0 }}>
                  <Text size={2} style={{ color: '#8a93a6' }}>{isVideo ? '🎬 วิดีโอ (ยังไม่มีภาพปก)' : '🖼️ ยังไม่มีรูป'}</Text>
                </Flex>
              )}
              {isVideo && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>▶️</div>
              )}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(6,10,20,0.4) 0%, transparent 16%, transparent 42%, rgba(6,10,20,0.94) 100%)' }} />
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, color: '#fff' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 12px',
                  border: '1px solid rgba(255,255,255,0.4)', borderRadius: 999,
                  background: 'rgba(8,12,22,0.45)', fontSize: 9, fontWeight: 600,
                  letterSpacing: 2, textTransform: 'uppercase',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#39D0FF', boxShadow: '0 0 6px #39D0FF' }} />
                  {mockEyebrow}
                  <span style={{ opacity: 0.6, fontWeight: 700 }}>›</span>
                </div>
                <div style={{
                  marginTop: 8, fontSize: 26, fontWeight: 600, lineHeight: 1.3,
                  textTransform: 'uppercase', textShadow: '0 2px 10px rgba(0,0,0,0.6)',
                  display: '-webkit-box', WebkitBoxOrient: 'vertical' as any, WebkitLineClamp: 2, overflow: 'hidden',
                }}>
                  {/* '|' = author's line-break hint (same convention as the player's
                      thaiBreakHTML): each piece stays unbroken, breaks allowed between */}
                  {String(d.title || '(ไม่มีชื่อ)').split('|').map((u, i) => (
                    <React.Fragment key={i}>{i > 0 && '​'}<span style={{ whiteSpace: 'nowrap' }}>{u}</span></React.Fragment>
                  ))}
                </div>
                {offer?.price && (
                  <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: '#C9864C', textShadow: '0 1px 5px rgba(0,0,0,0.65)' }}>{offer.price}</div>
                )}
                {mockDesc && (
                  <div style={{
                    marginTop: 6, fontSize: 10.5, lineHeight: 1.45, color: 'rgba(255,255,255,0.8)',
                    display: '-webkit-box', WebkitBoxOrient: 'vertical' as any, WebkitLineClamp: 3, overflow: 'hidden',
                    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                  }}>{mockDesc}</div>
                )}
                {mockCtas.length > 0 && (
                  // mirrors the player's .cta-dock: grid column sized to the WIDEST
                  // label (max-content) — buttons hug their text, never full-width
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'max-content', justifyContent: 'start', gap: 6 }}>
                    {mockCtas.map((c, i) => (
                      <div key={c + i} style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 22, padding: '9px 14px', borderRadius: 10, whiteSpace: 'nowrap',
                        background: 'rgba(10,16,28,0.72)', border: '1px solid rgba(255,255,255,0.14)',
                        fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
                      }}>
                        <span>{c}</span><span style={{ opacity: 0.7 }}>{i === 0 ? '→' : '↗'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Flex>
          <Flex justify="center" align="center" gap={3}>
            <Text size={1} muted>
              🖥 ตัวอย่างจำลองหน้าจอ (โดยประมาณ){d.kind === 'notice' ? ' — ประกาศบนจอจริงใช้เลย์เอาต์กระดาษขาว' : ''}
            </Text>
            <Button text={savingPng ? '⏳ กำลังบันทึก…' : '💾 บันทึกเป็นรูป'} mode="ghost" fontSize={1} padding={2}
              disabled={savingPng} onClick={saveMockPng}
              title="ดาวน์โหลดภาพจำลองนี้เป็น PNG — ส่งให้ลูกค้าดูได้เลย" />
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
