# Research: Knowledge Management for AI-Assisted Development at Scale

**Date:** 2026-03-20
**Researcher:** Dev Researcher (Claude Code)
**Status:** active
**Research question:** How should a growing project knowledge base (insights, research reports, ADRs, state docs, roadmaps) be managed for AI-assisted development? Is the current flat-file approach scaling, and what patterns exist for managing institutional knowledge within AI context constraints?

---

## Why This Matters for Agent OS

Agent OS's development process has accumulated significant institutional knowledge:

| Artifact | Count | Lines | Trend |
|----------|-------|-------|-------|
| `docs/state.md` | 1 | 601 | Growing every session |
| `docs/roadmap.md` | 1 | 543 | Growing every session |
| `docs/architecture.md` | 1 | 965 | Growing per ADR |
| `docs/human-layer.md` | 1 | 935 | Stable |
| `docs/landscape.md` | 1 | 360 | Growing per research |
| Active insights | 27 | ~30 each | Growing |
| Archived insights | 15 | — | Growing |
| Research reports | 26 | varies | Never pruned |
| ADRs | 13 | varies | Growing |
| Briefs (active + complete) | 16 | varies | Growing |

Every new session reads `state.md` (601 lines) + `roadmap.md` (543 lines) = **1,144 lines of context** before any work begins. Most of `state.md` is history — Phase 2 retrospectives, completed research tables, resolved decisions. A builder working on Brief 016a doesn't need Phase 2 details.

Three existing insights identified this problem:
- **Insight-021**: Artifacts need lifecycle organization
- **Insight-022**: Knowledge needs active pruning
- **Insight-023**: Research knowledge decays without persistence

These are partially implemented (briefs have `complete/`, insights have `archived/`) but the biggest offenders — state.md as an ever-growing monolith and research reports that never expire — haven't been addressed.

---

## Sources Examined

### Internal Sources (Agent OS)

| Source | Why included |
|--------|-------------|
| `docs/research/context-and-token-efficiency.md` | Existing research on product-level context management — patterns that apply at meta-level |
| `docs/adrs/012-context-cost-model-architecture.md` | Stable prefix + variable suffix, context budgeting — same principles apply to project docs |
| `docs/adrs/003-memory-architecture.md` | Memory salience scoring, lifecycle, reconciliation — same patterns for project knowledge |
| `docs/insights/021-*`, `022-*`, `023-*` | Prior identification of this problem |
| Claude Code MEMORY.md system | Already in use — 200-line index + topic files |

### External Sources

| Source | Type | Key contribution |
|--------|------|-----------------|
| **Anthropic** — "Effective Context Engineering for AI Agents" | Guide | Just-in-time context, compaction, structured note-taking, sub-agent context isolation |
| **Martin Fowler / ThoughtWorks** — "Context Engineering for Coding Agents" | Article | Build context up gradually, not front-loaded; indiscriminate loading degrades effectiveness |
| **Factory.ai** — "The Context Window Problem" + "Evaluating Compression" | Research | Anchored iterative summarisation, compression ratio is wrong metric, incremental updates beat regeneration |
| **Jason Liu** — "Context Engineering: Compaction" | Research | Compaction as momentum preservation; timing matters; specialised compaction prompts |
| **Manus** — "Context Engineering Lessons" | Case study | File system as externalised memory; todo.md rewriting as attention manipulation; restorable compression |
| **OpenClaw** — workspace architecture (SOUL.md, HEARTBEAT.md, memory/) | Implementation | Three-tier context: hot (always loaded, ~150 tokens), warm (task-relevant), cold (on-demand) |
| **Platformatic** — CLAUDE.md for 36-package monorepo | Implementation | Real-world large-project CLAUDE.md pattern |
| **Claude Code** — `.claude/rules/` with glob-scoped YAML frontmatter | Feature | Conditional context loading; 45% noise reduction vs monolithic files |
| **Cursor** — `.cursor/rules/` with `.mdc` files | Feature | One concern per file; team rules for org-wide policies |
| **Log4brains** — ADR management tooling | Tool | Static site from ADRs; superseded chains enforced; immutable body + mutable status |
| **Spotify/Backstage** — ADR management at scale | Implementation | Numbered ADRs, superseded chains, plugin-rendered index with search |
| **GOV.UK** — cross-government ADR framework | Framework | Four-level decision hierarchy; superseded chain pattern |
| **Keep a Changelog** (keepachangelog.com) | Convention | Separation of "what changed" from "what is true now" |
| **Confluence Content Lifecycle** (Midori plugin) | Tool | Staleness thresholds, notification ladders, auto-archive |
| **Nonaka-Takeuchi SECI Model** | Theory | Knowledge creation spiral: tacit↔explicit conversion modes |
| **Wikipedia Article Lifecycle** | Implementation | Quality ladder + deletion path; staleness measured via edit frequency + view count |
| **Neal Ford / ThoughtWorks** — Architectural Fitness Functions | Pattern | Automated validation of architectural properties, applied to documentation |
| **Gojko Adzic / Cyrille Martraire** — Living Documentation | Pattern | Documentation linked to executable artifacts decays slower |
| **SDD (Spec-Driven Development)** | Pattern | Decision+learning persistence into archive phase for future retrieval |
| **render-claude-context** | Tool | Walks directory tree collecting all CLAUDE.md files; resolves `@path/to/file` imports |
| **Claude-Mem** | Tool | Automated capture, AI compression, SQLite + vector storage, 10× token savings |

