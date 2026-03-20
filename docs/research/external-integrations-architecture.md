# Research: External Integrations Architecture

**Date:** 2026-03-19
**Question:** What architectural approach should Agent OS take for integrating with external systems (email, communication channels, Google Drive, web, accounting software, etc.)?
**Status:** Complete — awaiting review

---

## Context

Agent OS processes don't operate in isolation. A process like "invoice reconciliation" needs to read emails, access accounting software (Xero, QuickBooks), and write to Google Sheets. A "customer onboarding" process needs CRM access, email sending, and document generation. The architecture spec (Layer 2) already declares `Tools: authorised tools and MCP connections for this agent` in the agent harness, but doesn't specify how those tools connect to external systems.

This research maps the landscape of integration approaches and identifies seven architectural options for Agent OS.

---

## The Integration Surface in Agent OS

Integrations touch multiple layers of the architecture:

| Layer | Where integrations appear | Example |
|-------|--------------------------|---------|
| **L1 Process** | Input sources, output destinations | "Input source: Gmail inbox" / "Output destination: Xero" |
| **L2 Agent** | Tools available to agents during execution | Agent can call Google Drive API, send Slack messages |
| **L3 Harness** | Review outputs may need to be pushed to external systems | Approved invoice → post to accounting system |
| **L4 Awareness** | External events trigger processes | New email arrives → starts processing pipeline |
| **L6 Human** | Notifications via external channels | Slack/email alerts when review needed |

Two distinct integration modes exist:

1. **Agent tool use** — An agent needs to read/write an external system as part of executing a process step (e.g., "look up this customer in Salesforce")
2. **Process I/O** — A process declares an external system as an input source or output destination (e.g., "trigger: new email in inbox" / "output → post to Slack channel")

These are architecturally different. Agent tool use happens inside a step execution. Process I/O happens at process boundaries.

---

## The 2026 Integration Landscape

### Six Integration Patterns

(Five from Composio "APIs for AI Agents: The 5 Integration Patterns" + CLI pattern from 2026 landscape)

| Pattern | How it works | Best for | Auth handling | Maintenance |
|---------|-------------|----------|---------------|-------------|
| **Direct API calls** | Agent code makes raw HTTP requests | 1-2 stable APIs, prototypes | Manual (you manage tokens) | Highest — every API change breaks you |
| **Tool/Function calling** | LLM selects from defined tool schemas, backend executes | Small curated toolset (1-10) | You build per-tool | High — schema management + execution + auth per tool |
| **MCP Gateway** | Standardised server exposes tools; agent discovers and calls via protocol | Enterprise governance, tool discovery | Centralised in MCP server | Medium — MCP server per service |
| **Unified API** | One standardised API for entire software categories; platform translates to native APIs | 10-100+ SaaS integrations at scale | Platform handles entirely | Lowest — outsourced to provider |
| **CLI execution** | Agent writes shell commands to invoke service CLIs (gh, gws, stripe, aws) | Services with mature CLIs, cost-sensitive | OS-level (keyrings, env vars) | Low — CLI maintained by service provider |
| **Agent-to-Agent (A2A)** | Agents delegate to specialised agents that own their integrations | Multi-agent ecosystems, research | Per-agent | Highest complexity, nascent standards |

### Key Platforms by Category

#### MCP Servers (Tool Use Layer)

**Model Context Protocol** — Anthropic's open standard, now widely adopted.
- Google has announced official MCP servers for all Google Cloud and Workspace services
- Community MCP servers exist for Gmail, Google Drive, Slack, GitHub, Notion, and hundreds more
- MCP servers handle auth internally and expose tools via the standardised protocol
- MCP is already referenced in Agent OS architecture (Layer 2 agent harness: "Tools: authorised tools and MCP connections")

**Google Workspace MCP** — github.com/aaronsb/google-workspace-mcp
- Authenticated access to Gmail, Calendar, Drive via single MCP server
- 100+ tools exposed through standardised interface
- OAuth 2.1 authentication

**Relevance to Agent OS:** MCP is the natural fit for **agent tool use** — the pattern where an agent needs to interact with an external system during step execution. It's already in our architecture spec. The ecosystem is maturing rapidly with official provider support.

#### Agent-Native Integration Platforms

