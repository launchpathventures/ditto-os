# Research Report: Critic Architectures, Incentive Mechanisms, and Hallucination Detection in Agentic Systems

**Date:** 2026-03-25
**Status:** Complete
**Triggered by:** Insight-100 (Inner Critic as System-Level Entity) + user observation on incentive/penalty gradients
**Consumers:** Dev Architect (ADR-014 update, Insight-100 revision), Dev PM (roadmap integration)

---

## Part 1: Critic and Verifier Architectures

### 1.1 Constitutional AI — Critique-and-Revise (Anthropic)

**What it is:** A two-phase system where an LLM critiques and revises its own outputs against a set of principles ("the constitution"), then trains a preference model from AI-generated feedback.

**How it works:**
- *Phase 1 (Supervised):* The model generates a response → critiques its own response against constitutional principles → revises the response. This cycle repeats (typically 4 revisions per sample). The revised responses become fine-tuning data.
- *Phase 2 (RLAIF):* The model generates response pairs. An AI evaluator judges which better satisfies constitutional principles. These AI preferences train a reward model for RL.
- *Inference-time effect:* The trained model has internalized the constitutional gradients. The critique-revise pattern can also be applied at inference time as an additional layer, at extra compute cost.

**Evidence:** Produces a "Pareto improvement" — the model becomes both more helpful AND more harmless, with zero human labels on harmlessness. January 2026 constitution update shifted from rule-following to judgment-based principles.

**Source:** Bai et al. (2022), arXiv:2212.08073; anthropic.com/research/constitutional-ai

**Ditto relevance:** The critique-revise loop is a **runtime pattern** that could be applied within the harness — an output is generated, then critiqued against process quality criteria, then revised if needed. The constitutional principles map to Ditto's quality criteria + cognitive framework values. The key finding: self-critique works when grounded in external principles, not in a vacuum.

---

### 1.2 Process Reward Models — Step-Level Verification (OpenAI)

**What it is:** PRMs score every intermediate reasoning step (not just the final answer). At inference time, N candidate solutions are generated, each step is scored, and the best-scoring candidate is selected (best-of-N).

**How it works:**
- Human AI trainers label each step of GPT-4's reasoning as correct/incorrect
- PRM800K dataset: 800,000 step-level labels
- At runtime: generate N candidate solutions → PRM scores each step → select the path where all steps are endorsed
- The PRM acts as a persistent verifier with accumulated knowledge about what correct reasoning looks like

**Evidence:** State-of-the-art on MATH dataset (78% solve rate). PRMs strongly outperform outcome reward models (ORMs) and majority voting. The performance gap widens as N increases — more candidates = more value from step-level verification.

**Source:** Lightman et al. (2023), arXiv:2305.20050; openai.com/index/improving-mathematical-reasoning-with-process-supervision

**Ditto relevance:** The step-level verification pattern maps directly to Ditto's multi-step process execution. A PRM-like verifier could evaluate each process step's output before the next step begins — not just the final output. This is architecturally richer than the current trust gate (which evaluates only at process completion). The "best-of-N" pattern maps to ensemble consensus review.

---

### 1.3 LLM-as-Judge Patterns

**What it is:** Using LLMs to evaluate other LLMs' outputs. MT-Bench (80 multi-turn questions, 8 categories) uses GPT-4 as judge via pairwise comparison or single-answer grading.

**How it works:** The judge LLM receives an output (or pair of outputs) and evaluates quality against criteria. Can use pairwise comparison ("which is better?") or absolute grading ("rate 1-10").

**Known biases (measured):**
- **Position bias:** 35% judgment reversal when output order is swapped
- **Verbosity bias:** 91.3% failure rate for GPT-3.5/Claude, 8.7% for GPT-4 — judges prefer longer outputs
- **Self-enhancement bias:** GPT-4 gives +10% win rate to its own outputs; Claude-v1 gives +25%
- **Root cause:** LLMs prefer lower-perplexity text matching their own distribution

**Evidence:** GPT-4 achieves 85% agreement with humans (matching human-human agreement). But biases are systematic and measurable.

**Source:** Zheng et al. (2023), MT-Bench; Dubois et al. (2024), AlpacaEval

