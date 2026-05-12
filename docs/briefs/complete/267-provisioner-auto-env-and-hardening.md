# Brief 267: Provisioner Auto-Env and Boot Hardening

**Date:** 2026-05-12
**Status:** complete (2026-05-12, Builder implementation + mandatory review loop PASS + Documenter closeout. Focused Brief 267 Vitest passed: 9 files / 76 tests. Root, web, and core type-check passed. Full `pnpm test` still fails repo-wide from existing baseline drift; `pnpm test:e2e` hung and was killed.)
**Depends on:** Brief 100, Brief 153, ADR-025, Insight-229, Insight-230
**Unlocks:** Reliable self-service workspace graduation after network/schema outages; safer fleet upgrades that rely on deep health

## Goal

- **Roadmap phase:** Phase 15: Managed Workspace Infrastructure
- **Capabilities:** Managed workspace provisioning, workspace seed import, boot health checks, provisioning rollback semantics, magic-link workspace access

## Context

Provisioning the `launchpath` workspace exposed two coupled failure modes:

1. The Network Service's SQLite migration path failed mid-sequence, boot continued, and `/api/v1/network/seed` served 500s while `/healthz` still looked healthy. This is captured in Insight-229.
2. The workspace caught the failed seed fetch and booted, but did not write a first-boot sentinel. `/healthz?deep=true` kept reporting `seed: not_imported`, so the provisioner waited until timeout and rolled the workspace back. This is captured in Insight-230.

The same audit also surfaced a provisioning env gap: managed workspaces are created with partially optional env. `WORKSPACE_OWNER_EMAIL` is not derived by the admin API/CLI path, `DITTO_WORKSPACE_USER_ID` does not exist, `SESSION_SECRET` is not provisioned even though workspace auth uses it, and the volume mount path and `DATABASE_PATH` are not asserted as one invariant. These gaps make the secure managed path fragile: a workspace can be created without auth, without a stable user id for seed-failure sentinel writes, or with a database path that does not point at the Railway volume.

## Objective

After this brief, the provisioner creates a managed workspace with a complete, centrally-tested env set; workspace boot records that seed was attempted even when the Network is unavailable; provisioning health accepts a bootstrapped workspace without requiring Network reachability; and strict monitoring health still catches schema drift, missing seed, and Network outage.

## Non-Goals

- No new provisioning provider. Railway stays the managed workspace substrate.
- No fleet-wide upgrade algorithm changes beyond using the existing health endpoint semantics.
- No Postgres host change and no new database migration unless the builder finds an existing schema cannot represent the needed token-use marker.
- No public profile, share, intro, or Brief 254 surface work.
- No general observability platform. Logs and health response fields are enough for this brief.
- No AgentMail credential injection into managed workspaces. Login email delivery remains Network-owned unless a later auth brief moves it.

## Inputs

1. `docs/insights/229-drizzle-migrate-silent-partial-apply.md` - schema failure and health blind spot.
2. `docs/insights/archived/230-seed-fetch-failure-must-still-write-sentinel.md` - first-boot path C and lenient provisioning health.
3. `src/engine/workspace-provisioner.ts` - Railway saga, env injection, deep-health polling.
4. `packages/web/instrumentation.ts` - schema sync and first-boot seed import catch path.
5. `src/engine/network-seed.ts` - seed import, first-boot detection, sentinel helper location.
6. `packages/web/app/api/healthz/route.ts` - liveness/deep health response contract.
7. `src/db/index.ts` and `src/db/network-db.ts` - workspace and network schema migration boot paths.
8. `src/engine/workspace-welcome.ts`, `src/engine/magic-link.ts`, `packages/web/app/login/auth/route.ts`, `packages/web/middleware.ts` - workspace login link/auth seam.
9. `docs/deployment/auto-provision.md` and `.env.example` - operator docs for managed workspace env.
10. `docs/adrs/025-centralized-network-service.md` - workspace seed contract.
11. `docs/adrs/018-runtime-deployment.md` - managed cloud/self-hosted deployment contract.
12. `docs/adrs/036-database-tier-strategy.md` and `docs/adrs/048-network-postgres-migration-supabase.md` - workspace SQLite permanence and network Postgres split.

