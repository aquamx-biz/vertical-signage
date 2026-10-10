// One-off (10 Oct 2026): move every legal wording into the Legal Form schema.
//   cd sanity-studio && node migrate-legal-forms.mjs           (writes)
//   cd sanity-studio && node migrate-legal-forms.mjs --dry-run (prints, writes nothing)
// Copies Ad Contract Template v1/v2 and Lease Document Template v1 word for word
// (the old documents are NOT deleted), adds the Rent Space addendum wording that
// was hard-coded in /lease-contract, the Condo Lease v1 and Lessor Power of
// Attorney v1 wording, and points every ad contract's "Template" at the new copy.
// Safe to run again: createOrReplace on fixed ids.
import { readFileSync } from 'node:fs'
const PROJECT_ID = 'awjj9g8u', DATASET = 'production', API = '2024-01-01'
const DRY = process.argv.includes('--dry-run')
const TOKEN = process.env.SANITY_WRITE_TOKEN || /TOKEN\s*=\s*'([^']+)'/.exec(readFileSync(new URL('./seed.mjs', import.meta.url), 'utf8'))?.[1]
if (!TOKEN) { console.error('no token'); process.exit(1) }
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
const q = async (query) => (await (await fetch(`https://${PROJECT_ID}.api.sanity.io/v${API}/data/query/${DATASET}?query=${encodeURIComponent(query)}`, { headers: H })).json()).result

