# Brief: Phase 10 MVP — The Living Workspace

**Date:** 2026-03-24
**Status:** superseded by Brief 038 (Phase 10 MVP Architecture parent brief)
**Depends on:** Brief 035 (Credential Vault), Brief 036 (Process I/O) — both building in parallel
**Unlocks:** Engine tuning driven by dashboard visibility (Insight-070), first real user-facing product

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard — The Living Workspace
- **Capabilities:** Work surface, contextual feed, conversation with Self, process visualization, review/approval flows, capability map

## Context

Ditto has a working engine: 6 architecture layers proven end-to-end, 236+ tests, Conversational Self, multi-provider LLM support, integration infrastructure, trust tiers, memory, metacognitive checks. But the only user surface is Telegram (dogfooding) and CLI (developer tooling).

Phase 10 transforms Ditto from engine to product. The dashboard is not just a UI layer — it IS the instrument for proving and tuning the engine (Insight-070). Every rough edge in the engine shows up immediately when you're looking at the actual workspace.

### Design Insights (Hard Constraints)

| # | Insight | Constraint |
|---|---------|-----------|
| 067 | Conversation is alignment, work surface is manifestation | Two gravitational centers: work surface (primary, living) and conversation surface (purposeful, on-demand) |
| 070 | Dashboard as engine proving ground | Build UI to prove the engine. The dashboard tells us what the engine needs next. Expose engine internals for tuning. |
| 071 | Conversation-first work creation | Every piece of work starts as a conversation with the Self. Forms for power users. Conversation is the default. |
| 072 | Processes are living roadmaps | Everything gets a process (same YAML). Domain = pre-defined, repeatable. Generated = on-demand living roadmaps. Library is emergent — patterns detected, domain processes distilled from real work. Never thrown away. |
| 073 | User language, not system language | No "goals," "tasks," "processes," "trust tiers" in the UI. The user's words are the labels. The system classifies invisibly. "Henderson quote — Friday" not "Task #47." |

### Personas (from personas.md)

Primary: **The Outcome Owner** — responsible for results, has high standards, spends time on operational work beneath their capability, pragmatic, not a prompt engineer or workflow designer, regularly away from desk. They will review outputs and make corrections — that's the job they already do.

Four personas: Rob (trades business MD), Lisa (ecommerce), Jordan (generalist technologist), Nadia (team manager). All non-technical. All have tried AI and hit the reinvention problem. Nadia's full team governance UX is Phase 13, but her single-user perspective applies in the MVP.

### Two Design Principles (from personas.md)

1. **One process must be valuable.** Value from a single process, not requiring an organizational setup.
2. **Mobile must be seamless, not primary.** Desktop is where most work happens. Mobile is a supporting surface. (Deferred to Phase 13 for native mobile.)

## Non-Goals

- Native mobile app (Phase 13)
- Full 16 primitives and 8 views from human-layer.md (this is the MVP cut)
- Multi-tenancy (Phase 13)
- Process discovery from organizational data (Phase 11)
- Analyze mode (Phase 11)
- Full Learning layer — "Teach this," correction pattern extraction (Phase 8)
- Cognitive model fields (Phase 8)
- Process Builder visual editor (deferred — conversation-first creation is the MVP path)

## Research Inputs

| Report | What it provides |
|--------|-----------------|
| `phase-10-dashboard-workspace.md` | 10 AI workspace products, HITL oversight, process visualization, tech stack, AI Elements deep dive, rendering architecture, component stack |
| `human-in-the-loop-interface-patterns.md` | 5-layer oversight stack, context overload patterns, decision fatigue prevention, novel patterns (quiet shift report, tide line, correction velocity, 3-2-1 review) |
| `work-context-feed-patterns.md` | 11 work-context feed products, feed UX mechanics, AI-enriched feeds, rendering architectures |
| `rendered-output-architectures.md` | json-render deep extraction, catalog/registry/renderer pattern |
| `workspace-interaction-model.md` | 14 workspace/automation products, workspace vs automation distinction |

## The User's World

### What the user sees (their language)

The user sees **their work in their words**:
- "Henderson quote — Friday" (with progress)
- "Supplier updates — daily" (running quietly)
- "Sort out invoicing" (the plan the Self proposed)

