# Brief: Credential Vault + Process I/O (Phase 6c)

**Date:** 2026-03-21
**Status:** ready
**Depends on:** Brief 025 (MCP + Agent Tool Use)
**Unlocks:** Phase 7 (Awareness — process dependency events from external triggers), non-coding templates fully operational

## Goal

- **Roadmap phase:** Phase 6: External Integrations
- **Capabilities:** Credential vault (encrypted storage), token lifecycle, per-process/per-agent credential scoping, external input sources, output delivery to external destinations, basic trigger mechanism

## Context

Briefs 024-025 build the integration foundation (registry, executor, CLI/MCP/REST handlers, tool use). This brief completes Phase 6 with the two remaining pieces:

1. **Credential vault** — secure, encrypted storage for OAuth tokens, API keys, and service credentials. Scoped per-process and per-agent so that Process A's Xero credentials can't be used by Process B. This replaces the env-var/static-token approach used in Briefs 024-025.

2. **Process I/O** — connecting process boundaries to external systems. Input sources (new email triggers invoice process), output destinations (approved invoice posted to Xero). This is the capability that makes the non-coding templates (invoice-follow-up, content-review, incident-response) operational with real external systems.

## Non-Goals

- Full OAuth flow UI (web dashboard — Phase 10)
- Webhook server infrastructure (deferred to Phase 7+ — re-entry: when polling proves insufficient). This brief implements polling-based triggers: lightweight loop in `process-io.ts` checks sources on a configurable interval, creates work items via existing capture pipeline.
- Data sync/caching layer (Insight-010 — separate from process I/O)
- Nango/Composio adoption (evaluate after this brief proves the minimal pattern)
- Multi-tenancy credential isolation (Phase 12)

## Inputs

1. `docs/briefs/023-phase-6-external-integrations.md` — parent brief
2. `docs/adrs/005-integration-architecture.md` — credential architecture (brokered pattern)
3. `src/engine/integration-registry.ts` — registry to extend with credential references (from Brief 024)
4. `src/engine/integration-handlers/` — protocol handlers to extend with vault resolution (from Brief 025)
5. `templates/invoice-follow-up.yaml` — first template to connect to real systems

## Constraints

