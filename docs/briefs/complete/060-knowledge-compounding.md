# Brief: Knowledge Compounding — Explicit Extraction for Learning Infrastructure

**Date:** 2026-03-30
**Status:** draft
**Depends on:** none (all prerequisite infrastructure exists: memories table, memory assembly, feedback recorder, harness events, system agent framework)
**Unlocks:** Richer agent context → improved output quality → faster trust earning; foundation for knowledge lifecycle meta-process (Insight-042)

## Goal

- **Roadmap phase:** Phase 5 extension (Learning Layer — self-healing, feedback capture) + Phase 9 prerequisite (improvement-scanner feeds)
- **Capabilities:** (1) `solution` memory type with structured metadata, (2) knowledge extraction process triggered by corrections, (3) solution-aware retrieval at context assembly, (4) knowledge lifecycle management

## Context

Brief 059's research (docs/research/knowledge-compounding-patterns.md) identified a concrete gap: Ditto's L5 captures feedback implicitly (edit diffs → `"Edit (minor): 3 words removed, 5 added"`), but misses six categories of higher-order knowledge: root cause, failed approaches, prevention strategies, generalizable solution patterns, problem classification, and cross-references. CE's compound step proves this is solvable with 3 parallel LLM extractors and structured storage. Devin's engineering confirms structured extraction outperforms model self-summarization. Reflexion's caveat confirms extraction must be grounded in external evidence, not self-reflection.

Ditto already has the architectural pieces — three memory scopes, salience-sorted assembly, the feedback-recorder → trust-evaluator pipeline, harness event emitter, system agent framework. The gap is an explicit extraction step and a place to store what it produces.

## Objective

After a run completes with significant corrections, the harness automatically extracts structured solution knowledge (root cause, what failed, what worked, prevention) and stores it as a `solution` memory. On the next run, memory assembly surfaces relevant solution knowledge in a separate budget so the agent knows what was learned — not just that something was edited.

## Non-Goals

- **Vector/embedding-based retrieval** — SQL queries on metadata fields at current scale (single user, 5-20 processes). Defer per AutoGPT's experience.
- **Cross-process solution sharing** — Start process-scoped. Agent-scoped cross-process memories are a future extension when single-process extraction is proven.
- **Full-document storage** — Compact memory rows only (Option A from research). Claude Code data: <200 lines = 92% application rate.
- **UI for knowledge browsing** — L6 concern, deferred. Solution memories surface through context assembly and the Self's narrative, not a dedicated screen.
- **LLM-based memory reconciliation (Mem0-style)** — ADR-003 Phase 3, not this brief. This brief does deduplication via metadata matching, not LLM-based ADD/UPDATE/DELETE.
- **Knowledge refresh/maintenance meta-process** — CE's `compound-refresh` maps to a future periodic process. This brief covers extraction, not maintenance.

## Inputs

1. `docs/research/knowledge-compounding-patterns.md` — the primary research report (7 questions answered)
2. `docs/research/cross-session-memory-implementations.md` — companion survey
3. `docs/architecture.md` L2 (memory model, agent harness assembly), L5 (Learning Layer)
4. `docs/adrs/003-memory-architecture.md` — memory schema, phased implementation
5. `docs/adrs/008-system-agents-and-process-templates.md` — system agent framework
6. `docs/adrs/015-meta-process-architecture.md` — Feedback & Evolution meta-process
7. `docs/insights/042-knowledge-management-is-a-meta-process.md` — knowledge lifecycle direction
8. `docs/insights/100-inner-critic-as-system-level-entity.md` — failure pattern accumulation
9. `docs/insights/101-homeostatic-quality-model.md` — approach/avoidance gradients fed by solution knowledge
10. `docs/insights/022-knowledge-needs-active-pruning.md` — lifecycle: not just accumulation
11. `src/engine/harness-handlers/feedback-recorder.ts` — current feedback-to-memory bridge
12. `src/engine/harness-handlers/memory-assembly.ts` — current memory retrieval and injection
13. `src/db/schema.ts` — current memory schema (memoryTypeValues, memoryScopeTypeValues)

