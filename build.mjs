#!/usr/bin/env node
/**
 * build.mjs  —  Per-project static build for the vertical-signage kiosk
 *
 * Usage:   node build.mjs
 * Output:  deploy/{projectCode}/index.html   (one folder per active project)
 *          deploy/{projectCode}/netlify.toml
 *
 * How it works:
 *   1. Fetches all projects where isActive == true from Sanity.
 *   2. For each project fetches playlist, providers (with offers), notices, categoryConfig.
 *   3. Injects the data as window.__BAKED__ into a copy of vertical-signage.html.
 *   4. Writes the copy to deploy/{code}/index.html.
 *
 * Schema notes (post-migration):
 *   - media.enabled       → media.isActive
 *   - media.allProjects   → media.scope == "global"
 *   - media.category      → removed; use offer.category (or playlistItem.touchExploreCategory)
 *   - media.startAt/endAt → removed; schedule lives only on playlistItem
 *   - provider.nameEN/TH  → provider.name_th / provider.name_en
 *   - playlistItem.imageDurationOverride → playlistItem.displayDuration
 *   - playlistItem.touchExploreDefaultOffer → playlistItem.touchExploreDefaultProvider
 *   - buildingUpdate type → media(kind="notice", category="buildingUpdates")
 *   - categoryConfig.categories[].subcategories → flat string[]
 *   - categoryConfig.categories[].fallbackSubcategoryId → defaultSubcategory
 *
 * Requirements:  Node.js 18+ (uses native fetch, fs/path/url built-ins)
 */

import { readFileSync, mkdirSync, writeFileSync, copyFileSync, cpSync, existsSync } from 'fs'
import { join, dirname }                                        from 'path'
import { fileURLToPath }                                        from 'url'
import { createHash }                                           from 'crypto'
import { selectWithPolicy, profileToRow, PROFILE_PROJECTION, closedTooLong, CLOSED_DAYS } from './board-engine.mjs'
import { marketModel, expectedPsqm, valueVsExpected } from './market-model.mjs'

/* ชนิดห้องต้องมีอย่างน้อยเท่านี้ถึงจะได้สไลด์ของตัวเอง */
const SEG_MIN = 1  // เจ้าของงานสั่ง 2026-08-10: ทุกชนิดที่มีห้อง (แม้ 1) ได้สไลด์ (ไม่งั้นตึกห้องน้อยเช่น Mahogany ไม่มี media)

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Sanity credentials ────────────────────────────────────────────────────────
// Token is read from the environment — never hardcoded.
// Local dev: run with  node --env-file=.env build.mjs
// CI/CD:     set SANITY_TOKEN as a secret environment variable.
const SANITY_PROJECT_ID = 'awjj9g8u'
const SANITY_DATASET    = 'production'
const SANITY_API_VER    = '2024-01-01'
const SANITY_TOKEN      = process.env.SANITY_TOKEN ?? ''
if (!SANITY_TOKEN) { console.error('ERROR: SANITY_TOKEN env var is not set.'); process.exit(1) }

// ── GROQ helper ───────────────────────────────────────────────────────────────
async function sanityFetch(query, dataset = SANITY_DATASET) {
  // perspective=published is LOAD-BEARING for the Pending-Changes workflow:
  // with an authorized token the default (raw) perspective ALSO returns
  // drafts.* documents, so unreviewed drafts could leak onto screens.
  // Published-only keeps the pipeline invariant: "draft never airs".
  const url =
    `https://${SANITY_PROJECT_ID}.api.sanity.io` +
    `/v${SANITY_API_VER}/data/query/${dataset}` +
    `?query=${encodeURIComponent(query)}&perspective=published`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${SANITY_TOKEN}` } })
  if (!r.ok) throw new Error(`Sanity ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}

// ── 1. Fetch all active projects ──────────────────────────────────────────────
console.log('Fetching active projects from Sanity…')
const projects = await sanityFetch(
  `*[_type == "project" && isActive == true]{ _id, title, "code": code.current }`
)

if (!projects?.length) {
  console.error('No active projects found. Aborting.')
  process.exit(1)
}
console.log(`Found ${projects.length} active project(s): ${projects.map(p => p.code).join(', ')}`)

// ── 2. Read the SW once; the HTML player template is chosen per project below ──
const swSource = readFileSync(join(__dirname, 'sw.js'), 'utf8')

