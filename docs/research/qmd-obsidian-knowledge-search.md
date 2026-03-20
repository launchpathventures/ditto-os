# Research: QMD + Obsidian as Knowledge Search Layer

**Date:** 2026-03-21
**Researcher:** Dev Researcher (Claude Code)
**Trigger:** Links shared by human — OpenClaw memory masterclass, Obsidian+Claude Code second brain pattern
**Status:** active

---

## Research Question

Is there a composition opportunity for QMD (Query Markup Documents) and/or Obsidian within Agent OS? If so, where does it fit in the architecture?

## Sources Examined

| Source | Type | What it provided |
|--------|------|-----------------|
| QMD (github.com/tobi/qmd) | Search engine | Technical architecture, API surface, dependencies, maturity |
| OpenClaw memory masterclass (velvetshark.com) | Practitioner guide | OpenClaw's 4-layer memory model, compaction limitations, file-first principle |
| Obsidian+Claude Code second brain (dontsleeponai.com) | Practitioner guide | Vault-first protocol, multi-bot coordination, session safety hooks |
| Agent OS docs/architecture.md | Internal | Integration architecture (ADR-005), memory model (ADR-003), knowledge lifecycle (Insight-042) |
| Agent OS docs/research/memory-systems.md | Internal | Existing memory landscape analysis |

---

## 1. What QMD Is

QMD is an on-device search engine for markdown documents. Created by Tobi Lütke (Shopify CEO). 16.2K GitHub stars. MIT license.

**Version:** 2.0.1 (released 2026-03-10). v1.0.0 was 2026-02-15. Very young — 5 weeks since 1.0, 11 releases, breaking changes between minors.

**Three search modes:**
1. **BM25 (lexical)** — fast keyword search, no model required
2. **Vector (semantic)** — embedding similarity via local GGUF models
3. **Hybrid/Query** — combines both + LLM re-ranking via reciprocal rank fusion

All processing is local — no cloud dependency.

**Three interfaces:**
1. **CLI** — `qmd search "query"`, `qmd get "path/file.md"`
2. **SDK** — `import { createStore } from "@tobilu/qmd"`, full TypeScript API
3. **MCP server** — stdio or HTTP daemon mode, exposes `query`, `get`, `multi_get`, `status` tools

**Dependencies:**
- `better-sqlite3` ^12.4.5 (Agent OS uses ^11.9.1 — compatible family)
- `node-llama-cpp` ^3.17.1 — **heavy dependency**: downloads GGUF models (~100MB-1GB), runs local LLM inference for embeddings and re-ranking
- `sqlite-vec` ^0.1.7-alpha.2 — vector extension for SQLite (**alpha quality**)
- `@modelcontextprotocol/sdk` ^1.25.1 — MCP protocol support
- `zod` 4.2.1, `yaml` ^2.8.2, `fast-glob` ^3.3.0
- Requires Node ≥22.0.0 (Agent OS is on v22.22.0 — compatible)

**Configuration:** YAML file defining collections (paths + glob patterns + ignore rules) with hierarchical context descriptions that improve search relevance.

---

## 2. Agent OS Knowledge Corpus (Current State)

| Category | Files | Lines (approx) | Character |
|----------|-------|-----------------|-----------|
| Research reports | 27 | ~12,000 | Deep technical analysis, code patterns, evaluations |
| Insights | 27 active + 15 archived | ~2,000 | Design discoveries, principles |
| ADRs | 13 | ~3,000 | Architectural decisions with reasoning |
| Briefs | ~10 (active + complete) | ~3,500 | Task definitions with acceptance criteria |
| Architecture, roadmap, state | 5 | ~2,500 | Living system docs |
| Role contracts | 7 | ~500 | Agent system prompts |
| **Total** | **~130** | **~24,000** | **1.8MB** |

