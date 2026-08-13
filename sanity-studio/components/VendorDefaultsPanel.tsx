/**
 * VendorDefaultsPanel — payment 4.1b "Vendor Memory"
 *
 * Sits right under the GL Account step. Shows the linked vendor's stored
 * defaults (party Financial tab: defaultGlAccount / defaultVatType /
 * defaultWhtRate / defaultExpenseNote) and offers one button that copies THIS
 * payment's current values onto the vendor as its new defaults.
 *
 * The loop this closes: extract fills a payment from vendor memory → user
 * adjusts → user saves the adjusted set back → next document from this vendor
 * fills itself correctly. The panel lives here (not in the Publish dropdown)
 * because this is the step where the gap is visible.
 */

import { useEffect, useState, useCallback } from 'react'
import { useClient, useFormValue }          from 'sanity'
import { useToast, Card, Stack, Text, Button, Flex, Badge } from '@sanity/ui'

const VAT_DISPLAY: Record<string, string> = {
  inclusive: 'VAT in price', exclusive: 'VAT added on top', zero: '0% VAT', none: 'No VAT',
}
const WHT_DISPLAY: Record<string, string> = {
  none: 'ไม่หัก', '0': '0%', '3': '3%', '5': '5%', '10': '10%',
}

interface PartyDefaults {
  legalName_th?:       string | null
  legalName_en?:       string | null
  defaultVatType?:     string | null
  defaultWhtRate?:     string | null
  defaultExpenseNote?: string | null
  glLabel?:            string | null
  glId?:               string | null
}

export function VendorDefaultsPanel() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const toast  = useToast()

  const vendorRef          = (useFormValue(['vendor'])      as any)?._ref as string | undefined
  const accountCodeRef     = (useFormValue(['accountCode']) as any)?._ref as string | undefined
  const vatType            = useFormValue(['vatType'])            as string | undefined
  const whtRate            = useFormValue(['withholdingTaxRate']) as string | undefined
  const expenseDescription = useFormValue(['expenseDescription']) as string | undefined

  const [party,  setParty]  = useState<PartyDefaults | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!vendorRef) { setParty(null); return }
    client.fetch<PartyDefaults>(
      `*[_id == $id][0]{
        legalName_th, legalName_en,
        defaultVatType, defaultWhtRate, defaultExpenseNote,
        "glLabel": coalesce(defaultGlAccount->nameEn, defaultGlAccount->nameTh, defaultGlAccount->code, defaultGlAccount._ref),
        "glId":    defaultGlAccount._ref
      }`,
      { id: vendorRef },
    ).then(p => { if (!cancelled) setParty(p) }).catch(() => {})
    return () => { cancelled = true }
  }, [vendorRef, client, savedAt])

  // What the save button would write — only values actually set on this payment.
  const patch: Record<string, unknown> = {}
  if (accountCodeRef)                    patch.defaultGlAccount   = { _type: 'reference', _ref: accountCodeRef }
  if (vatType)                           patch.defaultVatType     = vatType
  if (whtRate && whtRate !== 'custom')   patch.defaultWhtRate     = whtRate
  if (expenseDescription)                patch.defaultExpenseNote = expenseDescription

  const save = useCallback(async () => {
    if (!vendorRef || Object.keys(patch).length === 0) return
    setSaving(true)
    try {
      await client.patch(vendorRef).set(patch).commit()
      setSavedAt(Date.now())
      toast.push({
        status: 'success',
        title:  'จำค่าประจำแล้ว',
        description: 'เอกสารใบต่อไปของเจ้านี้จะเติมค่าชุดนี้ให้อัตโนมัติตอนกด Extract from Doc',
        duration: 5000,
      })
    } catch (err: any) {
      toast.push({ status: 'error', title: 'บันทึกไม่สำเร็จ', description: err?.message, duration: 6000 })
    } finally {
      setSaving(false)
    }
  }, [vendorRef, client, toast, accountCodeRef, vatType, whtRate, expenseDescription]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!vendorRef) {
    return (
      <Card padding={3} radius={2} tone="transparent" border>
        <Text size={0} muted>🧠 Vendor memory — เลือก Vendor (1.5) ก่อน จึงจะดู/บันทึกค่าประจำของเจ้านั้นได้</Text>
      </Card>
    )
  }

  const vendorName  = party?.legalName_th ?? party?.legalName_en ?? 'vendor'
  const hasDefaults = !!(party && (party.glId || party.defaultVatType || party.defaultWhtRate || party.defaultExpenseNote))

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Stack space={3}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text size={0} weight="semibold">🧠 Vendor memory · ค่าประจำของ {vendorName}</Text>
          {!hasDefaults && <Badge tone="caution" mode="outline" fontSize={0}>ยังไม่มีค่าประจำ</Badge>}
        </Flex>

        {hasDefaults && (
          <Flex gap={2} wrap="wrap">
            {party?.glLabel            && <Badge mode="outline" fontSize={0}>GL: {party.glLabel}</Badge>}
            {party?.defaultVatType     && <Badge mode="outline" fontSize={0}>VAT: {VAT_DISPLAY[party.defaultVatType] ?? party.defaultVatType}</Badge>}
            {party?.defaultWhtRate     && <Badge mode="outline" fontSize={0}>WHT: {WHT_DISPLAY[party.defaultWhtRate] ?? party.defaultWhtRate}</Badge>}
            {party?.defaultExpenseNote && <Badge mode="outline" fontSize={0}>“{party.defaultExpenseNote}”</Badge>}
          </Flex>
        )}

        <Button
          text={saving ? 'กำลังบันทึก…' : `💾 จำค่าปัจจุบันของใบนี้เป็นค่าประจำของ ${vendorName}`}
          mode="ghost"
          tone="primary"
          fontSize={1}
          disabled={saving || Object.keys(patch).length === 0}
          onClick={save}
        />
        <Text size={0} muted>
          บันทึก GL Account / VAT / หัก ณ ที่จ่าย / Payment Notes ปัจจุบันเข้า vendor —
          ครั้งหน้าอัพเอกสารของเจ้านี้แล้วกด Extract ระบบจะเติมให้เอง (แก้รายใบได้เสมอ)
        </Text>
      </Stack>
    </Card>
  )
}
