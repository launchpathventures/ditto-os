# Research: Human Cognition Models for Agent OS

**Date:** 2026-03-20
**Researcher:** Dev Researcher
**Status:** Complete — reviewed (PASS WITH FLAGS, findings addressed)
**Scope:** Cognitive science frameworks and applied AI/HCI implementations relevant to modeling how humans think through work
**Trigger:** Strategic question — does the Agent OS architecture adequately model human cognition, not just work flow?

---

## Research Question

Agent OS currently models **what humans do with work** (six jobs, trust, feedback, attention) and **how work flows** (processes, harness, meta-processes). But it doesn't explicitly model **how humans think** — the cognitive dimensions that shape how judgment, expertise, creativity, and challenge manifest during work. What cognitive science frameworks exist, and has any AI/agent platform attempted to model these dimensions?

---

## 1. Cognitive Mode Switching

### The Science

Three major frameworks describe how humans shift between thinking modes during work:

**Kahneman's Dual Process Theory (System 1 / System 2):**
- System 1: fast, intuitive, automatic — pattern matching, emotional response, associative memory. Handles ~95% of daily decisions.
- System 2: slow, deliberate, effortful — logical reasoning, rule-following, novel problem solving. Monitors System 1 and intervenes when needed.
- Key insight for Agent OS: System 2 observes System 1's output and only intervenes when the output is considered to infringe on rational decision-making rules. This is structurally analogous to the harness monitoring agent output — the harness IS System 2 for the agent's System 1.

**Dreyfus Skill Acquisition Model (5 stages):**
- Novice: rigid rule-following, no discretionary judgment
- Advanced Beginner: recognizes aspects (situational elements), starts applying context
- Competent: conscious planning, deliberate prioritisation, feels responsibility
- Proficient: sees situations holistically, knows what's important, deliberation narrows
- Expert: intuitive grasp of situations, sees what to do without deliberation, acts from absorbed experience

Key insight: Skill acquisition is not linear accumulation of knowledge — it is a **qualitative transformation in cognition**. At novice/competent stages, thinking is rule-based and decomposable. At expert stage, thinking is holistic and intuitive. The shift from rule-following to intuition is the core transition. The Dreyfus model was explicitly motivated by **critiques of AI systems that relied on rule-based programming**, arguing for the primacy of situated, intuitive human judgment.

**Klein's Recognition-Primed Decision (RPD) Model:**
- Experts don't compare options — they recognise the situation as a familiar one and immediately engage appropriate responses.
- RPD has three levels: simple match (recognise + act), developing the story (recognise + evaluate via mental simulation), evaluate the course of action (recognise + mentally test the response).
- The Collaborative RPD model (C²RPD) extends this to human-AI teams: proactive information seeking, linking, and sharing. Establishes a basis for designing agent architectures that support both agent-agent and agent-human collaboration.

### Existing Implementations

- **Springer (2019):** Methodology to program AI agents based on RPDM using Belief-Desire-Intention logic — the main constructs of RPDM translated into BDI agent architecture.
- **No surveyed agent platform** differentiates cognitive modes for review or interaction. All treat outputs uniformly regardless of whether the task requires analytical, creative, or intuitive judgment.

### Agent OS Relevance

Agent OS's trust tiers map loosely to Dreyfus: supervised = novice (rule-following), spot-checked = competent (human spot-checks), autonomous = proficient (exception-only). But the model applies to the **process-agent relationship**, not to the **human's cognitive experience** of reviewing outputs. The harness doesn't signal what kind of thinking the human needs to bring.

---

## 2. Tacit Knowledge and Expertise

### The Science

**Polanyi's Tacit Knowledge ("we can know more than we can tell"):**
- Tacit knowledge is knowledge learned from experience and internalized unconsciously, which is therefore difficult to articulate and codify in a tangible form.
- Polanyi's Paradox: machines cannot provide successful outcomes in many cases because they have explicit knowledge (raw data) but do not know how to use such knowledge to understand the task as a whole.
- Contemporary AI seeks to overcome Polanyi's paradox by learning from human examples — inferring rules that humans tacitly apply but cannot explicitly state.