---

## 1. The Concentric Rings Pattern

The strongest cross-cutting pattern from this research: documentation for AI-assisted development should be structured as **concentric rings of detail**, not a flat collection of files.

### 1.1 The Four Rings

| Ring | Loading | Purpose | Size constraint | Update trigger |
|------|---------|---------|-----------------|----------------|
| **Index** (always loaded) | Every session | What exists, where it lives, current phase | <200 lines | Each session |
| **Current State** (loaded early) | Every session | What is true now — not history | <100 lines | Each session |
| **Working Set** (loaded for task) | When relevant | Active brief, relevant ADRs, active insights | Varies | Per task |
| **Archive** (never loaded, searchable) | On explicit demand | Completed work, retrospectives, historical decisions, superseded insights | Unlimited | When work completes |

### 1.2 External Implementations

**OpenClaw's three-tier model:**
- **Hot tier**: SOUL.md + HEARTBEAT.md + current-task.json (~650 tokens, always loaded)
- **Warm tier**: TOOLS.md + MEMORY.md (loaded when needed)
- **Cold tier**: memory/YYYY-MM-DD.md + knowledge base files (retrieved via search)
- **Result**: Daily token consumption reduced from 432,000 to 104,400 (76% reduction)

**Source**: OpenClaw workspace architecture, `capodieci.medium.com`

**Claude Code's two-tier memory:**
- **MEMORY.md** (≤200 lines, always loaded) — acts as table of contents
- **Topic files** (loaded on demand) — detailed memories read when agent determines relevance
- **Result**: Memory context scales with relevance, not volume

**Source**: Claude Code documentation, `code.claude.com/docs/en/memory`

**Manus's externalised memory:**
- **todo.md** (rewritten each step) — current state, always in attention
- **File system** — accumulated history, retrieved on demand
- **Key insight**: Rewriting todo.md at end of context is deliberate attention manipulation — objectives stay in the model's high-attention zone

**Source**: `manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus`

### 1.3 Claude Code's Hierarchical Context System

Claude Code already implements a hierarchy, but most projects don't exploit it fully:

| Layer | File/location | Loading behaviour | Hard limit |
|-------|--------------|-------------------|------------|
| 1. `CLAUDE.md` (root) | Project root | Always loaded | No hard limit (recommended <200 lines) |
| 2. `CLAUDE.md` (subdirectory) | Per-directory | Loaded only when working in that directory | Same |
| 3. `.claude/rules/*.md` | Glob-scoped with YAML frontmatter | Loaded only when touching matching files | Per-file |
| 4. `MEMORY.md` | `~/.claude/projects/*/memory/` | Index always loaded (200 lines); topic files on demand | 200-line index |
| 5. Agent definitions | `.claude/agents/*.yml` | Loaded when agent spawned | Per-agent |

**Key finding**: `.claude/rules/` with glob-scoped YAML frontmatter (added v2.0.64) reduces contextual noise by ~45% compared to monolithic files. Example:

```yaml
---
description: Builder role conventions
paths:
  - src/**/*.ts
---
- Run `pnpm test` after changes
- Include smoke test output in handoff
```

Rules with `paths` only load when Claude works in matching directories. Rules without `paths` always load (like CLAUDE.md content).

**Source**: Claude Code docs, `claude-blog.setec.rs/blog/claude-code-rules-directory`

---

## 2. State Splitting: Snapshot vs. Delta

### 2.1 The Core Distinction

Every knowledge management system separates two concerns:

