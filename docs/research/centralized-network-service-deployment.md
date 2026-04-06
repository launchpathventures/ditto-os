# Centralized Network Service Deployment Patterns

**Date:** 2026-04-06
**Researcher:** Dev Researcher
**Consumers:** Dev Architect (ADR-018 amendment, deployment brief), Dev Builder
**Reference docs consulted:** ADR-018 (runtime deployment), ADR-005 (integration architecture), Insight-152 (Network Service is centralized), architecture.md, landscape.md
**Status:** Active

## Research Question

How should Ditto deploy a centralized always-on Network Service (the superconnector intelligence) that multiple distributed user workspaces connect to? What patterns exist for: (a) the hub-and-spoke deployment model, (b) state synchronization between central and distributed instances, (c) the workspace seed (migrating user context from network to workspace), and (d) deployment platforms for the central service?

## Context

Insight-152 established that the Network Agent requires a centralized deployment (shared relationship graph, institutional persona inboxes, cross-user matching intelligence). ADR-018 currently assumes each user gets an isolated instance. The research question is: what can we build FROM to implement the split?

The unique constraint: Alex is one identity that spans both the central Network Service and per-user Workspaces. The system must feel like one coherent experience despite being two deployment units.

---

## Track 1: Hub-and-Spoke Deployment Patterns

### 1.1 Temporal — Centralized Orchestration + Distributed Workers

**What it is:** Workflow orchestration platform. Central Temporal Server maintains workflow state, task queues, and event history. Distributed workers poll for tasks, execute, and report results.

**Architecture:**
- Central server owns: workflow state, execution history, task queues, event coordination
- Workers own: actual code execution, application logic
- Connection model: workers poll task queues (long-poll gRPC)
- State guarantee: "The Service maintains a detailed history of every execution"
- Failure recovery: another worker replays history to recover state

**Relevance to Ditto:**
- The Temporal pattern maps directly: Network Service = central orchestrator (holds relationship graph, schedules, email state), Workspace = worker (executes Self conversations, process management)
- The "worker polls for tasks" model maps to the Workspace polling/webhooking the Network for "draft ready", "reply received" events
- Temporal's history replay for crash recovery is analogous to the workspace seed — rebuilding local state from central history

**Source:** https://temporal.io/how-temporal-works

### 1.2 Inngest — Centralized Event Bus + Distributed Function Execution

**What it is:** Event-driven durable execution platform. Central service manages "queueing, scaling, concurrency, throttling, rate limiting, and observability." Functions deploy to any platform (Vercel, Netlify, Cloudflare).

**Architecture:**
- Central service owns: event bus, scheduling, state machine, observability
- Functions own: business logic, deployed on user's infrastructure
- Connection model: apps register webhook endpoints; Inngest calls them when events fire
- Distributed execution: functions can run on any cloud provider

**Relevance to Ditto:**
- The "central event bus + distributed function execution" maps to: Network Service fires events (reply_received, draft_ready) → Workspace receives via webhook and acts
- Inngest's approach of apps registering endpoints is how Workspaces would register with the Network Service — "my webhook URL is X, send me events for user Y"
- The separation of orchestration (central) from execution (distributed) is exactly the Ditto split

**Source:** https://www.inngest.com/

### 1.3 LiveKit Agents — Centralized Dispatch + Distributed Agent Workers

**What it is:** Real-time communication platform with AI agent orchestration. Central LiveKit Cloud handles dispatch, room management, and observability. Agent workers register, receive dispatch requests, and execute independently.

**Architecture:**
- Central service owns: agent registration, dispatch decisions, room state, observability
- Workers own: conversation context, LLM inference, session lifecycle
- Connection model: agent servers register with LiveKit, wait for dispatch
- Scaling: "from a few to several thousand instances"
- Each job is independent — no shared agent state across sessions

**Relevance to Ditto:**
- The "register → wait for dispatch → execute independently" model maps to: Workspace registers with Network → Network dispatches events → Workspace executes (Self conversation, draft review)
- LiveKit's separation of "central dispatch" from "agent session ownership" mirrors Ditto's "Network decides what to do, Workspace is where the user interacts"
- The per-session independence (no shared state across jobs) is how Workspace sessions work — each user's Self is independent

