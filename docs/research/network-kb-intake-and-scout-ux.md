# Network KB Intake and Scout UX

**Date:** 2026-05-12
**Status:** Supporting interaction spec for Brief 258

## Purpose

Experts need to give Alex/Mira source material, correct extracted facts, and choose what can be repeated publicly. Clients need the “scan on + off network” action to produce source-grounded candidates without leaking budgets or private filters.

## Expert Lane: Knowledge Shelf

After a profile/handle exists, show a compact shelf beside or below the profile preview:

- Upload source.
- Talk for 5 minutes.
- Add fact manually.
- Private filters.

Rows show fact text, source label, `Public / On-request / Off` visibility, edit, and archive controls. Default visibility is `on-request`.

## Voice Intake

V1 is browser-transcript-first. If browser speech recognition is unavailable or permission is denied, fall back to a pasted/reviewed transcript. Raw transcripts stay source material; public surfaces cite approved facts/source labels only.

## Private Filters

Anti-persona rules live separately from public facts. They are visible only to the owner and must never be quoted into rationale, visitor, share, or public profile copy.

## Client Lane: Scout Report

The parent CTA becomes a real scout entry point after the job request card exists. It needs loading, cached, empty, error, and success states. Success returns a short review summary plus mixed candidate list.

Scouted candidates must show a public source label/link/snippet and must not look like existing Ditto handles. CTA copy stays side-effect-free until Brief 261.

## Responsive Requirements

Desktop keeps chat/profile primary and renders shelf/candidate panels without resizing the chat column. Mobile stacks sections; segmented controls and candidate source labels must not clip.

## Reference Anchors

- Parent Brief 254 Surface E.
- Refero Preply voice screen `11ff0f24-f79c-4f1e-b459-0b30f5caa285`.
- Refero Mocha Knowledge screen `ae89d253-e3c2-4db4-b38f-752f88e28f5e`, flow `11618`.
- Refero Homerun candidates screen `bbeedb75-72bc-43c1-b6dc-18485b9863a2`.
- `docs/research/confidence-trust-card-ux.md`.
- `docs/research/ai-chat-ux-patterns-competitive-audit.md`.
