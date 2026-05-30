# Brief 301: MCP Tool Ingestion → Connect Accounts (P6)

**Date:** 2026-05-30
**Status:** draft
**Depends on:** Brief 296 (parent). Strongly recommended **after** Brief 297 (so MCP tool calls inherit the tripwire guard + complete tool recording).
**Unlocks:** "connect my accounts" — external tools (Gmail, Calendar, Slack, …) flow into the Agent through the open MCP standard; closes Ditto's long-deferred MCP gap.

## Goal

- **Roadmap phase:** Engine Hardening — Agent-Brain Transfer (Brief 296).
- **Capabilities:** P6 — a real MCP client that ingests an MCP server's tools, wraps each as a recorded Ditto tool, and executes calls inside an auth/scope context. The first server pointed at is **Composio's hosted MCP endpoint (Rube)** — which is the clean answer to "let me connect my accounts."

## Context

`src/engine/integration-handlers/index.ts:80` throws `"MCP protocol deferred"`. No MCP client exists. Yet the registry **already declares the shape** — `McpInterface { uri, auth }` and `preferred: "mcp"` in `integration-registry.ts:27,90,93`. ProcessOS built a working ingestion pattern to adapt: capture a server's tools, wrap each as a recorded tool, execute every call inside a request-context carrying auth + scope.

The strategic move (parent Brief 296): adopt **MCP the open standard**, not "Composio the platform." Composio ships a hosted MCP server (Rube, 850+ apps — `landscape.md:566`) that handles the OAuth account-connection dance. By implementing a standard MCP client and pointing it at Composio as one config endpoint, Ditto gets account connections **without** a bespoke vendor adapter, swappable for any other MCP server later, and barely grazing ADR-031 (whose prohibition was on coupling to *broker-specific shapes* — MCP-via-config satisfies it). This is complementary to ADR-045's `IntegrationProvider` seam, not a competitor: this is the concrete tool-ingestion path inside Ditto's product layer.

**Token-residency tradeoff (decide in ADR-053):** with Composio, the user's OAuth tokens live in Composio's cloud vault, not Ditto's. Acceptable for single-tenant founder dogfood; a real decision before it becomes the customer path. ADR-053 records this as a light ADR-031 amendment for the single-tenant MCP path only.

## Objective

