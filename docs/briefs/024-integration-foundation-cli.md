# Brief: Integration Foundation + CLI Protocol (Phase 6a)

**Date:** 2026-03-21
**Status:** ready
**Depends on:** Phase 5 complete (E2E verification)
**Unlocks:** Brief 025 (MCP + Agent Tool Use)

## Goal

- **Roadmap phase:** Phase 6: External Integrations
- **Capabilities:** Integration registry (format + loader), `integration` executor type, CLI protocol handler, harness integration (logging + trust), ADR-005 formalised

## Context

This is the foundation sub-brief for Phase 6. It proves the integration pattern end-to-end with the simplest protocol (CLI) before adding MCP, REST, and credential vault complexity. CLI is the preferred protocol for services with mature CLIs (gh, gws, stripe, aws) — cheapest (10-32x fewer tokens than MCP) and most reliable.

The integration executor follows the existing adapter pattern (claude adapter, CLI adapter, script adapter) — it's a new case in the step executor switch, backed by protocol-specific handlers.

## Non-Goals

- MCP protocol (Brief 025)
- REST protocol (Brief 026)
- Credential vault / encrypted storage (Brief 026 — CLI uses OS keyring/env vars)
- Agent tool use during reasoning (Brief 025 — requires MCP tool schemas)
- Process I/O (triggers, sources, destinations — Brief 026)
- Webhook infrastructure
- Web dashboard integration UI

## Inputs

1. `docs/adrs/005-integration-architecture.md` — the integration architecture ADR
2. `docs/research/external-integrations-architecture.md` — landscape research
3. `docs/briefs/023-phase-6-external-integrations.md` — parent brief (design overview, resolved decisions)
4. `src/engine/step-executor.ts` — existing executor pattern to extend
5. `src/adapters/script.ts` — CLI handler extends this pattern (exec-based)
6. `src/engine/harness.ts` — harness context for integration logging
7. `src/engine/harness-handlers/feedback-recorder.ts` — where integration calls get logged
8. `src/db/schema.ts` — schema for `integration` executor type

## Constraints

- MUST follow the existing adapter pattern (invoke/status interface)
- MUST use YAML files for registry (consistent with process definitions, git-tracked per Insight-007)
- MUST log all integration calls to the activity table
- MUST NOT expose credentials in agent context or logs
- MUST NOT require running external services for tests (mock handlers)
- MUST NOT break existing executor types or tests
- MUST handle integration failures gracefully (retry with backoff, then fail → harness retry handles)
- MUST use a `resolveAuth(service, processId)` abstraction for credential resolution — initially reads env vars; Brief 026 swaps implementation to vault. Same interface, different backend.

## Provenance

| What | Source | Why this source |
|---|---|---|
| Integration registry as YAML declarations | Original — informed by Insight-007 (declarations vs state) and Nango git-tracked approach | Consistent with process definition pattern. Git-tracked, declarative. |
| CLI protocol execution | Script adapter (existing `src/adapters/script.ts`) + Google Workspace CLI pattern | CLI handler extends the existing exec-based adapter. Google Workspace ships CLI + MCP + REST for same service. |
| Multi-protocol resolution | Google Workspace CLI (`googleworkspace/cli`) | Ships all three protocols. Our registry resolves which to use. |
| Integration call logging | Feedback recorder (existing `src/engine/harness-handlers/feedback-recorder.ts`) | Integration calls are harness events, logged like step completions. |
| Handler registry extension | Sim Studio `apps/sim/executor/handlers/registry.ts` | Existing pattern for step executor routing. |

## What Changes (Work Products)

