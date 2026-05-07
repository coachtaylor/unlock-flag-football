# Unlock Flag Football — Mobile (React Native / Expo)

React Native (Expo) port of the Unlock Flag Football web app. Same Supabase backend, same design system, same product surface. The web app at `../unlock-app` remains the canonical implementation for the coach MVP — features ship there first, then port here.

## Tech Stack

- **Framework:** Expo SDK 54 (React Native 0.81, React 19)
- **Routing:** Expo Router 6 (file-based, typed routes enabled)
- **Styling:** NativeWind 4 (Tailwind v3 for React Native) + design tokens in `constants/design.ts`
- **Backend:** Supabase (PostgreSQL + Auth + RLS) — same instance as web app
- **Auth storage:** `expo-secure-store` for tokens
- **Async storage:** `@react-native-async-storage/async-storage` for preferences
- **SVG:** `react-native-svg` (for diagram builder later)
- **Icons:** `@expo/vector-icons` (Ionicons)
- **Haptics:** `expo-haptics`
- **TypeScript:** strict

## Project Structure

```
unlock-mobile/
  app/
    _layout.tsx                # Root stack, dark bg, status bar
    (auth)/
      _layout.tsx              # Auth stack (no header)
      login.tsx
      signup.tsx
    (tabs)/
      _layout.tsx              # Bottom tabs (Dashboard, Drills, Roster, Practice)
      index.tsx                # Dashboard
      drills/index.tsx
      roster/index.tsx
      practice/index.tsx
  components/
    ui/
      Button.tsx               # primary | secondary | destructive
      Card.tsx                 # surface | outlined | accent
      Tag.tsx                  # selected/unselected pill
      Input.tsx                # labeled text input
      TextArea.tsx             # multiline input
  constants/
    design.ts                  # colors, spacing, radius, fontWeight tokens
  global.css                   # @tailwind base/components/utilities
  tailwind.config.js           # extended theme matching design.ts
  metro.config.js              # withNativeWind wrapper
  babel.config.js              # nativewind + reanimated plugins
  app.json                     # Expo config (scheme: unlock, dark UI, plugins)
```

## Design System Quick Reference

All tokens live in two places that must stay in sync:
- `constants/design.ts` — JS constants for inline styles and component logic
- `tailwind.config.js` — same tokens as Tailwind theme extensions

### Colors

