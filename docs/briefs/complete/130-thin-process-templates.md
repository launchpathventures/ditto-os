# Brief: Thin Process Templates — Capabilities + Gates, Not Scripts

**Date:** 2026-04-11
**Status:** draft
**Depends on:** Brief 129 (Staged Outbound Tools — safety prerequisite)
**Unlocks:** Brief 131 (Self Cognitive Orchestration)

## Goal

- **Roadmap phase:** Phase 10: Cognitive Autonomy
- **Capabilities:** Adaptive process execution driven by cognitive modes, not fixed step sequences

## Context

With staged outbound tools in place (Brief 129), every email sent during a broad step is individually quality-gated. This makes it safe to collapse prescriptive 6-step templates into 2-3 step templates where the agent exercises judgment.

The refactored templates declare: what tools are available, what gates are non-negotiable, what trust tier applies, and what success looks like. The agent's cognitive mode (connecting, selling, ghost, chief-of-staff) guides HOW the work is done — sequence, timing, and strategy.

## Objective

Refactor four prescriptive process templates into thin capability declarations. Fixed step sequences become broad cognitive steps. Fixed cadences become adaptive timing. Touch numbering becomes contextual judgment.

## Non-Goals

- Creating new process templates (just refactoring existing ones)
- Changing the Self's orchestration model (that's Brief 131)
- Changing the cognitive mode files (Brief 131 adds orchestration sections)
- Changing the harness pipeline or handlers
- Changing trust tiers or quality criteria

## Inputs

1. `processes/templates/front-door-intake.yaml` — current 6-step template
2. `processes/templates/user-nurture-first-week.yaml` — current 3-step template with day 2/4/7
3. `processes/templates/follow-up-sequences.yaml` — current 6-step template with touch numbering
4. `processes/templates/user-reengagement.yaml` — current 2-step template
5. `cognitive/modes/connecting.md` — judgment framework for the agent within steps
6. `cognitive/modes/selling.md` — judgment framework
7. `docs/insights/172-cognitive-orchestration-over-prescriptive-processes.md` — design rationale
8. `docs/adrs/027-cognitive-orchestration.md` — accepted architectural decision

## Constraints

- Quality gate MUST remain a separate `rules` executor step (non-bypassable, not merged into cognitive step)
- Trust tiers, quality criteria, feedback sections, chain definitions MUST be preserved unchanged
- Templates that work well as-is (connecting-introduction at critical tier, opt-out-management) are NOT refactored
- Each cognitive step description MUST reference the applicable cognitive mode by name so the memory-assembly handler loads the right mode
- The agent within a cognitive step has access to all tools declared on the step — it decides which to use and when
- Backward compatibility: new templates must have the same `id` and compatible `inputs`/`outputs` so existing chain triggers still work

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Capability declaration over step sequence | ADR-027 (Ditto), Kubernetes pod spec | pattern | Declare what you need, system figures out how |
| Cognitive mode as execution guide | Insight 172 (Ditto) | original | Modes guide judgment within broad steps |
| Quality gate as separate step | Existing architecture | adopt | Non-negotiable safety pattern preserved |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `processes/templates/front-door-intake.yaml` | Rewrite steps: (1) "Work the lead" — ai-agent, all tools (web-search, web-fetch, crm.send_email, crm.record_interaction, crm.create_person), description says "use your connecting/selling mode to research targets, draft introductions, and prepare outreach. Decide what to do first based on context. If the user replied with their website, use it. If not, work with what you have." (2) "Quality gate" — rules executor, checks each staged draft. (3) "Report back" — ai-agent, email_thread: user-onboarding, summarise what was done, quote actual outreach text. Preserve: inputs, outputs, chain section, trust, feedback, quality_criteria. |
| `processes/templates/user-nurture-first-week.yaml` | Rewrite steps: (1) "Nurture the relationship" — ai-agent, tools (crm.send_email, crm.get_interactions, web-search), wait_for: { event: reply, timeout: "7d" }. Description: "Stay in touch like a real advisor. Check engagement before sending — if the user replied, respond to THEM, don't fire a canned update. If silent, share something genuinely useful — or stay quiet. By end of week, summarise what happened and ask for feedback. Your connecting/selling mode guides your judgment." No day 2/4/7 schedule. One step, adaptive timing. Preserve: chain section, trust, quality_criteria. |
| `processes/templates/follow-up-sequences.yaml` | Rewrite steps: (1) "Follow up with value" — ai-agent, determines what adds value for THIS person NOW. No touch numbering. Description: "Check eligibility (not opted out, max touches not exceeded, min interval since last contact). If eligible, determine what genuinely adds value — a new angle, a relevant insight, social proof, a direct question. Never 'just following up.' Include a graceful exit if this is the final touch." (2) "Quality gate" — rules executor, checks the staged draft. Preserve: chain section, trust, feedback. |
| `processes/templates/user-reengagement.yaml` | Rewrite steps: (1) "Re-engage or let go" — ai-agent, one email referencing specifics from original conversation. wait_for: { event: reply, timeout: "5d" }. If reply → mark reengaged. If timeout → mark passive. Description: "One warm, personal email. Reference their specific situation. Acknowledge the silence naturally. Ask one clear question: still interested? If not, respect the silence." Preserve: chain section, trust. |

