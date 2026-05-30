# Brief 282: Network Audit Substrate, Wrapper-Step-Run Guard, Central Privacy Scrubber

**Date:** 2026-05-18
**Status:** implemented + fresh-context reviewed APPROVE after `/dev-review` fixes (2026-05-18); pending human approval
**Depends on:** Briefs 272-274 (Member Signal, claims, sources, Active Request data to scrub/audit)
**Unlocks:** Sub-briefs 283, 284 (both write through this substrate); the foundation checkpoint

> Foundation sub-brief 1 of 3 under parent **Brief 278**. This is the substrate every other Network side-effecting write depends on. Build order: **282 → 283 → 284**.

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** The audit + scrub + step-run-guard substrate for Member Signals, Active Requests, manual search, discovery, watch, share, and intro surfaces.

## Context

Parent Brief 278 requires a mandatory audit trail, mandatory private-leakage scrubbing on every public/search/share/email surface, and `stepRunId` guards on every side-effecting Network function. Sub-briefs 283 and 284 (source-policy, suppression, email-compliance, export/delete) all write through this layer, so it must land first. The decisions for this sub-brief were resolved by the parent (Resolved Open Questions R-Q1, R-Q2, R-Q10).

## Objective

A typed, append-only, step-run-guarded `network_audit_events` writer and a central privacy scrubber exist and cover all eight leakage surfaces, with tests proving private/on-request/hidden claims never leak and that bypassing the step-run guard writes nothing.

## Non-Goals

- No tamper-evident hash-chain (R-Q2: reserved nullable `prevHash` column only, unwired).
- No per-domain audit tables and no enum changes to the three existing domain audit tables (R-Q1: one new generic table; existing tables untouched).
- No operator UI for the audit log (that is sub-brief 286).
- No source-policy/suppression/email logic (sub-brief 283).
- No reconciliation of the lane-step JSONL with the decision audit — they are deliberately separate layers (R-Q10).

## Inputs

