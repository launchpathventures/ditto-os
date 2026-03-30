# Brief 058: AI SDK & Elements Adoption

**Date:** 2026-03-30
**Status:** draft
**Depends on:** Brief 057 (First-Run Experience — establishes design tokens and layout)
**Unlocks:** All future conversation UI work builds on proper SDK foundation

## Goal

- **Roadmap phase:** Phase 10 (gap closure — composition principle alignment)
- **Capabilities:** Full AI SDK v6 surface utilisation, AI Elements chatbot component adoption, tool confirmation wired to trust tiers, streaming infrastructure hardened

## Context

The AI SDK & Elements Adoption Audit (`docs/research/ai-sdk-elements-adoption-audit.md`) found that Ditto uses ~18% of `useChat` options and ~36% of return values, despite the SDK being a declared dependency. Five conversation components are hand-built where AI Elements provides owned-source alternatives. Twelve AI Elements components are relevant but entirely missing. Tool confirmation is rendered but not functional. Status updates persist in message history. Page refresh loses conversation. No abort, no retry, no file attachments, no suggestions, no streaming markdown.

This violates Principle 1 (Composition over Invention) and Insight-096 ("SDK alignment is architecture"). The AI Elements library uses the shadcn model — install source, own it, modify it — which is zero-risk adoption. Ditto already has React 19 and Tailwind 4, matching AI Elements' requirements.

## Objective

Replace hand-built conversation components with adopted AI Elements equivalents. Wire all HIGH-relevance `useChat` options and return values. Harden the streaming infrastructure with `consumeStream`, `transient`, `onFinish`, and `dataPartSchemas`. Result: a conversation surface that uses the SDK as its architecture, not as a thin streaming pipe.

## Non-Goals

- Voice components (AI Elements voice category) — not relevant now
- Workflow canvas components (AI Elements workflow category) — deferred to process visualisation brief
- Code components beyond CodeBlock — current block registry is adequate
- AG-UI or WebSocket transport — current HTTP transport is sufficient
- Client-side tool execution via `onToolCall` — server-side execution is correct for Ditto's trust model
- `DirectChatTransport` for testing — current mock LLM approach works
- Full message persistence with page-refresh recovery — requires engine-level session-to-UIMessage bridge (separate brief). This brief adds `onFinish` server-side and `id` client-side as the foundation
- Redesigning the conversation layout or visual identity — preserve existing design tokens

## Inputs

1. `docs/research/ai-sdk-elements-adoption-audit.md` — the complete gap analysis
2. `docs/insights/096-protocol-before-features.md` — SDK alignment is architecture
3. `docs/insights/110-streaming-text-vs-contentblock-rendering.md` — two rendering paths are intentional
4. `docs/insights/114-sdk-surface-utilisation-as-composition-metric.md` — composition metric
5. `docs/adrs/009-runtime-composable-ui.md` — Principle D: app's own UI is standard React. AI Elements are app UI, not process outputs
6. `packages/web/components/self/conversation.tsx` — current hand-built conversation
7. `packages/web/components/self/message.tsx` — current hand-built message + reasoning + tool renderers
8. `packages/web/components/self/prompt-input.tsx` — current hand-built input
9. `packages/web/app/api/chat/route.ts` — current streaming route handler
10. AI Elements docs at elements.ai-sdk.dev — component APIs and installation

## Constraints

