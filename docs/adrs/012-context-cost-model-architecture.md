# ADR-012: Context Engineering, Model Routing, and Cost Optimisation Architecture

**Date:** 2026-03-20
**Status:** accepted

## Context

Research into context management and token efficiency (`docs/research/context-and-token-efficiency.md`) examined 30+ sources across agent frameworks, memory systems, and LLM APIs. Combined with human feedback during the research session, four design insights emerged that form a coherent package:

- **Insight-033:** Different processes need fundamentally different context profiles (invoice extraction ≠ relationship nurturing). The process should declare its context shape.
- **Insight-034:** Context assembly logic currently lives partly in the harness (`memory-assembly.ts`) and partly in the adapter (`claude.ts`). This couples context decisions to Claude's API format and would force duplication for other models.
- **Insight-035:** Different process steps have different computational needs. Routing all steps through the same model either wastes money on simple tasks or underperforms on complex ones. Every major framework (Mastra, CrewAI, Inngest AgentKit, OpenAI Agents SDK) supports per-step model selection.
- **Insight-036:** Users don't think in terms of models, context budgets, or caching strategies. They think: "How important is this? How much am I willing to spend? How much of my time am I willing to give?" The system should optimise within those human-level constraints.

These insights intersect with existing decisions:
- **ADR-003** (Memory Architecture): Already defines two-scope memory model and assembly function. This ADR extends that with budget allocation and salience scoring.
- **ADR-007** (Trust Earning): Already defines trust tier transitions. This ADR extends the trust-evaluator's mandate to include model tier recommendations and cost tracking.
- **ADR-011** (Attention Model): Already defines oversight form. This ADR adds cost as a dimension that influences the attention-cost-quality tradeoff.

The architecture spec already defines the adapter pattern (`invoke()`, `status()`, `cancel()`) and the agent harness assembly function. Both are amended by this ADR.

## Decision

### 1. Process definitions declare a context profile

The process definition structure (L1) gains an optional `context` section:

```
Process: [Name]
├── ...existing fields...
├── Context:
│   ├── Memory: [high | medium | low]     (default: medium)
│   ├── Tools: [high | medium | low]      (default: medium)
│   └── History: [high | medium | low]    (default: low)
├── Budget:
│   ├── Monthly: [amount or unlimited]
│   └── Per-outcome: [amount or unlimited]  (tracked, not enforced initially)
└── ...existing fields...
```

**Semantic hints, not percentages.** The harness interprets hints into budget allocation using defaults:

| Hint | Memory budget | Tool budget | History budget |
|------|--------------|-------------|---------------|
| high | 25-35% | 20-30% | 15-25% |
| medium | 15-20% | 10-20% | 10-15% |
| low | 5-10% | 5-10% | 5% |

Remaining budget goes to identity + task content (always allocated first as the stable prefix).

**Why semantic hints:** Specific percentages are fragile and model-dependent. A "high memory" hint means "this process benefits from deep memory" regardless of whether the context window is 8K or 200K. The harness resolves hints to actual token budgets based on the model's context window.

**Per-step override:** Individual steps can override the process-level context profile if needed (e.g., a planning step within an invoice process might need `memory: high` even if the process default is `low`).

### 2. Context assembly moves fully into the harness

The harness pipeline gains responsibility for assembling a **structured context object** — model-agnostic, ordered for cache efficiency, budget-aware.

**The context object:**

The context object is split into two parts: what the **adapter receives** (prompt content) and what the **harness uses internally** (budget, routing). This keeps harness logic out of adapters.

