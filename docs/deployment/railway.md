# Railway Deployment — Two-Service Setup

The Ditto codebase ships **two distinct deployment surfaces** controlled by a single env var (`DITTO_DEPLOYMENT`). For production the recommended topology is **two Railway services from the same GitHub repo**, each with its own volume and env var set.

| Service | Mode | Domain | Audience | Owns |
|---|---|---|---|---|
| **Network Service** | `public` | `ditto.partners` | Strangers, prospects | Front door (`/welcome`), workspace-lite (`/chat`), admin (`/admin`), Alex/Mira inboxes, shared person graph |
| **Personal Workspace** | `workspace` | e.g. `tim.ditto.partners` or Railway-generated URL | One owner | Full three-panel workspace, personal Self, personal memory, processes, work items |

References: ADR-025 (Centralized Network Service), ADR-030 (Deployment mode flag), Brief 123 (Workspace Lite).

**Sequence the work workspace-first, network-second.** The personal workspace runs standalone and gives the owner value immediately. The Network Service is for prospect traffic and has no urgency until you're ready to surface ditto.partners.

---

## Pre-flight (gather before touching Railway)

| Item | Where it comes from |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `AGENTMAIL_API_KEY` + `AGENTMAIL_ALEX_INBOX` | agentmail.to dashboard |
| `AGENTMAIL_WEBHOOK_SECRET` | agentmail.to → webhook config |
| `SESSION_SECRET` | `openssl rand -hex 32` (do **not** rely on the default — it falls back to the owner email, which is guessable) |
| Railway project | New or existing |
| GitHub repo access for Railway | Connect via Railway → Project Settings → GitHub |

---

## Phase 1 — Personal Workspace

### Railway service config

1. **New Service** → **Deploy from GitHub repo** → point at this repo
2. **Settings → Build:** Railway auto-detects the `Dockerfile` at repo root. No further build config needed.
3. **Settings → Networking:** Generate a public domain (Railway-issued `*.up.railway.app` is fine to start; attach a custom domain later when you want a memorable URL).
4. **Settings → Volumes:** Add a Volume.
   - Mount path: `/app/data`
   - Name: `ditto-tim-data` (or similar — separate from the Network service volume)
   - This is where SQLite (`ditto.db`) and `config.json` live. **Lose this volume, lose your substrate.**

### Env vars

```bash
# Mode — workspace is the default, set it explicitly anyway for clarity
DITTO_DEPLOYMENT=workspace

# The magic-link triad — if any of these is wrong, login breaks silently
WORKSPACE_OWNER_EMAIL=tim.hgreen@gmail.com
SESSION_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_APP_URL=https://<your-railway-url>   # set after Railway issues the domain

# LLM — all three required to skip /setup wizard
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-...

# Email delivery for magic links
AGENTMAIL_API_KEY=am_...
AGENTMAIL_ALEX_INBOX=alex-ditto@agentmail.to

# Storage on the mounted volume
DATABASE_PATH=/app/data/ditto.db

# Feature flags worth turning on
DITTO_PROJECT_ONBOARDING_READY=true   # exposes "+ Connect a project" in sidebar (Brief 225)

# Phase 3 (Network connection) — leave unset for now; workspace runs standalone fine
# DITTO_NETWORK_URL=https://ditto.partners
# DITTO_NETWORK_TOKEN=dnt_...
```

### Why `LLM_PROVIDER` + `LLM_MODEL` are required

Per ADR-026 / Brief 032: Ditto has **no hardcoded default LLM provider or model**. Without these set, LLM calls fail with a setup-required error at runtime. The `/setup` wizard exists to write `data/config.json` which sets these on the running process — but on Railway you bypass that friction by setting the env vars upfront. Setting all three (`LLM_PROVIDER`, `LLM_MODEL`, `ANTHROPIC_API_KEY`) means the wizard is a no-op and you go straight to the workspace.

### Two ways to configure the LLM (both persist)

You can take either path; both survive restarts/redeploys as long as the volume at `/app/data` is intact.

**Path A — env vars only (recommended for cloud):** set `LLM_PROVIDER`, `LLM_MODEL`, and `ANTHROPIC_API_KEY` in Railway's env settings. Skip `/setup` entirely. Secrets stay in Railway's secret store; nothing about LLM config lives on the volume. Rotate keys by changing the env var and redeploying.

