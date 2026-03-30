# Brief: AI Elements Deep Adoption + Block Renderer Upgrades

**Date:** 2026-03-30
**Status:** ready
**Depends on:** Brief 058 (AI SDK & Elements Adoption — conversation chrome foundation)
**Unlocks:** Feed composition using Queue container; rich process visualization; SDK-aligned component library

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard MVP
- **Capabilities:** Block renderer quality, AI Elements utilization, conversation chrome completeness

## Context

Brief 058 established the AI Elements adoption foundation — 8 components adopted into `packages/web/components/ai-elements/` for conversation chrome (Message, Conversation, Reasoning, Tool, Confirmation, PromptInput, Suggestion, Shimmer). However, the adoption was shallow:

1. **Conversation chrome gaps:** Our adopted components are simplified reimplementations (monolithic, plain `useState`, no Streamdown, no composable subcomponents) rather than faithful adoptions of the AI Elements patterns. PromptInput is 196 lines vs 1463 in the SDK. Reasoning lacks Streamdown rendering. Tool lacks CodeBlock for syntax-highlighted I/O. Confirmation lacks state-aware composable subcomponents.

2. **Block renderer gaps:** 4 of our 22 ContentBlock renderers have direct AI Elements equivalents that would dramatically improve their quality, but they use hand-built implementations instead. ReasoningTrace → ChainOfThought, KnowledgeCitation → InlineCitation+Sources, Code → AI Elements CodeBlock, Checklist → Task.

3. **Missing primitives:** Queue (collapsible sections with item indicators) and Sources (collapsible source list) have no equivalent in our codebase but map directly to future feed and citation use cases.

**SDK surface utilization** is ~18% (Insight-114). This brief targets raising it to ~45% by deeply adopting the components we've already superficially copied, plus upgrading block renderers that benefit from SDK primitives.

## Objective

Upgrade all conversation chrome components to match AI Elements' composable architecture, and upgrade 4 block renderers to use AI Elements primitives internally — maintaining the two-layer architecture where ContentBlock types define WHAT (engine) and AI Elements define HOW (React UI).

## Non-Goals

- **No ContentBlock type changes.** The 22 types in `content-blocks.ts` are engine-level contracts. This brief only changes renderers (the HOW, not the WHAT).
- **No new block types.** Queue is adopted as a UI primitive for future composition, not as a new ContentBlock type.
- **No PromptInput full rebuild.** The SDK PromptInput is 1463 lines with ChatStatus integration, file management, IME, clipboard, screenshot, command palette. A full rebuild is a separate brief. This brief upgrades the composable subcomponent pattern and adds the key missing primitives (ActionMenu, Submit with ChatStatus awareness).
- **No engine changes.** All work is in `packages/web/`.
- **No Streamdown dependency.** Streamdown is AI Elements' markdown renderer with plugins (cjk, code, math, mermaid). We continue using our existing markdown rendering until a dedicated brief evaluates Streamdown adoption.

## Inputs

1. `packages/web/components/ai-elements/` — Our current adopted components (8 files)
2. `packages/web/components/blocks/` — All 22 block renderers
3. `src/engine/content-blocks.ts` — The 22 ContentBlock type definitions (DO NOT MODIFY)
4. `packages/web/components/blocks/block-registry.tsx` — Registry mapping types → components (DO NOT MODIFY block type coverage)
5. `docs/adrs/021-surface-protocol.md` — Block architecture decisions
6. `docs/adrs/023-artifact-mode.md` — Artifact rendering via blocks
7. AI Elements source (fetch via `gh api` or `npx ai-elements`):
   - `prompt-input.tsx` — 1463 lines, composable subcomponents
   - `chain-of-thought.tsx` — ~180 lines, per-step status
   - `plan.tsx` — ~130 lines, Card + Collapsible + streaming shimmer
   - `queue.tsx` — ~250 lines, collapsible sections with indicators
   - `inline-citation.tsx` — ~250 lines, HoverCard + Carousel
   - `sources.tsx` — ~70 lines, collapsible source list
   - `task.tsx` — ~80 lines, collapsible with file items
   - `tool.tsx` — ~170 lines, composable with CodeBlock
   - `reasoning.tsx` — ~200 lines, Radix Collapsible + composable
   - `confirmation.tsx` — ~160 lines, composable with context
   - `code-block.tsx` — syntax highlighting component

## Constraints

