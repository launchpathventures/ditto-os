# Brief: Conversation Core Feel

**Date:** 2026-03-31
**Status:** draft
**Depends on:** Brief 064 (real-time streaming fix — delivers text-delta and thinking-delta events from CLI)
**Unlocks:** Brief 066 (conversation polish layer — animations, actions, empty state)

## Goal

- **Roadmap phase:** Phase 11: Chat UX & Experience
- **Capabilities:** Prompt input quality, streaming feel, thinking visibility, tool call compaction

## Context

User testing reveals that despite Briefs 058-062 shipping the component architecture, the conversation experience is underwhelming. The gap isn't missing components — it's missing **feel**. Text arrives without visual streaming feedback. Thinking shows "Thinking..." but no content. Tool calls appear as disconnected blocks rather than a compact work log. The prompt input is functional but looks basic compared to Claude.ai or ChatGPT.

Brief 064 fixes the streaming infrastructure (CLI `--include-partial-messages`). This brief activates the **experience layer** — making the existing components feel like a premium AI product.

**Design thesis (from Designer spec):** Match Claude.ai's calm confidence, not ChatGPT's feature density. "Silence is a feature."

## Objective

The conversation feels responsive, alive, and professional. Text streams visibly. Thinking shows real reasoning. Tool calls are compact work logs. The prompt input looks like it belongs in a modern AI product.

## Non-Goals

- Message entrance animations (Brief 066)
- Message hover actions — copy, retry (Brief 066)
- Empty state redesign (Brief 066)
- Contextual suggestion chips (Brief 066)
- Paragraph-level fade-in animations (Brief 066)
- Conversation branching / edit-in-place
- @mentions / slash commands in input
- File upload preview rendering (chip only, no preview)
- Voice input
- Model picker in input

## Inputs

1. `docs/research/conversation-polish-ux.md` — Designer's interaction spec (Sections 1-4, 6)
2. `docs/research/ai-chat-ux-patterns-competitive-audit.md` — Competitive UX audit
3. `docs/briefs/064-real-time-streaming-fix.md` — Prerequisite: streaming infrastructure
4. `packages/web/components/ai-elements/prompt-input.tsx` — Current prompt input (319 lines)
5. `packages/web/components/ai-elements/message.tsx` — Current message renderer (219 lines)
6. `packages/web/components/ai-elements/reasoning.tsx` — Current reasoning panel (238 lines)
7. `packages/web/components/ai-elements/tool.tsx` — Current tool display (309 lines)
8. `packages/web/components/self/conversation.tsx` — Conversation orchestrator (378 lines)
9. `.impeccable.md` — Design tokens and principles
10. `docs/insights/110-streaming-text-vs-contentblock-rendering.md` — Rendering path distinction: text-delta (plain voice) vs TextBlock (rich output)

## Constraints

