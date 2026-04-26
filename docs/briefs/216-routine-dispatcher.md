# Brief 216: Routine Dispatcher (claude-code-routine) — first cloud runner adapter (sub-brief of 214)

**Date:** 2026-04-25
**Status:** draft
**Depends on:** Brief 215 (Projects + Runner Registry — substrate that defines the `RunnerAdapter` interface, `runner_dispatches` table, kind/mode/state enums, and registers the adapter via `runner-registry.ts`). **Brief 223 MUST merge BEFORE this brief** (workItems extension + status webhook + projects CRUD — provides the `POST /api/v1/work-items/:id/status` endpoint this adapter's prompts call back into; provides `projects.runnerBearerHash` for per-project bearer auth). If Brief 223 hasn't merged at this brief's build time, the builder MUST coordinate with the Brief 223 builder to co-land both briefs' modifications to `packages/web/app/api/v1/work-items/[id]/status/route.ts` in a single commit (223 lands the file with project-bearer-only verification; 216 extends with per-dispatch-ephemeral-token verification). Merge-sequence sanity check: Brief 215 → Brief 223 → Brief 216. Brief 212 (Local Bridge) is NOT a dependency — this brief ships a cloud-side adapter only.
**Unlocks:** End-to-end smoke test of the user's primary cloud-runner build target (Routine dispatch against agent-crm). Sub-briefs 217 (Managed Agents) and 218 (GitHub Actions) ship in parallel after 215 merges; 219/220/221 layer on after at least one cloud runner is live (this is that runner).
**Parent brief:** 214 (Cloud Execution Runners Phase)

## Goal

- **Roadmap phase:** Phase 9+ (cloud runner #1 — Anthropic Claude Code Routines).
- **Capabilities delivered:**
  - A `routineAdapter` (`src/adapters/claude-code-routine.ts`) implementing the `RunnerAdapter` interface from Brief 215.
  - Routine config Zod schema validating the per-project routine config shape (`endpoint_url`, `bearer_credential_id`, `default_repo`, `default_branch`).
  - Prompt composition layer that wraps the work-item body with `/dev-review` invocation + in-prompt status callback instructions per Brief 214 §D11 default-review-path discipline.
  - HTTP dispatch to Anthropic's `/v1/claude_code/routines/{trigger_id}/fire` endpoint using the existing REST integration handler.
  - Status decoder filling Brief 215's webhook-schema placeholder for `runner_kind: 'claude-code-routine'`.
  - GitHub fallback signal path: `pull_request` and `workflow_run` webhook subscription via Ditto's existing GitHub integration; updates the work item even if the in-prompt callback never fires.
  - Vercel preview URL inline card emission from `deployment_status` non-production events on the routine-opened PR.
  - Bearer credential health check (config-validity only — no live API call).
  - End-to-end smoke against agent-crm: real fire → routine session → PR opened → `/dev-review` comment → Vercel preview surfaces → human approves PR.

## Context

The user's revised pipeline spec (`.context/attachments/pasted_text_2026-04-25_21-14-58.txt:27`) names `claude-code-routine` as the "default cloud path for Claude Code work." Sub-brief 215 ships the substrate (`RunnerAdapter` interface, `runner_dispatches` table, dispatcher resolver, registry); this brief is the first concrete cloud adapter against that substrate.

Anthropic Claude Code Routines is a research-preview feature (launched 2026-04-14, `code.claude.com/docs/en/routines`). HTTP trigger surface: `POST https://api.anthropic.com/v1/claude_code/routines/{trigger_id}/fire` with bearer + `experimental-cc-routine-2026-04-01` beta header + body `{"text": "..."}`. Returns `{claude_code_session_id, claude_code_session_url}` synchronously. **No native completion webhook at preview**; status back-channel is via (a) the routine's prompt POSTing to Ditto's status webhook on completion (in-prompt callback, primary), (b) GitHub repo events (workflow_run/pull_request, fallback), (c) polling the session URL (last resort, slow — 5min cadence).

Brief 214 §D11 (revised) sets the default-review-path discipline: every cloud runner's prompt invokes the `/dev-review` skill in-session; its output surfaces as a PR comment. The Routine adapter is the first runner where this discipline is implemented.

Per-dispatch security: the routine prompt is sent to Anthropic, so embedding the long-lived `projects.runnerBearerHash` in every prompt would over-share. This brief introduces a **per-dispatch ephemeral callback token**: generated at dispatch time, hashed and stored on `runner_dispatches.callbackTokenHash`, plaintext only ever in the dispatched prompt (one trip to Anthropic), TTL = dispatch's expected wall-clock duration. Brief 223's status webhook accepts EITHER the long-lived `projects.runnerBearerHash` (for runners that don't compose prompts — e.g., GitHub Actions) OR the per-dispatch ephemeral token (for runners that compose prompts — e.g., this Routine adapter and future Managed Agents).

## Objective

Ship the smallest production-shape Routine dispatcher that lets a Ditto work item dispatch to a project's configured Anthropic Claude Code Routine, runs `/dev-review` in-session, captures status via the in-prompt callback (with GitHub fallback), and surfaces the resulting PR + Vercel preview URL in the work-item conversation — phone-friendly throughout.

## Non-Goals

- **No optional integrations (Greptile / Argos / etc.).** Brief 219 owns detection + opt-in wiring. This brief ships the default-review-path only (`/dev-review` skill in-session + Vercel preview URL inline card). The status decoder must NOT assume Greptile or Argos signals.
- **No deploy gate state machine.** Brief 220 owns `ready-to-deploy → deploying → deployed | deploy_failed` transitions + GitHub Environment template + Mobile push approval flow. This brief surfaces the PR + Vercel preview URL but does NOT advance work-items past `review`.
- **No mobile UX polish.** Brief 221 owns the runner pill, "Run on:" selector, retry buttons. This brief emits the conversation-surface inline cards (Routine started, PR opened, Vercel preview ready) using existing `ContentBlock` types — no new primitives.
- **No multi-routine-per-project orchestration.** One project has at most one configured `claude-code-routine` runner row in `project_runners`. Multiple routines per project (e.g., one for review, one for deploy verification) is a future enhancement — out of scope here.
- **No native-Ditto-process scheduling via Routines.** This brief dispatches *coding* work items (project-bound). Ditto's internal processes (GTM pipeline, scanner, RSI loops) stay on step.executor + existing adapters; they are not Routine-targets.
- **No retry-on-rate-limit at the adapter level.** The dispatcher (Brief 215's `runner-dispatcher.ts`) handles fallback-chain advancement on rate-limit/timeout/error. This adapter just reports the failure mode; the dispatcher decides next-attempt routing.
- **No bearer rotation in this brief.** Brief 223 owns `PATCH /api/v1/projects/:slug { rotateBearer: true }` for the inbound webhook bearer. The outbound Anthropic bearer rotation is via the credential vault's existing `update` flow; not new surface.
- **No Routine-creation automation.** The user creates the Routine in Anthropic's web UI, copies the trigger URL + bearer token, and pastes them into Ditto's `/projects/[slug]/runners` form (per Brief 215's admin scaffold). Auto-creating Routines via API requires Anthropic's experimental Routines management endpoints which are not GA at preview.
- **No live-PTY view of the Routine session.** The `claude_code_session_url` is rendered as an external-link inline card; the user opens it in a browser to watch live. xterm.js view in `/review/[token]` is a future brief.
- **No streaming of intermediate Routine progress.** This brief observes terminal states only (success/failure via in-prompt callback or GitHub event). Mid-routine progress (the SSE event-stream Anthropic emits) is a future enhancement.
- **No e2b-sandbox fallback.** Per Brief 214's enum, `e2b-sandbox` is reserved-but-deferred; the runner_chain may include it in config but the dispatcher will skip it (no adapter registered) until a future brief lands the e2b adapter.

## Inputs

1. `docs/briefs/214-cloud-execution-runners-phase.md` — parent; §D8 (trust integration), §D9 (engine-core boundary), §D10 (Insight-180), §D11 (default review path — `/dev-review` in-session + Vercel preview URL inline card) are binding for this brief.
2. `docs/briefs/215-projects-and-runner-registry.md` — substrate; §What Changes specifies the `RunnerAdapter` interface (with `WorkItemRef`, `ProjectRunnerRef`, `DispatchResult`, `DispatchStatusSnapshot` types), the `runner_dispatches` schema, the `runner-registry.ts` registration pattern, and the polymorphic webhook Zod schema with the `claude-code-routine` placeholder this brief fills.
3. `docs/briefs/223-projects-schema-and-crud.md` — provides `POST /api/v1/work-items/:id/status` webhook handler + `projects.runnerBearerHash` (long-lived auth) + bearer-acceptance pattern. This brief adds per-dispatch ephemeral token acceptance to the same handler.
4. `docs/research/cloud-runners.md` — research; §A "claude-code-routine" is the source of truth for the HTTP contract, headers, body shape, response shape, beta caveats, and gaps named.
5. `docs/landscape.md` §"Cloud Execution Runners (2026-04-25)" — Routines entry; classification DEPEND.
6. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every dispatch is a side-effecting function; `stepRunId` required at adapter entry.
7. `docs/insights/190-drizzle-migration-discipline.md` — the new `runner_dispatches.callbackTokenHash` column requires a migration; idx parity rule applies.
8. `docs/adrs/005-integration-architecture.md` — credential vault + integration registry pattern. The outbound Anthropic bearer is stored in the vault keyed `routine.<projectSlug>.bearer` per Brief 223's existing convention.
9. `docs/adrs/007-trust-earning.md` — trust tiers; the routine adapter calls `trust-gate.ts` BEFORE dispatching per Brief 214 §D8.
10. `docs/dev-process.md` `/dev-review` skill location — `.catalyst/skills/dev-review/SKILL.md` (canonical) + `.claude/skills/dev-review/SKILL.md` (pointer). The Routine session reads the skill from the cloned repo's `.catalyst/` if present (catalyst projects) OR Ditto provides a fallback skill text inline in the prompt for native-Ditto projects.
11. `src/engine/credential-vault.ts:112` — `getCredential(processId, service)` is the existing credential lookup used by the adapter for the outbound Anthropic bearer.
12. `src/engine/integration-handlers/rest.ts` — the existing REST integration handler. The Routine adapter composes its HTTP call via this handler, NOT a parallel HTTP client.
13. Anthropic Claude Code docs (https://code.claude.com/docs/en/routines) — `/fire` endpoint contract.
14. Anthropic Claude Code SDK headless docs (https://code.claude.com/docs/en/headless) — `/dev-review` skill is invoked via Claude Code's slash-command mechanism inside the Routine session.

## Architectural Decisions

**D1: Adapter location is product layer.** `src/adapters/claude-code-routine.ts` ships the implementation. Engine-core scope: only the Routine-specific webhook payload Zod schema, which fills the placeholder in `packages/core/src/runner/webhook-schema.ts` (Brief 215's contract). The HTTP shape, prompt composition, GitHub event subscription, and Vercel-preview detection are Ditto-product opinions.

**D2: Prompt composition is the dispatch surface.** The `routineAdapter.execute()` function composes a prompt with three sections:

```
<work-item-body>

---

When implementation is complete, run /dev-review and post its output as a PR comment.

---

INTERNAL: When the session terminates (success or failure), POST status to:
  <statusWebhookUrl>
With Authorization: Bearer <ephemeralCallbackToken>
And body: { "runner_kind": "claude-code-routine", "state": "<succeeded|failed|cancelled>", "prUrl": "<pr-url-if-opened>", "error": "<message-if-failed>", "stepRunId": "<stepRunId>", "externalRunId": "<claude_code_session_id>" }
```

The `<statusWebhookUrl>` and `<ephemeralCallbackToken>` are filled at dispatch time. The internal section is bracketed clearly so a Routine session reads it as a directive (Claude Code respects "INTERNAL:" framing for tool-side instructions).

**D3: Per-dispatch ephemeral callback token.** Generated at dispatch entry, hashed (bcrypt cost 12, matching Brief 223's `runnerBearerHash` discipline), stored on a new column `runner_dispatches.callbackTokenHash`. Plaintext appears only in the prompt sent to Anthropic. TTL = dispatch's expected wall-clock duration (default 30 min, configurable via `runner_config.dispatch_max_age_ms`). Token is bound to (workItemId, runnerDispatchId) — accepting status updates only for that specific dispatch. Brief 223's status webhook handler is extended to accept either the long-lived `projects.runnerBearerHash` (for non-prompt-composing runners) OR the per-dispatch ephemeral token (for prompt-composing runners).

**Plaintext-token-in-Anthropic-prompt risk acceptance:** the prompt is sent to Anthropic and Anthropic logs prompts (per their standard observability). Effectively the ephemeral token is shared with Anthropic for the duration of the dispatch. This is acceptable because (a) Anthropic is the trusted Routines host already executing the work, (b) the token is per-dispatch (compromise of one dispatch's token does not affect other dispatches), (c) the token's only capability is "post one status update for this dispatch ID" — strictly less than the long-lived project bearer (which can post status for any work item under the project). User-confirmed delegation per architect checkpoint #8: "you make the best call for the long-term health of the project." Documented as a security trade-off; future hardening (e.g., asymmetric signing where Ditto holds the private key) is reserved for a follow-on brief if Anthropic's logging policy changes or if cross-tenant Routines become a concern.

**D4: GitHub fallback subscription.** The dispatcher subscribes to `pull_request` (`opened`, `synchronize`, `closed`), `workflow_run` (`completed`), and `deployment_status` webhooks on every repo configured in any project_runner of kind `claude-code-routine`. On `pull_request.opened` matching the routine session's branch (`claude/*` per Anthropic's default), the dispatcher updates the `runner_dispatches` row with `external_url = pr_url` and emits a "PR opened" inline card to the work-item conversation. On `pull_request.closed` with `merged: true`, the dispatcher transitions to `succeeded` (terminal). **The fallback runs alongside the in-prompt callback**: whichever signal arrives first determines the state transition; the second is a no-op (state machine rejects illegal re-transitions per Brief 215's `transition()` function).

**Subscription registration point:** the routine adapter declares the events it observes via a static `webhookSubscriptions` field on the adapter (`{ events: ['pull_request', 'workflow_run', 'deployment_status'], match: (event, payload, dispatch) => boolean }`). At engine boot, `src/engine/runner-registry.ts` (Brief 215's registry, extended in this brief) iterates registered adapters, collects their webhook-subscription declarations, and registers them with Ditto's existing GitHub integration handler at `src/engine/integration-registry.ts`. Per-project routing happens at event-receive time: the integration handler looks up the matching `project_runners` row by repo, then dispatches to the correct adapter's fallback handler. This keeps subscription declarations co-located with the adapter that consumes them and removes the need for parallel registration plumbing.

**Race condition: PR merged while routine still running.** Brief 215's state machine MUST allow the transition `running → succeeded` directly (a routine session is "running" until terminal; the GitHub merged event is one terminal signal). Verified by inspecting `packages/core/src/runner/state-machine.ts` from Brief 215 §What Changes — the `succeed` event triggers `running → succeeded`, which is legal per the standard state-machine table. **If the routine session subsequently emits its own in-prompt callback after the PR merge:** the second transition (e.g., another `running → succeeded`, or worse, `succeeded → succeeded`) is rejected by `transition()` (Brief 215 §AC 5: "illegal transitions return `Error`"); the late callback is logged but not applied. **If the PR is merged but the routine session emits `state: 'failed'` later** (e.g., the routine's own `/dev-review` reported issues but the human merged anyway): the late `failed` is rejected (`succeeded → failed` is illegal); a structured-log warning is emitted ("late callback after terminal state — routine session reported failure post-merge; review session URL `<external_url>`"). This honest handling: the human's merge is authoritative; the routine's late opinion is captured in the activity log but doesn't reverse the state.

**D5: Vercel preview URL inline card.** The Vercel GitHub integration emits `deployment_status` events on each preview build. The dispatcher subscribes to `deployment_status` events on every routine-configured repo. **Detection rule (precise):** emit the preview-ready inline card when `state === "success"` AND `environment !== "Production"` AND `environment !== project.deployTargetEnvironment` (the latter is a per-project field that defaults to `"Production"` if unset; users with non-default production env names override it via the runner-config form). For most setups this collapses to "any deployment_status success that is not the explicit production env." Examples:
- Vercel default: `environment: "Preview"` → preview card emitted ✓
- Vercel default: `environment: "Production"` → no card (Brief 220 owns) ✓
- Netlify: `environment: "deploy-preview"` → preview card emitted ✓
- Custom staging: `environment: "Custom-Staging"`, project's `deployTargetEnvironment` is `"Production"` → preview card emitted ✓
- Custom production: project's `deployTargetEnvironment` is `"prod"`, deployment env `"prod"` → no card ✓

For Netlify / Cloudflare Pages / etc., the same `deployment_status` event shape applies via their respective GitHub integrations — the rule is vendor-agnostic. The card uses an existing `ContentBlock` type (text + link). Production deploys are NOT surfaced here (Brief 220 owns deploy-gate observability via the same event with the production-env match).

**D6: Health check is config-validity only.** `routineAdapter.healthCheck()` verifies (a) the credential exists in the vault keyed `routine.<projectSlug>.bearer`, (b) the configured `endpoint_url` parses as a valid HTTPS URL pointing to `api.anthropic.com`, (c) the configured `default_repo` parses as `owner/repo` shape. **No live API call** — firing a real Routine just to check health would be wasteful (Routines count against subscription usage). If a dispatch later fails with 401, the adapter updates `last_health_status = 'unauthenticated'` reactively; no proactive ping.

**D7: `/dev-review` skill availability.** Two paths depending on `harnessType`:

- **Catalyst projects (`harnessType='catalyst'`):** the cloned repo carries `.catalyst/skills/dev-review/SKILL.md` (catalyst convention). The Routine session reads it from the cloned working tree directly. Ditto's prompt does NOT inline the skill — it just references "/dev-review" by name and Claude Code's slash-command mechanism finds the local file.
- **Native-Ditto projects (`harnessType='native'` or `'none'`):** the target repo has no `.catalyst/skills/`. Ditto's prompt-composer inlines the skill text from **Ditto's deployed binary at runtime** — `.catalyst/skills/dev-review/SKILL.md` is committed to the Ditto source tree AND bundled into the Railway deployment as a static file (the Dockerfile copies `.catalyst/` into the runtime image). At dispatch time, `composePrompt()` reads from the deployed filesystem path (`<dittoRoot>/.catalyst/skills/dev-review/SKILL.md` where `<dittoRoot>` is the deployed Ditto root, configurable via `DITTO_DEV_REVIEW_SKILL_PATH` env var). **Bundled-at-deploy-time, not fetched-at-dispatch-time** — no GitHub API dependency, deterministic across all Railway instances of the same Ditto release, skill changes ship with the next Ditto release. If the SKILL.md file is missing at dispatch time (deployment misconfiguration), `composePrompt()` returns an error — the dispatch is rejected before HTTP fire, and the work item is marked failed with `errorReason = "dev-review-skill-missing-from-deployment"`.

Inline cap: **4 KB** (reduced from 8 KB for safety margin against Anthropic's undocumented beta `text` body limit). The current `.catalyst/skills/dev-review/SKILL.md` is well under this. If the skill text exceeds 4 KB, the prompt-composer truncates with a marker `[ditto: dev-review skill truncated at 4 KB]` and emits a structured-log warning. This signals a prompt-composer-needs-update event; the brief author treats >4 KB as a re-architect trigger (split skill into progressive-disclosure summary + linked details, per agentskills.io discipline).

**D8: Trust integration consistent with Brief 214 §D8.** Adapter calls `trust-gate.ts` BEFORE dispatch:
- `supervised` → `pause`. `runner_dispatches.status = 'queued'`; wait for /review/[token] approval; on approve → `dispatched`.
- `spot_checked` sampled-in → `sample_pause`. Same.
- `spot_checked` sampled-out / `autonomous` → wire send immediately.
- `critical` → adapter rejected pre-dispatch.

**D9: Engine-core deliverable.** `packages/core/src/runner/webhook-schema.ts`'s `claude-code-routine` placeholder is filled with the Zod schema for the in-prompt callback payload: `{ runner_kind: 'claude-code-routine', state: 'succeeded' | 'failed' | 'cancelled' | 'running', prUrl?: string, error?: string, stepRunId: string, externalRunId: string }`. This is the only core change; everything else is product layer.

**State mapping between webhook payload `state` and `runner_dispatches.status`:** the webhook payload's `state` field is intentionally narrower than Brief 215's 9-value `RunnerDispatchStatus` enum. The decoder (`runner_status_handlers/routine.ts`) maps as follows, documented as a comment block in `webhook-schema.ts` so subsequent runner adapters follow the same pattern:

| Webhook `state` | Webhook `error` field | `runner_dispatches.status` |
|-----------------|----------------------|----------------------------|
| `running` | n/a | `running` |
| `succeeded` | n/a | `succeeded` |
| `cancelled` | n/a | `cancelled` |
| `failed` | (absent or generic) | `failed` |
| `failed` | matches `/rate.?limit/i` | `rate_limited` |
| `failed` | matches `/timeout|timed.?out/i` | `timed_out` |

Other failure-mode reasons (auth, network) all map to `failed` and the `error` field is preserved verbatim in the audit row's `errorReason`. `revoked` and `queued` and `dispatched` are dispatcher-internal states (no webhook payload sets them); the webhook can't tell Ditto a dispatch is `queued` because the dispatcher already knows.

**D10: Insight-180 stepRunId guard at adapter entry.** `routineAdapter.execute(stepRunId, dispatchId, workItem, projectRunner)` rejects calls with falsy `stepRunId` BEFORE any DB write or HTTP call. `runner_dispatches.stepRunId` FK enforced at the DB. `harness_decisions` row written keyed on stepRunId (per Brief 214 §"`harness_decisions` is the canonical audit destination").

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/runner/webhook-schema.ts` | **Modify** — fill the `claude-code-routine` placeholder in the discriminated union with the concrete Zod schema per D9. |
| `packages/core/src/runner/webhook-schema.test.ts` | **Modify** — add tests verifying valid `claude-code-routine` payloads parse; invalid payloads reject (missing fields, unknown state values, malformed prUrl). |
| `packages/core/src/db/schema.ts` | **Modify** — add column `runner_dispatches.callback_token_hash` text NULLABLE (bcrypt hash; null for runners that don't compose prompts). Documented as "ephemeral per-dispatch callback token, bound to dispatch lifecycle, generated by adapters that compose prompts (e.g., claude-code-routine, future managed-agent)." |
| `drizzle/<NNNN>_routine_callback_token.sql` | **Generated** by `drizzle-kit generate` against next-free idx after Brief 215's migration. Single ALTER TABLE adding the nullable column. |
| `drizzle/meta/_journal.json` | **Modify (generated)** — new entry idx parity per Insight-190. |
| `drizzle/meta/<NNNN>_snapshot.json` | **Generated.** |
| `src/adapters/claude-code-routine.ts` | **Create** — `routineAdapter` implementing `RunnerAdapter`. Sections: <br>(a) `configSchema` Zod for `{ endpoint_url, bearer_credential_id, default_repo, default_branch }`. <br>(b) `healthCheck()` — config-validity only per D6. <br>(c) `execute(stepRunId, dispatchId, workItem, projectRunner)` — Insight-180 guard, generate ephemeral callback token, hash it, persist, compose prompt via `composePrompt()`, call REST handler with bearer + beta header + body `{ text: composedPrompt }`, return `DispatchResult` with `externalRunId = response.claude_code_session_id`, `externalUrl = response.claude_code_session_url`. <br>(d) `status(dispatchId, externalRunId)` — fetches the persisted row state (no live API call; status is push via webhook). <br>(e) `cancel(dispatchId, externalRunId)` — best-effort: cancellation API is undocumented at preview, so this updates local state to `cancelled` and emits a "Routine session cancellation requested — open the session URL to terminate manually" inline card. ~250 LOC. |
| `src/adapters/claude-code-routine.test.ts` | **Create** — unit tests with mocked REST handler + clock + bcrypt: stepRunId guard rejects pre-DB, prompt composition includes work-item body + /dev-review + callback section, ephemeral token hashed correctly, dispatch persists row + transitions to dispatched, response parses claude_code_session_id correctly. |
| `src/adapters/routine-prompt.ts` | **Create** — `composePrompt(workItem, projectRunner, statusWebhookUrl, ephemeralToken, stepRunId, dittoSkillsPath?)` pure function. Reads `.catalyst/skills/dev-review/SKILL.md` if `harnessType='catalyst'`; otherwise inlines skill text from Ditto's own repo (configurable path defaults to `<dittoRoot>/.catalyst/skills/dev-review/SKILL.md`). Truncates inline skill at 8 KB with marker. Returns the composed prompt string. ~120 LOC. |
| `src/adapters/routine-prompt.test.ts` | **Create** — unit tests for catalyst-vs-native skill loading, skill text truncation, callback section formatting, work-item body interpolation. |
| `src/engine/runner-status-handlers/routine.ts` | **Create** — decoder consuming the `claude-code-routine` discriminated-union branch from Brief 223's status webhook. Validates the bearer (per-dispatch ephemeral OR project bearer), updates `runner_dispatches.status` per Brief 215's state machine, writes `harness_decisions` audit row, posts conversation inline card (Routine completed / failed). ~150 LOC. |
| `src/engine/runner-status-handlers/routine.test.ts` | **Create** — integration tests with fixture HTTP requests: valid payload + valid ephemeral token → status advances; valid payload + project bearer → status advances; invalid bearer → 401; payload with `runner_kind: 'wrong'` → handler skips (delegated to other handler). |
| `src/engine/github-events/routine-fallback.ts` | **Create** — GitHub webhook subscription handler for `pull_request` + `workflow_run` + `deployment_status` events. Looks up `runner_dispatches` by repo + branch matching `claude/*` to find the matching dispatch row. On match: `pull_request.opened` → emit "PR opened" inline card + update `runner_dispatches.external_url`; `pull_request.closed.merged` → transition `runner_dispatches.status = 'succeeded'`; `deployment_status` non-production success → emit "Vercel preview ready" inline card; `deployment_status` production success → no-op (Brief 220 owns). ~200 LOC. |
| `src/engine/github-events/routine-fallback.test.ts` | **Create** — fixture-based tests covering all three event types + the production-deploy no-op path. |
| `src/engine/runner-registry.ts` | **Modify** — register `routineAdapter` for `claude-code-routine` kind (Brief 215 ships the registry; this brief adds the registration). |
| `packages/web/app/projects/[slug]/runners/page.tsx` | **Modify** — enable the `claude-code-routine` option in the kind selector (Brief 215 ships it disabled with tooltip "coming in sub-brief 216"; this brief flips it to enabled). Add the kind-specific config form: endpoint URL input, bearer paste field (sent to credential vault on submit, never stored in `project_runners.config_json`), default repo + default branch inputs. |
| `packages/web/app/api/v1/projects/[id]/runners/route.ts` | **Modify** — when `kind: 'claude-code-routine'` is POSTed, validate the body against `routineAdapter.configSchema`, write the bearer to the credential vault keyed `routine.<projectSlug>.bearer` per ADR-005 boundary-encryption pattern, replace bearer with `bearer_credential_id` reference in the persisted `config_json`. |
| `packages/web/app/api/v1/work-items/[id]/status/route.ts` | **Modify** — extend bearer-acceptance to verify EITHER `projects.runnerBearerHash` (long-lived) OR `runner_dispatches.callbackTokenHash` (per-dispatch ephemeral). Lookup order: try ephemeral first (more specific), fall back to project bearer. **Brief 223 owns the file; this brief adds the per-dispatch acceptance branch.** |
| `docs/dictionary.md` | **Modify** — add: Routine, Routine Trigger, Ephemeral Callback Token, Default Review Path, Vercel Preview URL Inline Card. |
| `.env.example` | **Modify** — document `ROUTINE_DISPATCH_MAX_AGE_MS` (default 1800000 / 30min) and `DITTO_DEV_REVIEW_SKILL_PATH` (defaults to repo root `.catalyst/skills/dev-review/SKILL.md` for inline-skill loading). |
| `src/engine/spike-tests/routine-dispatch.spike.test.ts` | **Create** — Insight-180 spike test pattern (per Brief 212 precedent): ONE real HTTP roundtrip to Anthropic's `/fire` endpoint with a real configured Routine + bearer, verifying auth format + endpoint URL + response shape work end-to-end before the rest of the brief builds. **Run BEFORE wiring the adapter per Insight-180 spike-first pattern.** Skipped in CI (requires real bearer + real Routine); runnable locally via `pnpm vitest run src/engine/spike-tests/routine-dispatch.spike.test.ts`. |

## Constraints

- **Engine-first per CLAUDE.md.** The webhook payload Zod schema is engine-core (cross-runner contract). Everything else (HTTP client, prompt composition, GitHub fallback, conversation card emission) is product layer.

- **Side-effecting function guard (Insight-180) — MANDATORY.** `routineAdapter.execute()` requires `stepRunId` as first parameter; rejects pre-DB-write if missing (except `DITTO_TEST_MODE`). Verified by AC #4. Spike test (`routine-dispatch.spike.test.ts`) lands in own commit BEFORE other AC code.

- **Trust integration via existing `trust-gate.ts` per Brief 214 §D8.** Adapter does NOT make trust decisions; trust-gate produces a `TrustAction` BEFORE dispatch and the adapter honours it.

- **`harness_decisions` audit row per dispatch** (`processRunId`, `stepRunId`, `trustTier`, `trustAction`, `reviewDetails.runner = { runnerKind: 'claude-code-routine', runnerMode: 'cloud', externalRunId, attemptIndex }`). No new audit table.

- **Schema migration discipline (Insight-190).** This brief adds ONE column (`runner_dispatches.callback_token_hash`) at the next-free idx after Brief 215's substrate migration. Strict-monotonic; resequence per Insight-190 if a parallel session lands first.

- **No bearer plaintext at rest, ever.** Outbound Anthropic bearer encrypted in vault keyed `routine.<projectSlug>.bearer`. Inbound per-dispatch ephemeral token: bcrypt-hashed (cost 12); plaintext exists only in the prompt sent to Anthropic and is forgotten by Ditto immediately after dispatch. Project's `runnerBearerHash` (Brief 223) is bcrypt-hashed.

- **Reuse existing primitives.** Credential vault (`src/engine/credential-vault.ts`), REST integration handler (`src/engine/integration-handlers/rest.ts`), GitHub integration (existing — for webhook subscription), conversation surface inline cards (existing `ContentBlock` types), `harness_decisions` audit, `runner_dispatches` state machine (Brief 215). Do not invent parallel substrates.

- **Mobile-first per ADR-018.** The `/projects/[slug]/runners` form additions for routine config (endpoint URL, bearer paste, default repo, default branch) MUST work on a phone — touch targets ≥44pt, no horizontal scroll on long URLs (truncate-with-tap-to-expand), sticky bottom action bar.

- **Beta API discipline.** Anthropic's `experimental-cc-routine-2026-04-01` beta header MUST be sent on every `/fire` call. Breaking changes ship behind dated header versions; the two most recent valid. The adapter accepts a `beta_header` field in `runner_config` (defaulting to the value above) so a future header version can be deployed without a code change.

- **No spamming Routines for health checks.** Health check is config-validity only (D6). Live API checks happen reactively when a dispatch fails.

- **Output cap discipline.** GitHub event payloads can be large; the fallback handler caps stored `external_url` at 2 KB (truncate with marker) and ignores payload fields beyond a known allowlist. Matches Brief 212's bridge-job 4 MB cap shape (this is a smaller cap because URLs, not stdout).

- **Webhook recovery via polling.** If Ditto is down when a routine session terminates and the in-prompt callback fails, AND the GitHub events arrive while Ditto is down (also possible), the dispatch row stays in `running` state. A staleness sweeper (already shipping in Brief 215 per the state machine) detects `running` for > `dispatch_max_age_ms` and transitions to `failed` with `errorReason = 'orphaned'`. This brief does NOT add a new poller; it relies on Brief 215's existing sweeper.

- **No native Routine cancellation.** Anthropic's Routine API at preview does not document cancellation; `routineAdapter.cancel()` updates local state and surfaces "open the session URL to cancel manually" — explicit limitation, documented in user-facing error.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| `RunnerAdapter` interface | `docs/briefs/215-projects-and-runner-registry.md` §What Changes — `interface.ts` code block | depend (sibling brief) | Brief 215 is the contract source; this brief implements it. |
| Routine `/fire` HTTP shape | `code.claude.com/docs/en/routines` | depend (service) | Anthropic's research-preview public docs; the `/fire` endpoint is the only documented dispatch surface. |
| `experimental-cc-routine-2026-04-01` beta header | `code.claude.com/docs/en/routines` §"Trigger a routine" | depend (service) | Required header; absence rejected with 400. |
| `/dev-review` skill content | `.catalyst/skills/dev-review/SKILL.md` (Ditto's own canonical) | adopt (self-reuse) | Same skill text Ditto's `/drain-queue` autopilot uses; ensures uniformity. |
| In-prompt callback pattern | researcher report `docs/research/cloud-runners.md` §A "Status back-channel" — names "Routine prompt itself can post to a Ditto webhook on completion (in-band)" | original to Ditto | Anthropic doesn't ship a native completion webhook; this brief invents the in-prompt callback shape. |
| Per-dispatch ephemeral callback token | original to Ditto | original | No surveyed cloud-runner adopts this; standard practice is long-lived workspace tokens. Original because Ditto's prompts go to third-party processors. |
| GitHub fallback subscription | `docs.github.com/en/rest/actions` (`workflow_run` + `pull_request` + `deployment_status` events) | depend (existing) | Reuses Ditto's existing GitHub integration; adds three new event types to the existing webhook router. |
| Vercel preview URL via `deployment_status` | `docs.github.com/en/webhooks/webhook-events-and-payloads#deployment_status` + Brief 214 §D11 default-visual-check decision | pattern (cross-vendor) | Vercel/Netlify/Cloudflare Pages all emit GitHub `deployment_status` for previews; one handler covers all. |
| bcrypt cost 12 hash for callback token | Brief 200 §Constraints + Brief 223 `runnerBearerHash` (cost 12) | depend (self-reuse) | Existing Ditto convention. |
| REST integration handler for outbound HTTP | `src/engine/integration-handlers/rest.ts` | depend (existing) | The dispatcher composes HTTP via this handler, not a parallel HTTP client. |
| Credential vault outbound storage | `src/engine/credential-vault.ts` + ADR-005 boundary-encryption | depend (existing) | Outbound Anthropic bearer encrypted at rest, keyed `routine.<projectSlug>.bearer`. |
| Spike test before adapter wires | `docs/insights/180-spike-test-every-new-api.md` (Insight-180 spike pattern) | pattern (project-internal) | Brief 212 precedent: spike landing in own commit, run before all other ACs to verify auth + endpoint + response work end-to-end. |

## User Experience

- **Jobs affected:** Delegate (this is the moment the user delegates a coding work item to a cloud-side runner), Decide (the user reviews the routine session URL + the resulting PR + Vercel preview before approving merge), Capture (routine started, PR opened, preview ready, /dev-review comment posted — all surface as inline cards), Review (the routine's `/dev-review` output is one of two review signals; human PR review is the other).
- **Primitives involved:** routine config form on `/projects/[slug]/runners` (added by this brief). All conversation-surface cards use existing `ContentBlock` types (text + link + status-badge); no new primitives.
- **Process-owner perspective:** the user creates a Routine in Anthropic's web UI once per project, copies the trigger URL + bearer, pastes them into Ditto's runner config form (Brief 215's admin scaffold). Thereafter, work items dispatched to this project's `claude-code-routine` runner result in: (1) "Routine started" card with deep-link to the live Anthropic session, (2) "PR opened" card with deep-link to GitHub PR, (3) "Vercel preview ready" card with deep-link to preview URL, (4) "/dev-review complete" notification, (5) human reviews PR + preview, approves merge. All four cards are tappable from a phone.
- **Interaction states:**
  - Loading (dispatching): inline spinner on the work item; "Dispatching to Routine..." card.
  - Dispatched: "Routine started" card with session URL.
  - Running: "Routine running" with last-updated timestamp + session URL.
  - Succeeded with PR: "PR opened" card + "/dev-review complete" + "Vercel preview ready" cards stack additively as signals arrive.
  - Failed: "Routine failed" card with error message + "Retry next runner" button (handled by Brief 215's dispatcher, surfaced here).
  - Rate-limited: "Routine rate-limited — advancing to next runner in chain" notification (dispatcher logic, surfaced here as a card).
  - Orphaned: "Routine session orphaned (no callback within 30 min)" — Brief 215's sweeper drives this; this brief surfaces the resulting card.
- **Designer input:** **Designer not invoked.** Lightweight UX section here; full conversation-surface polish + runner-pill + retry-buttons + "Run on:" selector belong to sub-brief 221 (which spawns Designer). This brief uses existing card primitives at MVP fidelity.

## Acceptance Criteria

1. [ ] **Spike test lands FIRST per Insight-180.** `src/engine/spike-tests/routine-dispatch.spike.test.ts` exists, makes ONE real HTTP roundtrip to Anthropic's `/fire` endpoint using a real configured Routine + bearer, verifies status 200 + response contains `claude_code_session_id` and `claude_code_session_url`. Lands in its own commit BEFORE any other AC code. Runnable locally; skipped in CI (requires real Anthropic bearer).

2. [ ] **`routineAdapter` exists at `src/adapters/claude-code-routine.ts`** implementing the `RunnerAdapter` interface from Brief 215 (`kind: 'claude-code-routine'`, `mode: 'cloud'`, `configSchema`, `execute()`, `status()`, `cancel()`, `healthCheck()`). All methods type-check against the interface.

3. [ ] **Adapter registered in `runner-registry.ts`.** Brief 215 ships the registry with the `local-mac-mini` adapter; this brief adds `routineAdapter` registration for `claude-code-routine`. Integration test: dispatching a work item with `runner_override = 'claude-code-routine'` resolves to `routineAdapter` via `runner-registry.get('claude-code-routine')`.

4. [ ] **`stepRunId` guard rejects pre-DB-write.** Integration test calls `routineAdapter.execute(undefined, …)` and asserts (a) the call throws BEFORE any `runner_dispatches` row is written (DB-spy), (b) before any HTTP call is made (HTTP-mock-spy), (c) before the credential vault is read (credential-spy). `DITTO_TEST_MODE` bypass tested separately.

5. [ ] **Per-dispatch ephemeral callback token generated, hashed, persisted.** Unit test: `execute()` generates a token (≥30 bits entropy), bcrypt-hashes it (cost 12), writes the hash to `runner_dispatches.callback_token_hash`. Plaintext appears only in the composed prompt; not in any log, DB column, or function return. Verified by grep on test logs.

6. [ ] **Schema migration adds `runner_dispatches.callback_token_hash` column** at the next-free Drizzle idx after Brief 215's migration. `_journal.json` entry exists; SQL file present; snapshot present; no idx gaps. `pnpm drizzle-kit migrate` succeeds against `data/dev.db`; idempotent re-run is no-op. Existing `runner_dispatches` rows have NULL in the new column (back-fill not required).

7. [ ] **Webhook payload Zod schema fills the placeholder.** `packages/core/src/runner/webhook-schema.ts` `claude-code-routine` branch validates: required fields `runner_kind`, `state`, `stepRunId`, `externalRunId`; optional fields `prUrl`, `error`. Invalid payloads (missing required, unknown state values, malformed `prUrl`) reject with Zod errors. Test fixtures cover happy path + 5+ error cases.

8. [ ] **Status webhook handler accepts EITHER project bearer OR ephemeral callback token.** Integration test: payload signed with project bearer → handler verifies via `bcrypt.compare(bearer, projects.runnerBearerHash)`, advances state. Payload signed with ephemeral token → handler verifies via `bcrypt.compare(token, runner_dispatches.callback_token_hash)`, advances state. Invalid bearer → 401. Lookup order: ephemeral first, fall back to project bearer.

9. [ ] **Prompt composition includes `/dev-review` invocation + callback section.** Unit test on `composePrompt()`: output string contains the work-item body, contains "run /dev-review", contains the resolved status webhook URL, contains the (plaintext) ephemeral callback token, contains `stepRunId`, contains `externalRunId` placeholder. For `harnessType='catalyst'`, prompt does NOT inline skill text (relies on repo's `.catalyst/skills/`); for `harnessType='native'` or `'none'`, prompt INLINES the skill text (truncated at 8 KB).

10. [ ] **GitHub fallback handler updates dispatch state from PR + workflow_run + deployment_status events.** Fixture-based integration tests:
    - `pull_request.opened` matching dispatch's branch → `external_url` updated, "PR opened" inline card emitted.
    - `pull_request.closed.merged` → `runner_dispatches.status = 'succeeded'` (verifies Brief 215 state machine allows direct `running → succeeded`).
    - `pull_request.closed.merged` followed by late in-prompt callback `state: 'failed'` → late callback rejected as illegal transition; structured-log warning emitted; status remains `succeeded`.
    - `deployment_status` non-production `success` → "Vercel preview ready: <url>" inline card emitted (verifies the precise detection rule from D5: `state === "success" && environment !== "Production" && environment !== project.deployTargetEnvironment`).
    - `deployment_status` production `success` (matching `project.deployTargetEnvironment`) → no card emitted (Brief 220 owns).
    - `deployment_status` custom env (e.g., `"Custom-Staging"`) with project `deployTargetEnvironment='Production'` → preview card emitted (covers non-default env names).
    - Fallback advances state EVEN IF the in-prompt callback never fires (simulated by skipping the webhook POST in the test).
    - **Webhook subscription registration** verified by integration test: routine adapter's static `webhookSubscriptions` declaration is collected by `runner-registry.ts` at boot and registered with the GitHub integration handler; events on configured repos route to the routine fallback handler.

11. [ ] **End-to-end smoke against agent-crm.** Manual smoke (executed by user once after merge): create a `claude-code-routine` runner config on the agent-crm project pointing at a real Anthropic Routine; dispatch a real work item ("Add a /healthz endpoint"); verify (a) Anthropic session URL appears as inline card on the work-item conversation, (b) PR opens with `claude/*` branch within ~30 min, (c) `/dev-review` output appears as PR comment, (d) Vercel preview URL inline card appears, (e) human approves PR, (f) work item state reflects merge. **Mac mini may be powered off during this smoke** — verifies cloud-only path.

12. [ ] **Trust-tier behavior matches Brief 214 §D8.** Integration tests exercise all four tiers + sampling outcomes against `routineAdapter`:
    - `supervised` → `runner_dispatches` state stays `queued` until human approves at /review/[token]; on approve, advances to `dispatched`.
    - `spot_checked` sampled-in → same.
    - `spot_checked` sampled-out / `autonomous` → wire send immediately.
    - `critical` → adapter rejected pre-dispatch with no DB write, no HTTP call.

13. [ ] **`/projects/[slug]/runners` admin enables `claude-code-routine` kind.** Brief 215 ships it disabled with tooltip; this brief flips it enabled, ships the kind-specific config form (endpoint URL, bearer paste, default repo, default branch), validates against `routineAdapter.configSchema`, encrypts bearer via credential vault on submit, persists `bearer_credential_id` reference in `project_runners.config_json` (NOT plaintext bearer). Mobile-first verified (375 × 667 viewport, no horizontal scroll, ≥44pt taps).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief.
2. Reviewer checks: (a) does the engine-core boundary hold (only the Zod schema added to core; everything else product)? (b) is the per-dispatch ephemeral callback token shape sound — does Brief 223's webhook handler cleanly accept both auth paths without fragility? (c) is the `/dev-review` skill loading honest for both `catalyst` and `native` projects (no missing path, no infinite-recursion risk)? (d) does the GitHub fallback handler correctly NOT race the in-prompt callback (state machine rejects illegal re-transitions)? (e) is the spike-test-first ordering enforced? (f) does the bearer never appear in plaintext at rest in any code path?
3. Present brief + review findings to human for approval.

## Smoke Test

Manual smoke after this brief merges:

```bash
# 1. Spike test (run first per Insight-180)
ROUTINE_BEARER=sk-ant-oat01-... ROUTINE_TRIGGER_ID=trig_01... \
  pnpm vitest run src/engine/spike-tests/routine-dispatch.spike.test.ts
# Expect: pass, real session URL printed.

# 2. Configure agent-crm runner via UI
# Navigate to /projects/agent-crm/runners, "Add runner" → claude-code-routine.
# Paste endpoint URL + bearer + default_repo (`<owner>/agent-crm`) + default_branch (`develop`).
# Submit. Verify: row appears, last_health_status = "healthy" (config-validity check passed).

# 3. Dispatch a real work item
# Capture work item: "Add a /healthz endpoint to agent-crm app router."
# Triage routes it to coding work; trust-tier supervised by default.
# Approve at /review/[token].
# Verify in /projects/agent-crm:
#   - "Routine started" inline card with session URL deep-link
#   - "PR opened" card within ~10-30 min (depending on routine's work)
#   - "/dev-review complete" card (the routine's PR comment from /dev-review)
#   - "Vercel preview ready" card with preview URL
# Tap PR URL on phone, approve PR.
# Verify work item state advances to merged.

# 4. Failure path: invalidate the bearer (rotate via Anthropic UI), dispatch again.
# Verify: routineAdapter returns 401; runner_dispatches.last_health_status = 'unauthenticated';
# work-item conversation shows "Routine authentication failed — re-pair the bearer in /projects/agent-crm/runners".

# 5. Mac-mini-off path
# Power off Mac mini. Repeat step 3.
# Verify: dispatch still completes end-to-end. No local execution required.
```

## After Completion

1. Update `docs/state.md` — Brief 216 transitions `complete`; subsequent architect sessions write 217 (Managed Agents) + 218 (GitHub Actions) in parallel.
2. Update parent brief 214 Status if all phase-level ACs gate through this brief — partial; 214 stays `ready` until phase-completion.
3. Update `docs/dictionary.md` per §What Changes (Routine, Routine Trigger, Ephemeral Callback Token, Default Review Path, Vercel Preview URL Inline Card).
4. Update `docs/landscape.md` Routines entry's "Adoption status" footer with the post-build observations (any beta-header drift, any HTTP-shape surprises).
5. Phase retrospective entry for Brief 216 (run by Documenter): what worked, what surprised about the Routine API beta surface, what to change for sub-brief 217 (Managed Agents — should benefit from the same prompt-composition pattern).
6. No ADR needed — this is a sub-brief implementing the parent brief's design.
