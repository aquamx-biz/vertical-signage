import { defineField, defineType } from 'sanity'

/**
 * ApprovalRequest — one record per stage per approval flow.
 * Written by the backend; read-only in Studio.
 * Provides a full audit trail of who approved what and when.
 */
export default defineType({
  name:  'approvalRequest',
  title: 'Approval Request',
  type:  'document',

  fields: [
    defineField({ name: 'contract',     title: 'Contract',      type: 'reference', to: [{ type: 'contract' }, { type: 'procurement' }], readOnly: true }),
    defineField({ name: 'documentType', title: 'Document Type', type: 'string',    readOnly: true }), // quotation | contract | mediaBeforePayment
    defineField({ name: 'stage',        title: 'Stage',         type: 'number',    readOnly: true }),
    defineField({ name: 'totalStages',  title: 'Total Stages',  type: 'number',    readOnly: true }),
    defineField({ name: 'stageLabel',   title: 'Stage Label',   type: 'string',    readOnly: true }),
    defineField({ name: 'approver',     title: 'Approver',      type: 'reference', to: [{ type: 'approvalPosition' }], readOnly: true }),
    defineField({ name: 'approvalRule', title: 'Rule Applied',  type: 'reference', to: [{ type: 'approvalRule' }],     readOnly: true }),

    defineField({
      name:     'status',
      title:    'Status',
      type:     'string',
      readOnly: true,
      options:  { list: [
        { title: '⏳ Pending',   value: 'pending'   },
        { title: '✓ Approved',  value: 'approved'  },
        { title: '✗ Rejected',  value: 'rejected'  },
        { title: '— Cancelled', value: 'cancelled' },
        { title: '⏸ Waiting',   value: 'waiting'   }, // later stages before their turn
      ]},
    }),

    defineField({ name: 'requestedAt',     title: 'Requested At',     type: 'datetime', readOnly: true }),
    defineField({ name: 'respondedAt',     title: 'Responded At',     type: 'datetime', readOnly: true }),
    defineField({ name: 'rejectionReason', title: 'Rejection Reason', type: 'text',     readOnly: true }),

    // ── Media before payment (18 Oct 2026) — an ad asked to air before its invoice
    //    is paid; asked from the LINE ad review in aquamx-shop, answered by e-mail
    defineField({ name: 'provider',    title: 'Shop',            type: 'reference', to: [{ type: 'provider' }],       weak: true, readOnly: true, hidden: ({ document }) => document?.documentType !== 'mediaBeforePayment' }),
    defineField({ name: 'media',       title: 'Media',           type: 'reference', to: [{ type: 'media' }],          weak: true, readOnly: true, hidden: ({ document }) => document?.documentType !== 'mediaBeforePayment' }),
    defineField({ name: 'invoice',     title: 'Unpaid Invoice',  type: 'reference', to: [{ type: 'invoiceReceipt' }], weak: true, readOnly: true, hidden: ({ document }) => document?.documentType !== 'mediaBeforePayment' }),
    defineField({ name: 'reason',      title: 'Why Approval Is Needed', type: 'string', readOnly: true, hidden: ({ document }) => document?.documentType !== 'mediaBeforePayment' }),
    defineField({ name: 'requestedBy', title: 'Requested By',    type: 'string', readOnly: true, hidden: ({ document }) => document?.documentType !== 'mediaBeforePayment' }),
    defineField({ name: 'adReqId',     title: 'LINE Ad Request', type: 'string', readOnly: true, hidden: ({ document }) => document?.documentType !== 'mediaBeforePayment' }),

    // Hidden — used to verify approval links in emails
    defineField({ name: 'token', title: 'Token', type: 'string', hidden: true, readOnly: true }),
  ],

  preview: {
    select: {
      shop:         'provider.name_th',
      contract:     'contract.quotationNumber',
      contractNum:  'contract.contractNumber',
      docType:      'documentType',
      stage:        'stage',
      total:        'totalStages',
      approver:     'approver.title',
      status:       'status',
    },
    prepare({ shop, contract, contractNum, docType, stage, total, approver, status }) {
      const ref    = contractNum ?? contract ?? shop ?? '—'
      const icon   = status === 'approved' ? '✓' : status === 'rejected' ? '✗' : status === 'cancelled' ? '—' : '⏳'
      return {
        title:    `${ref} — ${docType ?? ''} Stage ${stage ?? '?'}/${total ?? '?'}`,
        subtitle: `${icon} ${approver ?? '—'}`,
      }
    },
  },
})
