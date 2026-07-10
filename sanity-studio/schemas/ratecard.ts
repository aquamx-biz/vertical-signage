import { defineField, defineType } from 'sanity'
import { RatecardLiveNote } from '../components/RatecardLiveNote'

// Singleton — _id is always "ratecard-sme".
// Drives the public pricing table at aquamx.biz/ratecard-sme.
// The landing site does NOT read this at runtime; a Netlify build step
// (aquamx-landing/scripts/build-ratecard.js) bakes these values into the
// static HTML on deploy. Publish here → (webhook) → Netlify rebuild → live.
//
// MODEL: the table is ONE list of rows, top to bottom. Columns are the
// `tiers` (packages — headers only). Every attribute is a row, so editing
// any attribute shows all packages side by side in that row's cells:
//   • Value row   → big number + unit (Price, Display time, Frequency)
//   • Mark row    → ✓ / — / custom text per package (Video, Gallery, …)
//   • Heading row → a section divider that spans all columns
// Bilingual text uses { th, en }; numbers are language-neutral.

const localeString = (name: string, title: string, description?: string) =>
  defineField({
    name,
    title,
    type: 'object',
    options: { columns: 2 },
    description,
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

    // ── Columns: the packages (headers only) ───────────────────────────────
    defineField({
      name: 'tiers',
      title: 'Packages (columns)',
      type: 'array',
      description: 'Each entry is one pricing column, left to right. Usually 4. All prices/values live in the Rows below — this is just the column header.',
      validation: Rule => Rule.required().min(1).max(6),
      of: [{
        type: 'object',
        name: 'tier',
        fields: [
          defineField({ name: 'name', title: 'Package Name', type: 'string', validation: Rule => Rule.required(), description: 'e.g. Starter, Booster, Pro, Premium (shown the same in both languages).' }),
          defineField({ name: 'popular', title: '★ Most Popular', type: 'boolean', initialValue: false, description: 'Highlights this column with the orange "Most Popular" badge.' }),
        ],
        preview: {
          select: { name: 'name', popular: 'popular' },
          prepare: ({ name, popular }) => ({ title: `${popular ? '★ ' : ''}${name ?? '(unnamed)'}` }),
        },
      }],
    }),

    // ── Rows: the whole table body, top to bottom ──────────────────────────
    defineField({
      name: 'rows',
      title: 'Rows (the table, top to bottom)',
      type: 'array',
      description: 'One entry per table row, in display order. Each row has one cell per package (same order as the columns above). Add a Value row for numbers (price, seconds…), a Mark row for ✓/—/×N, or a Section heading to group rows.',
      of: [
        // ── Value row: big number + unit (Price, Display time, Frequency) ───
        {
          type: 'object',
          name: 'valueRow',
          title: 'Value row (big number)',
          fields: [
            localeString('label', 'Row label'),
            localeString('unit', 'Unit / sub-line', 'Small text under each number. Type {n} to insert that cell\'s "sub number" (e.g. billed/month → "เรียกเก็บ ฿{n}/เดือน"). For a constant unit like "seconds" just type it — leave the cell sub-number blank.'),
            defineField({
              name: 'cells',
              title: 'Cells (one per package, in column order)',
              type: 'array',
              validation: Rule => Rule.max(6),
              of: [{
                type: 'object',
                name: 'valueCell',
                fields: [
                  defineField({ name: 'big', title: 'Big number', type: 'string', description: 'The large value shown, e.g. "฿55", "8", "25". Type it exactly as it should appear.' }),
                  defineField({ name: 'sub', title: 'Sub-number ({n})', type: 'number', description: 'Optional. Fills {n} in the Unit above (e.g. billed/month = 220). Leave blank for rows whose unit is constant.' }),
                ],
                preview: {
                  select: { big: 'big', sub: 'sub' },
                  prepare: ({ big, sub }) => ({ title: big ?? '(empty)', subtitle: sub != null ? `{n}=${sub}` : '' }),
                },
              }],
            }),
          ],
          preview: {
            select: { th: 'label.th', en: 'label.en', cells: 'cells' },
            prepare: ({ th, en, cells }) => ({
              title: `📊  ${th || en || '(value row)'}`,
              subtitle: (cells || []).map((c: any) => c?.big ?? '·').join('   '),
            }),
          },
        },

        // ── Mark row: ✓ / — / custom text per package ──────────────────────
        {
          type: 'object',
          name: 'markRow',
          title: 'Mark row (✓ / — / ×N)',
          fields: [
            localeString('label', 'Row label'),
            defineField({
              name: 'cells',
              title: 'Cells (one per package, in column order)',
              type: 'array',
              validation: Rule => Rule.max(6),
              description: 'One cell per package. ✓ = included, — = not included, or type a value like "×1" / "5 images".',
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
                    description: 'Shown only when Type = Custom text. e.g. "×1", "5 images".',
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
            select: { th: 'label.th', en: 'label.en', cells: 'cells' },
            prepare: ({ th, en, cells }) => ({
              title: th || en || '(mark row)',
              subtitle: (cells || []).map((c: any) => c?.type === 'text' ? (c.text || '·') : c?.type === 'cross' ? '—' : '✓').join('   '),
            }),
          },
        },

        // ── Section heading: divider spanning all columns ──────────────────
        {
          type: 'object',
          name: 'heading',
          title: 'Section heading',
          fields: [ localeString('label', 'Heading') ],
          preview: {
            select: { th: 'label.th', en: 'label.en' },
            prepare: ({ th, en }) => ({ title: `▸  ${th || en || '(heading)'}` }),
          },
        },
      ],
    }),
  ],

  preview: {
    prepare: () => ({ title: 'Rate Card — SME' }),
  },
})
