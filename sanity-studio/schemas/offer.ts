import { defineField, defineType } from 'sanity'
import { SubCategoriesInput }  from '../components/SubCategoriesInput'
import { createTranslateInput } from '../components/TranslateInput'

// Conditional visibility: show a CTA-specific field only when its CTA is picked
// (primary OR secondary), and property specs only for property offers. Keeps the
// Offer form short — vendors see just the fields their offer type needs.
const ctaGate = (...types: string[]) => ({ document }: any) =>
  !types.includes(document?.ctaType) && !types.includes(document?.ctaType2)
const propertyGate = ({ document }: any) =>
  !['forSale', 'forRent'].includes(document?.category) &&
  document?.ctaType !== 'viewListing' && document?.ctaType2 !== 'viewListing'

// Must stay in sync with provider.ts, media.ts, playlistItem.ts, categoryConfig.ts
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
  name: 'offer',
  title: 'Offer',
  type: 'document',
  fields: [
    // ── Provider ──────────────────────────────────────────────────────────────
    defineField({
      name: 'provider',
      title: 'Provider',
      type: 'reference',
      to: [{ type: 'provider' }],
      weak: true,   // submit สร้าง offer draft ก่อน provider publish → ref ต้อง weak (strong จะถูกปฏิเสธตอน create) · resolve ปกติเมื่อ publish ทั้งคู่
      options: { filter: 'status != false' },
      validation: Rule => Rule.required(),
    }),

    // ── Scope ─────────────────────────────────────────────────────────────────
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
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'projects',
      title: 'Projects',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'project' }], options: { filter: 'isActive == true' } }],
      hidden: ({ document }) => (document as any)?.scope !== 'project',
      validation: Rule =>
        Rule.custom((value, context) => {
          if ((context.document as any)?.scope !== 'project') return true
          if (!value?.length) return 'At least one project required when scope is Project-specific'
          return true
        }),
    }),

    // ── Identity ─────────────────────────────────────────────────────────────
    defineField({
      name:       'title_th',
      title:      'Title (Thai)',
      type:       'string',
      validation: Rule => Rule.required(),
      components: { input: createTranslateInput({ sourceField: 'title_en', sourceLang: 'English', targetLang: 'Thai',    buttonLabel: '✨ Translate from English' }) },
    }),
    defineField({
      name:       'title_en',
      title:      'Title (English)',
      type:       'string',
      components: { input: createTranslateInput({ sourceField: 'title_th', sourceLang: 'Thai',    targetLang: 'English', buttonLabel: '✨ Translate from Thai'    }) },
    }),
    defineField({
      name:  'slug',
      title: 'Slug',
      type:  'slug',
      options: {
        source: (doc: any) => doc.title_en || doc.title_th || '',
        slugify: (input: string) =>
          input
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/[\s_]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, ''),
      },
      validation: Rule => Rule.required(),
      description: 'Auto-generated from English title. Fill Title (English) first, then click Generate.',
    }),

    // ── Routing ───────────────────────────────────────────────────────────────
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: { list: CATEGORY_LIST },
      validation: Rule => Rule.required(),
      description: 'Drives kiosk routing. PlaylistItem.touchExploreCategory may override per slot.',
    }),
    defineField({
      name: 'subCategories',
      title: 'Sub-Categories',
      type: 'array',
      of: [{ type: 'string' }],
      components: { input: SubCategoriesInput },
      validation: Rule => Rule.required().min(1).error('Select at least one subcategory.'),
      description: 'Subcategories are filtered by the Category selected above.',
    }),

    // ── Status ────────────────────────────────────────────────────────────────
    defineField({
      name: 'status',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
      description: 'Disable to hide this offer from all kiosk views.',
    }),
    defineField({
      name: 'reviewStatus',
      title: 'Review Status',
      type: 'string',
      options: { list: [
        { title: 'Pending review', value: 'pending' },
        { title: 'Approved',       value: 'approved' },
        { title: 'Rejected',       value: 'rejected' },
      ] },
      initialValue: 'pending',
      description: 'First-pass email review (info@aquamx.biz). Approved = content OK; still needs project + media + publish in Studio.',
    }),

    // ── Content ───────────────────────────────────────────────────────────────
    // One description per language (the old Short Description was dropped — it was
    // redundant and the web form only ever collected one). Shown as the subtitle
    // under the ad on the kiosk (clamped to ~2 lines) AND as the full detail on the
    // offer page in the app. The web form auto-fills TH/EN from a single input.
    defineField({ name: 'description_th', title: 'Description (Thai)',    type: 'text', rows: 3,
      description: 'ป้ายใต้โฆษณาบนจอ (ตัด ~2 บรรทัด) + รายละเอียดเต็มในหน้า offer บนแอป. Ad subtitle on-screen + full detail on the app offer page.',
      components: { input: createTranslateInput({ sourceField: 'description_en', sourceLang: 'English', targetLang: 'Thai',    buttonLabel: '✨ Translate from English' }) },
    }),
    defineField({ name: 'description_en', title: 'Description (English)', type: 'text', rows: 3,
      components: { input: createTranslateInput({ sourceField: 'description_th', sourceLang: 'Thai',    targetLang: 'English', buttonLabel: '✨ Translate from Thai'    }) },
    }),
    defineField({
      name: 'price',
      title: 'Price',
      type: 'string',
      description: 'e.g. "150", "150–300", "Free", "From ฿99"',
    }),
    // One image field — the FIRST image is the hero/primary (card thumbnail, ad first
    // frame, popup/gallery lead); the rest form the gallery. Replaces the old separate
    // Primary Image + Gallery Images. Consumers read coalesce(primaryImage, images[0])
    // so existing docs (which still carry a separate primaryImage) keep working.
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
      options: { layout: 'grid' },
      description: 'รูปแรก = รูปหลัก (Hero) · รูปที่เหลือ = แกลเลอรี. First image is the main/hero; the rest are the gallery.',
    }),

    // ── Property listing specs (For Rent / For Sale · adType "listing") ─────────
    defineField({
      name: 'listing',
      title: 'Property Listing Specs',
      type: 'object',
      hidden: propertyGate,
      description: 'Structured specs for property offers — shown only for For Sale / For Rent (or the View Listing CTA).',
      options: { collapsible: true, collapsed: false, columns: 2 },
      fields: [
        defineField({ name: 'bed',  title: 'Bedrooms',  type: 'number' }),
        defineField({ name: 'bath', title: 'Bathrooms', type: 'number' }),
        defineField({ name: 'area', title: 'Area (sqm)', type: 'number' }),
        defineField({ name: 'floor', title: 'Floor', type: 'string', description: 'e.g. "39" or "39/43"' }),
        defineField({ name: 'parking', title: 'Parking', type: 'string', description: 'e.g. "1", "2 cars"' }),
        defineField({
          name: 'furnishing',
          title: 'Furnishing',
          type: 'string',
          options: { list: [
            { title: 'Unfurnished (ห้องเปล่า)',        value: 'unfurnished' },
            { title: 'Partly furnished (ตกแต่งบางส่วน)', value: 'partial' },
            { title: 'Fully furnished (ตกแต่งครบ)',     value: 'furnished' },
            { title: 'Built-in (บิวท์อิน)',             value: 'builtin' },
          ] },
        }),
      ],
    }),
    defineField({
      name: 'listingImages',
      title: 'Listing Photos',
      type: 'array',
      hidden: propertyGate,
      of: [{ type: 'image', options: { hotspot: true } }],
      options: { layout: 'grid' },
      description: 'Property photos shown on the listing detail page — separate from the on-screen ad images above.',
    }),

    // Menu CTA — itemized menu shown in the kiosk popup
    defineField({
      name: 'menuItems',
      title: 'Menu Items',
      type: 'array',
      hidden: ctaGate('viewMenu'),
      of: [{
        type: 'object',
        fields: [
          defineField({ name: 'name_th', title: 'Name (TH)', type: 'string' }),
          defineField({ name: 'name_en', title: 'Name (EN)', type: 'string' }),
          defineField({ name: 'price', title: 'Price', type: 'string' }),
          defineField({ name: 'image', title: 'Image', type: 'image', options: { hotspot: true } }),
        ],
      }],
    }),

    // Order CTA — itemized order list shown in the kiosk popup
    defineField({
      name: 'orderItems',
      title: 'Order Items',
      type: 'array',
      hidden: ctaGate('order'),
      of: [{
        type: 'object',
        fields: [
          defineField({ name: 'name_th', title: 'Name (TH)', type: 'string' }),
          defineField({ name: 'name_en', title: 'Name (EN)', type: 'string' }),
          defineField({ name: 'price', title: 'Price', type: 'string' }),
          defineField({ name: 'image', title: 'Image', type: 'image', options: { hotspot: true } }),
        ],
      }],
    }),
    defineField({
      name: 'fulfillment',
      title: 'Fulfillment',
      type: 'array',
      hidden: ctaGate('order'),
      of: [{ type: 'string' }],
      options: { list: [
        { title: 'Dine-in',  value: 'dine_in' },
        { title: 'Delivery', value: 'delivery' },
        { title: 'Pickup',   value: 'pickup' },
      ] },
    }),

    // Book CTA — booking config used to generate slots in the kiosk popup
    defineField({
      name: 'booking',
      title: 'Booking Config',
      type: 'object',
      hidden: ctaGate('book'),
      options: { collapsible: true, collapsed: false, columns: 2 },
      fields: [
        defineField({ name: 'openTime', title: 'Open Time', type: 'string', description: 'e.g. "10:00"' }),
        defineField({ name: 'closeTime', title: 'Close Time', type: 'string', description: 'e.g. "22:00"' }),
        defineField({ name: 'slotMinutes', title: 'Slot Minutes', type: 'number' }),
        defineField({ name: 'breakStart', title: 'Break Start', type: 'string', description: 'e.g. "14:00"' }),
        defineField({ name: 'breakEnd', title: 'Break End', type: 'string', description: 'e.g. "17:00"' }),
        defineField({ name: 'daysAhead', title: 'Days Ahead', type: 'number' }),
        defineField({ name: 'capacityPerSlot', title: 'Capacity Per Slot', type: 'number' }),
      ],
    }),

    // Event CTA — event details shown in the kiosk popup
    defineField({
      name: 'eventInfo',
      title: 'Event Info',
      type: 'object',
      hidden: ({ document }: any) => document?.ctaType !== 'event' && document?.ctaType2 !== 'event' && document?.category !== 'events',
      options: { collapsible: true, collapsed: false, columns: 2 },
      fields: [
        defineField({ name: 'dates', title: 'Dates', type: 'array', of: [{ type: 'string' }], description: 'e.g. "2026-07-01"' }),
        defineField({ name: 'place', title: 'Place', type: 'string' }),
        defineField({ name: 'capacity', title: 'Capacity', type: 'number' }),
      ],
    }),

    // ── CTA ──────────────────────────────────────────────────────────────────
    defineField({
      name: 'ctaType',
      title: 'CTA Type',
      type: 'string',
      options: {
        list: [
          { title: 'View Menu',    value: 'viewMenu' },
          { title: 'Order',        value: 'order' },
          { title: 'Book',         value: 'book' },
          { title: 'Contact / View Offer', value: 'contact' },
          { title: 'View Listing', value: 'viewListing' },
          { title: 'View Store',   value: 'viewStore' },
          { title: 'Sign Up',      value: 'signup' },
          { title: 'Event',        value: 'event' },
        ],
      },
    }),
    defineField({ name: 'ctaLabel', title: 'CTA Button Label (custom)', type: 'string', description: 'Custom button text set by vendor (e.g. "Schedule Viewing").' }),
    defineField({
      name: 'adType',
      title: 'Ad Type',
      type: 'string',
      options: { list: [
        { title: 'Product',   value: 'product' },
        { title: 'Service',   value: 'service' },
        { title: 'Promotion', value: 'promotion' },
        { title: 'Listing',   value: 'listing' },
        { title: 'Store',     value: 'store' },
      ] },
      description: 'Submission ad type (drives CTA defaults on the form).',
    }),
    defineField({
      name: 'displayMode',
      title: 'Display Mode',
      type: 'string',
      options: { list: [
        { title: 'Media Ad (on-screen rotation + menu)', value: 'media' },
        { title: 'Menu Ad (menu only)',                  value: 'menu' },
      ] },
      initialValue: 'media',
      description: 'Vendor choice: Media = plays in the on-screen rotation (and also listed in the menu); Menu = listed in the kiosk menu only. Set via /submit.',
    }),
    defineField({ name: 'ctaURL',       title: 'CTA URL',   type: 'url' }),
    defineField({ name: 'deepLink',     title: 'Deep Link', type: 'url', description: 'e.g. line://mc/…, intent://…' }),
    // ── Secondary CTA (Media ad may have a 2nd button; Menu ad = single) ──
    defineField({
      name: 'ctaType2',
      title: 'CTA Type (2nd)',
      type: 'string',
      options: { list: [
        { title: 'View Menu',    value: 'viewMenu' },
        { title: 'Order',        value: 'order' },
        { title: 'Book',         value: 'book' },
        { title: 'Contact / View Offer', value: 'contact' },
        { title: 'View Listing', value: 'viewListing' },
        { title: 'View Store',   value: 'viewStore' },
        { title: 'Sign Up',      value: 'signup' },
        { title: 'Event',        value: 'event' },
      ] },
      description: 'Optional second CTA — Media ads only (Menu ads use a single CTA).',
    }),
    defineField({ name: 'ctaLabel2', title: 'CTA Button Label (2nd, custom)', type: 'string' }),
    defineField({ name: 'ctaURL2',   title: 'CTA URL (2nd)', type: 'url' }),
    defineField({ name: 'availability', title: 'Availability', type: 'string', description: 'e.g. "Mon–Fri 11:00–14:00"' }),
    defineField({ name: 'validFrom',    title: 'Valid From', type: 'datetime' }),
    defineField({ name: 'validTo',      title: 'Valid To',   type: 'datetime' }),
  ],

  preview: {
    select: {
      title:        'title_th',
      category:     'category',
      providerName: 'provider.name_th',
    },
    prepare({ title, category, providerName }) {
      return {
        title:    title ?? '(untitled)',
        subtitle: `${providerName ?? '(no provider)'}  ·  ${category ?? '—'}`,
      }
    },
  },
})
