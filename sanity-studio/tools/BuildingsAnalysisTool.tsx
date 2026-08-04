import React, {useEffect, useState} from 'react'
import {Card, Flex, Select, Text} from '@sanity/ui'

/**
 * Building Analysis · วิเคราะห์ตลาดรายตึก — per-round snapshots with a
 * version picker. Each scrape round's dashboard is archived as
 * static/analysis/<YYYY-MM-DD>.html and listed in static/analysis/manifest.json
 * (newest round = default view). To add a round: drop the file in, append the
 * date to manifest.json, `sanity deploy`.
 */
export function BuildingsAnalysisTool() {
  const [rounds, setRounds] = useState<string[]>([])
  const [round, setRound] = useState<string>('')

  useEffect(() => {
    // no-store: รอบใหม่จากวงจรรายสัปดาห์ต้องโผล่ทันที ไม่ติดแคช CDN/เบราว์เซอร์
    fetch(`/static/analysis/manifest.json?t=${Date.now()}`, {cache: 'no-store'})
      .then(r => r.json())
      .then((m: {rounds: string[]}) => {
        const sorted = [...(m.rounds ?? [])].sort().reverse()
        setRounds(sorted)
        setRound(sorted[0] ?? '')
      })
      .catch(() => setRounds([]))
  }, [])

  return (
    <Flex direction="column" style={{height: 'calc(100vh - 50px)'}}>
      <Card padding={2} borderBottom tone="transparent">
        <Flex align="center" gap={3}>
          <Text size={1} weight="semibold">Round · รอบข้อมูล</Text>
          <Select
            value={round}
            onChange={e => setRound(e.currentTarget.value)}
            fontSize={1}
            padding={2}
          >
            {rounds.map((r, i) => (
              <option key={r} value={r}>{r}{i === 0 ? ' (ล่าสุด)' : ''}</option>
            ))}
          </Select>
          <Text size={1} muted>{rounds.length} รอบ</Text>
        </Flex>
      </Card>
      {round && (
        <iframe
          key={round}
          src={`/static/analysis/${round}.html`}
          title={`Building Analysis ${round}`}
          style={{flex: 1, width: '100%', border: 0, display: 'block'}}
        />
      )}
    </Flex>
  )
}