**Source:** https://docs.livekit.io/agents/overview/

### 1.4 Composio — Centralized Credential/Tool Proxy for Distributed Agents

**What it is:** Integration platform that manages credentials, tool discovery, and execution sandboxing for AI agents. Agents connect via user sessions.

**Architecture:**
- Central service owns: credential lifecycle (OAuth, token refresh, storage), tool catalog (1000+ integrations), execution sandboxing, multi-tenant isolation
- Agents own: business logic, LLM inference, decision-making
- Connection model: `composio.create(user_id)` establishes a user-scoped session
- Multi-tenant: each `user_id` has isolated connected accounts and auth configs
- Integration: works with OpenAI, Claude, LangChain via native tools or MCP protocol

**Relevance to Ditto:**
- Composio's `create(user_id)` pattern maps directly to the Network API: workspace connects with a user token, gets a user-scoped view of the shared network
- The "centralized credential management for distributed agents" pattern is how the Network Service manages AgentMail credentials centrally while Workspaces delegate email operations to it
- Multi-tenant isolation via user_id is the same pattern as Ditto's `userId` on interactions and person records

**Source:** https://docs.composio.dev/

### 1.5 Nango — Centralized Integration Hub for Distributed Apps

**What it is:** Integration platform managing OAuth, API keys, token refresh, and credential storage for 700+ APIs. Applications delegate all auth and execution to Nango.

**Architecture:**
- Central service owns: authentication flows, credential lifecycle, per-tenant isolation, elastic scaling, rate-limit handling
- Applications own: integration logic (TypeScript functions deployed to Nango), business decisions
- Connection model: embedded auth flows + TypeScript functions deployed centrally
- Applications interact via API, never touching raw credentials

**Relevance to Ditto:**
- Nango's pattern of "apps never touch credentials, the platform brokers all access" mirrors ADR-005's credential vault, but centralized
- The "TypeScript functions deployed to the central service" model is how Network Agent processes execute — the process templates run on the Network Service, not the Workspace
- Nango's per-tenant isolation with shared infrastructure is the target model for the Network Service

**Source:** https://nango.dev/docs/introduction

---

## Track 2: State Synchronization — Central ↔ Distributed

### 2.1 Turso Embedded Replicas — SQLite with Central Sync

**What it is:** Hosted SQLite (libSQL) with embedded replicas that sync to a central database. Local reads, remote writes, periodic background sync.

**Architecture:**
- Central Turso database: authoritative source of truth
- Embedded replicas: local SQLite files that sync periodically
- Sync model: pull-based, configurable interval (`syncInterval` in seconds), or manual `.sync()`
- Write model: writes go to primary by default, replicated back to local
- Offline mode: optional local-only writes
- Guarantee: read-your-writes semantics (write → immediate local visibility; other replicas see at next sync)

**Relevance to Ditto:**
- This is the most directly applicable sync pattern for the Network ↔ Workspace boundary
- Central Turso database = Network Service's relationship graph
- Embedded replica = Workspace's local copy of relevant person/interaction data
- Sync interval = how quickly Workspace sees new network activity
- Already compatible with Drizzle ORM (Ditto's current ORM)

**Pricing (free tier):** 100 databases, 5GB storage, 500M reads/month, 10M writes/month, 3GB syncs/month

**Key consideration:** Turso's embedded replicas sync entire databases. For Ditto, the Workspace only needs a subset (the user's people and interactions, not the whole graph). This means either: (a) per-user databases on Turso (scales to 100 free, unlimited paid), or (b) filtered sync (not natively supported — would need application-level filtering).

**Source:** https://docs.turso.tech/features/embedded-replicas

### 2.2 API-Based Sync (Webhook + Polling Hybrid)

**Pattern:** No database replication. Workspace calls Network API for data it needs. Network pushes events via webhooks.

**How it works:**
- Workspace polls `GET /network/status` periodically for updates
- Network pushes critical events (reply_received, draft_ready) via webhook to registered Workspace URL
- Workspace caches relevant data locally (SQLite) but Network is authoritative
- No sync protocol needed — just HTTP

