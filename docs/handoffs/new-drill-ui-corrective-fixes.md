# New Drill UI — Corrective Fixes

**For:** Claude Code
**Owner:** Taylor (`coachtaylorp04@gmail.com`)
**Predecessor:** [`new-drill-ui-handoff.md`](./new-drill-ui-handoff.md) (5 chunks shipped, but 3 bugs remain)
**Source spec:** [`../specs/new-drill-ui-refresh.md`](../specs/new-drill-ui-refresh.md) — guardrails still apply
**Scope:** Three targeted fixes. No new features. No restructuring beyond what's listed.

---

## Read This First

The previous 5-chunk handoff was completed but the visual result is wrong. The chunks were *literally compliant* with the doc but the chosen design tokens produce nearly-invisible cards on the dark background, the canvas yard numbers are clipped/washed out, and the toolbar layout is still the old 2x2 grid instead of a proper card-button row.

This doc fixes those three things and only those three things. **Do not touch anything else.** Do not refactor. Do not "improve" adjacent code. Do not change the diagram canvas SVG, the geometry math, the route logic, or any `handle*` function. The Guardrail List from the original spec still applies — re-read it before starting.

After each fix, stop and report back to Taylor. Do not batch.

---

## Definition of Done — Visual Standard

Before considering this work complete, the following must be visibly true on a real device or simulator:

1. **You can clearly see where each card begins and ends** without squinting. The card edge must be obvious against the page background.
2. **The yard numbers (0, 5, 10, 15, 20, 25) are clearly readable** on the left side of the diagram canvas, in dark text on a light surface — exactly like the original screenshot before the redesign.
3. **The toolbar reads as four substantial tool buttons in a row**, not as captioned icons stacked in a 2x2 grid.

If any of these three is not true after your changes, you are not done. Iterate until they are.

---

## FIX 1 — Make the section cards visible

