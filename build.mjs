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
async function sanityFetch(query) {
  const url =
    `https://${SANITY_PROJECT_ID}.api.sanity.io` +
    `/v${SANITY_API_VER}/data/query/${SANITY_DATASET}` +
    `?query=${encodeURIComponent(query)}`
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
        "url":             coalesce(media->videoFile.asset->url, media->imageFiles[0].asset->url, media->imageFile.asset->url, media->posterImage.asset->url),
        "images":          media->imageFiles[].asset->url,
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
        "title_en":           media->offer->title_en,
        "eyebrow":            media->offer->category,
        "sub_th":             media->offer->shortDesc_th,
        "sub_en":             media->offer->shortDesc_en,
        "mediaType":          select(
                                defined(media->type)              => media->type,
                                defined(media->videoFile.asset)   => "video",
                                defined(media->imageFile.asset)   => "image",
                                defined(media->posterImage.asset) => "image"
                              ),
        "url":                coalesce(media->videoFile.asset->url, media->imageFile.asset->url, media->imageFiles[0].asset->url, media->posterImage.asset->url),
        "images":             media->imageFiles[].asset->url,
        "poster":             media->posterImage.asset->url,
        "category":           coalesce(touchExploreCategory, media->offer->category),
        "defaultDuration":    media->defaultImageDuration,
        "defaultImageDuration": media->defaultImageDuration,
        "imageDurationOverride": displayDuration,
        "displayDuration":    displayDuration,
        "offerSlug":          media->offer->slug.current,
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
        "orderItems":         media->offer->orderItems[]{ name_th, name_en, price, "image": image.asset->url },
        "fulfillment":        media->offer->fulfillment,
        "booking":            media->offer->booking,
        "eventInfo":          media->offer->eventInfo,
        "provider":           media->offer->provider->{
                                "slug": slug.current, name_th, name_en, displayName, category,
                                locationText, mapUrl, phone, lineId, website, openingHours, amenities,
                                description_th, description_en, defaultHandoffType, unitRef,
                                "logo": logo.asset->url, "coverImage": coverImage.asset->url,
                                "offers": *[_type=="offer" && provider._ref == ^._id && status == true][0...8]{
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
  const playlistProjection = PLAYLIST_PROJ_V7   // single player → always the rich projection
  console.log(`\nBuilding [${code}] ${title}…  (player: ${tplFile})`)

  // Fetch all project-scoped data in parallel
  const [playlist, rawProviders, notices] = await Promise.all([

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
        category,
        providerType,
        displayName,
        locationText,
        phone,
        lineId,
        website,
        openingHours,
        "logo":          logo.asset->url,
        "coverImage":    coverImage.asset->url,
        "thumbnail":     thumbnail.asset->url,
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
          shortDesc_th,
          shortDesc_en,
          "primaryImage": primaryImage.asset->url,
          "images":       images[].asset->url,
          ctaType,
          ctaURL,
          deepLink,
          availability,
          price,
          validFrom,
          validTo
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
          shortDesc_th,
          description_th
        }
      }
    `),

  ])

  // Group providers by category (mirrors the kiosk's MOCK_PROVIDERS shape)
  // Deduplicate offers by slug within each provider
  const providers = {}
  ;(rawProviders ?? []).forEach(p => {
    const seen = new Set()
    p.offers = (p.offers ?? []).filter(o => {
      if (seen.has(o.slug)) return false
      seen.add(o.slug)
      return true
    })
    if (!providers[p.category]) providers[p.category] = []
    providers[p.category].push(p)
  })

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

  // _headers: Netlify reads this from the publish directory unconditionally.
  // More reliable than netlify.toml when the site uses a repo subdirectory as publish dir.
  writeFileSync(
    join(outDir, '_headers'),
    `/index.html\n  Cache-Control: no-cache, no-store, must-revalidate\n  Pragma: no-cache\n  Expires: 0\n`,
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
    `[[redirects]]\n  from = "/*"\n  to   = "/index.html"\n  status = 200\n`,
    'utf8'
  )

  console.log(
    `  ✓  ../${code}/index.html` +
    `  (playlist: ${playlist?.length ?? 0}, providers: ${rawProviders?.length ?? 0}, notices: ${notices?.length ?? 0})`
  )
}

console.log('\nBuild complete.')
console.log('\nNext steps:')
console.log('  • Push each deploy/{code}/ folder to its own GitHub repo (or branch)')
console.log('  • Link each Netlify site to that repo / folder')
console.log('  • Re-run "node build.mjs" after updating content in Sanity')
