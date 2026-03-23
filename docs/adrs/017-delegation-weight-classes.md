# ADR-017: Delegation Weight Classes

**Date:** 2026-03-23
**Status:** accepted

## Context

### The problem

The Conversational Self (ADR-016) delegates to dev pipeline roles via structured tool_use. Currently, every delegation spawns a `cli-agent` step — a `claude -p` subprocess that boots a full Claude Code session, reads CLAUDE.md, loads file system tools, reads project docs, reasons, and produces output. This takes 5-10+ minutes.

Live testing (Insight-061) revealed this creates a broken user experience. When the creator asked "what should we work on next?" and the Self delegated to the PM role, the response took 5+ minutes. The bot was also blocked from processing new messages during this time (fixed separately with async handling, but the latency remained). A competent teammate who takes 5 minutes to answer a triage question doesn't feel competent.

### The deeper issue: Claude vs Claude Code

The critical distinction is between **Claude** (the conversational LLM) and **Claude Code** (the agentic coding tool):

| | Claude | Claude Code |
|---|---|---|
| **What it is** | Conversational LLM model | Agentic coding tool built on Claude |
| **Capabilities** | Responds to prompts with reasoning | Reads/edits files, runs terminal commands, uses tools, scans projects |
| **Access** | API (`createCompletion()`), claude.ai, `claude` CLI | `claude -p` subprocess (Claude Code CLI) |
| **Speed** | Fast (~10-30s) | Slow (~5-10min — boots project context, loads tools, scans files) |
| **Cost** | Per-token (API) or subscription (claude.ai / CLI) | Subscription-included |

**OpenClaw talks to Claude. We've been talking to Claude Code for everything.**

OpenClaw uses Claude (the conversational model) via subscription access and experiences no latency issues. It manages its own context (SOUL.md, MEMORY.md, skills) and sends it to Claude, getting fast responses. It never spawns Claude Code.

Our `cli-agent` executor spawns Claude Code (`claude -p`) for every delegation — even for PM triage that just needs conversational reasoning. Claude Code is designed for agentic coding sessions: it loads CLAUDE.md, scans the project, initializes file system tools, builds project understanding. This 5-10 minute overhead is valuable when writing code but wasteful when answering "what should we work on next?"

### Two execution paths already exist

The architecture already has both paths:

1. **`ai-agent`** — talks to **Claude** via `createCompletion()` (Claude adapter, `src/adapters/claude.ts`). Conditionally includes read-only codebase tools only when step inputs declare `type: "repository"`. Fast (~10-30s). Full harness governance.

2. **`cli-agent`** — talks to **Claude Code** via `claude -p` subprocess (CLI adapter, `src/adapters/cli.ts`). Full agentic capabilities. Slow (~5-10min). Full harness governance.

The `ai-agent` executor is the right tool for conversational roles. The infrastructure exists — it's just not being used because the standalone role YAMLs were all written with `executor: cli-agent`.

### Access modes: API is not the only option

The ADR should not assume API-only for the Light path. Claude is accessible via:

1. **Anthropic API** — per-token cost, model-flexible (`llm.ts` abstraction)
2. **Claude CLI** (`claude` without Code features) — subscription-included, fast
3. **Claude Code CLI** (`claude -p` with Code features) — subscription-included, slow

The `ai-agent` executor currently uses option 1 (API via `createCompletion()`). Future work could add option 2 (subscription CLI for Claude-the-model) as a provider in `llm.ts`, giving users the speed of Claude without the per-token cost. This is how OpenClaw operates — subscription access to Claude, not API.

### Forces

1. **The Self must feel fast for conversational interactions.** PM triage, research questions, architecture discussion — these should take 10-30 seconds, not 5-10 minutes. The user's mental model is "talking to a teammate," not "waiting for a build."

2. **Codebase access is genuinely needed for some roles.** Builder writing code, Reviewer verifying against files — these need Claude Code's file system tools. Forcing these through a simple API call would lose critical capabilities.

