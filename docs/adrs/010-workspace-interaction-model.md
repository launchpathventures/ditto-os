# ADR-010: Workspace Interaction Model — Work Evolution Through Meta-Processes

**Date:** 2026-03-20
**Status:** accepted

## Context

### The Problem

Agent OS's current interaction model frames the user experience as "define processes → review outputs → earn trust." This is the interaction model of an automation platform (Zapier, n8n) with a trust layer. The architecture spec's Core Thesis correctly states "the chat interface is the wrong metaphor for business processes," but then replaces it with a factory metaphor that is equally wrong for how people actually work.

Real work doesn't start with "I need to define a process." It starts with:

- A question: "Why are our quotes taking so long to convert?"
- A task: "Follow up with Henderson about the bathroom reno"
- A goal: "Get quote turnaround under 24 hours"
- An insight: "I noticed our bathroom labour estimates are always low"
- An outcome needed: "I need a competitive pricing analysis by Friday"

These are **work inputs.** Processes are the system's learned capabilities for handling them — not what the user manages directly.

### Forces

1. **Every new AI interaction feels stateless.** The user's biggest fear is that the system doesn't remember what happened, who they are, or what needs to be done. Human teammates' memory persists and evolves. Agent OS must feel like that. (Insight-028)

2. **The system must feel like a workspace, not a dashboard.** The user works IN Agent OS daily — it's a living environment, not something they check occasionally. Disaster would be feeling like Monday.com, Linear, or Notion. (Insight-027)

3. **A single input should evolve through multiple processes.** "Henderson wants a bathroom quote" → quoting process drafts quote → notices restricted access → spawns human action step → Rob confirms from truck → quote finalised → follow-up process activates → system notices bathroom trend → proposes process improvement. The seed grows into a tree. No human organised this.

4. **Processes can include human action steps, not just review.** A process step can be "human does X" — the system pauses, the human acts, the system continues. This is different from human-as-reviewer. (Insight-027 extended)

5. **Core agents and meta-processes must drive the framework.** The orchestration layer isn't just code — it's processes running agents through the same harness. The system runs ON itself. This is what makes it alive. (ADR-008 already defines seven system agents; this ADR extends them with workspace-specific roles.)

6. **Agent OS sits between OpenClaw (fluid, unstructured) and Paperclip (structured, governed).** It must combine OpenClaw's fluidity with Paperclip's structure, adding trust/harness/governance that neither has.

### Research Inputs

- `docs/research/workspace-interaction-model.md` — 14 systems surveyed across 10 sections
- `docs/insights/027-workspace-not-automation-platform.md` — the core reframe
- `docs/insights/028-stateless-ai-is-the-core-ux-failure.md` — memory as UX
- `docs/adrs/008-system-agents-and-process-templates.md` — existing system agent definitions

## Decision

### 1. Amend the Core Thesis: Work Evolution, Not Process Management

The Core Thesis in architecture.md gains a new section:

**The User's Job Is Handoff, Not Management**

The ultimate purpose of Agent OS is handoff. The human hands off work to the system and gets pulled back in only when required. Two kinds of work exist:

| Kind | Character | Entry | Example |
|------|-----------|-------|---------|
| **Repetitive** | Predictable, high-volume, trust-earnable | Schedule, event, data arrival | Reconcile accounts, generate quotes, format reports |
| **Reactive** | Unpredictable, variable, judgment-heavy | Human input, external event, insight | Customer calls, new idea, competitive threat, "I just realised..." |

Both need processes. The difference is how they enter. The compound effect is that reactive work gradually becomes repetitive as the system learns patterns.

**Process is still the primitive** — but it's an internal organising primitive, like an organ in a body. The user interacts with goals, tasks, questions, and insights. The system routes them to its learned processes. Over time, more of the nervous system runs autonomously.

### 2. Define the Work Item as a first-class object

A **work item** is the universal unit of work entering Agent OS. Every input — question, task, goal, insight, outcome — becomes a work item with a lifecycle.

