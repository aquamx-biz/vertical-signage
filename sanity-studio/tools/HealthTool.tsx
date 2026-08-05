import React, {useState} from 'react'
import {Box, Button, Card, Flex} from '@sanity/ui'
import {ScreenHealthTool} from './ScreenHealthTool'
import {KioskHealthTool} from './KioskHealthTool'

/**
 * Health — แท็บกลุ่มงานเฝ้าระบบ: Screen Health (สถานะจอ/คอนเทนต์)
 * + Fleet Health (สุขภาพกล่อง kiosk) — โครงเดียวกับ MarketIntelTool:
 * sub-tab ค้าง mount สลับไปมาไม่เสียสถานะ
 */
const TABS = [
  {key: 'screen', title: 'Screen Health', comp: ScreenHealthTool},
  {key: 'fleet', title: 'Fleet Health', comp: KioskHealthTool},
] as const

export function HealthTool() {
  const [tab, setTab] = useState<string>('screen')
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
