import { defineField, defineType } from 'sanity'

// Screen health status for digital-signage players.
// One document per screen (deterministic _id: "screenStatus.<screenName>").
// Populated automatically by the Gmail→Sanity sync (Cowork scheduled task),
// which parses Yodeck offline / "came back online" alert emails.
// Read-only in practice — the "Screen Health" tool renders these documents.

export default defineType({
  name: 'screenStatus',
  title: 'Screen Status',
  type: 'document',
  fields: [
    defineField({
      name: 'screenName',
      title: 'Screen / Player',
      type: 'string',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      description: 'down = ยังดับอยู่ต้องไปดู · stale = ดับล่าสุดแต่เงียบไป · ok = ปกติ/หายเอง',
      options: {
        list: [
          { title: '🔴 Down (ยังดับอยู่)', value: 'down' },
          { title: '🟡 Stale (ไม่แน่ใจ)', value: 'stale' },
          { title: '🟢 OK (ปกติ/หายเอง)', value: 'ok' },
        ],
      },
    }),
    defineField({ name: 'downSince',    title: 'Down Since',      type: 'datetime' }),
    defineField({ name: 'lastEventType', title: 'Last Event Type', type: 'string', description: 'offline | online' }),
    defineField({ name: 'lastEventAt',  title: 'Last Event At',   type: 'datetime' }),
    defineField({ name: 'incidents',    title: 'Incidents (window)', type: 'number' }),
    defineField({ name: 'offlineAlerts', title: 'Offline Alert Emails', type: 'number' }),
    defineField({ name: 'windowDays',   title: 'Window (days)',   type: 'number' }),
    defineField({ name: 'source',       title: 'Source',          type: 'string', initialValue: 'yodeck' }),
    defineField({ name: 'syncedAt',     title: 'Last Synced',     type: 'datetime' }),
  ],
  orderings: [
    { title: 'Status (down first)', name: 'statusDesc', by: [{ field: 'status', direction: 'asc' }, { field: 'incidents', direction: 'desc' }] },
    { title: 'Most incidents',      name: 'incidentsDesc', by: [{ field: 'incidents', direction: 'desc' }] },
  ],
  preview: {
    select: { name: 'screenName', status: 'status', incidents: 'incidents', downSince: 'downSince' },
    prepare: ({ name, status, incidents, downSince }) => {
      const dot = status === 'down' ? '🔴' : status === 'stale' ? '🟡' : '🟢'
      const sub = status === 'down' && downSince
        ? `ดับตั้งแต่ ${new Date(downSince).toLocaleString('th-TH')}`
        : `${incidents ?? 0} ครั้ง`
      return { title: `${dot} ${name || '—'}`, subtitle: sub }
    },
  },
})
