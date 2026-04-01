# Brief: Real-Time Streaming Fix

**Date:** 2026-03-31
**Status:** ready
**Depends on:** Brief 062 (conversation experience activation — complete)
**Unlocks:** Brief 065 (conversation & prompt polish), Brief 063 (block renderer polish — unblocked but benefits from working streaming)

## Goal

- **Roadmap phase:** Phase 11: Chat UX & Experience
- **Capabilities:** Real-time text streaming, thinking/reasoning visibility, end-to-end streaming pipeline verification

## Context

User testing revealed that despite Briefs 058-062 marking streaming, thinking, and tool visibility as "complete," the actual experience is broken for Claude CLI connection users:

1. **Text arrives all at once** — not streaming character-by-character
2. **Thinking shows "Thinking..." then collapses empty** — no reasoning content displayed
3. **Interim messages look like separate thinking messages** — Self multi-turn tool-use responses appear as disconnected messages

**Root cause:** The Claude CLI streaming path (`streamClaudeCli()` in `llm-stream.ts`) is missing the `--include-partial-messages` flag, so the CLI only emits complete `assistant` messages, never `stream_event` deltas. The `stream_event` parsing was intentionally removed during a prior bug fix (documented in `state.md` as "CLI format change") — but the format didn't change. The `stream_event` events require `--include-partial-messages` to be emitted.

The Anthropic SDK path (`streamAnthropic()`) works correctly — it parses `text_delta` and `thinking_delta`. But anyone using `claude-cli` connection (the subscription path, likely the primary testing path) gets the broken experience.

**Insight-120 captured:** Acceptance criteria verified components in isolation but never tested the end-to-end streaming pipeline with a real CLI connection.

The downstream pipeline is correct: `self-stream.ts` forwards `text-delta` and `thinking-delta` events → `route.ts` maps them to AI SDK v6 `text-delta` and `reasoning-delta` chunks → `useChat` + Streamdown renders them. The only broken link is the CLI parser.

## Objective

Claude CLI connection delivers character-level text streaming and real thinking content to the browser, matching the quality of the Anthropic SDK path.

## Non-Goals

- Tool input streaming (`input_json_delta`) — Self tools execute in `self-stream.ts` layer, not via CLI tool_use
- Codex CLI streaming improvements — separate connection, separate concerns
- Frontend rendering changes — components already work correctly when given proper events
- Anthropic SDK path changes — already working
- Message grouping or conversation layout — deferred to Brief 065

## Inputs

1. `src/engine/llm-stream.ts` — the file to modify (CLI args at line 289, parser at line 422)
2. `src/engine/llm-stream.test.ts` — tests to extend
3. `src/engine/self-stream.ts` — downstream consumer (no changes expected, verify forwarding)
4. `packages/web/app/api/chat/route.ts` — downstream consumer (no changes expected, verify mapping)
5. Claude CLI `--output-format stream-json` docs — event format reference

## Constraints

