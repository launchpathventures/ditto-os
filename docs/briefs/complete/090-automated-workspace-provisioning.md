# Brief 090: Automated Workspace Provisioning

**Date:** 2026-04-06
**Status:** draft
**Depends on:** Brief 089 (Workspace Seed + SSE Bridge), ADR-025 (Centralized Network Service), ADR-018 Track A (Managed Cloud)
**Unlocks:** Brief 091 (Fleet Upgrades), self-service Layer 2 → Layer 3 graduation, multi-user scale

## Goal

- **Roadmap phase:** Phase 15: Managed Workspace Infrastructure
- **Capabilities:** Admin auth with role-based tokens, one-command workspace provisioning via Fly.io Machines API, automatic seed import, provisioning rollback on failure, workspace deprovisioning, deep health checks, fleet registry

## Context

Briefs 086-089 deliver the Network Service, API, seed, and SSE bridge. But provisioning a workspace is still manual: admin deploys a container, creates a token, hands it to the user. This blocks real user onboarding — the founder must manually operate every workspace.

ADR-018 Track A envisions "sign up → first process running in 2 minutes." ADR-025 establishes the Network as the front door. The missing piece is the automation between intake and running workspace.

### Phase transition acknowledgment

ADR-025 section 8 describes the MVP as "same server, same SQLite database, same process." This brief moves past that phase into split deployment: the Network Service runs centrally, each workspace runs as its own Fly Machine. This is the natural next step after the API boundary (Briefs 088-089) proved the separation works.

ADR-018 Track A specifies "PostgreSQL per tenant" for the managed cloud at scale. For early managed workspaces, we use SQLite on a persistent Fly volume — the same proven stack. PostgreSQL migration is a future concern (Turso embedded replicas or per-tenant Neon) tracked separately, not in this brief's scope. **ADR-018 should be amended with a note that early Track A uses SQLite, matching the dogfood stack.**

## Objective

After this brief: an admin runs one command to provision a workspace for a Layer 2 user. The workspace auto-seeds, auto-registers, and the user receives an email with their URL. If provisioning fails at any step, all resources are cleaned up — no orphaned infrastructure.

## Non-Goals

- **Fleet-wide image upgrades.** That's Brief 091.
- **Self-hosted workspace management.** Self-hosters manage their own infrastructure.
- **Auto-provisioning trigger.** Admin-initiated for now. Automatic Layer 2 → Layer 3 graduation trigger is a follow-up.
- **Multi-region distribution.** Single region (same as Network) for MVP.
- **Custom workspace configs per user.** All workspaces use the same image.
- **PostgreSQL migration.** SQLite on volume for now. PostgreSQL is a separate ADR amendment.
- **Provisioning as a Ditto meta-process.** Eventually provisioning should run ON the engine as a process through the harness (architecture.md: "core orchestration capabilities are meta-processes"). For now it's imperative code. Tracked as a roadmap item for when the engine is mature enough to self-host this operation.

## Inputs

1. `docs/adrs/025-centralized-network-service.md` — Network → Workspace boundary, section 6 (seed), section 4 (API)
2. `docs/adrs/018-runtime-deployment.md` — Track A managed cloud vision, Track B1 dogfood stack
3. `docs/research/centralized-network-service-deployment.md` — Fly.io Machines API patterns
4. `docs/briefs/089-workspace-seed-and-sse.md` — seed import and first-boot detection
5. `src/engine/network-api-auth.ts` — existing token generation (to be extended with admin role)
6. `src/engine/network-seed.ts` — existing seed export
7. `packages/web/app/api/v1/network/register/route.ts` — workspace registration endpoint
8. `packages/web/instrumentation.ts` — existing first-boot seed detection

## Constraints

