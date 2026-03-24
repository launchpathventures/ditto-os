# Insight-073: The UI Uses the User's Language, Not System Language

**Date:** 2026-03-23
**Trigger:** User correction during Phase 10 UX planning: "goals tasks and outcomes is foreign language to our end users — we need to be super mindful of using simple, everyday language"
**Layers affected:** L6 Human, Conversational Self (ADR-016)
**Status:** active

## The Insight

The system's internal taxonomy (work items, goals, tasks, outcomes, insights, processes, steps, trust tiers) must never be the user's vocabulary. The user speaks in their own words — "get the Henderson quote done by Friday," "sort out the invoicing mess," "send morning updates to suppliers." The system does all the classification, decomposition, and organization work invisibly.

This is the "structure is the product" principle (Insight-030) applied to language: the system provides the structure without requiring the user to learn structured vocabulary. The cognitive work of classification belongs to the system, not the user.

### What This Means Concretely

**The user's words become the labels.** When the user says "Henderson quote by Friday," the system creates a work item internally classified as a deadline-bound task, but the UI shows "Henderson quote — Friday" with a progress indicator. Not "Task: Henderson Quote" or "Goal: Complete Henderson Proposal."

**System concepts are invisible unless requested.** The user never sees:
- "Goal" / "Task" / "Outcome" / "Insight" as labels in the UI
- "Process" as a visible concept (they see "the plan" or "how this works")
- "Trust tier" as a label (they see "I'm checking everything" → "running smoothly")
- "Work item" as a term (they see their thing — the quote, the invoicing, the updates)

**The Self speaks naturally.** Not "I've created a goal with three child tasks" but "Here's how I'd tackle the invoicing — three steps. Want me to go ahead?"

**System language exists for power users on demand.** A user who wants to see the process YAML, the trust data, the work item taxonomy — they can drill in. But the default surface is their language, not ours.

### How the System Bridges the Gap

The Self does the translation:
- User input (natural language) → Self classifies internally (goal? task? recurring? one-off? research?)
- Internal classification drives routing, decomposition, process generation
- UI renders using the user's original words + progress/status indicators
- The Self's responses use the user's framing, not system terminology

This means the intake-classifier, router, and orchestrator all work on internal types — but those types never surface to the user unless they ask.

### Trust Language Specifically

The trust tiers (supervised, spot-checked, autonomous, critical) are system concepts. The user equivalent:

| System term | User experience |
|-------------|----------------|
| Supervised | "I'm reviewing everything" (early days, new process) |
| Spot-checked | "I check in occasionally" (building confidence) |
| Autonomous | "Running smoothly" (earned trust, quiet) |
| Critical | "Always needs my sign-off" (high-stakes, permanent) |

The trust control UI (Primitive 11) can use a slider without labels, or use natural language: "How closely do you want to watch this?" with a spectrum from "check everything" to "let it run."

## Implications

- Every UI string, label, and heading must be reviewed against this principle before shipping
- The Self's system prompt must instruct it to mirror the user's language, not introduce system vocabulary
- Feed items use the user's words: "Henderson quote: draft ready" not "Process step 4 complete"
- The process view (when drilled into) can use slightly more structured language since the user chose to look at the details
- Onboarding must never require learning Ditto's vocabulary — the system adapts to the user's vocabulary
- Search must work with the user's words, not system terms — "invoicing" finds the invoicing work even if internally it's tagged as a goal with three child tasks

## Where It Should Land

- **Phase 10 MVP brief** — as a hard design constraint on all UI copy
- **cognitive/self.md** — Self communication principles must include "mirror the user's language"
- **human-layer.md** — review all 16 primitives for system vocabulary leaking into user-facing labels
- **ADR-011** — trust tier language in the UI should use natural descriptions, not tier names
