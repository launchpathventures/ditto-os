# Brief 091: Fleet-Wide Workspace Upgrades

**Date:** 2026-04-06
**Status:** draft
**Depends on:** Brief 090 (Automated Workspace Provisioning — `managedWorkspaces` table, admin auth, Fly Machines API integration)
**Unlocks:** Zero-touch version deployment, CI/CD integration, always-current managed workspaces

## Goal

- **Roadmap phase:** Phase 15: Managed Workspace Infrastructure
- **Capabilities:** Rolling fleet-wide image upgrades with circuit breaker, automatic schema migration verification, fleet health monitoring, upgrade history with audit trail, rollback capability, alerting on degraded workspaces

## Context

Brief 090 provisions individual workspaces. This brief keeps them current. When a new version of Ditto ships, every managed workspace needs to be updated — new features, bug fixes, schema changes. This must be safe: a bad image must not take down the entire fleet.

The key insight from the review: **fleet upgrades are a high-blast-radius operation**. Without guardrails, a broken image cascading through a rolling update destroys every workspace one by one before anyone notices. This brief treats upgrades as a safety-critical operation with defense in depth: canary deployment, circuit breaker, rollback, and alerting.

## Objective

After this brief: a single command upgrades all managed workspaces to a new image. The upgrade is rolling (one at a time), circuit-breaker protected (stops on consecutive failures), rollback-capable (revert to previous image), and observable (admin sees progress, gets alerts on failures). Schema migrations run automatically via `instrumentation.ts` on each workspace restart.

## Non-Goals

- **Self-hosted workspace upgrades.** Self-hosters run `git pull`. This brief covers managed workspaces only.
- **Zero-downtime upgrades (blue-green).** Each workspace has brief downtime during restart (~30-60s). Acceptable at MVP scale. Blue-green is a future optimization.
- **Automatic upgrade scheduling.** Admin triggers manually (or CI/CD calls the API). Scheduled overnight upgrades are a follow-up.
- **Per-workspace version pinning.** All managed workspaces run the same version. Version pinning per user is a future multi-tenant feature.
- **Database migration tooling.** Drizzle Kit + `instrumentation.ts` handle schema evolution. This brief orchestrates the restart; the workspace handles its own migration.

## Inputs

1. `docs/briefs/090-automated-workspace-provisioning.md` — `managedWorkspaces` table, admin auth, Fly Machines API
2. `docs/adrs/025-centralized-network-service.md` — Network → Workspace boundary
3. `src/engine/workspace-provisioner.ts` (from Brief 090) — Fly API client, workspace registry
4. `packages/web/instrumentation.ts` — schema sync runs on every server startup
5. `packages/web/app/api/healthz/route.ts` — deep health check (`?deep=true`)

## Constraints

