# Brief 221: Runner Mobile UX — Approval Flow + Inline Cards (sub-brief of 214)

**Date:** 2026-04-27
**Status:** ready (post-Builder buildability narrowing 2026-04-27; idx + namespace-bypass drifts fixed; admin-pill / metrics / retry-next-in-chain deferred to Brief 231)
**Depends on:** Brief 215 (Projects + Runner Registry — substrate; `runner_dispatches` schema, `RunnerAdapter` interface, `dispatchWorkItem` dispatcher), Brief 216 (Routine adapter; established `cloud-runner-fallback.ts` + `runner-status-handlers/routine.ts`), Brief 217 (Managed Agent adapter; `runner-status-handlers/managed-agent.ts`), Brief 218 (GitHub Action adapter; `runner-status-handlers/github-action.ts`). Brief 220 (Deploy gate) is NOT a hard dep but adjacent (the work-item state-machine extension lives there); Brief 220's deploy-status inline cards register into the same discriminator-keyed `StatusCardBlock` renderer pattern this brief introduces (D6).
**Unlocks:** **Brief 231** (Runner Admin UX — pill on `/projects/[slug]` recent dispatches list + retry-next-in-chain + per-project + workspace runner-metrics; deferred from this brief at Builder buildability check 2026-04-27 to keep this brief tractable in one session). **Brief 222** (end-to-end smoke tests). With this brief + Brief 231 shipped, the user's iPhone is sufficient to drive the cloud-runner pipeline end-to-end (intake → triage → approve runner → dispatch → PR → review → preview → deploy gate from Brief 220 → done). Smoke A in Brief 214 §"Smoke Test" — agent-crm cloud, Mac mini off, phone-only — becomes executable after this brief alone (Brief 231 polishes admin/monitoring; the critical-path approval moment ships here).
**Parent brief:** 214 (Cloud Execution Runners Phase)
**Designer spec:** `docs/research/runner-mobile-ux-ux.md` (2026-04-27, reviewer-passed)

## Goal

- **Roadmap phase:** Phase 9+ (cloud-runners — UX seam over the dispatched primitive).
- **Capabilities delivered (this narrowed brief):**
  - **`StatusCardBlock` metadata extension + discriminator-keyed renderer** (engine-core) — optional `metadata?: Record<string, unknown>` field on `StatusCardBlock` so runner-status emissions can carry typed runner data without inventing a new ContentBlock type (Insight-107, Insight-138). The web-side renderer dispatches via a `Record<string, RendererFn>` keyed on `metadata.cardKind`, NOT cascading-if (D6).
  - **Cloud-runner pause-approval surface** — when the upstream trust-gate returns `pause` or `sample_pause` for a cloud-runner-targeted work item, the harness mints a `/review/[token]` page whose payload is structured (work-item summary + runner selector form + approve/reject actions). Bridge-dispatch (Brief 212) migrates from the current single-`TextBlock` payload to the same structured payload — one shared mint helper, four runner kinds.
  - **Interactive `/review/[token]` rendering** — the page client renders the structured payload as a vertical radio "Run on:" selector + force-cloud toggle + sticky bottom Approve/Reject bar. Tap budget: ≤3 from notification to dispatched.
  - **Conversation inline cards via `StatusCardBlock`** — runner-status handlers + `cloud-runner-fallback.ts` emit a `StatusCardBlock` (with the new `metadata` extension carrying `cardKind = "runnerDispatch"`) on each runner-status transition, persisted alongside today's `activities.description`. The conversation surface renders these via the existing BlockRegistry — no new viewer.
  - **Mobile-first compliance for the approval surface** — `/review/[token]` passes Playwright e2e at 375×667 AND 320×568 (iPhone SE) with no horizontal scroll, ≥44pt touch targets, sticky bottom action bar, deep-links opening in same window.
- **Capabilities deferred to Brief 231 (Runner Admin UX):**
  - Runner pill on `/projects/[slug]` recent dispatches list (the shared `<RunnerPillView>` React leaf + the `<DispatchCard>` composer used by both the admin list and the StatusCardBlock runner-template are introduced in this brief but ONLY consumed by the conversation inline card; admin-list consumption is Brief 231).
  - Per-project metrics card on `/projects/[slug]` (success rate / mean duration / rate-limit hits / fallback-triggered rate).
  - Workspace-wide aggregate runner-metrics card on `/admin`.
  - Retry-next-in-chain API + button on failed/rate_limited/timed_out inline cards (`POST /api/v1/runner-dispatches/:id/retry-next-in-chain`).
  - E2E for `/projects/[slug]` + `/admin`.

## Context

The user's revised pipeline spec (`.context/attachments/pasted_text_2026-04-25_21-14-58.txt:30`) names "the iPhone is sufficient" as the ship standard. Brief 214 §D13 names four mobile surfaces; the parent flagged Designer not yet invoked and deferred the brief body to a Designer-first session. That session ran 2026-04-27 and produced `docs/research/runner-mobile-ux-ux.md` (15 sections, reviewer-approved with three critical-issue fixes applied in-session).

Today, the four surfaces are at varying levels of completion:

| Surface | Status today |
|---------|-------------|
| `/projects/[slug]` recent dispatches | Placeholder text "Sub-brief 221 surfaces runner-dispatch metrics here." (`packages/web/app/projects/[slug]/page.tsx:99-106`). Brief 215 reserved the slot. |
| `/review/[token]` approval | Renders ContentBlock[] + chat-with-Alex (Brief 106). NO Approve/Reject buttons; NO selector. The page's `<ReviewPageClient>` renders blocks via `<BlockRenderer>` and submits chat to `/api/v1/network/review/{token}/chat`. |
| Conversation inline runner cards | Text-only via `describe<Kind>Callback()` strings written to `activities.description` (`src/engine/runner-status-handlers/{routine,managed-agent,github-action}.ts`). Briefs 216/217/218 each said "Brief 221 owns the polish" and emitted text MVP. |
| `/admin` runner metrics | None. `/admin` is "Alex's Teammate View" today (network of users, communications, processes). |
| Cloud-runner pause-approval mint | **Missing.** `bridge-dispatch.ts:340-386` mints a review-page on `pause`/`sample_pause` with a single `TextBlock`. Cloud-runner adapters (routine, managed-agent, github-action) DO NOT currently mint a review-page on pause — the trust-gate decision is recorded upstream of `dispatchWorkItem`, but no user-facing approval surface lights up for cloud dispatches. Brief 216/217/218 each promised it (§D8) but the actual mint is the gap Brief 221 fills. |

The Designer spec (§5–§9) covers what each surface should DO; this brief covers WHERE THE WIRING GOES, WHICH FILES CHANGE, and the boolean acceptance criteria. The 7 numbered open questions in spec §10 are answered in §"Architectural Decisions" below.

## Objective

Ship a mobile-first UX layer over the cloud-runners primitive that lets the user (a) see where any work runs at a glance, (b) decide where a single dispatch should run at approval time on their phone, (c) watch live progress and outcomes inline in conversation without leaving Ditto, (d) recover from runner failures with one tap, and (e) understand runner health per-project on a single compact card. The standard: the founder dogfooding from a phone with the Mac mini off completes Smoke A in Brief 214 §"Smoke Test" without opening a desktop browser.

## Non-Goals

