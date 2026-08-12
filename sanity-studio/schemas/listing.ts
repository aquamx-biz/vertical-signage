import { defineType, defineField } from 'sanity'

/**
 * listing — ประกาศดิบ 1 ใบ = 1 เอกสาร (เฟส 2 ชั้น · dataset internal · มี PII)
 * เดิมฝังเป็น array ใน unitSource → แยกออกเป็นเอกสารเดี่ยว + ชี้สังกัดห้องด้วย `unit`
 * แก้/ย้าย/แยกห้อง = เปลี่ยน `unit` + `unitLocked` (ไม่ย้ายข้อมูล ไม่หาย)
 * _id คงที่จาก hash(url) → upsert ข้ามรอบ scrape ได้
 */
export default defineType({
  name: 'listing',
  title: 'Listing · ประกาศ',
  type: 'document',
  groups: [{ name: 'main', title: 'Main', default: true }, { name: 'raw', title: 'สเปคดิบ' }, { name: 'team', title: 'งานทีม' }],
  fields: [
    defineField({ name: 'url', title: 'URL', type: 'url', group: 'main' }),
    defineField({ name: 'portal', title: 'Portal', type: 'string', group: 'main' }),
    defineField({ name: 'sourceId', title: 'Source ID', type: 'string', group: 'main' }),
    defineField({ name: 'intent', title: 'Intent', type: 'string', group: 'main', options: { list: ['rent', 'sale'] } }),
    defineField({ name: 'price', title: 'Price ฿', type: 'number', group: 'main' }),
    // ── สังกัดห้อง (หัวใจของโมเดล 2 ชั้น) ──
    defineField({ name: 'unit', title: 'Unit · ห้องที่สังกัด', type: 'reference', to: [{ type: 'unitSource' }], group: 'main' }),
    defineField({
      name: 'unitLocked', title: '🔒 ล็อกสังกัด (auto ห้ามย้าย)', type: 'boolean', group: 'main',
      description: 'true = ทีมกำหนดห้องเอง · การจับคู่อัตโนมัติจะไม่แตะ (override ถาวร)',
    }),
    // ── สเปคดิบตามที่ scrape (ไม่ตีความ — floor เก็บ "10+"/ว่างได้) ──
    defineField({ name: 'bedRaw', title: 'Bed (ดิบ)', type: 'string', group: 'raw' }),
    defineField({ name: 'sqmRaw', title: 'ตร.ม. (ดิบ)', type: 'string', group: 'raw' }),
    defineField({ name: 'floorRaw', title: 'ชั้น (ดิบ)', type: 'string', group: 'raw' }),
    defineField({ name: 'imgHash', title: 'Image dHash', type: 'string', group: 'raw', readOnly: true }),
    // ── contact ต่อประกาศ (ต่อเอเจนต์) ──
    defineField({ name: 'posterType', title: 'Poster Type', type: 'string', group: 'team' }),
    defineField({ name: 'posterName', title: 'Agent', type: 'string', group: 'team' }),
    defineField({ name: 'cobrokeStatus', title: 'Co-broke Status', type: 'string', group: 'team' }),
    defineField({ name: 'cobrokeNote', title: 'Co-broke Note', type: 'text', group: 'team' }),
    // ── วันที่/สถานะ ──
    defineField({ name: 'status', title: 'Status', type: 'string', group: 'main', options: { list: ['active', 'stale', 'expired'] } }),
    defineField({ name: 'firstSeenAt', title: 'First Seen', type: 'string', group: 'main' }),
    defineField({ name: 'lastSeenAt', title: 'Last Seen', type: 'string', group: 'main' }),
    defineField({ name: 'postCreatedAt', title: 'Posted', type: 'string', group: 'main' }),
    defineField({ name: 'postUpdatedAt', title: 'Post Updated', type: 'string', group: 'main' }),
    defineField({ name: 'availableFrom', title: 'Available From', type: 'string', group: 'main' }),
  ],
  preview: {
    select: { url: 'url', portal: 'portal', intent: 'intent', price: 'price', unit: 'unit.refCode', locked: 'unitLocked' },
    prepare: ({ portal, intent, price, unit, locked }) => ({
      title: `${locked ? '🔒 ' : ''}${intent === 'sale' ? 'ขาย' : 'เช่า'} ${price ? (price >= 1e6 ? (price / 1e6).toFixed(1) + 'M' : (price / 1e3).toFixed(0) + 'K') : '?'} · ${unit ?? '(ไม่มีห้อง)'}`,
      subtitle: portal,
    }),
  },
})
