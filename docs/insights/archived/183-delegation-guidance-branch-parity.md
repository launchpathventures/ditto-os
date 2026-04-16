# Insight-183: Delegation Guidance Branch Parity

**Date:** 2026-04-14
**Trigger:** Brief 145 review caught that post-creation activation guidance was only added to the new-user delegation guidance branch, missing the established-user compact branch
**Layers affected:** L6 Human (Self system prompt assembly)
**Status:** absorbed → review-checklist.md item 14

## The Insight

When adding behavioral instructions to the Self's delegation guidance in `self.ts`, there are three branches: inbound (async email/voice), established user (compact ~150 tokens), and new user (full ~800 tokens). Instructions added to only one branch create inconsistent behavior — established users (the majority) won't see the guidance.

The compact branch (Insight-170) is deliberately terse to save tokens, so new instructions must be compressed to fit. The pattern: add the full instruction to the new-user branch, then add a compressed one-liner to the established-user branch. The inbound branch may not need it if the instruction is about interactive UI flows.

## Implications

Every future brief that modifies delegation guidance must check all three branches in `self.ts` (lines ~145-230). The Dev Review checklist should include "delegation guidance branch parity" as a check item when any Self prompt changes are involved.

## Where It Should Land

Review checklist (`docs/review-checklist.md`) — add as a check item for Self prompt changes.
