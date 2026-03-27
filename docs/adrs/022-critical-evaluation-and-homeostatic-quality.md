# ADR-022: Critical Evaluation and Homeostatic Quality

**Date:** 2026-03-25
**Status:** accepted

## Context

### The Problem

Ditto's cognitive architecture (ADR-014) models how agents think. The trust model (ADR-007) evaluates output quality. The attention model (ADR-011) determines how humans experience oversight. But the system lacks two capabilities that research identifies as critical:

1. **Persistent critical evaluation** — accumulated knowledge about what tends to go wrong, applied proactively to future outputs. Current mechanisms (metacognitive self-check, review patterns, trust gate) are per-output or per-step. None accumulates cross-output, cross-process knowledge about failure patterns.

2. **Homeostatic quality regulation** — a multi-dimensional balance model for quality rather than single-score maximization. Current trust evaluation tracks approval rate and correction rate. But quality is multi-dimensional — overconfidence is as harmful as underconfidence, excessive flagging is as harmful as silent failures.

### Trigger

Insight-100 (Inner Critic) identified the gap: no persistent critical disposition counterbalances the Self's optimism. Insight-101 (Homeostatic Quality) identified the incentive gap: no approach/avoidance gradients shape agent behavior during execution.

### Research Inputs

`docs/research/critic-incentives-hallucination.md` — 25+ sources across three areas:

**Critical evaluation findings:**
- Self-critique without external grounding fails (Reflexion EMNLP 2025 caveat)
- The verifier must be independent of the producer (AgentCoder, CoVe Factor+Revise, LLM-as-Judge bias: +10-25% self-enhancement)
- Step-level verification dramatically outperforms output-level (PRM, OpenAI 2023)
- Accumulated failure knowledge is the genuine gap — no production system does this in multi-process context
- Conditional checking essential for efficiency (HaluGate two-stage pattern, 72% efficiency gain)

**Incentive findings:**
- Runtime reward signals create real behavioral gradients (METR 2025 reward hacking evidence)
- Single-score maximization is gamed by frontier models — multi-dimensional bounded optimization is safer
- Homeostatic regulation maintains balance across dimensions (Keramati & Gutkin, eLife 2014)
- Verbal reinforcement via memory injection shapes behavior without training (Reflexion, NeurIPS 2023)
- Distributional evaluation (quality as distribution, not binary) provides richer signals (DeepMind/Nature 2020)

**Hallucination detection findings:**
- CoVe Factor+Revise: decompose claims, verify independently, compare (Meta 2023; +23% F1)
- FActScore: atomic fact decomposition against knowledge base (58% ChatGPT FActScore on biography)
- Semantic entropy: meaning-level uncertainty via multi-sample clustering (Nature 2024)
- Tool-based verification: iterative tool-use for fact-checking (FIRE, NAACL 2025; 7.6x cost reduction)

### Design Forces

1. **ADR-014's judgment hierarchy must not be broken.** Human → Orchestrator → Agent → Harness is clean. The critical evaluation capability enriches the Orchestrator and Harness, not a new level.

2. **Feedback & Evolution (ADR-015) is the right meta-process home.** Cross-process failure correlation is exactly what this meta-process does — observe, learn, propose improvements.

3. **No new memory scopes needed.** Failure patterns are process-scoped (this process underestimates bathroom labour) or agent-scoped (this agent halluccinates data references). Existing scopes with categorical tagging suffice.

4. **The Self's disposition must not be corrupted.** The Self is warm, helpful, optimistic. Critical evaluation is a different cognitive register — it lives in the Orchestrator's reflection and the Harness's verification, not in the Self's personality.

5. **Gaming resistance is essential.** Any incentive signal must be multi-dimensional and bounded, not a single score to maximize (METR reward hacking evidence).

## Decision

### 1. Accumulated Failure Knowledge as a Memory Category

Failure patterns are stored in existing memory scopes (process-scoped and agent-scoped) with a `category` tag that enables targeted retrieval during context assembly.

**Memory categories for failure knowledge:**

| Category | Scope | What it stores | Example |
|----------|-------|---------------|---------|
| `failure_pattern` | process | Recurring correction types for this process | "Bathroom labour estimates corrected upward 4 of last 6 times" |
| `hallucination_pattern` | agent | Types of unsupported claims this agent tends to make | "This agent cites 'your price list' without retrieving the actual data" |
| `overconfidence_pattern` | process | Steps/contexts where high confidence correlates with corrections | "Step 3 (pricing calculation) has 90% confidence but 25% correction rate" |
| `quality_drift` | process | Gradual changes in correction rate or type over time | "Correction rate rising from 5% to 15% over last 30 runs" |

