# Insight 162: Alex's Email Relationship Lifecycle — From Arms-Length to Embedded

**Date:** 2026-04-07
**Status:** active
**Emerged from:** Brief 098b discussion — what happens when users email Alex, how Alex builds early trust
**Affects:** inbound-email.ts, process templates, onboarding sequence, status composer

## The Core Problem

After signup, Alex sends the action email and then goes quiet until work finishes. The user is left wondering: "Is Alex working? Did he forget about me? Should I check in?" This is the opposite of how a great EA operates.

## Three Interleaved Design Issues

### 1. User emails Alex — the boss is talking

Current `inbound-email.ts` only handles contact replies. When the USER emails Alex, the handler needs to recognise this is fundamentally different from a prospect replying.

**User intent taxonomy:**
- **New request**: "Can you find me accountants in Wellington?" → Create work item, start a process
- **Update/context**: "I met Jane yesterday, it went well" → Record as user model update, acknowledge, update relevant processes
- **Status query**: "What's happening with my outreach?" → Compose real-time status, reply immediately
- **Correction**: "That briefing was wrong about my priorities" → Update user model, acknowledge, adjust
- **Follow-up to Alex's email**: Reply to a specific thread → Route to the related process/step
- **Simple delegation**: "Remind me to call Jane on Friday" → Create work item

**Detection**: The sender's email matches `networkUsers.email` (not just `people.email`). This is the owner, not a contact.

**Key principle**: The user email IS the front-door chat, continued. Same Alex brain (cognitive/core.md), same conversation context, just a different surface. The response should feel like Alex read their email, understood it, and is acting on it.

### 2. Early trust-building cadence — the first 7 days

A new employee who goes quiet feels unreliable. Alex should proactively communicate in the first week:

| Day | What Alex does | Purpose |
|-----|---------------|---------|
| 0 | Welcome + action email | Establish contact, set expectations |
| 1 | "Working on it" progress update | Show Alex is active, not idle |
| 2 | First deliverable (research/briefing) | Demonstrate competence early |
| 3 | Check-in: "How was that? Anything to adjust?" | Invite correction, show attentiveness |
| 5 | Progress + proactive suggestion | Demonstrate initiative, expand value |
| 7 | First weekly briefing | Establish ongoing cadence |
| 7+ | Natural rhythm: weekly briefing + event notifications | Steady state |

This is an **onboarding nurture sequence** — a process template (`user-onboarding-nurture`) that runs for the first 7-14 days with decreasing frequency. After the sequence completes, the weekly briefing takes over.

**Critical**: Every communication is substantive. No "just checking in" filler. Each email either delivers value (research, briefing, suggestion) or seeks understanding (correction, feedback). This builds trust through demonstrated competence, not through noise.

### 3. Proactive suggestions — Alex earns his keep

Alex should notice opportunities and suggest them:
- "I noticed you mentioned property managers — want me to research the top 10 in your area?"
- "Your briefing corrections suggest your priorities have shifted. Want me to adjust your recurring processes?"
- "Three contacts haven't replied in 7 days. Want me to send follow-ups?"

These suggestions should come naturally woven into existing communications (briefings, status updates, completion notifications), not as separate "suggestion" emails.

## Implementation Approach

### Phase 1: User-as-sender detection (immediate)
Add to `inbound-email.ts`: check if sender matches `networkUsers.email`. If yes, route differently — this is a user request, not a contact reply. For MVP, record the email as context and acknowledge ("Got it, I'll work on this"). Full intent classification is a Brief 099 concern.

### Phase 2: Onboarding nurture sequence (next brief)
New process template `user-onboarding-nurture.yaml` chained from intake completion. Runs for 7-14 days with check-ins and suggestions. Trust tier: `autonomous` (this is Alex → User, direct communication).

### Phase 3: Email conversation continuity (future)
Full email-as-conversation: Alex maintains a thread with each user, responds contextually to new emails, delegates to processes as needed. This is the email equivalent of the Self's `selfConverse()` loop.

## The Self IS the Intent Classifier (Architectural Implication)

The Self (`selfConverse()`) already has 19 tools that handle every user intent: `create_work_item`, `start_pipeline`, `get_briefing`, `update_user_model`, `adjust_trust`, `suggest_next`, `get_process_detail`, etc. Building a separate intent classifier for email would duplicate what the Self already does.

The right architecture: route ALL inbound user messages through `selfConverse()`, regardless of channel:
- Workspace → conversation UI → `selfConverse()` (already works)
- Email → AgentMail webhook → `selfConverse(userId, text, "inbound")` → response via `notifyUser()`
- Voice → transcript → `selfConverse(userId, transcript, "inbound")` → response via `notifyUser()`

Same brain, same tools, different surfaces. The Self IS Alex.

## Relationship to Other Insights
- Insight-159 (Self IS Alex): The email conversation is Alex thinking, same brain as the front door chat
- Insight-160 (trust context): User communications are autonomous — no approval needed
- Insight-161 (email/workspace boundary): Email is arms-length but should feel responsive and alive
- Feedback: feedback_proactive_assistant.md — Alex proactively manages focus, attention, opportunities
- Feedback: feedback_onboarding_is_deep_intake.md — Onboarding is multi-session intake across 9 dimensions
