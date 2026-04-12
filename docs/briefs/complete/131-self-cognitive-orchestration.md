# Brief: Self Cognitive Orchestration + Email-to-Chat Escalation

**Date:** 2026-04-11
**Status:** complete
**Depends on:** Brief 130 (Thin Process Templates)
**Unlocks:** Adaptive relationship management, proactive context gathering

## Goal

- **Roadmap phase:** Phase 10: Cognitive Autonomy
- **Capabilities:** Self-driven work orchestration, cognitive mode orchestration guidance, email-to-chat escalation for rich context gathering

## Context

With staged outbound tools (Brief 129) and thin process templates (Brief 130) in place, the Self can now spawn adaptive processes where the agent exercises judgment. What's missing:

1. **The Self doesn't know how to orchestrate work adaptively.** It has `start_dev_role` which spawns a fixed process. It needs a tool that spawns thin processes and can adapt them based on context — choosing the right template, injecting relevant context, and adjusting mid-flight.

2. **Cognitive modes don't guide orchestration.** The modes (connecting, selling, ghost, chief-of-staff) guide judgment WITHIN a step but don't guide the Self on HOW to orchestrate work: when to research vs draft, when to escalate to chat, when to adjust strategy based on results.

3. **Email can't escalate to chat.** When a user replies with a complex new request that needs rich context gathering ("can you also help me prep for a board meeting?"), the Self handles it entirely in email — one reply, limited context. A real advisor would say "let me ask you a few questions" and start a focused conversation.

## Objective

The Self becomes a cognitive orchestrator that reasons about what work to do, spawns thin processes, and can escalate email conversations to focused chat sessions when richer context gathering is needed.

## Non-Goals

- Changing the heartbeat or harness pipeline (those are stable)
- Building new process templates (Brief 130 handled that)
- Changing the front door conversation (already cognitive)
- Building a full task management UI (workspace feature, separate work)
- Auto-generating processes from scratch (the Self selects from existing thin templates + adapts)

## Inputs

1. `src/engine/self-delegation.ts` — current Self tool surface
2. `src/engine/self.ts` — Self context assembly
3. `cognitive/modes/connecting.md` — current mode file (adding orchestration section)
4. `cognitive/modes/selling.md` — same
5. `cognitive/modes/chief-of-staff.md` — same
6. `src/engine/inbound-email.ts` — where user email requests arrive
7. `src/engine/magic-link.ts` — magic link generation for chat escalation
8. `docs/adrs/027-cognitive-orchestration.md` — accepted architectural decision

## Constraints

