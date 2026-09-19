import { defineField, defineType } from 'sanity'

/**
 * bankAccount — the company's real receiving/paying channels (operational
 * detail), one document per channel. The chart of accounts (accountCode)
 * stays the ACCOUNTING view; this holds what accounting never records:
 * the actual account number, PromptPay id, Beam merchant id.
 *
 * The LINE merchant flow (phase 2) reads the account flagged
 * isDefaultReceiving to build PromptPay QR payloads — change the account in
 * Studio and the chat follows, no deploy.
 */
export default defineType({
  name:  'bankAccount',
  title: 'Bank Account · บัญชีบริษัท',
  type:  'document',
  fields: [
    defineField({
      name:        'name',
      title:       'Name · ชื่อเรียก *',
      type:        'string',
      description: 'ชื่อสั้นๆ ที่ทีมเรียกกัน เช่น "KBank ออมทรัพย์หลัก", "พร้อมเพย์บริษัท", "Beam"',
      validation:  Rule => Rule.required(),
    }),
    defineField({
      name:    'kind',
      title:   'Kind · ประเภท *',
      type:    'string',
      options: {
        list: [
          { title: '🏦 Bank account · บัญชีธนาคาร', value: 'bank' },
          { title: '📱 PromptPay · พร้อมเพย์',       value: 'promptpay' },
          { title: '💳 Beam merchant',              value: 'beam' },
          { title: '👛 E-wallet / other · อื่นๆ',    value: 'other' },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name:        'bankName',
      title:       'Bank · ธนาคาร',
      type:        'string',
      description: 'เช่น กสิกรไทย, ไทยพาณิชย์',
      hidden:      ({ document }) => (document as { kind?: string })?.kind !== 'bank',
    }),
    defineField({
      name:        'accountNo',
      title:       'Account No. · เลขบัญชี',
      type:        'string',
      hidden:      ({ document }) => (document as { kind?: string })?.kind !== 'bank',
    }),
    defineField({
      name:        'accountName',
      title:       'Account Name · ชื่อบัญชี',
      type:        'string',
      description: 'ชื่อบัญชีตามธนาคาร/ที่ลูกค้าเห็นตอนโอน',
    }),
    defineField({
      name:        'promptpayId',
      title:       'PromptPay ID · เลขพร้อมเพย์',
      type:        'string',
      description: 'เบอร์โทร หรือเลขประจำตัวผู้เสียภาษี ที่ผูกพร้อมเพย์ — ใช้ generate QR รับเงินใน LINE',
      hidden:      ({ document }) => (document as { kind?: string })?.kind !== 'promptpay',
    }),
    defineField({
      name:        'beamMerchantId',
      title:       'Beam Merchant ID',
      type:        'string',
      hidden:      ({ document }) => (document as { kind?: string })?.kind !== 'beam',
    }),
    defineField({
      name:        'glAccount',
      title:       'GL Account · บัญชีแยกประเภท',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { filter: 'isActive == true' },
      description: 'ผูกกับผังบัญชี (หมวดเงินสดและรายการเทียบเท่า) — ให้ฝั่งบัญชีกับเลขบัญชีจริงเชื่อมกัน',
    }),
    defineField({
      name:         'isDefaultReceiving',
      title:        'Default Receiving · บัญชีรับเงินหลัก',
      type:         'boolean',
      initialValue: false,
      description:  'ติ๊กได้ 1 บัญชี — ระบบรับเงินอัตโนมัติ (QR ใน LINE) ใช้บัญชีนี้',
    }),
    defineField({
      name:         'isActive',
      title:        'Active · ใช้งานอยู่',
      type:         'boolean',
      initialValue: true,
    }),
    defineField({
      name:        'notes',
      title:       'Notes · โน้ต',
      type:        'text',
      rows:        2,
    }),
  ],
  preview: {
    select:  { name: 'name', kind: 'kind', active: 'isActive', recv: 'isDefaultReceiving' },
    prepare: ({ name, kind, active, recv }) => ({
      title:    `${recv ? '⭐ ' : ''}${name ?? '(ไม่มีชื่อ)'}`,
      subtitle: `${{ bank: '🏦 ธนาคาร', promptpay: '📱 พร้อมเพย์', beam: '💳 Beam', other: '👛 อื่นๆ' }[kind as string] ?? kind ?? ''}${active === false ? ' · ปิดใช้งาน' : ''}`,
    }),
  },
})
