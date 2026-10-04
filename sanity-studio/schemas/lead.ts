import { defineField, defineType } from 'sanity'

/**
 * Lead — someone who came to US (kiosk, web, LINE OA) wanting one thing.
 *
 * One schema for every kind of request, told apart by `leadType`:
 *   Find a condo · List a property · Shop & services · Order
 * A party (WHO this is — one per person, keyed by LINE user id) can hold any
 * number of leads over time, but at most one OPEN lead per type. The party is
 * linked from the moment the lead is created.
 *
 * Not a lead: the team calling an agent or owner from the Unit Board — that
 * lives in unitSource.contactLog / bestContact / cobrokeStatus (internal).
 *
 * Status: new → contacted → qualified → won / lost (won/lost = closed).
 */
export default defineType({
  name:  'lead',
  title: 'Lead',
  type:  'document',

  groups: [
    { name: 'overview', title: 'Overview', default: true },
    { name: 'request',  title: 'Request'                 },
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
      name:   'leadType',
      title:  'Lead Type',
      type:   'string',
      description: 'What this person came for. Set by the LINE bot / kiosk; existing leads were back-filled (with application documents → Shop & services, otherwise Find a condo).',
      options: {
        list: [
          { title: '🔎 Find a condo',     value: 'findCondo'    },
          { title: '🏠 List a property',  value: 'listProperty' },
          { title: '🏪 Shop & services',  value: 'shop'         },
          { title: '📦 Order',            value: 'order'        },
        ],
        layout: 'radio',
      },
      initialValue: 'findCondo',
      validation:   Rule => Rule.required(),
    }),

    defineField({
      group:  'overview',
      name:   'interestType',
      title:  'Rent or Sale',
      type:   'string',
      description: 'Find a condo: wants to rent or to buy. List a property: offering it for rent, for sale, or both — kept here per request (party › Property Owner Info no longer holds it).',
      options: {
        list: [
          { title: 'Rent', value: 'rent' },
          { title: 'Sale', value: 'sale' },
          { title: 'Both', value: 'both' },
        ],
        layout: 'radio',
      },
      hidden: ({ document }: any) => !['findCondo', 'listProperty'].includes(document?.leadType ?? 'findCondo'),
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
          { title: '💬 LINE chat',   value: 'line'     },
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
      description: 'Who this is. Linked when the lead is created — the bot finds or creates the party by LINE user id first (the LINE user id lives on the party, not here: Contact › LINE ID is what the person typed and cannot be messaged).',
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
      name:     'firstMessage',
      title:    'First Message',
      type:     'text',
      rows:     2,
      readOnly: true,
      description: 'Exactly what the person typed when this lead opened — never a summary.',
    }),

    defineField({
      group:    'overview',
      name:     'aiReplies',
      title:    'Bot & Team Log',
      type:     'array',
      readOnly: true,
      description: 'Every reply the AI drafted and what the team did with it, plus every "talk to a person" handoff. Read to decide when a topic is safe to auto-send.',
      of: [{
        type: 'object',
        name: 'aiReply',
        fields: [
          defineField({ name: 'kind',     title: 'Kind',   type: 'string', options: { list: [
            { title: 'AI draft',  value: 'draft'   },
            { title: 'Handoff',   value: 'handoff' },
          ] } }),
          defineField({ name: 'at',       title: 'At',       type: 'datetime' }),
          defineField({ name: 'topic',    title: 'Topic',    type: 'string' }),
          defineField({ name: 'question', title: 'Customer message', type: 'text', rows: 2 }),
          defineField({ name: 'draft',    title: 'AI draft', type: 'text', rows: 3 }),
          defineField({ name: 'action',   title: 'Team action', type: 'string', options: { list: [
            { title: 'Sent as drafted', value: 'sent'   },
            { title: 'Edited, then sent', value: 'edited' },
            { title: 'Held',            value: 'held'   },
            { title: 'Auto-sent',       value: 'auto'   },
            { title: 'Handed to team',  value: 'handoff' },
          ] } }),
          defineField({ name: 'finalText', title: 'Text sent', type: 'text', rows: 3 }),
          defineField({ name: 'by',        title: 'By',        type: 'string' }),
          defineField({ name: 'endedAt',   title: 'Handoff ended', type: 'datetime' }),
        ],
        preview: {
          select: { kind: 'kind', at: 'at', action: 'action', topic: 'topic', by: 'by' },
          prepare: ({ kind, at, action, topic, by }: any) => ({
            title: `${kind === 'handoff' ? '🙋 Handoff' : '💬 AI draft'}${topic ? ` · ${topic}` : ''}${action ? ` → ${action}` : ''}`,
            subtitle: [at ? String(at).slice(0, 16).replace('T', ' ') : '', by].filter(Boolean).join(' · '),
          }),
        },
      }],
    }),

    // ── Request — the fields that belong to this lead type only ───────
    // (budget, unit of interest and preferred time already live under
    //  Contact Info and are reused, not repeated here)

    defineField({ group: 'request', name: 'bedrooms', title: 'Bedrooms', type: 'string',
      options: { list: ['Studio', '1', '2', '3', '4+'] },
      hidden: ({ document }: any) => (document?.leadType ?? 'findCondo') !== 'findCondo' }),
    defineField({ group: 'request', name: 'areaWanted', title: 'Area / Station', type: 'string',
      description: 'As the person said it, e.g. "ทองหล่อ", "near Asok".',
      hidden: ({ document }: any) => (document?.leadType ?? 'findCondo') !== 'findCondo' }),
    defineField({ group: 'request', name: 'moveIn', title: 'Move-in', type: 'string',
      description: 'As the person said it, e.g. "ต้นเดือนหน้า".',
      hidden: ({ document }: any) => (document?.leadType ?? 'findCondo') !== 'findCondo' }),

    defineField({ group: 'request', name: 'listingProject', title: 'Project', type: 'reference', to: [{ type: 'projectSite' }],
      hidden: ({ document }: any) => document?.leadType !== 'listProperty' }),
    defineField({ group: 'request', name: 'unitType', title: 'Unit Type', type: 'string',
      description: 'e.g. "2 bedrooms", "Studio 28 sqm".',
      hidden: ({ document }: any) => document?.leadType !== 'listProperty' }),
    defineField({ group: 'request', name: 'askingRent', title: 'Asking Rent (THB / month)', type: 'number',
      hidden: ({ document }: any) => document?.leadType !== 'listProperty' || document?.interestType === 'sale' }),
    defineField({ group: 'request', name: 'askingPrice', title: 'Asking Price (THB)', type: 'number',
      hidden: ({ document }: any) => document?.leadType !== 'listProperty' || document?.interestType === 'rent' }),

    defineField({ group: 'request', name: 'businessType', title: 'Business Type', type: 'string',
      description: 'e.g. "laundry", "cleaning".',
      hidden: ({ document }: any) => document?.leadType !== 'shop' }),
    defineField({ group: 'request', name: 'buildingsWanted', title: 'Buildings Wanted', type: 'array',
      of: [{ type: 'reference', to: [{ type: 'projectSite' }] }],
      hidden: ({ document }: any) => document?.leadType !== 'shop' }),
    defineField({ group: 'request', name: 'packageInterest', title: 'Package of Interest', type: 'string',
      hidden: ({ document }: any) => document?.leadType !== 'shop' }),

    defineField({ group: 'request', name: 'orderShop', title: 'Shop', type: 'reference', to: [{ type: 'provider' }],
      hidden: ({ document }: any) => document?.leadType !== 'order' }),
    defineField({ group: 'request', name: 'orderItems', title: 'Items', type: 'string',
      description: 'As the person said it, e.g. "น้ำแข็ง 2 ถุง".',
      hidden: ({ document }: any) => document?.leadType !== 'order' }),
    defineField({ group: 'request', name: 'deliverTo', title: 'Deliver To', type: 'string',
      description: 'Building and unit, e.g. "Park 24 · 1204".',
      hidden: ({ document }: any) => document?.leadType !== 'order' }),
    defineField({ group: 'request', name: 'orderNumber', title: 'Order No.', type: 'string', readOnly: true,
      description: 'AQ-… set by the bot when the order is placed — that also closes this lead. The order itself lives in the order system, not here.',
      hidden: ({ document }: any) => document?.leadType !== 'order' }),

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

    // ── เอกสารประกอบการสมัคร — ส่งจากมือถือหลัง lead เข้า ───────────────────
    // ไฟล์ถูกเตรียมจากฝั่งมือถือแล้ว (บัตร ปชช. ปิดศาสนา/กรุ๊ปเลือด + ประทับข้อความ
    // กำกับลงในภาพ) เจ้าหน้าที่ตรวจตรงนี้แล้วส่งค่าย · ลบทิ้งหลังติดตั้งเสร็จ (PDPA)
    defineField({
      group:  'contact',
      name:   'documents',
      title:  '📎 เอกสารประกอบการสมัคร',
      type:   'array',
      of: [{
        type: 'object',
        name: 'leadDocument',
        fields: [
          defineField({
            name: 'kind', title: 'ประเภท', type: 'string',
            options: { list: [
              { title: 'บัตรประชาชน / พาสปอร์ต', value: 'id_card' },
              { title: 'หนังสือรับรองบริษัท',     value: 'company_affidavit' },
              { title: 'บัตร ปชช. กรรมการ',       value: 'director_id' },
              { title: 'ภ.พ.20',                  value: 'vat_cert' },
            ]},
          }),
          defineField({ name: 'image', title: 'รูป', type: 'image' }),
          defineField({ name: 'file',  title: 'ไฟล์', type: 'file' }),
          defineField({ name: 'uploadedAt', title: 'ส่งเมื่อ', type: 'datetime', readOnly: true }),
        ],
        preview: {
          select: { kind: 'kind', at: 'uploadedAt', media: 'image' },
          prepare({ kind, at, media }) {
            const K: Record<string, string> = { id_card: 'บัตรประชาชน', company_affidavit: 'หนังสือรับรอง', director_id: 'บัตรกรรมการ', vat_cert: 'ภ.พ.20' }
            return { title: K[kind] ?? kind ?? '(ไม่ระบุ)', subtitle: at ? String(at).slice(0, 16).replace('T', ' ') : '', media }
          },
        },
      }],
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

    // One person = one Find-a-condo lead, however many rooms they ask to see
    // (decided 5 Oct 2026). Each room is one row here; the old one-room fields
    // below stay only for leads that were never moved over and hide when empty.
    defineField({
      group:       'viewing',
      name:        'viewings',
      title:       'Rooms & Viewings · ห้องที่ขอดู',
      type:        'array',
      description: 'One row per room this person asked to see. Written by the LINE bot / kiosk; the lead status follows the rows (any Won → Won · all Lost or Cancelled → Lost).',
      hidden: ({ document }: any) => (document?.leadType ?? 'findCondo') !== 'findCondo',
      of: [{
        type: 'object',
        name: 'leadViewing',
        fields: [
          defineField({ name: 'unitRef',   title: 'Unit Code', type: 'string', description: 'e.g. NBL-U185' }),
          defineField({ name: 'unitLabel', title: 'Room',      type: 'string', description: 'As shown to the customer, e.g. "2 ห้องนอน · 66 ตรม. · ชั้น 25".' }),
          defineField({ name: 'project',   title: 'Project',   type: 'string' }),
          defineField({ name: 'status',    title: 'Status',    type: 'string', options: { list: [
            { title: '🆕 Requested',          value: 'new'       },
            { title: '📞 Contacted',          value: 'contacted' },
            { title: '✅ Confirmed / Viewed', value: 'qualified' },
            { title: '🏆 Won',                value: 'won'       },
            { title: '❌ Not taken',          value: 'lost'      },
            { title: '🚫 Cancelled',          value: 'cancelled' },
          ] }, initialValue: 'new' }),
          defineField({ name: 'source',    title: 'Came From', type: 'string', options: { list: [
            { title: '🖥️ Kiosk', value: 'kiosk' }, { title: '🌐 Web', value: 'web' },
            { title: '💬 LINE chat', value: 'line' }, { title: 'Other', value: 'other' },
          ] } }),
          defineField({ name: 'addedAt',   title: 'Asked At',  type: 'datetime', readOnly: true }),
          defineField({ name: 'bookingRef', title: 'Booking No. · เลขใบนัด', type: 'string', readOnly: true }),
          defineField({ name: 'submissionId', title: 'Submission ID', type: 'string', readOnly: true, hidden: true }),
          defineField({ name: 'firestoreLeadIds', title: 'Firestore Viewing IDs', type: 'array', of: [{ type: 'string' }], readOnly: true,
            description: 'The bot\'s own viewing record(s) for this room — more than one when the same room was sent twice.' }),
          defineField({ name: 'appointment', title: 'Appointment · นัดชม', type: 'object', fields: [
            defineField({ name: 'requestedDate', title: 'Requested Date', type: 'date' }),
            defineField({ name: 'requestedTime', title: 'Requested Time', type: 'string' }),
            defineField({ name: 'proposedSlots', title: 'Proposed Alternatives', type: 'array', of: [{ type: 'string' }] }),
            defineField({ name: 'confirmedAt',       title: 'Confirmed At', type: 'datetime' }),
            defineField({ name: 'contactRevealedAt', title: 'Contact Revealed At', type: 'datetime' }),
          ] }),
          defineField({ name: 'viewingOutcome', title: 'Viewing Outcome · ผลนัด', type: 'object', fields: [
            defineField({ name: 'attended', title: 'Attended', type: 'boolean' }),
            defineField({ name: 'result',   title: 'Result',   type: 'string', options: { list: ['take', 'liked', 'thinking', 'no', 'closed'] } }),
            defineField({ name: 'reason',   title: 'Reason (เมื่อไม่เอา)', type: 'string', options: { list: ['price', 'decor', 'floor', 'size', 'other'] } }),
            defineField({ name: 'followUpAt', title: 'Next Follow-up', type: 'date' }),
          ] }),
          defineField({ name: 'voucherCode', title: 'Voucher Code', type: 'string', readOnly: true }),
          defineField({ name: 'negotiation', title: 'Negotiation · ต่อรอง', type: 'array', of: [{
            type: 'object', name: 'negRound',
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
          }] }),
        ],
        preview: {
          select: { ref: 'unitRef', label: 'unitLabel', project: 'project', status: 'status', d: 'appointment.requestedDate', t: 'appointment.requestedTime', booking: 'bookingRef' },
          prepare: ({ ref, label, project, status, d, t, booking }: any) => {
            const S: Record<string, string> = { new: '🆕', contacted: '📞', qualified: '✅', won: '🏆', lost: '❌', cancelled: '🚫' }
            return {
              title:    `${S[status ?? 'new'] ?? ''} ${[ref, label].filter(Boolean).join(' · ') || project || 'Room'}`.trim(),
              subtitle: [project, [d, t].filter(Boolean).join(' '), booking].filter(Boolean).join(' · '),
            }
          },
        },
      }],
    }),


    defineField({
      group:    'viewing',
      name:     'bookingRef',
      hidden: ({ value }: any) => !value,   // old one-room field — kept only for leads not moved to Rooms & Viewings
      title:    'Booking No. · เลขใบนัด',
      type:     'string',
      readOnly: true,
      description: 'ออกตอนสร้างนัด ใช้อ้างอิงกับลูกค้าและเจ้าของห้อง — เอเจนต์คนเดียวนัดห้องเดียวกันได้หลายรอบ รหัสห้องจึงแยกนัดไม่ได้',
    }),

    defineField({
      group:    'viewing',
      name:     'submissionId',
      hidden: ({ value }: any) => !value,   // old one-room field — kept only for leads not moved to Rooms & Viewings
      title:    'Submission ID',
      type:     'string',
      readOnly: true,
      description: 'One kiosk scan with several rooms fans out to several leads sharing this id.',
    }),

    defineField({
      group:       'viewing',
      name:        'appointment',
      hidden: ({ value }: any) => !value,   // old one-room field — kept only for leads not moved to Rooms & Viewings
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
      hidden: ({ value }: any) => !value,   // old one-room field — kept only for leads not moved to Rooms & Viewings
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
      hidden: ({ value }: any) => !value,   // old one-room field — kept only for leads not moved to Rooms & Viewings
      title:       'Voucher Code',
      type:        'string',
      readOnly:    true,
      description: 'ออกให้อัตโนมัติเมื่อยืนยันผลตรงกันทั้งสองฝั่ง — ฿200 ใช้กับร้านในเครือของตึกนั้น',
    }),

    defineField({
      group:       'viewing',
      name:        'negotiation',
      hidden: ({ value }: any) => !(value as any[] | undefined)?.length,   // old one-room field — kept only for leads not moved to Rooms & Viewings
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

  orderings: [
    { title: 'Lead type', name: 'leadTypeAsc', by: [{ field: 'leadType', direction: 'asc' }, { field: '_createdAt', direction: 'desc' }] },
    { title: 'Newest',    name: 'createdDesc', by: [{ field: '_createdAt', direction: 'desc' }] },
  ],

  preview: {
    select: {
      name:         'contactName',
      status:       'status',
      interestType: 'interestType',
      source:       'source',
      leadType:     'leadType',
    },
    prepare({ name, status, interestType, source, leadType }) {
      const statusEmoji: Record<string, string> = {
        new: '🆕', contacted: '📞', qualified: '✅', won: '🏆', lost: '❌',
      }
      const typeTag: Record<string, string> = {
        findCondo: '[Find a condo]', listProperty: '[List a property]', shop: '[Shop & services]', order: '[Order]',
      }
      const rs: Record<string, string> = { rent: 'Rent', sale: 'Sale', both: 'Rent + Sale' }
      return {
        title:    `${typeTag[leadType ?? 'findCondo'] ?? ''} ${name ?? '(No name)'}`.trim(),
        subtitle: [statusEmoji[status] ?? '', rs[interestType ?? ''] ?? '', source].filter(Boolean).join(' · '),
      }
    },
  },
})