- MUST NOT change the Anthropic SDK streaming path (`streamAnthropic()`) — it works
- MUST NOT change the Codex CLI streaming path — separate concern
- MUST keep the `assistant` message fallback — needed for complete turn events that arrive after all stream deltas
- MUST NOT change `StreamEvent` type definition — `text-delta` and `thinking-delta` types already exist and are correct
- MUST NOT change `self-stream.ts` or `route.ts` — the pipeline downstream of `llm-stream.ts` is correct
- MUST NOT duplicate text — if `stream_event` deltas are received AND a complete `assistant` message arrives, don't yield the text twice
- MUST be backward-compatible — if `--include-partial-messages` is not available (older CLI version), the complete `assistant` fallback still works

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Claude CLI `stream-json` protocol | Claude Code docs (headless mode) | pattern | Authoritative reference for NDJSON event format |
| `stream_event` wrapper format | Claude Code CLI `cli.js` | pattern | Confirmed: CLI emits `stream_event` wrapping raw API events when `--include-partial-messages` is passed |
| Conductor (conductor.build) | conductor.build | pattern | Proof that Claude CLI streaming + thinking visibility works — they consume the same `stream_event` format |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/llm-stream.ts` | **Modify (lines 289-297):** Add `--include-partial-messages` to Claude CLI args array |
| `src/engine/llm-stream.ts` | **Modify (lines 422-465):** Add `stream_event` parsing before the existing `assistant` fallback. Handle three delta types: `text_delta` → yield `text-delta`, `thinking_delta` → yield `thinking-delta`, ignore `signature_delta`. Track whether streaming deltas were received so `assistant` message doesn't duplicate text. Handle `content_block_start` for thinking/text state tracking. |
| `src/engine/llm-stream.test.ts` | **Modify:** Add 6 new test cases for `stream_event` parsing: text_delta extraction, thinking_delta extraction, content_block_start/stop lifecycle, mixed sequence (thinking → text), deduplication (stream_event deltas + assistant message), and `system` event skip. |

## Detailed Design

### CLI Args Change (line 289-297)

Add `--include-partial-messages` to the args array:

```typescript
const args = [
  "-p",
  "--verbose",
  "--output-format", "stream-json",
  "--include-partial-messages",  // NEW: enables stream_event with text/thinking deltas
  "--model", model,
  "--no-session-persistence",
  "--dangerously-skip-permissions",
  prompt,
];
```

### Parser Change (spawnCliStream, lines 422-465)

Add `stream_event` handling BEFORE the existing `assistant` handler. Track `receivedStreamDeltas` to prevent text duplication:

```
// New state: track whether real streaming deltas were received
let receivedStreamDeltas = false;

// --- NEW: Claude CLI stream_event (partial messages) ---
// Format: { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } } }
if (parsed.type === "stream_event" && parsed.event) {
  const evt = parsed.event;

  if (evt.type === "content_block_delta") {
    if (evt.delta?.type === "text_delta" && evt.delta.text) {
      fullText += evt.delta.text;
      receivedStreamDeltas = true;
      yield { type: "text-delta", text: evt.delta.text };
    } else if (evt.delta?.type === "thinking_delta" && evt.delta.thinking) {
      receivedStreamDeltas = true;
      yield { type: "thinking-delta", text: evt.delta.thinking };
    }
    // signature_delta: ignore (not useful for UI)
  }
  // content_block_start, content_block_stop, message_start, message_delta, message_stop:
  // No action needed — we only need the deltas for streaming
}

// --- EXISTING: Claude CLI complete message (fallback when no partial messages) ---
// Only yield from assistant message if we didn't get streaming deltas
if (parsed.type === "assistant" && parsed.message?.content && !receivedStreamDeltas) {
  // ... existing code unchanged ...
}
```

Key design decisions:
1. **Deduplication via `receivedStreamDeltas` flag** — when `--include-partial-messages` is active, the CLI emits BOTH `stream_event` deltas AND a complete `assistant` message at the end. We must not yield the text twice. If any `stream_event` deltas were received, skip the `assistant` text extraction.
2. **Thinking text not accumulated into `fullText`** — thinking content is yielded for display but NOT included in the final `content-complete` text block. This matches the Anthropic SDK behavior where thinking is separate from response text.
3. **Minimal parsing** — we only care about `content_block_delta` with `text_delta` and `thinking_delta`. We don't need `content_block_start/stop` for state management because the downstream pipeline (`self-stream.ts` → `route.ts`) already handles reasoning/text part lifecycle.

### Event Flow (after fix)

```
Claude CLI (with --include-partial-messages)
  ↓ NDJSON stdout
stream_event { event: { type: "content_block_start", content_block: { type: "thinking" } } }
stream_event { event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "Let me..." } } }
  → yield { type: "thinking-delta", text: "Let me..." }
stream_event { event: { type: "content_block_stop" } }
stream_event { event: { type: "content_block_start", content_block: { type: "text" } } }
stream_event { event: { type: "content_block_delta", delta: { type: "text_delta", text: "Here's" } } }
  → yield { type: "text-delta", text: "Here's" }
