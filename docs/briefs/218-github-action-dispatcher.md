# Brief 218: GitHub Actions Dispatcher (github-action) — third cloud runner adapter (sub-brief of 214)

**Date:** 2026-04-26
**Status:** draft
**Depends on:** Brief 215 (Projects + Runner Registry — substrate; defines the `RunnerAdapter` interface, `runner_dispatches` table, kind/mode/state enums, `runner-registry.ts`, `validateRunnerConfig` for `github-action` shape). Brief 223 SHOULD merge before this brief if the optional in-workflow callback path is wired (the status webhook handler at `packages/web/app/api/v1/work-items/[id]/status/route.ts` is owned by Brief 223); if Brief 223 has not merged at this brief's build time, the workflow-driven status path proceeds via GitHub events alone (the adapter does not require Ditto's status webhook). Briefs 216 (Routine) and 217 (Managed Agents) are NOT hard dependencies, but **the kind-agnostic GitHub-fallback handler** introduced by 216/217 is consumed and extended here — see §D6 below for the rename/coordination guard.
**Unlocks:** the third cloud runner kind. With Brief 215 substrate + 216 (Routine) + 217 (Managed Agents) + this brief, all four implemented cloud runner kinds are dispatchable. Brief 220 (deploy gate), 221 (mobile UX), 222 (smoke tests) consume this adapter.
**Parent brief:** 214 (Cloud Execution Runners Phase)

## Goal

