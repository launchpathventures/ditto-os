# ADR-014: Agent Cognitive Architecture

**Date:** 2026-03-21
**Status:** accepted

## Context

Agent OS models what agents do (process steps, executors), how they're governed (trust tiers, review patterns), what deserves attention (ADR-011), and what kind of human thinking review demands (ADR-013). These answer:

- **What** does the agent do? → Process definitions
- **How is it governed?** → Trust tiers + review patterns
- **What form does oversight take?** → Attention model (ADR-011)
- **What thinking does review demand?** → Cognitive model (ADR-013)
- **At what cost?** → Budget model (ADR-012)

But none of these answer: **How should the agent think?**

Currently, agents are modeled as: role + tools + memory → output → trust check. This is the factory model — assign task, execute, inspect output. It's how iterative machines work. It's not how humans solve problems.

Humans are powerful problem solvers because of capabilities beyond skill:

1. **Mental models** — cognitive tools for reasoning (first principles, inversion, probabilistic thinking)
2. **Thinking style** — mode of reasoning (creative, analytical, critical, systems thinking)
3. **State management** — conditions for quality thinking (focus, priming, energy)
4. **Metacognition** — monitoring their own thinking (self-assessment, recognizing unproductive patterns)
5. **Relational intelligence** — communicating authentically (honest uncertainty, productive failure, empathy)
6. **Executive function** — the governing capability that selects, monitors, and fluidly shifts all of the above
7. **Intuition** — pattern matching below conscious awareness, sensing when something is off

The software consulting market (~$500B+) charges primarily for problem framing (~40%) and adaptation (~20%) — not methodology and execution. Agent OS with process-as-primitive captures methodology + execution. The cognitive architecture captures the remaining 60%: how to think about problems, when to change approach, and when to trust a gut signal over a metric.

Research (`docs/research/cognitive-prompting-architectures.md`) surveyed 30+ sources across prompting science, cognitive architectures, and metacognition in AI. Key findings:

### Design forces

- **MeMo (Guan et al., 2024):** LLMs autonomously select appropriate mental models when given a toolkit, achieving near-SOTA without task-specific prompting. **Evidence for "provide tools, don't prescribe."**
- **Prompting Inversion (Bernstein et al., 2025):** Constrained prompting hurts frontier models by 2.4%. Rules that help mid-tier models become "handcuffs" on advanced ones. **Evidence against prescription.**
- **MAP (Webb et al., Nature Communications 2025):** Brain-inspired modular architecture with 6 cognitive modules achieves +63% on planning tasks. Monitor (conflict detection) and Evaluator (goal proximity) map to harness capabilities. **Evidence for modular cognitive functions.**
- **Reflexion (Shinn et al., NeurIPS 2023):** Self-reflecting agents improve +17-21% on coding tasks. Verbal reflections stored as episodic memory and retrieved for future attempts. **Evidence for metacognitive monitoring.**
- **Metacognition module (Toy et al., 2024):** Periodic self-evaluation + strategy adjustment improves agents by +33% across all metrics. **Evidence for intention tracking.**
- **Cognitive Design Patterns (Wray et al., AGI 2025):** LLMs lack reliable reconsideration — ability to abandon prior commitments and switch strategies. **The executive function gap.**
- **CoT diminishing returns (Meincke et al., 2025):** Reasoning models gain only 2-3% from explicit chain-of-thought at 20-80% time cost. External scaffolding has decreasing value as models improve. **Evidence for adaptive scaffolding depth.**
- **CoALA (Sumers et al., TMLR 2024):** Theoretical framework organizing agent cognition around memory types, action spaces, and decision cycles. Provides the conceptual vocabulary.
- **Insight-046:** The principle — "Agent OS provides cognitive tools and creates conditions for quality thinking. It does NOT prescribe which tool to use. Executive function and intuition govern selection."

### The critical design tension

Too prescriptive = fancy workflow. The agent follows a decision tree: "research task → apply mental model #7." No intelligence. No room to notice something unexpected.

Too unstructured = raw chat. The agent has no tools, no framing, no metacognitive scaffolding. Output quality depends entirely on the model's native capability.

The sweet spot = **structured toolkit + executive judgment + space for intuition.** The consulting firm analogy: the firm provides methodology and mental models. The consultant's judgment determines which tool to pick up — and when to throw the playbook out.