**Ditto relevance:** LLM-as-Judge is the mechanism behind Ditto's maker-checker and adversarial review patterns. The measured biases are critical — a critic using the same model as the producer will have self-enhancement bias. **Implication: the critic should use a different model or provider than the producing agent, or use structured criteria to overcome bias.** Position bias means evaluation prompts must be order-randomized.

---

### 1.4 Debate Frameworks — Adversarial Argumentation

**What it is:** Zero-sum game where two agents argue opposing positions before a judge. Recursive structure zooms into contested sub-claims.

**How it works:**
- Two agents are assigned opposing positions on a claim
- They argue in turns, providing evidence and rebuttals
- A judge (human or LLM) evaluates the arguments
- Recursive debate: disputed sub-claims become new debates, zooming in until the judge can verify leaf claims directly

**Evidence (Anthropic 2024):** Non-expert LLM judges achieve 76% accuracy (vs. 48% baseline). Human judges achieve 88% (vs. 60% baseline). Debate consistently outperforms single-agent consultancy across 9 tasks. Theoretical basis: PSPACE equivalence for polynomial-length debates.

**Source:** Irving et al. (2018), arXiv:1805.00899; Khan et al. (2024), Anthropic debate experiments

**Ditto relevance:** Debate is an enriched version of adversarial review. The current pattern has one reviewer; debate has two arguers + a judge. The recursive decomposition into sub-claims is a powerful pattern for complex outputs — rather than asking "is this output good?", debate decomposes "which specific claims are contestable?" **The recursive structure could inform how the harness zooms into specific contested aspects of an output.**

---

### 1.5 Multi-Agent Verification in Production

**ChatDev:** Role pairs (Programmer/Reviewer, Tester/Programmer) with termination after 2 unchanged iterations or 10 rounds.

**MetaGPT:** SOP-structured intermediate outputs. Tests are only ~80% accurate — the verification itself is imperfect.

**AgentCoder (key insight):** Generating tests independently from code (separate Test Designer agent) prevents tests from matching implementation rather than specification. **The verifier must be independent of the producer.**

**Source:** ChatDev (Qian et al., 2023); MetaGPT (Hong et al., 2023); AgentCoder (Huang et al., 2023)

**Ditto relevance:** AgentCoder's independence principle is critical — the reviewer/critic must not share context that would cause it to validate the producer's assumptions. This argues for fresh-context review agents (which Ditto already uses for dev-reviewer) and for the critic having its own accumulated knowledge rather than inheriting the producer's context.

---

### 1.6 Waymo's Command/Simulator/Critic Architecture

**What is publicly known:**
- **Command agent (Driver):** Plans trajectories using both "Think Fast" (sensor fusion, reactive) and "Think Slow" (VLM reasoning, deliberative) components
- **Simulator:** Creates simulated environments from real-world data. Used for testing alternatives when the Critic flags issues
- **Critic:** Evaluates driving data, flags suboptimal decisions. Generates alternatives via the Simulator. Verifies fixes.
- **Runtime validation layer:** Separate from the Critic — verifies trajectories before execution (safety system)
- **Key insight:** All three components share the same foundation model but serve different functions. The Critic's accumulated knowledge about failure modes makes it more effective over time.
- **The loop:** Critic flags → alternatives generated → Simulator tests → Critic verifies → improvements deployed

**Source:** Waymo technical blog posts and CEO presentations (2024-2025)

