# ADR-006: Runtime Deployment — Two-Track Model (Developer Self-Hosted + User Managed Cloud)

**Date:** 2026-03-19
**Status:** accepted

## Context

Agent OS's engine currently runs on the developer's laptop as a Node.js process with SQLite (ADR-001). This works for building but fails for operating:

1. **The always-on problem.** Heartbeats run on timers. When the laptop sleeps, all Node.js timers pause silently — scheduled agent wake-ups are missed, trust data stops accumulating, and processes stall. Phase 3 (Trust Earning) requires continuous feedback accumulation. The engine needs to run 24/7.

2. **The mobile access problem.** The user's core frustration: "I have no way of moving projects ahead without being at my computer." The mobile UX spec (`docs/research/mobile-remote-experience-ux.md`) defines seven constraints the runtime must satisfy: remote access, push notifications with action buttons, offline approve/reject, cross-device state tracking, offline capture with sync, always-available AI classifier, and voice interaction possibility.

3. **The persona constraint.** Rob is a trades MD who checks his phone between jobs. Lisa splits time between warehouse and home office. Jordan is a generalist technologist without a DevOps team. Nadia manages a team from meetings and 1:1s. None of them will provision a VPS, SSH into a server, or configure systemd. Setup for end users must be **"sign up and start using in 2 minutes"** — the standard set by every comparable open-source cloud tool (Supabase, n8n, Cal.com, Plane, Trigger.dev).

4. **The landscape reality.** Research (`docs/research/hosted-cloud-patterns.md`) found that every successful open-source tool in this space provides a managed cloud alongside self-hosted. Three models exist: open core (n8n, Plane), managed cloud (Supabase, Trigger.dev), and third-party hosting ecosystem (OpenClaw, PocketBase). Signup-to-running is ~2 minutes for all cloud offerings vs 10-60 minutes self-hosted. Supabase proves the model works at scale: MIT license, $70M ARR, $5B valuation from managed cloud alone.

5. **Data sovereignty.** Process definitions, feedback, outputs, and agent memories are business-sensitive. Some users (Jordan's employer, Nadia's compliance-sensitive team) will want data on their own infrastructure. The self-hosted option must exist, but it is not the primary onboarding path.

6. **Current constraints from prior ADRs:**
   - ADR-001 chose SQLite for zero-setup. The dogfood deployment must preserve this.
   - The architecture specifies "SQLite (dogfood) → PostgreSQL (scale)."
   - The adapter pattern (invoke/status/cancel) means agents call cloud AI APIs regardless of where the engine runs.

### Forces Summary

| Force | Pulls toward |
|-------|-------------|
| Always-on heartbeats | Dedicated hardware, not laptop |
| Mobile access | Network-accessible engine |
| **Non-technical users (Rob, Lisa, Nadia)** | **Managed cloud — zero infrastructure** |
| **Technical users (Jordan, self-hosters)** | **Self-hosted with simple deploy** |
| **Dogfood (us, now)** | **VPS + Tailscale — simple, cheap** |
| Data sovereignty option | Self-hosted must exist |
| Cost sensitivity | Free tier for cloud, cheap for self-hosted |
| Existing stack (SQLite + Node.js) | Keep what works for dogfood |
| AI inference | Cloud (already — Claude API calls) |

## Decision

**Two deployment tracks: managed cloud (primary for users) and self-hosted (for developers and data-sovereignty users). The engine codebase is the same for both.**

### Track A: Managed Cloud (primary user path)

**"Sign up → first process running in 2 minutes."**

Agent OS provides a managed cloud service where users create an account and get a running instance with zero infrastructure. This is the primary onboarding path for Rob, Lisa, Jordan, and Nadia.

- Each user/team gets an isolated instance (per-tenant database, per-tenant engine process or container)
- PostgreSQL per tenant (managed — Supabase, Neon, or similar)
- Web dashboard + API served from the cloud
- Push notifications, mobile access, cross-device state — all work natively because the engine is cloud-hosted with a stable URL
- BYOK (Bring Your Own Key) for LLM API access — users provide their Anthropic API key. Agent OS never stores or proxies LLM API calls through its own accounts.
- Authentication via passkeys + OAuth (Google, GitHub)

**Pricing model (informed by landscape research):**
- **Free tier:** One process, limited runs, limited history retention. Enough to prove value with a single process (Insight-014: single process must be valuable). Follows: Supabase (free tier, 2 projects), Hatchet (free, 2000 tasks/day), Trigger.dev (free, $5 compute credit).
- **Pro tier:** Unlimited processes, full history, team features. Per-seat or usage-based. Follows: n8n ($24-60/month), Cal.com ($15/user), Plane ($7/seat).
- **Enterprise:** Self-hosted or BYO Cloud option with SSO, compliance, audit. Follows: Trigger.dev BYO Cloud, Supabase Enterprise.