- **MUST implement a circuit breaker.** If N consecutive workspaces fail health check after upgrade, STOP the upgrade. Do not continue destroying the fleet. Default: stop after 2 consecutive failures (configurable via `--max-failures`).
- **MUST support canary mode.** Upgrade a single workspace first, wait for deep health check, then proceed to the rest only if canary passes. Canary is the default behavior.
- **MUST support rollback.** `pnpm cli network rollback` reverts all upgraded workspaces to the previous image. Rollback is itself a rolling operation with circuit breaker protection.
- **MUST preserve workspace data across upgrades.** Only the Fly Machine image changes. The Fly Volume (SQLite data) is never touched during an upgrade.
- **MUST record upgrade history.** Each upgrade attempt is logged in an `upgradeHistory` table with per-workspace results. Admin can audit what happened.
- **MUST verify schema migration success.** Deep health check (`/healthz?deep=true`) after restart confirms DB is connected and accessible. If `instrumentation.ts` schema sync fails, the workspace will be degraded (health check fails), triggering the circuit breaker.
- **MUST verify deep health prerequisites.** Deep health checks skip seed/network verification when `DITTO_NETWORK_URL` is not set (backward compat for self-hosted). Managed workspaces always have this var injected by the provisioner (Brief 090). The upgrader MUST verify the env var is present in the Machine config before accepting a deep health pass — if it's missing (misconfiguration), the workspace should be flagged as degraded, not silently passed with a shallow check.
- **MUST alert on failures.** When a workspace upgrade fails or the circuit breaker trips, log a structured error and (optionally) notify via webhook. The webhook URL is configurable via `DITTO_ALERT_WEBHOOK_URL` env var (Slack incoming webhook, Discord webhook, or any HTTP endpoint accepting POST with JSON body).
- **MUST NOT upgrade deprovisioned workspaces.** Only `healthy` and `degraded` workspaces are upgrade targets. `degraded` workspaces are included because an upgrade might fix the issue.
- **MUST be idempotent.** If an upgrade is interrupted (admin kills the process), re-running the same upgrade command resumes from where it left off (skips already-upgraded workspaces).
- **MUST report progress in real-time.** CLI shows each workspace upgrade result as it happens, not just a final summary.
- **MUST rate-limit upgrade triggers.** Only one upgrade can be in progress at a time. Concurrent upgrade requests return 409 Conflict. This prevents a compromised admin token or race condition from triggering multiple simultaneous fleet upgrades.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Rolling update with health verification | Kubernetes rolling update strategy | pattern | Industry standard for fleet updates |
| Circuit breaker pattern | Michael Nygard, "Release It!" | pattern | Prevents cascading failure across fleet |
| Canary deployment | Google SRE Book, ch. 8 | pattern | Test on one instance before fleet-wide rollout |
| Upgrade history / audit trail | Fly.io release history, Heroku releases | pattern | Know what changed and when |
| Webhook alerting | PagerDuty/OpsGenie integration pattern | pattern | Notify on failure without building notification infra |
| Saga with compensating actions | Microservices Patterns (Richardson) | pattern | Rollback is a compensating saga over the upgrade saga |

## Architecture

### Upgrade Flow (with circuit breaker)

```
Admin triggers: pnpm cli network upgrade --image ditto:v0.2.0
                        ↓
  1. Validate: image ref exists (Fly API: get image metadata)
  2. Load fleet: all managed workspaces with status in (healthy, degraded)
  3. Record upgrade attempt in upgradeHistory (status: in_progress)
                        ↓
  4. CANARY PHASE:
     a. Pick one workspace (prefer the admin's own workspace if it exists).
        EDGE CASE: If the fleet has only one workspace, the canary IS the
        entire fleet. The fleet phase has zero workspaces and completes
        immediately. This is correct — a single-workspace fleet is
        effectively canary-only, which is the safest possible behavior.
     b. Record pre-upgrade image ref (for rollback)
     c. Update Machine image → restart → wait for deep health check (120s timeout)
     d. If canary PASSES: print "Canary passed. Proceeding with fleet upgrade."
     e. If canary FAILS:
        - Rollback canary to previous image
        - Print "Canary failed. Upgrade aborted. Canary rolled back."
        - Record upgrade attempt as failed
        - Send alert webhook
        - EXIT
                        ↓
  5. FLEET PHASE (remaining workspaces, one at a time):
     For each workspace:
       a. Record pre-upgrade image ref
       b. Update Machine image → restart
       c. Wait for deep health check (120s timeout, 5s polling interval)
       d. If PASSES:
          - Update managedWorkspaces record (imageRef, currentVersion, status: healthy)
          - Print "  <userId>: upgraded → v0.2.0 ✓"
          - Reset consecutive failure counter
       e. If FAILS:
          - Rollback this workspace to previous image
          - Update managedWorkspaces record (status: degraded, errorLog)
          - Print "  <userId>: FAILED, rolled back ✗"
          - Increment consecutive failure counter
          - Send alert webhook
          - If consecutive failures >= max_failures (default 2):
              CIRCUIT BREAKER TRIPPED
              - Print "Circuit breaker: 2 consecutive failures. Upgrade halted."
              - Print "Upgraded: N, Failed: M, Remaining: R"
              - Record upgrade attempt as circuit_breaker_tripped
              - Send alert webhook (circuit breaker summary)
              - EXIT (remaining workspaces untouched)
                        ↓
  6. COMPLETE:
     - Print "Fleet upgrade complete: N upgraded, M failed, 0 remaining"
     - Record upgrade attempt as completed (or partial if any failures)
     - Send alert webhook (summary)
```

