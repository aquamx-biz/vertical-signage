import { defineField, defineType, defineArrayMember } from 'sanity'
import { createAutoNumberInput }  from '../components/AutoNumberInput'
import { makeGlAccountInput }     from '../components/GlAccountInput'
import { OrderLineItemsInput }    from '../components/OrderLineItemsInput'

const OrderNumberInput      = createAutoNumberInput('order', { fixedPrefix: 'ORD', dateField: 'orderDate' })
const GlAccountRevenueInput = makeGlAccountInput(['revenue'], { allowCreditBalance: true })

/**
 * Order — what a customer agreed to buy from us, and whether they have paid for it.
 *
 * This is the missing link between the Rate Card (a published price list) and a
 * Receipt (money already in the bank). Without it there is nothing for a payment
 * gateway to attach a webhook to.
 *
 * DESIGN NOTE — read before adding fields.
 *
 * The revenue model is not settled: nobody yet knows how many revenue streams
 * there will be or how each is priced. That uncertainty is deliberately kept OUT
 * of this schema. What lives here is only the accounting spine, which does not
 * change when the product does:
 *
 *     who owes us → how much → paid how much → which receipts → posted to which GL
 *
 * What varies lives in DATA, on Process Setup → Revenue Config:
 *     the list of revenue streams  → Process Setup documents with useForOrder
 *     the list of billable lines   → receiptCharges[]
 *     prices, VAT defaults, GL     → fields on each charge
 *     the shape of the money       → defaultBillingModel
 *
 * Adding a revenue stream must never require touching this file.
 *
 * The design was checked against the four money shapes visible in the business
 * today. The awkward one is success_fee (property brokerage: free to list, we
 * take a cut of the commission) — the amount is unknown until the deal closes,
 * which is why `amountDue` is deliberately NOT required for it. An order that
 * forces an amount at creation time cannot represent that revenue at all.
 *
 * Lifecycle: draft → awaiting_payment → partially_paid → paid → cancelled
 * Fulfilment is tracked separately: paying and going live are different events.
 */
