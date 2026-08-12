import { defineField, defineType, defineArrayMember } from 'sanity'
import { DynamicFieldsInput }                     from '../components/DynamicFieldsInput'
import { AutoPaymentSetupInput }                  from '../components/AutoSetupRefInput'
import { ProcurementsArrayInput }                from '../components/ProcurementsArrayInput'
import { ProcessSetupDescriptionBanner }        from '../components/ProcessSetupDescriptionBanner'
import { ApprovalLockedBanner }                from '../components/ApprovalLockedBanner'
import { createAutoNumberInput }               from '../components/AutoNumberInput'
import { AutoPaymentStatusInput }             from '../components/AutoPaymentStatusInput'
import { AutoPaidAmountInput }               from '../components/AutoPaidAmountInput'
import { ExpenseCategoryInput }               from '../components/ExpenseCategoryInput'
import { AutoGlAccountPaymentInput }        from '../components/AutoGlAccountPaymentInput'
import { NetPayableSummary }               from '../components/NetPayableSummary'
import { AutoPaymentAmountInput }         from '../components/AutoPaymentAmountInput'
import { ParentPaymentInput }            from '../components/ParentPaymentInput'
import { PaymentChainSummary }            from '../components/PaymentChainSummary'
import { AutoWhtAmountInput }              from '../components/AutoWhtAmountInput'
import { AutoSubmitByInput }               from '../components/AutoSubmitByInput'
import { AutoSubmitDateInput }             from '../components/AutoSubmitDateInput'
import { BankAccountInput }                from '../components/BankAccountInput'
import { AssetTypeSelect }                from '../components/AssetTypeSelect'
import { LinkedAssetsDisplay }            from '../components/LinkedAssetsDisplay'
import { LinkedServiceContractInput }     from '../components/LinkedServiceContractInput'
import { ReceiptsArrayInput }             from '../components/ReceiptsArrayInput'
import { PaymentModeInput }               from '../components/PaymentModeInput'
import { SupportingDocsWithExtract }      from '../components/SupportingDocsWithExtract'
import { VendorDefaultsPanel }            from '../components/VendorDefaultsPanel'
import { withTestId }                     from '../components/withTestId'
import { VendorWithNameCacheInput }       from '../components/VendorWithNameCacheInput'
import { accountingEntryField }           from './accountingEntryField'


const PaymentNumberInput  = createAutoNumberInput('payment', { fixedPrefix: 'PMT' })

/**
 * Payment — tracks a payment against one or more Procurement documents.
 *
 * Pipeline:
 *   Created → Submitted → Approved (or Rejected → Created)
 *   → Condition Met → Processing → Paid → Receipt Collected
 *
 * Multiple Procurements can be covered by one Payment, but they must share the same vendor.
 */
