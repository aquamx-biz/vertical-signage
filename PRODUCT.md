# Product

## Register

brand

> **Register split is real — set per task.** Default is `brand`, because the two highest-value surfaces are both ones where design *is* the product:
> - **Showcase** — the 9:16 kiosk player (`vertical-signage.html`, `offer/`, `provider/`). Viewers don't complete a workflow; they're attracted. A striking lobby screen is the live demo that sells advertisers.
> - **Sell** — infographics (`infographic-*.html`), `pricing-apple.html`, the offer/provider landing pages. Persuasion and clarity drive the stated business outcome.
>
> Treat these as **product** (design SERVES a task) when working on them: the submission flows (`form-submit*.html`, `form-offer-submit.html`, `form-provider-submit.html`) and the Sanity Studio CMS (`sanity-studio/`). On those, task efficiency and low friction win over expressiveness.

## Users

Three audiences, served by different surfaces:

- **End viewers (primary)** — residents and passersby in a building lobby, glancing at a 43"–55" portrait display from across the room, often in passing. Thai-first, bilingual. They are not "users" in a task sense; they are an audience to be caught. Their experience of the kiosk is the product demo.
- **Businesses / advertisers** — shop and restaurant owners deciding whether to list an offer or buy a signage placement. They read the infographics and pricing, then fill out a submission form. Converting them is the business goal.
- **Property agents / sellers & internal staff** — agents listing property (free to list; AquaMX earns a % of brokerage commission, not ad fees), and staff operating the system through Sanity Studio and the build pipeline.

## Product Purpose

AquaMX runs interactive vertical (9:16) digital signage installed in building lobbies across Thailand. The screens display rotating media, local offers from nearby businesses, property listings, and live context (Bangkok time/weather, world clocks, bilingual news ticker). Businesses pay for offer placements; property listings are free and monetized via brokerage commission.

The strategy is a flywheel: **a beautiful, lively kiosk makes the lobby feel premium → viewers engage → businesses want to be on that screen → advertiser sign-ups.** Success = the screen looks like the nicest thing in the lobby, and the sell surfaces convert that desire into signed advertisers.

## Brand Personality

**Modern, energetic, disciplined.** Three words: *current, lively, premium.*

The screen should feel alive and contemporary — motion-forward, confident color, attention-catching in a passive lobby — but never cluttered or noisy. Energy comes from motion, rhythm, and bronze accents against deep navy, **not** from cramming the surface with content. Apple-like restraint governs the execution: generous whitespace, big clear type, calm structure. Think "the energetic screen with taste," not "the busy ad board."

Voice: bilingual and confident, Thai-first but equally polished in English. Never templated, never salesy-loud.

## Anti-references

- **Generic SaaS / template landing pages** — stock gradients, identical card grids, an eyebrow above every section, hero-metric templates. The sell pages must not look auto-generated.
- **Cluttered ad-screen / mall-directory look** — busy boards crammed with listings, blinking promos, dense grids competing for attention. The kiosk stays calm and premium even when showing many offers.
- **Generic-energetic** — "modern & energetic" must not collapse into bright-gradient-startup. Energy is carried by motion and bronze-on-navy contrast with restraint, not by saturation and noise.

## Design Principles

1. **The screen is the pitch.** Every kiosk decision is also a sales decision — if the lobby display looks premium, advertisers follow. Design the showcase as the product demo it is.
2. **Energy through motion and contrast, calm through space.** Liveliness comes from intentional motion and bronze-against-navy, never from clutter. When in doubt, remove content, not whitespace.
3. **Bilingual parity is non-negotiable.** Thai and English must look equally considered. Thai never renders in a Latin-only font (always an IBM Plex Sans Thai fallback). Layouts survive both languages' line lengths.
4. **Distance-legible by default.** Kiosk type is read from across a room — large, high-contrast, no thin grays. Legibility beats decoration on the player.
5. **One identity across scattered files.** This is many standalone HTML pages; they should still read as one brand. Reuse the committed navy + bronze identity and shared type rather than reinventing per page.

## Accessibility & Inclusion

- **Kiosk distance legibility (priority):** large type, high contrast, no thin gray body text on the player. Must read from across a lobby.
- **Thai + English parity:** correct Thai rendering everywhere (IBM Plex Sans Thai fallback in every font stack), both languages visually equal.
- **WCAG AA on web surfaces:** forms, pricing, and landing pages meet AA contrast (body ≥4.5:1, large text ≥3:1) and support keyboard + touch.
- **Reduced motion:** honor `prefers-reduced-motion` on every animated surface — the energetic motion must have a calm fallback (crossfade or instant).