**Relevance to Ditto:**
- Simplest implementation — no new infrastructure dependencies
- Works with any Workspace deployment (self-hosted, managed cloud, local dev)
- Tradeoff: latency depends on polling interval; webhooks require the Workspace to have a public URL (or use Tailscale Funnel/Cloudflare Tunnel)
- This is how most SaaS integrations work (Stripe webhooks, GitHub webhooks, etc.)

### 2.3 Server-Sent Events (SSE) for Real-Time Push

**Pattern:** Workspace opens a long-lived SSE connection to the Network Service. Network pushes events in real-time.

**How it works:**
- Workspace opens `GET /network/events?userId=X` (SSE stream)
- Network pushes events as they happen (no polling delay)
- If connection drops, Workspace reconnects and catches up from last event ID
- Workspace still calls API for data fetches (people, status, etc.)

**Relevance to Ditto:**
- Already used in Ditto's web app (`/api/events` SSE endpoint for harness events)
- Lower latency than polling, no webhook URL requirement
- Works behind NAT/firewalls (outbound connection from Workspace)
- Tradeoff: requires persistent connection (consumes a socket per connected Workspace)

---

## Track 3: Workspace Seed Patterns

### 3.1 Full Export/Import (One-Time Migration)

**Pattern:** When Workspace provisions, Network exports the user's complete state as a JSON/SQLite payload. Workspace imports it.

**Examples:**
- Supabase project cloning (full database export/import)
- GitHub repository forking (full state copy at a point in time)
- Notion workspace export/import

**For Ditto:** `GET /network/seed?userId=X` returns:
```json
{
  "userModel": [...memories],
  "people": [...person records],
  "interactions": [...interaction history],
  "plans": [...active plans],
  "trustSettings": {...},
  "personaAssignment": "alex"
}
```
Workspace imports this into its local database. After seed, ongoing sync handles updates.

### 3.2 Lazy Loading (Fetch on Demand)

**Pattern:** Workspace starts empty. Fetches data from Network as the user needs it. Caches locally.

**For Ditto:** First workspace conversation with Self → Self calls Network API to fetch user model, connections, recent interactions. Caches in local DB. Subsequent requests served from cache, refreshed periodically.

**Tradeoff:** Simpler, but first conversation may feel slow. The "Self already knows you" experience requires the seed to happen before the first conversation.

### 3.3 Hybrid (Seed + Lazy)

**Pattern:** Seed the critical data (user model, persona, active plans) at provision time. Lazy-load everything else (full interaction history, dormant connections).

**For Ditto:** Most practical. The workspace needs the user model and active context immediately (Self must feel continuous). Historical data can load in the background.

---

## Track 4: Deployment Platforms for the Network Service

### 4.1 Fly.io

**What it is:** Application platform running Firecracker microVMs. Persistent volumes for SQLite. Global regions. Public URLs by default.

**Relevant features:**
- Persistent volumes (for SQLite): supported, but SQLite limitations noted ("build Machine won't have access to your volume")
- Public URL: automatic `*.fly.dev` hostname, custom domains supported
- Always-on: machines stay running by default
- Cost: shared-cpu-1x 256MB ~$1.94/month, 1GB volume ~$0.15/month

**Considerations:**
- SQLite on Fly works for single-instance (no horizontal scaling)
- Already referenced in ADR-018 as a deployment option
- Supports Docker-based Next.js deployment

### 4.2 Railway

**What it is:** PaaS with usage-based pricing. Persistent volumes. Public URLs. Background workers.

**Relevant features:**
- Persistent volume storage: up to 5GB (Hobby), 1TB (Pro)
- Public URL: automatic, custom domains (2 on Hobby, 20 on Pro)
- Always-on: services run continuously, usage-billed
- Cost: $5/month base (Hobby), usage-based compute

**Considerations:**
- Already referenced in ADR-018 as a one-click deploy option
- Railway template kickback (25% revenue share)
- No SQLite-specific issues documented
- Simple Docker/Nixpack deployment

### 4.3 Hetzner VPS

**What it is:** Traditional VPS. CX23 at €3.49/month (2 vCPU, 4GB RAM).