- **No runner pill on `/projects/[slug]` recent dispatches list.** The shared `<RunnerPillView>` React leaf is introduced here for use by the conversation inline `<DispatchCard>` only; the admin-list consumer is Brief 231. The placeholder text at `packages/web/app/projects/[slug]/page.tsx:99-106` remains. (Builder buildability check 2026-04-27: defers admin/monitoring surfaces to keep this brief tractable in one session.)
- **No per-project or workspace-wide runner-metrics card.** Brief 231 owns the metrics aggregations + UI.
- **No retry-next-in-chain API or button.** Brief 231 owns `POST /api/v1/runner-dispatches/:id/retry-next-in-chain` + the failed-card retry button. This brief's failed/rate_limited/timed_out inline cards surface the error reason and an external link only; the user re-triggers via the project's chain on the next intake or via direct admin action — not in-conversation in this brief.
- **No push notification infrastructure.** Spike confirmed no `webPush` / `serviceWorker` / `apns` / `fcm` / push-subscription primitives exist anywhere in the codebase. Brief 221 ships URL-deep-link-accessible surfaces; "tap a notification" relies on existing channels (email link, Telegram message link if present, manual app open). Browser push is a separate brief (one of Brief 222 follow-ups, or earlier if user demand surfaces).
- **No new ContentBlock types.** Per Insight-107 (BlockList is the viewer) and the Reviewer's pass on the Designer spec, runner-state metadata extends `StatusCardBlock` via an optional `metadata` field; runner pills on admin surfaces use a React-leaf component over fetched `runner_dispatches` rows (NOT a ContentBlock). Future block subtypes follow the same metadata-discriminator pattern (one explicit fork in the renderer, never proliferating `if` checks).
- **No `review_pages.kind` schema column.** Discrimination of pause-approval pages from Brief 106 network-review pages happens by content-blocks composition: the presence of a `WorkItemFormBlock` whose form has the `runner-dispatch-approval` action namespace tells the client that this is a pause-approval page. Zero migration risk; reuses Brief 072 action-namespace pattern.
- **No "Edit @ desk" action on `/review/[token]`** (Insight-012 stretch goal). Approve / Reject / selector / force-cloud are the minimum. A follow-on UX brief covers Edit @ desk across all review-page kinds (Brief 106, runner-dispatch-pause, file-write-supervised) once that pattern is itself battle-tested.
- **No runner pill on Today / Work / Inbox compositions.** Spec §5 noted the visual leaf is reusable; deferring composition-engine integration to a follow-on keeps Brief 221 within ACs band. The shared `<RunnerPillView>` component is built so Today/Work integration is later straightforward.
- **No live external-session embedding** — no xterm.js view, no SSE-from-Anthropic-streamed inline. External deep-links open in the same window (or `github://` for PR links if GitHub Mobile is installed). Already true today; this brief preserves the discipline.
- **No regression of bridge-dispatch's existing pause flow.** Brief 212's local-mac-mini dispatch continues to mint a review-page; this brief MIGRATES the payload from `[TextBlock]` to the structured payload but the URL semantics, token shape, and approval contract are identical.
- **No retry-on-rate-limit auto-advance at the dispatcher level.** `dispatchWorkItem` already auto-advances on transient dispatch errors (network blip, 5xx) per Brief 215. Brief 221's manual retry-next-in-chain button is for `failed` / `rate_limited` / `timed_out` terminal states where the user is the deciding agent (Insight-209: explicit-when-needed).
- **No `/admin` re-architecture.** The new aggregate metrics card is a single ContentCard insertion; the rest of the page is unchanged.
- **No telegram bot wiring** (cross-surface coherence flag from Designer spec §9). `/review/[token]` URL is already shareable; embedding in a Telegram message is a follow-on.
- **No multi-runner fan-out per dispatch** — one `runner_dispatches` row per attempt, one in-flight per work item (parent §"Cross-runner data sharing" Non-Goal stands).

## Inputs

