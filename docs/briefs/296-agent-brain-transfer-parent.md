# Brief 296: Agent-Brain Transfer (ProcessOS Primitives) — Parent / Kickoff

**Date:** 2026-05-30
**Status:** draft
**Depends on:** none (greenfield thread; branches off `main` after PR #54 merge — already merged at `ce7aa251`)
**Unlocks:** Briefs 297–301 (the five phase sub-briefs)

> **This is the entry point.** A fresh session should read this brief first, then the
> phase sub-brief it's picking up (297–301). This parent carries the coherence,
> the Phase-0 findings, the sequencing, and the cross-cutting constraints; it has
> **no acceptance criteria of its own** — the ACs live in the sub-briefs.

## Goal

- **Roadmap phase:** Engine Hardening — Agent-Brain Transfer (new thread; Documenter adds the roadmap row on first phase completion).
- **Capabilities:** Transfer seven proven runtime primitives from the sibling **ProcessOS / Catalyst** project (a hardened Mastra-based agent runtime) into Ditto's own architecture — *without* porting Mastra. The transfers harden correctness (a cut-off/empty model response can never earn trust), observability (run trees, token/cost rollup, complete tool recording), tunability (a single prompt-inspection surface), and capability reach (MCP tool ingestion → connect external accounts). The MCP transfer doubles as the clean answer to "connect my accounts."

## Context

ProcessOS (LaunchPath's sibling line, built on the Catalyst kit) hardened a production agent runtime on Mastra and proved a specific set of primitives valuable. Ditto's harness is *ahead* of ProcessOS in most dimensions — it already has run/step recording, a multi-iteration tool loop, trust tiers, correction-learning, two-scope memory, and a single LLM boundary. The job is **not a rebuild**: it's a targeted delta that plugs seven specific primitives into Ditto's existing seams.

Two of these matter directly for the current north star — *"get a Ditto Agent up and running so Tim can start using it"*:
- **P1 (tripwire guard)** is foundational correctness. Today a silently-empty or token-cut-off model response returns as a *successful* step at default "medium" confidence — which then **earns trust** and corrupts the approval-rate signal that drives autonomy upgrades. You cannot safely lean on an Agent whose trust signal is poisoned by fake successes.
- **P6 (MCP ingestion)** is the clean path to *"connect my accounts."* Composio ships a hosted MCP server (Rube, 850+ apps — `landscape.md:566`), and Ditto's integration registry **already declares** the MCP shape (`McpInterface { uri, auth }`, `preferred: "mcp"` in `integration-registry.ts:27,90,93`); only the handler throws `"MCP protocol deferred"`. Closing P6 lets you adopt **MCP the open standard** and point it at Composio as one config endpoint — no bespoke vendor adapter, swappable later, barely grazing ADR-031.

The full mission spec lives in this brief's Inputs; this brief adapts it to Ditto's process and records the Phase-0 discovery already performed.

## Objective

Land all seven transfers (P1–P7) as five independently-shippable, independently-reviewed phases, in the sequence below, each following Ditto's Research → Design → Build → Review loop. Definition of done is the union of the five sub-briefs' acceptance criteria.

## Phase-0 Discovery — findings (verified against `main` @ `ce7aa251`, 2026-05-30)

All seven seams still match the mission spec. Nothing has landed in this tree.

| # | Transfer | State | Evidence |
|---|----------|-------|----------|
| **P1** | Tripwire guard on every model call | 🔴 real, highest value | `src/adapters/claude.ts:337` returns partial `finalText` as a successful step on `stopReason === "max_tokens"`; empty text also passes at default "medium" confidence. `src/engine/llm.ts:761` **Google path hardcodes** `stopReason` to `end_turn`/`tool_use` — cutoff/refusal/empty never surface. OpenAI maps `finish_reason: "length"` → `max_tokens` (`llm.ts:546`) but nothing downstream treats it as failure. |
| **P4** | Run-level token/cost rollup + budget debit | 🔴 confirmed dead | `process_runs.totalTokens` / `totalCostCents` are declared (`packages/core/src/db/schema.ts:377-378`) and only ever **read** (`process-data.ts`), never written. `recordSpend` is **not** wired into `heartbeat.ts`. |
| **P5** | Complete per-tool-call recording | 🟡 likely real | Integration tool calls record to `step_runs.tool_calls`; codebase tools (`read_file`/`search_files`/`list_files`/`write_file`/`run_command`) appear console-logged only. Needs a 5-min confirm in `claude.ts` at Design. |
| **P2** | Single prompt-inspection surface | 🔴 gap | No `src/engine/prompts/`, no `prompts` command in `src/cli.ts`. Prompts scattered across ~6 surfaces. |
| **P3** | `parent_run_id` for orchestrator attribution | 🔴 gap | Column absent from `process_runs`. `delayed_runs.created_by_run_id` is the pattern to mirror. |
| **P7** | Enforce LLM boundary with lint | 🔴 gap, cheap | `src/engine/llm.ts` boundary is convention-only; no `no-restricted-imports` rule. `web-search.ts` is the one intentional exception (Perplexity via OpenAI). |
| **P6** | MCP tool ingestion → connect accounts | 🔴 gap, **scaffold present** | `src/engine/integration-handlers/index.ts:80` throws `"MCP protocol deferred"`. But `McpInterface { uri, auth }` + `preferred: "mcp"` already declared in `integration-registry.ts`. The shape exists; only the client is missing. |

**Nit:** the mission cites "Insight-065" but no `docs/insights/065-*.md` file exists — it's a code-comment reference only. Don't go looking for the file.

## Sub-brief decomposition

| Sub-brief | Phase | Transfers | ADR | Migration? | Est. ACs |
|-----------|-------|-----------|-----|-----------|----------|
| **297** | 1 | P1 tripwire + P4 rollup + P5 tool recording | **ADR-051** (tripwire guard: fail-step vs force-low) | no | ~14 |
| **298** | 2 | P2 prompt registry + `ditto prompts` CLI | **ADR-052** (prompt registry) | no | ~9 |
| **299** | 3 | P3 `parent_run_id` orchestrator attribution | — | **yes** | ~7 |
| **300** | 4 | P7 LLM-boundary lint rule | — | no | ~5 |
| **301** | 5 | P6 MCP ingestion → Composio account connection | **ADR-053** (MCP ingestion + MCP-via-Composio, light ADR-031 amendment) | **yes** (credential/connection storage TBD at Design) | ~16 |

ADR-051, ADR-052, ADR-053 are **reserved** here (grep-before-claiming) and written during each phase's Design step — the tripwire fail-vs-force decision and the MCP credential/storage shape are genuine design choices, not pre-decided.

## Build order & sequencing

```
Phase 1 (297: P1+P4+P5)  →  small, high-value, same code area (llm.ts/claude.ts/heartbeat.ts). Do FIRST.
Phase 5 (301: P6→Composio) →  "connect my accounts." Largest. Own ADR. Highest capability leverage.
Phase 2 (298: P2 registry) →  Tim's explicit priority. INDEPENDENT — can run parallel to 297/301.
Phase 3 (299: P3 parent_run_id) →  observability tree. Defer until daily use.
Phase 4 (300: P7 lint) →  hardening. Cheap, defer.
```

Recommended pickup: **297 first** (correctness floor), then **301** (accounts), with **298** parallelizable any time. 299 + 300 are deferrable until the Agent is in daily use.

## Non-Goals

- **Not a Mastra port.** Do not add `@mastra/*`, `ai`, or `@ai-sdk/*` to the engine (`src/`, `packages/core`). Ditto deliberately calls `@anthropic-ai/sdk` / `openai` / `@google/generative-ai` directly behind `src/engine/llm.ts`; that boundary is correct. (`packages/web` may keep using the ai-sdk as a streaming transport — that's fine and unchanged.)
- **Not a harness/trust/memory rebuild.** Ditto's harness pipeline, trust model, and two-scope memory are ahead of ProcessOS — leave them alone except where a transfer plugs in.
- **Not multi-tenant Composio adoption.** P6/301 adopts MCP-the-standard pointed at Composio for single-tenant dogfood. Composio-for-customers and the token-residency question stay open (light ADR-031 amendment only).

## Inputs

1. `.context/attachments/A7hasF/pasted_text_2026-05-30_23-39-22.txt` — the full ProcessOS-transfer mission spec (P1–P7 with build instructions). **Source of truth for the technical detail.**
2. `docs/adrs/031-oauth-credential-platform.md` — Composio currently DEFERRED for Ditto; P6/301 lightly amends this for the single-tenant MCP path.
3. `docs/adrs/045-integration-provider-engine-boundary.md` — the engine↔broker seam; complementary to (not competing with) the MCP client.
4. `docs/landscape.md:559-569` — Nango vs Composio evaluations; Composio Rube MCP server.
5. `src/engine/llm.ts`, `src/adapters/claude.ts`, `src/engine/heartbeat.ts` — P1/P4/P5 code area.
6. `src/engine/integration-registry.ts`, `src/engine/integration-handlers/index.ts`, `src/engine/tool-resolver.ts`, `src/engine/credential-vault.ts` — P6 seams.
7. `docs/review-checklist.md` + `docs/architecture.md` — mandatory review-agent inputs each phase.

## Constraints

- **LLM-boundary guardrail** (becomes lint in P7/300): provider SDKs import only in `src/engine/llm.ts` (+ `web-search.ts` exception).
- **Schema migrations (Insight-190):** P3/299 and P6/301 add Drizzle migrations. The engine journal is at idx 19 (`drizzle/`), network at idx 17 (`drizzle/network/`). Check the journal for the next free idx at build time, run `drizzle-kit generate`, verify SQL + snapshot exist per entry. Resequence on conflict.
- **Step-run guard (Insight-180):** P6/301 adds external-side-effecting tool execution (MCP calls that send mail, write CRM, etc.) — those tool paths require a real `stepRunId` per the Insight-215 two-regime contract (real run for side-effecting, sentinel acceptable for read-only).
- **Provenance:** every new pattern marks `Provenance: ProcessOS/Catalyst Mastra port (sibling project)`.
- **Process discipline:** each phase runs Research → Design → Build → Review; the mandatory fresh-context Reviewer pass against `docs/review-checklist.md` is not optional. Update `docs/state.md` + `docs/roadmap.md` after each phase.

### ⚠️ Cross-checkout coordination (read before building)

The original mission was written against the **`/Users/thg/code/ditto` sibling checkout**, not this `tripoli-v1` conductor workspace. **Before building any phase, confirm none of P1–P7 is already underway in that checkout** — duplicate work plus migration-journal collisions (Insight-190) are the failure mode. If the sibling checkout has started, reconcile branches first. This brief assumes execution happens **here**, branched off the now-updated `main`.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Tripwire guard (`assertNotTripwire` → `assertModelOutput`) | ProcessOS/Catalyst Mastra port | pattern | ProcessOS proved the "silent tripwire success" failure mode; Ditto reimplements behind its own `llm.ts` boundary |
| Prompt registry + inspector (`/~/agents/prompts`) | ProcessOS/Catalyst | pattern | Single inspection surface proven valuable; Ditto-native registry + `ditto prompts` CLI |
| `parent_run_id` real-column attribution | ProcessOS/Catalyst | pattern | Real column (not JSON) so descendant-of-X is a recursive join; mirrors Ditto's own `delayed_runs.created_by_run_id` |
| Per-loop tool-call recording | ProcessOS/Catalyst | pattern | ProcessOS records every loop tool-call; Ditto matches completeness for codebase tools |
| MCP ingestion (capture → wrap-as-recorded-tool → execute in auth/scope context) | ProcessOS/Catalyst + `@modelcontextprotocol/sdk` | adopt (pattern) + depend (sdk) | Working ingestion pattern to adapt; SDK is the standard MCP client |
| Composio as MCP endpoint | composio.dev (Rube) | depend (config, not code) | Hosted MCP server gives account-connection without a bespoke adapter |

## After Completion (per phase)

1. Update `docs/state.md` (rolling log + live sections).
2. Update `docs/roadmap.md` (add the Engine-Hardening thread row on first completion; status per phase after).
3. Phase retrospective: what worked, what surprised, what to change.
4. Write the phase's reserved ADR (051/052/053) if it carries a design decision.
