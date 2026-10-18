import { defineField, defineType, defineArrayMember } from 'sanity'
import { DocumentTypeSelect } from '../components/DocumentTypeSelect'

/**
 * ApprovalRule — configures who must approve and under what conditions.
 *
 * Rules are evaluated in priority order (lower number = checked first).
 * The first matching rule wins. A rule with no conditions is a default
 * catch-all and should have the highest priority number.
 *
 * All conditions in one rule must be true (AND logic).
 *
 * approvalStages defines the sequential order of approvers.
 * Each stage must be completed before the next is notified.
 */
export default defineType({
  name:  'approvalRule',
  title: 'Approval Rule',
  type:  'document',

  fields: [
    defineField({
      name:  'name',
      title: 'Rule Name',
      type:  'string',
      validation: Rule => Rule.required(),
    }),

    defineField({
      name:        'documentType',
      title:       'Applies To',
      type:        'string',
      description: 'Select a static type or a specific Contract Type. New Contract Types appear here automatically.',
      components:  { input: DocumentTypeSelect },
      validation:  Rule => Rule.required(),
    }),

    defineField({
      name:         'isActive',
      title:        'Active',
      type:         'boolean',
      initialValue: true,
    }),

    defineField({
      name:        'priority',
      title:       'Priority',
      type:        'number',
      description: 'Lower number = evaluated first. Use 999 for the default catch-all rule.',
      validation:  Rule => Rule.required().min(1),
    }),

    // ── Conditions ────────────────────────────────────────────────────────────
    defineField({
      name:        'conditions',
      title:       'Conditions',
      description: 'All conditions must match (AND logic). Leave empty to match everything (default rule).',
      type:        'array',
      of: [
        defineArrayMember({
          type:   'object',
          name:   'condition',
          title:  'Condition',
          fields: [
            defineField({
              name:    'field',
              title:   'Field',
              type:    'string',
              options: { list: [
                { title: 'Rental Rate',    value: 'rentalRate'  },
                { title: 'Electricity',    value: 'electricity' },
                { title: 'Starting Date',  value: 'startingDate' },
                { title: 'Ending Date',    value: 'endingDate'  },
              ]},
            }),
            defineField({
              name:    'operator',
              title:   'Operator',
              type:    'string',
              options: { list: [
                { title: '>  (greater than)',          value: 'gt'  },
                { title: '>= (greater than or equal)', value: 'gte' },
                { title: '<  (less than)',              value: 'lt'  },
                { title: '<= (less than or equal)',     value: 'lte' },
                { title: '=  (equals)',                 value: 'eq'  },
              ]},
            }),
            defineField({
              name:        'value',
              title:       'Value',
              type:        'string',
              description: 'For numeric fields use numbers (e.g. 50000). For dates use YYYY-MM-DD.',
            }),
          ],
          preview: {
            select: { field: 'field', operator: 'operator', value: 'value' },
            prepare({ field, operator, value }) {
              return { title: `${field ?? '?'} ${operator ?? '?'} ${value ?? '?'}` }
            },
          },
        }),
      ],
    }),

    // ── Approval Stages ───────────────────────────────────────────────────────
    defineField({
      name:        'approvalStages',
      title:       'Approval Stages',
      description: 'Stages are executed in order. Each must be approved before the next is notified.',
      type:        'array',
      validation:  Rule => Rule.required().min(1),
      of: [
        defineArrayMember({
          type:   'object',
          name:   'stage',
          title:  'Stage',
          fields: [
            defineField({
              name:  'label',
              title: 'Stage Label',
              type:  'string',
              description: 'e.g. "Sales Manager Review"',
              validation: Rule => Rule.required(),
            }),
            defineField({
              name:       'approver',
              title:      'Approver',
              type:       'reference',
              to:         [{ type: 'approvalPosition' }],
              validation: Rule => Rule.required(),
            }),
          ],
          preview: {
            select: { label: 'label', approver: 'approver.title' },
            prepare({ label, approver }) {
              return { title: label ?? '—', subtitle: approver ?? '—' }
            },
          },
        }),
      ],
    }),

    // ── On Approval — what to send ────────────────────────────────────────────
    defineField({
      name:        'onApprovalSend',
      title:       'On Final Approval — Send',
      type:        'object',
      description: 'Controls what is included in the notification email when all stages are approved.',
      options:     { collapsible: true, collapsed: false },
      fields: [
        defineField({
          name:         'attachPdf',
          title:        'Attach PDF',
          type:         'boolean',
          initialValue: true,
          description:  'Attach the generated PDF file to the notification email.',
        }),
        defineField({
          name:         'includeDocLink',
          title:        'Include Google Doc link',
          type:         'boolean',
          initialValue: true,
          description:  'Include a link to the editable Google Doc in the email body.',
        }),
      ],
    }),
  ],

  preview: {
    select: { title: 'name', type: 'documentType', active: 'isActive', priority: 'priority' },
    prepare({ title, type, active, priority }) {
      const STATIC_LABELS: Record<string, string> = {
        quotation:   'Quotation',
        contract:    'Any Contract',
        projectSite: 'Project Site',
        both:        'Both',
        mediaBeforePayment: 'Media before payment',
      }
      const typeLabel = STATIC_LABELS[type] ?? (type ? `Contract Type: ${type.slice(0, 8)}…` : '—')
      return {
        title:    `${active === false ? '(Inactive) ' : ''}${title ?? '—'}`,
        subtitle: `${typeLabel} — priority ${priority ?? '?'}`,
      }
    },
  },
})
