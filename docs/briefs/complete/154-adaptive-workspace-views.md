# Brief 154: Adaptive Workspace Views — Domain-Driven Compositions + Network Push

**Date:** 2026-04-14
**Status:** draft
**Depends on:** Brief 089 (workspace seed + SSE), Brief 140 (growth composition intent), Brief 148 (frontdoor-workspace memory bridge)
**Unlocks:** Domain-specific workspace experiences (CRM, service desk, property management, etc.) without per-domain code; network agents pushing live results into workspace views

## Goal

- **Roadmap phase:** Phase 14: Network Agent (workspace surface expansion)
- **Capabilities:** Data-driven composition registration, domain-adaptive sidebar navigation, network-to-workspace block push, process-scoped view generation

## Context

Ditto's workspace has 8 hardcoded composition intents (today, inbox, work, projects, growth, library, routines, roadmap). Each is a hand-written function in `packages/web/lib/compositions/` that assembles `ContentBlock[]` from a fixed `CompositionContext`. The sidebar navigation is static. Adding a new view requires changes across at least 4 files:

1. **`CompositionIntent` type** (`packages/web/lib/compositions/types.ts:37-45`) — a string literal union. No runtime extensibility.
2. **`MAIN_NAV` array** (`packages/web/components/layout/sidebar.tsx:145-154`) — fixed 8-item array rendered in both collapsed (icon-only, 56px) and expanded (240px with labels) states.
3. **`COMPOSITION_FUNCTIONS` registry** (`packages/web/lib/compositions/index.ts:42-54`) — `Record<CompositionIntent, ...>` mapping intent to function.
4. **`CenterView` type** (`packages/web/components/layout/workspace.tsx:49-53`) — `{ type: "canvas"; intent: CompositionIntent }` constrains the canvas to built-in intents only.

Additionally, `workspace.tsx` has intent-specific hardcoded behaviours:
- **Suggestion pills** (line 367-378): `pillsByIntent` record keyed by `CompositionIntent`
- **Input placeholders** (line 550-559): per-intent placeholder text
- **Active destination highlighting** (line 345-352): maps `CenterView` to `NavigationDestination`

This works for Ditto's own views but breaks the promise of the harness. A freelance consultant tracking client work needs a "Clients" view. A property manager needs "Properties" and "Maintenance." A support lead needs "Tickets." These aren't new products — they're the same content blocks (tables, metrics, status cards, action buttons) arranged for a different domain, populated by process outputs.

Meanwhile, network agents (Alex/Mira) run processes that produce results — outreach summaries, pipeline reports, research findings — but the delivery path is limited: email notification or a single SSE event. There's no mechanism for a network process to say "here are 5 new blocks for the user's workspace view" and have them appear live. The SSE infrastructure exists (`src/engine/network-events.ts` — in-memory ring buffer, 100 events/user, reconnection replay, 30s heartbeat) but only carries generic events with `type: string` and `payload: Record<string, unknown>`. No workspace-specific event conventions exist.

Two capabilities unlock this:

1. **Adaptive compositions** — compositions defined as data (schema + block templates + context queries) rather than code, registered at runtime by processes or the Self
2. **Network workspace push** — network agents emit structured workspace updates (new blocks, view refreshes, composition registrations) that the workspace receives and renders live

Together these let a user say "I need to track my clients" and have Alex generate a process bundle that also registers a "Clients" workspace view — no deploy, no code change.

## Objective

Workspace compositions become data-driven and extensible at runtime. Network agents can push blocks, refresh views, and register new compositions into a user's workspace. The 8 existing compositions continue to work unchanged.

## Non-Goals

- **Full visual process builder** — users don't drag-and-drop compositions; Alex/Self generates them from conversation
- **Custom React components per domain** — new views use existing block types (data, interactive_table, metric, status_card, actions, etc.), not custom renderers
- **Multi-tenant shared views** — compositions are per-workspace, not shared across workspaces
- **Replacing existing compositions** — today, inbox, work, etc. stay as code; this adds the ability to register additional ones. The `CompositionIntent` union is NOT extended — adaptive views use a parallel routing path.
- **Schema migrations for domain entities** — domain data lives in work items + context JSON + people table, not new tables
- **Real-time collaboration** — single-user workspace model unchanged
- **Migrating built-in compositions to data-driven format** — that's future work; this brief adds the adaptive path alongside the existing code path

## Inputs

