# AI SDK & Elements Adoption Audit

**Date:** 2026-03-30
**Research question:** How thoroughly does Ditto leverage the Vercel AI SDK v6 and AI Elements library? What components and APIs are available but unused? What is the gap between "composition over invention" principle and current implementation?
**Consumed by:** Dev Architect (brief for adoption sprint), Dev Builder (implementation)
**Supersedes:** None (complements `phase-10-dashboard-workspace.md` Section 7)
**Prior art:** `phase-10-dashboard-workspace.md` identified AI Elements at adopt level and defined three-layer rendering architecture. Insight-096 flagged SDK alignment as architecture. This report is the detailed component-by-component and API-by-API audit.

---

## 1. Installed Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `ai` | 6.0.138 | Core AI SDK — streaming, UIMessage protocol, server utilities |
| `@ai-sdk/react` | 3.0.140 | React hooks — `useChat`, `useCompletion`, `useObject` |
| `@ai-sdk/anthropic` | ^3.0.64 | Anthropic provider |
| `@ai-sdk/openai` | ^3.0.48 | OpenAI provider |

All current versions. No upgrade needed.

---

## 2. AI Elements Library

**Source:** github.com/vercel/ai-elements (1,869 stars, 30 contributors, v1.9.0, last commit 2026-03-27)
**Distribution:** shadcn/ui custom registry — `npx ai-elements@latest add <component>`. Components install as owned source files in `@/components/ai-elements/`. Modify freely after install.
**License:** Apache 2.0 (per docs; repo metadata says NOASSERTION)
**Dependencies:** React 19, Tailwind CSS 4, `ai` ^6.0.105, `@ai-sdk/react` ^3.0.41, `streamdown` ^2.4.0 (streaming markdown), `shiki` (syntax highlighting), `motion` (Framer Motion), `use-stick-to-bottom`, `tokenlens` (token counting/cost)

**48 components across 5 categories:**

### Chatbot Components (18) — Primary Relevance

| Component | What It Does | Ditto Equivalent | Gap |
|-----------|-------------|-----------------|-----|
| **Conversation** | Message container, auto-scroll via `use-stick-to-bottom`, empty state, download-as-markdown | Hand-built in `conversation.tsx` (ScrollArea + manual scroll) | Auto-scroll library, download, empty state pattern |
| **Message** | Role-based wrapper, streaming markdown via `streamdown`, branching, action toolbar | Hand-built in `message.tsx` (react-markdown, no branching, no toolbar) | Streaming markdown (streamdown vs react-markdown), message branching, action toolbar |
| **PromptInput** | Auto-resize textarea, file drag-drop/paste/dialog, model selector, screenshot, command palette | Hand-built in `prompt-input.tsx` (textarea only) | File attachments, model selector, command palette, screenshot |
| **Reasoning** | Collapsible reasoning panel, auto-open/close, duration, shimmer | Hand-built in `message.tsx` ReasoningPart | Similar functionality; AI Elements version uses Framer Motion |
| **Confirmation** | Tool approval UI (request/accepted/rejected), wires `addToolApprovalResponse()` | `approval-requested` state rendered but **not wired** | Approval flow not functional |
| **Suggestion** | Horizontal scrollable chip row, `onClick` callback | **Not built** | Entirely missing |
| **Attachments** | File/media display (grid/inline/list), preview, hover card | **Not built** | Entirely missing |
| **Context** | Token usage/cost display with breakdown hover card, uses `tokenlens` | **Not built** | Entirely missing |
| **Checkpoint** | Conversation bookmark + restore via `setMessages()` slice | **Not built** | Entirely missing |
| **Queue** | Collapsible sections of pending/completed items with status | **Not built** | Entirely missing |
| **Task** | Task list with status badges, file refs, streams via `experimental_useObject` | **Not built** | Entirely missing |
| **Tool** | Collapsible tool display with state badge, input JSON, output | Hand-built in `message.tsx` ToolPart | Similar; AI Elements version is more polished |
| **Chain of Thought** | Step-by-step reasoning with search results, images | Hand-built partially in ReasoningPart | Ditto only shows raw reasoning text, not structured steps |
| **Plan** | Collapsible execution plan card, shimmer during streaming | **Not built** | Entirely missing |
| **Sources** | Citation list from `source-url` parts | **Not built** | Entirely missing |
| **Inline Citation** | In-text citation badges with hover card | **Not built** | Entirely missing |
| **Shimmer** | Animated gradient text for streaming states, Framer Motion | Custom typing indicator (pulsing dots) | Different approach; Shimmer is more versatile |
| **Model Selector** | Searchable command palette for model selection | **Not built** | Entirely missing |

### Code Components (15) — Selective Relevance

