# Document Retrieval & Citation Infrastructure — Repository Survey

**Research question:** What GitHub repositories exist for building robust, enterprise-ready document retrieval with line-specific citations?
**Date:** 2026-04-05
**Requested by:** User (strategic exploration — not tied to a specific brief)

---

## 1. Full RAG Frameworks & Pipelines

### Dify (langgenius/dify) — ~136k stars
- **URL:** https://github.com/langgenius/dify
- **What it does:** Open-source LLM app platform with deep RAG/knowledge-base features. Visual workflow builder.
- **Citations:** Built-in citation attribution — responses show citation paragraph info including original segment text, segment number, and matching degree.
- **Retrieval:** Vector search, keyword search, hybrid retrieval. Configurable chunking and embedding strategies.
- **Architecture:** Visual drag-and-drop workflow, modular RAG pipeline, multi-tenant, Docker-deployable.

### RAGFlow (infiniflow/ragflow) — ~77k stars
- **URL:** https://github.com/infiniflow/ragflow
- **What it does:** RAG engine focused on deep document understanding. Excels at extracting knowledge from complex-format unstructured data (PDFs with tables, images, scanned docs).
- **Citations:** First-class feature — traceable citations with quick-view references. Answers backed by well-founded citations from source documents.
- **Retrieval:** Configurable embedding models, multiple recall paired with fused re-ranking. Handles Word, slides, Excel, txt, images, scanned copies, structured data, web pages.
- **Architecture:** Deep document parsing as differentiator. Docker deployment, intuitive APIs.

### LlamaIndex (run-llama/llama_index) — ~48k stars
- **URL:** https://github.com/run-llama/llama_index
- **What it does:** Leading data framework for connecting LLMs with private data. Structured data ingestion, indexing, and retrieval.
- **Citations:** Dedicated `CitationQueryEngine` — modifies retrieved nodes to create granular sources, splits content into smaller chunks and tracks which chunk the answer draws from. Inline citations in responses.
- **Retrieval:** VectorStoreIndex, Summary Index, Tree Index, Keyword Table Index. 300+ integration packages. Supports hybrid search, reranking, query decomposition.
- **Architecture:** Highly modular — data connectors, indices, query engines, response synthesizers are all composable. Python and TypeScript SDKs.

### LightRAG (HKUDS/LightRAG) — ~32k stars
- **URL:** https://github.com/HKUDS/LightRAG
- **What it does:** Graph-based RAG that builds knowledge graphs from documents for more connected, contextual retrieval. Published at EMNLP 2025.
- **Citations:** Source attribution through graph entities and relationships traced back to source documents.
- **Retrieval:** Dual-level — low-level (specific entities/relationships) and high-level (broader topics/themes). Reranker support, knowledge graph visualization.
- **Architecture:** Extracts entities and relationships into a knowledge graph, combines graph traversal with vector search. Supports PostgreSQL, MongoDB, Neo4j.

### Microsoft GraphRAG (microsoft/graphrag) — ~32k stars
- **URL:** https://github.com/microsoft/graphrag
- **What it does:** Graph-based RAG from Microsoft Research. Uses LLMs to extract knowledge graphs, build community hierarchies, and generate community summaries.
- **Citations:** Answers grounded in extracted graph entities and community summaries that trace back to source text.
- **Retrieval:** Community detection + summarization. Excels at "global questions" that span entire datasets (where naive vector-search RAG fails).
- **Architecture:** Text extraction → knowledge graph → community hierarchy → community summaries → query-time augmentation.

### Kotaemon (Cinnamon/kotaemon) — ~25k stars
- **URL:** https://github.com/Cinnamon/kotaemon
- **What it does:** RAG-based tool for chatting with documents. Both end-user QA tool and developer framework.
- **Citations:** Advanced citations with in-browser PDF viewer that highlights the exact paragraph used, showing relevance scores. Citations are a core feature, not an add-on.
- **Retrieval:** Hybrid RAG pipeline with full-text and vector retrieval. Multi-modal QA for documents with figures and tables. Complex reasoning methods (ReAct, ReWOO).
- **Architecture:** Modular `libs/ktem` library. Gradio-based UI. Local-first design.