- **MUST extend token auth with admin role.** Admin tokens are distinguished from user tokens by an `isAdmin` flag on the `networkTokens` table. Admin routes reject non-admin tokens with 403.
- **MUST use Fly.io Machines API** for workspace provisioning. No SSH, no manual server setup.
- **MUST auto-generate and inject credentials** (`DITTO_NETWORK_URL`, `DITTO_NETWORK_TOKEN`, `DATABASE_PATH`) into the new workspace — the user never touches infrastructure.
- **MUST trigger seed import automatically** on first boot (existing `instrumentation.ts` detection).
- **MUST roll back on failure** — if any provisioning step fails, all previously created resources (Fly Machine, Fly Volume, network token, DB record) are cleaned up. No orphaned infrastructure.
- **MUST be idempotent** — re-provisioning a user who already has a healthy workspace returns the existing URL.
- **MUST preserve workspace data (SQLite volume)** — the volume is a separate Fly resource from the Machine.
- **MUST implement deep health checks** — beyond `/healthz` (process up + DB connected), verify seed was imported and Network is reachable.
- **MUST register provisioned workspaces** in a `managedWorkspaces` table on the Network.
- **MUST support deprovisioning** — clean removal of Machine, Volume, token revocation, DB record update.
- **MUST scope the Fly API token.** Use a Fly org-scoped token with deploy permissions only, not a personal token with full account access. Document required Fly token scopes.
- **MUST enforce DITTO_NETWORK_URL on managed workspaces.** Provisioning always injects this env var. Deep health checks rely on it to verify Network reachability and seed import. If this var is absent, deep checks degrade to shallow — which would mask failures on managed workspaces. The provisioner MUST verify this var is present in the Machine config before marking it healthy.
- **MUST rate-limit admin endpoints.** Admin provision/deprovision endpoints are throttled to 10 requests per minute per token. Prevents a compromised admin token from rapidly provisioning machines and burning Fly.io budget. Implemented as a simple in-memory counter per token, reset every 60 seconds.
- **Self-hosted workspaces are completely unaffected.**

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Fly.io Machines API for programmatic provisioning | Fly.io docs (fly.io/docs/machines) | pattern | On-demand container creation via API, supports volumes, env injection |
| Fly.io Volumes API for persistent storage | Fly.io docs (fly.io/docs/volumes) | pattern | Volume lifecycle independent of Machine lifecycle |
| Compensating transaction / saga pattern | Microservices Patterns (Chris Richardson) | pattern | Multi-step provisioning with rollback on failure |
| Kubernetes liveness + readiness probes | Kubernetes docs | pattern | Shallow (process up) vs deep (dependencies reachable) health checks |
| Temporal namespace registry | Temporal (temporal.io) | pattern | Central record of all managed workspaces with status |
| RBAC on API tokens | Industry standard (GitHub PATs, Fly tokens) | pattern | Admin flag on tokens, checked in middleware |

## Architecture

### Admin Auth Model

The `networkTokens` table has an `isAdmin` boolean column (default `false`), added during Brief 088/090 code prep. The auth middleware (`network-api-auth.ts`) is already updated:

- `validateToken(authHeader)` → returns `{ userId, isAdmin }` (O(1) hash lookup, not O(n) scan)
- `requireAdmin(auth)` → returns null if `isAdmin` is false
- `authenticateAdminRequest(request)` in `packages/web/lib/network-auth.ts` → returns 401 for missing token, 403 for non-admin

**Bootstrap:** The first admin token is created via CLI with an explicit `--admin` flag:
```bash
pnpm cli network token create --user-id founder --admin
```

Admin routes (`/api/v1/network/admin/*`) call `requireAdmin()`. Regular Network API routes (`/api/v1/network/*`) are unaffected — they accept any valid token.

**Scope:** Admin tokens can provision, deprovision, and view fleet status. There is no finer-grained scope for MVP. Scope refinement (provision-only, read-only) is a follow-up.

### Provisioning Flow (with rollback)

