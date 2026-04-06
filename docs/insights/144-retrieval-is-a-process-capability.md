# Insight-144: Document Retrieval Is a Process Capability, Not a Platform Feature

**Date:** 2026-04-05
**Trigger:** Research into document retrieval and citation infrastructure (docs/research/document-retrieval-citation-infrastructure.md)
**Layers affected:** L1 Process, L2 Agent, L5 Learning
**Status:** active

## The Insight

Document retrieval with citations is not a standalone platform feature — it is a capability that processes use. When Rob's quoting process needs to look up pricing from a supplier catalog, or Nadia's report formatting process needs to check citations against source documents, or Lisa's content process needs to reference brand guidelines — these are all process steps that need reliable retrieval from a knowledge base with provable source attribution.

This means retrieval infrastructure belongs in Ditto's agent tooling layer (L2), not as a separate product surface. It is a tool that agents use within process steps, governed by the same harness, trust, and feedback mechanisms as all other agent capabilities. The knowledge base itself is organizational data — ingested, indexed, and maintained as a meta-process (connecting to Insight-042's knowledge lifecycle).

Citation accuracy is a harness-measurable quality dimension. When a process step produces an answer with citations, the harness can verify whether cited sources actually support the claims — the same way it verifies any other quality criterion. This makes citation quality a trust-earning metric: a process that consistently produces accurate citations earns more autonomy.

## Implications

1. **Retrieval is an agent tool** — like `read_file` or `search_files`, but for organizational knowledge. Agents call it within process steps; the harness evaluates the quality of the retrieved + cited output.
2. **Ingestion is a meta-process** — document parsing, chunking, and indexing should be a process that runs through the harness, earning trust. The knowledge-extractor system agent (already defined in architecture.md) gains a document ingestion capability.
3. **Citation verification is a review pattern** — a new harness handler (or extension of metacognitive-check) that verifies cited sources support claims. This fits naturally into the existing harness pipeline.
4. **Trust earns on citation accuracy** — processes that cite sources can have citation accuracy as a quality criterion. The trust-evaluator tracks this alongside other quality dimensions.

## Where It Should Land

Architecture spec — extend Layer 2 (Agent) with retrieval tooling, extend Layer 5 (Learning) with citation-aware quality criteria. Brief 079 (parent) + sub-briefs for implementation.
