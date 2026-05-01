# Auto-Provisioning Workspaces from ditto.partners

Companion to `railway.md`. The Network Service at `ditto.partners` can spin up per-user Railway workspaces end-to-end via its admin endpoint — no manual Railway clicks per user. Saga handles service + volume + env vars + deploy + two-phase health check + rollback on failure, then sends the user a magic-link welcome email.

References: Brief 090 (foundation), Brief 100 (Railway migration), Brief 153 (acceptance-flow wiring), ADR-025 §6 (workspace seed).

---

## One-time setup

These steps unblock auto-provisioning. Do them once.

### 1. Publish the Ditto image to GHCR

`.github/workflows/docker-publish.yml` does this automatically on every push to `main` and on tag pushes (`v*`). Trigger the first publish by pushing this commit to `main`. After ~5 minutes, verify:

```
https://github.com/launchpathventures/ditto-os/pkgs/container/ditto-os
```

The image will be at `ghcr.io/launchpathventures/ditto-os:latest`.

### 2. Make the GHCR package public

Default visibility on a freshly-published GHCR package is private — Railway can't pull it without registry credentials. Either:

- **(Easier)** Mark it public: Package settings → Change visibility → Public. One-time click. Railway pulls without credentials.
- **(Harder)** Keep it private and set Railway image registry credentials. More steps; not covered here.

### 3. Configure ditto.partners with provisioning env vars

On the Railway service hosting ditto.partners, set:

```bash
RAILWAY_API_TOKEN=<railway personal token with project-write permission>
RAILWAY_PROJECT_ID=<the Railway project ID where workspaces will land>
DITTO_IMAGE_REF=ghcr.io/launchpathventures/ditto-os:latest
ADMIN_USERNAME=admin                                       # any string; just don't leave it blank
ADMIN_PASSWORD=<strong password>                           # generate with `openssl rand -base64 32`
DITTO_NETWORK_URL=https://ditto.partners                   # so provisioned workspaces can call back to the Network
```

Get the Railway API token from `https://railway.com/account/tokens` (workspace-scoped recommended). Get the Project ID from the Railway dashboard URL (`https://railway.com/project/<id>`).

The provisioner deposits each new workspace as a service inside the project pointed at by `RAILWAY_PROJECT_ID`. Same project as ditto.partners is fine to start; you can move workspaces to a separate project later by changing this var.

### 4. Get an admin Bearer token

The admin endpoints don't accept the password directly — you POST username/password to `/admin/login` and get back a `dnt_*` Bearer token, which you then use for everything else.

```bash
ADMIN_TOKEN=$(curl -sX POST https://ditto.partners/api/v1/network/admin/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"<your-password>\"}" \
  | jq -r .token)
echo "Admin token: $ADMIN_TOKEN"
```

(Store it in a shell var, password manager, or just paste it into the `/admin/fleet` UI which handles login + token exchange for you.)

Alternative — mint the token via CLI on the ditto.partners server:

```bash
pnpm cli network token create --user-id admin --admin
```

### 5. Verify the configuration

```bash
curl -X GET https://ditto.partners/api/v1/network/admin/fleet \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expect a JSON response listing currently-provisioned workspaces (empty array if none yet) with health status. If you get a 500 with "Server misconfigured", an env var is missing. If you get 401, the token is wrong/expired — re-run step 4.

---

## Provision a workspace

Three triggers, same saga underneath.

### Option A — curl (fastest, for ops)

```bash
curl -X POST https://ditto.partners/api/v1/network/admin/provision \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "tim"}'
```

Response (success):

```json
{
  "success": true,
  "status": "created",
  "workspaceUrl": "https://ditto-tim-xyz.up.railway.app",
  "serviceId": "abc-123",
  "volumeId": "vol-456",
  "tokenId": "tok-789"
}
```

`status: "existing"` means the user already had a healthy workspace — same `workspaceUrl` returned (idempotent).

### Option B — CLI (if you have shell access to ditto.partners)

```bash
pnpm run cli network provision --user-id tim
# or, with explicit image override:
pnpm run cli network provision --user-id tim --image-ref ghcr.io/launchpathventures/ditto-os:v1.0.0
```

Output streams progress messages from the saga.

### Option C — Email acceptance (production user flow)

A network user reaches the workspace-suggestion stage via the front-door chat or nurture flow. They receive an email like "Want me to set up a workspace for you?". They reply "yes" / "yep" / "go for it". The inbound-email handler detects the affirmative (`isWorkspaceAcceptanceSignal`), confirms the matching `suggestionThreadId`, fires `triggerWorkspaceProvisioning(userId)` (fire-and-forget), and sends an immediate ack email. The saga runs in background; on success a welcome email goes out with the magic link.

This is the path real prospects walk after Phase 1 of `railway.md` is operational.

---

## What happens during provisioning

The saga (`src/engine/workspace-provisioner.ts`) executes:

1. **Idempotency check** — if the user already has a healthy workspace, return its URL (no-op)
2. **Stale recovery** — if a prior degraded/half-provisioned workspace exists, clean up first
3. **Resolve Railway environment ID** for the configured project
4. **Create the Railway service** (real GraphQL call)
5. **Create a `/data` volume** mounted on the service
6. **Generate `DITTO_NETWORK_TOKEN`** for the new workspace (stored in `networkUsers` table; lets the workspace authenticate back to the Network)
7. **Generate `NETWORK_AUTH_SECRET`** (32-byte hex; magic-link auth secret; injected as env var)
8. **Inject env vars** on the new service: `DITTO_NETWORK_URL`, `DITTO_NETWORK_TOKEN`, `DATABASE_PATH=/data/ditto.db`, `NETWORK_AUTH_SECRET`, optional `WORKSPACE_OWNER_EMAIL` (if known from `networkUsers`)
9. **Deploy** the service
10. **Create a public domain** (`*.up.railway.app`)
11. **Two-phase health check** — poll Railway deployment status until `ACTIVE`, then poll `/healthz?deep=true` on the new domain until `{ status: "ok" }`
12. **Record in `managedWorkspaces` DB** (Network's table tracking the fleet)
13. **Update `networkUsers.status` → `"workspace"`** and link the workspace ID

If any step fails: full rollback (delete service, delete DB record, revoke token). No orphans.

---

## Use the new workspace

After successful provisioning the user receives a welcome email with a magic link. Clicking it sets the workspace's session cookie via `NETWORK_AUTH_SECRET` HMAC verification → workspace renders → Day Zero intro → operational.

Workspace seed (memories, person records, plans from prior network interaction) is fetched from `GET https://ditto.partners/api/v1/network/seed` on the workspace's first boot — Self knows the user from the start; no cold start.