**How failure knowledge is accumulated:**
- The feedback-recorder harness handler (existing) captures corrections
- A new `failure-pattern-extractor` function runs periodically (piggybacks on trust evaluator heartbeat) to detect patterns across recent corrections
- Extracted patterns stored in memory with the appropriate category tag
- Patterns have a `confidence` field (how many data points support this pattern) and a `lastSeen` timestamp

**How failure knowledge is consumed:**
- Context assembly (existing, ADR-014 Layer A) retrieves `failure_pattern` and `overconfidence_pattern` memories when assembling context for a step
- The Orchestrator's reflection cycle (ADR-014 §2) retrieves `quality_drift` and `hallucination_pattern` memories when evaluating progress
- Failure patterns are injected as avoidance signals: "Note: this process has historically underestimated bathroom labour. Verify your estimate against recent corrections."

**Provenance:** Reflexion verbal reinforcement pattern (Shinn et al., NeurIPS 2023) — verbal feedback stored and retrieved to shape future behavior. **Adopt pattern.** Process-scoped failure patterns are Original to Ditto — no system accumulates process-specific failure knowledge for proactive injection.

### 2. Orchestrator Reflection Enriched with Critical Evaluation

ADR-014 §2 defines the orchestrator's reflection cycle:

```
For each active goal:
  1. Assess progress
  2. Check friction
  3. Evaluate approach
  4. Decide: continue / adapt / escalate / stop
```

ADR-022 adds a critical evaluation pass to this cycle:

```
For each active goal:
  1. Assess progress
  2. Check friction
  3. Retrieve failure patterns for active processes/agents   ← NEW
  4. Evaluate approach (now informed by failure history)
  5. Challenge Self suggestions against failure data          ← NEW
  6. Decide: continue / adapt / escalate / stop / caution    ← NEW option
```

**Step 3 (new):** The orchestrator retrieves `failure_pattern`, `quality_drift`, and `overconfidence_pattern` memories for the active processes and agents. This gives the reflection cycle historical context about what tends to go wrong.

**Step 5 (new):** When the Self has queued suggestions (expansion, new process, trust upgrade), the orchestrator evaluates them against accumulated failure data. If the data contradicts the suggestion (e.g., "suggest expansion" but correction rate is rising), the orchestrator can hold the suggestion or attach a caution.

**Step 6 (new option — "caution"):** The orchestrator can flag a step output for enhanced review based on failure pattern match, even if confidence is high. This is the "confident-but-wrong" detector — the existing trust gate only catches low-confidence outputs.

**Provenance:** The critical evaluation enrichment to the orchestrator is Original to Ditto — no system enriches an orchestrator's executive function with accumulated failure patterns for proactive critical evaluation. The concept draws from Waymo's Critic entity (persistent critical knowledge), MAP's Monitor module (conflict detection), and the actor-critic pattern (LLaMAC, TripletCritic).

### 3. Conditional Verification Handler in the Harness

A new harness handler — `verification-check` — runs between `step-execution` and `metacognitive-check` in the harness pipeline. It is **conditional**: a fast pre-classifier determines whether detailed verification is needed.

**Two-stage pipeline:**

**Stage 1: Verification pre-classifier (fast, every output)**
- Checks: (a) Does this step have a `failure_pattern` or `overconfidence_pattern` in memory? (b) Is the trust tier supervised or critical? (c) Does the output make factual claims about data sources? (d) Did the orchestrator flag "caution"?
- If none of the above → skip verification (the common case)
- If any → proceed to Stage 2
- Cost: negligible (memory lookup + pattern matching, no LLM call)

**Stage 2: Factual verification (selective, LLM-assisted)**
- Adopts the CoVe Factor+Revise pattern:
  1. Decompose output into atomic claims
  2. For each claim, generate a verification question
  3. Answer each verification question in a **separate context** (factored — prevents contamination)
  4. Compare verification answers against original claims
  5. Flag discrepancies as `verification_issue` on the step run
- Cost: 1 LLM call for decomposition + N small LLM calls for verification (where N = number of claims)
- The verification agent uses a **different model or provider** than the producing agent when available, to avoid self-enhancement bias

**When verification issues are found:**
- Issues flagged on the step run (alongside existing confidence and metacognitive check results)
- The trust gate treats verification issues like low confidence — routes to human review regardless of trust tier
- The Activity Feed shows what was flagged and why: "Ditto verified this output and found: the claim 'based on your last 5 quotes' could not be confirmed from quote history"

