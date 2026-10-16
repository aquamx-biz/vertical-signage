import { defineField, defineType, defineArrayMember } from 'sanity'
import { createAutoNumberInput }    from '../components/AutoNumberInput'
import { makeGlAccountInput }       from '../components/GlAccountInput'
import { ReceiptLineItemsInput }    from '../components/ReceiptLineItemsInput'
import { ReceiptTotalsSummary }     from '../components/ReceiptTotalsSummary'
import { ReceiptWhtAmountInput }    from '../components/ReceiptWhtAmountInput'
import { NetReceivedSummary }       from '../components/NetReceivedSummary'
import { AutoTotalAmountInput }     from '../components/AutoTotalAmountInput'
import { BankAccountInput }          from '../components/BankAccountInput'
import { AutoReceiptStatusInput }   from '../components/AutoReceiptStatusInput'
import { accountingEntryField }     from './accountingEntryField'

const ReceiptNumberInput    = createAutoNumberInput('receipt', { fixedPrefix: 'RCT' })
const InvoiceNumberInput    = createAutoNumberInput('invoice', { fixedPrefix: 'INV', dateField: 'invoiceDate' })
const GlAccountRevenueInput = makeGlAccountInput(['revenue'], { allowCreditBalance: true })

/**
 * Receipt — records income received from tenants / customers.
 *
 * Issued as:
 *   receipt_only → ใบเสร็จรับเงิน
 *   tax_invoice  → ใบกำกับภาษี
 *   combined     → ใบเสร็จรับเงิน / ใบกำกับภาษี  (most common B2B)
 *
 * Lifecycle: draft → invoiced (invoice number, not yet paid) → issued (receipt
 * number = paid) → posted → voided. A deal that is billed first (วางบิล) lives
 * in ONE document: the invoice fields are filled when the team sends the
 * invoice from the aquamx-shop LINE group, the receipt fields when the
 * payment is recorded — so the customer's "เอกสารของฉัน" card reads one row.
 *
 * Line items are a one-time snapshot copied from the linked contract's
 * Process Setup receiptCharges[] template. sourceChargeKey preserves
 * traceability back to the template entry.
 */
