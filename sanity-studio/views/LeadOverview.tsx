import { Card, Stack, Text, Flex, Badge, Box, Heading } from '@sanity/ui'
import { IntentLink }                                   from 'sanity/router'

interface Props {
  document: {
    displayed: Record<string, any>
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:       { label: '🆕 New',       color: '#3B82F6' },
  contacted: { label: '📞 Contacted', color: '#F97316' },
  qualified: { label: '✅ Qualified', color: '#8B5CF6' },
  won:       { label: '🏆 Won',       color: '#22C55E' },
  lost:      { label: '❌ Lost',      color: '#EF4444' },
}

const PIPELINE_STEPS = ['new', 'contacted', 'qualified']

const VIEWING_STATUS: Record<string, { label: string; color: string }> = {
  new:       { label: 'Requested', color: '#3B82F6' },
  contacted: { label: 'Contacted', color: '#F97316' },
  qualified: { label: 'Confirmed', color: '#8B5CF6' },
  won:       { label: 'Won',       color: '#22C55E' },
  lost:      { label: 'Not taken', color: '#EF4444' },
  cancelled: { label: 'Cancelled', color: '#9CA3AF' },
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <Flex justify="space-between" gap={3} style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 6 }}>
      <Text size={0} muted style={{ flexShrink: 0, minWidth: 130 }}>{label}</Text>
      <Text size={0} style={{ textAlign: 'right' }}>{value}</Text>
    </Flex>
  )
}

