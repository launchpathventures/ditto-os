# Research: Cognitive Prompting Architectures for AI Agents

**Date:** 2026-03-21
**Requested by:** Architect (Insight-046: Agent Cognitive Architecture)
**Status:** Complete
**Consumers:** ADR-014 (Agent Cognitive Architecture)

## Executive Summary

There is substantial and growing evidence that structured cognitive approaches improve AI agent output quality — but the evidence is nuanced. The strongest gains come from **self-reflection** (Reflexion: +17% on coding tasks), **multi-path reasoning** (Self-Consistency: +6-18% on arithmetic/commonsense), and **modular cognitive decomposition** (MAP: +63% on planning tasks vs zero-shot). Meanwhile, a critical counter-finding emerges: the "Prompting Inversion" effect shows that overly prescriptive prompting actually *hurts* performance on frontier models, with constrained approaches dropping 2.4% on GPT-5 compared to simple CoT. Chain-of-thought itself shows diminishing returns as models improve, with reasoning models gaining only 2-3% from explicit CoT at 20-80% time cost.

The field is converging on a key insight: **cognitive tools should be available, not mandated**. The MeMo framework (Guan et al., 2024) demonstrates that LLMs can autonomously select appropriate mental models when given a toolkit, achieving near-SOTA across diverse tasks without task-specific prompt engineering. The brain-inspired MAP architecture (Webb et al., 2025) shows that decomposing cognition into specialized modules — each handling a distinct cognitive function — dramatically outperforms monolithic approaches. CoALA (Sumers et al., 2024) provides the theoretical framework organizing this around memory types, action spaces, and decision cycles.

The gap Agent OS would fill is clear: **nobody has built a practical system that composes cognitive tools dynamically based on task context within a process-driven harness**. Existing frameworks are either purely academic (CoALA, MAP), focused on prompt optimization (DSPy), or provide static role prompting (CrewAI, AutoGen). A system that manages cognitive posture — selecting thinking approaches, managing working memory, enabling metacognitive monitoring, and balancing structure with exploratory freedom — as a layer of the agent harness does not exist in production.

## Evidence Base

### Proven Techniques (strong evidence)

**Chain-of-Thought Prompting (Wei et al., 2022)**
Generating intermediate reasoning steps improves LLM performance on arithmetic, commonsense, and symbolic reasoning. Effect sizes: +10-15% on GSM8K for non-reasoning models. However, the Wharton Prompting Science Report (Meincke et al., 2025) shows CoT's value is decreasing: non-reasoning models gain 4-14%, reasoning models gain only 2-3% at 20-80% time cost penalty. CoT is now largely built into frontier models.
*Agent OS mapping:* CoT is table stakes — the system should enable it but not force it. More important is knowing *when* to apply structured reasoning vs letting the model reason natively.

**Self-Consistency (Wang et al., 2022)**
Sampling multiple reasoning paths and selecting the most consistent answer. Effect sizes: GSM8K +17.9%, SVAMP +11.0%, AQuA +12.2%, StrategyQA +6.4%, ARC-challenge +3.9%. One of the most robust improvements in the prompting literature.
*Agent OS mapping:* High-stakes decisions in processes could use multi-path sampling with consistency voting. This is a cognitive tool the harness should offer, particularly for trust-sensitive steps.

**Reflexion (Shinn et al., 2023)**
Self-reflecting agents that maintain verbal reflections in episodic memory and use them to improve subsequent attempts. GPT-4 + Reflexion achieved 88% pass@1 on HumanEval (vs ~67% without). Published at NeurIPS 2023.
*Agent OS mapping:* Direct parallel to process step feedback loops. The harness already has feedback recording — extending it to structured self-reflection between process iterations is a natural fit.

**Tree-of-Thought / LATS (Yao et al., 2023; Zhou et al., 2024)**
LATS (Language Agent Tree Search) unifies reasoning, acting, and planning using Monte Carlo Tree Search with LM-powered value functions and self-reflections. Achieved 92.7% pass@1 on HumanEval with GPT-4. Published at ICML 2024.
*Agent OS mapping:* For complex planning steps in processes, tree search over reasoning paths could be offered as a cognitive strategy. The value function concept maps to the trust/confidence system.