## User Experience

- **Jobs affected:** Delegate (users delegate to a thinking advisor, not a pipeline), Orient (Alex updates when he has something to say, not on a schedule)
- **Primitives involved:** Email (adaptive cadence), Conversation (cognitive steps)
- **Process-owner perspective:** Alex researches when it makes sense, reaches out when he has something worth saying, stays silent when he doesn't, and follows up with genuine value — not mechanical touches. The user doesn't see process steps; they see an advisor working.
- **Designer input:** Not invoked — behavioral change, not UI change

## Acceptance Criteria

1. [ ] `front-door-intake.yaml` has exactly 3 steps: "work the lead" + "quality gate" + "report back"
2. [ ] The "work the lead" step declares all necessary tools (web-search, web-fetch, crm.send_email, crm.record_interaction, crm.create_person)
3. [ ] The quality gate step is a `rules` executor (not merged into the cognitive step)
4. [ ] `user-nurture-first-week.yaml` has 1 step with `wait_for: { event: reply, timeout: "7d" }`
5. [ ] No step description contains "day 2", "day 4", "day 7", or any fixed calendar reference
6. [ ] `follow-up-sequences.yaml` has 2 steps: cognitive step + quality gate
7. [ ] No step description contains "Touch 1", "Touch 2", "Touch 3", or any fixed touch numbering
8. [ ] `user-reengagement.yaml` has 1 step with `wait_for: { event: reply, timeout: "5d" }`
9. [ ] All refactored templates preserve their `id`, `inputs`, `outputs`, `chain`, `trust`, `feedback`, and `quality_criteria` sections unchanged
10. [ ] Each cognitive step description references the applicable cognitive mode (connecting/selling/chief-of-staff)
11. [ ] `pnpm ditto sync` loads all refactored templates without validation errors
12. [ ] Existing chain triggers (positive-reply → connecting-introduction, no-reply → follow-up, etc.) still function with refactored templates
13. [ ] `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Quality gate preserved as separate step, trust tiers unchanged, chain compatibility, cognitive mode references correct, no prescriptive language in step descriptions
3. Present work + review to human

## Smoke Test

```bash
pnpm run type-check
pnpm ditto sync  # all templates load without errors
pnpm vitest run src/engine/process-loader.test.ts  # template count + structure

# Manual: inspect each refactored template
# Verify: no fixed sequences, no touch numbering, no day references
# Verify: cognitive mode referenced in each step description
# Verify: chain section unchanged from before refactor
```

## After Completion

1. Update `docs/state.md`: "Thin process templates: front-door-intake, user-nurture, follow-up-sequences, user-reengagement refactored from prescriptive to cognitive"
2. Unblocks Brief 131 (Self Cognitive Orchestration)
3. Retrospective: did the thin templates change Alex's output quality? Is the agent confused by broad scope?
