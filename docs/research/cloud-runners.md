# Research: Cloud Execution Runners — additive peers to local-bridge

**Date:** 2026-04-25
**Researcher:** Dev Researcher
**Consumers:** Dev Architect (companion brief to 212), Dev Builder, Dev PM
**Reference docs consulted:** `docs/research/local-bridge.md` (2026-04-25), `docs/briefs/212-workspace-local-bridge.md`, `docs/research/claude-managed-agents-architectural-review.md` (2026-04-09), `docs/research/runtime-deployment-models.md`, `docs/research/centralized-network-service-deployment.md`, `docs/research/external-integrations-architecture.md`, `docs/landscape.md`, `docs/architecture.md`, `docs/adrs/005-integration-architecture.md`, `src/engine/integration-registry.ts`, `src/adapters/cli.ts`
**User input:** `.context/attachments/pasted_text_2026-04-25_21-14-58.txt` (revision of `…21-11-19.txt`)
**Status:** Active
**Scope correction:** an earlier draft of this research treated cloud runners as replacing the local-mac-mini path. The user's revised input names cloud as **additive**: `local-mac-mini` (existing, Brief 212) + `claude-code-routine` + `claude-managed-agent` + `github-action` + `e2b-sandbox` (deferred) all coexist as peer runners selectable per-project, per-work-item, with a fallback chain.

---

## Research question

What can Ditto build *from* to support **four cloud-side execution runners** as peers to the existing local-bridge runner — `claude-code-routine` (Anthropic Routines), `claude-managed-agent` (Anthropic Managed Agents), `github-action` (GitHub workflow dispatch), and `e2b-sandbox` (deferred) — together with the cross-cutting cloud-side review/test/deploy substrate (Greptile, Argos, GitHub Mobile environment-approval gate) that the user's revised pipeline spec calls out?

The companion question (already covered in `local-bridge.md`): what does the local-mac-mini runner build from? That research is **not stale** — this report sits beside it at the same granularity, covering the cloud-side peers.

## Context

`docs/research/local-bridge.md` (2026-04-25) and Brief 212 specified the bridge daemon for cloud-Ditto → user-laptop dispatch (the local runner). Brief 212 deliberately deferred adapter-routing wiring (`src/engine/adapter-selection.ts`) because no `projects.runner` field exists today; the user's revised pipeline spec now introduces that field plus four cloud-mode peers plus a fallback chain plus per-work-item runner mode constraints (see `.context/attachments/pasted_text_2026-04-25_21-14-58.txt:31-41, 56-64`).

Five primitives are net-new on this trip:

1. The **runner registry** — five runner kinds, each with a `mode: 'local' | 'cloud'` discriminator.
2. The **dispatcher resolution rule** — `workItem.runner_override → project.runner_chain[0] → project.runner`, filtered by `workItem.runner_mode_required`, advancing on error/rate-limit per `attempt_index`.
3. The **status back-channel** — `POST /api/v1/work-items/:id/status` with `runner_kind` discriminator accepts payloads from all five runners.
4. The **review/test/deploy substrate** — Greptile (PR review), Argos (visual diffs), GitHub Environment + required-reviewer with GitHub Mobile push approval (deploy gate).
5. The **runner admin screen** — `/projects/[slug]/runners` to create, test, enable/disable each per-project runner; tied to the existing credential vault.

This report covers (1)-(4) at the building-blocks granularity; (5) is UX work for the Designer.

---

## Building blocks (factual, neutral)

### A) `claude-code-routine` — Anthropic Claude Code Routines

