# Brief 057: First-Run Experience — Design Alignment + User Journey

**Date:** 2026-03-30
**Status:** ready
**Depends on:** Phase 10 complete (all briefs 039-056 shipped)
**Unlocks:** Dogfooding Ditto for real work; onboarding new users

## Goal

- **Roadmap phase:** Phase 10 — Web Dashboard (gap closure)
- **Capabilities:** Design token alignment, setup page rebuild, Day Zero welcome, workspace-from-start, onboarding trigger

## Context

Phase 10 shipped 18 briefs building the engine, components, and composition architecture. All pass their ACs. But the **user journey from first launch to daily use** was never briefed as a single coherent flow.

Three gaps were discovered during the first real dogfood session:

1. **Design tokens are stale.** `globals.css` uses the warm terracotta palette from the Designer's v2 spec (2026-03-24). The prototype-as-specification phase (2026-03-26/27) moved to cool grey + emerald green + DM Sans. `.impeccable.md` is the authoritative spec and explicitly says "no terracotta." Every page renders with the wrong palette.

2. **Setup page doesn't match P23 prototype.** Brief 039 built a functional setup wizard before the prototypes existed. P23 defines: scanning state with dot particles, progress steps (1. Connect → 2. Model), icon-box connection cards, radio-dot model selection, success state with particles. Current setup has none of this.

3. **Post-setup drops user into bare chat.** `entry-point.tsx` gates the workspace behind "has processes" — new users see a blank conversation page with no sidebar, no navigation, no onboarding trigger, no welcome. The workspace layout, feed, sidebar, and composition engine all exist but are unreachable.

Root cause: the prototype phase defined the target UI. The build phase delivered capabilities. No brief closed the loop between them.

## Objective

A new user launches Ditto and experiences: setup (P23 spec) → Day Zero welcome (P08 spec) → onboarding conversation in the workspace → full navigation available from the start. Every screen uses the `.impeccable.md` design tokens.

## Non-Goals

- Building new engine capabilities (all engine work is done — this is UI alignment)
- Implementing all 48 prototypes (only the first-run flow: P23, P08, workspace shell)
- Component-level dark mode styling (dark mode CSS token overrides ARE in scope in globals.css, but no component-level `dark:` classes or conditional rendering)
- Mobile-specific layouts (responsive breakpoints already exist from Brief 042)
- New block types or composition intents
- Rebuilding the feed, artifact mode, or process detail (these need token updates but NOT structural changes — token update propagates automatically via CSS custom properties)

## Inputs

1. `.impeccable.md` — authoritative design spec (palette, typography, spacing, shadows, motion, principles)
2. `docs/prototypes/23-setup-connection.html` — P23: setup page with 5 states (scanning, connection, model, API key, success)
3. `docs/prototypes/08-day-zero.html` — P08: welcome screen ("Hi. I'm Ditto." + 4 differentiators + CTA)
4. `docs/prototypes/00-workspace-shell.html` — P00: workspace layout with sidebar navigation
5. `docs/insights/102-brand-identity-through-constraint.md` — identity lives in three things: two-green palette, DM Sans, living dot particles
6. `packages/web/app/globals.css` — current (stale) design tokens
7. `packages/web/app/setup/setup-wizard.tsx` — current setup page (functional, wrong design)
8. `packages/web/app/entry-point.tsx` — current entry point (gates workspace behind processes)
9. `packages/web/components/layout/workspace.tsx` — existing workspace (fully built, unreachable for new users)
10. `packages/web/components/layout/sidebar.tsx` — existing sidebar (7 nav destinations, correct structure)
11. `docs/research/onboarding-interaction-spec-ux.md` — onboarding design spec
12. `processes/onboarding.yaml` — existing onboarding process definition (5 steps, system process)

## Constraints