3. **Governance must not depend on execution speed.** Fast delegation must still go through the harness — trust gates, memory assembly, review patterns, feedback recording. The harness is the product; execution speed is an implementation detail.

4. **Non-dev processes need fast execution.** The email summary process being defined is entirely conversational — there's no codebase to access. If all LLM process steps go through `claude -p`, every non-dev process will feel broken.

5. **The Self should handle some interactions inline.** When the user says "good morning" or "what's the status?", the Self doesn't need to delegate at all. It already has work state in its context. Not everything is a process run.

### Three levels of execution

| Level | What | When | Speed | Harness? |
|-------|------|------|-------|----------|
| **Inline** | The Self reasons directly | Greetings, status, clarification, consultative framing | ~5-10s | No — the Self IS the conversation, not a process |
| **Light** | API-direct LLM call | PM triage, research synthesis, process definition, email summarization | ~10-30s | Yes — full harness (trust, memory, feedback, review) |
| **Heavy** | Claude Code subprocess | Code building, code reviewing, file-system-dependent analysis | ~5-10min | Yes — full harness |

The Self currently handles Inline correctly (after the delegation guidance fix). Heavy is working but being applied to everything. Light is the missing layer — and the infrastructure (`ai-agent` executor) already exists.

## Decision

### 1. Three execution levels, resolved at runtime

