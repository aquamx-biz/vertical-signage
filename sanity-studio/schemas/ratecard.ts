import { defineField, defineType } from 'sanity'
import { RatecardLiveNote } from '../components/RatecardLiveNote'

// TWO kinds of document share this type (kind field):
//   • website    — the singleton "ratecard-sme": the public SME pricing table
//                  at aquamx.biz/ratecard-sme (rows/tiers below).
//   • commission — a shop commission plan (ค่าคอมร้านค้า): what aquamx keeps
//                  from each paid kiosk order in agency mode (รับแทน). Several
//                  plans may exist; one is ticked "default" and applies to
//                  every shop that doesn't point at a plan of its own
//                  (provider.commissionPlan). Read by aquamx-handoff
//                  /api/beam/charge, which stamps the rate on the order at
//                  payment time — editing a plan never changes paid orders.
//
// Website kind — drives the public pricing table at aquamx.biz/ratecard-sme.
// The landing site does NOT read this at runtime; a Netlify build step
// (aquamx-landing/scripts/build-ratecard.js) bakes these values into the
// static HTML on deploy. Publish here → (webhook) → Netlify rebuild → live.
//
// MODEL: the table is ONE list of rows, top to bottom. Columns are the
// `tiers` (packages — headers only). Every attribute is a row, so editing
// any attribute shows all packages side by side in that row's cells:
//   • Value row   → big number + unit (Price, Display time, Frequency)
//   • Mark row    → ✓ / — / custom text per package (Video, Gallery, …)
//   • Heading row → a section divider that spans all columns
// Bilingual text uses { th, en }; numbers are language-neutral.

const localeString = (name: string, title: string, description?: string) =>
  defineField({
    name,
    title,
    type: 'object',
    options: { columns: 2 },
    description,
    fields: [
      defineField({ name: 'th', title: 'Thai',    type: 'string' }),
      defineField({ name: 'en', title: 'English', type: 'string' }),
    ],
  })