**Problem:** Cards use `colors.surface.raised` (#161C24) on a `colors.surface.base` (#0D1117) page with `colors.border.subtle` (6% opacity) borders. The visual difference between the card and the page is too small to see in dark mode. The cards are technically there but read as invisible.

**File:** `unlock-mobile/components/DrillForm.tsx`

**Location:** The `Section` component, around lines 137–151.

**Before:**

```tsx
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
```

**After:**

```tsx
return (
  <Animated.View
    style={{
      opacity,
      transform: [{ translateY }],
      backgroundColor: colors.surface.overlay,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.card,
      padding: spacing.lg,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 2,
    }}
  >
    {children}
  </Animated.View>
);
```

**Two changes only:**
1. `backgroundColor` swaps from `colors.surface.raised` (#161C24) to `colors.surface.overlay` (#1E2530). This is a noticeably lighter surface already in the design tokens — it doesn't introduce a new color.
2. `borderColor` swaps from `colors.border.subtle` (6%) to `colors.border.card` (14%). Still subtle but visible.
3. Added a soft drop shadow for depth on iOS / Android elevation.

**Acceptance:** Open the New Drill screen. Each section card has a visibly distinct background from the page and a faint shadow underneath. You can clearly see card edges without squinting.

**Stop here. Report to Taylor. Wait for go-ahead before Fix 2.**

---

## FIX 2 — Fix the diagram canvas yard numbers

**Problem:** The canvas wrapper has `backgroundColor: colors.surface.base` (dark) plus `overflow: "hidden"` and `borderRadius: radius.lg`. The SVG `<FootballField />` renders yard numbers at `x={-4}` — to the LEFT of the playing field — which is the natural way to render axis labels. But the dark wrapper background makes those numbers blend into the wrapper edge, and the rounded corners + clipping make them look washed out or cut off.

In the original (pre-refresh) UI the canvas wrapper was effectively white, so the yard numbers had a light surface to sit on. We need to restore that.

**File:** `unlock-mobile/components/DiagramEditor.tsx`

**Location:** The canvas wrapper `<View>`, around lines 1191–1213. Look for the `<View>` with `aspectRatio: VIEW_W / VIEW_H` and `panResponder.panHandlers`.

**Before:**

```tsx
<View
  onLayout={(e) =>
    setLayoutSize({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    })
  }
  style={{
    width: "100%",
    aspectRatio: VIEW_W / VIEW_H,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border.card,
    backgroundColor: colors.surface.base,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  }}
  {...panResponder.panHandlers}
>
```

**After:**

```tsx
<View
  onLayout={(e) =>
    setLayoutSize({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    })
  }
  style={{
    width: "100%",
    aspectRatio: VIEW_W / VIEW_H,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border.card,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  }}
  {...panResponder.panHandlers}
>
```

**One change only:** `backgroundColor` swaps from `colors.surface.base` to `"#FFFFFF"`. Everything else stays.

**Why a literal hex instead of a token:** there is no white in the design tokens. The canvas is intentionally a chalkboard-style white surface that does not belong in the dark-mode palette. Using `"#FFFFFF"` directly is the right call here. Don't add a new token.

**Do NOT touch:**
- The `Svg` element inside the wrapper.
- The `<FootballField />` component.
- Any constants like `VIEW_W`, `VIEW_H`, `VIEWBOX`, `FIELD_W`, `FIELD_H`, `YARD`, `LINE_10`, `LINE_5`, `LINE_1`, `NUMBER_COLOR`, `HASH_COLOR`, `SIDELINE`, `FIELD_BG`.
- The `panResponder` or any handlers.

**Acceptance:**
- Open the New Drill screen.
- The diagram canvas is white with the football field visible.
- The yard numbers (0, 5, 10, 15, 20, 25) are clearly readable on the left side of the canvas in dark text.
- The empty-state hint "Place cones to define your setup" still shows in the center on a fresh canvas.
- Drop a cone — it appears on the canvas and snaps to a yard line, exactly as before.
- Yard lines render at full visibility.

**Stop here. Report to Taylor. Wait for go-ahead before Fix 3.**

---

## FIX 3 — Restructure the toolbar to a horizontal 4-button row

**Problem:** The toolbar in `DiagramEditor.tsx` still uses a 2x2 grid layout. Each button has a horizontal layout (icon left, label right). This makes the toolbar feel cramped and small. The agreed redesign was a single horizontal row of four card-buttons, each with the icon stacked above the label, giving each tool more visual weight.

**File:** `unlock-mobile/components/DiagramEditor.tsx`

**Location 1:** The `Toolbar` component, around lines 1804–1875.

**Before:**

```tsx
function Toolbar({
  mode,
  hasItems,
  confirmingClear,
  onAddCone,
  onAddQB,
  onAddFootball,
  onToggleRoute,
  onClearAll,
  onCancelClear,
}: {
  mode: Mode;
  hasItems: boolean;
  confirmingClear: boolean;
  onAddCone: () => void;
  onAddQB: () => void;
  onAddFootball: () => void;
  onToggleRoute: () => void;
  onClearAll: () => void;
  onCancelClear: () => void;
}) {
  const disabled = mode !== "normal";
  return (
    <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ToolbarButton
          label="Cone"
          icon="ellipse"
          onPress={onAddCone}
          disabled={disabled}
        />
        <ToolbarButton
          label="QB"
          icon="person"
          onPress={onAddQB}
          disabled={disabled}
        />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ToolbarButton
          label="Football"
          icon="american-football"
          onPress={onAddFootball}
          disabled={disabled}
        />
        <ToolbarButton
          label={mode === "route" ? "Drawing…" : "Route"}
          icon="git-branch"
          onPress={onToggleRoute}
          active={mode === "route"}
        />
      </View>
      {hasItems && (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ToolbarButton
            label={confirmingClear ? "Confirm Clear" : "Clear All"}
            icon="trash"
            onPress={onClearAll}
            destructive={confirmingClear}
          />
          {confirmingClear && (
            <ToolbarButton
              label="Cancel"
              icon="close"
              onPress={onCancelClear}
            />
          )}
        </View>
      )}
    </View>
  );
}
```

**After:**

```tsx
function Toolbar({
  mode,
  hasItems,
  confirmingClear,
  onAddCone,
  onAddQB,
  onAddFootball,
  onToggleRoute,
  onClearAll,
  onCancelClear,
}: {
  mode: Mode;
  hasItems: boolean;
  confirmingClear: boolean;
  onAddCone: () => void;
  onAddQB: () => void;
  onAddFootball: () => void;
  onToggleRoute: () => void;
  onClearAll: () => void;
  onCancelClear: () => void;
}) {
  const disabled = mode !== "normal";
  return (
    <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ToolbarButton
          label="Cone"
          icon="ellipse"
          onPress={onAddCone}
          disabled={disabled}
        />
        <ToolbarButton
          label="QB"
          icon="person"
          onPress={onAddQB}
          disabled={disabled}
        />
        <ToolbarButton
          label="Football"
          icon="american-football"
          onPress={onAddFootball}
          disabled={disabled}
        />
        <ToolbarButton
          label={mode === "route" ? "Drawing…" : "Route"}
          icon="git-branch"
          onPress={onToggleRoute}
          active={mode === "route"}
        />
      </View>
      {hasItems && (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ToolbarButton
            label={confirmingClear ? "Confirm Clear" : "Clear All"}
            icon="trash"
            onPress={onClearAll}
            destructive={confirmingClear}
          />
          {confirmingClear && (
            <ToolbarButton
              label="Cancel"
              icon="close"
              onPress={onCancelClear}
            />
          )}
        </View>
      )}
    </View>
  );
}
```

**One change only:** the four primary tool buttons (Cone, QB, Football, Route) move from two `<View flexDirection: "row">` wrappers into a single `<View flexDirection: "row">`. The Clear All / Cancel row stays separate as its own row below.

**Location 2:** The `ToolbarButton` component, around lines 1877–1951.

**Before:**

```tsx
return (
  <Pressable
    onPress={disabled ? undefined : onPress}
    disabled={disabled}
    style={({ pressed }) => ({
      flex: 1,
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor,
      borderTopColor: isDefault ? "rgba(255,255,255,0.04)" : borderColor,
      borderLeftWidth: 4,
      borderLeftColor: accentColor,
      backgroundColor: bgColor,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
    })}
  >
    {icon && <Ionicons name={icon} size={22} color={iconColor} />}
    <Text
      style={{
        fontSize: 14,
        fontWeight: "500",
        color: textColor,
        flexShrink: 1,
      }}
      numberOfLines={1}
    >
      {label}
    </Text>
  </Pressable>
);
```

**After:**

```tsx
return (
  <Pressable
    onPress={disabled ? undefined : onPress}
    disabled={disabled}
    style={({ pressed }) => ({
      flex: 1,
      minHeight: 72,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor,
      borderTopColor: isDefault ? "rgba(255,255,255,0.06)" : borderColor,
      backgroundColor: bgColor,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
    })}
  >
    {icon && <Ionicons name={icon} size={24} color={iconColor} />}
    <Text
      style={{
        fontSize: 12,
        fontWeight: "500",
        color: textColor,
        textAlign: "center",
      }}
      numberOfLines={1}
    >
      {label}
    </Text>
  </Pressable>
);
```

**Changes (vertical card-button shape):**
- `flexDirection` from `"row"` to `"column"` so the icon stacks above the label.
- `alignItems: "center"` and added `justifyContent: "center"` to center icon+label.
- `minHeight` from 52 to 72 for a more substantial card-button feel.
- Removed `borderLeftWidth` and `borderLeftColor` (the left accent bar). With four buttons in a row, an asymmetric left bar becomes visual noise. The `borderColor` and `bgColor` already communicate state.
- `paddingHorizontal` reduced from `spacing.lg` to `spacing.sm` (four buttons in a row need less internal horizontal padding).
- `gap` between icon and label is `6` (tight stack).
- `borderRadius` from `radius.xl` (14) to `radius.lg` (12) for consistency with the section cards.
- Inset highlight `borderTopColor` opacity bumped from 4% to 6% to remain visible after layout change.
- Icon size from 22 to 24.
- Label `fontSize` from 14 to 12 (smaller buttons need smaller labels).
- Label gets `textAlign: "center"` and loses `flexShrink` (no longer relevant in column layout).

**Do NOT touch:**
- The `ToolbarButton` props or the `borderColor`/`accentColor`/`textColor`/`iconColor`/`bgColor` derivation logic at the top of the function (lines 1892–1913 area). The active/destructive state logic stays exactly the same.
- The Clear All / Cancel ToolbarButton instances — they keep using the same component, just rendered in their own row. They will inherit the new vertical card-button shape automatically, which is fine and consistent.

**Acceptance:**
- Cone, QB, Football, Route render in a single horizontal row with each button taking 1/4 of the width.
- Each button shows its icon stacked above its label, centered.
- Each button is at least 72pt tall.
- Tapping Cone/QB/Football still adds an item to the canvas (no permanent selected state).
- Tapping Route enters route mode — the Route button shows orange tint, orange border, label "Drawing…".
- After items exist, Clear All renders below as its own row.
- Two-tap Clear confirmation still works.

**Stop here. Run the full smoke test below. Report to Taylor.**

---

## Final Smoke Test (run after Fix 3)

On the New Drill screen:

1. Section cards are clearly visible against the page background.
2. The diagram canvas is white with crisp yard lines and clearly readable yard numbers (0, 5, 10, 15, 20, 25) down the left side.
3. The toolbar is one horizontal row of four card-buttons (Cone, QB, Football, Route), each with the icon stacked above the label.
4. Tap Cone → cone appears, snaps to yard line. No selected state on Cone button.
5. Tap QB → QB appears.
6. Tap Football → football appears.
7. Tap Route → button turns orange, label changes to "Drawing…". Tap canvas to place waypoints. Tap Done to exit route mode. Route button returns to default.
8. Drag a cone — it moves and snaps to nearby yard lines. Drop it. The cone stays put.
9. Tap Clear All → button text changes to red "Confirm Clear". Tap again. All items removed. Empty-state hint reappears.
10. Empty-state hint reads "Place cones to define your setup" centered on the white canvas.
11. Save as Draft saves successfully. Re-open drill. Diagram identical.
12. Open same drill on web. Diagram identical.

**If any item fails, that is a regression. Stop and surface to Taylor.**

---

## What NOT To Do

- Do not touch any file outside `DrillForm.tsx` and `DiagramEditor.tsx`.
- Do not modify any `handle*` function in `DiagramEditor.tsx`.
- Do not touch `FootballField`, `Svg`, `panResponder`, or any geometry constants.
- Do not change the `Section` animation, the haptics, or the empty-state hint.
- Do not adjust the sticky footer.
- Do not adjust other sub-components (`PillButton`, `PrimaryAction`, `SecondaryAction`, `TextAction`, `PanelContainer`).
- Do not run the app in production. Local dev only.
- Do not commit, push, or merge. Edits only.

---

## Communication Protocol

After each fix:
1. Plain-English summary: what changed, what file, what line range.
2. Confirm acceptance criteria for that fix.
3. Wait for Taylor's go-ahead before next fix.

If anything doesn't apply cleanly (e.g., line numbers drifted because earlier code edits shifted things), re-read the relevant component, find the equivalent location, and apply the change. The before/after blocks above are the source of truth, not the line numbers.