### Rollback Flow

```
Admin triggers: pnpm cli network rollback
                        ↓
  1. Find the most recent upgrade attempt
  2. For each workspace that was upgraded in that attempt:
     a. Read pre-upgrade image ref from upgrade history
     b. Update Machine image → restart → wait for health check
     c. Same circuit breaker protection as upgrade (rollback is itself a rolling operation)
  3. Record rollback in upgrade history
```

Rollback reverts to the **per-workspace previous image**, not a single global image. This handles the case where different workspaces were at different versions before the upgrade (e.g., after a partial upgrade + circuit breaker trip).

**Design decision: rollback includes the canary.** Even if the canary passed its health check, `rollback` reverts ALL workspaces that were upgraded in the attempt — including the canary. Rationale: a canary can pass the health check but still have a latent issue discovered later (e.g., a memory leak that only manifests after hours, or a bug in a rarely-used code path). Rollback means "put everything back to how it was before." If the admin wants to keep the canary at the new version, they can re-upgrade it individually after rollback.

### Upgrade History Data Model

```sql
CREATE TABLE upgrade_history (
  id TEXT PRIMARY KEY,
  image_ref TEXT NOT NULL,               -- Target image for this upgrade
  previous_image_ref TEXT,               -- What most workspaces were running before
  status TEXT NOT NULL DEFAULT 'in_progress',
  -- in_progress | completed | partial | failed | circuit_breaker_tripped | rolled_back
  total_workspaces INTEGER NOT NULL,     -- How many were targeted
  upgraded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,  -- Already at target version
  canary_workspace_id TEXT,              -- Which workspace was the canary
  canary_result TEXT,                    -- passed | failed
  circuit_breaker_at INTEGER,            -- When tripped (null if not tripped)
  error_summary TEXT,                    -- Aggregated error info
  triggered_by TEXT NOT NULL,            -- 'cli' | 'api' | 'ci'
  started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  completed_at INTEGER
);

CREATE TABLE upgrade_workspace_results (
  id TEXT PRIMARY KEY,
  upgrade_id TEXT NOT NULL REFERENCES upgrade_history(id),
  workspace_id TEXT NOT NULL REFERENCES managed_workspaces(id),
  previous_image_ref TEXT NOT NULL,      -- For rollback
  result TEXT NOT NULL,                  -- upgraded | failed | rolled_back | skipped
  health_check_result TEXT,              -- ok | liveness_failed | readiness_failed | timeout
  error_log TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
```

### Alerting

The alert webhook sends a POST request with a JSON body:

```json
{
  "type": "upgrade_failure" | "circuit_breaker_tripped" | "upgrade_complete",
  "upgradeId": "...",
  "imageRef": "ditto:v0.2.0",
  "summary": "Circuit breaker tripped after 2 consecutive failures. 3/5 upgraded, 2 failed, 0 remaining.",
  "failedWorkspaces": [
    { "userId": "user1", "error": "health check timeout after 120s" }
  ],
  "timestamp": "2026-04-06T12:00:00Z"
}
```

If `DITTO_ALERT_WEBHOOK_URL` is not set, alerts are logged to stdout only (structured JSON). No silent failures.

### Version Detection

`current_version` is read from the workspace's `/healthz?deep=true` response, which is extended to include a `version` field:

```json
{
  "status": "ok",
  "db": "connected",
  "seed": "imported",
  "network": "reachable",
  "version": "0.2.0"
}
```

