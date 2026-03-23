# Brief: Integration Tools + Agent Tool Use (Phase 6b)

**Date:** 2026-03-21 (revised 2026-03-23 — post-031/032/033 execution model alignment, Insight-065)
**Status:** draft
**Depends on:** Brief 024 (Integration Foundation + CLI)
**Unlocks:** Brief 026 (Credentials + Process I/O)

## Goal

- **Roadmap phase:** Phase 6: External Integrations
- **Capabilities:** Declarative integration tool definitions, step-level `tools:` field, tool resolution from integration registry, tool authorisation via step declaration, REST protocol handler

## Context

Brief 024 built the integration foundation: YAML registry, CLI protocol handler, `integration` executor type. This brief adds the **agent tool use** mechanism — where agents can invoke external tools during their reasoning loop, not as discrete steps.

### Why this brief was revised (Insight-065)

The original Brief 025 designed around MCP schema passthrough: connect to MCP servers, discover their tool schemas, inject into the Claude adapter. Three subsequent briefs invalidated that approach:

1. **Brief 031** (Ditto Execution Layer) — Ditto owns its tools (`tools.ts` with `LlmToolDefinition` + `executeTool()`). Integration tools should follow the same pattern: Ditto defines the schema, Ditto executes the call.

2. **Brief 032** (LLM Provider Extensibility) — `llm.ts` supports Anthropic, OpenAI, Ollama with internal tool format translation. MCP schemas are Anthropic-ecosystem; injecting them bypasses the multi-provider architecture.

3. **Brief 033** (Model Routing) — Steps declare capability hints, not runtime specifics. Tools should similarly be declared abstractly (by service name) and resolved to execution by the harness.

**The revised approach:** Integration tools are declared in the integration registry YAML with their schemas and execution templates. The tool resolver produces `LlmToolDefinition[]` — Ditto's native format. Execution dispatches to the existing CLI handler or a new REST handler. No MCP dependency. Works with any LLM provider.

MCP is deferred as a future execution backend (not abandoned) — re-entry condition: "when a required integration has no CLI and REST is impractical."

### Tool Injection Architecture (revised)

```
Integration YAML: tools section (name, params, execute template)
    ↓
Tool Resolver: reads registry → LlmToolDefinition[] + execution handlers
    ↓
Process YAML: step.tools: [github.search_issues, slack.send_message]
    ↓
Process Loader: validates tool names against registry
    ↓
Memory Assembly Handler: resolves step tools → HarnessContext.resolvedTools
    ↓
Step Execution Handler: passes resolvedTools to adapter
    ↓
Claude Adapter: merges codebase tools + resolved integration tools
    ↓
executeIntegrationTool(): dispatches to CLI handler or REST handler
(codebase tools still use existing executeTool() — separate dispatch)
    ↓
Step Output: includes toolCalls log for trust gate review
```

### Relationship to Conversational Self (ADR-016)

Unchanged from original. Integration tools operate within delegated process runs, not at the Self level. The Self's own tools (`start_dev_role`, `consult_role`, etc.) are completely separate.

## Non-Goals

- MCP protocol handler (deferred — Insight-065)
- Credential vault / encrypted storage (Brief 026)
- Token lifecycle (refresh, rotation — Brief 026)
- Process I/O: triggers, sources, destinations (Brief 026)
- Webhook infrastructure
- Dynamic tool discovery (tools are declared in registry, not discovered at runtime)
- Self-level tool awareness (tools are step-scoped)

## Inputs

1. `docs/briefs/023-phase-6-external-integrations.md` — parent brief
2. `docs/adrs/005-integration-architecture.md` — integration architecture
3. `docs/insights/065-integration-tools-are-ditto-native.md` — why MCP passthrough was dropped
4. `src/engine/tools.ts` — existing tool pattern to extend (LlmToolDefinition + executeTool)
5. `src/engine/integration-registry.ts` — registry to extend with tool definitions
6. `src/engine/integration-handlers/cli.ts` — CLI handler to reuse for tool execution
7. `src/engine/integration-handlers/index.ts` — handler registry
8. `src/adapters/claude.ts` — Claude adapter's tool_use loop (extension point at line 264-276)
9. `src/engine/harness.ts` — HarnessContext interface
10. `src/engine/harness-handlers/memory-assembly.ts` — handler where tool resolution runs
11. `src/engine/step-executor.ts` — bridge between harness and adapters
12. `src/engine/llm.ts` — LlmToolDefinition type definition
13. `integrations/github.yaml` — existing registry entry to extend with tools