**Modular Agentic Planner / MAP (Webb et al., 2025)**
Brain-inspired architecture decomposing planning into 6 specialized LLM modules (Actor, Monitor, Predictor, Evaluator, TaskDecomposer, Orchestrator), each inspired by distinct prefrontal cortex regions. Published in Nature Communications.
Effect sizes: Tower of Hanoi 74% solved (vs 11% GPT-4 zero-shot), Graph Traversal 95-100%, StrategyQA 87.7%. Generated <1% invalid actions.
*Agent OS mapping:* This is the strongest evidence for modular cognitive architecture. The Monitor (conflict detection), Predictor (state forecasting), and Evaluator (goal proximity) map directly to harness capabilities. The key insight is that specialization across cognitive functions dramatically outperforms generalist prompting for planning tasks.

### Promising Approaches (moderate evidence)

**MeMo / Generalist Prompting via Mental Models (Guan et al., 2024)**
Rather than prescribing specific prompting strategies per task, MeMo provides LLMs with a toolkit of mental models (first principles, inversion, analogy, abstraction, cause-effect) and lets the model autonomously select which to apply. Achieves near-SOTA on STEM, logical reasoning, and commonsense in zero-shot settings. Example: Computer Science tasks 61.3% vs 56.3% for CoT.
*Agent OS mapping:* This is the strongest evidence for the "provide tools, don't prescribe" approach. The cognitive architecture should offer mental models as composable tools rather than mandating specific reasoning strategies.

**Metacognition Module for Agents (Toy et al., 2024)**
Added a metacognition module to generative agents that periodically self-evaluates progress, generates introspective questions, and stores "meta-memories" for future retrieval. Outperformed all other modules by 33% across believability, learning, goal achievement, cognitive performance, and survival metrics. Built on System 1/System 2 distinction.
*Agent OS mapping:* Direct implementation pattern for process-level metacognition. Agents could periodically ask "am I making progress toward the process goal?" and adjust strategy. This is the intention-tracking mechanism the orchestrator needs.

**Cognitive Design Patterns for LLM Agents (Wray, Kirk & Laird, 2025)**
Catalogs recurring cognitive patterns from Soar/ACT-R applicable to LLM agents: observe-decide-act, three-stage memory commitment (generate-select-commit with reconsideration), hierarchical decomposition, multiple memory types. Published at AGI 2025.
Key gaps identified: LLMs lack reliable reconsideration (abandoning prior commitments), knowledge compilation (caching multi-step reasoning into compact forms), and deliberate episodic memory retrieval.
*Agent OS mapping:* The reconsideration pattern is critical — agents need the ability to stop unproductive approaches and switch strategies. The harness should enable this as an executive function.

**Cognitive LLMs / LLM-ACTR (Wu et al., 2024-2025)**
Hybrid neuro-symbolic architecture integrating ACT-R cognitive architecture with LLMs. Extracts ACT-R decision-making knowledge as latent neural representations and injects them into trainable LLM adapter layers. Shows improved task performance and grounded decision-making vs LLM-only baselines.
*Agent OS mapping:* While Agent OS won't do adapter-layer injection, the pattern of informing LLMs with structured cognitive process knowledge (perception → memory → goal-setting → action) is directly applicable through prompting and context engineering.

**The Prompting Inversion (Bernstein et al., 2025)**
Critical finding: constrained, rule-based prompting ("Sculpting") improves mid-tier models (GPT-4o: 97% vs 93%) but *hurts* frontier models (GPT-5: 94% vs 96.36%). Mechanism: "Guardrail-to-Handcuff" transition where constraints preventing common-sense errors in weaker models induce hyper-literalism in stronger ones.
*Agent OS mapping:* The cognitive architecture must be model-capability-aware. Simpler prompts for more capable models, more scaffolding for less capable ones. This directly argues against one-size-fits-all cognitive framing.

### Untested Hypotheses (theoretical basis only)