### Haystack (deepset-ai/haystack) — ~24.7k stars
- **URL:** https://github.com/deepset-ai/haystack
- **What it does:** Open-source AI orchestration framework for production-ready LLM applications.
- **Citations:** `AnswerBuilder` component with `reference_pattern` parameter to extract document references from LLM answers. `return_only_referenced_documents` parameter filters results.
- **Retrieval:** BM25 + embedding-based hybrid retrieval. Transformer-based rerankers (including NvidiaRanker). Pipeline breakpoints for debugging.
- **Architecture:** Directed graph pipelines with typed components. Highly composable — each component is swappable. Production-oriented.

### RAG-Anything (HKUDS/RAG-Anything) — ~8.1k stars
- **URL:** https://github.com/HKUDS/RAG-Anything
- **What it does:** All-in-one multimodal RAG built on LightRAG. Handles text, images, tables, equations, charts.
- **Citations:** Inherits LightRAG's graph-based source attribution.
- **Retrieval:** Dual-graph construction, cross-modal hybrid retrieval combining structural knowledge navigation with semantic matching.
- **Architecture:** Uses MinerU for document structure extraction. Adaptive content decomposition.

### R2R (SciPhi-AI/R2R) — ~7.7k stars
- **URL:** https://github.com/SciPhi-AI/R2R
- **What it does:** Production-ready agentic RAG system with full RESTful API. "The Supabase for RAG."
- **Citations:** API generates answers with citations to source documents.
- **Retrieval:** Hybrid search (semantic + keyword) with reciprocal rank fusion. Knowledge graphs via GraphRAG. Deep Research API.
- **Architecture:** RESTful API-first design. Containerized. React + Next.js dashboard.

### Verba (weaviate/Verba) — ~7.6k stars
- **URL:** https://github.com/weaviate/Verba
- **What it does:** RAG chatbot built on Weaviate vector database. Fully-customizable personal assistant.
- **Citations:** Displays specific chunks that contributed to an answer, highlighting the exact paragraph used.
- **Retrieval:** Powered by Weaviate's vector search. Semantic caching.
- **Architecture:** Modular (readers, chunkers, embedders, retrievers, generators are all swappable). Web UI included.

### AutoRAG (Marker-Inc-Korea/AutoRAG) — ~4.7k stars
- **URL:** https://github.com/Marker-Inc-Korea/AutoRAG
- **What it does:** AutoML-style framework for evaluating and optimizing RAG pipelines. Finds the best RAG configuration for your specific data automatically.
- **Citations:** Citation correctness as a measured evaluation dimension.
- **Retrieval:** Tests all strategies automatically — query expansion, multiple retrieval methods, passage augmentation, passage reranking, prompt creation.
- **Architecture:** Upload raw documents → auto-generate QA evaluation data → run trials across RAG configurations → select best pipeline → deploy as API server.

### Cognita (truefoundry/cognita) — ~4.4k stars
- **URL:** https://github.com/truefoundry/cognita
- **What it does:** Modular, production-oriented RAG framework. Easy local testing and production deployment.
- **Citations:** Source attribution through retrieved document chunks with metadata.
- **Retrieval:** Similarity search, query decomposition, document reranking. Supports Qdrant, Singlestore, Chroma, Weaviate.
- **Architecture:** Seven modular components, each customizable. Frontend included.

---

## 2. Document Parsing & Chunking

### MinerU (opendatalab/MinerU) — ~54.6k stars
- **URL:** https://github.com/opendatalab/MinerU
- **Formats:** PDF, images, DOCX
- **Structure preservation:** Removes headers/footers/page numbers, preserves headings, paragraphs, lists. Extracts images, tables, table titles, footnotes. Human-readable reading order for complex layouts.
- **Performance:** 0.21 sec/page on Nvidia L4 GPU. Scored 86.2 on OmniDocBench.
- **Architecture:** Pipeline-based with sliding-window mechanism. Thread-safe, multi-GPU deployment via mineru-router.

