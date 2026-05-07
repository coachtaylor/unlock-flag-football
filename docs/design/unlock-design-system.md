# Unlock Flag Football — Design System Spec

**Use:** Paste the relevant section into Google Stitch (or any AI design tool) before describing the page you want to build. This is the visual contract for everything Unlock Flag Football makes — app, web, marketing.

**Last updated:** May 2026
**Owner:** Taylor

---

## Brand at a Glance

- **Name:** Unlock Flag Football
- **Tagline frame:** Train smarter. (subject to revision per surface)
- **Personality:** Athletic, plain-spoken, captain-to-captain. Confident but not aggressive. Honest about being early-stage.
- **What it is NOT:** Corporate SaaS marketing. Nike-level swagger. Bro-fitness energy. Generic sports tech.

---

## Color Palette — End Zone Orange

### Surfaces (dark mode is primary)
- `--surface-base` `#0D1117` — page background
- `--surface-raised` `#161C24` — primary card background
- `--surface-overlay` `#1E2530` — elevated card / modal
- `--surface-muted` `rgba(255,255,255,0.04)` — subtle hover/pressed hint
- `--surface-pressed` `rgba(255,255,255,0.08)` — active press state

### Text
- `--text-primary` `rgba(255,255,255,0.92)` — body and headings
- `--text-secondary` `rgba(255,255,255,0.70)` — section labels and meta
- `--text-muted` `rgba(255,255,255,0.55)` — descriptions, helper text
- `--text-subtle` `rgba(255,255,255,0.35)` — placeholders, disabled

### Borders
- `--border-subtle` `rgba(255,255,255,0.06)` — quietest separators
- `--border-default` `rgba(255,255,255,0.10)` — standard
- `--border-card` `rgba(255,255,255,0.14)` — visible card edges
- `--border-strong` `rgba(255,255,255,0.20)` — emphasized

### Brand: End Zone Orange (primary accent)
- `--orange-400` `#F0B870` — text on orange tints, highlight
- `--orange-500` `#D48A30` — primary CTA, brand moment, selected states
- `--orange-600` `#5C3308` — text on bright orange backgrounds
- `--orange-tint` `rgba(212,138,48,0.12)` — subtle background fill for selected states
- `--orange-tint-border` `rgba(212,138,48,0.30)` — border for selected states

### Semantic supporting colors (used sparingly)
- Green family for positive signals only (`#4ADE80` / `#16A34A`)
- Blue family for data/charts only (`#60A5FA` / `#2563EB`)
- Indigo family for education/study only (`#818CF8` / `#312E81`)
- Error: `#EF4444` and light `#FCA5A5`

### Color rules
1. Orange has a job. Use only for: primary CTA, selected/active states, brand moment in hero. Never decorative.
2. Cards on `--surface-base` must use `--surface-overlay` (not `--surface-raised`) when contrast against the page is critical. The two values are close; default to `overlay` unless the card is nested inside another card.
3. Never use pure black (`#000`) or pure white (`#FFFFFF`) for text or backgrounds — exception: white is allowed for the football-field canvas in the diagram editor.
4. Light mode is secondary and not in scope for any current surface.

---

## Typography

- **Font family:** System font stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No custom font.
- **Weights:** Two weights only — `400` (regular) and `500` (medium). Never `600`, `700`, or bold.
- **Case:** Sentence case everywhere. Never Title Case. Never ALL CAPS except for micro-labels (eyebrow tags) at 11px with 0.5–0.6 letter-spacing.

### Type scale (mobile + landing)
- **Display / hero headline:** 30–36px, weight 500, line-height 1.2
- **Section headline (h2):** 22–24px, weight 500, line-height 1.3
- **Card / feature headline (h3):** 15–16px, weight 500, line-height 1.35
- **Body large:** 15px, weight 400, line-height 1.55
- **Body:** 14px, weight 400, line-height 1.55
- **Body small / helper:** 13px, weight 400, line-height 1.5
- **Eyebrow / micro-label:** 11px, weight 500, letter-spacing 0.5–0.6px, uppercase

### Typography rules
1. Two weights. Period.
2. Sentence case.
3. No em dashes. Use commas, periods, or rewrite the sentence.
4. American English spelling.
5. Headings should never exceed two lines on mobile.

---

## Spacing & Layout

### Base unit: 8px
- `xs` 4px
- `sm` 8px
- `md` 12px
- `lg` 16px
- `xl` 20px
- `2xl` 24px
- `3xl` 32px
- `4xl` 48px
- `5xl` 64px

### Layout rules
- Screen horizontal padding (mobile): 20px
- Screen horizontal padding (desktop): 24–32px
- Card padding: 16–20px
- Vertical rhythm between sections (landing): 48–64px
- Max content width (landing page): 1080px
- Max text column width: 580px

### Border radius
- `sm` 6px
- `md` 8px (form inputs, small chips)
- `lg` 12px (default for cards)
- `xl` 14px (large feature cards)
- `pill` 20px (tags, pills)
- `full` 9999px (avatars, dots)

