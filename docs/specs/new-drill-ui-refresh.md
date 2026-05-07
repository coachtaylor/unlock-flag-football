# New Drill Screen UI Refresh — PRD

**Author:** Taylor (drafted with Claude in Cowork mode)
**Date:** May 6, 2026
**Status:** Approved, ready for implementation
**Scope:** Mobile app (`unlock-mobile`) only. Web app is out of scope.
**Implementation owner:** Claude Code (chunked handoff in `../handoffs/new-drill-ui-handoff.md`)

---

## Problem Statement

The mobile New Drill screen looks visually flat and unstructured. There is no card depth, hierarchy is weak, the diagram toolbar reads as captioned icons rather than tools, and the primary CTA feels disconnected from the canvas. At the same time, the diagram editor (`DiagramEditor.tsx`) has months of careful work behind it including grid snapping, cone/QB/football positioning, route drawing with movement-type segments, yard-distance auto-generation for setup instructions, and equipment auto-counting. Any UI redesign that breaks or subtly alters this behavior is a regression — captains who already use the web version expect mobile to feel familiar.

The challenge: refresh the screen's visual design without touching the diagram's interaction model, geometry, snapping logic, or data shape.

---

## Goals

1. **Visual quality lift.** Apply structural redesign (raised cards per section, real toolbar with selected states for mode-toggle buttons, framed canvas, paired CTAs, orange-economy cleanup, accessible micro-text contrast).
2. **Zero behavior drift in the diagram.** Cone placement, QB and football placement, route waypoints, segment types, snap-to-yard logic, drag-to-position, hit-testing, auto-generated setup instructions, and equipment cone-counting all behave identically before and after the refresh.
3. **Web-mobile parity preserved.** The mobile diagram already has parity with the web diagram (verified May 6, 2026). The refresh must not introduce divergence.
4. **Saved data is byte-identical.** A drill saved before the refresh loads identically after. A drill saved after the refresh on mobile loads identically on web. The `setup_diagram` JSON shape, the `setup_instructions` string, and the `equipment` JSON do not change.

---

## Non-Goals

1. **No changes to `DiagramEditor.tsx`'s interaction logic, geometry math, hit-testing, or coordinate transforms.** Visual changes happen in the parent layout, the `Toolbar` sub-component, and the outer wrapper view — not in the canvas SVG internals or `handle*` functions.
2. **No changes to `generateSetupInstructions()` or any function that derives data from the diagram.** Out of scope. The auto-generated yard-distance instructions are a key feature.
3. **No changes to the `DiagramData` type, the `setup_diagram` JSON schema, or how it's persisted in Supabase.** The schema is shared with the web version.
4. **No web-app changes.** Out of scope for this spec.
5. **No changes to the `Tag`, `Input`, `TextArea`, or `Button` UI primitives.** They are shared across the app.
6. **No new diagram features.** Path-editing UX, multi-select, copy-paste, long-press to delete — all out of scope.
7. **No new redo functionality.** Neither web nor mobile has redo today. Building a history stack is a separate feature.
8. **No new global undo.** Undo today is route-specific (removes the last waypoint of the route currently being drawn). That behavior is preserved; no new global undo is being added.

---

## User Stories

- **As a captain creating a drill on mobile,** I want the New Drill screen to feel structured and modern, so the screen feels like a designed tool rather than an untreated form.
- **As a captain who has placed cones and routes on the web version,** I want the same drill to render and edit identically on mobile, so I'm not relearning the interaction.
- **As a first-time captain on this screen,** I want a clear hint about what to do with the empty canvas, so I am not staring at a blank rectangle.
- **As a captain reviewing a draft,** I want my saved diagram to look identical to what I drew, so I trust the data persistence.
- **As a captain mid-route-drawing,** I want the existing Undo (last waypoint) and Clear All controls to keep working exactly as they do today.

---

## Requirements

### Must-Have (P0)