| Component | Ditto Relevance |
|-----------|----------------|
| **Artifact** | HIGH — container for generated content. Maps to Ditto's ArtifactBlock |
| **Code Block** | MEDIUM — Shiki-based. Ditto has CodeBlock in block registry |
| **File Tree** | MEDIUM — useful for dev pipeline output |
| **Terminal** | MEDIUM — useful for command output display |
| **Test Results** | MEDIUM — maps to ChecklistBlock for test output |
| **Agent** | LOW — agent config display, different from Ditto's agent model |
| Others | LOW — Commit, Sandbox, Schema Display, Snippet, Stack Trace, Web Preview, JSX Preview, Package Info, Environment Variables |

### Voice (6) — Not relevant now. Workflow (7) — React Flow canvas, potentially relevant for process visualization later. Utility (2) — Low relevance.

---

## 3. `useChat` API Audit

### Options Currently Used (3 of 17)

| Option | Current Usage |
|--------|--------------|
| `transport` | `DefaultChatTransport({ api: "/api/chat", body: { userId } })` |
| (implicit `api`) | Via transport |
| (implicit `body`) | Via transport |

### Options NOT Used (14 of 17)

| Option | What It Enables | Ditto Relevance |
|--------|----------------|-----------------|
| `id` | Chat persistence identity | HIGH — needed for session resumption |
| `dataPartSchemas` | Type-safe custom data parts (Zod). Eliminates `as never` casts | HIGH — immediate win, 4 custom data parts need schemas |
| `messageMetadataSchema` | Typed message metadata (token usage, model, timestamps) | HIGH — maps to existing engine metadata |
| `onToolCall` | Client-side tool execution | MEDIUM — some tools could run client-side |
| `onFinish` | Stream completion callback | HIGH — for analytics, state updates |
| `onData` | Transient data part reception | HIGH — status updates should be transient |
| `sendAutomaticallyWhen` | Auto-resubmit after tool calls/approvals | HIGH — maps to trust tier approval flow |
| `experimental_throttle` | UI update throttling (ms) | HIGH — reduces render churn during fast streaming |
| `resume` | Reconnect interrupted streams | MEDIUM — for page refresh resilience |
| `chat` | Shared chat state across components | MEDIUM — workspace + conversation could share |
| `prepareSendMessagesRequest` | Send only latest message | MEDIUM — reduces payload when persistence exists |
| `generateId` | Custom message IDs | LOW |
| `headers` | Custom HTTP headers | LOW |
| `credentials` | Fetch credentials mode | LOW |

### Return Values Currently Used (4 of 11)

| Return | Used |
|--------|------|
| `messages` | YES |
| `status` | YES |
| `error` | YES |
| `sendMessage` | YES |

### Return Values NOT Used (7 of 11)

| Return | What It Enables | Ditto Relevance |
|--------|----------------|-----------------|
| `stop()` | Abort streaming | HIGH — no abort button exists |
| `regenerate()` | Retry response | HIGH — standard chat capability |
| `addToolApprovalResponse()` | Tool approval flow | HIGH — maps to trust tier confirmation |
| `addToolOutput()` | Client-side tool results | MEDIUM |
| `setMessages()` | Local message manipulation | MEDIUM — needed for checkpoints |
| `clearError()` | Error state recovery | MEDIUM |
| `resumeStream()` | Resume interrupted stream | MEDIUM |

---

## 4. Server-Side Streaming Audit

### Currently Used

- `createUIMessageStream({ execute })` — basic stream creation
- `createUIMessageStreamResponse()` — HTTP response wrapper
- Manual chunk emission: `text-start/delta/end`, `reasoning-start/delta/end`, `tool-input-start/available`, `tool-output-available`, `data-*`, `start-step`, `finish`

### NOT Used

| Feature | What It Enables | Ditto Relevance |
|---------|----------------|-----------------|
| `originalMessages` option | Enables persistence callbacks | HIGH — session persistence |
| `onFinish` callback | Server-side persistence after stream completes | HIGH — save chat to DB |
| `consumeStream()` | Ensures completion on client disconnect | HIGH — prevents data loss |
| `transient` flag on data parts | Status updates that don't persist in message history | HIGH — `data-status` should be transient |
| Data part `id` reconciliation | Update in-place instead of append | MEDIUM — loading→success patterns |
| `source-url` / `source-document` chunks | Citation emission | MEDIUM — for knowledge provenance |
| `file` chunks | File attachment emission | MEDIUM — for document outputs |
| `convertToModelMessages()` | UIMessage → model format | LOW — Ditto has own conversion |
| `validateUIMessages()` | Schema validation on load | LOW — until persistence exists |

---

## 5. UIMessage Part Types