## Constraints

- MUST follow the Ditto-native tool pattern: `LlmToolDefinition` schema + `executeTool()` dispatch
- MUST NOT introduce MCP SDK dependency
- MUST NOT allow agent to call tools not declared in the step's `tools:` field
- MUST preserve existing codebase tools (read_file, search_files, list_files, write_file) — integration tools are additive
- MUST NOT change the Self's tool set or delegation model
- MUST reuse the existing CLI handler (`executeCli()`) for CLI-backed integration tools
- MUST respect credential scrubbing for all integration tool results
- REST handler: minimal — GET/POST with headers, JSON body, static API keys from env vars. No OAuth flows (Brief 026). MUST scrub auth credentials from response bodies using same pattern as CLI handler's `scrubCredentials`.
- Tool names use `service.action` format (e.g., `github.search_issues`) to avoid collisions with codebase tools
- Tool call logs included in step output for trust gate review
- The existing `step.config.tools` field (`"read-only" | "read-write"`) for codebase tool subsets is independent of the new top-level `step.tools` field for integration tools. Both coexist.

## Provenance

| What | Source | Why this source |
|---|---|---|
| Ditto-native tool definitions | `src/engine/tools.ts` (Brief 031) | Same pattern for integration and codebase tools — consistent, provider-agnostic |
| CLI command execution | `src/engine/integration-handlers/cli.ts` (Brief 024) | Already built: retry, auth, credential scrubbing. Reuse, don't rebuild |
| Declarative tool registry | ADR-005, Insight-007 (declarations vs state), Nango git-tracked approach | Integration tools declared in YAML alongside service config |
| Tool authorisation per step | Original — per-step `tools:` field in process definition | No existing platform gates tools by process step declaration |
| REST handler | Standard HTTP client patterns (native `fetch`) | Universal fallback protocol. Node 18+ has native fetch |
| Tool resolution in harness | ADR-005 Section 4, `claude.ts` line 15-17 "pragmatic shortcut" comment | The adapter explicitly notes tool resolution should move to harness assembly |
| Command templates | Mustache-style interpolation, `gh` CLI flag patterns | Simple, declarative, no eval() |

## What Changes (Work Products)

| File | Action |
|---|---|
| `integrations/github.yaml` | Modify: Add `tools:` section with 3-4 tools (search_issues, list_prs, get_issue, create_issue). Each tool has name, description, parameters, and execute template (protocol + command_template or endpoint). |
| `integrations/slack.yaml` | Create: Slack integration with REST interface + 2 tools (search_messages, send_message). REST-only service example. |
| `src/engine/integration-registry.ts` | Modify: Add `IntegrationTool` type (name, description, parameters, execute config). Parse and validate `tools:` section from registry YAML. Export `getIntegrationTools(service)` function. |
| `src/engine/tool-resolver.ts` | Create: Given a step's `tools: string[]` (e.g., `["github.search_issues", "slack.send_message"]`), resolves each to an `LlmToolDefinition` + creates an execution handler that dispatches to CLI/REST. Returns `{ tools: LlmToolDefinition[], executeIntegrationTool: (name, input) => string }`. |
| `src/engine/integration-handlers/rest.ts` | Create: REST protocol handler — HTTP GET/POST with configurable headers, auth header injection (from env vars), JSON response parsing, error handling. Follows CLI handler interface pattern. |
| `src/engine/integration-handlers/index.ts` | Modify: Add REST to handler registry. |
| `src/engine/process-loader.ts` | Modify: Add `tools?: string[]` to `StepDefinition` interface. Parse `tools:` field from YAML. Validate tool names against integration registry at load time (format: `service.tool_name`). |
| `src/engine/harness.ts` | Modify: Add `resolvedTools?: { tools: LlmToolDefinition[], executeIntegrationTool: (name: string, input: Record<string, unknown>) => Promise<string> }` to `HarnessContext`. |
| `src/engine/harness-handlers/memory-assembly.ts` | Modify: When `stepDefinition.tools` is present, call tool resolver. Store result on `context.resolvedTools`. Separate from memory budget — tools don't consume token budget. |
| `src/engine/step-executor.ts` | Modify: `executeStep()` gains optional `resolvedTools` parameter from HarnessContext. Passes to Claude adapter. |
| `src/adapters/claude.ts` | Modify: `execute()` accepts optional resolved tools. Merges integration tool `LlmToolDefinition[]` with codebase tools. In the tool_use loop, dispatches integration tool calls to `executeIntegrationTool()` instead of `executeTool()`. All tool calls (codebase + integration) logged. Remove "pragmatic shortcut" comment. |
| `src/db/schema.ts` | Modify: Add `toolCalls` JSON field on `stepRuns` table (logs tool name, arguments, result summary, timestamp per invocation). |
| `src/engine/tool-resolver.test.ts` | Create: Tool resolution tests. |
| `src/engine/integration-handlers/rest.test.ts` | Create: REST handler tests. |

