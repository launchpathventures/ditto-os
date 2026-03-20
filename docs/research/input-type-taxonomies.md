# Research: Standardised Input Type Taxonomies for Process/Task Management Systems

**Date:** 2026-03-19
**Status:** complete
**Researcher:** Dev Researcher

---

## Current State in Agent OS

The Quick Capture primitive (Primitive 12, defined in `docs/human-layer.md` line 548 and `docs/architecture.md` line 372) currently distinguishes only two input types: **"New task"** vs **"Just context"**. The architecture defines process inputs with Source + Trigger but not standardised input types. The Capture-Classify-Route pipeline is defined as a five-step process: transcribe, classify, extract action items, add to the right place, surface if actionable.

---

## 1. Work Item Type Taxonomies in Project Management Tools

### Linear

Linear uses a four-level hierarchy:

| Level | Object | Description |
|-------|--------|-------------|
| 1 | **Initiative** | Highest level. A curated list of projects representing a company-level goal. Contains key results. |
| 2 | **Project** | Groups issues toward a specific, time-bound deliverable. Can span multiple teams. |
| 3 | **Milestone** | Subdivisions within a project representing meaningful stages of completion. |
| 4 | **Issue** | The atomic unit. Has priority, estimate, label, due date, assignee, unique identifier (e.g., "ENG-123"). |

Supporting constructs: **Cycles** (repeating time-boxed groupings, similar to sprints), **Labels** (categorisation), **Workflows** (ordered statuses per team, including Backlog and Triage), **Issue Views** (dynamic groupings based on filters).

Issues do not have sub-types in the Jira sense. Differentiation comes from Labels and Workflows, not from type hierarchies.

Sources: Linear Conceptual Model, Linear Projects, Linear Project Milestones

### Jira

Jira uses a configurable hierarchy with default types:

| Level | Type | Description |
|-------|------|-------------|
| 1 | **Epic** | Large initiative spanning multiple sprints. Container for stories, tasks, and bugs. |
| 2 | **Story** | User-facing value unit. "As a user, I want..." |
| 2 | **Task** | Work that needs to be done (not necessarily user-facing). |
| 2 | **Bug** | A defect that impairs or prevents product function. |
| 3 | **Sub-task** | A piece of work required to complete a parent task/story. Cannot have children. |

Key distinction: Jira has explicit **type semantics** (Story vs Task vs Bug) at the same hierarchy level. Epics are parents; stories, tasks, and bugs are siblings; sub-tasks are children.

Sources: Atlassian Issue Types, Jira Issue Types Explained

### Asana

Asana uses a pyramid hierarchy:

| Level | Object | Description |
|-------|--------|-------------|
| 1 | **Goals** | High-level objectives. Can have sub-goals. Connect to projects/portfolios. |
| 2 | **Portfolios** | Collections of projects (or nested portfolios). |
| 3 | **Projects** | Collections of tasks. Viewable as list, board, timeline, calendar. |
| 3a | **Sections** | Groupings within a project (categories, workflow stages, priorities). |
| 4 | **Tasks** | Basic unit of action. Can be "multi-homed" across multiple projects. |
| 5 | **Subtasks** | Up to 5 levels deep. |

Special task types: **Milestones** (key moment), **Approvals** (requiring sign-off), **Custom Task Types**.

Sources: Asana Object Hierarchy, Asana Hierarchy

### Notion

Notion does not impose a fixed hierarchy. Instead, it provides **databases with properties** that teams configure:

- Built-in "Projects & Tasks" template uses two linked databases: **Projects** and **Tasks**
- Tasks database includes a **Task type** property with default values: **Task**, **Bug**, **Feature Request**
- Teams add custom properties (Priority, Status, Sprint, etc.)
- **Database templates** pre-fill pages for recurring work types
- Hierarchy is built through **relations** between databases

Key pattern: types are user-defined via database properties, not system-imposed.

Sources: Notion Three Key Databases, Notion Database Templates

### GitHub

GitHub uses a flat structure with layered classification:

| Object | Description |
|--------|-------------|
| **Issue** | Work item. No built-in sub-types (until recently). |
| **Pull Request** | Code change proposal. |
| **Discussion** | Open-ended conversation (Q&A, ideas, announcements). |
| **Project** | Board/table/roadmap view aggregating issues and PRs. |