- MUST use existing `.impeccable.md` design tokens — no new tokens
- MUST NOT add Framer Motion or any new animation dependency (Brief 058 constraint: CSS-only animations)
- MUST respect `prefers-reduced-motion` — disable animations, show static states
- MUST maintain the `text-delta` (plain streamed voice) vs `TextBlock` (rich output) distinction (Insight-110)
- MUST NOT change the message data model or useChat hook configuration
- MUST NOT change the streaming infrastructure (Brief 064's domain)
- MUST keep max-width at 720px (conversation width standard)
- MUST preserve existing tool approval (Confirmation) flow — only compact completed/running tools
- MUST NOT break existing ContentBlock rendering via BlockList
- MUST NOT add streaming cursor or streaming-specific styles to ContentBlock/TextBlock rendered content — the streaming cursor is for `text-delta` path only (Insight-110)
- All animations CSS-only, all respect the motion budget (Designer spec: 10 total, this brief uses 6)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Floating prompt input (shadow, no border) | Claude.ai | pattern | Gold standard for calm AI input |
| Send button reveal animation | Claude.ai | pattern | Reduces visual noise when idle |
| Streaming cursor (blinking caret) | Claude.ai, ChatGPT | pattern | Universal streaming indicator |
| Tool step compaction (inline checkmarks) | Cursor, ChatGPT | pattern | Compact work log, not separate blocks |
| Reasoning auto-collapse with summary | Claude.ai Extended Thinking | pattern | Thinking accessible but non-intrusive |
| Collapsible primitives | Radix UI Collapsible | depend | Already in use, stable |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/prompt-input.tsx` | **Modify:** Floating shadow container (remove border, add `shadow-medium` token). Send button opacity-0 when empty → reveal on text. Stop button crossfade replaces send during streaming. Smooth textarea height transition. Contextual placeholder text. |
| `packages/web/components/ai-elements/message.tsx` | **Modify:** Add streaming cursor (vivid 2px blinking caret via CSS pseudo-element when isStreaming). Add dot-breathe animation to vivid dot during streaming. |
| `packages/web/components/ai-elements/reasoning.tsx` | **Modify:** Display real thinking-delta content (not just "Thinking..." label) with `font-mono text-sm text-text-secondary`. Cap at max-h-[200px] with internal scroll. Auto-scroll to bottom during streaming. Extract summary from LAST sentence (~80 chars) for collapsed state. |
| `packages/web/components/ai-elements/tool.tsx` | **Modify:** Compact mode: single-line `✓ Label · summary` for complete tools, `↻ Label...` for running. No collapsible card wrapper in compact mode. Space-y-1 (4px gap). Result summary extraction per tool type. Expandable chevron on right for I/O details. |
| `packages/web/components/self/conversation.tsx` | **Modify:** Pass contextual placeholder to PromptInput based on state (idle/streaming/empty). |

## User Experience

- **Jobs affected:** Capture (prompt input), Orient (streaming cursor, thinking, tool progress), Review (thinking content, tool results)
- **Primitives involved:** ConversationInput (P1), MessageBubble (P3), ReasoningPanel (P5), ToolStep (P6)
- **Process-owner perspective:** The conversation feels alive. Text streams visibly with a blinking cursor. When Self thinks, the user can read the reasoning in real-time. Tool calls are a compact log showing what happened and what was found. The prompt input is clean, floating, professional.
- **Interaction states:** See Designer spec interaction state matrix (conversation-polish-ux.md, Section "Interaction State Summary")
- **Designer input:** `docs/research/conversation-polish-ux.md` — Sections 1-4 and 6 fully addressed. Sections 5 and 7 deferred to Brief 066.

## Acceptance Criteria

### Prompt Input (5)
1. [ ] Prompt input container has no visible border by default — uses `shadow-medium` token (`0 4px 16px rgba(26,26,26,0.07)`) for floating effect
2. [ ] Send button is `opacity-0` when textarea is empty, transitions to `opacity-100 scale-100` (200ms) when text is entered
3. [ ] During streaming, stop button replaces send button position with smooth crossfade (150ms opacity transition)
4. [ ] Textarea has smooth height transition (`transition-[height] duration-150 ease-out`), min 44px, max 200px
5. [ ] Placeholder text changes based on state: "Message Ditto..." (idle), "Add to conversation..." (streaming), "What would you like to work on?" (empty state, no messages)

### Streaming Cursor (2)
6. [ ] During streaming, a vivid-colored 2px blinking caret appears at the end of the assistant's streaming text (CSS `::after` pseudo-element, `animation: cursor-blink 1s step-end infinite`). Cursor applies ONLY to `text-delta` rendered spans — never to ContentBlock/TextBlock output (Insight-110)
7. [ ] Self's vivid dot (message indicator) has subtle breathing animation during streaming (`opacity 0.7→1, scale 1→1.2, 2s cycle`) and is static when not streaming

### Tool Step Compaction (4)
8. [ ] Complete tool calls render as single-line compact steps: `✓ {past-tense label} · {result summary}` with `text-sm text-text-muted`
9. [ ] Running tool calls render as: `↻ {present-tense label}...` with spinner icon (`animate-spin duration-1000`) and shimmer
10. [ ] Error tool calls render as: `✕ {label} · {error message}` with `negative` color token for the icon
11. [ ] Complete/error tool steps have a right-side chevron that expands to show full I/O details (Radix Collapsible, existing pattern)

### Reasoning Content (4)
12. [ ] When `thinking-delta` events arrive, reasoning panel displays the actual thinking text (not just "Thinking..." label) in `font-mono text-sm text-text-secondary` (monospace justified here as internal reasoning/technical detail per .impeccable.md typography spec — not primary user-facing content)
13. [ ] Reasoning panel has `max-h-[200px] overflow-y-auto` with auto-scroll to bottom during streaming
14. [ ] After thinking stops, collapsed summary shows: "Thought for {N}s — {last ~80 chars of reasoning}" (extracted from actual reasoning text, not first sentence)
15. [ ] Streaming cursor (same vivid 2px caret) appears at the end of reasoning text while thinking

### Verification (2)
16. [ ] `pnpm run type-check` passes with 0 errors
17. [ ] Smoke test with real Claude CLI connection confirms: text streams visibly with cursor, thinking shows real content, tools are compact

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - All changes are CSS/JSX only — no data model or streaming infrastructure changes
   - Design tokens match `.impeccable.md` (no raw colors outside token system)
   - Insight-110 rendering distinction preserved (text-delta ≠ TextBlock)
   - Tool compaction doesn't break Confirmation (approval) flow
   - All animations are CSS-only, respect prefers-reduced-motion
   - Existing ContentBlock/BlockList rendering unchanged
3. Present work + review findings to human for approval

## Smoke Test

After implementing, test with a real Claude CLI connection (Insight-120: test against reality):

```bash
# 1. Ensure Brief 064 is complete (streaming fix deployed)
# 2. Start dev server
pnpm dev

# 3. Open browser to http://localhost:3000

# TEST 1: Prompt Input
# - Input has floating shadow, no visible border
# - Type text → send button fades in (vivid arrow-up, 32px)
# - Delete all text → send button fades out
# - While AI is responding: stop button replaces send position

# TEST 2: Streaming Cursor
# - Send a message: "Explain process-as-primitive in 3 sentences"
# - VERIFY: Text streams in progressively with vivid blinking cursor at the end
# - VERIFY: Vivid dot (left of message) gently pulses during streaming
# - VERIFY: When streaming stops, cursor disappears, dot goes static

# TEST 3: Thinking Visibility
# - Send a complex message: "Think about what makes a good onboarding process"
# - VERIFY: Reasoning panel opens with actual thinking text streaming in (monospace, secondary color)
# - VERIFY: Panel max-height 200px, scrolls internally
# - VERIFY: After 3s, collapses to summary: "Thought for Xs — {last sentence snippet}"

# TEST 4: Tool Compaction
# - Send a message that triggers tools: "What do you know about me?"
# - VERIFY: Tool calls appear as compact single-line steps (✓ Searched knowledge · N results)
# - VERIFY: Running tools show spinner, complete tools show checkmark
# - VERIFY: Click chevron on complete tool → expands to show I/O details
```

## After Completion

1. Update `docs/state.md`: Brief 065 complete, conversation core feel shipped
2. Update `docs/roadmap.md`: Phase 11 streaming + conversation feel milestone
3. Retrospective: Compare before/after conversation feel. Does it match Claude.ai's calm confidence?
4. Capture insight if the streaming cursor + tool compaction combination reveals new design principles
