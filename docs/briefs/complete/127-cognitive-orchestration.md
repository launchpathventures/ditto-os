# Brief: Cognitive Orchestration — Parent Design

**Date:** 2026-04-11
**Status:** draft
**Depends on:** Brief 114 (Cognitive Modes), Brief 118 (Self-Tools), Brief 121 (Process Primitives)
**Unlocks:** Briefs 128-130 (sub-briefs)

## Goal

- **Roadmap phase:** Phase 9 → Phase 10: Cognitive Autonomy
- **Capabilities:** Self-driven process orchestration, per-action quality gating, adaptive cadence, email-to-chat escalation

## Context

Insight 172: we built cognitive modes that encode HOW Alex thinks, then wrote process templates that are fixed step sequences. The modes give Alex a brain; the templates give him a script. ADR-027 (proposed) amends the process-agent contract: processes declare capabilities and constraints, agents decide what/when/how within those bounds.

The critical safety requirement (identified in Brief 127 review — 2 FAILs): collapsing steps into broader "cognitive steps" breaks the quality gate. The gate runs once per step; if the agent sends 5 emails during one step, the gate can't intercept. **Solution: staged outbound tools.** Tool calls queue drafts during execution; the quality gate handler processes the queue post-execution, per-draft.

## Architecture Impact

| Layer | Impact |
|-------|--------|
| L1 Process | Templates become thinner (capabilities + gates, not step sequences) |
| L2 Agent | Self gains `orchestrate_work` tool; broader step scope per agent |
| L3 Harness | Staged outbound tool pattern; quality gate processes draft queue |
| L4 Awareness | Email-to-chat escalation triggers |
| L5 Learning | Feedback granularity shifts from per-narrow-step to per-action (via staged queue) |
| L6 Human | Adaptive cadence replaces fixed day 2/4/7; magic link escalation |

## Sub-Briefs

Note: Brief 128 was taken by Model Purpose Resolver (another workstream). Sub-briefs renumbered.

| # | Brief | Scope | Depends On | Complexity |
|---|-------|-------|-----------|------------|
| 129 | Staged Outbound Tools | `crm.send_email` queues drafts, quality gate processes queue per-draft, approved drafts dispatch | ADR-027 accepted | M |
| 130 | Thin Process Templates | Refactor front-door-intake, user-nurture, follow-up-sequences, user-reengagement into broad cognitive steps | 129 (staged tools ensure safety) | M |
| 131 | Self Cognitive Orchestration + Email-to-Chat | `orchestrate_work` tool, cognitive mode orchestration sections, email-to-chat escalation | 130 (thin templates to orchestrate) | L |

Build order: ADR-027 accepted → 129 → 130 → 131

**Interaction with Brief 128 (Model Purpose Resolver):** The purpose resolver reads step structural signals to choose model tier. Broad cognitive steps (from Brief 130) will resolve to `analysis` or `writing` based on sendingIdentity and tool declarations — the resolver works correctly with thin templates. Brief 128 is independent and can be built in parallel with 129-131.

## Reusable Patterns Produced

| Pattern | Layer | Reuse Surface |
|---------|-------|---------------|
| Staged outbound tools | L3 Harness | Any tool that produces outbound actions (email, SMS, social) |
| Per-action quality gating | L3 Harness | Every outbound action, regardless of step structure |
| Thin process template | L1 Process | Any process — fewer steps, broader agent scope |
| Cognitive orchestration | L2 Agent | Self orchestration for any domain, not just network |
| Email-to-chat escalation | L6 Human | Any Self conversation that needs richer context |

## Key Design Decisions

**Staged outbound tools (new pattern):**
- During step execution, `crm.send_email` doesn't dispatch. It queues a draft with: recipient, subject, body, mode, identity.
- After step execution completes, the outbound quality gate handler iterates the queue.
- Each draft is independently checked: opt-out, personalization, tone, spam signals.
- Approved drafts dispatch via `sendAndRecord()`. Rejected drafts are flagged for review.
- The agent's tool call returns a "queued" confirmation (not a "sent" confirmation).
- This makes the quality gate STRONGER than before — it was per-step, now it's per-action.

**Why this is better than the current per-step model:**
- Current: quality gate step runs once after ALL drafts are done → can't reject individual drafts
- Staged: quality gate handler processes each draft independently → can reject draft #3 while approving #1, #2, #4, #5

**Thin templates:**
- `front-door-intake`: 2 steps — "work the lead" (cognitive, all tools) + "quality gate" (rules, processes staged draft queue)
- `user-nurture-first-week`: 1 step — "nurture the relationship" (cognitive, adaptive cadence)
- `follow-up-sequences`: 2 steps — "follow up with value" (cognitive, no touch numbering) + "quality gate"
- `user-reengagement`: 1 step — "re-engage or let go" (cognitive)

**Self cognitive orchestration:**
- `orchestrate_work` tool: Self spawns thin process, adapts via `adapt_process`, manages lifecycle
- Cognitive modes get "orchestration" sections: connecting = "research before drafting, verify mutual value before contacting"
- Email-to-chat: Self detects complex requests, generates magic link, offers chat

## Acceptance Criteria (Parent)

See individual sub-briefs (128-130). Parent acceptance:

1. [ ] ADR-027 accepted
2. [ ] Outbound tool calls are staged (not immediately dispatched) during step execution
3. [ ] Quality gate processes each staged draft independently (per-action, not per-step)
4. [ ] Thin process templates have ≤3 steps each
5. [ ] The Self can orchestrate work adaptively using `orchestrate_work` tool
6. [ ] Fixed cadences (day 2/4/7, Touch 1/2/3) are replaced by cognitive judgment
7. [ ] The Self can escalate email → chat via magic link when context gathering needs a conversation
8. [ ] All gates (quality, opt-out, trust) are preserved or strengthened

## Review Process

1. ADR-027 reviewed and accepted before any sub-brief is built
2. Each sub-brief undergoes independent review
3. Brief 128 (staged tools) is the safety-critical prerequisite — reviewed with extra trust model scrutiny

## After Completion

1. Update `docs/state.md`
2. Accept ADR-027
3. Update `docs/architecture.md` Layer 1 (thin templates), Layer 2 (Self orchestration), Layer 3 (staged outbound)
4. Retrospective: did thin templates change Alex's output quality? Is per-action gating noticeably slower?