| Concern | Question answered | Update pattern | Growth |
|---------|-------------------|----------------|--------|
| **Current state (snapshot)** | What is true now? | Overwritten each session | Bounded |
| **History (delta/changelog)** | What changed and when? | Appended each session | Unbounded |

Agent OS's `state.md` conflates both. It contains "What's Working" (snapshot) and "Documenter Retrospective (2026-03-20 — Phase 4a Review Session)" (history). The history sections are valuable for understanding how we got here, but irrelevant for most tasks.

### 2.2 External Implementations

**Keep a Changelog convention:**
- CHANGELOG.md is the human-readable history (reverse chronological)
- README/docs describe current state
- Deliberately separate documents with separate audiences

**Source**: `keepachangelog.com`

**OpenClaw HEARTBEAT.md:**
- Pure current working state (~150 tokens)
- Separate from `memory/YYYY-MM-DD.md` date-stamped history files
- Heartbeat always loaded; history files are cold storage

**Source**: OpenClaw workspace architecture

**Manus todo.md:**
- Current state rewritten on each step (not appended)
- File system accumulates history
- Key insight: The rewrite ensures the current state is always compact and always in the model's attention

**Source**: Manus context engineering blog

### 2.3 Current State of Agent OS state.md

A rough breakdown of the 601-line file:

| Section | Lines (approx) | Type | Ring |
|---------|----------------|------|------|
| Header + What's Working | ~35 | Snapshot | Current State |
| What Needs Rework | ~3 | Snapshot | Current State |
| In Progress | ~10 | Snapshot | Current State |
| What's Blocked | ~3 | Snapshot | Current State |
| Known Debt | ~3 | Snapshot | Current State |
| Decisions Made (table) | ~25 | Snapshot/Reference | Current State |
| Phase 2-3 Design/Build tables | ~100 | History | Archive |
| Designer Role, Integration Arch, Personas | ~80 | History | Archive |
| Mobile/Remote, Process Discovery, System Agents | ~70 | History | Archive |
| Skill Invocation, Runtime Deployment | ~40 | History | Archive |
| Phase 4 design/architecture tables | ~60 | Working Set | Depends on task |
| Composition Sweep, Attention Model, Context/Cost | ~80 | History | Archive |
| Retrospectives (4 separate) | ~100 | History | Archive |
| Next Steps | ~10 | Snapshot | Current State |

**Approximate split:** ~90 lines of current state, ~510 lines of history. That's **85% history** in a document that every session reads in full.

---

## 3. ADR Management at Scale

### 3.1 The Immutable Pattern

Every project with 10+ ADRs follows the same pattern:

| Principle | Implementation |
|-----------|---------------|
| **ADRs are immutable** | Body content never changes after acceptance |
| **Status field is mutable** | `proposed` → `accepted` → `deprecated` → `superseded` |
| **Superseded chain** | Old ADR links to new; new ADR links back |
| **Index is the navigation surface** | Humans and AI don't read all ADRs — they scan the index |

**Spotify/Backstage** (15+ ADRs):
- Stored in `docs/architecture-decisions/`
- Plugin renders index with title, status, date, and search
- Numbers assigned after community review, not during drafting

**Log4brains** (used by AWS ParallelCluster, VMware):
- Statuses: `proposed`, `accepted`, `deprecated`, `superseded`
- Automated static site generation from ADR markdown
- Superseded chain enforced: status changes + bidirectional links
- Key principle: "only the status can change"

**GOV.UK**:
- Four-level decision hierarchy (team, programme, department, cross-government)
- Explicit superseded chains with forward/backward links

**Source**: Backstage docs, Spotify engineering blog, Log4brains GitHub, GOV.UK ADR framework

### 3.2 Agent OS ADR Status

Agent OS has 13 ADRs with no superseded chains and no generated index. The Decisions Made table in `state.md` serves as a manual index. This is adequate at 13 but will degrade. No ADR has been superseded yet, so the chain pattern hasn't been tested.

**Status**: The ADR template already includes `superseded by ADR-{number}` as a status option. The mechanism exists but hasn't been exercised — no ADR has been superseded yet. The gap is operational, not structural: no generated ADR index exists (the Decisions Made table in `state.md` serves as a manual index), and the superseded chain pattern is untested.

---

## 4. Research Report Lifecycle

### 4.1 The Decay Problem

Agent OS has 26 research reports with no lifecycle management. Reports from Phase 2 (e.g., `phase-2-harness-patterns.md`) may contain patterns that were adopted, rejected, or superseded. A new session cannot distinguish current research from stale research without reading each report.

