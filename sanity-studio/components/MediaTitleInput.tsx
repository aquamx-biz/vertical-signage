import { useState } from 'react'
import { Stack, Button, Spinner, Flex, Text } from '@sanity/ui'
import { set, useFormValue, useClient } from 'sanity'

// media.title IS the on-screen ad headline. The /offer web form always sets it
// to the OFFER title (promo/service name) — but admins creating media by hand
// kept typing the SHOP name (the shop already shows via its logo + popup),
// leaving two ads with identical headlines. This input aligns the manual flow
// with the web flow: one click pulls the linked offer's title, in the
// document's display language. Translate-from-English stays available too.

type AnyStringInputProps = {
  renderDefault: (props: any) => React.ReactNode
  onChange: (patch: any) => void
  value?: string
}

const TRANSLATE_API_URL =
  process.env.SANITY_STUDIO_TRANSLATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/translate'

export function MediaTitleInput(props: AnyStringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [busy, setBusy]   = useState<'offer' | 'translate' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const offerRef    = (useFormValue(['offer']) as any)?._ref as string | undefined
  const displayLang = useFormValue(['displayLang']) as string | undefined
  const altText     = useFormValue(['altText']) as string | undefined

  const pullFromOffer = async () => {
    if (!offerRef) return
    setBusy('offer'); setError(null)
    try {
      // prefer the draft (freshest edit), then published
      const o = await client.fetch<{ th?: string; en?: string } | null>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){ "th": title_th, "en": title_en }`,
        { id: offerRef },
      )
      const title = displayLang === 'en' ? (o?.en || o?.th) : (o?.th || o?.en)
      if (!title) throw new Error('Offer ที่ผูกไว้ยังไม่มีชื่อ')
      props.onChange(set(title))
    } catch (err: any) {
      setError(err?.message ?? 'ดึงชื่อไม่สำเร็จ')
    } finally { setBusy(null) }
  }

  const translateFromEnglish = async () => {
    if (!altText?.trim()) return
    setBusy('translate'); setError(null)
    try {
      const res  = await fetch(TRANSLATE_API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: altText, sourceLang: 'English', targetLang: 'Thai' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      props.onChange(set(data.translated))
    } catch (err: any) {
      setError(err?.message ?? 'Translation failed')
    } finally { setBusy(null) }
  }

  return (
    <Stack space={2}>
      {props.renderDefault(props)}
      <Flex align="center" gap={2} wrap="wrap">
        {busy ? (
          <><Spinner muted /><Text size={1} muted>{busy === 'offer' ? 'กำลังดึงชื่อ…' : 'Translating…'}</Text></>
        ) : (
          <>
            <Button text="⤵ ดึงชื่อจาก Offer" mode="ghost" tone="primary"
              disabled={!offerRef}
              title={offerRef ? 'ใช้ชื่อโปรโม/บริการจาก Offer ที่ผูกไว้ (ภาษาตาม "ภาษาหลักบนจอ")' : 'ผูก Offer ก่อน'}
              onClick={pullFromOffer} />
            <Button text="✨ Translate from English" mode="ghost" tone="primary"
              disabled={!altText?.trim()}
              title={altText?.trim() ? 'แปลจากช่อง Title (English)' : 'กรอก Title (English) ก่อน'}
              onClick={translateFromEnglish} />
          </>
        )}
      </Flex>
      {error && <Text size={0} style={{ color: '#e05252' }}>{error}</Text>}
    </Stack>
  )
}