**Dynamic Cognitive Posture Selection**
No system currently selects a complete "cognitive posture" (combination of thinking approach, uncertainty handling, communication style, and metacognitive depth) based on task type and context. MeMo touches mental model selection; MAP touches module composition; but nobody combines these with communication style and metacognitive depth.
*Agent OS mapping:* This is the novel territory. A cognitive posture = {reasoning strategy + uncertainty expression + monitoring depth + communication register}. The harness selects or adjusts this per process step.

**Intention Tracking vs Task Tracking**
While task tracking (is the task done?) is well-implemented, intention tracking (is this approach serving the original goal?) has only been explored in the metacognition paper (Toy et al., 2024). No production system distinguishes between these.
*Agent OS mapping:* Process goals are intentions; step completions are tasks. The orchestrator needs both.

**Serendipitous Discovery in Structured Processes**
Research on exploration-exploitation in LLMs (ExpLang, 2026) shows that diverse reasoning paths produce superior outcomes. Multi-agent systems exhibit emergent behaviors not explicitly programmed. But no framework systematically balances structured process execution with space for unexpected discoveries.
*Agent OS mapping:* Some process steps should explicitly allow for exploratory reasoning. The cognitive architecture could flag "exploration-mode" steps where the agent has freedom to notice unexpected patterns.

## Executive Function in AI

This section addresses the critical question: can we model executive function as a system capability?

### What Exists

**Brain-Inspired MAP (Webb et al., 2025)** provides the strongest implementation:
- **Working Memory:** Context window + retrieved memories, managed by the Orchestrator
- **Cognitive Flexibility:** The Monitor detects conflicts and provides corrective feedback, enabling strategy switching
- **Inhibitory Control:** The Monitor gates invalid actions before they execute (achieved <1% invalid actions)
- **Planning:** TaskDecomposer breaks goals into subgoals; Predictor forecasts outcomes
- **Monitoring:** Evaluator estimates distance to goal; Orchestrator determines goal achievement

**CoALA Framework (Sumers et al., 2024)** provides the theoretical structure:
- Working memory as active decision-cycle state
- Explicit procedural memory (code) vs implicit (LLM weights)
- Decision cycle: proposal → evaluation → selection → execution
- Clear distinction between internal actions (reasoning, retrieval, learning) and external actions (environment interaction)

**Metacognition Research** provides the self-monitoring layer:
- Toy et al. (2024): Agents that periodically self-evaluate and adjust strategy, 33% improvement
- Li et al. (2025): LLMs can monitor their own internal activations (NeurIPS 2025), but only along a limited "metacognitive space" — they can introspect on some dimensions but not all
- Luketina et al. (2025): ICML position paper arguing truly self-improving agents require *intrinsic* metacognitive learning, not just human-designed reflection loops

**Cognitive Design Patterns (Wray et al., 2025)** identifies what's missing:
- **Reconsideration:** LLMs struggle to abandon prior commitments and switch strategies — this is inhibitory control
- **Knowledge compilation:** No good mechanism for caching successful multi-step reasoning into reusable compact forms
- **Episodic memory retrieval:** Current implementations lack deliberate retrieval cues

### What Does Not Exist

Nobody has built a unified executive function layer for AI agents that:
1. Manages working memory across process steps (what context to keep, what to evict)
2. Monitors progress toward intentions (not just task completion)
3. Detects when an approach is unproductive and triggers strategy switching
4. Compiles successful reasoning patterns for reuse
5. Balances multiple competing goals

This is the gap Agent OS can fill. The harness already has process steps, feedback recording, and trust tiers. Adding executive function means:
- **Working memory management** = context assembly per step (already partially built)
- **Progress monitoring** = metacognitive checks between steps (new)
- **Strategy switching** = process branching based on agent self-assessment (new)
- **Inhibitory control** = the trust gate catching low-confidence or invalid actions (already built)

## The Structure vs Intuition Balance

This is the most architecturally consequential section. The evidence points clearly in one direction: **provide tools, don't prescribe**.

### Evidence That Structure Helps

