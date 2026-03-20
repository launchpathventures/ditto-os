# Research: Context Management and Token Efficiency for Agent Harnesses

**Date:** 2026-03-20
**Researcher:** Dev Researcher (Claude Code)
**Status:** active
**Research question:** How do we manage context and token usage efficiently whilst achieving persistent, evolving memory? How do we ensure process agent harnesses always have the exact context they need without burning tokens?

---

## Why This Matters for Agent OS

Agent OS's architecture defines a nested harness model (Platform → Process → Agent → Runtime). Every agent invocation assembles context from multiple sources: agent identity, process definition, agent-scoped memory, process-scoped memory, tool schemas, task inputs, and conversation history. This context assembly is the single largest driver of token cost and quality — too little context produces poor outputs; too much burns tokens on irrelevance and degrades performance (lost-in-the-middle effect).

The architecture already specifies memory assembly at invocation time (ADR-003) and progressive disclosure (Insight-003). This research extends that foundation with implementation-level patterns from production systems.

---

## Sources Examined

| Source | Type | Why included |
|--------|------|-------------|
| Mastra (`mastra-ai/mastra`) | Agent framework | Multi-source tool gathering, lazy tool loading, skill progressive disclosure |
| Claude Agent SDK | Agent SDK | System prompt composition, hierarchical CLAUDE.md loading, deferred tool loading |
| Letta/MemGPT (`letta-ai/letta`) | Agent framework | `compile()` memory rendering, context budgeting, recursive summarization |
| Open SWE (`langchain-ai/open-swe`) | Agent harness | `get_agent()` system prompt assembly, 13-section prompt |
| Anthropic API | API | Prompt caching mechanics, cache_control, cost savings |
| OpenAI API | API | Automatic prompt caching, prefix reuse |
| Google Gemini/ADK | API/Framework | Context caching, session/working context separation |
| Mem0 (`mem0ai/mem0`) | Memory framework | Scope filtering, hybrid retrieval, reconciliation, token efficiency |
| memU (`NevaMind-AI/memU`) | Memory framework | Salience scoring, recency decay, reinforcement |
| Graphiti (`getzep/graphiti`) | Knowledge graph | Temporal invalidation, hybrid retrieval, RRF |
| CrewAI | Agent framework | Unified memory with importance scoring, cost tracking |
| LangGraph | Orchestration | Checkpoint persistence, conversation trimming |
| Inngest AgentKit | Agent framework | History adapters, state-based routing |
| Paperclip | Agent platform | Multi-level budget enforcement, CostEvent reporting |
| Factory AI | Research | Context compression evaluation, compaction strategies |
| Claude Code | Dev tool | MEMORY.md pattern, deferred tool loading, 200-line cap |
| ACON framework | Research | Dynamic observation compression for long-horizon agents |
| AgeMem / Memory-R1 | Research | RL-based memory operation learning |

---

## 1. Context Assembly Patterns

### 1.1 The Assembly Pipeline

Every production agent system follows a similar assembly pipeline, though implementation varies:

```
System prompt (identity + role + rules)
  → Process context (current task definition + quality criteria)
    → Memory injection (learned patterns, corrections)
      → Tool schemas (available capabilities)
        → Task content (current inputs, conversation history)
          → [Send to LLM]
```

**Key implementations:**

| System | Assembly function | What it assembles | Source file |
|--------|------------------|-------------------|------------|
| **Letta** | `Memory.compile()` | XML memory blocks with metadata (chars_current, chars_limit), conditional line-numbering for Anthropic models | `letta/schemas/memory.py` |
| **Open SWE** | `get_agent()` | 9-step pipeline: extract config → create sandbox → clone repo → load AGENTS.md → assemble 13-section system prompt → configure model → bind 6 tools → inject 4 middleware → bind config | `agent/server.py` |
| **Mastra** | Dynamic resolution in `agent.ts` | 7 parallel tool sources: assigned, memory, workspace, skill, agent (sub-agents), runtime, client. Client tools override agent-provided ones | `packages/core/src/agent/agent.ts` |
| **Claude Agent SDK** | Hierarchical loading | Managed policy → ancestor CLAUDE.md → `.claude/rules/` (path-conditional) → user rules → auto memory from MEMORY.md | System prompt composition pipeline |
| **Agent OS (current)** | `memory-assembly.ts` handler | Agent-scoped + process-scoped memories, sorted by reinforcement/confidence, budget-truncated to char limit | `src/engine/harness-handlers/memory-assembly.ts` |

### 1.2 Letta's Context Budget Model

Letta provides the most explicit context window accounting:

```python
def get_context_window(self) -> ContextWindowOverview:
    return {
        system_prompt_tokens: X,
        core_memory_tokens: Y,          # Always-loaded memory blocks
        external_memory_summary_tokens: Z,  # Compressed older context
        summary_message_tokens: A,       # Summary of older messages
        in_context_message_tokens: B,    # Recent messages (full fidelity)
        function_definition_tokens: C,   # Tool schemas
    }
```

**File-based defaults by context window size:**

| Window size | Max files | Char limit | ~Tokens |
|-------------|-----------|------------|---------|
| ≤8K | 3 | 5,000 | ~3.75K |
| ≤32K | 5 | 15,000 | ~18.75K |
| ≤128K | 10 | 25,000 | ~62.5K |
| ≤200K | 10 | 40,000 | ~100K |
| >200K | 15 | 40,000 | ~150K |

