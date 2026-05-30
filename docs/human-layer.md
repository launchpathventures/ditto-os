# Ditto — Human Layer Design

**Version:** 0.2.0
**Date:** 2026-03-31
**Status:** Draft — companion to architecture.md, updated to reflect what's actually built
**Scope:** Layer 6 (Human Layer) in full detail — interaction model, workspace architecture, rendering pipeline, UX philosophy

This document captures the design thinking behind the human-facing layer of Ditto. The architecture spec (`architecture.md`) defines WHAT the system does. This document defines HOW the user experiences it.

**Changelog:** v0.2.0 replaces the original 16-primitive, dashboard-centric design (v0.1.0, 2026-03-18) with the conversation-first, composition-engine architecture that was actually built in Phases 8-10. The six human jobs and design philosophy remain valid; the implementation model has fundamentally changed.

---

## Design Philosophy

### The Six Human Jobs

Every UI decision in Ditto is evaluated through the lens of six jobs a human performs in an agent organisation. These are universal — regardless of domain, role, or industry.

| Job | Question the human is asking | How it surfaces |
|-----|------------------------------|-----------------|
| **Orient** | "What's going on and what needs my attention?" | Today composition, Daily Brief, process status blocks, pipeline progress |
| **Review** | "Is this output right?" | Inline review prompts in conversation, artifact mode for deep review, approve/edit/reject actions |
| **Define** | "What needs to happen?" | Conversation with Self, onboarding flow, process proposal blocks |
| **Delegate** | "Who/what should do it and how much do I trust them?" | Trust control on process detail, session trust overrides, `adjust_trust` tool |
| **Capture** | "Here's something the system needs to know" | Prompt input (text + drag-drop), `quick_capture` tool, voice capture (future) |
| **Decide** | "What should change?" | Suggestion blocks, improvement proposals, risk signals woven into briefings |

**Design rule:** If a UI element doesn't clearly serve one of these six jobs, it doesn't belong.

### Everyone Will Be a Manager and Delegator

In the future, every knowledge worker manages and delegates to agents. This frames every design decision:
- The interface must be usable by someone who has never managed people or processes
- It must feel like working with a team, not configuring a system
- The platform guides, not requires — the human never needs to think "what do I configure next?"

### Conversation Is the Primary Interaction

The original design (v0.1.0) was dashboard-centric: a Home View with Daily Brief cards, a Review Queue as a standalone surface, a Process Builder as a separate pane. What was actually built — and what proved to be the right design — is **conversation-first**.

The user talks to the Conversational Self. Self understands intent, assembles context, delegates to processes, and renders structured results back into the conversation as ContentBlocks. The conversation IS the workspace.

This means (post-Brief 280/281 IA — the authenticated home is a single `/chat` Self conversation):
- **Orient** happens by asking Self in `/chat`; briefings, reviews, work, and process health render inline as ContentBlocks in that one conversation — not through a dashboard of cards or a separate composition canvas
- **Review** happens inline in conversation when Self surfaces review prompts, or in artifact mode for deep review (ADR-024) — not through a separate review queue page
- **Define** happens through conversation with Self, who proposes processes inline as a `ProcessProposalBlock` and solicits feedback — not through a dual-pane process builder
- **Capture** happens through the chat prompt input — not through a separate capture widget
- **Recall** happens through the chat-header Archive drawer (Brief 281), backed by the shared `recallWorkspace()` primitive over projects/processes/memories/work/reviews/recent-activity — not through scattered per-primitive index pages
- Legacy full-page destinations (`/process/[id]`, `/projects/[slug]`, `/memories/[id]`, `/review`, `/setup`, `/admin`) remain reachable as **drill-downs**, not as the home surface

### Three Activity Contexts

Different phases of work need different interfaces. These are fluid contexts, not hard mode switches:

| Context | Good for | How it works |
|---------|----------|--------------|
| **Analyze** | Understanding how the org actually works — connecting to systems, surfacing patterns | Conversation with Self + data blocks + chart blocks in response |
| **Explore** | Defining and refining processes — guided by evidence or from a blank canvas | Conversation with Self → `generate_process` tool → `ProcessProposalBlock` inline in the conversation |
| **Operate** | Execution, monitoring, review, improvement | Inline pipeline progress + inline review in the `/chat` conversation; composition queries reachable as drill-downs |

The magic is in the **transitions**: Analyze surfaces what's really happening → Explore crystallises that into process definitions → Operate runs them. And conversation flows across all three.

