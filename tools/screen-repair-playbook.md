# Screen-repair playbook — ตั๋วจอเสียจาก LINE → ตรวจ/ซ่อม/รายงานอัตโนมัติ

Executed headless by `tools/screen-ticket-watcher.ps1` launching `claude -p`.
One run = one ticket. Follow EXACTLY; the guardrails come from real fleet
incidents (see repo CLAUDE.md GPU envelope + kiosk memories).

## Ticket contract (Sanity, `_type == "screenTicket"`)

Watcher hands you a ticket JSON: `_id, projectId, projectTitle, lineGroupId,
message, status ("working")`, and possibly `evidenceUrl` — a photo the
reporter took of the broken screen; fetch and LOOK at it for symptoms
(black screen vs frozen slide vs half-painted images) before diagnosing. You finish by patching the ticket to a terminal
status and POSTing the notify endpoint:

- `status: "fixed"` + `note` (what was wrong + what you did, one line, Thai,
  no jargon — residents read part of it) + `screenshotUrl` when allowed
- `status: "failed"` or `"needs_action"` + `note` (what a human must do)
- then `POST https://app.aquamx.biz/api/screen-ticket-notify {"ticketId": "<id>"}`

Patch via Sanity mutate API with the write token from
`aquamx-handoff/.env.local` (`SANITY_WRITE_TOKEN`); project `awjj9g8u`,
dataset `production`, apiVersion 2024-01-01.

## Box table (projectTitle/code → box)

| project code | box | Tailscale IP | player | screencap |
|---|---|---|---|---|
| noble-be19 | noble-be19a | 100.100.123.43 | de.ozerov.fully | **FORBIDDEN (4K = ANR)** |
| noble-be19 | noble-be19b | 100.87.197.15 | de.ozerov.fully | **FORBIDDEN (4K = ANR)** |
| lumpini-24 | lumpini-24 | 100.103.74.106 | com.yodeck.android (Fully wrap) | **FORBIDDEN** |
| the-room-sukhumvit-21 | the-room-skv21 | 100.109.31.88 | de.ozerov.fully | **FORBIDDEN (4K = ANR)** |
| mahogany-tower | mahogany-tower | 100.123.35.91 | com.yodeck.android (Fully single-app wrap) | ALLOWED (1080p) |
| 39-by-sansiri | 39-by-sansiri | 100.102.67.15 | com.fullykiosk.emm | ALLOWED (1080p) — fleet default caution |
| (lab) | SD2603-001 | 192.168.1.109 (LAN) / 100.71.132.15 | biz.aquamx.homeapp | ALLOWED (1080p) |

noble-be19 has TWO boxes — check both.

## Hard guardrails (violating these has crashed real screens)

1. **NEVER `adb screencap` on a FORBIDDEN box** — hangs Fully into ANR on 4K panels.
2. **NEVER restart adbd** (`stop adbd; start adbd` kills it for good on ZC ROMs).
3. **`am force-stop` leaves the box on the launcher** — ALWAYS follow with an
   explicit `am start` of the player and verify `dumpsys window | grep mCurrentFocus`.
4. **NEVER `adb reboot` autonomously** — that is a `needs_action` outcome for a human.
5. `dumpsys cpuinfo` is stale-cached on these boxes — use `top -bn1` if needed.
6. Do not change Fully prefs/startURL in this flow.

## Procedure

1. Resolve box(es) from the table. `adb connect <ip>:5555` (timeout fast; also
   try `ping <ip>` to distinguish box-offline vs adb-only).
2. **Unreachable** (no ping, no adb): check whether the WHOLE site is dark →
   GET `https://app.aquamx.biz/api/kiosk-beacon`, find the project's screens'
   `minAgo`. Beacon also silent ⇒ site power/网 outage → `needs_action`
   ("กล่องออฟไลน์ทั้งไซต์ น่าจะไฟ/เน็ตหน้างาน — ต้องให้นิติช่วยเช็คปลั๊ก/เราเตอร์").
   Beacon ALIVE but adb dead ⇒ VPN-only issue; if beacon `slide` rotates the
   screen is actually fine → `fixed` with note ("จอแสดงผลปกติ ระบบเข้าถึงทางไกลมีปัญหาชั่วคราว").
3. **Reachable**: gather state:
   - `dumpsys power | grep -E "mWakefulness|Display Power"` (screen on?)
   - `dumpsys window | grep mCurrentFocus` (player foreground?)
   - beacon freshness for this project (minAgo, slide).
4. Fixes, escalating, verify after EACH step (focus + beacon fresh within ~6 min):
   a. Screen off → `input keyevent KEYCODE_WAKEUP`.
   b. Wrong/blank foreground → start the player app for that box
      (`am start -n de.ozerov.fully/.MainActivity` / yodeck via
      `monkey -p com.yodeck.android 1` / homeapp `.MainActivity`).
   c. Player foreground but beacon stale → ONE `am force-stop <player>` then
      `am start` (guardrail 3), wait 90s, re-check beacon.
5. Healthy end-state = player focused + beacon fresh (minAgo small) + slide
   field rotating. On ALLOWED boxes additionally capture proof:
   `adb shell screencap -p /sdcard/aq-proof.png` → `adb pull` → upload to
   Sanity image asset (curl POST assets/images with write token) → put the
   returned CDN url in `screenshotUrl`.
6. Patch ticket terminal status + POST the notify endpoint. Also append a short
   action log to the ticket `note` (what you found/did).
7. If ANY ambiguity or a guardrail blocks the fix → `needs_action`, never guess.
