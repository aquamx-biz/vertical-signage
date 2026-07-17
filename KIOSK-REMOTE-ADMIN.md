# คู่มือรีโมทเข้ากล่องจอ (Fully Kiosk Remote Admin)

ใช้ดู/กู้จอจากคอมโดยไม่ต้องเดินไปที่จอ

**รีโมทข้ามไซต์ (จากบ้าน) = ใช้ Tailscale** (ดูหัวข้อล่าง) → `http://<tailnet-ip>:2323`
**อยู่ wifi วงเดียวกับกล่อง** → `http://<lan-ip>:2323` ก็พอ
**สำรอง (ไม่ต้องติดตั้งอะไร)** → cloud.fully-kiosk.com (บัญชีเจ้าของกดเอง)

## ทะเบียนกล่อง (device registry)

| ชื่อ | ไซต์ | Tailnet IP (hostname) | LAN IP | บอร์ด/Android | wifi | MAC |
|---|---|---|---|---|---|---|
| Gygar43 | mahogany (บ้าน) | 100.71.132.15 (zc-h358s) | 192.168.1.137 | ZC-H358S rk3588s / 13 | Theake_2.4G | B8:41:D9:F1:8F:A8 |
| noble-be19a | noble-be19 | 100.100.123.43 (yf-020e) | 192.168.1.4 | YF_020E rk3566 / 11 · จอ override 1080p · ไม่มี Yodeck | Aquamx004-5G | (ดู Device Info) |
| noble-be19b | noble-be19 | 100.87.197.15 (yf-020e-1) | 192.168.1.46 | YF_020E rk3566 / 11 · 4K 2160×3840 | Noble B19_LobbyB_5G | 68:8F:C9:12:B6:BC |

**adb:** ทุกกล่องเปิด `persist.adb.tcp.port=5555` แล้ว → `adb connect <tailnet-ip>:5555` ได้เลย
⚠️ **wifi Noble B19_LobbyB มี client isolation** — คอมกับกล่องอยู่ SSID เดียวกันก็คุยกันตรง ๆ ไม่ได้
(LAN adb/2323 ใช้ไม่ได้แม้อยู่หน้างาน) → ใช้ tailnet IP เสมอ · mDNS discovery ทะลุได้แต่ unicast โดนบล็อก

### ตั้ง Fully เป็น Home app ผ่าน adb (บทเรียน be19b 2026-07-16)

**Yodeck ต้อง disable ก่อน** ไม่งั้นตั้ง home ไม่ติด — Yodeck ไม่ได้แค่กิน RAM (4K + 2 แอป
signage บน RAM 4GB = OOM thrash → Fully ANR) แต่ตอนบูตมันเป็นตัวเลือก HOME แย่งกับ Fully
ทำให้ default ไม่ล็อก และ component Fully โดน disable กลับทุกรีบูต ลำดับที่รอดข้ามรีบูตจริง:

```bash
adb -s <ip>:5555 shell pm disable-user --user 0 com.yodeck.android   # ปิด Yodeck (ย้อนได้)
adb -s <ip>:5555 shell am force-stop com.yodeck.android
adb -s <ip>:5555 shell pm enable de.ozerov.fully/de.ozerov.fully.LauncherReplacement
adb -s <ip>:5555 shell cmd package set-home-activity de.ozerov.fully/.LauncherReplacement
# ยืนยัน: resolve-activity ... HOME --brief  → ต้องได้ de.ozerov.fully/.LauncherReplacement
# แล้ว reboot จริงเช็คว่า LauncherReplacement ไม่กลับไปอยู่ disabledComponents
```

⚠️ อย่าเคลมว่าเสร็จก่อนรีบูตทดสอบ — `pm set-home-activity` อย่างเดียวชนะแค่รอบเดียว
ถ้ายังมี home candidate อื่น (Yodeck) จะหลุดหลังบูต

### สถานะปัจจุบัน be19b (2026-07-16): Fully → หน้า holding ในเครื่อง (offline)

**เดิม** กล่องนี้ตั้ง Fully เป็น **Single App Mode ครอบ Yodeck** (`singleAppIntent` →
`com.yodeck.android`) และ Yodeck เล่นคอนเทนต์เป็นหน้าเว็บ `noble-be19.netlify.app`
(สาย Fully → Yodeck → netlify) เว็บโหลดพลาดบ่อย (`ERR_CONNECTION_ABORTED`) + RAM ตึง

**ตอนนี้เปลี่ยนเป็น** Fully โหลดไฟล์ static ในเครื่องตรง ๆ ตัด Yodeck+netlify ออก (offline 100%):
- `singleAppMode=false`, `startURL=file:///sdcard/aquamx-holding.html`
- ไฟล์ต้นฉบับ = `holding.html` ใน repo (navy+bronze, สองภาษา, self-contained)
- ยืนยันขึ้นเองหลังรีบูตจริงแล้ว

