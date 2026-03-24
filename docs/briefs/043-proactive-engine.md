# Brief: Phase 10e — Proactive Engine

**Date:** 2026-03-24
**Status:** draft
**Depends on:** Brief 040 (Self Extensions)
**Unlocks:** Engine tuning driven by dashboard visibility (Insight-070)

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard
- **Capabilities:** Intelligent briefing assembly, risk detection (3 types), proactive suggestion engine, user model deepening from behaviour

## Context

Brief 040 adds basic versions of `get_briefing`, `detect_risks`, and `suggest_next` as Self tools. This brief makes them intelligent: the briefing weaves together process state, risks, and suggestions into a narrative. Risk detection identifies temporal, data staleness, and correction-pattern risks. The suggestion engine draws from the user model, industry patterns, and process maturity.

This is what makes the Self feel like a brilliant executive assistant rather than a chatbot. The Self doesn't just respond — it proactively manages focus, attention, opportunities, coverage gaps, and upcoming work (Insight-076).

## Objective

When the user returns to Ditto, the Self delivers a contextual briefing that weaves together: what happened, what needs attention, what risks are emerging, and what to do next. The briefing adapts to the user's volume, working patterns, and preferences.

## Non-Goals

- Effectiveness risk (outcome tracking — requires closing the loop with real-world data, future phase)
- Strategic risk (cross-process reasoning about business strategy, future phase)
- Full Learning layer automation ("Teach this" extracts rules automatically — Phase 8)
- AI-generated audio digest (future phase, Linear Pulse-inspired)
- Cross-process pattern recognition beyond correction trends (Phase 7 Awareness)

## Inputs

1. `docs/briefs/038-phase-10-mvp-architecture.md` — Risk Detection + User Model sections
2. `docs/research/phase-10-mvp-dashboard-ux.md` — section 4 (proactive engine), 4.4.1 (risk)
3. `docs/insights/076-proactive-attention-management.md` — 5 dimensions
4. `docs/insights/077-risk-detection-first-class.md` — risk categories (MVP: operational only)
5. `src/engine/self-tools/` — basic tool implementations from Brief 040
6. `src/engine/user-model.ts` — user model from Brief 040
7. `src/engine/trust.ts` + `trust-diff.ts` — trust data for maturity signals

## Constraints