1. `packages/web/lib/compositions/types.ts` — `CompositionIntent` literal union (line 37-45) and `CompositionContext` interface (line 55-78). Adaptive views re-use `CompositionContext` for evaluation but do NOT extend `CompositionIntent`.
2. `packages/web/lib/compositions/index.ts` — `compose()` function (line 66-98) and `COMPOSITION_FUNCTIONS` registry (line 42-54). The `compose()` function is unchanged; adaptive views have their own evaluation path.
3. `packages/web/components/layout/workspace.tsx` — `CenterView` type (line 49-53), `handleNavigate` (line 169-183), suggestion pills (line 364-378), input placeholders (line 549-559), active destination highlighting (line 345-352). All need adaptive view variants.
4. `packages/web/components/layout/sidebar.tsx` — `MAIN_NAV` array (line 145-154), both collapsed (line 179-257) and expanded (line 261-437) rendering paths. Both need an adaptive views section.
5. `packages/web/components/layout/composed-canvas.tsx` — `ComposedCanvas` component (line 31-52). Takes `CompositionIntent`. Adaptive views need their own canvas component or a wrapper.
6. `packages/web/lib/composition-context.ts` — `useCompositionContext()` hook. Adaptive views re-use this for data access.
7. `src/engine/network-events.ts` — `emitNetworkEvent()` (line 64), `NetworkEvent` interface (line 15-19), `createSSEStream()` (line 164). The generic `type: string` payload already supports new event types without schema changes.
8. `src/engine/notify-user.ts` — notification routing (email vs workspace). Workspace push extends this path.
9. `src/engine/completion-notifier.ts` — process completion delivery. Should trigger composition refresh when a process that feeds a view completes.
10. `packages/core/src/content-blocks.ts` — block type definitions. Unchanged.
11. `src/engine/self-tools/generate-process.ts` — process generation. Extended to optionally register a companion composition.

## Constraints