```
Admin triggers: pnpm cli network provision --user-id <id>
                        ↓
  1. Check idempotency: if managedWorkspaces record exists and status=healthy,
     return existing URL. If status=degraded or provisioning (stale), clean up first.
                        ↓
  2. Create Fly Volume (ditto-data-<userId>, 1GB, same region as Network)
     → on failure: abort, no cleanup needed (nothing created yet)
                        ↓
  3. Generate network token for user (isAdmin=false)
     → on failure: destroy volume, abort
                        ↓
  4. Create Fly Machine with:
       - image: current Ditto image ref (from DITTO_IMAGE_REF env or latest)
       - volume: mounted at /app/data
       - env: DITTO_NETWORK_URL, DITTO_NETWORK_TOKEN, DATABASE_PATH=/app/data/ditto.db
       - auto_destroy: false (we manage lifecycle)
       - size: shared-cpu-1x, 512MB
     → on failure: revoke token, destroy volume, abort
                        ↓
  5. Start Machine, wait for deep health check (up to 120 seconds, 5s intervals):
       - GET /healthz → 200 (process up, DB connected)
       - GET /api/v1/network/status → 200 (seed imported, Network reachable)
     → on failure after 120s: stop machine, destroy machine, destroy volume,
       revoke token, abort. Log full error.
                        ↓
  6. Record in managedWorkspaces table (status: healthy)
     → on failure: stop machine, destroy machine, destroy volume,
       revoke token, abort
                        ↓
  7. Workspace auto-imports seed on first boot (instrumentation.ts — already built)
  8. Workspace calls POST /api/v1/network/register (already built)
                        ↓
  9. Deliver workspace URL to user via Alex email (or return URL to admin CLI)
```

**Every step has a defined rollback path.** The provisioner tracks created resources in a local array and cleans them up in reverse order on any failure.

### Deep Health Check

Two-tier health check replaces the shallow `/healthz`-only approach:

| Check | Endpoint | What it proves | Timeout |
|-------|----------|---------------|---------|
| **Liveness** | `GET /healthz` | Process is up, DB is connected | 5s |
| **Readiness** | `GET /healthz?deep=true` | Liveness + seed imported (self-scoped memories exist) + Network API reachable (fetch from DITTO_NETWORK_URL/healthz) | 15s |

The `/healthz` route is extended to accept a `?deep=true` query parameter. When deep:
1. Check DB connectivity (existing)
2. Check self-scoped memories exist (seed was imported — skip if `DITTO_NETWORK_URL` not set)
3. Check Network Service is reachable (fetch `DITTO_NETWORK_URL/healthz` — skip if not set)

Provisioning uses deep health check. Fleet monitoring (Brief 091) uses liveness by default, deep on demand.

### Deprovisioning Flow

```
Admin triggers: pnpm cli network deprovision --user-id <id>
                        ↓
  1. Look up managedWorkspaces record
  2. Stop Fly Machine (graceful: SIGTERM, 30s timeout)
  3. Destroy Fly Machine
  4. Destroy Fly Volume (WARNING: this deletes workspace data permanently)
  5. Revoke network token
  6. Update managedWorkspaces record (status: deprovisioned)
```

Deprovisioning requires `--confirm` flag (destructive operation). The CLI warns: "This will permanently delete all workspace data for <userId>. Use --confirm to proceed."

### Workspace Lifecycle States

```
provisioning → healthy → deprovisioned
                  ↓
              degraded
                  ↓
    (admin investigates, re-provisions or deprovisions)
```

States:
- **provisioning**: Machine being created, not yet healthy
- **healthy**: Liveness check passing, workspace operational
- **degraded**: Liveness check failing. Admin notified. No automatic action — admin investigates and either re-provisions (deprovision + provision) or fixes manually.
- **deprovisioned**: Machine and volume destroyed, token revoked. Record kept for audit. Terminal state.

No "suspended" state for MVP. Either the workspace is running or it's been removed. Suspension (stop machine, keep volume) is a future cost-optimization feature.

### Data Model

```sql
CREATE TABLE managed_workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,          -- One workspace per user
  machine_id TEXT NOT NULL,               -- Fly Machine ID
  volume_id TEXT NOT NULL,                -- Fly Volume ID (separate resource)
  workspace_url TEXT NOT NULL,            -- Public URL
  region TEXT NOT NULL DEFAULT 'syd',
  image_ref TEXT NOT NULL,                -- Docker image reference (tag or digest)
  current_version TEXT,                   -- Ditto version (read from package.json in image)
  status TEXT NOT NULL DEFAULT 'provisioning',
  -- provisioning | healthy | degraded | deprovisioned
  last_health_check_at INTEGER,
  last_health_status TEXT,                -- 'ok' | 'liveness_failed' | 'readiness_failed'
  error_log TEXT,                         -- Last error message (for degraded state)
  token_id TEXT NOT NULL,                 -- Reference to network_tokens.id
  deprovisioned_at INTEGER,               -- When deprovisioned (for audit)
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
```

