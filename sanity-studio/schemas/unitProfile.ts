import { defineField, defineType } from 'sanity'

/**
 * Unit Profile — ห้องคัดขึ้นบอร์ด/เว็บ (public-safe: ไม่มี contact, ชั้นจริงอยู่ใน unitSource)
 *
 * สร้างจาก pipeline ด้วย fingerprint (ประเภท·ตร.ม.·ชั้น) ยุบข้าม 6 portals
 * _id: unitProfile-<refCode>-<intent> — หนึ่ง doc ต่อ (ห้อง × เช่า/ขาย)
 *
 * Workflow: candidate → ทีม verify → published → ขึ้นบอร์ด/เว็บ → taken/expired
 * ห้องเดียวกันดู contact สำหรับ co-broke ได้ที่ workspace Internal (unitSource, refCode เดียวกัน)
 */
export default defineType({
  name:  'unitProfile',
  title: 'Unit Profile',
  type:  'document',

  fields: [
    defineField({ name: 'refCode', title: 'Ref Code', type: 'string', validation: R => R.required() }),
    defineField({ name: 'project', title: 'Project', type: 'reference', to: [{ type: 'projectSite' }] }),
    defineField({ name: 'projectName', title: 'Project Name', type: 'string' }),
    defineField({ name: 'intent', title: 'Intent', type: 'string', options: { list: ['rent', 'sale'] } }),
    defineField({ name: 'bedType', title: 'Bed Type', type: 'string', options: { list: [
      { title: 'Studio', value: 'studio' }, { title: '1 Bed', value: '1bed' },
      { title: '2 Bed', value: '2bed' }, { title: '3 Bed', value: '3bed' },
      { title: '4 Bed+ / Penthouse', value: '4bed' },
    ] } }),
    defineField({ name: 'sqm', title: 'Size (sqm)', type: 'number' }),
    defineField({ name: 'floorZone', title: 'Floor Zone', type: 'string', options: { list: ['low', 'mid', 'high'] },
      description: 'public เห็นแค่ zone — ชั้นจริงอยู่ใน unitSource (workspace Internal)' }),
    defineField({ name: 'priceTHB', title: 'Price ฿ (ต่ำสุดที่พบ)', type: 'number' }),
    defineField({ name: 'pricePerSqm', title: '฿/sqm', type: 'number' }),
    defineField({ name: 'vsFloorPct', title: 'vs Floor Avg %', type: 'number', description: 'ติดลบ = ถูกกว่าค่าเฉลี่ยชั้นเดียวกัน' }),
    defineField({ name: 'vsZonePct', title: 'vs Zone Avg %', type: 'number' }),
    defineField({ name: 'vsBuildingPct', title: 'vs Building Avg %', type: 'number' }),
    defineField({ name: 'dealTier', title: 'Deal Tier', type: 'string', options: { list: ['super', 'best', 'good'] },
      description: 'super = ถูกกว่าชั้น ≥10% · best = 0-10% · good = ถูกกว่าโซน >10%' }),
    defineField({ name: 'hotDeal', title: 'Hot (agent ≥2 แข่ง)', type: 'boolean' }),
    defineField({ name: 'goodInvest', title: 'Good Invest (dual + yield > avg+1.5)', type: 'boolean' }),
    defineField({ name: 'negotiable', title: 'Negotiable (≥3 portals + ราคาต่าง ≥5%)', type: 'boolean' }),
    defineField({ name: 'yieldPct', title: 'Yield %/yr', type: 'number' }),
    defineField({ name: 'spreadPct', title: 'Spread % (ราคาต่างข้าม portal)', type: 'number' }),
    defineField({ name: 'nListings', title: 'N Listings', type: 'number' }),
    defineField({ name: 'nPortals', title: 'N Portals', type: 'number' }),
    defineField({ name: 'postedByOwner', title: 'Posted by Owner', type: 'boolean' }),
    defineField({ name: 'dualListed', title: 'Dual Listed (เช่า+ขาย)', type: 'boolean' }),
    defineField({
      name: 'status', title: 'Status', type: 'string', initialValue: 'candidate',
      options: { list: ['candidate', 'verified', 'published', 'taken', 'expired'] },
      description: 'candidate = รอทีมตรวจ · published = ขึ้นบอร์ด/เว็บได้',
    }),
    defineField({
      name: 'pinToBoard', title: 'Pin to Board · ปักขึ้นบอร์ดแน่นอน', type: 'boolean',
      description: 'ล็อกให้ห้องนี้ติดบอร์ดเสมอ (ยังต้อง status published + มี contact)',
    }),
    defineField({
      name: 'hideFromBoard', title: 'Hide from Board · ไม่เอาขึ้นบอร์ด', type: 'boolean',
      description: 'ตรวจแล้วแต่ไม่อยากโชว์บนจอ — ระบบคัดอัตโนมัติจะข้ามห้องนี้',
    }),
    /* สถานะดีล — คนละเรื่องกับ status ด้านบน · status คือสถานะของ "ข้อมูล"
       (รอตรวจ/ตรวจแล้ว/หายจากตลาด) ซึ่งมีสามที่กรองใช้อยู่ ถ้าเอาสถานะดีลไปปนจะ
       เปลี่ยนว่าห้องไหนถูกคัดขึ้นบอร์ด · ตัวนี้คือสถานะของ "การขาย" ที่ทีมกดเอง
       และเป็นตัวเดียวที่บอร์ดกับป๊อปอัปเอาไปแสดง */
    defineField({
      name: 'dealStage', title: 'Deal Stage · สถานะดีล', type: 'string',
      options: { list: [
        { title: 'ว่าง — ยังไม่มีความเคลื่อนไหว', value: '' },
        { title: '👀 อยู่ระหว่างนัดชม',            value: 'viewing' },
        { title: '💬 กำลังคุยกับผู้สนใจ',           value: 'talking' },
        { title: '✅ ปิดดีลแล้ว (เช่า/ขายไปแล้ว)',   value: 'closed' },
      ] },
      description: 'กดจากแผง "สถานะดีล" ในเครื่องมือ Unit Boards ได้เลย ไม่ต้องมาแก้ที่นี่',
    }),
    defineField({
      name: 'dealStageAt', title: 'Deal Stage Since · เปลี่ยนสถานะเมื่อ', type: 'date',
      description: 'ห้องที่ปิดดีลจะโชว์บนบอร์ด 30 วันนับจากวันนี้ แล้วหลุดออกเอง',
    }),
    defineField({ name: 'lastCheckedAt', title: 'Last Checked', type: 'date' }),
    defineField({
      name: 'firstSeenAt', title: 'First Seen · พบครั้งแรก', type: 'date',
      description: 'รอบแรกที่ pipeline พบห้องนี้ — ห้องที่เพิ่งพบในรอบล่าสุดติดป้าย NEW บนบอร์ด',
    }),
    defineField({
      name: 'priceHistory', title: 'Price History · ประวัติราคา', type: 'array',
      description: 'time-series ต่อห้อง — pipeline เติมทุกรอบที่ราคาเปลี่ยน (ห้ามลบของเก่า)',
      of: [{
        type: 'object',
        name: 'pricePoint',
        fields: [
          defineField({ name: 'date', title: 'Date', type: 'date', validation: R => R.required() }),
          defineField({ name: 'price', title: 'Price ฿', type: 'number', validation: R => R.required() }),
          defineField({ name: 'nListings', title: 'N Listings', type: 'number' }),
        ],
        preview: {
          select: { date: 'date', price: 'price' },
          prepare: ({ date, price }) => ({ title: `${date} — ฿${(price ?? 0).toLocaleString()}` }),
        },
      }],
    }),
    defineField({ name: 'internalNote', title: 'Internal Note', type: 'text' }),
  ],

  preview: {
    select: { refCode: 'refCode', projectName: 'projectName', intent: 'intent', bedType: 'bedType', sqm: 'sqm', price: 'priceTHB', status: 'status', tier: 'dealTier' },
    prepare: ({ refCode, projectName, intent, bedType, sqm, price, status, tier }) => ({
      title: `${refCode} · ${bedType} ${sqm}sqm · ${intent}`,
      subtitle: `${projectName} · ฿${(price ?? 0).toLocaleString()} · ${status}${tier ? ' · ' + tier.toUpperCase() : ''}`,
    }),
  },
})
