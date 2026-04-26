# Brief 217: Managed Agents Dispatcher (claude-managed-agent) — second cloud runner adapter (sub-brief of 214)

**Date:** 2026-04-26
**Status:** draft
**Depends on:** Brief 215 (Projects + Runner Registry — substrate; defines the `RunnerAdapter` interface, `runner_dispatches` table, kind/mode/state enums, `runner-registry.ts`, `validateRunnerConfig` for `claude-managed-agent` shape). Brief 223 SHOULD merge before this brief if the optional in-prompt callback path is wired (the status webhook handler at `packages/web/app/api/v1/work-items/[id]/status/route.ts` is owned by Brief 223); if Brief 223 has not merged at this brief's build time, the callback path is OPTIONAL and the polling-primary path proceeds independently. Brief 216 (Routine) is NOT a hard dependency, but if 216 has merged the prompt-composer (`src/adapters/routine-prompt.ts`) and ephemeral-token discipline are reused — see §D3 below.
**Unlocks:** the second cloud runner kind. Combined with Brief 216 it gives the user two cloud-execution paths with distinct shapes (Routines = simple fire-and-forget; Managed Agents = steerable, polling-driven, longer-running). Brief 218 (GitHub Actions) ships in parallel; brief 220 (deploy gate), 221 (mobile UX), 222 (smoke tests) consume this adapter.
**Parent brief:** 214 (Cloud Execution Runners Phase)

## Goal

