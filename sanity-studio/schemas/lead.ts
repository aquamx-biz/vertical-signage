import { defineField, defineType } from 'sanity'

/**
 * Lead — a qualified property inquiry being tracked in the CRM.
 *
 * New leads are auto-created by the Firebase Function when a Firestore
 * lead document is written (kiosk/web submission). The contact fields
 * are copied from Firestore at sync time.
 *
 * Sales team works leads through: new → contacted → qualified → won / lost
 *
 * When a lead qualifies, create a Party record and link it here.
 * For rent leads → create a Contract.
 * For sale leads → create a Sale Opportunity (Phase F).
 */
export default defineType({
  name:  'lead',
  title: 'Lead',
  type:  'document',

  groups: [
    { name: 'overview', title: 'Overview', default: true },
    { name: 'contact',  title: 'Contact Info'            },
    { name: 'viewing',  title: 'Viewing · นัดชม'          },
    { name: 'notes',    title: 'Notes'                   },
  ],

  fields: [

    // ── Overview ──────────────────────────────────────────────────────────────

    defineField({
      group:       'overview',
      name:        'status',
      title:       'Status',
      type:        'string',
      options: {
        list: [
          { title: '🆕 New',          value: 'new'       },
          { title: '📞 Contacted',    value: 'contacted' },
          { title: '✅ Qualified',    value: 'qualified' },
          { title: '🏆 Won',          value: 'won'       },
          { title: '❌ Lost',         value: 'lost'      },
        ],
        layout: 'radio',
      },
      initialValue: 'new',
      validation:   Rule => Rule.required(),
    }),

    defineField({
      group:  'overview',
      name:   'interestType',
      title:  'Interest Type',
      type:   'string',
      options: {
        list: [
          { title: '📺 Signage Rental (Rent)', value: 'rent' },
          { title: '🏠 Property Purchase (Sale)', value: 'sale' },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:  'overview',
      name:   'source',
      title:  'Lead Source',
      type:   'string',
      options: {
        list: [
          { title: '🖥️ Kiosk',      value: 'kiosk'    },
          { title: '🌐 Web',         value: 'web'      },
          { title: '🤝 Referral',    value: 'referral' },
          { title: '👋 Direct',      value: 'direct'   },
          { title: 'Other',          value: 'other'    },
        ],
      },
      initialValue: 'kiosk',
    }),

    defineField({
      group:       'overview',
      name:        'party',
      title:       'Linked Party',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'Link to a Party record once the contact is confirmed and qualified.',
    }),

    defineField({
      group:  'overview',
      name:   'assignedTo',
      title:  'Assigned To',
      type:   'string',
      description: 'Sales person responsible for this lead.',
    }),

    defineField({
      group:  'overview',
      name:   'followUpDate',
      title:  'Next Follow-up Date',
      type:   'date',
    }),

    defineField({
      group:    'overview',
      name:     'firestoreLeadId',
      title:    'Firestore Lead ID',
      type:     'string',
      readOnly: true,
      description: 'Auto-set when synced from Firestore. Do not edit.',
    }),

    // ── Contact Info ──────────────────────────────────────────────────────────

    defineField({
      group:       'contact',
      name:        'contactName',
      title:       'Contact Name',
      type:        'string',
      description: 'Name as submitted in the inquiry form.',
    }),

    defineField({
      group:  'contact',
      name:   'contactPhone',
      title:  'Phone',
      type:   'string',
    }),

    defineField({
      group:  'contact',
      name:   'contactEmail',
      title:  'Email',
      type:   'string',
    }),

    defineField({
      group:  'contact',
      name:   'contactLineId',
      title:  'LINE ID',
      type:   'string',
    }),

    defineField({
      group:       'contact',
      name:        'unitInterest',
      title:       'Unit / Property of Interest',
      type:        'string',
      description: 'Unit ID or description from the inquiry.',
    }),

    defineField({
      group:  'contact',
      name:   'preferredTime',
      title:  'Preferred Contact / Viewing Time',
      type:   'string',
    }),

    defineField({
      group:  'contact',
      name:   'budget',
      title:  'Budget (THB)',
      type:   'number',
    }),

    // ── Viewing · นัดชม (spec §12.5 — slot object on lead, no new doc type) ──

    defineField({
      group:    'viewing',
      name:     'bookingRef',
      title:    'Booking No. · เลขใบนัด',
      type:     'string',
      readOnly: true,
      description: 'ออกตอนสร้างนัด ใช้อ้างอิงกับลูกค้าและเจ้าของห้อง — เอเจนต์คนเดียวนัดห้องเดียวกันได้หลายรอบ รหัสห้องจึงแยกนัดไม่ได้',
    }),

    defineField({
      group:    'viewing',
      name:     'submissionId',
      title:    'Submission ID',
      type:     'string',
      readOnly: true,
      description: 'One kiosk scan with several rooms fans out to several leads sharing this id.',
    }),

    defineField({
      group:       'viewing',
      name:        'appointment',
      title:       'Appointment · นัดชม',
      type:        'object',
      description: 'Written by the LINE bot — requested slot, proposed alternatives, confirmation.',
      fields: [
        defineField({ name: 'requestedDate', title: 'Requested Date', type: 'date' }),
        defineField({ name: 'requestedTime', title: 'Requested Time', type: 'string' }),
        defineField({ name: 'proposedSlots', title: 'Proposed Alternatives', type: 'array',
          of: [{ type: 'string' }], description: '"2026-09-13 16:00" strings — offered when the requested slot is not free.' }),
        defineField({ name: 'confirmedAt',       title: 'Confirmed At', type: 'datetime' }),
        defineField({ name: 'contactRevealedAt', title: 'Contact Revealed At', type: 'datetime',
          description: 'Customer contact is revealed ONLY on confirm — this is the audit stamp.' }),
      ],
    }),

    defineField({
      group: 'viewing',
      name:  'viewingOutcome',
      title: 'Viewing Outcome · ผลนัด',
      type:  'object',
      fields: [
        defineField({ name: 'attended', title: 'Attended', type: 'boolean' }),
        defineField({ name: 'result',   title: 'Result',   type: 'string',
          options: { list: ['liked', 'thinking', 'no', 'closed'] } }),
        defineField({ name: 'reason',   title: 'Reason (เมื่อไม่เอา)', type: 'string',
          options: { list: ['price', 'decor', 'floor', 'size', 'other'] } }),
        defineField({ name: 'followUpAt', title: 'Next Follow-up', type: 'date' }),
      ],
    }),

    defineField({
      group:       'viewing',
      name:        'voucherCode',
      title:       'Voucher Code',
      type:        'string',
      readOnly:    true,
      description: 'ออกให้อัตโนมัติเมื่อยืนยันผลตรงกันทั้งสองฝั่ง — ฿200 ใช้กับร้านในเครือของตึกนั้น',
    }),

    defineField({
      group:       'viewing',
      name:        'negotiation',
      title:       'Negotiation · ต่อรอง',
      type:        'array',
      description: 'ทุกข้อเสนอถูกบันทึก — ฐานข้อมูลราคาปิดจริง vs ราคาประกาศ (สูงสุด 3 รอบ)',
      of: [{
        type: 'object',
        name: 'negRound',
        fields: [
          defineField({ name: 'by',     title: 'By',     type: 'string', options: { list: ['customer', 'caretaker'] } }),
          defineField({ name: 'amount', title: 'Amount ฿', type: 'number' }),
          defineField({ name: 'round',  title: 'Round',  type: 'number' }),
          defineField({ name: 'at',     title: 'At',     type: 'datetime' }),
        ],
        preview: {
          select: { by: 'by', amount: 'amount', round: 'round' },
          prepare: ({ by, amount, round }: { by?: string; amount?: number; round?: number }) => ({
            title: `รอบ ${round ?? '?'} · ${by === 'caretaker' ? 'ผู้ดูแล' : 'ลูกค้า'} — ฿${(amount ?? 0).toLocaleString()}`,
          }),
        },
      }],
    }),

    // ── Notes ─────────────────────────────────────────────────────────────────

    defineField({
      group:  'notes',
      name:   'notes',
      title:  'Notes',
      type:   'text',
      rows:   5,
    }),

  ],

  preview: {
    select: {
      name:         'contactName',
      status:       'status',
      interestType: 'interestType',
      source:       'source',
    },
    prepare({ name, status, interestType, source }) {
      const statusEmoji: Record<string, string> = {
        new: '🆕', contacted: '📞', qualified: '✅', won: '🏆', lost: '❌',
      }
      const typeLabel: Record<string, string> = { rent: 'Rent', sale: 'Sale' }
      return {
        title:    name ?? '(No name)',
        subtitle: [statusEmoji[status] ?? '', typeLabel[interestType ?? ''] ?? '', source].filter(Boolean).join(' · '),
      }
    },
  },
})
