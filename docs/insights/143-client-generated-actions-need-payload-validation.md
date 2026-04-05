# Insight-143: Client-Generated Action IDs Need Payload-Based Validation

**Date:** 2026-04-05
**Trigger:** Building dismiss/accept for Proactive Guidance (Brief 077 follow-up). Dev Reviewer caught HIGH-severity bug where briefing-panel `SuggestionItem` generated action IDs with `Date.now()` at render time, so they were never registered in the session-scoped action registry. Server-side `validateAction()` would reject them.
**Layers affected:** L6 Human (surface actions), L3 Harness (action validation)
**Status:** active

## The Insight

ADR-021 Section 8 established a session-scoped action registry: the Self emits `ActionDef` blocks and server-side pre-registers the IDs. When a surface POSTs an action, the server validates the ID against the registry (single-use, TTL-bounded).

This works perfectly for conversation-sourced actions (blocks flow Self → registry → surface → back). It breaks for **client-rendered suggestions** where the UI component synthesises its own `actionId` at render time (e.g., `suggest-dismiss-${index}-${Date.now()}`). The server has never seen the ID; registry lookup fails; the action is rejected.

There are two valid approaches, and they should co-exist:
- **Registered path** (Self-emitted actions): trust the ID because the server minted it. Single-use consumption from registry.
- **Payload-validated path** (client-rendered actions): trust the *payload shape*, not the ID. Require specific payload fields (e.g., `content` + `suggestionType` for a dismissal). The action ID is opaque — it's the payload the server acts on.

The security guarantee differs: registered IDs authenticate "the Self said this"; payload validation authenticates "the request carries the fields needed to perform this specific operation safely." Both are acceptable when the operation's blast radius matches the validation strength.

## Implications

- The surface-action handler must branch on action *type* **before** registry validation for client-generated namespaces (suggestions, briefing-panel actions, dashboard tiles). Consume from registry if present (for the conversation path), skip if not.
- Payload shape is part of the contract: the server MUST reject if required fields (`content`, `suggestionType`) are absent, even if the action namespace matches.
- Operations eligible for the payload-validated path must be **low blast-radius** (idempotent or reversible): recording a dismissal, dispatching a conversational nudge. High-radius operations (running a process, editing an entity) should stay on the registered path.
- When UIs render their own action IDs, they must attach the full payload the server will need — the ID carries no context beyond namespace routing.

## Where It Should Land

`docs/adrs/021-surface-actions.md` — add Section 8.1 "Client-Generated Actions" documenting the dual validation model, the payload-shape contract, and the blast-radius rule for choosing between registered vs payload-validated paths.
