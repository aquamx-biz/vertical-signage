import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'buildingUpdate',
  title: 'Building Update',
  type: 'document',
  fields: [
    // ── Project scope ──────────────────────────────────────────────────────
    defineField({
      name: 'project',
      title: 'Project',
      type: 'reference',
      to: [{ type: 'project' }],
      validation: Rule => Rule.required(),
      options: { filter: 'isActive == true' },
    }),

    defineField({ name: 'title',    title: 'Title',                type: 'string', validation: Rule => Rule.required() }),
    defineField({ name: 'subtitle', title: 'Subtitle (date/period)', type: 'string' }),
    defineField({ name: 'slug',     title: 'Slug', type: 'slug', options: { source: 'title' }, validation: Rule => Rule.required() }),
    defineField({ name: 'icon',     title: 'Icon (emoji)',         type: 'string' }),
    defineField({ name: 'bgColor',  title: 'Background Color (hex)', type: 'string', description: 'e.g. #141A08' }),
    defineField({ name: 'description', title: 'Description', type: 'text', rows: 4 }),
    defineField({
      name: 'subCategoryIds', title: 'Sub-Categories', type: 'array',
      of: [{ type: 'string' }],
      options: { list: [
        { title: 'Most Recent', value: 'most_recent' },
        { title: 'Alert',       value: 'alert' },
      ]},
    }),
    defineField({ name: 'publishedAt', title: 'Published At', type: 'datetime', initialValue: () => new Date().toISOString() }),
  ],
  orderings: [{
    title: 'Published (newest first)',
    name: 'publishedAtDesc',
    by: [{ field: 'publishedAt', direction: 'desc' }],
  }],
  preview: {
    select: { title: 'title', subtitle: 'subtitle' },
  },
})
