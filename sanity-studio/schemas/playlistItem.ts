import { defineField, defineType } from 'sanity'

// Must stay in sync with offer.ts, media.ts, provider.ts, and categoryConfig IDs.
const CATEGORY_LIST = [
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
  name: 'playlistItem',
  title: 'Playlist Item',
  type: 'document',
  fields: [
    // ── Project scope ─────────────────────────────────────────────────────────
    defineField({
      name: 'project',
      title: 'Project',
      type: 'reference',
      to: [{ type: 'project' }],
      validation: Rule => Rule.required(),
      options: { filter: 'isActive == true' },
    }),

    // ── Play order ────────────────────────────────────────────────────────────
    defineField({
      name: 'order',
      title: 'Play Order',
      type: 'number',
      validation: Rule => Rule.required().min(1),
    }),

    // ── Slot switch ───────────────────────────────────────────────────────────
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
      description: 'Uncheck to hide this slot without deleting it.',
    }),

    // ── Media reference ───────────────────────────────────────────────────────
    // The SAME media document may appear on multiple slots (one PlaylistItem per slot).
    // Only promo media scoped to this project is shown in the picker.
    defineField({
      name: 'media',
      title: 'Media',
      type: 'reference',
      to: [{ type: 'media' }],
      validation: Rule => Rule.required(),
      description: 'Only enabled promo media scoped to this project appears in the picker.',
      options: {
        filter: ({ document }: { document: Record<string, any> }) => {
          const projectRef = document?.project?._ref
          if (!projectRef) return { filter: 'enabled == true && kind == "promo"' }
          return {
            filter:
              'isActive == true && kind == "promo" && (scope == "global" || $projectId in projects[]._ref)',
            params: { projectId: projectRef },
          }
        },
      },
    }),

    // ── Slot schedule (independent of Media schedule) ─────────────────────────
    // A slot is visible only when BOTH schedules pass AND both enabled flags are true:
    //   playlistItem.enabled && playlistItem schedule passes
    //   && media.enabled && media schedule passes
    defineField({
      name: 'startAt',
      title: 'Slot Start At',
      type: 'datetime',
      description: 'Optional — activate this slot from this date/time onward.',
    }),
    defineField({
      name: 'endAt',
      title: 'Slot End At',
      type: 'datetime',
      description: 'Optional — deactivate this slot after this date/time.',
      validation: Rule =>
        Rule.custom((value, context) => {
          const { startAt } = context.parent as { startAt?: string }
          if (value && startAt && value <= startAt) return 'Slot End At must be after Slot Start At'
          return true
        }),
    }),

    // ── Display duration (image slots only) ───────────────────────────────────
    // Resolution: playlistItem.displayDuration ?? media.defaultImageDuration ?? 10
    // Ignored for video slots (videos use their intrinsic duration).
    defineField({
      name: 'displayDuration',
      title: 'Display Duration (seconds)',
      type: 'number',
      description: 'Image slots only. Overrides the media default for this slot. Leave blank to inherit.',
      validation: Rule => Rule.min(1).max(300),
    }),

    // ── Touch-to-Explore routing ──────────────────────────────────────────────
    // touchExploreCategory overrides media.category for kiosk navigation.
    // If blank, kiosk falls back to media.category.
    defineField({
      name: 'touchExploreCategory',
      title: 'Touch to Explore — Category',
      type: 'string',
      options: { list: CATEGORY_LIST },
      description: 'Overrides media.category for kiosk routing. Leave blank to use media.category.',
    }),

    // If set, kiosk navigates to this provider's page on tap (shows all their offers).
    defineField({
      name: 'touchExploreDefaultProvider',
      title: 'Touch to Explore — Default Provider',
      type: 'reference',
      to: [{ type: 'provider' }],
      description: 'Optional. Kiosk navigates directly to this provider on tap instead of showing the category list.',
    }),

    // ── Internal notes ────────────────────────────────────────────────────────
    defineField({
      name: 'notes',
      title: 'Notes (internal)',
      type: 'string',
      description: 'Not shown in kiosk. For editorial reference only.',
    }),
  ],

  orderings: [{
    title: 'Play Order',
    name: 'orderAsc',
    by: [{ field: 'order', direction: 'asc' }],
  }],

  preview: {
    select: {
      mediaTitle:    'media.title',
      mediaType:     'media.type',
      projectCode:   'project.code.current',
      order:         'order',
      enabled:       'enabled',
      touchCategory: 'touchExploreCategory',
    },
    prepare({ mediaTitle, mediaType, projectCode, order, enabled, touchCategory }) {
      const status   = enabled === false ? '  ·  DISABLED' : ''
      const category = touchCategory ?? '—'
      return {
        title:    `${order ?? '?'}. ${mediaTitle ?? '(no media)'}${status}`,
        subtitle: `[${projectCode ?? '?'}]  ${mediaType ?? '?'}  ·  ${category}`,
      }
    },
  },
})
