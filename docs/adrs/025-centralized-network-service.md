# ADR-025: Centralized Ditto Network Service

**Date:** 2026-04-06
**Status:** proposed
**Amends:** ADR-018 (Runtime Deployment — adds a third deployment element)

## Context

### The Problem

ADR-018 defines two deployment tracks: managed cloud (Track A) and self-hosted (Track B). Both assume each user gets an isolated Ditto instance with its own database, engine, and processes. The Network Agent (Brief 079) breaks this assumption.

The superconnector's value comes from the **shared relationship graph** — Alex knowing everyone across all users. If every user deploys their own isolated Ditto, Alex can only search one user's contacts. No network effect (Insight-146). No cross-user intelligence. The value proposition collapses.

Additionally, the Ditto journey starts with a conversation with Alex (Insight-151: the network is the front door), not with installing software. Layer 1 (network participants) and Layer 2 (active users) exist entirely outside any workspace. They interact via email. They need zero infrastructure. This means Alex must be running before any workspace exists.

### Forces

| Force | Pulls toward |
|-------|-------------|
| Cross-user matching intelligence | Centralized shared graph |
| One Alex identity across all users | Centralized persona + email infrastructure |
| Layer 1/2 users need no workspace | Centralized service serving pre-workspace users |
| Always-on email (webhooks, nurture) | Centralized always-on service |
| User data sovereignty (ADR-018) | Per-user workspace data stays with user |
| Self is personal (ADR-016) | Per-user workspace owns Self memory |
| Same Alex in workspace and network | Shared persona config + character bible |
| Workspace seed (no cold start) | Centralized service accumulates user model before workspace exists |
| MVP simplicity | Same server for now, clean separation in code |

### Research Inputs

- `docs/research/centralized-network-service-deployment.md` — five hub-and-spoke patterns (Temporal, Inngest, LiveKit, Composio, Nango), three sync options (API/SSE, webhook/polling, Turso replicas), workspace seed patterns, deployment platforms
- `docs/insights/152-network-service-is-centralized.md` — the insight driving this ADR

## Decision

### 1. ADR-018's two-track model gains a third element: the Ditto Network

```
ADR-018 original:               ADR-025 amended:

Track A (Managed Cloud)          Ditto Network (centralized, always-on)
Track B (Self-hosted)               ↕ Network API ↕
                                 Track A (Managed Cloud Workspace)
                                 Track B (Self-hosted Workspace)
```

The Ditto Network is a centralized service that all workspaces connect to, regardless of their deployment track. It runs 24/7 and serves all three layers of the user journey (Insight-151).

### 2. What the Ditto Network owns

| Component | Why centralized | Data sensitivity |
|-----------|----------------|-----------------|
| **Shared person graph** (`people` table) | Cross-user matching requires one graph | Person records are institutional (name, email, org, role) |
| **Interactions** (house-scoped) | Institutional memory of who Alex has contacted | Per-user isolated via `userId` — User A cannot see User B's interactions |
| **House-level person memory** | "Priya prefers email" is institutional knowledge | Shared — same for all users who interact with Priya |
| **Alex & Mira inboxes** (AgentMail) | One Alex, institutional identity | Centralized — one inbox per persona |
| **Email send/receive/webhooks** | Always-on, public URL for webhook delivery | Credentials in central vault, never exposed |
| **Nurture scheduler** | Fires whether users are online or not | Centralized cron |
| **Web front door** | Landing page, verification, intake — public-facing | Public |
| **Network users** (`networkUsers` table) | User model for Layer 2 users who don't have workspaces | Per-user isolated |
| **Network-scoped user memory** | What Alex has learned about each user through network interactions | Per-user isolated — used for workspace seed |
| **Pre-send quality gate** | House values apply institutionally | Centralized rules |
| **Match quality signals** | Cross-user aggregated, anonymized | Aggregated — no per-user attribution |
| **Network API** | Interface for workspaces to connect | Authenticated per-user |

### 3. What the Workspace owns (unchanged from ADR-018)

