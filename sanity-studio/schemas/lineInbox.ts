import { defineField, defineType } from 'sanity'

/**
 * LINE Inbox — รูปที่นิติส่งเข้ากลุ่มไลน์ รอกดยืนยันก่อนขึ้นจอ
 *
 * Written by the LINE webhook (aquamx-handoff /api/line-webhook):
 *  1. นิติส่งรูปเข้ากลุ่ม → webhook สร้าง doc นี้ (status: pending) + ตอบการ์ดยืนยันในกลุ่ม
 *  2. กด "ยืนยันขึ้นจอ" → webhook สร้าง media (kind: notice, published) + playlist slot
 *     แล้วอัพเดต doc นี้เป็น confirmed พร้อมลิงก์ไปที่ media ที่สร้าง
 *  3. กดยกเลิก / ไม่กดภายในกำหนด → dismissed / expired — ไม่มีอะไรขึ้นจอ
 *
 * Studio ใช้ดูประวัติ/ตามงานค้าง — ไม่ใช่ที่แก้เนื้อหา (แก้ที่ media หลังยืนยันแล้ว)
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
          { title: '🕐 Pending — รอยืนยันในไลน์',       value: 'pending'   },
          { title: '✅ Confirmed — ยืนยันแล้ว ขึ้นจอ',    value: 'confirmed' },
          { title: '❌ Dismissed — ยกเลิกจากไลน์',       value: 'dismissed' },
          { title: '⏰ Expired — ไม่ยืนยันภายในกำหนด',   value: 'expired'   },
          { title: '⚠️ Failed — สร้างสไลด์ไม่สำเร็จ',    value: 'failed'    },
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

    // ── Confirmation trail — เกิดอะไรขึ้นกับรูปนี้ ────────────────────────────
    defineField({
      name:        'confirmedBy',
      title:       'Confirmed By · ผู้กดยืนยัน (LINE User ID)',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => !['confirmed', 'dismissed'].includes((document as any)?.status),
    }),
    defineField({
      name:        'confirmedAt',
      title:       'Confirmed At · เวลากดยืนยัน',
      type:        'datetime',
      readOnly:    true,
      hidden:      ({ document }) => !['confirmed', 'dismissed'].includes((document as any)?.status),
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
      status:      'status',
      projectName: 'project.title',
      receivedAt:  'receivedAt',
      media:       'image',
    },
    prepare({ caption, status, projectName, receivedAt, media }) {
      const statusIcon: Record<string, string> = {
        pending: '🕐', confirmed: '✅', dismissed: '❌', expired: '⏰', failed: '⚠️',
      }
      const when = receivedAt ? new Date(receivedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : ''
      return {
        title:    `${statusIcon[status ?? ''] ?? ''} ${projectName ?? '(no project)'} — ${caption ?? '(no caption)'}`,
        subtitle: when,
        media,
      }
    },
  },
})
