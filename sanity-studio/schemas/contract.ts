import { defineField, defineType } from 'sanity'
import { createTranslateInput }   from '../components/TranslateInput'
import { createAutoNumberInput }  from '../components/AutoNumberInput'
import { NumericFormatInput }     from '../components/NumericFormatInput'
import { DynamicFieldsInput }    from '../components/DynamicFieldsInput'

/**
 * Contract / Quotation document.
 * Links to a Project Site and holds all rental terms.
 * The "Generated Documents" group is written back by the backend after generation.
 */
export default defineType({
  name: 'contract',
  title: 'Contract',
  type: 'document',

  groups: [
    { name: 'customer',  title: 'Customer'            },
    { name: 'rental',    title: 'Rental Details'      },
    { name: 'approval',  title: 'Approval'            },
    { name: 'generated', title: 'Generated Documents' },
  ],

  fields: [
    // ── Project reference ─────────────────────────────────────────────────────
    defineField({
      name:  'projectSite',
      title: 'Project Site',
      type:  'reference',
      to:    [{ type: 'projectSite' }],
      validation: Rule => Rule.required(),
    }),

    // ── Contract type ─────────────────────────────────────────────────────────
    defineField({
      name:        'contractType',
      title:       'Contract Type',
      type:        'reference',
      to:          [{ type: 'contractType' }],
      description: 'e.g. Rental Contract, Service Contract, Ad Contract — configure in Contract Types.',
      validation:  Rule => Rule.required(),
    }),

    // ── Customer ──────────────────────────────────────────────────────────────
    defineField({ group: 'customer', name: 'customerName',        title: 'Customer Name',        type: 'string', validation: Rule => Rule.required() }),
    defineField({ group: 'customer', name: 'companyName',         title: 'Company Name',         type: 'string' }),

    // ── Rental details ────────────────────────────────────────────────────────
    // ── Document numbers (always needed) ──────────────────────────────────────
    defineField({ group: 'rental', name: 'quotationNumber', title: 'Quotation Number', type: 'string', validation: Rule => Rule.required(), components: { input: createAutoNumberInput('quotation') } }),
    defineField({ group: 'rental', name: 'quotationDate',   title: 'Quotation Date',   type: 'date'   }),
    defineField({ group: 'rental', name: 'contractNumber',  title: 'Contract Number',  type: 'string', components: { input: createAutoNumberInput('contract') } }),
    defineField({ group: 'rental', name: 'contractDate',    title: 'Contract Date',    type: 'date'   }),

    // ── Dynamic fields (driven by Contract Type) ──────────────────────────────
    defineField({
      group:       'rental',
      name:        'dynamicFields',
      title:       'Contract Fields',
      type:        'string',
      description: 'Fields defined by the selected Contract Type.',
      components:  { input: DynamicFieldsInput },
    }),

    // ── Legacy fields — hidden, kept for backward compatibility ───────────────
    // Existing contracts still have values here; generation reads them as fallback.
    defineField({ name: 'addressTh',    title: 'Address (TH)',   type: 'text',   hidden: true }),
    defineField({ name: 'addressEn',    title: 'Address (EN)',   type: 'text',   hidden: true }),
    defineField({ name: 'rentalRate',   title: 'Rental Rate',    type: 'string', hidden: true }),
    defineField({ name: 'electricity',  title: 'Electricity',    type: 'string', hidden: true }),
    defineField({ name: 'locationTh',   title: 'Location (TH)', type: 'string', hidden: true }),
    defineField({ name: 'locationEn',   title: 'Location (EN)', type: 'string', hidden: true }),
    defineField({ name: 'startingDate', title: 'Starting Date', type: 'date',   hidden: true }),
    defineField({ name: 'endingDate',   title: 'Ending Date',   type: 'date',   hidden: true }),
    defineField({ name: 'terms',        title: 'Terms',         type: 'text',   hidden: true }),
    defineField({ name: 'note',         title: 'Note',          type: 'text',   hidden: true }),

    // ── Approval state (written by backend — read-only in Studio) ────────────
    // Visible fields in the Approval tab
    defineField({ group: 'approval', name: 'notificationEmail', title: 'Notification Email', type: 'string', readOnly: true, description: 'Set via the Approval tab. The staff email that receives the approved document.' }),
    defineField({ group: 'approval', name: 'quotationApprovalStatus', title: 'Quotation Approval', type: 'string', readOnly: true,
      options: { list: [
        { title: '—  Not Requested', value: 'not_requested' },
        { title: '⏳ Pending',        value: 'pending'       },
        { title: '✓  Approved',      value: 'approved'      },
        { title: '✗  Rejected',      value: 'rejected'      },
        { title: '⚠  Reset',         value: 'reset'         },
      ]},
    }),
    defineField({ group: 'approval', name: 'quotationApprovedAt',     title: 'Quotation Approved At', type: 'datetime', readOnly: true }),
    defineField({ group: 'approval', name: 'contractApprovalStatus',  title: 'Contract Approval',  type: 'string',   readOnly: true,
      options: { list: [
        { title: '—  Not Requested', value: 'not_requested' },
        { title: '⏳ Pending',        value: 'pending'       },
        { title: '✓  Approved',      value: 'approved'      },
        { title: '✗  Rejected',      value: 'rejected'      },
        { title: '⚠  Reset',         value: 'reset'         },
      ]},
    }),
    defineField({ group: 'approval', name: 'contractApprovedAt',      title: 'Contract Approved At',  type: 'datetime', readOnly: true }),
    defineField({ group: 'approval', name: 'approvalResetReason',     title: 'Reset Reason',          type: 'string',   readOnly: true }),
    // Hidden — snapshots of key fields at approval time for reset-on-edit detection
    defineField({ name: 'lastQuotationSnapshot', title: 'Quotation Snapshot', type: 'string', hidden: true, readOnly: true }),
    defineField({ name: 'lastContractSnapshot',  title: 'Contract Snapshot',  type: 'string', hidden: true, readOnly: true }),

    // ── Generation metadata (written by backend — read-only in Studio) ────────
    // generationStatus and generatedDocType are hidden — used internally by preview and GenerateView
    defineField({ name: 'generationStatus', title: 'Generation Status', type: 'string', hidden: true, readOnly: true }),
    defineField({ name: 'generatedDocType', title: 'Generated Doc Type', type: 'string', hidden: true, readOnly: true }),
    // Combined status + error visible in the Generated Documents tab
    defineField({ group: 'generated', name: 'lastGenerationResult', title: 'Last Generation', type: 'string', readOnly: true }),

    // ── Rental Agreement ──────────────────────────────────────────────────────
    defineField({ group: 'generated', name: 'contractGoogleDocUrl', title: 'Agreement — Google Doc URL', type: 'url',      readOnly: true }),
    defineField({ group: 'generated', name: 'contractPdfAsset',     title: 'Agreement — PDF File',       type: 'file',     readOnly: true }),
    defineField({ group: 'generated', name: 'contractGeneratedAt',  title: 'Agreement — Generated At',   type: 'datetime', readOnly: true }),

    // ── Quotation ─────────────────────────────────────────────────────────────
    defineField({ group: 'generated', name: 'quotationGoogleDocUrl', title: 'Quotation — Google Doc URL', type: 'url',      readOnly: true }),
    defineField({ group: 'generated', name: 'quotationPdfAsset',     title: 'Quotation — PDF File',       type: 'file',     readOnly: true }),
    defineField({ group: 'generated', name: 'quotationGeneratedAt',  title: 'Quotation — Generated At',   type: 'datetime', readOnly: true }),
  ],

  preview: {
    select: {
      contractNumber:  'contractNumber',
      quotationNumber: 'quotationNumber',
      customerName:    'customerName',
      projectEn:       'projectSite.projectEn',
      status:          'generationStatus',
    },
    prepare({ contractNumber, quotationNumber, customerName, projectEn, status }) {
      const icon  = status === 'success' ? ' ✓' : status === 'error' ? ' ✗' : ''
      const title = contractNumber
        ?? quotationNumber
        ?? `Draft — ${projectEn ?? customerName ?? '(New)'}`
      return {
        title:    title + icon,
        subtitle: customerName ?? '—',
      }
    },
  },
})
