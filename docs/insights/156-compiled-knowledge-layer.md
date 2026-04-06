# Insight-156: The Compiled Knowledge Layer — LLM Wiki Pattern Validates Ditto's Knowledge Gap

**Date:** 2026-04-06
**Trigger:** Architect review of Karpathy's "LLM Wiki" gist (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) against Ditto architecture
**Layers affected:** L2 Agent (memory model), L4 Awareness, L5 Learning, L6 Human
**Status:** active

## The Pattern

Karpathy's LLM Wiki describes a three-layer knowledge architecture that replaces RAG (rediscover-from-scratch-per-query) with **compiled, compounding knowledge**:

| Layer | What | Who owns | Character |
|-------|------|----------|-----------|
| **Raw sources** | Immutable input documents (articles, data, transcripts) | Human curates | Append-only, never modified by LLM |
| **The wiki** | Structured, interlinked markdown pages (entity pages, concept pages, synthesis, comparisons) | LLM maintains entirely | Compiled knowledge — updated on every ingest, cross-referenced, contradictions flagged |
| **The schema** | Configuration governing wiki structure, conventions, and workflows | Human + LLM co-evolve | The "process definition" for knowledge maintenance |

Three operations cycle over this: **Ingest** (new source → extract → update 10-15 wiki pages → log), **Query** (search wiki → synthesize → valuable answers file back into wiki as new pages), and **Lint** (periodic health check — contradictions, stale claims, orphans, gaps).

The key insight: **"Wiki stays maintained because maintenance cost approaches zero."** Humans abandon knowledge bases because maintenance grows faster than value. LLMs don't bore, don't forget cross-references, and can touch 15 files in one pass. The human role is curation and direction; the LLM role is bookkeeping, linking, and consistency.

## How It Maps to Ditto

Ditto already embodies this philosophy. The mapping is strong:

| Karpathy concept | Ditto equivalent | Status |
|-----------------|-----------------|--------|
| Raw sources | Organizational data model (L4) — email, calendar, Slack, docs | Designed, not yet built (Phase 11) |
| The wiki | Memory model (L2) — agent/process/self/person scoped memories | Partially built (Brief 060). Storage exists, but memories are **database rows**, not browsable interlinked documents |
| The schema | Process definitions + knowledge-extraction process template | Built. knowledge-extractor system agent operates as governed process |
| Ingest | knowledge-extractor fires on significant corrections | Partially built (Brief 060). Extracts root cause, prevention, failed approaches — but only from corrections, not general source ingestion |
| Query | Memory assembly — progressive disclosure into agent context | Built. But query results don't file back as durable knowledge |
| Lint | improvement-scanner + knowledge lifecycle | Partially built. Insight-042 notes "full lifecycle not yet on engine" |
| Index | Memory assembly's relevance scoring + token budgets | Built |
| Log | feedback-recorder — chronological harness decisions | Built |

## What the Pattern Validates

1. **Knowledge compounding is the right strategy.** Ditto's memory model already does this — corrections accumulate, solutions get extracted, confidence decays on unused knowledge. The LLM Wiki pattern confirms this is the right approach, just with a broader scope (not just corrections, but all knowledge).

2. **The schema layer = process-as-primitive.** Karpathy's "schema" (CLAUDE.md/AGENTS.md governing wiki behavior) IS a process definition. Ditto already treats knowledge management as a meta-process (Insight-042). This validates the design.

3. **Lint = knowledge health as a system process.** The periodic health check — contradictions, staleness, orphans, gaps — maps directly to the unbuilt portions of Insight-042. This is a system process that should run through the harness, earn trust, and get better over time.

## What the Pattern Reveals as a Gap

**The missing compiled knowledge layer.** Ditto has raw sources (org data model) and memory entries (database rows), but lacks the middle layer — **human-browsable, interlinked knowledge documents** that compile what the system knows into a navigable artifact.

Insight-083 already identified this from the user side: "Knowledge Documents Are First-Class Objects... Browse, Read, Edit, See connections." The LLM Wiki pattern provides the mechanism: structured, interlinked pages maintained by the LLM, browsable by the human.

The gap manifests in three ways:

### 1. Memories are opaque, not browsable
Current memories are database rows with `content` text, `scope_type`, `memory_type`, and metadata. The user can't browse "everything Ditto knows about my pricing" as a coherent document — they'd see a list of individual corrections and solution memories. The wiki pattern says: compile these into entity/concept pages the human can read.

### 2. Query results evaporate
When a conversation produces a valuable analysis — "here's how your quoting process compares to industry standard" — that insight lives in chat history. The wiki pattern says: valuable outputs should become wiki pages. In Ditto terms, Self should recognize analytical outputs worth preserving and route them to the knowledge layer as durable documents.

