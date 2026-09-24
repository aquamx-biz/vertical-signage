import { defineField, defineType, defineArrayMember } from 'sanity'
import { createAutoNumberInput }  from '../components/AutoNumberInput'
import { makeGlAccountInput }     from '../components/GlAccountInput'
import { OrderLineItemsInput }    from '../components/OrderLineItemsInput'

const QuoteNumberInput      = createAutoNumberInput('quote', { fixedPrefix: 'QTC', dateField: 'quoteDate' })
const GlAccountRevenueInput = makeGlAccountInput(['revenue'], { allowCreditBalance: true })

/**
 * Quotation — a priced offer we send to a customer BEFORE anything is agreed.
 *
 * Sales side only (advertising packages, brokerage, installs). The Rent Space
 * quotation to a juristic person is a different animal and stays on the
 * contract document (quotationNumber there) — do not merge the two.
 *
 * Lifecycle: draft → sent → accepted | declined | expired
 * "accepted" is where an Order is raised (4.4 links it); the quotation itself
 * never posts money — it is a promise of a price, not a receivable.
 *
 * Lines copy the same shape as order.lines so an accepted quotation can be
 * turned into an order by copying the array as-is.
 *
 * Customer-facing render: app.aquamx.co.th/quotation/<_id>  (aquamx-handoff)
 */