### Relationship to ADR-013

ADR-013 models what kind of **human** thinking review demands (analytical vs creative). ADR-014 models what kind of **agent** thinking execution demands. They are complementary:

| Concern | ADR-013 (Cognitive Model) | ADR-014 (Cognitive Architecture) |
|---|---|---|
| **Who is thinking?** | The human reviewing output | The agent producing output |
| **What is modeled?** | Review framing, feedback vocabulary, insight escalation | Reasoning approach, metacognition, executive function |
| **What is declared?** | `cognitive_mode` on process steps (for review) | `cognitive_toolkit` on process steps (for execution) |
| **What adapts?** | Review UI, feedback capture | Context assembly, agent prompts, harness monitoring |

Both are cross-cutting concerns spanning L2-L6. Both ship incrementally. They interact: an agent executing in "exploratory" mode may produce outputs best reviewed in "creative" mode. This connection is natural but not mandatory — the human declares both independently.

## Decision

### 1. Three-layer cognitive architecture

The agent cognitive architecture is structured as three layers with distinct characters. This design satisfies both the structure-helps evidence (layers 1 and 3 provide scaffolding) and the structure-constrains evidence (layer 2 is opt-in, layer 3 frames without prescribing).

**Layer A: Cognitive Infrastructure (always active)**

Harness-level capabilities that operate regardless of cognitive posture. These are the agent's executive function substrate — the mechanisms that enable quality thinking.

| Capability | What it does | Existing / New | Evidence |
|---|---|---|---|
| **Context assembly** | Selects and orders information for the agent's working memory. Position-aware (critical information at start and end). | Existing (memory assembly) — enhance | Liu et al. 2023: 2-12% effect from ordering |
| **Metacognitive monitoring** | Between process steps, the orchestrator evaluates: "Is this approach converging on the goal?" Stores verbal reflections for future retrieval. | New | Toy et al. 2024: +33%; Reflexion: +17-21% |
| **Friction detection** | Tracks retry count, confidence trajectory, correction accumulation per run. Surfaces friction signals to the orchestrator. | New (extends existing retry logic) | Wray et al. 2025: reconsideration gap |
| **Inhibitory control** | Stops unproductive execution — low confidence pauses, trust gate blocks. Already built. | Existing (trust gate) | MAP: <1% invalid actions with Monitor |
| **Calibrated uncertainty** | Agents express honest uncertainty. The system rewards well-calibrated uncertainty signals (honest low confidence that proves justified increases trust, not decreases it). | Existing (confidence) — reframe | Kadavath et al. 2022; Steyvers & Peters 2025 |

**Layer B: Cognitive Toolkit (available, not mandated)**

A library of cognitive tools that agents can draw on. Process definitions declare which tools are available for a step. The agent decides whether and how to use them — the harness does not enforce.

This follows the MeMo pattern: provide the toolkit, let the model choose.

| Tool type | Examples | Delivery mechanism |
|---|---|---|
| **Mental models** | First principles, inversion, second-order effects, circle of competence, Occam's Razor, 80/20, hypothesis-driven, probabilistic thinking | Markdown templates in `cognitive/models/`. Injected into agent context when available for the step. |
| **Reasoning strategies** | Structured decomposition, multi-path evaluation, adversarial self-check, analogical reasoning | Markdown templates in `cognitive/strategies/`. |
| **Reflection prompts** | "Am I solving the right problem?", "What would I do differently?", "What surprised me?", "What am I uncertain about and why?" | Markdown templates in `cognitive/reflections/`. Injected at reflection checkpoints. |
| **Communication patterns** | Honest uncertainty expression, productive failure framing, concern flagging, evidence-based recommendation | Markdown templates in `cognitive/communication/`. Part of agent system prompt. |

The toolkit is **content, not code.** New mental models are added by creating markdown files, not by changing the engine. The harness resolves which content to inject based on the step's declared toolkit.

**Layer C: Cognitive Context (framing, not scripting)**

Per-step declarations that set the cognitive register without mandating specific reasoning. The frame primes; the agent decides.

