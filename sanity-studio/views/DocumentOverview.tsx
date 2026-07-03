import React, { useEffect, useRef, useState } from 'react'
import { usePaneRouter }   from 'sanity/structure'
import { useClient }       from 'sanity'
import { IntentLink }      from 'sanity/router'
import { Card, Text, Stack, Heading, Badge, Flex, Spinner, Box } from '@sanity/ui'
import { ContractStatusTimeline }                        from '../components/ContractStatusTimeline'
import { ProjectSiteStatusTimeline }                    from '../components/ProjectSiteStatusTimeline'
import { PipelineStatusTimeline, InstallationStatusTimeline, ProcurementStatusTimeline, PaymentStatusTimeline } from '../components/PipelineStatusTimeline'

interface Props {
  document: {
    draft:     Record<string, any> | null
    published: Record<string, any> | null
    displayed: Record<string, any>
  }
  schemaType: { name: string; title?: string }
}

interface ContractSummary {
  _id:            string
  contractNumber: string | null
  quotationNumber: string | null
  customerName:   string | null
  contractApprovalStatus: string | null
  quotationApprovalStatus: string | null
  signedStatus:   string | null
  'contractType': { name: string } | null
}

const SKIP = new Set([
  '_id', '_type', '_rev', '_createdAt', '_updatedAt',
  'title', 'nameEN', 'name',
  // approval / activity fields — shown via status bars or dedicated tabs
  'approvalStatus', 'notificationEmail', 'approvedAt',
  'approvalResetReason', 'lastApprovalSnapshot',
  // generation metadata
  'generationStatus', 'generatedDocType', 'generationError',
  // status fields — shown via timeline components
  'paymentStatus', 'procurementStatus', 'pipelineStatus',
  // complex/display-only fields not renderable as plain text
  'dynamicFields', 'setupDescriptionBanner',
])

function formatKey(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? '✓ Yes' : '✗ No'
  if (typeof value === 'string')  return value || null
  if (typeof value === 'number')  return String(value)
  return null
}

function contractStatusBadge(c: ContractSummary): { label: string; color: string } {
  if (c.signedStatus === 'signed')                    return { label: '✍️ Signed',            color: '#22C55E' }
  if (c.contractApprovalStatus === 'approved')        return { label: '✓ Contract Approved',   color: '#22C55E' }
  if (c.contractApprovalStatus === 'pending')         return { label: '⏳ Contract Pending',    color: '#F97316' }
  if (c.contractApprovalStatus === 'rejected')        return { label: '✗ Contract Rejected',   color: '#EF4444' }
  if (c.quotationApprovalStatus === 'approved')       return { label: '✓ Quotation Approved',  color: '#22C55E' }
  if (c.quotationApprovalStatus === 'pending')        return { label: '⏳ Quotation Pending',   color: '#F97316' }
  if (c.quotationApprovalStatus === 'rejected')       return { label: '✗ Quotation Rejected',  color: '#EF4444' }
  return { label: '📝 Draft', color: '#6B7280' }
}

// ── Related Project Site section (contract only) ─────────────────────────────

interface ProjectSiteSummary {
  _id:           string
  projectEn:     string | null
  projectTh:     string | null
  pipelineStage: string | null
  developer:     string | null
}

const PIPELINE_LABEL: Record<string, { label: string; color: string }> = {
  site_created:        { label: '📝 Site Created',        color: '#6B7280' },
  site_review:         { label: '🔵 Under Review',        color: '#3B82F6' },
  approved:            { label: '✅ Site Approved',        color: '#22C55E' },
  quotation_pending:   { label: '⏳ Quotation Pending',    color: '#F97316' },
  quotation_approved:  { label: '🟢 Quotation Approved',  color: '#22C55E' },
  contract_pending:    { label: '⏳ Contract Pending',     color: '#F97316' },
  contract_approved:   { label: '🟠 Contract Approved',   color: '#F97316' },
  active:              { label: '✅ Active',               color: '#22C55E' },
  terminated:          { label: '🔴 Terminated',           color: '#EF4444' },
}