## Constraints

- Managed workspace env assembly must be one pure helper with unit tests. No second hand-built env object in admin route, CLI, or tests.
- A managed workspace must not be provisioned with auth disabled. If the target `networkUsers` row is missing an email, admin API/CLI must fail before Railway resources are created.
- The workspace database path and Railway volume mount path must be one constant pair. Default target is `mountPath=/data` and `DATABASE_PATH=/data/ditto.db`; tests must fail if they diverge.
- `DITTO_WORKSPACE_USER_ID` is required on managed workspaces. It is the canonical seed/sentinel scope id when seed fetch fails before payload data is available.
- `SESSION_SECRET` is the canonical workspace cookie HMAC secret. Keep `NETWORK_AUTH_SECRET` only as a backwards-compatible alias/audit artifact unless the builder proves a narrower change is safer.
- Workspace bootstrap login must preserve the existing magic-link security floor: scoped to the provisioned workspace, expires no later than 24h, cannot be replayed after successful consumption, validates audience/user/email, and fails closed when required secrets are absent. If the builder uses a signed bootstrap token rather than pre-seeding a DB row, the workspace must record a local token-use marker on first successful POST before setting the session cookie.
- Do not log raw `DITTO_NETWORK_TOKEN`, `SESSION_SECRET`, `NETWORK_AUTH_SECRET`, bootstrap login tokens, or full seed payloads.
- Workspace seed failure must not create an infinite first-boot loop. Path C writes the same sentinel semantics as empty-success path B.
- Strict health and provisioning health are different contracts. Monitoring uses strict deep health. The provisioner uses bootstrap/provisioning health.
- Schema migration failure is deployment failure for the workspace tier. Do not continue to serve a workspace whose local schema sync failed.
- Network DB unavailability on the central Network Service may still degrade Network routes to 503 per Brief 263; this brief must not undo that route-level behavior. However, strict Network Service health must still report 503 when the Network Postgres migration state is unavailable or behind the `drizzle/network` journal head.
- Provisioner, admin API, and CLI code that reads or writes `networkUsers`, `networkTokens`, or `managedWorkspaces` must use the Network tier (`networkDb` + `@ditto/core/db/network`). Do not continue using workspace SQLite `src/db` schema imports for Network-tier tables.
- No new user-process side-effecting tool is introduced. Existing provisioning and welcome notification side effects remain admin/infrastructure operations outside process harness execution, consistent with Brief 153's Insight-180 exemption.
- Self-hosted/local workspaces without `DITTO_NETWORK_URL` remain unaffected.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| Saga rollback with env/resource tracking | Existing `workspace-provisioner.ts`, Brief 090/100 | adopt | Current provisioning shape is already a tested saga; hardening should preserve it. |
| Liveness/readiness split plus bootstrap readiness variant | Kubernetes probe pattern via Brief 090 | pattern | Separates process-up, strict dependency readiness, and provisioner bootstrap readiness. |
| Canary/deep-health gate | Brief 091 fleet upgrade pattern | adopt | Existing Ditto pattern for gating managed workspace rollout on health. |
| Workspace seed export/import | `docs/research/centralized-network-service-deployment.md` Track 3 | pattern | Seed critical user context at provision time, lazy-load later history. |
| Schema integrity as boot gate | Insight-229 | Original to Ditto | Runtime migration failure must not fail open on persistent volumes. |
| Seed-attempt sentinel on failure | Insight-230 | Original to Ditto | The sentinel records "attempted", not "successfully imported rows". |
| Workspace-scoped one-time bootstrap login | Existing Brief 143/153 auth seam | adapt | Network owns welcome delivery; workspace owns session cookie validation without losing single-use/expiry guarantees. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/workspace-provisioner.ts` | Modify: add a pure `buildManagedWorkspaceEnv(...)` helper and constants for volume mount/db path. Resolve target `networkUsers` row before Railway side effects via `networkDb` and `@ditto/core/db/network`, require email for managed workspaces, inject `DITTO_WORKSPACE_USER_ID`, `WORKSPACE_OWNER_EMAIL`, `SESSION_SECRET`, `NETWORK_AUTH_SECRET`, `DITTO_DEPLOYMENT=workspace`, `DITTO_NETWORK_URL`, `DITTO_NETWORK_TOKEN`, and `DATABASE_PATH`. Create/know the public domain before env injection if needed so `NEXT_PUBLIC_APP_URL` can be set without a second deploy. Return a workspace-scoped bootstrap login URL or enough non-secret data for `sendWorkspaceWelcome` to use one. Writes to `networkUsers`, `networkTokens`, and `managedWorkspaces` stay on the Network Postgres tier; workspace SQLite must not be used for these tables. |
| `src/engine/workspace-provisioner.test.ts` | Modify: cover pre-side-effect user/email validation, env completeness, no secret logging, mount/db-path parity, `DITTO_WORKSPACE_USER_ID`, `SESSION_SECRET`, bootstrap health URL polling, and Network-tier DB imports/queries for `networkUsers`/`managedWorkspaces`. |
| `packages/web/app/api/v1/network/admin/provision/route.ts` | Modify: stop accepting caller-supplied owner env; pass only `userId`/`imageRef`, let the provisioner resolve the network user, and return structured 400 for missing user/email vs 500 for infrastructure failure. |
| `src/cli/commands/network.ts` | Modify: same resolution behavior as admin API; operator sees a clear error before any Railway resource is created when the network user/email is missing. |
| `src/engine/network-seed.ts` | Modify: add sentinel helpers for seed-attempt state, including a failure-path helper that uses `DITTO_WORKSPACE_USER_ID` when no seed payload is available. `isFirstBoot()` and health checks must treat the sentinel as "seed attempted" without pretending rows were imported. |
| `src/engine/network-seed.test.ts` | Modify: add path A/B/C coverage: successful import, empty-success sentinel, fetch failure sentinel with `DITTO_WORKSPACE_USER_ID`, and no-op behavior when self-hosted env is absent. |
| `packages/web/instrumentation.ts` | Modify: rethrow local workspace schema sync failure; call the seed-failure sentinel helper in the seed import catch before logging/continuing. Invoke/check Network schema sync in central Network Service mode, while keeping transient Network DB connectivity failures non-fatal for process boot so routes can surface structured 503s. |
| `packages/web/app/api/healthz/route.ts` | Modify: add strict `deep=true` response fields for `schema`, `seed`, and `network`, and add a provisioning/bootstrap mode such as `?deep=true&mode=provisioning` that returns 200 when local DB/schema are OK and seed has been attempted via rows or sentinel, even if Network is unreachable. In central Network Service mode, strict deep health must also check Network Postgres connectivity/schema readiness against the `drizzle/network` journal and return 503 when it is unavailable, behind, or migration sync failed. |
| `packages/web/app/api/healthz/route.test.ts` or equivalent | Create/modify: route tests for strict vs provisioning health, workspace schema-behind/degraded responses, Network Postgres schema-behind/degraded responses, sentinel accepted in provisioning mode, and Network unreachable still 503 in strict workspace mode. |
| `src/db/index.ts` | Modify: expose a lightweight schema health/readiness helper used by `/healthz` to compare applied SQLite migration state with the workspace journal head. Migration exceptions from `ensureSchema()` must remain thrown to instrumentation. |
| `src/db/network-db.ts` | Modify: expose a lightweight Network schema health/readiness helper used by `/healthz` to compare applied Postgres migration state with the `drizzle/network` journal head. Keep Network DB migration failures logged and surfaced to routes/strict health as 503; do not make central Network boot crash solely because Supabase is temporarily unavailable. |
| `src/engine/workspace-welcome.ts` and `src/engine/magic-link.ts` | Modify: make the welcome email use the provisioned workspace URL and a workspace-valid bootstrap login token/link. Do not generate a network-local DB magic link for a workspace-local auth route. The bootstrap token must include at least user id, owner email, workspace/audience, expiry, and a nonce/jti; it must be signed with the canonical workspace secret and contain no raw secrets. |
| `packages/web/app/login/auth/route.ts` and `packages/web/middleware.ts` | Modify only as needed to validate the workspace-valid bootstrap token against `SESSION_SECRET`/`NETWORK_AUTH_SECRET`, atomically record/consume its nonce in workspace-local storage, and then set the existing HMAC session cookie. Existing DB-backed login links must keep working for local/workspace-originated request-link flows. |
| `.env.example` | Modify: document managed-workspace env as provisioner-owned and add `DITTO_WORKSPACE_USER_ID`; clarify `SESSION_SECRET` vs legacy `NETWORK_AUTH_SECRET`. |
| `docs/deployment/auto-provision.md` | Modify: update saga steps, env list, health modes, troubleshooting, and login-link semantics. |
| `docs/adrs/025-centralized-network-service.md` | Modify: amend §6 workspace seed with paths A/B/C and the sentinel contract. |

## User Experience

- **Jobs affected:** Orient, Delegate.
- **Primitives involved:** Existing email welcome link and health/admin surfaces only. No new user-facing ContentBlock.
- **Process-owner perspective:** A user replies yes to a workspace suggestion. Alex can say the workspace is ready only after the workspace has booted, migrated its local DB, attempted seed, and can accept the user's login link. If the Network is temporarily down during first boot, the workspace still opens with a clear bootstrapped state instead of being rolled back as unusable.
- **Interaction states:** Success = welcome email link lands in the provisioned workspace. Partial = workspace opens but Network is temporarily unreachable; strict fleet health shows degraded, provisioning health passes. Failure = provisioning rolls back before sending a welcome link.
- **Designer input:** Not invoked - infrastructure hardening with no new UI.

## Acceptance Criteria

1. [ ] `buildManagedWorkspaceEnv(...)` is the only env assembly path for managed workspace provisioning, is unit-tested, includes `DITTO_WORKSPACE_USER_ID`, `WORKSPACE_OWNER_EMAIL`, `SESSION_SECRET`, `NETWORK_AUTH_SECRET`, `DITTO_DEPLOYMENT=workspace`, `DITTO_NETWORK_URL`, `DITTO_NETWORK_TOKEN`, and `DATABASE_PATH=/data/ditto.db`, and asserts Railway volume mount path plus `DATABASE_PATH` as the same persistent volume target.
2. [ ] Admin API and CLI fail before Railway side effects when `networkUsers.id` does not exist or has no email, and provisioner/admin API/CLI use `networkDb` + `@ditto/core/db/network` for all `networkUsers`, `networkTokens`, and `managedWorkspaces` reads/writes. Tests or a targeted static assertion fail if these paths import workspace SQLite `src/db` schema for Network-tier tables.
3. [ ] Provisioner/welcome flow sends a login link that targets the provisioned workspace URL and validates in that workspace, not the Network Service's `/login/auth`. Bootstrap login tokens preserve the existing magic-link security floor: explicit expiry no later than 24h, workspace/audience binding, user id + email binding, cryptographic signature with `SESSION_SECRET` primary and `NETWORK_AUTH_SECRET` legacy fallback only where needed, and replay protection via an atomic workspace-local consume marker. Tests cover success, expired token, second use/replay, wrong workspace/audience, wrong secret, missing secret, wrong user/email, and existing workspace-originated DB-backed magic links.
4. [ ] Seed paths A/B/C are covered: successful seed with memories imports rows, successful empty seed writes a sentinel, and failed seed fetch writes a sentinel scoped to `DITTO_WORKSPACE_USER_ID`; all three end first-boot, and path C logs without raw seed/token data.
5. [ ] `/healthz?deep=true` strict workspace mode returns 503 when local schema is behind, seed is not imported/attempted, or Network is unreachable.
6. [ ] `/healthz?deep=true` strict Network Service mode returns 503 when Network Postgres is unreachable, the applied Network migration state is behind the `drizzle/network` journal head, or Network schema sync failed during boot.
7. [ ] `/healthz?deep=true&mode=provisioning` returns 200 when local DB/schema are OK and seed is imported or sentinel-attempted, even if Network is unreachable; it still returns 503 for local DB/schema failure and is not used to mask Network Service Postgres schema failure.
8. [ ] `waitForDeepHealth()` in the provisioner polls the provisioning-mode health URL and verifies the response body mode/status, not just `res.ok`.
9. [ ] Workspace-tier `ensureSchema()` failure is fatal during boot; instrumentation rethrows after logging. Network-tier connection failure behavior remains route-level 503 and is not accidentally made fatal for public Network boot.
10. [ ] Health response includes enough non-secret fields to troubleshoot (`schema`, `seed`, `network`, `mode`, `version`) without exposing tokens or owner email.
11. [ ] Tests cover provisioner env, admin/CLI preflight, seed path C, strict/provisioning health split, fatal workspace schema sync, Network Postgres schema health, Network-tier provisioner DB usage, and workspace-valid welcome login security cases.
12. [ ] `pnpm run type-check` passes.
13. [ ] Targeted tests pass: `src/engine/workspace-provisioner.test.ts`, `src/engine/network-seed.test.ts`, health route tests, magic-link/login auth tests, and any instrumentation/schema-health tests added by the builder.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`.
2. Review agent checks:
   - Managed workspace auth cannot be disabled by missing optional env.
   - Bootstrap login links preserve expiry, audience, and replay protection.
   - Network-local and workspace-local magic-link storage are not confused.
   - Provisioner/admin/CLI Network-tier queries do not use workspace SQLite schema.
   - Provisioning-mode health cannot mask local schema corruption.
   - Strict health still catches workspace Network outage, seed absence, and Network Service Postgres schema drift.
   - No secret/token values are logged or returned.
   - Self-hosted workspaces remain unaffected.