### Docling (docling-project/docling) — ~51k stars
- **URL:** https://github.com/docling-project/docling
- **Formats:** PDF, DOCX, PPTX, XLSX, HTML, images, LaTeX, audio, plain text (broadest format support)
- **Structure preservation:** Outputs structured `DoclingDocument` preserving full semantic hierarchy (headings, sections, paragraphs). 97.9% accuracy on complex table extraction.
- **Chunking:** Built-in chunking via DoclingDocument; integrates with LlamaIndex/LangChain chunkers.
- **Architecture:** IBM Research origin, now LF AI & Data Foundation. Also has `docling-graph` for knowledge graph generation.

### Marker (datalab-to/marker) — ~33.3k stars
- **URL:** https://github.com/datalab-to/marker
- **Formats:** PDF, images, PPTX, DOCX, XLSX, HTML, EPUB
- **Structure preservation:** Preserves tables, forms, equations, inline math, links, references, code blocks. All languages.
- **Chunking:** Native chunk output mode (Markdown, JSON, or chunks); optional `--use_llm` flag for advanced parsing.
- **Performance:** ~25 pages/second batch throughput on H100.

### Unstructured (Unstructured-IO/unstructured) — ~13.3k stars
- **URL:** https://github.com/Unstructured-IO/unstructured
- **Formats:** PDFs, HTML, Word docs, images, emails, and many more
- **Structure preservation:** `partition()` produces typed elements (Title, NarrativeText, Table, etc.) with metadata. Lowest hallucination rate (0.027 Tokens Added).
- **Chunking:** Built-in chunking strategies plus embedding and enrichment.
- **Architecture:** ETL pipeline: `partition → chunk → embed → load`. Enterprise platform available.

### Chonkie (chonkie-inc/chonkie) — ~2k+ stars
- **URL:** https://github.com/chonkie-inc/chonkie
- **Focus:** Chunking-only library (pairs with any parser above)
- **Strategies:** TokenChunker, SentenceChunker, SemanticChunker (embedding-based similarity), RecursiveChunker (hierarchical rules), Late Chunking. End-to-end pipeline: fetch, chunk, refine, embed, ship to vector DB.
- **Architecture:** 10x lighter than competitors. 32+ integrations. Python + TypeScript. SQLite-backed pipeline configs.

### dsRAG (D-Star-AI/dsRAG) — ~1.5k stars
- **URL:** https://github.com/D-Star-AI/dsRAG
- **Focus:** Semantic sectioning via LLM — annotates document with line numbers, LLM identifies section boundaries, then sub-chunks within sections.
- **Key feature:** Query-time RSE (Relevant Segment Extraction) intelligently recombines chunks into longer segments. AutoContext enriches chunks with document-level context.
- **Performance:** 96.6% accuracy on FinanceBench (vs 32% vanilla RAG). Best for dense financial/legal/academic text.

### Open Parse (Filimoa/open-parse) — ~2-3k stars
- **URL:** https://github.com/Filimoa/open-parse
- **Focus:** Layout-aware visual chunking — uses bounding box analysis to visually discern document structure, then clusters semantic nodes by embedding similarity.
- **Key feature:** Can overlay chunks back onto original PDF. Preserves visual layout relationships.

---

## 3. Citation Verification & Hallucination Detection

### ALCE (princeton-nlp/ALCE) — 512 stars
- **URL:** https://github.com/princeton-nlp/ALCE
- **What it does:** Benchmark for Automatic LLMs' Citation Evaluation (EMNLP 2023). Three datasets: ASQA, QAMPARI, ELI5.
- **Key approach:** Prompts LLMs to generate answers with inline citations, then automatically evaluates whether citations actually support the claims. Measures fluency, correctness, and citation quality.

