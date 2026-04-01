# Insight-125: Internal Activity vs User-Facing Tools Are Different UI Surfaces

**Date:** 2026-03-31
**Trigger:** Building CLI tool visibility in Brief 064 — first attempt grouped ALL tool calls (CLI internal + Ditto's own) into chain-of-thought cards, hiding rich tool output
**Layers affected:** L6 Human, L2 Agent
**Status:** active

## The Insight

Not all tool calls are equal from a UI perspective. There are two distinct categories:

1. **Internal activity** — the AI's working process (reading files, searching code, thinking). These are implementation details. Users may want to see them for transparency/trust, but they're not the point. They should be collapsible and default-collapsed when done.

2. **User-facing tools** — Ditto's own capabilities (search_knowledge, save_process, start_pipeline, generate_process). These produce meaningful output (ContentBlocks, status cards, process proposals) that IS the point. They must render prominently with their full rich output.

Grouping both into a single collapsible container hides the user-facing tool output behind a click. The correct pattern: internal activity groups into collapsible ChainOfThought cards, user-facing tools render standalone through the full Tool component with ContentBlock output.

The distinction maps cleanly to tool naming: CLI internal tools are PascalCase (Read, Edit, Grep, Bash), Ditto tools are snake_case (search_knowledge, save_process).

## Implications

- Any future tool visibility work must maintain this distinction
- The `CLI_INTERNAL_TOOLS` set in `message.tsx` is the authoritative boundary
- When adding new Self tools, they default to user-facing (standalone rendering) unless explicitly added to the internal set
- This pattern will extend to other AI backends — any sub-agent tool calls are "internal activity"

## Where It Should Land

Design constraint in Brief 065 or future conversation polish briefs. May inform `docs/human-layer.md` tool rendering section.
