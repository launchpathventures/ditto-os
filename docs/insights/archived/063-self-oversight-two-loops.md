# Insight-063: Metacognitive Oversight — Two Loops for the Self and All Agents

**Date:** 2026-03-23
**Trigger:** PM triage session — reviewing `self.ts` revealed the Self has zero oversight despite being the outermost ring with the widest authority. Creator extended: every agent should operate this way when it counts.
**Layers affected:** L2 Agent, L3 Harness, L5 Learning
**Status:** absorbed — Brief 034a shipped (Self consultation + decision tracking + cognitive framework). Brief 034b shipped (harness-level metacognitive check for all agents). Moved to archived 2026-03-23.

## The Insight

The Conversational Self is currently the only component in Ditto with no oversight mechanism. Every inner layer has trust gates, review patterns, and feedback recording. The Self — the component with the most authority and widest blast radius — has none. It can misinterpret intent, synthesize delegation results incorrectly, answer from stale context, or mediate reviews poorly, all with full confidence and no check.

Great human managers and assistants solve this with two complementary loops:

1. **Internal loop — metacognition.** They check their own thinking before acting. "Am I sure about this? Does this feel right? Am I making assumptions?" This is the ability to monitor and evaluate one's own reasoning in real time. Not a formal review, but a continuous internal quality signal.

2. **External loop — teammate consultation.** They bounce their thinking off a trusted colleague before committing to a direction. Not a full delegation ("go do this work") but a quick check ("does this make sense?"). A good manager doesn't just assign work and synthesize results — they actively seek feedback on their framing, interpretation, and direction before committing.

Neither loop alone is sufficient. Internal-only leads to blind spots reinforcing themselves. External-only is too slow — the Self makes dozens of micro-decisions per conversation (interpret, delegate, synthesize, respond) and can't wait for external validation on each one. The two loops cover different timescales: internal catches errors in the moment, external catches framing errors before they propagate.

**This isn't Self-only.** Every agent should operate in this mode when it counts. A supervised Builder checking its own assumptions before writing code. A Router questioning its classification confidence. The metacognitive capability belongs at the harness level — the harness gets smarter, not individual agents. Trust calibrates when it activates: supervised agents get it automatically (new employees double-check everything), autonomous agents exercise judgment.

### Consultation vs Delegation

| | Delegation | Consultation |
|---|---|---|
| **Purpose** | Execute a task | Validate thinking |
| **Cost** | Full process run (Light/Heavy) | Single LLM call (Inline) |
| **Output** | Work product | Yes/no + reasoning |
| **Harness** | Full pipeline (trust, review, feedback) | None — it's the Self thinking with a teammate's lens |
| **ADR-017 weight** | Light or Heavy | Inline |

## Implications

- The cognitive framework (`cognitive/self.md`) now includes a metacognitive checks section — five pre-action checks (context sufficiency, confidence calibration, assumption detection, scope check, historical check) plus guidance on when to consult a teammate. Shipped 2026-03-23.
- The Self should get a `consult_role` tool — lightweight LLM call with a role's perspective injected, not a full process run. Inline weight class (ADR-017). → Brief 034a.
- Self-level decisions (delegation, consultation, inline response) should be tracked as activities, enabling pattern detection over time. When the human corrects a Self-level decision, that correction feeds into self-scoped memory. → Brief 034a.
- A metacognitive check harness handler should run after step execution, before review patterns. Auto-enabled for `supervised` trust tier, opt-in for others. Different from review patterns: metacognitive check is self-review (same role's lens catching its own contradictions), review patterns are maker-checker (a second perspective). → Brief 034b.
- The feedback-to-memory bridge (L5) extends to Self-level patterns: human corrections of the Self's interpretation, synthesis, or delegation choices feed back into self-scoped memory.

## Where It Should Land

- **Done:** Cognitive framework update (`cognitive/self.md`) — metacognitive checks section added
- **Brief 034a:** Self consultation tool + decision tracking + self-correction memories
- **Brief 034b:** Harness-level metacognitive check handler for all agents (auto-enabled for supervised)
- **Architecture:** ADR-016 Section 7 should acknowledge the two-loop pattern
- **ADR-014:** The cognitive architecture's "executive function" already gestures at this — the Self IS the executive function, and executive functions need metacognitive monitoring. The harness-level handler extends this to all agents.