export default defineType({
  name: 'ratecard',
  title: 'Rate Card',
  type: 'document',
  fields: [
    defineField({
      name: 'kind',
      title: 'ชนิด · Kind',
      type: 'string',
      options: { list: [
        { title: '🌐 Website rate card (ตารางราคาแพ็กเกจบนเว็บ)', value: 'website' },
        { title: '💼 แผนค่าคอมร้านค้า (Commission plan)',        value: 'commission' },
      ], layout: 'radio' },
      initialValue: 'website',
      readOnly: ({ document }) => !!(document as any)?._createdAt,   // pick once when creating
      description: 'ตั้งได้ตอนสร้างเท่านั้น · เอกสาร ratecard-sme เดิม = Website',
    }),

    // ── Website kind ────────────────────────────────────────────────────────
    // Read-only banner: shows which public page this drives (hardcoded URL).
    defineField({
      name: 'liveNote',
      title: 'Live page',
      type: 'string',
      readOnly: true,
      components: { field: RatecardLiveNote },
      hidden: ({ document }) => document?.kind === 'commission',
    }),
    defineField({
      name: 'title',
      title: 'Internal Title',
      type: 'string',
      initialValue: 'Rate Card — SME',
      readOnly: true,
      description: 'Internal label only — not shown on the website.',
      hidden: ({ document }) => document?.kind === 'commission',
    }),

    // ── Commission kind ─────────────────────────────────────────────────────
    defineField({
      name: 'planName',
      title: 'ชื่อแผน · Plan name',
      type: 'string',
      description: 'เช่น "มาตรฐานร้านค้า 2569", "Jamm pilot" — ขึ้นบนการ์ดใน LINE notify และในออเดอร์',
      hidden: ({ document }) => document?.kind !== 'commission',
      validation: r => r.custom((v, ctx) => ((ctx.document as any)?.kind === 'commission' && !v ? 'ใส่ชื่อแผน' : true)),
    }),
    defineField({
      name: 'isDefault',
      title: '⭐ ใช้เป็นแผนมาตรฐาน (ร้านที่ไม่ได้เลือกแผนเอง)',
      type: 'boolean',
      initialValue: false,
      description: 'ควรติ๊กแค่แผนเดียว · ร้านที่มีดีลพิเศษให้สร้างแผนของร้านนั้นแล้วเลือกที่ provider → แผนค่าคอม',
      hidden: ({ document }) => document?.kind !== 'commission',
    }),
    defineField({
      name: 'basis',
      title: 'ฐานที่ใช้ดูขั้น · Tier basis',
      type: 'string',
      options: { list: [
        { title: 'ยอดสะสมของร้านในเดือนนี้ (ก่อนออเดอร์นี้) — ขายเยอะ % ลดลง',      value: 'monthly' },
        { title: 'ยอดของออเดอร์นั้น — ออเดอร์ใหญ่ % ลดลง',                          value: 'order' },
      ], layout: 'radio' },
      initialValue: 'monthly',
      description: 'ออเดอร์ที่จ่ายหลังยอดข้ามขั้นได้อัตราใหม่ ออเดอร์ก่อนหน้าไม่ย้อน (ไม่มี true-up สิ้นเดือน)',
      hidden: ({ document }) => document?.kind !== 'commission',
    }),
    defineField({
      name: 'commissionTiers',
      title: 'ขั้นบันได · Tiers',
      type: 'array',
      description: 'เรียงจากยอดน้อยไปมาก · แถวแรกควรเริ่มที่ 0 · ระบบเลือกแถวที่ "ตั้งแต่" สูงสุดที่ไม่เกินยอดฐาน · % คิดจากยอดสินค้า (ไม่รวมค่าส่ง) และบวก "บาท/ออเดอร์" ถ้าใส่',
      hidden: ({ document }) => document?.kind !== 'commission',
      validation: r => r.custom((v, ctx) => ((ctx.document as any)?.kind === 'commission' && !(v as any[])?.length ? 'ใส่อย่างน้อย 1 ขั้น' : true)),
      of: [{
        type: 'object',
        name: 'commissionTier',
        fields: [
          defineField({ name: 'from', title: 'ตั้งแต่ (บาท)', type: 'number', initialValue: 0, validation: r => r.required().min(0) }),
          defineField({ name: 'pct',  title: '% ของยอดสินค้า', type: 'number', initialValue: 0, validation: r => r.min(0).max(100).precision(2) }),
          defineField({ name: 'flat', title: 'บาท/ออเดอร์ (เพิ่มจาก %)', type: 'number', validation: r => r.min(0).precision(2) }),
        ],
        preview: {
          select: { from: 'from', pct: 'pct', flat: 'flat' },
          prepare: ({ from, pct, flat }) => ({ title: `ตั้งแต่ ฿${(from ?? 0).toLocaleString('th-TH')}  →  ${pct ?? 0}%${flat ? ` + ฿${flat}/ออเดอร์` : ''}` }),
        },
      }],
    }),
    defineField({
      name: 'minPerOrder',
      title: 'ค่าคอมขั้นต่ำต่อออเดอร์ (บาท)',
      type: 'number',
      validation: r => r.min(0).precision(2),
      description: 'เว้นว่าง = ไม่มีขั้นต่ำ · กันออเดอร์เล็กมากที่ % คิดแล้วได้ไม่กี่บาท',
      hidden: ({ document }) => document?.kind !== 'commission',
    }),
    defineField({
      name: 'feeExcluded',
      title: 'ค่าจัดส่งไม่คิดคอม (เป็นของร้านเต็มจำนวน)',
      type: 'boolean',
      initialValue: true,
      hidden: ({ document }) => document?.kind !== 'commission',
    }),
    defineField({
      name: 'vatIncluded',
      title: 'ตัวเลขนี้รวม VAT และค่าธรรมเนียมชำระเงิน (Beam) แล้ว',
      type: 'boolean',
      initialValue: true,
      description: 'ติ๊ก = ที่หักจากร้านคือเลขนี้เลขเดียว (ใบกำกับภาษีรายเดือนแยกยอด VAT ออกจากยอดนี้) · ไม่ติ๊ก = ระบบบวก VAT 7% ทับตอนคำนวณ',
      hidden: ({ document }) => document?.kind !== 'commission',
    }),
    defineField({
      name: 'effectiveFrom',
      title: 'มีผลตั้งแต่',
      type: 'date',
      hidden: ({ document }) => document?.kind !== 'commission',
    }),
    defineField({
      name: 'planNote',
      title: 'หมายเหตุ / เลขที่ข้อตกลง',
      type: 'text', rows: 2,
      hidden: ({ document }) => document?.kind !== 'commission',
    }),
    defineField({
      name: 'webTerms',
      title: 'เงื่อนไข GP ที่แสดงบนเว็บ · Terms shown on the website',
      type: 'array',
      description: 'ขึ้นเป็นข้อ 1, 2, 3 … ใต้การ์ด GP บนหน้า ratecard-sme (เฉพาะแผนที่ติ๊ก ⭐ มาตรฐาน) · เขียนสั้น ๆ ข้อละบรรทัด · ใส่ **ข้อความ** เพื่อทำตัวหนา',
      hidden: ({ document }) => document?.kind !== 'commission',
      validation: r => r.max(10),
      of: [{
        type: 'object',
        name: 'webTerm',
        options: { columns: 2 },
        fields: [
          defineField({ name: 'th', title: 'Thai',    type: 'text', rows: 2 }),
          defineField({ name: 'en', title: 'English', type: 'text', rows: 2 }),
        ],
        preview: { select: { th: 'th' }, prepare: ({ th }) => ({ title: (th || '').replace(/\*\*/g, '') }) },
      }],
    }),

    // ── Columns: the packages (headers only) ───────────────────────────────
    defineField({
      name: 'tiers',
      title: 'Packages (columns)',
      type: 'array',
      description: 'Each entry is one pricing column, left to right. Usually 4. All prices/values live in the Rows below — this is just the column header.',
      hidden: ({ document }) => document?.kind === 'commission',
      validation: Rule => Rule.custom((v, ctx) => ((ctx.document as any)?.kind === 'commission' ? true : (!(v as any[])?.length ? 'Required' : (v as any[]).length > 6 ? 'Max 6' : true))),
      of: [{
        type: 'object',
        name: 'tier',
        fields: [
          defineField({ name: 'name', title: 'Package Name', type: 'string', validation: Rule => Rule.required(), description: 'e.g. Starter, Booster, Pro, Premium (shown the same in both languages).' }),
          defineField({ name: 'popular', title: '★ Most Popular', type: 'boolean', initialValue: false, description: 'Highlights this column with the orange "Most Popular" badge.' }),
        ],
        preview: {
          select: { name: 'name', popular: 'popular' },
          prepare: ({ name, popular }) => ({ title: `${popular ? '★ ' : ''}${name ?? '(unnamed)'}` }),
        },
      }],
    }),

    // ── Rows: the whole table body, top to bottom ──────────────────────────
    defineField({
      name: 'rows',
      title: 'Rows (the table, top to bottom)',
      type: 'array',
      description: 'One entry per table row, in display order. Each row has one cell per package (same order as the columns above). Add a Value row for numbers (price, seconds…), a Mark row for ✓/—/×N, or a Section heading to group rows.',
      hidden: ({ document }) => document?.kind === 'commission',
      of: [
        // ── Value row: big number + unit (Price, Display time, Frequency) ───
        {
          type: 'object',
          name: 'valueRow',
          title: 'Value row (big number)',
          fields: [
            localeString('label', 'Row label'),
            localeString('unit', 'Unit / sub-line', 'Small text under each number. Type {n} to insert that cell\'s "sub number" (e.g. billed/month → "เรียกเก็บ ฿{n}/เดือน"). For a constant unit like "seconds" just type it — leave the cell sub-number blank.'),
            defineField({
              name: 'cells',
              title: 'Cells (one per package, in column order)',
              type: 'array',
              validation: Rule => Rule.max(6),
              of: [{
                type: 'object',
                name: 'valueCell',
                fields: [
                  defineField({ name: 'big', title: 'Big number', type: 'string', description: 'The large value shown, e.g. "฿55", "8", "25". Type it exactly as it should appear.' }),
                  defineField({ name: 'sub', title: 'Sub-number ({n})', type: 'number', description: 'Optional. Fills {n} in the Unit above (e.g. billed/month = 220). Leave blank for rows whose unit is constant.' }),
                ],
                preview: {
                  select: { big: 'big', sub: 'sub' },
                  prepare: ({ big, sub }) => ({ title: big ?? '(empty)', subtitle: sub != null ? `{n}=${sub}` : '' }),
                },
              }],
            }),
          ],
          preview: {
            select: { th: 'label.th', en: 'label.en', cells: 'cells' },
            prepare: ({ th, en, cells }) => ({
              title: `📊  ${th || en || '(value row)'}`,
              subtitle: (cells || []).map((c: any) => c?.big ?? '·').join('   '),
            }),
          },
        },

        // ── Mark row: ✓ / — / custom text per package ──────────────────────
        {
          type: 'object',
          name: 'markRow',
          title: 'Mark row (✓ / — / ×N)',
          fields: [
            localeString('label', 'Row label'),
            defineField({
              name: 'cells',
              title: 'Cells (one per package, in column order)',
              type: 'array',
              validation: Rule => Rule.max(6),
              description: 'One cell per package. ✓ = included, — = not included, or type a value like "×1" / "5 images".',
              of: [{
                type: 'object',
                name: 'cell',
                fields: [
                  defineField({
                    name: 'type',
                    title: 'Type',
                    type: 'string',
                    initialValue: 'check',
                    options: { list: [
                      { title: '✓ Included',     value: 'check' },
                      { title: '— Not included', value: 'cross' },
                      { title: 'Custom text (e.g. ×1)', value: 'text' },
                    ], layout: 'radio' },
                  }),
                  defineField({
                    name: 'text',
                    title: 'Custom text',
                    type: 'string',
                    hidden: ({ parent }) => (parent as any)?.type !== 'text',
                    description: 'Shown only when Type = Custom text. e.g. "×1", "5 images".',
                  }),
                ],
                preview: {
                  select: { type: 'type', text: 'text' },
                  prepare: ({ type, text }) => ({
                    title: type === 'text' ? (text || '(empty)') : type === 'cross' ? '—' : '✓',
                  }),
                },
              }],
            }),
          ],
          preview: {
            select: { th: 'label.th', en: 'label.en', cells: 'cells' },
            prepare: ({ th, en, cells }) => ({
              title: th || en || '(mark row)',
              subtitle: (cells || []).map((c: any) => c?.type === 'text' ? (c.text || '·') : c?.type === 'cross' ? '—' : '✓').join('   '),
            }),
          },
        },

        // ── Section heading: divider spanning all columns ──────────────────
        {
          type: 'object',
          name: 'heading',
          title: 'Section heading',
          fields: [ localeString('label', 'Heading') ],
          preview: {
            select: { th: 'label.th', en: 'label.en' },
            prepare: ({ th, en }) => ({ title: `▸  ${th || en || '(heading)'}` }),
          },
        },
      ],
    }),

    // ── Cumulative discount grid ───────────────────────────────────────────
    // TWO ladders, never nine hand-typed cells: screens run across, prepaid
    // months run down, and the page prints each cell as the SUM of the two
    // steps. Edit a step and the whole grid rewrites itself, so the numbers
    // can never disagree with each other. Leave the labels blank to take the
    // built-in Thai/English wording.
    defineField({
      name: 'discountGrid',
      title: 'ตารางส่วนลดสะสม · Cumulative discounts',
      type: 'object',
      description: 'ช่องในตารางคือผลบวกของสองบันได — ไม่ต้องกรอกทีละช่อง',
      options: { collapsible: true, collapsed: false },
      hidden: ({ document }) => document?.kind === 'commission',
      fields: [
        defineField({ name: 'enabled', title: 'แสดงตารางนี้บนเว็บ', type: 'boolean', initialValue: true }),
        localeString('title',      'หัวข้อ'),
        localeString('note',       'คำอธิบายข้างหัวข้อ'),
        localeString('colLabel',   'ป้ายแกนนอน (คอลัมน์)'),
        localeString('rowLabel',   'ป้ายแกนตั้ง (แถว)'),
        localeString('unitScreen', 'หน่วยของคอลัมน์ (เช่น จอ)'),
        localeString('unitMonth',  'หน่วยของแถว (เช่น เดือน)'),
        localeString('maxLabel',   'ป้ายกำกับช่องสูงสุด'),
        localeString('prefix',     'คำนำหน้าหัวคอลัมน์/แถว (เช่น Pro)', 'ขึ้นก่อนตัวเลข: "Pro 1 จอ", "Pro 3 เดือน" · เว้นว่าง = ไม่ใส่'),
        localeString('footnote',   'เชิงอรรถ * ใต้ตาราง', 'ใส่แล้วหัวคอลัมน์จำนวนจอจะมี * และข้อความนี้ขึ้นใต้ตาราง'),
        defineField({
          name: 'screens',
          title: 'บันไดจำนวนจอ — คอลัมน์ ซ้าย → ขวา',
          type: 'array',
          validation: Rule => Rule.max(5),
          of: [{
            type: 'object',
            name: 'screenStep',
            fields: [
              defineField({ name: 'n',   title: 'จำนวนจอ',  type: 'number', validation: r => r.required().min(1) }),
              defineField({ name: 'pct', title: 'ส่วนลด %', type: 'number', initialValue: 0, validation: r => r.min(0).max(100) }),
            ],
            preview: {
              select: { n: 'n', pct: 'pct' },
              prepare: ({ n, pct }) => ({ title: `${n ?? '?'} จอ  →  ${pct ?? 0}%` }),
            },
          }],
        }),
        defineField({
          name: 'months',
          title: 'บันไดจ่ายล่วงหน้า — แถว บน → ล่าง',
          type: 'array',
          validation: Rule => Rule.max(5),
          of: [{
            type: 'object',
            name: 'monthStep',
            fields: [
              defineField({ name: 'n',   title: 'จำนวนเดือน', type: 'number', validation: r => r.required().min(1) }),
              defineField({ name: 'pct', title: 'ส่วนลด %',   type: 'number', initialValue: 0, validation: r => r.min(0).max(100) }),
            ],
            preview: {
              select: { n: 'n', pct: 'pct' },
              prepare: ({ n, pct }) => ({ title: `${n ?? '?'} เดือน  →  ${pct ?? 0}%` }),
            },
          }],
        }),
      ],
    }),

    // ── The same card as a picture ─────────────────────────────────────────
    // For LINE, e-mail, and anywhere a link will not do. It does NOT follow
    // the rows above: change a number there and this image still shows the old
    // one, which is worse than having no image at all. Whoever edits the table
    // re-exports and re-uploads here in the same sitting.
    defineField({
      name: 'infographic',
      title: 'อินโฟกราฟิก · Infographic (ไทย)',
      type: 'image',
      options: { hotspot: false },
      description: '⚠️ ไม่อัปเดตตามตารางข้างบนอัตโนมัติ — แก้ตัวเลขในตารางแล้วต้อง export รูปใหม่มาอัปทับที่นี่ด้วย ไม่งั้นเลขในรูปกับในระบบจะไม่ตรงกัน',
      hidden: ({ document }) => document?.kind === 'commission',
    }),
    defineField({
      name: 'infographicEn',
      title: 'อินโฟกราฟิก · Infographic (English)',
      type: 'image',
      options: { hotspot: false },
      description: 'ฉบับภาษาอังกฤษ · เว้นว่างได้ถ้ายังไม่มี',
      hidden: ({ document }) => document?.kind === 'commission',
    }),
  ],

  preview: {
    select: { kind: 'kind', planName: 'planName', isDefault: 'isDefault', tiers: 'commissionTiers', basis: 'basis' },
    prepare: ({ kind, planName, isDefault, tiers, basis }) => kind === 'commission'
      ? { title: `${isDefault ? '⭐ ' : ''}${planName || '(แผนค่าคอมไม่มีชื่อ)'}`,
          subtitle: `${basis === 'order' ? 'ต่อออเดอร์' : 'สะสมรายเดือน'} · ${(tiers || []).map((t: any) => `฿${t?.from ?? 0}→${t?.pct ?? 0}%`).join(' · ') || 'ยังไม่มีขั้น'}` }
      : { title: 'Rate Card — SME' },
  },
})
