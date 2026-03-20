# Research: Workspace Interaction Model — How Work Enters Agent Systems

**Date:** 2026-03-20
**Research question:** How should Agent OS model the workspace interaction — how work enters the system, how handoff/pull-in works, how goals/tasks relate to processes, human-in-the-loop as participant, and process graph as primary navigation?
**Triggered by:** Insight-027 (Agent OS is a workspace, not an automation platform)
**Status:** Complete — pending review

---

## Research Scope

Six dimensions were investigated:

1. **Workspace vs automation products** — what makes something feel like a workspace you work in vs a dashboard you check?
2. **Work input models** — how do different systems handle the entry of questions, tasks, goals, and ad-hoc requests?
3. **Human-in-the-loop as participant** — how do orchestration frameworks handle human action steps (not just review)?
4. **Goal decomposition and tracking** — how do systems decompose goals into tasks and route them?
5. **Process/workflow graph as primary navigation** — how do the best tools make structure visible?
6. **Reactive-to-repetitive lifecycle** — do any systems explicitly support work maturing from ad-hoc to automated?

---

## 1. Workspace Products vs Automation Platforms

### The Distinction

The landscape splits clearly into two categories, with a growing convergence in 2025-2026:

| Category | Examples | Entry point | Daily feel | Agent role |
|----------|----------|-------------|------------|------------|
| **Workspace** | Notion, Asana, ClickUp, Linear, Monday.com | User enters work (task, goal, note, project) | "I work here" — always open | Agent augments what's already there |
| **Automation** | Zapier, n8n, Mastra, Trigger.dev | User defines triggers/flows | "I set this up, it runs" — check occasionally | Agent IS the worker, triggered by rules |
| **Converging** | Dust.tt, Paperclip, Notion 3.0+, Monday.com 2026 | Hybrid — workspace with embedded agents | "I work here AND agents work here" | Agent is a teammate in the workspace |

### Key Patterns from Workspace Products

**Notion 3.0 (Sep 2025) + 3.3 Custom Agents (Feb 2026)**
- Agents operate WITHIN the existing workspace — they read from pages/databases, create entries, follow permissions
- Two trigger models: user-initiated (ask an agent) and scheduled/event-triggered (agents run autonomously)
- Custom agents are given a "job" + trigger/schedule and run 24/7
- Agents can perform 20+ minutes of autonomous work across hundreds of pages
- Agent instructions live on Notion pages — the workspace IS the agent's context
- Key insight: **the workspace is the agent's memory and operating environment**, not a separate system

