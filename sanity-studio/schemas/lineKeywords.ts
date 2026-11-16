import { defineField, defineType } from 'sanity'

// Singleton — _id is always "line-keywords". Shown as "Bot Rules" (the type
// name stays lineKeywords: the LINE bot reads it by that name). LINE tabs: the
// words people type (Commands) and, below them, what the AI assistant may say
// (AI Assistant) — one place to review the whole bot, not two schemas.
//
// What a person can type to the aquamx LINE bot, one row per command. The bot
// (aquamx-handoff lib/keywords.ts) re-reads this list every five minutes, so a
// word added here works without a code change or a deploy. The code keeps the
// same list as a fallback, and ignores a row left with no words at all rather
// than letting it switch a command off. Rows marked "Fixed in code" are
// patterns, not word lists — shown here so the whole bot can be reviewed in
// one place, but changed only in code.

const WHO = [
  { title: 'Everyone',                     value: 'everyone' },
  { title: 'Customer (looking for a room)', value: 'customer' },
  { title: 'Owner (listing a room)',       value: 'owner' },
  { title: 'Shop / provider',              value: 'shop' },
  { title: 'Team (listing group)',         value: 'team' },
  { title: 'Leasing agent',                value: 'juristic' },
  { title: 'Team (leasing group)',         value: 'teamLeasing' },
]

const words = (name: string, title: string, description: string) => defineField({
  name, title, description, type: 'array', of: [{ type: 'string' }],
  options: { layout: 'tags' },
  readOnly: ({ parent }) => Boolean((parent as { fixed?: boolean } | undefined)?.fixed),
  hidden: ({ parent }) => Boolean((parent as { fixed?: boolean } | undefined)?.fixed),
})

const LEAD_TYPES = [
  { title: 'Find a condo (findCondo)',       value: 'findCondo' },
  { title: 'List a property (listProperty)', value: 'listProperty' },
  { title: 'Shop / provider (shop)',         value: 'shop' },
  { title: 'Order (order)',                  value: 'order' },
  { title: 'Leasing — juristic person (leasing)', value: 'leasing' },
]

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const TOPICS = [
  { title: 'Unit availability',        value: 'availability' },
  { title: 'Prices',                   value: 'price' },
  { title: 'Distance to BTS / MRT',    value: 'transit' },
  { title: 'How aquamx works',         value: 'howItWorks' },
  { title: 'Fees & packages (rate card)', value: 'fees' },
  { title: 'Building facilities',      value: 'facilities' },
]

