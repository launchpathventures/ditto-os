# ADR-028: Deliberative Perspectives — Multi-Lens Decision Enrichment

**Date:** 2026-04-12
**Status:** proposed

## Context

### The Problem

Ditto's harness evaluates whether outputs are correct (review patterns), whether the agent's reasoning is sound (metacognitive check), and whether accumulated failure patterns apply (ADR-022). But no mechanism enriches decision quality by considering the same problem from fundamentally different angles before the Self synthesizes a response.

The architecture spec (Layer 3) defines four review patterns: maker-checker, adversarial, spec-testing, and ensemble consensus. The first three are implemented. Ensemble consensus ("multiple agents produce independently, compare for divergence") is specified but unbuilt — and the naive version (same task, multiple agents, compare outputs) is the wrong pattern for Ditto's needs.

The question posed: would a "council of agents" representing different personalities and skills — expansionist, contrarian, first-principles thinker, executor, chairman — level up Alex's thinking? Inspired by Karpathy's `llm-council` (parallel generation → anonymized peer review → chairman synthesis).

### Research Findings

External research surveyed Karpathy's implementation, AutoGen/CrewAI/LangGraph patterns, academic debate research (Du et al. 2023, Mixture-of-Agents 2024, ICLR 2025 meta-analysis), and practical anti-patterns.

**What works:**

1. **Multi-agent debate improves factuality and reasoning** on complex, ambiguous problems (Du et al. 2023, MIT/Google Brain). Performance improves with more agents and more rounds — up to a point.

2. **Karpathy's three-stage architecture** (parallel generation → anonymized peer review → chairman synthesis) is effective because it separates generation from critique and prevents favoritism through anonymization.

3. **Sparse communication topology outperforms all-to-all** (AutoGen research). Each agent seeing 2-3 neighbors produces better results than every agent seeing every response.

4. **Same model with different prompts works** (Self-MoA 2025). A single strong model with role-differentiated prompts outperforms mixed-model ensembles by 6.6% on AlpacaEval 2.0. Multiple providers are unnecessary.

5. **Cognitive function archetypes outperform personality archetypes** (arXiv:2602.11924). "Risk assessor" is more reliable than "cautious pessimist." Function-defined roles are evaluable; personality-defined roles are vibes.

6. **Devil's advocate perspectives improve group decision accuracy** without increasing cognitive load (IUI 2024).

**What fails:**

1. **Multi-agent debate fails to consistently beat single-agent strategies** on well-defined problems (ICLR 2025 meta-analysis). Self-Consistency (same model, multiple samples, majority vote) is cheaper and equally effective for convergent problems.

2. **Flat "bag of agents" topologies amplify errors up to 17.2x** vs single-agent baselines. The solution is structured coordination, not more agents.

3. **Token explosion is real.** Average 4.3x amplification per agent. A 5-perspective deliberation on a 2K-token step costs ~40K tokens for perspectives alone.

4. **False consensus through sycophancy.** LLMs converge on wrong answers through social pressure when they see each other's outputs without structural safeguards.

5. **Diminishing returns after 2-3 rounds.** More debate rounds add tokens without accuracy gains.

6. **Multi-Persona performed worst** in the ICLR 2025 benchmarks — personality-based role assignment is unreliable.

### Architectural Constraints (from existing insights)

- **Insight-159 (Self IS Alex):** Users talk to one entity. Perspectives are internal machinery — the user sees Alex who has thought deeply, not a committee debating.
- **Insight-165 (Cognitive Mode Extensions Are Judgment Shifts):** Perspectives are cognitive calibration, not persona switches. They change what angles Alex considers, not who speaks.
- **Insight-002 (Review Is Compositional):** Perspectives are a composable layer in the review stack, not a replacement for existing patterns.

### Forces

1. **Complex decisions benefit from diverse perspectives.** Strategic goal framing, process design, risk assessment — these are exactly the ambiguous, consequence-bearing decisions where blind spots are the real risk.

2. **Simple decisions don't.** Routine process execution with proven trust doesn't need five perspectives. The cost/benefit ratio is wrong.

3. **The Self is already the chairman.** ADR-016 defines the Self as the entity that synthesizes across meta processes. Adding a "chairman agent" would duplicate the Self's role.

4. **The harness pipeline is the right home.** Perspectives should compose with existing review patterns, not create a parallel evaluation path.