**Composio** — github.com/ComposioHQ/composio
- 27.4k stars | MIT license | TypeScript + Python SDKs
- 1000+ pre-built tool integrations across all major SaaS categories
- Managed OAuth/credential vault (SOC 2 compliant) — agent never sees tokens
- "Tool Router" — agents discover relevant tools at runtime
- MCP server support (Rube) — connects MCP clients to 850+ apps
- **Primarily a cloud service** — SDK connects to Composio's hosted backend, not self-hostable
- Framework-agnostic: works with OpenAI, Anthropic, LangChain, CrewAI, Mastra
- Key pattern: "brokered credentials" — Composio executes the API call on the agent's behalf, tokens never reach agent runtime

**Relevance to Agent OS:** HIGH for reducing integration build effort. Composio could serve as the integration infrastructure beneath our adapter/tool layer. The "brokered credentials" pattern aligns with our trust model — agents don't handle sensitive credentials directly. Trade-off: cloud dependency for a platform that values self-containment.

#### Unified API / Integration Infrastructure

**Nango** — github.com/NangoHQ/nango
- 6.9k stars | Elastic License | TypeScript 96%
- 700+ API integrations with managed OAuth + token refresh
- Integration logic written as **TypeScript functions** — syncs, actions, event handlers
- Version-controlled in git, deployed via CLI
- Self-hostable (Docker, Helm charts) with limited free tier
- Per-tenant isolation, automatic retries, rate-limit handling
- SOC 2 Type II, HIPAA, GDPR compliant
- Supports both AI tool calling and scheduled data syncs on same platform
- **Code-first** — you define integrations as typed TypeScript functions, not visual workflows

