# Brief 185: Structural Fingerprinting + Bulk Auto-Promotion

**Date:** 2026-04-17
**Status:** ready
**Approved:** 2026-04-17 by human after two review passes
**Depends on:** Brief 184 (browser actions execute end-to-end; trust gate intercepts supervised writes; activity log captures each call)
**Unlocks:** Parent Brief 182 closure. The afirmo use case (498-row bulk reconciliation) becomes ergonomically viable — rows 1-3 supervised, rows 4-498 auto-approve on fingerprint match, deviations escalate.

## Goal

- **Roadmap phase:** Phase 9 adjacent (infrastructure → user value)
- **Capabilities delivered:** Structural action fingerprinting for browser writes, fingerprint-match auto-promotion at the trust gate, deviation escalation, revocation on rejection, per-run reversibility register. The originally-Ditto piece the research report flagged as Gap #2.

## Context

Parent Brief 182 and its predecessors (183 skeleton, 184 usable) established the browser protocol. Under supervised trust tier, every browser write is held for human approval. For a 498-row bulk reconciliation that is ~2000 approval prompts — mechanically functional but ergonomically punishing. Brief 184 shipped a stopgap (`--auto-approve-matching-pattern` flag) that is a blunt opt-out; this brief replaces it with the primitive that makes bulk browser work actually usable.

The research report (`docs/research/authenticated-saas-browser-automation.md`) named this capability — "structural fingerprinting of browser actions" — as one of five gaps between any browser-automation library and Ditto's trust posture. No library provides it. It is Original to Ditto, built on top of the existing trust-tier model.

The design intuition: after the user has approved "click the Reconcile button on row N, set category to 'Software', confirm, submit" three times across rows 1-3, the pattern is established. Row 4 that does structurally the same thing (same tool, same selector kind, same action shape — only the row content differs) should not require a fourth approval. But row 347 that requires a *different* category (because the expense is for a different service) produces a different fingerprint and escalates: "row 347 differs from the pattern you approved — review."

## Objective

Make a 498-row bulk browser reconciliation converge on a small number of human approvals (typically 3-5 supervised approvals for the pattern, plus escalations for genuine deviations). Ship the fingerprinting primitive, wire it into the trust gate, instrument the per-run reversibility register, remove the stopgap flag from Brief 184.

## Non-Goals

- Not cross-run auto-promotion. Fingerprints from run A do not automatically promote calls in run B. Each run establishes its own pattern. Cross-run learning is a future consideration; silence-as-feature (ADR-011) applies — don't over-generalise without evidence.
- Not fingerprint-based *rejection*. A deviation escalates; it never silently fails. Human always in the loop for non-pattern rows.
- Not full reversibility automation. The reversibility register is audit evidence; it enables human-driven undo, not automatic rollback.
- Not applicable to non-browser tool calls. Fingerprinting is browser-specific in this brief. CLI/REST tools have their own (simpler) identity already. If a generalisation emerges, follow-up brief.
- Not a reversal of trust tier. `trusted` tier still passes writes through without any fingerprint check — the check only applies at `supervised` tier.

## Inputs

1. `docs/briefs/182-browser-write-capability.md` — parent.
2. `docs/briefs/184-browser-session-capture-and-execution.md` — the brief that shipped the stopgap flag this brief removes.
3. `docs/adrs/032-browser-integration-protocol.md` — states that trust-gate-per-call is the granularity; this brief refines "per-call" with fingerprint-aware auto-promotion.
4. `docs/adrs/007-trust-earning.md` — the existing trust tier mechanism this brief extends.
5. `docs/research/authenticated-saas-browser-automation.md` §Gaps Identified #2 — the "structural fingerprinting" gap this brief closes.
6. `src/engine/integration-handlers/browser.ts` — where fingerprint computation lands.
7. `packages/core/src/harness/handlers/` — trust-gate handler's location (builder confirms at build time; core vs product decided by existing placement).
8. `packages/core/src/db/schema.ts` §`harnessDecisions` — where fingerprint + match-kind columns land.
9. `src/engine/heartbeat.ts` — where run-level terminal cleanup happens (fingerprint ledger cleared per run).
10. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — applies to the new per-run fingerprint mutation functions.
11. `docs/insights/190-migration-journal-concurrency.md` — applies to the schema migration.

