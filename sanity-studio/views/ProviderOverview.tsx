/**
 * ProviderOverview — dedicated read-only landing view for `provider` documents.
 *
 * Answers the admin's questions about a shop in order:
 *   1. Who is this?        → cover + logo + name + type + description
 *   2. How to reach them?  → phone / LINE / website / location / hours
 *   3. What do they run?   → every offer of this shop, each with review/active
 *      status and a 📺 marker when it is actually rotating on a screen
 *   4. Plumbing            → linked CRM party, web-form owners, handoff type
 * Everything else stays on the Edit tab.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useClient } from 'sanity'
import { IntentLink } from 'sanity/router'
import { Badge, Box, Card, Flex, Heading, Spinner, Stack, Text } from '@sanity/ui'

interface Props {
  document: {
    draft:     Record<string, any> | null
    published: Record<string, any> | null
    displayed: Record<string, any>
  }
  schemaType: { name: string; title?: string }
}

interface OfferRow {
  _id: string; title?: string | null; reviewStatus?: string | null
  active?: boolean | null; category?: string | null; img?: string | null
}

const TYPE_TH: Record<string, string> = {
  shop: '🏪 ร้านค้า / ร้านอาหาร', service: '🛠 บริการ / ธุรกิจ',
  unitOwnerOrAgent: '🏠 เจ้าของห้อง / นายหน้า', juristicOffice: '🏢 นิติบุคคลอาคาร',
}
const HANDOFF_TH: Record<string, string> = { qr: 'QR เท่านั้น', sms: 'เบอร์โทรเท่านั้น', both: 'QR + เบอร์โทร' }

function assetUrl(ref: string | undefined, projectId: string, dataset: string, w?: number): string | null {
  if (!ref) return null
  const p = ref.split('-')
  if (p[0] === 'image' && p.length >= 4) {
    return `https://cdn.sanity.io/images/${projectId}/${dataset}/${p[1]}-${p[2]}.${p[3]}${w ? `?w=${w}&auto=format` : ''}`
  }
  return null
}

/* Studio's raw perspective returns drafts AND published — collapse to one row
   per real document, preferring the draft (it reflects the latest edits). */
function dedupe(rows: OfferRow[]): OfferRow[] {
  const byBase: Record<string, OfferRow> = {}
  for (const r of rows) {
    const base = r._id.replace(/^drafts\./, '')
    if (!byBase[base] || r._id.startsWith('drafts.')) byBase[base] = { ...r, _id: base }
  }
  return Object.values(byBase)
}