| Component | Why per-user |
|-----------|-------------|
| **Self** (Conversational Self, ADR-016) | Personal chief of staff |
| **Self-scoped memory** | "Tim's ICP is Series A SaaS" — private |
| **User-scoped person notes** | "I introduced Priya for my logistics needs" — private |
| **Sales/connection plans** | Private strategy |
| **Processes, trust tiers, work items** | Personal workflow |
| **Draft review queue** | User approves their own outreach |
| **Workspace UI** | Personal interface |
| **Non-network integrations** | Gmail inbox triage, calendar, sheets — per-user credentials |

### 4. The Network API (bridge between the two)

The Workspace connects to the Ditto Network like any other integration (ADR-005 pattern). The Network API is an HTTP/SSE interface:

**Workspace → Network:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/network/plan` | POST | Submit a sales or connection plan for execution |
| `/network/approve` | POST | Approve a draft for sending |
| `/network/reject` | POST | Reject a draft with feedback |
| `/network/status` | GET | Get network briefing data (connections, pipeline, cooling) |
| `/network/people` | GET | List user's connections and people |
| `/network/people/:id` | GET | Get person detail + person memory |
| `/network/people/:id/opt-out` | POST | Opt out a person |
| `/network/seed` | GET | Export user model for workspace provisioning |
| `/network/events` | GET (SSE) | Real-time event stream for this user |
| `/network/people/:id` | PATCH | Update a person record (e.g. role changed, new context) |
| `/network/feedback` | POST | Send correction/edit feedback from workspace review to Network learning pipeline |
| `/network/register` | POST | Workspace announces itself to Network (URL for callbacks, capabilities) |

**Network → Workspace (via SSE event stream):**

| Event | Payload | When |
|-------|---------|------|
| `reply_received` | personId, messageId, preview | Someone replied to outreach |
| `draft_ready` | personId, draftId, subject, preview | Outreach draft waiting for approval |
| `meeting_booked` | personId, dateTime, context | Calendar event created |
| `introduction_made` | personId, recipientId, context | Introduction sent to both parties |
| `intake_started` | email, personaName, message | Someone started web/email intake |
| `connection_promoted` | personId, name | Person promoted to visible connection |

**Web Front Door (anonymous, public):**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/network/chat` | POST | Conversational front door — anonymous visitors talk to Alex before email capture (Brief 093) |
| `/network/intake` | POST | One-shot email intake for visitors (Brief 079) |
| `/network/verify` | POST | Anti-phishing verification for outreach recipients (Brief 079/095) |

These endpoints share the `/v1/network/` prefix but require **no authentication**. They serve pre-workspace visitors (Layer 1/2 users) who don't have tokens.

**Authentication (protected endpoints):** API token per user. Network issues token during intake. Workspace stores as `DITTO_NETWORK_TOKEN` env var. Every request includes `Authorization: Bearer <token>`. Token rotation and revocation via Network admin. Tokens are full-access for MVP; scope refinement (read-only vs read-write) deferred to multi-user. SSE connections validate token on initial connection and on each reconnection after drop.

**Data visibility:** House-level person memory (`shared: true`) is visible to all authenticated users — by design, this is institutional knowledge. User-level person memory and interactions are strictly isolated by `userId`.

### 5. Alex spans both — persona coherence across the boundary

Alex is not a deployment unit. Alex is an identity that loads different context depending on mode:

| Mode | Where it runs | Context assembled from |
|------|--------------|----------------------|
| **Self** | Workspace | User's self-scoped memory + persona config + character bible |
| **Selling** | Network Service | User's plan (via API) + person memory (Network DB) + persona config + character bible |
| **Connecting** | Network Service | User's request (via API) + FULL shared person graph + persona config + character bible |
| **Nurture** | Network Service | User's relationship graph + persona config + character bible |

**Persona config and character bible are shared infrastructure.** Both deployment units load the same `docs/ditto-character.md` and the same `PersonaConfig` (Alex/Mira). In the MVP (same server), this is the same file. When split, the Network Service is the canonical source and Workspaces fetch it on startup or cache it.

**Architectural distinction:** Self mode = the Conversational Self (ADR-016), operating as the outermost harness ring in the Workspace. Selling/Connecting/Nurture modes = the `network-agent` system agent (architecture.md line 108), executing process templates on the Network Service. They share persona config and character bible — the user experiences one Alex — but they are architecturally different entities. Self delegates to the network-agent via the Network API.