export default defineType({
  name:  'order',
  title: 'Order',
  type:  'document',

  groups: [
    { name: 'header',     title: '1. Order Setup', default: true },
    { name: 'amounts',    title: '2. Lines & Amounts'            },
    { name: 'settlement', title: '3. Settlement'                 },
    { name: 'fulfilment', title: '4. Fulfilment'                 },
  ],

  orderings: [
    { title: 'Order Date — Newest', name: 'dateDesc', by: [{ field: 'orderDate',   direction: 'desc' }] },
    { title: 'Order Date — Oldest', name: 'dateAsc',  by: [{ field: 'orderDate',   direction: 'asc'  }] },
    { title: 'Order No — Newest',   name: 'numDesc',  by: [{ field: 'orderNumber', direction: 'desc' }] },
    { title: 'Amount — Highest',    name: 'amtDesc',  by: [{ field: 'amountDue',   direction: 'desc' }] },
    { title: 'Status',              name: 'status',   by: [{ field: 'status',      direction: 'asc'  }] },
  ],

  fields: [

    // ── Group 1: Order Setup ─────────────────────────────────────────────────

    defineField({
      group:       'header',
      name:        'orderNumber',
      title:       '1.1 · Order Number',
      type:        'string',
      description: 'Auto-generated. Format: ORD-yymm-001.',
      components:  { input: OrderNumberInput },
      validation:  Rule => Rule.custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = (await client.fetch(
          `count(*[_type == "order" && orderNumber == $num && _id != $self && !(_id in path("drafts.**"))])`,
          { num: value, self: selfId ?? '' },
        )) as number
        return count === 0 ? true : `"${value}" is already used by another order — regenerate to get a unique number.`
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
          { title: '📝 Draft — still being put together',            value: 'draft'          },
          { title: '⏳ Awaiting Payment — sent to the customer',      value: 'awaiting_payment' },
          { title: '◐ Partially Paid — deposit or WHT shortfall',    value: 'partially_paid' },
          { title: '✅ Paid — settled in full',                       value: 'paid'           },
          { title: '🚫 Cancelled',                                    value: 'cancelled'      },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:      'header',
      name:       'orderDate',
      title:      '1.3 · Order Date',
      type:       'date',
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'customer',
      title:       '1.4 · Customer',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'The party that owes us this money.',
      options:     { disableNew: true },
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'processSetup',
      title:       '1.5 · Revenue Stream',
      type:        'reference',
      to:          [{ type: 'contractType' }],
      options: {
        disableNew: true,
        filter:     'useForOrder == true && isActive == true',
      },
      description: 'Which revenue stream this order sells. The list comes from Process Setup — add a new stream there, not here.',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'billingModel',
      title:       '1.6 · Billing Model',
      type:        'string',
      description: 'Defaults from the Revenue Stream. Change it only when this particular deal is billed differently.',
      options: {
        list: [
          { title: 'One-time',    value: 'one_time'    },
          { title: 'Recurring',   value: 'recurring'   },
          { title: 'Success fee', value: 'success_fee' },
          { title: 'Milestone',   value: 'milestone'   },
        ],
        layout: 'radio',
      },
      initialValue: 'one_time',
      validation:   Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'source',
      title:       '1.7 · Sold Against',
      type:        'reference',
      to: [
        { type: 'offer'           },
        { type: 'provider'        },
        { type: 'projectSite'     },
        { type: 'saleOpportunity' },
        { type: 'lead'            },
        { type: 'unitProfile'     },
      ],
      options:     { disableNew: true },
      description: 'What is being sold, or the deal this order came out of. Left open on purpose — an ad placement, a brokerage deal and a screen install all point somewhere different.',
    }),

    defineField({
      group:       'header',
      name:        'periodStart',
      title:       '1.8 · Period Start',
      type:        'date',
      description: 'First day of airtime / service covered by this order.',
      hidden:      ({ document }) => (document?.billingModel as string) === 'success_fee',
    }),

    defineField({
      group:       'header',
      name:        'periodEnd',
      title:       '1.9 · Period End',
      type:        'date',
      hidden:      ({ document }) => (document?.billingModel as string) === 'success_fee',
      validation:  Rule => Rule.custom((value, context) => {
        const start = context.document?.periodStart as string | undefined
        if (!value || !start) return true
        return value >= start ? true : 'Period End cannot be before Period Start.'
      }),
    }),

    // ── Group 2: Lines & Amounts ─────────────────────────────────────────────

    defineField({
      group:       'amounts',
      name:        'lines',
      title:       '2.1 · Order Lines',
      type:        'array',
      description: 'Snapshot of the charge catalogue at the time the order was raised. Later edits to Revenue Config never rewrite this.',
      components:  { input: OrderLineItemsInput },
      of: [defineArrayMember({
        type:  'object',
        name:  'orderLine',
        title: 'Order Line',
        fields: [
          defineField({
            name:        'sourceChargeKey',
            title:       'Catalogue Charge Key',
            type:        'string',
            readOnly:    true,
            description: '_key of the Process Setup receiptCharge this line was copied from.',
          }),
          defineField({
            name:       'description_en',
            title:      'Description (English)',
            type:       'string',
            validation: Rule => Rule.required(),
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
            name:        'unitPrice',
            title:       'Unit Price (THB)',
            type:        'number',
            description: 'Leave blank on a success-fee line until the deal closes and the fee is known.',
            validation:  Rule => Rule.min(0),
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
            description: 'Stored snapshot: quantity × unit price.',
          }),
        ],
        preview: {
          select: { desc: 'description_en', qty: 'quantity', price: 'unitPrice', vatType: 'vatType', lineTotal: 'lineTotal' },
          prepare({ desc, qty, price, vatType, lineTotal }: {
            desc?: string; qty?: number; price?: number; vatType?: string; lineTotal?: number
          }) {
            const vatLabel: Record<string, string> = {
              exclusive: '+VAT', inclusive: 'incl. VAT', zero: '0% VAT', none: 'no VAT',
            }
            const total = lineTotal ?? (price != null ? (qty ?? 1) * price : undefined)
            return {
              title:    desc ?? '—',
              subtitle: [
                total != null
                  ? `${qty ?? 1} × ${Number(price ?? 0).toLocaleString()} = ${Number(total).toLocaleString()} THB`
                  : 'amount to be set',
                vatLabel[vatType ?? ''] ?? '',
              ].filter(Boolean).join('  ·  '),
            }
          },
        },
      })],
    }),

    defineField({
      group:       'amounts',
      name:        'amountDue',
      title:       '2.2 · Amount Due (THB)',
      type:        'number',
      description: 'What the customer owes, before VAT. Blank is valid on a success-fee order until the deal closes.',
      validation:  Rule => Rule.min(0).custom((value, context) => {
        const model  = context.document?.billingModel as string | undefined
        const status = context.document?.status       as string | undefined
        if (value != null) return true
        // The whole point of success_fee is that this is unknown at creation —
        // only demand a number once we are actually asking to be paid.
        if (model === 'success_fee' && (status === 'draft' || status === 'awaiting_payment')) return true
        if (status === 'draft') return true
        return 'Amount Due is required before an order can move past draft.'
      }),
    }),

    defineField({
      group:   'amounts',
      name:    'vatType',
      title:   '2.3 · VAT Type',
      type:    'string',
      options: {
        list: [
          { title: 'Exclusive — VAT added on top', value: 'exclusive' },
          { title: 'Inclusive — VAT already in the price', value: 'inclusive' },
          { title: '0% VAT', value: 'zero' },
          { title: 'No VAT', value: 'none' },
        ],
        layout: 'radio',
      },
      initialValue: 'exclusive',
    }),

    defineField({
      group:       'amounts',
      name:        'vatAmount',
      title:       '2.4 · VAT Amount (THB)',
      type:        'number',
      readOnly:    ({ document }) => !document?.vatType || ['none', 'zero'].includes(document?.vatType as string),
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'amounts',
      name:        'totalAmount',
      title:       '2.5 · Total Amount (THB)',
      type:        'number',
      description: 'Amount Due + VAT. This is the figure on the invoice — NOT necessarily the figure that arrives in the bank (see 3.2).',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:        'amounts',
      name:         'currency',
      title:        '2.6 · Currency',
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

    // ── Group 3: Settlement ──────────────────────────────────────────────────
    // amountPaid is kept separate from totalAmount on purpose. A corporate
    // customer withholds 3% WHT, so the bank credit is smaller than the invoice
    // by design — treating "not equal" as "unpaid" would leave every B2B order
    // stuck. Same field carries gateway settlement later.

    defineField({
      group:   'settlement',
      name:    'withholdingTaxRate',
      title:   '3.1 · Withholding Tax Rate',
      type:    'string',
      options: {
        list: [
          { title: 'None',   value: 'none'   },
          { title: '1%',     value: '1'      },
          { title: '1.5%',   value: '1.5'    },
          { title: '3%',     value: '3'      },
          { title: '5%',     value: '5'      },
          { title: '10%',    value: '10'     },
          { title: 'Custom', value: 'custom' },
        ],
      },
      initialValue: 'none',
      description:  'Rate the customer withholds before transferring. Service fees to a company are normally 3%.',
    }),

    defineField({
      group:       'settlement',
      name:        'whtAmount',
      title:       '3.2 · WHT Deducted by Customer (THB)',
      type:        'number',
      hidden:      ({ document }) => !document?.withholdingTaxRate || (document?.withholdingTaxRate as string) === 'none',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'settlement',
      name:        'amountPaid',
      title:       '3.3 · Amount Actually Received (THB)',
      type:        'number',
      initialValue: 0,
      description: 'Sum of what has landed in our account so far. An order is settled when amountPaid + WHT covers totalAmount.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'settlement',
      name:        'receipts',
      title:       '3.4 · Receipts Issued',
      type:        'array',
      description: 'One order can produce several receipts — a deposit, a balance, a monthly period. Receipts remain the only accounting document; this order never posts to the GL itself.',
      of: [defineArrayMember({
        type: 'reference',
        to:   [{ type: 'receipt' }],
        options: { disableNew: true },
      })],
    }),

    defineField({
      group:       'settlement',
      name:        'paymentMethod',
      title:       '3.5 · Payment Method',
      type:        'string',
      options: {
        list: [
          { title: '🏦 Bank Transfer',       value: 'transfer' },
          { title: '📱 PromptPay QR',        value: 'promptpay' },
          { title: '💳 Card / Gateway',      value: 'gateway'  },
          { title: '💵 Cash',                value: 'cash'     },
          { title: '📄 Cheque',              value: 'cheque'   },
          { title: '…  Other',               value: 'other'    },
        ],
      },
    }),

    defineField({
      group:       'settlement',
      name:        'gatewayRef',
      title:       '3.6 · Gateway / Slip Reference',
      type:        'string',
      description: 'Charge id from the payment gateway, or the transfer slip number. Reserved as the idempotency anchor for the future payment webhook — one reference, one settlement.',
    }),

    // ── Group 4: Fulfilment ──────────────────────────────────────────────────
    // Paid and delivered are different events. An ad can be paid weeks before it
    // airs; a brokerage fee is only invoiced after delivery.

    defineField({
      group:        'fulfilment',
      name:         'fulfilmentStatus',
      title:        '4.1 · Fulfilment',
      type:         'string',
      initialValue: 'not_started',
      options: {
        list: [
          { title: '⚪ Not started',           value: 'not_started' },
          { title: '🟢 Live / in progress',    value: 'live'        },
          { title: '🔵 Completed',             value: 'completed'   },
          { title: '🚫 Cancelled',             value: 'cancelled'   },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group: 'fulfilment',
      name:  'goLiveDate',
      title: '4.2 · Went Live On',
      type:  'date',
    }),

    defineField({
      group: 'fulfilment',
      name:  'internalNotes',
      title: '4.3 · Internal Notes',
      type:  'text',
      rows:  3,
    }),

  ],

  preview: {
    select: {
      number:   'orderNumber',
      status:   'status',
      customer: 'customer.legalName_en',
      total:    'totalAmount',
      due:      'amountDue',
      model:    'billingModel',
      stream:   'processSetup.name',
    },
    prepare({ number, status, customer, total, due, model, stream }: {
      number?: string; status?: string; customer?: string; total?: number
      due?: number; model?: string; stream?: string
    }) {
      const statusLabel: Record<string, string> = {
        draft:            '📝 Draft',
        awaiting_payment: '⏳ Awaiting payment',
        partially_paid:   '◐ Partially paid',
        paid:             '✅ Paid',
        cancelled:        '🚫 Cancelled',
      }
      const modelIcon: Record<string, string> = {
        one_time: '🧾', recurring: '🔁', success_fee: '🤝', milestone: '🪜',
      }
      const amount = total ?? due
      return {
        title:    `${modelIcon[model ?? ''] ?? '🧾'} ${number ?? '(no number)'}${customer ? ` — ${customer}` : ''}`,
        subtitle: [
          statusLabel[status ?? ''] ?? '',
          stream ?? '',
          amount != null ? `${Number(amount).toLocaleString()} THB` : 'amount TBC',
        ].filter(Boolean).join('  ·  '),
      }
    },
  },
})
