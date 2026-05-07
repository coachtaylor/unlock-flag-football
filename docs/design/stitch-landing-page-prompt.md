# Google Stitch Prompt — Unlock Flag Football Landing Page

**How to use:**
1. Open Google Stitch.
2. Paste the **DESIGN SYSTEM block** first. This sets the visual contract.
3. Then paste the **PAGE BRIEF block**. This gives Stitch the content and lets it decide layout.
4. After first generation, use the **REFINEMENT PROMPTS** at the bottom to iterate.

If Stitch only takes a single prompt, paste both blocks concatenated. Design system first, page brief second.

**Important:** This prompt deliberately does NOT prescribe layout, section order, grid structure, or visual hierarchy. Stitch is trusted to make those decisions based on the design system and the content. Iterate via the refinement prompts if the structure isn't right.

---

## DESIGN SYSTEM BLOCK (paste first)

```
Build using this exact design system. Do not deviate from these rules.

BRAND:
- Name: Unlock Flag Football
- Personality: Athletic, plain-spoken, captain-to-captain. Confident not aggressive.
- Mode: Dark mode only.

COLORS (use these exact values):
- Page background: #0D1117
- Primary card background: #1E2530
- Secondary card background: #161C24
- Primary text: rgba(255,255,255,0.92)
- Secondary text: rgba(255,255,255,0.70)
- Muted text: rgba(255,255,255,0.55)
- Subtle text: rgba(255,255,255,0.35)
- Card border: rgba(255,255,255,0.14)
- Subtle border: rgba(255,255,255,0.06)
- Primary brand accent (orange): #D48A30
- Light orange highlight: #F0B870
- Orange tint background: rgba(212,138,48,0.12)
- Orange tint border: rgba(212,138,48,0.30)
- CTA text on orange: #2C1810

COLOR RULES:
- Orange #D48A30 is reserved for primary CTAs and brand accents only. Never decorative.
- All other accents stay neutral (white at varying opacity).
- No gradients on any surface.
- No drop shadows on buttons.
- Cards may have a subtle shadow: 0 2px 6px rgba(0,0,0,0.18).

TYPOGRAPHY:
- System font stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- Two weights only: 400 regular and 500 medium. Never 600 or 700.
- Sentence case everywhere. Never Title Case. ALL CAPS only on 11px eyebrow micro-labels with 0.5px letter-spacing.
- Hero headline: 32–36px, weight 500, line-height 1.2.
- Section headline: 22–24px, weight 500.
- Card or feature headline: 15–16px, weight 500.
- Body: 14–15px, weight 400, line-height 1.55.
- Eyebrow micro-label: 11px, weight 500, uppercase, letter-spacing 0.5px.

SPACING:
- 8px base unit. Standard scale: 4, 8, 12, 16, 20, 24, 32, 48, 64.
- Border radius: 8px on buttons and inputs, 12px on standard cards, 14px on featured cards, 999px on pills.

COMPONENTS:
- Primary button: #D48A30 background, #2C1810 text, 8px radius, 14px text weight 500. No gradient, no glow, no drop shadow on the button itself.
- Secondary button: rgba(255,255,255,0.04) background, 0.5px border rgba(255,255,255,0.14), white text.
- Input field: rgba(0,0,0,0.3) background, 0.5px border rgba(255,255,255,0.12), 8px radius, white text.
- Pill/tag: 999px radius, 6px vertical 12px horizontal padding, 12px text weight 500. Selected state uses orange tint background, orange tint border, light orange text.
- Card: #1E2530 background, 1px border rgba(255,255,255,0.14), 12px radius, subtle shadow.

VOICE:
- Plain English. No jargon. No SaaS marketing speak.
- No em dashes. Use commas or periods.
- American English spelling.
- Concrete language over abstract.
- Honest about pre-launch stage.

ANTI-PATTERNS (do NOT do):
- Stock photography
- Generic athletes/teamwork imagery
- Em dashes
- Gradients
- Drop shadows on buttons
- Three or more font weights
- Decorative orange
- Fake testimonials or fake logo walls
```

---

## PAGE BRIEF BLOCK (paste second)