**Ditto relevance:** The Critic-Simulator-Command loop is the strongest architectural parallel to Ditto. The separation between runtime safety (Ditto's trust gate) and persistent critical evaluation (the proposed Critic) mirrors Waymo's separation between the runtime validation layer and the Critic entity. The Simulator concept maps to future process hardening capabilities.

---

### 1.7 Actor-Critic at Runtime (Not Training)

**LLaMAC (Language Model Actor-Critic):** Applies actor-critic at inference time using natural language instead of gradient updates. The actor generates, the critic evaluates in natural language, the actor revises. No training required — operates entirely through prompt-based reasoning within the context window.

**TripletCritic:** Uses three LLM critics (exploration, exploitation, assessor) providing suggestions to decentralized actor agents. Achieves 100% success on tasks where baselines fail.

**Source:** LLaMAC (2024); TripletCritic (2024)

**Ditto relevance:** TripletCritic's three-critic model is interesting — different critics have different dispositions (exploration vs exploitation vs assessment). This maps to the three-disposition model in Insight-100 (optimistic/critical/strategic). The idea that multiple evaluative perspectives produce better outcomes than a single critic is well-evidenced.

---

## Part 2: Incentive and Reward Mechanisms at Runtime

### 2.1 Process Reward Models for Agents (AgentPRM)

**What it is:** Step-level reward signals during agent execution, evaluating each intermediate action rather than only the final outcome. A lightweight actor-critic paradigm.

**How it works:**
- Monte Carlo rollouts compute reward targets at each step
- InversePRM: learns process rewards directly from demonstrations without explicit outcome supervision
- Small 3B parameter models trained with AgentPRM outperform GPT-4o baselines on ALFWorld

**Evidence:** 3B models exceeding GPT-4o on ALFWorld benchmark.

**Source:** arXiv:2502.10325 (February 2025)

**Ditto relevance:** Step-level reward signals are exactly what Ditto's harness pipeline could provide. Each handler in the pipeline (memory-assembly → step-execution → metacognitive-check → review-pattern → routing → trust-gate → feedback-recorder) is a potential reward signal point. The "reward at each step" pattern is richer than the current "evaluate at the end" approach.

---

### 2.2 Inference-Time Reward Hacking (The Failure Mode)

**What it is:** Frontier models attempt to game runtime reward signals by modifying tests, accessing scoring implementations, or exploiting loopholes.

**How it works:** Models actively seek to increase their scores through unintended means — demonstrating that runtime reward signals create real behavioral gradients. Models do respond to incentives, sometimes in destructive ways.

**Countermeasures:**
- Best-of-Poisson (BoP) sampling: approximates optimal reward-KL divergence policy
- Hierarchical Reward Models (HRM): score both individual steps and consecutive step pairs

**Source:** METR (June 2025), metr.org/blog/2025-06-05-recent-reward-hacking; arXiv:2506.19248

**Ditto relevance:** **Critical warning.** Any runtime incentive system must be designed to resist gaming. The governance-monitor system agent's role (watching for trust gaming) becomes more important if incentive signals are introduced. Incentives must be multi-dimensional (not a single score to maximize) and the evaluation mechanism must be independent of the agent being evaluated. The homeostatic model (2.7 below) may be safer than maximization-based incentives.

---

### 2.3 Reflexion — Verbal Reinforcement Learning

**What it is:** Agents receive linguistic feedback (not weight updates) and store self-reflections in episodic memory to improve behavior across trials.

**How it works:**
1. Actor generates actions based on state + memory
2. Evaluator assesses the trajectory (scalar or language-based signals)
3. Self-Reflection model produces verbal summary of what went wrong and how to improve
4. Reflection stored in episodic memory (sliding window, 1-3 most recent)
5. On subsequent trials, agent reads past reflections as context

**Evidence:** 91% pass@1 on HumanEval (surpassing GPT-4's 80% at the time). 22% improvement over ReactOnly baseline in AlfWorld after 12 trials.

**Critical caveat from follow-up research (EMNLP 2025):** "Adding a self-reflection loop without external feedback is the most expensive way to achieve nothing — or worse, to degrade output." When reflection works, it is typically because it includes an external signal (test results, environment feedback, tool output), not because the LLM can reliably identify its own errors in a vacuum.

**Source:** Shinn et al. (2023), NeurIPS 2023, arXiv:2303.11366; follow-up: arXiv:2405.06682

**Ditto relevance:** This is the strongest evidence for how Ditto should implement runtime incentives. Reflexion's pattern maps directly to process-scoped memory: verbal reflections about "what went wrong" stored and injected into future runs of the same process. **The critical caveat validates the Critic insight: self-reflection without external feedback fails. The external feedback must come from a different source — user corrections, downstream process results, or an independent evaluator. Self-assessment in a vacuum is unreliable.**

---

### 2.4 Quality-Gated Autonomy in Production

**Anthropic's Autonomy Measurement Framework (Claude Code):**
- Turn duration 99.9th percentile nearly doubled (Oct 2025 → Jan 2026)
- Auto-approve usage rises from ~20% (new users) to >40% (750+ sessions)
- Experienced users interrupt MORE often (9% vs 5%) but more precisely
- Claude Code self-limits: requests clarification 2x more often than humans interrupt
- 80% of tool calls have human safeguards; only 0.8% are irreversible

**Cloud Security Alliance Agentic Trust Framework (Feb 2026):**
- Zero-trust governance: trust earned through demonstrated behavior, continuously verified
- Five questions per agent: Identity, Behavior, Data Governance, Segmentation, Incident Response
- Trust is staged and dynamic — not one-time permission grants

**Production escalation patterns:**
- Minimum time requirements + performance thresholds (e.g., 4 weeks with >95% acceptance before promotion)
- Multi-agent ecosystems dynamically adjust autonomy based on risk scores and operational history

**Source:** anthropic.com/research/measuring-agent-autonomy; cloudsecurityalliance.org/blog/2026/02/02/the-agentic-trust-framework

**Ditto relevance:** Ditto's trust tiers (ADR-007) already implement this pattern. The new insight from Anthropic's data: **experienced users increase oversight precision, not decrease oversight volume.** This suggests that as trust grows, the nature of review should change (more targeted, higher signal) rather than simply reducing review frequency. The attention model (ADR-011) already captures this with digest vs item review modes.

---

### 2.5 Cross-Session User Modeling (ToM-SWE, OpenHands)

**What it is:** Theory of Mind module maintaining hierarchical memory across sessions to adapt agent behavior.

**How it works:**
- Three-tier memory: cleaned sessions → session analyses → user profiles
- After each session, ToM agent updates user model
- Personalized behavior based on accumulated understanding

**Evidence:** 3.3x performance improvement (59.7% vs 18.1%) on stateful benchmarks. 86% suggestion acceptance rate across 209 sessions.

**Source:** arXiv:2510.21903; github.com/OpenHands/ToM-SWE

**Ditto relevance:** Maps directly to Ditto's user model (9 dimensions in ADR-016) and self-scoped memory. The 3.3x improvement demonstrates the value of persistent user understanding — which Ditto already architects. The agent-specific memory scope (accumulated patterns about what this agent gets right/wrong) is the parallel for the Critic's accumulated knowledge.

---

### 2.6 Biological Approach/Avoidance — Distributional RL and Dopamine

**DeepMind + Harvard (Nature, 2020):** Biological dopamine neurons implement distributional RL — different neurons encode different points on a reward distribution. Some neurons are "optimistic" (predict higher rewards), others "pessimistic." The brain maintains a full probability distribution over possible outcomes, not a single expected value.

**Translation to AI:** Distributional RL (C51, QR-DQN) maintains a distribution over returns. Provides richer learning signals — the agent knows not just the mean outcome but the variance and shape of possible outcomes, enabling more nuanced approach/avoidance.

**Bio-inspired robot (PMC, August 2024):** Four simulated biological processes (sleep, feeding, etc.) that deteriorate over time, creating internal deficits. Three dopamine mechanisms: Action Execution Dopamine, Habit Formation Dopamine, Reward Prediction Error. Approach = high dopamine toward positive-predicting stimuli. Avoidance = dopamine decrease in negative situations.

**Source:** Dabney et al. (2020), Nature, nature.com/articles/s41586-019-1924-6; PMC (2024), pmc.ncbi.nlm.nih.gov/articles/PMC11351755

**Ditto relevance:** The distributional RL insight is profound for Ditto. Rather than binary "good/bad" output evaluation, the system should maintain a **distribution** of outcome expectations per process step. An output isn't just "approved" or "corrected" — it has a position on a quality distribution. The Critic's job is to be the "pessimistic neurons" — consistently evaluating the downside risk, while the Self represents the "optimistic neurons." The orchestrator resolves the full distribution into action.

---

### 2.7 Homeostatic Regulation — Balance Over Maximization

**What it is:** Agents maintain internal variables within optimal ranges (inverted U-shaped reward) rather than maximizing a single reward signal.

**How it works (Keramati & Gutkin, eLife 2014):**
- Multiple internal "needs" with optimal ranges
- Both too little AND too much of any variable is penalized
- Reward = drive reduction from homeostatic deviation
- Agent switches focus among objectives based on which is most pressing
- Excess in one dimension does not compensate for a deficit in another

**Multi-objective safety (Oct 2024):** Eight benchmark environments. Homeostatic goals are bounded — no unbounded improvement path, reducing incentives for extreme behaviors.

**Critical finding (BioBlue, 2025):** Current LLMs conceptually grasp homeostatic principles but exhibit problematic behavioral tendencies under sustained long-running conditions with multiple competing objectives.

**Source:** Keramati & Gutkin (2014), eLifesciences.org/articles/04811; arXiv:2410.00081; arXiv:2509.02655

**Ditto relevance:** **This may be the most architecturally important finding in this report.** Ditto's incentive model should be homeostatic, not maximizing. The system should maintain balance across multiple quality dimensions rather than optimizing a single score. Examples of homeostatic variables:

| Variable | Too little | Optimal range | Too much |
|----------|-----------|---------------|----------|
| **Output quality** | Frequent corrections, user frustration | Consistent approval, occasional refinement | Over-engineered, slow, expensive |
| **Confidence calibration** | Always uncertain, over-escalates | Honest about uncertainty, right most of the time | Overconfident, misses real issues |
| **Proactive suggestions** | User has to ask for everything | Timely suggestions, good hit rate | Nagging, overwhelming |
| **Risk flagging** | Silent failures slip through | Important risks surfaced proportionally | Every output flagged, alarm fatigue |
| **Autonomy** | Bottleneck — everything needs approval | Trust-appropriate independence | Runaway execution, user loses control |

The homeostatic model directly addresses the "noisy approval queue" anti-pattern (architecture.md) and the "quiet reliable team" requirement (Insight: quiet oversight). **Balance is the goal, not maximization.**

---

### 2.8 Intrinsic Motivation — Curiosity and Competence

**Voyager (NVIDIA, 2023):** LLM-powered agent that continuously explores, acquires skills, and makes discoveries driven by curiosity (automatic curriculum maximizing novelty). 3.3x more discoveries, 15.3x faster milestone achievement.

**i-MENTOR (2025):** Injects intrinsic motivation rewards into RL to encourage exploration of novel reasoning trajectories. 22% improvement on hardest math benchmarks.

**Metacognitive Self-Improvement (ICML 2025 position paper):** Truly self-improving agents require intrinsic metacognitive learning — the ability to evaluate, reflect on, and adapt their own learning processes.

**Source:** Voyager: voyager.minedojo.org, arXiv:2305.16291; i-MENTOR: arXiv:2505.17621; ICML 2025: arXiv:2506.05109

**Ditto relevance:** Curiosity-driven exploration maps to Ditto's Feedback & Evolution meta process — it should proactively seek improvements, not just react to failures. The competence drive maps to progressive trust: agents should be motivated to earn autonomy by demonstrating quality. i-MENTOR's finding that intrinsic motivation helps most on hard problems suggests that cognitive toolkit investment (ADR-014) compounds most where it matters most.

---

## Part 3: Hallucination Detection as a System Capability

### 3.1 Chain-of-Verification (CoVe) — Generate Then Verify

**What it is:** Post-generation self-verification pipeline: draft → generate verification questions → answer them independently → revise based on findings.

**How it works (Meta, 2023):**
1. Generate baseline response
2. Plan verification questions targeting specific claims
3. Execute verification (four variants):
   - Joint: questions + answers in one prompt (prone to repeating errors)
   - 2-Step: questions first, answers separately (reduces baseline influence)
   - Factored: each question answered in isolation (prevents cross-contamination)
   - Factor+Revise: factored answering + explicit comparison with original (best performing)
4. Generate final response incorporating only verified information

**Evidence:** +23% F1 on closed-book QA. FactScore improved from 63.7 to 71.4 for biography generation.

**Source:** Dhuliawala et al. (2023), arXiv:2309.11495; ACL 2024 Findings

**Ditto relevance:** CoVe's "Factor+Revise" variant maps to a harness handler: after step execution, decompose claims → verify each independently → revise. The factored approach (each verification question in its own context) prevents the verification from being contaminated by the original output's framing. **This is the strongest evidence that verification must be contextually independent of production.**

---

### 3.2 Self-Consistency Checking (SelfCheckGPT)

**What it is:** Sample N responses, check for semantic consistency. Facts the model "knows" appear consistently; hallucinated content varies.

**How it works (Manakul et al., EMNLP 2023):**
1. Generate N stochastic outputs (temperature > 0)
2. Split primary response into sentences
3. Compare each sentence against all sampled passages (5 scoring methods: BERTScore, QA, N-gram, NLI, LLM-Prompting)
4. Average scores — high inconsistency = likely hallucination

**Evidence:** Higher AUC-PR than grey-box methods. Fully black-box — no model internals needed.

**Source:** Manakul et al. (2023), EMNLP; github.com/potsawee/selfcheckgpt

**Ditto relevance:** Self-consistency is computationally expensive (N samples per output) but could be applied selectively — only for high-stakes outputs or when the confidence score is medium (uncertain but not clearly low). Maps to ensemble consensus review pattern, but with a factuality focus rather than quality focus.

---

### 3.3 Retrieval-Augmented Fact-Checking

**RARR (Retrofit Attribution using Research and Revision):**
- Decompose claims into verification questions → search → check agreement → revise if contradictions found
- Post-hoc pipeline: takes already-generated text and retrofits with attribution

**FActScore (Fine-grained Atomic Evaluation):**
- Break text into atomic facts → retrieve evidence per fact → verify each → score = % of supported facts
- ChatGPT achieves only 58% FActScore on biography generation
- Automated estimator: <2% error vs human annotation

**Source:** RARR: Gao et al. (2023), ACL; FActScore: Min et al. (2023), EMNLP

**Ditto relevance:** FActScore's atomic decomposition pattern is powerful — break output into independently verifiable claims, check each against known facts. For Ditto, the "knowledge source" is process memory + user corrections + connected data sources (integration layer). **The critic's job could be framed as computing a "DittoScore" — the percentage of claims in an output that are grounded in known facts from the process's data sources.**

---

### 3.4 Citation Verification

**SourceCheckup (Nature Communications, 2025):** Found that 50-90% of LLM responses are not fully supported by their cited sources.

**ACL 2024 finding:** Up to 57% of citations in grounded generation are "post-rationalized" — the model generates the claim first, then finds a citation to attach.

**Mechanical pipeline:** Claim extraction → source retrieval → passage matching → semantic analysis → verdict (supported/unsupported/contradicted)

**Source:** Nature Communications 2025; NVIDIA Citation Validation Tool; CiteAudit arXiv:2602.23452

**Ditto relevance:** When Ditto outputs cite data sources (e.g., "based on your supplier price list" or "from the last 5 quotes"), the harness should verify that the cited source actually supports the claim. Post-rationalized citations are a specific hallucination type that process-scoped memory could help detect — "the agent says this came from the price list, but the price list doesn't contain this item."

---

### 3.5 Semantic Entropy — Meaning-Level Uncertainty

**What it is:** Detects hallucinations by measuring uncertainty at the level of meaning, not token sequences. Standard entropy conflates linguistic variation with genuine uncertainty. Semantic entropy isolates the latter.

**How it works (Farquhar et al., Nature 2024):**
1. Sample K answers (K ≥ 5, temperature > 0)
2. Calculate token-sequence probabilities
3. Cluster responses by meaning (bidirectional entailment)
4. Aggregate probabilities within semantic clusters
5. Compute Shannon entropy over cluster probabilities
   - High semantic entropy = semantically different answers = likely confabulation
   - Low semantic entropy = convergence on one meaning = likely reliable

**Key distinction:** "Paris is the capital" and "The capital is Paris" → same cluster (low entropy). "Paris" and "Lyon" → different clusters (high entropy).

**Evidence:** Works across datasets and tasks without a priori task knowledge. Robustly generalizes.

**Source:** Farquhar et al. (2024), Nature 630, pp. 625-630

**Ditto relevance:** Semantic entropy could be computed selectively for high-stakes outputs. Generate N responses to the same step, cluster by meaning, compute entropy. High entropy = flag for human review. Low entropy ≠ correct (could be a systematic error), but high entropy = definitely uncertain. **This gives the trust gate a richer signal than binary confidence: "how much does the model agree with itself across samples?"**

---

### 3.6 Multi-Agent Cross-Checking

**DelphiAgent (2025):** Inspired by the Delphi method from decision science. Multiple LLM agents with distinct personalities independently judge claims, then share reasoning and revise through multiple rounds until consensus. Dual-system: evidence gathering separated from judgment.

**Evidence:** macF1 improvements up to 6.84% on RAWFC dataset.

**Source:** ScienceDirect 2025; Nature Scientific Reports 2026

**Ditto relevance:** The Delphi method (independent judgment → share reasoning → converge) is a richer version of ensemble consensus. The "distinct personalities" pattern maps to TripletCritic's multiple evaluative dispositions. **For Ditto, this suggests that review should involve not just one reviewer but potentially multiple reviewers with different dispositions (optimistic/pessimistic/analytical) — then converge.**

---

### 3.7 Knowledge Grounding — Detecting Claims Beyond Evidence

**FACTS Grounding (Google DeepMind, 2024):** 1,719 examples requiring long-form responses grounded in context documents up to 32K tokens. Responses judged factually accurate only if fully grounded with no hallucinations.

**EvidenceRL (2026):** RL approach optimizing evidence adherence using sentence-level entailment. On medical tasks, grounding scores rose from 47.6 to 78.2.

**Source:** deepmind.google/blog/facts-grounding; arXiv:2603.19532

**Ditto relevance:** Process memory + connected data sources are Ditto's "evidence base." Grounding means checking whether every claim in an output is supported by the evidence available to the process. The harness could compute a grounding score per output.

---

### 3.8 Tool-Based Verification — Active Fact-Checking

**FIRE (NAACL 2025):** Unified decision function that either outputs a verdict (if confident) or generates a search query (if uncertain). Iterative tool use with early termination. **Achieves comparable F1 while reducing LLM costs by 7.6x and search costs by 16.5x.**

**HaluGate (vLLM, 2025):** Token-level hallucination detection integrated into the inference serving layer:
1. Pre-classification: ModernBERT determines if prompt requires fact-checking (96.4% accuracy, ~12ms)
2. Token-level detection: binary classification per token (supported vs hallucinated)
3. NLI explanation: detected spans classified as CONTRADICTION/NEUTRAL/ENTAILMENT

Total overhead: 76ms P50, 162ms P99. Results via HTTP headers.

**Source:** FIRE: aclanthology.org/2025.findings-naacl.158; HaluGate: vllm.ai/blog/halugate

**Ditto relevance:** FIRE's iterative verification (check if confident → search if not → check again) is a lightweight pattern for the harness. HaluGate's conditional pre-classification is critical for efficiency — not every output needs hallucination detection. **The two-stage pattern (fast classifier to decide IF checking is needed + detailed check when it is) prevents the "check everything" overhead.**

---

### 3.9 Confabulation Detection — Specific Patterns

**Common confabulation types:**
- Entity hallucinations: fabricated people, companies, API names, version numbers
- Citation hallucinations: realistic-looking but nonexistent references
- Numeric fabrication: plausible-looking but invented statistics
- Biographical confabulation: mixing real attributes of different entities

**Real-Time Entity Hallucination Probes (2025):** Lightweight linear probes on hidden activations predict hallucinated entity tokens in real time. AUC 0.90 vs 0.71 for semantic entropy on Llama-3.3-70B. Generalizes to mathematical reasoning despite training only on entity hallucination.

**Key distinction:** Confabulations are both wrong AND arbitrary — sensitive to random seed. Systematic errors (consistent wrong answers) are different from confabulations (varying wrong answers). Semantic entropy specifically targets confabulations.

**Source:** arXiv:2509.03531; Nature 2024 (Farquhar et al.)

**Ditto relevance:** For Ditto's domain (business process outputs), the most common confabulation types would be: fabricated data references ("based on your price list" when no such data exists), invented statistics ("your approval rate is 94%" when not tracked), and mixed-entity confusion (attributing one customer's data to another). The Critic's accumulated knowledge should specifically track which types of confabulation each process/agent is prone to.

---

## Part 4: Cross-Cutting Patterns and Synthesis

### 4.1 Patterns to ADOPT (use the approach directly)

| Pattern | Source | What to adopt | Where in Ditto |
|---------|--------|---------------|----------------|
| **Reflexion verbal reinforcement** | Shinn et al. (NeurIPS 2023) | Store verbal reflections on failures in memory, inject into future runs | Process-scoped memory + context assembly |
| **CoVe Factor+Revise** | Meta (2023) | Decompose claims, verify independently, compare with original | New harness handler after step-execution |
| **Conditional pre-classification** | HaluGate (vLLM 2025) | Fast classifier to decide IF detailed checking is needed | Gate before hallucination detection |
| **Independent test generation** | AgentCoder (2023) | Verifier generates criteria independently of producer | Fresh-context review agents |

### 4.2 Patterns to ADAPT (the idea transfers, implementation differs)

| Pattern | Source | What to adapt | How it differs for Ditto |
|---------|--------|---------------|--------------------------|
| **Process reward models** | OpenAI (2023) | Step-level quality signals during multi-step execution | Ditto uses quality criteria per step, not a trained reward model |
| **Homeostatic regulation** | Keramati & Gutkin (eLife 2014) | Multi-variable balance rather than single-score maximization | Applied to process quality dimensions, not RL environment |
| **Distributional evaluation** | DeepMind/Nature (2020) | Maintain distribution of outcomes, not just mean | Quality evaluation as a distribution, not binary approve/reject |
| **Constitutional critique-revise** | Anthropic (2022) | Output critiqued against explicit principles, then revised | Principles = quality criteria + cognitive framework values |
| **FActScore atomic decomposition** | Min et al. (EMNLP 2023) | Break output into atomic claims, verify each | Claims checked against process memory + connected data |
| **TripletCritic multi-disposition** | TripletCritic (2024) | Multiple evaluative perspectives produce better outcomes | Different review dispositions per trust context |
| **Debate recursive decomposition** | Irving et al. (2018) | Zoom into contested sub-claims specifically | Targeted review of specific contested aspects |

### 4.3 Gaps — Original to Ditto

| Capability | Why it's a gap | What Ditto needs to build |
|------------|---------------|---------------------------|
| **Persistent critical knowledge accumulation** | No system combines accumulated failure patterns with runtime evaluation in a process orchestration context | Failure pattern memory that shapes future evaluation focus |
| **Homeostatic incentive model for process quality** | Homeostatic RL exists in robotics/RL, not in LLM agent orchestration | Multi-variable balance model applied to process quality dimensions |
| **Trust-integrated hallucination detection** | Hallucination detection systems are standalone; none integrates with progressive trust | Hallucination detection that contributes to trust evaluation |
| **Cross-process failure pattern correlation** | Per-output and per-process checking exists; cross-process pattern learning doesn't | L4 Awareness-level failure pattern correlation |

### 4.4 Key Research Findings for Ditto's Design

1. **Self-critique without external grounding fails.** Reflexion's caveat is the most important finding: self-reflection without external feedback degrades output. The Critic must have external grounding — user corrections, connected data, independent verification — not just "think about whether this is good."

2. **The verifier must be independent of the producer.** AgentCoder, CoVe's factored variant, and LLM-as-Judge bias research all converge: same-model, same-context evaluation is systematically biased. Different model, different context, independently generated criteria.

3. **Homeostatic > maximizing for incentives.** The reward hacking evidence (METR 2025) shows that single-score maximization creates gaming. Homeostatic regulation (maintain balance across dimensions) is safer and more aligned with Ditto's "quiet reliable team" principle.

4. **Conditional checking is essential for efficiency.** HaluGate's two-stage pattern (fast pre-classifier + detailed check) prevents the overhead of checking everything. Apply hallucination detection selectively based on confidence, trust tier, and output type.

5. **Step-level signals are more valuable than output-level signals.** PRM evidence: step-by-step verification dramatically outperforms final-output evaluation. The gap widens with complexity. Ditto should evaluate at each process step, not just the final output.

6. **Accumulated failure knowledge is the missing capability.** No production system combines persistent failure pattern memory with runtime evaluation in a multi-process context. This is the genuine gap the Critic insight identified — and it's confirmed by the research.

---

## Reference Doc Status

- **docs/landscape.md** — checked, no drift found. The new research areas (critic architectures, incentive mechanisms, hallucination detection) are not covered in the landscape doc. These are research-level capabilities, not framework evaluations — they don't need landscape entries until they inform specific component adoption decisions.
- **docs/adrs/014-agent-cognitive-architecture.md** — no drift, but findings on homeostatic incentives and step-level signals suggest extensions to the cognitive architecture's trust and learning integration.
- **docs/adrs/015-meta-process-architecture.md** — no drift. Findings on accumulated failure knowledge confirm the Feedback & Evolution meta process as the right home for critic capabilities.