**Overflow handling:** When context exceeds threshold, `summarize_messages_inplace()` recursively compresses older messages. Older messages have progressively less influence on the summary. Retries up to `max_summarizer_retries`. Evicted messages remain retrievable via API.

**Source:** `letta/schemas/memory.py`, `letta/agent.py`

### 1.3 Stable Prefix + Variable Suffix Architecture

A consistent pattern across Anthropic, Google ADK, and Claude Code:

```
┌─────────────────────────────────┐
│  STABLE PREFIX (rarely changes) │  ← Cacheable
│  - System instructions          │
│  - Agent identity/role          │
│  - Process definition           │
│  - Tool schemas                 │
│  - Long-lived memory            │
├─────────────────────────────────┤
│  VARIABLE SUFFIX (per-request)  │  ← Fresh each time
│  - Current task inputs          │
│  - Recent conversation          │
│  - Step-specific context        │
│  - Tool call results            │
└─────────────────────────────────┘
```

This architecture maximises prompt cache hits (see Section 3) and keeps per-request cost proportional to the variable portion only.

**Source:** Google ADK documentation, Anthropic prompt caching docs, Claude Code architecture (HuggingFace blog analysis)

---

## 2. Progressive Context Disclosure

### 2.1 The Problem with Eager Loading

Loading all context upfront creates three problems:
1. **Token waste** — most context is irrelevant to most steps
2. **Lost-in-the-middle degradation** — LLMs lose accuracy on content in the middle of long contexts (30%+ accuracy drop from position 1 to position 10 in a 20-document context, Stanford NLP research)
3. **Cache invalidation** — any change to upfront context invalidates the entire cache

### 2.2 Lazy Tool Loading

**Claude Agent SDK** implements deferred tool loading:
- Tools with >10K token descriptions get `defer_loading: true`
- Agent receives a `Tool Search` meta-tool instead
- Per query: 3-5 relevant tools (~3K tokens) loaded on demand
- **Result:** 85% reduction in tool schema token overhead

**Mastra** implements a similar pattern:
- `ToolSearchProcessor` provides two meta-tools: `search_tools` and `load_tool`
- Agent searches available tools by description, loads only what's needed
- Available skills listed in system message as an index; full instructions loaded on demand via `skill_load`
- Guideline: keep main SKILL.md under 500 lines; details in separate reference files

**Source:** Claude Agent SDK documentation, Mastra changelog 2026-03-13, Mastra skills documentation

### 2.3 On-Demand Memory Loading

**Claude Code** uses a two-tier pattern:
- `MEMORY.md` index (≤200 lines) always loaded — acts as a table of contents
- Topic files read on demand when the agent determines relevance
- **Result:** Memory context scales with relevance, not volume

**Mastra skills** follow the same pattern:
- Skill folder structure: `SKILL.md` (summary) + `references/` (details) + `scripts/` + `assets/`
- `skill_read` reads specific files from skill directories
- `skill_search` does BM25 or vector search across skill content
- Discovery mechanism: available skills listed as index; agents load what's relevant

### 2.4 Step-Specific Context Injection

For multi-step processes, the harness should inject only what the current step needs:

| Step type | Context needed | Context NOT needed |
|-----------|---------------|-------------------|
| Planning | Full process definition, goal ancestry, prior outcomes | Tool schemas, detailed memories |
| Execution | Step inputs, relevant memories, authorised tools | Other steps' definitions, planning rationale |
| Review | Original output, quality criteria, correction history | Tool schemas, execution details |
| Human step | Summary of what happened, what's needed, deadline | Agent memories, tool schemas |

**Existing pattern in Agent OS:** `stepNeedsTools()` in `src/adapters/claude.ts` already conditionally includes tools based on step input types (repository/document sources). This pattern should extend to memory and context.

**Source:** LangChain DeepAgents harness, AWS multi-agent orchestration patterns

---

## 3. Prompt Caching and Cost Optimisation

### 3.1 Anthropic Prompt Caching

**Mechanics:**
- Mark cache boundaries with `cache_control: { type: "ephemeral" }` on content blocks
- Cache order: tools → system → messages
- Maximum 4 cache breakpoints per request
- Minimum cacheable: 1,024-4,096 tokens (model-dependent)

**Cost structure:**

| Action | Cost relative to base |
|--------|----------------------|
| Cache write (5-min TTL) | 1.25× base input |
| Cache write (1-hour TTL) | 2× base input |
| Cache read | 0.1× base input (90% discount) |
| Uncached input | 1× base input |

**Break-even:** 2 API calls at Haiku pricing; 3rd call onward is pure savings. For agent harnesses that invoke the same process repeatedly, this is transformative.

**Multi-turn pattern:**
```
Request 1: [system + tools + user message]  → cache write
Request 2: [system + tools + prev exchange + new message] → cache READ on prefix, fresh on suffix
Request 3: [system + tools + prev exchanges + new message] → cache READ on growing prefix
```

**Performance:** 85% latency reduction on long prompts (100K-token document: 11.5s → 2.4s TTFT).

**Source:** Anthropic prompt caching documentation, `platform.claude.com/docs/en/build-with-claude/prompt-caching`

### 3.2 Architectural Pattern for Maximum Cache Hits

