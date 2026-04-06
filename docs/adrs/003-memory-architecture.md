# ADR-003: Memory Architecture

**Date:** 2026-03-19
**Status:** accepted (Phase 2b scope implemented; `self` scope added Brief 029; `solution` type + `metadata` column added Brief 060; `person` scope added Brief 080; `shared` flag for house-level vs user-level person memory added ADR-025; Phase 3 LLM reconciliation and Phase 7 vector search pending)

## Context

The architecture spec (lines 196-204) defines a two-scope memory model: agent-scoped memory (cross-cutting knowledge that travels with the agent) and process-scoped memory (learning specific to a process). Both are described as living in a `memory` table with `scope_type` and `scope_id`, merged at invocation time.

This table does not exist. The current schema (`src/db/schema.ts`) has:
- `feedback` table — raw human reactions (approve/edit/reject) with `diff`, `correctionPattern`, `patternConfidence`
- `activities` table — audit trail of everything that happened
- `agents` table — agent identity, budget, permissions

What's missing is the layer between raw feedback and agent behaviour — the **learned patterns** that an agent carries between runs. In the human mental model from the research: the manager corrects the employee (feedback), the employee internalises the lesson (memory), and next time they get it right without being told (improved output).

The memory research (`docs/research/memory-systems.md`) examined 9 systems and found:
- No system implements process-scoped memory (knowledge belonging to a process, not an agent)
- No system extracts correction patterns from edit diffs
- No system gates memory by trust level
- Mem0's scope filtering + reconciliation is the cleanest primitive for Ditto's needs
- At dogfood scale (<1K memories), SQLite without vectors is sufficient
- Letta's `compile()` pattern maps to harness assembly

Insight-001 (Quality Criteria Are Additive) directly applies: correction patterns extracted from feedback are the raw material for quality criteria. Memory is the bridge between "human corrected this" and "the system now checks for this."

ADR-001 (SQLite) constrains storage to SQLite + Drizzle for dogfood.

## Decision

### 1. Add a `memories` table to the schema

**Naming note:** The architecture spec (line 204) uses `memory` (singular) with `scope_type`/`scope_id` (snake_case). This ADR uses `memories` (plural) with `scopeType`/`scopeId` (camelCase) to match the existing schema conventions in `src/db/schema.ts` — all other tables are plural (`processes`, `agents`, `activities`, `captures`) and columns use camelCase in Drizzle. The architecture spec should be updated to reflect this convention. The SQL column names will be snake_case (`scope_type`) per Drizzle's mapping.

```
memories
├── id: text (UUID)
├── scopeType: text ("agent" | "process" | "self" | "person")
├── scopeId: text (references agents.id, processes.id, user identifier, or people.id)
├── type: text ("correction" | "preference" | "context" | "skill" | "user_model" | "solution")
├── content: text (the memory itself — natural language)
├── metadata: text (JSON, nullable — structured fields for solution memories: category, tags, rootCause, prevention, failedApproaches, severity, sourceRunId, relatedMemoryIds)
├── source: text ("feedback" | "human" | "system" | "conversation")
├── sourceId: text (nullable — references feedback.id if extracted from feedback)
├── reinforcementCount: integer (default 1 — incremented on duplicate)
├── lastReinforcedAt: integer (timestamp_ms)
├── confidence: real (0.0-1.0)
├── active: integer (boolean, default true — soft delete)
├── createdAt: integer (timestamp_ms)
├── updatedAt: integer (timestamp_ms)
```

**Why these fields:**

- **scopeType + scopeId**: Four memory scopes. Agent-scoped memories travel with the agent. Process-scoped memories stay with the process even when agents are swapped. Self-scoped memories (ADR-016, Brief 029) belong to the Conversational Self — user preferences, communication style, cross-session continuity. `scopeId` is the user identifier for self-scoped memories. Person-scoped memories (Brief 079/080) store knowledge about a person in Ditto's relationship graph — contact context, interaction patterns, preferences. `scopeId` references `people.id`. Person memory isolation is via join path: `memories.scopeId` → `people.id` → `people.userId` (no `userId` column on the memories table). Person memories carry a `shared` flag (ADR-025, default `false`): when `true`, the memory is house-level institutional knowledge ("Priya prefers email") visible to all users across the centralized Ditto Network; when `false`, it is private to the creating user. Provenance: Mem0's scope filtering (`mem0/memory/main.py`), extended for the Self and person scopes.