**How agents currently access this knowledge:** Skill commands tell agents which specific files to read (e.g., "Read `docs/architecture.md` and `docs/landscape.md` first"). There is no search capability — agents must know which file to open. This works because the skill commands encode the knowledge map. It breaks when:
- An agent needs to find related prior work it wasn't explicitly told about
- The corpus grows beyond what can be encoded in skill commands
- The knowledge-manager system agent (Insight-042) needs to search for staleness, contradictions, and gaps across the entire corpus

---

## 3. Composition Options

### Option A: QMD as an Integration Target (Analyze Mode)

**What:** Register QMD as an integration in the integration registry (ADR-005). Agent OS connects to a user's Obsidian vault (or any markdown knowledge base) via QMD's MCP server. Agents in Analyze mode search org knowledge through it.

**Integration pattern:**
```yaml
# integrations/obsidian-qmd.yaml
service: obsidian-knowledge
interfaces:
  mcp:
    uri: stdio://qmd mcp
    auth: none  # local, no auth needed
preferred: mcp
```

**What Agent OS gets:** Access to user's existing markdown knowledge without building a custom indexer. "Connect your Obsidian vault" becomes an onboarding data source alongside email, calendar, etc.

**Pros:**
- Zero custom code — standard MCP integration via existing architecture
- Composition over invention — QMD handles search, Agent OS handles governance
- Users keep their existing knowledge system
- Lightweight — QMD runs as a separate process, no dependency in Agent OS

**Cons:**
- Only helps Obsidian/markdown users (though markdown is broadly used)
- Just one integration target among many — not architecturally significant
- Requires user to install and configure QMD separately

**Effort:** Minimal — an integration registry entry. Standard MCP client code (needed for other integrations anyway).

### Option B: QMD as Search Engine for Agent OS's Own Knowledge Base (Insight-042)

**What:** Use QMD to index and search Agent OS's `docs/` corpus. The knowledge-manager system agent (Insight-042) uses QMD for retrieval — finding relevant research, insights, ADRs, and briefs without needing to be told which files to read.

**Two sub-options for integration mode:**

**B1: MCP server mode (recommended path)**
QMD runs as a separate process (`qmd mcp --http --daemon`). Agent OS agents query it via MCP during step execution — a standard agent tool use pattern per ADR-005.

```yaml
# QMD config for Agent OS knowledge base
collections:
  - path: ./docs/research
    context:
      "/": "Deep technical research reports on frameworks, patterns, and approaches evaluated for Agent OS"
  - path: ./docs/insights
    context:
      "/": "Design discoveries and provisional principles that emerged during building"
  - path: ./docs/adrs
    context:
      "/": "Architectural decision records with context, options considered, and rationale"
  - path: ./docs/briefs
    context:
      "/": "Task definitions with acceptance criteria, provenance, and design"
  - path: ./.claude/commands
    context:
      "/": "Agent role contracts defining purpose, constraints, and expected outputs"
```

- Clean separation — QMD is a sidecar, not a dependency
- Aligns with ADR-005 integration architecture
- Agent OS doesn't import node-llama-cpp or sqlite-vec
- QMD daemon keeps models loaded in VRAM for fast queries

**B2: SDK mode (tighter integration)**
Import `@tobilu/qmd` as a library. Use QMD's `createStore()` and `search()` directly in the memory-assembly handler or a new knowledge-retrieval handler.

- Tighter coupling — brings node-llama-cpp into Agent OS's process
- Heavier binary footprint (~100MB-1GB for GGUF models)
- More control over search behavior
- No separate process to manage

**What Agent OS gets:**
- Agents can search the knowledge base semantically ("what do we know about trust progression?") instead of reading specific files
- The knowledge-manager system agent gets retrieval for freshness audits, contradiction detection, gap analysis
- Research reports, insights, and ADRs become discoverable rather than requiring explicit file paths in skill commands
- Context descriptions per collection improve search relevance (QMD feature)

**Pros:**
- Addresses a real upcoming need (Insight-042) via composition rather than invention
- Same stack: TypeScript, SQLite, vitest, MIT
- MCP mode keeps dependency isolated
- Hierarchical context (collection + path level) maps to Agent OS's knowledge categories
- BM25-only mode works without embeddings for fast keyword search