## Constraints

- **Must extend, not replace, existing memory infrastructure.** The `memories` table, three scopes, salience sorting, and token-budgeted assembly stay. Solution memories are a new type within the existing model.
- **Must not break implicit feedback.** Explicit extraction complements L5's implicit signals. Both coexist. Trust computation remains based exclusively on explicit human feedback (approve/edit/reject).
- **Extraction must be externally grounded** (Reflexion caveat). The extraction prompt must reference concrete evidence: the user's correction diff, the original output, the step execution log — not "reflect on what happened."
- **Must respect Insight-022 (active pruning).** Solution memories have a lifecycle. They are not permanent.
- **Privacy by design.** Solution memories are process-scoped. No cross-process leakage without explicit agent-scoped promotion.
- **Extraction is a system agent run**, not a hardcoded handler. It goes through the harness, earns trust, can be corrected. Consistent with ADR-008 and ADR-015 (Feedback & Evolution meta-process).
- **Cost-aware.** Extraction uses an LLM call per triggering event. Must not fire on every clean approval. Significance threshold required.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| 3 parallel extractors (context, solution, related) | CE `plugins/compound-engineering/skills/ce-compound/SKILL.md` | pattern | Proven structure: separate concerns, run in parallel, assemble results |
| Schema-constrained categories | CE `references/schema.yaml` | pattern | Controlled vocabulary prevents classification drift |
| Deduplication via metadata matching | CE Related Docs Finder (grep on frontmatter) | pattern | Translates to SQL WHERE on memory metadata — no vectors needed |
| Separate token budget for solution knowledge | Ditto `memory-assembly.ts` (Brief 027 intra-run context) | adopt | Proven pattern for budget separation within same handler |
| Failure pattern tagging in existing memory scopes | Insight-100 (failure pattern accumulation) + ADR-022 §4.2 (quality-variable registry, approach/avoidance gradients that consume tagged patterns) | adopt | Extends the same approach: tagged category within existing scopes |
| Trigger on correction events | CE auto-detect + Reflexion failure-triggered + Ditto harness events | pattern | Combines: harness-native events + significance threshold from CE |
| Extraction grounded in evidence, not self-reflection | Reflexion EMNLP 2025 caveat + Cognition (Devin rebuild) | pattern | Constraint: pass concrete diffs/logs to extractor, not "reflect" |
| Confidence lifecycle (decay, supersession, pruning) | Insight-022 + CE `ce:compound-refresh` + ADR-003 confidence model | pattern | Knowledge has a lifecycle; accumulation without pruning is noise |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: add `"solution"` to `memoryTypeValues`; add `metadata` JSON column to memories table (nullable, for structured solution fields: category, tags, rootCause, prevention, relatedMemoryIds) |
| `src/engine/harness-handlers/memory-assembly.ts` | Modify: add separate solution knowledge budget (1000 tokens); query type=`solution` memories filtered by category/tags from step context; inject in dedicated `## Prior Solution Knowledge` section |
| `processes/knowledge-extraction.yaml` | Create: system process definition with 3 parallel steps (context-analyzer, solution-extractor, related-finder) + assembly step |
| `src/engine/system-agents/knowledge-extractor.ts` | Create: system agent entry point. Triggered by `recordEditFeedback()` and `recordRejectionFeedback()` when significance threshold met. Calls `startSystemAgentRun("knowledge-extraction", ...)` |
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify: after recording edit/rejection feedback, check significance threshold; if met, trigger knowledge extraction system agent run |
| `docs/architecture.md` | Modify: update L5 Learning Layer to describe explicit knowledge extraction as complement to implicit feedback; add `knowledge-extractor` to system agent table; add solution knowledge to L2 memory model description |
| `docs/adrs/003-memory-architecture.md` | Modify: add `"solution"` to type enum description; add `metadata` column; note knowledge extraction as the first consumer of Phase 3's richer extraction pipeline |

