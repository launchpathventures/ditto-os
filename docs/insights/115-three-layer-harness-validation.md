# Insight-115: Three-Layer Harness Validation — What gstack, Superpowers, and CE Confirm About Ditto

**Date:** 2026-03-30
**Trigger:** Analysis of three viral Claude Code tool ecosystems (gstack 54.6K⭐, Superpowers 121K⭐, Compound Engineering 11.5K⭐) mapped against Anthropic's harness architecture (Nov 2025) and Ditto's six-layer spec
**Layers affected:** L1 Process, L3 Harness, L5 Learning, L2 Agent (cognitive architecture)
**Status:** partially-absorbed

## The Insight

Three tools went viral solving three different problems. The market discovered — through adoption, not theory — that agent harnesses decompose into distinct layers. gstack nails decision gates and real-world QA. Superpowers brings process discipline (brainstorm → plan → execute → review). CE adds knowledge compounding (extracting lessons into searchable docs/solutions/ after every task). Most users install one and think they're covered. The article's core observation: **these are layers, not competitors.**

Mapped to Anthropic's harness architecture (initializer agent + coding agents + evaluation), the article expands to four responsibilities: planning (head chef), execution (kitchen), evaluation (independent taster), cross-session state (closing notes). The article's key claim is that CE's `/ce:compound` step — spawning five parallel subagents to extract lessons after every task — creates compound interest in knowledge, not just linear session continuity.

### What This Validates in Ditto

**1. Maker-checker separation is non-negotiable (L3: Harness Layer)**

The article's central finding: "builders who evaluate their own work are systematically overoptimistic." Ditto's Layer 3 already has four review patterns (maker-checker, adversarial, specification testing, ensemble consensus) plus the metacognitive self-check as an internal complement. The article's CE ensemble reviewer (6+ parallel reviewers: correctness, security, performance, testing, maintainability, adversarial) maps directly to Ditto's ensemble consensus pattern. gstack's `/qa` (real browser testing) maps to specification testing against actual runtime behavior, not just code inspection.

**Validation:** Ditto's harness layer is structurally sound. The architecture already treats review as multi-dimensional and externally grounded.

**2. Knowledge compounding is the differentiator, not just feedback capture (L5: Learning Layer)**

CE's `/ce:compound` spawns five subagents (context analyzer, solution extractor, related docs finder, prevention strategist, category classifier) to produce structured, searchable knowledge after every task. This is more than Ditto's current L5 design, which tracks corrections, patterns, and degradation but focuses on **implicit feedback** (edits-as-feedback) and **process-scoped learning**.

The distinction the article draws: Anthropic's progress file is "tonight's closing notes" (linear, one session to the next). CE's docs/solutions/ is the "recipe binder" (searchable by anyone, anytime). One is continuity. The other is accumulation.

Ditto's architecture has the pieces — process-scoped memory, agent-scoped memory, self-scoped memory (ADR-016), the improvement-scanner system agent — but **does not yet describe a structured knowledge extraction step that runs after task completion.** The Learning Layer captures feedback signals implicitly. CE makes the extraction step explicit and parallel.

**Gap identified:** Ditto needs an explicit "compound" step in its meta-process lifecycle — a post-completion phase where the harness extracts, deduplicates, categorizes, and indexes what was learned. This is not a new layer; it's a meta-process within the existing architecture (consistent with Insight-042: Knowledge Management Is a Meta-Process and Insight-054: Meta Processes Are the Platform).

**3. Decision gates before execution are a distinct responsibility (L3 + L6)**

gstack's `/plan-ceo-review` (product gate) and `/plan-eng-review` (architecture gate) are pre-execution decision gates. Ditto's architecture already performs this function through the consultative Self (ADR-016) and the goal framing meta-process (Insight-054), but hasn't yet **classified pre-execution validation as a formal harness pattern** alongside the four post-execution review patterns. The behavior exists; the taxonomy doesn't yet include it.

**Implication:** The existing pre-execution behavior (Self framing, process-analyst) could be formalized as a fifth harness pattern class, making pre-execution gates declarable in process definitions rather than implicit in the Self's role.

**4. The "interview me" pattern validates consultative framing (L6)**

The article recommends: "Interview me until you have 95% confidence about what I actually want." This is exactly Ditto's consultative-not-configurative principle (Insight-049) and the Self's framing role (ADR-016). The article independently arrived at the same conclusion: AI asking the human questions is more effective than the human prompting AI.

**Validation:** Ditto's conversational intake model is correct. The market is discovering this principle from the bottom up.

**5. Process discipline is necessary but insufficient**

Superpowers' 121K stars prove that going from "chatting randomly with AI" to "using AI with a process" is a massive step. But the article's critique — "every session's context stays in that session" — is exactly Problem 2 in Ditto's personas: "AI reinvents its approach every time — nothing learns, nothing sticks." Process without memory is Superpowers. Process with memory is Ditto.

**Validation:** Ditto's core thesis (processes are durable, corrections accumulate, the harness evolves) addresses the exact gap the market feels between Superpowers and CE.

### What Challenges Ditto's Design

**1. The compound step is explicit, not implicit**

Ditto's L5 captures feedback implicitly (edits tracked as diffs, downstream rejection rates, metric checks). CE makes knowledge extraction an explicit, parallel, post-completion step. The implicit approach is elegant but may miss higher-order lessons — the "why" behind a fix, what was tried and failed, prevention strategies. These require deliberate extraction, not just pattern detection from correction diffs.

