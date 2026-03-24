# Insight-089: Every Real Process Starts with an Artifact, Not a Text Prompt

**Date:** 2026-03-24
**Trigger:** Architecture validation against 6 real businesses — all 33 processes begin with a tangible input artifact (PDF, email, plans, voice note, data entry, enquiry)
**Layers affected:** L1 Process (input model), L2 Agent (input handling), L6 Human (Self's input handling)
**Status:** active

## The Insight

**Converges with Insight-080** ("Beyond Chat — The Artefact is the Primary Surface") from the architecture side. Insight-080 identified this from UX design; this insight confirms it from real-world process validation and adds engine implications.

When we validated 33 real processes across 6 businesses, not a single one starts with a user typing a text prompt. They all start with an artifact arriving:

| Artifact type | Examples |
|--------------|----------|
| **File drop** | Developer PDF brochure, construction plans, broker submission PDF, client passport scan |
| **Email forward** | Customer enquiry, supplier price change, broker placement slip, quote request |
| **Voice capture** | Clinical session notes, on-site job completion, between-jobs capture |
| **Data event** | New order in ERP, claim notification, renewal date approaching, stock level change |
| **Human declaration** | "Henderson bathroom is done", "New client signed up", "Decline this one" |

The implication is that the Self's input handling — the unified input area with text + voice + file attachment — is load-bearing from day one. The Self must:

1. Recognise what kind of artifact arrived
2. Route it to the right process (or create a new work item)
3. Extract structured data from it (document understanding — Insight-088)
4. Present the processed output for review

This validates the Quick Capture design (UX spec section 2.5) but elevates file/document handling from "also supported" to "primary input mode." The 📎 attachment button is as important as the text input.

## Implications

- The Self's intake classifier (system agent) needs artifact-type awareness — not just text classification but file-type recognition and routing
- Process definitions should declare expected input types: `input_types: [document, email, voice, data, text]` so routing can match artifacts to processes
- The conversation-first UX correctly handles this: "Drop the brochure here and I'll get started" is natural. But the engine behind it needs document processing capabilities (Insight-088)
- Email-as-input is a high-priority integration. Steven forwards emails. Rob forwards customer enquiries. Delta receives broker emails. FICO receives client documents via email. Email integration may be the single most valuable first integration for real users.

## Where It Should Land

- Architecture.md Layer 1: process input type declarations
- UX spec: elevate file/document handling in the Self's input design
- Integration priority: email integration should be prioritised early
- System agent (intake-classifier): extend to handle artifact-type routing
