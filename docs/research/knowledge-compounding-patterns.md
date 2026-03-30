# Research: Knowledge Compounding Patterns — Explicit Extraction for Ditto's Learning Infrastructure

**Date:** 2026-03-30
**Researcher:** Dev Researcher (Claude Code)
**Status:** complete
**Brief:** 059 — Knowledge Compounding Research
**Consumers:** architecture.md (L2, L5), Insight-042, Insight-115, knowledge compounding meta-process design
**Related research:** `docs/research/cross-session-memory-implementations.md` (companion report)

---

## Question 1: What Knowledge Types Does Implicit L5 Feedback Miss?

Ditto's current L5 Learning Layer captures feedback implicitly through five mechanisms:

| Mechanism | What it captures | Storage |
|-----------|-----------------|---------|
| Edit diffs (jsdiff) | What changed in the output text — word-level adds/removes, editSeverity, editRatio | `feedback` table + `correction` memory via `createMemoryFromFeedback()` |
| Rejection comments | Why the human rejected (free text) | `feedback` table + `correction` memory |
| Correction pattern detection | Repeated identical correctionPattern values (3+ threshold) | `feedback.correctionPattern` field, surface as notification |
| Model routing data | Which model produced what, at what cost, with what approval rate | `stepRuns.model` field, analyzed by `generateModelRecommendations()` |
| Implicit UI signals | View duration, navigation, review response time | `interaction_events` table |

The memory created from feedback is a **diff summary string**: `"Edit (minor): 3 words removed, 5 words added"`. The correction pattern is a heuristic: first 5 words of the first removed segment. These capture **what changed** but miss six categories of higher-order knowledge:

### Knowledge types that require deliberate extraction

| Knowledge type | Example | Why implicit feedback misses it |
|---------------|---------|-------------------------------|
| **Root cause** | "The edge runtime doesn't support Node.js `fs` module" | Diffs show the fix, not the diagnosis. The hours of debugging that narrowed it down are lost. |
| **Failed approaches** | "Tried polyfilling `fs` — broke at build time. Tried dynamic import — silent failure in production." | Only the final accepted output is recorded. All dead ends evaporate. |
| **Prevention strategy** | "When using Vercel, check edge runtime compatibility BEFORE writing the implementation" | This is forward-looking knowledge. Diffs are backward-looking (what was wrong). |
| **Solution pattern** | "Edge runtime compatibility issues → move the function to a Node.js API route instead of client component" | The correction diff shows one instance. The generalizable pattern requires abstraction. |
| **Problem classification** | "This was a build_error in the deployment subsystem, severity: moderate" | Implicit feedback doesn't classify — it just records the fix. |
| **Cross-reference** | "We hit a similar issue in the quoting process three weeks ago — see solution X" | Each process's memories are scoped independently. Cross-process patterns are invisible. |

**Key finding from Devin's engineering (Cognition blog, "Rebuilding Devin for Sonnet 4.5"):** When Cognition tested removing their engineered memory infrastructure and relying on model-generated state, they "saw performance degradation and gaps in specific knowledge." Model self-summarization "wasn't comprehensive enough" and "sometimes omitted critical task details." This directly validates the need for structured extraction over emergent capture.

**Key finding from Reflexion (Shinn et al., EMNLP 2025 caveat):** Self-reflection without external grounding is vulnerable to degeneration-of-thought — the model repeats its own flawed reasoning. Same-model, same-context evaluation has +10-25% self-enhancement bias. This means knowledge extraction must be grounded in external evidence (user corrections, execution logs, test results), not just "reflect on what happened."

---

## Question 2: How Does CE's Compound Step Actually Work?

### Architecture (code-level analysis)

The article's claim of "five Phase 1 subagents" is **inaccurate**. Code analysis of `plugins/compound-engineering/skills/ce-compound/SKILL.md` reveals **three Phase 1 subagents**, not five:

| Subagent | Responsibility | Key mechanism |
|----------|---------------|---------------|
| **Context Analyzer** | Extract problem type, component, severity from conversation. Suggest filename. Produce YAML frontmatter skeleton. | Reads `references/schema.yaml` for constrained enum values. Handles both track classification (bug vs knowledge). |
| **Solution Extractor** | Produce structured solution content. Track-specific sections. | Bug track: Problem, Symptoms, What Didn't Work, Solution, Why This Works, Prevention. Knowledge track: Context, Guidance, Why This Matters, When to Apply, Examples. |
| **Related Docs Finder** | Search `docs/solutions/` for duplicates. Assess overlap. Search GitHub issues. | Grep-based filtering on YAML frontmatter fields (title, tags, module, component). 5-dimension overlap scoring: problem statement, root cause, solution approach, referenced files, prevention rules. |