- MUST encrypt credentials at rest (AES-256-GCM or similar via Node.js crypto)
- MUST scope credentials per-process, per-agent (an agent on Process A cannot access Process B's credentials)
- MUST NOT log credential values anywhere (activity logs, step runs, console output)
- MUST NOT include credential values in agent context or harness context
- Vault key management: environment variable (`AOS_VAULT_KEY`) for dogfood. Key management service integration deferred.
- Process I/O: output delivery happens AFTER trust gate approval (harness pipeline order preserved)
- Trigger mechanism: polling-based for Phase 6c (check on schedule). Event-driven triggers (webhooks) deferred.

## Provenance

| What | Source | Why this source |
|---|---|---|
| Brokered credentials | Composio (`composio.dev`) | Agent never sees tokens. Platform executes on agent's behalf. |
| Encrypted credential storage | Node.js `crypto` (AES-256-GCM) | Standard library, no additional dependency. Battle-tested. |
| Per-process credential scoping | Original | No existing platform scopes credentials per-process per-agent. |
| Token lifecycle | Nango managed auth pattern | Refresh before expiry, rotation support, revocation tracking. |
| Process trigger mechanism | Standard polling pattern (cron-style) | Simplest trigger mechanism. Webhook upgrade later. |
| Output delivery | Nango actions pattern | Code-first TypeScript functions for external writes. |

## What Changes (Work Products)

| File | Action |
|---|---|
| `src/engine/credential-vault.ts` | Create: Encrypted credential storage. Store/retrieve/delete credentials. AES-256-GCM encryption. Scoped by (processId, agentId, service). Vault key from `AOS_VAULT_KEY` env var. |
| `src/engine/credential-vault.test.ts` | Create: Vault tests (encrypt/decrypt, scoping, missing key, invalid credentials). |
| `src/db/schema.ts` | Modify: Add `credentials` table (id, processId, agentId, service, encryptedValue, expiresAt, createdAt). Add `trigger` and `outputDestination` fields on processes table. |
| `src/engine/integration-handlers/index.ts` | Modify: Protocol handlers receive credentials from vault (not from env vars). Credential resolution happens at dispatch time. |
| `src/engine/integration-registry.ts` | Modify: Registry entries reference credential vault scope, not raw auth values. |
| `src/engine/process-io.ts` | Create: Process I/O handler — resolves input sources and output destinations from process definition. Output delivery: calls integration handler after trust gate approval. Input polling: check source on schedule (cron-style). |
| `src/engine/process-io.test.ts` | Create: Process I/O tests (output delivery, source polling, credential scoping). |
| `src/engine/heartbeat.ts` | Modify: After process run completes and is approved, call process I/O output delivery. |
| `src/cli/commands/credential.ts` | Create: `aos credential add <service> --process <slug>` — stores encrypted credential in vault. `aos credential list` — shows stored credentials (service + process, never values). `aos credential remove`. |
| `src/cli.ts` | Modify: Register credential commands. |
| `integrations/github.yaml` | Modify: Auth references vault instead of env var. |
| `templates/invoice-follow-up.yaml` | Modify: Add `source:` and `destination:` fields pointing to real integrations (e.g., email source, accounting destination). |

## User Experience

- **Jobs affected:** Define (process definitions gain source/destination), Delegate (credential management)
- **Primitives involved:** Process Card (shows integration status), Trust Control (credential scope visible)
- **Process-owner perspective:** "I store my Xero credentials once, scoped to my invoice process. The process can now read from email and post to Xero. No other process can use those credentials."
- **Interaction states:** `aos credential add` — interactive prompt for credential value (masked input). `aos credential list` — shows service + process scope, never values.
- **Designer input:** Not invoked — CLI-only. Full credential UX in Phase 10 (web dashboard).

## Acceptance Criteria

1. [ ] Credential vault encrypts values at rest using AES-256-GCM
2. [ ] Credentials are scoped by (processId, agentId, service) — queries enforce scoping
3. [ ] Credential values NEVER appear in logs, step runs, agent context, or console output
4. [ ] `aos credential add <service> --process <slug>` stores encrypted credential
5. [ ] `aos credential list` shows stored credentials without revealing values
6. [ ] `aos credential remove <service> --process <slug>` deletes credential
7. [ ] Protocol handlers resolve credentials from vault at dispatch time (not from env vars)
8. [ ] Process definitions support `source:` field (external input source)
9. [ ] Process definitions support `destination:` field (external output destination)
10. [ ] Output delivery calls integration handler AFTER trust gate approval
11. [ ] Tests: vault encrypt/decrypt, scoping enforcement, missing vault key — 4+ tests
12. [ ] Tests: process I/O output delivery, credential resolution — 3+ tests
13. [ ] Existing tests still pass

## Smoke Test

```bash
# 1. Store a credential
pnpm cli credential add github --process gh-test
# (prompts for token, stores encrypted)

# 2. List credentials (shows scope, not value)
pnpm cli credential list
# → github | process: gh-test | added: 2026-03-22

# 3. Run a process that uses the stored credential
pnpm cli start gh-test

# 4. Expected: integration handler resolves credential from vault, not env var
# 5. Check: no credential values in activity logs or step run output
```

## After Completion

1. Update `docs/state.md` — Phase 6 complete
2. Update `docs/roadmap.md` — mark all Phase 6 items as done
3. All three non-coding templates can now connect to real external systems
4. Evaluate Nango/Composio adoption based on credential management experience
5. Phase 7 (Awareness) re-entry condition met: 2+ processes with external integrations