**License:** AGPL-3.0 (follows Cal.com, Plane, Twenty). This protects against competitors offering a closed-source hosted version while keeping the code fully open source. Anyone can self-host. Anyone can inspect the code. Modifications must be shared.

**When to build:** The managed cloud is not needed for dogfood. It becomes the priority when Agent OS is ready for external users (post-Phase 5 verification, likely Phase 10 timeframe when the web dashboard exists). The architecture decisions made now must not prevent this path.

### Track B: Self-Hosted (developer and data-sovereignty path)

**"git clone → running in 10 minutes."**

Agent OS is fully self-hostable. This serves: (a) us during dogfood, (b) Jordan-type users who prefer self-hosting, (c) enterprises with data sovereignty requirements.

**Tier B1: Dogfood (now → Phase 5)**
- Engine runs on a cheap VPS (Hetzner CX23 at EUR 3.49/month, or Oracle Cloud free tier at $0)
- SQLite database on the VPS. Backup = copy the `.db` file.
- Remote access via Tailscale (free for personal use, zero-config)
- CLI is the interface. Push notifications deferred.
- This solves the always-on problem immediately for Phase 3.

**Tier B2: Self-hosted production (Phase 10+)**
- Same engine on a VPS, home server (Pi, NAS, mini PC), or cloud VM
- Web dashboard served from the engine
- One-click deploy templates for Railway and Render (README buttons)
- Tailscale or Cloudflare Tunnel for remote access
- SQLite for single-user, PostgreSQL for teams (Drizzle ORM dialect swap per ADR-001)

**Tier B3: One-click deploy (Phase 10+)**
- Railway / Render deploy buttons in the README
- User clicks button → gets a running instance in ~5 minutes
- No SSH, no VPS provisioning, no Tailscale
- This is the intermediate path for Jordan-type users who want their own instance but don't want DevOps
- Railway's template kickback model (25% revenue share) can offset hosting costs

### What this means concretely for the dogfood phase (now)

1. **Provision a VPS.** Hetzner CX23 (2 vCPU, 4GB RAM, EUR 3.49/month) or Oracle Cloud free tier (4 ARM cores, 24GB RAM, $0). Deploy via git clone + pnpm install + systemd service.

2. **Install Tailscale** on the VPS and on developer devices. The VPS gets a stable Tailscale IP accessible from any device on the tailnet.

3. **Run the engine as a systemd service** with auto-restart. Heartbeats run 24/7.

4. **Access via CLI over SSH.** Minimal mobile experience before the web dashboard exists.

5. **SQLite stays.** No Postgres, no cloud database, no sync protocol.

6. **Architecture the engine for multi-track deployment from day one:**
   - Configuration via environment variables (database URL, API keys, port), not hardcoded paths
   - Health check endpoint (`/healthz`) for container orchestration
   - Stateless restarts (already true — SQLite handles persistence)
   - No assumptions about filesystem layout beyond a single data directory

### What this does NOT decide

- **Which cloud provider to host Track A on.** Deferred. Options include: our own infra on Hetzner/AWS, Supabase for Postgres, Railway for containers.
- **PWA vs native for mobile.** Deferred to Phase 10/13. Both tracks support both — the engine exposes an API.
- **Multi-tenancy isolation model.** Per-tenant database vs shared database with row-level security. Deferred to Track A implementation.
- **Pricing specifics.** The model (free tier + pro + enterprise) is decided; the numbers are not.
- **Business entity.** Operating a managed cloud may require a company. Not an architecture decision.

## UX Constraint Mapping

The mobile UX spec defines seven constraints. The two-track model addresses each:

| # | UX Constraint | Track A (Cloud) | Track B (Self-Hosted) |
|---|--------------|----------------|----------------------|
| 1 | Remote access | **Solved** — cloud-hosted, stable URL | **Solved** — Tailscale or Cloudflare Tunnel |
| 2 | Push notifications | **Solved** — stable domain for web push | **Enabled** — requires Tailscale Funnel for stable domain |
| 3 | Offline approve/reject | **Not blocked** — frontend concern, deferred | Same |
| 4 | Cross-device state | **Solved** — single engine = single source of truth | Same (single engine, accessed via tunnel) |
| 5 | Offline capture + sync | **Not blocked** — frontend concern, deferred | Same |
| 6 | Always-available classifier | **Solved** — engine runs 24/7 in cloud | **Solved** — engine runs 24/7 on VPS |
| 7 | Voice interaction | **Constrained** — PWA limitation applies; native client possible | Same |