3. Present work + review findings to human for approval.

## Smoke Test

```bash
pnpm run type-check

pnpm vitest run \
  src/engine/workspace-provisioner.test.ts \
  src/engine/network-seed.test.ts \
  packages/web/app/api/healthz/route.test.ts \
  src/engine/magic-link.test.ts \
  packages/web/app/login/auth/route.test.ts

# Manual managed-workspace smoke against a disposable test user:
# 1. Create a network user with email.
# 2. Provision via admin API or CLI.
# 3. Confirm Railway env contains the managed env set, without exposing secrets in logs.
# 4. Confirm the workspace health endpoint:
#    - /healthz?deep=true&mode=provisioning returns 200 after seed attempt.
#    - /healthz?deep=true returns 200 when Network is reachable, 503 when Network is intentionally blocked.
# 5. Open the welcome login link and confirm it authenticates to the workspace URL.
# 6. Re-open the same welcome login link and confirm it is rejected as used/invalid.
```

## After Completion

1. Update `docs/state.md` with Brief 267 implementation/review result.
2. Update `docs/roadmap.md` Phase 15 row notes to mention hardening of provisioning health/env/login.
3. Mark Insight-230 absorbed if path C + provisioning health are fully fixed.
4. Mark Insight-229 partially absorbed if schema health + fatal workspace schema sync land; leave active if table-recreate migration defensiveness remains unaddressed.
5. Run the mandatory fresh-context review before asking for human approval.

Reference docs checked: `docs/personas.md`, `docs/human-layer.md`, `docs/architecture.md`, `docs/landscape.md`, `docs/adrs/018-runtime-deployment.md`, `docs/adrs/025-centralized-network-service.md`, `docs/adrs/036-database-tier-strategy.md`, `docs/adrs/048-network-postgres-migration-supabase.md`, `docs/briefs/complete/090-automated-workspace-provisioning.md`, `docs/briefs/complete/100-railway-workspace-provisioning.md`, `docs/briefs/complete/153-workspace-provisioning-wiring.md`, `docs/deployment/auto-provision.md`, `docs/insights/229-drizzle-migrate-silent-partial-apply.md`, `docs/insights/archived/230-seed-fetch-failure-must-still-write-sentinel.md`.