```yaml
steps:
  - name: research_alternatives
    executor: cli-agent
    cognitive_context:
      framing: exploratory          # "explore widely, notice unexpected patterns"
      toolkit: [first-principles, inversion, hypothesis-driven]  # available, not mandated
      reflection: goal-check        # at reflection checkpoint, ask "am I still on track?"
      freedom: high                 # signal to harness: minimal scaffolding
```

The `framing` field sets the cognitive register via a short natural-language directive injected at the top of the agent's context. It primes without prescribing:

| Framing | What it primes | When to use |
|---|---|---|
| **exploratory** | "Explore widely. Notice unexpected patterns. Don't converge early." | Research, discovery, brainstorming |
| **analytical** | "Be precise. Check assumptions. Verify against evidence." | Data analysis, review, verification |
| **convergent** | "Narrow to the best option. Make a decision. Justify clearly." | Design decisions, planning conclusions |
| **adversarial** | "Find what's wrong. Challenge assumptions. Stress-test." | Security review, risk assessment, code review |
| **generative** | "Create. Prioritize novelty and quality over safety." | Content creation, design, ideation |
| **integrative** | "Connect dots across domains. What does this pattern mean?" | Cross-process analysis, strategic insight |

Custom framings are allowed — the field is free text, not an enum. The predefined framings are defaults for common cognitive postures.

The `freedom` field (high / medium / low) signals to the harness how much scaffolding to provide. High freedom = minimal cognitive infrastructure, trust the model's native capability. Low freedom = full scaffolding (useful for less capable models or novel tasks). This addresses the Prompting Inversion finding: stronger models need less structure.

### 2. Executive function as orchestrator evolution

**The judgment hierarchy (Insight-047):** Agent OS separates structure from judgment through a clear four-level hierarchy. Each level has a distinct scope of freedom:

| Level | What it governs | Scope of freedom |
|---|---|---|
| **Human** | Process structure — what steps exist, what quality criteria, what trust tier | Full — the human defines and can change anything |
| **Orchestrator** | Execution strategy — task decomposition, sequencing, approach evaluation | Can recompose decomposition, reorder tasks, flag that the process itself may need rethinking. Cannot change the process definition. |
| **Agent** | Step approach — how to execute within the step's constraints | Can choose reasoning approach, use or ignore toolkit, flag concerns. Cannot skip steps or change quality criteria. |
| **Harness** | Outcome evaluation — did the output meet quality criteria? | Evaluates everything. Cannot override human decisions. Surfaces findings, never auto-fixes. |

The governing principle: **Processes declare structure. Agents bring judgment. The harness evaluates outcomes.** A process definition governs what happens and in what order. The agent within each step has freedom to exercise judgment about how. The harness evaluates whether the output meets quality criteria — it doesn't prescribe how the agent got there. This ensures consistency (same process, same governance) without rigidity (agents can adapt to context).

The orchestrator (Brief 021) currently decomposes goals into tasks and tracks completion. It is a task manager. ADR-014 evolves it into the system's **executive function** — the cognitive manager that monitors, evaluates, and adapts within its scope of the judgment hierarchy.

| Executive function capability | How the orchestrator implements it |
|---|---|
| **Working memory** | Maintains goal context + current run state + friction signals + prior reflections across the orchestration cycle. Decides what context each child task receives. |
| **Progress monitoring** | At each orchestration heartbeat, evaluates: "Is this work converging on the stated intention?" Not just "are tasks completing?" but "is the goal getting closer?" Uses the Evaluator concept from MAP. |
| **Cognitive flexibility** | When friction accumulates (retries, declining confidence, corrections), the orchestrator can reframe the approach: change the cognitive context for remaining steps, reorder tasks, or flag "the current approach may not be working" to the human. |
| **Inhibitory control** | Recognizes unproductive patterns (same error repeated, confidence not recovering, scope expanding without progress) and stops execution. Surfaces a structured reflection: "Tried X, didn't work because Y, recommend Z." This is Brown's productive failure pattern. |
| **Initiation** | Proactively identifies next actions based on goal state, rather than waiting to be told. Already partially implemented (orchestrator decomposes goals). |

**The orchestrator's reflection cycle** (new, runs at each orchestration heartbeat):

