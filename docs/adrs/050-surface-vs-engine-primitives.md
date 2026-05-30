# ADR-050: Surface Primitives vs. Engine Primitives — Workspace User-Facing Inversion

**Date:** 2026-05-21
**Status:** proposed

**Related:** ADR-024 (Composable Workspace Architecture), ADR-037 (Hired Agents Primitive — this ADR ratifies the user-facing word `Agent` that ADR-037 already established, and contains the engine-side rename that protects it), ADR-040 (User-Facing Apps Primitive), Brief 268 (managed-workspace onboarding), Brief 280 (unified chat IA inversion), Insight-030 (Structure is the product), Insight-049 (Consultative not configurative). Roadmap-referenced but not yet on disk: ADR-046 (Loop Primitive, proposed), Brief 247 (First Loop spine, draft), Insight-222 (Learn → Do → Loop spine).

## Context

Ditto's architecture has always called the *thing the user defines* a **Process** and the *thing that executes a step* an **Agent**. That vocabulary made sense when "agent" meant a runtime adapter (Claude, GPT, a script). It no longer matches the world the user lives in.

Three forces converged during the 2026-05-21 design conversation:

1. **The product-direction pivot.** Users don't struggle with surface — they struggle with *how* to extract value from AI. Ditto needs to be opinionated: meet users in a unified chat, learn who they are, and offer them **pathways** (curated, named, scoped) toward a working set of AI helpers. The process-first framing (build a process, then run it) is a developer mental model. The user mental model is "give me an assistant that does X."

2. **The terminology collision.** The AI industry has settled on **agent** as the user-facing word for "a thing that does work for me." Every consumer-grade competitor labels it that way (ChatGPT Agents, Claude Agents, Devin, Operator). Calling our user-facing primitive a "Process" forces every user to learn a Ditto-specific word for an industry-standard concept. The user's instruction: *"we need to use language that is commonplace — agents is the language of the day around AI that does things for the user."*

3. **The architectural inversion already in flight.** Brief 280 made `/chat` the workspace front door; Brief 247 made Learn → Do → Loop the spine; Brief 268 makes Alex/Mira the seed conversation. The harness's process model is correct — but it should live *behind* the chat, not *as* the workspace. Inspect surfaces (Agents page, Work Items page, Review queue) are useful **drill-downs**, not the primary nav.

The fix is not a rename. It is a **primitive split**: an explicit, documented separation between *what the user sees and talks about* (Surface) and *what the harness uses internally* (Engine). The two vocabularies overlap in places (Work Item), diverge in others (engine "Agent" ≠ surface "Agent"), and must never leak across the seam by accident.

The trigger to ratify this now: without a fixed mapping, every brief downstream of 247/268/280 has to re-litigate "what do we call this in the UI?" — and the engine's existing "Agent" terminology (Agent Layer, Agent Card, `ai_agent`) is on a collision course with the surface "Agent" the user now expects.

## Decision

We adopt two distinct, named primitive sets with a fixed mapping between them and a strict directionality rule.

### 1. Surface Primitives (what the workspace user sees)

The default workspace UI uses **only** these words. They are the vocabulary of `/chat`, of Alex/Mira's speech, of onboarding copy, of every default workspace nav label.

| Surface primitive | Meaning to the user | Engine concept it maps to |
|---|---|---|
| **Chat** | The unified conversation surface — the workspace front door | `selfConverseStream()` + ContentBlock rendering |
| **Alex / Mira** | The named advisor the user is talking to (the Self with a face) | `Self` (the conversational orchestrator) configured with a per-workspace name |
| **Pathway** | A guided, opinionated route from "who you are" to "an Agent doing X for you" | Curated bundle: intake + Hired Agent scaffold + attached Process(es) + first loop |
| **Agent** | A configured AI helper with a name, role, and trust level that does a recurring job for the user | A **Hired Agent** (`agents` table, per ADR-037) with one or more `Process` definitions attached for the actual step-by-step work |
| **Work Item** | A discrete thing in flight or done — visible, trackable | `work_items` row (engine name unchanged — this is the seam where the vocabularies overlap intentionally) |
| **Review** | A prompt to approve, edit, or reject something the Agent did | Trust-gate review surface |
| **Outcome** | What the Agent produced or achieved | Run output + recorded result |
| **Confidence** | How much the user trusts a given Agent (earned through Reviews) | Hired Agent trust tier + earning data |

