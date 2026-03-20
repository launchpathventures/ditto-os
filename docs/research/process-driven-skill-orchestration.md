# Research Report: Process-Driven Skill Orchestration

**Date:** 2026-03-19
**Research question:** Can processes and their harnesses automatically drive skill/agent invocation, removing the need for non-technical users to manually invoke slash commands or skills?
**Triggered by:** User observation that running slash commands is "a headache and confusing" even for technical users

---

## Context

Agent OS currently has two distinct orchestration models:

1. **The engine** (`src/engine/heartbeat.ts`) — automatically drives process execution. Process YAML declares steps with `executor` types and `agent_role`. The heartbeat resolves dependencies, the harness pipeline wraps each step with memory → execution → review → trust → feedback. The user never manually selects which agent runs. The process definition governs everything.

2. **The dev skills** (`.claude/commands/dev-*.md`) — manually invoked slash commands (`/dev-pm`, `/dev-researcher`, etc.). The human must know which role to invoke, when, and in what order. Each skill ends with explicit handoff instructions like "Next step: invoke `/dev-architect`."

The research question is whether model #1 (automatic, process-driven) effectively eliminates the need for model #2 (manual skill invocation) — and how existing systems approach this.

---

## Finding 1: The Architecture Already Answers "Yes"

The Agent OS architecture spec (architecture.md) already describes a system where processes drive agent selection automatically:

- **Process definitions** declare each step's executor type (`ai-agent`, `script`, `human`) and `agent_role` (planner, builder, reviewer, etc.)
- **The heartbeat** automatically sequences steps based on dependency resolution
- **The harness pipeline** automatically applies review patterns, trust gates, and feedback capture
- **The agent harness** automatically assembles identity, memory, tools, and permissions before each invocation
- **The trust gate** automatically determines whether output needs human review

A non-technical user's interaction in this model is: **trigger a process → review outputs when prompted → approve/edit/reject**. They never need to know about skills, slash commands, or agent roles.

**Source:** `src/engine/heartbeat.ts` (fullHeartbeat loop), `src/engine/harness.ts` (pipeline), `processes/feature-implementation.yaml` (step declarations)

---

## Finding 2: The Dev Skills Are an Intentional Manual Precursor

The current manual skill system is explicitly designed as a temporary dogfooding pattern, not the end state:

> "These role contracts are the manual precursor to the automated harness."
> — `docs/dev-process.md:168`

> "The transition from skills to harness is a trust decision, not an architecture decision. Skills rely on AI discipline + human oversight. The harness enforces mechanically."
> — `docs/dev-process.md:180`

The mapping is already documented:

| Role Contract Element | Future Harness Equivalent |
|---|---|
| Purpose statement | Agent system prompt |
| Constraints (MUST NOT) | Harness enforcement rules (L3) |
| Required inputs | Process step inputs (L1) |
| Expected outputs | Process step outputs (L1) |
| Handoff protocol | Step sequencing + dependency resolution (L2) |
| "Fresh context" requirement | Session management policy (L2) |
| Automated checks | Executable quality criteria (L3) |

**Source:** `docs/dev-process.md:166-182`

---

## Finding 3: How Existing Systems Handle Automatic Orchestration

### Option A: LLM-as-Router (Mastra Agent Networks)

Mastra's `.network()` transforms any agent into a routing agent that automatically delegates to sub-agents, workflows, and tools. The routing agent reads **descriptions and input schemas** of all registered primitives and uses LLM reasoning to select the most specific match.

- **User interaction:** State your goal to a single entry point
- **Routing mechanism:** LLM reads descriptions + schemas, reasons about which primitive fits
- **Pros:** Flexible, handles ambiguous requests, single natural-language entry point
- **Cons:** Non-deterministic routing, quality depends on description quality, expensive (router call per decision), harder to audit
- **Provenance:** Mastra Agent Networks (mastra.ai/docs/agents/networks)

### Option B: Manager Agent with Declarative Config (CrewAI Hierarchical)

CrewAI's hierarchical process mode creates a manager agent that reads worker agents' `role` and `goal` fields from YAML configuration and dynamically assigns tasks.

