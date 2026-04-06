# Brief 079: Knowledge Base — Ingest, Search, Cite

**Date:** 2026-04-05
**Status:** draft
**Depends on:** Brief 025 (agent tool use), Brief 035 (credential vault)
**Unlocks:** Analyze mode document QA, citation-grounded process steps, knowledge-aware Self

## Goal

- **Roadmap phase:** Phase 14: Knowledge Infrastructure
- **Capabilities:** Document ingestion, hybrid retrieval, citation-grounded answers

## Context

Users cannot upload large document collections and ask questions with trusted, line-specific citations. This is the "AI without memory" problem applied to organizational knowledge. Rob needs supplier catalogs searchable when quoting. Lisa needs brand guidelines citable when generating content. Jordan needs cross-department policies accessible. Nadia needs report standards referenced with provenance.

The infrastructure is simple: parse documents into chunks with source coordinates, index in a vector+keyword store, retrieve with hybrid search, include chunks in LLM context with IDs, require verbatim quotes, and verify citations by string-matching quotes back to source chunks. No second LLM pass for verification. Deterministic.

Research completed: `docs/research/document-retrieval-citation-infrastructure.md` (40+ repositories surveyed).

## Objective

A persistent, growing knowledge base where agents can search ingested documents and return answers with line-specific citations that are deterministically verified against source text.

## Non-Goals

- Knowledge graph / entity extraction (simple search index is sufficient)
- Reranking layer (start with LanceDB built-in RRF; add reranking only if measured recall is insufficient)
- LLM-based citation verification (verbatim quote string-matching is more trustworthy and cheaper)
- Multi-tenant access controls (all documents visible to all processes; ACLs deferred)
- Custom embedding model training
- New harness handlers or trust dimensions (citation failures surface through existing review → feedback → trust path)
- Standalone document QA product (retrieval is a process capability — Insight-144)

## Inputs

1. `docs/research/document-retrieval-citation-infrastructure.md` — landscape survey (created 2026-04-05, same session as this brief)
2. `docs/architecture.md` — Layer 2 (Agent) for tool integration. Note: block count stated in architecture.md (22) is stale — codebase has 24 ContentBlock types. This brief extends an existing block, not adding a new type.
3. `docs/insights/144-retrieval-is-a-process-capability.md` — design framing
4. `docs/personas.md` — persona scenarios for validation

## Constraints