- **type**: Six memory types grounded in the human mental model:
  - `correction` — "Don't use formal tone" (learned from being corrected)
  - `preference` — "Uses 2-space indentation" (accumulated style/preference)
  - `context` — "Q4 deadline is Dec 15" (situational knowledge)
  - `skill` — "For invoice extraction, check date format first" (learned procedure)
  - `user_model` — "User works in construction, prefers terse responses" (9-dimension user model, Brief 040)
  - `solution` — "Bathroom labour estimates need 1.5x multiplier for tight access" (structured knowledge extracted from corrections, Brief 060)

  Not included: `identity` (already in `agents` table as role, description, adapterConfig) and `session` (execution state, not memory — handled by heartbeat snapshot, per research Section 7).

- **reinforcementCount + lastReinforcedAt**: When the same correction pattern is extracted again, increment rather than duplicate. Provenance: memU's reinforcement counting (`src/memu/database/models.py`, `extra.reinforcement_count`).

- **confidence**: Starts low (single observation), grows with reinforcement. A correction extracted once has confidence 0.3. After 3 reinforcements, 0.7. After 5+, 0.9. Exact thresholds are configuration, not schema.

- **source + sourceId**: Provenance chain. A memory extracted from feedback traces back to the specific feedback record. A memory entered by a human has source "human". This supports the audit trail without duplicating Graphiti's temporal complexity.

- **active**: Soft delete. Contradicted memories are deactivated, not deleted. The activities table records the deactivation event. Current state + activity log — no need for Graphiti-style bi-temporal edges.

### 2. No vectors for dogfood

At dogfood scale, memories are retrieved by scope filtering:

```
SELECT * FROM memories
WHERE scope_type = ? AND scope_id = ?
AND active = true
ORDER BY reinforcement_count DESC, confidence DESC
```

With <100 memories per scope, this returns in microseconds. No embeddings, no vector search, no new dependencies. The LLM is the relevance filter — all scope-matching memories are injected and the model decides what's pertinent.

When scale demands it (>1K memories per scope), add `sqlite-vec` for embedding-based retrieval. This is a Deferred Infrastructure decision, not a Phase 2 concern.

Provenance: memU's SQLite backend uses brute-force at small scale (`src/memu/database/sqlite/`). Claude Code uses no vectors at all.

### 3. Harness manages memory, not the agent

The harness (system) manages memory writes, not the agent. This follows from Ditto's trust model: the harness is the governor.

- **Feedback → memory extraction:** When a human provides feedback (`edit` or `reject`), the harness extracts correction patterns via LLM (Mem0-style reconciliation: ADD/UPDATE/DELETE/NONE applied against existing memories for that scope). Edits provide rich signal (the diff shows exactly what changed). Rejections provide directional signal (what was wrong, even without a correction). Approvals create no memory — the absence of corrections is itself a signal, tracked by trust data, not memory. Provenance: Mem0 (`mem0/configs/prompts.py`, reconciliation prompt).

- **No agent self-modification of memory** in Phase 2. The architecture's agent harness model (line 153) places memory alongside identity, tools, and permissions — all managed by the harness, not the agent. Whether agents should ever manage their own memory is an open design question for future phases, not a decision made here.

### 4. Memory assembly at invocation time

A single function assembles the memory context before each agent invocation. Inspired by Letta's `compile()` (`letta/schemas/memory.py`) and Open SWE's `get_agent()` (`agent/server.py`).

The assembly function:
1. Load agent-scoped memories (filtered by agent_id, active=true)
2. Load process-scoped memories (filtered by process_id, active=true)
3. Merge, dedup, sort by `reinforcementCount DESC, confidence DESC` (Phase 2b). Phase 3 refines to `confidence * log(reinforcementCount + 1)` with recency decay.
4. Apply budget: take top-N memories that fit within context allocation
5. Render as structured text block injected into the agent's system prompt

This is the seam where all memory converges before the runtime fires — part of the existing harness assembly concept in the architecture spec (line 195).

### 5. Correction extraction via Mem0-style reconciliation

When feedback of type `edit` or `reject` is recorded:
1. For `edit`: extract the diff from the feedback record. For `reject`: use the rejection comment and original output.
2. Send original output + feedback signal (diff or rejection reason) + existing memories for the process scope to LLM
3. LLM returns operations:
   - **ADD**: New correction pattern (e.g., "Always include a risk section")
   - **UPDATE**: Existing memory enriched with new detail
   - **DELETE**: Memory contradicted by new feedback (deactivate)
   - **NONE**: No new learning from this edit
4. Apply operations to `memories` table
5. If ADD matches an existing memory (content similarity), increment `reinforcementCount` instead
6. Log the extraction as an activity

Provenance: Mem0 (`mem0/memory/main.py`, add method flow; `mem0/configs/prompts.py`, reconciliation prompt). The UUID-to-integer mapping trick (line 222 of research) prevents LLM hallucination during reconciliation.

### 6. Process-scoped memories persist across agent assignments

When a new agent is assigned to a process, it inherits all process-scoped memories. The memories belong to the process, not the agent. This is like a new hire inheriting the team's playbook.

