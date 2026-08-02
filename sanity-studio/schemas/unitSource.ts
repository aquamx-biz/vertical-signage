import { defineField, defineType } from 'sanity'

/**
 * Unit Source — ข้อมูลหลังบ้านของแต่ละ unit (dataset: internal — PRIVATE เท่านั้น)
 *
 * คู่กับ unitProfile ใน production ผ่าน refCode
 * เก็บสิ่งที่ห้ามโชว์ public: ชั้นจริง, URL ประกาศต้นทาง, ชื่อ/เบอร์ผู้ติดต่อ (PDPA)
 * ใช้ตอน lead ทักมา: ค้น refCode → เห็นทุกประกาศของห้องนี้ → โทร co-broke
 */
export default defineType({
  name:  'unitSource',
  title: 'Unit Source (contact หลังบ้าน)',
  type:  'document',

  fields: [
    defineField({ name: 'refCode', title: 'Ref Code', type: 'string', validation: R => R.required() }),
    defineField({ name: 'projectName', title: 'Project Name', type: 'string' }),
    defineField({ name: 'floorActual', title: 'Floor (ชั้นจริง)', type: 'number' }),
    defineField({
      name: 'listings', title: 'Listings ต้นทาง', type: 'array',
      of: [{
        type: 'object',
        fields: [
          defineField({ name: 'sourceId', title: 'Source ID', type: 'string', description: 'portal:nativeId — กัน import ซ้ำ' }),
          defineField({ name: 'portal', type: 'string' }),
          defineField({ name: 'url', type: 'url' }),
          defineField({ name: 'intent', type: 'string', options: { list: ['rent', 'sale'] } }),
          defineField({ name: 'price', type: 'number' }),
          defineField({ name: 'posterType', type: 'string', options: { list: ['owner', 'agent', 'unknown'] } }),
          defineField({ name: 'posterName', type: 'string' }),
          defineField({ name: 'phone', type: 'string' }),
          defineField({ name: 'lineId', type: 'string' }),
          defineField({ name: 'lastSeenAt', type: 'date' }),
        ],
        preview: {
          select: { portal: 'portal', intent: 'intent', price: 'price', posterName: 'posterName' },
          prepare: ({ portal, intent, price, posterName }) => ({
            title: `${portal} · ${intent} · ฿${(price ?? 0).toLocaleString()}`,
            subtitle: posterName || '(ไม่มีชื่อผู้โพสต์)',
          }),
        },
      }],
    }),
    defineField({
      name: 'bestContact', title: 'Best Contact (ทีมสรุปว่าดีลนี้โทรใคร)', type: 'object',
      fields: [
        defineField({ name: 'name', type: 'string' }),
        defineField({ name: 'phone', type: 'string' }),
        defineField({ name: 'note', type: 'text', description: 'เช่น "owner ตรง ไม่มีคอมซ้อน รับสายหลัง 18:00"' }),
      ],
    }),
    defineField({
      name: 'cobrokeStatus', title: 'Co-broke Status', type: 'string', initialValue: 'not_contacted',
      options: { list: ['not_contacted', 'contacted', 'agreed', 'declined'] },
    }),
    defineField({ name: 'cobrokeNote', title: 'Co-broke Note', type: 'text' }),
  ],

  preview: {
    select: { refCode: 'refCode', projectName: 'projectName', status: 'cobrokeStatus' },
    prepare: ({ refCode, projectName, status }) => ({
      title: refCode,
      subtitle: `${projectName} · ${status}`,
    }),
  },
})