```
For each active goal:
  1. Assess progress: Are child tasks converging on the intention?
  2. Check friction: Has confidence been declining? Retries accumulating?
  3. Evaluate approach: Is the current decomposition still right?
  4. Decide:
     a. Continue — things are on track
     b. Adapt — reframe cognitive context for remaining tasks
     c. Escalate — flag to human: "I think we need to rethink this"
     d. Stop — approach isn't working, surface what we learned
```

This cycle is lightweight — it's an evaluation step within the existing `orchestratorHeartbeat()`, not a separate system. The orchestrator already iterates over active tasks; the reflection adds an evaluation pass.

**Intuition: the space to notice.** The reflection cycle explicitly includes space for emergent observation. The orchestrator's reflection prompt includes: "What, if anything, surprises you about the current state? Is there something that doesn't look right, even if you can't articulate why?" This is the equivalent of a manager's gut check — pattern matching below conscious analysis. Responses feed into the meta-memory for future retrieval.

### 3. Adaptive scaffolding depth

The cognitive architecture adapts to model capability and task novelty. This addresses the Prompting Inversion finding.

| Factor | More scaffolding | Less scaffolding |
|---|---|---|
| **Model capability** | Less capable models (Haiku-class) | More capable models (Opus-class) |
| **Task novelty** | First time this process runs | 50th run with stable patterns |
| **Step `freedom` field** | `low` | `high` |
| **Trust tier** | Supervised (new, unproven) | Autonomous (proven track record) |

**Phase A:** Scaffolding depth is controlled entirely by the `freedom` field on `cognitive_context`. The process author sets it; the harness respects it. If unset, default is `medium`.

**Phase B (after data accumulation):** The harness can automatically suggest scaffolding depth based on model capability + task novelty + trust tier. Suggestions surface as improvement proposals — the system never auto-adjusts scaffolding. The `freedom` field always takes precedence if explicitly set.

Scaffolding levels:

- **High scaffolding** (`freedom: low`): Full cognitive context injection (framing + toolkit descriptions + reflection prompts + few-shot examples + prior reflections). Used for less capable models, novel tasks, or supervised processes.
- **Medium scaffolding** (`freedom: medium`): Framing + toolkit availability signal + key reflection. Default.
- **Low scaffolding** (`freedom: high`): Minimal framing only. The model uses native reasoning. Used for capable models, mature tasks, or steps where intuitive exploration is desired.

**Token budget estimate:** Cognitive injection costs approximately 500-1500 tokens per step (3 mental model descriptions + 1 reflection prompt + framing directive). Manageable in 128K+ contexts. For smaller contexts, cognitive content competes via salience scoring (ADR-012) — task-relevant context always takes priority.

### 4. Trust model integration: rewarding cognitive quality

The trust earning algorithm (ADR-007) currently evaluates output quality (approval rate, correction rate). ADR-014 extends the trust signal to include **cognitive quality**:

| Signal | What it measures | How it feeds trust |
|---|---|---|
| **Calibrated uncertainty** | When the agent says "low confidence," is it right to be uncertain? | Agents with well-calibrated confidence earn trust faster. Honest uncertainty is rewarded, not penalized. |
| **Productive failure** | When execution fails, does the agent surface structured learning? | Quality of failure reflections (not just whether it failed) informs trust trajectory. |
| **Proactive concern flagging** | Does the agent flag issues before they become failures? | Concerns that prove justified contribute positively to trust evaluation. This is the same `concern` field proposed in ADR-013 §3 (challenge orientation) — a shared signal consumed by both the cognitive model (for review framing) and the cognitive architecture (for trust evaluation). |

This is the Brené Brown integration: trust is built through vulnerability and authentic engagement, not just performance metrics. An agent that produces 90% correct outputs but honestly flags the uncertain 10% earns trust faster than one that produces 95% correct outputs but never admits uncertainty — because the latter will eventually surprise you.

**Implementation:** These signals are captured as metadata on step runs (alongside existing confidence and cost fields). The trust evaluator system agent factors them into its evaluation. Specific weights are tunable and should be empirically calibrated.

### 5. Learning from cognitive approach

Because cognitive approach is first-class (tracked on step runs), the learning layer can correlate approach with outcomes:

| Learning capability | What it detects | When it activates |
|---|---|---|
| **Approach-outcome correlation** | "Exploratory framing on research steps produces 30% fewer corrections than analytical framing in this domain" | After 20+ runs with varied approaches |
| **Toolkit effectiveness** | "First-principles mental model is used in 80% of the highest-rated research outputs" | After 20+ runs where toolkit usage is tracked |
| **Friction pattern detection** | "This process always accumulates friction at step 3 — the framing may be wrong" | After 5+ runs with consistent friction patterns |
| **Model-scaffolding fit** | "Opus-class models produce better output with minimal scaffolding on this step" | After 10+ runs across different scaffolding levels |

These learnings surface as improvement proposals (existing mechanism), not automatic changes. The human decides whether to adjust cognitive context based on evidence.

### 6. Architecture amendments

**New cross-cutting section in `architecture.md`:** "Cross-Cutting: Agent Cognitive Architecture (ADR-014)" — alongside attention model, cognitive model, governance, and integrations.

Framing:

> Trust tiers determine oversight **rate** (how often). The attention model determines oversight **form** (item review, digest, alert). The cognitive model (ADR-013) determines what kind of **human thinking** review demands. The cognitive architecture (ADR-014) determines what kind of **agent thinking** execution demands — and provides the executive function that governs the system's cognitive resources.

**Layer impacts:**

| Layer | What changes |
|---|---|
| **L1 (Process)** | Process step definitions gain optional `cognitive_context` block: `framing`, `toolkit`, `reflection`, `freedom`. Defaults are sensible — no step requires cognitive configuration. |
| **L2 (Agent)** | Context assembly becomes cognition-aware: resolves scaffolding depth, injects toolkit content, manages cognitive priming. Adapters receive cognitive context as part of the `AdapterContext`. |
| **L3 (Harness)** | Metacognitive monitoring added between steps (orchestrator reflection cycle). Friction detection extends retry logic. Cognitive approach recorded on step runs for learning correlation. |
| **L4 (Awareness)** | Cross-process cognitive learning: which approaches work in which domains. Goal-level intention tracking (is progress converging?). |
| **L5 (Learning)** | Approach-outcome correlation, toolkit effectiveness tracking, friction pattern detection, model-scaffolding fit. All surface as improvement proposals. |
| **L6 (Human)** | Human sees cognitive context in process definitions (Process Builder). Can adjust framing, toolkit, freedom. Improvement proposals include cognitive recommendations. |

**Combined cognitive fields on a process step (ADR-013 + ADR-014):**

Both ADRs add optional fields to process step definitions. They serve different sides of the same coin:

```yaml
steps:
  - name: draft_product_description
    executor: cli-agent
    # ADR-013: How should the HUMAN review this output?
    cognitive_mode: creative          # review framing + feedback capture
    # ADR-014: How should the AGENT approach this execution?
    cognitive_context:
      framing: generative             # primes the agent's reasoning posture
      toolkit: [analogy, first-principles]  # available mental models
      reflection: goal-check          # reflection prompt at checkpoint
      freedom: high                   # minimal scaffolding
```

`cognitive_mode` shapes the review experience when the human is pulled in. `cognitive_context` shapes the execution experience when the agent runs. They are independently declared — a step can have one, both, or neither.

**What doesn't change:**
- Trust tiers (4 tiers, earning algorithm, downgrade triggers) — extended with cognitive quality signals, not replaced
- Review patterns (4 patterns) — unchanged
- Attention model (3 modes) — unchanged
- Cognitive model for review (ADR-013) — complementary, not overlapping
- Process definition structure — extended with optional blocks, not restructured
- Memory architecture (2 scopes) — unchanged

## Provenance

**Three-layer architecture concept:** Original to Agent OS — no existing system composes cognitive infrastructure + toolkit + context as agent harness layers. Research basis: MeMo (Guan et al., 2024) for toolkit-not-prescription pattern; MAP (Webb et al., Nature Communications 2025) for modular cognitive decomposition; CoALA (Sumers et al., TMLR 2024) for theoretical framework.

**Executive function as orchestrator:** Original to Agent OS — no production system implements unified executive function (working memory + cognitive flexibility + inhibitory control + progress monitoring) for multi-step agent processes. Research basis: MAP Monitor/Evaluator modules; Wray et al. (AGI 2025) cognitive design patterns; Toy et al. (2024) metacognition module.

**Mental model toolkit:** MeMo pattern (Guan et al., 2024) — provide mental models as composable tools, let the agent choose. Implementation adapted for process-harness context. Content informed by Farnam Street / Shane Parrish mental model library. **Adopt pattern, build implementation.**