**P0-1. Section cards.**
Every form section in `DrillForm.tsx` is wrapped in a raised card using `colors.surface.raised` (#161C24), `radius.lg` (12px), `border.subtle`, and a flat fill (no gradients). Sections to wrap: Drill Name, Category, Description, Video Link, Benchmark Type, Equipment, Setup Diagram.
- *Acceptance:* All seven sections render in cards with consistent radius, padding (16px), and border treatment. No section floats naked on the base surface.

**P0-2. Diagram + toolbar live in the same card.**
The setup-diagram card contains, top-down: section label, the canvas, the toolbar.
- *Acceptance:* Visually, the canvas and its tools read as one tool. The label sits above the canvas. The toolbar sits below the canvas, inside the same card.

**P0-3. Toolbar redesign — accurate semantics.**
The four toolbar buttons fall into two categories:
- **Action buttons (Cone, QB, Football):** tap = immediately add an item to the canvas at default position. No persistent selected state.
- **Mode-toggle button (Route):** tap toggles between `mode: "normal"` and `mode: "route"`. Has a selected state visible only when `mode === "route"` (orange tint background `colors.orange.tint`, orange border `colors.orange.tintBorder`, label changes to "Drawing…").

Each button is at least 52pt tall (already true today) with proper iconography and a 2-row 2-column grid layout (already today's layout).
- *Acceptance:* Tapping Cone/QB/Football adds the item without showing any selected state. Tapping Route enters route mode and the button shows the orange selected style. Tapping Route again (or finishing a route) exits and the button returns to default.

**P0-4. Existing Undo and Clear All are preserved and visible.**
- **Undo last waypoint** stays inside the contextual route-drawing panel that appears below the toolbar when `mode === "route"`. No change to its location or behavior.
- **Clear All** stays inside the toolbar with its existing two-tap confirmation pattern (tap once → "Confirm Clear" red, tap again to wipe; 4-second timeout). No change to its location or behavior.
- *Acceptance:* Both buttons exist after the refresh in the same conceptual locations and behave identically.

**P0-5. Diagram canvas behavior is unchanged.**
The internal SVG rendering, cone/QB/football positioning logic, drag handlers, tap-to-place handlers, snap-to-yard logic, route waypoint placement, segment-type rendering, hit-testing, and the football-field background all behave identically before and after the refresh.
- *Acceptance:* Place 3 cones, drag one, place a QB, draw a 3-waypoint route with mixed segment types, save the drill. Open the drill on web — diagram renders identically. Re-open on mobile — diagram renders identically. Yard distances in the auto-generated setup instructions are identical to pre-refresh output.

**P0-6. `DiagramData` shape and persistence are unchanged.**
The JSON written to Supabase's `setup_diagram` column is byte-identical to pre-refresh output for the same user input.
- *Acceptance:* Manual snapshot test: save a drill before the refresh, save the same drill after, diff the `setup_diagram` JSON. Diff is empty.

**P0-7. Empty-state hint inside the canvas.**
When `data.cones.length === 0`, show a centered hint inside the canvas: "Place cones to define your setup." Style: 13px, `colors.text.muted`, centered both axes. Disappears the moment the first cone is placed. Re-appears if all cones are cleared.
- *Acceptance:* Hint visible on fresh canvas. Hint disappears after first cone. Hint reappears after Clear All.

**P0-8. Paired action buttons in the sticky footer.**
Publish Drill and Save as Draft sit in the existing footer container. No changes to the buttons themselves (they use the existing `Button` component). No spacing or styling changes to the footer.
- *Acceptance:* Both buttons visible. Both behaviors (`save("published")` and `save("draft")`) unchanged. Disabled and submitting states still work.

**P0-9. Orange economy.**
Orange is used only on:
- The Publish CTA (existing `Button` styling — unchanged).
- The Route button when `mode === "route"` (existing behavior — unchanged).
- The active-tab indicator in the bottom nav (out of this screen's scope — unchanged).

Remove any decorative orange dots, eyebrow labels, or section ornamentation that may have been introduced during exploration.
- *Acceptance:* On a static screenshot of the new screen with no Route mode active, there is no orange anywhere except the Publish CTA and the bottom nav.

**P0-10. SectionLabel contrast bump.**
`SectionLabel` opacity increases from 0.60 to 0.70. No other typography changes.
- *Acceptance:* Section labels read clearly at 11px on the dark surface.

**P0-11. Web parity preserved.**
After the refresh, every diagram function available on web is still available on mobile (cone/QB/football placement, route drawing with segment types, ball paths, path drawing with movement types and yards, cone selection/drag/delete, route selection, waypoint deletion, undo last waypoint, clear all with confirmation).
- *Acceptance:* Manual regression test against the function list above. All work after refresh.

### Pulled Into v1 (originally P1)

**v1-A. Soft entry animation on cards.** Subtle fade + 8px slide up on mount. Use `Animated` API. Total animation under 300ms. Skip if it introduces perceptible delay.

**v1-B. Haptic feedback on tool selection.** iOS-only, light impact. Trigger on tapping Cone, QB, Football, Route. Use `expo-haptics`.

**v1-C. Subtle drop shadow on diagram canvas.** Shadow under the white canvas only (not on every card — that would be noise). Use a soft, low-opacity shadow that reads as depth without becoming a gradient.

### Future Considerations (P2 — Not In This Spec)

- Path-editing UX improvements.
- Mobile drag responsiveness improvements for paths.
- Long-press to delete a cone/route.
- Redo functionality.
- Action chip row on top-right of canvas (decided against — adds noise, no functional gain).

---

## The Guardrail List — Do Not Modify

If implementation requires changing any of these, **stop and ask Taylor before continuing**. These are not negotiable:

1. The `DiagramData` TypeScript type in `unlock-mobile/types/diagram.ts`.
2. The grid system, yard-line scale, and coordinate transforms used by the SVG canvas in `DiagramEditor.tsx`.
3. The snap-to-yard behavior on cone placement.
4. The drag-to-position handlers for cones, QB, football, and route waypoints.
5. The hit-testing functions (`hitTestCone`, `hitTestRoute`, etc.).
6. The route segment rendering logic (`renderRouteSegment`, `zigzagPoints`, `curveControlPoint`).
7. The `generateSetupInstructions()` function and its output format.
8. The `parseEquipmentString()` and `formatEquipment()` functions in `DrillForm.tsx`.
9. The shape of the JSON written to Supabase: `setup_diagram`, `setup_instructions`, `equipment`.
10. The `KeyboardAvoidingView` behavior on the form (don't break input focus or scroll).
11. The Supabase persist logic (`persist` and `save` functions in `DrillForm.tsx`).
12. The `Tag`, `Input`, `TextArea`, `Button` UI primitive components.
13. Any handler function in `DiagramEditor.tsx` matching `handle*` (these are interaction logic, not visual).
14. The two-tap Clear All confirmation pattern (4-second timeout, "Confirm Clear" red state).

---

## Success Metrics

### Leading (within 1 week of merge)

- **Zero diagram regression bugs.** Taylor creates ≥3 drills on mobile post-refresh, opens each on web, confirms identical rendering. Target: 0 differences.
- **Drill creation completion rate stays flat or improves.** No measurable decline in published-drills-per-week.
- **Visual QA pass.** Subjective "this feels modern and structured" verdict from Taylor on a real device.

### Lagging (1 month post-launch)

- **Captain confidence in the diagram tool.** Qualitative from at least 3 Sunday practice prep sessions.
- **No new support questions about diagram behavior.** Zero "where did snap-to-yard go?" or "my drill looks different now" reports.

---

## Open Questions — All Resolved

1. ~~Does undo/redo/clear logic exist?~~ **Resolved May 6.** Undo (route-specific) and Clear All (with confirmation) both exist on mobile and web. Redo doesn't exist on either; out of scope for v1.
2. ~~Where does the active-tool state live?~~ **Resolved May 6.** Inside `DiagramEditor` (the `mode` state). Cone/QB/Football are tap-to-add actions, not selectable tools.
3. ~~Canvas tone (white vs cream)?~~ **Resolved May 6.** Pure white. Don't soften.
4. ~~Pull P1s into v1?~~ **Resolved May 6.** Yes — animation, haptics, canvas shadow are all v1.

---

## Timeline

No hard external deadlines. Should ship before several Sunday practices ahead of the October 2026 tournament. No backend, schema, or cross-team dependencies. Pure frontend.