Claude Code achieves **92% prefix reuse** across all execution phases by layering content in cache-friendly order:

```
1. System prompt (stable)           ← CACHED
2. Tool definitions (stable)        ← CACHED
3. Process definition (stable)      ← CACHED
4. Memory blocks (semi-stable)      ← CACHED (if unchanged)
5. Conversation history (growing)   ← Partially cached (prefix)
6. Current user message (variable)  ← NOT cached
```

**Critical insight:** Anything that changes invalidates everything after it. So stable content goes first, variable content goes last.

**Anti-pattern:** Injecting timestamps, random IDs, or session metadata early in the prompt — this invalidates the entire cache.

**Source:** HuggingFace blog "Context Engineering & Reuse Pattern Under the Hood of Claude Code"

### 3.3 OpenAI Automatic Caching

- 50% discount on reused tokens (automatic, no code changes)
- Caches longest prefix that was previously computed
- Minimum 1,024 tokens, increments of 128 tokens
- 5-10 minute cache duration
- Real-world: 30-70% cost savings reported

### 3.4 Google Gemini Context Caching

- Separates "Session" (storage) from "Working Context" (view)
- 90% discount on cached tokens
- Explicit caching via `ContextCacheConfig` with `min_tokens`, `ttl_seconds`
- ADK naturally creates stable prefixes + variable suffixes

**Source:** Google ADK context caching documentation

---

## 4. Memory Decay and Relevance Scoring

### 4.1 Recency Decay Models

**Exponential decay with half-life (ACT-R cognitive model):**
```
recencyScore = exp(-decayRate × ageInHours)
decayRate = ln(2) / halfLifeHours
```

Used by memU with default 30-day half-life (some implementations use 7-day). High-salience memories decay more slowly.

**Temporal invalidation (Graphiti/Zep):**
- Old facts are invalidated (end timestamp set), not deleted
- New facts create new edges
- Preserves complete history for audit ("what was true at time T")
- LLM comparison identifies contradictions between new and existing edges

**Source:** memU `src/memu/app/retrieve.py`, Graphiti `graphiti_core/graphiti.py`

### 4.2 Multi-Signal Salience Scoring

**memU's formula:**
```
salience = similarity × log(reinforcement + 1) × recency_decay(half_life=30d)
```

**Generative Agents model (Stanford):**
```
score = recency + importance + relevance
```
Three independent signals, each normalised, summed. Recent actions, important objects, and situation-relevant objects all contribute.

**Mem0's pipeline:**
1. Scope filtering (narrow search space first)
2. Metadata filtering (custom key-value attributes)
3. Parallel dual search: BM25 (keyword) + vector (semantic)
4. Optional reranking (cross-encoder neural reranker)

**Graphiti's hybrid retrieval:**
1. Vector similarity on entity embeddings
2. BM25 on relationship triplet text
3. Graph traversal (BFS from known entities)
4. Reciprocal Rank Fusion to merge results

**Source:** memU documentation, Mem0 search documentation, Graphiti/Zep architecture

### 4.3 Reciprocal Rank Fusion (RRF)

When combining scores from different retrieval backends (BM25 unbounded scores vs cosine similarity -1 to 1), RRF provides score-agnostic fusion:

```
RRF_score(doc) = Σ 1 / (rank_i + k)
```

Where `k` is typically 60. No normalization needed — ranks are universal.

**Source:** Azure Hybrid Search, Redis hybrid search documentation

### 4.4 Adaptive Memory Admission Control

Recent research (ArXiv 2603.04549) proposes five signals for memory admission:

| Signal | What it measures |
|--------|-----------------|
| **Usefulness** | Relevance to current task |
| **Reliability** | Confidence in accuracy |
| **Redundancy** | Overlap with existing memories |
| **Temporal relevance** | Recency decay |
| **Persistence** | Long-term importance |

A learned linear policy aggregates these into a score; threshold determines admit/update/reject.

**Source:** "Adaptive Memory Admission Control for LLM Agents", ArXiv 2603.04549

---

## 5. Context Compression Techniques

### 5.1 Recursive Message Summarization (Letta)

When context budget is exceeded:
1. Calculate summarizer cutoff point
2. Summarize messages up to cutoff, preserving recent messages in full
3. Prepend summary to message list
4. Retry the LLM call with compressed context
5. Each summarization round gives older messages progressively less influence

**Trigger:** Letta's "sleep-time" subagents can run in background to reflect on recent conversations and edit memories proactively.

### 5.2 Context Compaction Strategies

Three strategies identified in production (Factory AI evaluation):

| Strategy | How it works | Hallucination risk | Compression ratio |
|----------|-------------|-------------------|-------------------|
| **Summarization** | LLM rewrites older context as summaries | Medium (can introduce artefacts) | 5-20× |
| **Token pruning** | Model-guided removal of low-signal tokens (LLMLingua) | Low | 2-5× |
| **Verbatim deletion** | Delete tokens, keep survivors character-for-character | Zero | 2-3× |

