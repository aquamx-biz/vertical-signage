import { defineField, defineType } from 'sanity'

/**
 * subscription — every recurring service the company pays for (Claude,
 * Sanity, Google, Firebase, LINE OA, Netlify, Tailscale…), one document
 * each. Today these costs live in people's heads; here they get a total,
 * a next-billing date, and a default GL category the finance intake can
 * use to auto-classify the vendor's receipts (vendor memory's cousin).
 */
export default defineType({
  name:  'subscription',
  title: 'Subscription · บริการรายเดือน/รายปี',
  type:  'document',
  fields: [
    defineField({
      name:       'serviceName',
      title:      'Service · ชื่อบริการ *',
      type:       'string',
      description: 'เช่น Claude Max, Sanity Growth, Google Workspace, LINE OA Basic',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name:        'vendor',
      title:       'Vendor · ผู้ให้บริการ (party)',
      type:        'reference',
      to:          [{ type: 'party' }],
      weak:        true,
      description: 'ผูกกับ party เดียวกับที่ระบบอ่านใบเสร็จเจอ — ช่วยให้เอกสารจับคู่หมวดอัตโนมัติ',
    }),
    defineField({
      name:        'plan',
      title:       'Plan · แผน/แพ็กเกจ',
      type:        'string',
    }),
    defineField({
      name:        'amount',
      title:       'Amount · ยอดต่อรอบ *',
      type:        'number',
      validation:  Rule => Rule.required().min(0),
    }),
    defineField({
      name:         'currency',
      title:        'Currency · สกุลเงิน',
      type:         'string',
      options:      { list: ['THB', 'USD'], layout: 'radio' },
      initialValue: 'THB',
    }),
    defineField({
      name:    'billingCycle',
      title:   'Billing Cycle · รอบบิล *',
      type:    'string',
      options: {
        list: [
          { title: 'Monthly · รายเดือน', value: 'monthly' },
          { title: 'Yearly · รายปี',     value: 'yearly' },
        ],
        layout: 'radio',
      },
      initialValue: 'monthly',
      validation:   Rule => Rule.required(),
    }),
    defineField({
      name:        'nextBillingDate',
      title:       'Next Billing · วันบิลถัดไป',
      type:        'date',
      description: 'อัพเดตเองเมื่อจ่ายแล้ว — ไว้กันลืม/ไว้ทำแจ้งเตือนภายหลัง',
    }),
    defineField({
      name:        'paymentMethod',
      title:       'Paid Via · จ่ายผ่าน',
      type:        'reference',
      to:          [{ type: 'bankAccount' }],
      weak:        true,
      description: 'บัญชี/บัตรของบริษัทที่ตัดเงิน',
    }),
    defineField({
      name:        'glAccount',
      title:       'GL Account · หมวดบัญชีค่าใช้จ่าย',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { filter: 'isActive == true' },
      description: 'หมวด default เวลาใบเสร็จของบริการนี้เข้าระบบการเงิน',
    }),
    defineField({
      name:    'status',
      title:   'Status · สถานะ',
      type:    'string',
      options: {
        list: [
          { title: '🟢 Active · ใช้งานอยู่',   value: 'active' },
          { title: '⏸ Paused · พักไว้',       value: 'paused' },
          { title: '⛔ Cancelled · ยกเลิกแล้ว', value: 'cancelled' },
        ],
        layout: 'radio',
      },
      initialValue: 'active',
    }),
    defineField({
      name:        'loginEmail',
      title:       'Login Email · อีเมลที่ใช้สมัคร',
      type:        'string',
      description: 'บัญชีไหนเป็นเจ้าของ subscription นี้ — ไว้ตามรอยตอนต้องแก้/ยกเลิก',
    }),
    defineField({
      name:        'startedAt',
      title:       'Started · เริ่มใช้เมื่อ',
      type:        'date',
    }),
    defineField({
      name:  'notes',
      title: 'Notes · โน้ต',
      type:  'text',
      rows:  2,
    }),
  ],
  orderings: [
    {
      title: 'Next billing date',
      name:  'nextBillingAsc',
      by:    [{ field: 'nextBillingDate', direction: 'asc' }],
    },
  ],
  preview: {
    select:  { name: 'serviceName', plan: 'plan', amount: 'amount', currency: 'currency', cycle: 'billingCycle', status: 'status', next: 'nextBillingDate' },
    prepare: ({ name, plan, amount, currency, cycle, status, next }) => ({
      title: `${status === 'cancelled' ? '⛔ ' : status === 'paused' ? '⏸ ' : ''}${name ?? '(ไม่มีชื่อ)'}${plan ? ` · ${plan}` : ''}`,
      subtitle: `${amount != null ? `${amount.toLocaleString()} ${currency ?? 'THB'}` : ''}${cycle ? `/${cycle === 'yearly' ? 'ปี' : 'เดือน'}` : ''}${next ? ` · บิลถัดไป ${next}` : ''}`,
    }),
  },
})
