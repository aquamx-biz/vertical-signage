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
  title: 'Marketing Channel',
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

    // ── Posting — where we may post our own listings (11 Nov 2026) ─────────────
    // One registry for both jobs: reading demand (active) and posting listings (postingActive).
    // The poster picks listing × channel pairs from these fields — never from a hand-written plan —
    // so a for-sale unit cannot land in a rent-only group and a listing is not posted twice.
    defineField({ name: 'shortCode', title: 'Short code', type: 'string',
      description: 'Label used in tables and logs, e.g. K1, C36, BL1.' }),
    defineField({ name: 'postingActive', title: 'Post listings here', type: 'boolean', initialValue: false,
      description: 'Off = never post listings in this channel (owner-only groups, groups without a composer).' }),
    defineField({ name: 'accepts', title: 'Accepts', type: 'array', of: [{ type: 'string' }],
      options: { list: [{ title: 'Rent', value: 'rent' }, { title: 'Sale', value: 'sale' }] },
      description: 'Read the group name and rules. A "for rent" group accepts Rent only.' }),
    defineField({ name: 'scope', title: 'Scope', type: 'string',
      options: { list: [
        { title: 'General — any building', value: 'general' },
        { title: 'Building — listed buildings only', value: 'building' },
        { title: 'Owner only — agents may not post', value: 'ownerOnly' },
      ] } }),
    defineField({ name: 'buildings', title: 'Buildings', type: 'array',
      of: [{ type: 'reference', to: [{ type: 'projectSite' }] }],
      hidden: ({ document }) => document?.scope !== 'building',
      description: 'Only listings in these buildings may be posted here.' }),
    defineField({ name: 'buildingCodes', title: 'Building codes', type: 'array', of: [{ type: 'string' }],
      options: { layout: 'tags' },
      hidden: ({ document }) => document?.scope !== 'building',
      description: 'Ref-code prefixes of those buildings, e.g. L24, RM21, NBL — matched against the listing ref code.' }),
    defineField({ name: 'postAs', title: 'Post as', type: 'string',
      options: { list: [
        { title: 'aquamx page', value: 'page' },
        { title: 'Personal profile', value: 'personal' },
      ] } }),
    defineField({ name: 'repostDays', title: 'Days between posts of one listing', type: 'number',
      description: 'Minimum days before the same listing may be posted here again. Empty = post once only.' }),
    defineField({ name: 'needsApproval', title: 'Admin approves posts', type: 'boolean' }),
    defineField({ name: 'captionRules', title: 'Caption rules', type: 'text', rows: 3,
      description: 'What the group requires in a post, e.g. first line AGENT POST, English + Thai, no shared posts.' }),
    defineField({ name: 'rulesCheckedAt', title: 'Rules last read', type: 'date' }),
    defineField({ name: 'note', title: 'Note · บันทึก', type: 'text', rows: 3 }),
  ],

  preview: {
    select: {
      title: 'sourceName', members: 'members', ppd: 'postsPerDay',
      active: 'active', level: 'demandLevel', privacy: 'privacy',
      code: 'shortCode', posting: 'postingActive', accepts: 'accepts',
    },
    prepare: ({ title, members, ppd, active, level, privacy, code, posting, accepts }) => ({
      title: `${active ? '● ' : '○ '}${code ? code + ' · ' : ''}${title}`,
      subtitle: [
        members ? `${members.toLocaleString()} สมาชิก` : null,
        ppd != null ? `${ppd}/วัน` : null,
        level,
        posting ? `post: ${(accepts || []).join('+') || '?'}` : 'no posting',
        privacy === 'private' ? 'ส่วนตัว — ห้ามเก็บ' : null,
      ].filter(Boolean).join(' · '),
    }),
  },
})