**Relevant features:**
- Full control over filesystem (SQLite works natively)
- Static IP for webhooks
- systemd for always-on process management
- Cheapest option by far

**Considerations:**
- Already chosen for dogfood in ADR-018 (Track B1)
- Requires manual setup (git clone, systemd, SSL cert)
- No auto-scaling, but Network Service is single-instance anyway
- Tailscale for secure access

### 4.4 Turso + Fly.io (Hybrid)

**What it is:** Turso for the database (hosted SQLite, embedded replicas), Fly.io for the application.

**Relevant features:**
- Turso handles database persistence, replication, and sync
- Fly.io runs the Next.js/Node.js application
- Embedded replicas for Workspace sync
- Free tier: 100 databases, 5GB storage

**Considerations:**
- Most sophisticated option — solves both deployment and sync
- Adds a dependency (Turso) but solves the Workspace sync problem elegantly
- Drizzle ORM supports Turso/libSQL driver
- Per-user databases on Turso enable clean data isolation

---

## Track 5: Authentication — Network ↔ Workspace Identity

### 5.1 Clerk — Centralized Auth Service

**Pattern:** Centralized identity provider. Applications authenticate via API keys. Sessions managed through DNS-based domain configuration. Cross-subdomain auth supported.

**Relevance:** The Network Service could use Clerk (or similar) as the identity layer. Users authenticate once, get a token, and both Network and Workspace accept it. Not required for MVP (single user) but worth noting for multi-user.

### 5.2 API Key + User Token (Simple)

**Pattern:** Network Service issues API tokens per user. Workspace authenticates with its user's token on every request. No external auth service needed.

**Relevance:** Simplest for MVP. Network creates a token during intake. Workspace stores it as an env var. Every API call includes it. Scales to dozens of users without external dependencies.

---

## Cross-Cutting Analysis

### Patterns Ditto Can Build FROM

| Pattern | Source | Composition level | What it solves |
|---------|--------|-------------------|---------------|
| Central orchestration + distributed workers | Temporal | **pattern** | Hub-and-spoke deployment model |
| Central event bus + webhook dispatch | Inngest | **pattern** | Network → Workspace event delivery |
| Register → dispatch → execute independently | LiveKit Agents | **pattern** | Workspace registration and session independence |
| Centralized credential/tool proxy | Composio, Nango | **pattern** | Network manages email credentials, Workspaces delegate |
| Embedded SQLite replicas with periodic sync | Turso | **depend** (future) | Workspace ↔ Network data sync |
| API-based sync (webhook + polling) | Industry standard | **pattern** | Simple sync without new dependencies |
| SSE for real-time push | Ditto existing (`/api/events`) | **existing** | Low-latency event delivery to Workspaces |
| Full seed export at provision time | Supabase project clone, GitHub fork | **pattern** | Workspace seed with user context |
| API key per user | Industry standard | **pattern** | Simple auth for Network ↔ Workspace |
| Persistent volume + always-on process | Fly.io, Railway, Hetzner | **depend** | Network Service deployment |

### What Is Original to Ditto

1. **Persona identity spanning two deployment units.** No surveyed platform has a single AI identity (Alex) that operates coherently across a centralized service AND distributed user instances with shared memory.

2. **Workspace seed from AI relationship memory.** Platforms like Intercom and Drift build user profiles from conversations. What is original is seeding a per-user autonomous agent workspace from a centralized AI's accumulated relationship memories — not copying data, but transferring a relationship's learned context so the workspace Self continues the conversation without re-onboarding.

3. **Three-layer user journey across deployment boundaries.** Network participant (central only) → Active user (central only) → Workspace user (central + distributed). No surveyed platform has users who start on a centralized service and graduate to their own distributed instance while maintaining continuity.

4. **AI-mediated cross-user matching with anonymized signals and strict interaction isolation.** LinkedIn and Apollo.io have shared contact graphs with per-user activity isolation. What is original to Ditto is the combination of: AI-mediated anonymized cross-user quality signals ("this person has had 3 positive introductions" without revealing who), strict per-user interaction privacy, and a self-hosted-compatible architecture where the shared graph is centralized but workspace data stays distributed.

