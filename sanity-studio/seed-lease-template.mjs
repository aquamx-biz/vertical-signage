// One-off: seed / refresh Lease Document Template v1 (wording moved from the Google
// Docs templates, 8 Oct 2026). Run on a machine with internet:
//   cd sanity-studio && node seed-lease-template.mjs
// Publishes leaseDocTemplate-v1 directly (createOrReplace) and drops any draft.
import { readFileSync } from 'node:fs'
const PROJECT_ID = 'awjj9g8u', DATASET = 'production', API_VER = '2024-01-01'
const TOKEN = process.env.SANITY_WRITE_TOKEN || /TOKEN\s*=\s*'([^']+)'/.exec(readFileSync(new URL('./seed.mjs', import.meta.url), 'utf8'))?.[1]
if (!TOKEN) { console.error('no token'); process.exit(1) }
const doc = {
 "_id": "leaseDocTemplate-v1",
 "version": 1,
 "status": "active",
 "effectiveDate": "2026-10-08",
 "changeNote": "v1 — wording moved from the Google Docs templates (Rental Contract Template v2, Quotation) into Studio; printed by the app in the advertising-document form",
 "quotationTh": {
  "title": "ใบเสนอราคาค่าเช่าพื้นที่ติดตั้งจอโฆษณา",
  "intro": "ใบเสนอราคานี้จัดทำขึ้นเพื่อแจ้งเงื่อนไขและข้อตกลงในการเช่าพื้นที่สำหรับติดตั้งจอโฆษณาดิจิทัลภายในโครงการของท่าน aquamx เสนอจอสัมผัสแนวตั้งคุณภาพสูง ที่ช่วยเพิ่มความสวยงามให้กับทรัพย์สิน สื่อสารกับผู้อยู่อาศัยและผู้มาเยือนได้อย่างมีประสิทธิภาพ และเป็นแพลตฟอร์มที่ทันสมัยสำหรับการเผยแพร่ข้อมูลและประกาศของนิติบุคคลภายในอาคาร",
  "terms": [
   {
    "_type": "leaseTermRow",
    "_key": "k152",
    "label": "ขนาดหน้าจอขั้นต่ำ",
    "value": "{screenInch} นิ้ว ({screenH} มม. สูง × {screenW} มม. กว้าง)",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k153",
    "label": "ขนาดโครงสร้างขั้นต่ำ",
    "value": "{unitH} มม. (สูง) × {unitW} มม. (กว้าง) × {unitD} มม. (ลึก)",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k154",
    "label": "ค่าเช่ารายเดือน",
    "value": "{rent} บาทต่อเดือน (ไม่รวมค่าไฟฟ้า)",
    "emphasis": true
   },
   {
    "_type": "leaseTermRow",
    "_key": "k155",
    "label": "ค่าไฟฟ้า",
    "value": "{electricity} บาทต่อหน่วย ตามการใช้งานจริง",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k156",
    "label": "ระยะเวลาเช่า",
    "value": "{months} เดือน — {startDate} ถึง {endDate}",
    "emphasis": true
   },
   {
    "_type": "leaseTermRow",
    "_key": "k157",
    "label": "ตำแหน่งติดตั้ง",
    "value": "{location}",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k158",
    "label": "เงื่อนไขการแข่งขัน",
    "value": "พื้นที่ที่ให้เช่าเพิ่มเติม ไม่สามารถให้เช่าแก่บุคคลหรือองค์กรที่มีการแข่งขันโดยตรงกับผู้เช่ารายอื่น เว้นแต่จะได้รับความยินยอมล่วงหน้าจากผู้เช่า",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k159",
    "label": "การให้ความร่วมมือติดตั้งอินเทอร์เน็ต",
    "value": "นิติบุคคลจะอำนวยความสะดวกในการติดตั้งระบบอินเทอร์เน็ต โดยค่าใช้จ่ายในการติดตั้งและค่าบริการเป็นความรับผิดชอบของบริษัท ทั้งนี้อาจจำเป็นต้องใช้ที่อยู่ของโครงการในการขอติดตั้งบริการกับผู้ให้บริการ (ISP)",
    "emphasis": false
   }
  ],
  "lineLabel": "ค่าเช่าพื้นที่ติดตั้งจอโฆษณา (ต่อเดือน)",
  "note": "ชำระค่าเช่าเป็นรายเดือนภายในวันที่ 1 ของทุกเดือน · ค่าไฟฟ้าเรียกเก็บตามการใช้งานจริงแยกต่างหาก",
  "closing": "โซลูชันจอโฆษณาดิจิทัลของเรามีคุณประโยชน์หลากหลาย ทั้งการสร้างบรรยากาศระดับ 5 ดาวสำหรับผู้อยู่อาศัยและแขก การเป็นแพลตฟอร์มที่ยอดเยี่ยมสำหรับธุรกิจท้องถิ่นในการส่งเสริมบริการและผลิตภัณฑ์ และการมีหน้าจอเฉพาะสำหรับการประกาศที่จำเป็นของนิติบุคคลและข้อมูลอาคาร ขอขอบคุณที่พิจารณาข้อเสนอของเรา เราหวังเป็นอย่างยิ่งว่าจะได้มีโอกาสร่วมงานกับท่าน",
  "acceptHint": "ลงนามผู้มีอำนาจพร้อมประทับตรา แล้วส่งกลับผ่านตัวแทนของบริษัท หรือ info@aquamx.co.th / LINE @aquamx"
 },
 "quotationEn": {
  "title": "Quotation for Rental of Signage Space",
  "intro": "This quotation outlines the terms and conditions for the rental of signage space at your project. aquamx offers a high-quality vertical touchscreen display that enhances the aesthetic appeal of the property, communicates effectively with residents and visitors, and provides a modern platform for building information and juristic announcements.",
  "terms": [
   {
    "_type": "leaseTermRow",
    "_key": "k160",
    "label": "Screen min. size",
    "value": "{screenInch} inches ({screenH} mm H × {screenW} mm W)",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k161",
    "label": "Structure min. dimension",
    "value": "{unitH} mm (H) × {unitW} mm (W) × {unitD} mm (D)",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k162",
    "label": "Monthly rental fee",
    "value": "{rent} Baht per month (excluding electricity)",
    "emphasis": true
   },
   {
    "_type": "leaseTermRow",
    "_key": "k163",
    "label": "Electricity",
    "value": "{electricity} Baht per unit, on actual use",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k164",
    "label": "Lease term",
    "value": "{months} months — {startDate} to {endDate}",
    "emphasis": true
   },
   {
    "_type": "leaseTermRow",
    "_key": "k165",
    "label": "Location",
    "value": "{location}",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k166",
    "label": "Non-competition",
    "value": "Additional rental space cannot be leased to individuals or organizations that directly compete with the tenant unless prior consent is obtained from the tenant.",
    "emphasis": false
   },
   {
    "_type": "leaseTermRow",
    "_key": "k167",
    "label": "WiFi provider cooperation",
    "value": "The juristic person agrees to facilitate the installation of WiFi connectivity, at the company’s cost. The company may need to use the project’s address when applying for installation with the internet service provider (ISP).",
    "emphasis": false
   }
  ],
  "lineLabel": "Signage space rental (per month)",
  "note": "Rent is paid monthly by the 1st of each month · electricity is billed separately on actual use",
  "closing": "Our digital signage solutions offer numerous advantages, including creating a 5-star ambience for residents and guests, providing an excellent platform for local businesses to promote their services and products, and offering a dedicated screen for essential juristic announcements and building information. Thank you for considering our proposal. We look forward to the opportunity to collaborate with you.",
  "acceptHint": "Sign by an authorised signatory, stamp, and return through our leasing agent or to info@aquamx.co.th / LINE @aquamx"
 },
 "contractTh": {
  "title": "สัญญาเช่าพื้นที่เพื่อติดตั้งจอโฆษณา",
  "intro": "สัญญาฉบับนี้ทำขึ้นระหว่าง {lessee} ทะเบียนนิติบุคคลเลขที่ {lesseeTaxId} สำนักงานตั้งอยู่เลขที่ {lesseeAddress} ซึ่งเป็นผู้เช่า (ต่อไปนี้เรียกว่า “ผู้เช่า”) ฝ่ายหนึ่ง กับ {lessor} สำนักงานตั้งอยู่เลขที่ {lessorAddress} ซึ่งเป็นผู้ให้เช่า (ต่อไปนี้เรียกว่า “ผู้ให้เช่า”) อีกฝ่ายหนึ่ง โดยทั้งสองฝ่ายตกลงทำสัญญาเช่าพื้นที่เพื่อติดตั้งจอโฆษณา (Signage) ภายใต้เงื่อนไขดังต่อไปนี้",
  "clauses": [
   {
    "_type": "contractClause",
    "_key": "k003",
    "title": "รายละเอียดพื้นที่เช่า",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k001",
      "label": "1.1",
      "level": "main",
      "text": "ผู้ให้เช่าตกลงให้ผู้เช่าเช่าพื้นที่ภายในโครงการ {projectTh} สำหรับการติดตั้งจอโฆษณา (ต่อไปนี้เรียกว่า “จอโฆษณา”)"
     },
     {
      "_type": "clauseItem",
      "_key": "k002",
      "label": "1.2",
      "level": "main",
      "text": "ตำแหน่งที่ติดตั้งอยู่ {location} หรือในพื้นที่ที่ตกลงร่วมกันระหว่างผู้ให้เช่าและผู้เช่า"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k006",
    "title": "วัตถุประสงค์ของการใช้พื้นที่",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k004",
      "label": "2.1",
      "level": "main",
      "text": "ผู้เช่ามีสิทธิ์ใช้จอโฆษณาเพื่อประชาสัมพันธ์สินค้าและบริการของธุรกิจที่มาลงโฆษณา ตลอดจนส่งเสริมการซื้อขายและให้เช่าห้องชุดภายในโครงการ"
     },
     {
      "_type": "clauseItem",
      "_key": "k005",
      "label": "2.2",
      "level": "main",
      "text": "ผู้ให้เช่ามีสิทธิ์ใช้จอโฆษณาเพื่อเผยแพร่ข้อมูลและประชาสัมพันธ์ข่าวสารสำหรับผู้พักอาศัย ได้ไม่เกิน {lessorMinutes} นาทีต่อวัน"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k009",
    "title": "ระยะเวลาเช่า",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k007",
      "label": "3.1",
      "level": "main",
      "text": "สัญญาเช่ามีระยะเวลา {months} เดือน นับตั้งแต่วันที่ {startDate} ถึงวันที่ {endDate}"
     },
     {
      "_type": "clauseItem",
      "_key": "k008",
      "label": "3.2",
      "level": "main",
      "text": "เมื่อครบกำหนดสัญญา ผู้เช่าสามารถขอต่ออายุสัญญาได้โดยต้องแจ้งให้ผู้ให้เช่าทราบล่วงหน้าไม่น้อยกว่า 30 วัน"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k013",
    "title": "ค่าเช่าและค่าใช้จ่าย",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k010",
      "label": "4.1",
      "level": "main",
      "text": "ผู้เช่าตกลงชำระค่าเช่าพื้นที่ให้แก่ผู้ให้เช่าในอัตรา {rent} บาทต่อเดือน (ไม่รวมค่าไฟฟ้า)"
     },
     {
      "_type": "clauseItem",
      "_key": "k011",
      "label": "4.2",
      "level": "main",
      "text": "ค่าไฟฟ้าจะคิดตามการใช้งานจริงในอัตรา {electricity} บาทต่อหน่วย (ยูนิต)"
     },
     {
      "_type": "clauseItem",
      "_key": "k012",
      "label": "4.3",
      "level": "main",
      "text": "การชำระค่าเช่าจะดำเนินการเป็นรายเดือน โดยผู้เช่าต้องชำระภายในวันที่ 1 ของทุกเดือน"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k017",
    "title": "เงื่อนไขการใช้งาน",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k014",
      "label": "5.1",
      "level": "main",
      "text": "จอโฆษณาต้องใช้เนื้อหาที่ไม่ขัดต่อศีลธรรมอันดีและกฎหมาย"
     },
     {
      "_type": "clauseItem",
      "_key": "k015",
      "label": "5.2",
      "level": "main",
      "text": "ผู้เช่ามีสิทธิ์เข้าดำเนินการติดตั้ง ซ่อมแซม หรือบำรุงรักษาอุปกรณ์ได้ตามความเหมาะสม"
     },
     {
      "_type": "clauseItem",
      "_key": "k016",
      "label": "5.3",
      "level": "main",
      "text": "ผู้ให้เช่าตกลงให้ความร่วมมือและอำนวยความสะดวกในการติดตั้งระบบอินเทอร์เน็ต (WiFi) สำหรับอุปกรณ์จอโฆษณา ตามที่ผู้เช่าร้องขอ เพื่อให้มั่นใจได้ว่าการใช้งานเป็นไปอย่างต่อเนื่องและมีประสิทธิภาพสูงสุด โดยค่าใช้จ่ายในการติดตั้งและค่าบริการเป็นความรับผิดชอบของผู้เช่า ทั้งนี้ ผู้เช่าอาจจำเป็นต้องใช้ที่อยู่ของโครงการในการขอติดตั้งบริการกับผู้ให้บริการอินเทอร์เน็ต (ISP) และผู้ให้เช่าจะให้ความช่วยเหลืออย่างเหมาะสมในกระบวนการดังกล่าว"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k023",
    "title": "เงื่อนไขการแข่งขัน",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k018",
      "label": "6.1",
      "level": "main",
      "text": "ผู้ให้เช่าตกลงว่าจะไม่ให้เช่าพื้นที่เพิ่มเติมแก่บุคคลหรือองค์กรที่มีการแข่งขันโดยตรงกับผู้เช่า เว้นแต่จะได้รับความยินยอมล่วงหน้าจากผู้เช่า ซึ่งรวมการให้เช่าพื้นที่เพื่อประกอบการซื้อขาย ปล่อยเช่าห้องชุดในโครงการ"
     },
     {
      "_type": "clauseItem",
      "_key": "k019",
      "label": "6.2",
      "level": "main",
      "text": "หากผู้ให้เช่าฝ่าฝืนเงื่อนไข โดยให้เช่าพื้นที่แก่บุคคลหรือองค์กรที่มีการแข่งขันโดยตรงกับผู้เช่า โดยไม่ได้รับความยินยอมจากผู้เช่าล่วงหน้า ผู้เช่ามีสิทธิ์ดังต่อไปนี้:"
     },
     {
      "_type": "clauseItem",
      "_key": "k020",
      "label": "•",
      "level": "sub",
      "text": "สิทธิ์ในการยกเลิกสัญญาทันที โดยผู้ให้เช่าต้องคืนเงินมัดจำและค่าเช่าล่วงหน้าทั้งหมดภายใน 15 วัน"
     },
     {
      "_type": "clauseItem",
      "_key": "k021",
      "label": "•",
      "level": "sub",
      "text": "สิทธิ์ในการเรียกร้องค่าเสียหาย หากการละเมิดเงื่อนไขส่งผลกระทบต่อธุรกิจของผู้เช่า โดยคิดเป็นค่าเสียโอกาสตามระยะเวลาที่ยังเหลืออยู่ของสัญญา"
     },
     {
      "_type": "clauseItem",
      "_key": "k022",
      "label": "•",
      "level": "sub",
      "text": "สิทธิ์ในการได้รับเงื่อนไขพิเศษ หากผู้เช่าประสงค์จะดำเนินการเช่าต่อ ผู้ให้เช่าต้องเสนอเงื่อนไขที่เป็นประโยชน์เพิ่มเติม โดยการลดค่าเช่า 50% เป็นระยะเวลา 12 เดือนหรือตลอดอายุสัญญาที่เหลือ แล้วแต่อย่างใดจะมากกว่า"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k037",
    "title": "คุณสมบัติของจอโฆษณา",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k024",
      "label": "7.1",
      "level": "main",
      "text": "จอโฆษณาสามารถแสดงวิดีโอพร้อมเสียงเพลงประกอบที่ราบรื่น และมีระบบจอสัมผัส (Touchscreen Interactive Display) ให้ผู้พักอาศัยสามารถโต้ตอบกับข้อมูลที่เป็นประโยชน์ได้"
     },
     {
      "_type": "clauseItem",
      "_key": "k025",
      "label": "7.2",
      "level": "main",
      "text": "นอกจากนี้ จอโฆษณาสามารถแสดงข้อมูลเกี่ยวกับธุรกิจในพื้นที่ใกล้เคียง เพื่อส่งเสริมชุมชนท้องถิ่น และนำเสนอข้อมูลที่ตรงกับไลฟ์สไตล์ของผู้พักอาศัย"
     },
     {
      "_type": "clauseItem",
      "_key": "k026",
      "label": "7.3",
      "level": "main",
      "text": "ขนาดและโครงสร้างของจอ (Screen Dimensions & Structure)"
     },
     {
      "_type": "clauseItem",
      "_key": "k027",
      "label": "•",
      "level": "sub",
      "text": "ขนาดจอแสดงผล: {screenInch} นิ้ว ({screenH} มม. สูง x {screenW} มม. กว้าง) หรือขนาดที่ใหญ่กว่า ขึ้นกับความเหมาะสมของพื้นที่"
     },
     {
      "_type": "clauseItem",
      "_key": "k028",
      "label": "•",
      "level": "sub",
      "text": "ขนาดรวมของจอและโครงสร้าง: {unitH} มม. สูง x {unitW} มม. กว้าง x {unitD} มม. ลึก หรือขนาดที่ใหญ่กว่า ขึ้นกับความเหมาะสมของพื้นที่"
     },
     {
      "_type": "clauseItem",
      "_key": "k029",
      "label": "7.4",
      "level": "main",
      "text": "การเปลี่ยนแปลงอุปกรณ์จอโฆษณา"
     },
     {
      "_type": "clauseItem",
      "_key": "k030",
      "label": "•",
      "level": "sub",
      "text": "ในกรณีที่จอโฆษณารุ่นที่ระบุในสัญญานี้ถูกยกเลิกการผลิต หรือไม่สามารถจัดหาได้ บริษัทผู้เช่ามีสิทธิ์ใช้จอโฆษณารุ่นอื่นที่มีคุณสมบัติใกล้เคียงหรือดีกว่า ตามมาตรฐานที่กำหนดในสัญญานี้"
     },
     {
      "_type": "clauseItem",
      "_key": "k031",
      "label": "•",
      "level": "sub",
      "text": "จอโฆษณาทดแทนต้องมีขนาดหน้าจอ ระบบแสดงผล และคุณสมบัติหลักที่ไม่ส่งผลกระทบต่อการใช้งาน และยังคงรองรับเงื่อนไขของผู้ให้เช่า"
     },
     {
      "_type": "clauseItem",
      "_key": "k032",
      "label": "•",
      "level": "sub",
      "text": "หากมีการเปลี่ยนแปลง บริษัทผู้เช่าจะแจ้งให้ผู้ให้เช่าทราบล่วงหน้าเป็นลายลักษณ์อักษร ไม่น้อยกว่า 15 วันก่อนการเปลี่ยนแปลง"
     },
     {
      "_type": "clauseItem",
      "_key": "k033",
      "label": "•",
      "level": "sub",
      "text": "การเปลี่ยนแปลงดังกล่าวไม่ถือเป็นการผิดสัญญา ตราบใดที่เป็นไปตามเงื่อนไขที่กำหนด"
     },
     {
      "_type": "clauseItem",
      "_key": "k034",
      "label": "7.5",
      "level": "main",
      "text": "การติดตั้งกล้องเพื่อการควบคุมการทำงานและยกระดับประสบการณ์ผู้ใช้งาน"
     },
     {
      "_type": "clauseItem",
      "_key": "k035",
      "label": "•",
      "level": "sub",
      "text": "ผู้เช่าขอสงวนสิทธิ์ในการติดตั้งกล้องภายในจอโฆษณา เพื่อใช้ในการตรวจจับท่าทางการใช้งาน (Gesture Interaction) และตรวจสอบการทำงานของระบบอินเทอร์แอคทีฟ เช่น การสั่งซื้อสินค้า การกรอกข้อมูล หรือการยืนยันการสัมผัสหน้าจอ ทั้งนี้ กล้องดังกล่าวมีวัตถุประสงค์เพื่อประมวลผลสัญญาณภาพในเชิงระบบเท่านั้น โดยไม่ทำการบันทึก เก็บรักษา หรือส่งต่อภาพบุคคล เสียง หรือข้อมูลส่วนบุคคลที่สามารถระบุตัวตนได้ ระบบทั้งหมดจะดำเนินการตามหลักการของกฎหมายคุ้มครองข้อมูลส่วนบุคคล (PDPA) อย่างเคร่งครัด เพื่อคงไว้ซึ่งความเป็นส่วนตัวของผู้พักอาศัยและผู้ใช้งาน"
     },
     {
      "_type": "clauseItem",
      "_key": "k036",
      "label": "•",
      "level": "sub",
      "text": "ผู้เช่าอาจติดตั้งระบบจดจำใบหน้า (Facial Recognition System) ภายในจอโฆษณา เพื่อใช้ในการยืนยันตัวตนของผู้ใช้งานที่สมัครเข้าร่วมการใช้งานระบบ เช่น การสั่งซื้อสินค้า การยืนยันสิทธิ์ หรือการเข้าถึงบริการเฉพาะบุคคล ทั้งนี้ การใช้งานระบบดังกล่าวจะต้องได้รับความยินยอมอย่างชัดเจนจากผู้ใช้งานก่อนทุกครั้ง ระบบจะไม่จัดเก็บภาพใบหน้าในลักษณะที่สามารถระบุตัวตนได้หลังจากการยืนยันเสร็จสิ้น และจะดำเนินการตามหลักเกณฑ์ของกฎหมายคุ้มครองข้อมูลส่วนบุคคล (PDPA) อย่างเคร่งครัด"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k057",
    "title": "เนื้อหาโฆษณาและรูปแบบการนำเสนอ (Advertising Content & Display Format)",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k038",
      "label": "8.1",
      "level": "main",
      "text": "รูปแบบการแสดงผลของจอโฆษณา"
     },
     {
      "_type": "clauseItem",
      "_key": "k039",
      "label": "•",
      "level": "sub",
      "text": "เครื่องจะเล่นวิดีโอเป็นลูป (Loop Playback) อย่างต่อเนื่อง"
     },
     {
      "_type": "clauseItem",
      "_key": "k040",
      "label": "•",
      "level": "sub",
      "text": "หากมีการสัมผัสจอ เครื่องจะหยุดเล่นวิดีโออัตโนมัติ และแสดงระบบเมนูแบบอินเทอร์แอคทีฟ เพื่อให้ผู้ใช้สามารถเลือกดูข้อมูลที่ต้องการได้"
     },
     {
      "_type": "clauseItem",
      "_key": "k041",
      "label": "•",
      "level": "sub",
      "text": "หากไม่มีการสัมผัสจอภายในเวลาที่กำหนด ระบบจะกลับไปเล่นวิดีโออัตโนมัติ"
     },
     {
      "_type": "clauseItem",
      "_key": "k042",
      "label": "8.2",
      "level": "main",
      "text": "ประเภทของเนื้อหาโฆษณา"
     },
     {
      "_type": "clauseItem",
      "_key": "k043",
      "label": "•",
      "level": "sub",
      "text": "โฆษณาสินค้าและบริการจากธุรกิจที่มาลงประกาศโฆษณา"
     },
     {
      "_type": "clauseItem",
      "_key": "k044",
      "label": "•",
      "level": "sub",
      "text": "การประชาสัมพันธ์โครงการและการส่งเสริมการขายหรือให้เช่าห้องชุดภายในโครงการ"
     },
     {
      "_type": "clauseItem",
      "_key": "k045",
      "label": "•",
      "level": "sub",
      "text": "ข้อมูลบริการที่เกี่ยวข้องกับการใช้ชีวิตของผู้พักอาศัย เช่น ร้านอาหาร คาเฟ่ ฟิตเนส คลินิกสุขภาพ และบริการที่เป็นประโยชน์"
     },
     {
      "_type": "clauseItem",
      "_key": "k046",
      "label": "•",
      "level": "sub",
      "text": "การประกาศและข่าวสารจากนิติบุคคลโครงการ"
     },
     {
      "_type": "clauseItem",
      "_key": "k047",
      "label": "8.3",
      "level": "main",
      "text": "ข้อกำหนดและข้อจำกัดของเนื้อหา"
     },
     {
      "_type": "clauseItem",
      "_key": "k048",
      "label": "•",
      "level": "sub",
      "text": "เนื้อหาต้องไม่ขัดต่อกฎหมาย ความสงบเรียบร้อย และศีลธรรมอันดีของประชาชน"
     },
     {
      "_type": "clauseItem",
      "_key": "k049",
      "label": "•",
      "level": "sub",
      "text": "โฆษณาต้องมีเนื้อหาที่เหมาะสมกับไลฟ์สไตล์ของกลุ่มเป้าหมาย ซึ่งเป็นผู้พักอาศัยในโครงการ"
     },
     {
      "_type": "clauseItem",
      "_key": "k050",
      "label": "•",
      "level": "sub",
      "text": "ไม่อนุญาตให้เผยแพร่เนื้อหาที่เกี่ยวข้องกับการพนัน สารเสพติด การเมือง และเนื้อหาที่อาจก่อให้เกิดความขัดแย้งหรือส่งผลเสียต่อภาพลักษณ์ของโครงการ"
     },
     {
      "_type": "clauseItem",
      "_key": "k051",
      "label": "•",
      "level": "sub",
      "text": "หากเนื้อหาใดไม่เป็นไปตามเงื่อนไข ผู้ให้เช่ามีสิทธิ์ขอให้ปรับปรุง แก้ไข หรือถอดถอนเนื้อหาดังกล่าว"
     },
     {
      "_type": "clauseItem",
      "_key": "k052",
      "label": "8.4",
      "level": "main",
      "text": "การส่งเนื้อหาประชาสัมพันธ์จากผู้ให้เช่า (นิติบุคคลโครงการ)"
     },
     {
      "_type": "clauseItem",
      "_key": "k053",
      "label": "•",
      "level": "sub",
      "text": "ผู้ให้เช่าสามารถทำประกาศหรือข่าวสารจากโครงการในรูปแบบที่กำหนดไว้ และส่งให้แก่ผู้เช่าเพื่อใช้เผยแพร่"
     },
     {
      "_type": "clauseItem",
      "_key": "k054",
      "label": "•",
      "level": "sub",
      "text": "เนื้อหาต้องถูกส่งผ่านช่องทางที่ตกลงกัน เช่น อีเมล ไลน์ หรือช่องทางอื่น"
     },
     {
      "_type": "clauseItem",
      "_key": "k055",
      "label": "•",
      "level": "sub",
      "text": "ต้องส่งล่วงหน้าอย่างน้อย 5 วันทำการก่อนวันกำหนดเผยแพร่บนจอ"
     },
     {
      "_type": "clauseItem",
      "_key": "k056",
      "label": "•",
      "level": "sub",
      "text": "หากผู้ให้เช่าไม่ส่งข้อมูลภายในระยะเวลาที่กำหนด ผู้เช่ามีสิทธิ์เลื่อนกำหนดการเผยแพร่ประกาศนั้นออกไปตามความเหมาะสม"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k059",
    "title": "การสนับสนุนจากผู้ให้เช่าสำหรับบริการของผู้ลงโฆษณา",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k058",
      "level": "main",
      "text": "ผู้ให้เช่าตกลงให้การสนับสนุนอย่างเหมาะสมต่อการให้บริการของผู้ลงโฆษณาที่ปรากฏบนจอโฆษณา ซึ่งรวมถึงแต่ไม่จำกัดเฉพาะ การอำนวยความสะดวกในการเข้าถึงพื้นที่สำหรับการส่งมอบหรือรับสินค้าหรือบริการ และการอนุญาตให้ลูกค้าที่สนใจในบริการนายหน้าของผู้เช่าเข้าชมโครงการโดยไม่คิดค่าใช้จ่ายเพิ่มเติมหรือกำหนดเงื่อนไขที่ไม่สมเหตุสมผล"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k063",
    "title": "เงื่อนไขเหตุสุดวิสัย (Force Majeure)",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k060",
      "label": "10.1",
      "level": "main",
      "text": "กรณีที่จอโฆษณาไม่สามารถทำงานได้ ไม่ว่าจะเกิดจากความขัดข้องของอุปกรณ์ ระบบไฟฟ้า ระบบเครือข่าย หรือเหตุสุดวิสัยอื่น ๆ ผู้เช่ามีสิทธิ์เข้าดำเนินการซ่อมแซมและบำรุงรักษาได้ตลอด 24 ชั่วโมง รวมถึงในวันหยุดราชการ โดยไม่ถือเป็นการผิดเงื่อนไขสัญญากับผู้ให้เช่า"
     },
     {
      "_type": "clauseItem",
      "_key": "k061",
      "label": "10.2",
      "level": "main",
      "text": "ในกรณีที่เกิดเหตุขัดข้องซึ่งอยู่นอกเหนือการควบคุมของผู้เช่า (เช่น ไฟฟ้าขัดข้องภายในอาคาร ระบบอินเทอร์เน็ตของโครงการล้มเหลว หรือภัยธรรมชาติ) ผู้ให้เช่าต้องอำนวยความสะดวกให้ผู้เช่าดำเนินการแก้ไขปัญหาได้อย่างเหมาะสม"
     },
     {
      "_type": "clauseItem",
      "_key": "k062",
      "label": "10.3",
      "level": "main",
      "text": "ผู้ให้เช่าต้องแจ้งให้ผู้เช่าทราบล่วงหน้า หากมีการดำเนินการใด ๆ ที่อาจมีผลกระทบต่อการทำงานของจอโฆษณา เช่น การปรับปรุงพื้นที่ การบำรุงรักษาระบบไฟฟ้า ฯลฯ"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k066",
    "title": "การยกเลิกสัญญา",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k064",
      "label": "11.1",
      "level": "main",
      "text": "หากผู้เช่าประสงค์จะยกเลิกสัญญาก่อนครบกำหนด ต้องแจ้งให้ผู้ให้เช่าทราบเป็นหนังสือล่วงหน้า 30 วัน"
     },
     {
      "_type": "clauseItem",
      "_key": "k065",
      "label": "11.2",
      "level": "main",
      "text": "ผู้ให้เช่ามีสิทธิ์บอกเลิกสัญญาหากผู้เช่าไม่ชำระค่าเช่าเกิน 3 เดือนติดต่อกัน หรือใช้จอเผยแพร่เนื้อหาที่ผิดกฎหมาย"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k070",
    "title": "การบอกกล่าว",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k067",
      "label": "12.1",
      "level": "main",
      "text": "การบอกกล่าวตามสัญญานี้ให้ทำเป็นหนังสือ โดยส่งด้วยตนเอง ทางไปรษณีย์ลงทะเบียน หรือทางอีเมลตามข้อ 12.3 อย่างใดอย่างหนึ่ง"
     },
     {
      "_type": "clauseItem",
      "_key": "k068",
      "label": "12.2",
      "level": "main",
      "text": "ให้ถือว่าได้รับในวันที่ส่ง เว้นแต่ส่งทางไปรษณีย์ให้ถือวันที่ 3 นับแต่วันนำส่ง หากเปลี่ยนที่อยู่หรืออีเมลต้องแจ้งอีกฝ่ายล่วงหน้า 7 วัน"
     },
     {
      "_type": "clauseItem",
      "_key": "k069",
      "label": "12.3",
      "level": "main",
      "text": "ผู้เช่า: info@aquamx.co.th โทร 082-852-9545 · ผู้ให้เช่า: {lessorEmail} โทร {lessorPhone}"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k073",
    "title": "ภาษาและกฎหมายที่ใช้บังคับ",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k071",
      "label": "13.1",
      "level": "main",
      "text": "สัญญานี้จัดทำขึ้นทั้งฉบับภาษาไทยและภาษาอังกฤษ หากมีความขัดแย้งในการตีความ ให้ถือข้อความในฉบับภาษาไทยเป็นหลัก"
     },
     {
      "_type": "clauseItem",
      "_key": "k072",
      "label": "13.2",
      "level": "main",
      "text": "สัญญานี้อยู่ภายใต้และตีความตามกฎหมายไทย และให้ศาลไทยเป็นศาลที่มีเขตอำนาจในการพิจารณาข้อพิพาทใด ๆ ที่เกิดขึ้นจากสัญญานี้"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k076",
    "title": "เอกสารแนบท้ายสัญญา",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k074",
      "label": "14.1",
      "level": "main",
      "text": "เอกสารแนบท้ายสัญญาหรือบันทึกข้อตกลงแก้ไขเพิ่มเติม (ถ้ามี) ที่คู่สัญญาทั้งสองฝ่ายลงนามแล้ว ให้ถือเป็นส่วนหนึ่งของสัญญานี้"
     },
     {
      "_type": "clauseItem",
      "_key": "k075",
      "label": "14.2",
      "level": "main",
      "text": "หากข้อความในเอกสารแนบท้ายขัดหรือแย้งกับข้อความในสัญญานี้ ให้ใช้ข้อความในเอกสารแนบท้ายบังคับ"
     }
    ]
   }
  ],
  "closing": "สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจดีแล้วจึงลงลายมือชื่อไว้เป็นหลักฐาน",
  "lessorLabel": "ผู้ให้เช่า",
  "lesseeLabel": "ผู้เช่า",
  "lessorTitle": "ผู้จัดการนิติบุคคล",
  "witnessLabel": "พยาน"
 },
 "contractEn": {
  "title": "Lease Agreement for Screen Signage",
  "intro": "This Agreement is made between {lessee}, company registration no. {lesseeTaxId}, whose office is at {lesseeAddress}, hereinafter referred to as the “Lessee”, of the one part, and {lessor}, whose office is at {lessorAddress}, hereinafter referred to as the “Lessor”, of the other part. The parties agree to lease an area for the purpose of screen signage installation (the “Signage”) under the following terms and conditions:",
  "clauses": [
   {
    "_type": "contractClause",
    "_key": "k079",
    "title": "Leased Area",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k077",
      "label": "1.1",
      "level": "main",
      "text": "The Lessor agrees to lease to the Lessee a designated space within the {projectEn} Condominium for the installation of a screen signage (hereinafter referred to as the “Screen signage”)."
     },
     {
      "_type": "clauseItem",
      "_key": "k078",
      "label": "1.2",
      "level": "main",
      "text": "The installation location shall be {location} or another area mutually agreed upon by both the Lessor and the Lessee."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k082",
    "title": "Purpose",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k080",
      "label": "2.1",
      "level": "main",
      "text": "The Lessee is entitled to use the Screen Signage to promote products and services of businesses which book the advertisement, including marketing activities and the promotion of sales and leases of units within the project."
     },
     {
      "_type": "clauseItem",
      "_key": "k081",
      "label": "2.2",
      "level": "main",
      "text": "The Lessor is entitled to use the Screen signage to disseminate information and announcements intended for residents, for a duration not exceeding {lessorMinutes} minutes per day."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k085",
    "title": "Lease Term",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k083",
      "label": "3.1",
      "level": "main",
      "text": "The lease term shall be for a period of {months} months, commencing from {startDate} and ending on {endDate}."
     },
     {
      "_type": "clauseItem",
      "_key": "k084",
      "label": "3.2",
      "level": "main",
      "text": "Upon expiration of the lease term, the Lessee may request a renewal of the lease by notifying the Lessor at least 30 days in advance."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k089",
    "title": "Rental Fee and Expenses",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k086",
      "label": "4.1",
      "level": "main",
      "text": "The Lessee agrees to pay the Lessor a monthly rental fee of {rent} Baht (exclusive of electricity charges)."
     },
     {
      "_type": "clauseItem",
      "_key": "k087",
      "label": "4.2",
      "level": "main",
      "text": "Electricity shall be charged based on actual usage at the rate of {electricity} Baht per unit."
     },
     {
      "_type": "clauseItem",
      "_key": "k088",
      "label": "4.3",
      "level": "main",
      "text": "Rental payment shall be made monthly, and the Lessee shall complete payment by the 1st day of each month."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k093",
    "title": "Usage Conditions",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k090",
      "label": "5.1",
      "level": "main",
      "text": "The screen content must not violate public morality or applicable laws."
     },
     {
      "_type": "clauseItem",
      "_key": "k091",
      "label": "5.2",
      "level": "main",
      "text": "The Lessee shall have the right to install, repair, and maintain the equipment as appropriate."
     },
     {
      "_type": "clauseItem",
      "_key": "k092",
      "label": "5.3",
      "level": "main",
      "text": "The Lessor agrees to support and facilitate the installation of WiFi or internet connectivity for the signage devices upon request by the Lessee, in order to ensure optimal performance and uninterrupted operation, at the Lessee’s cost. The Lessee may need to use the project’s address when applying for installation with the internet service provider (ISP), and the Lessor shall provide reasonable assistance in this process."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k099",
    "title": "Non-Competition Clause",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k094",
      "label": "6.1",
      "level": "main",
      "text": "The Lessor agrees not to lease additional space to individuals or organizations that directly compete with the Lessee without prior written consent. This includes leasing space for the purpose of selling or renting condominium units."
     },
     {
      "_type": "clauseItem",
      "_key": "k095",
      "label": "6.2",
      "level": "main",
      "text": "If the Lessor breaches this condition by leasing space to a direct competitor without prior consent, the Lessee shall be entitled to:"
     },
     {
      "_type": "clauseItem",
      "_key": "k096",
      "label": "•",
      "level": "sub",
      "text": "Immediately terminate the contract, in which case the Lessor must refund all deposits and prepaid rent within 15 days."
     },
     {
      "_type": "clauseItem",
      "_key": "k097",
      "label": "•",
      "level": "sub",
      "text": "Claim damages for loss of business opportunity, calculated based on the remaining lease term."
     },
     {
      "_type": "clauseItem",
      "_key": "k098",
      "label": "•",
      "level": "sub",
      "text": "Receive special conditions for continuing the lease, whereby the Lessor must offer a 50% rent reduction for 12 months or for the remainder of the lease term, whichever is longer."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k113",
    "title": "Screen Signage Specifications",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k100",
      "label": "7.1",
      "level": "main",
      "text": "The Screen signage shall be capable of displaying smooth video playback with accompanying music and shall feature a touchscreen interface for residents to interact with useful information."
     },
     {
      "_type": "clauseItem",
      "_key": "k101",
      "label": "7.2",
      "level": "main",
      "text": "The Screen signage may display information about local businesses to promote the local community and present content that aligns with residents’ lifestyles."
     },
     {
      "_type": "clauseItem",
      "_key": "k102",
      "label": "7.3",
      "level": "main",
      "text": "Screen Dimensions & Structure:"
     },
     {
      "_type": "clauseItem",
      "_key": "k103",
      "label": "•",
      "level": "sub",
      "text": "Display size: {screenInch} inches ({screenH} mm height x {screenW} mm width) or larger, as the space allows"
     },
     {
      "_type": "clauseItem",
      "_key": "k104",
      "label": "•",
      "level": "sub",
      "text": "Overall unit size: {unitH} mm height x {unitW} mm width x {unitD} mm depth or larger, as the space allows"
     },
     {
      "_type": "clauseItem",
      "_key": "k105",
      "label": "7.4",
      "level": "main",
      "text": "Equipment Replacement:"
     },
     {
      "_type": "clauseItem",
      "_key": "k106",
      "label": "•",
      "level": "sub",
      "text": "If the specified model is discontinued or unavailable, the Lessee may use a replacement screen with equivalent or better specifications as defined in this agreement."
     },
     {
      "_type": "clauseItem",
      "_key": "k107",
      "label": "•",
      "level": "sub",
      "text": "The replacement screen must have comparable size, display system, and core features, and remain compatible with the Lessor’s conditions."
     },
     {
      "_type": "clauseItem",
      "_key": "k108",
      "label": "•",
      "level": "sub",
      "text": "The Lessee must notify the Lessor in writing at least 15 days in advance of any change."
     },
     {
      "_type": "clauseItem",
      "_key": "k109",
      "label": "•",
      "level": "sub",
      "text": "Such replacement shall not be considered a breach of contract if it complies with the specified conditions."
     },
     {
      "_type": "clauseItem",
      "_key": "k110",
      "label": "7.5",
      "level": "main",
      "text": "Installation of Cameras for Gesture Interaction and System Monitoring:"
     },
     {
      "_type": "clauseItem",
      "_key": "k111",
      "label": "•",
      "level": "sub",
      "text": "The Lessee reserves the right to install cameras integrated within the screen signage solely for gesture-based interaction and system monitoring purposes, such as detecting user gestures, validating touch inputs, or confirming transaction activities (e.g., product ordering or form submission). The cameras are intended for system control and functional enhancement only. They shall not record, store, or transmit any identifiable images, voices, or personal data of individuals. All processing is performed in a non-identifiable, system-level manner and in full compliance with the Personal Data Protection Act (PDPA) and applicable privacy regulations."
     },
     {
      "_type": "clauseItem",
      "_key": "k112",
      "label": "•",
      "level": "sub",
      "text": "The Lessee may integrate a facial recognition system within the screen signage for user authentication purposes, such as verifying registered users for product orders, personalized services, or identity confirmation. The use of such system shall be subject to the user’s explicit consent each time before activation. The system shall not store or retain facial images in an identifiable form after the authentication process is complete and shall fully comply with the Personal Data Protection Act (PDPA) and related privacy regulations."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k132",
    "title": "Advertising Content & Display Format",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k114",
      "label": "8.1",
      "level": "main",
      "text": "Display Format:"
     },
     {
      "_type": "clauseItem",
      "_key": "k115",
      "label": "•",
      "level": "sub",
      "text": "The screen shall play videos in a continuous loop."
     },
     {
      "_type": "clauseItem",
      "_key": "k116",
      "label": "•",
      "level": "sub",
      "text": "Upon touch input, the video will pause and an interactive menu will appear, allowing users to explore the content."
     },
     {
      "_type": "clauseItem",
      "_key": "k117",
      "label": "•",
      "level": "sub",
      "text": "If no touch input is detected within a specific period, the system will resume video playback automatically."
     },
     {
      "_type": "clauseItem",
      "_key": "k118",
      "label": "8.2",
      "level": "main",
      "text": "Types of Content:"
     },
     {
      "_type": "clauseItem",
      "_key": "k119",
      "label": "•",
      "level": "sub",
      "text": "Advertisements from businesses participating in the advertising program"
     },
     {
      "_type": "clauseItem",
      "_key": "k120",
      "label": "•",
      "level": "sub",
      "text": "Promotional content supporting the sale or lease of condominium units"
     },
     {
      "_type": "clauseItem",
      "_key": "k121",
      "label": "•",
      "level": "sub",
      "text": "Lifestyle-related services for residents (e.g., restaurants, cafes, fitness centers, clinics)"
     },
     {
      "_type": "clauseItem",
      "_key": "k122",
      "label": "•",
      "level": "sub",
      "text": "Juristic announcements from the condominium management"
     },
     {
      "_type": "clauseItem",
      "_key": "k123",
      "label": "8.3",
      "level": "main",
      "text": "Content Requirements and Restrictions:"
     },
     {
      "_type": "clauseItem",
      "_key": "k124",
      "label": "•",
      "level": "sub",
      "text": "Content must not violate the law, public order, or moral standards."
     },
     {
      "_type": "clauseItem",
      "_key": "k125",
      "label": "•",
      "level": "sub",
      "text": "Advertisements must align with the lifestyle of the condominium’s residents."
     },
     {
      "_type": "clauseItem",
      "_key": "k126",
      "label": "•",
      "level": "sub",
      "text": "Prohibited content includes gambling, narcotics, political content, and content that causes conflict or harms the project’s image."
     },
     {
      "_type": "clauseItem",
      "_key": "k127",
      "label": "•",
      "level": "sub",
      "text": "If any content fails to meet the conditions, the Lessor may request edits, replacements, or removal."
     },
     {
      "_type": "clauseItem",
      "_key": "k128",
      "label": "8.4",
      "level": "main",
      "text": "Content Submission by the Lessor:"
     },
     {
      "_type": "clauseItem",
      "_key": "k129",
      "label": "•",
      "level": "sub",
      "text": "The Lessor may submit announcements or news for publication, following the agreed format and delivery method (e.g., email, LINE, or others)."
     },
     {
      "_type": "clauseItem",
      "_key": "k130",
      "label": "•",
      "level": "sub",
      "text": "Content must be submitted at least 5 business days prior to the intended display date."
     },
     {
      "_type": "clauseItem",
      "_key": "k131",
      "label": "•",
      "level": "sub",
      "text": "If submitted late, the Lessee may postpone the display as appropriate."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k134",
    "title": "Support from the Lessor for Advertising Services",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k133",
      "level": "main",
      "text": "The Lessor agrees to provide reasonable support for services advertised on the screen, including but not limited to allowing access for delivery or pickup of goods and services, and permitting prospective clients introduced through the Lessee’s brokerage service to visit the premises without any additional charges or unreasonable restrictions."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k138",
    "title": "Force Majeure",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k135",
      "label": "10.1",
      "level": "main",
      "text": "In case the Screen signage cannot operate due to equipment malfunction, power failure, network issues, or other force majeure events, the Lessee may proceed with maintenance or repair at any time, including public holidays, without breaching the agreement."
     },
     {
      "_type": "clauseItem",
      "_key": "k136",
      "label": "10.2",
      "level": "main",
      "text": "If disruptions are caused by factors beyond the Lessee’s control (e.g., internal electrical issues, internet outage, or natural disasters), the Lessor shall facilitate appropriate resolution efforts."
     },
     {
      "_type": "clauseItem",
      "_key": "k137",
      "label": "10.3",
      "level": "main",
      "text": "The Lessor must provide advance notice to the Lessee if any action is expected to affect screen functionality, such as facility renovations or electrical maintenance."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k141",
    "title": "Termination",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k139",
      "label": "11.1",
      "level": "main",
      "text": "If the Lessee wishes to terminate the contract early, a 30-day advance written notice must be given to the Lessor."
     },
     {
      "_type": "clauseItem",
      "_key": "k140",
      "label": "11.2",
      "level": "main",
      "text": "The Lessor may terminate the contract if the Lessee fails to pay rent for more than 3 consecutive months or broadcasts illegal content."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k145",
    "title": "Notices",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k142",
      "label": "12.1",
      "level": "main",
      "text": "Notices under this Agreement shall be in writing, given by hand, registered post, or email to the addresses in 12.3."
     },
     {
      "_type": "clauseItem",
      "_key": "k143",
      "label": "12.2",
      "level": "main",
      "text": "A notice is deemed received on the day sent, or on the third day after posting if sent by post. A change of address or email must be notified 7 days in advance."
     },
     {
      "_type": "clauseItem",
      "_key": "k144",
      "label": "12.3",
      "level": "main",
      "text": "Lessee: info@aquamx.co.th, tel. 082-852-9545 · Lessor: {lessorEmail}, tel. {lessorPhone}"
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k148",
    "title": "Language and Governing Law",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k146",
      "label": "13.1",
      "level": "main",
      "text": "This Agreement is made in both Thai and English; in case of any conflict or inconsistency in interpretation, the Thai version shall prevail."
     },
     {
      "_type": "clauseItem",
      "_key": "k147",
      "label": "13.2",
      "level": "main",
      "text": "This Agreement shall be governed by and construed in accordance with the laws of Thailand. Any dispute shall fall under the jurisdiction of the Thai courts."
     }
    ]
   },
   {
    "_type": "contractClause",
    "_key": "k151",
    "title": "Annexes",
    "items": [
     {
      "_type": "clauseItem",
      "_key": "k149",
      "label": "14.1",
      "level": "main",
      "text": "Any annex or supplemental agreement signed by both parties shall form an integral part of this Agreement."
     },
     {
      "_type": "clauseItem",
      "_key": "k150",
      "label": "14.2",
      "level": "main",
      "text": "In case of any conflict between an annex and this Agreement, the annex shall prevail."
     }
    ]
   }
  ],
  "closing": "Signed in duplicate, with both parties having read and understood the terms and conditions herein.",
  "lessorLabel": "Lessor",
  "lesseeLabel": "Lessee",
  "lessorTitle": "Condominium Juristic Manager",
  "witnessLabel": "Witness"
 },
 "screenInch": 43,
 "screenH": 941,
 "screenW": 529,
 "unitH": 1800,
 "unitW": 599,
 "unitD": 460,
 "lessorMinutes": 60,
 "quotationValidDays": 30,
 "_type": "leaseDocTemplate"
}
const res = await fetch(`https://${PROJECT_ID}.api.sanity.io/v${API_VER}/data/mutate/${DATASET}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ mutations: [{ createOrReplace: doc }, { delete: { id: `drafts.${doc._id}` } }] }),
})
console.log(res.status, JSON.stringify(await res.json()).slice(0, 300))
