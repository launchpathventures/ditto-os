# Brief: User Journey Robustness — P0 Gap Closure (parent)

**Date:** 2026-04-16
**Status:** complete
**Depends on:** Briefs 145-148, 155-165 (meta-process roadmap MP-1 through MP-10)
**Unlocks:** Sub-briefs 170-178. After all sub-briefs close, the user journey — from "I need X" through understanding, planning, safe execution, and reliable follow-up — is robust end-to-end.

## Goal

- **Roadmap phase:** Phase 14 (Network Agent) + Phase 11 (Learning Loop)
- **Capabilities:** Closes P0 residual gaps across the six robustness axes the user-journey review surfaced (memory, intent, process extraction, execution safety, follow-ups, communication, connections).

## Context

The meta-process roadmap (`docs/meta-process-roadmap.md`) marks MP-1 through MP-10 complete. A deep cross-cutting audit of the actual code surfaced 9 P0 gaps that are not tracked in the roadmap and that can individually break the journey promise: *"user asks Ditto for help → Ditto robustly understands, plans a process, and executes safely."* The gaps span security (shell injection, credential leak), correctness (unvalidated LLM-generated YAML, stale run overrides), observability (silent memory dropout), performance (briefing N+1), UX (silent low-confidence routing), and reliability (stale escalations that rot forever).

None of these are regressions — each is either a never-closed edge case or an unvalidated claim. Collectively they are the difference between "passes demos" and "trustworthy daily operation".

## Objective

Close all 9 P0 gaps via sub-briefs 170-178, delivered independently and reviewed per-brief. After completion: no known P0 in the core user journey; the roadmap's meta-process claims match the code.

## Non-Goals

- P1/P2 gaps surfaced in the audit — tracked for a follow-up pass.
- Rewriting any completed meta-process brief. Sub-briefs are surgical.
- New feature work. Every change here is a correctness/safety/UX fix on existing capability.
- Zapier SDK (Brief 113) remains deferred.

## Inputs

1. `docs/meta-process-roadmap.md` — the existing user-journey spec
2. `docs/architecture.md` — Layers 1-5, trust tiers
3. `docs/review-checklist.md` — 12-point architecture checklist for each sub-brief review
4. The six audit reports produced during this review (summarized in sub-brief Context sections)

## Sub-Briefs

Ordered by implementation priority (security → correctness → observability → UX → reliability):

| # | Sub-brief | Axis | P0 gap |
|---|-----------|------|--------|
| 170 | CLI Tool Arg Escaping | Connections/security | Shell injection via `exec()` template interpolation |
| 171 | Tool Output Credential Scrubbing | Connections/security | Credentials in tool responses leak into LLM context |
| 172 | Budget Spend-Check Ordering | Execution safety | Step executes before spend check — half-sent outputs possible |
| 173 | YAML Round-Trip Validation | Process extraction | LLM-generated YAML can be unparseable yet stored |
| 174 | `definitionOverride` Cleanup | Process extraction | Stale adapt overrides leak into subsequent runs |
| 175 | Memory Dropout Visibility | Memory | Token budget silently drops memories, no trace |
| 176 | Briefing Query Efficiency | Communication | `assembleFocus` N+1 queries cause briefing latency |
| 177 | Ambiguous Intent Clarification | Task analysis | Self guesses on vague intent instead of asking |
| 178 | Stale Escalation Auto-Action | Follow-ups | Escalations detected but never actioned; rot forever |

## Constraints

- Each sub-brief must land independently, with its own tests, review, and state.md update.
- No change to public APIs of `@ditto/core` without an ADR.
- Keep Ditto-product vs engine-core separation (CLAUDE.md §Engine Core).
- Every sub-brief that modifies YAML `tools:` declarations must include the Insight-180 AC.
- Every sub-brief that adds external side-effects must include the `stepRunId` invocation guard.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Gap synthesis methodology | Six parallel Explore agents auditing the six robustness axes | pattern | Parallel independent audits reduce confirmation bias |
| Priority ordering (security → correctness → UX → reliability) | OWASP + Google SRE pyramid | pattern | Reliability stacks on top of correctness stacks on top of security |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `docs/briefs/170-cli-tool-arg-escaping.md` | Create |
| `docs/briefs/171-tool-output-credential-scrubbing.md` | Create |
| `docs/briefs/172-budget-spend-check-ordering.md` | Create |
| `docs/briefs/173-yaml-round-trip-validation.md` | Create |
| `docs/briefs/174-definition-override-cleanup.md` | Create |
| `docs/briefs/175-memory-dropout-visibility.md` | Create |
| `docs/briefs/176-briefing-query-efficiency.md` | Create |
| `docs/briefs/177-ambiguous-intent-clarification.md` | Create |
| `docs/briefs/178-stale-escalation-auto-action.md` | Create |
| `docs/state.md` | Modify: record user-journey review outcome + sub-brief index |
| `docs/roadmap.md` | Modify: add note referencing this parent brief |

## User Experience

- **Jobs affected:** All six (Orient, Review, Define, Delegate, Capture, Decide) — because these gaps span the whole journey.
- **Process-owner perspective:** After closure, ambiguous asks get clarified, long escalations don't rot, briefings stay fast at scale, corrections aren't silently forgotten, and credentials can't leak via tool output or shell injection. The user doesn't see these fixes directly — they see things *not* break.

## Acceptance Criteria

1. [ ] All 9 sub-briefs (170-178) are written, reviewed, and marked complete.
2. [ ] Each sub-brief has independent tests and CI passes at root (`pnpm test`).
3. [ ] `docs/state.md` reflects each sub-brief's completion with file evidence.
4. [ ] `docs/meta-process-roadmap.md` gets a note: "P0 residuals closed by briefs 169-178".
5. [ ] Retrospective in `docs/changelog.md`: what the audit found, what surprised us, what changes for next review cycle.

## Review Process

Each sub-brief gets its own review. The parent brief is "complete" when all nine sub-briefs are complete and `docs/state.md` reflects that.

## Smoke Test

Run existing e2e suite + each sub-brief's new tests:
```bash
pnpm test && pnpm exec playwright test
```
No regressions. Sub-brief counts bump accordingly.

## After Completion

1. Update `docs/state.md` with summary paragraph of user-journey robustness closure.
2. Update `docs/meta-process-roadmap.md` final-closure note.
3. Retrospective — capture insights about audit methodology (parallel Explore agents) for future reviews. Likely candidate for `docs/insights/`.
