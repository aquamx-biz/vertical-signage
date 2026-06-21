import { defineField, defineType } from 'sanity'

/**
 * Vendor Login — activity record for the public submit portal (aquamx.biz/submit).
 *
 * Auto-created by the Netlify auth functions the first time someone signs in
 * (email OTP or LINE), then updated on every subsequent login. This lets us
 * see warm leads — people who signed in but have NOT yet submitted a store.
 *
 * NOT a CRM sales lead (see the separate `lead` type, which is property inquiries).
 *
 *   recordLogin()   → upsert on each sign-in (firstLoginAt / lastLoginAt / loginCount)
 *   markSubmitted() → flipped to hasSubmitted=true + linked provider when they submit
 *
 * PII note: we store the email/LINE the user provided at sign-in. Use only to
 * follow up about listing their store — do not share with third parties.
 */
export default defineType({
  name:  'vendorLogin',
  title: 'Vendor Login',
  type:  'document',

  fields: [
    defineField({
      name:        'identity',
      title:       'Identity',
      type:        'string',
      readOnly:    true,
      description: 'Login key — email:<email> or line:<userId>. Set automatically.',
    }),
    defineField({
      name:    'method',
      title:   'Login Method',
      type:    'string',
      options: {
        list: [
          { title: '✉️ Email (OTP)', value: 'email' },
          { title: '💬 LINE',        value: 'line'  },
        ],
      },
      readOnly: true,
    }),
    defineField({ name: 'email',       title: 'Email',             type: 'string', readOnly: true }),
    defineField({ name: 'lineId',      title: 'LINE User ID',      type: 'string', readOnly: true }),
    defineField({ name: 'displayName', title: 'LINE Display Name', type: 'string', readOnly: true }),

    defineField({
      name:        'hasSubmitted',
      title:       'Submitted a store?',
      type:        'boolean',
      description: 'False = signed in but never submitted (warm lead). Auto-set true on submit.',
      initialValue: false,
    }),
    defineField({
      name:        'provider',
      title:       'Linked Provider',
      type:        'reference',
      to:          [{ type: 'provider' }],
      readOnly:    true,
      description: 'Set automatically when this login submits a store.',
    }),

    defineField({ name: 'firstLoginAt', title: 'First Login',  type: 'datetime', readOnly: true }),
    defineField({ name: 'lastLoginAt',  title: 'Last Login',   type: 'datetime', readOnly: true }),
    defineField({ name: 'submittedAt',  title: 'Submitted At', type: 'datetime', readOnly: true }),
    defineField({ name: 'loginCount',   title: 'Login Count',  type: 'number',   readOnly: true }),
  ],

  orderings: [
    { name: 'lastLoginDesc', title: 'Last login (newest)', by: [{ field: 'lastLoginAt', direction: 'desc' }] },
  ],

  preview: {
    select: { email: 'email', name: 'displayName', method: 'method', submitted: 'hasSubmitted', count: 'loginCount' },
    prepare({ email, name, method, submitted, count }) {
      const who = email || name || '(unknown)'
      const m = method === 'line' ? '💬' : '✉️'
      return {
        title:    `${m} ${who}`,
        subtitle: [submitted ? '✅ submitted' : '🕓 not submitted', (count || 0) + ' login(s)'].join(' · '),
      }
    },
  },
})
