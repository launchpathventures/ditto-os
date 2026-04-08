# Brief 113: Zapier SDK Tool Integration — Agent Access to 9,000+ External Services

**Date:** 2026-04-09
**Status:** draft
**Depends on:** none (builds on existing agent tool infrastructure)
**Unlocks:** Process steps that interact with external services (CRM, email, project tools, calendars, etc.) without building individual integrations

## Goal

- **Roadmap phase:** Phase 11+ (Find-or-Build Routing)
- **Capabilities:** Replaces "auto-generate integrations from OpenAPI specs" with a faster, broader approach — agents discover and execute external service actions through the Zapier SDK

## Context

Ditto processes need to interact with the outside world — send Slack messages, create Jira tickets, update CRMs, add calendar events, send emails through user accounts. The roadmap planned "find-or-build routing" that would auto-generate integrations from OpenAPI specs. That's months of work to cover a fraction of services.

Zapier's new `@zapier/zapier-sdk` (open beta, free) is purpose-built for AI agents. It provides:
- **9,000+ apps** with pre-built actions (30,000+ actions)
- **Dynamic schema discovery** — agents explore what's available at runtime, no hardcoded knowledge
- **Automatic OAuth/auth handling** — users connect accounts on Zapier, the SDK handles tokens
- **Raw authenticated fetch** — escape hatch for any API not covered by pre-built actions
- **MCP server mode** — `npx zapier-sdk mcp` for conversational access

The discovery loop (`listApps` → `listActions` → `getInputFieldsSchema` → `listInputFieldChoices` → execute) maps directly to how an agent would reason about connecting a process step to an external service.

Documentation: https://docs.zapier.com/sdk

## Objective

Add the Zapier SDK as a tool available to agents within the harness, so process steps can discover and execute actions on external services. Users connect their accounts through Zapier; agents use those connections when building and running processes.

## Non-Goals

- **Building a Zapier integration management UI** — V1 uses Zapier's own connection management UI. Ditto doesn't duplicate it.
- **Making Ditto a Zapier integration** — this brief is about consuming Zapier, not exposing Ditto on Zapier's platform (that's the Platform SDK, a separate play)
- **Replacing all integration patterns** — Zapier is one tool in the agent's toolbelt. Direct API calls, MCP tools, and future OpenAPI generation remain viable paths.
- **User-facing Zapier branding** — users interact with "connect your Slack" or "connect your CRM," not "configure your Zapier integration"
- **Workflow API / Zap creation** — V1 uses the SDK for individual action execution within process steps, not for creating multi-step Zaps

## Inputs

1. `docs/architecture.md` — six-layer architecture, agent tool model, trust tiers
2. `src/engine/self-tools/` — existing tool implementations for pattern reference
3. `src/engine/llm.ts` — provider abstraction pattern (similar SDK wrapping needed)
4. `src/engine/harness.ts` — where tools are registered and made available to agents
5. `packages/core/src/harness/` — HarnessContext, tool interface definitions
6. https://docs.zapier.com/sdk — Zapier SDK documentation

## Constraints

