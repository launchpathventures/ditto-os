# Brief 055: Scope Selection + Roadmap Visualization

**Date:** 2026-03-29
**Status:** ready
**Depends on:** Brief 052 (Planning Workflow — Self can guide planning conversations and produce structured outputs)
**Unlocks:** User can select scope for pipeline work through the UI, roadmap/project state visible as compositions

## Goal

- **Roadmap phase:** Phase 10 — Web Dashboard (Composable Workspace Architecture, ADR-024)
- **Capabilities:** Roadmap visualization as composition, project/task state through blocks, scope selection for pipeline work

## Context

The user's primary workflow is: look at the roadmap → pick something to work on → hand it to the dev process. Currently this happens entirely in conversation ("Build Brief 050") with no visual representation of the roadmap, project state, or available scope.

The composition engine has 5 intents (Today, Inbox, Work, Projects, Routines). These produce ContentBlock[] from CompositionContext. The block vocabulary includes RecordBlock, InteractiveTableBlock, ChartBlock, MetricBlock, ChecklistBlock — all functional renderers. But no composition shows roadmap items, brief status, phase progress, or lets the user select scope for work.

The Self also has `plan_with_role` (Brief 052) which can read project docs. But the user has no visual surface to see "what briefs exist, which are ready, which are in progress, what's the phase progress."

### What Blocks Can Do

| Block | Roadmap use |
|-------|-------------|
| RecordBlock | Phase or brief as structured record with status, fields, actions |
| InteractiveTableBlock | List of briefs with status, dependencies, select action |
| ChartBlock (donut) | Phase completion breakdown |
| MetricBlock | Brief counts (ready/in-progress/complete), phase progress |
| ChecklistBlock | Phase milestones as pass/fail checklist |
| ProgressBlock | Active pipeline progress (from Brief 053) |

All renderers exist and are functional. The gap is a composition function that produces these blocks from project data.

## Objective

Add a "Roadmap" composition intent that visualizes project phases, briefs, and their status. Let the user select a brief or task from the composition and hand it to the pipeline — closing the loop between planning output (Brief 052) and execution input (Brief 053).

## Non-Goals

- Editing roadmap items through the UI — roadmap is edited by Architect role via docs
- Gantt charts or complex timeline views — use existing block types only
- Cross-project roadmap (multiple repos) — single project focus
- Brief content rendering in the composition — brief content is viewed via artifact mode
- Process graph visualization (step dependencies within a pipeline) — separate concern

## Inputs

1. `packages/web/lib/compositions/types.ts` — CompositionIntent, CompositionContext types
2. `packages/web/lib/compositions/index.ts` — composition registry
3. `packages/web/lib/compositions/projects.ts` — existing Projects composition (reference pattern)
4. `packages/web/lib/composition-context.ts` — context assembly
5. `src/engine/content-blocks.ts` — block types available
6. `packages/web/components/blocks/block-registry.tsx` — block renderers
7. `packages/web/components/layout/workspace.tsx` — sidebar nav, CenterView, composition routing
8. `docs/roadmap.md` — roadmap structure (phases, capabilities, status)
9. `docs/state.md` — current state structure
10. `docs/briefs/` — existing briefs with status lifecycle
11. `docs/adrs/024-composable-workspace-architecture.md` — composition engine spec, intent model

## Constraints

