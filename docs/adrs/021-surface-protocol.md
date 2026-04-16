# ADR-021: Surface Protocol

**Date:** 2026-03-25
**Status:** accepted
**Layers affected:** L2 Agent (Self emits typed blocks), L3 Harness (events become content blocks), L6 Human (surfaces render blocks natively)

## Context

The Conversational Self (ADR-016) is the single entry point for all surfaces — web, Telegram, CLI, and any future integration. Today, `selfConverse()` returns `SelfConverseResult` with `response: string`. Every surface gets the same plain text and has to interpret it.

This works for text-only conversation but breaks down when the Self needs to:
- Present an output for review with approve/edit/reject actions
- Show process execution progress
- Request structured input (human steps, onboarding)
- Cite knowledge provenance ("based on...")
- Surface proactive suggestions
- Display process status

These are all distinct **things** that surfaces could render natively (Telegram as inline keyboards, web as React components, CLI as formatted prompts) — but today they're flattened into a string that every surface displays identically.

ADR-009 defines typed outputs for **processes** (data/view/document/integration/external) with catalog→registry→renderer. This ADR defines the protocol for **the Self's conversational output** — what sits between the engine and any surface.

### Forces

- The engine must remain surface-agnostic — no knowledge of Telegram, web, or CLI
- Telegram's interactive capabilities (inline keyboards, callback queries) are wasted when the Self returns plain text
- The web app (Phase 10) needs rich components, not parsed markdown
- Third-party integrators need a stable, typed JSON contract
- Streaming and progressive updates are essential for long-running delegations
- Actions (approve, reject, provide input) must round-trip back to the engine
- The protocol must be simple enough that a new surface can be built without understanding the full architecture

### Research Summary

Five cross-surface output systems were surveyed:

| System | Model | Strengths | Weaknesses |
|--------|-------|-----------|------------|
| Adaptive Cards | Semantic blocks + HostConfig | True write-once/render-anywhere, rich inputs | No streaming, Microsoft ecosystem bias |
| Slack Block Kit | Platform-native blocks | Rich interactivity (18 element types), async actions | Slack-only, no portability |
| Telegram Bot API | Text + media + keyboards | Simple, streaming via `sendMessageDraft` | No composable blocks, no forms |
| Vercel AI SDK | Typed tool→component mapping | AI-native, streaming-first, type-safe | Web-only, no portable format |
| Discord Components V2 | Layout + content + interactive layers | Richer than Slack, recursive containers | Discord-only |

**Key pattern extracted:** Adaptive Cards' separation of *semantic content* (what to show) from *host rendering* (how it looks) is the gold standard. Vercel AI SDK's *typed tool-to-component mapping* is the right model for AI agent output. Slack/Telegram's *action callback* pattern (ID-based routing) is the simplest action model.

**Ditto's approach:** Semantic content blocks (Adaptive Cards-inspired) + per-surface renderers (Vercel AI SDK-inspired) + callback-based actions (Slack/Telegram-inspired). Not a fork of any existing system — Ditto's blocks are purpose-built for an AI agent that converses, delegates, reviews, and teaches.

## Decision

### 1. The Self Emits Content Blocks, Not Strings

`selfConverse()` returns `ContentBlock[]` instead of `response: string`. Each block is a discriminated union with a `type` field. Surfaces iterate blocks and render each according to their capabilities.

```typescript
type ContentBlock =
  | TextBlock
  | ReviewCardBlock
  | StatusCardBlock
  | ActionBlock
  | InputRequestBlock
  | KnowledgeCitationBlock
  | ProgressBlock
  | DataBlock
  | ImageBlock
  | CodeBlock
  | ReasoningTraceBlock
  | SuggestionBlock
  | AlertBlock
```

The `SelfConverseResult` changes from:

```typescript
// Before
{ response: string; sessionId: string; ... }

// After
{ content: ContentBlock[]; sessionId: string; ... }
```

### 2. Content Block Types

Nineteen block types cover the Self's conversational vocabulary (13 original + 3 onboarding + 3 visual). Each maps to specific surface capabilities:

#### TextBlock — Conversational response
```typescript
interface TextBlock {
  type: "text";
  content: string;  // Markdown
}
```
- **Web:** Rendered markdown
- **Telegram:** Markdown message (MarkdownV2)
- **CLI:** Formatted terminal output