## Design

### 1. Solution Memory Schema

Add to `memoryTypeValues`: `"solution"`.

Add to memories table: `metadata` column (JSON, nullable). For solution memories, the metadata contains:

```typescript
interface SolutionMetadata {
  category: string;         // Constrained enum: see category list below
  tags: string[];           // Free-form, lowercase, hyphen-separated. Max 8.
  rootCause?: string;       // What caused the problem (when applicable)
  prevention?: string;      // How to prevent recurrence
  failedApproaches?: string; // What didn't work (when applicable)
  severity?: "low" | "moderate" | "high" | "critical";
  sourceRunId: string;      // Which process run produced this knowledge
  relatedMemoryIds?: string[]; // Cross-references to related solution memories
}
```

**Category values** (adapted from CE's 13 coding categories to Ditto's domain breadth):

| Category | Domain | Example |
|----------|--------|---------|
| `quality_correction` | Any | Output didn't meet quality criteria — corrected |
| `data_accuracy` | Any | Wrong data, missing data, stale data |
| `format_structure` | Any | Layout, template, formatting issues |
| `calculation_logic` | Numeric | Pricing errors, wrong formulas, logic bugs |
| `process_gap` | Meta | The process itself is missing a step or has a wrong assumption |

Start with 5 broad categories. The list is extensible — new categories (e.g., `tone_voice`, `compliance_regulatory`, `timing_scheduling`, `integration_data_flow`, `workflow_optimization`) can be added as the system encounters new problem types validated by real extraction data. The category list is not hardcoded in schema; it's validated at extraction time.

### 2. Knowledge Extraction Process

A system process (`processes/knowledge-extraction.yaml`) with `system: true`:

```
Process: knowledge-extraction
├── system: true
├── Inputs:
│   ├── processRunId: the run that triggered extraction
│   ├── feedbackId: the edit/rejection that met threshold
│   ├── originalOutput: what the agent produced
│   ├── editedOutput: what the human corrected it to (edits only)
│   ├── diff: the structured diff from feedback-recorder
│   ├── comment: human's rejection/edit comment (if any)
│   └── existingSolutions: query of existing solution memories for this process
├── Steps:
│   ├── parallel_group: extract
│   │   ├── 1. context-analyzer (ai-agent, read-only)
│   │   │   → Classify problem: category, tags, severity, track (bug/knowledge)
│   │   │   → Grounded in: diff, original output, step definition, process definition
│   │   ├── 2. solution-extractor (ai-agent, read-only)
│   │   │   → Extract: root cause, failed approaches, solution, prevention
│   │   │   → All fields optional — extractor populates what's relevant
│   │   │   → Grounded in: diff, correction comment, original vs edited output
│   │   └── 3. related-finder (script)
│   │       → Query memories WHERE type='solution' AND scopeId=processId
│   │       → Match on category + tags overlap (SQL, not LLM)
│   │       → Return overlap assessment: high/moderate/low/none
│   └── 4. assemble (ai-agent, read-write)
│       → Merge outputs from all 3 extractors
│       → If high overlap: UPDATE existing memory (increment reinforcement, enrich content)
│       → If moderate overlap: CREATE new memory, add relatedMemoryIds cross-reference
│       → If low/none: CREATE new memory
│       → Write to memories table via tool
├── Quality Criteria:
│   ├── Extraction must reference specific evidence from the diff (not vague "the output was wrong")
│   ├── Category must be from the constrained list
│   ├── Tags must be lowercase, hyphen-separated, max 8
│   └── Prevention must be actionable (a check, not a platitude)
└── Trust Level: supervised (human reviews extracted knowledge until quality proven)
```

**Key design decisions:**