Sources: [Notion 3.0 release](https://www.notion.com/releases/2025-09-18), [Notion 3.3 release](https://www.notion.com/releases/2026-02-24)

**Asana Work Graph (2025-2026)**
- Proprietary data model connecting goals → projects → tasks → subtasks in a typed graph
- AI Teammates are "agentic workflows" that auto-assign, re-prioritise, and summarise
- AI Teammates receive full context from the Work Graph — they understand WHY a task exists (goal ancestry)
- AI Studio (late 2025): non-technical managers build custom AI agents with business rules
- Key insight: **goal ancestry gives agents context** — every task traces to a strategic objective, agents see the chain

Sources: [Asana Work Graph](https://asana.com/resources/work-graph), [Asana Fall 2025 release](https://asana.com/inside-asana/fall-release-2025)

**ClickUp Brain (2025-2026)**
- "Centralised intelligence hub" that understands relationships between tasks, docs, goals, conversations
- AI Stand-ups: daily summaries compiled automatically, replacing status meetings
- Goal decomposition: break down goals into projects/tasks, OKR tracking
- Agents assign tasks based on expertise, availability, workload
- Toggle between models (GPT-5, Claude Opus, o3) per task
- Key insight: **the AI layer sits across the entire workspace**, not in a separate agent panel

Sources: [ClickUp Brain](https://clickup.com/brain)

**Monday.com (2026)**
- New agent infrastructure: agents sign up, authenticate, and operate as platform members
- AI analyses goals, deadlines, capacity to distribute work optimally
- Natural language → structured work items (emails, meeting notes → tasks)
- Agent builder: non-technical users create agents for specific jobs
- Key insight: **agents are first-class platform members**, not external tools

Sources: [Monday.com AI agents announcement](https://ir.monday.com/news-and-events/news-releases/news-details/2026/monday-com-Welcomes-AI-Agents-to-Its-Platform-Marking-a-Shift-in-How-Work-Gets-Done/default.aspx)

**Linear for Agents (2025-2026)**
- Agents are "full members of the workspace" — assigned to issues, added to projects, @mentioned
- Agent Sessions track lifecycle of a delegated task
- Human stays as primary assignee; agent is added as contributor
- MCP server expanded with initiatives, milestones, updates
- Key insight: **agents augment human work, they don't replace the human's ownership** — the human remains the assignee

Sources: [Linear for Agents](https://linear.app/agents), [Linear Developers](https://linear.app/developers/agents)

### Synthesis: What Makes Something Feel Like a Workspace

| Property | Workspace products have it | Automation platforms lack it |
|----------|---------------------------|----------------------------|
| **Always-open home** | Yes — daily brief, inbox, task list | No — you visit to configure |
| **User enters work** | Yes — tasks, goals, notes, projects | No — work enters via triggers |
| **Conversation pervasive** | Yes — @mention, comments, threads | No — conversation only in setup |
| **Agents are teammates** | Yes — they show up in the org | No — they're invisible workers |
| **Goal hierarchy visible** | Yes — goals → projects → tasks | No — flat trigger/action |
| **Graph/relationship view** | Yes — dependencies, connections | Partial — DAG for flow only |

---

## 2. Work Input Models

### How Work Enters Different Systems

| System | Primary input | Input taxonomy | Routing mechanism |
|--------|--------------|----------------|-------------------|
| **Notion** | Page creation, database entry, @agent mention, scheduled trigger | Pages, databases, tasks (implicit) | Agent instructions page defines scope; trigger/schedule for automation |
| **Asana** | Task creation, goal creation, project creation, natural language | Goals, projects, tasks, subtasks (explicit hierarchy) | Work Graph relationships + AI assignment based on expertise/capacity |
| **ClickUp** | Task, goal, doc, natural language to Brain | Goals, tasks, docs, comments (typed) | Brain routes based on workspace context + agent capabilities |
| **Linear** | Issue creation, @mention, delegation | Issues, projects, initiatives, milestones | Assignment to agent or human; agent session tracks lifecycle |
| **Monday.com** | Item creation, natural language, email/meeting import | Items, boards, goals (flexible schema) | AI analyses goals + deadlines + capacity for distribution |
| **Paperclip** | Ticket creation (structured) | Tickets (one type) with goal ancestry | Org chart hierarchy — delegation up/down/across |
| **Dust.tt** | Slack message, agent invocation, scheduled trigger | Conversations (unstructured) | Agent capabilities + connected data sources |

### Key Finding: Input Types as a Spectrum

```
Unstructured ←──────────────────────────────────→ Structured
  │                                                    │
  Voice memo    Question    Insight    Task    Goal    Process
  Note          Chat msg    Idea       Issue   OKR     Workflow
  │                                                    │
  Quick Capture                                Process Definition
  (Agent OS Primitive 12)                      (Agent OS Primitive 9)
```

**No system in the landscape handles the full spectrum.** Workspace products handle the left-to-middle well (tasks, goals, notes). Automation platforms handle the right well (processes, workflows). The gap is in the **middle** — turning ad-hoc inputs into structured processes over time.

### Paperclip's Ticket Model (Detailed)

Paperclip's work input model is relevant because it's the closest to "structured handoff":

- Work enters as **tickets** with description, assigned agent/role, and goal context
- Every ticket carries **full goal ancestry** — agents see the company mission → project goal → task
- Tickets are the universal unit — humans create them, agents create them, agents delegate them
- Communication is via structured tickets, not chat — "clear owner, status, and thread"
- The human is "the board of directors" with veto power

Relevance to Agent OS: **Paperclip treats every work item as a structured ticket with goal ancestry.** Agent OS could adopt this — every input (question, task, goal) becomes a structured work item that carries context about WHY it exists.

Source: [Paperclip](https://paperclip.ing/), [GitHub](https://github.com/paperclipai/paperclip)

---

## 3. Human-in-the-Loop as Participant

Five systems were surveyed for human action step patterns (not just human-as-reviewer):

### Pattern Comparison

| System | Mechanism | How it pauses | How human provides input | State preservation | Production-proven |
|--------|-----------|--------------|------------------------|--------------------|-------------------|
| **Mastra** | `suspend()` / `resume()` | Step returns `suspend()` with payload | `run.resume({ step, resumeData })` | Workflow snapshot | Yes (TypeScript) |
| **Trigger.dev** | `wait.forToken()` | Creates token with URL + timeout | SDK call or HTTP POST to token URL | Durable execution (cloud) | Yes (TypeScript) |
| **LangGraph** | `interrupt()` / `Command` | Dynamic interrupt anywhere in node | Resume with `Command` object | Checkpointer (Postgres/SQLite) | Yes (Python) |
| **Inngest** | `step.waitForEvent()` | Waits for named event | Send event via API | Durable execution (Inngest server) | Yes (TypeScript) |
| **Sim Studio** | HITL block | Workflow pauses at block | Approval portal (web UI) or webhook | Execution state | Yes (TypeScript) |

### Mastra Suspend/Resume (Most Relevant — TypeScript, Detailed Pattern)

```typescript
// Step that requires human action
const step = new Step({
  id: 'get-measurements',
  execute: async ({ context, suspend, resumeData }) => {
    if (!resumeData) {
      // First run — hand off to human
      return await suspend({
        reason: 'Site visit required',
        instructions: 'Visit site and upload measurements + photos',
        fields: ['measurements', 'photos', 'notes']
      });
    }
    // Human completed the action — continue
    return { measurements: resumeData.measurements, ... };
  }
});

// Later, when human is done:
await run.resume({
  step: 'get-measurements',
  resumeData: { measurements: '3.2m x 4.1m', photos: [...], notes: '...' }
});
```

Key properties:
- `suspend()` accepts any JSON payload — context for the human
- `resumeData` flows back into the same step
- `bail()` allows rejection — human can say "this doesn't make sense"
- Snapshot preserves full workflow state
- Can resume from HTTP endpoint, event handler, or timer

Sources: [Mastra HITL docs](https://mastra.ai/docs/workflows/human-in-the-loop), [Mastra Suspend & Resume](https://mastra.ai/docs/workflows/suspend-and-resume)

### Trigger.dev Waitpoint Tokens (Most Elegant API)

```typescript
// Create a token for human action
const token = await wait.createToken({ timeout: '7d' });

// Send the token URL to the human (email, push notification, etc.)
await sendNotification({
  message: 'Site visit required for Henderson job',
  actionUrl: token.url
});

// Workflow pauses here
const result = await wait.forToken(token);
// result.ok === true when human completes, false on timeout
```

Human completes via HTTP POST to token URL with JSON body. Key properties:
- Token has a URL — any system can complete it (web form, mobile app, API)
- Idempotency keys prevent double-completion
- Timeout configurable (default 10min, can be days)
- Cloud-native: runs are paused (no compute cost while waiting)
- Tags for dashboard filtering

Sources: [Trigger.dev wait-for-token](https://trigger.dev/docs/wait-for-token), [Trigger.dev waitpoints](https://trigger.dev/changelog/waitpoints)

### Sim Studio HITL Block (Most Visual)

- Dedicated block type in the visual workflow builder
- When execution reaches the block, workflow pauses indefinitely
- **Approval portal**: auto-generated web UI showing all paused data + form fields
- Portal is mobile-responsive and secure
- Webhook notification integration (Slack, Jira, ServiceNow)
- Approver fills in defined fields → data flows to downstream blocks

Key insight: **Sim Studio's HITL block generates a standalone approval UI per task.** This is relevant to Agent OS — each human action step could generate a task card with context + input fields.

Sources: [Sim Studio HITL block](https://docs.sim.ai/blocks/human-in-the-loop)

### Inngest waitForEvent (Most Decoupled)

- Agent calls `step.waitForEvent('developer.response', { timeout: '4h' })`
- Returns `null` on timeout, or the event data
- Events decouple the pausing code from the resuming code — fan-out possible
- Events have automatic audit trails
- React hook (`useAgent`) streams real-time updates to browser

Key insight: **event-based resume allows any system to complete the task** — mobile app, Slack button, web form, another agent.

Sources: [Inngest HITL](https://agentkit.inngest.com/advanced-patterns/human-in-the-loop), [Inngest waitForEvent](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event)

### LangGraph Interrupts (Most Flexible)

- `interrupt()` can be called anywhere — not just at step boundaries
- Accepts any JSON-serializable value as context for the human
- Graph saves state via checkpointer (Postgres, SQLite)
- Can pause for seconds or days
- Resume via `Command` object with arbitrary data

Key insight: **LangGraph interrupts are dynamic, not static** — the code decides at runtime whether to pause, based on conditions.

Sources: [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)

### Synthesis: Human-as-Participant Pattern

All five systems share the same fundamental pattern:

```
1. PAUSE  — workflow reaches a point requiring human action
2. NOTIFY — system tells the human what's needed (with context)
3. WAIT   — workflow state is preserved, no compute cost
4. ACT    — human does the thing (externally) and provides input
5. RESUME — workflow continues with human's data
```

For Agent OS, this maps to:
- **PAUSE** → process step with executor type `human`
- **NOTIFY** → task appears in user's workspace (review queue or task list)
- **WAIT** → heartbeat skips this process until human input received
- **ACT** → human does the action and captures result (Quick Capture or task completion)
- **RESUME** → heartbeat picks up and continues the process

The key decision: **how does the human action task surface?** Sim Studio generates a portal. Trigger.dev generates a URL. Mastra relies on the application. Agent OS would surface it as a task in the workspace alongside review tasks — same queue, different type.

---

## 4. Goal Decomposition and Tracking

### How Systems Handle Goals

| System | Goal model | Decomposition | Agent role | Tracking |
|--------|-----------|---------------|------------|----------|
| **Asana** | Explicit goal object, nested hierarchy (company → team → project → task) | Manual + AI-assisted (AI suggests subtasks, dependencies) | AI Teammates auto-assign based on Work Graph context | Portfolio dashboards, progress rolls up |
| **ClickUp** | Goal object with targets, linked to tasks | Manual + AI (Brain breaks goals into tasks) | Agents assign based on expertise/capacity | OKR tracking, automated progress |
| **Monday.com** | Flexible — goals as board items or OKR structure | AI analyses goals + deadlines + capacity | Agents distribute work optimally | Board views, dashboards |
| **Linear** | Initiatives → projects → issues (hierarchy) | Manual — human creates issues | Agents work on assigned issues | Project progress, milestones |
| **Paperclip** | Mission → project goals → tasks (strict hierarchy) | CEO agent delegates down org chart | Every agent sees full goal ancestry | Goal cascade visualization |
| **Notion** | No native goal primitive — pages/databases model anything | Agent can break down a goal into database entries | Agent follows instructions page | Custom views |

### Paperclip's Goal Ancestry (Most Relevant Pattern)

Paperclip's key innovation for Agent OS:

```
Company Mission: "Build the #1 AI note-taking app to $1M MRR"
  └── Project Goal: "Ship collaboration features"
        └── Agent Goal: "Implement real-time sync"
              └── Task: "Write WebSocket handler for document updates"
```

- Every task carries **full goal ancestry** — agents see the "why," not just the "what"
- Goal cascade diagram visualises the full tree
- Delegation flows up/down the org chart following goal hierarchy
- Cross-team delegation routes to the best agent for the job

Relevance to Agent OS: **Goal ancestry gives processes context.** If Agent OS tracks goals, and goals spawn tasks that are routed to processes, then every process execution inherits the goal context — "this quote is being generated because Rob's goal is 'quotes under 24 hours.'"

### Asana's Work Graph (Most Sophisticated)

The Work Graph is a typed relationship graph:
- Goals → Projects → Tasks → Subtasks (hierarchical)
- Tasks ↔ Tasks (dependencies, blocking)
- Tasks → People (assignment)
- Projects → Teams (ownership)
- Goals → Strategic objectives (alignment)

AI Teammates receive Work Graph context when executing — they understand WHERE a task sits in the organisational strategy. This enables intelligent prioritisation: "this task blocks a project that's behind on a Q1 goal."

Relevance to Agent OS: **The process graph (Primitive 14) should include goal hierarchy, not just process dependencies.** Goals sit above processes. A process serves a goal. The graph shows why each process exists.

---

## 5. Process/Workflow Graph as Primary Navigation

### How Systems Visualise Structure

| System | Visualisation | Is it primary navigation? | What's shown | Interactive? |
|--------|--------------|--------------------------|-------------|-------------|
| **Paperclip** | Org chart (agent hierarchy) | Yes — main screen | Agents, roles, reporting lines, real-time status | Click agent → detail |
| **Asana** | Portfolio view, project timeline, dependencies | One of several views | Projects, tasks, dependencies, progress | Click → drill down |
| **Sim Studio** | ReactFlow DAG canvas | Yes — primary builder | Blocks, connections, execution state | Drag/drop, real-time |
| **ClickUp** | Mind maps, Gantt, board views | One of many views | Tasks, dependencies, timeline | Interactive |
| **Monday.com** | Board views, dashboards | Primary — board is home | Items, status, connections | Rich interaction |
| **Linear** | Project boards, roadmap timeline | Board is primary | Issues, status, cycles | Kanban interaction |

### Paperclip's Org Chart (Closest to What User Wants)

Paperclip's org chart is the **primary navigation surface**:
- Visual tree showing agent hierarchy
- Each node shows: agent name, role, model, status, budget
- Real-time status indicators (working, idle, waiting)
- Click any agent → task queue, performance, cost
- Batch operations on the chart (select multiple → change model)
- Swim-lane heartbeat timeline showing when agents work

Relevance to Agent OS: **The process graph should be what Paperclip's org chart is — the primary way to see and navigate the system.** Not a secondary visualisation, but the home view. Show processes, their connections, their health, and what's waiting for human input.

### Sim Studio's DAG Canvas

Sim Studio uses ReactFlow to render workflows as interactive graphs:
- Blocks are draggable nodes
- Edges show data flow
- Real-time execution highlighting (which block is running)
- HITL blocks show "waiting for human" state on the canvas

Key insight: **Execution state should be visible on the graph.** When a process step is waiting for human action, the graph should show it. When a process is running, the graph should animate.

---

## 6. Reactive-to-Repetitive Lifecycle

### Does Any System Explicitly Support This?

**No system explicitly models the lifecycle of work maturing from ad-hoc to automated.** This appears to be a genuine gap — and potentially original to Agent OS.

What exists:

| System | Closest pattern | Gap |
|--------|----------------|-----|
| **Notion** | Custom agents can be created for repetitive tasks | No explicit "this used to be manual, now it's automated" tracking |
| **Monday.com** | AI Workflows can be built for recurring patterns | No learning from ad-hoc work |
| **ClickUp** | Recurring tasks + automation recipes | Manual setup, no "the system noticed you do this regularly" |
| **Asana** | Rules engine for automation | Manual rule creation |
| **Agent OS (existing)** | Trust earning (supervised → autonomous) | Applies to process quality, not to work TYPE maturation |

### Weak Forms in Existing Products

Some products exhibit weak forms of this lifecycle, though none make it explicit:
- **Apple Shortcuts suggestions** — surfaces automation suggestions based on behavioural patterns (e.g., "you do this every morning")
- **Zapier "Zap suggestions"** — recommends automations based on connected app usage patterns
- **ClickUp recurring task detection** — notices repeated task creation patterns
- These are shallow attempts — they suggest point automations, not full process creation with quality criteria and trust

### Industry Trend (2025-2026)

The pattern is emerging in industry discourse but not yet productised (source: [AI Workflow Automation Trends](https://www.cflowapps.com/ai-workflow-automation-trends/), [Monday.com AI Report](https://monday.com/blog/project-management/ai-report/)):
- Finance teams shifting from reactive reporting to proactive AI-driven insights
- Organisations moving from isolated tasks to self-optimising processes
- AI systems improving with every interaction, handling exceptions with less human intervention

**No product explicitly tracks: "You did this 5 times manually. Want to make it a process?"** This lifecycle — ad-hoc work noticed, pattern proposed, process created, trust earned — is not productised anywhere.

Relevance to Agent OS: This is a natural extension of the "edits as feedback" philosophy — applied to work INITIATION rather than work REVIEW. If Rob creates 5 similar tasks manually, the system could notice the pattern and propose formalising it as a process.

---

## 7. Dust.tt — The "AI Operating System for Work" Model

Dust.tt warrants separate analysis because it explicitly positions as "the AI operating system for work":

- **Agents access connected data** — Notion, Slack, GitHub, websites, internal docs
- **Agents are created by anyone** — non-technical team members build agents
- **Agents are shared across teams** — sales, support, marketing each have their agents
- **Access via existing tools** — Slack integration, Chrome extension (no separate app)
- **Layered permissions** — workspace admin → user → LLM → tool approval
- **"Deep Dive" agents** — can perform extended research across connected sources

Relevance to Agent OS: Dust's approach — embedding agents into existing tools rather than building a new workspace — represents one end of the spectrum. At the other end, Paperclip builds its own full UI. Agent OS must decide where on this spectrum to sit, given that its core value (structured processes, trust earning, governance) may require surfaces that existing tools don't provide.

**Maturity note on Paperclip:** Paperclip launched in early 2026 and gained 14.2K GitHub stars in its first week. It has a working React UI, org chart, and ticket system. However, it is primarily designed for "zero-human companies" (AI-only workforces), not human-agent collaboration. Its goal cascade and org chart patterns are well-implemented; its human interaction model is thin (board-of-directors oversight, not daily workspace).

Sources: [Dust product](https://dust.tt/home/product), [Dust MCP blog](https://blog.dust.tt/mcp-and-enterprise-agents-building-the-ai-operating-system-for-work/)

---

## 8. Work Evolution Patterns — How Seeds Become Trees

This section was added after the initial review based on a critical reframe: the magic of Agent OS is not task management or automation — it's that **a single input (question, goal, task) evolves through multiple processes, spawning new work as it goes.** The system orchestrates this evolution.

Three systems demonstrate aspects of this pattern:

### Manus AI — Autonomous Goal-to-Completion

Manus takes a high-level goal and autonomously decomposes it into an execution plan:

- **Planner module** generates a pseudocode-like ordered step list from user goals
- **Multi-agent architecture** — specialised sub-agents work in parallel (browsing, coding, data analysis) in isolated sandbox environments
- **Event stream architecture** — chronological log of all actions/results, providing continuity
- **Memory externalisation** — intermediate results stored in files (e.g., `todo.md`), not kept in context
- **One tool action per iteration** — agent must observe results before deciding next step (prevents runaway)
- **Self-adaptive planning** — plan can be updated on the fly as the task evolves
- **CodeAct paradigm** — Python as universal action language, dramatically expanding capability

Performance: average task completion dropped from 15 minutes to under 4 minutes. 147 trillion tokens processed. 80 million virtual computers created.

Relevance to Agent OS: Manus demonstrates that a single goal CAN evolve into complex multi-step, multi-agent work autonomously. But Manus is a black box — no trust tiers, no human review of intermediate steps, no governance, no process memory. It completes tasks; it doesn't build organisational capability. Agent OS's harness would wrap Manus-style decomposition with trust, review, and learning.

Sources: [Manus AI technical investigation](https://gist.github.com/renschni/4fbc70b31bad8dd57f3370239dccd58f), [Manus AI guide](https://www.baytechconsulting.com/blog/manus-ai-an-analytical-guide-to-the-autonomous-ai-agent-2025)

### Claude Cowork — Orchestrated Knowledge Work

Claude Cowork (launched Jan 2026, updated Feb 2026) is Anthropic's enterprise product for non-coding knowledge workers:

- **Plugins** bundle skills, connectors, sub-agents, and slash commands into role-specific packages (HR, finance, ops, engineering)
- **Slash commands trigger structured forms** — "generate report" opens a brief-like form, not a chat prompt
- **Cross-application orchestration** — Claude passes context between Excel, PowerPoint, Google Workspace, etc.
- **Sub-agents** — for complex tasks, Claude spins up parallel workers, each handling a piece
- **Private plugin marketplaces** — enterprise admins control which plugins teams access
- **MCP connectors** for Google Drive, Gmail, Calendar, DocuSign, Slack, and more
- **Context retention across applications** — the system remembers what it did in Excel when it moves to PowerPoint

The daily feel: work enters through plugins/slash commands (structured) or conversation (unstructured). Claude orchestrates across tools. The user guides and reviews. It's positioned as a "coworker" not a "tool."

Relevance to Agent OS: Cowork demonstrates the **plugin-as-skill** model — a plugin is essentially a process definition (skills + connectors + sub-agents). The slash-command-triggers-form pattern is how structured work enters a fluid interface. However, Cowork has no persistent process memory, no trust earning, no self-improvement. Each session is largely independent. Agent OS's value is durability — the process gets better over time.

Sources: [Claude Cowork enterprise blog](https://claude.com/blog/cowork-plugins-across-enterprise), [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)

### Anthropic Multi-Agent Research System — Orchestrator-Worker in Detail

This is the most detailed public documentation of the orchestrator-worker pattern:

- **Lead agent** analyses query, develops strategy, spawns 3-5 subagents in parallel
- **Subagents** get explicit objectives, output formats, tool guidance, and task boundaries
- **Parallel tool calling** at two levels: (1) multiple subagents in parallel, (2) each subagent uses 3+ tools in parallel
- **Iterative deepening** — lead agent assesses results, spawns more subagents if needed
- **Citation agent** — dedicated agent for attribution after research is synthesised
- **Memory management** — lead agent saves plan to persistent memory to survive context truncation
- **Resumable execution** — built for failure recovery without restarting
- **Token economics** — multi-agent systems use ~15x more tokens than single-agent chat; requires high-value tasks to justify cost

Key lesson: "Vague directives like 'research the semiconductor shortage' caused agents to perform identical searches." Explicit task boundaries and division of labour are critical.

Relevance to Agent OS: This IS the orchestration pattern Agent OS needs internally. A goal enters → a lead process (orchestrator) decomposes it → sub-tasks are routed to specialised processes (workers) → results are synthesised → the human reviews the synthesis. The orchestrator-worker pattern maps directly to Agent OS's process model: the orchestrator is a meta-process, the workers are domain processes.

Sources: [Anthropic multi-agent engineering blog](https://www.anthropic.com/engineering/multi-agent-research-system)

### The Evolution Pattern — What Agent OS Uniquely Provides

What none of these systems have — and what Agent OS could uniquely provide — is the **durable evolution of work through a governed system**:

```
SEED: "Henderson wants a bathroom quote"
  │
  ├── [Quoting process] Drafts quote based on pricing rules + past quotes
  │     └── Notices: restricted site access → SPAWNS human action step
  │           └── [Human step] Rob confirms site access from truck
  │                 └── Quote finalised, sent to Rob for review
  │                       └── [Human review] Rob adjusts labour, approves
  │
  ├── [Follow-up process] Activates: if no response in 3 days, draft follow-up
  │     └── Auto-sends follow-up → customer responds → quote accepted
  │
  ├── [Learning] System noticed: 4th bathroom reno this month, labour consistently low
  │     └── SPAWNS improvement suggestion
  │           └── [Human decision] Rob confirms → process updates labour estimates
  │
  └── [Organisational memory] Updated: bathroom reno labour baseline, Henderson preferences
```

No system does all of this today:
- **Manus** does decomposition + execution but no governance, no learning, no human steps
- **Cowork** does orchestration + multi-app but no persistent process memory, no trust
- **Paperclip** does structure + governance but no fluid interaction, no evolution
- **OpenClaw** does fluidity but no structure, no trust, no reliability

Agent OS wraps the evolution in a harness — every step goes through trust gates, every human interaction is captured as feedback, every correction improves the system. The seed grows into a tree, and the tree gets stronger with every growth cycle.

---

## Summary of Options for Agent OS

### Option A: Workspace-First (Notion/Asana Model)

Build Agent OS as a workspace where users primarily enter work (goals, tasks, questions). Processes are internal skills. The primary interface is a task/goal management surface with agents as teammates.

- **Entry point:** User creates goals, tasks, captures notes
- **Agent interaction:** Agents are workspace members, @mentionable, assigned to work
- **Process role:** Internal capability — invisible unless user wants to see how work gets done
- **Daily feel:** "I work here" — always open, task list, goal tracking, conversation

**Pros:** Familiar to non-technical users. Matches how people think about work. Natural daily engagement.
**Cons:** Massive surface area to build. Competing with Notion/Asana/Monday.com on their turf. Risk of losing the harness/trust differentiation.

### Option B: Structured Handoff (Paperclip Model)

Build Agent OS around structured tickets/work items with goal ancestry. The primary interface is a ticket queue + process graph. Work enters as tickets, gets routed to processes.

- **Entry point:** User creates tickets with goal context
- **Agent interaction:** Agents are workers in an org chart, processing tickets
- **Process role:** Visible — the process graph is primary navigation
- **Daily feel:** "I manage the system" — check tickets, approve results, adjust goals

**Pros:** Structured from day one. Goal ancestry gives context. Process graph as primary nav matches user's stated desire.
**Cons:** Ticket-centric feels bureaucratic for small businesses. Less conversational. Rob won't "create tickets" from his truck.

### Option C: Conversational Workspace with Structured Backend (Hybrid)

The entry point is conversation + capture (like Dust/OpenClaw). The backend is structured processes with trust/harness (like Paperclip). The process graph shows structure. Goals track progress.

- **Entry point:** Natural language — chat, voice, capture. System classifies and routes.
- **Agent interaction:** Conversation partners that have structured skills behind them
- **Process role:** Skills the system has — visible in the process graph but not the primary interaction
- **Daily feel:** "I talk to my business" — conversation + brief + review queue + process graph
- **Work lifecycle:** Ad-hoc → repeated → proposed as process → trusted process

**Pros:** Most natural for non-technical users. Matches Insight-027. Preserves the harness/trust differentiation. Unique positioning.
**Cons:** Hardest to build well. Conversational + structured is a design challenge. Risk of being "chatbot with extra steps."

### Option D: Work OS with Agent Layer (Monday.com/ClickUp Model)

Build a work management platform (boards, goals, tasks) and add an agent layer that executes within it.

- **Entry point:** Create items on boards, set goals, assign work
- **Agent interaction:** Agents are assignees, same as humans
- **Process role:** Automations/workflows that run on boards
- **Daily feel:** "I manage work" — boards, dashboards, goals, agents as team members

**Pros:** Proven model. Scales to teams. Familiar to Jordan and Nadia personas.
**Cons:** Directly competing with Monday.com/ClickUp. Their agent layer is already shipping. Hard to differentiate.

### Option E: Process Graph as Home (Original)

The process graph (Primitive 14, enhanced) IS the primary interface. Everything hangs off it — goals at the top, processes as nodes, tasks as items flowing through, human action steps highlighted.

- **Entry point:** The graph itself — click to add goals, processes, or capture work
- **Agent interaction:** Visible in the graph as process executors
- **Process role:** First-class visible nodes — but contextualised by goals above them
- **Daily feel:** "I see my business operating" — living graph + brief + review queue

**Pros:** Unique. No other product leads with a live process graph. Matches the user's stated desire to "see the process structure and connections." Differentiating.
**Cons:** Unfamiliar — users don't navigate via graph today. May work for Nadia/Jordan (systems thinkers) but overwhelm Rob/Lisa. Needs strong onboarding.

### How Options Map to Agent OS's Three Modes (Analyze/Explore/Operate)

| Option | Analyze mode | Explore mode | Operate mode |
|--------|-------------|-------------|-------------|
| **A: Workspace-First** | Data views within workspace | Conversation is pervasive, not modal | Task list + review queue |
| **B: Structured Handoff** | Reports within ticket system | Ticket creation is entry point | Ticket queue + process graph |
| **C: Conversational Hybrid** | Conversation can invoke analysis | Conversation IS the interface | Brief + review queue + graph |
| **D: Work OS** | Board views + dashboards | Board creation + agent setup | Board management + agents |
| **E: Process Graph Home** | Graph highlights gaps/patterns | Click graph to add/define | Graph shows live execution |

Note: Insight-027 questions whether the three modes need rethinking. Options C and E suggest conversation and graph could be pervasive layers rather than discrete modes.

---

## Notification and Attention Models

How workspace products decide what to surface is critical to the "daily brief" / "always-open home" feel. Brief observations:

| System | Attention model | What gets surfaced | Human control |
|--------|----------------|-------------------|---------------|
| **Notion** | Inbox + notifications | Mentions, page updates, agent completions | Notification preferences per page |
| **Asana** | Inbox + My Tasks | Assigned tasks, goal updates, agent actions | Priority filters, do-not-disturb |
| **Linear** | Inbox + Triage | Assigned issues, mentions, agent sessions | Notification rules per project |
| **Monday.com** | Notifications + "My Work" | Item assignments, due dates, agent outputs | Per-board notification settings |
| **ClickUp** | Inbox + AI Stand-ups | Assigned, due, blocked, AI summaries | Priority and snooze controls |
| **Paperclip** | Dashboard + cost alerts | Budget warnings, task completions, approvals needed | Budget thresholds |

Common pattern: all workspace products have an **inbox/notification center** that aggregates attention demands. Agent OS's Daily Brief (Primitive 1) serves this role, but may need to extend to a persistent inbox that captures both agent outputs needing review AND human action tasks from process steps.

---

## 9. Meta-Process Architecture — The System Runs ON Itself

### The Question

Should Agent OS's core orchestration capabilities (intake, routing, decomposition, improvement, trust evaluation) be implemented as code functions or as **processes with agents going through the same harness**?

### What Existing Systems Do

| System | How orchestration is implemented | Self-referential? |
|--------|--------------------------------|-------------------|
| **Manus AI** | Hardcoded Planner module + orchestrator | No — orchestration is a fixed code layer |
| **Claude Cowork** | Hardcoded plugin dispatch + sub-agent spawning | No — the plugin system is static infrastructure |
| **Paperclip** | Hardcoded org chart + delegation rules | No — the hierarchy is configured, not evolved |
| **Mastra** | Hardcoded workflow engine (`.then()`, `.branch()`) | No — the engine is a library, not a process |
| **Asana** | Hardcoded Work Graph + AI Teammates rules | No — the graph structure is platform code |
| **Notion** | Hardcoded agent runtime + trigger system | No — agent infrastructure is fixed |

**No system surveyed runs its own orchestration through its own governance model.** In every case, the orchestration layer is hardcoded infrastructure that doesn't earn trust, receive feedback, or improve through the same mechanisms as user-facing work.

### What Agent OS Could Do Differently

ADR-008 already defines seven system agents. With the workspace reframe, these become **meta-processes** — processes that drive the framework itself:

| Meta-process | Agent | Purpose | Trust-governed? |
|-------------|-------|---------|----------------|
| **Work intake** | Intake agent | Classifies inputs (question/task/goal/insight), routes to right process | Earns trust in routing accuracy |
| **Goal decomposition** | Orchestrator agent | Breaks goals into tasks, assigns to processes, tracks progress | Earns trust in decomposition quality |
| **Daily brief synthesis** | Brief-synthesizer | Assembles morning brief from all process states | Earns trust in prioritisation |
| **Trust evaluation** | Trust-evaluator | Checks upgrade/downgrade eligibility after feedback | The system trusts its own trust evaluator |
| **Improvement scanning** | Improvement-scanner | Detects patterns across processes, proposes improvements | Earns trust in suggestion quality |
| **Process discovery** | Process-discoverer | Notices repeated ad-hoc work, proposes new processes | Earns trust in pattern detection |
| **Work routing** | Router agent | Matches tasks to the right process based on capabilities | Earns trust in routing accuracy |

The key property: **these meta-processes go through the same harness pipeline as user processes.** They start supervised (human sees every routing decision, every decomposition). They earn trust. They get corrected. They improve. The system that governs user work is itself governed by the same system.

This is not productised by any system in the survey. It is original to Agent OS.

---

## 10. Build-From Assessment: Three Key Repositories

Three open-source projects map to different layers of the Agent OS interaction model:

### Mastra (`mastra-ai/mastra`) — Orchestration Engine

- 22.1K stars | TypeScript | Active March 2026
- Graph-based workflow engine: `.then()`, `.branch()`, `.parallel()`
- Suspend/resume for HITL (covered in Section 3)
- Layered memory: conversation history + working memory + semantic recall
- Agents reason about goals internally, iterate until final answer
- Integrates with Vercel AI SDK for frontend
- Built-in evals and observability

Relevance: **HIGH for Layer 2-3.** Meta-processes could run on Mastra's workflow engine. The suspend/resume pattern handles human action steps. The memory layers map to Agent OS's two-scope memory model. Already in landscape.md but underweighted given the workspace reframe.

Source: [Mastra GitHub](https://github.com/mastra-ai/mastra)

### Vercel AI SDK (`vercel/ai`) — Interaction Layer

- Provider-agnostic TypeScript toolkit for AI-powered applications
- `useChat` hooks for React — conversation interface primitives
- Multi-step tool use with **generative UI** — each tool result renders as a custom React component
- Tool execution approval (AI SDK 6) — human-in-the-loop at tool level
- Structured output via Zod schemas
- Agent DevTools for inspecting each step, token usage, timing
- Streaming protocols for real-time progress

Relevance: **HIGH for Layer 6 (conversation layer).** The multi-step generative UI pattern — user asks, agent calls tools (processes), each result renders as a component — is exactly how "chat with my business" works. Tool execution approval maps to trust gates. The `useChat` hook is the interaction primitive for pervasive conversation.

Source: [Vercel AI SDK GitHub](https://github.com/vercel/ai), [Multi-step generative UI](https://vercel.com/academy/ai-sdk/multi-step-and-generative-ui)

### OpenUI (`thesysdev/openui`) — Dynamic UI Rendering

- 2.1K stars | TypeScript | Streaming-first generative UI framework
- **OpenUI Lang** — compact language for LLM-generated UI (67% fewer tokens than JSON)
- Progressive rendering — UI appears as LLM streams, not after completion
- Component library constrained — LLM can only output components you've defined
- Works with shadcn, Radix (Agent OS's planned stack)
- Near 0% malformed output

Relevance: **MEDIUM-HIGH for Phase 10.** ADR-009 said "no ViewSpec protocol." OpenUI is lighter than a protocol — it's a streaming language for constrained component rendering. Relevant for: Output Viewer (Primitive 6) rendering different output types, Daily Brief composition, dynamic process card content. Makes the workspace feel alive through progressive rendering.

Source: [OpenUI GitHub](https://github.com/thesysdev/openui), [OpenUI docs](https://www.openui.com/docs/openui-lang)

### How They Stack Together

```
┌─────────────────────────────────────────────────┐
│  INTERACTION LAYER (Layer 6)                     │
│  Vercel AI SDK (useChat, streaming, tool loop)   │
│  + OpenUI (progressive component rendering)      │
├─────────────────────────────────────────────────┤
│  ORCHESTRATION LAYER (Layer 2-3)                 │
│  Mastra (workflows, suspend/resume, memory)      │
│  + Agent OS harness (trust, review, learning)    │
├─────────────────────────────────────────────────┤
│  PROCESS LAYER (Layer 1)                         │
│  Agent OS (process definitions, goal ancestry,   │
│  meta-processes, feedback capture, trust earning)│
└─────────────────────────────────────────────────┘
```

---

## Gaps Where No Existing Solution Fits

1. **Self-referential meta-process architecture** — no system runs its own orchestration through its own governance model. Original to Agent OS.
2. **Reactive-to-repetitive lifecycle** — no product explicitly tracks work maturing from ad-hoc to automated. Original to Agent OS.
3. **Trust earning on work inputs** — all surveyed systems apply trust to execution, not to the input/routing layer. Agent OS's trust model is unique.
4. **Goal → process routing with harness** — no system routes goal-decomposed tasks through a trust-gated harness pipeline. Original to Agent OS.
5. **Human action step + trust gate** — none of the HITL patterns integrate with a trust tier system. Original.
6. **Process graph with goal hierarchy AND live execution state** — Paperclip shows org charts, Asana shows Work Graph, Sim Studio shows execution DAGs. No product combines all three.

---

## Sources

- [Notion 3.0 release](https://www.notion.com/releases/2025-09-18)
- [Notion 3.3 Custom Agents](https://www.notion.com/releases/2026-02-24)
- [Asana Work Graph](https://asana.com/resources/work-graph)
- [Asana Fall 2025 release](https://asana.com/inside-asana/fall-release-2025)
- [ClickUp Brain](https://clickup.com/brain)
- [Linear for Agents](https://linear.app/agents)
- [Monday.com AI agents](https://ir.monday.com/news-and-events/news-releases/news-details/2026/monday-com-Welcomes-AI-Agents-to-Its-Platform-Marking-a-Shift-in-How-Work-Gets-Done/default.aspx)
- [Dust product](https://dust.tt/home/product)
- [Dust MCP blog](https://blog.dust.tt/mcp-and-enterprise-agents-building-the-ai-operating-system-for-work/)
- [Paperclip](https://paperclip.ing/)
- [Paperclip GitHub](https://github.com/paperclipai/paperclip)
- [Mastra HITL docs](https://mastra.ai/docs/workflows/human-in-the-loop)
- [Mastra Suspend & Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Trigger.dev wait-for-token](https://trigger.dev/docs/wait-for-token)
- [Trigger.dev waitpoints](https://trigger.dev/changelog/waitpoints)
- [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [Inngest HITL](https://agentkit.inngest.com/advanced-patterns/human-in-the-loop)
- [Inngest waitForEvent](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event)
- [Sim Studio HITL block](https://docs.sim.ai/blocks/human-in-the-loop)
- [AI Workflow Automation Trends](https://www.cflowapps.com/ai-workflow-automation-trends/)
- [Monday.com AI Report 2026](https://monday.com/blog/project-management/ai-report/)
- [Manus AI technical investigation](https://gist.github.com/renschni/4fbc70b31bad8dd57f3370239dccd58f)
- [Manus AI analytical guide](https://www.baytechconsulting.com/blog/manus-ai-an-analytical-guide-to-the-autonomous-ai-agent-2025)
- [Claude Cowork enterprise blog](https://claude.com/blog/cowork-plugins-across-enterprise)
- [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Claude Cowork VentureBeat](https://venturebeat.com/orchestration/anthropic-says-claude-code-transformed-programming-now-claude-cowork-is)
- [Mastra GitHub](https://github.com/mastra-ai/mastra)
- [Vercel AI SDK GitHub](https://github.com/vercel/ai)
- [Vercel AI SDK multi-step generative UI](https://vercel.com/academy/ai-sdk/multi-step-and-generative-ui)
- [OpenUI GitHub](https://github.com/thesysdev/openui)
- [OpenUI docs](https://www.openui.com/docs/openui-lang)
