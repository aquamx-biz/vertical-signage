/**
 * OfferOverview — dedicated read-only landing view for `offer` documents.
 *
 * This is the doc admins open most (reviewing vendor ad submissions), so the
 * overview answers the reviewer's real questions in order:
 *   1. What does the ad look like?   → hero image, title, price, description
 *   2. Whose is it?                  → provider chip (logo + name, click-through)
 *   3. Is it LIVE end-to-end?        → 4-step pipeline checklist (the schema's
 *      own rule: approved content still needs media + playlist + publish before
 *      it reaches a screen — this makes the missing step obvious at a glance)
 *   4. Where / how does it display?  → screens list, display mode, CTA summary
 * Everything else stays on the Edit tab.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useClient } from 'sanity'
import { IntentLink, useRouter } from 'sanity/router'
import { Badge, Box, Button, Card, Flex, Heading, Spinner, Stack, Text, useToast } from '@sanity/ui'
import { useEditWhenNew } from './useEditWhenNew'

interface Props {
  document: {
    draft:     Record<string, any> | null
    published: Record<string, any> | null
    displayed: Record<string, any>
  }
  schemaType: { name: string; title?: string }
}

interface SlotRow {
  _id: string; order?: number; enabled?: boolean
  projectTitle?: string; projectCode?: string; projectId?: string
}
interface MediaRow { _id: string; title?: string | null; isActive?: boolean }
interface ProvRow  { _id: string; title?: string | null; logo?: string | null }

const CTA_TH: Record<string, string> = {
  viewMenu: 'ดูเมนู', order: 'สั่งซื้อ', book: 'จองคิว', viewListing: 'ดูประกาศ',
  viewStore: 'ดูร้าน', contact: 'ดูข้อเสนอ', signup: 'สมัคร', event: 'อีเวนต์',
}

// Thai category labels — display copy of category-config.json (menu mock header)
const CAT_TH: Record<string, string> = {
  food: 'อาหาร', groceries: 'ของใช้/ของชำ', services: 'บริการ',
  healthBeauty: 'สุขภาพ & ความงาม', leisureTravel: 'ท่องเที่ยว & พักผ่อน',
  shopping: 'ช้อปปิ้ง', education: 'การศึกษา', events: 'อีเวนต์',
  forRent: 'ให้เช่า', forSale: 'ขาย', buildingUpdates: 'ประกาศอาคาร',
}

function assetUrl(ref: string | undefined, projectId: string, dataset: string, w?: number): string | null {
  if (!ref) return null
  const p = ref.split('-')
  if (p[0] === 'image' && p.length >= 4) {
    return `https://cdn.sanity.io/images/${projectId}/${dataset}/${p[1]}-${p[2]}.${p[3]}${w ? `?w=${w}&auto=format` : ''}`
  }
  return null
}

function StepRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <Flex align="center" gap={3}>
      <Text size={2}>{ok ? '✅' : '⭕'}</Text>
      <Box flex={1}>
        <Text size={1} weight={ok ? 'regular' : 'semibold'}>{label}</Text>
        {!ok && hint && <Text size={1} muted style={{ marginTop: 2 }}>{hint}</Text>}
      </Box>
    </Flex>
  )
}

export function OfferOverview(props: Props) {
  useEditWhenNew(props.document)   // brand-new doc → jump to Edit
  const d       = props.document.displayed || {}
  const client  = useClient({ apiVersion: '2024-01-01' })
  const cfg     = client.config() as { projectId?: string; dataset?: string }
  const pid     = cfg.projectId || ''
  const ds      = cfg.dataset || ''
  const offerId = String(d._id || '').replace(/^drafts\./, '')

  const [slots, setSlots]   = useState<SlotRow[] | null>(null)
  const [medias, setMedias] = useState<MediaRow[] | null>(null)
  const [prov, setProv]     = useState<ProvRow | null>(null)

  useEffect(() => {
    if (!offerId) { setSlots([]); setMedias([]); return }
    client.fetch<SlotRow[]>(
      `*[_type == "playlistItem" && media->offer._ref == $id] | order(project->title asc, order asc) {
        _id, order, enabled,
        "projectId": project._ref, "projectTitle": project->title, "projectCode": project->code.current
      }`, { id: offerId },
    ).then(r => setSlots(r ?? [])).catch(() => setSlots([]))
    client.fetch<MediaRow[]>(
      `*[_type == "media" && offer._ref == $id]{ _id, title, isActive }`, { id: offerId },
    ).then(r => setMedias(r ?? [])).catch(() => setMedias([]))
  }, [client, offerId])

  const provRef = d.provider?._ref
  useEffect(() => {
    if (!provRef) { setProv(null); return }
    client.fetch<ProvRow>(
      `*[_id == $id][0]{ _id, "title": coalesce(name_th, name_en), "logo": logo.asset->url }`, { id: provRef },
    ).then(setProv).catch(() => setProv(null))
  }, [client, provRef])

  const title = d.title_th || d.title_en || '(ไม่มีชื่อ)'
  const heroRef = d.images?.[0]?.asset?._ref || d.primaryImage?.asset?._ref
  const hero = assetUrl(heroRef, pid, ds, 1000)
  const imgCount = (Array.isArray(d.images) ? d.images.length : 0) || (d.primaryImage ? 1 : 0)

  const review: string = d.reviewStatus || 'pending'
  const reviewBadge = review === 'approved'
    ? { tone: 'positive' as const, label: '✓ เนื้อหาผ่านรีวิว' }
    : review === 'rejected'
      ? { tone: 'critical' as const, label: '✗ ไม่ผ่านรีวิว' }
      : { tone: 'caution' as const, label: '◷ รอรีวิว' }

  const now = Date.now()
  const notYet  = d.validFrom ? new Date(d.validFrom).getTime() > now : false
  const expired = d.validTo   ? new Date(d.validTo).getTime()   < now : false

  const isProperty = d.category === 'forRent' || d.category === 'forSale' || d.category === 'rent' || d.category === 'sale'
  const specs: string[] = []
  if (isProperty && d.listing) {
    if (d.listing.bed != null)  specs.push(`🛏 ${d.listing.bed} นอน`)
    if (d.listing.bath != null) specs.push(`🛁 ${d.listing.bath} น้ำ`)
    if (d.listing.area != null) specs.push(`📐 ${d.listing.area} ตร.ม.`)
    if (d.listing.floor)        specs.push(`ชั้น ${d.listing.floor}`)
  }

  // ── pipeline checklist: what's between this offer and a real screen ────────
  const hasPublished = !!props.document.published
  const hasDraftEdits = !!props.document.draft && hasPublished
  const activeMedia = (medias || []).filter(m => m.isActive !== false)
  const steps = {
    approved:  review === 'approved',
    hasMedia:  (medias?.length ?? 0) > 0,
    inPlaylist:(slots?.length ?? 0) > 0,
    published: hasPublished,
  }
  const liveOnScreen = steps.approved && steps.hasMedia && steps.inPlaylist && steps.published &&
                       d.status !== false && !expired && !notYet
  const loadingUsage = slots === null || medias === null

  // ── one-click media creation — a REAL button at the step that needs it ─────
  // (deliberately NOT in the Publish dropdown: publishing is the LAST thing a
  // user does; utility work must live where the workflow shows the gap.)
  const router = useRouter()
  const toast  = useToast()
  const [creatingMedia, setCreatingMedia] = useState(false)
  async function createMediaFromOffer() {
    setCreatingMedia(true)
    try {
      const displayLang = d.displayLang || (/[฀-๿]/.test(d.title_th || '') || !d.title_en ? 'th' : 'en')
      const mTitle = displayLang === 'en' ? (d.title_en || d.title_th) : (d.title_th || d.title_en)
      const srcImages = (Array.isArray(d.images) && d.images.length)
        ? d.images
        : (d.primaryImage ? [d.primaryImage] : [])
      const imageFiles = srcImages
        .filter((img: any) => img?.asset?._ref)
        .map((img: any, i: number) => ({
          _type: 'image', _key: img._key || `offer-img-${i}`,
          asset: { _type: 'reference', _ref: img.asset._ref },   // reuse asset — no re-upload
        }))
      const newId = `drafts.${crypto.randomUUID()}`
      await client.create({
        _id: newId, _type: 'media', kind: 'promo', type: 'image',
        displayLang, title: mTitle || '(ไม่มีชื่อ)',
        ...(imageFiles.length ? { imageFiles } : {}),
        defaultImageDuration: 10,
        offer: { _type: 'reference', _ref: offerId, _weak: true },   // weak: offer may be draft-only
        // provider: strong when published (schema expects strong); weak only for drafts
        ...(d.provider?._ref ? {
          provider: {
            _type: 'reference', _ref: d.provider._ref,
            ...((await client.fetch(`defined(*[_id == $id][0]._id)`, { id: d.provider._ref })) ? {} : { _weak: true }),
          },
        } : {}),
        scope: d.scope || 'global',
        ...(Array.isArray(d.projects) && d.projects.length ? { projects: d.projects } : {}),
        isActive: true, addToPlaylistOnPublish: false,
      })
      toast.push({ status: 'success', title: 'สร้าง Media draft แล้ว',
        description: imageFiles.length ? `ดึงรูป ${imageFiles.length} รูป + ชื่อจาก offer ให้แล้ว` : 'offer นี้ไม่มีรูป — เพิ่มรูปใน media ก่อน publish' })
      router.navigateIntent('edit', { id: newId.replace(/^drafts\./, ''), type: 'media' })
    } catch (err: any) {
      toast.push({ status: 'error', title: 'สร้างไม่สำเร็จ', description: err?.message ?? String(err) })
    } finally { setCreatingMedia(false) }
  }

  const groups = useMemo(() => {
    const g: Record<string, { title: string; code?: string; slots: SlotRow[] }> = {}
    for (const r of slots || []) {
      const k = r.projectId || '?'
      if (!g[k]) g[k] = { title: r.projectTitle || '(ไม่ทราบโครงการ)', code: r.projectCode, slots: [] }
      g[k].slots.push(r)
    }
    return Object.values(g)
  }, [slots])

  // CTA summary rows (primary + optional second button)
  const ctas: string[] = []
  if (d.ctaType)  ctas.push(`${d.ctaLabel || CTA_TH[d.ctaType] || d.ctaType}${d.ctaURL ? ` → ${String(d.ctaURL).replace(/^https?:\/\//, '').slice(0, 40)}` : ''}`)
  if (d.ctaType2) ctas.push(`${d.ctaLabel2 || CTA_TH[d.ctaType2] || d.ctaType2}${d.ctaURL2 ? ` → ${String(d.ctaURL2).replace(/^https?:\/\//, '').slice(0, 40)}` : ''}`)

  const detailRows: Array<[string, string]> = []
  if (d.category) detailRows.push(['หมวด', String(d.category) + (Array.isArray(d.subCategories) && d.subCategories.length ? ` · ${d.subCategories.join(', ')}` : '')])
  if (d.displayMode) detailRows.push(['การแสดงผล', d.displayMode === 'media' ? 'Media — วนบนจอ + อยู่ในเมนู' : 'Menu — อยู่ในเมนูอย่างเดียว'])
  if (d.scope) detailRows.push(['ขอบเขต', d.scope === 'global' ? 'ทุกโครงการ' : `เฉพาะ ${Array.isArray(d.projects) ? d.projects.length : '?'} โครงการ`])
  if (ctas.length) detailRows.push(['ปุ่ม CTA', ctas.join('  ·  ')])
  if (Array.isArray(d.menuItems) && d.menuItems.length) detailRows.push(['เมนู', `${d.menuItems.length} รายการ`])
  if (Array.isArray(d.orderItems) && d.orderItems.length) detailRows.push(['สินค้า', `${d.orderItems.length} รายการ`])
  if (d.videoUrl) detailRows.push(['วิดีโอ (Cloudinary)', String(d.videoUrl).slice(0, 60) + '…'])
  if (d.availability) detailRows.push(['ช่วงเวลา', String(d.availability)])
  if (d.validFrom || d.validTo) detailRows.push(['อายุโฆษณา',
    `${d.validFrom ? new Date(d.validFrom).toLocaleDateString('th-TH') : '—'} → ${d.validTo ? new Date(d.validTo).toLocaleDateString('th-TH') : '—'}`])
  if (d.slug?.current) detailRows.push(['Slug', d.slug.current])

  return (
    <Box padding={4}>
      <Stack space={4} style={{ maxWidth: 720, margin: '0 auto' }}>

        <Card padding={3} radius={3} tone="primary">
          <Text size={1}>👁️ หน้าสรุป (ดูอย่างเดียว) — ต้องการแก้ไข กดแท็บ <b>Edit</b> ด้านบน</Text>
        </Card>

        {/* 1 — the ad itself */}
        <Card radius={3} shadow={1} overflow="hidden" tone="transparent">
          {hero ? (
            <img src={hero} alt={title} style={{ display: 'block', width: '100%', maxHeight: 420, objectFit: 'cover' }} />
          ) : (
            <Flex align="center" justify="center" style={{ height: 180, background: '#12161f' }}>
              <Text size={2} style={{ color: '#8a93a6' }}>🖼️ ยังไม่มีรูปโฆษณา</Text>
            </Flex>
          )}
        </Card>

        <Stack space={3}>
          <Heading size={2}>{title}</Heading>
          {d.description_th && <Text size={1} muted>{String(d.description_th).slice(0, 160)}</Text>}
          <Flex gap={2} wrap="wrap" align="center">
            {liveOnScreen && <Badge tone="positive" fontSize={1} padding={2}>📺 กำลังขึ้นจอ</Badge>}
            <Badge tone={reviewBadge.tone} fontSize={1} padding={2}>{reviewBadge.label}</Badge>
            <Badge tone={d.status === false ? 'critical' : 'positive'} mode="outline" fontSize={1} padding={2}>
              {d.status === false ? 'ปิดใช้งาน' : 'Active'}
            </Badge>
            {hasDraftEdits && <Badge tone="caution" fontSize={1} padding={2}>✏️ มีแก้ไขยังไม่ publish</Badge>}
            {notYet && <Badge tone="caution" fontSize={1} padding={2}>⏳ ยังไม่ถึงวันเริ่ม</Badge>}
            {expired && <Badge tone="critical" fontSize={1} padding={2}>⚠ หมดเขตแล้ว</Badge>}
            {d.price && <Badge mode="outline" fontSize={1} padding={2}>💰 {d.price}</Badge>}
            {imgCount > 0 && <Badge mode="outline" fontSize={1} padding={2}>รูป × {imgCount}</Badge>}
            {d.showcaseWeb && <Badge tone="primary" fontSize={1} padding={2}>🌐 โชว์บนเว็บ</Badge>}
          </Flex>
          {specs.length > 0 && (
            <Flex gap={2} wrap="wrap">{specs.map(s => <Badge key={s} mode="outline" fontSize={1} padding={2}>{s}</Badge>)}</Flex>
          )}
        </Stack>

        {/* 2 — whose ad */}
        {prov && (
          <Card padding={3} radius={3} shadow={1}>
            <Flex align="center" gap={3}>
              {prov.logo && <img src={`${prov.logo}?w=80&h=80&fit=crop&auto=format`} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />}
              <Box flex={1}>
                <Text size={1} muted>ร้าน / ผู้ลงโฆษณา</Text>
                <Text weight="semibold" style={{ marginTop: 2 }}>
                  <IntentLink intent="edit" params={{ id: prov._id, type: 'provider' }}>{prov.title || 'Provider'}</IntentLink>
                </Text>
              </Box>
            </Flex>
          </Card>
        )}

        {/* 2.5 — menu-card mock: how this offer looks as a card in the kiosk
            category menu (every offer appears there — Menu Ads exclusively so).
            Mirrors buildCatCard(): image + provider logo/name overlay, then
            name / provider / price-in-cyan. A dimmed ghost card conveys the
            2-column grid context. */}
        <Stack space={2}>
          <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🍽 การ์ดในเมนูหมวด (ตัวอย่างโดยประมาณ)
          </Text>
          <Flex justify="center">
            <div style={{ width: 320, padding: 14, borderRadius: 16, background: '#0B1526', fontFamily: "'Prompt','IBM Plex Sans Thai',sans-serif" }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#39D0FF', boxShadow: '0 0 6px #39D0FF' }} />
                {d.category ? (CAT_TH[d.category] || d.category) : 'หมวด'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, overflow: 'hidden', color: '#fff' }}>
                  <div style={{ position: 'relative', height: 96, background: '#0a0c10' }}>
                    {hero && <img src={hero} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    {prov?.logo && <img src={`${prov.logo}?w=80&h=80&fit=crop&auto=format`} alt="" style={{ position: 'absolute', top: 6, left: 6, width: 26, height: 26, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(8,12,22,0.55)' }} />}
                    {prov?.title && (
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 7px 4px', fontSize: 8, fontWeight: 700, textAlign: 'right', textShadow: '0 1px 4px rgba(0,0,0,0.85)', background: 'linear-gradient(0deg, rgba(5,6,8,0.78) 0%, transparent 100%)' }}>{prov.title}</div>
                    )}
                  </div>
                  <div style={{ padding: '8px 9px 10px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.25 }}>{title}</div>
                    {prov?.title && <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.6)', marginTop: 3, letterSpacing: 0.3 }}>{prov.title}</div>}
                    {d.price && <div style={{ fontSize: 8, color: '#39D0FF', marginTop: 5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.6 }}>{d.price}</div>}
                  </div>
                </div>
                {/* ghost neighbour — grid context only */}
                <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, overflow: 'hidden', opacity: 0.3 }}>
                  <div style={{ height: 96, background: '#12161f' }} />
                  <div style={{ padding: '8px 9px 10px' }}>
                    <div style={{ height: 9, width: '75%', borderRadius: 3, background: 'rgba(255,255,255,0.35)' }} />
                    <div style={{ height: 7, width: '50%', borderRadius: 3, background: 'rgba(255,255,255,0.2)', marginTop: 6 }} />
                  </div>
                </div>
              </div>
            </div>
          </Flex>
          <Flex justify="center">
            <Text size={1} muted>
              {d.displayMode === 'menu'
                ? 'Menu Ad — โผล่เฉพาะการ์ดในเมนูแบบนี้ ไม่วนบนจอ · หน้ามือถือดูแท็บ "หน้าเว็บ (ลูกค้า)"'
                : 'ทุก offer มีการ์ดในเมนูแบบนี้ · แบบวนจอดูตัวอย่างสไลด์ที่ media ที่ผูกไว้ · หน้ามือถือดูแท็บ "หน้าเว็บ (ลูกค้า)"'}
            </Text>
          </Flex>
        </Stack>

        {/* 3 — the pipeline: why is/isn't this on screen? */}
        <Card padding={4} radius={3} shadow={1} tone={liveOnScreen ? 'positive' : 'transparent'} border>
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {liveOnScreen ? '✅ โฆษณานี้ขึ้นจอครบวงจรแล้ว' : '🛠 เส้นทางสู่จอ — ติดขั้นไหน ดูตรงนี้'}
            </Text>
            {loadingUsage ? <Flex justify="center" padding={2}><Spinner /></Flex> : (
              <Stack space={3}>
                <StepRow ok={steps.approved}  label="1 · เนื้อหาผ่านรีวิว" hint="กดอนุมัติจากอีเมลรีวิว หรือแก้ reviewStatus เป็น Approved" />
                <StepRow ok={steps.hasMedia}  label={`2 · มีสื่อในคลัง (Media)${medias?.length ? ` — ${medias.length} ชิ้น${activeMedia.length < (medias?.length || 0) ? ` (เปิดใช้ ${activeMedia.length})` : ''}` : ''}`}
                         hint="สร้าง media doc ผูกกับ offer นี้ (โปสเตอร์/วิดีโอที่จะฉายบนจอ)" />
                <Flex style={{ marginLeft: 34 }}>
                  <Button
                    text={creatingMedia ? '⏳ กำลังสร้าง…' : '🎬 สร้าง Media จาก offer นี้ (ดึงรูป+ชื่อให้อัตโนมัติ)'}
                    tone={steps.hasMedia ? 'default' : 'positive'}
                    mode={steps.hasMedia ? 'ghost' : 'default'}
                    fontSize={1} padding={3}
                    disabled={creatingMedia}
                    onClick={createMediaFromOffer}
                    title="สร้าง media draft โดยดึงรูป (ใช้ไฟล์เดิม ไม่อัปโหลดซ้ำ) ชื่อ ภาษา และผูก offer ให้ครบ — แล้วพาไปหน้า media นั้นเลย"
                  />
                </Flex>
                <StepRow ok={steps.inPlaylist} label={`3 · อยู่ใน playlist ของโครงการ${slots?.length ? ` — ${slots.length} ช่อง` : ''}`}
                         hint="เพิ่ม media เข้า playlist ของโครงการที่ต้องการ (หรือใช้ Add-to-playlist-on-publish บน media)" />
                <StepRow ok={steps.published} label="4 · Publish เอกสารแล้ว" hint="เอกสารยังเป็น draft — กด Publish ที่แท็บ Edit" />
              </Stack>
            )}
          </Stack>
        </Card>

        {/* screens list */}
        {groups.length > 0 && (
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>📺 กำลังขึ้นจอที่</Text>
            {groups.map(g => (
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
            ))}
          </Stack>
        )}

        {/* fine print */}
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
