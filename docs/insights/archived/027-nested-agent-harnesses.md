# Insight-027: Nested Agent Harnesses (The Babushka Model)

**Date:** 2026-03-19
**Trigger:** Landscape research across 5 sources (agency-agents, Sim Studio, Open SWE, Deeplake/db9, "AI Agent OS" practitioner pattern) — all independently implement some version of nested operating contexts without naming the pattern
**Layers affected:** L2 Agent, L3 Harness
**Status:** absorbed into architecture.md (Layer 2) and landscape.md

## The Insight

Every serious agent system in the landscape wraps its runtime in multiple layers of context, each with a distinct scope:

1. **Platform harness** — cross-process governance, trust, dependency graph, learning (Agent OS itself)
2. **Process harness** — review patterns, quality gates, escalation, process-scoped memory (our Layer 3)
3. **Agent harness** — identity, capabilities, agent-scoped memory, tool permissions, budget (the missing piece in our Layer 2)
4. **Runtime** — the actual LLM or script execution (our adapter pattern)

Our architecture had layers 1, 2, and 4 but treated Layer 2 agents as stateless adapters (`invoke()` / `status()` / `cancel()`). The landscape shows agents need a persistent operating context — their own harness — that travels with them across process assignments.

Open SWE's `get_agent()` function is the clearest reference: it assembles identity + repo context + tools + sandbox + middleware into a single operating context before handing off to the runtime. The "AI Agent OS" practitioner pattern achieves the same thing with folder structure: `agents.md` (identity) + `memory.md` (learning) + `skills/` (capabilities) + MCP config (tools).

The critical architectural insight is that **each layer can be swapped independently**. Different agent in the same process. Different process for the same agent. Different runtime for the same agent harness. This separation is what makes the harness composable rather than monolithic.

A second insight emerged from the same research: **agent memory needs two scopes**. Agent-scoped memory (cross-cutting knowledge that travels with the agent across all assignments) and process-scoped memory (learning specific to a process that persists across all runs). The harness merges both at invocation time. The file-based memory.md pattern works for single agents but breaks for multi-agent coordination — structured storage with progressive disclosure is needed.

## Implications

**For Layer 2 (Agent):** The adapter interface remains (`invoke()` / `status()` / `cancel()`) but it's now wrapped by an agent harness assembly step. Before every invocation: resolve identity → load agent memory + process memory → determine authorised tools → check budget → inject into adapter → execute.

**For memory:** A `memory` table with `scope_type` (`agent` | `process`) and `scope_id` supports both scopes. The harness merges relevant memories at invocation, applying progressive disclosure (most relevant first, within context budget). This replaces the implicit "context is whatever the adapter gets" model.

**For Phase 2:** The harness pipeline (review patterns, trust enforcement) wraps the agent harness, not the raw adapter. The execution flow becomes: heartbeat triggers → process harness applies review pattern → agent harness assembles context → adapter invokes runtime → safety-net middleware catches structural gaps → output flows back through harness for quality checks.

**For non-technical users:** The babushka model maps naturally to the hiring metaphor — job description (process harness) → employee profile (agent harness) → the person's actual skills (runtime). Users think in these layers already; the architecture should match.

## Where It Should Land

- **Architecture spec (L2 Agent):** Absorbed — agent harness structure, nested harness diagram, memory model, and assembly pattern added 2026-03-19
- **Landscape doc:** Absorbed — new section on agent harness patterns, memory tiers, patterns to adopt, non-technical user approaches added 2026-03-19
- **Phase 2 brief:** Should account for agent harness assembly as part of the heartbeat rewrite
- **Dictionary:** Needs entries for Agent Harness, Agent-Scoped Memory, Process-Scoped Memory, Babushka Model