1. **MAP's specialized modules** outperform generalist prompting by 60%+ on planning tasks. Structure in the form of cognitive decomposition is enormously effective.
2. **Self-Consistency's multi-path approach** consistently improves accuracy by 6-18%. Structured diversity beats single-shot reasoning.
3. **Reflexion's verbal self-reflection** improves coding by 20%+. Structure in the form of explicit reflection loops works.
4. **Input ordering matters:** 2-12% performance degradation from shuffled inputs (MSMARCO, MMLU). Context engineering — a form of structure — is essential.
5. **Few-shot example quality matters:** Careful selection outperforms random selection. Curating what the agent sees is structural work that pays off.

### Evidence That Structure Constrains

1. **The Prompting Inversion:** Constrained prompting hurts frontier models by 2.4%. Rules that help mid-tier models become "handcuffs" for advanced ones.
2. **Diminishing CoT returns:** Reasoning models gain only 2-3% from explicit CoT at 20-80% time cost. Built-in reasoning makes external scaffolding redundant.
3. **Over-prompting with few-shot examples:** Excessive domain-specific examples paradoxically degrade performance in some LLMs. More is not always better.
4. **Exploration-exploitation tradeoff:** Heavy reliance on retrieved content reduces output diversity. Structure that constrains the search space can prevent creative solutions.
5. **Model capability trajectory:** As models improve, the optimal amount of external structure decreases. Architecture must be adaptive.

### The Synthesis

The evidence converges on a clear design principle: **scaffolding, not prescription**.

- **Scaffolding** = providing cognitive tools, managing context, enabling metacognition, offering structure that the agent can use or ignore
- **Prescription** = mandating specific reasoning steps, forcing particular mental models, constraining output format unnecessarily

The MeMo finding is the clearest signal: give agents a *toolkit* of mental models and let them choose. The MAP finding adds: decompose cognition into *specialized modules* that collaborate. The Prompting Inversion adds: *adapt the level of structure to the model's capability*.

**Design implication for Agent OS:** The cognitive architecture should be a layer that:
1. Offers cognitive tools (mental models, reflection prompts, uncertainty calibration)
2. Manages cognitive infrastructure (working memory, context assembly, metacognitive monitoring)
3. Sets cognitive context without mandating cognitive behavior (framing, not scripting)
4. Adapts scaffolding depth to model capability and task complexity
5. Preserves space for emergent/intuitive reasoning alongside structured approaches

## Existing Systems

### Production Frameworks

**DSPy (Stanford)**
Programmatic prompt optimization that compiles high-level programs into optimized prompts. Supports ChainOfThought, ReAct, and custom modules. The GEPA optimizer (2025) adaptively evolves prompts using genetic algorithms with self-reflection. DSPy treats reasoning strategies as programmatic abstractions, not cognitive postures.
*Composition opportunity:* DSPy's optimization loop could inform how Agent OS tunes cognitive parameters over time. The "compile" concept — turning declarative intent into optimized prompts — maps to process step preparation.
*Source:* https://github.com/stanfordnlp/dspy (MIT License)

**LangGraph / LangChain**
Stateful agent framework with graph-based workflow orchestration. 24,800+ GitHub stars. Provides memory management, tool use, and multi-step reasoning. Does not model cognitive posture or metacognition — it's plumbing, not cognition.
*Composition opportunity:* Graph-based state management patterns are directly applicable to process step execution.

**CrewAI**
Role-based multi-agent orchestration. 44,300+ GitHub stars. Assigns personas and tools to agents. Uses role prompting but not cognitive strategy selection — agents get a role description, not a thinking toolkit.
*Composition opportunity:* Role decomposition patterns, but Agent OS needs to go beyond static roles to dynamic cognitive postures.

**AutoGen (Microsoft)**
Multi-agent conversation framework. 200,000+ downloads in first 5 months. Focuses on agent-to-agent dialogue patterns. No cognitive architecture — agents are defined by system prompts and tools.

### Research Implementations

**ACE Framework (David Shapiro)**
Six-layer cognitive architecture: Aspirational → Global Strategy → Agent Model → Executive Function → Cognitive Control → Task Prosecution. Top-down control with ethics/mission layer above all else. OSI-model inspired. Conceptual rather than production-ready.
*Source:* https://github.com/daveshap/ACE_Framework
*Composition opportunity:* The layered architecture concept maps well to Agent OS's own layer model. The Executive Function and Cognitive Control layers are directly relevant.