### UQLM (cvs-health/uqlm) — ~1.1k stars
- **URL:** https://github.com/cvs-health/uqlm
- **What it does:** Uncertainty Quantification for Language Models — UQ-based hallucination detection.
- **Key approach:** Black-Box UQ (consistency across multiple responses), Long-Text UQ (decomposes responses into claims, checks entailment across samples). Returns confidence scores 0-1.

### Hallucination Leaderboard (vectara/hallucination-leaderboard) — ~3.2k stars
- **URL:** https://github.com/vectara/hallucination-leaderboard
- **What it does:** Leaderboard comparing LLM hallucination rates. Uses Hughes Hallucination Evaluation Model (HHEM-2.3) as scoring backbone.
- **Key approach:** HHEM is a classification model that detects unfaithful or nonsensical text relative to source content.

### Citation-Grounded Code Comprehension (arxiv 2512.12117)
- **What it does:** Combines BM25 sparse matching, BGE dense embeddings, and Neo4j graph expansion. Requires LLMs to cite specific line ranges ([file:start-end]) verified through interval arithmetic.
- **Results:** 92% citation accuracy with zero hallucinations using hybrid fusion (alpha=0.45, beta=0.55).

### awesome-llm-attributions (HITsz-TMG) — 228 stars
- **URL:** https://github.com/HITsz-TMG/awesome-llm-attributions
- **What it does:** Comprehensive survey/index of all LLM attribution research, papers, methods, and resources.

---

## 4. Reranking Models & Libraries

### Sentence Transformers (UKPLab/sentence-transformers) — ~18.5k stars
- **URL:** https://github.com/UKPLab/sentence-transformers
- **What it does:** State-of-the-art text embeddings library with CrossEncoder class for reranking.
- **Key approach:** Bi-encoder for retrieval (fast), cross-encoder for reranking (accurate).

### FlagEmbedding / BGE (FlagOpen/FlagEmbedding) — ~11.5k stars
- **URL:** https://github.com/FlagOpen/FlagEmbedding
- **What it does:** BAAI's toolkit including BGE embedding models, BGE Reranker (cross-encoder + LLM-based), and BGE-M3 (multilingual, dense+sparse+ColBERT from single model).
- **Key approach:** BGE-M3 outputs dense vectors, sparse (BM25-like) vectors, AND ColBERT multi-vectors simultaneously. One model, three retrieval signals.

### rerankers (AnswerDotAI/rerankers) — ~1.6k stars
- **URL:** https://github.com/AnswerDotAI/rerankers
- **What it does:** Lightweight, unified API for all common reranking and cross-encoder models.
- **Supports:** Cross-encoders, FlashRank (ONNX, CPU-friendly, ~4MB), Cohere API, ColBERT. Single interface to swap reranker models without code changes.

### ColBERT (stanford-futuredata/ColBERT) — ~3.8k stars
- **URL:** https://github.com/stanford-futuredata/ColBERT
- **What it does:** Late-interaction retrieval model. Per-token embeddings with fine-grained similarity at query time. Dramatically better retrieval quality than single-vector approaches.

### RAGatouille (AnswerDotAI/RAGatouille) — ~3.9k stars
- **URL:** https://github.com/AnswerDotAI/RAGatouille
- **What it does:** Easy-to-use wrapper for ColBERT-style late-interaction retrieval. Makes ColBERT accessible for RAG pipelines.

---

## 5. RAG Evaluation Frameworks

### RAGAS (explodinggradients/ragas) — ~12.9k stars
- **URL:** https://github.com/explodinggradients/ragas
- **What it does:** Most widely adopted RAG evaluation framework.
- **Metrics:** Faithfulness (factual alignment with context), Answer Relevancy, Context Precision, Context Recall, Context Relevancy. Reference-free evaluation.
- **Key approach:** LLM-as-judge — decomposes answer into claims, checks each against context.

