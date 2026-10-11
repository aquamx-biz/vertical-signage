import React, {useState} from 'react'
import {Box, Button, Card, Flex} from '@sanity/ui'
import {UnitBoardsTool} from './UnitBoardsTool'
import {BuildingsAnalysisTool} from './BuildingsAnalysisTool'

/**
 * Market Intel — แท็บกลุ่มของเครื่องมือข้อมูลตลาด (ชื่อจับคู่กับกลุ่มเอกสาร
 * "📊 Market Intelligence" ในเมนูซ้าย): Building Analysis (วิเคราะห์รายตึกตามรอบ — ค่าแรก)
 * + Board Lineup (ห้องบนจอ: โหมดบอร์ด + สถานะดีล) + All Units (ตารางคัดห้องขึ้นบอร์ด)
 * ทุก sub-tab ค้าง mount ไว้ — สลับไปมาไม่เสีย selection/ตำแหน่ง scroll
 * Board Lineup กับ All Units คือ UnitBoardsTool ตัวเดียวกัน (ติ๊ก/โหมด/Save ร่วมกัน)
 * แค่สลับ view — อย่าแยกเป็นสอง instance ไม่งั้นติ๊กในตารางแล้วอีกแท็บไม่เห็น
 */
const TABS = [
  {key: 'analysis', title: 'Building Analysis'},
  {key: 'lineup', title: 'Board Lineup · ห้องบนจอ'},
  {key: 'units', title: 'All Units · ห้องทั้งหมด'},
] as const

export function MarketIntelTool() {
  const [tab, setTab] = useState<string>('analysis')
  // ดูคำอธิบายใน ContentTool — hidden ตัดเนื้อหาของเครื่องมือที่ไม่มีตัวเลื่อนของตัวเอง
  const pane = (show: boolean): React.CSSProperties => ({flex: 1, minHeight: 0, overflow: 'auto', display: show ? 'block' : 'none'})
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
      <Box style={pane(tab === 'analysis')}><BuildingsAnalysisTool /></Box>
      <Box style={pane(tab === 'lineup' || tab === 'units')}>
        <UnitBoardsTool view={tab === 'lineup' ? 'lineup' : 'units'} onGoUnits={() => setTab('units')} />
      </Box>
    </Flex>
  )
}