The key design principle (informed by OpenClaw's execution mode pattern): **process definitions declare capabilities needed, not the execution mode.** The execution mode is resolved at runtime — by system defaults, user preference, or the Self's judgment.

| Level | When | Speed | Harness? | Mode |
|-------|------|-------|----------|------|
| **Inline** | The Self reasons directly (greetings, status, framing) | ~5-10s | No | The Self's own LLM call |
| **Light** | Reasoning tasks (triage, synthesis, process definition) | ~10-30s | Yes | API-direct via `createCompletion()` |
| **Heavy** | Codebase tasks (build code, review files, edit docs) | ~5-10min | Yes | Claude Code via `claude -p` |

The execution mode is NOT hardcoded in the process definition's `executor` field. Instead:

- Process steps declare **what they need** (codebase access, file editing, terminal)
- A new `execution_mode` resolution determines HOW the step runs
- The default mode is inferred from capabilities: steps needing codebase → Heavy, otherwise → Light
- The user or Self can override: "use Claude Code for this PM triage because I need it to check the actual files"

### 2. Execution mode as a runtime resolution

```
Process Step Definition
    └── declares: needs_codebase: true/false
    └── declares: executor: ai-agent | cli-agent | script | human | integration

Execution Mode Resolution (runtime)
    ├── System default: ai-agent without codebase → Light (Claude via API/subscription)
    │                   ai-agent with codebase → Light (Claude + read-only tools)
    │                   cli-agent → Heavy (Claude Code subprocess)
    ├── User preference: "always use Claude Code" → override to Heavy
    ├── Self judgment: "this needs file access" → escalate to Heavy
    └── Config: DEFAULT_EXECUTION_MODE env var

```

**MVP scope:** Only system-default resolution is implemented. The system infers the mode from the step's declared executor and capability needs. User preference overrides and Self judgment escalation are follow-up work — they add UX polish but aren't required to prove the concept.

**Future: Model routing** is an orthogonal concern (which LLM, not how it runs). Process steps could declare a preferred model; `llm.ts` resolves model IDs to providers. Example: Light + Codex for coding reasoning, Light + Claude for conversation. This belongs in a future extension of ADR-012 (LLM abstraction), not in this ADR.

> **Post-implementation note (Brief 033, 2026-03-23):** Now implemented. `config.model_hint` (`fast`/`capable`/`default`) on process steps, resolved by `resolveModel()` in `src/engine/model-routing.ts`. See ADR-012 post-implementation note for details.

This mirrors OpenClaw's model where users choose between Claude, Claude Code, or API — but Ditto adds intelligent defaulting. The system picks the fastest mode that satisfies the step's declared capabilities, and the user can override.

### 3. Standalone role processes updated with smart defaults

The 7 standalone delegation processes (Brief 029) are updated to declare capabilities, not execution modes:

| Role | Default mode | Tools | Rationale |
|------|-------------|-------|-----------|
| PM | Light | read-only | Reasoning about priorities from context already loaded |
| Researcher | Light | read-only | Synthesizing information. Context passed in task description |
| Designer | Light | read-only | UX reasoning from context |
| Architect | Light | read-write | Structural reasoning; writes briefs, ADRs, insights |
| Builder | Light | read-write | Writes code files via `write_file` tool |
| Reviewer | Light | read-only | Reads code, produces review report in conversation |
| Documenter | Light | read-write | Writes state.md, roadmap.md, changelog |

**Post Brief 031 (implemented 2026-03-23):** All 7 roles now use `executor: ai-agent` with Ditto's own tools (read_file, search_files, list_files, write_file). The Light/Heavy distinction collapsed — all roles are Light, differentiated only by tool subset (read-only vs read-write), not executor type. `cli-agent` remains available as an optional fallback for tasks requiring full Claude Code capabilities (terminal access, project scanning), but no role defaults to it. The table above reflects the original design intent; the implementation simplified to a single execution tier with tool-based differentiation. This is the better outcome — the harness provides governance regardless of executor.

The user can override any role to Heavy ("use Claude Code for this architect session — I need it to read the codebase"). The Self can escalate to Heavy if the task description suggests codebase access is needed.

**Memory assembly is unchanged.** The harness pipeline runs for both Light and Heavy paths. The memory-assembly handler loads agent-scoped and process-scoped memories before the step executor runs, regardless of which adapter executes the step. A Light PM delegation gets PM agent memories and dev-pm-standalone process memories exactly as it would via `cli-agent`. The execution mode is transparent to the harness.

### 4. Cost model: three access tiers

| Access | Cost | Speed | What it talks to |
|--------|------|-------|-----------------|
| **API** | Per-token (~$0.03-0.10/call) | ~10-30s | Claude (model) |
| **Claude CLI** | Subscription-included | ~10-30s | Claude (model) |
| **Claude Code CLI** | Subscription-included | ~5-10min | Claude Code (agentic tool) |

Today, `ai-agent` uses the API tier and `cli-agent` uses the Claude Code CLI tier. The missing tier is **Claude CLI subscription access** — fast like the API, subscription-included like Claude Code. This is how OpenClaw operates.

The `llm.ts` provider abstraction is the right place to add Claude CLI subscription access. A subscription provider in `llm.ts` would give Light execution at subscription cost — the best of both worlds. This is a follow-up to this ADR, not a prerequisite.

The architecture supports all three tiers without structural changes. Process definitions declare capabilities. The execution mode resolution picks the tier. The user can override.

### 5. Role contracts loaded into ai-agent system prompts

The Claude adapter currently uses short, hardcoded role prompts (e.g., the `pm` role prompt is 5 lines). For delegated roles, the full role contracts from `.claude/commands/dev-*.md` should be available.

The approach: process step definitions can include a `role_contract` config field pointing to the contract file. The Claude adapter loads this file and appends it to the system prompt. This reuses the existing adapter infrastructure without creating a new execution path.

### 6. The Self handles inline interactions without delegation

Already working (delegation guidance in the system prompt). The Self's cognitive framework includes the consultative framing protocol, trade-off heuristics, and work state — sufficient for greetings, status questions, clarification, and goal framing. No architectural change needed; this decision ratifies the current behavior.

## Provenance

| Pattern | Source | What we took | What we changed |
|---------|--------|-------------|-----------------|
| User-selectable execution mode | OpenClaw (openclaw.ai) | Users choose between Claude, Claude Code, or API for execution | Applied: system defaults to fastest mode for the task, user can override. Added intelligent defaulting (OpenClaw is manual choice only) |
| Conditional tool inclusion | Claude adapter (existing, Ditto) | `stepNeedsTools()` checks input types, excludes tools when unnecessary | Applied to delegation processes — light roles remove repository inputs |
| Script handler for LLM calls | Insight-044 (system agents) | System agents use `script` + handler even when handler calls LLM | Extended principle: executor type is a dispatch hint, not a capability declaration |
| Two-tier agent execution | Anthropic multi-agent (orchestrator-workers) | Orchestrator is lightweight; workers do heavy lifting | Applied: Self is orchestrator (inline), light roles are Claude-direct workers, heavy roles are Claude Code workers |
| Adaptive scaffolding depth | ADR-014, Prompting Inversion (Bernstein 2025) | Match scaffolding to task complexity | Applied at execution level: simple reasoning → Claude, complex codebase → Claude Code |

## Consequences

### What becomes easier

- **Conversational delegation is fast.** PM triage, research framing, process definition — 10-30 seconds instead of 5-10 minutes. The Self feels like a competent teammate for conversational interactions.
- **Non-dev processes are viable.** Email summarization, content review, invoice follow-up — processes that don't need codebase access run at API speed. This unblocks non-dev use cases.
- **Cost reduction.** Light delegation costs one API call. Heavy delegation costs a full Claude Code session. Most delegations become light.

### What becomes harder

- **Role contract management.** Light roles need their full context passed as LLM prompt input, not loaded from the filesystem by Claude Code. The role contract must fit within the token budget alongside the task description and harness memories.
- **Codebase-dependent reasoning.** A PM who wants to check `docs/state.md` can't read it via `ai-agent` without codebase tools. The task description must include all relevant context, or the process definition must use `cli-agent` for that specific step.

### What new constraints this introduces

- Process definitions must consciously choose their executor type. The choice has real UX and cost implications.
- Light roles can't access files during execution. All context must be provided upfront (in the task input or via harness memory assembly).
- The Claude adapter's hardcoded role prompts may diverge from the `.claude/commands/dev-*.md` role contracts. A mechanism to keep them aligned (or replace the hardcoded prompts with loaded contracts) is needed.

### Follow-up decisions needed

- **Brief for implementation:** Update 5 standalone YAMLs (PM, Researcher, Designer, Architect → `ai-agent`; remove codebase inputs), enhance Claude adapter role prompt loading, update Self delegation UX callbacks.
- **Role contract loading mechanism:** Decide between config-based file loading vs enriching the YAML `description` field. Brief should resolve this.
- **Context passing for light roles:** Light roles can't read files at runtime. The preferred approach: the Self pre-loads relevant context (work state summary, recent activity, key doc excerpts) and includes it in the task description. The Self already assembles work state via `loadWorkStateSummary()` — this same data feeds the delegation prompt. For cases where the PM genuinely needs to read specific files (e.g., a full brief), the Self can escalate to Heavy, or the task description can include the file contents. The implementation brief must specify the concrete pattern.
- **Claude subscription provider in `llm.ts`:** Add `claude` CLI (non-Code) as a provider alongside the Anthropic API. This would give Light execution at subscription cost — matching OpenClaw's access model.
- **Model-agnostic heavy execution:** The `cli-agent` executor is Claude Code-specific. To use Codex or other models for codebase work, `ai-agent` would need enhanced tools (write_file, run_command). This is a separate design decision — it means building our own agentic coding layer rather than depending on Claude Code. Separate ADR.
- **Model routing per process/step:** ~~Orthogonal to this ADR. Extend ADR-012 to add optional `model` field to process and step definitions.~~ **Done (Brief 033).** `config.model_hint` on process steps, resolved by `resolveModel()`. See ADR-012 post-implementation note.