**Path B — /setup wizard once:** keep the env-var block above but visit `/setup` on first boot. Pick "Anthropic" + your model. The wizard writes `data/config.json` on the volume (`{ "connection": "anthropic", "model": "..." }`). On every subsequent boot, `app/page.tsx` calls `loadConfig()` and applies the values — they persist forever. **Don't paste your API key into the wizard form** even though it asks; leave that field blank and let Railway's env var supply it. Otherwise the key gets stored in `config.json` on the volume in plaintext.

The volume is the persistence boundary. Both paths land in `/app/data` (DB at `/app/data/ditto.db`, optional config at `/app/data/config.json`). Lose the volume, lose state — backup discipline matters.

### Deploy + first login

1. Trigger deploy. Watch the build, wait for healthcheck on `/healthz` to go green.
2. Visit `https://<your-railway-url>/login`
3. Enter `tim.hgreen@gmail.com`
4. Check the Alex inbox — magic link arrives
5. Click → POST handshake → cookie set → redirect to `/`
6. Day Zero intro renders once → "Let's get started" → workspace loads
7. You're operational. The cookie persists 30 days (rolling); no need to log in again unless you clear cookies.

### What can go wrong (the half-hour traps)

| Symptom | Cause | Fix |
|---|---|---|
| Magic link never arrives | `AGENTMAIL_API_KEY` unset; the request returns "check your email" but the send is a no-op (logs say `AgentMail adapter is null`) | Set the var, redeploy |
| Magic link 404s when clicked | `NEXT_PUBLIC_APP_URL` is wrong; the link in the email is built from this var | Update to actual Railway URL, redeploy |
| Cookie doesn't stick across requests | `SESSION_SECRET` unset (falls back to the owner email, which means HMAC validation fails when env varies between worker boots), or domain mismatch between the email link and the URL you visited | Set `SESSION_SECRET` to a strong random value |
| Workspace renders but chat fails | `LLM_PROVIDER` / `LLM_MODEL` unset; engine doesn't know which provider to use | Set both, redeploy |
| Healthcheck stays red | Railway injected a non-3000 `PORT` and the Dockerfile healthcheck didn't honor it | Fixed in current Dockerfile; if you're on an old image, rebuild |
| `/welcome` or `/admin` accessible | `DITTO_DEPLOYMENT` defaulted to `public` somehow, or wasn't set | Set `DITTO_DEPLOYMENT=workspace` explicitly |

---

## Phase 2 — Network Service (ditto.partners)

Independent of Phase 1. Do this when you want a public face.

### Railway service config

1. **New Service** in the same Railway project, same GitHub repo, same Dockerfile.
2. **Settings → Volumes:** Add a **separate** Volume.
   - Mount path: `/app/data`
   - Name: `ditto-network-data` (must be a different volume from Phase 1)
