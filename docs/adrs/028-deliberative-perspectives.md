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

### 2. Dynamic lens composition, not a static library

The lenses needed for any given decision depend on the decision itself — its domain, its stakes, its novelty, and the user's operating context. A pricing decision needs different perspectives than an email draft. A first-time process needs different scrutiny than a 50th run. Prescribing a fixed lens set is premature rigidity.

**The Lens Composer** is a fast LLM call (stage 0) that analyzes the decision context and generates the specific lenses this decision needs:

```typescript
interface LensComposerInput {
  output: string;                // The step's output being evaluated
  processContext: {
    name: string;
    qualityCriteria: string[];
    goalAncestry: string[];      // WHY this work exists
    trustTier: TrustTier;
    runCount: number;            // How many times this process has run
  };
  userContext: {
    cognitiveMode: string;       // connecting, selling, CoS, ghost
    recentCorrections: string[]; // What the user has been fixing lately
    operatingCycle: string;      // What cycle Alex is in
  };
  decisionSignals: {
    confidence: "high" | "medium" | "low";
    novelty: "routine" | "variant" | "novel"; // vs. prior inputs
    stakes: "low" | "medium" | "high";        // from process trust tier + output type
    domain: string;              // extracted from process definition
  };
}

interface GeneratedLens {
  id: string;                    // Generated identifier
  cognitiveFunction: string;     // What this lens evaluates
  systemPrompt: string;          // The complete lens prompt
  evaluationQuestions: string[]; // 2-4 specific questions for this decision
  memoryCategories?: string[];   // Which memory types to inject (ADR-022)
}
```

**The Lens Composer prompt receives:**
- The decision context (what's being evaluated, why it exists, what the user cares about)
- The user's recent correction patterns (what they've been fixing — this shapes which angles matter)
- The process's accumulated failure knowledge (ADR-022 categories)
- A constraint: generate 2-5 lenses, each defined by cognitive function not personality

**What the Lens Composer outputs:**
- 2-5 `GeneratedLens` objects, each tailored to this specific decision
- Each lens has a clear cognitive function, specific evaluation questions, and relevant memory injection categories

**Why dynamic over static:** The same process may need different lenses at different stages of its trust lifecycle. A supervised quoting process on run #3 needs a Contrarian and Executor lens. The same process at run #50 (spot-checked) on a routine bathroom quote might need no perspectives at all — but a novel commercial quote might generate a Pricing Strategist and Compliance Checker lens that no static library would have included.

**Reference lenses (examples, not a fixed library):** The Lens Composer draws on cognitive functions like risk assessment, opportunity identification, first-principles analysis, pragmatic sequencing, customer empathy, historical pattern matching, and complexity reduction. But it combines and tailors them per-context rather than selecting from a menu.

### 3. Three-stage architecture (adapted from Karpathy)

**Stage 0 — Lens Composition (fast, ~200 output tokens):**
The Lens Composer analyzes the decision context and generates 2-5 tailored lenses. Uses `fast` model tier. This is the "who should be in the room?" step — it's cheap and it prevents wasting tokens on irrelevant perspectives.

