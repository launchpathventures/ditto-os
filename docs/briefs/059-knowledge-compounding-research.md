# Brief: Knowledge Compounding Research — Learning & Evolution Infrastructure

**Date:** 2026-03-30
**Status:** ready
**Depends on:** none (research brief — no code dependencies)
**Unlocks:** Architecture update to L5 Learning Layer + L2 Memory Model; future build brief for knowledge compounding meta-process

## Goal

- **Roadmap phase:** Phase 5 (Learning Layer — self-healing, feedback capture) + cross-cutting meta-process infrastructure
- **Capabilities:** Explicit knowledge extraction after task completion; solution knowledge memory category; prior knowledge retrieval at context assembly time

## Context

Insight-115 analyzed three viral Claude Code tool ecosystems (gstack 54.6K⭐, Superpowers 121K⭐, Compound Engineering 11.5K⭐) and identified a genuine gap in Ditto's learning infrastructure: **implicit feedback capture is necessary but insufficient.** Ditto's L5 Learning Layer tracks corrections, patterns, and degradation implicitly (edits-as-diffs, rejection rates, metric checks). But higher-order knowledge — the "why" behind a fix, what was tried and failed, prevention strategies, solution patterns — requires **deliberate extraction**, not just pattern detection from correction diffs.

CE's `/ce:compound` step spawns five parallel subagents after every task to extract structured, searchable solution knowledge. The article's core distinction: Anthropic's progress file is "tonight's closing notes" (linear continuity); CE's docs/solutions/ is the "recipe binder" (searchable accumulation). One is continuity. The other is compound interest.

Ditto already has the architectural pieces (Insight-042: Knowledge Management Is a Meta-Process, Insight-054: Meta Processes Are the Platform, three durable memory scopes, progressive disclosure at context assembly) but hasn't made the extraction step explicit or added a solution knowledge category to the memory model.

This research brief investigates how to close the gap — studying the gold standard implementations and extracting patterns that can be adopted into Ditto's existing architecture.

## Objective

Produce a research report that answers:
1. **What knowledge types does implicit L5 feedback miss?** Categorize the gap between what correction diffs capture and what deliberate extraction captures.
2. **How does CE's compound step actually work?** Extract implementation patterns from the CE repo — five subagent architecture, deduplication, categorization, retrieval at plan time.
3. **What other systems implement post-completion knowledge extraction?** Survey beyond CE: Reflexion (verbal reflection), AutoGPT memory, Devin session summaries, cursor-memory, and any research on agent learning.
4. **How should "solution knowledge" integrate with Ditto's existing memory model?** Propose whether this is a new memory scope, a tagged category within existing scopes, or a separate knowledge store. Consider how it interacts with agent-scoped, process-scoped, and self-scoped memory.
5. **How should knowledge retrieval work at context assembly time?** The progressive disclosure mechanism exists. What retrieval strategy surfaces relevant prior solutions without bloating context? Consider: semantic search, category matching, recency + relevance scoring.
6. **What is the right trigger for knowledge extraction?** Every task completion? Only significant ones? What defines "significant"? How does this map to Ditto's trust tiers and process types?
7. **How does this intersect with Ditto's homeostatic quality model?** Accumulated failure patterns (Insight-100) and approach/avoidance gradients (Insight-101) are related but distinct from solution knowledge. Map the relationship.

## Non-Goals

- Writing implementation code
- Designing the full meta-process YAML definition (that's the Architect's job after research)
- Proposing changes to trust computation (trust remains based on explicit human feedback only)
- Designing a UI for knowledge browsing (L6 concern, deferred)
- Evaluating vector databases or RAG infrastructure (premature — start with what SQLite can do)

## Inputs

1. `docs/insights/115-three-layer-harness-validation.md` — the triggering analysis
2. `docs/architecture.md` L2 (memory model, agent harness assembly), L5 (Learning Layer) — current design
3. `docs/insights/042-knowledge-management-is-a-meta-process.md` — prior thinking
4. `docs/insights/054-meta-processes-are-the-platform.md` — meta-process framing
5. `docs/insights/100-inner-critic-as-system-level-entity.md` — failure pattern accumulation
6. `docs/insights/101-homeostatic-quality-model.md` — quality regulation model
7. `docs/insights/031-research-extract-evolve-is-the-meta-process.md` — the research-extract-evolve cycle
8. `docs/insights/022-knowledge-needs-active-pruning.md` — knowledge lifecycle (pruning, not just accumulation)
9. CE repo source code — compound subagent implementation patterns
10. Anthropic harness blog posts (Nov 2025) — progress file and state management patterns

