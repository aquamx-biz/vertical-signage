import { createElement } from 'react'
import { defineField, defineType } from 'sanity'
import { ExcludedProjectsInput }      from '../components/ExcludedProjectsInput'
import { NoticeSubcategoryInput }     from '../components/NoticeSubcategoryInput'
import { VideoCompressInput }         from '../components/VideoCompressInput'
import { PosterImageAIInput }         from '../components/PosterImageAIInput'
import { MediaUsageSummary }          from '../components/MediaUsageSummary'
import { PlaylistStatusBadge }        from '../components/PlaylistStatusBadge'

// category field removed from media — category now lives on offer.
// schedule (startAt/endAt) removed from media — scheduling consolidated on playlistItem.

export default defineType({
  name: 'media',
  title: 'Media',
  type: 'document',
  fields: [
    // ── Kind ─────────────────────────────────────────────────────────────────
    // promo  → asset + offer link; appears in playlist.
    // notice → building update / alert; queried separately; offer is optional.
    defineField({
      name: 'kind',
      title: 'Kind',
      type: 'string',
      options: {
        list: [
          { title: 'Promo (playlist content)',        value: 'promo' },
          { title: 'Notice (building update / alert)', value: 'notice' },
        ],
        layout: 'radio',
      },
      initialValue: 'promo',
      validation: Rule => Rule.required(),
    }),

    // ── Poster image (notices: upload first, then AI reads it) ────────────────
    defineField({
      name:        'posterImage',
      title:       'Poster Image',
      type:        'image',
      options:     { hotspot: true },
      description: 'For notices: upload the announcement image here, then click 🤖 Read Image with AI to auto-fill the titles below. For promos: fallback thumbnail shown before video loads.',
      components:  { input: PosterImageAIInput },
    }),

    // ── Identity ─────────────────────────────────────────────────────────────
    defineField({
      name:        'title',
      title:       'Title (Thai)',
      type:        'string',
      validation:  Rule => Rule.required(),
      description: 'Main title shown on screen. For notices: auto-filled by 🤖 Read Image with AI above.',
    }),
    defineField({
      name:        'altText',
      title:       'Title (English)',
      type:        'string',
      description: 'English version of the title. For notices: auto-filled by 🤖 Read Image with AI above.',
    }),

    // ── Asset type + files (promo only) ──────────────────────────────────────
    // Two separate fields preserve Sanity CDN image transforms (crop, hotspot) for images.
    defineField({
      name: 'type',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          { title: 'Video (MP4)',       value: 'video' },
          { title: 'Image (JPG / PNG)', value: 'image' },
        ],
        layout: 'radio',
      },
      hidden: ({ document }) => (document as any)?.kind !== 'promo',
      validation: Rule =>
        Rule.custom((value, context) => {
          if ((context.document as any)?.kind === 'promo' && !value)
            return 'Type is required for promo media'
          return true
        }),
    }),
    defineField({
      name: 'videoFile',
      title: 'Video File (MP4)',
      type: 'file',
      options: { accept: 'video/*' },
      components: { input: VideoCompressInput },
      hidden: ({ document }) => {
        const doc = document as any
        return doc?.kind !== 'promo' || doc?.type !== 'video'
      },
      validation: Rule =>
        Rule.custom((value, context) => {
          const doc = context.document as any
          if (doc?.kind === 'promo' && doc?.type === 'video' && !value)
            return 'Video file is required when Type is Video'
          return true
        }),
    }),
    defineField({
      name: 'imageFiles',
      title: 'Image Files (JPG / PNG) — up to 6',
      type: 'array',
      of: [{ type: 'image', options: { accept: 'image/*', hotspot: true } }],
      hidden: ({ document }) => {
        const doc = document as any
        return doc?.kind !== 'promo' || doc?.type !== 'image'
      },
      validation: Rule =>
        Rule.custom((value, context) => {
          const doc = context.document as any
          if (doc?.kind === 'promo' && doc?.type === 'image') {
            const arr = value as any[] | undefined
            if (!arr?.length) return 'Add at least one image'
            if (arr.length > 6) return 'Maximum 6 images allowed'
          }
          return true
        }),
      description: 'Upload 1–6 images. Multiple images play as a slideshow, each shown for the duration below.',
    }),

    // ── Default duration ──────────────────────────────────────────────────────
    // For promo images: per-image duration × image count = total slot duration
    // For notices:      single image, this is the total display duration
    // Resolution: playlistItem.displayDuration ?? media.defaultImageDuration ?? 10
    defineField({
      name: 'defaultImageDuration',
      title: 'Display Duration (seconds)',
      type: 'number',
      initialValue: 10,
      hidden: ({ document }) => {
        const doc = document as any
        return doc?.type === 'video'
      },
      description: 'How long this item is shown on screen. For slideshows, this is per image.',
      validation: Rule => Rule.min(1).max(300),
    }),
    defineField({
      name:        'videoDuration',
      title:       'Video Duration (seconds)',
      type:        'number',
      hidden:      ({ document }) => (document as any)?.type !== 'video',
      description: 'Total length of the video in seconds. Used to calculate playlist total duration.',
      validation:  Rule => Rule.min(1),
    }),

    // ── Legacy single image (hidden — kept for backward compatibility) ─────────
    defineField({
      name: 'imageFile',
      title: 'Image File (legacy)',
      type: 'image',
      options: { accept: 'image/*', hotspot: true },
      hidden: true,
    }),

    // ── Offer link (promo only; optional for notices) ─────────────────────────
    defineField({
      name: 'offer',
      title: 'Offer',
      type: 'reference',
      to: [{ type: 'offer' }],
      weak: true,   // media ถูกสร้างคู่กับ offer draft (ก่อน publish) → ref ต้อง weak · resolve ปกติเมื่อ publish
      hidden: ({ document }) => (document as any)?.kind !== 'promo',
      validation: Rule =>
        Rule.custom((value, context) => {
          if ((context.document as any)?.kind === 'promo' && !value?._ref)
            return 'Offer is required for promo media'
          return true
        }),
      description: 'Required for promo. Links this asset to its offer → provider chain.',
    }),

    // ── Provider (convenience shortcut) ──────────────────────────────────────
    defineField({
      name:        'provider',
      title:       'Provider (convenience)',
      type:        'reference',
      to:          [{ type: 'provider' }],
      options:     { filter: 'providerType == "juristicOffice"' },
      description: 'Optional. Shows Juristic Office providers only. Offer already carries the provider reference.',
    }),

    // ── Scope ─────────────────────────────────────────────────────────────────
    // Notices are always project-specific — scope is hidden for them.
    defineField({
      name: 'scope',
      title: 'Scope',
      type: 'string',
      options: {
        list: [
          { title: 'Global (all projects)', value: 'global' },
          { title: 'Project-specific',      value: 'project' },
        ],
        layout: 'radio',
      },
      initialValue: 'global',
      hidden: ({ document }) => (document as any)?.kind === 'notice',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'projects',
      title: 'Projects',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'project' }], options: { filter: 'isActive == true' } }],
      hidden: ({ document }) => {
        const doc = document as any
        return doc?.kind !== 'notice' && doc?.scope !== 'project'
      },
      description: 'Notices: select exactly one project. Promo: select one or more when Scope is Project-specific.',
      validation: Rule =>
        Rule.custom((value, context) => {
          const doc = context.document as any
          if (doc?.kind === 'notice') {
            if (!value?.length) return 'A notice must target one project'
            if (value.length > 1) return 'A notice can only target one project'
            return true
          }
          if (doc?.scope === 'project' && !value?.length)
            return 'At least one project is required (or change Scope to Global)'
          return true
        }),
    }),

    // ── Active switch ─────────────────────────────────────────────────────────
    defineField({
      name: 'isActive',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
      description:
        'Master switch. Disable to hide this media from BOTH the rotation and the Building Updates panel on the kiosk. ' +
        'The media stays in the library and no playlist slots are deleted — re-enable to show again. ' +
        'Takes effect on the kiosk after the next deploy.',
    }),

    // ── Expiry (notices only) ─────────────────────────────────────────────────
    defineField({
      name:        'expiresAt',
      title:       'Expiration Date',
      type:        'datetime',
      hidden:      ({ document }) => (document as any)?.kind !== 'notice',
      description: 'Optional. Once this date passes, the notice is automatically excluded from the playlist. Leave blank to never expire.',
    }),

    // ── Playlist auto-slot — ADD on publish ───────────────────────────────────
    // Applies to both promo and notice.
    // initialValue=false: opt-in; avoids accidental duplicate slots on re-publish.
    // Mutually exclusive with removeFromPlaylistOnPublish at publish time.
    defineField({
      name: 'addToPlaylistOnPublish',
      title: 'Add to Playlist on Publish',
      type: 'boolean',
      initialValue: false,
      description:
        'Tick this and press Publish to automatically add this media as a new rotation slot in every target project. ' +
        'Targets: Notices and project-scoped promos use the Projects field above; ' +
        'global promos use all active projects minus Excluded Projects below. ' +
        'The checkbox resets to off after a successful publish (one-shot trigger). ' +
        'Takes effect on the kiosk after the next deploy.',
    }),

    // ── Playlist auto-slot — REMOVE on publish ────────────────────────────────
    // Applies to both promo and notice.
    // initialValue=false: opt-in; user must tick deliberately each time.
    // Mutually exclusive with addToPlaylistOnPublish at publish time — publish is blocked if both are set.
    defineField({
      name: 'removeFromPlaylistOnPublish',
      title: 'Remove from Playlist on Publish',
      type: 'boolean',
      initialValue: false,
      description:
        'Tick this and press Publish to automatically delete every existing rotation slot for this media across all target projects. ' +
        'The media itself stays in the library — only the rotation slot documents are removed. ' +
        'The checkbox resets to off after a successful publish (one-shot trigger). ' +
        'Takes effect on the kiosk after the next deploy.',
    }),

    // ── Playlist usage (read-only summary with deep-links) ────────────────────
    defineField({
      name:        'playlistUsage',
      title:       'Used in Playlists',
      type:        'string',
      readOnly:    true,
      components:  { input: MediaUsageSummary },
      description: 'Every playlist slot this media currently occupies, grouped by project. Click "Open Playlist" to jump to that project\'s Playlist view.',
    }),

    // Exclude-based project selector — global promo only.
    // All active projects are implicitly included; this field stores the ones to skip.
    // Custom checklist input: pre-checked = included, unchecked = excluded.
    // Hidden for notices (they always use projects[] directly, not global scope).
    defineField({
      name: 'excludedProjects',
      title: 'Excluded Projects',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'project' }], options: { filter: 'isActive == true' } }],
      hidden: ({ document }) => {
        const doc = document as any
        return !doc?.addToPlaylistOnPublish || doc?.scope !== 'global' || doc?.kind === 'notice'
      },
      description:
        'Global scope only. All active projects are included by default — ' +
        'uncheck any project here to exclude it from the auto-add.',
      components: { input: ExcludedProjectsInput },
    }),

    // ── Notice sub-categories ─────────────────────────────────────────────────
    // Notices bypass the Offer schema, so subCategories must live here directly.
    // Values must match subcategory IDs defined in Category Config for buildingUpdates.
    defineField({
      name: 'subCategories',
      title: 'Sub-categories',
      type: 'array',
      of: [{ type: 'string' }],
      hidden: ({ document }) => (document as any)?.kind !== 'notice',
      description: 'Select which subcategories this notice appears under in Building Updates.',
      components: { input: NoticeSubcategoryInput },
    }),

    // ── Extra metadata ────────────────────────────────────────────────────────
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
  ],

  preview: {
    select: {
      id:          '_id',
      title:       'title',
      kind:        'kind',
      type:        'type',
      isActive:    'isActive',
      videoAsset:  'videoFile.asset.originalFilename',
      imageAsset:  'imageFile.asset.originalFilename',
      offerTitle:  'offer.title_th',
      projectName: 'projects.0.title',
    },
    prepare({ id, title, kind, type, isActive, videoAsset, imageAsset, offerTitle, projectName }) {
      const status = isActive === false ? '  ·  DISABLED' : ''
      // Stable last-6 of the doc _id — same value shown on PlaylistView rows.
      // slice(-6) returns the same chars for draft and published forms of the doc.
      const shortId = id ? `#${(id as string).slice(-6)}` : ''
      // Live playlist status-light in the preview thumbnail slot (see component).
      const media = id ? createElement(PlaylistStatusBadge, { id: id as string }) : undefined
      if (kind === 'notice') {
        const prefix = projectName ? `[${projectName}]` : '[NOTICE]'
        return {
          title:    `${prefix} ${title ?? '(untitled)'}${status}`,
          subtitle: `${shortId}  ·  ${projectName ? `Notice  ·  ${projectName}` : 'Notice (no project linked)'}`,
          media,
        }
      }
      const asset = videoAsset ?? imageAsset ?? '(no file)'
      return {
        title:    `${title ?? '(untitled)'}${status}`,
        subtitle: `${shortId}  ·  [${kind ?? '?'}/${type ?? '—'}]  ·  ${asset}${offerTitle ? `  ·  ${offerTitle}` : ''}`,
        media,
      }
    },
  },
})
