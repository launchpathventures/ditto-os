# Brief: Phase 10d — Navigation & Detail

**Date:** 2026-03-24
**Status:** draft
**Depends on:** Brief 041 (Feed & Review)
**Unlocks:** — (completes the workspace surface)

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard
- **Capabilities:** Left sidebar navigation, process detail views (living roadmap + domain process + process runner), activity log component, trust control surface, engine view (developer mode), three-panel layout, progressive reveal transition

## Context

Briefs 039-041 deliver conversation + feed. This brief composes them into the full workspace: sidebar for navigation, center panel switching (feed ↔ process detail), right panel for Self, and the progressive reveal that transitions from conversation-only to three-panel layout.

## Objective

The workspace layout with sidebar navigation ("My Work" / "Recurring" / "How It Works"), process detail drill-in (two variants), trust control in natural language, engine transparency view, and the Self's progressive reveal of the workspace when volume demands it.

## Non-Goals

- Capability map content ("How It Works" is a placeholder link in MVP)
- Mobile-specific layouts (responsive down to tablet only)
- Team management views (Phase 13)
- Full Process Builder visual editor (conversation-first is the MVP path)

## Inputs

1. `docs/briefs/038-phase-10-mvp-architecture.md` — layout section
2. `docs/research/phase-10-mvp-dashboard-ux.md` — sections 4, 5, 3.4-3.7
3. `packages/web/components/feed/` — feed from Brief 041
4. `packages/web/components/self/` — conversation from Brief 039
5. `src/engine/trust-diff.ts` — existing trust evaluation

## Constraints

