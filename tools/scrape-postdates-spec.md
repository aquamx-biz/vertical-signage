# สเปคเก็บวันที่โพสต์ต่อ portal (สำหรับรอบ re-scrape ถัดไป)

ตัวรับพร้อมแล้วทั้งสาย: การ์ดใส่ field `postCreatedAt` / `postUpdatedAt` (ISO, timestamp, หรือ
string ที่ `new Date()` อ่านได้) → `ingest-units.mjs` แปลงเป็น YYYY-MM-DD เอง (`isoDate`) →
ลง `unitSource.rentListings[]/saleListings[]` → โพสต์ที่ไม่อัพเดทเกิน **90 วัน** ติดธง stale
ไม่ถูกใช้ค้ำราคา/สถิติ (ยังเก็บใน source ให้ทีมเห็น) · การ์ดไม่มีวันที่ = ไม่ตัดสิน ใช้ตามปกติ

## แหล่งข้อมูลต่อ portal

| portal | เอาจากไหน | หมายเหตุ |
|---|---|---|
| PropertyScout | `__NEXT_DATA__` → listing object: `updatedAt` / `createdAt` (หรือชื่อใกล้เคียง `publishedAt`) | timestamp เต็ม แม่นสุด ไม่ต้องยิงหน้าเพิ่ม |
| LivingInsider | หน้า detail: "วันที่ลงประกาศ" + "อัพเดทล่าสุด" (วันที่ไทย พ.ศ. — แปลงปี −543) | อยู่ใน detail pass เดิม (ที่เก็บ badge/agent) |
| FazWaz | หน้า detail: บล็อก "Updated on ..." + JSON-LD `datePosted` | อยู่ใน detail pass เดิม |
| PropertyHub | serp/detail: "อัปเดตล่าสุด" — บางจุดเป็นเวลาสัมพัทธ์ ("3 วันที่แล้ว") | แปลงสัมพัทธ์→วันที่ ณ เวลา scrape (คลาด ±1 วันรับได้) |
| DotProperty | detail/JSON-LD (เครือ FazWaz) — ต้องพิสูจน์หน้าจริงรอบแรก | ถ้าไม่มีให้ปล่อย null |
| DDproperty | JSON-LD `datePosted` ใน detail — ติด Cloudflare ~17% | ได้เท่าที่ได้ ที่เหลือ null |
| ZmyHome *(ใหม่)* | หน้าประกาศ — พิสูจน์รอบแรก · posterType = "owner" ทุกใบโดยนิยามของเว็บ | เจ้าของโพสต์เองล้วน |
| Hipflat *(ใหม่)* | หน้าประกาศ/JSON-LD — พิสูจน์รอบแรก · **เอาราคา THB เท่านั้น** (เว็บโชว์หลายสกุล — ระวังโรค currency drift แบบ FazWaz) | มีหน้ารายโครงการ |
| BaanKaidee *(ใหม่)* | วันที่โพสต์บนการ์ด/หน้าประกาศ | ข้อมูลหยาบ สงสัย = null |

## กติกา
- ห้ามเดา/สังเคราะห์วันที่ — แปลงไม่ได้ให้ส่ง null
- ปี พ.ศ. ต้องลบ 543 ก่อน (LI/PH ชอบแสดง พ.ศ.)
- เวลาสัมพัทธ์: "x นาที/ชั่วโมง/วัน/สัปดาห์/เดือนที่แล้ว" → คำนวณจากเวลาที่ scrape การ์ดใบนั้น
