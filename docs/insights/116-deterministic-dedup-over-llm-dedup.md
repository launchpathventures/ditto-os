# Insight-116: Deterministic Deduplication Over LLM Deduplication

**Date:** 2026-03-30
**Trigger:** Brief 060 implementation — choosing SQL-based overlap assessment over LLM-based deduplication for solution memories
**Layers affected:** L2 Agent, L5 Learning
**Status:** active

## The Insight

When deduplicating or assessing overlap between memories, deterministic methods (category match + tag overlap ratio) are preferable to LLM-based semantic comparison. The reasons compound:

1. **Cost**: LLM calls for every dedup check during knowledge assembly would create O(n) LLM calls per extraction, scaling with the solution memory count per process.
2. **Determinism**: Identical inputs always produce the same overlap classification. No variance from temperature, prompt drift, or model changes.
3. **Speed**: SQL queries + in-memory tag comparison complete in milliseconds vs seconds for LLM round-trips.
4. **Testability**: Deterministic functions are trivially unit-testable with exact assertions, not fuzzy "did the LLM roughly agree" checks.
5. **Avoiding degeneration-of-thought**: Using an LLM to evaluate whether two LLM-generated memories are duplicates introduces a recursive quality problem — the evaluator can have the same blind spots as the generator.

The concrete implementation: `assessOverlap()` checks category equality (50% weight) + Jaccard-like tag intersection ratio (50% weight), classifying as high/moderate/low/none. This is sufficient for the current use case. If semantic similarity becomes necessary later, embedding-based comparison (deterministic, cacheable) is the right next step — not LLM prompting.

## Implications

- System agents that manage memory lifecycle (knowledge-extractor, improvement-scanner) should default to deterministic comparison methods
- LLM calls in system agents should be reserved for generation and classification tasks where human-like judgment is genuinely needed, not for comparison/matching tasks where structured data suffices
- As the memory model matures, embedding vectors on memories would enable semantic similarity without LLM calls — a future enhancement, not a current requirement

## Where It Should Land

- Architecture.md L5 Learning Layer: principle that memory lifecycle operations prefer deterministic methods
- ADR-003 memory architecture: guidance on when LLM vs deterministic comparison is appropriate
