# Brief: Phase 10+ — Composition Engine

**Date:** 2026-03-27
**Status:** approved
**Depends on:** Brief 045 (Component Protocol — block registry), Brief 046 (Workspace Transitions — right panel), ADR-024 (Composable Workspace Architecture)
**Unlocks:** Self-driven composition (Phase 11+), artifact mode layout (Brief 048), Live Preview viewer (Brief 049)

## Goal

- **Roadmap phase:** Phase 10+: Composition Engine — from pages to composed surfaces
- **Capabilities:** Navigation-as-composition-intent, deterministic composition functions, must-show blocks, sidebar navigation alignment with prototypes

## Context

The web app (Briefs 039-046) works but routes navigation to fixed React pages: `{ type: "feed" }` renders `<Feed />`, `{ type: "process" }` renders `<ProcessDetailContainer />`. This is page-based routing — the opposite of ADR-024's composition architecture.

ADR-024 established that every navigation destination (except Settings) is a **composition intent** — a signal to assemble `ContentBlock[]` from context, not a page to render. The 28 prototypes are composition references — visual targets for what specific compositions should look like, not screens to hardcode.

The current sidebar has "Home / To Review / Running / How It Works" (urgency-first, Brief 042). The prototypes (P00 v2, all 11 workspace prototypes) use "Today / Inbox / Work / Projects / Routines / Settings" (ADR-024 Section 2). This brief aligns the built code with the prototyped design.

**What exists (built in 039-046):**
- Three-panel layout with sidebar, centre, right panel
- 21 block renderers with exhaustive switch registry (`block-registry.tsx`)
- Feed assembler (`feed-query.ts`, `feed-types.ts`) producing 6 item types
- Process detail (3 variants) with React Query hooks
- Right panel context switching via `TRANSITION_TOOL_MAP`
- Conversation messages rendering between feed and input
- Surface mode persistence (conversation / workspace)

**What's missing (this brief):**
- Composition functions — pure TypeScript functions returning `ContentBlock[]` per intent
- Composition intent router — replaces the `CenterView` discriminated union page switch
- Sidebar navigation update — Today/Inbox/Work/Projects/Routines/Settings
- Must-show block insertion — critical alerts and trust gate reviews at top
- Fallback composition — error handling when composition fails

## Objective

Replace the page-based centre panel (`Feed` or `ProcessDetailContainer`) with a composition engine where each navigation destination triggers a composition function that returns `ContentBlock[]`, rendered by the existing block registry. The result should look visually identical to today — same blocks, same data, same layout — but architecturally ready for Self-driven composition in Phase 11+.

## Non-Goals

- Self-driven composition (Phase 11+ — LLM decides what blocks to show)
- Artifact mode layout transition (Brief 048 — conversation | artifact | context three-column)
- Live Preview viewer (Brief 049 — the extension seam)
- New block types (the 21 existing types are sufficient for MVP compositions)
- Process Builder visual editor (conversation-first remains the MVP path)
- Settings page redesign (Settings IS a fixed page per ADR-024 — scaffold, not canvas)
- Mobile-specific compositions (responsive breakpoints unchanged from Brief 042)

## Inputs

1. `docs/adrs/024-composable-workspace-architecture.md` — the three-tier model, composition intents, must-show blocks
2. `packages/web/components/layout/workspace.tsx` — current page-based centre panel routing
3. `packages/web/components/layout/sidebar.tsx` — current sidebar navigation (needs update)
4. `packages/web/lib/block-registry.ts` — exhaustive block renderer (unchanged, consumed by composition)
5. `packages/web/lib/feed-types.ts` — feed item types (feed assembler becomes input to `composeToday`)
6. `packages/web/lib/process-query.ts` — React Query hooks for process data
7. `.impeccable.md` — design system spec, sidebar nav labels
8. Prototype references per composition:
   - **Today:** P13 (daily workspace), P12 (morning mobile)
   - **Inbox:** P24 (inbox — Lisa, urgency grouping, triage donuts)
   - **Work:** P25 (tasks — Jordan, progress bars, filter tabs)
   - **Projects:** P19 (multi-process workspace), P27 (process flow map)
   - **Routines:** P14 (process detail), P31 (process health), P29 (process model library)
   - **Settings:** P32 (settings)

## Constraints

