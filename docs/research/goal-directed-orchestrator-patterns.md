# Goal-Directed Orchestrator Patterns

Research into how existing agent frameworks implement goal decomposition, work-queue scheduling around blocked items, and confidence-based stopping conditions.

**Date:** 2026-03-21
**Status:** Active
**Consumers:** Phase 5 brief (orchestrator build-out), ADR-010 (orchestrator agent), Insight-045 (confidence-based stopping)

---

## 1. Goal Decomposition Patterns

### 1.1 Anthropic Orchestrator-Workers

**Sources:** [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents), [Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system), [Cookbook notebook](https://github.com/anthropics/anthropic-cookbook/blob/main/patterns/agents/orchestrator_workers.ipynb)

**How it works mechanically:**
- A lead agent (Claude Opus 4) uses extended thinking to analyze query complexity, determine subagent count, and define each subagent's role.
- Each subagent receives: an objective, an output format, guidance on tools/sources, and clear task boundaries.
- The lead spawns 3-5 subagents in parallel. Effort allocation is explicit: simple queries get 1 agent/3-10 tool calls; comparisons get 2-4 subagents/10-15 calls each; complex research uses 10+ subagents.
- Subagents store work in external systems and pass lightweight references back to the coordinator (not full results in context).
- The key distinction from parallelization: subtasks are not pre-defined but determined dynamically by the orchestrator based on the specific input.

**Stopping condition:**
- The lead agent "decides whether more research is needed" after each batch. If sufficient information is gathered, the system exits the research loop. No explicit metric -- the lead agent makes a judgment call.
- A CitationAgent runs as a final validation pass.

**Handling blocked/parallel work:**
- Current architecture is synchronous: the lead agent waits for each batch of subagents to complete before proceeding.
- Individual subagents execute 3+ tools in parallel within their own context.
- When tools fail, agents adapt: "letting the agent know when a tool is failing and letting it adapt works surprisingly well." Combined with retry logic and checkpoints for deterministic recovery.
- State persistence (memory saved to external systems before context limits) allows resumption rather than restart.

**Key pattern for Agent OS:** Dynamic decomposition with effort-calibrated subagents. The plan-then-fan-out-then-synthesize loop with a "sufficient?" judgment gate.

---

### 1.2 Manus AI Planner Module

**Sources:** [Technical investigation gist](https://gist.github.com/renschni/4fbc70b31bad8dd57f3370239dccd58f), [arxiv analysis](https://arxiv.org/html/2505.02024v1)

**How it works mechanically:**
- The Planner generates a plan as a numbered list with step descriptions and status markers, injected into the agent's context as a special "Plan" event.
- A `todo.md` file serves as a live checklist -- the agent explicitly updates it after each step, marking completions. This is the continuity mechanism across long-running tasks.
- Uses CodeAct pattern: instead of fixed tool APIs, the agent generates Python scripts as actions, giving a much wider action space.
- Strictly one tool action per iteration -- must await result before deciding next step. This prevents runaway sequences and allows monitoring.
- Three-layer architecture: Planning Layer (decomposition) -> Execution Layer (tool/API calls) -> Validation Layer (verify outputs).

**Stopping condition:**
- All plan steps reach completion status.
- Agent signals `TASK_COMPLETE` explicitly before returning final output, then enters idle state.

**Handling blocked/failed steps:**
- Iterative error recovery: diagnose from error message, retry with alternative method.
- Only as last resort: report to user that it cannot proceed.
- Plan can be updated on-the-fly if the task changes mid-execution.
- No parallel execution -- strictly sequential, one step at a time.

**Key pattern for Agent OS:** The file-based plan tracking (`todo.md`) as durable state that survives context loss. The `TASK_COMPLETE` explicit signal. The one-action-per-iteration discipline.

---

### 1.3 CrewAI Hierarchical Process

**Sources:** [CrewAI Hierarchical Process docs](https://docs.crewai.com/en/learn/hierarchical-process), [DeepWiki analysis](https://deepwiki.com/crewAIInc/crewAI/2.4-process-types), [Source: crew.py:397-451, 715-722](https://github.com/crewAIInc/crewAI)

**How it works mechanically:**
- A manager agent (configured via `manager_llm` or `manager_agent`) sits outside the worker agent pool.
- In hierarchical mode, tasks do NOT require explicit agent assignment -- the manager dynamically assigns tasks based on agent roles, goals, and capabilities.
- The manager allocates tasks, monitors execution, and validates results before proceeding.
- Delegation is disabled by default (must be explicitly enabled).
- The actual delegation mechanism is LLM-driven: the manager uses its own reasoning to determine which agent should handle which task.

**Stopping condition:**
- Configurable `max_iterations` limit.
- Configurable `max_requests_per_minute`.
- Manager validates task completion before moving on.

**Handling blocked/parallel work:**
- No documented mechanism for handling blocked workers.
- Known issues in the community with delegation failures (manager assigning to wrong agents).
- Sequential execution within the hierarchy -- no parallel worker execution documented.

**Key pattern for Agent OS:** The manager-outside-the-pool pattern (orchestrator is not a worker). Dynamic assignment based on capability matching. The validation gate between steps.

---

### 1.4 LangGraph Plan-and-Execute

**Sources:** [LangChain blog](https://blog.langchain.com/planning-agents/), [LangGraph tutorial](https://www.baihezi.com/mirrors/langgraph/tutorials/plan-and-execute/plan-and-execute/index.html), [ReAct comparison](https://dev.to/jamesli/react-vs-plan-and-execute-a-practical-comparison-of-llm-agent-patterns-4gh9)

**How it works mechanically:**
- State definition: `PlanExecute` holds `input` (user query), `plan` (list of steps), `past_steps` (list of `(action, observation)` tuples), and `response` (final output).
- Three nodes in a StateGraph: Planner, Executor, Replanner.
- **Planner**: LLM call that takes user input, generates a structured checklist of steps.
- **Executor**: Takes one step from the plan, invokes tools, returns observation. Can use a smaller/cheaper model.
- **Replanner**: After each execution, examines accumulated `past_steps` and either (a) refines the remaining plan or (b) produces the final response.
- Graph flow: `Input -> Planner -> Executor -> Replanner -> (loop back to Executor | end)`.
- Conditional edge from Replanner determines whether to continue or stop.

**Stopping condition:**
- The Replanner decides: if all steps are done and sufficient information exists, it produces a final response (routes to END). Otherwise, it generates an updated plan and routes back to Executor.
- This is an LLM judgment call, not a deterministic check.

**Handling blocked/parallel work:**
- Strictly sequential: one step at a time through the Executor.
- No native parallel execution of plan steps.
- Failed steps feed into `past_steps` context for the Replanner to reason about.

**Key pattern for Agent OS:** The Replanner as a gate between steps -- it can adapt the plan based on what has been learned. The `past_steps` accumulator as a running log. The ability to use different model tiers (expensive for planning, cheap for execution).

---

### 1.5 AutoGen Group Chat Manager

**Sources:** [AutoGen Group Chat](https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/design-patterns/group-chat.html), [Selector Group Chat](https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/selector-group-chat.html), [Termination docs](https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/tutorial/termination.html), [AG2 Orchestration Patterns](https://docs.ag2.ai/latest/docs/user-guide/advanced-concepts/orchestration/group-chat/patterns/)

**How it works mechanically:**
- Publish-subscribe messaging: `GroupChatMessage` (content on shared topic) and `RequestToSpeak` (manager prompts next speaker).
- Manager selects next speaker by constructing a prompt with conversation history + participant descriptions, then querying an LLM. Tracks previous speaker to prevent domination.
- Each participant subscribes to both the shared group topic and their individual topic.
- Strictly sequential: only one agent works at a time. Message -> manager selects next -> `RequestToSpeak` -> agent responds -> cycle repeats.
- Speaker selection strategies: round-robin, LLM-based selector, custom `selector_func` for state-based transitions.

**Stopping condition (richest taxonomy found):**
11 built-in termination conditions, composable with AND (`&`) and OR (`|`):
- `MaxMessageTermination` -- message count limit
- `TextMentionTermination` -- specific text detected (e.g., "TERMINATE")
- `TokenUsageTermination` -- token budget exhausted
- `TimeoutTermination` -- wall-clock duration
- `HandoffTermination` -- agent requests handoff to specific target (human or external system)
- `SourceMatchTermination` -- specific agent has responded
- `ExternalTermination` -- programmatic control from outside
- `StopMessageTermination` -- agent produces a `StopMessage`
- `FunctionCallTermination` -- specific function executed
- `FunctionalTermination` -- custom boolean expression evaluates to `True`

Conditions are stateful but auto-reset between runs. Custom conditions require implementing `__call__` (async, returns `StopMessage` or `None`), `reset()`, and `terminated` property.

**Handling blocked/parallel work:**
- No parallel execution -- sequential turn-taking only.
- `HandoffTermination` is the escalation mechanism: pauses the run, allows application or human to provide input.
- `ExternalTermination` allows external systems to stop execution.

**Key pattern for Agent OS:** The composable termination condition system is the standout. `HandoffTermination` as a first-class "blocked on human" signal. The ability to compose conditions with boolean logic. The `FunctionalTermination` for custom stopping expressions.

---

## 2. Work-Queue Schedulers That Route Around Blocked Items

### 2.1 Temporal Workflow Selectors

**Sources:** [Temporal Selectors (Go SDK)](https://docs.temporal.io/develop/go/selectors), [Temporal Go Samples](https://github.com/temporalio/samples-go), [Child Workflows](https://docs.temporal.io/child-workflows)

**How it works mechanically:**
- `workflow.Selector` is a deterministic alternative to Go's `select` statement. You register multiple operations (activity futures, channel receives, timers), then call `Select(ctx)` to block until one completes.
- **AddFuture()**: defer code until an activity completes.
- **AddReceive()**: listen for channel/signal messages.
- **AddTimer()**: time-based trigger.
- `Select(ctx)` blocks until any one registered operation completes, then executes its callback. Can be called multiple times in a loop to process completions as they arrive.

**Routing around blocked items -- the Split/Merge pattern:**
1. **Split**: Launch N activities in parallel, store each Future.
2. **Register all**: Add each Future to a Selector.
3. **Merge loop**: Call `selector.Select(ctx)` N times. Each call processes whichever activity finishes next, regardless of order.
4. If one activity is slow/blocked, others still get processed as they complete.

**Racing timers against activities (soft timeout):**
- Register both an activity Future and a Timer on the same Selector.
- If the activity completes first, cancel the timer and process the result.
- If the timer fires first, send a notification (e.g., "this is taking longer than expected") but do NOT cancel the activity -- it continues.
- This gives a "soft timeout" without errors or retries.

**Signal-based wake-up:**
- `workflow.Await(ctx, condition)` blocks until a boolean condition returns true. Evaluated on every state transition (signal received, activity completed, etc.).
- Signal handlers run concurrently with the main workflow via deterministic coroutine switching at await points.
- Child workflows can continue independently of parent (with `ABANDON` parent close policy).

**Key pattern for Agent OS:** The Selector's ability to process completions in any order is the core "route around blocked items" mechanism. The soft-timeout pattern (notify but don't cancel) maps directly to trust-based oversight. The signal-based wake-up for human input.

---

### 2.2 Inngest Step-Based Execution

**Sources:** [Inngest Steps](https://www.inngest.com/docs/learn/inngest-steps), [Step Parallelism](https://www.inngest.com/docs/guides/step-parallelism), [Inngest GitHub](https://github.com/inngest/inngest)

**How it works mechanically:**
- Each step is a separate HTTP request. Steps are wrapped in `step.run("id", async () => {...})`.
- **Memoization**: Step IDs are cache keys. When a function re-executes, completed steps are skipped using their memoized results. A counter tracks each unique step ID for loop support.
- **Re-execution pattern**: The entire function re-runs from the top on each step completion, but previously completed steps return their cached results instantly.
- **Parallelism**: Create step promises without awaiting, then `Promise.all()` to trigger simultaneous execution across separate HTTP requests. True parallelism on serverless (no shared state).

**What happens when one step is waiting:**
- `step.sleep()`: function does NOT run during sleep -- zero compute. Inngest handles scheduling.
- `step.waitForEvent()`: pauses until a matching event fires, returns event data.
- `step.waitForSignal()`: pauses until a specific signal arrives.
- **Critical insight**: A function run that is sleeping, waiting for an event, or paused between steps does NOT count against concurrency limits. Only actively executing steps count. This means many more runs can be in-progress than the concurrency limit suggests.
- Results collected via `Promise.all()`: `const [emailID, updates] = await Promise.all([sendEmail, updateUser])`. Total data from all steps must be under 4MB.

**Key pattern for Agent OS:** The memoization/replay model for durability. The distinction between "active compute" and "waiting" states for resource management. The `waitForEvent`/`waitForSignal` primitives for human-in-the-loop. Fan-out via `step.sendEvent()` for triggering other functions.

---

### 2.3 Trigger.dev Waitpoints

**Sources:** [Trigger.dev v4 GA](https://trigger.dev/launchweek/2/trigger-v4-ga), [Wait Until](https://trigger.dev/docs/wait-until), [Wait for HTTP Callback](https://trigger.dev/changelog/wait-for-http-callback)

**How it works mechanically:**
- **Waitpoint tokens**: `wait.forToken()` pauses a run until the token is completed (via API/SDK) or times out.
- **HTTP callbacks**: A URL is generated; when an external service POSTs to it, the waitpoint completes and the run resumes with the POST body as output.
- When a waitpoint duration exceeds 5 seconds, Trigger.dev automatically checkpoints the run (serializes state, stops compute billing).
- Resume happens when: HTTP callback arrives, manual dashboard trigger, or timeout expiration.
- Middleware hooks: `onWait` (cleanup before pause, e.g., close DB connections) and `onResume` (reinitialize after wake-up).

**Blocking relationships:**
- A single waitpoint can block multiple runs simultaneously.
- A single run can be blocked by multiple waitpoints.
- This enables complex dependency graphs.

**What happens to other work:**
- Other runs in the queue continue executing -- only the waiting run pauses.
- Priority-based queuing: critical work gets time-offset priority.
- Individual queues can be paused independently.
- Idempotency keys prevent duplicate work on retries.

**Key pattern for Agent OS:** The waitpoint-as-primitive concept -- a single abstraction that handles human approval, external service callbacks, and time-based delays. The `onWait`/`onResume` lifecycle hooks for resource management. The many-to-many blocking relationship.

---

### 2.4 Mastra Suspend/Resume

**Sources:** [Mastra Suspend and Resume](https://mastra.ai/docs/workflows/suspend-and-resume), [Human-in-the-Loop](https://mastra.ai/docs/workflows/human-in-the-loop), [DeepWiki analysis](https://deepwiki.com/mastra-ai/mastra/2.4-tool-system)

**How it works mechanically:**
- A step's `execute` function receives a `suspend` parameter. When `await suspend()` is called, the workflow pauses at that point.
- State is saved as a snapshot to the configured storage provider (persists across deployments and restarts).
- Resume via `run.resume({ step: 'step-id', resumeData: { ... } })`. If only one step is suspended, the step argument can be omitted.
- Conditional suspension pattern:
  ```typescript
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData?.approved) {
      return await suspend({})
    }
    // Continue with approved data
  }
  ```
- Semantic labels can be attached to suspension points for meaningful resume UX.
- Workflow state management allows data sharing between steps without passing through every step.

**Handling parallel branches:**
- Not documented. Suspension appears to pause the entire workflow at that step -- subsequent steps do not execute until the suspended step resumes.
- No mechanism for continuing other branches while one is suspended.

**Key pattern for Agent OS:** The `suspend()`/`resume()` as a first-class API within step execution. The conditional suspension pattern (check `resumeData`, suspend if missing). Snapshot-based state persistence across deployments. Semantic labels for suspension points.

---

## 3. Uncertainty/Confidence-Based Stopping Conditions

### 3.1 Anthropic's Agent Autonomy Measurement

**Source:** [Measuring Agent Autonomy](https://www.anthropic.com/research/measuring-agent-autonomy)

**How it works mechanically:**
- Autonomy is defined as "the degree to which an agent operates independently of human direction and oversight" -- an emergent property of deployment, not a fixed model trait.
- Measured via: turn duration, auto-approval rates, interrupt rates, tool call analysis.
- Claude Code stops itself to ask for clarification more often than humans intervene. On complex tasks, self-initiated stops are 2x more frequent than human interrupts.
- Breakdown of agent-initiated stops: proposing multiple approaches (35%), gathering diagnostic information (21%), clarifying vague requests (13%), requesting missing credentials/access (12%).

**The calibration pattern:**
- New users approve each action (~20% use full auto-approval).
- Experienced users use auto-approve in >40% of sessions but interrupt more often (9% vs 5%).
- The shift: from "approve before execution" to "monitor and intervene when needed."
- Key insight: "effective oversight doesn't require approving every action but being in a position to intervene when it matters."

**Key pattern for Agent OS:** The taxonomy of stop reasons maps directly to process harness gates: uncertainty about approach (propose alternatives), need more data (gather diagnostics), ambiguous intent (clarify), missing resources (blocked). These are four distinct escalation types, not one.

---

### 3.2 Trust or Escalate (ICLR 2025)

**Source:** [Trust or Escalate: LLM Judges with Provable Guarantees](https://arxiv.org/abs/2407.18370)

**How it works mechanically:**
- **Simulated Annotators**: K-shot prompt the model N times with different example sets. Each run simulates a different annotator's preferences.
- **Confidence estimation**: `confidence(x) = max_y (1/N) * sum(p(y|x; examples_j))` -- the maximum agreement ratio across simulated annotators. High agreement = high confidence.
- **Cascaded selective evaluation**: Start with cheapest model. If confidence >= threshold, trust the judgment. If not, escalate to a stronger model. If the final model lacks confidence, abstain entirely.
- **Threshold calibration**: Uses fixed-sequence testing on calibration data. For each candidate threshold, compute empirical disagreement risk with binomial upper confidence bounds. Select the lowest threshold where risk stays below target alpha.

**The cascade pattern:**
```
Instance -> Judge M1 (cheap)
  confidence >= λ1? -> Output prediction, STOP
  confidence < λ1?  -> Judge M2 (stronger)
    confidence >= λ2? -> Output prediction, STOP
    confidence < λ2?  -> ABSTAIN (escalate to human)
```

**Key insight:** Abstention correlates with human-perceived subjectivity, not shallow features. The system correctly identifies genuinely hard cases.

**Key pattern for Agent OS:** The cascaded confidence check with escalation is directly applicable to trust tiers. Cheap fast check first, expensive careful check only when uncertain, human only when both fail. The calibrated threshold (not arbitrary) with provable guarantees.

---

### 3.3 Multi-Tier Confidence Routing

**Sources:** [Confidence Thresholds for Reliable AI](https://briq.com/blog/confidence-thresholds-reliable-ai-systems), [Agent Failure Modes](https://galileo.ai/blog/agent-failure-modes-guide)

**How it works mechanically:**
- Four-tier routing based on confidence score:
  - **Very high confidence**: auto-process, no human involvement.
  - **Medium confidence**: auto-process but flag for sampling review (periodic audit).
  - **Low confidence**: route to human queue for explicit review.
  - **Very low confidence**: trigger alert for immediate attention.
- Different thresholds for different fields/decisions based on error consequences.
- The critical metric is **escalation accuracy**: how well does the agent know when to involve a human? False negatives (not escalating when it should) are worse than false positives (escalating trivially).

**Distinguishing blocked vs uncertain:**
- **Blocked on human input**: missing credentials, access tokens, approval needed -- the agent knows exactly what it needs but cannot obtain it.
- **Too uncertain to continue**: conflicting data, ambiguous intent, low confidence in approach -- the agent does not know the right answer.
- **Exception/error**: tool failure, API down, data corruption -- the system is broken, not uncertain.
- Each type routes differently: blocked -> specific request to human; uncertain -> present options and ask for guidance; error -> retry/escalate to ops.

**Key pattern for Agent OS:** The three-way distinction (blocked / uncertain / error) as distinct escalation types with different routing. The four-tier confidence routing with different oversight levels. The insight that escalation accuracy is the key metric.

---

### 3.4 LLM-as-Judge Self-Assessment

**Sources:** [Evidently AI guide](https://www.evidentlyai.com/llm-guide/llm-as-a-judge), [Langfuse evaluation docs](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge), [LangChain calibration](https://www.langchain.com/articles/llm-as-a-judge)

**How it works mechanically:**
- A separate LLM evaluates the output of a working LLM against criteria.
- Scores near decision boundaries (e.g., 4-6 on a 1-10 scale) are flagged as low-confidence and routed to humans.
- Common evaluation dimensions: correctness, helpfulness, harmlessness, relevance, coherence.
- Calibration: compare LLM judge scores against human ratings on a labeled dataset, then adjust thresholds to match human agreement rates.

**Practical implementation pattern:**
1. Agent produces output.
2. Judge LLM evaluates output on relevant dimensions.
3. If all scores are above threshold: proceed autonomously.
4. If any score is near boundary: flag for sampling review.
5. If any score is below threshold: route to human.
6. If judge itself expresses uncertainty ("I'm not certain"): always escalate.

**Key pattern for Agent OS:** The judge-as-separate-context pattern (fresh evaluation, not self-assessment within the same context). Boundary-aware routing (scores near thresholds get human review). The judge's own uncertainty as a meta-signal.

---

## Synthesis: Extracted Patterns

### Pattern 1: Plan-Track-Replan Loop
Every orchestrator follows the same core loop: decompose goal into steps, execute one/batch, evaluate results, replan or complete. The differences are in:
- **Granularity of replanning**: LangGraph replans after every step; Anthropic replans after each batch; Manus updates `todo.md` incrementally.
- **Model tiering**: LangGraph and Anthropic use expensive models for planning, cheap ones for execution.
- **State format**: LangGraph uses `past_steps` tuples; Manus uses a file-based checklist; Anthropic uses external memory stores.

### Pattern 2: The Selector/Completion-Order Processing
Temporal's Selector processes completions in whatever order they arrive, regardless of which was started first. Inngest achieves similar with `Promise.all()` on serverless. Both enable continued progress when individual items are blocked or slow.

### Pattern 3: Waitpoint as Primitive
Trigger.dev's waitpoint concept unifies human approval, external callbacks, and time delays under a single abstraction with many-to-many blocking relationships. Mastra's `suspend()`/`resume()` API provides the in-step developer experience for the same concept.

### Pattern 4: Composable Termination Conditions
AutoGen's 11 termination types with boolean composition (AND/OR) is the richest stopping condition system surveyed. The Trust or Escalate framework adds confidence-based conditions with calibrated thresholds. These are complementary: AutoGen provides the composition model, Trust or Escalate provides the calibration method.

### Pattern 5: Four-Way Escalation Taxonomy
Not "should we escalate?" but "what kind of stop is this?":
1. **Blocked**: knows what it needs, cannot obtain it (request specific input)
2. **Uncertain**: does not know the right approach (present options, ask for guidance)
3. **Error**: system failure (retry, then escalate to ops)
4. **Complete**: sufficient quality achieved (deliver result)

Each type has different routing, different UX, and different trust implications.

### Pattern 6: Cascaded Confidence with Calibrated Thresholds
From Trust or Escalate: cheap check first, expensive check only when uncertain, human only when both fail. Thresholds are calibrated against human agreement rates, not arbitrary.

### Pattern 7: Memoization for Durability
Inngest's replay model (re-run entire function, skip memoized steps) provides durability for long-running processes. Mastra's snapshot-based persistence survives deployments and restarts. Both address the same problem with different mechanisms (replay vs checkpoint).

---

## Mapping to ADR-010 System Agent Model

ADR-010 defines three distinct system agents for the meta-process layer. The patterns found map differently to each:

### Intake-Classifier (classify work item type)
- **Relevant patterns:** The cascaded confidence check (Pattern 6) applies directly — cheap keyword classification first, LLM classification when uncertain, human fallback when both are low confidence. This is already implemented in Brief 014b.
- **Not relevant:** Goal decomposition patterns (Section 1) — the classifier doesn't decompose, it categorises.

### Router (match work item to process)
- **Relevant patterns:** The four-way escalation taxonomy (Pattern 5) distinguishes "no matching process" (blocked) from "multiple possible processes" (uncertain). LLM-as-judge (Section 3.4) applies to confidence in routing decisions.
- **Not relevant:** Work-queue scheduling (Section 2) — the router makes a single dispatch decision, it doesn't manage ongoing execution.

### Orchestrator (decompose goals, track progress, spawn follow-up work)
- **Relevant patterns:** All of Section 1 (goal decomposition). All of Section 2 (work-queue scheduling around blocked items). Composable termination conditions (Pattern 4) for determining when a goal is achieved or when to stop.
- **Key distinction from Section 1 frameworks:** Most surveyed orchestrators (LangGraph, Manus, CrewAI) manage steps within a single process run. ADR-010's orchestrator manages work items across multiple processes — closer to Temporal's child workflow pattern (Section 2.1) where child workflows can run independently and the parent tracks completion.
- **The cross-process gap:** Only Temporal (child workflows with `ABANDON` parent close policy) and Inngest (fan-out via `sendEvent`) support spawning independent work across process boundaries. LangGraph, CrewAI, AutoGen, Manus, and Mastra all operate within a single execution context. This is the primary gap between surveyed patterns and ADR-010's orchestrator specification.
