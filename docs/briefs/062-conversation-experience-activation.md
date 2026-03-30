# Brief: Conversation Experience Activation

**Date:** 2026-03-31
**Status:** approved
**Depends on:** Brief 061 (AI Elements Deep Adoption) — composable subcomponents installed
**Unlocks:** Dogfood-ready conversation UX; enables meaningful user testing of conversation chrome

## Goal

- **Roadmap phase:** Phase 11 — Chat UX & Experience
- **Capabilities:** Conversation chrome activation (reasoning, tools, confirmations, citations, typing indicator), message queueing during streaming

## Context

Brief 061 shipped composable subcomponents (Reasoning, Tool, Confirmation, CodeBlock, Sources, Task) with Radix primitives, Shiki highlighting, status badges, and state-aware rendering. All 30 acceptance criteria pass, type-check clean, 440 tests pass. But the **backward-compatible default exports** preserve the pre-061 look.

Insight-119 diagnosed this precisely: architecture briefs and UX briefs must be paired. Brief 061 was the architecture (the CAN). This brief is the UX pair (the DO).

The updated `human-layer.md` v0.2.0 (2026-03-31) lists 5 of the 7 changes in this brief as explicit gaps in §What's Next: Gaps Between Architecture and Experience.

Additionally, the prompt input disables during streaming, blocking the user's flow. Users should be able to queue messages while Self is responding.

## Objective

Replace the backward-compatible default compositions in 6 AI Elements components with activated compositions that surface Brief 061's visual capabilities, and enable message queueing during streaming. After this brief, the conversation experience is visually distinct from pre-061 and the input is never disabled.

## Non-Goals

- **Right panel / artifact mode changes** — workspace-level, not conversation chrome
- **New ContentBlock types** — no new block types, just better default compositions
- **Engine-side tool descriptions** — contextual labels like "Ready to save *your quoting process*" require engine context; deferred to a future brief. This brief uses a UI-side static map.
- **Mobile-specific adaptations** — these changes are responsive-friendly but mobile briefs come later
- **Composition engine queries** — Today/Inbox/Work intent compositions are separate work
- **Process graph or agent management views** — listed in human-layer.md gaps but out of scope here

## Inputs

1. `docs/research/conversation-experience-activation-ux.md` — Designer's interaction spec (7 changes, reviewed, all flags addressed)
2. `docs/briefs/complete/061-ai-elements-deep-adoption.md` — what was installed and how
3. `.impeccable.md` — design tokens and visual identity
4. `docs/human-layer.md` v0.2.0 — workspace architecture, rendering pipeline, AI Elements table, §What's Next gaps
5. `docs/architecture.md` — conversation-first model, ContentBlock pipeline
6. `docs/insights/119-architecture-without-ux-brief-is-invisible.md` — the insight that prompted this brief
7. `docs/insights/110-streaming-text-vs-contentblock-rendering.md` — streaming text vs block rendering boundary
8. Prototypes P01, P09, P10, P22, P30 — visual reference for interaction patterns

## Constraints