- **Two-layer architecture is inviolable.** ContentBlock types = WHAT (engine, cross-surface). AI Elements = HOW (React UI, web surface only). Block renderers USE AI Elements internally. Block renderers are NOT replaced by AI Elements.
- **`content-blocks.ts` must not change.** If a block renderer needs data the ContentBlock type doesn't have, that's a future brief for engine changes, not a hack.
- **Adopt, not depend.** AI Elements source files are copied into `packages/web/components/ai-elements/`, understood, adapted, and owned. We do NOT `npm install @ai-sdk/elements`.
- **Radix UI as the primitive layer.** AI Elements use Radix Collapsible, HoverCard, ScrollArea. Install these via `pnpm add @radix-ui/react-collapsible @radix-ui/react-hover-card @radix-ui/react-scroll-area` if not already present.
- **`onAction` callback preserved.** All block renderers that accept `onAction` must continue to do so. AI Elements components don't have this concept — the block renderer wraps AI Elements and wires actions.
- **Composable subcomponent pattern via Context.** All upgraded AI Elements must follow the SDK pattern: a Provider component creates context, child subcomponents consume it. This enables consumers to compose custom layouts.
- **`useControllableState` for open/closed.** All collapsible components (Reasoning, ChainOfThought, Plan, Sources, Task) must support both controlled and uncontrolled usage via `useControllableState` (adopt from Radix or implement: `const [value, setValue] = useControllableState({ prop, defaultProp, onChange })`). Tool and Queue use Radix Collapsible directly but do not need external controllability in this brief.
- **Backward-compatible default exports.** Every rewritten component (Reasoning, Tool, Confirmation, PromptInput) must export a default composition that matches the current API signature. Existing consumers in `message.tsx` and `conversation.tsx` must continue to work without modification. The composable subcomponents are additional named exports for future custom compositions.
- **Confirmation actions flow through `onAction`.** The Confirmation component's accept/reject state transitions must continue to route through the existing `onAction` callback to the engine, preserving feedback capture for the learning layer.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Composable subcomponent pattern | AI Elements `plan.tsx`, `tool.tsx`, `confirmation.tsx` | adopt | Production-quality composable component architecture |
| `useControllableState` | Radix UI `@radix-ui/react-use-controllable-state` | depend | Standard controlled/uncontrolled state hook |
| Radix Collapsible | `@radix-ui/react-collapsible` | depend | Used by AI Elements for all expandable sections |
| Radix HoverCard | `@radix-ui/react-hover-card` | depend | Used by InlineCitation for hover preview cards |
| Radix ScrollArea | `@radix-ui/react-scroll-area` | depend | Used by Queue for scrollable sections |
| ChainOfThought | AI Elements `chain-of-thought.tsx` | adopt | Step-by-step reasoning with per-step status indicators |
| Plan | AI Elements `plan.tsx` | adopt | Collapsible plan card with streaming shimmer |
| Queue | AI Elements `queue.tsx` | adopt | Sectioned item list with indicators and actions |
| InlineCitation | AI Elements `inline-citation.tsx` | adopt | Hover card with source preview and carousel |
| Sources | AI Elements `sources.tsx` | adopt | Collapsible source count strip |
| Task | AI Elements `task.tsx` | adopt | Collapsible task with file items |
| CodeBlock (AI Elements) | AI Elements `code-block.tsx` | adopt | Syntax highlighting for code display |
| Tool (upgraded) | AI Elements `tool.tsx` | adopt | Composable with CodeBlock for I/O display |
| Reasoning (upgraded) | AI Elements `reasoning.tsx` | adopt | Radix Collapsible + composable subcomponents |
| Confirmation (upgraded) | AI Elements `confirmation.tsx` | adopt | State-aware composable with context |

## What Changes (Work Products)

### Layer 1: Conversation Chrome Upgrades (existing ai-elements/ files)

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/reasoning.tsx` | **Rewrite**: Replace plain `useState` with `useControllableState`. Add composable subcomponents: `Reasoning`, `ReasoningTrigger`, `ReasoningContent`. Use Radix Collapsible for expand/collapse. Keep our timer display as a Ditto extension. |
| `packages/web/components/ai-elements/tool.tsx` | **Rewrite**: Replace hand-built expand/collapse with Radix Collapsible. Add composable subcomponents: `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput`. Use AI Elements CodeBlock for syntax-highlighted JSON input/output. Add Badge for tool status (`running`, `complete`, `error`). |
| `packages/web/components/ai-elements/confirmation.tsx` | **Rewrite**: Add ConfirmationProvider context. Add composable subcomponents: `Confirmation`, `ConfirmationTitle`, `ConfirmationRequest`, `ConfirmationAccepted`, `ConfirmationRejected`, `ConfirmationActions`. State-aware rendering: show request when pending, accepted/rejected when resolved. |
| `packages/web/components/ai-elements/prompt-input.tsx` | **Modify**: Add `PromptInputProvider` context for composable subcomponents. Extract `PromptInputTextarea`, `PromptInputSubmit`, `PromptInputActions` as named subcomponents. Wire Submit to disable when empty / while streaming. Keep our current feature scope (no file management, no IME, no screenshot, no ActionMenu — those are future brief). |

### Layer 2: New AI Elements Adoptions

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/chain-of-thought.tsx` | **Create**: Adopt AI Elements ChainOfThought. Composable subcomponents: `ChainOfThought`, `ChainOfThoughtHeader`, `ChainOfThoughtStep`, `ChainOfThoughtContent`, `ChainOfThoughtSearchResults`, `ChainOfThoughtImage`. Per-step status: `complete` (checkmark), `active` (spinner), `pending` (circle). Collapsible via Radix. Connector lines between steps via CSS `::before` pseudo-element. |
| `packages/web/components/ai-elements/plan.tsx` | **Create**: Adopt AI Elements Plan. Composable subcomponents: `Plan`, `PlanHeader`, `PlanTitle`, `PlanDescription`, `PlanContent`, `PlanTrigger`. Uses Card + Radix Collapsible. `isStreaming` prop shows Shimmer component on description. Open/closed via `useControllableState`. |
| `packages/web/components/ai-elements/queue.tsx` | **Create**: Adopt AI Elements Queue. Composable subcomponents: `Queue`, `QueueSection`, `QueueItem`, `QueueItemIndicator`, `QueueItemContent`, `QueueItemActions`. Collapsible sections with item counts. Radix ScrollArea for long lists. |
| `packages/web/components/ai-elements/inline-citation.tsx` | **Create**: Adopt AI Elements InlineCitation. Composable subcomponents: `InlineCitation`, `InlineCitationCard`, `InlineCitationCarousel`, `InlineCitationSource`, `InlineCitationQuote`. Uses Radix HoverCard for hover preview. Carousel for multiple sources within a single citation. |
| `packages/web/components/ai-elements/sources.tsx` | **Create**: Adopt AI Elements Sources. Composable subcomponents: `Sources`, `SourcesTrigger`, `SourcesContent`, `Source`. Collapsible "Used N sources" trigger. Each Source renders as a clickable link. |
| `packages/web/components/ai-elements/task.tsx` | **Create**: Adopt AI Elements Task. Composable subcomponents: `Task`, `TaskTrigger`, `TaskContent`, `TaskItemFile`. Collapsible task container. TaskItemFile shows file icon + name. |
| `packages/web/components/ai-elements/code-block.tsx` | **Create**: Adopt AI Elements CodeBlock. Props: `code: string`, `language: string`, `filename?: string`. Syntax highlighting via Shiki (`shiki/bundle/web`, `github-light`/`github-dark` themes). Copy-to-clipboard button. Conditional line numbers. Language badge. |