- **related-finder is a script, not an LLM.** Deduplication is SQL-based (metadata matching), not LLM-based. This is cheaper, deterministic, and avoids the degeneration-of-thought risk. CE uses grep; Ditto uses SQL on the same fields.
- **Extraction is grounded in evidence.** Each extractor receives the concrete diff, original output, and correction comment — not "reflect on what happened." This addresses the Reflexion caveat.
- **Assembly decides create vs update.** High overlap → reinforce existing memory. This prevents unbounded accumulation (Insight-022).
- **The process starts supervised.** The human reviews extracted knowledge in the Review Queue. Once extraction quality is proven, it can earn spot-checked trust. Knowledge extraction that produces noisy or wrong memories gets corrected — the harness works on itself.

### 3. Significance Threshold (Trigger)

Extraction does not fire on every feedback event. It fires when the feedback meets at least one significance condition:

| Condition | Why significant |
|-----------|----------------|
| `editSeverity ≥ "moderate"` | Substantive correction, not cosmetic |
| `feedback.type === "reject"` | Something was fundamentally wrong |
| Step had `retry_on_failure` triggered | A failure occurred and was worked around |
| Process is in first 10 completed runs | Early runs produce the most learning |
| Correction pattern count reaches 3 | Existing 3+ pattern detection already fires — extract deeper knowledge |

**Trust-tier-aware scaling:**

| Trust tier | Extraction behavior |
|------------|-------------------|
| Supervised | Extract after every significant correction (high learning density) |
| Spot-checked | Extract after sampled significant corrections (~50%) |
| Autonomous | Extract only on degradation events (trust downgrade, correction spike) |
| Critical | Extract after every run with any correction (compliance = high-value knowledge) |

The significance check happens in `feedback-recorder.ts` after recording the feedback. If threshold met, it calls `startSystemAgentRun("knowledge-extraction", { processRunId, feedbackId, ... })`.

### 4. Solution-Aware Retrieval

Modify `memory-assembly.ts` to add a dedicated solution knowledge section:

**Separate budget:** 1000 tokens (4000 chars) for solution memories. This is in addition to the existing 2000-token budget for corrections/preferences/context/skills and the 1500-token budget for intra-run context. Solution knowledge doesn't compete with operational corrections.

**Category-filtered retrieval:**
1. Extract category signals from current context: process definition name, step name, work item description
2. Query: `SELECT * FROM memories WHERE scopeType='process' AND scopeId=? AND type='solution' AND active=true`
3. Filter by metadata.category and metadata.tags matching extracted signals (JSON field queries)
4. Sort by salience (confidence × log(reinforcementCount + 1))
5. Render into `## Prior Solution Knowledge` section, injected after the existing memory section

**Rendering format:**
```
## Prior Solution Knowledge
- [quality_correction] Bathroom labour estimates consistently underestimated. Root cause: standard rates don't account for tight access. Fix: 1.5x base rate for bathroom-specific work. Prevention: check access conditions before estimating. (confidence: 0.7, reinforced: 3x)
```

### 5. Knowledge Lifecycle

Solution memories follow the same active/inactive lifecycle as other memories, with additions:

| Event | Action |
|-------|--------|
| Created | confidence: 0.5 (higher than corrections at 0.3 — deliberate extraction) |
| Same pattern extracted again | reinforcementCount++, confidence grows (same formula as corrections) |
| Newer solution for same category + similar tags | Older memory superseded: active=false, newer memory gets relatedMemoryIds reference |
| N runs without retrieval/reference (configurable, default: 50) | Confidence decays by 0.1 per decay check |
| Confidence drops below 0.2 | active=false (pruned) |
| Human edits the extracted knowledge | Updated content, confidence reset to 0.5, activity logged |

**Decay is checked during the trust-evaluator system agent run** (already periodic). No new scheduled process needed.

## User Experience

