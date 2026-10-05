import { useState } from 'react'
import { Stack, Card, Text, Flex, Button, Select, TextArea, TextInput, Checkbox, Grid, Spinner, Badge, useToast } from '@sanity/ui'
import { useClient, useFormValue } from 'sanity'
import type { StringInputProps } from 'sanity'

/**
 * Termination control shown at the top of the Termination tab.
 *
 * The lifecycle is driven by buttons, not by a status dropdown:
 *   Active → [Terminate lease] → Notice given → [Confirm termination] → Terminated
 *                                         ↘ [Withdraw notice]     → Withdrawn
 *
 * Every field in the tab is written here in one patch, so a half-filled termination
 * can't exist. Clause 11.1's notice period (30 days in the current template, 90 in contracts signed
 * before 18 Sep 2026) is read from the contract itself and checked as the dates are typed.
 */

export const TERMINATION_REASONS: { value: string; th: string; by: string }[] = [
  { value: 'low_performance',  th: 'ยอดขาย/รายได้จากจุดติดตั้งต่ำกว่าเป้าหมาย',        by: 'us'       },
  { value: 'relocation',       th: 'ย้ายจุดติดตั้งไปโครงการอื่น',                      by: 'us'       },
  { value: 'rent_uneconomic',  th: 'ค่าเช่า/ค่าไฟสูงจนไม่คุ้มค่าการลงทุน',              by: 'us'       },
  { value: 'landlord_breach',  th: 'ผู้ให้เช่าผิดสัญญา',                               by: 'us'       },
  { value: 'landlord_request', th: 'ผู้ให้เช่าขอยกเลิก / ขอคืนพื้นที่',                  by: 'landlord' },
  { value: 'site_renovation',  th: 'พื้นที่ปรับปรุงหรือรื้อถอน ติดตั้งต่อไม่ได้',         by: 'mutual'   },
  { value: 'expired',          th: 'ครบกำหนดสัญญา ไม่ต่ออายุ',                        by: 'expired'  },
  { value: 'mutual',           th: 'ตกลงเลิกสัญญาร่วมกัน',                            by: 'mutual'   },
  { value: 'other',            th: 'อื่น ๆ (ระบุในรายละเอียด)',                        by: 'us'       },
]

const BY_TH: Record<string, string> = {
  us: 'Lessee (us)', landlord: 'Lessor', mutual: 'Mutual agreement', expired: 'Contract expiry',
}

/** What our own letter is called, given who ends the lease. */
const docTitleFor = (by: string) =>
  by === 'landlord' ? 'หนังสือรับทราบการบอกเลิกสัญญา'
  : by === 'mutual' ? 'หนังสือยืนยันการเลิกสัญญาโดยความตกลงร่วมกัน'
  : 'หนังสือบอกเลิกสัญญาเช่า'

const API_BASE = process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app'

const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
const daysBetween = (a?: string, b?: string) => {
  if (!a || !b) return null
  const d1 = new Date(a).getTime(), d2 = new Date(b).getTime()
  if (isNaN(d1) || isNaN(d2)) return null
  return Math.round((d2 - d1) / 86_400_000)
}
const fmt = (d?: string) => (d ? d.split('-').reverse().join('-') : '—')

const APPROVAL_BADGE: Record<string, { text: string; tone: 'positive' | 'caution' | 'critical' | 'default' }> = {
  approved: { text: '✓ Approved',        tone: 'positive' },
  pending:  { text: '⏳ Pending approval', tone: 'caution'  },
  rejected: { text: '✗ Rejected',        tone: 'critical' },
  reset:    { text: '⚠ Re-approval needed', tone: 'critical' },
}

