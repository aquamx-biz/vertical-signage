/**
 * RatecardLiveNote
 *
 * A read-only info banner shown at the top of the Rate Card form so editors
 * know exactly which public page this content drives — and that they must
 * Publish for changes to go live. The URL is hardcoded on purpose: there is
 * one fixed pricing page, so this is infrastructure, not editable content.
 *
 * Rendered as a `field` component, so it replaces the whole field row
 * (no default label / input) — we ignore props.children entirely.
 */

import { Card, Stack, Text, Flex } from '@sanity/ui'
import type { FieldProps } from 'sanity'

const LIVE_URL = 'https://aquamx.biz/ratecard-sme/'

export function RatecardLiveNote(_props: FieldProps) {
  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Stack space={3}>
        <Flex align="center" gap={2}>
          <Text size={1}>🔗</Text>
          <Text size={1} weight="semibold">หน้านี้แสดงผลบนเว็บไซต์</Text>
        </Flex>
        <Text size={1}>
          <a
            href={LIVE_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--card-link-color, #2276fc)', fontWeight: 600 }}
          >
            {LIVE_URL}
          </a>
        </Text>
        <Text size={0} muted>
          แก้ข้อมูลแล้วกด <b>Publish</b> — เว็บจะอัปเดตเองภายใน ~1 นาที
        </Text>
      </Stack>
    </Card>
  )
}
