# Insight-065: Integration Tools Are Ditto-Native, Not MCP Passthrough

**Date:** 2026-03-23
**Trigger:** PM triage of Brief 025 post-Briefs 031-033. The execution model changed: Ditto now owns its tool layer (`tools.ts` with `LlmToolDefinition`, `executeTool()`), supports multiple LLM providers (`llm.ts`), and does internal tool format translation. MCP schema passthrough conflicts with all three.
**Layers affected:** L2 Agent, L3 Harness
**Status:** active

## The Insight

Integration tools should follow the same pattern as codebase tools: **Ditto defines the schema, Ditto executes the call.** The integration registry declares tools per service with their parameters and execution templates. The tool resolver produces `LlmToolDefinition[]` — Ditto's native format that works with any LLM provider. Execution dispatches to the existing CLI handler or a new REST handler internally.

The MCP approach (connect to MCP server → discover schemas → pass to LLM → delegate execution to MCP server) has three problems post-031/032/033:

1. **Provider coupling.** MCP tool schemas are Anthropic-ecosystem. Ditto's multi-provider `llm.ts` translates tool formats internally — injecting MCP schemas bypasses this and creates a Claude-specific path.

2. **Control inversion.** Ditto's security model requires credential scrubbing, secret deny-lists, and tool call logging. With MCP passthrough, the MCP server controls execution — Ditto can't enforce its security model on tool results.

3. **Unnecessary complexity.** MCP adds stdio process lifecycle management, connection handling, and a dependency on `@modelcontextprotocol/sdk`. The CLI handler (Brief 024) already executes commands with retry, auth, and credential scrubbing. Wrapping CLI commands as Ditto-native tools is simpler and proven.

MCP is not abandoned — it can be added later as a third execution backend (alongside CLI and REST) for services where neither CLI nor REST is practical. But the **tool definition** is always Ditto-native. MCP becomes a protocol adapter, not a schema source.

## Implications

- Brief 025 needs rewrite: drop MCP handler, add declarative tool definitions in integration YAML
- Tool resolver produces `LlmToolDefinition[]`, not MCP schemas
- `executeTool()` in `tools.ts` extends to dispatch integration tools to CLI/REST handlers
- ADR-005 MCP references remain valid architecturally — MCP is deferred, not rejected
- Integration registry YAML gains a `tools:` section with schemas + execution templates

## Where It Should Land

- Brief 025 rewrite (immediate)
- ADR-005 post-implementation note (when Brief 025 ships)
- Architecture.md Layer 2 tools section (when Brief 025 ships)
