# Phase 4 Composition Sweep — Implementation Pattern Extraction

**Date:** 2026-03-20
**Status:** Complete (reviewed — PASS WITH NOTES)
**Purpose:** Extract HOW existing projects implement capabilities Agent OS needs for Phase 4 (Workspace Foundation), not just that they exist.
**Triggered by:** Insight-031 — composition discipline weakened as architecture matured; 12 of 21 Phase 4 capabilities marked "Original" without proportional pattern extraction.

---

## Research Targets

Seven projects studied at implementation depth across six capability areas:

| Project | Language | Focus | Key Files Studied |
|---------|----------|-------|-------------------|
| **Open SWE** (langchain-ai) | Python | Agent assembly, safety-net middleware, harness composition | `/agent/server.py`, `/agent/prompt.py`, `/agent/middleware/*.py`, `/agent/webapp.py` |
| **Mastra** (mastra-ai) | TypeScript | LLM-as-router, suspend/resume, agent config, tool composition | `/packages/core/src/workflows/`, `/packages/core/src/agent/agent.ts`, `/packages/core/src/loop/network/` |
| **Inngest AgentKit** (inngest) | TypeScript | Agent networks, routing modes, tool composition, state management | `/packages/agent-kit/src/agent.ts`, `/packages/agent-kit/src/network.ts`, `/packages/agent-kit/src/tool.ts` |
| **CrewAI** (crewAIInc) | Python | Hierarchical routing, manager agent, task delegation | `/src/crewai/crew.py`, `/src/crewai/agent.py`, `/src/crewai/task.py` |
| **LangGraph** (langchain-ai) | Python | Supervisor pattern, graph interrupts, checkpointing | `/libs/langgraph/langgraph/pregel/main.py`, `/libs/langgraph/langgraph/graph/state.py` |
| **Claude Agent SDK** (Anthropic) | TS/Python | Hooks, subagent spawning, MCP tool loading, system prompt assembly | `claude-agent-sdk-typescript`, `.claude/agents/`, hooks system |
| **GitHub CLI + Linear CLI + clack** | Go/TS | Heterogeneous work surface, interactive workflows, CLI patterns | `pkg/cmd/status/status.go`, `@clack/prompts/src/`, `linear-cli/src/commands/` |

---

## Capability 1: Agent Assembly & Composition

How do projects compose identity + memory + tools + permissions into a ready-to-execute agent?

### Option A: Single-Function Assembly (Open SWE)

**File:** `/agent/server.py` — `get_agent(config: RunnableConfig) -> Pregel`

**How it works:**
1. Extract `thread_id`, repo details, issue context from `config["configurable"]`
2. Create/reconnect to sandbox via `create_sandbox()` with 180-second polling
3. Clone/pull repository in sandbox using authenticated credentials
4. Load `AGENTS.md` from repo root (reads via sandbox shell: `test -f {path} && cat {path}`)
5. Call `construct_system_prompt()` — concatenates 13 modular sections + AGENTS.md in XML tags
6. Configure model (Claude Opus 4.6, temperature=0, max_tokens=20000)
7. Bind 6 tools as list: `http_request, fetch_url, commit_and_open_pr, linear_comment, slack_thread_reply, github_comment`
8. Inject 4 middleware instances in execution order
9. Bind config via `.with_config(config)`

**Key detail:** Returns empty agent if `graph_loaded_for_execution()` returns False — graceful degradation.

**Pros:** Explicit, inspectable, single point where all context converges. Easy to test and debug.
**Cons:** Static tool set, Python-specific (LangGraph dependency).

### Option B: Multi-Source Tool Gathering (Mastra)

**File:** `/packages/core/src/agent/agent.ts` (193KB Agent class)

**How it works:**
Agent constructor receives a config object with optional factories:
```typescript
AgentConfig {
  id, name, description,
  model: LLMModel | LLMModel[],      // Single or fallback array
  instructions: string | Function,    // Dynamic or static
  tools: Tool[] | Factory,            // Direct or factory
  memory: Memory | Factory,
  workspace: Workspace | Factory,
  inputProcessors: Processor[],       // Pre-LLM message enhancement
  outputProcessors: Processor[],      // Post-LLM processing
  workflows: Workflow[],              // Embedded workflows
  scorers: Scorer[],                  // Evaluation
}
```