## Constraints

- Fingerprint computation MUST be deterministic and pure — same input produces the same hash, no side effects, no clock dependency, no environment dependency. Specifically: no `Date.now()`, no `process.hrtime()`, no `Math.random()`, no environment variables, no filesystem reads. Test mocks the clock and asserts hash unchanged.
- Fingerprint MUST exclude *values* and include only *structural shape*. A `browser.type(selector, amount)` call's fingerprint captures the selector and the type (string-kind, numeric-kind) — not the actual value. Otherwise every row's value-difference produces a new fingerprint and promotion never triggers. Selectors that embed dynamic values (row ids, token-interpolated paths) MUST be normalised before hashing — replace digit sequences with `:N:` and UUIDs with `:UUID:` placeholders.
- Two hash layers: **exact** (tool_name + normalised-selector + action kind) and **structural** (tool_name + a11y-tree role+name path + action kind + input schema). Exact match is fast-path, high-confidence; structural is fallback, lower-confidence (requires more approvals before promoting). `browser.snapshot()` output provides the a11y tree.
- Promotion thresholds configurable, with safe defaults:
  - `exactMatchApprovals: 2` (default) — **two** supervised approvals required before exact-match auto-promotion. Rationale: one approval is insufficient evidence a pattern is real (could be a mis-click or a misread LLM call); two aligned approvals demonstrate genuine repeatability. Limits the blast radius of a hallucinated or prompt-injected call that happens to share a selector with the first approved row.
  - `structuralMatchApprovals: 3` (default) — three supervised approvals enable structural-match auto-promotion (fallback path; higher evidence bar).
  - `maxAutoApprovalsPerRun: 50` (default) — cap. After 50 consecutive auto-approvals on the same fingerprint, the trust gate holds the next call for a **re-affirmation prompt** ("50 rows auto-approved on this pattern; approve next 50?"). User approval resets the counter. Operators may raise the cap or set `null` to disable, but not silently.
  - Config lives in `config/browser-fingerprinting.yaml`. `exactMatchApprovals` has a code-level lower bound of 2 (config cannot lower it); `structuralMatchApprovals` has a code-level lower bound of 3.