**Reflexion (Shinn et al.)**
Self-reflecting agent framework with verbal reinforcement learning. Open source implementation.
*Source:* https://github.com/noahshinn/reflexion (MIT License)
*Composition opportunity:* The verbal reflection pattern could be adapted as a harness-level capability for any process step.

**LATS (Zhou et al.)**
Language Agent Tree Search combining MCTS with LLM reasoning. Open source implementation.
*Source:* https://github.com/lapisrocks/LanguageAgentTreeSearch
*Composition opportunity:* Tree search over reasoning paths could be offered as a cognitive strategy for complex planning steps.

**ReplicantLife (Toy et al.)**
Framework for generative agents with metacognition module. Pluggable LLM architecture.
*Source:* https://replicantlife.com/research
*Composition opportunity:* The metacognition implementation pattern (periodic self-evaluation → strategy adjustment → meta-memory storage) is directly adoptable.

### AWS Prescriptive Guidance: Agentic AI Patterns
AWS published a structured guide describing LLM-augmented cognition as "an LLM wrapped in augmentations" with four building blocks: prompting, retrieval, tool use, and memory. These compose into workflows that "transform the LLM from a stateless engine into a dynamic reasoning agent." While not a framework, it provides validated industry patterns for cognitive building blocks.

## Composition Opportunities

| Capability | Build or Adopt | Source | Notes |
|-----------|---------------|--------|-------|
| Reasoning strategy selection | Build (novel) | MeMo paper pattern | No existing implementation does this at harness level |
| Working memory management | Build on existing | CoALA concepts + LangGraph patterns | Context assembly already partially built |
| Metacognitive monitoring | Adopt pattern | Toy et al. (2024) ReplicantLife | Periodic self-evaluation + meta-memory |
| Verbal self-reflection | Adopt pattern | Reflexion (MIT) | Adapt verbal reflection for process step feedback |
| Tree search reasoning | Adopt | LATS (open source) | For complex planning steps only |
| Prompt optimization | Evaluate | DSPy (MIT) | Could inform cognitive parameter tuning |
| Uncertainty calibration | Build | Steyvers & Peters (2025) research | No existing implementation for process-level calibration |
| Strategy switching / inhibitory control | Build (novel) | MAP Monitor pattern + Wray et al. gap analysis | Nobody has built this for multi-step processes |
| Model-adaptive scaffolding | Build (novel) | Prompting Inversion finding | No framework adapts structure to model capability |

## Gap Analysis

### What Has Nobody Built

1. **Process-aware cognitive architecture.** All existing systems operate at the individual prompt or agent level. Nobody manages cognitive posture across multi-step processes where each step may need different thinking approaches.

2. **Dynamic cognitive posture selection.** MeMo lets models choose mental models; MAP decomposes cognitive functions; but nobody composes {reasoning strategy + uncertainty handling + monitoring depth + communication register} as a unified posture selected per task context.

3. **Intention tracking distinct from task tracking.** Process-level monitoring of "is this approach serving the original goal?" vs "is this step complete?" does not exist in any production system.

4. **Model-capability-adaptive scaffolding.** The Prompting Inversion shows this matters enormously, but no framework adjusts its cognitive scaffolding based on which model is executing.

5. **Executive function as a harness layer.** Working memory management, inhibitory control, cognitive flexibility, and progress monitoring exist as individual research contributions but nobody has composed them into a unified executive function layer for agent harnesses.

6. **Exploration-exploitation management for agent reasoning.** No system deliberately manages the balance between structured reasoning and exploratory/creative thinking within process execution.

### Where Agent OS Would Be Genuinely Novel

The combination of (1) process-driven cognitive architecture, (2) dynamic posture selection, and (3) executive function as a harness layer has no precedent. Individual components exist in research; the composition at the harness level does not.

## Recommendations for ADR-014

### Design with Confidence (strong evidence)

1. **Modular cognitive functions, not monolithic prompts.** MAP proves that decomposing cognition into specialized modules dramatically outperforms generalist approaches. Design cognitive capabilities as composable modules within the harness.