```
Design a single-page scrolling landing page for Unlock Flag Football. The product is a coach and team practice management tool for flag football captains. The page is pre-launch and exists to collect waitlist signups.

You decide the layout, section order, and visual hierarchy. Use the design system above to enforce visual consistency. Use the content below to fill the page.

PRIMARY GOAL: Get the visitor to enter their email and join the waitlist.

PRIMARY AUDIENCE: Flag football team captains and coaches who run weekly practices.

THE PAGE MUST INCLUDE THIS CONTENT (you decide order and treatment):

A — Status announcement
- "Coming soon · Coach early access" — short eyebrow-style status pill, signaling pre-launch.

B — Hero pitch
- Headline: "Stop winging Sunday practice."
- Sub-headline: "The flag football practice tool you've been texting your group chat about. Plan smarter, benchmark your players, walk into Sunday with a real plan."
- A primary call to action: email input + "Join waitlist" button.
- Trust microcopy near the CTA: "Free during early access. No spam."

C — Hero product visual
- A signature product screenshot moment showing the team dashboard. Render this as a labeled placeholder area until a real screenshot is provided. Placeholder label: "Dashboard screenshot — team strengths, weaknesses, recent practice history."
- Style the placeholder deliberately (dashed border, secondary text label, white-on-dark) so it reads as intentional, not as a missing image.

D — Captain pain points (three concrete pains)
- Section eyebrow: "The captain's problem"
- Section headline: "Most captains are winging it."
- Pain 1: Title "Drills from group texts" — Body: "Screenshots of TikToks and Instagram clips. No structure. No way to track what works."
- Pain 2: Title "No shared player view" — Body: "Captains text each other after practice. Gut-feel grades. Nobody knows who is actually improving."
- Pain 3: Title "Practice planned at 2am" — Body: "The night before. Half-baked. By the time you set up cones, you've forgotten what you wanted to work on."

E — Product features (four core capabilities)
- Section eyebrow: "What you get"
- Section headline: "A real practice tool, built for flag football."
- Feature 1 — Drill library:
  Eyebrow tag: "Drill library"
  Headline: "Build your team's drill bank."
  Body: "Save drills with diagrams, setup instructions, and source links. Your whole captain crew sees the same library."
  Visual placeholder label: "Drill library list view"
- Feature 2 — Player benchmarks:
  Eyebrow tag: "Player benchmarks"
  Headline: "Stop guessing who's strong at what."
  Body: "Run timed and rated drills. Anchored 1 to 5 scale. Quick tags. Three captains stay on the same page."
  Visual placeholder label: "Benchmark rating + tags"
- Feature 3 — Practice planner:
  Eyebrow tag: "Practice planner"
  Headline: "Plan Sunday in five minutes."
  Body: "Pull drills from your library, drop them into time blocks, share with your co-captains. Walk into practice with a plan."
  Visual placeholder label: "Practice plan with time blocks"
- Feature 4 — Team dashboard:
  Eyebrow tag: "Team dashboard"
  Headline: "See what to work on next."
  Body: "Team strengths and weaknesses by category. Player progression over time. Data-backed answers to where your team needs to grow."
  Visual placeholder label: "Team strengths and weaknesses"

F — How it works (three-step loop)
- Section eyebrow: "How it works"
- Section headline: "Assess. Plan. Practice. Repeat."
- Step 01 — Assess: "Run benchmark drills with your team. Capture times and ratings."
- Step 02 — Plan: "Build a practice plan that targets the gaps. Share with co-captains."
- Step 03 — Practice: "Run the practice. Log what happened. Watch your team get better."

G — Origin story
- Eyebrow: "Why this exists"
- Body: "Built by a flag football player who watched her captains wing every practice off TikTok drills and group texts. Saturday 7v7. Wednesday 5v5. Same chaos every week. We figured someone should fix it."

H — Final waitlist signup form
- Section headline: "Get on the early-access list."
- Sub-headline: "Captains and coaches first. We'll let you in as we expand."
- Form fields: an email input (placeholder "your@email.com"), and a role selector showing four options as pills: "Captain", "Coach", "Player", "Other". Show "Captain" as the selected default.
- Submit button: "Join the waitlist"
- Microcopy below: "We'll only email you about Unlock Flag Football. Unsubscribe any time."

I — Top navigation (persistent)
- Logo mark: a small 24px square in #D48A30 with a white "U" centered, paired with the wordmark "Unlock Flag Football."
- Nav links: "Product", "Story"
- A small primary "Join waitlist" button.

J — Footer
- Brand line: "Unlock Flag Football · 2026"
- Contact: "taylor@unlockflagfootball.com"

GLOBAL CONSTRAINTS:
- The page must feel scannable end-to-end in under 90 seconds.
- The waitlist signup form must appear at least twice on the page so visitors can convert at multiple scroll points.
- No section uses orange decoratively. Orange appears only on: the logo mark, the status pill, primary CTA buttons, the eyebrow tags on feature cards, the step numbers in the how-it-works section, and the selected pill in the final form.
- All other accents stay neutral.
- All screenshot or product visual areas must render as labeled dashed placeholders until real screenshots are provided. Style them deliberately.
- The design must be fully responsive. On mobile, the layout collapses gracefully without losing any content.
- No animation in this initial design. Static mockup only.
- No stock photography.
```

