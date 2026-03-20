# Research: Runtime Deployment Models for AI Agent Platforms

**Date:** 2026-03-19
**Status:** Complete
**Question:** Should an AI agent orchestration platform run locally, in the cloud, or as a hybrid?

---

## 1. Local-First Tools That Added Remote/Cloud Access

### Home Assistant + Nabu Casa

**Architecture:** Fully local smart-home server with optional cloud relay for remote access.

- Home Assistant runs entirely on local hardware (Raspberry Pi, NUC, VM)
- All automations, state, and data remain local
- Nabu Casa Cloud ($6.50/month) provides a relay/proxy service — your browser sends an encrypted request to Nabu Casa servers, which forward it to your local instance
- End-to-end encryption: Nabu Casa cannot see your data. All data is encrypted between your device and your Home Assistant instance
- The local instance maintains a persistent outbound connection to the cloud relay (no port forwarding needed)
- The remote URL only works if the local instance is connected to the relay server

**Key pattern:** Local-first with optional cloud relay. The cloud never stores user data — it only proxies encrypted connections. The local instance initiates the connection outbound, avoiding NAT/firewall complexity.

Sources:
- [Nabu Casa Remote Access](https://www.nabucasa.com/config/remote/)
- [About Home Assistant Remote Access](https://support.nabucasa.com/hc/en-us/articles/26469707849629-About-Home-Assistant-remote-access)

### Obsidian + Obsidian Sync

**Architecture:** Local-first markdown files with optional encrypted cloud sync.

- All data stored as plain markdown files on disk — works fully offline
- Obsidian Sync ($4/month) is a first-party synchronization service using a centralized remote vault architecture
- Local vaults connect directly to Obsidian's regional sync servers through the Sync Core Plugin (not file-system-level sync)
- End-to-end encryption with AES-256. Encryption/decryption occurs entirely on user devices. The encryption password is separate from account credentials
- Conflict resolution built in — edits merge when reconnecting
- Available on all platforms (Mac, Windows, Linux, iOS, Android)
- Alternative: community plugin `remotely-save` syncs via S3, Dropbox, WebDAV, OneDrive, Google Drive

**Key pattern:** Files are the interface. Cloud sync is additive, never required. E2E encryption means the sync provider can't read your data. Multiple sync backends possible.

Sources:
- [Obsidian Sync](https://obsidian.md/sync)
- [Obsidian Sync Security and Privacy](https://help.obsidian.md/sync/security)
- [remotely-save plugin](https://github.com/remotely-save/remotely-save)

### VS Code Remote Development

**Architecture:** Local UI with remote compute via three models.

1. **Remote - SSH:** Local VS Code connects to a remote machine over SSH. VS Code Server is installed on the remote OS. All file operations and terminal commands execute remotely. Communication is through an authenticated, encrypted SSH tunnel.

2. **Remote - Tunnels:** Secure tunnel without requiring SSH infrastructure. A VS Code Server runs on the remote machine and creates a tunnel through Microsoft's relay. You connect from any VS Code client (including browser) without port forwarding. End-to-end encryption over the tunnel.

3. **Dev Containers:** Opens a folder inside a Docker container (local or remote). Can combine with SSH or Tunnels — e.g., connect to a remote host via tunnel, then open a container on that host.

**Key pattern:** Local UI is thin; compute happens wherever you point it. The tunnel model (outbound connection from remote, relay through cloud) is the same pattern as Home Assistant. No sensitive data stored on the relay.

Sources:
- [VS Code Remote Development Overview](https://code.visualstudio.com/docs/remote/remote-overview)
- [VS Code Remote Tunnels](https://code.visualstudio.com/docs/remote/tunnels)
- [VS Code Remote SSH](https://code.visualstudio.com/docs/remote/ssh)

### Ollama

**Architecture:** Local AI model serving with manual remote access configuration.

- By default, Ollama only listens on localhost (port 11434)
- Exposes a REST API compatible with the OpenAI API format
- To enable remote access, set `OLLAMA_HOST=0.0.0.0` — but this is insecure without protection
- Secure remote access methods:
  - SSH tunneling (encrypts all traffic, requires SSH credentials)
  - Reverse proxy with authentication (nginx, Caddy)
  - Mesh VPN like Tailscale (preferred for internet access)
  - ngrok tunneling
- No first-party cloud relay service. Remote access is DIY
- People run it on Raspberry Pi, home servers, and VPS instances

**Key pattern:** Designed for local use. Remote access is possible but requires user configuration. No official cloud component. The community uses Tailscale as the "Home Assistant Nabu Casa equivalent" for Ollama.

Sources:
- [Remote Ollama Access Guide](https://kitemetric.com/blogs/remote-ollama-access-a-comprehensive-guide)
- [Ollama Cloud Docs](https://docs.ollama.com/cloud)
- [Exposing Ollama on Raspberry Pi](https://www.mykolaaleksandrov.dev/posts/2025/09/exposing-ollama-raspberry-pi-linux-remote-access/)

### Gitea

**Architecture:** Self-hosted Git service, single binary (Go), with optional remote exposure.

- Written in Go, works across all Go-supported platforms and architectures
- Supports SQLite (lightweight, self-contained) or MySQL/PostgreSQL for more performance
- Common deployment: Docker Compose with nginx reverse proxy + TLS/SSL
- Remote access via reverse proxy, Tailscale, or Cloudflare Tunnel
- Gitea Actions provides CI/CD compatible with GitHub Actions workflows
- Backup is straightforward: config file + data directory

**Key pattern:** Single binary with embedded database option. Start simple (SQLite on a Pi), scale up (Postgres on a VPS) without changing the application.

Sources:
- [Gitea GitHub Repository](https://github.com/go-gitea/gitea)
- [Self-Hosting Gitea Guide](https://blog.inedo.com/self-hosted/gitea)

### Nextcloud

**Architecture:** Self-hosted cloud platform with multiple deployment paths.

- Docker Compose deployment: Caddy (reverse proxy + TLS) + Nextcloud (Apache/PHP) + MariaDB + Redis, all on a private Docker bridge network
- Also available as NextcloudPi (Raspberry Pi script) or Nextcloud VM appliance
- Remote access options:
  - Tailscale (secure private mesh network using WireGuard)
  - Cloudflare Tunnel (no public IP needed)
  - Traditional port forwarding with DDNS
- Supports local-only deployment with valid HTTPS certificates
- Storage can be local disk, NAS (TrueNAS), or remote object storage

**Key pattern:** The full self-hosted cloud stack. More complex than single-binary tools but provides a complete platform. Remote access is a solved problem via Tailscale or Cloudflare Tunnel.

Sources:
- [Nextcloud Self-Hosted Architecture](https://alexandre.deverteuil.net/post/nextcloud-self-hosted-architecture/)
- [Self-Hosting Nextcloud in 2025](https://aicybr.com/blog/self-hosting-nextcloud)

---

## 2. Cloud-Native Agent Platforms

### Paperclip (paperclipai/paperclip)

**Architecture:** Node.js server + React UI for orchestrating AI agent teams.

- **Local:** Single Node.js process with embedded Postgres and local file storage. `pnpm dev` starts the API server at localhost:3100. No setup required.
- **Production:** Point at your own Postgres and deploy however you like. Docker deployment with named data volumes, health checks, authenticated deployment mode by default.
- **Tech stack:** TypeScript (96.3%), Node.js 20+, pnpm 9.15+, Drizzle ORM, PostgreSQL
- **Agent runtime model:** Agents coordinate via heartbeats (scheduled wake-ups). Supports event-based triggers (task assignment, mentions) alongside scheduled execution. Paperclip is the orchestration layer; agents run on their own schedules.
- **Multi-tenant:** Every entity is company-scoped; one deployment can run many companies with separate data and audit trails.
- **Remote access:** Tailscale suggested for solo entrepreneurs; Vercel for production scaling.

**Key pattern:** Embedded Postgres for zero-config local dev, external Postgres for production. Heartbeat-based agent scheduling. The orchestrator is always-on; agents are episodic.

Sources:
- [Paperclip GitHub](https://github.com/paperclipai/paperclip)
- [Paperclip Website](https://paperclip.ing/)

### Mastra (mastra-ai/mastra)

**Architecture:** TypeScript AI agent framework with multiple deployment targets.

- **Local dev:** Local playground for testing workflows, agents, RAG pipelines, evals. Runs on Node.js v22.13.0+, Bun, Deno, or Cloudflare runtime.
- **Server mode:** Standalone Hono-powered HTTP server. `mastra build` creates deployable output for VMs, containers, or PaaS. Supports long-running processes and WebSocket connections.
- **Serverless:** Platform-specific deployers for Vercel, Cloudflare, Netlify, AWS Lambda.
- **Cloud providers:** EC2, Lambda, DigitalOcean, Azure App Services.
- **Framework integration:** Embeds into Next.js and Astro applications.
- **Mastra Cloud:** Managed platform (beta) with zero-config deployment, GitHub CI, atomic deployments packaging agents + tools + workflows together.
- **Workflow execution:** Built-in execution engine by default. Can integrate Inngest for step memoization, retries, and monitoring.
- **From:** The team behind Gatsby. YC-backed.

**Key pattern:** Framework-first approach. Build locally, deploy anywhere. The framework doesn't dictate infrastructure. Optional managed cloud for convenience.

Sources:
- [Mastra Deployment Overview](https://mastra.ai/docs/deployment/overview)
- [Mastra GitHub](https://github.com/mastra-ai/mastra)
- [Mastra Cloud](https://mastra.ai/en/docs/mastra-cloud/overview)

### Trigger.dev

**Architecture:** Background job platform with checkpoint-restore system.

- **Cloud (managed):** Fully managed, scalable, dedicated support. Includes warm starts, auto-scaling, and checkpoints (suspend/resume without wasting resources).
- **Self-hosted:** Two independently scalable container groups:
  - **Webapp:** Dashboard + Redis + Postgres
  - **Worker:** Supervisor + task execution runners
  - Deployment via Docker Compose or Kubernetes
  - Self-hosted lacks: warm starts, auto-scaling, checkpoints, dedicated support
- **v3/v4 architecture:** Fundamentally different from v2. Checkpoint-restore system allows tasks to wait indefinitely without wasting resources.
- **v4 self-hosting improvements:** No custom startup scripts, built-in registry and object storage, simple Docker Compose commands.
- **"Bring Your Own Cloud":** Option to run Trigger.dev infrastructure on your own cloud account.

**Key pattern:** Cloud-first with self-hosted option. The most valuable features (checkpoints, warm starts) are cloud-only. Self-hosting is possible but requires DevOps expertise and sacrifices key features.

Sources:
- [Trigger.dev Self-Hosting Overview](https://trigger.dev/docs/self-hosting/overview)
- [Self-hosting v4 with Docker](https://trigger.dev/blog/self-hosting-trigger-dev-v4-docker)
- [Trigger.dev GitHub](https://github.com/triggerdotdev/trigger.dev)

### Inngest

**Architecture:** Event-driven workflow orchestration as a service.

- **How it works:** You define functions using the SDK, deploy them to your platform, and expose an HTTP endpoint (`/api/inngest`). Inngest calls your code via HTTP when events fire. Alternatively, you can connect via outbound WebSocket.
- **Cloud (managed):** Inngest manages event reception, scheduling, queue, execution dispatch, and retries. You send events; Inngest automatically executes your functions.
- **Self-hosted:** Open-source server with external Postgres + Redis. Architecture includes: Event API, Runner (scheduling), Queue (flow control), Executor (function calls), Dashboard UI.
- **Framework support:** Next.js, Express, Cloudflare Pages, Nuxt, Deno, Remix.
- **Deploy targets:** Vercel, Netlify, Cloudflare, Deno, DigitalOcean, Railway.
- **No queues to configure:** Inngest manages function state and retries. Supports serverless and serverful by default.

**Key pattern:** Your code runs on your infrastructure; Inngest is the scheduler/orchestrator that calls it. Decouples "where your code runs" from "what triggers it." Works with serverless (no always-on requirement).

Sources:
- [Inngest GitHub](https://github.com/inngest/inngest)
- [Inngest Documentation](https://www.inngest.com/docs/learn/serving-inngest-functions)
- [Inngest Website](https://www.inngest.com/)

### Temporal

**Architecture:** Workflow orchestration platform with durable execution.

- **Temporal Cloud:** Cell-based architecture with isolated deployment units. Each cell has its own cloud account, VPC, Kubernetes cluster, and three-zone database replication. Manages workflow state, event history, task queuing, and scheduling. Consumption-based pricing starting at $100/month (Essentials tier), $50 per million actions.
- **Self-hosted:** Run the full Temporal service yourself. Requires Postgres or Cassandra, plus four independent services. Labor-intensive to scale for high-throughput. Maximum infrastructure control.
- **Worker model:** Workers run in YOUR environment. Temporal Cloud never sees your application logic or sensitive data. Workers connect via mTLS or API keys over encrypted gRPC.
- **Portability:** Applications built for self-hosted work on Cloud without modification — just update the connection config.
- **Performance:** Cloud has significantly lower end-to-end latency due to custom persistence layer with WAL and tiered storage.

**Key pattern:** Clean separation between orchestration plane (Temporal) and execution plane (your workers). Your code and data stay in your environment. The orchestrator is the managed service. Portable between self-hosted and cloud.

Sources:
- [Temporal Cloud Overview](https://docs.temporal.io/cloud/overview)
- [Cloud vs Self-Hosted Features](https://docs.temporal.io/evaluate/development-production-features/cloud-vs-self-hosted-features)
- [Self-Hosted Guide](https://docs.temporal.io/self-hosted-guide)

---

## 3. Hybrid Models (Local Engine + Cloud API)

### Claude Code

**Architecture:** Local CLI + cloud AI API + optional cloud execution.

- **Local component:** CLI runs on your machine, reads/writes local files, executes local commands, manages conversation context. Orchestration (tool execution, context management, retries) happens locally.
- **Cloud component:** AI inference calls go to Anthropic's API. Your code snippets are sent for analysis. No persistent storage of code by Anthropic (used for inference, then discarded — per privacy policy).
- **Async/background mode:** The `&` prefix dispatches prompts to the cloud where Claude works asynchronously. You can close your terminal, switch devices, or continue with other work. Web interface at claude.ai/code shows running and completed sessions.
- **Agent SDK:** Two core interfaces for building agents. Supports subagents, parallel execution, hooks, tools, MCP integration. Orchestration runs locally; AI calls go to cloud.
- **Background tasks:** `Ctrl+B` moves commands to background. Background processes keep running even if you close the terminal (with sleep disabled). Tasks have unique IDs for tracking.
- **Remote bridging:** Tools like Clautel run Claude Code as a background daemon and bridge it to Telegram for remote usability.

**Key pattern:** Local orchestration + cloud AI. The "always-on" problem is solved by async cloud execution for the AI work, while file operations remain local. The async mode directly addresses "can't advance projects without being at the computer."

Sources:
- [Claude Code Overview](https://code.claude.com/docs/en/overview)
- [Claude Code Interactive Mode](https://code.claude.com/docs/en/interactive-mode)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)

### Cursor

**Architecture:** Local VS Code fork + cloud AI backend.

- **Local component:** Desktop application based on VS Code fork. Handles editing, file management, local indexing. Some lightweight processing (chunking code for indexing) happens locally.
- **Cloud component:** Code snippets are encrypted locally before transmission. Cloud servers decrypt, run AI inference, return completions. Ultra-low latency target (under 1 second). Code is used on-the-fly for inference and then discarded — not persistently stored.
- **Infrastructure:** Backend handles 1M+ QPS primarily from autocomplete requests. Hosted on AWS. Uses Terraform for cloud management.
- **Cloud agents:** Cursor has introduced cloud-based agents that can write, run, and verify code in cloud environments.

**Key pattern:** Thin local client + heavy cloud AI backend. Privacy via encrypt-in-transit + no-persistence. The local component provides the familiar UX; the cloud provides the intelligence.

Sources:
- [How Cursor Works Internally](https://adityarohilla.com/2025/05/08/how-cursor-works-internally/)
- [How Cursor Serves Billions of Completions](https://blog.bytebytego.com/p/how-cursor-serves-billions-of-ai)

### Claude Agent SDK

**Architecture:** Local agent runtime + cloud AI inference.

- **Orchestration:** Runs locally (or on your server). Handles tool execution, context management, retries, multi-agent coordination.
- **AI calls:** Go to Anthropic's API for inference.
- **Multi-agent:** Supports subagents with parallel execution. Orchestrator handles global planning and delegation. Subagents get isolated context windows and return only relevant information.
- **Tool integration:** Local tools + MCP servers. Agent code runs wherever you deploy it.
- **Previously called:** Claude Code SDK. Renamed late 2025 to reflect broader usage (legal assistants, SRE bots, research agents).

**Key pattern:** You own the orchestration; Anthropic provides the inference. Deploy the orchestrator wherever makes sense for your use case.

Sources:
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)

### Supabase

**Architecture:** Local dev stack (Docker) + cloud production.

- **Local:** `supabase start` spins up the entire stack locally in Docker: Postgres database, Auth, Storage, Edge Functions runtime. Develop against the exact same environment you'll deploy to.
- **Cloud:** Managed Postgres, Auth, Storage, Edge Functions, Realtime subscriptions. Multiple environment support (dev, staging, production).
- **CLI:** Manages local stack, schema migrations, environment management, CI/CD integration.
- **Gap:** Local development environment is not fully feature-complete compared to cloud. Some documented gaps exist.
- **Edge Functions:** Use Deno runtime locally and in production, maintaining consistency.

**Key pattern:** Mirror environments between local and cloud. Schema migrations bridge the gap. Local development is fast and offline-capable; cloud is production-grade.

Sources:
- [Supabase Local Development](https://supabase.com/docs/guides/local-development)
- [Supabase Deployment](https://supabase.com/docs/guides/deployment)

### PocketBase

**Architecture:** Single executable backend with embedded SQLite.

- **Single binary:** Go application that bundles API server, admin dashboard, auth, file storage, realtime subscriptions, and SQLite database into one executable.
- **Database:** Embedded SQLite in WAL mode exclusively. No plans for other databases. The entire database is a `.db` file alongside the executable.
- **Deployment:** Runs anywhere — VPS, local machine, Raspberry Pi. No external dependencies. Statically compilable (`CGO_ENABLED=0`).
- **Performance:** 10,000+ persistent realtime connections on a $4 Hetzner CAX11 VPS (2vCPU, 4GB RAM).
- **Scaling:** Vertical only, single server. No horizontal scaling, no clustering. Suitable for up to ~10,000 users.
- **No cloud option:** Exclusively self-hosted. No managed hosting offered.
- **Extensibility:** Can be used as a Go framework (extend with custom Go code) or standalone with JavaScript hooks.

**Key pattern:** Maximum simplicity and portability. One file = your entire backend + database. The trade-off is vertical-only scaling. Ideal for single-developer projects and internal tools.

Sources:
- [PocketBase GitHub](https://github.com/pocketbase/pocketbase)
- [PocketBase FAQ](https://pocketbase.io/faq/)
- [PocketBase Guide](https://betterstack.com/community/guides/database-platforms/pocketbase-backend/)

---

## 4. The "Always-On" Problem for Agent Orchestration

### The Core Problem

When the computer enters sleep/hibernate mode, all Node.js timers (setInterval, setTimeout, cron libraries) are paused. Scheduled task executions are missed entirely with no indication. This breaks heartbeats, cron-based agent wake-ups, and any process that needs periodic execution.

Sources:
- [Akamai: Your Agent Doesn't Sleep, Your Laptop Does](https://www.akamai.com/blog/developers/openclaw-agent-doesnt-sleep-laptop-does-move-cloud)
- [OpenClaw Cron Jobs That Never Wake](https://medium.com/@chen.yang_50796/openclaw-cron-jobs-that-never-wake-fixing-multi-agent-heartbeat-b1b38a0c7579)

### Solution Categories

#### A. Raspberry Pi / Home Server

- Power consumption under 15W at full load — negligible electricity cost
- Runs 24/7 without sleep issues
- Pi 5 (8GB) costs ~$80 one-time, suitable for lightweight services
- Common stack: Docker + Portainer for container management
- Can run Gitea, Home Assistant, n8n, Node.js services
- Limitation: ARM architecture, limited compute, no GPU for local AI models (except small ones via Ollama on Pi 5)

Sources:
- [Raspberry Pi Self-Hosted Projects](https://blog.dreamfactory.com/10-surprisingly-powerful-projects-you-can-run-on-a-raspberry-pi-2025-2026)
- [Self-Hosting on Raspberry Pi](https://www.xda-developers.com/services-self-host-raspberry-pi-instead-main-home-server/)

#### B. Always-On VPS

| Provider | Cheapest Always-On | Specs | Notes |
|----------|-------------------|-------|-------|
| **Hetzner** | ~EUR 3.49/month (CX23) | 2 vCPU shared, 4GB RAM, 40GB SSD | 20TB traffic included. Price increase to ~EUR 5-8/month from April 2026. Unmanaged. |
| **Fly.io** | ~$2.36/month | shared-cpu-1x, 256MB RAM | Billed per second. No free tier for new customers (free trial: 2 VM hours or 7 days). 40% discount with reservations. |
| **Railway** | $5/month (Hobby plan) | Usage-based within $5 credit | $5 subscription always charged. Usage-based compute within that. 30-day free trial with $5 credit. |
| **Render** | $7/month (Starter) | Always-on web service | Free tier spins down after 15 minutes of inactivity. Background workers require paid plan. |
| **Oracle Cloud** | Free (Always Free tier) | 1 OCPU, 1GB RAM (AMD); up to 4 OCPU, 24GB RAM (ARM) | Genuinely free forever tier. ARM instances are generous. |

Sources:
- [Hetzner Cloud Pricing](https://www.hetzner.com/cloud)
- [Fly.io Pricing](https://fly.io/pricing/)
- [Railway Pricing](https://railway.com/pricing)
- [Render Pricing](https://render.com/pricing)
- [Hetzner 2026 Review](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/)

#### C. Serverless Cron

| Platform | Free Tier Cron | Paid Cron | Execution Limit | Notes |
|----------|---------------|-----------|-----------------|-------|
| **Vercel** | 2 cron jobs, once/day max | More frequent on Pro ($20/mo) | 15 min max execution | Cron invokes serverless functions. Pro includes 40 CPU-hours/month. |
| **Cloudflare Workers** | Cron triggers included in free tier | Same, no extra cost | 10ms CPU (free), 30s (paid) | No additional cost for cron. Free tier: 100K requests/day. Combine with Workflows for long tasks. |
| **Netlify** | Scheduled functions on all plans | Background functions on Pro | 30s (scheduled), 15 min (background) | Credit-based pricing since Sept 2025. 5 credits per GB-hour. |

Sources:
- [Vercel Cron Jobs Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Cloudflare Workers Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Netlify Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)

#### D. Docker on a NAS (Synology, etc.)

- Modern Synology NAS devices support Docker via Container Manager
- Always-on (NAS is designed to run 24/7)
- Can run Node.js services, n8n, Gitea, and custom Docker containers
- Management via Portainer, Dockhand, or Synology's native Container Manager
- Combines storage + compute + always-on in one device
- Remote access via Tailscale or Cloudflare Tunnel

Sources:
- [Docker Containers for Synology NAS](https://www.xda-developers.com/docker-containers-you-should-run-on-your-synology-nas/)
- [n8n on Synology NAS with Tailscale](https://grokipedia.com/page/n8n_on_Synology_NAS_with_Tailscale)

### How Open SWE (langchain-ai/open-swe) Handles This

- Deployed on LangGraph Platform (LGP) — purpose-built for long-running agents with built-in persistence and autoscaling
- Triggered from Slack, Linear, or GitHub (mention the bot)
- Each task runs in an isolated cloud sandbox (Modal, Daytona, Runloop, or LangSmith)
- Each thread gets a persistent sandbox reused across follow-up messages
- Multiple tasks run in parallel, each in separate sandboxes
- The agent runtime is fully cloud-hosted — no laptop dependency

**Key pattern:** Cloud-hosted orchestrator + cloud sandboxes. The "always-on" problem is solved by running everything in the cloud. Trigger surfaces (Slack, GitHub) are inherently always-available.

Sources:
- [Open SWE Blog Post](https://blog.langchain.com/open-swe-an-open-source-framework-for-internal-coding-agents/)
- [Open SWE GitHub](https://github.com/langchain-ai/open-swe)

---

## 5. Data Sovereignty and Security Considerations

### Where Data Lives in Each Model

| Model | Process Definitions | Feedback/Outputs | Agent Memories | API Keys |
|-------|-------------------|-------------------|----------------|----------|
| **Fully Local** (PocketBase, SQLite) | Local disk | Local disk | Local disk | Local env vars / .env files |
| **Local + Cloud Relay** (Home Assistant) | Local disk | Local disk | Local disk | Local config |
| **Local + Cloud Sync** (Obsidian) | Local + encrypted cloud copy | Local + encrypted cloud copy | Local + encrypted cloud copy | N/A |
| **Local + Cloud AI** (Claude Code, Cursor) | Local disk | Local disk | Local disk | Local env vars; code snippets sent to AI provider transiently |
| **Cloud Orchestrator** (Temporal, Inngest) | Your infrastructure | Your infrastructure | Your infrastructure | Your infrastructure; orchestrator sees event metadata |
| **Fully Managed** (Mastra Cloud, Trigger.dev Cloud) | Provider infrastructure | Provider infrastructure | Provider infrastructure | Provider-managed secrets |

### SQLite (Local) vs Hosted Postgres (Cloud) for Data Portability

**SQLite advantages:**
- Entire database is a single file — copy it anywhere
- Cross-platform format, no server needed to read it
- Zero-config, no connection strings, no credentials
- Backup = file copy
- Works offline by definition

**PostgreSQL advantages:**
- Concurrent write access (row-level locking vs SQLite's file-level locking)
- Scales horizontally with read replicas
- Rich ecosystem of managed hosting (Supabase, Neon, RDS, etc.)
- Better tooling for migrations, monitoring, and backup at scale
- Required by most production orchestration platforms (Temporal, Trigger.dev, Inngest)

**Migration path:** Most teams treat SQLite as disposable and start fresh with Postgres for production. Schema differences exist. Tools like pgloader or Drizzle ORM can abstract the database layer.

Sources:
- [PostgreSQL vs SQLite Comparison](https://dev.to/lovestaco/postgresql-vs-sqlite-dive-into-two-very-different-databases-5a90)
- [SQLite vs PostgreSQL for n8n](https://lumadock.com/tutorials/n8n-postgresql-vs-sqlite)

### The Turso/libSQL Model (Local SQLite + Cloud Sync)

**Architecture:** Fork of SQLite (libSQL) that adds cloud synchronization.

- **Primary database** hosted on Turso Cloud (libSQL server) — handles writes, manages WAL
- **Embedded replicas** are local SQLite files that maintain sync with the primary
- **Sync protocol:** Frame-based — changes propagate as discrete units (frames), not individual operations. Replicas request missing frames by frame number.
- **Read-your-writes guarantee:** After a write returns, the initiating replica always sees the new data immediately
- **Offline writes:** In beta. Local database accepts writes offline, syncs to cloud when reconnected, with conflict resolution
- **Use case:** Eliminates complex caching layers. Your app connects to a local SQLite file for reads; writes forward to the primary

**Key pattern:** SQLite's simplicity and portability + cloud durability and multi-device sync. The best of both worlds, with the trade-off of depending on Turso's infrastructure for the sync protocol.

Sources:
- [Turso Embedded Replicas](https://turso.tech/blog/local-first-cloud-connected-sqlite-with-turso-embedded-replicas)
- [Turso Offline Sync Beta](https://turso.tech/blog/turso-offline-sync-public-beta)
- [libSQL GitHub](https://github.com/tursodatabase/libsql)

### API Key Storage Approaches

- **Local env vars / .env files:** Simplest. Keys stay on disk. Risk: accidental commit to version control.
- **Self-hosted secrets managers:** Infisical (open-source, MIT license, self-hostable), HashiCorp Vault. Full control over secrets infrastructure.
- **Cloud secrets managers:** AWS Secrets Manager, Azure Key Vault, Google Cloud Secret Manager. Integrated with cloud services, managed rotation.
- **LLM gateways:** Centralized API key storage with rotation, usage tracking, and access controls. Examples: Mozilla any-llm platform (client-side encryption with XChaCha20-Poly1305 before keys leave the device).
- **Per-platform patterns:** Gitea stores secrets in repo settings. Trigger.dev uses environment variables. Paperclip uses Docker secrets.

Sources:
- [Infisical GitHub](https://github.com/Infisical/infisical)
- [Mozilla any-llm Platform](https://blog.mozilla.ai/introducing-any-llm-managed-platform-a-secure-cloud-vault-and-usage-tracking-service-for-all-your-llm-providers/)
- [Best Secrets Management Tools 2026](https://cycode.com/blog/best-secrets-management-tools/)

---

## 6. Cost Models

### Always-On Small Service (Monthly)

| Option | Monthly Cost | One-Time Cost | Pros | Cons |
|--------|-------------|---------------|------|------|
| **Raspberry Pi 5 (8GB)** | ~$3-5 electricity | ~$80-100 hardware | True ownership, no vendor lock-in, silent, low power | ARM-only, limited compute, need to manage hardware/networking |
| **Hetzner CX23** | EUR 3.49 (~$3.80) | $0 | x86, 2vCPU/4GB, 20TB traffic, NVMe SSD | Unmanaged, EU-based, price increase April 2026 |
| **Oracle Cloud Free** | $0 | $0 | Up to 4 ARM cores + 24GB RAM free forever | Oracle, limited regions, "free" can change |
| **Fly.io minimal** | ~$2.36 | $0 | Global edge, per-second billing, Docker-native | 256MB RAM at minimum, no free tier, complexity |
| **Railway Hobby** | $5 | $0 | Fastest DX, usage-based within $5, GitHub deploy | $5 minimum even if unused, limited resources |
| **Render Starter** | $7 | $0 | Simple, good free tier for static, managed Postgres | Free tier sleeps after 15 min, paid for always-on |
| **Synology NAS** | ~$5-10 electricity | $200-500+ hardware | Always-on, storage + compute, Docker support | Expensive upfront, proprietary OS |

### Serverless Cron (Monthly, Light Usage)

| Platform | Free Tier | Paid Tier for More | Best For |
|----------|-----------|-------------------|----------|
| **Cloudflare Workers** | 100K requests/day, cron included | $5/month (paid plan) | Lightweight periodic tasks, no always-on needed |
| **Vercel** | 2 cron jobs, 1x/day | $20/month (Pro) for more frequency | Projects already on Vercel |
| **Netlify** | Scheduled functions on all plans | Credit-based, varies | Projects already on Netlify |

### Agent Platform Costs

| Platform | Self-Hosted Cost | Managed Cloud Cost |
|----------|-----------------|-------------------|
| **Temporal** | Infrastructure + ops team time | $100/month minimum (Essentials) + $50/M actions |
| **Trigger.dev** | Docker infrastructure costs | Free tier available, usage-based pricing |
| **Inngest** | Self-hosted server + Postgres + Redis | Free tier, then usage-based |
| **Mastra** | Your infrastructure | Mastra Cloud (beta, pricing TBD) |

Sources:
- [Fly.io Pricing](https://fly.io/pricing/)
- [Railway Pricing Plans](https://docs.railway.com/pricing/plans)
- [Render Pricing](https://render.com/pricing)
- [Hetzner Cloud](https://www.hetzner.com/cloud)
- [Vercel Pricing](https://vercel.com/pricing)
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Temporal Cloud Overview](https://docs.temporal.io/cloud/overview)