### Shadow / elevation (use sparingly)
- **Subtle card shadow:** `0 2px 6px rgba(0,0,0,0.18)` with elevation 2 on Android
- **Elevated panel:** `0 8px 24px rgba(0,0,0,0.40)` with elevation 6 on Android
- **Hero / focal:** can stack subtle + elevated for depth

---

## Components

### Button — Primary
- Background: `--orange-500` (#D48A30)
- Text color: `--orange-600` (#5C3308) or `#2C1810` for max readability
- Padding: 12px 18px (mobile), 14px 22px (landing)
- Border radius: 8px
- Font: 14–15px, weight 500
- No gradient, no glow, no drop shadow on the button itself (depth comes from surrounding cards)
- Hover (web): subtle 90% opacity
- Active: 95% scale

### Button — Secondary
- Background: `rgba(255,255,255,0.04)` to `rgba(255,255,255,0.06)`
- Border: `0.5px solid rgba(255,255,255,0.14)`
- Text color: `--text-primary`
- Same padding/radius/font as primary

### Input — Text field
- Background: `rgba(0,0,0,0.30)` on dark surfaces
- Border: `0.5px solid rgba(255,255,255,0.12)`
- Border radius: 8px
- Padding: 10px 12px
- Text color: `--text-primary`
- Placeholder color: `--text-subtle`
- Min height: 36px (web), 44pt (mobile)

### Card — Default
- Background: `--surface-overlay`
- Border: `1px solid --border-card`
- Border radius: 12px (`lg`)
- Padding: 16–20px
- Optional subtle shadow

### Card — Feature (landing page)
- Same as default card but radius 14px (`xl`)
- Two-column inner layout: text on one side, visual on the other, alternating per row

### Pill / Tag
- Border radius: 999px (`full`)
- Padding: 6px 12px
- Font: 12px, weight 500
- Default: `rgba(255,255,255,0.04)` background, `--border-default` border, `--text-muted` text
- Selected: `--orange-tint` background, `--orange-tint-border` border, `--orange-400` text

### Eyebrow label / Micro-label
- 11px, weight 500, letter-spacing 0.5–0.6px, uppercase
- Color: `--text-secondary` (`rgba(255,255,255,0.70)`)
- Used above section headlines, on cards, as subtle tags

### Eyebrow status pill (special case)
- Same as pill component
- Used for status announcements like "Coming soon · Coach early access"
- `--orange-tint` background, `--orange-tint-border` border, `--orange-400` text

---

## Iconography

- **Library:** Ionicons (mobile already uses), or Lucide for web (similar stroke style)
- **Stroke width:** 1.6–1.8 (consistent across the system)
- **Default size:** 22–24px in toolbars, 16px inline
- **Color:** Inherit from text color of parent context (`--text-primary` or `--text-secondary`)
- **No filled icons mixed with outline icons** in the same surface — pick one style per screen

---

## Motion / Animation

### Allowed motion
- Section entry: fade + 8px translate-up, 220ms total, ease-out
- Hover state on interactive elements: 150ms ease-out
- Press state: 80ms ease-out, 95% scale
- Scroll-triggered reveals on landing page: fade + 12px translate-up, 350ms, with 80ms stagger

### Forbidden motion
- Scroll-locked sections (jacking the scroll)
- Heavy parallax
- Gradient flashes during streaming
- Auto-playing videos
- Spinning loaders longer than 1 second (use skeleton states instead)

---

## Voice & Copy Principles

1. **Plain English.** No jargon. No SaaS marketing speak. Define a term in simple language the first time it appears.
2. **Captain-to-captain tone.** Like one captain telling another captain "yeah we built this, here's what it does."
3. **Sentence case** in all UI copy.
4. **No em dashes** in any drafted copy. Use commas, periods, or rewrite.
5. **American English** spelling and idiom.
6. **Concrete over abstract.** "Pull drills from your library" beats "Streamline your drill workflow."
7. **No exclamation points** except in conversational microcopy (success states, etc.).
8. **Honest about stage.** Pre-launch is fine to admit. Don't pretend the product is more than it is.

---

## Photography & Imagery

- **Real product screenshots** wherever possible. Frame in a soft "browser" or "device" container with subtle shadow.
- **Field illustrations** (when needed): white-canvas chalkboard style, matching the diagram editor's aesthetic.
- **No stock photography** of generic athletes / generic teamwork.
- **No emoji** in production UI copy or marketing copy.

---

## Anti-patterns (what NOT to do)

- Don't use orange decoratively. It's a job.
- Don't add gradients to brand surfaces (only allowed gradient: subtle button hover state, if any).
- Don't introduce a third type weight.
- Don't use ALL CAPS except for 11px eyebrow micro-labels.
- Don't use em dashes.
- Don't use stock photography.
- Don't fake testimonials, social proof, or logo walls when none exist.
- Don't add motion that delays the user's ability to interact.