The version comes from `package.json` at startup, cached in memory. This is authoritative — no parsing image tags or guessing.

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: Add `upgradeHistory` and `upgradeWorkspaceResults` tables |
| `src/test-utils.ts` | Modify: Add both tables to createTables |
| `src/engine/workspace-upgrader.ts` | Create: `upgradeFleet(imageRef, options)` — canary + rolling + circuit breaker, `rollbackFleet()` — revert to pre-upgrade images, `getUpgradeHistory()` — audit trail |
| `src/engine/workspace-upgrader.test.ts` | Create: Tests for rolling upgrade, circuit breaker trip, canary failure abort, rollback, idempotent resume, per-workspace rollback with different previous images |
| `src/engine/workspace-alerts.ts` | Create: `sendAlert(webhookUrl, payload)` — POST JSON to configured webhook, with retry (3 attempts, exponential backoff). Falls back to structured console.log if no webhook configured. |
| `packages/web/app/api/healthz/route.ts` | Modify: Add `version` field to response (from package.json) |
| `packages/web/app/api/v1/network/admin/upgrade/route.ts` | Create: `POST` — trigger fleet upgrade (admin-only). Body: `{ imageRef, maxFailures? }` |
| `packages/web/app/api/v1/network/admin/rollback/route.ts` | Create: `POST` — trigger fleet rollback (admin-only) |
| `packages/web/app/api/v1/network/admin/upgrades/route.ts` | Create: `GET` — upgrade history (admin-only) |
| `src/cli/commands/network.ts` | Modify: Add `upgrade --image <ref> [--max-failures N]`, `rollback`, `upgrades` (history) subcommands |
| `.env.example` | Modify: Add `DITTO_ALERT_WEBHOOK_URL` (optional) |

## User Experience

- **Jobs affected:** None directly — infrastructure. Users experience: they open their workspace one morning and new features are there. No action required.
- **Primitives involved:** None.
- **Process-owner perspective:** Admin runs `pnpm cli network upgrade --image ditto:v0.2.0`. Watches canary pass, then fleet rolls out. If something goes wrong, circuit breaker stops it. Admin runs `pnpm cli network rollback` to revert. Users are never aware of the operation.
- **Designer input:** Not invoked.

## Acceptance Criteria

1. [ ] `upgradeHistory` table exists with all columns (id, imageRef, previousImageRef, status, totalWorkspaces, upgradedCount, failedCount, skippedCount, canaryWorkspaceId, canaryResult, circuitBreakerAt, errorSummary, triggeredBy, startedAt, completedAt).
2. [ ] `upgradeWorkspaceResults` table exists with all columns (id, upgradeId, workspaceId, previousImageRef, result, healthCheckResult, errorLog, durationMs, createdAt).
3. [ ] `pnpm cli network upgrade --image <ref>` performs canary-first rolling upgrade.
4. [ ] **Canary phase:** First workspace is upgraded and deep-health-checked before proceeding. If canary fails, the canary is rolled back and the upgrade aborts. No other workspaces are touched.
5. [ ] **Circuit breaker:** After 2 consecutive failures (default), upgrade halts. Remaining workspaces are not touched. Failed workspaces are rolled back to their previous image.
6. [ ] **`--max-failures N`**: Configurable circuit breaker threshold.
7. [ ] **Per-workspace rollback on failure:** Each failed workspace is individually rolled back to its pre-upgrade image immediately, not left in a broken state.
8. [ ] **Data preserved:** SQLite volume is untouched during upgrade. Verified: memories and people exist after upgrade.
9. [ ] **Schema migration:** `instrumentation.ts` runs schema sync on restart. Deep health check verifies DB is accessible post-migration.
10. [ ] `pnpm cli network rollback` reverts the most recent upgrade. Each workspace is reverted to its own pre-upgrade image (not a single global image). Rollback itself has circuit breaker protection.
11. [ ] **Idempotent resume:** If an upgrade is interrupted, re-running skips already-upgraded workspaces (checks current image ref vs target).
12. [ ] **Real-time progress:** CLI prints each workspace result as it completes, not just a final summary.
13. [ ] `pnpm cli network upgrades` shows upgrade history with per-attempt status and workspace-level results.
14. [ ] **Alerting:** When `DITTO_ALERT_WEBHOOK_URL` is set, failures and circuit breaker trips send a POST with JSON payload. When not set, structured JSON is logged to stdout.
15. [ ] `/healthz?deep=true` response includes `version` field from package.json.
16. [ ] `POST /api/v1/network/admin/upgrade` triggers upgrade via API (admin-only). Returns upgrade ID for status polling.
17. [ ] `POST /api/v1/network/admin/rollback` triggers rollback via API (admin-only).
18. [ ] `GET /api/v1/network/admin/upgrades` returns upgrade history (admin-only).
19. [ ] Self-hosted workspaces are completely unaffected by upgrade commands.
20. [ ] Deprovisioned workspaces are excluded from upgrades.

