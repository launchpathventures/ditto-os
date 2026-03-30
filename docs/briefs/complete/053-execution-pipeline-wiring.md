# Brief 053: Execution Pipeline Wiring — Pipeline Trigger, Progress, Review Gates

**Date:** 2026-03-29
**Status:** ready
**Depends on:** Brief 050 (ArtifactBlock + Markdown Rendering — step outputs visible in artifact mode), Brief 051 (Shell Execution Tool — Builder/Reviewer can run commands)
**Unlocks:** Brief 054 (Testing Infrastructure — Playwright e2e tests for the pipeline flow), end-to-end dev process through the web UI

## Goal

- **Roadmap phase:** Phase 10 — Web Dashboard (Composable Workspace Architecture, ADR-024)
- **Capabilities:** Full dev pipeline triggerable from conversation, live pipeline progress via ProgressBlock, review gates surface in UI, session-level trust overrides

## Context

The dev pipeline (`processes/dev-pipeline.yaml`) defines 7 roles: PM → Researcher → Designer → Architect → Builder → Reviewer → Documenter. The engine can execute this — `startProcessRun()` accepts any process slug, `fullHeartbeat()` drives steps through the harness, and `approveRun()` continues after review gates. The infrastructure works.

But the web UI can't use it:

1. **No pipeline trigger.** The Self's `start_dev_role` tool hardcodes `processSlug = \`dev-${role}-standalone\`` — it always starts a single-role standalone process. There's no way to trigger the full `dev-pipeline` process from conversation.

2. **No pipeline progress.** ProgressBlock exists (type + renderer) but is dead code — nothing populates it. The SSE tunnel (`/api/events` → `useHarnessEvents`) exists but only triggers feed refetch, not composition re-render. The user has no visibility into which step is running.

3. **No review gate surfacing.** When a pipeline step pauses for review (`gate-pause` event), the review prompt doesn't appear in the conversation. The user would need to manually check process detail. The review tools (`approve_review`, `edit_review`, `reject_review`) exist but the connection from "pipeline paused" to "show review in conversation" is missing.

4. **No session trust control.** Trust is always process-level from the database. The user can't say "auto-approve research and design, only review code" for a session. The trust gate handler has no override mechanism.

### What Already Works

| Component | Status |
|-----------|--------|
| Pipeline process definition (7 roles, routing, dependencies) | Working |
| startProcessRun + fullHeartbeat | Working |
| Step execution through adapter (ai-agent, script) | Working |
| Harness pipeline (memory, metacognition, review, trust, feedback) | Working |
| Trust gate handler (supervised/spot_checked/autonomous/critical) | Working |
| Review actions (approve/edit/reject → fullHeartbeat continues) | Working |
| SSE event tunnel (harness events → browser) | Working |
| useHarnessEvents hook (triggers feed refetch) | Working |
| ProgressBlock type + renderer component | Working (dead code) |
| ArtifactBlock for step outputs (Brief 050) | Pending build |
| run_command for Builder/Reviewer (Brief 051) | Pending build |

The pieces exist. This brief wires them together.

## Objective

Make the dev pipeline runnable end-to-end from the web UI: trigger from conversation, see progress, review at gates, resume after approval. The user says "Build Brief 050" and watches the pipeline execute with live progress, reviewing Builder output when it pauses.

## Non-Goals

- New pipeline step types or role definitions — existing pipeline is sufficient
- Parallel pipeline runs — one active run per process is the current model
- Pipeline editing UI — process definitions are YAML, edited by Architect role
- Real-time streaming of step output during execution — step output appears when the step completes (streaming within a step is an optimization, not MVP)
- Testing framework setup (Playwright, vitest for web) — Brief 054
- Roadmap/project visualization — Brief 055

## Inputs

1. `processes/dev-pipeline.yaml` — the 7-role pipeline definition
2. `src/engine/heartbeat.ts` — startProcessRun, fullHeartbeat, heartbeat cycle
3. `src/engine/step-executor.ts` — step dispatch, harness pipeline
4. `src/engine/events.ts` — HarnessEvent types, event emitter
5. `src/engine/review-actions.ts` — approveRun, editRun, rejectRun
6. `src/engine/trust.ts` — trust computation, tier actions
7. `src/engine/harness-handlers/trust-gate.ts` — trust gate handler
8. `src/engine/self-delegation.ts` — Self tools (start_dev_role pattern)
9. `src/engine/self-stream.ts` — toolResultToContentBlocks, streaming events
10. `src/engine/content-blocks.ts` — ProgressBlock definition
11. `packages/web/hooks/use-harness-events.ts` — SSE subscription
12. `packages/web/lib/composition-context.ts` — CompositionContext type
13. `packages/web/lib/compositions/today.ts` — Today composition function
14. `packages/web/lib/compositions/work.ts` — Work composition function
15. `packages/web/components/blocks/progress-block.tsx` — ProgressBlock renderer
16. `packages/web/app/api/events/route.ts` — SSE route handler
17. `packages/web/lib/transition-map.ts` — tool result → UI transition

