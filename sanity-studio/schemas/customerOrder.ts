import { defineField, defineType, defineArrayMember } from 'sanity'
import { createAutoNumberInput } from '../components/AutoNumberInput'

const OrderNumberInput = createAutoNumberInput('customerOrder', { fixedPrefix: 'CO', dateField: 'placedAt' })

/**
 * Customer Order — what someone bought from a SHOP through the handoff page.
 *
 * NOT the same thing as `order`. Keep them apart:
 *   order          → an advertiser buys screen time FROM AquaMX. Gross is our revenue.
 *   customerOrder  → a customer buys food FROM A SHOP, and the money merely
 *                    passes through our account. Gross is NOT our revenue.
 *
 * That distinction is the whole reason this document exists. A ฿500 order is
 * ฿500 of cash in, of which perhaps ฿25 is ours and ฿475 is a debt to the shop
 * from the instant the payment clears. Booking the gross as revenue would
 * overstate income by twenty times and put the wrong number on a tax return,
 * so the split is stored explicitly on every order rather than derived later
 * from a percentage nobody wrote down.
 *
 * Lifecycle: pending_payment → paid → (refunded) · failed · cancelled
 * Paying the shop is tracked separately in group 5: money can be collected
 * today and settled to the shop next week, and until it is settled it is a
 * liability we are holding, not income.
 */
