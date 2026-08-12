import { defineType, defineField } from 'sanity'

/**
 * Demand Source — แหล่งที่เราอ่านโพสต์ "คนกำลังหาห้อง"
 *
 * ทะเบียนกลุ่ม/พอร์ทัลที่ตัวเก็บข้อมูลจะไปอ่าน — เปิดปิดทีละแหล่งได้จากที่นี่
 * ตัวเลข members / postsPerDay มาจากหน้า "เกี่ยวกับ → กิจกรรม" ของกลุ่มเอง
 *
 * seekerYield คือตัวชี้ขาดว่าคุ้มเก็บต่อไหม — กลุ่มที่โพสต์เยอะแต่เป็นประกาศ
 * ปล่อยเช่าทั้งหมด มีค่าเท่ากับศูนย์สำหรับงานนี้ ไม่ว่าจะมีสมาชิกกี่แสนคน
 */
export default defineType({
  name: 'demandSource',
  title: 'Demand Source · แหล่งเก็บความต้องการ',
  type: 'document',
  fields: [
    defineField({
      name: 'sourceType', title: 'Source type · ประเภทแหล่ง', type: 'string',
      options: { list: [
        { title: 'Facebook group · กลุ่มเฟซบุ๊ก', value: 'fb_group' },
        { title: 'Portal · เว็บประกาศ',            value: 'portal' },
      ] },
      validation: R => R.required(),
    }),
    defineField({
      name: 'sourceId', title: 'Source ID · รหัสแหล่ง', type: 'string',
      description: 'group id ของ Facebook หรือชื่อย่อของพอร์ทัล — ใช้เป็นคีย์ในตารางดิบ',
      validation: R => R.required(),
    }),
    defineField({
      name: 'sourceName', title: 'Name · ชื่อแหล่ง', type: 'string',
      validation: R => R.required(),
    }),
    defineField({ name: 'url', title: 'URL · ลิงก์', type: 'url' }),
    defineField({
      name: 'privacy', title: 'Privacy · การเข้าถึง', type: 'string',
      options: { list: [
        { title: 'Public · สาธารณะ',  value: 'public' },
        { title: 'Private · ส่วนตัว', value: 'private' },
      ] },
      description: 'กลุ่มส่วนตัวห้ามเก็บ — ตั้ง active = false',
    }),

    // ── ขนาดและกิจกรรม (จากหน้า "เกี่ยวกับ" ของกลุ่มเอง) ────────────────────
    defineField({ name: 'members',       title: 'Members · สมาชิก',                type: 'number' }),
    defineField({ name: 'postsPerDay',   title: 'Posts / day · โพสต์ต่อวัน',        type: 'number' }),
    defineField({ name: 'postsPerMonth', title: 'Posts / month · โพสต์ต่อเดือน',    type: 'number' }),
    defineField({
      name: 'membersPerWeek', title: 'New members / week · สมาชิกใหม่ต่อสัปดาห์', type: 'number',
    }),

    // ── คุณภาพ — ตัวตัดสินว่าเก็บต่อหรือเลิก ────────────────────────────────
    defineField({
      name: 'seekerYield', title: 'Seeker yield % · สัดส่วนโพสต์คนหาห้อง', type: 'number',
      description: 'ว่างไว้จนกว่าจะเก็บรอบแรก · ต่ำกว่า 2% = พิจารณาปิด',
    }),
    defineField({
      name: 'demandLevel', title: 'Demand level · ระดับที่ระบุได้', type: 'string',
      options: { list: [
        { title: 'Project · ระบุชื่อตึก',   value: 'project' },
        { title: 'Area · ระบุแค่ย่าน',      value: 'area' },
        { title: 'Supply only · มีแต่ประกาศ', value: 'supply_only' },
      ] },
      description: 'แหล่งที่ระบุชื่อตึกได้มีค่ากับเรามากที่สุด เพราะจอเราอยู่ในตึก',
    }),
    defineField({
      name: 'postLang', title: 'Language · ภาษาโพสต์', type: 'string',
      options: { list: [
        { title: 'Thai · ไทย',      value: 'th' },
        { title: 'English · อังกฤษ', value: 'en' },
        { title: 'Mixed · ปนกัน',    value: 'mixed' },
      ] },
    }),

    // ── การควบคุม ──────────────────────────────────────────────────────────
    defineField({
      name: 'active', title: 'Active · เก็บข้อมูลจากแหล่งนี้', type: 'boolean',
      initialValue: false,
      description: 'ปิดไว้ก่อนเป็นค่าตั้งต้น — เปิดเฉพาะแหล่งที่ยืนยันแล้วว่ามีของ',
    }),
    defineField({ name: 'lastChecked', title: 'Last checked · สำรวจล่าสุด', type: 'date' }),
    defineField({ name: 'note', title: 'Note · บันทึก', type: 'text', rows: 3 }),
  ],

  preview: {
    select: {
      title: 'sourceName', members: 'members', ppd: 'postsPerDay',
      active: 'active', level: 'demandLevel', privacy: 'privacy',
    },
    prepare: ({ title, members, ppd, active, level, privacy }) => ({
      title: `${active ? '● ' : '○ '}${title}`,
      subtitle: [
        members ? `${members.toLocaleString()} สมาชิก` : null,
        ppd != null ? `${ppd}/วัน` : null,
        level,
        privacy === 'private' ? 'ส่วนตัว — ห้ามเก็บ' : null,
      ].filter(Boolean).join(' · '),
    }),
  },
})