## User Experience

- **Jobs affected:** Define (process definitions gain `tools:` field)
- **Primitives involved:** Process Builder (future — tools selectable per step, Phase 10)
- **Process-owner perspective:** Process authors declare which external tools an agent can use per step. Example: `tools: [github.search_issues, github.list_prs]`. The agent can then use those tools during its reasoning. The Conversational Self surfaces results — the user never interacts with tool resolution.
- **Designer input:** Not invoked — infrastructure only. Full tool UX when Process Builder ships (Phase 10).

## Acceptance Criteria

1. [ ] Integration registry YAML supports `tools:` section with name, description, parameters, and execute config (protocol + template)
2. [ ] Integration registry loader parses and validates tool definitions, exports `getIntegrationTools(service)`
3. [ ] `StepDefinition` has optional `tools: string[]` field, parsed from YAML
4. [ ] Process loader validates tool names against integration registry (format: `service.tool_name`)
5. [ ] Tool resolver maps `tools: string[]` → `LlmToolDefinition[]` + execution dispatch function
6. [ ] Tool resolver rejects tools not declared in the step's `tools:` list (authorisation)
7. [ ] `HarnessContext` has `resolvedTools` field, populated by memory-assembly handler
8. [ ] Claude adapter merges resolved integration tools with codebase tools in tool_use loop
9. [ ] Integration tool calls dispatch to CLI handler (reusing `executeCli()`) or REST handler based on tool's execute config
10. [ ] REST handler makes HTTP requests with configurable method, headers, body, and auth header injection from env vars
11. [ ] Tool calls during agent execution are logged on `stepRuns.toolCalls` with name, args, result summary, timestamp
12. [ ] Integration tool results have credentials scrubbed (reuses CLI handler's `scrubCredentials` pattern)
13. [ ] Tests: Tool resolver (valid tools, invalid tools, missing registry, codebase tools preserved, service.tool_name format) — 5+ tests
14. [ ] Tests: REST handler (GET, POST, auth injection, error handling) — 4+ tests
15. [ ] Existing tests still pass (218 tests)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: tool resolution uses `LlmToolDefinition` (not MCP/Anthropic types), adapters receive tools correctly, codebase tools preserved, no Self-level changes, no MCP dependency introduced, toolCalls logging complete, credential scrubbing on integration results
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. GitHub integration YAML with tools
cat integrations/github.yaml
# Expected: tools section with search_issues, list_prs etc.

# 2. Process with tool-equipped agent step
cat > /tmp/test-tools.yaml << 'EOF'
name: Tool Use Test
id: tool-test
version: 1
status: active
steps:
  - id: research
    name: Research with tools
    executor: ai-agent
    tools: [github.search_issues, github.list_prs]
    description: "Use GitHub tools to find recent issues and PRs"
EOF

# 3. Verify process loader validates tools
pnpm cli sync
# Expected: process loads successfully if GH_TOKEN is set and gh CLI installed

# 4. Start and verify tool availability
pnpm cli start tool-test
# Expected: Claude agent has github tools + codebase tools
# Check stepRuns.toolCalls shows tool invocations with name + args + result
# Verify: Self's delegation tools unchanged
```

## After Completion

1. Update `docs/state.md` — REST handler built, agent tool use working, tool injection from harness to adapter complete. Note MCP deferred per Insight-065.
2. Update `docs/roadmap.md` — mark REST handler, step-level tools, tool resolution, tool authorisation as done. MCP handler remains "not started" with note.
3. Update `src/adapters/claude.ts` header comment — remove "pragmatic shortcut" note, reference this brief
4. Update `src/engine/tools.ts` header comment — remove Phase 6 note
5. ADR-005 post-implementation note: tools implemented as Ditto-native per Insight-065, MCP deferred
6. Update `docs/architecture.md` Layer 2 Claude adapter description to include integration tool merging alongside codebase tools
7. Ready for Brief 026 (Credentials + Process I/O)