Tools assembled from 7 sources at invocation time:
1. `listAssignedTools()` — direct agent tools
2. `listMemoryTools()` — memory operations
3. `listWorkspaceTools()` — file/sandbox operations
4. `listSkillTools()` — workspace skills
5. `listAgentTools()` — sub-agent delegation (agents become callable tools)
6. `listToolsets()` — runtime tool injection
7. `listClientTools()` — browser/frontend tools

Each source wraps tools via `makeCoreTool()` enriching with execution ID, thread/resource context, logger, approval requirements.

**Sub-agent delegation:** Agents expose themselves as tools to parent agents. `stripParentToolParts()` sanitizes parent conversation history. `onDelegationStart` hook can accept/reject.

**Pros:** Extremely flexible multi-source composition. TypeScript native. Dynamic tools at runtime.
**Cons:** 193KB agent class — complex. Tight coupling to Mastra ecosystem.

### Option C: Named Agent Definitions (Claude Agent SDK)

**File:** `.claude/agents/*.md` — YAML frontmatter + markdown body

**How it works:**
```yaml
---
name: code-reviewer
description: Reviews code for quality
tools: Read, Glob, Grep
model: sonnet
permissionMode: default
maxTurns: 10
memory: project
---
You are a code reviewer. When invoked, analyze the code...
```

Agent definitions are scoped:
1. CLI flag `--agents` JSON (session-only, highest priority)
2. `.claude/agents/` (project-scoped, version-controlled)
3. `~/.claude/agents/` (user-scoped, all projects)
4. Plugin agents (lowest priority)

Subagents spawned with full isolation — don't inherit parent context. Tool access explicitly restricted per agent. Memory scoped to user/project/local.

**Pros:** Declarative, version-controlled, zero-code. Strong isolation model.
**Cons:** Claude-specific. No programmatic composition at runtime.

### Option D: Network-Based Composition (Inngest AgentKit)

**File:** `/packages/agent-kit/src/agent.ts`

**How it works:**
```typescript
Agent<T> configuration:
  name, description,
  system: string | (network: NetworkRun) => string,  // Dynamic prompts
  tools: Map<string, Tool>,
  model: Model,
  tool_choice: "auto" | "required" | "none",
  lifecycles: { onStart, onResponse, onFinish },
  mcpServers: external MCP tools,
  history: HistoryConfig for persistence
```

Agent execution loop:
1. Initialize MCP tools if configured
2. Resolve model (agent → network default → provided)
3. Create/use state and network context
4. Load historical context from thread
5. **Inference loop** (bounded by maxIter): call `performInference()` → `invokeTools()` → repeat while tool calls remain
6. Persist results to history storage
7. Emit completion events

**Pros:** TypeScript-first, MCP native, lifecycle hooks for injection, durable via Inngest.
**Cons:** Requires Inngest server infrastructure.

---

## Capability 2: Work Routing & Classification

How do projects route work to the right agent/process?

### Option A: LLM-as-Router with Schema (Mastra Networks)

**File:** `/packages/core/src/loop/network/index.ts`

**How it works:**
A **routing agent** is dynamically constructed that:
1. Receives current task context from conversation history
2. Knows all available primitives (agents, workflows, tools) with their schemas
3. Generates structured JSON: `{ primitiveId, prompt, reasoning }`
4. Selected primitive executes in isolation with filtered messages (`lastMessages: 0` prevents internal routing JSON leaking)
5. Optional completion scorer validates results (strategies: "all" = unanimous, "any" = single approval)
6. If incomplete + iterations remain → loop to routing

**Thread-based routing memory:** Results stored as JSON with `isNetwork: true` flag, distinguishing routing metadata from user conversations.

**Key detail:** Sub-agents never see routing metadata — messages filtered to prevent tool conflicts.