```
Work Item
├── id: unique identifier
├── type: question | task | goal | insight | outcome
├── content: natural language description
├── source: how it entered (conversation, capture, process-spawned, system-generated)
├── goal_ancestry: [goal_id, ...] — what goal this serves (if any)
├── status: intake | routed | in_progress | waiting_human | completed | failed
├── assigned_process: which process is handling this (set by router)
├── spawned_from: parent work item (if decomposed from a goal)
├── spawned_items: child work items (if this generated sub-tasks)
├── created_at, updated_at, completed_at
├── execution_ids: [run_id, ...] — links to process execution runs that handled this item
└── context: accumulated context from conversation, corrections, related items
```

**Storage:** Work items are a new `workItems` table. The `execution_ids` field links work items to process runs in the existing `executions` table, enabling the unified task surface and Daily Brief to trace from "what the user asked for" through to "what the system did." A goal may link to many execution runs across multiple processes.

**These fields are the decision** — not illustrative. The Phase 4 brief determines which fields are implemented in the first slice.

**Lifecycle rules:**
- A **question** is answered → done. Short-lived.
- A **task** is executed → done. Single process handles it.
- A **goal** persists until achieved or abandoned. Spawns tasks across multiple processes. The orchestrator agent actively decomposes and tracks.
- An **insight** is captured → absorbed into process improvement. Routes to the improvement-scanner.
- An **outcome** is time-bound. Like a goal, but with a deadline. Decomposes into tasks with scheduling constraints.

**Goal ancestry:** Every work item can carry a chain of parent goals, inspired by Paperclip's goal ancestry pattern. When a quoting process executes a task, it knows the task exists because Rob's goal is "quotes under 24 hours." This context travels through the harness — agents see WHY they're working, not just WHAT.

Provenance: Work item concept — Paperclip tickets with goal ancestry (`paperclipai/paperclip /packages/db/src/schema/goals.ts`, `/packages/db/src/schema/issues.ts`). Goal decomposition — Manus AI Planner module. Work item taxonomy (question/task/goal/insight/outcome) — Original to Agent OS.

### 3. Add three new system agents to ADR-008's seven

ADR-008 defines seven system agents. The workspace model requires three more:

| System role | Purpose | Phase | Trust tier |
|-------------|---------|-------|------------|
| **intake-classifier** | Classifies incoming work items (type, urgency, relevant processes). First contact for all user input. | Phase 4 | Starts supervised → earns trust in classification accuracy |
| **orchestrator** | Decomposes goals into tasks, assigns to processes, tracks progress, spawns follow-up work. The lead agent in the orchestrator-worker pattern. | Phase 4 | Starts supervised → earns trust in decomposition quality |
| **router** | Matches tasks to the right process based on capabilities, load, and context. | Phase 4 | Starts supervised → earns trust in routing accuracy |

These three, combined with ADR-008's seven, form the **meta-process layer** — ten system agents that drive the framework itself.

**Key principle (extended from ADR-008):** All ten system agents go through the same harness pipeline as domain processes. They start supervised. They earn trust. They get corrected. They improve. The system that governs user work is itself governed by the same system.

**Why three separate agents, not one?** Separation of concerns. The intake-classifier makes a fast, cheap decision (what type of work is this?). The router makes a medium decision (which process handles it?). The orchestrator makes a complex, persistent decision (how to break this goal into tasks over time). Different trust profiles, different correction patterns, different improvement trajectories.

**Router vs process-analyst (ADR-008):** The process-analyst helps users *create and formalise* new processes via conversation (Phase 11). The router *dispatches work items to existing* processes (Phase 4). They are complementary — the router assumes processes already exist; the process-analyst creates them. Over time, the router's inability to find a matching process may trigger the process-analyst to suggest creating one.

Provenance: Orchestrator-worker pattern — Anthropic multi-agent research system (`anthropic.com/engineering/multi-agent-research-system`). Intake classification — Original to Agent OS. Router as separate concern — Vercel AI SDK tool routing pattern (`vercel/ai`). System agents through same harness — Original to Agent OS.

