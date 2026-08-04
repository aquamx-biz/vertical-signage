import { defineField, defineType } from 'sanity'

// Unit Board — the split-flap price board (board.html).
// One document per project per mode (FOR RENT / FOR SALE).
// build.mjs bakes each published board to ../{code}/board/{mode}/index.html.
//
// Prices are stored as REAL NUMBERS (baht) — never "18.0K" strings — because
// the same documents also feed the company website. All display formatting
// (18.0K / 6.50 M / ฿/SQM) happens in board.html.

export default defineType({
  name: 'unitBoard',
  title: 'Unit Board · บอร์ดราคายูนิต',
  type: 'document',
  fields: [
    defineField({
      name: 'project',
      title: 'Project · โครงการ',
      type: 'reference',
      to: [{ type: 'project' }],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'mode',
      title: 'Mode · ประเภทบอร์ด',
      type: 'string',
      options: {
        list: [
          { title: 'FOR RENT · ให้เช่า', value: 'rent' },
          { title: 'FOR SALE · ขาย', value: 'sale' },
        ],
        layout: 'radio',
      },
      initialValue: 'rent',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'isActive',
      title: 'Active · เปิดใช้งาน',
      type: 'boolean',
      description: 'ปิด = ไม่ bake บอร์ดนี้ขึ้นจอ (ข้อมูลยังอยู่)',
      initialValue: true,
    }),
    defineField({
      name: 'policy',
      title: 'Selection Policy · นโยบายคัดเลือก',
      type: 'object',
      description: 'โควตาการคัดอัตโนมัติ — เว้นว่าง = ใช้ค่ามาตรฐาน (19 แถว, การันตีธงละ 1) · ธงไหนมีห้องไม่พอ ระบบเติมจากดีลดีสุดแทนและแจ้ง warning',
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({ name: 'quota', title: 'Quota · จำนวนแถวรวม', type: 'number', validation: R => R.min(1).max(19).warning('จอแสดงได้สูงสุด 19 แถว') }),
        defineField({ name: 'superQ', title: 'SUPER · โควตา', type: 'number' }),
        defineField({ name: 'bestQ', title: 'BEST · โควตา', type: 'number' }),
        defineField({ name: 'hotQ', title: 'HOT · โควตา', type: 'number' }),
        defineField({ name: 'negoQ', title: 'NEGO · โควตา', type: 'number' }),
        defineField({ name: 'investQ', title: 'INVESTABLE · โควตา', type: 'number' }),
        defineField({ name: 'studioMin', title: 'STUDIO · ขั้นต่ำ', type: 'number' }),
        defineField({ name: 'b1Min', title: '1BED · ขั้นต่ำ', type: 'number' }),
        defineField({ name: 'b2Min', title: '2BED · ขั้นต่ำ', type: 'number' }),
        defineField({ name: 'b3Min', title: '3BED · ขั้นต่ำ', type: 'number' }),
        defineField({ name: 'b4Min', title: '4BED+/Penthouse · ขั้นต่ำ', type: 'number' }),
      ],
    }),
    defineField({
      name: 'lineup',
      title: 'Lineup · รายการห้องที่จะขึ้นจอ',
      type: 'array',
      description: 'ผลคัดจาก engine (สร้างด้วย tools/board-lineup.mjs) — สลับลำดับ/ถอด/เพิ่มมือได้ · publish แล้ว build ใช้รายการนี้ตรง ๆ ไม่คำนวณใหม่ · ถ้าว่าง build จะคัดอัตโนมัติจากห้อง published+มี contact',
      of: [{ type: 'reference', to: [{ type: 'unitProfile' }] }],
    }),
    defineField({
      name: 'lineupWarnings',
      title: 'Warnings · คำเตือนรอบคัดล่าสุด',
      type: 'array',
      of: [{ type: 'string' }],
      readOnly: true,
      description: 'ข้อมูลไม่พอโควตาตรงไหน engine รายงานไว้ที่นี่',
    }),
    defineField({
      name: 'lineupGeneratedAt',
      title: 'Lineup Generated · คัดเมื่อ',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'rows',
      title: 'Units · รายการยูนิต',
      type: 'array',
      validation: Rule => Rule.required().min(1).max(19).warning('สูงสุด 19 แถว — ถึง 17 แถวช่องไฟปกติ, 18-19 แถวระบบบีบช่องไฟให้อัตโนมัติ'),
      of: [{
        type: 'object',
        name: 'unitRow',
        title: 'Unit',
        fields: [
          defineField({
            name: 'unitType',
            title: 'Type · ประเภทห้อง',
            type: 'string',
            description: 'เช่น STUDIO, 1BED, 2BED, 3BED (ขึ้นจอเป็นตัวพิมพ์ใหญ่)',
            validation: Rule => Rule.required().max(6).error('ยาวสุด 6 ตัวอักษร (ความกว้างคอลัมน์บนจอ)'),
          }),
          defineField({
            name: 'sizeSqm',
            title: 'Size (sqm) · ขนาด ตร.ม.',
            type: 'number',
            validation: Rule => Rule.required().positive(),
          }),
          defineField({
            name: 'floor',
            title: 'Floor · ชั้น',
            type: 'string',
            options: {
              list: [
                { title: 'LOW', value: 'LOW' },
                { title: 'MID', value: 'MID' },
                { title: 'HIGH', value: 'HIGH' },
              ],
            },
            validation: Rule => Rule.required(),
          }),
          defineField({
            name: 'price',
            title: 'Price (฿) · ราคา บาท',
            type: 'number',
            description: 'ตัวเลขเต็มเป็นบาท — เช่า: บาท/เดือน (18000) · ขาย: ราคาเต็ม (8900000) — จอจัดรูปแบบ K/M ให้เอง',
            validation: Rule => Rule.required().positive(),
          }),
          defineField({
            name: 'updatedAt',
            title: 'Updated · วันที่อัปเดตราคา',
            type: 'date',
            description: 'ขึ้นจอในคอลัมน์ UPDATE (เช่น 29JUL)',
            initialValue: () => new Date().toISOString().slice(0, 10),
            validation: Rule => Rule.required(),
          }),
          defineField({
            name: 'remarks',
            title: 'Remarks · ป้ายกำกับ',
            type: 'array',
            description: 'หลายป้ายจะหมุนสลับกันบนจอ — ไอคอนใส่ให้อัตโนมัติตามคำแรก (SAVE/OWNER/NEW/RARE/BIG)',
            of: [{
              type: 'object',
              name: 'remark',
              fields: [
                defineField({
                  name: 'text',
                  title: 'Text · ข้อความ',
                  type: 'string',
                  description: 'เช่น SAVE 24% · OWNER · BIG ROOM · RARE UNIT',
                  validation: Rule => Rule.required().max(14).error('ยาวสุด 14 ตัวอักษร'),
                }),
                defineField({
                  name: 'tone',
                  title: 'Color · สี',
                  type: 'string',
                  options: {
                    list: [
                      { title: '🟢 Green — ดีล/ส่วนลด', value: 'green' },
                      { title: '🟠 Orange — เตือน/หายาก', value: 'orange' },
                      { title: '⚪ White — คุณสมบัติห้อง', value: 'white' },
                    ],
                  },
                  initialValue: 'green',
                }),
              ],
              preview: {
                select: { text: 'text', tone: 'tone' },
                prepare: ({ text, tone }) => ({
                  title: `${tone === 'green' ? '🟢' : tone === 'orange' ? '🟠' : '⚪'} ${text || '—'}`,
                }),
              },
            }],
          }),
        ],
        preview: {
          select: { unitType: 'unitType', sizeSqm: 'sizeSqm', floor: 'floor', price: 'price' },
          prepare: ({ unitType, sizeSqm, floor, price }) => ({
            title: `${(unitType || '?').toUpperCase()} · ${sizeSqm ?? '?'} sqm · ${floor ?? '?'}`,
            subtitle: price != null ? `฿ ${price.toLocaleString('en-US')}` : '฿ —',
          }),
        },
      }],
    }),
  ],
  preview: {
    // lineup (คัดจาก Unit Boards tool) มาก่อน rows (แถวกรอกมือแบบเดิม) —
    // นับ rows อย่างเดียวทำให้บอร์ดที่มี lineup 19 ห้องขึ้นว่า "0 unit(s)"
    select: { projTitle: 'project.title', mode: 'mode', isActive: 'isActive', rows: 'rows', lineup: 'lineup' },
    prepare: ({ projTitle, mode, isActive, rows, lineup }) => {
      const n = lineup?.length ?? 0
      return {
        title: `${projTitle ?? '—'} — ${mode === 'sale' ? 'FOR SALE' : 'FOR RENT'}`,
        subtitle: `${n || rows?.length || 0} unit(s)${n ? ' · lineup' : rows?.length ? ' · manual' : ''}`
          + `${isActive === false ? '  ·  ⏸ inactive' : ''}`,
      }
    },
  },
})
