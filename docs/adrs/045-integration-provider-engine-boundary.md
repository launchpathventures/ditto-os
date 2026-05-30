# ADR-045: `IntegrationProvider` as the Engine ↔ Broker Boundary in `@ditto/core`

**Date:** 2026-05-21
**Status:** proposed
**Related:** ADR-005 (Integration Architecture), ADR-025 (Centralized Network Service), ADR-031 (OAuth Credential Platform — Build Core), Insight-180 (stepRunId invocation guard), Insight-185 (identity-aware tools), Insight-186 (non-blocking integration upgrade offers), Insight-215 (stepRunId regimes — internal vs external), Insight-068 (composition levels)
**Prompted by:** ServiceOS upstream-contribution proposal (`.context/attachments/bLeS4E/pasted_text_2026-05-21_13-18-33.txt`, 2026-05-21)

## Context

### The proposal

ServiceOS — LaunchPath's vertical SaaS product line (NCP, lead-hub, bureau, exec) — has ported Ditto's harness in-repo as `modules/agent-runtime/`, preserving the contract from `packages/core/src/interfaces.ts` (`StepAdapter`, `SystemAgentHandler`, `MemoryProvider`, `EngineConfig`). They have proposed an upstream contribution: native per-workspace **Composio** + **AgentMail** integration in `@ditto/core`, fronted by a new `IntegrationProvider` interface symmetric with `MemoryProvider`. The proposal contains three concrete asks:

1. **New `IntegrationProvider` interface** in `packages/core/src/interfaces.ts` with `resolveConnection(workspaceId, toolFamily)`, `executeTool(connection, toolName, args)`, `listTools(workspaceId)`.
2. **New `workspace_integrations` table in core schema** with columns `workspace_id`, `provider` (`composio`), `tool_family`, `connection_id`, `granted_scopes`, `expires_at`.
3. **Two new packages** — `@ditto/integrations-composio` and `@ditto/integrations-agentmail` — implementing the interface, plus an example-app inbound-mail webhook handler.

The stated motivation: turn Ditto agents from "cognition-only" into agents "with real hands and a real face" by giving every Ditto deployment per-tenant tool execution and per-agent inbound mail without bespoke OAuth code per customer.

### What's already true in Ditto

The proposal lands in territory that is substantially resolved for Ditto's own deployment, but unresolved for downstream consumers of `@ditto/core`:

- **ADR-031** (`docs/adrs/031-oauth-credential-platform.md`) accepted, 2026-04-17. Decision: **build OAuth platform inside the Network Service**, top-5 providers (Gmail, GCal, GDrive, Slack, Notion). Composio explicitly **DEFERRED** (`docs/landscape.md`) because it is cloud-only and conflicts with self-hosted Track B. Nango deferred behind a documented re-evaluation trigger.
- **ADR-025** centralizes credentials and AgentMail inboxes in the Network Service. Workspaces hold opaque `OAuthGrantHandle`; tokens never leave the Network vault. A `credentials` table already exists with `(processId|userId, service)` scope.
- **AgentMail is adopted** at `depend` level (`docs/landscape.md`, `integrations/agentmail.yaml`). Inbound webhook → `selfConverse()` is shipped (Brief 099). Per-persona inboxes (`alex@ditto.partners`) exist; per-workspace subdomain provisioning is not built but the registry's `create_inbox` tool supports it.
- **Sending-identity abstraction is shipped** (Brief 152, `src/engine/channel-resolver.ts`). Insight-185: "Tools express intent, harness resolves mechanism." Tools like `crm.send_email` are identity-aware at runtime; the harness chooses AgentMail vs Gmail API.
- **`@ditto/core` has no `IntegrationProvider`.** It exports `StepAdapter`, `SystemAgentHandler`, `MemoryProvider`. The credential vault, OAuth client, and broker logic all live in the Ditto **product layer** (`src/engine/oauth/*`, the Network Service) — not in core. Downstream consumers without a Network Service have no contract to plug their own broker in against.

### The two issues, separated

The proposal conflates two distinct gaps that need separate decisions:

| Issue | Where it lives | Status |
|-------|----------------|--------|
| **Does `@ditto/core` need a broker contract?** | Engine boundary | Real gap — downstreams reinvent the broker; Ditto's own broker lives in product code that core can't reach |
| **Should `@ditto/core` ship Composio + AgentMail adapters and a `workspace_integrations` table?** | Vendor and storage shape | Largely resolved by ADR-031 (Composio deferred) and by the existing `credentials` table |

ADR-045 resolves only the first. The second is reaffirmed (Composio remains deferred for Ditto; downstream consumers may adopt it but ship the adapter as their own package, not as `@ditto/integrations-*`).

### Forces

| Force | Pulls toward |
|-------|-------------|
| ServiceOS and future `@ditto/core` consumers lack a broker seam | Add `IntegrationProvider` to core |
| ADR-031 keeps Ditto's broker in the Network Service | Don't pollute core with Ditto-specific Network shapes |
| Existing `credentials` table is the storage abstraction | Don't add a parallel `workspace_integrations` table |
| Composio cloud-only conflicts with self-hosted Track B (ADR-031) | Don't bundle Composio adapter into core |
| AgentMail is already a `depend`-level integration via YAML registry | Don't reinvent it as a core-package adapter |
| Insight-185: tools express intent, harness resolves mechanism | Tool-name routing belongs in the resolver, not in `EngineConfig` |
| Composition principle (Insight-068): core defines contracts, consumers own implementations | Interface in core, packages downstream |

## Decision

### Summary

ServiceOS surfaced a real gap (no engine ↔ broker seam in `@ditto/core`) and proposed a concrete shape. We **accept the underlying need behind all three asks** but redirect two of them to the consumer side rather than into core. ADR-031 stands.

1. **Accept ask 1 — `IntegrationProvider` lands in `@ditto/core`** — a small, provider-agnostic interface symmetric with `MemoryProvider`. Engine ↔ broker boundary only. No Composio shapes, no `connection_id` field, no workspace-storage assumptions.
2. **Redirect ask 2 — `workspace_integrations` lives in consumer schema, not core.** The existing `credentials` table (consuming-app side) is the storage abstraction for Ditto; ServiceOS adds their own `workspace_integrations` table in their schema and resolves it via their `IntegrationProvider` implementation. Storage shape stays a consumer concern.
3. **Redirect ask 3 — adapter packages ship under the consumer's scope, not Ditto's.** ADR-031 stands: Ditto's broker is the Network Service, and Composio remains DEFERRED for Ditto. ServiceOS publishes `@launchpath/integrations-composio` (or under whichever scope they prefer) against the `IntegrationProvider` contract. That is exactly the seam this ADR creates — and it is the use case it was designed to unblock.

The three together mean ServiceOS gets the structural change they need (a stable, supported contract in `@ditto/core`) without forcing Ditto to take dependencies that ADR-031 already decided against.

### 1. The `IntegrationProvider` interface

Added to `packages/core/src/interfaces.ts`. Shape (provisional — final field names settled in the implementation brief):