**Pros:** Flexible, handles novel scenarios, adapts to context. TypeScript native.
**Cons:** LLM call per routing decision (cost/latency). Quality depends on model capability.

### Option B: Three-Mode Routing (Inngest AgentKit)

**File:** `/packages/agent-kit/src/network.ts`, routing docs

**Three routing modes:**

1. **Code-Based (FnRouter):** Deterministic function receives `{ input, state, agentStack, results, iteration }` → returns `Agent | Agent[] | undefined`. Fastest — no LLM calls.

2. **Routing Agent (RoutingAgent):** AI inference selects from available agents. Invokes tools to select next agent + includes "done" tool to signal completion. Cannot have its own tools (routing agents are tool-free).

3. **Hybrid:** Code-based for initial steps, agent-based for flexible subsequent routing.

**Router interface:**
```typescript
Router.FnRouter<T>: (context) => Agent<T> | Agent<T>[] | undefined
```

**Pros:** Three modes cover all use cases. Code-based is fast and deterministic. TypeScript-first with type safety.
**Cons:** Sequential execution only (not concurrency-safe). Requires Inngest for durability.

### Option C: Hierarchical Manager Agent (CrewAI)

**File:** `/src/crewai/crew.py`

**How it works:**
Two process types:
- **Sequential:** Tasks execute in order, output becomes context for next
- **Hierarchical:** Creates a manager agent that coordinates task delegation based on agent roles/goals

Manager agent knows crew members' `role`, `goal`, `backstory` and delegates based on task requirements. Delegation is tool-based — agents can reassign tasks to peers via a delegation tool.

**Task guardrails:** Validators return `(bool, feedback)` tuple. Max 3 retries per guardrail. Metrics track `delegations`, `used_tools`, `tools_errors`.

**Pros:** Natural hierarchy maps to org structures. Role-based delegation is intuitive.
**Cons:** Python-only. Manager agent adds cost. Less flexible than schema-based routing.

### Option D: Graph-Based Dispatch (LangGraph)

**File:** `/libs/langgraph/langgraph/graph/state.py`, `/libs/langgraph/langgraph/pregel/main.py`

**How it works:**
Routing via three mechanisms:

1. **Conditional edges:** `graph.add_conditional_edges(source, path_function, path_map)` — function returns destination name
2. **Command objects:** Nodes return `Command(goto="next_node", update={...})` for programmatic routing
3. **Send pattern:** `Command(goto=Send("node", arg))` for map-reduce (same node executes multiple times with different inputs)

**Execution model:** Bulk Synchronous Parallel (BSP) — Plan → Execute (parallel) → Update (atomic) → repeat. Trigger-based dispatch: `trigger_to_nodes` mapping determines which nodes activate based on channel updates.

**Pros:** Powerful composition primitives. Send pattern for map-reduce. Full checkpoint/replay.
**Cons:** Python-only. Low-level — requires significant wiring. BSP model is complex.

---

## Capability 2b: Goal Decomposition (Orchestrator-Worker)

How do projects decompose goals into subtasks and coordinate execution?

### Option A: Orchestrator-Worker via Subagent Spawning (Anthropic Pattern)

**Source:** Anthropic engineering blog — multi-agent research system

**How it works (documented pattern, not code):**
- Lead **orchestrator agent** receives a complex goal (e.g., "Research how trust earning works across 10 platforms")
- Orchestrator decomposes into subtasks, spawns **worker subagents** for each
- Workers execute independently and return results
- Orchestrator synthesises results into final output

**Key characteristics:**
- Orchestrator decides decomposition strategy (parallel vs sequential, how many workers)
- Workers are independent — don't communicate with each other
- Orchestrator handles synthesis and quality checking
- This is a prompt-driven pattern, not an infrastructure pattern

**Mapping to Agent OS:** The orchestrator system agent (ADR-010) decomposes goal work items into task work items. Each task is routed to a process. The orchestrator tracks completion and synthesises progress.

### Option B: Send Pattern for Map-Reduce (LangGraph)

**File:** `/libs/langgraph/langgraph/types.py`