### 3. Knowledge lacks cross-references
Individual memories don't link to each other. A pricing rule doesn't cross-reference the bathroom labour insight that informs it. The wiki pattern says: the maintenance operation's job is to build and maintain these links.

## Architectural Implication

Ditto's knowledge architecture should evolve to have three explicit tiers:

```
┌─────────────────────────────────────────────────┐
│  KNOWLEDGE DOCUMENTS ("the wiki")               │
│  Human-browsable, LLM-maintained, interlinked   │
│  Entity pages, concept pages, synthesis docs     │
│  "What I Know" section in workspace (Insight-083)│
│  Compiled from memories + raw sources            │
│  Updated on ingest, query, and lint cycles       │
├─────────────────────────────────────────────────┤
│  MEMORIES (existing L2 model)                    │
│  Agent/process/self/person scoped                │
│  Corrections, preferences, solutions, context    │
│  Injected into agent context at invocation       │
├─────────────────────────────────────────────────┤
│  RAW SOURCES (org data model, L4)                │
│  Connected systems: email, calendar, Slack, docs │
│  Immutable. Source of truth. LLM reads only.     │
└─────────────────────────────────────────────────┘
```

**Knowledge Documents** are the new layer. They are:
- **Generated and maintained by system processes** — not manually authored
- **Browsable by the user** — the "What I Know" section (Insight-083)
- **Referenced in outputs** — the "Based on" provenance (Insight-083)
- **Subject to lint** — periodic health checks find contradictions, staleness, gaps (Insight-042)
- **Fed by two sources**: upward from memories (compilation), and downward from raw sources (extraction)
- **ContentBlocks** — rendered through the block system, not a separate viewer (Insight-107)

This is NOT a new database. It's a **view layer** — a set of structured documents compiled from the existing memory model and organizational data. The system process that maintains them is a knowledge compiler, not a knowledge store.

## Open Questions (for brief-time)

These need resolving when this insight drives a brief:

1. **View vs. stored artifact.** Is the compiled knowledge layer pre-computed and stored (new table/files), or rendered on-demand from memories? Pre-computed means staleness and edit-propagation complexity. On-demand means no persistence but higher latency. Likely answer: hybrid — compiled periodically by a system process, cached, invalidated on memory changes.

2. **Edit propagation.** When a user edits a knowledge document directly (Insight-083 requires this), what happens to the source memories? Does the edit create a new memory? Does the next compilation overwrite the user's edit? Bidirectional flow needs explicit design.

3. **Deployment topology.** Knowledge documents may compile across memory scopes (self + process + person). Self-scoped lives on Workspace, person-scoped on the Network (ADR-025). Where does the compiled document live? Likely: wherever the consuming context lives — workspace documents on workspace, person pages on network.

4. **Token budget.** Memory assembly already has tight token budgets. Compiled documents need their own budget allocation — they don't replace individual memories, they supplement them as a higher-level context source.

5. **Distributed vs. centralized maintenance.** Insight-043 argues knowledge maintenance belongs at the point of contact. The compiler should act as a centralized auditor/compiler of distributed updates, not a centralized maintainer that bypasses point-of-contact capture.

## What This Is NOT

This is NOT RAG. RAG retrieves raw chunks at query time. The compiled knowledge layer pre-compiles synthesis, cross-references, and contradictions. Agents read the compiled layer (via memory assembly), not the raw sources.

This is NOT a documentation feature. The user doesn't write these documents. The system maintains them. The user reads, edits, and directs.

## Where It Should Land

- **Insight-042** — absorb as the specific mechanism for "full knowledge lifecycle on engine"
- **Insight-083** — absorb as the implementation architecture for "Knowledge Documents Are First-Class Objects"
- **Architecture.md L5** — add compiled knowledge layer as explicit component
- **Future brief** — when the org data model (Phase 11) is built, the compiled knowledge layer is the synthesis mechanism that makes raw data useful. Brief should cover: knowledge compiler process, lint process, document schema, "What I Know" UI surface
- **Not now** — this is post-Phase 14. Current work (Network Agent deployment) takes priority. But the pattern should inform how person-scoped memories evolve — person pages in the network are already proto-wiki-pages.

## Provenance

- **Pattern source:** Karpathy "LLM Wiki" gist (2026-04)
- **Validates:** Insight-042 (knowledge as meta-process), Insight-083 (visible/traceable knowledge), Brief 060 (knowledge compounding)
- **Related implementations in comments:** Palinode (git-versioned markdown + 17 MCP tools + hybrid search), knowledge-engine (dual-layer retrieval with drift detection), production learnings (classify-before-extract, entity-type templates)
- **Historical lineage:** Vannevar Bush's Memex (1945) — private, curated, associative knowledge store. The unsolved problem was maintenance. LLMs solve it.