**Provenance:** CoVe Factor+Revise (Dhuliawala et al., 2023) for the decompose-verify-compare pipeline. **Adopt pattern.** HaluGate two-stage conditional (vLLM 2025) for the pre-classifier efficiency pattern. **Adopt pattern.** FActScore atomic decomposition (Min et al., EMNLP 2023) for breaking outputs into verifiable claims. **Pattern only** — Ditto's knowledge source is process memory + connected data, not Wikipedia.

### 4. Homeostatic Quality Regulation

The trust evaluator (ADR-007) currently tracks two signals: approval rate and correction rate. ADR-022 extends the quality model to multiple dimensions, each with an optimal range rather than a maximization target.

**Quality dimensions tracked per process:**

| Dimension | Signal sources | Optimal range | Below optimal | Above optimal |
|-----------|---------------|---------------|---------------|---------------|
| **Output accuracy** | Approval rate, correction rate, verification issues | 85-100% approval, <10% corrections | Corrections rising → inject failure patterns | N/A (100% is fine) |
| **Confidence calibration** | Confidence vs actual outcome correlation | High confidence = mostly approved, low confidence = often corrected | Over-escalating → reduce scaffolding | Overconfident → increase verification |
| **Suggestion relevance** | Suggestion acceptance rate, suggestion-to-action conversion | >60% acceptance, user acts on >30% | User not engaging → adjust suggestion timing/type | User overwhelmed → cap frequency |
| **Risk detection accuracy** | Flagged risks that proved justified vs false alarms | >50% justified flags | Missing real issues → lower flagging threshold | Too many false alarms → raise threshold |
| **Autonomy appropriateness** | Human override rate at current trust tier | <15% override rate | Bottleneck — suggest trust upgrade | Runaway — suggest trust downgrade |

**How homeostatic signals become incentive gradients:**

When a dimension is outside its optimal range, the system generates a verbal context signal injected into agent context at assembly time:

- **Below optimal (approach signal):** "Recent outputs have been consistently approved. The process is performing well in this area."
- **Above optimal (avoidance signal):** "Confidence calibration is off: the last 5 high-confidence outputs had a 30% correction rate. Verify uncertain claims explicitly."

These are informational signals — context that shapes attention, not rewards or punishments. They follow the Reflexion pattern: verbal feedback stored and injected to shape future behavior.

**Gaming resistance:** Multi-dimensional bounded optimization is harder to game than single-score maximization because:
- Improving one dimension at the expense of another is explicitly detected (all dimensions tracked independently)
- Optimal ranges are bounded — there's no benefit to over-optimizing
- The homeostatic model penalizes excess, not just deficiency
- The governance-monitor (existing system agent) watches for trust gaming patterns across all dimensions

**Provenance:** Homeostatic regulation concept from Keramati & Gutkin (eLife 2014). **Pattern only** — applied to process quality dimensions rather than RL environment variables. Multi-dimensional quality tracking is Original to Ditto — no system applies homeostatic regulation to process orchestration quality.

### 5. Cross-Process Failure Correlation

Layer 4 (Awareness) already provides cross-process event propagation and dependency tracking. ADR-022 adds failure pattern correlation to this layer.

**What it detects:**
- Same failure pattern appearing across multiple processes (systemic issue, not process-specific)
- One process's quality drift affecting downstream processes
- Agent-level patterns that manifest across all processes the agent serves

**How it works:**
- The trust evaluator's periodic scan (existing) is extended to compare failure patterns across processes
- When the same `failure_pattern` category appears in 3+ processes, it's elevated to an awareness-level signal
- The Orchestrator's reflection cycle can access awareness-level signals for broader context

**Provenance:** Cross-process failure correlation is Original to Ditto — no production system correlates failure patterns across governed processes for proactive critical evaluation. The dependency graph mechanism (L4) is existing infrastructure; the failure correlation is new analysis over existing data.

### 6. Architecture Amendments

**New cross-cutting section in `architecture.md`:** "Cross-Cutting: Critical Evaluation and Homeostatic Quality (ADR-022)" — alongside attention model, cognitive architecture, and integrations.

Framing:

> Trust tiers determine oversight **rate** (how often). The attention model determines oversight **form** (item review, digest, alert). The cognitive architecture (ADR-014) determines what kind of **agent thinking** execution demands. **Critical evaluation (ADR-022) provides the avoidance gradient** — accumulated knowledge about what goes wrong, injected as context to prevent repetition. **Homeostatic quality (ADR-022) maintains multi-dimensional balance** — ensuring the system doesn't over-optimize one quality dimension at the expense of others.

**Layer impacts:**