**Metacognitive monitoring:** Reflexion pattern (Shinn et al., NeurIPS 2023, MIT License) — verbal self-reflection stored as episodic memory. Toy et al. (2024) metacognition module — periodic self-evaluation with strategy adjustment. **Adopt patterns, build integration.**

**Adaptive scaffolding:** Original to Agent OS — no framework adapts cognitive scaffolding depth based on model capability + task novelty + trust tier. Research basis: Prompting Inversion (Bernstein et al., 2025); CoT diminishing returns (Meincke et al., 2025).

**Cognitive quality in trust:** Original to Agent OS — no system rewards calibrated uncertainty and productive failure as trust-building behaviors. Conceptual basis: Brené Brown (vulnerability as trust builder); Steyvers & Peters (2025) metacognition and uncertainty communication.

**State management and priming:** Tony Robbins (state determines performance); context priming research (Liu et al., 2023; Kim et al., 2025). Applied as position-aware context assembly and situation-dependent priming. **Adopt research findings, build implementation.**

**ACE Framework (Shapiro):** Informed the layered architecture concept. Six-layer cognitive architecture with executive function and cognitive control as distinct layers. Not adopted directly — Agent OS uses a three-layer model tailored to process-driven execution.

## Consequences

### What this enables

- **Agents think better, not just execute.** Process steps can be primed with appropriate cognitive tools and framing. A research step gets "exploratory + first-principles," a review step gets "adversarial + inversion." The agent chooses how to use them.
- **The system learns what thinking works.** Because cognitive approach is tracked on step runs, the learning layer builds evidence: "exploratory framing produces better research in this domain." This is institutional knowledge about methodology — what consulting firms spend decades building.
- **Executive function makes autonomous execution safe.** The orchestrator doesn't just track tasks — it monitors intention convergence, detects unproductive patterns, and adapts. This is the capability that makes Insight-040 (continuous roadmap execution) viable.
- **Intuition has space.** The architecture explicitly creates room for agents to notice unexpected patterns, flag concerns, and follow threads that weren't in the plan. This is the difference between a workflow executor and a problem solver.
- **Trust rewards authenticity.** Agents that express honest uncertainty and flag concerns proactively earn trust faster. The system values how you engage, not just what you produce. This makes the trust model more human-aligned.
- **Scaffolding adapts.** Less capable models get more structure. More capable models get more freedom. The architecture doesn't assume a fixed model capability — it adapts as models improve (addressing the Prompting Inversion finding).
- **The dev process benefits first.** The 7 dev roles can immediately use cognitive context: researcher = exploratory + hypothesis-driven, builder = convergent + first-principles, reviewer = adversarial + inversion. This validates the architecture before it ships to users.

### What this does NOT do

- Does NOT prescribe cognitive approaches. The toolkit is available; the agent chooses. The framing primes; the agent decides.
- Does NOT require cognitive configuration for every process step. All fields are optional with sensible defaults. A step with no cognitive context works exactly as it does today.
- Does NOT change the process execution model. Steps still execute through the same harness pipeline. Cognitive architecture adds context assembly enrichment and orchestrator monitoring, not new execution paths.
- Does NOT introduce autonomous cognitive evolution. The system recommends cognitive adjustments based on evidence. The human decides. No auto-modification.
- Does NOT replace ADR-013. Human review cognitive mode and agent execution cognitive posture are complementary concerns.

### Risks

- **Cognitive overhead.** If the toolkit content is too large, it consumes context window budget that could go to task-relevant information. **Mitigation:** Toolkit injection is subject to the same token budget as memory assembly (ADR-012). Cognitive content competes for context space on merit (salience), not by right.
- **Over-instrumentation.** Tracking cognitive approach on every step run adds data without immediate value until the learning layer can analyze it. **Mitigation:** Tracking is lightweight (a few fields on step runs). Analysis activates after sufficient data accumulates (20+ runs). No premature optimization.
- **Reflection overhead.** Metacognitive monitoring between steps adds latency to process runs. **Mitigation:** Reflection is lightweight (one LLM call) and runs only at orchestrator heartbeats (not between every step). For time-sensitive processes, reflection frequency is configurable.
- **Toolkit quality.** Mental model templates could be poorly written, producing worse results than no toolkit. **Mitigation:** Start with a small, high-quality set (5-7 mental models). Expand based on evidence of effectiveness. The content library has the same quality bar as process definitions.
- **False intuition signals.** Agents might flag "something feels off" when nothing is actually wrong, creating noise. **Mitigation:** Intuitive signals are treated as low-priority observations, not escalations. They feed into meta-memory for pattern detection. Only after multiple corroborating signals does the system surface them.