## Review Process

1. Spawn reviewer with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: Does the circuit breaker actually prevent fleet-wide failure? Is per-workspace rollback correct (not overwriting with a stale global image)? Is the canary phase a real gate (blocks fleet phase, not just a log line)? Are the upgrade history tables sufficient for audit? Is the alert payload actionable?
3. Present work + review findings to human

## Smoke Test

```bash
# === Canary Failure (simulated) ===

# Upgrade with a bad image (simulate: image that fails health check)
pnpm cli network upgrade --image ditto:broken
# Expect:
# "Starting upgrade to ditto:broken (5 workspaces)"
# "Canary phase: upgrading founder..."
# "  founder: health check FAILED (readiness_failed)"
# "  founder: rolled back to ditto:v0.1.0"
# "Canary failed. Upgrade aborted."
# "Alert sent: canary failure"

# Verify canary was rolled back
pnpm cli network fleet
# Expect: founder status=healthy, version=v0.1.0 (unchanged)

# === Successful Upgrade ===

pnpm cli network upgrade --image ditto:v0.2.0
# Expect:
# "Starting upgrade to ditto:v0.2.0 (5 workspaces)"
# "Canary phase: upgrading founder..."
# "  founder: upgraded → v0.2.0 ✓ (1.2s)"
# "Canary passed. Proceeding with fleet upgrade."
# "  user1: upgraded → v0.2.0 ✓ (0.9s)"
# "  user2: upgraded → v0.2.0 ✓ (1.1s)"
# "  user3: upgraded → v0.2.0 ✓ (0.8s)"
# "  user4: upgraded → v0.2.0 ✓ (1.0s)"
# "Fleet upgrade complete: 5 upgraded, 0 failed"

# === Circuit Breaker ===

pnpm cli network upgrade --image ditto:v0.3.0-bad --max-failures 2
# Expect:
# "Starting upgrade to ditto:v0.3.0-bad (5 workspaces)"
# "Canary phase: upgrading founder..."
# "  founder: upgraded → v0.3.0-bad ✓"  (canary passes but...)
# "Canary passed. Proceeding with fleet upgrade."
# "  user1: FAILED, rolled back to v0.2.0 ✗"
# "  user2: FAILED, rolled back to v0.2.0 ✗"
# "CIRCUIT BREAKER: 2 consecutive failures. Upgrade halted."
# "Upgraded: 1 (founder), Failed: 2, Remaining: 2 (user3, user4)"
# "Alert sent: circuit breaker tripped"

# === Rollback ===

pnpm cli network rollback
# Expect:
# "Rolling back upgrade <id> (1 workspace to revert)"
# "  founder: rolled back to v0.2.0 ✓"
# "Rollback complete: 1 reverted"

# === Upgrade History ===

pnpm cli network upgrades
# Expect:
# UPGRADE HISTORY (3 attempts)
#   <id1>  ditto:broken      failed (canary)     0/5 upgraded    2026-04-06 12:00
#   <id2>  ditto:v0.2.0      completed           5/5 upgraded    2026-04-06 12:05
#   <id3>  ditto:v0.3.0-bad  circuit_breaker     1/5 upgraded    2026-04-06 12:10
```

## After Completion

1. Update `docs/state.md` with fleet upgrade capability
2. Update `docs/roadmap.md` — Phase 15 complete
3. Test full cycle: provision → upgrade → rollback → re-upgrade
4. Consider: CI/CD integration (GitHub Action on release → `POST /api/v1/network/admin/upgrade`)
5. Consider: scheduled overnight upgrades (cron trigger)
6. Consider: blue-green deployment for zero-downtime upgrades at scale
7. Phase retrospective: provisioning + upgrades together