### 5a. Memory scope mapping at the boundary

**Network-scoped user memory** uses `scopeType: 'self'` with `scopeId` set to the network user's ID (from `networkUsers` table). On the Network Service, this IS self-scoped memory — it stores what Alex has learned about the user through network interactions. During workspace seed, these memories are exported and imported into the Workspace's `memories` table with the same `scopeType: 'self'` and mapped to the Workspace's user identifier.

**House-level person memory** uses `scopeType: 'person'` with a `shared` flag (boolean, default false) on the `memories` table. When `shared: true`, the memory is institutional knowledge visible to all users ("Priya prefers email"). When `shared: false`, it is private to the creating user ("I introduced Priya for my logistics needs"). The `shared` flag is a schema addition to `memories` — required before multi-user.

### 5b. Trust tiers at the Network/Workspace boundary

**Layer 2 users (no workspace):** Operate at supervised trust tier by default. All drafts require approval via email. The Network Service presents drafts, the user replies "approved" or provides edits. No trust tier progression without a workspace — the email-based approval flow is always supervised.

**Layer 3 users (workspace):** Workspace trust tiers apply. The workspace harness trust gate evaluates the draft. If it passes (spot-checked or autonomous tier), the Workspace automatically calls `POST /network/approve`. If it pauses (supervised tier), the user reviews in the workspace review queue, then the Workspace calls approve/reject on the Network.

**Pre-send quality gate:** Runs on the Network Service AFTER user approval but BEFORE send. This is institutional — it enforces house values regardless of the user's trust tier. A user at autonomous trust tier can auto-approve a draft, but the house quality gate can still reject it if it violates "no spam, ever."

### 5c. Feedback flow from Workspace to Network

When a workspace user edits or rejects a draft, the correction signal must flow back to the Network Service for learning. The API includes:

- `POST /network/approve` carries optional `edits` field (diff of what the user changed)
- `POST /network/reject` carries `reason` field

The Network Service processes these through its own feedback-to-memory pipeline:
- Edit diffs → correction patterns → person-scoped process memory ("outreach to Priya was too formal — user corrected")
- Rejection reasons → person-scoped memory ("user says Priya is not a good fit because X")

This mirrors the existing feedback pipeline (ADR-003, `feedback` table → `memories` table) but operates on the Network Service for network-related corrections.

### 6. The workspace seed

When a user graduates from Layer 2 (active user, no workspace) to Layer 3 (workspace user):

