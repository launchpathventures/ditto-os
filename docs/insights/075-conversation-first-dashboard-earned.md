# Insight-075: Conversation is the Default Surface — Dashboard is Earned

**Date:** 2026-03-24
**Trigger:** Designer self-challenge during Phase 10 UX: "The three-panel layout is a power user pattern. Rob uses WhatsApp, not IDEs."
**Layers affected:** L6 Human (layout hierarchy, entry point), Conversational Self (ADR-016)
**Status:** active

## The Insight

The dashboard/feed should not be the default entry point. The conversation with the Self should be. The structured views (feed, process detail, capability map) are earned surfaces that appear when the user's volume of work demands them — not on day one.

### Why

Our personas (Rob, Lisa, Jordan, Nadia) are non-technical people who are comfortable with conversations, not dashboards. The three-panel layout (sidebar + feed + right panel) is derived from developer tools (Cursor, Linear, IDE patterns). These are excellent tools — for developers. Rob's most complex daily tool is WhatsApp.

A conversation is universally understood. Everyone knows how to talk to someone. A dashboard with cards, filters, action buttons, expand/collapse states — that requires learning a new interface.

### The Layered Reveal

| Layer | When it appears | What the user sees |
|-------|----------------|-------------------|
| **Conversation** | Day 1 (always) | The Self greets, briefs, guides. Approvals, captures, questions — all in conversation. This IS the product for the first week. |
| **Feed** | When volume demands it (~week 2-3, or user asks) | Structured view of everything happening. "You've got a few things going — want to see them all at once?" |
| **Process detail** | When user asks "how does this work?" | Drill-in. On demand. |
| **Capability map** | When enough processes exist | The big picture. Jordan's demo surface. |

### Conversation as Primary Means

For week-1 Rob, approvals happen in conversation:

> Self: "Henderson quote ready — $14,200. Labour might be low for a bathroom. Send as-is, or bump labour to 22 hours like we did on Wilson?"
>
> Rob: "Bump it and send"
>
> Self: "Done — $15,140, sent. I'll remember bathrooms need more hours."

Approval, edit, feedback capture, and "Teach this" — all in one exchange. No cards, no buttons. Just talking.

### Dashboard Still Exists

The dashboard is not eliminated — it's deferred until the user needs it. Lisa at her desk reviewing 10 product descriptions wants to tap through them quickly — the feed with inline actions is perfect for that use case. Jordan showing leadership wants the structured view.

The shift is: **conversation is the default, dashboard is the power mode.** Not the reverse.

### Entry Point Logic

- **New user:** Full-screen conversation. Self greets and begins the relationship.
- **Returning user, low volume (1-3 items):** Conversation-first with the Self briefing proactively. Dashboard available but not primary.
- **Returning user, high volume (5+ items):** Dashboard/feed as default, conversation as right panel. The three-panel layout earns its place.
- **User preference overrides:** If the user prefers the dashboard, they can set it as default. The system learns from behavior.

## Implications

- The MVP entry point should be the Self, not the feed
- The three-panel layout is a progressive reveal, not the starting state
- Week-1 UX must be designed conversation-first — every must-have (feed, review, navigation, process detail) needs a conversational equivalent
- The feed is still built for the MVP — but it's the second surface, not the first
- Trust changes, process refinements, and work creation all have conversational paths as the default
- Button/card-based interactions are the "desk power mode" — faster for batch operations but not the default learning path

## Where It Should Land

- **Phase 10 MVP brief** — entry point hierarchy, progressive layout reveal
- **human-layer.md** — update the Three Modes section to show Conversation as a mode that precedes the others
- **ADR-016** — Self as the primary surface, not just an assistant panel