**Trigger recommendation:** Compact at 70% of context budget (not at overflow — by then it's too late for graceful handling).

**Source:** Factory AI evaluation, ACON framework (ArXiv 2510.00615), Cursor dynamic context discovery

### 5.3 Tool Output Compression

**Cursor's approach:** Convert long tool outputs to files rather than keeping in conversation context. Reduces token usage by 46.9% while maintaining accuracy.

**Relevance to Agent OS:** Step outputs that flow between process steps could be stored as references rather than inline, with only summaries in the conversation context.

---

## 6. Lost-in-the-Middle and Attention Management

### 6.1 The Problem

LLMs exhibit U-shaped attention: tokens at the beginning and end of context receive higher attention than middle content. This is caused by Rotary Position Embedding (RoPE) creating long-term decay in middle tokens.

**Impact:** 30%+ accuracy drop when the answer moves from position 1 to position 10 in a 20-document retrieval context.

### 6.2 Mitigation Strategies

| Strategy | How | Cost |
|----------|-----|------|
| **Strategic ordering** | Place critical information at beginning AND end of context | Free |
| **Limit document count** | Keep only 3-5 most relevant documents | Free (reduces tokens) |
| **Context compression** | Shrink total length to eliminate large middle region | LLM call for compression |
| **Reranking** | Position most relevant content at optimal locations | Reranker inference |
| **Structured formatting** | XML/markdown sections with clear labels | Free |

### 6.3 Implications for Agent OS

The agent harness assembly should order context sections for maximum attention:

```
[HIGH ATTENTION — Beginning]
1. Role identity and current task (what to do NOW)
2. Quality criteria for this step (what "good" looks like)
3. Most relevant memories (corrections, preferences)

[LOWER ATTENTION — Middle]
4. Process definition (reference, not action)
5. Tool schemas (reference)
6. Background context

[HIGH ATTENTION — End]
7. Current inputs (the actual work)
8. Specific instructions for this invocation
```

---

## 7. Budget Enforcement and Cost Tracking

### 7.1 Paperclip's Multi-Level Model

| Level | Budget field | Enforcement |
|-------|-------------|-------------|
| Per-agent | `budgetMonthlyCents` | Soft warning at 80%, hard stop at 100% |
| Per-task | Atomic checkout | No double-work, no runaway spend |
| Per-project | Aggregated from agent budgets | Board can override |

**CostEvent reporting:** Adapters report token usage via structured records. Budget check is atomic with task checkout.

### 7.2 Token-Based Budgeting (Not Request-Based)

Simple request counting fails because one request with a massive prompt costs 100× more than a small one. Budget enforcement should track:

| Metric | Why |
|--------|-----|
| Input tokens consumed | Dominates cost for long-context systems |
| Output tokens consumed | Variable, harder to predict |
| Cache read tokens | 90% cheaper — track separately |
| Cache write tokens | 25% more expensive — track separately |
| Total cost ($) | The actual budget constraint |

### 7.3 Budget-Aware Execution Strategy

Research shows agents should adapt strategy based on remaining budget:

| Budget state | Strategy | Effect |
|--------------|----------|--------|
| Abundant (>50%) | Exploratory | More tool calls, richer context, deeper reasoning |
| Moderate (20-50%) | Balanced | Standard context, selective tool use |
| Low (<20%) | Greedy | Minimal context, direct answers, skip optional steps |

**Source:** Paperclip budget enforcement, THROTTLE.md specification, token-based rate limiting research

---

## 8. Context Across Multi-Step Processes

### 8.1 What Carries Forward vs Gets Dropped

| Carries forward | Gets dropped after step |
|-----------------|----------------------|
| Task context (what we're doing and why) | Intermediate tool outputs (unless explicitly needed) |
| Decision history (what was decided and why) | Verbose reasoning traces |
| Shared state (accumulated results) | Step-specific tool schemas |
| Error history (what went wrong) | Conversation with previous agents |

### 8.2 Step-Specific Context Assembly

The harness should assemble different context profiles for different step types:

| Step type | Identity | Memory | Tools | Task content | History |
|-----------|----------|--------|-------|-------------|---------|
| AI planning | Full | Low (general preferences) | None | Full process def + inputs | Previous outcomes |
| AI execution | Full | High (corrections, learned patterns) | Full authorised set | Step inputs only | Relevant prior step outputs |
| AI review | Reviewer identity | High (quality criteria, correction patterns) | Read-only tools | Original output + criteria | Correction history for this process |
| Script | N/A | N/A | N/A | Step inputs | N/A |
| Human | N/A | N/A | N/A | Summary + what's needed | Decision context |

### 8.3 Parallel Step Context Isolation

When steps run in parallel (Agent OS's `parallel_group`), each step should receive:
- Independent context assembly (no shared mutable state during execution)
- Step-specific memory (only memories relevant to this step's agent/role)
- Step-specific tools (only tools authorised for this step)
- Shared inputs (read-only access to group inputs)

Results merge after all parallel steps complete.

### 8.4 Context for Human Steps

**Gap identified during review.** The architecture (ADR-010) specifies human action steps in processes — the process suspends, the human acts in the real world, then the process resumes. Context management for these steps is distinct from AI steps:

| Concern | What's needed | Notes |
|---------|--------------|-------|
| **What the human sees** | Summary of process state, what's needed, why, deadline | Rendered via Layer 6 primitives (Review Queue, Output Viewer) — not an LLM context problem |
| **What the agent sees on resume** | Human's completion input + what happened during the pause | No tool schemas, no memory injection — the agent that resumes needs the human's output, not its own prior context |
| **Context staleness** | Memories may have changed during the (potentially long) human step | Re-assemble context on resume, don't use pre-suspension context |

No surveyed system addresses this specifically. Mastra's suspend/resume preserves step paths but doesn't address context reassembly on resume. Trigger.dev's waitpoint tokens carry a payload but don't specify context management. This is a genuine gap for the Architect.

### 8.5 Context Across Process Boundaries (Layer 4)

**Gap identified during review.** When Process A's output triggers Process B (via the Layer 4 dependency graph), context management involves:

| Concern | Pattern found | Source |
|---------|--------------|--------|
| **What carries forward** | Process A's output (structured data, not conversation history) | AWS Step Functions (explicit state passing between activities) |
| **Budget isolation** | Each process has its own token budget — Process B's budget is independent of Process A's | Paperclip (per-task budget enforcement) |
| **Memory scope interaction** | Process A's memories stay with Process A; Process B loads its own process-scoped memories | Agent OS ADR-003 (process-scoped memory is per-process) |
| **Context from upstream** | Process B receives Process A's output as a step input, not as injected memory | Inngest AgentKit (typed state passed between agents in network) |

**Key principle:** Cross-process context is explicit (structured outputs), not implicit (shared conversation or memory). This aligns with the architecture's "loosely coupled through declared dependencies" (architecture.md, Layer 4). No system handles trust-aware context passing across process boundaries — this is Original to Agent OS.

---

## 9. Agent OS-Specific Context Architecture

### 9.1 Current State (What Exists)

Agent OS already implements:
- **Memory assembly handler** (`src/engine/harness-handlers/memory-assembly.ts`): Loads agent-scoped + process-scoped memories, sorts by reinforcement/confidence, truncates to char budget (default: 2000 tokens × 4 chars)
- **Conditional tool inclusion** (`src/adapters/claude.ts`): `stepNeedsTools()` checks step input types before including tool schemas
- **Role-based system prompts** (`src/adapters/claude.ts`): 10 role-specific prompts, composed with process/step context
- **Token budget on tools** (`src/engine/tools.ts`): 500-line limit per file read, 50 matches per file for search

### 9.2 Context Assembly Architecture (Illustrative — For Architect Evaluation)

**Note:** This section synthesises the surveyed patterns into a concrete illustration. It is NOT a recommendation — it shows one possible assembly pipeline to ground the Architect's design decisions. The three options in Section 11 remain the neutral output of this research.

Based on the patterns surveyed, a context-efficient harness assembly would layer context in cache-friendly order:

```
Agent Harness Assembly: assemble(agentId, processId, stepId)
│
├── STABLE PREFIX (cacheable)
│   ├── 1. Agent identity + role prompt
│   │      [Source: agents table → system prompt for this role]
│   ├── 2. Process definition
│   │      [Source: processes table → YAML parsed to structured text]
│   ├── 3. Quality criteria for this step
│   │      [Source: process definition → step.quality_criteria]
│   └── 4. Tool schemas (if step needs tools)
│          [Source: conditional — only if stepNeedsTools()]
│          [Optimisation: deferred loading for large tool sets]
│
├── SEMI-STABLE (cacheable if unchanged between runs)
│   ├── 5. Agent-scoped memories (top-N by salience)
│   │      [Source: memories table, scope=agent]
│   │      [Scoring: confidence × log(reinforcement+1) × recency_decay]
│   │      [Budget: configurable per step, default 30% of memory budget]
│   └── 6. Process-scoped memories (top-N by salience)
│          [Source: memories table, scope=process]
│          [Scoring: same formula]
│          [Budget: configurable per step, default 70% of memory budget]
│
├── VARIABLE (per-invocation)
│   ├── 7. Step inputs (current task content)
│   │      [Source: run inputs + prior step outputs]
│   └── 8. Conversation history (if multi-turn within step)
│          [Source: messages from current tool-use loop]
│          [Compression: summarize after N exchanges]
│
└── ATTENTION ANCHORS (end of prompt — high attention zone)
    └── 9. Specific instruction for this invocation
           "You are executing step [N] of process [X]. Your task is..."
```

### 9.3 Memory Budget Allocation

**Note:** The adaptive allocation idea ("trust-modulated context depth") is **Original to Agent OS** — no surveyed system adjusts context richness based on earned trust. The budget percentages below are illustrative, not sourced recommendations. Specific TTL values in Section 9.4 are also untested — they should be validated by measurement.

**Prior art:** ADR-003 (line 104) already specifies refining memory sorting to `confidence * log(reinforcementCount + 1)` with recency decay for Phase 3. The memU salience scoring described in Section 4.2 validates this formula from a different source.

Based on Letta's proportional model, adapted for Agent OS:

| Context component | Budget % | Rationale |
|-------------------|----------|-----------|
| Agent identity + role | 5-10% | Stable, small, critical for behaviour |
| Process definition + criteria | 10-15% | Reference material, semi-stable |
| Tool schemas | 10-20% | Variable — deferred loading reduces this |
| Memory (agent + process) | 15-25% | Core differentiator — learned patterns |
| Task content + inputs | 30-40% | The actual work — needs most space |
| Conversation history | 10-20% | Multi-turn within step |

**Adaptive allocation:** High-trust processes could shift budget from memory to task content (fewer corrections to remember). Low-trust processes shift toward memory (more learned patterns to enforce).

### 9.4 Prompt Caching Strategy for Agent OS

Given that process agents execute the same process definition repeatedly:

| Cache target | TTL | Savings | When |
|--------------|-----|---------|------|
| Agent identity + role prompt | 1 hour | High — stable across all invocations | Every run |
| Process definition + criteria | 1 hour | High — changes only on process update | Every run |
| Tool schemas | 5 min | Medium — tools rarely change | If tools included |
| Memory blocks | 5 min | Medium — changes on feedback events | Between feedback events |

**Break-even estimate:** A process running 3+ times per hour with stable system prompt saves 80%+ on input token costs via caching. This is significant for high-frequency processes (daily briefs, intake classification, routine tasks).

---

## 10. Gaps — What No Existing System Does

| Capability | Closest analogue | Why it's still a gap |
|-----------|-----------------|---------------------|
| **Process-aware context assembly** — different context profiles for different step types within the same process | Mastra tool-source merging (capability-aware, not process-aware) | No system assembles context based on step semantics (planning vs execution vs review) |
| **Trust-modulated context depth** — trusted processes get leaner context, untrusted get richer | None found | No system adjusts context richness based on earned trust level |
| **Cross-step context compression** — summarise completed steps to carry forward only essentials | Letta message summarization (within single agent) | No system compresses across process steps (multi-agent handoff context) |
| **Budget-aware context strategy** — shift from exploratory to greedy as budget depletes | Research-only (ArXiv) | No production implementation found |
| **Cache-aware memory ordering** — order memories to maximise prompt cache prefix reuse | Claude Code (implicit — stable prefix pattern) | No system explicitly optimises memory ordering for cache hit rates |
| **Memory salience with trust weighting** — memories from highly-reinforced processes weighted higher | memU reinforcement counting (closest) | No system weights memory salience by the process's trust tier |

---

## 11. Options for the Architect

### Option A: Extend Current Memory Assembly

Enhance `memory-assembly.ts` with:
- Salience scoring (replace simple sort with `confidence × log(reinforcement+1) × recency_decay`)
- Step-type-aware memory selection
- Budget allocation by component
- Cache-friendly ordering

**Pros:** Incremental, builds on existing implementation
**Cons:** Doesn't address tool loading, conversation management, or cross-step compression

### Option B: Full Context Engineering Pipeline

Add a dedicated context assembly stage to the harness pipeline (before memory-assembly):
- `context-engineer.ts` handler that determines the context profile for this step type
- Configurable budget allocation per step
- Deferred tool loading
- Stable prefix / variable suffix partitioning for cache optimization

**Pros:** Clean separation of concerns, future-proof
**Cons:** More upfront work, new abstraction layer

### Option C: Phased Introduction (Aligned with Roadmap)

| Phase | What to add | Build from |
|-------|-------------|------------|
| Phase 4 (current) | Salience scoring in memory assembly + step-type context profiles + prompt caching in Claude adapter | memU formula + Letta proportions + Anthropic cache_control |
| Phase 6 (integrations) | Deferred tool loading for integration tools | Mastra ToolSearchProcessor + Claude Agent SDK pattern |
| Phase 8 (learning) | Trust-modulated context depth + budget-aware strategy | Original to Agent OS |
| Phase 10 (web) | Cross-step context compression for UI conversation | Letta recursive summarization |

**Pros:** Matches existing build phases, each addition is independently valuable
**Cons:** Full context efficiency not realised until Phase 8

---

## 12. Model Routing: Agent Team vs Single Generalist

### 12.1 The Core Question

Should a process use a single generalist agent for all steps, or route different steps to different models based on their strengths? The architecture already defines different executor types per step (`ai-agent`, `script`, `rules`, `human`). The question is whether the `ai-agent` executor should further route to different models.

### 12.2 When Multi-Agent Specialist Teams Win

Research shows clear cases where specialist teams outperform generalists:

| Scenario | Single agent | Multi-agent | Source |
|----------|-------------|-------------|--------|
| Strategic reasoning | 50% accuracy | 88% accuracy | Columbia CS research |
| Strategy completeness | 65% complete | 90-95% complete | Columbia CS research |
| Research orchestration | Baseline | 90.2% improvement | Anthropic multi-agent research system |
| Complex planning | 2.92% success (GPT-4) | 42.68% success | Cornell study |

**Why:** Each sub-agent gets its own context window, enabling parallel exploration of different aspects. The orchestrator synthesises results — a form of parallel compression.

### 12.3 When Single Agents Win

| Scenario | Why single is better | Source |
|----------|---------------------|--------|
| Sequential reasoning | Multi-agent degrades performance by 39-70% — communication overhead fragments cognition | Google research |
| Well-defined tasks | Single agent is simpler, cheaper, easier to govern | Production consensus |
| Latency-sensitive | Each handoff adds latency; no coordination overhead | Production consensus |
| Context window sufficient | No need to split work if one agent can hold all context | Practical constraint |

### 12.4 The Cost Reality

| Metric | Single agent | Multi-agent | Multiplier |
|--------|-------------|-------------|------------|
| Token consumption | 10K tokens | 35K tokens (4-agent) | 3.5× |
| Anthropic research case | Baseline | 15× more tokens | 15× |
| Token duplication in verification | — | 53-86% of verification tokens are reprocessing | Significant waste |
| Agents consume vs chat | ~4× more | ~15× more | — |

**Rule:** Token usage explains 80% of performance variance in complex tasks. Multi-agent works by spending enough tokens to solve the problem — not by magic coordination.

### 12.5 The Coordination Plateau

- **Below 4 agents:** Adding agents helps substantially
- **Above 4 agents:** Coordination overhead consumes the benefits
- **Beyond 5 handoffs:** "Almost always failed" (production experience)
- **Communication complexity:** 3 agents = 3 relationships; 10 agents = 45 relationships

### 12.6 Model Routing Patterns

**Pattern 1: Cost-based cascade (cheap → expensive)**

Route to cheapest model first; escalate on low confidence or failure.

| Model | Cost (input/output per 1M) | Best for |
|-------|---------------------------|----------|
| Claude Haiku | $1/$5 | Classification, extraction, validation, simple formatting |
| Claude Sonnet | $3/$15 | Balanced reasoning + speed, standard dev tasks |
| Claude Opus | $5/$25 | Complex reasoning, orchestration, novel problems |
| GPT-4o-mini | $0.15/$0.60 | Fast text tasks (not vision) |

**Savings:** A 70/20/10 split (Haiku/Sonnet/Opus) cuts costs 60% vs all-Sonnet. Customer support example: reduced $42,000/month to $18,000/month maintaining satisfaction scores.

**Source:** RouteLLM framework (lm-sys), xRouter (ArXiv 2510.08439), production case studies

**Pattern 2: Capability-based routing (task type → model)**

| Task type | Optimal model | Why |
|-----------|--------------|-----|
| Classification / extraction | Haiku / GPT-4o-mini | Structured, narrow — cheap model sufficient |
| Standard code generation | Sonnet | Good reasoning + speed balance |
| Complex reasoning / architecture | Opus | Deep reasoning, catches edge cases |
| Review / verification | Sonnet | Checking is easier than creating |
| Orchestration / decomposition | Opus | Needs to reason about structure |

**Pattern 3: Confidence-driven escalation**

```
Step 1: Route to Haiku
Step 2: Haiku outputs confidence score
Step 3: If confidence < threshold → re-route to Sonnet
Step 4: If Sonnet confidence < threshold → re-route to Opus
```

Self-consistency checks (generate multiple responses from cheap model; escalate if they disagree) are an alternative to explicit confidence scoring.

**Source:** CARGO (ArXiv 2509.14899), GATEKEEPER (OpenReview), RouteLLM

**Pattern 4: Router model (small model selects large model)**

A lightweight classifier (Haiku, or even a fine-tuned small model like Qwen 1.7B) classifies task complexity and routes to the appropriate model. Total cost: ~200 tokens for routing + ~1,000 tokens for execution = 1,200 tokens.

~70% of production multi-agent deployments use this orchestrator-worker pattern.

### 12.7 Framework Support for Per-Step Model Selection

| Framework | How model selection works |
|-----------|-------------------------|
| **Mastra** | Model Router across 600+ models via 40+ providers. Per-agent model assignment. User-selectable models via RequestContext |
| **CrewAI** | Different LLM instances per agent in a crew |
| **LangGraph** | Conditional edges route to different nodes with different models |
| **OpenAI Agents SDK** | Handoffs switch instructions, models, and tools based on conversation state |
| **Vercel AI SDK** | Dynamic model selection — first LLM call determines second call's model |
| **Inngest AgentKit** | Per-agent model selection; Networks specify defaultModel; agents can override |
| **Agent OS (current)** | Single model (Claude) hardcoded in adapter. Architecture supports adapter pattern but no per-step model routing |

### 12.8 Handoff Context Engineering

The primary failure mode in multi-agent systems is context loss at handoffs. Production patterns:

| Pattern | What works | What fails |
|---------|-----------|------------|
| **Structured schema handoff** | Typed, versioned data objects with validators | Free-form prose (telephone game) |
| **Process state document** | Shared queryable state that agents read/write | Passing full conversation history |
| **Narrative recasting** | Prior agent's messages re-cast as narrative context | Raw "assistant" messages from another agent |
| **Minimal effective context** | Only what the next step needs; agent reaches for more via tools | Dumping everything "just in case" |

### 12.9 Implications for Agent OS

Agent OS's architecture already has the right primitives:

1. **Process definitions assign executors per step** — extending this to model selection per step is natural
2. **The adapter pattern** (`invoke()`, `status()`, `cancel()`) — adding a model parameter to the adapter is clean
3. **Process-scoped memory** — handoff context lives in the process state, not agent conversation
4. **Trust tiers** — can modulate model selection: supervised steps get the expensive model (needs to be right), autonomous steps get the cheap model (proven reliable)

**What's needed:**
- Process definitions should support optional `model` or `model_tier` per step (defaulting to the process-level model)
- The harness should support model routing logic (capability-based, cost-based, or confidence-driven)
- The adapter interface should receive a model parameter, not assume Claude
- Context handoff between steps should use structured process state (not conversation history)

**What's Original to Agent OS:**
- **Trust-modulated model routing** — trusted steps run on cheaper models because they've proven reliable; untrusted steps run on expensive models because quality matters more. No system ties model selection to earned trust.
- **Process-declared model profile** — the process definition specifies which model tier each step needs, integrated with the context profile (Insight-033). No system combines per-step model selection with process-declared context shape.

---

## Provenance Summary

| Pattern | Source | Applicability |
|---------|--------|--------------|
| Stable prefix + variable suffix | Claude Code, Google ADK, Anthropic prompt caching | HIGH — foundational for cache efficiency |
| Deferred tool loading | Claude Agent SDK, Mastra ToolSearchProcessor | HIGH — 85% reduction in tool schema tokens |
| Memory salience scoring | memU (`similarity × log(reinforcement+1) × recency_decay`) | HIGH — direct replacement for current simple sort |
| Context budget allocation | Letta `get_context_window()` proportional model | HIGH — explicit allocation prevents overflow |
| Recursive message summarization | Letta `summarize_messages_inplace()` | MEDIUM — needed for multi-turn tool-use loops |
| Prompt caching with cache_control | Anthropic API | HIGH — 90% cost reduction on repeated process invocations |
| Step-type context profiles | LangChain DeepAgents harness, AWS Step Functions | MEDIUM — no direct implementation, but pattern is clear |
| Lost-in-the-middle mitigation | Stanford NLP research, advanced RAG | HIGH — free (ordering) to medium (compression) |
| Multi-level budget enforcement | Paperclip CostEvent model | MEDIUM — needed for Phase 4+ |
| Reciprocal Rank Fusion | Azure Hybrid Search, Redis | LOW for now — needed when >1K memories per scope |
| RL-based memory operations | AgeMem, Memory-R1 | LOW — research-stage, interesting for Phase 8+ |
| Verbatim context compaction | Factory AI | MEDIUM — zero-hallucination compression for tool outputs |
| Token-based rate limiting | THROTTLE.md specification | LOW — needed at scale |
| Cost-based cascade routing | RouteLLM (lm-sys), xRouter | HIGH — 60% cost savings via Haiku/Sonnet/Opus split |
| Confidence-driven escalation | CARGO, GATEKEEPER | MEDIUM — self-consistency or explicit confidence scoring |
| Per-step model selection | Mastra Model Router, CrewAI, Inngest AgentKit | HIGH — every major framework supports this |
| Structured schema handoffs | Anthropic multi-agent research, production patterns | HIGH — typed handoffs prevent context loss |
| Orchestrator-worker with model split | Anthropic (Opus lead + Sonnet workers) | HIGH — 90.2% improvement, maps to process model |
| Trust-modulated model routing | **Original to Agent OS** | — no system ties model selection to earned trust |
| Process-declared model profile | **Original to Agent OS** | — no system combines per-step model with context shape |

---

## Sources

| Source | Key reference |
|--------|--------------|
| Anthropic Prompt Caching | `platform.claude.com/docs/en/build-with-claude/prompt-caching` |
| Claude Code Context Engineering | HuggingFace blog `kobe0938/context-engineering-reuse-pattern-claude-code` |
| Letta Memory Compilation | `letta/schemas/memory.py`, `letta/agent.py`, docs.letta.com |
| Mastra Tool Loading | `packages/core/src/agent/agent.ts`, mastra.ai/docs/workspace/skills |
| Open SWE Agent Assembly | `agent/server.py`, github.com/langchain-ai/open-swe |
| memU Salience Scoring | `src/memu/app/retrieve.py`, github.com/NevaMind-AI/memU |
| Mem0 Retrieval Pipeline | docs.mem0.ai/core-concepts/memory-operations/search |
| Graphiti Hybrid Retrieval | `graphiti_core/search/search.py`, github.com/getzep/graphiti |
| Paperclip Budget Model | `server/src/services/budgets.ts`, github.com/paperclipai/paperclip |
| Factory AI Compression | zenml.io/llmops-database/evaluating-context-compression-strategies |
| ACON Framework | ArXiv 2510.00615 |
| Lost-in-the-Middle | Stanford NLP, `cs.stanford.edu/~nfliu/papers/lost-in-the-middle.arxiv2023.pdf` |
| Adaptive Memory Admission | ArXiv 2603.04549 |
| AgeMem RL Memory | ArXiv 2601.01885 |
| Memory-R1 | ArXiv 2508.19828 |
| Google ADK Context Caching | google.github.io/adk-docs/context/caching |
| OpenAI Prompt Caching | platform.openai.com/docs/guides/prompt-caching |
| THROTTLE.md | throttle.md |
| Context Window Management | redis.io/blog/context-window-overflow, getmaxim.ai, agenta.ai |
| CrewAI Memory | docs.crewai.com/en/concepts/memory |
| LangGraph Persistence | docs.langchain.com/oss/python/langgraph/persistence |
| RouteLLM | github.com/lm-sys/RouteLLM, lmsys.org/blog/2024-07-01-routellm |
| xRouter | ArXiv 2510.08439 |
| CARGO Confidence Routing | ArXiv 2509.14899 |
| Anthropic Multi-Agent Research | anthropic.com/engineering/multi-agent-research-system |
| Anthropic Orchestrator-Workers | anthropic-cookbook/patterns/agents/orchestrator_workers.ipynb |
| ChatDev | ArXiv 2307.07924 |
| Columbia CS Multi-Agent Behavior | cs.columbia.edu/~chilton (Sreedhar et al.) |
| Mastra Model Router | mastra.ai/blog/model-router |
| OpenAI Agents SDK Handoffs | openai.github.io/openai-agents-python/handoffs |
| Google ADK Multi-Agent | developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework |
| Anthropic Context Engineering | anthropic.com/engineering/effective-context-engineering-for-ai-agents |