- The `orchestrate_work` tool reuses existing infrastructure: `startSystemAgentRun()` for process spawning, `adapt_process` for mid-flight adaptation
- Email-to-chat escalation must be a cognitive decision (Self decides when chat is better than email) not a hardcoded rule
- Cognitive mode orchestration sections must be compact (<100 tokens each) to stay within the Self's context budget
- The Self must NOT bypass process boundaries — it orchestrates processes, it doesn't execute outbound actions directly
- Magic link generation reuses Brief 123 infrastructure

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Self as orchestrator | ADR-016, ADR-027 (Ditto) | adopt | Self is the outermost harness ring |
| Email-to-chat escalation | Intercom Resolution Bot | pattern | Bot detects complexity, offers live chat |
| Cognitive orchestration guidance | cognitive/modes/ (Ditto) | adopt | Existing mode files, adding orchestration section |
| adapt_process for mid-flight changes | ADR-020 (Ditto) | adopt | Already built, enables runtime process adaptation |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/self-delegation.ts` | Modify: Add `orchestrate_work` tool. Accepts: goal description, detected mode (connector/sales/cos), conversation context, user details. Selects the right thin process template, spawns it with `startSystemAgentRun()`, injects context. Can adapt mid-flight via existing `adapt_process`. Returns: process run ID, what was started, expected next steps. |
| `cognitive/modes/connecting.md` | Modify: Add "## Orchestration" section (~80 tokens). "Research before drafting. Verify mutual value before contacting. Report back after acting. Adjust targets based on response rates. When a new request needs clarification, offer a focused chat." |
| `cognitive/modes/selling.md` | Modify: Add "## Orchestration" section (~80 tokens). "Understand the prospect's pain before reaching out. Personalize heavily. Track responses and adapt messaging. When the user wants to change positioning, escalate to chat for a proper conversation." |
| `cognitive/modes/chief-of-staff.md` | Modify: Add "## Orchestration" section (~80 tokens). "Observe before advising. Batch updates into briefings. Surface decisions, don't make them. When the user's priorities shift, gather context via chat before restructuring." |
| `src/engine/self.ts` | Modify: In `selfConverse()`, when handling inbound email with a complex new request, the Self can generate a magic link and include it in its reply: "I'd love to help with that — let me ask a few quick questions. [Continue in chat →]". This is a cognitive decision based on request complexity — not a hardcoded threshold. |
| `src/engine/inbound-email.ts` | Modify: When routing user emails to Self via `selfConverse()`, include a flag indicating the Self can offer chat escalation (magic link URL generation is available). The Self decides whether to use it. |

## User Experience

- **Jobs affected:** Delegate (users delegate to a thinking orchestrator), Capture (chat escalation for rich context)
- **Primitives involved:** Conversation (focused chat sessions for context gathering), Email (Self responds adaptively), Magic Link (escalation bridge)
- **Process-owner perspective:** "I emailed Alex saying I also need help with a proposal. Instead of a one-line reply, Alex said 'let me ask you a few questions' and sent me a link. I clicked it, answered 4 questions in a quick chat, and Alex started working on it. That felt like talking to a real person."
- **Interaction states:**
  - Simple email request → Self handles inline (reply with action)
  - Complex email request → Self offers chat escalation ("Let me ask you a few questions: [link]")
  - Chat session → focused GATHER conversation → Self spawns thin process → reports back in email thread
- **Designer input:** Not invoked — behavioral change via existing surfaces

## Acceptance Criteria

1. [ ] `orchestrate_work` tool exists on the Self's tool surface
2. [ ] The tool accepts: goal, detectedMode, conversationContext, userDetails
3. [ ] The tool selects from existing thin process templates (front-door-intake, user-nurture, follow-up-sequences, etc.)
4. [ ] The tool spawns processes via `startSystemAgentRun()` (existing infrastructure)
5. [ ] Cognitive mode orchestration sections exist in connecting.md, selling.md, and chief-of-staff.md
6. [ ] Each orchestration section is ≤100 tokens
7. [ ] Orchestration guidance is judgment-based ("research before drafting") not prescriptive ("Step 1: research")
8. [ ] When the Self handles a complex user email request, it can generate a magic link and include it in the response
9. [ ] The escalation decision is cognitive (Self decides based on complexity) not hardcoded
10. [ ] The focused chat session is pre-seeded with context from the email request
11. [ ] After chat context gathering completes, the Self spawns the appropriate thin process
12. [ ] `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Self doesn't bypass process boundaries, orchestration sections are compact, chat escalation is cognitive not hardcoded, tool reuses existing infrastructure
3. Present work + review to human

## Smoke Test

```bash
pnpm run type-check

# Manual: send Alex an email with a complex request
# Verify: Self offers chat escalation link (if request is complex enough)
# OR: Self handles inline (if request is simple)
# Verify: the decision is context-dependent, not mechanical

# Manual: click the chat link, answer questions, verify process spawns
```

## After Completion

1. Update `docs/state.md`: "Self cognitive orchestration: orchestrate_work tool, mode orchestration sections, email-to-chat escalation"
2. Update `docs/architecture.md` Layer 2: Self as cognitive orchestrator
3. Retrospective: how often does the Self use chat escalation vs inline handling? Is the orchestrate_work tool useful or does the Self prefer start_dev_role?