**How it works:**
```python
Command(goto=Send("worker_node", {"task": subtask}))
```
A single node can spawn multiple instances of the same worker node with different payloads. Results aggregate via channel reducers.

**Key detail:** The Send pattern is infrastructure-level — the graph runtime handles parallelism, result collection, and state aggregation. The orchestrator node just emits Send commands.

**Pros:** Clean separation of decomposition (orchestrator) from execution (workers). Built-in parallelism.
**Cons:** Python-only. Requires graph infrastructure.

### Option C: Network Iteration with Completion Scoring (Mastra)

**File:** `/packages/core/src/loop/network/index.ts`

**How it works:**
The routing agent can iteratively decompose work: route to first agent → get partial result → route to next agent → repeat until completion scorer approves. This is implicit decomposition — the router decides "this needs agent A first, then agent B."

**Completion validation:**
```typescript
completionConfig: {
  type: 'llm' | 'scorer',
  scorer?: Scorer,
  strategy: 'all' | 'any'
}
```

**Pros:** No explicit decomposition step needed — routing IS decomposition. TypeScript native.
**Cons:** Less transparent than explicit decomposition. Harder to track progress of sub-goals.

### Option D: Hierarchical Delegation (CrewAI)

**File:** `/src/crewai/crew.py` — `_run_hierarchical_process()`

**How it works:**
Manager agent receives task → decides which crew member handles it → crew member executes → result returns to manager → manager delegates next task. Manager knows crew members' roles, goals, and backstories.

**Task delegation tracking:** `delegations` counter, `increment_delegations(agent_name)`, `processed_by_agents` list.

**Pros:** Natural org hierarchy metaphor. Delegation tracking built in.
**Cons:** Python-only. Manager adds latency/cost per delegation.

### Known gap

No project implements goal decomposition with **goal ancestry tracking** (where every subtask carries the chain of parent goals explaining WHY it exists). Paperclip has the data model (`goals` + `issues` tables with parent references) but doesn't use an orchestrator agent to drive decomposition. This combination is Original to Agent OS.

---

## Capability 3: Human Step Suspend/Resume

How do projects pause execution for human input and resume?

### Option A: Snapshot-Based Suspend/Resume (Mastra)

**File:** `/packages/core/src/workflows/types.ts`, `/packages/core/src/workflows/default.ts`

**How it works:**
When a step calls `suspend({ message: 'Please confirm' })`:
1. Engine captures current state, step results, and suspend payload
2. Records suspended step IDs with execution path indices in `suspendedPaths` dict
3. Returns `'suspended'` status with payload for external storage

Resume flow:
```typescript
const result = await run.resume({
  step: stepId,
  label: resumeLabel,
  resumeData: resumeData
});
```
1. Accepts prior step results and resume payloads
2. Sets `resumePath` to continue from suspended points
3. Reconstructs ExecutionContext with accumulated state
4. **Key:** Continues from suspension point, does NOT re-execute completed steps
5. Resume path skips condition re-evaluation — goes directly to stored branch step

**State serialized:** `WorkflowRunState` tracks `suspendedPaths`, `waitingPaths`, `resumeLabels`, `forEachIndex`, full `stepResults`.

**Span continuity:** Includes `tracingContext` (traceId, spanId, parentSpanId) linking resumed spans as children of original suspended spans.

**Auto-resume option:** `autoResumeSuspendedTools: boolean` enables automatic resumption without manual intervention.

**Pros:** Clean separation of suspend/resume. Path-based resume avoids re-execution. Tracing continuity. TypeScript native.
**Cons:** Tied to Mastra's workflow execution engine.

### Option B: Interrupt + Checkpoint (LangGraph)

**File:** `/libs/langgraph/langgraph/types.py`

**How it works:**
```python
@frozen
class Interrupt:
    value: Any    # Data sent to client
    id: str       # Unique ID for resumption

# Resume with:
Command(resume=resume_value)
```

Node calls `interrupt(value)` → execution pauses → checkpoint saved → client receives interrupt data → client resumes with `invoke(resumption_input)`.