| File | Action |
|---|---|
| `integrations/github.yaml` | Create: First integration registry entry — GitHub CLI (`gh`). Available interfaces: CLI. Auth: env var (`GH_TOKEN`) or `gh auth login`. |
| `integrations/00-schema.yaml` | Create: JSON Schema for integration registry files (validation). |
| `src/engine/integration-registry.ts` | Create: Registry loader — parses `integrations/*.yaml`, validates, provides lookup by service name. Pattern: mirrors process-loader. |
| `src/engine/integration-handlers/cli.ts` | Create: CLI protocol handler — executes CLI commands, parses JSON output, returns structured result. Extends script adapter exec pattern. Env-based auth resolution. Retry with backoff (3 attempts). |
| `src/engine/integration-handlers/index.ts` | Create: Protocol handler registry — resolves handler by protocol type. Extensible for MCP/REST. |
| `src/engine/step-executor.ts` | Modify: Add `integration` case to executor switch. Resolves service from step config, loads registry entry, dispatches to protocol handler. |
| `src/db/schema.ts` | Modify: Add `"integration"` to `stepExecutorValues`. Add `integrationService` and `integrationProtocol` optional fields on `stepRuns` table (tracks which service/protocol was used per step). |
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify: Log integration calls with service name, protocol, success/failure. New activity type: `integration.call`. |
| `src/engine/process-loader.ts` | Modify: Validate `integration` executor steps have required `config.service` field. |
| `processes/dev-pipeline.yaml` | No change — dev pipeline doesn't use integrations. |
| `src/engine/integration-handlers/cli.test.ts` | Create: Tests for CLI handler (mock exec, success/failure/retry). |
| `src/engine/integration-registry.test.ts` | Create: Tests for registry loader (valid/invalid YAML, service lookup). |
| `src/engine/step-executor.test.ts` | Create or modify: Test integration executor routing. |

## User Experience

- **Jobs affected:** None directly — this is infrastructure. Future briefs add user-facing integration configuration.
- **Primitives involved:** None
- **Process-owner perspective:** After this brief, process authors can add integration steps to YAML that invoke external CLIs. Example: a step that runs `gh issue list --json` via the GitHub integration.
- **Interaction states:** N/A
- **Designer input:** Not invoked — infrastructure only. Designer needed for Brief 025+ when tool use has UX implications.

## Acceptance Criteria

1. [ ] `integrations/` directory exists with at least one registry file (`github.yaml`)
2. [ ] Registry loader parses YAML files, validates structure, returns typed entries
3. [ ] `stepExecutorValues` includes `"integration"` in schema
4. [ ] Step executor routes `integration` type to integration handler
5. [ ] CLI protocol handler executes commands via `child_process.exec` (same as script adapter)
6. [ ] CLI handler returns structured `StepExecutionResult` with outputs, logs, and confidence
7. [ ] CLI handler retries on failure (exponential backoff, max 3 attempts, 1s/2s/4s)
8. [ ] Integration calls are logged in activity table with type `integration.call`, service name, protocol used, success/failure
9. [ ] Credentials (env vars, auth tokens) are NOT included in agent context or step run logs
10. [ ] Process loader validates that integration steps have `config.service` field (fails on missing)
11. [ ] Tests: registry loader (valid file, invalid file, service lookup, missing service) — 4+ tests
12. [ ] Tests: CLI handler (success, failure, retry, timeout) — 4+ tests
13. [ ] Existing 66 tests still pass (backward compatible)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/adrs/005-integration-architecture.md`
2. Review agent checks: registry pattern consistency with process-loader, credential security, harness logging, test coverage
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Sync processes (should load integration registry too)
pnpm cli sync

# 2. Create a test process with an integration step
# (manually add to processes/ or use inline)
cat > /tmp/test-integration.yaml << 'EOF'
name: GitHub Issue List
id: gh-test
version: 1
status: active
steps:
  - id: list-issues
    name: List Open Issues
    executor: integration
    config:
      service: github
      command: "gh issue list --json number,title --limit 5"
    outputs:
      - issues
EOF

# 3. Run the process
pnpm cli start gh-test

# 4. Expected: step executes gh CLI, returns JSON issues list
# 5. Check activity log shows integration.call record
```

## After Completion

1. Update `docs/state.md` with integration foundation status
2. Update `docs/roadmap.md` — mark integration registry, registry loader, integration executor, CLI handler, harness integration as done
3. Accept ADR-005 (status: proposed → accepted)
4. Ready for Brief 025 (MCP + Agent Tool Use)
