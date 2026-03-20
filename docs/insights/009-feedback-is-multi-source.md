# Insight-009: Feedback Is Multi-Source, Not Just Human Review

**Date:** 2026-03-19
**Trigger:** Phase 3 trust earning research — research narrowly scoped to human approve/edit/reject, missing the full feedback topology
**Layers affected:** L3 Harness, L4 Awareness, L5 Learning, L6 Human
**Status:** active

## The Insight

Trust earning cannot be designed around a single feedback channel (human reviews agent output). The architecture implies at least seven distinct feedback sources, each with different trust signal characteristics:

| Source | Signal type | Latency | Reliability |
|--------|------------|---------|-------------|
| Human (direct review) | Approve/edit/reject | Immediate | High but subjective |
| Internal agent (review pattern) | Pass/flag/retry from maker-checker, adversarial review | Immediate | Medium — agent quality varies |
| Downstream process | Input quality reports, rejection of received data | Delayed | High — objective |
| System/script | Test pass/fail, API accept/reject, validation results | Immediate | High — deterministic |
| Self-assessment | Agent confidence score on own output | Immediate | Low — uncalibrated |
| External agent/system | Third-party validation, compliance check | Delayed | Context-dependent |
| Time/outcome | Did the decision/prediction prove correct? | Very delayed | High but attribution is hard |

A trust earning system that only counts human approvals will:
1. Miss the majority of available signal (most steps don't go to human review at higher tiers)
2. Create a perverse incentive to stay at supervised tier where more data is collected
3. Ignore the most objective signals (system validation, downstream acceptance)

The Phase 3 design must account for which sources contribute to trust, how they're weighted, and how they interact. A step that passes all automated checks but gets edited by a human is a different signal than one that fails tests.

## Implications

- **Trust data model** must include a `source` field (human, agent, system, downstream, outcome) — not assume all feedback is human
- **UX for trust visibility** (Trust Control primitive #11) must show trust contributions by source so the human understands *why* trust is at a given level
- **Governance** must define who/what can influence trust — can an agent's review increase another agent's trust? If so, what prevents rubber-stamping?
- **Phase 3 scope** may need to explicitly decide which sources are in-scope (human + system is likely sufficient for dogfood) vs deferred to Phase 4+ (downstream, outcome)
- The review patterns already built (maker-checker, adversarial, spec-testing) are producing trust-relevant signals that aren't being captured as trust data

## Phase 2 Feedback Already Being Generated (Not Consumed)

The harness pipeline built in Phase 2 records every decision to `harnessDecisions`, but this data isn't feeding trust. Specifically:

| Signal | Where it lives | Trust relevance |
|--------|---------------|-----------------|
| Review verdict (pass/flag/retry) | `harnessDecisions.reviewResult` | Direct: pass = positive, flag = negative |
| Retries used before passing | `harnessDecisions.reviewDetails.retriesUsed` | Indirect: 0 retries = stronger positive than 2 retries |
| Per-criterion spec-test results | `harnessDecisions.reviewDetails.layers[].criteriaResults` | Direct: which quality criteria pass/fail |
| Whether human agreed with reviewer | Absent — not recorded | Critical gap: human overriding a "flag" is a signal about both agent and reviewer |
| Script step pass/fail | `stepRuns.status` (success/failed) | Direct: deterministic, high-reliability signal |
| Agent confidence score | `stepResult.confidence` (if set) | Indirect: uncalibrated, but trends are meaningful |

Phase 3 should consume these existing signals, not just the new human feedback path. The `harnessDecisions` table is already an event log — it just needs to be read as trust input.

## Where It Should Land

Architecture spec L3 trust tier section — expand the trust earning model to enumerate feedback sources. Phase 3 brief — constrain which sources are in-scope. ADR-004 (trust) — define the multi-source trust data model.
