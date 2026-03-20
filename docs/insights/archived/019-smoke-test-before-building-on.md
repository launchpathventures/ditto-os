---
number: "019"
title: "Smoke-test before building on"
status: "absorbed into review checklist point 11 + brief template smoke test section"
emerged_from: "Phase 3 prep — first real execution of the engine"
date: 2026-03-20
---

## Observation

Phase 2 was marked complete and reviewed multiple times, but the engine had never been run. First execution revealed: 3 missing DB tables, 1 missing column, agents producing ungrounded output because input resolution doesn't exist. All of these were invisible to architecture review.

## Principle

Every phase must include a smoke test — actually run the code — before being marked complete. Review checklists catch design conformance. Only execution catches reality.

## Implications

- The review checklist needs a point: "Has this been executed end-to-end, not just type-checked?"
- `drizzle-kit push` or equivalent should run as part of `pnpm cli sync` to prevent schema drift
- Phase 5 ("end-to-end verification") as a separate phase is too late — verification should be continuous
- The dev process produced 3 phases of code that was never run. The process optimised for design fidelity over working software.

## Tension

Research-before-design and plan-before-build are correct principles. But they created a culture where "reviewed and type-checks" felt like "done." The missing step is: run it.