| Layer | What changes |
|---|---|
| **L1 (Process)** | No schema changes. Failure patterns are memory-level, not process-definition-level. |
| **L2 (Agent)** | Context assembly retrieves failure pattern memories and homeostatic signals during agent harness assembly. Existing mechanism (memory assembly) extended with category-based retrieval. |
| **L3 (Harness)** | New `verification-check` handler between `step-execution` and `metacognitive-check`. Conditional two-stage pipeline. Verification issues flagged on step runs. Trust gate treats verification issues like low confidence. |
| **L4 (Awareness)** | Cross-process failure correlation added to trust evaluator's periodic scan. Awareness-level signals for systemic failure patterns. |
| **L5 (Learning)** | Failure-pattern-extractor detects patterns across corrections. Homeostatic dimension tracking with optimal ranges. Approach/avoidance signal generation. |
| **L6 (Human)** | Verification results visible in Activity Feed. Failure patterns visible in process detail (why corrections cluster). No new UI primitives — uses existing Activity Feed and Process Card. |

**Harness pipeline (updated order):**

```
memory-assembly → step-execution → verification-check → metacognitive-check → review-pattern → routing → trust-gate → feedback-recorder
```

The `verification-check` runs before `metacognitive-check` because it provides external grounding that the metacognitive check can reference. The metacognitive check can now include: "Verification flagged 2 claims as unsupported — do these affect the overall output quality?"

**ADR-014 relationship:** ADR-022 extends ADR-014, not contradicts it. Specifically:
- Layer A (Cognitive Infrastructure) gains failure pattern retrieval as a context assembly enrichment
- The Orchestrator's reflection cycle (ADR-014 §2) gains steps 3, 5, and 6 (critical evaluation pass)
- Layer B (Cognitive Toolkit) gains failure-pattern-aware reflection prompts
- The judgment hierarchy is unchanged: Human → Orchestrator → Agent → Harness

**ADR-007 relationship:** ADR-022 extends ADR-007's trust evaluation with:
- Multi-dimensional quality tracking (5 dimensions with optimal ranges)
- Verification issue count as a new signal source for trust evaluation
- Homeostatic dimension status as context for upgrade/downgrade decisions

**ADR-015 relationship:** Feedback & Evolution is confirmed as the meta-process home for:
- Failure pattern extraction (periodic analysis of corrections)
- Cross-process failure correlation (L4 awareness enrichment)
- Homeostatic balance monitoring (are dimensions within optimal ranges?)

## Consequences

### What this enables

- **The system learns what goes wrong and prevents repetition.** Accumulated failure patterns are injected into agent context before execution — the agent is warned about historical issues specific to this process/step/domain.
- **Hallucination detection is targeted, not universal.** The two-stage conditional verification prevents checking-everything overhead while catching high-risk outputs. 72% efficiency gain based on HaluGate evidence.
- **Quality regulation prevents both under- and over-optimization.** The homeostatic model catches alarm fatigue (too much flagging) as well as silent failures (too little). The system maintains balance.
- **The three-disposition model is delivered without a new entity.** Optimistic (Self), Critical (Orchestrator reflection + Harness verification), Strategic (Orchestrator execution management) — all within existing architectural homes.
- **Incentive gradients are informational, not coercive.** Approach/avoidance signals are verbal context, not scores. They shape attention without creating gaming incentives.

### What this does NOT do

- Does NOT create a new system-level entity (the Critic). The critical disposition is a capability enrichment of existing components.
- Does NOT add a new memory scope. Failure patterns use existing scopes with categorical tags.
- Does NOT change the judgment hierarchy. The four levels (Human → Orchestrator → Agent → Harness) are preserved.
- Does NOT require verification for every output. The pre-classifier determines which outputs need checking. Most outputs skip verification entirely.
- Does NOT auto-fix outputs based on verification. Issues are flagged; the human decides. Consistent with "surfaces, diagnoses, suggests — never auto-fixes."

### Risks

- **Verification cost.** Stage 2 verification costs 1 + N LLM calls per checked output (decomposition + N claim verifications). **Mitigation:** Stage 1 pre-classifier filters most outputs. Verification only fires for outputs matching failure patterns, low trust tiers, or factual claims about data sources.
- **Failure pattern staleness.** Accumulated patterns may become outdated as processes improve. **Mitigation:** Patterns carry `lastSeen` timestamps. Patterns not triggered in 30+ runs are automatically demoted. Trust upgrade events clear associated failure patterns (the agent has improved).
- **Homeostatic dimension calibration.** Optimal ranges may need tuning per process type. **Mitigation:** Start with sensible defaults. Allow process-level overrides. Ranges are soft guidelines for signal generation, not hard enforcement.
- **Over-injection of avoidance signals.** Too many "be careful" signals could make agents overly cautious. **Mitigation:** Signal budget: maximum 2 avoidance signals per step execution context. Prioritized by recency and severity.
- **False verification flags.** The verification stage may flag correct outputs as unsupported. **Mitigation:** Verification issues are flags for human review, not auto-rejections. False flag rate tracked as a quality dimension of the verification itself.