### DeepEval (confident-ai/deepeval) — ~14.5k stars
- **URL:** https://github.com/confident-ai/deepeval
- **What it does:** LLM evaluation framework modeled after pytest.
- **RAG metrics:** Faithfulness, Contextual Recall, Contextual Precision, Contextual Relevancy. Also G-Eval, hallucination detection, answer relevancy.
- **Key feature:** CI/CD integration, red-teaming for 40+ safety vulnerabilities.

### TruLens (truera/trulens) — ~3.2k stars
- **URL:** https://github.com/truera/trulens
- **What it does:** Evaluation and tracing for LLM experiments and AI agents.
- **RAG metrics:** "RAG Triad" — Answer Relevance, Context Relevance, Groundedness.
- **Key approach:** Stack-agnostic instrumentation with feedback functions + dashboard for comparing versions.

### RAGChecker (amazon-science/RAGChecker) — ~1.1k stars
- **URL:** https://github.com/amazon-science/RAGChecker
- **What it does:** Fine-grained diagnostic framework for RAG systems (NeurIPS 2024).
- **Key approach:** (1) Claim Extraction — LLM breaks responses into atomic, verifiable claims; (2) Claim Checking — another LLM verifies each claim against references. Claim-level granularity, not response-level.

### ARES (stanford-futuredata/ARES) — ~700 stars
- **URL:** https://github.com/stanford-futuredata/ARES
- **What it does:** Automated Evaluation of RAG Systems using synthetic query generation + Prediction-Powered Inference.
- **Key approach:** Combines synthetic data generation with statistical inference to provide confidence intervals on evaluation scores.

---

## 6. Vector Databases & Search Infrastructure

### Elasticsearch (elastic/elasticsearch) — ~76.4k stars
- **URL:** https://github.com/elastic/elasticsearch
- **Hybrid search:** Native BM25 + kNN vector search. RRF built-in since 8.9. ELSER for learned sparse representations.
- **Scale:** Proven at petabyte scale. Distributed, sharded, replicated.
- **Note:** SSPL license (not true OSS). Vector search is an add-on to a text-first engine.

### Milvus (milvus-io/milvus) — ~43.6k stars
- **URL:** https://github.com/milvus-io/milvus
- **Hybrid search:** Sparse vectors (BM25, SPLADE) alongside dense. Multi-vector search with weighted ranker or RRF fusion.
- **Scale:** Disaggregated architecture (query/data/index nodes scale independently). Designed for billion-scale. Kubernetes-native.

### Qdrant (qdrant/qdrant) — ~30k stars
- **URL:** https://github.com/qdrant/qdrant
- **Hybrid search:** Native sparse vector support combined with dense vectors via query fusion. Built-in RRF.
- **Scale:** Horizontal sharding, replication, on-disk with quantization. Handles billions.
- **Key differentiator:** Rust performance. Filters apply DURING ANN search (not post-filter).

### Chroma (chroma-core/chroma) — ~27.2k stars
- **URL:** https://github.com/chroma-core/chroma
- **Hybrid search:** Basic. No native BM25/sparse vector support.
- **Scale:** Single-node oriented. Best for prototyping, not enterprise.

### Typesense (typesense/typesense) — ~25.5k stars
- **URL:** https://github.com/typesense/typesense
- **Hybrid search:** Vector search + keyword search combined. Adjustable weighting.
- **Scale:** In-memory, single-node primary. Best for datasets that fit in RAM.

### pgvector (pgvector/pgvector) — ~20.6k stars
- **URL:** https://github.com/pgvector/pgvector
- **Hybrid search:** Not built-in, but trivially combined with Postgres full-text search (tsvector/tsquery) in a single SQL query.
- **Scale:** Single Postgres instance limits. Handles millions of vectors well.
- **Key differentiator:** No new infrastructure — works in existing Postgres. Full SQL power for metadata filtering.

### Tantivy (quickwit-oss/tantivy) — ~14.8k stars
- **URL:** https://github.com/quickwit-oss/tantivy
- **What it does:** Rust-native full-text search engine library (Lucene alternative). Powers ParadeDB and Quickwit.

