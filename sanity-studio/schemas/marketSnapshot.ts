import { defineField, defineType } from 'sanity'

/**
 * Market Snapshot — สถิติตลาดต่อโครงการต่อรอบเก็บข้อมูล
 *
 * สร้างอัตโนมัติจาก scraping pipeline (6 portals, dedup แล้ว)
 * _id แบบ deterministic: marketSnapshot-<slug>-<dataDate> — รัน pipeline ซ้ำจะทับตัวเดิม
 * ใช้เป็น time-series: หนึ่ง doc ต่อ (โครงการ × วันเก็บ)
 */
export default defineType({
  name:  'marketSnapshot',
  title: 'Market Snapshot',
  type:  'document',

  fields: [
    defineField({ name: 'project', title: 'Project', type: 'reference', to: [{ type: 'projectSite' }] }),
    defineField({ name: 'projectName', title: 'Project Name', type: 'string', validation: R => R.required() }),
    defineField({ name: 'dataDate', title: 'Data Date', type: 'date', validation: R => R.required() }),
    defineField({ name: 'nListings', title: 'Listings (raw)', type: 'number' }),
    defineField({ name: 'nRent', title: 'Rent Listings', type: 'number' }),
    defineField({ name: 'nSale', title: 'Sale Listings', type: 'number' }),
    defineField({ name: 'nUniqueUnits', title: 'Unique Units (fingerprint dedup)', type: 'number' }),
    defineField({ name: 'nDualListed', title: 'Dual-listed Units (เช่า+ขายห้องเดียวกัน)', type: 'number' }),
    defineField({ name: 'rentMedianPerSqm', title: 'Rent Median ฿/sqm/mo', type: 'number' }),
    defineField({ name: 'saleMedianPerSqm', title: 'Sale Median ฿/sqm', type: 'number' }),
    defineField({ name: 'grossYieldPct', title: 'Gross Yield %/yr', type: 'number' }),
    defineField({ name: 'activeAgents', title: 'Active Agents (dedup ข้าม portal)', type: 'number' }),
    defineField({
      name: 'cells', title: 'Cells (Bed × Floor Zone × Intent)', type: 'array',
      of: [{
        type: 'object',
        fields: [
          defineField({ name: 'intent', type: 'string', options: { list: ['rent', 'sale'] } }),
          defineField({ name: 'bedType', type: 'string', options: { list: ['studio', '1bed', '2bed', '3bed'] } }),
          defineField({ name: 'floorZone', type: 'string', options: { list: ['low', 'mid', 'high'] } }),
          defineField({ name: 'median', type: 'number' }),
          defineField({ name: 'mean', type: 'number' }),
          defineField({ name: 'min', type: 'number' }),
          defineField({ name: 'max', type: 'number' }),
          defineField({ name: 'sd', type: 'number' }),
          defineField({ name: 'n', type: 'number' }),
        ],
        preview: {
          select: { intent: 'intent', bedType: 'bedType', floorZone: 'floorZone', median: 'median', n: 'n' },
          prepare: ({ intent, bedType, floorZone, median, n }) => ({
            title: `${intent} · ${bedType} · ${floorZone}`,
            subtitle: `median ฿${(median ?? 0).toLocaleString()} · n=${n}`,
          }),
        },
      }],
    }),
  ],

  preview: {
    select: { title: 'projectName', date: 'dataDate', yieldPct: 'grossYieldPct' },
    prepare: ({ title, date, yieldPct }) => ({
      title: `${title} — ${date}`,
      subtitle: `yield ${yieldPct}%`,
    }),
  },
})