- MUST use `.impeccable.md` as the sole authority for all visual decisions — not the old Designer v2 spec
- MUST NOT change engine code — all changes are in `packages/web/` and `globals.css`
- MUST NOT break existing components — token update must propagate through CSS custom properties, not per-component rewrites
- MUST preserve all existing functionality (feed, blocks, workspace, artifact mode, pipeline review)
- MUST use DM Sans font (loaded via Google Fonts or local), NOT Inter
- MUST include the `vivid` and `vivid-deep` token tier (the two-green signature) — these don't exist in current globals.css
- MUST show workspace layout for all users, not just those with processes — empty states are fine
- MUST NOT add prototype navigation chrome (proto-nav, state-bar, theme toggle) — these are prototype-only elements
- Setup page MUST auto-detect CLIs and show detection state (scanning → found) as in P23
- Day Zero welcome MUST appear only once (first visit after setup) and be dismissable
- Onboarding process MUST be auto-triggered for new users (existing `onboarding.yaml` + `startSystemAgentRun()`)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Design tokens (palette, typography, spacing) | `.impeccable.md` | depend | Authoritative design spec, overrides all prior |
| Setup page layout and states | P23 prototype `docs/prototypes/23-setup-connection.html` | pattern | HTML prototype → React implementation |
| Day Zero welcome | P08 prototype `docs/prototypes/08-day-zero.html` | pattern | HTML prototype → React component |
| Dot particle animation | P23/P08 prototypes (canvas-based) | adopt | Copy the particle JS from prototypes, adapt to React (useEffect + canvas ref) |
| Staggered fade-in animations | P08 prototype | pattern | CSS keyframe pattern with progressive delays |
| DM Sans font | Google Fonts | depend | `@fontsource/dm-sans` npm package or Google Fonts CDN |
| Workspace-from-start pattern | P00 workspace shell | pattern | New users see workspace with empty states, not bare chat |
| Onboarding auto-trigger | Brief 044 (`onboarding.yaml`, `adapt_process`) | depend | Existing engine, just needs to be triggered on first visit |
| Self speaks first | Brief 044, `cognitive/self.md` | depend | Existing `<first_session_signal>` mechanism |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/globals.css` | **Rewrite:** Replace all tokens with `.impeccable.md` palette (update source comment to reference `.impeccable.md`). **Critical: set `--color-accent` to emerald green `#059669` (NOT black) to preserve 83 existing accent usages.** Add `vivid` (#059669), `vivid-deep` (#3D5A48), `vivid-subtle` (#ECFDF5) as canonical token names. Foundation tokens: background (#EDEDF0), surface (#E2E2E6), surface-raised (#F9F9FB), border (#D5D5DA), border-strong (#BBBBC2). Text: text-primary (#111118), text-secondary (#4A4A55), text-muted (#65656F). Accent-subtle → #E7E7EB. Semantic: positive (#16a34a), caution (#D4960A), negative (#C4352A), info (#2563eb). Switch font from Inter to DM Sans. Update shadows to cool-tinted (rgba 26,26,26). Add dark mode token overrides via `@media (prefers-color-scheme: dark)` per `.impeccable.md` dark column (CSS custom property overrides only, no component-level `dark:` classes). |
| `packages/web/app/layout.tsx` | **Modify:** Update font import from Inter to DM Sans (Google Fonts or @fontsource). |
| `packages/web/app/setup/setup-wizard.tsx` | **Rewrite:** Match P23 prototype — 5 states (scanning, connection, model, API key, success), progress steps, icon-box connection cards, radio-dot model selection, dot particle canvas, pill-shaped CTA buttons. |
| `packages/web/app/setup/dot-particles.tsx` | **Create:** Reusable dot particle canvas component. Adopted from P23/P08 prototype JS. Canvas-based, IntersectionObserver for performance, respects `prefers-reduced-motion`. |
| `packages/web/app/day-zero.tsx` | **Create:** Day Zero welcome page (P08 spec). Green dot, "Hi. I'm Ditto." heading, intro paragraph, 4-point difference callout (typographic flow, left border, no card), "Let's get started" pill CTA. Staggered fade-in. Shown once after setup (flag in localStorage). |
| `packages/web/app/entry-point.tsx` | **Modify:** Remove the workspace gate. Flow: (1) check `dayZeroSeen` localStorage flag — if false, show DayZero component; (2) otherwise, always show WorkspacePage. Remove ConversationPage as standalone mode. Remove "See your workspace →" button. |
| `packages/web/app/conversation-page.tsx` | **Demote to internal component:** No longer a standalone entry point — audit imports first, then remove the standalone export. Conversation happens inside the workspace. Do NOT delete until confirming no other consumers import it. |
| `packages/web/lib/layout-state.ts` | **Simplify:** Remove `determineInitialMode`, `getSurfaceMode`, `setSurfaceMode`, `SurfaceMode` — workspace is always shown, no mode switching needed. Keep file if other exports remain, delete if empty. |
| `packages/web/lib/workspace-events.ts` | **Audit:** The `onProcessCreated` listener in entry-point.tsx is no longer needed (workspace is always shown). Remove the import and listener. Delete the file if `onProcessCreated` was its only export. |
| `packages/web/components/layout/workspace.tsx` | **Modify:** On first load for new user (no session, no processes), trigger onboarding — call `/api/chat` with an initial system message or use existing `<first_session_signal>` to make Self speak first. Ensure the workspace renders correctly with zero processes (empty sidebar categories already hidden per Brief 042). |
| `packages/web/components/self/prompt-input.tsx` | **Modify:** Update border-radius to capsule shape (`rounded-3xl` per `.impeccable.md`). Update colors to new tokens. |
| `packages/web/components/ui/button.tsx` | **Modify:** Default variant uses `rounded-full` (pill shape per `.impeccable.md`). Update color references. |