## Constraints

- **ProgressBlock is the pipeline visualization.** No bespoke pipeline dashboard. Running pipelines produce ProgressBlock in compositions. Step results produce existing blocks (ArtifactBlock, TextBlock, ChecklistBlock, CodeBlock). The block system handles it.
- **SSE is the real-time channel.** No WebSocket introduction. The existing `/api/events` SSE tunnel carries harness events. The frontend subscribes and updates compositions reactively.
- **Pipeline runs asynchronously after trigger.** `start_pipeline` returns immediately with runId and initial status. The pipeline continues via fullHeartbeat. Progress updates arrive via SSE. The Self doesn't block waiting for the entire pipeline to complete (unlike `start_dev_role` which blocks on fullHeartbeat).
- **Review gates surface via SSE → frontend rendering.** When a `gate-pause` event arrives via SSE, the `useHarnessEvents` hook handles it on the frontend: it fetches the paused step's output from the activeRuns endpoint and renders an inline review prompt component (ArtifactBlock for output + AlertBlock with approve/edit/reject actions) in the conversation feed. No chat route modification — the review prompt is rendered client-side from SSE events, not injected server-side. This follows the existing pattern where `useHarnessEvents` already triggers UI updates on harness events.
- **Session trust overrides are additive with safety limits.** They temporarily relax trust for specific roles but with constraints: (1) can only relax, never tighten; (2) `builder` and `reviewer` roles cannot be relaxed (maker-checker separation is non-negotiable); (3) maximum relaxation is `spot_checked` (not `autonomous`) — some sampling always occurs; (4) `critical` tier steps cannot be relaxed. Overrides expire when the run completes.
- **Session trust is a spec extension.** The architecture defines trust as process-level, earned over time. Session-scoped overrides are a new mechanism that extends (not contradicts) this model. architecture.md Layer 3 must be updated to document this extension.
- **Must not break standalone role delegation.** `start_dev_role` continues to work for single-role runs (PM triage, quick consultation via roles).

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Pipeline trigger tool | `start_dev_role` in `self-delegation.ts` | pattern | Extending the existing delegation pattern for full pipelines |
| ProgressBlock for pipeline | `content-blocks.ts` | pattern | Existing block type, unused — activating it |
| SSE event subscription | `use-harness-events.ts` + `/api/events` | pattern | Existing real-time event infrastructure |
| Composition-driven progress | `compositions/today.ts` | pattern | Extending existing composition pattern with active run data |
| Session trust override | CI runner environment variables | pattern | Temporary trust level per execution context |
| Review gate prompts | GitHub PR review notifications | pattern | Event triggers review UI in the working context |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/self-delegation.ts` | Modify: Add `start_pipeline` tool definition. Takes `processSlug` (string, default "dev-pipeline"), `task` (string — the work description), and optional `sessionTrust` (object mapping role names to trust tier overrides). Calls `startProcessRun()` then kicks off `fullHeartbeat()` in a detached async context (not awaited — pipeline runs in background). Returns immediately with `{ runId, processSlug, status: "started", steps: [...stepNames] }`. |
| `src/engine/self-delegation.ts` | Modify: Add `start_pipeline` handler. Validates process slug exists. Stores sessionTrust overrides in a session-scoped map (keyed by runId). Calls `startProcessRun(slug, { task }, "self")`. Calls `fullHeartbeat(runId)` via `setImmediate()` (non-blocking). Returns structured result with runId and step list from process definition. |
| `src/engine/self-stream.ts` | Modify: Add `start_pipeline` to `toolResultToContentBlocks()`. Emit ProgressBlock with initial state (step 0 of N, status "running") + TextBlock summary of what's starting. |
| `src/engine/harness-handlers/trust-gate.ts` | Modify: Before checking process trustTier, check for session-scoped trust override. Lookup: `getSessionTrustOverride(runId, stepRoleName)`. If override exists and is less restrictive than process tier, use the override. Override can only relax (autonomous > spot_checked > supervised), never tighten. |
| `src/engine/session-trust.ts` | Create: Session-scoped trust override store. In-memory Map keyed by runId → `{ [roleName]: TrustTier }`. Functions: `setSessionTrust(runId, overrides)`, `getSessionTrustOverride(runId, roleName)`, `clearSessionTrust(runId)`. Overrides cleared when run completes (listen for `run-complete`/`run-failed` events). |
| `packages/web/lib/composition-context.ts` | Modify: Add `activeRuns: ActiveRunSummary[]` to `CompositionContext`. `ActiveRunSummary`: `{ runId, processSlug, processName, currentStep, totalSteps, completedSteps, status, startedAt }`. Populated from new `/api/processes?action=activeRuns` endpoint. |
| `packages/web/app/api/processes/route.ts` | Modify: Add `action=activeRuns` query handler. Returns all process runs with status "running" or "waiting_review", including step progress counts (completed/total from stepRuns table). |
| `packages/web/hooks/use-harness-events.ts` | Modify: In addition to triggering feed refetch, also invalidate the `activeRuns` query key on `step-complete`, `gate-pause`, `gate-advance`, `run-complete`, `run-failed` events. This causes compositions to re-render with fresh progress data. |
| `packages/web/lib/compositions/today.ts` | Modify: When `activeRuns` has entries, prepend ProgressBlock for each running pipeline before other content. ProgressBlock populated from ActiveRunSummary data. |
| `packages/web/lib/compositions/work.ts` | Modify: When `activeRuns` has entries, show ProgressBlock for active runs in the relevant project section. |
| `packages/web/lib/transition-map.ts` | Modify: Add `start_pipeline` entry. Returns `{ target: "panel", context: { type: "process_run", processSlug, runId } }` to show the process run detail in the right panel while the pipeline executes. |
| `packages/web/hooks/use-pipeline-review.ts` | Create: Hook that listens to `gate-pause` events via `useHarnessEvents`, fetches the paused step's output from `/api/processes?action=activeRuns`, and returns a `pendingReview: { runId, stepId, stepName, output: ContentBlock[] } | null` state. The conversation feed component renders the review prompt inline when `pendingReview` is non-null. Review actions (approve/edit/reject) call existing `/api/actions` endpoint which routes to `approveRun`/`editRun`/`rejectRun`. |
| `src/engine/self.ts` | Modify: Extend `<delegation_guidance>` with pipeline guidance. Self learns: "Build Brief X" or "implement X" → `start_pipeline` (full pipeline). Single-role tasks → `start_dev_role`. Planning/scoping → `plan_with_role` or `consult_role`. |

## User Experience

- **Jobs affected:** Delegate (primary — handing off work to the pipeline), Review (reviewing at trust gates), Orient (seeing pipeline progress in Today view)
- **Primitives involved:** Conversation Stream (Primitive 1 — trigger + review), Progress Display (Primitive 12 — ProgressBlock), Artifact Viewer (Primitive 10 — step outputs), Review Interface (Primitive 3 — approve/edit/reject at gates)
- **Process-owner perspective:** The user says "Build Brief 050" in conversation. The Self recognizes this as execution and triggers the full dev pipeline. A ProgressBlock appears in the conversation showing "Step 1 of 7: PM Triage — running." The Today view also shows the running pipeline. Steps execute autonomously (or pause at trust gates). When the Builder step completes and pauses for review, the conversation shows the Builder's output as an ArtifactBlock with "Approve / Edit / Reject" actions. The user reviews, approves, and the pipeline continues to Reviewer → Documenter. The user set "auto-approve research" at the start, so the Researcher step advanced without pausing.
- **Interaction states:**
  - **Trigger:** Self responds "Starting the dev pipeline for Brief 050. I'll keep you updated as steps complete." ProgressBlock shows initial state.
  - **Running:** ProgressBlock updates via SSE as steps complete. Today view reflects progress.
  - **Review gate:** Conversation receives review prompt with step output. User approves/edits/rejects inline.
  - **Completion:** ProgressBlock shows "Complete." Final summary TextBlock from Documenter output.
  - **Failure:** AlertBlock with error + which step failed. ProgressBlock shows "Failed at step X."
- **Designer input:** Not invoked — pipeline visualization uses existing ProgressBlock renderer and ArtifactBlock for outputs.

## Acceptance Criteria

1. [ ] `start_pipeline` tool defined in `self-delegation.ts` with `processSlug` (string, default "dev-pipeline"), `task` (string), and optional `sessionTrust` (`{ [roleName: string]: "spot_checked" }`) parameters. `sessionTrust` values restricted to `spot_checked` only (cannot set `autonomous`).
2. [ ] `start_pipeline` handler calls `startProcessRun()` then `fullHeartbeat()` asynchronously (non-blocking via `setImmediate()`). Returns immediately with `{ runId, processSlug, status: "started", steps: string[] }`.
3. [ ] `session-trust.ts` implements in-memory session trust override store. `setSessionTrust(runId, overrides)` validates overrides: rejects `builder` and `reviewer` roles (maker-checker non-negotiable), rejects `autonomous` tier (max relaxation is `spot_checked`), rejects overrides on `critical`-tier steps. `clearSessionTrust(runId)` auto-called on `run-complete`/`run-failed` events.
4. [ ] Trust gate handler in `trust-gate.ts` checks session trust override before process trust tier. Override can only relax (supervised → spot_checked), never tighten. Override ignored for builder/reviewer roles and critical-tier steps.
5. [ ] `toolResultToContentBlocks()` emits ProgressBlock for `start_pipeline` results: `{ processRunId, currentStep: steps[0], totalSteps: steps.length, completedSteps: 0, status: "running" }`.
6. [ ] `CompositionContext` includes `activeRuns: ActiveRunSummary[]`. New `/api/processes?action=activeRuns` endpoint returns running/waiting_review runs with step progress counts.
7. [ ] `useHarnessEvents` invalidates the `activeRuns` React Query key on step-complete, gate-pause, gate-advance, run-complete, run-failed events.
8. [ ] `today.ts` composition prepends ProgressBlock for each active run when `activeRuns` has entries.
9. [ ] `work.ts` composition shows ProgressBlock for active runs in relevant sections.
10. [ ] Transition map entry for `start_pipeline` opens process run detail in right panel.
11. [ ] `use-pipeline-review.ts` hook listens for `gate-pause` events via `useHarnessEvents`, fetches paused step output, and exposes `pendingReview` state. Conversation feed renders inline review prompt (ArtifactBlock + AlertBlock with approve/edit/reject) when `pendingReview` is non-null. Review actions route through existing `/api/actions` endpoint.
12. [ ] Delegation guidance in `self.ts` updated: "Build X" / "implement X" → `start_pipeline`. Single-role → `start_dev_role`. Planning → `plan_with_role` / `consult_role`.
13. [ ] `pnpm run type-check` passes with 0 errors.
14. [ ] Existing `start_dev_role`, `consult_role`, `plan_with_role`, and review tools continue to work unchanged (no regression).
15. [ ] Pipeline triggered via `start_pipeline` executes through multiple steps, pauses at supervised trust gates, continues after approval, and completes.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - **Composability**: Pipeline progress uses ProgressBlock. Step outputs use ArtifactBlock/TextBlock/CodeBlock. Review gates use AlertBlock. No bespoke pipeline UI.
   - **Engine integration**: `start_pipeline` follows existing tool pattern. Trust override extends existing trust gate handler. Composition enrichment follows existing pattern.
   - **Real-time**: SSE events trigger composition updates. No polling loops.
   - **Security**: Session trust can only relax, never tighten. Override scoped to runId, cleared on completion.
   - **Async correctness**: fullHeartbeat runs in background. Pipeline continues independent of conversation turn. Review gate injection doesn't race with user messages.
   - No regressions to existing tools or composition functions.
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run existing tests to verify no regression
cd /Users/thg/conductor/workspaces/agent-os/paris
pnpm test

# 2. Type-check
pnpm run type-check

# 3. Start web app
pnpm dev

# 4. Trigger pipeline:
#    User: "Build Brief 050"
#    Self should: call start_pipeline with task "Implement Brief 050"
#    Verify: ProgressBlock appears in conversation (Step 1 of 7)
#    Verify: Today view shows running pipeline

# 5. Pipeline progress:
#    Watch SSE events update ProgressBlock as steps complete
#    Verify: step count increments

# 6. Review gate:
#    When Builder step pauses, verify:
#    - Conversation shows Builder output as ArtifactBlock
#    - Review prompt appears (AlertBlock with approve/edit/reject)
#    - User says "approve" → pipeline continues to Reviewer

# 7. Session trust:
#    User: "Start pipeline for Brief 050, auto-approve research and design"
#    Verify: Researcher and Designer steps use spot_checked (some may still sample)
#    Verify: Builder step still pauses (builder cannot be relaxed)
#    Verify: Attempting to auto-approve builder is rejected by session-trust validation

# 8. Completion:
#    Verify: ProgressBlock shows "Complete" when pipeline finishes
#    Verify: Today view updates accordingly

# 9. Existing tools:
#    Verify: "Triage the current work" → start_dev_role (PM standalone) still works
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark "Execution Pipeline Wiring" as done
3. Update `docs/architecture.md` — document `start_pipeline` tool, session trust overrides (as spec extension to Layer 3), pipeline-to-UI flow, `activeRuns` in composition context
4. Update `docs/human-layer.md` — document composition enrichment (activeRuns), review prompt rendering pattern
5. Check ADR-024 — add addendum if `activeRuns` composition context changes affect the composable workspace architecture
6. Phase retrospective: Did the async pipeline model work? Were SSE updates responsive enough? Did the frontend review prompt feel natural? Did session trust limits (no builder/reviewer, cap at spot_checked) feel right?
7. Next: Brief 054 (Testing Infrastructure) — Playwright e2e tests for the pipeline flow