### Progressive Disclosure

Setup should feel like a frog slowly being boiled — the user never has a moment of "this is too much."

**Principles:**
- Ask one question at a time, never overwhelm
- Show structure being built alongside the conversation (process proposal blocks)
- Start with what the user knows (their pain point) and expand outward
- Never require AI terminology, workflow concepts, or technical configuration
- The AI fills in defaults from industry knowledge — the user corrects, not creates
- **Progressive reveal** (Brief 042): new users see conversation-only; workspace layout appears when first process is created

### AI Limitations Are the Platform's Problem

Most humans don't know AI likes to please, hallucinates, gets narrow in thinking, or tends to think every process is best solved with AI.

**The platform actively mitigates these.** The harness ensures:
- Agents check each other (adversarial review catches pleasing/hallucination)
- Quality criteria are specification-tested
- The system recommends non-AI solutions when appropriate (scripts, rules, human steps)
- Correction patterns are tracked and fed back into the harness

The human doesn't need to understand AI's limitations. The platform handles them.

---

## Workspace Architecture

### The Conversational Workspace Home (Brief 280/281)

> **History:** v0.1.0 specified a three-panel workspace (sidebar + composed-canvas center column + context-reactive right panel). Brief 280 inverted that IA after the launchpath owner diagnosed the panelled workspace as "everything chunked up into siloed chats with processes/tasks." The three-panel shell (`workspace-page.tsx`) was deleted. The durable design — and what is built — is a single conversation.

The authenticated post-Day-Zero home is **one `/chat` Self conversation**. There is no sidebar of composition intents and no context-reactive right panel; the conversation IS the workspace.

```
┌─────────────────────────────────────────────────────┐
│  ChatNav        ⌕ Archive          ⊙ {Self} status   │  ← header (Archive drawer, Brief 281)
├─────────────────────────────────────────────────────┤
│                                                       │
│   Conversation (Self ↔ User)                          │
│                                                       │
│   Artifacts render INLINE as ContentBlocks:           │
│   • ProcessProposalBlock / process status & runs      │
│   • ReviewCardBlock (approve/edit/reject inline)      │
│   • ProgressBlock (live pipeline progress)            │
│   • WorkItemFormBlock, briefing/knowledge blocks      │
│                                                       │
│   Deep review → Artifact Mode (ADR-024) overlays      │
│   this same surface; chat stays compact, does not     │
│   move to a different page.                            │
│                                                       │
├─────────────────────────────────────────────────────┤
│  Prompt Input (text + file drag-drop)                 │
└─────────────────────────────────────────────────────┘
```

**Key design decisions:**
- **One surface.** Post-Day-Zero, `/` routes to `/chat` (`entry-point.tsx`); `/chat` drives the AI SDK `useChat` against `/api/chat` → `selfConverseStream()` (the authenticated workspace Self stream, **not** the Network front-door engine).
- **Artifacts are inline.** Processes, reviews, work, briefings, and progress render as existing `ContentBlock` types in the conversation — no separate composition canvas, no per-primitive home pages.
- **Recall is the Archive drawer** (Brief 281), opened from the chat header, backed by the read-only shared `recallWorkspace()` primitive (see Layer 4/6 in `architecture.md`).
- **Drill-downs persist.** `/process/[id]`, `/projects/[slug]`, `/memories/[id]`, `/review`, `/setup`, `/admin` remain reachable from inline affordances; they are detail destinations, not the home.
- **Day Zero is preserved.** Configured workspace users are not server-redirected away from Day Zero before it has been seen/completed.
- **The front-door/workspace boundary for `/chat` is enforced by transport, not a runtime tool filter** — see "Boundary enforcement is transport-level" below and Insight-235.

### Boundary enforcement is transport-level (Insight-235)

`selfConverseStream()` passes the full workspace tool set and does **not** call `filterToolsForContext()`/`determineActionContext()`. The front-door restriction (research-only tools) is enforced inside the separate Network engine (`buildFrontDoorPrompt`), which `/chat` no longer reaches after the IA inversion. So `/chat` is workspace context **by construction** — because it is wired to the authenticated Self endpoint — not because a runtime filter gates each call. `action-boundaries`/`filterToolsForContext()` is the contract the Network front door enforces; the workspace Self stream is unfiltered on purpose. When reasoning about `/chat` safety, locate the enforcement seam (the endpoint/engine routing), not a plausible-sounding proxy table.

