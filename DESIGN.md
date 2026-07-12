---
name: AquaMX Vertical Signage
description: Brass-on-navy digital signage — an energetic lobby marquee, executed with restraint.
colors:
  navy: "#0E3361"
  navy-deep: "#072147"
  bronze: "#C9864C"
  bronze-strong: "#A36738"
  bronze-soft: "#F6E5D0"
  ink: "#0B1B33"
  muted: "#5C6B82"
  ink-40: "#8B98AE"
  line: "#E6E9F1"
  cream: "#F4F6FA"
  cream-warm: "#FAF6ED"
  white: "#FFFFFF"
  success: "#2E9E5B"
  danger: "#B23B2E"
  stage-deep: "#050608"
  stage-mid: "#0A0C10"
  marquee-cyan: "#6DD5E8"
typography:
  display:
    fontFamily: "Anton, 'IBM Plex Sans Thai', Impact, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 5rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Prompt, 'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3.5vw, 2.625rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Prompt, 'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Prompt, 'IBM Plex Sans Thai', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'JetBrains Mono', 'IBM Plex Sans Thai', ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.05em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "22px"
  pill: "999px"
spacing:
  xs: "7px"
  sm: "14px"
  md: "24px"
  lg: "34px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "15px 32px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.navy-deep}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "15px 32px"
  button-toggle:
    backgroundColor: "{colors.white}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "11px 12px"
  button-toggle-on:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "11px 12px"
  chip:
    backgroundColor: "{colors.white}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "5px 10px"
  badge:
    backgroundColor: "{colors.bronze-soft}"
    textColor: "{colors.bronze-strong}"
    rounded: "{rounded.sm}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "34px 32px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "22px 15px 7px"
---

# Design System: AquaMX Vertical Signage

## 1. Overview

**Creative North Star: "The Brass Marquee"**

AquaMX is a modern theatre marquee for the building lobby. Bronze lights the way against deep navy; the screen is confident and attention-catching, with the showmanship of a marquee that makes you stop and look — and the discipline of one that never blinks at you. Energy comes from light, motion, and a single warm accent, not from clutter. The screen *is* the pitch: a lobby that looks this good is the live demo that wins advertisers, so every surface carries the same brass-on-navy confidence whether it's the kiosk itself or the page selling a slot on it.

This system runs in two registers of the same identity. The **light theme** (cool off-white `#F4F6FA`, deep navy ink, bronze accent) governs the sell and the working surfaces — landing pages, pricing, infographics, submission forms. The **dark stage theme** (near-black `#050608`, white ink ramp, navy panels, a single cyan indicator) governs the 9:16 kiosk player, where content must glow and read from across a room. They are one brand seen under two lights, not two brands.

It is bilingual to the core: every Thai glyph is first-class, never an afterthought rendered in a Latin-only font. And it explicitly rejects the two failure modes that haunt this category — the **generic SaaS template** (stock gradients, identical card grids, an eyebrow above every section) and the **cluttered ad-board** (a mall directory crammed with blinking promos). Brass, not neon. Marquee, not billboard.

**Key Characteristics:**
- Brass-on-navy: deep navy structure, one warm bronze accent that earns attention.
- Two lights, one identity: a light web theme and a dark kiosk-stage theme that share the same palette logic.
- Energetic but disciplined — liveliness from motion and contrast, calm from generous space.
- Bilingual Thai/English parity, always (Prompt + IBM Plex Sans Thai).
- Confident, tactile components: solid navy actions, a warm bronze focus glow, a satisfying press.

## 2. Colors

A deep-navy foundation with a single warm bronze accent, set on a cool near-white; the dark kiosk stage inverts the canvas while keeping the same accent logic.

### Primary
- **Marquee Navy** (`#0E3361`): The structural brand color. Primary buttons, headings, nav, the dark panels on the kiosk. Carries the surface; this is the brass marquee's frame.
- **Navy Deep** (`#072147`): The pressed/hover state of navy and the deepest backgrounds. Always the darker partner of an action, never a standalone fill.

### Secondary
- **Bronze** (`#C9864C`): The one warm accent — the marquee's light. Focus rings, interactive highlights, the dot in any kicker, key emphasis. Rare by rule (see The One Bulb Rule).
- **Bronze Strong** (`#A36738`): Bronze that needs to pass contrast as *text* on light surfaces or inside soft-bronze chips. Use when `#C9864C` would be too light to read.
- **Bronze Soft** (`#F6E5D0`): A warm tint for badges, highlighted callouts, and "this is special" backgrounds. Never for large fields.

