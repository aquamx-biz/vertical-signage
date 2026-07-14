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

    // Category lives on each OFFER (offer.category) — the single source of truth for
    // which kiosk category screen the offer appears under. A provider is grouped by
    // its offers' categories, so it no longer carries its own category field.

    // ── Identity ─────────────────────────────────────────────────────────────
    defineField({
      name:        'name_th',
      title:       '📺 Name (Thai)',
      type:        'string',
      description: 'Name shown in media. Can differ from the legal entity name (e.g. shop name).',
      validation:  Rule => Rule.required(),
      components:  { input: NameThInput },
    }),
    defineField({
      name:        'name_en',
      title:       '📺 Name (English)',
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
    // ── Public web listing (Showcase) ─────────────────────────────────────────
    // OFF by default: listings live only on the in-building kiosks. Tick to also
    // publish a public, AI-discoverable web page for this shop at /l/{slug}.
    // A deploy build (aquamx-landing/scripts/build-listings.js) reads this flag
    // and only bakes pages for ticked providers — so the full client roster is
    // never enumerable. Use for hand-picked showcase shops.
    defineField({
      name: 'showcaseWeb',
      title: 'แสดงหน้าเว็บสาธารณะ (Showcase on web)',
      type: 'boolean',
      initialValue: false,
      description: 'ติ๊ก = สร้างหน้าเว็บสาธารณะให้ร้านนี้ (Google/AI ค้นเจอได้ ที่ /l/{slug}) · ไม่ติ๊ก = แสดงแค่บนจอ kiosk เท่านั้น',
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
    defineField({
      name: 'logo', title: '📺 Logo', type: 'image', options: { hotspot: true },
      description: 'ตราร้านแบบจัตุรัส (แนะนำ PNG พื้นโปร่งใส) — ใช้เป็นโลโก้มุมขวาบนของโปสเตอร์บนจอ และไอคอนข้างชื่อร้านในแอป (หน้าร้าน + หน้าโปรโมชั่น). Square brand mark — shown top-right on the on-screen poster and as the store icon in the app.',
    }),
    defineField({
      name: 'coverImage', title: '📺 Cover Image', type: 'image', options: { hotspot: true },
      description: 'รูปปกแนวนอน (รูปร้าน / บรรยากาศ) — ใช้เป็นภาพใหญ่ส่วนหัวหน้าร้านในแอป, ภาพในป๊อปอัปรายละเอียดบนจอ และภาพพรีวิวตอนแชร์ลิงก์. Wide cover photo — the hero at the top of the store page, the detail image on-screen, and the link-share preview.',
    }),

    // ── Description ───────────────────────────────────────────────────────────
    defineField({ name: 'description_th', title: 'Description (Thai)',    type: 'text', rows: 3,
      description: 'คำแนะนำร้าน/บริการสั้นๆ (2–4 บรรทัด) — แสดงเป็นย่อหน้า "เกี่ยวกับร้าน" ใต้รูปปกในหน้าร้านบนแอป และในหน้ารายละเอียดร้านบนจอ. Short "about" blurb — shown on the store page in the app and in the store detail on-screen.',
      components: { input: createTranslateInput({ sourceField: 'description_en', sourceLang: 'English', targetLang: 'Thai', buttonLabel: '✨ Translate from English' }) },
    }),
    defineField({ name: 'description_en', title: 'Description (English)', type: 'text', rows: 3,
      description: 'English version of the store "about" blurb — shown to English-language viewers in the same places (store page in the app + store detail on-screen).',
      components: { input: createTranslateInput({ sourceField: 'description_th', sourceLang: 'Thai', targetLang: 'English', buttonLabel: '✨ Translate from Thai' }) },
    }),

    // ── Contact & Location ────────────────────────────────────────────────────
    defineField({ name: 'locationText', title: '📺 Location',     type: 'string', description: 'e.g. G Floor, Zone A' }),
    defineField({ name: 'mapUrl',       title: 'Map URL',       type: 'url' }),
    defineField({ name: 'phone',   title: 'Phone',    type: 'string', components: { input: createRetrieveFromPartyInput('phone')   } }),
    defineField({ name: 'lineId',  title: 'LINE ID',  type: 'string', components: { input: createRetrieveFromPartyInput('lineId')  } }),

    // ── Lead relay — where booking/order requests get forwarded ─────────────
    // The kiosk/mobile booking flow notifies OUR admin LINE group; these two
    // fields decide whether/how it continues to the SHOP's group.
    defineField({
      name: 'lineGroupId',
      title: 'LINE ของร้านที่รับคำขอจอง/สั่งซื้อ (Group ID หรือ User ID)',
      type: 'string',
      description: '① เชิญ @aquamx เข้ากลุ่มรับคิวของร้าน (ในกลุ่มต้องไม่มี OA อื่น) ② พิมพ์ "id" ในกลุ่ม → bot ตอบรหัส C… ③ วางรหัสที่นี่ · แบบรายคน: เจ้าของร้านแอดเพื่อน @aquamx แล้วทัก "id" → ได้รหัส U… · เว้นว่าง = แจ้งเราอย่างเดียว',
    }),
    defineField({
      name: 'leadRelay',
      title: 'โหมดส่งต่อคำขอถึงร้าน',
      type: 'string',
      options: { list: [
        { title: 'ผ่านแอดมินก่อน — กด ✅ ในกลุ่ม LINE เราแล้วค่อยส่งถึงร้าน', value: 'manual' },
        { title: 'ส่งตรงถึงร้านอัตโนมัติ — เราได้รับสำเนา',                 value: 'auto' },
        { title: 'ไม่ส่งต่อ — แจ้งเราอย่างเดียว',                            value: 'off' },
      ], layout: 'radio' },
      initialValue: 'manual',
      description: 'มีผลเมื่อกรอก LINE ID ช่องบนแล้วเท่านั้น',
    }),

    // ── ตารางรับคิวของร้าน — ค่าหลักที่ทุก offer ปุ่มจองใช้ร่วมกัน ─────────────
    // Field-level merge: offer.booking's filled fields win over these.
    // (Merge implemented in build.mjs bake + handoff mergeBooking — keep in sync.)
    defineField({
      name: 'booking',
      title: '📺 ตารางรับคิวของร้าน (ค่าหลักของทุก offer)',
      type: 'object',
      description: 'ตั้งครั้งเดียว ทุก offer ที่มีปุ่มจองใช้ตารางนี้อัตโนมัติ · offer ไหนอยากต่าง (เช่น คิวยาวกว่า) ไปกรอกทับเฉพาะช่องนั้นในตัว offer เอง',
      options: { collapsible: true, collapsed: true, columns: 2 },
      fields: [
        defineField({ name: 'openTime', title: 'Open Time', type: 'string', description: 'e.g. "10:00"' }),
        defineField({ name: 'closeTime', title: 'Close Time', type: 'string', description: 'e.g. "22:00"' }),
        defineField({ name: 'slotMinutes', title: 'Slot Minutes', type: 'number' }),
        defineField({ name: 'breakStart', title: 'Break Start', type: 'string', description: 'e.g. "14:00"' }),
        defineField({ name: 'breakEnd', title: 'Break End', type: 'string', description: 'e.g. "17:00"' }),
        defineField({ name: 'daysAhead', title: 'เปิดให้เลือกกี่วัน', type: 'number', description: 'จำนวนวันในปฏิทินที่ลูกค้าเลือกได้ นับจากวันแรกที่จองได้' }),
        defineField({ name: 'minNotice', title: 'ต้องจองล่วงหน้าอย่างน้อย', type: 'number', description: 'กันจองกระทันหัน — ใช้คู่กับหน่วยด้านล่าง เช่น 3 ชั่วโมง · 7 วัน · เว้นว่าง = รับถึงนาทีสุดท้าย' }),
        defineField({ name: 'minNoticeUnit', title: 'หน่วยของ "ต้องจองล่วงหน้า"', type: 'string', options: { list: [ { title: 'ชั่วโมง', value: 'hours' }, { title: 'วัน', value: 'days' } ], layout: 'radio' }, initialValue: 'hours' }),
        defineField({ name: 'capacityPerSlot', title: 'Capacity Per Slot', type: 'number' }),
      ],
    }),
    defineField({ name: 'website', title: 'Website',  type: 'url',    components: { input: createRetrieveFromPartyInput('website') } }),
    defineField({ name: 'openingHours', title: '📺 Opening Hours', type: 'string', description: 'e.g. 10:00–22:00' }),
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