const ADDENDUM = {
 "th": {
  "title": "เอกสารแนบท้ายสัญญาเช่าพื้นที่เพื่อติดตั้งจอโฆษณา",
  "titleAfter": "บันทึกข้อตกลงแก้ไขเพิ่มเติมสัญญาเช่าพื้นที่เพื่อติดตั้งจอโฆษณา",
  "intro": "แนบท้ายสัญญาเช่าพื้นที่เพื่อติดตั้งจอโฆษณา เลขที่ {contractNumber} ลงวันที่ {contractDate} ระหว่าง {lessee} (\"ผู้เช่า\") และ {lessor} (\"ผู้ให้เช่า\") คู่สัญญาตกลงแก้ไขสัญญาดังต่อไปนี้",
  "amendLabel": "แก้ไขข้อ",
  "originalLabel": "ข้อความเดิม:",
  "amendedLabel": "ให้แก้ไขเป็น:",
  "unchanged": "ข้อความอื่นในสัญญาที่มิได้แก้ไขตามเอกสารนี้ ให้คงเดิมทุกประการ",
  "closing": "เอกสารนี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจดีแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐาน"
 },
 "en": {
  "title": "ANNEX TO THE LEASE AGREEMENT FOR SCREEN SIGNAGE",
  "titleAfter": "SUPPLEMENTAL AGREEMENT TO THE LEASE AGREEMENT FOR SCREEN SIGNAGE",
  "intro": "This document is an annex to the Lease Agreement for Screen Signage No. {contractNumber} dated {contractDate}, made by and between {lessee} (the \"Lessee\") and {lessor} (the \"Lessor\"). The parties agree to amend the Agreement as follows:",
  "amendLabel": "Amendment to Clause",
  "originalLabel": "Original text:",
  "amendedLabel": "Amended text:",
  "unchanged": "All other terms of the Agreement not amended by this document remain unchanged and in full force.",
  "closing": "Signed in duplicate, with both parties having read and understood the terms herein."
 }
}
const NEW_FORMS = {
 "condoLease": {
  "th": {
   "title": "สัญญาเช่าห้องชุด",
   "intro": "สัญญาฉบับนี้ทำขึ้น ณ วันที่ {contract_date} ระหว่าง {lessor_name} เลขประจำตัวประชาชน/ทะเบียนนิติบุคคล {lessor_id} ที่อยู่ {lessor_address} (ต่อไปนี้เรียกว่า \"ผู้ให้เช่า\") ฝ่ายหนึ่ง กับ {tenant_name} เลขประจำตัวประชาชน/หนังสือเดินทาง {tenant_id} ที่อยู่ {tenant_address} (ต่อไปนี้เรียกว่า \"ผู้เช่า\") อีกฝ่ายหนึ่ง คู่สัญญาตกลงกันดังนี้",
   "clauses": [
    {
     "_type": "contractClause",
     "_key": "k001",
     "title": "ห้องชุดที่เช่า",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k002",
       "label": "1.1",
       "level": "main",
       "text": "ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าห้องชุดเลขที่ {unit_no} ชั้น {floor} อาคาร {building} โครงการ {project_th} เนื้อที่ประมาณ {size_sqm} ตารางเมตร ตั้งอยู่ที่ {project_address_th} พร้อมเฟอร์นิเจอร์และเครื่องใช้ไฟฟ้าตามเอกสารแนบท้าย 1 (ต่อไปนี้เรียกว่า \"ห้องชุด\")"
      },
      {
       "_type": "clauseItem",
       "_key": "k003",
       "label": "1.2",
       "level": "main",
       "text": "ผู้ให้เช่ารับรองว่าเป็นเจ้าของกรรมสิทธิ์ หรือมีอำนาจให้เช่าห้องชุดโดยชอบด้วยกฎหมาย"
      },
      {
       "_type": "clauseItem",
       "_key": "k004",
       "label": "1.3",
       "level": "main",
       "text": "ผู้เช่าใช้ห้องชุดเพื่ออยู่อาศัยเท่านั้น โดยมีผู้พักอาศัยไม่เกิน {occupants} คน"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k005",
     "title": "ระยะเวลาเช่า",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k006",
       "label": "2.1",
       "level": "main",
       "text": "ระยะเวลาเช่า {lease_term} เดือน นับตั้งแต่วันที่ {start_date} ถึงวันที่ {end_date}"
      },
      {
       "_type": "clauseItem",
       "_key": "k007",
       "label": "2.2",
       "level": "main",
       "text": "หากผู้เช่าประสงค์จะต่อสัญญา ให้แจ้งเป็นหนังสือล่วงหน้าไม่น้อยกว่า 30 วันก่อนครบกำหนด โดยค่าเช่าและเงื่อนไขให้ตกลงกันใหม่"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k008",
     "title": "ค่าเช่า",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k009",
       "label": "3.1",
       "level": "main",
       "text": "ค่าเช่าเดือนละ {monthly_rent} บาท ( {monthly_rent_text} ) ชำระล่วงหน้าภายในวันที่ {due_day} ของทุกเดือน โดยโอนเข้าบัญชีธนาคาร {bank_name} เลขที่ {bank_account} ชื่อบัญชี {bank_account_name}"
      },
      {
       "_type": "clauseItem",
       "_key": "k010",
       "label": "3.2",
       "level": "main",
       "text": "หากผู้เช่าชำระค่าเช่าล่าช้าเกิน 7 วัน ผู้เช่าต้องชำระค่าปรับวันละ {late_fee} บาท จนกว่าจะชำระครบ"
      },
      {
       "_type": "clauseItem",
       "_key": "k011",
       "label": "3.3",
       "level": "main",
       "text": "ค่าส่วนกลาง ภาษีที่ดินและสิ่งปลูกสร้าง และค่าใช้จ่ายของเจ้าของห้องชุด ผู้ให้เช่าเป็นผู้ชำระ"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k012",
     "title": "เงินประกันและค่าเช่าล่วงหน้า",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k013",
       "label": "4.1",
       "level": "main",
       "text": "ในวันทำสัญญา ผู้เช่าชำระเงินประกันการเช่า {deposit_months} เดือน เป็นเงิน {deposit_amount} บาท และค่าเช่าล่วงหน้า 1 เดือน เป็นเงิน {advance_amount} บาท รวมเป็นเงิน {total_upfront} บาท โดยค่าเช่าล่วงหน้าใช้เป็นค่าเช่าเดือนแรก"
      },
      {
       "_type": "clauseItem",
       "_key": "k014",
       "label": "4.2",
       "level": "main",
       "text": "เงินประกันไม่ใช่ค่าเช่า ผู้เช่าจะนำมาหักเป็นค่าเช่างวดใดไม่ได้"
      },
      {
       "_type": "clauseItem",
       "_key": "k015",
       "label": "4.3",
       "level": "main",
       "text": "เมื่อสัญญาสิ้นสุดและผู้เช่าส่งมอบห้องชุดคืนครบถ้วนแล้ว ผู้ให้เช่าจะคืนเงินประกันภายใน 7 วัน หลังหักค่าเช่าและค่าใช้จ่ายที่ค้างชำระ และค่าซ่อมแซมความเสียหายที่ไม่ใช่การเสื่อมสภาพจากการใช้งานตามปกติ พร้อมแจ้งรายการที่หัก"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k016",
     "title": "ค่าสาธารณูปโภค",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k017",
       "label": "5.1",
       "level": "main",
       "text": "ค่าไฟฟ้า ค่าน้ำประปา ค่าอินเทอร์เน็ต และค่าบริการอื่นที่ผู้เช่าใช้ ผู้เช่าเป็นผู้ชำระตามจริงต่อผู้ให้บริการหรือนิติบุคคลอาคารชุด"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k018",
     "title": "หน้าที่ของผู้เช่า",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k019",
       "label": "6.1",
       "level": "main",
       "text": "ดูแลรักษาห้องชุดและทรัพย์สินเสมือนวิญญูชนดูแลทรัพย์สินของตนเอง และปฏิบัติตามข้อบังคับและระเบียบของนิติบุคคลอาคารชุด"
      },
      {
       "_type": "clauseItem",
       "_key": "k020",
       "label": "6.2",
       "level": "main",
       "text": "ไม่ให้เช่าช่วง ไม่โอนสิทธิการเช่า และไม่ให้ผู้อื่นเข้าพักอาศัยแทน เว้นแต่ได้รับความยินยอมเป็นหนังสือจากผู้ให้เช่า"
      },
      {
       "_type": "clauseItem",
       "_key": "k021",
       "label": "6.3",
       "level": "main",
       "text": "ไม่ดัดแปลง ต่อเติม หรือเจาะผนังห้องชุด เว้นแต่ได้รับความยินยอมเป็นหนังสือจากผู้ให้เช่า"
      },
      {
       "_type": "clauseItem",
       "_key": "k022",
       "label": "6.4",
       "level": "main",
       "text": "ไม่นำสัตว์เลี้ยงเข้าพัก เว้นแต่ข้อบังคับอาคารชุดอนุญาตและผู้ให้เช่ายินยอมเป็นหนังสือ"
      },
      {
       "_type": "clauseItem",
       "_key": "k023",
       "label": "6.5",
       "level": "main",
       "text": "ไม่ใช้ห้องชุดกระทำการที่ผิดกฎหมาย หรือก่อความเดือดร้อนรำคาญแก่ผู้พักอาศัยอื่น"
      },
      {
       "_type": "clauseItem",
       "_key": "k024",
       "label": "6.6",
       "level": "main",
       "text": "ยินยอมให้ผู้ให้เช่าหรือตัวแทนเข้าตรวจห้องชุดในเวลาอันสมควร โดยแจ้งล่วงหน้าไม่น้อยกว่า 24 ชั่วโมง เว้นแต่กรณีเหตุฉุกเฉิน"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k025",
     "title": "การซ่อมแซม",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k026",
       "label": "7.1",
       "level": "main",
       "text": "ผู้เช่ารับผิดชอบการบำรุงรักษาตามปกติ เช่น เปลี่ยนหลอดไฟ และล้างเครื่องปรับอากาศทุก 6 เดือน"
      },
      {
       "_type": "clauseItem",
       "_key": "k027",
       "label": "7.2",
       "level": "main",
       "text": "ผู้ให้เช่ารับผิดชอบซ่อมแซมโครงสร้าง ระบบหลักของห้องชุด และเฟอร์นิเจอร์หรือเครื่องใช้ไฟฟ้าที่ชำรุดจากการใช้งานตามปกติ โดยผู้เช่าต้องแจ้งผู้ให้เช่าเมื่อพบความชำรุด"
      },
      {
       "_type": "clauseItem",
       "_key": "k028",
       "label": "7.3",
       "level": "main",
       "text": "ความเสียหายที่เกิดจากผู้เช่า ผู้พักอาศัย หรือบุคคลที่ผู้เช่าพามา ผู้เช่าต้องรับผิดชอบค่าซ่อมแซม"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k029",
     "title": "การเลิกสัญญา",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k030",
       "label": "8.1",
       "level": "main",
       "text": "หากผู้เช่าผิดนัดชำระค่าเช่า หรือผิดสัญญาข้ออื่น และไม่แก้ไขภายใน 30 วันนับแต่ได้รับหนังสือแจ้ง ผู้ให้เช่ามีสิทธิบอกเลิกสัญญาได้"
      },
      {
       "_type": "clauseItem",
       "_key": "k031",
       "label": "8.2",
       "level": "main",
       "text": "หากผู้เช่าประสงค์จะเลิกสัญญาก่อนครบกำหนด ต้องแจ้งเป็นหนังสือล่วงหน้าไม่น้อยกว่า 30 วัน และยินยอมให้ผู้ให้เช่าริบเงินประกัน"
      },
      {
       "_type": "clauseItem",
       "_key": "k032",
       "label": "8.3",
       "level": "main",
       "text": "หากห้องชุดเสียหายจนอยู่อาศัยไม่ได้โดยไม่ใช่ความผิดของคู่สัญญาฝ่ายใด สัญญานี้เป็นอันเลิกกัน และผู้ให้เช่าจะคืนเงินประกันและค่าเช่าที่ชำระล่วงหน้าสำหรับช่วงที่ยังไม่ได้อยู่อาศัย"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k033",
     "title": "การส่งมอบห้องชุดคืน",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k034",
       "label": "9.1",
       "level": "main",
       "text": "เมื่อสัญญาสิ้นสุด ผู้เช่าต้องส่งมอบห้องชุด กุญแจ และคีย์การ์ดคืนในสภาพตามเอกสารแนบท้าย 1 เว้นแต่การเสื่อมสภาพจากการใช้งานตามปกติ"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k035",
     "title": "ตัวแทน",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k036",
       "label": "10.1",
       "level": "main",
       "text": "บริษัท อควาแม็กซ์ พรอพเพอร์ตี้ จำกัด เป็นตัวแทนในการจัดหาผู้เช่าและประสานงานเท่านั้น ไม่ใช่คู่สัญญา และไม่ต้องรับผิดตามสัญญานี้แทนคู่สัญญาฝ่ายใด"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k037",
     "title": "ข้อตกลงทั่วไป",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k038",
       "label": "11.1",
       "level": "main",
       "text": "การแก้ไขสัญญานี้ต้องทำเป็นหนังสือและลงนามโดยคู่สัญญาทั้งสองฝ่าย"
      },
      {
       "_type": "clauseItem",
       "_key": "k039",
       "label": "11.2",
       "level": "main",
       "text": "สัญญานี้ทำขึ้นเป็นภาษาไทยและภาษาอังกฤษ หากข้อความขัดแย้งกัน ให้ใช้ข้อความภาษาไทยเป็นหลัก"
      },
      {
       "_type": "clauseItem",
       "_key": "k040",
       "label": "11.3",
       "level": "main",
       "text": "เอกสารแนบท้ายเป็นส่วนหนึ่งของสัญญานี้ ได้แก่ (1) รายการทรัพย์สินและสภาพห้องชุด (2) สำเนาบัตรประชาชนหรือหนังสือเดินทางของคู่สัญญา (3) สำเนาหนังสือกรรมสิทธิ์ห้องชุด"
      }
     ]
    }
   ],
   "closing": "สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจดีแล้ว จึงลงลายมือชื่อไว้ต่อหน้าพยาน และต่างยึดถือไว้ฝ่ายละฉบับ",
   "signatures": [
    {
     "_type": "legalSignature",
     "_key": "k041",
     "label": "ผู้ให้เช่า",
     "name": "{lessor_name}",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k042",
     "label": "ผู้เช่า",
     "name": "{tenant_name}",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k043",
     "label": "พยาน",
     "name": "",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k044",
     "label": "พยาน",
     "name": "นายศักดิ์ชัย สุทธิพิพัฒน์",
     "note": "บริษัท อควาแม็กซ์ พรอพเพอร์ตี้ จำกัด (ตัวแทน)"
    }
   ],
   "annexes": [
    {
     "_type": "legalAnnex",
     "_key": "k045",
     "title": "เอกสารแนบท้าย 1 รายการทรัพย์สินและสภาพห้องชุด / Annex 1 Inventory and Condition",
     "columns": [
      "#",
      "รายการ / Item",
      "จำนวน / Qty",
      "สภาพ / Condition"
     ],
     "rows": 15,
     "lines": [
      "มิเตอร์ไฟฟ้าวันเข้าอยู่ / Electricity meter at move-in ................ · มิเตอร์น้ำ / Water meter ................",
      "กุญแจ / Keys ...... · คีย์การ์ด / Key cards ...... · รีโมท / Remotes ......",
      "รูปถ่ายสภาพห้องวันส่งมอบแนบท้ายเอกสารนี้ / Photos of the Unit at handover are attached."
     ]
    }
   ]
  },
  "en": {
   "title": "Condominium Lease Agreement",
   "intro": "This Agreement is made on {contract_date_en} between {lessor_name_en} , ID/Registration No. {lessor_id} , address {lessor_address_en} (the \"Lessor\"), and {tenant_name_en} , ID/Passport No. {tenant_id} , address {tenant_address_en} (the \"Tenant\"). The parties agree as follows:",
   "clauses": [
    {
     "_type": "contractClause",
     "_key": "k046",
     "title": "The Unit",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k047",
       "label": "1.1",
       "level": "main",
       "text": "The Lessor lets and the Tenant rents Unit No. {unit_no} , Floor {floor} , Building {building} , {project_en} , approx. {size_sqm} sq.m., located at {project_address_en} , together with the furniture and appliances listed in Annex 1 (the \"Unit\")."
      },
      {
       "_type": "clauseItem",
       "_key": "k048",
       "label": "1.2",
       "level": "main",
       "text": "The Lessor warrants that it owns, or is lawfully authorised to let, the Unit."
      },
      {
       "_type": "clauseItem",
       "_key": "k049",
       "label": "1.3",
       "level": "main",
       "text": "The Unit shall be used as a residence only, by no more than {occupants} occupants."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k050",
     "title": "Term",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k051",
       "label": "2.1",
       "level": "main",
       "text": "The term is {lease_term} months, from {start_date_en} to {end_date_en} ."
      },
      {
       "_type": "clauseItem",
       "_key": "k052",
       "label": "2.2",
       "level": "main",
       "text": "If the Tenant wishes to renew, the Tenant shall give written notice at least 30 days before expiry. Rent and terms for the renewal shall be agreed anew."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k053",
     "title": "Rent",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k054",
       "label": "3.1",
       "level": "main",
       "text": "The rent is THB {monthly_rent} per month, payable in advance by day {due_day} of each month by transfer to {bank_name_en} account No. {bank_account} , account name {bank_account_name} ."
      },
      {
       "_type": "clauseItem",
       "_key": "k055",
       "label": "3.2",
       "level": "main",
       "text": "Rent paid more than 7 days late incurs a penalty of THB {late_fee} per day until paid in full."
      },
      {
       "_type": "clauseItem",
       "_key": "k056",
       "label": "3.3",
       "level": "main",
       "text": "Common-area fees, land and building tax, and other owner charges are paid by the Lessor."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k057",
     "title": "Security Deposit and Advance Rent",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k058",
       "label": "4.1",
       "level": "main",
       "text": "On signing, the Tenant pays a security deposit of {deposit_months} month(s), THB {deposit_amount} , and one month's advance rent, THB {advance_amount} , totalling THB {total_upfront} . The advance rent is applied to the first month."
      },
      {
       "_type": "clauseItem",
       "_key": "k059",
       "label": "4.2",
       "level": "main",
       "text": "The deposit is not rent and may not be set off against any rent payment."
      },
      {
       "_type": "clauseItem",
       "_key": "k060",
       "label": "4.3",
       "level": "main",
       "text": "After the Agreement ends and the Unit is fully returned, the Lessor shall refund the deposit within 7 days, less unpaid rent and charges and the cost of repairing damage beyond normal wear and tear, with a list of deductions."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k061",
     "title": "Utilities",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k062",
       "label": "5.1",
       "level": "main",
       "text": "Electricity, water, internet and other services used by the Tenant are paid by the Tenant at actual cost to the provider or the condominium juristic person."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k063",
     "title": "Tenant's Obligations",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k064",
       "label": "6.1",
       "level": "main",
       "text": "Take care of the Unit and its contents as a prudent person would of their own property, and comply with the rules and regulations of the condominium juristic person."
      },
      {
       "_type": "clauseItem",
       "_key": "k065",
       "label": "6.2",
       "level": "main",
       "text": "Not sublet, assign the lease or allow others to occupy the Unit without the Lessor's written consent."
      },
      {
       "_type": "clauseItem",
       "_key": "k066",
       "label": "6.3",
       "level": "main",
       "text": "Not alter, add to or drill into the walls of the Unit without the Lessor's written consent."
      },
      {
       "_type": "clauseItem",
       "_key": "k067",
       "label": "6.4",
       "level": "main",
       "text": "Not keep pets unless permitted by the condominium rules and consented to by the Lessor in writing."
      },
      {
       "_type": "clauseItem",
       "_key": "k068",
       "label": "6.5",
       "level": "main",
       "text": "Not use the Unit for any unlawful purpose or cause nuisance to other residents."
      },
      {
       "_type": "clauseItem",
       "_key": "k069",
       "label": "6.6",
       "level": "main",
       "text": "Allow the Lessor or its agent to inspect the Unit at reasonable times with at least 24 hours' notice, except in an emergency."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k070",
     "title": "Repairs",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k071",
       "label": "7.1",
       "level": "main",
       "text": "The Tenant is responsible for routine maintenance, such as replacing light bulbs and cleaning the air conditioners every 6 months."
      },
      {
       "_type": "clauseItem",
       "_key": "k072",
       "label": "7.2",
       "level": "main",
       "text": "The Lessor is responsible for repairing the structure, the main systems of the Unit, and furniture or appliances that fail through normal use. The Tenant shall notify the Lessor of any defect."
      },
      {
       "_type": "clauseItem",
       "_key": "k073",
       "label": "7.3",
       "level": "main",
       "text": "The Tenant bears the cost of repairing damage caused by the Tenant, occupants or the Tenant's visitors."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k074",
     "title": "Termination",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k075",
       "label": "8.1",
       "level": "main",
       "text": "If the Tenant fails to pay rent or breaches any other term and does not remedy it within 30 days of written notice, the Lessor may terminate this Agreement."
      },
      {
       "_type": "clauseItem",
       "_key": "k076",
       "label": "8.2",
       "level": "main",
       "text": "If the Tenant wishes to terminate before expiry, the Tenant shall give at least 30 days' written notice and agrees that the Lessor may retain the deposit."
      },
      {
       "_type": "clauseItem",
       "_key": "k077",
       "label": "8.3",
       "level": "main",
       "text": "If the Unit becomes uninhabitable through no fault of either party, this Agreement ends and the Lessor shall refund the deposit and any advance rent for the period not occupied."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k078",
     "title": "Return of the Unit",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k079",
       "label": "9.1",
       "level": "main",
       "text": "When the Agreement ends, the Tenant shall return the Unit, keys and key cards in the condition recorded in Annex 1, except for normal wear and tear."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k080",
     "title": "Agent",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k081",
       "label": "10.1",
       "level": "main",
       "text": "Aquamax Property Co., Ltd. acts only as agent in finding the Tenant and coordinating. It is not a party to this Agreement and is not liable under it on behalf of either party."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k082",
     "title": "General",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k083",
       "label": "11.1",
       "level": "main",
       "text": "Any amendment must be made in writing and signed by both parties."
      },
      {
       "_type": "clauseItem",
       "_key": "k084",
       "label": "11.2",
       "level": "main",
       "text": "This Agreement is made in Thai and English. If the two differ, the Thai text prevails."
      },
      {
       "_type": "clauseItem",
       "_key": "k085",
       "label": "11.3",
       "level": "main",
       "text": "The annexes form part of this Agreement: (1) inventory and condition of the Unit; (2) copies of the parties' ID cards or passports; (3) copy of the Unit title deed."
      }
     ]
    }
   ],
   "closing": "Made in duplicate with identical wording. Both parties have read and understood it, signed it in the presence of witnesses, and each keeps one copy.",
   "signatures": [
    {
     "_type": "legalSignature",
     "_key": "k086",
     "label": "Lessor",
     "name": "{lessor_name_en}",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k087",
     "label": "Tenant",
     "name": "{tenant_name_en}",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k088",
     "label": "Witness",
     "name": "",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k089",
     "label": "Witness",
     "name": "Mr. Sakchai Suthipipat",
     "note": "Aquamax Property Co., Ltd. (Agent)"
    }
   ]
  }
 },
 "lessorPoa": {
  "th": {
   "title": "หนังสือมอบอำนาจ",
   "placeLine": "ทำที่ {poa_place} วันที่ {poa_date}",
   "stampDuty": "ติดอากรแสตมป์ 30 บาท",
   "intro": "ข้าพเจ้า {lessor_name} เลขประจำตัวประชาชน/หนังสือเดินทาง {lessor_id} ที่อยู่ {lessor_address} ในฐานะเจ้าของห้องชุดเลขที่ {unit_no} ชั้น {floor} อาคาร {building} โครงการ {project_th} (ต่อไปนี้เรียกว่า \"ห้องชุด\") ขอมอบอำนาจให้ บริษัท อควาแม็กซ์ พรอพเพอร์ตี้ จำกัด ทะเบียนนิติบุคคลเลขที่ 0105556032458 สำนักงานตั้งอยู่ที่ 58/20 หมู่ที่ 6 หมู่บ้านโนเบิลจีโอพระราม 5 ถ.นครอินทร์ ต.บางขุนกอง อ.บางกรวย จ.นนทบุรี 11130 โดย นายศักดิ์ชัย สุทธิพิพัฒน์ กรรมการผู้มีอำนาจ (ต่อไปนี้เรียกว่า \"ผู้รับมอบอำนาจ\") เป็นผู้กระทำการแทนข้าพเจ้า ดังนี้",
   "clauses": [
    {
     "_type": "contractClause",
     "_key": "k090",
     "title": "อำนาจที่มอบ",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k091",
       "label": "1.1",
       "level": "main",
       "text": "เจรจาและตกลงเงื่อนไขการเช่าห้องชุด โดยค่าเช่าไม่ต่ำกว่าเดือนละ {min_rent} บาท และระยะเวลาเช่าไม่เกิน {max_term} เดือน"
      },
      {
       "_type": "clauseItem",
       "_key": "k092",
       "label": "1.2",
       "level": "main",
       "text": "ลงนามในสัญญาเช่าห้องชุด เอกสารแนบท้าย และบันทึกการตรวจรับสภาพห้องชุด"
      },
      {
       "_type": "clauseItem",
       "_key": "k093",
       "label": "1.3",
       "level": "main",
       "text": "รับเงินประกัน ค่าเช่าล่วงหน้า และค่าเช่า ออกใบรับเงิน และนำส่งเข้าบัญชีธนาคาร {bank_name} เลขที่ {bank_account} ชื่อบัญชี {bank_account_name} ภายใน {remit_days} วันนับแต่วันที่ได้รับ"
      },
      {
       "_type": "clauseItem",
       "_key": "k094",
       "label": "1.4",
       "level": "main",
       "text": "ส่งมอบห้องชุด กุญแจ และคีย์การ์ดให้ผู้เช่า และรับคืนเมื่อสัญญาเช่าสิ้นสุด"
      },
      {
       "_type": "clauseItem",
       "_key": "k095",
       "label": "1.5",
       "level": "main",
       "text": "ติดต่อนิติบุคคลอาคารชุดเพื่อแจ้งข้อมูลผู้เช่าและขอคีย์การ์ด"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k096",
     "title": "ข้อจำกัด",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k097",
       "label": "2.1",
       "level": "main",
       "text": "หนังสือนี้ไม่รวมถึงการขาย โอน จำนอง หรือก่อภาระผูกพันใดในกรรมสิทธิ์ห้องชุด"
      },
      {
       "_type": "clauseItem",
       "_key": "k098",
       "label": "2.2",
       "level": "main",
       "text": "ผู้รับมอบอำนาจมอบอำนาจช่วงให้พนักงานของผู้รับมอบอำนาจกระทำการตามข้อ 1 ได้"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k099",
     "title": "ระยะเวลา",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k100",
       "label": "3.1",
       "level": "main",
       "text": "หนังสือนี้มีผลตั้งแต่วันที่ลงนามจนถึงวันที่ {poa_end_date} หรือจนกว่าข้าพเจ้าจะเพิกถอนเป็นหนังสือ"
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k101",
     "title": "ผลของการกระทำ",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k102",
       "label": "4.1",
       "level": "main",
       "text": "การใดที่ผู้รับมอบอำนาจได้กระทำไปภายในขอบอำนาจนี้ ให้มีผลผูกพันข้าพเจ้าเสมือนข้าพเจ้าได้กระทำเองทุกประการ"
      }
     ]
    }
   ],
   "closing": "เพื่อเป็นหลักฐาน ข้าพเจ้าได้ลงลายมือชื่อไว้ต่อหน้าพยาน",
   "signatures": [
    {
     "_type": "legalSignature",
     "_key": "k103",
     "label": "ผู้มอบอำนาจ",
     "name": "{lessor_name}",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k104",
     "label": "ผู้รับมอบอำนาจ",
     "name": "นายศักดิ์ชัย สุทธิพิพัฒน์",
     "note": "กรรมการผู้มีอำนาจ · บริษัท อควาแม็กซ์ พรอพเพอร์ตี้ จำกัด"
    },
    {
     "_type": "legalSignature",
     "_key": "k105",
     "label": "พยาน",
     "name": "",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k106",
     "label": "พยาน",
     "name": "",
     "note": ""
    }
   ],
   "docsNote": "เอกสารประกอบ: สำเนาบัตรประชาชนหรือหนังสือเดินทางของผู้มอบอำนาจ · สำเนาหนังสือกรรมสิทธิ์ห้องชุด · หนังสือรับรองบริษัทและสำเนาบัตรประชาชนกรรมการผู้รับมอบอำนาจ — ลงลายมือชื่อรับรองสำเนาถูกต้องทุกฉบับ"
  },
  "en": {
   "title": "Power of Attorney",
   "placeLine": "Made at {poa_place_en} Date {poa_date_en}",
   "stampDuty": "Duty stamp THB 30",
   "intro": "I, {lessor_name_en} , ID/Passport No. {lessor_id} , of {lessor_address_en} , owner of Unit No. {unit_no} , Floor {floor} , Building {building} , {project_en} (the \"Unit\"), hereby appoint Aquamax Property Co., Ltd. , company registration No. 0105556032458, of 58/20 Moo 6, Noble Geo Rama 5 Village, Nakhon In Road, Bang Khun Kong, Bang Kruai, Nonthaburi 11130, acting through Mr. Sakchai Suthipipat, authorised director (the \"Attorney\"), to act on my behalf as follows:",
   "clauses": [
    {
     "_type": "contractClause",
     "_key": "k107",
     "title": "Powers",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k108",
       "label": "1.1",
       "level": "main",
       "text": "To negotiate and agree the terms of a lease of the Unit, at a rent of not less than THB {min_rent} per month and for a term of not more than {max_term} months."
      },
      {
       "_type": "clauseItem",
       "_key": "k109",
       "label": "1.2",
       "level": "main",
       "text": "To sign the lease agreement, its annexes and the condition record of the Unit."
      },
      {
       "_type": "clauseItem",
       "_key": "k110",
       "label": "1.3",
       "level": "main",
       "text": "To receive the security deposit, advance rent and rent, issue receipts, and remit them to {bank_name_en} account No. {bank_account} , account name {bank_account_name} , within {remit_days} days of receipt."
      },
      {
       "_type": "clauseItem",
       "_key": "k111",
       "label": "1.4",
       "level": "main",
       "text": "To hand over the Unit, keys and key cards to the tenant, and take them back when the lease ends."
      },
      {
       "_type": "clauseItem",
       "_key": "k112",
       "label": "1.5",
       "level": "main",
       "text": "To deal with the condominium juristic person to register the tenant and obtain key cards."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k113",
     "title": "Limits",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k114",
       "label": "2.1",
       "level": "main",
       "text": "This power does not extend to selling, transferring, mortgaging or encumbering the Unit."
      },
      {
       "_type": "clauseItem",
       "_key": "k115",
       "label": "2.2",
       "level": "main",
       "text": "The Attorney may delegate the acts in Clause 1 to its employees."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k116",
     "title": "Term",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k117",
       "label": "3.1",
       "level": "main",
       "text": "This power is effective from signing until {poa_end_date_en} , or until I revoke it in writing."
      }
     ]
    },
    {
     "_type": "contractClause",
     "_key": "k118",
     "title": "Effect",
     "items": [
      {
       "_type": "clauseItem",
       "_key": "k119",
       "label": "4.1",
       "level": "main",
       "text": "Every act done by the Attorney within this power binds me as if done by me."
      }
     ]
    }
   ],
   "closing": "In witness whereof, I have signed this Power of Attorney in the presence of witnesses.",
   "signatures": [
    {
     "_type": "legalSignature",
     "_key": "k120",
     "label": "Grantor",
     "name": "{lessor_name_en}",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k121",
     "label": "Attorney",
     "name": "Mr. Sakchai Suthipipat",
     "note": "Authorised Director · Aquamax Property Co., Ltd."
    },
    {
     "_type": "legalSignature",
     "_key": "k122",
     "label": "Witness",
     "name": "",
     "note": ""
    },
    {
     "_type": "legalSignature",
     "_key": "k123",
     "label": "Witness",
     "name": "",
     "note": ""
    }
   ],
   "docsNote": "Supporting documents: copy of the Grantor's ID card or passport · copy of the Unit title deed · company affidavit and ID copy of the Attorney's director — each copy certified true by signature."
  }
 }
}

