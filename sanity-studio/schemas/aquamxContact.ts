import { defineField, defineType } from 'sanity'

// Global singleton — _id is always "aquamxContact-global".
//
// How a person reaches aquamx, kept in one place because it is quoted in
// several: the LINE bot prints the phone on a confirmed viewing so someone
// already standing in a lobby has something to dial, and anywhere else that
// needs "call us" should read it here rather than hardcode a number that
// then goes stale in six places at once.

export default defineType({
  name: 'aquamxContact',
  title: 'aquamx Contact · ช่องทางติดต่อ aquamx',
  type: 'document',
  fields: [
    defineField({
      name: 'phone', title: 'Phone · เบอร์โทร', type: 'string',
      description: 'เบอร์ที่ลูกค้าโทรหาแอดมินได้ — ขึ้นบนการ์ดยืนยันนัด เผื่อหากันไม่เจอหน้าตึก',
    }),
    defineField({
      name: 'lineId', title: 'LINE ID · ไลน์', type: 'string',
      description: 'เช่น @aquamx',
    }),
    defineField({
      name: 'email', title: 'Email · อีเมล', type: 'string',
    }),
    defineField({
      name: 'hours', title: 'Hours · เวลาทำการ', type: 'string',
      description: 'เช่น "ทุกวัน 09:00-20:00" — ว่างไว้ได้ ถ้าไม่อยากผูกเวลา',
    }),
  ],
  preview: {
    select: { title: 'phone', subtitle: 'lineId' },
    prepare: ({ title, subtitle }) => ({
      title: title || 'ยังไม่ได้ใส่เบอร์',
      subtitle: subtitle || '',
    }),
  },
})
