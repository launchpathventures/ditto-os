# Brief 220: Deploy Gate + GitHub Mobile (sub-brief of 214)

**Date:** 2026-04-27 (Reviewer-fix revision: 2026-04-27 — H1/H2/H3/H4 + 6 MEDIUM + 6 LOW all resolved; AC #4 split into individual ACs per L5 then aggregated to 15 to stay within Insight-004 8-17 band)
**Status:** complete (2026-04-28 — post-Builder + Reviewer-pass + Reviewer-fix second pass; 108 Brief 220 tests pass; full suite 2497 pass / 0 fail / 12 skip clean. M4 wired in second pass as state-machine validation at the status route — illegal transitions return 409 Conflict. AC #14 (E2E smoke against agent-crm) and AC #15 (mobile-first conversation-surface card rendering) deferred — both manual / sub-brief 221 territory.)
**Depends on:** Brief 215 (Projects + Runner Registry — substrate; provides `runner_dispatches` row that correlates a `deployment_status` event to a project + work item). Brief 216 (Routine Dispatcher — already merged; ships `cloud-runner-fallback.ts` which currently routes `deployment_status` non-production events to a Vercel-preview inline card and explicitly no-ops production events at line 584-586 with the comment "Brief 220 owns this surface"). Brief 218 (GitHub Actions Dispatcher — already merged; same fallback handler is the one this brief extends). Brief 223 (Projects Schema + CRUD — already merged; ships `briefState` enum + `POST /api/v1/work-items/:id/status` route that this brief extends with three new states + a webhook-driven internal transition path).
**Unlocks:** Phase 9+ end-to-end mobile-only smoke (Smoke A in parent brief 214 §"Smoke Test"). Brief 221 (Mobile UX) consumes the new `briefState` values for runner pill colour-coding + retry buttons. Brief 222 (E2E smoke tests) verifies all four runner kinds drive the deploy gate identically.
**Parent brief:** 214 (Cloud Execution Runners Phase)

## Goal

- **Roadmap phase:** Phase 9+ (deploy substrate — closes the cloud-runner pipeline at the production boundary).
- **Capabilities delivered:**
  - **`briefState` enum extended** with three production-deploy states: `deploying`, `deployed`, `deploy_failed`. State machine transitions: `shipped → deploying → deployed | deploy_failed`. `deploy_failed → deploying` retry permitted.
  - **`deployment_status` production branch wired** in the existing kind-agnostic `cloud-runner-fallback.ts` handler. Today the handler explicitly no-ops production events (line 584-586); this brief replaces that no-op with a per-state branch that drives `briefState` transitions and emits the corresponding inline card.
  - **One-tap GitHub Mobile approve inline card** emitted when `deployment_status.state === "queued"` AND environment matches the project's `deployTargetEnvironment`. The card uses the existing `ActionBlock` ContentBlock primitive with a single `external_link` action whose URL deep-links into GitHub's deployment-review screen on mobile (deep-link format: `https://github.com/<owner>/<repo>/actions/runs/<run_id>` — GitHub Mobile auto-detects deployment-review-pending and surfaces the approve dialog).
  - **Status route extension** at `POST /api/v1/work-items/:id/status` to accept the three new `briefState` values and bridge them to no `runner_dispatches` event (deploy is post-runner-completion; `runner_dispatches` already terminal at `succeeded` when deploy starts). The `briefStateToDispatchEvent()` mapper returns `null` for these states.
  - **Template `deploy-prod.yml` GitHub Actions workflow** shipped as docs at `docs/runner-templates/deploy-prod.yml` — copy-pasteable, references `environment: production` to engage GitHub's required-reviewer gate, runs `vercel deploy --prod` (or equivalent per the project's deploy target), reports success/failure naturally via GitHub's native `deployment_status` events. Companion runbook `docs/runner-templates/deploy-prod-setup.md` walks the user through GitHub Environment + required-reviewer + GitHub Mobile push-notification setup (one-time per repo).
  - **End-to-end smoke against agent-crm:** PR merged → `vercel deploy --prod` workflow queues → GitHub Mobile push to user → user taps approve → `deployment_status` events flow → work item transitions `shipped → deploying → deployed`. Mac mini powered off; entire flow phone-only.

## Context

Parent brief 214 §D12 ("Deploy-gate state machine") and §D13 ("Mobile UX") name this phase: `workItems.status` gains transitions `ready-to-deploy → deploying → deployed | deploy_failed`, driven by `deployment_status` webhook from GitHub, with one-tap mobile-approve in the conversation surface. That wording predates Brief 223's `briefState` enum split (Brief 223 partitioned project-flavored work items onto a separate state machine: `backlog | approved | active | review | shipped | blocked | archived`). The parent's `ready-to-deploy` is today's `shipped` (PR merged, work item terminal-on-the-Ditto-side); this brief extends `briefState` with the three production-deploy states cleanly slotted between `shipped` and the (already-present) `archived` terminal — Insight-043 (architect owns reference-doc accuracy) requires this reconciliation rather than chasing the parent's pre-Brief-223 wording verbatim.

Brief 216 §D5 + Brief 218 §D5 + the Vercel-preview inline-card path collectively shipped the `deployment_status` event subscription, the kind-agnostic dispatch-correlation lookup, and the per-project `deployTargetEnvironment` config field. The handler already inspects every `deployment_status` event's environment and explicitly returns `{ kind: "production-no-op", dispatchId: dispatch.id }` when the environment matches the project's production target — leaving the seam for this brief, by name, in the comment `// Production deploy: Brief 220 owns this surface; no card here.` (`src/engine/github-events/cloud-runner-fallback.ts:583`).

The user's primary success criterion for this phase is **phone-only end-to-end** (parent §Smoke A, lines 264-280): from intake on Railway URL through deploy approval in GitHub Mobile, no Mac required. GitHub Mobile already ships native push-notification + tap-to-approve for deployments awaiting required-reviewer approval (landscape entry at `docs/landscape.md:1051-1057`). Ditto's role is to (a) provide the copy-pasteable workflow template that engages GitHub's gate, (b) provide the runbook for the one-time GitHub-side setup, (c) drive the work-item state machine off the resulting `deployment_status` events, (d) surface a single inline card per state transition in the conversation surface — the GitHub-Mobile-deep-link card is the only new affordance.

## Objective

Ship the smallest production-shape deploy gate that closes the loop on the cloud-runner pipeline at the production boundary — three new `briefState` values driven by `deployment_status` webhook events, a copy-pasteable template + runbook for the GitHub-Environment-and-required-reviewer setup, and a one-tap mobile-approve inline card. End-state: a coding work item dispatched via any of the four cloud runner kinds AND merged to main automatically queues a production deploy, the user receives a GitHub Mobile push, taps approve, and Ditto's conversation surface tracks the deploy through to `deployed | deploy_failed` — Mac powered off throughout.

## Non-Goals

- **No auto-deploy.** Production deploys gated by GitHub Environment + required-reviewer (the user) approving in GitHub Mobile. The whole point of this brief is that approval is a deliberate human act on a phone — Ditto neither approves on the user's behalf nor short-circuits the gate.
- **No alternative deploy gate mechanisms** (Vercel deployment protection, Netlify-side review, custom approval UI in Ditto). GitHub Environment + required-reviewer is the gate; nothing parallel.
- **No deploy retry-on-failure automation.** When `deploy_failed` fires, Ditto surfaces the inline card with a "Retry deploy" affordance that deep-links to GitHub's re-run-jobs button. Auto-retrying production deploys is a future-brief concern (would need failure-classification + circuit-breaker; out of scope here).
- **No multi-environment promotion flow.** Deploy gate is single-target (the project's `deployTargetEnvironment`, defaulting to "Production" / "production"). Promotion through staging → canary → prod is a future-brief concern; the schema can extend later.
- **No deploy-status streaming** (live progress bar from `vercel deploy` stdout). The four lifecycle states (`queued`, `in_progress`, `success`, `failure`/`error`) drive four discrete inline cards. Streaming requires either the runner-side pushing intermediate events or Ditto polling Vercel's API — both deferred.
- **No automatic GitHub Environment provisioning.** Ditto cannot create the Environment + add required reviewers programmatically (would need GitHub-App-installation-with-`administration:write` scope, which most users won't grant). The runbook walks the user through the GitHub UI; the template workflow assumes the Environment exists.
- **No commit of `deploy-prod.yml` into user repos.** The template lives at `docs/runner-templates/deploy-prod.yml`; the admin UI surfaces a "Copy template" button (parent brief §D13 — coordination with sub-brief 221 mobile UX). This brief ships the template-as-docs only; the UI surface is sub-brief 221's responsibility.
- **No deploy gating on optional integrations** (Greptile, Argos). Those briefs are retired (parent §D11); the gate is GitHub Environment + required-reviewer only.
- **No `ready-to-deploy` as an explicit `briefState` value.** Parent §D12's wording predates Brief 223; today's `shipped` covers "PR merged, ready for deploy" semantics. Renaming `shipped → ready-to-deploy` would touch every briefState-consuming surface (Brief 223's status webhook, Brief 216-218's runner-status decoders, the conversation-stream consumer) for no semantic gain. `shipped` stays as-is.
- **No legacy-`workItemStatus` extension.** The legacy enum (`intake | routed | in_progress | waiting_human | completed | failed`) is partitioned by null `projectId`; deploy gate applies to project-flavored items only, which use `briefState`. No code touches `workItemStatusValues`.
- **No bearer rotation in this brief.** Brief 223 owns the `runnerBearerHash` rotation surface; the deploy-gate flow doesn't need its own bearer.
- **No conversation-surface ContentBlock invention.** Reuses existing `ActionBlock` for the GitHub-Mobile-deep-link card and `text` blocks for state-transition narration. No new block types.
- **No deploy-gate audit on `harness_decisions`.** The `deployment_status` webhook is server-driven (no `stepRunId` in the request — GitHub doesn't know about Ditto's process loop); the audit row is the existing `activities` insert with `action='work_item_status_update'` per Brief 223's pattern. Insight-180 bounded-waiver applies (`metadata.guardWaived = true`).
- **No deploy timeout reconciliation (Reviewer-fix M4).** A `deploying` state with no follow-up event sits in the work-item dashboard until manually archived OR until a future `deployment_status` event arrives. GitHub's webhooks may take minutes; vendor deploys may take longer. Building a cron-driven reconciliation against GitHub's deployments API (to detect "in_progress for >30min, poll the deployment, force-transition if vendor reports terminal") is a future-brief concern — would need a poller per project, rate-limit budget, and an interaction model for "we re-synthesised this state from a poll, not a webhook." Out of scope.
- **No multi-work-item correlation for a single deploy (Reviewer-fix M5).** When two work items merge to `main` in close succession (PR A then PR B within 30s), GitHub may dispatch one production deploy that includes both commits. The `findDispatchForRepo({ includeTerminal: true })` lookup returns the most-recently-created `runner_dispatches` row for that repo — so the deploy event correlates to the work item whose runner finished most recently. The earlier-merged work item still sees the deploy result reflected through the activity stream (which is repo-scoped), but only the most-recent transitions `briefState`. Many-to-many deploy↔work-item linking via commit-SHA correlation is a future-brief concern (would need a `deploy_commits` join table + commit-range parsing from the deployment payload). Documented as a behavior, not a bug.
- **No `deployed → blocked` arc.** Already named in §D1; restated here for non-goal-table grep-ability. Post-deploy issues that surface (rollback needed, prod alarm fired) become NEW work items, not regressions of the deployed work item's state.

## Inputs

1. `docs/briefs/214-cloud-execution-runners-phase.md` — parent; §D12 (deploy-gate state machine, originating spec) + §D13 (mobile UX) + §"Smoke A" (phone-only end-to-end) + §"Reference doc updates" (architecture-amendment draft) bind this brief.
2. `docs/briefs/complete/216-routine-dispatcher.md` — sibling brief; §D5 (Vercel preview URL inline card with the precise detection rule) is the predecessor of this brief's production-branch handler. The `deployment_status` event subscription registration pattern (§D4 webhook subscription model) is consumed verbatim.
3. `docs/briefs/complete/218-github-action-dispatcher.md` — sibling brief; §D6 (Vercel preview detection rule shared) + §D5 (kind-agnostic `cloud-runner-fallback.ts` extension pattern) are the patterns this brief follows.
4. `docs/briefs/complete/223-projects-schema-and-crud.md` — substrate; §"Status webhook" defines the `POST /api/v1/work-items/:id/status` route and `briefStateToDispatchEvent()` mapper that this brief extends.
5. `docs/research/cloud-runners.md` §"Mobile-First Deploy Gate" — research-side input; GitHub Environments + required-reviewer + GitHub Mobile push-notification flow is documented as a DEPEND classification.
6. `docs/landscape.md` §"Mobile-First Deploy Gate (2026-04-25)" (line 1051-1057) — landscape entry; classification DEPEND (pure GitHub config + webhook subscription, no code to vendor). The runbook this brief ships cross-references this entry.
7. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — server-driven webhook handlers honor the bounded-waiver pattern. The `deployment_status` handler writes activities rows with `metadata.guardWaived = true` because GitHub's webhook doesn't carry a `stepRunId`. Mirrors Brief 216 §D4 fallback-handler pattern.
8. `docs/insights/190-migration-journal-concurrency.md` — schema discipline; this brief reserves the next-free idx for the `briefState` enum extension.
9. `docs/insights/043-knowledge-maintenance-at-point-of-contact.md` — architect owns reference-doc accuracy; the parent brief's `ready-to-deploy → deploying → deployed | deploy_failed` wording is reconciled to today's `shipped → deploying → deployed | deploy_failed` (parent's `ready-to-deploy` ≡ today's `shipped`).
10. `src/engine/github-events/cloud-runner-fallback.ts:562-611` — the `handleDeploymentStatusEvent()` function this brief extends. Specifically lines 583-586 (the `production-no-op` outcome that this brief replaces with a per-state branch).
11. `packages/web/app/api/v1/work-items/[id]/status/route.ts:40-59` — the `briefStateToDispatchEvent()` mapper that this brief extends to recognize the three new states (returning `null` because deploy doesn't bridge to `runner_dispatches`).
12. `packages/core/src/db/schema.ts:165-174` — `briefStateValues` enum that this brief extends.
13. `packages/core/src/work-items/brief-types.ts` — `BriefState` type re-export; the type widens automatically from the schema extension.
14. `packages/core/src/content-blocks.ts:66-70` — `ActionBlock` discriminated-union variant; the GitHub-Mobile-deep-link card uses this primitive verbatim, no invention.
15. `drizzle/meta/_journal.json` — at design time the last entry was idx=16 (`0016_broad_onslaught`). **Build-time outcome (2026-04-28):** verified at `drizzle/0013_workitems_brief_extension.sql:34` that the `briefState` column is plain `text` with NO enum CHECK constraint (Brief 223 enforces via Zod app-validation only). Widening the TS `briefStateValues` array therefore produces no DB schema change; `drizzle-kit generate` correctly outputs "No schema changes." **No migration shipped; idx-17 reservation released.** Future briefs that need an enum constraint at the DB level can claim the next free idx.
16. `docs/dictionary.md:881-883` — existing "Deploy Target" entry; this brief adds "Deploy Gate", "Deploying State", "Deployed State", "Deploy Failed State", "Deploy-Prod Workflow Template", "GitHub Environment", "Required Reviewer".
17. GitHub docs — [docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment](https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment) — Environment + required-reviewer setup contract.
18. GitHub docs — [docs.github.com/en/webhooks/webhook-events-and-payloads#deployment_status](https://docs.github.com/en/webhooks/webhook-events-and-payloads#deployment_status) — `deployment_status` event payload shape (`state: queued | in_progress | success | failure | error`).

## Architectural Decisions

**D1: Three new `briefState` values, with out-of-order-tolerant transitions.** Extends `briefStateValues` (`packages/core/src/db/schema.ts:165-174`) with `deploying`, `deployed`, `deploy_failed`. Allowed transitions (Reviewer-fix H3 + H4 — direct `shipped → deployed`/`deploy_failed` admitted to handle out-of-order webhook delivery; `shipped → archived` admitted for non-deploy-gated projects):

- `shipped → deploying` (deployment_status `queued` or `in_progress` for production env — happy path)
- `shipped → deployed` (deployment_status `success` arrives BEFORE `queued`/`in_progress` — out-of-order webhook delivery; the intermediate `deploying` is informational, not load-bearing)
- `shipped → deploy_failed` (deployment_status `failure`/`error` arrives BEFORE `queued`/`in_progress` — same out-of-order tolerance)
- `shipped → archived` (NEW — projects without a production-deploy environment OR users who close a work item without deploying; without this, non-deploy-gated projects are stranded forever in `shipped`)
- `deploying → deployed` (deployment_status `success` for production env)
- `deploying → deploy_failed` (deployment_status `failure` or `error` for production env)
- `deploy_failed → deploying` (retry — the user re-runs the failed workflow run; GitHub fires `queued` again)
- `deploy_failed → deployed` (retry succeeded; out-of-order admitted here too — `success` may arrive before the retry's `queued`)
- `deployed → archived` (existing semantics; user closes the work item)
- `deploy_failed → archived` (user gives up on the deploy)

`deploying`, `deployed`, `deploy_failed` are NOT terminal in the same sense `archived` is — `deployed` is "happy-path terminal" (user closes the work item naturally via archive or leaves it visible in dashboards), `deploy_failed` is "recoverable terminal." Brief 221 (Mobile UX) surfaces a "Retry deploy" CTA on `deploy_failed` items that deep-links to GitHub's re-run-jobs UI.

**No retreat from `deployed → shipped`, no `deployed → deploying`, no `deployed → blocked`** — once production is updated, the work item stays past the deploy boundary. If the user reverts the deploy through GitHub, that's a new work item. Post-deploy issues that need attention are surfaced as new work items, not as a regression of the deployed work item's state. (Reviewer-fix M1 — explicit non-arc.)

**Why out-of-order `shipped → deployed` (vs. forcing two transitions):** GitHub does not guarantee webhook ordering; replays, retry storms, and slow delivery can place `success` before `queued`. Forcing the handler to write a synthetic `deploying` row to "make the math work" would falsify the audit trail. The honest shape: `deploying` is an informational pass-through, not a required intermediate. The activity log preserves the actual sequence of `deployment_status` events for forensic reconstruction.

**D2: `deployment_status` production branch in `cloud-runner-fallback.ts`.** Replaces the existing `production-no-op` outcome (line 583-586) with a per-state switch driven by `event.deployment_status.state`. Maps:

| `deployment_status.state` | Action | `briefState` transition (if applicable) | Inline card emitted |
|---------------------------|--------|----------------------------------------|---------------------|
| `queued` | Emit "Deploy approval pending" card with GitHub-Mobile deep-link `ActionBlock` | `shipped → deploying` | YES — `deploy_approval_pending` |
| `in_progress` | Emit "Deploying to production" card (no action affordance — already approved) | `shipped → deploying` (idempotent if already there) | YES — `deploy_in_progress` |
| `success` | Emit "Deployed to production" card with prod URL link | `deploying → deployed` | YES — `deployed` |
| `failure` | Emit "Deploy failed" card with retry-link `ActionBlock` | `deploying → deploy_failed` | YES — `deploy_failed` |
| `error` | Same as `failure` (GitHub's `error` is "infrastructure failed before deploy ran"; surfaced identically to user) | `deploying → deploy_failed` | YES — `deploy_failed` |
| `pending` | No-op (transient pre-`queued` state in some webhook orderings) | none | none |
| `inactive` | No-op (rolling-deploy supersession; not a deploy lifecycle event) | none | none |

The handler runs idempotently: if the current `briefState` is already at-or-past the target, the transition is a no-op (state machine rejects illegal transitions per Brief 215 `transition()` precedent — the activity row records the rejected transition with `metadata.transitionRejected = true` so a forensic auditor can trace late events).

The `production-no-op` `FallbackOutcome` variant is removed and replaced with five new variants: `deploy-approval-pending`, `deploy-in-progress`, `deployed`, `deploy-failed`, `deploy-state-no-op` (the `pending`/`inactive` and idempotent-already-there cases).

**D2.1: `DeploymentStatusEvent` typed shape needs widening (Reviewer-fix H1).** Today's narrow shape (`cloud-runner-fallback.ts:104-114`) types `deployment` as `{ ref: string }` only. This brief widens it to:

```ts
deployment: {
  ref: string;
  id?: number;                  // GitHub deployment id (always present in real payloads)
  workflow_run_id?: number | null;  // present when the deployment was created by a workflow_dispatch-driven deploy
}
```

Reference for field shape: [docs.github.com/en/webhooks/webhook-events-and-payloads#deployment_status](https://docs.github.com/en/webhooks/webhook-events-and-payloads#deployment_status). The `workflow_run_id` field is the load-bearing input to D3's deep-link URL; the graceful-degradation fallback (D3) covers the null/undefined case explicitly.

**D2.2: Lookup must include terminal dispatches (Reviewer-fix H2).** Today's `findActiveDispatchForRepo()` (`cloud-runner-fallback.ts:720-723`) filters to non-terminal rows (`dispatched | running` only). By the time a production `deployment_status` event arrives, the corresponding `runner_dispatches` row is already `succeeded` (the runner that produced the merged PR has finished). The deploy-gate handler MUST use `findDispatchForRepo(dbImpl, repo, { includeTerminal: true })` to correlate the deploy event to the right work item — otherwise every production deploy event silently drops with `no-match`. The `includeTerminal: true` option already exists in `FindDispatchOptions` (used by Brief 216 §D4's late-callback warning path); this brief's production branch wires it into the production-deploy lookup. **The non-production (Vercel preview) branch is unchanged** — preview events arrive while the dispatch is still active, so the existing default lookup is correct there.

**D3: GitHub-Mobile deep-link `ActionBlock` for one-tap approve.** When `deployment_status.state === "queued"` for the production env, the activity row's metadata includes a `mobileApproveAction` payload that the conversation-surface consumer renders as an `ActionBlock` (existing primitive, `packages/core/src/content-blocks.ts:66-70`):

```ts
{
  type: "actions",
  actions: [
    {
      label: "Approve deploy in GitHub Mobile",
      style: "primary",
      payload: {
        kind: "external_link",
        url: "https://github.com/<owner>/<repo>/actions/runs/<run_id>",
      },
    },
  ],
}
```

The deep-link URL format is the standard GitHub Actions run page (`/actions/runs/<run_id>`). GitHub Mobile, when given this URL on a phone with the GitHub app installed, auto-detects deployments-awaiting-review on that run and surfaces the approval dialog directly. The fallback (no GitHub Mobile installed) is the standard mobile-web Actions page which still surfaces the Review button — both paths converge to the same approve UI on the phone.

**The deployment-review-pending pseudo-deep-link** (`/deployments/<deployment_id>/reviews`) is NOT a public GitHub URL — GitHub treats deployment reviews as a property of the workflow run, not a standalone resource. The `/actions/runs/<run_id>` URL is the canonical entry point and works on every GitHub-Mobile-or-mobile-web combination. Documented as a constraint so a future refactor doesn't try to "fix" the URL to a more specific path that doesn't exist.

The `run_id` is sourced from the `deployment_status.deployment` payload via the `deployment.workflow_run_id` field when present (GitHub adds this when the deployment was created by a `workflow_dispatch`-driven deploy). When absent (e.g., legacy deployments not driven by Actions), the inline card falls back to a non-deep-link URL pointing to the project's repo `/deployments` page — explicit graceful degradation rather than emitting a broken deep-link. Brief 220 documents in the runbook that the `deploy-prod.yml` template uses `workflow_dispatch` (or a tag-push trigger that GitHub still associates with a workflow_run), guaranteeing `workflow_run_id` is present in the production smoke path.

**Degradation when GitHub Mobile is not installed (Reviewer-fix M2):** the deep-link URL `https://github.com/<owner>/<repo>/actions/runs/<run_id>` works in three modes: (a) GitHub Mobile installed + push enabled — push notification arrives, tapping opens the in-app approve dialog (one-tap UX); (b) GitHub Mobile installed + push disabled — no push, but tapping the inline card in Ditto opens the in-app approve dialog (two-tap UX); (c) GitHub Mobile not installed — tapping opens the GitHub mobile-web actions page in Safari/Chrome, which surfaces a "Review pending deployments" button (three-tap UX: tap card → tap Review button → tap Approve). The runbook (`deploy-prod-setup.md`) addresses GitHub Mobile installation + push enablement as Step 5 explicitly; the inline card works without it. There is no Ditto-side feature-detect for GitHub Mobile presence — the deep-link is universal; modes (a)–(c) are user-environment-determined.

**Forensic correlation breadcrumb (Reviewer-fix L4):** the activity row's metadata includes `workflowRunId: deployment.workflow_run_id ?? null` and `deploymentId: deployment.id ?? null` for forensic correlation back to GitHub's run/deployment URLs. These are the closest equivalents to a synthetic `stepRunId` (per Insight-180 bounded-waiver — D7) for webhook-driven transitions; they do not satisfy the `stepRunId` guard, but they preserve the audit trail.

**D4: `briefStateToDispatchEvent()` extension returns `null` for the three new states.** Deploy is post-runner-completion; `runner_dispatches` is already terminal at `succeeded` when production deploy starts. The status webhook accepts the new states (no Zod-rejection) but doesn't bridge them to a runner-dispatch event. The activity row records the state transition; that's the audit.

**Forward-compatibility note:** if a future brief adds a separate "deploy_dispatches" lifecycle with its own state machine, the extension point is `briefStateToDispatchEvent()` returning a new event into a new dispatcher — this brief preserves the seam without committing to it.

**D5: Webhook subscription registration is unchanged.** The existing GitHub webhook receiver (`packages/web/app/api/v1/integrations/github/webhook/route.ts`) already subscribes to `deployment_status`. The kind-agnostic `cloud-runner-fallback.ts:handleDeploymentStatusEvent()` already routes the event by repo. This brief only extends the per-state branch inside that handler. **No new webhook subscription, no new endpoint, no new auth surface.**

**D6: Engine-core boundary.** The `briefStateValues` extension lives in `packages/core/src/db/schema.ts` (engine-core). The state-machine transition table for `briefState` is documented in `packages/core/src/work-items/state-machine.ts` (NEW pure module, engine-core — could ProcessOS use this? Yes, generic state-transition validation). Everything else is product layer: the `cloud-runner-fallback.ts` extension, the inline-card `ActionBlock` payload composition, the route extension, the template YAML + runbook docs.

**D7: Insight-180 bounded waiver — `deployment_status` webhook has no `stepRunId`.** GitHub's webhook delivers payload+signature only; no Ditto context. The handler writes the activity row with `metadata.guardWaived = true`, mirroring Brief 223's status-route waiver pattern (`packages/web/app/api/v1/work-items/[id]/status/route.ts:196-281`). The activity's `actorType` is `"github-webhook"` and `actorId` is `"deployment_status"` so a forensic audit can grep the bypass class. **Side-effecting-function guard remains in force everywhere a `stepRunId` IS available** — this brief introduces no new guard-violations.

**D8: Per-project `deployTargetEnvironment` field already exists.** Brief 216 §D5 introduced the field on `projects` (defaulting to "Production"). This brief reads it via the same `deployTargetFor()` accessor in `FallbackOptions` (`cloud-runner-fallback.ts:142-149`). For projects that customize the env name (e.g., `"prod"` lower-case for a Netlify-flavored config), the production branch matches accordingly. **No schema change to `projects` for this brief.**

**D9: Template `deploy-prod.yml` shipped as docs.** Lives at `docs/runner-templates/deploy-prod.yml` (consistent with Brief 218's `docs/runner-templates/dispatch-coding-work.yml` precedent). Companion runbook `docs/runner-templates/deploy-prod-setup.md` covers:
- Creating a GitHub Environment named `production` (or matching `project.deployTargetEnvironment`)
- Adding the user as a Required Reviewer (≤6 max per GitHub policy; one approval suffices)
- Pasting the workflow template into `.github/workflows/`
- Setting required secrets (`VERCEL_TOKEN`, etc. — vendor-specific)
- Verifying GitHub Mobile is installed + push notifications enabled
- The first-deploy smoke-test sequence (push to main → Actions tab → see the deploy-prod run waiting → tap notification on phone → approve → watch deploy → see "Deployed to production" card in Ditto)

The template is vendor-agnostic at the workflow level (`environment: production` + a single deploy step) with vendor-specific deploy commands documented as commented-out alternatives (Vercel default; Netlify, Cloudflare Pages, Fly.io as comments). The runbook calls out the user replacing the default deploy step with their vendor's command — Ditto does not own that choice.

**D10: Deploy state filtering is per-environment, not per-deploy-target-vendor.** The handler doesn't care whether the deploy goes to Vercel, Netlify, Fly, etc. — the GitHub `deployment_status` event is vendor-agnostic. The match is environment-name only (per the `deployTargetFor()` lookup). The `deployTarget` field (`projects.deployTarget: vercel | fly | manual`, dictionary entry line 881) is metadata for the runbook ("which deploy command should I show in the template?") — NOT a runtime gate. Documented to prevent a future architect from over-coupling.

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | **Modify** — extend `briefStateValues` with `"deploying"`, `"deployed"`, `"deploy_failed"`. Single-line tuple addition. |
| `packages/core/src/work-items/state-machine.ts` | **Create** — pure module exporting `BRIEF_STATE_TRANSITIONS: Record<BriefState, BriefState[]>` (allowed targets) and `transitionBriefState(from, to): { ok: true; to } | { ok: false; reason: string }` for validation. Documents the deploy-gate arc + retry path. ~80 LOC. |
| `packages/core/src/work-items/state-machine.test.ts` | **Create** — exhaustive transition matrix tests; verifies `shipped → deploying`, `deploying → deployed`, `deploying → deploy_failed`, `deploy_failed → deploying` retry, `deployed → archived`, illegal transitions rejected (`deployed → shipped`, `deployed → deploying`, `archived → anything`). |
| `packages/core/src/work-items/index.ts` | **Modify** — re-export `transitionBriefState` + `BRIEF_STATE_TRANSITIONS`. |
| `drizzle/0017_briefstate_deploy_states.sql` | **Generated** by `drizzle-kit generate` — extends the Drizzle-mirrored briefState enum (a TS-only enum on the SQLite side; the actual DB column is text + CHECK-constraint or text-with-app-validation per Brief 223's pattern). Verify Brief 223's enforcement mechanism and update accordingly. **If Brief 223 used a runtime CHECK constraint:** this migration ALTERs the constraint to include the three new values. **If Brief 223 used app-validation only:** the migration is no-op and the schema-side enum widening is sufficient. |
| `drizzle/meta/_journal.json` | **Modify (generated)** — new entry idx=17 per Insight-190. |
| `drizzle/meta/0017_snapshot.json` | **Generated.** |
| `src/engine/github-events/cloud-runner-fallback.ts` | **Modify** — (a) widen `DeploymentStatusEvent.deployment` typed shape per D2.1 (add `id?: number`, `workflow_run_id?: number | null`); (b) replace lines 583-586 (`production-no-op` outcome) with the per-state branch per D2; (c) production branch calls `findDispatchForRepo(dbImpl, repo, { includeTerminal: true })` per D2.2 (Reviewer-fix H2); (d) add five new `FallbackOutcome` variants (`deploy-approval-pending`, `deploy-in-progress`, `deployed`, `deploy-failed`, `deploy-state-no-op`); (e) read `deployment_status.state` + `deployment.workflow_run_id` + `deployment.id` + `deployment_status.environment_url` for the deep-link + prod-URL surfaces; (f) call `transitionBriefState()` before writing the activity row; if illegal, write the activity with `metadata.transitionRejected = true` and skip the briefState update; (g) sanitise `repo.full_name` against `^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$` regex before constructing the deep-link URL (Reviewer-fix L6 — defensive even though the source is HMAC-verified). ~150 LOC added. |
| `src/engine/github-events/cloud-runner-fallback.test.ts` | **Modify** — add fixture-based tests covering all five new outcomes plus idempotency (`deployment_status.queued` arriving twice → second is `deploy-state-no-op`), plus illegal-transition rejection (`deployment_status.success` arriving when briefState is already `deployed` → no-op + activity audit). |
| `packages/web/app/api/v1/work-items/[id]/status/route.ts` | **Modify** — extend `briefStateToDispatchEvent()` with cases for `deploying`, `deployed`, `deploy_failed` (all return `null` per D4). The route accepts these states from the runner webhook (e.g., when a runner adapter wants to drive the state directly without going through the `deployment_status` webhook — currently no runner does this, but the route's Zod schema must accept the values for forward-compatibility). |
| `packages/web/app/api/v1/work-items/[id]/status/route.test.ts` | **Modify** — add tests verifying the three new states are accepted by the schema, validated by `transitionBriefState()`, persisted to `work_items.briefState`. |
| `docs/runner-templates/deploy-prod.yml` | **Create** — copy-pasteable production-deploy GitHub Actions workflow with `environment: production`, vendor-agnostic deploy step, commented vendor-specific alternatives. ~60 lines YAML. |
| `docs/runner-templates/deploy-prod-setup.md` | **Create** — runbook covering GitHub Environment creation, required-reviewer addition, secret setup, GitHub Mobile push-notification enablement, first-deploy smoke. ~150 lines markdown. |
| `docs/dictionary.md` | **Modify** — add entries: Deploy Gate, Deploying State, Deployed State, Deploy Failed State, Deploy-Prod Workflow Template, GitHub Environment, Required Reviewer. |
| `docs/architecture.md` | **Modify** — append one paragraph to §L3 (Harness) per parent brief 214 §"Reference doc updates" — final wording confirmed at phase-completion (sub-brief 222 merge), but this brief drafts the deploy-gate paragraph since it's the brief that owns the substrate. |

## Constraints

- **Engine-first per CLAUDE.md.** `briefStateValues` extension + `transitionBriefState()` go to `packages/core/`. Webhook handler logic, route extension, template docs, dictionary entries are product layer. Test: could ProcessOS use `transitionBriefState()`? Yes — generic state-transition validation, no Ditto-specific concepts.

- **No Ditto opinions in core.** `transitionBriefState()` operates on the `BriefState` enum only — no references to runners, projects, work items, conversation surfaces, or webhooks.

- **DB injection (CLAUDE.md core rule 5).** `transitionBriefState()` is a pure function — no database connection, no IO. Callers (the route handler + the fallback handler) inject the DB at the boundary.

- **Side-effecting function guard (Insight-180) — bounded waiver applies.** The `deployment_status` webhook handler runs server-side without a `stepRunId` (GitHub's webhook doesn't carry one). The activity row records `metadata.guardWaived = true` per the established pattern. **No new function with explicit external side effects requires a `stepRunId` parameter in this brief** — the route extension's net change is enum-widening + state-machine validation, not a new dispatch surface. (`runner_dispatches` is already terminal at this point in the lifecycle; deploy is post-runner.)

- **`activities` is the audit destination.** Every state transition (or rejected transition, or no-op) writes an activity row. Mirrors Brief 223's pattern. No new audit table.

- **Schema migration discipline (Insight-190).** Build-time outcome: no migration needed — `briefState` is plain `text` with no DB-level enum CHECK constraint (Brief 223 enforces via Zod app-validation). Widening the TS `briefStateValues` array is sufficient. Idx-17 reservation released; the next brief that needs a migration can claim the next free idx.

- **Reuse existing primitives.** `cloud-runner-fallback.ts` (Brief 216), `deployment_status` event subscription (Brief 216 §D4), `deployTargetFor()` accessor (Brief 216 §D5), `ActionBlock` ContentBlock primitive (existing), activity-row audit pattern (Brief 223). Do not invent parallel substrates.

- **Mobile-first per ADR-018 §UX-Constraint-Mapping.** The deploy-approval-pending inline card MUST work on a phone — touch target ≥44pt, no horizontal scroll on long URLs (truncate with ellipsis), action button-as-link (not modal — the deep-link opens GitHub Mobile or mobile-web directly).

- **No deploy gate bypass in tests.** Integration tests for the production branch must use real `deployment_status` event fixtures. Mocking the gate doesn't validate the production code path. Brief 222's smoke covers the user-acted approval; this brief's tests cover everything except the human-tap step.

- **Template-as-docs only.** `deploy-prod.yml` does NOT install itself in user repos. The user copies it manually; the admin UI surface (sub-brief 221) shows it with a "Copy template" button. Ditto does not commit to user-repo `.github/workflows/`.

- **No retry-loop in the handler.** A `deploy_failed` event triggers ONE inline card with a retry-deep-link. The user clicks retry in GitHub; GitHub fires a new `deployment_status: queued`; the handler transitions `deploy_failed → deploying`. There is no Ditto-side automatic retry — the loop is human-driven by design.

- **`deployment_status.state` is GitHub-canonical.** Do not invent intermediate states. The five `state` values GitHub emits (`pending | queued | in_progress | success | failure | error`) plus `inactive` cover the lifecycle; the handler maps explicitly.

- **Output cap discipline.** The activity-row metadata caps `prodUrl` at 2 KB (URL_CAP precedent from `cloud-runner-fallback.ts:139`). The `error` field caps at 4 KB.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| `deployment_status` webhook event shape | `docs.github.com/en/webhooks/webhook-events-and-payloads#deployment_status` | depend (service) | Canonical GitHub-side event contract; the handler decodes the payload directly. |
| GitHub Environment + required-reviewer + GitHub Mobile push | `docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment` + `github.blog/changelog/2021-04-01-mobile-deployment-reviews` | depend (configuration) | Pure GitHub config, no code to vendor. The user sets up via the GitHub UI; Ditto observes via webhook. |
| `cloud-runner-fallback.ts:handleDeploymentStatusEvent()` extension point | `src/engine/github-events/cloud-runner-fallback.ts:562-611` (Brief 216 §D4 + 218 §D5) | depend (sibling brief) | The seam already exists with the `production-no-op` outcome explicitly named for this brief. |
| `briefState` enum + status webhook route | `docs/briefs/complete/223-projects-schema-and-crud.md` | depend (sibling brief) | Brief 223's `briefState` is the state machine this brief extends. |
| `transitionBriefState()` pure-function pattern | `packages/core/src/runner/state-machine.ts` (Brief 215) | pattern (project-internal) | Same shape as runner-dispatch state machine — pure module, validation-only, returns `{ ok, to } \| { ok: false, reason }`. |
| `ActionBlock` for one-tap approve card | `packages/core/src/content-blocks.ts:66-70` (existing) | depend (existing) | Reuses the existing primitive; no new ContentBlock invented. |
| `deployTargetFor()` accessor for per-project env name | `src/engine/github-events/cloud-runner-fallback.ts:142-149` (Brief 216 §D5) | depend (sibling brief) | Already shipped; this brief consumes it for the production-env match. |
| `briefStateToDispatchEvent()` extension | `packages/web/app/api/v1/work-items/[id]/status/route.ts:40-59` (Brief 223) | depend (sibling brief) | Returns `null` for the new states per D4 (deploy is post-runner). |
| Activity-row audit with `guardWaived: true` | `packages/web/app/api/v1/work-items/[id]/status/route.ts:196-281` (Brief 223) | pattern (project-internal) | Bounded-waiver pattern for server-driven webhook handlers without `stepRunId`. |
| `deploy-prod.yml` template-as-docs pattern | `docs/runner-templates/dispatch-coding-work.yml` (Brief 218 §D16) | pattern (project-internal) | Brief 218 established that template workflows live as docs at `docs/runner-templates/`. |
| Insight-043 reconciliation of `ready-to-deploy → shipped` | `docs/insights/043-knowledge-maintenance-at-point-of-contact.md` | pattern (project-internal) | Architect owns reference-doc accuracy; parent brief 214 §D12's pre-Brief-223 wording is reconciled to today's enum. |
| Brief 223 enum split as the cause of parent §D12 drift (Reviewer-fix M3) | `docs/briefs/complete/223-projects-schema-and-crud.md` (`briefStateValues` introduction) | pattern (project-internal) | Brief 223 shipped between parent brief 214 (2026-04-25) and this brief (2026-04-27); the parent's `workItems.status` wording was correct at write-time and became stale when 223 partitioned the state machine. |
| GitHub-Mobile deep-link URL format | Empirical (GitHub-app + mobile-web both honor `/actions/runs/<run_id>` for deployment-review-pending) | pattern (empirical-observation) | No GitHub-side public spec for "the right URL to open the approve dialog"; the standard run URL is the canonical-by-convention entry point. (Reviewer-fix L3 — re-classified from "original to Ditto" to "pattern (empirical-observation)" since it observes upstream behavior rather than inventing a Ditto-side concept.) |

## User Experience

- **Jobs affected:** Decide (the user decides whether to approve the production deploy in GitHub Mobile — the only human action in the gate), Capture (each lifecycle event surfaces as an inline card in the work-item conversation surface), Orient (the runner pill / work-item state reflects deploy progress at a glance per sub-brief 221).
- **Primitives involved:** Reuses existing `ActionBlock` for the approve-deep-link card. Reuses existing `text` blocks for state-transition narration. `/projects/[slug]` work-item rows reflect new `briefState` values via the runner pill (sub-brief 221's responsibility — this brief just emits the state).
- **Process-owner perspective:** the user has merged a PR; Ditto's conversation surface shows "Shipped — PR #123 merged." A few seconds later, the production-deploy workflow queues; Ditto emits "Deploy approval pending — open GitHub Mobile to approve." On the phone, the GitHub-Mobile push arrives; the user taps it; GitHub Mobile opens the approve dialog; the user approves. Ditto's conversation surface emits "Deploying to production" then (~30s-2min later, vendor-dependent) "Deployed to production — https://acme.com" with the prod URL link. Total user effort: one tap on the GitHub Mobile push.
- **Interaction states:**
  - `shipped` (entry state) — "Shipped — PR #123 merged." (existing card from Brief 223; no change).
  - `deploying` — "Deploy approval pending" with the approve-deep-link `ActionBlock` (when triggered by `queued`); or "Deploying to production" without an action button (when triggered by `in_progress`, the user has already approved).
  - `deployed` — "Deployed to production" with the prod URL as a tappable link.
  - `deploy_failed` — "Deploy failed" with retry-link `ActionBlock` deep-linking to GitHub's re-run-jobs UI on the same run.
  - Idempotent transitions — silent no-op (the activity row records `metadata.transitionRejected = true` but no inline card; the conversation surface filters audit-only activities from the visible stream).
- **Designer input:** **Designer not invoked.** Lightweight UX section here; full conversation-surface polish + runner-pill colour-coding for the three new states + retry-button visual treatment belong to sub-brief 221 (which spawns Designer). This brief uses existing `ActionBlock` + `text` primitives at MVP fidelity.

## Acceptance Criteria

1. [ ] **`briefStateValues` enum extended** with `"deploying"`, `"deployed"`, `"deploy_failed"` in `packages/core/src/db/schema.ts:165-174`. `pnpm run type-check` passes; the `BriefState` type re-export at `packages/core/src/work-items/brief-types.ts` widens automatically.

2. [ ] **`transitionBriefState()` pure module** exists at `packages/core/src/work-items/state-machine.ts` and exports `BRIEF_STATE_TRANSITIONS` + `transitionBriefState(from, to)`. Unit tests verify all D1 transitions including the Reviewer-fix-H3/H4 additions:
    - **Legal:** `shipped → deploying`, `shipped → deployed` (out-of-order), `shipped → deploy_failed` (out-of-order), `shipped → archived` (non-deploy-gated), `deploying → deployed`, `deploying → deploy_failed`, `deploy_failed → deploying` (retry), `deploy_failed → deployed` (retry-out-of-order), `deployed → archived`, `deploy_failed → archived`.
    - **Rejected:** `deployed → shipped`, `deployed → deploying`, `deployed → blocked`, `deployed → deploy_failed`, `archived → anything`.
    - **Non-deploy preservation:** all transitions to/from non-deploy states (e.g., `backlog → approved`, `approved → active`, `active → review`, `review → shipped`, `review → blocked`) preserve Brief 223's existing semantics with no behavior change.

3. [ ] **Schema migration not needed (build-time confirmation).** Verified at `drizzle/0013_workitems_brief_extension.sql:34` that `briefState` is plain `text` with no DB-level enum CHECK constraint — Brief 223 enforces via Zod app-validation only. `drizzle-kit generate` outputs "No schema changes." Existing `work_items` rows preserve their `briefState` value (the column type didn't change). Idx-17 reservation released.

4. [ ] **`cloud-runner-fallback.ts:handleDeploymentStatusEvent()` production branch wired — preconditions.** Replaces lines 583-586's `production-no-op` outcome. `DeploymentStatusEvent.deployment` typed shape widened per D2.1 (`id?: number`, `workflow_run_id?: number | null`). Production-branch lookup uses `findDispatchForRepo(dbImpl, repo, { includeTerminal: true })` per D2.2 (Reviewer-fix H2). Five new `FallbackOutcome` variants exported (`deploy-approval-pending`, `deploy-in-progress`, `deployed`, `deploy-failed`, `deploy-state-no-op`).

5. [ ] **Production `deployment_status: queued` → `shipped → deploying` + `in_progress` idempotency.** Fixture-based integration tests:
     - `deployment_status.state === "queued"` for production env, with seeded `runner_dispatches` row in `succeeded` state (Reviewer-fix H2 regression — verifies the `{ includeTerminal: true }` lookup) → `briefState` transitions `shipped → deploying`; activity row written with `action="deploy_approval_pending"`; metadata includes `mobileApproveAction.url` deep-linking to `https://github.com/<owner>/<repo>/actions/runs/<run_id>`; outcome is `{ kind: "deploy-approval-pending", dispatchId, runUrl }`.
     - `deployment_status.state === "in_progress"` for production env → `briefState` stays `deploying` (or transitions `shipped → deploying` if not already there); activity row written with `action="deploy_in_progress"`; outcome is `{ kind: "deploy-in-progress", dispatchId }`. Replaying the event for an already-`deploying` work item writes no second activity row (idempotent).

6. [ ] **Production terminal transitions: `success` → `deployed`, `failure`/`error` → `deploy_failed`.** Fixture tests:
     - `deployment_status.state === "success"` for production env → `briefState` transitions `deploying → deployed`; activity row written with `action="deployed"`; metadata includes `prodUrl` (from `deployment_status.environment_url`); outcome is `{ kind: "deployed", dispatchId, prodUrl }`.
     - `deployment_status.state === "failure"` for production env → `briefState` transitions `deploying → deploy_failed`; activity row written with `action="deploy_failed"`; metadata includes the `error` description (capped at 4 KB per output-cap discipline); outcome is `{ kind: "deploy-failed", dispatchId, errorReason }`.
     - `deployment_status.state === "error"` for production env → identical to `failure` (alias) — same transition, same activity-action, same outcome shape.

7. [ ] **Out-of-order webhook delivery handled (Reviewer-fix H3).** Fixture tests: `deployment_status: success` arriving BEFORE any `queued`/`in_progress` for the same `deployment.id` → `briefState` transitions `shipped → deployed` directly; activity row records `metadata.outOfOrder = true`; outcome is `{ kind: "deployed", dispatchId, prodUrl }`. Symmetric test for `failure` arriving first → `shipped → deploy_failed`.

8. [ ] **Idempotency + non-actionable states + no-match all return `deploy-state-no-op`.** Fixture tests:
     - `queued` arriving twice (replay) → second rejected by `transitionBriefState()`; activity row records `metadata.transitionRejected = true`; outcome is `{ kind: "deploy-state-no-op" }`; no second inline card.
     - `pending` or `inactive` for production env → no transition, no card; outcome is `{ kind: "deploy-state-no-op" }`.
     - No matching dispatch row at all (e.g., manual deploy unrelated to any Ditto-driven runner) → outcome is `{ kind: "no-match", reason: "no dispatch for repo" }`; no `briefState` transition; no inline card; no activity row written (lookup miss is silent — same semantics as the existing preview path).

9. [ ] **Non-production-env events unchanged (regression).** All non-production `deployment_status` events continue to route to the Vercel-preview-card path (Brief 216 §D5). Regression test verifies preview emission still works after this brief's changes.

10. [ ] **`POST /api/v1/work-items/:id/status` accepts the three new states (Reviewer-fix M6).** `briefStateToDispatchEvent()` returns `null` for `deploying`, `deployed`, `deploy_failed` (no runner-dispatch bridge). The Zod schema validation accepts the states. Integration test: payload with `state: "deployed"` updates `work_items.briefState` to `"deployed"` and writes the activity row; no `runner_dispatches` row is mutated. **Concrete consumer documented:** the `cloud-runner-fallback.ts` handler is the in-tree consumer (it writes briefState directly via the DB transaction, NOT via the route — but the route MUST accept the states for symmetry so a future runner adapter that wants to drive deploy state via the webhook can do so without a schema-acceptance change). If no runner adapter consumes this path within two phases (sub-briefs 221 + 222), revisit the schema acceptance — Chesterton's-fence note recorded in this AC.

11. [ ] **`docs/runner-templates/deploy-prod.yml` exists** as a copy-pasteable workflow template with `environment: production`, vendor-agnostic deploy step (Vercel default with Netlify, Cloudflare Pages, Fly.io as commented alternatives), required `secrets:` declarations documented inline. The YAML parses with `yamllint` (no syntax errors). The workflow assumes a `production` GitHub Environment exists.

12. [ ] **`docs/runner-templates/deploy-prod-setup.md` runbook exists** covering: (a) creating a GitHub Environment named per `project.deployTargetEnvironment`, (b) adding the user as a Required Reviewer (≤6 max, one approval suffices), (c) pasting the workflow template into `.github/workflows/`, (d) setting required secrets per the user's deploy vendor, (e) verifying GitHub Mobile push notifications, (f) the first-deploy smoke sequence (push → Actions tab → push notification → tap → approve → deploy → "Deployed to production" card in Ditto). **Reviewer-fix L2:** any bash snippets in the runbook pass `bash -n <snippet>` syntax check (run as part of the brief's CI gate via a small fixture-extracting test that reads the markdown's fenced ```bash blocks and shells `bash -n` on each); failures break the build, ensuring the runbook's commands stay copy-pasteable.

13. [ ] **One-tap GitHub Mobile approve card metadata complete (Reviewer-fix H1 + L6).** Integration test: `deployment_status: queued` event with `deployment.workflow_run_id` set → activity-row metadata includes `mobileApproveAction: { kind: "external_link", url: "https://github.com/<owner>/<repo>/actions/runs/<run_id>", label: "Approve deploy in GitHub Mobile" }`. When `deployment.workflow_run_id` is null/undefined → graceful fallback URL is `https://github.com/<owner>/<repo>/deployments` (no broken deep-link). The `repo.full_name` is sanitised against `^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$` regex; URLs with malformed repo full-names are rejected pre-write — the activity row records `metadata.urlConstructionRejected = true` and no `mobileApproveAction` payload is emitted. Conversation-surface consumer renders the metadata as an `ActionBlock`.

14. [ ] **End-to-end smoke against agent-crm (manual, executed by user once after merge):** Mac mini powered off, phone-only. Push a commit to agent-crm `main` that triggers `deploy-prod.yml`; verify (a) `deployment_status: queued` event arrives at Ditto's webhook, (b) Ditto's conversation surface for the work item shows the "Deploy approval pending" inline card with the GitHub-Mobile-deep-link, (c) GitHub Mobile push notification arrives on the phone, (d) tapping the notification opens the approve dialog, (e) approving fires `deployment_status: in_progress`, (f) Ditto's conversation surface updates to "Deploying to production", (g) deploy completes; `deployment_status: success` arrives, (h) Ditto's conversation surface shows "Deployed to production — <prod-url>" with the prod URL as a tappable link, (i) work item `briefState` is `deployed`. Total user effort: one tap.

15. [ ] **Mobile-first verification of the inline cards.** The four card variants (deploy-approval-pending, deploy-in-progress, deployed, deploy-failed) render at 375 × 667 viewport with no horizontal scroll, ≥44pt tap targets on the action buttons, URLs truncated with ellipsis when they exceed the card width, sticky-bottom action bar on the conversation surface preserved.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief.
2. Reviewer checks:
   - Does the engine-core boundary hold (only `briefStateValues` extension + `transitionBriefState()` go to core)?
   - Is the `deployment_status` per-state branch shape complete (all seven GitHub states accounted for, idempotent transitions handled, illegal transitions audited)?
   - Is the `briefState` extension consistent with Brief 223's existing semantics (no breaking changes to existing transitions, `deployed → archived` permitted)?
   - Does the GitHub-Mobile deep-link URL format degrade gracefully when `workflow_run_id` is absent?
   - Is the bounded-waiver pattern for `stepRunId`-less webhook calls explicit (`metadata.guardWaived = true`)?
   - Does the brief avoid inventing new ContentBlock primitives (reuses `ActionBlock` only)?
   - Is the template-as-docs pattern consistent with Brief 218's `dispatch-coding-work.yml` precedent?
   - Are the 15 ACs each boolean and testable?
3. Present brief + review findings to human for approval.

## Smoke Test

Manual smoke after this brief merges:

```bash
# 1. Set up the production Environment in agent-crm GitHub repo
# (one-time, follows docs/runner-templates/deploy-prod-setup.md)
#   - Settings → Environments → New environment → "production"
#   - Required reviewers → add the user's GitHub account
#   - Add VERCEL_TOKEN secret (or vendor equivalent)

# 2. Paste docs/runner-templates/deploy-prod.yml into agent-crm/.github/workflows/

# 3. Push a commit that triggers deploy-prod.yml (e.g., a tag push or manual workflow_dispatch)

# 4. Verify Ditto's conversation surface for the agent-crm work item shows:
#    - "Deploy approval pending — Approve deploy in GitHub Mobile"
#    - The action button deep-links to https://github.com/<owner>/agent-crm/actions/runs/<run_id>

# 5. On the phone:
#    - Receive GitHub Mobile push: "Deployment to production needs review"
#    - Tap notification → approve dialog → tap "Approve and deploy"

# 6. Verify Ditto's conversation surface updates:
#    - "Deploying to production" card appears
#    - work_items.briefState transitions to "deploying"

# 7. Wait for deploy to complete (Vercel default ~30-90s)

# 8. Verify Ditto's conversation surface:
#    - "Deployed to production — <prod-url>" card appears with tappable prod URL
#    - work_items.briefState transitions to "deployed"

# 9. Failure-path smoke:
#    - Introduce a syntax error in the deploy step, push a new commit
#    - Approve the deploy on GitHub Mobile
#    - Verify Ditto's conversation surface shows "Deploy failed — <error>" with retry-deep-link
#    - work_items.briefState transitions to "deploy_failed"
#    - Tap retry-deep-link → GitHub re-runs the failed jobs → on success, briefState transitions deploy_failed → deploying → deployed

# 10. Idempotency smoke:
#     - Replay the deployment_status: queued webhook (e.g., via GitHub's "Recent Deliveries" → Redeliver)
#     - Verify no second "Deploy approval pending" card emitted
#     - Verify activity row written with metadata.transitionRejected = true
```

## After Completion

1. Update `docs/state.md` — Brief 220 transitions `complete`; subsequent architect sessions write 221 (Mobile UX) + 222 (E2E smoke) per parent's sub-brief decomposition table.
2. Update parent brief 214 status — partial; 214 stays `ready` until phase-completion (sub-brief 222 merge).
3. Update `docs/dictionary.md` per §What Changes (Deploy Gate, Deploying State, Deployed State, Deploy Failed State, Deploy-Prod Workflow Template, GitHub Environment, Required Reviewer).
4. Update `docs/architecture.md` §L3 (Harness) per parent brief 214 §"Reference doc updates" — append the deploy-gate paragraph confirming `briefState` extension + `deployment_status`-driven transitions + bounded-waiver per Insight-180.
5. Phase retrospective entry for Brief 220 (run by Documenter): what worked, what surprised about GitHub Mobile's deep-link behavior, what to change for sub-brief 221 (Mobile UX should benefit from the new `briefState` values being already-established).
6. No ADR needed — this is a sub-brief implementing the parent brief's design.
