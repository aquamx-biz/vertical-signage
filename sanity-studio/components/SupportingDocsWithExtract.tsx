/**
 * SupportingDocsWithExtract
 *
 * Custom input for the supportingDocs (1.2) field on Payment documents.
 * Renders the standard array input, then an "Extract from Doc" button below.
 *
 * On click:
 *  1. Runs a free GROQ file-level duplicate check (same Sanity asset _ref)
 *  2. Calls Claude Vision via the extract-payment API (parallel with step 1)
 *  3. Runs a free GROQ invoice-number duplicate check with the extracted vendorInvoiceRef
 *  4. Looks up the vendor by taxId / legalName_th to see if a matching Party already exists
 *  5. Shows a review dialog with any duplicate warnings + payment field checklist + vendor section
 *  6. On confirm, patches the selected fields. Vendor section either links the matched party
 *     or creates a new Party doc (with role 'vendor' and identityType 'corporate') from the
 *     extracted seller details. Skips vendor if one is already set on the payment.
 */

import { useState, useCallback }   from 'react'
import { useClient, useFormValue } from 'sanity'
import { useToast, Box, Stack, Text, Button, Flex, Card, Spinner, Badge, Dialog } from '@sanity/ui'

const DOC_TYPE_LABEL: Record<string, string> = {
  quotation: 'Quotation', invoice: 'Invoice', purchase_order: 'PO', other: 'Document',
}

