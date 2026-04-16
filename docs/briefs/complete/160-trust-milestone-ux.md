# Brief 160: Trust Milestone UX — Celebrations, Explanations, Transparency

**Date:** 2026-04-14
**Status:** draft
**Depends on:** Brief 158 (MP-3.1 autonomous digest — needed for MP-5.3)
**Unlocks:** Better user understanding of trust progression

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-5.1 + MP-5.2 + MP-5.3 + MP-5.4)
- **Capabilities:** Trust milestones feel like milestones; downgrades are explained warmly; autonomous work is transparent

## Context

Trust earning works mechanically (sliding window, conjunctive upgrades, disjunctive downgrades) but the user experience around trust changes has four gaps:

1. **MP-5.1 Upgrade celebration:** Trust upgrade comes via `suggest_next` in briefing — buried. This is a milestone that deserves a dedicated moment.
2. **MP-5.2 Downgrade explanation:** Auto-downgrade happens silently. User discovers it when reviews reappear with no explanation.
3. **MP-5.3 Auto-advanced summary:** At autonomous tier, outputs auto-advance but there's no mechanism to summarize what was handled.
4. **MP-5.4 Spot-check transparency:** At spot-checked, 80% of outputs aren't reviewed. Where are they? Were they fine?

## Objective

Make trust progression a first-class experience: celebrate upgrades, explain downgrades warmly, show what's being handled autonomously.

## Non-Goals

- Changing trust calculation logic (already correct per ADR-007)
- Trust tier UI redesign (improvements within existing patterns)

## Inputs

1. `src/engine/trust.ts` — `executeTierChange()`, upgrade/downgrade logic
2. `src/engine/briefing-assembler.ts` — briefing assembly
3. `packages/core/src/content-blocks.ts` — ContentBlock types
4. `src/engine/self-tools/` — `suggest_next`, `adjust_trust` tools
5. `docs/meta-process-roadmap.md` — MP-5.1 through MP-5.4 specs

## Constraints

- Upgrade celebration must be a dedicated ContentBlock (not just a suggestion line)
- Downgrade explanation must include specific patterns that triggered it
- Auto-advanced summary depends on MP-3.1 (Brief 158)

## Provenance

- `src/engine/trust.ts` — `executeTierChange()`, upgrade/downgrade logic (existing)
- ADR-007 — trust earning spec, sliding window, conjunctive/disjunctive rules (existing)
- Discourse TL3 milestone notifications — dedicated celebration moment for trust level changes (pattern)

## What Changes

| Target | Action | Detail |
|--------|--------|--------|
| `packages/core/src/content-blocks.ts` | Modify | Add `TrustMilestoneBlock` type to discriminated union |
| `src/engine/trust.ts` | Modify | Celebration generation on upgrade, warm explanation generation on downgrade |
| `src/engine/briefing-assembler.ts` | Modify | Auto-advanced summary section (depends on MP-3.1), spot-check transparency counts |

## User Experience

- **Jobs:** Orient (trust changes visible in briefing), Decide (accept/reject upgrade)
- **Primitives:** TrustMilestoneBlock (new), Daily Brief, process detail
- **Process-owner experience:** "Your quoting process has been 95% accurate over 25 runs -- I'd like to check in less often."
- **Interaction states:** milestone celebration, downgrade explanation (warm tone), auto-advanced collapsible section, spot-check summary
- **Designer input:** Recommended for milestone celebration moment

## Engine Scope

Both — `TrustMilestoneBlock` ContentBlock type belongs in core; presentation logic is product

## Acceptance Criteria

### MP-5.1 — Trust Upgrade Celebration
1. [ ] Dedicated ContentBlock for trust milestone with evidence narrative
2. [ ] Distinct from regular suggestions — feels like a celebration
3. [ ] Includes specific evidence: "95% accurate over 25 runs, correction rate dropped to 5%"
4. [ ] User action: accept upgrade or keep current tier

### MP-5.2 — Downgrade Explanation
5. [ ] When `executeTierChange()` downgrades, human-readable explanation generated
6. [ ] Explanation includes specific patterns: "the last few invoices had formatting issues"
7. [ ] Surfaced in next briefing (warm tone, not punitive)

### MP-5.3 — Auto-Advanced Summary
8. [ ] Query auto-advanced step runs per process since last session
9. [ ] Collapsible "Handled automatically" section in briefing
10. [ ] Summary by process with counts and outcomes

### MP-5.4 — Spot-Check Transparency
11. [ ] For spot-checked processes, show auto-advanced vs sampled run counts
12. [ ] "Reviewed by me, looked good" summary for unsampled runs
13. [ ] Surfaced in process detail view

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "trust-milestone\|trust.*celebration\|downgrade"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` — mark MP-5.1 through MP-5.4 complete
2. Run `/dev-documenter` to update roadmap and capture any insights
3. Verify `TrustMilestoneBlock` type is re-exported correctly from `src/engine/content-blocks.ts`
