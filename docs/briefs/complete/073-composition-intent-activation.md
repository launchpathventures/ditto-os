# Brief: Composition Intent Activation — Empty, Active, and Rich States

**Date:** 2026-04-01
**Status:** draft
**Depends on:** Brief 072 (Interactive ContentBlocks — create flows need editable blocks), Brief 069 (Rich Block Emission — active states need blocks to render)
**Unlocks:** Full workspace experience — user knows where to go and what to do from any entry point

## Goal

- **Roadmap phase:** Phase 13: Workspace Activation
- **Capabilities:** Composition intent states, Self context-awareness, four modalities per intent

## Context

Insight-134 identified that composition intents (Today, Inbox, Work, Projects, Routines, Roadmap) are empty containers — the user has no idea what to do. Insight-136 established that every intent is an entry point with four modalities (browse, create, template, converse). ADR-024 specifies deterministic composition for Phase 10 (no LLM latency).

Currently the sidebar exists, the navigation works, but clicking any item shows the same empty conversation surface. Ditto feels like a chat wrapper, not a workspace. This brief makes every intent show contextual content with clear action affordances.

## Objective

A new user clicking any sidebar item sees clear content (if items exist) or a clear path to action (if empty). Self is context-aware — conversations started from Routines are scoped to recurring processes; from Projects, to grouped work. Four modalities (browse, create, template, converse) are available where applicable.

## Non-Goals

- Rich states (Self-driven proactive intelligence like "Project X is stalled") — Phase 11+ per ADR-024
- Sidebar label redesign (needs Designer research — Insight-136 flags "Work" as vague)
- Template marketplace / pre-built templates (v2 — templates are manual for now)
- Mobile-specific intent rendering
- Custom composition intents (user-created views)
- Real-time updates / WebSocket push for intent content (polling or refresh is sufficient for v1)

## Inputs

1. `docs/adrs/024-composable-workspace-architecture.md` — deterministic composition, navigation as intent
2. `docs/adrs/010-workspace-interaction-model.md` — work items, meta-processes, system agents
3. `docs/insights/134-composition-intents-need-action-affordances.md` — design principle
4. `docs/insights/136-every-intent-is-an-entry-point.md` — four modalities
5. `docs/insights/135-forms-and-conversation-interleave.md` — action buttons route to conversation + forms
6. Prototypes: `docs/prototypes/13-daily-workspace.html`, `docs/prototypes/24-inbox.html`, `docs/prototypes/25-tasks.html`, `docs/prototypes/29-process-model-library.html`
7. `src/db/schema.ts` — workItems, processes, processRuns tables

## Constraints