5. **Feedback must shape composition.** Which perspectives add value varies by process type. The system must learn this, not have it prescribed forever.

6. **Ensemble consensus needs an upgrade.** The architecture already has a slot for "multiple agents, compare for divergence." This ADR fills that slot with a richer pattern.

## Decision

### 1. Deliberative Perspectives as a harness-level pattern

Replace the unimplemented "Ensemble Consensus" review pattern with **Deliberative Perspectives** — a composable harness handler that evaluates a step's output through configurable cognitive lenses before the Self synthesizes.

**Updated review patterns table (Layer 3):**

| Pattern | How it works | Use when |
|---------|-------------|----------|
| **Maker-Checker** | Agent A produces, Agent B reviews against spec | Standard processes |
| **Adversarial Review** | Agent B prompted specifically to find flaws | Important outputs |
| **Specification Testing** | Validation agent checks output against defined criteria | Established processes |
| **Deliberative Perspectives** | Configurable cognitive lenses evaluate from different angles; Self synthesizes | Complex/ambiguous decisions, goal framing, process design |

### 2. Perspectives are cognitive lenses, not personas

Each perspective is defined by:

```typescript
interface PerspectiveLens {
  id: string;                    // e.g. "contrarian", "first-principles"
  name: string;                  // Human-readable
  cognitiveFunction: string;     // What this lens does (evaluable)
  systemPrompt: string;          // The lens-specific prompt
  evaluationQuestions: string[];  // What this lens asks of the output
  memoryCategories?: string[];   // ADR-022 failure knowledge to inject
  costTier: "fast" | "capable";  // Model routing hint (Brief 033)
}
```

**Standard library of lenses:**

| Lens | Cognitive Function | What It Asks | Memory Injection |
|------|-------------------|-------------|-----------------|
| **Contrarian** | Risk assessment, assumption challenging | "What could go wrong? What assumption is wrong? What's the worst case?" | `failure_pattern`, `overconfidence_pattern` (ADR-022) |
| **Expansionist** | Opportunity identification, divergent thinking | "What else could this enable? What adjacent possibilities exist? What's the second-order effect?" | None |
| **First Principles** | Reductive analysis, foundational reasoning | "Strip away assumptions — what's actually true? What's the simplest version? What's the core problem?" | None |
| **Executor** | Pragmatic sequencing, feasibility assessment | "How do we actually ship this? What's the critical path? What's the first concrete step?" | None |
| **Customer Advocate** | External perspective, empathy | "How does the end user experience this? What do they actually need? What would frustrate them?" | None |
| **Historian** | Pattern matching, precedent | "What have we tried before? What patterns from past decisions apply? What does accumulated data show?" | `correction` memories, `solution` memories (Brief 060) |
| **Simplifier** | Complexity reduction, essentialism | "Is this actually necessary? What can be removed? What's the minimum viable version?" | None |

Lenses are extensible — users and processes can define custom lenses. The standard library is the default; processes override or extend per their needs.

### 3. Two-stage architecture (adapted from Karpathy)

**Stage 1 — Parallel Perspective Generation:**
Each configured lens receives:
- The step's output (what's being evaluated)
- The process context (quality criteria, goal ancestry)
- Lens-specific memory injection (from ADR-022 failure knowledge)
- Lens-specific system prompt + evaluation questions

Lenses run in parallel (no inter-lens communication in stage 1). Each returns:

```typescript
interface PerspectiveResult {
  lensId: string;
  assessment: string;          // The lens's evaluation
  signals: PerspectiveSignal[];  // Structured: opportunity | risk | simplification | precedent | ...
  confidence: "high" | "medium" | "low";
  costCents: number;
}

interface PerspectiveSignal {
  type: "opportunity" | "risk" | "simplification" | "precedent" | "feasibility" | "user-impact";
  summary: string;             // One sentence
  severity: "critical" | "significant" | "minor";
  evidence?: string;           // What supports this signal
}
```

**Stage 2 — Self Synthesis:**
The Self (already the chairman per ADR-016) receives all perspective results and synthesizes:
- Strongest arguments across lenses
- Points of convergence (multiple lenses flagged the same thing)
- Points of genuine divergence (where lenses disagree)
- A single recommendation incorporating the most valuable signals

The user sees Alex's synthesized recommendation. Perspective details are available on demand (drill-down in the Review Queue, not in the primary response).

