# Brief 297: Tripwire Guard + Token/Cost Rollup + Complete Tool Recording (P1+P4+P5)

**Date:** 2026-05-30
**Status:** draft
**Depends on:** Brief 296 (parent). Branches off `main`.
**Unlocks:** a trustworthy correctness floor — every later phase relies on cut-off/empty responses never earning trust.

## Goal

- **Roadmap phase:** Engine Hardening — Agent-Brain Transfer (Brief 296).
- **Capabilities:** P1 (tripwire guard on every model call), P4 (run-level token/cost rollup + budget debit), P5 (complete per-tool-call recording). Bundled because they share one code area: `src/engine/llm.ts` / `src/adapters/claude.ts` / `src/engine/heartbeat.ts`.

## Context

Today a token-cut-off or silently-empty model response returns as a **successful** step at default "medium" confidence (`claude.ts:337`, `~393`) — which does not trip the trust gate, so it **earns trust** and corrupts the approval-rate signal driving autonomy upgrades. The Google provider hardcodes `stopReason` to `end_turn`/`tool_use` (`llm.ts:761`), papering over cutoffs entirely. Separately, `process_runs.totalTokens`/`totalCostCents` are declared but never written (read as 0), and the budget ledger never debits on step completion. And codebase tool calls are console-logged only — invisible to the DB and to trust. This is the ProcessOS "silent tripwire success" bug, amplified by Ditto's trust system.

## Objective

A cut-off or empty model response can **never** complete as an approved step (test-proven); `process_runs` token/cost totals are populated and the budget ledger debits on completion; every in-loop tool call (codebase + integration) is persisted to `step_runs`.

## Non-Goals