**State persisted via checkpoint backends:** memory, SQLite, PostgreSQL. Full channel state checkpointed per step. Supports time-travel debugging.

**Pros:** First-class interrupt mechanism. Multiple checkpoint backends. Time-travel debugging.
**Cons:** Python-only. Checkpoint infrastructure required.

### Option C: Streaming Events + Approval (Inngest AgentKit)

**File:** `/packages/agent-kit/src/streaming.ts`

**How it works:**
AgentKit publishes 7 event categories including dedicated HITL events: `hitl.requested_approval`, `hitl.resolved`. Client consumes events via callbacks: `onEvent()`, `onToolResult()`, `onStreamEnded()`.

Step-based durable execution via Inngest ensures operations survive crashes. `step.ai.wrap()` wraps LLM calls for retryability. Step results are memoized and replayed on retries.

**Pros:** Real-time streaming events. Durable execution. TypeScript-first.
**Cons:** Requires Inngest server. HITL is event-based, not state-machine-based.

---

## Capability 4: Safety-Net Middleware

How do projects enforce structural guarantees the LLM might miss?

### Option A: Ordered Middleware Chain (Open SWE)

**File:** `/agent/middleware/*.py`

**Four middleware layers in execution order:**

1. **ToolErrorMiddleware** (wraps tool execution): Catches exceptions → converts to structured `ToolMessage` with `{status: "error", message, type}` so LLM can self-correct instead of crashing

2. **check_message_queue_before_model** (before each model call): Retrieves pending messages from LangGraph store namespace `("queue", thread_id)` → processes three content formats (dicts with images, content lists, strings) → consolidates into single human message → deletes queue to prevent duplicates

3. **ensure_no_empty_msg** (after model call): If empty response → injects `no_op` tool call with "continue with the task." If text-only → injects `confirming_completion` tool if no recent tool confirmed completion. Forces agent to take action.

4. **open_pr_if_needed** (after agent finishes): Checks message history for `commit_and_open_pr` result → if none found, detects uncommitted changes → creates branch, commits, pushes, opens PR. Structural guarantee: agent ALWAYS produces a PR.

**Assembly:** Passed as list to `create_deep_agent(middleware=[...])`. Order matters.

**Pros:** Clean separation of concerns. Each middleware is single-purpose. Composable.
**Cons:** Python-specific. LangGraph-dependent.

### Option B: Pre/Post Processors (Mastra)

**File:** `/packages/core/src/agent/agent.ts`

**How it works:**
- `inputProcessors: Processor[]` — transform messages before LLM call
- `outputProcessors: Processor[]` — process output after LLM call + persist to memory
- `__runProcessInputStep()` — per-iteration observational memory

Phase-filtered execution enables selective processor application.

**Pros:** TypeScript native. Integrates with agent lifecycle.
**Cons:** Less granular than Open SWE's four-stage middleware.

### Option C: Hooks System (Claude Agent SDK)

**24 lifecycle events × 4 execution types:**

Events: SessionStart, SessionEnd, InstructionsLoaded, UserPromptSubmit, PreCompact, PostCompact, **PreToolUse** (can block), PostToolUse, PostToolUseFailure, PermissionRequest, SubagentStart, SubagentStop, Stop, StopFailure, TeammateIdle, TaskCompleted, ConfigChange, WorktreeCreate/Remove, Notification, Elicitation.

Execution types:
1. **Command** — shell script, receives JSON via stdin, exit 0=allow, exit 2=block
2. **HTTP** — POST to remote service with decision response
3. **Prompt** — LLM evaluates and returns allow/deny/ask
4. **Agent** — subagent spawned to validate with full tool access

`PreToolUse` hook returns:
```json
{
  "permissionDecision": "allow|deny|ask",
  "permissionDecisionReason": "explanation",
  "updatedInput": { "modified": "tool_input" }
}
```

**Regex-based matchers** on event names (e.g., "Edit|Write" matches both). Automatic deduplication of identical hooks.

**Pros:** Most granular of all systems. Can modify, block, or redirect operations. 4 execution types cover all scenarios.
**Cons:** Claude-specific. Configuration-heavy.