**No Stage 3 (peer review between lenses).** Research shows single-pass perspectives with chairman synthesis has the best cost/quality ratio for a governance harness. Multi-round debate is reserved for research tools, not production decision-making.

### 4. Process declaration

Perspectives are declared on process definitions, alongside existing review patterns:

```yaml
# In process YAML
harness:
  review: ["spec-testing"]
  perspectives:
    lenses: ["contrarian", "first-principles", "executor"]
    trigger: "always" | "low-confidence" | "novel-input"
    model_tier: "fast"          # Use fast model for perspectives (Brief 033)
```

**Trigger conditions:**

| Trigger | When perspectives run | Use for |
|---------|---------------------|---------|
| `always` | Every step execution | Critical/compliance processes, goal framing |
| `low-confidence` | Only when step execution returns low/medium confidence | Cost-optimized: perspectives where they're most needed |
| `novel-input` | When input signature differs significantly from prior runs | Catches novel situations that routine processing might mishandle |

### 5. Pipeline position

Deliberative Perspectives runs as a new handler after `review-pattern` and before `trust-gate`:

```
... existing handlers ...
6.  metacognitive-check        (self-review)
7.  broadcast-direct-classifier
8.  outbound-quality-gate
9.  review-pattern             (maker-checker, adversarial, spec-testing)
10. deliberative-perspectives  ← NEW
11. routing
12. trust-gate
13. feedback-recorder
```

**Why after review-pattern:** Perspectives evaluate the quality-checked output, not the raw output. If review-pattern already flagged the output for retry and the retry succeeded, perspectives evaluate the improved version.

**Why before trust-gate:** Perspective signals inform the trust decision. If perspectives surface critical risks that the review pattern missed, the trust gate should see the flag.

### 6. Cost governance

**Token budget:** Each lens invocation targets ~500-800 output tokens. With 3 lenses (typical), the perspective layer costs ~3K output tokens + input context per lens.

**Model routing:** Perspectives use the `fast` model tier by default (Brief 033). They're evaluation tasks, not generation tasks — they don't need the most capable model.

**Conditional invocation:** The `trigger` field (section 4) prevents perspectives from running on every step. `low-confidence` is the recommended default — perspectives only fire when the primary agent isn't sure.

**Budget integration:** Perspective costs accumulate in `context.reviewCostCents` alongside existing review pattern costs. Per-process budget controls (L2) apply to the combined review spend.

### 7. Feedback and learning

**Implicit signals (Brief 056 pattern):**
- Which perspectives the user drills into (viewed vs. ignored)
- Whether perspective signals align with the user's final decision (approve/edit/reject)
- Time spent on perspective details vs. primary output

**Explicit signals:**
- When a user edits an output, the diff is compared against perspective signals. If the Contrarian flagged the exact issue the user corrected, the Contrarian's value increases for this process type.
- When a user approves despite a perspective flag, the flag's value decreases.

**Learning loop (L5):**
- After N runs (configurable, default 20), the system evaluates per-lens value: "The Contrarian has flagged 12 issues in this process. The user addressed 9 of them. The Simplifier has flagged 15 issues. The user addressed 2."
- System proposes lens composition changes: "Suggest removing Simplifier from this process — low alignment with your corrections."
- Human approves/dismisses. Trust mechanics apply to the recommendation itself.

### 8. Relationship to existing architecture

| Component | Relationship |
|-----------|-------------|
| **Review Patterns (L3)** | Perspectives compose alongside, not replace. A step can have `review: ["spec-testing"]` AND `perspectives: { lenses: ["contrarian", "executor"] }`. |
| **Metacognitive Check** | Internal self-review (same agent lens). Perspectives are external multi-lens review. Complementary — both can flag, trust-gate sees both. |
| **Accumulated Failure Knowledge (ADR-022)** | Injected into relevant lenses. Contrarian loads `failure_pattern` + `overconfidence_pattern`. Historian loads `correction` + `solution` memories. |
| **Cognitive Modes (connecting, selling, CoS)** | Modes shift HOW Alex thinks about a category of work. Perspectives shift WHAT ANGLES Alex considers for a specific decision. Orthogonal. |
| **Conversational Self (ADR-016)** | The Self IS the chairman. Perspective synthesis is a Self capability, not a new entity. |
| **Cognitive Orchestration (ADR-027)** | Thin processes with broad steps + perspectives = agents that consider multiple angles within each step, governed by the harness. |

