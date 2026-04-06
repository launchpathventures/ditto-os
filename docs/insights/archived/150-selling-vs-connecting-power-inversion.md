# Insight-150: Selling vs Connecting — Different Posture, Not Different Power

**Date:** 2026-04-05 (revised)
**Trigger:** User feedback that Selling and Connecting modes need different interaction flows. Selling = Ditto as internal sales person running a plan. Connecting = Ditto as researcher/advisor, user decides on introductions.
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L6 Human
**Status:** absorbed
**Absorbed into:** `docs/ditto-character.md` (three-layer persona model, mode spectrum), Insight-153 (three-layer persona architecture), process templates (`selling-outreach.yaml` operator: user-agent vs `connecting-research.yaml` operator: alex-or-mira)

## The Insight

Both Selling and Connecting modes are user-initiated through Self. Both work through the existing plan → process → trust tier architecture. The difference is Ditto's **posture**, not who has authority:

**Selling mode:** User tells Self "I want more sales/inbound." Self creates a sales & marketing plan collaboratively. Ditto then acts like an internal BDR — proactive, bold, takes initiative within the plan. Finds prospects, drafts outreach, follows up, books meetings. Trust tiers govern approval (supervised → autonomous). Ditto still considers network health but is user-biased in outreach.

**Connecting mode:** User tells Self "I need to find [type of person]." Self creates a connection plan. Ditto researches candidates, reports back with context and recommendations, then asks "Would you like me to introduce you?" User explicitly decides on each introduction. Introductions are always user-approved because they're personal and high-stakes. Network health is the primary filter.

The difference is not autonomy — it's posture. An internal sales person vs a trusted advisor. Both report to you. One runs with the mandate. The other brings you options.

**Future evolution (not MVP):** As the network grows, Ditto may proactively spot and suggest connections the user didn't ask for. This emerges naturally from rich person-scoped memory and cross-user intelligence. But MVP is both modes user-initiated.

## Implications

1. Both modes use existing Self planning + process + trust tier architecture. No new paradigm needed.
2. Process templates differ: Selling has sequences, cadences, pipeline stages. Connecting has research, candidate lists, introduction requests.
3. Approval differs: Selling uses standard trust tiers (earned autonomy). Connecting always requires per-introduction approval.
4. Briefings differ: Selling = pipeline/goal status. Connecting = candidate updates and introduction results.
5. Recipient experience differs: Selling = "I work with [User]." Connecting = "I'd like to connect you with someone."

## Where It Should Land

Character bible (mode spectrum). Brief 079 as process template design constraint. Interaction spec (already updated).
