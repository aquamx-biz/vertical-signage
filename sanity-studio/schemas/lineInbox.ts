import { defineField, defineType } from 'sanity'

/**
 * LINE Inbox — รูปที่นิติส่งเข้ากลุ่มไลน์ ผ่านสองด่านก่อนขึ้นจอ
 *
 * Written by the LINE webhook (aquamx-handoff /api/line-webhook):
 *  1. นิติส่งรูปเข้ากลุ่ม → doc นี้ (status: pending) + การ์ดเลือกระยะเวลาในกลุ่มนิติ
 *  2. นิติกดเลือกระยะเวลา → AI อ่านรูป (title TH/EN + สรุป + หมวด) → status: requested
 *     + การ์ดอนุมัติเด้งเข้ากลุ่มแอดมิน aquamx — นิติสั่งขึ้นจอเองตรงๆ ไม่ได้
 *  3. แอดมินกดอนุมัติ → สร้าง media (kind: notice, published) + playlist slot
 *     → status: confirmed · แอดมินปฏิเสธ → status: rejected — ไม่มีอะไรขึ้นจอ
 *
 * Studio ใช้ดูประวัติ/ตามงานค้าง — ไม่ใช่ที่แก้เนื้อหา (แก้ที่ media หลังอนุมัติแล้ว)
 */
