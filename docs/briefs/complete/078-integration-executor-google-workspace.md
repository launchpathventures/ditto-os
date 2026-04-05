# Brief 078: Integration Executor Activation — Google Workspace

**Date:** 2026-04-02
**Status:** ready
**Depends on:** ADR-005 (integration architecture), Brief 075 (parent — Proactive Operating Layer)
**Unlocks:** EA-class processes (inbox triage, calendar management, sheets CRM updates)

## Goal

- **Roadmap phase:** Phase 11+ — Proactive Operating Layer
- **Capabilities:** End-to-end integration execution for Google Workspace (Gmail, Calendar, Sheets) via gws CLI

## Context

The integration executor infrastructure is **already built**: `integration` executor type routes in step-executor.ts, CLI and REST integration handlers exist in `src/engine/integration-handlers/`, the integration registry loads YAML definitions, and the credential vault (AES-256-GCM) manages per-process credentials. A GitHub integration YAML already exists as a working example.

What's missing is a **Google Workspace integration definition** and an **end-to-end validation** that a process can use Gmail/Calendar/Sheets through the existing infrastructure. This brief is smaller than originally scoped because the architecture anticipated the need and the plumbing exists.

Source pattern: clawchief's GOG (Gmail/Calendar/Sheets) dependency proves these three services are the minimum viable integration set for EA-class workflows. See Insight-141.

## Non-Goals

- OAuth2 flow implementation (gws CLI handles its own auth via `gws auth`)
- New integration handler types (CLI and REST handlers already exist)
- MCP protocol support (CLI is 10-32x cheaper per ADR-005)
- Building an EA process (this brief enables the integration; process templates are downstream)

## Inputs

1. `src/engine/step-executor.ts` — `integration` executor routing (lines 78-96)
2. `src/engine/integration-handlers/` — existing CLI handler (`cli.ts`), REST handler (`rest.ts`), index router
3. `src/engine/integration-registry.ts` — registry loader, IntegrationDefinition interface
4. `src/engine/credential-vault.ts` — `resolveServiceAuth()`, `storeCredential()`, `getCredential()`
5. `integrations/github.yaml` — existing integration definition to use as template
6. `docs/adrs/005-integration-architecture.md` — design spec

## Constraints

- MUST follow the existing integration YAML format exactly (use github.yaml as template)
- MUST use CLI-preferred protocol (gws CLI) — consistent with ADR-005 cheapest-first principle
- MUST NOT bypass the credential vault — auth resolved via `resolveServiceAuth()`
- MUST NOT introduce new executor types or handler patterns — use existing `integration` routing
- MUST test with real gws CLI commands (or mock them in tests)
- MUST declare tools for the three services: Gmail (search messages, read message, send), Calendar (list events, create event, check availability), Sheets (read range, write range)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Integration YAML format | Ditto `integrations/github.yaml` | pattern | Follow existing format exactly |
| gws CLI interface | Google Workspace CLI (gws) | depend | Mature CLI, handles its own OAuth |
| CLI integration handler | Ditto `src/engine/integration-handlers/cli.ts` | pattern | Already built — reuse |
| Credential resolution | Ditto `src/engine/credential-vault.ts` | pattern | Already built — reuse |
| EA service requirements | clawchief GOG dependency | pattern | Gmail + Calendar + Sheets minimum viable set |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `integrations/google-workspace.yaml` | Create: Integration definition with Gmail, Calendar, Sheets tools via gws CLI |
| `processes/templates/inbox-triage.yaml` | Create: Template process using google-workspace integration for inbox triage (demonstrates the pattern) |
| `src/engine/integration-handlers/cli.ts` | Modify (if needed): Ensure gws CLI output parsing works (gws returns JSON by default) |
| Tests | Create: Integration tests for google-workspace tools via CLI handler |

## User Experience

- **Jobs affected:** Define (declare integrations in process YAML), Operate (processes can read/write Gmail, Calendar, Sheets)
- **Primitives involved:** Process definitions with `integration` executor steps
- **Process-owner perspective:** Write a process YAML with steps like `executor: integration, config: { service: google-workspace, command: search_messages }`. Run `pnpm cli sync`, then `pnpm cli start <process>`. The integration executor calls gws CLI, returns structured results through the harness pipeline.
- **Interaction states:** N/A — engine-level only
- **Designer input:** Not invoked — no UI changes

## Acceptance Criteria

1. [ ] `integrations/google-workspace.yaml` exists with tools for Gmail (search_messages, read_message, send_message), Calendar (list_events, create_event, check_availability), and Sheets (read_range, write_range)
2. [ ] The integration registry loads google-workspace.yaml and resolves its tools
3. [ ] A process with `executor: integration, config: { service: google-workspace, command: search_messages }` executes through the existing CLI integration handler
4. [ ] Auth is resolved via `resolveServiceAuth()` — vault-first, env-var fallback (GWS_TOKEN or equivalent)
5. [ ] `processes/templates/inbox-triage.yaml` demonstrates a complete process using Gmail integration steps
6. [ ] Integration calls are logged to the activity table (existing harness behavior — verify it works for gws)
7. [ ] Trust gate applies to integration steps — supervised tier pauses for review before external calls proceed
8. [ ] Output from gws CLI (JSON) is parsed into structured `StepExecutionResult.outputs`
9. [ ] Type-check passes with zero errors
10. [ ] Tests cover: registry loading, tool resolution, CLI command construction, output parsing, credential resolution

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/adrs/005-integration-architecture.md`
2. Review checks: Does the YAML follow the github.yaml pattern? Is the CLI handler reused correctly? Are credentials handled securely? Does the template process demonstrate a realistic EA workflow?
3. Present work + review findings to human

## Smoke Test

```bash
# 1. Verify integration loads
pnpm cli sync
# Expected: google-workspace integration registered with 8 tools

# 2. Check credential resolution (env var fallback)
export GWS_TOKEN="test-token"
pnpm cli start inbox-triage --dry-run
# Expected: shows what commands would execute, auth resolved from env

# 3. Full execution (requires gws CLI installed and authenticated)
pnpm cli start inbox-triage
pnpm cli status
# Expected: run with integration steps, outputs from Gmail search
```

## After Completion

1. Update `docs/state.md` — Brief 078 complete, Google Workspace integration active
2. Update `docs/roadmap.md` — integration executor capability done for Google Workspace
3. Note in ADR-005: first real integration beyond GitHub now active
