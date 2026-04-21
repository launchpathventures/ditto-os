# ADR-039: Hired-Agent Memory Scope

**Date:** 2026-04-20
**Status:** proposed
**Extends:** ADR-003 (Memory Architecture) — adds a new `scope_type` value
**Required by:** ADR-037 §1 (`memoryScope` field), Brief 202 pre-start dependency

## Context

ADR-003 defines four memory scopes: `agent`, `process`, `self`, `person`. The `agent` scope is currently the keyspace for system agents (harness-internal machinery per ADR-008 — intake classifier, orchestrator, router, metacog). These memories are not user-addressable; they live inside the platform.

ADR-037 introduces **hired agents** — user-addressable, persistent, configured specialists. Persona Nadia's JTBD requires that each hired agent accumulates its own learning (a Marketing Manager builds a different corpus than a Bookkeeper), and that this learning is **isolated** by default between hired agents.

Three shapes were considered:

1. **Reuse the existing `agent` scope, differentiated by `scopeId` pattern.** Rejected — collides the system-agent keyspace (harness machinery) with the hired-agent keyspace (user-visible specialists). A single malformed `scopeId` could surface harness internals to the user. Also breaks access-control semantics: system-agent memories should never be user-readable; hired-agent memories should always be self-readable.

2. **A `specialist` or `worker` scope.** Rejected — introduces terminology that contradicts ADR-037's locked vocabulary (no "employee/worker/staff"). The value must be `hired-agent` for consistency.

3. **A new `hired-agent` scope value.** Adopted. Separate keyspace, distinct access-control rules, no conflation with system-agent memories.

## Decision

### 1. Extend ADR-003 `scope_type` enum

The `scope_type` text union in the `memories` table adds a fifth value:

```
scopeType: text ("agent" | "process" | "self" | "person" | "hired-agent")
```

No schema-breaking change — existing rows unaffected, new rows may use the new value. Drizzle type union extended; no migration other than the type update.

### 2. `scopeId` semantics