### Responsive Behavior

A single conversation column is inherently responsive: it reflows from desktop to mobile without a panel-collapse ladder. Artifact Mode uses a bottom sheet below 1024px (ADR-024); the chat prompt input stays pinned at the bottom at every breakpoint.

### Artifact Mode

When deep review or document work is needed, the workspace transitions to artifact mode (ADR-024):

```
┌──────────┬──────────────────────────────────┬──────────┐
│          │                                  │          │
│ CONVO    │        ARTIFACT HOST             │ CONTEXT  │
│ (300px)  │        (flex)                    │ (320px)  │
│          │                                  │          │
│ Compact  │  ContentBlock[] rendered via      │ Related  │
│ message  │  BlockList — the same block      │ context  │
│ thread   │  registry, just wider canvas.    │ for the  │
│          │  720px max-width.                │ artifact │
│          │                                  │          │
│          │  Lifecycle badge:                │          │
│          │  Approve / Edit / Reject         │          │
│          │                                  │          │
│          │  [Exit artifact mode →]          │          │
│          │                                  │          │
└──────────┴──────────────────────────────────┴──────────┘
```

**Key design decisions:**
- Artifact mode is a **layout mode**, not a modal — the conversation is still visible (compact)
- Artifacts render through the **same block registry** as everything else — no bespoke viewers (Insight-107)
- `start_dev_role` outputs >500 chars auto-promote to artifact mode
- Mobile: full-screen swipe artifact with bottom sheet for actions
- Back/close action exits artifact mode, returning to the conversation

### Navigation Model

> **Post-Brief 280:** there is no persistent sidebar on the home. **Composition intents are still real composition-engine queries** (the `compositions/*.ts` modules below are unchanged), but they are reached by asking Self in `/chat`, via the Archive drawer (Brief 281), or as drill-down destinations — not as a fixed sidebar of tabs. The table documents *what each intent composes*, not a navigation chrome that still exists.

Composition intents — each triggers a different query to the composition engine, which returns ContentBlock[]:

| Intent | What it shows | Blocks used | Module |
|--------|--------------|-------------|--------|
| **Today** | Daily brief, pending reviews, running pipelines, proactive suggestions | TextBlock (brief narrative), ReviewCardBlock, ProgressBlock, SuggestionBlock | `compositions/today.ts` |
| **Inbox** | Items needing attention — reviews, exceptions, suggestions | ReviewCardBlock, AlertBlock, SuggestionBlock | `compositions/inbox.ts` |
| **Work** | Active work items with status, running pipelines | StatusCardBlock, ProgressBlock, ChecklistBlock | `compositions/work.ts` |
| **Projects** | Process portfolio — health, trust, metrics | StatusCardBlock, MetricBlock, ChartBlock | `compositions/projects.ts` |
| **Routines** | Recurring processes, schedules, health | StatusCardBlock, DataBlock | `compositions/routines.ts` |
| **Growth** (Brief 140) | GTM pipeline plans, experiments, published content | StatusCardBlock, InteractiveTableBlock, ChecklistBlock, RecordBlock | `compositions/growth.ts` |
| **Library** (Brief 138, 168) | Process capability catalog + "Recommended for your business" section | RecordBlock (+ vivid variant), SuggestionBlock | `compositions/library.ts` |

The composition engine assembles these from real data (work items, process runs, trust data, `activeRuns`, etc.) — the human sees structured, context-aware content, not raw data.

**Pipeline progress (`activeRuns`) enrichment** (Brief 053): Today and Work compositions prepend `ProgressBlock` entries for running pipelines. `activeRuns` is queried from `CompositionContext` (populated server-side via `/api/processes?action=activeRuns`). SSE events (`step-complete`, `gate-pause`, `gate-advance`, `run-complete`, `run-failed`) invalidate the query key via `useHarnessEvents`. Brief 158 extended ProgressBlock with `"waiting"` status + `waitFor` metadata for wait-state visibility.

**Composition intent injection** (Brief 073): When the user starts a conversation from a composition intent, `intentContext` is passed to `selfConverseStream()` and injected into the Self's system prompt as `<intent_context>`. Routines → "focus on recurring cadence." Projects → "group work by parent goal." One Self, context-aware per intent. Empty states (`composition-empty-states.ts`) provide per-intent fallback blocks (TextBlock + ActionBlock + SuggestionBlock) when the query returns no data.

