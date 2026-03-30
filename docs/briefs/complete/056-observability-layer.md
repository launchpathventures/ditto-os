# Brief 056: Observability Layer — UI Interaction Signals for the Learning Loop

**Date:** 2026-03-29
**Status:** ready
**Depends on:** Brief 050 (ArtifactBlock rendering — artifact mode exists to observe), Brief 055 (Roadmap composition — navigation exists to observe)
**Unlocks:** Meta-processes (self-improvement, project-orchestration) can optimize based on how the user actually uses the UI. Self gains implicit UI signals for proactive context assembly (e.g., surfacing unreviewed outputs).

## Goal

- **Roadmap phase:** Phase 10 — Web Dashboard (Composable Workspace Architecture, ADR-024)
- **Capabilities:** UI interaction event capture, implicit signal pipeline to learning layer, brief lifecycle sync to database, navigation analytics for meta-processes

## Context

The engine's learning loop is comprehensive for explicit signals — every approve/edit/reject creates feedback, memories, and trust computation input. The meta-processes (self-improvement, project-orchestration) observe this data and propose improvements.

But the learning loop has a blind spot: **it cannot observe how the user interacts with the UI.**

Briefs 050-055 add significant UI surface:
- **Artifact mode** (050): User views step outputs, briefs, documents in a three-column layout
- **Pipeline progress** (053): ProgressBlock shows live step-by-step execution
- **Roadmap** (055): User navigates to see project state, selects briefs for execution
- **Planning conversations** (052): Self guides planning with role consultation

None of these surfaces emit signals the learning layer can consume. The system knows what it produced but not:
- **What the user looked at** — Did they open the Builder's output? How long did they spend?
- **What they navigated to** — Do they check the Roadmap daily? Do they live in Today?
- **What they selected but didn't act on** — Selected a brief but didn't send the message?
- **What they ignored** — Pipeline completed but user never reviewed the output?

These are implicit signals — weaker than explicit feedback but high-volume and pattern-rich. A user who never opens artifact mode is telling the system something. A user who always checks the Roadmap before starting work is telling the system something. Without these signals, the meta-processes optimize in the dark.

Additionally, brief lifecycle (draft → ready → in_progress → complete) lives in markdown frontmatter files, invisible to the database. The project-orchestration process — which should track brief velocity and project progress — cannot observe this data.

## Objective

Wire UI interaction signals into the engine's learning layer so meta-processes can observe how the user works, not just what they approve. Sync brief lifecycle state to the database so project-orchestration can track project velocity.

## Non-Goals

- User analytics dashboard — signals feed meta-processes, not a dashboard
- Session replay or heatmaps — interaction signals are lightweight events, not recordings
- A/B testing infrastructure — not testing UI variants
- Privacy-invasive tracking — no keystroke logging, no scroll depth, no mouse position. Only semantic events (viewed artifact, navigated to roadmap, selected brief)
- Changing the trust computation algorithm — implicit signals inform meta-processes, not the trust tier calculation (trust stays based on explicit human feedback)

## Inputs

1. `src/engine/harness-handlers/feedback-recorder.ts` — existing feedback recording pattern
2. `src/engine/self-context.ts` — recordSelfDecision, activity recording pattern
3. `src/engine/events.ts` — HarnessEvent emitter pattern
4. `src/engine/trust.ts` — trust computation (for reference — NOT modified)
5. `packages/web/hooks/use-harness-events.ts` — existing SSE hook pattern
6. `packages/web/components/layout/workspace.tsx` — navigation state
7. `packages/web/components/layout/artifact-layout.tsx` — artifact mode entry/exit
8. `packages/web/lib/compositions/roadmap.ts` — roadmap composition (Brief 055)
9. `packages/web/components/blocks/block-registry.tsx` — block action dispatch
10. `processes/self-improvement.yaml` — meta-process that should consume these signals
11. `processes/project-orchestration.yaml` — meta-process that should consume these signals

## Constraints