```ts
export interface IntegrationToolCall {
  toolName: string;          // domain.verb_noun, e.g. "crm.send_email" — provider-agnostic
  args: Record<string, unknown>;
  scopeId: string;           // consumer-defined scope (workspaceId, userId, processId, etc.)
  stepRunId: string;         // invocation guard — see §6 for the two-regime contract
}

export type IntegrationConnectionStatus =
  | { state: "connected"; expiresAt?: number }
  | { state: "expired"; reauthHint?: string }
  | { state: "missing"; reauthHint?: string };

export interface IntegrationToolResult {
  ok: boolean;
  output?: Record<string, unknown>;
  errorCode?: string;        // canonical: TOKEN_REVOKED, RATE_LIMITED, NOT_AUTHORIZED, UNKNOWN_TOOL
  errorMessage?: string;
  costCents?: number;        // optional cost telemetry
}

export interface IntegrationProvider {
  /** List tool names available to this scope (for catalog assembly + LLM tool-list rendering).
   *  Names MUST follow the `domain.verb_noun` convention — never broker-namespaced
   *  (`composio.salesforce.update_lead`). Mechanism is the implementation's concern; the
   *  interface only sees intent. (Insight-185.) */
  listTools(params: { scopeId: string }): Promise<string[]>;

  /** Check connection status for a tool family without executing anything. Lets the harness
   *  surface NOT_AUTHORIZED in the conversation (Insight-186 non-blocking upgrade offer)
   *  before a side-effecting call is attempted. Read-only and safe to call from memory-assembly
   *  or pre-flight handlers. */
  resolveConnection(params: {
    scopeId: string;
    toolFamily: string;       // e.g. "gmail", "salesforce" — coarser than toolName
  }): Promise<IntegrationConnectionStatus>;

  /** Execute a tool call. Implementations are responsible for credential resolution
   *  and for honoring trust-gate decisions delivered by the harness via stepRunId. */
  executeTool(call: IntegrationToolCall): Promise<IntegrationToolResult>;
}
```

Three methods, mirroring the proposal's `resolveConnection` / `listTools` / `executeTool` triad. The signatures are narrowed: no `connection` handle is threaded through `executeTool` (the implementation resolves credentials internally from `scopeId`), and `resolveConnection` returns a status, not an opaque connection object — this prevents consumers from leaking broker-specific handle types across the boundary.

**`EngineConfig` gains a single optional field:**

```ts
integrationProvider?: IntegrationProvider;
```

Single provider, not an array — **canonical decision**, not deferred. Multi-broker routing (which provider owns which tool name) is the resolver's concern — pushed into the consumer's `IntegrationProvider` implementation rather than baked into core. A consumer that needs three brokers writes one `CompositeIntegrationProvider` that fans out by tool-name prefix or domain. Core stays out of routing. If a second consumer demands an array shape, that is grounds for revisiting; today's choice is singular.

### 2. What this interface does NOT do

The interface is deliberately narrow. The following are **not** in core:

- **No credential storage.** No `connection_id`, no `expires_at`, no `granted_scopes` in core schema. Storage shape is the consumer's choice. Ditto stores grants in the Network vault; ServiceOS stores Composio connection IDs in their tenant table; a third consumer may use API keys in env vars.
- **No OAuth flow handlers.** `start` / `callback` endpoints are consumer-product concerns. The Network Service ships them (per ADR-031); other consumers ship their own.
- **No inbound-event handling.** Webhooks, inbound mail, push notifications — all live in the consumer's HTTP layer. The harness already supports event-driven ticks via `selfConverse()` and the existing event bus; core does not need an inbound-mail abstraction.
- **No per-agent inbox model.** Inbox identity is a product layer concern (Ditto's persona inboxes ≠ ServiceOS's per-tenant subdomains). The provisioning decision is not a core decision.
- **No tool catalogue.** Core does not ship a registry of canonical tool names. The integration YAML registry (`integrations/*.yaml`) stays in the Ditto product layer. Other consumers may build their own catalogue or use Composio's directly.

### 3. Step-execution integration

**Interface and wiring ship together** in the single implementation brief — not in two phases. A configurable `EngineConfig.integrationProvider` that `step-execution.ts` never reads would be a silent no-op and an API-design defect: consumers reading `SETUP_PROMPT.md` would configure it and observe nothing. To prevent that, the implementation brief MUST land both at once.