Every in-loop MCP tool call (codebase + integration + MCP) is persisted to `step_runs` and flows through the same tool loop, trust gate, and recording as CLI/REST tools; an operator can connect at least one real account (via Composio's MCP endpoint) and the Agent can call its tools.

## Non-Goals

- **No multi-tenant Composio adoption** — single-tenant/dogfood path only. Composio-for-customers stays open (ADR-031).
- Do not reinvent OAuth flow handlers inside Ditto for these — the MCP server (Composio) owns the account-connection dance.
- Do not build the ADR-045 `IntegrationProvider` engine↔broker interface here — that's a separate, complementary brief. This is the product-layer MCP client.
- No bespoke per-provider adapters — everything is the generic MCP client.

## Inputs

1. `docs/briefs/296-agent-brain-transfer-parent.md` — parent + the MCP→Composio synthesis.
2. `.context/attachments/A7hasF/pasted_text_2026-05-30_23-39-22.txt` — P6 build detail.
3. `docs/adrs/031-oauth-credential-platform.md` — Composio deferral (lightly amended here).
4. `docs/adrs/045-integration-provider-engine-boundary.md` — complementary engine↔broker seam.
5. `docs/landscape.md:559-569` — Nango/Composio + Rube MCP server.
6. `src/engine/integration-registry.ts` — `McpInterface { uri, auth }`, `preferred: "mcp"`.
7. `src/engine/integration-handlers/index.ts:80` — the throw to replace.
8. `src/engine/tool-resolver.ts` — `resolveTools()` / `executeIntegrationTool`.
9. `src/engine/credential-vault.ts` — credential resolution.
10. **Researcher step required:** confirm Composio's *current* MCP/Rube auth model — per-user scoping, self-serve connect links, endpoint shape. Write the evaluation into `docs/landscape.md` before wiring (briefs must not reference unevaluated dependencies).

## Constraints

- **Engine scope: product** (`src/engine/`) — the MCP client is a Ditto integration handler. (If a reusable contract emerges, flag it for ADR-045's seam, but don't build that here.)
- **Step-run guard (Insight-180 + Insight-215 two-regime):** side-effecting MCP tools (send mail, write CRM, post) require a **real** `stepRunId`; read-only MCP tools may accept a sentinel. Classify per tool at ingestion (mirror `integrations/*.yaml` side-effect class).
- **Migration (Insight-190):** if connection/credential metadata needs storage, add a migration; check the next free idx at build time; SQL + snapshot per entry.
- **Spike before wiring (Insight-180 smoke rule):** add a spike test in `src/engine/integration-spike.test.ts` making ONE real MCP handshake/tool-list call to verify auth format + endpoint + response shape before wiring the tool loop.
- Do not add ai-sdk to the engine; MCP client is `@modelcontextprotocol/sdk`.
- **ADR-053 (write during Design):** MCP client architecture; credential/connection storage shape; the side-effect classification mechanism; the single-tenant Composio token-residency amendment to ADR-031.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| MCP ingestion (capture → wrap-as-recorded-tool → execute in auth/scope context) | ProcessOS/Catalyst Mastra port | pattern | Working ingestion pattern to adapt to Ditto's tool loop |
| MCP client SDK | `@modelcontextprotocol/sdk` | depend | Standard MCP client |
| Composio as MCP endpoint | composio.dev (Rube) | depend (config, not code) | Hosted MCP server provides account-connection without a bespoke adapter |
| Tool recording | Brief 297 (P5) | pattern | MCP calls record like every other loop tool-call |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `package.json` | Modify: add `@modelcontextprotocol/sdk` |
| `src/engine/integration-handlers/mcp.ts` (or similar) | Create: MCP client — connect to `McpInterface { uri, auth }`, list tools, execute calls, record each as a `tool_call` |
| `src/engine/integration-handlers/index.ts` | Modify: replace the throw at :80 with the real MCP handler |
| `src/engine/tool-resolver.ts` | Modify: map discovered MCP tools into `LlmToolDefinition[]`; route through `resolveTools()` / `executeIntegrationTool` |
| `src/engine/credential-vault.ts` | Modify (if needed): resolve MCP server auth |
| `integrations/<composio>.yaml` (or equiv) | Create: declare the Composio MCP server (`preferred: mcp`, uri + auth ref) |
| `src/engine/integration-spike.test.ts` | Modify: ONE real MCP handshake/tool-list spike |
| `docs/adrs/053-mcp-tool-ingestion.md` | Create |
| `docs/landscape.md` | Modify: Composio MCP/Rube evaluation (Researcher) |
| migration + snapshot (if connection storage) | Create (Insight-190) |
| `*.test.ts` | Create: tool mapping, recording, step-run guard for side-effecting MCP tools |

## User Experience

- **Jobs affected:** Delegate, Capture — the Agent can now act on the user's connected accounts.
- **Primitives involved:** Integration / tool; credential vault; trust gate.
- **Process-owner perspective:** "connect my Gmail/Calendar" → authorize once (via the MCP server) → the Agent can use those tools, with every call recorded and trust-gated.
- **Interaction states:** connect (authorize) / connected / expired-reauth / not-authorized (Insight-186 non-blocking offer) / tool-call success/failure. Connect UX shape is a Design question (CLI-first acceptable for dogfood; web later).
- **Designer input:** invoke `/dev-designer` if a workspace connect-UX is in scope; CLI/dogfood path needs only a lightweight UX section.

## Acceptance Criteria

1. [ ] `@modelcontextprotocol/sdk` added; an MCP client connects to a server declared by an integration YAML (`preferred: "mcp"`, `McpInterface { uri, auth }`).
2. [ ] The throw at `integration-handlers/index.ts:80` is replaced by the real handler.
3. [ ] Discovered MCP tools map into `LlmToolDefinition[]` and resolve via `resolveTools()` / `executeIntegrationTool` — same tool loop as CLI/REST.
4. [ ] Server auth resolves via `credential-vault.ts`.
5. [ ] Every MCP tool call is persisted to `step_runs.tool_calls` (matching P5/297 completeness).
6. [ ] Side-effecting MCP tools require a real `stepRunId`; read-only accept a sentinel (Insight-180/215). A vitest proves a side-effecting MCP call without a real run is rejected.
7. [ ] A spike test makes ONE real MCP handshake/tool-list call and asserts auth + endpoint + response shape (run before wiring).
8. [ ] An operator can connect at least one real account through the Composio MCP endpoint and the Agent can list + call its tools (smoke-proven).
9. [ ] `docs/landscape.md` carries the Composio MCP/Rube evaluation.
10. [ ] ADR-053 written: MCP client architecture, connection-storage shape, side-effect classification, and the single-tenant token-residency amendment to ADR-031.
11. [ ] Migration (if any) coheres with the journal (Insight-190).
12. [ ] MCP calls inherit the tripwire guard (if 297 landed) — empty/cut-off MCP tool results do not silently succeed.
13. [ ] No ai-sdk imports in the engine; root + core type-check pass.

## Review Process

1. **Researcher first** (Composio MCP/Rube reality), then `/dev-architect` for ADR-053, then build.
2. Spawn fresh-context Reviewer with `docs/architecture.md` + `docs/review-checklist.md`.
3. Verify: step-run guard on side-effecting tools; uniform recording; no broker-specific shapes leaking past the MCP seam; ADR-031 amendment is scoped to single-tenant only; credential handling.
4. Present work + findings to human.

## Smoke Test

```bash
pnpm vitest run src/engine/integration-spike.test.ts   # real MCP handshake BEFORE wiring
pnpm vitest run <mcp handler + tool-resolver tests>
pnpm run type-check
```

Manual: declare the Composio MCP server, authorize one account (e.g. Gmail), then in chat ask the Agent to use a tool from that account; confirm the call runs, is recorded in `step_runs`, and a side-effecting call is trust-gated.

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` (Phase 5; close the MCP-deferred gap).
3. Retrospective.
4. ADR-053 finalized; ADR-031 amendment recorded.
