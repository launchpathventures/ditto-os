# Insight-137: Cognitive Framework Token Budget Is Rigid — Every Character Counts

**Date:** 2026-04-01
**Trigger:** Brief 068 build — adding ~500 chars to `cognitive/self.md` caused cascading test failures because the Self context prompt hit the 24K char budget, triggering truncation that removed `<memories>` and truncated `<context>`
**Layers affected:** L2 Agent (Self context assembly)
**Status:** active

## The Insight

The Self's context assembly (`assembleSelfContext`) has a hard 6K token / 24K character budget. The cognitive framework (`cognitive/self.md`) is the largest section, and the remaining sections (delegation guidance, onboarding guidance, work state, context, user model, briefing signal) consume ~9K characters. This leaves only ~250 characters of headroom for cognitive framework additions before the budget truncation logic activates.

The truncation logic has a subtle bug: it subtracts 20 characters for the suffix but the suffix is 24 characters, so truncated prompts always land at exactly `charBudget + 4`. More importantly, truncation removes `<memories>` first (user knowledge), which degrades the Self's personalization — an invisible quality regression that only surfaces as test failures.

When adding to `cognitive/self.md`, every character must be justified. The constraint forces extreme concision, which is actually good — verbose instructions waste context window on every single conversation turn.

## Implications

- Any addition to `cognitive/self.md` must be offset by trimming elsewhere, or must be under ~250 characters net
- The truncation suffix bug should be fixed: `-20` should be `-24` (or better, `-suffix.length`)
- Consider whether delegation guidance (~7.4K chars) could be dynamically loaded based on context rather than always included
- Test the budget with `pnpm test -- src/engine/self.test.ts -t "fits within"` after any self.md change

## Where It Should Land

Brief for context budget optimization (dynamic section loading). The suffix bug should be fixed as a minor cleanup.
