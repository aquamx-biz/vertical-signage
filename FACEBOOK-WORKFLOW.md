# Facebook workflow (aquamx) — read before changing it

Owner: Sakchai. Last restructured 18 Nov 2026. This file is the single place that
describes how the Facebook scan / reply / post work is split. **Before you add a
scheduled task, change a task prompt, or change a schema field listed here, read
this file and update it in the same change.** Do not build a second version of
anything below — extend what exists.

## 1. Scheduled tasks (Claude scheduled tasks, all model opus 5.5, Thai time)

| Task | Chrome / account | Schedule | What it does |
|---|---|---|---|
| Scan01_Page | Page aquamx | daily 00:01 | Reads every group the page is a member of for condo seekers and owner/agent listings (no time or post cap). |
| Scan02_Personal | The-ake Delon | daily 00:01 | Same, for the 2 private groups the page cannot join + Marketplace search. Moves to Aquamx Live once both groups approve it. |
| Reply01_Page | Page aquamx | hourly :41 (reads inbound in even hours) | Comments as the page; reads page inbox, comments on our posts, IG. |
| Reply02_Personal | The-ake Delon | even hours :46 | DMs and follow-ups in The-ake chats. Existing chats stay on The-ake. |
| Post01 | Page → Aquamx Live → The-ake | hourly :26 (posting 09:00–20:59) | (a) lists accepted units on the web + makes covers; (b) page posts: groups ≤10/day, page feed ≤3, IG ≤3; (c) personal: 3 personal-only groups as **Aquamx Live** ≤2/day, Marketplace as **The-ake** ≤1/day. |
| Post02.1_SendLink_Page | Page aquamx | odd hours :56 | Sends the web link to owners who accepted in the page inbox. |
| Post02.2_SendLink_Personal | The-ake Delon | even hours :56 | Sends the web link to owners who accepted in The-ake chats (stays on The-ake). |
| Report01 | — | daily 21:37 | Daily Thai summary. |

The task table also lives in Sakchai's artifact "แผนยุบงานตั้งเวลา aquamx" — keep both in step.

## 2. Chrome profiles (Claude in Chrome deviceIds)

| Account | deviceId | /me must land on |
|---|---|---|
| Page aquamx | 62dbca05-3a90-4b59-ab79-5ca5e7cbc8f4 | /aquamx.biz/ |
| The-ake Delon (personal, old) | c5238c64-ee4c-42ec-8984-a96a6df52ef0 | /akebangplad/ |
| Aquamx Live (personal, new, warming up since 18 Nov 2026) | 6a92bf02-2f2f-4197-bd66-74d91b8a1415 | /profile.php?id=61596482469599 |

- Never switch Facebook profiles inside a Chrome; use the Chrome already logged in.
- One task per Chrome at a time: localStorage keys `aqmx_lock` / `aqmx_want` = `{"task","at"}` in a facebook.com tab; lock older than 20 min = free; delete your own lock when done.
- 03:15–03:55 the LivingInsider task uses the The-ake Chrome without the queue — keep off it.
- Aquamx Live: no DMs to anyone during warm-up; Marketplace stays on The-ake until Sakchai says otherwise.
- In any group where Page aquamx is a member, reply as the page only.

## 3. Sanity data (project awjj9g8u, dataset production)

- `unitProfile.fbPosts` (Studio title **Social media posts**) = OUR posts (output). Every post is logged right away with its link and `channel` → demandSource.
- `unitProfile.sourcePosts` (**Source posts**) = posts by the owner/other agents (input), incl. the post we got the unit from (`isOrigin`). Post01 writes it when a unit is listed and **never posts a unit into a group listed in its sourcePosts**; units sourced from Marketplace are never put on Marketplace.
- `demandSource` (Studio: Marketing Channel) = group registry. `joinedAs` values: `page`, `personal` (The-ake), `aquamxLive`. `postAs`: `page` / `personal`. Only `postingActive` groups are posted to, filtered by `accepts` and `scope`.
- `lead` = every seeker / owner contact. Replies are logged in `lead.aiReplies[]` with `finalText`, `channel`, `sentAs` and a `screenshot` of the sent message. No `party` until a real conversation.

## 4. Where the code is

- Schemas: `sanity-studio/schemas/unitProfile.ts`, `demandSource.ts`, `lead.ts`. Studio + schema deploy on push to master (`.github/workflows/studio-deploy.yml`).
- Recent changes: PR #73 (Source posts / Social media posts), PR #74 (`aquamxLive` in Member as).
- Git: Sakchai pushes from his PC; Claude opens/merges the PR.
