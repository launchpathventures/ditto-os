# Insight-131: Polishing a Chat Wrapper Is Not Building the Product

**Date:** 2026-04-01
**Trigger:** PM triage of Briefs 057-068. Despite 7 completed briefs, the conversation still feels like wrapped Claude/ChatGPT. No composable blocks appear in regular conversation. Reasoning/chain-of-thought is developer-oriented and clunky.
**Layers affected:** L2 Agent, L6 Human
**Status:** active

## The Insight

Briefs 057-068 incrementally improved *how a chat wrapper renders* — streaming cursors, tool compaction, reasoning panels, confidence cards. These are all patterns borrowed from ChatGPT/Claude's own UI. They make a better chat wrapper, not a better Ditto.

The fundamental gap: **Self responds with text. The 22 ContentBlock types exist in the engine, the block registry renders them, but Self never emits them in regular conversation.** Rich blocks only appear in specific flows (onboarding, artifact mode). For everyday conversation, the user sees text + developer-oriented activity traces.

The 36 prototypes show conversations with inline records, metrics, checklists, data tables, progress indicators. The briefs since 057 don't reference a single prototype. They pattern-matched against existing AI chat products instead of implementing Ditto's own vision.

**Polishing how text renders is necessary but insufficient. The product difference is in what Self produces — structured, composable blocks — not in how streaming text animates.**

## Implications

1. Self needs a mechanism to emit ContentBlocks inline during conversation — not just text responses with occasional tool traces
2. The prototypes must be wired into the brief process as the north star, not just as archived HTML files
3. Briefs 062/063/066/067 (all pending) should be reassessed — they continue the chat-wrapper polish pattern
4. Chain-of-thought / reasoning display needs a non-technical-user mode, not just developer-oriented reframing

## Where It Should Land

Architecture spec L6 (Human Layer) — conversation rendering must be block-first, not text-first. Brief constraints for all future conversation work must reference the relevant prototype.
