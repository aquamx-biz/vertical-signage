import { defineField, defineType } from 'sanity'
import { createRetrieveFromPartyInput } from '../components/RetrieveFromPartyInput'
import { createProviderNameInput }      from '../components/ProviderNameInput'
import { createTranslateInput }         from '../components/TranslateInput'

const NameThInput = createProviderNameInput('th')
const NameEnInput = createProviderNameInput('en')

// Must stay in sync with offer.ts, media.ts, playlistItem.ts, categoryConfig.ts
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

// Providers are mostly GLOBAL — category and sub-category filtering lives on Offer,
// and media assets belong to individual Offer documents (media.offer reference).
// EXCEPTION: juristic-office providers carry a single `projectSite` reference so
// notices and AI tagging can route to the correct building's kiosk project.

export default defineType({
  name: 'provider',
  title: 'Provider',
  type: 'document',
  fields: [
    // ── Party link (CRM) ──────────────────────────────────────────────────────
    defineField({
      name:        'party',
      title:       'Linked Party (CRM)',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'Link to the Party record in CRM. Use ↙ buttons below to pull contact info.',
    }),

    // ── Classification ────────────────────────────────────────────────────────
    defineField({
      name: 'providerType',
      title: 'Provider Type',
      type: 'string',
      options: {
        list: [
          { title: 'Shop / Restaurant (ร้านค้า / ร้านอาหาร)', value: 'shop' },
          { title: 'Service / Business (บริการ / ธุรกิจ)',     value: 'service' },
          { title: 'Unit Owner or Agent (เจ้าของ / นายหน้า)',  value: 'unitOwnerOrAgent' },
          { title: 'Juristic Office (นิติบุคคลอาคาร)',         value: 'juristicOffice' },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    // ── Juristic-only: which building / property this office serves ───────────
    // Used by the AI Notice Reader to scope provider candidates after the AI
    // picks a project. Hidden for non-juristic providers, which stay global.
    defineField({
      name:        'projectSite',
      title:       'Project Site (Juristic Office only)',
      type:        'reference',
      to:          [{ type: 'projectSite' }],
      hidden:      ({ document }) => (document as any)?.providerType !== 'juristicOffice',
      description: 'The building this juristic office serves. Required so notices linked to this provider can be auto-routed to the correct kiosk project. Leave blank for non-juristic providers.',
    }),

    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: { list: CATEGORY_LIST },
      validation: Rule => Rule.required(),
      description: 'Primary category for this provider.',
    }),

    // ── Identity ─────────────────────────────────────────────────────────────
    defineField({
      name:        'name_th',
      title:       'Name (Thai)',
      type:        'string',
      description: 'Name shown in media. Can differ from the legal entity name (e.g. shop name).',
      validation:  Rule => Rule.required(),
      components:  { input: NameThInput },
    }),
    defineField({
      name:        'name_en',
      title:       'Name (English)',
      type:        'string',
      description: 'Enter the name to be displayed in media. This can differ from the provider\'s legal entity name (e.g. shop name).',
      components:  { input: NameEnInput },
    }),
    defineField({
      name:  'slug',
      title: 'Slug',
      type:  'slug',
      options: {
        // Prefer English name for the slug — produces clean ASCII URLs.
        // Falls back to Thai name only if English is empty.
        source: (doc: any) => doc.name_en || doc.name_th || '',
        slugify: (input: string) =>
          input
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')   // strip non-ASCII / special chars
            .trim()
            .replace(/[\s_]+/g, '-')    // spaces → hyphens
            .replace(/-+/g, '-')        // collapse multiple hyphens
            .replace(/^-+|-+$/g, ''),   // trim leading/trailing hyphens
      },
      validation: Rule => Rule.required(),
      description: 'Used in kiosk deep link /m/p/{slug}. Auto-generated from English name — always ASCII-safe.',
    }),
    defineField({
      name: 'status',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
      description: 'Disable to hide this provider from all kiosk views.',
    }),
    defineField({
      name: 'displayName',
      title: 'Display Name Language',
      type: 'string',
      options: {
        list: [
          { title: 'Thai only',      value: 'th' },
          { title: 'English only',   value: 'en' },
          { title: 'Both (TH / EN)', value: 'both' },
        ],
        layout: 'radio',
      },
      initialValue: 'th',
    }),

    // ── Branding ─────────────────────────────────────────────────────────────
    defineField({ name: 'logo',       title: 'Logo',        type: 'image', options: { hotspot: true } }),
    defineField({ name: 'coverImage', title: 'Cover Image', type: 'image', options: { hotspot: true } }),

    // ── Description ───────────────────────────────────────────────────────────
    defineField({ name: 'description_th', title: 'Description (Thai)',    type: 'text', rows: 3,
      components: { input: createTranslateInput({ sourceField: 'description_en', sourceLang: 'English', targetLang: 'Thai', buttonLabel: '✨ Translate from English' }) },
    }),
    defineField({ name: 'description_en', title: 'Description (English)', type: 'text', rows: 3,
      components: { input: createTranslateInput({ sourceField: 'description_th', sourceLang: 'Thai', targetLang: 'English', buttonLabel: '✨ Translate from Thai' }) },
    }),

    // ── Contact & Location ────────────────────────────────────────────────────
    defineField({ name: 'locationText', title: 'Location',     type: 'string', description: 'e.g. G Floor, Zone A' }),
    defineField({ name: 'mapUrl',       title: 'Map URL',       type: 'url' }),
    defineField({ name: 'phone',   title: 'Phone',    type: 'string', components: { input: createRetrieveFromPartyInput('phone')   } }),
    defineField({ name: 'lineId',  title: 'LINE ID',  type: 'string', components: { input: createRetrieveFromPartyInput('lineId')  } }),
    defineField({ name: 'website', title: 'Website',  type: 'url',    components: { input: createRetrieveFromPartyInput('website') } }),
    defineField({ name: 'openingHours', title: 'Opening Hours', type: 'string', description: 'e.g. 10:00–22:00' }),
    defineField({ name: 'amenities', title: 'Amenities / จุดเด่นร้าน', type: 'array', of: [{ type: 'string' }], description: 'Store highlights shown on provider page (parking, wifi, accepts cards, etc.).' }),
    defineField({ name: 'submittedBy', title: 'Submitted By', type: 'string', readOnly: true, description: 'Most recent auth identity that submitted via /submit (e.g. "line:Uxxx" / "email:foo@bar.com").' }),
    defineField({
      name: 'owners',
      title: 'Owner Logins',
      type: 'array',
      of: [{ type: 'string' }],
      readOnly: true,
      description: 'All login identities that own/manage this shop (e.g. ["line:Uxxx","email:foo@bar.com"]). A vendor can link both LINE and email to one shop via the dashboard. Used to scope "my shop / my offers".',
    }),

    // ── Handoff ───────────────────────────────────────────────────────────────
    defineField({
      name: 'defaultHandoffType',
      title: 'Default Handoff Type',
      type: 'string',
      options: {
        list: [
          { title: 'QR Code', value: 'qr' },
          { title: 'SMS',     value: 'sms' },
          { title: 'Both',    value: 'both' },
        ],
        layout: 'radio',
      },
      initialValue: 'qr',
    }),
    defineField({
      name: 'unitRef',
      title: 'Unit Reference',
      type: 'string',
      description: 'Suffix only (e.g. "406"). Combined with project.addressBaseNumber → "120/406". Rent/sale only.',
    }),
  ],

  preview: {
    select: {
      nameTh:   'name_th',
      nameEn:   'name_en',
      slug:     'slug.current',
      category: 'category',
    },
    prepare({ nameTh, nameEn, slug, category }) {
      return {
        title:    nameTh ?? nameEn ?? slug ?? '(unnamed provider)',
        subtitle: category?.toUpperCase(),
      }
    },
  },
})