- MUST use shadcn/ui Sidebar component for left navigation
- MUST use user language in sidebar: "My Work" / "Recurring" / "How It Works" — never "Active Processes" or "Process Graph"
- MUST hide empty sidebar categories (not show hollow sections)
- MUST support progressive reveal: conversation-only → three-panel (Self introduces workspace via conversation)
- MUST implement Engine View as a developer-only toggle (not visible to end users by default)
- MUST use natural language for trust control: "Check everything" / "Check a sample" / "Let it run"
- MUST NOT show trust tier names (supervised/spot-checked/autonomous) in the user-facing UI

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Sidebar | shadcn/ui Sidebar | depend | Collapsible, responsive |
| Three-column layout | Paperclip, Cursor | pattern | Adapted for progressive reveal |
| Process runner (stepped wizard) | Hark (gethark.ai) | pattern | Stepped navigation for multi-step human processes. Adapted for Ditto's composable model |
| Activity log (unified timeline) | Hark (gethark.ai) | pattern | Human+system actions in one timeline. Adapted as reusable catalog component per Insight-086 |
| Trust control in natural language | Original to Ditto | — | UX spec section 5.3 |
| Engine View | Original to Ditto | — | UX spec section 3.6 |
| Progressive reveal | Original to Ditto | — | UX spec section 5 |
| Plan/Task components | AI SDK Elements | adopt | Living roadmap display |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/layout/workspace.tsx` | Create: three-panel layout (sidebar + center + right) |
| `packages/web/components/layout/sidebar.tsx` | Create: left sidebar with My Work / Recurring / How It Works |
| `packages/web/components/layout/right-panel.tsx` | Create: right panel (collapsible) with Self conversation |
| `packages/web/components/detail/process-detail.tsx` | Create: process detail container (routes to 3 variants: living-roadmap, domain-process, or process-runner based on process state) |
| `packages/web/components/detail/living-roadmap.tsx` | Create: generated process steps (✓ done, ● in progress, ○ pending) |
| `packages/web/components/detail/domain-process.tsx` | Create: recurring process view (how it works + how it's going) |
| `packages/web/components/detail/process-runner.tsx` | Create: stepped process runner — sidebar step navigation (✓/→/⚠/○) + current step content area. Third process detail variant for active instances with 2+ pending human steps. Provenance: Hark stepped-wizard pattern (gethark.ai), adapted for Ditto's composable model |
| `packages/web/components/detail/activity-log.tsx` | Create: reusable activity timeline — unified human+system actions, per-entry expandable detail, filterable ("All" / "Mine" / "Ditto's"). Appears in both process detail variants + process runner. Provenance: Hark activity log pattern (gethark.ai) |
| `packages/web/components/detail/trust-control.tsx` | Create: natural language trust slider with evidence data |
| `packages/web/components/detail/engine-view.tsx` | Create: collapsible engine metadata (routing, memory, cost, timing) |
| `packages/web/lib/layout-state.ts` | Create: state management for layout mode (conversation-only vs workspace), user preference persistence |
| `packages/web/app/page.tsx` | Modify: entry point routing now renders conversation-only OR workspace based on state |
| `packages/web/app/process/[id]/page.tsx` | Create: process detail page (renders in center panel) |

## User Experience

- **Jobs affected:** Orient (sidebar status, activity log), Delegate (trust control, activity log evidence), Review (process runner step content), Capture (process runner input steps), Decide (engine transparency)
- **Primitives involved:** Process Card (sidebar compact + detail expanded), Trust Control (natural language), Performance Sparkline, Plan/Task (living roadmap), Activity Log (unified timeline — new catalog component)
- **Process-owner perspective:** Rob clicks "Quoting" in sidebar → sees "How it works" (7 steps in plain English) + "How it's going" (34 quotes, 91% clean, sparkline trending up) + "How closely do you watch this?" slider + activity log showing recent actions. When Rob has a multi-step quote to work through, the process runner shows him where he is (materials ✓ → labour → now → review → approve). Jordan toggles Engine View → sees routing decisions, agent cost, memory assembly for each run.
- **Interaction states:**
  - *Sidebar single-process:* One item under "Recurring." Natural, not sparse.
  - *Sidebar empty categories:* Hidden entirely.
  - *Process detail loading:* Skeleton steps + sparkline.
  - *Trust control:* Slider + evidence narrative + safety net explanation.
  - *Engine View off (default):* Not visible, no space used.
  - *Engine View on:* Subtle footer on feed cards, expanded section in process detail.
  - *Progressive reveal:* Self says "Want to see everything in one view?" → workspace appears with animation.
  - *Process runner loading:* Skeleton step list + loading indicator in content area.
  - *Process runner step complete:* ✓ icon, muted style, clickable to review what happened.
  - *Process runner step current (human):* → icon, highlighted, content area shows the action needed.
  - *Process runner step current (agent):* Animated indicator "Working...", content shows progress or partial output.
  - *Process runner step failed:* ⚠ icon (amber), error in user language, actions: "Try again" / "Skip" / "Ask Ditto".
  - *Process runner all complete:* Outcome view (decision output variant if applicable).
  - *Activity log empty:* "No activity yet."
  - *Activity log filtered:* Only selected actor's actions visible.
- **Designer input:** UX spec sections 3.4-3.7 (sidebar, detail, trust, engine view), 5 (entry point logic), `hark-patterns-brief-cross-reference-ux.md` (Upgrades 1, 3)

## Acceptance Criteria

1. [ ] Sidebar renders "My Work" (active work items with status dots) and "Recurring" (domain processes with health indicators)
2. [ ] Sidebar items use user's names (from work item/process `name` field), not system IDs
3. [ ] Empty sidebar categories are hidden (not shown as hollow sections)
4. [ ] Clicking sidebar item navigates center panel to process detail (with back button to feed)
5. [ ] Living roadmap variant: shows steps with ✓/●/○ icons, current step narration, activity log component
6. [ ] Domain process variant: shows "How it works" (plain language steps), "How it's going" (metrics + sparkline), activity log component
7. [ ] Process runner variant: when a process instance has 3+ pending human steps, center panel shows stepped navigation (sidebar with domain-named steps using ✓/→/⚠/○ icons) + current step content area. User can navigate between completed steps to review. State preserved when user leaves mid-process. (Threshold is a default — the Self may offer the runner for any process with sequential human steps when context suggests it.)
8. [ ] Activity log component: unified timeline of human + system actions per process instance. Each entry shows: when, what changed, who (user name or "Ditto"), expandable detail. Filterable: "All" / "Mine" / "Ditto's". Appears in living roadmap, domain process, and process runner variants. Data sourced from activities + stepRuns + trustChanges tables.
9. [ ] Trust control renders as natural language slider: "Check everything" ↔ "Let it run" with current position
10. [ ] Trust control shows evidence data as narrative (not metrics table): "31 approved without changes (91%)"
11. [ ] Trust control changes go through `trust-diff.ts` server-side, require user confirmation
12. [ ] Engine View toggle (hidden by default, enabled via settings or keyboard shortcut)
13. [ ] Engine View active: feed cards show footer with routing/agent/cost/timing; process detail shows full execution trace
14. [ ] Three-panel layout: sidebar (w-64) + center (flex-1) + right panel (w-80, collapsible)
15. [ ] Progressive reveal: new users see conversation-only; Self can trigger workspace transition; user preference persisted
16. [ ] Responsive breakpoints (UX spec 3.7): ≥1280px full three-panel; 1024–1279px sidebar collapses to icon rail; <1024px Self panel becomes overlay/drawer, sidebar becomes hamburger
17. [ ] User preference for surface mode (conversation vs workspace) persisted in DB (user_preferences table or self-scoped memory)

## Review Process

1. Spawn review agent with architecture.md + review-checklist.md + this brief + UX spec
2. Review checks: user language throughout, trust control goes through engine, Engine View doesn't leak to non-dev users, progressive reveal works, process runner activates for correct process states, activity log data sourced server-side
3. Present + review to human

## Smoke Test

```bash
# 1. Open app as established user (has processes)
# 2. Self suggests workspace or user clicks toggle
# Expected: Three-panel layout appears with sidebar, feed, Self panel

# 3. Sidebar shows processes under "Recurring" with ✓ indicators
# 4. Click a process → center panel shows process detail
# Expected: "How it works" in plain language, "How it's going" with sparkline

# 5. Click "How closely do you watch this?"
# Expected: Natural language trust slider with evidence

# 6. Toggle Engine View (via settings or keyboard shortcut)
# 7. Return to feed → cards show engine metadata footer
# Expected: Routing decision, agent, cost, timing visible

# 8. Open app as new user (no processes)
# Expected: Full-screen conversation only, no sidebar or feed

# 9. Open a process instance with multiple pending human steps
# Expected: Process runner view with stepped navigation + current step content

# 10. Navigate to completed step in runner
# Expected: Can review what happened at that step

# 11. Check activity log in process detail
# Expected: Unified timeline, human + system actions, filterable, expandable details
```

## After Completion

1. Update `docs/state.md` — navigation and detail shipped, workspace complete
2. Phase 10 workspace surface is complete (pending Brief 043 for proactive intelligence)