**Critical alignment with ADR-037.** ADR-037 already established "Agent" as the user-facing word for a hired specialist with persistent identity, memory scope, and trust tier (`agents` table, `agents/<role-slug>.yaml`). ADR-050 does *not* override that — it ratifies it and clarifies the engine-side relationship: a **Process** is the *job the Hired Agent runs*, not the surface Agent itself. The user hires an Agent ("Sarah, my Marketing Manager"); Sarah runs one or more Processes (weekly-content-review, monthly-report) to do her job. The `agents` table is correctly named — it stores Surface Agents (= Hired Agents). The Engine "agent" that must rename is the **step-executor concept** at Layer 2 (`ai_agent`, `cli_agent`, "Agent Layer", "Agent Card" as the runtime-inspector card), not the Hired Agent primitive.

### 2. Engine Primitives (what the harness uses internally)

These words live in `@ditto/core`, in `packages/core/`, in `src/engine/`, in ADRs, in builder briefs, and in engineering conversation. They do **not** appear in workspace UI except on a deliberate drill-down surface (see §4).

| Engine primitive | Definition |
|---|---|
| **Process** | The atomic unit — a steppable, schedulable, harnessable definition |
| **Executor** | A step runtime: Claude, GPT, script, API, rules. (Renamed from "Agent" — see §3.) |
| **Skill** | A scoped capability an Executor can invoke (tool / system agent / integration) |
| **Trust Tier** | Spot-checked, Supervised, Autonomous, Critical |
| **Memory Scope** | Bounded memory region for a Process/Executor/Workspace |
| **Work Item** | Persistent row tracked across runs (same word, same table — the seam where vocabularies overlap intentionally) |
| **Harness** | The orchestrating runtime that binds Process + Executor + Memory + Trust |
| **Self** | The conversational orchestrator behind Alex/Mira |
| **Pathway** | Same word as the surface primitive — the engine-side representation is the seeded process bundle (the seam where vocabularies overlap intentionally) |

### 3. The Rename: engine "Agent" (step-executor sense) → "Executor"

**Scope:** the rename targets the Layer-2 step-executor concept *only*. The Hired Agent primitive (ADR-037, `agents` table, surface "Agent") is *not* renamed — it is correctly named already.

**Affected `@ditto/core` exports** (each of these must change in the follow-up rename brief and must include a ServiceOS impact note):

- `packages/core/src/db/schema.ts` — `stepExecutorValues` literals `"ai-agent"` and `"cli-agent"` → `"ai-executor"` and `"cli-executor"` (or equivalent). The exported `StepExecutor` type changes shape; every consumer (including ServiceOS) must migrate. **This is a breaking export change** — the rename brief must coordinate the migration.
- `packages/core/src/harness/harness.ts:40` — `StepDefinition.agent_role` field → `StepDefinition.executor_role`. Process YAML files referencing `agent_role:` must migrate.
- `packages/core/src/runner/kinds.ts:17` — `"claude-managed-agent"` runner kind → `"claude-managed-executor"` (or kept as a legacy alias with a deprecation note).
- `packages/core/src/db/schema.ts` — `memoryScopeTypeValues["agent"]` literal: **ambiguous, defer to the rename brief.** If this scope-key refers to the Hired Agent's memory (per ADR-037), it stays. If it refers to the executor's memory, it renames. Audit and decide in the brief.

**Affected internal-only names** (docs and code comments, lower blast radius):

- "Agent Layer" (Layer 2) → "Executor Layer" — `docs/architecture.md`, `docs/dictionary.md`
- "Agent Card" UI primitive — split: the *Surface Agent Card* (showing a Hired Agent) keeps the name; the *Executor inspect card* (drill-down showing which runtime served a step) becomes the "Executor Card." `docs/human-layer.md` updates needed.
- Dictionary entries: `Agent Layer`, `Agent Card`, `ai_agent`, `Adapter` revised to disambiguate.

**Explicitly unchanged** (verified against `packages/core/src/interfaces.ts`):

- `StepAdapter`, `SystemAgentHandler`, `MemoryProvider`, `EngineConfig` interface names — these never used "Agent" as a class name.
- The `agents` table and `AgentStatus`/`AgentCategory` exported types — these represent Hired Agents (per ADR-037) and are correctly named under the surface vocabulary.
- The `processes`, `process_runs`, `step_runs` tables — they keep their engine names.

