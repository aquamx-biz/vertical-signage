import { defineField, defineType } from 'sanity'

/**
 * Nearby Place — a landmark shown on the website next to BTS/MRT stations
 * (/condo station rows and station card) and on building pages.
 * One document per place. Distances are not stored: the website works them
 * out from `location` and the station / projectSite coordinates.
 */
const CATEGORIES = [
  { title: 'Shopping mall',               value: 'mall' },
  { title: 'Office building',             value: 'office' },
  { title: 'International school',        value: 'school' },
  { title: 'Hospital',                    value: 'hospital' },
  { title: 'MICHELIN-starred restaurant', value: 'michelin' },
  { title: 'Park',                        value: 'park' },
]

const notMichelin = ({ document }: { document?: any }) => document?.category !== 'michelin'

export default defineType({
  name:  'nearbyPlace',
  title: 'Nearby Place',
  type:  'document',

  fields: [
    defineField({
      name: 'name', title: 'Name (EN)', type: 'string',
      description: 'Name shown on the website, e.g. EmQuartier, Samitivej Sukhumvit Hospital.',
      validation: Rule => Rule.required(),
    }),
    defineField({ name: 'nameTh', title: 'Name (TH)', type: 'string' }),
    defineField({
      name: 'category', title: 'Category', type: 'string',
      options: { list: CATEGORIES, layout: 'radio' },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'location', title: 'Location', type: 'geopoint',
      description: 'Pin of the place. Used to work out the distance from each station and building.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'googleMapsUrl', title: 'Google Maps link', type: 'url',
      description: 'Optional. Leave empty and the website links to a Google Maps search for the name.',
    }),
    defineField({
      name: 'michelinStars', title: 'MICHELIN Stars', type: 'number',
      options: { list: [1, 2, 3] },
      hidden: notMichelin,
    }),
    defineField({
      name: 'michelinYear', title: 'MICHELIN Guide edition', type: 'number',
      description: 'Year of the guide the stars come from, e.g. 2027 for MICHELIN Guide Thailand 2027.',
      hidden: notMichelin,
    }),
    defineField({
      name: 'michelinUrl', title: 'MICHELIN Guide page', type: 'url',
      hidden: notMichelin,
    }),
    defineField({
      name: 'source', title: 'Source', type: 'string',
      description: 'Where the name and pin came from, and when it was checked (e.g. "OpenStreetMap, checked 22 Nov 2026").',
    }),
    defineField({
      name: 'active', title: 'Show on website', type: 'boolean',
      description: 'Turn off if the place has closed or lost its MICHELIN Stars.',
      initialValue: true,
    }),
  ],

  orderings: [
    { title: 'Category, then name', name: 'categoryName', by: [{ field: 'category', direction: 'asc' }, { field: 'name', direction: 'asc' }] },
  ],

  preview: {
    select: { title: 'name', category: 'category', stars: 'michelinStars', active: 'active' },
    prepare({ title, category, stars, active }) {
      const cat   = CATEGORIES.find(c => c.value === category)?.title ?? ''
      const star  = stars ? ' · ' + '★'.repeat(stars) : ''
      const off   = active === false ? ' · hidden' : ''
      return { title, subtitle: cat + star + off }
    },
  },
})
