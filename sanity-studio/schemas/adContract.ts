import { defineField, defineType, defineArrayMember } from 'sanity'
import { createAutoNumberInput } from '../components/AutoNumberInput'

const AdContractNumberInput = createAutoNumberInput('adContract', { fixedPrefix: 'AD', dateField: 'contractDate' })

/**
 * Ad Contract (สัญญารับโฆษณา) — the formal agreement raised from an ACCEPTED
 * quotation when the customer wants one (their procurement asks for it, a long
 * or large deal, exclusive terms). Small deals stop at the signed quotation.
 *
 * The contract REFERENCES the quotation and pulls the counterparty, package,
 * price and period from it at render time — nothing commercial is retyped.
 * The standard clauses (scope, term, payment, content, distribution,
 * cancellation, general) live in the customer-facing page as one fixed
 * template; only the bracketed numbers ([7] days, [3] business days …) are
 * fields here, with defaults, so a contract is filled in a minute.
 *
 * Lifecycle: draft → sent → signed → active → ended | cancelled
 *
 * Customer-facing render: app.aquamx.co.th/contract/<_id>   (+ /pdf)
 */
export default defineType({
  name:  'adContract',
  title: 'Ad Contract',
  type:  'document',

  groups: [
    { name: 'header',   title: '1. Contract Setup', default: true },
    { name: 'terms',    title: '2. Terms & Sites'                 },
    { name: 'signing',  title: '3. Signatories'                   },
    { name: 'followup', title: '4. Follow-up'                     },
  ],

  orderings: [
    { title: 'Contract Date — Newest', name: 'dateDesc', by: [{ field: 'contractDate',     direction: 'desc' }] },
    { title: 'Contract No — Newest',   name: 'numDesc',  by: [{ field: 'adContractNumber', direction: 'desc' }] },
    { title: 'Status',                 name: 'status',   by: [{ field: 'status',           direction: 'asc'  }] },
  ],

  fields: [

    // ── Group 1: Setup ───────────────────────────────────────────────────────

    defineField({
      group:       'header',
      name:        'adContractNumber',
      title:       '1.1 · Contract Number',
      type:        'string',
      description: 'Auto-generated. Format: AD-yymm-001.',
      components:  { input: AdContractNumberInput },
      validation:  Rule => Rule.required().custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = (await client.fetch(
          `count(*[_type == "adContract" && adContractNumber == $num && _id != $self && !(_id in path("drafts.**"))])`,
          { num: value, self: selfId ?? '' },
        )) as number
        return count === 0 ? true : `"${value}" is already used by another contract — regenerate to get a unique number.`
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
          { title: '📝 Draft — being prepared',                 value: 'draft'     },
          { title: '📤 Sent — with the advertiser for signing', value: 'sent'      },
          { title: '✍️ Signed — both parties signed',           value: 'signed'    },
          { title: '▶️ Active — running',                       value: 'active'    },
          { title: '🏁 Ended — term completed',                 value: 'ended'     },
          { title: '❌ Cancelled',                              value: 'cancelled' },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:        'header',
      name:         'contractDate',
      title:        '1.3 · Contract Date',
      type:         'date',
      initialValue: () => new Date().toISOString().slice(0, 10),
      validation:   Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'quotation',
      title:       '1.4 · Quotation',
      type:        'reference',
      to:          [{ type: 'quotation' }],
      options:     { disableNew: true },
      validation:  Rule => Rule.required(),
      description: 'The accepted quotation this contract is raised from. Advertiser, package, price and period print from it — nothing is retyped here.',
    }),

    defineField({
      group:       'header',
      name:        'packageLabel',
      title:       '1.5 · Package (as printed in clause 1)',
      type:        'string',
      description: 'e.g. Corporate Silver, SME Booster. Leave blank to print the first line of the quotation.',
    }),

    // ── Group 2: Terms & Sites ───────────────────────────────────────────────

    defineField({ group: 'terms', name: 'startDate', title: '2.1 · Start Date', type: 'date', validation: Rule => Rule.required() }),
    defineField({ group: 'terms', name: 'endDate',   title: '2.2 · End Date',   type: 'date', validation: Rule => Rule.required().min(Rule.valueOfField('startDate')) }),
    defineField({ group: 'terms', name: 'months',    title: '2.3 · Term (months)', type: 'number', validation: Rule => Rule.required().integer().min(1) }),

    defineField({ group: 'terms', name: 'monthlyFee', title: '2.4 · Monthly Fee (THB)',         type: 'number', validation: Rule => Rule.required().min(0), description: 'Clause 3.1 — per month, before withholding tax.' }),
    defineField({ group: 'terms', name: 'totalFee',   title: '2.5 · Total for the Term (THB)',  type: 'number', validation: Rule => Rule.required().min(0), description: 'Clause 3.1 — the whole term, after any discount. Usually the quotation total.' }),

    defineField({
      group:       'terms',
      name:        'sites',
      title:       '2.6 · Installation Sites (attachment)',
      type:        'array',
      description: 'Printed as the attachment "รายชื่อสถานที่ติดตั้ง". One row per site.',
      of: [defineArrayMember({
        type: 'object',
        name: 'contractSite',
        fields: [
          defineField({ name: 'site',    title: 'Project Site', type: 'reference', to: [{ type: 'projectSite' }], options: { disableNew: true } }),
          defineField({ name: 'name',    title: 'Site Name (override)', type: 'string', description: 'Leave blank to print the project name.' }),
          defineField({ name: 'address', title: 'Address',      type: 'string' }),
          defineField({ name: 'screens', title: 'Screens',      type: 'number', initialValue: 1, validation: Rule => Rule.integer().min(1) }),
        ],
        preview: {
          select: { name: 'name', proj: 'site.projectTh', projEn: 'site.projectEn', screens: 'screens', address: 'address' },
          prepare: ({ name, proj, projEn, screens, address }: any) => ({
            title:    `${name || proj || projEn || '(site)'} · ${screens ?? 1} จอ`,
            subtitle: address,
          }),
        },
      })],
    }),

    // The bracketed numbers in the standard clauses — defaults are the draft's.
    defineField({ group: 'terms', name: 'paymentDays',     title: '2.7 · Payment Within (days)',              type: 'number', initialValue: 7,  description: 'Clause 3.2 — days from signing.' }),
    defineField({ group: 'terms', name: 'fileLeadDays',    title: '2.8 · Artwork Lead Time (business days)',  type: 'number', initialValue: 3,  description: 'Clause 4.1.' }),
    defineField({ group: 'terms', name: 'changesPerMonth', title: '2.9 · Free Artwork Changes per Month',     type: 'number', initialValue: 1,  description: 'Clause 4.4.' }),
    defineField({ group: 'terms', name: 'outageDays',      title: '2.10 · Outage Before Compensation (days)', type: 'number', initialValue: 3,  description: 'Clause 5.2.' }),
    defineField({ group: 'terms', name: 'noticeDays',      title: '2.11 · Site-Loss Notice (days)',           type: 'number', initialValue: 7,  description: 'Clause 5.4.' }),
    defineField({ group: 'terms', name: 'cureDays',        title: '2.12 · Cure Period (days)',                type: 'number', initialValue: 15, description: 'Clause 6.3.' }),

    defineField({
      group:       'terms',
      name:        'extraClauses',
      title:       '2.13 · Additional Clauses',
      type:        'array',
      of:          [{ type: 'text', rows: 3 }],
      description: 'Deal-specific clauses printed as ข้อ 8, 9 … after the standard ones. Leave empty for a standard contract.',
    }),

    // ── Group 3: Signatories ─────────────────────────────────────────────────

    defineField({ group: 'signing', name: 'providerSignatory',      title: '3.1 · Provider Signatory',        type: 'string', initialValue: 'นายศักดิ์ชัย สุทธิพิพัฒน์' }),
    defineField({ group: 'signing', name: 'providerSignatoryTitle', title: '3.2 · Provider Signatory Title',  type: 'string', initialValue: 'กรรมการ' }),
    defineField({ group: 'signing', name: 'advertiserSignatory',    title: '3.3 · Advertiser Signatory',      type: 'string', description: 'Name printed under the advertiser signature line. Blank prints ( ).' }),
    defineField({ group: 'signing', name: 'advertiserSignatoryTitle', title: '3.4 · Advertiser Signatory Title', type: 'string' }),
    defineField({ group: 'signing', name: 'witness1', title: '3.5 · Witness 1', type: 'string' }),
    defineField({ group: 'signing', name: 'witness2', title: '3.6 · Witness 2', type: 'string' }),

    // ── Group 4: Follow-up ───────────────────────────────────────────────────

    defineField({ group: 'followup', name: 'sentAt', title: '4.1 · Sent On',                type: 'datetime' }),
    defineField({ group: 'followup', name: 'sentTo', title: '4.2 · Sent To (email / LINE)', type: 'string'   }),
    defineField({
      group:       'followup',
      name:        'signedFiles',
      title:       '4.3 · Signed Copy (PDF / photos)',
      type:        'array',
      of:          [{ type: 'file', options: { accept: '.pdf,image/*' } }],
      description: 'The contract as signed by both parties — the evidence. Several files are fine when it comes back as page photos.',
    }),
    defineField({ group: 'followup', name: 'signedAt', title: '4.4 · Signed On', type: 'datetime', description: 'Set status to Signed when you fill this in.' }),
    defineField({
      group:       'followup',
      name:        'correspondence',
      title:       '4.5 · Correspondence Log',
      type:        'array',
      description: 'Every send / receipt with the advertiser, written by the Send tab. Add a "received" row yourself when the signed copy comes back.',
      of: [{
        type: 'object',
        name: 'adContractCorrespondence',
        fields: [
          defineField({ name: 'sentAt',    title: 'When',        type: 'datetime' }),
          defineField({ name: 'channel',   title: 'Channel',     type: 'string', options: { list: ['line', 'email', 'received'] } }),
          defineField({ name: 'lang',      title: 'Language',    type: 'string', options: { list: ['th', 'en'] } }),
          defineField({ name: 'to',        title: 'To / From',   type: 'string' }),
          defineField({ name: 'cc',        title: 'Cc',          type: 'array', of: [{ type: 'string' }] }),
          defineField({ name: 'subject',   title: 'Subject',     type: 'string' }),
          defineField({ name: 'message',   title: 'Message',     type: 'text', rows: 4 }),
          defineField({ name: 'sentBy',    title: 'By',          type: 'string' }),
          defineField({ name: 'messageId', title: 'Message ID',  type: 'string' }),
        ],
        preview: {
          select: { sentAt: 'sentAt', channel: 'channel', lang: 'lang', to: 'to', sentBy: 'sentBy' },
          prepare: ({ sentAt, channel, lang, to, sentBy }: any) => ({
            title:    `${channel === 'email' ? '✉️' : channel === 'received' ? '📥' : '💬'} ${String(channel ?? '').toUpperCase()} · ${String(lang ?? '').toUpperCase()} → ${to ?? '-'}`,
            subtitle: [sentAt ? new Date(sentAt).toLocaleString() : null, sentBy ? `by ${sentBy}` : null].filter(Boolean).join(' · '),
          }),
        },
      }],
    }),
    defineField({ group: 'followup', name: 'internalNotes', title: '4.6 · Internal Notes', type: 'text', rows: 3 }),
  ],

  preview: {
    select: {
      number:     'adContractNumber',
      status:     'status',
      customer:   'quotation.customer.legalName_th',
      customerEn: 'quotation.customer.legalName_en',
      quote:      'quotation.quoteNumber',
      total:      'totalFee',
      start:      'startDate',
      end:        'endDate',
    },
    prepare({ number, status, customer, customerEn, quote, total, start, end }: {
      number?: string; status?: string; customer?: string; customerEn?: string; quote?: string; total?: number; start?: string; end?: string
    }) {
      const icon = { draft: '📝', sent: '📤', signed: '✍️', active: '▶️', ended: '🏁', cancelled: '❌' }[status ?? ''] ?? '📄'
      return {
        title:    `${icon} ${number ?? '(no number)'} · ${customer || customerEn || '-'}`,
        subtitle: [quote, total != null ? `฿${Math.round(total).toLocaleString()}` : null, start && end ? `${start} → ${end}` : null].filter(Boolean).join(' · '),
      }
    },
  },
})