**Source:** Anthropic Claude Code docs ([code.claude.com/docs/en/routines](https://code.claude.com/docs/en/routines)) — research preview launched 2026-04-14. Available on Pro, Max, Team, Enterprise plans with Claude Code on the web enabled.

- **What it is:** A saved Claude Code configuration (prompt + repos + connectors + environment + triggers), executed on Anthropic-managed cloud infrastructure as a full Claude Code session. Routines are personal — they belong to the creator's claude.ai account; commits/PRs appear under that GitHub identity.
- **Trigger surface:** Three trigger types per routine, attachable in any combination — Schedule (cron-style, ≥1 hour minimum), API (HTTP POST with bearer token), GitHub (Claude GitHub App webhook on `pull_request.*` and `release.*` events).
- **API trigger contract:**
  - `POST https://api.anthropic.com/v1/claude_code/routines/{trigger_id}/fire`
  - Headers: `Authorization: Bearer sk-ant-oat01-…`, `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`, `Content-Type: application/json`.
  - Body: `{"text": "…"}` — single freeform string, **passed to the routine as literal text** alongside its saved prompt. JSON in the field is received as a string, not parsed.
  - Response 200: `{"type":"routine_fire","claude_code_session_id":"session_…","claude_code_session_url":"https://claude.ai/code/session_…"}` — synchronous; returns IDs, not results.
  - Token: shown once at creation; revoke/regenerate from the same UI; one token per routine; CLI cannot create or revoke tokens at preview.
- **Status back-channel:** No native completion webhook documented. Three mechanisms exist for downstream pickup:
  - Routine prompt itself can post to a Ditto webhook on completion (in-band — the routine's own work).
  - GitHub event subscription (workflow_run / pull_request) on the watched repo, since routines push commits and open PRs as the user.
  - Polling `claude_code_session_url` (no public session-status REST endpoint documented at preview).
- **Repository access:** Each routine selects one or more GitHub repos. Default branch-push policy restricts pushes to `claude/*` branches; `Allow unrestricted branch pushes` toggle removes the restriction per repo. Requires the Claude GitHub App installed on the repo for webhook events.
- **Environment:** Network access level + env vars + cached setup script per routine (a "cloud environment"). Supports MCP connectors; `CLAUDE.md` and `skills/` committed in the repo are read by the session.
- **Limits:** Per-account daily run cap (separate from token usage). Per-routine and per-account hourly caps on GitHub-trigger events. One-off scheduled runs are exempt from the daily cap. Schedule minimum is 1 hour.
- **Beta caveats:** The `/fire` endpoint is "claude.ai users only — not part of the Claude Platform API surface." Breaking changes ship behind dated beta headers; the two most recent header versions remain valid for migration.
- **Composition level:** **DEPEND** as a service (HTTP call from Ditto's dispatcher) — no SDK to vendor. **PATTERN** is not applicable here (it is the cloud Claude Code execution; we cannot re-implement it).
- **Fit:** Direct match for the user's "default cloud path for Claude Code work." One HTTP POST per dispatch; results funnel through GitHub PR events.
- **Don't fit:** Single-user (account-bound) — multi-user team-mode dispatch would require multiple routines, one per account. Synchronous response only returns IDs, not work; downstream signal must come from GitHub events or in-prompt webhook callback. No structured status endpoint at preview. Body limited to one `text` field — multi-field structured input must be encoded into the freeform string.

### B) `claude-managed-agent` — Anthropic Managed Agents

**Source:** Anthropic Claude API docs ([platform.claude.com/docs/en/managed-agents/overview](https://platform.claude.com/docs/en/managed-agents/overview), `…/sessions`, `…/events-and-streaming`) — beta launched April 2026. Already evaluated in `docs/research/claude-managed-agents-architectural-review.md` and landscape.md §"Managed Agent Infrastructure (2026-04-09)". This entry adds the runner-mode dispatch surface only.

- **What it is:** API-level managed-container agent runtime. Four primitives — Agent (versioned config), Environment (container template), Session (running instance), Events (typed bidirectional). Uses `x-api-key` (Anthropic API key), beta header `managed-agents-2026-04-01`. SDKs: Python, TypeScript, Go, Java, C#, Ruby, PHP.
- **Dispatch contract:**
  - `POST https://api.anthropic.com/v1/sessions` with body `{"agent": "<agent_id>", "environment_id": "<env_id>", "vault_ids": ["<vault_id>"]}` — returns `{"id": "<session_id>", "status": "idle", …}`.
  - `POST https://api.anthropic.com/v1/sessions/{id}/events` with body `{"events":[{"type":"user.message","content":[{"type":"text","text":"…"}]}]}` — kicks off work. The session is a state machine; events drive execution.
  - Pin to a version: `"agent": {"type":"agent","id":"<id>","version":1}` (otherwise latest).
- **Status back-channel:** Two paths.
  - **Streaming:** SSE endpoint streams typed events — `agent.message`, `agent.thinking`, `agent.tool_use`, `agent.tool_result`, `agent.mcp_tool_use`, `agent.mcp_tool_result`, `agent.custom_tool_use`, `agent.error`, plus `session.status` transitions. The user's spec selects polling for simplicity; both are first-class.
  - **Polling:** `GET /v1/sessions/{id}` returns `{ status: "idle" | "running" | "rescheduling" | "terminated", … }`. Idle = waiting for input; terminated = unrecoverable error. Idle containers checkpoint; checkpoints retained 30 days post-last-activity.
- **Steering:** `user.interrupt`, `user.tool_confirmation`, `user.custom_tool_result`, `user.define_outcome` events sent to a running session. No equivalent in the Routine API.
- **Lifecycle:** Sessions explicitly archive (preserve, no new events) or delete (purge container + events). Files, memory stores, environments, agents are independent — survive session deletion.
- **Tooling:** Built-in tools (bash, file ops, glob, grep, web search/fetch). Custom tools (client-executed, JSON schema, request/result via events). MCP servers (configured at agent or session level; OAuth via Anthropic vaults). Permission policy (`always_allow` / `always_ask` per tool — drives `user.tool_confirmation` events).
- **Composition level:** **DEPEND** via `@anthropic-ai/sdk` (TypeScript SDK already in the Ditto stack — used for `claude-api` adapter). The Managed Agents surface is the same SDK with the beta header set.
- **Fit:** Programmatic multi-step agent runs with finer control than Routines — interrupt/steer mid-flight, structured events, separate evaluator context for outcomes grading. Already classified PATTERN→DEPEND-eligible in landscape.md §"Managed Agent Infrastructure"; per-runner-config dispatch is a new application of that.
- **Don't fit:** Claude-only. Beta surface — change risk. Bash inside containers is open (loses Ditto's allowlist/scrub model unless the Ditto adapter pre-configures custom tools and disables bash). Cost model unclear at preview. Routines are simpler if all you want is "fire and forget" — Managed Agents earn their complexity when steering or grading is needed.

### C) `github-action` — GitHub Actions workflow dispatch

**Source:** GitHub REST docs ([docs.github.com/en/rest/actions/workflows](https://docs.github.com/en/rest/actions/workflows), `…/workflow-runs`) and Webhook docs.

- **Dispatch contract:**
  - `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` with body `{"ref": "<branch>", "inputs": { … typed inputs from workflow file `workflow_dispatch:` block … }}`. As of **2026-02-19**, this endpoint returns the new run's ID in the response (previously `204 No Content`, asynchronously processed). Auth: `Authorization: Bearer <token>` with `actions:write` scope on the target repo.
  - Alternative: `POST /repos/{owner}/{repo}/dispatches` with `{"event_type": "<custom>", "client_payload": { … }}` for `repository_dispatch` events; useful when the GitHub-app token doesn't have `workflow_dispatch` scope or the trigger is org-wide.
- **Status back-channel:** Three native paths.
  - `workflow_run` webhook event — fires at `requested`, `in_progress`, `completed`. Payload includes `workflow_run.id`, `status`, `conclusion`, `html_url`, `head_sha`, `pull_requests[]`. This is the event the user names for cloud-runner status.
  - `pull_request` webhook event — fires at `opened`, `synchronize`, `closed`, `labeled`, `review_requested`. Used to detect when a runner-opened PR is ready for review.
  - `check_run` / `check_suite` events — needed if the cloud runner produces check statuses (e.g., Playwright + Argos). Drives the "Ditto reads GitHub check status … gates ready-to-deploy when checks are green" rule.
- **Logs:** `GET /repos/{owner}/{repo}/actions/runs/{id}/logs` returns a `.zip` of per-job log files. `GET /repos/{owner}/{repo}/actions/runs/{id}` returns metadata. No long-poll; the webhooks are the realtime channel.
- **Cancellation:** `POST /repos/{owner}/{repo}/actions/runs/{id}/cancel`. Useful for `runner_chain` advance-on-timeout semantics.
- **Composition level:** **DEPEND** via `@octokit/rest` (already in landscape.md as the GitHub integration substrate).
- **Fit:** Long-running tasks (up to 6 h per job, 35 days per workflow), custom-env access via Actions secrets, native deploy gates via Environments + required reviewers. Cleanest path for "deploy-trigger" because Vercel/Netlify already consume Actions' OIDC.
- **Don't fit:** Each dispatch consumes Actions minutes (free for public repos; metered for private). 5-minute scheduling jitter on `schedule:` triggers (irrelevant for `workflow_dispatch`). Repository-scoped — cross-repo dispatch needs a token with multi-repo scope. Webhook-only status; if the Ditto webhook is unreachable at the moment of completion, the event is delivered up to N times then dropped (recovery = poll the run by ID).

### D) `e2b-sandbox` (deferred) — E2B Firecracker microVM with Claude Agent SDK

**Source:** [e2b.dev](https://e2b.dev), [e2b.dev/docs/template/examples/claude-code](https://e2b.dev/docs/template/examples/claude-code), [github.com/dzhng/claude-agent-server](https://github.com/dzhng/claude-agent-server).

- **What it is:** Firecracker-microVM-based sandbox. ~150 ms boot. Each microVM has its own kernel (true hardware isolation, not container shared-kernel). Template-driven (`Dockerfile`-like spec with `.fromNodeImage`, `.aptInstall`, `.npmInstall`); built once, reused per `Sandbox.create('<template-name>')` call. Resources (`cpuCount`, `memoryMB`) configurable per template.
- **Claude Agent SDK pattern:** Template installs `@anthropic-ai/claude-code@latest` globally; sandbox runs with `ANTHROPIC_API_KEY` injected as env var; `sandbox.commands.run('claude --dangerously-skip-permissions -p "<task>"', { onStdout, timeoutMs })` returns the captured result. `--output-format stream-json` produces JSONL events for richer parsing. Sessions resumable via `claude --resume <session_id>`. WebSocket-server pattern (`dzhng/claude-agent-server`) wraps the SDK for bidirectional streaming.
- **Lifecycle:** Sandboxes are per-call (`Sandbox.create` … `sandbox.kill()`). Snapshot/persistence for long-lived sessions: not surfaced in the public Claude Code template guide; consult E2B's "Agents in Sandbox" doc for production patterns.
- **Composition level:** **DEPEND** via `e2b` npm package. Custom template requires E2B account + template build step; Claude Code template is pre-shipped (`'claude-code'`).
- **Fit:** Bespoke tooling beyond what Routines/Managed Agents allow (custom packages, network-isolated, dedicated CPU). Fallback when Routines rate-limit. Boot time fast enough for per-job sandboxes.
- **Don't fit:** Pricing is per-minute compute — long-running agent sessions get expensive vs. Routines (subscription) or Managed Agents (token-based). Persistence/snapshot model less mature than Managed Agents. Public docs at the Claude Code page omit boot/persistence/pricing specifics — review of E2B's `/agents/claude-code` guide and pricing page needed before committing.
- **Status:** **DEFERRED per user input** — landscape entry to be added so a future architect can pick it up without re-research; not a blocker for the cloud-runners brief.

### E) Cross-cutting: Greptile (cloud PR review)

**Source:** [greptile.com](https://www.greptile.com), [greptile.com/docs/introduction](https://www.greptile.com/docs/introduction), [greptile.com/pricing](https://www.greptile.com/pricing).

- **What it is:** AI code-review SaaS. GitHub App installed per repo; reviews PRs by indexing the full repo as a code graph and tracing dependencies. Version 3 (late 2025) uses the Anthropic Claude Agent SDK for autonomous investigation.
- **Review delivery:** PR comments (summary + inline). Each inline comment includes a "Fix with your Agent" button that copies the issue to Claude Code/Cursor/Devin. "Fix All" summary button consolidates issues. **No documented label, check status, or webhook for review-complete signal** at the public docs surface — the user's spec assumes labels (`approved-by-greptile`); whether those exist or must be added by Ditto-owned automation reading PR comments is a Q for the Architect/PM.
- **Pricing:** $30 / active developer / month, 50 reviews per seat, $1 per additional. 14-day full trial. Enterprise custom-quoted.
- **Deployment:** SaaS (cloud, SOC2 Type II). Self-hosted via Docker Compose / Helm / air-gapped — relevant for Track B.
- **Composition level:** **DEPEND** as a service (GitHub App install + monthly per-seat) — no SDK to vendor. Ditto's interaction is via GitHub's PR-comment / PR-status surface.
- **Fit:** Cloud-side AI review that runs alongside the cloud runner's PR; mode-agnostic (works whether the PR was opened by `claude-code-routine` or by the local Mac mini).
- **Don't fit:** No native completion webhook documented; Ditto must read PR-state changes via the GitHub `pull_request_review` / `issue_comment` events (Greptile's findings appear as comments). Per-seat pricing scales with developer count, not with run count. Label automation (`approved-by-greptile`) is unverified — may require a Ditto-side rule that reads the latest Greptile comment and applies a label.

### F) Cross-cutting: Argos (visual diff)

**Source:** [argos-ci.com](https://argos-ci.com), [argos-ci.com/pricing](https://argos-ci.com/pricing), [argos-ci.com/blog/playwright](https://argos-ci.com/blog/playwright).

- **What it is:** Visual-regression SaaS. GitHub App installed per repo; receives screenshots from Playwright/Cypress/Storybook; reports diffs as a GitHub check (pass/fail) and posts a summary comment with links to side-by-side diff views.
- **Free tier (2026):** Hobby plan — **$0 forever**, up to 5,000 screenshots, GitHub & GitLab integration included. The user's spec is correct — the free tier is real, not a trial.
- **Paid:** Pro $100/mo, 35,000 screenshots included, $0.004 / screenshot overage, $0.0015 for Storybook. Slack notifications. GitHub SSO add-on $50/mo.
- **Wire:** Argos posts a GitHub status check (driven by the `argos-ci` GitHub App). PR webhook `check_run.completed` with `name: "argos-ci"` and `conclusion: "success" | "failure" | "neutral"` is the ready-to-deploy gate signal Ditto would consume.
- **Composition level:** **DEPEND** as a service. Test side: `@argos-ci/playwright` npm package (already in user's pipeline if they use Playwright).
- **Fit:** GitHub-native visual diffs with a real free tier; mode-agnostic. Argos's check status is the gate signal Ditto reads to advance from `review` to `ready-to-deploy`.
- **Don't fit:** Screenshots-per-month meter — high-frequency pipelines exhaust the free tier. Diff-review UI lives at Argos, not in Ditto — the mobile-first /review/[token] surface would link out, not embed.

### G) Cross-cutting: GitHub Environment + required-reviewer + GitHub Mobile

**Source:** [docs.github.com/en/actions/managing-workflow-runs/reviewing-deployments](https://docs.github.com/en/actions/managing-workflow-runs/reviewing-deployments), [GitHub changelog 2021-04-01 "Reviewing Deployments on GitHub Mobile"](https://github.blog/changelog/2021-04-01-reviewing-deployments-on-github-mobile/), [community discussion #110751](https://github.com/orgs/community/discussions/110751).

- **What it is:** Per-repo `Environments` (e.g., `production`) with `Required reviewers` (≤6 users/teams; one approval enough). A workflow job referencing `environment: production` pauses at that step until a reviewer approves. Push notifications fire on the GitHub Mobile app.
- **Status (2026):** Approving from inside the Mobile app **works** — the flow is: receive push notification → tap → opens deployment-review dialog → approve/reject. Confirmed by the official changelog. (A 2024 community thread reported approval-from-app missing, but that complaint pre-dates the rollout the changelog announces; current behavior matches the user's spec.)
- **Webhooks:** `deployment_status` event fires on each transition (`queued`, `in_progress`, `success`, `failure`, `error`). Ditto consumes `success` to close the work item and `failure` to surface a retry.
- **Composition level:** **DEPEND** — pure GitHub config + webhook subscription. No code to vendor.
- **Fit:** Mobile-first deploy gate the user named — push notification, single-tap approval, native to GitHub Mobile.
- **Don't fit:** Approval is GitHub-account-scoped — must be the same GitHub user the Ditto integration is attached to, or an explicit team. No way to enforce "Ditto must also see the approval" — the source of truth is GitHub; Ditto reads via `deployment_status` webhook (lossy if webhook delivery fails — recovery is polling the deployment by ID).

### H) Existing primitives Ditto already has — relevant to all four runners

Surveyed in the codebase, not new — but every cloud-runner brief depends on these:

- **Credential vault** — `src/engine/credential-vault.ts`, AES-256-GCM, used by every adapter today. Routine bearer, Anthropic API key, GitHub PAT, E2B key all land here.
- **Integration registry** — `src/engine/integration-registry.ts`, `integrations/00-schema.yaml`. The four runner configs in §1 of the user spec map cleanly to integration entries; per-project `runner_config` is the same shape as existing per-project integration config.
- **REST integration handler** — `src/engine/integration-handlers/rest.ts`, used by Brief 026 (REST process I/O). Calls Anthropic API / GitHub API are the same shape — bearer auth, JSON body, structured response. Adapters can compose this rather than re-implement HTTP.
- **CLI integration handler** — `src/engine/integration-handlers/cli.ts`. Used by `claude-api` adapter today. The local-mac-mini runner reuses this via the bridge daemon (Brief 212); cloud runners do not need it.
- **Adapter pattern** — `src/adapters/cli.ts:114-220` is the shape: `{ execute, status, cancel }`. Each new runner is an adapter that implements this triplet. The user's "Adapter pattern: pluggable, existing local adapter wrapped, new cloud adapters added as siblings" maps directly.

---

## Architecture-input observations (input to Architect, not decisions)

Researcher input only. The Architect can override any element. Alternatives surfaced inline.

**The "runner" is an adapter; the "runner_config" is integration-registry config.** Each of the five runner kinds is a `src/adapters/<kind>.ts` file implementing `{ execute, status, cancel }`. Per-project `runner_config` is one row in the integrations registry shape. This re-uses two primitives Ditto already has (adapter contract + integration registry) and avoids inventing a parallel orchestrator. The user's "Reuse existing Ditto primitives" constraint maps to this.

**Status back-channel: one endpoint, polymorphic body.** `POST /api/v1/work-items/:id/status` with a `runner_kind` discriminator on the payload, as the user named, lets each adapter own its own webhook-shape decoder. The Routine runner uses the in-prompt POST + GitHub events; Managed Agents uses the polling cron + (optionally) SSE; GitHub Actions uses `workflow_run` and `pull_request`; E2B (deferred) would use a webhook from a wrapper service. The single-endpoint pattern matches Brief 200's webhook-recovery shape.

**Fallback chain semantics need formal definition (Original to Ditto — see Gaps).** No surveyed project handles "advance to next runner on rate-limit/timeout" with a per-attempt audit row. The closest reference is Inngest's retry policy (per-step, not per-runner), and Trigger.dev's task-retry config — neither covers cross-runner-kind fallback. Ditto-original.

**Per-work-item `runner_mode_required` constraint is also Original to Ditto.** Use case: user is on phone, marks a work item `cloud`-required, dispatcher must refuse to pick `local-mac-mini`. No surveyed orchestration framework has a "soft constraint that filters the chain" primitive — closest is BullMQ priority queues (different concept).

**The Routine `text` body is one freeform string.** The user's "harness-agnostic — native-Ditto projects must work without filesystem brief" requirement is satisfiable by encoding the work-item body into the `text` field. Multi-field structured input (e.g., `acceptance_criteria`, `inputs`, `constraints`) needs a serialization convention — Ditto-original — that the routine prompt is also written to consume. Same shape as Brief 026's "process input via stdin" pattern.

**Greptile and Argos are GitHub-PR-state observers, not Ditto-controlled services.** Their signals reach Ditto via PR comments (Greptile) and check-status events (Argos). The user's `approved-by-greptile` label is **not native to Greptile** at the public docs surface — it would need a Ditto-side rule (e.g., a workflow that reads the latest Greptile comment, parses for "approved" or no remaining issues, applies the label). Architect/PM call: build that rule, or adopt a different termination signal.

---

## Gaps (Original to Ditto)

1. **Runner registry as first-class primitive.** No surveyed project offers a runner enum with a `mode: 'local' | 'cloud'` discriminator and a per-project + per-work-item override + ordered fallback chain. Closest patterns (Trigger.dev tasks, Temporal workflows, Inngest functions) treat the executor as fixed at registration. Ditto-original surface: `projects.runner`, `projects.runner_chain`, `workItems.runner_override`, `workItems.runner_mode_required`, `runs.runner_kind` + `runs.runner_mode` + `runs.attempt_index`.

2. **Fallback resolution algorithm.** "Primary errors → next in chain → audit row → notify on full failure" with `runner_mode_required` filtering applied at chain-resolution time, and "never auto-fail-over from cloud to local (or vice versa) if mode_required forbids." Needs a small state machine (similar to Brief 212's bridge-job state machine, but per-attempt). Ditto-original.

3. **Polymorphic status webhook with `runner_kind` discriminator.** Payload shapes differ per runner; the endpoint must validate against the runner-specific Zod schema and persist a normalized event row. Recovery semantics for missed webhook delivery (Routine in-prompt POST, GitHub `workflow_run`, Managed Agents polling) need a unified retry/poll fallback. Ditto-original.

4. **Per-project runner admin UI.** `/projects/[slug]/runners` — list configured runners, "Add runner of kind X," "Test dispatch" button, per-runner enable/disable, credential health indicator. Mobile-first per ADR-018. The shape mirrors Brief 200's Devices page from Brief 212 but at the project rather than workspace level. Ditto-original UX surface; uses existing credential-vault + integration-registry shapes underneath.

5. **`approved-by-greptile` label automation.** Greptile does not natively apply a per-PR label on review-complete; the user's spec depends on this label as one termination signal. A Ditto-owned GitHub Action (or Ditto webhook handler reading `issue_comment.created`) needs to detect "Greptile review with no findings" and apply the label. Ditto-original.

6. **Runner-pill UX surface.** "On `/projects/[slug]`, show a runner pill per work item (Local / Cloud / chain)" + "On `/review/[token]`, add a small 'Run on:' selector with chain pre-filled and 'force cloud for this approval' toggle." No surveyed product has this — they treat executor as invisible config. Designer's job; Ditto-original.

7. **`stepRunId` guard on every cloud dispatch (Insight-180).** Same gap called out for the bridge in Brief 212 — applies identically to every cloud runner. Each adapter's `execute()` must require a `stepRunId` and write a `harness_decisions` row. The `runs` table's `runner_kind` + `external_run_id` composite is the audit key.

8. **Mobile-first observability timeline.** The user's "capture → triage → approval → dispatch (with chosen runner + mode) → external job link → PR opened → reviews → checks → ready-to-deploy" is one row per state transition with one external-link affordance per transition that has one. The shape is Brief 212's bridge-job state machine extended to cover the cross-runner unified timeline. Ditto-original.

9. **Routine-trigger lifecycle vs. the runner_config bearer.** The user's `runner_config` for `claude-code-routine` carries `endpoint_url` + `bearer_credential_id`. Anthropic's docs say the bearer is shown once at trigger creation; revocation invalidates it. Ditto needs a "trigger health check" that detects 401s and surfaces a re-pair step (similar to OAuth refresh failures handled by ADR-031). Ditto-original.

10. **GitHub-Actions deploy-prod gate writes back to the work item.** The `deployment_status` webhook arrives at Ditto post-approval; the work item must transition `ready-to-deploy → deploying → deployed` (or `failed`). The state machine is small but new — current `workItems.status` doesn't have these states.

11. **Database migration planning (Insight-190).** Every schema field the user's spec adds — `projects.runner_chain` (JSON array), `projects.fallback_runner` (nullable string), `workItems.runner_override` (nullable string), `workItems.runner_mode_required` (nullable enum), and the `runs` table's new columns (`runner_kind`, `runner_mode`, `external_run_id`, `external_url`, `started_at`, `finished_at`, `status`, `error`, `attempt_index`) — needs a drizzle migration with idx parity in `_journal.json`. Architect must plan the migration (one or several) for the build-order estimation; Brief 212's `0011_local_bridge` is the next-pending idx so this set lands at idx ≥12 unless Brief 212 ships first.

## Alignment checks for the Architect (post-report)

These are not contradictions — they are reverify-points the Architect should hit before writing the cloud-runners brief:

- **`docs/architecture.md` Layer 2 (Agent).** This report treats each runner as an adapter implementing `{ execute, status, cancel }`. Confirm the architecture's adapter pattern still holds with five concrete runners (one local-bridge, four cloud) and a per-project + per-work-item dispatcher. If the architecture spec implies adapters are statically picked at registration, the dispatcher's runtime resolution rule (override → chain → default) is a refinement to spell out.
- **ADR-025 / Track A vs. Track B.** ADR-025 frames Ditto's Network deployment topology. The cloud-runners brief assumes Track A (Railway-hosted engine) dispatching to all four cloud runners while ALSO bridging to laptops via Brief 212. Confirm ADR-025 doesn't require the engine to share runtime substrate with the runners (e.g., a Track B self-hosted Ditto would presumably skip Routines/Managed Agents and use its own SDK calls — does the runner-registry shape need a Track-B-only pruning rule?).
- **ADR-005 (integration architecture).** Runners look a lot like integrations (per-project config + credentials in vault + dispatcher invokes). Architect must decide whether each runner is a special-case integration-registry entry (re-use schema), a sibling primitive (new table), or a true sub-class of integrations. The report names this as input but does not decide.

---

## Reference doc updates

**Adding to `docs/landscape.md`:**
- New section "Cloud Execution Runners (2026-04-25)" with entries for: Anthropic Claude Code Routines (DEPEND, service), Anthropic Managed Agents (cross-link existing entry — DEPEND-eligible), GitHub Actions workflow_dispatch (DEPEND via `@octokit/rest` — already in stack), E2B sandbox (DEPEND via `e2b`, deferred per user input).
- New section "Cloud Code Review + Visual Diff (2026-04-25)" with entries for: Greptile (DEPEND, GitHub App + per-seat), Argos (DEPEND, GitHub App + free tier).
- New section "Mobile-First Deploy Gate (2026-04-25)" with one entry: GitHub Environments + required reviewers + GitHub Mobile (DEPEND, configuration only).

**`docs/research/local-bridge.md` is not stale.** This report sits at the same granularity, covering the cloud peers. The two reports together cover the user's "additive cloud mode alongside local" requirement.

**`docs/research/runtime-deployment-models.md` is not stale.** It covers whole-engine deployment topology; this report covers per-step runner dispatch from a cloud-deployed engine. Different granularities.

**`docs/research/claude-managed-agents-architectural-review.md` is not stale.** This report adds the runner-mode dispatch surface as a new application of that primitive without revising the architectural review.

**`docs/research/external-integrations-architecture.md` is not stale.** Each runner is a special-case of the integration pattern; this report names that mapping but does not contradict the architecture.

**Adding row to `docs/research/README.md`:** `cloud-runners.md` — Five cloud-side execution runners as additive peers to the local-bridge runner. Routine HTTP trigger contract, Managed Agents session/event contract, GitHub workflow_dispatch + workflow_run, E2B Firecracker (deferred). Cross-cutting: Greptile (GitHub-App PR review), Argos (visual diff with real free tier), GitHub Environment + Mobile push approval (deploy gate). 8 building blocks, 10 Original-to-Ditto gaps. Companion to `local-bridge.md` at the same granularity. — Active.

## Status: ready for review

Review loop next; then handoff to Dev Architect to decide the runner-registry shape, write a companion brief to 212 (or replace it with a unified runner-distribution brief), and set decomposition order across the user's 8 listed sub-briefs.
