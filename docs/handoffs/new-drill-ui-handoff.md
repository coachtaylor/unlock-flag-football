# New Drill Screen UI Refresh — Design + Dev Handoff

**For:** Claude Code (or any engineer picking this up)
**Source spec:** [`../specs/new-drill-ui-refresh.md`](../specs/new-drill-ui-refresh.md) — read this first.
**Owner / reviewer:** Taylor (`coachtaylorp04@gmail.com`)
**Repo path:** `unlock-mobile/`

> **Read this first:** Before writing any code, read the spec linked above end-to-end, and especially the **Guardrail List** in §"The Guardrail List — Do Not Modify". Several recent build prompts for this app (`prompts/build-6-*.md`, `prompts/build-7-*.md`) refined the diagram editor's geometry, snapping, and route logic. None of that may regress.

---

## How to Work This Handoff

**Five chunks. Do them in order. After each chunk:**
1. Run the app on a simulator if available; otherwise have Taylor verify visually.
2. Show Taylor a plain-English summary of what changed.
3. Run the **Manual Regression Smoke Test** at the bottom of this doc.
4. Wait for Taylor's go-ahead before starting the next chunk.

**Do not batch chunks.** The whole point of chunking is reviewability. If you finish a chunk fast, stop and let Taylor look at it.

**Do not modify anything on the spec's Guardrail List.** If a chunk seems to require it, stop and surface the conflict to Taylor.

**Do not run a build deploy, push, or merge.** Local-only.

**Do not delete files or rename existing functions.** Add. Wrap. Restyle. That's it.

---

## Repo Context

### Files you will edit

- `unlock-mobile/components/DrillForm.tsx` — the form screen. Lower risk. Edit first.
- `unlock-mobile/components/DiagramEditor.tsx` — large file (~1800 lines). Higher care required. Only edit the visual layout and the `Toolbar` / `ToolbarButton` sub-components. Do not touch any `handle*` function, the SVG canvas internals, or the geometry math.

### Files you will NOT edit

- `unlock-mobile/types/diagram.ts`
- `unlock-mobile/lib/generate-setup-instructions.ts`
- `unlock-mobile/components/ui/Button.tsx`, `Input.tsx`, `TextArea.tsx`, `Tag.tsx`
- `unlock-mobile/constants/design.ts` (read from this — never write to it)
- Anything in `unlock-app/` (web app — out of scope)
- Any Supabase migration or SQL file

### Design tokens (inline reference — read from `unlock-mobile/constants/design.ts`)

```ts
colors.surface.base       // #0D1117  page background
colors.surface.raised     // #161C24  card background — USE FOR SECTION CARDS
colors.surface.overlay    // #1E2530  optional deeper raise
colors.surface.muted      // rgba(255,255,255,0.04)  pressed/hover hint
colors.surface.pressed    // rgba(255,255,255,0.08)

colors.text.primary       // rgba(255,255,255,0.92)
colors.text.secondary     // rgba(255,255,255,0.60)
colors.text.muted         // rgba(255,255,255,0.35)  use for empty-state hint

colors.border.subtle      // rgba(255,255,255,0.06)  use for card borders
colors.border.default     // rgba(255,255,255,0.10)
colors.border.card        // rgba(255,255,255,0.14)

colors.orange[400]        // #F0B870  selected-state text/icon
colors.orange[500]        // #D48A30  selected border, primary CTA
colors.orange.tint        // rgba(212,138,48,0.12)  selected-state background
colors.orange.tintBorder  // rgba(212,138,48,0.30)  selected border (softer)

spacing.xs (4) sm (8) md (12) lg (16) xl (20) 2xl (24) 3xl (32)
radius.sm (6) md (8) lg (12) xl (14) pill (20) full (9999)
```

### Existing patterns already in the codebase to mirror