---

## Capability 5: CLI Patterns for Heterogeneous Work

How do production CLIs surface different work types in a unified terminal interface?

### Option A: Parallel Aggregation + Split Panel (GitHub CLI)

**File:** `pkg/cmd/status/status.go`

**How it works:**
`gh status` aggregates 4 heterogeneous item types fetched in parallel via `errgroup.Group`:
- `LoadNotifications()` (API call for mentions)
- `LoadSearchResults()` (GraphQL for assigned issues + PRs + review requests)
- `LoadEvents()` (REST for repo activity)

Rendered via `lipgloss` terminal layout as split-panel dashboard: left column (Issues + Review Requests), right column (PRs + Mentions), full width (Repository Activity).

**Key pattern:** Items are typed at load time but rendered in a unified table format. `StatusItem` struct provides minimal common fields (ID, Title, Type, Status).

**Command structure:** Entity-segregated (`gh issue <sub>`, `gh pr <sub>`) + aggregation commands (`gh status`, `gh search`) that bridge types.

**Format polymorphism:** All list commands support `--json`, `--csv`, `--table` via `Exporter` interface.

**TTY-aware:** `IOStreams.IsStdoutTTY()` gates interactive features. In pipe/JSON mode: plain output.

**Factory injection:** Every command receives `cmdutil.Factory` with HttpClient, IOStreams, Config, Prompter, Browser.

**Pros:** Production-proven at massive scale. Clean separation of entity types + aggregation layer.
**Cons:** Golang. Complex infrastructure.

### Option B: VCS-Aware Context + Search (Linear CLI)

**File:** `src/commands/issue/issue-list.ts`, `src/commands/issue/issue-start.ts`

**How it works:**
- Detects current git branch → extracts issue ID → uses as default context
- Interactive selection via `@cliffy/prompt Select.prompt()` with `search: true` for type-to-filter
- Commands accept argument OR prompt if missing (graceful fallback: `if (args.issueId) { use it } else if (Deno.stdin.isTerminal()) { prompt } else { error }`)
- Short aliases: `linear i` for `linear issue`

**Pros:** Context-aware. Clean interactive/non-interactive fallback.
**Cons:** Deno ecosystem. Relatively simple feature set.

### Option C: @clack/prompts Primitives

**File:** `packages/prompts/src/*.ts`

**Key primitives for Agent OS:**

1. **select** — single-choice with render states (submit, cancel, list_with_cursor)
2. **multiselect** — checkbox style with required validation
3. **autocomplete** — searchable filter with pre-selected value persistence
4. **group** — multi-step workflows where previous results pass to next prompt as `opts.results`
5. **task** — spinner-based task runner for async operations

**CommonOptions:** Every prompt accepts `signal: AbortSignal` for cancellation + `input/output` streams for testing.

**Pros:** TypeScript-native. Beautiful output. Composable primitives. Already recommended in landscape.md.
**Cons:** Node.js only. No layout engine (no split panels like lipgloss).

### Illustrative CLI Structure (Architect decides — not a recommendation)

The patterns above could compose into a structure like this, but the specific command tree is an architectural decision:

```
[root] (citty routing)
├── [aggregation command]    # Parallel load: work items + process health + review queue
├── [entity commands]        # Segregated by type (work items, reviews, processes)
│   └── [subcommands]        # list/create/complete with clack interactive + JSON fallback
└── [capture command]        # Quick input → routes via intake-classifier
```

Key implementation patterns to compose:
- Parallel data loading for aggregation (GitHub CLI `errgroup.Group`)
- Factory-injected dependencies (GitHub CLI `cmdutil.Factory`)
- Interactive-with-fallback (Linear CLI: accept arg OR prompt if TTY)
- Multi-step workflows (clack `group()` with result propagation)
- Format polymorphism (GitHub CLI `Exporter` for `--json`)

---

## Capability 6: System Prompt & Context Assembly

How do projects compose system prompts from multiple sources?

### Option A: 13-Section Concatenation + AGENTS.md (Open SWE)