### 4.2 External Patterns

**Confluence Content Lifecycle Management:**
- Staleness thresholds: not updated for 100 days or not viewed for 180 days
- Notification ladder: weekly emails to content owners starting 150 days before archival
- Archived content excluded from search by default
- Key benefit: reducing the search surface reduces noise

**Source**: Midori plugin documentation

**Wikipedia Article Lifecycle:**
- Quality ladder: Stub → Start → C-class → B-class → Good Article → Featured Article
- Deletion path: Proposed deletion (7-day notice) → Articles for Deletion (community discussion) → Speedy deletion
- Staleness signals: edit frequency, link density, reference count

**Source**: Wikipedia article development guidelines

**Living Documentation (Martraire/Adzic):**
- Documentation linked to executable artifacts (tests, schemas) decays slower
- Fitness function applied to docs: verify every public API has a doc entry, every ADR is linked from index
- Key principle: justify maintenance cost — documentation that isn't worth maintaining should be archived or deleted

**Source**: Peter Hilton blog, ThoughtWorks fitness functions

### 4.3 Research Report Categories for Agent OS

Not all 26 reports have the same shelf life:

| Category | Examples | Decay rate | Action pattern |
|----------|----------|------------|---------------|
| **Phase-specific implementation research** | `phase-2-harness-patterns.md`, `phase-4a-research-validation.md` | Fast — absorbed into briefs + code | Archive after phase complete |
| **Cross-cutting pattern research** | `context-and-token-efficiency.md`, `workspace-interaction-model.md` | Slow — informs multiple phases | Keep active, mark consumed sections |
| **Landscape/evaluation research** | `mobile-interfaces-for-agent-platforms.md`, `runtime-composable-ui.md` | Medium — frameworks evolve | Add freshness date; flag after 3 months |
| **Strategic/foundational research** | `process-discovery-from-organizational-data.md`, `human-cognition-models-for-agent-os.md` | Very slow — domain knowledge | Keep active until domain shifts |
| **UX interaction specs** | `phase-3-trust-earning-ux.md`, `phase-4-workspace-cli-ux.md` | Fast — consumed by Designer/Architect | Archive after brief written |

---

## 5. Insight Lifecycle Management

### 5.1 Current State

27 active insights, 15 archived. The Documenter audits insights and archives absorbed ones. This is working — the archived/ subfolder exists and is used. But the active set is still growing, and no insight has been superseded (only absorbed or kept active).

### 5.2 The Nonaka-Takeuchi Spiral

The SECI model maps directly to Agent OS's insight lifecycle:
1. **Socialisation** (tacit → tacit): Human shares a design intuition during conversation
2. **Externalisation** (tacit → explicit): Captured as an insight file in `docs/insights/`
3. **Combination** (explicit → explicit): Absorbed into architecture.md or an ADR
4. **Internalisation** (explicit → tacit): Becomes a shared assumption in CLAUDE.md principles

The gap: Agent OS has stages 2 and 3 (capture and absorption) but doesn't explicitly track stage 4. An insight absorbed into architecture.md is "done" — but if the principle isn't also reflected in CLAUDE.md or the role skill contracts, it may not consistently influence behaviour.

### 5.3 Missing Status: Superseded

The insight template has `active`, `absorbed`, and `superseded` statuses. No insight has been superseded. As the project evolves, earlier insights may be contradicted by later understanding. The mechanism exists but hasn't been exercised.

---

## 6. CLAUDE.md Optimisation Patterns

### 6.1 The 200-Line Guideline

Multiple sources converge on the same recommendation: CLAUDE.md should be 30-100 lines for most projects, with a hard ceiling of ~200 lines. Beyond 200 lines, adherence drops measurably.

Agent OS's CLAUDE.md is currently well-structured (lean instructions, "read when relevant" tiering for design docs). But the documents it points to (`state.md`, `roadmap.md`) are where the bloat lives.

### 6.2 Role-Scoped Rules via `.claude/rules/`

Claude Code's `.claude/rules/` directory with glob-scoped YAML frontmatter enables conditional context:

```yaml
---
description: Reviewer-specific conventions
paths:
  - docs/review-checklist.md
---
- Always verify builder ran smoke test (Insight-038)
- Check security implications (Insight-017)
```

This could replace some of what CLAUDE.md currently says under "Design Documents (read when relevant)" — instead of relying on the AI to decide relevance, rules load automatically based on which files are being touched.

### 6.3 The PromptComposer Pattern

