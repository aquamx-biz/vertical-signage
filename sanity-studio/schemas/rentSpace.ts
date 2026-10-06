import { defineField, defineType } from 'sanity'
import { ProcessSetupDescriptionBanner } from '../components/ProcessSetupDescriptionBanner'
import { ContractLockedBanner }          from '../components/ApprovalLockedBanner'
import { createTranslateInput }              from '../components/TranslateInput'
import { createAutoNumberInput }             from '../components/AutoNumberInput'
import { NumericFormatInput }                from '../components/NumericFormatInput'
import { DynamicFieldsInput }               from '../components/DynamicFieldsInput'
import { RetrieveFromProjectSiteInput }     from '../components/RetrieveFromProjectSiteInput'
import { ExistingContractsWarning }         from '../components/ExistingContractsWarning'
import { SignedStatusInput }               from '../components/SignedStatusInput'
import { BillingPeriodsInput }             from '../components/BillingPeriodsInput'
import { PeriodBillingCalcInput }          from '../components/PeriodBillingCalcInput'
import { PeriodStatusInput }               from '../components/PeriodStatusInput'
import { PeriodPaymentButton }             from '../components/PeriodPaymentButton'
import { TerminationStatusInput, TERMINATION_REASONS } from '../components/TerminationStatusInput'

/**
 * Contract / Quotation document.
 * Links to a Project Site and holds all rental terms.
 * The "Generated Documents" group is written back by the backend after generation.
 */
/** Termination fields stay hidden until the "บอกเลิกสัญญา" button has been used. */
const TERMINATION_IDLE = (document?: Record<string, any>) =>
  !document?.terminationStatus || document.terminationStatus === 'none'

/** Withdrawal fields only apply once a served notice has been withdrawn. */
const NOT_WITHDRAWN = (document?: Record<string, any>) =>
  document?.terminationStatus !== 'withdrawn'

