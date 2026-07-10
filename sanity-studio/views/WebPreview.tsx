/**
 * WebPreview — embeds the REAL customer-facing handoff page (app.aquamx.biz/m/…)
 * inside Studio, framed like a phone.
 *
 * Deliberately an iframe, not a re-implementation: when the web app's code
 * changes, this preview updates by itself — the two can never drift apart.
 * (Requires the handoff site to allow framing: CSP frame-ancestors includes
 * the Studio origin in aquamx-handoff/netlify.toml.)
 *
 * Note: the live page renders PUBLISHED data — unpublished drafts won't show
 * here. That's the point (this is what customers actually see), and the label
 * says so.
 */
import React from 'react'
import { Badge, Box, Card, Flex, Stack, Text } from '@sanity/ui'

const HANDOFF_BASE = 'https://app.aquamx.biz/m'

export function PhonePreview({ url }: { url: string }) {
  return (
    <Stack space={3}>
      <Flex align="center" justify="space-between">
        <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          📱 หน้าจริงที่ลูกค้าเห็น (หลังสแกน QR)
        </Text>
        <Text size={1}><a href={url} target="_blank" rel="noreferrer">เปิดในแท็บใหม่ ↗</a></Text>
      </Flex>
      <Flex justify="center">
        <Box
          style={{
            width: 390, maxWidth: '100%', height: 720,
            border: '10px solid #12161f', borderRadius: 36,
            overflow: 'hidden', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.45)',
            background: '#fff', flexShrink: 0,
          }}
        >
          <iframe
            key={url}
            src={url}
            title="Customer page preview"
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          />
        </Box>
      </Flex>
      <Flex justify="center">
        <Badge mode="outline" fontSize={0} padding={2}>แสดงข้อมูลที่ Publish แล้วเท่านั้น — draft ที่ยังไม่ publish จะยังไม่เห็นในนี้</Badge>
      </Flex>
    </Stack>
  )
}

export function providerPreviewUrl(slug?: string | null) { return slug ? `${HANDOFF_BASE}/p/${slug}` : null }
export function offerPreviewUrl(slug?: string | null)    { return slug ? `${HANDOFF_BASE}/o/${slug}` : null }

export function NoSlugCard({ what }: { what: string }) {
  return (
    <Card padding={3} radius={3} tone="caution">
      <Text size={1}>ยังไม่มี slug — ตั้ง slug ในแท็บ Edit ก่อน จึงจะแสดงตัวอย่างหน้า{what}ได้</Text>
    </Card>
  )
}

/* Full-pane document view: the offer's customer page as its own Studio tab */
interface DocProps { document: { displayed: Record<string, any> } }
export function OfferWebPreview(props: DocProps) {
  const slug = props.document.displayed?.slug?.current
  const url = offerPreviewUrl(slug)
  return (
    <Box padding={4}>
      <Stack space={4} style={{ maxWidth: 720, margin: '0 auto' }}>
        {url ? <PhonePreview url={url} /> : <NoSlugCard what="ลูกค้าของโฆษณานี้" />}
      </Stack>
    </Box>
  )
}
