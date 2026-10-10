/**
 * Ad Contract document actions.
 *
 * New Revision — a contract that has been SENT is locked (its wording and
 *   numbers are what the customer received). To change it: New Revision puts it
 *   back to Draft with the revision number +1; the next Send issues Rev.N+1 and
 *   keeps the earlier PDF in Issued Versions. Not offered once signed — a signed
 *   contract changes by addendum (clause 7.4), never by editing.
 *
 * Load Template Wording — copies the wording of the chosen (or active) Legal Form (Ad Contract)
 *   version into this contract. Only while the contract is a Draft; replaces the
 *   contract's current wording, so it asks first.
 */
import { useState } from 'react'
import { useClient, type DocumentActionProps, type DocumentActionDescription } from 'sanity'
import { useToast } from '@sanity/ui'

const API_VERSION = '2024-01-01'

export function NewRevisionAction(props: DocumentActionProps): DocumentActionDescription | null {
  const client = useClient({ apiVersion: API_VERSION })
  const toast  = useToast()
  const doc    = (props.draft ?? props.published) as any
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!doc || doc.status !== 'sent') return null
  const next = Number(doc.revision ?? 1) + 1

  return {
    label:    `New Revision (Rev.${next})`,
    tone:     'caution' as any,
    disabled: busy,
    onHandle: () => setOpen(true),
    dialog:   (open && {
      type:    'confirm',
      tone:    'caution' as any,
      message: `Unlock ${doc.adContractNumber ?? doc.quoteNumber ?? 'this document'} for editing as Rev.${next}? Rev.${next - 1} stays on record in Issued Versions; the customer gets Rev.${next} only when you Send again.`,
      onCancel:  () => setOpen(false),
      onConfirm: async () => {
        setBusy(true)
        try {
          const id = props.id.replace(/^drafts\./, '')
          const tx = client.transaction().patch(id, p => p.set({ status: 'draft', revision: next }))
          if (props.draft) tx.patch(`drafts.${id}`, p => p.set({ status: 'draft', revision: next }))
          await tx.commit()
          toast.push({ status: 'success', title: `Rev.${next} — unlocked for editing` })
        } catch (e: any) {
          toast.push({ status: 'error', title: 'Could not start a new revision', description: e?.message })
        } finally {
          setBusy(false); setOpen(false); props.onComplete()
        }
      },
    }) as any,
  }
}

export function LoadTemplateAction(props: DocumentActionProps): DocumentActionDescription | null {
  const client = useClient({ apiVersion: API_VERSION })
  const toast  = useToast()
  const doc    = (props.draft ?? props.published) as any
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!doc || (doc.status && doc.status !== 'draft')) return null

  return {
    label:    'Load Template Wording',
    disabled: busy,
    onHandle: () => setOpen(true),
    dialog:   (open && {
      type:    'confirm',
      message: 'Replace this contract\'s wording with the template\'s? Any per-deal edits to the clauses will be lost.',
      onCancel:  () => setOpen(false),
      onConfirm: async () => {
        setBusy(true)
        try {
          const tpl = await client.fetch(
            `coalesce(*[_type == "legalForm" && formType == "adContract" && _id == $ref][0], *[_type == "legalForm" && formType == "adContract" && status == "active" && !(_id in path("drafts.**"))] | order(version desc)[0]){ _id, version, "intro": th.intro, "clauses": th.clauses, "closing": th.closing }`,
            { ref: doc.template?._ref ?? '' },
          )
          if (!tpl) throw new Error('No template found — create and activate a Legal Form of type Ad Contract first.')
          const id = props.id.replace(/^drafts\./, '')
          const { _rev, _createdAt, _updatedAt, ...base } = (props.published ?? {}) as any
          void _rev; void _createdAt; void _updatedAt
          await client.createIfNotExists({ ...base, _id: `drafts.${id}`, _type: 'adContract' })
          await client.patch(`drafts.${id}`).set({
            template: { _type: 'reference', _ref: tpl._id.replace(/^drafts\./, '') },
            templateVersion: tpl.version, intro: tpl.intro, clauses: tpl.clauses ?? [], closing: tpl.closing,
          }).commit()
          toast.push({ status: 'success', title: `Loaded template v${tpl.version}`, description: 'Publish to make it live.' })
        } catch (e: any) {
          toast.push({ status: 'error', title: 'Could not load the template', description: e?.message })
        } finally {
          setBusy(false); setOpen(false); props.onComplete()
        }
      },
    }) as any,
  }
}
