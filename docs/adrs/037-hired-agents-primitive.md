# ADR-037: Hired Agents — Activating the L2 Agent Primitive with a Conversational Hire Mechanic

**Date:** 2026-04-20
**Status:** proposed
**Depends on:** ADR-036 (Database Tier Strategy), ADR-016 (Conversational Self), ADR-025 (Centralized Network Service)
**Paired with:** ADR-038 (Self-Supervised Agent Dialogue), Insight-203

## Context

The 6-layer Ditto architecture has always included L2 as the Agent layer, with dictionary entries defining agents with roles (Bug Hunter, Builder, Debugger — dictionary.md:91, 99, 183). UI primitive #10 *Agent Card* (human-layer.md) is fully spec'd: *"name, role, processes served, runtime, cost, trust level, performance trends. Can represent an AI agent, script, rules engine, or human."* None of this is built at the user-facing layer. L2 has been an abstract primitive.

Persona Nadia (personas.md:170) is literally titled *"Team Manager Supporting Specialists with Agents"* — her core JTBD is hiring and supervising specialists. The primitive she needs has been in the architecture for ~18 months without activation.

Paperclip (paperclipai/paperclip) provides a reference implementation of the hire mechanic:
- `agents` table (name, role, adapter, model, runtime, budget, skills, instructions, reports_to)
- `NewAgent.tsx` flat form for creation
- `AgentDetail` page with 6 tabs (Dashboard/Instructions/Skills/Configuration/Runs/Budget)
- `approvals` table with `hire_agent` type
- Per-agent API keys, runtime state, task sessions

The Paperclip shape is the closest real-world prior art. But three properties must change to fit Ditto:
1. **Hire is a conversation, not a form.** Ditto leads with conversation; Paperclip leads with configuration. The "hire CEO as step 1" first-run experience is Paperclip's signature anti-pattern from Ditto's perspective.
2. **Storage is filesystem-legible.** Per Insight-201 (user-facing legibility default), agent config lives in YAML files the user can grep, diff, and version — with a DB mirror for query, not as the source of truth.
3. **Self retains primacy.** Agents are specialists Self manages; not peers, not replacements (ADR-038).

## Decision

Activate L2 Agent as a **user-facing, configurable, persistent specialist primitive** called simply *Agent* in user language. Build on Paperclip's schema shape, with three structural departures: conversational hire flow, YAML-primary storage, and Self-supervisory relationship (ADR-038).

### 1. The primitive

An **Agent** in Ditto is a persistent, specialized configuration the user hires to handle a defined domain of work. Each agent has:

| Field | Purpose | Analogous Paperclip field |
|---|---|---|
| `id` | Stable identifier (uuid) | `agents.id` |
| `name` | User-given name ("Marketing Manager", "Bookkeeper") | `agents.name` |
| `role` | Short role descriptor ("marketing-manager") | `agents.role` |
| `icon` | Avatar/emoji | `agents.icon` |
| `adapter` | Runtime adapter key (`claude_local`, `script`) | `agents.adapter_type` |
| `model` | Model identifier | part of adapter_config |
| `runtime` | Runtime config (env, cwd, tools allowed) | `agents.runtime_config` |
| `instructions` | Agent-specific system prompt / AGENTS.md | `agents.instructions` |
| `skills` | Enabled skills / tool scopes | part of adapter_config |
| `budget` | Monthly spend cap (cents) + warn percent | `budget_policies` scoped to agent |
| `trustTier` | ADR-007 enum (`supervised` / `spot_checked` / `autonomous` / `critical`); governs Self observation rate (ADR-038) | extends ADR-007 |
| `scope` | Domain label + permission grants (which processes/integrations/memories reachable) | `principal_permission_grants` |
| `memoryScope` | Agent-scoped memory keyspace. **Requires ADR-039 (or ADR-003 amendment) to add `hired-agent` as a scope_type value before this field ships.** See Brief 201 pre-start dependency. | extends ADR-003 |
| `status` | `active` / `paused` / `archived` | `agents.status` |
| `createdAt`, `hiredBy` | Provenance | `agents.created_at` |

**Explicit exclusions** (Paperclip fields not adopted):
- `reports_to` — Ditto has no agent-to-agent hierarchy; Self is the manager, agents are peers under Self
- `company_id` — no tenancy field; agents live within one workspace (see ADR-036)
- `spent_monthly_cents` — derived from `cost_events` (Ditto already has event-sourced cost aggregation)
- `agent_api_keys` — agents don't call back into Ditto's API; they run in-harness

### 2. Storage — YAML primary, DB mirror