Classification layers: **Labels**, **Issue Templates** (YAML forms), **Issue Forms** (structured input fields), **Discussion Categories**. GitHub recently introduced **Issue Types** as a first-class feature.

Sources: GitHub Issue Templates, GitHub Issue Forms Syntax

### Shortcut (formerly Clubhouse)

Three-level hierarchy:

| Level | Object | Description |
|-------|--------|-------------|
| 1 | **Objective** | Strategic (with key results) and Tactical (connected to tasks/projects). |
| 2 | **Epic** | Collection of stories representing a larger body of work. |
| 3 | **Story** | The atomic work item. Enhanced with Custom Fields. |

Sources: Shortcut Migration Guide, Shortcut Milestones & Epics

---

## 2. GTD and Personal Productivity Input Classification

### GTD Methodology (David Allen)

The GTD "Clarify" step decision tree:

```
Inbox Item
├── Is it actionable?
│   ├── YES
│   │   ├── Will it take < 2 minutes? → DO IT NOW
│   │   ├── Is it a multi-step outcome? → PROJECT
│   │   ├── Am I the right person? → DELEGATE (Waiting For list)
│   │   └── Single next action → NEXT ACTION (organised by context)
│   └── NO
│       ├── Is it trash? → DELETE
│       ├── Might be useful someday? → SOMEDAY/MAYBE
│       └── Useful reference? → REFERENCE
```

The critical GTD insight for Agent OS: **the first classification is binary (actionable vs non-actionable), not type-based.** Type emerges from the second question ("what kind of actionable?").

Sources: GTD Wikipedia, Todoist GTD Guide, FacileThings Clarify Stage

### Things 3 (Cultured Code)

Two axes: **when** (temporal views) and **what** (organizational containers).

Temporal views: **Inbox** (unprocessed) → **Today** → **Upcoming** → **Anytime** → **Someday**

Organizational containers: **Areas** (ongoing, never complete) → **Projects** (completable, time-bound)

Sources: Things Support, Things Getting Productive Guide

### Todoist

Flat task model with layered metadata: **Projects** (nestable), **Sections**, **Tasks** (with sub-tasks), **Labels** (cross-project tags), **Priorities** (P1-P4). No explicit task types — differentiation from labels and project membership.

Sources: Todoist Labels & Filters, Todoist Priorities

### Tiago Forte's PARA Method

| Category | Definition | Key Property |
|----------|-----------|-------------|
| **Projects** | Active efforts with a goal and deadline | Time-bound, completable |
| **Areas** | Ongoing responsibilities with standards to maintain | No end date, continuous |
| **Resources** | Topics of interest, reference material | No commitment, just interest |
| **Archives** | Inactive items from the other three categories | Completed/deferred |

Key insight: organisation mirrors actionability, not subject matter. Same content moves between categories as actionability changes.

Sources: Forte Labs PARA, Todoist PARA Guide

---

## 3. Business Process Input Types (Formal Methodologies)

### APQC Process Classification Framework

Five-level taxonomy: Category > Process Group > Process > Activity > Task

13 top-level categories (5 Operating, 8 Management & Support), containing 1,000+ processes. Provides standard vocabulary for what kinds of processes exist and what inputs feed them.

Sources: APQC Process Frameworks

### BPMN Start Event Types

BPMN 2.0 defines how processes are triggered:

| Start Event Type | Trigger | Description |
|-----------------|---------|-------------|
| **None** | Manual/default | Process starts immediately when instantiated. |
| **Message** | Incoming message | Point-to-point: specific message triggers specific process. |
| **Timer** | Time condition | Specific time, after duration, or recurring schedule. |
| **Signal** | Broadcast signal | Like Message but broadcast — multiple processes can catch. |
| **Conditional** | Boolean condition | Process starts when data condition becomes true. |
| **Error** | Error event | (Sub-process only) Error-handling flow. |
| **Escalation** | Escalation code | (Sub-process only) Starts on escalation. |
| **Compensation** | Compensation trigger | (Sub-process only) Undo flow. |
| **Multiple** | Any of several | Fires on any one trigger. |
| **Parallel Multiple** | All of several | Fires only when all triggers have fired. |

Key distinction: **Message** is point-to-point; **Signal** is broadcast; **Conditional** is data-driven.

Sources: Camunda BPMN Reference, Red Hat BPMN Events, ProcessMind BPMN Start Events

### ITIL Service Management Input Types