- **Composition function, not bespoke dashboard.** The roadmap view is a composition function that produces ContentBlock[] from context. No custom React components for the roadmap — it renders through BlockList like every other composition.
- **Data comes from the engine, not file parsing.** Roadmap data must be available through the API. This means either: (a) briefs/roadmap items are tracked as work items with metadata, or (b) a lightweight API endpoint parses `docs/briefs/` and `docs/roadmap.md` and returns structured data. Option (b) is simpler for MVP since briefs are already files with frontmatter. Brief index uses mtime-based cache invalidation (checks file modification times on each request, no file watcher needed for MVP).
- **Lazy context loading for roadmap data.** The roadmap data is only needed when the `roadmap` intent is active. Use a conditional React Query hook: `useRoadmapData()` enabled only when `intent === "roadmap"`. The hook result is merged into `CompositionContext` by the context assembly code. Other intents (Today, Work, Projects) don't pay the cost of fetching roadmap data. React Query's stale-while-revalidate ensures the data refreshes on each navigation to the Roadmap intent.
- **Scope selection triggers conversation.** When the user selects a brief from the roadmap composition, the action produces a pre-filled message in the conversation input ("Build Brief 050: ArtifactBlock + Markdown Rendering"). The Self then routes appropriately (start_pipeline for execution, plan_with_role for planning). The Self's delegation guidance (updated in Briefs 052/053) already recognizes "Build Brief N" as execution intent and "Plan Brief N" as planning intent — no additional intent recognition needed. Selection events are logged for future learning layer consumption.
- **Block actions route through existing `onAction` system.** InteractiveTableBlock and RecordBlock support actions. Actions flow through the block registry's `onAction` callback, which the workspace handles.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Composition pattern | `compositions/projects.ts` | pattern | Extending existing composition system |
| Brief metadata parsing | Markdown frontmatter (gray-matter) | depend | Standard frontmatter parsing, already a pattern in the project |
| Scope selection as conversation input | Claude Artifacts "use in chat" action | pattern | Selection triggers conversation, not direct execution |
| Roadmap as block composition | GitHub Projects board view | pattern | Structured view of work items with status |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/brief-index.ts` | Create: Brief indexing function. Scans `docs/briefs/` directory, parses frontmatter (name, status, depends-on, unlocks, date), returns `BriefSummary[]`. Cached with file-modification-time invalidation. Used by API endpoint and composition context. |
| `packages/web/app/api/roadmap/route.ts` | Create: API endpoint `GET /api/roadmap`. Returns `{ phases: Phase[], briefs: BriefSummary[], stats: { total, ready, inProgress, complete } }`. Phases parsed from `docs/roadmap.md` header structure. Briefs from `brief-index.ts`. |
| `packages/web/lib/composition-context.ts` | Modify: Add `roadmap?: RoadmapData` to `CompositionContext`. `RoadmapData`: `{ phases: Phase[], briefs: BriefSummary[], stats: object }`. Populated from `/api/roadmap` endpoint. Fetched when Roadmap intent is active (lazy — not loaded for other intents). |
| `packages/web/lib/compositions/roadmap.ts` | Create: Roadmap composition function. Produces ContentBlock[]: (1) MetricBlock row — brief counts by status (ready/in-progress/complete). (2) For each active phase: RecordBlock with phase name, status, progress. (3) InteractiveTableBlock listing briefs in current/next phase — columns: number, name, status, depends-on. Row action: "Select" which emits a conversation pre-fill. (4) ChecklistBlock for completed phases. |
| `packages/web/lib/compositions/types.ts` | Modify: Add `"roadmap"` to `CompositionIntent` union type. |
| `packages/web/lib/compositions/index.ts` | Modify: Register `roadmap` composition function in the intent → function map. |
| `packages/web/components/layout/workspace.tsx` | Modify: Add "Roadmap" nav item to sidebar. Map to `roadmap` composition intent. Handle `select-brief` action from InteractiveTableBlock — pre-fill conversation input with "Build Brief {number}: {name}" or "Plan Brief {number}: {name}" depending on brief status. |

## User Experience

- **Jobs affected:** Orient (primary — understanding what's available to work on), Delegate (selecting scope for pipeline), Define (seeing planning outputs as briefs in the roadmap)
- **Primitives involved:** Navigation (Primitive 14 — sidebar nav to Roadmap), Composition Canvas (Primitive 2 — roadmap as BlockList), Conversation Stream (Primitive 1 — scope selection triggers conversation)
- **Process-owner perspective:** The user clicks "Roadmap" in the sidebar. They see metrics (12 briefs: 4 ready, 3 in progress, 5 complete), the current phase with a progress indicator, and a table of briefs with status. They click "Select" on Brief 050. The conversation input pre-fills with "Build Brief 050: ArtifactBlock + Markdown Rendering." They hit send. The Self recognizes this as execution and triggers the pipeline (Brief 053). If they select a draft brief, the pre-fill says "Plan Brief 056: ..." and the Self enters planning mode (Brief 052).
- **Interaction states:**
  - **Loading:** Skeleton blocks while `/api/roadmap` fetches
  - **Empty:** "No briefs found" with action to start planning conversation
  - **Active:** Metric row + phase records + brief table + completed checklist
  - **Selection:** Brief row highlights, conversation input pre-fills, user confirms by sending
- **Designer input:** Not invoked — roadmap composition uses existing block renderers (MetricBlock, RecordBlock, InteractiveTableBlock, ChecklistBlock). No new visual components.

## Acceptance Criteria

1. [ ] `brief-index.ts` scans `docs/briefs/` and `docs/briefs/complete/`, parses frontmatter, returns `BriefSummary[]` with number, name, status, dependsOn, unlocks, date.
2. [ ] `/api/roadmap` endpoint returns phases (from roadmap.md), briefs (from brief-index), and stats (counts by status).
3. [ ] `CompositionContext` includes optional `roadmap: RoadmapData` field, populated when `roadmap` intent is active.
4. [ ] `roadmap.ts` composition produces: MetricBlock (brief counts), RecordBlock per active phase (name, status, brief count), InteractiveTableBlock (briefs in current/next phase with status, dependencies, select action), ChecklistBlock (completed phases).
5. [ ] `"roadmap"` added to `CompositionIntent` union and registered in composition index.
6. [ ] Sidebar nav includes "Roadmap" item. Clicking it renders the roadmap composition in the center canvas.
7. [ ] InteractiveTableBlock "Select" action pre-fills conversation input. Ready briefs pre-fill with "Build Brief {N}: {name}". Draft briefs pre-fill with "Plan Brief {N}: {name}".
8. [ ] Roadmap composition updates when briefs change status (brief-index cache invalidation).
9. [ ] `pnpm run type-check` passes with 0 errors.
10. [ ] Existing compositions (Today, Inbox, Work, Projects, Routines) continue to work unchanged.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - **Composability**: Roadmap renders through BlockList via composition function. No bespoke dashboard components.
   - **Engine integration**: Brief indexing follows codebase tool patterns. API endpoint follows existing `/api/processes` pattern.
   - **Data flow**: Context populated from API, composition produces blocks, blocks render through registry. No state hacks.
   - **Scope selection**: Action flows through conversation (not direct pipeline trigger). Consistent with user-as-decision-maker principle.
   - No regressions to existing compositions or navigation.
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Type-check
cd /Users/thg/conductor/workspaces/agent-os/paris
pnpm run type-check

# 2. Run tests
pnpm test

# 3. Start web app
pnpm dev

# 4. Navigate to Roadmap in sidebar
#    Verify: MetricBlock shows brief counts
#    Verify: Current phase shown as RecordBlock
#    Verify: Brief table shows briefs with status

# 5. Select a brief
#    Click "Select" on Brief 050
#    Verify: Conversation input pre-fills with "Build Brief 050: ..."
#    Send the message
#    Verify: Self routes to start_pipeline (Brief 053)

# 6. Select a draft brief
#    Click "Select" on a draft brief
#    Verify: Pre-fills with "Plan Brief N: ..."
#    Verify: Self routes to plan_with_role (Brief 052)

# 7. Existing nav
#    Click Today, Work, Projects
#    Verify: All render correctly (no regression)
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark "Scope Selection + Roadmap Visualization" as done
3. Update `docs/architecture.md` — add Roadmap to the view compositions table (currently lists 8 views that don't include Roadmap). Document composition intents as the canonical navigation model.
4. Check `docs/adrs/024-composable-workspace-architecture.md` — add addendum if the ADR fixed the intent list at five; adding a sixth (roadmap) is a deviation that should be recorded.
5. Phase retrospective: Is the file-based brief index sufficient or should briefs become database entities? Is the roadmap.md parsing robust enough? Is the lazy context loading pattern worth standardizing?
6. Phase 10 retrospective: All six briefs (050-055) complete. Is the dev process usable end-to-end through the web UI? What's missing for Phase 11?