A more general formulation from the research: sections registered with **condition predicates** and **priority values**. At initialisation, predicates are evaluated against the runtime environment, surviving sections are sorted by priority, and joined into the final prompt.

This is the programmatic version of what CLAUDE.md currently does with prose instructions ("read when relevant"). Agent OS's skill commands (`.claude/commands/dev-*.md`) already implement this partially — each role specifies its own required inputs.

**Source**: Tiered context loading article, `earezki.com`

---

## 7. Knowledge Compaction Patterns

### 7.1 Summarise-and-Archive vs Keep-Everything

| Pattern | How it works | Pros | Cons |
|---------|-------------|------|------|
| **Keep everything, index well** | All docs retained; navigation via index/search | Complete audit trail; no information loss | Growing search surface; AI reads irrelevant content |
| **Summarise and archive** | Old content compacted to summary; detail moves to archive | Compact working set; AI reads only current content | Summary may lose nuance; requires summarisation effort |
| **Snapshot + delta** | Current state overwritten; history appended separately | Always-compact current state; history preserved | Two files to maintain; state must be kept accurate |
| **Tiered with staleness** | Content auto-categorised by freshness; stale content excluded from default search | Self-maintaining; reduces noise automatically | Requires staleness criteria; may hide still-relevant old content |

### 7.2 Factory.ai's Compaction Research

Key findings from Factory.ai's compression evaluation:

1. **Anchored iterative summarisation** outperforms freeform: summaries structured with explicit sections (session intent, file modifications, decisions, next steps) act as "a checklist the summariser must populate or explicitly leave empty"
2. **Compression ratio is the wrong metric** — aggressive compression causes re-fetching that costs more total tokens
3. **Incremental updates** beat regeneration: merge new information into persistent summaries rather than regenerating from scratch
4. **Artifact tracking** (file modifications, decisions) needs specialised handling beyond general summarisation

**Source**: `factory.ai/news/evaluating-compression`, `factory.ai/news/context-window-problem`

### 7.3 Jason Liu's Compaction Insights

- "If in-context learning is gradient descent, then compaction is momentum" — compaction should preserve the learning trajectory, not just the facts
- Compaction timing matters: too early loses momentum, too late wastes tokens
- Specialised compaction prompts should preserve: reasoning paths, failure signals, optimisation direction markers

**Source**: `jxnl.co/writing/2025/08/30/context-engineering-compaction/`

### 7.4 Manus's Restorable Compression

Manus's key insight: compression should always be **restorable**. A URL preserves access to web page content; a file path preserves access to document content. Context is shrunk without permanent information loss.

Applied to Agent OS: a summary of Phase 2 retrospectives that includes the file paths to the full retrospectives is restorable compression. The AI can always read the full detail if needed.

**Source**: `manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus`

---

## 8. The "Context Window as Documentation Constraint" Problem

### 8.1 The New Constraint

The AI context window is a hard constraint that didn't exist before 2023. Documentation written for humans assumes readers can scan, skip, and re-read. Documentation consumed by AI models is read linearly, with:
- **Positional attention bias** (lost-in-the-middle: 30%+ accuracy drop for content in the middle)
- **Token budget** (every line of docs is a line not available for work)
- **No skimming** (the model reads everything it's given; there's no "glance and move on")

### 8.2 Implications

| Human pattern | AI equivalent | Design implication |
|---------------|--------------|-------------------|
| Skim headings, read what's relevant | Reads everything sequentially | Keep always-loaded docs small |
| Re-read when confused | Can't re-read (one pass) | Important info at start AND end (lost-in-the-middle mitigation) |
| Skip known context | Reads known context again every session | Don't repeat what's in CLAUDE.md in state.md |
| Use search to find detail | Uses tools (Read, Grep) to load detail | Index + pointer pattern works well |
| Accumulate understanding over time | Fresh context each session | Current state must be self-contained |

### 8.3 The Anthropic Guidance

From "Effective Context Engineering for AI Agents":
- "Find the smallest set of high-signal tokens that maximise the likelihood of some desired outcome"
- **Just-in-time context**: maintain lightweight identifiers (file paths, URLs) and dynamically load data at runtime
- **Compaction**: summarise history, preserve decisions and unresolved issues
- **Structured note-taking**: agents maintain persistent notes outside the context window

**Source**: `anthropic.com/engineering/effective-context-engineering-for-ai-agents`

### 8.4 The Martin Fowler Insight

"Build context files up gradually, not front-loaded." Even with large context windows, indiscriminate loading degrades effectiveness. This directly contradicts the current pattern of "read state.md + roadmap.md before anything."