2. **Metacognitive monitoring between process steps.** Both Toy et al. and the ICML position paper provide strong evidence that self-evaluation improves goal-directed behavior. Implement periodic "am I making progress?" checks.

3. **Provide cognitive tools, don't mandate cognitive behavior.** MeMo + Prompting Inversion converge on this. The harness should offer mental models, reflection prompts, and reasoning strategies as available tools, not mandatory steps.

4. **Context engineering matters more than prompt engineering.** Input ordering effects (2-12%), few-shot selection quality, and the lost-in-the-middle effect all show that *what context the agent sees* matters more than *how you ask it to think*. Prioritize context assembly over cognitive prescription.

5. **Verbal self-reflection for learning loops.** Reflexion provides strong evidence that storing verbal reflections and retrieving them for future attempts improves performance substantially. Build this into process-level feedback.

### Needs Experimentation (moderate evidence)

6. **Cognitive posture selection based on task type.** The concept is theoretically grounded (MeMo, MAP) but nobody has tested it in a process-driven context. Start with coarse-grained postures (analytical vs creative vs evaluative) and measure.

7. **Model-adaptive scaffolding depth.** The Prompting Inversion finding is compelling but from a single study. Test whether reducing cognitive scaffolding for more capable models improves Agent OS output quality.

8. **Strategy switching triggers.** When should an agent abandon its current approach? The Monitor pattern from MAP provides a mechanism, but the triggers (confidence thresholds? iteration counts? goal-distance estimates?) need empirical tuning.

9. **Uncertainty communication calibration.** Steyvers & Peters (2025) show this matters for human-AI collaboration, but the right calibration for Agent OS's trust system needs testing.

### Defer (insufficient evidence)

10. **Full ACT-R/Soar integration.** While LLM-ACTR shows promise, the adapter-layer approach is too model-specific for a harness that must work across providers. Monitor this space.

11. **Autonomous cognitive posture evolution.** Luketina et al. (2025) argue for intrinsic metacognitive learning, but the mechanisms are speculative. The harness should enable human-configured cognitive tools first, then explore autonomous adaptation.

12. **Serendipity engineering.** The evidence for deliberate exploration-mode in agent reasoning is theoretical. Don't over-engineer this — simply ensure the architecture doesn't prevent emergent reasoning by being too prescriptive.

### The Prescriptive-vs-Intuitive Tension: Specific Recommendation

Design the cognitive architecture as **three layers**:

1. **Cognitive Infrastructure (always active):** Context assembly, working memory management, basic metacognitive monitoring. This is structural — it runs regardless of cognitive posture.

2. **Cognitive Toolkit (available, not mandated):** Mental models, reflection prompts, reasoning strategies (CoT, tree search, multi-path), uncertainty calibration templates. Process designers choose which tools to make available per step; agents choose whether and how to use them.

3. **Cognitive Context (framing, not scripting):** Per-step framing that sets the cognitive register ("this step requires careful analytical reasoning" vs "this step benefits from creative exploration") without mandating specific reasoning mechanics. The frame primes; the agent decides.

This three-layer design satisfies both the structure-helps evidence (layers 1 and 3 provide scaffolding) and the structure-constrains evidence (layer 2 is opt-in, layer 3 frames without prescribing).

## Sources

