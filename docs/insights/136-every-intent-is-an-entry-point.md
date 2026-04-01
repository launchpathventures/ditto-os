# Insight-136: Every Composition Intent Is an Entry Point, Not Just a View

**Date:** 2026-04-01
**Trigger:** PM triage — user pointed out that starting work shouldn't require starting in chat. Users may go directly to Routines or Work and say "I need this done." Self should guide them from any entry point. Also questioned whether sidebar labels map to user mental models.
**Layers affected:** L6 Human
**Status:** active

## The Insight

Composition intents (Today, Inbox, Work, Projects, Routines, Roadmap) are not just views of existing data. Each one is an **entry point for new work** with Self available in context.

The user has four modalities in every intent:
1. **Browse** — see existing items as blocks
2. **Create** — click "New" button → Self guides creation in this context
3. **Template** — pick a template → pre-filled editable block, Self asks about specifics
4. **Converse** — type in prompt input → Self interprets with intent context

Self adapts to the entry modality and the composition intent context. "I need my accounts reconciled" typed in Routines → Self knows it's recurring. Same text typed in Today → Self asks "is this a one-off or recurring?"

The same outcome is reachable from any entry point. The entry point gives Self more context, not a different flow.

### Sidebar Label Problem

Current labels describe Ditto's organizational model, not the user's mental model:
- "Work" is the vaguest word possible — everything is work
- "Work" vs "Projects" distinction is unclear from the outside
- Labels assume the user already knows Ditto's taxonomy

This needs Designer research: what labels map to user mental models? What categorization makes intuitive sense to Rob, Lisa, Jordan, Nadia? The user specifically flagged "Work" as unclear — "where do I go to get things done?"

### Implications

1. **Prompt input in every intent is "talk to Self in this context", not "a chat."** Context parameter passed to Self enables intent-aware responses.
2. **Every intent needs all four modalities:** browse, create (guided), template, converse. Not just empty states with a single action.
3. **Sidebar labels need Designer research.** Current labels may not survive persona testing. The question is: does a non-technical outcome owner intuitively know where to go?
4. **Self must classify-then-route regardless of entry point.** User types in "wrong" intent? Self still gets them to the right outcome. The intent is a hint, not a constraint.

## Where It Should Land

- Designer research: sidebar IA + labeling, persona-tested
- human-layer.md: update composition intents to describe four modalities per intent
- Self behavior spec: context-aware intent parameter, classify-then-route regardless of entry point
- Prototypes: show each intent with browse + create + template + converse modalities