| Type | Definition | Nature |
|------|-----------|--------|
| **Incident** | Unplanned interruption or quality reduction | Reactive, restore service ASAP |
| **Service Request** | Pre-defined, low-risk standard request | Proactive, follows agreed workflow |
| **Problem** | Root cause investigation of incidents | Analytical, prevent recurrence |
| **Change Request** | Proposal to modify a service/system | Planned, risk-assessed |
| **Event** | Monitoring alert or state change | Automated, early warning |

ITIL insight for Agent OS: **inputs are classified by what response they require**, not by their content.

Sources: BMC Helix ITIL Ticket Types, PDCA ITIL Ticket Types, Beyond20 Incident vs Problem vs Request

---

## 4. AI Agent Input Patterns in the Wild

### Claude Code

Input types: natural language prompts, slash commands (SKILL.md with YAML frontmatter), file references, @-mentions, $ARGUMENTS, images/screenshots.

Sources: Claude Code Slash Commands

### GitHub Copilot Coding Agent

Input pathways: issue assignment (assign to @copilot), issue comment (@copilot mention), IDE prompt, CLI prompt. Agent reads full issue context (title, body, labels, linked issues). Agent Skills (folders with instructions, scripts, resources) load automatically when relevant.

Sources: GitHub Copilot Coding Agent, GitHub Copilot Agent Announcement

### Linear + Open SWE

Comment `@openswe` on any Linear issue. Agent reads full issue context, reacts with emoji to acknowledge, posts results as comments. Linear's Agent Interaction SDK provides structured status communication.

Sources: LangChain Open SWE, Linear Agent SDK, Linear Agents

### Devin

Input: natural language via Slack, web interface, or Jira assignment. Devin parses into execution plan that user modifies before approving. No structured input taxonomy — classification is internal.

Sources: Devin Documentation

### Common Pattern Across AI Agent Inputs

All systems share a convergent architecture:
1. **Receive** — natural language, possibly with attached context
2. **Parse** — extract intent, entities, and context
3. **Plan** — generate execution plan
4. **Confirm** — present plan for human approval/modification
5. **Execute** — run the approved plan

**None require the user to pre-classify input into types. Classification is the system's job.**

---

## 5. The Capture-to-Action Pipeline

### Quick Capture in Consumer Task Apps

- **Apple Reminders:** text, Siri voice, location triggers, URL/document links, photos. No type classification.
- **Google Tasks:** text, email conversion (Gmail → task). Simple lists only.
- **Microsoft To Do:** text, Cortana voice, Outlook email flagging. My Day / Important / Planned views.

### Voice Assistant Intent Classification

Three-stage pipeline: ASR (audio → text) → NLU (text → intent + entities) → Dialogue Management (route to service).

Domain-level intents: Smart Home, Music/Media, Information, Communication, Commerce, Productivity, Navigation.

Within each domain: **Command** (direct action), **Query** (information request), **Conversational** (open-ended).

Sources: Shaip Voice Assistants, FlowHunt Intent Classification

### Chatbot Intent Classification

High-level categories: **Informational**, **Transactional**, **Navigational**, **Feedback**.

Rasa framework primitives: **Intents** (user's goal) + **Entities** (extracted parameters).

Sources: AIMultiple Chatbot Intent, Rasa Intents and Entities

### Email Triage Classification

**Superhuman 4Ds:** Delete / Delegate / Do / Defer

**Hey.com Three Streams:** Imbox (important) / The Feed (newsletters) / The Paper Trail (transactional). Classification at the **sender level**, not message level.

Sources: Superhuman Email Triage, Hey.com How It Works

---

## Summary of Classification Dimensions

Across all five domains, six recurring dimensions emerge:

| Dimension | Present In | Examples |
|-----------|-----------|---------|
| **Actionability** | GTD, PARA, email triage, Things 3 | Actionable now / later / never / reference / trash |
| **Hierarchy level** | All PM tools | Goal / initiative / project / task / subtask |
| **Semantic type** | Jira, ITIL, GitHub, Notion | Bug / feature / task / incident / request / change |
| **Urgency/timing** | Things 3, Todoist, ITIL, email triage | Now / scheduled / someday / never |
| **Trigger mechanism** | BPMN | Human message / timer / signal / condition / error |
| **Response required** | ITIL, chatbot NLU, voice assistants | Restore / fulfil / investigate / plan / inform |
