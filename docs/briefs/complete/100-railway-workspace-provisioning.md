# Brief 100: Migrate Workspace Provisioning from Fly.io to Railway

**Date:** 2026-04-08
**Status:** draft
**Depends on:** Brief 090 (workspace provisioner architecture), Brief 091 (fleet upgrader architecture)
**Unlocks:** Production workspace provisioning on Railway, consistent deployment platform, magic link workspace auth (separate brief — provisioner injects `NETWORK_AUTH_SECRET`)

## Goal

- **Roadmap phase:** Phase 15: Managed Workspace Infrastructure
- **Capabilities:** Workspace provisioning, fleet upgrades, deprovisioning — all on Railway instead of Fly.io

## Context

Briefs 090 and 091 built workspace provisioning and fleet upgrades against the Fly.io Machines API. The deployment platform has since moved to Railway. The provisioner code (`workspace-provisioner.ts`) and upgrader code (`workspace-upgrader.ts`) reference Fly.io-specific concepts (Machines, Fly volumes, `fly.dev` URLs) that need to be replaced with Railway equivalents.

The good news: both modules use dependency-injected client interfaces (`FlyClient`, `FlyMachinesClient`). The migration is primarily replacing these implementations — the saga/rollback logic, health checking, circuit breaker, and DB record management are platform-agnostic and stay unchanged.

### Railway API Key Facts

- **API type:** GraphQL at `https://backboard.railway.com/graphql/v2`
- **Auth:** Bearer token (workspace-scoped recommended)
- **No official JS/TS SDK** — raw GraphQL via `fetch` or `graphql-request`
- **Services** replace Machines (create, deploy, delete)
- **Volumes** work similarly (create, mount, one per service, no replicas with volumes)
- **Domains** must be explicitly created (`serviceDomainCreate`) — no auto-URL
- **Env vars** via `variableCollectionUpsert` with `skipDeploys: true` then manual deploy
- **Health checks** via `healthcheckPath` on service instance — Railway handles zero-downtime deploys
- **Deploy status:** `BUILDING` → `DEPLOYING` → `ACTIVE` (or `FAILED`/`CRASHED`)
- **Volume constraints:** One per service, can't use with replicas, 3K read/write IOPS, $0.15/GB/month

### What Can Stay (Platform-Agnostic)

- Saga/compensating rollback pattern in `provisionWorkspace()`
- `ProvisionerConfig` / `ProvisionerConfigBase` types (renamed from Fly-specific)
- Rate limiting (`checkRateLimit`)
- Health check polling (`waitForDeepHealth`)
- `managedWorkspaces` table schema (add `serviceId` column, keep `machineId` as dead column)
- `ProvisionResult` interface (add `serviceId`, keep `machineId` for backward compat)
- All test structure (mock the new interface the same way)

### What Changes (Platform-Specific)

- `FlyClient` interface → `RailwayClient` interface
- `createFlyClient()` → `createRailwayClient()` (GraphQL instead of REST)
- `FlyMachinesClient` → `RailwayServiceClient` (for upgrader)
- Fly Machine lifecycle (create machine → start → wait) → Railway service lifecycle (create service → create volume → set vars → deploy → create domain → poll status)
- `machineId` → `serviceId` throughout
- `fly.dev` URLs → `up.railway.app` URLs
- Fly-specific env vars (`FLY_API_TOKEN`, `FLY_ORG`, `FLY_REGION`) → Railway env vars (`RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`)

## Non-Goals

- Multi-region workspace distribution — single region for now (Railway handles this per-project)
- Custom domains for workspaces — Railway-generated `*.up.railway.app` domains only
- Horizontal scaling of workspace instances — volumes prevent replicas (same constraint as Fly.io)
- Railway MCP server integration — direct GraphQL is simpler and more stable than the MCP wrapper

## Inputs

1. `src/engine/workspace-provisioner.ts` — Current Fly.io provisioner (migrate)
2. `src/engine/workspace-provisioner.test.ts` — Current tests (adapt mocks)
3. `src/engine/workspace-upgrader.ts` — Current Fly.io fleet upgrader (migrate)
4. `src/engine/workspace-upgrader.test.ts` — Current tests (adapt mocks)
5. `src/db/schema.ts` — `managedWorkspaces` table (rename `machineId`)
6. Railway API docs — GraphQL schema for services, volumes, variables, domains, deployments

## Constraints