### Layer 3: Block Renderer Upgrades

These block renderers are upgraded to USE AI Elements components internally. The block renderer remains the entry point — it maps ContentBlock fields to AI Elements props.

| File | Action |
|------|--------|
| `packages/web/components/blocks/reasoning-trace-block.tsx` | **Rewrite**: Use `ChainOfThought` component internally. Map `ReasoningTraceBlock.title` → `ChainOfThoughtHeader`, each `step` → `ChainOfThoughtStep` with status (all complete since traces are post-hoc). `ReasoningTraceBlock.conclusion` rendered below the step list. `ReasoningTraceBlock.confidence` rendered as a Badge. |
| `packages/web/components/blocks/knowledge-citation-block.tsx` | **Rewrite**: Use `Sources` + `InlineCitation` internally. `KnowledgeCitationBlock.label` → `SourcesTrigger` text showing source count. Each `source` in the array → `Source` link inside `SourcesContent`. If sources have `excerpt`, render `InlineCitationQuote` on hover via `InlineCitationCard`. |
| `packages/web/components/blocks/code-block.tsx` | **Rewrite**: Use AI Elements `CodeBlock` component internally. Map `CodeBlock.language` → `language` prop, `CodeBlock.content` → `code` prop, `CodeBlock.filename` → `filename` prop. Handle `CodeBlock.diff` by passing `language: "diff"` and letting the highlighter handle diff syntax. |
| `packages/web/components/blocks/checklist-block.tsx` | **Rewrite**: Use `Task` component structure internally. `ChecklistBlock.title` → `TaskTrigger` text. Each `item` → rendered inside `TaskContent` with status icons (✓ done, ○ pending, ⚠ warning). Items with `detail` show the detail as secondary text. Collapsible when more than 5 items. |

### Layer 4: No-Change Blocks (Ditto-original, no AI Elements equivalent)

These 18 block renderers stay as-is. Documenting explicitly so the Builder doesn't waste time auditing them:

| Block Type | Why no change |
|------------|--------------|
| `text` | Markdown rendering — Ditto-original |
| `review_card` | Process review with confidence + actions — Ditto-original |
| `status_card` | Entity status display — Ditto-original |
| `actions` | Action button group — Ditto-original |
| `input_request` | Structured input form — Ditto-original |
| `process_proposal` | Domain primitive with approve/adjust actions and step execution status (done/current/pending) — these are process creation semantics, not generic plan display. Plan component adds overhead without benefit. Ditto-original. |
| `progress` | Step progress bar — Ditto-original (could use Task in future, but current implementation is sufficient) |
| `data` | Key-value / table / list display — Ditto-original |
| `image` | Image with caption — Ditto-original |
| `suggestion` | Already uses AI Elements Suggestion |
| `alert` | Alert banner — Ditto-original |
| `knowledge_synthesis` | Onboarding dimension display — Ditto-original |
| `gathering_indicator` | Onboarding animation — Ditto-original |
| `chart` | Sparkline/donut/bar — Ditto-original |
| `metric` | Large numbers with trends — Ditto-original |
| `record` | Structured record with fields/checks — Ditto-original |
| `interactive_table` | Table with per-row actions — Ditto-original |
| `artifact` | Artifact reference card — Ditto-original |

### Supporting Changes

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/use-controllable-state.ts` | **Create**: Adopt `useControllableState` hook. Either install `@radix-ui/react-use-controllable-state` or copy the ~30-line implementation. Used by Reasoning, Plan, ChainOfThought, Task, Sources, Queue. |
| `packages/web/components/ai-elements/index.ts` | **Modify**: Export all new components. Update barrel exports for ChainOfThought, Plan, Queue, InlineCitation, Sources, Task, CodeBlock. |
| `package.json` (web) | **Modify**: Add Radix dependencies if not present: `@radix-ui/react-collapsible`, `@radix-ui/react-hover-card`, `@radix-ui/react-scroll-area`. Add syntax highlighting: `shiki` (single-theme bundle, `shiki/bundle/web` for common languages). |

## Detailed Implementation Specifications

### Spec 1: `useControllableState` Hook

```typescript
// packages/web/components/ai-elements/use-controllable-state.ts
interface UseControllableStateParams<T> {
  prop?: T;
  defaultProp?: T;
  onChange?: (value: T) => void;
}

function useControllableState<T>({ prop, defaultProp, onChange }: UseControllableStateParams<T>): [T, (value: T) => void]
```

- When `prop` is provided, component is controlled (external state).
- When only `defaultProp` is provided, component is uncontrolled (internal state).
- `onChange` fires in both modes.

### Spec 2: ChainOfThought Component

```typescript
// packages/web/components/ai-elements/chain-of-thought.tsx