---

## REFINEMENT PROMPTS (use after first generation)

If hero feels weak:
```
Make the hero more visually anchored. Increase the hero headline weight visually. Make the primary call to action more prominent. The hero should be the strongest moment on the page.
```

If feature blocks look flat:
```
Increase visual differentiation between feature blocks. Make card edges more visible against the page background by raising the card border opacity. Add a subtle drop shadow under each feature card. Vary the visual treatment of the screenshot placeholders so the page does not feel monotonous.
```

If orange feels overused:
```
Audit the page for any decorative orange. Orange #D48A30 should appear only on: the logo mark, the status pill, the primary "Join waitlist" buttons, the eyebrow tags on feature cards, the numbered steps in the how-it-works section, and the selected role pill in the final form. Remove orange from anywhere else and replace with neutral white at appropriate opacity.
```

If the page feels too long:
```
Tighten the page. Combine related sections where it improves flow. Reduce vertical padding between sections. The content should still all be present, just packed more efficiently.
```

If the page feels too short or empty:
```
Add more visual breathing room between sections. Strengthen each section with clearer hierarchy: a stronger eyebrow label, a more confident headline, and supporting content that earns the space.
```

If screenshot placeholders look like bugs:
```
Style every screenshot placeholder more deliberately so it reads as intentional. Use a rgba(255,255,255,0.03) background, a 0.5px dashed border in rgba(255,255,255,0.20), and a centered label in 13px secondary text describing what screenshot will go there. These are intentional placeholders, not missing images.
```

If you need a mobile version:
```
Generate a mobile version of this page at 380px viewport width. All content present, all sections in the same order, but the layout should collapse to single column where needed. Hero headline drops to 26px. Section padding compresses. Maintain the full waitlist signup form on mobile.
```

If section order feels off:
```
Reconsider the section order based on conversion best practices for an early-stage waitlist landing page. Lead with the strongest hook. Place social proof or origin story before the final CTA to build trust just before the ask. The final waitlist form should be the last full section before the footer.
```

If a section is missing visual interest:
```
The [section name] section is too text-heavy. Add a visual element — an illustrative shape, an icon, a small product screenshot, or a labeled placeholder — that earns its place and reinforces the section's message.
```

---

## NOTES FOR YOU

**On letting Stitch own the layout:**
This prompt is intentionally lean on layout instructions. Stitch is good at hierarchy and rhythm when given strong design + content rules. If the first generation gets the structure wrong, iterate via the refinement prompts above instead of dictating layout up front.

**On exporting from Stitch:**
- Stitch can export to Figma or HTML/CSS. For Cloudflare Pages + Next.js, HTML/CSS export is more useful, but Figma export gives a cleaner editing surface if you want to iterate on visuals before code.
- Whatever Stitch exports will need cleanup to fit Next.js + Tailwind conventions. Treat the export as a high-fidelity reference, not production code.

**On copy:**
- The headlines and body text in this brief are first-draft. They follow the voice rules but they are not final. Workshop them once you see the structure rendered.

**On screenshots:**
- Stitch will render placeholder boxes. Once your dashboard UI is polished, replace the placeholders with real screenshots in Figma or in code.

**On animation:**
- Stitch generates static designs. Motion gets layered in during implementation, not in Stitch. The design system spec includes the motion rules so we know what to add later.