- Zero Python dependencies — TypeScript/Node.js only
- Must work with `pnpm install` on fresh clone (ADR-001 philosophy)
- Cloud parsing (LlamaParse) is primary; local TS-native parsers (`pdf-parse`, `mammoth`) as fallback for sensitive docs
- Embedding via user's existing `LLM_PROVIDER` config: OpenAI → `text-embedding-3-small`, Ollama → `nomic-embed-text`, Anthropic → falls back to Ollama embedding
- All ingested documents accessible to all processes (single-user; ACLs deferred)
- Citation verification is deterministic string-matching, not LLM-as-judge

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Document parsing (cloud) | LlamaParse (`run-llama/llama_index`) | depend | REST API, 130+ formats, structure-preserving markdown output, purpose-built for RAG. No local Python needed. |
| Document parsing (local fallback) | `pdf-parse`, `mammoth`, `cheerio`, `xlsx` | depend | TS-native, zero-infra, covers core formats for sensitive docs |
| Vector + keyword storage | LanceDB (`lancedb/lancedb`) | depend | Embedded, JS/TS SDK, built-in hybrid search (BM25 via Tantivy + vector + RRF), zero-infra. Same philosophy as SQLite. 9.8k stars. |
| Chunking approach | dsRAG (`D-Star-AI/dsRAG`) | pattern | Structure-aware chunking along heading/section boundaries. 96.6% on FinanceBench vs 32% naive. We pattern the approach using LlamaParse markdown structure. |
| Citation UX | Kotaemon (`Cinnamon/kotaemon`) | pattern | In-browser source highlighting with relevance scores. Best citation UX surveyed. |
| Quote-based verification | Original to Ditto | — | Require verbatim quotes, verify by string match. More trustworthy than LLM-based entailment checking. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/knowledge/ingest.ts` | Create: Parse documents via LlamaParse API (cloud) or TS-native parsers (local). Chunk along structural boundaries (headings, page breaks). Each chunk carries: file path, page number, section hierarchy, character offset range. |
| `src/engine/knowledge/store.ts` | Create: LanceDB integration — embed chunks (via user's LLM provider), store with metadata, handle incremental re-indexing (document hash for change detection). |
| `src/engine/knowledge/search.ts` | Create: Hybrid search query (vector + BM25 via LanceDB RRF). Returns top-K chunks with source coordinates and relevance scores. |
| `src/engine/knowledge/cite.ts` | Create: Builds citation objects from retrieved chunks. Verifies LLM-generated verbatim quotes against source chunk text (fuzzy string match with >90% similarity threshold). Flags unverifiable citations. |
| `src/engine/self-tools/search-knowledge.ts` | Create: Self tool wrapping `knowledge.search` — available in conversation and process steps. |
| `src/engine/tool-resolver.ts` | Modify: Register `knowledge.search` as an agent tool for process step YAML (`tools: [knowledge.search]`). |
| `src/db/schema.ts` | Modify: Add `documents` table (file path, format, content hash, chunk count, last indexed, source — 'llamaparse' or 'local'). |
| `src/engine/content-blocks.ts` | Modify: Extend existing `KnowledgeCitationBlock` with optional document citation fields: `page`, `lineRange`, `section`, `verbatimQuote`, `matchConfidence`. Same block type, two use cases: memory provenance (existing) and document citations (new). |
| `packages/web/components/blocks/KnowledgeCitationBlock.tsx` | Modify: When document citation fields are present, render citation badge with file, page, section, and verbatim quote. Tap to expand shows full source context. Falls back to existing memory provenance rendering when document fields are absent. |

## Architecture

```
User: "ditto knowledge ingest ./supplier-catalogs/"
         │
         ▼
┌─────────────────────────────────┐
│  ingest.ts                       │
│  LlamaParse API (or local parser)│  → structured markdown with page/section metadata
│  Chunk along headings/pages      │  → each chunk: text + file + page + section + offset
│  Embed via user's LLM provider   │
│  Store in LanceDB                │
│  Track in documents table (SQLite)│
└─────────────────────────────────┘

User: "What's the price for 15mm copper pipe?"
         │
         ▼