// Split-flap unit-price board template (FOR RENT / FOR SALE), baked per project
// per mode to ../{code}/board/{mode}/index.html from published unitBoard docs.
const boardTemplate = readFileSync(join(__dirname, 'board.html'), 'utf8')
// สองหน้าตาของบอร์ดเดียวกัน: split-flap (/board/) กับ การ์ด 3 ภาษา (/board-cards/)
// ใช้ข้อมูลชุดเดียวกัน — media doc ชี้ URL ไหนก็ได้ตามที่โครงการเลือก
const cardsTemplate = readFileSync(join(__dirname, 'board-cards.html'), 'utf8')

// unitProfile.projectName is a free string from the scraping pipeline and does
// not always equal project.title ("The Lumpini 24" vs "Lumpini 24") — map per
// code here until profiles carry a real project reference.
const UNIT_PROJECT_NAMES = {
  '39-by-sansiri':  ['39 by Sansiri'],
  'lumpini-24':     ['The Lumpini 24', 'Lumpini 24'],
  'the-room-skv21': ['The Room Sukhumvit 21'],
  'noble-be19':     ['Noble BE19'],
  'mahogany-tower': ['Mahogany Tower'],
  'noble-geo':      ['Noble Geo'],
  'park24':         ['Park 24'],
}

// Contact gate (criteria: "board rows must be reachable"): a unit qualifies
// only when the team has confirmed a contact — unitSource.bestContact.phone in
// the PRIVATE `internal` dataset. Fetched once; the phone itself never leaves
// the build (only refCodes are used).
console.log('Fetching contact-verified refCodes from internal dataset…')
let CONTACTABLE = new Set()
// Real floor number per unit. floorZone buckets 24 storeys into LOW/MID/HIGH,
// which made genuinely different units read identically on the board ("1 นอน ·
// 56 ตรม. · ชั้นกลาง" was three units on floors 17, 21 and 22). The floor number
// itself is public on every source listing — only the contact phone is private.
let FLOOR_BY_REF = new Map()
try {
  const refs = await sanityFetch(
    `*[_type == "unitSource" && defined(bestContact.phone) && bestContact.phone != ""].refCode`,
    'internal'
  )
  CONTACTABLE = new Set(refs ?? [])
  const floors = await sanityFetch(
    `*[_type == "unitSource" && defined(floorActual)]{ refCode, floorActual }`,
    'internal'
  )
  FLOOR_BY_REF = new Map((floors ?? []).map(f => [f.refCode, f.floorActual]))
  console.log(`  ${CONTACTABLE.size} unit(s) have a verified contact · ${FLOOR_BY_REF.size} with a real floor`)
} catch (e) {
  console.warn(`  ⚠  internal dataset unreachable (${e.message}) — boards fall back to manual rows`)
}

/* ค่าคงที่ของตลาด (floor premium · yield · ราคาอ้างอิง) ต้องคิดจากทุกตึกพร้อมกัน
   ค่ากลางที่ตึกซึ่งข้อมูลไม่พอจะยืมไปใช้ มาจากตึกอื่นทั้งหมด — ดึงรอบเดียวตรงนี้
   แล้วใช้ตัวเดียวกับที่หน้า Building Analysis พิมพ์ออกมา (market-model.mjs) */
console.log('Building market model (floor premium · yield) from all buildings…')
const ALL_PROFILES = await sanityFetch(
  `*[_type == "unitProfile" && status in ["candidate","verified","published"] && defined(pricePerSqm)]{
     refCode, intent, projectName, pricePerSqm }`)
const MARKET = marketModel((ALL_PROFILES ?? []).map(p => ({
  building: p.projectName, intent: p.intent, psqm: p.pricePerSqm,
  floor: FLOOR_BY_REF.get(p.refCode) ?? null,
})))
console.log(`  floor premium กลาง ${Math.round(MARKET.fpSale).toLocaleString()} ฿/ตร.ม./ชั้น · yield กลาง ${(MARKET.avgYield * 100).toFixed(2)}%`)

// Per-project player template. Most projects use the proven vertical-signage.html.
// The kiosk player is vertical-signage.html (formerly mockup-v7.html — renamed once it
// became the player for every project; the previous player is preserved in git history).
// PLAYER_BY_CODE is a per-project override map — empty means everyone gets the default.
const PLAYER_BY_CODE = { }
const DEFAULT_PLAYER = 'vertical-signage.html'