**Source**: `martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html`

---

## 9. Agent OS-Specific Analysis: Current vs. Optimal

### 9.1 Current Loading Pattern

```
Session start (every session):
├── CLAUDE.md (~100 lines)                   ← Always loaded (appropriate)
├── MEMORY.md index (~30 lines)              ← Always loaded (appropriate)
├── state.md (601 lines)                     ← Always loaded (PROBLEM: 85% history)
├── roadmap.md (543 lines)                   ← Always loaded (PROBLEM: most is future phases)
└── Task-specific brief (varies)             ← Loaded per task (appropriate)

Total baseline: ~1,250 lines before any work begins
Of which: ~200 lines are relevant to most tasks
```

### 9.2 Problems Identified

| Problem | Evidence | Impact |
|---------|----------|--------|
| **state.md is 85% history** | 510 of 601 lines are completed phases and retrospectives | Every session reads history it doesn't need |
| **roadmap.md includes all future phases** | Phases 6-13 are future work; most sessions only need current phase | ~300 lines of future-phase detail loaded unnecessarily |
| **No role-aware loading** | A Builder reads the same context as a Researcher | Builders don't need research table status; Researchers don't need build tables |
| **Research reports never expire** | 26 reports, no freshness tracking, no archive pattern | Can't distinguish stale from current research |
| **Redundancy between state.md and sub-documents** | State.md repeats "what was built" details from briefs; "decisions made" duplicates ADR list | Same information in multiple places increases token cost and drift risk |
| **No index for research reports** | Must `ls docs/research/` to see what exists | No way to assess relevance without reading each report |
| **Insights growing without lifecycle triggers** | 27 active insights; no time-based or consumption-based archive trigger | Active set grows monotonically until manual Documenter audit |

### 9.3 What's Already Working

| Pattern | Status |
|---------|--------|
| CLAUDE.md is lean (~70 lines) with tiered reading instructions | Good |
| Briefs have `complete/` subfolder | Good — lifecycle working |
| Insights have `archived/` subfolder | Good — lifecycle working |
| MEMORY.md + topic files | Good — matches Claude Code pattern |
| ADRs are immutable with status field | Good — standard pattern |
| Skill commands specify their own required inputs | Good — role-aware context |

---

## 10. Options for the Architect

### Option A: State Splitting (Minimal)

Split `state.md` into:
- `docs/state.md` — compact current-state snapshot (~100 lines): What's Working (summary), In Progress, Blocked, Decisions Made (table), Next Steps
- `docs/changelog.md` — append-only history: Phase retrospectives, completed research/design tables, resolved decisions with timestamps

Keep everything else the same. CLAUDE.md points to the new compact `state.md`. History is available via `docs/changelog.md` when needed.

**Pros:** Minimal disruption; addresses the biggest single problem (85% history in state.md)
**Cons:** Doesn't address roadmap bloat, research report lifecycle, or role-aware loading

### Option B: Concentric Rings (Structured)

Implement the four-ring pattern:

**Ring 1 — Index (always loaded, <200 lines combined):**
- `CLAUDE.md` — project identity, principles, key commands (<100 lines, already good)
- `docs/state.md` — compact snapshot: current phase, what's working (1 line each), in progress, blocked, next steps (<80 lines)

**Ring 2 — Working Set (loaded per task by skill commands):**
- Current brief (already loaded per task)
- Relevant ADRs (referenced by brief)
- Active insights (loaded on demand, not bulk)
- `docs/roadmap.md` current phase section only (not future phases)

**Ring 3 — Reference (loaded on explicit demand):**
- `docs/architecture.md` — full spec
- `docs/human-layer.md` — full design
- `docs/roadmap.md` — future phases
- All research reports
- `docs/landscape.md`

**Ring 4 — Archive (never loaded, searchable):**
- `docs/changelog.md` — retrospectives + completed phase details
- `docs/briefs/complete/` — completed briefs (already implemented)
- `docs/insights/archived/` — absorbed insights (already implemented)
- `docs/research/archived/` — consumed phase-specific research (new)

Implementation: `.claude/rules/` for role-scoped loading. Skill commands already specify required inputs — extend with explicit "do NOT read" lists.

**Pros:** Significant token reduction; role-aware; matches external best practice
**Cons:** More structural change; requires updating CLAUDE.md, skill commands, and Documenter practices

### Option C: Concentric Rings + Automated Lifecycle (Full)

Everything in Option B, plus:

