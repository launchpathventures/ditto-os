# Brief: MCP Protocol + Agent Tool Use (Phase 6b)

**Date:** 2026-03-21
**Status:** ready
**Depends on:** Brief 024 (Integration Foundation + CLI)
**Unlocks:** Brief 026 (Credentials + REST + Process I/O)

## Goal

- **Roadmap phase:** Phase 6: External Integrations
- **Capabilities:** MCP protocol handler, REST protocol handler, step-level `tools:` field, tool resolution from integration registry, tool authorisation via agent permissions

## Context

Brief 024 proves the integration pattern with CLI. This brief adds the two remaining protocols (MCP, REST) and the agent tool use mechanism — where agents can invoke external tools during their reasoning loop.

MCP is the primary integration protocol for services without mature CLIs (Slack, Notion, Xero, Linear). REST is the universal fallback. Both require more sophisticated auth handling than CLI's env-var pattern, but the full credential vault is Brief 026 — this brief uses API keys and static OAuth tokens (sufficient for dogfood).

Agent tool use is architecturally different from integration steps: tools are invoked mid-reasoning by the agent (Claude tool_use), not as a discrete step. The harness authorises tools at assembly time; the trust gate evaluates the completed output including a log of all tool calls.

## Non-Goals

- Credential vault / encrypted storage (Brief 026)
- Token lifecycle (refresh, rotation — Brief 026)
- Process I/O (triggers, sources, destinations — Brief 026)
- Webhook infrastructure
- Dynamic tool discovery (tools are declared in process definitions, not discovered at runtime)
- MCP server hosting (Agent OS connects to existing MCP servers, doesn't run its own)

## Inputs

1. `docs/briefs/023-phase-6-external-integrations.md` — parent brief
2. `docs/adrs/005-integration-architecture.md` — integration architecture
3. `src/engine/integration-handlers/cli.ts` — CLI handler pattern to follow (from Brief 024)
4. `src/engine/integration-registry.ts` — registry to extend (from Brief 024)
5. `src/adapters/claude.ts` — Claude adapter (tool_use loop to extend for external tools)
6. `src/adapters/cli.ts` — CLI adapter (needs tool injection for claude -p steps)
7. `docs/research/external-integrations-architecture.md` — MCP patterns, token cost comparison

## Constraints

- MUST follow the protocol handler pattern established in Brief 024
- MUST NOT expose MCP server credentials in agent context
- MUST NOT allow agent to call tools not declared in the process step's `tools:` field
- MCP connections: stdio-based (local servers) first. SSE-based (remote) deferred — re-entry condition: "when a required integration has no stdio MCP server and no CLI/REST alternative." Most dogfood services have stdio servers.
- REST handler: minimal — GET/POST with headers, JSON body. Supports static API keys from integration registry entries (inline). No complex OAuth flows (vault-resolved credentials come in Brief 026).
- Tool call logs included in step output for trust gate review

## Provenance

| What | Source | Why this source |
|---|---|---|
| MCP client connection | Claude Agent SDK MCP (`@anthropic-ai/sdk`) | Native MCP support in Claude SDK. Anthropic's own implementation. |
| Skills wrapping MCP | OpenClaw (65% of skills wrap MCP servers) | Instruction layer (process) over execution layer (protocol). |
| Dynamic tool loading | Claude Agent SDK MCP tool search | Load tools on demand from MCP server schema. |
| Tool authorisation | Original — per-step `tools:` field in process definition | No existing platform gates tools by process step declaration. |
| REST handler | Standard HTTP client patterns (fetch/node-fetch) | Universal fallback protocol. |

## What Changes (Work Products)

| File | Action |
|---|---|
| `src/engine/integration-handlers/mcp.ts` | Create: MCP protocol handler — connects to MCP server (stdio), invokes tools, returns structured result. |
| `src/engine/integration-handlers/rest.ts` | Create: REST protocol handler — HTTP GET/POST with configurable headers, auth header injection, JSON response parsing. |
| `src/engine/integration-handlers/index.ts` | Modify: Add MCP and REST to protocol handler registry. |
| `src/engine/integration-registry.ts` | Modify: Support MCP and REST interface entries in registry YAML. |
| `src/engine/tool-resolver.ts` | Create: Given a step's `tools:` list, resolves each tool name to an integration registry entry + protocol handler. Returns tool schemas for injection into adapter context. |
| `src/engine/harness-handlers/memory-assembly.ts` | Modify: When step has `tools:`, resolve tool schemas and add to adapter context. |
| `src/engine/process-loader.ts` | Modify: Parse `tools:` field on step definitions. Validate tool names against integration registry. |
| `src/adapters/claude.ts` | Modify: When adapter context includes resolved tools, add them to Claude API tool_use definitions. Log tool calls in step output. |
| `src/db/schema.ts` | Modify: Add `toolCalls` JSON field on `stepRuns` (logs which tools were invoked, with what arguments, and results). |
| `integrations/github.yaml` | Modify: Add MCP interface (stdio server for GitHub). |
| `integrations/slack.yaml` | Create: Slack integration — MCP interface. Example for MCP-only service. |
| `src/engine/integration-handlers/mcp.test.ts` | Create: MCP handler tests (mock MCP server, tool invocation, error handling). |
| `src/engine/integration-handlers/rest.test.ts` | Create: REST handler tests (mock HTTP via nock, auth injection, error handling). |
| `src/engine/tool-resolver.test.ts` | Create: Tool resolution tests (valid/invalid tools, permission checking). |

## User Experience

- **Jobs affected:** Define (process definitions gain `tools:` field)
- **Primitives involved:** Process Builder (future — tools selectable per step)
- **Process-owner perspective:** Process authors can now declare which external tools an agent has access to per step. Example: "This research step can use Slack search and GitHub issue lookup."
- **Designer input:** Not invoked — infrastructure only. Full tool UX when Process Builder ships (Phase 10).

## Acceptance Criteria

1. [ ] MCP handler connects to a stdio-based MCP server and invokes tools
2. [ ] MCP handler returns structured `StepExecutionResult` with tool call results
3. [ ] REST handler makes HTTP requests with configurable method, headers, body
4. [ ] REST handler injects auth headers from integration registry entry
5. [ ] Process step definitions support optional `tools:` array field
6. [ ] Tool resolver maps tool names to integration registry entries + protocol handlers
7. [ ] Tool resolver rejects tools not in the step's `tools:` list (authorisation)
8. [ ] Claude adapter includes resolved tool schemas in API tool_use definitions
9. [ ] Tool calls during agent execution are logged on `stepRuns.toolCalls`
10. [ ] Integration registry supports MCP (server URI, auth) and REST (base URL, auth) interface entries
11. [ ] Tests: MCP handler (connect, invoke, error, timeout) — 4+ tests
12. [ ] Tests: REST handler (GET, POST, auth injection, error) — 4+ tests
13. [ ] Tests: Tool resolver (valid tools, invalid tools, missing registry entry) — 3+ tests
14. [ ] Existing tests still pass

## Smoke Test

```bash
# 1. Process with tool-equipped agent step
cat > /tmp/test-tools.yaml << 'EOF'
name: Tool Use Test
id: tool-test
version: 1
status: active
steps:
  - id: research
    name: Research with tools
    executor: ai-agent
    tools: [github]
    description: "Use GitHub tools to find recent issues"
EOF

# 2. Start with GitHub MCP server running
pnpm cli start tool-test

# 3. Expected: Claude agent has GitHub tools available, invokes them during reasoning
# 4. Check stepRuns.toolCalls shows tool invocations
```

## After Completion

1. Update `docs/state.md` — MCP + REST handlers built, agent tool use working
2. Update `docs/roadmap.md` — mark MCP handler, REST handler, step-level tools, tool resolution, tool authorisation as done
3. Ready for Brief 026 (Credentials + Process I/O)
