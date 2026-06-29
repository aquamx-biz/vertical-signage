# /offer Format Spec — single source of truth

**Rule: do NOT invent styles. Copy from `aquamx-landing/offer/index.html`. When in doubt, open that file and match it exactly.** This file is the contract; `mockup-offer-app.html` and any offer redesign must follow it.

## Design tokens (verbatim from /offer :root)
```
--navy:#0E3361; --navy-deep:#072147;
--orange:#C9864C; --orange-strong:#A36738; --orange-soft:#F6E5D0;
--cream:#F4F6FA;   /* COOL light bg — never warm cream */
--ink:#0B1B33; --muted:#5C6B82; --white:#fff;
--line:#E6E9F1; --ink-40:#8B98AE; --green:#2E9E5B;
```
Accent token is **`--orange`** (not `--bronze`). Page bg is **cool `#F4F6FA`**, lines **`#E6E9F1`**.

## Fonts
Load: `Nunito:400;600;700;800` + `IBM Plex Sans Thai:400;500;600;700` + `Mitr:500;600` + `Anton` + `JetBrains Mono`.
- Body / UI / labels / buttons: `'IBM Plex Sans Thai','Nunito',system-ui,sans-serif`
- Preview title (`.tt-title`): `'Mitr',sans-serif` weight 600
- Menu-preview title (`.pm-title`): `'Anton',sans-serif`
- Mono meta (`.pm-card-meta`): `'JetBrains Mono'`

## Alignment — THE recurring mistake
**Headings and content are LEFT-aligned, flush to the gutter. NEVER center them.** (`text-align:center` in /offer is only for the preview label, totem internals, and a few chips.) Section heads sit flush-left with the form gutter.

## Heading style (match /offer .sec-main / .sec-h)
- Step/section title = `.sec-main .tx`: IBM Plex/Nunito **800**, **19px**, `--navy`, left-aligned, with optional circular number badge (orange gradient).
- Eyebrow/section label = `.sec-h`: IBM Plex/Nunito 800, 13px, UPPERCASE, `--orange-strong`, letter-spacing .05em, bottom border `--line`.
- `.lede`: 16px `--muted`, max-width 680, left.

## Preview components — copy, don't rebuild
- **Media** = `.tt-*` totem (offer/index.html ~209–267): `.totem`(width:230) → `.tt-screen`(9/16) [topbar · stage · ] + `.tt-base` stand. Stage has `.tt-bg`(ken-burns) `.tt-grad` `.tt-menu` `.tt-content`(eyebrow→title→price→sub) `.tt-dock`(CTA) and `.tt-bottombar` marquee.
- **Catalog/Menu** = `.pm-*` screen (offer/index.html ~214–229): `.pm-head`(back · title · lang) + `.pm-body` → `.pm-grid` of `.pm-card`(img · name · meta).
- **Thumbnails / scaled previews**: the preview text is absolute + fixed-px, so it can NOT reflow at a smaller width. Scale the WHOLE totem with `transform:scale()` inside a sized, `overflow:hidden` wrapper — never just shrink `width`.
- **CTA continuity**: the CTA reads as part of the content block (eyebrow → title → sub → CTA), not pinned far below with a gap.
- **Catalog sits in the same signage totem as Media** (user override of /offer, where `.pm-screen` is standalone): wrap `.pm-screen` in `.totem` with the `.tt-base` stand + top-only rounded screen + bottom marquee, so both ad types read as the same device.

## Buttons / controls
- Primary: `--navy` bg, white, radius 12, weight 800 (`.btn-submit`).
- Selected card/chip: border `--orange`, bg `#fffdf8`, soft orange shadow (`.type-seg .ts.on`).
- Inputs: 1.5px `--line` border, focus border `--orange`.

## Recurring mistakes to avoid (do not repeat)
1. Centering text/headings — they must be LEFT-flush.
2. Warm cream `#FAF6ED` / `--bronze` naming — use cool `#F4F6FA` / `--orange`.
3. Rebuilding `.tt-*`/`.pm-*` by hand — copy from /offer.
4. Shrinking preview by `width` (text overlaps) — use `transform:scale()`.
5. CTA pinned far from the description — keep it continuous.
6. Putting `*/` inside a CSS comment (closes it early, kills the next rule).
