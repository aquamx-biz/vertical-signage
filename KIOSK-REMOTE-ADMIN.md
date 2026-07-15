# คู่มือรีโมทเข้ากล่องจอ (Fully Kiosk Remote Admin)

ใช้ดู/กู้จอจากคอมโดยไม่ต้องเดินไปที่จอ

**รีโมทข้ามไซต์ (จากบ้าน) = ใช้ Tailscale** (ดูหัวข้อล่าง) → `http://<tailnet-ip>:2323`
**อยู่ wifi วงเดียวกับกล่อง** → `http://<lan-ip>:2323` ก็พอ
**สำรอง (ไม่ต้องติดตั้งอะไร)** → cloud.fully-kiosk.com (บัญชีเจ้าของกดเอง)

## ทะเบียนกล่อง (device registry)

| ชื่อ | ไซต์ | Tailnet IP | LAN IP | บอร์ด/Android | wifi | MAC |
|---|---|---|---|---|---|---|
| Gygar43 | mahogany (บ้าน) | — | 192.168.1.137 | rk3588s / 13 | Theake_2.4G | B8:41:D9:F1:8F:A8 |
| noble-be19a | noble-be19 | 100.100.123.43 | 192.168.1.4 | YF_020E / 11 | Aquamx004-5G | (ดู Device Info) |

Remote Admin password (ทุกกล่อง): ดูจาก Fully Cloud หรือ Settings ที่กล่อง

## Tailscale — รีโมทข้ามไซต์ (ตั้งครั้งเดียวต่อกล่อง)

ทำให้กล่องทุกตัวอยู่ "วงเน็ตส่วนตัว" เดียวกัน (tailnet `aquamx.biz`) รีโมทจากที่ไหนก็ได้

**ที่กล่อง (ต้องมีคนอยู่หน้าเครื่อง — Android บังคับ):**
1. ติดตั้ง Tailscale — ถ้ากล่องเปิด Play Store ไม่ได้ ให้กด Install จาก play.google.com
   บนคอม แล้วเลือกอุปกรณ์ (กล่องจะขึ้นในรายการถ้าผูกบัญชี Google เดียวกัน) → ติดตั้งรีโมท
2. **ตั้ง Home app เป็น Fully หรือ Quickstep ก่อน** (Settings → Apps → Default apps → Home app) —
   ห้ามปล่อยว่างหลังถอน launcher เดิม ไม่งั้นวนลูป "หา launcher ไม่เจอ"
3. เปิด Tailscale → Log in → **ถ้าเด้งไป Fully (kiosk browser เปิด OAuth ไม่ได้)**:
   Settings → Apps → Default apps → **Browser app → เปลี่ยนจาก Fully เป็นเบราว์เซอร์อื่น**
   แล้ว Log in ใหม่ (Fully ไม่จำเป็นต้องเป็น browser หลัก signage ยังทำงาน)
4. Sign in บัญชีกลาง **info@aquamx.biz** → กด OK ตอนถาม VPN connection
5. (แนะนำ) ในหน้า Tailscale admin ตั้งค่า device นี้เป็น **key expiry: never** ไม่งั้น key หมดอายุ ~180 วันต้อง login ใหม่

**ที่คอม:** ติดตั้ง Tailscale (tailscale.com/download) → login `info@aquamx.biz`
→ `tailscale status` เห็น IP `100.x.x.x` ของทุกกล่อง → `http://<ip>:2323` รีโมทได้เลย

## เดิม: อยู่ wifi วงเดียวกับกล่อง

## ตั้งค่าครั้งเดียวต่อกล่อง

1. ที่กล่อง: เปิดเมนู Fully (ใส่ PIN) → **Settings → Remote Administration (PLUS)**
2. ติ๊ก **Enable Remote Administration** + ตั้ง **Admin Password**
3. ติ๊ก **Remote Admin from Local Network**
4. จด **IP ของกล่อง** (โชว์ในหน้านั้น) + รหัสที่ตั้ง

## วิธีใช้ (เบราว์เซอร์)

เปิด `http://<IP>:2323` → ใส่ Admin Password → คำสั่งที่ใช้บ่อย:

