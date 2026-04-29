# Brief 232: Runner-Dispatch `responseBody` Channel

**Date:** 2026-04-29
**Status:** complete-pending-human-approval (2026-04-30, post-Builder + Reviewer (PASS — 0 CRIT / 0 IMP / 3 MIN none-blocking); awaits Documenter wrap)
**Depends on:** Brief 215 (`runner_dispatches` table), Brief 223 (`workItemStatusUpdateSchema` + status webhook), Brief 228 (Project Retrofitter — the first consumer that needs structured runner responses).
**Unlocks:** Brief 228 AC #11 user-edit-safety SURFACE end-to-end (skipped-files list reaches the renderer); future runners that need to return structured payloads (e.g., post-merge linter results, deploy-runner output, branch coverage) without inventing kind-specific tables.

---

## Goal

- **Roadmap phase:** Project Onboarding & Battle-Readiness — closeout (`docs/roadmap.md` row 557 carries the open AC #11 SURFACE-partial flag).
- **Capability delivered:** A generic `responseBody: text(json)` channel on `runner_dispatches` so any runner can return a structured payload via the existing status webhook. The retrofitter is the first consumer (it surfaces the runner's `{ commitSha, actuallyChangedFiles, skippedFiles }` end-to-end so the autonomous-tier user-edit-safety renderer shows skipped paths). Other future consumers compose without schema growth.

## Context

Brief 228 (Project Retrofitter, sub-brief #3a of Brief 224) shipped the `.ditto/` substrate writer for autonomous + critical + spot_checked tiers. The retrofit prompt template at `src/engine/onboarding/retrofit-prompt.ts:84-110` instructs the runner to "Return a structured response `{ commitSha, actuallyChangedFiles, skippedFiles? }`." Reality: the `runner_dispatches` schema (`packages/core/src/db/schema.ts:1182-1220`) has NO body field — only `externalRunId`, `externalUrl`, `errorReason`, status. The status webhook validator (`packages/core/src/work-items/brief-validation.ts:39-48`) accepts `state, prUrl, error, notes, stepRunId, runnerKind, externalRunId, linkedProcessRunId` — no body channel.

Brief 228's MVP fallback in `src/engine/onboarding/retrofitter.ts:1258-1273` (`parseRunnerResponse`): heuristically pull `commitSha` out of `externalRunId` if it looks hex-shaped (7-40 chars), return empty arrays for `actuallyChangedFiles` + `skippedFiles`. This means:

- Renderer field `RetrofitPlanBlock.skippedUserTouchedFiles` (the autonomous-tier user-edit-safety SURFACE) never populates end-to-end.
- Runner-side enforcement still works (the prompt itself instructs the runner to skip user-edited files), but Ditto can't display *which* files were skipped.
- `actuallyChangedFiles` is also unreachable from the consumer.
- For runners whose `externalRunId` is NOT hex-shaped (`github-action` returns numeric run ids per `src/adapters/github-action.ts:372-379`), `commitSha` is always null even on success.

State.md (`docs/state.md:36, 46, 134, 142, 171`) flags the gap as "future-brief candidate" four times. This brief discharges that flag.

The fix is small and well-bounded: one new column, one validator extension, one webhook-route persistence write, one consumer-side reader update, one prompt-template instruction line, one runner-template (GH Action) instruction line. The channel is **opaque JSON** — the schema doesn't know what shape any particular consumer expects, which keeps the column generic across future runners and work-types. Validation happens lazily at the consumer.

## Objective

Add a generic `responseBody` JSON channel on `runner_dispatches`, thread it through the status-webhook → DB → retrofitter pipeline, and update the runner-facing instructions (prompt template + GH Action workflow template) so runners post structured responses end-to-end. Brief 228 AC #11 SURFACE flips from PARTIAL to PASS.

## Non-Goals

- **NO schema typing for `responseBody`.** The column is `text(json)` opaque storage. Per-consumer shape validation (e.g., the retrofitter's `{commitSha, actuallyChangedFiles, skippedFiles}` shape) happens at the read site — not in Drizzle, not in the webhook validator. Future consumers that want their own structured shape can validate at their own seam.
- **NO modification of the existing `state, prUrl, error, notes, runnerKind, externalRunId, linkedProcessRunId, stepRunId` fields on the webhook payload.** Backwards-compatible additive only.
- **NO new runner_dispatches columns beyond `responseBody`.** State.md mentions `actuallyChangedFiles` + `skippedFiles` as goals — those live INSIDE the JSON `responseBody`, not as separate columns.
- **NO new TrustAction enum values, no new memoryScopeTypeValues, no new briefStateValues, no new RunnerDispatchEvent values.** This is a payload extension, not a state-machine change.
- **NO new runner adapter dispatch logic.** Adapters already have their dispatch + status-fetch surfaces; the runner's `responseBody` arrives via the runner's POST to the existing status webhook (the same channel the GH Action template at `docs/runner-templates/dispatch-coding-work.yml:122-130` already uses for `state, prUrl, runnerKind, externalRunId, stepRunId`). No adapter-internal change.
- **NO change to the supervised-tier per-file approval flow** (Brief 229's territory, Designer-blocked).
- **NO change to the local-mac-mini bridge dispatch.** Local bridge is synchronous (`bridge.dispatch` returns the result inline per Brief 212); it has no callback path. The retrofitter's local-runner consumer reads results from the bridge's return value, not from `runner_dispatches.responseBody`. This brief's `responseBody` channel is for cloud runners only (`claude-code-routine`, `claude-managed-agent`, `github-action`).
- **NO retroactive backfill of historical dispatches.** Existing rows have `responseBody = NULL`; the consumer's fallback path (parse `commitSha` from `externalRunId` if hex-shaped, default empty arrays) preserves Brief 228's MVP behaviour for legacy rows.
- **NO end-to-end smoke against a real GitHub Action.** Brief 228 already deferred its own E2E smoke (AC #11). This brief's smoke is the integration test that exercises the full webhook → DB → retrofitter parse pipeline against a fixture; live runner smoke is downstream.

## Inputs

1. `docs/state.md:36, 46, 134, 142, 171` — the four explicit "future-brief candidate" flags this brief discharges.
2. `docs/briefs/complete/228-project-retrofitter.md` — Brief 228 (parent of AC #11 SURFACE-partial). The retrofitter's `verify-commit` step is the first consumer of `responseBody`.
3. `packages/core/src/db/schema.ts:1182-1220` — `runner_dispatches` table (the schema this brief extends).
4. `packages/core/src/work-items/brief-validation.ts:39-48` — `workItemStatusUpdateSchema` (the validator this brief extends).
5. `packages/web/app/api/v1/work-items/[id]/status/route.ts:266-305` — webhook route's existing `runner_dispatches` transition write (the persistence site this brief extends).
6. `src/engine/onboarding/retrofitter.ts:1158-1273` — `parseRunnerResponse` (the consumer this brief upgrades).
7. `src/engine/onboarding/retrofit-prompt.ts:84-110` — the prompt template's "Return a structured response" instruction (must add explicit "POST in `responseBody` field" wire instruction).
8. `docs/runner-templates/dispatch-coding-work.yml:107-130` — GH Action template's curl-back POST body (must add the `responseBody` field to the JSON it posts).
9. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — the webhook accepts optional `stepRunId` per the bounded-waiver path; this brief preserves that pattern (no new guard semantics).
10. `docs/insights/190-migration-journal-concurrency.md` + `docs/insights/216-drizzle-prefix-collision-recovery.md` — Drizzle migration discipline (Builder grep-verifies next-free idx + filename prefix at session start).
11. `drizzle/meta/_journal.json` — current state: idx=16, latest tag `0017_activity_content_block`. Brief 232 reserves idx=17 with prefix `0018_*` (next free).
12. `src/adapters/github-action.ts:240-371` — GH Action adapter (read-only reference; no edits required — the runner POSTs back through the existing status webhook, not through the adapter).
13. `src/engine/runner-status-handlers/{routine,managed-agent,github-action}.ts` — bearer-verification helpers consumed by the webhook route. Read-only reference (this brief doesn't touch the verifier path; only the post-verification persistence write).

## Constraints

- **Engine-first per CLAUDE.md.** Schema (`runner_dispatches`) + validator (`workItemStatusUpdateSchema`) are engine primitives — both already live in `packages/core/`. Modify them there. Re-export discipline preserved (existing pattern).

- **Could ProcessOS use this?** YES for the schema column and the Zod validator (any runner-callback architecture wants a generic body channel). NO for the retrofitter consumer (`parseRunnerResponse` is Ditto-specific — it parses the retrofitter's payload shape) and NO for the prompt-template wire instruction (Ditto-specific). Split: schema + validator → core; consumer + prompt + runner-template → product.

- **`responseBody` is `text` storing JSON** (Drizzle's `mode: "json"` accepted). Nullable. No CHECK constraint. No default. Per-consumer Zod validation at read time, not at write time.

- **Validator extension is additive + opaque.** Zod schema adds `responseBody: z.record(z.unknown()).optional()`. The `z.record(z.unknown())` constrains the payload to a JSON object at the wire boundary so non-object scalars/arrays/strings are rejected (defensive against malformed runner posts per Insight-017); per-shape validation still happens lazily at the consumer (the retrofitter validates its specific `{commitSha?, actuallyChangedFiles?, skippedFiles?}` shape). The Architect specifically REJECTS the looser `z.unknown().optional()` choice — the wire boundary is the right place to enforce object-ness, and the consumer's defensive read should never see scalars/arrays.

- **Webhook route persists `responseBody` only when a matching `runner_dispatches` row is found** (the existing flow at `route.ts:266-305` already gates on `data.runnerKind && data.externalRunId` matching a dispatch row — `responseBody` is written ONLY inside that same guard, not on orphan callbacks). If no dispatch is matched, `responseBody` is silently dropped (consistent with how `errorReason`, `finishedAt`, `startedAt` are dropped today). The `activities` audit row records the attempt.

- **Webhook route's transaction discipline preserved.** The existing `db.transaction((tx) => { … })` at `route.ts:252-335` is the ONLY mutation site; `responseBody` write happens inside that transaction.

- **`parseRunnerResponse` reads `responseBody` first, falls back to legacy parse second.** Existing legacy heuristic (parse hex from `externalRunId`) is preserved verbatim for rows where `responseBody` is null — covers historical dispatches + legacy runners that haven't been re-templated yet. Order: (1) `responseBody.commitSha` if present, else (2) hex-parse from `externalRunId`. `actuallyChangedFiles` + `skippedFiles` come ONLY from `responseBody` (no legacy fallback — they were unreachable before this brief, and that's fine).

- **Prompt template explicitly instructs runner to POST `responseBody` in the callback body.** Edit `src/engine/onboarding/retrofit-prompt.ts:100-110` Response-shape section: explicitly say "POST this object in the `responseBody` field of your callback to `<callback_url>`" and reference the webhook payload shape verbatim (`{state: 'shipped', runnerKind, externalRunId, stepRunId, responseBody: {commitSha, actuallyChangedFiles, skippedFiles?}}`). The previous instruction "Return a structured response" was wire-ambiguous.

- **Cloud-runner callback-stanza composer updated** (Reviewer I1 — `claude-code-routine` + `claude-managed-agent` wire). `src/adapters/cloud-runner-prompt.ts:154-181` `buildInternalCallbackSection` is the function that authors the in-prompt `curl -X POST` stanza for routine + managed-agent runners (NOT the GH Action template — github-action uses the YAML template instead). The stanza currently posts `state, runnerKind, externalRunId, stepRunId, prUrl, error`; this brief extends the stanza with an optional `responseBody` field shaped as a free-form JSON object whose CONTENT is determined by the runner's task (the retrofitter's prompt-template instructions tell the runner what keys to put inside `responseBody`). The composer doesn't know retrofitter-specific keys; it just adds the wire-level placeholder and a one-line instruction "Include `responseBody` if your task asks you to return structured output."

- **GH Action runner template updated.** `docs/runner-templates/dispatch-coding-work.yml:107-130` curl-back step gains a `responseBody` field constructed from runner-side env vars (e.g., `COMMIT_SHA`, `ACTUALLY_CHANGED_FILES`, `SKIPPED_FILES` — the runner's work step writes them to `$GITHUB_ENV` before the callback step, mirroring the existing `PR_URL` pattern at lines 118-121). The template stays a TEMPLATE — Ditto doesn't auto-commit it into target repos; the retrofitter's `.ditto/` writes are unaffected. `docs/runner-templates/README.md` gains a one-line mention of the env vars users must populate so their work step's outputs flow back.

- **Drizzle migration discipline (Insights 190 + 216).** Builder runs `drizzle-kit generate` at session start, verifies the journal idx and filename prefix don't collide (current state: journal idx=16, latest tag `0017_*`; expected: idx=17, tag `0018_*`). If `drizzle-kit generate` produces a collision-prefixed filename, apply Insight-216's rename procedure (rename SQL + snapshot, edit `_journal.json` `tag`, leave `idx` alone).

- **Insight-180 guard discipline.** No NEW side-effecting functions added. The webhook handler already bears Insight-180's bounded-waiver pattern (`route.ts:249, 327` — `guardWaived = !data.stepRunId`); writing `responseBody` is part of the same audit transaction. `parseRunnerResponse` is a pure read; no guard needed. **No new external API integrations**; no spike test required (Insight-208).

- **Security envelope unchanged.** The `responseBody` field arrives over the same bearer-verified webhook channel; the same trust boundary applies (project bearer OR ephemeral per-dispatch token). No new exposure surface. Insight-017 review: a malicious runner could write garbage to `responseBody` — that's already true for `prUrl, error, notes`. Consumer-side validation (the retrofitter's read site) treats unexpected shapes as missing data and falls back to legacy parse + empty arrays. No `responseBody` content is ever rendered as raw HTML; the retrofitter renders into typed `RetrofitPlanBlock` fields whose React renderer escapes by default.

- **Test discipline.** New tests at four sites: (a) webhook route persists `responseBody` to the matched dispatch row when present; (b) webhook route silently drops `responseBody` when no dispatch matched; (c) `parseRunnerResponse` reads from `dispatch.responseBody` and reaches the renderer; (d) `parseRunnerResponse` falls back to legacy hex-parse when `responseBody` is null. Plus type-check + existing-suite-non-regression.

- **Reference docs touched** (Insight-043 — Architect owns):
  - `docs/state.md` — Builder checkpoint after work; Documenter wraps.
  - `docs/roadmap.md` — annotate Brief 228 row 557 to flip the AC #11 SURFACE flag from PARTIAL → PASS.
  - `docs/briefs/complete/228-project-retrofitter.md` — DO NOT edit the brief itself (already complete + moved); the AC-status flip lives in state.md + roadmap.
  - `docs/dictionary.md` — one new entry: `Runner Response Body` (the JSON channel + the convention).
  - `docs/architecture.md` — NOT updated (no architectural seam; this is a payload extension on an existing seam).
  - No new ADR (no architecturally significant decision; an opaque-JSON column is the same pattern as `activities.metadata`, `harnessDecisions.reviewDetails`, etc.).

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Opaque-JSON column on a side-effect-audit table | Existing pattern: `activities.metadata`, `harnessDecisions.reviewDetails`, `processRuns.inputs`, `workItems.context` (all `text(json)` JSON in `packages/core/src/db/schema.ts`) | pattern (self-reuse) | Five existing precedents in the same schema; consistent with how Ditto stores runner/handler-specific payloads. |
| Webhook payload extension as backwards-compatible additive Zod field | Existing pattern: Brief 220's `linkedProcessRunId` and Brief 217's `runnerKind` were both added the same way to `workItemStatusUpdateSchema` (`packages/core/src/work-items/brief-validation.ts`) | pattern (self-reuse) | Same author intent (extend the runner-callback wire without breaking existing runners); same shape. |
| Lazy consumer-side validation | ADR-003 (memory metadata) + Brief 228's `RetrofitPlanBlock` consumer | pattern (self-reuse) | Avoids over-typing the wire; lets each consumer evolve its payload shape independently. |
| Hex-parse legacy fallback | Brief 228's `parseRunnerResponse` MVP (`src/engine/onboarding/retrofitter.ts:1258-1273`) | depend (existing) | Already shipping; the brief preserves it as the legacy path so historical dispatches keep parsing. |
| Drizzle migration discipline | Insights 190 + 216 | depend (existing) | Standard Ditto pre-flight; Builder grep-verifies. |
| Status webhook persistence-inside-existing-transaction | Existing webhook route `route.ts:252-335` | depend (existing) | Same transactional envelope already protects work_items + runner_dispatches + activities writes; `responseBody` write is the fourth additive line inside the same `tx`. |
| Runner template wire convention (POST callback with structured fields) | Existing template `docs/runner-templates/dispatch-coding-work.yml:107-130` | depend (existing) | The template already POSTs `state, runnerKind, externalRunId, stepRunId, prUrl?` — `responseBody` is the seventh field. |
| Prompt template "POST this in field X" instruction shape | Brief 228's prompt template instructions (the same file, just adding the wire detail the original draft elided) | adopt (existing) | Same author voice + structure; the gap was an oversight in Brief 228, not a different design call. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | **Modify (engine):** add `responseBody: text("response_body", { mode: "json" })` (nullable) to `runnerDispatches` between `errorReason` and `stepRunId`. No index. |
| `drizzle/0018_<slug>.sql` | **Create:** `ALTER TABLE runner_dispatches ADD COLUMN response_body text;` (Builder runs `drizzle-kit generate` to produce the file + snapshot; Insight-216 rename procedure if a prefix collision occurs). |
| `drizzle/meta/_journal.json` | **Modify:** appended idx=17 entry with tag `0018_<slug>`. |
| `drizzle/meta/0018_snapshot.json` | **Create:** generated by drizzle-kit. |
| `packages/core/src/work-items/brief-validation.ts` | **Modify (engine):** extend `workItemStatusUpdateSchema` with `responseBody: z.unknown().optional()` (or `z.record(z.unknown()).optional()` — Builder's call). Re-export type carries through. |
| `packages/web/app/api/v1/work-items/[id]/status/route.ts` | **Modify (product):** inside the existing `if (data.runnerKind && data.externalRunId) { … }` block at lines 266-305, when `data.responseBody !== undefined` AND a dispatch row was matched, include `responseBody: data.responseBody` in the `tx.update(runnerDispatches).set({ … })` payload. No structural change to the transaction envelope. |
| `src/engine/onboarding/retrofitter.ts` | **Modify (product):** `parseRunnerResponse` (lines 1258-1273) signature gains the dispatch row's `responseBody` field; reads `responseBody.commitSha / .actuallyChangedFiles / .skippedFiles` first; falls back to legacy hex-parse for `commitSha` only when `responseBody` is null OR malformed (non-object / missing keys / wrong types). The verify-commit handler's `select().from(runnerDispatches)` already returns all columns by default (Drizzle implicit-all) — no SELECT signature change needed; the new column flows through automatically once it exists in the schema. |
| `src/engine/onboarding/retrofit-prompt.ts` | **Modify (product):** lines 84 + 100-110 — change "Return a structured response" → "POST a structured response in the `responseBody` field of your callback to `<callback_url>`" + verbatim example body shape. |
| `src/adapters/cloud-runner-prompt.ts` | **Modify (product):** `buildInternalCallbackSection` (lines 154-181) — extend the curl-back stanza's `-d '{…}'` body with an optional `responseBody` field placeholder + a one-line preamble "Include `responseBody` if your task asks you to return structured output." Generic — doesn't bake in retrofitter-specific keys. |
| `docs/runner-templates/dispatch-coding-work.yml` | **Modify (product):** lines 107-130 — extend the curl-back POST body with a `responseBody` field constructed from runner-side env vars (`COMMIT_SHA`, `ACTUALLY_CHANGED_FILES`, `SKIPPED_FILES`); mirror the `PR_URL_FIELD` optional-field pattern at lines 118-121. |
| `docs/runner-templates/README.md` | **Modify (product):** one-line addition under the existing dispatch-coding-work section noting the new env-var convention (`COMMIT_SHA` / `ACTUALLY_CHANGED_FILES` / `SKIPPED_FILES` flow back to Ditto via `responseBody`). |
| `packages/web/app/api/v1/work-items/[id]/status/__tests__/route.test.ts` | **Modify:** add a test that POSTs with `responseBody` and asserts the matched dispatch row's `responseBody` column contains the JSON. Add a test that POSTs `responseBody` with no matching dispatch and asserts no orphan write + no error. |
| `src/engine/onboarding/retrofitter.test.ts` (or sibling test file — Builder grep-verifies) | **Modify:** add tests covering `parseRunnerResponse` reading from `responseBody`, falling back to hex-parse legacy, and the renderer integration showing `skippedUserTouchedFiles` end-to-end. |
| `docs/dictionary.md` | **Modify:** one new entry under "Brief 232 (Runner Dispatch Response Body)" section: `Runner Response Body`. |
| `docs/state.md` | **Modify (Builder checkpoint at end of session):** capture column added, migration idx, AC #11 SURFACE flag flipped, dictionary entry added. |
| `docs/roadmap.md` | **Modify (Documenter wrap):** annotate the Brief 228 entry (find by content — `Brief 228 — Project Retrofitter`, currently at row ~557 but line numbers drift across sessions) with `[AC #11 SURFACE: PASS via Brief 232]`. |

## User Experience

- **Jobs affected:** **Review** (the autonomous-tier user audits the diff after retrofit — now sees `skippedUserTouchedFiles` rendered when the runner skipped any files).
- **Primitives involved:** the existing `RetrofitPlanBlock` renderer (no new block type, no new component). The `skippedUserTouchedFiles` field already exists on the type and the renderer already displays it; this brief just causes the field to populate.
- **Process-owner perspective:** "If the retrofitter detected I edited `.ditto/skills.json` between the last retrofit and this one, the surface should now tell me which files it skipped — instead of silently skipping them on the runner side and leaving me wondering."
- **Interaction states:** unchanged — `RetrofitPlanBlock` already covers loading / pending / failed / committed / failed states; `skippedUserTouchedFiles` is rendered inside the `committed` state when non-empty (existing renderer code path).
- **Designer input:** Not invoked — no new surface, no new UX, no new copy. The renderer already has the field; this brief plumbs the data to it. If the Builder discovers the renderer's `skippedUserTouchedFiles` rendering is awkward when it actually populates (e.g., long path lists, no truncation), they flag for an Architect/Designer pass — but do NOT block on it. Default: ship as-is.

## Acceptance Criteria

1. [ ] **Schema:** `runner_dispatches.response_body` column exists (`text`, nullable, no default). Verified by `drizzle-kit introspect` or by reading the latest snapshot.
2. [ ] **Migration:** new SQL file at `drizzle/0018_<slug>.sql` containing `ALTER TABLE runner_dispatches ADD COLUMN response_body text;`. Journal idx=17. No prefix collision (Insight-216).
3. [ ] **Validator:** `workItemStatusUpdateSchema.parse({…, responseBody: {a: 1}})` succeeds; `workItemStatusUpdateSchema.parse({…})` (without `responseBody`) succeeds (backwards compat). Type `WorkItemStatusUpdateParsed` exposes optional `responseBody` field.
4. [ ] **Webhook persists when dispatch matched:** POSTing to `/api/v1/work-items/:id/status` with valid bearer + `runnerKind` + `externalRunId` matching an existing dispatch + `responseBody: {commitSha: 'abc123', actuallyChangedFiles: ['x.txt'], skippedFiles: ['y.txt']}` results in the dispatch row's `response_body` column equal to that JSON object after the request returns 200.
5. [ ] **Webhook silently drops when dispatch not matched:** POSTing the same payload with `runnerKind` + `externalRunId` that DON'T match any dispatch row succeeds (200) and no orphan dispatch row is created. The `activities` row is still written (existing behaviour).
6. [ ] **Webhook backwards-compat:** POSTing without `responseBody` (existing payload shape) succeeds 200; the dispatch row's `response_body` stays NULL.
7. [ ] **Retrofitter consumer reads `responseBody` first:** when `dispatch.responseBody = {commitSha: 'X', actuallyChangedFiles: ['a','b'], skippedFiles: ['c']}`, the `parseRunnerResponse` function returns those exact values; the resulting `RetrofitPlanBlock` carries `commitSha = 'X'` and `skippedUserTouchedFiles = ['c']`.
8. [ ] **Retrofitter legacy fallback preserved:** when `dispatch.responseBody = null` AND `dispatch.externalRunId = '7a3b1c9'` (hex-shaped), `parseRunnerResponse` returns `{commitSha: '7a3b1c9', actuallyChangedFiles: [], skippedFiles: undefined}` (Brief 228 MVP behaviour preserved verbatim).
9. [ ] **Retrofitter null fallback:** when `dispatch.responseBody = null` AND `externalRunId` is non-hex (e.g., `'gh-action-12345'`), `parseRunnerResponse` returns `{commitSha: null, actuallyChangedFiles: [], skippedFiles: undefined}`.
10. [ ] **Retrofit prompt template wires `responseBody` explicitly:** `composeRetrofitPrompt({…})` output prompt string contains the literal substring `"responseBody"` AND the substring `"callback"` (or equivalent — Builder picks the precise wording). The instruction is unambiguous about wire location (POST body field name).
11. [ ] **Cloud-runner callback stanza wires `responseBody`:** `buildInternalCallbackSection({…})` output (a private function — Builder may need to expose for test or assert via `composePrompt(...)` happy-path) contains the literal substring `"responseBody"` in the curl `-d` body shape, and the preamble line about including it when the task asks for structured output. Existing `composePrompt` tests at `src/adapters/cloud-runner-prompt.test.ts` extended.
12. [ ] **GH Action runner template POSTs `responseBody`:** `docs/runner-templates/dispatch-coding-work.yml` curl-back step's `-d` body includes a `\"responseBody\":` field constructed from `$COMMIT_SHA`, `$ACTUALLY_CHANGED_FILES`, `$SKIPPED_FILES` env vars. `bash -n` syntax check on the file passes (existing test infrastructure at `docs/runner-templates/deploy-prod-setup.test.ts` may extend or sibling test added).
13. [ ] **Malformed `responseBody` falls back gracefully:** when `dispatch.responseBody = "garbage"` (string — note this is currently rejected at the wire boundary by `z.record(z.unknown())`, but legacy/historical rows could exist with arbitrary JSON) OR `dispatch.responseBody = {wrongKey: 1}` (missing all expected keys), `parseRunnerResponse` returns the legacy fallback shape (`commitSha = null` or hex-parsed from `externalRunId`, `actuallyChangedFiles = []`, `skippedFiles = undefined`) WITHOUT throwing. Insight-017 defensive-read coverage.
14. [ ] **No new TrustAction / memoryScopeTypeValues / briefStateValues / RunnerDispatchEvent enum values introduced.** Grep-verify enum union types in `packages/core/src/db/schema.ts` are unchanged.
15. [ ] **Quality gates:** root `pnpm run type-check` 0 errors from this brief. core `pnpm exec tsc --noEmit` 0 errors from this brief. Full suite `pnpm test` no regressions (pre-existing failures preserved; this brief adds positive tests). Brief 228's existing tests still pass (no regression in legacy parse path).

## Review Process

1. Spawn fresh-context Reviewer with `docs/architecture.md` + `docs/review-checklist.md` + this brief.
2. Reviewer specifically checks:
   - Brief is sized within Insight-004 (8-17 ACs; this brief has 13).
   - Engine-vs-product split correct (schema + validator → core; consumer + prompt + template → product).
   - Backwards compat preserved at every seam (schema column nullable; validator field optional; consumer falls back to legacy).
   - Insight-180 guard discipline respected (no new side-effecting functions; existing bounded-waiver pattern unchanged).
   - Insights 190 + 216 (Drizzle journal + prefix-collision) called out as Builder pre-flight.
   - No NEW exposure surface beyond the existing webhook bearer envelope (Insight-017).
   - `responseBody` is opaque JSON (consumer-validated, not wire-validated) — the brief justifies this vs a typed shape.
   - Brief 228's AC #11 SURFACE flag is genuinely discharged by this brief's ACs (specifically AC #7 — `skippedUserTouchedFiles` populates end-to-end).
   - No drift on Brief 220's `briefState` state machine (deploying / deployed / deploy_failed paths unaffected).
   - No drift on Brief 221's `StatusCardBlock` / `cardKind` discriminator (this brief does not touch the card layer).
   - The prompt-template + runner-template edits are coherent (the runner is told the same shape in both places).
3. Present brief + review findings to human for approval.

## Smoke Test

```bash
# 1. Generate migration + verify.
pnpm exec drizzle-kit generate
ls drizzle/0018_*.sql              # exactly one file
ls drizzle/0018_*.sql | wc -l      # 1
cat drizzle/meta/_journal.json | jq '.entries | last'   # idx 17, tag 0018_*

# 2. Type-check.
pnpm run type-check
( cd packages/core && pnpm exec tsc --noEmit )

# 3. Tests.
pnpm test -- --run packages/web/app/api/v1/work-items/\[id\]/status
pnpm test -- --run src/engine/onboarding/retrofitter

# 4. Manual smoke against the webhook (sqlite in-memory or test DB):
#    POST /api/v1/work-items/<wi>/status with bearer + runnerKind + externalRunId
#    matching a real dispatch + responseBody JSON; SELECT response_body from
#    runner_dispatches; expect the JSON round-tripped.

# 5. Verify the retrofitter renders a skippedUserTouchedFiles list when
#    responseBody.skippedFiles is non-empty (component test in
#    packages/web/components/blocks/retrofit-plan-block.test.tsx if it exists,
#    otherwise integration through the verify-commit handler).
```

## Pre-Build Verification (Builder responsibility)

Before editing `retrofit-prompt.ts`, the Builder MUST grep-verify how the runner actually receives the retrofitter's task instructions. The Architect's brief-write inspection found:

- `workItem.content` is the work-item TITLE (`"Retrofit plan for <slug>"` — `retrofitter.ts:710-714`), NOT the retrofit prompt body.
- `retrofitPrompt` lives in `workItem.context.retrofitPrompt` (`retrofitter.ts:872`, written but not yet read).
- Cloud runners pass `workItemBody: workItem.content` to `composePrompt` (`claude-code-routine.ts:190`, `claude-managed-agent.ts:261`) — so the runner currently sees ONLY the title.
- This means the retrofit task instructions (including the response-shape directive Brief 232 is editing) may not actually reach the runner today via the routine/managed-agent path.

**Decision rule for Builder:**
- If the retrofit-prompt-not-reaching-runner gap is confirmed via grep, this is a **Brief 228 implementation gap**, NOT a Brief 232 problem. Brief 232's edit to `retrofit-prompt.ts` is still correct (the gap may be fixed in a separate brief that wires `workItem.context.retrofitPrompt` into the cloud-runner `workItemBody`). **Flag the gap in the Builder handoff for Architect / Brief-228-followup; do NOT fix it in Brief 232.** (Insight-043: Builder flags, Architect fixes.)
- The brief's edits to `cloud-runner-prompt.ts` `buildInternalCallbackSection` ARE in Brief 232's scope because they are about the WIRE shape (callback stanza), not the TASK shape — the wire-level `responseBody` field belongs in the generic callback stanza for any task that wants to use it.

## After Completion

1. Builder updates `docs/state.md` with: column added, migration idx, validator extension, webhook persistence write, retrofitter consumer upgrade, prompt + template + cloud-runner-prompt instruction edits, AC #11 SURFACE flip, and the Brief 228 implementation-gap flag (if confirmed).
2. Documenter wraps: moves brief to `docs/briefs/complete/`, flips the Brief 228 row in `docs/roadmap.md` to mark AC #11 SURFACE PASS, captures any insights that emerged.
3. No ADR needed (no architectural seam).
4. Phase retrospective: did the opaque-JSON column choice hold up, or did Builder discover a per-shape typing pressure? If the latter, capture as an insight ("runner-callback payload typing — opaque vs discriminated").
5. **Reference doc drift flagged for Architect (Insight-043):** if Builder discovers any of (a) the prompt-template instruction wording is awkward, (b) the renderer's `skippedUserTouchedFiles` display needs UX polish, (c) any cloud-runner adapter has its own status-fetch path that should also surface `responseBody` (not just the webhook callback path), (d) the retrofit-prompt-not-reaching-runner Brief 228 gap is real — flag in handoff, do not fix.

---

## Reviewer Pass Summary (2026-04-29)

Fresh-context Reviewer ran with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Insights 180/190/216/004 + the codebase surface. **Verdict: PASS WITH FLAGS.** 0 CRITICAL. 5 IMPORTANT, all fixed in-session before promotion to `Status: ready`. 14 MINOR — all verified-no-action.

- **IMPORTANT fixes applied:**
  - **I1 — Wire-coverage gap on routine + managed-agent runners.** Original brief only updated the GH Action YAML template. Reviewer correctly flagged that `claude-code-routine` and `claude-managed-agent` compose their callback stanza in `src/adapters/cloud-runner-prompt.ts:154-181` (`buildInternalCallbackSection`); without an edit there, those runners' `responseBody` channel never reaches the wire. Brief now adds `cloud-runner-prompt.ts` to §What Changes + §Constraints + new AC #11 (cloud-runner callback stanza). The cloud-runner-prompt edit is generic (wire placeholder + preamble) — retrofitter-specific keys still come from `retrofit-prompt.ts`.
  - **I2 — Retrofit-prompt vs cloud-runner-prompt path.** Reviewer asked Builder to grep-verify how the retrofit prompt actually reaches the cloud runner. Architect inspected and confirmed: `workItem.content` is the title only (`retrofitter.ts:710-714`); `workItem.context.retrofitPrompt` is written but cloud runners pass `workItemBody: workItem.content` to `composePrompt` (`claude-code-routine.ts:190`, `claude-managed-agent.ts:261`) — meaning the retrofit task instructions may not reach the runner today via routine/managed-agent. Brief now has a §Pre-Build Verification section flagging this as a **Brief 228 implementation gap** (NOT Brief 232's territory) — Builder grep-verifies, flags-don't-fix, Architect picks up in a follow-on brief if confirmed.
  - **I3 — Validator pinned to `z.record(z.unknown()).optional()`.** Original brief deferred to Builder's choice between `z.unknown()` and `z.record(z.unknown())`. Architect REJECTS the looser option per Insight-017: object-ness is the right wire-boundary contract, scalars/arrays/strings are rejected at the validator. Constraint section pinned.
  - **I4 — Drizzle SELECT clarification.** Original §What Changes line said "the dispatch row's SELECT… gains `responseBody` in the column list." Reviewer correctly noted Drizzle's `select().from(table)` is implicit-all, so the new column flows through automatically once it exists in the schema. Cleaned up.
  - **I5 — Malformed `responseBody` defensive-read AC added.** Original brief tested null + present-and-valid. Reviewer flagged the defensive-read gap (Insight-017). New AC #13: when `responseBody = "garbage"` (string) or `{wrongKey: 1}`, `parseRunnerResponse` returns the legacy fallback shape without throwing.
- **MINOR — verified-no-action:** brief number 232 free, Drizzle journal idx=17 free (latest tag `0017_activity_content_block`), Insight-180 unchanged (no new side-effecting functions), Brief 220 + Brief 221 non-interference (no `briefState` / `cardKind` touch), opaque-JSON column choice fits 5 existing precedents, no trust-tier conditional handling needed, Insight-004 sizing 13→15 ACs still on-target, engine-product split clean, backwards-compat preserved at every seam, empty-arrays-on-null legacy default sound, no architecture.md amendment, smoke test format adequate, README mention added at IMP-1 fix.
- **Reviewer's independent take on the opaque-JSON choice:** sound — five precedents (`activities.metadata`, `harnessDecisions.reviewDetails`, `processRuns.inputs`, `workItems.context`, `memories.appliedProjectIds`).
- **Reviewer's independent take on Brief 228 AC #11 discharge:** AC #7 of THIS brief — `skippedUserTouchedFiles` populates end-to-end via `responseBody.skippedFiles` — is the explicit discharge. Sound.

