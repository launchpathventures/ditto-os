# Insight-041: Users Bring Their Own AI — The Adapter Abstraction

**Date:** 2026-03-20
**Trigger:** User asked whether end users would use their Claude CLI or OpenAI Codex CLI for driving Agent OS locally, or whether we'd insist on API usage.
**Layers affected:** L2 Agent, L3 Harness
**Status:** absorbed — CLI adapter delivered in Brief 016a, adapter abstraction documented in architecture.md L2

## The Insight

Agent OS's value is the harness — trust, routing, memory, feedback, review patterns. Not the execution substrate. The adapter layer should abstract over how agents actually run. Users choose their preferred AI execution method:

- `claude` CLI (subscription, flat cost, full tool suite)
- `codex` CLI (subscription, flat cost, different model)
- Anthropic API (per-token, scalable, full control)
- OpenAI API (per-token, different provider)
- Local models via ollama (free, offline, privacy)

The harness wraps all of them equally. Trust gates, feedback capture, memory assembly, and review patterns work regardless of which adapter produced the output.

This means:
- No vendor lock-in — Agent OS is AI-provider-agnostic
- "I want to use my subscription, not pay per-token" is a valid first user story
- The CLI adapter in Brief 016 isn't a compromise — it's the first of several adapters
- Every adapter implements the same `StepExecutionResult` interface

## Implications

- The adapter interface must be stable and well-defined — it's the extension point for new AI providers
- Cost tracking differs per adapter (CLI = $0, API = per-token) — the harness tracks both
- Tool capabilities differ per adapter (CLI has built-in file editing, API needs explicit tools) — the harness must not assume specific tool availability
- Quality may differ per adapter/model — the trust system handles this naturally (lower quality = more corrections = stays supervised longer)

## Where It Should Land

- `docs/architecture.md` L2 (Agent Layer) — document the adapter abstraction and supported adapter types
- Brief 016a — CLI adapter as first alternative adapter implementation
- Future brief — adapter registry for user-configurable AI backend selection
