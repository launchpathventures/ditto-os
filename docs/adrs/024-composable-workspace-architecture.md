# ADR-024: Composable Workspace Architecture — Scaffold, Canvas, Evolution

**Date:** 2026-03-27
**Status:** accepted
**Layers affected:** L6 Human (UI architecture), L2 Agent (Self as composer), L1 Process (Build meta-process as extender), extends ADR-009, ADR-015, ADR-023
**Revises:** ADR-009 Principle D — centre canvas becomes a composition surface (not standard React). Scaffold elements (layout shell, sidebar, navigation) remain standard React.

## Context

### The Problem

Ditto has 28 prototypes showing every major user moment — from day zero through multi-process workspace. These prototypes establish the visual vocabulary, prove the design system, and serve as pixel-level references. But they create a dangerous temptation: **build 28 React pages**.

If the implementation treats prototypes as screens to build, Ditto becomes a static dashboard — fixed at the capabilities designed in March 2026, unable to evolve based on user needs. This contradicts every core principle:

- "The system runs ON itself" (architecture.md) — but a static dashboard doesn't modify itself
- "Self-improvement is a first-class capability" (architecture.md) — but fixed pages can't grow new capabilities
- "The Self composes the experience" (Insight-086) — but pages don't compose, they render
- "The Build meta-process creates all processes, agents, and skills" (ADR-015) — but Build can't create new UI if the UI is fixed pages

### What the Prototypes Actually Are

The prototypes are **composition references** — visual targets for what specific block compositions should look like in specific contexts. P13 (Daily Workspace) is not "the home page." It's one example of what the Self might compose when a user with 3 review items and 2 processes opens Ditto on a Tuesday morning. Tomorrow the composition could differ. Next month it could include block types that don't exist yet.

### What the User Told Us

> "We must be opinionated about what is composable and what can be evolved. The key is to ensure the user can evolve the system gracefully with Self."

This establishes two constraints:
1. **Be opinionated** — not everything is flexible. Some things are scaffold. Ditto has a strong identity.
2. **Graceful evolution** — the user doesn't configure, hack, or code. They talk to the Self, and the system extends itself.

### Forces

1. **Scaffold provides identity.** Without opinionated layout, navigation, and visual language, Ditto becomes a blank canvas — which is what ChatGPT already is. The scaffold IS the value proposition.

2. **Canvas provides relevance.** The same scaffold must show different content for Rob checking quotes on his phone vs Jordan presenting to leadership vs Libby defining her brand voice. Context-driven composition is how one product serves all personas.

3. **Evolution provides durability.** The user's needs in Month 6 are different from Month 1. Processes produce output types nobody anticipated. The system must grow its vocabulary without requiring developer intervention.

4. **Live Preview is the escape hatch.** Any HTML/CSS/JS can render in a sandboxed iframe — this means the system can always produce output the block library doesn't cover. When patterns stabilize, they graduate to native blocks.

5. **ADR-009 already designed the extension mechanism.** Catalog → Registry → Renderer. Catalogs compose. Registries are per-surface. This architecture supports dynamic vocabulary if we implement it that way.

6. **ADR-015 already designed the extender.** The Build meta-process creates everything — processes, agents, skills, and itself. It should also create block types and composition patterns.

### Prior Decisions

| ADR | Relevant Decision | Status |
|-----|-------------------|--------|
| ADR-009 | Catalog-Registry-Renderer for process outputs | accepted — this ADR extends it to the full workspace |
| ADR-015 | Build meta-process as generative core | accepted — this ADR gives Build a new creation target (blocks) |
| ADR-021 | 21 content block types with exhaustive registry | accepted — this ADR classifies these as the MVP vocabulary |
| ADR-023 | ArtifactBlock + six viewers + artifact mode layout | proposed — this ADR classifies viewers as scaffold |
| Insight-086 | Composable UI, not fixed pages | active — this ADR formalises it |
| Insight-104 | Six universal viewers, not artifact types | active — this ADR classifies Live Preview as the extension seam |

## Decision

### 1. Three Tiers of System Rigidity

Every element of Ditto's workspace belongs to exactly one tier. The tier determines how it's built, who can change it, and what kind of change requires what kind of intervention.