stream_event { event: { type: "content_block_delta", delta: { type: "text_delta", text: " what I found" } } }
  → yield { type: "text-delta", text: " what I found" }
stream_event { event: { type: "content_block_stop" } }
assistant { message: { content: [{ type: "text", text: "Here's what I found" }] } }
  → SKIPPED (receivedStreamDeltas = true)
result { result: "Here's what I found", ... }
  → SKIPPED (fullText already populated)
```

## User Experience

- **Jobs affected:** Orient (streaming text helps users orient to AI's response in real-time), Review (thinking visibility lets users review AI reasoning)
- **Primitives involved:** Conversation messages, Reasoning panel
- **Process-owner perspective:** Text appears word-by-word as the AI generates it (like Claude.ai or ChatGPT). Thinking panel shows actual reasoning content streaming in, not just a "Thinking..." label. The experience matches what users expect from a modern AI product.
- **Interaction states:** Streaming (text deltas arriving), Thinking (reasoning deltas arriving), Complete (full response rendered)
- **Designer input:** Not invoked — this is infrastructure. No UI changes, just data flow fix.

## Acceptance Criteria

1. [ ] `streamClaudeCli()` args include `--include-partial-messages` flag
2. [ ] `spawnCliStream()` parses `stream_event` NDJSON lines with `event.type === "content_block_delta"` and `event.delta.type === "text_delta"`, yielding `{ type: "text-delta", text: event.delta.text }`
3. [ ] `spawnCliStream()` parses `thinking_delta` events, yielding `{ type: "thinking-delta", text: event.delta.thinking }`
4. [ ] When `stream_event` deltas are received, the subsequent `assistant` complete message does NOT yield duplicate text
5. [ ] When no `stream_event` deltas are received (older CLI, flag not supported), the `assistant` fallback path still works unchanged
6. [ ] Thinking text is NOT accumulated into `fullText` (not included in `content-complete` event's text block)
7. [ ] `llm-stream.test.ts` has test for `stream_event` → `text_delta` extraction
8. [ ] `llm-stream.test.ts` has test for `stream_event` → `thinking_delta` extraction
9. [ ] `llm-stream.test.ts` has test for deduplication: stream deltas received → `assistant` message skipped
10. [ ] `llm-stream.test.ts` has test for backward compatibility: no stream deltas → `assistant` fallback works
11. [ ] `pnpm run type-check` passes with 0 errors
12. [ ] `pnpm test` passes (all existing + new tests)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - CLI event format matches documented Claude CLI `stream-json` protocol
   - No changes to Anthropic SDK path or downstream pipeline
   - Deduplication logic is sound
   - Backward compatibility preserved
   - Test coverage for the new parsing paths

## Smoke Test

After implementing, test with a real Claude CLI connection:

```bash
# 1. Ensure config uses claude-cli connection
cat data/config.json
# Should show: { "connection": "claude-cli", ... }

# 2. Start the dev server
pnpm dev

# 3. Open browser to http://localhost:3000
# 4. Send a message: "Explain what makes a good process definition in 3 sentences"

# VERIFY:
# - Text appears incrementally (word by word or small chunks), NOT all at once
# - Reasoning panel shows "Thinking..." THEN actual reasoning text streams in
# - After reasoning completes, it auto-collapses after 3s with summary snippet
# - The final text is complete and coherent (no truncation, no duplication)

# 5. Check server console for any errors:
# - No "[claude] ..." stderr errors related to --include-partial-messages
# - No JSON parse errors on stream_event lines
```

## After Completion

1. Update `docs/state.md`:
   - Fix line 99: correct "CLI format change" to note that `stream_event` events require `--include-partial-messages`
   - Update Brief 064 status to complete
   - Note that Claude CLI now delivers real-time streaming + thinking
2. Update `docs/architecture.md` Layer 2 CLI adapter description: note that `--include-partial-messages` enables streaming deltas (text + thinking), not just complete messages
3. Update `docs/roadmap.md` if Phase 11 streaming milestone is affected
4. Retrospective: Why did the testing gap happen? How to prevent it? (Insight-120 already captured the pattern)