- No custom React components in the centre canvas — everything rendered in the centre column MUST be a `ContentBlock` from the registry (ADR-024 Constraint 1)
- Composition functions are pure TypeScript — no LLM calls, no async beyond data fetching (ADR-024 MVP strategy)
- First meaningful paint within 200ms of navigation (ADR-024 performance budget)
- Existing feed assembler, process detail, and conversation code is refactored into compositions — not deleted and rewritten
- Must-show blocks cannot be suppressed — `AlertBlock` with severity `error`/`critical` and `ReviewCardBlock` at trust gate always appear (ADR-024 Constraint 5)
- `ProcessDetailContainer` is a **scaffold layout mode** (same tier as artifact mode in ADR-024). When a user drills into a specific process, the centre canvas switches from composed blocks to the process detail scaffold view. This is a layout mode transition (like workspace → artifact mode), not a composition. ADR-024 Constraint 1 ("no custom React components in the centre canvas") applies to canvas-tier compositions; scaffold layout modes are explicitly Tier 1 and render as standard React. This parallels how Settings is also a scaffold page, not a composition.
- Conversation messages are **scaffold elements** rendered outside the composition — they appear below the composed `ContentBlock[]` and above the input bar. They are NOT ContentBlocks within the composition. This distinction matters for Phase 11+ when the Self drives composition: the Self composes the block area, conversation remains fixed scaffold.
- Conversation input bar stays at bottom of centre column regardless of composition (scaffold)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Composition intent pattern | ADR-024 (original to Ditto) | — | Navigation as intent, not page |
| Deterministic composition | ADR-024 MVP strategy | — | Pure functions, no LLM latency |
| Block registry rendering | ADR-021, Brief 045 | — | Exhaustive switch renderer |
| Feed assembler as input | Brief 041 | — | Feed items become composition input |
| Must-show blocks | ADR-024 Constraint 5 | — | Harness pattern: never suppress critical items |
| Navigation labels | P00 v2 prototype, .impeccable.md | — | Today/Inbox/Work/Projects/Routines/Settings |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/lib/compositions/index.ts` | Create: composition intent router — maps navigation intent to composition function |
| `packages/web/lib/compositions/today.ts` | Create: `composeToday(context)` → `ContentBlock[]` — morning brief, pending reviews, active work, risks |
| `packages/web/lib/compositions/inbox.ts` | Create: `composeInbox(context)` → `ContentBlock[]` — incoming items grouped by urgency |
| `packages/web/lib/compositions/work.ts` | Create: `composeWork(context)` → `ContentBlock[]` — active work items with progress |
| `packages/web/lib/compositions/projects.ts` | Create: `composeProjects(context)` → `ContentBlock[]` — goal-level items with decomposition |
| `packages/web/lib/compositions/routines.ts` | Create: `composeRoutines(context)` → `ContentBlock[]` — process health, trust, metrics |
| `packages/web/lib/compositions/must-show.ts` | Create: `getMustShowBlocks(context)` → `ContentBlock[]` — critical alerts + trust gate reviews |
| `packages/web/lib/compositions/types.ts` | Create: `CompositionContext` type, `CompositionIntent` union, `CompositionResult` |
| `packages/web/components/layout/workspace.tsx` | Modify: replace `CenterView` page switch with composition intent router + block rendering |
| `packages/web/components/layout/sidebar.tsx` | Modify: update navigation items to Today/Inbox/Work/Projects/Routines/Settings per prototypes |
| `packages/web/components/layout/composed-canvas.tsx` | Create: renders `ContentBlock[]` from composition function via block registry, with must-show blocks prepended |
| `packages/web/lib/composition-context.ts` | Create: assembles `CompositionContext` from React Query data (processes, work items, feed items, user model) |

## User Experience

- **Jobs affected:** Orient (Today composition), Review (Inbox composition, must-show blocks), Delegate (Work composition)
- **Primitives involved:** Daily Brief (Today), Activity Feed (Inbox/Today), Process Card (Routines), Trust Control (Routines drill-down)
- **Process-owner perspective:** The user sees no change — same blocks, same data, same visual result. Navigation labels update to match prototypes (Today/Inbox/Work/Projects/Routines/Settings). The architectural change is invisible.
- **Interaction states:**
  - **Loading:** Composition function returns empty → show skeleton blocks (existing pattern)
  - **Empty:** Composition returns zero blocks (e.g., Inbox with nothing) → show `TextBlock` with helpful message ("Nothing needs your attention")
  - **Error:** Composition function throws → fallback composition (conversation input + error `TextBlock`)
  - **Content:** Normal — blocks render via block registry
- **Designer input:** Not invoked — this is an architectural refactor with no visual change. Prototype visual targets are the design reference.

## Acceptance Criteria

1. [ ] `packages/web/lib/compositions/` directory exists with composition functions for all 5 canvas intents (Today, Inbox, Work, Projects, Routines). **MVP implementation depth:** `composeToday()` and `composeRoutines()` are full implementations matching prototype visual targets. `composeInbox()`, `composeWork()`, and `composeProjects()` are functional but may produce simpler compositions until the engine data models mature — they must still return valid `ContentBlock[]` from available data, not placeholder "coming soon" text.
2. [ ] Each composition function is a pure TypeScript function: takes `CompositionContext`, returns `ContentBlock[]`, no LLM calls
3. [ ] `CompositionContext` type includes: active processes, work items, feed items, pending reviews, user model summary, current risks
4. [ ] Sidebar navigation shows exactly: Today, Inbox (with count badge), Work, Projects, Routines, Settings — matching P00 v2 prototype labels
5. [ ] Clicking a sidebar nav item sets a composition intent, not a page route — the centre canvas renders the composition function's output via block registry
6. [ ] `composeToday()` produces blocks matching P13 visual pattern: brief narrative (`TextBlock`), pending reviews (`ReviewCardBlock`), active processes (`StatusBlock`/`MetricBlock`), risks (`AlertBlock`)
7. [ ] `composeInbox()` produces blocks matching P24: incoming items grouped by urgency (`RecordBlock` with priority, `MetricBlock` for triage stats)
8. [ ] `composeWork()` produces blocks matching P25: active work items (`RecordBlock` with progress, `ProgressBlock`)
9. [ ] `composeProjects()` produces blocks matching P19: goal-level items with process associations (`StatusBlock`, `RecordBlock`)
10. [ ] `composeRoutines()` produces blocks matching P14/P31: process list with health metrics (`MetricBlock`, `ChartBlock` sparklines, `StatusBlock` trust levels)
11. [ ] Must-show blocks prepend to any composition: `AlertBlock` with `severity: "error" | "critical"` and `ReviewCardBlock` at trust gate appear at top regardless of intent
12. [ ] Fallback composition works: if composition function throws or returns empty array, centre renders conversation input + `TextBlock` with "I'm having trouble loading this view. Try asking me directly."
13. [ ] Clicking a process in Routines navigates to `ProcessDetailContainer` (drill-down — scaffold component, not a composition)
14. [ ] Conversation messages render as scaffold elements below composed blocks and above input bar — they are NOT ContentBlocks within the composition (Brief 046 pattern preserved, scaffold/canvas boundary explicit)
15. [ ] Right panel context adapts per composition intent (extends existing `panelContext` pattern)
16. [ ] First paint after navigation click is <200ms when React Query cache is warm (composition functions are synchronous transforms of cached data). On cold cache (first load, cache invalidation), composition shows skeleton loading state until data arrives — skeleton renders within 50ms, data fills in when available.
17. [ ] `pnpm run type-check` passes with zero new errors

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/adrs/024-composable-workspace-architecture.md`
2. Review agent checks: ADR-024 compliance, block registry exhaustiveness preserved, scaffold vs canvas boundary respected, must-show blocks enforced, no LLM calls in compositions, performance budget met
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Start the app
cd packages/web && pnpm dev

# 2. Open http://localhost:3000
# 3. Sidebar shows: Today, Inbox, Work, Projects, Routines, Settings
# 4. Click "Today" — centre shows composed blocks (brief, reviews, metrics)
# 5. Click "Inbox" — centre shows incoming items grouped by urgency
# 6. Click "Work" — centre shows active work items with progress
# 7. Click "Routines" — centre shows process list with health metrics
# 8. Click a process in Routines — drills into ProcessDetailContainer
# 9. Conversation input always visible at bottom
# 10. Create a critical alert condition → must-show block appears at top of any view
# 11. Navigation between views feels instant (<200ms)
```

## After Completion

1. Update `docs/state.md` with composition engine completion
2. Update `docs/roadmap.md` — Phase 10+ status
3. Update Brief 038 parent brief: add composition engine reference, note ADR-024 compliance
4. Note: Artifact mode layout (Brief 048) and Live Preview viewer (Brief 049) are now unblocked
