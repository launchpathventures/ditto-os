# Brief 233: Runner Prompt-Body Channel — Thread `workItem.context.runnerPromptBody` into Cloud Runners

**Date:** 2026-04-30
**Status:** ready (post-Reviewer; PASS WITH FLAGS — 0 CRIT / 2 IMP all fixed in-session / 5 MIN none-blocking; awaits human approval)
**Depends on:** Brief 215 (cloud-runner adapter registry), Brief 216/217/218 (the three cloud-runner adapters), Brief 228 (Project Retrofitter — the first consumer that writes a structured prompt body distinct from the work-item title).
**Unlocks:** Brief 228's retrofit-task instructions actually reach cloud runners (today they don't — see §Context). Future task types that need a prompt body distinct from the work-item title (analyser-driven re-runs, structured deploy directives, multi-stage refactor prompts) can compose without each writing its own ad-hoc field.

---

## Goal

- **Roadmap phase:** Project Onboarding & Battle-Readiness — closeout (the second of two follow-on briefs that discharge Brief 228 implementation gaps; sibling to Brief 232).
- **Capability delivered:** A generic `runnerPromptBody?: string` field on `workItem.context` — when present, all three cloud-runner adapters (`claude-code-routine`, `claude-managed-agent`, `github-action`) use it as the prompt body sent to the LLM session, falling back to `workItem.content` when absent. The retrofitter (Brief 228) is the first consumer; it renames its existing-but-unread `retrofitPrompt` field to the generic `runnerPromptBody` key. Other future consumers compose without schema growth or per-adapter knowledge.

## Context

Brief 228 (Project Retrofitter) ships a structured retrofit prompt via `composeRetrofitPrompt(...)` (`src/engine/onboarding/retrofit-prompt.ts`). The retrofitter writes this prompt to `workItem.context.retrofitPrompt` (`src/engine/onboarding/retrofitter.ts:872, 900`) — but **no cloud-runner adapter ever reads it**. All three cloud-runner adapters pass `workItem.content` (the work-item title — `"Retrofit plan for <slug>"`) as the runner's prompt body:

- `src/adapters/claude-code-routine.ts:189-190` — `composePrompt({workItemBody: workItem.content, ...})`
- `src/adapters/claude-managed-agent.ts:260-261` — `composePrompt({workItemBody: workItem.content, ...})`
- `src/adapters/github-action.ts:260` — `work_item_body: truncate(workItem.content, 50 * 1024)`

The result: the retrofit task instructions (file payload references, the commit/push protocol, the response-shape directive Brief 232 just added, the boundary rules from ADR-043) **never reach the cloud runner**. The runner sees only the title `"Retrofit plan for <project-slug>"` and has to guess what to do. This is the gap Brief 232's Builder pre-flight CONFIRMED + flagged for follow-on (`docs/state.md:Builder — Brief 232 implemented`).

This brief threads the prompt body end-to-end with a minimum-footprint generic mechanism: a single optional context field, a single helper, three adapter call-sites, no schema change, no migration.

## Objective

Add a generic `runnerPromptBody?: string` convention on `workItem.context`; thread it through the three cloud-runner adapters with backwards-compat fallback to `workItem.content`; rename the retrofitter's existing-but-unread `retrofitPrompt` field to `runnerPromptBody` so its prompt actually reaches the runner. Brief 228 task instructions arrive at the cloud runner end-to-end.

## Non-Goals