**Source of truth:** one YAML file per agent at `{workspaceRoot}/agents/<role-slug>.yaml`.

- Grep-able, diffable, user-inspectable.
- Editable by hand for power users. A "Configuration" tab in the UI is a structured editor that writes the same YAML.
- Version control per workspace: agents can be committed to a workspace's git if the user chooses.

**Mirror:** a `hiredAgents` table in the Workspace-tier DB (ADR-036) holds the parsed structure for query performance (joins with `costEvents`, `runs`, `workItems`).

**Reconciliation:** on workspace start, the engine walks `agents/*.yaml` and upserts the DB mirror. User hand-edits the YAML and restarts — the DB catches up. On hire-via-conversation, Self writes the YAML and the DB mirror simultaneously.

**Runtime state** (lifetime token counts, last-run-id, active session) lives only in the DB — it's derived state, not config. This is the one place we adopt Paperclip's `agent_runtime_state` pattern.

### 3. Hire-as-conversation

Hiring is a consultative conversation, not a form submission. The flow:

1. User says (or captures): *"I need someone to handle my monthly invoice reconciliation."*
2. Self enters a **hire intent** cognitive mode. It asks 2–4 clarifying questions (scope, frequency, trust boundaries, examples).
3. Self drafts a proposed **Agent spec** (YAML preview) and a **starter process** scaffold if one doesn't exist. Renders inline as a `HireProposalBlock` (new content block type).
4. User approves, edits inline, or asks for changes.
5. On approval: Self writes `agents/<role-slug>.yaml`, inserts the DB mirror row, links any starter processes to the agent's scope, and returns the new Agent Card.
6. The agent is now hireable for work — Self can delegate to it, or the user can invoke it directly.

**Form fallback for power users:** a "Hire from scratch" affordance opens a structured editor that writes the same YAML. Same primitive, different affordance. The conversational path is the default.

**Not in this ADR — in the parent brief:** the first-run experience should not land on an empty agent roster. Self may propose a starter agent tied to the user's first stated goal, or offer a default suggestion based on the user's persona pathway. Designed in the build phase.

### 4. Relationship to existing Ditto concepts

| Ditto concept | Relationship to Hired Agent |
|---|---|
| **Self** (ADR-016) | Manager. Agents run under Self's supervisory observation (ADR-038). |
| **System agents** (ADR-008) — intake classifier, orchestrator, router, metacog | Internal harness machinery. Not user-visible. Not called "agents" in user language; called "Ditto's internal processes" if surfaced at all. |
| **Personas** (Alex / Mira / Ghost) | Style of Self's front-door presentation. Orthogonal to Agent. Alex-style Self can still manage a Marketing Manager agent. |
| **Processes** (L1) | Units of work. Processes are **invoked by** agents (or directly by Self). One process may be available to multiple agents. Processes are not owned by agents. |
| **Work items** | Tasks assigned to an agent or to Self. Agents can own work items. |
| **Trust tiers** (ADR-007) | Apply per-agent. A new hire starts at `supervised`; tier rises with observed reliability per ADR-007's existing mechanics. Governs Self's observation rate (ADR-038 §3 observation-rate mapping, which maps each ADR-007 tier + time-in-tier to an observation sampling policy). |
| **Memory scopes** (ADR-003) | Agents get their own memory scope keyspace. Agent memories are readable by Self and by the agent; not by other agents without explicit cross-share. |
| **Deliberative perspectives** (ADR-028) | Internal cognitive lenses Self uses privately. Not the same as Hired Agents. A Hired Agent is externally addressable and persistent; a deliberative perspective is Self's internal machinery for a single deliberation. |

### 5. UX surfaces

Three surfaces are affected in this ADR's scope (detailed in parent Brief 201):