export default defineType({
  name:  'customerOrder',
  title: 'Customer Order',
  type:  'document',

  groups: [
    { name: 'header',  title: '1. Order & Customer', default: true },
    { name: 'items',   title: '2. Items'                           },
    { name: 'money',   title: '3. Money'                           },
    { name: 'payment', title: '4. Payment & Refund'                },
    { name: 'payout',  title: '5. Paying the Shop'                 },
  ],

  orderings: [
    { title: 'Placed — Newest',  name: 'placedDesc', by: [{ field: 'placedAt',    direction: 'desc' }] },
    { title: 'Order No',         name: 'numDesc',    by: [{ field: 'customerOrderNumber', direction: 'desc' }] },
    { title: 'Status',           name: 'status',     by: [{ field: 'status',      direction: 'asc'  }] },
    { title: 'Owed to shop',     name: 'owed',       by: [{ field: 'merchantPayable', direction: 'desc' }] },
  ],

  fields: [

    // ── 1. Order & Customer ──────────────────────────────────────────────────

    defineField({
      group:       'header',
      // Named customerOrderNumber, not orderNumber: the doc-number API derives
      // the field it counts as `${docType}Number`, and `order` already owns
      // orderNumber. Two types sharing a field name would also make every
      // cross-type GROQ ambiguous.
      name:        'customerOrderNumber',
      title:       '1.1 · Order Number',
      type:        'string',
      description: 'Auto-generated. Format: CO-yymm-001.',
      components:  { input: OrderNumberInput },
      validation:  Rule => Rule.custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = (await client.fetch(
          `count(*[_type == "customerOrder" && customerOrderNumber == $num && _id != $self && !(_id in path("drafts.**"))])`,
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
      initialValue: 'pending_payment',
      options: {
        list: [
          { title: '⏳ Awaiting payment', value: 'pending_payment' },
          { title: '✅ Paid',             value: 'paid'            },
          { title: '⚠️ Payment failed',   value: 'failed'          },
          { title: '🚫 Cancelled',        value: 'cancelled'       },
          { title: '↩️ Refunded',         value: 'refunded'        },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:      'header',
      name:       'placedAt',
      title:      '1.3 · Placed At',
      type:       'datetime',
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:       'header',
      name:        'provider',
      title:       '1.4 · Shop',
      type:        'reference',
      to:          [{ type: 'provider' }],
      options:     { disableNew: true },
      description: 'Who the money is owed to. Their bank details live on the linked Party, not here.',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:   'header',
      name:    'offer',
      title:   '1.5 · Offer',
      type:    'reference',
      to:      [{ type: 'offer' }],
      options: { disableNew: true },
    }),

    defineField({
      group:       'header',
      name:        'lead',
      title:       '1.6 · Source Lead',
      type:        'reference',
      to:          [{ type: 'lead' }],
      options:     { disableNew: true },
      description: 'The /api/lead record this order grew out of — the shop is still notified the same way.',
    }),

    defineField({
      group:       'header',
      name:        'screenId',
      title:       '1.7 · Scanned At (screen)',
      type:        'string',
      description: 'Which kiosk the QR came from. Kept as text: it is the id the player sent, not a reference.',
    }),

    defineField({
      group: 'header',
      name:  'projectName',
      title: '1.8 · Building',
      type:  'string',
    }),

    defineField({
      group: 'header',
      name:  'customerName',
      title: '1.9 · Customer Name',
      type:  'string',
    }),

    defineField({
      group:       'header',
      name:        'customerPhone',
      title:       '1.10 · Customer Phone',
      type:        'string',
      description: 'Also the identity used for per-customer discount limits.',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:        'header',
      name:         'fulfillment',
      title:        '1.11 · Fulfillment',
      type:         'string',
      options: {
        list: [
          { title: 'Dine-in',  value: 'dine_in'  },
          { title: 'Delivery', value: 'delivery' },
          { title: 'Pickup',   value: 'pickup'   },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:  'header',
      name:   'deliveryAddress',
      title:  '1.12 · Delivery Address',
      type:   'text',
      rows:   2,
      hidden: ({ document }) => (document?.fulfillment as string) !== 'delivery',
    }),

    defineField({
      group: 'header',
      name:  'customerNote',
      title: '1.13 · Customer Note',
      type:  'text',
      rows:  2,
    }),

    // ── 2. Items ─────────────────────────────────────────────────────────────
    // A snapshot, never a live reference. Shops edit their menus and prices;
    // an order must still say what was actually bought and at what price.

    defineField({
      group:       'items',
      name:        'items',
      title:       '2.1 · Items Ordered',
      type:        'array',
      description: 'Snapshot taken when the order was placed. Editing the shop menu later never changes this.',
      of: [defineArrayMember({
        type:  'object',
        name:  'orderedItem',
        fields: [
          defineField({ name: 'refCode', title: 'Ref Code',      type: 'string', readOnly: true }),
          defineField({ name: 'name_th', title: 'Name (TH)',     type: 'string' }),
          defineField({ name: 'name_en', title: 'Name (EN)',     type: 'string' }),
          defineField({
            name: 'quantity', title: 'Qty', type: 'number',
            validation: Rule => Rule.required().min(1).integer(),
          }),
          defineField({
            name: 'unitPriceTHB', title: 'Unit Price (THB)', type: 'number',
            description: 'Copied from offer.orderItems[].priceTHB — the numeric field, never the display string.',
            validation: Rule => Rule.required().min(0),
          }),
          defineField({ name: 'lineTotal', title: 'Line Total (THB)', type: 'number' }),
        ],
        preview: {
          select: { th: 'name_th', en: 'name_en', q: 'quantity', p: 'unitPriceTHB', t: 'lineTotal' },
          prepare({ th, en, q, p, t }: { th?: string; en?: string; q?: number; p?: number; t?: number }) {
            const total = t ?? (q ?? 0) * (p ?? 0)
            return {
              title:    th || en || '—',
              subtitle: `${q ?? 0} × ฿${Number(p ?? 0).toLocaleString()} = ฿${Number(total).toLocaleString()}`,
            }
          },
        },
      })],
    }),

    // ── 3. Money ─────────────────────────────────────────────────────────────
    // Written by the server when the order is created and when it settles.
    // Every figure is stored rather than computed on read, because a fee rate
    // or a discount rule that changes next month must not silently rewrite
    // what an order from last month was worth.

    defineField({
      group:      'money',
      name:       'itemsTotal',
      title:      '3.1 · Items Total (THB)',
      type:       'number',
      validation: Rule => Rule.min(0),
    }),

    defineField({
      group:       'money',
      name:        'deliveryFee',
      title:       '3.2 · Delivery Fee (THB)',
      type:        'number',
      description: 'From the offer, after any free-delivery threshold was applied.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:   'money',
      name:    'discountCode',
      title:   '3.3 · Discount Code Used',
      type:    'reference',
      to:      [{ type: 'discountCode' }],
      options: { disableNew: true },
    }),

    defineField({
      group:       'money',
      name:        'discountAmount',
      title:       '3.4 · Discount Given (THB)',
      type:        'number',
      description: 'After the code’s cap was applied.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'money',
      name:        'discountFundedBy',
      title:       '3.5 · Discount Funded By',
      type:        'string',
      readOnly:    true,
      description: 'Snapshot of the code’s setting at order time. Snapshotted on purpose: editing the code next month must not change who paid for a discount already given.',
      options: {
        list: [
          { title: 'Shop absorbed it',   value: 'provider' },
          { title: 'AquaMX absorbed it', value: 'aquamx'   },
        ],
      },
    }),

    defineField({
      group:       'money',
      name:        'amountCharged',
      title:       '3.6 · Amount Charged to Customer (THB)',
      type:        'number',
      description: 'Items + delivery − discount. This is what the gateway took, and it must equal the gateway’s own figure.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'money',
      name:        'platformFeeRate',
      title:       '3.7 · Our Fee Rate (%)',
      type:        'number',
      description: 'Snapshot of the commission rate applied to this order.',
      validation:  Rule => Rule.min(0).max(100),
    }),

    defineField({
      group:       'money',
      name:        'platformFeeAmount',
      title:       '3.8 · Our Fee (THB)',
      type:        'number',
      description: 'THE ONLY LINE ON THIS DOCUMENT THAT IS AQUAMX REVENUE. Everything else is the shop’s money in transit.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'money',
      name:        'merchantPayable',
      title:       '3.9 · Owed to Shop (THB)',
      type:        'number',
      description: 'A liability from the moment payment clears, not income. Shop-funded discount: items + delivery − discount − our fee. AquaMX-funded: items + delivery − our fee (the shop is kept whole and the discount comes out of our fee).',
      validation:  Rule => Rule.min(0),
    }),

    // ── 4. Payment & Refund ──────────────────────────────────────────────────

    defineField({
      group:   'payment',
      name:    'paymentMethod',
      title:   '4.1 · Method',
      type:    'string',
      options: {
        list: [
          { title: '📱 PromptPay QR',   value: 'promptpay' },
          { title: '💳 Card',           value: 'card'      },
          { title: '🏦 Bank transfer',  value: 'transfer'  },
        ],
      },
    }),

    defineField({
      group:       'payment',
      name:        'gatewayChargeId',
      title:       '4.2 · Gateway Charge ID',
      type:        'string',
      description: 'The payment provider’s own id. Unique — this is the idempotency anchor: gateways retry webhooks, and one charge id must never settle an order twice.',
      validation:  Rule => Rule.custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = (await client.fetch(
          `count(*[_type == "customerOrder" && gatewayChargeId == $g && _id != $self && !(_id in path("drafts.**"))])`,
          { g: value, self: selfId ?? '' },
        )) as number
        return count === 0 ? true : `Charge ${value} is already recorded on another order — settling it twice would pay the shop twice.`
      }),
    }),

    defineField({
      group: 'payment',
      name:  'paidAt',
      title: '4.3 · Paid At',
      type:  'datetime',
    }),

    defineField({
      group:  'payment',
      name:   'failureReason',
      title:  '4.4 · Failure Reason',
      type:   'string',
      hidden: ({ document }) => (document?.status as string) !== 'failed',
    }),

    defineField({
      group:       'payment',
      name:        'refundAmount',
      title:       '4.5 · Refunded (THB)',
      type:        'number',
      hidden:      ({ document }) => !['refunded', 'cancelled', 'failed'].includes(document?.status as string),
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:  'payment',
      name:   'refundedAt',
      title:  '4.6 · Refunded At',
      type:   'datetime',
      hidden: ({ document }) => !['refunded', 'cancelled', 'failed'].includes(document?.status as string),
    }),

    // Customer bank details — collected ONLY when a refund cannot go back the
    // way it came. A card or PromptPay charge refunds to source through the
    // gateway with no account number involved, so asking every customer for
    // one would be collecting personal financial data we have no use for.
    defineField({
      group:       'payment',
      name:        'refundBankAccount',
      title:       '4.7 · Customer Bank Account (manual refund only)',
      type:        'object',
      description: 'Leave empty when the refund goes back to source. Fill in only for a refund that has to be transferred by hand — then delete it once the transfer is done.',
      hidden:      ({ document }) => !['refunded', 'cancelled', 'failed'].includes(document?.status as string),
      options:     { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name:    'bankName',
          title:   'Bank',
          type:    'string',
          options: { list: [
            { title: 'กสิกรไทย (KBank)',   value: 'kbank' },
            { title: 'ไทยพาณิชย์ (SCB)',    value: 'scb'   },
            { title: 'กรุงเทพ (BBL)',       value: 'bbl'   },
            { title: 'กรุงไทย (KTB)',       value: 'ktb'   },
            { title: 'กรุงศรีอยุธยา (BAY)', value: 'bay'   },
            { title: 'ทหารไทยธนชาต (TTB)',  value: 'ttb'   },
            { title: 'ออมสิน (GSB)',        value: 'gsb'   },
            { title: 'อื่นๆ (Other)',       value: 'other' },
          ]},
        }),
        defineField({ name: 'accountName',   title: 'Account Name',   type: 'string' }),
        defineField({ name: 'accountNumber', title: 'Account Number', type: 'string' }),
      ],
    }),

    // ── 5. Paying the Shop ───────────────────────────────────────────────────

    defineField({
      group:        'payout',
      name:         'payoutStatus',
      title:        '5.1 · Payout Status',
      type:         'string',
      initialValue: 'not_due',
      options: {
        list: [
          { title: '— Not due (order not paid yet)', value: 'not_due' },
          { title: '⏳ Due — we are holding this money', value: 'due'  },
          { title: '✅ Paid to shop',                 value: 'paid'    },
          { title: '🚫 Not payable (refunded)',       value: 'void'    },
        ],
        layout: 'radio',
      },
      description: 'Everything sitting at "Due" is money in our account that belongs to someone else.',
    }),

    defineField({
      group:  'payout',
      name:   'payoutDate',
      title:  '5.2 · Paid to Shop On',
      type:   'date',
      hidden: ({ document }) => (document?.payoutStatus as string) !== 'paid',
    }),

    defineField({
      group:       'payout',
      name:        'payoutPayment',
      title:       '5.3 · Payout Payment Record',
      type:        'reference',
      to:          [{ type: 'payment' }],
      options:     { disableNew: true },
      hidden:      ({ document }) => (document?.payoutStatus as string) !== 'paid',
      description: 'The Payment document for the actual transfer, so the money leaving our account is in the ledger like any other payment.',
    }),

    defineField({
      group:       'payout',
      name:        'payoutRef',
      title:       '5.4 · Transfer Reference',
      type:        'string',
      hidden:      ({ document }) => (document?.payoutStatus as string) !== 'paid',
      description: 'Bank slip / transaction reference.',
    }),

    defineField({
      group: 'payout',
      name:  'internalNotes',
      title: '5.5 · Internal Notes',
      type:  'text',
      rows:  3,
    }),

  ],

  preview: {
    select: {
      number: 'customerOrderNumber',
      status: 'status',
      shop:   'provider.displayName',
      charged:'amountCharged',
      owed:   'merchantPayable',
      payout: 'payoutStatus',
      phone:  'customerPhone',
    },
    prepare({ number, status, shop, charged, owed, payout, phone }: {
      number?: string; status?: string; shop?: string; charged?: number
      owed?: number; payout?: string; phone?: string
    }) {
      const statusLabel: Record<string, string> = {
        pending_payment: '⏳ Awaiting payment',
        paid:            '✅ Paid',
        failed:          '⚠️ Failed',
        cancelled:       '🚫 Cancelled',
        refunded:        '↩️ Refunded',
      }
      const payoutLabel: Record<string, string> = {
        due:  '· owes shop',
        paid: '· shop paid',
        void: '· no payout',
      }
      return {
        title: `${number ?? '(no number)'}${shop ? ` — ${shop}` : ''}${phone ? ` · ${phone}` : ''}`,
        subtitle: [
          statusLabel[status ?? ''] ?? '',
          charged != null ? `฿${Number(charged).toLocaleString()} charged` : '',
          owed != null ? `฿${Number(owed).toLocaleString()} ${payoutLabel[payout ?? ''] ?? 'to shop'}` : '',
        ].filter(Boolean).join('  ·  '),
      }
    },
  },
})