| Part Type | Handled? | Notes |
|-----------|----------|-------|
| `text` | YES | Via `isTextUIPart()` |
| `reasoning` | YES | Via `isReasoningUIPart()` |
| `tool-*` | YES | Via `isToolUIPart()`, all 7 states rendered |
| `step-start` | YES | Thin border separator |
| `data-*` | YES | 4 custom types: content-block, status, credential-request, structured |
| `source-url` | NO | Not emitted or rendered |
| `source-document` | NO | Not emitted or rendered |
| `file` | NO | Not emitted or rendered |

---

## 6. Tool Confirmation Flow

### What the SDK Provides

Server-side `needsApproval` on tool definitions (static boolean or dynamic `async ({ args }) => boolean`). Client receives `approval-requested` state on `ToolUIPart`. Client calls `addToolApprovalResponse({ id, approved, reason? })`. SDK auto-continues generation after approval.

### Ditto's Current State

- `approval-requested` state is **rendered** in `message.tsx` ("Approval needed: {toolName}")
- `addToolApprovalResponse()` is **not called** — the button is display-only
- Ditto handles confirmation via a separate mechanism: the Self asks for confirmation in text, and the user responds in text
- Trust tiers modulate which tools need approval — this maps perfectly to `needsApproval: async ({ args }) => checkTrustTier(args)`

### Gap

The SDK's tool confirmation is architecturally aligned with Ditto's trust model but not wired. The Self's text-based confirmation is a workaround for the missing SDK integration.

---

## 7. Transport Layer

### What the SDK Provides

| Transport | Purpose | Ditto Relevance |
|-----------|---------|-----------------|
| `DefaultChatTransport` | HTTP POST | Currently used |
| `DirectChatTransport` | In-process agent invocation, no HTTP | MEDIUM — useful for testing, SSR, single-process deploy |
| `TextStreamChatTransport` | Plain text streaming | LOW |
| Custom transport interface | Implement `sendMessages()` + `reconnectToStream()` | MEDIUM — future AG-UI or WebSocket transport |

### Gap

Only `DefaultChatTransport` used. `DirectChatTransport` could eliminate the HTTP route for testing and potentially simplify the server architecture.

---

## 8. Multi-Step Agent Patterns

### What the SDK Provides

Server-side: `stopWhen` conditions (`stepCountIs(n)`, `hasToolCall(name)`). `prepareStep` callback for dynamic model/tool selection per step. Client-side: `sendAutomaticallyWhen` for auto-resubmit loops.

### Ditto's Current State

Multi-step tool execution runs entirely server-side in `self-stream.ts` (MAX_TOOL_TURNS = 10 loop). No client-side step control. `StepStartUIPart` is emitted and rendered.

### Gap

The server-side loop works but bypasses SDK patterns. If Ditto moves to client-side tool execution for some tools (e.g., UI-only tools), `sendAutomaticallyWhen` becomes essential.

---

## 9. Message Persistence

### What the SDK Provides

`toUIMessageStreamResponse({ originalMessages, onFinish })` pattern. `consumeStream()` for disconnect resilience. `prepareSendMessagesRequest` for send-only-latest. `validateUIMessages` for schema validation on reload.

### Ditto's Current State

Session turns are persisted in SQLite via `sessions` table (engine-level, not SDK-level). The `useChat` hook holds messages in memory only — page refresh loses all messages. No SDK-level persistence.

### Gap

Ditto has persistence at the engine layer but not at the SDK conversation layer. The two are disconnected. When a user refreshes the page, the engine has the history but `useChat` starts empty.

---

## 10. Key Dependencies Introduced by AI Elements

| Dependency | What It Does | Current Ditto Alternative | Assessment |
|-----------|-------------|--------------------------|------------|
| `streamdown` ^2.4.0 | Streaming-aware markdown renderer | `react-markdown` + `remark-gfm` (not streaming-aware) | Upgrade — `streamdown` is purpose-built for AI chat |
| `use-stick-to-bottom` ^1.1.3 | Auto-scroll behaviour | Manual `scrollIntoView` in `useEffect` | Upgrade — handles edge cases (user scroll-up, new content) |
| `tokenlens` ^1.3.1 | Token counting + cost calculation | None | New — enables Context component |
| `motion` (Framer Motion) | Animations | None (CSS transitions only) | New — used by Reasoning, Shimmer, others |
| `shiki` 3.22.0 | Syntax highlighting | None (plain `<pre>` blocks) | Upgrade — better code rendering |
| `@xyflow/react` | Workflow canvas | None | New — for process visualisation (future) |

---

## 11. Composition Level Assessment

Per Insight-068 and CLAUDE.md principle 1, three levels: **depend** (npm install), **adopt** (grab source, own it), **pattern** (study approach, implement your way).

