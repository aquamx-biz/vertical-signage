import { useRef, useEffect } from 'react'
import { set, unset } from 'sanity'
import { Card, Flex, Text, Box, Stack } from '@sanity/ui'

const LABELS: Record<string, string> = {
  project:           '📁 Projects',
  playlist:          '🎬 Playlist',
  media:             '🖼  Media Library',
  offer:             '🛍  Offers',
  provider:          '🏪 Providers',
  categoryConfig:    '⚙️  Global Category Config',
  party:             '👥 Parties',
  lead:              '🎯 Leads',
  saleOpportunity:   '💼 Sale Opportunities',
  emailCampaign:     '📧 Email Campaigns',
  projectSite:       '📍 Project Sites',
  contract:          '📄 Rent Space (Contracts)',
  serviceContract:   '📑 Service Contracts',
  installation:      '🔧 Install & Activate',
  payment:           '💳 Payments',
  procurement:       '📦 Procurements',
  order:             '🛒 Orders',
  discountCode:      '🎟 Discount Codes',
  receipt:           '🧾 Receipts',
  funding:           '💰 Funding',
  journalEntry:      '📒 Journal Entries',
  asset:             '🏷  Assets',
  assetRegister:     '📋 Asset Register',
  ledger:            '📊 General Ledger',
  financialStatement:'📈 Financial Statements',
  approvalRequest:   '✅ Approval Requests',
  approvalRule:      '📏 Approval Rules',
  approvalPosition:  '👤 Approver Positions',
  contractType:      '📋 Process Setup',
}

const GROUPS = [
  { id: 'digital-signage', label: 'Digital Signage', icon: '🖥',  schemas: ['project', 'playlist', 'media', 'offer', 'provider', 'categoryConfig', 'discountCode'] },
  { id: 'crm',             label: 'CRM',             icon: '👥',  schemas: ['party', 'lead', 'saleOpportunity', 'emailCampaign'] },
  { id: 'projects',        label: 'Projects',        icon: '🏗',  schemas: ['projectSite', 'contract', 'serviceContract', 'installation'] },
  { id: 'finance',         label: 'Finance',         icon: '💰',  schemas: ['payment', 'procurement', 'order', 'receipt', 'funding', 'journalEntry', 'asset', 'assetRegister', 'ledger', 'financialStatement'] },
  { id: 'approvals',       label: 'Approvals',       icon: '✅',  schemas: ['approvalRequest', 'approvalRule', 'approvalPosition'] },
  { id: 'operations',      label: 'Operations',      icon: '⚙️', schemas: ['contractType'] },
]

function MasterCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      onChange={onChange}
      style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
    />
  )
}

export function AllowedSchemasInput(props: any) {
  const { value, onChange, readOnly } = props
  const selected = new Set<string>(value ?? [])

  const emit = (next: Set<string>) => {
    const arr = [...next]
    onChange(arr.length > 0 ? set(arr) : unset())
  }

  const toggleItem = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    emit(next)
  }

  const toggleGroup = (schemas: string[]) => {
    const allOn = schemas.every(s => selected.has(s))
    const next  = new Set(selected)
    if (allOn) {
      schemas.forEach(s => next.delete(s))
    } else {
      schemas.forEach(s => next.add(s))
    }
    emit(next)
  }

  return (
    <Stack space={2}>
      {GROUPS.map(group => {
        const onCount = group.schemas.filter(s => selected.has(s)).length
        const allOn   = onCount === group.schemas.length
        const someOn  = onCount > 0 && !allOn

        return (
          <Card key={group.id} border radius={2} padding={3} tone={onCount > 0 ? 'positive' : 'default'}>
            {/* Group header */}
            <Flex align="center" gap={2} style={{ marginBottom: onCount > 0 ? 10 : 0 }}>
              <MasterCheckbox
                checked={allOn}
                indeterminate={someOn}
                onChange={() => !readOnly && toggleGroup(group.schemas)}
              />
              <Text size={1} weight="semibold">
                {group.icon}&nbsp;&nbsp;{group.label}
              </Text>
              <Box style={{ marginLeft: 'auto' }}>
                <Text size={0} muted>{onCount}/{group.schemas.length}</Text>
              </Box>
            </Flex>

            {/* Children — always rendered so layout doesn't jump */}
            <Stack space={2} style={{ paddingLeft: 22 }}>
              {group.schemas.map(id => (
                <Flex key={id} as="label" align="center" gap={2}
                  style={{ cursor: readOnly ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => !readOnly && toggleItem(id)}
                    style={{ width: 13, height: 13, cursor: readOnly ? 'default' : 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, lineHeight: '1.4', userSelect: 'none' }}>
                    {LABELS[id] ?? id}
                  </span>
                </Flex>
              ))}
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}
