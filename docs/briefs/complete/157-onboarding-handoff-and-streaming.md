# Brief 157: Onboarding Handoff, First-Run Streaming, and E2E Test

**Date:** 2026-04-14
**Status:** draft
**Depends on:** Brief 155 (MP-1.4 progress events), Brief 145 (MP-1.1 template matching)
**Unlocks:** Smooth magic-link-to-first-value experience

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-2.3 + MP-2.4 + MP-2.5)
- **Capabilities:** Seamless onboarding → first process → first output experience

## Context

MP-2.1 (memory bridge audit) and MP-2.2 (frontdoor context injection) are complete via Brief 148. Three gaps remain:

1. **MP-2.3:** Onboarding step "propose-first-process" produces a ProcessProposalBlock. Does it connect to MP-1's creation flow with template matching? Or is it a separate path?
2. **MP-2.4:** Between "user approves first process" and "first output appears for review" — what does the user see? ProgressBlock must appear during first execution.
3. **MP-2.5:** End-to-end test of the full onboarding flow.

## Objective

1. Verify and wire onboarding "propose-first-process" step to `generate_process` with template matching (MP-1.1).
2. Ensure ProgressBlock appears during first process execution, SSE events flow to `/chat` page.
3. End-to-end test: magic link click → greeting with context → first process approved → first output reviewed.

## Non-Goals

- Redesigning onboarding flow (just wiring existing pieces)
- Mobile-specific onboarding

## Inputs

1. `processes/onboarding.yaml` — 5-step onboarding flow
2. `src/engine/self-tools/generate-process.ts` — process creation with template matching
3. `packages/web/app/chat/page.tsx` — workspace chat page
4. `src/engine/magic-link.ts` — magic link infrastructure
5. `docs/meta-process-roadmap.md` — MP-2.3, MP-2.4, MP-2.5 specs

## Constraints

- Must not break existing onboarding for users already in-progress
- ProgressBlock must use existing SSE infrastructure (Brief 155)

## Provenance

- Onboarding YAML (existing)
- Magic link infrastructure Brief 123 (depend)
- Template matching Brief 145 (depend)

## What Changes

| File | Action | Notes |
|------|--------|-------|
| `processes/onboarding.yaml` | Modify | Wire propose-first-process to `generate_process` |
| Web chat page | Modify | SSE progress rendering |
| New e2e test file | Create | Full onboarding flow validation |

## User Experience

- **Jobs:** Orient (see first process progress), Define (first process created from frontdoor context)
- **Primitives:** ProgressBlock, ProcessProposalBlock
- **Process-owner:** Seamless magic link to first value
- **Interaction states:** landing, greeting, proposing, executing, reviewing
- **Designer input:** Recommended for onboarding flow feel

## Engine Scope

Product (onboarding is Ditto-specific)

## Acceptance Criteria

1. [ ] Onboarding "propose-first-process" step invokes `generate_process` with template matching
2. [ ] First process proposal is pre-filled with frontdoor context (business type, pain point)
3. [ ] ProgressBlock appears during first process execution via SSE
4. [ ] `/chat` page receives and renders progress events without page refresh
5. [ ] E2E test: magic link → greeting with frontdoor context → process proposed → approved → first output reviewed
6. [ ] Progressive reveal triggers naturally (sidebar appears when first process is approved)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "onboarding"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for MP-2.3, MP-2.4, MP-2.5
3. Run `/dev-documenter` for retrospective