// Context
interface ChainOfThoughtContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Subcomponents
ChainOfThought          // Root: Provider + Radix Collapsible
ChainOfThoughtHeader    // Trigger area: click to expand/collapse
ChainOfThoughtStep      // Single step: indicator (✓/spinner/○) + label + detail
ChainOfThoughtContent   // Collapsible content wrapper
ChainOfThoughtSearchResults  // Optional: search result list within a step
ChainOfThoughtImage     // Optional: image within a step

// Step status rendering:
// - "complete" → green checkmark icon
// - "active" → animated spinner icon
// - "pending" → gray circle icon
// Connector lines: CSS ::before on each step, 1px border-left from indicator center
```

**Props mapping from ReasoningTraceBlock:**
| ReasoningTraceBlock field | ChainOfThought prop |
|---------------------------|---------------------|
| `title` | `<ChainOfThoughtHeader>` children |
| `steps[].label` | `<ChainOfThoughtStep>` title text |
| `steps[].detail` | `<ChainOfThoughtStep>` description text |
| (all steps are post-hoc) | All steps get status `"complete"` |
| `conclusion` | Rendered below `<ChainOfThoughtContent>` |
| `confidence` | Badge component next to header |

### Spec 3: Plan Component

```typescript
// packages/web/components/ai-elements/plan.tsx

interface PlanContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isStreaming?: boolean;
}

Plan            // Root: Card + Provider
PlanHeader      // Header section inside card
PlanTitle       // Title text (h3-level)
PlanDescription // Description text; shows Shimmer when isStreaming
PlanContent     // Radix Collapsible content body
PlanTrigger     // Toggle open/closed (wraps Radix CollapsibleTrigger)
```

Plan is adopted as a **UI primitive** for future use (e.g., showing Self's execution plan during orchestration), not mapped to ProcessProposalBlock. ProcessProposal is a Ditto-original domain component — see Layer 4 no-change list.

### Spec 4: Queue Component

```typescript
// packages/web/components/ai-elements/queue.tsx

Queue                // Root: container
QueueSection         // Collapsible section with title + item count badge
QueueItem            // Single item row
QueueItemIndicator   // Status dot/icon on the left
QueueItemContent     // Item label and description
QueueItemActions     // Action buttons on the right
```

This is adopted as a **UI primitive only** — no ContentBlock maps to it directly. It will be used by future feed and batch review compositions.

### Spec 5: InlineCitation + Sources

```typescript
// packages/web/components/ai-elements/inline-citation.tsx

InlineCitation         // Root: wraps trigger text
InlineCitationCard     // HoverCard content showing source preview
InlineCitationCarousel // Multi-source carousel within hover card
InlineCitationSource   // Single source entry (title + URL + type icon)
InlineCitationQuote    // Excerpt text within source preview

// packages/web/components/ai-elements/sources.tsx

Sources         // Root: Radix Collapsible
SourcesTrigger  // "Used N sources" text + chevron
SourcesContent  // List of Source components
Source          // Single source link
```

**Props mapping from KnowledgeCitationBlock:**
| KnowledgeCitationBlock field | Component mapping |
|------------------------------|-------------------|
| `label` | `<SourcesTrigger>` displays label text |
| `sources.length` | `<SourcesTrigger>` shows count: "Used {N} sources" |
| `sources[].name` | `<Source>` link text |
| `sources[].type` | `<Source>` icon (document/web/database) |
| `sources[].excerpt` | `<InlineCitationQuote>` in hover card (when excerpt exists) |

### Spec 6: Task Component

```typescript
// packages/web/components/ai-elements/task.tsx

Task           // Root: Radix Collapsible
TaskTrigger    // Title + chevron
TaskContent    // Collapsible body
TaskItemFile   // File item with icon (not used by ChecklistBlock but adopted for completeness)
```

**Props mapping from ChecklistBlock:**
| ChecklistBlock field | Task prop |
|----------------------|-----------|
| `title` | `<TaskTrigger>` children |
| `items[]` | Rendered inside `<TaskContent>` as status-annotated list |
| `items[].label` | Item text |
| `items[].status` | Icon: ✓ done (green), ○ pending (gray), ⚠ warning (amber) |
| `items[].detail` | Secondary text below item label |

Collapsible behavior: auto-collapse when `items.length > 5`, open by default when ≤ 5.

### Spec 7: CodeBlock (AI Elements)

```typescript
// packages/web/components/ai-elements/code-block.tsx

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
  showLineNumbers?: boolean;
}
```

- Syntax highlighting via Shiki (`shiki/bundle/web` for common web languages only — keeps bundle small).
- Themes: `github-light` for light mode, `github-dark` for dark mode (closest alignment to our token palette).
- Copy-to-clipboard button (top-right, appears on hover).
- Filename badge (top-left, when provided).
- Language badge (bottom-right).
- For `diff: true` blocks, pass `language: "diff"` to the highlighter and apply diff-aware line coloring (green for additions, red for deletions).

**Props mapping from CodeBlock (ContentBlock):**
| CodeBlock (ContentBlock) field | CodeBlock (AI Element) prop |
|-------------------------------|----------------------------|
| `content` | `code` |
| `language` | `language` |
| `filename` | `filename` |
| `diff === true` | Override `language` to `"diff"` |

### Spec 8: Tool Upgrade

```typescript
// packages/web/components/ai-elements/tool.tsx (rewrite)

interface ToolContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: "running" | "complete" | "error";
}

Tool           // Root: Provider + Radix Collapsible
ToolHeader     // Tool name + status Badge + chevron
ToolContent    // Collapsible body
ToolInput      // CodeBlock rendering of tool input JSON
ToolOutput     // CodeBlock rendering of tool output JSON
```

Status badge variants:
- `"running"` → blue badge with spinner
- `"complete"` → green badge with checkmark
- `"error"` → red badge with X icon

Input/output both use the new AI Elements CodeBlock with `language: "json"`.

### Spec 9: Reasoning Upgrade

```typescript
// packages/web/components/ai-elements/reasoning.tsx (rewrite)

