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
        // overflow:auto ไม่ใช่ hidden — เครื่องมือที่เป็นเอกสารยาว (Pending Publish,
        // Content Footprint) ไม่มีตัวเลื่อนของตัวเอง สมัยยังไม่จับมารวมแท็บมันเลื่อนทั้งหน้า
        // พอมาอยู่ในกล่อง flex ที่ hidden รายการที่เกินจอถูกตัดหายโดยไม่มีแถบเลื่อน
        // ส่วนเครื่องมือที่จัดการ scroll เอง (Unit Boards) สูง 100% พอดีกล่อง ไม่มีแถบซ้อน
        <Box key={t.key} style={{flex: 1, minHeight: 0, overflow: 'auto', display: tab === t.key ? 'block' : 'none'}}>
          <t.comp />
        </Box>
      ))}
    </Flex>
  )
}
