import { defineField, defineType, defineArrayMember } from 'sanity'
import { AssetTypeSelect }               from '../components/AssetTypeSelect'
import { AssetSpecFieldsInput }          from '../components/AssetSpecFieldsInput'
import { DepreciationScheduleInput }     from '../components/DepreciationScheduleInput'
import { UtilizationSummary }            from '../components/UtilizationSummary'
import { AutoAllocatedCostInput }        from '../components/AutoAllocatedCostInput'
import { TotalAssetCostDisplay }         from '../components/TotalAssetCostDisplay'
import { AutoUnitCostInput }             from '../components/AutoUnitCostInput'
import { AutoGlFromProcurementInput }    from '../components/AutoGlFromProcurementInput'

/**
 * Asset — a physical device or item owned/managed by the organisation.
 *
 * Created when a Procurement item is accepted at delivery (step 3.2).
 * Tracks location history across Project Sites, warranty, and claims.
 */
export default defineType({
  name:  'asset',
  title: 'Asset',
  type:  'document',

  groups: [
    { name: 'identity',     title: 'Identity & Spec',        default: true },
    { name: 'delivery',     title: 'Delivery & Acceptance'                 },
    { name: 'financial',    title: 'Financial & Depreciation'              },
    { name: 'utilization',  title: 'Utilization'                           },
    { name: 'location',     title: 'Location'                              },
    { name: 'warranty',     title: 'Warranty'                              },
    { name: 'custom',       title: 'Custom Fields'                         },
  ],

  fields: [

    // ── Identity & Spec ───────────────────────────────────────────────────────

    defineField({
      group:       'identity',
      name:        'contractType',
      title:       'Process Setup',
      type:        'reference',
      to:          [{ type: 'contractType' }],
      description: 'Select the Process Setup to load asset types and spec fields.',
    }),

    defineField({
      group:       'identity',
      name:        'assetType',
      title:       'Asset Type',
      type:        'string',
      description: 'The type of this asset — drives which spec fields appear below.',
      components:  { input: AssetTypeSelect },
    }),

    defineField({
      group:       'identity',
      name:        'assetTag',
      title:       'Asset Tag',
      type:        'string',
      description: 'Internal asset identifier (e.g. AST-2026-001). Fill manually or follow your numbering convention.',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group: 'identity',
      name:  'brand',
      title: 'Brand',
      type:  'string',
    }),

    defineField({
      group: 'identity',
      name:  'model',
      title: 'Model',
      type:  'string',
    }),

    defineField({
      group: 'identity',
      name:  'serialNumber',
      title: 'Serial Number',
      type:  'string',
    }),

    defineField({
      group:       'identity',
      name:        'sourceProcurement',
      title:       'Source Procurement',
      type:        'reference',
      to:          [{ type: 'procurement' }],
      description: 'The procurement order this asset came from.',
    }),

    defineField({
      group: 'identity',
      name:  'receivedDate',
      title: 'Received Date',
      type:  'date',
    }),

    defineField({
      group:        'identity',
      name:         'status',
      title:        'Status',
      type:         'string',
      initialValue: 'in_storage',
      options: {
        list: [
          { title: '📦 In Storage',      value: 'in_storage'     },
          { title: '✅ Installed',        value: 'installed'      },
          { title: '🔧 Under Repair',    value: 'under_repair'   },
          { title: '⛔ Decommissioned',  value: 'decommissioned' },
          { title: '↩️ Returned',         value: 'returned'       },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    // Dynamic spec fields — driven by the selected Asset Type in Process Setup
    defineField({
      group:       'identity',
      name:        'specFields',
      title:       'Spec Fields',
      type:        'string',
      description: 'Spec fields are defined per asset type in Process Setup → Asset Config.',
      components:  { input: AssetSpecFieldsInput },
    }),

    // ── Delivery & Acceptance ─────────────────────────────────────────────────

    defineField({
      group:        'delivery',
      name:         'receivedStatus',
      title:        '3.2 · Received Status',
      type:         'string',
      options: {
        list: [
          { title: '✅ Accepted',           value: 'accepted' },
          { title: '⚠️ Partial',            value: 'partial'  },
          { title: '❌ Rejected / Returned', value: 'rejected' },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group: 'delivery',
      name:  'deliveryNotes',
      title: '3.6 · Delivery Notes',
      type:  'text',
      rows:  2,
    }),

    defineField({
      group:       'delivery',
      name:        'deliveryNote',
      title:       '3.7 · Delivery Note / Tax Invoice',
      type:        'file',
      description: 'Attach the vendor\'s delivery note or tax invoice received with the goods.',
    }),

    // ── Location ──────────────────────────────────────────────────────────────

    defineField({
      group:       'location',
      name:        'currentSite',
      title:       'Current Location',
      type:        'reference',
      to:          [{ type: 'projectSite' }],
      description: 'Where this asset is currently deployed. Update when asset is moved.',
    }),

    defineField({
      group:       'location',
      name:        'locationHistory',
      title:       'Location History',
      type:        'array',
      description: 'Record of every site this asset has been installed at.',
      of: [defineArrayMember({
        type:   'object',
        name:   'locationEntry',
        title:  'Location Entry',
        fields: [
          defineField({
            name:  'site',
            title: 'Project Site',
            type:  'reference',
            to:    [{ type: 'projectSite' }],
            validation: Rule => Rule.required(),
          }),
          defineField({ name: 'installedDate', title: 'Installed Date', type: 'date' }),
          defineField({ name: 'removedDate',   title: 'Removed Date',   type: 'date' }),
          defineField({ name: 'notes',         title: 'Notes',          type: 'string' }),
        ],
        preview: {
          select: { title: 'site.projectEn', subtitle: 'installedDate' },
          prepare({ title, subtitle }) {
            return { title: title ?? '(site)', subtitle: subtitle ?? '' }
          },
        },
      })],
    }),

    // ── Warranty ──────────────────────────────────────────────────────────────

    defineField({
      group:   'warranty',
      name:    'warrantyVendor',
      title:   'Warranty Vendor',
      type:    'reference',
      to:      [{ type: 'party' }],
      description: 'The party responsible for warranty service.',
    }),

    defineField({
      group: 'warranty',
      name:  'warrantyStartDate',
      title: 'Warranty Start Date',
      type:  'date',
    }),

    defineField({
      group: 'warranty',
      name:  'warrantyEndDate',
      title: 'Warranty End Date',
      type:  'date',
    }),

    defineField({
      group: 'warranty',
      name:  'warrantyTerms',
      title: 'Warranty Terms',
      type:  'text',
      rows:  3,
    }),

    defineField({
      group: 'warranty',
      name:  'warrantyDoc',
      title: 'Warranty Document',
      type:  'file',
    }),

    defineField({
      group:       'warranty',
      name:        'warrantyClaims',
      title:       'Warranty Claims',
      type:        'array',
      description: 'Log of all warranty claims made for this asset.',
      of: [defineArrayMember({
        type:   'object',
        name:   'warrantyClaim',
        title:  'Warranty Claim',
        fields: [
          defineField({ name: 'claimDate',   title: 'Claim Date',          type: 'date',   validation: Rule => Rule.required() }),
          defineField({ name: 'details',     title: 'Claim Details',       type: 'text',   rows: 3 }),
          defineField({
            name:    'status',
            title:   'Status',
            type:    'string',
            options: {
              list: [
                { title: '🔔 Open',     value: 'open'     },
                { title: '🔧 In Progress', value: 'in_progress' },
                { title: '✅ Resolved', value: 'resolved' },
                { title: '❌ Rejected', value: 'rejected' },
              ],
            },
            initialValue: 'open',
          }),
          defineField({ name: 'resolution', title: 'Resolution Details', type: 'text',   rows: 2 }),
          defineField({ name: 'resolvedDate', title: 'Resolved Date',    type: 'date'  }),
          defineField({ name: 'claimDoc',    title: 'Supporting Document', type: 'file' }),
        ],
        preview: {
          select: { title: 'claimDate', subtitle: 'status' },
          prepare({ title, subtitle }) {
            const labels: Record<string, string> = { open: '🔔 Open', in_progress: '🔧 In Progress', resolved: '✅ Resolved', rejected: '❌ Rejected' }
            return { title: title ?? '', subtitle: labels[subtitle ?? ''] ?? subtitle }
          },
        },
      })],
    }),

    // ── Financial & Depreciation ──────────────────────────────────────────────

    defineField({
      group:       'financial',
      name:        'accountCode',
      title:       '1. GL Account',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { disableNew: true },
      description: 'Asset GL account — auto-filled from the linked procurement or payment. Override with the pencil icon.',
      components:  { input: AutoGlFromProcurementInput },
    }),

    defineField({
      group:       'financial',
      name:        'unitCost',
      title:       '1.10 · Primary Acquisition Cost (THB)',
      type:        'number',
      description: 'Auto-derived from the first Cost Source. You can override manually.',
      validation:  Rule => Rule.min(0),
      components:  { input: AutoUnitCostInput },
    }),

    defineField({
      group:        'delivery',
      name:         'receivedQty',
      title:        '3.1 · Quantity Received',
      type:         'number',
      initialValue: 1,
      description:  'Number of units received. Used to calculate unit cost per asset when purchased in bulk.',
      validation:   Rule => Rule.min(1).integer(),
    }),

    defineField({
      group:       'financial',
      name:        'sourcePayment',
      title:       '1.10c · Source Payment',
      type:        'array',
      description: 'The procurement or payment document(s) that directly purchased this asset.',
      of: [defineArrayMember({
        type: 'reference',
        to:   [{ type: 'procurement' }, { type: 'payment' }],
        options: { disableNew: true },
      })],
    }),

    defineField({
      group:       'financial',
      name:        'costSources',
      title:       '1.11 · Cost Sources',
      type:        'array',
      description: 'Procurement or payment documents that contributed to this asset\'s total acquisition cost.',
      of: [defineArrayMember({
        type: 'reference',
        to:   [{ type: 'procurement' }, { type: 'payment' }],
        options: { disableNew: true },
      })],
    }),

    defineField({
      group:       'financial',
      name:        'additionalCostSources',
      title:       '1.11b · Additional Cost Allocations',
      type:        'array',
      description: 'Itemised cost allocations with explicit amounts (e.g. partial allocation from a shared payment). Each entry contributes to the total depreciable cost.',
      of: [defineArrayMember({
        type:   'object',
        name:   'additionalCostSource',
        title:  'Cost Allocation',
        fields: [
          defineField({ name: 'label',          title: 'Label',                type: 'string', validation: Rule => Rule.required() }),
          defineField({ name: 'allocatedCost', title: 'Allocated Cost (THB)', type: 'number', validation: Rule => Rule.required().min(0), components: { input: AutoAllocatedCostInput } }),
          defineField({
            name:    'sourceDocument',
            title:   'Source Document',
            type:    'reference',
            to:      [{ type: 'procurement' }, { type: 'payment' }],
            options: { disableNew: true },
          }),
        ],
        preview: {
          select: { title: 'label', subtitle: 'allocatedCost' },
          prepare({ title, subtitle }: { title?: string; subtitle?: number }) {
            return { title: title ?? '(cost)', subtitle: subtitle != null ? `฿${subtitle.toLocaleString()}` : '' }
          },
        },
      })],
    }),

    defineField({
      group:      'financial',
      name:       'totalAssetCost',
      title:      'Total Asset Cost',
      type:       'string',
      readOnly:   true,
      components: { input: TotalAssetCostDisplay },
    }),

    defineField({
      group:   'financial',
      name:    'depreciationMethod',
      title:   '1.12 · Depreciation Method',
      type:    'string',
      options: {
        list: [
          { title: 'Straight-line (monthly over useful life)',  value: 'straight_line' },
          { title: 'Immediate expense (100% on acquisition)',   value: 'immediate'     },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:       'financial',
      name:        'usefulLifeMonths',
      title:       '1.13 · Useful Life (months)',
      type:        'number',
      hidden:      ({ document }) => (document?.depreciationMethod as string) === 'immediate',
      description: 'Number of months over which cost is amortised.',
      validation:  Rule => Rule.min(1).integer(),
    }),

    defineField({
      group:       'financial',
      name:        'depreciationExpenseAccount',
      title:       '3.3 · Depreciation Expense Account',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { disableNew: true },
      hidden:      ({ document }) => (document?.depreciationMethod as string) === 'immediate',
      description: 'DR side of the monthly depreciation journal entry.',
    }),

    defineField({
      group:       'financial',
      name:        'accumulatedDepreciationAccount',
      title:       '3.4 · Accumulated Depreciation Account',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { disableNew: true },
      hidden:      ({ document }) => (document?.depreciationMethod as string) === 'immediate',
      description: 'CR side of the monthly depreciation journal entry (contra-asset).',
    }),

    defineField({
      group:       'financial',
      name:        'depreciationSchedule',
      title:       'Depreciation Schedule',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => !document?.depreciationMethod,
      components:  { input: DepreciationScheduleInput },
    }),

    defineField({
      group:   'financial',
      name:    'depreciationEntries',
      title:   'Depreciation Journal Entries',
      type:    'array',
      hidden:  true,
      readOnly: true,
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'journalEntry' }], options: { disableNew: true } })],
    }),

    // ── Utilization ───────────────────────────────────────────────────────────

    defineField({
      group:       'utilization',
      name:        'utilization',
      title:       'Utilization Log',
      type:        'array',
      description: 'Track which project site this asset was deployed to and for how long. Used to allocate cost per period.',
      of: [defineArrayMember({
        type:   'object',
        name:   'utilizationEntry',
        title:  'Utilization Entry',
        fields: [
          defineField({
            name:  'projectSite',
            title: 'Project Site',
            type:  'reference',
            to:    [{ type: 'projectSite' }],
            validation: Rule => Rule.required(),
          }),
          defineField({ name: 'startDate', title: 'Start Date', type: 'date', validation: Rule => Rule.required() }),
          defineField({ name: 'endDate',   title: 'End Date',   type: 'date', description: 'Leave blank if still active at this site.' }),
          defineField({ name: 'notes',     title: 'Notes',      type: 'string' }),
        ],
        preview: {
          select: { site: 'projectSite.projectEn', startDate: 'startDate', endDate: 'endDate' },
          prepare({ site, startDate, endDate }: { site?: string; startDate?: string; endDate?: string }) {
            return {
              title:    site ?? '(no site)',
              subtitle: `${startDate ?? '?'} → ${endDate ?? 'ongoing'}`,
            }
          },
        },
      })],
    }),

    defineField({
      group:      'utilization',
      name:       'utilizationSummary',
      title:      'Cost Allocation Summary',
      type:       'string',
      readOnly:   true,
      components: { input: UtilizationSummary },
    }),

    // ── Custom Fields ─────────────────────────────────────────────────────────

    defineField({
      group:       'custom',
      name:        'customFields',
      title:       'Custom Fields',
      type:        'array',
      description: 'Add any additional fields not covered above.',
      of: [defineArrayMember({
        type:   'object',
        name:   'customField',
        title:  'Field',
        fields: [
          defineField({ name: 'key',   title: 'Field Name',  type: 'string', validation: Rule => Rule.required() }),
          defineField({ name: 'value', title: 'Field Value', type: 'string' }),
        ],
        preview: {
          select: { title: 'key', subtitle: 'value' },
        },
      })],
    }),

  ],

  preview: {
    select: {
      assetTag:  'assetTag',
      brand:     'brand',
      model:     'model',
      status:    'status',
      siteName:  'currentSite.projectEn',
    },
    prepare({ assetTag, brand, model, status, siteName }) {
      const statusLabel: Record<string, string> = {
        in_storage:     '📦 In Storage',
        installed:      '✅ Installed',
        under_repair:   '🔧 Under Repair',
        decommissioned: '⛔ Decommissioned',
        returned:       '↩️ Returned',
      }
      return {
        title:    `${assetTag ?? '(no tag)'}  ·  ${[brand, model].filter(Boolean).join(' ')}`,
        subtitle: `${statusLabel[status ?? ''] ?? ''}${siteName ? `  ·  ${siteName}` : ''}`,
      }
    },
  },
})