1. `docs/briefs/278-trust-privacy-admin-observability.md` — parent; §Resolved Open Questions R-Q1, R-Q2, R-Q10; §Security.
2. `docs/research/278-trust-privacy-admin.md` — §6 (scrubber options + the two internal precedents), §9 (audit-log options), §15 #1/#10.
3. `src/engine/network-step-run.ts` — `createNetworkLaneStepRun`; the canonical wrapper-run minter (reuse, Insight-232).
4. `packages/web/app/api/v1/network/search/route.ts` — the canonical guarded-route shape (`hasCallerStepRun`, server-side mint, falsy rejection).
5. `src/engine/connection-proposal.ts` — internal scrub precedent A (proposal-text scrub) to **follow** as the precedent for the new central scrubber. We do not modify `connection-proposal.ts` itself; the new `network-privacy-scrubber.ts` adopts its scrubbing approach for a wider surface set.
6. `src/engine/integration-handlers/scrub.ts` — internal scrub precedent B (credential-value scrub) for the known-value-set pattern.
7. `packages/core/src/db/network/schema.ts` — Network-tier schema; existing three domain audit tables for shape consistency.
8. `drizzle/network/meta/_journal.json` — next free idx (Insight-190; **9** at design time — re-verify at build).
9. `packages/core/src/content-blocks.ts` — `NetworkProfileCardBlock` (the `antiPersonaMd` field the scrubber/render must null for non-owners — Brief 261 Hard Rule #5).

## Constraints

- Side-effecting functions require `stepRunId` per Insight-180. `writeNetworkAuditEvent` refuses to write without a valid harness-step-origin run.
- The scrubber is a pure function (no side effects, no DB writes) — it is called *by* guarded callers, it is not itself a guarded tool.
- `network_audit_events` has **no UPDATE or DELETE code path** (R-Q2 app-enforced append-only). Retention purge (sub-brief 284) writes a tombstone row; it never deletes audit rows.
- The audit table is the **decision-level** layer; the `createNetworkLaneStepRun` step JSONL stays the **provenance/execution** layer. They link only by `stepRunId` (R-Q10). Do not collapse them.
- Network-tier schema follows Insight-190: add the table to `packages/core/src/db/network/schema.ts`, claim the next free journal idx at build time (do not hardcode), run `drizzle-kit generate`, verify the SQL file exists.
- **Hard Rule #5 (origin: Brief 259 system prompt; carried forward as a binding rule by Brief 261).** The scrubber must null `NetworkProfileCardBlock.antiPersonaMd` for any non-owner context, and the anti-persona text must never appear in any of the eight surfaces. Enforce at the block level too (parent §Security), not only in the scrubber — a future caller that bypasses the scrubber still cannot leak the anti-persona text.
- No new external dependency.
- `@ditto/core` boundary: the schema table goes in core's network schema file (established Network-tier location, ADR-036); `network-audit.ts` and `network-privacy-scrubber.ts` are Ditto product code in `src/engine/` ("could ProcessOS use this?" — no, Network-product-specific).
- **Reserved `prevHash` column rationale (R-Q2).** The column is added now even though it is unwired because (a) the Network journal-idx queue means we are migrating this table exactly once now and want to avoid a second migration later that touches every audit row, and (b) tamper-evident hash-chain audit is on the Network trust roadmap (parent §After Completion #5 — an ADR for the trust/privacy model is considered at parent closeout, and hash-chaining is the natural next step once decision audit is mature). Adding the column once is cheap; backfilling it later means re-migrating an append-only table.
- **Scrubber-bypass discipline.** Callers of the eight scrubbed surfaces invoke `scrubForSurface` before render or send — no field is rendered or transmitted that has not passed through it. The single documented intentional bypass is the **operator audited reveal** in sub-brief 286 (a deliberate admin-only path that writes its own audit row recording the reveal); no other bypasses are introduced. The block-level `antiPersonaMd: null` enforcement (parent §Security) is the belt-and-braces second line so a future caller cannot accidentally leak the anti-persona text by skipping the scrubber.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Wrapper-step-run guard | `src/engine/network-step-run.ts`; `api/v1/network/search/route.ts`; Insight-232 | adopt | The canonical guarded-route pattern already in the Network lane. |
| Generic audit-event row | Research §9a; existing three Network domain audit tables | pattern | Generic `eventClass` row spans the breadth of event classes the brief enumerates without enum churn. |
| App-append-only + reserved `prevHash` | Research §9; Insight-234 (durable terminal state) | pattern | Proportionate tamper-evidence; future hash-chain becomes a non-migration. |
| Surface scrubber | `connection-proposal.ts` (adopt), `integration-handlers/scrub.ts` (pattern), research §6c PII strategies | adopt + pattern + original | Two internal scrubbers cover known-value sets; the general public/search/share/email surface scrub is the Original-to-Ditto extension. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/network/schema.ts` | Modify: add `networkAuditEvents` table — `id`, `eventClass` (enum/text), `subjectType`, `subjectId`, `actorType` (`user`/`visitor`/`admin`/`system`), `actorId`, `reasonCode` (nullable), `metadata jsonb`, `stepRunId`, `prevHash` (nullable, reserved/unwired), `createdAt`. Indexes on `(eventClass, createdAt)`, `(subjectType, subjectId)`, `(actorType, actorId)`. |
| `drizzle/network/<next-idx>_*.sql` + snapshot + `_journal.json` | Create: migration for the new table (Insight-190 — claim next free idx at build, generate, verify SQL exists). |
| `src/engine/network-audit.ts` | Create: `writeNetworkAuditEvent({ stepRunId, eventClass, subjectType, subjectId, actorType, actorId, reasonCode?, metadata? })` — validates the step run, rejects falsy/absent/spoofed, inserts one row, never updates/deletes. Typed `NetworkAuditEventClass` union covering all parent AC #9 event classes. |
| `src/engine/network-privacy-scrubber.ts` | Create: `scrubForSurface(payload, { surface, viewerContext })` where `surface ∈ {public-profile, share, search-result, proposal-email, intro-email, watch-digest, claim-invite, discovery-admin-preview}`. Removes/withholds private, on-request (unless approved-for-this-viewer), and hidden claims; nulls `antiPersonaMd` for non-owner contexts; returns the scrubbed payload + a `scrubDecision` summary (counts withheld by reason — feeds the sealed-data "N things are private" line and the audit metadata). Pure function. |
| `src/engine/network-audit.test.ts` | Create: append-only, step-run-guard (absent/falsy/spoofed → no write), event-class coverage. |
| `src/engine/network-privacy-scrubber.test.ts` | Create: per-surface leakage tests; `antiPersonaMd`-null assertion for every non-owner surface. |

## User Experience

- **Jobs affected:** None directly — this is substrate. It *enables* Curate/Orient/Decide/Review surfaces in later sub-briefs.
- **Primitives involved:** None rendered here. The scrubber produces the scrubbed payload that later blocks render; it must guarantee `NetworkProfileCardBlock.antiPersonaMd` is `null` on non-owner output.
- **Process-owner perspective:** invisible but load-bearing — every later "what's public vs private" answer and every audit-log row is correct only if this layer is correct.
- **Interaction states:** N/A (no UI).
- **Designer input:** `docs/research/278-trust-privacy-admin-ux.md` §3.1 (legibility-by-default, the `scrubDecision` "N things are private" sealed line), §4.6 (bounded admin visibility — the scrubber's `discovery-admin-preview` surface is the metadata-not-raw default).

## Acceptance Criteria

1. [ ] (Parent AC #1) `scrubForSurface` accepts and correctly scrubs all eight surfaces: public-profile, share, search-result, proposal-email, intro-email, watch-digest, claim-invite, discovery-admin-preview.
2. [ ] (Parent AC #2) Tests prove `visibility ∈ {private, hidden}` and un-approved `on-request` claims do not appear in any of the eight surface outputs; and `NetworkProfileCardBlock.antiPersonaMd` is `null` on every non-owner surface (Brief 261 Hard Rule #5).
3. [ ] (Parent AC #9) `writeNetworkAuditEvent` supports every event class in parent AC #9 (source add/remove, claim edit/visibility, request edit, search feedback, invitation-candidate score, operator approve/suppress, invite sent, claim, decline, complaint, delete) via a typed `NetworkAuditEventClass` union.
4. [ ] (Parent AC #10) `writeNetworkAuditEvent` rejects absent, falsy (`""`, `0`, `null`, `false`), and spoofed/non-harness `stepRunId` and writes no row in every such case (test-asserted).
5. [ ] `networkAuditEvents` has no UPDATE or DELETE code path anywhere in the codebase (grep-asserted in the test or a lint check); `prevHash` exists in the schema and is nullable/unwired.
6. [ ] The migration follows Insight-190: a journal entry exists at the next free idx with a matching SQL file and snapshot; root `pnpm run type-check` passes.
7. [ ] The audit row carries `stepRunId`; a unit test demonstrates the decision audit and the lane-step JSONL remain separate layers linked only by that id (no field duplication of step output into the audit row).
8. [ ] The scrubber is a pure function: a test asserts it performs no DB or network I/O (no db import; called with a fixture payload, returns deterministically).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + parent Brief 278 + this sub-brief.
2. Review agent checks: append-only enforcement (no mutate/delete path), step-run-guard falsy rejection, all 8 scrubber surfaces + `antiPersonaMd` null, R-Q1/Q2/Q10 decisions implemented as specified, Insight-190 migration integrity.
3. Present work + review findings to the human (this is part of the foundation checkpoint — reviewed together with 283, 284 before Brief 279).

## Smoke Test

```bash
pnpm vitest run src/engine/network-audit.test.ts src/engine/network-privacy-scrubber.test.ts
pnpm run type-check

# Manual:
# 1. Call writeNetworkAuditEvent with stepRunId="" and with a fabricated id → both write zero rows.
# 2. Run a fixture Member Signal with one private + one hidden + one on-request + one public claim
#    through scrubForSurface for all 8 surfaces → only the public (and viewer-approved on-request) claim appears;
#    antiPersonaMd is null on every non-owner surface.
# 3. Inspect the migration: journal idx has a matching .sql file (Insight-190).
```

## After Completion

1. Update `docs/state.md` (sub-brief 282 complete; substrate available for 283/284).
2. Update `docs/roadmap.md` row 278.
3. Phase retrospective notes feed the foundation-checkpoint retro.
4. No ADR yet — the trust/privacy-model ADR is considered at parent closeout (parent §After Completion #5).
