import { useEffect, useState } from 'react'
import { Card, Stack, Text, Flex, Badge, Box, Heading, Spinner } from '@sanity/ui'
import { IntentLink } from 'sanity/router'
import { useClient   } from 'sanity'

interface Props {
  document: {
    displayed: Record<string, any>
  }
}

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  juristicPerson:  { label: '🏛️ Juristic Person',   color: '#6366F1' },
  propertyOwner:   { label: '🏠 Property Owner',    color: '#3B82F6' },
  advertiser:      { label: '📢 Advertiser',         color: '#EC4899' },
  agent:           { label: '🤝 Agent / Broker',    color: '#22C55E' },
  developer:       { label: '🏗️ Developer',          color: '#F59E0B' },
  tenant:          { label: '🏡 Tenant / Buyer',    color: '#14B8A6' },
  vendor:          { label: '📦 Vendor',             color: '#F97316' },
  serviceProvider: { label: '🔧 Service Provider',  color: '#8B5CF6' },
  appVendor:       { label: '💻 App Vendor',         color: '#10B981' },
  // legacy
  landlord:        { label: '🏢 Landlord (legacy)', color: '#9CA3AF' },
  customer:        { label: '👤 Customer (legacy)', color: '#9CA3AF' },
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <Flex justify="space-between" gap={3} style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 6 }}>
      <Text size={0} muted style={{ flexShrink: 0, minWidth: 120 }}>{label}</Text>
      <Text size={0} style={{ textAlign: 'right' }}>{value}</Text>
    </Flex>
  )
}