They do NOT see: Task #47, Process: invoice-reconciliation, Trust tier: spot-checked, Work item type: goal.

### Three surfaces

**1. Work surface (primary — the feed)**

A scrollable, contextual, actionable feed of what's happening. Each item is in the user's language. Items include:
- **Quiet shift report** — narrative of what happened since last visit (top card)
- **Work updates** — "Henderson quote: draft ready for review"
- **Review needed** — output awaiting approval, with 3-2-1 review format (3 facts, 2 options, 1 action)
- **Insights** — pattern detected, recommendation, anomaly
- **Process outputs** — rendered views from processes (json-render inside cards)
- **Exceptions** — something wrong, blocked, unusual

Feed UX patterns (from research):
- Progressive disclosure: summary → expand → full detail (Slack "Peek")
- Inline actions: approve/reject/comment right from the card (Asana)
- Entity grouping: cluster updates by work item, not just chronologically (Notion)
- AI-driven priority splitting: system classifies by urgency (Superhuman)
- Auto-summary per item: one-line summaries (Superhuman)

Feed rendering: Standard React component registry (discriminated union on item type). Known types, no json-render spec layer for the feed scaffold. Process output content within cards uses json-render.

**2. Conversation surface (purposeful — the Self)**

Available on demand (right panel or overlay). The Self is the primary interaction surface for:
- Creating work: "I need to get that Henderson quote done by Friday"
- Getting briefed: "What happened while I was away?"
- Refining processes: "The podcast process skips the intro — fix that"
- Asking questions: "Why are bathroom quotes always late?"
- Quick capture: "Remember that copper pipe prices went up 20%"

The Self helps define work through conversation, creates living roadmap processes, decomposes goals, and routes to existing domain processes. It uses the user's language, not system vocabulary.

**3. Systems view (on demand — capability map)**

A visual map of "how my operation works":
- Business functions / areas with processes under each
- Which agents handle what
- Health status per process (running smoothly, needs attention, not set up)
- Gaps where no process exists yet
- Drill into any process to see how it works, its steps, trust data, performance

This uses @xyflow/react (Canvas/Node/Edge components from AI Elements). Not daily use — accessed when the user wants the big picture.

### What the user can do

| Action | How | Surface |
|--------|-----|---------|
| Create work | Talk to the Self | Conversation |
| Quick capture | Type/speak, minimal friction | Always-available input |
| Review outputs | 3-2-1 review in feed cards, or drill into detail | Feed |
| Approve/reject | Inline buttons on feed cards | Feed |
| See what's happening | Scroll the feed | Feed |
| Get briefed | Self delivers quiet shift report | Feed + Conversation |
| See the plan | Drill into work item → see living roadmap steps | Process detail |
| Refine a process | Conversation with Self, or direct edit | Conversation + Process detail |
| See the big picture | Capability map | Systems view |
| Check on recurring work | Process cards in feed or capability map | Feed + Systems view |

## Layout Blueprint

Based on the AI SDK Elements IDE example, adapted for Ditto:

```
┌─────────────┬──────────────────────────┬──────────────────┐
│ LEFT        │ CENTER                   │ RIGHT            │
│ Navigation  │ Work Surface             │ Self Panel       │
│ (w-64)      │ (flex-1)                 │ (w-80)           │
│             │                          │                  │
│ My Work     │ Feed                     │ Current Plan     │
│ (active     │ (scrollable, contextual, │ (living roadmap  │
│  items,     │  actionable — primary    │  for active work │
│  deadlines) │  daily surface)          │  — Plan + Task   │
│             │                          │  components)     │
│ Recurring   │ OR                       │                  │
│ (domain     │                          │ Needs Attention  │
│  processes  │ Process Detail           │ (pending reviews │
│  running)   │ (drill-in: steps,        │  — Queue comp.)  │
│             │  outputs, trust,         │                  │
│ Map         │  performance)            │ Conversation     │
│ (capability │                          │ (Self — uses     │
│  map link)  │ OR                       │  Conversation +  │
│             │                          │  Message +       │
│ Settings    │ Capability Map           │  Reasoning)      │
│             │ (systems view —          │                  │
│             │  Canvas + Node)          │ PromptInput      │
│             │                          │ (rich compound   │
│             │                          │  input: text,    │
│             │                          │  voice, attach)  │
└─────────────┴──────────────────────────┴──────────────────┘
```