Agent-scoped memories stay with the agent regardless of which process they serve.

This is **Original to Ditto** — no system in the research models process-owned learning.

## Phased Implementation

This ADR describes the full memory architecture. Implementation is phased:

**Phase 2b (current):**
- `memories` table schema (all fields)
- Memory assembly function (load → sort → budget → render → inject)
- Simple sorting: `reinforcementCount DESC, confidence DESC`
- Feedback-to-memory bridge: direct insert on edit/reject feedback, no LLM extraction
- Duplicate detection: exact content match increments reinforcementCount
- Confidence: starts at 0.3, grows with reinforcement (capped at 0.9)

**Phase 2b+ (Brief 060 — knowledge compounding):**
- `solution` memory type with structured `metadata` JSON column (category, tags, rootCause, prevention, failedApproaches, severity, sourceRunId, relatedMemoryIds)
- Knowledge extraction system process: 3 parallel extractors (context-analyzer, solution-extractor, related-finder) + assembly step
- Significance threshold: extraction fires on moderate+ edits, rejections, retries, first 10 runs, or 3+ correction patterns
- Trust-tier-aware scaling: supervised=all, spot-checked=50%, autonomous=degradation only, critical=all
- Separate 1000-token solution knowledge budget in memory assembly (doesn't compete with corrections)
- Knowledge lifecycle: confidence 0.5 at creation, decay by 0.1 after 50 runs without retrieval, pruning below 0.2, supersession of stale solutions
- SQL-based deduplication via metadata matching (not LLM) — consistent with dogfood-scale constraint

**Phase 3 (trust earning):**
- LLM-based memory reconciliation (Mem0-style ADD/UPDATE/DELETE/NONE)
- Correction pattern extraction from edit diffs
- Memory reinforcement data as input to trust tier decisions
- Confidence formula refinement (recency decay, `confidence * log(reinforcementCount + 1)`)

**Phase 7 (learning, full):**
- Performance decay detection using memory + feedback data
- Memory consolidation/compaction (when volume demands)
- Vector search via sqlite-vec (when >1K memories per scope)

## Non-Goals

- **Vector search** — deferred until >1K memories per scope demands it
- **Agent self-modification of memory** — deferred until trust tiers gate write access
- **Temporal invalidation** (Graphiti-style bi-temporal edges) — `active` flag + activities table is sufficient
- **Memory consolidation schedules** — extraction happens on feedback events, not on a timer
- **Quality criteria generation from memories** — that's the Insight-001 pathway, belongs in Phase 3 (trust earning)
- **Embedding storage** — no embedding columns in the schema; add when vector search is needed

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Scope filtering (agent/process) | Mem0 `mem0/memory/main.py` | Clean scope separation; maps directly to architecture's two-scope model |
| Reconciliation model (ADD/UPDATE/DELETE/NONE) | Mem0 `mem0/configs/prompts.py` | Handles dedup, contradiction, enrichment in one pass |
| UUID-to-integer mapping for LLM reconciliation | Mem0 `mem0/memory/main.py` | Prevents hallucinated IDs |
| Reinforcement counting | memU `src/memu/database/models.py` | Repeated patterns strengthen rather than duplicate |
| Memory assembly function | Letta `letta/schemas/memory.py` (`compile()`), Open SWE `agent/server.py` (`get_agent()`) | Single function composing context before invocation |
| SQLite storage without vectors | ADR-001 (SQLite-first), memU SQLite backend, Claude Code (no vectors) | Consistent with dogfood constraints |
| Process-scoped memory | **Original** — no existing system | Ditto's process-first model requires process-owned learning |
| Correction pattern extraction from diffs | **Original** — no existing system | Bridge between feedback (L5) and memory (L2) |

## Consequences

- **Easier:** Agents improve between runs without being re-taught. A correction given once persists as a memory for all future invocations.
- **Easier:** Swapping an agent on a process preserves all learned corrections. The process doesn't lose its accumulated knowledge.
- **Easier:** Feedback has a visible downstream effect — humans can see that their correction became a memory, closing the loop.
- **Harder:** Memory extraction adds an LLM call per feedback event. At dogfood scale this is negligible; at production scale it needs to be async.
- **Harder:** Memory quality depends on extraction prompt quality. Bad prompts = noisy memories = polluted agent context.
- **New constraint:** The `memories` table is a new table requiring schema sync (`drizzle-kit push`). Destructive sync is acceptable per ADR-001.
- **Follow-up:** Phase 3 (Trust Earning) should use memory reinforcement data as input to trust tier decisions. A process with 10 well-reinforced correction memories has a more mature quality signal than one with zero.
- **Follow-up:** The memory assembly function is part of the harness pipeline — its design should be coordinated with the Phase 2 harness brief.
