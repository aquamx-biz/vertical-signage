/**
 * QuotationSendView — the "Send" tab on a quotation.
 *
 * Nothing reaches the customer from this screen without a team member pressing
 * Confirm. Flow: pick channel (LINE / Email) and language → the handoff API
 * returns a preview (recipient from the Party record, subject, message, PDF
 * link) → edit if needed → Confirm send. The API then pushes the LINE card or
 * emails the PDF, sets status = Sent, logs correspondence[] and tells the
 * aquamx-shop group.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Badge, Box, Button, Card, Flex, Inline, Radio, Stack, Text, TextArea, TextInput, useToast } from '@sanity/ui'
import { useCurrentUser } from 'sanity'

const API_URL =
  process.env.SANITY_STUDIO_QUOTATION_SEND_API_URL ??
  'https://aquamx-handoff.netlify.app/api/quotation-send'

type Channel = 'line' | 'email'
type Lang    = 'th' | 'en'

type Preview = {
  quotationId: string; quoteNumber: string; status?: string; channel: Channel; lang: Lang
  to: string; cc: string[]; subject: string; message: string; pdfUrl: string; pageUrl: string
  customer: string; partyEmail: string | null; partyLineUserId: string | null
}

type Correspondence = {
  _key: string; sentAt?: string; channel?: string; lang?: string; to?: string; subject?: string; sentBy?: string
}

export function QuotationSendView(props: {
  document: { displayed: { _id?: string; quoteNumber?: string; status?: string; correspondence?: Correspondence[] } }
}) {
  const doc   = props.document?.displayed
  const id    = doc?._id?.replace(/^drafts\./, '')
  const toast = useToast()
  const user  = useCurrentUser()

  const [channel, setChannel] = useState<Channel>('line')
  const [lang, setLang]       = useState<Lang>('th')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [to, setTo]           = useState('')
  const [cc, setCc]           = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState<string | null>(null)
  const [armed, setArmed]     = useState(false)

  const loadPreview = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null); setDone(null)
    try {
      const res  = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotationId: id, channel, lang }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      const p = json.preview as Preview
      setArmed(false); setPreview(p); setTo(p.to ?? ''); setCc(''); setSubject(p.subject ?? ''); setMessage(p.message ?? '')
    } catch (e: any) {
      setPreview(null); setError(e?.message ?? 'Could not load preview')
    } finally {
      setLoading(false)
    }
  }, [id, channel, lang])

  useEffect(() => { loadPreview() }, [loadPreview])

  const send = async () => {
    if (!id || !preview) return
    const label = channel === 'line' ? `LINE user ${to}` : `email ${to}`
    setArmed(false)
    setSending(true); setError(null)
    try {
      const res  = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotationId: id, channel, lang, to, subject, message, confirm: true,
          cc: cc.split(/[,\s]+/).map(s => s.trim()).filter(Boolean),
          sentBy: user?.name ?? user?.email ?? undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setDone(`Sent to ${label} at ${new Date(json.sentAt).toLocaleString()}`)
      toast.push({ status: 'success', title: `Quotation ${preview.quoteNumber} sent`, description: label })
    } catch (e: any) {
      setError(e?.message ?? 'Send failed')
      toast.push({ status: 'error', title: 'Send failed', description: e?.message })
    } finally {
      setSending(false)
    }
  }

  if (!id) {
    return <Card padding={3} radius={3} tone="caution"><Text size={1}>Save the document first.</Text></Card>
  }

  const log = (doc?.correspondence ?? []).slice().reverse()
  const recipientMissing = !to

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            📤 Send quotation — {doc?.quoteNumber ?? '(no number)'}
          </Text>
          <Badge tone={doc?.status === 'sent' ? 'positive' : 'default'} mode="outline">status: {doc?.status ?? 'draft'}</Badge>
        </Flex>

        <Card padding={3} radius={3} tone="transparent" border>
          <Stack space={3}>
            <Flex gap={4} wrap="wrap">
              <Stack space={2}>
                <Text size={1} weight="semibold">Channel</Text>
                <Inline space={3}>
                  <Flex align="center" gap={2}><Radio checked={channel === 'line'} onChange={() => setChannel('line')} name="ch" value="line" /><Text size={1}>LINE</Text></Flex>
                  <Flex align="center" gap={2}><Radio checked={channel === 'email'} onChange={() => setChannel('email')} name="ch" value="email" /><Text size={1}>Email (PDF attached)</Text></Flex>
                </Inline>
              </Stack>
              <Stack space={2}>
                <Text size={1} weight="semibold">Language</Text>
                <Inline space={3}>
                  <Flex align="center" gap={2}><Radio checked={lang === 'th'} onChange={() => setLang('th')} name="lg" value="th" /><Text size={1}>Thai</Text></Flex>
                  <Flex align="center" gap={2}><Radio checked={lang === 'en'} onChange={() => setLang('en')} name="lg" value="en" /><Text size={1}>English</Text></Flex>
                </Inline>
              </Stack>
            </Flex>

            {loading && <Text size={1} muted>Loading preview…</Text>}
            {error && <Card padding={3} radius={2} tone="critical"><Text size={1}>{error}</Text></Card>}

            {preview && !loading && (
              <Stack space={3}>
                <Text size={1} muted>Customer: <b>{preview.customer}</b> · PDF: <a href={preview.pdfUrl} target="_blank" rel="noreferrer">{preview.pdfUrl}</a></Text>

                <Stack space={2}>
                  <Text size={1} weight="semibold">{channel === 'line' ? 'LINE user ID' : 'To (email)'}</Text>
                  <TextInput value={to} onChange={e => setTo(e.currentTarget.value)} placeholder={channel === 'line' ? 'U… (from the Party record)' : 'name@company.com'} />
                  {recipientMissing && (
                    <Text size={1} style={{ color: '#b54708' }}>
                      The Party record has no {channel === 'line' ? 'LINE User ID' : 'email'} — fill it in here, or add it to the Party first.
                    </Text>
                  )}
                </Stack>

                {channel === 'email' && (
                  <>
                    <Stack space={2}>
                      <Text size={1} weight="semibold">Cc (optional, comma-separated)</Text>
                      <TextInput value={cc} onChange={e => setCc(e.currentTarget.value)} placeholder="colleague@company.com" />
                    </Stack>
                    <Stack space={2}>
                      <Text size={1} weight="semibold">Subject</Text>
                      <TextInput value={subject} onChange={e => setSubject(e.currentTarget.value)} />
                    </Stack>
                  </>
                )}

                <Stack space={2}>
                  <Text size={1} weight="semibold">{channel === 'line' ? 'Message on the LINE card' : 'Email body'}</Text>
                  <TextArea rows={channel === 'line' ? 4 : 10} value={message} onChange={e => setMessage(e.currentTarget.value)} />
                  {channel === 'line' && (
                    <Text size={1} muted>The card also shows customer, total, valid-until and two buttons: “{lang === 'th' ? 'เปิดใบเสนอราคา (PDF)' : 'Open quotation (PDF)'}” and “{lang === 'th' ? 'ดูบนเว็บ' : 'View on web'}”.</Text>
                  )}
                </Stack>

                {!armed ? (
                  <Flex gap={2} align="center">
                    <Button tone="primary" text={`Send via ${channel === 'line' ? 'LINE' : 'email'}…`} disabled={sending || recipientMissing} onClick={() => setArmed(true)} />
                    <Button mode="ghost" text="Reload preview" disabled={sending} onClick={loadPreview} />
                  </Flex>
                ) : (
                  <Card padding={3} radius={2} tone="caution">
                    <Stack space={3}>
                      <Text size={1} weight="semibold">
                        Send quotation {preview.quoteNumber} ({lang.toUpperCase()}) to {channel === 'line' ? `LINE user ${to}` : to}? This reaches the customer immediately.
                      </Text>
                      <Flex gap={2}>
                        <Button tone="critical" text={sending ? 'Sending…' : 'Confirm send'} disabled={sending} onClick={send} />
                        <Button mode="ghost" text="Cancel" disabled={sending} onClick={() => setArmed(false)} />
                      </Flex>
                    </Stack>
                  </Card>
                )}
                {done && <Card padding={3} radius={2} tone="positive"><Text size={1}>{done}. Status set to Sent — refresh the Edit tab to see the log.</Text></Card>}
                <Text size={0} muted>Sends the PUBLISHED version of this quotation. Publish first if you changed anything.</Text>
              </Stack>
            )}
          </Stack>
        </Card>

        <Stack space={2}>
          <Text size={1} weight="semibold">Correspondence log</Text>
          {log.length === 0 && <Text size={1} muted>Nothing sent yet.</Text>}
          {log.map(c => (
            <Card key={c._key} padding={3} radius={2} border>
              <Text size={1}>
                {c.sentAt ? new Date(c.sentAt).toLocaleString() : '-'} · {c.channel?.toUpperCase()} · {c.lang?.toUpperCase()} · {c.to}
                {c.sentBy ? ` · by ${c.sentBy}` : ''}{c.subject ? ` · ${c.subject}` : ''}
              </Text>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}