### Cost Estimate (Fly.io)

| Resource | Per workspace | Monthly (1 user) | Monthly (10 users) |
|----------|--------------|-------------------|---------------------|
| Machine (shared-cpu-1x, 512MB) | ~$3.19/mo | $3.19 | $31.90 |
| Volume (1GB) | ~$0.15/mo | $0.15 | $1.50 |
| Outbound transfer (1GB included) | $0 | $0 | $0 |
| **Total** | **~$3.34/mo** | **$3.34** | **$33.40** |

At 100 users: ~$334/mo. This informs the pricing model from ADR-018 (Pro tier at $7-15/seat covers infrastructure + margin).

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: Add `managedWorkspaces` table, add `isAdmin` column to `networkTokens` |
| `src/test-utils.ts` | Modify: Add `managed_workspaces` table, add `is_admin` column to `network_tokens` |
| `src/engine/network-api-auth.ts` | Modify: Extend `validateToken()` to return `{ userId, isAdmin }`, add `requireAdmin()` helper, extend `createToken()` with `isAdmin` parameter |
| `src/cli/commands/network.ts` | Modify: Add `--admin` flag to `token create`, add `provision`, `deprovision`, `fleet` subcommands |
| `src/engine/workspace-provisioner.ts` | Create: `provisionWorkspace(userId, imageRef)` with full rollback, `deprovisionWorkspace(userId)` with confirmation, `getWorkspaceStatus(userId)` |
| `src/engine/workspace-provisioner.test.ts` | Create: Tests for provisioning flow, rollback on failure, idempotency, deprovisioning |
| `packages/web/app/api/healthz/route.ts` | Modify: Add `?deep=true` support (check seed imported + Network reachable) |
| `packages/web/app/api/v1/network/admin/provision/route.ts` | Create: `POST` — trigger workspace provisioning (admin-only) |
| `packages/web/app/api/v1/network/admin/deprovision/route.ts` | Create: `POST` — trigger workspace deprovisioning (admin-only) |
| `packages/web/app/api/v1/network/admin/fleet/route.ts` | Create: `GET` — fleet status (admin-only) |
| `packages/web/lib/network-auth.ts` | Modify: Add `authenticateAdminRequest()` helper |
| `.env.example` | Modify: Add `FLY_API_TOKEN` (org-scoped, deploy permissions only), `FLY_ORG`, `FLY_REGION`, `DITTO_IMAGE_REF` |

## User Experience

- **Jobs affected:** None directly — infrastructure automation. Enables the onboarding job: user finishes Layer 2 intake → workspace appears → Self greets them with continuity.
- **Primitives involved:** None — provisioning concern.
- **Process-owner perspective:** Admin runs `pnpm cli network provision --user-id <id>`. User receives email from Alex: "Your workspace is ready at [url]. I've already set things up based on our conversations — I remember everything we've discussed." Zero infrastructure exposure to the end user.
- **Designer input:** Not invoked. The workspace URL delivery email uses existing persona voice.

## Acceptance Criteria

1. [ ] `managedWorkspaces` table exists in schema with all columns (id, userId, machineId, volumeId, workspaceUrl, region, imageRef, currentVersion, status, lastHealthCheckAt, lastHealthStatus, errorLog, tokenId, deprovisionedAt, createdAt, updatedAt).
2. [ ] `networkTokens` table has `isAdmin` boolean column (default false).
3. [ ] `pnpm cli network token create --user-id founder --admin` creates an admin token. `pnpm cli network token create --user-id user1` creates a regular token.
4. [ ] `validateToken()` returns `{ userId, isAdmin }`. Admin routes return 403 for non-admin tokens.
5. [ ] `pnpm cli network provision --user-id <id>` provisions a new workspace: creates Volume, creates token, creates Machine with env vars, waits for deep health check, records in DB, returns URL.
6. [ ] **Rollback on failure:** If health check fails after 120s, provisioner destroys Machine, destroys Volume, revokes token, removes DB record. No orphaned resources. Verified with a test that simulates health check failure.
7. [ ] **Idempotent:** Re-provisioning a user with a healthy workspace returns existing URL without creating duplicates.
8. [ ] **Stale recovery:** Re-provisioning a user with a `degraded` or stale `provisioning` record cleans up the old resources first, then provisions fresh.
9. [ ] Provisioned workspace auto-imports seed on first boot (verified: self-scoped memories exist).
10. [ ] Provisioned workspace auto-registers with Network (`POST /api/v1/network/register` called).
11. [ ] `GET /healthz?deep=true` checks DB + seed imported + Network reachable. Returns `{"status":"ok","db":"connected","seed":"imported","network":"reachable"}` when all pass.
12. [ ] `pnpm cli network deprovision --user-id <id> --confirm` stops Machine, destroys Machine, destroys Volume, revokes token, marks record as deprovisioned. Without `--confirm`, prints warning and exits.
13. [ ] `pnpm cli network fleet` shows all managed workspaces with status, version, URL, last health check.
14. [ ] `GET /api/v1/network/admin/fleet` returns fleet status JSON. Requires admin token.
15. [ ] `POST /api/v1/network/admin/provision` and `POST /api/v1/network/admin/deprovision` require admin token. Return 403 for non-admin tokens, 401 for missing tokens.
16. [ ] Self-hosted workspaces (no `managedWorkspaces` entry) are completely unaffected.
17. [ ] `FLY_API_TOKEN` is documented as requiring org-scoped deploy permissions only (not personal full-access token).