- **Roadmap phase:** Phase 9+ (cloud runner #3 — GitHub Actions workflow_dispatch).
- **Capabilities delivered:**
  - A `githubActionAdapter` (`src/adapters/github-action.ts`) implementing the `RunnerAdapter` interface from Brief 215.
  - Workflow-dispatch config Zod schema: `{ repo, workflowFile, defaultRef, dispatchInputsShape, credential_service, callback_mode? }`.
  - Dispatch via `@octokit/rest` `actions.createWorkflowDispatch` — the endpoint that returns a run ID synchronously since 2026-02-19. Encodes the work-item body + metadata (work_item_id, harness_type, dev_review_skill_path, optional callback URL + bearer secret) into the `inputs` map of the `workflow_dispatch` block.
  - Status path: webhook-primary via `workflow_run` (`requested | in_progress | completed`) + `pull_request` (`opened | synchronize | closed`) + `check_run` / `check_suite` (`completed`) — all via the kind-agnostic `cloud-runner-fallback.ts` extended for this brief. Polling backup at 60-second cadence (per parent §D11) for missed-webhook recovery.
  - Real cancellation: `actions.cancelWorkflowRun`. `supportsCancel: true`.
  - Log-zip retrieval helper (best-effort metadata only at MVP — stores the run's `html_url` and `logs_url`; ingestion of log contents deferred to a future polish brief).
  - **Template workflow file shipped as docs**: `docs/runner-templates/dispatch-coding-work.yml` — the user copies this into `.github/workflows/` of any repo they want to use as a runner target. The template invokes `/dev-review` and (when configured) optionally POSTs status back to Ditto.
  - GitHub Actions credential model: outbound dispatch uses an existing GitHub PAT or installation token from Ditto's credential vault; inbound webhook events use Ditto's existing GitHub integration. No new credential primitive.
  - Multi-repo flexibility: `runner_config.repo` per-runner is independent of `project.github_repo` — dispatching to a repo other than the project's primary repo is supported via config (per-runner-row, not per-dispatch — multiple repos per project = multiple `project_runners` rows would require a config-shape change, deferred).
  - Status decoder filling Brief 215's webhook-schema placeholder for `runner_kind: 'github-action'` — used by the optional in-workflow callback path AND forward-compatible.
  - End-to-end smoke against agent-crm: dispatch fires a real GitHub Actions workflow → workflow checks out the repo → runs Claude Code with the work-item body as a prompt → opens a PR → `/dev-review` runs → Vercel preview surfaces → `workflow_run.completed` event transitions `runner_dispatches.status` to `succeeded`.

## Context

The user's revised pipeline spec (`.context/attachments/pasted_text_2026-04-25_21-14-58.txt:30`) names `github-action` as the third cloud runner. Fit envelope per `docs/research/cloud-runners.md` §C: long-running tasks (≤6h/job, 35d/workflow), custom-env access via Actions secrets, native deploy gates via Environments + required reviewers, cleanest fit for `vercel deploy --prod` because Actions OIDC is what Vercel/Netlify already consume.

Distinct from Briefs 216 + 217 in shape:
- **Status path is webhook-primary** — GitHub emits `workflow_run`, `pull_request`, `check_run`, `deployment_status` events natively. No need for in-prompt callbacks (Routine) or polling-primary (Managed Agents) as the canonical path.
- **The runner is the user's own GitHub Actions runner** — the workflow YAML lives in the user's repo, not under Ditto's control. Ditto dispatches; the user's CI executes; Ditto observes via webhooks.
- **Auth is per-repo, not per-dispatch.** The GitHub PAT (or installation token) needs `actions:write` + `contents:read` scope on each repo configured. Reuses Ditto's existing GitHub integration credential, scoped per-project via the vault.
- **Real cancellation is supported** (vs. Routine's no-cancel + Managed Agents' archive-only). `actions.cancelWorkflowRun` interrupts in-flight runs.
- **Log retrieval is real** but heavy. MVP exposes the URL only; future polish ingests a tail-extract.

GitHub Actions docs:
- `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` with body `{ ref, inputs }` returns the new run's ID synchronously since 2026-02-19 (previously 204 No Content).
- Auth: `Authorization: Bearer <token>` with `actions:write` scope.
- Cancellation: `POST /repos/{owner}/{repo}/actions/runs/{id}/cancel`.
- Logs: `GET /repos/{owner}/{repo}/actions/runs/{id}/logs` returns a `.zip` of per-job log files.
- Webhooks: `workflow_run`, `pull_request`, `check_run`, `check_suite`, `deployment_status` — all already routable via Ditto's existing GitHub integration handler.

Brief 214 §D11 sets the default-review-path discipline. For GitHub Actions, the workflow file itself runs `/dev-review` as a step in the workflow YAML — the user's runner has full filesystem + bash + the cloned repo, so `.catalyst/skills/dev-review/SKILL.md` is read directly. For native-Ditto projects (no `.catalyst/skills/`), the template workflow checks out Ditto's own repo as a secondary checkout (or downloads the SKILL.md as a release asset — see §D5 below for the chosen path).

## Objective

Ship the smallest production-shape GitHub Actions dispatcher that lets a Ditto work item fire a workflow in any user-controlled repo, runs `/dev-review` in-workflow, captures status via GitHub's native webhook surface (with 60-second polling backup), and surfaces the resulting PR + Vercel preview URL in the work-item conversation — phone-friendly throughout, byte-for-byte parallel to Briefs 216 + 217 in user-visible affordances.

## Non-Goals

- **No optional integrations (Greptile / Argos / etc.).** Brief 219 owns detection + opt-in wiring.
- **No deploy gate state machine.** Brief 220 owns `ready-to-deploy → deploying → deployed | deploy_failed` (and the `deploy-prod.yml` template). This brief surfaces the PR + Vercel preview URL but does NOT advance work-items past `review`. **Note:** Brief 220's template workflow may share infrastructure with this brief's template — that coordination is documented in §D5 below.
- **No mobile UX polish.** Brief 221 owns the runner pill, "Run on:" selector, retry buttons.
- **No GitHub App auto-installation.** The user installs Ditto's GitHub integration once (existing setup); per-runner-config the user pastes a PAT or grants additional scopes. Auto-provisioning a GitHub App on each runner repo is out of scope.
- **No auto-commit of the template workflow into user repos.** The template lives at `docs/runner-templates/dispatch-coding-work.yml` and the admin UI shows a "Copy template" button; the user pastes it into `.github/workflows/` of their repo themselves. Auto-committing requires write access + branching policy navigation that doesn't pay back at this scope.
- **No log-content ingestion at MVP.** The adapter stores `html_url` + `logs_url` (the redirect target of `GET /actions/runs/{id}/logs`) on `runner_dispatches`. Tail-extract of stderr-on-failure into `harness_decisions.reviewDetails.runner.logTail` is reserved for a future polish brief.
- **No multi-repo fan-out per dispatch.** One `runner_dispatches` row = one (workItem × runnerKind × repo). If a project needs to dispatch to multiple repos for one work item, that's a future fan-out concern (parent brief §"Cross-runner data sharing" Non-Goal). Multi-repo flexibility here means: each `project_runners` row's `runner_config.repo` is independent — different runners under the same project can target different repos, and per-runner config supports targeting a repo OTHER than `project.github_repo`.
- **No `repository_dispatch` (`event_type` + `client_payload`) at MVP.** The `workflow_dispatch` endpoint is the only dispatch surface this brief implements. `repository_dispatch` is useful for org-wide / cross-repo triggers but the simpler `workflow_dispatch` covers the user's spec; the alternative is reserved for a future polish brief if the user encounters a constraint.
- **No native-Ditto-process scheduling via GitHub Actions.** Coding work items only.
- **No retry-on-rate-limit at the adapter level.** Brief 215's dispatcher handles fallback-chain advancement.
- **No e2b-sandbox fallback.** Brief 215 reserves the kind; the dispatcher skips it (no adapter registered).
- **No `secrets:write` auto-provisioning on user repos.** If the user wants the optional in-workflow callback (the workflow POSTing to Ditto's status webhook), they paste the project's `runnerBearerHash` plaintext into the repo's `Settings → Secrets` themselves (named `DITTO_RUNNER_BEARER`). The admin UI surfaces the plaintext bearer once with a "copy + paste this into your repo's secrets" instruction. Auto-provisioning via `actions.createOrUpdateRepoSecret` is reserved for a future polish brief; it requires `secrets:write` scope which most users won't grant on day 1.

## Inputs

1. `docs/briefs/214-cloud-execution-runners-phase.md` — parent; §D2 (kind enum), §D5 (chain resolution), §D7 (status webhook polymorphism), §D8 (trust integration), §D9 (engine-core boundary), §D10 (Insight-180), §D11 (default review path) are binding.
2. `docs/briefs/215-projects-and-runner-registry.md` — substrate; the `RunnerAdapter` interface, `runner_dispatches` schema, `runner-registry.ts` registration pattern, polymorphic webhook Zod schema with the `github-action` placeholder this brief tightens.
3. `docs/briefs/216-routine-dispatcher.md` — sibling cloud runner; provides the GitHub fallback subscription model (§D4), Vercel-preview detection rule (§D5), `/dev-review` skill availability discipline (§D7), trust integration (§D8), spike-test-first pattern. The kind-agnostic `cloud-runner-fallback.ts` introduced by Brief 216/217 is extended here.
4. `docs/briefs/217-managed-agent-dispatcher.md` — sibling cloud runner; the second concrete consumer of the kind-agnostic fallback handler. By the time Brief 218 ships, the kind-agnostic file paths (`cloud-runner-fallback.ts`, `cloud-runner-prompt.ts`, `cloudRunnerStateToDispatchStatus()`) are established. This brief consumes them.
5. `docs/briefs/220-deploy-gate.md` (forthcoming) — sibling brief that ships `deploy-prod.yml` template + `deployment_status` webhook handler for the production-deploy path. **Coordination note:** the `deployment_status` non-production handler shipped by Brief 216 (extended by 217) handles preview-URL emission; Brief 220 owns the production branch. Brief 218 does NOT touch `deployment_status` — the existing handler in `cloud-runner-fallback.ts` already routes per `workflow_run` correlation, regardless of which runner-kind opened the PR.
6. `docs/briefs/223-projects-schema-and-crud.md` — provides the `POST /api/v1/work-items/:id/status` endpoint, `projects.runnerBearerHash` (long-lived auth). This brief consumes only when `callback_mode = 'in-workflow'` is set.
7. `docs/research/cloud-runners.md` §C "github-action" — research; HTTP contract, status path, webhook events, gaps named.
8. `docs/landscape.md` §"Cloud Execution Runners (2026-04-25)" — GitHub Actions entry; classification DEPEND via `@octokit/rest` (already in stack).
9. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every dispatch is side-effecting; `stepRunId` required at adapter entry.
10. `docs/insights/180-spike-test-every-new-api.md` — spike-test-first pattern. This brief lands a spike test BEFORE wiring (one real `workflow_dispatch` against a real test workflow).
11. `docs/insights/190-migration-journal-concurrency.md` — applies if this brief introduces a schema change (it does NOT — see §What Changes).
12. `docs/adrs/005-integration-architecture.md` — credential vault + integration registry pattern. The GitHub PAT for Actions dispatch is stored in the vault keyed `runner.<projectSlug>.github_token`. Distinct from Ditto's existing global GitHub integration credential (`github.token` for repo-read access) only in service-name; both encrypt the same kind of secret via the same vault primitive. **Reuse rationale:** if the project's runner has the same scope requirements as the global integration, the user can reference the global credential via `credential_service: 'github.token'` instead of pasting a per-runner one.
13. `docs/adrs/007-trust-earning.md` — trust tiers; the adapter calls `trust-gate.ts` BEFORE dispatching per Brief 214 §D8.
14. `src/engine/credential-vault.ts:112` — `getCredential(processId, service)` is the existing credential lookup.
15. `src/adapters/local-mac-mini.ts` + `src/adapters/claude-code-routine.ts` — adapter shape reference; Brief 218's adapter follows the same factory pattern.
16. `src/engine/integration-handlers/rest.ts` — existing REST handler. The Octokit calls in this brief route through Octokit directly (not the REST handler) because Octokit handles auth + rate-limit + pagination; the REST handler is for ad-hoc HTTP, not for SDKs.
17. `@octokit/rest` — already in stack via Ditto's existing GitHub integration. This brief uses `octokit.actions.{createWorkflowDispatch, getWorkflowRun, listWorkflowRunArtifacts, downloadWorkflowRunLogs, cancelWorkflowRun}` and `octokit.repos.{get, getInstallation}`.
18. GitHub REST API docs — [docs.github.com/en/rest/actions/workflows](https://docs.github.com/en/rest/actions/workflows), `…/workflow-runs` — endpoint contracts.
19. GitHub Webhooks docs — [docs.github.com/en/webhooks/webhook-events-and-payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads) — `workflow_run`, `pull_request`, `check_run`, `deployment_status` shapes.

## Architectural Decisions

**D1: Adapter location is product layer.** `src/adapters/github-action.ts` ships the implementation. Engine-core scope: only the GitHub-Actions-specific webhook payload Zod schema (tightening Brief 215's `github-action` placeholder in `packages/core/src/runner/webhook-schema.ts`) and the polling cadence constant (`'github-action': 60_000` in `packages/core/src/runner/poll-cadences.ts` per parent brief). Octokit calls, dispatch input encoding, webhook subscription, log-URL fetching are Ditto-product opinions.

**D2: Dispatch encodes work-item context into `workflow_dispatch.inputs`.** The template workflow's `workflow_dispatch:` block declares a fixed input shape:

```yaml
on:
  workflow_dispatch:
    inputs:
      work_item_id:        { type: string,  required: true,  description: "Ditto work item ID" }
      work_item_body:      { type: string,  required: true,  description: "The coding task description" }
      harness_type:        { type: choice,  required: true,  options: [catalyst, native, none] }
      stepRunId:           { type: string,  required: true,  description: "Insight-180 audit ID" }
      external_run_id:     { type: string,  required: false, description: "Pre-allocated external run ID" }
      callback_url:        { type: string,  required: false, description: "Optional Ditto status webhook URL" }
      dev_review_skill_url: { type: string, required: false, description: "URL to .catalyst/skills/dev-review/SKILL.md (used when harness_type != catalyst)" }
```

The adapter's `execute()` populates these inputs and calls `octokit.actions.createWorkflowDispatch({ owner, repo, workflow_id, ref, inputs })`. The `external_run_id` is set to `null` at first call (the workflow's first step writes the run ID back via the optional callback when `callback_mode='in-workflow'` is set; otherwise the adapter polls `octokit.actions.listWorkflowRuns` filtering by `head_sha` + `event: 'workflow_dispatch'` to find the just-dispatched run's ID).

**Run-ID retrieval:** since 2026-02-19, `createWorkflowDispatch` returns the new run's ID in the response body. The adapter uses this directly. **Fallback for older API behaviour or transient null:** if the response lacks `id`, fall back to `octokit.actions.listWorkflowRuns({ owner, repo, workflow_id, event: 'workflow_dispatch' })` filtered to the most recent run dispatched by the same actor + within `dispatch_run_lookup_window_ms` (default 30s). This is best-effort; if neither path yields an ID, the dispatch is marked `failed` with `errorReason = 'dispatch-run-id-unavailable'` and the user must check the repo's Actions tab.

**D3: Per-dispatch ephemeral callback token is OPTIONAL (mirrors Brief 217 §D3).** Default is webhook-only (GitHub events). When `runner_config.callback_mode = 'in-workflow'`, the adapter generates an ephemeral token (same shape as Brief 216 §D3 — bcrypt cost 12, `runner_dispatches.callback_token_hash` column reused, plaintext only in the `inputs.callback_url` query string OR the workflow's environment via the `DITTO_RUNNER_BEARER` repo secret + a per-dispatch identifier). 

**Token transport choice:** the ephemeral token is passed to the workflow via the `callback_url` input as a query-string parameter (e.g., `https://ditto.you/api/v1/work-items/<id>/status?token=<ephemeral>`). The workflow's status-callback step uses this URL; the token never appears in workflow logs because the URL is a workflow input (GitHub masks input strings in logs by default if `secrets`-flavoured, but inputs aren't secrets — explicit risk acceptance below).

**Plaintext-token-in-workflow-logs risk acceptance:** the `inputs.callback_url` value MAY appear in workflow logs (GitHub does not auto-mask workflow_dispatch inputs the way it masks repo secrets). Mitigation: (a) the token is per-dispatch and one-trip (compromise affects only that dispatch's status update), (b) the workflow's log retention is 90 days by default — beyond that, no exposure, (c) the user can rotate the token by re-dispatching. The long-lived `projects.runnerBearerHash` is preferred for callback-heavy workflows (passed via `secrets.DITTO_RUNNER_BEARER` which IS log-masked), and `callback_mode = 'in-workflow-secret'` selects that path. Three modes total:
- `'webhook-only'` (default) — GitHub events are the only signal.
- `'in-workflow-secret'` — workflow uses `secrets.DITTO_RUNNER_BEARER` (long-lived project bearer); user pastes plaintext into repo secrets once. Most secure for high-frequency callbacks.
- `'in-workflow'` — workflow uses the per-dispatch ephemeral token via `inputs.callback_url`. Convenient for one-off dispatches without secret-management overhead.

Default `'webhook-only'` is sufficient for the parent brief's success criteria; the other two modes are progressive disclosure.

**D4: Skill availability — three paths.**
- **Catalyst projects (`harnessType='catalyst'`):** the cloned repo carries `.catalyst/skills/dev-review/SKILL.md`. The template workflow's `actions/checkout@v4` step makes it available; no Ditto-side action needed.
- **Native-Ditto projects (`harnessType='native' | 'none'`):** the template workflow does a SECOND `actions/checkout@v4` against Ditto's public release artifact (a published `.catalyst/skills/dev-review/SKILL.md` URL on Ditto's release page) OR pulls the skill text from a Ditto-published GitHub release asset URL. **Chosen path:** Ditto publishes `.catalyst/skills/dev-review/SKILL.md` as a release asset on every release; the URL is `https://github.com/<dittoOwner>/ditto/releases/download/<version>/dev-review-SKILL.md`. The adapter populates `inputs.dev_review_skill_url` with this URL at dispatch time (resolved from `DITTO_RELEASE_VERSION` env var or a config default). The workflow's first step `curl`s this URL into a known path; `claude-code` then reads it. **Fallback if the release asset is missing:** the adapter inlines the skill text directly into `inputs.work_item_body` as a markdown appendix (capped at 4 KB after the work-item body, total dispatch input size is GitHub's 65 KB-per-input limit), and the workflow uses the inlined skill instead of fetching. The catalyst path is the primary path; fetch + inline are fallbacks.

**D5: GitHub fallback subscription is shared with Brief 216 + 217 via `cloud-runner-fallback.ts`.** This brief extends the kind-agnostic handler to route `workflow_run` (`completed`) events to the matching `runner_dispatches` row by `external_run_id`. The handler routes the existing `pull_request` + `deployment_status` events the same as for routine + managed-agent (kind-routing on the deep-link URL only). Adds `check_run.completed` routing for projects that produce check-status results (Argos, Greptile-via-Brief-219). The deep-link URL for `github-action` is `https://github.com/<owner>/<repo>/actions/runs/<run_id>` (the standard GitHub Actions UI URL).

**Coordination with Brief 220 (deploy gate):** the existing `deployment_status` handler in `cloud-runner-fallback.ts` already routes preview-environment events to the Vercel-preview-card emission. Brief 220 adds a production-environment branch in the same handler. **No work for Brief 218 in deployment_status.** This is documented to make the seam explicit.

**D6: Vercel preview URL inline card emission is shared.** Same precise detection rule as Brief 216 §D5 (`state === "success"` AND `environment !== "Production"` AND `environment !== project.deployTargetEnvironment`). Same fallback handler path. No duplication.

**D7: Health check is config-validity + lightweight repo probe.** `githubActionAdapter.healthCheck()` verifies (a) the credential exists (vault keyed `runner.<projectSlug>.github_token`), (b) `config.repo` parses as `owner/repo` shape, (c) `config.workflowFile` is a valid filename (`.yml` or `.yaml`). The lightweight live probe — `octokit.repos.get({ owner, repo })` — verifies the repo is reachable AND the token has at least read access. `actions:write` scope is NOT verified at health-check time (would require firing a real `workflow_dispatch`); 401 / 403 on dispatch surfaces reactively as `last_health_status = 'unauthenticated'`. The "Verify with API" admin button (Brief 217 D8 precedent) is the path to check write scope explicitly: it calls `octokit.actions.listRepoWorkflows({ owner, repo })` (requires `actions:read`) to verify scope without firing a dispatch.

**D8: Trust integration consistent with Brief 214 §D8.** Adapter calls `trust-gate.ts` BEFORE dispatch:
- `supervised` → `pause`. `runner_dispatches.status = 'queued'`; wait for /review/[token] approval; on approve → `dispatched`.
- `spot_checked` sampled-in → `sample_pause`. Same.
- `spot_checked` sampled-out / `autonomous` → wire send immediately.
- `critical` → adapter rejected pre-dispatch.

**D9: Engine-core deliverable.** `packages/core/src/runner/webhook-schema.ts` `github-action` placeholder is tightened to the inline shape:

```ts
z.object({
  runner_kind: z.literal('github-action'),
  state: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  prUrl: z.string().url().optional(),
  error: z.string().max(2_000).optional(),
  stepRunId: z.string().min(1),
  externalRunId: z.string().min(1),
  // GitHub-Actions-specific optional fields
  workflowRunUrl: z.string().url().optional(),
  conclusion: z.enum(['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale']).optional(),
}),
```

The base shape mirrors Brief 217's `claude-managed-agent` schema (allows `cloudRunnerStateToDispatchStatus()` to handle all three cloud-runner kinds via one helper). The two GitHub-Actions-specific optional fields (`workflowRunUrl`, `conclusion`) are surfaced for the inline card's deep-link + status-badge UX — preserved through the decoder into `harness_decisions.reviewDetails.runner.{workflowRunUrl, conclusion}`. The current `payload: z.unknown()` wrapper on Brief 215's substrate is dropped (same harmonisation as Brief 217 §D10).

State-mapping table (mirrors Brief 216 / 217):

| Webhook `state` | Webhook `error` field | `runner_dispatches.status` |
|-----------------|----------------------|----------------------------|
| `running` | n/a | `running` |
| `succeeded` | n/a | `succeeded` |
| `cancelled` | n/a | `cancelled` |
| `failed` | (absent or generic) | `failed` |
| `failed` | matches `/rate.?limit/i` | `rate_limited` |
| `failed` | matches `/timeout|timed.?out/i` | `timed_out` |

**`workflow_run` event → state mapping** (used by `cloud-runner-fallback.ts` when GitHub's webhook is the source, NOT the in-workflow callback):

| GitHub `workflow_run.status` | GitHub `workflow_run.conclusion` | `runner_dispatches.status` |
|------------------------------|----------------------------------|----------------------------|
| `requested` | n/a | `dispatched` |
| `in_progress` | n/a | `running` |
| `completed` | `success` | `succeeded` |
| `completed` | `failure` | `failed` |
| `completed` | `cancelled` | `cancelled` |
| `completed` | `timed_out` | `timed_out` |
| `completed` | `action_required` | `failed` (errorReason: action_required) |
| `completed` | `neutral` | `succeeded` (treated as soft-pass) |
| `completed` | `skipped` | `cancelled` |
| `completed` | `stale` | `cancelled` (run superseded by a newer dispatch on the same branch — semantically a cancellation, not a failure) |

This map is documented in `cloud-runner-fallback.ts` as a comment block; the decoder is a small switch.

Polling cadence constant added to `poll-cadences.ts`: `'github-action': 60_000`.

**D10: Insight-180 stepRunId guard at adapter entry.** `githubActionAdapter.execute(ctx, workItem, project, projectRunner)` rejects calls where `ctx.stepRunId` is falsy BEFORE any DB write or Octokit call. `runner_dispatches.stepRunId` FK enforced. `harness_decisions` row written keyed on `stepRunId`. The `stepRunId` is also encoded into `workflow_dispatch.inputs.stepRunId` so the workflow can echo it back on callback (preserving the audit chain).

**D11: Webhook subscription registration via the adapter's static `webhookSubscriptions` field.** Same pattern as Brief 216 §D4 / 217 §D6. Declares `{ events: ['workflow_run', 'pull_request', 'check_run', 'deployment_status'], match: ... }`. The match function looks up the dispatch by repo + (workflow ID OR head_sha matching) + Ditto-allocated `external_run_id` correlation. `runner-registry.ts` (Brief 215, extended by 216 + 217) iterates registered adapters at boot and registers their webhook subscriptions with the existing GitHub integration handler.

**D12: Multi-repo flexibility, not multi-repo fan-out.** `runner_config.repo` can be different from `project.github_repo`. A single project may have multiple `project_runners` rows with different `repo` values (one row per kind, but fan-out across repos is a config-shape change deferred). The dispatcher's `resolveChain()` (Brief 215 §D5) doesn't care about repo — it picks a runner kind. The repo binding happens in the adapter's `execute()` from `projectRunner.configJson.repo`. **Use case satisfied:** "I want this project's coding work dispatched to my staging repo, not my main repo" — set `repo: '<owner>/staging-mirror'` in the runner config.

**D13: Cancellation is real.** `githubActionAdapter.cancel(dispatchId, externalRunId)` calls `octokit.actions.cancelWorkflowRun({ owner, repo, run_id })`. `supportsCancel: true`. The cancellation surfaces as a `workflow_run.completed` event with `conclusion: 'cancelled'`, which the fallback handler maps to `runner_dispatches.status = 'cancelled'` per the table in §D9. **Note:** GitHub's cancellation may take up to 30 seconds to interrupt running steps; documented limitation. The adapter returns `{ ok: true }` immediately on the cancel API success; the actual state transition arrives via webhook.

**D14: Log-URL retrieval at MVP, content ingestion deferred.** On any terminal state (`succeeded | failed | timed_out | cancelled | stale`), the fallback handler stores `workflow_run.html_url` and `workflow_run.logs_url` (the redirect URL from the API) on `harness_decisions.reviewDetails.runner.{workflowRunUrl, logsUrl}`. The `runner_dispatches.errorReason` field is reserved for failure messages (e.g., `"action_required"`, `"dispatch-run-id-unavailable"`, the GitHub API's error string), NOT for URLs — keeping the schema's "why did this fail" and "where to look" semantics distinct. The user clicks through to GitHub via the audit row's URL to view logs. **Content ingestion** (download zip → extract last 4 KB of stderr → store in audit row) is reserved for a future polish brief — flagged in this brief's "After Completion" so it's not lost.

**D15: Coordination with Briefs 216 + 217 (sibling cloud runners).** The kind-agnostic file paths established by 216 + 217 (`cloud-runner-prompt.ts`, `cloud-runner-fallback.ts`, `cloudRunnerStateToDispatchStatus()`, `poll-cadences.ts`) are CONSUMED here, not extended in name. This brief adds `github-action` cases to each via small switches/enum entries — no further renames. **If 218 ships before 217 OR 216:** this brief creates the kind-agnostic files itself and leaves placeholder branches for the other two kinds; the second-shipping brief (216 or 217) consumes them per the same rename guard. The architect verifies at brief-write time which sibling has merged.

**D16: Template workflow file is documentation, not code.** `docs/runner-templates/dispatch-coding-work.yml` is a complete copy-pasteable workflow with placeholders (`<DITTO_API_BASE_URL>`, `<DITTO_RELEASE_VERSION>`, etc.). The admin UI's runner-config form for `github-action` displays the template alongside a "Copy template" button. **Why docs not code:** Ditto does not commit YAML to user repos. The user owns their workflows; Ditto's role is to dispatch. The template lives at `docs/runner-templates/` not `templates/` — a deliberate path choice making it non-code (Insight-043 reference-doc-accuracy applies; the template is a reference doc that updates as the dispatch shape evolves).

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/runner/webhook-schema.ts` | **Modify** — tighten the `github-action` placeholder to the inline shape in §D9 (drops the `payload: z.unknown()` wrapper). Two GitHub-Actions-specific optional fields (`workflowRunUrl`, `conclusion`) added. The kind-agnostic `cloudRunnerStateToDispatchStatus()` helper from Brief 216 / 217 handles `'github-action'` natively (same enum + error-pattern mapping). |
| `packages/core/src/runner/webhook-schema.test.ts` | **Modify** — add tests for `github-action` payload parsing: valid happy-path; invalid (missing required, unknown state, malformed `prUrl` or `workflowRunUrl`) reject; both with and without optional fields. |
| `packages/core/src/runner/poll-cadences.ts` | **Create OR Modify** — add `'github-action': 60_000` per parent §D11. (Created by Brief 217 or this brief, whichever ships first; **Brief 216 does NOT create or modify this file** — see Brief 217 §What Changes for the parent-spec routine-polling deviation note.) |
| `src/adapters/github-action.ts` | **Create** — `githubActionAdapter` factory (`createGithubActionAdapter(opts: { octokit: Octokit, db: Database })`) returning a `RunnerAdapter`. Sections: <br>(a) `configSchema` Zod for `{ repo, workflowFile, defaultRef, credential_service, callback_mode?: 'webhook-only' \| 'in-workflow-secret' \| 'in-workflow', dispatch_run_lookup_window_ms? }`. <br>(b) `healthCheck()` — config-validity + lightweight `octokit.repos.get` per D7. <br>(c) `execute(ctx, workItem, project, projectRunner)` — Insight-180 guard, optional ephemeral-token generation when `callback_mode='in-workflow'`, encode work-item body + metadata into `inputs`, `octokit.actions.createWorkflowDispatch({ owner, repo, workflow_id: workflowFile, ref, inputs })`, capture `response.data.id` as `externalRunId` (with the listWorkflowRuns fallback per D2), return `DispatchResult` with `externalUrl = 'https://github.com/<owner>/<repo>/actions/runs/<id>'`. <br>(d) `status(dispatchId, externalRunId)` — calls `octokit.actions.getWorkflowRun({ owner, repo, run_id: externalRunId })`, applies the workflow_run-status-to-dispatch-status table from §D9, returns `DispatchStatusSnapshot`. <br>(e) `cancel(dispatchId, externalRunId)` — calls `octokit.actions.cancelWorkflowRun({ owner, repo, run_id: externalRunId })`. <br>`supportsCancel: true`. <br>(f) `webhookSubscriptions` static field declaring the four event types per D11. ~350 LOC. |
| `src/adapters/github-action.test.ts` | **Create** — unit tests with mocked Octokit + clock + bcrypt: stepRunId guard rejects pre-DB; encode-inputs covers all three callback modes; `createWorkflowDispatch` called with correct shape; response `id` parsed; listWorkflowRuns fallback path covered; `getWorkflowRun` status mapping for all 9 conclusion values in §D9's table; `cancelWorkflowRun` returns `{ ok: true }`. |
| `src/engine/runner-status-handlers/github-action.ts` | **Create** — decoder consuming the `github-action` discriminated-union branch from Brief 223's status webhook (only fires when `callback_mode != 'webhook-only'` AND the workflow's optional callback step runs). Validates the bearer (per-dispatch ephemeral OR project bearer per Brief 223 + 216 extension), updates `runner_dispatches.status` per Brief 215's state machine, writes `harness_decisions` audit row (with `reviewDetails.runner.workflowRunUrl` + `conclusion`), posts conversation inline card. ~150 LOC. |
| `src/engine/runner-status-handlers/github-action.test.ts` | **Create** — integration tests with fixture HTTP requests: valid payload + ephemeral token → status advances; valid payload + project bearer → status advances; invalid bearer → 401; `webhook-only` mode (handler not invoked, GitHub-events path is the canonical one) verified. |
| `src/engine/github-events/cloud-runner-fallback.ts` | **Modify** — add `workflow_run` event routing per D5 (looks up dispatch by `external_run_id` AND repo match); add the `workflow_run.status + conclusion` → `runner_dispatches.status` map per D9 as a small switch. Add `check_run.completed` routing (used by Brief 219 for Argos / Greptile gating; this brief adds the routing infrastructure, payload semantics deferred to 219). The existing `pull_request` + `deployment_status` cases unchanged. Per-kind deep-link URL added to the existing per-kind branch: `'github-action': \`https://github.com/${owner}/${repo}/actions/runs/${runId}\``. |
| `src/engine/github-events/cloud-runner-fallback.test.ts` | **Modify** — add fixture tests covering: `workflow_run.completed` with each conclusion value maps correctly; `check_run.completed` routing infrastructure (semantic tests deferred to Brief 219); existing routine + managed-agent cases continue to pass. |
| `src/engine/runner-poll-cron.ts` | **Create OR Modify** — add `'github-action'` to the cron's kind iteration per the cadence map. The cron walks non-terminal `runner_dispatches` rows of every registered kind for which a polling cadence is configured; this brief's adapter contributes its `status()` method. (Created by Brief 217 or this brief, whichever ships first; **Brief 216 does NOT create this file**.) |
| `src/engine/runner-poll-cron.test.ts` | **Modify** — add integration tests: cron polls `github-action` rows at 60s cadence; `getWorkflowRun` mock returns `completed/success` → row transitions `succeeded`; cron survives Octokit throw on one row (other rows continue). |
| `src/engine/runner-registry.ts` | **Modify** — register `githubActionAdapter` for `github-action` kind. |
| `src/engine/runner-config-schemas.ts` | **Modify** — replace the placeholder `githubActionSchema` (currently `repo + workflowFile + credentialService`) with the full schema from `githubActionAdapter.configSchema` (re-exported from the adapter file to keep one source of truth). |
| `packages/web/app/projects/[slug]/runners/page.tsx` | **Modify** — enable the `github-action` option in the kind selector (Brief 215 ships it disabled). Add the kind-specific config form: repo input (`owner/repo` regex-validated), workflowFile input (with helper text "the file under .github/workflows/"), defaultRef input (default `'main'`), credential_service selector (a dropdown of vault-keyed credentials, OR a "paste a new GitHub PAT" option that writes to `runner.<projectSlug>.github_token`), `callback_mode` radio (3 modes per D3, default `webhook-only`). "Verify with API" button (per D7) calls `octokit.actions.listRepoWorkflows`. **Template-copy panel:** show the contents of `docs/runner-templates/dispatch-coding-work.yml` with a "Copy" button + a heading "Paste this into `.github/workflows/dispatch-coding-work.yml` in your repo, then commit." Mobile-first verified. |
| `packages/web/app/api/v1/projects/[id]/runners/route.ts` | **Modify** — when `kind: 'github-action'` is POSTed, validate against `githubActionAdapter.configSchema`, write the GitHub PAT to the credential vault keyed `runner.<projectSlug>.github_token` per ADR-005 boundary-encryption, replace plaintext PAT with `credential_service` reference in `config_json`. |
| `packages/web/app/api/v1/projects/[id]/runners/[kind]/verify/route.ts` | **Modify** — extend the existing endpoint (created by Brief 217) to handle `kind=github-action`: call `octokit.actions.listRepoWorkflows`, update `last_health_status` based on response. |
| `packages/web/app/api/v1/work-items/[id]/status/route.ts` | **Modify** — extend the runner-kind dispatch table (added by Brief 216 / 217) with `github-action` routing to `runner-status-handlers/github-action.ts`. Bearer-acceptance unchanged. |
| `docs/runner-templates/dispatch-coding-work.yml` | **Create** — full copy-pasteable workflow YAML implementing the template per D2 + D4. Covers: `actions/checkout@v4`, optional secondary checkout for native projects (curl the SKILL.md release asset), `claude-code` invocation with the work-item body as the prompt, `/dev-review` invocation as a step, optional callback step that POSTs to `inputs.callback_url` with the appropriate Authorization header (project bearer from `secrets.DITTO_RUNNER_BEARER` for `in-workflow-secret` mode, ephemeral-token-in-URL for `in-workflow` mode). Comments mark the placeholders. ~120 lines of YAML + 30 lines of comments. |
| `docs/runner-templates/README.md` | **Create** — short README explaining: what's in the directory, why it's `docs/` (not `templates/`), how to copy a template into your repo, the auth + scope requirements per template. |
| `docs/dictionary.md` | **Modify** — add: GitHub Action Runner, Workflow Dispatch, Workflow Run, Dispatch Inputs, Template Workflow File, Cloud-Runner Callback Mode (the cross-runner term covering all three modes). |
| `docs/landscape.md` | **Modify** — annotate GitHub Actions entry with "Adopted in Brief 218" footer; document the run-ID-since-2026-02-19 dependency + 60s polling cadence as known constraints. |
| `.env.example` | **Modify** — document `GITHUB_ACTION_DISPATCH_RUN_LOOKUP_WINDOW_MS` (default 30000), `DITTO_RELEASE_VERSION` (used by D4 fallback skill-URL composition; defaults to package.json version). |
| `src/engine/spike-tests/github-action-dispatch.spike.test.ts` | **Create** — Insight-180 spike test pattern: ONE real Octokit roundtrip — `createWorkflowDispatch` against a real test repo with a `dummy-dispatch.yml` workflow that just echoes inputs. Verifies the response contains `id`, the workflow becomes visible via `getWorkflowRun`, then cancels it via `cancelWorkflowRun`. Skipped in CI (requires real GitHub PAT + real test repo); runnable locally via `pnpm vitest run src/engine/spike-tests/github-action-dispatch.spike.test.ts`. **Run BEFORE wiring the adapter per Insight-180 spike-first pattern.** Lands in own commit. |

## Constraints

- **Engine-first per CLAUDE.md.** The webhook payload Zod schema + the polling cadence entry are engine-core. Octokit calls, dispatch input encoding, GitHub-fallback handler routing, conversation card emission, template-workflow YAML are product layer.

- **Side-effecting function guard (Insight-180) — MANDATORY.** `githubActionAdapter.execute()` requires `ctx.stepRunId`; rejects pre-DB-write if missing (except `DITTO_TEST_MODE`). Verified by AC #4. Spike test (`github-action-dispatch.spike.test.ts`) lands in own commit BEFORE other AC code.

- **Trust integration via existing `trust-gate.ts` per Brief 214 §D8.** Adapter does NOT make trust decisions.

- **`harness_decisions` audit row per dispatch** (`processRunId`, `stepRunId`, `trustTier`, `trustAction`, `reviewDetails.runner = { runnerKind: 'github-action', runnerMode: 'cloud', externalRunId, attemptIndex, workflowRunUrl?, conclusion? }`). No new audit table.

- **No schema changes.** This brief reuses `runner_dispatches.callback_token_hash` (Brief 216) when `callback_mode='in-workflow'`. Polling-default + webhook-only path requires no schema additions. **Verified by grep:** if this brief introduces a new column or table, that is a defect.

- **No PAT plaintext at rest, ever.** Outbound GitHub PAT encrypted in vault keyed `runner.<projectSlug>.github_token`. Inbound per-dispatch ephemeral token (when `callback_mode='in-workflow'`): bcrypt-hashed (cost 12); plaintext exists only in the workflow's `inputs.callback_url` query string and is forgotten by Ditto immediately after dispatch. Long-lived bearer (when `callback_mode='in-workflow-secret'`): user pastes plaintext into the repo's GitHub Secrets, never seen by Ditto post-rotation.

- **GitHub log retention applies to plaintext-token-in-inputs risk.** Plaintext ephemeral tokens in workflow_dispatch inputs MAY appear in workflow logs (90-day retention default). Mitigation: per-dispatch tokens are one-trip; the recommendation in admin UI surfaces `'in-workflow-secret'` as the preferred mode for callback-heavy workflows; documented risk acceptance in §D3.

- **Reuse existing primitives.** Credential vault, `@octokit/rest` (already in stack), GitHub integration (existing — for webhook subscription), conversation surface inline cards (existing `ContentBlock` types), `harness_decisions` audit, `runner_dispatches` state machine (Brief 215), `cloud-runner-fallback.ts` + `runner-poll-cron.ts` + `cloud-runner-prompt.ts` + `cloudRunnerStateToDispatchStatus()` (Brief 216 + 217 cross-runner extractions).

- **Mobile-first per ADR-018.** The `/projects/[slug]/runners` form additions for github-action config (repo, workflowFile, defaultRef, credential, callback_mode, "Verify with API" button, template-copy panel) MUST work on a phone — touch targets ≥44pt, no horizontal scroll on long repo names or workflow YAML (truncate-with-tap-to-expand, and the YAML panel collapses to a "Show template" toggle on mobile by default).

- **Beta API discipline — N/A.** GitHub Actions REST APIs are GA. No beta header. The `actions:write` scope requirement is documented in the runner-config form's helper text + the template README.

- **No spamming GitHub for health checks.** Health check is config-validity + ONE `octokit.repos.get` call per D7. The "Verify with API" button is the only path to a stronger probe; manual-only.

- **Output cap discipline.** Workflow logs are NOT ingested at MVP (D14). The dispatch-input size has GitHub's 65 KB-per-input cap; the adapter caps `work_item_body` input at 50 KB (with a 15 KB buffer for the inlined skill fallback per D4). Larger work-item bodies are truncated with a marker; the adapter logs a structured warning ("dispatch input truncated; consider splitting work item").

- **Webhook recovery via 60-second polling — backup path.** GitHub webhook delivery is generally reliable but the `events delivery` retry policy drops events after N retries. The polling cron (cadence 60s) catches up on missed events by calling `getWorkflowRun` for non-terminal `runner_dispatches` rows.

- **Cancellation is best-effort with documented latency.** GitHub may take up to 30 seconds to interrupt running steps. The `cancel()` method returns immediately; the `runner_dispatches.status` transition arrives via the subsequent `workflow_run.completed` webhook with `conclusion: 'cancelled'`.

- **Multi-repo flexibility, not fan-out.** `runner_config.repo` ≠ `project.github_repo` is supported; one (project × kind × repo) per `project_runners` row. Multi-repo fan-out per dispatch is a future concern.

- **Template workflow file is documentation, not committed code.** `docs/runner-templates/dispatch-coding-work.yml` is read-only reference. The admin UI displays it for copy-paste; Ditto does not auto-commit.

- **Coordination with Brief 220 (deploy gate).** `deployment_status` non-production routing in `cloud-runner-fallback.ts` is owned by Brief 216 / 217 (preview-URL emission). Brief 220 will add the production-environment branch. Brief 218 does not touch `deployment_status` — explicitly named in §D5 to make the seam visible.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| `RunnerAdapter` interface | `docs/briefs/215-projects-and-runner-registry.md` §What Changes — `interface.ts` code block | depend (sibling brief) | Brief 215 is the contract source. |
| Workflow dispatch + run-ID-since-2026-02-19 | `docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event` (GitHub Changelog 2026-02-19) | depend (service) | The endpoint contract; the run-ID-on-response is the dependency this brief carries. |
| `@octokit/rest` SDK reuse | `src/engine/integration-handlers/rest.ts` + Ditto's existing GitHub integration | depend (existing) | Same SDK; same auth model. |
| `workflow_run` / `pull_request` / `check_run` / `deployment_status` webhook events | `docs.github.com/en/webhooks/webhook-events-and-payloads` | depend (service) | The native event surface; reused via Ditto's existing GitHub integration handler. |
| Cross-runner `cloud-runner-fallback.ts` extension | Brief 216 §D4 + Brief 217 §D6 | pattern (sibling brief) | The kind-agnostic handler is established by 216/217; this brief adds `workflow_run` routing as a small switch. |
| Cross-runner `cloudRunnerStateToDispatchStatus()` | Brief 216 + 217 webhook-schema state map | pattern (sibling brief) | Same enum + error-pattern mapping handles all three cloud-runner kinds. |
| Cross-runner `runner-poll-cron.ts` extension | Brief 216 + 217 | pattern (sibling brief) | The cron walks all kinds; this brief adds `github-action` to the cadence map. |
| Vercel preview URL detection | Brief 216 §D5 | pattern (sibling brief) | Identical detection rule; preserved through `cloud-runner-fallback.ts`. |
| GitHub Actions cancellation | `octokit.actions.cancelWorkflowRun` | depend (service) | Only documented cancellation surface. |
| Template-workflow-as-docs (not auto-committed) | Original to Ditto + GitHub Actions's reusable-workflows pattern (`uses: org/repo/.github/workflows/foo.yml@ref`) | original | Ditto does not own user repos; the template lives at `docs/runner-templates/`. The reusable-workflows pattern is studied but not adopted (would require Ditto to commit a public workflow to a Ditto-controlled repo, which adds a maintenance + scope-creep surface). |
| Per-dispatch ephemeral callback token (optional) | Brief 216 §D3 + Brief 217 §D3 | pattern (sibling brief) | Identical token discipline; reused — no new column. |
| Three callback-mode discipline (`webhook-only` / `in-workflow-secret` / `in-workflow`) | Original to Ditto (combining Brief 216's ephemeral + Brief 217's polling-primary insights) | original | The three-mode progression makes log-masking trade-offs explicit; default `webhook-only` is the safest. |
| Spike test before adapter wires | `docs/insights/180-spike-test-every-new-api.md` (Insight-180 spike pattern) | pattern (project-internal) | Brief 212 + 216 + 217 precedent. |
| `bcrypt` cost 12 hash for callback token | Brief 216 §D3 | depend (self-reuse) | Existing Ditto convention. |
| Credential vault outbound storage | `src/engine/credential-vault.ts` + ADR-005 boundary-encryption | depend (existing) | Outbound GitHub PAT encrypted at rest. |

## User Experience

- **Jobs affected:** Delegate (the user delegates a coding work item to the GitHub Actions runner — running in their own repo's CI infrastructure with full audit trail in GitHub's UI), Decide (the user reviews the workflow run UI + the resulting PR + Vercel preview), Capture (workflow started, PR opened, preview ready, /dev-review comment posted — all surface as inline cards), Review (the workflow's `/dev-review` output is one of two review signals; human PR review is the other).
- **Primitives involved:** GitHub-Action config form on `/projects/[slug]/runners` (added by this brief). Template-copy panel for `dispatch-coding-work.yml` (new affordance, mobile-collapsible). All conversation-surface cards use existing `ContentBlock` types.
- **Process-owner perspective:** the user copies `dispatch-coding-work.yml` into their repo's `.github/workflows/`, generates a GitHub PAT with `actions:write` + `contents:read` (or grants those scopes via the existing GitHub integration), pastes the PAT + repo + workflow filename into Ditto's runner-config form. (Optionally pastes the project's `runnerBearerHash` plaintext into the repo's GitHub Secrets as `DITTO_RUNNER_BEARER` for `in-workflow-secret` callback mode.) Thereafter, work items dispatched to this project's `github-action` runner result in: (1) "GitHub Actions workflow started" card with deep-link to the live Actions UI, (2) "PR opened" card via the shared GitHub-fallback handler, (3) "Vercel preview ready" card with deep-link to preview, (4) "/dev-review complete" notification, (5) human reviews PR + preview, approves merge.
- **Interaction states:**
  - Loading (dispatching): inline spinner; "Dispatching to GitHub Actions…" card.
  - Dispatched: "GitHub Actions workflow started" card with run URL.
  - Running: "Workflow running" with last-event timestamp + run URL.
  - Succeeded with PR: "PR opened" + "/dev-review complete" + "Vercel preview ready" cards.
  - Failed: "Workflow failed" card with link to GitHub's logs UI + "Retry next runner" button.
  - Cancelled: "Workflow cancelled" card.
  - Rate-limited: GitHub's rate-limit responses surface as `failed` with `errorReason` matching `/rate.?limit/i` → mapped to `rate_limited` per the table; "advancing to next runner in chain" notification.
  - Orphaned: covered by Brief 215's staleness sweeper; surfaced here as a card.
- **Designer input:** **Designer not invoked.** Lightweight UX section here; full polish in sub-brief 221 (Designer-led).

## Acceptance Criteria

1. [ ] **Spike test lands FIRST per Insight-180.** `src/engine/spike-tests/github-action-dispatch.spike.test.ts` exists, makes ONE real Octokit roundtrip — fires `createWorkflowDispatch` against a real test repo with a `dummy-dispatch.yml`, verifies the response contains `id`, then calls `cancelWorkflowRun`. Lands in its own commit BEFORE any other AC code. Runnable locally; skipped in CI (requires real GitHub PAT + real test repo).

2. [ ] **`githubActionAdapter` exists at `src/adapters/github-action.ts`** implementing the `RunnerAdapter` interface from Brief 215 (`kind: 'github-action'`, `mode: 'cloud'`, `configSchema`, `execute()`, `status()`, `cancel()`, `healthCheck()`, `supportsCancel: true`, `webhookSubscriptions`). All methods type-check.

3. [ ] **Adapter registered in `runner-registry.ts`.** Integration test: dispatching a work item with `runner_override = 'github-action'` resolves to `githubActionAdapter` via `runner-registry.get('github-action')`.

4. [ ] **`stepRunId` guard rejects pre-DB-write.** Integration test calls `githubActionAdapter.execute({ stepRunId: undefined, … }, …)` and asserts (a) the call throws BEFORE any `runner_dispatches` row is written (DB-spy), (b) before any Octokit call (Octokit-mock-spy), (c) before the credential vault is read (credential-spy). `DITTO_TEST_MODE` bypass tested separately.

5. [ ] **Webhook payload Zod schema tightens the placeholder.** `packages/core/src/runner/webhook-schema.ts` `github-action` branch matches §D9 (no `payload: z.unknown()` wrapper; includes optional `workflowRunUrl` + `conclusion`). Validates required + optional fields; invalid payloads reject with Zod errors. Test fixtures cover happy path + 5+ error cases.

6. [ ] **`createWorkflowDispatch` is called with correct shape AND run-ID is captured.** Unit test: mocked Octokit returns `{ data: { id: 12345 } }`; `execute()` returns `DispatchResult` with `externalRunId: '12345'` and `externalUrl: 'https://github.com/<owner>/<repo>/actions/runs/12345'`. Encoded inputs include all required fields (`work_item_id`, `work_item_body`, `harness_type`, `stepRunId`) plus optional fields per the configured `callback_mode`. **Fallback test:** mock the response WITHOUT `id`; verify `listWorkflowRuns` is called as the fallback path; if neither yields an ID, dispatch marked `failed` with `errorReason = 'dispatch-run-id-unavailable'`.

7. [ ] **`cloud-runner-fallback.ts` routes `workflow_run` events.** Fixture-based integration tests covering all 9 conclusion-to-status mappings in §D9's table:
    - `requested` → `dispatched`
    - `in_progress` → `running`
    - `completed/success` → `succeeded`
    - `completed/failure` → `failed`
    - `completed/cancelled` → `cancelled`
    - `completed/timed_out` → `timed_out`
    - `completed/action_required` → `failed` with `errorReason = 'action_required'`
    - `completed/neutral` → `succeeded`
    - `completed/skipped` → `cancelled`
    - **`pull_request.opened`** matching dispatch's branch → `external_url` updated, "PR opened" inline card emitted with the github-action deep-link URL.
    - **`pull_request.closed.merged`** → `runner_dispatches.status = 'succeeded'` (verifies state machine allows direct `running → succeeded`).
    - **`deployment_status` non-production `success`** → "Vercel preview ready" inline card emitted (covers the cross-kind preview path).
    - **`check_run.completed`** routing infrastructure exists (semantic tests deferred to Brief 219).
    - The other two runner kinds (`claude-code-routine`, `claude-managed-agent`) continue to pass their existing fallback tests — verified by re-running 216 + 217's test suites.

8. [ ] **Polling cron walks `github-action` rows at 60s cadence.** Integration test: dispatches a work item via `githubActionAdapter.execute()` (mocked Octokit returns running); advances clock 60s; verifies `runner-poll-cron.ts` calls `githubActionAdapter.status()` once. Advances clock another 60s with mock now returning `completed/success`; verifies the next poll transitions `runner_dispatches.status = 'succeeded'` per §D9's table.

9. [ ] **Cancellation works.** Integration test: dispatches a work item; calls `githubActionAdapter.cancel(dispatchId, externalRunId)`; mocked `cancelWorkflowRun` returns success; the adapter returns `{ ok: true }`. A subsequent fixture `workflow_run.completed` with `conclusion: 'cancelled'` is fed to the fallback handler; `runner_dispatches.status` transitions to `cancelled`.

10. [ ] **Three callback modes work.**
    - `webhook-only` (default): no ephemeral token generated; `inputs.callback_url` is absent; the workflow has no callback; status comes only via `workflow_run` event. Verified by integration test.
    - `in-workflow-secret`: the workflow uses `secrets.DITTO_RUNNER_BEARER` (long-lived bearer); the adapter does not generate a per-dispatch token. Verified by integration test where the optional callback step posts to Ditto's status webhook with the project bearer; bearer-acceptance via the project hash. The plaintext bearer never appears in any DB query, application log, or workflow log other than the user-set repo secret.
    - `in-workflow`: the adapter generates a per-dispatch ephemeral token, includes it in `inputs.callback_url` query string; status webhook accepts the payload via the per-dispatch hash. Verified by integration test. **Plaintext-token-in-workflow-logs risk** documented (§D3); the test verifies the token plaintext does NOT appear in any DB column or application log.

11. [ ] **End-to-end smoke against agent-crm.** Manual smoke (executed by user once after merge): copy `dispatch-coding-work.yml` into agent-crm's `.github/workflows/`; configure a `github-action` runner on the agent-crm project (repo: `<owner>/agent-crm`, workflowFile: `dispatch-coding-work.yml`, defaultRef: `develop`, credential_service: `runner.agent-crm.github_token`, callback_mode: `webhook-only`); dispatch a real work item ("Add a /healthz endpoint to agent-crm app router"); verify (a) workflow run starts in agent-crm's Actions UI, (b) workflow checks out the repo and runs Claude Code with the work-item body, (c) PR opens via the shared GitHub-fallback handler, (d) `/dev-review` output appears as PR comment, (e) Vercel preview URL inline card appears in Ditto, (f) `workflow_run.completed/success` event transitions `runner_dispatches.status = 'succeeded'`, (g) human approves PR, (h) work item state reflects merge. **Mac mini may be powered off during this smoke** — verifies cloud-only path. Smoke also exercises the template workflow's primary-checkout path.

12. [ ] **Trust-tier behavior matches Brief 214 §D8.** Integration tests exercise all four tiers + sampling outcomes against `githubActionAdapter`. `supervised` queues until human approves; `spot_checked` sampled-in queues; sampled-out / `autonomous` sends immediately; `critical` rejected pre-dispatch.

13. [ ] **`/projects/[slug]/runners` admin enables `github-action` kind.** Brief 215 ships it disabled; this brief flips it enabled, ships the kind-specific config form (repo, workflowFile, defaultRef, credential_service selector with vault-keyed dropdown OR paste-new-PAT, callback_mode radio, "Verify with API" button, template-copy panel), validates against `githubActionAdapter.configSchema`, encrypts the PAT via credential vault on submit, persists `credential_service` reference (NOT plaintext). Mobile-first verified (375 × 667 viewport, no horizontal scroll, ≥44pt taps; the YAML template panel collapses to a "Show template" toggle). The "Copy template" button copies `docs/runner-templates/dispatch-coding-work.yml` contents to the clipboard.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Brief 215 substrate + Briefs 216 + 217 (siblings).
2. Reviewer specifically checks:
   (a) Engine-core boundary — only the Zod schema + cadence-map entry added to core; everything else product.
   (b) The `workflow_run` → `runner_dispatches.status` mapping table in §D9 is complete (all 9 conclusion values handled, no silent default cases).
   (c) The three callback modes are implemented honestly — the plaintext-in-workflow-logs risk is surfaced in admin UI helper text + the `webhook-only` default is the safest mode.
   (d) The `/dev-review` skill loading is honest for catalyst, native, and none harness types (D4: primary checkout for catalyst; release-asset URL for native; inline-fallback for both).
   (e) The kind-agnostic `cloud-runner-fallback.ts` extension is small (just adds the `workflow_run` switch + the per-kind deep-link branch); does not duplicate routine + managed-agent logic.
   (f) `supportsCancel: true` actually wires through to the dispatcher's cancel flow (Brief 215's dispatcher checks this flag before calling cancel).
   (g) The spike-test-first ordering is enforced.
   (h) The credential never appears in plaintext at rest in any code path.
   (i) Coordination with Briefs 216 + 217 (kind-agnostic file paths) is honoured — no duplicate kind-specific modules.
   (j) The brief is sized to one focused build session (Insight-004): 13 ACs is at the parent brief's target — flag if reviewer counts >17.
   (k) Brief 220 (deploy gate) coordination is explicit — `deployment_status` production-environment branch is NOT touched here.
   (l) Multi-repo flexibility (D12) is config-level not fan-out (per parent brief Non-Goal).
3. Present brief + review findings to human for approval.

## Smoke Test

Manual smoke after this brief merges:

```bash
# 1. Spike test (run first per Insight-180)
GITHUB_TOKEN=ghp_... \
  TEST_REPO_OWNER=<owner> \
  TEST_REPO_NAME=<test-repo> \
  TEST_WORKFLOW_FILE=dummy-dispatch.yml \
  pnpm vitest run src/engine/spike-tests/github-action-dispatch.spike.test.ts
# Expect: pass, real workflow run ID printed, run cancelled afterwards.

# 2. Copy template into agent-crm
# Navigate to /projects/agent-crm/runners; "Add runner" → github-action.
# Click "Copy template" — paste into agent-crm/.github/workflows/dispatch-coding-work.yml.
# Commit + push to develop. Wait for workflow to be picked up by GitHub.

# 3. Configure agent-crm runner via UI
# Repo: `<owner>/agent-crm`; workflowFile: `dispatch-coding-work.yml`; defaultRef: `develop`.
# credential_service: paste a GitHub PAT with actions:write + contents:read (or select existing vault entry).
# callback_mode: leave as 'webhook-only' (default).
# Click "Verify with API" — confirm last_health_status = "healthy".

# 4. Dispatch a real work item
# Capture work item: "Add a /healthz endpoint to agent-crm app router."
# Triage routes it to coding work; trust-tier supervised by default.
# Approve at /review/[token].
# Verify in /projects/agent-crm:
#   - "GitHub Actions workflow started" inline card with deep-link to actions/runs/<id>
#   - "Workflow running" updates as workflow_run.in_progress arrives
#   - "PR opened" card within ~10-30 min (depending on workflow's work)
#   - "/dev-review complete" card
#   - "Vercel preview ready" card with preview URL
#   - On workflow_run.completed/success: "Workflow succeeded"
# Tap PR URL on phone, approve PR.
# Verify work item state advances to merged.

# 5. Cancellation path
# Dispatch a long-running work item; immediately after dispatch, click "Cancel" in Ditto admin UI (or call cancelWorkflowRun via API directly).
# Verify: GitHub Actions UI shows "Cancelled" within 30 seconds.
# Verify: runner_dispatches.status transitions to 'cancelled' via the workflow_run.completed/cancelled webhook.

# 6. Failure path
# Edit dispatch-coding-work.yml in agent-crm to introduce a syntax error; commit + push.
# Re-dispatch. Verify: workflow fails; runner_dispatches.status = 'failed' with errorReason capturing the failure conclusion.
# Verify: workflow_run html_url stored in harness_decisions.reviewDetails.runner.workflowRunUrl.

# 7. In-workflow-secret callback mode
# Generate the project's runnerBearerHash plaintext via `PATCH /api/v1/projects/agent-crm { rotateBearer: true }`; copy the bearer.
# Add as a secret to agent-crm: Settings → Secrets → DITTO_RUNNER_BEARER = <bearer plaintext>.
# Edit the runner config; set callback_mode = 'in-workflow-secret'.
# Dispatch a work item.
# Verify: in addition to the workflow_run event, the workflow's optional callback step POSTs to Ditto's status webhook with `Authorization: Bearer <project bearer>`.
# Verify: bearer plaintext does not appear in workflow logs (GitHub auto-masks repo secrets).

# 8. In-workflow ephemeral mode
# Edit the runner config; set callback_mode = 'in-workflow'.
# Dispatch a work item.
# Verify: the workflow uses a per-dispatch ephemeral token via inputs.callback_url query string.
# Verify: status webhook accepts the callback via the per-dispatch hash.
# Verify: the ephemeral token may appear in workflow logs (GitHub does not auto-mask inputs); the user has been warned via admin UI helper text.

# 9. Mac-mini-off path
# Power off Mac mini. Repeat step 4. Verify dispatch completes end-to-end.

# 10. Brief 216 + 217 non-regression
pnpm vitest run src/adapters/claude-code-routine.test.ts
pnpm vitest run src/adapters/claude-managed-agent.test.ts
pnpm vitest run src/engine/runner-status-handlers/routine.test.ts
pnpm vitest run src/engine/runner-status-handlers/managed-agent.test.ts
pnpm vitest run src/engine/github-events/cloud-runner-fallback.test.ts
# All sibling-runner tests pass.
```

## After Completion

1. Update `docs/state.md` — Brief 218 transitions `complete`; with all four implemented runner kinds dispatchable, the parent brief 214 is ready for sub-briefs 219 (optional integrations), 220 (deploy gate), 221 (mobile UX), 222 (smoke).
2. Update parent brief 214 Status if all phase-level ACs gate through this brief — partial; 214 stays `ready` until phase-completion.
3. Update `docs/dictionary.md` per §What Changes (GitHub Action Runner, Workflow Dispatch, Workflow Run, Dispatch Inputs, Template Workflow File, Cloud-Runner Callback Mode).
4. Update `docs/landscape.md` GitHub Actions entry with "Adopted in Brief 218" footer; document the run-ID-since-2026-02-19 dependency + 60s polling cadence as known constraints.
5. Phase retrospective entry for Brief 218 (run by Documenter): what worked, what surprised about the GitHub Actions REST surface, what to change for sub-briefs 220 (deploy gate — should benefit from the same `workflow_run` + `deployment_status` routing infrastructure) and 221 (mobile UX).
6. **Future polish parking lot** (not closed by this brief; explicitly carried forward):
   - Log-content ingestion: download the run's log zip, extract last 4 KB of stderr-on-failure, store in `harness_decisions.reviewDetails.runner.logTail`. ~50 LOC + tests.
   - Auto-provision `DITTO_RUNNER_BEARER` repo secret via `octokit.actions.createOrUpdateRepoSecret` + RSA encryption per GitHub's secret-encryption requirement. Requires `secrets:write` scope grant. ~60 LOC + the encryption library (`tweetsodium` or `libsodium-wrappers`).
   - `repository_dispatch` (`event_type` + `client_payload`) alternative dispatch surface for org-wide / cross-repo triggers. ~30 LOC.
   - Reusable-workflows pattern (`uses: ditto-org/ditto/.github/workflows/dispatch-coding-work.yml@v1`) — would require Ditto to commit + maintain a public workflow repo, which adds a release surface. Re-evaluate if user adoption justifies.
7. No ADR needed — sub-brief implementing the parent brief's design.