#### Tier 1: Scaffold — Architectural Commitments

These elements define Ditto's identity. They are opinionated by design. Changing them requires an ADR.

| Element | What's Fixed | Reference |
|---------|-------------|-----------|
| **Workspace layout** | Three-column: sidebar (240px) \| centre canvas (flex) \| right panel (320px). Responsive breakpoints at 1280/1024/768. | P00 |
| **Artifact mode** | Three-column: conversation (300px) \| artifact (flex) \| context panel (320px). Sidebar collapses. | P36 |
| **Navigation** | Six destinations: Today / Inbox / Work / Projects / Routines / Settings. Sidebar is the only nav surface. | P00, P09, P13 |
| **Conversation** | Always available at bottom of centre canvas. Self streaming with parts-based rendering. | P08a, P09 |
| **The Self** | Outermost harness ring. Composes the centre canvas. All user interaction routes through the Self. | ADR-016 |
| **Six artifact viewers** | Document, Spreadsheet, Image, Live Preview, Email, PDF. These are the structured rendering primitives. | P36-P41, Insight-104 |
| **Process visualization** | Narrative steps for intra-process. Node graph for inter-process only. | P14, P27, Insight-103 |
| **Trust display** | User language. Slider metaphor. Evidence-based. | P17, P32, .impeccable.md |
| **Design system** | Two-green palette, DM Sans, cardless typographic flow, pill buttons, dot particles. | .impeccable.md |
| **Block registry pattern** | Typed ContentBlock union, exhaustive switch renderer, parts-based streaming. | ADR-021, Brief 045 |

**Implementation:** React components for scaffold elements. Static layout. Standard routing. These components change through code deploys, not through the Self.

#### Tier 2: Canvas — Self-Composed from Blocks

These elements are composed dynamically by the Self from the block library based on context. Different users, different moments, different processes produce different compositions. The prototypes show reference compositions — examples from a much larger space of possible compositions.

| Element | What Varies | Composed From |
|---------|------------|---------------|
| **Centre column content** | What blocks appear, in what order, with what data | All 21+ ContentBlock types |
| **Right panel content** | Provenance, suggestions, briefing, process context | Self tool results via `TRANSITION_TOOL_MAP` |
| **Feed items** | What's in the feed varies by what's happening | RecordBlock, AlertBlock, MetricBlock, ReviewCardBlock |
| **Review surfaces** | Mode (inline/batch/deep/in-conversation), item count, grouping | Block compositions assembled per review context |
| **Process detail** | Which metrics, steps, activity shown for this process | DataBlock, ChartBlock, ChecklistBlock, RecordBlock |
| **Morning brief** | Narrative varies by user's processes, risks, patterns | TextBlock + MetricBlock + AlertBlock + SuggestionBlock |
| **Onboarding** | Adapts to user's industry, tools, first pain point | Self adapts via `adapt_process` (Brief 044) |

**Implementation:** Each navigation destination maps to a **composition intent**, not a fixed page. The Self receives the intent (e.g., "user navigated to Today") and assembles blocks into the centre canvas. Reference compositions from prototypes are the visual targets — the Self should produce something that LOOKS like P13 when the context matches P13's scenario, but it's not locked to P13's exact structure.

**How composition works at runtime:**

```
Navigation event (e.g., "Today")
  → Self receives composition intent
  → Self assembles context (user model, active processes, pending items, risks)
  → Self emits ContentBlock[] stream
  → Block registry renders each block via exhaustive switch
  → Centre canvas displays the composition
```

The Self already does this for conversation (emitting blocks via `selfConverse()`). Canvas composition extends this to navigation destinations.

#### Tier 3: Evolvable — Meta Dev Process Extends

These elements grow through use. The Build meta-process (ADR-015) creates new vocabulary when patterns stabilize. The user evolves the system through conversation with the Self.

| Element | How It Evolves | Mechanism |
|---------|---------------|-----------|
| **New block types** | Live Preview patterns stabilize → Build extracts native block | TypeScript interface + React renderer + registry entry |
| **New process templates** | User defines new processes → templates with output catalogs | Process YAML + catalog definition (ADR-009) |
| **New integrations** | User connects services → registry entries | Integration YAML (Brief 024) |
| **Composition patterns** | Self learns what the user wants to see in different contexts | Self-scoped memory + user model dimensions |
| **Knowledge structure** | New knowledge dimensions emerge from use | Memory scopes (ADR-003) |
| **Output catalogs** | Processes gain new output capabilities | Catalog composition (ADR-009 Section 3) |