### Tertiary
- **Marquee Cyan** (`#6DD5E8`): Kiosk-stage only. A single cool indicator (live dot, eyebrow marker) that pops against near-black. Forbidden on light surfaces; it has no role there.
- **Success Green** (`#2E9E5B`) / **Alert Red** (`#B23B2E`): System feedback only — confirmations and destructive/remove actions. Never decorative.

### Neutral
- **Ink** (`#0B1B33`): Primary text on light surfaces. Near-navy black, not pure black, so it sits in the brand family.
- **Muted** (`#5C6B82`): Secondary text, captions, helper copy. Passes AA on white and on cream — the floor for body text. Do not go lighter for "elegance."
- **Ink-40** (`#8B98AE`): Tertiary only — disabled states, faint metadata. Never body text.
- **Line** (`#E6E9F1`): Borders, dividers, input strokes at rest.
- **Cream** (`#F4F6FA`): The canonical cool page background for sell and form surfaces.
- **Cream Warm** (`#FAF6ED`): The warm-paper variant used on infographics. Acceptable as a deliberate per-surface choice; not the default.
- **White** (`#FFFFFF`): Card and input surfaces, nav bar.

### Stage (kiosk dark theme)
- **Stage Deep** (`#050608`) / **Stage Mid** (`#0A0C10`): The near-black kiosk canvas and its raised panels. Depth comes from white-alpha ink steps (82% / 58% / 38% / 18%), not from shadows.

### Named Rules
**The One Bulb Rule.** Bronze is the single light on the marquee. It covers ≤10% of any screen — focus glow, one dot, one emphasized word. The moment a second large bronze area appears, the marquee becomes a billboard. Navy carries weight; bronze earns attention.

**The Two Lights Rule.** A surface is either light-theme or stage-theme — never a muddy middle. Marquee Cyan exists only on the stage; Cream exists only in the light. Do not import one theme's signature color into the other.

## 3. Typography

**Display Font:** Anton (with `IBM Plex Sans Thai`, Impact fallback)
**Body Font:** Prompt (with `IBM Plex Sans Thai`)
**Label/Mono Font:** JetBrains Mono (with `IBM Plex Sans Thai`)

**Character:** Anton is the marquee lettering — tall, condensed, impactful — reserved for big numbers and statement headlines. Prompt is the warm geometric workhorse for everything readable; it shares Thai duties seamlessly with IBM Plex Sans Thai. JetBrains Mono adds a technical, signage-system voice to labels and small metadata. The pairing is contrast-driven (condensed display vs. open humanist sans vs. mono), never two-similar-sans mush.

### Hierarchy
- **Display** (Anton 400, `clamp(2.5rem, 6vw, 5rem)`, line-height 1.02): Hero statements, the single big number on an infographic, kiosk headlines. One per view.
- **Headline** (Prompt 800, `clamp(1.75rem, 3.5vw, 2.625rem)`, line-height 1.15, tracking -0.02em): Page and section titles. `text-wrap: balance`.
- **Title** (Prompt 800, 17px, line-height 1.3): Card titles, form section heads, list-item leads.
- **Body** (Prompt 400, 16px, line-height 1.6): Paragraphs and form copy. Cap measure at 65–75ch. Color is Ink or Muted — never Ink-40.
- **Label** (JetBrains Mono 700, 12px, tracking 0.05em, often uppercase): Eyebrow markers, metadata, system tags. Used sparingly (see The Earned Kicker Rule).

### Named Rules
**The Bilingual Parity Rule.** Every font stack ends in `'IBM Plex Sans Thai'` before any generic fallback. A stack like `'Nunito', sans-serif` or `'Anton', sans-serif` with no Thai family is forbidden — Thai will silently render in the wrong font. Thai and English must look equally considered at every size.

**The Earned Kicker Rule.** Anton is for the one thing that matters on a view, not for decorating every section. A mono label kicker is allowed as a deliberate, occasional marker — never an automatic eyebrow above every heading.

## 4. Elevation

A hybrid system. **Light surfaces** are mostly flat, lifted only where a card needs to float above the page; **stage surfaces** use zero shadow and convey depth through white-alpha tonal layering instead.

### Shadow Vocabulary (light theme)
- **Card lift** (`box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 14px 36px -14px rgba(16,24,40,0.12)`): The signature soft, far-cast lift under form cards and key panels. Tinted toward navy-black, never neutral gray.
- **Focus glow** (`box-shadow: 0 0 0 3px rgba(201,134,76,0.15)`): The bronze ring on any focused input or interactive element. This is the marquee bulb lighting up.

### Named Rules
**The Flat-Stage Rule.** The kiosk stage uses no drop shadows. Depth is tonal: Stage Deep behind, Stage Mid panels, white-alpha ink steps for hierarchy. A shadow on near-black reads as dirt, not depth.

