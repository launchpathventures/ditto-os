# Insight-010: Integrations Are Multi-Modal (Tool Use vs Process I/O) and Multi-Protocol (CLI vs MCP vs REST)

**Date:** 2026-03-19
**Trigger:** Research into external integrations architecture — discovered that integration needs split along two axes: purpose (agent tool use vs process I/O) and protocol (CLI vs MCP vs REST API)
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L4 Awareness
**Status:** active

## The Insight

External system integrations in Agent OS split along two independent axes:

**Axis 1: Purpose — what the integration is for**

1. **Agent tool use** — An agent needs to read/write an external system during step execution. Synchronous, request/response, driven by the LLM's reasoning. Example: agent looks up a customer in Salesforce while drafting an email.

2. **Process I/O** — A process declares an external system as an input source or output destination. Triggers (new email → start process), scheduled syncs (pull latest data hourly), and output delivery (post result to Slack). Asynchronous, event-driven, at process boundaries.

3. **Data sync** — Keep a local cache of external data current. Runs on a timer, independent of any process execution. Neither agent tool use nor process I/O — it's infrastructure that both can consume.

**Axis 2: Protocol — how the integration connects**

The 2026 landscape shows services offering multiple interfaces. The right protocol depends on the service, not the purpose:

- **CLI** — 10-32x cheaper in tokens than MCP (Scalekit benchmarks). ~100% reliability. LLMs already know CLIs from training data. Best when: a mature CLI exists (gws, gh, stripe, aws, docker, kubectl).
- **MCP** — Structured tool schemas, scoped OAuth, audit logging. Best when: no CLI exists (Slack, Notion, Linear), enterprise security requirements, or dangerous operations.
- **REST API** — Classic, universal, well-understood. Best when: simple stable integrations, webhooks for triggers, or neither CLI nor MCP server exists.

These axes are independent. An agent might use Google Workspace via CLI for tool use (cheap) while the same service's MCP server handles process I/O triggers (structured). The architecture must not assume a single protocol.

## Implications

- Process definitions (L1) need to declare both purposes: `tools` for agent use during steps, `source`/`destination` for process I/O
- The agent harness (L2) tools field should be protocol-agnostic — not MCP-specific
- An **integration registry** (declaration, per Insight-007) could map services to their available interfaces and preferred protocol
- CLI execution is essentially free via the existing script adapter — this is a low-cost first step
- Credential management must span all protocols: OS keyrings (CLI), OAuth vaults (MCP), API keys (REST)
- Both purposes and all protocols must go through the harness for governance and audit logging

## Where It Should Land

Architecture spec — L1 (process definitions declare integration needs by purpose), L2 (agent harness tools are protocol-agnostic), and a new cross-cutting section on the integration registry as a declaration. Should inform a Phase N brief for the integration layer.
