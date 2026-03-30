# Insight 113 — Self as Workspace Conductor

**Status:** Active
**Source:** Dogfooding — first process creation attempt (2026-03-30)
**Consumers:** cognitive/self.md, self.ts delegation guidance, future surface design

## Observation

When a user said "I need help checking my emails and getting a summary each day," the Self stayed in conversational chat — asking 5 rounds of clarifying questions, then proposing a "Daily Email Digest" as text. It never called `generate_process(save=false)`, which would have activated the process-builder panel and given the user a structured, composable experience.

The architecture was fully wired: `transition-map.ts` routes `generate_process(save=false)` to the process-builder panel, `ProcessProposalBlock` renders structured cards with approve/adjust actions, and the right panel shows emerging steps with executors. None of it activated because the Self didn't know its tool calls shape the workspace.

## Insight

**The Self is a workspace conductor, not a chatbot that happens to have tools.**

Its primary job is recognising the *shape* of the user's intent and moving the workspace into the right mode — not answering messages in chat. Chat is the entry point, not the destination. When a tool can show structure (process builder, briefing panel, artifact mode), the Self must use that tool to transition the workspace rather than describing the structure conversationally.

This applies broadly:
- Don't describe a process in text → draft it in the process builder
- Don't describe a briefing in text → render it in the briefing panel
- Don't describe a review in text → activate the review card
- Don't describe an artifact in text → show it in artifact mode

## Design Principle: Draft-First Refinement

For structurable intents (processes, work items, artifacts), replace extended conversational clarification with **draft-first refinement**:

1. Recognise the structural shape of the intent
2. Draft into structure immediately (call the tool, make reasonable assumptions)
3. The workspace transitions — the user sees concrete structure to react to
4. Refine through the tool, not through chat — each iteration updates the workspace
5. Confirm and commit

A concrete draft surfaces assumptions faster than abstract questions. "I've drafted this with Gmail and a 9am schedule — what would you change?" beats five rounds of "Which provider? What time? What filter?"

## Relationship to Existing Principles

- **Structure is what makes AI useful (Insight-076):** This is the mechanism. The Self is what makes structure appear — by recognising intent and triggering workspace transitions.
- **Composability through blocks (ADR-021/024):** Blocks exist to render structure. The Self must call the tools that produce blocks, not bypass them with text.
- **Quiet oversight (Insight-073):** The workspace does the cognitive work (showing structure). The human does the judgment work (approving, refining).

## Changes Made

1. `cognitive/self.md` — Added "Draft-First Refinement" subsection under Consultative Framing Protocol, with "Structurable intent" row in the calibration table
2. `self.ts` delegation guidance — Added workspace conductor framing, workspace mode transitions section, process creation draft-first protocol with intent signals, and process creation examples in intent routing