- **Semantic events only.** No raw telemetry (mouse, scroll, keystrokes). Events capture meaningful user actions: navigated, viewed, selected, dismissed, dwelled. Each event has a clear interpretation for the learning layer.
- **Fire-and-forget on the frontend.** Events are posted to an API endpoint asynchronously. No UI blocking. Lost events are acceptable — these are statistical signals, not transactional data.
- **Database-backed events table.** Events persist in SQLite alongside feedback records. Meta-processes query them via SQL. Same database, same access pattern.
- **Brief lifecycle synced from files to DB.** A lightweight sync function reads `docs/briefs/` frontmatter and upserts to a `briefs` table. Runs on API request (lazy) with mtime-based cache invalidation. Meta-processes query the `briefs` table, not the filesystem.
- **Implicit signals do NOT feed trust computation.** Trust tiers remain based on explicit human feedback (approve/edit/reject). Implicit signals feed only the meta-processes (self-improvement, project-orchestration) and the Self's context assembly. This preserves trust computation integrity.
- **Privacy by design.** Events contain entity IDs and timestamps, not content. "User viewed artifact X for 45 seconds" — not "user read the following text." Events are scoped to the user's own workspace. No cross-user analytics.
- **Endpoint auth from session.** `POST /api/events/interaction` extracts userId from the authenticated session (same auth pattern as all other API routes). No userId in request body — prevents attribution spoofing.
- **Brief sync handles deletions.** When `syncBriefs()` finds a DB row with no corresponding file, it marks the row as `status: "deleted"` (soft delete). Meta-processes can distinguish between completed briefs (moved to `complete/`) and removed briefs.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Interaction event pattern | PostHog / Segment event model | pattern | Standard semantic event model (entity + action + properties). Pattern-only because event volume is low (tens per session), schema is custom to Ditto's entity model, and a PostHog SDK dependency would be disproportionate overhead for a single-user workspace. |
| Activity recording | `recordSelfDecision()` in self-context.ts | pattern | Extending existing activity table with a new event source |
| Brief sync | `brief-index.ts` (Brief 055) | pattern | Extending file-based index with database persistence |
| Implicit signal consumption | Recommendation system implicit feedback (Netflix, Spotify) | pattern | Weak signals at scale reveal strong patterns |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/interaction-events.ts` | Create: Interaction event types and recording function. Event types: `artifact_viewed` (artifactId, processRunId, durationMs), `composition_navigated` (intent, fromIntent), `brief_selected` (briefNumber, action: "build"\|"plan"), `block_action_taken` (blockType, actionId), `review_prompt_seen` (runId, stepId, durationBeforeAction), `pipeline_progress_viewed` (runId, viewCount). `recordInteractionEvent(userId, event)` inserts to `interaction_events` table. |
| `src/engine/schema.ts` (or migrations) | Modify: Add `interaction_events` table: `id`, `userId`, `eventType`, `entityId`, `properties` (JSON), `timestamp`. Add `briefs` table: `number`, `name`, `status`, `dependsOn`, `unlocks`, `filePath`, `lastModified`, `syncedAt`. |
| `src/engine/brief-sync.ts` | Create: Brief lifecycle sync. `syncBriefs()` reads `docs/briefs/` + `docs/briefs/complete/`, parses frontmatter, upserts to `briefs` table. Mtime-based invalidation (skips files not modified since last sync). Called lazily from API endpoints. |
| `packages/web/app/api/events/interaction/route.ts` | Create: `POST /api/events/interaction` endpoint. Accepts `{ eventType, entityId, properties }`. Calls `recordInteractionEvent()`. Fire-and-forget from frontend (202 Accepted, no response body). |
| `packages/web/hooks/use-interaction-events.ts` | Create: Frontend hook for emitting interaction events. `useInteractionEvent()` returns `emit(eventType, entityId, properties)` function. Posts to `/api/events/interaction` via `navigator.sendBeacon()` (survives page navigation) with `fetch()` fallback. Debounces duplicate events within 1 second. |
| `packages/web/components/layout/artifact-layout.tsx` | Modify: On artifact mode enter, start a timer. On exit, emit `artifact_viewed` event with duration. Uses `useInteractionEvent()` hook. |
| `packages/web/components/layout/workspace.tsx` | Modify: On composition intent change, emit `composition_navigated` event with `{ intent, fromIntent }`. Uses `useInteractionEvent()` hook. |
| `packages/web/hooks/use-pipeline-review.ts` | Modify: When review prompt appears, record timestamp. When user takes action (approve/edit/reject), emit `review_prompt_seen` with `durationBeforeAction`. |
| `packages/web/lib/compositions/roadmap.ts` | Modify: When brief "Select" action fires, emit `brief_selected` event before pre-filling conversation. |
| `processes/self-improvement.yaml` | Modify: Add `interaction_events` to the data sources the scout step consumes. Scout can now observe: which outputs get viewed vs ignored, which compositions are frequented, average review response time. |
| `processes/project-orchestration.yaml` | Modify: Add `briefs` table and `interaction_events` to consumed data. Orchestration can now track: brief lifecycle velocity (days in each status), brief engagement (how often viewed/selected), navigation patterns (what the user checks first). |
| `src/engine/self.ts` | Modify: Add interaction signal summary to `loadWorkStateSummary()`. Include: recent navigation patterns (last 24h composition visits), unreviewed artifacts (pipeline outputs the user hasn't opened). Self can proactively say "The Builder finished Brief 050 — want to review the output?" |

## User Experience

- **Jobs affected:** None directly — observability is invisible to the user. Indirectly improves Orient (Self proactively surfaces unreviewed outputs), Delegate (meta-processes make better priority recommendations).
- **Primitives involved:** None — no new UI elements. Existing components emit events silently.
- **Process-owner perspective:** The user notices nothing different. Over time, the Self becomes more proactive: "You haven't reviewed the Builder's output from yesterday — it's in artifact mode." The project-orchestration daily brief gets more accurate: "Brief 052 has been in progress for 3 days — the average is 1.5 days." The self-improvement process proposes: "Users spend 80% of time in the Work view but only 5% in Roadmap — consider surfacing roadmap items in the Work composition."
- **Interaction states:** N/A — no user-facing interaction states. Events fire silently.
- **Designer input:** Not invoked — no visual changes.

## Acceptance Criteria

1. [ ] `interaction_events` table created with `id`, `userId`, `eventType`, `entityId`, `properties` (JSON), `timestamp` columns.
2. [ ] `briefs` table created with `number`, `name`, `status`, `dependsOn`, `unlocks`, `filePath`, `lastModified`, `syncedAt` columns.
3. [ ] `recordInteractionEvent(userId, event)` inserts to `interaction_events` table. Event types: `artifact_viewed`, `composition_navigated`, `brief_selected`, `block_action_taken`, `review_prompt_seen`, `pipeline_progress_viewed`.
4. [ ] `syncBriefs()` reads brief files, parses frontmatter, upserts to `briefs` table. Mtime-based invalidation skips unchanged files. Covers both `docs/briefs/` and `docs/briefs/complete/`.
5. [ ] `POST /api/events/interaction` endpoint accepts events and records them. Returns 202 immediately (fire-and-forget).
6. [ ] `useInteractionEvent()` hook emits events via `navigator.sendBeacon()` with `fetch()` fallback. Debounces duplicates within 1 second.
7. [ ] Artifact mode emits `artifact_viewed` with `artifactId`, `processRunId`, and `durationMs` on exit.
8. [ ] Workspace emits `composition_navigated` with `intent` and `fromIntent` on navigation.
9. [ ] Review prompt emits `review_prompt_seen` with `durationBeforeAction` when user acts on a gate-pause review.
10. [ ] Roadmap composition emits `brief_selected` with `briefNumber` and `action` on select.
11. [ ] `self-improvement.yaml` and `project-orchestration.yaml` updated to consume `interaction_events` and `briefs` tables.
12. [ ] `loadWorkStateSummary()` includes interaction signal summary: recent navigation patterns, unreviewed artifacts.
13. [ ] Implicit signals do NOT affect trust computation — trust.ts remains unchanged, only consuming explicit feedback.
14. [ ] `pnpm run type-check` passes with 0 errors.
15. [ ] Existing feedback recording, trust computation, and meta-processes continue to work unchanged (no regression).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - **Learning layer integration**: Interaction events feed meta-processes through the same database. No parallel data store.
   - **Privacy**: Events contain entity IDs and timestamps, not content. No cross-user data.
   - **Trust integrity**: Implicit signals do NOT enter trust computation. Trust stays explicit-feedback-only.
   - **Performance**: Fire-and-forget events don't block UI. sendBeacon survives navigation. Debounce prevents flood.
   - **Engine consistency**: Brief sync uses same database, same access patterns. Meta-processes query SQL, not filesystem.
   - No regressions to existing feedback, trust, or meta-process behavior.
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run tests
cd /Users/thg/conductor/workspaces/agent-os/paris
pnpm test

# 2. Type-check
pnpm run type-check

# 3. Start web app
pnpm dev

# 4. Navigate to different compositions (Today → Work → Roadmap → Projects)
#    Check DB: SELECT * FROM interaction_events WHERE eventType = 'composition_navigated'
#    Verify: events recorded with correct intents and timestamps

# 5. Open an artifact in artifact mode, stay 10 seconds, exit
#    Check DB: SELECT * FROM interaction_events WHERE eventType = 'artifact_viewed'
#    Verify: event recorded with durationMs ≈ 10000

# 6. Select a brief from Roadmap composition
#    Check DB: SELECT * FROM interaction_events WHERE eventType = 'brief_selected'
#    Verify: event recorded with briefNumber and action

# 7. Check brief sync
#    Query: SELECT * FROM briefs
#    Verify: all briefs from docs/briefs/ and docs/briefs/complete/ present with correct status

# 8. Verify trust unchanged
#    Run existing trust tests: pnpm test -- trust
#    Verify: no interaction events influence trust computation

# 9. Verify Self context includes interaction summary
#    Start a conversation, check Self system prompt for navigation/unreviewed data
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark "Observability Layer" as done
3. Update `docs/architecture.md` — document interaction event system in Layer 5 (Learning Layer). Document brief sync in Layer 2 (Agent/Data Layer). Explicitly note that implicit signals do NOT feed trust computation.
4. Phase retrospective: Are the event types sufficient? What implicit signals are missing? Is the meta-process consumption useful or noise? Is brief sync reliable enough to replace file-based queries?
5. Phase 10 complete: All seven briefs (050-056) shipped. Run full Phase 10 retrospective.
