# Brief: Front Door Prompt Quality — Temporal Context, Judgment, Strategy

**Date:** 2026-04-10
**Status:** complete
**Depends on:** None (prompt-only changes)
**Unlocks:** None (immediate quality improvement)

## Goal

- **Roadmap phase:** Phase 9: Network Agent Continuous Operation
- **Capabilities:** Accurate temporal reasoning, advisor-grade judgment, connector vs sales strategy differentiation

## Context

Stress testing the front door conversation revealed four prompt-level issues:

1. **Alex makes time promises he can't keep** — "within the hour", "24 hours" with zero control over execution speed. A real advisor commits to actions, not timelines.
2. **Alex doesn't know what day it is** — says "by Monday" without knowing it's Saturday. Geo provides timezone but it's not injected into the prompt.
3. **No judgment framework for when NOT to reach out** — Alex knows HOW to reach out but not WHEN to decline. The cognitive modes have "Silence Conditions" but they're not surfaced in the front door prompt.
4. **Connector vs sales lacks strategic framing** — The prompt describes the identity difference (who sends) but not the approach difference (mutual value vs pain points).

All four are prompt-only changes. No engine code. Immediate impact.

## Objective

Alex never makes a time promise the system can't keep, always knows what day/time it is in the visitor's timezone, exercises judgment about when NOT to reach out, and uses strategically different approaches for connector vs sales modes.

## Non-Goals

- Changing process execution timing (that's Brief 121)
- Adding new tool parameters to alex_response
- Modifying the streaming/enrichment pipeline
- Mobile-specific prompt changes

## Inputs

1. `src/engine/network-chat-prompt.ts` — The front door prompt (all stages)
2. `cognitive/modes/connecting.md` — Silence conditions, three commercial connection tests
3. `cognitive/modes/selling.md` — Selling heuristics, escalation triggers
4. `cognitive/core.md` — Escalation sensitivity table, trade-off heuristics
5. `src/engine/geo.ts` — Timezone data already available from IP geolocation

## Constraints

- Do not add new tool parameters — work within existing `alex_response` schema
- Do not exceed 3 sentences per response (existing hard limit)
- Temporal context must be concise (<50 tokens) to stay within prompt budget
- Judgment framework must be actionable ("ask: would both sides thank me?") not abstract
- Strategy framing must help Alex in the GATHER stage, not just REFLECT & PROPOSE
- All cognitive mode references must be compact (full modes are ~500 tokens each, too large for front door)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Temporal context injection | ChatGPT system prompt pattern | pattern | Standard practice: inject current date/time into system prompt |
| Silence conditions | cognitive/modes/connecting.md, selling.md | adopt | Already designed, just not surfaced in front door |
| Three commercial connection tests | Insight-166 | adopt | Reverse test, reputation test, network test |
| Strategic differentiation | cognitive/modes/connecting.md vs selling.md | adopt | Optimization targets already defined per mode |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/network-chat-prompt.ts` | Modify: (1) Add `## Current Time` block in `buildFrontDoorPrompt()` with day, date, visitor timezone. (2) ACTIVATE stage: replace "within the hour" → "shortly", "24 hours" → "tomorrow". Add rule: "Never commit to specific delivery times." (3) REFLECT & PROPOSE: add per-mode judgment questions. (4) GATHER signal detection: add strategic framing for connector vs sales approach |
| `cognitive/modes/connecting.md` | Modify: add heuristic "Never promise a specific delivery time" |
| `cognitive/modes/selling.md` | Modify: add same heuristic |
| `cognitive/modes/chief-of-staff.md` | Modify: add same heuristic |

## User Experience

- **Jobs affected:** Orient (temporal awareness), Define (judgment about what to pursue)
- **Primitives involved:** Conversation (front door chat)
- **Process-owner perspective:** Alex sounds like a real advisor — commits to actions not timelines, knows what day it is, has opinions about whether an approach will work, and strategically differentiates between networking and selling.
- **Interaction states:** N/A — prompt changes, no UI
- **Designer input:** Not invoked — no UI changes

## Acceptance Criteria

1. [ ] The assembled front door system prompt contains a `## Current Time` section with the current day of week, full date, and visitor timezone (if available)
2. [ ] The front door prompt contains zero instances of "within the hour", "within 24 hours", or any other specific time commitment
3. [ ] The ACTIVATE stage uses action-oriented language ("I'll get started right away") not timeline language
4. [ ] The REFLECT & PROPOSE stage includes a judgment question for connector mode: "Would both sides thank me for this?"
5. [ ] The REFLECT & PROPOSE stage includes a judgment question for sales mode: "Does this person likely have the problem we solve?"
6. [ ] Both modes include: "If the request feels wrong, say so. You're an advisor, not an order-taker."
7. [ ] The GATHER stage includes strategic framing: connector optimises for mutual value, sales optimises for commercial outcome
8. [ ] All three cognitive mode files include the "never promise specific delivery times" heuristic
9. [ ] `pnpm run type-check` passes
10. [ ] Prompt token count increase is <100 tokens total across all changes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Layer alignment (L6 Human Layer — conversation), spec compliance (cognitive core trade-off heuristics respected), simplicity (minimal prompt additions)
3. Present assembled prompt output + review to human

## Smoke Test

```bash
# Type check
pnpm run type-check

# Manual: read the assembled system prompt
# In a test script or REPL, call buildFrontDoorPrompt("front-door", { location: { city: "Melbourne", timezone: "Australia/Melbourne" } })
# Verify: Current Time section present, no "within the hour", judgment questions present
```

## After Completion

1. Update `docs/state.md`: "Front door prompt quality: temporal context, judgment framework, strategy framing"
2. No ADR needed — prompt-level changes within existing architecture
3. Retrospective: did the token budget stay under 100 tokens? Did the judgment questions change Alex's behavior in test conversations?