- **User interaction:** Define the crew's goal; manager handles decomposition and delegation
- **Routing mechanism:** Manager LLM matches task requirements to agent role/goal declarations from YAML
- **Pros:** Declarative config separates concerns, manager handles ambiguity, YAML is human-readable
- **Cons:** Someone must author the YAML, manager LLM adds cost and latency, limited to what the manager can reason about
- **Provenance:** CrewAI Hierarchical Process (docs.crewai.com/en/learn/hierarchical-process)

### Option C: Graph Topology + Conditional Routing (LangGraph)

LangGraph defines agent orchestration as a graph with nodes (agents) and edges (routing logic). Edges can be conditional (developer-defined routing functions) or LLM-supervised (a supervisor node routes to specialist nodes).

- **User interaction:** Single entry point; graph topology handles flow
- **Routing mechanism:** Deterministic graph structure + optional LLM supervisor for dynamic dispatch
- **Pros:** Predictable flow from graph structure, LLM flexibility where needed, supports interrupts/HITL
- **Cons:** Python only, requires developer to define graph, complex for non-technical authoring
- **Provenance:** LangGraph Multi-Agent Workflows (blog.langchain.com)

### Option D: Event-Driven Orchestration (Trigger.dev)

Trigger.dev workflows are triggered by events (webhooks, schedules, API calls). An orchestrator agent within the workflow uses LLM reasoning to decompose and assign sub-tasks. But the workflow topology itself is developer-authored code.

- **User interaction:** Fire-and-forget triggers; users don't select agents
- **Routing mechanism:** Developer-defined workflow code + LLM orchestrator for dynamic assignment
- **Pros:** Durable execution, no timeouts, waitpoints for HITL
- **Cons:** Requires infrastructure, developer must author workflows in code, not for non-technical setup
- **Provenance:** Trigger.dev AI agents (trigger.dev/docs/guides/ai-agents/overview)

### Option E: Context-File Single-Purpose Agents ("AI Agent OS" Practitioner Pattern)

Each "digital employee" is standalone with a persistent context file (`agents.md`) encoding role, tools, and preferences. Routing is the human choosing which employee to talk to, or an event trigger firing the right agent.

- **User interaction:** Two-word prompts to purpose-built agents
- **Routing mechanism:** Human selection or event triggers — no automatic multi-agent routing
- **Pros:** Very accessible for non-technical users, minimal prompting once set up
- **Cons:** No multi-agent coordination, no automatic sequencing, human is the orchestration bus
- **Provenance:** Greg Isenberg / Remy Gaskell "AI Agent OS" practitioner pattern

### Option F: Handoff Protocol (OpenAI Agents SDK)

Agents explicitly declare which other agents they can hand off to. During execution, an agent can transfer control to another agent, carrying conversation context. Each agent's available handoffs are part of its configuration.

- **User interaction:** Speak to one agent; it hands off when appropriate
- **Routing mechanism:** Agent-declared handoff targets + LLM reasoning about when to transfer
- **Pros:** Context-preserving, agent-initiated (not central coordinator), composable
- **Cons:** Each agent must know about potential handoff targets, can create circular handoffs, debugging is harder
- **Provenance:** OpenAI Agents SDK handoff abstraction

---

## Finding 4: The Agent OS Process Definition Already Contains Everything Needed

The current `processes/feature-implementation.yaml` already declares:

```yaml
steps:
  - id: plan
    executor: ai-agent
    agent_role: planner
    # ...
  - id: review-plan
    executor: human
    # ...
  - id: implement
    executor: ai-agent
    agent_role: builder
    config:
      pattern: ralph-loop
    # ...
  - id: test
    executor: script
    commands: [pnpm type-check, pnpm test]
    on_failure: return-to-implement
    # ...
  - id: self-review
    executor: ai-agent
    agent_role: reviewer
    harness:
      review: [maker-checker]
```

This is already a complete orchestration declaration. The heartbeat engine already executes this automatically. No user needs to invoke any skill — they trigger the process, and the engine drives every step.

**Source:** `processes/feature-implementation.yaml`, `src/engine/heartbeat.ts:340` (heartbeat function), `src/engine/step-executor.ts:23` (executeStep routes by executor type)