#### ReviewCardBlock — Output needing human judgment
```typescript
interface ReviewCardBlock {
  type: "review_card";
  processRunId: string;
  stepName: string;
  outputText: string;        // The content to review
  confidence: "high" | "medium" | "low" | null;
  actions: ActionDef[];       // approve, edit, reject
  knowledgeUsed?: string[];   // Provenance — what knowledge informed this output
}
```
- **Web:** Rich review panel with diff view, confidence badge, action buttons, provenance strip
- **Telegram:** Truncated output + inline keyboard (Approve / Reject / Edit)
- **CLI:** Formatted output + prompt for action

#### StatusCardBlock — Process or work item status
```typescript
interface StatusCardBlock {
  type: "status_card";
  entityType: "process_run" | "work_item";
  entityId: string;
  title: string;
  status: string;
  details: Record<string, string>;  // Key-value pairs (step, trust tier, etc.)
}
```
- **Web:** Process card component
- **Telegram:** Formatted text block
- **CLI:** Table output

#### ActionBlock — Choices for the user
```typescript
interface ActionBlock {
  type: "actions";
  actions: ActionDef[];
}

interface ActionDef {
  id: string;          // Callback ID — routes back to engine
  label: string;
  style?: "primary" | "secondary" | "danger";
  payload?: Record<string, unknown>;  // Context sent back with the action
}
```
- **Web:** Button group
- **Telegram:** Inline keyboard buttons
- **CLI:** Numbered menu

#### InputRequestBlock — Structured input collection
```typescript
interface InputRequestBlock {
  type: "input_request";
  requestId: string;         // For correlating the response
  prompt: string;            // What the Self is asking
  fields: InputFieldDef[];
}

interface InputFieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "confirm";
  options?: string[];    // For select type
  required?: boolean;
  placeholder?: string;
}
```
- **Web:** Form component
- **Telegram:** Sequential prompts or Web App for complex forms
- **CLI:** Interactive prompts (clack/prompts)

#### KnowledgeCitationBlock — Provenance strip
```typescript
interface KnowledgeCitationBlock {
  type: "knowledge_citation";
  label: string;             // e.g., "Based on"
  sources: { name: string; type: string; excerpt?: string }[];
}
```
- **Web:** Collapsible provenance strip (Insight-083)
- **Telegram:** Italic footer text with source names
- **CLI:** Footnote-style references

#### ProgressBlock — Execution progress
```typescript
interface ProgressBlock {
  type: "progress";
  processRunId: string;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  status: "running" | "paused" | "complete";
}
```
- **Web:** Progress bar with step indicators
- **Telegram:** "Step 2/5: Analysing data..." text
- **CLI:** Progress bar or spinner

#### DataBlock — Structured data display
```typescript
interface DataBlock {
  type: "data";
  format: "key_value" | "table" | "list";
  title?: string;
  data: Record<string, unknown>[] | Record<string, string>;
}
```
- **Web:** Table or card grid
- **Telegram:** Formatted text
- **CLI:** Table output

#### ImageBlock — Visual content
```typescript
interface ImageBlock {
  type: "image";
  url: string;              // Image URL or data URI
  alt: string;              // Accessibility text
  caption?: string;
}
```
- **Web:** Rendered image with caption, click to expand
- **Telegram:** `sendPhoto` with caption
- **CLI:** Alt text + URL reference

