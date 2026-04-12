# Brief: Front Door → Relationship Lifecycle — Parent Design

**Date:** 2026-04-10
**Status:** draft
**Depends on:** Brief 118 (Operating Cycle Self-Tools), Brief 105 (Professional Consent Model)
**Unlocks:** Briefs 121-125 (sub-briefs below)

## Goal

- **Roadmap phase:** Phase 9: Network Agent Continuous Operation
- **Capabilities:** Conversation-aware process execution, persistent user chat, ghost mode, adaptive nurture

## Context

Stress testing the front door → email → ongoing relationship flow revealed 10 gaps across prompt quality, process primitive wiring, user visibility, and two deferred capabilities (ghost mode, workspace lite). The infrastructure is 60-65% built for both deferred items. The core problem: processes treat email as a delivery channel (fire-and-forget) rather than a conversation. A real advisor has ONE ongoing conversation, adapts based on engagement, and earns trust before acting with more autonomy.

Insight 171 (Conversation-Aware Process Primitives) defines four new step primitives (`wait_for`, `gate`, `email_thread`, `schedule`) that are already in the `StepDefinition` type but not wired to the heartbeat. This parent brief designs how all pieces fit together.

## Objective

Close all gaps between the front door chat and ongoing relationship management, extracting every fix as a reusable harness pattern that applies to all processes — not just front-door-intake.

## Non-Goals

- Cross-user pattern learning (aggregate outcome tracking across users)
- Full workspace provisioning (this is workspace LITE — persistent chat, not a full workspace)
- Voice capture / dictation
- Mobile-specific UI redesign (magic link + chat page must work on mobile, but no native app work)

## Architecture Impact

| Layer | Impact |
|-------|--------|
| L1 Process | Four new step primitives evaluated by heartbeat |
| L2 Agent | Voice model collection, identity-aware email formatting |
| L3 Harness | Ghost mode cognitive extension, silence condition injection |
| L4 Awareness | Email thread state propagation across process chains |
| L5 Learning | Passive voice model extraction from user emails |
| L6 Human | Magic link auth, persistent chat surface, outreach visibility |

## Sub-Briefs

| # | Brief | Scope | Depends On | Complexity |
|---|-------|-------|-----------|------------|
| 121 | Process Primitive Wiring | `schedule`, `wait_for`, `gate`, `email_thread` + `parseDuration` | None | L |
| 122 | Front Door Prompt Quality | Time promises, temporal context, judgment framework, strategy framing | None | S |
| 123 | Workspace Lite (Magic Link) | Magic link auth, `/chat` route, persistent conversation, session rolling TTL | 121 (email_thread) | M |
| 124 | Ghost Mode | Cognitive extension, voice collection, voice application, identity-aware email | 121 (wait_for, gate) | L |
| 125 | Outreach Visibility + Cancellation | Full body storage, email-initiated cancellation detection | 121 (email_thread) | M |

Build order: 121 + 122 (parallel) → 123 + 125 (parallel) → 124

## Reusable Patterns Produced

| Pattern | Layer | Reuse Surface |
|---------|-------|---------------|
| `parseDuration()` | `@ditto/core` | schedule, wait_for, chain delays |
| Step delay (schedule) | heartbeat | Any timed sequence |
| Reply suspension (wait_for) | heartbeat + inbound-email | Any send-then-wait flow |
| Engagement gate | heartbeat | Any adaptive sequence |
| Email thread propagation | heartbeat + channel | Any multi-email flow |
| Temporal context injection | prompt builder | Any user-facing prompt |
| Magic link authentication | web + channel | Any authenticated surface |
| Passive voice model collection | inbound-email | Ghost mode, brand voice |
| Identity-aware email formatting | channel | Ghost, agent-of-user, principal |
| Intent detection (cancellation) | inbound-email | Any "stop" intent |

## User Experience

- **Jobs affected:** Orient (temporal context), Capture (magic link chat), Review (outreach visibility), Delegate (ghost mode trust)
- **Primitives involved:** Conversation (persistent chat), ContentBlock (outreach text display), TrustControl (ghost mode critical tier)
- **Process-owner perspective:** The user experiences Alex as a single continuous relationship across chat and email. Every email from Alex includes a link back to chat. The user can see what Alex sent on their behalf. They can cancel via email reply. Ghost mode lets Alex act as them with earned trust.
- **Designer input:** Not invoked — lightweight UX section. Magic link flow follows standard patterns (Slack, Notion).

## Acceptance Criteria

See individual sub-briefs (121-125). Parent brief acceptance:

1. [ ] All four process primitives (`schedule`, `wait_for`, `gate`, `email_thread`) are evaluated by the heartbeat
2. [ ] Front door prompt contains no specific time promises and includes current day/timezone
3. [ ] User can click a magic link in any Alex email and land in persistent chat with full history
4. [ ] Ghost mode sends email without Ditto branding, using user's voice, at critical trust tier
5. [ ] User can see the actual text Alex sent to prospects
6. [ ] User can reply "cancel" to any Alex email and halt the associated process
7. [ ] All patterns are extracted as reusable primitives (not one-off hacks)

## Review Process

1. Each sub-brief undergoes independent review against `docs/architecture.md` + `docs/review-checklist.md`
2. Parent brief reviewed for coherence across sub-briefs
3. Human approves parent + sub-briefs as a set

## After Completion

1. Update `docs/state.md` with all completed capabilities
2. Update `docs/roadmap.md` Phase 9 status
3. Update `docs/architecture.md` Layer 1 (new step primitives) and Layer 6 (magic link surface)
4. Write ADR for magic link authentication pattern
5. Update Insight 171 with implementation learnings
6. Phase retrospective