**Freshness tracking:**
- Research reports get a `freshness_date` in YAML frontmatter. Documenter flags reports older than 3 months for review.
- Insights get a `consumed_by` field tracking which briefs/ADRs consumed them. If all consumers are complete, candidate for archive.

**Research report index:**
- `docs/research/README.md` — single index of all reports with one-line descriptions, status, and freshness date. Analogous to MEMORY.md for memories.

**Roadmap current-phase extraction:**
- `docs/roadmap.md` remains the full roadmap (reference ring)
- `docs/current-phase.md` — auto-maintained extract of just the current phase's capability table. Updated by Documenter when phase changes.

**ADR superseded chains:**
- ADR template gains `Superseded by` field
- ADR index (in `docs/adrs/README.md`) with status + one-line summary

**Staleness-based archive triggers:**
- Research reports: archive if (a) phase is complete AND report was phase-specific, or (b) freshness date > 6 months
- Insights: archive if all `consumed_by` entries are complete phases

**Pros:** Self-maintaining; minimal long-term drift; matches knowledge lifecycle patterns
**Cons:** Most upfront work; Documenter process becomes more complex; risk of over-engineering

### Option D: Role-Scoped Context via .claude/rules/ (Targeted)

Keep document structure as-is but use `.claude/rules/` to reduce what each role reads:

```
.claude/rules/
├── builder.md     (paths: src/**)    — read brief + relevant code; skip research/design tables
├── reviewer.md    (paths: docs/review-checklist.md) — read architecture + checklist
├── researcher.md  (paths: docs/research/**) — read landscape + existing research
├── architect.md   (paths: docs/briefs/**) — read research + architecture + personas
└── documenter.md  (paths: docs/state.md) — read state + roadmap + insights
```

**Pros:** Uses existing Claude Code infrastructure; no document restructuring
**Cons:** `.claude/rules/` glob matching triggers based on which *files* the agent touches, not which *role* it's playing — a Reviewer touching `src/` would also trigger builder rules. The skill commands (`.claude/commands/dev-*.md`) are the actual role-scoping mechanism; `.claude/rules/` is file-scoping. These are complementary, not substitutes. Doesn't address state.md bloat; workaround, not a structural fix.

### Note: Generated/Computed State (Cross-Cutting)

All options above assume manual Documenter maintenance of the compact state file. An alternative direction: **generate** the state snapshot from structured sources. Brief YAML frontmatter already contains status fields. ADRs have status lines. Test results are machine-readable. A Documenter script (or the Documenter role itself) could regenerate `state.md` from:
- Brief status fields → "In Progress" section
- ADR status fields → "Decisions Made" table
- `pnpm cli debt` output → "Known Debt" section
- Last commit + current branch → "Current Phase" header

This reduces drift risk (state always matches source of truth) and maintenance burden (no manual synchronisation). The trade-off: generated state is harder to include nuanced context ("Phase 4a is complete but the smoke test revealed X"). A hybrid approach — generated skeleton + human-authored annotations — may be optimal. The Architect should consider this alongside the structural options above.

---

## 11. Relevance to Agent OS Product (L5 Learning Layer)

The patterns in this research directly inform Agent OS's own knowledge management:

| Project-level pattern | Product-level equivalent | Architecture layer |
|----------------------|------------------------|-------------------|
| State splitting (snapshot vs history) | Memory active/inactive lifecycle (ADR-003) | L2, L5 |
| Concentric rings (index → detail) | Memory salience scoring + context budget (ADR-012) | L3 |
| Research freshness tracking | Memory recency decay (ADR-003 Phase 3) | L5 |
| Insight absorption lifecycle | Correction → pattern → structural escalation (ADR-013) | L5 |
| Role-aware context loading | Step-type context profiles (ADR-012 Section 2) | L3 |
| Restorable compression | Process outputs as references, not inline (ADR-012) | L2 |

The meta-pattern: **Agent OS is already building the knowledge management system it needs for its own dev process.** The concentric rings pattern IS the stable-prefix/variable-suffix architecture (ADR-012). State splitting IS memory active/inactive lifecycle (ADR-003). Freshness tracking IS recency decay. The dev process should adopt the same patterns the product implements.

---

## 12. Gaps — What No External System Does