```typescript
// What the adapter receives — prompt content only
interface AdapterContext {
  // STABLE PREFIX (cacheable)
  identity: { role: string; systemPrompt: string; personality?: string };
  processDefinition: { name: string; description: string; qualityCriteria: string[] };
  stepInstructions: { stepName: string; description: string; expectedOutput: string };
  tools?: ToolDefinition[];

  // SEMI-STABLE (cacheable between feedback events)
  memories: { content: string; type: string; confidence: number }[];

  // VARIABLE (per-invocation)
  taskContent: { inputs: Record<string, unknown>; priorStepOutputs?: string[] };
  conversationHistory?: Message[];

  // CACHE HINT (adapter uses to place cache breakpoints)
  // Number of content sections in stable prefix (e.g., 4 = identity + processDef + stepInstructions + tools)
  // The adapter knows its own serialisation — it places cache breakpoints after these sections
  stableSectionCount: number;
}

// What the harness uses internally — not passed to adapter
interface InvocationPlan {
  context: AdapterContext;
  resolvedModel: { adapter: string; modelId: string };  // already resolved from tier
  budgetRemaining: { tokens?: number; dollars?: number };
  securityFlags: { sensitiveMemoriesPresent: boolean; thirdPartyAdapter: boolean };
}
```

**The adapter interface changes** from the current pattern where the adapter builds the system prompt to receiving the context object:

```typescript
// Current (adapter builds prompt):
invoke(config: { role: string; step: StepDefinition; inputs: Record<string, unknown> }): Promise<string>

// New (harness builds context, adapter translates):
invoke(context: AdapterContext, modelId: string): Promise<AdapterResult>
```

The adapter receives content + a resolved model ID. It does not see budget, tier, or routing logic. The harness handles model resolution and budget enforcement before calling the adapter.

Each adapter maps the context object to its model's API format:
- **Claude adapter:** Maps to `system` + `messages` + `tools` + `cache_control` breakpoints
- **OpenAI adapter:** Maps to `system` + `messages` + `functions` (automatic prefix caching)
- **Script adapter:** Ignores identity/memory/tools, uses only `taskContent`

**Why this separation matters:** Context decisions (what to include, how to budget, how to order) are process-specific and model-agnostic. Format decisions (how to encode for the API) are model-specific. Mixing them couples Agent OS to Claude.

**Prompt caching** is an adapter-level optimisation. The harness provides `cacheHints.stablePrefixEnd` — the adapter uses this to place `cache_control` breakpoints (Anthropic) or structure prefixes for automatic caching (OpenAI/Google). The harness doesn't know about caching mechanics; the adapter doesn't decide what content to include.

### 3. Steps declare model tier, harness resolves to model + adapter

Process steps gain an optional `model_tier` field:

```yaml
steps:
  - name: classify-invoice
    executor: ai-agent
    model_tier: fast          # Haiku-class
  - name: extract-line-items
    executor: ai-agent
    model_tier: fast          # Haiku-class
  - name: validate-against-po
    executor: script          # No LLM
  - name: draft-exception-report
    executor: ai-agent
    model_tier: reasoning     # Opus-class (needs judgment)
```

**Three tiers** (not model names):

| Tier | Characteristics | Current mapping | Purpose |
|------|----------------|----------------|---------|
| `fast` | Cheap, fast, good for structured/narrow tasks | Claude Haiku | Classification, extraction, validation, formatting |
| `balanced` | Good reasoning + speed balance | Claude Sonnet | Standard generation, code, analysis |
| `reasoning` | Deep reasoning, catches edge cases | Claude Opus | Complex judgment, orchestration, novel problems |

**Default:** If no `model_tier` is specified, the step inherits the process-level default. If no process-level default, `balanced` is used.

**Resolution:** The harness resolves `model_tier` to a specific model and adapter using a configuration map:

```typescript
// Platform configuration (not per-process)
const modelMap = {
  fast: { adapter: 'claude', model: 'claude-haiku-4-5-20251001' },
  balanced: { adapter: 'claude', model: 'claude-sonnet-4-6' },
  reasoning: { adapter: 'claude', model: 'claude-opus-4-6' },
};
```

This indirection means: (a) model names change without updating process definitions, (b) swapping providers requires one config change, (c) model tiers are meaningful to non-technical users.