interface ReasoningContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isThinking: boolean;
  seconds: number;
}

Reasoning          // Root: Provider + Radix Collapsible
ReasoningTrigger   // "Thinking..." text + timer + chevron
ReasoningContent   // Collapsible content: thinking text
```

- `useControllableState` for open/closed.
- Timer continues counting while `isThinking === true`.
- Our existing timer logic is preserved as a Ditto extension (SDK Reasoning doesn't have a timer).
- Content renders thinking text as monospace pre-wrap (no Streamdown — see Non-Goals).

### Spec 10: Confirmation Upgrade

```typescript
// packages/web/components/ai-elements/confirmation.tsx (rewrite)

interface ConfirmationContextValue {
  state: "pending" | "accepted" | "rejected";
  title: string;
}

Confirmation           // Root: Provider
ConfirmationTitle      // Title text
ConfirmationRequest    // Shown when state === "pending": description + action buttons
ConfirmationAccepted   // Shown when state === "accepted": accepted message
ConfirmationRejected   // Shown when state === "rejected": rejected message
ConfirmationActions    // Accept + Reject buttons (only visible when pending)
```

State-aware rendering: the component shows different content based on `state`. This replaces our current always-visible button approach.

### Spec 11: PromptInput Upgrade

```typescript
// packages/web/components/ai-elements/prompt-input.tsx (modify)

interface PromptInputContextValue {
  value: string;
  onValueChange: (value: string) => void;
  isLoading: boolean;
  onSubmit: () => void;
}