export default defineType({
  name:  'payment',
  title: 'Payment',
  type:  'document',

  groups: [
    { name: 'setup',      title: '1. Setup'         },
    { name: 'execution',  title: '2. Execution'     },
    { name: 'project',    title: '3. Project'       },
    { name: 'accounting', title: '4. Accounting'    },
    { name: 'dynamic',    title: 'Process Fields'   },
    { name: 'custom',     title: 'Custom Fields'    },
  ],

  __experimental_search: [
    { weight: 10, path: 'vendorName' },
    { weight: 10, path: 'paymentNumber' },
  ],

  orderings: [
    { title: 'Payment Date — Newest',   name: 'dateDesc',    by: [{ field: 'paymentDate',    direction: 'desc' }] },
    { title: 'Payment Date — Oldest',   name: 'dateAsc',     by: [{ field: 'paymentDate',    direction: 'asc'  }] },
    { title: 'Reference No — Newest',   name: 'numberDesc',  by: [{ field: 'paymentNumber',  direction: 'desc' }] },
    { title: 'Reference No — Oldest',   name: 'numberAsc',   by: [{ field: 'paymentNumber',  direction: 'asc'  }] },
    { title: 'Vendor Name A → Z',       name: 'vendorAsc',   by: [{ field: 'vendorName',     direction: 'asc'  }] },
    { title: 'Vendor Name Z → A',       name: 'vendorDesc',  by: [{ field: 'vendorName',     direction: 'desc' }] },
    { title: 'Status',                  name: 'status',      by: [{ field: 'paymentStatus',  direction: 'asc'  }] },
    { title: 'Amount — Highest First',  name: 'amountDesc',  by: [{ field: 'paymentAmount',  direction: 'desc' }] },
    { title: 'Amount — Lowest First',   name: 'amountAsc',   by: [{ field: 'paymentAmount',  direction: 'asc'  }] },
    { title: 'Due Date — Soonest',      name: 'dueDateAsc',  by: [{ field: 'dueDate',        direction: 'asc'  }] },
  ],


  fields: [

    // ── Approval locked banner ────────────────────────────────────────────────
    defineField({
      group:      'setup',
      name:       'approvalLockedBanner',
      title:      'Approval Lock',
      type:       'string',
      readOnly:   true,
      hidden:     ({ document }) => (document?.approvalStatus as string) !== 'approved',
      components: { input: ApprovalLockedBanner },
    }),

    // ── Payment Mode ──────────────────────────────────────────────────────────
    defineField({
      group:        'setup',
      name:         'paymentMode',
      title:        '1.1 · Payment Mode',
      type:         'string',
      initialValue: 'direct_expense',
      options: {
        list: [
          { title: '🛒 Procurement Payment — pay against a Procurement record',       value: 'procurement'              },
          { title: '📅 Installment Payment — follow-up payment in a series',          value: 'installment'              },
          { title: '💳 Direct Payment — one-off payment without a Procurement record', value: 'direct_expense'          },
          { title: '🏠 Rent Payment — monthly rent expense paid to landlord',           value: 'rent_payment'            },
          { title: '🔧 Service Contract Payment — recurring service fee to vendor',    value: 'service_contract_payment' },
          { title: '💸 Interest Payment — interest expense on a loan facility',        value: 'interest_payment'         },
        ],
        layout: 'radio',
      },
      components: { input: PaymentModeInput },
    }),

    // ── 1.2 · Upload Documents for AI Reading ────────────────────────────────
    defineField({
      group:       'setup',
      name:        'supportingDocs',
      title:       '1.2 · Upload Documents for AI Reading',
      type:        'array',
      description: 'Upload related documents such as quotations, invoices, or purchase orders. Then click "Extract from Doc" to auto-fill payment fields.',
      components:  { input: SupportingDocsWithExtract },
      of: [defineArrayMember({
        type:   'object',
        name:   'supportingDoc',
        title:  'Document',
        fields: [
          defineField({
            name:    'docType',
            title:   'Document Type',
            type:    'string',
            options: {
              list: [
                { title: 'Quotation',       value: 'quotation'       },
                { title: 'Invoice',         value: 'invoice'         },
                { title: 'Purchase Order',  value: 'purchase_order'  },
                { title: 'Other',           value: 'other'           },
              ],
            },
            validation: Rule => Rule.required(),
          }),
          defineField({
            name:  'file',
            title: 'File',
            type:  'file',
            options: { accept: '.pdf,image/*' },
          }),
          defineField({ name: 'note', title: 'Note', type: 'string' }),
        ],
        preview: {
          select: { docType: 'docType', note: 'note' },
          prepare({ docType, note }: { docType?: string; note?: string }) {
            const icons: Record<string, string> = {
              quotation: '📋', invoice: '🧾', purchase_order: '📦', other: '📄',
            }
            return {
              title:    `${icons[docType ?? ''] ?? '📄'} ${docType ?? 'Document'}`,
              subtitle: note ?? '',
            }
          },
        },
      })],
    }),

    // ── 1.2b · Vendor Invoice / Reference No. ────────────────────────────────
    defineField({
      group:       'setup',
      name:        'vendorInvoiceRef',
      title:       '1.2b · Vendor Invoice / Reference No.',
      type:        'string',
      description: 'Invoice or reference number as printed on the vendor document. Auto-filled by AI extraction. Used to detect duplicate payments.',
    }),

    // ── Process Setup description banner (top of form) ────────────────────────
    defineField({
      group:      'setup',
      name:       'setupDescriptionBanner',
      title:      'Process Setup Guide',
      type:       'string',
      hidden:     ({ document }) => ['direct_expense', 'installment', 'rent_payment', 'service_contract_payment', 'interest_payment'].includes(document?.paymentMode as string) || !(document?.contractType as any)?._ref,
      components: { input: ProcessSetupDescriptionBanner },
    }),

    // ── Status (top-level, always visible) ────────────────────────────────────

    defineField({
      group:        'setup',
      name:         'paymentStatus',
      title:        'Payment Status',
      type:         'string',
      initialValue: 'created',
      components:   { input: AutoPaymentStatusInput },
    }),

    // ── 1. Setup ──────────────────────────────────────────────────────────────

    defineField({
      group:       'setup',
      name:        'paymentNumber',
      title:       '1.3 · Payment Reference Number',
      type:        'string',
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Auto-generated payment reference number. Format: PMT-yymm-001.',
      components:  { input: PaymentNumberInput },
      validation:  Rule => Rule.custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = await client.fetch<number>(
          `count(*[_type == "payment" && paymentNumber == $num && _id != $self && !(_id in path("drafts.**"))])`,
          { num: value, self: selfId ?? '' },
        )
        return count === 0 ? true : `"${value}" is already used by another payment — regenerate to get a unique number.`
      }),
    }),

    defineField({
      group:       'setup',
      name:        'procurements',
      title:       '1.4 · Procurements',
      type:        'array',
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'procurement',
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Link one or more Procurement documents covered by this payment. Vendor will be auto-filled from the first linked procurement.',
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.paymentMode as string) !== 'procurement') return true
        if (!value || (value as any[]).length === 0) return 'At least one Procurement must be linked before submitting for approval.'
        return true
      }),
      components:  { input: ProcurementsArrayInput },
      of: [defineArrayMember({
        type: 'reference',
        to:   [{ type: 'procurement' }],
        options: {
          filter: ({ document }: { document: any }) => ({
            filter: '!(_id in *[_type == "payment" && !(_id in path("drafts.**")) && _id != $currentId][].procurements[]._ref)',
            params: { currentId: (document._id as string)?.replace(/^drafts\./, '') ?? '' },
          }),
        },
      })],
    }),

    defineField({
      group:       'setup',
      name:        'parentPayment',
      title:       '1.4 · Root Payment',
      type:        'reference',
      to:          [{ type: 'payment' }],
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'installment',
      description: 'Link to the first (root) payment in this series. Only payments with remaining balance are shown. Total obligation and vendor carry over automatically.',
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.paymentMode as string) !== 'installment') return true
        if (!value) return 'Root Payment is required for Installment payments.'
        return true
      }),
      components:  { input: ParentPaymentInput },
      options: {
        filter: ({ document }: any) => ({
          filter: 'paymentMode == "procurement" && _id != $self && !(_id in path("drafts.**")) && isSettled != true',
          params: { self: (document._id as string)?.replace(/^drafts\./, '') ?? '' },
        }),
        disableNew: true,
      },
    }),

    defineField({
      group:       'setup',
      name:        'linkedServiceContract',
      title:       '1.4 · Service Contract',
      type:        'reference',
      to:          [{ type: 'serviceContract' }],
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'service_contract_payment',
      description: 'Link to the service contract this payment covers. Vendor and amount will be auto-filled.',
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.paymentMode as string) !== 'service_contract_payment') return true
        if (!value) return 'Service Contract is required.'
        return true
      }),
      components:  { input: LinkedServiceContractInput },
      options:     { disableNew: true },
    }),

    defineField({
      group:       'setup',
      name:        'linkedFunding',
      title:       '1.4 · Loan Facility',
      type:        'reference',
      to:          [{ type: 'funding' }],
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'interest_payment',
      description: 'Link to the Funding record (loan drawdown) this interest belongs to. Lender will be auto-filled from the funding record.',
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.paymentMode as string) !== 'interest_payment') return true
        if (!value) return 'Loan Facility is required for Interest Payments.'
        return true
      }),
      options: { disableNew: true },
    }),

    defineField({
      group:       'setup',
      name:        'linkedRentContract',
      title:       '1.4 · Rental Contract',
      type:        'reference',
      to:          [{ type: 'contract' }],
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'rent_payment',
      description: 'Link to the rental contract this payment covers.',
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.paymentMode as string) !== 'rent_payment') return true
        if (!value) return 'Rental Contract is required for Rent Payments.'
        return true
      }),
      options: { disableNew: true },
    }),

    defineField({
      group:       'setup',
      name:        'vendor',
      title:       '1.5 · Vendor / Tenant',
      type:        'reference',
      to:          [{ type: 'party' }],
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Procurement / Installment: auto-filled from linked Procurement. Rent Payment: select the landlord you are paying. Service Contract Payment: auto-filled from the linked service contract.',
      validation:  Rule => Rule.custom((value, context) => {
        const mode = context.document?.paymentMode as string
        if (mode === 'direct_expense') return true
        if (!value) return 'Vendor is required.'
        return true
      }),
      components:  { input: VendorWithNameCacheInput },
    }),

    // Hidden scalar used by list orderings — auto-filled by VendorWithNameCacheInput
    defineField({ name: 'vendorName', title: 'Vendor Name', type: 'string', hidden: true }),

    defineField({
      group:       'setup',
      name:        'paymentAmount',
      title:       '1.6 · Total Obligation',
      type:        'number',
      readOnly:    ({ document }) =>
        (document?.approvalStatus as string) === 'approved' || !!(document?.parentPayment as any)?._ref,
      description: 'Total amount owed for this payment series (in invoice currency, see 1.6). Auto-filled from the root payment when this is an installment.',
      validation:  Rule => Rule.required().min(0),
      components:  { input: AutoPaymentAmountInput },
    }),

    defineField({
      group:        'setup',
      name:         'currency',
      title:        '1.7 · Currency',
      type:         'string',
      readOnly:     ({ document }) => (document?.approvalStatus as string) === 'approved',
      initialValue: 'THB',
      options: {
        list: [
          { title: 'THB — Thai Baht',        value: 'THB'   },
          { title: 'USD — US Dollar',        value: 'USD'   },
          { title: 'EUR — Euro',             value: 'EUR'   },
          { title: 'JPY — Japanese Yen',     value: 'JPY'   },
          { title: 'CNY — Chinese Yuan',     value: 'CNY'   },
          { title: 'SGD — Singapore Dollar', value: 'SGD'   },
          { title: 'Other',                  value: 'other' },
        ],
      },
    }),

    defineField({
      group:       'setup',
      name:        'exchangeRate',
      title:       '1.8 · Exchange Rate (to THB)',
      type:        'number',
      description: 'Only required if currency is not THB.',
      readOnly:    ({ document }) => !document?.currency || (document?.currency as string) === 'THB',
    }),

    defineField({
      group:   'setup',
      name:    'vatType',
      title:   '1.9 · VAT Type',
      type:    'string',
      options: {
        list: [
          { title: 'Inclusive (VAT included in price)',  value: 'inclusive' },
          { title: 'Exclusive (VAT added on top)',       value: 'exclusive' },
          { title: '0% VAT',                            value: 'zero'      },
          { title: 'No VAT',                            value: 'none'      },
        ],
      },
    }),

    defineField({
      group:      'setup',
      name:       'vatAmount',
      title:      '1.10 · VAT Amount',
      type:       'number',
      readOnly:   ({ document }) => !document?.vatType || ['none', 'zero'].includes(document?.vatType as string),
      components: { input: withTestId('payment-vat-amount-input') },
    }),

    defineField({
      group:        'setup',
      name:         'vatClaimable',
      title:        '1.10b · VAT Claimable',
      type:         'boolean',
      initialValue: false,
      hidden:       ({ document }) => (document?.vatType as string) !== 'exclusive',
      description:  'If claimable, VAT is recorded as Purchase VAT (Input Tax). If not claimable, VAT is absorbed into the asset/expense cost.',
    }),

    defineField({
      group:    'setup',
      name:     'paymentType',
      title:    '1.11 · Payment Type',
      type:     'string',
      readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved',
      options: {
        list: [
          { title: '🏦 Bank Transfer',       value: 'transfer' },
          { title: '📄 Cheque',              value: 'cheque'   },
          { title: '💵 Cash',               value: 'cash'     },
          { title: '🌐 International SWIFT', value: 'swift'    },
        ],
      },
    }),

    defineField({
      group:       'setup',
      name:        'paymentMethodDetails',
      title:       '1.12 · Payment Method Details',
      type:        'string',
      description: 'e.g. Cheque number, bank transfer reference number.',
    }),

    defineField({
      group:    'setup',
      name:     'paymentCondition',
      title:    '1.13 · Payment Condition',
      type:     'string',
      readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved',
      options: {
        list: [
          { title: 'Upon Order Placed',    value: 'order_placed'    },
          { title: 'Upon Item Shipped',    value: 'item_shipped'    },
          { title: 'Upon Item Delivered',  value: 'item_delivered'  },
          { title: 'Upon Request',         value: 'upon_request'    },
          { title: 'Upon Acceptance',      value: 'upon_acceptance' },
          { title: 'Other',               value: 'other'           },
        ],
      },
    }),

    defineField({
      group:        'setup',
      name:         'withholdingTaxRate',
      title:        '1.14 · Withholding Tax Rate',
      type:         'string',
      readOnly:     ({ document }) => (document?.approvalStatus as string) === 'approved',
      options: {
        list: [
          { title: 'None',           value: 'none'   },
          { title: '0%',             value: '0'      },
          { title: '3%',             value: '3'      },
          { title: '5%',             value: '5'      },
          { title: '10%',            value: '10'     },
          { title: 'Specify Amount', value: 'custom' },
        ],
      },
      initialValue: 'none',
    }),

    defineField({
      group:  'setup',
      name:   'withholdingTaxCustom',
      title:  '1.15 · Withholding Tax Amount (manual)',
      type:   'number',
      readOnly: ({ document }) => (document?.withholdingTaxRate as string) !== 'custom',
    }),

    defineField({
      group:    'setup',
      name:     'dueDate',
      title:    '1.16 · Payment Due Date',
      type:     'date',
      readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved',
    }),

    defineField({
      group:       'setup',
      name:        'submittedBy',
      title:       '1.17 · Submitted By',
      type:        'string',
      readOnly:    true,
      description: 'Auto-filled from your Studio account when status changes to Submitted.',
      components:  { input: AutoSubmitByInput },
    }),
    defineField({
      group:       'setup',
      name:        'submittedDate',
      title:       '1.18 · Submitted Date',
      type:        'date',
      readOnly:    true,
      description: 'Auto-filled with today\'s date when status changes to Submitted.',
      components:  { input: AutoSubmitDateInput },
    }),

    // ── Hidden computed fields (auto-patched by UI components) ──────────────
    // isSettled: patched by PaymentChainSummary onto the published doc.
    // Used by the parentPayment reference filter to hide fully-settled roots.
    defineField({ name: 'isSettled', title: 'Is Settled', type: 'boolean', hidden: true }),

    // ── Hidden approval fields (written by ApprovalView / approval API) ───────
    defineField({ name: 'approvalStatus',       title: 'Approval Status',        type: 'string',   hidden: true }),
    defineField({ name: 'notificationEmail',    title: 'Notification Email',     type: 'string',   hidden: true }),
    defineField({ name: 'approvedAt',           title: 'Approved At',            type: 'datetime', hidden: true }),
    defineField({ name: 'approvalResetReason',  title: 'Approval Reset Reason',  type: 'string',   hidden: true }),
    defineField({ name: 'lastApprovalSnapshot', title: 'Last Approval Snapshot', type: 'string',   hidden: true }),

    // ── 2. Execution ──────────────────────────────────────────────────────────

    defineField({
      group:        'execution',
      name:         'conditionMet',
      title:        '2.1 · Condition Met',
      type:         'boolean',
      initialValue: false,
      hidden:       ({ document }) => ['direct_expense', 'rent_payment', 'service_contract_payment', 'interest_payment'].includes(document?.paymentMode as string),
      description:  'Check manually, or auto-derived from linked Procurement status.',
    }),

    defineField({ group: 'execution', name: 'conditionMetDate',  title: '2.2 · Condition Met Date',  type: 'date',
      hidden: ({ document }) => ['direct_expense', 'rent_payment', 'service_contract_payment', 'interest_payment'].includes(document?.paymentMode as string),
    }),
    defineField({ group: 'execution', name: 'conditionMetNotes', title: '2.3 · Condition Met Notes', type: 'string',
      hidden: ({ document }) => ['direct_expense', 'rent_payment', 'service_contract_payment', 'interest_payment'].includes(document?.paymentMode as string),
    }),

    defineField({
      group:       'execution',
      name:        'bankAccount',
      title:       '2.4 · Bank Account Used *',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { disableNew: true },
      components:  { input: BankAccountInput },
      description: 'Company bank / cash GL account used to make this payment. Only active sub-accounts under Cash & Cash Equivalents are shown.',
      validation:  Rule => Rule.required(),
    }),

    defineField({ group: 'execution', name: 'paymentDate', title: '2.5 · Payment Date *', type: 'date',
      validation:  Rule => Rule.required(),
      components:  { input: withTestId('payment-date-input') },
    }),
    defineField({ group: 'execution', name: 'paidAmount', title: '2.6 · Gross Amount (THB) *', type: 'number',
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Gross invoice amount in THB — before WHT deduction and before adding exclusive VAT. Auto-filled from the Total Obligation (1.5); edit for partial or installment payments. The actual net transfer to vendor is shown in 2.8.',
      components:  { input: AutoPaidAmountInput },
      validation:  Rule => Rule.required().min(0),
    }),
    defineField({
      group:      'execution',
      name:       'outstandingBalance',
      title:      '2.6b · Payment Chain',
      type:       'string',
      readOnly:   true,
      components: { input: PaymentChainSummary },
      description: 'Installment tracker — visible once a Previous Payment is linked or this payment has installments.',
    }),

    defineField({ group: 'execution', name: 'whtAmount', title: '2.7 · W/H Tax Amount', type: 'number',
      description: 'Auto-calculated from rate × payment amount. Override manually if needed.',
      components:  { input: AutoWhtAmountInput },
    }),

    defineField({
      group:      'execution',
      name:       'netPayableSummary',
      title:      '2.8 · Net Payable',
      type:       'string',
      readOnly:   true,
      components: { input: NetPayableSummary },
      description: 'Gross amount − W/H tax + exclusive VAT. Updated as you fill in the fields above.',
    }),

    // W/H Tax documents (array — multiple docs supported)
    defineField({
      group:       'execution',
      name:        'whtDocs',
      title:       '2.9 · Withholding Tax Documents',
      type:        'array',
      description: 'Upload one or more withholding tax certificate files.',
      of: [defineArrayMember({
        type:   'object',
        name:   'whtDoc',
        fields: [
          defineField({ name: 'doc',       title: 'Document',   type: 'file' }),
          defineField({ name: 'issueDate', title: 'Issue Date', type: 'date' }),
        ],
        preview: { select: { title: 'issueDate' }, prepare({ title }) { return { title: title ?? '(no date)' } } },
      })],
    }),

    // Receipts / Tax invoices
    defineField({
      group:       'execution',
      name:        'receipts',
      title:       '2.10 · Receipts / Tax Invoices *',
      type:        'array',
      description: 'Click "+ Add receipt" to add inline — no modal. Each receipt uploads directly.',
      validation:  Rule => Rule.min(1).error('At least one receipt or tax invoice is required.'),
      components:  { input: ReceiptsArrayInput },
      of: [defineArrayMember({
        type:   'object',
        name:   'paymentReceipt',
        fields: [
          defineField({ name: 'file',          title: 'File (PDF or image)',  type: 'file',   options: { accept: '.pdf,image/*' }, validation: Rule => Rule.required().error('Please upload a file.') }),
          defineField({ name: 'receiptDate',   title: 'Receipt Date',         type: 'date'   }),
          defineField({ name: 'invoiceNumber', title: 'Invoice / Receipt No', type: 'string' }),
        ],
        preview: {
          select: { title: 'invoiceNumber', subtitle: 'receiptDate' },
          prepare({ title, subtitle }) { return { title: title ?? '(no number)', subtitle: subtitle ?? '' } },
        },
      })],
    }),

    defineField({
      group:       'execution',
      name:        'executionNotes',
      title:       '2.11 · Notes',
      type:        'text',
      rows:        3,
      description: 'Any notes about this payment execution — e.g. bank confirmation number, follow-up actions, or special circumstances. If bundled into one bank transfer, list all sibling PMT-xxxx-xxx numbers here (including this one\'s number in the others).',
    }),

    // ── 3. Project ────────────────────────────────────────────────────────────

    defineField({
      group:       'project',
      name:        'expenseProjectSite',
      title:       '3.1 · Project Site',
      type:        'reference',
      to:          [{ type: 'projectSite' }],
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'direct_expense',
      description: 'The project site this expense belongs to. Used to auto-link costs in Install & Activate.',
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.paymentMode as string) !== 'direct_expense') return true
        if (!value) return 'Project Site is required for Direct Expense payments.'
        return true
      }),
    }),

    defineField({
      group:       'project',
      name:        'expenseCategory',
      title:       '3.2 · Project Direct Cost',
      type:        'string',
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'direct_expense',
      readOnly:    ({ document }) => (document?.paymentMode as string) === 'direct_expense' && !(document?.expenseProjectSite as any)?._ref,
      description: 'Category from Process Setup (e.g. Electrical Work, Wifi Setup). Determines which Install & Activate cost group this expense contributes to.',
      components:  { input: ExpenseCategoryInput },
    }),

    defineField({
      name:   'costGroup',
      title:  'Cost Group',
      type:   'string',
      hidden: true,   // auto-filled by ExpenseCategoryInput
    }),
    defineField({
      name:   'expenseCategoryName',
      title:  'Expense Category Name',
      type:   'string',
      hidden: true,   // auto-filled by ExpenseCategoryInput alongside costGroup
    }),

    defineField({
      group:       'project',
      name:        'expenseDescription',
      title:       '3.3 · Payment Notes',
      type:        'string',
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'direct_expense',
      description: 'Any clarification specific to this payment — e.g. scope of work, reference number, or special conditions.',
    }),

    // ── 4. Accounting ─────────────────────────────────────────────────────────

    defineField({
      group:       'accounting',
      name:        'accountCode',
      title:       '4.1 · GL Account *',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { disableNew: true },
      components:  { input: AutoGlAccountPaymentInput },
      description: 'Procurement Payment: auto-filled from linked Procurement GL account. Direct Expense: select from expense, capitalizable asset, or liability accounts (e.g. withholding tax payable, trade creditors).',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'accounting',
      name:        'vendorMemoryPanel',
      title:       '4.1b · Vendor Memory · ค่าประจำของเจ้านี้',
      type:        'string',
      readOnly:    true,
      components:  { input: VendorDefaultsPanel },
      description: 'ดู/บันทึกค่าประจำ (GL · VAT · WHT · Notes) ของ vendor ที่เลือกไว้ — ตัวเดียวกับที่ Extract from Doc ใช้เติมอัตโนมัติ',
    }),

    defineField({
      group:        'accounting',
      name:         'isAssetAcquisition',
      title:        '4.2 · Asset Acquisition',
      type:         'boolean',
      initialValue: false,
      hidden:       ({ document }) => (document?.paymentMode as string) !== 'direct_expense',
      description:  'Turn on if this payment purchases a physical or intangible asset. Reveals asset type and quantity fields below.',
    }),

    defineField({
      group:       'accounting',
      name:        'assetType',
      title:       '4.3 · Asset Type',
      type:        'string',
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'direct_expense' || !(document?.isAssetAcquisition as boolean),
      description: 'Type of asset being acquired. Enables asset registration after payment.',
      components:  { input: AssetTypeSelect },
    }),

    defineField({
      group:        'accounting',
      name:         'assetQuantity',
      title:        '4.4 · Units Purchased',
      type:         'number',
      hidden:       ({ document }) => (document?.paymentMode as string) !== 'direct_expense' || !(document?.isAssetAcquisition as boolean),
      initialValue: 1,
      description:  'Number of units purchased. Used to calculate unit cost per asset registration.',
      validation:   Rule => Rule.min(1),
    }),

    defineField({
      group:       'accounting',
      name:        'linkedAssetsDisplay',
      title:       'Asset Registrations',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'direct_expense' || !(document?.isAssetAcquisition as boolean),
      description: 'Asset docs linked to this payment. Create one after payment is complete.',
      components:  { input: LinkedAssetsDisplay },
    }),

    // ── Activity Dynamic Fields (from Process Setup) ──────────────────────────

    defineField({
      group:      'dynamic',
      name:       'contractType',
      title:      'Process Setup',
      type:       'reference',
      to:         [{ type: 'contractType' }],
      hidden:     ({ document }) => ['direct_expense', 'rent_payment', 'service_contract_payment', 'interest_payment'].includes(document?.paymentMode as string),
      components: { input: AutoPaymentSetupInput },
    }),

    defineField({
      group:       'dynamic',
      name:        'dynamicFields',
      title:       'Activity Dynamic Fields',
      type:        'string',
      hidden:      ({ document }) => ['direct_expense', 'rent_payment', 'service_contract_payment'].includes(document?.paymentMode as string),
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

    accountingEntryField,

  ],

  preview: {
    select: {
      number:       'paymentNumber',
      status:       'paymentStatus',
      vendor:       'vendor.legalName_en',
      vendorName:   'vendorName',
      amount:       'paymentAmount',
      paidAmount:   'paidAmount',
      whtAmount:    'whtAmount',
      vatType:      'vatType',
      vatAmount:    'vatAmount',
      currency:     'currency',
      glName:       'accountCode.nameEn',
      glType:       'accountCode.type',
      categoryName: 'expenseCategoryName',
    },
    prepare({ number, status, vendor, vendorName, amount, paidAmount, whtAmount, vatType, vatAmount, currency, glName, glType, categoryName }: { number?: string; status?: string; vendor?: string; vendorName?: string; amount?: number; paidAmount?: number; whtAmount?: number; vatType?: string; vatAmount?: number; currency?: string; glName?: string; glType?: string; categoryName?: string }) {
      const statusLabel: Record<string, string> = {
        created:       '📝 Created',
        submitted:     '📤 Submitted',
        approved:      '✅ Approved',
        rejected:      '❌ Rejected',
        condition_met: '🔍 Condition Met',
        processing:    '🔄 Processing',
        paid:          '💳 Paid',
        complete:      '🧾 Complete',
      }
      const glIcon: Record<string, string> = {
        asset:   '🏦',
        expense: '💸',
      }
      const icon  = glIcon[glType ?? ''] ?? '💳'
      const label = (glType === 'asset' && categoryName) ? categoryName : (glName ?? number ?? '(no number)')

      // Net payable = gross − WHT + exclusive VAT (mirrors NetPayableSummary formula)
      // Falls back to gross, then total obligation if execution fields not filled yet.
      const gross  = paidAmount ?? amount
      const net    = gross != null
        ? gross - (whtAmount ?? 0) + (vatType === 'exclusive' ? (vatAmount ?? 0) : 0)
        : null
      const amountStr = net != null ? `${Number(net).toLocaleString()} THB` : ''

      const displayVendor = vendor ?? vendorName ?? null
      return {
        title:    `${icon} ${label}${displayVendor ? ` — ${displayVendor}` : ''}`,
        subtitle: [statusLabel[status ?? ''] ?? '', amountStr, number].filter(Boolean).join('  ·  '),
      }
    },
  },
})