**Key insight:** Both tracks solve the core constraints identically because the engine is the same — the only difference is who manages the infrastructure.

## Provenance

**Primary pattern: Supabase (managed cloud from open source)**
- **Source:** Supabase (https://github.com/supabase/supabase)
- **Pattern:** MIT-licensed open source, managed cloud as primary product, self-hosted via Docker, $70M ARR from cloud alone
- **What we took:** The two-track model — managed cloud for users, self-hosted for developers and data sovereignty. BYOK pattern for API keys. Free tier for adoption.
- **What we changed:** We use AGPL instead of MIT (protects cloud revenue, follows Cal.com/Plane/Twenty precedent). We start self-hosted and add cloud later (Supabase started cloud-first).

**Secondary pattern: Plane (same price cloud + self-hosted)**
- **Source:** Plane (https://github.com/makeplane/plane)
- **Pattern:** AGPL-licensed, same codebase for cloud and self-hosted, Docker deploy in <10 minutes, one-click platform templates
- **What we took:** The AGPL license choice, the <10 minute self-hosted setup target, the one-click deploy template approach.
- **What we changed:** We don't charge the same for cloud and self-hosted (Plane does). Self-hosted is free; cloud has a free tier + paid tiers.

**Secondary pattern: Home Assistant + Tailscale (self-hosted remote access)**
- **Source:** Home Assistant (https://www.home-assistant.io)
- **Pattern:** Local engine on always-on hardware, Tailscale for remote access, all data stays local
- **What we took:** The self-hosted track's remote access model. Data sovereignty by default for self-hosters.

**One-click deploy pattern: Railway / Render deploy buttons**
- **Source:** Railway (https://railway.com), Render (https://render.com)
- **Pattern:** README buttons that deploy a configured stack in minutes. Railway pays template authors 25% kickback.
- **What we took:** The intermediate deployment path (Track B3) for users who want their own instance without DevOps.

## Consequences

**What becomes easier:**
- Heartbeats run 24/7 — trust data accumulates continuously (unblocks Phase 3)
- User onboarding is "sign up and start" (Track A) — no infrastructure knowledge needed
- Self-hosters get a clear, supported path (Track B) — not an afterthought
- SQLite stays for dogfood — no premature database migration
- The engine codebase is deployment-agnostic — same code serves both tracks
- AGPL protects cloud revenue while keeping the code fully open

**What becomes harder:**
- **We must eventually build and operate cloud infrastructure (Track A).** This is a significant commitment: multi-tenant isolation, monitoring, billing, support. Deferred to post-Phase 5, but the decision to offer managed cloud shapes the architecture from now.
- **AGPL adds contributor friction.** Some developers avoid AGPL projects. Mitigation: CLA (Contributor License Agreement) for external contributors, clear contribution guidelines.
- Developer must provision and maintain a VPS for dogfood (Track B1). This is new infrastructure, even if minimal.
- **Network dependency for all operations (Track B).** The VPS depends on internet for AI inference and for access. Mitigation: VPS providers have >99.9% uptime.
- **Development workflow change.** Code changes deploy via SSH + git pull + restart (no CI/CD yet). Acceptable for dogfood.

**New constraints:**
- The engine must be configurable via environment variables (no hardcoded paths) to support both tracks
- The engine must include a health check endpoint for container orchestration
- The API layer must use standard HTTP/WebSocket (no exotic protocols) to work behind tunnels and load balancers
- Database access must be abstracted (Drizzle ORM) to support SQLite (Track B dogfood) and PostgreSQL (Track A cloud, Track B production)

**Follow-up decisions needed:**
- **Track A cloud infrastructure** — which provider, multi-tenant isolation model (Phase 10 timeframe)
- **Track A pricing specifics** — free tier limits, pro tier pricing (Phase 10 timeframe)
- **AGPL + CLA details** — contribution guidelines, license headers (before external contributors). Note: the CLA must NOT be used for relicensing — its purpose is contribution clarity only. The Gitea/Forgejo community split (documented in `docs/research/hosted-cloud-patterns.md`) was triggered by CLA + relicensing concerns. Agent OS should commit upfront that the CLA will not grant relicensing rights.
- **VPS provider for dogfood** — developer choice (Hetzner, Oracle free tier)
- **One-click deploy templates** — Railway + Render configs (Phase 10 timeframe)
- **Turso/libSQL evaluation** — intermediate SQLite-with-sync option for Track B multi-device (Phase 13)