## User Experience

- **Jobs affected:** Orient (first impression, workspace navigation), Define (onboarding conversation starts process definition), Capture (immediate availability of quick capture)
- **Primitives involved:** Conversation Thread (available from start in workspace), Quick Capture (available from start), Daily Brief (empty state for new user — "Nothing to report yet, let's get to know each other")
- **Process-owner perspective:** "I opened Ditto. It looked clean and professional — not like another developer tool. Setup took 30 seconds (it found Claude on my machine). Then Ditto introduced itself and told me what makes it different. I clicked 'Let's get started' and landed in a workspace where Ditto asked about my business. I could already see the sidebar with navigation, even though nothing was populated yet. It felt like day one at a real job — the office is set up, my colleague is ready."
- **Interaction states:**
  - Setup: scanning (animated) → connection choice → model choice → (optional: API key) → success (animated)
  - Day Zero: staggered reveal (dot → heading → text → differentiators → CTA)
  - Workspace first load: sidebar visible (empty categories hidden), center shows conversation with Self speaking first, right panel collapsed
  - Empty feed: "Nothing here yet. As you and Ditto work together, your activity will appear here."
- **Designer input:** Not invoked — `.impeccable.md` and prototypes P23/P08/P00 serve as the complete design specification. No new UX research needed.

## Builder Guidance

### Critical: Token Semantic Shift (accent → vivid migration)