function RelatedProjectSite({ projectSiteRef }: { projectSiteRef: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [site, setSite] = useState<ProjectSiteSummary | null | 'loading'>('loading')

  useEffect(() => {
    client
      .fetch<ProjectSiteSummary>(
        `*[_id == $id][0]{ _id, projectEn, projectTh, pipelineStage, developer }`,
        { id: projectSiteRef },
      )
      .then(result => setSite(result ?? null))
      .catch(() => setSite(null))
  }, [projectSiteRef]) // eslint-disable-line react-hooks/exhaustive-deps

  if (site === 'loading') {
    return (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>Loading project site…</Text>
      </Flex>
    )
  }

  if (!site) {
    return (
      <Card padding={3} border radius={2} tone="transparent">
        <Text size={1} muted>Project site not found.</Text>
      </Card>
    )
  }

  const badge = PIPELINE_LABEL[site.pipelineStage ?? ''] ?? { label: '📝 Site Created', color: '#6B7280' }

  return (
    <IntentLink
      intent="edit"
      params={{ id: site._id, type: 'projectSite' }}
      style={{ textDecoration: 'none' }}
    >
      <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
        <Flex align="center" justify="space-between" gap={3}>
          <Stack space={1}>
            <Text size={1} weight="semibold">{site.projectEn ?? '(Untitled)'}</Text>
            {site.projectTh && <Text size={0} muted>{site.projectTh}</Text>}
            {site.developer && <Text size={0} muted>{site.developer}</Text>}
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
      </Card>
    </IntentLink>
  )
}

// ── Linked Party section (contract only) ─────────────────────────────────────

function LinkedParty({ partyRef }: { partyRef: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [party, setParty] = useState<{ _id: string; legalName_en?: string; legalName_th?: string; firstName?: string; lastName?: string; partyRole?: string[] } | null | 'loading'>('loading')

  useEffect(() => {
    client
      .fetch(`*[_id == $id][0]{ _id, legalName_en, legalName_th, firstName, lastName, partyRole }`, { id: partyRef })
      .then(r => setParty(r ?? null))
      .catch(() => setParty(null))
  }, [partyRef]) // eslint-disable-line react-hooks/exhaustive-deps

  if (party === 'loading') return <Flex gap={2} align="center"><Spinner muted /><Text size={1} muted>Loading party…</Text></Flex>
  if (!party) return null

  const name = party.legalName_en ?? party.legalName_th ?? [party.firstName, party.lastName].filter(Boolean).join(' ') ?? '(No name)'
  const roles = ((party.partyRole ?? []) as string[]).map(r => ROLE_EMOJI[r] ?? r).join(' ')

  return (
    <IntentLink intent="edit" params={{ id: party._id, type: 'party' }} style={{ textDecoration: 'none' }}>
      <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
        <Flex align="center" justify="space-between" gap={3}>
          <Stack space={1}>
            <Text size={1} weight="semibold">{name}</Text>
            {party.legalName_th && party.legalName_en && (
              <Text size={0} muted>{party.legalName_th}</Text>
            )}
            {roles && <Text size={0} muted>{roles}</Text>}
          </Stack>
          <Text size={0} muted style={{ flexShrink: 0 }}>→ Open</Text>
        </Flex>
      </Card>
    </IntentLink>
  )
}

// ── Linked Parties section (project site only) ───────────────────────────────

interface PartySummary {
  _id:          string
  displayName:  string
  partyRole?:   string[]
}

const ROLE_EMOJI: Record<string, string> = {
  juristicPerson:  '🏛️',
  propertyOwner:   '🏠',
  advertiser:      '📢',
  agent:           '🤝',
  developer:       '🏗️',
  tenant:          '🏡',
  vendor:          '📦',
  serviceProvider: '🔧',
  appVendor:       '💻',
}

function LinkedParties({ projectSiteId }: { projectSiteId: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [parties, setParties] = useState<PartySummary[] | null>(null)

  useEffect(() => {
    client
      .fetch<PartySummary[]>(
        `*[_type == "party" && ($id in projectSites[]._ref || projectSite._ref == $id) && !(_id in path("drafts.**"))] | order(_createdAt asc) {
          _id,
          partyRole,
          "displayName": coalesce(legalName_en, legalName_th, legalName, firstName + " " + lastName, "(No name)")
        }`,
        { id: projectSiteId },
      )
      .then(setParties)
      .catch(() => setParties([]))
  }, [projectSiteId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (parties === null) {
    return <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Loading parties…</Text></Flex>
  }

  if (parties.length === 0) {
    return (
      <Card padding={3} border radius={2} tone="transparent">
        <Text size={1} muted>No parties linked to this project site yet.</Text>
      </Card>
    )
  }

  return (
    <Stack space={2}>
      {parties.map(p => {
        const roles = ((p.partyRole ?? []) as string[]).map(r => ROLE_EMOJI[r] ?? r).join(' ')
        return (
          <IntentLink
            key={p._id}
            intent="edit"
            params={{ id: p._id, type: 'party' }}
            style={{ textDecoration: 'none' }}
          >
            <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
              <Flex align="center" justify="space-between" gap={3}>
                <Stack space={1}>
                  <Text size={1} weight="semibold">{p.displayName}</Text>
                  {roles && <Text size={0} muted>{roles}</Text>}
                </Stack>
                <Text size={0} muted style={{ flexShrink: 0 }}>→ Open</Text>
              </Flex>
            </Card>
          </IntentLink>
        )
      })}
    </Stack>
  )
}

// ── Related Contracts section (project site only) ─────────────────────────────

function RelatedContracts({ projectSiteId }: { projectSiteId: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [contracts, setContracts] = useState<ContractSummary[] | null>(null)

  useEffect(() => {
    client
      .fetch<ContractSummary[]>(
        `*[_type == "contract" && projectSite._ref == $id] | order(_createdAt asc) {
          _id, contractNumber, quotationNumber, customerName,
          contractApprovalStatus, quotationApprovalStatus, signedStatus,
          "contractType": contractType->{ name }
        }`,
        { id: projectSiteId },
      )
      .then(results => {
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
  }, [projectSiteId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (contracts === null) {
    return (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>Loading contracts…</Text>
      </Flex>
    )
  }

  if (contracts.length === 0) {
    return (
      <Card padding={3} border radius={2} tone="transparent">
        <Text size={1} muted>No contracts linked to this project site yet.</Text>
      </Card>
    )
  }

  return (
    <Stack space={2}>
      {contracts.map(c => {
        const badge     = contractStatusBadge(c)
        const refNum    = c.contractNumber ?? c.quotationNumber ?? c._id
        const typeName  = c.contractType?.name ?? 'Contract'

        return (
          <IntentLink
            key={c._id}
            intent="edit"
            params={{ id: c._id, type: 'contract' }}
            style={{ textDecoration: 'none' }}
          >
            <Card
              padding={3}
              border
              radius={2}
              tone="default"
              style={{ cursor: 'pointer', transition: 'background 0.15s' }}
            >
              <Flex align="center" justify="space-between" gap={3}>
                <Stack space={1}>
                  <Flex align="center" gap={2}>
                    <Text size={1} weight="semibold">{refNum}</Text>
                    <Text size={0} muted>— {typeName}</Text>
                  </Flex>
                  {c.customerName && (
                    <Text size={0} muted>{c.customerName}</Text>
                  )}
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
            </Card>
          </IntentLink>
        )
      })}
    </Stack>
  )
}

// ── Related Installation section (contract only) ──────────────────────────────

const INSTALL_STAGE_LABEL: Record<string, { label: string; color: string }> = {
  screen_ordered:    { label: '📦 Screen Ordered',    color: '#3B82F6' },
  screen_delivered:  { label: '🚚 Screen Delivered',  color: '#F97316' },
  screen_installed:  { label: '🔧 Screen Installed',  color: '#8B5CF6' },
  system_configured: { label: '⚙️ System Configured', color: '#10B981' },
  live:              { label: '✅ System Live',        color: '#22C55E' },
}

interface InstallationSummary {
  _id:               string
  installationStage: string | null
}

function RelatedInstallation({ contractId }: { contractId: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [inst, setInst] = useState<InstallationSummary | null | 'loading'>('loading')

  useEffect(() => {
    client
      .fetch<InstallationSummary>(
        `*[_type == "installation" && contract._ref == $id][0]{ _id, installationStage }`,
        { id: contractId },
      )
      .then(r => setInst(r ?? null))
      .catch(() => setInst(null))
  }, [contractId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (inst === 'loading') {
    return (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>Loading installation…</Text>
      </Flex>
    )
  }

  if (!inst) {
    return (
      <Card padding={3} border radius={2} tone="transparent">
        <Text size={1} muted>No installation record linked to this contract yet.</Text>
      </Card>
    )
  }

  const badge = INSTALL_STAGE_LABEL[inst.installationStage ?? ''] ?? { label: '📦 Screen Ordered', color: '#3B82F6' }

  return (
    <IntentLink
      intent="edit"
      params={{ id: inst._id, type: 'installation' }}
      style={{ textDecoration: 'none' }}
    >
      <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
        <Flex align="center" justify="space-between" gap={3}>
          <Text size={1} weight="semibold">Install & Activate Record</Text>
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
      </Card>
    </IntentLink>
  )
}

// ── Related Assets section (procurement only) ────────────────────────────────

const ASSET_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  in_storage:     { label: '📦 In Storage',     color: '#6B7280' },
  installed:      { label: '✅ Installed',       color: '#22C55E' },
  under_repair:   { label: '🔧 Under Repair',   color: '#F97316' },
  decommissioned: { label: '⛔ Decommissioned', color: '#EF4444' },
  returned:       { label: '↩️ Returned',        color: '#6B7280' },
}

interface AssetSummary {
  _id:       string
  assetTag:  string | null
  brand:     string | null
  model:     string | null
  status:    string | null
}

function RelatedAssets({ procurementId }: { procurementId: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [assets, setAssets] = useState<AssetSummary[] | null>(null)

  useEffect(() => {
    const baseId = procurementId.replace(/^drafts\./, '')
    client
      .fetch<AssetSummary[]>(
        `*[_type == "asset" && sourceProcurement._ref == $id] | order(_createdAt asc) {
          _id, assetTag, brand, model, status
        }`,
        { id: baseId },
      )
      .then(docs => {
        const seen = new Map<string, AssetSummary>()
        for (const d of docs ?? []) {
          const key = d._id.replace(/^drafts\./, '')
          if (!seen.has(key)) seen.set(key, { ...d, _id: key })
        }
        setAssets(Array.from(seen.values()))
      })
      .catch(() => setAssets([]))
  }, [procurementId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (assets === null) return <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Loading assets…</Text></Flex>

  if (assets.length === 0) {
    return (
      <Card padding={3} border radius={2} tone="transparent">
        <Text size={1} muted>No assets linked yet. Go to Assets → create new → set Source Procurement to this record.</Text>
      </Card>
    )
  }

  return (
    <Stack space={2}>
      {assets.map(a => {
        const badge = ASSET_STATUS_LABEL[a.status ?? ''] ?? { label: a.status ?? '—', color: '#6B7280' }
        return (
          <IntentLink key={a._id} intent="edit" params={{ id: a._id, type: 'asset' }} style={{ textDecoration: 'none' }}>
            <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
              <Flex align="center" justify="space-between" gap={3}>
                <Stack space={1}>
                  <Text size={1} weight="semibold">{a.assetTag ?? '(no tag)'}</Text>
                  {(a.brand || a.model) && <Text size={0} muted>{[a.brand, a.model].filter(Boolean).join(' ')}</Text>}
                </Stack>
                <Box padding={2} style={{ background: badge.color + '1A', border: `1px solid ${badge.color}40`, borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <Text size={0} weight="semibold" style={{ color: badge.color }}>{badge.label}</Text>
                </Box>
              </Flex>
            </Card>
          </IntentLink>
        )
      })}
    </Stack>
  )
}

// ── Related Service Contracts section (procurement only) ──────────────────────

const SC_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:      { label: '✅ Active',      color: '#22C55E' },
  pending:     { label: '⏳ Pending',     color: '#F97316' },
  expired:     { label: '⚠️ Expired',     color: '#EF4444' },
  cancelled:   { label: '❌ Cancelled',   color: '#6B7280' },
  draft:       { label: '📝 Draft',       color: '#6B7280' },
}

interface ServiceContractSummary {
  _id:         string
  serviceName: string | null
  status:      string | null
}

function RelatedServiceContracts({ procurementId }: { procurementId: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [contracts, setContracts] = useState<ServiceContractSummary[] | null>(null)

  useEffect(() => {
    client
      .fetch<ServiceContractSummary[]>(
        `*[_type == "serviceContract" && linkedProcurement._ref == $id] | order(_createdAt asc) {
          _id, serviceName, status
        }`,
        { id: procurementId.replace(/^drafts\./, '') },
      )
      .then(docs => {
        const seen = new Map<string, ServiceContractSummary>()
        for (const d of docs ?? []) {
          const key = d._id.replace(/^drafts\./, '')
          if (!seen.has(key)) seen.set(key, { ...d, _id: key })
        }
        setContracts(Array.from(seen.values()))
      })
      .catch(() => setContracts([]))
  }, [procurementId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (contracts === null) return <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Loading service contracts…</Text></Flex>

  if (contracts.length === 0) {
    return (
      <Card padding={3} border radius={2} tone="transparent">
        <Text size={1} muted>No service contracts linked yet. Go to Service Contracts → create new → set Linked Procurement to this record.</Text>
      </Card>
    )
  }

  return (
    <Stack space={2}>
      {contracts.map(sc => {
        const badge = SC_STATUS_LABEL[sc.status ?? ''] ?? { label: sc.status ?? '—', color: '#6B7280' }
        return (
          <IntentLink key={sc._id} intent="edit" params={{ id: sc._id, type: 'serviceContract' }} style={{ textDecoration: 'none' }}>
            <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
              <Flex align="center" justify="space-between" gap={3}>
                <Text size={1} weight="semibold">{sc.serviceName ?? '(unnamed)'}</Text>
                <Box padding={2} style={{ background: badge.color + '1A', border: `1px solid ${badge.color}40`, borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <Text size={0} weight="semibold" style={{ color: badge.color }}>{badge.label}</Text>
                </Box>
              </Flex>
            </Card>
          </IntentLink>
        )
      })}
    </Stack>
  )
}

// ── Payment: Procurement Status bar (gated on Process Setup toggle) ───────────

function PaymentProcurementStatusBar({ contractTypeRef, procurementStatus }: { contractTypeRef?: string; procurementStatus?: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [enabled, setEnabled] = useState<boolean>(false)

  useEffect(() => {
    if (!contractTypeRef) return
    client
      .fetch<{ useProcurementStatus?: boolean }>(`*[_id == $id][0]{ useProcurementStatus }`, { id: contractTypeRef })
      .then(ct => setEnabled(ct?.useProcurementStatus === true))
      .catch(() => {})
  }, [contractTypeRef]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled || !procurementStatus) return null

  return (
    <ProcurementStatusTimeline currentStatus={procurementStatus} />
  )
}

// ── Related Offers section (provider only) ───────────────────────────────────

interface OfferSummary {
  _id:      string
  title:    string | null
  price:    string | null
  category: string | null
}

function ProviderOffers({ providerId }: { providerId: string }) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [offers, setOffers] = useState<OfferSummary[] | null>(null)

  useEffect(() => {
    const baseId = providerId.replace(/^drafts\./, '')
    client
      .fetch<OfferSummary[]>(
        `*[_type == "offer" && provider._ref == $id] | order(_createdAt asc) {
          _id, "title": coalesce(title_th, title_en), price, category
        }`,
        { id: baseId },
      )
      .then(docs => {
        // Collapse each offer's draft + published into one row (prefer draft).
        const seen = new Map<string, OfferSummary>()
        for (const d of docs ?? []) {
          const key = d._id.replace(/^drafts\./, '')
          if (!seen.has(key) || d._id.startsWith('drafts.')) {
            seen.set(key, { ...d, _id: key })
          }
        }
        setOffers(Array.from(seen.values()))
      })
      .catch(() => setOffers([]))
  }, [providerId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack space={3}>
      <Flex align="center" gap={2}>
        <Text size={1} weight="semibold" style={{ color: '#374151' }}>Offers</Text>
        {offers !== null && (
          <Badge tone={offers.length ? 'primary' : 'default'} mode="outline" fontSize={0}>
            {offers.length}
          </Badge>
        )}
      </Flex>

      {offers === null ? (
        <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Loading offers…</Text></Flex>
      ) : offers.length === 0 ? (
        <Card padding={3} border radius={2} tone="transparent">
          <Text size={1} muted>No offers linked to this provider yet.</Text>
        </Card>
      ) : (
        <Stack space={2}>
          {offers.map(o => (
            <IntentLink key={o._id} intent="edit" params={{ id: o._id, type: 'offer' }} style={{ textDecoration: 'none' }}>
              <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
                <Flex align="center" justify="space-between" gap={3}>
                  <Stack space={1}>
                    <Text size={1} weight="semibold">{o.title ?? '(untitled offer)'}</Text>
                    {o.category && <Text size={0} muted>{o.category}</Text>}
                  </Stack>
                  {o.price && <Text size={1} weight="semibold" style={{ color: '#C9864C', flexShrink: 0 }}>฿ {o.price}</Text>}
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

export function DocumentOverview({ document: { draft, published, displayed: doc }, schemaType }: Props) {
  const { setParams } = usePaneRouter()

  const decided = useRef(false)

  useEffect(() => {
    if (decided.current) return
    const timer = setTimeout(() => {
      if (decided.current) return
      decided.current = true
      const userKeys = Object.keys(draft ?? {}).filter(k => !k.startsWith('_'))
      const isNew    = !published && userKeys.length === 0
      setParams({ view: isNew ? 'edit' : 'overview' })
    }, 150)
    return () => clearTimeout(timer)
  }, [published, draft])

  if (!doc._type) {
    return (
      <Card padding={6} height="fill" tone="transparent">
        <Flex align="center" justify="center" height="fill">
          <Spinner muted />
        </Flex>
      </Card>
    )
  }

  const heading =
    doc.title              ??
    doc.nameEN             ??
    doc.name               ??
    doc.projectEn          ??
    doc.contractNumber     ??
    doc.quotationNumber    ??
    doc.customerName       ??
    doc.purchaseOrderNumber ??
    doc.paymentNumber      ??
    '(Untitled)'

  const rows = Object.entries(doc)
    .filter(([key]) => !SKIP.has(key))
    .map(([key, val]) => ({ key, label: formatKey(key), display: formatValue(val) }))
    .filter(r => r.display !== null)

  const isProjectSite = schemaType.name === 'projectSite'

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        <Stack space={3}>
          <Flex gap={2} wrap="wrap">
            <Badge tone="primary" mode="outline" fontSize={0}>
              {schemaType.title ?? schemaType.name}
            </Badge>
            <Badge tone="caution" mode="outline" fontSize={0}>
              Read-only — click Edit tab to make changes
            </Badge>
          </Flex>
          <Heading size={3}>{heading}</Heading>
        </Stack>

        {isProjectSite && (
          <ProjectSiteStatusTimeline
            pipelineStage={doc.pipelineStage}
            approvalStatus={doc.approvalStatus}
            approvedAt={doc.approvedAt}
          />
        )}

        {schemaType.name === 'procurement' && (
          <>
            <ProcurementStatusTimeline doc={doc} />
            <Stack space={3}>
              <Text size={1} weight="semibold" style={{ color: '#374151' }}>Assets Created</Text>
              <RelatedAssets procurementId={doc._id} />
            </Stack>
            <Stack space={3}>
              <Text size={1} weight="semibold" style={{ color: '#374151' }}>Service Contracts Activated</Text>
              <RelatedServiceContracts procurementId={doc._id} />
            </Stack>
          </>
        )}

        {schemaType.name === 'payment' && (
          <>
            <PaymentStatusTimeline doc={doc} />
            <PaymentProcurementStatusBar
              contractTypeRef={doc.contractType?._ref}
              procurementStatus={doc.procurementStatus}
            />
          </>
        )}

        {schemaType.name === 'installation' && (
          <InstallationStatusTimeline currentStatus={doc.installationStatus} />
        )}

        {schemaType.name === 'serviceContract' && (
          <PipelineStatusTimeline
            contractTypeRef={doc.contractType?._ref}
            currentStatus={doc.status}
            title="Service Status"
          />
        )}

        {schemaType.name === 'contract' && (
          <ContractStatusTimeline
            quotationApprovalStatus={doc.quotationApprovalStatus}
            contractApprovalStatus={doc.contractApprovalStatus}
            signedStatus={doc.signedStatus}
            quotationApprovedAt={doc.quotationApprovedAt}
            contractApprovedAt={doc.contractApprovedAt}
            signedAt={doc.signedAt}
          />
        )}

        {schemaType.name === 'contract' && doc.party?._ref && (
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ color: '#374151' }}>Party</Text>
            <LinkedParty partyRef={doc.party._ref} />
          </Stack>
        )}

        {schemaType.name === 'contract' && doc.projectSite?._ref && (
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ color: '#374151' }}>
              Project Site
            </Text>
            <RelatedProjectSite projectSiteRef={doc.projectSite._ref} />
          </Stack>
        )}

        {schemaType.name === 'contract' && (
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ color: '#374151' }}>
              Installation
            </Text>
            <RelatedInstallation contractId={doc._id} />
          </Stack>
        )}

        {isProjectSite && doc.landlord?._ref && (
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ color: '#374151' }}>
              Landlord
            </Text>
            <IntentLink
              intent="edit"
              params={{ id: doc.landlord._ref, type: 'party' }}
              style={{ textDecoration: 'none' }}
            >
              <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
                <Flex align="center" justify="space-between" gap={3}>
                  <Stack space={1}>
                    <Text size={1} weight="semibold">
                      {doc.landlord?.legalName_th ?? doc.landlord?.legalName ?? doc.landlord?.firstName ?? 'View Landlord Record'}
                    </Text>
                    <Text size={0} muted>🏢 Landlord / Property Owner</Text>
                  </Stack>
                  <Text size={0} muted>→ Open</Text>
                </Flex>
              </Card>
            </IntentLink>
          </Stack>
        )}

        {isProjectSite && (
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ color: '#374151' }}>
              Linked Parties
            </Text>
            <LinkedParties projectSiteId={doc._id} />
          </Stack>
        )}

        {isProjectSite && (
          <Stack space={3}>
            <Text size={1} weight="semibold" style={{ color: '#374151' }}>
              Related Contracts
            </Text>
            <RelatedContracts projectSiteId={doc._id} />
          </Stack>
        )}

        {schemaType.name === 'provider' && (
          <ProviderOffers providerId={doc._id} />
        )}

        {rows.length > 0 ? (
          <Stack space={2}>
            {rows.map(({ key, label, display }) => (
              <Card key={key} padding={3} border radius={2}>
                <Stack space={1}>
                  <Text size={0} weight="semibold" muted>{label}</Text>
                  <Text size={1}>{display}</Text>
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <Card padding={4} border radius={2} tone="transparent">
            <Text size={1} muted align="center">
              No simple fields to preview — click Edit to view full content.
            </Text>
          </Card>
        )}

      </Stack>
    </Card>
  )
}