#### CodeBlock — Syntax-highlighted code
```typescript
interface CodeBlock {
  type: "code";
  language: string;         // Language identifier for syntax highlighting
  content: string;          // Code content
  filename?: string;        // Optional source file reference
  diff?: boolean;           // If true, content uses unified diff format
}
```
- **Web:** Syntax-highlighted code block with copy button, diff view if `diff: true`
- **Telegram:** Monospace code block (``` formatting)
- **CLI:** Syntax-highlighted terminal output

#### ReasoningTraceBlock — Decision reasoning
```typescript
interface ReasoningTraceBlock {
  type: "reasoning_trace";
  title: string;                    // What decision was made
  steps: { label: string; detail: string }[];  // Reasoning chain
  conclusion: string;
  confidence?: "high" | "medium" | "low";
}
```
- **Web:** Expandable reasoning chain with confidence badge
- **Telegram:** Formatted summary with conclusion
- **CLI:** Indented reasoning steps

These three block types map to the architecture's Output Viewer presentation types (visual, code, decision) that were defined in Primitive 6. They ensure the Self can present any process output type through the surface protocol.

#### SuggestionBlock — Proactive suggestion
```typescript
interface SuggestionBlock {
  type: "suggestion";
  content: string;           // What the Self is suggesting
  reasoning?: string;        // Why (optional, for transparency)
  actions?: ActionDef[];     // Accept, dismiss, ask more
}
```
- **Web:** Suggestion card in the Ditto column (right panel)
- **Telegram:** Message with inline keyboard
- **CLI:** Highlighted suggestion with prompt

#### AlertBlock — Attention needed
```typescript
interface AlertBlock {
  type: "alert";
  severity: "info" | "warning" | "error";
  title: string;
  content: string;
  actions?: ActionDef[];     // Dismiss, investigate, escalate
}
```
- **Web:** Toast or banner
- **Telegram:** Bold/emoji-prefixed message
- **CLI:** Colored output

### 3. Action Callbacks

When a user acts on an `ActionDef` (clicks a button, submits a form), the surface sends the action back to the engine via a new function:

```typescript
async function handleSurfaceAction(
  userId: string,
  actionId: string,
  payload?: Record<string, unknown>,
  surface?: "cli" | "telegram" | "web",
): Promise<ContentBlock[]>
```

The engine routes the action to the appropriate handler (review-actions, human-step completion, etc.) and returns new content blocks. The surface never calls `approveRun()` or `editRun()` directly — all actions go through this single entry point.

Action IDs are namespaced: `review.approve.{runId}`, `input.submit.{requestId}`, `suggestion.accept.{id}`. The engine's action router parses the namespace and dispatches.

### 4. Harness Events Become Content Blocks

The existing `harnessEvents` emitter (events.ts) continues to work for in-process subscribers. For surfaces, harness events are translated into content blocks during `selfConverse()`:

- `step-start` → `ProgressBlock` (updated step count)
- `gate-pause` → `ReviewCardBlock` (output + actions)
- `run-complete` → `StatusCardBlock` + `TextBlock`

The Self assembles these during delegation execution, using the existing `SelfConverseCallbacks` mechanism. The callbacks evolve from `onIntermediateText: (text) => void` to `onContentBlock: (block: ContentBlock) => void`.

### 5. Surface Renderers Are Surface-Owned

Each surface implements its own renderer. The engine provides a `renderToText(blocks: ContentBlock[]): string` fallback for surfaces that only support plain text. But rich surfaces (web, Telegram) implement their own rendering:

- **Web:** React components per block type. The web app imports `ContentBlock` types and maps them to components.
- **Telegram:** A `renderForTelegram(blocks: ContentBlock[])` function in the Telegram bot that maps blocks to Telegram API calls (text messages, inline keyboards, media).
- **CLI:** A `renderForCli(blocks: ContentBlock[])` function that maps blocks to clack/prompts UI.
- **API consumer:** Returns raw `ContentBlock[]` JSON. The consumer renders however they want.

The engine MUST NOT import any surface renderer. Surfaces import the engine's types. This is a one-way dependency.

### 6. Graceful Degradation

Surfaces that don't support a block type MUST fall back to a text representation. Every `ContentBlock` type has a deterministic text serialisation (via `renderToText()`). A surface that only understands `TextBlock` can still display everything — just without rich rendering.

This means a new block type can be added without breaking any existing surface. Surfaces upgrade their renderers to support new blocks at their own pace.

### 8. Security

**Action ID validation.** `handleSurfaceAction` MUST validate that:
1. The `userId` is authorised to act on the referenced entity (processRunId, requestId, etc.). No action can cross user/org boundaries.
2. The `actionId` corresponds to an action recently emitted for this user's session. The engine maintains a short-lived action registry (TTL: session duration) mapping emitted action IDs to their context. An action ID not in the registry is rejected.
3. The `payload` is engine-controlled context passed through unchanged — surfaces MUST NOT modify it. The engine validates payload structure against the original `ActionDef` before dispatching.

**Input validation.** When an `InputRequestBlock` is submitted via `handleSurfaceAction`:
1. All `required` fields must be present
2. `select` field values must match one of the declared `options`
3. Text fields are sanitised before being passed to the engine (no raw injection into LLM prompts or shell commands)

**No credential exposure.** Content blocks MUST NOT contain credentials, API keys, or vault contents. The `KnowledgeCitationBlock` shows source names, not source credentials. `ReviewCardBlock.outputText` goes through the existing credential scrubbing before being placed in the block.

### 9. Relationship to ADR-009

ADR-009 defines **process outputs** — what processes produce (data/view/document/integration/external). This ADR defines **surface content blocks** — what the Self emits in conversation.

The relationship: when a process produces a `view`-type output (ADR-009), and the Self presents it for review, the Self wraps it in a `ReviewCardBlock` (this ADR). The process output is the content; the content block is the conversational framing.

- ADR-009 outputs are **stored, typed, schema'd, catalog-constrained**
- Surface content blocks are **ephemeral, conversational, surface-adapted**
- They compose: process outputs appear *inside* content blocks when presented to users

## Provenance

- **Semantic block types:** Adaptive Cards (Microsoft) — type-discriminated elements with host-controlled rendering. **Composition level: pattern** — the concept of semantic types with per-host rendering transfers; the specific schema does not.
- **Action callback model:** Slack Block Kit `action_id` + `response_url` and Telegram `callback_data` patterns. **Composition level: pattern** — namespaced action IDs with payload round-trip.
- **Typed tool-to-component mapping:** Vercel AI SDK 6 `InferAgentUIMessage` pattern. **Composition level: pattern** — the concept of typed agent output that surfaces render differently.
- **Fallback text rendering:** Adaptive Cards `fallbackText` property. **Composition level: pattern** — every structured element has a text fallback.
- **Content block types (specific set of 10):** Original — purpose-built for an AI agent that converses, delegates, reviews, and teaches. No existing system has this specific vocabulary.

## Consequences

**What becomes easier:**
- New surfaces can be built by implementing renderers for 19 block types — no need to understand the engine internals
- Telegram gets native inline keyboards for review actions instead of text-only
- The web app gets typed React props instead of parsing markdown
- Third-party integrators get a stable JSON contract
- The Self's output becomes testable — assert on block types and content, not string matching

**What becomes harder:**
- The Self's LLM prompt must produce structured output (content blocks), not free-text. Requires structured output or post-processing.
- Every new block type requires renderer updates across all surfaces (mitigated by graceful degradation)
- The `handleSurfaceAction` router adds complexity vs direct function calls (but provides the surface-agnostic contract)

**What new constraints this introduces:**
- Surfaces MUST NOT call engine functions directly (approveRun, editRun, etc.) — all interaction goes through `selfConverse()` or `handleSurfaceAction()`
- Every `ContentBlock` type MUST have a text fallback via `renderToText()`
- Action IDs MUST be namespaced and deterministic — surfaces cannot invent action semantics

**Follow-up decisions needed:**
- [ ] Implementation brief: Add `ContentBlock` types + refactor `selfConverse()` return type + `handleSurfaceAction()` + `renderToText()`
- [ ] Update Brief 039-044 (Phase 10) to consume `ContentBlock[]` instead of string
- [ ] Update Telegram bot to use block renderers
- [ ] Determine whether the Self produces blocks directly (structured output from LLM) or whether a post-processor converts text + harness events into blocks

## Addendum: Visual Block Types (2026-03-27)

**Context:** Architecture review of the prototype system (Phase 10) identified three gaps in the content block vocabulary. Prototypes require visual elements — checklists, charts, metrics — that cannot be rendered from the original 13 block types. Additionally, 3 onboarding-specific types (KnowledgeSynthesisBlock, ProcessProposalBlock, GatheringIndicatorBlock) were added in Brief 044 but not documented here.

**Corrected block count:** The original ADR specified 13 block types. Brief 044 added 3 (total: 16). This addendum adds 3 more (total: 19).

### ChecklistBlock — Status-tracked item list
```typescript
interface ChecklistBlock {
  type: "checklist";
  title?: string;
  items: Array<{ label: string; status: "done" | "pending" | "warning"; detail?: string }>;
}
```
- **Web:** Checkbox rows with done/pending/warning visual states
- **Telegram:** Emoji-prefixed list (✓/○/⚠)
- **CLI:** Colored checkbox output

**Provenance:** Hark (document upload checklist with progress pills), GitHub issue task lists, Linear sub-issues. **Composition level: pattern.**

### ChartBlock — Visual data rendering
```typescript
interface ChartBlock {
  type: "chart";
  chartType: "sparkline" | "donut" | "bar";
  title?: string;
  data: {
    values?: number[];       // sparkline/bar: ordered values
    trend?: "up" | "down" | "flat";  // sparkline: direction
    label?: string;          // sparkline: axis label
    segments?: Array<{ label: string; value: number; color?: string }>;  // donut/bar
  };
}
```
- **Web:** SVG sparkline (40×16px inline), SVG donut (48px with stroke-dasharray), horizontal bar chart
- **Telegram:** Text summary with trend arrow
- **CLI:** ASCII sparkline or percentage bar

**Provenance:** Hark (donut charts for application outcomes), Performance Sparkline primitive (#4 in architecture.md), GitHub contribution graphs. **Composition level: pattern.**

### MetricBlock — Key numbers with context
```typescript
interface MetricBlock {
  type: "metric";
  metrics: Array<{
    value: string;
    label: string;
    trend?: "up" | "down" | "flat";
    sparkline?: number[];
  }>;
}
```
- **Web:** Large number + label + optional inline sparkline, cardless
- **Telegram:** "Label: Value ↑" formatted text
- **CLI:** Aligned metric output

**Provenance:** Hark (conditionally approved metrics), Grafana stat panels, Datadog service metrics. **Composition level: pattern.**

### Why new types, not DataBlock extensions

The discriminated union on `type` provides compile-time exhaustiveness checking in the block renderer (`block-registry.tsx`). Each `case` in the switch must be handled or TypeScript errors. If these visual patterns were hidden as `DataBlock.format` values, the compiler wouldn't catch missing renderers — format is a string within an already-handled type. New block types preserve the safety guarantee that every block is rendered.

### Updated ContentBlock union (19 types)

```typescript
type ContentBlock =
  | TextBlock | ReviewCardBlock | StatusCardBlock | ActionBlock
  | InputRequestBlock | KnowledgeCitationBlock | ProgressBlock | DataBlock
  | ImageBlock | CodeBlock | ReasoningTraceBlock | SuggestionBlock
  | AlertBlock | KnowledgeSynthesisBlock | ProcessProposalBlock | GatheringIndicatorBlock
  | ChecklistBlock | ChartBlock | MetricBlock;
```

## Addendum: Interactive Blocks + Data Blocks (2026-04-16, covers Briefs 045+050, 072, 149, 152, 160)

**Context:** Brief 045+050 added `RecordBlock`, `InteractiveTableBlock`, and `ArtifactBlock` (ADR-023) to the union. Brief 072 (complete 2026-04-01) introduced three interactive patterns: `WorkItemFormBlock`, `ConnectionSetupBlock`, and an interactive mode on existing `ProcessProposalBlock`. Brief 149 used the existing `InteractiveTableBlock` for outreach batch summaries. Brief 152 added `SendingIdentityChoiceBlock`. Brief 160 added `TrustMilestoneBlock` for trust upgrade/downgrade celebrations. Brief 168 added the `"vivid"` status variant on RecordBlock. Total ContentBlock count is now **26** (engine source `packages/core/src/content-blocks.ts` is authoritative).

### InteractiveField, FormSubmitAction, and form-submit routing

**InteractiveField** — Form field definition used by interactive blocks:
```typescript
interface InteractiveField {
  name: string;
  label: string;
  type: "text" | "select" | "number" | "toggle";
  options?: string[];           // For select
  required?: boolean;
  placeholder?: string;
}
```

**FormSubmitAction** — An ActionDef variant carrying form values back to the engine:
```typescript
interface FormSubmitAction extends ActionDef {
  type: "form-submit";
  values: Record<string, string | number | boolean>;
}
```

**Action ID routing (form-submit namespace):** Interactive blocks route submissions through the `form-submit.*` action namespace. Example: `form-submit.work-item.create`, `form-submit.connection.setup`, `form-submit.identity.choose`. **Routing is validated via block-type-scoped registry tokens** — not bypassed (Brief 072 Reviewer F1 fix). The action registry binds each token to a specific block type; a WorkItemFormBlock submit cannot invoke a ConnectionSetupBlock handler.

### Added block types

**WorkItemFormBlock** — In-conversation work item creation:
```typescript
interface WorkItemFormBlock {
  type: "work_item_form";
  title: string;
  fields: InteractiveField[];
  submitAction: FormSubmitAction;
}
```
- **Web:** Form component, submit triggers routed `handleSurfaceAction`
- **Telegram:** Sequential prompts or Web App
- **CLI:** `@clack/prompts` form

**ConnectionSetupBlock** — In-conversation integration credential handshake:
```typescript
interface ConnectionSetupBlock {
  type: "connection_setup";
  service: string;                   // e.g., "github", "slack"
  fields: InteractiveField[];        // Typically masked credential input
  submitAction: FormSubmitAction;
}
```
- **Web:** Masked credential input (via existing `/api/credential` endpoint)
- Credential values never round-trip through LLM context — the handshake writes direct to the credential vault

**RecordBlock** — Structured record (inbox item, person, task snapshot). Supports a `"vivid"` status variant (Brief 168) for recommended/featured items.

**InteractiveTableBlock** — Tables with row actions, selection, sorting. Used by Brief 149 outreach batch summaries.

**SendingIdentityChoiceBlock** (Brief 152) — Two-card choice (principal / user) with trade-off descriptions. Gated by `activate_cycle` for outreach cycles when `sendingIdentity` isn't provided upfront.

**ArtifactBlock** (ADR-023) — Compact reference card in conversation with "Open" button → artifact mode. Renders the linked artifact via BlockList in the artifact host.

### Updated ContentBlock union (26 types — matches engine source as of 2026-04-16)

```typescript
type ContentBlock =
  // Original 13 (ADR-021 base)
  | TextBlock | ReviewCardBlock | StatusCardBlock | ActionBlock
  | InputRequestBlock | KnowledgeCitationBlock | ProgressBlock | DataBlock
  | ImageBlock | CodeBlock | ReasoningTraceBlock | SuggestionBlock | AlertBlock
  // +3 onboarding (Brief 044)
  | KnowledgeSynthesisBlock | ProcessProposalBlock | GatheringIndicatorBlock
  // +3 visual (2026-03-27 addendum)
  | ChecklistBlock | ChartBlock | MetricBlock
  // +3 data/meta (Brief 045+050 / ADR-023)
  | RecordBlock | InteractiveTableBlock | ArtifactBlock
  // +3 interactive (Brief 072, 152)
  | WorkItemFormBlock | ConnectionSetupBlock | SendingIdentityChoiceBlock
  // +1 trust (Brief 160)
  | TrustMilestoneBlock;
```

**Count reconciliation note:** The architecture.md and human-layer.md report 26 ContentBlock types as of 2026-04-16. The engine source (`packages/core/src/content-blocks.ts`) is authoritative; this ADR lists the lineage and cross-references briefs.

### Response-level metadata (Insight-129)

`ConfidenceAssessment` and related metadata types are co-located in `content-blocks.ts` but are NOT members of the `ContentBlock` discriminated union. They flow via custom data parts (e.g., `data-confidence`) and render as conversation chrome (ConfidenceCard AI Element), not via the block registry. Litmus test: "Can this appear independently in a Today briefing?" If yes → ContentBlock. If no → response metadata. The 22-block count is unchanged by these additions.

### Right Panel Composition Surface

The right panel (`right-panel.tsx`) gains a new `PanelContext` type:
```typescript
| { type: "blocks"; blocks: ContentBlock[]; title?: string }
```

This makes the right panel a second composition surface — the Self composes it via ContentBlocks, the same way it composes the centre conversation. The `BlockList` component renders the array. This enables the Self to populate the Ditto panel with checklists, charts, and metrics without custom rendering code per panel state.

## Reference Docs to Update

- `docs/architecture.md` — Layer 6 (Human) should reference the surface protocol as the contract between Self and surfaces
- `docs/human-layer.md` — Layer 6 detailed design should reference content blocks as the delivery mechanism for the 16 primitives
- ADR-016 (Conversational Self) — note that the Self's output format is defined by ADR-021
- ADR-009 (Process Output Architecture) — cross-reference: process outputs appear inside surface content blocks
- `src/engine/self.ts` — `SelfConverseResult` type changes from `response: string` to `content: ContentBlock[]`; `SelfConverseCallbacks.onIntermediateText` evolves to `onContentBlock`. **Breaking change** for all current consumers.
- `src/dev-bot.ts` (Telegram bot) — must adopt block renderers instead of direct string display. Currently calls `selfConverse()` and sends `result.response` as text.
- Phase 10 briefs (039-044) — web app should consume `ContentBlock[]` from day one, not string