The "Prevention Strategist" and "Category Classifier" from the article are **not separate subagents** — prevention is a section produced by the Solution Extractor, and classification is handled by the Context Analyzer reading the constrained schema.

**Phase 2 (Assembly)** is performed by the orchestrator (main thread), not a subagent. It decides based on Related Docs Finder overlap:
- High overlap (4-5 dimensions): Update existing doc, don't create duplicate
- Moderate overlap (2-3): Create new doc, flag for consolidation
- Low/none (0-1): Create new doc normally

**Phase 3 (Optional Enhancement)** may invoke specialized reviewers (performance-oracle, security-sentinel, data-integrity-guardian) based on problem type, but these are post-documentation reviewers.

### Subagent implementation

All subagents are **prompt-only** — defined as markdown instructions within SKILL.md, dispatched via `<parallel_tasks>` XML tags. No TypeScript, no Python. The "subagents" are parallel LLM invocations with different prompt instructions. This is the exact pattern Ditto's parallel_group containers already support.

### Structured output format

Two templates controlled by track classification:

**Bug track** frontmatter: title, date, category, module, problem_type, component, symptoms (array), root_cause, resolution_type, severity, tags (array)
**Knowledge track** frontmatter: title, date, category, module, problem_type, component, severity, applies_when (array), tags (array)

All enum values are constrained via `references/schema.yaml`. The schema defines 13 problem types mapping to 13 directory paths (e.g., `build_error` → `docs/solutions/build-errors/`).

### Deduplication mechanism

**No vector database, no embeddings, no semantic similarity.** Purely grep-based text matching on structured YAML frontmatter fields:
1. Extract keywords from problem context (module names, technical terms, error messages)
2. Narrow to matching `docs/solutions/<category>/` directory
3. Parallel case-insensitive grep on frontmatter: `title:.*<keyword>`, `tags:.*(keyword1|keyword2)`, `module:.*<module>`, `component:.*<component>`
4. If >25 candidates, re-run with more specific patterns. If <3, broaden to full content search
5. Read frontmatter (first 30 lines) of candidates, score relevance
6. Fully read only strong/moderate matches

### Trigger mechanism

**Manual with semi-automatic detection.** User runs `/ce:compound` or conversation triggers auto-detection via phrases ("that worked", "it's fixed", "working now"). Advisory preconditions: problem should be solved, verified working, non-trivial. Never fully automatic (no CI, no schedule).

### How plan phase retrieves knowledge

`ce:plan` launches a `learnings-researcher` agent that searches `docs/solutions/` using the same grep-first filtering strategy. Also always checks `docs/solutions/patterns/critical-patterns.md` regardless of grep results. Returns distilled summaries with file path, module, problem type, relevance explanation, key insight, severity.

**Key file paths:**

| File | Purpose |
|------|---------|
| `plugins/compound-engineering/skills/ce-compound/SKILL.md` | Main compound skill (all subagent prompts) |
| `plugins/compound-engineering/skills/ce-compound/references/schema.yaml` | Frontmatter enum contract |
| `plugins/compound-engineering/skills/ce-compound/references/yaml-schema.md` | Category-to-directory mapping |
| `plugins/compound-engineering/skills/ce-compound/assets/resolution-template.md` | Output section templates |
| `plugins/compound-engineering/skills/ce-plan/SKILL.md` | Plan skill with knowledge retrieval |
| `plugins/compound-engineering/agents/research/learnings-researcher.md` | Agent that searches docs/solutions/ |

---

## Question 3: What Other Systems Implement Post-Completion Knowledge Extraction?

### System comparison