### Peer-Reviewed / Conference Publications
- Wei, J. et al. (2022). [Chain-of-Thought Prompting Elicits Reasoning in Large Language Models](https://arxiv.org/abs/2201.11903). NeurIPS 2022.
- Wang, X. et al. (2022). [Self-Consistency Improves Chain of Thought Reasoning in Language Models](https://arxiv.org/abs/2203.11171). ICLR 2023.
- Shinn, N. et al. (2023). [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366). NeurIPS 2023.
- Yao, S. et al. (2023). [Tree of Thoughts: Deliberate Problem Solving with Large Language Models](https://arxiv.org/abs/2305.10601). NeurIPS 2023.
- Zhou, A. et al. (2024). [Language Agent Tree Search Unifies Reasoning, Acting, and Planning in Language Models](https://arxiv.org/abs/2310.04406). ICML 2024.
- Sumers, T., Yao, S. et al. (2024). [Cognitive Architectures for Language Agents (CoALA)](https://arxiv.org/abs/2309.02427). TMLR 2024.
- Webb, T. et al. (2025). [A brain-inspired agentic architecture to improve planning with LLMs](https://www.nature.com/articles/s41467-025-63804-5). Nature Communications.
- Wray, R.E., Kirk, J.R. & Laird, J.E. (2025). [Applying Cognitive Design Patterns to General LLM Agents](https://arxiv.org/abs/2505.07087). AGI 2025.
- Wu, S. et al. (2025). [Cognitive LLMs: Toward Human-Like Artificial Intelligence by Integrating Cognitive Architectures and Large Language Models](https://arxiv.org/abs/2408.09176). SAGE 2025.
- Li, J. et al. (2025). [Language Models Are Capable of Metacognitive Monitoring and Control of Their Internal Activations](https://arxiv.org/abs/2505.13763). NeurIPS 2025.
- Luketina, J. et al. (2025). [Position: Truly Self-Improving Agents Require Intrinsic Metacognitive Learning](https://arxiv.org/abs/2506.05109). ICML 2025.
- Steyvers, M. & Peters, M.A.K. (2025). [Metacognition and Uncertainty Communication in Humans and Large Language Models](https://arxiv.org/abs/2504.14045). Current Directions in Psychological Science.

### Technical Reports / Preprints
- Guan, H. et al. (2024). [Towards Generalist Prompting for Large Language Models by Mental Models (MeMo)](https://arxiv.org/abs/2402.18252). arXiv.
- Toy, J., MacAdam, J. & Tabor, P. (2024). [Metacognition is all you need? Using Introspection in Generative Agents to Improve Goal-directed Behavior](https://arxiv.org/abs/2401.10910). arXiv.
- Meincke, L., Mollick, E., Mollick, L. & Shapiro, D. (2025). [The Decreasing Value of Chain of Thought in Prompting](https://arxiv.org/abs/2506.07142). Wharton Generative AI Labs.
- Bernstein, Z. et al. (2025). [You Don't Need Prompt Engineering Anymore: The Prompting Inversion](https://arxiv.org/abs/2510.22251). arXiv.
- Schulhoff, S. et al. (2024). [The Prompt Report: A Systematic Survey of Prompting Techniques](https://arxiv.org/abs/2406.06608). arXiv.
- Kim, H. et al. (2025). [The Order Effect: Investigating Prompt Sensitivity to Input Order in LLMs](https://arxiv.org/abs/2502.04134). arXiv.
- ExpLang (2026). [Improved Exploration and Exploitation in LLM Reasoning](https://arxiv.org/abs/2602.21887). arXiv.

### Frameworks and Systems
- [DSPy](https://github.com/stanfordnlp/dspy) — Stanford. Programmatic prompt optimization. MIT License.
- [Reflexion](https://github.com/noahshinn/reflexion) — Shinn et al. Self-reflecting agents. MIT License.
- [LATS](https://github.com/lapisrocks/LanguageAgentTreeSearch) — Zhou et al. Language Agent Tree Search.
- [ACE Framework](https://github.com/daveshap/ACE_Framework) — Shapiro. Autonomous Cognitive Entities.
- [ReplicantLife](https://replicantlife.com/research) — Toy et al. Generative agents with metacognition.
- [Awesome Language Agents](https://github.com/ysymyth/awesome-language-agents) — CoALA companion list.
- [System 2 Research](https://github.com/open-thought/system-2-research) — Curated link collection.
- [AWS Prescriptive Guidance: Agentic AI Patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/overview-of-llm-augmented-cognition.html)

### Industry / Practitioner Sources
- [Confronting verbalized uncertainty in AI-assisted decision-making](https://www.sciencedirect.com/science/article/pii/S1071581925000126). International Journal of Human-Computer Studies, 2025.
- [Structured human-LLM interaction design reveals exploration and exploitation dynamics](https://www.nature.com/articles/s41539-025-00332-3). npj Science of Learning, 2025.
