# Insight-004: Briefs Should Be One Build Cycle, Not One Phase

**Date:** 2026-03-19
**Trigger:** Phase 2 brief grew to 27 acceptance criteria across 7 subsystems. Architect and human agreed it was too large for a single build cycle — the risk of compounding integration errors and the inability to test/ship incrementally made it a bad build instruction despite being a good design document.
**Layers affected:** Cross-cutting (development process)
**Status:** absorbed into `docs/dev-process.md` (Brief Sizing section)

## The Insight

A brief is both a **design document** (what to build and why) and a **build instruction** (what a builder implements in one cycle). These two purposes have different size constraints.

As a design document, a phase-level brief is valuable — it shows how all the pieces fit together, maintains coherence, and ensures nothing is designed in isolation. As a build instruction, it's dangerous — a builder trying to implement 7 subsystems with 27 acceptance criteria in one pass faces compounding integration risk and cannot ship or test incrementally.

The right approach is:
1. **Design at phase level** — one document showing the full picture (the "parent brief")
2. **Build at sub-phase level** — split into sub-briefs along natural dependency seams, each independently testable and shippable

### Sizing heuristics for sub-briefs

A well-sized sub-brief has:
- **8-17 acceptance criteria** — enough to be meaningful, few enough to hold in working memory
- **One integration seam** — it plugs into the system at one point (e.g., replaces a stub, extends an interface)
- **Testable in isolation** — you can verify it works without the next sub-brief being done
- **Shippable** — the system is in a better state after this sub-brief than before, even if the phase isn't complete
- **Clear dependency direction** — it either depends on a prior sub-brief or unlocks a subsequent one, not both cyclically

### Splitting heuristics

Look for these natural seams:
- **Skeleton + flesh** — build the structural skeleton first (interfaces, stubs, pipeline), then fill in the real implementations
- **Core path + extensions** — build the critical path first, then add capabilities that plug in
- **Data + logic** — schema changes first, then the code that uses them (though often these are small enough to combine)

### Anti-patterns

- **One acceptance criterion per brief** — too granular, overhead of brief/review/documenter exceeds the work
- **One brief per subsystem regardless of size** — misses dependencies between subsystems that must ship together
- **"The brief is just the design, the builder will figure out sequencing"** — pushes architectural decisions (what to stub, what interfaces to define) down to the builder, who may not have full context

## Implications

**For the dev process:** The Architect should always ask: "Can a builder implement this in one focused session with one review cycle?" If not, split it. The parent brief remains the design reference; sub-briefs are the build instructions.

**For the Researcher/Architect handoff:** Research can still be phase-level. The split happens at the Architect stage, not earlier.

**For review:** Each sub-brief gets its own review cycle. The parent brief's review covers design coherence; sub-brief reviews cover implementation correctness.

## Where It Should Land

- **`docs/dev-process.md`** — Add brief sizing guidance to the Architect role contract
- **`docs/briefs/000-template.md`** — Add optional "Depends on" and "Unlocks" fields for sub-briefs
- **Dev Architect skill (`.claude/commands/dev-architect.md`)** — Add sizing self-check: "Is this brief implementable in one build cycle?"