| คำสั่ง | ใช้เมื่อ |
|---|---|
| **Get Screenshot** | ดูหน้าจอจริง (เฟรมบัฟเฟอร์ ไม่ใช่ภาพถ่าย) |
| **Load Start URL** | รีโหลดหน้าเว็บจอ (รับ deploy ใหม่ / แก้ค้างเบา ๆ) |
| **Restart Fully App** | หน้าค้างหนัก นาฬิกาบนจอหยุดเดิน — ใช้ตัวนี้ |
| **Inject JavaScript** | รันโค้ดในหน้าจอ (debug ขั้นสูง) |

## วิธีใช้ (command line / สคริปต์)

```bash
# login ครั้งแรก (ได้ cookie)
curl -c fk.cookies -X POST "http://IP:2323/home" \
  --data-urlencode "password=รหัส" --data-urlencode "cmd=login" --data-urlencode "submit=OK"

curl -b fk.cookies "http://IP:2323/?cmd=getScreenshot" -o screen.png   # แคปหน้าจอ
curl -b fk.cookies "http://IP:2323/?cmd=loadStartUrl"                  # รีโหลดหน้า
curl -b fk.cookies "http://IP:2323/?cmd=restartApp"                    # รีสตาร์ทแอป
curl -b fk.cookies "http://IP:2323/?cmd=deviceInfo&type=json"          # ข้อมูลเครื่อง
```

## ⚠️ ข้อห้าม (บทเรียน 2026-07-15)

- **ห้าม getScreenshot ถี่ ๆ บนกล่องจอ 4K** — การอัดภาพ 4K วิ่งบน thread หลักของ Fully
  แคปซ้อนกัน = แอปค้างจนขึ้น "Fully Kiosk Browser isn't responding" (ANR)
  → เช็คสถานะผ่าน beacon (`app.aquamx.biz/api/kiosk-beacon`) ก่อนเสมอ
  แคปจอเฉพาะจำเป็น ครั้งเดียว timeout ยาว ๆ
- **เครื่องหนึ่งรันแอป signage ตัวเดียว** — Yodeck ที่ค้างเบื้องหลังแย่ง CPU/GPU กับ Fully
  ทำจอหน่วง/ทัชไม่ติดเรื้อรัง → ปิด/ถอน Yodeck ออกจากกล่องที่ใช้ Fully

## เทคนิควินิจฉัยจากเซสชัน 2026-07-14

- **เฟรมดำหาย ๆ มา ๆ**: แคปรัว ๆ ให้ครบรอบสไลด์ (ทุก 4 วิ × ~2.5 นาที) —
  เฟรมดำ = ไฟล์ PNG เล็กสุด เปิดดูเฉพาะตัวเล็กพอ
- **นาฬิกาบนจอไม่ตรงเวลาจริง** = หน้าเว็บค้าง → Restart Fully App
- **แคปได้ HTML แทนรูป** = session หมดหลังแอปรีสตาร์ท → login ใหม่
- กฎฮาร์ดแวร์จอ (ห้ามฝ่าฝืนในโค้ด): ห้าม backdrop-filter ทุกกรณี ·
  วีดีโอต้องซ่อนจนมีเฟรมแรก · รูปทุกผิวต้อง decode-gate + prewarm ตรง size

## หา IP ไม่เจอ

- Fully Cloud → เลือก device → มี IP โชว์
- ที่กล่อง: Fully Settings → Device Info

## IP เปลี่ยนได้ — อย่าจำเลขตายตัว

- ย้าย wifi = ได้เลขใหม่แน่นอน · อยู่วงเดิมก็เปลี่ยนได้หลังไฟดับ/รีบูต router (DHCP)
- ก่อนรีโมททุกครั้ง เช็ค IP ล่าสุดจาก Fully Cloud ก่อน
- ทางถาวร: ตั้ง **DHCP Reservation** ที่ router ของไซต์ — ผูก MAC ของกล่อง
  (ดูใน Device Info) กับ IP ที่เลือก → กล่องได้เลขเดิมตลอด · MAC ที่รู้แล้ว:
  Gygar43 (บ้าน) = `B8:41:D9:F1:8F:A8`
