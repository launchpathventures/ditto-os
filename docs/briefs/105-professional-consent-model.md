# Brief 105: Professional Consent Model — Alex Acts, Not Asks

**Date:** 2026-04-08
**Status:** draft
**Depends on:** None (can be built independently)
**Unlocks:** Brief 106 (bespoke signed review pages), front-door-intake alignment with Insight-160

## Goal

- **Roadmap phase:** Phase 14 (Network Agent — final alignment)
- **Capabilities:** Consent-to-approach model replacing per-action approval, trust context alignment for connector processes

## Context

The `front-door-intake.yaml` process currently has a `user-approval` human step that asks the user to approve each draft introduction before Alex sends anything. This contradicts Insight-160 (Context 2: Alex as professional starts autonomous) and Insight-164 (Alex acts as a professional, not an assistant).

A real advisor gets consent to act, then uses their professional judgment. They don't send drafts for approval. The quality gate (critical tier, never bypassed) protects reputation — not user pre-approval.

The trust context system (Insight-160) currently lists `front-door-intake` under Context 3 (Alex on behalf of user's business → supervised). But Insight-164 clarifies: Alex doesn't send emails "on behalf of" the user — Alex acts as a professional connector using Alex's own identity and social credibility. This reclassifies `front-door-intake` from Context 3 to **Context 2** (Alex as Ditto's network professional → autonomous). The quality-gate (critical tier) is the safety net.

## Objective

Redesign the front-door-intake process to use a consent-to-approach model: Alex gets the user's agreement to the overall approach during the front-door conversation, then executes autonomously with quality-gate protection, and reports back on results. Replace per-action approval with professional autonomy.

## Non-Goals

- **Bespoke signed review pages** — Brief 106 adds the rich review surface. This brief works with email-only.
- **Changing the front-door conversation flow** — the conversation prompt already gathers consent ("Sound like the right approach?"). This brief changes what happens AFTER consent.
- **Changing other connector processes** — `connecting-introduction`, `network-nurture`, `warm-path-finder` etc. already start autonomous per Insight-160. Only `front-door-intake` is misaligned.
- **Changing the CoS intake** — `front-door-cos-intake.yaml` already has the right pattern (briefing → feedback, not approval queue)

## Inputs

1. `processes/templates/front-door-intake.yaml` — current process to redesign
2. `docs/insights/164-alex-acts-as-professional-not-assistant.md` — core insight
3. `docs/insights/160-trust-context-not-universal.md` — trust contexts
4. `docs/insights/155-outreach-is-two-sided-acquisition.md` — outreach quality = growth
5. `src/engine/network-chat-prompt.ts` — front-door conversation flow (consent gathered here)
6. `src/engine/notify-user.ts` — notification system for report-back
7. `src/engine/completion-notifier.ts` — process completion notifications

## Constraints

- Quality gate steps MUST remain critical tier — never bypassed, never earned away from
- Opt-out management remains a system invariant
- Alex's house values (from `cognitive/core.md`) govern all outreach — no spam, genuine value, graceful exits
- The consent gathered during the front-door conversation is the gate — if the user didn't say "go for it," nothing happens
- The report-back email MUST show what was done, who was contacted, and what to expect next
- Process chaining (follow-ups, nurture, pipeline tracking) continues to work unchanged
- The first-cycle trust-building moment (showing approach, not seeking approval) is handled by Brief 106's review pages, not by this brief
- `docs/architecture.md` MUST be updated as part of this brief to reflect context-dependent initial tiers (Insight-160). The spec currently says "They start supervised" — this is stale.
- Insight-160's process-to-context mapping MUST be updated: move `front-door-intake` from Context 3 to Context 2

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Consent-to-approach model | Professional services (advisory, consulting) | pattern | Real advisors get consent to act, then act professionally |
| Quality gate as safety net | Existing quality-gate process (critical tier) | adopt | Already built, already critical, already never-bypassed |
| Report-back pattern | Professional services (advisory updates, investment reports) | pattern | Advisor reports on actions taken, not asks for permission |
| Trust context alignment | Insight-160 (trust context not universal) | adopt | Already designed — this brief enforces it in the process YAML |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `processes/templates/front-door-intake.yaml` | Rewrite: Remove `user-approval` human step. Change trust to `autonomous` (Context 2). Add quality-gate step between draft and send (critical tier). Change `update-user` step to a proper report-back with results. Update quality_criteria to reflect consent model. Update description. |
| `processes/templates/front-door-intake.yaml` quality_criteria | Modify: Remove "User approved everything before it was sent" and "No outreach sent without explicit approval". Add "User gave consent to approach during front-door conversation" and "Quality gate passed on every outreach before send" and "User received clear report-back on what was done" |

