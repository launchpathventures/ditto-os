# Insight-064: Benchmark Before Keep — Every Pipeline Handler Must Justify Its Place

**Date:** 2026-03-23
**Trigger:** PM triage challenge on whether metacognitive check (Brief 034b) adds value vs complexity. Decision: build it, but require benchmarks to prove it earns its place or cut it.
**Layers affected:** L3 Harness, L5 Learning
**Status:** active

## The Insight

Pipeline handlers that add LLM calls (cost in API mode, latency always) must have measurable benchmarks that justify their continued presence. "It might help" is not enough — the data must show it catches real issues. This applies to the metacognitive check (034b) first, but the principle extends to any future handler.

Build forward-looking infrastructure, but instrument it from day one. If a handler can't demonstrate value after sufficient data accumulation, it gets cut or demoted to opt-in only.

## Benchmarks for Metacognitive Check (034b)

1. **Flag rate** — % of steps where the check flags issues. If 0% after 50+ runs, it's dead weight.
2. **True positive rate** — of flagged steps, % where human agreed (rejected or edited). Proves signal, not noise.
3. **Catch rate** — steps flagged by metacognitive check but passed by review patterns. These are unique catches — the handler's reason to exist.
4. **False positive rate** — flagged steps the human approved unchanged. High rate = noise tax on the human.

The data already flows through the pipeline (step runs, activities, feedback records). Benchmarks are correlation queries, not new infrastructure.

## Decision Threshold

After 50 supervised runs with the metacognitive check active:
- If catch rate > 5% (unique issues found): keep and consider expanding
- If catch rate < 2% with flag rate < 5%: demote to opt-in only across all tiers
- If false positive rate > 30%: tune or cut

## Implications

- Brief 034b should include benchmark query or reporting as an acceptance criterion
- Future pipeline handlers should declare their benchmark criteria before shipping
- This is the "earn your place" principle applied to infrastructure, not just agents (mirrors trust earning for agents)

## Where It Should Land

- Brief 034b acceptance criteria (benchmark reporting)
- Architecture.md harness section (handler justification principle)
- Potentially ADR if the pattern generalises to all pipeline stages
