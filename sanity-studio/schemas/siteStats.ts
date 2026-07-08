import { defineField, defineType } from 'sanity'

// Singleton — _id is always "siteStats".
// Drives the "เครือข่ายที่กำลังเติบโต" stat strip on the aquamx.biz homepage.
// The landing site does NOT read this at runtime; a Netlify build step
// (aquamx-landing/scripts/build-stats.js) bakes these values into the static
// HTML on deploy. Publish here → (webhook) → Netlify rebuild → live.
//
// Values are stored as strings so the marketing format is preserved exactly
// ("12+", "8,400", "100%"). The homepage runs a count-up animation that parses
// the number and re-adds the prefix/suffix — so keep the human format here.

export default defineType({
  name: 'siteStats',
  title: 'Site Stats (หน้าแรก)',
  type: 'document',
  fields: [
    defineField({
      name: 'buildings',
      title: 'อาคารในเครือข่าย',
      type: 'string',
      description: 'เช่น "12+" — คงรูปแบบไว้ได้ ระบบทำ count-up ให้เอง',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'units',
      title: 'ห้องชุดที่เข้าถึง',
      type: 'string',
      description: 'เช่น "8,400" — ใส่ comma ได้',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'residents',
      title: 'ผู้พักอาศัย',
      type: 'string',
      description: 'เช่น "18,000+"',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'impressions',
      title: 'Impressions / เดือน',
      type: 'string',
      description: 'เช่น "2.4M" — รองรับทศนิยม',
      validation: Rule => Rule.required(),
    }),
  ],
  preview: {
    select: { buildings: 'buildings', units: 'units', residents: 'residents', impressions: 'impressions' },
    prepare: ({ buildings, units, residents, impressions }) => ({
      title: 'Site Stats (หน้าแรก)',
      subtitle: `${buildings || '—'} · ${units || '—'} · ${residents || '—'} · ${impressions || '—'}`,
    }),
  },
})
