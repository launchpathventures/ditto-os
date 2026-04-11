# Insight-165: Cognitive Mode Extensions Are Judgment Shifts, Not Persona Switches

**Date:** 2026-04-09
**Trigger:** Designing mode-dependent cognitive extensions. The temptation was to create "persona prompts" that change Alex's voice per mode. But the actual need is different — the voice stays constant (character bible handles that), what changes is the judgment calibration.
**Layers affected:** L2 Agent (cognitive context assembly), L3 Harness (mode-aware context injection)
**Status:** active

## The Insight

Mode extensions are NOT persona definitions. They don't change who speaks or how they sound — the character bible handles voice. Mode extensions change how the same entity THINKS about the same types of decisions.

The critical distinction: a mode extension adjusts the metacognitive checks' thresholds, not the communication style. "Should I send this?" has a different confidence bar in connecting mode (high — Alex's institutional reputation) vs selling mode (moderate — the user's brand tolerance). But the way Alex speaks when refusing is always Alex's voice.

This means mode extensions are purely cognitive infrastructure — they belong in the cognitive layer alongside core.md and self.md, not in the persona/character layer. They're loaded into the system prompt as judgment calibration, not as personality instructions.

The practical consequence: mode files are short (~250 tokens), structured around 6 dimensions (optimization target, threshold calibration, heuristics, refusals, escalation, silence), and deliberately exclude voice/tone guidance. If you find yourself writing "Alex should sound..." in a mode file, you're in the wrong layer.

## Implications

1. **Separation of concerns is load-bearing.** Character bible = voice. Mode extensions = judgment. Core.md = universal values. These three layers compose but don't overlap.
2. **Mode extensions are safe to load mechanically.** Because they only adjust thresholds (not identity), loading the wrong mode degrades judgment quality but doesn't create identity confusion.
3. **The token budget works because mode files are pure calibration.** No voice examples, no sample messages, no personality traits. Just: what to optimize for, when to act, when to refuse, when to escalate.

## Where It Should Land

- `docs/architecture.md` — cognitive architecture cross-cutting section should reference mode extensions as a judgment calibration layer
- ADR-014 — could be extended with a note about mode-dependent cognitive context
- `cognitive/modes/README.md` — already captures this (written during this session)