// Playlist projections. vertical-signage uses the minimal set; mockup-v7 needs the
// rich set (provider object/logo, eyebrow, sub, CTAs, menu/order items). The rich
// projection is copied verbatim from mockup-v7's own runtime query so the baked
// data matches exactly what that player reads. Keyed per project so switching only
// 39-by-sansiri to mockup-v7 doesn't change every other project's baked output.
const PLAYLIST_PROJ_MIN = `
        "kind":            media->kind,
        "title":           media->title,
        "mediaType":       select(
                             defined(media->type)                 => media->type,
                             defined(media->videoFile.asset)      => "video",
                             count(media->imageFiles) > 0         => "image",
                             defined(media->imageFile.asset)      => "image",
                             defined(media->posterImage.asset)    => "image"
                           ),
        "url":             select(
                             media->type == "image" => coalesce(media->imageFiles[0].asset->url, media->imageFile.asset->url, media->posterImage.asset->url),
                             media->type == "video" => media->videoFile.asset->url,
                             media->type == "web"   => media->webUrl,
                             coalesce(media->videoFile.asset->url, media->imageFiles[0].asset->url, media->imageFile.asset->url, media->posterImage.asset->url)
                           ),
        "images":          media->imageFiles[].asset->url,
        "expiresAt":       media->expiresAt,
        "category":        coalesce(touchExploreCategory, media->offer->category),
        "defaultDuration": media->defaultImageDuration,
        "displayDuration": displayDuration,
        "offerSlug":       media->offer->slug.current,
        "providerSlug":    coalesce(touchExploreDefaultProvider->slug.current, media->offer->provider->slug.current),
        touchExploreCategory,
        notes`
const PLAYLIST_PROJ_V7 = `
        "kind":               media->kind,
        "title":              media->title,
        // English headline. media.altText is the media's OWN English title (the
        // Thai side reads media.title, not the offer's) — so it wins, with the
        // offer's English title as the fallback for promos that never set it.
        // Notices carry no offer at all: without altText an English viewer used
        // to read the Thai announcement on the slide, in the tap popup and on
        // the QR handoff step.
        "title_en":           coalesce(media->altText, media->offer->title_en),
        "eyebrow":            media->offer->category,
        "sub_th":             media->offer->description_th,
        "sub_en":             media->offer->description_en,
        "mediaType":          select(
                                defined(media->type)              => media->type,
                                defined(media->videoFile.asset)   => "video",
                                defined(media->imageFile.asset)   => "image",
                                defined(media->posterImage.asset) => "image"
                              ),
        "url":                select(
                                media->type == "image" => coalesce(media->imageFiles[0].asset->url, media->imageFile.asset->url, media->posterImage.asset->url),
                                media->type == "video" => media->videoFile.asset->url,
                                media->type == "web"   => media->webUrl,
                                coalesce(media->videoFile.asset->url, media->imageFile.asset->url, media->imageFiles[0].asset->url, media->posterImage.asset->url)
                              ),
        "images":             media->imageFiles[].asset->url,
        "expiresAt":          media->expiresAt,
        "poster":             media->posterImage.asset->url,
        "videoShowCta":       media->videoShowCta,
        "videoEndCard":       media->videoEndCard,
        "endCardImg":         media->endCardImage.asset->url,
        "offerImg":           coalesce(media->offer->primaryImage.asset->url, media->offer->images[0].asset->url, media->offer->listingImages[0].asset->url),
        "category":           coalesce(touchExploreCategory, media->offer->category),
        "defaultDuration":    media->defaultImageDuration,
        "defaultImageDuration": media->defaultImageDuration,
        "imageDurationOverride": displayDuration,
        "displayDuration":    displayDuration,
        "offerSlug":          media->offer->slug.current,
        // Usage counters key on this — see the twin comment in vertical-signage.html.
        // Both projections must carry it or a baked screen and a live one report
        // the same slide under different ids.
        "mediaId":            media->_id,
        "providerSlug":       coalesce(touchExploreDefaultProvider->slug.current, media->offer->provider->slug.current),
        "providerImage":      coalesce(media->offer->provider->coverImage.asset->url, media->offer->provider->logo.asset->url),
        "listing":            media->offer->listing,
        "price":              media->offer->price,
        "availability":       media->offer->availability,
        "listingImages":      media->offer->listingImages[].asset->url,
        "ctaType":            media->offer->ctaType,
        "ctaLabel":           media->offer->ctaLabel,
        "ctaURL":             media->offer->ctaURL,
        "ctaType2":           media->offer->ctaType2,
        "ctaLabel2":          media->offer->ctaLabel2,
        "ctaURL2":            media->offer->ctaURL2,
        "deepLink":           media->offer->deepLink,
        "displayMode":        media->offer->displayMode,
        "validFrom":          media->offer->validFrom,
        "validTo":            media->offer->validTo,
        "menuItems":          media->offer->menuItems[]{ name_th, name_en, price, "image": image.asset->url },
        "orderItems":         media->offer->orderItems[]{ name_th, name_en, price, priceTHB, "key": coalesce(refCode, _key), maxQty, sold, "image": image.asset->url },
        "fulfillment":        media->offer->fulfillment,
        "payOnline":          media->offer->payOnline,
        "booking":            media->offer->booking,
        "eventInfo":          media->offer->eventInfo,
        "provider":           media->offer->provider->{
                                "slug": slug.current, name_th, name_en, displayName, category,
                                locationText, mapUrl, phone, lineId, website, openingHours, amenities,
                                description_th, description_en, defaultHandoffType, unitRef,
                                booking, openDays, openTime, closeTime,
                                "logo": logo.asset->url, "coverImage": coverImage.asset->url,
                                "offers": *[_type=="offer" && provider._ref == ^._id && status == true
                                    && (scope == "global" || !defined(scope) || "__PID__" in projects[]._ref)][0...8]{
                                    "slug": slug.current, title_th, title_en, price,
                                    "img": coalesce(primaryImage.asset->url, images[0].asset->url, listingImages[0].asset->url)
                                }
                              },
        touchExploreCategory,
        notes`

