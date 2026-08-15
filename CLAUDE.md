# AquaMX Vertical Signage

Single-file HTML/CSS/JS vertical (9:16) digital signage + the customer-facing pages that sell placements on it. Content is authored in Sanity Studio (`sanity-studio/`), baked into static HTML by `build.mjs`, and deployed to Netlify (`deploy/`).

## Design Context

This project has impeccable design context. **Read these before designing or changing any UI:**

- **`PRODUCT.md`** — strategy: register (`brand`, split documented), the three audiences, the screen-as-pitch flywheel, brand personality, anti-references, design principles, accessibility.
- **`DESIGN.md`** — the visual system: navy + bronze "Brass Marquee" identity, two themes (light web + dark kiosk stage), Prompt/Anton/IBM Plex Sans Thai type, components, and the named rules + do's/don'ts.

**Non-negotiables pulled from those files:**
- Bilingual Thai/English parity — every font stack ends in `'IBM Plex Sans Thai'` before a generic fallback. Never `'Nunito',sans-serif` or similar bare Latin stacks.
- Bronze (`#C9864C`) is the single accent, ≤10% of any surface. Navy (`#0E3361`) carries structure.
- Light surfaces and the dark kiosk stage stay cleanly separated (cyan is stage-only, cream is light-only).
- Kiosk type must be distance-legible (large, high-contrast, never thin gray).

Run `/impeccable` (no args) for the next-step menu, or `/impeccable live` for in-browser iteration (already configured in `.impeccable/live/config.json`).

## Kiosk GPU envelope — read before adding slides, layers, or effects

The players run on weak Android boxes (ZC-H358S ≈ 1080p Mali, Chrome 109 WebView),
not desktops. **A change that passes on your desktop proves nothing** — desktop
GPUs have memory to spare; the boxes do not. Four incidents, one lesson each,
all the same physics:

1. **Anything invisible must be OUT of the compositor, not just transparent.**
   `opacity: 0` still composites; `will-change` forces a permanent fullscreen
   layer (~8 MB each). Hide with `visibility: hidden` and grant `will-change`
   only to elements actually animating right now. (Incidents: parked-3D ghosts
   `ed42081` · hidden popup GPU cost `09499e5` · **fleet-wide half-painted
   images when the playlist hit 22 slides** `4805dcc`.)
2. **`backdrop-filter` is banned globally** — rk35xx composites blur as black
   boxes (`50003eb`).
3. **Playlist size is a GPU budget, not a content decision alone.** The fleet
   broke at 22 slides with all slots compositing; the gated player holds 2–3
   live layers, but every slide still costs decoded-image memory. `build.mjs`
   warns above 24 **image/video** slides, with a 30-slot absolute backstop
   over everything — web-board slides are excluded from the 24 because a
   2026-08-15 real-box measurement (SD2603 8GB frozen-WebView at a full
   24-slide rotation; the-room 4GB/4K at 21 slides incl. video) showed they
   cost little and don't accumulate. Take the warning seriously, and never
   raise either number without re-measuring on a real ZC box.
4. **A leaving slide must end at `opacity: 0`**, or its last frame parks in the
   compositor and ghosts through later slides.

Rollouts hit every condo site at once (one rebuild → all repos). If a change
plausibly increases GPU load, check a real box (beacon: `imgFails`, `board`,
sudden `up` resets = WebView crash loops) before calling it done.

## Surfaces

- `vertical-signage.html` — the live 9:16 kiosk player (dark stage theme). `mockup-v*.html` are design explorations of it.
- `offer/`, `provider/` — offer/provider landing + detail pages.
- `form-submit*.html`, `form-offer-submit.html`, `form-provider-submit.html` — business submission flows (treat as `product` register).
- `pricing-apple.html`, `infographic-*.html` — the sell: pricing and customer-explainer pages (`brand` register).
- `sanity-studio/` — the CMS that drives all baked content.
- `build.mjs` — fetches active projects from Sanity, injects `window.__BAKED__`, writes `deploy/{code}/index.html`.