**Cons:**
- QMD is very young (v2.0.1, 5 weeks since 1.0, breaking changes between minors)
- sqlite-vec is alpha quality
- node-llama-cpp is a significant dependency if using SDK mode
- Current corpus (130 files, 1.8MB) is small enough that the problem doesn't hurt yet
- Adds operational complexity (daemon process to manage)

**Effort:** Medium — QMD config, MCP client integration, knowledge-manager agent tooling.

### Option C: QMD as Semantic Layer for Memory Assembly (Layer 2)

**What:** Augment the structured memory system (ADR-003) with QMD's semantic search for richer retrieval during memory assembly.

**Assessment: Does not fit.** ADR-003 deliberately chose structured, schema-enforced, queryable memory (SQLite with scope_type + scope_id) over file-based approaches. The memory-systems research explicitly identified limitations of file-based memory: "no query capability, no multi-agent coordination, no schema enforcement." Adding QMD here reintroduces those problems.

Memory assembly is a solved design in Agent OS. Knowledge retrieval is not the same problem — it's about searching accumulated institutional knowledge (research, decisions, principles), not about retrieving agent/process memories. Option C confuses the two.

---

## 4. Alternatives to QMD for Knowledge Search

| Alternative | How it works | Pros | Cons |
|-------------|-------------|------|------|
| **BM25 over existing SQLite** | Add FTS5 full-text search to Agent OS's better-sqlite3. Index docs/ content in a new table. | No new dependency. Already have better-sqlite3. Fast keyword search. | No semantic search. Must build indexing, query expansion, result ranking. Reinvents what QMD already does. |
| **Grep/Glob (current approach)** | Agents read specific files they're told about via skill commands. | Zero overhead. Works today. | No discovery. Doesn't scale. Breaks for knowledge-manager agent. |
| **Anthropic API embeddings** | Use Claude's embedding model for vector search. Store vectors in Agent OS's SQLite. | High quality embeddings. No local model dependency. | Costs money per query. Not local-first. Requires API key. Against the "subscription-based" direction of CLI adapter. |
| **sqlite-vec directly** | Add sqlite-vec to Agent OS's SQLite. Build custom embedding + search pipeline. | Full control. No QMD dependency. | Must build embedding pipeline, query expansion, ranking. sqlite-vec is alpha. Still needs an embedding model (local or API). |
| **QMD via MCP** | Run QMD as sidecar MCP server. | Complete solution. Local-first. Hybrid search. Already has MCP interface. | Young project. Alpha deps. Operational complexity. |

---

## 5. Landscape Context: What These Links Revealed

### OpenClaw Memory Model (Competitive Intelligence)

The velvetshark.com article reveals OpenClaw's memory architecture in detail — not previously documented in landscape.md:

**4-layer model:**
1. Bootstrap files (SOUL.md, AGENTS.md, USER.md, MEMORY.md, TOOLS.md) — reloaded every session, permanent
2. Session transcript — conversation history, subject to **lossy compaction**
3. LLM context window — 200K token budget, temporary
4. Retrieval index — searchable layer over memory files (optional, via QMD or built-in)

**Key limitation: compaction is lossy.** When the context window fills, OpenClaw summarizes the conversation history, permanently destroying detail. Instructions given only in chat (not written to files) are silently lost. The article's central principle: *"If it's not written to a file, it doesn't exist."*

**Defense mechanisms are user-managed:** Pre-compaction memory flush (automated but imperfect), manual save discipline (user tells agent to save), strategic file organization (daily logs, bootstrap files). The burden is on the user to maintain persistence.

**Bootstrap file limits:** 20K chars per file, 150K chars aggregate. Large knowledge bases must be accessed via search (Track A: local hybrid search, Track B: QMD backend).

**Agent OS comparison:** Agent OS's memory architecture (ADR-003) solves the compaction problem structurally — memories are extracted, reconciled, and stored in SQLite with scope filtering and salience scoring. The harness manages persistence (feedback-to-memory bridge), not the user. OpenClaw's approach puts cognitive load on the user; Agent OS's approach puts it on the harness. This validates our design direction.