อัปเดตไฟล์ holding: แก้ `holding.html` → `adb push holding.html /sdcard/aquamx-holding.html`
→ REST `?cmd=loadStartUrl&password=<pw>` (ไม่ต้องรีสตาร์ท)

ตั้งค่า Fully จากคอมผ่าน REST (Remote Admin ต้องเปิด):
```bash
PW=<remoteAdminPassword>; IP=<tailnet-ip>:2323
curl "http://$IP/?cmd=setStringSetting&key=startURL&value=<urlencoded>&password=$PW"
curl "http://$IP/?cmd=setBooleanSetting&key=singleAppMode&value=false&password=$PW"
curl "http://$IP/?cmd=loadStartUrl&password=$PW"
# เปลี่ยน setting เสร็จ ต้อง force-stop+start Fully ถึงจะหลุด single-app session เดิม
```

**ย้อนกลับไป Yodeck:** `setBooleanSetting singleAppMode=true` + ให้ `singleAppIntent` ชี้
`com.yodeck.android/com.example.yodeck_library.MainActivity` แล้ว restart Fully
(Yodeck ถูก enable กลับแล้ว — ก่อนหน้าเคย disable-user ตอนไล่ ANR)

**be19a ก็ตั้งเหมือนกันแล้ว (2026-07-16):** Fully → `file:///sdcard/aquamx-holding.html`, home,
`persist.adb.tcp.port=5555`, ยืนยันรอดรีบูต · be19a ไม่มี Yodeck ตั้งแต่แรก · จอ override 1080p
เคล็ด: ถ้า REST setStringSetting startURL ไม่ติด → แก้ prefs ตรง ๆ ด้วย root ชัวร์กว่า:
`am force-stop de.ozerov.fully; sed -i 's|>OLD_URL<|>file:///sdcard/aquamx-holding.html<|' <prefs>; am start ...`
⚠️ **อย่าเปิดหน้า Android Settings → Default apps → Home app picker** — แค่เปิด picker จะล้าง
default home ทันที (ต้อง set-home-activity ใหม่) เจอกับ be19b มาแล้ว

### ⚠️ be19a: กับดัก 2 อย่างที่ทำจอค้าง "Loading..." (บทเรียน 2026-07-17)

**1. `graphicsAccelerationMode` ต้อง = 1** — be19a ตั้งไว้ = 2 (software) → WebView 4K
เรนเดอร์ไม่ไหว ค้าง "Loading..." ตลอด · แก้: `sed` prefs เป็น `>1</string>` (เทียบกับ be19b = 1)

**2. Fully-as-home ทำ dialog "Switch Home Button Lock off?" วนทุกบูต** — ถ้า Fully ถูกตั้งเป็น
home ด้วย `set-home-activity` (adb) อย่างเดียว แต่ไม่ได้ถือ HOME role จริง Fully จะเด้ง dialog นี้
ทุกบูต **บล็อก WebView ไม่ให้โหลด** (กด BACK/NO ไม่หาย มันวน) →
**ทางแก้ที่ใช้ได้: กด YES (ปลด home-lock)** ให้ Fully เป็นแอปธรรมดา แล้วพึ่ง `launchOnBoot=true`
เปิดเองตอนบูต · be19a รันแบบนี้ (home = Quickstep, Fully autostart) · ยืนยันรอดรีบูตแล้ว
· be19b ไม่เจอปัญหานี้เพราะถือ HOME role ถูกต้อง (ตอนตั้งค่ามีคนอยู่หน้าเครื่องกด Always)

## มอนิเตอร์สุขภาพจอ (2026-07-17)

**ชั้น 1 — beacon ในหน้า holding:** `holding.html` มี `<script>` ยิง POST ทุก 5 นาที ไป
`app.aquamx.biz/api/kiosk-beacon` (field `slide=holding@<dev>`) · ไฟล์ต่อกล่อง sed `__AQDEV__`→
`be19a`/`be19b` ก่อน push · จอเงียบ >12 นาที = ค้าง/ดับ/เน็ตหลุด · อ่าน: curl endpoint นั้น
⚠️ be19a เคย ANR ตอน force-reload beacon ใต้โหลดสูง — บูตสะอาดแล้วรันได้ ถ้า ANR ซ้ำให้ถอด beacon

**ชั้น 2 — VPN health check:** `tools/kiosk-health.ps1` (Task Scheduler "AquaMX Kiosk Health"
ทุก 4 ชม.) เช็คผ่าน tailnet: ping/adb/foreground-app/screen/RAM/storage/ANR-count/top-CPU →
**POST ขึ้น `app.aquamx.biz/api/kiosk-health`** (+ เขียนไฟล์ local `tools/health/kiosk-health.html`
เป็น backup) · ทำงานเฉพาะตอนคอมเปิด

