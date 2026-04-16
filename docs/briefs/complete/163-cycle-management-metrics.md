# Brief 163: Cycle Management — Aggregate Metrics, Contact Dedup, Health Signals

**Date:** 2026-04-14
**Status:** draft
**Depends on:** none
**Unlocks:** Compound-effect visibility for cycle users

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-8.2 + MP-8.3 + MP-8.4)
- **Capabilities:** Cycle-level KPIs, cross-cycle contact safety, proactive health alerts

## Context

Operating cycles (sales-marketing, network-connecting, relationship-nurture, gtm-pipeline) run continuously. `cycle_status` shows current run status but three power-user gaps remain:

1. **MP-8.2 Aggregate metrics:** No aggregate view across cycle iterations. "47 outreach emails this month, 12 responses, 3 meetings" — data exists in step runs but isn't aggregated.
2. **MP-8.3 Cross-cycle dedup:** Three cycles running could contact the same person. No deduplication across cycles.
3. **MP-8.4 Health signals:** When response rates drop, no proactive insight. Cycle keeps running the same way.

## Objective

Give cycle users visibility into aggregate performance, prevent contact collisions, and surface declining health proactively.

## Non-Goals

- Changing cycle execution logic (only adding visibility and safety)
- Building a full analytics dashboard

## Inputs

1. `src/engine/self-tools/cycle-tools.ts` — `cycle_status`, `cycle_briefing`
2. `src/engine/people.ts` — person records, interaction history
3. `src/engine/channel.ts` — `sendAndRecord()` with dedup
4. `docs/meta-process-roadmap.md` — MP-8.2, MP-8.3, MP-8.4 specs

## Constraints

- Aggregate metrics computed from existing step run and interaction data
- Contact dedup must check across ALL active cycles, not just within one
- Health signals must use statistical thresholds (not just gut feel)

## Provenance

- `src/engine/self-tools/cycle-tools.ts` — existing `cycle_status`, `cycle_briefing`
- `src/engine/people.ts` — existing interaction history for contact tracking
- `src/engine/channel.ts` — existing `sendAndRecord()` with dedup
- SPC Western Electric rules — pattern reference for health signal thresholds

## What Changes

| File | Action | What |
|------|--------|------|
| `src/engine/self-tools/cycle-tools.ts` | Modify | Aggregate metric queries in `cycle_briefing`/`cycle_status` |
| `src/engine/channel.ts` or `src/engine/people.ts` | Modify | Cross-cycle contact dedup check before outreach |
| New health signal logic | Add | Statistical threshold detection for declining metrics |

## User Experience

- **Jobs:** Orient (cycle KPIs), Decide (respond to health alerts)
- **Primitives:** cycle_briefing, cycle_status, SuggestionBlock (health alerts)
- **Process-owner:** "47 emails sent, 12 responses, 3 meetings — response rate up 5%"
- **Designer input:** Not invoked — data appears in existing cycle tools

## Engine Scope

Product (cycle management is Ditto-specific)

## Acceptance Criteria

### MP-8.2 — Aggregate Metrics
1. [ ] Query step runs across cycle iterations, compute KPIs (volume, response rate, conversion)
2. [ ] KPIs surfaced in `cycle_briefing` tool output
3. [ ] Trend indicators: up/down/flat vs previous period

### MP-8.3 — Cross-Cycle Contact Dedup
4. [ ] Before outreach, check if person was contacted by another cycle within N days (configurable)
5. [ ] Conflict detected → skip or escalate (not silently send duplicate)
6. [ ] Dedup decision logged as activity

### MP-8.4 — Health Signals
7. [ ] Detect declining response rate across cycle iterations (statistical threshold)
8. [ ] Surface proactive suggestion: "Response rates dropped 15% — want to adjust?"
9. [ ] Detect stalled cycles (no progress for N iterations)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "cycle.*metric\|cycle.*dedup\|cycle.*health"
pnpm run type-check
```

## After Completion

1. Run `/dev-documenter` to update `docs/state.md` and `docs/roadmap.md`
2. Mark MP-8.2, MP-8.3, and MP-8.4 complete in `docs/meta-process-roadmap.md`
