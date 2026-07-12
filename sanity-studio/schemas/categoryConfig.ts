import { defineField, defineType } from 'sanity'

// Global singleton — _id is always "categoryConfig-global".
// All projects share one category configuration; no project reference needed.
// Kiosk reads label per category for display; subcategories[] render as stacked
// section headings on the category page (array order = display order) —
// defaultSubcategoryId names the section that catches offers with no/unknown subcategory.
// Category IDs must match enum: food, groceries, services, forRent, forSale, buildingUpdates.

const CATEGORY_ID_LIST = [
  { title: 'Food',             value: 'food' },
  { title: 'Groceries',        value: 'groceries' },
  { title: 'Services',         value: 'services' },
  { title: 'Health & Beauty',  value: 'healthBeauty' },
  { title: 'Leisure & Travel', value: 'leisureTravel' },
  { title: 'Shopping',         value: 'shopping' },
  { title: 'Education',        value: 'education' },
  { title: 'Events',           value: 'events' },
  { title: 'For Rent',         value: 'forRent' },
  { title: 'For Sale',         value: 'forSale' },
  { title: 'Building Updates', value: 'buildingUpdates' },
]

export default defineType({
  name: 'categoryConfig',
  title: 'Category Config',
  type: 'document',
  fields: [
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{
        type: 'object',
        name: 'categoryEntry',
        fields: [
          defineField({
            name: 'id',
            title: 'Category ID',
            type: 'string',
            options: { list: CATEGORY_ID_LIST },
            description: 'Must match the category enum used across all schemas.',
            validation: Rule => Rule.required(),
          }),
          defineField({
            name: 'label',
            title: 'Category Label',
            type: 'object',
            fields: [
              defineField({ name: 'en', title: 'English', type: 'string' }),
              defineField({ name: 'th', title: 'Thai',    type: 'string' }),
            ],
          }),
          // ctaItem (per-category CTA button label) removed: the player renders
          // CTA labels from the offer level (offer.ctaLabel → ctaLabelFor matrix
          // → generic) and never reads this field — filling it did nothing.
          defineField({
            name: 'defaultSubcategoryId',
            title: 'หมวดย่อยสำรอง (Fallback Sub-Category)',
            type: 'string',
            // The player routes "orphan" offers (no subcategory chosen, or an
            // unknown id) into this section — it is NOT a default tab; the
            // category page has no tabs, it renders all subcategories as
            // stacked section headings.
            description: 'offer ที่ไม่ได้เลือกหมวดย่อย (หรือเลือกอันที่ไม่มีจริง) จะไปแสดงใต้หัวข้อนี้ — ใส่ ID ของหมวดย่อยด้านล่าง 1 อัน เช่น recommended',
          }),
          defineField({
            name: 'subcategories',
            title: 'Sub-Categories',
            type: 'array',
            of: [{
              type: 'object',
              name: 'subcategoryEntry',
              fields: [
                defineField({
                  name: 'id',
                  title: 'ID',
                  type: 'string',
                  description: 'Kebab-case, unique within category (e.g. "dine-in").',
                  validation: Rule => Rule.required(),
                }),
                defineField({
                  name: 'label',
                  title: 'Label',
                  type: 'object',
                  fields: [
                    defineField({ name: 'en', title: 'English', type: 'string', validation: Rule => Rule.required() }),
                    defineField({ name: 'th', title: 'Thai',    type: 'string', validation: Rule => Rule.required() }),
                  ],
                }),
              ],
              preview: { select: { title: 'label.en', subtitle: 'id' } },
            }],
            description: 'หัวข้อย่อยบนหน้าหมวด (จอแสดงเป็นหัวข้อเรียงลงมา ไม่ใช่แท็บ) — ลำดับใน list = ลำดับบนจอ',
          }),
        ],
        preview: { select: { title: 'label.en', subtitle: 'id' } },
      }],
    }),
  ],

  preview: {
    select: { id: '_id' },
    prepare() {
      return { title: 'Global Category Config' }
    },
  },
})