### 4. Define the human step executor

Architecture.md already lists six executor types: `ai-agent`, `script`, `rules`, `human`, `handoff`, `integration`. The `human` executor type is currently undefined. This ADR specifies it:

A **human step** pauses the process, creates a work item for the human (type: task), and waits for completion.

```
Step: [Action requiring human]
├── Executor: human
├── suspend_payload:
│   ├── instructions: what the human needs to do
│   ├── context: relevant data for the action
│   ├── input_fields: what data to capture when done
│   └── timeout: optional deadline
├── On completion: resume process with human's input
├── On timeout: escalate or fail (configurable)
└── Security: suspend payloads must not contain raw credentials or sensitive values — only references that the UI resolves at render time
```

When a process reaches a human step:
1. **PAUSE** — heartbeat records the suspension point (Mastra snapshot pattern)
2. **SURFACE** — a work item appears in the user's workspace (same surface as review tasks)
3. **WAIT** — heartbeat skips this process until input received (no compute cost)
4. **ACT** — human does the action externally, captures result via Quick Capture or task completion form
5. **RESUME** — heartbeat picks up, process continues with human's data

The user's task list becomes a unified surface of:
- **Review tasks** — "check this output" (from harness review patterns)
- **Action tasks** — "do this thing" (from human steps in processes)
- **Goal-driven tasks** — "work toward this" (decomposed by orchestrator)

All three types are work items. All three surface in the same place.

Provenance: Suspend/resume — Mastra (`mastra-ai/mastra /packages/core/src/workflows/`) suspend/resume with snapshot preservation. Waitpoint token — Trigger.dev (`triggerdotdev/trigger.dev`) wait.forToken pattern. HITL block — Sim Studio (`simstudioai/sim /packages/api/src/tools/humanInTheLoop/`) approval portal concept. Unified task surface — Original to Agent OS.

### 5. Define the conversation layer as pervasive

Conversation is not a mode (Explore). It is a **layer** available everywhere.

The current three modes (Analyze, Explore, Operate) remain as activity contexts, but conversation spans all three:

| Mode | Conversation role | Example |
|------|------------------|---------|
| **Analyze** | Ask questions about the org, explore data | "Why are bathroom quotes slow?" |
| **Explore** | Define and refine processes (existing Primitive 8) | "I need a quoting process for bathroom renos" |
| **Operate** | Give instructions, ask status, capture work | "Follow up with Henderson" / "What's the status of the pricing analysis?" |

The conversation layer is powered by the intake-classifier + router meta-processes. When the user speaks:
1. Intake-classifier determines the type (question, task, goal, etc.)
2. Router determines which process or system agent handles it
3. The work item is created and routed
4. Results stream back through the conversation with generative UI (Vercel AI SDK streaming pattern)

This means the user never needs to navigate to a specific screen to do work. They can talk, and the system routes. They can also navigate directly (process graph, review queue, daily brief) when they want structured views.

**Relationship to Primitive 8 (Conversation Thread):** Primitive 8 currently exists only in Explore mode for process definition. With this ADR, Primitive 8 evolves into the universal conversation surface — available on every view, not just Setup. In Explore mode it retains its dual-pane process-building behaviour. In Operate mode it acts as a command/query interface. The primitive is extended, not replaced.

**Cross-reference:** The intake-classifier and router will eventually consume the organizational data model (ADR-006, Layer 4) to route work more intelligently. This dependency is noted but not required for Phase 4.

Provenance: Pervasive conversation across modes — Original to Agent OS (no surveyed product provides conversation that spans structured operating modes with trust-governed routing). Plugin/skill model inspiration — Claude Cowork (`claude.com/blog/cowork-plugins-across-enterprise`). Streaming generative UI for results — Vercel AI SDK (`vercel/ai`) multi-step tool use with React components. Classification + routing — Original to Agent OS (no system routes through a trust-governed harness).

