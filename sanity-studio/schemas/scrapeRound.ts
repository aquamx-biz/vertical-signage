import {defineType, defineField} from 'sanity'

// ใบสรุปรอบ scrape รายสัปดาห์ — สร้างโดย tools/ingest-units.mjs (อ่านอย่างเดียวใน Studio)
export default defineType({
  name: 'scrapeRound',
  title: 'Scrape Round · สรุปรอบเก็บข้อมูล',
  type: 'document',
  fields: [
    defineField({name: 'roundDate', title: 'Round date · วันที่รอบ', type: 'date', readOnly: true}),
    defineField({name: 'listings', title: 'Listings scraped · ประกาศทั้งหมด', type: 'number', readOnly: true}),
    defineField({name: 'uniqueUnits', title: 'Unique units · ห้องไม่ซ้ำ', type: 'number', readOnly: true}),
    defineField({name: 'newUnits', title: 'New units · ห้องพบใหม่', type: 'number', readOnly: true}),
    defineField({name: 'priceChanges', title: 'Price changes · ราคาเปลี่ยน', type: 'number', readOnly: true}),
    defineField({name: 'expired', title: 'Expired · หายจากตลาด', type: 'number', readOnly: true}),
    defineField({
      name: 'warnings', title: 'Warnings · คำเตือน', type: 'array',
      of: [{type: 'string'}], readOnly: true,
    }),
  ],
  preview: {
    select: {date: 'roundDate', n: 'listings', nu: 'newUnits', pc: 'priceChanges', ex: 'expired'},
    prepare: ({date, n, nu, pc, ex}) => ({
      title: `รอบ ${date}`,
      subtitle: `${n ?? 0} ประกาศ · ใหม่ ${nu ?? 0} · ราคาเปลี่ยน ${pc ?? 0} · expired ${ex ?? 0}`,
    }),
  },
})
