import { defineField, defineType } from 'sanity'
import { OpenDaysInput }                from '../components/OpenDaysInput'
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
  // Layout-only: puts Open Time + Close Time on one row (field paths unchanged)
  fieldsets: [{ name: 'openHours', title: '📺 Open – Close · เวลาเปิด-ปิด', options: { columns: 2 } }],
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
      title:       '📺 Name (Thai) · ชื่อร้าน (ไทย)',
      type:        'string',
      description: 'ชื่อร้านที่คนดูเห็น — ขึ้นเป็นแถวโลโก้+ชื่อร้านเหนือพาดหัวบนสไลด์ทุกใบของร้านนี้, เป็นบรรทัดร้านในป๊อปอัป (สั่ง/จอง/ดูร้าน) และเป็นชื่อที่ติดไปกับ lead ที่ส่งถึงร้าน · ใช้ชื่อร้านจริงได้ ไม่ต้องตรงกับชื่อนิติบุคคล · ⚠️ แถวบนจอรับได้ ~52 ตัวอักษรไทย ยาวกว่านั้นตัดด้วย "…" — ชื่อสั้นอ่านได้ไกลกว่า',
      validation:  Rule => Rule.required(),
      components:  { input: NameThInput },
    }),
    defineField({
      name:        'name_en',
      title:       '📺 Name (English) · ชื่อร้าน (อังกฤษ)',
      type:        'string',
      description: 'The shop name an ENGLISH viewer sees — same three places as the Thai name (slide shop row, popup store line, lead sent to the shop). Blank falls back to the Thai name. · ⚠️ ~47 characters fit the on-screen row before it is cut with "…".',
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
      description: 'ตราร้านแบบจัตุรัส (แนะนำ PNG พื้นโปร่งใส) — บนจอใช้เป็นตราเล็กหน้าชื่อร้าน ในบล็อกข้อความเหนือพาดหัว (ย้ายลงมาจากมุมขวาบนแล้ว: หนึ่งสไลด์มีตราร้านจุดเดียว ตรงที่สายตาอ่านอยู่พอดี) และเป็นไอคอนข้างชื่อร้านในแอป (หน้าร้าน + หน้าโปรโมชั่น) · แสดงบนพื้นขาวขนาดเล็ก ~4.4vh — โลโก้ที่มีตัวหนังสือเยอะจะอ่านไม่ออก ใช้ตราสัญลักษณ์จะดีที่สุด. Square brand mark — the small mark before the shop name in the slide text block, and the store icon in the app.',
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
    // Contact channels are deliberately NOT on the kiosk popup: a screen in a
    // lobby can't dial or add a LINE friend. The popup hands off (QR / phone
    // number) and every channel below opens on the customer's own phone after
    // the scan — keep that split when adding fields here.
    defineField({ name: 'locationText', title: '📺 Location · ที่ตั้ง', type: 'string',
      description: 'ตำแหน่งร้านแบบสั้น เช่น "ชั้น G โซน A" — ขึ้นใต้ชื่อร้านในหน้าหมวดหมู่บนจอ และบนหน้าร้านในมือถือ · e.g. G Floor, Zone A',
    }),
    defineField({ name: 'mapUrl', title: 'Map URL · ลิงก์แผนที่', type: 'url',
      description: 'ไม่ขึ้นบนจอ — ปุ่มแผนที่บนมือถือหลังลูกค้าสแกน QR (จอไม่มีปุ่มนำทาง เพราะกดจากจอแล้วพาไปไหนไม่ได้). Not shown on the kiosk; it is the map button on the mobile page after the scan.',
    }),
    defineField({ name: 'phone',   title: 'Phone · เบอร์โทรร้าน',    type: 'string', components: { input: createRetrieveFromPartyInput('phone')   },
      description: 'ไม่ขึ้นบนจอ — เป็นปุ่มโทรบนมือถือหลังสแกน และเป็นเบอร์ที่ทีมใช้ติดต่อร้านเวลามี lead เข้า. Not shown on the kiosk.',
    }),
    defineField({ name: 'lineId',  title: 'LINE ID · ไลน์ร้าน',  type: 'string', components: { input: createRetrieveFromPartyInput('lineId')  },
      description: 'ไม่ขึ้นบนจอ — ปุ่มแอด LINE บนมือถือหลังสแกน · คนละช่องกับ "Lead LINE (Group/User ID)" ด้านล่างที่ใช้ส่งคำขอจองอัตโนมัติ. Not shown on the kiosk.',
    }),

    // ── Lead relay — where booking/order requests get forwarded ─────────────
    // The kiosk/mobile booking flow notifies OUR admin LINE group; these two
    // fields decide whether/how it continues to the SHOP's group.
    defineField({
      name: 'lineGroupId',
      title: 'Lead LINE (Group/User ID) · LINE รับคำขอจองของร้าน',
      type: 'string',
      description: '① เชิญ @aquamx เข้ากลุ่มรับคิวของร้าน (ในกลุ่มต้องไม่มี OA อื่น) ② พิมพ์ "id" ในกลุ่ม → bot ตอบรหัส C… ③ วางรหัสที่นี่ · แบบรายคน: เจ้าของร้านแอดเพื่อน @aquamx แล้วทัก "id" → ได้รหัส U… · เว้นว่าง = แจ้งเราอย่างเดียว',
    }),
    defineField({
      name: 'leadRelay',
      title: 'Lead Relay Mode · โหมดส่งต่อคำขอถึงร้าน',
      type: 'string',
      options: { list: [
        { title: 'Manual · ผ่านแอดมินก่อน — กด ✅ ในกลุ่ม LINE เราแล้วค่อยส่งถึงร้าน', value: 'manual' },
        { title: 'Auto · ส่งตรงถึงร้านอัตโนมัติ — เราได้รับสำเนา',                    value: 'auto' },
        { title: 'Off · ไม่ส่งต่อ — แจ้งเราอย่างเดียว',                                value: 'off' },
      ], layout: 'radio' },
      initialValue: 'manual',
      description: 'มีผลเมื่อกรอก LINE ID ช่องบนแล้วเท่านั้น',
    }),

    defineField({ name: 'website', title: 'Website · เว็บไซต์',  type: 'url',    components: { input: createRetrieveFromPartyInput('website') },
      description: 'ไม่ขึ้นบนจอ — ลิงก์บนหน้าร้านในมือถือหลังสแกน. Not shown on the kiosk.',
    }),
    // Opening Hours FIRST — the booking schedule below reads open/close from here
    // (single entry point; no duplicate time fields — user rule 2026-07-15).
    // ── Opening days + hours — STRUCTURED, same shape as the /provider web form
    // (day chips + time dropdowns). Single source for on-screen display AND the
    // booking calendar: closed days disappear from the date picker.
    defineField({
      name: 'openDays',
      title: '📺 Open Days · วันเปิดร้าน',
      type: 'array',
      of: [{ type: 'string' }],
      components: { input: OpenDaysInput },   // 7 chips on one row (default grid wraps at 4)
      options: { list: [
        { title: 'M', value: 'mon' }, { title: 'T', value: 'tue' },
        { title: 'W', value: 'wed' }, { title: 'T', value: 'thu' },
        { title: 'F', value: 'fri' }, { title: 'S', value: 'sat' },
        { title: 'S', value: 'sun' },
      ] },
      initialValue: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      description: 'วันที่ปิด จะหายจากปฏิทินจองอัตโนมัติ · Closed days disappear from the booking calendar',
    }),
    defineField({
      name: 'openTime',
      title: 'Open',
      fieldset: 'openHours',
      type: 'string',
      description: 'e.g. "10:00"',
      validation: (Rule) => Rule.regex(/^\d{1,2}:\d{2}$/).error('รูปแบบต้องเป็น HH:MM เช่น 10:00 · Must be HH:MM — publish ไม่ได้จนกว่าจะถูกรูปแบบ'),
    }),
    defineField({
      name: 'closeTime',
      title: 'Close',
      fieldset: 'openHours',
      type: 'string',
      description: 'e.g. "22:00"',
      validation: (Rule) =>
        Rule.custom((v: string | undefined, ctx) => {
          if (!v) return true
          if (!/^\d{1,2}:\d{2}$/.test(v)) return 'รูปแบบต้องเป็น HH:MM เช่น 22:00 · Must be HH:MM'
          const o = String((ctx.document as { openTime?: string } | undefined)?.openTime ?? '')
          const hm = (s: string) => { const m = s.match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null }
          const ot = hm(o), ct = hm(v)
          if (ot != null && ct != null && ot >= ct) return 'เวลาปิดต้องหลังเวลาเปิด · Close must be after open'
          return true
        }).error(),
    }),
    // Legacy free-text hours — superseded by the structured fields above; kept
    // hidden so old documents load cleanly and old builds can still read it.
    defineField({ name: 'openingHours', title: 'Opening Hours (legacy)', type: 'string', hidden: true }),

    // ── ตารางรับคิวของร้าน — ค่าหลักที่ทุก offer ปุ่มจองใช้ร่วมกัน ─────────────
    // Open/close มาจาก Opening Hours ด้านบน (shopBooking() parses it) — ก้อนนี้
    // จึงมีเฉพาะเรื่องคิวล้วน ๆ · Field-level merge: offer.booking wins per field.
    // (Merge implemented in kiosk shopBooking/mergeBooking + handoff fetchOffer — keep in sync.)
    defineField({
      name: 'booking',
      title: '📺 Booking Schedule · ตารางรับคิวของร้าน',
      type: 'object',
      description: 'Uses Open Days/Time above · ใช้วัน-เวลาเปิดร้านด้านบนอัตโนมัติ — ตั้งครั้งเดียว ทุก offer ปุ่มจองใช้ร่วมกัน',
      options: { collapsible: true, collapsed: true, columns: 2 },
      fields: [
        defineField({ name: 'slotMinutes', title: 'Slot Minutes', type: 'number' }),
        defineField({ name: 'capacityPerSlot', title: 'Capacity Per Slot', type: 'number' }),
        defineField({ name: 'breakStart', title: 'Break Start', type: 'string', description: 'e.g. "14:00"', validation: (Rule) => Rule.regex(/^\d{1,2}:\d{2}$/).error('รูปแบบต้องเป็น HH:MM · Must be HH:MM') }),
        defineField({ name: 'breakEnd', title: 'Break End', type: 'string', description: 'e.g. "17:00"', validation: (Rule) => Rule.regex(/^\d{1,2}:\d{2}$/).error('รูปแบบต้องเป็น HH:MM · Must be HH:MM') }),
        defineField({ name: 'daysAhead', title: 'Days Selectable · เปิดให้เลือกกี่วัน', type: 'number', description: 'Calendar days offered, counted from the first bookable day · นับจากวันแรกที่จองได้' }),
        defineField({ name: 'minNotice', title: 'Min Notice · ต้องจองล่วงหน้า', type: 'number', description: 'Blocks last-minute bookings, unit below · เช่น 3 ชั่วโมง / 7 วัน · เว้นว่าง = รับถึงนาทีสุดท้าย' }),
        defineField({ name: 'minNoticeUnit', title: 'Min Notice Unit · หน่วย', type: 'string', options: { list: [ { title: 'Hours · ชั่วโมง', value: 'hours' }, { title: 'Days · วัน', value: 'days' } ], layout: 'radio' }, initialValue: 'hours' }),
      ],
    }),
    defineField({ name: 'amenities', title: '📺 Amenities · จุดเด่นร้าน', type: 'array', of: [{ type: 'string' }], options: { layout: 'tags' },
      description: 'ขึ้นเป็นแถวป้ายเล็กในป๊อปอัป "ดูร้าน" บนจอ (และบนหน้าร้านในมือถือ) — เว้นว่างแล้วป๊อปอัปจะโชว์ที่ว่างเปล่า · คำสั้น ๆ คำละป้าย เช่น "ที่จอดรถ" "Wi-Fi" "รับบัตรเครดิต" "สั่งกลับบ้าน" · แนะนำ 3–5 ป้าย. Store highlights — the tag row in the on-screen "View store" popup.',
    }),
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
    // Handoff = the second step of the on-screen popup: the customer has tapped
    // the CTA and now has to get the offer OFF the wall and onto their phone.
    // This field decides which of the two channels that step offers.
    defineField({
      name: 'defaultHandoffType',
      title: '📺 Handoff Channel · ช่องทางรับเรื่องต่อบนจอ',
      type: 'string',
      options: {
        list: [
          { title: 'Both · คิวอาร์โค้ด + กรอกเบอร์ (แนะนำ)', value: 'both' },
          { title: 'QR only · คิวอาร์โค้ดอย่างเดียว',          value: 'qr'   },
          { title: 'Phone only · ให้กรอกเบอร์อย่างเดียว',      value: 'sms'  },
        ],
        layout: 'radio',
      },
      // 'both' matches what the player already assumes when this field is blank.
      // The old 'qr' default silently switched OFF the phone box for every
      // Studio-created provider — a real ad aired QR-only for weeks that way.
      initialValue: 'both',
      description: 'หน้าที่ 2 ของป๊อปอัป (หลังลูกค้ากดปุ่ม CTA) จะให้อะไรบ้าง · Both = โชว์คิวอาร์ให้สแกน และมีช่องกรอกเบอร์ให้คนที่ไม่สแกน — ได้ lead มากที่สุด · QR only = สแกนอย่างเดียว ไม่เก็บเบอร์ (เหมาะกับร้านที่ไม่มีคนรับสาย) · Phone only = ไม่โชว์คิวอาร์ รับเฉพาะเบอร์โทรกลับ · เบอร์ที่ลูกค้ากรอกจะวิ่งเข้า LINE ตามที่ตั้งใน "Lead Relay Mode" ด้านบน',
    }),
    defineField({
      name: 'unitRef',
      title: '📺 Unit Reference · เลขห้อง',
      type: 'string',
      description: 'ใส่เฉพาะเลขห้อง เช่น "406" ระบบต่อกับเลขที่โครงการให้เอง (project.addressBaseNumber → "120/406") · ใช้กับประกาศขาย/เช่าเท่านั้น — จะขึ้นเป็นป้าย 🔖 บนหน้าคิวอาร์ของป๊อปอัป เพื่อให้ลูกค้าที่ถ่ายรูปจอไว้รู้ว่ากำลังดูห้องไหน · Suffix only; shown as the 🔖 chip on the popup\'s QR step for rent/sale listings.',
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