export function TerminationStatusInput(props: StringInputProps) {
  const toast  = useToast()
  const client = useClient({ apiVersion: '2024-01-01' })

  const rawDocId  = useFormValue(['_id'])                        as string | undefined
  const status    = useFormValue(['terminationStatus'])          as string | undefined
  const reasonCd  = useFormValue(['terminationReasonCode'])      as string | undefined
  const detailVal = useFormValue(['terminationReason'])          as string | undefined
  const byVal     = useFormValue(['terminatedBy'])               as string | undefined
  const noticeVal = useFormValue(['noticeGivenAt'])              as string | undefined
  const effVal    = useFormValue(['terminationEffectiveDate'])   as string | undefined
  const needDoc   = useFormValue(['terminationNoticeRequired'])  as boolean | undefined
  const tApproval = useFormValue(['terminationApprovalStatus'])  as string | undefined
  const wApproval = useFormValue(['withdrawalApprovalStatus'])   as string | undefined
  const wAt       = useFormValue(['withdrawnAt'])                as string | undefined
  const wReason   = useFormValue(['withdrawalReason'])           as string | undefined
  const wAddendum = useFormValue(['withdrawalAddendumNo'])       as string | undefined
  const signed    = useFormValue(['signedStatus'])               as string | undefined
  const ctRef     = useFormValue(['contractType', '_ref'])       as string | undefined
  const termNo    = useFormValue(['terminationNumber'])          as string | undefined
  const wdrNo     = useFormValue(['withdrawalNumber'])           as string | undefined
  // No value means the contract predates the field. Those are the old leases that
  // require 90 days (clause 11.1 only became 30 days in the Sep 2026 template), so
  // the safe default is 90 — assuming 30 is what let a 44-day notice through on
  // Mahogany and had it rejected by the lessor.
  const noticeDays = (useFormValue(['terminationNoticeDays']) as number | undefined) ?? 90

  const draftId = rawDocId
    ? (rawDocId.startsWith('drafts.') ? rawDocId : `drafts.${rawDocId}`)
    : undefined

  const [mode,    setMode]    = useState<'terminate' | 'withdraw' | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  // termination form
  const [code,   setCode]   = useState(reasonCd  ?? '')
  const [detail, setDetail] = useState(detailVal ?? '')
  const [notice, setNotice] = useState(noticeVal ?? today())
  const [eff,    setEff]    = useState(effVal    ?? '')
  const [issue,  setIssue]  = useState(needDoc !== false)
  // withdrawal form
  const [wText, setWText] = useState(wReason   ?? '')
  const [wDate, setWDate] = useState(wAt       ?? today())
  const [wAdd,  setWAdd]  = useState(wAddendum ?? '')

  const derivedBy = TERMINATION_REASONS.find(r => r.value === code)?.by ?? 'us'
  const days      = daysBetween(notice, eff)
  const shortNote = derivedBy === 'us' && days !== null && days < noticeDays

  const ensureDraft = async (dId: string) => {
    const id = dId.replace(/^drafts\./, '')
    const base = await client.fetch(`coalesce(*[_id == $dId][0], *[_id == $id][0])`, { dId, id })
    if (base && base._id !== dId) await client.createIfNotExists({ ...base, _id: dId })
  }

  /**
   * The notice number carries no decision — it is just the next number in the series —
   * so it is issued automatically when the termination (or withdrawal) is confirmed.
   * The field stays editable and the Generate Number button remains for a redo.
   */
  const nextNumber = async (docType: 'termination' | 'withdrawal'): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/next-doc-number`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          docType,
          contractTypeId: ctRef,
          currentDocId:   rawDocId?.replace(/^drafts\./, ''),
        }),
      })
      const data = await res.json()
      return res.ok ? (data.number as string) : null
    } catch {
      return null
    }
  }

  const patch = async (data: Record<string, any>, unset: string[] = []) => {
    if (!draftId) { setError('Save the document first, then continue'); return false }
    setSaving(true); setError(null)
    try {
      await ensureDraft(draftId)
      let p = client.patch(draftId).set(data)
      if (unset.length) p = p.unset(unset)
      await p.commit()
      return true
    } catch (err: any) {
      setError(err?.message ?? 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }

  const approvedAlready = tApproval === 'approved'

  // ── Form: terminate the lease ──────────────────────────────────────────────
  const submitTermination = async () => {
    if (!code)                     { setError('Select a termination reason first'); return }
    if (detail.trim().length < 10) { setError('Enter at least 10 characters of detail / evidence'); return }
    if (!notice)                   { setError('Enter the notice date'); return }
    if (!eff)                      { setError('Enter the effective end date'); return }
    if (days !== null && days < 0) { setError('The end date must fall after the notice date'); return }

    const issuedNo = termNo || (await nextNumber('termination'))

    const ok = await patch({
      ...(issuedNo && !termNo ? { terminationNumber: issuedNo } : {}),
      terminationStatus:         status === 'terminated' ? 'terminated' : 'notice_given',
      terminationReasonCode:     code,
      terminationReason:         detail.trim(),
      terminatedBy:              derivedBy,
      noticeGivenAt:             notice,
      terminationEffectiveDate:  eff,
      terminationDate:           notice,
      terminationNoticeRequired: issue,
    })
    if (ok) {
      setMode(null)
      toast.push({
        status: 'success',
        title:  issuedNo ? `Saved — notice no. ${issuedNo}` : 'Termination saved',
        description: !issuedNo
          ? 'Automatic numbering failed — use Generate Number on the Notice Number field'
          : issue
            ? 'Publish → request approval on the Approval tab → the notice is issued automatically once approved'
            : 'Publish → upload the other party\'s letter as evidence → request approval on the Approval tab',
        duration: 9000,
      })
    }
  }

  // ── Form: withdraw the notice ──────────────────────────────────────────────
  const submitWithdrawal = async () => {
    if (wText.trim().length < 10) { setError('Enter at least 10 characters — e.g. the new rent and its start date'); return }
    if (!wDate)                   { setError('Enter the withdrawal date'); return }

    const issuedWdr = wdrNo || (await nextNumber('withdrawal'))

    const ok = await patch({
      ...(issuedWdr && !wdrNo ? { withdrawalNumber: issuedWdr } : {}),
      terminationStatus:    'withdrawn',
      withdrawnAt:          wDate,
      withdrawalReason:     wText.trim(),
      withdrawalDate:       wDate,
      ...(wAdd.trim() ? { withdrawalAddendumNo: wAdd.trim() } : {}),
    })
    if (ok) {
      setMode(null)
      toast.push({
        status: 'success',
        title:  issuedWdr ? `Notice withdrawn — letter no. ${issuedWdr}` : 'Notice withdrawn',
        description: 'Remember to issue an addendum for the new rent and adjust the remaining Billing Periods',
        duration: 9000,
      })
    }
  }

  // ── Termination form ──────────────────────────────────────────────────────
  if (mode === 'terminate') {
    return (
      <Card padding={4} radius={2} tone="caution" border>
        <Stack space={4}>
          <Text size={1} weight="semibold">
            {status && status !== 'none' ? 'Edit termination details' : 'Terminate lease'}
          </Text>

          {approvedAlready && (
            <Card padding={3} radius={2} tone="critical" border>
              <Text size={1}>This termination is already approved — editing resets the approval and re-approval will be required</Text>
            </Card>
          )}

          <Stack space={2}>
            <Text size={1} weight="semibold">Termination reason *</Text>
            <Select value={code} onChange={e => setCode((e.target as HTMLSelectElement).value)}>
              <option value="">— Select a reason —</option>
              {TERMINATION_REASONS.map(r => <option key={r.value} value={r.value}>{r.th}</option>)}
            </Select>
            {code && (
              <Text size={1} muted>
                Terminating party: <strong>{BY_TH[derivedBy]}</strong> · letter to be issued: <strong>{docTitleFor(derivedBy)}</strong>
              </Text>
            )}
          </Stack>

          <Stack space={2}>
            <Text size={1} weight="semibold">Detail / evidence *</Text>
            <Text size={1} muted>
              This text goes into the letter — e.g. sales figures, the period covered, or how the lessor breached the contract
              {code === 'landlord_breach' ? ' — also attach the evidence files below' : ''}
            </Text>
            <TextArea rows={4} value={detail} onChange={e => setDetail((e.target as HTMLTextAreaElement).value)} />
          </Stack>

          <Grid columns={2} gap={3}>
            <Stack space={2}>
              <Text size={1} weight="semibold">
                {derivedBy === 'landlord' ? 'Date the lessor\'s letter was received *' : 'Notice date *'}
              </Text>
              <TextInput type="date" value={notice} onChange={e => setNotice((e.target as HTMLInputElement).value)} />
            </Stack>
            <Stack space={2}>
              <Text size={1} weight="semibold">Lease end date *</Text>
              <TextInput type="date" value={eff} onChange={e => setEff((e.target as HTMLInputElement).value)} />
            </Stack>
          </Grid>

          {days !== null && days >= 0 && (
            <Card padding={3} radius={2} tone={shortNote ? 'critical' : 'positive'} border>
              <Text size={1}>
                Notice period: <strong>{days} days</strong>
                {derivedBy !== 'us'
                  ? ''
                  : shortNote
                    ? ` — shorter than the ${noticeDays} days required by clause 11.1; the lessor must consent`
                    : ` — meets clause 11.1 (${noticeDays} days)`}
              </Text>
            </Card>
          )}

          <Card padding={3} radius={2} tone="transparent" border>
            <Flex align="flex-start" gap={3}>
              <Checkbox checked={issue} onChange={e => setIssue((e.currentTarget as HTMLInputElement).checked)} style={{ marginTop: 3 }} />
              <Stack space={2}>
                <Text size={1} weight="semibold">Issue the letter from the system ({docTitleFor(derivedBy)})</Text>
                <Text size={1} muted>
                  Turn off when the other party has issued the letter and we only countersign — then upload their letter as evidence before requesting approval
                </Text>
              </Stack>
            </Flex>
          </Card>

          {error && <Card padding={3} radius={2} tone="critical" border><Text size={1}>{error}</Text></Card>}

          <Flex gap={2}>
            {saving
              ? <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Saving…</Text></Flex>
              : <>
                  <Button text="Confirm termination" tone="critical" onClick={submitTermination} />
                  <Button text="Cancel" mode="ghost" onClick={() => { setMode(null); setError(null) }} />
                </>}
          </Flex>
        </Stack>
      </Card>
    )
  }

  // ── Withdrawal form ───────────────────────────────────────────────────────
  if (mode === 'withdraw') {
    return (
      <Card padding={4} radius={2} tone="positive" border>
        <Stack space={4}>
          <Text size={1} weight="semibold">Withdraw termination notice (negotiation succeeded)</Text>
          <Text size={1} muted>
            The original termination details and letter number are kept as history, not deleted
          </Text>

          <Stack space={2}>
            <Text size={1} weight="semibold">Negotiation outcome / new terms *</Text>
            <Text size={1} muted>e.g. "Lessor reduces rent from THB 8,000 to 5,500 per month from the Jan 2027 period onwards"</Text>
            <TextArea rows={4} value={wText} onChange={e => setWText((e.target as HTMLTextAreaElement).value)} />
          </Stack>

          <Grid columns={2} gap={3}>
            <Stack space={2}>
              <Text size={1} weight="semibold">Withdrawal date *</Text>
              <TextInput type="date" value={wDate} onChange={e => setWDate((e.target as HTMLInputElement).value)} />
            </Stack>
            <Stack space={2}>
              <Text size={1} weight="semibold">Addendum no.</Text>
              <TextInput placeholder="e.g. A2" value={wAdd} onChange={e => setWAdd((e.target as HTMLInputElement).value)} />
            </Stack>
          </Grid>

          {error && <Card padding={3} radius={2} tone="critical" border><Text size={1}>{error}</Text></Card>}

          <Flex gap={2}>
            {saving
              ? <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Saving…</Text></Flex>
              : <>
                  <Button text="Confirm withdrawal" tone="positive" onClick={submitWithdrawal} />
                  <Button text="Cancel" mode="ghost" onClick={() => { setMode(null); setError(null) }} />
                </>}
          </Flex>
        </Stack>
      </Card>
    )
  }

  // ── Active (nothing recorded yet) ─────────────────────────────────────────
  if (!status || status === 'none') {
    return (
      <Card padding={4} radius={2} tone="default" border>
        <Flex align="center" justify="space-between" gap={3} wrap="wrap">
          <Stack space={2}>
            <Text size={1} weight="semibold">Lease is active</Text>
            <Text size={1} muted>
              {signed === 'signed'
                ? 'Use this button to terminate the lease, to record a notice received from the lessor, or when the term expires without renewal'
                : 'This lease is not signed yet — a termination notice is normally not required'}
            </Text>
          </Stack>
          <Button text="🔴 Terminate lease" tone="critical" onClick={() => setMode('terminate')} />
        </Flex>
        {error && <Card marginTop={3} padding={3} radius={2} tone="critical" border><Text size={1}>{error}</Text></Card>}
      </Card>
    )
  }

  // ── Summary states ────────────────────────────────────────────────────────
  const isDone      = status === 'terminated'
  const isWithdrawn = status === 'withdrawn'
  const reasonText  = TERMINATION_REASONS.find(r => r.value === reasonCd)?.th ?? '—'
  const gap         = daysBetween(noticeVal, effVal)
  const badge       = APPROVAL_BADGE[(isWithdrawn ? wApproval : tApproval) ?? '']

  return (
    <Card padding={4} radius={2} tone={isWithdrawn ? 'positive' : isDone ? 'critical' : 'caution'} border>
      <Stack space={4}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text size={2}>{isWithdrawn ? '🤝' : isDone ? '🔴' : '📤'}</Text>
          <Text size={1} weight="semibold">
            {isWithdrawn ? 'Notice withdrawn — the lease continues'
              : isDone   ? 'Lease terminated'
              : 'Notice given — awaiting the end date'}
          </Text>
          {badge && <Badge tone={badge.tone} radius={2}>{badge.text}</Badge>}
        </Flex>

        <Stack space={2}>
          <Text size={1}>Reason: <strong>{reasonText}</strong></Text>
          <Text size={1} muted>{detailVal ?? '—'}</Text>
          <Text size={1}>
            Terminating party: <strong>{BY_TH[byVal ?? ''] ?? '—'}</strong> ·
            notice <strong>{fmt(noticeVal)}</strong> ·
            ends <strong>{fmt(effVal)}</strong>
            {gap !== null ? ` (${gap} days)` : ''}
          </Text>
          <Text size={1} muted>
            {needDoc === false
              ? 'No letter issued from the system — the other party\'s uploaded letter is the evidence'
              : `Letter issued: ${docTitleFor(byVal ?? 'us')}`}
          </Text>
        </Stack>

        {isWithdrawn && (
          <Card padding={3} radius={2} tone="transparent" border>
            <Stack space={2}>
              <Text size={1} weight="semibold">Negotiation outcome (withdrawn {fmt(wAt)})</Text>
              <Text size={1} muted>{wReason ?? '—'}</Text>
              <Text size={1} muted>Addendum carrying the new terms: <strong>{wAddendum ?? '— not set'}</strong></Text>
              <Text size={1} muted>Remember to adjust the remaining rent in the Billing Periods tab</Text>
            </Stack>
          </Card>
        )}

        {error && <Card padding={3} radius={2} tone="critical" border><Text size={1}>{error}</Text></Card>}

        {confirm === 'finish' && (
          <Card padding={3} radius={2} tone="critical" border>
            <Stack space={3}>
              <Text size={1}>Confirm the lease has ended? It moves to the Terminated group in the menu</Text>
              <Flex gap={2}>
                <Button text="Confirm" tone="critical" disabled={saving}
                  onClick={async () => { if (await patch({ terminationStatus: 'terminated' })) setConfirm(null) }} />
                <Button text="Not now" mode="ghost" onClick={() => setConfirm(null)} />
              </Flex>
            </Stack>
          </Card>
        )}

        {confirm === 'discard' && (
          <Card padding={3} radius={2} tone="critical" border>
            <Stack space={3}>
              <Text size={1}>
                Delete all termination data (use only if entered by mistake — if the negotiation succeeded use "Withdraw notice" instead,
                so the history is kept)
              </Text>
              <Flex gap={2}>
                <Button text="Delete" tone="critical" disabled={saving}
                  onClick={async () => {
                    const ok = await patch({ terminationStatus: 'none' }, [
                      'terminationReasonCode', 'terminationReason', 'terminatedBy',
                      'noticeGivenAt', 'terminationEffectiveDate', 'terminationNoticeRequired',
                      'terminationNumber', 'terminationDate',
                      'withdrawnAt', 'withdrawalReason', 'withdrawalAddendumNo',
                      'withdrawalNumber', 'withdrawalDate',
                    ])
                    if (ok) { setConfirm(null); setCode(''); setDetail(''); setEff(''); setWText('') }
                  }} />
                <Button text="Not now" mode="ghost" onClick={() => setConfirm(null)} />
              </Flex>
            </Stack>
          </Card>
        )}

        {!confirm && (
          <Flex gap={2} wrap="wrap">
            <Button text="✎ Edit details" mode="ghost" onClick={() => {
              setCode(reasonCd ?? ''); setDetail(detailVal ?? '')
              setNotice(noticeVal ?? today()); setEff(effVal ?? '')
              setIssue(needDoc !== false); setMode('terminate')
            }} />
            {!isDone && !isWithdrawn && (
              <>
                <Button text="✓ Confirm lease ended" tone="critical" onClick={() => setConfirm('finish')} />
                <Button text="🤝 Withdraw notice" tone="positive" mode="ghost" onClick={() => setMode('withdraw')} />
              </>
            )}
            {isWithdrawn && (
              <Button text="✎ Edit outcome" mode="ghost" onClick={() => {
                setWText(wReason ?? ''); setWDate(wAt ?? today()); setWAdd(wAddendum ?? ''); setMode('withdraw')
              }} />
            )}
            <Button text="Delete termination data" mode="bleed" tone="critical" onClick={() => setConfirm('discard')} />
          </Flex>
        )}

        <Text size={1} muted>
          Publish → request approval on the <strong>Approval</strong> tab → once approved the letter is generated and e-mailed automatically
        </Text>
      </Stack>
    </Card>
  )
}