**Right panel hierarchy (from IDE example pattern):**
Plan → Queue → Conversation. Structure above conversation. The user sees what's planned, what needs attention, then the conversation surface.

## Tech Stack

### Depend (npm install)
- **Next.js** (App Router) — Server Components, Server Actions, streaming
- **React 19** — framework
- **shadcn/ui** — base primitives (Card, Tabs, Sidebar, Button, Dialog, etc.)
- **@xyflow/react** — process graph, capability map (MIT, 26k+ stars)
- **Vercel AI SDK v6** — `useChat`, streaming, tool call rendering
- **TanStack Query v5** — data fetching, cache invalidation (Paperclip SSE pattern)
- **Tailwind CSS v4** — styling

### Adopt (copy source, own it — Apache 2.0)
- **AI SDK Elements** (~12 components): Plan, Task, Queue, Confirmation, Conversation, Message, PromptInput, Reasoning, Chain of Thought, Attachments, Canvas/Node/Edge, Checkpoint, Context, Agent
- **json-render** (Vercel Labs): Catalog → Registry → Renderer for process output rendering within cards (per ADR-009 v2)

### Pattern (study approach, implement our way)
- **AG-UI event taxonomy** — lifecycle + content + state + activity + reasoning events for engine-to-frontend streaming (evaluate: adopt protocol vs pattern-only)
- **Paperclip UI patterns** — three-column layout, SSE + React Query cache invalidation, inline audit trail, budget enforcement as hard stop

## Rendering Architecture (Three Layers)

| Layer | What | Technology | When |
|-------|------|-----------|------|
| **Workspace chrome** | App UI: navigation, feed, conversation, cards, review flows | React + shadcn/ui + AI Elements | Always — the app itself |
| **Process output content** | AI-generated views inside cards (dashboards, reports, data) | json-render catalog/registry/renderer | When a process produces a view-type output |
| **Conversational UI** | Self's responses, reasoning, inline outputs | AI SDK `useChat` + Elements | In conversation panel |

## MVP Scope — What to Build First

### Must have (proves the workspace model)
1. **Feed** — scrollable, contextual, actionable. Known item types rendered via React component registry. Quiet shift report as top card.
2. **Conversation with Self** — right panel. Work creation, briefing, questions. Uses `selfConverse()` backend, `useChat` frontend.
3. **Review flow** — approve/reject/edit on feed cards (Confirmation component). This is the core human-in-the-loop loop.
4. **Navigation** — left sidebar with active work items and recurring processes.
5. **Process detail** — drill into a work item to see the living roadmap (Plan + Task components) or domain process steps.

### Should have (completes the proving ground)
6. **Capability map** — systems view with Canvas/Node components. Business functions, processes, agents, health.
7. **Engine transparency** — trust decisions, memory assembly, routing choices visible when drilling into process detail. The "proving ground" view.
8. **Quick capture** — always-available input surface for raw context (text, voice, file).

### Deferred
- Process Builder visual editor (conversation-first is the MVP)
- Full 8 view compositions from human-layer.md
- Mobile-optimized views
- Batch review ("Approve batch" / "Spot-check N")
- "Teach this" learning bridge
- Digest mode for autonomous processes
- Data View, Evidence Trail primitives

## Review Process

This brief needs:
1. **Designer** (`/dev-designer`) — MVP scope validation, interaction design, user journey mapping
2. **Architect** (`/dev-architect`) — technical design, API surface, monorepo structure, sub-briefs
3. **Reviewer** — architecture checklist against this brief

## Companion Research & Insights

- Research: `docs/research/phase-10-dashboard-workspace.md` (primary)
- Research: `docs/research/human-in-the-loop-interface-patterns.md`
- Research: `docs/research/work-context-feed-patterns.md`
- Research: `docs/research/rendered-output-architectures.md`
- Insight-067: Conversation is alignment, work surface is manifestation
- Insight-070: Dashboard as engine proving ground
- Insight-071: Conversation-first work creation
- Insight-072: Processes are living roadmaps
- Insight-073: User language, not system language
- ADR-009 v2: Process output architecture (catalog rendering)
- ADR-010: Workspace interaction model
- ADR-011: Attention model
- ADR-016: Conversational Self
