import React, {useState} from 'react'
import {Box, Button, Card, Flex} from '@sanity/ui'
import {PendingChangesTool} from './PendingChangesTool'
import {ContentFootprintTool} from './ContentFootprintTool'

/**
 * Content — แท็บกลุ่มงานคอนเทนต์: Pending Publish (รอปล่อยขึ้นจอ — ค่าแรก
 * เพราะเป็นประตู publish ที่ใช้บ่อยสุด) + Content Footprint (คอนเทนต์ที่ครองจออยู่)
 * โครงเดียวกับ MarketIntelTool/HealthTool: sub-tab ค้าง mount สลับไปมาไม่เสียสถานะ
 */
const TABS = [
  {key: 'pending', title: 'Pending Publish', comp: PendingChangesTool},
  {key: 'footprint', title: 'Content Footprint', comp: ContentFootprintTool},
] as const

export function ContentTool() {
  const [tab, setTab] = useState<string>('pending')
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
        <Box key={t.key} style={{flex: 1, minHeight: 0, overflow: 'hidden', display: tab === t.key ? 'block' : 'none'}}>
          <t.comp />
        </Box>
      ))}
    </Flex>
  )
}