- MUST produce briefings as natural narrative, not structured data (the Self tells a story, it doesn't present a report)
- MUST weave risk signals into the briefing naturally — never say "risk" to the user (Insight-073)
- MUST cap proactive suggestions: 1-2 per session beyond the briefing
- MUST NOT suggest during exceptions (fix first, suggest later)
- MUST scope risk detection to MVP types only: temporal, data staleness, correction-pattern
- MUST use industry knowledge (APQC-level) for coverage gap suggestions — but store as structured data in the engine, not hardcoded in prompts
- MUST adapt briefing length to user familiarity: verbose for new users, terse for power users

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Narrative briefing | Linear Pulse | pattern | AI-generated daily summary as narrative |
| Risk detection signals | Existing trust/correction data | extend | Correction rates, timing data already in DB |
| Industry patterns | APQC process framework | pattern | Business process taxonomy for coverage suggestions |
| Proactive attention model | Original to Ditto (Insight-076) | — | 5 dimensions + risk |
| Risk as first-class concept | Original to Ditto (Insight-077) | — | Predictive, cross-cutting |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/self-tools/get-briefing.ts` | Rewrite: full briefing assembly with 5 dimensions + risk |
| `src/engine/self-tools/detect-risks.ts` | Rewrite: temporal + data staleness + correction-pattern detection |
| `src/engine/self-tools/suggest-next.ts` | Rewrite: draws from user model + pain points + industry patterns + maturity |
| `src/engine/briefing-assembler.ts` | Create: queries DB for all briefing inputs (runs, items, risks, suggestions), produces structured briefing data |
| `src/engine/risk-detector.ts` | Create: queries DB for risk signals, returns typed risk objects |
| `src/engine/industry-patterns.ts` | Create: structured data file with business type → typical process patterns (trades, ecommerce, consulting). Used by suggest_next. |
| `src/engine/user-model.ts` | Modify: add behaviour tracking — update working patterns from login times, check frequency, surface preferences |
| `src/engine/self.ts` | Modify: Self context assembly includes briefing readiness signal — Self proactively delivers briefing on return |

## User Experience

- **Jobs affected:** Orient (briefing with risks), Decide (risk-informed decisions), Define (coverage gap suggestions)
- **Primitives involved:** Daily Brief (adapted as conversational narrative), Improvement Card (suggestions), Performance Sparkline (trend data in briefing)
- **Process-owner perspective:** Rob opens app at 6:30am → Self: "Morning Rob. Henderson quote first — they called yesterday. Labour might be low for a bathroom, I've bumped it to 22 hours. Wilson hasn't responded in 3 days — want me to follow up? Everything else running fine." All five proactive dimensions in one natural paragraph.
- **Interaction states:**
  - *Briefing ready:* Self delivers proactively on return
  - *Nothing to brief:* "All quiet. Nothing needs you." (one line)
  - *Risk detected:* Woven into briefing: "heads up — copper prices are up 8%..."
  - *Suggestion available:* "By the way, other trades businesses find it useful to..."
  - *User is busy (3+ pending reviews):* No suggestions, just briefing + reviews
- **Designer input:** UX spec section 4 (proactive engine), 4.4.1 (risk)

## Acceptance Criteria

1. [ ] `briefing-assembler.ts` queries: recent process runs (since last visit), pending review items, active work item status, risk signals, suggestion candidates
2. [ ] Briefing includes **focus** dimension: prioritized items with reasoning ("Henderson first — they called yesterday")
3. [ ] Briefing includes **attention** dimension: aging items without activity ("Wilson hasn't responded in 3 days")
4. [ ] Briefing includes **upcoming** dimension: approaching deadlines, predicted work ("2 jobs finishing tomorrow — invoices ready")
5. [ ] `risk-detector.ts` detects temporal risks: work items with no activity > configurable threshold
6. [ ] `risk-detector.ts` detects data staleness risks: integration sources with last successful poll > threshold
7. [ ] `risk-detector.ts` detects correction-pattern risks: sliding window correction rate per process exceeding baseline
8. [ ] Risk signals woven into briefing narrative — never uses the word "risk" (Insight-073)
9. [ ] `suggest-next` draws from: user model stated pain points (first priority), process maturity signals (trust upgrades), industry patterns (coverage gaps)
10. [ ] Suggestions capped: max 1-2 per briefing, zero during exceptions
11. [ ] Self proactively delivers briefing when user returns (detects return via session gap or new page load)

## Review Process

1. Spawn review agent with architecture.md + review-checklist.md + this brief + UX spec + Insight-076 + Insight-077
2. Review checks: all 5 proactive dimensions represented, risk signals are MVP-scoped (temporal/staleness/pattern), suggestions draw from real data not hardcoded, briefing is narrative not structured
3. Present + review to human

## Smoke Test

```bash
# Setup: run several processes, approve some, edit some, leave one aging

# 1. Open app after a gap (new session)
# Expected: Self delivers briefing proactively

# 2. Briefing should include:
#    - Focus: "X first — [reason]"
#    - Attention: "Y hasn't had activity in N days"
#    - Upcoming: "Z finishing tomorrow"
#    - Risk (if applicable): "heads up — [data staleness or correction trend]"
#    - Suggestion (if applicable): "by the way, [next step]"

# 3. Edit a process output 3+ times with similar corrections
# Expected: Correction-pattern risk appears in next briefing: "labour estimates trending low"

# 4. Leave an integration source un-polled for > threshold
# Expected: Data staleness risk in briefing: "supplier data is X days old"
```

## After Completion

1. Update `docs/state.md` — proactive engine shipped, Phase 10 MVP complete
2. Update `docs/roadmap.md` — Phase 10 status to done
3. Update ADR-011 — risk detection as attention model extension
4. Phase 10 retrospective: conversation-first validated? What did the dashboard reveal the engine needs?