export default defineType({
  name:  'quotation',
  title: 'Quotation',
  type:  'document',

  groups: [
    { name: 'header',   title: '1. Quotation Setup', default: true },
    { name: 'scope',    title: '2. Scope & Terms'                  },
    { name: 'amounts',  title: '3. Lines & Amounts'                },
    { name: 'followup', title: '4. Follow-up'                      },
  ],

  orderings: [
    { title: 'Quote Date — Newest', name: 'dateDesc', by: [{ field: 'quoteDate',   direction: 'desc' }] },
    { title: 'Quote No — Newest',   name: 'numDesc',  by: [{ field: 'quoteNumber', direction: 'desc' }] },
    { title: 'Status',              name: 'status',   by: [{ field: 'status',      direction: 'asc'  }] },
  ],

  fields: [

    // ── Group 1: Setup ───────────────────────────────────────────────────────

    defineField({
      group:       'header',
      name:        'quoteNumber',
      title:       '1.1 · Quotation Number',
      type:        'string',
      description: 'Auto-generated. Format: QTC-yymm-001.',
      components:  { input: QuoteNumberInput },
      validation:  Rule => Rule.required().custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = (await client.fetch(
          `count(*[_type == "quotation" && quoteNumber == $num && _id != $self && !(_id in path("drafts.**"))])`,
          { num: value, self: selfId ?? '' },
        )) as number
        return count === 0 ? true : `"${value}" is already used by another quotation — regenerate to get a unique number.`
      }),
    }),

    defineField({
      group:        'header',
      name:         'status',
      title:        '1.2 · Status',
      type:         'string',
      initialValue: 'draft',
      options: {
        list: [
          { title: '📝 Draft — still being put together', value: 'draft'    },
          { title: '📤 Sent — customer has it',            value: 'sent'     },
          { title: '✅ Accepted — raise an Order',          value: 'accepted' },
          { title: '❌ Declined',                           value: 'declined' },
          { title: '⌛ Expired — past Valid Until',         value: 'expired'  },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:      'header',
      name:       'quoteDate',
      title:      '1.3 · Quotation Date',
      type:       'date',
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'validUntil',
      title:       '1.4 · Valid Until',
      type:        'date',
      description: 'Printed on the document. Usually 30 days from the quotation date.',
      validation:  Rule => Rule.custom((value, context) => {
        const start = context.document?.quoteDate as string | undefined
        if (!value || !start) return true
        return value >= start ? true : 'Valid Until cannot be before the Quotation Date.'
      }),
    }),

    defineField({
      group:       'header',
      name:        'customer',
      title:       '1.5 · Customer',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'The party this price is offered to. Name, Tax ID and address print from the Party record.',
      options:     { disableNew: true },
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'attention',
      title:       '1.6 · Attention (ถึง)',
      type:        'string',
      description: 'Person at the customer the letter is addressed to, e.g. "คุณชาญณรงค์ คุ้มภัย".',
    }),

    defineField({
      group:       'header',
      name:        'processSetup',
      title:       '1.7 · Revenue Stream',
      type:        'reference',
      to:          [{ type: 'contractType' }],
      options: {
        disableNew: true,
        filter:     'useForOrder == true && isActive == true',
      },
      description: 'Which revenue stream this quotation sells. Drives the line-item catalogue in 3.1.',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'source',
      title:       '1.8 · Quoted Against',
      type:        'reference',
      to: [
        { type: 'lead'            },
        { type: 'saleOpportunity' },
        { type: 'projectSite'     },
        { type: 'offer'           },
        { type: 'provider'        },
        { type: 'unitProfile'     },
      ],
      options:     { disableNew: true },
      description: 'The lead or deal this quotation came out of, if any.',
    }),

    // ── Group 2: Scope & Terms ───────────────────────────────────────────────
    // The old manual quotations (QTC-2025-10-01) carried a "เงื่อนไข / รายละเอียด"
    // table — package type, screens, project, duration, media spec, CTA. Kept as
    // free label/value rows so each revenue stream can print whatever matters.

    defineField({
      group:        'scope',
      name:         'title_th',
      title:        '2.1 · Title (Thai)',
      type:         'string',
      description:  'Heading on the document.',
      initialValue: 'ใบเสนอราคาค่าบริการโฆษณาบนจอดิจิทัลเครือข่าย aquamx',
    }),

    defineField({
      group:        'scope',
      name:         'title_en',
      title:        '2.2 · Title (English)',
      type:         'string',
      initialValue: 'Quotation — Advertising on the aquamx digital screen network',
    }),

    defineField({
      group:       'scope',
      name:        'projectSites',
      title:       '2.3 · Project Sites (screens)',
      type:        'array',
      of:          [defineArrayMember({ type: 'reference', to: [{ type: 'projectSite' }], options: { disableNew: true } })],
      description: 'Which buildings the package covers. Printed as a list.',
    }),

    defineField({
      group:        'scope',
      name:         'intro_th',
      title:        '2.4 · Opening Paragraph (Thai)',
      type:         'text',
      rows:         4,
      initialValue: 'ใบเสนอราคานี้แสดงรายละเอียดและเงื่อนไขในการลงโฆษณาบนเครือข่ายจอดิจิทัลของ aquamx โดยบริษัทมีความยินดีนำเสนอพื้นที่โฆษณาดิจิทัลที่ออกแบบมาเพื่อสร้างการมีส่วนร่วมกับผู้อยู่อาศัยและผู้มาเยือนภายในโครงการ จอของ aquamx มาพร้อมระบบ Interactive Call-to-Action (CTA) ผู้ชมสามารถสัมผัสหน้าจอเพื่อดูรายละเอียดสินค้า ดูรูปภาพเพิ่มเติม หรือกดสั่งซื้อ / จองบริการ / ติดต่อเจ้าของผลิตภัณฑ์ได้โดยตรงบนหน้าจอ',
    }),

    defineField({
      group:        'scope',
      name:         'intro_en',
      title:        '2.5 · Opening Paragraph (English)',
      type:         'text',
      rows:         4,
      initialValue: 'This quotation sets out the details and terms for advertising on the aquamx digital screen network. We are pleased to offer digital advertising space designed to engage residents and visitors inside the building. Every aquamx screen carries an Interactive Call-to-Action (CTA): viewers can touch the screen to see product details and more images, or order, book or contact the product owner directly from the screen.',
    }),

    defineField({
      group:       'scope',
      name:        'terms',
      title:       '2.6 · Terms & Details table',
      type:        'array',
      description: 'One row per line of the terms table, printed in this order. Keep it to ~7 rows so the PDF stays on one A4 page.',
      of: [defineArrayMember({
        type: 'object',
        name: 'termRow',
        fields: [
          defineField({ name: 'label_th', title: 'Label (Thai)',     type: 'string', validation: Rule => Rule.required() }),
          defineField({ name: 'label_en', title: 'Label (English)',  type: 'string' }),
          defineField({ name: 'value_th', title: 'Value (Thai)',     type: 'string', validation: Rule => Rule.required() }),
          defineField({ name: 'value_en', title: 'Value (English)',  type: 'string' }),
          defineField({ name: 'emphasis', title: 'Bold value',        type: 'boolean', initialValue: false, description: 'Print the value in bold (price, discount).' }),
        ],
        preview: {
          select: { t: 'label_th', v: 'value_th' },
          prepare({ t, v }: { t?: string; v?: string }) { return { title: t ?? '—', subtitle: v ?? '' } },
        },
      })],
      initialValue: [
        { _type: 'termRow', label_th: 'ประเภทแพ็กเกจ',   label_en: 'Package',     value_th: 'แบบระบุจอ (Specific Site) ไม่ผูกขาด (Non-Exclusive)', value_en: 'Specific site, non-exclusive' },
        { _type: 'termRow', label_th: 'จำนวนจอ',         label_en: 'Screens',     value_th: '-', value_en: '-' },
        { _type: 'termRow', label_th: 'ระยะเวลา',         label_en: 'Period',      value_th: '-', value_en: '-' },
        { _type: 'termRow', label_th: 'ค่าบริการรายเดือน', label_en: 'Monthly fee', value_th: '-', value_en: '-', emphasis: true },
        { _type: 'termRow', label_th: 'ส่วนลด',           label_en: 'Discount',    value_th: '-', value_en: '-', emphasis: true },
        { _type: 'termRow', label_th: 'การชำระเงิน',      label_en: 'Payment',     value_th: 'ชำระทั้งหมดเมื่อทำสัญญา', value_en: 'Paid in full on signing' },
        { _type: 'termRow', label_th: 'สื่อบนจอ',          label_en: 'Media',       value_th: 'ภาพนิ่ง 4 ภาพ หรือวิดีโอ 1 คลิป · แสดงรอบละ 20 วินาที', value_en: '4 still images, or 1 video · 20 seconds per loop' },
      ],
    }),

    defineField({
      group:        'scope',
      name:         'closing_th',
      title:        '2.7 · Closing Paragraph (Thai)',
      type:         'text',
      rows:         4,
      initialValue: 'โฆษณาจะแสดงในรูปแบบวิดีโอลูปตลอดทั้งวัน เมื่อผู้ชมแตะหน้าจอ ระบบจะเปิดหน้ารายละเอียดผลิตภัณฑ์ (Product Detail Page) เพื่อให้สามารถติดต่อได้โดยตรง aquamx ขอสงวนสิทธิ์ในการตรวจสอบและอนุมัติสื่อโฆษณาทุกชิ้นก่อนเผยแพร่ เพื่อให้มั่นใจว่าสื่อโฆษณามีคุณภาพและสอดคล้องกับมาตรฐานความเหมาะสมของโครงการ ขอขอบคุณที่ให้ความสนใจในข้อเสนอของเรา และหวังว่าจะได้มีโอกาสร่วมงานกับท่านในเร็ว ๆ นี้',
    }),

    defineField({
      group:        'scope',
      name:         'closing_en',
      title:        '2.8 · Closing Paragraph (English)',
      type:         'text',
      rows:         4,
      initialValue: 'The advertisement plays in a video loop throughout the day. When a viewer touches the screen, a Product Detail Page opens so they can get in touch directly. aquamx reserves the right to review and approve every creative before it goes on screen, so that all content meets the quality and suitability standards of the building. Thank you for your interest in this offer — we look forward to working with you soon.',
    }),

    // ── Group 3: Lines & Amounts ─────────────────────────────────────────────

    defineField({
      group:       'amounts',
      name:        'lines',
      title:       '3.1 · Quotation Lines',
      type:        'array',
      description: 'Same shape as Order lines — an accepted quotation copies these onto the Order untouched.',
      components:  { input: OrderLineItemsInput },
      of: [defineArrayMember({
        type:  'object',
        name:  'orderLine',
        title: 'Line',
        fields: [
          defineField({ name: 'sourceChargeKey', title: 'Catalogue Charge Key', type: 'string', readOnly: true }),
          defineField({ name: 'description_en',  title: 'Description (English)', type: 'string', validation: Rule => Rule.required() }),
          defineField({ name: 'description_th',  title: 'Description (Thai)',    type: 'string' }),
          defineField({
            name: 'accountCode', title: 'GL Account (Income)', type: 'reference', to: [{ type: 'accountCode' }],
            options: { disableNew: true }, components: { input: GlAccountRevenueInput },
          }),
          defineField({ name: 'quantity',  title: 'Quantity',         type: 'number', initialValue: 1, validation: Rule => Rule.required().min(0) }),
          defineField({ name: 'unitPrice', title: 'Unit Price (THB)', type: 'number', validation: Rule => Rule.min(0) }),
          defineField({
            name: 'vatType', title: 'VAT Type', type: 'string', initialValue: 'none',
            options: { list: [
              { title: 'Exclusive (VAT added on top)', value: 'exclusive' },
              { title: 'Inclusive (VAT included)',     value: 'inclusive' },
              { title: '0% VAT',                       value: 'zero'      },
              { title: 'No VAT',                       value: 'none'      },
            ] },
          }),
          defineField({ name: 'lineTotal', title: 'Line Total (THB)', type: 'number', description: 'Stored snapshot: quantity × unit price.' }),
        ],
        preview: {
          select: { desc: 'description_en', qty: 'quantity', price: 'unitPrice', lineTotal: 'lineTotal' },
          prepare({ desc, qty, price, lineTotal }: { desc?: string; qty?: number; price?: number; lineTotal?: number }) {
            const total = lineTotal ?? (price != null ? (qty ?? 1) * price : undefined)
            return {
              title:    desc ?? '—',
              subtitle: total != null ? `${qty ?? 1} × ${Number(price ?? 0).toLocaleString()} = ${Number(total).toLocaleString()} THB` : 'amount to be set',
            }
          },
        },
      })],
    }),

    defineField({
      group:       'amounts',
      name:        'amountDue',
      title:       '3.2 · Amount (THB, before VAT)',
      type:        'number',
      description: 'Sum of the lines minus the discount (3.2d). Required before the quotation can be marked Sent.',
      validation:  Rule => Rule.min(0).custom((value, context) => {
        const status = context.document?.status as string | undefined
        if (value != null || status === 'draft') return true
        return 'Amount is required before a quotation can leave draft.'
      }),
    }),

    defineField({
      group:       'amounts',
      name:        'discountLabel_th',
      title:       '3.2b · Discount Label (Thai)',
      type:        'string',
      description: 'Printed as its own line under the items, e.g. "ส่วนลดจ่ายล่วงหน้า 3 เดือน 5%". Leave blank when there is no discount.',
    }),
    defineField({ group: 'amounts', name: 'discountLabel_en', title: '3.2c · Discount Label (English)', type: 'string' }),
    defineField({
      group:       'amounts',
      name:        'discountAmount',
      title:       '3.2d · Discount Amount (THB)',
      type:        'number',
      description: 'Positive number; printed as a deduction. Amount (3.2) should already be net of it.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'amounts',
      name:        'vatType',
      title:       '3.3 · VAT Type',
      type:        'string',
      description: 'Not VAT-registered yet — leave as No VAT unless that has changed.',
      options: {
        list: [
          { title: 'Exclusive — VAT added on top',         value: 'exclusive' },
          { title: 'Inclusive — VAT already in the price', value: 'inclusive' },
          { title: '0% VAT',                                value: 'zero'      },
          { title: 'No VAT',                                value: 'none'      },
        ],
        layout: 'radio',
      },
      initialValue: 'none',
    }),

    defineField({ group: 'amounts', name: 'vatAmount',   title: '3.4 · VAT Amount (THB)', type: 'number', validation: Rule => Rule.min(0) }),
    defineField({ group: 'amounts', name: 'totalAmount', title: '3.5 · Total (THB)',      type: 'number', validation: Rule => Rule.min(0), description: 'Amount + VAT. The figure printed as ยอดรวมสุทธิ.' }),


    // ── Group 4: Follow-up ───────────────────────────────────────────────────

    defineField({ group: 'followup', name: 'sentAt',    title: '4.1 · Sent On',                 type: 'datetime' }),
    defineField({ group: 'followup', name: 'sentTo',    title: '4.2 · Sent To (email / LINE)',  type: 'string'   }),
    defineField({ group: 'followup', name: 'decidedAt', title: '4.3 · Accepted / Declined On',  type: 'datetime' }),
    defineField({
      group:       'followup',
      name:        'order',
      title:       '4.4 · Order Raised',
      type:        'reference',
      to:          [{ type: 'order' }],
      options:     { disableNew: true },
      description: 'The Order created when this quotation was accepted.',
    }),
    defineField({
      group:        'followup',
      name:         'signedBy',
      title:        '4.5 · Signed By',
      type:         'string',
      initialValue: 'นายศักดิ์ชัย สุทธิพิพัฒน์',
      description:  'Name printed under the signature block.',
    }),
    defineField({
      group:        'followup',
      name:         'signedBy_en',
      title:        '4.5b · Signed By (English)',
      type:         'string',
      initialValue: 'Sakchai Suthipipat',
      description:  'Name printed under the signature block on the English version (?lang=en).',
    }),
    defineField({ group: 'followup', name: 'internalNotes', title: '4.6 · Internal Notes', type: 'text', rows: 3 }),
  ],

  preview: {
    select: {
      number:     'quoteNumber',
      status:     'status',
      customer:   'customer.legalName_th',
      customerEn: 'customer.legalName_en',
      total:      'totalAmount',
      due:        'amountDue',
      stream:     'processSetup.name',
      valid:      'validUntil',
    },
    prepare({ number, status, customer, customerEn, total, due, stream, valid }: {
      number?: string; status?: string; customer?: string; customerEn?: string
      total?: number; due?: number; stream?: string; valid?: string
    }) {
      const statusLabel: Record<string, string> = {
        draft: '📝 Draft', sent: '📤 Sent', accepted: '✅ Accepted', declined: '❌ Declined', expired: '⌛ Expired',
      }
      const amount = total ?? due
      const name   = customer ?? customerEn
      return {
        title:    `📄 ${number ?? '(no number)'}${name ? ` — ${name}` : ''}`,
        subtitle: [
          statusLabel[status ?? ''] ?? '',
          stream ?? '',
          amount != null ? `${Number(amount).toLocaleString()} THB` : 'amount TBC',
          valid ? `valid to ${valid}` : '',
        ].filter(Boolean).join('  ·  '),
      }
    },
  },
})
