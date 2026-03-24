# Insight-092: Engine Output Is a Protocol, Not a String

**Date:** 2026-03-25
**Trigger:** User question about whether the engine can work independently of the UI, leading to examination of what selfConverse() actually returns
**Layers affected:** L2 Agent, L3 Harness, L6 Human
**Status:** absorbed into ADR-021 (Surface Protocol, accepted 2026-03-25)

## The Insight

The Self's conversational output is currently a plain string. Every surface — Telegram, CLI, web — gets the same text and can only display it as text. This means Telegram can't show inline keyboards for review actions, the web app can't render rich components, and third-party integrators have to parse markdown to understand what the engine is saying.

The engine's output must be a **protocol** — typed content blocks that each surface renders natively. A review card is a review card, whether it appears as an inline keyboard on Telegram, a React component on web, or a formatted prompt on CLI. The engine doesn't know about surfaces; surfaces know about content blocks.

This is distinct from ADR-009's process output architecture. Process outputs are what processes produce (stored, schema'd, catalog-constrained). Surface content blocks are what the Self emits in conversation (ephemeral, conversational, surface-adapted). They compose: process outputs appear inside content blocks when presented to users.

## Implications

- `SelfConverseResult.response: string` → `SelfConverseResult.content: ContentBlock[]`
- Actions (approve, reject, edit, provide input) become first-class action blocks with callback IDs, not text instructions
- Every new surface only needs to implement renderers for the block types — no engine knowledge required
- The Self's output becomes testable against typed blocks, not string matching

## Where It Should Land

ADR-021 (Surface Protocol). Extends the engine's contract with surfaces. Does not change ADR-009 (which governs process outputs) but cross-references it.