## Constraints

- **Composition first** — extract patterns from existing implementations before designing anything original. Every proposal must trace to a source or be explicitly marked "Original."
- **Must work with existing memory infrastructure** — three durable scopes (agent, process, self) + memory table with salience sorting + token-budgeted assembly. Don't propose infrastructure that requires replacing the memory system.
- **Must not break implicit feedback** — explicit extraction complements, never replaces, L5's implicit feedback signals. Both must coexist.
- **Must respect the pruning principle** (Insight-022) — knowledge that only accumulates without lifecycle management becomes noise. Research must address how solution knowledge ages, gets superseded, and gets pruned.
- **Privacy by design** — solution knowledge must not leak between processes that have different trust boundaries or between users in future multi-tenant scenarios.
- **Must be feasible at current scale** — Ditto is a single-user workspace today. The solution should work beautifully for one user with 5-20 processes, and not preclude scaling later.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Post-completion knowledge extraction | CE (EveryInc/compound-engineering-plugin) | pattern | Five-subagent compound step; deduplication + categorization architecture |
| Verbal reflection for agent learning | Reflexion (Shinn et al., NeurIPS 2023) | pattern | Verbal feedback stored in memory shapes future behavior without training |
| Session summaries and memory | Devin, AutoGPT, cursor-memory | pattern | Alternative approaches to cross-session knowledge persistence |
| Progress file as state | Anthropic harness blog (Nov 2025) | pattern | Linear session continuity mechanism — contrast with accumulative approach |
| Knowledge lifecycle | Insight-022, Insight-042 | pattern | Pruning and meta-process framing already in Ditto's design thinking |
| Failure pattern accumulation | Insight-100 (ADR-022) | pattern | Related but distinct knowledge type — intersection must be mapped |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `docs/research/knowledge-compounding-patterns.md` | Create: full research report answering the 7 questions above |
| `docs/insights/115-three-layer-harness-validation.md` | Modify: add cross-reference to research report when complete |

## User Experience

- **Jobs affected:** None — no user-facing changes (research deliverable)
- **Primitives involved:** None
- **Process-owner perspective:** N/A — internal infrastructure research
- **Interaction states:** N/A
- **Designer input:** Not invoked — no UX implications at research stage

## Acceptance Criteria

1. [ ] Research report exists at `docs/research/knowledge-compounding-patterns.md`
2. [ ] Report answers all 7 research questions with specific evidence (not speculation)
3. [ ] CE's compound implementation is analyzed at code level (not just from the article's description)
4. [ ] At least 3 alternative approaches to post-completion knowledge extraction are surveyed
5. [ ] Proposed memory model integration is concrete: shows how solution knowledge fits into the existing three-scope model with specific field/tag proposals
6. [ ] Retrieval strategy is concrete: shows how context assembly surfaces relevant solutions with specific mechanism proposals
7. [ ] Knowledge lifecycle is addressed: how solution knowledge ages, gets superseded, gets pruned (per Insight-022)
8. [ ] Relationship to failure pattern accumulation (Insight-100) and homeostatic quality model (Insight-101) is mapped
9. [ ] Every proposed pattern traces to a source project or is explicitly marked "Original"
10. [ ] Report includes a "Recommendation for Architect" section with prioritized next steps

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Does the research address all 7 questions? Are sources properly analyzed (not surface-level)? Does the memory model proposal respect existing infrastructure? Is the lifecycle addressed? Are recommendations actionable?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Verify research report exists and has substance
wc -l docs/research/knowledge-compounding-patterns.md
# Should be >200 lines (substantial research, not a stub)

# Verify all 7 questions are addressed
grep -c "^##" docs/research/knowledge-compounding-patterns.md
# Should show multiple sections covering each question
```

## After Completion

1. Update `docs/state.md` with what changed
2. Cross-reference Insight-115 with the research report
3. Hand off to Architect to design the knowledge compounding meta-process and memory model update
