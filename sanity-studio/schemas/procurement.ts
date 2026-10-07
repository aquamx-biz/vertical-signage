import { defineField, defineType, defineArrayMember } from 'sanity'
import { DynamicFieldsInput }                        from '../components/DynamicFieldsInput'
import { AutoProcurementPaymentStatusInput }         from '../components/AutoProcurementPaymentStatusInput'
import { LinkedPaymentsDisplay }                    from '../components/LinkedPaymentsDisplay'
import { AssetTypeSelect }            from '../components/AssetTypeSelect'
import { ProcurementSpecFieldsInput } from '../components/ProcurementSpecFieldsInput'
import { AutoProcurementSetupInput }  from '../components/AutoSetupRefInput'
import { AutoProcurementStatusInput }    from '../components/AutoProcurementStatusInput'
import { ComparisonItemsTable }          from '../components/ComparisonItemsTable'
import { ApprovedOrderSummary }       from '../components/ApprovedOrderSummary'
import { createAutoNumberInput }      from '../components/AutoNumberInput'
import { CopyFromProcurementInput }         from '../components/CopyFromProcurementInput'
import { ProcessSetupDescriptionBanner }   from '../components/ProcessSetupDescriptionBanner'
import { ApprovalLockedBanner }            from '../components/ApprovalLockedBanner'
import { accountingEntryField }            from './accountingEntryField'

const ProcurementNumberInput = createAutoNumberInput('purchaseOrder')

/**
 * Procurement — tracks the full lifecycle of purchasing a physical item.
 *
 * Pipeline:
 *   Created → Processing → Approved → Order Placed → Order Shipped
 *   → Delivered (Accepted | Partial | Rejected)
 *
 * One Procurement can cover multiple units/assets of the same item.
 * Assets are created at step 3.2 (Item Checked) upon acceptance.
 */
