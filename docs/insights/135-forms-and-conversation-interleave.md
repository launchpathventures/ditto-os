# Insight-135: Forms and Conversation Interleave, Not Compete

**Date:** 2026-04-01
**Trigger:** PM triage — user challenged "no CRUD forms" dogma with Paperclip.ai reference and test case: "reconcile my accounts — get invoices from Gmail and add them to Xero." Pure conversation makes structured data ambiguous. Pure forms can't handle judgment.
**Layers affected:** L6 Human, L1 Process
**Status:** active

## The Insight

The previous stance ("no CRUD forms, everything through conversation") was too ideological. The right model is: **forms for known structure, conversation for judgment and intelligence. They interleave within the same flow, not compete as separate modes.**

When a user says "reconcile my accounts — get invoices from Gmail and add them to Xero," Self responds with a structured process proposal AS AN EDITABLE BLOCK inside the conversation. The user can directly edit fields (name, trigger, steps, connections) without describing changes in words. For the parts that require judgment (matching logic, quality criteria, edge cases), conversation continues. OAuth flows use structured auth forms. Review uses inline approve/edit/reject actions.

The interleave pattern:

| Data type | Right input | Why |
|-----------|------------|-----|
| Names, dates, triggers, selections | Form fields / dropdowns | Verifiable at a glance, directly editable |
| OAuth, credentials, connections | Structured auth flow | Security, trust, explicit |
| Step reordering, adding, removing | Direct manipulation | Faster than describing changes |
| Quality criteria, matching logic, edge cases | Conversation with Self | Requires judgment, context, back-and-forth |
| Review/approval | Inline action buttons | One click, not a paragraph |
| Strategic questions, prioritization | Conversation | AI intelligence is the value |

This is NOT "sometimes forms, sometimes chat." It's BOTH in the SAME flow. A process proposal block is editable (form) AND sits in the conversation (chat) AND Self can discuss the judgment parts (AI). The block is the bridge.

## Trust Implications (Personas)

Trust comes from:
- **Seeing structured data you can verify** (forms show exactly what's captured)
- **Being able to directly edit** (not "please change step 3 to...")
- **AI explaining its reasoning** (conversation for judgment calls)
- **AI adapting to your corrections** (learning from edits)

Trust erodes from:
- Ambiguity ("did it understand me?") — solved by structured display
- Black boxes ("what's it doing?") — solved by visible steps
- All-or-nothing ("I can't partially override") — solved by inline editing

The "robust" feeling comes from structured data you can see and edit + AI intelligence you can interrogate. Either alone isn't enough.

## Implications

1. **ContentBlocks must support inline editing.** Process proposal blocks, work item blocks, routine blocks — all need editable fields, not just display. This is a block capability, not a separate form system.
2. **Self must know when to propose structure vs when to converse.** Creating a process → propose editable block. Defining matching logic → converse. This is a Self routing decision.
3. **Corrects Insight-133's "no bespoke screens" overclaim.** Composition intents still don't need separate CRUD pages, but blocks within them DO need form-like editing capabilities.
4. **Paperclip.ai pattern validated.** Structured creation + AI expansion is the right hybrid. Adopt the pattern.
5. **ADR-021 (Surface Protocol) needs a block capability flag for editability.** Some blocks are display-only (TextBlock), some are interactive (ProcessProposalBlock, WorkItemBlock).

## Where It Should Land

- ADR-021: add "editable" capability flag to ContentBlock types
- human-layer.md: update interaction model to explicitly describe form+conversation interleave
- Block type additions: ProcessProposalBlock (editable), WorkItemEditBlock (editable), ConnectionSetupBlock (auth flow)
- Self behavior spec: when to propose editable blocks vs when to converse
- Prototypes: create examples showing the interleave flow for test cases
