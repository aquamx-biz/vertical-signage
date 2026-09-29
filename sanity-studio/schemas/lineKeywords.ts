import { defineField, defineType } from 'sanity'

// Singleton — _id is always "line-keywords".
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
]

const words = (name: string, title: string, description: string) => defineField({
  name, title, description, type: 'array', of: [{ type: 'string' }],
  options: { layout: 'tags' },
  readOnly: ({ parent }) => Boolean((parent as { fixed?: boolean } | undefined)?.fixed),
  hidden: ({ parent }) => Boolean((parent as { fixed?: boolean } | undefined)?.fixed),
})

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export default defineType({
  name: 'lineKeywords',
  title: 'LINE Keywords',
  type: 'document',
  fields: [
    defineField({
      name: 'commands',
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
  ],
  preview: { prepare: () => ({ title: 'LINE Keywords' }) },
})