PromptInput          // Root: Provider + form container
PromptInputTextarea  // Auto-resizing textarea (extract from current monolithic impl)
PromptInputSubmit    // Submit button: disabled when empty, shows stop icon when loading
PromptInputActions   // Left-side action area (slot for future extensibility — empty in this brief)
```

This is a **refactor** of the existing monolithic component into composable subcomponents, not a feature expansion. The current functionality (text input, submit, loading state) is preserved. The composable pattern enables future briefs to add file upload, command palette, etc. by composing new subcomponents.

## User Experience

- **Jobs affected:** Review (richer citation display, better reasoning traces), Orient (syntax-highlighted code, collapsible checklists), Capture (composable prompt input extensibility)
- **Primitives involved:** P30 (block gallery uses upgraded renderers), P33 (review output citations), P6 (Output Viewer — code rendering upgrade)
- **Designer input:** `.impeccable.md` is authoritative for all visual decisions. AI Elements provide interaction architecture; Ditto design tokens override all visual styling.

### Design Principles (from `.impeccable.md`)

Every component in this brief must follow these rules. They are non-negotiable.

1. **No cards, no decoration.** Hierarchy through typography, whitespace, and subtle accents. The only exceptions are hero moments (process proposals, connect cards) which may use `surface-raised` background with `border-radius: var(--radius-lg)`. Collapsible components use `border-left: 2px solid` accents — not card wrappers with shadows.
2. **Quiet, not minimal.** Components should feel spacious and confident, never compact or cramped. Use `--spacing-4` (16px) for internal padding, `--spacing-6` (24px) between sections.
3. **Typography does the work.** `--font-sans` (DM Sans) for all UI text. `--font-mono` (JetBrains Mono) only for code blocks and tool I/O. Size hierarchy: `--text-sm` (14px) for metadata/timestamps, `--text-base` (16px) for body content, `--text-lg` (20px) for component titles.
4. **Two-green accent system.** Emerald `--color-vivid` (#059669 light / #10B981 dark) for primary accents (active step indicators, positive status). Forest `--color-vivid-deep` (#3D5A48 light / #6B8F71 dark) for emphasis borders (synthesis blocks, reasoning traces). Never use both greens in the same component — pick one based on semantic meaning.
5. **Every data point has provenance.** Citations, reasoning steps, and tool outputs must show where information came from. Progressive disclosure: summary visible, detail on interaction.

### Motion Specifications

All animations must respect `prefers-reduced-motion` with static fallbacks. No bouncing, spinning loaders, parallax, or blocking animations.

| Category | Duration | Easing | Used by |
|----------|----------|--------|---------|
| Micro | 100–150ms | `ease-out` | Button press, toggle, checkbox, hover state |
| Standard | 200–250ms | `ease-in-out` | Collapsible expand/collapse (Reasoning, Tool, ChainOfThought, Sources, Task, Plan) |
| Entrance | 300ms | `ease-out` | HoverCard appear (InlineCitation), new content reveal |
| Exit | 200ms | `ease-in` | HoverCard dismiss, collapsible close |

**Specific animation behaviors:**
- **Collapsible expand:** Smooth height transition + content opacity fade from 0→1. Content fades in 50ms after height begins expanding (stagger prevents layout jank).
- **Collapsible collapse:** Content opacity fades to 0 first (100ms), then height collapses (150ms). Exit is faster than entrance.
- **HoverCard (InlineCitation):** 300ms entrance delay before showing (prevents accidental triggers). Fade in with subtle `scale(0.98)` → `scale(1)` transform. Shadow: `--shadow-medium`.
- **Shimmer (Plan streaming):** Warm-tinted shimmer on placeholder areas, not grey. Use `--color-vivid-subtle` (#ECFDF5 light / #1A2E22 dark) as shimmer base, sweep with `--color-vivid` at 15% opacity.
- **Status badge transitions:** Color and icon crossfade (150ms) when status changes (e.g., tool running→complete).

### Per-Component Interaction Design

#### Reasoning (conversation chrome)

| State | Visual Treatment |
|-------|-----------------|
| **Thinking (collapsed)** | `--text-sm` "Thinking..." label + live timer in `--color-text-muted`. Chevron pointing right. No background — flows as inline text below message. |
| **Thinking (expanded)** | Chevron rotates 90° (150ms ease-out). Content area: `border-left: 2px solid var(--color-vivid-deep)` + `padding-left: var(--spacing-4)`. Thinking text in `--font-mono`, `--text-sm`, `--color-text-secondary`. Pre-wrap whitespace. |
| **Complete (collapsed)** | Timer stops. Label changes to "Thought for Ns". `--color-text-muted`. |
| **Complete (expanded)** | Same as thinking expanded, but no pulsing indicator. |

Keyboard: `Enter` or `Space` toggles. Focus ring: `2px offset var(--color-vivid)`.

#### Tool (conversation chrome)

| State | Visual Treatment |
|-------|-----------------|
| **Running (collapsed)** | Tool name in `--text-sm` `--color-text-primary`. Status badge: `--color-info` background, `--text-xs` "Running" + 3-dot pulse animation (same as typing indicator: opacity 0.3→1.0, staggered 150ms). Chevron right. |
| **Complete (collapsed)** | Badge: `--color-positive` background, checkmark icon, "Done". |
| **Error (collapsed)** | Badge: `--color-negative` background, X icon, "Error". |
| **Expanded** | Collapsible opens (200ms ease-in-out). Two sections: **Input** and **Output**, each with a `--text-xs` `--color-text-muted` label. Content in `CodeBlock` component with `language: "json"`. Sections separated by `--color-border` 1px line. |

Badge styling: `--text-xs`, `border-radius: var(--radius-full)` (pill), `padding: 2px 8px`. Icon size: 12px, inline with text.

#### Confirmation (conversation chrome)

| State | Visual Treatment |
|-------|-----------------|
| **Pending** | `border-left: 2px solid var(--color-caution)` + `padding-left: var(--spacing-4)`. Title in `--text-base` `--color-text-primary` (semibold). Description in `--text-sm` `--color-text-secondary`. Action buttons below: Accept (pill, `--color-vivid` background, white text) + Reject (pill, ghost/outline style, `--color-text-secondary`). |
| **Accepted** | Border-left color transitions to `--color-positive` (150ms). Buttons fade out (200ms). Accepted message appears: checkmark icon + text in `--color-positive`. |
| **Rejected** | Border-left color transitions to `--color-negative` (150ms). Buttons fade out (200ms). Rejected message appears: X icon + text in `--color-text-muted`. |

Buttons are pills (`border-radius: var(--radius-full)`) per `.impeccable.md`. Accept button has prominent visual weight; Reject is deliberately quieter.

#### PromptInput (conversation chrome)

No visual changes — this is a structural refactor into composable subcomponents. Preserve exact current appearance: capsule-shaped input (`border-radius: 24px`), `--color-surface-raised` background, `--shadow-subtle` on focus. Submit button: pill, `--color-vivid` background when active, disabled state at 40% opacity.

#### ChainOfThought (block renderer for `reasoning_trace`)

| Element | Visual Treatment |
|---------|-----------------|
| **Header** | `--text-base` semibold, `--color-text-primary`. Chevron right (collapsed) / down (expanded). Step count badge: `--text-xs`, `--color-text-muted`, `(N steps)`. |
| **Step (complete)** | Left: 16px circle with checkmark icon in `--color-positive`. `--text-sm` label in `--color-text-primary`. Detail in `--text-sm` `--color-text-secondary`, below label. |
| **Step (active)** | Left: 16px circle with spinner (3-dot pulse) in `--color-vivid`. Label in `--color-text-primary`. |
| **Step (pending)** | Left: 16px circle outline in `--color-border-strong`. Label in `--color-text-muted`. |
| **Connector lines** | CSS `::before` pseudo-element on each step (except first): `width: 2px`, `background: var(--color-border)`, positioned center of the 16px circle area, spanning from previous step's circle bottom to current step's circle top. |
| **Conclusion** | Below step list, separated by `--spacing-4`. `--text-sm`, `--color-text-primary`. Prefix: "Conclusion:" in `--color-text-muted`. |
| **Confidence badge** | Next to header. Pill badge: `--text-xs`. High = `--color-positive` text, Medium = `--color-caution` text, Low = `--color-negative` text. Background: same color at 10% opacity. |

All steps in `reasoning_trace` blocks render as `complete` status (traces are post-hoc). Active/pending states exist for future live-streaming use.

Default state: **collapsed** (header + step count visible). Expand to see full trace.

#### InlineCitation + Sources (block renderer for `knowledge_citation`)

| Element | Visual Treatment |
|---------|-----------------|
| **Sources trigger (collapsed)** | `--text-sm` `--color-text-muted`. Text: `label` or "Used N sources". Chevron right. No background — inline typographic element. |
| **Sources trigger (expanded)** | Chevron down. Source list appears below with `--spacing-2` gap between items. |
| **Source link** | `--text-sm` `--color-vivid` (green link color). Type icon prefix: 📄 document, 🌐 web, 🗄 database (or use Lucide icons: `FileText`, `Globe`, `Database` at 14px). Hover: underline. |
| **InlineCitation hover card** | Appears after 300ms hover delay. `--shadow-medium`. `background: var(--color-surface-raised)`. `border-radius: var(--radius-lg)` (12px). `padding: var(--spacing-4)`. Max-width: 320px. |
| **Hover card content** | Source name in `--text-sm` semibold. Type + icon below. Excerpt (when present) in `--text-sm` `--color-text-secondary`, `border-left: 2px solid var(--color-border)` + `padding-left: var(--spacing-3)` (quote style). |
| **Carousel (multiple sources)** | Dots indicator at bottom. Left/right navigation on hover. Swipe on touch. Each card same layout. |

Only show hover cards for sources that have `excerpt` data. Sources without excerpts are plain links — no empty hover card.

#### CodeBlock (block renderer for `code`)

| Element | Visual Treatment |
|---------|-----------------|
| **Container** | `background: var(--color-surface)` (light) / `var(--color-surface)` (dark). `border-radius: var(--radius-md)` (8px). `border: 1px solid var(--color-border)`. `padding: var(--spacing-4)`. No outer shadow (code blocks are inline content, not hero moments). |
| **Code text** | `--font-mono` (JetBrains Mono). `--text-sm` (14px). Line-height: 1.6. Syntax highlighting via Shiki — use `github-light` theme for light mode, `github-dark` for dark mode (these align closest to our token palette). |
| **Line numbers** | `--text-xs` `--color-text-muted`. Right-aligned. Separated from code by `--color-border` 1px line + `--spacing-3` gap. Only show when `showLineNumbers` is true or content exceeds 5 lines. |
| **Filename badge** | Top-left, inside container. `--text-xs` `--color-text-muted`. Icon: `FileCode` (Lucide) at 12px. |
| **Language badge** | Top-right, inside container. `--text-xs` `--color-text-muted`. Uppercase. |
| **Copy button** | Top-right (replaces language badge on hover). `opacity: 0` → `opacity: 1` on container hover (150ms ease-out). Pill shape. `--text-xs`. Icon: `Copy` (Lucide) at 14px. After click: icon transitions to `Check` for 2s, then back. |
| **Diff mode** | `diff: true` → additions get `background: var(--color-positive)` at 10% opacity. Deletions get `background: var(--color-negative)` at 10% opacity. `+`/`-` prefixes colored to match. |

Contrast requirement: syntax highlighting tokens must meet 4.5:1 against container background (WCAG AA). Shiki's github themes meet this by default.

#### Task/Checklist (block renderer for `checklist`)

| Element | Visual Treatment |
|---------|-----------------|
| **Trigger (collapsed)** | Title in `--text-sm` semibold `--color-text-primary`. Item count: `--text-xs` `--color-text-muted` "(N items)". Chevron right. Summary of status: "3 of 5 done" in `--color-text-muted`. |
| **Trigger (expanded)** | Chevron down. Items list visible. |
| **Item (done)** | Checkmark icon in `--color-positive` (16px). Label in `--text-sm` `--color-text-primary`. |
| **Item (pending)** | Circle outline in `--color-border-strong` (16px). Label in `--text-sm` `--color-text-secondary`. |
| **Item (warning)** | Triangle-alert icon in `--color-caution` (16px). Label in `--text-sm` `--color-text-primary`. |
| **Item detail** | Below label, indented to align with text (not icon). `--text-xs` `--color-text-muted`. |

Auto-collapse: `items.length > 5`. Open by default: `items.length ≤ 5`. Item spacing: `--spacing-2` (8px) between items. Icon-to-text gap: `--spacing-2` (8px).

#### Plan (UI primitive — not mapped to any block)

| Element | Visual Treatment |
|---------|-----------------|
| **Card wrapper** | `background: var(--color-surface-raised)`. `border-radius: var(--radius-lg)` (12px). `padding: var(--spacing-4)`. `--shadow-subtle` on hover. This is one of the rare hero-moment components that uses a card — it represents a significant structural proposal. |
| **Title** | `--text-lg` semibold. |
| **Description** | `--text-sm` `--color-text-secondary`. When `isStreaming`: text replaced by warm shimmer (`--color-vivid-subtle` base). |
| **Content (expanded)** | Step list or custom content. Standard collapsible animation. |

#### Queue (UI primitive — not mapped to any block)

| Element | Visual Treatment |
|---------|-----------------|
| **Section header** | `--text-sm` semibold `--color-text-primary`. Item count badge: `--text-xs` pill in `--color-surface` background. Chevron for collapsible. |
| **Item row** | `--spacing-3` vertical padding. `border-bottom: 1px solid var(--color-border)` between items. Hover: `background: var(--color-surface)`. |
| **Item indicator** | Left-side dot: 8px circle. Color based on status (uses semantic palette). |
| **Item actions** | Right-aligned. Appear on row hover (150ms fade-in). Pill buttons, ghost style. |
| **ScrollArea** | Radix ScrollArea. Custom scrollbar: 6px wide, `--color-border-strong` thumb, transparent track. Appears on hover, fades on idle. |

### Accessibility Requirements

All components in this brief must meet WCAG 2.1 AA:

| Requirement | How |
|-------------|-----|
| **Contrast** | 4.5:1 for text, 3:1 for UI elements. All semantic colors in our token palette already pass — do not override. |
| **Keyboard** | All collapsibles toggle on `Enter`/`Space`. HoverCards also openable via `Focus` (not just hover). Tab order follows visual order. Escape closes any open popover/collapsible. |
| **Focus ring** | `2px offset` ring in `var(--color-vivid)` on all interactive elements. Use `focus-visible` (not `focus`) to avoid showing ring on mouse click. |
| **Reduced motion** | `@media (prefers-reduced-motion: reduce)` → all transitions become instant (0ms). Shimmer becomes static background. Typing indicator dots show at fixed opacity. |
| **Screen reader** | Collapsible triggers: `aria-expanded`. Status badges: `aria-label` with status text. Code blocks: `role="code"`. Hover card content: `aria-describedby` linking trigger to card content. |
| **Zoom** | All layouts functional at 200% browser zoom. No fixed widths that cause horizontal scroll. |

## Acceptance Criteria

### Layer 1: Conversation Chrome

1. [ ] `reasoning.tsx` uses Radix Collapsible and `useControllableState` for open/close
2. [ ] `reasoning.tsx` exports composable subcomponents: `Reasoning`, `ReasoningTrigger`, `ReasoningContent`
3. [ ] `reasoning.tsx` preserves the timer display (Ditto extension)
4. [ ] `tool.tsx` uses Radix Collapsible with composable subcomponents: `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput`
5. [ ] `tool.tsx` shows status Badge (`running`/`complete`/`error`)
6. [ ] `tool.tsx` uses AI Elements CodeBlock for syntax-highlighted JSON input and output
7. [ ] `confirmation.tsx` exports composable subcomponents: `Confirmation`, `ConfirmationTitle`, `ConfirmationRequest`, `ConfirmationAccepted`, `ConfirmationRejected`, `ConfirmationActions`
8. [ ] `confirmation.tsx` renders state-aware content (pending shows request+buttons, accepted/rejected shows resolution)
9. [ ] `prompt-input.tsx` exports composable subcomponents: `PromptInput`, `PromptInputTextarea`, `PromptInputSubmit`, `PromptInputActions`
10. [ ] `prompt-input.tsx` has `PromptInputProvider` context

### Layer 2: New AI Elements

11. [ ] `chain-of-thought.tsx` exists with all 6 subcomponents, per-step status indicators (complete/active/pending), connector lines
12. [ ] `plan.tsx` exists with all 6 subcomponents, Card wrapper, Shimmer for streaming state
13. [ ] `queue.tsx` exists with all 5 subcomponents, collapsible sections, ScrollArea
14. [ ] `inline-citation.tsx` exists with all 5 subcomponents, HoverCard, Carousel
15. [ ] `sources.tsx` exists with all 4 subcomponents, collapsible source list
16. [ ] `task.tsx` exists with all 4 subcomponents, collapsible container
17. [ ] `code-block.tsx` exists with Shiki syntax highlighting, copy button, filename badge, language badge, conditional line numbers (shown when enabled or >5 lines)

### Layer 3: Block Renderer Upgrades

18. [ ] `reasoning-trace-block.tsx` uses ChainOfThought component — all steps render as "complete" status, conclusion and confidence badge rendered
19. [ ] `knowledge-citation-block.tsx` uses Sources + InlineCitation — hover previews for sources with excerpts
20. [ ] `code-block.tsx` (block renderer) uses AI Elements CodeBlock — syntax highlighting works for at least: typescript, javascript, json, python, bash, diff
21. [ ] `checklist-block.tsx` uses Task component structure — auto-collapse when >5 items, status icons preserved (✓/○/⚠)

### Cross-cutting

22. [ ] `useControllableState` hook exists and is used by all collapsible AI Elements components
23. [ ] All Radix dependencies installed and importable
24. [ ] `pnpm run type-check` passes with 0 errors
25. [ ] `pnpm test` passes — all existing tests still pass
26. [ ] Block registry unchanged — all 22 types still mapped, exhaustiveness check still compiles
27. [ ] No changes to `src/engine/content-blocks.ts`
28. [ ] All block renderers that accept `onAction` still accept and wire it correctly
29. [ ] Rewritten components (Reasoning, Tool, Confirmation, PromptInput) export backward-compatible default compositions — `message.tsx` and `conversation.tsx` work without modification
30. [ ] Confirmation accept/reject actions route through `onAction` to engine (feedback capture preserved)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer specifically checks:
   - Two-layer architecture preserved (ContentBlock types untouched, renderers use AI Elements internally)
   - All 22 block types still render in block-registry.tsx (no regressions)
   - Composable subcomponent pattern consistent across all new/upgraded AI Elements
   - `useControllableState` used consistently (no plain `useState` for open/closed in components that should be controllable)
   - `onAction` callback wiring preserved on all block renderers that had it
   - No Streamdown dependency introduced (Non-Goal)
   - No new ContentBlock types added (Non-Goal)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Type check
pnpm run type-check
# Expect: 0 errors

# 2. Unit tests
pnpm test
# Expect: all tests pass

# 3. Dev server
pnpm dev
# Navigate to localhost:3000

# 4. Visual verification — conversation chrome:
# a. Send a message that triggers thinking → Reasoning component shows timer,
#    collapses via Radix Collapsible, expands to show thinking text
# b. Send a message that triggers tool use → Tool shows status Badge,
#    expands to show syntax-highlighted JSON input/output
# c. Trigger a confirmation → Shows pending state with buttons,
#    after accept/reject shows resolution message

# 5. Visual verification — block renderers:
# a. Trigger a reasoning trace → Renders as ChainOfThought with connector lines,
#    all steps show complete checkmarks, conclusion below
# b. Trigger knowledge citation → "Used N sources" collapsible strip,
#    hover on sources with excerpts shows preview card
# c. Trigger code block → Syntax-highlighted code with copy button,
#    filename badge when present, language badge
# d. Trigger checklist with >5 items → Auto-collapsed, expand to see all items
#    with status icons (✓/○/⚠)

# 6. Regression check:
# All other block types (text, review_card, status_card, actions, input_request,
# process_proposal, progress, data, image, suggestion, alert, knowledge_synthesis,
# gathering_indicator, chart, metric, record, interactive_table, artifact) render unchanged.
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for completed items
3. Phase retrospective: what worked, what surprised, what to change
4. Update `docs/landscape.md` AI Elements entry with new adoption count and utilization percentage