### Gap Analysis

| Gap | Description | Impact |
|-----|-------------|--------|
| **Filtered database sync** | Turso syncs entire databases, but Workspace only needs a user's subset of the graph | May require per-user databases (Turso supports this) or application-level filtering |
| **Persona context assembly across network boundary** | When Alex operates in Self mode (Workspace) and Selling mode (Network), the prompt assembly needs both local and remote memory | Requires API calls from Workspace to Network for person memory, or local caching with sync |
| **Offline Workspace operation** | If Network Service is unreachable, can the Workspace still function for non-network tasks? | Yes for workspace processes; no for network operations. Needs graceful degradation |
| **Webhook delivery to self-hosted Workspaces** | Self-hosted Workspaces behind NAT need a public URL for Network webhooks | Tailscale Funnel, Cloudflare Tunnel, or SSE (outbound connection) as alternatives |
| **Conflict resolution between Network and Workspace state** | Both hold person data; concurrent edits from email interactions (Network) and user notes (Workspace) will conflict | Needs a resolution strategy: last-write-wins, domain-split (Network owns network data, Workspace owns workspace data), or merge |
| **Network Service resilience** | Centralized Network is a single point of failure for all users' network operations | Needs HA plan for production (multi-region, failover). Not needed for MVP (single VPS). |
| **API versioning across the boundary** | When Network API schema evolves, older Workspaces need to handle changes gracefully | API versioning strategy (URL path versioning, header versioning, backward-compatible evolution) needed before multi-user |

---

## Findings Relevant to Architecture Decision

1. **The hub-and-spoke pattern is well-established.** Temporal, Inngest, LiveKit, Composio, and Nango all implement variations of "central service + distributed clients." None require Ditto to invent new infrastructure patterns.

2. **API-based sync has the lowest implementation cost and no new dependencies.** Webhook + polling (or SSE) handles the Network → Workspace event flow without database replication infrastructure. Turso embedded replicas have higher sophistication but add a dependency.

3. **The workspace seed is a one-time API call, not a sync protocol.** Export user state from Network, import to Workspace. Simple JSON payload. The ongoing sync is event-based, not data replication.

4. **Hetzner VPS has the lowest cost and most direct SQLite support.** Same infrastructure as ADR-018 Track B1. Always-on, public IP for webhooks, SQLite for storage. Fly.io and Railway offer more automation at higher cost.

5. **User identity via API token is sufficient for MVP.** No external auth service needed until multi-user at scale. Network issues token during intake; Workspace stores it.

6. **SSE is the best sync primitive for Ditto.** Already implemented in the web app. Works behind NAT (outbound connection). Real-time push. No webhook URL requirement for self-hosted Workspaces. Can fall back to polling.

7. **Per-user Turso databases are the long-term sync solution.** When scale requires it: each user gets a Turso database, Network writes to it, Workspace has an embedded replica. Clean isolation, automatic sync, Drizzle-compatible.

---

## Sources

- Temporal — https://temporal.io/how-temporal-works
- Inngest — https://www.inngest.com/
- LiveKit Agents — https://docs.livekit.io/agents/overview/
- Composio — https://docs.composio.dev/
- Nango — https://nango.dev/docs/introduction
- Turso — https://docs.turso.tech/features/embedded-replicas, https://www.turso.tech/pricing
- Fly.io — https://fly.io/docs/reference/architecture/, https://fly.io/docs/js/frameworks/nextjs/
- Railway — https://railway.com/pricing
- Clerk — https://clerk.com/docs/deployments/overview
- Trigger.dev — https://trigger.dev/docs/open-source-self-hosting (surveyed: fully independent self-hosted, no hub-spoke pattern)
- Supabase — https://supabase.com/docs/guides/self-hosting (surveyed: managed vs self-hosted, informed seed/migration pattern)
- Cal.com — https://github.com/calcom/cal.com (surveyed: monorepo, multi-deploy, white-label — no hub-spoke)
- ADR-018 (Ditto) — docs/adrs/018-runtime-deployment.md
- Insight-152 (Ditto) — docs/insights/152-network-service-is-centralized.md
