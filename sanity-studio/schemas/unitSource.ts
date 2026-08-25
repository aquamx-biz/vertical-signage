import { defineField, defineType } from 'sanity'

/**
 * Unit Source — ข้อมูลหลังบ้านของแต่ละ unit (dataset: internal — PRIVATE เท่านั้น)
 *
 * คู่กับ unitProfile ใน production ผ่าน refCode
 * เก็บสิ่งที่ห้ามโชว์ public: ชั้นจริง, URL ประกาศต้นทาง, ชื่อ/เบอร์ผู้ติดต่อ (PDPA)
 * ใช้ตอน lead ทักมา: ค้น refCode → เห็นทุกประกาศของห้องนี้ → โทร co-broke
 */
export default defineType({
  name:  'unitSource',
  title: 'Unit Source (contact หลังบ้าน)',
  type:  'document',

  fields: [
    defineField({ name: 'refCode', title: 'Ref Code', type: 'string', validation: R => R.required() }),
    defineField({ name: 'projectName', title: 'Project Name', type: 'string' }),
    defineField({ name: 'floorActual', title: 'Floor (ชั้นจริง)', type: 'number' }),
    ...(['rent', 'sale'] as const).map(li =>
      defineField({
        name: `${li}Listings`, title: li === 'rent' ? 'Listings เช่า' : 'Listings ขาย', type: 'array',
        of: [{
          type: 'object',
          name: `${li}Listing`,
          fields: [
            defineField({ name: 'sourceId', title: 'Source ID', type: 'string', description: 'portal:nativeId — กัน import ซ้ำ' }),
            defineField({ name: 'portal', type: 'string' }),
            defineField({ name: 'url', type: 'url' }),
            defineField({ name: 'price', type: 'number' }),
            defineField({ name: 'posterType', type: 'string', options: { list: ['owner', 'agent', 'unknown'] } }),
            defineField({ name: 'posterName', type: 'string' }),
            defineField({ name: 'phone', type: 'string' }),
            defineField({ name: 'lineId', type: 'string' }),
            defineField({ name: 'lastSeenAt', type: 'date', description: 'รอบ scrape ล่าสุดที่ยังเจอประกาศนี้' }),
            defineField({ name: 'postCreatedAt', title: 'วันที่ลงประกาศ (portal)', type: 'date' }),
            defineField({ name: 'postUpdatedAt', title: 'อัพเดทล่าสุด (portal)', type: 'date',
              description: 'เกิน 90 วัน = โพสต์ค้าง ระบบไม่ใช้ค้ำราคา (ระวัง: agent กดดันประกาศได้ วันที่สดไม่การันตีข้อมูลจริง)' }),
            defineField({ name: 'availableFrom', title: 'ห้องจะว่าง · Available from', type: 'date',
              description: 'ผู้เช่าเดิมยังอยู่ถึงวันนี้ — ก่อนวันนี้ห้ามนับเป็นสต็อกว่าง (ไม่มีค่า = ว่างแล้ว)' }),
          ],
          preview: {
            select: { portal: 'portal', price: 'price', posterName: 'posterName' },
            prepare: ({ portal, price, posterName }: { portal?: string; price?: number; posterName?: string }) => ({
              title: `${portal} · ฿${(price ?? 0).toLocaleString()}`,
              subtitle: posterName || '(ไม่มีชื่อผู้โพสต์)',
            }),
          },
        }],
      })),
    defineField({
      name: 'bestContact', title: 'Best Contact (ทีมสรุปว่าดีลนี้โทรใคร)', type: 'object',
      fields: [
        defineField({ name: 'name', type: 'string' }),
        defineField({ name: 'phone', type: 'string' }),
        defineField({ name: 'role', title: 'Role · ฐานะผู้ลงประกาศ', type: 'string',
          options: { list: [
            { title: 'เจ้าของห้อง · Owner', value: 'owner' },
            { title: 'นายหน้า · Agent',     value: 'agent' },
            { title: 'นิติบุคคล · Juristic', value: 'juristic' },
          ] },
          description: 'ทีมสรุปเอง — posterType ในประกาศเชื่อไม่ได้ นายหน้ามักติ๊ก owner' }),
        defineField({ name: 'lineUserId', title: 'LINE User ID · รหัสผู้ใช้ LINE', type: 'string',
          description: 'ปลายทางสำหรับส่งคำขอนัดชมเข้า LINE ของผู้ลงประกาศโดยตรง (ขึ้นต้น U + 32 ตัว) — '
            + 'ได้มาเมื่อเขาแอด OA แล้วเท่านั้น ว่างไว้ = ทีมโทรแจ้งเอง',
          validation: R => R.regex(/^U[0-9a-f]{32}$/, { name: 'LINE userId' })
            .warning('ต้องขึ้นต้น U ตามด้วยตัวอักษร/ตัวเลข 32 ตัว — LINE ID ที่พิมพ์เอง(@ชื่อร้าน) ส่งข้อความไม่ได้') }),
    defineField({
      name: 'selfManaged', title: 'เจ้าของรับ lead เอง · Owner handles leads', type: 'boolean',
      initialValue: false,
      description: 'เปิด = คำขอนัดชมห้องนี้เด้งตรงถึงเจ้าของ ทีมได้แค่สำเนา (เจ้าของลงประกาศเอง) · '
        + 'ปิด = คำขอเข้าทีมตามปกติ แม้จะรู้ว่าใครเป็นเจ้าของ (เจ้าของฝากทีมขาย)',
    }),
        defineField({ name: 'note', type: 'text', description: 'เช่น "owner ตรง ไม่มีคอมซ้อน รับสายหลัง 18:00"' }),
      ],
    }),
    defineField({
      name: 'cobrokeStatus', title: 'Co-broke Status', type: 'string', initialValue: 'not_contacted',
      options: { list: ['not_contacted', 'contacted', 'agreed', 'declined'] },
    }),
    defineField({ name: 'cobrokeNote', title: 'Co-broke Note', type: 'text' }),
    defineField({
      name: 'contactLog', title: 'Contact Log · บันทึกการติดต่อ', type: 'array',
      description: 'โทร/ทักแล้วจดทันที — รายการใหม่สุดอยู่บนสุด (กด + Add item)',
      of: [{
        type: 'object',
        name: 'contactEntry',
        fields: [
          defineField({ name: 'at', title: 'วัน-เวลา', type: 'datetime', initialValue: () => new Date().toISOString(), validation: R => R.required() }),
          defineField({ name: 'by', title: 'ผู้ติดต่อ (ทีมเรา)', type: 'string' }),
          defineField({ name: 'channel', title: 'ช่องทาง', type: 'string', initialValue: 'call',
            options: { list: ['call', 'line', 'whatsapp', 'email', 'walk-in'] } }),
          defineField({ name: 'outcome', title: 'ผลการติดต่อ', type: 'string',
            options: { list: [
              { title: 'ไม่รับสาย', value: 'no_answer' },
              { title: 'คุยแล้ว — สนใจ', value: 'interested' },
              { title: 'รอตามต่อ', value: 'follow_up' },
              { title: 'นัดดูห้อง', value: 'viewing' },
              { title: 'ปิดดีล', value: 'closed' },
              { title: 'ปฏิเสธ', value: 'declined' },
              { title: 'ห้องไม่ว่างแล้ว', value: 'unavailable' },
            ] } }),
          defineField({ name: 'note', title: 'โน้ต', type: 'text', rows: 3 }),
          defineField({ name: 'nextFollowUp', title: 'นัดตามครั้งถัดไป', type: 'date' }),
        ],
        preview: {
          select: { at: 'at', by: 'by', outcome: 'outcome', note: 'note' },
          prepare: ({ at, by, outcome, note }) => ({
            title: `${(at || '').slice(0, 16).replace('T', ' ')} · ${outcome || '—'}`,
            subtitle: `${by || ''}${note ? ' — ' + note.slice(0, 60) : ''}`,
          }),
        },
      }],
      options: { sortable: true },
    }),
  ],

  preview: {
    select: { refCode: 'refCode', projectName: 'projectName', status: 'cobrokeStatus' },
    prepare: ({ refCode, projectName, status }) => ({
      title: refCode,
      subtitle: `${projectName} · ${status}`,
    }),
  },
})