1. `docs/briefs/214-cloud-execution-runners-phase.md` — parent; §D2 (kind enum), §D8 (trust integration), §D11 (default review path), §D13 (mobile UX scope, four surfaces) are binding.
2. `docs/research/runner-mobile-ux-ux.md` — **the Designer interaction spec** (this brief's User Experience section is its synthesis). Sections §3 (six-jobs map), §4 (terminology mapping), §5 (runner pill), §6 (review-token selector), §7 (conversation cards), §8 (metrics card), §9 (cross-surface coherence), §10 (the 7 open questions answered in §Architectural Decisions below), §12 (acceptance signals — feed §Acceptance Criteria) are binding.
3. `docs/briefs/complete/215-projects-and-runner-registry.md` — `runner_dispatches` schema, `dispatchWorkItem`, `resolveChain`, `runner-registry.ts`. AC #6 (mode_required filter) and §D5 (chain resolution algorithm) are reused without change.
4. `docs/briefs/complete/216-routine-dispatcher.md` — `runner-status-handlers/routine.ts` describe-callback shape; the kind-agnostic `cloud-runner-fallback.ts`; the activity-emission path for runner-status text. **Brief 221 replaces text-only emission with `StatusCardBlock` emission across this file.**
5. `docs/briefs/complete/217-managed-agent-dispatcher.md` — sibling. `runner-status-handlers/managed-agent.ts` mirrored.
6. `docs/briefs/complete/218-github-action-dispatcher.md` — sibling. `runner-status-handlers/github-action.ts` mirrored.
7. `docs/briefs/212-workspace-local-bridge.md` — bridge-dispatch.ts pause-mint at lines 340-386. **This brief migrates the bridge mint to use the same shared helper as cloud runners.** Behaviour-preserving (token, URL, expiry, approve/reject contract identical); the difference is content-blocks composition.
8. `docs/personas.md` — Rob's mobile day (lines 86-108) is the dogfood standard. The "would Rob use this on his phone between jobs?" test is binding for every surface.
9. `docs/human-layer.md` §"Mobile Experience" + §"ContentBlocks" — the 26 ContentBlock catalog (no new types added); the responsive-breakpoints subsection (sticky-bottom-action-bar precedent on artifact mode); Brief 072 action-namespace pattern for forms.
10. `docs/insights/107-blocklist-is-the-viewer.md` — no bespoke viewers; new data is metadata on existing blocks.
11. `docs/insights/138-metadata-first-block-mapping.md` — Self tools pass `metadata` alongside `output`; runner-status handlers do the same. Block renderer reads metadata-first.
12. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every retry-next mint, review-approve handler, and any new dispatch-triggering route requires `stepRunId`. Spike covered the dispatch path; this brief adds the new entry-point routes and tests guards on each.
13. `docs/insights/209-resilience-trio-for-async-dispatch.md` — manual retry on user-visible terminal failures; auto-advance for transient. Brief 221's button-for-terminal pattern is the explicit half of this insight.
14. `docs/insights/072-form-submit-action-namespace.md` (existing pattern, referenced indirectly via the Brief 072 reviewer-fix) — `WorkItemFormBlock` uses `submit` actions with kind-scoped registry tokens. The runner-dispatch-approval form uses namespace `runner-dispatch-approval`.
15. `docs/insights/011-mobile-is-operate-mode.md` + `docs/insights/012-edit-at-desk-is-first-class.md` + `docs/insights/015-mobile-is-seamless-not-primary.md` — mobile-as-Operate framing; Edit @ desk deferred to follow-on per §Non-Goals.
16. `packages/core/src/content-blocks.ts:57-64` — `StatusCardBlock` current shape: `{ type, entityType, entityId, title, status, details? }`. Brief 221 ADDS optional `metadata?: Record<string, unknown>`.
17. `packages/core/src/content-blocks.ts:67-70` — `ActionBlock`. Used for Approve/Reject buttons.
18. `packages/core/src/content-blocks.ts:220-229` — `InteractiveField`. `select` field for runner kind; `toggle` field for force-cloud.
19. `packages/core/src/content-blocks.ts:243-248` — `WorkItemFormBlock`. Bundles `InteractiveField[]`, supports submit-action namespace (Brief 072).
20. `packages/core/src/db/schema.ts:1165-1203` — `runner_dispatches` schema (referenced for the dispatches list, retry-next API, metrics aggregations).
21. `src/engine/runner-dispatcher.ts` — `dispatchWorkItem` is the single entry-point for triggering dispatches; the retry-next API route calls this directly with `attemptIndex = previous + 1`.
22. `src/engine/harness-handlers/bridge-dispatch.ts:340-386` — current bridge pause-mint; this brief migrates it.
23. `src/db/schema/network.ts:342-360` — `review_pages` schema. Unchanged by this brief.
24. `packages/web/app/review/[token]/{page.tsx,review-page-client.tsx}` — current Brief 106 render path; this brief extends the client to handle ActionBlock + WorkItemFormBlock submissions for the runner-dispatch-approval namespace.
25. `packages/web/app/projects/[slug]/page.tsx:99-106` — placeholder; this brief replaces the section.
26. `packages/web/app/admin/page.tsx` — current `/admin` page; this brief inserts a thin runner-metrics card alongside the existing user-oversight section.
27. `packages/web/components/ai-elements/shimmer.tsx` — loading skeleton component; reused for dispatch-list + metrics-card loading states.

## Architectural Decisions

The numbered decisions D1–D7 below answer the 7 numbered open questions in `docs/research/runner-mobile-ux-ux.md` §10. Decisions D8–D12 cover wiring/structure not in the spec.

**D1: `/review/[token]` discriminator = content-blocks composition (NOT a schema column).** The page is a runner-dispatch-pause iff its `contentBlocks` array contains a `WorkItemFormBlock` whose `formId` = `runner-dispatch-approval` (the form-id check is unambiguous). The renderer reads the array, finds the form, and binds Approve/Reject + selector + toggle accordingly. No `review_pages.kind` column. Brief 106 network-review pages have no such form and continue to render as today (chat with Alex). File-write-supervised approval pages from Brief 224/229 (when they ship) will use a different form-id (`file-write-approval`) — same pattern.

  **Why composition not column:** composition discrimination is zero-cost, fits Brief 072's already-namespaced form pattern, and lets future review-kind variants land additively. The Designer spec §6 explicitly endorsed this option.

  **Brief 072 F1 namespace-bypass safety — server-stamped data lives in `review_pages.contentBlocks`.** Brief 072's Reviewer F1 fix (referenced as "block-type-scoped registry tokens — no action-registry bypass" in `docs/human-layer.md` ContentBlock catalog notes) requires that every form's `submit` action validate against a kind-scoped registry. The approve/reject API routes (D10) NEVER trust a client-submitted `formId` or `selectedKind` in isolation. Instead, they read the review-page's `contentBlocks` from DB (the page is server-minted by `pauseRunnerDispatchForApproval()` per D9 and stored at mint time — the client cannot mutate it post-mint), find the `WorkItemFormBlock` whose `formId === "runner-dispatch-approval"`, and validate the inbound `selectedKind` against the `options` array on that block's runner-kind `InteractiveField`. The `options` array is the server-stamped eligibility list. **AC #6 includes a namespace-bypass test:** POST an approve request to a token whose underlying review-page was minted by a different flow (e.g., a Brief 106 network-review token where the contentBlocks contain no `runner-dispatch-approval` form, OR a contrived contentBlocks payload where the form's `options` exclude the inbound `selectedKind`) — the route returns 400 with a clear reason. No new column on `review_pages` needed; the discriminator and the eligibility list are both already in `review_pages.contentBlocks` (server-stamped at mint).

**D2: Runner pill scope = `/projects/[slug]` ONLY in Brief 221.** The shared `<RunnerPillView>` React leaf is built so Today / Work composition integration is later trivial — but Brief 221 ships only the admin-surface usage (the project detail page's "Recent dispatches" list). Composition-intent integration requires changes to `compositions/today.ts` + `compositions/work.ts` + each composition's empty/loading/active states; that's out of band for the AC budget here. Follow-on brief in Brief 222's wake.

**D3: Metrics card location = per-project on `/projects/[slug]` (primary) + thin aggregate on `/admin` (secondary).** Per-project is the unit of decision-making ("should I reorder agent-crm's chain?"). Aggregate gives Jordan-persona the demo view. The `/admin` card is intentionally minimal: one row per runner kind (kind name, total dispatches last 7d, success rate, last failure reason). Per-project card is full (per-runner KPIs + cross-runner aggregates).

**D4: "Edit @ desk" = OUT (stretch goal, deferred).** See Non-Goals. Brief 221 ships Approve / Reject. A follow-on consolidates Edit @ desk across all review-page kinds.

**D5: Auto-advance vs manual-retry default = MANUAL retry on `failed | rate_limited | timed_out`.** The user's terminal-state inline card surfaces a single "Retry on {next-kind}" button. Auto-advance is reserved for transient dispatch errors (network blip, 5xx) which `dispatchWorkItem` already handles internally without user-visible cards (Brief 215 §D5). The button is a deliberate decision moment per Insight-209. The button is hidden when no eligible next-kind exists (chain exhausted or mode-filter empty); in that case the card surfaces "Stop and reconfigure ↗" linking to `/projects/[slug]/runners`.

**D6: `StatusCardBlock` metadata extension = additive optional field with a typed discriminator.** `packages/core/src/content-blocks.ts:57-64` gains `metadata?: Record<string, unknown>;` (additive — no field exists today; AC #1 verifies). The runner-status emission populates it with the field contract from Designer spec §7 (runnerKind, runnerMode, status, attemptIndex required when set; externalUrl, prUrl, previewUrl, errorReason, nextRunnerKind, elapsedSeconds optional) PLUS a `cardKind: "runnerDispatch"` discriminator field (string literal). The `<StatusCardBlock>` renderer dispatches by `metadata?.cardKind`:

```ts
const subtypeRenderers: Record<string, (block: StatusCardBlock) => ReactNode> = {
  runnerDispatch: RunnerDispatchTemplate,
  // Future: deployStatus (Brief 220), fileWriteSupervised (Brief 229), etc.
};
const subtype = block.metadata?.cardKind as string | undefined;
const Renderer = subtype && subtypeRenderers[subtype] ? subtypeRenderers[subtype] : GenericTemplate;
```

  **Why a discriminator-keyed dispatch table, not cascading `if` checks:** Brief 220 (deploy-status) and Brief 229 (file-write supervised) are likely to add their own metadata-bearing variants. A cascading-`if` renderer sprawls O(N) with subtype count; a discriminator-keyed dispatch table stays O(1) per render and the registration site is a single line per subtype. AC #1 verifies the renderer uses this pattern. Brief 220's deploy-status emission registers `cardKind = "deployStatus"`; Brief 229's file-write registers `cardKind = "fileWriteSupervised"`. **Naming convention:** `cardKind` values are camelCase string literals; the registration is a const map at module scope; no runtime mutation.

  **Why not a `details: Record<string, string>` flattening (the alternative the spike found):** `details` is `Record<string, string>` only — it cannot carry an array, an enum, or a nested object cleanly. Runner metadata includes `attemptIndex: number` and may include sub-objects (e.g., the next-kind suggestion + its mode). `metadata: Record<string, unknown>` is the right shape per Insight-138.

**D7: Push-notification trigger = OUT for Brief 221.** No infrastructure exists; building it is its own brief. URL-deep-link access via email/Telegram/manual-open suffices for the founder dogfood scope. Future push brief lands the trigger; Brief 221's surfaces are already deep-link-shareable so wiring is non-disruptive when push lands.

**D8: One shared `mintRunnerDispatchPause()` helper in `packages/core/src/runner/`.** New module. Inputs: `{ workItem, project, projectRunners, eligibleChain, modeRequired, stepRunId, formId, actionNamespace, copy }` — note `formId`, `actionNamespace`, and user-facing `copy` (button labels, header text) are INJECTED parameters, not hardcoded literals. Outputs: `ContentBlock[]` representing the structured pause payload (TextBlock summary + WorkItemFormBlock with the eligible-runner radio + force-cloud toggle + ActionBlock with Approve/Reject buttons whose action IDs derive from the injected `actionNamespace`). The helper is generic — it knows about ContentBlock types (in core) and runner kinds (Brief 215 §D9 placed in core) but knows nothing about Ditto's review-page table, token minting, Self, personas, or workspace concepts.

  The Ditto-specific values (`formId = "runner-dispatch-approval"`, `actionNamespace = "runner-dispatch-approval"`, copy = "Approve & dispatch" / "Reject" / "This work will run on:") are hardcoded by the **Ditto-product caller** at `src/engine/harness-handlers/runner-pause.ts` (D9) — NOT by the helper. ProcessOS or any other consumer can call the helper with their own form-id / namespace / copy.

  Bridge-dispatch.ts (Brief 212) and the new pre-`dispatchWorkItem` pause-handler (see D9) both call this helper through the same product-layer caller — single source of truth for the payload shape AND the Ditto-specific labels. Bridge-dispatch.ts §340-386 simplifies from inline TextBlock construction to one call to `pauseRunnerDispatchForApproval()` (which internally calls `mintRunnerDispatchPause()`).

**D9: Cloud-runner pause flow = a new `pauseRunnerDispatchForApproval()` step BEFORE `dispatchWorkItem`.** Currently `dispatchWorkItem` accepts `trustAction = "pause"` but the dispatcher does not pause; the upstream caller is meant to. Today no production caller exists (dispatcher is only called from tests). Brief 221 introduces the upstream caller as a small handler at `src/engine/harness-handlers/runner-pause.ts` that:
  - Reads `(workItem, project, runners, modeRequired, stepRunId, trustTier, trustAction)`.
  - If `trustAction ∈ {"pause", "sample_pause"}`: resolve the chain (`resolveChain()` from `@ditto/core`), call `mintRunnerDispatchPause()`, persist a `review_pages` row + token, write a `harness_decisions` audit row keyed on stepRunId, return `{ paused: true, reviewToken }`. Caller surfaces the token URL.
  - If `trustAction ∈ {"advance", "sample_advance"}`: skip the pause, call `dispatchWorkItem(input)` directly.
  - If `trustAction === "critical"`: reject pre-flight per Brief 214 §D8.

  This is the production wiring that closes the dispatcher-isn't-called-anywhere gap. Brief 221 ships the handler; the actual production trigger (intake → triage → handler) lives in Brief 222's smoke wiring (or a related follow-on). The handler is independently unit-testable and is the contract any future caller binds to.

**D10: Approve/Reject API routes = `POST /api/v1/review/[token]/approve` + `POST /api/v1/review/[token]/reject`.** New routes under `packages/web/app/api/v1/review/[token]/`. Approve body: `{ selectedKind: RunnerKind, forceCloud: boolean }`. Reject body: `{ reason?: string }`. Approve handler validates the token, validates the selected kind is in the page's eligible chain, persists `runner_mode_required = "cloud"` on the workItem if forceCloud, then calls `dispatchWorkItem({ stepRunId, workItemId, processRunId, trustTier, trustAction: "advance" })`. Reject handler updates the work-item state to `triaged` (re-dispatchable) with a recorded reason. Both consume the token (one-shot per existing review-page semantics). Both are stepRunId-guarded (Insight-180): the `review_pages` row's stepRunId is read and threaded to the dispatcher / harness_decisions write.

  **Token-side bearer collision:** the `/api/v1/network/review/[token]/chat` route from Brief 106 stays unchanged; the new approve/reject routes share the `[token]` path-param parsing and `getReviewPage(token)` validation but otherwise are independent. The chat route checks the page is a network-review-kind page (no form blocks); the approve/reject routes check the page is a runner-dispatch-pause-kind page (has the form block). Both use the existing token-validate flow.

**D11: Retry-next-in-chain API route = `POST /api/v1/runner-dispatches/:id/retry-next-in-chain`.** New route under `packages/web/app/api/v1/runner-dispatches/[id]/retry-next-in-chain/`. Body empty. Handler:
  - Reads the dispatch row + parent project + runners.
  - Re-runs `resolveChain` with the work item's current mode-required + the project's current chain.
  - Drops kinds whose `attemptIndex ≤ existing-attempts` (so we don't loop on the same kind).
  - If the next-kind is empty: 409 with `{ reason: "chain_exhausted" }`.
  - Otherwise: calls `dispatchWorkItem({ stepRunId: <new>, workItemId, processRunId, trustTier, trustAction: "advance" })`. Returns the new `runner_dispatches` row.
  - Insight-180: a fresh stepRunId is minted for the retry attempt; the chain advance is its own audit-decision.

**D12: Conversation inline cards emission = new optional `activities.contentBlock` JSON column.** Today the runner-status handlers write strings to `activities.description`. Brief 221 changes the contract:
  - Each handler returns `{ activityDescription: string, contentBlock: StatusCardBlock }` per status transition.
  - The webhook route / poller writes `activities.description = activityDescription` (audit-trail string, backward-compatible) AND writes the `contentBlock` into a new `activities.contentBlock` JSON-typed nullable column.
  - The work-item conversation surface (`GET /api/v1/work-items/:id/activities`) returns activity rows including the `contentBlock` field; the renderer iterates rows and renders any non-null `contentBlock` through the existing BlockRegistry.

  **Schema migration locked.** A new optional column `contentBlock JSON?` lands on the `activities` table. Migration idx assignment per Insight-190: last journal entry is idx 15 with tag `0016_broad_onslaught`; Brief 220 (parallel session) reserves idx 16 with tag `0017_briefstate_deploy_states`. Brief 221 reserves **idx 16, tag `0017_activity_content_block`**. Strict-monotonic; resequence if a parallel session lands first per Insight-190. Backfill: NULL for existing rows. Existing readers (audit views, system agents reading `activities.description`) are unchanged. AC #7 verifies user-visible rendering; the migration itself is verified by the schema-discipline AC #2.

  **Why this option (vs. on-demand translation from `activities.metadata`):** locking now removes a Builder decision that affects schema. Storing the rendered card alongside the audit-text means: (a) the conversation surface fetches one row, gets both audit string + render data; no double-write race; (b) audit observers can confirm "the user saw this card" by inspecting one row; (c) the runner-status handlers stay the only place that decides card content — no derivation logic in the renderer. Migration is trivial (one optional column), additive, and follows the journal idx rules (Insight-190).

  **Bridge-dispatch parity.** `src/adapters/local-mac-mini.ts` and `src/engine/local-bridge.ts` (the bridge-event consumers) similarly emit a StatusCardBlock per transition into the new column (paired text description retained). This brings the runner pill / conversation card patterns to four-of-four runner kinds.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `StatusCardBlock` extension via optional `metadata` field | Insight-138 (project-internal) — metadata-first block mapping | pattern (project-internal) | Self tools already use this contract; runner-status emissions follow it. |
| `WorkItemFormBlock` action-namespace pattern for form submission | Brief 072 (project-internal) + Reviewer F1 fix | pattern (project-internal) | Same pattern used for in-conversation forms; runner-dispatch-approval is a new namespace, no schema change. |
| `<RunnerPillView>` visual leaf (status dot + kind label + mode chip + outcome trail) | GitHub Actions workflow-run rows + Vercel deployment cards | pattern | Industry-recognised compact-row pattern; Researcher §1 in `runner-mobile-ux-ux.md`. |
| Vertical-radio "Run on:" selector on `/review/[token]` | iOS HIG / Apple form patterns + Researcher §2 | adopt | No CI / deploy tool surfaces this at approval time — the radio is conventional, the placement is original to Ditto. |
| Sticky bottom action bar | iOS / Android system convention; Brief 212 admin precedent (Bridge admin AC #15 e2e validates ≥44pt + sticky) | adopt | Thumb-reach optimisation; precedent already in repo. |
| Manual retry-next-in-chain button | Researcher §4 — explicit-when-needed (no convention exists for "advance to next runner in declared chain") | original to Ditto | Argo/GHA/Buildkite have retry but none surface chain-advance as a single tap. |
| `mintRunnerDispatchPause()` shared helper in `packages/core/src/runner/` | Brief 215's `resolveChain` co-located pattern | pattern (project-internal) | Engine-core is the right home — no Ditto opinions. ProcessOS could use it. |
| `pauseRunnerDispatchForApproval()` upstream-of-dispatcher handler | Brief 215 dispatcher contract (caller passes `trustAction`); Brief 212 bridge-dispatch.ts pause-mint at lines 340-386 | pattern (project-internal) | Same shape as bridge-dispatch's pause-mint, lifted to be cloud-runner-aware. |
| `POST /api/v1/review/[token]/approve` + `/reject` routes | New | original to Ditto | The /review/[token] surface had no Approve/Reject paths today; this brief introduces them. |
| `POST /api/v1/runner-dispatches/:id/retry-next-in-chain` | New | original to Ditto | No prior route triggers a chain-advance from user action. |
| Per-project metrics card with sparkline-free compact KPIs | GitHub Actions Metrics, Buildkite Insights (desktop-first) — Researcher §6 | pattern (mobile compaction is original) | KPI selection is conventional; the mobile compaction is ours. |
| Edit @ desk action (Insight-012) on the review surface | Insight-012 (project-internal) | rejected for this brief | Stretch goal explicitly deferred per Non-Goals. |
| Push-notification entry point | None implemented today; Researcher §8 names GitHub Mobile precedent | rejected for this brief | No Ditto infrastructure; out of scope per D7. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/content-blocks.ts` | **Modify** (`StatusCardBlock` gains optional `metadata?: Record<string, unknown>`). Re-export from `src/engine/content-blocks.ts` is unchanged. |
| `src/engine/content-blocks.ts` | **No code change** — re-export from `@ditto/core` already pass-through. Verify the `StatusCardBlock` type alias surfaces the new field. |
| `packages/core/src/runner/mint-pause-payload.ts` | **Create** — shared `mintRunnerDispatchPause()` helper that returns `ContentBlock[]` (TextBlock summary + WorkItemFormBlock + ActionBlock). |
| `src/engine/harness-handlers/runner-pause.ts` | **Create** — `pauseRunnerDispatchForApproval()` handler that mints the review-page on `pause`/`sample_pause`. Test file alongside. |
| `src/engine/harness-handlers/bridge-dispatch.ts` | **Modify** lines 340-386 — replace inline TextBlock construction with a call to `mintRunnerDispatchPause()`. Behaviour-preserving. |
| `src/engine/runner-status-handlers/routine.ts` | **Modify** — `describeRoutineCallback()` returns `{ activityDescription, contentBlock }`. ContentBlock is `StatusCardBlock` with runner metadata per D12. |
| `src/engine/runner-status-handlers/managed-agent.ts` | **Modify** — same shape change. |
| `src/engine/runner-status-handlers/github-action.ts` | **Modify** — same shape change. |
| `src/engine/github-events/cloud-runner-fallback.ts` | **Modify** — `handleDeploymentStatusEvent` (lines 562-611) and the `workflow_run` / `pull_request` correlation paths emit `StatusCardBlock` per transition. The Vercel-preview-ready emission becomes a card, not a text-only activity. |
| `src/adapters/local-mac-mini.ts` + `src/engine/local-bridge.ts` | **Modify** — bridge-event consumers also emit StatusCardBlocks per transition (parity with cloud runners). |
| `packages/web/app/review/[token]/review-page-client.tsx` | **Modify** — render the `runner-dispatch-approval` form: vertical-radio kind selector + force-cloud toggle + sticky bottom Approve/Reject bar. POST to the new approve/reject routes. Existing chat-with-Alex path stays for non-form pages. |
| `packages/web/app/api/v1/review/[token]/approve/route.ts` | **Create** — handles approve POST; validates token + form-payload + form's eligible kinds; sets `runner_mode_required` if forceCloud; calls `dispatchWorkItem`. |
| `packages/web/app/api/v1/review/[token]/reject/route.ts` | **Create** — handles reject POST; updates work-item state; consumes token. |
| `packages/web/components/runner/runner-pill-view.tsx` | **Create** — shared `<RunnerPillView dispatch={...} />` leaf used by the conversation StatusCardBlock runner-template renderer. (Brief 231 will additionally consume it on `/projects/[slug]` dispatches list — built once here for forward-compatibility.) |
| `packages/web/components/runner/dispatch-card.tsx` | **Create** — composes `<RunnerPillView>` for a single dispatch when used as the StatusCardBlock template (`metadata.cardKind === "runnerDispatch"`). No retry button in this brief (Brief 231 adds it). |
| `packages/web/components/blocks/status-card-block.tsx` | **Modify** — add the discriminator-keyed dispatch table (Record<string, RendererFn>) per D6: `runnerDispatch` → `<DispatchCard />`; missing or unknown `cardKind` → existing generic template. |
| `packages/web/e2e/runner-mobile-ux.spec.ts` | **Create** — Playwright e2e at 320×568 + 375×667 for `/review/[token]` runner-dispatch-pause: no horizontal scroll; ≥44pt on Approve/Reject/radio/toggle targets; sticky bottom action bar holds during scroll; user-facing terminology check (no slug / camelCase / table names in rendered text via `FORBIDDEN_INTERNAL_TERMS` constant). Brief 231 e2e will cover `/projects/[slug]` + `/admin` + retry-button surfaces. |
| `docs/dictionary.md` | **Modify** at brief-completion — new entries: Runner Pill, Run-On Selector, Force-Cloud Toggle, Runner-Dispatch-Pause Review-Page, Retry-Next-In-Chain. |
| `docs/architecture.md` | **No change in this brief.** Parent Brief 214 holds the L2 + L3 amendment paragraphs; Brief 222 (phase-completion) absorbs them. |
| `docs/state.md` | **Modify** — Designer + Architect checkpoints already in place; Builder adds a checkpoint at completion; Documenter wraps. |
| `docs/roadmap.md` | **Modify** — flip Brief 221 row from "not yet written" to "ready (post-Architect-Reviewer)". |

## User Experience

This section synthesises the Designer interaction spec at `docs/research/runner-mobile-ux-ux.md`. The full spec governs detailed visuals, interaction states, copy, and acceptance signals; this brief consumes it as authoritative. Below is the Architect-level summary.

- **Jobs affected:** Delegate (per-dispatch runner choice — primary), Decide (retry vs reconfigure on failure; runner reorder based on metrics), Review (the approval moment integrates work approval with runner choice), Orient (status-at-a-glance via runner pill, conversation cards, metrics card).
- **Primitives involved:**
  - `StatusCardBlock` extended with optional `metadata` field — runner-state inline cards (engine-emitted).
  - `WorkItemFormBlock` with `runner-dispatch-approval` action namespace + `InteractiveField` (select / toggle) — the "Run on:" selector + force-cloud toggle.
  - `ActionBlock` — Approve / Reject buttons.
  - `<RunnerPillView>` React leaf — admin-surface list view (NOT a ContentBlock; renders fetched `runner_dispatches` rows).
  - Existing `Shimmer` (loading), red-50 inline error pattern (errors), bottom-sticky-bar pattern (artifact mode precedent).
- **Process-owner perspective:**
  1. Push email / Telegram message says "1 dispatch awaiting approval."
  2. Tap link → `/review/[token]` opens. The page shows: work-item title, "This work will run on:" radio list (project chain default selected; degraded runners greyed with reason), force-cloud toggle (default OFF), Approve & Reject buttons sticky at bottom.
  3. Tap Approve. Page transitions to "Dispatching…" then redirects to the work-item conversation. Inline `StatusCardBlock` says "Routine started · Cloud" with the external session URL.
  4. Live updates as the runner progresses: "Routine running" → "Routine finished · PR #142 opened" with PR link + Vercel preview link.
  5. If failure: "Routine rate-limited" card + single "Retry on Managed Agent →" button. One tap, new dispatch goes out.
  6. On `/projects/[slug]`: the recent dispatches list shows the run as a pill with green status dot + outcome trail. Below: a metrics card showing 7-day health.
  7. The user never sees `local-mac-mini` / `claude-code-routine` / `attemptIndex` strings (verified by Playwright assertion in AC #11).
- **Interaction states:** loading (Shimmer), empty (hide metrics card; "no runs yet" copy on dispatches list), running (blue dot + elapsed time), succeeded (green + outcome trail), failed/rate_limited/timed_out (red + retry button), cancelled/revoked (grey + reason), no-eligible-runner (clear "configure runner" CTA), token-expired (existing copy).
- **Designer input:** `docs/research/runner-mobile-ux-ux.md` (Designer + Reviewer pass complete 2026-04-27). Spec §10 open questions answered in this brief's §"Architectural Decisions" D1-D7. Spec §12 acceptance signals feed §"Acceptance Criteria" below.

## Constraints

- **Engine-first per CLAUDE.md.** `packages/core/` holds: `StatusCardBlock` extension; `mintRunnerDispatchPause()` helper; `computeNextEligibleKindForRetry()` pure function. `src/engine/` and `packages/web/` hold the handlers, routes, and components. **Test:** could ProcessOS use the helper + retry function? Yes — both are generic.
- **No new ContentBlock types.** Per Insight-107 (Reviewer C1 on the Designer spec). Runner-state metadata extends `StatusCardBlock`; admin-list runner pill is a React leaf over fetched data, not a ContentBlock.
- **No `review_pages.kind` schema column.** Discrimination by content-blocks composition (D1).
- **One additive schema migration.** Brief 221 introduces ONE new column: `activities.contentBlock` (JSON, nullable) per D12. Migration **idx 16** (last existing = 15 with tag `0016_broad_onslaught`; Brief 220 reserves idx 16 with tag `0017_briefstate_deploy_states`); **tag `0017_activity_content_block`**. Strict-monotonic per Insight-190; resequence if a parallel session lands first. Backfill is NULL. No type changes to existing columns. The `StatusCardBlock` `metadata?` field on `packages/core/src/content-blocks.ts` is a TS type change, NOT a DB column.
- **Side-effecting function guard (Insight-180) — MANDATORY.** Every new dispatch-triggering route (`approve`, `retry-next-in-chain`) requires `stepRunId`. The retry route mints a fresh `stepRunId` for the new attempt (chain advance = new audit decision). The approve route reads the `stepRunId` from the `review_pages` row that was paired at `pauseRunnerDispatchForApproval()` time. Tests verify rejection on missing stepRunId.
- **Trust integration via existing `trust-gate.ts`.** Brief 221 does NOT introduce new trust decisions. `pauseRunnerDispatchForApproval()` consumes a pre-decided `trustAction` per Brief 215 contract; `dispatchWorkItem` consumes the post-approval `trustAction = "advance"`. No new `TrustAction` enum values.
- **Mobile-first per ADR-018 §UX-Constraint-Mapping AND Designer spec §12.** Every new or extended UI surface MUST work on a phone. Touch targets ≥44pt; no horizontal scroll at viewport widths 320–414px; sticky bottom action bar on `/review/[token]` for runner-dispatch-pause kind; external deep-links open in same window (no new tabs); user-facing copy uses §4 terminology only (no internal slugs leak).
- **No regression of bridge-dispatch's existing pause-approval flow.** Brief 212's local-mac-mini pause continues to work end-to-end. The migration from inline-TextBlock to shared helper is behaviour-preserving (same token shape, same expiry, same approve/reject contract). E2E test covers this explicitly (AC #13).
- **No regression of Brief 106 network-review pages.** The `/review/[token]` client renders the existing chat-with-Alex flow when the page contains no `runner-dispatch-approval` form. Brief 106 e2e remains green.
- **Tap-budget discipline.** ≤3 taps from notification to dispatched (notification → tap → Approve), ≤2 taps from failure card to next dispatched (card → "Retry on X"). Both verified by Playwright.
- **Reuse existing primitives.** No new credential primitive. No new audit table (`harness_decisions` continues to be the audit destination per Brief 215). No new ContentBlock types. No new viewer components — block-registry fork only.
- **No live-PTY view, no SSE-streamed inline.** Already a parent-brief Non-Goal; this brief preserves it.

## Acceptance Criteria

13 ACs targeting the parent's 10-13 band.

1. [ ] **`StatusCardBlock` metadata extension + discriminator-keyed renderer.** `packages/core/src/content-blocks.ts` `StatusCardBlock` interface — which today (verified against `packages/core/src/content-blocks.ts:57-64`) has `{ type, entityType, entityId, title, status, details? }` — adds an additive optional field `metadata?: Record<string, unknown>`. `pnpm run type-check` clean at root. Existing `StatusCardBlock` emitters (process-step status, work-item status) continue to compile without change. The renderer in `packages/web/components/blocks/status-card-block.tsx` uses a discriminator-keyed dispatch table (`Record<string, RendererFn>`) keyed on `metadata.cardKind`: `runnerDispatch` → `<RunnerDispatchTemplate>`; missing or unknown `cardKind` → existing generic template. Unit test verifies the registry pattern (NOT a cascading-if) — the test inspects the source for `else if (metadata?.X)` patterns and fails if more than ONE explicit `if (metadata?.X)` check exists outside the dispatch map.
2. [ ] **`mintRunnerDispatchPause()` shared helper produces the structured payload — generic, parameterised.** `packages/core/src/runner/mint-pause-payload.ts` exports the helper. Signature: `mintRunnerDispatchPause(input: { workItem, project, projectRunners, eligibleChain, modeRequired, stepRunId, formId, actionNamespace, copy })` — `formId`, `actionNamespace`, and `copy` are INJECTED. Unit test #1: invocation with `formId = "runner-dispatch-approval"` + Ditto copy returns `ContentBlock[]` containing exactly one TextBlock (summary), one WorkItemFormBlock (formId = `runner-dispatch-approval`, fields: kind select with eligible-only options + force-cloud toggle), one ActionBlock (Approve / Reject buttons, action IDs derived from namespace). Unit test #2: invocation with a DIFFERENT formId / namespace produces a payload with that formId / namespace — no Ditto strings hardcoded in the helper. Unit test #3: helper imports do NOT reference any `src/engine/`, `src/db/`, or Ditto-specific symbol (verified via grep on the source file).

   **Migration AC (per Constraints + D12):** the additive `activities.contentBlock` JSON nullable column lands as migration idx 16 with parity per Insight-190. Existing readers compile + run unchanged. Existing rows have `contentBlock = NULL`.
3. [ ] **Bridge-dispatch.ts pause-mint left unchanged.** Brief 212's `bridge-dispatch.ts:340-386` continues to mint a plain TextBlock review-page; the bridge daemon's approval polling is unaffected. **Why scoped out:** the bridge approval flow is display-only on `/review/[token]` today (no Approve/Reject buttons; the bridge daemon handles approval via its own poll mechanism), so migrating to the shared helper would require daemon-side changes that exceed Brief 221's scope. The shared helper from `packages/core/src/runner/mint-pause-payload.ts` is generic enough that a future brief can extend bridge-dispatch to consume it; nothing in this brief's design prevents that.
4. [ ] **`pauseRunnerDispatchForApproval()` handler routes pauses correctly + is the FIRST production caller of `dispatchWorkItem`.** New `src/engine/harness-handlers/runner-pause.ts`. Unit test matrix: (a) `trustAction = "pause"` → mints review-page, returns `{ paused: true, reviewToken }`; (b) `trustAction = "sample_pause"` → identical to (a); (c) `trustAction = "advance"` → calls `dispatchWorkItem`, returns dispatch result; (d) `trustAction = "sample_advance"` → identical to (c); (e) `trustAction = "critical"` → rejects with `criticalRejected` error pre-flight, no review-page minted. Insight-180 stepRunId guard: missing stepRunId → reject, no DB writes. Production-caller AC: a grep test verifies `dispatchWorkItem` import sites in production code (excluding `*.test.ts`) is exactly the set `{ runner-pause.ts, retry-next-in-chain route, review-token-approve route }` — no other production callers. (Pre-Brief-221 the count is 0; post-Brief-221 the count is 3.)
5. [ ] **`/review/[token]` runner-dispatch-pause renders structured form.** Playwright at iPhone SE 320×568: page loads, finds the WorkItemFormBlock with formId=`runner-dispatch-approval`, the radio group renders eligible runners as vertical-stacked options (≥44pt touch target each), force-cloud toggle is OFF by default, sticky bottom Approve/Reject bar holds position when the page scrolls (boundingBox after scroll = 0 movement of buttons). Page renders without horizontal scroll (`document.documentElement.scrollWidth ≤ clientWidth + 1`). Brief 106 chat-only review pages still render (regression test).
6. [ ] **Approve route dispatches with selected runner + force-cloud honoured + namespace-bypass safe.** `POST /api/v1/review/[token]/approve` body `{ selectedKind, forceCloud }`: validates token, READS the review-page's `contentBlocks` from DB, finds the `WorkItemFormBlock` whose `formId === "runner-dispatch-approval"`, validates `selectedKind` against the `options` array of that block's runner-kind `InteractiveField` (the server-stamped eligibility list), sets `workItems.runner_mode_required = "cloud"` IFF `forceCloud === true`, calls `dispatchWorkItem({ ..., trustAction: "advance" })`, consumes token (subsequent fetch returns "already approved"). Returns 200 with `{ dispatchId, runnerKind, externalUrl? }`. **Reject route** consumes token, updates work-item state to `triaged` (re-dispatchable), records reason. **Insight-180 guard tests:** approve route called with a stepRunId-missing payload → 400 reject; reject route same. **Namespace-bypass tests:** (a) approve POST to a token whose review-page contains no `runner-dispatch-approval` form (e.g., Brief 106 network-review token) → 400 reject; (b) approve POST whose `selectedKind` is not in the form's server-stamped `options` → 400 reject (forged eligibility). The `contentBlocks` array is the source of truth — `formId` AND `options` are both server-stamped at mint time.
7. [ ] **Engine emits `StatusCardBlock` to `activities.contentBlock` for runner-status transitions.** The `cloud-runner-fallback.ts` PR-opened + PR-merged emission paths (the most user-visible status transitions) populate `activities.contentBlock` with a `StatusCardBlock` carrying `metadata.cardKind = "runnerDispatch"`, `metadata.runnerKind`, `metadata.runnerMode`, `metadata.status`, `metadata.attemptIndex`, plus optional `externalUrl` / `prUrl`. The card is built via the engine-core helper `buildRunnerDispatchCard()` so the metadata contract is enforced in one place. Existing `description` text retained for backward compatibility. **Surface rendering deferred to Brief 231** — Brief 231 ships the `<DispatchCard />` template + the `/api/v1/work-items/:id/activities` endpoint extension that exposes the column to the work-item conversation surface. This brief verifies the engine-side write via integration test (PR-opened webhook → `activities.contentBlock` populated with the expected metadata shape).
8. [ ] **User-facing terminology — no server slug or internal-camelCase leakage on `/review/[token]`.** Playwright assertion across the runner-dispatch-pause review page: `expect(page.locator('body').textContent()).not.toMatch(/local-mac-mini|claude-code-routine|claude-managed-agent|github-action|attemptIndex|runner_mode_required|runner_override|runnerKind|runnerMode|runner_dispatches|stepRunId/i)`. User-facing labels per Designer spec §4 ("Mac mini", "Routine", "Managed Agent", "GitHub Action", "Local", "Cloud", "force cloud"). The forbidden-string list is exported as a constant in the test (`FORBIDDEN_INTERNAL_TERMS`) so Brief 231 + future briefs can extend it as new surfaces ship.
9. [ ] **Mobile-viewport e2e on `/review/[token]` at 320×568 (iPhone SE) AND 375×667 (iPhone 13 mini).** Both viewports for the runner-dispatch-pause page: (a) no horizontal scroll, (b) Approve / Reject / each radio / toggle ≥44pt height, (c) sticky bottom action bar holds during scroll (boundingBox after scroll = 0 movement), (d) external deep-links use same window if any are rendered on this page (target=_blank count = 0 on this page; runner deep-links live on conversation cards which Brief 231 e2e covers more broadly).
10. [ ] **Trust-tier semantics + Insight-180 guards end-to-end.** Integration test exercising the `pauseRunnerDispatchForApproval()` handler under all four trust tiers + sample-in/sample-out outcomes per Brief 215 AC matrix. Verifies: supervised → review-page minted; sampled-in → review-page minted; sampled-out → no review-page (advances directly); autonomous → no review-page; critical → rejected pre-flight. Force-cloud toggle on approval persists `runner_mode_required = "cloud"` on the work item BEFORE redispatch. Insight-180 guard: every dispatch-triggering route (approve, reject, the handler itself) rejects missing stepRunId. `harness_decisions` rows persisted with full audit metadata (processRunId, stepRunId, runnerKind, runnerMode, attemptIndex, externalRunId, trustTier, trustAction).
_(ACs 11-13 from earlier draft consolidated into ACs 8-10 above; admin/monitoring scope deferred to Brief 231 per §Non-Goals.)_

### Designer §12 → AC coverage map

The Designer spec at `docs/research/runner-mobile-ux-ux.md` §12 lists 10 user-facing acceptance signals. Each maps to a brief AC (or is explicitly deferred to a Non-Goal):

| Designer §12 signal | Brief 221 AC | Brief 231 (deferred) | Notes |
|---|---|---|---|
| #1 Tap budget — approval flow ≤3 from notification to dispatched | AC #9 (e2e tap-count on /review/[token]) | — | Notification entry-point itself is via existing email/Telegram link (no push infra per D7) |
| #2 Tap budget — retry flow ≤2 | — | **Brief 231** (retry-next-in-chain button) | |
| #3 First-meaningful-paint <2s + selector + Approve on iPhone SE 320×568 no-scroll | AC #5 + AC #9 | — | |
| #4 No horizontal scroll at 320–414px (approval surface) | AC #9 | **Brief 231** (other surfaces) | |
| #5 External-link deep-links open in same window | AC #9 (target=_blank count = 0 on /review/[token]) | **Brief 231** (conversation cards + admin pill) | |
| #6 Sticky bottom action bar holds during scroll on /review/[token] | AC #5 (boundingBox after scroll = 0 movement) | — | |
| #7 Status dot is the only colour-coded affordance on dispatch rows | — | **Brief 231** (admin pill rows) | |
| #8 No occurrences of server slugs in /review/[token] | AC #8 | **Brief 231** (other surfaces; same `FORBIDDEN_INTERNAL_TERMS` constant) | |
| #9 Empty-state on metrics card is hidden, not zeroed | — | **Brief 231** | |
| #10 Push-notification-driven entry ≤2 taps with no app-shell load | **Deferred — see Non-Goals + D7** | — | No push infra exists |

## Review Process

1. Spawn fresh-context Reviewer agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief + `docs/research/runner-mobile-ux-ux.md`.
2. Reviewer challenges:
   - Architectural soundness — D1 (composition discriminator), D6 (StatusCardBlock metadata fork), D8 (shared helper location in packages/core), D9 (handler position upstream of dispatcher).
   - Engine-core boundary — does anything Ditto-specific leak into `packages/core/src/runner/mint-pause-payload.ts`? (It must not — the helper takes data, returns ContentBlocks; no Self/personas/network references.)
   - Insight-107 compliance — no new ContentBlock types; no bespoke viewers; the conditional fork in `<StatusCardBlock>` renderer is bounded.
   - Insight-180 — every new side-effecting route requires stepRunId; tests verify rejection.
   - Insight-119 paired-brief integrity — does this brief carry the Designer spec's UX surface in its ACs? Are interaction states testable?
   - Brief 072 form-namespace contract honoured — does the runner-dispatch-approval form correctly bind to a kind-scoped registry token, no action-registry bypass?
   - Insight-209 manual-vs-auto-retry boundary — D5 — is the line between "user decides" and "harness handles" defensible?
   - AC band 10-13 (this brief = 13 ACs at the ceiling) — is anything liftable to a follow-on without losing brief coherence? (Edit @ desk + Today/Work pill integration are already deferred; further trimming risks splitting the surface composition.)
   - Personas test — does each surface pass the "Rob between jobs" + "Jordan demo to leadership" checks per Designer spec §2?
3. Present brief + Reviewer findings to human for approval. On approval → `/dev-builder Brief 221`.

## Smoke Test

The phase-completion smoke (Brief 222) covers end-to-end. This brief's own smoke is per-surface validated via the AC e2e suite (Playwright), plus one user-driven manual run:

```
# Manual smoke — phone-only approval round-trip
1. From iPhone 13 (or device sim 375×667), open Ditto Railway URL.
2. Pre-condition: a project (e.g., agent-crm) is configured with chain
   [claude-code-routine, claude-managed-agent]; a work item exists with
   trust tier supervised.
3. Trigger pauseRunnerDispatchForApproval() (via /dev-test util OR via the
   actual triage flow from Brief 222 if it has merged).
4. Receive review-page URL (currently via console log, future via push).
   Open on iPhone.
5. Verify: page renders without horizontal scroll. Two-radio-button selector
   visible. Force-cloud toggle visible. Approve and Reject buttons sticky at
   bottom (scroll the page; buttons stay).
6. Tap "Routine · Cloud" radio (it's already default). Tap Approve.
7. Page redirects to work-item conversation. Inline StatusCardBlock appears:
   "Routine started · Cloud" with external URL.
8. Wait. Card transitions to "Routine running" → "Routine finished · PR opened"
   with PR link + Vercel preview link.
9. Open /projects/agent-crm: recent-dispatches list shows the run as a green
   pill. Metrics card below shows 1 dispatch, 100% success rate, X seconds
   mean duration.
10. (Failure path) Force a rate-limit on a follow-up dispatch. Failed card
    surfaces "Retry on Managed Agent" button. Tap. New StatusCardBlock for
    Managed Agent appears. Verify attemptIndex = 1 in the dispatches list.
```

## After Completion

1. Update `docs/state.md` — Builder adds checkpoint at AC pass; Documenter wraps and runs retro.
2. Update `docs/roadmap.md` — flip Brief 221 row to `done`. Confirm parent Brief 214 row reflects "5 of 7 sub-briefs done" (215 + 216 + 217 + 218 + 221 = done; 220 + 222 still open).
3. Update `docs/dictionary.md` — new entries: Runner Pill, Run-On Selector, Force-Cloud Toggle, Runner-Dispatch-Pause Review-Page, Retry-Next-In-Chain.
4. Phase retrospective — what worked, what surprised, what to change. Verify that the four surfaces work for Smoke A's phone-only path (manual smoke above).
5. Architecture amendments — none in this brief. Brief 222 (phase-completion) absorbs the parent's L2 + L3 amendment paragraphs.
6. Insights — capture any design-or-build-discoveries that emerge, especially: did the form-namespace pattern (Brief 072) hold for the runner-dispatch-approval form? did the StatusCardBlock metadata fork stay bounded as new subtypes (Brief 220 deploy-status?) get added?