- **Keep the injectable client pattern** — `RailwayClient` interface injected for testability, same as `FlyClient` was
- **Railway API is GraphQL** — no SDK exists. Use raw `fetch` with GraphQL queries. Keep queries as template literals in the client module, not spread across the codebase.
- **Volume + replicas are mutually exclusive on Railway** — same constraint as Fly.io, no architectural change needed
- **`variableCollectionUpsert` with `skipDeploys: true`** — set all env vars first, then trigger deploy once. Prevents redundant deploys.
- **`serviceDomainCreate` required** — Railway services don't get a public URL by default. Must be created after service creation.
- **Health check via `healthcheckPath`** — Railway polls the healthcheck after deploy and only switches traffic when 200. Our deep health check (`/healthz?deep=true`) works the same way.
- **Schema migration needed** — add `service_id` column to `managedWorkspaces` (not rename — SQLite). Add `railway_environment_id` column.
- **Admin API routes reference Fly types** — admin provision/deprovision/fleet routes need updated types
- **Magic link auth secret** — provisioner must generate a `NETWORK_AUTH_SECRET` (random 32-byte hex) and inject it as a workspace env var during provisioning. This is the signing key for magic link tokens. The auth flow itself (magic link generation, workspace middleware, session cookies) is a separate brief — but the secret must be provisioned here so the workspace is auth-ready from day one.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| GraphQL client pattern | Railway API docs | pattern | No official SDK, raw GraphQL is the standard approach |
| Injectable client | workspace-provisioner.ts `FlyClient` | existing | Same DI pattern, just different implementation |
| Saga rollback | workspace-provisioner.ts | existing | Platform-agnostic, stays unchanged |
| Service lifecycle | Railway API manage-services docs | pattern | create → volume → vars → deploy → domain → poll |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/workspace-provisioner.ts` | **Major rewrite:** Replace `FlyClient` interface with `RailwayClient`. Replace `createFlyClient()` with `createRailwayClient()` (GraphQL). Update `provisionWorkspace()` saga steps: service create → volume create → vars upsert → deploy → domain create → poll status. Update `deprovisionWorkspace()`: service delete (Railway cascades volume deletion). Rename `machineId` → `serviceId` throughout. Update URL pattern to `*.up.railway.app`. |
| `src/engine/workspace-upgrader.ts` | **Moderate rewrite:** Replace `FlyMachinesClient` with `RailwayServiceClient`. Update `updateMachine` → update service image + redeploy. Replace `restartMachine` → `serviceInstanceRedeploy`. Replace `waitForMachineState` → poll `deployment` query for status `ACTIVE`. Rename types. |
| `src/engine/workspace-provisioner.test.ts` | **Adapt mocks:** Replace `FlyClient` mock with `RailwayClient` mock. Same test structure, same saga scenarios, just different interface. |
| `src/engine/workspace-upgrader.test.ts` | **Adapt mocks:** Replace `FlyMachinesClient` mock with `RailwayServiceClient` mock. Same canary/circuit-breaker/rollback scenarios. |
| `src/db/schema.ts` | **Modify:** Add `service_id` column to `managedWorkspaces` (new, not rename). Add `railway_environment_id` column. Add `auth_secret_hash` column (SHA-256 of the `NETWORK_AUTH_SECRET` injected during provisioning — for auditing, never the raw secret). |
| `src/db/index.ts` + `src/test-utils.ts` | **Modify:** Sync schema SQL for renamed column + new column. |
| `packages/web/app/api/v1/network/admin/provision/route.ts` | **Modify:** Update to use `RailwayClient` / new config types. |
| `packages/web/app/api/v1/network/admin/deprovision/route.ts` | **Modify:** Update to use `RailwayClient` / new config types. |
| `packages/web/app/api/v1/network/admin/fleet/route.ts` | **Modify:** Update response types (`serviceId` not `machineId`). |
| `packages/web/app/api/v1/network/admin/upgrade/route.ts` | **Modify:** Update to use `RailwayServiceClient`. |
| `packages/web/app/api/v1/network/admin/rollback/route.ts` | **Modify:** Update to use `RailwayServiceClient`. |
| `packages/web/app/api/v1/network/admin/upgrades/route.ts` | **Modify:** Update to use `RailwayServiceClient` (fleet upgrade listing). |
| `packages/web/app/api/v1/network/admin/upgrades/[id]/route.ts` | **Modify:** Update to use `RailwayServiceClient` (individual upgrade status). |
| `src/cli/commands/network.ts` | **Modify:** Replace `FLY_API_TOKEN`/`FLY_ORG`/`FLY_REGION` env vars with `RAILWAY_API_TOKEN`/`RAILWAY_PROJECT_ID`. Replace `createFlyClient()` with `createRailwayClient()`. Replace `createFlyMachinesClient()` with `createRailwayServiceClient()`. Affects: `provisionCommand`, `deprovisionCommand`, `upgradeCommand`, `rollbackCommand`, `upgradesCommand`. |
| `.env.example` | **Modify:** Replace `FLY_API_TOKEN` / `FLY_ORG` / `FLY_REGION` / `DITTO_IMAGE_REF` with `RAILWAY_API_TOKEN` / `RAILWAY_PROJECT_ID` / `DITTO_IMAGE_REF`. |

## Acceptance Criteria (15 AC)

1. [ ] `RailwayClient` interface defined with: `createService`, `deleteService`, `createVolume`, `deleteVolume`, `upsertVariables`, `deployService`, `createDomain`, `getDeploymentStatus`
2. [ ] `createRailwayClient(apiToken, projectId)` implemented with GraphQL queries via `fetch` — no external GraphQL library dependency
3. [ ] `provisionWorkspace()` saga: create service → create volume (mount `/data`) → upsert env vars (with `skipDeploys: true`, including `DITTO_NETWORK_URL`, `DITTO_NETWORK_TOKEN`, `NETWORK_AUTH_SECRET` — secret generated as 32-byte random hex via `crypto.randomBytes(32).toString("hex")`) → deploy → create domain → poll deployment status until `ACTIVE` → record in DB. Full rollback on any step failure.
4. [ ] `deprovisionWorkspace()`: delete service (Railway cascades volume deletion) → update DB record
5. [ ] `managedWorkspaces` schema migrated: `service_id` column added (NOT a rename — SQLite can't rename). Migration in `ensureSchema()`: `ALTER TABLE managed_workspaces ADD COLUMN service_id TEXT; UPDATE managed_workspaces SET service_id = machine_id WHERE service_id IS NULL; ALTER TABLE managed_workspaces ADD COLUMN railway_environment_id TEXT;` Drizzle schema updated to use `service_id`. `machine_id` column left in place (dead column, no breakage).
6. [ ] Workspace URLs use `*.up.railway.app` pattern (from `serviceDomainCreate` response)
7. [ ] Health check: two-phase. First, poll `getDeploymentStatus()` until Railway reports `ACTIVE` (Railway's own healthcheck via `healthcheckPath` passed). Then, poll `/healthz?deep=true` on the workspace URL to verify application-level health (DB, seed, network connectivity). Both must pass.
8. [ ] `RailwayServiceClient` interface defined with: `getService(serviceId)`, `updateServiceImage(serviceId, environmentId, imageRef)`, `redeployService(serviceId, environmentId)`, `getDeploymentStatus(deploymentId)`. Fleet upgrader replaces `FlyMachinesClient` with `RailwayServiceClient`. Update image → redeploy → poll status. Canary, circuit breaker, per-workspace rollback all preserved.
9. [ ] All existing provisioner tests pass with `RailwayClient` mock (same scenarios: idempotency, stale recovery, rollback on failure, rate limiting)
10. [ ] All existing upgrader tests pass with `RailwayServiceClient` mock (same scenarios: canary, circuit breaker, rollback, concurrent guard)
11. [ ] Admin API routes (`provision`, `deprovision`, `fleet`, `upgrade`, `rollback`) updated to use Railway types
12. [ ] `.env.example` updated: `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID` replace Fly.io vars
13. [ ] No references to Fly.io remain in `workspace-provisioner.ts`, `workspace-upgrader.ts`, ALL admin routes (including `upgrades/` and `upgrades/[id]/`), OR `src/cli/commands/network.ts` (grep-verified: `grep -ri "fly\|FLY_" src/engine/workspace-* src/cli/commands/network.ts packages/web/app/api/v1/network/admin/`)
14. [ ] `NETWORK_AUTH_SECRET` generated per workspace (32-byte random hex) and injected as env var during provisioning. Stored in `managedWorkspaces` record for reference (new column `authSecretHash` — SHA-256 hash, never the raw secret)
15. [ ] `pnpm run type-check` passes, `pnpm test` passes

## User Experience

- **Admin perspective:** Same admin commands and API routes, just talking to Railway instead of Fly.io. No UX change.
- **End user perspective:** Workspace URL changes from `ditto-ws-{userId}.fly.dev` to `ditto-ws-{userId}.up.railway.app`. No functional difference.
- **Designer input:** Not invoked — no user-facing UI changes.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - `RailwayClient` interface covers all provisioning lifecycle operations
   - Saga rollback logic preserved (platform-agnostic)
   - No Fly.io references remain
   - GraphQL queries are correct for Railway's schema
   - Volume constraints handled (one per service, no replicas)
   - Test coverage maintained (same scenarios, different mocks)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Provision a test workspace
curl -X POST http://localhost:3000/api/v1/network/admin/provision \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"userId": "test-user"}'
# Expected: Service created on Railway, volume attached, env vars set,
#           deployed, domain created, health check passes
# Expected: Response includes workspaceUrl: "https://ditto-ws-test-user.up.railway.app"

# Check fleet status
curl http://localhost:3000/api/v1/network/admin/fleet \
  -H "Authorization: Bearer <admin-token>"
# Expected: Lists workspace with serviceId (not machineId), Railway URL

# Deprovision
curl -X POST http://localhost:3000/api/v1/network/admin/deprovision \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"userId": "test-user"}'
# Expected: Service deleted on Railway, DB record updated
```

## After Completion

1. Update `docs/state.md` — workspace provisioning migrated to Railway
2. Update `.env.example` — Railway vars documented
3. Archive or note in Brief 090/091 that implementation has been migrated from Fly.io to Railway
4. Verify production Railway workspaces (if any exist) — update their records