**Knowledge Elicitation Techniques (from literature):**
1. **Directed interviews** — eliciting tacit knowledge from spoken discourse of organisational participants
2. **Cooperative games** — domain ontologies used to discover and integrate new facts from textual sources into an Operational Knowledge Graph
3. **Think-aloud protocols** — experts narrate their decision process in real time
4. **Critical incident technique** — experts describe specific past situations and their responses
5. **Repertory grid technique** — structured comparison of cases to surface implicit distinctions
6. **Apprenticeship observation** — watching experts work and noting what they don't say

**The LLM Limitation:** LLMs can only learn from externalised, sequential representations of human reasoning. The training paradigm fundamentally relies on next-token prediction over textual sequences. Tacit knowledge that never gets expressed in text is invisible to these systems.

### Existing Implementations

- **Industry 4.0 research (Springer, 2022):** Tacit knowledge elicitation process for capturing operational best practices of experienced workers using algorithmic techniques + cooperative game + domain ontologies → Operational Knowledge Graph.
- **No surveyed agent platform** has a mechanism for capturing pre-articulate knowledge. All feedback is explicit (approve/edit/reject).

### Agent OS Relevance

Agent OS's implicit feedback (edits-as-diffs) captures **articulated** corrections — the human already identified the problem. But Rob's "that doesn't look right" and Lisa's "that's not us" are pre-articulate. The system needs a vocabulary for vague signals. Potential approaches:
- Structured rejection with lightweight tags ("feels wrong: tone", "feels wrong: not sure why")
- Frequency-based pattern detection from vague rejections (cluster by output characteristics)
- Elicitation prompts when confidence is low ("What specifically feels off? Or is it a gut feeling?")

---

## 3. Abstraction and Insight Escalation

### The Science

**Weick's Sensemaking:**
- Sensemaking is fundamentally about how we recognise, act upon, create, recall, and apply patterns from lived experience to impose order on that experience.
- Sensemaking is **retrospective** — we notice patterns after the fact, not in real time. This is critical: corrections accumulate THEN the pattern becomes visible.
- Sensemaking is not about truth — it is about "continued redrafting of an emerging story so that it becomes more comprehensive, incorporates more of the observed data, and is more resilient."
- Sensemaking operates across multiple interacting levels — individual, team, organisation — and the dynamic relationship between noticing cues, creating plausible explanations, and taking action to test those explanations is co-evolutionary.

**Bloom's Taxonomy (Revised, 2001) — Cognitive Levels:**

| Level | Verb | What it means | Agent OS analogy |
|-------|------|---------------|------------------|
| Remember | Recall | Retrieve facts | Agent recalls process definition, memory |
| Understand | Explain | Grasp meaning | Agent interprets input in context |
| Apply | Execute | Use knowledge in new situations | Agent applies learned patterns |
| Analyze | Differentiate | Break into parts, find relationships | Detect correction patterns, compare outputs |
| Evaluate | Judge | Make judgments based on criteria | Quality assessment, confidence scoring |
| Create | Synthesize | Combine elements into new wholes | Propose process improvements, suggest new processes |

Key insight: Agent OS's learning layer (L5) currently operates at the **Analyze** level — it detects patterns in corrections. But the highest-value human thinking is at **Evaluate** (judging whether a structural change is warranted) and **Create** (proposing fundamentally new approaches). The abstraction ladder from concrete corrections to structural insights maps directly onto Bloom's progression from Analyze → Evaluate → Create.

**The Abstraction Ladder (synthesised from sensemaking + Bloom):**