function extFromUrl(url: string): string {
  return url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

const EXTRACT_URL =
  (process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app') +
  '/api/extract-payment'

const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'

function fileRefToUrl(ref: string): string | null {
  if (!ref?.startsWith('file-')) return null
  const body     = ref.slice('file-'.length)
  const lastDash = body.lastIndexOf('-')
  if (lastDash === -1) return null
  return `https://cdn.sanity.io/files/${PROJECT_ID}/${DATASET}/${body.slice(0, lastDash)}.${body.slice(lastDash + 1)}`
}

const WHT_DISPLAY: Record<string, string> = {
  none: 'None', '0': '0%', '3': '3%', '5': '5%', '10': '10%', custom: 'Custom',
}
const VAT_DISPLAY: Record<string, string> = {
  inclusive: 'Inclusive (VAT in price)',
  exclusive: 'Exclusive (VAT added on top)',
  zero:      '0% VAT',
  none:      'No VAT',
}

interface ExtractedParty {
  legalName_th?:      string | null
  legalName_en?:      string | null
  taxId?:             string | null
  addressFull?:       string | null
  phone?:             string | null
  email?:             string | null
  vatRegistered?:     boolean | null
  bankName?:          string | null
  bankAccountName?:   string | null
  bankAccountNumber?: string | null
  bankBranch?:        string | null
}

interface ExtractResult {
  vendorName?:           string | null
  vendorInvoiceRef?:     string | null
  paymentAmount?:        number | null
  vatType?:              string | null
  vatAmount?:            number | null
  withholdingTaxRate?:   string | null
  withholdingTaxCustom?: number | null
  currency?:             string | null
  dueDate?:              string | null
  invoiceDate?:          string | null
  expenseDescription?:   string | null
  party?:                ExtractedParty | null
}

interface PartyMatchInfo {
  status:        'matched' | 'new'
  existingId?:   string
  existingName?: string
  existingTaxId?: string
}

const BANK_NAME_MAP: { keys: string[]; value: string }[] = [
  { keys: ['kasikorn', 'kbank', 'กสิกร'],          value: 'kbank'   },
  { keys: ['scb', 'siam commercial', 'ไทยพาณิชย์'], value: 'scb'     },
  { keys: ['bbl', 'bangkok bank', 'กรุงเทพ'],       value: 'bbl'     },
  { keys: ['ktb', 'krungthai', 'กรุงไทย'],          value: 'ktb'     },
  { keys: ['bay', 'krungsri', 'กรุงศรี'],           value: 'bay'     },
  { keys: ['ttb', 'tmbthanachart', 'ทหารไทย', 'ธนชาต'], value: 'ttb' },
  { keys: ['cimb', 'ซีไอเอ็มบี'],                   value: 'cimb'    },
  { keys: ['uob', 'ยูโอบี'],                         value: 'uob'     },
  { keys: ['lh bank', 'land and houses', 'แลนด์ แอนด์ เฮ้าส์'], value: 'lhbank' },
  { keys: ['gsb', 'government savings', 'ออมสิน'],   value: 'gsb'     },
  { keys: ['baac', 'ธ.ก.ส.', 'ธกส'],                 value: 'baac'    },
]

function mapBankName(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  for (const { keys, value } of BANK_NAME_MAP) {
    if (keys.some(k => lower.includes(k.toLowerCase()))) return value
  }
  return 'other'
}

interface DuplicateHit {
  _id:            string
  paymentNumber?: string | null
  vendorName?:    string | null
  paymentStatus?: string | null
  reason:         'file' | 'invoice'
}

const FIELD_META = [
  { key: 'vendorName'           as const, label: 'Vendor Name',            sanityField: '',                     format: (v: any) => `${v}  (reference only — select vendor manually)` },
  { key: 'vendorInvoiceRef'     as const, label: '1.2b · Invoice Ref No.', sanityField: 'vendorInvoiceRef'                                                                              },
  { key: 'paymentAmount'        as const, label: '1.6 · Total Obligation', sanityField: 'paymentAmount',        format: (v: any) => Number(v).toLocaleString()                         },
  { key: 'currency'             as const, label: '1.7 · Currency',         sanityField: 'currency'                                                                                      },
  { key: 'vatType'              as const, label: '1.9 · VAT Type',         sanityField: 'vatType',              format: (v: any) => VAT_DISPLAY[v] ?? v                                },
  { key: 'vatAmount'            as const, label: '1.10 · VAT Amount',      sanityField: 'vatAmount',            format: (v: any) => Number(v).toLocaleString()                         },
  { key: 'withholdingTaxRate'   as const, label: '1.14 · WHT Rate',        sanityField: 'withholdingTaxRate',   format: (v: any) => WHT_DISPLAY[v] ?? v                                },
  { key: 'withholdingTaxCustom' as const, label: '1.15 · WHT Amount',      sanityField: 'withholdingTaxCustom', format: (v: any) => Number(v).toLocaleString()                         },
  { key: 'dueDate'              as const, label: '1.16 · Due Date',        sanityField: 'dueDate'                                                                                       },
  { key: 'invoiceDate'          as const, label: 'Invoice Date',           sanityField: '',                     format: (v: any) => `${v}  (reference only)`                           },
  { key: 'expenseDescription'   as const, label: '3.3 · Payment Notes',    sanityField: 'expenseDescription'                                                                            },
]

export function SupportingDocsWithExtract(props: any) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const toast  = useToast()
  const docId  = useFormValue(['_id']) as string | undefined
  const existingVendor = useFormValue(['vendor']) as { _ref?: string } | undefined

  const docs: any[] = props.value ?? []
  const assetRefs   = docs.map((d: any) => d?.file?.asset?._ref).filter(Boolean) as string[]
  const fileUrls    = assetRefs.map(fileRefToUrl).filter((u): u is string => u !== null)

  const [dialogOpen,  setDialogOpen]  = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [result,      setResult]      = useState<ExtractResult | null>(null)
  const [duplicates,  setDuplicates]  = useState<DuplicateHit[]>([])
  const [selected,    setSelected]    = useState<Partial<Record<keyof ExtractResult, boolean>>>({})
  const [error,       setError]       = useState('')
  const [partyMatch,    setPartyMatch]    = useState<PartyMatchInfo | null>(null)
  const [includeParty,  setIncludeParty]  = useState(false)

  // ── GROQ helpers ────────────────────────────────────────────────────────────

  async function checkFileDuplicates(refs: string[]): Promise<DuplicateHit[]> {
    if (refs.length === 0 || !docId) return []
    const baseId = docId.replace(/^drafts\./, '')
    try {
      const hits = await client.fetch<any[]>(
        `*[_type == "payment" && !(_id in path("drafts.**")) && _id != $currentId
           && count(supportingDocs[file.asset._ref in $assetRefs]) > 0]
         { _id, paymentNumber, vendorName, paymentStatus }`,
        { currentId: baseId, assetRefs: refs },
      )
      return hits.map(h => ({ ...h, reason: 'file' as const }))
    } catch {
      return []
    }
  }

  async function findPartyMatch(party: ExtractedParty | null | undefined): Promise<PartyMatchInfo> {
    if (!party) return { status: 'new' }
    const taxIdDigits = (party.taxId ?? '').replace(/\D/g, '')
    try {
      // 1. Exact match by taxId — strongest signal
      if (taxIdDigits) {
        const hit = await client.fetch<any>(
          `*[_type == "party" && taxId == $taxId && !(_id in path("drafts.**"))][0]
            { _id, legalName_th, legalName_en, taxId }`,
          { taxId: taxIdDigits },
        )
        if (hit?._id) {
          return { status: 'matched', existingId: hit._id, existingName: hit.legalName_th ?? hit.legalName_en, existingTaxId: hit.taxId }
        }
      }
      // 2. Fallback: legalName_th exact match (case-insensitive)
      const nameTh = party.legalName_th?.trim()
      if (nameTh) {
        const hit = await client.fetch<any>(
          `*[_type == "party" && lower(legalName_th) == lower($name) && !(_id in path("drafts.**"))][0]
            { _id, legalName_th, legalName_en, taxId }`,
          { name: nameTh },
        )
        if (hit?._id) {
          return { status: 'matched', existingId: hit._id, existingName: hit.legalName_th ?? hit.legalName_en, existingTaxId: hit.taxId }
        }
      }
    } catch {
      // Fall through — treat as no match
    }
    return { status: 'new' }
  }

  async function checkInvoiceDuplicate(invoiceRef: string): Promise<DuplicateHit[]> {
    if (!invoiceRef || !docId) return []
    const baseId = docId.replace(/^drafts\./, '')
    try {
      const hits = await client.fetch<any[]>(
        `*[_type == "payment" && !(_id in path("drafts.**")) && _id != $currentId
           && vendorInvoiceRef == $invoiceRef]
         { _id, paymentNumber, vendorName, paymentStatus }`,
        { currentId: baseId, invoiceRef },
      )
      return hits.map(h => ({ ...h, reason: 'invoice' as const }))
    } catch {
      return []
    }
  }

  // ── Main extraction ──────────────────────────────────────────────────────────

  const runExtract = useCallback(async () => {
    if (fileUrls.length === 0) return
    setDialogOpen(true)
    setLoading(true)
    setResult(null)
    setDuplicates([])
    setError('')
    setSelected({})
    setPartyMatch(null)
    setIncludeParty(false)

    try {
      // Step 1 + 2: file duplicate check and AI extraction run in parallel
      const [fileDupes, aiRes] = await Promise.all([
        checkFileDuplicates(assetRefs),
        fetch(EXTRACT_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fileUrls }),
        }),
      ])

      const data = await aiRes.json() as ExtractResult
      if (!aiRes.ok) throw new Error((data as any).error ?? `HTTP ${aiRes.status}`)

      // Step 3: invoice-level duplicate check + party match (parallel)
      const [invoiceDupes, partyResult] = await Promise.all([
        data.vendorInvoiceRef ? checkInvoiceDuplicate(data.vendorInvoiceRef) : Promise.resolve([] as DuplicateHit[]),
        findPartyMatch(data.party),
      ])
      setPartyMatch(partyResult)
      // Default the party toggle ON when vendor is not yet set and we have something usable
      const hasPartyData = !!(data.party && (data.party.legalName_th || data.party.legalName_en || data.party.taxId))
      setIncludeParty(!existingVendor?._ref && hasPartyData)

      // Merge, de-duplicate by _id (prefer 'file' reason)
      const seen  = new Set<string>()
      const dupes: DuplicateHit[] = []
      for (const hit of [...fileDupes, ...invoiceDupes]) {
        if (!seen.has(hit._id)) { seen.add(hit._id); dupes.push(hit) }
      }
      setDuplicates(dupes)

      // Pre-select all patchable fields that have values
      const sel: Partial<Record<keyof ExtractResult, boolean>> = {}
      for (const { key, sanityField } of FIELD_META) {
        if (data[key] != null && sanityField) sel[key] = true
      }
      setResult(data)
      setSelected(sel)
    } catch (err: any) {
      setError(err?.message ?? 'Extraction failed')
    } finally {
      setLoading(false)
    }
  }, [fileUrls, assetRefs, docId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply selected fields ────────────────────────────────────────────────────

  const applySelected = useCallback(async () => {
    if (!result || !docId) return
    const draftId = `drafts.${docId.replace(/^drafts\./, '')}`

    const patchSet: Record<string, unknown> = {}
    for (const { key, sanityField } of FIELD_META) {
      if (!sanityField || !selected[key]) continue
      const val = result[key]
      if (val != null) patchSet[sanityField] = val
    }

    // Resolve vendor: match an existing party or create a new one from extracted party data.
    // Skip if vendor already set on the doc (user can clear it first to re-link).
    let vendorActionLabel = ''
    if (includeParty && result.party && !existingVendor?._ref) {
      try {
        if (partyMatch?.status === 'matched' && partyMatch.existingId) {
          patchSet['vendor'] = { _type: 'reference', _ref: partyMatch.existingId }
          vendorActionLabel = ` + linked existing vendor`
        } else {
          // Create new party doc from extracted data
          const p = result.party
          const taxIdDigits = (p.taxId ?? '').replace(/\D/g, '')
          const bankNameEnum = mapBankName(p.bankName)
          const newParty: Record<string, unknown> = {
            _type:        'party',
            partyRole:    ['vendor'],
            identityType: 'corporate',
          }
          if (p.legalName_th)  newParty.legalName_th  = p.legalName_th
          if (p.legalName_en)  newParty.legalName_en  = p.legalName_en
          if (taxIdDigits)     newParty.taxId         = taxIdDigits
          if (p.addressFull)   newParty.addressFull   = p.addressFull
          if (p.phone)         newParty.phone         = p.phone
          if (p.email)         newParty.email         = p.email
          if (p.vatRegistered != null) newParty.vatRegistered = p.vatRegistered

          const bank: Record<string, unknown> = {}
          if (bankNameEnum)        bank.bankName      = bankNameEnum
          if (p.bankAccountName)   bank.accountName   = p.bankAccountName
          if (p.bankAccountNumber) bank.accountNumber = p.bankAccountNumber
          if (p.bankBranch)        bank.branch        = p.bankBranch
          if (Object.keys(bank).length > 0) newParty.bankAccount = bank

          const created = await client.create(newParty as any)
          patchSet['vendor'] = { _type: 'reference', _ref: created._id }
          vendorActionLabel = ` + created new vendor`
        }
      } catch (err: any) {
        toast.push({
          status:      'error',
          title:       'Vendor resolution failed',
          description: err?.message ?? 'Could not match or create vendor — other fields still applied.',
          duration:    6000,
        })
      }
    }

    if (Object.keys(patchSet).length === 0) return

    try {
      await client.patch(draftId).set(patchSet).commit()
      const patchedFieldCount = Object.keys(patchSet).filter(k => k !== 'vendor').length
      toast.push({
        status:      'success',
        title:       'Fields applied',
        description: `${patchedFieldCount} field(s) written to draft${vendorActionLabel}. Verify and publish when ready.`,
        duration:    6000,
      })
      setDialogOpen(false)
    } catch (err: any) {
      toast.push({ status: 'error', title: 'Failed to apply fields', description: err?.message, duration: 6000 })
    }
  }, [result, selected, docId, client, toast, includeParty, partyMatch, existingVendor]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──────────────────────────────────────────────────────────────────

  const hasFieldResults = result && FIELD_META.some(f => result[f.key] != null)
  const hasPartyResult  = !!(result?.party && (result.party.legalName_th || result.party.legalName_en || result.party.taxId))
  const hasResults      = hasFieldResults || hasPartyResult
  const selectedCount   = Object.values(selected).filter(Boolean).length
  const docCount        = fileUrls.length

  // ── Render ───────────────────────────────────────────────────────────────────

  // Pairs: [doc item, resolved URL] for items that have a file
  const previewPairs = docs
    .map((d: any) => ({ d, url: fileRefToUrl(d?.file?.asset?._ref ?? '') }))
    .filter((p): p is { d: any; url: string } => p.url !== null)

  return (
    <Stack space={3}>
      {props.renderDefault(props)}

      {/* ── Large file previews ─────────────────────────────────────────── */}
      {previewPairs.length > 0 && (
        <div style={{
          display:               'grid',
          gridTemplateColumns:   'repeat(auto-fill, minmax(180px, 1fr))',
          gap:                   12,
        }}>
          {previewPairs.map(({ d, url }, i) => {
            const ext     = extFromUrl(url)
            const isImage = IMAGE_EXTS.has(ext)
            const label   = DOC_TYPE_LABEL[d?.docType ?? ''] ?? 'Document'
            return (
              <Card key={i} border radius={2} overflow="hidden" shadow={1}>
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                  {isImage ? (
                    <img
                      src={url}
                      alt={label}
                      style={{ width: '100%', height: 220, objectFit: 'contain', background: '#f5f5f5', display: 'block' }}
                    />
                  ) : (
                    <Flex
                      align="center"
                      justify="center"
                      direction="column"
                      gap={2}
                      style={{ height: 220, background: '#fdf0ec' }}
                    >
                      <span style={{ fontSize: 52, lineHeight: 1 }}>📑</span>
                      <Text size={0} muted>Click to open</Text>
                    </Flex>
                  )}
                </a>
                <Box padding={2} style={{ borderTop: '1px solid var(--card-border-color)' }}>
                  <Text size={0} weight="semibold">{label}</Text>
                  {d?.note && (
                    <Text size={0} muted style={{ marginTop: 2 }}>{d.note}</Text>
                  )}
                </Box>
              </Card>
            )
          })}
        </div>
      )}

      <Button
        text={fileUrls.length === 0
          ? '🤖 Extract from Doc  (upload a file above first)'
          : `🤖 Extract from Doc  (${docCount} file${docCount !== 1 ? 's' : ''})`
        }
        mode="ghost"
        tone={fileUrls.length === 0 ? 'default' : 'primary'}
        disabled={fileUrls.length === 0}
        onClick={runExtract}
        style={{ width: '100%', justifyContent: 'center' }}
      />

      {dialogOpen && (
        <Dialog
          id="extract-payment-dialog"
          header="🤖 AI Payment Extraction"
          onClose={() => setDialogOpen(false)}
          width={1}
        >
          <Box padding={4}>
            <Stack space={4}>

              {loading && (
                <Flex align="center" gap={3} padding={4} justify="center">
                  <Spinner />
                  <Text size={2}>Reading {docCount} file{docCount !== 1 ? 's' : ''} and checking for duplicates…</Text>
                </Flex>
              )}

              {error && (
                <Card tone="critical" padding={3} radius={2} border>
                  <Text size={1}>{error}</Text>
                </Card>
              )}

              {/* ── Duplicate warnings ───────────────────────────────────── */}
              {!loading && duplicates.length > 0 && (
                <Stack space={2}>
                  <Card tone="critical" padding={3} radius={2} border>
                    <Stack space={2}>
                      <Text size={1} weight="semibold">
                        ⚠ Possible duplicate payment{duplicates.length > 1 ? 's' : ''} detected
                      </Text>
                      <Text size={0} muted>
                        The following published payment{duplicates.length > 1 ? 's' : ''} may already cover this document.
                        Review carefully before applying fields.
                      </Text>
                    </Stack>
                  </Card>

                  {duplicates.map(hit => (
                    <Card key={hit._id} tone="caution" padding={3} radius={2} border>
                      <Flex align="center" gap={3} wrap="wrap">
                        <Badge
                          tone={hit.reason === 'file' ? 'critical' : 'caution'}
                          mode="outline"
                          fontSize={0}
                        >
                          {hit.reason === 'file' ? 'same file' : 'same invoice no.'}
                        </Badge>
                        <Stack space={1} style={{ flex: 1 }}>
                          <Text size={1} weight="semibold">
                            {hit.paymentNumber ?? hit._id}
                          </Text>
                          {hit.vendorName && (
                            <Text size={0} muted>{hit.vendorName}</Text>
                          )}
                        </Stack>
                        {hit.paymentStatus && (
                          <Badge tone="default" mode="outline" fontSize={0}>
                            {hit.paymentStatus}
                          </Badge>
                        )}
                      </Flex>
                    </Card>
                  ))}
                </Stack>
              )}

              {/* ── Field checklist ──────────────────────────────────────── */}
              {!loading && hasResults && (
                <Stack space={3}>
                  <Text size={1} muted>
                    Select fields to apply to this payment draft.{' '}
                    <strong>Always verify amounts and dates before publishing.</strong>
                  </Text>

                  {FIELD_META.map(({ key, label, sanityField, format }) => {
                    const val = result![key]
                    if (val == null) return null

                    const isReferenceOnly = !sanityField
                    const isChecked       = !!selected[key]
                    const displayVal      = format ? format(val) : String(val)

                    return (
                      <Card
                        key={key}
                        padding={3}
                        radius={2}
                        border
                        tone={isReferenceOnly ? 'transparent' : isChecked ? 'positive' : 'default'}
                        style={{ cursor: isReferenceOnly ? 'default' : 'pointer' }}
                        onClick={() => !isReferenceOnly && setSelected(p => ({ ...p, [key]: !p[key] }))}
                      >
                        <Flex align="flex-start" gap={3}>
                          {isReferenceOnly ? (
                            <Box style={{ width: 16, height: 16, flexShrink: 0 }} />
                          ) : (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => setSelected(p => ({ ...p, [key]: !p[key] }))}
                              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                            />
                          )}
                          <Stack space={1} style={{ flex: 1 }}>
                            <Flex align="center" gap={2} wrap="wrap">
                              <Text size={0} weight="semibold" muted>{label}</Text>
                              {isReferenceOnly && (
                                <Badge tone="caution" mode="outline" fontSize={0}>reference only</Badge>
                              )}
                            </Flex>
                            <Text size={1}>{displayVal}</Text>
                          </Stack>
                        </Flex>
                      </Card>
                    )
                  })}

                  {/* ── Party (vendor) section ──────────────────────────────── */}
                  {result?.party && (result.party.legalName_th || result.party.legalName_en || result.party.taxId) && (() => {
                    const p = result!.party!
                    const matched = partyMatch?.status === 'matched'
                    const vendorAlreadySet = !!existingVendor?._ref
                    const disabled = vendorAlreadySet
                    return (
                      <Card
                        padding={3}
                        radius={2}
                        border
                        tone={disabled ? 'transparent' : includeParty ? 'positive' : 'default'}
                        style={{ cursor: disabled ? 'default' : 'pointer' }}
                        onClick={() => !disabled && setIncludeParty(v => !v)}
                      >
                        <Flex align="flex-start" gap={3}>
                          {disabled ? (
                            <Box style={{ width: 16, height: 16, flexShrink: 0 }} />
                          ) : (
                            <input
                              type="checkbox"
                              checked={includeParty}
                              onChange={() => setIncludeParty(v => !v)}
                              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                            />
                          )}
                          <Stack space={2} style={{ flex: 1 }}>
                            <Flex align="center" gap={2} wrap="wrap">
                              <Text size={0} weight="semibold" muted>1.5 · Vendor (Party)</Text>
                              {vendorAlreadySet ? (
                                <Badge tone="default" mode="outline" fontSize={0}>vendor already set — won&apos;t overwrite</Badge>
                              ) : matched ? (
                                <Badge tone="positive" mode="outline" fontSize={0}>existing match — will link</Badge>
                              ) : (
                                <Badge tone="primary" mode="outline" fontSize={0}>no match — will create new</Badge>
                              )}
                            </Flex>
                            {matched && partyMatch?.existingName && (
                              <Text size={1}>
                                Linking to: <strong>{partyMatch.existingName}</strong>
                                {partyMatch.existingTaxId ? `  ·  ${partyMatch.existingTaxId}` : ''}
                              </Text>
                            )}
                            {!matched && (
                              <Stack space={1}>
                                {p.legalName_th && <Text size={1}><strong>{p.legalName_th}</strong></Text>}
                                {p.legalName_en && <Text size={0} muted>{p.legalName_en}</Text>}
                                {p.taxId         && <Text size={0} muted>Tax ID: {p.taxId}</Text>}
                                {p.addressFull   && <Text size={0} muted style={{ whiteSpace: 'pre-wrap' }}>{p.addressFull}</Text>}
                                {(p.phone || p.email) && (
                                  <Text size={0} muted>
                                    {[p.phone, p.email].filter(Boolean).join('  ·  ')}
                                  </Text>
                                )}
                                {(p.bankName || p.bankAccountNumber) && (
                                  <Text size={0} muted>
                                    Bank: {[p.bankName, p.bankAccountName, p.bankAccountNumber, p.bankBranch].filter(Boolean).join('  ·  ')}
                                  </Text>
                                )}
                              </Stack>
                            )}
                          </Stack>
                        </Flex>
                      </Card>
                    )
                  })()}

                  <Card padding={3} radius={2} tone="caution" border>
                    <Text size={0} muted>
                      ⚠ AI extraction may misread amounts, dates, or currency. Always cross-check
                      against the original document before publishing.
                    </Text>
                  </Card>

                  <Flex gap={2} justify="flex-end">
                    <Button text="Cancel" mode="ghost" onClick={() => setDialogOpen(false)} />
                    <Button
                      text={(() => {
                        const parts: string[] = []
                        if (selectedCount > 0) parts.push(`${selectedCount} field${selectedCount !== 1 ? 's' : ''}`)
                        if (includeParty) parts.push(partyMatch?.status === 'matched' ? 'link vendor' : 'create vendor')
                        return parts.length > 0 ? `Apply ${parts.join(' + ')}` : 'Select fields to apply'
                      })()}
                      tone={duplicates.length > 0 ? 'caution' : 'primary'}
                      disabled={selectedCount === 0 && !includeParty}
                      onClick={applySelected}
                    />
                  </Flex>
                </Stack>
              )}

              {!loading && !error && result && !hasResults && (
                <Stack space={3}>
                  <Card padding={4} tone="caution" border radius={2}>
                    <Text size={1} muted align="center">
                      No payment data could be extracted. Try a clearer image or a digital PDF invoice.
                    </Text>
                  </Card>
                  <Flex justify="flex-end">
                    <Button text="Close" mode="ghost" onClick={() => setDialogOpen(false)} />
                  </Flex>
                </Stack>
              )}

            </Stack>
          </Box>
        </Dialog>
      )}
    </Stack>
  )
}