**File:** `/agent/prompt.py` — `construct_system_prompt()`

Sections concatenated in order:
1. Working environment, 2. Task overview, 3. File management, 4. Task execution, 5. Tool usage, 6. Tool best practices, 7. Coding standards, 8. Core behavior, 9. Dependency management, 10. Communication formatting, 11. Code review guidelines, 12. Security guidance, 13. Commit/PR workflow.

AGENTS.md injected in XML tags: `<agents_md>...</agents_md>`.

### Option B: Hierarchical Rules + Memory (Claude Agent SDK)

Load order: managed policy → ancestor CLAUDE.md → `.claude/rules/` (conditional on file paths) → user rules → auto memory (first 200 lines of MEMORY.md).

**Path-specific rules:** YAML frontmatter with `paths: ["src/**/*.ts"]` — only load when editing matching files.

**Lazy loading:** Subdirectory CLAUDE.md files loaded on-demand when Claude reads files there.

### Option C: Dynamic Instructions Function (Mastra / Inngest)

Both support `instructions: string | Function` — function receives execution context and returns dynamic prompt. Enables context-aware prompt generation.

---

## Cross-Cutting: State Management Patterns (Summary Reference)

This table summarises approaches — implementation detail for each is in the relevant capability sections above (suspend/resume in Capability 3, routing state in Capability 2).

| Project | Approach | Persistence | Resume Model | Key File |
|---------|----------|-------------|--------------|----------|
| **Open SWE** | LangGraph store per thread | LangGraph backend | Thread-based via deterministic SHA-256 IDs | `/agent/webapp.py` |
| **Mastra** | WorkflowRunState with path tracking | Serialized via `__state` field | Path-based skip to suspended step | `/packages/core/src/workflows/default.ts` |
| **Inngest AgentKit** | State\<T\> per network run | HistoryConfig hooks (create/get/append) | Thread-based with server/client authority | `/packages/agent-kit/src/state.ts` |
| **LangGraph** | Channel state with reducers | Checkpoint backends (memory/SQLite/PG) | Checkpoint + Command(resume=value) | `/libs/langgraph/langgraph/checkpoint/base.py` |
| **CrewAI** | Task context propagation | Replay from specific task | Sequential replay | `/src/crewai/crew.py`|

**Agent OS's existing state model** (SQLite via Drizzle) most closely resembles the LangGraph checkpoint approach — serialized state per execution step with a single backend. Mastra's path-based resume is the most directly adaptable pattern for the human step executor.

---

## Summary: Extracted Patterns Mapped to Phase 4 Capabilities

The following tables map extracted patterns to Agent OS capabilities. These are factual mappings, not recommendations — the Architect decides which patterns to adopt, adapt, or reject.

### For Agent Assembly (Phase 4 harness)

| Pattern | Source | Adaptation for Agent OS |
|---------|--------|------------------------|
| Single-function assembly | Open SWE `get_agent()` | Agent harness assembly function: resolve identity → load agent+process memory → determine tools → check budget → inject into adapter. Already in architecture.md. |
| Multi-source tool gathering | Mastra 7-source pattern | Process-scoped tools + agent-scoped tools + integration tools + system tools merged at invocation time |
| Dynamic system prompt | Mastra/Inngest `instructions: Function` | System prompt assembled from: agent identity + process context + quality criteria + memory + harness instructions |
| Lifecycle hooks | Inngest `onStart/onResponse/onFinish` | Pre/post-execution hooks for memory injection, trust validation, feedback capture |

### For Work Routing (intake-classifier + router)

| Pattern | Source | Adaptation for Agent OS |
|---------|--------|------------------------|
| Three-mode routing | Inngest AgentKit | Code-based for known process matches, LLM-based for ambiguous routing, hybrid for progressive trust |
| Schema-driven selection | Mastra Networks | Available processes provided as schemas to router LLM — it generates `{ processId, prompt }` |
| Task guardrails | CrewAI | Validators on routing decisions: `(bool, feedback)` → retry if wrong |
| Routing memory | Mastra `isNetwork: true` | Track routing decisions separately from process execution for intake-classifier improvement |