**Inline review prompt pattern** (Brief 053): When trust gate pauses a run, the `use-pipeline-review.ts` hook listens for `gate-pause`, fetches step output, exposes `pendingReview` state. The conversation UI renders a ReviewCardBlock inline with approve/edit/reject actions. User responds without navigating away. This is the "Review — inline in conversation" delivery of the Review job (vs artifact mode for deep review).

---

## The Rendering Pipeline

### ContentBlocks: The Universal Unit

Everything the user sees flows through **ContentBlocks** — typed, structured data units defined in `packages/core/src/content-blocks.ts` (re-exported from `src/engine/content-blocks.ts`) and rendered by the block registry (`packages/web/components/blocks/`).

**26 ContentBlock types** (discriminated union, exhaustiveness-checked — engine source is authoritative):

| Category | Block types | Purpose |
|----------|------------|---------|
| **Core** | TextBlock, ActionBlock, InputRequestBlock | Text, choices, form fields |
| **Status** | StatusCardBlock, ProgressBlock, AlertBlock | Process/item status, pipeline progress, attention needed |
| **Review** | ReviewCardBlock, SuggestionBlock, TrustMilestoneBlock | Inline review surface, proactive suggestions, trust upgrade/downgrade celebrations (Brief 160) |
| **Data** | DataBlock, ChartBlock, MetricBlock, RecordBlock (+`"vivid"` variant), InteractiveTableBlock | Structured data in various formats |
| **Knowledge** | KnowledgeCitationBlock, ReasoningTraceBlock | Provenance, decision reasoning |
| **Visual** | ImageBlock, CodeBlock | Images, syntax-highlighted code |
| **Onboarding** | KnowledgeSynthesisBlock, ProcessProposalBlock (+interactive mode, Brief 072), GatheringIndicatorBlock | First-run experience |
| **Interactive** | WorkItemFormBlock, ConnectionSetupBlock, SendingIdentityChoiceBlock | In-conversation form capture (Brief 072, 152) |
| **Meta** | ChecklistBlock, ArtifactBlock | Task lists, artifact references |

**Interactive blocks** (Brief 072): `InteractiveField` describes a form field (type: text/select/number/toggle) with label, placeholder, options, required flag. `WorkItemFormBlock` and `ConnectionSetupBlock` use `InteractiveField[]` for in-conversation capture; `ProcessProposalBlock` extended with interactive mode. Submit routes via the `form-submit` action namespace, validated by block-type-scoped registry tokens (Brief 072 Reviewer F1 fix — no action-registry bypass).

**Design rule:** ALL rendering flows through ContentBlocks. No bespoke viewers. Artifact mode renders BlockList. The composition engine produces BlockList. Self responses contain BlockList. This is the most critical architecture principle.

### AI Elements: The React Components

ContentBlocks define WHAT to render (engine concern). **AI Elements** define HOW to render (React/UI concern). These are the conversation chrome components in `packages/web/components/ai-elements/`:

| Component | Pattern | Purpose |
|-----------|---------|---------|
| **Conversation** | Container | Message list with auto-scroll (`use-stick-to-bottom`) |
| **Message** | Container | Single message with vivid dot, streamdown markdown |
| **PromptInput** | Composable (Provider + Textarea + Submit + Actions) | Chat input with abort, drag-drop, auto-resize |
| **Reasoning** | Composable (Root + Trigger + Content) | Collapsible thinking display with timer, Radix Collapsible |
| **Tool** | Composable (Root + Header + Content + Input + Output) | Tool invocation with StatusBadge, Radix Collapsible |
| **Confirmation** | Composable (Root + Title + Request + Accepted + Rejected + Actions) | State-aware action approval |
| **Suggestions** | Flat | Starter chips |
| **Shimmer** | Flat | Loading indicator |
| **ChainOfThought** | Composable (Header + Step + Content) | Multi-step reasoning trace |
| **Plan** | Composable (Header + Title + Description + Content) | Plan visualization with Card wrapper |
| **Queue** | Composable (Section + Item + Indicator) | Sectioned item list with Radix ScrollArea |
| **InlineCitation** | Composable (Card + Carousel + Source) | HoverCard with source preview |
| **Sources** | Composable (Trigger + Content + Source) | Collapsible bibliography |
| **Task** | Composable (Trigger + Content + File) | Collapsible task container |
| **CodeBlock** | Flat | Shiki syntax highlighting with copy-to-clipboard |
| **ConfidenceCard** | Flat | Trust signal card: collapsed/auto-expand/user-expand, uncertainties-first (Brief 068) |