- **NO local-mac-mini retrofit support.** The local bridge (`src/adapters/local-mac-mini.ts:120-138`) uses `workItem.content` as literal tmux keystrokes (`tmux.send`) or bash exec args (`exec`) — not as an LLM prompt. Retrofitting via local-mac-mini would require a different invocation pattern (spawning Claude Code locally with the prompt) that is genuinely out of scope here. Captured in §Open Question for the human.
- **NO `workItem.context` schema change** — `context` is already an opaque-JSON `text(json)` column on `workItems`. The convention is documented + type-helped at the read site; the column shape is unchanged.
- **NO new runner adapters.** Only the existing three cloud-runner adapters (Briefs 216/217/218) and the retrofitter writer site change.
- **NO new validator extensions.** This is internal harness state, not wire-bound — `runnerPromptBody` is written by Ditto's own handlers and read by Ditto's own adapters. No webhook payload accepts it, so no `workItemBriefInputSchema` / `workItemStatusUpdateSchema` extension.
- **NO new TrustAction / memoryScopeTypeValues / briefStateValues / RunnerDispatchEvent enum values.** Pure convention.
- **NO change to Brief 232's `responseBody` channel.** This brief is the prompt-body-OUT direction; Brief 232 was the response-body-IN direction. Independent seams.
- **NO change to the retrofit prompt template content.** `composeRetrofitPrompt(...)` output is preserved verbatim — only its transit path changes (now reaches the runner via `workItemBody` instead of being orphaned in `context.retrofitPrompt`).
- **NO change to `workItem.content` semantics.** It remains the human-legible title / activity-feed string. The new field is for the runner-prompt body; the title stays human-facing.
- **NO retroactive fix for in-flight retrofits.** Existing dispatched-but-not-yet-completed retrofit work items already have `retrofitPrompt` in context (which the brief renames); but those dispatches' runners are already past the prompt-receive step (they got the title). The Brief 228 implementation gap meant they couldn't have worked anyway; no behavioural regression. Future retrofits use the new path correctly.
- **NO admin UI surface.** The convention is internal harness wiring — there is no human-facing place this is rendered.

## Inputs

