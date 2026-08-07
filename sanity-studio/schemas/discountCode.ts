import { defineField, defineType, defineArrayMember } from 'sanity'

/**
 * Discount Code — a code the customer types on the handoff page.
 *
 * WHY fundedBy EXISTS (read this before adding fields).
 * Money for a handoff order passes through AquaMX: the customer pays us, we
 * owe the shop. A discount therefore has to say WHO is short-changed by it.
 *   provider → the shop absorbs it and is paid the discounted amount
 *   aquamx   → the shop is paid in full and the discount comes out of our fee
 * Without this the payout is ambiguous and someone gets quietly underpaid.
 *
 * WHY THE LIMITS ARE NOT OPTIONAL EXTRAS.
 * A code with only a percentage and a cap is valid forever, for everyone,
 * infinitely many times — and codes leak. validUntil, usageLimit and minSpend
 * are what stop one screenshot on Facebook from becoming an unbounded
 * liability, so they sit next to the percentage rather than in an "advanced"
 * section nobody opens.
 *
 * usedCount is written by the server when an order settles, never by hand.
 */
export default defineType({
  name:  'discountCode',
  title: 'Discount Code',
  type:  'document',

  groups: [
    { name: 'code',    title: '1. Code & Discount', default: true },
    { name: 'limits',  title: '2. Limits'                         },
    { name: 'scope',   title: '3. Where It Works'                  },
  ],

  orderings: [
    { title: 'Code A–Z',      name: 'codeAsc',  by: [{ field: 'code',       direction: 'asc'  }] },
    { title: 'Expiring Soon', name: 'expSoon',  by: [{ field: 'validUntil', direction: 'asc'  }] },
    { title: 'Most Used',     name: 'usedDesc', by: [{ field: 'usedCount',  direction: 'desc' }] },
  ],

  fields: [

    // ── 1. Code & Discount ───────────────────────────────────────────────────

    defineField({
      group:       'code',
      name:        'code',
      title:       '1.1 · Code',
      type:        'string',
      description: 'What the customer types. Stored and matched in UPPERCASE — no spaces.',
      validation:  Rule => Rule.required()
        .uppercase().error('Use uppercase only.')
        .regex(/^[A-Z0-9_-]+$/, { name: 'code' }).error('Letters, digits, - and _ only.')
        .custom(async (value, context) => {
          if (!value) return true
          const client = (context as any).getClient({ apiVersion: '2024-01-01' })
          const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
          const count  = (await client.fetch(
            `count(*[_type == "discountCode" && code == $c && _id != $self && !(_id in path("drafts.**"))])`,
            { c: value, self: selfId ?? '' },
          )) as number
          return count === 0 ? true : `"${value}" is already in use by another code.`
        }),
    }),

    defineField({
      group:       'code',
      name:        'title',
      title:       '1.2 · Internal Name',
      type:        'string',
      description: 'For the team. e.g. "Grand opening — 39 by Sansiri".',
    }),

    defineField({
      group:        'code',
      name:         'isActive',
      title:        '1.3 · Active',
      type:         'boolean',
      description:  'Switch off to stop the code working immediately, without deleting its history.',
      initialValue: true,
    }),

    defineField({
      group:        'code',
      name:         'discountType',
      title:        '1.4 · Discount Type',
      type:         'string',
      initialValue: 'percent',
      options: {
        list: [
          { title: 'Percent — % off the items',   value: 'percent' },
          { title: 'Fixed — flat ฿ off',          value: 'fixed'   },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:      'code',
      name:       'percent',
      title:      '1.5 · Percent Off (%)',
      type:       'number',
      hidden:     ({ document }) => (document?.discountType as string) !== 'percent',
      validation: Rule => Rule.min(0).max(100).custom((value, context) => {
        if ((context.document?.discountType as string) !== 'percent') return true
        return value == null ? 'Enter the percentage.' : true
      }),
    }),

    defineField({
      group:       'code',
      name:        'maxDiscount',
      title:       '1.6 · Maximum Discount (THB)',
      type:        'number',
      description: 'Caps what a percentage can be worth on a large basket. Blank = no cap, which on a percentage code is an open cheque.',
      hidden:      ({ document }) => (document?.discountType as string) !== 'percent',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:      'code',
      name:       'fixedAmount',
      title:      '1.7 · Fixed Amount Off (THB)',
      type:       'number',
      hidden:     ({ document }) => (document?.discountType as string) !== 'fixed',
      validation: Rule => Rule.min(0).custom((value, context) => {
        if ((context.document?.discountType as string) !== 'fixed') return true
        return value == null ? 'Enter the amount.' : true
      }),
    }),

    defineField({
      group:        'code',
      name:         'fundedBy',
      title:        '1.8 · Who Pays For It',
      type:         'string',
      initialValue: 'provider',
      description:  'Decides the payout. Shop-funded: the shop is paid the discounted amount. AquaMX-funded: the shop is paid in full and the discount comes out of our fee.',
      options: {
        list: [
          { title: 'Shop absorbs it · ร้านออกเอง',        value: 'provider' },
          { title: 'AquaMX absorbs it · เราออกให้',       value: 'aquamx'   },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:        'code',
      name:         'appliesToDelivery',
      title:        '1.9 · Also Discount the Delivery Fee',
      type:         'boolean',
      description:  'Off = the discount applies to items only and delivery is always charged in full.',
      initialValue: false,
    }),

    // ── 2. Limits ────────────────────────────────────────────────────────────

    defineField({
      group:       'limits',
      name:        'validFrom',
      title:       '2.1 · Valid From',
      type:        'date',
      description: 'Blank = valid immediately.',
    }),

    defineField({
      group:       'limits',
      name:        'validUntil',
      title:       '2.2 · Valid Until',
      type:        'date',
      description: 'Blank = never expires. Codes leak — prefer a date.',
      validation:  Rule => Rule.custom((value, context) => {
        const from = context.document?.validFrom as string | undefined
        if (!value || !from) return true
        return value >= from ? true : 'Valid Until cannot be before Valid From.'
      }),
    }),

    defineField({
      group:       'limits',
      name:        'minSpend',
      title:       '2.3 · Minimum Spend (THB)',
      type:        'number',
      description: 'Item total the basket must reach before the code is accepted.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'limits',
      name:        'usageLimitTotal',
      title:       '2.4 · Total Uses Allowed',
      type:        'number',
      description: 'Across all customers. Blank = unlimited.',
      validation:  Rule => Rule.min(1).integer(),
    }),

    defineField({
      group:        'limits',
      name:         'usageLimitPerCustomer',
      title:        '2.5 · Uses Per Customer',
      type:         'number',
      description:  'Counted by phone number, which is the only identity a handoff order has.',
      initialValue: 1,
      validation:   Rule => Rule.min(1).integer(),
    }),

    defineField({
      group:        'limits',
      name:         'usedCount',
      title:        '2.6 · Times Used',
      type:         'number',
      readOnly:     true,
      initialValue: 0,
      description:  'Incremented by the server when an order is paid. Do not edit by hand.',
    }),

    // ── 3. Where It Works ────────────────────────────────────────────────────

    defineField({
      group:        'scope',
      name:         'scope',
      title:        '3.1 · Scope',
      type:         'string',
      initialValue: 'providers',
      options: {
        list: [
          { title: 'Selected shops only',  value: 'providers' },
          { title: 'Selected offers only', value: 'offers'    },
          { title: 'Everything',           value: 'all'       },
        ],
        layout: 'radio',
      },
      description: 'An "Everything" code is spendable at every shop on every screen — including shops whose orders we have not been paid for yet.',
    }),

    defineField({
      group:      'scope',
      name:       'providers',
      title:      '3.2 · Shops',
      type:       'array',
      hidden:     ({ document }) => (document?.scope as string) !== 'providers',
      of:         [defineArrayMember({ type: 'reference', to: [{ type: 'provider' }], options: { disableNew: true } })],
      validation: Rule => Rule.custom((value, context) => {
        if ((context.document?.scope as string) !== 'providers') return true
        return (value as unknown[])?.length ? true : 'Pick at least one shop, or change the scope.'
      }),
    }),

    defineField({
      group:      'scope',
      name:       'offers',
      title:      '3.3 · Offers',
      type:       'array',
      hidden:     ({ document }) => (document?.scope as string) !== 'offers',
      of:         [defineArrayMember({ type: 'reference', to: [{ type: 'offer' }], options: { disableNew: true } })],
      validation: Rule => Rule.custom((value, context) => {
        if ((context.document?.scope as string) !== 'offers') return true
        return (value as unknown[])?.length ? true : 'Pick at least one offer, or change the scope.'
      }),
    }),

  ],

  preview: {
    select: {
      code:    'code',
      title:   'title',
      type:    'discountType',
      pct:     'percent',
      fixed:   'fixedAmount',
      cap:     'maxDiscount',
      active:  'isActive',
      until:   'validUntil',
      used:    'usedCount',
      limit:   'usageLimitTotal',
      funded:  'fundedBy',
    },
    prepare({ code, title, type, pct, fixed, cap, active, until, used, limit, funded }: {
      code?: string; title?: string; type?: string; pct?: number; fixed?: number
      cap?: number; active?: boolean; until?: string; used?: number; limit?: number; funded?: string
    }) {
      const value = type === 'fixed'
        ? `฿${Number(fixed ?? 0).toLocaleString()} off`
        : `${pct ?? 0}% off${cap ? ` (max ฿${Number(cap).toLocaleString()})` : ''}`
      const expired = !!until && until < new Date().toISOString().slice(0, 10)
      return {
        title: `${active === false ? '⏸ ' : expired ? '⌛ ' : '🎟 '}${code ?? '(no code)'}${title ? ` — ${title}` : ''}`,
        subtitle: [
          value,
          funded === 'aquamx' ? 'we pay' : 'shop pays',
          limit ? `${used ?? 0}/${limit} used` : `${used ?? 0} used`,
          until ? `until ${until}` : 'no expiry',
        ].join('  ·  '),
      }
    },
  },
})