## Review Process

1. Spawn reviewer with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: Is the Fly Machines API usage correct (create volume, create machine, mount volume, inject env)? Does the rollback sequence actually clean up every created resource? Is the deep health check meaningful? Is admin auth properly separated from user auth? Is deprovisioning destructive enough to warrant the `--confirm` gate?
3. Present work + review findings to human

## Smoke Test

```bash
# === Admin Auth ===

# Create admin token
pnpm cli network token create --user-id founder --admin
# Expect: Token: dnt_abc... (admin: true)

# Create regular token
pnpm cli network token create --user-id user1
# Expect: Token: dnt_def... (admin: false)

# Admin route with regular token
curl -X POST -H "Authorization: Bearer dnt_def..." \
  http://localhost:3000/api/v1/network/admin/fleet
# Expect: 403 Forbidden

# Admin route with admin token
curl -H "Authorization: Bearer dnt_abc..." \
  http://localhost:3000/api/v1/network/admin/fleet
# Expect: 200 with fleet JSON

# === Provisioning ===

# Provision workspace
pnpm cli network provision --user-id user1
# Expect: "Creating volume... done"
#         "Creating token... done"
#         "Creating machine... done"
#         "Waiting for health check... ok (seed imported, network reachable)"
#         "Workspace provisioned: https://ditto-ws-user1.fly.dev"

# Verify deep health
curl "https://ditto-ws-user1.fly.dev/healthz?deep=true"
# Expect: {"status":"ok","db":"connected","seed":"imported","network":"reachable"}

# Verify idempotent
pnpm cli network provision --user-id user1
# Expect: "Workspace already exists: https://ditto-ws-user1.fly.dev (status: healthy)"

# === Fleet Status ===

pnpm cli network fleet
# Expect:
# MANAGED WORKSPACES (1)
#   user1    https://ditto-ws-user1.fly.dev    healthy    v0.1.0    last check: 2026-04-06 12:00

# === Deprovisioning ===

# Without --confirm
pnpm cli network deprovision --user-id user1
# Expect: "WARNING: This will permanently delete all workspace data for user1."
#         "Use --confirm to proceed."

# With --confirm
pnpm cli network deprovision --user-id user1 --confirm
# Expect: "Stopping machine... done"
#         "Destroying machine... done"
#         "Destroying volume... done"
#         "Revoking token... done"
#         "Workspace deprovisioned: user1"
```

## After Completion

1. Update `docs/state.md` with provisioning pipeline status
2. Update `docs/roadmap.md` — Phase 15 milestone started
3. Amend ADR-018 with a note: "Early Track A managed workspaces use SQLite on Fly Volumes, matching the dogfood stack. PostgreSQL migration tracked separately."
4. Test full end-to-end: intake → provision → seed → Self greets user with continuity
5. Proceed to Brief 091 (Fleet Upgrades)
6. Future: auto-provisioning trigger (Network decides when user is ready, no admin CLI)
7. Future: model provisioning as a Ditto meta-process running through the harness