### 9. What this is NOT

- **Not a visible committee.** The user never sees agents debating. They see Alex, who has considered multiple angles.
- **Not a fixed panel.** Lenses are configurable per-process and learnable over time. No "permanent board of directors."
- **Not a replacement for review patterns.** Perspectives enrich thinking; review patterns catch errors. Different jobs.
- **Not for every decision.** Conditional triggers prevent perspectives from running on routine, proven processes.
- **Not multi-round debate.** Single-pass perspectives + synthesis. Research shows diminishing returns after round 1 in production settings.

## Provenance

| Pattern | Source | What we took | What we changed |
|---------|--------|-------------|----------------|
| Three-stage council | Karpathy `llm-council` (github.com/karpathy/llm-council) | Parallel generation → peer review → chairman synthesis | Dropped peer review stage (cost/benefit wrong for harness). Self is chairman (already exists). Anonymization unnecessary (lenses don't review each other). |
| Sparse communication | AutoGen multi-agent debate (microsoft.github.io/autogen) | Sparse topology outperforms all-to-all | Applied: lenses don't see each other's output. Only the Self sees all. |
| Single-model role diversity | Self-MoA (2025, arXiv follow-up to Mixture-of-Agents) | Same model with different prompts outperforms mixed models | Applied: all lenses use same provider, different system prompts. |
| Cognitive function over personality | LLM Role Archetypes research (arXiv:2602.11924) | Function-defined roles are evaluable; personality-defined roles are unreliable | Applied: lenses defined by cognitive function ("risk assessment"), not personality ("cautious pessimist"). |
| Devil's advocate improves decisions | IUI 2024 research | LLM-powered contrarian improves group decision accuracy without increasing cognitive load | Applied: Contrarian lens with failure knowledge injection. |
| Conditional invocation | HaluGate two-stage pattern (ADR-022 research) | 72% efficiency gain from conditional checking | Applied: trigger conditions gate perspective invocation by confidence/novelty. |
| Composable review layers | Insight-002 (Review Is Compositional) | Review is layered, not selective | Applied: perspectives are a composable layer alongside existing patterns. |
| Internal deliberation, external synthesis | Insight-159 (Self IS Alex) + Insight-165 (Modes Are Judgment Shifts) | Original to Ditto | Perspectives are internal cognitive machinery. User sees one entity that has thought deeply. |

## Consequences

### What becomes easier

- **Complex decisions get richer input.** Goal framing, process design, strategic choices benefit from structured multi-angle evaluation.
- **Blind spot detection.** The Contrarian + failure knowledge injection catches what optimistic single-pass reasoning misses.
- **Transparent reasoning.** Perspective signals create an auditable record of what was considered — not just what was decided.
- **Progressive sophistication.** Simple processes start with no perspectives. Complex processes add them. The system learns which lenses matter per context.

### What becomes harder

- **Cost management.** Even with fast models and conditional triggers, perspectives add LLM calls. Budget governance per-process becomes more important.
- **Synthesis quality.** The Self must synthesize conflicting perspectives into one clear recommendation. This is a prompt engineering challenge — the Self must weigh, not average.
- **Noise vs signal.** Too many lenses or lenses that don't add value dilute useful signals. The feedback loop (section 7) is essential, not optional.

### What new constraints this introduces

- Perspectives must use the `fast` model tier by default to control costs.
- The standard lens library should start small (3-4 lenses) and grow based on evidence, not aspiration.
- Perspective results must be storable for feedback analysis — new fields in the step run record.
- The Self's synthesis prompt must handle 0-7 perspective inputs gracefully (from "no perspectives configured" to "full standard library").

### Follow-up decisions needed

1. **Brief 136** — Implementation brief for the `deliberative-perspectives` handler, standard lens library, process declaration schema, and Self synthesis integration.
2. **Architecture spec update** — Replace Ensemble Consensus with Deliberative Perspectives in Layer 3 review patterns table.
3. **ADR-022 integration** — Wire failure knowledge memory categories into lens-specific memory injection.
4. **Self prompt update** — Add synthesis instructions to `cognitive/self.md` for handling perspective results.
5. **Determine MVP lens set** — Start with 3 lenses (contrarian, first-principles, executor) based on highest expected value. Expand from evidence.
