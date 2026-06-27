import { defineField, defineType } from 'sanity'
import { RatecardLiveNote } from '../components/RatecardLiveNote'

// Singleton — _id is always "ratecard-sme".
// Drives the public pricing table at aquamx.biz/ratecard-sme.
// The landing site does NOT read this at runtime; a Netlify build step
// (aquamx-landing/scripts/build-ratecard.js) bakes these values into the
// static HTML on deploy. Publish here → (webhook) → Netlify rebuild → live.
//
// Bilingual fields use { th, en }. Numbers (prices, seconds, plays) are
// language-neutral and shown verbatim. Feature cells render as:
//   check → ✓   ·   cross → —   ·   text → the typed text (e.g. "×1")

const localeString = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: 'object',
    options: { columns: 2 },
    fields: [
      defineField({ name: 'th', title: 'Thai',    type: 'string' }),
      defineField({ name: 'en', title: 'English', type: 'string' }),
    ],
  })

export default defineType({
  name: 'ratecard',
  title: 'Rate Card',
  type: 'document',
  fields: [
    // Read-only banner: shows which public page this drives (hardcoded URL).
    defineField({
      name: 'liveNote',
      title: 'Live page',
      type: 'string',
      readOnly: true,
      components: { field: RatecardLiveNote },
    }),
    defineField({
      name: 'title',
      title: 'Internal Title',
      type: 'string',
      initialValue: 'Rate Card — SME',
      readOnly: true,
      description: 'Internal label only — not shown on the website.',
    }),

    // ── Tiers (table columns) ──────────────────────────────────────────────
    defineField({
      name: 'tiers',
      title: 'Packages (columns)',
      type: 'array',
      description: 'Each entry is one pricing column, left to right. Usually 4.',
      validation: Rule => Rule.required().min(1).max(6),
      of: [{
        type: 'object',
        name: 'tier',
        fields: [
          defineField({ name: 'name', title: 'Package Name', type: 'string', validation: Rule => Rule.required(), description: 'e.g. Starter, Booster, Pro, Premium (shown the same in both languages).' }),
          defineField({ name: 'popular', title: '★ Most Popular', type: 'boolean', initialValue: false, description: 'Highlights this column with the orange "Most Popular" badge.' }),
          defineField({ name: 'pricePerWeek',   title: 'Price / week (฿)',   type: 'number', validation: Rule => Rule.required().min(0) }),
          defineField({ name: 'billedPerMonth', title: 'Billed / month (฿)', type: 'number', validation: Rule => Rule.required().min(0), description: 'Shown as the small "billed ฿X monthly" sub-line.' }),
          defineField({ name: 'displaySeconds', title: 'Display time (seconds)', type: 'number', validation: Rule => Rule.required().min(0) }),
          defineField({ name: 'playsPerDay',    title: 'Frequency (plays / day)', type: 'number', validation: Rule => Rule.required().min(0) }),
        ],
        preview: {
          select: { name: 'name', price: 'pricePerWeek', popular: 'popular' },
          prepare: ({ name, price, popular }) => ({
            title: `${popular ? '★ ' : ''}${name ?? '(unnamed)'}`,
            subtitle: price != null ? `฿${price} / week` : '',
          }),
        },
      }],
    }),

    // ── Row labels (left column, bilingual) ────────────────────────────────
    localeString('priceRowLabel',   'Row label — Price'),
    localeString('displayRowLabel', 'Row label — Display time'),
    localeString('freqRowLabel',    'Row label — Frequency'),
    localeString('secondsUnit',     'Unit — seconds (under display time)'),
    localeString('perDayUnit',      'Unit — per day (under frequency)'),

    // Billed sub-line template. {n} is replaced with each tier's Billed/month.
    defineField({
      name: 'billedFormat',
      title: 'Billed sub-line format',
      type: 'object',
      options: { columns: 2 },
      description: 'Use {n} where the amount goes. e.g. Thai "เรียกเก็บ ฿{n}/เดือน", English "billed ฿{n} monthly".',
      fields: [
        defineField({ name: 'th', title: 'Thai',    type: 'string', initialValue: 'เรียกเก็บ ฿{n}/เดือน' }),
        defineField({ name: 'en', title: 'English', type: 'string', initialValue: 'billed ฿{n} monthly' }),
      ],
    }),

    // ── Feature matrix ─────────────────────────────────────────────────────
    defineField({
      name: 'featureGroups',
      title: 'Feature Groups',
      type: 'array',
      description: 'Grouped feature rows (e.g. "Media type", "Standard CTA"). Each row has one cell per package, in the same order as the columns above.',
      of: [{
        type: 'object',
        name: 'featureGroup',
        fields: [
          localeString('label', 'Group Heading'),
          defineField({
            name: 'rows',
            title: 'Rows',
            type: 'array',
            of: [{
              type: 'object',
              name: 'featureRow',
              fields: [
                localeString('label', 'Feature Label'),
                defineField({
                  name: 'cells',
                  title: 'Cells (one per package, in column order)',
                  type: 'array',
                  description: 'Add one cell per package. ✓ = included, — = not included, or type a value like "×1".',
                  of: [{
                    type: 'object',
                    name: 'cell',
                    fields: [
                      defineField({
                        name: 'type',
                        title: 'Type',
                        type: 'string',
                        initialValue: 'check',
                        options: { list: [
                          { title: '✓ Included',     value: 'check' },
                          { title: '— Not included', value: 'cross' },
                          { title: 'Custom text (e.g. ×1)', value: 'text' },
                        ], layout: 'radio' },
                      }),
                      defineField({
                        name: 'text',
                        title: 'Custom text',
                        type: 'string',
                        hidden: ({ parent }) => (parent as any)?.type !== 'text',
                        description: 'Shown only when Type = Custom text. e.g. "×1", "×2".',
                      }),
                    ],
                    preview: {
                      select: { type: 'type', text: 'text' },
                      prepare: ({ type, text }) => ({
                        title: type === 'text' ? (text || '(empty)') : type === 'cross' ? '—' : '✓',
                      }),
                    },
                  }],
                }),
              ],
              preview: {
                select: { th: 'label.th', en: 'label.en' },
                prepare: ({ th, en }) => ({ title: th || en || '(row)' }),
              },
            }],
          }),
        ],
        preview: {
          select: { th: 'label.th', en: 'label.en', rows: 'rows' },
          prepare: ({ th, en, rows }) => ({
            title: th || en || '(group)',
            subtitle: `${rows?.length ?? 0} row(s)`,
          }),
        },
      }],
    }),
  ],

  preview: {
    prepare: () => ({ title: 'Rate Card — SME' }),
  },
})