const strip = (o) => { if (!o) return o; const { _id, _type, _rev, _createdAt, _updatedAt, ...r } = o; return r }
const retype = (rows, t) => (rows ?? []).map(r => ({ ...r, _type: t }))

const ad = await q(`*[_type == "adContractTemplate" && !(_id in path("drafts.**"))] | order(version asc)`)
const lease = await q(`*[_id == "leaseDocTemplate-v1"][0]`)
if (!ad?.length || !lease) { console.error('old templates not found', ad?.length, !!lease); process.exit(1) }

const docs = []
for (const t of ad) docs.push({
  _id: `legalform-adcontract-v${t.version}`, _type: 'legalForm', formType: 'adContract',
  version: t.version, status: t.status, effectiveDate: t.effectiveDate, changeNote: t.changeNote,
  th: { intro: t.intro, clauses: t.clauses ?? [], closing: t.closing }, migratedFrom: t._id,
})
const qw = (w) => w && ({ title: w.title, to: w.to, intro: w.intro, terms: retype(w.terms, 'legalTermRow'), closing: w.closing })
const cw = (w) => w && ({ title: w.title, intro: w.intro, clauses: w.clauses ?? [], closing: w.closing, lessorLabel: w.lessorLabel, lesseeLabel: w.lesseeLabel, lessorTitle: w.lessorTitle })
const base = { version: lease.version, status: lease.status, effectiveDate: lease.effectiveDate, changeNote: lease.changeNote, migratedFrom: lease._id }
docs.push({ _id: 'legalform-rentspacequotation-v1', _type: 'legalForm', formType: 'rentSpaceQuotation', ...base, th: qw(lease.quotationTh), en: qw(lease.quotationEn) })
docs.push({ _id: 'legalform-rentspacecontract-v1',  _type: 'legalForm', formType: 'rentSpaceContract',  ...base, lessorMinutes: lease.lessorMinutes ?? 60, th: cw(lease.contractTh), en: cw(lease.contractEn) })
docs.push({ _id: 'legalform-rentspaceaddendum-v1',  _type: 'legalForm', formType: 'rentSpaceAddendum', version: 1, status: 'active', effectiveDate: '2026-10-08',
  changeNote: 'v1 — the addendum wording the app printed (Rental Contract Addendum Template v3), moved out of the code into Studio', th: ADDENDUM.th, en: ADDENDUM.en })