**Composable subcomponent pattern** (Brief 061): Components use Context Provider + named subcomponents + backward-compatible default export. This enables custom compositions while preserving the standard API.

### Block ↔ AI Element Mapping

Block renderers in `packages/web/components/blocks/` consume ContentBlock data and render using AI Elements where appropriate:

| Block renderer | Uses AI Element |
|---------------|----------------|
| `reasoning-trace-block.tsx` | ChainOfThought |
| `knowledge-citation-block.tsx` | Sources + InlineCitation |
| `code-block.tsx` | CodeBlock (Shiki) |
| `checklist-block.tsx` | Task |

This two-layer architecture (ContentBlock types = engine WHAT, AI Elements = React HOW) enables the same data to render differently on different surfaces while maintaining a single source of truth.

---

## The Conversational Self

The Conversational Self is the user's primary interaction partner — not a chatbot, but a persistent, context-aware teammate. Self is Layer 6 given a voice.

### How Self Serves the Six Jobs

| Job | Self's role | Tools used |
|-----|-----------|-----------|
| **Orient** | Delivers briefings proactively on session start, surfaces risks as narrative (never says "risk") | `get_briefing`, `detect_risks` |
| **Review** | Surfaces review items inline in conversation, manages approve/edit/reject flow | `approve_review`, `edit_review`, `reject_review` |
| **Define** | Guides process definition through conversation, proposes process structure | `generate_process`, `adapt_process` |
| **Delegate** | Triggers pipeline execution, manages trust settings | `start_pipeline`, `adjust_trust` |
| **Capture** | Accepts unstructured input, classifies and routes | `quick_capture`, `create_work_item` |
| **Decide** | Suggests next actions, proposes improvements | `suggest_next`, proactive suggestions (capped at 1-2) |

### Self's Interaction Model

1. **Self speaks first** for new users — initiates the onboarding conversation
2. **Session gap detection** — when a user returns after time away, Self proactively delivers a briefing
3. **Intent intuition** — Self distinguishes planning vs execution from conversation context
4. **Confirmation model** — irreversible actions require explicit user confirmation
5. **Cross-surface coherence** — same Self, same memory, whether on web or Telegram
6. **Cognitive framework** — competent, direct, warm, purposeful communication style (defined in `cognitive/self.md`)

### Streaming and Real-Time

The conversation uses AI SDK v6 with:
- **`useChat` hook** with `dataPartSchemas` (4 Zod schemas, zero type assertion casts)
- **100ms throttle** via `experimental_throttle` for smooth streaming
- **Streamdown** for markdown rendering during streaming
- **Transient status updates** — Self emits status parts that display during processing and disappear when complete
- **SSE pipeline events** — `useHarnessEvents` reacts to step-complete, gate-pause, gate-advance, run-complete for real-time pipeline updates
- **Reasoning display** — Collapsible thinking blocks with elapsed timer during extended thinking

---

## Interaction Patterns

### Onboarding (Brief 044)

New users experience a guided intake:

1. **Self speaks first** — warm greeting, explains what Ditto does
2. **Gathering basics** — Self asks about the user's business, role, pain points (one question at a time)
3. **Knowledge synthesis** — Self shows what it's learned so far as an editable summary (KnowledgeSynthesisBlock)
4. **First process proposal** — Self proposes a process based on the conversation (ProcessProposalBlock — plain language steps, approve/adjust)
5. **First real work** — The proposed process runs, first output appears for review

**Progressive reveal:** The workspace is conversation-only from the start and stays that way (post-Brief 280). There is no sidebar/full-layout reveal on first process; instead, artifacts (the saved process, its runs, reviews) begin rendering inline in the same `/chat` conversation. This prevents "overwhelm on arrival" without introducing a second IA.

### Daily Use (Operate Context)

The morning experience:

1. **User opens Ditto** — lands in the `/chat` Self conversation (the authenticated home)
2. **Self delivers briefing** — session gap detected, briefing assembled from 5 dimensions (focus, attention, upcoming, risk, suggestions) and rendered inline in the conversation
3. **Review items surface** — ReviewCardBlocks appear inline, user can approve/edit/reject without leaving the conversation
4. **Pipeline progress visible** — ProgressBlocks show running pipelines with real-time updates
5. **Quick decisions** — ActionBlocks and SuggestionBlocks enable one-tap decisions