function SectionCard({ title, color, rows }: {
  title: string
  color: string
  rows:  { label: string; value: string | null | undefined }[]
}) {
  const visible = rows.filter(r => r.value)
  if (visible.length === 0) return null
  return (
    <Card padding={3} border radius={2}>
      <Stack space={3}>
        <Text size={0} weight="semibold" style={{ color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </Text>
        <Stack space={2}>
          {visible.map(r => <InfoRow key={r.label} label={r.label} value={r.value} />)}
        </Stack>
      </Stack>
    </Card>
  )
}

function fmtDate(iso: string | undefined | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function StatusPill({ label, color, count }: { label: string; color: string; count?: number }) {
  return (
    <Box
      padding={2}
      style={{
        background:   color + '1A',
        border:       `1px solid ${color}40`,
        borderRadius: 6,
        whiteSpace:   'nowrap',
      }}
    >
      <Text size={0} weight="semibold" style={{ color }}>
        {count !== undefined ? `${count} × ` : ''}{label}
      </Text>
    </Box>
  )
}

// ── Linked Project Sites ──────────────────────────────────────────────────────

// ── Pipeline status bar ───────────────────────────────────────────────────────

const SITE_PIPELINE_STEPS: { key: string; label: string }[] = [
  { key: 'site_created', label: 'Created'      },
  { key: 'site_review',  label: 'Under Review' },
  { key: 'approved',     label: 'Site Approved'},
]

// Any stage beyond "approved" means the site is approved — cap it there
const SITE_BEYOND_APPROVED = new Set([
  'quotation_pending', 'quotation_approved',
  'contract_pending',  'contract_approved',
  'active',
])

const CONTRACT_PIPELINE_STEPS: { key: string; label: string }[] = [
  { key: 'draft',                label: 'Draft'              },
  { key: 'quotation_pending',    label: 'Quotation Pending'  },
  { key: 'quotation_approved',   label: 'Quotation Approved' },
  { key: 'contract_pending',     label: 'Contract Pending'   },
  { key: 'contract_approved',    label: 'Contract Approved'  },
  { key: 'signed',               label: 'Signed'             },
]

function PipelineStatusBar({
  steps,
  currentKey,
  updatedAt,
  terminated,
}: {
  steps:       { key: string; label: string }[]
  currentKey:  string
  updatedAt?:  string | null
  terminated?: boolean
}) {
  const currentIdx = steps.findIndex(s => s.key === currentKey)
  // Only show steps up to and including the current one
  const visibleSteps = currentIdx >= 0 ? steps.slice(0, currentIdx + 1) : steps

  return (
    <Box style={{ paddingTop: 4 }}>
      {/* Step track */}
      <Flex align="center" style={{ overflowX: 'auto', paddingBottom: 6 }}>
        {visibleSteps.map((step, idx) => {
          const isCurrent = idx === visibleSteps.length - 1
          const isDone    = !isCurrent
          const dotColor  = terminated ? '#EF4444'
            : isDone    ? '#22C55E'
            : isCurrent ? '#3B82F6'
            : '#D1D5DB'
          const lineColor = isDone ? '#22C55E' : '#E5E7EB'

          return (
            <Flex key={step.key} align="center" style={{ flexShrink: 0 }}>
              {/* connector line (before each step except first) */}
              {idx > 0 && (
                <Box style={{ width: 20, height: 2, background: lineColor, flexShrink: 0 }} />
              )}
              {/* dot + label */}
              <Flex direction="column" align="center" style={{ gap: 3, minWidth: 56 }}>
                <Box style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: dotColor,
                  border: isCurrent ? `2px solid ${dotColor}` : '2px solid transparent',
                  boxShadow: isCurrent ? `0 0 0 3px ${dotColor}33` : 'none',
                  flexShrink: 0,
                }} />
                <Text
                  size={0}
                  style={{
                    color: isCurrent ? dotColor : isDone ? '#6B7280' : '#9CA3AF',
                    fontWeight: isCurrent ? 600 : 400,
                    textAlign: 'center',
                    lineHeight: '1.2',
                    maxWidth: 56,
                    wordBreak: 'break-word',
                  }}
                >
                  {step.label}
                </Text>
              </Flex>
            </Flex>
          )
        })}
      </Flex>

      {/* Date */}
      {updatedAt && (
        <Text size={0} muted style={{ paddingTop: 2 }}>
          {new Date(updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      )}

      {/* Terminated badge */}
      {terminated && (
        <Box padding={1} style={{ display: 'inline-block', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 4, marginTop: 4 }}>
          <Text size={0} style={{ color: '#EF4444', fontWeight: 600 }}>🔴 Terminated</Text>
        </Box>
      )}
    </Box>
  )
}

// ── Linked Project Sites ──────────────────────────────────────────────────────

interface ProjectSiteSummary {
  _id:            string
  projectEn?:     string
  projectTh?:     string
  address?:       string
  pipelineStage?: string
  _updatedAt?:    string
}

const PIPELINE_LABEL: Record<string, { label: string; color: string }> = {
  site_created:       { label: '📝 Site Created',       color: '#6B7280' },
  site_review:        { label: '🔵 Under Review',       color: '#3B82F6' },
  approved:           { label: '✅ Approved',            color: '#22C55E' },
  quotation_pending:  { label: '⏳ Quotation Pending',   color: '#F97316' },
  quotation_approved: { label: '🟢 Quotation Approved', color: '#22C55E' },
  contract_pending:   { label: '⏳ Contract Pending',    color: '#F97316' },
  contract_approved:  { label: '🟠 Contract Approved',  color: '#F97316' },
  active:             { label: '✅ Active',              color: '#22C55E' },
  terminated:         { label: '🔴 Terminated',          color: '#EF4444' },
}

function LinkedProjectSites({ siteRefs, legacyRef }: { siteRefs?: { _ref: string }[]; legacyRef?: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [sites, setSites] = useState<ProjectSiteSummary[] | null>(null)

  const ids = [
    ...(siteRefs ?? []).map(s => s._ref),
    ...(legacyRef && !(siteRefs ?? []).length ? [legacyRef] : []),
  ].filter(Boolean)

  useEffect(() => {
    if (!ids.length) { setSites([]); return }
    client
      .fetch<ProjectSiteSummary[]>(
        `*[_id in $ids]{ _id, projectEn, projectTh, address, pipelineStage, _updatedAt }`,
        { ids },
      )
      .then(r => setSites(r ?? []))
      .catch(() => setSites([]))
  }, [ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (sites === null) return <Flex gap={2} align="center"><Spinner muted /><Text size={1} muted>Loading…</Text></Flex>
  if (!sites.length)  return <Card padding={3} border radius={2} tone="transparent"><Text size={1} muted>No project sites linked.</Text></Card>

  // Summary: count by pipeline stage
  const stageCounts = new Map<string, number>()
  for (const s of sites) {
    const key = s.pipelineStage ?? 'site_created'
    stageCounts.set(key, (stageCounts.get(key) ?? 0) + 1)
  }

  return (
    <Stack space={3}>
      {/* Status summary bar */}
      <Card padding={3} radius={2} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
        <Flex gap={2} wrap="wrap" align="center">
          <Text size={0} muted style={{ marginRight: 4 }}>Summary:</Text>
          {Array.from(stageCounts.entries()).map(([stage, count]) => {
            const cfg = PIPELINE_LABEL[stage] ?? { label: stage, color: '#6B7280' }
            return <StatusPill key={stage} label={cfg.label} color={cfg.color} count={count} />
          })}
        </Flex>
      </Card>

      {/* Individual cards */}
      {sites.map(site => {
        const badge      = PIPELINE_LABEL[site.pipelineStage ?? ''] ?? { label: '📝 Site Created', color: '#6B7280' }
        const isTerminated = site.pipelineStage === 'terminated'
        const rawKey     = site.pipelineStage ?? 'site_created'
        const stageKey   = isTerminated
          ? 'approved'
          : SITE_BEYOND_APPROVED.has(rawKey) ? 'approved' : rawKey
        return (
          <IntentLink key={site._id} intent="edit" params={{ id: site._id, type: 'projectSite' }} style={{ textDecoration: 'none' }}>
            <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
              <Stack space={3}>
                <Flex align="center" justify="space-between" gap={3}>
                  <Stack space={1}>
                    <Text size={1} weight="semibold">{site.projectEn ?? '(Untitled)'}</Text>
                    {site.projectTh && <Text size={0} muted>{site.projectTh}</Text>}
                    {site.address   && <Text size={0} muted>{site.address}</Text>}
                  </Stack>
                  <Box padding={2} style={{ background: badge.color + '1A', border: `1px solid ${badge.color}40`, borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <Text size={0} weight="semibold" style={{ color: badge.color }}>{badge.label}</Text>
                  </Box>
                </Flex>
                <Box style={{ borderTop: '1px solid #F3F4F6', paddingTop: 8 }}>
                  <Text size={0} muted weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Pipeline Status</Text>
                  <PipelineStatusBar
                    steps={SITE_PIPELINE_STEPS}
                    currentKey={stageKey}
                    updatedAt={site._updatedAt}
                    terminated={isTerminated}
                  />
                </Box>
              </Stack>
            </Card>
          </IntentLink>
        )
      })}
    </Stack>
  )
}

// ── Related Contracts ─────────────────────────────────────────────────────────

interface ContractSummary {
  _id:                     string
  contractNumber?:         string
  quotationNumber?:        string
  projectEn?:              string
  contractApprovalStatus?: string
  quotationApprovalStatus?: string
  signedStatus?:           string
  contractTypeName?:       string
  _updatedAt?:             string
}

function contractPipelineKey(c: ContractSummary): string {
  if (c.signedStatus === 'signed')               return 'signed'
  if (c.contractApprovalStatus === 'approved')   return 'contract_approved'
  if (c.contractApprovalStatus === 'pending')    return 'contract_pending'
  if (c.quotationApprovalStatus === 'approved')  return 'quotation_approved'
  if (c.quotationApprovalStatus === 'pending')   return 'quotation_pending'
  return 'draft'
}

function contractBadge(c: ContractSummary): { label: string; color: string } {
  if (c.signedStatus === 'signed')               return { label: '✍️ Signed',           color: '#22C55E' }
  if (c.contractApprovalStatus === 'approved')   return { label: '✓ Contract Approved',  color: '#22C55E' }
  if (c.contractApprovalStatus === 'pending')    return { label: '⏳ Contract Pending',   color: '#F97316' }
  if (c.contractApprovalStatus === 'rejected')   return { label: '✗ Contract Rejected',  color: '#EF4444' }
  if (c.quotationApprovalStatus === 'approved')  return { label: '✓ Quotation Approved', color: '#22C55E' }
  if (c.quotationApprovalStatus === 'pending')   return { label: '⏳ Quotation Pending',  color: '#F97316' }
  if (c.quotationApprovalStatus === 'rejected')  return { label: '✗ Quotation Rejected', color: '#EF4444' }
  return { label: '📝 Draft', color: '#6B7280' }
}

function RelatedContracts({ partyId }: { partyId: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [contracts, setContracts] = useState<ContractSummary[] | null>(null)

  useEffect(() => {
    client
      .fetch<ContractSummary[]>(
        `*[_type == "contract" && party._ref == $id] | order(_createdAt asc) {
          _id, contractNumber, quotationNumber, _updatedAt,
          contractApprovalStatus, quotationApprovalStatus, signedStatus,
          "projectEn":        projectSite->projectEn,
          "contractTypeName": contractType->name
        }`,
        { id: partyId },
      )
      .then(results => {
        // Deduplicate draft vs published: if both exist for the same base ID,
        // keep the draft (latest data) but navigate by base ID.
        const seen = new Map<string, ContractSummary>()
        for (const c of results ?? []) {
          const baseId = c._id.replace(/^drafts\./, '')
          if (!seen.has(baseId) || c._id.startsWith('drafts.')) {
            seen.set(baseId, { ...c, _id: baseId })
          }
        }
        setContracts(Array.from(seen.values()))
      })
      .catch(() => setContracts([]))
  }, [partyId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (contracts === null) {
    return <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Loading contracts…</Text></Flex>
  }

  if (contracts.length === 0) {
    return (
      <Card padding={3} border radius={2} tone="transparent">
        <Text size={1} muted>No contracts linked to this party yet.</Text>
      </Card>
    )
  }

  // Summary: count by status label
  const statusCounts = new Map<string, { color: string; count: number }>()
  for (const c of contracts) {
    const b = contractBadge(c)
    const existing = statusCounts.get(b.label)
    statusCounts.set(b.label, { color: b.color, count: (existing?.count ?? 0) + 1 })
  }

  return (
    <Stack space={3}>
      {/* Status summary bar */}
      <Card padding={3} radius={2} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
        <Flex gap={2} wrap="wrap" align="center">
          <Text size={0} muted style={{ marginRight: 4 }}>Summary:</Text>
          {Array.from(statusCounts.entries()).map(([label, { color, count }]) => (
            <StatusPill key={label} label={label} color={color} count={count} />
          ))}
        </Flex>
      </Card>

      {/* Individual cards */}
      <Stack space={2}>
      {contracts.map(c => {
        const badge  = contractBadge(c)
        const refNum = c.contractNumber ?? c.quotationNumber ?? c._id
        return (
          <IntentLink
            key={c._id}
            intent="edit"
            params={{ id: c._id, type: 'contract' }}
            style={{ textDecoration: 'none' }}
          >
            <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
              <Stack space={3}>
                <Flex align="center" justify="space-between" gap={3}>
                  <Stack space={1}>
                    <Flex align="center" gap={2}>
                      <Text size={1} weight="semibold">{refNum}</Text>
                      {c.contractTypeName && (
                        <Text size={0} muted>— {c.contractTypeName}</Text>
                      )}
                    </Flex>
                    {c.projectEn && <Text size={0} muted>{c.projectEn}</Text>}
                  </Stack>
                  <Box
                    padding={2}
                    style={{
                      background:   badge.color + '1A',
                      border:       `1px solid ${badge.color}40`,
                      borderRadius: 6,
                      whiteSpace:   'nowrap',
                      flexShrink:   0,
                    }}
                  >
                    <Text size={0} weight="semibold" style={{ color: badge.color }}>
                      {badge.label}
                    </Text>
                  </Box>
                </Flex>
                <Box style={{ borderTop: '1px solid #F3F4F6', paddingTop: 8 }}>
                  <Text size={0} muted weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Pipeline Status</Text>
                  <PipelineStatusBar
                    steps={CONTRACT_PIPELINE_STEPS}
                    currentKey={contractPipelineKey(c)}
                    updatedAt={c._updatedAt}
                  />
                </Box>
              </Stack>
            </Card>
          </IntentLink>
        )
      })}
      </Stack>
    </Stack>
  )
}

// ── Financial & Billing section ───────────────────────────────────────────────

const BANK_LABEL: Record<string, string> = {
  kbank: 'กสิกรไทย (KBank)', scb: 'ไทยพาณิชย์ (SCB)', bbl: 'กรุงเทพ (BBL)',
  ktb: 'กรุงไทย (KTB)', bay: 'กรุงศรีอยุธยา (BAY)', ttb: 'ทหารไทยธนชาต (TTB)',
  cimb: 'ซีไอเอ็มบีไทย (CIMB)', uob: 'ยูโอบี (UOB)', lhbank: 'LH Bank',
  gsb: 'ออมสิน (GSB)', baac: 'ธ.ก.ส. (BAAC)', other: 'Other',
}
const ACCT_LABEL: Record<string, string> = {
  savings: 'ออมทรัพย์ (Savings)', current: 'กระแสรายวัน (Current)', fixed: 'ฝากประจำ (Fixed)',
}

function FinancialSection({ doc }: { doc: Record<string, any> }) {
  const ba = doc.bankAccount ?? {}
  const hasBilling = doc.vatRegistered || doc.vatNumber || doc.billingAddress ||
    doc.paymentTermsDays != null || doc.creditLimit != null ||
    ba.accountNumber || ba.promptPayId || doc.financialNotes
  if (!hasBilling) return null
  return (
    <SectionCard
      title="💰 Financial & Billing"
      color="#059669"
      rows={[
        { label: 'VAT Registered',   value: doc.vatRegistered ? '✓ Yes' : null },
        { label: 'VAT Number',        value: doc.vatNumber },
        { label: 'Payment Terms',     value: doc.paymentTermsDays != null ? `${doc.paymentTermsDays} days` : null },
        { label: 'Credit Limit',      value: doc.creditLimit != null ? `฿${Number(doc.creditLimit).toLocaleString('th-TH')}` : null },
        { label: 'Billing Address',   value: doc.billingAddress },
        { label: 'Bank',              value: ba.bankName ? (BANK_LABEL[ba.bankName] ?? ba.bankName) : null },
        { label: 'Account Name',      value: ba.accountName },
        { label: 'Account Number',    value: ba.accountNumber },
        { label: 'Branch',            value: ba.branch },
        { label: 'Account Type',      value: ba.accountType ? (ACCT_LABEL[ba.accountType] ?? ba.accountType) : null },
        { label: 'PromptPay',         value: ba.promptPayId },
        { label: 'Financial Notes',   value: doc.financialNotes },
      ]}
    />
  )
}

function BankEvidenceImage({ doc }: { doc: Record<string, any> }) {
  const assetRef = doc.bankAccount?.evidence?.asset?._ref
  if (!assetRef) return null
  const projectId = 'awjj9g8u'
  const dataset   = 'production'
  const match = assetRef.match(/^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/)
  if (!match) return null
  const [, id, dimensions, ext] = match
  const url = `https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dimensions}.${ext}`
  return (
    <Card padding={3} border radius={2}>
      <Stack space={2}>
        <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#059669' }}>
          Bank Account Evidence
        </Text>
        <img
          src={url}
          alt="Bank account evidence"
          style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 6, objectFit: 'contain', background: '#F9FAFB' }}
        />
      </Stack>
    </Card>
  )
}

// ── Linked Providers (signage profiles that reference this party) ─────────────

interface ProviderSummary {
  _id:          string
  name:         string | null
  providerType: string | null
  category:     string | null
  active:       boolean | null
}

const PROVIDER_TYPE_LABEL: Record<string, string> = {
  shop:             '🏪 Shop / Restaurant',
  service:          '🔧 Service / Business',
  unitOwnerOrAgent: '🏠 Unit Owner / Agent',
  juristicOffice:   '🏛️ Juristic Office',
}

function LinkedProviders({ partyId }: { partyId: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [providers, setProviders] = useState<ProviderSummary[] | null>(null)

  useEffect(() => {
    client
      .fetch<ProviderSummary[]>(
        `*[_type == "provider" && party._ref == $id] | order(_createdAt asc) {
          _id, "name": coalesce(name_th, name_en), providerType, category, "active": status
        }`,
        { id: partyId },
      )
      .then(results => {
        // Collapse each provider's draft + published into one row (prefer draft).
        const seen = new Map<string, ProviderSummary>()
        for (const p of results ?? []) {
          const baseId = p._id.replace(/^drafts\./, '')
          if (!seen.has(baseId) || p._id.startsWith('drafts.')) seen.set(baseId, { ...p, _id: baseId })
        }
        setProviders(Array.from(seen.values()))
      })
      .catch(() => setProviders([]))
  }, [partyId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack space={3}>
      <Flex align="center" gap={2}>
        <Text size={1} weight="semibold" style={{ color: '#374151' }}>Providers (โปรไฟล์บนจอ)</Text>
        {providers !== null && (
          <Badge tone={providers.length ? 'primary' : 'default'} mode="outline" fontSize={0}>
            {providers.length}
          </Badge>
        )}
      </Flex>

      {providers === null ? (
        <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Loading providers…</Text></Flex>
      ) : providers.length === 0 ? (
        <Card padding={3} border radius={2} tone="transparent">
          <Text size={1} muted>No providers linked to this party yet.</Text>
        </Card>
      ) : (
        <Stack space={2}>
          {providers.map(p => (
            <IntentLink key={p._id} intent="edit" params={{ id: p._id, type: 'provider' }} style={{ textDecoration: 'none' }}>
              <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
                <Flex align="center" justify="space-between" gap={3}>
                  <Stack space={1}>
                    <Text size={1} weight="semibold">{p.name ?? '(unnamed provider)'}</Text>
                    <Text size={0} muted>
                      {[PROVIDER_TYPE_LABEL[p.providerType ?? ''] ?? p.providerType, p.category].filter(Boolean).join('  ·  ')}
                    </Text>
                  </Stack>
                  <Box
                    padding={2}
                    style={{
                      background:   (p.active ? '#22C55E' : '#9CA3AF') + '1A',
                      border:       `1px solid ${(p.active ? '#22C55E' : '#9CA3AF')}40`,
                      borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    <Text size={0} weight="semibold" style={{ color: p.active ? '#22C55E' : '#9CA3AF' }}>
                      {p.active ? 'Active' : 'Inactive'}
                    </Text>
                  </Box>
                </Flex>
              </Card>
            </IntentLink>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PartyOverview({ document: { displayed: doc } }: Props) {
  if (!doc._type) {
    return (
      <Card padding={6} height="fill" tone="transparent">
        <Flex align="center" justify="center" height="fill">
          <Text muted>Loading…</Text>
        </Flex>
      </Card>
    )
  }

  const isCorporate  = doc.identityType !== 'individual'
  const roles        = (doc.partyRole ?? []) as string[]
  const displayName  = isCorporate
    ? (doc.legalName_en ?? doc.legalName_th ?? doc.legalName ?? '(No name)')
    : [doc.firstName, doc.lastName].filter(Boolean).join(' ') || '(No name)'

  const primaryPhone = doc.phone ?? doc.phones?.[0]?.number
  const primaryEmail = doc.email ?? doc.emails?.[0]?.email

  const addressStr = doc.addressFull?.trim() || null

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        {/* Header */}
        <Stack space={3}>
          <Flex gap={2} wrap="wrap">
            <Badge tone="primary" mode="outline" fontSize={0}>Party</Badge>
            <Badge tone="default" mode="outline" fontSize={0}>
              {isCorporate ? '🏛️ Corporate' : '👤 Individual'}
            </Badge>
            <Badge tone="caution" mode="outline" fontSize={0}>
              Read-only — click Edit tab to make changes
            </Badge>
          </Flex>
          <Heading size={3}>{displayName}</Heading>

          {/* Role badges */}
          <Flex gap={2} wrap="wrap">
            {roles.map(role => {
              const cfg = ROLE_CONFIG[role]
              if (!cfg) return null
              return (
                <Box
                  key={role}
                  padding={2}
                  style={{
                    background:   cfg.color + '1A',
                    border:       `1px solid ${cfg.color}40`,
                    borderRadius: 6,
                  }}
                >
                  <Text size={0} weight="semibold" style={{ color: cfg.color }}>{cfg.label}</Text>
                </Box>
              )
            })}
          </Flex>
        </Stack>

        {/* Identity */}
        <SectionCard
          title="Identity"
          color="#374151"
          rows={isCorporate ? [
            { label: 'Legal Name (TH)',      value: doc.legalName_th ?? doc.legalName },
            { label: 'Legal Name (EN)',      value: doc.legalName_en       },
            { label: 'Tax ID / เลขนิติบุคคล', value: doc.taxId             },
            { label: 'Juristic Manager',    value: doc.juristicManager    },
          ] : [
            { label: 'First Name',          value: doc.firstName          },
            { label: 'Last Name',           value: doc.lastName           },
            { label: 'National ID',         value: doc.nationalId         },
            { label: 'Date of Birth',       value: fmtDate(doc.dateOfBirth) },
          ]}
        />

        {/* Contact */}
        <SectionCard
          title="Contact"
          color="#374151"
          rows={[
            { label: 'Phone',    value: primaryPhone },
            { label: 'Email',    value: primaryEmail },
            { label: 'LINE ID',  value: doc.lineId   },
            { label: 'Website',  value: doc.website  },
            { label: 'Address',  value: addressStr   },
          ]}
        />

        {/* Financial & Billing */}
        <FinancialSection doc={doc} />
        <BankEvidenceImage doc={doc} />

        {/* Property Owner */}
        {roles.includes('propertyOwner') && doc.propertyOwnerInfo && (
          <SectionCard
            title="🏠 Property Owner"
            color="#3B82F6"
            rows={[
              { label: 'Units Owned',        value: doc.propertyOwnerInfo.numberOfUnitsOwned ? String(doc.propertyOwnerInfo.numberOfUnitsOwned) : null },
              { label: 'Listing Type',       value: doc.propertyOwnerInfo.preferredListingType   },
              { label: 'Expected Rental',    value: doc.propertyOwnerInfo.expectedRentalPrice     },
              { label: 'Expected Sale',      value: doc.propertyOwnerInfo.expectedSalePrice       },
            ]}
          />
        )}

        {/* Advertiser */}
        {roles.includes('advertiser') && doc.advertiserInfo && (
          <SectionCard
            title="📢 Advertiser"
            color="#EC4899"
            rows={[
              { label: 'Business Category',  value: doc.advertiserInfo.businessCategory },
              { label: 'Campaign Types',     value: (doc.advertiserInfo.campaignTypes ?? []).join(', ') || null },
              { label: 'Screen Locations',   value: (doc.advertiserInfo.preferredScreenLocations ?? []).join(', ') || null },
              { label: 'Monthly Budget',     value: doc.advertiserInfo.monthlyBudgetTHB ? `฿${doc.advertiserInfo.monthlyBudgetTHB}` : null },
            ]}
          />
        )}

        {/* Agent */}
        {roles.includes('agent') && doc.agentInfo && (
          <SectionCard
            title="🤝 Agent / Broker"
            color="#22C55E"
            rows={[
              { label: 'Agency',           value: doc.agentInfo.agencyName     },
              { label: 'License No.',      value: doc.agentInfo.licenseNumber  },
              { label: 'Commission Rate',  value: doc.agentInfo.commissionRate ? `${doc.agentInfo.commissionRate}%` : null },
              { label: 'Specialization',   value: (doc.agentInfo.specialization ?? []).join(', ') || null },
            ]}
          />
        )}

        {/* Developer */}
        {roles.includes('developer') && doc.developerInfo && (
          <SectionCard
            title="🏗️ Developer"
            color="#F59E0B"
            rows={[
              { label: 'Project Types',    value: (doc.developerInfo.projectTypes ?? []).join(', ') || null },
              { label: 'Active Projects',  value: doc.developerInfo.numberOfActiveProjects ? String(doc.developerInfo.numberOfActiveProjects) : null },
            ]}
          />
        )}

        {/* Tenant / Buyer */}
        {roles.includes('tenant') && doc.tenantInfo && (
          <SectionCard
            title="🏡 Tenant / Buyer"
            color="#14B8A6"
            rows={[
              { label: 'Unit Reference',  value: doc.tenantInfo.unitReference  },
              { label: 'Tenancy Type',    value: doc.tenantInfo.tenancyType    },
              { label: 'Move-in Date',    value: fmtDate(doc.tenantInfo.moveInDate)  },
              { label: 'Lease Expiry',    value: fmtDate(doc.tenantInfo.leaseExpiry) },
            ]}
          />
        )}

        {/* Vendor */}
        {roles.includes('vendor') && doc.vendorInfo && (
          <SectionCard
            title="📦 Vendor"
            color="#F97316"
            rows={[
              { label: 'Product Categories', value: (doc.vendorInfo.productCategories ?? []).join(', ') || null },
              { label: 'Payment Terms',      value: doc.vendorInfo.paymentTermsDays ? `${doc.vendorInfo.paymentTermsDays} days` : null },
              { label: 'Lead Time',          value: doc.vendorInfo.leadTimeDays ? `${doc.vendorInfo.leadTimeDays} days` : null },
              { label: 'Warranty Terms',     value: doc.vendorInfo.warrantyTerms  },
            ]}
          />
        )}

        {/* Service Provider */}
        {roles.includes('serviceProvider') && doc.serviceProviderInfo && (
          <SectionCard
            title="🔧 Service Provider"
            color="#8B5CF6"
            rows={[
              { label: 'Service Types',  value: (doc.serviceProviderInfo.serviceTypes ?? []).join(', ') || null },
              { label: 'Coverage Area',  value: doc.serviceProviderInfo.coverageArea  },
              { label: 'Certifications', value: doc.serviceProviderInfo.certifications },
            ]}
          />
        )}

        {/* App Vendor */}
        {roles.includes('appVendor') && doc.appVendorInfo && (
          <SectionCard
            title="💻 App Vendor"
            color="#10B981"
            rows={[
              { label: 'Software Products', value: (doc.appVendorInfo.softwareProducts ?? []).join(', ') || null },
              { label: 'Support Email',     value: doc.appVendorInfo.supportEmail  },
              { label: 'Support Phone',     value: doc.appVendorInfo.supportPhone  },
              { label: 'License Model',     value: doc.appVendorInfo.licenseModel  },
              { label: 'Contract Expiry',   value: fmtDate(doc.appVendorInfo.contractExpiry) },
            ]}
          />
        )}

        {/* Associated Project Sites */}
        {((doc.projectSites?.length > 0) || doc.projectSite?._ref) && (
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ color: '#374151' }}>Associated Project Sites</Text>
            <LinkedProjectSites
              siteRefs={doc.projectSites}
              legacyRef={doc.projectSite?._ref}
            />
          </Stack>
        )}

        {/* Linked Providers (signage profiles) */}
        <LinkedProviders partyId={doc._id?.replace(/^drafts\./, '')} />

        {/* Related Contracts */}
        <Stack space={3}>
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>
            Related Contracts
          </Text>
          <RelatedContracts partyId={doc._id?.replace(/^drafts\./, '')} />
        </Stack>

        {/* Internal notes */}
        {doc.internalNotes && (
          <Card padding={3} border radius={2} tone="transparent">
            <Stack space={2}>
              <Text size={0} weight="semibold" muted>Internal Notes</Text>
              <Text size={1}>{doc.internalNotes}</Text>
            </Stack>
          </Card>
        )}

      </Stack>
    </Card>
  )
}