## User Experience

- **Jobs affected:** Delegate (consent to approach, not per-action approval), Orient (report-back on what Alex did)
- **Primitives involved:** None new — this is a process template change, not a UI change. Report-back uses existing `crm.send_email` via `notifyUser()`.
- **Process-owner perspective:** The user says "go for it" during the front-door conversation. Alex goes and does professional work. Within hours, the user gets an email: "I reached out to 7 property managers. Henderson PM was interested — they want to talk. Here's the summary." The user's time investment: 30 seconds of consent vs 20 minutes reviewing drafts.
- **Interaction states:** N/A — no new UI states. The front-door conversation already handles consent.
- **Designer input:** Not invoked — process template change, no new UI surfaces

## Acceptance Criteria

1. [ ] `front-door-intake.yaml` no longer has a `user-approval` human step
2. [ ] `front-door-intake.yaml` trust is `autonomous` with quality-gate as safety net — reclassified from Context 3 to Context 2 (Insight-160, Insight-164) because Alex acts as a professional using Alex's identity, not the user's brand
3. [ ] A new quality-gate step exists between `draft-intros` and `send-outreach` with critical tier: checks recipient not opted out, intro is personalised (not generic), mutual value framed, tone appropriate (not sales pitch)
4. [ ] `send-outreach` step no longer depends on `user-approval` — it depends on quality-gate passing
5. [ ] `update-user` step is redesigned as a report-back: "Here's what I did, who I contacted, what happened, what's next. How did I do? Anyone I should have included or excluded?" — invites qualitative feedback that feeds into process memory
6. [ ] `quality_criteria` updated: consent-to-approach (not per-action approval), quality-gate passed, report-back sent
7. [ ] Process description updated to reflect professional consent model
8. [ ] Consent is gathered during the front-door conversation (in `network-chat-prompt.ts` — already exists at REFLECT & PROPOSE stage). No changes needed to the conversation flow.
9. [ ] Process chaining (follow-up-sequences, connecting-introduction, pipeline-tracking, network-nurture) continues to work unchanged
10. [ ] Downgrade triggers updated: "User says Alex contacted someone they shouldn't have" replaces "User rejects more than 50% of draft intros"
11. [ ] Post-cycle feedback loop explicit: response rate and reply sentiment from each outreach cycle feed into the next cycle's quality-gate calibration and Alex's process memory
12. [ ] Existing front-door-intake tests updated to reflect new flow (no approval step, quality-gate present)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: consistency with Insight-160 (trust contexts), quality-gate enforcement, process chaining integrity, consent model completeness
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Verify process loads with new structure
pnpm cli sync

# Verify quality-gate step is critical tier
pnpm test -- --grep "front-door-intake"

# Type check
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with consent model implementation
2. Verify Insight-160's Context 2 is now consistently enforced across all connector processes
3. Phase retrospective: does the consent model feel right? Is the report-back sufficient? Is the post-cycle feedback loop capturing enough signal?

Reference docs updated: `docs/architecture.md` (context-dependent initial tiers), `docs/insights/160-trust-context-not-universal.md` (front-door-intake reclassified Context 3 → Context 2)
