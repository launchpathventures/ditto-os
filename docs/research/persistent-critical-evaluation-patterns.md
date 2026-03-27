# Persistent Critical Evaluation of Agent Outputs

Research into how production multi-agent systems implement persistent critical evaluation of agent outputs. Covers seven distinct approaches: Constitutional AI, Process Reward Models, LLM-as-Judge, Debate frameworks, Multi-agent verification, Waymo's architecture, and Actor-Critic patterns.

**Status:** Complete
**Date:** 2026-03-25

---

## 1. Constitutional AI (Anthropic)

### What It Is

Constitutional AI (CAI) is a method for training AI systems to be harmless using AI-generated feedback rather than human labels for harmful outputs. The human role is reduced to authoring a set of principles (the "constitution") that govern the AI's behavior.

### Who Built It

Anthropic. Published December 2022 by Yuntao Bai et al. as "Constitutional AI: Harmlessness from AI Feedback."

### How It Works Mechanically

CAI operates in two phases:

**Phase 1 — Supervised Learning (Critique-Revision Loop):**
1. Start with an initial "helpful-only" model (trained via RLHF to be helpful but not specifically harmless).
2. Generate responses to red-team prompts (approximately 182K total: 42K human-written, 140K LLM-generated).
3. For each response, sample a principle from the constitution and ask the model to **critique** its own response according to that principle.
4. Ask the model to **revise** its response in light of the critique.
5. Repeat the critique-revision loop multiple times (the paper uses 4 revisions per prompt). Each iteration samples a different principle.
6. The final revised responses are paired with the original prompts and used to finetune the model via supervised learning.

The critique-revision pairs are formatted identically to prompt-response pairs, making the loop composable and repeatable.

**Phase 2 — Reinforcement Learning from AI Feedback (RLAIF):**
1. Sample pairs of responses from the Phase 1 finetuned model.
2. Present each pair to an AI model along with a subset of constitutional principles.
3. The AI evaluates which response (A or B) is higher quality and more aligned with the stated principles.
4. Train a **preference model** (reward model) from these AI-generated preference labels.
5. Use the preference model as the reward signal in an RL training loop (PPO), producing the final model.

The constitution itself is a set of human-written principles addressing specific concerns (e.g., "Is the answer encouraging violence?", "Is the answer truthful?"). Different principles are sampled at different stages. The AI uses chain-of-thought reasoning during both critique and preference evaluation.

### Evidence

- Models trained with CAI produce harmless but non-evasive responses that explain objections rather than refusing.
- Chain-of-thought style reasoning during both phases improves human-judged performance.
- Claude 3 (March 2024) incorporated CAI-based character training as part of its alignment process.
- By 2025, production systems combine CAI with RLHF and additional fine-tuning stages.

### Sources