docs.push({ _id: 'legalform-condolease-v1', _type: 'legalForm', formType: 'condoLease', version: 1, status: 'active', effectiveDate: '2026-10-10',
  changeNote: 'v1 — owner / tenant condo lease (TH-EN), aquamx as agent only', th: NEW_FORMS.condoLease.th, en: NEW_FORMS.condoLease.en })
docs.push({ _id: 'legalform-lessorpoa-v1', _type: 'legalForm', formType: 'lessorPoa', version: 1, status: 'active', effectiveDate: '2026-10-10',
  changeNote: 'v1 — owner appoints Aquamax Property Co., Ltd. to let the unit', th: NEW_FORMS.lessorPoa.th, en: NEW_FORMS.lessorPoa.en })
for (const d of docs) delete d.migratedFrom   // kept in the log below only

// ad contracts: Template → the Legal Form copy of the same version
const contracts = await q(`*[_type == "adContract" && defined(template._ref)]{ _id, "ref": template._ref, "v": template->version }`)
const patches = contracts.filter(c => /^adcontract-template-v\d+$/.test(c.ref)).map(c => ({
  patch: { id: c._id, set: { template: { _type: 'reference', _ref: c.ref.replace('adcontract-template-v', 'legalform-adcontract-v') } } },
}))

const mutations = [...docs.map(d => ({ createOrReplace: d })), ...docs.map(d => ({ delete: { id: `drafts.${d._id}` } })), ...patches]
console.log(docs.map(d => `${d._id}  ${d.formType} v${d.version} ${d.status}`).join('\n'))
console.log(patches.map(p => `repoint ${p.patch.id} → ${p.patch.set.template._ref}`).join('\n') || 'no ad contract to repoint')
if (DRY) { console.log('dry run — nothing written'); process.exit(0) }
// create first, then repoint (a reference must point at an existing document)
for (const chunk of [mutations.filter(m => !m.patch), mutations.filter(m => m.patch)]) {
  if (!chunk.length) continue
  const r = await fetch(`https://${PROJECT_ID}.api.sanity.io/v${API}/data/mutate/${DATASET}`, { method: 'POST', headers: H, body: JSON.stringify({ mutations: chunk }) })
  if (!r.ok) { console.error('FAILED', r.status, await r.text()); process.exit(1) }
}
console.log('done — open Studio › ⚖️ Legal Forms')
