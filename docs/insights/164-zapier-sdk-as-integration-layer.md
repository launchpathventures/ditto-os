# Insight-164: Zapier SDK as the External Integration Layer

**Date:** 2026-04-09
**Trigger:** Research into Zapier's new `@zapier/zapier-sdk` (open beta) — purpose-built for AI agents consuming external services
**Layers affected:** L2 Agent (tool availability), L3 Harness (trust-gated execution), L4 Awareness (workspace capability map)
**Status:** active

## The Insight

The roadmap's "find-or-build routing" planned custom OpenAPI integration generation as the path to connecting processes with external services. Zapier's new SDK (`@zapier/zapier-sdk`) provides a faster, broader alternative: 9,000+ apps with 30,000+ pre-built actions, dynamic schema discovery, automatic OAuth handling, and raw authenticated fetch as an escape hatch.

The SDK's discovery loop (`listApps` → `listActions` → `getInputFieldsSchema` → `listInputFieldChoices` → execute) maps directly to how an agent would reason about connecting a process step to an external service. Agents don't need hardcoded knowledge of any specific API — they explore the catalog at runtime.

This is composition-over-invention (Insight-068) at the integration layer. Instead of building thousands of integration connectors, Ditto depends on Zapier's catalog and focuses on what's unique: the harness, trust enforcement, and process orchestration around those external actions.

Three access modes: SDK (programmatic, full control), MCP server (`npx zapier-sdk mcp`), and Workflow API (REST for creating full Zaps). The SDK with client credentials is the primary path for agent-driven process steps.

## Implications

- **Find-or-build routing is partially solved** — Zapier covers the "find an existing integration" path for most common services. Custom OpenAPI generation (Brief 037) remains for niche APIs not on Zapier.
- **Trust model maps naturally** — Zapier connections are per-user and explicitly authorized. Discovery is free at all trust tiers; execution is trust-gated (supervised = human approval, autonomous = execute freely).
- **No integration management UI needed in V1** — users manage connections on Zapier. Ditto surfaces "connect your [App]" prompts when a process step needs an unconnected service.
- **Cost-per-outcome gains a new dimension** — Zapier task consumption (post-beta) becomes part of the budget ledger alongside LLM costs.
- **Existing integration infrastructure (Brief 024-037) is complementary** — Zapier handles the common case; the existing YAML registry + CLI/REST handlers remain for custom integrations, internal tools, and services not on Zapier.

## Where It Should Land

- Brief 113 (Zapier SDK Tool Integration) — implementation brief
- `docs/architecture.md` Layer 2 (Agent) — Zapier as a tool category
- `docs/roadmap.md` Phase 11 — update find-or-build routing status