### 6. Daily Brief demonstrates accumulated memory

The Daily Brief (Primitive 1) is the primary surface where the system proves it remembers and has evolved. It is produced by the brief-synthesizer system agent (ADR-008), which now has access to:

- All active work items (goals, tasks, outcomes) and their status
- Process health across all processes
- Accumulated corrections and learned patterns
- Goal progress and decomposition state
- Human preferences (when they review, what they care about, what they skip)
- Organisational context from connected data (when available)

The brief must feel like a briefing from a chief of staff who knows everything — not a generated report. It should:
- Reference previous conversations: "You mentioned wanting to look at bathroom labour rates — I've analysed the last 20 quotes..."
- Show accumulated learning: "The quoting process has improved — correction rate down from 40% to 8% over 6 weeks"
- Be proactive: "Henderson hasn't responded to the quote sent Tuesday. The follow-up process will send a reminder tomorrow unless you'd prefer to call."
- Demonstrate continuity: never feel like "new chat"

Provenance: Daily Brief concept — architecture.md Primitive 1. Memory-as-UX — Original to Agent OS (Insight-028). Chief-of-staff metaphor — Original.

### 7. Process graph enhanced with goal hierarchy

The process graph (Primitive 14) becomes a primary navigation surface — not a secondary visualisation. It is enhanced to show:

```
Goals (top layer)
├── "Quotes under 24 hours" [active, 65% progress]
│   ├── Quoting process [healthy, spot-checked trust]
│   ├── Follow-up process [healthy, supervised trust]
│   └── Improvement: bathroom labour adjustment [applied]
│
Processes (middle layer)
├── Quoting ──→ Follow-up ──→ Invoicing
├── Content ──→ Compliance
└── Reconciliation (standalone)
│
Live execution (bottom layer)
├── ● Quoting: 2 quotes in progress, 1 waiting human input
├── ● Follow-up: Henderson reminder scheduled for tomorrow
└── ○ Reconciliation: next run Monday 9am
```

Three layers in one view:
1. **Goals** — what the user is trying to achieve (top)
2. **Processes** — how work flows, dependencies, connections (middle)
3. **Live state** — what's running, what's waiting, what needs attention (bottom)

Inspired by: Paperclip org chart as primary navigation (`paperclipai/paperclip` — real-time agent hierarchy with status). Asana Work Graph goal hierarchy (`asana.com/resources/work-graph`). Sim Studio execution DAG with live state (`simstudioai/sim`). Combined three-layer view — Original to Agent OS.

### 8. Architecture layer amendments

| Layer | What changes |
|-------|-------------|
| **L1 Process** | Work item schema added. Goal ancestry on work items. `human` executor specified. |
| **L2 Agent** | Three new system agents (intake-classifier, orchestrator, router). Total: ten system agents. |
| **L3 Harness** | Meta-processes go through same pipeline. Trust earned by system agents. |
| **L4 Awareness** | Process graph enhanced with goal hierarchy. Work item status tracking. |
| **L5 Learning** | Reactive-to-repetitive lifecycle: system proposes process creation from repeated ad-hoc work patterns. |
| **L6 Human** | Conversation as pervasive layer. Unified task surface (review + action + goal-driven). Daily Brief demonstrates memory. Process graph as primary navigation. |
| **Core Thesis** | New section: "The User's Job Is Handoff, Not Management." Process remains the internal primitive but is not the user-facing concept. |

### 9. What this does NOT change

- **Process as internal primitive** — still the atomic unit of the system. Not removed, repositioned.
- **Trust earning mechanism** — unchanged. Approval rates, correction rates, sliding windows.
- **Harness pipeline** — unchanged. Five handlers, chain-of-responsibility.
- **Review patterns** — unchanged. Maker-checker, adversarial, spec-testing, ensemble.
- **Six-layer architecture** — unchanged in structure. Amended in content.
- **Existing system agents (ADR-008)** — unchanged. Three new agents added alongside.
- **Template library (ADR-008)** — unchanged. Templates still serve as starting points.