| System | Extraction method | What is extracted | Storage format | Retrieval | Auto/Manual |
|--------|------------------|-------------------|---------------|-----------|-------------|
| **CE compound** | 3 parallel LLM subagents | Root cause, failed approaches, prevention, solution, classification | Structured markdown + YAML frontmatter | Grep on frontmatter fields | Manual with auto-detect phrases |
| **Reflexion** | Single self-reflection model | Verbal description of what went wrong + what to try differently | Plain text strings in episodic buffer | Direct prompt injection (most recent) | Auto (on trial failure) |
| **Anthropic harness** | Agent writes at session end | What was done, what's working, what's left | Free-form text (progress.txt) + JSON (feature list) | File read at session start | Semi-auto (prompted by harness) |
| **Devin Knowledge** | Human + agent auto-suggestions | Trigger-based knowledge items | Trigger + content + macro | Trigger-description matching | Both (human creates; Devin suggests) |
| **Claude Code auto memory** | Agent decides what to save | Build commands, debugging insights, preferences, patterns | MEMORY.md index + topic .md files | Static injection (first 200 lines of MEMORY.md) | Auto (agent judgment) |
| **Windsurf memories** | Agent auto-generates | "Context it believes is useful to remember" | Opaque local files | "Relevance-based" (undocumented) | Auto (toggleable) |
| **AutoGPT** | Agent during think-execute cycle | Action-observation pairs | JSON with embeddings | Numpy dot-product similarity | Auto (per cycle) |
| **OpenClaw bootstrap** | User-managed pre-compaction flush | Session context deemed important | SOUL.md, AGENTS.md, USER.md, MEMORY.md, TOOLS.md | Reload every session (lossy compaction) | Manual (user discipline) |

### Three distinct approaches emerge

**Approach A: Structured post-completion extraction (CE)**
- Dedicated extraction step with multiple parallel extractors
- Schema-constrained output with controlled vocabulary
- Deduplication via grep on structured frontmatter
- Human-triggered with auto-detection
- **Strength:** Produces high-quality, searchable, categorized knowledge
- **Weakness:** Requires explicit user action; extraction quality depends on prompt engineering

**Approach B: Continuous verbal reflection (Reflexion, AutoGPT)**
- Reflection generated after every trial/action
- Unstructured text stored in buffer or embeddings
- Injected directly into prompt context
- Fully automatic
- **Strength:** No user action required; captures learning from failures in real-time
- **Weakness:** Vulnerable to degeneration-of-thought; unstructured text becomes noisy at scale; Reflexion only works across retries of the same task, not across different tasks

**Approach C: Trigger-based knowledge items (Devin)**
- Knowledge stored with explicit trigger descriptions
- Retrieved when current work matches trigger
- Human-created with agent suggestions
- Scoped to repo
- **Strength:** High-precision retrieval (trigger matching); human curation ensures quality
- **Weakness:** Requires human effort; trigger descriptions may not cover all retrieval scenarios

