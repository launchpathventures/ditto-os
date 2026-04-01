# Insight-127: Trust Signals, Not Activity Traces — Confidence and Uncertainty Are the Real Value

**Date:** 2026-04-01
**Trigger:** User feedback on Brief 067 implementation — outcome-oriented headers are better than time-based ones, but the expanded activity content is still "walls of text" that overwhelm outcome owners rather than building trust
**Layers affected:** L6 Human, L2 Agent (structured confidence metadata)
**Status:** addressed by Brief 068 (Confidence & Trust Card)

## The Insight

Insight-126 reframed activity headers from "Thought for 7s" to "Checked 3 sources — files." But headers alone aren't enough. The expanded content still dumps a trace of every tool call. For Rob checking a quote from his truck, seeing "✓ Reviewed file · docs/roadmap.md" repeated 6 times builds zero trust — it's noise.

**What actually builds trust for outcome owners:**
1. **Confidence evaluation** — "I'm 85% confident in this answer"
2. **What might be wrong** — "I couldn't find Q4 pricing, so margins may be based on Q3 rates"
3. **What needs clarification** — "You mentioned Henderson — did you mean the residential or commercial project?"

The activity trace (which files were read, which tools ran) is audit detail. It should exist for transparency, but buried behind an expand — not the primary signal.

The correct model is:
- **Default collapsed** — one-line summary header ("Checked 6 sources — files")
- **If expanded, show a summary card** — confidence level, key findings, uncertainties
- **Deep expand for audit** — raw tool calls, reasoning text (almost never accessed)

This requires the engine to produce structured metadata alongside responses: confidence scores, uncertainty flags, key findings. The UI can't synthesize this from raw tool call data alone.

## Implications

- Activity groups must auto-close when streaming completes (implemented in Brief 067 fix)
- The next iteration needs engine-side confidence/uncertainty metadata
- The "verification evidence" vision (Insight-126) is correct but incomplete without structured trust signals
- The expanded view should be a designed summary card, not a list of tool calls
- Raw tool traces belong in a third-level audit view, not the second level

## Where It Should Land

Next brief after 067 — requires `/dev-designer` for the trust card spec, `/dev-architect` for engine metadata schema. Should inform `docs/human-layer.md` reasoning display section and `docs/architecture.md` L2 agent output spec.