- **Roadmap phase:** Phase 9+ (cloud runner #2 — Anthropic Managed Agents).
- **Capabilities delivered:**
  - A `managedAgentAdapter` (`src/adapters/claude-managed-agent.ts`) implementing the `RunnerAdapter` interface from Brief 215.
  - Managed-Agents config Zod schema validating the per-project shape (`agent_id`, `agent_version` optional, `environment_id`, `vault_ids` optional array, `default_repo`, `default_branch`, `credential_service`).
  - Dispatch via `@anthropic-ai/sdk` Managed Agents calls — session create + first `user.message` event — using the existing SDK with the `managed-agents-2026-04-01` beta header.
  - 30-second polling cron (cadence per parent brief D11) reconciling `runner_dispatches.status` from `GET /v1/sessions/{id}` + recent events; cancellable via SDK; archives terminated sessions.
  - Terminal-state heuristic: session `terminated` → `failed`; session `idle` for more than `terminal_idle_threshold_ms` after the last `agent.message` with no pending tool use → `succeeded`; recent `agent.error` → `failed`. Documented limitation; GitHub PR-opened / PR-merged events remain the authoritative success signal for coding work.
  - Optional SSE event-stream layer: when `runner_config.observe_events = true`, the adapter subscribes to the session's SSE stream during dispatch and surfaces typed events (`agent.message`, `agent.tool_use`, `agent.error`) to the work-item activity log; off by default (cost + reliability).
  - GitHub fallback signal path: same `pull_request` + `workflow_run` + `deployment_status` subscription pattern as Brief 216 (reused, not duplicated).
  - Vercel preview URL inline card: same emission rule as Brief 216 §D5 (centralised so both runners share one handler).
  - Health check (config-validity only — no live API call).
  - Optional in-prompt callback path (per parent §D7): if `runner_config.callback_mode = 'in-prompt'`, the adapter composes a callback section into the first `user.message` event using the same ephemeral-token discipline as Brief 216 (§D3); off by default (polling is primary).
  - Status decoder filling Brief 215's webhook-schema placeholder for `runner_kind: 'claude-managed-agent'` — used by the optional in-prompt callback path AND forward-compatible for a future Anthropic-shipped completion webhook.
  - End-to-end smoke against agent-crm: session create → `/dev-review` runs in-session → PR opened → Vercel preview surfaces → polling cron transitions `runner_dispatches.status` to `succeeded`.

## Context

The user's revised pipeline spec (`.context/attachments/pasted_text_2026-04-25_21-14-58.txt:30`) names `claude-managed-agent` as a sibling cloud runner to `claude-code-routine`, with a different fit envelope. Routines are "fire and forget" — submit a single `text` body, return session ID synchronously, watch GitHub for the PR. Managed Agents earn complexity when the work needs steering (mid-flight `user.interrupt`), structured tool confirmations (`always_ask` permission policy + `user.tool_confirmation` events), or rubric-graded outcomes (`user.define_outcome` + Outcomes evaluator). At MVP this brief ships the dispatcher only — no steering UI, no Outcomes wiring; the steering surface arrives in a future polish brief if user demand surfaces.

Anthropic Managed Agents is beta (launched April 2026). HTTP/SDK shape:
- `POST /v1/sessions` with body `{ agent: <agent_id> | { type: 'agent', id, version }, environment_id, vault_ids? }` → returns `{ id, status: 'idle' | 'running' | 'rescheduling' | 'terminated', … }`.
- `POST /v1/sessions/{id}/events` with `{ events: [{ type: 'user.message', content: [{ type: 'text', text: '<prompt>' }] }] }` kicks off work.
- `GET /v1/sessions/{id}` returns current status.
- `GET /v1/sessions/{id}/events` (SSE) streams typed events.
- `POST /v1/sessions/{id}/archive` and `DELETE /v1/sessions/{id}` for lifecycle cleanup.
- Auth: `x-api-key` (Anthropic API key) + `anthropic-beta: managed-agents-2026-04-01`.

Brief 214 §D11 sets the default-review-path discipline: every cloud runner's prompt invokes the `/dev-review` skill in-session; its output surfaces as a PR comment. Brief 216 implements this for Routines via in-prompt instructions. Brief 217 implements the same for Managed Agents — the first `user.message` event carries the same prompt-composition shape (work-item body + `/dev-review` directive + optional callback section).

**Distinct from Brief 216 in shape:**
- **Status path is polling-primary** (Anthropic gives lifecycle via `GET /v1/sessions/{id}`), not in-prompt-callback-primary. The polling cron is the canonical signal; in-prompt callback is OPTIONAL (off by default).
- **No mandatory ephemeral callback token.** Polling needs no callback token. The token discipline only applies when `callback_mode = 'in-prompt'`.
- **Agent + Environment lifecycle is per-project, not per-dispatch.** The Agent is created once in Anthropic's UI/CLI; per-dispatch we just create a session against it. Brief 217 does NOT auto-create Agents (out of scope per Non-Goals).
- **Session archival/deletion** is a lifecycle Ditto owns (Brief 216 has no equivalent — Routines are fire-and-forget).

## Objective

Ship the smallest production-shape Managed Agents dispatcher that lets a Ditto work item dispatch to a project's pre-configured Anthropic Managed Agent, runs `/dev-review` in-session, captures terminal state via polling (with optional SSE + GitHub fallback), and surfaces the resulting PR + Vercel preview URL in the work-item conversation — phone-friendly throughout, byte-for-byte parallel to Brief 216 in user-visible affordances.

## Non-Goals

- **No optional integrations (Greptile / Argos / etc.).** Brief 219 owns detection + opt-in wiring. This brief ships the default-review-path only (`/dev-review` skill in-session + Vercel preview URL inline card via the shared GitHub-fallback handler).
- **No deploy gate state machine.** Brief 220 owns `ready-to-deploy → deploying → deployed | deploy_failed`. This brief surfaces the PR + Vercel preview URL but does NOT advance work-items past `review`.
- **No mobile UX polish.** Brief 221 owns the runner pill, "Run on:" selector, retry buttons. This brief emits conversation-surface inline cards using existing `ContentBlock` types — no new primitives.
- **No agent auto-creation via API.** The user creates the Agent + Environment in Anthropic's web UI or via the `ant` CLI, then pastes the `agent_id` and `environment_id` into Ditto's runner-config form (Brief 215's admin scaffold). Auto-creating Agents requires `POST /v1/agents` calls + versioning lifecycle that doesn't pay back at this scope.
- **No mid-flight steering (`user.interrupt`, `user.tool_confirmation`, `user.define_outcome`).** These are first-class Managed-Agents primitives but require dedicated UX surface (where does an "approve this tool call" prompt land in the work-item conversation?). Future polish brief; out of scope here. Tools execute under the Agent's saved `always_allow` permission policy until then.
- **No Outcomes (rubric-graded) integration.** The `user.define_outcome` + grader evaluator pattern is architecturally interesting (matches Ditto's spec-testing review pattern per `claude-managed-agents-architectural-review.md`), but the integration point is non-trivial and the default review path (`/dev-review` in-session) already covers Brief 214's review discipline. Future brief.
- **No multi-agent orchestration (coordinator + callable agents).** Managed Agents supports multi-agent threads (research preview); Ditto's review patterns (maker-checker, adversarial) could in theory map to this. Out of scope for the MVP dispatcher; the architectural review documents the long-term opportunity.
- **No memory-store integration.** Managed Agents memory stores (path-based, versioned, optimistic-concurrency via `content_sha256`) are research-preview and architecturally adjacent to Ditto's `memories` table. Brief 217 does not bridge them. Future brief if/when Ditto's memory system adopts the version-auditing pattern.
- **No multi-session-per-project orchestration.** One project has at most one configured `claude-managed-agent` runner row in `project_runners`. Multiple agents per project (e.g., one for review, one for spec-testing) is a future enhancement.
- **No native-Ditto-process scheduling via Managed Agents.** This brief dispatches *coding* work items (project-bound). Ditto's internal processes stay on step.executor + existing adapters.
- **No retry-on-rate-limit at the adapter level.** Brief 215's `runner-dispatcher.ts` handles fallback-chain advancement on rate-limit / timeout / error. The adapter reports the failure mode; the dispatcher decides next-attempt routing.
- **No live event-stream view in `/review/[token]`.** SSE events (when enabled via `observe_events = true`) surface as activity-log entries, NOT a live xterm.js view. Future polish.
- **No e2b-sandbox fallback within this brief.** Brief 215 reserves the kind; the dispatcher skips kinds with no registered adapter.

## Inputs

1. `docs/briefs/214-cloud-execution-runners-phase.md` — parent; §D2 (kind enum), §D5 (chain resolution), §D7 (status webhook polymorphism), §D8 (trust integration), §D9 (engine-core boundary), §D10 (Insight-180), §D11 (default review path) are binding for this brief.
2. `docs/briefs/215-projects-and-runner-registry.md` — substrate; the `RunnerAdapter` interface (with `WorkItemRef`, `ProjectRef`, `ProjectRunnerRef`, `DispatchExecuteContext`, `DispatchResult`, `DispatchStatusSnapshot`, `HealthCheckResult`, `CancelResult`), the `runner_dispatches` schema, the `runner-registry.ts` registration pattern, and the polymorphic webhook Zod schema with the `claude-managed-agent` placeholder this brief tightens.
3. `docs/briefs/216-routine-dispatcher.md` — sibling cloud runner, ahead in the build order. Provides the prompt-composition pattern (§D2), GitHub fallback subscription model (§D4), Vercel-preview detection rule (§D5), `/dev-review` skill availability discipline (§D7), trust integration (§D8), and the Insight-180 spike-test-first pattern. This brief reuses the GitHub fallback + Vercel detection handlers (centralised in `src/engine/github-events/cloud-runner-fallback.ts` — extracted from Brief 216's `routine-fallback.ts` if 216 has merged, OR named there directly if 217 ships first).
4. `docs/briefs/223-projects-schema-and-crud.md` — provides the `POST /api/v1/work-items/:id/status` endpoint, `projects.runnerBearerHash` (long-lived auth), and the bearer-acceptance pattern this brief consumes only when `callback_mode = 'in-prompt'` (optional).
5. `docs/research/cloud-runners.md` §B "claude-managed-agent" — research; HTTP/SDK contract, status path, steering surface, beta caveats, gaps named.
6. `docs/research/claude-managed-agents-architectural-review.md` — strategic context; layer-by-layer comparison; runtime-substrate framing.
7. `docs/landscape.md` §"Managed Agent Infrastructure (2026-04-09)" — classification PATTERN→DEPEND-eligible (now upgraded to DEPEND for this brief, since Brief 217 is the first concrete adopter — see §"Reference doc updates").
8. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every dispatch is a side-effecting function; `stepRunId` required at adapter entry.
9. `docs/insights/180-spike-test-every-new-api.md` — spike-test-first pattern. Brief 217 lands a spike test BEFORE wiring the adapter (one real session create + event send).
10. `docs/insights/190-migration-journal-concurrency.md` — applies if this brief introduces a schema change (it does NOT — see §What Changes).
11. `docs/adrs/005-integration-architecture.md` — credential vault + integration registry pattern. The Anthropic API key for Managed Agents is stored in the vault keyed `runner.<projectSlug>.api_key` per the convention Brief 223 establishes. Distinct from a Claude-API key in `credentials` keyed `claude-api.api_key` (the existing `claudeAdapter` consumer) only in service-name; both encrypt the same kind of secret via the same vault primitive.
12. `docs/adrs/007-trust-earning.md` — trust tiers; the adapter calls `trust-gate.ts` BEFORE dispatching per Brief 214 §D8.
13. `src/engine/credential-vault.ts:112` — `getCredential(processId, service)` is the existing credential lookup used by the adapter for the outbound Anthropic API key.
14. `src/adapters/claude.ts` — existing `claudeAdapter` (Anthropic SDK consumer for `ai-agent` step.executor). Reference shape; this brief ships a SIBLING adapter at the runner level, not a step-executor adapter. The two coexist.
15. `src/adapters/local-mac-mini.ts` — Brief 215's substrate adapter shape. Brief 217's adapter follows the same `createXAdapter(opts)` factory pattern (returns a `RunnerAdapter`).
16. `src/adapters/claude-code-routine.ts` (post-Brief-216 merge) — Brief 216's adapter; this brief mirrors its file structure (config schema, factory, execute/status/cancel/healthCheck) and reuses its prompt-composition module if applicable. If 216 ships AFTER 217, the prompt-composition module is named here and 216 consumes it; if 216 ships first, 217 reuses.
17. Anthropic Managed Agents docs — [platform.claude.com/docs/en/managed-agents/overview](https://platform.claude.com/docs/en/managed-agents/overview), `…/sessions`, `…/events-and-streaming` — SDK contract.
18. `@anthropic-ai/sdk` — already in stack; this brief uses the Managed Agents surface (beta header set per request, not at client-construction time, so the SDK can be reused for both `claude-api` and `claude-managed-agent` without conflict).

## Architectural Decisions

**D1: Adapter location is product layer.** `src/adapters/claude-managed-agent.ts` ships the implementation. Engine-core scope: only the Managed-Agents-specific webhook payload Zod schema (tightening Brief 215's `claude-managed-agent` placeholder in `packages/core/src/runner/webhook-schema.ts`) and the polling cadence constant (added to `packages/core/src/runner/poll-cadences.ts` per parent brief — created in this brief if Brief 216 didn't ship it; shared with Brief 218). The SDK calls, prompt composition, polling cron, GitHub-fallback subscription, and Vercel-preview detection are Ditto-product opinions.

**D2: Polling-primary status path with terminal-state heuristic.** The 30-second polling cron (cadence per parent §D11) calls `managedAgentAdapter.status(dispatchId, externalRunId)` for every `runner_dispatches` row in non-terminal state (`queued | dispatched | running`). The adapter calls `GET /v1/sessions/{id}` plus `GET /v1/sessions/{id}/events?limit=20` (last events) and applies the heuristic:

| Session API status | Last event(s) | `runner_dispatches.status` |
|--------------------|---------------|----------------------------|
| `terminated` | n/a | `failed` (errorReason: terminate reason if present) |
| `running` | n/a | `running` |
| `rescheduling` | n/a | `running` (transient — Anthropic moving the container) |
| `idle` | last `agent.message` finished AND idle for > `terminal_idle_threshold_ms` (default 30s, configurable) | `succeeded` |
| `idle` | recent `agent.error` event | `failed` (errorReason: error event message; pattern-match for rate_limit / timeout to map to `rate_limited` / `timed_out`) |
| `idle` | last event is a pending `agent.tool_use` awaiting confirmation | `running` (steering surface absent at MVP — the agent is effectively stuck waiting for a confirmation we never send; treat as still running until the staleness sweeper from Brief 215 marks it orphaned) |
| `idle` | session created < `dispatch_grace_ms` ago (default 5s) | `running` (just dispatched; not yet terminal) |

The heuristic is conservative: ambiguous idle states stay `running` until either the GitHub PR-merged event arrives (authoritative success), the `dispatch_max_age_ms` orphan sweeper fires, or a subsequent poll resolves to `succeeded`. Documented as a known limitation; the GitHub fallback (PR-opened, PR-merged) is the production-grade success signal for coding work.

**D3: Per-dispatch ephemeral callback token is OPTIONAL.** Default is polling-only. When `runner_config.callback_mode = 'in-prompt'` is set, the adapter generates an ephemeral callback token (same shape as Brief 216 §D3 — bcrypt cost 12 hash, stored on `runner_dispatches.callback_token_hash`, plaintext only in the prompt's INTERNAL section, TTL = `dispatch_max_age_ms`). The composed prompt's INTERNAL section is identical in shape to Brief 216 §D2 — same status webhook URL, same body shape (`runner_kind: 'claude-managed-agent'`, `state`, `prUrl?`, `error?`, `stepRunId`, `externalRunId`). When `callback_mode` is unset (default), no token is generated, no INTERNAL section appears in the prompt, and `runner_dispatches.callback_token_hash` is NULL. Reuses the column Brief 216 added — no schema change here.

**D4: Prompt composition reuses Brief 216's pattern.** The first `user.message` event sent to the session contains a composed prompt with two sections (three when `callback_mode = 'in-prompt'`):

```
<work-item-body>

---

When implementation is complete, run /dev-review and post its output as a PR comment.

[OPTIONAL — only when callback_mode='in-prompt']
---

INTERNAL: When the session terminates (success or failure), POST status to:
  <statusWebhookUrl>
With Authorization: Bearer <ephemeralCallbackToken>
And body: { "runner_kind": "claude-managed-agent", "state": "<succeeded|failed|cancelled>", "prUrl": "<pr-url-if-opened>", "error": "<message-if-failed>", "stepRunId": "<stepRunId>", "externalRunId": "<session_id>" }
```

The `composePrompt()` function lives at `src/adapters/cloud-runner-prompt.ts` (renamed from Brief 216's `routine-prompt.ts` to reflect cross-runner reuse). If Brief 216 has merged, this brief renames the file + extracts the composition logic into a kind-agnostic core (the work-item body + `/dev-review` directive sections are identical across runners; only the INTERNAL section's `runner_kind` literal differs). If Brief 217 ships first, `cloud-runner-prompt.ts` is created here and Brief 216 consumes it. **Coordination guard:** the renamer/extractor must run as the FIRST commit in this brief (or 216, whichever ships second) and the consuming adapter file imports from the new path; the second brief's PR description names this rename as a coordination point.

**D5: Skill availability — same two-path discipline as Brief 216 §D7.** Catalyst projects (`harnessType='catalyst'`): the cloned repo carries `.catalyst/skills/dev-review/SKILL.md`; the Managed Agents session reads it from the cloned working tree (via the Agent's saved bash + file-read tools). Native-Ditto projects (`harnessType='native'` or `'none'`): `composePrompt()` inlines the skill text from Ditto's deployed binary (`<dittoRoot>/.catalyst/skills/dev-review/SKILL.md`, configurable via `DITTO_DEV_REVIEW_SKILL_PATH`). 4 KB cap with truncation marker (matches Brief 216's reduction from 8 KB after the safety-margin discipline). If the file is missing at dispatch time, `composePrompt()` errors and the dispatch is rejected before SDK call with `errorReason = "dev-review-skill-missing-from-deployment"`.

**D6: GitHub fallback subscription is shared with Brief 216.** Brief 216 ships `src/engine/github-events/routine-fallback.ts` (`pull_request` + `workflow_run` + `deployment_status` handlers). Brief 217 renames or extends that file to `src/engine/github-events/cloud-runner-fallback.ts` (kind-agnostic). The handler reads the matching `runner_dispatches` row's `runnerKind` and routes per kind only where behaviour differs (e.g., the deep-link to the live session URL is kind-specific). For `claude-managed-agent` the deep-link points at `https://platform.claude.com/sessions/<session_id>` (the Managed-Agents console URL). The `webhookSubscriptions` static field on the adapter declares the same three event types as Brief 216 — registry collects from all adapters at boot.

**Coordination with Brief 216:** if 216 has merged, this brief renames `routine-fallback.ts` → `cloud-runner-fallback.ts` (or wraps it). If 217 ships first, this brief creates `cloud-runner-fallback.ts` directly and Brief 216 consumes it. Same coordination guard as D4.

**D7: Vercel preview URL inline card emission is shared with Brief 216.** Same precise detection rule (§D5 in Brief 216): `state === "success"` AND `environment !== "Production"` AND `environment !== project.deployTargetEnvironment`. Same fallback handler path. No duplication; the rule is owned by `cloud-runner-fallback.ts`.

**D8: Health check is config-validity only.** `managedAgentAdapter.healthCheck()` verifies (a) the credential exists in the vault keyed `runner.<projectSlug>.api_key`, (b) the configured `agent_id` parses as a non-empty string matching Anthropic's ID convention (`agt_<base32-or-similar>`), (c) the configured `environment_id` parses similarly. NO live API call — `GET /v1/agents/{id}` works as a probe but firing it on every health check has cost + rate-limit implications. If a dispatch later fails with 401, `last_health_status = 'unauthenticated'` updates reactively. **Optional manual probe:** an "Verify with API" button on the runner-config form (Brief 215 admin scaffold extension shipped here) makes a single `GET /v1/agents/{id}` call and updates `last_health_status = 'healthy' | 'unauthenticated' | 'unreachable'`. Manual-only; never automatic.

**D9: Trust integration consistent with Brief 214 §D8 / Brief 216 §D8.** Adapter calls `trust-gate.ts` BEFORE dispatch:
- `supervised` → `pause`. `runner_dispatches.status = 'queued'`; wait for /review/[token] approval; on approve → session create + `dispatched`.
- `spot_checked` sampled-in → `sample_pause`. Same.
- `spot_checked` sampled-out / `autonomous` → wire send immediately.
- `critical` → adapter rejected pre-dispatch.

**D10: Engine-core deliverable.** `packages/core/src/runner/webhook-schema.ts` `claude-managed-agent` placeholder is tightened to the same inline shape as `claude-code-routine`: `{ runner_kind: 'claude-managed-agent', state: 'running' | 'succeeded' | 'failed' | 'cancelled', prUrl?: string, error?: string, stepRunId: string, externalRunId: string }`. The current `payload: z.unknown()` wrapper is dropped (an oversight from Brief 215's substrate; harmonised here). State-mapping table (mirrors Brief 216):

| Webhook `state` | Webhook `error` field | `runner_dispatches.status` |
|-----------------|----------------------|----------------------------|
| `running` | n/a | `running` |
| `succeeded` | n/a | `succeeded` |
| `cancelled` | n/a | `cancelled` |
| `failed` | (absent or generic) | `failed` |
| `failed` | matches `/rate.?limit/i` | `rate_limited` |
| `failed` | matches `/timeout|timed.?out/i` | `timed_out` |

The `routineStateToDispatchStatus()` helper from Brief 216 is renamed `cloudRunnerStateToDispatchStatus()` (kind-agnostic) since the mapping is identical for both runners. Coordination guard: same as D4 / D6 — the rename happens in whichever brief ships second.

Polling cadence constant (`packages/core/src/runner/poll-cadences.ts`): adds entry `'claude-managed-agent': 30_000` per parent §D11. Created in this brief if not extant.

**D11: Insight-180 stepRunId guard at adapter entry.** `managedAgentAdapter.execute(ctx, workItem, project, projectRunner)` rejects calls where `ctx.stepRunId` is falsy BEFORE any DB write or SDK call. `runner_dispatches.stepRunId` FK enforced at the DB. `harness_decisions` row written keyed on `stepRunId` (per Brief 214 §"`harness_decisions` is the canonical audit destination").

**D12: Session lifecycle cleanup.** On terminal state (`succeeded | failed | timed_out | rate_limited | cancelled`), the polling cron calls `POST /v1/sessions/{id}/archive` (preserves session events + filesystem for the 30-day retention window per Anthropic docs; no new event acceptance). On dispatch cancel, calls `archive`. On `runner_dispatches` row deletion (admin-only path; out of scope at MVP), would call `DELETE /v1/sessions/{id}` to purge — not wired here. Archive failures are logged but do not block state-transition (the Anthropic docs say archived sessions are auto-purged after retention; failure to archive just leaves the session in `terminated` state).

**D13: Optional SSE event-stream observability.** When `runner_config.observe_events = true` (default `false`), the adapter opens an SSE subscription to `GET /v1/sessions/{id}/events` immediately after sending the first `user.message`. Events are filtered to a small allowlist (`agent.message`, `agent.tool_use`, `agent.tool_result`, `agent.error`) and surfaced as activity-log entries on the work item (existing `activities` table). The SSE connection is closed on terminal state OR after `sse_max_duration_ms` (default 30 min) whichever comes first. **Robustness:** SSE failures (connection drop, 5xx) downgrade silently to polling-only; do not fail the dispatch. SSE is a UX enhancement, not a correctness path.

**D14: Coordination with Brief 216 (sibling cloud runner).** Three coordination points are explicit (per D4, D6, D10):
1. Prompt composition module: `src/adapters/cloud-runner-prompt.ts` (kind-agnostic). Whichever brief ships second renames Brief 216's `routine-prompt.ts` → `cloud-runner-prompt.ts` and extracts the kind-specific bits into the caller (just the `runner_kind` literal in the INTERNAL section).
2. GitHub fallback handler: `src/engine/github-events/cloud-runner-fallback.ts` (kind-agnostic). Whichever brief ships second renames Brief 216's `routine-fallback.ts` → `cloud-runner-fallback.ts` and routes by `runnerKind` only where behaviour differs.
3. Webhook-schema helper: `cloudRunnerStateToDispatchStatus()` (kind-agnostic). Whichever brief ships second renames Brief 216's `routineStateToDispatchStatus()`.

The renamer commit lands FIRST in the second-shipping brief's PR; any consumer-side breakage is fixed in the same PR. **If Brief 216 and 217 are reviewed concurrently:** the architect re-reads both PRs against this coordination plan; reviewer agent flags any overlap not addressed by this discipline.

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/runner/webhook-schema.ts` | **Modify** — tighten the `claude-managed-agent` placeholder to the inline shape in D10. Drop the `payload: z.unknown()` wrapper (oversight from Brief 215's substrate). If Brief 216 has merged: rename `routineStateToDispatchStatus()` → `cloudRunnerStateToDispatchStatus()` (kind-agnostic; the mapping is identical for both runners); update Brief 216's import. If 217 ships first: name it `cloudRunnerStateToDispatchStatus()` directly so Brief 216 consumes the kind-agnostic name. |
| `packages/core/src/runner/webhook-schema.test.ts` | **Modify** — add tests for `claude-managed-agent` payload parsing: valid happy-path payload accepts; invalid payloads (missing required fields, unknown state values, malformed `prUrl`) reject with Zod errors. |
| `packages/core/src/runner/poll-cadences.ts` | **Create OR Modify** — exports `pollCadenceMs: Partial<Record<RunnerKind, number>>` (Partial because not every kind needs polling). If Brief 218 ships first, this file already exists; this brief adds `'claude-managed-agent': 30_000`. If 217 is first, this brief creates the file with `'claude-managed-agent': 30_000` only, leaving `'github-action': 60_000` for Brief 218 to add. **Parent-spec deviation noted:** parent 214 §"Webhook recovery via polling" mentions a 5-minute Routines polling cadence; Brief 216 elected NOT to wire a Routines poller (it relies on Brief 215's existing staleness sweeper + GitHub events alone — see Brief 216 §Constraints "Webhook recovery via polling"). Brief 217 honours that decision: `'claude-code-routine'` is NOT added to the cadence map. The cron iterates only kinds whose adapters export a meaningful live-API `status()` (managed-agent + github-action). If Routines later need finer-grained polling, a follow-up brief wires it; the design supports the addition. |
| `src/adapters/claude-managed-agent.ts` | **Create** — `managedAgentAdapter` factory (`createManagedAgentAdapter(opts: { sdk: Anthropic, db: Database })`) returning a `RunnerAdapter`. Sections: <br>(a) `configSchema` Zod for `{ agent_id, agent_version?, environment_id, vault_ids?, default_repo, default_branch, credential_service, callback_mode?: 'polling' \| 'in-prompt', observe_events?: boolean }`. <br>(b) `healthCheck()` — config-validity only per D8. <br>(c) `execute(ctx, workItem, project, projectRunner)` — Insight-180 guard, optional ephemeral-token generation when callback_mode=in-prompt, prompt composition via `composePrompt()`, `sdk.beta.managedAgents.sessions.create({ agent: { type: 'agent', id, version }, environment_id, vault_ids })`, `sdk.beta.managedAgents.sessions.events.create({ session_id, events: [user.message] })`, return `DispatchResult` with `externalRunId = session.id`, `externalUrl = 'https://platform.claude.com/sessions/<id>'`. <br>(d) `status(dispatchId, externalRunId)` — calls `sdk.beta.managedAgents.sessions.retrieve(externalRunId)` + `sdk.beta.managedAgents.sessions.events.list(externalRunId, { limit: 20 })`, applies the heuristic from D2, returns `DispatchStatusSnapshot`. <br>(e) `cancel(dispatchId, externalRunId)` — calls `sdk.beta.managedAgents.sessions.archive(externalRunId)` (best-effort; archive does not "cancel" mid-flight work but stops further events). <br>`supportsCancel: true`. ~300 LOC. |
| `src/adapters/claude-managed-agent.test.ts` | **Create** — unit tests with mocked SDK + clock: stepRunId guard rejects pre-DB, prompt composition includes work-item body + /dev-review (and callback section when in-prompt mode), session.create called with correct beta header, session.events.create called with composed prompt, response parses session.id correctly, status heuristic produces correct mapping for all 6 cases in D2's table. |
| `src/adapters/cloud-runner-prompt.ts` | **Create OR Rename** — kind-agnostic prompt composer. If Brief 216 has merged: renamed from `src/adapters/routine-prompt.ts` (this brief's first commit); the runner-kind literal in the INTERNAL section becomes a parameter (`runnerKind: RunnerKind`). If 217 ships first: created here with the same shape; Brief 216 consumes via import. ~150 LOC (work-item body interpolation, `/dev-review` directive, conditional INTERNAL section, kind-aware skill loading, 4 KB cap). |
| `src/adapters/cloud-runner-prompt.test.ts` | **Create OR Modify** — tests for catalyst-vs-native skill loading, callback section emission only when ephemeral token present, kind-agnostic INTERNAL section formatting (the `runner_kind` literal differs), 4 KB cap with truncation marker. |
| `src/engine/runner-status-handlers/managed-agent.ts` | **Create** — decoder consuming the `claude-managed-agent` discriminated-union branch from Brief 223's status webhook (only fires when `callback_mode = 'in-prompt'` is set). Validates the bearer (per-dispatch ephemeral OR project bearer), updates `runner_dispatches.status` per Brief 215's state machine, writes `harness_decisions` audit row, posts conversation inline card. ~120 LOC (smaller than Brief 216's because the optional path is narrower). |
| `src/engine/runner-status-handlers/managed-agent.test.ts` | **Create** — integration tests with fixture HTTP requests: valid payload + valid ephemeral token → status advances; valid payload + project bearer → status advances; invalid bearer → 401. Plus the "callback_mode=polling" path (handler not invoked) verified. |
| `src/engine/github-events/cloud-runner-fallback.ts` | **Create OR Rename** — kind-agnostic GitHub webhook subscription handler. Renamed from Brief 216's `routine-fallback.ts` if 216 has merged (with kind-routing added). If 217 ships first: created here with both runner kinds' fallback paths; Brief 216 consumes via import. Routes `pull_request` + `workflow_run` + `deployment_status` events to the matching `runner_dispatches` row by repo + branch. Per-kind difference is the deep-link URL (`https://claude.ai/code/session_…` for routine; `https://platform.claude.com/sessions/<id>` for managed-agent). ~250 LOC. |
| `src/engine/github-events/cloud-runner-fallback.test.ts` | **Create OR Modify** — fixture tests covering: PR-opened maps to correct dispatch, PR-merged transitions `succeeded`, deployment_status non-production emits Vercel preview card, deployment_status production no-ops, late callback after merge rejected, both runner-kinds covered. |
| `src/engine/runner-poll-cron.ts` | **Create OR Modify** — periodic cron walking non-terminal `runner_dispatches` rows by `runnerKind`, applying each kind's `pollCadenceMs`, calling `adapter.status()`, persisting state transitions. Reuses Brief 215's state machine (`transition()`); rejects illegal transitions silently (logged). ~200 LOC. **If Brief 216 already shipped a poll cron for routines:** this brief generalises that cron to walk all kinds, not just routines. **If 217 ships first:** this brief creates the cron with `claude-managed-agent` as the only registered kind; Brief 216 / 218 add their kinds via the cadence map. Coordination guard: cron file path is `src/engine/runner-poll-cron.ts` regardless of order. |
| `src/engine/runner-poll-cron.test.ts` | **Create OR Modify** — integration tests: cron skips terminal-state rows; cron polls running rows at the kind's cadence; illegal transitions logged not thrown; cron survives adapter throw (one row's failure does not skip subsequent rows). |
| `src/engine/runner-registry.ts` | **Modify** — register `managedAgentAdapter` for `claude-managed-agent` kind (Brief 215 ships the registry seeded with `local-mac-mini`; Brief 216 adds `claude-code-routine`; this brief adds `claude-managed-agent`). |
| `src/engine/runner-config-schemas.ts` | **Modify** — replace the placeholder `claudeManagedAgentSchema` (currently just `agentId` + `credentialService`) with the full schema from `managedAgentAdapter.configSchema` (re-exported from the adapter file to keep one source of truth). |
| `packages/web/app/projects/[slug]/runners/page.tsx` | **Modify** — enable the `claude-managed-agent` option in the kind selector (Brief 215 ships it disabled with tooltip; this brief flips it to enabled). Add the kind-specific config form: agent_id input, optional agent_version input (integer), environment_id input, optional vault_ids multi-input, default_repo + default_branch inputs, credential_service paste field (the Anthropic API key, sent to credential vault on submit, never stored in `project_runners.config_json`), `observe_events` checkbox (default off), `callback_mode` radio (`polling` default, `in-prompt` advanced). "Verify with API" button (per D8) calls a new endpoint that probes `GET /v1/agents/{agent_id}` and updates `last_health_status`. |
| `packages/web/app/api/v1/projects/[id]/runners/route.ts` | **Modify** — when `kind: 'claude-managed-agent'` is POSTed, validate the body against `managedAgentAdapter.configSchema`, write the API key to the credential vault keyed `runner.<projectSlug>.api_key` per ADR-005 boundary-encryption pattern, replace plaintext key with `credential_service` reference in the persisted `config_json`. |
| `packages/web/app/api/v1/projects/[id]/runners/[kind]/verify/route.ts` | **Create** — `POST` to trigger the optional manual `GET /v1/agents/{id}` probe per D8. Updates `project_runners.last_health_status`; returns the new status. Mobile-friendly response. |
| `packages/web/app/api/v1/work-items/[id]/status/route.ts` | **Modify** — extend the runner-kind dispatch table (added by Brief 216 for `claude-code-routine`) with `claude-managed-agent` routing to `runner-status-handlers/managed-agent.ts`. Bearer-acceptance shape unchanged (project bearer OR per-dispatch ephemeral, owned by Brief 223 + Brief 216's extension). |
| `docs/dictionary.md` | **Modify** — add: Managed Agent, Managed Agents Session, Polling-Primary Status, Terminal-State Heuristic, Cloud Runner Prompt Composer (the cross-runner term replacing Brief 216's routine-specific naming), Optional In-Prompt Callback. |
| `docs/landscape.md` | **Modify** — promote Managed Agents entry from PATTERN→DEPEND-eligible to DEPEND (sub-brief 217 is the concrete adopter); add a one-line "Adopted in Brief 217" footer; document the polling cadence + heuristic as a known-limitation note. |
| `.env.example` | **Modify** — document `MANAGED_AGENT_TERMINAL_IDLE_THRESHOLD_MS` (default 30000 / 30 sec), `MANAGED_AGENT_DISPATCH_GRACE_MS` (default 5000), `MANAGED_AGENT_SSE_MAX_DURATION_MS` (default 1800000 / 30 min), `MANAGED_AGENT_BETA_HEADER` (default `managed-agents-2026-04-01`). `DITTO_DEV_REVIEW_SKILL_PATH` already documented by Brief 216. |
| `src/engine/spike-tests/managed-agent-dispatch.spike.test.ts` | **Create** — Insight-180 spike test pattern: ONE real SDK roundtrip — create a session against a real configured Agent + Environment, send one `user.message` event, verify the response shape, then archive the session. Skipped in CI (requires real Anthropic API key + real Agent ID + real Environment ID); runnable locally via `pnpm vitest run src/engine/spike-tests/managed-agent-dispatch.spike.test.ts`. **Run BEFORE wiring the adapter per Insight-180 spike-first pattern.** Lands in own commit. |

## Constraints

- **Engine-first per CLAUDE.md.** The webhook payload Zod schema is engine-core (cross-runner contract) along with the polling cadence map. Everything else (SDK calls, prompt composition, polling cron, GitHub fallback, conversation card emission) is product layer. The kind-agnostic prompt composer + GitHub fallback live in `src/` (product) because they consume Ditto-product surfaces (work-item conversations, GitHub integration). Test: could ProcessOS use them? Partially — the prompt-shape-with-INTERNAL-section pattern is portable but the GitHub fallback and conversation-surface emission are Ditto-flavoured.

- **Side-effecting function guard (Insight-180) — MANDATORY.** `managedAgentAdapter.execute()` requires `stepRunId` in `ctx`; rejects pre-DB-write if missing (except `DITTO_TEST_MODE`). Verified by AC #4. Spike test (`managed-agent-dispatch.spike.test.ts`) lands in own commit BEFORE other AC code per Insight-180 spike-first.

- **Trust integration via existing `trust-gate.ts` per Brief 214 §D8.** Adapter does NOT make trust decisions; trust-gate produces a `TrustAction` BEFORE dispatch and the adapter honours it via `ctx.trust`.

- **`harness_decisions` audit row per dispatch** (`processRunId`, `stepRunId`, `trustTier`, `trustAction`, `reviewDetails.runner = { runnerKind: 'claude-managed-agent', runnerMode: 'cloud', externalRunId: <session_id>, attemptIndex }`). No new audit table.

- **No schema changes.** This brief reuses `runner_dispatches.callback_token_hash` (added by Brief 216) when `callback_mode = 'in-prompt'`; the polling-default path requires no schema additions. **Verified by grep:** if this brief introduces a new column or table, that is a defect — flag it. Brief 215 ships the substrate; Brief 216 adds the optional callback column; Brief 217 reuses both.

- **No bearer or API-key plaintext at rest, ever.** Outbound Anthropic API key encrypted in vault keyed `runner.<projectSlug>.api_key`. Inbound per-dispatch ephemeral token (when `callback_mode = 'in-prompt'`): bcrypt-hashed (cost 12); plaintext exists only in the prompt sent to Anthropic and is forgotten by Ditto immediately after dispatch.

- **Reuse existing primitives.** Credential vault (`src/engine/credential-vault.ts`), `@anthropic-ai/sdk` (already used by `claudeAdapter`), GitHub integration (existing — for webhook subscription via the kind-agnostic `cloud-runner-fallback.ts`), conversation surface inline cards (existing `ContentBlock` types), `harness_decisions` audit, `runner_dispatches` state machine (Brief 215). Do not invent parallel substrates.

- **Mobile-first per ADR-018.** The `/projects/[slug]/runners` form additions for managed-agent config (agent_id, agent_version, environment_id, vault_ids, API-key paste, observe_events checkbox, callback_mode radio, "Verify with API" button) MUST work on a phone — touch targets ≥44pt, no horizontal scroll on long IDs (truncate-with-tap-to-expand), sticky bottom action bar.

- **Beta API discipline.** Anthropic's `managed-agents-2026-04-01` beta header MUST be sent on every Managed Agents SDK call. The adapter accepts a `beta_header` field in `runner_config` (defaulting to the constant) so a future header version can be deployed without a code change. `claudeAdapter` (the `ai-agent` step.executor) does NOT use this header; the two coexist on the same SDK client without conflict because the beta header is per-request, not per-client.

- **No spamming Managed Agents for health checks.** Health check is config-validity only (D8). The "Verify with API" button is the only path to a live API call, and it's manual.

- **Output cap discipline.** SSE event payloads can be large; the SSE handler caps surfaced events at 4 MB total per dispatch (truncate with marker, downgrade to polling-only after the cap). Matches Brief 212's bridge-job 4 MB cap.

- **Webhook recovery via polling — primary path here.** The polling cron is the recovery mechanism; SSE drops downgrade silently to polling. If Ditto is down when a session terminates, the next poll cycle catches up (sessions are 30-day-retained; the dispatch row is reconciled on the next cron tick).

- **Session archival is best-effort.** Archive failures do not block state-transition. Logged as warnings.

- **No native mid-flight cancellation.** `archive` stops further events but does not interrupt in-flight tool execution. The "Verify with API" + admin "Force terminate" path (out of scope here) would require a future polish brief.

- **Side-effecting function guard cross-application:** the `runner-poll-cron.ts` itself is NOT a side-effecting function under Insight-180 (it observes external state, doesn't mutate it). The `archive` call IS side-effecting but is gated by the dispatch already having a `stepRunId` audit row written at execute-time. No additional `stepRunId` parameter needed on the cron.

- **Idempotency on poll-driven state transitions.** Each poll calls the state machine's `transition()` function; illegal transitions return an Error which is logged and swallowed. The state machine guarantees terminal-state rows are not re-transitioned.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| `RunnerAdapter` interface | `docs/briefs/215-projects-and-runner-registry.md` §What Changes — `interface.ts` code block | depend (sibling brief) | Brief 215 is the contract source; this brief implements it. |
| Managed Agents SDK contract | `platform.claude.com/docs/en/managed-agents/{overview,sessions,events-and-streaming}` | depend (service) | Anthropic's beta public docs; the SDK calls (`sessions.create`, `sessions.events.create`, `sessions.retrieve`, `sessions.events.list`, `sessions.archive`) are the only documented dispatch surface. |
| `managed-agents-2026-04-01` beta header | `platform.claude.com/docs/en/managed-agents/overview` | depend (service) | Required header; absence rejected with 400. |
| `@anthropic-ai/sdk` SDK reuse | `src/adapters/claude.ts` (existing `claudeAdapter`) | depend (existing) | Same SDK consumer pattern; no new dependency. The Managed Agents surface uses the same client with the per-request beta header. |
| `/dev-review` skill content | `.catalyst/skills/dev-review/SKILL.md` (Ditto's own canonical) | adopt (self-reuse) | Same skill text Ditto's `/drain-queue` autopilot uses; Brief 216 establishes the pattern for cloud runners. |
| Polling-with-terminal-heuristic for status | researcher report `docs/research/cloud-runners.md` §B "Status back-channel" — names polling + SSE as the two-path | original to Ditto | Anthropic doesn't ship a native completion event for "agent finished its assigned work." The heuristic is original; the polling cadence (30s) is the user's spec. |
| Cross-runner prompt composer (`cloud-runner-prompt.ts`) | Brief 216 §D2 + this brief §D4 | pattern (sibling brief) | The work-item body + /dev-review directive shape is identical across runners; the runner_kind literal in the INTERNAL section is the only kind-specific bit. Extraction rationale documented in §D14. |
| Cross-runner GitHub fallback (`cloud-runner-fallback.ts`) | Brief 216 §D4 + this brief §D6 | pattern (sibling brief) | The PR-opened / PR-merged / deployment_status path is identical across cloud runners. Per-kind branching is one if-else (deep-link URL). |
| Per-dispatch ephemeral callback token (optional) | Brief 216 §D3 | pattern (sibling brief) | The token discipline (bcrypt cost 12, in-prompt-only plaintext, TTL = dispatch_max_age_ms) is the same. Reused — no new column. |
| `cloudRunnerStateToDispatchStatus()` mapping | Brief 216 webhook-schema state map | pattern (sibling brief) | Identical mapping for both runners; renamed kind-agnostic. |
| Vercel preview URL detection rule | Brief 216 §D5 | pattern (sibling brief) | Same precise rule (state=success AND environment != Production AND environment != project.deployTargetEnvironment). |
| 30-second polling cadence | User pipeline spec `.context/attachments/pasted_text_2026-04-25_21-14-58.txt:30` | adopt (canonical) | User-named cadence; Routines is 5min (slow because GitHub events primary), Managed Agents is 30s (faster because polling primary). |
| `managedAgentAdapter.cancel = archive` | `platform.claude.com/docs/en/managed-agents/sessions` — archive endpoint contract | depend (service) | Anthropic's archive is the only available "stop further events" surface at preview; documented limitation that it does not interrupt in-flight tool execution. |
| Spike test before adapter wires | `docs/insights/180-spike-test-every-new-api.md` (Insight-180 spike pattern) | pattern (project-internal) | Brief 212 + Brief 216 precedent: spike landing in own commit, run before all other ACs to verify auth + endpoint + response shape work end-to-end. |
| bcrypt cost 12 hash for callback token | Brief 216 §D3 + Brief 200 §Constraints | depend (self-reuse) | Existing Ditto convention (only relevant when `callback_mode = 'in-prompt'`). |
| Credential vault outbound storage | `src/engine/credential-vault.ts` + ADR-005 boundary-encryption | depend (existing) | Outbound Anthropic API key encrypted at rest, keyed `runner.<projectSlug>.api_key`. |

## User Experience

- **Jobs affected:** Delegate (the user delegates a coding work item to the Managed Agents runner — a longer-running, polling-driven cloud path), Decide (the user reviews the session URL + the resulting PR + Vercel preview before approving merge), Capture (managed-agent started, PR opened, preview ready, /dev-review comment posted — all surface as inline cards via the same primitives as Brief 216), Review (the agent's `/dev-review` output is one of two review signals; human PR review is the other).
- **Primitives involved:** Managed-agent config form on `/projects/[slug]/runners` (added by this brief). Runner pill on work items shows "Cloud · managed-agent". All conversation-surface cards use existing `ContentBlock` types (text + link + status-badge); no new primitives.
- **Process-owner perspective:** the user creates an Agent + Environment in Anthropic's web UI (or via `ant` CLI) once per project, copies the agent_id + environment_id + API key, pastes them into Ditto's runner-config form (Brief 215's admin scaffold). Optionally configures `agent_version` (recommended for stability) + `vault_ids` (if the agent uses MCP servers gated by Anthropic vaults). Thereafter, work items dispatched to this project's `claude-managed-agent` runner result in: (1) "Managed agent started" card with deep-link to the live Anthropic session URL, (2) "PR opened" card with deep-link to GitHub PR (via the shared GitHub-fallback handler), (3) "Vercel preview ready" card with deep-link to preview URL, (4) "/dev-review complete" notification, (5) human reviews PR + preview, approves merge. All four cards are tappable from a phone.
- **Interaction states:**
  - Loading (dispatching): inline spinner; "Dispatching to Managed Agent…" card.
  - Dispatched: "Managed Agent session started" card with session URL.
  - Running: "Managed Agent running" with last-poll timestamp + session URL. (When `observe_events = true`: live-stream of allowlisted events as activity-log entries.)
  - Succeeded with PR: "PR opened" card + "/dev-review complete" + "Vercel preview ready" cards stack additively as signals arrive.
  - Failed: "Managed Agent failed" card with error message + "Retry next runner" button (handled by Brief 215's dispatcher).
  - Rate-limited: "Managed Agent rate-limited — advancing to next runner in chain" notification.
  - Orphaned: "Managed Agent session orphaned (no terminal state within 30 min)" — Brief 215's sweeper drives this; this brief surfaces the resulting card.
  - Idle (heuristic ambiguity): no specific UI — the polling cron continues on the next tick; the user sees the "running" state until the heuristic resolves or the GitHub PR-merged event arrives.
- **Designer input:** **Designer not invoked.** Lightweight UX section here; full polish + runner-pill + retry-buttons + "Run on:" selector belong to sub-brief 221 (which spawns Designer). This brief uses existing card primitives at MVP fidelity.

## Acceptance Criteria

1. [ ] **Spike test lands FIRST per Insight-180.** `src/engine/spike-tests/managed-agent-dispatch.spike.test.ts` exists, makes ONE real SDK roundtrip — creates a session against a real configured Agent + Environment, sends a `user.message` event, verifies the response shape includes `id` (session ID) and `status`, then archives the session. Lands in its own commit BEFORE any other AC code. Runnable locally; skipped in CI (requires real Anthropic API key + real Agent + real Environment).

2. [ ] **`managedAgentAdapter` exists at `src/adapters/claude-managed-agent.ts`** implementing the `RunnerAdapter` interface from Brief 215 (`kind: 'claude-managed-agent'`, `mode: 'cloud'`, `configSchema`, `execute()`, `status()`, `cancel()`, `healthCheck()`, `supportsCancel: true`). All methods type-check against the interface.

3. [ ] **Adapter registered in `runner-registry.ts`.** Integration test: dispatching a work item with `runner_override = 'claude-managed-agent'` resolves to `managedAgentAdapter` via `runner-registry.get('claude-managed-agent')`.

4. [ ] **`stepRunId` guard rejects pre-DB-write.** Integration test calls `managedAgentAdapter.execute({ stepRunId: undefined, … }, …)` and asserts (a) the call throws BEFORE any `runner_dispatches` row is written (DB-spy), (b) before any SDK call is made (SDK-mock-spy), (c) before the credential vault is read (credential-spy). `DITTO_TEST_MODE` bypass tested separately.

5. [ ] **Webhook payload Zod schema tightens the placeholder.** `packages/core/src/runner/webhook-schema.ts` `claude-managed-agent` branch now matches the inline shape in §D10 (no `payload: z.unknown()` wrapper). Validates: required fields `runner_kind`, `state`, `stepRunId`, `externalRunId`; optional fields `prUrl`, `error`. Invalid payloads (missing required, unknown state, malformed `prUrl`) reject with Zod errors. Test fixtures cover happy path + 5+ error cases. The placeholder `payload` field on Brief 215's substrate is dropped from this branch only — `github-action` and `e2b-sandbox` placeholders left alone for Brief 218 / future briefs.

6. [ ] **Polling cron walks `claude-managed-agent` rows at 30s cadence.** Integration test: dispatches a work item via `managedAgentAdapter.execute()` (with mocked SDK returning `{ id: 'session_test', status: 'idle' }`), advances clock 30s, verifies `runner-poll-cron.ts` calls `managedAgentAdapter.status()` once. Advances clock another 30s with the mock now returning `terminated`, verifies the next poll transitions `runner_dispatches.status = 'failed'` per the heuristic in §D2.

7. [ ] **Terminal-state heuristic handles all 7 cases in §D2's table.** Unit tests on `managedAgentAdapter.status()`: each row of the heuristic table produces the documented `runner_dispatches.status` value. Specifically: `terminated` → `failed`; `running` → `running`; `rescheduling` → `running`; `idle` + last `agent.message` + idle for >30s → `succeeded`; `idle` + last `agent.error` matching `/rate.?limit/i` → `rate_limited`; `idle` + last event is a pending `agent.tool_use` awaiting confirmation → `running` (no auto-fail in the absence of the steering surface — orphan sweeper handles long-pending); `idle` + dispatch grace period not elapsed → `running`.

8. [ ] **Prompt composition includes `/dev-review` invocation; callback section ONLY when `callback_mode='in-prompt'`.** Unit test on `composePrompt()`: with `callback_mode='polling'` (default), output contains the work-item body + "/dev-review" directive but NO INTERNAL section (no callback URL, no ephemeral token, no plaintext leak). With `callback_mode='in-prompt'`, output additionally contains the INTERNAL section with the resolved status webhook URL, the ephemeral token, `stepRunId`, and `externalRunId` placeholder. For `harnessType='catalyst'`, prompt does NOT inline skill text; for `harnessType='native' | 'none'`, prompt INLINES the skill text (truncated at 4 KB).

9. [ ] **GitHub fallback handler updates dispatch state from PR + workflow_run + deployment_status events.** Fixture-based integration tests:
    - `pull_request.opened` matching dispatch's branch → `external_url` updated, "PR opened" inline card emitted with the per-kind deep-link.
    - `pull_request.closed.merged` → `runner_dispatches.status = 'succeeded'` (verifies state machine allows direct `running → succeeded`).
    - `pull_request.closed.merged` followed by late polling-cron-detected `terminated` → late transition rejected as illegal (`succeeded → failed` is illegal); structured-log warning emitted; status remains `succeeded`.
    - `deployment_status` non-production `success` → "Vercel preview ready: <url>" inline card emitted.
    - **Both runner-kinds (`claude-code-routine` and `claude-managed-agent`) covered** by the same handler — the kind-routing only changes the deep-link URL.

10. [ ] **Optional in-prompt callback path works when configured.** Integration test with `callback_mode='in-prompt'`: composed prompt contains the ephemeral token in plaintext; status webhook accepts a payload with that token via bcrypt.compare; advances state. Plaintext token does NOT appear in any log, DB column, or function return (verified by grep on test output). Status webhook also accepts a payload signed with the project's `runnerBearerHash` (long-lived) — verifies both auth paths via the handler at `runner-status-handlers/managed-agent.ts`.

11. [ ] **Optional SSE event-stream observability works when configured.** **DEFERRED to a follow-up polish brief at builder closeout (2026-04-27).** The `observe_events` config flag IS accepted by the Zod schema, persisted on `project_runners.config_json`, and round-trips through the form/route/vault — so the future SSE implementation can read it without a schema change. The SSE subscription itself is NOT wired at adapter runtime: a stateful subscription manager + allowlist filter + activity-log emission + graceful downgrade-to-polling is non-trivial scope, and the polling-primary path (status() + GitHub fallback) is the correctness channel. Setting `observe_events=true` today is a no-op at runtime. Builder docstring at `src/adapters/claude-managed-agent.ts` documents the deferral; `MANAGED_AGENT_SSE_MAX_DURATION_MS` env var is reserved.

12. [ ] **End-to-end smoke against agent-crm.** Manual smoke (executed by user once after merge): create a real Agent + Environment in Anthropic's web UI; configure a `claude-managed-agent` runner on the agent-crm project; dispatch a real work item ("Add a /healthz endpoint to agent-crm app router"); verify (a) Anthropic session URL appears as inline card, (b) PR opens via the shared GitHub-fallback handler, (c) `/dev-review` output appears as PR comment, (d) Vercel preview URL inline card appears, (e) human approves PR, (f) work item state reflects merge, (g) polling cron archives the session post-terminal. **Mac mini may be powered off during this smoke** — verifies cloud-only path. **Cost note:** the user runs ONE such smoke (Managed Agents has a metered cost model at preview); subsequent regression coverage uses fixture-based tests + the SDK mock.

13. [ ] **Trust-tier behavior matches Brief 214 §D8.** Integration tests exercise all four tiers + sampling outcomes against `managedAgentAdapter`:
    - `supervised` → `runner_dispatches.status` stays `queued` until human approves at /review/[token]; on approve, advances to `dispatched` and session created.
    - `spot_checked` sampled-in → same.
    - `spot_checked` sampled-out / `autonomous` → wire send immediately.
    - `critical` → adapter rejected pre-dispatch with no DB write, no SDK call.

14. [ ] **`/projects/[slug]/runners` admin enables `claude-managed-agent` kind.** Brief 215 ships it disabled; this brief flips it enabled, ships the kind-specific config form (agent_id, agent_version, environment_id, vault_ids, default_repo, default_branch, API-key paste, observe_events checkbox, callback_mode radio), validates against `managedAgentAdapter.configSchema`, encrypts API key via credential vault on submit, persists `credential_service` reference (NOT plaintext key) in `project_runners.config_json`. Mobile-first verified (375 × 667 viewport, no horizontal scroll, ≥44pt taps, sticky bottom action bar). "Verify with API" button POSTs to `packages/web/app/api/v1/projects/[id]/runners/[kind]/verify/route.ts` and updates `last_health_status`.

15. [ ] **Coordination with Brief 216 honoured.** Per §D14: `cloud-runner-prompt.ts` exists at the kind-agnostic path; `cloud-runner-fallback.ts` exists at the kind-agnostic path; `cloudRunnerStateToDispatchStatus()` exists in `webhook-schema.ts` (kind-agnostic name). If Brief 216 has merged before this brief, the rename commits land FIRST in this brief's PR; if 217 ships first, the kind-agnostic names ship here directly. **No duplicate kind-specific module exists** (verified by grep: no file named `routine-prompt.ts` AND `cloud-runner-prompt.ts` simultaneously; ditto `routine-fallback.ts` and `cloud-runner-fallback.ts`).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Brief 215 substrate + Brief 216 sibling.
2. Reviewer specifically checks:
   (a) Engine-core boundary — only the Zod schema + polling cadence map added to core; everything else product.
   (b) The polling-primary status path is sound — the heuristic in §D2 is conservative (ambiguous idle stays running) and documented as a known limitation; the GitHub fallback is the production-grade success signal.
   (c) The optional in-prompt callback discipline (when `callback_mode='in-prompt'`) reuses Brief 216's column without schema additions and the bearer never appears in plaintext at rest.
   (d) The `/dev-review` skill loading is honest for both `catalyst` and `native` projects (no missing path, no infinite-recursion risk; same path as Brief 216 §D7).
   (e) The GitHub fallback handler correctly handles the cross-kind state-machine concerns (the same `running → succeeded` race covered in Brief 216 applies here).
   (f) The spike-test-first ordering is enforced.
   (g) The credential never appears in plaintext at rest in any code path.
   (h) Coordination with Brief 216 is explicitly addressed (kind-agnostic file paths, rename guard).
   (i) The brief is sized to one focused build session (Insight-004): 15 ACs is at the upper end of the parent brief's 10-13 target — flag if reviewer counts >17.
   (j) The Managed Agents beta API surface is correctly attributed to DEPEND classification + the landscape entry is updated.
3. Present brief + review findings to human for approval.

## Smoke Test

Manual smoke after this brief merges:

```bash
# 1. Spike test (run first per Insight-180)
ANTHROPIC_API_KEY=sk-ant-... \
  MANAGED_AGENT_ID=agt_... \
  MANAGED_ENVIRONMENT_ID=env_... \
  pnpm vitest run src/engine/spike-tests/managed-agent-dispatch.spike.test.ts
# Expect: pass, real session ID printed, session archived afterwards.

# 2. Configure agent-crm runner via UI
# Pre-req: create the Agent + Environment in Anthropic's web UI; copy IDs.
# Navigate to /projects/agent-crm/runners, "Add runner" → claude-managed-agent.
# Paste agent_id, environment_id, API key + default_repo (`<owner>/agent-crm`) + default_branch (`develop`).
# Leave callback_mode = 'polling' (default), observe_events = false (default).
# Submit. Click "Verify with API" → confirm last_health_status = "healthy".

# 3. Dispatch a real work item
# Capture work item: "Add a /healthz endpoint to agent-crm app router."
# Triage routes it to coding work; trust-tier supervised by default.
# Approve at /review/[token].
# Verify in /projects/agent-crm:
#   - "Managed Agent session started" inline card with session URL deep-link
#   - "Managed Agent running" updates every 30s as polling cron ticks
#   - "PR opened" card within ~10-30 min (depending on agent's work)
#   - "/dev-review complete" card (the agent's PR comment from /dev-review)
#   - "Vercel preview ready" card with preview URL
#   - On polling-cron-detected terminal: "Managed Agent succeeded" + the session is archived
# Tap PR URL on phone, approve PR.
# Verify work item state advances to merged.

# 4. Optional callback mode — re-run with callback_mode = 'in-prompt'
# Edit the runner config; set callback_mode = 'in-prompt'.
# Dispatch another work item.
# Verify: in addition to the polling-cron updates, the agent's terminal callback POSTs to /api/v1/work-items/:id/status
# AND the request is accepted via the per-dispatch ephemeral token (not the project's runnerBearerHash).
# Verify: the ephemeral token plaintext does not appear in any DB query, application log, or activity-log entry.

# 5. Optional SSE — re-run with observe_events = true
# Edit the runner config; set observe_events = true.
# Dispatch another work item.
# Verify: activity-log entries appear during dispatch for `agent.message`, `agent.tool_use`, `agent.tool_result`.
# Verify: SSE closes on terminal state OR after sse_max_duration_ms.

# 6. Failure path: invalidate the API key (rotate via Anthropic console), dispatch again.
# Verify: managedAgentAdapter returns 401 on session.create; runner_dispatches.last_health_status = 'unauthenticated';
# work-item conversation shows "Managed Agent authentication failed — re-pair the API key in /projects/agent-crm/runners".

# 7. Mac-mini-off path
# Power off Mac mini. Repeat step 3.
# Verify: dispatch still completes end-to-end. No local execution required.

# 8. Brief 216 non-regression
# Re-run Brief 216 smoke — verify routine dispatch path still works after the kind-agnostic file renames.
pnpm vitest run src/adapters/claude-code-routine.test.ts
pnpm vitest run src/engine/runner-status-handlers/routine.test.ts
pnpm vitest run src/engine/github-events/cloud-runner-fallback.test.ts
# All Brief 216 tests pass.
```

## After Completion

1. Update `docs/state.md` — Brief 217 transitions `complete`; subsequent architect sessions write 218 (GitHub Actions) if not already shipped, then 219 (optional integrations), 220 (deploy gate), 221 (mobile UX), 222 (smoke).
2. Update parent brief 214 Status if all phase-level ACs gate through this brief — partial; 214 stays `ready` until phase-completion.
3. Update `docs/dictionary.md` per §What Changes (Managed Agent, Managed Agents Session, Polling-Primary Status, Terminal-State Heuristic, Cloud Runner Prompt Composer, Optional In-Prompt Callback).
4. Update `docs/landscape.md` Managed Agents entry's "Adopted in Brief 217" footer; promote classification PATTERN→DEPEND-eligible to DEPEND.
5. Phase retrospective entry for Brief 217 (run by Documenter): what worked, what surprised about the Managed Agents API beta surface, what to change for sub-brief 218 (GitHub Actions — should benefit from the same `cloud-runner-fallback.ts` extraction).
6. No ADR needed — this is a sub-brief implementing the parent brief's design.
