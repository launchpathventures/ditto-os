# Insight-132: The Autonomous Build Loop IS the Product

**Date:** 2026-04-01
**Trigger:** PM triage of UI briefs 057-070. User pointed out that despite having a heartbeat, orchestrator, trust tiers, and dev-pipeline in the engine, there is no UI surface to set a goal, queue briefs, control supervision, or watch autonomous execution. The chat input is the only interaction point.
**Layers affected:** L3 Harness, L6 Human
**Status:** active

## The Insight

The conversation surface improvements (Briefs 066-070) polish the chat wrapper. But the user's actual need is to set a goal ("implement these 3 briefs"), calibrate supervision ("autonomous for PM/Documenter, supervised for Builder/Reviewer"), and walk away while the heartbeat executes. This is not a future feature — it is the core value proposition of Ditto.

The engine already has the pieces: heartbeat loops within a pipeline run, orchestrator decomposes goals into tasks, trust tiers gate human involvement, dev-pipeline routes through 7 roles. But these are CLI-only, unproven end-to-end for chained brief execution, and invisible in the UI.

The critical missing concept is a **brief queue** — the heartbeat currently runs within a single pipeline run but doesn't scan for "next approved brief to implement." Without this, autonomous multi-brief execution requires manual coordination (exactly what Ditto is supposed to eliminate).

## Implications

1. **Priority inversion:** Conversation polish (069/070/063) should yield to goal-setting, pipeline visibility, and supervision controls in the UI. The chat is a means, not the product.
2. **Engine gap:** Heartbeat needs a queue-scanning mode — after completing a pipeline run, check for next approved brief and start it. This is a small engine addition but unlocks the entire autonomous build loop.
3. **UI gap:** Need surfaces for: goal creation, brief approval/queue management, supervision level controls, pipeline progress visibility, review gate interaction. These are the "missing critical screens" (feedback memory).
4. **Dogfooding opportunity:** If Ditto can autonomously build its own briefs in sequence, that IS the demo. Every other use case follows.

## Where It Should Land

- Architecture spec update: heartbeat queue-scanning mode
- New briefs: goal-to-pipeline UI flow, brief queue engine concept
- Supersedes conversation polish briefs as priority (069/070/063 remain valid but lower priority)
- Informs ADR on trust tier UX (goal-level supervision settings)
