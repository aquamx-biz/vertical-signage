#!/usr/bin/env node
/**
 * restyle-analysis.mjs — รีดีไซน์ buildings-analysis.html (dashboard วิเคราะห์ตลาด
 * จาก pipeline) ให้เข้าระบบแบรนด์ AquaMX โดยไม่แตะเนื้อหา/JS ของหน้า
 *
 * Usage:  node tools/restyle-analysis.mjs [input.html] [output.html]
 * Default: C:/Users/Lenovo/Downloads/buildings-analysis.html
 *          → buildings-analysis-redesign.html ข้างกัน + สำเนา _analysis-preview.html ใน repo
 *
 * หลักการ (register: product — เครื่องมือภายใน):
 * - ฟอนต์ Anuphan + IBM Plex Sans Thai (มาตรฐานเครื่องมือภายในที่ทีมเลือกแล้ว)
 * - Navy เป็นโครง · bronze จุดเดียวสำหรับแท็บพิเศษ · semantic เขียว/เหลือง/แดง
 *   เฉพาะข้อมูล (yield/CV) — เลิกแท็บสีรุ้ง
 * - เลิก gradient, เลิก side-stripe (เปลี่ยนเป็นกรอบเต็ม + พื้น tint)
 * - สเกลตัวอักษรเดียว: 13–15px data, หัวข้อไล่น้ำหนักไม่ไล่สี
 * - แท็บตึก sticky ระหว่าง scroll หน้ายาว
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const input = process.argv[2] ?? 'C:/Users/Lenovo/Downloads/buildings-analysis.html'
const output = process.argv[3] ?? input.replace(/\.html$/, '-redesign.html')

let html = readFileSync(input, 'utf8')

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --navy:#0E3361; --navy-deep:#072147; --ink:#0B1B33; --muted:#5C6B82; --ink40:#8B98AE;
    --line:#E6E9F1; --bg:#F4F6FA; --card:#FFFFFF;
    --bronze:#C9864C; --bronze-strong:#A36738; --bronze-soft:#F6E5D0;
    --ok-bg:#E7F6EE; --ok-line:#BFE5CF; --ok-ink:#1B6B41;
    --warn-bg:#FDF3DC; --warn-line:#F1DCA8; --warn-ink:#7A5410;
    --bad-bg:#FBEAE8; --bad-line:#F0C6C0; --bad-ink:#8F2F24;
    --tint:#EEF2F8;
  }
  body{font-family:"Anuphan","IBM Plex Sans Thai","Sarabun",Tahoma,sans-serif;background:var(--bg);
    color:var(--ink);padding:0 28px 72px;line-height:1.55;font-size:15px;
    font-feature-settings:"tnum" 1}
  .c{max-width:1440px;margin:0 auto}

  h1{font-size:24px;font-weight:700;color:var(--navy);letter-spacing:-0.01em;padding-top:30px;margin-bottom:4px;text-wrap:balance}
  h2{font-size:17px;font-weight:700;color:var(--navy);margin:26px 0 10px}
  h3{font-size:13.5px;font-weight:700;color:var(--ink);margin:26px 0 8px}
  h4{font-size:12.5px;font-weight:600;color:var(--muted);margin:16px 0 6px}
  .sub{color:var(--muted);font-size:13.5px;margin-bottom:18px}

  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px;margin-bottom:20px}
  .muted{color:var(--ink40);font-size:11.5px;font-weight:normal}
  .muted2{color:var(--muted);font-size:12.5px}

  .sec-hdr{background:none;color:var(--navy);padding:0 0 8px;border-bottom:2px solid var(--navy);
    border-radius:0;margin:44px 0 18px;font-size:16px;font-weight:800;scroll-margin-top:70px}

  /* ── แท็บตึก: sticky ระหว่างไล่หน้า ── */
  .tabs{display:flex;gap:6px;margin:0 -28px 16px;padding:12px 28px;flex-wrap:wrap;
    position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 88%,transparent);
    backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
  .tab{background:var(--card);border:1px solid var(--line);padding:8px 15px;border-radius:8px;
    font-size:13px;cursor:pointer;font-weight:600;color:var(--muted);font-family:inherit;
    transition:border-color .15s,color .15s,background .15s}
  .tab:hover{border-color:var(--navy);color:var(--navy);background:var(--card)}
  .tab.active{background:var(--navy);color:#fff;border-color:var(--navy)}
  /* แท็บพิเศษสามตัว = บรอนซ์ (accent เดียวของหน้า) */
  .tab-compare,.tab-aggregate,.tab-recs{background:var(--bronze-soft);border-color:#E8CFAE;color:var(--bronze-strong);font-weight:700}
  .tab-compare:hover,.tab-aggregate:hover,.tab-recs:hover{border-color:var(--bronze-strong);color:var(--bronze-strong);background:var(--bronze-soft)}
  .tab-compare.active,.tab-aggregate.active,.tab-recs.active{background:var(--bronze-strong);border-color:var(--bronze-strong);color:#fff}

  .controls{background:var(--card);border:1px solid var(--line);padding:10px 16px;border-radius:10px;
    margin:12px 0;display:flex;align-items:center;gap:12px;font-size:12.5px;flex-wrap:wrap}
  .controls label{font-weight:600;color:var(--navy)}
  .controls select{padding:6px 10px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;
    background:var(--card);color:var(--navy);font-weight:600;font-family:inherit}
  .controls .divider{color:var(--line)}
  .controls .ctx{margin-left:auto;color:var(--muted)}

  /* ── ตารางข้อมูล ── */
  /* ห้าม overflow:hidden บนตาราง — จะฆ่า sticky thead · มุมโค้งทำที่เซลล์มุมแทน */
  table.m{width:100%;border-collapse:separate;border-spacing:0;font-size:13.5px;background:var(--card);
    margin-bottom:10px;border:1px solid var(--line);border-radius:10px}
  table.m thead th:first-child{border-top-left-radius:9px}
  table.m thead th:last-child{border-top-right-radius:9px}
  table.m tr:last-child td:first-child{border-bottom-left-radius:9px}
  table.m tr:last-child td:last-child{border-bottom-right-radius:9px}
  table.m thead th{position:sticky;top:var(--tabs-h,56px);z-index:5}
  .m th{background:var(--navy);color:#fff;font-weight:600;font-size:11.5px;text-transform:uppercase;
    letter-spacing:0.04em;padding:9px 11px;border:0;border-right:1px solid #1a4576;text-align:center;white-space:nowrap}
  .m th:last-child{border-right:0}
  table.m td{padding:7px 11px;border:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);
    text-align:center;vertical-align:top;font-size:13.5px;color:var(--ink)}
  table.m td:last-child{border-right:0}
  table.m tr:last-child td{border-bottom:0}
  table.m tbody tr:nth-child(even) td{background:#FAFBFD}
  table.m td:first-child{font-weight:600;text-align:left;color:var(--navy)}
  table.m td.num{text-align:right;font-variant-numeric:tabular-nums}
  table.m .cv{font-size:14.5px;font-weight:700;color:var(--navy);line-height:1.15}
  table.m .cm{font-size:11.5px;color:var(--muted);line-height:1.25}
  table.m .empty{color:#C6CDDA;font-style:normal;background:#FAFBFD}
  table.m .tot,table.m tbody tr td.tot{background:var(--tint);font-weight:700;color:var(--navy)}
  table.m .tot-row td{background:var(--tint)!important;font-weight:700}
  table.m .yh{background:var(--ok-bg);color:var(--ok-ink);font-weight:700}
  table.m .ym{background:var(--warn-bg);color:var(--warn-ink);font-weight:700}
  table.m .yl{background:var(--bad-bg);color:var(--bad-ink);font-weight:700}
  table.m.compact td{padding:5px 9px;font-size:12.5px}
  table.m.sortable th{cursor:pointer;user-select:none}
  table.m.sortable th:hover{background:var(--navy-deep)}
  table.m.sortable th::after{content:"↕";font-size:9px;margin-left:4px;opacity:0.5}
  table.m.sortable th.sort-asc::after{content:"↑";opacity:1}
  table.m.sortable th.sort-desc::after{content:"↓";opacity:1}

  .m-tabs{display:flex;gap:4px;margin:14px 0 0;border-bottom:2px solid var(--navy)}
  .m-tab{background:transparent;border:1px solid transparent;border-bottom:none;padding:7px 14px;
    border-radius:8px 8px 0 0;font-size:12.5px;cursor:pointer;font-weight:600;color:var(--muted);font-family:inherit}
  .m-tab:hover{color:var(--navy);background:var(--tint)}
  .m-tab.active{background:var(--navy);color:#fff;border-color:var(--navy)}
  .m51-panel,.m5-panel{padding-top:2px}
  a.blink{color:var(--navy);text-decoration:none;border-bottom:1px dotted var(--ink40)}
  a.blink:hover{border-bottom:1px solid var(--navy)}
  .m5-panel h3,.m51-panel h3{margin-top:8px}
  .low-n{color:var(--bad-ink);font-size:10.5px}

  /* ── การ์ดตัวเลขสรุป ── */
  .ins{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0}
  .i{background:var(--card);padding:16px 18px;border-radius:12px;border:1px solid var(--line)}
  .i .v{font-size:24px;font-weight:700;color:var(--navy);letter-spacing:-0.01em;margin:5px 0 2px;font-variant-numeric:tabular-nums}
  .i .v.yh{color:var(--ok-ink);background:none} .i .v.ym{color:var(--warn-ink);background:none} .i .v.yl{color:var(--bad-ink);background:none}
  .i .l{font-size:11.5px;color:var(--muted);font-weight:600}
  .i .d{font-size:12px;color:var(--ink40);margin-top:2px}

  .sect{display:none} .sect.active{display:block}
  .bhdr{border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:16px}
  .bsub{color:var(--muted);font-size:13px;margin-top:4px}
  .bmeta{color:var(--ok-ink);font-size:12px;margin-top:8px;padding:3px 10px;background:var(--ok-bg);
    border:1px solid var(--ok-line);border-radius:999px;display:inline-block;font-weight:700}

  /* ── กรอบอธิบาย framework (เลิก side-stripe → กรอบเต็ม + tint) ── */
  .cwid{background:var(--tint);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:16px 0}
  .cwt{font-size:14.5px;font-weight:700;color:var(--navy);margin-bottom:10px}
  .cwl{font-size:13px;color:var(--ink);margin-bottom:6px}
  .cwl code,.cwt2 td:nth-child(2) code,.cwn code{background:var(--card);border:1px solid var(--line);
    padding:2px 8px;border-radius:6px;font-size:12px;color:var(--navy);font-family:inherit;font-weight:600}
  .cwt2{border-collapse:collapse;margin-top:10px;background:transparent;box-shadow:none;width:auto}
  .cwt2 td{padding:5px 12px;border:none;background:transparent;font-size:13px;text-align:left}
  .cwt2 .cwlbl{font-weight:700;color:var(--navy);font-size:13.5px;padding-right:8px;background:transparent}
  .cwt2 td:nth-child(3){color:var(--muted);font-size:12px}
  .cwn{margin-top:12px;color:var(--muted);font-size:11.5px}

  .intro{background:var(--ok-bg);border:1px solid var(--ok-line);padding:14px 18px;border-radius:12px;margin-bottom:16px;color:var(--ok-ink)}
  .intro b{color:var(--ok-ink)} .intro .info{font-size:13px;color:var(--ok-ink);margin-top:6px}
  .callout{background:var(--warn-bg);border:1px solid var(--warn-line);border-radius:10px;padding:10px 14px;margin:8px 0;font-size:12.5px;color:var(--warn-ink)}
  .callout.ok{background:var(--ok-bg);border-color:var(--ok-line);color:var(--ok-ink)}
  .callout.warn{background:var(--bad-bg);border-color:var(--bad-line);color:var(--bad-ink)}
  .findings-block{margin-top:8px}
  .floor-warn{background:var(--bad-bg);border:1px solid var(--bad-line);padding:10px 14px;border-radius:10px;font-size:12.5px;color:var(--bad-ink);margin-bottom:12px}

  .p-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
  .p-card{background:var(--card);padding:16px 18px;border-radius:12px;border:1px solid var(--line)}
  .p-title{font-size:14px;font-weight:700;color:var(--navy);margin-bottom:8px}
  .p-body p{font-size:13px;color:var(--ink);margin-bottom:8px}
  .p-body b{color:var(--navy)}
  .fnd-list,.ns-list{display:flex;flex-direction:column;gap:8px}
  .fnd,.ns{background:var(--card);padding:10px 14px;border-radius:10px;font-size:13px;color:var(--ink);border:1px solid var(--line)}
  .fnd b,.ns b{color:var(--navy)}

  @media (prefers-reduced-motion: reduce){*{transition:none!important}}
  @media (max-width:900px){body{padding:0 14px 48px}.tabs{margin:0 -14px 14px;padding:10px 14px}}
`

// 1. แทน stylesheet เดิมทั้งก้อน
html = html.replace(/<style>[\s\S]*?<\/style>/, '<style>' + CSS + '\n</style>')

// 2. ฝังฟอนต์ Anuphan ลงไฟล์ตรง ๆ (base64) — เปิดออฟไลน์/ใน viewer ที่บล็อก
//    Google Fonts ก็ยังได้ฟอนต์ถูกต้อง (ตัวเดียวกับเครื่องมือ units)
async function embedAnuphan() {
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Anuphan:wght@400;600;700;800&display=swap'
  // UA ต้องเป็นสตริงเบราว์เซอร์เต็ม — UA แปลก ๆ Google จะส่ง CSS ฟอร์แมตเก่า (ไม่มี subset/woff2)
  const css = await (await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' } })).text()
  // เอาเฉพาะ subset thai + latin (ตัด vietnamese/latin-ext ที่ไม่ใช้)
  const blocks = [...css.matchAll(/\/\* (\w[\w-]*) \*\/\s*(@font-face \{[\s\S]*?\})/g)]
    .filter(m => m[1] === 'thai' || m[1] === 'latin')
  let out = ''
  for (const [, , block] of blocks) {
    const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1]
    if (!url) continue
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    out += block.replace(url, `data:font/woff2;base64,${buf.toString('base64')}`) + '\n'
  }
  return out
}
const fontCss = await embedAnuphan()
console.log(`  ฝังฟอนต์ ${(fontCss.length / 1024).toFixed(0)} KB (thai+latin ×4 น้ำหนัก)`)
html = html.replace('<style>', '<style>\n' + fontCss)

// 3. sync ความสูงแถบแท็บ (พับหลายบรรทัดได้) → offset ของ sticky thead
if (!html.includes('_syncTabsH')) {
  html = html.replace('</body>',
    `<script>const _syncTabsH=()=>document.documentElement.style.setProperty('--tabs-h',((document.querySelector('.tabs')?.getBoundingClientRect().height??0))+'px');addEventListener('resize',_syncTabsH);_syncTabsH();</script>\n</body>`)
}

writeFileSync(output, html)
console.log('✓', output, `(${(html.length / 1024).toFixed(0)} KB)`)

// สำเนาไว้ preview ผ่าน localhost ของ repo
const preview = join(root, '_analysis-preview.html')
writeFileSync(preview, html)
console.log('✓', preview, '(preview)')