- **Existing compositions are not migrated.** The 8 built-in views remain as TypeScript functions. Adaptive compositions are additive — a parallel registration system, not a replacement. Migration of built-ins to data-driven format is future work.
- **`CompositionIntent` is not extended.** The literal union stays frozen. Adaptive views route through a new `CenterView` variant `{ type: "adaptive"; slug: string }`, not through `{ type: "canvas"; intent: CompositionIntent }`. This avoids type-widening that would break every existing composition consumer.
- **Block types are fixed.** Adaptive compositions compose from the existing 22 block types. If a domain needs a block type that doesn't exist, that's a separate brief (new block type in core), not this one.
- **Composition schema types live in `packages/web/`**, not `packages/core/`. Composition schemas are a workspace UI concern — they describe how to assemble `ContentBlock[]` for rendering. The `workspaceViews` DB table goes in `packages/core/src/db/schema.ts` (it's a storage primitive), but the schema type definitions and evaluation logic stay in the web package. This respects the "no Ditto opinions in core" rule — core stores the JSON blob; web interprets it.
- **Composition schemas are validated at registration time.** A malformed schema (referencing nonexistent block types, invalid context queries) is rejected with a clear error, not silently rendered empty.
- **Network push respects rate limiting.** Workspace push events use the same throttle layers as email notifications. A runaway process can't flood the workspace with blocks.
- **No arbitrary code execution.** Composition schemas are declarative data — block type, content template, context filter, sort order. They are NOT executable functions. The renderer evaluates templates against context; it does not eval() anything.
- **SSE reconnection.** Workspace push events are stored in the existing ring buffer and replay on reconnect, same as other network events. No changes to `createSSEStream()` or ring buffer mechanics needed — the generic `type: string` payload already supports new event type conventions.
- **Both sidebar render paths.** The sidebar has two rendering modes: collapsed (icon-only, 56px, `sidebar.tsx:179-257`) and expanded (240px with labels, `sidebar.tsx:261-437`). Both must render adaptive views. Adaptive views use a generic default icon (e.g., grid/squares) unless the schema specifies one.
- If this work adds functions with external side effects: require `stepRunId` invocation guard per Insight-180. Note: composition registration itself is a workspace-internal operation, not an external side effect. Network push events that trigger email fallback (user offline) do route through `notifyUser()` which is infrastructure-exempt per Brief 153 precedent.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Data-driven view composition | Notion database views (filter + sort + group + layout as config, not code) | pattern | Notion proves that a small set of block primitives + configurable layout = infinite domain views. Same insight applies here. |
| Schema-based UI registration | Retool / Appsmith internal tool builders (JSON schema → rendered form/table) | pattern | The approach of declaring UI as data that renders through a fixed component set. We don't adopt their code, just the pattern. |
| Event-driven workspace refresh | Supabase Realtime (DB change → client push → UI re-render) | pattern | The push-invalidation pattern: server event → client cache invalidation → composition re-evaluates. We already have SSE infrastructure. |
| Composition as process output | Ditto's own composition system (`packages/web/lib/compositions/`) | adopt | Extending the existing pattern — compositions already produce `ContentBlock[]`. We're making the input (intent → function) data-driven. |
| Process-scoped view generation | Linear custom views (saved filters per project, created by users not devs) | pattern | Users create views scoped to their workflow. In our case, processes create views scoped to their domain. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | Modify: Add `workspaceViews` table — `id`, `workspaceId`, `slug` (unique per workspace), `label`, `icon` (optional string — icon name from a fixed set), `description`, `schema` (JSON blob — opaque to core, interpreted by web), `sourceProcessId` (nullable FK → processes, the process that registered this view), `position` (integer, sidebar ordering), `createdAt`, `updatedAt`. Core stores the blob; web defines its shape. |
| `packages/web/lib/compositions/composition-schema.ts` | Create: TypeScript types for composition schemas — `CompositionSchema` (array of `BlockTemplate` entries), `BlockTemplate` (block type + content template + context filter + conditional display), `ContextQuery` (which data to pull — work items by type, people by filter, interactions by recency, process runs by status). Includes `validateCompositionSchema()` that checks block type existence and context query validity. Lives in web because it's a UI concern. |
| `packages/web/lib/compositions/adaptive.ts` | Create: `evaluateAdaptiveComposition(schema: CompositionSchema, context: CompositionContext): ContentBlock[]` — the runtime that evaluates a composition schema against the current `CompositionContext`. Maps `BlockTemplate` entries to concrete `ContentBlock` instances. Handles empty states (no matching data → helpful empty state block with action to trigger source process). Pure, synchronous, same contract as built-in compositions. |
| `packages/web/components/layout/workspace.tsx` | Modify: (1) Add `CenterView` variant: `{ type: "adaptive"; slug: string }`. (2) Extend `handleNavigate` to accept adaptive view slugs — if destination is not in `CompositionIntent` union and not "settings", treat as adaptive view slug → `setCenterView({ type: "adaptive", slug: destination })`. (3) Extend `activeDestination` derivation for `type: "adaptive"` → pass slug so sidebar can highlight. (4) Add default suggestion pills for adaptive views: `["What's the latest?", "Show me everything"]`. (5) Add default input placeholder for adaptive views: `"Ask about this view..."`. (6) Render `AdaptiveCanvas` when `centerView.type === "adaptive"`. |
| `packages/web/components/layout/sidebar.tsx` | Modify: (1) Widen `NavigationDestination` to `CompositionIntent | "settings" | string` (adaptive slugs are arbitrary strings). (2) Accept optional `adaptiveViews` prop: `Array<{ slug: string; label: string; icon?: string }>`. (3) After `MAIN_NAV` items in both collapsed and expanded render paths, render a divider + adaptive view buttons. (4) Adaptive views use a default grid icon (`IconGrid`) unless a known icon name is specified. (5) Active state highlighting works for adaptive slugs (exact match on `activeDestination`). |
| `packages/web/components/layout/adaptive-canvas.tsx` | Create: `AdaptiveCanvas` component — parallel to `ComposedCanvas` but for adaptive views. Takes `slug: string` and `onAction` callback. Fetches the `workspaceViews` record by slug (via React Query), validates the schema, evaluates via `evaluateAdaptiveComposition()` against `useCompositionContext()`, and renders via `BlockList`. Shows loading skeleton during fetch, error state on invalid schema, empty state when no data matches. |
| `packages/web/hooks/use-workspace-views.ts` | Create: React Query hook `useWorkspaceViews()` that fetches all registered adaptive views for the current workspace via `GET /api/v1/workspace/views`. Returns `Array<{ slug, label, icon, description, position }>` sorted by position. Cache key includes workspace ID. |
| `packages/web/app/api/v1/workspace/views/route.ts` | Create: GET handler returns all `workspaceViews` records for the authenticated workspace (sorted by position). POST handler accepts `{ slug, label, icon?, description?, schema, sourceProcessId? }` and creates a new view after calling `validateCompositionSchema()`. Returns 400 with specific errors on validation failure. |
| `src/engine/workspace-push.ts` | Create: `pushBlocksToWorkspace(userId, viewSlug, blocks: ContentBlock[], mode: 'append' | 'replace')` — network agent API for pushing blocks into a workspace view. Emits network event with type `"workspace_blocks_push"` and payload `{ viewSlug, blocks, mode }`. `refreshWorkspaceView(userId, viewSlug)` — emits `"workspace_view_refresh"` with payload `{ viewSlug }`. `registerWorkspaceView(userId, workspaceId, { slug, label, icon?, description?, schema, sourceProcessId? })` — inserts `workspaceViews` record, validates schema, emits `"workspace_view_registered"` event with payload `{ slug, label }`. All three use `emitNetworkEvent()` from `src/engine/network-events.ts` — no changes to the event infrastructure needed since `type` is already `string` and `payload` is already `Record<string, unknown>`. |
| `packages/web/hooks/use-network-push.ts` | Create: Client-side hook that listens to the workspace's SSE stream. On `"workspace_blocks_push"` → merges pushed blocks into the active adaptive composition's React Query cache. On `"workspace_view_refresh"` → invalidates React Query for the target view slug's data. On `"workspace_view_registered"` → invalidates the `useWorkspaceViews()` query so the sidebar updates without page reload. Uses `useEffect` with SSE `EventSource` to the network events endpoint. |
| `src/engine/self-tools/generate-process.ts` | Modify: After generating a process, if the process has domain-specific outputs (client tracking, ticket management, etc.), optionally generate a companion `CompositionSchema` and call `registerWorkspaceView()`. The Self proposes the view alongside the process: "I've created a Client Outreach process and a Clients view in your workspace." The schema generation is LLM-driven — the generate_process tool prompt is extended to ask: "Does this process warrant a dedicated workspace view? If so, describe what blocks should appear." |
| `src/engine/completion-notifier.ts` | Modify: When a process completes, query `workspaceViews` for any view with matching `sourceProcessId`. If found, call `refreshWorkspaceView()` for each linked view so the adaptive canvas re-evaluates with new data. |
| `src/engine/tool-resolver.ts` | Modify: Add `workspace.push_blocks` and `workspace.register_view` as built-in tools available to processes. `workspace.push_blocks` calls `pushBlocksToWorkspace()` — requires `stepRunId` guard per Insight-180 since it has an external side effect (modifies workspace state). `workspace.register_view` calls `registerWorkspaceView()` — also requires `stepRunId` guard. |
| `packages/web/lib/compositions/composition-schema.test.ts` | Create: Tests for `validateCompositionSchema()` — valid schemas pass, invalid block types rejected, empty schemas produce helpful error, context query validation, reserved slugs (today, inbox, work, etc.) rejected. |
| `packages/web/lib/compositions/adaptive.test.ts` | Create: Tests for `evaluateAdaptiveComposition()` — schema with data block + context → correct ContentBlock[], empty context → empty state block, conditional display logic, sort/filter application. |
| `src/engine/workspace-push.test.ts` | Create: Tests for push functions — blocks push emits correct network event type and payload, view registration creates DB record + emits event, refresh emits correct event, rate limiting respected, schema validation rejects invalid schemas before DB insert. |

## User Experience

- **Jobs affected:** Orient (new domain-specific views help users see their world), Review (process results appear in workspace views automatically), Define (users describe what they need, Alex generates the view)
- **Primitives involved:** Composition (new adaptive compositions), Feed (pushed blocks appear in views), Work Items (domain work tracked via existing work item system, surfaced in adaptive views)
- **Process-owner perspective:** User tells Alex "I do consulting work for several clients and need to track projects and communications for each." Alex generates a "Client Work" process bundle and registers a "Clients" view in the workspace sidebar. The user sees a new nav item appear below the built-in 8 (separated by a subtle divider). Clicking it shows a table of clients (from people table), each with recent interactions, active work items, and next actions. When Alex completes an outreach cycle, results push into this view live. The user never writes YAML, never requests a deploy, never sees a schema.
- **Interaction states:**
  - **Loading:** Adaptive view shows skeleton blocks while the view schema and context data load (same skeleton pattern as built-in compositions)
  - **Empty:** "No data yet — this view will populate as [process name] runs." with action button to trigger the source process
  - **Error:** Schema validation failure at registration → API returns 400 with specific field errors. Runtime evaluation failure → "I'm having trouble loading this view. Try asking me directly." (same fallback pattern as `compose()` in `index.ts:86-96`)
  - **Success:** Blocks render identically to built-in compositions (same `BlockList` component, same styling)
  - **Live update:** Pushed blocks animate in (same `animate-fade-in` transition as canvas key change)
  - **Sidebar update:** New view appears in sidebar without page reload (React Query invalidation on SSE event)
- **Designer input:** Not invoked — adaptive views use existing block types and composition rendering. Visual consistency is guaranteed by the block registry. Custom layout/styling is future work.

## Acceptance Criteria

1. [ ] A `workspaceViews` record with a valid `CompositionSchema` renders in the workspace when navigated to via sidebar
2. [ ] Sidebar shows registered adaptive views below built-in navigation (after divider), with label and icon, in both collapsed and expanded states
3. [ ] Adaptive views produce `ContentBlock[]` using the same types as built-in compositions — no new block types required
4. [ ] `validateCompositionSchema()` rejects schemas referencing nonexistent block types or invalid context queries
5. [ ] Reserved slugs (today, inbox, work, projects, growth, library, routines, roadmap, settings) cannot be used for adaptive views — registration returns clear error
6. [ ] Built-in composition intents are unchanged — `CompositionIntent` union is NOT widened
7. [ ] `CenterView` supports `{ type: "adaptive"; slug: string }` variant and renders `AdaptiveCanvas`
8. [ ] `pushBlocksToWorkspace()` delivers blocks to the workspace via SSE and they render in the target adaptive view
9. [ ] `refreshWorkspaceView()` triggers client-side React Query invalidation for the target view
10. [ ] `registerWorkspaceView()` creates a DB record, emits SSE event, and sidebar updates without page reload
11. [ ] Network push events replay on SSE reconnection (stored in existing ring buffer — no infrastructure changes)
12. [ ] Network push respects rate limiting — more than 20 push events per minute per user are dropped with a warning log
13. [ ] `generate_process` can optionally produce a companion composition schema and register it as a workspace view
14. [ ] Process completion for a process linked to a workspace view triggers a `workspace_view_refresh` event
15. [ ] `workspace.push_blocks` and `workspace.register_view` tools are available in `tool-resolver.ts` and work from process steps, guarded by `stepRunId` per Insight-180
16. [ ] Empty adaptive views show a helpful empty state with action to trigger the source process
17. [ ] Composition schemas are declarative only — no eval(), no function execution, no arbitrary code in templates
18. [ ] Default suggestion pills and input placeholder render for adaptive views in `workspace.tsx`
19. [ ] All existing 8 built-in compositions continue to work unchanged — zero regression
20. [ ] `pnpm run type-check` passes
21. [ ] Unit tests cover: schema validation (including reserved slug rejection), adaptive evaluation, workspace push, view registration, completion-triggered refresh

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: composition schema types live in `packages/web/` not `packages/core/` (core only stores the JSON blob), `CompositionIntent` union is unchanged, SSE event handling is idempotent, rate limiting is enforced, schema validation is comprehensive (including reserved slug protection), no eval() or dynamic code execution in template evaluation, existing compositions unaffected, both sidebar render paths updated, `workspace.tsx` CenterView routing covers all states, `stepRunId` guards on workspace tools
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type check
pnpm run type-check

# Unit tests
pnpm test -- --grep "composition-schema"
pnpm test -- --grep "adaptive"
pnpm test -- --grep "workspace-push"

# Integration (manual):
# 1. Start workspace locally
# 2. Via Self conversation: "I need to track my consulting clients"
# 3. Verify: Self generates a process + registers a "Clients" adaptive view
# 4. Verify: sidebar shows new "Clients" nav item below divider (no page reload)
# 5. Verify: sidebar works in both collapsed (icon) and expanded (icon + label) states
# 6. Click "Clients" → verify empty state renders with helpful message + action button
# 7. Verify: URL/state shows CenterView type "adaptive" (not "canvas")
# 8. Add a person via crm.create_person + record an interaction
# 9. Verify: "Clients" view now shows the person with interaction data
# 10. Trigger a network process that pushes blocks to the view
# 11. Verify: pushed blocks appear live in the workspace (no refresh needed)
# 12. Reload page → verify adaptive view persists (DB-backed, sidebar re-fetches)
# 13. Verify: all 8 built-in views still work correctly
# 14. Verify: attempting to register a view with slug "today" returns 400 error
```

## After Completion

1. Update `docs/state.md`: "Adaptive workspace views: data-driven compositions registered at runtime, network agents push blocks to workspace live"
2. Update `docs/roadmap.md`: Phase 14 — adaptive workspace views complete
3. Update `docs/architecture.md`: Layer 6 (Human Layer) section — add adaptive composition pattern alongside built-in compositions
4. Capture insight if the schema-based composition approach reveals design principles worth documenting
5. Phase retrospective: did the composition schema contract feel right? Did network push latency meet expectations? What domain was tested first?
