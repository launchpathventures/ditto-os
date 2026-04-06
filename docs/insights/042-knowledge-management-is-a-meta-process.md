# Insight-042: Knowledge Management Is a Meta-Process

**Date:** 2026-03-20
**Trigger:** Architect asked "how to restructure growing docs?" — human challenged: "why not build this as a first-class meta-process so Ditto also benefits?"
**Layers affected:** L1 Process, L3 Harness, L5 Learning, L6 Human
**Status:** partially-absorbed

## The Insight

The project's knowledge management problem (growing state.md, stale research, insight lifecycle, context tiering) is not a documentation problem — it's a process problem. The same patterns that Ditto builds for its users (memory lifecycle, salience scoring, compaction, freshness decay) apply directly to the dev process's institutional knowledge.

Solving this as a manual Documenter practice means solving it twice: once for ourselves (prose instructions in skill commands), once for users (engine code in L3/L5). Solving it as a meta-process means the knowledge lifecycle management itself runs through the harness — compaction as a process step, freshness tracking via the learning layer, state generation via the engine, with trust gates governing what gets archived vs kept active.

This is the same insight as Insight-032 (dev process is the first workspace) applied to knowledge management specifically. The dev process doesn't just USE Ditto — it IS an Ditto workspace. Knowledge lifecycle is one of its processes.

## Implications

- The Architect should design a knowledge lifecycle process, not a documentation restructure
- The process should run on the engine (Brief 016 delivers the CLI adapter needed for this)
- State generation, research freshness tracking, insight lifecycle audits, and context tiering become process steps — not manual Documenter tasks
- This becomes a process template that ships to users: "Knowledge Base Management"
- The concentric rings pattern (research Section 1) maps to process-declared context profiles (ADR-012)

## Where It Should Land

- Architecture.md: knowledge lifecycle as a system process (alongside intake-classifier, orchestrator, trust-evaluator)
- ADR-008: potentially an 11th system agent role (knowledge-manager) or a responsibility of the improvement-scanner
- Brief for implementation: after Brief 016 delivers CLI adapter + conditional routing

## Absorption Status (2026-03-30)

**Partially absorbed via Brief 060 (Knowledge Compounding):**
- ✅ Knowledge extraction runs as a system process on the engine (`processes/knowledge-extraction.yaml`)
- ✅ Solution memories with structured metadata stored in L2 memory model
- ✅ Confidence lifecycle (decay after 50 runs, pruning below 0.2, supersession)

**Still active — full lifecycle not yet on engine:**
- State generation as a process step
- Research freshness tracking via learning layer
- Insight lifecycle audits as process steps
- Context tiering via engine

**See also:** Insight-156 (compiled knowledge layer) — proposes the specific mechanism: a compiled knowledge document layer between raw sources and memory entries, with ingest/query/lint operations as system processes. Validates this insight with the Karpathy LLM Wiki pattern.
