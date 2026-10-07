import { defineField, defineType, defineArrayMember } from 'sanity'
import { TranslateFromSelect }    from '../components/TranslateFromSelect'
import { FormulaBaseFieldSelect }   from '../components/FormulaBaseFieldSelect'
import { FormulaAmountFieldSelect } from '../components/FormulaAmountFieldSelect'

/**
 * ContractType — defines a category of contract (e.g. Rental, Service, Ad).
 *
 * Each type carries:
 *  - Display names for the contract and quotation documents
 *  - Number prefixes  (e.g. REJ / QTJ for Rental)
 *  - Google Doc template IDs for generation
 *
 * Adding a new contract type requires NO code changes — just create a new
 * document here in Studio, fill in the fields, and publish.
 */
export default defineType({
  name:  'contractType',
  title: 'Contract Type',
  type:  'document',

  fields: [
    defineField({
      name:        'name',
      title:       'Contract Type Name',
      type:        'string',
      description: 'e.g. "Rental Contract", "Service Contract", "Ad Contract"',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      name:        'quotationName',
      title:       'Quotation Name',
      type:        'string',
      description: 'e.g. "Rental Quotation", "Service Quotation"',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      name:        'isActive',
      title:       'Active',
      type:        'boolean',
      description: 'Inactive types are hidden from the contract type selector.',
      initialValue: true,
    }),

    defineField({
      name:        'description',
      title:       'Description',
      type:        'text',
      rows:        2,
      description: 'Optional internal note about when to use this type.',
    }),

    // ── Numbering ─────────────────────────────────────────────────────────────
    defineField({
      name:        'contractPrefix',
      title:       'Contract Number Prefix',
      type:        'string',
      description: 'e.g. "REJ" → generates REJ-2026-03-001. 2–5 uppercase letters.',
      validation:  Rule => Rule.required().uppercase().min(2).max(5),
    }),

    defineField({
      name:        'quotationPrefix',
      title:       'Quotation Number Prefix',
      type:        'string',
      description: 'e.g. "QTJ" → generates QTJ-2026-03-001. 2–5 uppercase letters.',
      validation:  Rule => Rule.required().uppercase().min(2).max(5),
    }),

    // ── Google Doc Templates ──────────────────────────────────────────────────
    defineField({
      name:        'contractTemplateId',
      title:       'Contract Google Doc Template ID',
      type:        'string',
      description: 'The ID from the Google Doc URL: docs.google.com/document/d/THIS_PART/edit',
    }),

    defineField({
      name:        'quotationTemplateId',
      title:       'Quotation Google Doc Template ID',
      type:        'string',
      description: 'The ID from the Google Doc URL: docs.google.com/document/d/THIS_PART/edit',
    }),

    defineField({
      name:        'fieldDefinitions',
      title:       'Contract Fields',
      type:        'array',
      description: 'Define the fields for this contract type. The Key must match the {{placeholder}} used in your Google Doc template.',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name:        'key',
              title:       'Key',
              type:        'string',
              description: 'Machine-readable, no spaces. e.g. "rentalRate" → used as {{rentalRate}} in the template.',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:        'label',
              title:       'Label',
              type:        'string',
              description: 'Human-readable label shown in the contract form. e.g. "Rental Rate".',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:         'fieldType',
              title:        'Field Type',
              type:         'string',
              initialValue: 'string',
              options: {
                list: [
                  { title: 'Short text',  value: 'string' },
                  { title: 'Number',      value: 'number' },
                  { title: 'Date',        value: 'date'   },
                  { title: 'Long text',   value: 'text'   },
                ],
              },
              validation: Rule => Rule.required(),
            }),
            defineField({
              name:         'required',
              title:        'Required',
              type:         'boolean',
              initialValue: false,
            }),
            defineField({
              name:         'showInEmail',
              title:        'Show in approval email',
              type:         'boolean',
              initialValue: true,
            }),
            defineField({
              name:        'hint',
              title:       'Field Description / Hint',
              type:        'string',
              description: 'Optional helper text shown below the input when filling in a contract. e.g. "Enter monthly rate in THB, numbers only".',
            }),
            defineField({
              name:        'formula',
              title:       'Date Formula (Auto-calculate)',
              type:        'object',
              description: 'For date fields only. Auto-fills this field by adding a duration to another date field. The value can still be edited manually.',
              options:     { collapsible: true, collapsed: true },
              fields: [
                defineField({
                  name:        'baseField',
                  title:       'Start from field',
                  type:        'string',
                  description: 'Pick the date field to calculate from. Publish first if the list is empty.',
                  components:  { input: FormulaBaseFieldSelect },
                }),
                defineField({
                  name:        'amountField',
                  title:       'Add (from field)',
                  type:        'string',
                  description: 'Pick a number/text field whose value is the duration to add (e.g. "Terms" containing "12"). Publish first if the list is empty.',
                  components:  { input: FormulaAmountFieldSelect },
                }),
                defineField({
                  name:         'unit',
                  title:        'Unit',
                  type:         'string',
                  initialValue: 'months',
                  options: {
                    list: [
                      { title: 'Days',   value: 'days'   },
                      { title: 'Months', value: 'months' },
                      { title: 'Years',  value: 'years'  },
                    ],
                  },
                }),
              ],
            }),

            defineField({
              name:        'translateFrom',
              title:       'Auto-translate from field',
              type:        'string',
              description: 'Pick a field to translate from. If the list is empty or incomplete, publish this Contract Type first so all fields are saved, then come back to set this.',
              components:  { input: TranslateFromSelect },
            }),
          ],
          preview: {
            select: { title: 'label', key: 'key', type: 'fieldType', tf: 'translateFrom', fb: 'formula.baseField', fa: 'formula.amountField', fu: 'formula.unit' },
            prepare({ title, key, type, tf, fb, fa, fu }: { title?: string; key?: string; type?: string; tf?: string; fb?: string; fa?: string; fu?: string }) {
              const extras = [
                tf ? `✨ translate from {{${tf}}}` : '',
                fb && fa ? `📅 {{${fb}}} + {{${fa}}} ${fu ?? 'months'}` : '',
              ].filter(Boolean).join(' · ')
              return {
                title:    title ?? '—',
                subtitle: `{{${key ?? '?'}}} · ${type ?? 'string'}${extras ? ` · ${extras}` : ''}`,
              }
            },
          },
        }),
      ],
    }),
  ],

  preview: {
    select: { title: 'name', cp: 'contractPrefix', qp: 'quotationPrefix', active: 'isActive' },
    prepare({ title, cp, qp, active }) {
      return {
        title:    `${active === false ? '(Inactive) ' : ''}${title ?? '—'}`,
        subtitle: `Contract: ${cp ?? '?'} · Quotation: ${qp ?? '?'}`,
      }
    },
  },
})
