# Brief 086: Deploy the Ditto Network Service

**Date:** 2026-04-06
**Status:** draft
**Depends on:** ADR-025 (Centralized Network Service), Brief 079 (Network Agent MVP — all sub-briefs complete), ADR-018 Track B1 (VPS deployment pattern)
**Unlocks:** Live Network Agent (Alex sends real email), Brief 087 (workspace provisioning), Layer 1/2 user onboarding

## Goal

- **Roadmap phase:** Phase 14: Network Agent — deployment activation
- **Capabilities:** Always-on Network Service with public URL, AgentMail webhook reception, nurture scheduler running on cron, web front door live, Network API serving workspace connections

## Context

All the Network Agent engine code is built (sub-briefs 080-085). AgentMail is configured. Alex and Mira have inboxes. But everything runs on localhost. The Network Service needs to be deployed to an always-on server with a public URL so that:
- AgentMail webhooks can deliver inbound replies
- The nurture scheduler fires on schedule
- The web front door is accessible to anyone
- The Network API is reachable by workspaces (and eventually by the founder's workspace)

ADR-018 Track B1 specifies the dogfood deployment: VPS + systemd + Tailscale. ADR-025 says the Network Service runs on this same infrastructure. The research report identifies Fly.io, Railway, and Hetzner as options. For MVP, the decision is developer's choice — the brief produces deployment artifacts that work on any of them.

## Non-Goals

- **Multi-region / high-availability.** Single instance is fine for MVP.
- **Auto-scaling.** Not needed at single-user scale.
- **CI/CD pipeline.** Deploy is manual `git pull + restart` for now. GitHub Actions is a future brief.
- **PostgreSQL migration.** SQLite on persistent volume for MVP.
- **Custom domain SSL.** Use platform-provided SSL (Fly.io `*.fly.dev`, Railway `*.up.railway.app`) for MVP. Custom domain (`ditto.partners`) is a follow-up DNS configuration.
- **Workspace provisioning.** That's Brief 087.

## Inputs

1. `docs/adrs/025-centralized-network-service.md` — what the Network Service owns
2. `docs/adrs/018-runtime-deployment.md` — VPS deployment pattern (Track B1)
3. `docs/research/centralized-network-service-deployment.md` — platform options
4. Existing codebase: `packages/web/` (Next.js app), `src/engine/` (engine), `src/cli.ts` (CLI)

## Constraints

- **MUST produce a Dockerfile** that builds the complete Ditto application (engine + web).
- **MUST include a health check endpoint** (`/healthz`) per ADR-018.
- **MUST configure the nurture scheduler** to start on server boot.
- **MUST expose the Network API routes** (`/api/network/*`) on a public URL.
- **MUST NOT expose workspace-only routes** without authentication. Network API routes require `Authorization: Bearer` token. Public routes (verify, intake, healthz) are unauthenticated.
- **MUST use `/api/v1/network/` URL prefix** on all Network API routes (ADR-025 constraint: API versioned from day one). Public routes: `/api/v1/network/verify`, `/api/v1/network/intake`. Protected: `/api/v1/network/status`, etc.
- **MUST use environment variables** for all configuration (API keys, database path, port). No hardcoded paths.
- **MUST include a `docker-compose.yml`** for single-command local testing of the production build.
- **MUST persist the SQLite database** on a volume mount (not inside the container).

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Dockerfile for Next.js + Node.js | Next.js standalone output mode | pattern | Standard production deployment for Next.js |
| Health check endpoint | ADR-018, industry standard | pattern | Container orchestration readiness |
| systemd service file | ADR-018 Track B1 | pattern | VPS always-on process management |
| docker-compose for local testing | Industry standard | pattern | Single-command production build verification |
| fly.toml for Fly.io | Fly.io Next.js deployment guide | pattern | Platform-specific deployment config |
| Persistent volume for SQLite | Fly.io volumes, Railway volumes | pattern | Database survives container restarts |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `Dockerfile` | Create: Multi-stage build — install deps, build Next.js standalone, copy engine, minimal runtime image |
| `docker-compose.yml` | Create: Single-service compose with volume mount for SQLite, env file, port mapping |
| `.dockerignore` | Create: Exclude `node_modules/`, `.git/`, `data/`, `docs/`, `*.test.ts`, `*.test.js`, `*.spec.ts` |
| `fly.toml` | Create: Fly.io deployment config with persistent volume, health check, env vars |
| `packages/web/app/api/healthz/route.ts` | Create: Health check endpoint — returns 200 + DB connectivity check |
| `packages/web/next.config.ts` | Modify: Enable `output: 'standalone'` for Docker deployment |
| `packages/web/instrumentation.ts` | Create: Next.js instrumentation hook — auto-starts scheduler and runs `pnpm cli sync` on server boot. Uses the `register()` export that Next.js calls once on server startup. |
| `.env.example` | Modify: Add deployment-specific vars (PORT, DATABASE_PATH, DITTO_NETWORK_TOKEN) |
| `ditto.service` | Create: systemd unit file for VPS deployment (alternative to Docker) |

## User Experience

- **Jobs affected:** None directly — this is infrastructure. Enables all six jobs for Layer 1/2 users by making the Network reachable.
- **Primitives involved:** None — deployment concern.
- **Process-owner perspective:** After this brief, the founder can point their browser at the public URL and see the web front door. Alex can receive email replies. The nurture scheduler fires weekly. The Network API is live.
- **Designer input:** Not invoked — no UX changes.

## Acceptance Criteria

1. [ ] `Dockerfile` exists and builds successfully: `docker build -t ditto .` completes without error.
2. [ ] `docker-compose up` starts the application, web server responds on configured port.
3. [ ] SQLite database persists across container restarts (volume mount).
4. [ ] `/healthz` returns `200 OK` with `{"status": "ok", "db": "connected"}` when healthy.
5. [ ] `/api/v1/network/verify` and `/api/v1/network/intake` are accessible without authentication (public routes).
6. [ ] `/api/v1/network/status` returns `401 Unauthorized` without a valid `Authorization: Bearer` header.
7. [ ] `fly.toml` exists with persistent volume config, health check path, and env var references.
8. [ ] Nurture scheduler starts automatically on server boot (verified: schedule list shows registered schedules).
9. [ ] AgentMail webhook can reach the deployed instance (verified: send test email, check reply arrives via AgentMail → public URL).
10. [ ] `ditto.service` systemd unit file exists for VPS deployment alternative.
11. [ ] `.env.example` documents all deployment environment variables.
12. [ ] `pnpm cli sync` runs successfully inside the container (database schema created).

## Review Process

1. Spawn reviewer with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: Does the Dockerfile follow standalone output pattern? Is the health check meaningful (not just 200)? Are public vs authenticated routes correctly separated? Is the volume mount correct for SQLite?
3. Present work + review findings to human

## Smoke Test

```bash
# Build and start
docker-compose up -d

# Verify health
curl http://localhost:3000/healthz
# Expect: {"status":"ok","db":"connected"}

# Verify public route
curl -X POST http://localhost:3000/api/v1/network/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
# Expect: {"verified":false}

# Verify auth on protected route
curl http://localhost:3000/api/v1/network/status
# Expect: 401

# Verify scheduler running
docker exec ditto pnpm cli schedule list
# Expect: at least network-nurture schedule
```

## After Completion

1. Deploy to chosen platform (Fly.io, Railway, or Hetzner VPS)
2. Configure `AGENTMAIL_API_KEY`, `DITTO_NETWORK_TOKEN` in production env
3. Verify AgentMail webhook delivery to production URL
4. Update `docs/state.md` with deployment status
5. Proceed to Brief 087 (workspace provisioning)