### Follow-up decisions needed

- **Failure pattern extraction algorithm.** How exactly are correction patterns clustered and classified? This is a learning-layer implementation detail for the builder.
- **Verification agent model selection.** Which model serves as the verifier? Should it always differ from the producer? Cost/quality trade-offs for the verification LLM calls.
- **Homeostatic dimension defaults.** The optimal ranges proposed are starting points. Empirical calibration needed after data accumulation (20+ runs per process).
- **Dev process validation.** Apply critical evaluation to the 7 dev roles first: which dev role processes have accumulated failure patterns? Does injecting them improve output quality?

## Build Phasing

| Phase | What ships | Layer | Cost | Evidence required first |
|---|---|---|---|---|
| **E1: Failure Pattern Memory** | Failure pattern extraction from corrections. Memory category tagging. Context assembly retrieval of failure patterns. Avoidance signal injection. | L2, L5 | Medium | None — adopt Reflexion pattern |
| **E2: Orchestrator Critical Enrichment** | Steps 3, 5, 6 in orchestrator reflection. Self suggestion challenge. "Caution" decision option. | L3, L4 | Medium | E1 — failure patterns flowing through context |
| **E3: Conditional Verification** | Two-stage verification handler. Pre-classifier. CoVe Factor+Revise verification. Trust gate integration. | L3 | Medium-High | E1 — failure patterns available to pre-classifier |
| **E4: Homeostatic Quality** | Multi-dimensional quality tracking. Optimal ranges. Approach/avoidance signal generation. Homeostatic status in process detail. | L5, L6 | Medium | E1+E2 data accumulation (20+ runs) |
| **E5: Cross-Process Correlation** | Awareness-level failure pattern correlation. Systemic pattern detection. | L4 | Low | E1 data across 3+ processes |

Phases E1-E3 are independently valuable. E4 and E5 require data accumulation.

### Acceptance Criteria

**Phase E1 (Failure Pattern Memory) — 10 criteria:**
1. Failure patterns extracted from corrections after 5+ corrections of the same type within a process
2. Patterns stored in process-scoped memory with `category: failure_pattern`
3. Patterns include `confidence` (data point count) and `lastSeen` timestamp
4. Context assembly retrieves failure patterns when assembling context for a step
5. Avoidance signals injected as natural language context: "Note: [pattern description]"
6. Maximum 2 avoidance signals per step execution context
7. Patterns not triggered in 30+ runs are demoted (no longer injected by default)
8. Trust upgrade events clear associated failure patterns for that process
9. Agent-scoped `hallucination_pattern` memories extracted when agent outputs are corrected for factual claims
10. All 330+ existing tests continue to pass (backward compatible)

**Phase E2 (Orchestrator Critical Enrichment) — 8 criteria:**
1. Orchestrator reflection cycle retrieves failure patterns for active processes
2. Reflection evaluation considers failure history when assessing approach
3. Self suggestions evaluated against accumulated failure data before delivery
4. "Caution" decision option available — flags step output for enhanced review
5. Caution flag treated as low-confidence by trust gate (routes to human review)
6. Self suggestion hold: when failure data contradicts a suggestion, orchestrator can defer it
7. Reflection cycle adds <1s latency (failure pattern retrieval is a memory query, not an LLM call)
8. Dev pipeline processes demonstrate critical evaluation: at least 1 suggestion held or output cautioned based on real failure data

**Phase E3 (Conditional Verification) — 12 criteria:**
1. `verification-check` handler exists in harness pipeline between `step-execution` and `metacognitive-check`
2. Stage 1 pre-classifier checks 4 conditions: failure pattern match, trust tier, factual claims, orchestrator caution flag
3. When no conditions match, verification is skipped (no LLM cost)
4. Stage 2 decomposes output into atomic claims via LLM
5. Each claim verified independently in a separate context (factored — no contamination)
6. Verification uses a different model than the producing agent when multiple models are configured
7. Discrepancies flagged as `verification_issue` on step run
8. Trust gate treats verification issues like low confidence — routes to human review
9. Activity Feed shows verification results: what was flagged and why
10. Verification adds <5s latency for Stage 2 (acceptable for supervised/critical processes)
11. Stage 1 pre-classifier adds <100ms latency
12. Process-level opt-out: `harness.verification: false` disables verification for a specific process