| Level | Example (Rob's quoting) | Agent OS mechanism today | Gap |
|-------|------------------------|--------------------------|-----|
| **Concrete correction** | "This quote has wrong labour hours" | Edit captured as diff | Covered |
| **Pattern recognition** | "Bathroom jobs are always underquoted" | "Teach this" bridges to rule | Covered (Phase 3) |
| **Structural insight** | "Our labour model doesn't account for access difficulty" | — | **Not modeled** |
| **Strategic change** | "We need job-category-specific multipliers" | — | **Not modeled** |

### Existing Implementations

- **No surveyed platform** models abstraction levels in learning. All capture corrections at the concrete level.
- **Weick's co-evolutionary model** suggests the system should actively probe: when corrections cluster, ask "is this a pattern or a one-off?" When patterns cluster, ask "is the underlying model wrong?"

### Agent OS Relevance

The learning layer needs an **insight escalation mechanism**: corrections → patterns → structural proposals → strategic suggestions. Each level requires different human cognitive engagement: corrections need System 1 (quick fix), patterns need System 2 (deliberate teaching), structural insights need creative synthesis, strategic changes need evaluation against business goals.

---

## 4. The Challenge Function

### The Science

**Edmondson's Psychological Safety:**
- Psychological safety creates "permission for disagreement, not protection from it."
- Leaders demonstrating disagreement actually demonstrate that psychological safety exists — because disagreeing is not easy.
- The team collectively builds the environment through how members treat each other, respond to ideas, and handle disagreements and errors.
- When psychological safety exists, people report errors, ask for help, and challenge the status quo — all essential learning behaviours.

**Applied to AI Systems:**
- AI is creating "far greater uncertainty" than before, causing a spike in challenges and anxiety.
- Leaders need to "open up the challenge and make it a team sport" — apply this to agent teams.
- No surveyed agent platform models constructive pushback. Agents execute and get reviewed. They don't say "I think this is the wrong approach."

**Principal-Agent Framework (California Management Review, 2025):**
- Rethinking AI agents through a principal-agent lens: the agent has information the principal doesn't, creating information asymmetry.
- The challenge function is about reducing this asymmetry — the agent proactively shares concerns, not just executing orders.

### Existing Implementations

- **Content moderation systems:** Some have "borderline" flagging — content that could go either way gets surfaced with reasoning. This is structural pushback without the social dynamics.
- **SAE Level 3 autonomous vehicles:** The system knows when it's out of its depth and requests human takeover. Agent OS's confidence metadata (ADR-011) is this pattern.
- **Claude's system prompt:** Claude is designed to push back on harmful requests. This is the closest example of an AI challenge function, but it's safety-oriented, not work-quality-oriented.
- **No surveyed agent platform** implements constructive work-quality pushback ("I can do this, but I think the approach is wrong because...").

### Agent OS Relevance

ADR-011's confidence scoring is the embryo. But confidence says "I'm unsure about my output." Challenge says "I'm unsure about the task itself." These are different cognitive functions:

| Function | What it signals | ADR-011 coverage |
|----------|----------------|------------------|
| Low confidence | "My output may be wrong" | Covered (per-output confidence) |
| Concern | "The inputs seem unusual" | Partially (could extend confidence to input assessment) |
| Challenge | "I think the approach is wrong" | **Not modeled** |
| Alternative | "Here's a better way to do this" | **Not modeled** |

---

## 5. Satisficing and Stakes-Calibrated Effort

### The Science

**Simon's Bounded Rationality:**
- Individuals satisfice rather than maximise because they cannot evaluate all potential alternatives due to limited cognitive and information-processing abilities, time constraints, and incomplete knowledge.
- Satisficing: consider options until one meets or exceeds a predefined threshold (aspiration level). The cost of searching for the perfect solution often outweighs the benefits of finding a merely good solution quickly.
- Value dimensions of bounded rationality decisions should be made transparent rather than hidden behind purely technical analysis. Aspiration levels embed value judgments that may remain implicit and unexamined.

**Stakes-Calibrated Effort (synthesised from Simon + Cognitive Load Theory):**
- Human working memory holds only 3-5 new information units at once (Cognitive Load Theory).
- Cognitive load decreases when interfaces minimise extraneous processing through concise, well-sequenced presentation.
- Humans naturally calibrate effort to stakes: a $500 invoice gets a glance, a $50,000 contract gets deep review. This is not laziness — it is rational satisficing.
- Task switching imposes a cognitive penalty. Modular architectures that isolate tasks reduce this burden.

### Existing Implementations

- **PullFlow:** Brings code review into the IDE to eliminate context switching between platforms. Preserves "flow state."
- **Cognitive load framework for human-AI symbiosis (Springer, 2026):** Dominant design imperative is to reduce extraneous load so limited working memory resources can be devoted to intrinsic task demands.
- **No surveyed agent platform** adapts review depth based on stakes. All treat every output with equal interface weight.

### Agent OS Relevance

Agent OS has trust tiers (frequency of review) and attention modes (form of review). Missing: **stakes awareness** — how much cognitive effort is this output worth? A process could declare a stakes profile:

| Stakes dimension | Low stakes | High stakes |
|-----------------|------------|-------------|
| Financial impact | <$100 | >$10,000 |
| Reputational risk | Internal only | Customer-facing |
| Reversibility | Easily undone | Hard to reverse |
| Time pressure | Low urgency | Deadline-driven |

This maps to review UX: low-stakes items get a one-tap approve interface, high-stakes items get full context with evidence trail. The human's cognitive load is calibrated to the stakes, not uniform.

---

## 6. Relational and Temporal Intelligence

### The Science

Human decisions are always embedded in relational context — who's involved, what happened before, what's at stake relationally. This is not just "memory" — it's a specific kind of intelligence that shapes every interaction.

**Entity Memory in AI Systems:**
Recent research (2025-2026) shows a strong move toward structured entity-relationship memory for AI agents:

**Zep / Graphiti (2025-2026):**
- Temporal knowledge graph architecture for agent memory. Outperforms MemGPT on Deep Memory Retrieval benchmark (94.8% vs 93.4%).
- **Context graph:** entities, relationships, and facts with explicit validity windows — when facts became true and when they were superseded.
- Three memory types working together: short-term (conversation), long-term (entities + relationships + preferences), reasoning (decision traces + provenance).
- Ingests from chat history, CRM, app events, and documents into a unified context graph that stays current as data changes.
- P95 retrieval latency: 300ms via hybrid search (semantic + keyword + graph traversal). (Note: performance claims are from Zep's own whitepaper — arxiv.org/abs/2501.13956 — and should be independently validated before committing to a build-from decision.)

**Neo4j Labs (2025):**
- Effective context graphs require three memory types: short-term (session), long-term (entities/relationships/preferences), reasoning (decision traces/tool usage/provenance).
- The difference between vector retrieval and graph memory comes down to relationships. Vectors find similar text; graphs preserve how facts connect across sessions.

**Mem0 (2026):**
- Graph memory solutions for AI agents with entity extraction, relationship tracking, and temporal validity.

### Existing Implementations

| System | Entity memory | Temporal awareness | Relationship tracking |
|--------|--------------|-------------------|----------------------|
| Zep/Graphiti | Yes — temporal knowledge graph | Yes — validity windows per fact | Yes — explicit edge types |
| Mem0 | Yes — graph-based | Partial | Yes |
| Agent OS (current) | No — process-scoped + agent-scoped flat memory | No | No |

### Agent OS Relevance

Agent OS's memory architecture (ADR-003) has two scopes: agent-scoped and process-scoped. Neither models entities, relationships, or temporal validity. When Rob reviews a quote for Henderson, the system doesn't know:
- Henderson is a repeat customer (relational)
- Henderson was kept waiting last time (temporal)
- Henderson referred two other customers (relational value)
- The Henderson account is worth $40K/year (stakes)

This information shapes how Rob reviews the quote — and the system should learn from that shaping. The gap is not just missing data — it's a missing **cognitive dimension** in how context is assembled for review.

Zep/Graphiti's architecture is directly relevant: temporal knowledge graph with entity nodes, relationship edges, and validity windows. This could complement (not replace) the existing two-scope memory model as a third scope: **entity memory**.

---

## 7. Creative Synthesis vs. Analytical Processing

### The Science

**Dual Quality Models:**
Humans apply fundamentally different quality criteria to creative vs. analytical work:

| Dimension | Analytical quality | Creative quality |
|-----------|-------------------|-----------------|
| Core question | "Is it correct?" | "Is it good?" |
| Evaluation mode | System 2 — deliberate checking | System 1 — intuitive judgment ("taste") |
| Criteria | Accuracy, completeness, compliance, logical consistency | Originality, resonance, brand fit, surprise, aesthetic quality |
| Feedback signal | Binary (right/wrong) or graduated (how wrong) | Multidimensional (tone, voice, impact, surprise) |
| Review cognitive load | Moderate — checking against known rules | High — requires holding aesthetic standards, brand sense, audience empathy |

**Research findings on AI-generated creative content:**
- AI demonstrates higher flexibility in generating creative interpretations, but humans excel in subjectively perceived creativity.
- Automated metrics fail to account for deeper qualities such as ethical alignment, bias, and creativity.
- Human judgment remains the gold standard for nuanced qualities: tone, creativity, ethical considerations.
- AI can assess creativity more holistically by shifting from reductionist models to systems-based approaches.

**Bloom's Taxonomy connection:** Analytical review operates at the **Evaluate** level (judging against criteria). Creative review requires **Create** level thinking — the reviewer must imagine what "better" looks like, not just identify what's wrong.

### Existing Implementations

- **No surveyed agent platform** differentiates quality assessment by output type. All use the same approve/edit/reject flow regardless of whether the output is a financial reconciliation or a brand-voice product description.
- **Content creation platforms** (Jasper, Copy.ai) use brand voice scoring — but this is a narrow application, not a general cognitive model.

### Agent OS Relevance

The harness quality layer (L3) has three review patterns: maker-checker, adversarial, spec-testing. All three are analytically oriented — they check against specifications. Missing: a **creative review pattern** that adapts to aesthetic/taste-based quality:

| Review pattern | Cognitive mode | Best for |
|---------------|---------------|----------|
| Maker-checker | Analytical | Standard processes — is it correct? |
| Adversarial | Critical | Important outputs — find the flaws |
| Spec-testing | Analytical | Established processes — does it meet criteria? |
| **Taste review** (gap) | Creative/intuitive | Brand, tone, aesthetic — does it feel right? |

A taste review pattern would:
- Frame the review differently ("Does this match the brand voice?" not "Does this meet the spec?")
- Capture different feedback signals (tone/voice/impact tags, not just diffs)
- Feed the learning layer differently (aesthetic preference patterns, not correction rules)
- Use different prompts for the reviewing agent (empathetic/aesthetic framing, not analytical)

---

## 8. Applied Cognitive Architectures

### Formal Cognitive Architectures

Three major cognitive architectures offer models of how cognition works computationally:

**ACT-R (Adaptive Control of Thought—Rational):**
- Primary goal: cognitive modeling of human behavior. Offers an integrated theory of the mind encompassing perception, memory, goal-setting, and action.
- Key mechanism: production rules fire based on pattern matching against declarative knowledge (facts) and procedural knowledge (skills). Activation-based memory retrieval — frequently and recently used knowledge is more accessible.
- Recent development (2024-2025): Cognitive trace embeddings from ACT-R integrated with LLMs improve grounded, explainable decision making, mitigating hallucination.
- **Agent OS relevance:** ACT-R's activation-based memory retrieval validates Agent OS's existing memory salience scoring (`confidence × log(reinforcement+1) × recency_decay` from context-and-token-efficiency research). The production rule system maps to process step execution — but ACT-R models the cognitive WHY behind rule selection, not just the execution.

**Soar (State, Operator, And Result):**
- Primary goal: development of general AI agents with complex cognitive capabilities.
- Core theory: Problem Space Hypothesis — all goal-oriented behaviour is search through possible states while attempting to achieve a goal.
- Key mechanism: impasse-driven learning — when the agent can't proceed, it creates a subgoal to resolve the impasse, learns from the resolution, and stores the result as a "chunk" (compiled knowledge). This is automatic learning from problem-solving experience.
- **Agent OS relevance:** Soar's impasse-driven learning is structurally analogous to Agent OS's correction-to-improvement pipeline. When the agent "gets stuck" (output rejected), it creates a subgoal (understand the correction), resolves it (apply the fix), and stores the result (process memory). But Soar does this automatically within the cognitive cycle, while Agent OS requires human intervention. The gap is the same: how to move from concrete correction to compiled knowledge.

**LIDA (Learning Intelligent Distribution Agent):**
- Based on Global Workspace Theory (GWT) — the most widely accepted theory of the role of consciousness in cognition.
- Key mechanism: cognitive cycles (~10 Hz). Attention codelets form coalitions by selecting portions of the situational model, coalitions compete for attention, the winning coalition becomes the content of consciousness and is broadcast globally.
- Three cognitive processes: perception → attention → action selection, iterated constantly.
- **Agent OS relevance:** LIDA's attention mechanism is the most directly relevant to Agent OS's attention model (ADR-011). LIDA models what "deserves attention" computationally — attention codelets compete, the most salient wins. Agent OS's confidence-based routing is a simplified version: low confidence = demands attention. But LIDA's model is richer — salience depends on novelty, urgency, personal relevance, and emotional valence, not just confidence.

### Human-AI Teaming Research (2024-2025)

**Key frameworks:**

1. **Cognitive Work Analysis (CWA)** — proposed as a design framework for human-AI systems. Integrates distributed cognition, joint cognitive systems, and self-organisation perspectives. Focuses on the **work domain** (what constraints exist) rather than task decomposition (what steps to follow).

2. **CREW Platform (2025)** — facilitates human-AI teaming research with pre-built tasks for cognitive studies. Addresses the need to jointly study humans and AI agents across disciplines.

3. **Human-AI Teaming Requirements (Frontiers, 2023):** Successful human-AI teaming requires responsiveness, situation awareness, and flexible decision-making. AI's computational capabilities must complement human intuition and contextual understanding. Role specification ensures both human and AI leverage their strengths.

4. **Cognitive Load Framework for Human-AI Symbiosis (Springer, 2026):** Dominant design imperative — reduce extraneous cognitive load so limited working memory resources can be devoted to intrinsic task demands. Human working memory holds 3-5 items. Every unnecessary element in the review interface steals capacity from the actual judgment.

### What No System Does

After surveying cognitive architectures, agent platforms, and human-AI teaming research, the following capabilities have no existing implementation:

| Capability | Status |
|-----------|--------|
| Adapting review UX based on cognitive mode required | **No implementation found** |
| Capturing tacit/pre-articulate knowledge from users | **No implementation found** |
| Escalating concrete corrections to structural insights | **No implementation found** |
| Agent proactive challenge/pushback on task approach | **No implementation found** (safety refusal exists, work-quality challenge doesn't) |
| Stakes-calibrated review depth | **No implementation found** |
| Creative review patterns distinct from analytical patterns | **No implementation found** |
| Cognitive mode signaling in agent-human handoff | **No implementation found** |
| Entity memory with temporal validity integrated into process review | **Zep/Graphiti has the memory model** but not integrated with review/oversight |

---

## Synthesis: Seven Cognitive Dimensions

Across all research areas, seven distinct cognitive dimensions emerge that are relevant to how humans think through work. Each dimension is currently absent or undermodeled in Agent OS:

### Dimension 1: Cognitive Mode
**What it is:** The type of thinking a task demands — analytical, creative, critical, strategic, empathetic.
**Why it matters:** Review of a financial reconciliation demands different human cognition than review of brand copy. The interface should signal and support the mode transition.
**Theoretical basis:** Kahneman (System 1/2), Dreyfus (rule-based → intuitive), Bloom (cognitive levels).
**Where it would live in architecture:** L1 (process/step declarations), L3 (review pattern selection), L6 (review UX adaptation).

### Dimension 2: Expertise Level
**What it is:** Where the human sits on the Dreyfus scale for this specific task/domain.
**Why it matters:** A novice process owner needs rule-based guidance. An expert needs exception-only attention. The same person may be expert in one process and novice in another.
**Theoretical basis:** Dreyfus (5 stages), Klein (RPD — experts recognise, novices compare).
**Where it would live in architecture:** L5 (learning tracks human expertise over time), L6 (adapts UX density to expertise).

### Dimension 3: Tacit Knowledge
**What it is:** The pre-articulate expertise that experts can't express but apply constantly.
**Why it matters:** Most of the value in human review comes from tacit judgment. If the system can only learn from explicit corrections, it misses the majority of expertise.
**Theoretical basis:** Polanyi (tacit knowledge), knowledge elicitation literature.
**Where it would live in architecture:** L5 (richer feedback capture), L6 (elicitation prompts), L3 (structured rejection vocabulary).

### Dimension 4: Abstraction Level
**What it is:** The ladder from concrete corrections to structural insights to strategic changes.
**Why it matters:** Corrections accumulate but insights emerge. The system needs to actively escalate from "fix this" to "rethink the model."
**Theoretical basis:** Weick (sensemaking), Bloom (Analyze → Evaluate → Create).
**Where it would live in architecture:** L5 (insight escalation engine), L6 (presenting escalated insights for human evaluation).

### Dimension 5: Challenge Orientation
**What it is:** The agent's capacity to constructively push back on tasks, not just execute them.
**Why it matters:** The most valuable colleagues don't just execute — they challenge. "Are you sure? Have you considered...?" This reduces information asymmetry.
**Theoretical basis:** Edmondson (psychological safety), principal-agent theory.
**Where it would live in architecture:** L2 (agent capability), L3 (challenge as harness function), L6 (presenting challenges alongside outputs).

### Dimension 6: Stakes Awareness
**What it is:** Calibrating cognitive effort and review depth to the stakes of the specific output.
**Why it matters:** Humans naturally satisfice — they invest effort proportional to impact. The system should support this, not fight it with uniform interfaces.
**Theoretical basis:** Simon (bounded rationality, satisficing), cognitive load theory.
**Where it would live in architecture:** L1 (stakes profile per process/step), L3 (review depth modulation), L6 (interface density).

### Dimension 7: Relational Context
**What it is:** Entity-relationship knowledge that shapes every decision — who's involved, their history, their value, their trajectory.
**Why it matters:** Rob quotes differently for repeat customers. Lisa writes differently for different market segments. Nadia reviews differently based on each analyst's trajectory. Without relational context, the system treats every instance identically.
**Theoretical basis:** Entity memory research (Zep/Graphiti), CRM intelligence, temporal knowledge graphs.
**Where it would live in architecture:** L4 (entity memory as third scope alongside agent + process), L2 (entity context in agent harness assembly), L6 (surfacing relational context in review).

---

## Gap Analysis: Agent OS Architecture

| Cognitive Dimension | Current Architecture Coverage | Gap |
|--------------------|------------------------------|-----|
| 1. Cognitive Mode | Not modeled. Review patterns are analytically uniform. | Process/step-level mode declaration. Review UX adaptation. |
| 2. Expertise Level | Trust tiers implicitly track expertise trajectory (consistent approvals = expert-level judgment), but at the process level, not per human per domain. | Explicit human expertise tracking per domain. UX adaptation based on human's Dreyfus level for this task. |
| 3. Tacit Knowledge | Explicit corrections captured. Pre-articulate signals not captured. | Richer rejection vocabulary. Elicitation prompts. Pattern detection from vague signals. |
| 4. Abstraction Level | Pattern detection and improvement proposals planned (L5). L5 already describes "propose specific improvement with evidence." Gap is the systematic escalation ladder (correction → pattern → structural → strategic), not absence of any abstraction. | Insight escalation engine that actively climbs the abstraction ladder. Abstraction-level-aware improvement proposals. |
| 5. Challenge Orientation | Confidence scoring (ADR-011). No task-level challenge. | Agent challenge capability. Challenge routing in harness. |
| 6. Stakes Awareness | Trust tiers (frequency). Attention model (form). ADR-011 defers "process importance classification (reversibility, blast radius, novelty, cost of delay)" with re-entry at Phase 10+. Cognitive science validates and enriches this deferred concept. | Stakes profile per process/step (enriching ADR-011's deferred importance concept with Simon's satisficing framework). Review depth modulation. |
| 7. Relational Context | Two-scope memory (agent + process). No entity memory. | Temporal entity graph (Zep/Graphiti pattern). Entity context in harness assembly. |

---

## Composition Assessment

| Dimension | Build from | What exists | What's original |
|-----------|-----------|-------------|-----------------|
| Cognitive Mode | No direct source. Bloom's Taxonomy provides the level classification. | Bloom's cognitive levels are well-established in education. No AI platform applies them to review UX. | Cognitive mode as a process/step declaration that adapts review experience — Original to Agent OS. |
| Expertise Level | Dreyfus model provides the framework. | ACT-R's activation-based memory partially models expertise. No agent platform tracks human expertise. | Per-process human expertise tracking integrated with trust — Original to Agent OS. |
| Tacit Knowledge | Knowledge elicitation literature (Springer 2022). | Industry 4.0 tacit knowledge elicitation via cooperative games + ontologies. No agent platform attempts this. | Structured rejection vocabulary + elicitation prompts in review flow — Original to Agent OS. |
| Abstraction Level | Weick's sensemaking. Soar's impasse-driven learning. | Soar automatically compiles from problem-solving experience. No agent platform escalates corrections to insights. | Insight escalation engine (correction → pattern → structural → strategic) — Original to Agent OS. |
| Challenge Orientation | Edmondson's psychological safety framework. SAE Level 3 self-assessment. | ADR-011 confidence scoring is the embryo. Claude's safety refusal is the closest AI example. | Agent challenge function for work-quality pushback — Original to Agent OS. |
| Stakes Awareness | Simon's satisficing. Cognitive Load Theory (Springer 2026). | Content moderation uses three-band confidence. No agent platform uses stakes profiles. | Stakes-aware review depth with adaptive interface density — Original to Agent OS. |
| Relational Context | Zep/Graphiti temporal knowledge graph (open source, 2025). | Temporal entity graphs with validity windows. Hybrid search. 300ms P95 retrieval. | Entity memory as third scope integrated with process harness and review context — build FROM Zep/Graphiti, integration is Original. |

---

## Landscape Flags

The following entries should be added or updated in `docs/landscape.md` (Documenter responsibility):

1. **Zep / Graphiti** — should be added as Tier 2 (right concept, different ecosystem — Python). Temporal knowledge graph for AI agent memory. Entity nodes, relationship edges, validity windows. Open source. Directly relevant to entity memory gap.
2. **Mem0** — already flagged in context-and-token-efficiency research. Confirm added.
3. **LIDA cognitive architecture** — add as reference (not adoptable — Java). Global Workspace Theory attention model is conceptually aligned with ADR-011.
4. **Cognitive Load Framework (Springer 2026)** — reference for review UX design principles.

---

## Research Limitations

1. **No applied examples exist.** No surveyed AI platform, agent framework, or product implements cognitive modeling for work review/oversight. This research draws entirely from cognitive science theory and translates it to Agent OS's architecture. There is no "build FROM" for the core concept — this is genuinely original territory.

2. **The cognitive science literature is mature but not directly applicable.** Dreyfus, Klein, Kahneman, Polanyi, Simon, Weick, Edmondson — all are well-established frameworks. But they were developed for understanding human cognition, not for designing AI-human collaboration systems. The translation from theory to architecture requires judgment calls that this research surfaces but does not resolve (that's the Architect's job).

3. **The seven dimensions interact.** Cognitive mode affects how expertise manifests. Stakes awareness modulates how much tacit knowledge matters. Relational context shapes challenge orientation. These are not seven independent features — they're a single cognitive model with seven facets. Implementation must respect these interactions.

4. **Metacognition is not covered as a distinct area.** Flavell's metacognitive monitoring framework (thinking about thinking) is relevant to how humans assess their own confidence when reviewing agent output — the human equivalent of per-output confidence scoring (ADR-011). This is a minor omission that could be explored in follow-up research if the Architect deems it architecturally significant.