When `integrationProvider` is undefined (today's default), step execution behaves unchanged — tool calls flow through `resolvedTools` injection as today. When defined, `packages/core/src/harness/handlers/step-execution.ts` dispatches tool calls that don't resolve via `resolvedTools` through `integrationProvider.executeTool()`. The dispatch rule is: try `resolvedTools` first (Ditto's existing built-in path), fall back to `integrationProvider` if set, else `UNKNOWN_TOOL`. This keeps today's Ditto product code path untouched while opening the door for downstream consumers.

### 4. Reaffirming ADR-031 (no Composio in Ditto)

This ADR does **not** reopen ADR-031. Reasons unchanged:

- Composio is cloud-only — incompatible with self-hosted Track B (ADR-018).
- Ditto owns the integration layer directly because integrations are on the critical path to product value.
- Nango remains the documented re-evaluation candidate (Phase 12), not Composio.

ServiceOS's case for Composio is theirs to make in their own product. The `IntegrationProvider` seam exists precisely so they can adopt Composio without forcing Ditto to.

### 5. Insight-185 alignment

The interface preserves Insight-185 ("tools express intent, harness resolves mechanism"). Tool names crossing the `IntegrationProvider` boundary are provider-agnostic (`crm.send_email`, not `composio.gmail.send_email`). Resolution to mechanism happens inside the consumer's implementation. The existing `channel-resolver.ts` pattern continues to apply on the Ditto side; downstream consumers implement equivalent resolution in their broker.

### 6. Insight-180 + Insight-215 — the two-regime `stepRunId` contract

`IntegrationToolCall.stepRunId` is **required as a non-empty string**, but its interpretation follows the two-regime split established by Insight-215:

| Tool regime | What `stepRunId` must be | Why |
|-------------|--------------------------|-----|
| **External side-effecting** (publishing, payments, webhooks, outbound mail, CRM writes) | A real `stepRuns.id` from harness context. Sentinels NOT acceptable. | Trust gate's autosend/review decision and outbound-quality-gate enforcement depend on the run being real, auditable, and gate-evaluated. |
| **Read-only / pre-flight** (`gmail.search`, `salesforce.read_contact`, `listTools` follow-ups) | A real `stepRuns.id` OR a sentinel string (e.g. `web-direct-action:<userEmail>`, `pre-flight:<scopeId>`) per Insight-215. | These do not traverse the trust gate; the truthy-check exists to prevent accidental invocation from outside an explicit user-or-harness context, not to enforce review semantics. |

Implementations MUST:
- For side-effecting tools: validate `stepRunId` exists in `stepRuns` and is in a state that authorizes the call (e.g., not held in review queue). Reject with `errorCode: "NOT_AUTHORIZED"` otherwise.
- For read-only tools: accept a sentinel without DB lookup; the truthy check is the entire gate.
- Distinguish the two regimes by tool-side metadata (the integration registry declares each tool's side-effect class — pattern already established in `integrations/*.yaml`). The interface itself does not classify tools; the implementation does.

This preserves Insight-180's universal-contract discipline (every tool carries proof-of-context) while honoring Insight-215's regime split. `resolveConnection` is read-only and DOES NOT take `stepRunId` — there is nothing to gate.

### 7. Scope mapping

`scopeId` is consumer-defined. Ditto consumers map it to whichever scope the call should resolve against (`userId` for per-user grants, `processId` for process-local credentials, `workspaceId` for tenant-keyed brokers). The interface does not prescribe — it carries an opaque string and lets implementations key on it.

### 8. Documentation deliverables (downstream of this ADR)

This ADR makes one document change directly: `packages/core/SETUP_PROMPT.md` gains a section on `IntegrationProvider` so new consumers see the seam during onboarding. The implementation brief (see §Follow-ups) carries the rest.

## Provenance

Original to Ditto — informed by:

- **ServiceOS proposal** (LaunchPath-internal handoff, 2026-05-21) — surfaced the gap and proposed the three-method triad `resolveConnection` / `executeTool` / `listTools`. We keep all three methods. The signatures are narrowed: `resolveConnection` returns a status (not an opaque broker connection handle), `executeTool` resolves credentials internally from `scopeId` (no `connection` parameter), and `listTools` is constrained to `domain.verb_noun` tool names. Result: same call sites work for the consumer, but no broker-specific types cross the boundary.
- **Composio** (`composio.dev`) — `executeTool(call)` shape as a provider-neutral handler. We adopt the call shape but reject the cloud-only delivery model for Ditto itself (ADR-031).
- **Nango** (`github.com/NangoHQ/nango`) — integration-as-declaration pattern reinforces keeping the interface narrow and the catalogue elsewhere.
- **`MemoryProvider`** (existing in `packages/core/src/interfaces.ts`) — symmetric shape: a single `loadMemories` method, opaque storage, consumer implements. `IntegrationProvider` mirrors this discipline.
- **ADR-031** — broker pattern (Ditto Network owns OAuth) precedes and survives this ADR; the interface is the **engine ↔ broker** seam, not a replacement for the **workspace ↔ Network** seam.

## Consequences

**What becomes easier:**

- Downstream consumers of `@ditto/core` (ServiceOS, future forks) can wire their own broker without modifying core. The contract is small and explicit.
- Multi-broker deployments are straightforward — composite providers fan out by tool name in user code, not core code.
- Ditto's own Network Service can later be exposed *through* an `IntegrationProvider` adapter, normalizing engine-side tool dispatch even within the Ditto product. This is opt-in: today's `resolveServiceAuth` / `channel-resolver` paths continue to work.
- The trust gate becomes load-bearing for all tool calls, regardless of broker, because `stepRunId` is required by the interface.

**What becomes harder:**

- A consumer that ignores the broker pattern and only uses direct adapters now has two places to reason about external calls (`StepAdapter` + `IntegrationProvider`). Mitigated by `integrationProvider` being optional — absent = today's behavior.
- Tool-name conventions become a cross-consumer concern. If Ditto says `crm.send_email` and ServiceOS says `email.send`, process templates aren't portable. Not solved here; flagged as an open question.

**New constraints:**

- `IntegrationProvider` implementations MUST honor `stepRunId` per Insight-180 — verify the run is authorized before any side effect.
- Core MUST NOT import Composio, AgentMail, Nango, or any specific broker SDK. The interface is the only seam.
- Ditto's product layer MUST NOT add Composio anywhere — ADR-031 reaffirmed.
- Any future column or table containing broker-specific shape (`connection_id`, `granted_scopes`, etc.) MUST live in the consuming application's schema, not in `packages/core/src/db/`.

**Follow-up decisions / briefs needed:**

1. **Implementation brief** — add `IntegrationProvider` (three methods) to `packages/core/src/interfaces.ts`, wire dispatch in `step-execution.ts`, update `packages/core/SETUP_PROMPT.md` with the seam, add a sample composite-provider doc snippet. Interface + wiring ship together. Estimated 8-12 ACs, one builder session. Sequenced when ServiceOS confirms the interface fits their broker design (or when Ditto's own product layer adopts the seam — e.g., to normalize Network broker calls through `IntegrationProvider`).
2. **Cross-consumer tool-name convention** — `domain.verb_noun` is asserted here as the listTools convention. If process templates need to be portable between Ditto and ServiceOS, a shared catalogue ADR follows. Not load-bearing today, but flagged early to prevent broker-namespaced tool names (`composio.salesforce.update_lead`) entering the catalogue.
3. **Composio re-evaluation (ADR-031 trigger counter)** — ServiceOS's proposal counts as one signal toward ADR-031's "≥3 unplanned integration requests/week sustained over one month" trigger. Dev PM logs this in the weekly triage. The decision in this ADR (interface yes, Ditto-side Composio adoption no) is the correct outcome under the current trigger state; if the trigger flips, ADR-031 is the document that gets revisited, not this one.
4. **Per-workspace AgentMail inbox provisioning (Ditto product)** — separate decision. The `agentmail.yaml` `create_inbox` tool supports it; provisioning policy is a Ditto-product question, not a core question.

**Open questions explicitly not resolved here:**

- Should `IntegrationToolResult.errorCode` be an enum or open string? Provisional canonical list above; final decision in the implementation brief.
- Should `IntegrationConnectionStatus.reauthHint` be free-form or structured (e.g., `{ url: string; method: "oauth2" | "api_key" }`)? Defer until a second broker implementation informs the shape.

## Closes out

- ServiceOS proposal (2026-05-21) — three asks answered: accept (1) narrowly, reject (2), reject (3) for Ditto with downstream pathway open.
- Implicit gap in `@ditto/core` boundary surfaced by ServiceOS — engine ↔ broker seam now has a contract.