1. **Agent Card** (UI primitive #10, currently spec'd-only) — renders in a Team roster, in process attribution, in Work Item assignment, in Self's proposal blocks.
2. **Agent Detail page** — Adapted from Paperclip's 6-tab `AgentDetail`, simplified. Tabs: Overview, Instructions, Processes (what they can run), Activity, Configuration. Runs tab subsumed by Activity. Budget surfaced inline in Overview, not as a tab.
3. **Hire conversation** — lives in any Self conversation surface. Produces a `HireProposalBlock` content block; users approve or revise inline.

**Deferred to later phase:** Agents page (fleet overview), OrgChart-as-HarnessView (reimagined per the reconsidered anti-candidate list — harness legibility, not reports_to), Team inbox-style view.

## Provenance

- **Source project:** Paperclip (https://github.com/paperclipai/paperclip)
  - `packages/db/src/schema/agents.ts` — base schema shape
  - `ui/src/pages/AgentDetail.tsx` — detail-page IA (6 tabs → simplified to 5)
  - `ui/src/pages/NewAgent.tsx` — form shape (conceptual source for the fallback editor, not the hire flow)
  - **Level: adopt** — copy schema structure, reshape for Ditto, own the code. Not a dependency.
- **Agent Card (UI primitive #10):** already defined in Ditto's `docs/human-layer.md`. This ADR activates it.
- **YAML-primary storage:** Ditto process definitions (`processes/*.yaml`). Extending the pattern.
- **Conversational hire flow, Self-agent relationship, trust-tier-driven observation, three-voice conversation:** Original to Ditto. See ADR-038, Insight-203.
- **Exclusion of `reports_to` and `company_id`:** Original — explicit departure from Paperclip's multi-company, hierarchical employee shape.

## Consequences

### What becomes easier

- Nadia's core JTBD (*"supporting specialists with agents"*) becomes buildable. One of the four personas stops being aspirational.
- Process attribution gains a clean owner (*"the Marketing Manager ran this"* vs *"Ditto ran this"*).
- Permission scoping becomes structural — integrations, memories, and processes scope to agent, not global.
- Work items get assignees beyond Self. The *"who's doing this?"* question in UI primitive #10 has a first-class answer.
- Trust earning becomes per-specialist, matching how humans actually trust — you trust your bookkeeper differently than your marketing lead.

### What becomes harder

- Two primitives (Self, Agent) that look similar to a new user. The dictionary and onboarding copy must distinguish them crisply. *Self is who you talk to by default; agents are specialists you've hired for specific work.*
- Memory scoping logic (ADR-003) must extend to agent-scoped keyspace. Non-trivial — requires ADR-039 (or ADR-003 amendment) as a pre-requisite for the `memoryScope` field.
- The `@ditto/core` boundary is tested. **Core-shaped fields** (pure primitive, reusable by any harness consumer): `id`, `name`, `role`, `icon`, `adapter`, `model`, `runtime`, `instructions`, `budget`, `trustTier`, `status`, `createdAt`, `hiredBy`. **Product-shaped fields** (Ditto-specific opinions): `skills` (refers to Ditto's skill ecosystem), `scope` (references Ditto integrations / processes / memories), `memoryScope` (ADR-003 extension). The core schema MUST allow extension hooks for the product-shaped fields without hard-coding them — typed extension points in `packages/core/src/agents/schema.ts`, actual Ditto-shaped instances populated in `src/engine/agents/`.

### New constraints

- **Name primitive is "Agent" in user language.** Never "employee," "worker," "staff," "team member" — these invite the Paperclip corporate metaphor. "Agent" is neutral and already in Ditto's vocabulary.
- **No `reports_to` field ever.** Agents do not manage other agents. Self is the only manager. If a hierarchy need emerges, it's a new ADR that must explicitly supersede this one.
- **No `company_id` on agents.** Agents are workspace-scoped. Multi-workspace-per-user (Brief 193) means N workspaces × N agents; switching workspaces swaps the whole agent roster.
- **Hire must remain conversational as the primary path.** A form-only hire is a regression to Paperclip's anti-pattern and must not be shipped as the default.
- **Side-effecting agent actions must require `stepRunId`** (Insight-180 invocation guard). When an agent executes a process step with external side effects, the `stepRunId` parameter is mandatory.

### Follow-up decisions

- Parent Brief 201 covers implementation, split into sub-briefs.
- ADR-038 (Self-Supervised Agent Dialogue) defines the Self↔agent relationship in detail.
- Deferred: multi-user delegated access to agents (Nadia → her assistant), covered later once workspace-multi-user is specified.
- Deferred: agent-to-agent delegation (if ever). Default: no. ADR required to change.

### Explicitly rejected alternatives

- **Agents as "facets of Self."** Dilutes Self's singular identity. The user would not be able to trust one facet differently from another, which kills the per-specialist trust-earning shape.
- **Agents as processes with names.** Conflates L1 and L2. A process is a unit of work; an agent is a persistent specialist that runs processes. Different primitives.
- **DB-only agent config (Paperclip's shape).** Breaks filesystem legibility (Insight-201). Rejected.
- **Hire-as-form as the primary path.** Rejected — Paperclip's signature anti-pattern per ADR-038 + Insight-049 (consultative not configurative).
- **Reports-to hierarchy.** Inherits Paperclip's corporate metaphor; contradicts ADR-016's Self-as-sole-manager. Rejected.
