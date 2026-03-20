# Insight-033: The Process Declares Its Context Shape

**Date:** 2026-03-20
**Trigger:** Human feedback during context management research — "a process that involves finding invoices in gmail needs different context than a sales manager process responsible for nurturing relationships"
**Layers affected:** L1 Process, L2 Agent, L3 Harness
**Status:** absorbed into ADR-012

## The Insight

The process definition should declare its **context shape**, not have one inferred. Different processes have fundamentally different context profiles:

- An invoice extraction process needs narrow context: high tool density, structured extraction rules, minimal memory. Token budget tilts toward tool schemas and format specs.
- A relationship nurturing process needs wide context: deep customer history, communication tone preferences, prior interaction patterns, emotional intelligence cues. Token budget tilts toward memory and contextual knowledge.

This is Insight-003 (learning overhead is a dial) applied to the entire context assembly — not just learning overhead, but the shape of what goes into the agent's context window. The dial isn't one-dimensional; it's a profile with multiple knobs.

The process definition is the natural home for this declaration. It already declares inputs, outputs, quality criteria, trust level, and review pattern. Adding a context profile is architecturally consistent.

## Implications

**For process definitions (L1):** Process definitions should include a context profile declaration — or at minimum, hints that the harness uses to assemble context. This could be as simple as weightings (memory: high, tools: low) or as specific as which memory types to prioritise (corrections vs context vs skills).

**For the harness (L3):** The memory assembly handler should read the process's context profile to determine budget allocation, not use a one-size-fits-all split. A 70/30 memory/tool split that works for relationship management would starve an integration process of the tool schemas it needs.

**For the adapter (L2):** The adapter translates the assembled context to the model's format. It should not decide what context to include — that's the harness's job. This separates context engineering (harness) from context delivery (adapter).

## Where It Should Land

- **Architecture spec (L1):** Process definition structure gains a context profile section
- **Architecture spec (L3):** Harness assembly reads process context profile
- **Phase 4 brief (if not yet built):** Context profile as a process definition field