┌──────────────────────────────┐
│  search-knowledge tool        │
│  LanceDB hybrid search (RRF)  │  → top-K chunks with relevance + source coordinates
│  Chunks injected into prompt   │  → "Answer using ONLY these sources. Include verbatim quotes."
│  LLM generates answer + quotes │
│  cite.ts string-matches quotes │  → verified citations or flagged mismatches
│  KnowledgeCitationBlock emitted   │  → renders inline with file, page, section, confidence
└──────────────────────────────┘
```

**Trust integration:** No new trust dimensions. If citation verification flags mismatches, the output includes a warning. The human reviews (approve/edit/reject) through the existing harness. That feedback feeds the existing approval-rate trust mechanism. Zero changes to `trust.ts`.

**Knowledge base growth:** LanceDB persists on disk (`data/knowledge.lance`). Each `knowledge ingest` adds documents. The `documents` table in SQLite tracks what's been ingested with content hashes for change detection. Re-ingesting a changed file deletes old chunks and re-indexes — incremental, not full rebuild.

**Embedding strategy:** Maps to user's existing `LLM_PROVIDER`:
- OpenAI → `text-embedding-3-small` (1536 dims, $0.02/M tokens)
- Ollama → `nomic-embed-text` (local, free)
- Anthropic → auto-detect Ollama; if unavailable, prompt user to configure embedding provider

## User Experience

- **Jobs affected:** Orient (find information), Review (verify citations), Capture (upload documents)
- **Primitives involved:** `KnowledgeCitationBlock` (extended with document citation fields), prompt input (for questions)
- **Process-owner perspective:** Rob: `ditto knowledge ingest ./price-lists/` once. Then his quoting process uses `tools: [knowledge.search]` to pull current prices with citations to exact page and line. Lisa asks Self: "What's our brand voice for luxury products?" → answer cites paragraphs from her brand guidelines with page numbers.
- **Interaction states:**
  - Ingesting: progress bar (X/Y documents, Z chunks indexed)
  - Searching: results stream with relevance scores
  - Citation: inline badge → tap to expand quote + source
  - Verification failed: amber warning badge, quote mismatch shown
- **Designer input:** Not invoked. Citation pattern from Kotaemon (source highlighting with relevance scores).

## Acceptance Criteria

1. [ ] `ditto knowledge ingest --file <path>` parses a PDF via LlamaParse and stores chunks in LanceDB with source coordinates (file, page, section)
2. [ ] `ditto knowledge ingest --file <path> --local` parses using TS-native parsers (pdf-parse/mammoth) without any cloud call
3. [ ] `ditto knowledge ingest --dir <path>` ingests all supported files in a directory
4. [ ] `documents` table tracks each ingested file with content hash; re-ingesting a changed file re-indexes only that file's chunks
5. [ ] `ditto knowledge search "query"` returns top-5 chunks with relevance scores and source coordinates via LanceDB hybrid search (vector + BM25 + RRF)
6. [ ] `knowledge.search` is registered as an agent tool and usable in process YAML (`tools: [knowledge.search]`)
7. [ ] Self can use `search-knowledge` tool in conversation to answer questions from the knowledge base
8. [ ] LLM responses include verbatim quotes; `cite.ts` string-matches quotes against source chunks and flags mismatches (>90% similarity threshold passes)
9. [ ] Extended `KnowledgeCitationBlock` renders document citations in conversation with file name, page, section, and verbatim quote (existing memory provenance rendering unchanged)
10. [ ] Embedding provider auto-detected from `LLM_PROVIDER`; works with OpenAI and Ollama out of the box
11. [ ] LlamaParse API key stored via existing credential vault (`ditto credential add llamaparse`)
12. [ ] Knowledge base persists across restarts (`data/knowledge.lance` directory)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: tool integration pattern matches Brief 025, no trust.ts changes, composition over invention, citation verification is deterministic not probabilistic
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Ingest a test document
ditto knowledge ingest --file ./test-docs/sample.pdf
# Expect: "Ingested sample.pdf: 47 chunks indexed. Source: llamaparse."

# 2. Search the knowledge base
ditto knowledge search "what is the return policy?"
# Expect: Top-5 results with relevance scores, file name, page number, section.

# 3. Re-ingest unchanged file (should skip)
ditto knowledge ingest --file ./test-docs/sample.pdf
# Expect: "sample.pdf unchanged (hash match). Skipping."

# 4. Use in conversation via Self
# In the web app or Telegram, ask: "Based on my documents, what is the return policy?"
# Expect: Answer with KnowledgeCitationBlock showing file, page, section, verbatim quote.

# 5. Local fallback
ditto knowledge ingest --file ./sensitive.pdf --local
# Expect: "Ingested sensitive.pdf: 32 chunks indexed. Source: local (pdf-parse)."
```

## After Completion

1. Update `docs/state.md` with knowledge base as a working capability
2. Update `docs/roadmap.md` — add Phase 14: Knowledge Infrastructure
3. Update `docs/architecture.md` — extend Layer 2 with `knowledge.search` tool
4. Retrospective: evaluate LlamaParse quality, LanceDB hybrid search recall, quote-matching accuracy
5. If recall is insufficient: write follow-up brief for reranking layer
6. If parsing quality is insufficient: write follow-up brief for alternative parser