### Follow-up decisions needed

- **Cognitive content library:** Initial set of mental models, strategies, reflection prompts, and communication patterns. Requires authoring. Candidates for first set: first principles, inversion, second-order effects, circle of competence, hypothesis-driven thinking (5 mental models); goal-check, approach-check, assumption-check (3 reflection prompts).
- **Trust evaluator extension:** How the trust evaluator system agent weights cognitive quality signals alongside output quality signals. Requires empirical tuning.
- **Dev process integration:** How the 7 dev role skill files incorporate cognitive context. Immediate next step: add cognitive framing to each role contract as validation.
- **Orchestrator evolution timeline:** The orchestrator reflection cycle (A2) ships after the cognitive toolkit (A1) is validated. A1 is independently valuable; A2 makes it powerful.
- **Roadmap integration:** Phases A1-D are sub-phases within the project roadmap. The PM should determine where they sit relative to Phases 6-12 based on priority triage. Likely: A1 can run in parallel with Phase 6 (external integrations) since it's primarily content + schema work. A2 extends the existing orchestrator.

## Build Phasing

| Phase | What ships | Layer | Cost | Evidence required first |
|---|---|---|---|---|
| **A1: Cognitive Toolkit** | Cognitive content library (5-7 mental models, 3 reflection prompts, communication patterns). Optional `cognitive_context` block on process steps. Harness injects toolkit content at context assembly. Cognitive approach recorded on step runs. | L1, L2, L3 | Medium | None — adopt MeMo pattern |
| **A2: Orchestrator Reflection** | Orchestrator reflection cycle: intention tracking, friction detection, approach evaluation at each heartbeat. | L3, L4 | Medium | A1 validated — cognitive context flows through the harness |
| **B1: Learning Correlation** | Learning layer correlates cognitive approach with outcomes. Improvement proposals include cognitive recommendations. | L5 | Medium | A1+A2 data accumulation (20+ runs) |
| **B2: Adaptive Scaffolding** | Automatic scaffolding depth suggestions based on model capability + trust tier + task novelty. Human approves. | L2, L3 | Low | A1 data showing scaffolding-outcome relationship |
| **C: Cognitive Trust** | Cognitive quality in trust: calibrated uncertainty and productive failure as trust signals. Trust evaluator extension. Cross-process cognitive learning. | L3-L5 | Medium | B1 data showing cognitive quality correlates with trust-relevant outcomes |
| **D: Full Cognitive Management** | Orchestrator recommends cognitive postures based on accumulated evidence. Human approves/adjusts. Cognitive toolkit expansion based on measured effectiveness. | L2-L6 | Medium | Phases B+C evidence |

### Acceptance Criteria

**Phase A1 (Cognitive Toolkit):**
1. `cognitive/` directory exists with 5+ mental model templates, 3+ reflection prompts, and communication pattern templates
2. Process steps accept optional `cognitive_context` block (framing, toolkit, reflection, freedom)
3. Context assembly injects toolkit content when `cognitive_context` is present on a step
4. Step runs record the cognitive approach used (framing + toolkit) as metadata
5. Steps without `cognitive_context` execute identically to current behavior (backward compatible)
6. At least 2 of the 7 dev roles run with cognitive context and produce qualitatively different output than without (manual assessment)

**Phase A2 (Orchestrator Reflection):**
1. Orchestrator heartbeat includes a reflection evaluation pass for active goals
2. Reflection evaluates: progress toward intention, friction accumulation, approach appropriateness
3. Reflection produces one of four decisions: continue, adapt, escalate, stop
4. Reflection outputs stored as meta-memory for future retrieval
5. "Escalate" surfaces a structured message to the human explaining what was tried and what's recommended
6. Reflection adds <2s latency to the orchestrator heartbeat