**Challenge:** Ditto should consider whether implicit feedback capture alone is sufficient, or whether an explicit extraction meta-process (like CE's compound) should complement it. The answer is likely both: implicit for operational feedback (corrections, quality signals), explicit for strategic knowledge (solution patterns, failure modes, prevention strategies).

**2. Knowledge retrieval at plan time is as important as knowledge capture**

CE's plan phase "spawns parallel research agents that dig through your project's history, scan codebase patterns, and read git commit logs." Ditto's architecture already has the retrieval mechanism: agent harness assembly merges relevant memories into context at invocation time with progressive disclosure. But the memory model's three scopes (agent-scoped, process-scoped, self-scoped) focus on corrections, preferences, and process-specific context — not accumulated "solution knowledge" or "what we learned last time something similar happened." The retrieval infrastructure exists; the knowledge type it draws from is the gap.

**Challenge:** The memory model should include a "solution knowledge" category within existing scopes — tagged, categorized, searchable by problem type. Agent harness assembly already handles progressive disclosure; the missing piece is having solution patterns in the store to disclose.

**3. The ensemble reviewer scales conditionally**

CE's review ensemble uses a minimum of 6 always-on reviewers plus conditional ones based on the diff. This is dynamic scaling. Ditto's review patterns are declared per-process (maker-checker, adversarial, etc.) but don't describe conditional activation of additional reviewers based on output characteristics. The homeostatic quality model (Insight-101) provides the right framework — reviewers should activate when quality variables are out of range — but this hasn't been specified as a concrete mechanism.

### What Ditto Already Does Better

**1. Trust as a first-class, progressive system** — None of the three tools have anything resembling Ditto's trust tiers (supervised → spot-checked → autonomous → critical) with automatic downgrade. They're all-or-nothing: you run the review step or you don't.

**2. Multi-process orchestration** — All three tools operate on single tasks. Ditto's L4 (Awareness Layer) with process dependency graphs, event propagation, and organizational data models is architecturally beyond anything these tools attempt.

**3. The human is in the loop structurally, not optionally** — gstack/CE treat human review as a process step you choose to run. Ditto treats human oversight as a trust-calibrated architectural property that the system manages.

**4. Homeostatic quality regulation** — The three-disposition model (generative Self, critical evaluator, strategic orchestrator) with approach/avoidance gradients (Insights 100-101) is architecturally more sophisticated than CE's post-hoc extraction. Ditto regulates quality in-flight; CE records lessons after the fact.

**5. Process as the durable primitive** — The tools layer skills on top of an ephemeral conversation. Ditto makes the process durable, the corrections accumulating, and the harness evolving. The tools solve today's task. Ditto solves the class of task permanently.

## Implications

**Primary (the core finding):**

1. **Design an explicit Knowledge Compounding meta-process** — not as a replacement for implicit L5 feedback, but as a complement. After significant work completes, the harness should extract: problem type, what was tried, what worked, what failed, root cause, prevention strategy, category tags. This is Insight-042 made concrete. The compound step makes knowledge accumulation deliberate, not just emergent.

2. **Add a "solution knowledge" category to the memory model** — within existing scopes (process-scoped, agent-scoped), tag memories as solution patterns so that the existing progressive disclosure mechanism at context assembly can surface relevant precedents. Compound captures; context assembly applies. The retrieval infrastructure exists; the knowledge type doesn't.

**Secondary (formalization opportunities, lower priority):**

3. **Formalize pre-execution validation as a harness pattern** — the Self and framing meta-process already perform this role. The opportunity is to classify it alongside the four post-execution patterns so process definitions can declare typed pre-execution gates.

4. **Conditional reviewer activation** — review ensemble should be able to scale based on output characteristics (diff size, domain sensitivity, confidence score), complementing the existing per-output confidence scoring that already routes low-confidence outputs to human review.

5. **These tools are potential adoption sources** — per Composition Over Invention, evaluate gstack's QA patterns, CE's compound subagent architecture, and Superpowers' process flow for direct adoption. The command structures and prompt engineering in these repos are the kind of implementation patterns Ditto should extract (Insight-031: Research-Extract-Evolve).

## Where It Should Land

**Priority 1 (the primary contribution):**
- **architecture.md** — Knowledge Compounding as an explicit meta-process in L5 Learning Layer description
- **architecture.md** — "solution knowledge" as a tagged memory category in L2 memory model
- **Insight-042 update** — cross-reference this insight as concrete evidence for the knowledge lifecycle meta-process

**Priority 2 (when the above is stable):**
- **architecture.md** — Pre-execution validation as a fifth harness pattern class in L3
- **architecture.md** — Conditional reviewer activation in L3 review patterns

**Priority 3 (composition opportunity):**
- **Brief** — Research task to extract implementation patterns from gstack, CE, and Superpowers repos (composition candidates per Insight-031)

**Research completed:** `docs/research/knowledge-compounding-patterns.md` (Brief 059) — code-level analysis of CE compound, survey of 7 cross-session memory systems, concrete proposals for solution memory type + retrieval + lifecycle.

## Absorption Status (2026-03-30)

**Primary implications — absorbed via Brief 060:**
- ✅ Explicit Knowledge Compounding meta-process: 4-step system process (`processes/knowledge-extraction.yaml`) with 3 parallel extractors + assembly
- ✅ Solution knowledge memory type: `"solution"` added to memory model with structured metadata (category, tags, rootCause, prevention, failedApproaches)
- ✅ Solution-aware retrieval: separate 1000-token budget in memory assembly, `## Prior Solution Knowledge` section
- ✅ Architecture.md updated: L5 Learning Layer, L2 memory model, system agent table

**Secondary implications — still active:**
- Pre-execution validation as a fifth harness pattern class (implication 3)
- Conditional reviewer activation based on output characteristics (implication 4)
- Adoption source evaluation of gstack/CE/Superpowers repos (implication 5)