1. `docs/briefs/complete/228-project-retrofitter.md` — Brief 228, the parent of the implementation gap this brief discharges.
2. `docs/briefs/232-runner-dispatch-response-body.md` — Brief 232's §Pre-Build Verification + §After Completion flagged this gap explicitly.
3. `docs/state.md` — Builder checkpoint for Brief 232 carries the gap detail with file:line citations.
4. `src/engine/onboarding/retrofitter.ts:710-714, 866-877, 894-905` — current retrofitter writes `workItem.content = title` and `workItem.context.retrofitPrompt = prompt`.
5. `src/adapters/cloud-runner-prompt.ts:49-145` — `composePrompt({workItemBody, ...})` — the function that consumes the prompt body. Its `workItemBody` parameter is the read site for both routine + managed-agent.
6. `src/adapters/claude-code-routine.ts:185-200` — adapter call-site; passes `workItem.content` as `workItemBody`.
7. `src/adapters/claude-managed-agent.ts:255-275` — same shape.
8. `src/adapters/github-action.ts:255-265` — passes `truncate(workItem.content, 50 * 1024)` as the `work_item_body` workflow input. Truncation is meaningful (GitHub `workflow_dispatch` limits each input to 65 KB; 15 KB reserved for skill-text fallback per `github-action.ts:259-260` comment). MUST preserve the truncate.
9. `src/adapters/local-mac-mini.ts:120-138` — uses `workItem.content` as tmux keys / bash exec args. Confirms the non-LLM nature of the local-mac-mini path; out of scope.
10. `packages/core/src/db/schema.ts` (workItems table) — `context: text("context", { mode: "json" }).$type<...>()` — opaque JSON column. The convention rides on this; no schema change.
11. `docs/insights/004-*` (brief sizing) + `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — applicable principles.
12. `docs/architecture.md` §L3 (Harness) — runner-dispatch is the L3 seam; this brief refines the existing seam, not adding a new one.

## Constraints

- **Engine-first per CLAUDE.md.** A small reader helper that does "if `context.runnerPromptBody` is a non-empty string, return it; else return `workItem.content`" is generic — any runner-dispatch architecture wants this. It belongs in `packages/core/`. The retrofitter writer site stays in `src/engine/onboarding/` (Ditto-specific).

- **Could ProcessOS use this?** YES for the helper + the convention (any cloud-dispatch architecture wants the same field-fallback shape). The helper goes in `packages/core/src/work-items/runner-prompt.ts` (or extends the existing `packages/core/src/work-items/` directory — Brief 223's seam).

- **Helper signature** (Architect default; Builder may pin during implementation if a constraint surfaces):
  ```ts
  export function getRunnerPromptBody(args: {
    content: string;
    context: unknown;
  }): string;
  ```
  Read order: (1) if `context` is a non-null object AND `context.runnerPromptBody` is a non-empty string, return it; (2) else return `content`. Defensive against malformed context (Insight-017): non-object context, missing key, wrong-type value all fall through to `content`. No throws.

- **Three adapter call-sites updated.** Each adapter imports the helper and calls it with `{content: workItem.content, context: workItem.context}`:
  - `claude-code-routine.ts:190` — pass helper output as `workItemBody`.
  - `claude-managed-agent.ts:261` — same.
  - `github-action.ts:260` — wrap in `truncate(..., 50 * 1024)` to preserve the existing GitHub-input cap. The 50 KB cap moves outside the helper (the helper doesn't know about adapter-specific limits).

- **`local-mac-mini.ts` UNCHANGED.** Its semantic is "literal command/keystrokes" not "LLM prompt"; threading `runnerPromptBody` would silently change behaviour for non-retrofit dispatches that legitimately use the title as the keystroke string. Out of scope.

- **Local-mac-mini retrofit-trigger guard (Reviewer IMP-2 fix).** Until the §Open Question resolves to Path X (build a local Claude Code adapter) or Path Y (forbid retrofit on local-mac-mini), THIS brief MUST close the gap window between brief approval and Open Question resolution. The retrofit trigger surfaces — `src/engine/self-tools/rerun-project-retrofit.ts` AND any other retrofit-initiation path the Builder grep-finds (e.g., `confirm/route.ts` post-onboarding retrofit kickoff) — MUST reject with a structured error when the project's `defaultRunnerKind === 'local-mac-mini'`. Error message: "Retrofit is not supported on local-mac-mini projects (see Brief 233 §Open Question). Switch the project's runner to a cloud kind to retrofit." This is a defensive guard, not the final UX — Path Y's full surface UX is owned by whatever brief discharges the Open Question.

- **Retrofitter writer site renamed.** `src/engine/onboarding/retrofitter.ts:872, 900` — change `retrofitPrompt: prompt` to `runnerPromptBody: prompt`. The old `retrofitPrompt` field was never read; renaming carries no consumer impact. Verify with one final grep before deleting the old field name.

- **Backwards compat at every read seam.** Every adapter call site falls back to `workItem.content` when `runnerPromptBody` is absent or malformed. Existing non-retrofit work items (which never had `runnerPromptBody` set) continue to work unchanged. Tested at every adapter.

- **Insight-180 guard.** `getRunnerPromptBody` is a pure read helper — no side effects, no DB calls, no `stepRunId` parameter required. The adapters that consume it already carry the guard at their dispatch entry points (verified in Briefs 216/217/218). No new guard surface.

- **No new external API integrations** (Insight-208 — no spike test required). All three adapters already have integration spikes from Briefs 216/217/218.

- **Type discipline.** `workItem.context` stays `Record<string, unknown> | null` at the type level. The helper does the safe-cast at the read site; consumers never see an untyped accessor. No `WorkItemContext` typed interface introduced (would couple core to Ditto-specific keys; the convention-via-helper approach keeps core key-agnostic).

- **Reference docs touched** (Insight-043 — Architect owns):
  - `docs/state.md` — Builder checkpoint after work; Documenter wraps.
  - `docs/roadmap.md` — annotate the Brief 228 entry to flip its retrofit-prompt-not-reaching-runner gap from CONFIRMED → DISCHARGED via Brief 233.
  - `docs/dictionary.md` — one new entry: `Runner Prompt Body` (the convention + the helper).
  - `docs/architecture.md` — NOT updated (no architectural seam; refines the existing L3 runner-dispatch seam).
  - `docs/briefs/complete/228-project-retrofitter.md` — DO NOT edit; the gap discharge lives in state.md + roadmap.

- **Engine-vs-product split summary:**
  - Engine (`packages/core/`): the helper `getRunnerPromptBody` + its tests.
  - Product (`src/adapters/` + `src/engine/onboarding/`): the three adapter call-site updates + the retrofitter writer rename + their tests.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Opaque-JSON convention with helper-at-read-site | Brief 232's `responseBody` design (`packages/core/src/work-items/brief-validation.ts` + `parseRunnerResponse` in retrofitter.ts) | pattern (self-reuse, sibling brief) | Brief 232 just established this exact pattern for the response-body-IN direction; Brief 233 is its mirror for the prompt-body-OUT direction. |
| `workItem.context` opaque-JSON column | Existing schema (`packages/core/src/db/schema.ts` workItems table) | depend (existing) | Already storing `retrofitPlan`, `retrofitDispatch`, `retrofitPrompt` (Brief 228). Adding one more keyed convention costs zero schema. |
| `workItem.content` as title fallback | Brief 228 retrofitter (`retrofitter.ts:710-714` writes title as content) + the three cloud-runner adapters that read it | depend (existing) | The brief preserves existing behaviour for non-retrofit work items; only retrofits get the new field. |
| GitHub workflow_dispatch input cap (50 KB after 15 KB skill reserve) | Brief 218 + `github-action.ts:259-260` comment | depend (existing) | The truncate stays at the adapter site, not in the helper — adapter-specific concern. |
| Defensive read at consumer site (Insight-017) | Brief 232's `parseRunnerResponse` defensive shape (5 paths covered) | pattern (self-reuse) | Same Insight-017 wire-boundary defence; non-object context / missing key / wrong-type value all fall through to content. |
| Helper-not-typed-interface choice | ADR-003 + Brief 232 (validator chose `z.record` over a typed shape) | pattern (self-reuse) | Same opaque-vs-typed tradeoff; opaque keeps core key-agnostic so ProcessOS can adopt without inheriting Ditto's retrofit / analyser / future-feature specifics. |
| Existing-but-unread `retrofitPrompt` field | Brief 228 retrofitter (`retrofitter.ts:872, 900`) | depend (existing) | The field's writer is in place; only the consumer wiring + the rename to a generic name is missing. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/work-items/runner-prompt.ts` | **Create (engine):** new module exporting `getRunnerPromptBody({content, context}): string`. Pure function; defensive on `context` (non-object, missing key, wrong-type → fall back to content). |
| `packages/core/src/work-items/index.ts` | **Modify (engine):** re-export `getRunnerPromptBody`. |
| `packages/core/src/work-items/runner-prompt.test.ts` | **Create:** unit tests for the helper (see ACs §3-7). |
| `src/engine/onboarding/retrofitter.ts` | **Modify (product):** at lines ~872 and ~900, rename `retrofitPrompt: prompt` to `runnerPromptBody: prompt`. No other change. Verify the field is unused elsewhere via grep. |
| `src/engine/onboarding/retrofitter.test.ts` | **Modify:** any existing test that asserts on `context.retrofitPrompt` is updated to assert on `context.runnerPromptBody` (Builder grep-verifies). |
| `src/adapters/claude-code-routine.ts` | **Modify (product):** at line ~190, replace `workItemBody: workItem.content` with `workItemBody: getRunnerPromptBody({content: workItem.content, context: workItem.context})`. Add the import. |
| `src/adapters/claude-managed-agent.ts` | **Modify (product):** at line ~261, same edit. |
| `src/adapters/github-action.ts` | **Modify (product):** at line ~260, replace `work_item_body: truncate(workItem.content, 50 * 1024)` with `work_item_body: truncate(getRunnerPromptBody({content: workItem.content, context: workItem.context}), 50 * 1024)`. Truncation cap preserved. |
| `src/adapters/claude-code-routine.test.ts` | **Modify:** add tests covering the two paths (runnerPromptBody-set + content-fallback). |
| `src/adapters/claude-managed-agent.test.ts` | **Modify:** add tests covering the two paths. |
| `src/adapters/github-action.test.ts` | **Modify:** add tests covering the two paths + the truncate-still-fires path. |
| `docs/dictionary.md` | **Modify:** one new entry: `Runner Prompt Body`. |
| `docs/state.md` | **Modify (Builder checkpoint):** capture helper added, retrofitter rename, three adapter wires, AC-status, gap-discharged annotation. |
| `docs/roadmap.md` | **Modify (Documenter wrap):** flip the Brief 228 retrofit-prompt-not-reaching-runner gap from "flagged for follow-on" → "discharged via Brief 233". |