**Stage 1 — Parallel Perspective Generation:**
Each generated lens receives:
- The step's output (what's being evaluated)
- The process context (quality criteria, goal ancestry)
- Lens-specific memory injection (from ADR-022 failure knowledge, per the composer's `memoryCategories`)
- The lens-specific system prompt + evaluation questions (generated by the composer)

Lenses run in parallel (no inter-lens communication in stage 1). Each returns:

```typescript
interface PerspectiveResult {
  lensId: string;
  cognitiveFunction: string;   // What this lens was evaluating
  assessment: string;          // The lens's evaluation
  signals: PerspectiveSignal[];
  confidence: "high" | "medium" | "low";
  costCents: number;
}

interface PerspectiveSignal {
  type: "opportunity" | "risk" | "simplification" | "precedent" | "feasibility" | "user-impact" | "quality" | "compliance";
  summary: string;             // One sentence
  severity: "critical" | "significant" | "minor";
  evidence?: string;           // What supports this signal
}
```

**Stage 2 — Peer Review (the cross-examination loop):**
After initial perspectives are generated, each lens receives:
- Its own initial assessment
- The assessments from all other lenses (anonymized as "Perspective A, B, C..." per Karpathy's pattern — prevents favoritism)
- A prompt: "Review the other perspectives. Where do you agree? Where do you disagree? What did they catch that you missed? What did they get wrong? Update your assessment."

Each lens produces a **revised assessment** that incorporates or rebuts the other perspectives. This is the key value-add over single-pass evaluation — it's where genuine deliberation happens. Lenses that were overconfident get challenged. Lenses that missed something absorb it. Genuine disagreements become explicit rather than hidden.

**Peer review constraints:**
- **Single round only.** Research shows diminishing returns after round 1. The loop is: compose → generate → cross-examine → synthesize. Not compose → generate → cross-examine → cross-examine → cross-examine.
- **Anonymized.** Lenses see "Perspective A said..." not "The Contrarian said..." — prevents anchoring on perceived authority.
- **Optional per-process.** Peer review can be disabled via `peer_review: false` in the process config for cost-sensitive processes. When disabled, the architecture degrades to two stages (compose → generate → synthesize) — still valuable, just less thorough.

**Stage 3 — Self Synthesis:**
The Self (already the chairman per ADR-016) receives all revised perspective results and synthesizes:
- Strongest arguments across lenses (post-cross-examination)
- Points of convergence (multiple lenses agree, especially after peer review)
- Points of genuine divergence (where lenses disagree even after seeing each other's work)
- A single recommendation incorporating the most valuable signals

The user sees Alex's synthesized recommendation. Perspective details are available on demand (drill-down in the Review Queue, not in the primary response). The peer review layer means Alex's synthesis is grounded in perspectives that have already stress-tested each other — not raw first impressions.

### 4. Process declaration

Perspectives are declared on process definitions. Because lenses are dynamically composed, the declaration is about **when and how** to deliberate, not **which lenses** to use:

```yaml
# In process YAML
harness:
  review: ["spec-testing"]
  perspectives:
    enabled: true
    trigger: "always" | "low-confidence" | "novel-input" | "high-stakes"
    peer_review: true           # Enable stage 2 cross-examination (default: true)
    max_lenses: 4               # Cap on dynamically generated lenses (default: 4)
    model_tier: "fast"          # Model tier for lenses (Brief 033)
    composer_hints: []          # Optional: domain hints for the lens composer
```

**Trigger conditions:**

| Trigger | When perspectives run | Use for |
|---------|---------------------|---------|
| `always` | Every step execution | Critical/compliance processes, goal framing |
| `low-confidence` | Only when step execution returns low/medium confidence | Cost-optimized: perspectives where they're most needed |
| `novel-input` | When input signature differs significantly from prior runs | Catches novel situations that routine processing might mishandle |
| `high-stakes` | When the output has external consequences (outbound email, financial, customer-facing) | Prevents costly mistakes on consequential actions |

**`composer_hints`:** Optional strings that give the Lens Composer domain context. Example: `["this process handles financial compliance", "the user is particularly sensitive to tone"]`. These are not lens names — they're context for dynamic composition. Most processes don't need hints; the Composer infers from the process definition and user context.

### 4a. When perspectives fire — scenario analysis

The trigger system must be precise. Perspectives are valuable for specific decision types, not universal quality improvement. Here's when each persona would benefit and when they wouldn't:

**Rob (trades MD) — Quoting process:**

| Scenario | Trigger? | Why |
|----------|----------|-----|
| Routine bathroom quote (run #40, standard job) | No | Autonomous trust, routine input. Perspectives add cost without value. |
| First commercial quote (novel input type) | Yes — `novel-input` | New domain. Lens Composer might generate: Pricing Risk Assessor, Commercial Compliance Checker, Margin Strategist. |
| Quote for a customer who previously complained | Yes — `high-stakes` | Reputational risk. Composer might generate: Customer Relationship Lens, Quality Scrutineer, Tone Assessor. |
| Quote with materials Rob has never used before | Yes — `novel-input` | Material pricing uncertainty. Composer might generate: Cost Verification Lens, Supplier Risk Assessor. |

**Lisa (ecommerce MD) — Product description process:**

| Scenario | Trigger? | Why |
|----------|----------|-----|
| Standard product listing (run #80) | No | Spot-checked trust, routine. Lisa reviews 1 in 5. |
| New product category launch | Yes — `novel-input` | New domain. Composer: Brand Voice Guardian, Competitive Differentiator, SEO Strategist. |
| Product in a regulated category (supplements, electronics) | Yes — `high-stakes` | Compliance risk. Composer: Regulatory Compliance Checker, Claims Verifier. |
| Product description after a negative review about misleading descriptions | Yes — `high-stakes` | Reputational risk. Composer: Accuracy Scrutineer, Customer Expectation Setter. |

**Nadia (team manager) — Report formatting process:**

| Scenario | Trigger? | Why |
|----------|----------|-----|
| Standard weekly report (run #100+) | No | Autonomous, routine. |
| First report from a new analyst | Yes — `novel-input` | New author, unknown patterns. Composer: Quality Baseline Assessor, Style Compliance Checker. |
| Report going to board / external stakeholders | Yes — `high-stakes` | Audience-aware. Composer: Executive Communication Lens, Data Accuracy Verifier, Narrative Coherence Checker. |
| Report on a topic the team hasn't covered before | Yes — `novel-input` | Domain unfamiliarity. Composer: Domain Accuracy Checker, Assumption Questioner. |

**Goal Framing (the Self's consultative conversation):**

| Scenario | Trigger? | Why |
|----------|----------|-----|
| Simple task: "Follow up with Henderson" | No | Clear intent, existing process, low ambiguity. |
| Vague strategic goal: "I want to grow the business" | Yes — `always` | High ambiguity. Composer: Scope Definer, Feasibility Assessor, Opportunity Mapper, Risk Assessor. |
| Process design: "I need a quoting process" | Yes — `always` | Complex build decision. Composer: Process Architect, Edge Case Identifier, Simplicity Advocate, User Experience Lens. |
| Decision with trade-offs: "Should I hire or automate?" | Yes — `always` | Genuine dilemma. Composer: Cost-Benefit Analyzer, Long-Term Strategist, Operational Reality Checker, Risk Assessor. |

**The pattern:** Perspectives fire when there's genuine ambiguity, novelty, or consequence. They don't fire on routine, proven operations. The trust tier provides the baseline signal (supervised processes may benefit from perspectives more often; autonomous processes rarely need them). The trigger conditions provide the per-execution signal.

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

**Token budget per stage:**

| Stage | Calls | Output tokens | Typical cost |
|-------|-------|---------------|-------------|
| Stage 0 (Lens Composer) | 1 | ~200 | Negligible |
| Stage 1 (Parallel Generation) | N lenses (2-5) | ~500-800 per lens | 1K-4K |
| Stage 2 (Peer Review) | N lenses | ~300-500 per lens (shorter — revision, not generation) | 0.6K-2.5K |
| Stage 3 (Self Synthesis) | 0 (folded into Self's response) | 0 additional | Free |

**Total typical cost:** 3-5 lenses with peer review: ~5K-10K output tokens + input context per lens invocation. This is significant — roughly 3-5x the cost of a single adversarial review.

**Model routing:** All perspective stages use the `fast` model tier by default (Brief 033). They're evaluation tasks, not generation tasks — they don't need the most capable model. The Lens Composer especially benefits from fast models since it generates structure, not deep analysis.

**Conditional invocation is the primary cost control.** The trigger conditions (section 4) are not optional — they are the mechanism that makes perspectives affordable. A process that runs 100 times/month at `novel-input` trigger might fire perspectives on 5-10 of those runs. The same process at `always` would fire 100 times — 10-20x the cost.

**Peer review is the secondary cost control.** `peer_review: false` halves the lens invocation cost. Recommended for processes where speed matters more than thoroughness, or where the trigger condition already ensures only high-value invocations.

**Budget integration:** Perspective costs accumulate in `context.reviewCostCents` alongside existing review pattern costs. Per-process budget controls (L2) apply to the combined review spend. If the perspective layer would exceed the remaining step budget, it degrades gracefully: drop peer review first, then reduce lens count, then skip perspectives entirely.

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
| **Review Patterns (L3)** | Perspectives compose alongside, not replace. A step can have `review: ["spec-testing"]` AND `perspectives: { enabled: true, trigger: "novel-input" }`. |
| **Metacognitive Check** | Internal self-review (same agent lens). Perspectives are external multi-lens review. Complementary — both can flag, trust-gate sees both. |
| **Accumulated Failure Knowledge (ADR-022)** | Injected into relevant lenses. Contrarian loads `failure_pattern` + `overconfidence_pattern`. Historian loads `correction` + `solution` memories. |
| **Cognitive Modes (connecting, selling, CoS)** | Modes shift HOW Alex thinks about a category of work. Perspectives shift WHAT ANGLES Alex considers for a specific decision. Orthogonal. |
| **Conversational Self (ADR-016)** | The Self IS the chairman. Perspective synthesis is a Self capability, not a new entity. |
| **Cognitive Orchestration (ADR-027)** | Thin processes with broad steps + perspectives = agents that consider multiple angles within each step, governed by the harness. |

### 9. What this is NOT

- **Not a visible committee.** The user never sees agents debating. They see Alex, who has considered multiple angles.
- **Not a fixed panel.** Lenses are dynamically composed per-decision based on context, not selected from a static menu. No "permanent board of directors."
- **Not a replacement for review patterns.** Perspectives enrich thinking; review patterns catch errors. Different jobs.
- **Not for every decision.** Conditional triggers prevent perspectives from running on routine, proven processes.
- **Not multi-round debate.** One round of peer review after initial generation. Research shows diminishing returns after round 1. The loop is: compose → generate → cross-examine → synthesize — not an open-ended debate.

## Provenance

| Pattern | Source | What we took | What we changed |
|---------|--------|-------------|----------------|
| Three-stage council | Karpathy `llm-council` (github.com/karpathy/llm-council) | Parallel generation → anonymized peer review → chairman synthesis | Adopted all three stages. Added stage 0 (dynamic lens composition). Self is chairman (already exists). Peer review is anonymized and single-round. |
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
- The Lens Composer prompt is a critical artifact — it determines what lenses get generated. Must be evolved through Feedback & Evolution with the same care as `cognitive/core.md`.
- Perspective results must be storable for feedback analysis — new fields in the step run record.
- The Self's synthesis prompt must handle 0-5 perspective inputs gracefully (from "no perspectives triggered" to max lenses).
- Trigger conditions must be configured thoughtfully per process — `always` on a high-volume process is a cost explosion.
- Peer review anonymization must be consistent — lenses must not be identifiable by writing style or perspective name during cross-examination.

### Follow-up decisions needed

1. **Brief 136** — Implementation brief for the `deliberative-perspectives` handler, Lens Composer, peer review loop, process declaration schema, and Self synthesis integration.
2. **Architecture spec update** — Replace Ensemble Consensus with Deliberative Perspectives in Layer 3 review patterns table.
3. **ADR-022 integration** — Wire failure knowledge memory categories into Lens Composer context so it can assign `memoryCategories` to generated lenses.
4. **Self prompt update** — Add synthesis instructions to `cognitive/self.md` for handling perspective results (post-peer-review).
5. **Lens Composer prompt design** — The prompt that generates lenses is the single highest-leverage artifact. It needs its own design iteration with scenario testing across all four personas.