| Component/Feature | Recommended Level | Rationale |
|-------------------|-------------------|-----------|
| AI Elements chatbot components (18) | **Adopt** | Install via CLI, own source, modify for Ditto's block vocabulary and design tokens. shadcn model is designed for this. |
| AI Elements code components (selected) | **Adopt** | Artifact, Code Block, File Tree, Terminal, Test Results |
| `useChat` options (`dataPartSchemas`, `experimental_throttle`, `onFinish`, `onData`) | **Depend** | Already an npm dependency — use the APIs |
| `useChat` returns (`stop`, `regenerate`, `addToolApprovalResponse`) | **Depend** | Already available — wire them up |
| `createUIMessageStream` options (`onFinish`, `transient`, `consumeStream`) | **Depend** | Already an npm dependency — use the APIs |
| `streamdown` | **Depend** | Mature, actively maintained, purpose-built for AI chat streaming markdown |
| `use-stick-to-bottom` | **Depend** | Small, focused, solves a real bug (manual scroll is fragile) |
| `tokenlens` | **Depend** | Small utility for token/cost calculation |
| `motion` (Framer Motion) | **Depend** | Widely used, powers AI Elements animations |

---

## 12. Factual Summary of Gaps

**By category:**

- **Hand-built where SDK provides**: Conversation, Message, PromptInput, Reasoning, Tool — 5 components rebuilt from scratch
- **Not built where SDK provides**: Confirmation (wired), Suggestion, Attachments, Context, Checkpoint, Queue, Task, Plan, Sources, Inline Citation, Chain of Thought, Model Selector — 12 components missing
- **useChat options unused**: 14 of 17 available options
- **useChat returns unused**: 7 of 11 available returns
- **Server streaming features unused**: `onFinish`, `consumeStream`, `transient`, `originalMessages`, source/file emission
- **UIMessage part types unhandled**: 3 of 8 (`source-url`, `source-document`, `file`)
- **Tool confirmation**: Rendered but not functional
- **Message persistence**: Engine-level only, not SDK-level — page refresh loses conversation

**By severity (factual, not evaluative):**

1. No abort button (users cannot stop streaming)
2. No message regeneration (users cannot retry)
3. Tool approval rendered but not functional
4. Custom data parts use `as never` casts (no type safety)
5. Status updates persist in message history (should be transient)
6. Page refresh loses conversation (engine has history, UI doesn't)
7. No file attachments on prompt input
8. No token usage or cost visibility
9. No suggestions for new users
10. Streaming markdown via react-markdown (not streaming-aware — renders complete markdown on each delta)
11. Manual scroll management (fragile, edge cases)
12. 5 hand-built components where tested, owned-source alternatives exist

---

## 13. Provenance

| Source | What Was Extracted | Files/URLs |
|--------|-------------------|------------|
| Vercel AI SDK v6 | Complete `useChat` API, server streaming utilities, transport layer, UIMessage types | sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat, sdk.vercel.ai/docs/ai-sdk-ui/chatbot, sdk.vercel.ai/docs/ai-sdk-ui/transport |
| AI Elements v1.9.0 | 48 component inventory, installation method, dependency list, integration patterns | github.com/vercel/ai-elements, elements.ai-sdk.dev |
| AI SDK stream protocol | UIMessageChunk types, transient flag, data part reconciliation | sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol, sdk.vercel.ai/docs/ai-sdk-ui/streaming-data |
| AI SDK tool confirmation | needsApproval, addToolApprovalResponse, approval lifecycle | sdk.vercel.ai/docs/ai-sdk-ui/chatbot-tool-usage |
| AI SDK message persistence | consumeStream, onFinish, prepareSendMessagesRequest, validateUIMessages | sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence |
| Phase 10 research | Three-layer rendering architecture, AI Elements adopt assessment | docs/research/phase-10-dashboard-workspace.md Section 7 |
| Insight-096 | "SDK alignment is architecture" principle | docs/insights/096-protocol-before-features.md |

---

## Reference Docs Checked

- `docs/landscape.md` — AI SDK and AI Elements entries present and accurate. No drift found.
- `docs/architecture.md` — Layer 6 references AI SDK v6, consistent with findings.
- `docs/adrs/009-runtime-composable-ui.md` — Process output rendering via json-render. Does not cover conversation UI (Principle D: "app's own UI is standard React"). Consistent.
- `docs/research/phase-10-dashboard-workspace.md` — Section 7 covers AI Elements at high level. This report extends with component-by-component detail and full API audit.
- `docs/insights/096-protocol-before-features.md` — Active, directly relevant. Validates this audit.

**Reference docs updated: none needed — no drift found.**