## User Experience

- **Jobs affected:** **Delegate** — the user's retrofit task instructions actually reach the runner. Indirectly: **Review** (the post-retrofit `RetrofitPlanBlock` now actually reflects what the runner did, because the runner now actually does the retrofit instead of executing the title string).
- **Primitives involved:** none directly. The convention is internal harness wiring with no human-facing surface.
- **Process-owner perspective:** "When I ran a retrofit before this brief, the runner only saw the work-item title — so the retrofit either silently no-op'd or the runner improvised its own task interpretation. After this brief, the runner gets the structured prompt with the file payload, commit/push instructions, response-shape directive, and ADR-043 boundary rules."
- **Interaction states:** N/A — no UI.
- **Designer input:** Not invoked — no surface, no copy. Architect fills this section as a lightweight check.

## Acceptance Criteria

1. [ ] **Helper module exists at `packages/core/src/work-items/runner-prompt.ts`** with exported `getRunnerPromptBody({content: string, context: unknown}): string`. Re-exported from `packages/core/src/work-items/index.ts`.
2. [ ] **Helper returns `context.runnerPromptBody` when it's a non-empty string:** `getRunnerPromptBody({content: "TITLE", context: {runnerPromptBody: "BODY"}})` returns `"BODY"`.
3. [ ] **Helper returns `content` when `runnerPromptBody` is absent:** `getRunnerPromptBody({content: "TITLE", context: {}})` returns `"TITLE"`.
4. [ ] **Helper returns `content` when `runnerPromptBody` is empty string:** `getRunnerPromptBody({content: "TITLE", context: {runnerPromptBody: ""}})` returns `"TITLE"`.
5. [ ] **Helper returns `content` when `runnerPromptBody` is wrong type:** `getRunnerPromptBody({content: "TITLE", context: {runnerPromptBody: 42}})` returns `"TITLE"`.
6. [ ] **Helper returns `content` when `context` is null:** `getRunnerPromptBody({content: "TITLE", context: null})` returns `"TITLE"`.
7. [ ] **Helper returns `content` when `context` is not an object** (string, array, number): all return `"TITLE"`.
8. [ ] **Retrofitter writer site renamed:** `src/engine/onboarding/retrofitter.ts` writes `runnerPromptBody: prompt` (not `retrofitPrompt`) into `workItem.context` at both write sites (~lines 872 + 900). Grep `retrofitPrompt` across `src/`, `packages/`, `docs/runner-templates/` returns zero hits after the change. **Builder reads retrofitter.ts in full from L757-L905 (NOT spot-grep) to verify no third silent overwrite path exists** — there is also a shallow context-overwrite at `~L799-L806` (`context: { retrofitPlan: outcome.block }`) that drops prior context fields; verify the dispatch-write step's downstream rebuild at L869-L873 / L894-L905 uniformly applies the rename so the eventual context carries `runnerPromptBody`, not a half-rebuilt object missing the field.
9. [ ] **`claude-code-routine.ts` adapter wires through the helper:** when a retrofit work item with `context.runnerPromptBody = "<retrofit instructions>"` is dispatched, `composePrompt` receives the retrofit instructions as `workItemBody` (not the title). Test fixture verifies.
10. [ ] **`claude-managed-agent.ts` adapter wires through the helper:** same shape as AC #9.
11. [ ] **`github-action.ts` adapter wires through the helper AND preserves the 50 KB truncate:** the workflow input `work_item_body` carries the helper output, capped at 50 KB. Verify both: (a) when `runnerPromptBody` is set + ≤50 KB, the workflow input equals it verbatim; (b) when `runnerPromptBody` is set + >50 KB, the workflow input is truncated to 50 KB.
12. [ ] **Backwards compat:** non-retrofit work items (which never had `runnerPromptBody`) continue to dispatch with `workItem.content` as the prompt body, with no change to existing behaviour. Verified by re-running all existing adapter tests; zero regressions.
13. [ ] **`local-mac-mini.ts` UNCHANGED:** explicitly verified by grep — its `workItem.content` reads at lines 132 + 137 are not converted to use the helper. Out-of-scope per §Non-Goals.
14. [ ] **Local-mac-mini retrofit-trigger guard (Reviewer IMP-2):** `src/engine/self-tools/rerun-project-retrofit.ts` rejects with a structured error when the project's `defaultRunnerKind === 'local-mac-mini'`. Builder grep-finds any other retrofit-initiation paths (e.g., `packages/web/app/api/v1/projects/[id]/retrofit/route.ts`, post-onboarding `confirm/route.ts`) and applies the same guard. Error message includes a Brief 233 §Open Question reference + the user-facing remediation ("switch runner to a cloud kind"). Test: a project with `defaultRunnerKind='local-mac-mini'` calling the retrofit trigger returns the structured error, NOT a silent no-op dispatch.
15. [ ] **No new TrustAction / memoryScopeTypeValues / briefStateValues / RunnerDispatchEvent enum values introduced.** Grep-verify.
16. [ ] **Quality gates:** root `pnpm run type-check` 0 errors from this brief. core `pnpm exec tsc --noEmit` 0 errors from this brief. Full suite `pnpm test` no regressions. Brief 228's existing tests still pass. Brief 232's tests still pass (this brief is independent of Brief 232's `responseBody` channel).

## Open Question (HUMAN APPROVAL REQUIRED)

**Local-mac-mini retrofit support — separate brief or non-goal?**

The local-mac-mini bridge is fundamentally an exec/tmux dispatcher, not an LLM-prompt runner. Retrofitting via local-mac-mini would require either:

- **Path X:** spawn Claude Code locally on the Mac mini with the retrofit prompt as input (new infrastructure — local Claude Code SDK invocation, similar to but not identical to the cloud-runner adapters). Captured in a separate brief.
- **Path Y:** explicitly forbid retrofit on local-mac-mini projects — the project's `defaultRunnerKind` must be a cloud kind for retrofit to be available. Document the constraint at the retrofit-trigger surface (`src/engine/self-tools/rerun-project-retrofit.ts`).

**Architect default: Path Y** — Path X is genuinely infrastructure-level work (a 4th cloud-runner-equivalent adapter), and retrofit is a connection-time + on-demand maintenance task that's reasonable to scope to cloud-runner projects. Local-mac-mini is for tighter shell-scripted work patterns (Brief 212 origin); retrofit isn't its native shape.

**Architect surfaces this for the human.** If the human picks **Path X**, this brief stays as-is and a separate brief is added to the queue. If the human picks **Path Y**, this brief gains an AC #16 documenting the retrofit-trigger surface check + a user-facing error message when a local-mac-mini project tries to retrofit. The Architect implements Path Y at sub-brief-architect time — the human's call propagates only to the trigger surface, NOT to the helper or the three adapters this brief edits.

## Review Process

1. Spawn fresh-context Reviewer with `docs/architecture.md` + `docs/review-checklist.md` + this brief.
2. Reviewer specifically checks:
   - Brief is sized within Insight-004 (8-17 ACs; this brief has 15).
   - Engine-vs-product split correct (helper → core; adapter wires + retrofitter rename → product).
   - Backwards compat preserved at every seam (helper falls back to content; non-retrofit work items unaffected).
   - Insight-180 guard discipline respected (no new side-effecting functions; helper is a pure read).
   - The retrofitter rename is genuinely safe (grep verifies no consumer reads `retrofitPrompt` beyond the adapter sites this brief is changing).
   - The github-action 50 KB truncate is preserved post-edit.
   - The `local-mac-mini` exclusion is sound (its content-as-keystrokes semantic is fundamentally different).
   - The §Open Question (local-mac-mini retrofit) is genuinely open + the architect's default is *defaulted* not *decided*.
   - No drift on Brief 232's `responseBody` channel (this brief is the inverse direction; independent).
   - No drift on Brief 220's `briefState` machine or Brief 221's `cardKind` discriminator.
3. Present brief + review findings to human for approval.

## Smoke Test

```bash
# 1. Type-check.
pnpm run type-check
( cd packages/core && pnpm exec tsc --noEmit )

# 2. Helper unit tests.
pnpm vitest run packages/core/src/work-items/runner-prompt.test.ts

# 3. Three adapter test suites.
pnpm vitest run src/adapters/claude-code-routine.test.ts src/adapters/claude-managed-agent.test.ts src/adapters/github-action.test.ts

# 4. Retrofitter tests still pass post-rename.
pnpm vitest run src/engine/onboarding/retrofitter.test.ts

# 5. Full suite — zero regressions.
pnpm test

# 6. Manual smoke (against a fixture work item):
#    Insert workItem with content="Retrofit plan for foo" and
#    context={runnerPromptBody: "INSTRUCTIONS_HERE"}; dispatch via
#    each cloud-runner adapter; assert the runner-side prompt body
#    contains "INSTRUCTIONS_HERE" and not "Retrofit plan for foo"
#    (except in the final activity-feed string, which still uses
#    workItem.content for legibility).
```

## After Completion

1. Builder updates `docs/state.md` with: helper added, retrofitter rename, three adapter wires, gap-discharged annotation, AC-status block.
2. Documenter wraps: moves brief to `docs/briefs/complete/`, flips the Brief 228 implementation gap in `docs/state.md` from "CONFIRMED + flagged for follow-on" → "DISCHARGED via Brief 233", annotates the Brief 228 row in `docs/roadmap.md` accordingly.
3. No ADR needed (no architectural seam).
4. Phase retrospective: did the helper-vs-typed-interface choice hold up, or did Builder discover pressure for a typed `WorkItemContext`? If the latter, capture as an insight ("opaque-vs-typed at the harness-internal-state seam — when does the typing pressure justify the coupling cost").
5. **Reference doc drift flagged for Architect (Insight-043):** if Builder discovers any of (a) a fourth cloud-runner adapter that should ALSO consume the helper, (b) a non-retrofit work-item type that wants `runnerPromptBody` semantics, (c) the §Open Question's Path Y local-mac-mini constraint surface needs more depth than a one-line check — flag in handoff, do not fix.

---

## Reviewer Pass Summary (2026-04-30)

Fresh-context Reviewer ran with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Brief 228 + Brief 232 + Insights 004/180 + the codebase surface. **Verdict: PASS WITH FLAGS.** 0 CRITICAL. 2 IMPORTANT (both fixed in-session before promotion to `Status: ready`). 5 MINOR — all none-blocking.

- **IMPORTANT fixes applied:**
  - **IMP-1 — 3rd context-overwrite write site at retrofitter.ts:799-806.** Reviewer found a shallow `context: { retrofitPlan: outcome.block }` write at `~L799-L806` that drops prior context fields, BEFORE the dispatch-write step's downstream rebuilds at L869-L873 + L894-L905. Brief originally said "rename at lines 872 + 900." Fix: AC #8 expanded to require Builder reads retrofitter.ts in full from L757-L905 (not spot-grep), verifies the dispatch-write step's downstream rebuild uniformly applies the rename. Grep across `src/`, `packages/`, `docs/runner-templates/` returns zero `retrofitPrompt` hits.
  - **IMP-2 — Local-mac-mini retrofit gap window.** Until §Open Question resolves to Path X or Y, the gap exists where a `defaultRunnerKind='local-mac-mini'` project triggering retrofit silently no-ops (the runner tmux-sends the title only). Fix: §Constraints + new AC #14 require a structured-error guard at the retrofit-trigger surfaces (`rerun-project-retrofit.ts` + Builder-grep'd siblings) until §Open Question resolution. Defensive guard, not final UX; final UX owned by whatever brief discharges the Open Question.
- **MINOR — verified-no-action or future-polish:**
  - **MIN-1** — Helper signature `{content, context}` vs `Pick<WorkItem, "content"|"context">`. Architect's looser shape is ProcessOS-friendly. Flag-don't-fix.
  - **MIN-2** — AC count distribution (7 helper + 5 integration) is helper-heavy. Within Insight-004 envelope; Builder may split AC #12 if helpful.
  - **MIN-3** — `composePrompt` skill-loading branch wraps `workItemBody` with a `/dev-review` directive; the composed-prompt result with retrofit-prompt + dev-review + INTERNAL callback may have semantic conflict (dev-review fires at PR-comment time, retrofit-completion is different). Helper itself is correctness-clean; future-brief-candidate flag for an integration test that composes the full prompt and asserts both sections survive.
  - **MIN-4** — GH Action 50 KB cap doesn't account for retrofit-prompt blowup with 100+ files. Existing cap preserved (correct); future-brief-candidate flag for pre-truncate logging.
  - **MIN-5** — `workItem.context` is opaque-JSON without a typed-interface index. Same opaque-vs-typed tradeoff as Brief 232. Future readers find the convention via dictionary entry; helper file could carry a JSDoc index of all known keys (`retrofitPlan`, `retrofitDispatch`, `runnerPromptBody`). Optional polish.
- **Reviewer's independent take on §Open Question:** Path Y (forbid retrofit on local-mac-mini until Path X ships) — matches Architect default. Both paths legitimate; the architect's defaulted-not-decided posture preserved.
- **Reviewer's independent take on engine-vs-product split:** clean — helper is generic (ProcessOS-consumable), adapter wires + retrofitter rename are Ditto-specific.
- **Reviewer's independent take on Brief 228 + Brief 232 non-interference:** verified by line-range inspection. This brief is the prompt-body-OUT direction; Brief 232 was response-body-IN. Independent seams.