export default defineType({
  name:  'lineInbox',
  title: 'LINE Inbox · รูปจากไลน์รอยืนยัน',
  type:  'document',

  orderings: [
    { title: 'Received — Newest', name: 'receivedDesc', by: [{ field: 'receivedAt', direction: 'desc' }] },
    { title: 'Status',            name: 'status',       by: [{ field: 'status',     direction: 'asc'  }] },
  ],

  fields: [
    defineField({
      name:         'status',
      title:        'Status · สถานะ',
      type:         'string',
      initialValue: 'pending',
      options: {
        list: [
          { title: '🕐 Pending — รอนิติเลือกระยะเวลาในไลน์',   value: 'pending'   },
          { title: '🔎 Requested — รอทีมงานอนุมัติ',            value: 'requested' },
          { title: '✅ Confirmed — อนุมัติแล้ว ขึ้นจอ',          value: 'confirmed' },
          { title: '🚫 Rejected — ทีมงานปฏิเสธ',                value: 'rejected'  },
          { title: '❌ Dismissed — นิติยกเลิกเอง',              value: 'dismissed' },
          { title: '⏰ Expired — ไม่ยืนยันภายในกำหนด',          value: 'expired'   },
          { title: '⚠️ Failed — สร้างสไลด์ไม่สำเร็จ',           value: 'failed'    },
        ],
      },
      validation: Rule => Rule.required(),
    }),

    defineField({
      name:        'image',
      title:       'Image · รูปที่ส่งมา',
      type:        'image',
      description: 'รูปตามที่ส่งเข้ากลุ่ม (ระบบย่อให้พอดีเพดานจอแล้วตอนอัพโหลด)',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      name:        'caption',
      title:       'Caption · ข้อความที่ส่งมาด้วย',
      type:        'string',
      description: 'ข้อความที่พิมพ์มาพร้อมรูป (ถ้ามี) — ใช้เป็นพาดหัวตั้งต้นของประกาศ',
    }),

    defineField({
      name:        'project',
      title:       'Project · โครงการ',
      type:        'reference',
      to:          [{ type: 'project' }],
      description: 'โครงการที่รูปนี้จะขึ้นจอ — ระบบจับจาก LINE Group ID ของกลุ่มที่ส่งมา',
      validation:  Rule => Rule.required(),
    }),

    // ── LINE provenance — ใครส่ง จากกลุ่มไหน เมื่อไหร่ ─────────────────────────
    defineField({
      name:        'lineGroupId',
      title:       'LINE Group ID · รหัสกลุ่มต้นทาง',
      type:        'string',
      readOnly:    true,
    }),
    defineField({
      name:        'senderUserId',
      title:       'Sender LINE User ID · รหัสผู้ส่ง',
      type:        'string',
      readOnly:    true,
    }),
    defineField({
      name:        'senderName',
      title:       'Sender Name · ชื่อผู้ส่ง',
      type:        'string',
      readOnly:    true,
      description: 'ชื่อ LINE ของคนที่ส่งรูป (จาก LINE profile API)',
    }),
    defineField({
      name:        'receivedAt',
      title:       'Received At · เวลาที่ส่งเข้ามา',
      type:        'datetime',
      readOnly:    true,
      validation:  Rule => Rule.required(),
    }),

    // ── Request step — นิติเลือกระยะเวลา + AI อ่านรูป ─────────────────────────
    defineField({
      name:        'requestedExpiryDays',
      title:       'Requested Duration (days) · ระยะเวลาที่นิติขอ',
      type:        'number',
      readOnly:    true,
      description: '0 = ไม่หมดอายุ',
      hidden:      ({ document }) => (document as any)?.status === 'pending',
    }),
    defineField({
      name:        'requestedBy',
      title:       'Requested By · ผู้ขอ (LINE User ID)',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => (document as any)?.status === 'pending',
    }),
    defineField({
      name:        'requestedAt',
      title:       'Requested At · เวลาที่ขอ',
      type:        'datetime',
      readOnly:    true,
      hidden:      ({ document }) => (document as any)?.status === 'pending',
    }),
    defineField({
      name:        'aiTitle',
      title:       'AI Title · พาดหัวที่ AI อ่านได้',
      type:        'string',
      readOnly:    true,
      description: 'อ่านจากตัวหนังสือในรูปด้วย AI ตอนนิติกดขอ — ใช้เป็นพาดหัวประกาศเมื่ออนุมัติ',
      hidden:      ({ document }) => (document as any)?.status === 'pending',
    }),
    defineField({
      name:        'aiTitleEn',
      title:       'AI Title (English)',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => (document as any)?.status === 'pending',
    }),
    defineField({
      name:        'aiSummary',
      title:       'AI Summary · สรุปเนื้อหา',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => (document as any)?.status === 'pending',
    }),
    defineField({
      name:        'aiSubCategoryId',
      title:       'AI Sub-category · หมวดประกาศ',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => (document as any)?.status === 'pending',
    }),

    // ── Approval trail — เกิดอะไรขึ้นกับรูปนี้ ────────────────────────────────
    defineField({
      name:        'confirmedBy',
      title:       'Decided By · ผู้อนุมัติ/ปฏิเสธ (LINE User ID)',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => !['confirmed', 'rejected', 'dismissed'].includes((document as any)?.status),
    }),
    defineField({
      name:        'confirmedAt',
      title:       'Decided At · เวลาตัดสิน',
      type:        'datetime',
      readOnly:    true,
      hidden:      ({ document }) => !['confirmed', 'rejected', 'dismissed'].includes((document as any)?.status),
    }),
    defineField({
      name:        'media',
      title:       'Created Media · สไลด์ที่สร้างจากรูปนี้',
      type:        'reference',
      to:          [{ type: 'media' }],
      weak:        true,
      readOnly:    true,
      hidden:      ({ document }) => (document as any)?.status !== 'confirmed',
      description: 'ประกาศ (media kind: notice) ที่สร้างเมื่อกดยืนยัน — แก้พาดหัว/วันหมดอายุได้ที่นั่น',
    }),
    defineField({
      name:        'error',
      title:       'Error · สาเหตุที่ไม่สำเร็จ',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => (document as any)?.status !== 'failed',
    }),
  ],

  preview: {
    select: {
      caption:     'caption',
      aiTitle:     'aiTitle',
      status:      'status',
      projectName: 'project.title',
      receivedAt:  'receivedAt',
      media:       'image',
    },
    prepare({ caption, aiTitle, status, projectName, receivedAt, media }) {
      const statusIcon: Record<string, string> = {
        pending: '🕐', requested: '🔎', confirmed: '✅', rejected: '🚫', dismissed: '❌', expired: '⏰', failed: '⚠️',
      }
      const when = receivedAt ? new Date(receivedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : ''
      return {
        title:    `${statusIcon[status ?? ''] ?? ''} ${projectName ?? '(no project)'} — ${aiTitle ?? caption ?? '(no title yet)'}`,
        subtitle: when,
        media,
      }
    },
  },
})