// ── 2b. Fetch global category config once (singleton, shared by all projects) ─
console.log('Fetching global category config…')
const globalCategoryConfig = await sanityFetch(`
  *[_id == "categoryConfig-global"][0]{
    categories[]{
      id,
      label,
      ctaItem,
      defaultSubcategoryId,
      subcategories[]{ id, label }
    }
  }
`)

// ── 3. Build a deploy folder for each project ─────────────────────────────────
for (const project of projects) {
  const { _id: projectId, code, title } = project
  const tplFile = PLAYER_BY_CODE[code] || DEFAULT_PLAYER
  const templateHtml = readFileSync(join(__dirname, tplFile), 'utf8')
  // __PID__ = โปรเจ็กต์ที่กำลัง build → กรอง "offers อื่นของร้านนี้" (nested provider->offers)
  // ให้เหลือเฉพาะ scope global หรือที่ผูกกับโปรเจ็กต์นี้ (เดิมดึงทุกโครงการ → offer 39bs หลุดไป Mahogany)
  const playlistProjection = PLAYLIST_PROJ_V7.replace(/__PID__/g, projectId)   // single player → always the rich projection
  console.log(`\nBuilding [${code}] ${title}…  (player: ${tplFile})`)

  // Fetch all project-scoped data in parallel
  const unitProjectNames = UNIT_PROJECT_NAMES[code] ?? [title, `The ${title}`]
  const [playlist, rawProviders, notices, unitBoards, unitProfiles] = await Promise.all([

    // ── Playlist ─────────────────────────────────────────────────────────────
    // Active slots whose slot schedule passes AND media is active promo scoped to project.
    // Slot schedule (startAt/endAt) lives only on playlistItem — no media-level schedule.
    sanityFetch(`
      *[
        _type == "playlistItem" &&
        project._ref == "${projectId}" &&
        enabled == true &&
        (!defined(startAt) || startAt <= now()) &&
        (!defined(endAt)   || endAt   >  now()) &&
        media->isActive == true &&
        media->kind in ["promo", "notice"] &&
        (media->kind != "notice" || !defined(media->expiresAt) || media->expiresAt > now()) &&
        (media->scope == "global" || "${projectId}" in media->projects[]._ref)
      ] | order(order asc){ ${playlistProjection} }
    `),

    // ── Providers (global; scoped via their offers) ───────────────────────────
    // Fetch providers that have at least one active offer available to this project.
    // Offers are included nested per provider for the kiosk detail view.
    sanityFetch(`
      *[
        _type == "provider" &&
        status == true
      ]{
        "slug":          slug.current,
        name_th,
        name_en,
        providerType,
        displayName,
        locationText,
        // mapUrl + amenities are read by the detail popup opened from a category
        // card (amenities render as the tag row of the "ดูร้าน" body). The
        // playlist projection above already carries them; this one didn't, so
        // the same shop showed tags from a slide tap and none from a menu tap.
        mapUrl,
        amenities,
        phone,
        lineId,
        website,
        openingHours,
        booking, openDays, openTime, closeTime,
        "logo":          logo.asset->url,
        "coverImage":    coverImage.asset->url,
        description_th,
        description_en,
        defaultHandoffType,
        unitRef,
        "offers": *[
          _type == "offer" &&
          provider._ref == ^._id &&
          status == true &&
          (scope == "global" || !defined(scope) || "${projectId}" in projects[]._ref)
        ]{
          "slug":         slug.current,
          title_th,
          title_en,
          category,
          subCategories,
          description_th,
          description_en,
          "primaryImage": coalesce(primaryImage.asset->url, images[0].asset->url),
          "images":       images[].asset->url,
          ctaType,
          ctaURL,
          deepLink,
          availability,
          price,
          validFrom,
          validTo,
          booking,
          // The category browser opens the SAME popup as a slide CTA, so it needs
          // the same item lists — without these the menu/room list rendered as the
          // "เพิ่มสินค้า…" placeholder when entered from the category screen.
          menuItems[]{ name_th, name_en, price, "image": image.asset->url },
          orderItems[]{ name_th, name_en, price, "key": coalesce(refCode, _key), maxQty, sold, "image": image.asset->url },
          fulfillment,
          eventInfo
        }
      }
    `),

    // ── Notices (building updates — media with kind="notice") ─────────────────
    // Replaces the old buildingUpdate schema.
    // Notice content lives on the linked offer (title_th, description_th, etc.).
    sanityFetch(`
      *[
        _type == "media" &&
        kind == "notice" &&
        isActive == true &&
        "${projectId}" in projects[]._ref &&
        (!defined(expiresAt) || expiresAt > now())
      ] | order(_createdAt desc){
        title,
        // notices have no offer → altText is the ONLY English title they own
        "title_en": altText,
        tags,
        "subCategoryIds": subCategories,
        "url": coalesce(videoFile.asset->url, imageFile.asset->url),
        "posterImage": posterImage.asset->url,
        "offer": offer->{
          "slug": slug.current,
          title_th,
          title_en,
          category,
          subCategories,
          description_th
        }
      }
    `),

    // ── Unit Boards (split-flap price board — board.html) ─────────────────────
    // One doc per mode (rent/sale). perspective=published keeps drafts off air.
    sanityFetch(`
      *[
        _type == "unitBoard" &&
        project._ref == "${projectId}" &&
        isActive == true
      ] | order(_updatedAt desc){
        mode,
        "dataAsOf": _updatedAt,
        policy{ quota, superQ, bestQ, hotQ, negoQ, investQ, studioMin, b1Min, b2Min, b3Min, b4Min },
        "lineup": lineup[]->{ ${PROFILE_PROJECTION} },
        rows[]{ unitType, sizeSqm, floor, price, updatedAt, remarks[]{ text, tone } }
      }
    `),

    // ── Unit Profiles (Market Intelligence) — auto-selected board rows ────────
    // Airing gate is the `status` FIELD (docs are API-created as published with
    // status "candidate"): only team-reviewed "published" units qualify, and
    // only if fresh (checked within 30 days). Contact gate applied below.
    sanityFetch(`
      *[
        _type == "unitProfile" &&
        projectName in ${JSON.stringify(unitProjectNames)} &&
        status == "published" &&
        defined(lastCheckedAt) &&
        lastCheckedAt >= "${new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)}"
      ]{ ${PROFILE_PROJECTION} }
    `),

  ])

  // Group providers by their OFFERS' categories (offer.category is the single source
  // of truth — providers no longer carry their own category). A provider with offers
  // in several categories appears in each bucket, carrying only that bucket's offers.
  // Baked shape stays { category: [providers] } so the kiosk needs no changes.
  const providers = {}
  ;(rawProviders ?? []).forEach(p => {
    const seen = new Set()
    const offers = (p.offers ?? []).filter(o => {
      if (!o.slug || seen.has(o.slug)) return false
      seen.add(o.slug)
      return true
    })
    const byCat = {}
    offers.forEach(o => {
      if (!o.category) return
      if (!byCat[o.category]) byCat[o.category] = []
      byCat[o.category].push(o)
    })
    Object.keys(byCat).forEach(cat => {
      if (!providers[cat]) providers[cat] = []
      providers[cat].push({ ...p, offers: byCat[cat] })
    })
  })

  // GPU-envelope guardrail (CLAUDE.md "Kiosk GPU envelope"): playlist size is a
  // hardware budget, not just a content decision. The fleet broke fleet-wide at
  // 22 slides while every slot still composited (4805dcc); the player is gated
  // now, but each slide still costs decoded-image memory on 1080p Mali boxes.
  // 2026-08-15 real-box measurement (SD2603 8GB frozen-WebView109 at 24 slides;
  // the-room 4GB/4K at 21 slides): web-board slides cost little and don't
  // accumulate — so the budget counts IMAGE/VIDEO slides only, with a 30-slot
  // absolute backstop covering everything (we haven't measured past ~30).
  // Warn loudly — don't fail: airing content beats blocking a deploy at night,
  // and the warning names the box class so the reader knows WHY it matters.
  const SLIDE_BUDGET  = 24   // image + video slides (decoded-pixel eaters)
  const SLIDE_ABS_MAX = 30   // every slot incl. web boards
  const heavySlides = (playlist ?? []).filter(s => s.type !== 'web').length
  const totalSlides = playlist?.length ?? 0
  if (heavySlides > SLIDE_BUDGET || totalSlides > SLIDE_ABS_MAX) {
    console.warn(
      `\n  ⚠⚠ [${code}] playlist has ${heavySlides} image/video slides (${totalSlides} total) — over the ${SLIDE_BUDGET} image/video (or ${SLIDE_ABS_MAX} total) GPU budget` +
      `\n     ZC-H358S boxes half-paint images when decoded-image memory runs out.` +
      `\n     Trim the lineup or verify on a REAL box (beacon imgFails / up-resets) before airing.\n`)
  }

  // Assemble the baked data object
  const baked = {
    projectCode:    code,
    projectTitle:   title,
    playlist:       playlist       ?? [],
    providers,
    notices:        notices             ?? [],   // replaces 'updates' — kiosk HTML needs update
    categoryConfig: globalCategoryConfig ?? null,
  }
  // Content revision hash — deterministic. Identical resolved content → identical
  // hash → identical index.html → no git diff → that project's Netlify site is NOT
  // rebuilt. Replaces the old run-time `builtAt` timestamp, which made every build
  // differ and forced ALL projects to redeploy on any single Sanity change.
  baked.rev = createHash('sha1').update(JSON.stringify(baked)).digest('hex').slice(0, 8)

  // Inject baked data as an inline <script> just before </head>.
  // Also inject the real Sanity token (which is intentionally left blank in the template).
  const injectedHtml = templateHtml
    .replace(
      "SANITY_TOKEN:      '',",
      `SANITY_TOKEN:      '${SANITY_TOKEN}',`
    )
    .replace(
      '</head>',
      `<script>/* baked by build.mjs — rev ${baked.rev} */\nwindow.__BAKED__ = ${JSON.stringify(baked)};\n</script>\n</head>`
    )

  // Write ../{code}/ — each project gets its own sibling directory (and its own GitHub repo).
  const outDir = join(__dirname, '..', code)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), injectedHtml, 'utf8')
  writeFileSync(join(outDir, 'sw.js'),     swSource,     'utf8')

  // Category icons are referenced by the kiosk player (icons/*.svg) —
  // copy the folder for those projects so they aren't 404. Skip for others so
  // they don't get a spurious icons/ diff that redeploys them.
  const iconsDir = join(__dirname, 'icons')
  if (existsSync(iconsDir)) cpSync(iconsDir, join(outDir, 'icons'), { recursive: true })

  // ── Unit boards → board/{mode}/index.html ─────────────────────────────────
  // Newest-first ordering above means: if two boards share a mode, the most
  // recently updated one wins (and we warn).
  const bakedBoardModes = new Set()
  for (const b of unitBoards ?? []) {
    const mode = b.mode === 'sale' ? 'sale' : 'rent'
    if (bakedBoardModes.has(mode)) {
      console.warn(`  ⚠  duplicate ${mode} unitBoard for [${code}] — keeping the newest, skipping the rest`)
      continue
    }
    bakedBoardModes.add(mode)

    // Rows, in order of authority:
    //   1. lineup — the team-reviewed pick list published on the unitBoard doc
    //      (engine wrote it, humans adjusted, publish = approval; used verbatim
    //      minus expired/taken safety).
    //   2. auto  — policy-driven engine pick from published + contactable
    //      profiles (until a lineup exists).
    //   3. manual rows — legacy hand-typed rows.
    /* 'taken' ไม่ถูกกรองทิ้งอีกแล้ว — ห้องที่ปิดดีลต้องขึ้นจอเพื่อบอกว่าที่นี่มีดีลเกิดจริง
       แต่เกิน CLOSED_DAYS วันแล้วต้องหลุดเอง ไม่งั้นบอร์ดกลายเป็นสุสานดีลเก่า */
    /* ตัดห้องที่ทีม hide ออกจาก lineup ด้วย — เครื่องมือ (โหมดเลือกเอง) แสดงบอร์ด = lineup ลบ
       ห้อง hide · จอต้องตรงกัน ไม่งั้นลบในเครื่องมือแล้วยังโผล่บนจอ (พบ 2026-08-10) */
    const lineup = (b.lineup ?? []).filter(p => p && p.status !== 'expired' && !closedTooLong(p) && !p.hideFromBoard)
    const contactable = (unitProfiles ?? []).filter(p => p.intent === mode && CONTACTABLE.has(p.refCode))
    const auto = selectWithPolicy(contactable, mode, b.policy ?? {})
    const source = lineup.length ? 'lineup' : auto.rows.length ? 'auto' : 'manual'
    /* ความคุ้มเทียบ "ราคาที่ควรเป็นของชั้นนั้น" ไม่ใช่เทียบเพื่อนร่วมชั้น — ชั้นที่มีห้องเดียว
       เคยคำนวณไม่ได้เลย และเปอร์เซ็นต์จากคนละชั้นเอามาแข่งกันไม่ได้เพราะฐานคนละตัว */
    const mm = unitProjectNames.map(n => MARKET.byBuilding[n]).find(Boolean)
    const valueOf = p => {
      if (!mm || p.pricePerSqm == null) return null
      const f = FLOOR_BY_REF.get(p.refCode)
      const ref = mode === 'rent' ? mm.rentRef : mm.saleRef
      const rf  = mode === 'rent' ? mm.refFloorRent : mm.refFloorSale
      const fp  = mode === 'rent' ? mm.fpRentOwn : mm.fpSale
      const exp = expectedPsqm(ref, fp, rf, f)
      const v = valueVsExpected(p.pricePerSqm, exp)
      return v == null ? null : Math.round(v * 100)
    }
    const withFloor = p => ({ ...profileToRow({ ...p, floorActual: FLOOR_BY_REF.get(p.refCode) }), valuePct: valueOf(p) })
    const rows = source === 'lineup' ? lineup.map(withFloor)
      : source === 'auto' ? auto.rows.map(withFloor)
      : (b.rows ?? []).map(r => ({
          type:    r.unitType,
          sqm:     r.sizeSqm,
          floor:   r.floor,
          updated: r.updatedAt,
          price:   r.price,
          remarks: (r.remarks ?? []).map(m => ({ text: m.text, tone: m.tone ?? 'white' })),
        }))
    console.log(`  board[${mode}]: ${source} (${rows.length} rows)`)
    if (source === 'auto') auto.warnings.forEach(w => console.log(`    ⚠ ${w}`))

    const boardData = {
      project:  title,
      mode,
      dataAsOf: (source === 'manual'
        ? (b.dataAsOf ?? '').slice(0, 10)
        : (source === 'lineup' ? lineup : auto.rows).map(p => p.lastCheckedAt).filter(Boolean).sort().at(-1)),
      rows,
    }
    // Same deterministic-rev idea as the player bake: identical content →
    // identical file → no git diff → no redeploy.
    boardData.rev = createHash('sha1').update(JSON.stringify(boardData)).digest('hex').slice(0, 8)
    const boardHtml = boardTemplate.replace(
      '</head>',
      `<script>/* baked by build.mjs — rev ${boardData.rev} */\nwindow.__BOARD__ = ${JSON.stringify(boardData)};\n</script>\n</head>`
    )
    const boardDir = join(outDir, 'board', mode)
    mkdirSync(boardDir, { recursive: true })
    writeFileSync(join(boardDir, 'index.html'), boardHtml, 'utf8')

    const cardsHtml = cardsTemplate.replace(
      '</head>',
      `<script>/* baked by build.mjs — rev ${boardData.rev} */\nwindow.__BOARD__ = ${JSON.stringify(boardData)};\n</script>\n</head>`
    )
    const cardsDir = join(outDir, 'board-cards', mode)
    mkdirSync(cardsDir, { recursive: true })
    writeFileSync(join(cardsDir, 'index.html'), cardsHtml, 'utf8')

    /* หน้าแยกตามชนิดห้อง — สไลด์ละชนิด คนที่หา 1 นอนไม่ต้องรอดู 3 นอนผ่านไป
       ชนิดที่มีไม่ถึง SEG_MIN ห้องไม่ได้หน้าของตัวเอง เพราะสไลด์หนึ่งใบกินเวลา
       ออกอากาศเท่ากันหมดไม่ว่าจะมีการ์ด 1 ใบหรือ 7 ใบ — 28 วินาทีเพื่อโชว์ห้องเดียว
       คือการเบียดเวลาของคอนเทนต์ที่ผู้ประกอบการจ่ายเงินซื้อ */
    const bySeg = {}
    for (const r of rows) (bySeg[r.type] ??= []).push(r)
    const segsMade = []
    for (const [seg, segRows] of Object.entries(bySeg)) {
      if (segRows.length < SEG_MIN) continue
      const segData = { ...boardData, rows: segRows, segment: seg }
      segData.rev = createHash('sha1').update(JSON.stringify(segData)).digest('hex').slice(0, 8)
      const slug = seg.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '')
      const dir = join(outDir, 'board-cards', mode, slug)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'index.html'), cardsTemplate.replace('</head>',
        `<script>/* baked by build.mjs — rev ${segData.rev} */\nwindow.__BOARD__ = ${JSON.stringify(segData)};\n</script>\n</head>`), 'utf8')
      segsMade.push(`${slug}:${segRows.length}`)
    }
    console.log(`  board-cards[${mode}]: รวม ${rows.length} · แยกชนิด ${segsMade.join(' ') || '— (ไม่มีชนิดไหนถึง ' + SEG_MIN + ' ห้อง)'}`)
  }

  // _headers: Netlify reads this from the publish directory unconditionally.
  // More reliable than netlify.toml when the site uses a repo subdirectory as publish dir.
  writeFileSync(
    join(outDir, '_headers'),
    `/index.html\n  Cache-Control: no-cache, no-store, must-revalidate\n  Pragma: no-cache\n  Expires: 0\n` +
    `/board/*\n  Cache-Control: no-cache, no-store, must-revalidate\n  Pragma: no-cache\n  Expires: 0\n` +
    `/board-cards/*\n  Cache-Control: no-cache, no-store, must-revalidate\n  Pragma: no-cache\n  Expires: 0\n`,
    'utf8'
  )

  writeFileSync(
    join(outDir, 'netlify.toml'),
    // Cache-Control headers for index.html: force Yodeck / CDN to never serve a stale copy.
    // The SPA redirect rule catches all paths and serves index.html.
    `[build]\n  publish = "."\n\n` +
    `[[headers]]\n  for = "/index.html"\n  [headers.values]\n` +
    `    Cache-Control = "no-cache, no-store, must-revalidate"\n` +
    `    Pragma        = "no-cache"\n` +
    `    Expires       = "0"\n\n` +
    `[[headers]]\n  for = "/board/*"\n  [headers.values]\n` +
    `    Cache-Control = "no-cache, no-store, must-revalidate"\n` +
    `    Pragma        = "no-cache"\n` +
    `    Expires       = "0"\n\n` +
    `[[headers]]\n  for = "/board-cards/*"\n  [headers.values]\n` +
    `    Cache-Control = "no-cache, no-store, must-revalidate"\n` +
    `    Pragma        = "no-cache"\n` +
    `    Expires       = "0"\n\n` +
    `[[redirects]]\n  from = "/*"\n  to   = "/index.html"\n  status = 200\n`,
    'utf8'
  )

  console.log(
    `  ✓  ../${code}/index.html` +
    `  (playlist: ${playlist?.length ?? 0}, providers: ${rawProviders?.length ?? 0}, notices: ${notices?.length ?? 0}, boards: ${[...bakedBoardModes].join('+') || 'none'})`
  )
}

console.log('\nBuild complete.')
console.log('\nNext steps:')
console.log('  • Push each deploy/{code}/ folder to its own GitHub repo (or branch)')
console.log('  • Link each Netlify site to that repo / folder')
console.log('  • Re-run "node build.mjs" after updating content in Sanity')