---

## Operational commands

```bash
# Fleet status (all workspaces, health)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://ditto.partners/api/v1/network/admin/fleet

# Deprovision (DESTRUCTIVE — kills service + volume + revokes token)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "tim"}' \
  https://ditto.partners/api/v1/network/admin/deprovision

# Fleet-wide image upgrade (canary-first; circuit-breaks after 2 consecutive failures)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imageRef": "ghcr.io/launchpathventures/ditto-os:v1.1.0"}' \
  https://ditto.partners/api/v1/network/admin/upgrade

# Rollback (reverts ALL workspaces upgraded by the last upgrade call)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://ditto.partners/api/v1/network/admin/rollback
```

CLI equivalents live in `src/cli/commands/network.ts` (`provision`, `deprovision`, `fleet`, `upgrade`, `rollback`).

---

## Provisioning your own workspace

If you (the operator) want a workspace provisioned for yourself rather than a manual Railway deploy per `railway.md` Phase 1:

```bash
# Pre-req: you exist as a row in the Network's networkUsers table.
# If you don't yet, create one first (CLI, or via the admin endpoint):
pnpm run cli network create-user --email tim.hgreen@gmail.com --persona-assignment alex

# Then provision:
curl -X POST https://ditto.partners/api/v1/network/admin/provision \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "<your networkUsers.id>"}'
```

Outcome: a Railway service spun up under the same project as ditto.partners (or a different project if `RAILWAY_PROJECT_ID` points elsewhere), env vars injected including a fresh `NETWORK_AUTH_SECRET` for your magic-link auth, your welcome email sent to `tim.hgreen@gmail.com` with the magic link.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Server misconfigured: RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID, and DITTO_IMAGE_REF are required` | Env var missing on ditto.partners | Set the missing var, redeploy ditto.partners |
| Railway deployment fails with "image not found" / 404 | `DITTO_IMAGE_REF` points at an image that doesn't exist or is private | Verify image exists at the configured URL; mark GHCR package public; or set Railway image-registry credentials |
| Provisioning hangs at "polling deployment status" | Railway is slow OR the new service can't start | Check Railway logs for the new service; if `/healthz?deep=true` is failing, inspect the workspace's startup logs (typically a missing required env var like `WORKSPACE_OWNER_EMAIL`) |
| Two-phase health check fails → automatic rollback | New service was created but couldn't pass deep health | The workspace's startup is failing; the rollback cleans up so you can re-provision after fixing root cause. Check `managedWorkspaces` table for last failure reason |
| Welcome email never arrives | AgentMail not configured on ditto.partners, OR `WORKSPACE_OWNER_EMAIL` not propagated | Verify `AGENTMAIL_API_KEY` set on ditto.partners; check `inbound-email.ts` logs for the welcome-email send |
| `429 Rate limit exceeded. Max 10 requests per minute.` | Hit the per-token rate limit | Wait, then retry. Lift the limit (currently hardcoded in `workspace-provisioner.ts`) only if needed |

---

## What this isn't

- **Not a multi-region story.** All workspaces land in the Network Service's Railway project. Multi-region requires a fleet-management layer that doesn't exist today.
- **Not a billing layer.** The provisioner creates Railway resources; whoever owns the Railway account pays. No per-user cost attribution today.
- **Not OAuth-based pairing.** Magic link only (per Brief 143 / 153). OAuth integrations (Gmail, Slack, Notion) are separate flows that the provisioned workspace handles after the user logs in.
- **Not auto-deprovisioning.** Inactive workspaces stay running until manually deprovisioned. A future TTL/policy layer is unbuilt.

---

## After a phase rollout

If you push a new Ditto release:

1. CI publishes a new `:latest` (and `:sha-<short>`) on push to `main`
2. `:vX.Y.Z` published on tag push
3. To roll out fleet-wide: hit `/api/v1/network/admin/upgrade` with the new tag (canary-first; circuit-breaker after 2 failures; rollback per-workspace on failure)

The fleet upgrade story (Brief 091) is independent of this runbook but lives in the same admin surface.