export function ProviderOverview(props: Props) {
  const d      = props.document.displayed || {}
  const client = useClient({ apiVersion: '2024-01-01' })
  const cfg    = client.config() as { projectId?: string; dataset?: string }
  const pid    = cfg.projectId || ''
  const ds     = cfg.dataset || ''
  const provId = String(d._id || '').replace(/^drafts\./, '')

  const [offers, setOffers]     = useState<OfferRow[] | null>(null)
  const [liveIds, setLiveIds]   = useState<Set<string> | null>(null)
  const [partyName, setPartyName] = useState<string | null>(null)

  useEffect(() => {
    if (!provId) { setOffers([]); setLiveIds(new Set()); return }
    client.fetch<OfferRow[]>(
      `*[_type == "offer" && provider._ref == $id] | order(_updatedAt desc) {
        _id, "title": coalesce(title_th, title_en), reviewStatus, "active": status, category,
        "img": coalesce(images[0].asset->url, primaryImage.asset->url)
      }`, { id: provId },
    ).then(r => setOffers(dedupe(r ?? []))).catch(() => setOffers([]))
    // which of this shop's offers are actually rotating on a screen right now
    client.fetch<Array<{ offerId?: string }>>(
      `*[_type == "playlistItem" && media->offer->provider._ref == $id]{ "offerId": media->offer._id }`,
      { id: provId },
    ).then(rows => setLiveIds(new Set((rows ?? []).map(r => String(r.offerId || '').replace(/^drafts\./, '')).filter(Boolean))))
     .catch(() => setLiveIds(new Set()))
  }, [client, provId])

  const partyRef = d.party?._ref
  useEffect(() => {
    if (!partyRef) { setPartyName(null); return }
    client.fetch<{ title?: string }>(
      `*[_id == $id][0]{ "title": coalesce(companyName, firstName, name_th, name, _id) }`, { id: partyRef },
    ).then(r => setPartyName(r?.title || 'Party (CRM)')).catch(() => setPartyName('Party (CRM)'))
  }, [client, partyRef])

  const name  = d.name_th || d.name_en || '(ไม่มีชื่อร้าน)'
  const cover = assetUrl(d.coverImage?.asset?._ref, pid, ds, 1000)
  const logo  = assetUrl(d.logo?.asset?._ref, pid, ds, 160)

  // contact rows — only what the shop actually filled in
  const contacts: Array<[string, string, string?]> = []
  if (d.phone)        contacts.push(['📞 โทร', d.phone, `tel:${String(d.phone).replace(/[^\d+]/g, '')}`])
  if (d.lineId)       contacts.push(['💬 LINE', d.lineId])
  if (d.website)      contacts.push(['🌐 เว็บไซต์', String(d.website).replace(/^https?:\/\//, ''), d.website])
  if (d.locationText) contacts.push(['📍 ที่ตั้ง', d.locationText, d.mapUrl || undefined])
  if (d.openingHours) contacts.push(['🕐 เวลาเปิด', d.openingHours])

  const detailRows: Array<[string, string]> = []
  if (d.slug?.current) detailRows.push(['Slug', d.slug.current])
  if (d.defaultHandoffType) detailRows.push(['Handoff บนจอ', HANDOFF_TH[d.defaultHandoffType] || d.defaultHandoffType])
  if (d.unitRef) detailRows.push(['Unit', String(d.unitRef)])
  if (Array.isArray(d.owners) && d.owners.length) detailRows.push(['เจ้าของบัญชี (แก้ผ่านเว็บได้)', d.owners.join(' · ').slice(0, 90)])
  if (d.submittedBy) detailRows.push(['ส่งล่าสุดโดย', String(d.submittedBy)])

  const liveCount = useMemo(
    () => (offers || []).filter(o => liveIds?.has(o._id)).length,
    [offers, liveIds],
  )

  return (
    <Box padding={4}>
      <Stack space={4} style={{ maxWidth: 720, margin: '0 auto' }}>

        <Card padding={3} radius={3} tone="primary">
          <Text size={1}>👁️ หน้าสรุป (ดูอย่างเดียว) — ต้องการแก้ไข กดแท็บ <b>Edit</b> ด้านบน</Text>
        </Card>

        {/* 1 — identity: cover + logo + name */}
        <Card radius={3} shadow={1} overflow="hidden" tone="transparent">
          {cover ? (
            <img src={cover} alt={name} style={{ display: 'block', width: '100%', height: 180, objectFit: 'cover' }} />
          ) : (
            <Box style={{ height: 90, background: '#12161f' }} />
          )}
          <Flex align="center" gap={3} padding={4} style={{ marginTop: logo ? -44 : 0 }}>
            {logo && <img src={logo} alt="" style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', border: '3px solid var(--card-bg-color, #fff)', background: '#fff', flexShrink: 0 }} />}
            <Box flex={1} style={{ marginTop: logo ? 28 : 0 }}>
              <Heading size={2}>{name}</Heading>
              {d.name_en && d.name_th && d.name_en !== d.name_th && <Text size={1} muted style={{ marginTop: 4 }}>{d.name_en}</Text>}
            </Box>
          </Flex>
          {(d.description_th || d.description_en) && (
            <Box paddingX={4} paddingBottom={4}>
              <Text size={1} muted>{String(d.description_th || d.description_en).slice(0, 200)}</Text>
            </Box>
          )}
        </Card>

        <Flex gap={2} wrap="wrap">
          <Badge tone={d.status === false ? 'critical' : 'positive'} fontSize={1} padding={2}>
            {d.status === false ? '○ ปิดใช้งาน' : '● Active'}
          </Badge>
          {d.providerType && <Badge mode="outline" fontSize={1} padding={2}>{TYPE_TH[d.providerType] || d.providerType}</Badge>}
          {liveCount > 0 && <Badge tone="positive" fontSize={1} padding={2}>📺 ขึ้นจอ {liveCount} โฆษณา</Badge>}
          {d.showcaseWeb && <Badge tone="primary" fontSize={1} padding={2}>🌐 มีหน้าเว็บสาธารณะ{d.slug?.current ? ` — /l/${d.slug.current}` : ''}</Badge>}
          {Array.isArray(d.amenities) && d.amenities.slice(0, 4).map((a: string) => (
            <Badge key={a} mode="outline" fontSize={1} padding={2}>{a}</Badge>
          ))}
        </Flex>

        {/* 2 — contact */}
        {contacts.length > 0 && (
          <Card padding={3} radius={3} shadow={1}>
            <Stack space={3}>
              {contacts.map(([k, v, href]) => (
                <Flex key={k} gap={3} align="center">
                  <Box style={{ width: 110, flexShrink: 0 }}><Text size={1} muted>{k}</Text></Box>
                  <Text size={1} weight="semibold">
                    {href ? <a href={href} target="_blank" rel="noreferrer">{v} ↗</a> : v}
                  </Text>
                </Flex>
              ))}
            </Stack>
          </Card>
        )}

        {/* 3 — the shop's offers */}
        <Stack space={3}>
          <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🎫 โฆษณาของร้านนี้{offers ? ` — ${offers.length} รายการ` : ''}
          </Text>
          {offers === null ? (
            <Flex justify="center" padding={3}><Spinner /></Flex>
          ) : offers.length === 0 ? (
            <Card padding={3} radius={3} tone="caution">
              <Text size={1}>ร้านนี้ยังไม่มีโฆษณา — ยังไม่มีอะไรของร้านแสดงบนจอ</Text>
            </Card>
          ) : (
            offers.map(o => (
              <Card key={o._id} padding={3} radius={3} shadow={1}>
                <Flex align="center" gap={3}>
                  {o.img
                    ? <img src={`${o.img}?w=96&h=96&fit=crop&auto=format`} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                    : <Box style={{ width: 48, height: 48, borderRadius: 8, background: '#12161f', flexShrink: 0 }} />}
                  <Box flex={1}>
                    <Text weight="semibold" size={1}>
                      <IntentLink intent="edit" params={{ id: o._id, type: 'offer' }}>{o.title || '(ไม่มีชื่อ)'}</IntentLink>
                    </Text>
                    <Text size={1} muted style={{ marginTop: 3 }}>{o.category || ''}</Text>
                  </Box>
                  <Flex gap={2} align="center">
                    {liveIds?.has(o._id) && <Badge tone="positive" fontSize={0}>📺 ขึ้นจอ</Badge>}
                    <Badge fontSize={0} tone={o.reviewStatus === 'approved' ? 'positive' : o.reviewStatus === 'rejected' ? 'critical' : 'caution'}>
                      {o.reviewStatus === 'approved' ? 'ผ่านรีวิว' : o.reviewStatus === 'rejected' ? 'ไม่ผ่าน' : 'รอรีวิว'}
                    </Badge>
                    {o.active === false && <Badge fontSize={0} tone="critical" mode="outline">ปิด</Badge>}
                  </Flex>
                </Flex>
              </Card>
            ))
          )}
        </Stack>

        {/* 4 — plumbing */}
        {(partyRef || detailRows.length > 0) && (
          <Card padding={3} radius={3} tone="transparent" border>
            <Stack space={3}>
              {partyRef && (
                <Flex gap={3}>
                  <Box style={{ width: 130, flexShrink: 0 }}><Text size={1} muted>CRM (Party)</Text></Box>
                  <Text size={1}>
                    <IntentLink intent="edit" params={{ id: partyRef, type: 'party' }}>{partyName || '…'}</IntentLink>
                  </Text>
                </Flex>
              )}
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