- `surface.base` (#0D1117) — app background
- `surface.raised` (#161C24) — cards
- `surface.overlay` (#1E2530) — modals
- `orange.500` (#D48A30) — primary CTAs, selected states (one job: interactive)
- `orange.400` / `orange.600` — selected tag text / selected tag bg
- `green.{400,600,800}` — positive signals, insights
- `blue.{400,600,800}` — data, charts
- `indigo.{400,800}` — education, study, football IQ
- `text.{primary,secondary,muted}` — alpha-on-white
- `border.{subtle,default,strong}` — alpha-on-white

### Typography

- Two weights only: `400` (normal), `500` (medium). Never bold/600/700.
- Sizes: `micro` (11px), `caption` (13px), `body` (15px), `heading` (17px), `title` (20px), `display` (24px), `stat` (28px).

### Spacing & Radius

- Spacing keys: `xs/sm/md/lg/xl/2xl/3xl` (4/8/12/16/20/24/32 px)
- Radius: `sm/md/lg/xl/pill/full` (6/8/12/14/20/9999 px)

### Visual Design Principles (Modern, Not Flat)

The app should feel like a premium sports tool, not a prototype. Every screen should have visual depth, rhythm, and polish. These principles apply everywhere.

**1. Depth through card hierarchy.** Not all cards are equal. Use three tiers:
- **Hero/featured cards:** Slightly lighter background than surface-raised (try `#1A2230` or a subtle orange gradient overlay), optional glow or accent element, 1px border in border-default. These are the top-of-screen attention-grabbers.
- **Standard cards:** surface-raised (#161C24), 1px border in border-subtle, rounded-xl (14px). Most content lives here.
- **Subdued cards:** surface-raised with no border, lower visual weight. Use for secondary or supporting info.

**2. Spacing rhythm.** Break the monotony with varied spacing:
- 32px (3xl) between major sections (e.g., hero card to next section)
- 16px (lg) between cards within a section
- 12px (md) between elements inside a card
- Section labels (label-micro) get 8px margin-bottom
- Never use the same gap everywhere. Uniform spacing = flat feeling.

**3. Left-edge accent bars on action cards.** Any card that navigates somewhere or represents a step should have a 3-4px left border in orange-500. This adds color without competing with CTAs, and instantly communicates "this is tappable."

**4. Icons add meaning.** Use Ionicons on cards and list items to break up text walls:
- Person icon for player-related items
- Football for drills
- Stopwatch for benchmarks/timed items
- Calendar for practice plans
- Clipboard for logging
- Trophy for achievements/streaks
- Icons should be 20-24px, in text-secondary color (not orange, unless the item is active/selected)

**5. Subtle borders on everything interactive.** Cards, inputs, and buttons all get at least a 1px border (border-subtle for cards, border-default for inputs). Borderless cards on a dark background look like floating text, not objects.

**6. Section headers with context.** Instead of just "GET STARTED", add a subtitle line in text-secondary that explains what the section is for. E.g., "GET STARTED" + "Let's get your dashboard set up." This fills visual space and adds warmth.

**7. Avoid dead space.** If a screen has empty areas (e.g., below the last card before the tab bar), either:
- Add a motivational or contextual message in text-muted (e.g., "Your dashboard will come alive as you add data")
- Move secondary actions (like Sign Out) into a settings icon in the header, not floating alone at the bottom
- Let the content scroll naturally without forcing it to fill the viewport

**8. Press states on all tappables.** Every card, button, and list item should have a visible press state: opacity drop to 0.85 or a slight scale (0.98). Users should feel the response. Use `expo-haptics` light impact on tag selections and toggles.

**9. Chevrons on navigable cards.** Any card that pushes to another screen gets a small chevron-right icon (Ionicons `chevron-forward`, 16px, text-muted) on the right side. This is a universal "tappable" signal.

**10. Empty states are a design opportunity.** Never show a blank screen with just text. Empty states should have:
- An icon or illustration (even a large Ionicon at 48px in text-muted)
- A clear message about what goes here
- A single CTA button to take the first action
- Vertically centered in the available space

### Hard Rules

1. Dark mode only. `surface.base` everywhere.
2. Two font weights, never bold.
3. Color has one job per screen. Orange = interactive only.
4. All tags in a group use the same selected color (orange).
5. Touch targets ≥ 44×44px.
6. "Locked insight" copy: "Add X to unlock Y" — never guilt.
7. 20px horizontal screen padding, single-column.
8. Every card gets a border (border-subtle minimum). No borderless floating cards.
9. Action/navigable cards get a left-edge orange accent bar or a chevron-right.
10. Varied spacing between sections (32px between major sections, 16px between items).

## Supabase

Env vars (create `.env.local`):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Read with `process.env.EXPO_PUBLIC_SUPABASE_URL`. The Supabase client wrapper (with `expo-secure-store` adapter) gets added in Build 2 (auth).

The database schema is documented in `../qb_supabase_full_package/docs/coach_mvp_schema_spec.md`. Don't duplicate that here — read the source.

## Build Order

This project ships in vertical slices, mirroring the coach MVP path the web app already shipped. The full plan lives in `mobile-build-plan.md` (TBD). Build 1 (this) is scaffolding only.

### Build 1 — Scaffold (this build)
- Expo project, dependencies, NativeWind, design tokens
- Tab navigation with 4 placeholder screens
- Auth route group with placeholder login/signup
- UI primitives: Button, Card, Tag, Input, TextArea

### Build 2+ — TBD
Auth, team setup, drill library, roster, benchmarks, practice planner, post-practice logging, dashboard. Each build is a vertical slice.

## Running Locally

```
npm install
npx expo start
```

Press `i` for iOS simulator, `a` for Android emulator. The dark surface background and 4-tab bar should appear.
