# Insight-194: Drift-Clearing Requires Source Verification, Not Doc Cross-Reference

**Date:** 2026-04-16
**Trigger:** Reference-doc drift batch-update session cleared 9 accumulated drift entries. First pass had three factual errors — pipeline handler count (stated 11, actual 13), ContentBlock count (stated 22, actual 26), and a missing Insight-160 cross-reference. Reviewer caught all three by reading engine source (`heartbeat.ts`, `content-blocks.ts`) instead of cross-referencing other docs.
**Layers affected:** Meta (dev process)
**Status:** active

## The Insight

When docs cite numbers (handler counts, block counts, tool counts, agent counts), the citation drifts independently of the underlying code. Every new handler, block, or tool adds to the source but only updates docs *if the author notices*. Over time, the docs form a mutually-reinforcing network of stale numbers — architecture.md says 22, human-layer.md cites architecture.md's 22, ADR-024 says 21, and nobody spots the drift because all the docs agree with each other.

The trap: when clearing drift, the Architect trusts existing docs as context and propagates the stale number into the "updated" version. The drift isn't cleared — it's refreshed with a new date.

**The only reliable source of truth is the code.** For this session: `grep -cE "^\s*\|\s*\w+Block" packages/core/src/content-blocks.ts` and `grep -n "pipeline.register" src/engine/heartbeat.ts` caught both errors immediately. Thirty seconds of verification prevented three factual errors in eight documents.

## Implications

**For drift-clearing sessions:** Before writing a count, run a grep against source. Treat every enumerated number in the doc as a claim that must be verified. Do not trust other docs as authority on counts.

**For the Reviewer's diff audit:** Review checklist for drift sessions should include: "Pick one enumerated number in the diff and verify it against source." Systematic source-sampling catches the drift that cross-reference review misses.

**For architecture writers generally:** Prefer "see engine source for current count" over a hardcoded number when the set is growing. `packages/core/src/content-blocks.ts` is authoritative; ADR-021 addendum now says so explicitly. The number still appears in the doc (humans want a ballpark), but the doc no longer *claims* to be the source of truth.

**For periodic audit:** Enumerations of this kind (handlers, blocks, system agents, Self tools, composition intents, ADRs referenced) should be spot-checked every few months even when no active drift entry names them. Silent drift accumulates between drift-clearing sessions.

## Where It Should Land

`docs/dev-process.md` — add a "Drift-clearing checklist" subsection: verify counts against source, don't trust doc-cross-references. Amend the Dev Reviewer role contract (`.claude/commands/dev-reviewer.md`) to require source-sampling on any enumerated counts in a drift-clearing review. Candidate constraint for the Dev Architect role: "When clearing drift, verify any enumerated count against source before propagating."
