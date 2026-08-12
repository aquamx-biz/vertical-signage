#!/usr/bin/env node
/**
 * seed-demand-sources.mjs — ลงทะเบียนแหล่งเก็บ "โพสต์คนหาห้อง" ลง Sanity
 *
 * Usage:  node --env-file=.env tools/seed-demand-sources.mjs [--write]
 *         default: dry-run · --write ต้องมี SANITY_WRITE_TOKEN (สิทธิ์ Editor)
 *
 * ตัวเลข members / postsPerDay / postsPerMonth มาจากหน้า "เกี่ยวกับ → กิจกรรม"
 * ของแต่ละกลุ่มเอง สำรวจด้วยมือเมื่อ 2026-08-08
 *
 * postsPerDay ของ 3 กลุ่มใหญ่ = postsPerMonth ÷ 30 โดย Facebook แสดงยอดเดือน
 * ตันที่ "1.0 หมื่น" เท่ากันหมด → ของจริงคือ 10,000 ขึ้นไป ตัวเลขนี้จึงต่ำกว่าความเป็นจริง
 *
 * สร้างเป็น published ตรง ๆ (ไม่ใช่ draft) เพราะตัวเก็บข้อมูลอ่านด้วย
 * perspective=published เหมือน pipeline อื่นในโปรเจกต์
 */
const args  = process.argv.slice(2)
const WRITE = args.includes('--write')

const TOKEN = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_TOKEN
if (!TOKEN) { console.error('SANITY_WRITE_TOKEN / SANITY_TOKEN not set'); process.exit(1) }
if (WRITE && !process.env.SANITY_WRITE_TOKEN) {
  console.error('--write ต้องมี SANITY_WRITE_TOKEN (สิทธิ์ Editor) — ตัวอ่านอย่างเดียวจะโดน 403')
  process.exit(1)
}
const API = 'https://awjj9g8u.api.sanity.io/v2024-01-01'
const CHECKED = '2026-08-08'