### txtai (neuml/txtai) — ~12.4k stars
- **URL:** https://github.com/neuml/txtai
- **What it does:** All-in-one semantic search and LLM orchestration. Combines embeddings, vector search, and LLM pipelines.
- **Hybrid search:** Native hybrid combining embeddings with BM25 (SQLite FTS or external).

### LanceDB (lancedb/lancedb) — ~9.8k stars
- **URL:** https://github.com/lancedb/lancedb
- **Hybrid search:** Full-text search (Tantivy-based BM25) combined with vector search via reranking. Native RRF.
- **Scale:** Embedded/serverless. Zero-copy, zero-infra. JS/TS SDK available.
- **Key differentiator:** Built on Lance columnar format. Excellent for edge/local RAG.

### ParadeDB (paradedb/paradedb) — ~8.6k stars
- **URL:** https://github.com/paradedb/paradedb
- **What it does:** Adds Elasticsearch-quality BM25 (via Tantivy) AND vector search to Postgres.
- **Hybrid search:** Purpose-built. Combines Tantivy BM25 with pgvector in a single Postgres query.
- **Key differentiator:** Single system for hybrid search without leaving Postgres.

### Vespa (vespa-engine/vespa) — ~6.9k stars
- **URL:** https://github.com/vespa-engine/vespa
- **Hybrid search:** The most sophisticated — native BM25, native ANN (HNSW), multi-phase ranking pipelines with custom ML models.
- **Scale:** Designed for web-scale (served Yahoo search). Billions of documents with sub-100ms latency.
- **Key differentiator:** Most powerful ranking capabilities of any system. Overkill for small use cases but unmatched for complex retrieval.

---

## 7. Cross-Cutting Observations

1. **Citation is a pipeline property, not a component.** No single repo "solves" citations. The citation chain runs: structured parsing (preserving source coordinates) → chunk metadata (carrying file/page/line) → retrieval (returning metadata alongside content) → generation (prompting with chunk IDs) → verification (checking claims against sources).

2. **Hybrid retrieval is table stakes.** Every serious retrieval system now supports vector + keyword (BM25). The differentiator is moving to reranking and multi-signal retrieval (ColBERT, BGE-M3).

3. **Structured parsing is the foundation.** RAGFlow, Kotaemon, and dsRAG demonstrate that the parsing/chunking layer has the highest impact on downstream citation accuracy. If structure is lost at ingestion, no retrieval tricks recover it.

4. **Evaluation is unsolved for citations specifically.** RAGAS, DeepEval, and TruLens measure retrieval and answer quality well, but citation-level verification (does the cited source actually support this specific claim?) is only addressed by RAGChecker and ALCE — both relatively small projects.

5. **Line-specific citation requires bounding-box-level metadata.** Only a few projects (dsRAG with line numbers, Open Parse with bounding boxes, Docling's DoclingDocument) preserve granularity below the paragraph level. Most chunk at paragraph/section level.

6. **BGE-M3 is the most significant retrieval model.** A single model producing dense + sparse + ColBERT representations simultaneously eliminates the need for separate embedding and keyword pipelines.

---

## Gaps

- **No turnkey "enterprise citation engine"** exists. Building near-100% citation accuracy requires assembling a pipeline from parsing, retrieval, generation, and verification components.
- **Line-specific citation** (as opposed to paragraph/section) is addressed by very few projects. dsRAG's line-number-based semantic sectioning and Open Parse's bounding box approach are the closest.
- **Extractive verification** (post-generation check that cited chunks support claims) is the weakest link. RAGChecker does claim-level checking but is a research project, not production infrastructure.
- **ACL propagation** (document-level access controls flowing to chunk-level retrieval filtering) is not addressed by any open-source RAG framework. Enterprise deployments build this custom.

---

Reference docs checked: `docs/landscape.md` covers memory systems (Mem0, Zep, Graphiti, QMD) but does not currently evaluate document retrieval/citation infrastructure. No drift found in existing evaluations. No update needed — this is a new topic area.