**หน้าเว็บรวม: `app.aquamx.biz/kiosk`** — รวม beacon (สด, always-on) + health (adb, ทุก 4 ชม.)
เป็น dashboard เดียว battery-bar เปิดจากมือถือได้ · source อยู่ที่ repo `aquamx-handoff`
(`app/kiosk/page.tsx` + `app/api/kiosk-health/route.ts`) deploy ผ่าน Netlify master · ตอนนี้
**เปิด public** (ยังไม่มีรหัส) · merge key: beacon slide `holding@be19a` ↔ health device `noble-be19a`

⛔ **ห้าม screencap ในการเช็คสุขภาพ** — `adb screencap` บนจอ 4K RK3566 นี้ทำ Fully ค้าง ANR
**ทั้ง be19a และ be19b** (ยืนยันแล้ว ตรงกฎ "no repeated screenshots on 4K") · สคริปต์เลยตั้ง
`Screencap = $false` ทั้งคู่ ใช้ beacon เป็นตัวยืนยัน render (field `scr` ไม่ใช่ 0x0 = เรนเดอร์แล้ว)
· probe เบา ๆ (dumpsys/free/uptime) ปลอดภัย ไม่ทำ ANR · ต้องแคปจริง = ทำครั้งเดียว มือ ตอนจำเป็น

### 🎯 ต้นตอ ANR ที่แท้จริง = `volumelock.vlocker` (2026-07-17)

กล่อง ANR ~12 ครั้ง/วัน · ไล่ด้วย `top -o %CPU` เจอ **`volumelock.vlocker` เผา CPU 80-120%
ต่อเนื่องทั้งสองกล่อง** (แอปล็อกเสียงที่วน set volume ไม่หยุด → กระแทก CPU + audioserver →
Fully main thread อดตาย → ANR) · **ปิดแล้ว** (`pm disable-user volumelock.vlocker`) เพราะ
**Fully ล็อกเสียงเองอยู่แล้ว** (`disableVolumeButtons=true`, `volumeLevels`, มี volume license)
vlocker จึงซ้ำซ้อน · หลังปิด: RAM ว่าง be19a 130→308MB

แอปขยะอื่นที่ปิดไปด้วย (ไม่เกี่ยว signage): Ookla Speedtest, Chrome (Fully ใช้ WebView เอง), TTS
· freeze Play/GMS background: `am set-standby-bucket com.android.vending restricted` +
`cmd appops set com.android.vending RUN_ANY_IN_BACKGROUND deny`

⚠️ **`load average` บน RK3566 เชื่อไม่ได้** — `/proc/loadavg` โชว์เลข 6-10 ทั้งที่มี runnable
แค่ 2-4 thread (kernel นับเพี้ยน) · ตัวชี้วัดจริง = **%CPU ใน top** + **จำนวน ANR/วัน**
(health check เก็บ `anrToday`, `topCpu`, `memFreeMB`, `storagePct` ลง CSV + dashboard แล้ว)
พิสูจน์ผลปิด vlocker = ดู anrToday ของ "พรุ่งนี้" (วันนี้เลขค้างเพราะ ANR เกิดก่อนแก้)

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

### ⛔ เช็คลิสต์บังคับก่อนออกจากไซต์ (บทเรียน 2026-07-16 — เสียเที่ยวเพราะข้ามข้อ 1)

ตั้ง Tailscale แล้ว **ห้ามเดินออกจากไซต์จนกว่าจะทำครบ 2 ข้อนี้** ไม่งั้นกล่องหลับแล้ว
Tailscale หลุด → รีโมทจากบ้านไม่ได้ → ต้องกลับไปไซต์ใหม่:

1. **Always-on VPN (สำคัญสุด):** Android Settings → Network & Internet → VPN →
   ⚙️ ข้าง Tailscale → เปิด **"Always-on VPN"** → Tailscale เชื่อมเองทุกครั้ง
   แม้กล่องหลับ/รีบูต (ไม่ตั้ง = หลุดทุกครั้งที่หลับ)
2. **เปิด ADB over network + authorize คอมที่จะรีโมท** (Developer options → Wireless
   debugging) → เพื่อสั่ง `wm size` / `getprop` จากบ้านได้ · authorize ครั้งแรก
   ต้องกดที่จอ ทำตอนอยู่หน้าเครื่องเท่านั้น
3. ทดสอบจากคอม (ต่างเน็ต/มือถือ hotspot) ว่า `tailscale ping <ip>` ได้ pong **ก่อนออกจากไซต์**

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