### Process Definition (Explore Context)

When defining a new process:

1. **User describes pain** — "I spend hours writing listing descriptions for new properties"
2. **Self recognises pattern** — draws on industry knowledge (APQC patterns for 5 industries)
3. **Self asks clarifying questions** — one at a time, never overwhelms
4. **Process proposal appears** — `generate_process` tool emits a `ProcessProposalBlock` inline in the conversation: plain-language steps with a "Drafting" badge; raw YAML/slugs/executor names stay behind a drill-down
5. **User reviews and approves** — process is created, first run is triggered; saved process and run state then render inline

### Deep Review (Artifact Mode)

When an output needs careful review:

1. **Output appears in conversation** — either from a pipeline run or `start_dev_role` delegation
2. **Auto-promotion to artifact** — outputs >500 chars automatically open artifact mode
3. **Artifact host renders ContentBlocks** — same block registry, wider canvas (720px)
4. **Lifecycle badge shows status** — with Approve/Edit/Reject actions
5. **User decides** — decision feeds back into trust computation, correction patterns extracted

### Process Monitoring

For running processes:

1. **Process list on demand** — ask Self or open the Archive drawer (Brief 281) for "My Work" (active items) + "Recurring" (domain processes with health indicators), rendered inline
2. **Process detail** — selecting a process opens its detail (3 variants: living-roadmap, domain-process, process-runner) as an inline artifact or the `/process/[id]` drill-down
3. **Trust control** — natural language slider ("Check everything" ↔ "Let it run") with evidence narrative
4. **Activity log** — unified human+system timeline, filterable
5. **Process-scoped context** — surfaced inline alongside the process artifact, not in a separate persistent panel

---

## The Six Human Jobs: How They're Delivered

### Orient — "What's going on?"

| What | How it works |
|------|-------------|
| **Daily Brief** | Self assembles briefing from 5 dimensions. Rendered as TextBlock narrative in Today composition. Explains reasoning and priority order. |
| **Pipeline Progress** | ProgressBlock populated from `activeRuns`. Real-time updates via SSE. Appears in Today + Work compositions. |
| **Process Health** | StatusCardBlock with health indicators. Sparklines via ChartBlock. In Projects composition. |
| **Activity** | Unified timeline in process detail view. Filterable. Human actions alongside agent actions. |

### Review — "Is this right?"

| What | How it works |
|------|-------------|
| **Inline Review** | ReviewCardBlock appears in conversation when trust gate pauses a run. Approve/edit/reject via ActionBlock buttons. |
| **Artifact Review** | Deep review in artifact mode. Full ContentBlock rendering with lifecycle badge. |
| **Pipeline Review** | `use-pipeline-review.ts` hook listens for `gate-pause`, fetches step output, exposes `pendingReview` state. |
| **Feedback Capture** | Edits ARE feedback. Corrections captured structurally. Pattern detection after 3+ corrections surfaces notification. |

### Define — "What needs to happen?"

| What | How it works |
|------|-------------|
| **Conversation-first** | User describes pain to Self. Self guides with industry knowledge. Process emerges from dialogue. |
| **Process Proposal** | ProcessProposalBlock in conversation — plain language steps, approve/adjust. |
| **Process Builder** | `generate_process` emits a `ProcessProposalBlock` inline; structured definition (YAML) sits behind a drill-down, not a persistent panel. |
| **Adaptive processes** | `adapt_process` tool modifies run-scoped definition. Template stays durable. |

### Delegate — "Who does it and how much do I trust them?"

| What | How it works |
|------|-------------|
| **Trust Control** | Natural language slider in process detail view. Shows evidence narrative. System recommends upgrades, human decides. |
| **Session Trust** | `start_pipeline` with `sessionTrust` overrides — can relax (never tighten) for specific runs. |
| **Pipeline Trigger** | Self's `start_pipeline` tool. Async execution, returns runId. Real-time progress via SSE. |

### Capture — "Here's something the system needs to know"

| What | How it works |
|------|-------------|
| **Prompt Input** | Primary capture surface. Text + file drag-drop. Always pinned at the bottom of the `/chat` conversation. |
| **Quick Capture** | Self's `quick_capture` tool. Auto-classifies and routes. Surfaces in next briefing if actionable. |
| **Voice Capture** | Future capability. Transcribe → classify → route pipeline. |

