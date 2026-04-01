# Insight-120: Acceptance Criteria Passing Is Not UX Passing

**Date:** 2026-03-31
**Trigger:** User testing revealed Brief 062's 15 AC all "pass" but streaming, thinking, and tool visibility feel broken in practice. Root cause: CLI streaming infrastructure doesn't deliver character-level deltas, so components that work correctly against mock/SDK data never activate their streaming paths in production.
**Layers affected:** L3 Harness, L6 Human
**Status:** active

## The Insight

Acceptance criteria that test "component renders correctly when given streaming events" pass even when the infrastructure never delivers those events. Brief 062 verified that the reasoning panel auto-closes after 3s, that tool labels display human-readable text, that messages queue — but never verified that the Claude CLI connection actually produces `thinking_delta` or `text_delta` events. The AC passed against the component contract, not the user experience.

This is a category error in verification: **unit-level AC can all pass while the integration is broken**. The streaming pipeline has a documented regression (state.md: "Claude CLI stream-json format change") where `stream_event` parsing was removed and `--include-partial-messages` was never added. Every brief since has tested its own layer without verifying the end-to-end path.

## Implications

1. **Every user-facing brief needs at least one "smoke test" AC that tests the full path** — from LLM provider through to what the user sees in the browser. Not "component renders X when given Y" but "user sees X when they send a message."
2. **Mock LLM testing (Brief 054) masks integration failures** — `MOCK_LLM=true` bypasses the real streaming path entirely. E2E tests pass but never exercise the real LLM connection.
3. **The brief template should add a "User Experience Verification" section** — distinct from AC. AC verify the contract; UXV verifies the experience.

## Where It Should Land

Brief template update: add "Smoke Test" section (already partially there in Brief 057 which had the right idea). Dev process update: Builder must verify against at least one real LLM connection before marking complete. Review checklist: add "verified against real connection, not just mock" item.
