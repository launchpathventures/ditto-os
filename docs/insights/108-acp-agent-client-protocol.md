# Insight-108: Agent Client Protocol (ACP) as Integration Pattern

**Date:** 2026-03-30
**Trigger:** Research into expect-cli (millionco/expect) for Brief 054 testing infrastructure revealed it doesn't call LLMs directly — it speaks ACP to spawn coding agents
**Layers affected:** L2 Agent, L6 Human
**Status:** active

## The Insight

Modern AI developer tools are converging on the Agent Client Protocol (ACP) as the standard interface between orchestrators and coding agents. ACP is a JSON-RPC-over-stdio protocol created by Zed Industries with SDKs in TypeScript, Python, Rust, Java, and Kotlin. Tools like expect-cli don't call LLM APIs — they spawn ACP-compatible agent processes (Claude Code, Codex, Gemini CLI, Cursor, OpenCode, Droid) and communicate structured requests/responses.

This means "integrating with AI tools" increasingly means "speaking ACP" rather than "calling an LLM API." The distinction matters: an ACP agent has context (files, project state, tools) that a raw LLM call doesn't. expect-cli gets better tests because it delegates to a full coding agent, not just a completion endpoint.

## Implications

1. **Ditto as ACP provider.** Ditto could expose an ACP-compatible interface (`ditto-acp`), making it usable as a backend for any ACP-speaking tool. This would let expect-cli, Zed, and other ACP clients use Ditto's configured LLM provider, memory, and project context.
2. **ACP as integration pattern.** Beyond testing, ACP could become how Ditto integrates with the broader AI tooling ecosystem — similar to how MCP standardizes tool access, ACP standardizes agent access.
3. **Agent ≠ LLM call.** Design decisions should distinguish between "needs an LLM completion" and "needs an agent with context." The former is `createCompletion()`, the latter would be an ACP session.

## Where It Should Land

Future brief for Ditto ACP adapter (Phase 11+). Could inform ADR-005 (Integration Architecture) addendum on agent-level integration patterns vs tool-level patterns.