---

## Finding 5: The Gap Is Process Creation, Not Process Execution

The architecture already handles automatic execution. The gap is in **process creation and refinement** — the Explore mode that crystallizes conversations into process definitions.

Currently:
- Process definitions are hand-authored YAML files
- The dev skills (slash commands) are process creation tools operated manually by humans who understand the role system
- There is no conversational interface that helps a non-technical user articulate and formalize a process

The architecture spec describes this explicitly:

> "Conversations are great for exploring and refining but poor for capturing, defining, and running business processes. Agent OS encodes this directly."
> — `docs/human-layer.md:38`

> "Setup should feel like a frog slowly being boiled — the user never has a moment of 'this is too much.' The platform is a consultant slowly helping the user identify, map, automate, and operate AI processes."
> — `docs/human-layer.md:49`

The Explore → Operate transition is listed as one of Agent OS's genuinely original contributions (architecture.md:424, landscape.md:231).

**Source:** `docs/human-layer.md:29-57`, `docs/architecture.md:419-425`

---

## Finding 6: Three Layers of "No Slash Commands Needed"

For Agent OS to fully remove the need for manual skill invocation, three layers must work:

### Layer A: Process Execution (EXISTS)
The heartbeat engine already drives step-by-step execution automatically. Users trigger → engine executes → harness governs → human reviews when prompted.

**Status:** Working (Phase 2 complete)

### Layer B: Process-Level Orchestration (PARTIALLY EXISTS)
When a process has inter-step dependencies, parallel groups, or handoffs to other processes, the engine resolves these automatically.

**Status:** Working for within-process orchestration. Cross-process handoffs exist as a concept (`executor: handoff` in step-executor.ts:37-48) but are not fully implemented.

### Layer C: Process Creation and Refinement (NOT BUILT)
The conversational interface that helps a non-technical user go from "I need help with X" to a formalized process definition. This is the Explore mode — Conversation Thread + Process Builder.

**Status:** Phase 4+ (CLI redesign to map to six human jobs) and Phase 6+ (web UI with Explore mode)

---

## Finding 7: Patterns Most Relevant to Agent OS

Given Agent OS's process-first philosophy and trust-tier governance:

### For Process Execution: Config-Driven (Already Implemented)
Agent OS already uses the equivalent of CrewAI's declarative routing — the YAML process definition maps steps to executors and roles, and the engine drives it. No LLM router needed for execution.

### For Process Creation: Hybrid (Not Yet Built)
The Explore mode should combine:
- **Conversational interface** (Option A/C pattern: LLM understands intent)
- **Industry templates** (Option B pattern: declarative starting points from APQC/ITIL)
- **Progressive disclosure** (Option E pattern: one question at a time, build structure alongside)

### For Cross-Process Routing: Event-Driven (Not Yet Built)
When processes hand off to other processes, the Option D pattern (event-driven triggers) fits best. A completed process step publishes an event; dependent processes pick it up via the dependency graph (Layer 4: Awareness).

---

## Gaps Where No Existing Solution Fits

1. **Trust-aware routing.** No existing system adjusts routing or human-involvement based on earned trust tiers. This remains Original to Agent OS.

2. **Conversational process crystallization.** While several systems have conversational interfaces, none implement the specific Explore → Operate transition where conversation progressively builds a structured process definition. This remains Original to Agent OS.

3. **Implicit feedback capture during process creation.** The idea that corrections during setup become quality criteria for the process is not found in any reviewed system. This remains Original to Agent OS.

---

## Summary

| Question | Answer |
|---|---|
| Does the architecture remove the need for slash commands? | **Yes** — for process execution, the engine already drives everything automatically |
| Is this implemented? | **Partially** — execution is automatic, but process creation still requires manual YAML authoring or skill invocation |
| What's the gap? | The Explore mode (conversational process creation) and cross-process orchestration |
| Do existing systems validate this approach? | **Yes** — every serious orchestration framework uses declarative process definitions to drive automatic agent selection |
| What's genuinely original? | Trust-aware routing, conversation → process crystallization, implicit feedback as quality criteria |