**The extension lifecycle:**

1. **Escape hatch** — Process produces output → no native block fits → Live Preview renders it as sandboxed HTML/CSS/JS. Works immediately. Covers ~20% of novel outputs.

2. **Pattern detection** — The system notices recurring Live Preview patterns (e.g., "every client onboarding produces a timeline"). Feedback & Evolution meta-process flags it.

3. **Build extracts** — Build meta-process creates a new ContentBlock type: TypeScript interface, React renderer, design-system-compliant styling. Registered in the block registry. This is a code-level change today; in Phase 11+, Build can vibe-code the renderer via Live Preview → extract → register.

4. **Catalog extension** — New block type added to the process's output catalog. Other processes can compose with it.

5. **Composition learning** — Self learns to use the new block in future compositions. The vocabulary has grown.

### 2. Navigation as Composition Intent

Navigation destinations are NOT pages. They are **composition intents** — signals to the Self about what the user wants to focus on.

| Navigation Item | Composition Intent | Self Assembles |
|----------------|-------------------|----------------|
| **Today** | "What needs me right now?" | Brief, pending reviews, risks, suggestions |
| **Inbox** | "What's arrived that I haven't triaged?" | Incoming items grouped by urgency |
| **Work** | "What am I actively working on?" | Active work items with progress |
| **Projects** | "What are my bigger goals?" | Goal-level items with decomposition |
| **Routines** | "How are my recurring processes doing?" | Process health, trust levels, metrics |
| **Roadmap** | "What's the project state and what can I work on?" | Phase progress, brief status, scope selection (Brief 055) |
| **Settings** | "Configure my system" | Static settings (this IS a fixed page — scaffold) |

Settings is the one exception — it's scaffold, not canvas. The user expects a predictable settings interface.

For all other destinations, the Self composes contextually. When Rob taps "Today" at 6:30am, the Self knows Rob checks quotes first, so it leads with review items. When Lisa taps "Today" at 10am, the Self knows Lisa checks content first. Same intent, different composition.

### 3. The Block Library Is the Vocabulary

The block library (26 types today as of 2026-04-16, extendable — see ADR-021 addendums for the lineage) is the COMPLETE vocabulary for the centre canvas. Every visible element in the centre column is a ContentBlock rendered by the block registry. No raw HTML. No custom one-off components in the canvas area.

**Current vocabulary (26 types):** Additions since this ADR was written: `WorkItemFormBlock`, `ConnectionSetupBlock`, `SendingIdentityChoiceBlock` (Brief 072 + Brief 152), `TrustMilestoneBlock` (Brief 160), plus RecordBlock `"vivid"` variant (Brief 168). ADR-021 addendum (2026-04-16) captures the full interactive-block taxonomy. Engine source (`packages/core/src/content-blocks.ts`) is authoritative.

| Block | Purpose | Scaffold Category |
|-------|---------|-------------------|
| TextBlock | Narrative, explanations | Display |
| DataBlock | Field tables, structured data | Display |
| ImageBlock | Visual media | Display |
| CodeBlock | Technical output (developer context only) | Display |
| ReviewCardBlock | Output for review with actions | Interaction |
| StatusBlock | Process/item status summary | Display |
| SuggestionBlock | Self's proactive suggestions | Display |
| AlertBlock | Exceptions, problems, degradation | Display |
| ProgressBlock | Progress indicators | Display |
| ProvenanceBlock | "Based on" evidence | Display |
| ActionBlock | User action prompts | Interaction |
| InputBlock | Structured input gathering | Interaction |
| KnowledgeSynthesisBlock | Knowledge capture during intake | Interaction |
| ProcessProposalBlock | Process creation prompt | Interaction |
| GatheringIndicatorBlock | Subtle activity indicator | Display |
| ChecklistBlock | Task/item checklists | Display |
| ChartBlock | Sparklines, donuts, bar charts | Display |
| MetricBlock | Key numbers at a glance | Display |
| RecordBlock | Structured records (inbox items, tasks, etc.) | Display |
| InteractiveTableBlock | Tables with row actions, selection | Interaction |
| ArtifactBlock | Compact reference to an artifact | Reference |