- No new LLM providers, no streaming changes, no trust-tier redesign.
- Do not add MCP recording here (that's P6/301).
- Do not add the boundary lint rule here (that's P7/300).

## Inputs

1. `docs/briefs/296-agent-brain-transfer-parent.md` — parent context + Phase-0 findings.
2. `.context/attachments/A7hasF/pasted_text_2026-05-30_23-39-22.txt` — P1/P4/P5 build detail.
3. `src/engine/llm.ts` — provider completions; faithful `stopReason` (kill the Google hardcode at ~761; OpenAI length→max_tokens at 546).
4. `src/adapters/claude.ts` — tool loop, `max_tokens` break (337), confidence default (~393), `CODEBASE_TOOL_NAMES` branch.
5. `src/engine/heartbeat.ts` — step completion, `startProcessRun`, where rollup + budget debit wire in.
6. `src/engine/budget.ts` (or the existing budget module) — `recordSpend` / `budget_transactions`.
7. `packages/core/src/db/schema.ts:377-378` — the dead `total_tokens`/`total_cost_cents` columns.

## Constraints

- **Engine scope: both.** The pure `assertModelOutput(result, { context })` guard + faithful `stopReason` typing belong in `@ditto/core` LLM types (reusable by ProcessOS/ServiceOS); provider wiring stays in `src/engine/llm.ts`. Verify the core/product split at Design.
- Do not regress the LLM boundary — no ai-sdk imports.
- **ADR-051 decision (write during Design):** when the guard trips, does the step **throw** (→ `stepError` → heartbeat marks failed) or **force `confidence: "low"` + cutoff flag** (→ trust gate pauses for review)? Default recommendation: **fail the step** (safer); the ADR records the choice and rationale.
- The guard must **not be swallowed** anywhere in the `createCompletion` call path.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| `assertModelOutput` tripwire guard | ProcessOS/Catalyst Mastra port (`assertNotTripwire`) | pattern | Proven failure mode; reimplemented behind Ditto's `llm.ts` boundary |
| Per-loop tool-call recording | ProcessOS/Catalyst | pattern | ProcessOS records every loop tool-call; match completeness |
| Token/cost rollup + ledger debit | Ditto-native (existing `budget` module + `process_runs` columns) | pattern | Wiring dead columns + existing ledger; no new dep |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/llm/*` (types) | Modify: faithful `stopReason` union; add `assertModelOutput` pure guard + result types |
| `src/engine/llm.ts` | Modify: each provider returns the real stop reason (kill Google hardcode); surface `max_tokens`/`refusal`/empty |
| `src/adapters/claude.ts` | Modify: call the guard; on trip, fail step (or force-low per ADR-051); push `ToolCallRecord` for the `CODEBASE_TOOL_NAMES` branch |
| `src/engine/heartbeat.ts` | Modify: roll step `tokens_used`/`cost_cents` up onto parent `process_runs`; debit budget ledger via `recordSpend` for goal-budgeted runs |
| `docs/adrs/051-tripwire-guard-on-model-output.md` | Create: the fail-vs-force decision + rationale |
| `*.test.ts` (vitest) | Create/modify: guard, rollup, tool-recording coverage |

## User Experience

- **Jobs affected:** Review, Decide — cut-off/empty results now surface as failed/needs-review instead of fake successes.
- **Primitives involved:** Trust tier / confidence; run/step records.
- **Process-owner perspective:** an Agent that fails honestly instead of silently succeeding; trustworthy autonomy upgrades.
- **Interaction states:** N/A (engine-level); surfaces via existing review/error states.
- **Designer input:** Not invoked — lightweight UX section only.

## Acceptance Criteria

1. [ ] Each provider in `llm.ts` returns the **real** `stopReason`; the Google hardcode is removed and a Google `MAX_TOKENS` finish surfaces as `max_tokens`.
2. [ ] OpenAI `finish_reason: "length"` surfaces as `max_tokens` and is treated as a tripwire downstream.
3. [ ] `assertModelOutput` flags (a) cutoff/refusal stop reasons and (b) empty/whitespace content; it lives in `@ditto/core` and is a pure function.
4. [ ] In `claude.ts`, a tripped guard does **not** return a clean success — it fails the step (per ADR-051) or forces `confidence: "low"` + cutoff flag.
5. [ ] A vitest injects a `max_tokens` response and asserts the step does **not** complete as approved.
6. [ ] A vitest injects an empty/whitespace response and asserts the step does **not** complete as approved.
7. [ ] An advisory test/lint flags any `createCompletion` call path lacking a guard.
8. [ ] On step completion, `step_runs.tokens_used`/`cost_cents` roll up onto the parent `process_runs.totalTokens`/`totalCostCents`.
9. [ ] A vitest asserts a 2-step run's `process_runs` totals equal the sum of its steps.
10. [ ] For a goal-budgeted run, step completion debits the budget ledger via `recordSpend`; a vitest asserts a `budget_transactions` row moved.
11. [ ] Codebase tool calls (`read_file`/`search_files`/`list_files`/`write_file`/`run_command`) push a `ToolCallRecord` (name, args, result summary, timestamp) to `step_runs.tool_calls`.
12. [ ] A vitest asserts a loop that calls a codebase tool persists a `tool_calls` entry for it.
13. [ ] ADR-051 written and records the fail-vs-force decision.
14. [ ] Root + core type-check pass; no new ai-sdk imports in engine.

## Review Process

1. Spawn fresh-context Reviewer with `docs/architecture.md` + `docs/review-checklist.md`.
2. Verify: tripwire cannot be swallowed (trace every `createCompletion` path); rollup math; ledger debit; core/product split for the guard; trust-gate interaction (a failed/forced-low step must not earn trust).
3. Present work + findings to human.

## Smoke Test

```bash
pnpm vitest run <the new guard/rollup/tool-recording test files>
pnpm run type-check
# Expect: tripwire tests prove max_tokens + empty never approve; rollup test sums; ledger test debits.
```

Manual: run a real step with a deliberately tiny max-tokens cap; confirm it surfaces as failed/needs-review (not a clean success) and the run's token total is non-zero.

## After Completion

1. Update `docs/state.md` (rolling log + In Progress).
2. Update `docs/roadmap.md` (add the Engine-Hardening row; mark Phase 1 done).
3. Retrospective.
4. ADR-051 finalized.