1. Workspace provisions (managed cloud or self-hosted)
2. Workspace calls `GET /network/seed?userId=X`
3. Network returns JSON:
   - Network-scoped user memories → imported as self-scoped memories in workspace
   - Connection graph (user's people + visibility) → imported to workspace people table
   - Interaction history summary → seeded into workspace
   - Active plans → become workspace processes
   - Trust settings → applied to workspace trust tiers
   - Persona assignment → same Alex/Mira in workspace
4. Workspace imports. Self already knows the user. No cold start.

After seed, ongoing sync via SSE events. Network is authoritative for network data. Workspace is authoritative for workspace data. Conflict resolution: **domain split** — Network owns person records, interactions, person memory. Workspace owns self memory, user notes, plans, processes. No same-field conflicts because the domains are separated.

### 7. The three entry paths

| Path | Infrastructure | Where they live |
|------|---------------|----------------|
| **Network participant** | None | Row in Network's `people` table |
| **Active user** | None | Row in Network's `networkUsers` table + `people` + memories |
| **Workspace user** | Workspace (managed or self-hosted) | Workspace DB + connected to Network |

Layer 1 and Layer 2 require zero user infrastructure. The Ditto Network serves them entirely.

### 8. For MVP (same deployment, clean separation)

Same server. Same SQLite database. Same process. The code is already structured with the right modules:

- `src/engine/people.ts`, `channel.ts`, `persona.ts` → Network-ready
- `src/engine/self-tools/network-tools.ts` → Split: verify/intake on Network side, plan/status bridge Workspace to Network
- `src/engine/harness-handlers/memory-assembly.ts` → Both (assembles memory from both scopes)
- `packages/web/app/api/network/` → Network API routes (verify, intake)

When the deployment splits, these modules move to the Network Service and the Workspace calls them via HTTP instead of direct function calls. The `ChannelAdapter` pattern already abstracts this — the Workspace doesn't know whether it's calling a local function or a remote API.

**The deployment split is a refactor (changing function calls to HTTP calls), not a rewrite.**

## Provenance

| Pattern | Source | What we adapted |
|---------|--------|----------------|
| Central orchestration + distributed workers | Temporal (temporal.io) | Hub-and-spoke model: Network = orchestrator, Workspace = worker |
| Central event bus + distributed function execution | Inngest (inngest.com) | Network pushes events, Workspaces receive and act |
| Register → dispatch → execute independently | LiveKit Agents (docs.livekit.io/agents) | Workspace registers with Network, receives dispatches, executes independently |
| Centralized credential/tool proxy per user session | Composio (composio.dev) | `create(user_id)` session pattern for user-scoped Network API access |
| SSE for real-time event delivery | Ditto existing (`/api/events`) | Existing pattern extended for Network → Workspace push |
| API token per user | Industry standard | Simple auth for the Network ↔ Workspace boundary |
| Workspace seed as one-time export | Supabase project clone, GitHub fork | Full state export at provision time |
| Domain-split conflict resolution | Industry standard (CQRS read/write separation) | Network owns network data, Workspace owns workspace data — no same-field conflicts |
| Persona spanning deployment boundary | **Original to Ditto** | No surveyed platform has a single AI identity operating coherently across centralized and distributed units |
| Three-layer user journey across deployment boundaries | **Original to Ditto** | Network participant → active user → workspace user with continuity |

## Consequences

**What becomes easier:**
- The Ditto journey starts without infrastructure — email/web intake via centralized Network
- Cross-user matching intelligence works from day one (shared graph)
- One Alex, one Mira — no persona fragmentation across users
- Workspace seed eliminates cold start — Self knows the user from Alex's prior interactions
- The Network Service can run independently of any workspace (Layer 1 + 2 users need nothing else)

**What becomes harder:**
- **We must operate a centralized service.** Even for MVP, the Network Service needs to be always-on with a public URL. This is infrastructure we own and manage.
- **API boundary adds latency.** When the deployment splits, Workspace → Network calls add network round-trips. Mitigated by caching and SSE (most data flows Network → Workspace push, not pull).
- **Two codebases to version.** The Network API becomes a contract. Breaking changes affect all connected Workspaces. Mitigated by API versioning (URL path: `/v1/network/...`).
- **Operational complexity.** Monitoring, backups, and uptime for the centralized Network Service affect all users. Single point of failure until HA is implemented.

**New constraints:**
- The Network API must be versioned from day one (even if only `v1`)
- The Network Service must have a health check endpoint (`/healthz`)
- User tokens must be revocable (in case of compromise)
- Person memory distinguishes house-level (`shared: true`) from user-level (`shared: false`) — `shared` flag on `memories` table (section 5a, documented in ADR-003)
- The workspace seed format must be stable (it's a contract between Network and Workspace)

**Follow-up decisions needed:**
- **Network Service hosting for MVP:** Hetzner VPS (aligned with ADR-018 Track B1) vs Fly.io vs Railway — developer choice, same architecture
- ~~**Custom domain for Network Service:** `api.ditto.partners` or similar — needed for webhook delivery and web front door~~ **Resolved 2026-04-17: `ditto.partners` is the Network Service domain.** The Network Service *is* the front door — marketing, workspace-lite, Layer 1 & 2 onboarding, AgentMail sender identity (`@ditto.partners`), OAuth callbacks, SSE endpoints, and webhook targets all share this host. No sub-domain split. A split may happen later if traffic or security isolation demands it; the OAuth contract survives a DNS cutover + provider redirect URI update. (`ditto.you` is reserved for the per-user workspace face, not the Network.)
- **Turso migration timeline:** When to move from SQLite-on-VPS to Turso for the Network database (enables embedded replicas for Workspaces)

**Resolved in this ADR:**
- **House-level vs user-level person memory:** Resolved — `shared` flag on person memories (section 5a). Documented in ADR-003 and architecture.md.
