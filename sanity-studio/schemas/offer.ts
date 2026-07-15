import { defineField, defineType } from 'sanity'
import { SubCategoriesInput }  from '../components/SubCategoriesInput'
import { createTranslateInput } from '../components/TranslateInput'
import { MediaGatedField }     from '../components/MediaGatedField'

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
  groups: [
    { name: 'content',  title: '📝 เนื้อหา',    default: true },
    { name: 'cta',      title: '🎫 ปุ่ม (CTA)' },
    { name: 'property', title: '🏠 อสังหา' },
    { name: 'advanced', title: '⚙️ ตั้งค่า' },
  ],
  fields: [
    // ── Provider ──────────────────────────────────────────────────────────────
    defineField({
      name: 'provider',
      group: 'content',
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
      group: 'advanced',
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
      group: 'advanced',
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
    // ── Display language: the OWNER's intent, the single source of truth ──────
    // A customer who typed English wants an English ad — the screen must never
    // lead with an unapproved machine translation. Set automatically by the web
    // form from the language the customer typed; editable here.
    defineField({
      name: 'displayLang',
      group: 'content',
      title: 'ภาษาหลักบนจอ (Display language)',
      type: 'string',
      options: { list: [
        { title: 'ไทย (Thai)',       value: 'th' },
        { title: 'English',          value: 'en' },
      ], layout: 'radio', direction: 'horizontal' },
      initialValue: 'th',
      description: 'ภาษาที่เจ้าของต้องการให้โฆษณาแสดง — ฟอร์มเว็บตั้งให้อัตโนมัติตามภาษาที่ลูกค้าพิมพ์',
    }),
    defineField({
      name:       'title_th',
      group:      'content',
      title:      '📺 Title (Thai)',
      type:       'string',
      description: 'ชื่อสินค้า / บริการ / โปรโมชั่น สั้นๆ กระชับ — เช่น "All-Day Brunch", "นวดแผนไทย 60 นาที", "ลด 50% วันนี้". Short product / service / promo name (the ad headline).',
      // required — UNLESS the owner chose English and the English title exists
      // (an English-only ad is legitimate; forcing Thai here would push admins
      // to paste machine translations the owner never approved).
      validation: Rule => Rule.custom((value, context) => {
        const doc = context.document as any
        if (value) return true
        if (doc?.displayLang === 'en' && doc?.title_en) return true
        return 'ใส่ชื่อภาษาไทย — หรือเลือกภาษาหลัก = English แล้วใส่ Title (English) แทน'
      }),
      components: { input: createTranslateInput({ sourceField: 'title_en', sourceLang: 'English', targetLang: 'Thai',    buttonLabel: '✨ Translate from English' }) },
    }),
    defineField({
      name:       'title_en',
      group:      'content',
      title:      '📺 Title (English)',
      type:       'string',
      description: 'ระบบไม่แปลอัตโนมัติ — อยากมีเวอร์ชันอังกฤษ กด ✨ แปลจากช่องไทย แล้วตรวจก่อนบันทึก (จอโชว์ภาษาตาม "ภาษาหลักบนจอ")',
      components: { input: createTranslateInput({ sourceField: 'title_th', sourceLang: 'Thai',    targetLang: 'English', buttonLabel: '✨ Translate from Thai'    }) },
    }),
    defineField({
      name:  'slug',
      group: 'advanced',
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
      group: 'content',
      title: '📺 Category',
      type: 'string',
      options: { list: CATEGORY_LIST },
      validation: Rule => Rule.required(),
      description: 'Drives kiosk routing. PlaylistItem.touchExploreCategory may override per slot.',
    }),
    defineField({
      name: 'subCategories',
      group: 'content',
      title: '📺 Sub-Categories',
      type: 'array',
      of: [{ type: 'string' }],
      components: { input: SubCategoriesInput },
      validation: Rule => Rule.required().min(1).error('Select at least one subcategory.'),
      description: 'Subcategories are filtered by the Category selected above.',
    }),

    // ── Status ────────────────────────────────────────────────────────────────
    defineField({
      name: 'status',
      group: 'advanced',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
      description: 'Disable to hide this offer from all kiosk views.',
    }),
    // ── Public web listing (Showcase) ─────────────────────────────────────────
    // OFF by default. Tick to publish a public, AI-discoverable web page for
    // this offer at /l/{slug}. Mainly for PROPERTY listings (For Rent / For Sale)
    // — the specific unit is what people search for. A deploy build only bakes
    // pages for ticked offers, so the full list is never enumerable.
    defineField({
      name: 'showcaseWeb',
      group: 'advanced',
      title: 'แสดงหน้าเว็บสาธารณะ (Showcase on web)',
      type: 'boolean',
      initialValue: false,
      description: 'ติ๊ก = สร้างหน้าเว็บสาธารณะให้ประกาศนี้ (Google/AI ค้นเจอได้ ที่ /l/{slug}) · เหมาะกับประกาศห้อง/อสังหาฯ เป็นหลัก · ไม่ติ๊ก = แสดงแค่บนจอ',
    }),
    defineField({
      name: 'reviewStatus',
      group: 'advanced',
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
    // offer page in the app. The web form stores ONLY the language the customer
    // typed (see displayLang) — the other side stays empty until a human translates.
    defineField({ name: 'description_th', group: 'content', title: '📺 Description (Thai)',    type: 'text', rows: 3,
      description: 'ป้ายใต้โฆษณาบนจอ (ตัด ~2 บรรทัด) + รายละเอียดเต็มในหน้า offer บนแอป. Ad subtitle on-screen + full detail on the app offer page. · พิมพ์ | ตรงจุดที่ยอมให้ขึ้นบรรทัดใหม่บนจอ (เครื่องหมายไม่แสดงจริง)',
      components: { input: createTranslateInput({ sourceField: 'description_en', sourceLang: 'English', targetLang: 'Thai',    buttonLabel: '✨ Translate from English' }) },
    }),
    defineField({ name: 'description_en', group: 'content', title: '📺 Description (English)', type: 'text', rows: 3,
      components: { input: createTranslateInput({ sourceField: 'description_th', sourceLang: 'Thai',    targetLang: 'English', buttonLabel: '✨ Translate from Thai'    }) },
    }),
    defineField({
      name: 'price',
      group: 'content',
      title: '📺 Price',
      type: 'string',
      description: 'e.g. "150", "150–300", "Free", "From ฿99"',
    }),
    // One image field — the FIRST image is the hero/primary (card thumbnail, ad first
    // frame, popup/gallery lead); the rest form the gallery. Replaces the old separate
    // Primary Image + Gallery Images. Consumers read coalesce(primaryImage, images[0])
    // so existing docs (which still carry a separate primaryImage) keep working.
    defineField({
      name: 'images',
      group: 'content',
      title: '📺 Images',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
      options: { layout: 'grid' },
      description: 'รูปแรก = รูปหลัก (Hero) · รูปที่เหลือ = แกลเลอรี. First image is the main/hero; the rest are the gallery.',
    }),

    // ── Property listing specs (For Rent / For Sale · adType "listing") ─────────
    defineField({
      name: 'listing',
      group: 'property',
      title: '📺 Property Listing Specs',
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
      group: 'property',
      title: '📺 Listing Photos',
      type: 'array',
      hidden: propertyGate,
      of: [{ type: 'image', options: { hotspot: true } }],
      options: { layout: 'grid' },
      description: 'Property photos shown on the listing detail page — separate from the on-screen ad images above.',
    }),

    // ── CTA ──────────────────────────────────────────────────────────────────
    // Order matters: the CTA pickers come FIRST, then each CTA's extra data
    // (menu/order/booking/event) appears BELOW them — so the editor sees WHY
    // those fields are visible (they follow the picked CTA).
    defineField({
      name: 'ctaType',
      group: 'cta',
      title: '📺 CTA Type',
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
    defineField({ name: 'ctaLabel', group: 'cta', title: '📺 CTA Button Label (custom)', type: 'string', description: 'Custom button text set by vendor (e.g. "Schedule Viewing").' }),
    defineField({
      name: 'adType',
      group: 'advanced',
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
      group: 'advanced',
      title: 'Display Mode',
      type: 'string',
      options: { list: [
        { title: 'Media Ad (on-screen rotation + menu)', value: 'media' },
        { title: 'Menu Ad (menu only)',                  value: 'menu' },
      ] },
      initialValue: 'media',
      description: 'Vendor choice: Media = plays in the on-screen rotation (and also listed in the menu); Menu = listed in the kiosk menu only. Set via /submit.',
    }),
    // ONE link field. The kiosk QR ALWAYS opens OUR handoff page first; this is
    // where the button ON that mobile page continues to. Accepts a normal web
    // link OR an app link (line://…) — the old separate deepLink field was
    // merged in here (only one doc ever used it, and with a web URL at that).
    defineField({
      name: 'ctaURL', group: 'cta', type: 'url',
      title: 'ลิงก์ภายนอกของร้าน / Vendor link (ปุ่ม "ไปต่อ" บนมือถือ)',
      description: 'ลิงก์ของร้าน เช่น ระบบสั่งซื้อ / ระบบจอง / เว็บ / โซเชียล — หรือลิงก์เปิดแอป (line://…) ก็ใส่ช่องนี้ได้เลย. ลูกค้าสแกน QR มาหน้าเราก่อน แล้วปุ่มบนมือถือจึงพาไปลิงก์นี้. เว้นว่างได้ถ้าไม่มีระบบภายนอก.',
      validation: Rule => Rule.uri({ scheme: ['http', 'https', 'line', 'intent', 'tel', 'mailto'] }),
    }),
    // ── Secondary CTA (Media ad may have a 2nd button; Menu ad = single) ──
    // THE RULE: 2nd CTA exists ONLY when the offer has real media in the Media
    // library (checked live by MediaGatedField). No media = menu/catalog ad =
    // single CTA — these three fields stay hidden.
    defineField({
      name: 'ctaType2',
      group: 'cta',
      components: { field: MediaGatedField },
      title: '📺 CTA Type (2nd)',
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
    defineField({ name: 'ctaLabel2', group: 'cta', components: { field: MediaGatedField }, title: '📺 CTA Button Label (2nd, custom)', type: 'string' }),
    defineField({ name: 'ctaURL2',   group: 'cta', components: { field: MediaGatedField }, title: 'ลิงก์ภายนอก (ปุ่มที่ 2) / Vendor link (2nd)', type: 'url', description: 'เหมือนลิงก์ภายนอกด้านบน แต่สำหรับปุ่มที่ 2' }),

    // ── Per-CTA extra data (appears below the CTA pickers that reveal it) ────
    // Menu CTA — itemized menu shown in the kiosk popup
    defineField({
      name: 'menuItems',
      group: 'cta',
      title: '📺 Menu Items',
      type: 'array',
      hidden: ctaGate('viewMenu'),
      of: [{
        type: 'object',
        fields: [
          defineField({ name: 'name_th', title: 'Name (TH)', type: 'string' }),
          defineField({ name: 'name_en', title: 'Name (EN)', type: 'string' }),
          defineField({ name: 'price', title: '📺 Price', type: 'string' }),
          defineField({ name: 'image', title: 'Image', type: 'image', options: { hotspot: true } }),
        ],
      }],
    }),

    // Order CTA — itemized order list shown in the kiosk popup
    defineField({
      name: 'orderItems',
      group: 'cta',
      title: '📺 Order Items',
      type: 'array',
      hidden: ctaGate('order'),
      of: [{
        type: 'object',
        fields: [
          defineField({ name: 'name_th', title: 'Name (TH)', type: 'string' }),
          defineField({ name: 'name_en', title: 'Name (EN)', type: 'string' }),
          defineField({ name: 'price', title: '📺 Price', type: 'string' }),
          defineField({ name: 'image', title: 'Image', type: 'image', options: { hotspot: true } }),
        ],
      }],
    }),
    defineField({
      name: 'fulfillment',
      group: 'cta',
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

    // Book CTA — per-offer OVERRIDE of the provider's booking schedule.
    // Field-level merge: a field filled here wins; empty = the shop's value.
    // (Merge implemented in build.mjs bake + handoff mergeBooking — keep in sync.)
    defineField({
      name: 'booking',
      group: 'cta',
      title: 'Booking Override · ปรับเฉพาะ offer นี้',
      type: 'object',
      hidden: ctaGate('book'),
      description: 'Blank = inherits the store\'s Booking Schedule · ค่าหลักตั้งที่ ร้านค้า → Booking Schedule ครั้งเดียวใช้ทุก offer · กรอกที่นี่เฉพาะช่องที่อยากให้ต่างจากร้าน — ช่องที่กรอกชนะเป็นรายช่อง',
      options: { collapsible: true, collapsed: false, columns: 2 },
      fields: [
        defineField({ name: 'openTime', title: 'Open Time', type: 'string', description: 'e.g. "10:00"' }),
        defineField({ name: 'closeTime', title: 'Close Time', type: 'string', description: 'e.g. "22:00"' }),
        defineField({ name: 'slotMinutes', title: 'Slot Minutes', type: 'number' }),
        defineField({ name: 'breakStart', title: 'Break Start', type: 'string', description: 'e.g. "14:00"' }),
        defineField({ name: 'breakEnd', title: 'Break End', type: 'string', description: 'e.g. "17:00"' }),
        defineField({ name: 'daysAhead', title: 'Days Selectable · เปิดให้เลือกกี่วัน', type: 'number', description: 'Calendar days offered, counted from the first bookable day · นับจากวันแรกที่จองได้ (ไม่ใช่ระยะขั้นต่ำก่อนถึงคิว)' }),
        defineField({ name: 'minNotice', title: 'Min Notice · ต้องจองล่วงหน้า', type: 'number', description: 'Blocks last-minute bookings, unit below · เช่น 3 ชั่วโมง = ซ่อนคิวที่จะถึงใน 3 ชม. · 7 วัน = เริ่มจองอีก 7 วันข้างหน้า · เว้นว่าง = รับถึงนาทีสุดท้าย' }),
        defineField({ name: 'minNoticeUnit', title: 'Min Notice Unit · หน่วย', type: 'string', options: { list: [ { title: 'Hours · ชั่วโมง', value: 'hours' }, { title: 'Days · วัน', value: 'days' } ], layout: 'radio' }, initialValue: 'hours' }),
        defineField({ name: 'capacityPerSlot', title: 'Capacity Per Slot', type: 'number' }),
      ],
    }),

    // Event CTA — event details shown in the kiosk popup
    defineField({
      name: 'eventInfo',
      group: 'cta',
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

    defineField({ name: 'availability', group: 'advanced', title: '📺 Availability', type: 'string', description: 'e.g. "Mon–Fri 11:00–14:00"' }),
    defineField({ name: 'validFrom',    group: 'advanced', title: 'Valid From', type: 'datetime' }),
    defineField({ name: 'validTo',      group: 'advanced', title: 'Valid To',   type: 'datetime' }),
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
