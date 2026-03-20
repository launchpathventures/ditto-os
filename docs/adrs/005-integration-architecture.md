# ADR-005: Integration Architecture — Multi-Protocol, Multi-Purpose

**Date:** 2026-03-19
**Status:** proposed

## Context

Agent OS processes don't operate in isolation. Real-world processes need to read emails, access accounting software, post to communication channels, and sync with cloud storage. The architecture spec mentions integrations in three places — L1 process `Source`/`Destination`, L2 agent harness `Tools: authorised tools and MCP connections`, and the Technical Architecture adapters list (`HTTP`) — but never specifies how they work. The 12-phase roadmap has no phase for external integrations.

Research (`docs/research/external-integrations-architecture.md`) evaluated seven architectural options and found that:

1. External integrations serve **two purposes**: agent tool use (synchronous, during step execution) and process I/O (triggers, syncs, output delivery at process boundaries). These are architecturally different.

2. External services offer **multiple protocols**: CLI (cheapest — 10-32x fewer tokens than MCP), MCP (structured schemas, scoped auth), and REST API (universal fallback). The right protocol depends on the service, not the purpose.

3. No existing platform handles both purposes across all protocols while also enforcing trust tiers, capturing feedback, and brokering credentials — these are Original to Agent OS.

The forces at play:
- **Composition over invention** — integration infrastructure (auth, retries, rate limits) already exists in Nango, Composio, MCP ecosystem
- **Process is the primitive** — integrations must be declarable in process definitions, not runtime configuration
- **Trust is the product** — external API calls are trust-sensitive and must traverse the harness
- **Budget sensitivity** — CLI is 10-32x cheaper than MCP for services that have CLIs

## Decision

Agent OS adopts a **multi-protocol, multi-purpose integration architecture** with the following design:

### 1. Two integration purposes, architecturally separated

**Agent tool use** — tools available to agents during step execution. Declared per-step in process definitions (`tools:` field). Resolved and injected by the agent harness at assembly time. The agent calls tools during its reasoning loop.

**Process I/O** — external systems as input sources or output destinations. Declared at the process level (`source:`, `trigger:`, `destination:` fields). Handled by the engine at process boundaries — before the first step (trigger/input) and after the last step (output delivery).

**Note:** Insight-010 identifies a third purpose — **data sync** (keeping a local cache of external data current, running on a timer independent of any process). This is deferred from the initial integration architecture. Data sync is infrastructure that both agent tool use and process I/O can consume, but it requires a separate data caching layer that doesn't exist yet. When needed, it can be added as a scheduled job that populates local storage, consumed by processes as a local input source rather than a live external call. The two-purpose model covers the immediate needs; data sync is a Phase 6+ extension.

### 2. Three protocols, resolved per-service from an integration registry

**CLI** — preferred when a mature CLI exists (gws, gh, stripe, aws, kubectl). Executed via the existing script adapter infrastructure. Cheapest in tokens, highest reliability.

**MCP** — preferred when no CLI exists but an MCP server does (Slack, Notion, Xero, Linear). Provides structured tool schemas, scoped OAuth, audit-friendly call records.

**REST API** — fallback when neither CLI nor MCP exists. Direct HTTP calls. Also used for inbound webhooks (triggers).

The **integration registry** is a declaration (per Insight-007) that maps services to their available interfaces:

```yaml
# integrations/google-workspace.yaml
service: google-workspace
interfaces:
  cli:
    command: gws
    auth: oauth-keyring
  mcp:
    uri: stdio://gws mcp
    auth: same-as-cli
  rest:
    base: https://www.googleapis.com
    auth: oauth2
preferred: cli  # cheapest option for this service
```

### 3. Credential management — brokered, never exposed to agents

Agents never see OAuth tokens, API keys, or service account credentials. The harness brokers all external access:
- Credentials stored encrypted, isolated from agent runtime
- Token lifecycle (refresh, rotation, revocation) managed by the integration layer
- Per-process, per-agent scoping — an agent assigned to Process A cannot use Process B's Xero credentials
- Every external call logged to the activity table with actor, target, timestamp

### 4. All integration calls traverse the harness

Both purposes go through the harness pipeline:
- **Agent tool use** — tools are authorised at harness assembly time (memory-assembly handler). The trust gate can require approval before an agent in supervised tier makes an external call.
- **Process I/O** — output delivery happens after the trust gate has approved the step. Input triggers are logged as activities.

This is the key architectural constraint: external calls are not invisible side-effects. They are first-class harness events.

### 5. Step executor extends with new adapter types

The step executor's handler registry extends to support integration steps:

```
stepExecutorValues: "ai-agent" | "script" | "rules" | "human" | "handoff" | "integration"
```

The `integration` executor resolves the service and protocol from the registry, executes the call, and returns structured output — just like `script` or `ai-agent`.

## Provenance

| Pattern | Source | What we adapted |
|---------|--------|----------------|
| Multi-protocol resolution | Google Workspace CLI (ships CLI + MCP + REST for same service) | The registry pattern resolving preferred protocol per service |
| Skills wrapping MCP | OpenClaw (65% of skills wrap MCP servers) | Instruction layer (process definition) over execution layer (protocol) |
| Brokered credentials | Composio (`composio.dev`) | Agent never sees tokens; platform executes on agent's behalf |
| Code-first TypeScript integrations | Nango (`github.com/NangoHQ/nango`) | Git-tracked, typed integration functions |
| Dynamic tool loading | Claude Agent SDK MCP tool search | Load tools on demand, not all upfront |
| Integration as declaration | Original — informed by Insight-007 (declarations vs state) and Nango's git-tracked approach | Integration registry as version-controlled files |
| CLI-first cost optimisation | Scalekit benchmarks, devgent.org analysis | CLI preferred where 10-32x cheaper |
| Trust-aware integration access | Original | No existing platform gates external calls by earned trust level |
| Integration feedback capture | Original | No existing platform captures whether external actions had correct outcomes |
| Process-scoped integration permissions | Original | No existing platform scopes credentials per-process per-agent |

## Consequences

**What becomes easier:**
- Adding new external services — add a registry file, declare it in process definition
- Cost management — CLI-first approach reduces token spend for common services
- Security auditing — all external calls logged, credentials never in agent context
- Moving beyond coding dogfood — non-coding processes (invoice reconciliation, onboarding) become feasible

**What becomes harder:**
- Three protocol paths to implement and test (CLI, MCP, REST)
- Credential management spans multiple auth mechanisms (OS keyring, OAuth vault, API keys)
- Agent tool use during step execution is harder to observe/audit than discrete step calls

**New constraints:**
- Every new external service needs a registry entry before agents can use it
- The harness pipeline must handle integration failures gracefully (external systems go down)
- Context window budget must account for MCP tool schemas when MCP is used

**Follow-up decisions needed:**
- Which integration platform (if any) to adopt for credential management: build minimal, adopt Nango, or use Composio
- Exact phase placement in roadmap (proposed: between Phase 5 and current Phase 6)
- Whether the integration registry is YAML files (like processes) or database-backed
- Error handling and retry strategy for external calls
- How to test integrations in CI (mock servers? sandbox accounts?)
- How does the trust gate handle synchronous tool calls during agent reasoning? When an agent mid-step calls an MCP tool that hits an external API, does the trust gate intercept synchronously? Queue for approval? Block the reasoning loop? For supervised-tier agents, does every external call pause, or just the first per step? How to distinguish read-only lookups from write operations?