### For Human Step Suspend/Resume (Phase 4b)

| Pattern | Source | Adaptation for Agent OS |
|---------|--------|------------------------|
| Path-based suspend/resume | Mastra | Suspend at step → serialize execution path + step results → resume skips completed steps |
| Structured suspend payload | Mastra `suspendPayload` | Human step includes: instructions, context, input_fields, timeout (per ADR-010) |
| Checkpoint persistence | LangGraph | Store execution state in SQLite for durability across heartbeats |
| HITL streaming events | Inngest AgentKit | Publish `hitl.requested_approval` event when human step surfaces |

### For Safety-Net Middleware (harness enhancement)

| Pattern | Source | Adaptation for Agent OS |
|---------|--------|------------------------|
| Ordered middleware chain | Open SWE 4-layer | Extend harness pipeline: add error normalization, empty-output guard, structural guarantees |
| Pre/post processors | Mastra | Input processors for memory injection, output processors for feedback capture |
| Hook system for interception | Claude Agent SDK | PreToolUse-style hooks for trust gate enforcement on external calls |

### For CLI (Phase 4a)

| Pattern | Source | Adaptation for Agent OS |
|---------|--------|------------------------|
| Parallel aggregation dashboard | GitHub CLI `gh status` | `status` command loads work items + process health + review queue in parallel |
| Entity-segregated + aggregation | GitHub CLI command structure | `work`, `review`, `process`, `capture` commands + unified `status` |
| Interactive with fallback | Linear CLI pattern | Accept ID argument OR prompt if TTY, error if piped |
| Multi-step workflows | clack `group()` | Work item creation: type → description → goal ancestry → priority |
| Searchable selection | clack `autocomplete` | Process selection, work item selection in large lists |
| Factory injection | GitHub CLI `cmdutil.Factory` | `CLIContext` with apiClient, io, config, prompter |
| Format polymorphism | GitHub CLI `Exporter` | `--json` output on all list commands |

---

## Gaps: What IS Genuinely Original

After this extraction, these Phase 4 capabilities remain genuinely original:

1. **Work item taxonomy (question/task/goal/insight/outcome)** — No project has this five-type taxonomy with lifecycle rules and goal ancestry. Paperclip has tickets + goals; nobody has insights/outcomes as first-class types.

2. **Meta-processes through own harness** — No project governs its own routing/classification through the same trust pipeline as user work. Mastra networks route but don't earn trust. CrewAI managers don't get reviewed.

3. **Unified task surface (review + action + goal-driven)** — No project unifies harness review outputs, human action steps, and goal-decomposed tasks in the same queue.

4. **Trust-governed routing** — Routing decisions going through trust tiers (intake-classifier starts supervised, earns trust in classification accuracy) is not implemented anywhere.

---

## Landscape Freshness Flags

The following landscape.md evaluations should be updated based on this research:

1. **Inngest AgentKit** — Not in landscape.md at all. Should be added as Tier 1. TypeScript, active, directly relevant routing + agent composition + durable execution.

2. **Mastra** — Listed but underestimates the network routing capability. Should note: LLM-as-router with schema-driven primitive selection, thread-based routing memory, completion scoring.

3. **Claude Agent SDK** — Listed as "JS SDK is CLI wrapper." This is outdated. The Agent SDK (`@anthropic-ai/claude-agent-sdk`) is a full programmatic orchestration SDK with async generator API, subagent spawning, 24 hook events, and MCP integration.

4. **Open SWE** — Listed with surface patterns. Should add: 4-layer middleware composition, thread-aware webhook routing, multi-mode authentication.

5. **CrewAI** — Listed as "wrong ecosystem." Should add: hierarchical routing with manager agent is a concrete pattern even if Python-only. Flow decorator pattern is relevant for event-driven process coordination.

---

## Provenance Notes

Every pattern cited in this report includes project name and file path. Patterns marked as "Adaptation for Agent OS" describe how the extracted implementation maps to Agent OS's architecture — they are not recommendations (that's the Architect's job).
