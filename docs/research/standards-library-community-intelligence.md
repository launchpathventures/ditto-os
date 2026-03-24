# Standards Library: Runtime Quality Standards and Community Intelligence

How existing systems define, maintain, evolve, and share quality standards at runtime. Patterns for community intelligence and collective learning across instances.

**Date:** 2026-03-24
**Status:** Active
**Consumers:** Dev Architect (standards library architecture, ADR candidate), Insight-078, Insight-077 (risk baselines), Phase 10 MVP (quality context in review items)
**Related research:** `quality-standards-for-agent-execution.md` (companion report — agent evaluation frameworks, LLM-as-judge, process mining quality)

---

## Research Question

How do existing AI/automation systems define, maintain, evolve, and share quality standards at runtime? What patterns exist for community intelligence and collective learning across instances?

Six areas investigated:
1. Runtime quality benchmarking (living standards, not static checklists)
2. Community intelligence / collective learning across instances
3. Gold standard scouting at runtime
4. Quality standards in process/workflow tools
5. Agent quality benchmarking
6. Standards evolution patterns

---

## 1. Runtime Quality Benchmarking — Living Standards

### SonarQube Quality Profiles and Quality Gates

**How standards are defined:**
- **Quality Profiles** activate a subset of rules per language with parameter overrides. Built-in "Sonar way" profile provides defaults broadly applicable to most projects.
- **Quality Gates** define release-readiness as conditions on metrics. "Sonar way" gate enforces: no new issues, all security hotspots reviewed, coverage >= 80%, duplication <= 3%.

**What makes them living:**
- **Profile inheritance** — child profiles extend "Sonar way." When upstream adds rules, children inherit automatically.
- **New code focus** — conditions apply to new code specifically, not demanding legacy fixes. A "fudge factor" ignores coverage/duplication until 20+ new lines exist.
- **Changelog** tracks all profile changes, enabling teams to correlate rule changes with analysis results.

**How shared:** XML export/import. Web API for programmatic management. Profiles assigned per-project.

**Key pattern: Inheritance-based standard evolution.** Upstream improvements flow downstream automatically. Users customise via extension, not replacement.