**Landscape.md gap:** OpenClaw's entry currently mentions only "skills-as-progressive-disclosure, skills wrapping MCP servers, channel adapters." The memory model and its limitations are not documented. Worth flagging to the Documenter.

### Obsidian+Claude Code "Second Brain" Pattern

Another instance of the "AI Agent OS practitioner pattern" already in landscape.md. Adds:

- **Vault-first protocol:** 5-step search order (Topics → Sessions → Conversations → Semantic → External) — a manual version of memory assembly
- **Multi-bot coordination:** Multiple OpenClaw instances share one Obsidian vault for knowledge transfer — relevant to Layer 4 shared organizational context
- **Session safety hooks:** Auto-inject context on start, save metadata on exit — manual version of harness lifecycle events

This is not a new pattern category — it's additional evidence that people are building elaborate scaffolding around raw AI chat to get persistence, context assembly, and knowledge transfer. Validates the "structure is the product" thesis (Insight-030).

---

## 6. Timing Assessment

**Now (130 files, 1.8MB):** The corpus is small. Skill commands encode the knowledge map. Grep works. QMD is premature.

**After Insight-042 ships (knowledge-manager system agent):** The knowledge-manager needs to *search* the corpus, not just read known files. It needs to detect staleness ("which research reports reference a project that's changed?"), find contradictions ("does this ADR conflict with that insight?"), and identify gaps ("what's missing?"). This is where QMD-via-MCP becomes a genuine composition opportunity.

**After Phase 6+ (user-facing, Analyze mode):** Users bring their own markdown knowledge (Obsidian vaults, docs folders). QMD becomes an integration target — one of several data sources for the organizational data model.

---

## 7. Summary of Findings

| Option | Fit | When | Effort |
|--------|-----|------|--------|
| **A: Integration target** (user's Obsidian vault via MCP) | Standard — just another integration | Phase 6+ (Analyze mode) | Minimal |
| **B1: Knowledge search via MCP** (Agent OS's own docs/) | Genuine composition opportunity | After Insight-042 (knowledge-manager agent) | Medium |
| **B2: Knowledge search via SDK** (library import) | Over-coupled — brings heavy deps into Agent OS process | Not recommended | High |
| **C: Memory assembly augmentation** | Does not fit — fights ADR-003 | Never | N/A |

**Risk factors for QMD adoption:**
- Project maturity: v2.0.1, 5 weeks since 1.0, breaking changes between minors
- sqlite-vec dependency is alpha (v0.1.7-alpha.2)
- node-llama-cpp requires local model downloads (100MB-1GB)
- Single maintainer (though high-profile)

**Provenance:** QMD — github.com/tobi/qmd (MIT, TypeScript, 16.2K stars). Technical details from `package.json` (deps, version, engine requirements), `src/index.ts` (exported API surface), `CHANGELOG.md` (release history), `example-index.yml` (config format). OpenClaw memory model — velvetshark.com/openclaw-memory-masterclass. Obsidian+Claude Code — dontsleeponai.com/obsidian-claude-code.

---

## 8. Gaps and Open Questions

1. **QMD's search quality at Agent OS's corpus size** — untested. The corpus may be too small for semantic search to add value over keyword search (BM25 alone might suffice).
2. **Model download UX** — QMD requires downloading GGUF models on first use. What's the experience for dev-pipeline users? For end users?
3. **QMD stability** — 11 releases in 5 weeks with breaking changes. Is the API stable enough to depend on?
4. **BM25-only mode viability** — QMD supports lexical-only search (no models needed). Is this sufficient for the knowledge-manager use case, avoiding the heavy node-llama-cpp dependency?
5. **FTS5 as lighter alternative** — SQLite's built-in full-text search (FTS5) could cover keyword search without any new dependency. Is semantic search necessary for knowledge management, or is keyword search + known-file access sufficient?
