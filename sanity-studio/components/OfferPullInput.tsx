import { useState } from 'react'
import { Stack, Button, Flex, Text, useToast } from '@sanity/ui'
import { useClient, useFormValue, useDocumentOperation } from 'sanity'

/**
 * Input for media.offer — the reverse of the Offer-Overview create button.
 * Media and offers can be handled by different people, or the admin may start
 * from the media side: pick the offer here, press the button, and the empty
 * fields (title / displayLang / imageFiles) fill from that offer. Image assets
 * are reused by reference — never re-uploaded. Fields the admin already filled
 * are NEVER overwritten; the toast says exactly what was pulled vs kept.
 */
type RefInputProps = {
  renderDefault: (props: any) => React.ReactNode
  value?: { _ref?: string }
}

export function OfferPullInput(props: RefInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const toast  = useToast()

  const docId   = String(useFormValue(['_id']) || '').replace(/^drafts\./, '')
  const title   = useFormValue(['title']) as string | undefined
  const dLang   = useFormValue(['displayLang']) as string | undefined
  const imgs    = useFormValue(['imageFiles']) as any[] | undefined
  const prov    = useFormValue(['provider']) as { _ref?: string } | undefined
  const mType   = useFormValue(['type']) as string | undefined
  const endCard = useFormValue(['endCardImage']) as { asset?: { _ref?: string } } | undefined
  const { patch } = useDocumentOperation(docId, 'media')

  const [busy, setBusy] = useState(false)
  const offerRef = props.value?._ref

  async function pullFromOffer() {
    if (!offerRef) return
    setBusy(true)
    try {
      // prefer the draft — freshest edit wins
      const o = await client.fetch<Record<string, any> | null>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
          title_th, title_en, displayLang, images, primaryImage, scope, projects,
          "providerRef": provider._ref,
          "providerPublished": defined(*[_id == ^.provider._ref][0]._id)
        }`, { id: offerRef },
      )
      if (!o) throw new Error('หา offer ไม่เจอ')

      const lang   = o.displayLang || (/[฀-๿]/.test(o.title_th || '') || !o.title_en ? 'th' : 'en')
      const oTitle = lang === 'en' ? (o.title_en || o.title_th) : (o.title_th || o.title_en)
      const srcImages = (Array.isArray(o.images) && o.images.length)
        ? o.images
        : (o.primaryImage ? [o.primaryImage] : [])
      const imageFiles = srcImages
        .filter((img: any) => img?.asset?._ref)
        .map((img: any, i: number) => ({
          _type: 'image', _key: img._key || `offer-img-${i}`,
          asset: { _type: 'reference', _ref: img.asset._ref },   // reuse asset — no re-upload
        }))

      // fill ONLY empty fields — never clobber what the admin typed
      const set: Record<string, any> = {}
      const pulled: string[] = [], kept: string[] = []
      if (!title?.trim() || title === '(ไม่มีชื่อ)') { if (oTitle) { set.title = oTitle; pulled.push('ชื่อ') } } else kept.push('ชื่อ')
      if (!dLang) { set.displayLang = lang; pulled.push('ภาษา') } else kept.push('ภาษา')
      if (mType === 'video') {
        // video media: don't touch imageFiles (video has none) — instead pull
        // the offer's main image into endCardImage so the admin SEES the end
        // card, can clear it and upload their own. Same only-if-empty rule.
        const mainRef = (o.primaryImage?.asset?._ref) || (srcImages[0]?.asset?._ref)
        if (!endCard?.asset?._ref) {
          if (mainRef) { set.endCardImage = { _type: 'image', asset: { _type: 'reference', _ref: mainRef } }; pulled.push('รูปปิดท้าย') }
        } else kept.push('รูปปิดท้าย')
      } else if (!imgs?.length) { if (imageFiles.length) { set.imageFiles = imageFiles; set.type = 'image'; pulled.push(`รูป ×${imageFiles.length}`) } } else kept.push('รูป')
      // strong when the provider is published (schema expects strong — no mismatch
      // warning, delete-protection intact); weak only while it's still a draft
      // (a strong ref to an unpublished doc is rejected on save)
      if (!prov?._ref) { if (o.providerRef) { set.provider = { _type: 'reference', _ref: o.providerRef, ...(o.providerPublished ? {} : { _weak: true }) }; pulled.push('ร้าน') } } else kept.push('ร้าน')

      if (!Object.keys(set).length) {
        toast.push({ status: 'info', title: 'ไม่ได้ทับอะไร', description: 'ทุกช่องมีข้อมูลอยู่แล้ว — ลบช่องที่อยากดึงใหม่ก่อน แล้วกดอีกครั้ง' })
        return
      }
      patch.execute([{ set }])
      toast.push({ status: 'success', title: `ดึงจาก offer แล้ว: ${pulled.join(' · ')}`,
        description: kept.length ? `คงของเดิมไว้: ${kept.join(' · ')}` : undefined })
    } catch (err: any) {
      toast.push({ status: 'error', title: 'ดึงข้อมูลไม่สำเร็จ', description: err?.message ?? String(err) })
    } finally { setBusy(false) }
  }

  return (
    <Stack space={2}>
      {props.renderDefault(props)}
      <Flex align="center" gap={2}>
        <Button
          text={busy ? '⏳ Pulling…' : '⤵ Pull from Offer (ดึงรูป/ชื่อ/ภาษา/ร้าน — วิดีโอ: รูปปิดท้าย)'}
          mode="ghost" tone="primary" fontSize={1}
          disabled={!offerRef || busy}
          title={offerRef ? 'Fills only empty fields — never overwrites what you typed · เติมเฉพาะช่องที่ยังว่าง (รูปใช้ไฟล์เดิม ไม่อัปโหลดซ้ำ) · video media pulls the offer image into End Card' : 'Pick an Offer first · เลือก Offer ก่อน'}
          onClick={pullFromOffer}
        />
        {!offerRef && <Text size={0} muted>Pick an Offer first — this button then pulls its data in · เลือก Offer ก่อน</Text>}
      </Flex>
    </Stack>
  )
}