- Zapier SDK is a **tool**, not an infrastructure dependency — it's registered like any other tool in the agent harness
- User's Zapier connections are **never stored in Ditto's database** — the SDK retrieves them at runtime via Zapier's API
- Zapier client credentials (Ditto's SDK auth) are stored as environment config, not per-user
- Agent must check user has an active connection before attempting an action — graceful failure with clear message if not connected
- Trust tier governs whether agents can execute external actions: supervised tier requires human approval before each action, autonomous tier can execute freely
- All Zapier action executions are logged as activities with: app, action, inputs (redacted sensitive fields), success/failure, cost
- Connection discovery (`listApps`, `listActions`) is always allowed — only execution is trust-gated
- Must handle Zapier SDK being unavailable (no credentials configured, API down) gracefully — tool simply not available, processes degrade to manual steps

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Zapier SDK | `@zapier/zapier-sdk` (npm) | depend | Mature enough for beta adoption; Zapier is a governed platform; dependency is isolated to one tool |
| Tool registration pattern | `src/engine/self-tools/` | pattern | Existing tool structure in the harness |
| Schema discovery for dynamic tools | Zapier SDK `getInputFieldsSchema()` | depend | SDK provides this natively |
| Credential injection | Zapier SDK connection model | depend | SDK handles OAuth/token lifecycle entirely |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/tools/zapier.ts` | Create: Zapier tool implementation — `zapier_discover_apps`, `zapier_list_actions`, `zapier_get_schema`, `zapier_execute_action`, `zapier_list_connections`, `zapier_raw_fetch`. Each maps to SDK methods. |
| `src/engine/tools/zapier.test.ts` | Create: Unit tests — schema discovery, action execution, connection checking, error handling, trust-gate enforcement |
| `src/engine/tools/index.ts` | Create or Modify: Tool registry that includes Zapier tools when SDK credentials are configured |
| `packages/core/src/harness/tool-types.ts` | Modify: Add `external_service` tool category for trust-tier enforcement (external actions need higher trust than internal tools) |
| `.env.example` | Modify: Add `ZAPIER_CLIENT_ID`, `ZAPIER_CLIENT_SECRET` with comments |
| `package.json` | Modify: Add `@zapier/zapier-sdk` dependency |
| `docs/insights/163-zapier-sdk-as-integration-layer.md` | Create: Insight capturing the "depend on Zapier for external integrations rather than building OpenAPI generation" decision |

## User Experience

- **Jobs affected:** Delegate (connecting external services to processes), Define (process steps that touch external tools)
- **Primitives involved:** Tool execution, trust gate, activity log
- **Process-owner perspective:** User tells Ditto "I want this process to create a Jira ticket when a deliverable is ready." Agent discovers Jira on Zapier, checks if user has a connection, asks them to connect if not (links to Zapier), then wires the process step to use `zapier_execute_action` with the right inputs. On subsequent runs, the step executes automatically (trust-tier permitting).
- **Interaction states:**
  - **No Zapier credentials configured (system-level):** Zapier tools not registered. Processes that need external services fall back to manual steps or direct API tools.
  - **User not connected to requested app:** Agent surfaces "Connect your [App] to enable this step" with link to Zapier connections page.
  - **Connected and trusted:** Action executes, result logged, process continues.
  - **Connected but supervised trust:** Agent presents proposed action to user for approval before executing.
  - **Zapier API error:** Logged as activity, step marked as failed, surfaced in briefing.
- **Designer input:** Not invoked — no new UI surfaces in V1. Connection management is Zapier's UI. Action results appear in existing activity log and process step output.

## Acceptance Criteria

1. [ ] `@zapier/zapier-sdk` added as a dependency and initialised with client credentials from environment
2. [ ] `zapier_discover_apps({ search })` tool calls `listApps()` and returns app names, keys, and available action counts
3. [ ] `zapier_list_actions({ app, type? })` tool calls `listActions()` filtered by app key and optional type (read/write/search)
4. [ ] `zapier_get_schema({ app, actionType, action })` tool calls `getInputFieldsSchema()` and returns JSON Schema for the action's inputs
5. [ ] `zapier_list_connections({ app? })` tool calls `listConnections()` / `findFirstConnection()` and returns connection status per app
6. [ ] `zapier_execute_action({ app, actionType, action, inputs, connectionId })` executes the action via the SDK and returns the result
7. [ ] `zapier_raw_fetch({ url, method, body?, connectionId })` calls `zapier.fetch()` for direct API access with credential injection
8. [ ] Discovery tools (`discover_apps`, `list_actions`, `get_schema`, `list_connections`) are available at all trust tiers
9. [ ] Execution tools (`execute_action`, `raw_fetch`) are trust-gated: supervised tier requires human approval, autonomous tier executes freely
10. [ ] All action executions logged as activities: `action: "zapier.execute"`, metadata includes app, action, success/failure, duration. Sensitive input fields (passwords, tokens) are redacted.
11. [ ] When `ZAPIER_CLIENT_ID` / `ZAPIER_CLIENT_SECRET` are not set, Zapier tools are simply not registered — no errors, no degraded state
12. [ ] When user has no connection for the requested app, tool returns a structured error with `{ needsConnection: true, app, connectUrl }` — agent can surface this to the user
13. [ ] Unit tests cover: discovery (mock SDK responses), execution (success + failure), trust-gate enforcement, missing credentials, missing connection, SDK timeout/error

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: tool registration pattern consistency, trust-tier enforcement, no Ditto opinions leaking into tool layer, activity logging completeness, graceful degradation when SDK unavailable
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Unit tests
pnpm test -- --grep "zapier"

# Type check
pnpm run type-check

# Manual: with SDK credentials configured, run discovery tools against a test app
# Manual: connect a test account (e.g. Slack), execute a read action, verify activity logged
# Manual: without SDK credentials, verify Zapier tools don't appear in tool registry
```

## After Completion

1. Update `docs/state.md` — Zapier SDK integration available as agent tool
2. Update `docs/roadmap.md` — "Find-or-Build Routing" partially delivered via Zapier SDK path
3. Capture Insight-164 on the composition-over-invention decision
4. Evaluate: should connection management be surfaced in Ditto's onboarding flow?
