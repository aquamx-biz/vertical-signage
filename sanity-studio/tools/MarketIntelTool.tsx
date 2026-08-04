import React, {useState} from 'react'
import {Box, Button, Card, Flex} from '@sanity/ui'
import {UnitBoardsTool} from './UnitBoardsTool'
import {BuildingsAnalysisTool} from './BuildingsAnalysisTool'

/**
 * Market Intel — แท็บกลุ่มของเครื่องมือข้อมูลตลาด (ชื่อจับคู่กับกลุ่มเอกสาร
 * "📊 Market Intelligence" ในเมนูซ้าย): Unit Boards (คัดห้องขึ้นบอร์ด — ค่าแรก)
 * + Building Analysis (วิเคราะห์รายตึกตามรอบ)
 * ทั้งสอง sub-tab ค้าง mount ไว้ — สลับไปมาไม่เสีย selection/ตำแหน่ง scroll
 */
const TABS = [
  {key: 'analysis', title: 'Building Analysis', comp: BuildingsAnalysisTool},
  {key: 'boards', title: 'Unit Boards', comp: UnitBoardsTool},
] as const

export function MarketIntelTool() {
  const [tab, setTab] = useState<string>('analysis')
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