3. **Settings → Networking → Custom Domain:** point `ditto.partners` here. Update DNS at your registrar (A or CNAME per Railway's instructions).

### Env vars

```bash
# Mode (the critical difference from Phase 1)
DITTO_DEPLOYMENT=public

# DO NOT set WORKSPACE_OWNER_EMAIL on this service.
# If you do, anyone who learns the email can request magic links to the
# public-facing instance.

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-...

# Email — same Alex inbox is fine; AgentMail routes inbound by webhook
AGENTMAIL_API_KEY=am_...
AGENTMAIL_ALEX_INBOX=alex-ditto@agentmail.to
AGENTMAIL_WEBHOOK_SECRET=whsec_...
NETWORK_BASE_URL=https://ditto.partners   # used for outbound email link generation

# Admin panel access (so you can hit /admin to operate the Network)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>

# Front-door spend safety
FRONT_DOOR_DAILY_SPEND_LIMIT_CENTS=1000   # default $10/day

# Optional but useful
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...        # CAPTCHA on front door
TURNSTILE_SECRET_KEY=...

# Storage
DATABASE_PATH=/app/data/ditto.db
```

### Verify

- `https://ditto.partners/welcome` → Alex/Mira persona picker renders
- `https://ditto.partners/admin` → basic auth prompt
- `https://ditto.partners/login` → returns 404 (workspace surfaces are blocked in public mode)
- `https://ditto.partners/healthz` → `200 OK`

### AgentMail webhooks

Configure AgentMail to POST inbound emails to `https://ditto.partners/api/v1/network/inbound` with the secret matching `AGENTMAIL_WEBHOOK_SECRET`. The Network Service handles inbound replies for both Alex and Mira; the workspace deployment does not.

---

## Phase 3 — Wire workspace ↔ Network (later)

The Network API contract (ADR-025 §4) is **partially implemented** today. Only `/seed`, `/intake`, `/verify`, and a handful of admin/inbound endpoints exist. The full set (`/plan`, `/approve`, `/reject`, `/events` SSE) is still unbuilt. Until those land, the workspace can do a one-time bootstrap from `/seed` but ongoing sync (drafts, feedback, events) is future work.

When the API is mature enough to wire:

1. On the **Network service**, mint a per-user token via the CLI:
   ```
   pnpm cli network token create --user-id <your-network-user-id>
   ```
2. On the **workspace service**, set:
   ```
   DITTO_NETWORK_URL=https://ditto.partners
   DITTO_NETWORK_TOKEN=dnt_...
   ```
3. Redeploy workspace. On boot it can call `GET /api/v1/network/seed` to import the network user model, person graph, and active plans.

Don't set these vars until the API surface you need is built — otherwise the workspace will log connection errors on boot.

---

## Claude Max subscription on Railway? No, but partial offload via Local Bridge

Short answer: **your Claude Max subscription cannot pay for cloud Ditto's LLM calls.** Per Insight-158, Anthropic banned third-party tools from using Max subscription OAuth tokens (February 2026, enforced April 2026). The `claude-cli` connection method in `/setup` works locally because it shells out to the `claude` binary using your authenticated `~/.claude/` session — that auth state doesn't exist in a Railway container, and even if it did, using it would violate Anthropic's terms.

Cloud Ditto needs an **Anthropic API key** (`console.anthropic.com`) — separate billing from your Max subscription, charged per token.

### Where Max can still help: the Local Bridge (Brief 212)

If you run the Local Bridge daemon (`packages/bridge-cli/`) on your Mac mini, cloud Ditto can dispatch work items to it. The Mac executes them locally using your authenticated Claude CLI — i.e. your Max subscription pays for that work. Cloud Ditto handles orchestration (composing prompts, parsing responses, control flow), the Mac handles the heavy lifting.

In practice this means:
- **Conversation with Self, briefings, memory operations, lightweight planning** → run on Railway, billed against `ANTHROPIC_API_KEY`
- **Coding work on connected projects (retrofits, refactors, larger autonomous tasks)** → can be dispatched via `runner=local-mac-mini` to the bridge, billed against your Max subscription

This hybrid is the lowest-cost configuration today. Set the bridge up after the Railway workspace is operational; it's purely additive.

### Future: Ditto provides the LLM

Per Insight-158, the long-term direction is for Ditto to hold the keys and bundle LLM cost into its own pricing. End users will never see provider config. For now (May 2026), whoever deploys Ditto provides their own keys.

---

## Operational notes

### Volumes and backups

Railway volumes are not automatically backed up. The DB is the workspace's substrate — set up periodic snapshots (Railway CLI: `railway run sqlite3 /app/data/ditto.db .backup /tmp/snapshot.db`, then ship `/tmp/snapshot.db` somewhere durable).

### Deploys and downtime

- Railway does rolling deploys by default. SQLite + WAL mode handles short overlap windows.
- The pulse scheduler (default 5-minute interval, `PULSE_INTERVAL_MS`) runs inside the Next.js process. Both services run their own pulse loop; idempotency is DB-enforced (primary keys, version numbers).

### Schema migrations

Drizzle migrations run automatically on startup via `ensureSchema()` in `src/db/index.ts`. New migrations ship as part of the Docker image — both services pick them up on next deploy. **Order matters if both services share a database** (don't — keep separate volumes per the topology above).

### Local dev parity

Locally (`pnpm dev`) you can leave `WORKSPACE_OWNER_EMAIL` unset to bypass auth entirely. On Railway, never leave it unset on the workspace service or the workspace becomes unauthenticated.

### Stale artifact note

A `fly.toml` previously sat in the repo root from earlier Fly.io exploration. Removed alongside this doc — Railway is the production target. If `fly.toml` reappears, it's from someone re-exploring Fly; treat it as scratch, not authoritative.