## 5. Components

### Buttons
- **Shape:** Soft-rounded (12px, `{rounded.md}`).
- **Primary:** Solid Marquee Navy fill, white text, Prompt 800, padding `15px 32px`. Confident and substantial.
- **Hover / Focus:** Hover deepens to Navy Deep; focus shows the bronze glow ring. Active presses with `transform: scale(0.98)` — the tactile click is intentional.
- **Toggle / Tab:** White fill, 1.5px Line border, Muted text at rest; the selected state (`.on`) fills Navy with white text and a navy border. Used for CTA-type pickers.

### Chips
- **Style:** White background, 1px Line (or contextual hue) border, Muted text, 8px radius, 12px font, padding `5px 10px`. Compact and quiet.
- **Badge variant:** Bronze-soft background, Bronze-strong text, 1px bronze border — the "special / featured" tag. This is one of the few sanctioned large-ish uses of bronze.

### Cards / Containers
- **Corner Style:** Generous 22px (`{rounded.xl}`) on primary cards; 14px on nested callouts.
- **Background:** White on the cream page; raised Stage Mid on the dark kiosk.
- **Shadow Strategy:** Card lift (see Elevation) on light; flat tonal on stage.
- **Border:** Hairline `#EEF1F6`/Line on light cards. Never a thick colored side-stripe.
- **Internal Padding:** `34px 32px` on primary cards.

### Inputs / Fields
- **Style:** Floating-label fields on white, 12px radius, Line stroke at rest, padding `22px 15px 7px` to seat the label.
- **Focus:** Border shifts to Bronze and the bronze glow ring appears (`0 0 0 3px rgba(201,134,76,0.15)`) — warm, unmistakable.
- **Placeholder:** `#bcc4d0` minimum; in floating-label fields the placeholder is transparent until focus. Never lighter than the AA floor for visible placeholders.
- **Error / Remove:** Alert Red (`#B23B2E`) for remove links and invalid state.

### Navigation
- **Style:** Sticky white bar, 1px Line bottom border, 76px tall. Brand wordmark in Prompt 800 navy with the bronze "X". Links in Prompt 500 Ink; primary account action is a solid-navy pill, the signed-out variant a soft `#eef3f9` navy-outline pill. Bronze never fills a nav link.

### Kiosk Stage (signature surface)
The 9:16 player: near-black canvas, navy header band, white-alpha text ramp, one cyan live indicator, Anton for big statements. Distance-legible by mandate — large type, high contrast, no thin grays. This is the demo that sells the product; treat it as the hero, not a utility.

## 6. Do's and Don'ts

### Do:
- **Do** keep bronze to ≤10% of any surface (The One Bulb Rule) — focus glow, one dot, one emphasized word.
- **Do** end every font stack with `'IBM Plex Sans Thai'` before a generic fallback, so Thai never renders in a Latin font.
- **Do** use the bronze focus glow (`0 0 0 3px rgba(201,134,76,0.15)`) on interactive focus — it's the signature lit-bulb moment.
- **Do** size kiosk type for across-the-room legibility: large, high-contrast, Ink or white — never Ink-40.
- **Do** keep light surfaces and the dark stage cleanly separated (The Two Lights Rule); cyan is stage-only, cream is light-only.
- **Do** give body text Muted (`#5C6B82`) or Ink — the AA floor — and reserve Ink-40 for disabled/metadata.
- **Do** honor `prefers-reduced-motion` with a crossfade or instant fallback on every animated surface.

### Don't:
- **Don't** ship the generic SaaS-template look — stock gradients, identical icon-heading-text card grids, a hero-metric template. (PRODUCT.md anti-reference.)
- **Don't** build the cluttered ad-board / mall-directory — content crammed edge to edge, competing blinking promos. Calm and premium even when showing many offers. (PRODUCT.md anti-reference.)
- **Don't** let "modern & energetic" collapse into bright-gradient startup; energy is motion + brass-on-navy, not saturation and noise. (PRODUCT.md anti-reference.)
- **Don't** put a mono/uppercase eyebrow or a numbered marker (01 / 02 / 03) above every section. A kicker is earned, occasional, deliberate.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe on cards or callouts. Use a full border, a soft-bronze tint, or nothing.
- **Don't** use `background-clip: text` gradient text anywhere. Emphasis comes from weight, size, or solid bronze.
- **Don't** drift the type: no Montserrat, no Nunito, no lone Inter as a replacement for Prompt/Anton. One identity across every file.
- **Don't** add drop shadows on the dark kiosk stage (The Flat-Stage Rule) — depth is tonal there.