- Match classification emitted per decision: `none | exact | structural | deviation`. **Deviation-threshold `N = 2`:** deviation fires when a new fingerprint is seen in a run that already has ≥2 approved fingerprints of any kind. Rationale: one approved fingerprint is insufficient to call anything else a deviation (pattern not yet established); two approvals establish the pattern. `none` is the default for rows 1-2 of a novel pattern.
- **Revocation has explicit scope:** a human rejection of a call (or an auto-approved call that the user later edit-corrects) invalidates **only the fingerprint that matched that call** for the remainder of the run. Exact-match rejections invalidate the exact fingerprint; structural-match rejections invalidate both the specific structural fingerprint and drop the approval count for its containing cluster. Revocation does NOT retroactively rollback earlier auto-approved calls that have already executed (Playwright actions are not reversible; that is what the reversibility register is for).
- **Serial dispatch for auto-approved calls:** under supervised tier with fingerprint auto-approval, browser calls MUST execute serially — no pipelining of auto-approved dispatches. A rejection on row N guarantees that rows N+1 onward are held for re-approval; it cannot race with already-dispatched but not-yet-completed calls because only one call is in flight at a time. Configurable parallelism is deferred to a future brief with an explicit in-flight-invalidation contract.
- **Fingerprint ledger is in-memory only, scoped per `processRunId`, initialised empty on process start.** No DB persistence. Rationale: fingerprint auto-approval is a within-run-only mechanism (Non-Goal #1); a ledger that survives process restart would enable cross-run behaviour the brief explicitly forbids. On engine startup, the ledger is empty by definition (it is a Map instance initialised at module load). On ledger access for a `processRunId`, if an entry already exists (impossible under nominal operation), the ledger throws — this surfaces bugs rather than masking them. Cleared at run terminal state (complete, failed, cancelled) by existing heartbeat cleanup; abnormal termination (process crash, kill -9) is handled implicitly by the empty-on-startup invariant.
- Trust-gate enforcement, resolved in the **core** trust-gate handler (`packages/core/src/harness/handlers/trust-gate.ts`). The core handler imports the core fingerprint-ledger (both engine-generic, no DB coupling). The Ditto-product trust-gate handler (`src/engine/harness-handlers/trust-gate.ts`) continues to wrap core for session-trust overrides; fingerprint check runs at the core layer so other consumers (ProcessOS, etc.) inherit it:
  - `autonomous` / `spot_checked` tier: no fingerprint check; existing behaviour (sampling / pass-through).
  - `supervised` tier: fingerprint check runs; if match ≥ threshold → auto-approve (logged as `autoApproved: true, fingerprintMatch: exact|structural`); otherwise hold for human. Re-affirmation prompt after `maxAutoApprovalsPerRun` consecutive auto-approvals.
  - `critical` tier: fingerprint check does NOT apply; every call held (conservative default for critical work).
- Escalation on deviation uses existing failure-classification + escalation-ladder path (Brief 162 MP-7.1, Brief 178). New failure type: `PATTERN_DEVIATION`.
- Per-run reversibility register: append-only log keyed by `(processRunId, stepRunId, rowInputId)` capturing `(fingerprint, toolCallSequence, outputSummary)`. Stored as JSON on each stepRun's outputs; no new table.
- Insight-180 invocation guards on any new side-effecting functions: `recordFingerprintApproval`, `invalidateFingerprint`, `computeFingerprint` (pure — guard not required, but typed return-void-or-throw for contract).
- Insight-190: new columns on `harnessDecisions` ship as a proper migration with journal idx resequencing on conflict.
- **Brief 184's `--auto-approve-matching-pattern` flag MUST be removed outright** — not deprecated. The flag is rejected as unknown by the CLI after this brief ships. Brief 184's flag-specific tests are deleted. Rationale: leaving two overlapping auto-approval pathways (flag-based + ledger-based) is exactly the silent-divergence risk the prior review warned about; deprecation is a six-month tax on every future reader of the CLI surface.
- Engine-core boundary (decided, not deferred): fingerprinting is engine-generic (any ProcessOS consumer with browser primitives benefits). **Core holds** `packages/core/src/harness/fingerprint.ts` (compute), `packages/core/src/harness/fingerprint-ledger.ts` (ledger), and the fingerprint-consultation extension inside the **core** trust-gate handler (`packages/core/src/harness/handlers/trust-gate.ts`). **Product holds** `src/engine/integration-handlers/browser.ts` (invokes the core compute at dispatch time, attaches fingerprint to the harness decision before trust-gate runs) and any DB-backed audit write (via feedback-recorder handler which is already product-layer). The ledger is pure in-memory; it has no DB dependency and introduces none.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Action fingerprint design | Original to Ditto (research Gap #2) | pattern | No library surveyed provides structural action fingerprinting tied to trust tiers |
| Hash primitive | Node `crypto.createHash('sha256')` | depend | Standard library, deterministic, fast |
| Per-run ledger (in-memory for active run, persisted on `harnessDecisions` for audit) | Existing `harnessDecisions` table | adopt | One row per decision already recorded; new columns for fingerprint + match kind |
| Trust-gate extension | Existing trust-gate handler (location verified at build time) | adopt | Fingerprint check inserts before the existing approval-hold logic |
| Escalation on deviation | `classifyFailureType` (Brief 162 MP-7.1), escalation ladder (Brief 178) | depend | `PATTERN_DEVIATION` slots into the existing failure taxonomy |
| Per-run terminal cleanup | `heartbeat.ts` terminal transitions (Briefs 174, 179) | adopt | Existing terminal-state cleanup for `definitionOverride` is the precedent; fingerprint ledger follows the same shape |
| a11y-tree snapshot for structural match | Playwright `accessibility.snapshot()` via `browser.snapshot()` primitive from Brief 184 | depend | Already available; reused, not reintroduced |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/harness/fingerprint.ts` | Create — pure functions: `computeFingerprint(toolCall, a11ySnapshot?)` returns `{ exact: string, structural: string, inputShape: string }`. Deterministic, no side effects |
| `packages/core/src/harness/fingerprint.test.ts` | Create — tests: same input → same hash, value changes don't alter fingerprint, selector changes DO alter fingerprint, structural hash robust to minor a11y-tree drift but not to role changes |
| `packages/core/src/harness/handlers/trust-gate.ts` | Modify — inject fingerprint check before existing hold logic, in the core handler (not the product wrapper). For `supervised` tier, consult per-run ledger; auto-approve on match-above-threshold; trigger re-affirmation prompt after `maxAutoApprovalsPerRun` consecutive auto-approvals; record match-kind on decision. Product trust-gate handler (`src/engine/harness-handlers/trust-gate.ts`) unchanged — still wraps core for session-trust overrides |
| `packages/core/src/harness/fingerprint-ledger.ts` | Create — in-memory ledger keyed by `processRunId`. APIs: `recordApproval(runId, fingerprint, reviewerId)`, `invalidate(runId, fingerprint, reason)`, `classify(runId, fingerprint)` returns `exact | structural | deviation | none`. All APIs take Insight-180 invocation anchor (stepRunId for mutations) |
| `src/engine/integration-handlers/browser.ts` | Modify — compute fingerprint at dispatch time, attach to harness decision metadata before trust gate runs |
| `src/engine/heartbeat.ts` | Modify — on run terminal state, call `fingerprint-ledger.dispose(runId)` to clear the in-memory ledger |
| `packages/core/src/db/schema.ts` | Modify — add columns to `harnessDecisions`: `actionFingerprintExact` (text, nullable), `actionFingerprintStructural` (text, nullable), `fingerprintMatch` (text enum: `none | exact | structural | deviation`, nullable), `autoApproved` (integer boolean, nullable). Migration file per Insight-190 |
| `drizzle/NNNN_structural_fingerprinting.sql` | Create — migration SQL + journal entry per Insight-190 protocol |
| `src/engine/failure-classification.ts` | Modify — add `PATTERN_DEVIATION` failure type. Template: "Row <N> differs from the pattern approved in rows <1..N-1>. Tool: <toolName>. What changed: <diff summary>. Review before proceeding." |
| `src/cli/commands/run.ts` | Modify — remove `--auto-approve-matching-pattern` flag OR mark deprecated in help text with pointer to this brief's auto-promotion behaviour. If removed, tests updated; if deprecated, deprecation message logged on use |
| `packages/core/src/harness/types.ts` | Modify — extend `HarnessDecision` (or equivalent) with fingerprint + match-kind fields; extend `StagedOutboundAction` if fingerprint travels with staged writes |
| `config/browser-fingerprinting.yaml` (or inline in existing config) | Create — documented defaults: `exactMatchApprovals: 1`, `structuralMatchApprovals: 3`, `maxAutoApprovalsPerRun: null` |
| `src/engine/per-run-reversibility-register.ts` | Create — append-only write to `stepRuns.outputs.reversibilityRegister` capturing `{ rowInputId, fingerprint, toolCallSequence, outputSummary }` per row. Pure accumulator |
| `docs/architecture.md` | Modify — trust-tier section gains a note about fingerprint-aware auto-promotion for browser writes (cross-reference ADR-032) |
| `docs/insights/` | Create on completion — new insight if the "structural hash as fallback" pattern generalises well (candidate: "Structural fingerprints as trust-tier amplifier for repeatable work") |

## User Experience

- **Jobs affected:** Review (the review queue fills with just ~3-5 supervised approvals per bulk run instead of ~2000), Decide (user approves the pattern, Ditto runs the rest), Delegate (bulk browser work becomes a "fire-and-walk-away with escalations" experience rather than "sit there clicking approve").
- **Primitives involved:** Review Queue (unchanged shape; populated less densely), Activity Feed (new event fields visible: `autoApproved`, `fingerprintMatch`), Daily Brief (deviation escalations surface here).
- **Process-owner perspective:** User starts a 498-row bulk run. **Rows 1-2 appear for approval** with full detail ("Alex wants to click 'Reconcile' on row 1, set category to 'Software', confirm, submit"). User approves both — pattern established. **Rows 3 onward auto-approve on matching fingerprint**, running quietly through the queue. **Every 50 auto-approvals** (row 52, row 102, row 152, etc.), Ditto surfaces a **re-affirmation card**: "50 rows auto-approved on this pattern. Approve next 50?" User confirms; counter resets. **Genuine deviations** (row 347 categorised 'Travel' instead of 'Software') escalate as distinct amber cards with a diff summary. End-of-run summary: "498 / 498 reconciled. **2 initial approvals**, **~10 re-affirmations** (one per 50-row chunk), **N auto-approved**, **M deviations** (resolved)." Reconciliation went from 2000 prompts to ~12-15 meaningful touches.
- **Interaction states:** supervised-hold (first 2 rows of any novel pattern), auto-approved (majority of a bulk run; subtle indicator in activity log), re-affirmation-prompt (every 50 auto-approvals; distinct card shape — "50 auto-approved on this pattern, approve next 50?"), deviation-escalated (distinct amber card — "differs from pattern"), revocation (user rejects an auto-approved row; card explains "pattern invalidated for remainder of this run; earlier auto-approved rows already executed — see reversibility register if rollback needed").
- **Designer input:** Not invoked for this brief. Existing Review Queue and Activity Feed components are sufficient. Sub-brief could invoke `/dev-designer` for deviation-card treatment polish if the default shape feels insufficient during smoke testing — flag but don't gate.

## Acceptance Criteria

1. [ ] `computeFingerprint` function exists in `packages/core/src/harness/fingerprint.ts`, returns `{ exact, structural, inputShape }` — pure, deterministic, no side effects.
2. [ ] **Purity test:** fingerprint test file mocks `Date.now()`, `process.hrtime()`, and `Math.random()`; asserts hash unchanged across 100 iterations with clock values permuted. Test fails if any non-determinism leaks in.
3. [ ] **Value exclusion test:** same tool call with different input values (`browser.type(selector, "10.00")` vs `browser.type(selector, "250.00")`) produces identical exact + structural fingerprints. Dynamic selectors (`/rows/123/edit` vs `/rows/456/edit`) produce identical fingerprints after normalisation.
4. [ ] `harnessDecisions` table gains `actionFingerprintExact`, `actionFingerprintStructural`, `fingerprintMatch` (enum), `autoApproved` columns. Migration ships with proper journal idx + SQL file per Insight-190.
5. [ ] Fingerprint ledger (`packages/core/src/harness/fingerprint-ledger.ts`) exists; APIs `recordApproval`, `invalidate`, `classify`, `dispose` present; ledger is per-`processRunId`; cross-run isolation verified by test; engine-startup empty-invariant verified; access to a `processRunId` already in the ledger throws.
6. [ ] Browser handler computes fingerprint on every `browser.*` call and attaches to the harness decision before the trust gate runs. Test.
7. [ ] Trust gate, at `supervised` tier, consults the ledger in the **core** handler. Test: exact match auto-approves the next matching call **only after `exactMatchApprovals=2` approvals** (default). Lower bound enforced — config with `exactMatchApprovals: 1` is rejected at load time.
8. [ ] Structural-match path: `structuralMatchApprovals=3` approvals required before structural (non-exact) auto-promotion. Lower bound 3 enforced at config load.
9. [ ] **Re-affirmation prompt:** after `maxAutoApprovalsPerRun=50` consecutive auto-approvals on the same fingerprint, the next call is held with a distinct re-affirmation message ("50 rows auto-approved on this pattern; approve next 50?"). User approval resets the counter. Test.
10. [ ] `autonomous` / `spot_checked` tier bypasses fingerprint check entirely; `critical` tier holds every call regardless of fingerprint. Two tests.
11. [ ] **Revocation scope:** a human rejection of a call invalidates only the matching fingerprint for the remainder of the run. Structural-match rejections invalidate the specific structural fingerprint and drop the cluster's approval count. Earlier auto-approved calls that have already executed are NOT retroactively rolled back. Test.
12. [ ] **Serial dispatch under auto-approval:** only one auto-approved browser call is in flight at a time. Rejection on row N guarantees row N+1 is held (cannot race with in-flight dispatch). Test with concurrent-dispatch attempt asserting serialisation.
13. [ ] **Deviation classification:** deviation fires when a new fingerprint is seen in a run with ≥2 approved fingerprints of any kind. Row 2 of a novel pattern classifies as `none`, not `deviation` — no spurious escalation. Row 3 with a divergent fingerprint classifies as `deviation` and escalates via `PATTERN_DEVIATION` failure type. Two tests covering both the non-spurious and the genuine-deviation cases.
14. [ ] Per-run reversibility register: `stepRuns.outputs.reversibilityRegister` contains one entry per row with `{ rowInputId, fingerprint, toolCallSequence, outputSummary }`. Append-only; verified by test. **Retrievability:** a documented SQL-ish query pattern in `docs/architecture.md` or the brief's After-Completion section demonstrates "what did row N do" extraction from the stored JSON — if the register is unqueryable, it is a log not audit evidence.
15. [ ] Heartbeat terminal cleanup disposes the in-memory ledger for the run (complete, failed, cancelled — all three terminal paths). No cross-run leakage under a test that runs two processes back-to-back.
16. [ ] **`--auto-approve-matching-pattern` flag removed outright.** CLI rejects the flag as unknown after this brief. Brief 184's flag-specific tests deleted. No deprecation notice; straight removal.
17. [ ] End-to-end: a 10-row `bulk-browser-smoke.yaml` process runs under supervised trust. Rows 1-2 prompt for approval; rows 3-10 auto-approve on exact match. One row (injected mid-run) produces a deviation; escalates; human approves the deviation; subsequent matching rows auto-approve again.
18. [ ] Insight-180 invocation guards on `recordFingerprintApproval`, `invalidateFingerprint`. Pure `computeFingerprint` and `classify` functions do NOT require guards — explicitly documented in the file header.
19. [ ] `docs/architecture.md` trust-tier section gains a one-paragraph note on fingerprint-aware auto-promotion, cross-referencing ADR-032.
20. [ ] Type-check, lint, full test suite all pass. No regressions.

## Review Process

1. Spawn review agent with `docs/architecture.md`, `docs/review-checklist.md`, ADR-032, ADR-007 (trust-earning), Briefs 182/183/184, and this brief.
2. Review agent specifically checks:
   - Fingerprint purity: is `computeFingerprint` actually side-effect-free, clock-independent, environment-independent? Any hidden non-determinism is a defect.
   - Value exclusion: does the fingerprint actually exclude values, or does a subtle case leak one (e.g., a selector that embeds the row id)?
   - Structural-vs-exact thresholds: can the structural-match threshold be set to 1 by config (accidental fast-path for fuzzy matches)? Should have a lower bound in code to prevent misuse.
   - Revocation correctness: after a rejection invalidates a fingerprint, does a subsequent identical call actually hold, or does the ledger race into a partially-invalid state?
   - Deviation classification: is the "≥N approved fingerprints before 'deviation' triggers" threshold correct, or does it fire spuriously on row 2?
   - Cross-run leakage: parallel runs — does ledger disposal in run A affect run B? State isolation test expected.
   - Trust-tier matrix: all three tiers × fingerprint-states (none/exact/structural/deviation) produce the correct behaviour? Full matrix of tests?
   - Stopgap-flag removal: is the removal actually complete, or does deprecated-but-functional code leave a second auto-approval pathway silently live?
   - Engine-core placement: is fingerprinting properly in `packages/core/` (engine-generic) and the browser-specific invocation properly in product layer?
3. Fresh-context reviewer re-reads as adversary: how does a malicious or confused process exploit fingerprint auto-promotion to execute unexpected writes?
4. Present work + review findings to human.

## Smoke Test

```bash
pnpm run type-check
pnpm cli sync

# Fingerprint computation purity
pnpm vitest run packages/core/src/harness/fingerprint.test.ts

# Ledger isolation + lifecycle
pnpm vitest run packages/core/src/harness/fingerprint-ledger.test.ts

# Trust-gate + fingerprint integration
pnpm vitest run src/engine/integration-handlers/browser.test.ts -t "fingerprint"

# End-to-end 10-row smoke with deviation injected (defaults: exactMatchApprovals=2, cap=50)
pnpm cli run processes/test/bulk-browser-smoke.yaml --trust-tier=supervised
# Expect: 2 approval prompts (rows 1-2, pattern established), 7 auto-approved (rows 3-5, 7-10),
# 1 deviation escalated on row 6, 1 re-approval of the deviation, row 6+ matching pattern auto-approves.
# 50-row cap not hit on a 10-row smoke; separate 75-row test exercises the re-affirmation prompt.

# 75-row smoke exercises re-affirmation
pnpm cli run processes/test/bulk-browser-cap-smoke.yaml --trust-tier=supervised
# Expect: 2 initial approvals, rows 3-52 auto-approve, row 53 re-affirmation prompt,
# user approves, rows 54-75 auto-approve. Total touches: 3 meaningful prompts across 75 rows.

# Verify reversibility register — documented query pattern
pnpm cli run-detail <runId> | jq '.steps[].outputs.reversibilityRegister[] | select(.rowInputId == "row-347")'
# Expect: single entry with fingerprint + toolCallSequence + outputSummary for that specific row.

# Verify stopgap flag outright removal (no deprecation)
pnpm cli run --auto-approve-matching-pattern processes/test/bulk-browser-smoke.yaml
# Expect: "error: unknown flag --auto-approve-matching-pattern" exit non-zero.
```

## After Completion

1. Update `docs/state.md` — Brief 185 complete; Parent Brief 182 now `complete`.
2. Update `docs/roadmap.md` — note browser protocol capability fully landed.
3. Update `docs/landscape.md` — browser-automation section gains a "what Ditto added on top" note describing fingerprinting as Original.
4. Phase retrospective: did the threshold defaults (1 exact, 3 structural) feel right on real work, or did users tune them? Did the a11y-tree structural fallback actually fire in real runs, or was exact always sufficient? Did any deviation escalation feel spurious (over-fire)? Did cross-run leakage ever occur in practice?
5. Write an insight if a design discovery emerged — "Structural fingerprints as trust-tier amplifier for repeatable work" is a candidate; verify that the pattern generalises beyond browser writes before absorbing.
6. Parent Brief 182's retrospective runs here: what did the three-brief phasing teach us? Was the ADR-032 split from ADR-005 justified by the statefulness divergence? Did the `BrowserRuntime` interface hold shape, or did 184/185 bend it?
7. Consider whether Brief 186 (Stagehand agent for exploration) is warranted, or whether `generate_process` + user-curated exploration is sufficient. The answer is evidence-driven: did users actually need an exploration tool, or did they author process YAMLs comfortably without one?
