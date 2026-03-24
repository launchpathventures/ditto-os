# Quality Standards for Agent Execution

How multi-agent systems and AI evaluation frameworks define "what good looks like."

**Date:** 2026-03-24
**Status:** Active
**Consumers:** Dev Architect (quality standard encoding), Dev Designer (quality visibility UX), Process primitive design

---

## 1. Agent Evaluation Frameworks & Benchmarks

### AgentBench (Tsinghua/CMU, 2023)

**How quality is defined:** Task success across 8 interactive environments (OS, DB, knowledge graph, card game, lateral thinking, web shopping, web browsing, house-holding). Measures reasoning, decision-making, instruction-following.

**Metrics:** Binary task success rate per environment. Aggregate scores across environments. No rubric-based scoring — purely outcome-based.

**Key finding:** "Training on high quality multi-round alignment data could improve agent performance." Quality of training data directly maps to agent quality.

**Architecture:** Environment-as-test-harness. Each environment defines its own success criteria. Quality = task completion in context.

*Source: [arxiv.org/abs/2308.03688](https://arxiv.org/abs/2308.03688)*

### AgentBoard (2024)

**How quality is defined:** Introduces **fine-grained progress rate** — measures incremental advancement, not just final success. This is the key innovation: quality is a gradient, not binary.

**Metrics:** Progress rate captures partial completion. Multi-faceted analysis toolkit. Evaluates both "what was achieved" and "how the agent got there."

**Architecture:** Process transparency — reveals insights during execution, not just at endpoints. Quality encoding is about making the journey observable, not just the destination.

*Source: [arxiv.org/abs/2401.13178](https://arxiv.org/abs/2401.13178)*

### Anthropic's Evaluation Approach

**How quality is defined:** Multi-layered evaluation combining:
- **Multiple-choice benchmarks** (MMLU — 57 tasks, BBQ — bias scoring -1 to 1)
- **Community benchmarks** (BIG-bench — 204 evaluations, bottom-up)
- **Standardized frameworks** (HELM — accuracy, calibration, robustness, fairness)
- **Human A/B testing** for helpfulness and harmlessness
- **Expert red teaming** (100+ hours per domain expert)
- **Model-generated evaluations** (AI evaluating AI — minutes vs months)

**Key insight on quality evolution:** "Simple formatting changes can lead to a ~5% change in accuracy." Quality measurement itself is fragile. Different labs apply the same benchmarks differently.

**Architecture pattern:** Layered evaluation — cheap automated checks first, expensive human evaluation last. Quality standards at each layer serve different purposes.

*Source: [anthropic.com/research/evaluating-ai-systems](https://www.anthropic.com/research/evaluating-ai-systems)*

### Anthropic's Agent Design Guidance

**How quality is defined for agent systems:**
- **Simplicity** — "Start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short"
- **Transparency** — "Explicitly showing the agent's planning steps"
- **ACI (Agent-Computer Interface) excellence** — tools designed with Poka-yoke principles (designed to prevent mistakes)
- **Guardrails** — appropriate constraints on agent behavior
- **Sandboxed environments** for testing
- **Clear success criteria** enabling objective measurement

**Evaluator-optimizer pattern:** One LLM creates, another evaluates. The quality standard is encoded in the evaluator's prompt/criteria.

*Source: [anthropic.com/engineering/building-effective-agents](https://www.anthropic.com/engineering/building-effective-agents)*

### OpenAI's Evaluation Approach

**How quality is defined:** Through YAML-configured evaluation specs:
- **Accuracy** — pass/fail
- **Match** — exact string comparison
- **Includes** — substring detection
- **FuzzyMatch** — approximate matching
- **Model grading** — chain-of-thought classification (cot_classify)

**Architecture:** Quality standards encoded as YAML configs specifying: evaluation ID, description, sample datasets (JSONL), grading specifications, expected answer ideals.

**Key principle:** "Model grading will have an error rate, so it is important to validate the performance with human evaluation before running the evals at scale."

*Source: [OpenAI Evals Cookbook](https://developers.openai.com/cookbook/examples/evaluation/getting_started_with_openai_evals)*

### 50%-Task-Completion Time Horizon (Anthropic/METR, 2025)

**How quality is defined:** The time humans typically take to complete tasks that AI models can complete with 50% success rate. Quality = reliability + reasoning + tool use.

**Key metric:** Current frontier models achieve ~50-minute time horizon. Capability doubles every ~7 months.

**Three drivers of quality:** (1) reliability and mistake recovery, (2) logical reasoning, (3) tool use competence.

*Source: [arxiv.org/abs/2503.14499](https://arxiv.org/abs/2503.14499)*

---

## 2. Evaluation Platforms (Braintrust, Langfuse, LangSmith)

### Braintrust

**Quality architecture:** Three components — data (test cases), task (AI function), scores (quality functions).

**Three scorer types:**
1. **Automated scorers** — pre-built (factuality, similarity)
2. **LLM-as-judge scorers** — model evaluates against criteria
3. **Custom code-based logic** — developer-defined rules

**How quality evolves:** Offline experiments → online scoring → feedback loops. Production insights feed back into datasets. Shared scorer library across offline and online.

**Key pattern:** Comparative analysis showing score differences, regressions, and improvements across experiment iterations.

### Langfuse

**Quality dimensions:** Quality, tonality, factual accuracy, completeness — configurable per application.

**Three evaluation methods:** Model-based (LLM-as-judge), human annotations, custom API/SDK workflows.

**Architecture:** Experiments-based — datasets for consistent measurement, live evaluators for production monitoring, traces for observability.

### LangSmith

**Quality architecture (most detailed):**

**Starting point:** "Create 5-10 examples of what 'good' looks like for each critical component." Ground truth from manually selected instances.

**Four evaluator types:**
1. **Human evaluation** — annotation queues, single-run and pairwise
2. **Code evaluators** — deterministic, rule-based structural validation
3. **LLM-as-judge** — reference-free or reference-based scoring
4. **Pairwise evaluators** — comparative analysis between versions

**Evaluator outputs:** Key (metric name), score/value (numerical or categorical), optional comments.

**Two metric classes:**
- **Reference-based** (offline only): correctness, factual accuracy, exact matching
- **Reference-free** (offline + online): safety, format validation, quality heuristics, coherence

**How quality evolves:** Three phases — development (offline validation) → deployment (online monitoring) → continuous improvement (online findings inform new offline test cases). Dataset versioning and splits prevent overfitting.

**Key architectural pattern:** Quality standards are versioned alongside datasets. Evolution is tracked.

---

## 3. LLM-as-Judge Patterns (Cross-cutting)

This is the most mature and well-documented pattern for encoding quality standards. Key source: Eugene Yan's comprehensive survey.

### Three Evaluation Modes

| Mode | Best for | How it works |
|------|----------|--------------|
| **Direct scoring** | Objective criteria (factuality, compliance) | Single response scored independently |
| **Pairwise comparison** | Subjective criteria (tone, persuasiveness) | Two responses compared, winner selected |
| **Reference-based** | Known-answer tasks | Response compared against gold standard |

### Rubric Design Patterns

**Specific criteria >> general criteria.** Research shows specific criteria achieve highest agreement with human annotators; general criteria achieve lowest.

**Quality standards are encoded through:**
1. **Scoring rubrics** — numerical scales (1-10, 0-5) with explicit definitions per level
2. **Prompt instructions** — detailed guidance on acceptable vs poor performance
3. **Reference examples** — few-shot demonstrations of correct vs incorrect evaluation
4. **Constraint specifications** — low-level (JSON format, length) + high-level (semantic, hallucination prevention)

**Key finding:** Users prefer GUI for low-level constraints but natural language for high-level constraints.

### Improving Judge Quality

- **Chain-of-thought** — reasoning before scoring improves accuracy
- **Multi-turn cross-examination** — iterative questioning reveals inconsistencies (recall 0.75-0.84, precision 0.82-0.87)
- **Panel of diverse LLMs (PoLL)** — three smaller models with voting outperforms single GPT-4, at 1/7th the cost
- **Form-filling paradigm** — structured evaluation: task definition → reasoning → form completion

### Known Biases

- **Position bias** — preferring responses in certain positions
- **Verbosity bias** — favoring longer responses
- **Self-enhancement bias** — preferring outputs from own model family
- **Expert gap** — LLM evaluators correlate better with non-expert annotators

### Iterative Quality Evolution (EvalLM / EvalGen pattern)

1. User defines initial criteria
2. LLM evaluates responses against criteria
3. User grades outputs to identify criteria misalignment
4. System suggests criteria refinements
5. Implementation adjusts (code assertions or prompt engineering)

**Result:** User confidence increases from 4.96 to 6.71 on 7-point scale. Quality standards co-evolve with the system.

*Source: [eugeneyan.com/writing/llm-evaluators](https://eugeneyan.com/writing/llm-evaluators)*

---

## 4. CrewAI Quality Patterns

CrewAI has the most concrete, production-ready quality encoding of any multi-agent framework.

### Guardrails System

**Three guardrail types:**

1. **Function-based guardrails** — deterministic validation:
```python
def validate_blog_content(result: TaskOutput) -> Tuple[bool, Any]:
    word_count = len(result.raw.split())
    if word_count > 200:
        return (False, "Blog content exceeds 200 words")
    return (True, result.raw.strip())
```

2. **LLM-based guardrails** — string-based quality criteria evaluated by agent's LLM:
```python
guardrail="The blog post must be under 200 words and contain no technical jargon"
```

3. **Mixed guardrail chains** — sequential pipeline combining both:
```python
guardrails=[
    validate_word_count,       # Programmatic precision
    "Content must be engaging", # LLM assessment
    "Writing should be clear"   # LLM style check
]
```

### Quality Architecture

- **`expected_output`** — natural language description of success criteria per task
- **`output_pydantic`** — Pydantic model enforcing structural/type validation
- **`output_json`** — JSON schema validation
- **`guardrail_max_retries`** — retry budget for quality convergence
- **Guardrail chaining** — each guardrail receives output from the previous one, enabling progressive refinement

### Testing Framework

CLI tool `crewai test` runs crew N times, generating:
- Individual task scores (1-10 scale)
- Average total scores across iterations
- Execution time per run
- Agent-task assignment mapping

Quality = consistency + high scores + reasonable execution time.

*Source: [docs.crewai.com/concepts/tasks](https://docs.crewai.com/concepts/tasks), [docs.crewai.com/concepts/testing](https://docs.crewai.com/concepts/testing)*

---

## 5. AutoGen / AG2 Quality Patterns

AutoGen's quality approach is implicit rather than explicit — quality is controlled through termination conditions and speaker management rather than output validation.

### Termination as Quality Gate

11 built-in termination conditions, combinable with AND/OR:
- **MaxMessageTermination** — prevents runaway conversations
- **TextMentionTermination** — stops when specific success markers appear
- **TokenUsageTermination** — resource bounds
- **TimeoutTermination** — time bounds
- **FunctionalTermination** — custom validation function as termination trigger

### Behavioral Quality Controls

- **Speaker rotation** — prevents same agent speaking consecutively (quality through diversity)
- **Candidate filtering** — narrows eligible agents based on context
- **Reflection on tool use** — `reflect_on_tool_use=True` lets agent evaluate its own tool output
- **Custom selector functions** — state-based transition logic

### Gap

AutoGen has no equivalent of CrewAI's guardrails — no structured output validation, no scoring, no retry-on-quality-failure. Quality is an emergent property of good conversation design, not an explicitly encoded standard.

*Source: [microsoft.github.io/autogen](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/termination.html)*

---

## 6. LangGraph / LangSmith Evaluation

### LangGraph Agent Quality Patterns

LangGraph provides structural patterns but delegates quality to LangSmith:

- **Evaluator-optimizer workflow** — one LLM creates, another evaluates with structured feedback (e.g., `Feedback` schema with pass/fail classification + reasoning)
- **Human-in-the-loop** — interrupt points for human review of tool calls
- **Breakpoints** — programmatic quality gates between graph nodes

### LangSmith Agent Evaluation (detailed in Section 2 above)

LangSmith is the quality backbone. Its key contribution is treating quality standards as versioned, evolvable artifacts alongside the datasets they evaluate against.

---

## 7. Constitutional AI / Reward Model Patterns

### How Quality Standards Are Encoded

**The Constitution:** A list of principles (rules) that define acceptable behavior. These are natural language statements — not code, not metrics. Examples from the paper include principles about harmlessness, helpfulness, honesty.

**Critique-revision cycle (supervised learning phase):**
1. Model generates a response
2. Model critiques its own response against a constitutional principle
3. Model revises the response based on the critique
4. The revised response becomes training data

**RLAIF (reinforcement learning phase):**
1. Model generates pairs of responses
2. Model evaluates which response better satisfies constitutional principles
3. Preferences train a reward model
4. Reward model guides RL training

### Architectural Pattern for Quality Standards

Quality is encoded as:
1. **Principles** — natural language rules ("Be helpful, harmless, and honest")
2. **Critique prompts** — "Identify specific ways in which the assistant's response is harmful"
3. **Revision prompts** — "Please rewrite the response to remove harmful content"
4. **Preference judgments** — "Which response is more [principle]?"

**How quality evolves:** The constitution itself can be changed. Different principles can be added, removed, or reprioritized. The entire training pipeline re-executes with the updated constitution. Quality standards are a configuration input, not a hardcoded feature.

**Key insight:** Chain-of-thought reasoning improves both the quality of the trained model AND the transparency of its decision-making. Reasoning about quality standards produces better adherence.

*Source: [arxiv.org/abs/2212.08073](https://arxiv.org/abs/2212.08073), [anthropic.com/research/constitutional-ai](https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback)*

---

## 8. Process Mining Quality Standards

### Conformance Checking (Core Pattern)

**How quality is defined for processes:** Conformance checking compares actual execution (from event logs) against an ideal process model. Quality = degree of conformity.

**Four quality dimensions** (from process mining theory):
1. **Fitness** — can the model reproduce the observed behavior? (Does the process cover all real cases?)
2. **Precision** — does the model allow only observed behavior? (No spurious paths)
3. **Generalization** — does the model handle unseen but valid cases?
4. **Simplicity** — is the model minimal / not over-fitted?

**How ideal processes are specified:**
- BPMN models (formal process notation)
- Discovered models from event logs (data-driven)
- Hybrid: discover from data, refine with domain knowledge

### Celonis Approach

- **Process Adherence Manager** — creates baseline models from actual data, establishes target models for ideal processes, explores deviations
- **BPMN_CONFORMS** function — programmatic conformance checking against BPMN models
- **Conformance Checker** component — visual analysis with customizable KPIs
- **Process variants** — tracks different execution paths, identifies deviations from intended flow

### Quality Metrics in Process Mining

- **KPIs and SLAs** — business-defined performance targets
- **Cycle time** — total process duration
- **Bottleneck identification** — temporal analysis of step durations
- **Variant analysis** — frequency and performance of different execution paths
- **Root cause analysis** — algorithms identifying why deviations occur

### How Quality Evolves

Process mining is inherently evolutionary:
1. **Discovery** — mine actual process from event logs
2. **Conformance** — compare actual vs intended
3. **Enhancement** — improve the model based on findings
4. Repeat continuously with new event data

*Source: [IBM — Process Mining](https://www.ibm.com/think/topics/process-mining), [Celonis documentation](https://docs.celonis.com)*

---

## 9. APQC Process Classification Framework

APQC's website blocks automated access, but the framework's structure is well-documented in the broader literature. Here is what is established:

### Hierarchical Structure

The PCF organizes all business processes into a 5-level hierarchy:
1. **Category** (Level 1) — 13 categories (e.g., "1.0 Develop Vision and Strategy", "8.0 Manage Information Technology")
2. **Process Group** (Level 2) — major process areas within each category
3. **Process** (Level 3) — specific processes
4. **Activity** (Level 4) — activities within processes
5. **Task** (Level 5) — individual tasks (optional detail)

### Two Process Types

- **Operating processes** (Categories 1-5): Develop strategy, develop/manage products, market/sell, deliver, manage customer service
- **Management/support processes** (Categories 6-13): HR, IT, finance, procurement, environmental, external relations, knowledge management, governance

### Benchmarking Approach

APQC provides **benchmarking data** for each process:
- **Cycle time** — how long the process takes
- **Cost** — total cost to execute
- **Staff productivity** — output per person
- **Process efficiency** — waste, rework rates

Organizations compare their metrics against APQC's database of 12,000+ organizations to identify where they are top-quartile, median, or bottom-quartile performers.

### How Quality Standards Are Structured

- **Cross-industry framework** — common taxonomy regardless of industry
- **Industry-specific overlays** — banking, healthcare, education, etc. add domain-specific processes
- **Versioned** — the PCF evolves over time (current version ~7.4)
- **Machine-readable** — available as Excel/XML for system integration
- **Standardized IDs** — each process element has a unique identifier (e.g., "8.1.1.2")

### Key Pattern for Ditto

APQC separates the **taxonomy** (what processes exist) from the **benchmarks** (how well they're executed). This separation means quality standards can be defined independently of process definitions. A process has a structure AND a quality profile.

---

## 10. Cross-Cutting Patterns and Architectural Implications

### Pattern 1: Three-Layer Quality Architecture

Every system converges on three layers:
1. **Structural validation** — does the output have the right shape? (Pydantic, JSON schema, type checks)
2. **Semantic validation** — does the output mean the right thing? (LLM-as-judge, rubrics, criteria)
3. **Outcome validation** — did we achieve the goal? (Task success rate, KPIs, benchmarks)

### Pattern 2: Quality Standards as Configuration

Quality is not hardcoded — it's a configurable input:
- Constitutional AI: principles are a text file
- CrewAI: guardrails are function references or strings
- Braintrust/LangSmith: scorers are pluggable functions
- APQC: benchmarks are database lookups
- Process mining: ideal models are BPMN files

**Implication:** Quality standards should be first-class data objects, not embedded logic.

### Pattern 3: Quality Evolves Through Feedback Loops

| System | Feedback loop |
|--------|---------------|
| Constitutional AI | Principles → critique → revision → retrain |
| LangSmith | Offline evals → deploy → online monitoring → new test cases |
| Braintrust | Experiments → production → feedback → dataset refinement |
| Process mining | Discover → conform → enhance → repeat |
| EvalLM/EvalGen | Define criteria → evaluate → grade → refine criteria |
| APQC | Benchmark → compare → improve → re-benchmark |

### Pattern 4: Direct Scoring vs. Pairwise vs. Progress

Three evaluation paradigms:
- **Direct scoring** (rubric-based, 1-10) — best for objective criteria, cheapest
- **Pairwise comparison** (A vs B) — best for subjective criteria, most stable
- **Progress rate** (AgentBoard) — best for long-running processes, measures partial success

### Pattern 5: Guardrail Chain Architecture (from CrewAI)

Quality checks compose as a pipeline:
```
Output → Structural check → Semantic check → Domain check → Validated output
         (code)              (LLM)            (LLM/code)
```
Each stage receives output from the previous. Failure at any stage triggers retry with error context.

### Pattern 6: Separation of Taxonomy from Benchmarks (from APQC)

Process definitions (what to do) are separate from quality standards (how well to do it). This enables:
- Same process, different quality bars for different contexts
- Quality standards that evolve independently of process structure
- Benchmarking across organizations running the same process

### Pattern 7: Quality Standards Have Provenance

Every evaluation system tracks where quality standards come from:
- LangSmith: dataset versions, annotation sources
- APQC: industry benchmarks from 12,000+ orgs
- Constitutional AI: explicit principle authorship
- Process mining: event log sources, time ranges

---

## 11. Implications for Ditto

Based on this research, quality standards for Ditto processes should be:

1. **First-class data objects** — not embedded in code, but stored as structured entities with their own lifecycle
2. **Multi-layered** — structural (schema), semantic (rubric), outcome (KPI)
3. **Composable** — guardrail chains that mix code checks and LLM evaluation
4. **Evolvable** — feedback loops where execution results refine quality standards
5. **Separated from process definitions** — a process has structure AND a quality profile, independently versioned
6. **Benchmarkable** — quality standards include reference points (what top-quartile looks like)
7. **Transparent** — progress rate, not just pass/fail; process visibility during execution
8. **Provenance-tracked** — who defined this standard, from what data, when it was last updated

The CrewAI guardrails pattern is the most directly adoptable. The APQC taxonomy/benchmark separation is the most architecturally significant insight. The LLM-as-judge literature provides the most mature guidance on encoding semantic quality standards.
