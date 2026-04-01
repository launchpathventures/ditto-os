# Insight-134: Composition Intents Need Action Affordances

**Date:** 2026-04-01
**Trigger:** PM triage — user clicked through sidebar (Today, Projects, Work, Routines, Roadmap) and found no clear path to action. No way to create a project, start work, or understand what to do. Product feels unclear and unstructured.
**Layers affected:** L6 Human, L3 Harness
**Status:** active

## The Insight

The architecture says "conversation is the primary interaction" and Self routes everything. But composition intents (Today, Inbox, Work, Projects, Routines, Roadmap) are currently empty containers with a chat input. The user has no idea what to do.

This is NOT solved by building CRUD screens (that's Monday.com — see feedback: "not a project management tool"). And it's NOT solved by "just type in the chat" (that's the chat wrapper trap — Insight-130).

The resolution is a third pattern: **composition intents provide contextual action affordances that route through conversation with Self.**

Each composition intent has three states:
1. **Empty state** — clear explanation of what this context is for + primary action button + suggested prompts. The action button starts a conversation with Self in that context (e.g., "Start a project" opens conversation where Self does goal framing).
2. **Active state** — ContentBlocks showing existing items (projects, work items, routines) with inline actions (continue, review, prioritize). Self proactively populates suggestions.
3. **Rich state** — as trust and usage grow, Self adds proactive intelligence: "Project X is stalled," "3 reviews waiting," "here's what I'd prioritize today."

The conversation always happens in the CONTEXT of the composition intent. When you're in Projects and start a conversation, Self knows you're creating/working on a project. When you're in Routines, Self knows you're defining a recurring process. Context drives behavior.

Critically: the action affordances (buttons, suggested prompts, proactive suggestions) are themselves ContentBlocks. They're not bespoke UI — they're blocks that Self and the composition engine produce based on the current context and state.

## Implications

1. **Every composition intent needs a designed empty state, active state, and rich state.** These are not separate screens — they're different block compositions produced by the composition engine based on data state.
2. **Self must be context-aware.** When a conversation starts from Projects, Self's intake classification and goal framing should be scoped to project creation/management. This is a Self capability, not a UI capability.
3. **Action buttons route to conversation, not to forms.** "Start a project" → conversation with Self → Self does goal framing → output becomes project work item → blocks render back into Projects view.
4. **Prototypes already show some of this** (P13-daily-workspace, P25-tasks, P29-process-model-library) but the intent-to-action flow isn't explicit.
5. **This is orthogonal to the orchestrator wiring (engine gap).** Even without auto-chaining, users need to know WHERE to start and WHAT they can do.

## Where It Should Land

- human-layer.md: update composition intent specs with empty/active/rich states and action affordances
- Brief needed: composition intent action affordances (pure UI + Self context-awareness)
- Prototypes: update or create prototypes showing empty → active → rich state per intent
- Self tools: add context parameter to conversation initiation so Self knows which intent launched the conversation