**Extension rule:** New block types are added through the Build meta-process. Each new type requires: TypeScript interface (engine), React renderer (web), design system compliance (.impeccable.md), and block registry entry. The exhaustive switch in the renderer guarantees type safety — adding a type without a renderer is a compile error.

### 4. Right Panel Follows Centre Context

The right panel adapts to what's happening in the centre canvas:

| Centre Context | Right Panel Shows |
|---------------|-------------------|
| Conversation | Self thinking, proactive suggestions |
| Process detail | Process context, trust data, activity log |
| Artifact review | Knowledge used, process context, version history |
| Feed/Today | Brief expansion, risk details |
| Onboarding | Knowledge panel (what's been captured) |

This is already implemented via `TRANSITION_TOOL_MAP` (Brief 046). The Self's tool results determine what panel appears. This pattern extends naturally — new Self tools produce new panel contexts.

### 5. Live Preview as the Extension Seam

The Live Preview viewer (Insight-104, P38) is architecturally special: it's both a scaffold viewer AND the extension mechanism.

**As scaffold:** It renders any sandboxed HTML/CSS/JS in an iframe. Viewport controls (desktop/tablet/mobile). "View Source" toggle for developers. This is fixed infrastructure.

**As extension seam:** When a process needs to produce output that no native block or viewer handles, the process generates HTML/CSS/JS and Live Preview renders it. The user sees a polished result. Behind the scenes, this is an escape hatch — the system can produce ANY visual output without the block library needing to know about it in advance.

**Graduation path:** When a Live Preview pattern stabilizes (the Build meta-process detects it), it can be extracted into:
- A new ContentBlock type (for in-stream elements)
- A new viewer type (for full-centre artifacts — though 6 viewers should cover most cases)
- A new composition pattern (for how blocks are assembled)

This means the vocabulary isn't limited to what we design today. It grows through the same research-extract-evolve cycle (Insight-031) that governs everything else in Ditto.

## Provenance

- **Insight-086:** Composable UI, Not Fixed Pages — established the principle
- **ADR-009:** Catalog-Registry-Renderer — the extension mechanism for process outputs
- **ADR-015:** Build meta-process — the extender
- **Insight-104:** Six universal viewers — the viewer taxonomy
- **Insight-031:** Research-Extract-Evolve — the evolution cycle
- **Claude Artifacts / Cursor / Lovable / Bolt:** Vibe-coding pattern → Live Preview as escape hatch
- **json-render (Vercel Labs):** Catalog-constrained composition with per-surface registries
- **Original to Ditto:** Three-tier rigidity model (Scaffold/Canvas/Evolvable), Navigation as composition intent, Live Preview as extension seam graduation path

## Consequences

### What Becomes Easier

- **Adding new output types** — any process can produce visual output without block library changes (via Live Preview)
- **Per-user personalisation** — the Self composes differently for different users, contexts, and moments
- **System evolution** — new capabilities emerge from use, not from design sprints
- **Testing** — block renderers are independently testable; compositions are testable by verifying block sequences

### What Becomes Harder

- **Initial build** — building a composition engine is harder than building 28 React pages
- **Visual consistency** — dynamic composition must still feel designed, not random. The design system and block renderers handle this, but it requires discipline.
- **Debugging** — "why did the Self show me X instead of Y?" is harder to debug than "which page am I on?"
- **Performance** — streaming block composition has latency that static pages don't. The Self must compose quickly.

### What's Deferred

- **Build meta-process creating block types** — Phase 11+. MVP uses the 21 existing types + Live Preview escape hatch.
- **Self learning composition preferences** — Phase 11+. MVP uses rule-based composition (navigation intent → block assembly).
- **Full self-modification** — Phase 12+. MVP scaffold is code-deployed.

### New Constraints

1. **No custom React components in the centre canvas.** Everything rendered in the centre column MUST be a ContentBlock from the registry. This is the composability guarantee.
2. **Prototypes are composition references, not screen specs.** The implementation brief must reference prototypes as visual targets for compositions, not as pages to build.
3. **Settings is the only fixed page.** All other navigation destinations are composition intents.
4. **Live Preview must be built early.** It's the extension seam — without it, the system is limited to the 21 block types.
5. **Must-show blocks cannot be suppressed by composition.** Certain block types are composition-immune — they MUST appear regardless of Self's composition logic: `AlertBlock` with severity `error` or `critical`, `ReviewCardBlock` at trust gate pause, any block with `mustShow: true`. This is the same principle as the harness layer — the user must not miss something that requires their judgment. The composition engine inserts must-show blocks at the top of any composition, above the Self's assembled content.
6. **Canvas vs Evolvable bright line.** Composition patterns (how blocks are assembled) are Canvas-tier — the Self adapts them per context. Vocabulary extensions (new block types) are Evolvable-tier — the Build meta-process creates them. A Canvas change never requires a code deploy. An Evolvable change always does (until Phase 11+ when Build can generate code).

### MVP Composition Strategy (Phased Approach)

The composition engine is built incrementally, not all at once:

**Phase 10 MVP — Deterministic composition, no LLM calls:**
- Each navigation intent maps to a **composition function** — pure TypeScript, no LLM. Takes context (user model, active processes, pending items, `activeRuns`) as input, returns `ContentBlock[]`.
- These functions encode the reference compositions from prototypes as the DEFAULT assembly. E.g., `composeToday(context)` returns the blocks that P13 shows, adapted to the user's actual data.
- The Self's conversation stream (chat) continues to use LLM-driven block emission as it does today.
- This means navigation is fast (no LLM latency), compositions look like the prototypes (visual consistency), and the architecture is composition-ready for Phase 11+.
- Composition functions live in `packages/web/lib/compositions/` — one per intent. They are explicitly designed to be REPLACED by Self-driven composition in Phase 11+.
- **Intent injection into Self (Brief 073):** When the user starts a conversation from a composition intent, `intentContext` is threaded through `selfConverseStream()` and injected as `<intent_context>` into the system prompt. The composition function shapes the canvas; `intentContext` shapes the conversation Self — one Self, context-aware per intent. Modules: `composition-context.ts` (assembles context from SSR), `composition-empty-states.ts` (per-intent empty-state factories), `compositions/*.ts` (per-intent composition functions), `composition-engine.ts` (re-exports).
- **Expanded destination set (2026-04-16):** Today, Inbox, Work, Projects, Routines, Growth (Brief 140), Library (Brief 138), plus Adaptive Views (Brief 154 — data-driven compositions registered at runtime via `workspaceViews` table).
- **Adaptive compositions (Brief 154):** Network agents push blocks to the workspace live via `pushBlocksToWorkspace()` / `refreshWorkspaceView()` / `registerWorkspaceView()`. `CompositionSchema` is an opaque JSON blob validated by web-package types. Evaluates to `ContentBlock[]` via `evaluateAdaptiveComposition()` (pure, synchronous). Sidebar renders adaptive views after the divider. 20/min rate limit. `workspace.push_blocks` + `workspace.register_view` tools with `stepRunId` guards (Insight-180).

**Phase 11+ — Self-driven composition:**
- Navigation intents route through the Self. The Self uses its context + learned composition preferences to assemble blocks.
- Composition functions become fallbacks (used when the Self is unavailable or slow).
- New composition patterns emerge from the Self's learning.

**Error / fallback composition:**
- If a composition function throws or returns empty, a fallback composition renders: the conversation input (always available) + a TextBlock saying "I'm having trouble loading this view. Try asking me directly."
- Block registry already has exhaustive type checking — unknown block types are compile errors, not runtime errors.

### Follow-Up Decisions

1. ~~How does the Self decide what to compose for each navigation intent?~~ **Resolved:** Deterministic composition functions for MVP (above), Self-driven for Phase 11+.
2. **What triggers composition re-evaluation?** Navigation events, new data arrival (SSE), and explicit user requests (chat).
3. **How does the Build meta-process create new block types?** Manual code generation for MVP, vibe-coded via Live Preview for Phase 11+.
4. **What's the performance budget for composition?** First meaningful paint within 200ms of navigation (deterministic functions guarantee this), streaming blocks within 500ms for conversation.