export function LeadOverview({ document: { displayed: doc } }: Props) {
  if (!doc._type) {
    return (
      <Card padding={6} height="fill" tone="transparent">
        <Flex align="center" justify="center" height="fill">
          <Text muted>Loading…</Text>
        </Flex>
      </Card>
    )
  }

  const status     = doc.status ?? 'new'
  const statusCfg  = STATUS_CONFIG[status] ?? STATUS_CONFIG.new
  const isTerminal = status === 'won' || status === 'lost'
  const activeIdx  = PIPELINE_STEPS.indexOf(status)

  const DOT_SIZE   = 14
  const totalSlots = PIPELINE_STEPS.length
  const slotPct    = 100 / totalSlots
  const fillFraction = activeIdx <= 0 ? 0 : activeIdx / (totalSlots - 1)

  const partyRef = doc.party?._ref

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        {/* Header */}
        <Stack space={3}>
          <Flex gap={2} wrap="wrap">
            <Badge tone="primary" mode="outline" fontSize={0}>Lead</Badge>
            {doc.source && <Badge tone="default" mode="outline" fontSize={0}>{doc.source}</Badge>}
            <Badge tone="caution" mode="outline" fontSize={0}>Read-only — click Edit tab to make changes</Badge>
          </Flex>
          <Heading size={3}>{doc.contactName ?? '(No name)'}</Heading>
        </Stack>

        {/* Status */}
        <Box padding={4} style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <Stack space={4}>
            <Flex align="center" justify="space-between">
              <Text size={1} weight="semibold" style={{ color: '#374151' }}>Lead Status</Text>
              <Box
                padding={2}
                style={{
                  background:   statusCfg.color + '1A',
                  border:       `1px solid ${statusCfg.color}40`,
                  borderRadius: 6,
                }}
              >
                <Text size={1} weight="semibold" style={{ color: statusCfg.color }}>{statusCfg.label}</Text>
              </Box>
            </Flex>

            {/* Pipeline progress — only shown while not terminal */}
            {!isTerminal && (
              <Box style={{ position: 'relative', paddingTop: 4, paddingBottom: 4 }}>
                <Box style={{
                  position: 'absolute', top: DOT_SIZE / 2,
                  left: `${slotPct / 2}%`, right: `${slotPct / 2}%`,
                  height: 2, background: '#E5E7EB', zIndex: 0,
                }} />
                <Box style={{
                  position: 'absolute', top: DOT_SIZE / 2,
                  left: `${slotPct / 2}%`,
                  width: `calc((100% - ${slotPct}%) * ${fillFraction})`,
                  height: 2, background: '#6B7280', zIndex: 0, transition: 'width 0.3s',
                }} />
                <Flex justify="space-between" style={{ position: 'relative', zIndex: 1 }}>
                  {PIPELINE_STEPS.map((step, i) => {
                    const cfg      = STATUS_CONFIG[step]
                    const isDone   = i < activeIdx
                    const isCurrent = i === activeIdx
                    const dotColor = isDone ? '#6B7280' : isCurrent ? cfg.color : '#FFFFFF'
                    const border   = isDone ? '#6B7280' : isCurrent ? cfg.color : '#D1D5DB'
                    return (
                      <Flex key={step} direction="column" align="center" gap={2} style={{ flex: 1 }}>
                        <Box style={{
                          width: DOT_SIZE, height: DOT_SIZE, borderRadius: '50%',
                          background: dotColor, border: `2px solid ${border}`,
                          boxShadow: isCurrent ? `0 0 0 4px ${cfg.color}30` : undefined,
                          flexShrink: 0, transition: 'all 0.2s',
                        }} />
                        <Text size={0}
                          weight={isCurrent ? 'semibold' : 'regular'}
                          style={{ color: isCurrent ? '#111827' : isDone ? '#6B7280' : '#9CA3AF', textAlign: 'center' }}
                        >
                          {cfg.label.replace(/^\S+\s/, '')}
                        </Text>
                      </Flex>
                    )
                  })}
                </Flex>
              </Box>
            )}

            {isTerminal && (
              <Text size={1} style={{ color: statusCfg.color }}>
                {status === 'won' ? 'Lead successfully converted.' : 'Lead marked as lost.'}
              </Text>
            )}
          </Stack>
        </Box>

        {/* Contact info */}
        <Card padding={3} border radius={2}>
          <Stack space={3}>
            <Text size={0} weight="semibold" style={{ color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Contact Information
            </Text>
            <Stack space={2}>
              <InfoRow label="Name"             value={doc.contactName}    />
              <InfoRow label="Phone"            value={doc.contactPhone}   />
              <InfoRow label="Email"            value={doc.contactEmail}   />
              <InfoRow label="LINE ID"          value={doc.contactLineId}  />
              <InfoRow label="Unit / Interest"  value={doc.unitInterest}   />
              <InfoRow label="Preferred Time"   value={doc.preferredTime}  />
              <InfoRow label="Budget"           value={doc.budget ? doc.budget.toLocaleString('th-TH') + ' THB' : null} />
              <InfoRow label="Interest Type"    value={doc.interestType === 'rent' ? '📺 Signage Rental' : doc.interestType === 'sale' ? '🏠 Property Sale' : null} />
              <InfoRow label="Assigned To"      value={doc.assignedTo}     />
              <InfoRow label="Follow-up Date"   value={fmtDate(doc.followUpDate)} />
              <InfoRow label="Firestore Lead ID" value={doc.firestoreLeadId} />
            </Stack>
          </Stack>
        </Card>

        {/* Rooms & viewings — one row per room this person asked to see */}
        {Array.isArray(doc.viewings) && doc.viewings.length > 0 && (
          <Card padding={3} border radius={2}>
            <Stack space={3}>
              <Text size={0} weight="semibold" style={{ color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Rooms & Viewings ({doc.viewings.length})
              </Text>
              <Stack space={2}>
                {doc.viewings.map((v: Record<string, any>) => {
                  const cfg = VIEWING_STATUS[v.status ?? 'new'] ?? VIEWING_STATUS.new
                  const when = [v.appointment?.requestedDate, v.appointment?.requestedTime].filter(Boolean).join(' ')
                  return (
                    <Flex key={v._key} justify="space-between" align="center" gap={3}
                          style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 6 }}>
                      <Stack space={1}>
                        <Text size={1} weight="semibold">{[v.unitRef, v.unitLabel].filter(Boolean).join(' · ') || v.project || 'Room'}</Text>
                        <Text size={0} muted>{[v.project, when, v.bookingRef].filter(Boolean).join(' · ') || '—'}</Text>
                      </Stack>
                      <Badge style={{ background: cfg.color, color: '#fff', flexShrink: 0 }}>{cfg.label}</Badge>
                    </Flex>
                  )
                })}
              </Stack>
            </Stack>
          </Card>
        )}

        {/* Linked party */}
        <Stack space={2}>
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>Linked Party</Text>
          {partyRef ? (
            <IntentLink intent="edit" params={{ id: partyRef, type: 'party' }} style={{ textDecoration: 'none' }}>
              <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
                <Flex align="center" justify="space-between">
                  <Text size={1} weight="semibold">{doc.party?.legalName_th ?? doc.party?.legalName ?? doc.party?.firstName ?? 'View Party Record'}</Text>
                  <Text size={0} muted>→ Open</Text>
                </Flex>
              </Card>
            </IntentLink>
          ) : (
            <Card padding={3} border radius={2} tone="transparent">
              <Text size={1} muted>No party linked yet. Create a Party record and link it once the contact is qualified.</Text>
            </Card>
          )}
        </Stack>

        {/* Notes */}
        {doc.notes && (
          <Card padding={3} border radius={2} tone="transparent">
            <Stack space={2}>
              <Text size={0} weight="semibold" muted>Notes</Text>
              <Text size={1}>{doc.notes}</Text>
            </Stack>
          </Card>
        )}

      </Stack>
    </Card>
  )
}
