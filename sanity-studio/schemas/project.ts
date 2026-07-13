import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'project',
  title: 'Project',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'code',
      title: 'Project Code',
      type: 'slug',
      description: 'Used as ?project=CODE in the kiosk URL. Must be unique across all projects.',
      options: {
        source: 'title',
        slugify: (input: string) =>
          input.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'isActive',
      title: 'Active',
      type: 'boolean',
      initialValue: false,
      description: 'Only active projects are built and deployed to GitHub.',
    }),

    // ── Origin — set automatically when created from a signed contract ────────
    defineField({
      name:     'projectSite',
      title:    'Project Site',
      type:     'reference',
      to:       [{ type: 'projectSite' }],
      description: 'The property this project belongs to.',
    }),
    defineField({
      name:        'sourceContracts',
      title:       'Source Contracts',
      type:        'array',
      of:          [{
        type: 'reference',
        to:   [{ type: 'contract' }],
        options: {
          filter: ({ document }: { document: any }) => {
            const existing = (document.sourceContracts ?? [])
              .map((c: any) => c._ref)
              .filter(Boolean)
            if (!existing.length) return { filter: '', params: {} }
            return {
              filter: '!(_id in $excludeIds) && !("drafts." + _id in $excludeIds)',
              params: { excludeIds: existing },
            }
          },
        },
      }],
      description: 'The signed contracts linked to this project (one per building).',
      validation:  Rule => Rule.custom((items?: any[]) => {
        if (!items?.length) return true
        const refs = items.map(i => i._ref).filter(Boolean)
        return refs.length === new Set(refs).size
          ? true
          : 'Each contract can only be added once.'
      }),
    }),

    // ── Operational status — set via actions only, never edited manually ─────
    defineField({
      name:         'status',
      title:        'Project Status',
      type:         'string',
      readOnly:     true,
      initialValue: 'active',
      description:  'Controlled by Suspend / Terminate actions — not editable directly.',
      options:      { list: [
        { title: '🟢 Active',     value: 'active'      },
        { title: '⏸  Suspended',  value: 'suspended'   },
        { title: '🔴 Terminated', value: 'terminated'  },
      ]},
    }),
    defineField({
      name:     'terminatedAt',
      title:    'Terminated At',
      type:     'datetime',
      readOnly: true,
    }),
    defineField({
      name:     'terminationReason',
      title:    'Termination Reason',
      type:     'text',
      rows:     2,
      readOnly: true,
    }),

    // ── Location ──────────────────────────────────────────────────────────────
    defineField({
      name: 'address',
      title: 'Address',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'addressBaseNumber',
      title: 'Address Base Number',
      type: 'number',
      description: 'e.g. 120 → combined with provider.unitRef to form unit address "120/406".',
    }),
    defineField({
      name: 'mapUrl',
      title: 'Map URL',
      type: 'url',
      description: 'Google Maps link for this project location.',
    }),

    // ── URLs ──────────────────────────────────────────────────────────────────
    defineField({
      name: 'kioskBaseUrl',
      title: 'Kiosk Base URL (Netlify site)',
      type: 'url',
      description: 'URL จอจริงบน Netlify — เช่น https://mahogany-tower.netlify.app (นี่คือ Netlify site ของโปรเจ็คนี้)',
    }),
    defineField({
      name: 'kioskUrl',
      title: 'Kiosk URL (full)',
      type: 'url',
      description: 'Full kiosk URL including ?project=code. Copy this for device setup.',
    }),
    defineField({
      name: 'handoffBaseURL',
      title: 'Handoff Base URL',
      type: 'url',
      description: 'Base URL for handoff / QR links on mobile landing pages.',
    }),

    // ── Deploy / Ops — where this screen lives and who to call ───────────────
    // Click-through links + on-site knowledge, so debugging "จอไม่อัปเดต/จอดับ"
    // starts from this doc instead of hunting through dashboards. NO SECRETS
    // here — the dataset is publicly readable.
    defineField({
      name: 'githubRepoUrl',
      title: 'GitHub Repo (build ปลายทาง)',
      type: 'url',
      description: 'repo ที่ระบบ push จอตึกนี้ไป — เช็ค commit ล่าสุดเมื่อจอไม่อัปเดต · ปกติ = https://github.com/aquamx-biz/{code}',
    }),
    defineField({
      name: 'netlifyAdminUrl',
      title: 'Netlify Dashboard',
      type: 'url',
      description: 'หน้า deploys/logs ของ site นี้บน app.netlify.com — เช็ค build fail ได้ตรงนี้',
    }),
    defineField({
      name: 'yodeckScreenIds',
      title: 'Yodeck Screen IDs',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'ชื่อจอใน Yodeck (ตึกเดียวมีหลายจอได้ เช่น noble-be19a, noble-be19b) — ใช้ผูกอีเมลแจ้งจอดับกับโปรเจ็คนี้',
    }),
    defineField({
      name: 'onsiteContact',
      title: 'ผู้ติดต่อหน้างาน',
      type: 'string',
      description: 'นิติ/ช่างประจำตึก — ชื่อ · เบอร์ (จอดับต้องโทรหาใคร)',
    }),
    defineField({
      name: 'opsNotes',
      title: 'Ops Notes',
      type: 'text',
      rows: 3,
      description: 'โน้ตหน้างาน: ตำแหน่งตู้, เครือข่ายที่ใช้, ข้อตกลงพิเศษ ฯลฯ — ห้ามใส่ password/token',
    }),
  ],

  preview: {
    select: { title: 'title', code: 'code.current', isActive: 'isActive' },
    prepare({ title, code, isActive }) {
      return {
        title:    title ?? '(untitled)',
        subtitle: `code: ${code ?? '—'}${isActive === false ? '  ·  INACTIVE' : ''}`,
      }
    },
  },
})
