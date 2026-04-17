# Insight-195: Parallel-Audit Before Declaring a Phase Complete

**Date:** 2026-04-16
**Trigger:** Deep user-journey review on `claude/enhance-user-journey-N2feS`. `docs/meta-process-roadmap.md` marked all 10 MPs complete; six parallel `Explore` agents auditing the actual code surfaced nine residual P0 gaps not tracked anywhere.
**Layers affected:** Cross-cutting — applies to every phase-closure claim, not a specific layer.
**Status:** active

## The Insight

A roadmap that marks "complete" against a phase tracks *intent landed*, not *invariants held*. The gap between the two is often filled with silent edge cases: a claim is verified against acceptance criteria that didn't think to ask certain questions. The nine P0s closed this session (shell injection via CLI arg interpolation, credential leak through tool output, budget pre-dispatch ordering, unvalidated LLM-generated YAML, stale `definitionOverride`, silent memory dropout, briefing N+1 queries, ambiguous intent handling, stale escalations that rotted) were all invisible to the roadmap *and* to the briefs the roadmap cited as complete. They surfaced only when an independent, fresh-context audit walked the code with new questions.

The methodology that worked: spawn six parallel `Explore` agents, one per robustness axis (memory, intent, process extraction, execution safety, follow-ups, communication, connections), each with a specific mandate and a list of pressure-test questions. Each returned ~1000-1500 words of prioritised findings with file:line evidence. Synthesising the six reports produced a ranked gap list that spanned the journey end-to-end. The cost was roughly one session's worth of agent orchestration; the find was nine P0s that would otherwise have surfaced in production.

Two properties made this work. First, *parallel* — the six audits ran concurrently and couldn't contaminate each other's premises. Second, *fresh context* — each agent received only its axis's brief, the architecture doc, and relevant code paths; none had the "it's done" lens of the roadmap.

## Implications

- **Before declaring any phase complete**, spawn a parallel-audit pass: 4-6 axes, each independent, each with specific pressure-test questions keyed to that axis. The ratio of cost to find is favourable.
- **Phase-closure briefs should cite the audit report**, not the roadmap self-assessment. The roadmap is the plan; the audit is the proof.
- **Audits must look at code, not at briefs.** Brief ACs describe what was intended; the audit's job is to find what was unintended.
- **"Scope adjustment on discovery" is a first-class outcome** of this methodology. When the audit finds the code reality differs from the brief premise (e.g., Brief 172: the "race" the audit flagged actually didn't exist because `recordSpend` wasn't called from production), the fix is to adjust scope transparently in the brief, not to force the original design through.
- **Fresh context is the asset.** Using the same conversation to write code and then review it erodes the review. Splitting into parallel agents with clean context per agent preserves the adversarial check.

## Where It Should Land

- Add to `docs/dev-process.md` as a required step between "phase work complete per briefs" and "phase marked complete in roadmap". Frame it as: "Parallel-audit pass before phase-closure claim".
- Update `docs/review-checklist.md` point 8 (Roadmap Freshness): when work claims to close a phase or meta-process set, the Documenter must verify an audit pass was run, not just that ACs were met.
- Absorb into `docs/architecture.md` harness-on-our-process section — we dogfood the pattern (maker-checker) for code; we should dogfood it for roadmap-state claims too.
