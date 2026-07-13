import { useState } from 'react'
import { useClient } from 'sanity'
import type { DocumentActionProps } from 'sanity'
import { useRouter } from 'sanity/router'
import { useToast } from '@sanity/ui'

/**
 * "สร้าง Media จาก Offer นี้" — one click turns an offer into a ready-to-review
 * media draft. Kills the duplicate work of hand-building media for an offer
 * that already carries everything: the image assets are REUSED by reference
 * (no re-upload), title/displayLang follow the owner's language intent, and
 * the offer link is wired. The draft lands in Pending for Publish like any
 * other edit — nothing airs until the admin publishes + deploys.
 */
const hasThai = (s: string) => /[฀-๿]/.test(s || '')

export function CreateMediaFromOfferAction(props: DocumentActionProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const router = useRouter()
  const toast  = useToast()
  const [busy, setBusy] = useState(false)

  const doc = (props.published ?? props.draft) as Record<string, any> | null
  if (!doc) return null   // brand-new unsaved doc — nothing to copy yet

  return {
    label: busy ? 'กำลังสร้าง…' : '🎬 สร้าง Media จาก Offer นี้',
    tone: 'positive' as const,
    disabled: busy,
    onHandle: async () => {
      setBusy(true)
      try {
        const offerId     = props.id            // base id (no drafts. prefix)
        const displayLang = doc.displayLang || (hasThai(doc.title_th || '') || !doc.title_en ? 'th' : 'en')
        const title = displayLang === 'en'
          ? (doc.title_en || doc.title_th)
          : (doc.title_th || doc.title_en)

        // Reuse the offer's image assets by reference — no re-upload.
        const srcImages = (Array.isArray(doc.images) && doc.images.length)
          ? doc.images
          : (doc.primaryImage ? [doc.primaryImage] : [])
        const imageFiles = srcImages
          .filter((img: any) => img?.asset?._ref)
          .map((img: any, i: number) => ({
            _type: 'image', _key: img._key || `offer-img-${i}`,
            asset: { _type: 'reference', _ref: img.asset._ref },
          }))

        const mediaId = `drafts.${crypto.randomUUID()}`
        await client.create({
          _id:   mediaId,
          _type: 'media',
          kind:  'promo',
          type:  'image',
          displayLang,
          title: title || '(ไม่มีชื่อ)',
          ...(imageFiles.length ? { imageFiles } : {}),
          defaultImageDuration: 10,
          // weak: the offer may still be draft-only — a strong ref would be rejected
          offer: { _type: 'reference', _ref: offerId, _weak: true },
          scope: doc.scope || 'global',
          ...(Array.isArray(doc.projects) && doc.projects.length ? { projects: doc.projects } : {}),
          isActive: true,
          addToPlaylistOnPublish: false,
        })

        toast.push({
          status: 'success',
          title: 'สร้าง Media draft แล้ว',
          description: imageFiles.length
            ? `ดึงรูป ${imageFiles.length} รูป + ชื่อ (${displayLang}) จาก offer ให้แล้ว — ตรวจ แล้ว publish ผ่าน Pending`
            : 'offer นี้ไม่มีรูป — เพิ่มรูปใน media เองก่อน publish',
        })
        router.navigateIntent('edit', { id: mediaId.replace(/^drafts\./, ''), type: 'media' })
      } catch (err: any) {
        toast.push({ status: 'error', title: 'สร้างไม่สำเร็จ', description: err?.message ?? String(err) })
      } finally {
        setBusy(false)
        props.onComplete()
      }
    },
  }
}