- **Jobs affected:** Orient (solution knowledge enriches Daily Brief narratives), Review (extracted knowledge appears in Review Queue for supervised extraction runs)
- **Primitives involved:** Review Queue (for extracted knowledge approval), Activity Feed (extraction events logged)
- **Process-owner perspective:** Rob sees: "Ditto learned that bathroom labour estimates need a 1.5x multiplier — this is now factored into future quotes." He didn't teach a rule; the system learned from his corrections. This directly serves Problem 2: "AI reinvents its approach every time."
- **Interaction states:** Extraction runs appear as system process runs in status. Extracted knowledge appears as reviewable output in supervised mode. Once spot-checked, extraction runs appear in digest only.
- **Designer input:** Not invoked — solution knowledge surfaces through existing primitives (Review Queue, Activity Feed, memory injection into agent context). No new UI needed.

## Acceptance Criteria

1. [ ] `"solution"` exists in `memoryTypeValues` enum
2. [ ] `metadata` JSON column exists on `memories` table (nullable)
3. [ ] `processes/knowledge-extraction.yaml` exists with system: true, 3 parallel extractors + assembly step
4. [ ] `knowledge-extractor.ts` system agent triggers via `startSystemAgentRun()` from feedback-recorder
5. [ ] Significance threshold implemented: extraction fires only when editSeverity ≥ moderate, OR rejection, OR retry, OR first 10 runs, OR correction pattern count ≥ 3
6. [ ] Trust-tier-aware scaling: supervised = every significant correction; spot-checked = sampled; autonomous = degradation only; critical = every correction
7. [ ] related-finder step uses SQL deduplication (metadata.category + metadata.tags), not LLM
8. [ ] High overlap → updates existing memory (reinforcement); moderate → creates with cross-reference; low → creates new
9. [ ] `memory-assembly.ts` has separate 1000-token budget for solution memories
10. [ ] Solution memories rendered in dedicated `## Prior Solution Knowledge` section
11. [ ] Solution memories start at confidence 0.5
12. [ ] Confidence decay implemented: decays by 0.1 after 50 runs without retrieval
13. [ ] Supersession: newer solution for same category deactivates older one
14. [ ] `architecture.md` updated: L5 describes explicit extraction; `knowledge-extractor` in system agent table; L2 memory model includes solution type
15. [ ] `ADR-003` updated: solution type added, metadata column documented

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Does the design respect the existing memory infrastructure (ADR-003)? Is the extraction process consistent with ADR-008 system agent patterns? Does significance threshold prevent cost explosion? Is the lifecycle addressing Insight-022? Does category list make sense for non-coding personas (Rob, Lisa, Nadia)?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Sync processes — knowledge-extraction.yaml should load
pnpm cli sync

# 2. Run a process, edit the output with a moderate correction
pnpm cli start --process=quoting --input="Quote for bathroom renovation"
# ... process runs, produces output ...
pnpm cli edit <outputId> --text="Corrected: labour estimate increased from 8 to 12 hours (tight bathroom access)"

# 3. Verify extraction triggered
pnpm cli status
# Should show a knowledge-extraction system process run (supervised → in review queue)

# 4. Approve the extracted knowledge
pnpm cli approve <extractionOutputId>

# 5. Verify solution memory created
sqlite3 data/ditto.db "SELECT content, metadata FROM memories WHERE type='solution' LIMIT 5"
# Should show structured solution with category, tags, rootCause, prevention

# 6. Run the same process again — verify solution knowledge injected
pnpm cli start --process=quoting --input="Quote for another bathroom job"
# Agent context should include: "## Prior Solution Knowledge: Bathroom labour estimates consistently underestimated..."
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — add knowledge extraction to Phase 5 Learning Layer capabilities
3. Update `docs/adrs/003-memory-architecture.md` — document solution type, metadata column, extraction trigger
4. Update `docs/adrs/008-system-agents-and-process-templates.md` — add `knowledge-extractor` as 11th system agent role
5. Update `docs/architecture.md` — L5 explicit extraction, L2 solution memory, knowledge-extractor system agent
6. Cross-reference Insight-042, Insight-115
7. Phase retrospective: what worked, what surprised, what to change