// active = true เฉพาะแหล่งที่ยืนยันด้วยตาแล้วว่ามีโพสต์คนหาห้องจริง
const SOURCES = [
  {
    sourceType: 'fb_group', sourceId: '2157264477895406',
    sourceName: 'BANGKOK EXPATS Apartment / House / Condo for Rent and Sale Bangkok Thailand',
    url: 'https://www.facebook.com/groups/2157264477895406/',
    privacy: 'public', members: 169948, postsPerDay: 333, postsPerMonth: 10000,
    membersPerWeek: 1106, demandLevel: 'area', postLang: 'mixed', active: true,
    note: 'ยืนยันแล้วว่ามีโพสต์คนหาห้องจริง — เก็บได้ 20 โพสต์จาก 6 คำค้น (8 ส.ค. 2026) '
        + 'คนหาเป็นภาษาอังกฤษเกือบทั้งหมด ระบุย่าน/สถานี ไม่ระบุชื่อตึก '
        + 'ยอดเดือนที่ Facebook แสดงตันที่ 10,000 — ของจริงมากกว่านี้',
  },
  {
    sourceType: 'fb_group', sourceId: 'Bangkokcondoforsaleandrent',
    sourceName: 'Bangkok condo apartment house for sale & rent',
    url: 'https://www.facebook.com/groups/Bangkokcondoforsaleandrent/',
    privacy: 'public', members: 105583, postsPerDay: 333, postsPerMonth: 10000,
    membersPerWeek: 215, demandLevel: 'supply_only', postLang: 'mixed', active: false,
    note: 'กฎกลุ่มพูดเรื่องวิธีลงประกาศทรัพย์ล้วน ไม่มีข้อไหนพูดถึงการโพสต์หาห้อง',
  },
  {
    sourceType: 'fb_group', sourceId: '661207761960248',
    sourceName: 'Bangkok Expats condo-house for rent (short term / long term)',
    url: 'https://www.facebook.com/groups/661207761960248/',
    privacy: 'public', members: 93188, postsPerDay: 333, postsPerMonth: 10000,
    membersPerWeek: 479, demandLevel: 'supply_only', postLang: 'mixed', active: false,
    note: 'ยังไม่ได้สำรวจเนื้อโพสต์ — ชื่อกลุ่มเป็นฝั่งประกาศ',
  },
  {
    sourceType: 'fb_group', sourceId: 'bangkokshorttermrentals',
    sourceName: 'Bangkok - Lease Takeover / Short-Long term Rentals / Pet Friendly / Space sharing',
    url: 'https://www.facebook.com/groups/bangkokshorttermrentals/',
    privacy: 'public', members: 60523, postsPerDay: 0, postsPerMonth: 4,
    membersPerWeek: 0, demandLevel: 'area', postLang: 'mixed', active: false,
    note: 'กฎกลุ่มข้อ 4 เขียนว่า "Seekers only — no listings or ads" = กลุ่ม demand ล้วน '
        + 'ตรงกับที่เราต้องการเป๊ะ แต่ทั้งเดือนมี 4 โพสต์ · สมาชิก 60,523 คนแต่ตายแล้ว '
        + 'กฎข้อ 3 ระบุว่าแอดมินส่งโพสต์+โปรไฟล์ให้เอเจนต์ที่ยืนยันแล้ว',
  },
  {
    sourceType: 'fb_group', sourceId: '1536783979737516',
    sourceName: 'Bangkok Expats - Apartments & Condos for Rent/Sale',
    url: 'https://www.facebook.com/groups/1536783979737516/',
    privacy: 'private', members: 23936, postsPerDay: 48, postsPerMonth: 1428,
    membersPerWeek: 3, demandLevel: 'area', postLang: 'mixed', active: false,
    note: 'กลุ่มส่วนตัว — ห้ามเก็บ ถึงกฎข้อ 1 จะอนุญาตให้โพสต์หาห้องก็ตาม',
  },
  {
    sourceType: 'fb_group', sourceId: 'Rentpropertybangkok',
    sourceName: 'Rent Property in Bangkok Thailand',
    url: 'https://www.facebook.com/groups/Rentpropertybangkok/',
    privacy: 'public', members: 23376, postsPerDay: 242, postsPerMonth: 7258,
    membersPerWeek: 142, demandLevel: 'supply_only', postLang: 'mixed', active: false,
    note: 'กฎกลุ่มเขียนว่า ONLY OWNERS and TENANTS / NO AGENTS PLEASE '
        + 'แต่ฟีดจริงเป็นประกาศเอเจนต์ · ค้นคำว่า "หาห้องเช่า" ในกลุ่มได้ผลเป็นประกาศปล่อยเช่า',
  },
  {
    sourceType: 'fb_group', sourceId: 'bangkokcondos',
    sourceName: 'BANGKOK CONDO FINDERS',
    url: 'https://www.facebook.com/groups/bangkokcondos/',
    privacy: 'public', members: 17259, postsPerDay: 3, postsPerMonth: 82,
    membersPerWeek: 36, demandLevel: 'area', postLang: 'en', active: false,
    note: 'คำอธิบายกลุ่ม: for people looking to rent or buy a condo = ตั้งมาเพื่อคนหาห้อง '
        + 'แต่ทั้งเดือนมี 82 โพสต์ · โพสต์บนสุดเป็นประกาศปล่อยเช่า',
  },
  {
    sourceType: 'fb_group', sourceId: '1261497837902026',
    sourceName: 'FIHOME ขายบ้านหรู กรุงเทพ by THREETREE STUDIO',
    url: 'https://www.facebook.com/groups/1261497837902026/',
    privacy: 'public', members: 14579, postsPerDay: 30, postsPerMonth: 901,
    membersPerWeek: 3, demandLevel: 'supply_only', postLang: 'th', active: false,
    note: 'ผลค้นจาก Google ระบุชื่อกลุ่มนี้ผิดเป็น Bangkok Expats / Long-Short term Rental '
        + 'ของจริงเป็นกลุ่มขายบ้านหรู',
  },
  {
    sourceType: 'portal', sourceId: 'livinginsider-looking',
    sourceName: 'LivingInsider — Looking to Match',
    url: 'https://looking.livinginsider.com/',
    privacy: 'public', seekerYield: 49, demandLevel: 'project', postLang: 'th', active: true,
    note: 'กระดานคนโพสต์หาทรัพย์ · ดึงได้โดยไม่ต้องล็อกอิน (POST /page/{n} ทีละ 5 โพสต์) '
        + 'อ่าน 40 หน้า = 202 โพสต์ → เป็นคนหาจริง 99 (49%) · ระบุชื่อโครงการ 16% '
        + 'ส่วนใหญ่เป็นเอเจนต์หาของให้ลูกค้าที่มีอยู่แล้ว ไม่ใช่ผู้เช่าโพสต์เอง',
  },
]

const slug = s => s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()

const mutations = SOURCES.map(s => ({
  createOrReplace: {
    _id: `demandSource-${slug(s.sourceId)}`,
    _type: 'demandSource',
    lastChecked: CHECKED,
    ...s,
  },
}))

if (!WRITE) {
  console.log('DRY RUN — จะเขียน', mutations.length, 'แหล่ง (ใส่ --write เพื่อเขียนจริง)\n')
  for (const m of mutations) {
    const d = m.createOrReplace
    console.log(`  ${d.active ? '●' : '○'} ${d.sourceName}`)
    console.log(`     ${d._id} · ${d.privacy} · ${(d.members ?? 0).toLocaleString()} สมาชิก`
      + ` · ${d.postsPerDay ?? '—'}/วัน · ${d.demandLevel}`)
  }
  process.exit(0)
}

const r = await fetch(`${API}/data/mutate/production`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mutations }),
})
if (!r.ok) { console.error(`mutate ${r.status}: ${await r.text()}`); process.exit(1) }
console.log(`เขียนแล้ว ${mutations.length} แหล่ง`)
