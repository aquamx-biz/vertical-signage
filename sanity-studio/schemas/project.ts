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

    // ── ISP ในอาคาร — ค่ายไหนใช้ได้ และเป็น "สายอะไร" ─────────────────────────
    // ชนิดสายเป็นตัวตัดสินว่าแพ็กเกจชุดไหนโฆษณาได้ที่ตึกนี้ ไม่ใช่ชื่อค่าย: ตึกที่
    // AIS ยังเป็น VDSL รับ 300/300 ไม่ได้ ต่อให้ AIS ให้บริการอยู่จริง
    // ที่มา: 39 by Sansiri (ส.ค. 2026) — AIS Fibre3 ขึ้นจอไปแล้วทั้งที่ตึกยังเป็น
    // สายทองแดง กว่าจะรู้ก็ตอนสื่อ live แล้ว ฟิลด์นี้มีไว้ให้รู้ "ก่อน" ไม่ใช่ "หลัง"
    defineField({
      name: 'ispAvailability',
      title: '🌐 อินเทอร์เน็ตในอาคาร (ISP / ชนิดสาย)',
      type: 'array',
      description:
        'หนึ่งแถวต่อหนึ่งค่ายที่ให้บริการในตึกนี้ — ตึกเดียวมีได้หลายค่าย และแต่ละค่ายอาจคนละชนิดสาย · ' +
        'ใช้ตัดสินว่าจะลงสื่อแพ็กเกจอินเทอร์เน็ตชุดไหนได้',
      of: [{
        type: 'object',
        name: 'ispLine',
        fields: [
          defineField({
            name: 'isp',
            title: 'ผู้ให้บริการ',
            type: 'string',
            options: { list: [
              { title: 'TrueOnline', value: 'true' },
              { title: 'AIS | 3BB',  value: 'ais'  },
              { title: 'NT',         value: 'nt'   },
            ]},
            validation: Rule => Rule.required(),
          }),
          defineField({
            name: 'tech',
            title: 'ชนิดสาย',
            type: 'string',
            description: 'ไม่รู้จริงให้เลือก "ยังไม่ตรวจสอบ" — อย่าเดาว่าเป็นไฟเบอร์ เพราะเดาผิดแล้วลูกบ้านสมัครไม่ได้',
            options: { list: [
              { title: '🟢 Fiber (FTTx) — ลงแพ็กเกจไฟเบอร์ได้',          value: 'fiber'   },
              { title: '🟡 VDSL / สายทองแดง — ลงแพ็กเกจไฟเบอร์ไม่ได้',   value: 'vdsl'    },
              { title: '🔴 ยังไม่ให้บริการในตึกนี้',                      value: 'none'    },
              { title: '⚪ ยังไม่ตรวจสอบ',                               value: 'unknown' },
            ]},
            initialValue: 'unknown',
            validation: Rule => Rule.required(),
          }),
          // เพดานจริงของสาย — กันเคสลงแพ็กเกจที่เร็วเกินกว่าสายจะไหว แม้ชนิดสายจะถูก
          defineField({ name: 'maxDown', title: 'ดาวน์โหลดสูงสุด (Mbps)', type: 'number', validation: Rule => Rule.min(0) }),
          defineField({ name: 'maxUp',   title: 'อัปโหลดสูงสุด (Mbps)',   type: 'number', validation: Rule => Rule.min(0) }),
          defineField({
            name: 'verifiedAt',
            title: 'ตรวจสอบเมื่อ',
            type: 'date',
            description: 'ค่ายอัปเกรดสายเงียบ ๆ ได้ — ข้อมูลเก่าเกิน 6 เดือนควรเช็คซ้ำก่อนลงสื่อ',
          }),
          defineField({ name: 'note', title: 'หมายเหตุ', type: 'string' }),
        ],
        preview: {
          select: { isp: 'isp', tech: 'tech', d: 'maxDown', u: 'maxUp', at: 'verifiedAt' },
          prepare({ isp, tech, d, u, at }) {
            const ISP:  Record<string, string> = { true: 'TrueOnline', ais: 'AIS | 3BB', nt: 'NT' }
            const TECH: Record<string, string> = {
              fiber: '🟢 Fiber', vdsl: '🟡 VDSL', none: '🔴 ไม่ให้บริการ', unknown: '⚪ ยังไม่ตรวจสอบ',
            }
            const speed = (d || u) ? `สูงสุด ${d ?? '?'}/${u ?? '?'} Mbps` : ''
            const when  = at ? `ตรวจ ${at}` : '⚠️ ยังไม่ระบุวันตรวจ'
            return {
              title:    `${ISP[isp] ?? isp ?? '(ยังไม่เลือกค่าย)'}  ·  ${TECH[tech] ?? tech ?? ''}`,
              subtitle: [speed, when].filter(Boolean).join('  ·  '),
            }
          },
        },
      }],
      // ค่ายเดียวกันสองแถว = ข้อมูลขัดกันเอง แล้ว build จะเลือกไม่ถูกว่าเชื่อแถวไหน
      validation: Rule => Rule.custom((rows?: any[]) => {
        if (!rows?.length) return true
        const isps = rows.map(r => r?.isp).filter(Boolean)
        return isps.length === new Set(isps).size ? true : 'ค่ายเดียวกันใส่ได้แถวเดียว'
      }),
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

    // ── Virtual site — AR kiosk on residents' phones for buildings with no screen yet ──
    // The baked player is NOT pushed to a public Netlify site for these projects;
    // build.mjs posts it to app.aquamx.co.th which serves it only behind a one-time,
    // short-lived token issued after LINE login + marker scan. Settings here are read
    // by /v/{code} on app.aquamx.co.th; nothing secret is stored (dataset is public).
    defineField({
      name:  'virtualSite',
      title: '📱 Virtual Site (AR on phone)',
      type:  'object',
      description: 'Turn this on for a building we have not entered yet: residents scan the lobby sticker, log in with LINE, and see the 43" screen in AR at the planned spot.',
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name: 'enabled', title: 'Enabled', type: 'boolean', initialValue: false,
          description: 'On = build publishes the player privately for /v/{code}. Keep the Netlify site unlinked for this project.',
        }),
        defineField({
          name: 'tokenTtlSec', title: 'Token lifetime after scan (seconds)', type: 'number', initialValue: 120,
          description: 'How long the one-time link stays valid before the page loads. 120 s is enough to log in and open the camera.',
          validation: Rule => Rule.min(30).max(900),
        }),
        defineField({
          name: 'refreshSec', title: 'Keep-alive interval while open (seconds)', type: 'number', initialValue: 30,
          description: 'The player renews its token this often while the page stays open; close the page = must scan again.',
          validation: Rule => Rule.min(10).max(300),
        }),
        defineField({
          name: 'gpsRadiusM', title: 'GPS radius from Project Site location (m)', type: 'number', initialValue: 150,
          description: 'Phones outside this distance from the Project Site "Map location" are refused. 0 = no GPS check.',
          validation: Rule => Rule.min(0).max(2000),
        }),
        defineField({
          name: 'maxScansPerDay', title: 'Max scans per person per day', type: 'number', initialValue: 20,
          validation: Rule => Rule.min(1).max(500),
        }),
        defineField({
          name: 'markerImage', title: 'Sticker marker image', type: 'image',
          description: 'The exact artwork printed on the lobby sticker (A5). The AR page trains on this image to find the sticker in the camera.',
        }),
        defineField({
          name: 'markerWidthCm', title: 'Printed sticker width (cm)', type: 'number', initialValue: 14.8,
          description: 'Real printed width — A5 portrait = 14.8 cm. Sets the scale of the virtual screen.',
          validation: Rule => Rule.min(5).max(100),
        }),
        defineField({
          name: 'screenOffsetRightCm', title: 'Virtual screen: offset right of sticker (cm)', type: 'number', initialValue: 60,
          description: 'Negative = left of the sticker.',
        }),
        defineField({
          name: 'screenOffsetDownCm', title: 'Virtual screen: offset below sticker centre (cm)', type: 'number', initialValue: 0,
          description: 'Negative = above. Use the planned install spot so the 43" screen stands where the real one will.',
        }),
        defineField({
          name: 'publishedAt', title: 'Last published', type: 'datetime', readOnly: true,
          description: 'Set by build.mjs each time the private player is published.',
        }),
      ],
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
      name: 'lineGroupId',
      title: 'LINE Group ID · กลุ่มไลน์นิติของโครงการ',
      type: 'string',
      description: 'กลุ่ม LINE ที่นิติ/หน้างานใช้ส่งรูปประกาศขึ้นจอ — เพิ่มบอท OA เข้ากลุ่มแล้วพิมพ์ "id" ในกลุ่ม บอทจะตอบรหัสกลุ่ม (ขึ้นต้นด้วย C) มาวางที่นี่ · เว้นว่าง = โครงการนี้ไม่รับประกาศทางไลน์',
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
