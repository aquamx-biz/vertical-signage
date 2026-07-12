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

## Surfaces

- `vertical-signage.html` — the live 9:16 kiosk player (dark stage theme). `mockup-v*.html` are design explorations of it.
- `offer/`, `provider/` — offer/provider landing + detail pages.
- `form-submit*.html`, `form-offer-submit.html`, `form-provider-submit.html` — business submission flows (treat as `product` register).
- `pricing-apple.html`, `infographic-*.html` — the sell: pricing and customer-explainer pages (`brand` register).
- `sanity-studio/` — the CMS that drives all baked content.
- `build.mjs` — fetches active projects from Sanity, injects `window.__BAKED__`, writes `deploy/{code}/index.html`.
