# Insight 152: The Network Service Is Centralized, the Workspace Is Distributed

**Date:** 2026-04-06
**Source:** Architecture discussion during Network Agent MVP (Brief 079)
**Status:** Active — shapes ADR-018 amendment and deployment architecture
**Consumers:** ADR-018 (deployment), Brief 079 (Network Agent), architecture.md

## The Insight

ADR-018 assumes every user gets their own isolated Ditto instance. The Network Agent breaks this assumption. The superconnector's value comes from the shared relationship graph — Alex knowing everyone across all users. If every user deploys their own isolated Ditto, Alex can only search one user's contacts. No network effect. No cross-user intelligence. The whole superconnector value proposition collapses.

**The deployment model is not one thing. It's two:**

1. **Ditto Network** (centralized, always-on, one deployment) — the "firm"
2. **Ditto Workspace** (per-user, distributed, many deployments) — the "desk"

These are connected via API. Alex is one Alex who spans both.

## Why This Matters

### The superconnector needs centralized intelligence

When Alex is in Connecting mode — "help me find a logistics consultant" — Alex's value comes from knowing everyone in the network, not just one user's contacts. This requires:
- A shared person graph (people known across all users)
- Cross-user match quality signals (anonymized: "this person has had 3 positive introductions" without revealing who)
- Institutional person memory ("Priya prefers email, is in Melbourne")
- Centralized email infrastructure (one Alex inbox, not N copies)

### But the workspace needs to be per-user

Users need their own data, their own Self, their own processes, their own trust tiers. Some will self-host for data sovereignty (ADR-018 Track B). The workspace is personal — the chief of staff is yours.

### The three-layer journey demands this split

- **Layer 1 (Network Participant):** Only touches the Network Service. They got an email from Alex. They don't have a workspace. They might not know Ditto is a product.
- **Layer 2 (Active User):** Touches the Network Service + lightweight user binding. Working with Ditto via email. No workspace needed.
- **Layer 3 (Workspace User):** Full workspace (self-hosted or managed cloud) + connected to the Network Service.

Layer 1 and Layer 2 users exist entirely on the centralized Network Service. They never need a workspace deployment. This is how someone starts with Ditto without needing a VPS.

## The Architecture

### Ditto Network (centralized)

| Owns | Why centralized |
|------|----------------|
| Shared person graph (people table) | Cross-user matching requires one graph |
| Alex & Mira inboxes (AgentMail) | One Alex, institutional identity |
| House-level person memory | "Priya prefers email" is institutional knowledge |
| Email send/receive/webhooks | Always-on, public URL for webhooks |
| Nurture scheduler | Fires whether users are online or not |
| Web front door (landing, verification, intake) | Public-facing, always available |
| Pre-send quality gate (house values) | Institutional judgment, not per-user |
| Match quality signals (anonymized) | Cross-user intelligence |
| Network API | Interface for workspaces to connect |

### Ditto Workspace (per-user)

| Owns | Why per-user |
|------|-------------|
| Self (Conversational Self, ADR-016) | Personal chief of staff |
| Self-scoped memory (user model) | "Tim's ICP is Series A SaaS" — private |
| User-scoped person notes | "I introduced Priya for my logistics needs" — private |
| Sales/connection plans | Private strategy |
| Processes, trust tiers, work items | Personal workflow |
| Draft review queue | User approves their own outreach |
| Workspace UI (three-panel layout) | Personal interface |

### The API Bridge

The Workspace connects to the Network Service like any other integration (ADR-005 pattern):

```
Workspace → Network API:
  POST /network/plan     — submit a sales or connection plan
  POST /network/approve  — approve a draft for sending
  GET  /network/status   — get network briefing data
  GET  /network/people   — list connections for this user
  POST /network/opt-out  — mark a person as opted out

Network → Workspace (webhook/push):
  reply_received    — someone replied to outreach
  draft_ready       — outreach draft waiting for approval
  meeting_booked    — calendar event created
  introduction_made — both parties notified
  intake_started    — someone started an intake via web
```

### Alex spans both

Alex is not a deployment unit. Alex is an identity that loads different context depending on what they're doing:

- **Self mode** (in Workspace): Loads user's self-scoped memory + persona config + character bible. Alex talks to the user.
- **Selling mode** (in Network Service): Loads the user's plan (passed via API) + person memory (from Network DB) + persona config + character bible. Alex sends emails.
- **Connecting mode** (in Network Service): Loads the user's connection request + the FULL shared person graph + persona config + character bible. Alex searches the whole network.
- **Nurture mode** (in Network Service): Loads the user's relationship graph + persona config + character bible. Alex maintains relationships.

Same persona config. Same character bible. Same voice. Different context assembled at invocation time.

## The Three Entry Paths

### Path 1: Network participant (no deployment needed)
Someone gets an email from Alex. They interact via email. They're in the Network Service's person graph. Zero infrastructure on their side.

### Path 2: Active user (no workspace needed)
Someone starts working with Ditto via email intake. The Network Service creates a lightweight user record. Alex creates plans, sends outreach, reports back — all via email. The user's "workspace" is their email inbox. When they need more structure, they get a workspace.

### Path 3: Workspace user (workspace deployed)
Someone either:
- Started via the product (managed cloud signup → instant workspace, per ADR-018 Track A)
- Graduated from active user (Network Service provisions a workspace invitation)
- Self-hosted (git clone → VPS, per ADR-018 Track B)

Their workspace connects to the central Network Service on first setup.

## Alex IS the Onboarding

Every user starts by talking to Alex on the Network Service. Not a signup form. Not a workspace. A conversation — via email, web front door, or phone.

By the time someone considers a workspace, Alex already knows them: their business, goals, communication style, network, what's worked. This knowledge lives on the Network Service as **network-scoped user memory** — the same self-scoped memory concept, but built through network interactions.

### The User Model on the Network

Active users (Layer 2) need more than a person record. They need a user model:
- Business context ("runs a consulting business targeting SaaS")
- Communication preferences ("direct, no fluff")
- Working context (ICP, plans, trust settings)
- Learned patterns ("best results with companies 50-200 people")
- Correction patterns ("edited 3 drafts — tone too formal")

This is what Alex uses to operate as their BDR/connector without a workspace.

### The Workspace Seed

When a user decides to get a workspace:
1. Workspace spins up (managed cloud or self-hosted)
2. Workspace calls Network API: `GET /network/seed?userId=X`
3. Network returns: user model memories, connection graph, interaction history, active plans, trust settings
4. Workspace imports as self-scoped memories + person records
5. **Self already knows them.** No cold start. No re-onboarding. First workspace conversation references everything Alex has learned.

After the seed, both stay connected. Network is canonical for network knowledge. Workspace is canonical for workspace knowledge. They sync via the API bridge.

## For MVP

Same server runs both. The code separates into:
- Network-service-ready modules (people, channel, persona, network-tools, intake, verify)
- Workspace modules (self, processes, harness, trust)

The separation is in the code and data model now. The deployment split happens when User 2 arrives.

## What This Changes in ADR-018

ADR-018's two-track model (managed cloud vs self-hosted) still holds for the **Workspace**. But it needs a third element: **the centralized Network Service** that all workspaces connect to, regardless of their deployment track.

```
ADR-018 today:          ADR-018 amended:

Track A (Cloud)          Ditto Network (centralized, always-on)
Track B (Self-hosted)      ↕ API ↕
                         Track A (Cloud Workspace)
                         Track B (Self-hosted Workspace)
```