**ServiceOS impact (corrected from initial draft).** ServiceOS *will* be affected: `StepExecutor` literal values, `StepDefinition.agent_role`, and the runner-kind literal are all consumer-visible exports they may consume. The follow-up rename brief must include a ServiceOS coordination note (likely: ship dual aliases during a deprecation window, or coordinate the migration with LaunchPath before cutting the change).

### 4. Drill-Down Rule (demote-not-delete)

Engine words **do not appear** in the default workspace UI. They appear only on **inspect surfaces** — secondary screens a user opens deliberately to look under the hood.

Concretely:

- **Default workspace nav (illustrative, not normative):** Chat (front door, per Brief 280), Agents (Hired Agents), Work Items, Reviews. Each label is a Surface primitive. The exact final nav is decided in Brief 280 (unified-chat IA inversion) — this ADR establishes the vocabulary, Brief 280 establishes the layout.
- **Reconciliation with ADR-024.** ADR-024 specified an earlier nav (Today / Inbox / Work / Projects / Routines / Settings). That nav was authored before the chat-front-door inversion (Brief 280) and the Surface/Engine primitive split (this ADR). The reconciliation rule: any ADR-024 destination that uses engine vocabulary or pre-inversion IA is **superseded by Brief 280 + this ADR**. Destinations using surface vocabulary (e.g., "Inbox," "Today") survive subject to Brief 280's final layout. ADR-024 should be updated in the follow-up architecture amendment.
- **Agent inspect drill-down:** opens a panel that *can* show the underlying Process definition(s), the recent Executor calls, the Skills attached, the Trust Tier, the Memory Scope. This is where engine vocabulary becomes visible — labeled, explained, and contained.
- **Work Items** is the seam: the word is identical in both vocabularies because the user-facing concept and the table are 1:1. No translation layer needed.
- **Activity Feed** (UI primitive #3) is a drill-down, not a default surface, by the definition in this ADR. Today copy speaks Surface vocabulary; the feed's expanded form may reveal engine context.
- **No silent rename of existing surfaces.** The current Agents page, Work Items page, and Review queue continue to exist. We do **not** delete them. We **demote** non-primary engine-exposing pages out of default nav and **align primary nav labels** with Surface vocabulary.

### 5. Vocabulary Leak Discipline

A surface that uses the word "Process" in default UI copy is a defect. A surface that uses "Executor" in default UI copy is a defect. Engine words are admissible only:

- Inside drill-down inspect panels (clearly labeled as such)
- In settings / admin screens used by builders, not users
- In API responses consumed by builders, not rendered to users
- In `docs/briefs/`, `docs/adrs/`, `docs/insights/`, code comments, log lines

Conversely, surface words are admissible in engine code only as **labels** (the user-facing string in a ContentBlock, the copy in a Pathway template) — never as a type name, table name, or symbol.

### 6. Implementation Sequencing (not in this ADR — for follow-up briefs)

This ADR is a **structural decision**, not an implementation plan. Three follow-ups land separately:

1. **`docs/architecture.md` amendment** — add a "Surface vs. Engine Primitives" section codifying the two tables above
2. **`docs/dictionary.md` revisions** — split entries that conflate the two layers (Agent, Pathway, Self), add surface aliases
3. **Brief 247 / 268 reshape** — re-thread the user-visible language so the First Loop spine and managed-workspace onboarding both speak the Surface vocabulary by default; engine briefs (248/249/250/251) keep their existing engine vocabulary unchanged

The `ai_agent` → `ai_executor` codebase rename is **out of scope** of this ADR; it will land as its own brief once the vocabulary is ratified.

## Provenance

**Pattern: adopted.** The mechanism — two named vocabularies with a directional leak rule between them — is structurally identical to **Domain-Driven Design's bounded-context ubiquitous-language separation** (Evans, 2003). DDD argues that each bounded context maintains its own ubiquitous language, and translations across context boundaries are explicit. Ditto's Surface and Engine are two such bounded contexts; the mapping table in §1 is the explicit translation layer.

The product framing also echoes Apple's Human Interface Guidelines, which separate *metaphor* (Desktop, Folder, Trash) from *implementation* (filesystem, inode, unlink). Apple keeps the two vocabularies clean because users live in the metaphor and developers live in the implementation.

**Original to Ditto:** the specific mapping (Agent↔Hired Agent+Process, Pathway↔seeded bundle, Alex/Mira↔Self), the drill-down/demote-not-delete rule, and the carve-out that the Hired Agent primitive keeps its name while the Layer-2 executor renames.

The specific terminology decisions in this ADR come from the design conversation of 2026-05-21:

- Alex/Mira (named Self) — user input, this conversation
- "Pathway" — user input, this conversation
- "Agent" as the surface word for engine Process — user instruction *"we need language that is commonplace — agents is the language of the day"*
- Drill-down / demote-not-delete framing — user input, this conversation
- The split-vocabulary mechanism — synthesized in this ADR

The underlying principle echoes **Insight-030** (*Structure is the product*) and **Insight-049** (*Consultative not configurative*). Both argue that the user's mental model is the product surface, not the engine. This ADR codifies the mechanism that protects that boundary.

## Consequences

### What becomes easier

- **Onboarding language matches the industry.** A user arriving at Ditto reads "Agent" and instantly maps it to ChatGPT Agents / Claude Agents — no Ditto-specific vocabulary tax.
- **Engine docs and briefs stay precise.** Engineering keeps "Process" and "Executor" as crisp, unambiguous internal terms. Builders writing briefs no longer wrestle with "do I mean the user-facing Agent or the runtime Agent?"
- **Brief reshapes downstream of 247/268/280 become mechanical.** Every brief now references this ADR for vocabulary, instead of re-deciding per brief.
- **The unified-chat-first IA (Brief 280) reads correctly.** Chat surfaces Pathways → Pathways produce Agents → Agents do Work Items → Reviews earn Confidence. The story lines up end-to-end without word collisions.
- **ServiceOS receives a clean conceptual export.** When LaunchPath ports the harness, they get engine primitives (Process, Executor, Trust Tier) — and they choose their own surface vocabulary per vertical (NCP, lead-hub, bureau, exec). The split makes that boundary obvious.

### What becomes harder

- **Codebase rename surface.** `ai_agent`, "Agent Layer", "Agent Card" all touch real files. Mitigated by sequencing the rename as its own brief (not in this ADR).
- **Search/grep ambiguity during transition.** For some weeks, "agent" in the codebase will sometimes mean engine-Executor (legacy), sometimes ContentBlock surface label (new). Mitigated by aggressive doc/comment updates landing alongside the rename brief.
- **Dictionary diff is large.** Several entries split into two (surface + engine variant). The dictionary becomes the authoritative reference for the seam.
- **Drill-down design discipline required.** Designers must explicitly think "is this the default surface or a drill-down?" before choosing vocabulary. Without that discipline, engine words leak into default UI.

### New constraints

1. **No engine vocabulary in default workspace UI.** This is now a review-checklist item: any PR touching workspace UI that uses Process/Executor/Self/Trust Tier/Memory Scope in default-render copy is a defect.
2. **Inspect drill-downs must self-label.** A drill-down screen that shows engine words must announce itself as a drill-down (header, breadcrumb, or label) so the user knows they have stepped behind the curtain.
3. **Dictionary entries must declare layer.** Every dictionary entry now declares whether it is Surface, Engine, or Both (Work Item, Pathway are Both).

### Follow-up decisions

- **Brief: Rename `ai_agent` → `ai_executor` in engine code** (separate brief, separate ADR if needed)
- **Brief: Workspace nav refactor** — demote existing primary-nav pages where they expose engine vocabulary; promote Chat as front door
- **Brief 247 reshape** — re-thread surface vocabulary into First Loop spine
- **Brief 268 reshape** — onboarding exit becomes *"first Pathway chosen, Alex is now doing X for you"* not *"first process scaffold"*
- **`docs/architecture.md` amendment** — "What the Workspace User Sees" section with the Surface/Engine table
- **`docs/dictionary.md` revisions** — split conflated entries, add surface aliases
- **Decided here (not open):** The engine keeps `Self` as the class/orchestrator name. The per-workspace persona (Alex or Mira) is a **configuration of Self** — a name, a voice, a tone — not a rename of the primitive. Workspace UI never shows the word "Self"; it always shows the configured persona name. This is final; the architecture amendment ratifies, it does not re-decide.
