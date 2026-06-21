import { defineField, defineType } from 'sanity'

// Global singleton — _id is always "categoryConfig-global".
// All projects share one category configuration; no project reference needed.
// Kiosk reads label/ctaItem per category for display; reads subcategories[] for filter tabs.
// subcategories are plain display strings (e.g. "Dine-in") — order = display order.
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
          defineField({
            name: 'ctaItem',
            title: 'CTA Button Label',
            type: 'object',
            fields: [
              defineField({ name: 'en', title: 'English', type: 'string' }),
              defineField({ name: 'th', title: 'Thai',    type: 'string' }),
            ],
          }),
          defineField({
            name: 'defaultSubcategoryId',
            title: 'Default Sub-Category ID',
            type: 'string',
            description: 'Must match one of the subcategory IDs below. Shown as active tab on load.',
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
            description: 'Filter tabs. Array order = display order.',
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