- **No new dependencies.** All Radix primitives and libraries needed are already installed from Brief 061.
- **Composable subcomponents remain exported.** The named exports (ReasoningRoot, ToolRoot, etc.) must not break — they enable future custom compositions. Changes are to the default export only.
- **ContentBlock pipeline preserved.** Tool outputs with ContentBlocks must continue rendering via BlockList directly (current behavior).
- **Type-check clean.** `pnpm run type-check` must pass with zero errors.
- **440+ tests pass.** All existing tests continue to pass.
- **Vivid dot preserved.** Self's identity dot (2×2px vivid circle) is a brand element; it must remain on all assistant messages.
- **Streamdown for text.** Streaming markdown renders through streamdown (Insight-110 boundary). No change to text rendering.
- **Semantic colors.** Confirmation uses caution border (semantic: needs attention), not vivid (brand energy). Vivid reserved for CTA buttons.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Reasoning auto-close + summary | P30 prototype `reasoning_trace` block | pattern | Shows title + conclusion at glance level |
| Tool human-readable labels | P30 prototype `gathering_indicator` + `status_card` | pattern | Action description + status, not system identifiers |
| Confirmation human language | P01 prototype conversation | pattern | "Approve & send", "Bump to 22 hrs" — contextual action labels |
| Citation inline display | P10 prototype `based-on` strip, P22 knowledge-in-output | pattern | Inline provenance as first-class visual element |
| Message queueing | Claude.ai mid-stream input | pattern | Users can type during streaming; industry standard |
| Typing indicator structure | P30 prototype `gathering_indicator` | pattern | Dots + action text integrated in message flow |
| Queue cancel affordance | Original to Ditto | original | Pending message retraction before send |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/reasoning.tsx` | Modify: Update default `Reasoning` export — auto-close delay 1s→3s, add summary snippet to collapsed trigger |
| `packages/web/components/ai-elements/tool.tsx` | Modify: Update default `Tool` export — human-readable labels from static map, status-forward rendering, muted completed state |
| `packages/web/components/ai-elements/tool-display-names.ts` | Create: Static map of toolName → { running: string, complete: string } for ~15 Self tools |
| `packages/web/components/ai-elements/confirmation.tsx` | Modify: Update default `Confirmation` export — caution border, human language title/description/buttons |
| `packages/web/components/ai-elements/sources.tsx` | Modify: **Create** a new default export `Sources` (Brief 061 only shipped composable subcomponents without a default composition — follow the Reasoning/Tool/Confirmation pattern). Default renders inline for 1–3 sources, collapsed "Based on N sources" for 4+. |
| `packages/web/components/self/typing-indicator.tsx` | Modify: Replace three-dot animation with vivid dot + status text structure matching Self messages |
| `packages/web/components/ai-elements/prompt-input.tsx` | Modify: Remove `disabled={isLoading}` from textarea **and** update the `!isLoading` guard in `handleKeyDown` so Enter queues during streaming instead of being blocked. Change placeholder during streaming, add queue count display, show stop+send side by side during streaming. |
| `packages/web/components/self/conversation.tsx` | Modify: Add message queue state, dispatch queued messages in `onFinish`, render queued messages with pending treatment, cancel affordance |

## User Experience

- **Jobs affected:** Orient (reasoning shows thinking), Review (tool status makes work trail auditable), Capture (always-enabled input captures thoughts), Define (queued messages add context during streaming)
- **Primitives involved:** Conversation Thread (center column), Prompt Input (capture surface) — both as defined in human-layer.md v0.2.0
- **Process-owner perspective:** The conversation now visibly shows what Ditto is doing (reasoning, tool use, provenance) instead of being a flat text stream. The user can always type, even while Ditto is responding. Confirmations feel like a conversation ("Go ahead" / "Hold on"), not a system prompt ("Accept" / "Reject").
- **Interaction states:** Full matrix in Designer spec (§Interaction States Summary) — all 7 components across Empty/Loading/Streaming/Complete/Error states specified.
- **Designer input:** `docs/research/conversation-experience-activation-ux.md` — reviewed, 6 flags addressed (queue cancel, confirmation color, reasoning persistence, toolDisplayName, persona coverage, AC count)

### Per-Component Interaction Design

**1. Reasoning — Visible Thinking, Quiet After**

| State | Behavior |
|-------|----------|
| Streaming | Open. Shimmer on "Thinking..." label. Timer ticking. Vivid-deep left border. Auto-scroll content. |
| Just finished (0–3s) | Stays open. Timer freezes. Shimmer stops. |
| Settled (3s+) | Auto-collapses. Trigger: chevron + "Thought for Ns" + summary snippet (first ~60 chars of last sentence, ellipsis). Summary persists in conversation history. |
| Reopened | Full text, scrollable (max-height 300px). Vivid-deep left border. |

**2. Tool Invocations — Status-Forward**

| State | Behavior |
|-------|----------|
| Running | Pulse dots + human-readable label ("Searching knowledge..."). No chevron. Compact line. |
| Complete | Muted: checkmark (positive) + past-tense label ("Searched knowledge — 3 results"). Chevron to expand I/O. `text-text-muted`. |
| Complete with blocks | Blocks render directly via BlockList (unchanged). |
| Error | Negative border-left. Error text visible. Action label + "Failed" badge. |

Tool display name map (static, UI-side):

```typescript
// Example entries — full map covers ~15 Self tools
const toolDisplayNames: Record<string, { running: string; complete: string }> = {
  search_knowledge: { running: "Searching knowledge...", complete: "Searched knowledge" },
  save_process: { running: "Saving process...", complete: "Saved process" },
  start_pipeline: { running: "Running pipeline...", complete: "Pipeline complete" },
  generate_process: { running: "Drafting process...", complete: "Process drafted" },
  get_briefing: { running: "Preparing briefing...", complete: "Briefing ready" },
  quick_capture: { running: "Capturing...", complete: "Captured" },
  create_work_item: { running: "Creating work item...", complete: "Work item created" },
  approve_review: { running: "Recording approval...", complete: "Approved" },
  suggest_next: { running: "Finding suggestions...", complete: "Suggestions ready" },
  // Fallback for unmapped tools: capitalize and humanize the snake_case name
};
```

**3. Confirmation — Human Language**

| State | Behavior |
|-------|----------|
| Pending | Caution border-left. Title: human-readable from tool context (fallback: "Ditto needs your go-ahead"). Description: what will happen. Buttons: "Go ahead" (vivid bg) + "Hold on" (ghost). |
| Accepted | Positive border. Checkmark + "Done" in positive color. Buttons removed. |
| Rejected | Muted border. "Cancelled" in muted. |

**4. Code Blocks** — No changes needed. Brief 061 implementation is solid. Shiki highlighting already active.

**5. Citations — Inline for Few Sources**

| Source count | Behavior |
|-------------|----------|
| 1–3 | Inline: icon + source name (vivid-deep) per source. Hover for excerpt (HoverCard already built). |
| 4+ | Collapsed trigger: "Based on N sources". Expand to full list. |

**6. Message Queueing**

| State | Textarea | Submit | Behavior |
|-------|----------|--------|----------|
| Idle | Enabled, "Message Ditto..." | Send (vivid when has text) | Sends immediately |
| Submitted | Enabled, "Add to conversation..." | Send (vivid when has text) | Queues message |
| Streaming | Enabled, "Add to conversation..." | Stop (left) + Send (right) | Queues message |

Queue mechanics:
- Queued messages render immediately as user bubbles with pending treatment (reduced opacity + small clock icon)
- Each pending message shows "×" on hover to cancel before send
- `onFinish` dispatches first queued message via `sendMessage`
- Stop then send: queued messages dispatch after interrupted response
- Queue state: `useState<string[]>([])` in conversation.tsx

**7. Typing Indicator — Self-Aligned**

| State | Behavior |
|-------|----------|
| Submitted, no status | Vivid dot + shimmer "Thinking..." — same indent as Self messages |
| Streaming with status | Vivid dot + status text (e.g., "Checking your quoting process...") in text-secondary with shimmer |
| Streaming, no status | No separate indicator — streaming text IS the indicator |

## Acceptance Criteria

### Conversation Chrome (7 AC)

1. [ ] **AC1: Reasoning auto-close delay.** Reasoning block stays open for 3s after streaming ends (was 1s), then auto-collapses.
2. [ ] **AC2: Reasoning summary snippet.** Collapsed reasoning trigger shows "Thought for Ns" + first ~60 chars of the last sentence as a summary.
3. [ ] **AC3: Tool human labels.** Tool invocations display human-readable action labels from the static map instead of raw tool names. Unmapped tools fall back to humanized snake_case.
4. [ ] **AC4: Tool visual hierarchy.** Running tools show pulse dots + label. Completed tools render in `text-text-muted` with positive checkmark. Completed tools with ContentBlocks render blocks directly (unchanged).
5. [ ] **AC5: Confirmation language.** Pending confirmation shows caution border, human-language title, descriptive text, "Go ahead" / "Hold on" buttons. Accepted state shows positive border + compact "Done" message. Rejected state shows **muted** border (changed from negative) + "Cancelled" text.
6. [ ] **AC6: Citation inline display.** 1–3 sources render inline (icon + name, hover for excerpt). 4+ sources use collapsed "Based on N sources" trigger.
7. [ ] **AC7: Typing indicator.** Submitted state shows vivid dot + shimmer "Thinking..." aligned with Self messages. Status text replaces generic dots when available.

### Message Queueing (5 AC)

8. [ ] **AC8: Input always enabled.** Textarea is never disabled during loading or streaming. Placeholder changes to "Add to conversation..." during active response.
9. [ ] **AC9: Queue and send.** Messages submitted during streaming are queued and dispatched via `sendMessage` after the current stream completes (`onFinish`).
10. [ ] **AC10: Pending visual treatment.** Queued messages appear immediately as user bubbles with reduced opacity and a small clock icon.
11. [ ] **AC11: Queue cancel.** Each pending message shows "×" on hover. Clicking removes it from queue and conversation.
12. [ ] **AC12: Stop then send.** When user stops a stream, queued messages dispatch after the interrupted response completes.
13. [ ] **AC13: Error-path queue.** When a stream errors (not just completes), queued messages are preserved in the queue and dispatch is retried when the user sends a new message or retries. Queued messages are never silently dropped.

### Integration (2 AC)

14. [ ] **AC14: Type-check clean.** `pnpm run type-check` passes with zero errors.
15. [ ] **AC15: Tests pass.** All existing tests pass (440+). New tests for queue mechanics (queue, cancel, dispatch on finish, dispatch after stop, dispatch after error).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - All 7 components render correctly across their state matrix
   - ContentBlock pipeline is preserved (tool outputs with blocks render via BlockList)
   - Composable subcomponent exports still work (named exports unchanged)
   - Queue mechanics handle edge cases (empty queue, rapid submit, stop-then-send)
   - No regressions in existing conversation flow (onboarding, credential input, process creation)
   - Semantic color usage is correct (caution for confirmation border, vivid for CTA)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Type-check
pnpm run type-check

# 2. Run tests
pnpm test

# 3. Start dev server and verify in browser
pnpm --filter web dev

# Manual verification:
# a. Send a message — reasoning block opens during thinking, shows timer,
#    auto-collapses after 3s with summary snippet
# b. Watch tool invocations — human-readable labels, status badges,
#    completed tools are muted
# c. Type during streaming — textarea stays enabled, message queues,
#    pending bubble appears with clock icon, dispatches after stream ends
# d. Cancel a queued message — hover shows ×, click removes from queue
# e. Stop stream then check — queued message sends after stop
# f. Trigger a confirmation — caution border, "Go ahead"/"Hold on" buttons
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — Phase 11 Chat UX milestone reached
3. Update `docs/human-layer.md` §What's Next — mark resolved gaps (reasoning, tools, citations, code, chain of thought)
4. Phase retrospective: what worked, what surprised, what to change
5. Consider Insight-119 resolved — architecture+UX pair delivered