- MUST use deterministic composition functions (no LLM calls for intent rendering — ADR-024 Phase 10)
- MUST pass intent context parameter to Self when conversation starts from an intent
- MUST render content as ContentBlocks (not hardcoded HTML components)
- MUST use existing block types from content-blocks.ts (no new types in this brief)
- MUST work with current data model (workItems, processes, processRuns)
- MUST show empty states using ActionBlock + TextBlock + SuggestionBlock (existing types)
- Four modalities where applicable: browse (always), create (always), template (where templates exist), converse (always)
- All existing tests pass (453+ unit, 14 e2e)
- `pnpm run type-check` passes

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Composition intents as views | ADR-024 composable workspace | extend | Existing architecture, proven concept |
| Empty states with CTAs | Linear app empty states | pattern | Clear, minimal, action-oriented |
| Context-aware AI conversation | Original to Ditto | original | Core differentiator — Self adapts to where user is |
| Deterministic composition | ADR-024 Phase 10 strategy | extend | No LLM latency for navigation |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/lib/composition-engine.ts` | Create: composition functions per intent — `composeToday()`, `composeInbox()`, `composeWork()`, `composeProjects()`, `composeRoutines()`, `composeRoadmap()` — each returns ContentBlock[] |
| `packages/web/lib/composition-empty-states.ts` | Create: empty state block factories per intent — TextBlock + ActionBlock + SuggestionBlock per intent |
| `packages/web/app/page.tsx` | Modify: route active composition intent to appropriate compose function, render returned blocks above conversation |
| `src/engine/self-stream.ts` | Modify: accept `intentContext?: string` parameter in `selfConverseStream()`, inject into Self system prompt |
| `cognitive/self.md` | Modify: add intent context awareness section — how to adapt intake classification and goal framing based on which intent the user is in |

## User Experience

- **Jobs affected:** Orient (Today, Inbox), Define (Projects, Routines), Capture (Work), Decide (Roadmap)
- **Primitives involved:** Daily Brief (Today), Review Queue (Inbox), Activity Feed (Work), Process Card (Routines/Projects), Process Graph (Roadmap)
- **Process-owner perspective:** Each sidebar item shows you what exists and what you can do. Empty means "here's how to start." Active means "here's what's happening." You can browse, create, or just type — and Self knows where you are.
- **Interaction states per intent:**

### Today
- **Empty:** "Good [morning/afternoon]. Nothing active yet." + ActionBlock: "What would you like to work on?" + SuggestionBlocks: "Start a project", "Set up a routine", "Ask me anything"
- **Active:** TextBlock greeting + RecordBlocks for items needing attention + ProgressBlocks for active work + SuggestionBlock for Self's recommendation

### Inbox
- **Empty:** "Nothing needs your attention right now." + TextBlock: "When processes need your review or input, they'll appear here."
- **Active:** ReviewCardBlocks for pending reviews + InputRequestBlocks for human steps + StatusCardBlocks for waiting items, sorted by urgency

### Work
- **Empty:** "No active work." + ActionBlock: "What do you need to get done?" + SuggestionBlocks: "Create a task", "Set a goal"
- **Active:** StatusCardBlocks grouped by status (in progress / waiting / completed today) + ProgressBlocks for goals

### Projects
- **Empty:** "No projects yet." + ActionBlock: "Start a project" + TextBlock: "Projects group related work, processes, and goals together."
- **Active:** RecordBlocks per project showing name, status, active work count, health indicator

### Routines
- **Empty:** "No routines yet." + ActionBlock: "Create a routine" + TextBlock: "Routines are recurring processes that run on a schedule."
- **Active:** RecordBlocks per routine showing name, schedule, last run, health, trust tier badge

### Roadmap
- **Empty:** "Create a project first to see your roadmap." + ActionBlock: "Start a project"
- **Active:** ProgressBlocks per project showing milestones, completion percentage, timeline

- **Designer input:** Not invoked — lightweight UX section. Prototypes P13, P24, P25, P29 as reference.

## Acceptance Criteria

1. [ ] `composeToday()` returns ContentBlocks: empty state when no data, active state with summary blocks when data exists
2. [ ] `composeInbox()` returns pending review/action items as ReviewCardBlocks + InputRequestBlocks
3. [ ] `composeWork()` returns active work items grouped by status as StatusCardBlocks
4. [ ] `composeProjects()` returns project summaries as RecordBlocks with health status
5. [ ] `composeRoutines()` returns routine cards as RecordBlocks with schedule and trust tier
6. [ ] `composeRoadmap()` returns project timeline as ProgressBlocks
7. [ ] Every empty state includes: explanatory TextBlock + primary ActionBlock + at least one SuggestionBlock
8. [ ] Primary ActionBlock click starts conversation with Self, passing intent context
9. [ ] `selfConverseStream()` accepts `intentContext` parameter and injects into Self's system prompt
10. [ ] Self adjusts intake classification based on intent (Routines → defaults to recurring process framing)
11. [ ] `cognitive/self.md` updated with intent context awareness guidance
12. [ ] Composition functions are deterministic — no LLM calls, pure data queries
13. [ ] All existing tests pass (453+ unit, 14 e2e), `pnpm run type-check` passes
14. [ ] Blocks render correctly when navigating between intents (no stale state)
15. [ ] Settings excluded from composition (scaffold per ADR-024, not canvas)
16. [ ] Intent navigation fires `composition_navigated` interaction events per Brief 056 interaction_events table

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review checks: Does this follow ADR-024 deterministic composition? Are composition functions pure data queries? Does intent context integrate cleanly with Self? Are empty states clear enough for Rob/Lisa personas?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Start the app with empty database
pnpm --filter web dev

# 2. Click each sidebar item — verify empty state with clear action
#    Today → greeting + "What would you like to work on?"
#    Inbox → "Nothing needs your attention"
#    Work → "No active work" + "Create a task" button
#    Projects → "No projects yet" + "Start a project" button
#    Routines → "No routines yet" + "Create a routine" button
#    Roadmap → "Create a project first"

# 3. Click "Create a routine" → verify conversation starts
# 4. Type "reconcile accounts weekly" → verify Self responds in routine context
#    (Self should mention schedule/recurring without being asked)

# 5. Create a work item manually, navigate to Work → verify it appears as StatusCardBlock
# 6. Create a process, navigate to Routines → verify it appears as RecordBlock
```

## After Completion

1. Update `docs/state.md` — Composition Intent Activation complete
2. Update `docs/human-layer.md` — document composition intent states (empty/active/rich)
3. Update `docs/roadmap.md` — Phase 13 milestone
4. Designer research queued: sidebar labeling persona testing (Insight-136)
5. Rich states (Self-driven proactive intelligence) deferred to Phase 11+ brief