### 10. Roadmap impact

| Phase | Impact |
|-------|--------|
| **Phase 4 (CLI)** | CLI must support work item creation (not just process management). Commands map to: enter work (intake), check status (orient), review outputs, complete human steps. Three new system agents (intake-classifier, orchestrator, router) are the minimum viable meta-process layer. |
| **Phase 5 (E2E)** | Verification must prove the full cycle: work item → intake → route → process → human step → resume → completion. Not just process execution. |
| **Phase 10 (Dashboard)** | Process graph as primary navigation. Conversation layer pervasive. Daily Brief demonstrates memory. Unified task surface. |
| **Phase 11 (Three modes)** | Conversation is already pervasive by Phase 10. Analyze/Explore/Operate become activity contexts within the conversation, not mode switches. |

## Provenance

Summary of all sources:

| Pattern | Source | What we take |
|---------|--------|-------------|
| Work items with goal ancestry | Paperclip (`paperclipai/paperclip`) | Ticket structure, goal cascade, "every task carries the why" |
| Orchestrator-worker decomposition | Anthropic multi-agent research system | Lead agent decomposes, subagents execute in parallel, results synthesised |
| Suspend/resume for human steps | Mastra (`mastra-ai/mastra`) | `suspend()` / `resume()` with snapshot preservation |
| Waitpoint tokens | Trigger.dev (`triggerdotdev/trigger.dev`) | Token-based pause with URL completion and timeout |
| Streaming generative UI | Vercel AI SDK (`vercel/ai`) | Multi-step tool use rendering as React components |
| Plugin-as-skill model | Claude Cowork | Plugins bundle skills + connectors + sub-agents |
| Org chart as primary navigation | Paperclip | Real-time hierarchy with status indicators |
| Work Graph with goal hierarchy | Asana | Typed graph connecting goals → projects → tasks |
| System agents through own harness | Original to Agent OS | No existing product governs its own orchestration |
| Unified task surface (review + action + goal) | Original to Agent OS | No product unifies these three task types |
| Reactive-to-repetitive lifecycle | Original to Agent OS | No product explicitly tracks work maturation |
| Conversation as pervasive layer (not mode) | Original to Agent OS (inspired by Claude Cowork plugin model) | Other products have chat OR dashboard, not chat ACROSS modes with trust-governed routing |
| Memory as UX (demonstrated continuity) | Original to Agent OS (Insight-028) | No product makes accumulated memory a core UX principle |

## Consequences

**What becomes easier:**
- Users enter work naturally (questions, tasks, goals) without knowing about processes
- The system actively orchestrates — users hand off, not manage
- Human action steps are first-class — processes can pause for real-world actions
- The system demonstrates intelligence through the Daily Brief, proactive insights, and goal tracking
- Trust earning applies to the system's own intelligence, not just user processes

**What becomes harder:**
- Phase 4 scope increases — three new system agents must be at least stubbed
- The work item schema adds a new table and routing logic
- Testing meta-processes requires testing the system's ability to classify, route, and decompose
- The conversation layer requires streaming UI infrastructure (Vercel AI SDK or similar)
- Goal decomposition is an open-ended AI problem — quality depends on model capability

**New constraints:**
- Every user-facing surface must support work item creation, not just process interaction
- The Daily Brief is now mission-critical — if it feels generic, the product fails (Insight-028)
- The process graph must be interactive and real-time, not a static diagram
- System agents must be distinguishable from domain agents in the UI

**Follow-up decisions needed:**
- Phase 4 brief: how much of this to implement in CLI vs defer to Phase 10
- Work item schema design (exact fields, storage, lifecycle hooks)
- Orchestrator agent prompt design — how it decomposes goals
- Conversation layer technology choice (Vercel AI SDK vs alternative)
- Process graph UI framework (ReactFlow vs alternative)
