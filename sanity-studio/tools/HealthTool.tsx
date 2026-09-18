import React, {useState} from 'react'
import {Box, Button, Card, Flex} from '@sanity/ui'
import {KioskHealthTool} from './KioskHealthTool'
import {UsageTool} from './UsageTool'

/**
 * จอ — everything about the screens in one place, two pages:
 *   สถานะ    — is each box up, what it runs, how healthy (beacon + adb)
 *   การใช้งาน — what people do on the screens (taps, scans, funnel)
 * The old "Screen Health" page (Yodeck alert e-mails) is gone: Yodeck is parked
 * on every box since 2026-09-12 and outages are now LINE cards from
 * fleet-health. Sub-tabs stay mounted so switching keeps their state.
 */
const TABS = [
  {key: 'fleet', title: 'Fleet Status', comp: KioskHealthTool},
  {key: 'usage', title: 'Usage', comp: UsageTool},
] as const

export function HealthTool() {
  const [tab, setTab] = useState<string>('fleet')
  return (
    <Flex direction="column" style={{height: '100%'}}>
      <Card padding={2} borderBottom tone="transparent">
        <Flex gap={2}>
          {TABS.map(t => (
            <Button key={t.key} text={t.title} fontSize={1} padding={2}
              mode={tab === t.key ? 'default' : 'ghost'}
              tone={tab === t.key ? 'primary' : 'default'}
              onClick={() => setTab(t.key)} />
          ))}
        </Flex>
      </Card>
      {TABS.map(t => (
        // ดูคำอธิบายใน ContentTool — hidden ตัดเนื้อหาของเครื่องมือที่ไม่มีตัวเลื่อนของตัวเอง
        <Box key={t.key} style={{flex: 1, minHeight: 0, overflow: 'auto', display: tab === t.key ? 'block' : 'none'}}>
          <t.comp />
        </Box>
      ))}
    </Flex>
  )
}