export default defineType({
  name:  'invoiceReceipt',
  title: 'Invoice / Receipt',
  type:  'document',

  groups: [
    { name: 'header',     title: '1. Receipt Setup',       default: true },
    { name: 'amounts',    title: '2. Amounts & Documents'               },
    { name: 'accounting', title: '3. Accounting'                        },
  ],

  orderings: [
    { title: 'Issue Date — Newest', name: 'dateDesc', by: [{ field: 'issueDate',     direction: 'desc' }] },
    { title: 'Issue Date — Oldest', name: 'dateAsc',  by: [{ field: 'issueDate',     direction: 'asc'  }] },
    { title: 'Receipt No — Newest', name: 'numDesc',  by: [{ field: 'receiptNumber', direction: 'desc' }] },
    { title: 'Amount — Highest',    name: 'amtDesc',  by: [{ field: 'totalAmount',   direction: 'desc' }] },
    { title: 'Status',              name: 'status',   by: [{ field: 'status',        direction: 'asc'  }] },
  ],

  fields: [

    // ── Group 1: Receipt Setup (identity + line items) ───────────────────────

    defineField({
      group:       'header',
      name:        'receiptNumber',
      title:       '1.1 · Receipt Number',
      type:        'string',
      description: 'Auto-generated. Format: RCT-yymm-001.',
      components:  { input: ReceiptNumberInput },
      validation:  Rule => Rule.custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = (await client.fetch(
          `count(*[_type == "invoiceReceipt" && receiptNumber == $num && _id != $self && !(_id in path("drafts.**"))])`,
          { num: value, self: selfId ?? '' },
        )) as number
        return count === 0 ? true : `"${value}" is already used by another receipt — regenerate to get a unique number.`
      }),
    }),

    // ── Invoice half (วางบิล) — filled before payment; empty for Beam receipts ──
    defineField({
      group:       'header',
      name:        'invoiceNumber',
      title:       '1.1a · Invoice Number',
      type:        'string',
      description: 'Auto-generated. Format: INV-yymm-001. Empty when the payment came through Beam (receipt only).',
      components:  { input: InvoiceNumberInput },
      validation:  Rule => Rule.custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = (await client.fetch(
          `count(*[_type == "invoiceReceipt" && invoiceNumber == $num && _id != $self && !(_id in path("drafts.**"))])`,
          { num: value, self: selfId ?? '' },
        )) as number
        return count === 0 ? true : `"${value}" is already used by another invoice — regenerate to get a unique number.`
      }),
    }),
    defineField({ group: 'header', name: 'invoiceDate', title: '1.1b · Invoice Date', type: 'date',
      hidden: ({ document }: any) => !document?.invoiceNumber }),
    defineField({ group: 'header', name: 'dueDate',     title: '1.1c · Payment Due',  type: 'date',
      description: 'Invoice date + the party\'s credit terms. Overdue reminders in the aquamx-shop LINE group key on this.',
      hidden: ({ document }: any) => !document?.invoiceNumber }),
    defineField({ group: 'header', name: 'invoiceSentAt', title: '1.1d · Invoice Sent On', type: 'datetime', readOnly: true,
      hidden: ({ document }: any) => !document?.invoiceNumber }),
    defineField({
      group:       'header',
      name:        'quotation',
      title:       '1.1e · Quotation',
      type:        'reference',
      to:          [{ type: 'quotation' }],
      description: 'The accepted quotation this invoice / receipt settles (ad packages). Leave empty for rent receipts.',
      options:     { disableNew: true },
    }),
    defineField({ group: 'header', name: 'pkgOrderId', title: '1.1f · Package Order (Firestore)', type: 'string', readOnly: true,
      description: 'pkgOrders document this payment is for — written by the LINE flow.' }),

    defineField({
      group:        'header',
      name:         'receiptType',
      title:        '1.2 · Receipt Type',
      type:         'string',
      // Was 'combined'. AquaMX is not VAT-registered as of 2026-08-08, and a
      // ใบกำกับภาษี may only be issued by a registered business — so the
      // default must not be a document we cannot legally issue. Flip back to
      // 'combined' once registration lands (with the VAT defaults in order.ts
      // and processSetup.ts). The option stays selectable for that day.
      initialValue: 'receipt_only',
      options: {
        list: [
          { title: '🧾 Receipt Only — ใบเสร็จรับเงิน',                               value: 'receipt_only' },
          { title: '📄 Tax Invoice — ใบกำกับภาษี',                                    value: 'tax_invoice'  },
          { title: '📋 Combined — ใบเสร็จรับเงิน / ใบกำกับภาษี  (most common B2B)', value: 'combined'     },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:        'header',
      name:         'status',
      title:        '1.3 · Status',
      type:         'string',
      initialValue: 'draft',
      readOnly:     true,
      components:   { input: AutoReceiptStatusInput },
    }),

    defineField({
      group:      'header',
      name:       'issueDate',
      title:      '1.4 · Issue Date',
      type:       'date',
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'payer',
      title:       '1.5 · Payer',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'The tenant or customer who made this payment.',
      options:     { disableNew: true },
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:   'header',
      name:    'projectSite',
      title:   '1.6 · Project Site',
      type:    'reference',
      to:      [{ type: 'projectSite' }],
      options: { disableNew: true },
    }),

    defineField({
      group:       'header',
      name:        'linkedContract',
      title:       '1.7 · Linked Contract',
      type:        'reference',
      to:          [{ type: 'contract' }, { type: 'serviceContract' }],
      description: 'Link the Rent Space or Service Contract this receipt covers. Required to pre-fill line items from the Process Setup template.',
      options:     { disableNew: true },
    }),

    defineField({
      group:       'header',
      name:        'billingPeriod',
      title:       '1.8 · Billing Period',
      type:        'string',
      description: 'Display label for the period this receipt covers. e.g. "May 2026", "Q2 2026", "Jan–Mar 2026".',
    }),

    defineField({
      group:       'header',
      name:        'lineItems',
      title:       'Line Items',
      type:        'array',
      description: 'Snapshot of charges at time of receipt creation. Use "Pre-fill from template" above, then adjust amounts as needed.',
      components:  { input: ReceiptLineItemsInput },
      of: [defineArrayMember({
        type:  'object',
        name:  'lineItem',
        title: 'Line Item',
        fields: [
          defineField({
            name:        'sourceChargeKey',
            title:       'Template Charge Key',
            type:        'string',
            readOnly:    true,
            description: '_key of the Process Setup receiptCharge entry this item was copied from.',
          }),
          defineField({
            name:        'description_en',
            title:       'Description (English)',
            type:        'string',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:  'description_th',
            title: 'Description (Thai)',
            type:  'string',
          }),
          defineField({
            name:       'accountCode',
            title:      'GL Account (Income)',
            type:       'reference',
            to:         [{ type: 'accountCode' }],
            options:    { disableNew: true },
            components: { input: GlAccountRevenueInput },
          }),
          defineField({
            name:         'quantity',
            title:        'Quantity',
            type:         'number',
            initialValue: 1,
            validation:   Rule => Rule.required().min(0),
          }),
          defineField({
            name:       'unitPrice',
            title:      'Unit Price (THB)',
            type:       'number',
            validation: Rule => Rule.required().min(0),
          }),
          defineField({
            name:         'vatType',
            title:        'VAT Type',
            type:         'string',
            initialValue: 'exclusive',
            options: {
              list: [
                { title: 'Exclusive (VAT added on top)', value: 'exclusive' },
                { title: 'Inclusive (VAT included)',     value: 'inclusive' },
                { title: '0% VAT',                       value: 'zero'      },
                { title: 'No VAT',                       value: 'none'      },
              ],
            },
          }),
          defineField({
            name:        'lineTotal',
            title:       'Line Total (THB)',
            type:        'number',
            readOnly:    true,
            description: 'Stored snapshot: quantity × unitPrice. Set at pre-fill time; update manually if you change qty or price.',
          }),
        ],
        preview: {
          select: {
            desc:      'description_en',
            qty:       'quantity',
            price:     'unitPrice',
            vatType:   'vatType',
            lineTotal: 'lineTotal',
          },
          prepare({ desc, qty, price, vatType, lineTotal }: {
            desc?: string; qty?: number; price?: number; vatType?: string; lineTotal?: number
          }) {
            const vatLabel: Record<string, string> = {
              exclusive: '+VAT', inclusive: 'incl. VAT', zero: '0% VAT', none: 'no VAT',
            }
            const total = lineTotal ?? (qty ?? 0) * (price ?? 0)
            return {
              title:    desc ?? '—',
              subtitle: `${qty ?? 1} × ${Number(price ?? 0).toLocaleString()} = ${Number(total).toLocaleString()} THB · ${vatLabel[vatType ?? ''] ?? ''}`,
            }
          },
        },
      })],
    }),

    // ── Group 2: Amounts & Documents ─────────────────────────────────────────

    defineField({
      group:       'amounts',
      name:        'subtotal',
      title:       '2.1 · Subtotal (THB)',
      type:        'number',
      readOnly:    true,
      components:  { input: ReceiptTotalsSummary },
      description: 'Auto-computed from line items (quantity × unit price). Review the summary, then fill in 2.2–2.4.',
    }),

    defineField({
      group:   'amounts',
      name:    'vatType',
      title:   '2.2 · VAT Type',
      type:    'string',
      options: {
        list: [
          { title: 'Exclusive — VAT added on top of subtotal', value: 'exclusive' },
          { title: 'Inclusive — VAT already included in price', value: 'inclusive' },
          { title: '0% VAT',  value: 'zero'      },
          { title: 'No VAT',  value: 'none'      },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:       'amounts',
      name:        'vatAmount',
      title:       '2.3 · VAT Amount (THB)',
      type:        'number',
      readOnly:    ({ document }) => !document?.vatType || ['none', 'zero'].includes(document?.vatType as string),
      description: 'Total VAT collected from the payer. The summary above estimates 7% on exclusive-VAT lines — enter the confirmed amount here.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'amounts',
      name:        'totalAmount',
      title:       '2.4 · Total Amount (THB)',
      type:        'number',
      readOnly:    true,
      components:  { input: AutoTotalAmountInput },
      description: 'Auto-computed from subtotal + VAT. Use the override button only if the actual invoice differs.',
      validation:  Rule => Rule.required().min(0),
    }),

    defineField({
      group:        'amounts',
      name:         'currency',
      title:        '2.5 · Currency',
      type:         'string',
      initialValue: 'THB',
      options: {
        list: [
          { title: 'THB — Thai Baht', value: 'THB'   },
          { title: 'USD — US Dollar', value: 'USD'   },
          { title: 'Other',           value: 'other' },
        ],
      },
    }),

    defineField({
      group:   'amounts',
      name:    'paymentMethod',
      title:   '2.6 · Payment Method',
      type:    'string',
      options: {
        list: [
          { title: '🏦 Bank Transfer', value: 'transfer' },
          { title: '💵 Cash',          value: 'cash'     },
          { title: '📄 Cheque',        value: 'cheque'   },
          { title: '…  Other',         value: 'other'    },
        ],
      },
    }),

    defineField({
      group: 'amounts',
      name:  'paymentDate',
      title: '2.7 · Payment Received Date',
      type:  'date',
    }),

    defineField({
      group:       'amounts',
      name:        'bankReference',
      title:       '2.8 · Bank Reference / Slip No.',
      type:        'string',
      description: 'Transfer slip number, cheque number, or other payment reference.',
    }),

    defineField({
      group:       'amounts',
      name:        'bankAccount',
      title:       '2.9 · Bank Account Received Into',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { disableNew: true },
      components:  { input: BankAccountInput },
      description: 'Company bank / cash GL account that received this payment. Only active sub-accounts under Cash & Cash Equivalents are shown.',
    }),

    defineField({
      group:   'amounts',
      name:    'withholdingTaxRate',
      title:   '2.10 · Withholding Tax Rate',
      type:    'string',
      options: {
        list: [
          { title: 'None',    value: 'none'   },
          { title: '1%',      value: '1'      },
          { title: '1.5%',    value: '1.5'    },
          { title: '3%',      value: '3'      },
          { title: '5%',      value: '5'      },
          { title: '10%',     value: '10'     },
          { title: 'Custom',  value: 'custom' },
        ],
      },
      description: 'Rate the payer withholds on our behalf before transferring.',
    }),

    defineField({
      group:      'amounts',
      name:       'whtAmount',
      title:      '2.11 · WHT Amount Deducted by Payer (THB)',
      type:       'number',
      components: { input: ReceiptWhtAmountInput },
      description: 'Auto-calculated from rate × total amount. Override manually if needed.',
      hidden:     ({ document }) => !document?.withholdingTaxRate || (document?.withholdingTaxRate as string) === 'none',
    }),

    defineField({
      group:      'amounts',
      name:       'netReceivedSummary',
      title:      '2.12 · Net Received',
      type:       'string',
      readOnly:   true,
      components: { input: NetReceivedSummary },
      description: 'Total Amount − WHT deducted by payer. Actual amount transferred to our account.',
      hidden:     ({ document }) => !document?.whtAmount,
    }),

    defineField({
      group:       'amounts',
      name:        'whtCertNumber',
      title:       '2.13 · WHT Certificate No.',
      type:        'string',
      description: 'Certificate number on the ใบหักภาษี ณ ที่จ่าย issued by the payer.',
      hidden:      ({ document }) => !document?.withholdingTaxRate || (document?.withholdingTaxRate as string) === 'none',
    }),

    defineField({
      group:       'amounts',
      name:        'whtDocs',
      title:       '2.14 · WHT Certificate Documents',
      type:        'array',
      description: 'Upload the WHT certificate(s) received from the payer.',
      hidden:      ({ document }) => !document?.withholdingTaxRate || (document?.withholdingTaxRate as string) === 'none',
      of: [defineArrayMember({
        type:  'object',
        name:  'whtDoc',
        fields: [
          defineField({ name: 'doc',       title: 'Document',   type: 'file' }),
          defineField({ name: 'issueDate', title: 'Issue Date', type: 'date' }),
        ],
        preview: {
          select: { issueDate: 'issueDate' },
          prepare: ({ issueDate }: { issueDate?: string }) => ({
            title: 'WHT Certificate',
            subtitle: issueDate ?? 'No date',
          }),
        },
      })],
    }),

    // ── (Documents — part of Group 2: Amounts & Documents) ──────────────────

    defineField({
      group:       'amounts',
      name:        'receiptFile',
      title:       '2.15 · Receipt File',
      type:        'file',
      options:     { accept: '.pdf,image/*' },
      description: 'Upload the signed / issued receipt PDF or image.',
    }),

    // The exact PDF the customer received each time the invoice or the receipt
    // was sent from aquamx-shop (aquamx-handoff lib/commercial archiveIssued) —
    // same shape as quotation.issuedVersions, plus which half (kind).
    defineField({
      group: 'amounts', name: 'issuedVersions', title: '2.15b · Issued Versions', type: 'array', readOnly: true,
      description: 'The PDF as sent, written by the bot on every send — the record of what the customer received.',
      of: [{
        type: 'object', name: 'issuedVersion',
        fields: [
          defineField({ name: 'rev',      title: 'Revision',  type: 'number' }),
          defineField({ name: 'kind',     title: 'Document',  type: 'string', options: { list: [{ title: 'Invoice', value: 'invoice' }, { title: 'Receipt', value: 'receipt' }] } }),
          defineField({ name: 'issuedAt', title: 'Issued At', type: 'datetime' }),
          defineField({ name: 'pdf',      title: 'PDF as sent', type: 'file' }),
          defineField({ name: 'lang',     title: 'Language',  type: 'string' }),
          defineField({ name: 'channel',  title: 'Channel',   type: 'string' }),
          defineField({ name: 'to',       title: 'Sent To',   type: 'string' }),
          defineField({ name: 'sentBy',   title: 'Sent By',   type: 'string' }),
        ],
        preview: {
          select: { rev: 'rev', kind: 'kind', issuedAt: 'issuedAt', to: 'to' },
          prepare: ({ rev, kind, issuedAt, to }: any) => ({ title: `${kind === 'receipt' ? 'Receipt' : 'Invoice'} · Rev.${rev ?? '-'} · ${issuedAt ? String(issuedAt).slice(0, 10) : '-'}`, subtitle: to }),
        },
      }],
    }),

    defineField({
      group: 'amounts',
      name:  'internalNotes',
      title: '2.16 · Internal Notes',
      type:  'text',
      rows:  3,
    }),

    defineField({
      group:    'amounts',
      name:     'voidedAt',
      title:    'Voided At',
      type:     'datetime',
      readOnly: true,
      hidden:   ({ document }) => (document?.status as string) !== 'voided',
    }),

    defineField({
      group:    'amounts',
      name:     'voidedReason',
      title:    'Void Reason',
      type:     'string',
      hidden:   ({ document }) => (document?.status as string) !== 'voided',
      validation: Rule => Rule.custom((value, context) => {
        if ((context.document?.status as string) !== 'voided') return true
        if (!value?.trim()) return 'A reason is required when voiding a receipt.'
        return true
      }),
    }),

    accountingEntryField,

  ],

  preview: {
    select: {
      number:  'receiptNumber',
      status:  'status',
      payer:   'payer.legalName_en',
      total:   'totalAmount',
      period:  'billingPeriod',
      type:    'receiptType',
    },
    prepare({ number, status, payer, total, period, type }: {
      number?: string; status?: string; payer?: string; total?: number; period?: string; type?: string
    }) {
      const statusLabel: Record<string, string> = {
        draft:  '📝 Draft',
        issued: '✅ Issued',
        voided: '🚫 Voided',
      }
      const typeIcon: Record<string, string> = {
        receipt_only: '🧾',
        tax_invoice:  '📄',
        combined:     '📋',
      }
      return {
        title:    `${typeIcon[type ?? ''] ?? '🧾'} ${number ?? '(no number)'}${payer ? ` — ${payer}` : ''}`,
        subtitle: [
          statusLabel[status ?? ''] ?? '',
          period ?? '',
          total != null ? `${Number(total).toLocaleString()} THB` : '',
        ].filter(Boolean).join('  ·  '),
      }
    },
  },
})