For `scope_type = 'hired-agent'`, the `scopeId` references `hiredAgents.id` (ADR-037's table). Isolation is via the join path: `memories.scopeId` → `hiredAgents.id` → workspace.

**ADR-037 `memoryScope` field value:** the `memoryScope` column on the `hiredAgents` row stores the string `hired-agent:<agent-id>` (the hired agent's own UUID prefixed with the scope type). When the harness assembles memory for this agent, it parses the prefix to select `scope_type` and uses the `<agent-id>` portion as `scope_id`. This is a derived, self-referential field — present on the row for convenience of downstream code that needs the full tuple without a computed join.

### 3. Access control

| Reader | Read access to `hired-agent` scope memories |
|---|---|
| **Self** (workspace's Self) | Read all hired-agent memories in the workspace. Self is the manager (ADR-038); supervision requires full visibility. |
| **The owning hired agent** | Read its own memories (`scopeId = self.id`). |
| **Other hired agents** | No default read access. Cross-agent sharing requires explicit user-initiated grant (deferred — no mechanism in this ADR; default = none). |
| **The user** | Read all via UI (Agent Detail → Memory section). |
| **System agents** | No access by default; harness-internal machinery does not read hired-agent memories unless explicitly passed via harness assembly. |

**Write access — all principals:** the harness is the sole writer. No principal (Self, owning hired agent, other hired agents, user, system agents) may write to `hired-agent` scope memories directly. Memory writes are extracted from feedback/edits/rejections by the harness and attributed to the hired agent's `scopeId`. This is ADR-003 §3 unchanged, stated explicitly here because it applies equally to all readers listed above.

### 4. Memory assembly

ADR-003 §4 (memory assembly at invocation time) extends to the hired-agent case:

1. When a hired agent is invoked for a turn, the harness assembles its memory context as:
   - `hired-agent` scope filtered by `scopeId = agent.id` (the agent's own learning)
   - `process` scope filtered by the processes the agent is currently running (inherited playbook, per ADR-003 §6)
   - `self` scope (the Self's knowledge of the user — read-only; agent uses it to be consistent with Self's understanding but does not mutate it)
   - `person` scope filtered by any people referenced in the turn
2. Same merge/dedup/budget/render pipeline as ADR-003 §4.

When **Self** is observing a hired-agent conversation (per ADR-038), Self's own assembly includes the `hired-agent` memories of the agent under observation *conditioned on ADR-038's observation band*:

- **Bands A–C** (supervised + spot_checked + recent-autonomous): full `hired-agent` memory assembly every turn
- **Band D** (autonomous): `hired-agent` memory assembly only on sampled observation turns (ratio per ADR-038 §3) and on all side-effect gates
- **Band E** (critical): `hired-agent` memory assembly only during the daily post-hoc review window; not on per-turn observation

Self does not inject its own `self` scope into the agent's context — that would conflate identities.

### 5. Cross-agent sharing — deferred

A user may eventually want two hired agents to share a memory ("*both the Marketing Manager and the Sales agent should know the Q2 campaign details*"). This requires an explicit grant mechanism (cross-share table, UI affordance). **Deferred.** Default = no cross-sharing. When the feature is needed, a follow-up ADR will specify the grant primitive.

**Named trigger for reopening:** first user request in dogfood for cross-agent memory sharing, OR ≥ 2 hired agents with operationally overlapping domains (observable via process-assignment overlap in the workspace).

- **Decision owner:** Architect.
- **Consulted:** Dev PM (prioritization) and Dev Designer (user-initiated grant UX).
- **Decision artefact on trigger-fire:** a new ADR specifying the cross-share primitive (schema + access model + UI affordance).

### 6. Lifecycle alignment with ADR-037

Agent lifecycle state (active/paused/archived) must **not** reuse the `memories.active` flag — that flag is reserved for ADR-003's contradiction semantics (*a specific memory was invalidated by new evidence*). Mixing the two axes would resurrect contradicted memories on un-archive.

- Hired agent `status: active` — memories accumulate normally.
- Hired agent `status: paused` — memory reads continue (Self can still query); no new memories written until resumed.
- Hired agent `status: archived` — memories remain in the DB, **untouched**. The `memories.active` flag is not modified on archive. Instead, the harness memory assembler filters out memories whose `scopeId` resolves to a `hiredAgents` row with `status = 'archived'`. On un-archive, no row mutations needed — filter returns them naturally. Contradiction state (the `active` flag) is preserved across archive cycles.

## Provenance

- **Source:** ADR-003 (Memory Architecture) — extends its scope enum and assembly pipeline.
- **Pattern origin:** Mem0 scope filtering (same as ADR-003). No net-new pattern import.
- **Access-control axis:** Original to Ditto — derived from ADR-038's Self-as-manager principle.
- **Deferred cross-share mechanism:** Original; no prior Ditto ADR on this.

## Consequences

### What becomes easier

- Each hired agent's learning is isolated by default — no memory leakage between the Marketing Manager and the Bookkeeper.
- Self's supervisory read access on all hired-agent memories is structural, not a procedural check.
- Agent Detail page's Memory surface (future) queries one scope type with a simple filter — no cross-scope join logic.
- Hired agents inherit process-scope memories unchanged per ADR-003 §6 — *"like a new hire inheriting the team's playbook."*

### What becomes harder

- One more scope type in the harness assembly branching logic. Low cost — pattern is already established.
- Cross-agent sharing becomes a future feature request that must be designed (deferred per §5).

### New constraints

- **System-agent memories (`scope_type = 'agent'`) remain harness-internal.** UI surfaces MUST NOT expose them. If a future system-agent surface is needed, a new ADR must specify it.
- **No agent self-modification of hired-agent memory** in the hire-agents phase (Brief 201). Harness-managed only, per ADR-003 §3. Whether hired agents may eventually manage their own memory is a future question.
- **Default isolation.** No accidental cross-agent sharing. Implementations must explicitly pass a hired agent's `scopeId` when reading — no "all hired-agent memories in this workspace" queries without Self authorization.

### Follow-up decisions

- Cross-agent memory sharing (named trigger above).
- Agent Detail Memory surface — design in Brief 205 (Agent Detail page) or a follow-up.
- Whether the user may hand-edit hired-agent memories via UI (read-only today; write may come with agent-self-modification decisions).