- [Constitutional AI: Harmlessness from AI Feedback (arXiv)](https://arxiv.org/abs/2212.08073)
- [Anthropic Research Blog](https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback)
- [Constitutional AI & AI Feedback (RLHF Book)](https://rlhfbook.com/c/13-cai)
- [RLAIF: Reinforcement Learning from AI Feedback (Cameron Wolfe)](https://cameronrwolfe.substack.com/p/rlaif-reinforcement-learning-from)

---

## 2. Process Reward Models (OpenAI)

### What It Is

Process Reward Models (PRMs) evaluate the correctness of each intermediate reasoning step in a chain-of-thought solution, rather than only evaluating the final answer. They contrast with Outcome Reward Models (ORMs), which score only the end result.

### Who Built It

OpenAI. Published May 2023 by Hunter Lightman, Vineet Kosaraju, Yura Burda et al. as "Let's Verify Step by Step."

### How It Works Mechanically

**Outcome Reward Model (ORM):**
- Trained on (problem, full_solution, correct/incorrect) pairs.
- At inference, scores an entire solution trajectory with a single number.
- Provides no information about where errors occur.

**Process Reward Model (PRM):**
- Trained on step-level correctness labels. Each step in a solution is labeled as correct (+) or incorrect (-).
- At inference, scores every individual step, producing a sequence of step-level scores.
- For incorrect solutions, reveals the precise location of the first mistake.

**The PRM800K Dataset:**
- 800,000 step-level correctness labels on LLM-generated solutions to problems from the MATH benchmark.
- Human labelers annotated each step as positive, negative, or neutral.
- Approximately 75K solutions across 12K MATH problems.

**Training the Step-Level Labels (automated alternative):**
1. Generate approximately 15 solution trajectories per problem.
2. For each intermediate step, sample approximately 16 completions from that step forward.
3. Label step as positive (+) if any completion reaches the correct final answer.
4. Label step as negative (-) if all completions fail to reach the correct answer.
5. This Monte Carlo estimation provides automatic step-level labels without human annotation.

**Inference-Time Verification (Best-of-N Sampling):**
1. Given a math problem, generate N candidate solution paths (each a chain-of-thought with multiple steps).
2. Score each candidate using the PRM, which assigns a reward to every step.
3. Compute an aggregate score per candidate (e.g., product or minimum of step scores).
4. Select the candidate with the highest aggregate score as the final answer.
5. This can be parallelized: sampling and scoring hundreds of completions in batches adds minimal latency.

**A masking mechanism** ensures the model only predicts reward tokens ('+' or '-') by setting all other token probabilities to negative infinity, forcing binary step-quality decisions.

### Evidence

- The PRM-supervised model solves 78% of problems from a representative subset of the MATH test set.
- PRM strongly outperforms both ORM and majority voting when searching over large numbers of model-generated solutions.
- Performance scales with N: a 20.7% accuracy increase from N=1 to N=16, plateauing beyond 16 generations.
- Process supervision has an alignment benefit: it directly trains the model to produce chains-of-thought endorsed by humans.
- The performance gap between PRM and ORM widens as more solutions per problem are considered.

### Sources

- [Improving Mathematical Reasoning with Process Supervision (OpenAI)](https://openai.com/index/improving-mathematical-reasoning-with-process-supervision/)
- [Let's Verify Step by Step (arXiv)](https://arxiv.org/abs/2305.20050)
- [PRM800K Dataset (GitHub)](https://github.com/openai/prm800k)
- [Process Reward Models (Stephen Diehl)](https://www.stephendiehl.com/posts/process_reward/)
- [Math-Shepherd: Verify and Reinforce LLMs Step-by-Step (arXiv)](https://arxiv.org/pdf/2312.08935)

---

## 3. LLM-as-Judge Patterns

### What It Is

Using a strong LLM (typically GPT-4) as an automated evaluator to judge the quality of other LLMs' outputs. This replaces or supplements human evaluation, which is expensive and slow.

### Who Built It

LMSYS (UC Berkeley). Published June 2023 by Lianmin Zheng et al. as "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena." Presented at NeurIPS 2023.

### How It Works Mechanically

**MT-Bench Structure:**
- 80 high-quality multi-turn questions across 8 categories: writing, roleplay, extraction, reasoning, math, coding, knowledge I (STEM), knowledge II (humanities/social science).
- 10 questions per category, each with a two-turn conversation (initial question + follow-up instruction).

**Three Judge Implementations:**

1. **Pairwise Comparison:** The judge receives a question and two candidate answers simultaneously, determines which is superior or declares a tie. Scales quadratically with number of models.

2. **Single Answer Grading:** The judge assigns a numerical score (typically 1-10) to each response independently. More scalable but less discriminating between similar answers.

3. **Reference-Guided Grading:** For domains like math, a reference solution is provided to the judge to improve accuracy.

**Known Biases (with measured magnitudes):**

**Position Bias:**
- GPT-4 shows 65.0% consistency when answer positions are swapped (35% of judgments reverse).
- Claude-v1 shows 23.8% consistency (extremely position-sensitive).
- When position labels are renamed, Claude shows 56.2% consistency, revealing additional name bias favoring "Assistant A."

**Verbosity Bias:**
- Tested via "repetitive list attack" where responses are padded with redundant information.
- GPT-3.5 and Claude-v1: 91.3% failure rate (incorrectly prefer verbose responses).
- GPT-4: 8.7% failure rate (largely resistant).

**Self-Enhancement (Self-Preference) Bias:**
- GPT-4 favors its own outputs with a 10% higher win rate compared to human judgments.
- Claude-v1 favors its own outputs with a 25% higher win rate.
- Root cause identified: LLMs assign higher scores to text with lower perplexity (text that matches their own generation distribution). GPT-4 shows strongest self-preference bias with a score of 0.520 on an Equal Opportunity fairness metric.
- Some weaker models show reverse bias (underestimating own outputs).

**Math/Reasoning Limitations:**
- GPT-4 default prompts: 70% failure rate on math questions (14/20).
- With chain-of-thought prompting: 30% failure rate (6/20).
- With reference-guided methods: 15% failure rate (3/20).

**Agreement Rates with Humans:**
- GPT-4 pairwise comparison: 85% agreement with human experts (exceeds 81% human-human agreement).
- GPT-4 single-answer grading: 97% agreement (setup S1), 85% (setup S2, non-tied votes).
- Agreement approaches 100% when comparing models with large capability gaps (e.g., GPT-3.5 vs. LLaMA-13B), drops to approximately 70% for similar-capability models.
- When humans disagree with GPT-4, they deem GPT-4's reasoning reasonable in 75% of cases.

**Mitigation Strategies:**
- **Position bias:** Call judges twice with swapped positions; declare wins only when both calls agree. Or randomize positions across large-scale evaluations. Few-shot prompting improved GPT-4 consistency from 65.0% to 77.5%.
- **Self-preference:** Ensemble evaluation using multiple different models; decrease weight for a model evaluating text it generated.
- **Math errors:** Chain-of-thought prompting; reference-guided grading.

**Public Dataset:** 3K expert votes and 30K conversations with human preferences.

### Sources

- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (arXiv)](https://arxiv.org/abs/2306.05685)
- [Full HTML paper](https://arxiv.org/html/2306.05685v4)
- [Self-Preference Bias in LLM-as-a-Judge (arXiv)](https://arxiv.org/html/2410.21819v2)
- [Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge (arXiv)](https://arxiv.org/html/2410.02736v1)
- [Awesome LLMs-as-Judges Survey (GitHub)](https://github.com/CSHaitao/Awesome-LLMs-as-Judges)

---

## 4. Debate Frameworks

### What It Is

A proposed AI safety technique where two AI agents engage in adversarial debate about a question, and a human (or weaker AI) judge evaluates which debater provided the most truthful and useful information. The structure incentivizes honesty because it is theoretically harder to sustain a lie under adversarial cross-examination than to refute one.

### Who Built It

Originally proposed by Geoffrey Irving, Paul Christiano, and Dario Amodei (then at OpenAI) in May 2018. Subsequently developed by Anthropic (with NYU collaboration) from 2023 onward.

### How It Works Mechanically

**The Debate Game:**
1. Both agents receive an identical question.
2. Each agent states an initial answer (may differ or agree).
3. Agents take turns making short statements, up to a fixed limit of rounds.
4. A human judge evaluates which agent provided the most true, useful information.
5. The game is zero-sum: one agent wins, the other loses.

**Recursive Debate:**
- When agents disagree on a point, the debate "zooms in" on that specific contested claim rather than exploring multiple argument branches.
- Only a single branch is debated at a time; the human judge adjudicates only the final sub-problem.
- This compression allows short debates to access information from exponentially larger argument trees.

**Equilibrium Properties:**
- The theoretical claim: honest behavior is a Nash equilibrium because deception becomes vulnerable to the opponent's refutations.
- Core assumption: "it is harder to lie than to refute a lie."
- Complexity-theoretic result: optimal play in the debate game with polynomially many steps solves any PSPACE problem.

**Anthropic's Experimental Setup (2023-2024):**
- Expert LLM debaters are shown excerpts from science fiction stories and asked comprehension questions.
- Each debater offers an answer and defends it over multiple rounds while arguing against the opponent's answer.
- A non-expert judge (human or weaker LLM) evaluates the arguments.
- Information asymmetry: debaters have access to source material that the judge does not.

### Evidence

- **MNIST experiment (Irving et al. 2018):** A classifier achieving 59.4% accuracy improved to 88.9% with debate using just 6 revealed pixels. The honest player wins at rates substantially exceeding random performance.
- **Anthropic 2024 results:** When LLMs were trained to be persuasive, non-expert LLM judges achieved 76% accuracy (vs. 48% naive baseline). Non-expert human judges achieved 88% accuracy (vs. 60% baseline).
- **Scalable oversight (Kenton et al. 2024):** Large-scale evaluation across 9 tasks (approximately 5 million model generation calls) found debate consistently outperforms consultancy (where only one agent advises the judge).
- **Debate vs. consultancy:** Debate showed improvements across mathematics, coding, logic, and multimodal reasoning tasks, not just extractive QA.
- Human image-based debate experiments showed "it is extremely difficult to lie" when opponents can directly challenge claims through pixel revelation.

### Sources

- [AI Safety via Debate (arXiv)](https://ar5iv.labs.arxiv.org/html/1805.00899)
- [Anthropic Fall 2023 Debate Progress Update (Alignment Forum)](https://www.alignmentforum.org/posts/QtqysYdJRenWFeWc4/anthropic-fall-2023-debate-progress-update)
- [Debate May Help AI Models Converge on Truth (Quanta Magazine)](https://www.quantamagazine.org/debate-may-help-ai-models-converge-on-truth-20241108/)
- [On Scalable Oversight with Weak LLMs Judging Strong LLMs (NeurIPS 2024)](https://arxiv.org/html/2407.04622v2)
- [Debate Helps Weak-to-Strong Generalization (AAAI 2025)](https://arxiv.org/html/2501.13124v1)

---

## 5. Multi-Agent Verification

### What It Is

Systems where multiple specialized agents cross-check each other's work through structured roles, iterative feedback loops, and independent verification. Applied primarily in code generation, but the pattern generalizes.

### Who Built It

Multiple teams: Tsinghua/Brown (ChatDev, 2023), DeepWisdom (MetaGPT, 2023), Huang et al. (AgentCoder, 2023).

### How It Works Mechanically

**ChatDev — Role-Based Waterfall with Cross-Checking:**
1. Phases: Design, Coding, Testing. Each phase has role pairs (instructor + assistant).
2. Roles: CEO (requirements), CTO (architecture), Programmer (implementation), Reviewer (code quality), Tester (execution validation).
3. **Chat Chain:** Two agents engage in multi-turn dialogue within each phase, working until consensus.
4. **Code Review (static):** Reviewer identifies issues; most frequent are "Method Not Implemented" (34.85%) and "Module Not Imported." Programmer iteratively fixes until no further suggestions.
5. **Testing (dynamic):** Compiler feedback drives Tester-Programmer interactions. Most common errors: ModuleNotFound (45.76%), NameError, ImportError.
6. **Termination:** A subtask ends after two unchanged code modifications or 10 communication rounds.
7. **Memory:** Short-term memory within phases; long-term memory transmits extracted solutions (not full conversations) across phases to avoid context overflow.
8. **Communicative dehallucination:** Deliberate role reversal where assistants proactively request detailed specifications before responding.

**MetaGPT — SOP-Structured Agents:**
1. Encodes Standard Operating Procedures (SOPs) into prompts to structure agent interactions.
2. Uses intermediate structured outputs (design documents, API specs) between phases.
3. 5 agents total; feedback loops present but weaker than ChatDev.
4. Generated tests were only approximately 80% accurate on HumanEval.

**AgentCoder — Independent Test Generation:**
1. Three agents: Programmer Agent, Test Designer Agent, Test Executor Agent.
2. **Key separation:** Test Designer generates test cases independently from the Programmer, based only on requirements. This ensures objectivity — the test suite is not influenced by the implementation.
3. **Iterative loop:** Programmer generates code; Test Designer generates tests; Test Executor runs tests against code; failures are fed back to Programmer for revision.
4. Agents can be individually updated or replaced with different models.
5. The independence of test generation is the central architectural insight — it prevents the common failure mode where tests are written to match the code rather than the specification.

### Evidence

- ChatDev: Role-based multi-turn dialogue reduces coding errors through structured cross-checking. Termination heuristics prevent infinite loops.
- MetaGPT: Structured intermediate outputs increase success rate of target code generation, but weak feedback loops limit test quality (approximately 80% test accuracy).
- AgentCoder: Separating test generation from code generation produces more objective and comprehensive test suites. The framework outperforms single-agent approaches and systems with coupled test-code generation.
- SWE-bench Verified: State-of-the-art automated program repair systems achieve median resolve rates around 50%, with maximums exceeding 75%, using multi-agent collaboration patterns.

### Sources

- [ChatDev: Communicative Agents for Software Development (ACL 2024)](https://arxiv.org/html/2307.07924v5)
- [MetaGPT: Meta Programming for Multi-Agent Collaboration (ICLR 2024)](https://arxiv.org/pdf/2308.00352)
- [AgentCoder: Multi-Agent Code Generation (arXiv)](https://arxiv.org/abs/2312.13010)
- [Code in Harmony: Evaluating Multi-Agent Frameworks (OpenReview)](https://openreview.net/pdf?id=URUMBfrHFy)
- [SWE-bench Verified (OpenAI)](https://openai.com/index/introducing-swe-bench-verified/)

---

## 6. Waymo's Driver/Simulator/Critic Architecture

### What It Is

A three-component AI architecture for autonomous driving where a Driver generates driving trajectories, a Simulator creates realistic test scenarios, and a Critic evaluates driving quality — all powered by the same underlying foundation model. The Critic continuously evaluates the Driver's outputs and feeds improvements back through the Simulator.

### Who Built It

Waymo (Alphabet). Published December 2025 in their "Demonstrably Safe AI" report.

### How It Works Mechanically

**The Waymo Foundation Model:**
All three components (Driver, Simulator, Critic) are powered by the same foundation model, creating a unified knowledge-sharing architecture.

**Think Fast / Think Slow Architecture (Driver):**
- **Sensor Fusion Encoder ("Think Fast"):** Fuses camera, lidar, and radar inputs over time. Produces objects, semantics, and rich embeddings for rapid driving decisions. Handles routine, fast-reaction scenarios.
- **Driving VLM ("Think Slow"):** Uses rich camera data, fine-tuned on Waymo's driving data and trained using Gemini. Leverages extensive world knowledge for understanding rare, novel, and complex semantic scenarios.
- Both feed into the World Decoder for behavior prediction, mapping, and trajectory generation.

**The Critic — Two-Tier Evaluation:**
- **Teacher Models:** Generate high-quality evaluation signals. Used for training Student models and automatically building rich evaluation datasets. Proactively identify subtle edge cases and stress-test the Driver.
- **Student Models:** Analyze driving logs to identify interesting or problematic scenarios and provide nuanced feedback on driving quality. Distilled from Teacher models for deployment efficiency.

**The Simulator:**
- Transforms real-world scenes into high-fidelity, multi-modal dynamic worlds.
- Generates synthetic sensor data (cameras and lidar) from compact structured world representations.
- Global scene elements controlled by text-based prompts (weather, time of day).
- Dynamic elements use semantic conditioning for other road users and traffic lights.
- Enables massive-scale testing across diverse and challenging scenarios.

**The Outer Learning Loop:**
1. Driver operates autonomously in the real world.
2. Critic automatically flags suboptimal driving behavior from fully autonomous experience.
3. Improved alternative behaviors are generated as training data for the Driver.
4. Simulator rigorously tests these improvements across diverse scenarios.
5. Critic verifies the fixes actually work.
6. Safety framework confirms no unreasonable risk exists.
7. Enhanced Driver deploys to the real world.
8. Loop repeats.

**Onboard Validation Layer:**
A separate, rigorous validation layer verifies the trajectories produced by the Driver's generative ML model at runtime. This is distinct from the Critic — it operates in real-time on the vehicle, not in the offline evaluation loop. The model's compact, materialized structured representations (objects, semantic attributes, roadgraph elements) enable correctness and safety validation at inference time.

### Evidence

- The architecture is deployed in Waymo's production autonomous vehicles operating on public roads.
- The Critic-driven feedback loop operates on data from fully autonomous driving experience (no safety driver).
- The Waymo World Model (Simulator component) generates multi-sensor outputs matching real-world sensor characteristics.
- The shared foundation model enables knowledge transfer between all three components.

### Sources

- [Demonstrably Safe AI For Autonomous Driving (Waymo Blog, Dec 2025)](https://waymo.com/blog/2025/12/demonstrably-safe-ai-for-autonomous-driving/)
- [The Waymo World Model (Waymo Blog, Feb 2026)](https://waymo.com/blog/2026/02/the-waymo-world-model-a-new-frontier-for-autonomous-driving-simulation/)
- [Introducing EMMA (Waymo Blog, Oct 2024)](https://waymo.com/blog/2024/10/introducing-emma/)
- [AI and ML at Waymo (Waymo Blog, Oct 2024)](https://waymo.com/blog/2024/10/ai-and-ml-at-waymo/)

---

## 7. Actor-Critic in RL and Application to LLM Agents

### What It Is

The actor-critic architecture is a foundational reinforcement learning pattern where an "actor" selects actions (policy) and a "critic" evaluates those actions (value function). The critic's feedback guides the actor toward better decisions. Recent work applies this pattern to LLM-based multi-agent systems at inference time (not training), using LLM agents as both actors and critics.

### Who Built It

Classic actor-critic: Konda & Tsitsiklis (2000), building on Sutton (1984). LLM adaptation: Sun et al. (LLaMAC, 2023).

### How Classic Actor-Critic Works Mechanically

**Components:**
- **Actor (Policy, pi_theta):** A differentiable stochastic policy that selects actions given states. Does not iterate over all possible actions — selects directly.
- **Critic (Value Function, Q_w):** Evaluates the quality of actions taken. Provides feedback ("criticism") via bootstrapping rather than serving as the primary decision-maker.

**The Update Loop:**
1. Actor takes action *a* in state *s*.
2. Environment returns reward *r* and next state *s'*.
3. Compute temporal difference (TD) error: delta = r + gamma * Q_w(s', a') - Q_w(s, a). This measures how much actual reward plus discounted future value exceeds the critic's current estimate.
4. Update Critic: w <- w + alpha_w * delta * grad(Q_w(s,a)). Adjusts value estimates toward better bootstrapped targets.
5. Update Actor: theta <- theta + alpha_theta * delta * grad(ln pi_theta(s,a)). Reinforces actions when delta is positive (better than expected), suppresses when negative (worse than expected).

**Key Property:** The critic reduces variance compared to pure policy-gradient methods (e.g., REINFORCE), which rely on high-variance cumulative episode rewards. The critic provides a denser, lower-variance signal.

### How It Applies to LLM Agents at Runtime

**LLaMAC (Large Language Model-based Actor-Critic):**

Architecture: Centralized Critic with Decentralized Actors (CCDA).

- **Actors:** Individual LLM agents that interact with the environment and take actions.
- **TripletCritic:** Three LLM-based critics rather than one:
  1. **Exploration-focused critic:** Prioritizes long-term gains.
  2. **Exploitation-focused critic:** Emphasizes short-term returns.
  3. **Assessor:** Reconciles the two critics through Veracity Scrutiny (checking strategies for errors) and Belief Correction (balancing exploration-exploitation tradeoffs).

**Runtime Flow:**
1. Critic receives current state information and extracts relevant details from decision memory.
2. Exploration and exploitation critics generate competing action suggestions.
3. Assessor evaluates consistency between the two critics' suggestions.
4. Unified suggestions are sent to actors.
5. Actors perform **Plan Confirmation** to validate suggestions. If issues arise, actors generate feedback.
6. Assessor uses actor feedback to revise suggestions iteratively, reducing unnecessary LLM calls.

**Decision Memory:**
- Short-term: Most recent environmental state.
- Long-term: Historical trajectories (most recent L steps of state transitions, actions, and rewards).

**Key Difference from Classic RL:**
LLaMAC operates through natural language dialogue rather than gradient-based optimization. It requires no training — it uses prompt-based reasoning with integrated feedback loops for continuous improvement during inference. The "learning" happens within the context window, not through weight updates.

### Evidence

- LLaMAC achieves 100% success rate on complex grid transportation tasks where baselines (including multi-agent debate) achieve 0% in hard scenarios.
- Completes tasks in fewer steps with significantly reduced token consumption.
- The TripletCritic design (inspired by distributed dopamine neuron encoding) handles exploration-exploitation tradeoffs that single-critic designs cannot.
- External feedback loops between actors and critic correct spatial reasoning errors that persist in single-pass approaches.
- Scales to 50+ agents in resource allocation tasks with stable performance.

### Sources

- [Actor-Critic Methods (RL Notes)](https://gibberblot.github.io/rl-notes/single-agent/actor-critic.html)
- [LLaMAC: Controlling LLM-based Agents for Large-Scale Decision-Making (arXiv)](https://arxiv.org/html/2311.13884v3)
- [The Lighthouse of Language: Enhancing LLM Agents via Critique-Guided Improvement (arXiv)](https://arxiv.org/html/2503.16024)
- [When LLMs Grow Hands and Feet: Agentic RL Systems](https://amberljc.github.io/blog/2025-09-05-agentic-rl-systems.html)
- [Teaching Language Models to Critique via Reinforcement Learning (arXiv)](https://arxiv.org/html/2502.03492v1)