- Ditto's visual identity (`.impeccable.md` design tokens) takes precedence over AI Elements defaults. Adopt the structure, adapt the styling.
- The vivid dot (Self indicator) must be preserved — it's Ditto's identity. AI Elements Message doesn't have this; the adopted component must be extended with it.
- The DotParticles prompt input visual (Self's presence) must be preserved.
- ContentBlock rendering via the block registry (`BlockList`) must continue working — AI Elements components handle SDK-native parts, ContentBlocks dispatch to Ditto's block registry. The two systems coexist.
- Insight-110 boundary: streamed text is the Self's voice (conversational), ContentBlocks are structured output. This architectural distinction is preserved even after adopting AI Elements Message — `streamdown` renders streamed text, `BlockList` renders data-content-block parts.
- `as never` type casts for custom data parts must be eliminated by adopting `dataPartSchemas`.
- Do not add `motion` (Framer Motion) as a full dependency if only needed for shimmer/reasoning. Use CSS animations where possible. Only add `motion` if 3+ components genuinely benefit.
- All existing e2e tests must continue passing. The visual output may change (streamdown vs react-markdown) but the interaction contracts (send message → get response → tool calls shown) must hold.
- Transient data parts (`data-status`) require `onData` callback wiring in `useChat` — they do NOT appear in `message.parts`, only in the callback. The builder must implement a UI mechanism for showing transient status (e.g., a status line below the conversation, or a toast) since they can no longer be rendered inline as message parts.
- Tool confirmation (AC5) has an explicit fallback path: if wiring `addToolApprovalResponse()` through the server proves too complex for this brief, clicking approve/reject can send a user message instead. The visual component is adopted either way; the plumbing can be upgraded in a follow-up.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Conversation component | AI Elements `conversation.tsx` | adopt | Auto-scroll via `use-stick-to-bottom`, empty state, download — covers 3 gaps in hand-built version |
| Message component | AI Elements `message.tsx` | adopt | Role-based wrapper, streaming markdown via `streamdown`, action toolbar — covers 3 gaps |
| PromptInput component | AI Elements `prompt-input.tsx` | adopt | File attachments, auto-resize, extensible — covers 2 gaps. Ditto extends with DotParticles and design tokens |
| Reasoning component | AI Elements `reasoning.tsx` | adopt | Collapsible panel, shimmer, duration — already reimplemented manually, adopting avoids drift |
| Confirmation component | AI Elements `confirmation.tsx` | adopt | Wires `addToolApprovalResponse()` — the critical missing piece for trust-tier tool approval |
| Tool component | AI Elements `tool.tsx` | adopt | Collapsible tool display — more polished than hand-built version |
| Suggestion component | AI Elements `suggestion.tsx` | adopt | Chip row for new-user suggestions — entirely missing |
| Shimmer component | AI Elements `shimmer.tsx` | adopt | Animated loading text — used by Reasoning and Plan |
| `streamdown` markdown renderer | streamdown npm | depend | Streaming-aware markdown, purpose-built for AI chat. Replaces `react-markdown` in conversation context |
| `use-stick-to-bottom` scroll | use-stick-to-bottom npm | depend | Robust auto-scroll with user-scroll-up detection. Replaces manual `scrollIntoView` |
| `useChat` options/returns | AI SDK v6 | depend | Already installed — wire `dataPartSchemas`, `experimental_throttle`, `onFinish`, `stop`, `regenerate`, `addToolApprovalResponse` |
| `createUIMessageStream` hardening | AI SDK v6 | depend | Already installed — add `consumeStream`, `transient` flag, `onFinish` callback |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/conversation.tsx` | Create: Adopted from AI Elements, adapted for Ditto design tokens and layout |
| `packages/web/components/ai-elements/message.tsx` | Create: Adopted, extended with vivid dot indicator and ContentBlock dispatch |
| `packages/web/components/ai-elements/prompt-input.tsx` | Create: Adopted, extended with DotParticles visual and Ditto styling |
| `packages/web/components/ai-elements/reasoning.tsx` | Create: Adopted, replaces hand-built ReasoningPart |
| `packages/web/components/ai-elements/confirmation.tsx` | Create: Adopted, wired to `addToolApprovalResponse()` |
| `packages/web/components/ai-elements/tool.tsx` | Create: Adopted, styled to Ditto tokens |
| `packages/web/components/ai-elements/suggestion.tsx` | Create: Adopted for new-user suggestion chips |
| `packages/web/components/ai-elements/shimmer.tsx` | Create: Adopted for streaming loading states |
| `packages/web/components/self/conversation.tsx` | Rewrite: Compose from adopted AI Elements components. Wire `useChat` options: `id`, `dataPartSchemas`, `experimental_throttle`, `onFinish`. Wire returns: `stop`, `regenerate`, `addToolApprovalResponse` |
| `packages/web/components/self/message.tsx` | Rewrite: Delegate to AI Elements Message + Reasoning + Tool + Confirmation. Preserve ContentBlock dispatch via BlockList |
| `packages/web/components/self/prompt-input.tsx` | Delete: Replaced by adopted AI Elements PromptInput (extended) |
| `packages/web/components/self/typing-indicator.tsx` | Modify: Simplify — AI Elements Shimmer handles the streaming state. Typing indicator becomes a thin wrapper |
| `packages/web/app/api/chat/route.ts` | Modify: Add `consumeStream()` call. Mark `data-status` writes with `transient: true`. Add `onFinish` callback for future persistence. Eliminate `as never` casts (schemas handle typing). If tool approval wiring is feasible: add handler for approval response requests alongside regular message POST |
| `packages/web/lib/data-part-schemas.ts` | Create: Zod schemas for 4 custom data part types. Shared between route handler and useChat |
| `package.json` (web) | Modify: Add `streamdown`, `@streamdown/code`, `@streamdown/math`, `use-stick-to-bottom`. Keep `react-markdown` + `remark-gfm` (still used by `TextBlockComponent` per Insight-110) |

## User Experience

- **Jobs affected:** Orient (streaming quality, abort, retry), Review (tool confirmation), Capture (file attachments on prompt), Decide (approval flow)
- **Primitives involved:** P1 (Conversation Thread — enhanced), P3 (Prompt Input — file attachments), P5 (Review Queue — tool confirmation becomes functional)
- **Process-owner perspective:** Conversation feels responsive (streaming markdown renders progressively, not re-rendering entire blocks). Can abort a long response. Can retry a bad response. Can approve/reject tool actions inline rather than typing "yes/no". Suggestions appear for empty conversations. Status updates don't pollute scroll history.
- **Interaction states:**
  - Empty: Conversation shows welcome state (preserved from current) + suggestion chips (new)
  - Streaming: Shimmer on reasoning, progressive markdown, abort button visible
  - Tool pending: Confirmation component shows approve/reject buttons (functional, not cosmetic)
  - Error: Error state with retry option (new — via `regenerate()`)
  - Loading: Shimmer replaces pulsing dots for inline loading states
- **Designer input:** Not invoked — lightweight UX section only. AI Elements provide the interaction design; Ditto adapts the visual design.

## Acceptance Criteria

1. [ ] AI Elements Conversation component adopted at `packages/web/components/ai-elements/conversation.tsx`, renders message list with `use-stick-to-bottom` auto-scroll
2. [ ] AI Elements Message component adopted, extended with vivid dot indicator for Self messages, delegates to `streamdown` for text parts and `BlockList` for `data-content-block` parts
3. [ ] AI Elements PromptInput adopted, extended with DotParticles visual, supports file attachment drag-drop (files emitted as parts, even if server ignores them initially)
4. [ ] AI Elements Reasoning adopted, replaces hand-built ReasoningPart — collapsible, duration display, shimmer during streaming
5. [ ] AI Elements Confirmation adopted and **functional**: renders approve/reject UI for tool parts in `approval-requested` state (the engine decides which tools need approval based on trust tier — L3 owns this decision, UI renders it). When user clicks approve/reject, `addToolApprovalResponse()` is called, which sends the approval back to the server. **Server-side integration:** the route handler must support the AI SDK's tool approval request shape — when `useChat` sends an approval response, the route extracts it and feeds it back into the Self's conversation loop to continue generation. If this server-side wiring proves too complex for this brief, the fallback is: clicking approve/reject sends a user message ("Approved: {toolName}" / "Rejected: {toolName}") that the Self interprets — functionally identical but uses the existing message path. The builder decides which path based on implementation complexity.
6. [ ] AI Elements Tool component adopted, shows collapsible tool invocation with state badge and input/output display
7. [ ] AI Elements Suggestion component renders 2-3 starter suggestions when conversation is empty, clicking sends the suggestion as a user message
8. [ ] `useChat` configured with `dataPartSchemas` — all 4 custom data parts (content-block, status, credential-request, structured) have Zod schemas. Zero `as never` casts remain in route handler
9. [ ] `useChat` configured with `experimental_throttle` (recommended: 50-100ms)
10. [ ] `stop()` wired to an abort button visible during streaming
11. [ ] `regenerate()` wired to a retry action on the last assistant message (visible on hover or error)
12. [ ] `data-status` parts emitted with `transient: true` flag — confirmed supported in AI SDK v6.0.138 (`ui-message-chunks.ts`: `transient?: boolean` on `DataUIMessageChunk`; `process-ui-message-stream.ts`: transient parts skip `message.parts`, only flow through `onData` callback). `useChat` must configure `onData` to handle transient status parts (e.g., show a toast or update a status indicator outside the message list). Status messages no longer pollute the persistent message history.
13. [ ] `consumeStream()` called in route handler — stream completes even if client disconnects
14. [ ] `onFinish` callback on `createUIMessageStream` — logs session metadata (placeholder for future persistence)
15. [ ] `streamdown` replaces `react-markdown` for rendering streamed text in conversation messages. Verified: streamdown uses the same remark/rehype pipeline as react-markdown, has GFM enabled by default (no manual `remarkPlugins` needed), produces semantically equivalent HTML (h1, table, pre, code, etc.). Requires Tailwind CSS (already present) and animation style import. `@streamdown/code` plugin provides Shiki-powered syntax highlighting. ContentBlock `TextBlockComponent` continues using `react-markdown` for block-level rendering (Insight-110 boundary preserved). `react-markdown` and `remark-gfm` remain in `package.json` as long as `TextBlockComponent` uses them.
16. [ ] All existing e2e tests pass (`pnpm --filter web test:e2e`)
17. [ ] `pnpm run type-check` passes with zero errors

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Composition: are AI Elements adopted (owned source), not just referenced as npm dependency?
   - SDK alignment: are `useChat` options/returns correctly wired?
   - Trust model: does Confirmation component respect trust tiers via `needsApproval`?
   - Insight-110: are the two rendering paths (streamed text vs ContentBlock) preserved?
   - Design tokens: does adopted code use Ditto's `.impeccable.md` tokens, not AI Elements defaults?
   - ContentBlock coexistence: does `BlockList` still render `data-content-block` parts correctly?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Install new dependencies
cd packages/web && pnpm install

# 2. Type-check
pnpm run type-check

# 3. Start dev server
pnpm dev

# 4. Manual verification:
# - Open http://localhost:3000
# - Empty conversation shows welcome + suggestion chips
# - Type a message → streaming markdown renders progressively (not flash-rerender)
# - During streaming, abort button is visible and functional
# - After response, hover last message → retry action visible
# - Trigger a tool call (e.g., "What processes do I have?")
#   → Tool shows collapsible display with state progression
# - If a tool requires approval → Confirmation shows Approve/Reject buttons
#   → Clicking Approve continues generation
# - Status messages (e.g., "Delegating to researcher...") appear during streaming
#   but disappear from message history after completion (transient)
# - Scroll behaviour: scroll up during streaming → stays at current position
#   → New content doesn't force scroll-to-bottom

# 5. E2E tests
pnpm --filter web test:e2e

# 6. Unit tests
pnpm test
```

## After Completion

1. Update `docs/state.md` — conversation UI rebuilt on AI Elements foundation
2. Update `docs/landscape.md` — AI Elements entry: update from "47+" to "48 components" and note "chatbot components adopted in Ditto"
3. Update `docs/research/README.md` — mark adoption audit as "Consumed"
4. Retrospective: what worked, what surprised, what to change