**Approach D: Session-end state files (Anthropic harness, Cursor rules)**
- State written at session end for next session to read
- Linear continuity (tonight's notes for morning shift)
- Simple file-based persistence
- **Strength:** Dead simple; robust; no infrastructure requirements
- **Weakness:** Linear (not accumulative); no categorization; no cross-task retrieval

### Key finding across all systems

**No system combines all three of:** (1) structured extraction with controlled vocabulary, (2) automated deduplication/lifecycle management, and (3) context-aware retrieval at plan time. CE comes closest with (1) + (3) via grep-based retrieval, but deduplication is advisory (the orchestrator decides, not automated). Ditto's harness pipeline architecture is uniquely positioned to combine all three because it already has the handler chain, memory scopes, and trust gates that could govern a knowledge extraction meta-process.

---

## Question 4: How Should "Solution Knowledge" Integrate with Ditto's Memory Model?

### Current memory model

Ditto's memory table uses three enums:

```typescript
memoryScopeTypeValues = ["agent", "process", "self"]
memoryTypeValues = ["correction", "preference", "context", "skill", "user_model"]
memorySourceValues = ["feedback", "human", "system", "conversation"]
```

The `scopeType` + `scopeId` determines where memory lives. The `type` determines what kind of memory it is. The `source` determines how it was created.

### Option A: New memory type within existing scopes

Add `"solution"` to `memoryTypeValues`. Solution knowledge lives in the same `memories` table, scoped by process or agent, alongside existing correction/preference/context/skill memories. The memory assembly handler already loads memories by scope and sorts by salience — solution memories would participate in the same progressive disclosure.

**Additional fields needed on the memory row (or in a JSON metadata column):**
- `category` — maps to CE's problem_type (constrained enum, e.g., "build_error", "runtime_error", "workflow_issue")
- `tags` — free-form array for grep-like retrieval
- `problemType` — optional, for the CE-style track distinction (bug vs knowledge)
- `rootCause` — optional, for bug-track entries
- `prevention` — optional, prevention strategy text
- `relatedMemoryIds` — optional, cross-references to related solution memories

**Provenance:** This follows Insight-100's approach for failure patterns: "Failure patterns stored in existing memory scopes with categorical tags — no new memory scope needed." Tagged with `category: failure_pattern` for targeted retrieval. Solution knowledge extends this: tagged with `type: solution` and `category: <problem_type>` for the same targeted retrieval mechanism.

**Provenance (CE):** CE's YAML frontmatter fields (problem_type, component, tags, severity) map directly to tagged metadata on memory rows. CE's directory-based categorization (13 problem types → 13 directories) maps to the `category` field on the memory row.

### Option B: Separate knowledge store

A new `solutionKnowledge` table with purpose-built schema matching CE's frontmatter structure. Separate from memories. Queried by a dedicated retrieval function, not by memory assembly.

### Option C: Tagged category within existing scopes (hybrid)

Same as Option A for structured data, but solution knowledge also produces a human-readable markdown document in a `knowledge/` directory (like CE's `docs/solutions/`). The memory row is the index entry; the document is the full content. Memory assembly surfaces the summary; on-demand reads get the full document.

### Comparison

| Aspect | Option A (memory type) | Option B (separate table) | Option C (hybrid) |
|--------|----------------------|--------------------------|-------------------|
| Infrastructure change | Minimal — add enum value + metadata fields | New table, new queries, new handler | Moderate — memory type + file output |
| Memory assembly integration | Automatic — existing salience sorting applies | Requires new retrieval path in memory-assembly handler | Partial — summary in memory, detail in file |
| Token budget | Competes with corrections/preferences for 2000-token budget | Separate budget, no competition | Summary in token budget, detail on-demand |
| Search capability | SQL queries on metadata fields | Purpose-built queries | SQL + file grep (like CE) |
| Lifecycle management | Existing memory active/inactive flag + confidence decay | Separate lifecycle | Split lifecycle |
| Cross-process visibility | Via agent-scoped memories (already cross-process) | Via dedicated cross-process queries | Both paths |
| Complexity | Low | High | Medium |

**Key consideration from Claude Code's memory system:** Files under 200 lines achieve 92% rule application rate vs 71% above 400 lines. This suggests that memory summaries (compact, injected at context assembly) are more effective than full documents when they compete for limited context budget. Option A's compact representation in the memory table may outperform Option C's full-document approach for routine retrieval — while Option C's full documents serve the "deep dive" use case.

---

## Question 5: How Should Knowledge Retrieval Work at Context Assembly?

### Current retrieval mechanism

`memory-assembly.ts` loads memories with this strategy:
1. Query memories by `scopeType` and `scopeId` (process-scoped for the current process, agent-scoped for the current agent)
2. Sort by salience (confidence × reinforcement)
3. Render into a formatted string: `- [type] content (confidence: X, reinforced: Nx)`
4. Truncate at character budget (DEFAULT_TOKEN_BUDGET = 2000 tokens ≈ 8000 chars)
5. Inject into agent system prompt

### Option A: Category-filtered retrieval (CE pattern)

At context assembly time, extract category signals from the current task context (process definition, step name, work item description) and filter solution memories by matching `category` and `tags` fields. This mirrors CE's learnings-researcher grep strategy but operates on the memory table.

```
Current task: "Generate quote for bathroom renovation"
→ Extract signals: module=quoting, component=labour_estimation, tags=[bathroom, renovation]
→ Query: SELECT * FROM memories WHERE type='solution' AND (category LIKE '%labour%' OR tags LIKE '%bathroom%') AND active=true ORDER BY salience DESC
→ Inject matching solution memories into context alongside corrections/preferences
```

**Provenance:** CE's `learnings-researcher` agent uses grep on frontmatter fields (title, tags, module, component). This translates directly to SQL WHERE clauses on memory metadata fields.

### Option B: Recency + reinforcement weighted (existing pattern)

No special retrieval for solution memories. They participate in the same salience sort as all other memories. Recently created, frequently reinforced solution memories naturally bubble to the top.

**Pro:** Zero implementation change in memory assembly.
**Con:** Solution memories compete with corrections and preferences for the same 2000-token budget. A process with many corrections may crowd out solution knowledge.

### Option C: Separate budget for solution knowledge

Allocate a separate token budget for solution memories (like intra-run context has its own 1500-token budget). Memory assembly queries solution memories independently and injects them in a separate section.

**Provenance:** Ditto's own intra-run context uses a separate 1500-token budget (Brief 027). Same pattern, applied to solution knowledge.

### Option D: Two-stage retrieval (pre-classifier + detail)

Stage 1: At context assembly, inject only solution memory summaries (title + category + one-line insight). Low token cost.
Stage 2: The agent can request full solution details via a tool call if a summary looks relevant. This mirrors the CE pattern where the learnings-researcher reads frontmatter first, then fully reads strong matches.

**Provenance:** CE's Related Docs Finder reads "frontmatter (first 30 lines) of candidates, score relevance. Fully read only strong/moderate matches." Also parallels Insight-100's conditional checking: "Two-stage: fast pre-classifier decides IF checking is needed, detailed check only when warranted (HaluGate pattern, 72% efficiency gain)."

### Key finding from AutoGPT's vector DB removal

AutoGPT removed Pinecone, Weaviate, and Milvus, reverting to JSON + numpy dot product. The rationale: LLM inference (10+ seconds) is the bottleneck, not retrieval (under 5ms for 100K embeddings). For Ditto's scale (single user, 5-20 processes), SQL queries on indexed metadata fields will be sub-millisecond. Vector search is premature.

---

## Question 6: What Is the Right Trigger for Knowledge Extraction?

### Observed triggers across systems

| System | Trigger | Condition |
|--------|---------|-----------|
| **CE compound** | Manual (`/ce:compound`) + auto-detect phrases ("it's fixed", "that worked") | Problem is solved, verified, non-trivial |
| **Reflexion** | Automatic on trial failure | Binary: task succeeded or failed |
| **Anthropic harness** | End of every session | Always — session loop includes progress update |
| **Devin** | User feedback in chat → auto-suggestion | Agent detects corrective/instructive feedback |
| **Claude Code** | Agent judgment ("would be useful in a future conversation") | Subjective agent assessment |

### Three trigger strategies for Ditto

**Strategy A: Post-run harness event (automatic)**

The harness already emits `run-complete` and `run-failed` events. A knowledge extraction handler could subscribe to these events and trigger extraction automatically. Conditions for extraction:

- **Run completed with human corrections** — edits or rejections were recorded (the most valuable learning signal)
- **Run failed and was retried** — the retry path means something went wrong and was fixed
- **Run involved a new process** — first 5-10 runs of a new process produce the most learning
- **Correction pattern threshold met** — the existing 3+ correction pattern detection already fires; this could trigger a deeper extraction

**Mapping to trust tiers:**
- Supervised processes: extract after every corrected output (high learning density)
- Spot-checked processes: extract after sampled corrections
- Autonomous processes: extract only on degradation events (correction rate spike, trust downgrade)
- Critical processes: extract after every run (compliance knowledge is high-value)

**Provenance:** CE's auto-detection (conversation phrases) + Reflexion's failure-triggered reflection + Ditto's existing `run-complete`/`run-failed` harness events.

**Strategy B: Trust gate integration (automatic)**

Extraction triggers at the trust gate. After human feedback (approve/edit/reject) is recorded, the feedback-recorder already creates a correction memory. A knowledge extraction step could run as a follow-up: if the feedback was an edit or rejection, spawn extraction subagents to capture the fuller context (root cause, failed approaches, prevention).

This integrates with the existing pipeline — `feedback-recorder` → `trust-evaluator` → `knowledge-extractor` — all as harness handlers or system agent runs.

**Provenance:** Ditto's existing feedback-recorder → trust-evaluator pipeline. CE's compound is a similar post-action step, just manually triggered.

**Strategy C: Periodic batch extraction (scheduled)**

Run extraction as a scheduled meta-process (like the improvement-scanner). Periodically scan recent runs for unextracted knowledge, batch extract, deduplicate against existing knowledge.

**Pro:** Doesn't add latency to the feedback loop.
**Con:** Knowledge isn't available until the next batch run. Loses the "just-in-time" property.

### Significance threshold

Not every run produces extractable knowledge. CE's advisory preconditions are useful:
- The problem should be **solved** (not in-progress)
- The solution should be **verified working** (approved, not rejected again)
- The work should be **non-trivial** — simple approvals with no corrections don't produce knowledge

For Ditto, this maps to:
- **Edit severity ≥ moderate** (the edit was substantive, not cosmetic)
- **Rejection occurred** (something was fundamentally wrong)
- **Retry was needed** (the first attempt failed, debugging happened)
- **New process, early runs** (first 5-10 runs produce the most learning regardless of edit severity)

---

## Question 7: How Does This Intersect with Ditto's Homeostatic Quality Model?

### Three related but distinct knowledge types

| Knowledge type | What it captures | Who consumes it | Where it lives (current) | Relationship to compounding |
|---------------|------------------|----------------|--------------------------|---------------------------|
| **Correction patterns** (L5, existing) | What the human changed in the output | Agents at execution time via memory injection | `memories` table, type=`correction` | Foundation — corrections are the raw signal that extraction processes |
| **Failure patterns** (Insight-100) | What tends to go wrong, cross-output and cross-process | Orchestrator's critical evaluation function | Proposed: `memories` table, category=`failure_pattern` | Subset of solution knowledge — the "what went wrong" half |
| **Solution knowledge** (this research) | Full problem-solution cycle: diagnosis, failed approaches, root cause, fix, prevention | Agents at plan time and execution time | Proposed: `memories` table, type=`solution` | Superset — includes failure patterns plus solution, context, prevention |

### The relationship to approach/avoidance gradients (Insight-101)

Insight-101 describes incentive gradients delivered through context injection:
- **Approach signals:** "The last 5 approved outputs all included evidence citations"
- **Avoidance signals:** "The last 3 bathroom quotes were corrected upward — be cautious"

Solution knowledge enriches both poles:
- **Approach:** "When quoting bathroom jobs, we learned that estimating labour at 1.5x base rate produces consistently approved quotes. Here's the solution pattern."
- **Avoidance:** "Previous bathroom quotes were systematically underestimated. Root cause: standard labour rates don't account for tight access in bathroom work. Prevention: always add 50% to base labour for bathroom-specific jobs."

The approach signal provides a template for success. The avoidance signal provides a template for what to watch out for. Together they form a more complete picture than either alone.

### The relationship to the three-disposition model (Insight-100)

| Disposition | How solution knowledge feeds it |
|-------------|-------------------------------|
| **Generative (Self)** | Solution patterns provide proven templates for new work. The Self can suggest: "We have a proven approach for this type of work — here's what worked last time." |
| **Critical (Evaluator)** | Failed approaches and root causes provide the critical lens. "This looks similar to a problem we hit before. The first approach failed because of X — verify that X doesn't apply here." |
| **Strategic (Orchestrator)** | Prevention strategies inform process-level decisions. "This class of problem has a known prevention strategy. Should we update the process definition to include a pre-check?" |

### The compound loop closes the homeostatic cycle

Without explicit extraction:
```
Correction → memory ("Edit: 3 words removed, 5 added") → injected at next run → agent sees diff summary → ??? (no actionable pattern)
```

With explicit extraction:
```
Correction → extraction step → solution memory ("Bathroom labour underestimated. Root cause: tight access. Fix: 1.5x base rate. Prevention: add pre-check for access conditions.") → injected at next run → agent knows exactly what to do differently
```

The homeostatic model's quality variables (output quality, confidence calibration, risk flagging) all benefit from richer context. An agent that knows "this specific scenario has been corrected 4 times and here's the root cause" is better calibrated than one that knows "Edit (minor): 3 words removed, 5 added."

---

## Recommendation for Architect

### Priority 1: Add `solution` memory type with structured metadata

**Effort:** Low. Add `"solution"` to `memoryTypeValues`. Add a `metadata` JSON column to the memories table (or use the existing pattern of storing structured data in the `content` field). Define a constrained category enum inspired by CE's schema.yaml but adapted to Ditto's domain breadth (not just coding errors — business process knowledge too).

**What this unblocks:** Every subsequent step (extraction, retrieval, lifecycle) depends on having a place to store solution knowledge in the existing memory infrastructure.

### Priority 2: Design the knowledge extraction meta-process

**Model: 3 parallel extractors (CE pattern, corrected from article's claim of 5)**
1. Context Analyzer — classify the problem, extract category/tags
2. Solution Extractor — produce structured solution content (root cause, failed approaches, fix, prevention)
3. Related Knowledge Finder — search existing solution memories for deduplication

**Trigger: harness event integration (Strategy A from Question 6)**
- Post-run, when corrections/rejections/retries occurred
- Significance threshold: edit severity ≥ moderate, or rejection, or retry, or new process early runs
- Trust-tier-aware: more extraction for supervised/critical, less for autonomous

**This is a meta-process** (Insight-042, Insight-054) — it should be defined as a process YAML, go through the harness, and earn trust in its own extraction quality.

### Priority 3: Category-filtered retrieval with separate budget

**Model: Option C from Question 5 (separate budget) + Option A (category filtering)**
- Allocate a separate token budget for solution knowledge (like intra-run context's 1500 tokens)
- Filter solution memories by matching category/tags against current task context
- Sort by salience within the filtered set

**Why separate budget:** Solution knowledge is strategic (plan-time information). Corrections are operational (execution-time information). They serve different cognitive functions and shouldn't compete for the same token budget.

### Priority 4: Knowledge lifecycle management

**Model: Confidence decay + active pruning (Insight-022 + CE's compound-refresh)**
- Solution memories start at confidence 0.5 (higher than corrections at 0.3 — extraction is deliberate)
- Reinforced when the same pattern is extracted again (same dedup logic as correction memories)
- Confidence decays if the solution hasn't been retrieved/referenced in N runs (configurable per process)
- Superseded when a newer solution for the same category + tags is extracted
- Pruned (set active=false) when confidence drops below threshold

**CE's compound-refresh pattern:** CE has a separate `ce:compound-refresh` skill for maintenance — validating existing docs, marking stale ones, consolidating duplicates. This maps to a periodic meta-process in Ditto.

### Deferred (not recommended for first iteration)

- **Vector/embedding-based retrieval** — SQL queries on indexed metadata are sufficient at Ditto's current scale (single user, 5-20 processes). AutoGPT's experience confirms this: they removed vector DBs because brute-force search on small datasets is faster than the overhead of embedding infrastructure.
- **Cross-process solution sharing** — Start with process-scoped solution memories. Agent-scoped solutions (cross-process) can be added when the extraction meta-process proves reliable within a single process.
- **Full-document storage (Option C)** — Start with compact memory rows (Option A). If users need deep-dive access, add file output later. Claude Code's data shows compact memories (under 200 lines) have 92% application rate.

---

## Provenance Summary

| Pattern | Source | Level | Where used |
|---------|--------|-------|------------|
| 3 parallel extractors (context, solution, related) | CE `ce-compound/SKILL.md` | pattern | Extraction meta-process design |
| Schema-constrained frontmatter | CE `references/schema.yaml` | pattern | Solution memory metadata categories |
| Grep-based deduplication on frontmatter | CE `ce-compound/SKILL.md` (Related Docs Finder) | pattern | SQL-based dedup on memory metadata |
| Verbal reflection in episodic buffer | Reflexion (Shinn et al., NeurIPS 2023) | pattern | Validation that context injection works for agent learning |
| Degeneration-of-thought caveat | Reflexion EMNLP 2025 + MAR | pattern | Constraint: extraction must be externally grounded |
| Progress file as session state | Anthropic harness blog (Nov 2025) | pattern | Contrast: linear continuity vs accumulative compounding |
| Trigger-based knowledge retrieval | Devin Knowledge | pattern | Category-filtered retrieval at context assembly |
| Static injection + on-demand reads | Claude Code memory | pattern | Two-stage retrieval (summaries injected, details on-demand) |
| Intra-run context separate budget | Ditto `memory-assembly.ts` (Brief 027) | adopt | Separate budget for solution knowledge |
| Failure pattern tagging | Insight-100 (ADR-022) | adopt | Solution memories extend the same tagged-category approach |
| Model self-summarization inadequacy | Cognition (Devin Sonnet 4.5 rebuild) | pattern | Validation: structured extraction outperforms model-generated summaries |
| Vector DB removal for small-scale | AutoGPT (vector memory revamp) | pattern | Deferral of embedding infrastructure |

Reference docs checked: `docs/landscape.md` — no drift found. CE is not currently evaluated in landscape.md; Reflexion is not evaluated. Both are covered in this research report and the companion `cross-session-memory-implementations.md`. Landscape.md entries for Mem0, OpenClaw, and Claude Code are consistent with research findings.