In `.impeccable.md`, the token naming is:
- `accent` = **black** (#111118) — generic UI controls, links
- `vivid` = **emerald green** (#059669) — brand signature, CTAs, Self dot, active states

In the **current** code, `accent` = terracotta — used for ALL brand-colored elements (Self dot, CTAs, active states, progress bars, focus rings). There are **83 uses of `bg-accent`/`text-accent`/`border-accent` across 38 files**, and only **5 uses of `vivid`** (sidebar only).

**Strategy: pragmatic two-phase approach.**

**Phase 1 (this brief):** Set `--color-accent` to **emerald green** (#059669) in globals.css, NOT black. This makes all 83 existing `bg-accent` uses render as green — which is correct for the vast majority (Self dot, CTAs, typing indicator, progress bars, focus rings). Add `--color-vivid`, `--color-vivid-deep`, `--color-vivid-subtle` as the canonical token names per `.impeccable.md`. In NEW code written for this brief (setup page, Day Zero), use `vivid` tokens directly.

**Phase 2 (follow-up brief):** Audit all 38 files and migrate `bg-accent` → `bg-vivid` where the intent is brand signature. Then set `accent` to black per `.impeccable.md`. This is a mechanical rename, not a design decision — defer it to avoid blocking the first-run experience.

**Why not do full migration now?** Because changing accent to black would break 83 usages across 38 files, turning every CTA, every Self dot, and every active indicator black. That audit-and-rename is a full session of work and should not block getting the first-run flow working.

### Implementation order (each step independently verifiable):

1. **Design tokens first** — rewrite `globals.css` (accent=green, add vivid tier, font=DM Sans, dark mode overrides) + update font in `layout.tsx`. After this step, every existing page should render with the new palette. Run `type-check` to verify no breakage.
2. **Setup page rebuild** — rewrite `setup-wizard.tsx`, create `dot-particles.tsx`. Use `vivid` tokens in new code. Verify by deleting `data/config.json` and loading `/setup`.
3. **Day Zero + entry-point changes** — create `day-zero.tsx`, simplify `entry-point.tsx`, clean up dead code in `layout-state.ts` and `workspace-events.ts`, demote `conversation-page.tsx`. Use `vivid` tokens in new code. Verify full first-run flow.
4. **Workspace first-load** — ensure Self speaks first, empty states work. Run `test:e2e`.

**Known limitation:** Day Zero shown-flag is stored in localStorage. If a user clears localStorage, they'll see Day Zero again. The onboarding process (`onboarding.yaml`) should be verified as idempotent — re-triggering should not create duplicate work items. If it's not idempotent, gate the trigger on whether an onboarding run already exists in the DB rather than relying on localStorage alone.

**Test updates:** Existing e2e tests may reference `ConversationPage`, the "See your workspace" button, or conversation-only mode. Audit and update affected tests to use the workspace-first flow.

## Acceptance Criteria

1. [ ] `globals.css` uses `.impeccable.md` foundation palette: `#EDEDF0` background, `#E2E2E6` surface, `#111118` text-primary, `#4A4A55` text-secondary, `#65656F` text-muted, `#D5D5DA` border — NOT the terracotta/warm palette
2. [ ] `--color-accent` is set to `#059669` (emerald green) — preserving all 83 existing accent usages as green (Phase 1 pragmatic mapping). Full accent→vivid migration is a follow-up brief.
3. [ ] Font is DM Sans throughout (not Inter) — loaded in layout.tsx
4. [ ] `vivid` (#059669), `vivid-deep` (#3D5A48), `vivid-subtle` (#ECFDF5) CSS custom properties exist. New code in this brief (setup, Day Zero) uses `vivid` tokens directly.
5. [ ] Dark mode tokens defined via `@media (prefers-color-scheme: dark)` in globals.css per `.impeccable.md` dark column (component-level dark mode NOT required)
6. [ ] Setup page has 5 states matching P23: scanning (with dot particle animation + CLI detection), connection choice (icon-box cards with detected/available badges), model choice (radio-dot selection), API key entry (for API key methods), success (with dot particles + "You're ready")
7. [ ] Setup page buttons are pill-shaped (`rounded-full`) with vivid green background
8. [ ] Setup page has progress steps indicator (1. Connect → 2. Model)
9. [ ] Dot particle canvas component exists, respects `prefers-reduced-motion`, uses IntersectionObserver
10. [ ] Day Zero page appears once after setup: green dot, "Hi. I'm Ditto." heading, intro text, 4-point difference callout, "Let's get started" CTA — matching P08 layout and animation
11. [ ] Day Zero page is not shown again after dismissal (localStorage flag)
12. [ ] After Day Zero, user lands in the full workspace (sidebar + center + right panel) — NOT bare conversation
13. [ ] Workspace renders correctly with zero processes: empty sidebar categories hidden, feed shows empty state, conversation available in center
14. [ ] Self speaks first for new users (existing `<first_session_signal>` mechanism triggers in workspace context)
15. [ ] Prompt input has capsule shape (`rounded-3xl`) per `.impeccable.md`
16. [ ] All existing e2e tests pass (`pnpm test:e2e`) — no functional regressions
17. [ ] Type check passes (`pnpm run type-check`)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Design tokens match `.impeccable.md` exactly (no drift, no holdover terracotta values)
   - No engine code changes (all changes in `packages/web/`)
   - Setup page states match P23 prototype
   - Day Zero matches P08 prototype
   - Workspace is always shown (no process-count gating)
   - Onboarding trigger works for new users
   - No functional regressions in existing features
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Delete config to simulate first-run
rm -f data/config.json

# 2. Start the app
pnpm dev

# 3. Open browser — expect /setup redirect
# Verify: cool grey background (#EDEDF0), DM Sans font, dot particles animating
# Verify: scanning state shows, then connection cards with detected/available badges
# Verify: progress steps visible (1. Connect → 2. Model)
# Verify: buttons are pill-shaped, vivid green

# 4. Complete setup (choose Claude CLI + model)
# Verify: success state with dot particles and "You're ready"

# 5. Click through — expect Day Zero page
# Verify: green dot, "Hi. I'm Ditto." heading, staggered fade-in
# Verify: 4-point difference callout with left border accent

# 6. Click "Let's get started" — expect workspace
# Verify: three-panel layout (sidebar + center + right panel)
# Verify: sidebar visible with navigation items
# Verify: Self speaking first in conversation
# Verify: no terracotta anywhere

# 7. Refresh page — Day Zero should NOT appear again
# Verify: straight to workspace

# 8. Run tests
pnpm run type-check
pnpm test:e2e
```

## After Completion

1. Update `docs/state.md` — design tokens aligned, first-run flow complete
2. Update `docs/roadmap.md` — Phase 10 gap closure noted
3. Retrospective: document why prototype→build gap occurred, add "integration brief" as a standard step in the dev process after any design phase
4. Consider: insight on "prototype spec ≠ implementation spec without explicit brief"