**Card pattern in use elsewhere** (see `DiagramEditor.tsx` line ~1538 — the "Selected Route" panel):
```tsx
<View
  style={{
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.card,
    backgroundColor: colors.surface.raised,
    gap: spacing.sm,
  }}
>
  ...
</View>
```
For section cards in this refresh use `radius.lg` (12) for consistency, not `radius.xl` (14).

---

## The Five Chunks

### CHUNK 1 — Section card wrappers in `DrillForm.tsx`

**Goal:** Wrap each form section in a raised card so the screen has visible structure.

**File:** `unlock-mobile/components/DrillForm.tsx`

**What to do:**
Each form section currently renders directly into the ScrollView's `contentContainerStyle` with `gap: spacing["2xl"]`. Wrap each one in a `Section` component you'll add to the same file (don't create a new file for one wrapper).

**Add this helper component** near the existing `SectionLabel` component (around line 98–114):

```tsx
function Section({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface.raised,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        padding: spacing.lg,
      }}
    >
      {children}
    </View>
  );
}
```

You'll need to import `radius` from `../constants/design` if not already imported. Check the existing import line.

**Then wrap each section.** Example before/after for the Drill Name section:

```tsx
// BEFORE
<Input
  label="Drill Name"
  value={drillName}
  onChangeText={setDrillName}
  placeholder="e.g., 5-10-5 Shuttle"
  autoCapitalize="words"
  returnKeyType="next"
/>

// AFTER
<Section>
  <Input
    label="Drill Name"
    value={drillName}
    onChangeText={setDrillName}
    placeholder="e.g., 5-10-5 Shuttle"
    autoCapitalize="words"
    returnKeyType="next"
  />
</Section>
```

Wrap all seven sections the same way: Drill Name, Category, Description, Video Link, Benchmark Type, Equipment, Setup Diagram.

**Keep `gap: spacing["2xl"]` on the ScrollView's content container** — that's the inter-card spacing.

**Do NOT change:**
- The order of sections.
- The contents of any section.
- The header, the sticky footer, or the KeyboardAvoidingView.
- The `parseEquipmentString` / `formatEquipment` functions (they live in this file but are not touched).
- The `persist` or `save` functions.

**Acceptance:**
- Open New Drill screen. Each form section sits inside its own dark card with subtle border.
- All inputs, tags, and the diagram editor still work normally.
- No spacing or layout regression — just visible card boundaries.

**Hand back to Taylor. Wait for go-ahead before Chunk 2.**

---

### CHUNK 2 — Toolbar visual redesign in `DiagramEditor.tsx`

**Goal:** Redesign the diagram toolbar so action buttons (Cone/QB/Football) and the mode-toggle button (Route) read as proper card-buttons with clear iconography. Preserve every behavior.

**File:** `unlock-mobile/components/DiagramEditor.tsx`

**What to edit:** Only the `Toolbar` component (around line 1743) and the `ToolbarButton` component (around line 1816). Do not touch any other part of the file.

**What stays exactly the same:**
- The `Toolbar`'s prop signature (`mode`, `hasItems`, `confirmingClear`, all the `on*` callbacks).
- The two-row 2-column button layout for Cone/QB/Football/Route.
- The Clear All / Cancel row that appears when `hasItems` is true.
- The two-tap clear confirmation pattern.
- The `ToolbarButton`'s prop signature (`label`, `icon`, `onPress`, `disabled`, `active`, `destructive`).
- Active-state styling kicks in only via the `active` prop. Cone/QB/Football never receive `active`. Route receives `active={mode === "route"}` (already does — preserve this).

**What changes (visual only):**

In `ToolbarButton`, current styling at line ~1853 onward uses `flex: 1, minHeight: 52` on a `Pressable`. Read that block carefully and apply these tweaks:

1. **Increase visual weight of the icon.** The Ionicons rendered inside `ToolbarButton` are currently small (check the existing `size` prop). Bump to 22 if smaller. This is the only icon-size change.

2. **Soften the default border.** Current `borderColor` defaults to `colors.border.card` (~14% opacity). Drop to `colors.border.subtle` (~6%) for the default state. Keep `colors.orange[500]` for active and `colors.error` for destructive.

3. **Add a subtle inset highlight on the default state** for depth. Use a thin top border (1px) with `rgba(255,255,255,0.04)`. This is a single line of style — do not get fancy.

4. **No gradients. No drop shadows on the buttons themselves.** Flat fills only.

**Do NOT add:**
- A "selected" state for Cone/QB/Football. They are tap-to-add actions, not selectable tools.
- Any new button or any new prop.
- Any change to `disabled`, `active`, `destructive` semantics.

**Acceptance:**
- Tap Cone → cone added to canvas at default position. No selected state on the Cone button.
- Tap QB → QB added. No selected state on the QB button.
- Tap Football → football added. No selected state.
- Tap Route → enters route mode. Route button shows orange tint + orange border + label "Drawing…". Tap the canvas to place waypoints. Tap Done in the route panel below to exit; Route button returns to default style.
- Tap Clear All → button text changes to "Confirm Clear" red. Tap again within 4s → all items removed. After 4s, reverts to "Clear All".
- All existing behavior unchanged.

**Hand back to Taylor. Wait for go-ahead before Chunk 3.**

---

### CHUNK 3 — Empty-state hint inside the canvas + soft canvas drop shadow

**Goal:** First-time captains see a hint in the empty canvas. Add a subtle drop shadow under the canvas for depth.

**File:** `unlock-mobile/components/DiagramEditor.tsx`

**What to do:**

**Empty-state hint:**
Find the SVG canvas render block (it starts somewhere around line ~1300 with `<Svg width={...} height={...}>`). The canvas is wrapped in a `<View>` directly above the `<Toolbar>` call (line 1442 area).

Render a hint overlay inside that wrapper `<View>`, conditionally on `data.cones.length === 0`:

```tsx
{data.cones.length === 0 && (
  <View
    pointerEvents="none"
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Text
      style={{
        fontSize: 13,
        color: colors.text.muted,
        fontWeight: "500",
        backgroundColor: "rgba(255,255,255,0.85)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.md,
      }}
    >
      Place cones to define your setup
    </Text>
  </View>
)}
```

The semi-opaque background ensures the hint is readable on the white canvas. `pointerEvents="none"` ensures taps pass through to the SVG.

**Canvas drop shadow:**
On the wrapper `<View>` that contains the SVG canvas (NOT on the SVG itself — RN shadow on SVG is unreliable), add:

```tsx
shadowColor: "#000",
shadowOpacity: 0.25,
shadowOffset: { width: 0, height: 4 },
shadowRadius: 12,
elevation: 6,  // android
```

If the wrapper already has style props, merge these in. Keep it subtle — these values are deliberately low.

**Do NOT:**
- Modify the canvas SVG content.
- Change the canvas dimensions, viewBox, or yard-line rendering.
- Change the white background fill of the canvas.

**Acceptance:**
- Fresh canvas → centered hint visible.
- Tap Cone (adds a cone) → hint disappears immediately.
- Clear All → hint reappears.
- Soft shadow visible under the canvas in dark mode. Not heavy, not glowing.

**Hand back to Taylor. Wait for go-ahead before Chunk 4.**

---

### CHUNK 4 — Animation + haptic feedback

**Goal:** Subtle entry animation on the section cards, light haptic on tool taps. Athletic-feeling polish.

**Files:**
- `unlock-mobile/components/DrillForm.tsx`
- `unlock-mobile/components/DiagramEditor.tsx`

**Animation (DrillForm.tsx):**

Inside the `Section` helper component you added in Chunk 1, wrap the children in an `Animated.View` that fades + slides up on mount.

```tsx
import { Animated } from "react-native";
import { useEffect, useRef } from "react";

function Section({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }],
        backgroundColor: colors.surface.raised,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        padding: spacing.lg,
      }}
    >
      {children}
    </Animated.View>
  );
}
```

**Haptics (DiagramEditor.tsx):**

Install (or confirm installed): `expo-haptics`. If not installed, surface this to Taylor before proceeding — do not add it silently.

```bash
npx expo install expo-haptics
```

In `DiagramEditor.tsx`, import:

```tsx
import * as Haptics from "expo-haptics";
```

Trigger a light impact on each of the four toolbar action callbacks. Since the callbacks are passed in as props (`onAddCone`, `onAddQB`, `onAddFootball`, `onToggleRoute`), wrap them at the call site inside the `Toolbar`'s consumer — meaning, at the `<Toolbar onAddCone={handleAddCone} ... />` call site (around line 1442), wrap each handler:

```tsx
<Toolbar
  mode={mode}
  hasItems={data.cones.length > 0 || data.routes.length > 0}
  confirmingClear={confirmingClear}
  onAddCone={() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleAddCone();
  }}
  onAddQB={() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleAddQB();
  }}
  onAddFootball={() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleAddFootball();
  }}
  onToggleRoute={() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleStartRouteDrawing();
  }}
  onClearAll={handleClearAll}
  onCancelClear={() => setConfirmingClear(false)}
/>
```

Do NOT add haptics to Clear All or Cancel Clear — those are destructive and the existing two-tap pattern is its own confirmation feel.

**Acceptance:**
- Section cards fade + slide up on mount. Total motion under ~250ms. No jank.
- On a real iOS device, tapping Cone/QB/Football/Route triggers a light haptic.
- Android: haptics may not fire (light impact is iOS-strong); that's fine, no work needed.

**Hand back to Taylor. Wait for go-ahead before Chunk 5.**

---

### CHUNK 5 — Orange-economy cleanup + SectionLabel contrast

**Goal:** Final polish. Make sure orange is reserved only for the Publish CTA + Route active state. Bump section-label contrast for accessibility.

**Files:**
- `unlock-mobile/components/DrillForm.tsx`
- `unlock-mobile/components/DiagramEditor.tsx`

**SectionLabel contrast:**
In `DrillForm.tsx`, find the `SectionLabel` component (around line 98). Its color is currently `colors.text.secondary` (60% opacity). Change to a slightly stronger value:

```tsx
color: "rgba(255,255,255,0.70)"
```

This is a one-line change. Do not invent a new token — just inline this value. (If Taylor later wants to add `colors.text.label` to design.ts, that's a follow-up.)

**Orange-economy audit:**
Walk both files visually. For every place orange (`colors.orange.*`) is used outside the following allowed list, remove it:

**Allowed orange usage:**
1. `Button` primary CTA (in `Button.tsx` — don't touch).
2. `ToolbarButton` `active` state (Route mode).
3. `confirmingClear` red — note this uses `colors.error` not orange, so it's fine.
4. The route-panel "Done" button in `DiagramEditor.tsx` mode-route block (uses `colors.orange[500]` in web parity — keep).
5. The pill button selected state in segment-type selector (uses `colors.orange.tint` etc — keep).
6. The bottom nav active indicator (handled in nav code, not these files — don't touch).

**Likely places orange may have been added during exploration that should be removed:**
- Any decorative dots in section labels.
- Any orange accent on the back-button chip.
- Any glow on the Publish CTA you might be tempted to add — leave the Button component flat.

If you find no decorative orange to remove, that's a pass — note it in the handoff summary.

**Acceptance:**
- SectionLabels visibly more readable but still feel like a label, not body text.
- Static screenshot of New Drill in `mode === "normal"` with no items on canvas → orange present only on the bottom nav indicator (out of scope) and the Publish button.
- Static screenshot in `mode === "route"` → orange additionally on the Route toolbar button. Nowhere else.

**Hand back to Taylor. After Chunk 5, run the full Manual Regression Smoke Test below and report results.**

---

## Manual Regression Smoke Test

Run after every chunk and definitely after Chunk 5. Have Taylor verify if you can't run the simulator yourself.

**On mobile, in a fresh New Drill screen:**

1. **Section cards visible** — All seven sections render in dark cards with consistent borders and rounded corners.
2. **Drill name input works** — Type a name, see it appear, blur input, value persists.
3. **Category select works** — Tap a category tag, it selects (orange tint), tap again to deselect.
4. **Description multi-line works** — Type, see it wrap.
5. **Video link input works** — URL keyboard appears, no autocapitalize.
6. **Benchmark type select works** — Tap None/Timed/Rated, helper text updates.
7. **Equipment input works** — Type "5 cones, 1 ladder", verify cones auto-count later.
8. **Diagram canvas visible** — White canvas with yard-line numbers down the left, soft shadow underneath.
9. **Empty hint visible** — "Place cones to define your setup" centered.
10. **Add cone** — Tap Cone button. Cone appears at default position. Empty hint disappears. Light haptic on iOS.
11. **Drag cone** — Drag cone to a new position. It snaps to yard markers.
12. **Add QB** — Tap QB. Yellow QB marker appears.
13. **Add football** — Tap Football. Football marker appears.
14. **Draw a route** — Tap Route → button shows orange "Drawing…" state. Tap canvas at 3 points to place waypoints. Switch segment type via the pill selector that appears below toolbar. Tap Done. Route is drawn with mixed segment types.
15. **Undo last waypoint** — During route drawing, tap Undo. Last waypoint removed.
16. **Clear All** — Tap Clear All. Button text becomes "Confirm Clear" red. Tap again. All items removed. Empty hint reappears.
17. **Save as Draft** — Tap Save as Draft. Drill saves. Open it back up — diagram is byte-identical to what you drew.
18. **Compare with web** — If feasible, open the same drill on web. Diagram renders identically to mobile.
19. **Auto-equipment** — If you placed N cones, equipment field/output reflects "N cones".
20. **Auto-instructions** — Setup instructions output lists yard distances correctly.

**If any of #10–20 differ from pre-refresh behavior, that's a regression. Stop and surface to Taylor.**

---

## Visual Reference: Mockup

The mockup we used to align on direction is preserved here for reference. Note that the mockup showed Cone with a permanent selected state — that was incorrect. In actual implementation, only Route gets the selected state (when `mode === "route"`).

The mockup was rendered as inline HTML during planning. For visual review, ask Taylor to revisit the conversation history if needed. The mockup's key visual cues are:

- Each section sits in its own dark raised card with thin border.
- Diagram canvas is white, framed inside its own card with the toolbar below.
- Empty-state hint appears centered on the canvas.
- Toolbar buttons are visually weighted with proper icons; only Route gets orange tint when active.
- Publish + Save as Draft pair at the bottom in the existing sticky footer.

---

## Communication Protocol With Taylor

After every chunk:

1. **Summary in plain English (not jargon):** what changed, why, any surprises.
2. **Files touched + line ranges roughly.**
3. **Anything you stubbed, skipped, or punted on.**
4. **One concrete next-step suggestion** (usually: "ready for chunk N+1?").

Example after Chunk 1:

> Done with Chunk 1. Wrapped all seven form sections in a new `Section` helper component inside `DrillForm.tsx`. Each section now has a dark raised card background, thin border, and 16px padding. No behavior changed — every input, tag, and the diagram editor still work exactly as before. Touched lines ~98 (added Section component) and ~296–394 (wrapped sections). Ready for Chunk 2 whenever you are.

If you hit anything ambiguous, **ask Taylor before guessing.** Underspecified behavior is the #1 source of regressions on this kind of work.

---

## Final Checklist Before Marking This Handoff Done

- [ ] All five chunks complete.
- [ ] Manual Regression Smoke Test passed (#1–20).
- [ ] No file in the Guardrail List was modified.
- [ ] No new packages added without approval (only `expo-haptics` if not present).
- [ ] No deploy, push, or merge run.
- [ ] Taylor visually confirmed on a real device or simulator.
- [ ] Any P1/P2 items noticed during work but not in scope are documented as a comment to Taylor — do not silently fix.