### Decide — "What should change?"

| What | How it works |
|------|-------------|
| **Suggestion Blocks** | SuggestionBlock with evidence and actions. System proposes, human decides. |
| **Proactive Suggestions** | Self's `suggest_next` tool, capped at 1-2 suggestions. Risk signals woven into narrative. |
| **Trust Recommendations** | System recommends trust upgrades based on track record. Always shows evidence. |
| **Improvement Proposals** | Pattern detection surfaces improvement opportunities. "Teach this" bridges feedback to permanent learning (future). |

---

## Mobile Experience

Desktop is primary. Mobile is a seamless supporting surface (not a degraded experience).

| Mobile adaptation | How |
|------------------|-----|
| **Conversation** | Full width, same quality as desktop — the single home surface reflows without a panel ladder |
| **Archive drawer** | Full-screen sheet (Brief 281 recall surface) |
| **Artifact review** | Bottom sheet with swipe-to-dismiss |
| **Drill-downs** | Standard full-page navigation back to the conversation |
| **Prompt input** | Full width, same functionality |
| **Pipeline progress** | Same real-time updates via SSE |

**"Edit @ desk" pattern** (Insight-012): The user can acknowledge an issue on mobile and complete complex editing when they're back at a desktop. The system tracks what's been triaged vs. what needs full attention.

---

## Design Tokens and Visual Identity

The UI is built on:
- **Design tokens** from `.impeccable.md` visual identity spec (if present)
- **shadcn/ui** as the component primitive layer (6+ primitives in use)
- **Radix UI** for interaction primitives (Collapsible, HoverCard, ScrollArea)
- **Tailwind CSS** with custom design token variables
- **Lucide icons** for consistent iconography
- **Shiki** for syntax highlighting (`github-light`/`github-dark` themes)
- **Streamdown** for streaming markdown rendering

---

## Design Principles Summary

1. **The six human jobs are the UI lens** — every element serves Orient, Review, Define, Delegate, Capture, or Decide
2. **Conversation is the primary interaction** — Self is the user's teammate, not a feature buried in a tab
3. **Everything renders through ContentBlocks** — no bespoke viewers, no special-case rendering (Insight-107)
4. **Feedback is implicit** — edits ARE feedback, no forms
5. **Trust is visible and earned** — evidence narratives, never hidden in settings
6. **One question at a time** — progressive disclosure during setup and process definition
7. **Industry knowledge fills defaults** — users correct, not create from scratch
8. **The platform handles AI's limitations** — the human doesn't need to know about hallucination or pleasing
9. **Composition intents, not pages** — Today/Inbox/Work are different views of the same data, not different destinations
10. **Architecture + UX briefs must be paired** — invisible architecture upgrades don't serve users (Insight-119)
11. **Desktop primary, mobile seamless** — same quality on phone, spatial structure adapts
12. **The compound effect is the value proposition** — it gets better every week because the harness evolves

---

## What's Next: Gaps Between Architecture and Experience

The following capabilities are architecturally present but not yet surfaced in the UX. Each needs a companion UX brief:

| Capability | Architecture status | UX gap |
|-----------|-------------------|--------|
| **Reasoning visibility** | AI Elements Reasoning component exists (Brief 061) | Not wired into conversation chrome — thinking blocks don't show during streaming |
| **Tool use display** | AI Elements Tool component exists (Brief 061) | Tool invocations not visually differentiated in conversation |
| **Citation hover** | AI Elements InlineCitation + Sources exist (Brief 061) | Not triggered by any conversation content yet |
| **Code highlighting** | AI Elements CodeBlock with Shiki exists (Brief 061) | CodeBlocks in conversation don't use Shiki renderer |
| **Chain of thought** | AI Elements ChainOfThought exists (Brief 061) | ReasoningTraceBlock renderer uses it, but no conversation trigger |
| **Process graph** | Architecture spec describes it (Primitive 14) | Not built — no visual process dependency map |
| **Improvement proposals** | Learning layer detects patterns | "Teach this" not yet implemented as interactive UI |
| **Team/agent view** | Agent cards described in architecture | Not built — no agent management surface |
| **Data analytics** | ChartBlock, MetricBlock, DataBlock exist | Limited composition engine queries — no analytics dashboard |

These gaps are the backlog for the Chat UX brief (Insight-119: architecture briefs and UX briefs must be paired).