**Trust-modulated model routing (Original to Agent OS):** The trust-evaluator can recommend model tier downgrades when data supports it. If a step running on `reasoning` tier achieves consistent quality (low correction rate, high approval rate over N runs), the system suggests downgrading to `balanced`. Human approves. If quality degrades after downgrade, auto-revert to previous tier (same mechanism as trust tier downgrades in ADR-007).

### 4. Cost-per-outcome is the fourth feedback signal

Layer 5 currently tracks three feedback signals: output quality, process efficiency, outcome impact. This ADR adds a fourth:

**4. Cost efficiency** — Is the process getting cheaper per outcome while maintaining quality?
- Measured by: tokens consumed per run, model cost per run, cost per outcome over time
- Example: "Invoice reconciliation costs $0.12/invoice, down from $0.45 three months ago"

**Cost tracking fields** added to existing tables:

```
stepRuns (existing table, new fields):
├── inputTokens: integer
├── outputTokens: integer
├── cacheReadTokens: integer
├── cacheWriteTokens: integer
├── modelId: text
├── estimatedCostCents: integer
```

The adapter reports token usage via the `AdapterResult`. The harness records it on the `stepRuns` table. Cost per outcome is computed by summing `estimatedCostCents` across all steps in a process run.

### 5. Budget-as-goal extends budget-as-limit

The architecture currently defines budget as a spending limit (Paperclip pattern: soft alert at 80%, hard stop at 100%). This ADR adds a second dimension:

| Model | What it does | When it fires |
|-------|-------------|---------------|
| **Budget-as-limit** (existing) | Prevents runaway spend | Per-agent, per-process monthly ceiling |
| **Budget-as-goal** (new) | Drives cost optimisation | Per-process, tracked by improvement-scanner |

Budget-as-goal means: the improvement-scanner (Phase 9) uses cost-per-outcome alongside quality signals to propose efficiency improvements. "This process maintains 98% approval rate on Haiku — suggest model downgrade from balanced to fast."

**The user interface to cost:** The Trust Control primitive (Primitive 11) extends to show cost trajectory alongside trust trajectory. The Daily Brief includes cost trends. The user never sees "model tier" or "context budget" — they see the outcome-budget-attention triangle:
- "How important is this process?" → maps to quality criteria and review pattern
- "How much am I willing to spend?" → maps to budget-as-limit and informs model tier selection
- "How much of my time should this take?" → maps to trust tier (supervised vs autonomous)

The system optimises model selection, context depth, and review pattern within these constraints.

### 6. Trust-evaluator's mandate extends to cost

Rather than adding an 11th system agent, the trust-evaluator's mandate extends from trust tier recommendations to **trust + model tier + cost recommendations**. All three are "earned through data" signals that follow the same pattern: track metrics over a window, check eligibility conditions, propose changes, human approves.

| Signal | What trust-evaluator already does | What it now also does |
|--------|----------------------------------|----------------------|
| Trust tier | Recommends upgrades/downgrades based on approval/correction rates | No change |
| Model tier | — | Recommends downgrades when quality data supports cheaper model |
| Cost trend | — | Surfaces cost-per-outcome trajectory in trust state |

This keeps the system agent count at ten (ADR-008) and avoids creating a new agent whose signal source (quality + cost data) overlaps with the trust-evaluator's.

### 7. Memory salience scoring replaces simple sort