export default defineType({
  name: 'contract',
  title: 'Rent Space',
  type: 'document',

  orderings: [
    {
      title: 'Quotation No. (newest first)',
      name:  'quotationNumberDesc',
      by: [{ field: 'quotationNumber', direction: 'desc' }],
    },
    {
      title: 'Quotation No. (oldest first)',
      name:  'quotationNumberAsc',
      by: [{ field: 'quotationNumber', direction: 'asc' }],
    },
    {
      title: 'Last Updated',
      name:  'updatedAtDesc',
      by: [{ field: '_updatedAt', direction: 'desc' }],
    },
  ],

  groups: [
    { name: 'customer',  title: 'Party'               },
    { name: 'rental',    title: 'Rental Details'      },
    { name: 'billing',   title: 'Billing Periods'     },
    { name: 'approval',  title: 'Approval'            },
    { name: 'addenda',   title: 'Addenda'             },
    { name: 'signed',    title: 'Signed Documents'    },
    { name: 'generated', title: 'Generated Documents' },
    { name: 'termination', title: 'Termination' },
    { name: 'correspondence', title: 'Correspondence' },
  ],

  fields: [
    // ── Contract approval locked banner ──────────────────────────────────────
    defineField({
      name:       'approvalLockedBanner',
      title:      'Approval Lock',
      type:       'string',
      readOnly:   true,
      components: { input: ContractLockedBanner },
    }),

    // ── Process Setup description banner (top of form) ────────────────────────
    defineField({
      name:       'setupDescriptionBanner',
      title:      'Process Setup Guide',
      type:       'string',
      hidden:     ({ document }) => !(document?.contractType as any)?._ref,
      components: { input: ProcessSetupDescriptionBanner },
    }),

    // ── Project reference ─────────────────────────────────────────────────────
    defineField({
      name:     'projectSite',
      title:    '1. Project Site',
      type:     'reference',
      to:       [{ type: 'projectSite' }],
      readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved',
      options: {
        filter: 'approvalStatus == "approved"',
      },
      validation:  Rule => Rule.required(),
      description: 'Only approved Project Sites are shown. Can\'t find yours? Create it in Project Sites first.',
    }),

    // ── Existing contracts warning (informational only) ───────────────────────
    defineField({
      name:       'existingContractsWarning',
      title:      'Existing Contracts',
      type:       'string',
      readOnly:   true,
      hidden:     ({ document }) => !document?.projectSite,
      components: { input: ExistingContractsWarning },
    }),

    // ── Contract type ─────────────────────────────────────────────────────────
    defineField({
      name:        'contractType',
      title:       '2. Contract Type',
      type:        'reference',
      to:          [{ type: 'contractType' }],
      readOnly:    ({ document }) => (document?.contractApprovalStatus as string) === 'approved',
      description: 'e.g. Rental Contract, Service Contract, Ad Contract — configure in Contract Types.',
      validation:  Rule => Rule.required(),
    }),

    // ── Party (counterparty to this contract) ────────────────────────────────
    defineField({
      group:       'customer',
      name:        'party',
      title:       '3. Party',
      type:        'reference',
      to:          [{ type: 'party' }],
      readOnly:    ({ document }) => (document?.contractApprovalStatus as string) === 'approved',
      description: 'The counterparty to this contract. Create the party first under CRM → Parties.',
      validation:  Rule => Rule.custom((val, ctx: any) => {
        if (val) return true
        // Legacy contracts (pre-Party) still carry customerName — warn only, so they stay editable
        if (ctx.document?.customerName) {
          return { message: 'Please link a Party record. Without it, {{customer_name}} will be blank in generated documents.', level: 'warning' }
        }
        // New contracts: the counterparty (juristic person) is required
        return 'Party is required — link the juristic person (create it under CRM → Parties first).'
      }),
    }),
    // Legacy fallback — kept hidden so old contracts still generate correctly.
    // Once all contracts have a Party linked, this field can be removed.
    defineField({ group: 'customer', name: 'customerName', title: 'Customer Name (legacy)', type: 'string', hidden: true }),

    // ── Rental details ────────────────────────────────────────────────────────
    // ── Document numbers (always needed) ──────────────────────────────────────
    defineField({ group: 'rental', name: 'quotationNumber', title: '4. Quotation Number', type: 'string', readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved', validation: Rule => Rule.required(), components: { input: createAutoNumberInput('quotation') } }),
    defineField({ group: 'rental', name: 'quotationDate',   title: '5. Quotation Date',   type: 'date',   readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved' }),
    defineField({ group: 'rental', name: 'contractNumber',  title: '6. Contract Number',  type: 'string', readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved', components: { input: createAutoNumberInput('contract') } }),
    defineField({ group: 'rental', name: 'contractDate',    title: '7. Contract Date',    type: 'date',   readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved' }),
    // The number the counterparty holds. Contracts signed before this system existed
    // were numbered by hand (e.g. CONJ-2025-7-002); the import gave them a REJ number,
    // so outgoing letters must quote THIS field when it is filled, not contractNumber.
    defineField({
      group:       'rental',
      name:        'signedContractNumber',
      title:       '7b. Contract No. on the Signed Original',
      type:        'string',
      description: 'Only when the signed paper carries a different number from the system number above. Letters to the lessor must reference this number.',
    }),

    // ── Dynamic fields (driven by Contract Type) ──────────────────────────────
    defineField({
      group:       'rental',
      name:        'dynamicFields',
      title:       '8. Contract Fields',
      type:        'string',
      readOnly:    ({ document }) => (document?.contractApprovalStatus as string) === 'approved',
      description: 'Fields defined by the selected Contract Type.',
      components:  { input: DynamicFieldsInput },
    }),

    // ── Billing periods (recurring rent + electricity per month) ──────────────
    // Reconstructed from BillingPeriodsInput / PeriodPaymentButton / PeriodStatusInput
    // / PeriodBillingCalcInput components. Documents in the dataset already carry
    // this array — the schema definition was missing, which surfaced as "Unknown field".
    defineField({
      group:       'billing',
      name:        'billingPeriods',
      title:       '9. Billing Periods',
      type:        'array',
      description: 'Monthly billing rows for the rental. Use "Generate All Billing Periods" to populate the full contract duration in one click, then record rent payments per row as they come due.',
      components:  { input: BillingPeriodsInput },
      of: [{
        type: 'object',
        name: 'billingPeriod',
        fields: [
          defineField({
            name:     'periodNumber',
            title:    'Period #',
            type:     'number',
            readOnly: true,
          }),
          defineField({
            name:       'periodStart',
            title:      'Period Start',
            type:       'date',
            validation: Rule => Rule.required(),
          }),
          defineField({
            name:       'periodEnd',
            title:      'Period End',
            type:       'date',
            validation: Rule => Rule.required(),
          }),
          defineField({
            name:        'rentalAmount',
            title:       'Rental Amount (THB)',
            type:        'number',
            validation:  Rule => Rule.required().min(0),
            description: 'Monthly rent for this period.',
          }),
          defineField({
            name:        'electricityRate',
            title:       'Electricity Rate (THB / unit)',
            type:        'number',
            description: 'Optional. Leave blank if electricity is not metered for this period.',
          }),
          defineField({
            name:        'meterStart',
            title:       'Meter Reading — Start',
            type:        'number',
            description: 'Optional. Enter at the beginning of the period.',
          }),
          defineField({
            name:        'meterEnd',
            title:       'Meter Reading — End',
            type:        'number',
            description: 'Optional. Enter at the end of the period to calculate electricity charge.',
          }),
          defineField({
            name:       'billingCalc',
            title:      'Billing Total',
            type:       'string',
            readOnly:   true,
            description: 'Auto-calculated from rental + (meter end − meter start) × electricity rate. Read-only.',
            components: { input: PeriodBillingCalcInput },
          }),
          defineField({
            name:       'accrualStatus',
            title:      'Status',
            type:       'string',
            readOnly:   true,
            description: 'Auto-derived from period dates + linked Payment status. Not user-editable.',
            options: { list: [
              { title: '🕐 Upcoming', value: 'upcoming' },
              { title: '🔴 Due',      value: 'due'      },
              { title: '🚨 Overdue',  value: 'overdue'  },
              { title: '📤 Invoiced', value: 'invoiced' },
              { title: '✅ Paid',     value: 'paid'     },
            ]},
            components: { input: PeriodStatusInput },
          }),
          defineField({
            name:        'linkedPayment',
            title:       'Linked Payment',
            type:        'reference',
            to:          [{ type: 'payment' }],
            readOnly:    true,
            description: 'Auto-linked when "Record Rent Payment" is clicked. Click "Open Payment" in the status card to view.',
          }),
          defineField({
            name:        'createPayment',
            title:       'Record Payment',
            type:        'string',
            description: 'Click to create a Payment document for this period and link it back here.',
            components:  { input: PeriodPaymentButton },
          }),
        ],
        preview: {
          select: {
            periodNumber:    'periodNumber',
            periodStart:     'periodStart',
            periodEnd:       'periodEnd',
            rentalAmount:    'rentalAmount',
            electricityRate: 'electricityRate',
            meterStart:      'meterStart',
            meterEnd:        'meterEnd',
            accrualStatus:   'accrualStatus',
          },
          prepare({ periodNumber, periodStart, periodEnd, rentalAmount, electricityRate, meterStart, meterEnd, accrualStatus }) {
            const icon: Record<string, string> = {
              upcoming: '🕐', due: '🔴', overdue: '🚨', invoiced: '📤', paid: '✅',
            }
            const fmtD = (s?: string) => s
              ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
              : '—'
            const units    = (meterStart != null && meterEnd != null) ? Math.max(0, Number(meterEnd) - Number(meterStart)) : 0
            const elecCost = units * Number(electricityRate ?? 0)
            const total    = Number(rentalAmount ?? 0) + elecCost
            const amount   = rentalAmount != null
              ? `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '—'
            return {
              title:    `${icon[accrualStatus ?? 'upcoming'] ?? '🕐'} Period ${periodNumber ?? '?'}  ·  ${fmtD(periodStart)} → ${fmtD(periodEnd)}`,
              subtitle: amount,
            }
          },
        },
      }],
    }),

    // ── Addenda (เอกสารแนบท้าย / บันทึกแก้ไขเพิ่มเติม) ───────────────────────────
    // สัญญาหลักใช้ template มาตรฐานเดียวกันทุกราย — ข้อที่คู่สัญญาขอแก้บันทึกที่นี่
    // "มีการเปลี่ยนเงื่อนไขหรือไม่" ดูจาก count(addenda) > 0 (ไม่มี boolean แยก)
    defineField({
      group:       'addenda',
      name:        'addenda',
      title:       '10. Addenda (เอกสารแนบท้าย)',
      type:        'array',
      description: 'บันทึกเฉพาะข้อที่แก้จากสัญญามาตรฐาน — 1 รายการต่อเอกสารแนบท้าย 1 ฉบับ (A1, A2, …) · Publish แล้วกดสร้างที่การ์ดสัญญาในแท็บ Generate — เอกสารแนบท้ายทุกฉบับรวมอยู่ใน PDF สัญญาไฟล์เดียว',
      of: [{
        type: 'object',
        name: 'addendum',
        fields: [
          defineField({
            name:        'addendumNo',
            title:       'Addendum No.',
            type:        'string',
            description: 'เช่น A1, A2 — เลขเต็มในเอกสาร = เลขสัญญา-A1',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:    'timing',
            title:   'Timing',
            type:    'string',
            options: { list: [
              { title: 'ก่อนเซ็น — เอกสารแนบท้ายสัญญา',      value: 'before_signing' },
              { title: 'หลังเซ็น — บันทึกข้อตกลงแก้ไขเพิ่มเติม', value: 'after_signing'  },
            ], layout: 'radio' },
            initialValue: 'before_signing',
            validation:   Rule => Rule.required(),
          }),
          defineField({
            name:  'requestSummary',
            title: 'Request Summary',
            type:  'text',
            rows:  2,
            description: 'สรุปสั้น ๆ ว่าใครขออะไร / ตกลงกันอย่างไร',
          }),
          defineField({
            name:       'changes',
            title:      'Changes (ข้อความเดิม → แก้ไขเป็น)',
            type:       'array',
            validation: Rule => Rule.required().min(1),
            of: [{
              type: 'object',
              name: 'clauseChange',
              fields: [
                defineField({ name: 'clauseRef',    title: 'Clause No.',        type: 'string', description: 'เช่น 4.2, 11', validation: Rule => Rule.required() }),
                defineField({ name: 'originalText', title: 'ข้อความเดิม',       type: 'text', rows: 3, validation: Rule => Rule.required() }),
                defineField({ name: 'newText',      title: 'ให้แก้ไขเป็น',       type: 'text', rows: 4, validation: Rule => Rule.required() }),
                defineField({ name: 'originalTextEn', title: 'Original text (EN)', type: 'text', rows: 3, description: 'ข้อความเดิมจากสัญญาฉบับภาษาอังกฤษ', validation: Rule => Rule.required() }),
                defineField({
                  name: 'newTextEn', title: 'Amended text (EN)', type: 'text', rows: 4,
                  description: 'แปลอัตโนมัติได้ แต่ต้องตรวจก่อนใช้ — ถ้าขัดกัน ฉบับภาษาไทยเป็นหลัก (ข้อ 12.1)',
                  validation: Rule => Rule.required(),
                  components: { input: createTranslateInput({ sourceField: 'newText', sibling: true, sourceLang: 'Thai', targetLang: 'English', buttonLabel: '✨ Translate from Thai' }) },
                }),
              ],
              preview: {
                select: { clauseRef: 'clauseRef', newText: 'newText' },
                prepare: ({ clauseRef, newText }) => ({ title: `ข้อ ${clauseRef ?? '?'}`, subtitle: newText }),
              },
            }],
          }),
          defineField({
            name:    'status',
            title:   'Status',
            type:    'string',
            options: { list: [
              { title: '📝 Draft',            value: 'draft'    },
              { title: '📤 Sent to party',    value: 'sent'     },
              { title: '🤝 Agreed',           value: 'agreed'   },
              { title: '✍️ Signed',           value: 'signed'   },
              { title: '✗ Cancelled',         value: 'cancelled' },
            ]},
            initialValue: 'draft',
            validation:   Rule => Rule.required(),
          }),
          defineField({ name: 'signedDate', title: 'Signed Date', type: 'date', hidden: ({ parent }) => (parent as any)?.status !== 'signed' }),
          defineField({
            name:    'signedFile',
            title:   'Signed Addendum (PDF / photo)',
            type:    'file',
            options: { accept: '.pdf,image/*' },
            hidden:  ({ parent }) => (parent as any)?.status !== 'signed',
          }),
          // ── Generated document (written by backend) — generate from the Generate tab ──
          defineField({ name: 'googleDocUrl', title: 'Addendum — Google Doc URL', type: 'url',      readOnly: true }),
          defineField({ name: 'pdfAsset',     title: 'Addendum — PDF File',       type: 'file',     readOnly: true }),
          defineField({ name: 'generatedAt',  title: 'Addendum — Generated At',   type: 'datetime', readOnly: true }),
        ],
        preview: {
          select: { addendumNo: 'addendumNo', status: 'status', timing: 'timing', c0: 'changes.0.clauseRef', c1: 'changes.1.clauseRef', c2: 'changes.2.clauseRef' },
          prepare({ addendumNo, status, timing, c0, c1, c2 }) {
            const icon: Record<string, string> = { draft: '📝', sent: '📤', agreed: '🤝', signed: '✍️', cancelled: '✗' }
            const clauses = [c0, c1, c2].filter(Boolean).map(c => `ข้อ ${c}`).join(', ')
            return {
              title:    `${icon[status ?? 'draft'] ?? '📝'} ${addendumNo ?? 'Addendum'} · ${timing === 'after_signing' ? 'หลังเซ็น' : 'ก่อนเซ็น'}`,
              subtitle: clauses ? `แก้ ${clauses}` : 'ยังไม่มีรายการแก้ไข',
            }
          },
        },
      }],
    }),

    // ── Legacy fields — hidden, kept for backward compatibility ───────────────
    // Existing contracts still have values here; generation reads them as fallback.
    defineField({ name: 'addressTh',    title: 'Address (TH)',   type: 'text',   hidden: true }),
    defineField({ name: 'addressEn', title: 'Address (EN)', type: 'text', hidden: true }),
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
    defineField({ group: 'approval', name: 'notificationEmail', title: '11. Notification Email', type: 'string', readOnly: true, description: 'Set via the Approval tab. The staff email that receives the approved document.' }),
    defineField({ group: 'approval', name: 'quotationApprovalStatus', title: '12. Quotation Approval', type: 'string', readOnly: true,
      options: { list: [
        { title: '—  Not Requested', value: 'not_requested' },
        { title: '⏳ Pending',        value: 'pending'       },
        { title: '✓  Approved',      value: 'approved'      },
        { title: '✗  Rejected',      value: 'rejected'      },
        { title: '⚠  Reset',         value: 'reset'         },
      ]},
    }),
    defineField({ group: 'approval', name: 'quotationApprovedAt',    title: '13. Quotation Approved At', type: 'datetime', readOnly: true }),
    defineField({ group: 'approval', name: 'contractApprovalStatus', title: '14. Contract Approval',     type: 'string',   readOnly: true,
      options: { list: [
        { title: '—  Not Requested', value: 'not_requested' },
        { title: '⏳ Pending',        value: 'pending'       },
        { title: '✓  Approved',      value: 'approved'      },
        { title: '✗  Rejected',      value: 'rejected'      },
        { title: '⚠  Reset',         value: 'reset'         },
      ]},
    }),
    defineField({ group: 'approval', name: 'contractApprovedAt',  title: '15. Contract Approved At', type: 'datetime', readOnly: true }),
    defineField({ group: 'approval', name: 'approvalResetReason', title: '16. Reset Reason',         type: 'string',   readOnly: true }),
    // Hidden — snapshots of key fields at approval time for reset-on-edit detection
    defineField({ name: 'lastQuotationSnapshot', title: 'Quotation Snapshot', type: 'string', hidden: true, readOnly: true }),
    defineField({ name: 'lastContractSnapshot',  title: 'Contract Snapshot',  type: 'string', hidden: true, readOnly: true }),

    // ── Signed documents ──────────────────────────────────────────────────────
    defineField({
      group:       'signed',
      name:        'signedDocuments',
      title:       '17. Signed Contract Documents',
      description: 'Upload the physically signed contract pages (PDF or photos) before marking as signed.',
      type:        'array',
      of:          [{ type: 'file', options: { accept: '.pdf,image/*' } }],
    }),
    defineField({ group: 'signed', name: 'signedNote', title: '18. Signing Note', type: 'string', description: 'Optional remark about signing (e.g. signed at office, courier, etc.)' }),
    defineField({
      group:       'signed',
      name:        'quotationSignedDocuments',
      title:       '18.1 Signed Quotation (accepted by the juristic person)',
      description: 'The quotation signed & stamped by the juristic person — uploaded by the leasing agent from LINE (Upload Document → Signed quotation). Does not change any status.',
      type:        'array',
      of:          [{ type: 'file', options: { accept: '.pdf,image/*' } }],
    }),
    // Signed status + inline "Mark as Signed" button
    defineField({
      group:      'signed',
      name:       'signedStatus',
      title:      '19. Signed Status',
      type:       'string',
      readOnly:   true,
      components: { input: SignedStatusInput },
    }),
    defineField({ group: 'signed', name: 'signedAt', title: '20. Signed At', type: 'datetime', readOnly: true }),
    defineField({ group: 'signed', name: 'signedBy', title: 'Signed By',     type: 'string',   readOnly: true, hidden: true }),

    // ── Generation metadata (written by backend — read-only in Studio) ────────
    // generationStatus and generatedDocType are hidden — used internally by preview and GenerateView
    defineField({ name: 'generationStatus', title: 'Generation Status', type: 'string', hidden: true, readOnly: true }),
    defineField({ name: 'generatedDocType', title: 'Generated Doc Type', type: 'string', hidden: true, readOnly: true }),
    // Combined status + error visible in the Generated Documents tab
    defineField({ group: 'generated', name: 'lastGenerationResult', title: '21. Last Generation', type: 'string', readOnly: true }),

    // ── Rental Agreement ──────────────────────────────────────────────────────
    defineField({ group: 'generated', name: 'contractGoogleDocUrl', title: '22. Agreement — Google Doc URL', type: 'url',      readOnly: true }),
    defineField({ group: 'generated', name: 'contractPdfAsset',     title: '23. Agreement — PDF File',       type: 'file',     readOnly: true }),
    defineField({ group: 'generated', name: 'contractGeneratedAt',  title: '24. Agreement — Generated At',   type: 'datetime', readOnly: true }),

    // ── Quotation ─────────────────────────────────────────────────────────────
    defineField({ group: 'generated', name: 'quotationGoogleDocUrl', title: '25. Quotation — Google Doc URL', type: 'url',      readOnly: true }),
    defineField({ group: 'generated', name: 'quotationPdfAsset',     title: '26. Quotation — PDF File',       type: 'file',     readOnly: true }),
    defineField({ group: 'generated', name: 'quotationGeneratedAt',  title: '27. Quotation — Generated At',   type: 'datetime', readOnly: true }),

    // ── Termination (การยกเลิกสัญญาเช่า) ──────────────────────────────────────
    // Everything here is written by the buttons in TerminationStatusInput, so the
    // fields are read-only records of those actions. The notice period required by
    // clause 11.1 is stored per contract (terminationNoticeDays) because older signed
    // leases require 90 days where the current template requires 30.
    defineField({
      group:      'termination',
      name:       'terminationStatus',
      title:      '28. Termination',
      type:       'string',
      readOnly:   true,
      components: { input: TerminationStatusInput },
      options: { list: [
        { title: '— ยังไม่ยกเลิก (Active)',              value: 'none'         },
        { title: '📤 แจ้งบอกเลิกแล้ว (Notice given)',     value: 'notice_given' },
        { title: '🤝 ถอนการบอกเลิกแล้ว (Withdrawn)',     value: 'withdrawn'    },
        { title: '🔴 สิ้นสุดแล้ว (Terminated)',            value: 'terminated'   },
      ]},
    }),
    defineField({
      group:        'termination',
      name:         'terminationNoticeDays',
      title:        '29. Notice Period (days)',
      type:         'number',
      initialValue: 30,
      description:  'From clause 11.1 of THIS contract. Leases signed before Sep 2026 require 90 days — check the signed original before giving notice.',
      validation:   Rule => Rule.min(0).max(365),
    }),
    defineField({
      group:    'termination',
      name:     'terminationReasonCode',
      title:    '30. Reason',
      type:     'string',
      readOnly: true,
      hidden:   ({ document }) => TERMINATION_IDLE(document),
      options:  { list: TERMINATION_REASONS.map(r => ({ title: r.th, value: r.value })) },
    }),
    defineField({
      group:       'termination',
      name:        'terminationReason',
      title:       '31. Details / Evidence',
      type:        'text',
      rows:        3,
      readOnly:    true,
      description: 'รายละเอียด/หลักฐานประกอบเหตุผล — ข้อความนี้ถูกใส่ในหนังสือ',
      hidden:      ({ document }) => TERMINATION_IDLE(document),
    }),
    defineField({
      group:       'termination',
      name:        'terminatedBy',
      title:       '32. Terminated By',
      type:        'string',
      readOnly:    true,
      description: 'ระบบกำหนดจากเหตุผลที่เลือก — เป็นตัวกำหนดว่าหนังสือที่ออกเป็น "บอกเลิก" หรือ "รับทราบการบอกเลิก"',
      hidden:      ({ document }) => TERMINATION_IDLE(document),
      options: { list: [
        { title: 'ผู้เช่า (เรา)',   value: 'us'       },
        { title: 'ผู้ให้เช่า',      value: 'landlord' },
        { title: 'ตกลงร่วมกัน',    value: 'mutual'   },
        { title: 'ครบกำหนดสัญญา', value: 'expired'  },
      ]},
    }),
    defineField({
      group:    'termination',
      name:     'noticeGivenAt',
      title:    '33. Notice Given On',
      type:     'date',
      readOnly: true,
      hidden:   ({ document }) => TERMINATION_IDLE(document),
    }),
    defineField({
      group:       'termination',
      name:        'terminationEffectiveDate',
      title:       '34. Effective Date',
      type:        'date',
      readOnly:    true,
      description: 'วันหยุดคิดค่าเช่า และวันอ่านมิเตอร์ครั้งสุดท้าย',
      hidden:      ({ document }) => TERMINATION_IDLE(document),
    }),
    defineField({
      group:       'termination',
      name:        'terminationNoticeRequired',
      title:       '35. Issue Our Own Letter',
      type:        'boolean',
      readOnly:    true,
      description: 'ปิดได้เมื่ออีกฝ่ายออกหนังสือมาแล้วและเราแค่เก็บหลักฐาน — ถ้าปิด ต้องอัปโหลดหนังสือของเค้าในช่องถัดไป',
      hidden:      ({ document }) => TERMINATION_IDLE(document),
    }),
    defineField({
      group:       'termination',
      name:        'terminationDocuments',
      title:       '36. Evidence & Signed Documents',
      type:        'array',
      of:          [{ type: 'file', options: { accept: '.pdf,image/*' } }],
      description: 'หนังสือบอกเลิกของอีกฝ่าย · หลักฐานประกอบเหตุผล · หนังสือที่ลงนามแล้ว · หนังสือตอบรับ',
      hidden:      ({ document }) => TERMINATION_IDLE(document),
    }),

    // ── Termination notice generation + approval ─────────────────────────────
    defineField({
      group:       'termination',
      name:        'terminationNumber',
      title:       '37. Notice Number',
      type:        'string',
      description: 'ระบบออกให้อัตโนมัติเมื่อกดยืนยันการบอกเลิก (TRM-yyyy-mm-001) — ปุ่ม Generate Number ไว้ออกใหม่หรือแก้เอง',
      components:  { input: createAutoNumberInput('termination') },
      hidden:      ({ document }) => TERMINATION_IDLE(document),
    }),
    defineField({
      group:       'termination',
      name:        'terminationDate',
      title:       '38. Notice Date',
      type:        'date',
      description: 'วันที่ที่ลงในหนังสือ (ตั้งต้นเท่ากับวันที่แจ้ง แก้ได้)',
      hidden:      ({ document }) => TERMINATION_IDLE(document),
    }),
    defineField({
      group:    'termination',
      name:     'terminationApprovalStatus',
      title:    '39. Termination Approval',
      type:     'string',
      readOnly: true,
      hidden:   ({ document }) => TERMINATION_IDLE(document),
      options: { list: [
        { title: '— Not requested', value: 'not_requested' },
        { title: '⏳ Pending',       value: 'pending'       },
        { title: '✓ Approved',      value: 'approved'      },
        { title: '✗ Rejected',      value: 'rejected'      },
        { title: '⚠ Reset',         value: 'reset'         },
      ]},
    }),
    defineField({ group: 'termination', name: 'terminationApprovedAt',  title: '40. Termination Approved At', type: 'datetime', readOnly: true, hidden: ({ document }) => TERMINATION_IDLE(document) }),
    defineField({ group: 'termination', name: 'terminationGoogleDocUrl', title: '41. Notice — Google Doc URL', type: 'url',      readOnly: true }),
    defineField({ group: 'termination', name: 'terminationPdfAsset',     title: '42. Notice — PDF File',       type: 'file',     readOnly: true }),
    defineField({ group: 'termination', name: 'terminationGeneratedAt',  title: '43. Notice — Generated At',   type: 'datetime', readOnly: true }),

    // ── Withdrawal of a served notice (ถอนการบอกเลิก) ─────────────────────────
    defineField({ group: 'termination', name: 'withdrawnAt',      title: '44. Withdrawn On',        type: 'date', readOnly: true, hidden: ({ document }) => NOT_WITHDRAWN(document) }),
    defineField({
      group:       'termination',
      name:        'withdrawalReason',
      title:       '45. Negotiation Outcome',
      type:        'text',
      rows:        3,
      readOnly:    true,
      description: 'เงื่อนไขใหม่ที่ตกลงกันจนไม่ต้องยกเลิก — ข้อความนี้ถูกใส่ในหนังสือถอนการบอกเลิก',
      hidden:      ({ document }) => NOT_WITHDRAWN(document),
    }),
    defineField({
      group:       'termination',
      name:        'withdrawalAddendumNo',
      title:       '46. Addendum No.',
      type:        'string',
      readOnly:    true,
      description: 'เลขเอกสารแนบท้ายที่แก้เงื่อนไข (เช่น A2) — สร้างในแท็บ Addenda',
      hidden:      ({ document }) => NOT_WITHDRAWN(document),
    }),
    defineField({
      group:       'termination',
      name:        'withdrawalNumber',
      title:       '47. Withdrawal Number',
      type:        'string',
      description: 'ระบบออกให้อัตโนมัติเมื่อกดยืนยันการถอนการบอกเลิก (WDR-yyyy-mm-001) — ปุ่ม Generate Number ไว้ออกใหม่หรือแก้เอง',
      components:  { input: createAutoNumberInput('withdrawal') },
      hidden:      ({ document }) => NOT_WITHDRAWN(document),
    }),
    defineField({ group: 'termination', name: 'withdrawalDate', title: '48. Withdrawal Date', type: 'date', hidden: ({ document }) => NOT_WITHDRAWN(document) }),
    defineField({
      group:    'termination',
      name:     'withdrawalApprovalStatus',
      title:    '49. Withdrawal Approval',
      type:     'string',
      readOnly: true,
      hidden:   ({ document }) => NOT_WITHDRAWN(document),
      options: { list: [
        { title: '— Not requested', value: 'not_requested' },
        { title: '⏳ Pending',       value: 'pending'       },
        { title: '✓ Approved',      value: 'approved'      },
        { title: '✗ Rejected',      value: 'rejected'      },
        { title: '⚠ Reset',         value: 'reset'         },
      ]},
    }),
    defineField({ group: 'termination', name: 'withdrawalApprovedAt',   title: '50. Withdrawal Approved At',      type: 'datetime', readOnly: true, hidden: ({ document }) => NOT_WITHDRAWN(document) }),
    defineField({ group: 'termination', name: 'withdrawalGoogleDocUrl', title: '51. Withdrawal — Google Doc URL', type: 'url',      readOnly: true, hidden: ({ document }) => NOT_WITHDRAWN(document) }),
    defineField({ group: 'termination', name: 'withdrawalPdfAsset',     title: '52. Withdrawal — PDF File',       type: 'file',     readOnly: true, hidden: ({ document }) => NOT_WITHDRAWN(document) }),
    defineField({ group: 'termination', name: 'withdrawalGeneratedAt',  title: '53. Withdrawal — Generated At',   type: 'datetime', readOnly: true, hidden: ({ document }) => NOT_WITHDRAWN(document) }),

    // ── Correspondence (การส่งเอกสารถึงคู่สัญญา) ──────────────────────────────
    // Everything we send out of the system lands here, so the paper trail lives with
    // the contract instead of in someone's mailbox. Email entries are written by
    // /api/send-document; postal or hand-delivered ones are added here by hand.
    defineField({
      group:       'correspondence',
      name:        'counterpartyEmails',
      title:       '54. Counterparty Emails',
      type:        'array',
      of:          [{ type: 'string' }],
      description: 'อีเมลฝั่งผู้ให้เช่า / ตัวแทน ที่ใช้ตั้งต้นเวลากดส่งเอกสาร (แก้ได้ตอนส่งแต่ละครั้ง)',
      validation:  Rule => Rule.unique(),
    }),
    defineField({
      group:       'correspondence',
      name:        'correspondence',
      title:       '55. Correspondence Log',
      type:        'array',
      description: 'ประวัติการส่งเอกสารถึงคู่สัญญา — อีเมลที่ส่งจากระบบบันทึกเองอัตโนมัติ · เพิ่มรายการส่งไปรษณีย์ลงทะเบียน/ส่งมือเองได้',
      of: [{
        type: 'object',
        name: 'correspondenceEntry',
        fields: [
          defineField({ name: 'sentAt', title: 'Sent At', type: 'datetime', validation: Rule => Rule.required() }),
          defineField({
            name:         'channel',
            title:        'Channel',
            type:         'string',
            initialValue: 'registered_post',
            options: { list: [
              { title: '✉️ อีเมล (ระบบส่ง)',          value: 'email'           },
              { title: '📮 ไปรษณีย์ลงทะเบียนตอบรับ', value: 'registered_post' },
              { title: '🤝 ส่งมือ / วางบิล',          value: 'hand'            },
              { title: '📎 อื่น ๆ',                   value: 'other'           },
            ]},
          }),
          defineField({
            name:    'docType',
            title:   'Document',
            type:    'string',
            options: { list: [
              { title: 'ใบเสนอราคา (Quotation)',        value: 'quotation'   },
              { title: 'สัญญาเช่า (Contract)',           value: 'contract'    },
              { title: 'เอกสารแนบท้าย (Addendum)',      value: 'addendum'    },
              { title: 'หนังสือบอกเลิก (Termination)',   value: 'termination' },
              { title: 'หนังสือถอนการบอกเลิก',           value: 'withdrawal'  },
              { title: 'อื่น ๆ',                         value: 'other'       },
            ]},
          }),
          defineField({
            name:    'lang',
            title:   'Language',
            type:    'string',
            options: { list: [
              { title: 'Thai only',      value: 'th'    },
              { title: 'Thai + English', value: 'th_en' },
            ]},
          }),
          defineField({ name: 'docNumber',      title: 'Document No.',     type: 'string' }),
          defineField({ name: 'to',             title: 'To',               type: 'array', of: [{ type: 'string' }] }),
          defineField({ name: 'cc',             title: 'CC',               type: 'array', of: [{ type: 'string' }] }),
          defineField({ name: 'subject',        title: 'Subject',          type: 'string' }),
          defineField({ name: 'message',        title: 'Message',          type: 'text', rows: 4 }),
          defineField({ name: 'attachment',     title: 'Attachment',       type: 'string', readOnly: true, description: 'ชื่อไฟล์ PDF ที่แนบไปกับอีเมล' }),
          defineField({ name: 'messageId',      title: 'Resend Message ID', type: 'string', readOnly: true }),
          defineField({ name: 'trackingNumber', title: 'Tracking No. (EMS)', type: 'string', description: 'สำหรับไปรษณีย์ลงทะเบียน — เก็บไว้อ้างอิงกรณีพิพาท' }),
          defineField({ name: 'ackFile',        title: 'Acknowledgement / Proof', type: 'file', options: { accept: '.pdf,image/*' }, description: 'ใบตอบรับไปรษณีย์ หรือหลักฐานการรับเอกสาร' }),
          defineField({ name: 'note',           title: 'Note', type: 'string' }),
        ],
        preview: {
          select: { sentAt: 'sentAt', channel: 'channel', docType: 'docType', docNumber: 'docNumber', to: 'to' },
          prepare({ sentAt, channel, docType, docNumber, to }: any) {
            const icon: Record<string, string> = { email: '✉️', registered_post: '📮', hand: '🤝', other: '📎' }
            const date = sentAt ? new Date(sentAt).toLocaleDateString('en-GB') : '—'
            return {
              title:    `${icon[channel] ?? '📎'}  ${date}  ·  ${docNumber ?? docType ?? 'เอกสาร'}`,
              subtitle: Array.isArray(to) && to.length ? `ถึง ${to.join(', ')}` : '—',
            }
          },
        },
      }],
    }),

    // Hidden — snapshots taken when the termination / withdrawal was approved
    defineField({ name: 'lastTerminationSnapshot', title: 'Termination Snapshot', type: 'string', hidden: true, readOnly: true }),
    defineField({ name: 'lastWithdrawalSnapshot',  title: 'Withdrawal Snapshot',  type: 'string', hidden: true, readOnly: true }),
  ],

  preview: {
    select: {
      contractNumber:         'contractNumber',
      quotationNumber:        'quotationNumber',
      partyLegalEn:           'party.legalName_en',
      partyLegalTh:           'party.legalName_th',
      partyFirst:             'party.firstName',
      customerName:           'customerName',
      projectEn:              'projectSite.projectEn',
      contractApprovalStatus: 'contractApprovalStatus',
      signedStatus:           'signedStatus',
      addendum0:              'addenda.0.addendumNo',
      terminationStatus:      'terminationStatus',
    },
    prepare({ contractNumber, quotationNumber, partyLegalEn, partyLegalTh, partyFirst, customerName, projectEn, contractApprovalStatus, signedStatus, addendum0, terminationStatus }) {
      const partyName   = partyLegalEn ?? partyLegalTh ?? partyFirst ?? customerName
      const projectName = projectEn ?? partyName ?? '—'
      const stage       = contractNumber ? 'Contract' : quotationNumber ? 'Quotation' : 'New'
      const docNumber   = contractNumber ?? quotationNumber
      const title       = docNumber ? `${stage} · ${projectName} · ${docNumber}` : `${stage} · ${projectName}`

      const approvalLabel: Record<string, string> = {
        approved:      '✓ Approved',
        pending:       '⏳ Pending',
        rejected:      '✗ Rejected',
        reset:         '⚠ Reset',
        not_requested: '',
      }
      const approval = approvalLabel[contractApprovalStatus ?? ''] ?? ''
      const signed   = signedStatus === 'signed' ? '✍️ Signed' : ''
      const addendum = addendum0 ? '📎 Addendum' : ''
      const terminated = terminationStatus === 'terminated'   ? '🔴 Terminated'
                       : terminationStatus === 'notice_given' ? '📤 Notice given'
                       : ''
      const badges   = [approval, signed, addendum, terminated].filter(Boolean).join('  ·  ')

      return {
        title,
        subtitle: badges ? `${partyName ?? '—'}  ·  ${badges}` : (partyName ?? '—'),
      }
    },
  },
})
