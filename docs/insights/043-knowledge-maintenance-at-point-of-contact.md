# Insight-043: Knowledge Maintenance Belongs at the Point of Contact

**Date:** 2026-03-21
**Trigger:** PM triage — ADR-008 lists 7 system agents, architecture.md lists 10. Nobody updated ADR-008 when the Architect added three agents in ADR-010. Same session: brief naming convention drifted because the rule was implicit, not embedded where the work happens.
**Layers affected:** L3 Harness, L5 Learning, Meta (Development Process)
**Status:** active

## The Insight

Centralising knowledge maintenance in a cleanup role (the Documenter, a cron job, a "knowledge manager") guarantees drift. The role that discovers a doc is stale is the role reading it to do work — not the role that runs afterwards to audit everything. If the Builder reads ADR-008 and finds it lists 7 system agents when there are now 10, the Builder is the cheapest point to fix it. Waiting for the Documenter means the drift compounds across sessions.

The principle: **every role that reads a reference doc to do work is responsible for flagging or fixing drift in that doc.** The Documenter's job shifts from "update everything" to "cross-cutting audit of what nobody touched" — catching drift in docs that weren't read this session, not re-checking docs that a producing role already used.

This is the same principle Agent OS applies to its users. Processes that touch knowledge should maintain the knowledge they touch. Memory pruning, ADR accuracy, stale research — these aren't cleanup tasks, they're embedded responsibilities governed by the same trust system as any other output. An agent that reads a memory to do work and discovers it's wrong should correct it as part of the work, not leave it for a separate maintenance pass.

Insight-042 says "knowledge management is a meta-process." This insight sharpens it: the meta-process is not a single centralised agent — it's a distributed responsibility embedded in every process that touches knowledge, with a cross-cutting auditor for gap coverage.

## Implications

- **Dev process (now):** Each producing role's skill should include: "if a reference doc you relied on is inaccurate, update it or flag it." This is not optional cleanup — it's part of producing correct work. The Documenter audits for gaps, not for primary maintenance.
- **Agent OS (product):** The knowledge lifecycle meta-process (Insight-042) should be designed as distributed maintenance + centralised audit, not as a single knowledge-manager agent. Every process that reads memories/context should be able to flag staleness. The learning layer (L5) aggregates these signals.
- **Trust integration:** Knowledge updates by agents go through the same trust gates as any other output. A supervised agent's correction to a stale doc gets reviewed. An autonomous agent's correction lands directly. Same mechanism, applied to knowledge.
- **Brief naming drift was the same pattern.** The convention existed in precedent but not in the template. The Architect couldn't violate a rule that wasn't where the work happens. Embedding constraints at the point of contact (the template) prevents drift. Documenting them elsewhere (CLAUDE.md, verbal instructions) doesn't.

## Where It Should Land

- **Immediately:** Update each dev role skill to include reference doc maintenance responsibility.
- **Insight-042 refinement:** When the knowledge lifecycle meta-process is designed, architecture it as distributed maintenance + centralised audit.
- **Architecture.md (L5 Learning):** Memory staleness detection should be a signal from any process that reads memory, not a separate sweep.