| Capability | Closest analogue | Why it's still a gap |
|-----------|-----------------|---------------------|
| **AI-aware documentation structure** — docs explicitly structured for context window constraints (position, budget, tiering) | Anthropic context engineering guide (principles, not tooling) | No project documentation tool optimises for AI consumption — all assume human readers |
| **Role-aware auto-loading** — different context loaded based on which dev role is active | Claude Code `.claude/rules/` with glob matching (file-based, not role-based) | No system loads different project docs based on the human/AI's current role |
| **Cross-document freshness tracking** — automated detection of stale research, insights, or architecture sections | Confluence staleness thresholds (view-count + edit-date based) | No developer documentation system tracks cross-document freshness for AI context |
| **Knowledge compaction with provenance** — summaries that link back to full detail, maintaining the audit trail | Manus restorable compression (URL/file-path based) | No system compacts developer knowledge while preserving the "read more" trail |

---

## Provenance Summary

| Pattern | Source | Applicability to Agent OS |
|---------|--------|--------------------------|
| Concentric rings (index → summary → detail → archive) | OpenClaw workspace, Factory.ai, Anthropic guide | HIGH — directly addresses state.md bloat |
| Snapshot vs delta separation | keepachangelog.com, OpenClaw HEARTBEAT.md, Manus todo.md | HIGH — state.md should be split |
| ADR immutability + superseded chains | Spotify/Backstage, Log4brains, GOV.UK | MEDIUM — needed when ADRs start superseding each other |
| `.claude/rules/` for conditional loading | Claude Code v2.0.64+ | HIGH — role-scoped context, already available |
| Research report freshness tracking | Confluence lifecycle management | MEDIUM — prevents stale research from polluting context |
| MEMORY.md as index + topic files | Claude Code pattern | Already in use — working well |
| Restorable compression | Manus context engineering | HIGH — summaries with file-path links |
| Anchored iterative summarisation | Factory.ai | MEDIUM — for compacting retrospectives |
| PromptComposer (condition predicates + priorities) | Tiered context loading article | LOW for now — Agent OS skill commands already serve this role |
| Living documentation fitness functions | ThoughtWorks, Adzic/Martraire | LOW for now — useful when automated doc validation is needed |
| SECI knowledge spiral | Nonaka-Takeuchi | CONCEPTUAL — validates insight lifecycle pattern |

---

## Sources

| Source | Key reference |
|--------|-------------|
| Anthropic Context Engineering | `anthropic.com/engineering/effective-context-engineering-for-ai-agents` |
| Martin Fowler Context Engineering | `martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html` |
| Factory.ai Context Window Problem | `factory.ai/news/context-window-problem` |
| Factory.ai Compression Evaluation | `factory.ai/news/evaluating-compression` |
| Jason Liu Compaction | `jxnl.co/writing/2025/08/30/context-engineering-compaction/` |
| Manus Context Engineering | `manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus` |
| OpenClaw Workspace Architecture | `capodieci.medium.com` (OpenClaw workspace files explained) |
| Claude Code Memory | `code.claude.com/docs/en/memory` |
| Claude Code Rules Directory | `claude-blog.setec.rs/blog/claude-code-rules-directory` |
| Claude Code Best Practices | `code.claude.com/docs/en/best-practices` |
| Platformatic CLAUDE.md | `github.com/platformatic/platformatic/blob/main/CLAUDE.md` |
| render-claude-context | `github.com/czottmann/render-claude-context` |
| Claude-Mem | `github.com/thedotmack/claude-mem` |
| Log4brains | `github.com/thomvaill/log4brains` |
| Spotify Engineering ADRs | `engineering.atspotify.com/2020/04/when-should-i-write-an-architecture-decision-record` |
| GOV.UK ADR Framework | `gov.uk/government/publications/architectural-decision-record-framework` |
| Keep a Changelog | `keepachangelog.com/en/1.1.0/` |
| Confluence Content Lifecycle | Midori plugin documentation |
| Nonaka-Takeuchi SECI Model | `en.wikipedia.org/wiki/SECI_model_of_knowledge_dimensions` |
| Wikipedia Article Development | `en.wikipedia.org/wiki/Wikipedia:Article_development` |
| ThoughtWorks Fitness Functions | `thoughtworks.com/en-us/insights/articles/fitness-function-driven-development` |
| Living Documentation Principles | `hilton.org.uk/blog/living-documentation-principles` |
| Tiered Context Loading (76% reduction) | `earezki.com/ai-news/2026-03-07` |
| CLAUDE.md Information Hierarchy | `dev.to/kitaekatt/the-claude-code-information-hierarchy-n7m` |
| SDD Pattern (Claude Code issue #32627) | `github.com/anthropics/claude-code/issues/32627` |
| Builder.io CLAUDE.md Guide | `builder.io/blog/claude-md-guide` |