export default defineType({
  name:  'procurement',
  title: 'Procurement',
  type:  'document',

  groups: [
    { name: 'spec',       title: '1. Compare & Approve', default: true },
    { name: 'ordering',   title: '2. Ordering'                         },
    { name: 'delivery',   title: '3. Delivery'                         },
    { name: 'payment',    title: '4. Payment'                          },
    { name: 'accounting', title: '5. Accounting'                       },
    { name: 'generated',  title: 'Generated Documents'                 },
    { name: 'dynamic',    title: 'Activity Fields'                     },
    { name: 'custom',     title: 'Custom Fields'                       },
  ],

  fields: [

    // ── Approval locked banner (shown when approved) ──────────────────────────
    defineField({
      group:      'spec',
      name:       'approvalLockedBanner',
      title:      'Approval Lock',
      type:       'string',
      readOnly:   true,
      components: { input: ApprovalLockedBanner },
    }),

    // ── Process Setup description banner (top of form) ────────────────────────
    defineField({
      group:      'spec',
      name:       'setupDescriptionBanner',
      title:      'Process Setup Guide',
      type:       'string',
      hidden:     ({ document }) => !(document?.contractType as any)?._ref,
      components: { input: ProcessSetupDescriptionBanner },
    }),

    // ── Status (top-level, always visible) ────────────────────────────────────

    defineField({
      name:       'procurementStatus',
      title:      'Procurement Status',
      type:       'string',
      components: { input: AutoProcurementStatusInput },
    }),

    // ── 1. Compare & Approve ──────────────────────────────────────────────────

    defineField({
      group:      'spec',
      name:       'purchaseOrderNumber',
      title:      'Purchase Order Number',
      type:       'string',
      readOnly:   ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Auto-generated purchase order number. Click Generate after linking a Process Setup.',
      components: { input: ProcurementNumberInput },
    }),

    defineField({
      group:       'spec',
      name:        'copyFromProcurement',
      title:       'Copy from Previous PO',
      type:        'reference',
      to:          [{ type: 'procurement' }],
      description: 'Optional: select a past procurement to copy its vendors, specs, and pricing into this new order.',
      components:  { input: CopyFromProcurementInput },
      options:     { filter: 'receivedStatus == "accepted" || approvalStatus == "approved"' },
    }),

    defineField({
      group:      'spec',
      name:       'contractType',
      title:      'Process Setup',
      type:       'reference',
      to:         [{ type: 'contractType' }],
      readOnly:   ({ document }) => (document?.approvalStatus as string) === 'approved',
      validation: Rule => Rule.required(),
      components: { input: AutoProcurementSetupInput },
    }),

    defineField({
      group:       'spec',
      name:        'assetType',
      title:       'Asset Type',
      type:        'string',
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'The type of asset being procured — drives spec fields below.',
      validation:  Rule => Rule.required(),
      components:  { input: AssetTypeSelect },
    }),

    defineField({
      group:    'spec',
      name:     'quantity',
      title:    'Quantity Required',
      type:     'number',
      readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved',
      validation: Rule => Rule.required().min(1),
    }),

    defineField({
      group:    'spec',
      name:     'budgetRange',
      title:    'Budget Range',
      type:     'object',
      readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved',
      options:  { collapsible: false },
      fields: [
        defineField({ name: 'min', title: 'Min (THB)', type: 'number' }),
        defineField({ name: 'max', title: 'Max (THB)', type: 'number' }),
      ],
    }),

    // ── Comparison Items ──────────────────────────────────────────────────────
    defineField({
      group:       'spec',
      name:        'comparisonItems',
      title:       'Comparison Items',
      type:        'array',
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Add one entry per vendor being compared. Spec fields are driven by the selected Asset Type.',
      validation:  Rule => Rule.required().min(1).error('At least one comparison item is required before submitting for approval.'),
      components:  { input: ComparisonItemsTable },
      of: [defineArrayMember({
        type:   'object',
        name:   'comparisonItem',
        title:  'Comparison Item',
        fields: [
          defineField({
            name:       'vendor',
            title:      'Vendor',
            type:       'reference',
            to:         [{ type: 'party' }],
            validation: Rule => Rule.required(),
          }),
          defineField({
            name:  'quotedPrice',
            title: 'Quoted Price (per unit, THB)',
            type:  'number',
          }),
          defineField({
            name:       'specFields',
            title:      'Spec Values',
            type:       'string',
            description: 'Spec fields from the selected Asset Type.',
            components: { input: ProcurementSpecFieldsInput },
          }),
          defineField({
            name:         'selected',
            title:        'Selected',
            type:         'boolean',
            description:  'Mark this vendor as the chosen option.',
            initialValue: false,
          }),
          defineField({ name: 'notes', title: 'Notes', type: 'text', rows: 2 }),
        ],
        preview: {
          select: {
            vendor:   'vendor.legalName_en',
            price:    'quotedPrice',
            selected: 'selected',
          },
          prepare({ vendor, price, selected }: { vendor?: string; price?: number; selected?: boolean }) {
            return {
              title:    `${selected ? '✅ ' : ''}${vendor ?? '(no vendor)'}`,
              subtitle: price ? `${Number(price).toLocaleString()} THB / unit` : '',
            }
          },
        },
      })],
    }),

    // Warranty block
    defineField({
      group:  'spec',
      name:   'warrantyOffer',
      title:  'Warranty Offered',
      type:   'boolean',
      initialValue: false,
    }),

    defineField({
      group:  'spec',
      name:   'warrantyPeriod',
      title:  'Warranty Period',
      type:   'string',
      hidden: ({ document }) => !document?.warrantyOffer,
    }),

    defineField({
      group:  'spec',
      name:   'warrantyDetails',
      title:  'Warranty Coverage Details',
      type:   'text',
      rows:   3,
      hidden: ({ document }) => !document?.warrantyOffer,
    }),

    // ── Approval (managed by the Approval tab — do not edit manually) ─────────
    defineField({ name: 'approvalStatus',      title: 'Approval Status',      type: 'string',   hidden: true }),
    defineField({ name: 'notificationEmail',   title: 'Notification Email',   type: 'string',   hidden: true }),
    defineField({ name: 'approvedAt',          title: 'Approved At',          type: 'datetime', hidden: true }),
    defineField({ name: 'approvalResetReason', title: 'Approval Reset Reason',type: 'string',   hidden: true }),
    defineField({ name: 'lastApprovalSnapshot',title: 'Last Approval Snapshot',type: 'string',  hidden: true }),

    // ── Generated Documents (managed by the Generate tab — do not edit manually) ──

    defineField({ group: 'generated', name: 'lastGenerationResult',     title: 'Last Generation',         type: 'string',   readOnly: true }),
    defineField({ group: 'generated', name: 'purchaseOrderGoogleDocUrl',title: 'Purchase Order — Google Doc URL', type: 'url',  readOnly: true }),
    defineField({ group: 'generated', name: 'purchaseOrderPdfAsset',    title: 'Purchase Order — PDF File',      type: 'file', readOnly: true }),
    defineField({ group: 'generated', name: 'purchaseOrderGeneratedAt', title: 'Purchase Order — Generated At',  type: 'datetime', readOnly: true }),

    // Hidden metadata used internally by GenerateView
    defineField({ name: 'generationStatus',    title: 'Generation Status',     type: 'string',   hidden: true }),
    defineField({ name: 'generatedDocType',    title: 'Generated Doc Type',    type: 'string',   hidden: true }),
    defineField({ name: 'generationError',     title: 'Generation Error',      type: 'string',   hidden: true }),

    // ── 2. Ordering ───────────────────────────────────────────────────────────

    defineField({
      group:      'ordering',
      name:       'approvedOrderSummary',
      title:      'Approved Order Summary',
      type:       'string',
      readOnly:   true,
      components: { input: ApprovedOrderSummary },
    }),

    defineField({ group: 'ordering', name: 'orderPlacedDate',     title: 'Order Placed Date',     type: 'date'   }),
    defineField({ group: 'ordering', name: 'orderShippedDate',    title: 'Order Shipped Date',    type: 'date'   }),
    defineField({ group: 'ordering', name: 'trackingNumber',      title: 'Tracking Number',       type: 'string' }),
    defineField({ group: 'ordering', name: 'estimatedDelivery',   title: 'Estimated Delivery',    type: 'date'   }),
    defineField({ group: 'ordering', name: 'orderNotes',          title: 'Order Notes',           type: 'text', rows: 2 }),

    // ── 3. Delivery ───────────────────────────────────────────────────────────

    defineField({ group: 'delivery', name: 'receivedDate', title: 'Received Date', type: 'date' }),

    defineField({
      group:   'delivery',
      name:    'receivedStatus',
      title:   'Received Status',
      type:    'string',
      options: {
        list: [
          { title: '✅ Accepted',          value: 'accepted' },
          { title: '⚠️ Partial',            value: 'partial'  },
          { title: '❌ Rejected / Returned', value: 'rejected' },
        ],
      },
    }),

    defineField({ group: 'delivery', name: 'receivedQty',   title: 'Quantity Received',  type: 'number' }),
    defineField({ group: 'delivery', name: 'remainingQty',  title: 'Quantity Remaining', type: 'number',
      description: 'Outstanding units not yet received. Update manually if delivery is partial.',
    }),

    defineField({ group: 'delivery', name: 'deliveryRejectionReason', title: 'Rejection / Return Reason', type: 'text', rows: 2,
      hidden: ({ document }) => (document?.receivedStatus as string) === 'accepted',
    }),

    defineField({ group: 'delivery', name: 'deliveryNotes', title: 'Delivery Notes', type: 'text', rows: 2 }),

    // ── 4. Payment ────────────────────────────────────────────────────────────

    defineField({
      group:       'payment',
      name:        'linkedPayments',
      title:       'Linked Payments',
      type:        'string',
      description: 'Auto-populated from Payment documents that reference this Procurement. To link a payment, open the Payment document and add this Procurement there.',
      readOnly:    true,
      components:  { input: LinkedPaymentsDisplay },
    }),

    defineField({
      group:        'payment',
      name:         'paymentStatus',
      title:        'Payment Status',
      type:         'string',
      initialValue: 'unpaid',
      description:  'Auto-derived from linked Payment documents.',
      components:   { input: AutoProcurementPaymentStatusInput },
      options: {
        list: [
          { title: '❌ Unpaid',  value: 'unpaid'  },
          { title: '⚠️ Partial', value: 'partial' },
          { title: '✅ Paid',    value: 'paid'    },
        ],
      },
    }),

    // ── Activity Dynamic Fields (from Process Setup) ──────────────────────────

    defineField({
      group:       'dynamic',
      name:        'dynamicFields',
      title:       'Activity Dynamic Fields',
      type:        'string',
      description: 'Fields defined by the selected Process Setup.',
      components:  { input: DynamicFieldsInput },
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
        preview: { select: { title: 'key', subtitle: 'value' } },
      })],
    }),

    // ── Accounting ────────────────────────────────────────────────────────────
    // Reconstructed 2026-05-15 from production data + AccountingEntryInput,
    // AutoAllocatedCostInput, AutoApAccountInput, AutoGlFromAssetTypeInput,
    // AutoGlFromProcurementInput, TotalAssetCostDisplay component refs.
    // All five fields were missing from the schema while data already carried them
    // on every published procurement document (6/6 docs for the first four,
    // 4/6 for `documents`). Same loss pattern as the billingPeriods recovery.
    defineField({
      group:       'accounting',
      name:        'accountCode',
      title:       '5.1 · GL Account (Asset / Expense)',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      weak:        true,
      options:     { disableNew: true },
      description: 'Account this procurement posts to. Auto-derived from asset type via Process Setup; pairs with the AP account below to form the Dr/Cr lines in the Accounting Entry below.',
    }),

    defineField({
      group:       'accounting',
      name:        'apAccount',
      title:       '5.2 · Accounts Payable',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      weak:        true,
      options:     { disableNew: true },
      description: 'Liability account credited when this procurement is recognised. Auto-derived; do not edit unless overriding the default AP routing.',
    }),

    defineField({
      group:       'accounting',
      name:        'invoiceAmount',
      title:       '5.3 · Invoice Amount (THB)',
      type:        'number',
      description: 'Total invoice value. Used to allocate per-unit cost across quantity (Procurement → invoiceAmount ÷ quantity) for downstream asset cost calculations.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'accounting',
      name:        'documents',
      title:       '5.4 · Procurement Documents',
      type:        'object',
      description: 'Supporting files attached to this procurement. Both fields are optional.',
      fields: [
        defineField({
          name:    'specSheet',
          title:   'Spec Sheet',
          type:    'file',
          options: { accept: '.pdf,image/*' },
        }),
        defineField({
          name:    'vendorQuotation',
          title:   'Vendor Quotation',
          type:    'file',
          options: { accept: '.pdf,image/*' },
        }),
      ],
    }),

    // ── Accounting Entry (shared field shape, imported from accountingEntryField) ──
    // Same import-and-spread pattern as payment.ts (line 28 + spread at the
    // end of payment fields). Data shape (entryDate, glStatus, lines[], postedAt)
    // matches accountingEntryField.ts exactly — 6/6 procurement docs already carry it.
    accountingEntryField,

  ],

  preview: {
    select: {
      number:    'purchaseOrderNumber',
      assetType: 'assetType',
      status:    'procurementStatus',
      items:     'comparisonItems',
    },
    prepare({ number, assetType, status, items }: { number?: string; assetType?: string; status?: string; items?: any[] }) {
      const statusLabel: Record<string, string> = {
        created:              '📝 Created',
        processing:           '🔄 Processing',
        approved:             '✅ Approved',
        order_placed:         '📦 Order Placed',
        order_shipped:        '🚚 Shipped',
        delivered_accepted:   '✅ Delivered',
        delivered_partial:    '⚠️ Partial Delivery',
        delivered_rejected:   '❌ Rejected',
      }
      const count = (items ?? []).length
      return {
        title:    number ? `${number}${assetType ? ` — ${assetType}` : ''}` : (assetType ?? '(Untitled)'),
        subtitle: `${statusLabel[status ?? ''] ?? ''}${count ? `  ·  ${count} vendor(s)` : ''}`,
      }
    },
  },
})
