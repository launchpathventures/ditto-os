# Insight-126: Reasoning Display for Outcome Owners Is Verification Evidence, Not Thinking Trace

**Date:** 2026-03-31
**Trigger:** Reviewing the chain-of-thought/reasoning UI against all four personas — "Thought for 7 seconds" communicates nothing useful to Rob, Lisa, Jordan, or Nadia
**Layers affected:** L6 Human, L2 Agent (tool metadata)
**Status:** active

## The Insight

Every AI product (Claude.ai, ChatGPT, Cursor, Perplexity) frames reasoning display for developers and power users: "Thinking...", timer, monospace trace, token counts. Ditto's personas are outcome owners — they don't care HOW the AI thought, they care WHAT it checked and WHETHER they should trust the result.

The correct framing for non-technical users is **verification evidence**: "Checked 3 sources — pricing, project history, margins" rather than "Thought for 7 seconds." This maps directly to Problem 5 in personas.md: "Every output shows what was checked (pricing check: passed, margin check: 1 warning)."

The three-tier model:
1. **Always visible:** The response (what the user came for)
2. **Glanceable summary:** What was checked (one-line outcome header)
3. **Full detail:** Reasoning text + tool I/O (on expand, for audit)

This reframe turns the reasoning display from a transparency feature into a **trust-building feature** — it actively helps the user decide whether to approve, edit, or reject.

## Implications

- Activity group headers should be outcome-oriented ("Verified pricing and availability") not time-oriented ("Thought for 7s")
- The tool display name map needs outcome-oriented variants alongside the current running/complete labels
- Trust-tier awareness should modulate reasoning visibility (supervised: expanded, autonomous: hidden unless anomaly)
- Anomalies in verification should ELEVATE the activity display, not hide it
- Perplexity's "sources first" pattern is the closest competitive analogue — evidence before conclusion

## Where It Should Land

Constraint in Brief 065 or future reasoning visibility brief. Should inform `docs/human-layer.md` reasoning display section.