export default defineType({
  name: 'lineKeywords',
  title: 'Bot Rules',
  type: 'document',
  groups: [
    { name: 'commands', title: 'LINE · Commands', default: true },
    { name: 'ai',       title: 'LINE · AI Assistant' },
    { name: 'groups',   title: 'LINE · Team Groups' },
    { name: 'facebook', title: 'Facebook Outreach' },
  ],
  fields: [
    defineField({
      name: 'commands',
      group: 'commands',
      title: 'Commands',
      description: 'What people can type to the aquamx LINE bot. Case, extra spaces and a closing "." "!" "?" are ignored. Changes take effect within 5 minutes.',
      type: 'array',
      options: { disableActions: ['add', 'addBefore', 'addAfter', 'duplicate', 'remove', 'copy'] },
      of: [{
        type: 'object',
        name: 'command',
        title: 'Command',
        fields: [
          defineField({ name: 'title', title: 'Command', type: 'string', readOnly: true }),
          defineField({ name: 'who', title: 'Who uses it', type: 'string', readOnly: true, options: { list: WHO } }),
          defineField({ name: 'does', title: 'What it does', type: 'text', rows: 2, readOnly: true }),
          words('exact', 'Exact words', 'The whole message is one of these, e.g. "หาห้อง" or "English".'),
          words('startsWith', 'Starts with', 'The message begins with one of these, e.g. "หาห้อง 2 นอน".'),
          words('contains', 'Anywhere in the message', 'A sentence containing one of these, e.g. "I don\'t speak Thai". English words match whole words only.'),
          defineField({
            name: 'pattern', title: 'Pattern (fixed in code)', type: 'text', rows: 2, readOnly: true,
            hidden: ({ parent }) => !(parent as { fixed?: boolean } | undefined)?.fixed,
          }),
          defineField({ name: 'fixed', title: 'Fixed in code', type: 'boolean', readOnly: true, hidden: true }),
          defineField({ name: 'key', title: 'Command ID', type: 'string', readOnly: true,
            description: 'Used by the code — never changed here.' }),
        ],
        preview: {
          select: { title: 'title', who: 'who', exact: 'exact', startsWith: 'startsWith', contains: 'contains', fixed: 'fixed', pattern: 'pattern' },
          prepare({ title, who, exact, startsWith, contains, fixed, pattern }) {
            const w = [...(exact ?? []), ...(startsWith ?? []).map((x: string) => `${x}…`), ...(contains ?? []).map((x: string) => `…${x}…`)]
            const whoTitle = WHO.find(x => x.value === who)?.title ?? who ?? ''
            return {
              title: `${fixed ? '🔒 ' : ''}${title ?? ''}`,
              subtitle: `${whoTitle} · ${fixed ? String(pattern ?? '') : (w.slice(0, 6).join(', ') + (w.length > 6 ? ` +${w.length - 6}` : ''))}`,
            }
          },
        },
      }],
      validation: Rule => Rule.custom((rows: any[] | undefined) => {
        if (!rows?.length) return true
        const seen = new Map<string, string>()
        const clashes: string[] = []
        const empty: string[] = []
        for (const r of rows) {
          if (r?.fixed) continue
          const list = [...(r.exact ?? []), ...(r.startsWith ?? [])].map(norm).filter(Boolean)
          if (!list.length && !(r.contains ?? []).length) empty.push(r.title ?? r.key)
          // the two language rows share "Thai"-type phrases on purpose — English is checked first
          if (String(r.key ?? '').startsWith('lang.')) continue
          for (const wd of list) {
            const other = seen.get(wd)
            if (other && other !== r.title) clashes.push(`"${wd}" is in both "${other}" and "${r.title}"`)
            else seen.set(wd, r.title)
          }
        }
        if (empty.length) return `No words left in: ${empty.join(', ')} — the bot keeps using its built-in list for these`
        if (clashes.length) return { message: `The same word is in two commands: ${clashes.slice(0, 3).join('; ')}`, level: 'warning' } as any
        return true
      }).warning(),
    }),
    // ── AI Assistant — what the AI may answer in LINE OA chats ─────────────
    // The code enforces the hard rules no matter what is set here: it only ever
    // shows the AI units listed with aquamx and published, never owner
    // contacts, and it always hands orders, viewings, price negotiation,
    // complaints, money and contracts to the team. These fields can narrow
    // what the AI says — never widen it.
    defineField({
      name: 'ai', group: 'ai', title: 'AI Assistant', type: 'object',
      options: { collapsible: false },
      fields: [
        defineField({ name: 'mode', title: 'Mode', type: 'string', initialValue: 'draft',
          description: 'Draft only: every AI reply waits for a team member to tap Send in the group. Auto-send: replies on the allowed topics go straight out (the team still sees each one).',
          options: { layout: 'radio', list: [
            { title: 'Draft only — the team taps Send', value: 'draft' },
            { title: 'Auto-send on allowed topics',     value: 'auto'  },
            { title: 'Off — no AI drafts',              value: 'off'   },
          ] } }),
        defineField({ name: 'allowedTopics', title: 'Topics the AI may answer', type: 'array', of: [{ type: 'string' }],
          options: { list: TOPICS, layout: 'grid' },
          initialValue: ['availability', 'price', 'transit', 'howItWorks', 'fees'] }),
        defineField({ name: 'forbiddenTopics', title: 'Never answer (always hand to the team)', type: 'array', of: [{ type: 'string' }],
          options: { layout: 'tags' },
          description: 'Added on top of the ones the code always hands over (orders, viewings, negotiation, complaints, money, contracts). e.g. "discount", "owner name".',
          initialValue: ['discount', 'owner name', 'legal advice'] }),
        defineField({ name: 'unitScope', title: 'Units the AI may mention', type: 'string', initialValue: 'listed',
          description: 'The minimum is fixed in code: only units listed with aquamx by their owner AND published. This can only make it stricter.',
          options: { layout: 'radio', list: [
            { title: 'Listed with aquamx & published (the minimum)',             value: 'listed' },
            { title: '…and not already in a viewing or a negotiation',          value: 'listedFree' },
          ] } }),
        defineField({ name: 'maxUnits', title: 'Max units per answer', type: 'number', initialValue: 3,
          validation: Rule => Rule.min(1).max(5) }),
        defineField({ name: 'handoffTh', title: 'When the AI cannot answer — Thai', type: 'string',
          initialValue: 'เดี๋ยวทีมงานติดต่อกลับในแชตนี้นะคะ' }),
        defineField({ name: 'handoffEn', title: 'When the AI cannot answer — English', type: 'string',
          initialValue: 'Our team will reply to you right here.' }),
        defineField({ name: 'faq', title: 'FAQ — answer exactly like this', type: 'array',
          of: [{ type: 'object', name: 'faqItem', fields: [
            defineField({ name: 'question', title: 'Question', type: 'string' }),
            defineField({ name: 'answerTh', title: 'Answer (Thai)', type: 'text', rows: 3 }),
            defineField({ name: 'answerEn', title: 'Answer (English)', type: 'text', rows: 3 }),
          ], preview: { select: { title: 'question', subtitle: 'answerTh' } } }] }),
        // ── Shop guide — free-text questions in a shop's own LINE group / 1:1 ──
        // Answers come from the shop's own state (package, quota, ads in review,
        // the invoice sent into that chat, the step left half-done) as plain
        // chat text; price / discount / contract / complaint / document changes
        // always go to the team (aquamx-handoff lib/shop-guide).
        defineField({ name: 'shopGuideMode', title: 'Shop guide — Mode', type: 'string', initialValue: 'auto',
          description: 'Free-text questions from a shop in its LINE group or 1:1 chat. Auto: the guide answers at once from the shop\'s own data and copies each answer to aquamx-shop. Draft: the answer waits in aquamx-shop for the team to tap Send. Price, discount, contract, complaint and document changes always go to the team.',
          options: { layout: 'radio', list: [
            { title: 'Auto — answer the shop directly, copy to aquamx-shop', value: 'auto'  },
            { title: 'Draft — the team taps Send in aquamx-shop',           value: 'draft' },
            { title: 'Off',                                                  value: 'off'   },
          ] } }),
        defineField({ name: 'shopGuideHandoffTh', title: 'Shop guide — when handed to the team (Thai)', type: 'string',
          initialValue: 'รับเรื่องแล้วครับ ทีมงานขอดูให้ก่อน เดี๋ยวตอบในแชทนี้ครับ' }),
        defineField({ name: 'shopGuideHandoffEn', title: 'Shop guide — when handed to the team (English)', type: 'string',
          initialValue: 'Got it — our team will look into this and reply right here.' }),
      ],
    }),
    // ── Team Groups — which LINE group hears about what ───────────────────
    // One row per team group. The bot (aquamx-handoff lib/team-groups.ts)
    // re-reads this every five minutes: adding a group is adding a row and
    // publishing — no deploy. The four rows the code was born with keep their
    // keys (notify, listing, shop, condofinder); a row with no group ID falls
    // back to the code's own ID for that key.
    defineField({
      name: 'teamGroups', group: 'groups', title: 'Team Groups', type: 'array',
      description: 'Invite the bot to the LINE group, type "id" there to get the group ID, then add a row. The relay (customer messages batched into the group, "รับเรื่อง" button) works for every row with Handoff on.',
      of: [{
        type: 'object', name: 'teamGroup', title: 'Team group',
        fields: [
          defineField({ name: 'key', title: 'Key', type: 'string', validation: Rule => Rule.required().regex(/^[a-z][a-z0-9-]*$/, { name: 'lowercase letters, digits and dashes' }),
            description: 'Short name the code and logs use, e.g. "order". Never changed once in use.' }),
          defineField({ name: 'label', title: 'Label on cards', type: 'string', validation: Rule => Rule.required(),
            description: 'Printed on cards: "→ aquamx-order".' }),
          defineField({ name: 'groupId', title: 'LINE group ID', type: 'string',
            description: 'Starts with "C". Type "id" in the group and the bot replies with it.' }),
          defineField({ name: 'leadTypes', title: 'Lead types routed here', type: 'array', of: [{ type: 'string' }],
            options: { list: LEAD_TYPES, layout: 'grid' },
            description: 'A customer whose open lead is one of these types is reported to this group. The row that names the type wins — remove it from the other row.' }),
          defineField({ name: 'handoff', title: 'Handoff enabled', type: 'boolean', initialValue: true,
            description: 'Off: cards still go here, but without the "รับเรื่อง" button and without the customer card.' }),
          defineField({ name: 'customerCardAfterMin', title: 'Customer card after idle (min)', type: 'number',
            description: 'Blank = the global value below.', validation: Rule => Rule.min(0).max(60) }),
          defineField({ name: 'batchEveryMin', title: 'Batch every (min)', type: 'number',
            description: 'Blank = the global value below.', validation: Rule => Rule.min(1).max(60) }),
        ],
        preview: {
          select: { key: 'key', label: 'label', groupId: 'groupId', leadTypes: 'leadTypes', handoff: 'handoff' },
          prepare({ key, label, groupId, leadTypes, handoff }) {
            return { title: `${label ?? key ?? ''}  (${key ?? ''})`,
              subtitle: `${groupId ? String(groupId).slice(0, 8) + '…' : 'code default'} · ${(leadTypes ?? []).join(', ') || 'no lead types'}${handoff === false ? ' · handoff off' : ''}` }
          },
        },
      }],
      validation: Rule => Rule.custom((rows: any[] | undefined) => {
        if (!rows?.length) return true
        const keys = new Set<string>(); const types = new Map<string, string>()
        for (const r of rows) {
          if (keys.has(r?.key)) return `Two rows share the key "${r.key}"`
          keys.add(r?.key)
          for (const t of r?.leadTypes ?? []) {
            if (types.has(t)) return `Lead type "${t}" is in both "${types.get(t)}" and "${r.key}" — keep it in one row`
            types.set(t, r.key)
          }
        }
        return true
      }),
    }),
    defineField({
      name: 'relay', group: 'groups', title: 'Customer messages → team (relay)', type: 'object',
      options: { collapsible: false },
      fields: [
        defineField({ name: 'customerCardAfterMin', title: 'Customer card after idle (min)', type: 'number', initialValue: 1,
          description: 'When a customer stops typing for this long, has asked a question, and nobody has tapped "รับเรื่อง": send them one "ส่งถึงทีมงานแล้ว" card. 0 = immediately.',
          validation: Rule => Rule.min(0).max(60) }),
        defineField({ name: 'batchEveryMin', title: 'Batch into the group every (min)', type: 'number', initialValue: 5,
          description: 'Messages from one customer are collected and sent to the team group as one card per customer, this often.',
          validation: Rule => Rule.min(1).max(60) }),
        defineField({ name: 'questionMarkers', title: 'Words that make a message a question', type: 'array', of: [{ type: 'string' }],
          options: { layout: 'tags' },
          description: 'A message containing one of these (or "?") counts as a question: it is highlighted on the team card and earns the customer card. Anything else is "noted" only.',
          initialValue: ['ไหม', 'มั้ย', 'มั๊ย', 'หรือเปล่า', 'รึเปล่า', 'หรือยัง', 'รึยัง', 'ปะ', 'เท่าไหร่', 'เท่าไร', 'ยังไง', 'อย่างไร', 'ได้มั้ย', 'กี่', 'ที่ไหน', 'เมื่อไหร่', 'ทำไม', 'อะไร', 'ขอ', 'ช่วย', 'do you', 'is there', 'are there', 'available', 'how much', 'how many', 'how long', 'can i', 'can you', 'could you', 'when', 'where', 'which', 'what', 'why', 'please'] }),
      ],
    }),
    // ── Facebook Outreach — owners / agents who post a unit and welcome agents ──
    // Read by the scheduled Claude tasks at the start of every run (listing
    // watch → first message → replies → unit goes live → link sent back).
    // Nothing in the LINE bot code reads this field. Edit and publish: the next
    // run follows the new rules. Each person's own history stays in their lead.
    defineField({
      name: 'fbOutreach', group: 'facebook', title: 'Facebook Outreach', type: 'object',
      options: { collapsible: false },
      description: 'Rules for contacting owners and agents who post a unit on Facebook and welcome agents. The scheduled tasks read these before every run.',
      fields: [
        defineField({ name: 'mode', title: 'Mode', type: 'string', initialValue: 'draft',
          description: 'Auto: messages that follow the rules below go out without waiting. Draft: every message waits for approval. Off: read and record only.',
          options: { layout: 'radio', list: [
            { title: 'Auto — send by the rules below',   value: 'auto'  },
            { title: 'Draft — wait for approval',        value: 'draft' },
            { title: 'Off — read and record only',       value: 'off'   },
          ] } }),
        defineField({ name: 'areas', title: 'Areas', type: 'array', of: [{ type: 'string' }], options: { layout: 'tags' } }),
        defineField({ name: 'minRentTHB', title: 'Minimum rent (THB / month)', type: 'number',
          description: 'Rental posts below this are skipped. Sale posts are not limited.' }),
        defineField({ name: 'contactWhen', title: 'Contact when the post says', type: 'array', of: [{ type: 'string' }], options: { layout: 'tags' },
          description: 'Words that show agents are welcome or the owner posted it.' }),
        defineField({ name: 'skipWhen', title: 'Never contact when', type: 'array', of: [{ type: 'string' }], options: { layout: 'tags' },
          description: 'Words in the post, or situations, that mean do not contact.' }),
        defineField({ name: 'sendAs', title: 'Send as', type: 'string', initialValue: 'pageThenPersonal',
          options: { layout: 'radio', list: [
            { title: 'aquamx page; personal profile only when the page cannot', value: 'pageThenPersonal' },
            { title: 'aquamx page only',                                        value: 'page' },
          ] } }),
        defineField({ name: 'commentAfterMessage', title: 'Comment on the post after messaging', type: 'boolean', initialValue: true }),
        defineField({ name: 'commentTh', title: 'Comment — Thai', type: 'string' }),
        defineField({ name: 'commentEn', title: 'Comment — English', type: 'string' }),
        defineField({ name: 'maxPerDay', title: 'Max first messages per day', type: 'number', initialValue: 10,
          validation: Rule => Rule.min(0).max(30) }),
        defineField({ name: 'firstMessageTh', title: 'First message — Thai', type: 'text', rows: 10,
          description: 'Placeholders in {braces} are filled from the post: {name} {saleOrRent} {project} {floor} {sqm} {price} {group}. {screenSentence} is added only for buildings with an aquamx screen.' }),
        defineField({ name: 'firstMessageEn', title: 'First message — English', type: 'text', rows: 10 }),
        defineField({ name: 'screenSentenceTh', title: 'Lobby screen sentence — Thai', type: 'text', rows: 2 }),
        defineField({ name: 'screenSentenceEn', title: 'Lobby screen sentence — English', type: 'text', rows: 2 }),
        defineField({ name: 'attachSampleCover', title: 'Attach one sample cover', type: 'boolean', initialValue: true,
          description: 'A cover of a unit we already market — same building and same rent / sale side when there is one.' }),
        defineField({ name: 'wording', title: 'Wording rules', type: 'array', of: [{ type: 'string' }],
          description: 'Apply to every message sent to an owner or agent.' }),
        defineField({ name: 'replyRules', title: 'When they reply', type: 'array',
          of: [{ type: 'object', name: 'replyRule', title: 'Reply rule', fields: [
            defineField({ name: 'situation', title: 'Situation', type: 'string', validation: Rule => Rule.required() }),
            defineField({ name: 'action', title: 'Action', type: 'string', validation: Rule => Rule.required(),
              options: { list: [
                { title: 'Put the unit on the website, then send the link', value: 'listAndSendLink' },
                { title: 'Send the reply below',                            value: 'reply' },
                { title: 'Note it in the lead — no reply',                  value: 'noteOnly' },
                { title: 'Close the lead — no reply',                       value: 'close' },
                { title: 'Do not reply — draft and report to Sakchai',      value: 'report' },
              ] } }),
            defineField({ name: 'replyTh', title: 'Reply — Thai', type: 'text', rows: 3 }),
            defineField({ name: 'replyEn', title: 'Reply — English', type: 'text', rows: 3 }),
          ], preview: { select: { title: 'situation', subtitle: 'action' } } }] }),
        defineField({ name: 'listingChecklist', title: 'Before a unit goes live', type: 'array', of: [{ type: 'string' }],
          description: 'Every line must be true before the unit is published.' }),
        defineField({ name: 'linkMessageTh', title: 'Link message — Thai', type: 'text', rows: 3,
          description: 'Sent in the same chat once the unit is live. {url} is the unit page.' }),
        defineField({ name: 'linkMessageEn', title: 'Link message — English', type: 'text', rows: 3 }),
        defineField({ name: 'stopAndReport', title: 'Stop and report when', type: 'array', of: [{ type: 'string' }] }),
        defineField({ name: 'record', title: 'What to record', type: 'array', of: [{ type: 'string' }] }),
      ],
    }),
  ],
  preview: { prepare: () => ({ title: 'Bot Rules' }) },
})
