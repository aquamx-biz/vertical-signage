import { useState } from 'react'
import { Box, Button, Card, Flex, Spinner, Stack, Text, Badge, Heading, TextInput } from '@sanity/ui'
import { useToast } from '@sanity/ui'

const API_BASE =
  process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app'

type DocType = string

interface Props {
  document: {
    draft:     Record<string, any> | null
    published: Record<string, any> | null
    displayed: Record<string, any>
  }
  documentId:  string
  schemaType?: { name: string; title?: string }
}

function StatusBadge({ status }: { status: string | undefined }) {
  if (!status || status === 'not_requested') return <Badge tone="default"  radius={2}>— Not Requested</Badge>
  if (status === 'pending')                  return <Badge tone="caution"  radius={2}>⏳ Pending Approval</Badge>
  if (status === 'approved')                 return <Badge tone="positive" radius={2}>✓ Approved</Badge>
  if (status === 'rejected')                 return <Badge tone="critical" radius={2}>✗ Rejected</Badge>
  if (status === 'reset')                    return <Badge tone="caution"  radius={2}>⚠ Reset — Needs Re-approval</Badge>
  return <Badge radius={2}>{status}</Badge>
}

function fmtDate(iso: string | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ── Single-step approval (for non-contract document types) ───────────────────

function SingleStepApproval({
  d, documentId, isPublished, hasDraft,
}: {
  d: Record<string, any>
  documentId: string
  isPublished: boolean
  hasDraft: boolean
}) {
  const [requesting, setRequesting]   = useState(false)
  const [cancelling, setCancelling]   = useState(false)
  const [notifyEmail, setNotifyEmail] = useState<string>(d.notificationEmail ?? '')
  const toast = useToast()

  const status      = (d.approvalStatus ?? 'not_requested') as string
  const resetReason = d.approvalResetReason as string | undefined
  const emailValid  = isValidEmail(notifyEmail)

  const requestApproval = async () => {
    setRequesting(true)
    try {
      const res  = await fetch(`${API_BASE}/api/request-approval`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId, documentType: d._type, notificationEmail: notifyEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      toast.push({ status: 'success', title: 'Approval requested', description: data.message, duration: 6000 })
    } catch (err: any) {
      toast.push({ status: 'error', title: 'Request failed', description: err?.message ?? 'Unknown error', duration: 8000 })
    } finally {
      setRequesting(false)
    }
  }

  const cancelApproval = async () => {
    setCancelling(true)
    try {
      const res  = await fetch(`${API_BASE}/api/cancel-approval`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId, documentType: d._type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      toast.push({ status: 'success', title: 'Approval cancelled', duration: 6000 })
    } catch (err: any) {
      toast.push({ status: 'error', title: 'Cancel failed', description: err?.message ?? 'Unknown error', duration: 8000 })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        <Stack space={2}>
          <Heading size={2}>Approval Workflow</Heading>
          <Text size={1} muted>Request approval for this document. All configured stages must be approved sequentially.</Text>
        </Stack>

        {!isPublished && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={1}>Publish this document first before requesting approval.</Text>
          </Card>
        )}
        {isPublished && hasDraft && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={1}>You have unpublished changes. Publish first so approvers see the latest data.</Text>
          </Card>
        )}

        {/* Notification Email */}
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={3}>
            <Text weight="semibold" size={2}>Notification Email</Text>
            <Text size={1} muted>Enter your email to receive a notification when fully approved.</Text>
            <TextInput
              type="email"
              placeholder="yourname@company.com"
              value={notifyEmail}
              onChange={e => setNotifyEmail((e.target as HTMLInputElement).value)}
              customValidity={notifyEmail && !emailValid ? 'Please enter a valid email address.' : undefined}
            />
            {d.notificationEmail && d.notificationEmail !== notifyEmail && (
              <Text size={0} muted>Previously used: {d.notificationEmail}</Text>
            )}
          </Stack>
        </Card>

        {/* Approval Status */}
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Flex align="center" gap={3}>
              <Text weight="semibold" size={2}>Approval</Text>
              <StatusBadge status={status} />
            </Flex>

            {status === 'approved' && d.approvedAt && (
              <Text size={1} muted>Approved on {fmtDate(d.approvedAt)}</Text>
            )}

            {status === 'rejected' && (
              <Card padding={3} radius={2} tone="critical" border>
                <Stack space={2}>
                  <Text size={1} weight="semibold">Document was rejected.</Text>
                  {resetReason && <Text size={1}>Reason: {resetReason}</Text>}
                  <Text size={1}>Edit the document and request approval again.</Text>
                </Stack>
              </Card>
            )}

            {(status === 'not_requested' || status === 'reset' || status === 'rejected') && (
              requesting ? (
                <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Sending…</Text></Flex>
              ) : (
                <Stack space={2}>
                  {!emailValid && (
                    <Text size={1} muted style={{ fontStyle: 'italic' }}>Fill in a valid notification email above to enable this button.</Text>
                  )}
                  <Button
                    text="Request Approval"
                    tone="primary"
                    disabled={!isPublished || requesting || !emailValid}
                    onClick={requestApproval}
                  />
                </Stack>
              )
            )}

            {status === 'pending' && (
              <Stack space={3}>
                <Text size={1} muted style={{ fontStyle: 'italic' }}>
                  Awaiting approver response. Status will update here once approved.
                </Text>
                {cancelling ? (
                  <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Cancelling…</Text></Flex>
                ) : (
                  <Button
                    text="Cancel Pending Approval"
                    tone="critical"
                    mode="ghost"
                    disabled={requesting || cancelling}
                    onClick={cancelApproval}
                  />
                )}
              </Stack>
            )}
          </Stack>
        </Card>

        <Text size={0} muted>Approval history is recorded in the Approval Requests section of the Studio.</Text>
      </Stack>
    </Card>
  )
}

// ── Two-step contract approval (existing flow) ───────────────────────────────

export function ApprovalView({ document: doc, documentId, schemaType }: Props) {
  const [requesting, setRequesting] = useState<DocType | null>(null)
  const [cancelling, setCancelling] = useState<DocType | null>(null)
  const toast = useToast()

  const isPublished = !documentId.startsWith('drafts.')
  const hasDraft    = doc.draft !== null
  const d           = doc.displayed

  // Non-contract types use the single-step flow
  if (schemaType?.name !== 'contract') {
    return <SingleStepApproval d={d} documentId={documentId} isPublished={isPublished} hasDraft={hasDraft} />
  }

  const qStatus     = (d.quotationApprovalStatus ?? 'not_requested') as string
  const cStatus     = (d.contractApprovalStatus  ?? 'not_requested') as string
  const resetReason = d.approvalResetReason as string | undefined

  const [notifyEmail, setNotifyEmail] = useState<string>(d.notificationEmail ?? '')

  const quotationApproved = qStatus === 'approved'
  const emailValid        = isValidEmail(notifyEmail)

  const requestApproval = async (documentType: DocType) => {
    setRequesting(documentType)
    try {
      const res  = await fetch(`${API_BASE}/api/request-approval`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId, documentType, notificationEmail: notifyEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      toast.push({ status: 'success', title: 'Approval requested', description: data.message ?? 'Email sent to approver.', duration: 6000 })
    } catch (err: any) {
      toast.push({ status: 'error', title: 'Request failed', description: err?.message ?? 'Unknown error', duration: 8000 })
    } finally {
      setRequesting(null)
    }
  }

  const cancelApproval = async (documentType: DocType) => {
    setCancelling(documentType)
    try {
      const res  = await fetch(`${API_BASE}/api/cancel-approval`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId, documentType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      toast.push({ status: 'success', title: 'Approval cancelled', description: 'You can now request approval again.', duration: 6000 })
    } catch (err: any) {
      toast.push({ status: 'error', title: 'Cancel failed', description: err?.message ?? 'Unknown error', duration: 8000 })
    } finally {
      setCancelling(null)
    }
  }

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        <Stack space={2}>
          <Heading size={2}>Approval Workflow</Heading>
          <Text size={1} muted>
            Quotation must be approved before contract approval can be requested.
            Generation is locked until all required approvals are complete.
          </Text>
        </Stack>

        {!isPublished && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={1}>Publish this document first before requesting approval.</Text>
          </Card>
        )}
        {isPublished && hasDraft && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={1}>You have unpublished changes. Publish first so approvers see the latest data.</Text>
          </Card>
        )}

        {resetReason && (qStatus === 'reset' || cStatus === 'reset') && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={1}>⚠ Approval was reset: <strong>{resetReason}</strong>. Please request approval again.</Text>
          </Card>
        )}

        {/* Notification Email */}
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={3}>
            <Stack space={2}>
              <Text weight="semibold" size={2}>Notification Email</Text>
              <Text size={1} muted>Enter your email to receive the approved document automatically. Required before requesting approval.</Text>
            </Stack>
            <TextInput
              type="email"
              placeholder="yourname@company.com"
              value={notifyEmail}
              onChange={e => setNotifyEmail((e.target as HTMLInputElement).value)}
              customValidity={notifyEmail && !emailValid ? 'Please enter a valid email address.' : undefined}
            />
            {notifyEmail && !emailValid && (
              <Text size={1} style={{ color: '#e05252' }}>Please enter a valid email address.</Text>
            )}
            {d.notificationEmail && d.notificationEmail !== notifyEmail && (
              <Text size={0} muted>Previously used: {d.notificationEmail}</Text>
            )}
          </Stack>
        </Card>

        {/* Quotation Approval */}
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Flex align="center" gap={3}>
              <Text weight="semibold" size={2}>Step 1 — Quotation Approval</Text>
              <StatusBadge status={qStatus} />
            </Flex>
            {qStatus === 'approved' && d.quotationApprovedAt && (
              <Text size={1} muted>Approved on {fmtDate(d.quotationApprovedAt)}</Text>
            )}
            {qStatus === 'rejected' && (
              <Card padding={3} radius={2} tone="critical" border>
                <Stack space={2}>
                  <Text size={1} weight="semibold">Quotation was rejected.</Text>
                  {resetReason && <Text size={1}>Reason: {resetReason}</Text>}
                  <Text size={1}>Edit the document and request approval again.</Text>
                </Stack>
              </Card>
            )}
            {(qStatus === 'not_requested' || qStatus === 'reset' || qStatus === 'rejected') && (
              requesting === 'quotation' ? (
                <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Sending…</Text></Flex>
              ) : (
                <Stack space={2}>
                  {!emailValid && <Text size={1} muted style={{ fontStyle: 'italic' }}>Fill in a valid notification email above to enable this button.</Text>}
                  <Button text="Request Quotation Approval" tone="primary" disabled={!isPublished || requesting !== null || !emailValid} onClick={() => requestApproval('quotation')} />
                </Stack>
              )
            )}
            {qStatus === 'pending' && (
              <Stack space={3}>
                <Text size={1} muted style={{ fontStyle: 'italic' }}>Awaiting approver response. You will see the status update here once approved.</Text>
                {cancelling === 'quotation' ? (
                  <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Cancelling…</Text></Flex>
                ) : (
                  <Button text="Cancel Pending Approval" tone="critical" mode="ghost" disabled={requesting !== null || cancelling !== null} onClick={() => cancelApproval('quotation')} />
                )}
              </Stack>
            )}
          </Stack>
        </Card>

        {/* Contract Approval */}
        <Card padding={4} radius={2} shadow={1} tone={quotationApproved ? 'default' : 'transparent'}>
          <Stack space={4}>
            <Flex align="center" gap={3}>
              <Text weight="semibold" size={2} style={{ opacity: quotationApproved ? 1 : 0.45 }}>Step 2 — Contract Approval</Text>
              {quotationApproved
                ? <StatusBadge status={cStatus} />
                : <Badge tone="default" radius={2}>🔒 Locked until quotation is approved</Badge>
              }
            </Flex>
            {!quotationApproved && <Text size={1} muted>Complete Step 1 first.</Text>}
            {quotationApproved && cStatus === 'approved' && d.contractApprovedAt && (
              <Text size={1} muted>Approved on {fmtDate(d.contractApprovedAt)}</Text>
            )}
            {quotationApproved && cStatus === 'rejected' && (
              <Card padding={3} radius={2} tone="critical" border>
                <Stack space={2}>
                  <Text size={1} weight="semibold">Contract was rejected.</Text>
                  {resetReason && <Text size={1}>Reason: {resetReason}</Text>}
                  <Text size={1}>Edit the document and request approval again.</Text>
                </Stack>
              </Card>
            )}
            {quotationApproved && (cStatus === 'not_requested' || cStatus === 'reset' || cStatus === 'rejected') && (
              requesting === 'contract' ? (
                <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Sending…</Text></Flex>
              ) : (
                <Stack space={2}>
                  {!emailValid && <Text size={1} muted style={{ fontStyle: 'italic' }}>Fill in a valid notification email above to enable this button.</Text>}
                  <Button text="Request Contract Approval" tone="primary" disabled={!isPublished || requesting !== null || !emailValid} onClick={() => requestApproval('contract')} />
                </Stack>
              )
            )}
            {quotationApproved && cStatus === 'pending' && (
              <Stack space={3}>
                <Text size={1} muted style={{ fontStyle: 'italic' }}>Awaiting approver response.</Text>
                {cancelling === 'contract' ? (
                  <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Cancelling…</Text></Flex>
                ) : (
                  <Button text="Cancel Pending Approval" tone="critical" mode="ghost" disabled={requesting !== null || cancelling !== null} onClick={() => cancelApproval('contract')} />
                )}
              </Stack>
            )}
          </Stack>
        </Card>

        {/* Termination / withdrawal — outside the quotation → contract chain */}
        {(() => {
          const tStatus = d.terminationStatus as string | undefined
          if (!tStatus || tStatus === 'none') return null

          const isWithdrawal = tStatus === 'withdrawn'
          const docType      = isWithdrawal ? 'withdrawal' : 'termination'
          const status       = (isWithdrawal ? d.withdrawalApprovalStatus : d.terminationApprovalStatus) as string | undefined
          const approvedAt   = isWithdrawal ? d.withdrawalApprovedAt      : d.terminationApprovedAt
          const st           = status ?? 'not_requested'
          const title        = isWithdrawal ? 'Step 3 — Withdrawal Approval'
                                            : 'Step 3 — Termination Approval'
          const docNo        = (isWithdrawal ? d.withdrawalNumber : d.terminationNumber) as string | undefined
          const noOwnLetter  = !isWithdrawal && d.terminationNoticeRequired === false

          return (
            <Card padding={4} radius={2} shadow={1}>
              <Stack space={4}>
                <Flex align="center" gap={3}>
                  <Text weight="semibold" size={2}>{title}</Text>
                  <StatusBadge status={st} />
                </Flex>

                <Text size={1} muted>
                  {noOwnLetter
                    ? 'No letter issued from the system — upload the other party\'s letter on the Termination tab before requesting approval'
                    : docNo
                      ? `Letter no. ${docNo} — once approved the document is generated and e-mailed automatically`
                      : 'Use Generate Number on the Termination tab to issue a letter number before requesting approval'}
                </Text>

                {st === 'approved' && approvedAt && (
                  <Text size={1} muted>Approved on {fmtDate(approvedAt as string)}</Text>
                )}

                {st === 'rejected' && (
                  <Card padding={3} radius={2} tone="critical" border>
                    <Stack space={2}>
                      <Text size={1} weight="semibold">Rejected</Text>
                      <Text size={1}>Edit the details on the Termination tab and request approval again</Text>
                    </Stack>
                  </Card>
                )}

                {(st === 'not_requested' || st === 'reset' || st === 'rejected') && (
                  requesting === docType ? (
                    <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Sending…</Text></Flex>
                  ) : (
                    <Stack space={2}>
                      {!emailValid && <Text size={1} muted style={{ fontStyle: 'italic' }}>Fill in a valid notification email above to enable this button.</Text>}
                      <Button
                        text={isWithdrawal ? 'Request Withdrawal Approval' : 'Request Termination Approval'}
                        tone="primary"
                        disabled={!isPublished || requesting !== null || !emailValid}
                        onClick={() => requestApproval(docType)}
                      />
                    </Stack>
                  )
                )}

                {st === 'pending' && (
                  <Stack space={3}>
                    <Text size={1} muted style={{ fontStyle: 'italic' }}>Awaiting approver response.</Text>
                    {cancelling === docType ? (
                      <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Cancelling…</Text></Flex>
                    ) : (
                      <Button text="Cancel Pending Approval" tone="critical" mode="ghost"
                        disabled={requesting !== null || cancelling !== null}
                        onClick={() => cancelApproval(docType)} />
                    )}
                  </Stack>
                )}
              </Stack>
            </Card>
          )
        })()}

        <Text size={0} muted>Approval history is recorded in the Approval Requests section of the Studio.</Text>
      </Stack>
    </Card>
  )
}
