# Insight-050: Validation Before Infrastructure

**Date:** 2026-03-21
**Trigger:** External review of project state. 14 commits, 14K lines of code, 28K lines of docs. No external user has run a process. The roadmap continues to sequence infrastructure (MCP, credentials, cognitive architecture) before any user validation.
**Layers affected:** All — this is a sequencing principle, not a layer concern
**Status:** active

## The Insight

The project has a documentation-to-code ratio of 2:1. 14 ADRs for 14 commits. ADR-014 alone is 33KB of accepted-but-unbuilt design. The engine works — Phase 5 E2E verification proves the full work evolution cycle. But no one outside the development process has used it.

The current roadmap sequences: MCP → credentials → cognitive toolkit → awareness → learning → self-improvement → web dashboard → discovery → governance → scale. User validation appears nowhere as an explicit milestone.

The risk: the architecture is internally consistent and well-researched, but it's validated against design documents, not against a real user with a real workflow. Every additional infrastructure phase increases the cost of discovering that an assumption was wrong.

The principle: **when the engine can do something useful, find someone to use it before building the next layer.** The integration foundation (Brief 024) means processes can call CLI tools. That's enough for a real workflow — a process that runs `gh`, `jq`, `curl`, or any CLI tool the user already has.

## Corollary: The 200-Line Heuristic

When the impulse is to write an ADR or design document, ask: could 200 lines of code answer whether this idea works? If yes, write the code first. ADRs should increasingly document decisions that were *validated by code*, not decisions that are *planned*.

This doesn't invalidate the existing ADRs — they provided necessary architectural coherence. But the project has passed the point where design coherence is the primary risk. The primary risk is now validation.

## Implications

- The roadmap should include explicit validation milestones: "one external user on one real workflow" before Phase 7
- Brief 025 (MCP) and 026 (credentials) are useful but not prerequisites for user validation — CLI integrations work now
- The cognitive architecture (ADR-014 phases A1-D) should be deferred until the base engine is validated with real usage
- Future work should bias toward code experiments over design documents

## Where It Should Land

- **roadmap.md** — add validation milestone between Phase 6 and Phase 7
- **dev-process.md** — add the 200-line heuristic as a decision rule for ADR vs code
- **state.md** — PM triage should prioritise user validation
