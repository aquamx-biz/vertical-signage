import { defineField, defineType, defineArrayMember } from 'sanity'
import { GrammarCheckInput }   from '../components/GrammarCheckInput'
import { LockableTextInput }   from '../components/LockableTextInput'
import { TranslateFromSelect }    from '../components/TranslateFromSelect'
import { FormulaBaseFieldSelect }   from '../components/FormulaBaseFieldSelect'
import { FormulaAmountFieldSelect } from '../components/FormulaAmountFieldSelect'
import { StepDocKeySelect }   from '../components/StepDocKeySelect'
import { StepFieldKeySelect } from '../components/StepFieldKeySelect'
import { makeGlAccountInput }   from '../components/GlAccountInput'

const RevenueAccountInput = makeGlAccountInput(['revenue'], { allowCreditBalance: true })

/**
 * Process Setup — configures both the Contract Phase and Installation Phase
 * for a given deal/product type (e.g. "Vertical LED 55" Indoor").
 *
 * Replaces the old "Contract Type" concept.
 * Internal _type remains 'contractType' for backwards compatibility with existing data.
 *
 * Section 1 — Contract Phase Config  (numbering, templates, dynamic fields)
 * Section 2 — Installation Phase Config  (required stages, install fields, checklist)
 */
export default defineType({
  name:  'contractType',       // ← internal name kept for data compatibility
  title: 'Process Setup',
  type:  'document',

  groups: [
    { name: 'identity', title: 'Identity'       },
    { name: 'asset',    title: 'Asset Config'   },
    { name: 'service',  title: 'Service Config' },
    { name: 'revenue',  title: 'Revenue Config' },
    { name: 'workflow', title: 'Pipeline Steps' },
    { name: 'contract', title: 'Contract Phase' },
    { name: 'expense',  title: 'Expense Config' },
  ],

  fields: [

    // ── Identity ────────────────────────────────────────────────────────────────

    defineField({
      group:       'identity',
      name:        'name',
      title:       'Process Name',
      type:        'string',
      description: 'e.g. "Vertical LED 55\\" Indoor", "Outdoor Billboard"',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'identity',
      name:        'isActive',
      title:       'Active',
      type:        'boolean',
      description: 'Inactive setups are hidden from selectors.',
      initialValue: true,
    }),

    defineField({
      group:       'identity',
      name:        'description',
      title:       'Description',
      type:        'text',
      rows:        2,
      description: 'Optional internal note about when to use this process setup.',
      components:  { input: LockableTextInput },
    }),

    defineField({
      group:        'identity',
      name:         'useProjectSite',
      title:        'Requires Project Site',
      type:         'boolean',
      description:  'Show the Project Site reference field on activities using this setup.',
      initialValue: true,
    }),

    defineField({
      group:        'identity',
      name:         'useParty',
      title:        'Requires Party',
      type:         'boolean',
      description:  'Show the Party reference field on activities using this setup.',
      initialValue: true,
    }),

    defineField({
      group:        'identity',
      name:         'useForProcurement',
      title:        'Use for Procurement',
      type:         'boolean',
      description:  'Mark this as the Process Setup for Procurement documents. Only one setup should have this enabled.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'useForPayment',
      title:        'Use for Payment',
      type:         'boolean',
      description:  'Mark this as the Process Setup for Payment documents. Only one setup should have this enabled.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'useForExpense',
      title:        'Use for Expense',
      type:         'boolean',
      description:  'Enable expense categories for this process. Expense categories will be available when creating Direct Expense payments.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'useAssetConfig',
      title:        'Use Asset Config',
      type:         'boolean',
      description:  'Enable Asset Types and Spec Fields for processes that involve physical assets (e.g. Procurement, Installation). Disable for Rent Space or other non-asset processes.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'useForServiceContract',
      title:        'Use for Service Contract',
      type:         'boolean',
      description:  'Mark this as a Service Contract process type (e.g. Internet, Maintenance, SaaS). Dynamic fields defined below will appear in Service Contract documents using this setup.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'useForReceipt',
      title:        'Use for Receipt',
      type:         'boolean',
      description:  'Enable the Revenue Config tab. Receipts linked to a contract using this setup can pre-fill their line items from the charge catalogue below.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'useForOrder',
      title:        'Use for Order',
      type:         'boolean',
      description:  'Mark this as a sellable revenue stream. Orders can select this setup and pre-fill their lines from the same charge catalogue.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'usePaymentStatus',
      title:        'Show Payment Status',
      type:         'boolean',
      description:  'Show a Payment Status summary field on documents using this setup.',
      initialValue: true,
    }),

    defineField({
      group:        'identity',
      name:         'useProcurementStatus',
      title:        'Show Procurement Status',
      type:         'boolean',
      description:  'Show a Procurement Status summary field on documents using this setup.',
      initialValue: true,
    }),

    // ── Revenue Config ───────────────────────────────────────────────────────────
    // The charge catalogue. This is the "how many revenue types are there" answer,
    // and it lives in DATA — adding a revenue stream is a new Process Setup row plus
    // charges here, never a schema change. Receipt and Order both snapshot from it.
    //
    // NOTE: receiptCharges[] was already read by ReceiptLineItemsInput but had never
    // been declared, so Receipt's "Pre-fill from template" button could never find
    // anything. Field names below match that component's GROQ exactly — don't rename
    // without updating components/ReceiptLineItemsInput.tsx and OrderLineItemsInput.tsx.

    defineField({
      group:       'revenue',
      name:        'defaultBillingModel',
      title:       'Billing Model',
      type:        'string',
      description: 'The SHAPE of the money for this revenue stream — not the price. Orders inherit it as their default.',
      hidden:      ({ document }) => !document?.useForOrder && !document?.useForReceipt,
      options: {
        list: [
          { title: 'One-time — invoiced once, amount known upfront',            value: 'one_time'    },
          { title: 'Recurring — billed every period (placement fees, rent)',    value: 'recurring'   },
          { title: 'Success fee — % of a deal, amount unknown until it closes', value: 'success_fee' },
          { title: 'Milestone — billed in stages against delivery',             value: 'milestone'   },
        ],
        layout: 'radio',
      },
      initialValue: 'one_time',
    }),

    defineField({
      group:       'revenue',
      name:        'receiptCharges',
      title:       'Charge Catalogue',
      type:        'array',
      description: 'Every line that can be billed under this revenue stream. Receipts and Orders copy these as a snapshot — later edits here never rewrite documents already issued.',
      hidden:      ({ document }) => !document?.useForOrder && !document?.useForReceipt,
      of: [defineArrayMember({
        type:  'object',
        name:  'receiptCharge',
        title: 'Charge',
        fields: [
          defineField({
            name:       'label_en',
            title:      'Label (English)',
            type:       'string',
            validation: Rule => Rule.required(),
          }),
          defineField({
            name:  'label_th',
            title: 'Label (Thai) · ชื่อรายการ',
            type:  'string',
          }),
          defineField({
            name:        'accountCode',
            title:       'GL Account (Income)',
            type:        'reference',
            to:          [{ type: 'accountCode' }],
            options:     { disableNew: true },
            components:  { input: RevenueAccountInput },
            description: 'Revenue account this charge posts to.',
          }),
          defineField({
            name:        'defaultAmount',
            title:       'Default Amount (THB)',
            type:        'number',
            description: 'Starting price when a document pre-fills from this charge. Leave blank for success-fee charges where the amount is only known at closing.',
            validation:  Rule => Rule.min(0),
          }),
          defineField({
            name:         'defaultVatType',
            title:        'Default VAT Type',
            type:         'string',
            // Not VAT-registered as of 2026-08-08, so a new charge must not
            // quietly add 7% we have no right to collect. On the day
            // registration happens this becomes 'exclusive' — here, in
            // order.ts (document + line), and in OrderLineItemsInput's
            // fallback. Existing charges keep whatever they were saved with.
            initialValue: 'none',
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
            name:         'isActive',
            title:        'Active',
            type:         'boolean',
            description:  'Inactive charges stay on documents already issued but stop appearing in new pre-fills.',
            initialValue: true,
          }),
        ],
        preview: {
          select: { en: 'label_en', th: 'label_th', amt: 'defaultAmount', vat: 'defaultVatType', active: 'isActive' },
          prepare({ en, th, amt, vat, active }: {
            en?: string; th?: string; amt?: number; vat?: string; active?: boolean
          }) {
            const vatLabel: Record<string, string> = {
              exclusive: '+VAT', inclusive: 'incl. VAT', zero: '0% VAT', none: 'no VAT',
            }
            return {
              title: `${active === false ? '⏸ ' : ''}${en ?? '(no label)'}${th ? ` · ${th}` : ''}`,
              subtitle: [
                amt != null ? `${Number(amt).toLocaleString()} THB` : 'amount set per document',
                vatLabel[vat ?? ''] ?? '',
              ].filter(Boolean).join('  ·  '),
            }
          },
        },
      })],
    }),

    // ── Asset Config ─────────────────────────────────────────────────────────────

    defineField({
      group:       'asset',
      name:        'assetTypes',
      title:       'Asset Types',
      type:        'array',
      description: 'Define the types of assets used in this process (e.g. LED Screen, Media Player, Application). Each type has its own spec fields for comparison and tracking.',
      hidden:      ({ document }) => !(document?.useAssetConfig as boolean),
      of: [defineArrayMember({
        type:  'object',
        name:  'assetType',
        title: 'Asset Type',
        fields: [
          defineField({
            name:        'key',
            title:       'Key',
            type:        'string',
            description: 'Machine-readable identifier, no spaces. e.g. "led_screen", "media_player", "application".',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:        'name',
            title:       'Display Name',
            type:        'string',
            description: 'Human-readable name shown in Asset and Procurement forms. e.g. "LED Screen 55\\"", "Media Player".',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:        'assetCode',
            title:       'Asset Code',
            type:        'string',
            description: '1–4 uppercase letters used in the asset tag. e.g. "SC" for Screen, "AP" for App License, "RT" for Router. Must be unique — duplicates will be highlighted in red and the record cannot be saved.',
            validation:  Rule => Rule.required().max(4).custom((value, context) => {
              if (!value) return true
              const allTypes = (context.document?.assetTypes ?? []) as { assetCode?: string; _key?: string }[]
              const current  = (context.parent as { _key?: string })?._key
              const dupes    = allTypes.filter(t => t._key !== current && t.assetCode?.toUpperCase() === value.toUpperCase())
              return dupes.length === 0 ? true : `Asset code "${value.toUpperCase()}" is already used by another asset type.`
            }),
          }),
          defineField({
            name:        'setupManual',
            title:       'Setup Manual',
            type:        'array',
            description: 'Step-by-step setup instructions shown to technicians in Install & Activate when this asset type is selected.',
            of: [defineArrayMember({
              type:  'object',
              name:  'setupStep',
              title: 'Step',
              fields: [
                defineField({
                  name:       'stepTitle',
                  title:      'Step Title',
                  type:       'string',
                  validation: Rule => Rule.required(),
                }),
                defineField({
                  name:  'description',
                  title: 'Description',
                  type:  'text',
                  rows:  3,
                }),
                defineField({
                  name:        'warning',
                  title:       'Warning',
                  type:        'string',
                  description: 'Optional caution note shown highlighted in red. e.g. "Do not power on before bracket is secured."',
                }),
              ],
              preview: {
                select: { title: 'stepTitle', warning: 'warning' },
                prepare({ title, warning }: { title?: string; warning?: string }) {
                  return {
                    title:    title ?? '—',
                    subtitle: warning ? `⚠️ ${warning}` : undefined,
                  }
                },
              },
            })],
          }),

          defineField({
            name:        'specGroups',
            title:       'Spec Groups',
            type:        'array',
            description: 'Group spec fields into sections (e.g. Basic Info, Display Spec, Hardware). Each group has a name and its own list of fields.',
            of: [defineArrayMember({
              type:  'object',
              name:  'specGroup',
              title: 'Spec Group',
              fields: [
                defineField({
                  name:        'groupName',
                  title:       'Group Name',
                  type:        'string',
                  description: 'Section header shown in Asset / Procurement forms. e.g. "Basic Info", "Display Spec", "Network".',
                  validation:  Rule => Rule.required(),
                }),
                defineField({
                  name:        'specFields',
                  title:       'Spec Fields',
                  type:        'array',
                  description: 'Fields in this group.',
                  of: [defineArrayMember({
                    type:  'object',
                    name:  'specField',
                    title: 'Spec Field',
                    fields: [
                      defineField({
                        name:        'key',
                        title:       'Key',
                        type:        'string',
                        description: 'Machine-readable identifier. e.g. "resolution", "brightness", "sim_provider".',
                        validation:  Rule => Rule.required(),
                      }),
                      defineField({
                        name:        'label',
                        title:       'Label',
                        type:        'string',
                        description: 'Display name shown on Asset / Procurement forms. e.g. "Resolution", "Brightness (nits)".',
                        validation:  Rule => Rule.required(),
                      }),
                      defineField({
                        name:         'fieldType',
                        title:        'Field Type',
                        type:         'string',
                        initialValue: 'string',
                        options: {
                          list: [
                            { title: 'Short text', value: 'string' },
                            { title: 'Number',     value: 'number' },
                            { title: 'Date',       value: 'date'   },
                            { title: 'Long text',  value: 'text'   },
                            { title: 'Yes / No',   value: 'yes_no' },
                          ],
                        },
                        validation: Rule => Rule.required(),
                      }),
                    ],
                    preview: {
                      select: { title: 'label', subtitle: 'fieldType', key: 'key' },
                      prepare({ title, subtitle, key }: { title?: string; subtitle?: string; key?: string }) {
                        return { title: title ?? '—', subtitle: `{{${key ?? '?'}}} · ${subtitle ?? 'string'}` }
                      },
                    },
                  })],
                }),
              ],
              preview: {
                select: { groupName: 'groupName', fields: 'specFields' },
                prepare({ groupName, fields }: { groupName?: string; fields?: any[] }) {
                  return {
                    title:    groupName ?? '—',
                    subtitle: `${(fields ?? []).length} field(s)`,
                  }
                },
              },
            })],
          }),
        ],
        preview: {
          select: { name: 'name', key: 'key', groups: 'specGroups' },
          prepare({ name, key, groups }: { name?: string; key?: string; groups?: any[] }) {
            const fieldCount = (groups ?? []).reduce((sum: number, g: any) => sum + (g.specFields?.length ?? 0), 0)
            return {
              title:    name ?? key ?? '—',
              subtitle: `key: ${key ?? '?'} · ${(groups ?? []).length} group(s) · ${fieldCount} field(s)`,
            }
          },
        },
      })],
    }),

    // ── Service Config ───────────────────────────────────────────────────────────

    defineField({
      group:       'service',
      name:        'serviceTypes',
      title:       'Service Types',
      type:        'array',
      description: 'Define the types of services used in this process (e.g. Internet, Maintenance, SaaS). Each type has its own fields.',
      hidden:      ({ document }) => !(document?.useForServiceContract as boolean),
      of: [defineArrayMember({
        type:  'object',
        name:  'serviceType',
        title: 'Service Type',
        fields: [
          defineField({
            name:        'key',
            title:       'Key',
            type:        'string',
            description: 'Machine-readable identifier, no spaces. e.g. "internet", "maintenance", "saas".',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:        'name',
            title:       'Display Name',
            type:        'string',
            description: 'Human-readable name shown in Service Contract forms. e.g. "Internet", "Lift Maintenance".',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:        'fieldGroups',
            title:       'Field Groups',
            type:        'array',
            description: 'Group fields into sections. e.g. "Connection Details", "Support Info".',
            of: [defineArrayMember({
              type:  'object',
              name:  'fieldGroup',
              title: 'Field Group',
              fields: [
                defineField({
                  name:        'groupName',
                  title:       'Group Name',
                  type:        'string',
                  description: 'Section header shown in Service Contract forms. e.g. "Connection Details", "SLA".',
                  validation:  Rule => Rule.required(),
                }),
                defineField({
                  name:        'fields',
                  title:       'Fields',
                  type:        'array',
                  of: [defineArrayMember({
                    type:  'object',
                    name:  'serviceField',
                    title: 'Field',
                    fields: [
                      defineField({
                        name:        'key',
                        title:       'Key',
                        type:        'string',
                        description: 'Machine-readable identifier. e.g. "account_no", "bandwidth", "sla_hours".',
                        validation:  Rule => Rule.required(),
                      }),
                      defineField({
                        name:        'label',
                        title:       'Label',
                        type:        'string',
                        description: 'Display name shown in Service Contract forms. e.g. "Account No.", "Bandwidth".',
                        validation:  Rule => Rule.required(),
                      }),
                      defineField({
                        name:         'fieldType',
                        title:        'Field Type',
                        type:         'string',
                        initialValue: 'string',
                        options: {
                          list: [
                            { title: 'Short text', value: 'string' },
                            { title: 'Number',     value: 'number' },
                            { title: 'Date',       value: 'date'   },
                            { title: 'Long text',  value: 'text'   },
                            { title: 'Yes / No',   value: 'yes_no' },
                          ],
                        },
                        validation: Rule => Rule.required(),
                      }),
                    ],
                    preview: {
                      select: { title: 'label', subtitle: 'fieldType', key: 'key' },
                      prepare({ title, subtitle, key }: { title?: string; subtitle?: string; key?: string }) {
                        return { title: title ?? '—', subtitle: `{{${key ?? '?'}}} · ${subtitle ?? 'string'}` }
                      },
                    },
                  })],
                }),
              ],
              preview: {
                select: { groupName: 'groupName', fields: 'fields' },
                prepare({ groupName, fields }: { groupName?: string; fields?: any[] }) {
                  return {
                    title:    groupName ?? '—',
                    subtitle: `${(fields ?? []).length} field(s)`,
                  }
                },
              },
            })],
          }),
        ],
        preview: {
          select: { name: 'name', key: 'key', groups: 'fieldGroups' },
          prepare({ name, key, groups }: { name?: string; key?: string; groups?: any[] }) {
            const fieldCount = (groups ?? []).reduce((sum: number, g: any) => sum + (g.fields?.length ?? 0), 0)
            return {
              title:    name ?? key ?? '—',
              subtitle: `key: ${key ?? '?'} · ${(groups ?? []).length} group(s) · ${fieldCount} field(s)`,
            }
          },
        },
      })],
    }),

    // ── Pipeline Steps ───────────────────────────────────────────────────────────

    defineField({
      group:       'workflow',
      name:        'steps',
      title:       'Pipeline Steps',
      type:        'array',
      description: 'Define the stages of this process. Each step advances automatically when its trigger condition is met.',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name:        'key',
              title:       'Key',
              type:        'string',
              description: 'Machine-readable identifier. e.g. "quotation_approved", "contract_signed".',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:        'label',
              title:       'Label',
              type:        'string',
              description: 'Display name shown in the pipeline bar. e.g. "Quotation Approved".',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:         'tone',
              title:        'Colour',
              type:         'string',
              description:  'Colour of this step in the pipeline bar.',
              initialValue: 'default',
              options: {
                list: [
                  { title: 'Default (grey)',  value: 'default'  },
                  { title: 'Positive (green)', value: 'positive' },
                  { title: 'Caution (yellow)', value: 'caution'  },
                  { title: 'Critical (red)',   value: 'critical' },
                ],
              },
            }),
            defineField({
              name:        'triggerType',
              title:       'Trigger',
              type:        'string',
              description: 'What event moves the activity to this step.',
              validation:  Rule => Rule.required(),
              options: {
                list: [
                  { title: '🌱 Created — when the activity is first created',           value: 'created'        },
                  { title: '📨 Doc Submitted — document sent for approval',             value: 'doc_submitted'  },
                  { title: '✅ Doc Approved — document fully approved',                  value: 'doc_approved'   },
                  { title: '❌ Doc Rejected — document rejected by an approver',         value: 'doc_rejected'   },
                  { title: '📄 Doc Generated — Google Doc successfully generated',      value: 'doc_generated'  },
                  { title: '🔑 Field Equals — a field reaches a specific value',        value: 'field_equals'   },
                ],
              },
            }),

            // Shown only for doc_* triggers
            defineField({
              name:        'docKey',
              title:       'Document',
              type:        'string',
              description: 'Which document does this trigger apply to?',
              hidden:      ({ parent }: any) => !['doc_submitted','doc_approved','doc_rejected','doc_generated'].includes(parent?.triggerType),
              components:  { input: StepDocKeySelect },
            }),

            // Shown only for field_equals trigger
            defineField({
              name:        'fieldKey',
              title:       'Field',
              type:        'string',
              description: 'Which field to watch.',
              hidden:      ({ parent }: any) => parent?.triggerType !== 'field_equals',
              components:  { input: StepFieldKeySelect },
            }),
            defineField({
              name:        'fieldValue',
              title:       'Value',
              type:        'string',
              description: 'The value that triggers this step. For Yes/No fields use "yes". e.g. "yes", "paid", "done".',
              hidden:      ({ parent }: any) => parent?.triggerType !== 'field_equals',
            }),
          ],
          preview: {
            select: {
              label:       'label',
              triggerType: 'triggerType',
              docKey:      'docKey',
              fieldKey:    'fieldKey',
              fieldValue:  'fieldValue',
              tone:        'tone',
            },
            prepare({ label, triggerType, docKey, fieldKey, fieldValue, tone }: {
              label?: string; triggerType?: string; docKey?: string
              fieldKey?: string; fieldValue?: string; tone?: string
            }) {
              const toneIcon: Record<string, string> = {
                positive: '🟢', caution: '🟡', critical: '🔴', default: '⚪',
              }
              const triggerDesc =
                triggerType === 'created'       ? 'on create'
                : triggerType === 'doc_submitted' ? `doc submitted → ${docKey ?? '?'}`
                : triggerType === 'doc_approved'  ? `doc approved → ${docKey ?? '?'}`
                : triggerType === 'doc_rejected'  ? `doc rejected → ${docKey ?? '?'}`
                : triggerType === 'doc_generated' ? `doc generated → ${docKey ?? '?'}`
                : triggerType === 'field_equals'  ? `${fieldKey ?? '?'} = "${fieldValue ?? '?'}"`
                : triggerType ?? '?'
              return {
                title:    `${toneIcon[tone ?? 'default'] ?? '⚪'} ${label ?? '—'}`,
                subtitle: triggerDesc,
              }
            },
          },
        }),
      ],
    }),

    // ── Contract Phase ───────────────────────────────────────────────────────────

    defineField({
      group:       'contract',
      name:        'documents',
      title:       'Documents',
      type:        'array',
      description: 'Each entry defines one document this process can generate (e.g. Quotation, Contract, Receipt).',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name:        'key',
              title:       'Key',
              type:        'string',
              description: 'Machine-readable identifier used as the document type. e.g. "quotation", "contract", "receipt". Must be unique within this process.',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:        'name',
              title:       'Document Name',
              type:        'string',
              description: 'Display name shown in the Generate tab. e.g. "Rental Quotation", "Rental Agreement".',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:        'description',
              title:       'Description',
              type:        'string',
              description: 'Optional note shown in the Generate tab.',
            }),
            defineField({
              name:        'numberPrefix',
              title:       'Number Prefix',
              type:        'string',
              description: 'e.g. "QTJ" → generates QTJ-2026-03-001. 2–5 uppercase letters.',
              validation:  Rule => Rule.required().uppercase().min(2).max(5),
            }),
            defineField({
              name:        'templateId',
              title:       'Google Doc Template ID',
              type:        'string',
              description: 'The ID from the Google Doc URL: docs.google.com/document/d/THIS_PART/edit',
            }),
          ],
          preview: {
            select: { name: 'name', prefix: 'numberPrefix', key: 'key' },
            prepare({ name, prefix, key }: { name?: string; prefix?: string; key?: string }) {
              return {
                title:    name ?? key ?? '—',
                subtitle: `key: ${key ?? '?'} · prefix: ${prefix ?? '?'}`,
              }
            },
          },
        }),
      ],
    }),

    defineField({
      group:       'contract',
      name:        'projectSiteFields',
      title:       'Project Site Fields',
      type:        'array',
      description: 'Select which Project Site fields to include in this activity form.',
      of:          [{ type: 'string' }],
      options: {
        list: [
          { title: 'Project Name (EN)',           value: 'projectEn'                },
          { title: 'Project Name (TH)',           value: 'projectTh'                },
          { title: 'Address',                     value: 'address'                  },
          { title: 'BTS / MRT Station',           value: 'btsStation'               },
          { title: 'Area',                        value: 'area'                     },
          { title: 'Total Units',                 value: 'totalUnits'               },
          { title: 'No. of Buildings',            value: 'numberOfBuildings'        },
          { title: 'No. of Parking',              value: 'numberOfParking'          },
          { title: 'Common Fees',                 value: 'commonFees'               },
          { title: 'Total Project Area',          value: 'totalProjectArea'         },
          { title: 'Developer',                   value: 'developer'                },
          { title: 'Completion Year',             value: 'completionYear'           },
          { title: '% Sold',                      value: 'percentSold'              },
          { title: 'Owner Occupied & Rented',     value: 'ownerOccupiedRented'      },
          { title: 'Contact Person',              value: 'contactPerson'            },
          { title: 'Telephone',                   value: 'telephone'                },
          { title: 'Property Management Company', value: 'propertyManagementCompany'},
          { title: 'Email Address',               value: 'emailAddress'             },
        ],
      },
    }),

    defineField({
      group:       'contract',
      name:        'partyFields',
      title:       'Party Fields',
      type:        'array',
      description: 'Select which Party fields to include in this activity form.',
      of:          [{ type: 'string' }],
      options: {
        list: [
          { title: 'Legal Name (Thai)',        value: 'legalName_th'   },
          { title: 'Legal Name (English)',     value: 'legalName_en'   },
          { title: 'Tax ID',                   value: 'taxId'          },
          { title: 'Company Registration No.', value: 'registrationNo' },
          { title: 'Contact Person / Manager in-charge', value: 'juristicManager'},
          { title: 'First Name',               value: 'firstName'      },
          { title: 'Last Name',                value: 'lastName'        },
          { title: 'National ID',              value: 'nationalId'     },
          { title: 'Phone',                    value: 'phone'          },
          { title: 'Email',                    value: 'email'          },
          { title: 'LINE ID',                  value: 'lineId'         },
          { title: 'Address',                  value: 'addressFull'    },
          { title: 'VAT Number',               value: 'vatNumber'      },
          { title: 'Billing Address',          value: 'billingAddress' },
        ],
      },
    }),

    defineField({
      group:       'contract',
      name:        'fieldDefinitions',
      title:       'Activity Dynamic Fields',
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
                  { title: 'Short text',    value: 'string'        },
                  { title: 'Number',        value: 'number'        },
                  { title: 'Date',          value: 'date'          },
                  { title: 'Long text',     value: 'text'          },
                  { title: 'Yes / No',      value: 'yes_no'        },
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
              name:         'isMaterialTerm',
              title:        'Material Term (protected after approval)',
              type:         'boolean',
              description:  'If checked, changes to this field after contract approval will block document generation and require re-approval.',
              initialValue: false,
            }),
            defineField({
              name:        'hint',
              title:       'Field Description / Hint',
              type:        'string',
              description: 'Optional helper text shown below the input. e.g. "Enter monthly rate in THB, numbers only".',
            }),
            defineField({
              name:        'formula',
              title:       'Date Formula (Auto-calculate)',
              type:        'object',
              description: 'For date fields only. Auto-fills this field by adding a duration to another date field.',
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
                  description: 'Pick a number/text field whose value is the duration to add.',
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
              description: 'Pick a field to translate from. Publish this Process Setup first if the list is empty.',
              components:  { input: TranslateFromSelect },
            }),
            defineField({
              name:         'translateTargetLang',
              title:        'Translate to language',
              type:         'string',
              description:  'Target language for the auto-translate button.',
              initialValue: 'English',
              hidden:       ({ parent }: any) => !parent?.translateFrom,
              options: {
                list: [
                  { title: 'English', value: 'English' },
                  { title: 'Thai',    value: 'Thai'    },
                ],
              },
            }),
            defineField({
              name:         'retrieveFromProjectSite',
              title:        'Retrieve from Project Site',
              type:         'boolean',
              description:  'Show a "Retrieve from Project Site" button on this field.',
              initialValue: false,
            }),
            defineField({
              name:        'retrieveFromPsKey',
              title:       'Project Site Field Key',
              type:        'string',
              description: 'Which project site field to pull the value from. Only needed if the project site field key differs from this field\'s key.',
              hidden:      ({ parent }: any) => !parent?.retrieveFromProjectSite,
              options: {
                list: [
                  { title: 'Project Name (EN)',           value: 'projectEn'                 },
                  { title: 'Project Name (TH)',           value: 'projectTh'                 },
                  { title: 'Address',                     value: 'address'                   },
                  { title: 'BTS / MRT Station',           value: 'btsStation'                },
                  { title: 'Area',                        value: 'area'                      },
                  { title: 'Total Units',                 value: 'totalUnits'                },
                  { title: 'No. of Buildings',            value: 'numberOfBuildings'         },
                  { title: 'No. of Parking',              value: 'numberOfParking'           },
                  { title: 'Common Fees',                 value: 'commonFees'                },
                  { title: 'Total Project Area',          value: 'totalProjectArea'          },
                  { title: 'Developer',                   value: 'developer'                 },
                  { title: 'Completion Year',             value: 'completionYear'            },
                  { title: '% Sold',                      value: 'percentSold'               },
                  { title: 'Owner Occupied & Rented',     value: 'ownerOccupiedRented'       },
                  { title: 'Contact Person',              value: 'contactPerson'             },
                  { title: 'Telephone',                   value: 'telephone'                 },
                  { title: 'Property Management Company', value: 'propertyManagementCompany' },
                  { title: 'Email Address',               value: 'emailAddress'              },
                ],
              },
            }),
          ],
          preview: {
            select: { title: 'label', key: 'key', type: 'fieldType', tf: 'translateFrom', tl: 'translateTargetLang', fb: 'formula.baseField', fa: 'formula.amountField', fu: 'formula.unit', rfps: 'retrieveFromProjectSite', isMaterialTerm: 'isMaterialTerm' },
            prepare({ title, key, type, tf, tl, fb, fa, fu, rfps, isMaterialTerm }: { title?: string; key?: string; type?: string; tf?: string; tl?: string; fb?: string; fa?: string; fu?: string; rfps?: boolean; isMaterialTerm?: boolean }) {
              const extras = [
                isMaterialTerm ? '🔒 material term' : '',
                tf   ? `✨ → ${tl ?? 'English'} from {{${tf}}}` : '',
                fb && fa ? `📅 {{${fb}}} + {{${fa}}} ${fu ?? 'months'}` : '',
                rfps ? '↙ retrieve from project' : '',
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

    // ── Expense Config ───────────────────────────────────────────────────────────

    defineField({
      group:       'expense',
      name:        'expenseCategories',
      title:       'Expense Categories',
      type:        'array',
      description: 'Define expense categories for Direct Expense payments (e.g. "Electrical Work", "Wifi Setup"). Each category maps to a cost group in Install & Activate.',
      hidden:      ({ document }) => !(document?.useForExpense as boolean),
      of: [defineArrayMember({
        type:  'object',
        name:  'expenseCategory',
        title: 'Category',
        fields: [
          defineField({
            name:        'key',
            title:       'Key',
            type:        'string',
            description: 'Machine-readable identifier, no spaces. e.g. "electrical_work", "wifi_setup".',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:        'name',
            title:       'Display Name',
            type:        'string',
            description: 'Label shown in the Expense Category dropdown on Payment. e.g. "Electrical Work", "Wifi Setup".',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:        'costGroup',
            title:       'Links to Install & Activate Section',
            type:        'string',
            description: 'Determines which cost section this expense contributes to in the Install & Activate record.',
            validation:  Rule => Rule.required(),
            options: {
              list: [
                { title: '📦 Device Setup',        value: 'setup'      },
                { title: '⚡ Electrical & Wiring', value: 'electrical' },
                { title: '📶 Wifi & Router',       value: 'wifi'       },
                { title: '✅ Activate & Test',     value: 'activation' },
                { title: '📦 General / Other',     value: 'general'    },
              ],
            },
          }),
          defineField({
            name:        'description',
            title:       'Description',
            type:        'text',
            rows:        2,
            description: 'Explain what expenses belong in this category. Shown as a hint to users when selecting this category.',
            components:  { input: GrammarCheckInput },
          }),
        ],
        preview: {
          select: { name: 'name', key: 'key', costGroup: 'costGroup' },
          prepare({ name, key, costGroup }: { name?: string; key?: string; costGroup?: string }) {
            const groupIcon: Record<string, string> = {
              setup: '📦', electrical: '⚡', wifi: '📶', activation: '✅', general: '📦',
            }
            return {
              title:    name ?? key ?? '—',
              subtitle: `key: ${key ?? '?'} · ${groupIcon[costGroup ?? ''] ?? ''} ${costGroup ?? '—'}`,
            }
          },
        },
      })],
    }),

  ],

  preview: {
    select: { title: 'name', docs: 'documents', active: 'isActive' },
    prepare({ title, docs, active }: { title?: string; docs?: { key?: string; numberPrefix?: string }[]; active?: boolean }) {
      const summary = (docs ?? [])
        .map(d => `${d.numberPrefix ?? '?'} (${d.key ?? '?'})`)
        .join(' · ')
      return {
        title:    `${active === false ? '(Inactive) ' : ''}${title ?? '—'}`,
        subtitle: summary || 'No documents configured',
      }
    },
  },
})
