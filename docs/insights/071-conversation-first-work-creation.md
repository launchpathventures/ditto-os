# Insight-071: Every Piece of Work Should Start as a Conversation

**Date:** 2026-03-23
**Trigger:** User statement during Phase 10 UX planning: "Every piece of work should arguably kick off as a conversation so it can be properly defined"
**Layers affected:** L6 Human (work creation UX), L1 Process (work item lifecycle), Conversational Self (ADR-016)
**Status:** active

## The Insight

Work creation in Ditto should not be a form — it should be a conversation. The user expresses intent ("I need to follow up with Henderson about the invoice"), and the Self helps define what that means: Is this a task for an existing process? A new goal that needs decomposition? A question that needs research? An insight to capture?

The conversation does the cognitive work of classification, scoping, and routing that forms and dropdowns push onto the user. The user says what they need; the Self figures out what kind of work item it is, which process handles it, what context is needed, and creates the properly structured work item as an outcome of the conversation.

This is distinct from Quick Capture (Primitive 12), which is frictionless but dumb — dump text, auto-classify later. Conversation-first work creation is intentional — the user and the Self align on what the work actually is before it enters the system. Quick Capture is the fast path for context; conversation is the proper path for work.

The two paths coexist:
- **Quick Capture** — "just remember this" (context, notes, raw input → auto-classify)
- **Conversation** — "I need this done" (intent → Self helps define → structured work item)

Both feed into the same intake pipeline (classify → route → execute), but conversation produces better-defined work items because the Self has already clarified scope, type, and context.

## Implications

- The conversation surface is not just for process definition (Primitive 8) — it's the primary work creation surface
- The Self needs work creation tools: `create_work_item`, `decompose_goal`, `assign_to_process`, `clarify_scope`
- Forms/dialogs for work creation should still exist for power users (keyboard shortcut, command palette) but conversation is the default path
- Every work item should carry a `createdVia` field: "conversation", "quick_capture", "trigger", "system" — this data helps the Self learn what kind of work the user brings
- Goal decomposition should be conversational: "I want quotes under 24 hours" → Self asks about current state, constraints, sub-goals → structured goal with tasks
- This connects to Insight-049 (Consultative, Not Configurative) — the Self consults with the user to define work, it doesn't present a form

## Where It Should Land

Phase 10 MVP brief — work creation interaction model. Self delegation tools (extend from current 5 tools). ADR-016 — Self as work creation mediator. human-layer.md — Primitive 12 (Quick Capture) needs a companion "Conversation Capture" pattern.