*Source: [SonarQube Quality Gates](https://docs.sonarsource.com/sonarqube-server/2025.3/quality-standards-administration/managing-quality-gates/introduction-to-quality-gates/), [SonarQube Quality Profiles](https://docs.sonarsource.com/sonarqube-server/10.8/instance-administration/analysis-functions/quality-profiles)*

### ESLint Shareable Config Ecosystem

**How standards are defined:**
- Shareable configs are npm packages exporting configuration objects. Naming convention: `eslint-config-*`.
- Popular examples: `eslint-config-airbnb`, `eslint-config-standard`, `@typescript-eslint/configs`.
- ESLint v9 flat config: configs are arrays of objects, merged in order.

**What makes them living:**
- **Config cascade** — shareable configs compose and override. Import community base → add org rules → add team rules → add project rules.
- **Versioned independently** of the tool via npm semver.
- **Decentralised ecosystem** — anyone publishes, anyone extends.

**Key pattern: Quality standards as code, published as packages, composable via inheritance/override, versioned independently of the tool.** This is the most extractable architectural pattern for shareable standards.

*Source: [ESLint Shareable Configs](https://eslint.org/docs/latest/extend/shareable-configs)*

### Grammarly

**How standards are defined:**
- Hybrid system: hard-coded grammar rules + deep neural networks + transformer models.
- Enterprise: Brand Tone profiles, uploadable Style Guides, Goal settings (Academic/Creative/Business).

**What makes them living:**
- **User correction feedback loop:** "When lots of users hit 'ignore' on a particular suggestion, computational linguists adjust the algorithms behind that suggestion."
- **Domain-adaptive:** Creative mode won't flag sentence fragments; Academic mode flags "who" vs "whom."
- **Enterprise style guides** propagate instantly across all users.
- **Knowledge Share** surfaces company-specific terminology as employees type.

**Key pattern: Aggregate user corrections drive rule evolution.** The feedback loop (user ignores suggestion → signal → algorithm adjustment) is directly applicable to Ditto's learning loop refining quality criteria.

*Source: [How Grammarly Uses AI](https://www.grammarly.com/blog/product/how-grammarly-uses-ai/), [Under the Hood](https://www.grammarly.com/blog/engineering/under-the-hood-at-grammarly-leveraging-transformer-language-models-for-grammatical-error-correction/)*

### Great Expectations (Data Quality)

**How standards are defined:**
- **Expectations** are declarative quality tests: `expect_column_values_to_not_be_null`, `expect_column_mean_to_be_between`.
- **Expectation Suites** group related expectations. Stored as JSON, version-controlled in Git.
- Three creation modes: interactive, auto-generated by profiler (deliberately over-fitted, requires customisation), manual.

**What makes them living:**
- **Data Contracts** formalise expectations at team boundaries — consuming teams share expectations with producers.
- **Data Docs** auto-generate documentation from tests — "tests and docs always stay in sync."
- **Checkpoints** orchestrate: validate → save results → alert → regenerate docs.
- **Profiler re-generation** adapts baselines as data evolves.

**Key pattern: Expectations are simultaneously executable tests, documentation, and team contracts.** Quality standards that serve multiple purposes stay maintained because they're load-bearing.

*Source: [Great Expectations GitHub](https://github.com/great-expectations/great_expectations), [The 3 Phases of Data Contracts](https://greatexpectations.io/blog/the-3-phases-of-data-contracts/)*

### ML Model Monitoring — Drift Detection Baselines

Three tools surveyed: Evidently AI, WhyLabs, Arize.

**How baselines are defined:**
- **Reference datasets** serve as baselines. Comparison via 20+ statistical tests (KS, PSI, Jensen-Shannon divergence).
- **Three baseline types (WhyLabs):** trailing window (last N days), reference profile (uploaded known-good), reference date range (specific healthy period).
- **Auto-generation:** Evidently can auto-generate test conditions from reference data.

**What makes them living:**
- Trailing windows shift automatically — baselines evolve with the data.
- Statistical tests detect when reality drifts from what the model was trained on.
- **LLM guardrails (WhyLabs):** detect toxicity, prompt injection, PII leakage, hallucinations — quality standards for AI outputs, not just data.

**Key pattern: Baselines as statistical profiles that auto-evolve.** Trailing windows are directly applicable to Ditto's quality baselines — "what has been good for this process over the last 20 runs" as a dynamic baseline.

*Source: [Evidently AI](https://github.com/evidentlyai/evidently), [WhyLabs](https://docs.whylabs.ai/docs/), [Arize](https://arize.com/docs/ax/machine-learning/machine-learning/how-to-ml/drift-tracing)*

### Cross-Cutting Pattern: Living vs Static

| Attribute | Static checklist | Living standard |
|-----------|-----------------|-----------------|
| Update mechanism | Manual edit | Feedback loop / inheritance / re-profiling |
| Scope | Per-instance | Inheritable / shareable / composable |
| Format | Embedded logic | First-class data (config, package, profile) |
| Documentation | Separate document | Standards ARE documentation (GX, SonarQube) |
| Baselines | Fixed thresholds | Trailing windows / reference datasets |

Every system separates **what to measure** (rules/expectations/metrics) from **what thresholds define good** (gates/conditions/baselines), and makes both independently evolvable.

---

## 2. Community Intelligence / Collective Learning

### Federated Learning — Privacy-Preserving Aggregation

**Core architecture:** Central coordinator + distributed clients.
1. Distribute current global model to selected clients
2. Clients train locally on private data
3. Server aggregates client updates into new global model

**Privacy mechanisms (layered):**
- **Secure Aggregation:** Devices agree on zero-sum random masks. Each device adds a mask to its update. When server sums all updates, masks cancel out. Server never sees individual contributions.
- **Differential Privacy (DP-FTRL):** Each device clips and adds calibrated noise locally. Formal guarantee: outcome remains roughly the same whether or not any single user participated.
- **Combined (Distributed DP):** Local clipping + noise, then secure aggregation of noised updates.

**Production deployments:**
- **Google Gboard:** All production language models now use FL with DP. Learns typing patterns without raw keystrokes leaving device.
- **Apple:** Local differential privacy at event level. Daily transmission limit, no device identifiers, IP stripped on receipt.

**Open-source frameworks:** Flower (84.75% in comparative analysis, highest rated), PySyft (OpenMined), FATE (WeBank).

**Key pattern: Zero-sum masking + noise = useful aggregate without individual exposure.** Directly applicable to aggregating process quality signals across Ditto instances.

*Source: [Google PAIR FL](https://pair.withgoogle.com/explorables/federated-learning/), [Apple Privacy at Scale](https://machinelearning.apple.com/research/learning-with-privacy-at-scale), [Gboard FL with DP](https://arxiv.org/abs/2305.18465)*

### npm Ecosystem — Three-Layer Signal Aggregation

**Three independent signal layers:**

1. **Usage signals (raw):** Download counts — naive but high-volume trust proxy.
2. **Quality scoring (npms.io):** Composite score from three dimensions:
   - Quality (~30-40%): linting, tests, documentation, dependency health
   - Popularity (~30-35%): downloads, stars, contributors
   - Maintenance (~30-35%): publish frequency, issue resolution, vulnerability patching
   - Architecture: analyses entire npm ecosystem, computes metrics from multiple sources (registry + GitHub). 180+ hours to compute. Updates bi-weekly.
3. **Security intelligence (npm audit / Snyk):** Vulnerability database — community-reported + curated. Runs automatically on `npm install`. Snyk adds ML detection, academic partnerships, hand-verified entries.

**Key pattern: Three-layer composite scoring (usage + quality + security).** Maps well to process template scoring. The npms.io model (weighted aggregation from multiple independent signal sources) is directly applicable.

*Source: [npms.io About](https://npms.io/about), [npm audit docs](https://docs.npmjs.com/cli/v11/commands/npm-audit/), [Snyk Intelligence](https://snyk.io/platform/security-intelligence/)*

### Crowdsourced Quality Systems

**Wikipedia ORES:**
- ML-as-a-service trained on human quality assessments. Auto-assesses every article and revision.
- Quality scale: Stub → Start → C → B → GA → FA.
- API-based: any revision scored via HTTP request.

**Key pattern: Human labels train ML to auto-assess quality at scale.** Applicable to training quality classifiers from human corrections in Ditto.

**Reddit Wilson Score:**
- Computes lower confidence bound for positive vote ratio.
- An item with 3/0 votes ranks lower than 300/20 because the system is less confident about small samples.
- Handles cold-start gracefully.

**Key pattern: Wilson score interval for small-sample quality assessment.** Directly applicable to rating process templates/standards with few data points.

**Expectation-Maximisation (EM) for contributor reliability:**
- Two-pass algorithm: first majority vote, then weight by estimated contributor reliability.
- More accurate than simple majority voting.

**Key pattern: Weight quality signals by contributor track record.** Applicable to weighting feedback from different Ditto users/instances.

*Source: [ORES](https://www.mediawiki.org/wiki/ORES), [Reddit Comments Strategy](https://strategybreakdowns.com/p/reddit-comments), [Quality in Crowdsourced Classification](https://www.emerald.com/ijcs/article/3/3/222/115175)*

### Telemetry-Driven Improvement

**VS Code — Four-Tier Data Classification:**
1. SystemMetaData — generated by VS Code, not personally identifiable
2. CallstackOrException — stack traces with user paths scrubbed
3. PublicNonPersonalData — user-generated but public (e.g., extension IDs)
4. EndUserPseudonymizedInformation — hashes that identify unique users without revealing identity

**Mozilla Firefox — ETL Scrubbing Pipeline:**
- Load balancer → HTTP server → PubSub → Raw topic → ETL scrub → BigQuery
- IP addresses not stored. PII scrubbed in ETL.
- Preference for aggregate datasets over individual records.

**Key pattern: Data classification tiers + ETL scrubbing.** VS Code's four tiers provide a model for categorising which process quality signals can be shared. Mozilla's pipeline shows how to aggregate safely.

*Source: [VS Code Telemetry](https://code.visualstudio.com/docs/configure/telemetry), [Mozilla Data Pipeline](https://docs.telemetry.mozilla.org/concepts/pipeline/gcp_data_pipeline.html)*

---

## 3. Gold Standard Scouting at Runtime

No system was found that actively scouts external knowledge at runtime before creating or improving something. The closest patterns:

**Grammarly's style guide ingestion:** Enterprise users upload current style guides which become active immediately. But the system doesn't go looking for updated standards — it waits for human upload.

**SonarQube profile inheritance:** When Sonar updates the "Sonar way" profile with new rules based on evolving best practices, child profiles inherit automatically. This is passive reception, not active scouting.

**ML monitoring re-profiling:** Evidently/WhyLabs can re-profile baselines from new reference data. But someone must provide the new reference — the system doesn't seek it.

**LLM-as-Judge with updated rubrics (EvalLM/EvalGen pattern):**
1. User defines initial criteria
2. LLM evaluates responses against criteria
3. User grades outputs to identify misalignment
4. System suggests criteria refinements
5. User confidence increases from 4.96 to 6.71 on 7-point scale

This is the closest to "runtime standard evolution" — the system actively suggests improvements to its own quality criteria. But the user initiates, and refinements are based on internal data, not external scouting.

**Gap: Active runtime scouting of external best practice is Original to Ditto.** No surveyed system autonomously consults external knowledge to update quality standards. This aligns with Insight-078's framing of the standards library as the runtime expression of "research before design." The Dev Researcher pattern applied to the running system itself has no precedent in the surveyed landscape.

*Source: [EvalGen/EvalLM](https://eugeneyan.com/writing/llm-evaluators)*

---

## 4. Quality Standards in Process/Workflow Tools

### n8n

- **8,500+ community-shared workflow templates.**
- **Two quality tiers:** Community (unverified) and Verified Creator (quality-checked).
- **Quality signals:** Download count (>50 = proven), comment sentiment, creator verification status.
- **Third-party marketplaces** emerging with review/test/documentation requirements.
- **No quality scoring, no collective learning** from execution data across instances.

### Zapier

- **Pre-built Zap templates** with apps and fields pre-selected.
- **Auto-generates templates** from observed real-world usage patterns.
- **All templates subject to review** for quality standards.
- **No quality scoring, no execution data aggregation.**

### CrewAI

- **Most concrete agent quality encoding** of any multi-agent framework.
- **Guardrail system:** Function-based (code), LLM-based (criteria string), mixed chains (sequential pipeline).
- **`expected_output`** — natural language success criteria per task.
- **`output_pydantic` / `output_json`** — structural validation.
- **`guardrail_max_retries`** — retry budget for quality convergence.
- **`crewai test`** CLI — runs crew N times, scores tasks 1-10.

### AutoGen

- Quality is implicit — controlled through termination conditions and speaker management, not output validation.
- **No guardrails, no scoring, no structured quality encoding.**

### LangGraph / LangSmith

- LangGraph delegates quality to LangSmith.
- **LangSmith:** "Create 5-10 examples of what 'good' looks like for each critical component."
- Four evaluator types: human, code, LLM-as-judge, pairwise.
- **Standards versioned alongside datasets.** Three-phase evolution: development → deployment → continuous improvement.
- **No cross-organisation aggregation.**

### APQC Process Classification Framework

- **5-level process taxonomy** — 13 categories covering all business processes.
- **Separates taxonomy (what processes exist) from benchmarks (how well they're done).**
- Benchmarks: cycle time, cost, staff productivity, efficiency.
- **12,000+ organisation database** for quartile positioning.
- **Industry-specific overlays** on cross-industry base.
- **Machine-readable** (Excel/XML) with standardised IDs (e.g., "8.1.1.2").

**Critical gap: No workflow/agent platform has community-aggregated quality learning.** Templates are shared as definitions. Execution quality (success rates, failure patterns, performance benchmarks) stays entirely local. No privacy-preserving aggregation mechanism exists in any surveyed system. This is whitespace.

*Source: [n8n Templates](https://docs.n8n.io/workflows/templates/), [Zapier Templates](https://platform.zapier.com/publish/zap-templates), [CrewAI Tasks](https://docs.crewai.com/concepts/tasks), [APQC via process mining literature](https://www.ibm.com/think/topics/process-mining)*

---

## 5. Agent Quality Benchmarking

(Detailed in companion report `quality-standards-for-agent-execution.md` — summary here)

### Key Findings

**Agent evaluation frameworks:** AgentBench (binary task success), AgentBoard (progress rate — partial completion as gradient), Anthropic (layered evaluation — cheap automated first, expensive human last), OpenAI (YAML evaluation configs).

**LLM-as-Judge (most mature pattern):** Three modes — direct scoring, pairwise comparison, reference-based. Specific criteria >> general criteria. Panel of diverse LLMs (PoLL) outperforms single GPT-4 at 1/7th cost. Chain-of-thought reasoning improves adherence.

**Quality standards encoded as:**
1. Scoring rubrics — numerical scales with level definitions
2. Prompt instructions — guidance on acceptable vs poor performance
3. Reference examples — few-shot demonstrations
4. Constraint specifications — structural + semantic

**Constitutional AI pattern:** Quality standards as natural language principles → critique-revision cycle → the constitution is a configuration input that can be changed. Quality is a parameter, not hardcoded.

**Process mining quality:** Four dimensions — fitness, precision, generalisation, simplicity. Conformance checking compares actual vs ideal.

### Seven Cross-Cutting Patterns

1. **Three-layer quality** — structural (schema) + semantic (rubric) + outcome (KPI)
2. **Quality as configuration** — standards are data, not code
3. **Feedback loop evolution** — execution results refine standards
4. **Three evaluation paradigms** — direct scoring, pairwise, progress rate
5. **Guardrail chain composition** — structural → semantic → domain, with retry
6. **Taxonomy/benchmark separation** — process definition independent of quality profile (APQC)
7. **Quality provenance** — tracking who defined standards, from what data, when updated

---

## 6. Standards Evolution Patterns

### How Standards Stay Fresh (Not Stale or Over-Fitted)

| Mechanism | System | How it works |
|-----------|--------|-------------|
| **Inheritance auto-update** | SonarQube | Parent profile changes flow to children automatically |
| **User correction aggregation** | Grammarly | Mass "ignore" → algorithm adjustment |
| **Trailing window baselines** | ML monitoring | Baselines shift with recent data |
| **Re-profiling** | Great Expectations | Auto-generate expectations from new data |
| **Criteria co-evolution** | EvalLM/EvalGen | System suggests criteria refinements based on user grading |
| **Constitution revision** | Constitutional AI | Principles updated, retraining pipeline re-runs |
| **Conformance cycling** | Process mining | Discover → conform → enhance → repeat |
| **Versioned datasets** | LangSmith | Quality standards versioned alongside evaluation data |

### What Prevents Staleness

1. **Feedback loops** — every system connects execution results back to standard refinement.
2. **Auto-generation from data** — profilers and trailing windows adapt to changing reality.
3. **Independent versioning** — standards evolve on their own cadence, not locked to the tool.
4. **Multiple signal sources** — npms.io combines registry + GitHub + download data. No single signal dominates.

### What Prevents Over-Fitting

1. **Inheritance from curated defaults** — SonarQube's "Sonar way" provides a floor that prevents drift.
2. **Generalization dimension** — process mining explicitly measures "does the model handle unseen but valid cases?"
3. **Cross-organisation benchmarking** — APQC's quartile positioning reveals when local standards have drifted from industry norms.
4. **User override** — every system allows users to accept or reject standard refinements. The human is the final check.

### Domain-Specific vs Universal

| System | Universal standards | Domain-specific extension |
|--------|-------------------|--------------------------|
| SonarQube | "Sonar way" per language | Custom profiles per project/team |
| ESLint | `eslint-config-standard` | `eslint-config-airbnb`, org configs |
| Grammarly | Grammar rules | Brand Tone, Style Guides, Domain Goal |
| APQC | Cross-industry PCF | Industry-specific overlays |
| Great Expectations | Core expectation types | Custom expectations per dataset |

**Key pattern: Universal base + domain extension.** Every system starts with broadly applicable defaults and supports domain-specific customisation via composition, not replacement.

---

## 7. Gaps — Original to Ditto

Five capabilities not found in any surveyed system:

1. **Active runtime scouting of external best practice.** No system autonomously consults external knowledge to update its quality standards. All wait for human-initiated updates or inherit from curated upstream profiles. The "Dev Researcher at runtime" concept (Insight-078) is original.

2. **Privacy-preserving collective learning for process/workflow quality.** Federated learning exists for keyboards and ML models. npm aggregates package signals. But no workflow/agent platform aggregates execution quality across instances. The gap between "template sharing" (what n8n and Zapier do) and "execution intelligence sharing" (what nobody does) is exactly where Ditto's community standards land.

3. **Three-layer risk baselines from community data.** Risk baselines informed by community standards (Insight-077) — operational, effectiveness, strategic — require both the standards library and the community aggregation. No surveyed system provides cross-instance risk baselines.

4. **Quality standards that span agent behaviour + output quality + process design in a single framework.** Individual systems address one or two: APQC benchmarks process design, CrewAI guardrails address output quality, LangSmith addresses agent evaluation + output rubrics. The *integration* of all three into a coherent standards framework — where agent behaviour standards, output quality criteria, and process design patterns are composed and co-evolve — is not found in any single system. The components exist; the unification is original.

5. **Standards as the output of a learning loop, not an input.** Most systems treat standards as something humans define and the system enforces. Grammarly comes closest — aggregate user corrections drive algorithm adjustments — but this is limited to one dimension (writing rules) within a single product, not a general-purpose learning loop that produces standards across multiple domains. The EvalLM/EvalGen criteria co-evolution pattern also approaches this (system suggests criteria refinements from user grading) but remains human-initiated and single-scope. Ditto's model (Insight-078) where the learning loop itself produces and evolves standards from both internal feedback and external scouting — across agent behaviour, output quality, and process design simultaneously — extends these precedents into new territory.

### Survey Gaps (Acknowledged)

**Agentic coding platforms** (Devin, Cursor, Windsurf, Copilot Workspace, Manus.ai) were not surveyed. These systems are closer to Ditto's "agent executing governed work" paradigm than pure workflow tools. Several have emergent quality feedback patterns (Devin's session replay, Cursor's per-project rules). The Architect should verify whether these systems narrow Gaps 4 or 5 before accepting originality claims.

---

## 8. Extractable Patterns for Ditto

### Adopt (use directly)

| Pattern | Source | What to adopt |
|---------|--------|--------------|
| Config cascade / inheritance | ESLint, SonarQube | Standards composition: built-in → community → personal, with inheritance and override |
| Three-layer quality | All evaluation platforms | Structural (schema) + semantic (rubric) + outcome (KPI) on every process |
| Quality as configuration | CrewAI, Constitutional AI | Standards as first-class data objects, not embedded logic |
| Guardrail chain composition | CrewAI | Sequential quality checks: structural → semantic → domain, with retry |
| Taxonomy/benchmark separation | APQC | Process definition independent of quality profile |
| Wilson score interval | Reddit | Cold-start-safe rating for process templates with few data points |
| Trailing window baselines | ML monitoring | Dynamic quality baselines from recent N runs |

### Pattern (study approach, implement our way)

| Pattern | Source | What to study |
|---------|--------|--------------|
| Federated learning + DP | Google Gboard, Apple | Privacy-preserving aggregation of quality signals across instances |
| Composite scoring model | npms.io | Multi-dimension weighted quality score for process templates |
| User correction → rule evolution | Grammarly | Aggregate corrections drive standard refinement |
| Data classification tiers | VS Code | Categorise which process signals can be shared |
| ML-trained quality assessment | Wikipedia ORES | Train quality classifiers from human correction data |
| EvalLM criteria co-evolution | LangSmith/EvalGen | System suggests standard refinements from user feedback |
| Conformance cycling | Process mining | Discover actual → compare ideal → enhance → repeat |

### Original to Ditto

| Concept | Why original |
|---------|-------------|
| Active runtime standard scouting | No system scouts external best practice before creating/improving |
| Cross-instance execution intelligence | Template sharing exists; quality learning does not |
| Three-layer risk baselines | No community-informed risk detection baselines |
| Unified agent + output + process standards | No system spans all three |
| Standards as learning loop output | Every system treats standards as human-defined input |

---

## 9. Architectural Options (for Architect Evaluation)

Three architectural options emerge from the research. These are presented neutrally for the Architect to evaluate.

### Option A: Static Standards with Feedback Refinement

Standards ship as built-in defaults (like SonarQube's "Sonar way"). User corrections refine them locally (like Grammarly's feedback loop). No community aggregation.

- Standards are YAML/JSON files, version-controlled
- Process creation populates `quality_criteria` and `feedback.metrics` from standards based on process type
- Learning loop (L5) refines standards from correction patterns
- Trailing window baselines (from ML monitoring pattern) for risk detection

### Option B: Composable Standards with Inheritance

Standards as npm-like packages. Built-in → community-published → org-level → personal, with inheritance cascade (ESLint pattern). No execution data aggregation.

- `ditto-standards-base` package provides defaults
- Community publishes domain-specific standard packages
- Inheritance: base → domain → org → personal
- Process definitions reference a standards package
- APQC-style taxonomy/benchmark separation

### Option C: Federated Community Intelligence

Full community learning. Local execution data → privacy-preserving aggregation → community baselines → improved defaults for all instances (Gboard/Apple DP pattern).

- Options A + B as foundation
- Opt-in telemetry: quality signals aggregated via DP mechanisms
- Community baselines: "typical correction rate for content review processes"
- Wilson score for template/standard ratings with small samples
- EM weighting for contributor reliability
- VS Code-style data classification tiers

---

## Reference Doc Status

- **landscape.md checked:** No evaluations contradicted. Existing entries for SonarQube-relevant patterns (not listed directly), ESLint patterns (not listed), ML monitoring (not listed). These are standards/evaluation tools, not direct Ditto competitors — no landscape entries needed.
- **Research README.md:** Agent quality report added by subagent. This report should be added.
- **Existing insights confirmed:** Insight-064 (Benchmark Before Keep) aligns with the "three-layer quality" and "feedback loop evolution" patterns. Insight-069 (Skills Packages) aligns with the "guardrail chain composition" pattern — skills packages are a specific type of quality standard that composes into the harness pipeline. Insight-078 (Standards Library) is confirmed as original — no surveyed system implements the "learning loop produces standards" concept.