ADR-003 already planned this for Phase 3: "Phase 3 refines to `confidence * log(reinforcementCount + 1)` with recency decay." The research validates this formula from an independent source (memU's salience scoring). This ADR confirms the formula and adds lost-in-the-middle mitigation:

**Scoring formula:**
```
salience = confidence × log(reinforcementCount + 1) × recencyDecay(halfLifeDays=30)
```

**Context ordering for attention:**
1. Identity + current task instruction (beginning — high attention zone)
2. Quality criteria for this step
3. Top-ranked memories (by salience)
4. Process definition (reference)
5. Tool schemas
6. Task content + inputs
7. Specific instruction anchor (end — high attention zone)

Critical information goes at beginning AND end. Reference material goes in the middle. This mitigates the lost-in-the-middle effect (30%+ accuracy drop for middle content, Stanford NLP research).

## Provenance

| What | Source | What we took | What we changed |
|------|--------|-------------|----------------|
| Stable prefix + variable suffix | Claude Code, Google ADK, Anthropic prompt caching | Content ordering for cache efficiency | Applied to process-specific context assembly |
| Structured context object | Open SWE `get_agent()`, Letta `compile()` | Single assembly function producing structured output | Made model-agnostic; adapter translates instead of assembles |
| Model tier abstraction | Mastra Model Router, Inngest AgentKit per-agent model | Named tiers that resolve to specific models | Three semantic tiers instead of explicit model names; trust-modulated routing |
| Context budget allocation | Letta `get_context_window()` proportional model | Explicit allocation by component | Process-declared semantic hints instead of fixed percentages |
| Memory salience scoring | memU `src/memu/app/retrieve.py` salience formula | `similarity × log(reinforcement+1) × recency_decay` | Dropped similarity (no vectors at dogfood scale); kept reinforcement + recency |
| Lost-in-the-middle mitigation | Stanford NLP (Liu et al., 2023) | Strategic content ordering | Applied to harness assembly pipeline |
| Cost-based model routing | RouteLLM (lm-sys), xRouter | Cascade from cheap to expensive model | Process-declared tiers instead of runtime classification |
| Per-step model selection | CrewAI, Mastra, Inngest AgentKit | Different models per agent/step | Same pattern, applied within process definitions |
| Budget enforcement | Paperclip `server/src/services/budgets.ts` | Per-agent budget with soft/hard stops | Added budget-as-goal alongside budget-as-limit |
| Token usage tracking | Paperclip CostEvent model | Structured cost reporting from adapters | Extended with cache token tracking (Anthropic-specific fields) |
| **Trust-modulated model routing** | **Original** — no existing system | — | Trust data drives model tier recommendations (same mechanism as trust tier) |
| **Process-declared context shape** | **Original** — no existing system | — | Process definition declares context profile with semantic hints |
| **Budget-as-goal for meta-processes** | **Original** — no existing system | — | Budget is a target for improvement, not just a ceiling |
| **Outcome-budget-attention triangle** | **Original** — CPC analogy from human feedback | — | User sets importance + budget + attention; system optimises the rest |

## Build Phasing

These changes span multiple roadmap phases. Each is independently valuable:

| Phase | What to add | Dependencies |
|-------|-------------|-------------|
| **Phase 4** (Workspace Foundation) | Context profile in process YAML schema. `modelTier` field on steps (defaults to `balanced`, all resolve to Claude for now). Cost tracking fields on `stepRuns`. Structured context object + adapter interface refactor. Salience scoring in memory assembly. Context ordering for lost-in-the-middle. | None — enhances existing Phase 4 work |
| **Phase 5** (Work Evolution) | Cost-per-outcome computation from `stepRuns` data. Budget-as-limit on processes (existing Paperclip pattern). | Phase 4 cost fields |
| **Phase 6** (Integrations) | Second adapter (OpenAI or open-source). Model map configuration. Deferred tool loading for integration tools. | Phase 4 context object + adapter interface |
| **Phase 8** (Learning) | Trust-evaluator extended with model tier recommendations. Budget-as-goal signal for improvement-scanner. | Phase 4 cost fields, Phase 5 cost-per-outcome |
| **Phase 9** (Self-Improvement) | Improvement-scanner uses cost-per-outcome as signal. Proposes model tier downgrades with evidence. | Phase 8 trust-evaluator extension |
| **Phase 10** (Web Dashboard) | Trust Control shows cost trajectory. Daily Brief shows cost trends. Explore mode surfaces cost estimates during process setup. | Phase 8+ cost data |

## Architecture Spec Amendments

### L1 Process Layer

Process definition structure gains `Context` and `Budget` sections (see Decision 1). Steps gain optional `model_tier` field (see Decision 3).

### L2 Agent Layer

**Adapter pattern** amended: Three core methods remain (`invoke()`, `status()`, `cancel()`), but `invoke()` receives a structured `AgentContext` object instead of raw configuration. The adapter translates this to the model's API format.

**Agent harness** amended: Assembly function now produces an `AgentContext` object (not a prompt string). The `Budget` field in the agent harness model includes cost-per-invocation tracking with token-level granularity (input, output, cache read, cache write).

**Budget controls** amended: "Per-agent, per-process cost tracking with soft alerts (80%) and hard stops (100%)" becomes "Per-agent, per-process cost tracking with soft alerts (80%), hard stops (100%), and cost-per-outcome as a goal signal for the learning layer."

### L3 Harness Layer

**Memory assembly** amended: Salience scoring replaces simple sort (see Decision 7). Context ordering follows the lost-in-the-middle-aware sequence.

**Agent harness assembly** function amended: The single assembly function now reads the process's context profile to determine budget allocation per component. It produces a structured `AgentContext` with cache hints.

### L5 Learning Layer

**Four feedback signals** (was three):
1. Output quality
2. Process efficiency
3. Outcome impact
4. **Cost efficiency** — cost-per-outcome over time (new)

**Trust-evaluator** mandate extended to include model tier recommendations (see Decision 6).

### L6 Human Layer

**Trust Control** (Primitive 11) extended to show cost trajectory alongside trust trajectory.

**Daily Brief** (Primitive 1) extended to include cost trends.

## Consequences

- **Easier:** Adding a new model provider requires only a new adapter + model map entry. No context logic changes.
- **Easier:** Process authors can express "this step needs deep reasoning" without knowing model names. Model names change without updating process definitions.
- **Easier:** Cost optimisation compounds automatically — trust + model routing + context + caching all improve together over time.
- **Easier:** Users understand the tradeoff (importance, budget, attention) without understanding the underlying complexity.
- **Harder:** The adapter interface is a breaking change — existing `claude.ts` must be refactored. Schedule for Phase 4 where the CLI is being rewritten anyway.
- **Harder:** Cost tracking adds fields to `stepRuns` and computation logic. But token usage is already returned by every API call — it's just not stored.
- **New constraint:** Model tier abstraction means Agent OS can't expose model-specific features (e.g., Claude's extended thinking) through the tier system. Model-specific capabilities should be adapter-level features, not tier-level.
- **New constraint:** Trust-modulated model routing requires sufficient run history before making recommendations. Grace period logic from ADR-007 applies.
- **New constraint (security):** When routing to a third-party adapter (Phase 6+), the `AdapterContext` may carry sensitive business data in memories or task inputs. The harness must sanitise or redact sensitive content before passing to non-trusted adapters. The `InvocationPlan.securityFlags` field supports this: when `thirdPartyAdapter=true` AND `sensitiveMemoriesPresent=true`, the harness should strip memory content or apply redaction rules. This extends the brokered credentials pattern (architecture.md cross-cutting integrations) from credentials to content. Detailed redaction rules deferred to Phase 6.
- **New constraint (context overflow):** When a process's declared context profile (`memory: high`, `tools: high`, `history: high`) exceeds the model's context window — especially on a `fast` tier model with a smaller window — the harness must clamp allocations proportionally. Hints sum to priorities, not hard percentages. The harness allocates identity + task content first (non-negotiable), then distributes remaining budget according to hint priorities. If the window is too small for meaningful allocation, the harness should surface a warning ("this process needs a larger model for its context requirements") rather than silently truncating.
- **Follow-up:** Phase 4 briefs (011-014) should be reviewed for impact. The adapter interface change affects Brief 012 (Phase 4a). Context profile and model tier affect the process YAML schema.
- **Follow-up:** Insight-003 (learning overhead as a dial) should be updated to reference this ADR as the concrete implementation of the "multiple dials" concept.
- **Follow-up (Phase 6):** Deferred tool loading interacts with tool budget allocation — if tools are loaded lazily (on-demand from integration registry), the tool budget at assembly time is a maximum allocation, not a pre-computed total. The harness reserves the budget; the adapter loads tools within it.