**Relevance to Agent OS:** HIGH for both agent tool use and process I/O. Nango's code-first TypeScript approach aligns with Agent OS's composition principle. Self-hostable. The "syncs + actions" model maps to our two integration modes (process I/O = syncs, agent tool use = actions). Elastic License is source-available but not truly open source (can't offer as managed service). Infrastructure overhead: needs its own server/database.

**Merge** — merge.dev
- Unified API across 6 categories: HRIS, ATS, CRM, accounting, ticketing, file storage
- 220+ integrations with standardised data models
- "Merge Agent Handler" — MCP server creation for AI agents (launched Oct 2025)
- Cloud-only, not self-hostable
- Category-focused: strong where categories exist, no coverage outside them

**Relevance to Agent OS:** MEDIUM — useful for specific categories (accounting, CRM) but limited scope. Cloud-only conflicts with self-containment preference.

#### Workflow Automation / iPaaS

**n8n** — github.com/n8n-io/n8n
- 400+ integrations | Fair-code license | Self-hostable (npm, Docker)
- Visual workflow builder + code nodes (JS/Python)
- Native AI agent workflow support
- Custom node SDK in TypeScript for building new integrations
- Self-hosted with one-line npm or Docker command
- MCP server available for connecting AI assistants to n8n

**Relevance to Agent OS:** MEDIUM for process I/O (triggers, output delivery). n8n's event-driven model maps to process triggers and output destinations. Could serve as the "plumbing" for connecting processes to external systems. Risk: architectural overlap — n8n is itself a workflow engine, which competes with Agent OS's process engine rather than complementing it.

**Mastra** — github.com/mastra-ai/mastra (already in landscape.md)
- Auto-generated, type-safe API clients for third-party services
- Integrations installable as npm packages
- Can serve as tools for agents or workflow steps
- Auth handled per-integration

**Relevance to Agent OS:** Already evaluated in landscape.md for workflow/harness. Integrations are a secondary feature, not the primary value proposition. Less mature integration coverage than dedicated platforms.

#### Credential Management

**Brokered Credentials Pattern** (Composio, Nango)
- Agent never sees OAuth tokens or API keys
- Credentials stored in encrypted vault, isolated from agent runtime
- Platform executes API calls on agent's behalf
- Token lifecycle management: refresh rotation, automatic invalidation
- Current standard: OAuth 2.1 with mandatory PKCE

**Relevance to Agent OS:** Critical for trust model. Agents operating at any trust tier should not handle raw credentials. This maps directly to the agent harness permissions layer — the harness should broker all external access, not pass credentials to the adapter.

---

## How Existing Frameworks Handle Integrations

### OpenClaw — Skills + MCP + Channels

OpenClaw (163k stars, open-source) is the most relevant reference for how a popular agent framework handles integrations. It uses a **three-layer model**:

1. **Skills** — Markdown instruction files (SKILL.md with YAML frontmatter) that teach the agent how to use tools. Skills are loaded on-demand: the agent reads a skill list and actively decides which SKILL.md to consult for the current task. Over 5,400 community-built skills exist.

2. **MCP Servers** — Separate processes exposing tools via MCP. Over 65% of active OpenClaw skills now wrap underlying MCP servers. When you install a skill like `serpapi-mcp`, you get an MCP server (handles execution) plus a SKILL.md (tells the agent when/how to use it).

3. **Channels** — Messaging integrations (WhatsApp, Slack, Discord, Telegram, etc.) using adapter libraries. 50+ channel integrations. These are the process I/O layer — how agents receive and respond to external messages.

**Key patterns for Agent OS:**
- Skills-as-progressive-disclosure: load capabilities on demand, not upfront (validates our architecture spec's skills concept and Insight from "AI Agent OS" practitioner pattern)
- MCP as the tool execution backbone, with skills as the instruction layer on top
- Channel adapters as a separate concern from tool adapters
- Composio used as an MCP aggregator for enterprise integrations (one `MCP_URL` environment variable gives access to an aggregated tool catalog with token-scoped access control)

**Source:** [OpenClaw Skills Registry](https://github.com/VoltAgent/awesome-openclaw-skills), [OpenClaw Architecture](https://www.mintmcp.com/blog/openclaw-works-architecture-skills-security)

### Claude Agent SDK — MCP + Custom Tools

The Claude Agent SDK supports two integration paths:
1. **External MCP servers** — connect via stdio or HTTP/SSE. The SDK handles tool discovery and invocation via the MCP protocol.
2. **Custom tools** — in-process MCP servers that extend Claude Code's capabilities. You define tools as TypeScript functions that Claude can call.

**MCP tool search** solves the context window problem: instead of preloading all tools (which consumes tokens), tools are dynamically loaded on-demand when the agent needs them.

The SDK does not handle OAuth flows automatically — you complete auth in your application and pass tokens via headers.

**Source:** [Claude Agent SDK — MCP](https://platform.claude.com/docs/en/agent-sdk/mcp), [Claude Agent SDK — Custom Tools](https://platform.claude.com/docs/en/agent-sdk/custom-tools)

### Paperclip — Adapters + Extensions

Paperclip (28.1k stars) uses an extensible adapter model where agents bring their own prompts, models, and runtimes. Paperclip manages the organisation. Integrations happen through:
- Custom extensions for specific services
- Pre-built company templates that include integration configurations
- Any LLM provider, any tool stack, any deployment target

Paperclip does not impose a specific integration protocol — it's runtime-agnostic. This is closer to our adapter pattern (Option C) but without MCP or a dedicated integration platform.

**Source:** [Paperclip GitHub](https://github.com/paperclipai/paperclip)

---

## The CLI-as-Integration-Layer Pattern (Emerging 2026)

A significant emerging trend challenges the MCP-dominant narrative: **CLI tools as the primary integration interface for AI agents.**

### Google Workspace CLI (`gws`)

Google released the Workspace CLI (March 2026) — a unified command-line tool for Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin, and more. Key architectural features:

- **Dynamic command surface** — reads from Google's Discovery Service at runtime, so new API endpoints automatically become available
- **Structured JSON output** — every response is machine-readable, ideal for agent parsing
- **Built-in MCP server** — exposes Workspace APIs to any MCP client via stdio, no custom integration code needed
- **100+ Agent Skills** — installable via `npx skills add github:googleworkspace/cli`
- **40+ helper commands** — higher-level workflows like `+send`, `+agenda`, `+weekly-digest`
- **Security** — supports Google Cloud Model Armor (`--sanitize` flag scans API responses for prompt injection before data reaches the agent)
- **Auth** — OAuth (interactive), service accounts, pre-obtained tokens, encrypted credential storage (AES-256-GCM with OS keyring)
- **License:** Apache-2.0 | **Language:** Rust core, JS/TS agent skills

**Why this matters for Agent OS:** Google is shipping both a CLI and an MCP server for the same APIs, letting consumers choose their integration path. The CLI path is dramatically cheaper in tokens and already familiar to LLMs from training data.

**Source:** [Google Workspace CLI GitHub](https://github.com/googleworkspace/cli), [VentureBeat announcement](https://venturebeat.com/orchestration/google-workspace-cli-brings-gmail-docs-sheets-and-more-into-a-common)

### Xero MCP Server (Official)

Xero has released an official MCP server (github.com/XeroAPI/xero-mcp-server) providing standardised access to accounting features: invoices, payments, bank transactions, manual journals, reports, contacts, and payroll. OAuth2 authentication. This is notable because accounting software — a key Agent OS integration target — now has a first-party MCP server.

**Source:** [Xero MCP Server GitHub](https://github.com/XeroAPI/xero-mcp-server), [Xero Developer Blog](https://devblog.xero.com/xero-introduces-new-model-context-protocol-server-for-smarter-accounting-4d195ccaeda5)

### CLI vs MCP vs REST API: The 2026 Trade-offs

Benchmarks from Scalekit (Claude Sonnet 4, GitHub tasks):

| Task | CLI tokens | MCP tokens | Multiplier |
|------|-----------|------------|------------|
| Language detection | 1,365 | 44,026 | **32x** |
| Summarise issues | 2,840 | 48,190 | **17x** |
| Create PR | 3,210 | 46,500 | **14x** |
| Find commits | 1,980 | 43,800 | **22x** |
| Check CI status | 1,590 | 15,870 | **10x** |

**Why MCP costs more:** Tool schemas consume up to 72% of available context before any user intent is processed. The GitHub MCP server exposes 93 tools, consuming ~55,000 tokens just for schema injection.

**Reliability:** CLI achieves ~100% success rate (deterministic execution). MCP achieves ~72% (TCP timeouts, server availability).

**Financial impact:** For 10,000 daily interactions with Claude Sonnet, MCP could cost an additional $500-$2,000/month vs CLI.

**The hybrid consensus (emerging best practice):**
- **Use CLI when:** A mature CLI exists (git, gh, docker, kubectl, gws, stripe, aws). The model already knows these tools from training data. 10-32x cheaper.
- **Use MCP when:** No CLI exists (Slack, Notion, Linear, custom services). Enterprise security requirements (OAuth 2.1, scoped permissions, audit logging). Dangerous operations (database access, financial APIs) where structured safety matters.
- **Use REST API when:** Simple, stable integrations with 1-2 endpoints. Webhooks for inbound triggers. No mature CLI or MCP server exists.

**Source:** [MCP vs CLI Benchmarks — devgent.org](https://devgent.org/en/2026/03/17/mcp-vs-cli-ai-agent-comparison-en/), [CLI is the New MCP — OneUptime](https://oneuptime.com/blog/post/2026-02-03-cli-is-the-new-mcp/view), [Scalekit MCP vs CLI](https://www.scalekit.com/blog/mcp-vs-cli-use)

### Three Integration Interfaces, Not One

The landscape reveals that external services are increasingly offering **multiple interfaces** for agent integration:

| Service | CLI | MCP Server | REST API |
|---------|-----|------------|----------|
| Google Workspace | `gws` (official) | Built into CLI + standalone | Google APIs |
| GitHub | `gh` (official) | Official MCP server | GitHub REST/GraphQL API |
| Xero | — | Official MCP server | Xero API |
| Stripe | `stripe` CLI | Community MCP | Stripe API |
| Slack | — | Community MCP servers | Slack API |
| AWS | `aws` CLI | Community MCP | AWS SDK |

**Implication for Agent OS:** The integration architecture should not assume a single protocol. Different services will be accessed via different interfaces depending on what exists and what is most efficient. The architecture needs to accommodate CLI execution, MCP tool calls, and direct API calls — potentially all within the same process.

---

## Seven Architectural Options for Agent OS

### Option A: MCP-Native

**How it works:** All integrations are MCP servers. Agents connect to MCP servers as tools. Process inputs/outputs are handled by dedicated MCP servers or MCP-exposed services.

**What exists:**
- Google official MCP servers for Workspace + Cloud
- Community MCP servers for hundreds of services
- Claude Agent SDK has native MCP support
- Anthropic's `@anthropic-ai/sdk` supports MCP tool use

**Architecture:**
```
Agent Harness (L2)
├── Tools: [list of authorised MCP server URIs]
├── Permissions: [which MCP tools this agent can call]
└── Runtime → Claude API with MCP tools attached
```

**Pros:**
- Already in our architecture spec ("MCP connections" in agent harness)
- Open standard, widely adopted, provider-supported
- Each MCP server is independently maintained/versioned
- Clean trust boundary — MCP server handles its own auth
- Growing ecosystem rapidly (Google, GitHub, Slack all have official servers)

**Cons:**
- Each MCP server is a separate process to run/manage
- No unified credential management across servers
- No standardised data sync pattern (MCP is request/response, not scheduled sync)
- Process I/O (triggers, scheduled pulls) is not MCP's strength — it's designed for agent tool use
- Infrastructure: running N MCP servers for N integrations

**Gaps:**
- No built-in mechanism for process triggers (new email → start process)
- No data synchronisation (keep local cache of external data)
- Credential management is per-server, not centralised

### Option B: Integration Platform as Infrastructure (Nango/Composio)

**How it works:** Use a dedicated integration platform (Nango or Composio) as the integration infrastructure layer. Agent OS delegates all external API calls to the platform, which handles auth, execution, retries, and rate limiting.

**Architecture:**
```
Agent Harness (L2)
├── Tools: [integration platform exposes tools]
├── Permissions: [scoped per agent per integration]
└── Runtime → calls integration platform → platform calls external API
                                          ↓
                                 Credential Vault
                                 (tokens never reach agent)
```

**Nango variant:**
- Self-hostable (Docker/Helm)
- Code-first TypeScript integrations (git-tracked, CI/CD deployed)
- Handles both syncs (scheduled data pull) and actions (agent-triggered)
- 700+ APIs with managed auth

**Composio variant:**
- Cloud-hosted (not self-hostable)
- SDK-first with tool routing
- 1000+ integrations
- Brokered credentials pattern

**Pros:**
- Solves both agent tool use AND process I/O in one platform
- Credential management is centralised and secure (brokered pattern)
- Massive reduction in integration build effort
- Auth lifecycle (OAuth flows, token refresh, rotation) fully managed
- Aligns with composition principle ("build FROM")

**Cons:**
- Adds infrastructure dependency (Nango needs its own server) or cloud dependency (Composio)
- Nango: Elastic License (not truly open source, can't offer as managed service)
- Composio: Cloud-only, vendor lock-in risk
- Another system to operate, monitor, upgrade
- Integration platform's data model may not align with process I/O model

### Option C: Adapter Pattern Extension

**How it works:** Extend the existing adapter pattern (`invoke()` / `status()` / `cancel()`) to include integration adapters. Each external system gets an adapter (like `claude` and `script` today). Process steps can use `executor: http` or `executor: integration` type.

**Architecture:**
```
Step Executor (existing)
├── case "ai-agent" → claudeAdapter
├── case "script" → scriptAdapter
├── case "http" → httpAdapter (new — calls external APIs)
├── case "integration" → integrationAdapter (new — wraps Nango/MCP)
└── case "human" → handled by heartbeat
```

**Pros:**
- Minimal new concepts — extends what exists
- Each integration is a step in the process, subject to the full harness pipeline (trust, review, feedback)
- Clean separation: integration steps go through the same quality gates as AI steps

**Cons:**
- Building integration adapters from scratch means building auth management, retry logic, rate limiting — exactly what Nango/Composio already solve
- Doesn't address agent tool use during AI steps (agent needs to look something up mid-execution)
- Scales poorly — every new service needs a new adapter or adapter configuration

### Option D: Hybrid (MCP for Agent Tools + Platform for Process I/O)

**How it works:** Two integration paths for two different needs:
1. **Agent tool use** → MCP servers (agents call tools during step execution)
2. **Process I/O** → Integration platform or custom adapters (triggers, scheduled syncs, output delivery)

**Architecture:**
```
Process Layer (L1)
├── Inputs:
│   ├── Source: nango:gmail/inbox (integration platform handles trigger/sync)
│   └── Trigger: webhook from integration platform
├── Steps:
│   ├── 1. [AI agent with MCP tools] → agent can query CRM via MCP during execution
│   └── 2. [Integration step] → push result to Xero via integration platform
└── Outputs:
    └── Destination: nango:slack/channel (integration platform handles delivery)

Agent Harness (L2)
├── Tools: [MCP server URIs — for agent use during steps]
├── Integration credentials: [managed by platform, never exposed to agent]
```

**Pros:**
- Right tool for each job: MCP for real-time agent tool use, platform for async I/O
- Credential management centralised in integration platform
- MCP ecosystem provides broad tool coverage for agents
- Integration platform provides triggers, syncs, and output delivery that MCP doesn't
- Both integration modes go through the harness (trust, review, governance)

**Cons:**
- Two integration subsystems to understand, operate, and govern
- Credential management split: MCP servers manage their own auth, platform manages I/O auth
- More complex architecture — needs clear guidance on when to use which path

### Option E: Delegate to Workflow Engine (n8n)

**How it works:** Use n8n (or similar workflow automation tool) as the integration layer. Agent OS processes trigger n8n workflows for all external system interactions. n8n handles auth, connectors, and execution.

**Architecture:**
```
Agent OS Process → triggers n8n workflow → n8n handles external API calls → returns result
```

**Pros:**
- 400+ ready-made integrations
- Self-hostable, mature, battle-tested
- Visual workflow builder for non-technical users
- Already supports AI agent workflows natively

**Cons:**
- Architectural overlap: n8n is itself a workflow engine, creating a "workflow engine calling a workflow engine" pattern
- Loose coupling means Agent OS loses visibility into integration execution (harness can't wrap n8n steps)
- Trust, review, and feedback patterns can't apply to n8n's internal execution
- n8n's fair-code license has usage restrictions
- Adds significant infrastructure (n8n server, its own database)

### Option F: CLI-First with MCP Fallback

**How it works:** For every integration point, first check: does a mature CLI exist? If yes, agents execute via shell commands (like the script adapter today). If no CLI exists, fall back to MCP servers. REST API as final fallback.

**Architecture:**
```
Step Executor
├── Agent needs Google Drive → gws drive files list --json (CLI via script adapter)
├── Agent needs Xero invoices → MCP server (xero-mcp-server)
├── Agent needs custom internal API → HTTP adapter (direct REST call)
└── Integration resolution order: CLI → MCP → REST API
```

**Pros:**
- 10-32x cheaper in tokens than MCP for services with CLIs (Scalekit benchmarks)
- ~100% reliability for CLI vs ~72% for MCP
- LLMs already know CLI tools from training data — zero schema injection cost
- The script adapter already exists — CLI integration is essentially free
- Google Workspace CLI ships its own MCP server too, so you get both
- Composable: Unix pipes and command chaining

**Cons:**
- CLI output parsing is less structured than MCP's typed responses (mitigated by `--json` flags on modern CLIs)
- No standardised tool discovery (agent needs to know which CLI to use)
- Auth is less formal — environment variables, config files, OS keyrings instead of OAuth flows
- Not all services have CLIs (Slack, Notion, Linear)
- CLI security model relies on Unix permissions, not scoped OAuth tokens
- Harder to audit: shell command logs less structured than MCP call records

**Gaps:**
- No process-level permission scoping (CLI either has access or doesn't)
- Credential management for CLI tools is OS-level, not platform-managed

### Option G: Multi-Protocol Adapter (CLI + MCP + REST)

**How it works:** The agent harness resolves the best integration interface per service at configuration time. Process definitions declare what services are needed; the harness resolves HOW to connect based on what's available.

**Architecture:**
```
Process Definition (L1)
├── integrations:
│   ├── google-workspace: { preferred: cli, fallback: mcp }
│   ├── xero: { preferred: mcp }  # official MCP server, no CLI
│   └── internal-crm: { preferred: rest, endpoint: "..." }

Integration Registry (new — declaration, not state)
├── google-workspace:
│   ├── cli: { command: "gws", auth: "oauth-keyring" }
│   ├── mcp: { uri: "stdio://gws mcp", auth: "same-as-cli" }
│   └── rest: { base: "https://www.googleapis.com", auth: "oauth2" }
├── xero:
│   ├── mcp: { uri: "stdio://xero-mcp-server", auth: "oauth2" }
│   └── rest: { base: "https://api.xero.com", auth: "oauth2" }

Agent Harness (L2)
├── Tools: [resolved integration interfaces per service]
├── Credentials: [managed by integration registry, brokered to agents]
└── Runtime: agent calls tools; harness routes to CLI/MCP/REST as configured
```

**Pros:**
- Accommodates the reality: services offer different interfaces, quality varies
- Cost-optimal: CLI where cheap, MCP where structured, REST where only option
- The integration registry is a declaration (Insight-007) — git-tracked, human-authored
- Each integration goes through the harness (trust, review, audit)
- Future-proof: as services add CLIs or MCP servers, just update the registry
- Aligns with OpenClaw's model (skills wrapping MCP wrapping APIs)

**Cons:**
- Most complex option — three integration paths to implement and maintain
- Credential management must span all three protocols
- Agent needs to handle different response formats (shell output, MCP structured, JSON API)
- Integration registry is a new concept to design and build
- Testing surface area is large (each service × each protocol)

---

## Cross-Cutting Concerns

### Credential Management

All options must address how credentials are stored and accessed:

| Concern | Requirement |
|---------|-------------|
| **Storage** | Encrypted vault, isolated from agent runtime |
| **Access** | Brokered — agent requests action, platform executes with credentials |
| **Lifecycle** | Automatic token refresh, rotation, revocation |
| **Scope** | Per-agent, per-process permission scoping |
| **Audit** | Every external API call logged with actor, target, timestamp |
| **Trust alignment** | Credential access governed by trust tier — supervised agents may need approval before external calls |

### Process Definition Integration

However integrations are architected, they need to be declarable in process definitions:

```yaml
# Example: how a process might declare external integrations
inputs:
  - name: new-emails
    source: gmail/inbox
    trigger: webhook  # or: schedule: "*/5 * * *"

steps:
  - name: extract-invoice
    executor: ai-agent
    tools:              # MCP tools available to this agent
      - google-drive
      - xero-lookup

outputs:
  - name: processed-invoice
    destination: xero/invoices
    delivery: integration  # integration platform handles posting
```

### Governance

External integrations are a trust-sensitive surface:
- Which agents can access which external systems?
- What data can flow in and out?
- How are external API calls audited?
- What happens when an external system is unavailable?

These map to existing architecture concepts: agent permissions (L2), harness review patterns (L3), activity logging (audit trail), and error handling with on_failure.

---

## Landscape Summary

### Platforms

| Platform | Stars | License | Self-host | TypeScript | Agent tools | Process I/O | Auth mgmt | Coverage |
|----------|-------|---------|-----------|------------|-------------|-------------|-----------|----------|
| **MCP ecosystem** | — | MIT (protocol) | Yes (run servers) | Yes | Excellent | Weak | Per-server | Growing rapidly (10k+ servers) |
| **CLI ecosystem** | — | Various | Yes (native) | N/A | Excellent | Weak | OS-level | Mature for major services |
| **Composio** | 27.4k | MIT | No (cloud) | Yes | Excellent | Good | Centralised | 1000+ apps |
| **Nango** | 6.9k | Elastic | Yes (Docker) | 96% TS | Good | Excellent | Centralised | 700+ APIs |
| **n8n** | 50k+ | Fair-code | Yes (Docker/npm) | Yes | Good | Excellent | Per-workflow | 400+ apps |
| **Mastra** | 22k | MIT? | Yes (library) | 99% TS | Good | Good | Per-integration | Limited |
| **Merge** | — | Proprietary | No (cloud) | SDK | Good | Limited | Centralised | 220+ (6 categories) |

### Integration Interfaces (per-service availability)

| Service | CLI | MCP Server | REST API | Status |
|---------|-----|------------|----------|--------|
| Google Workspace | `gws` (official, Apache-2.0) | Built into CLI + standalone | Google APIs | CLI + MCP + REST |
| GitHub | `gh` (official) | Official MCP server | REST/GraphQL | CLI + MCP + REST |
| Xero | — | Official MCP server | Xero API | MCP + REST |
| Stripe | `stripe` CLI (official) | Community MCP | Stripe API | CLI + REST |
| Slack | — | Community MCP servers | Slack API | MCP + REST |
| AWS | `aws` CLI (official) | Community MCP | AWS SDK | CLI + REST |
| Notion | — | Community MCP | Notion API | MCP + REST |

### Agent Frameworks

| Framework | Integration model | Key pattern |
|-----------|------------------|-------------|
| **OpenClaw** | Skills (SKILL.md) wrapping MCP servers + channel adapters | Progressive skill loading; 65% of skills wrap MCP; Composio as aggregator |
| **Claude Agent SDK** | MCP servers + custom in-process tools | Dynamic tool loading via MCP tool search |
| **Paperclip** | Runtime-agnostic adapters + extensions | No specific integration protocol imposed |
| **Mastra** | Auto-generated type-safe npm packages per service | Integrations as installable dependencies |

---

## Gaps Where No Existing Solution Fits

1. **Trust-aware integration access** — No platform gates external API calls based on an agent's earned trust level. This is Original to Agent OS.
2. **Integration feedback capture** — No platform captures whether an external action's result was correct (e.g., "the invoice was posted to the wrong account") as a feedback signal. Original to Agent OS.
3. **Process-scoped integration permissions** — Existing platforms scope credentials per-user or per-app, not per-process. Agent OS needs per-process, per-agent scoping. Original to Agent OS.
4. **Integration as declaration** — Expressing external system connections as part of process definitions (Insight-007: declarations vs state) rather than as runtime configuration. Partially addressed by Nango's git-tracked TypeScript integrations.

---

## Sources

- [Composio — APIs for AI Agents: 5 Integration Patterns](https://composio.dev/content/apis-ai-agents-integration-patterns)
- [Composio — iPaaS vs Agent-Native Platforms](https://composio.dev/blog/ai-agent-integration-platforms-ipaas-zapier-agent-native)
- [Composio GitHub](https://github.com/ComposioHQ/composio)
- [Nango GitHub](https://github.com/NangoHQ/nango)
- [Nango Docs — Introduction](https://nango.dev/docs/introduction)
- [Nango — Best Unified API for AI Agents](https://nango.dev/blog/best-unified-api-platform-for-ai-agents-and-rag)
- [n8n GitHub](https://github.com/n8n-io/n8n)
- [Google Cloud — Official MCP Support](https://cloud.google.com/blog/products/ai-machine-learning/announcing-official-mcp-support-for-google-services)
- [Google Workspace MCP](https://github.com/aaronsb/google-workspace-mcp)
- [Composio — Secure AI Agent Infrastructure Guide](https://composio.dev/blog/secure-ai-agent-infrastructure-guide)
- [Nango — Best AI Agent Authentication](https://nango.dev/blog/best-ai-agent-authentication)
- [Mastra GitHub](https://github.com/mastra-ai/mastra)
- [Merge — Best Unified API](https://www.merge.dev/blog/best-unified-api)
- [Google Workspace CLI GitHub](https://github.com/googleworkspace/cli)
- [Google Workspace CLI — VentureBeat](https://venturebeat.com/orchestration/google-workspace-cli-brings-gmail-docs-sheets-and-more-into-a-common)
- [Xero MCP Server GitHub](https://github.com/XeroAPI/xero-mcp-server)
- [Xero Developer Blog — MCP Server](https://devblog.xero.com/xero-introduces-new-model-context-protocol-server-for-smarter-accounting-4d195ccaeda5)
- [MCP vs CLI Benchmarks — devgent.org](https://devgent.org/en/2026/03/17/mcp-vs-cli-ai-agent-comparison-en/)
- [CLI is the New MCP — OneUptime](https://oneuptime.com/blog/post/2026-02-03-cli-is-the-new-mcp/view)
- [Scalekit MCP vs CLI Benchmarks](https://www.scalekit.com/blog/mcp-vs-cli-use)
- [OpenClaw Skills Registry](https://github.com/VoltAgent/awesome-openclaw-skills)
- [OpenClaw Architecture — MintMCP](https://www.mintmcp.com/blog/openclaw-works-architecture-skills-security)
- [Claude Agent SDK — MCP](https://platform.claude.com/docs/en/agent-sdk/mcp)
- [Paperclip GitHub](https://github.com/paperclipai/paperclip)
