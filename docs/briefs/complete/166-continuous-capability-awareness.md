# Brief 166: Continuous Capability Awareness (Parent)

**Date:** 2026-04-16
**Status:** draft
**Depends on:** None (all infrastructure exists)
**Unlocks:** None (standalone improvement)

## Goal

- **Roadmap phase:** Cross-cutting (L2 Agent / L4 Awareness / L6 Human)
- **Capabilities:** Proactive suggestion expansion, cold start resolution, ongoing capability discovery

## Context

Alex has 32 process templates covering growth, sales, relationships, operations, and admin. Users only discover capabilities by asking in chat or browsing a flat "Capabilities" catalog. The GTM pipeline is fully wired but invisible unless explicitly requested.

Cold start problem: a user who says "I run a plumbing business" gets ONE first process from onboarding. The other 5-6 capabilities that would transform their business sit undiscovered. Beyond cold start, this is an ongoing expansion problem — every conversation contains signals about unmet needs that go unconnected to available capabilities.

Insight-193 identifies 7 dead ends where capability awareness should exist but doesn't.

## Objective

Make Alex continuously aware of the gap between what the user has and what they could have — and surface that awareness naturally through conversation and workspace views. A user who tells Alex about their business gets "here are the 3 things I'd set up" within the first conversation, and over subsequent sessions Alex gradually introduces remaining capabilities at natural moments.

## Non-Goals

- **Multi-tenant team context (Nadia persona).** Capability matching based on cross-team correction patterns is Phase 12+ (Governance at Scale). The matcher interface accepts an optional `teamId` parameter for forward compatibility but doesn't use it.
- **LLM-powered matching.** The capability matcher is deterministic (token overlap + dimension weighting). No LLM calls in the matching hot path.
- **New content block type.** The onboarding capability package composes from existing blocks (TextBlock + RecordBlock + ActionBlock). No new discriminated union member needed for v1.
- **Coverage-agent changes.** The weekly coverage-agent (Brief 165) continues as-is. This brief adds real-time matching that supplements it, not replaces it.
- **Suggestion-dismissal UX changes.** The existing 30-day cooldown mechanism (suggestion_dismissals table) is reused as-is.

## Design Decisions

1. **No CapabilityPackageBlock.** RecordBlock already supports `status`, `accent`, `fields`, and `actions`. The capability package renders as: TextBlock header ("What I'd set up for your business") + RecordBlock per capability (status="Running"/"Recommended"/"Available", accent="vivid" for recommended) + ActionBlock for primary action. This is consistent with Library composition's existing RecordBlock usage.

2. **All trigger signals in `assembleSelfContext()`.** The Self context assembly runs on every conversation turn. Trigger signals are injected as contextual `<capability_signal>` sections (same pattern as existing `<briefing_signal>` and `<first_session_signal>`). Alex uses its own judgment about timing and tone — the system ensures Alex KNOWS about the gap; Alex decides WHEN to mention it.

3. **Conditional loading.** The `<capability_awareness>` section loads only when unmatched capabilities exist. For users with 5+ active processes (or no user model), it's omitted entirely, preserving token budget.

4. **Dimension-weighted token matching.** The matcher scores by overlap between user model content and template metadata (name, description, quality_criteria). Weights: problems (1.0) > challenges (0.8) > tasks (0.7) > frustrations (0.6) > vision (0.3). Direct problem match always beats industry pattern match.

## Sub-Briefs

Split along the natural seam: conversational engine vs passive surfaces.

| Sub-brief | Scope | ACs | Depends on |
|-----------|-------|-----|-----------|
| **167 — Capability Matcher + Self Context** | Deterministic matcher, Self context assembly, trigger signals, cognitive guidance, onboarding enhancement | 12 | None |
| **168 — Library & Today Personalization** | Library "Recommended" section, Today recommended strip, context-aware empty states | 8 | 167 (needs matcher + scoring) |

Build order: 167 → 168. Brief 167 is independently valuable — Alex starts suggesting capabilities in conversation even before the passive surfaces are updated.

## User Experience

Full interaction spec: `docs/research/capability-awareness-ux.md`

- **Jobs affected:** Orient (what could be happening), Define (what to set up next), Decide (which capability to activate)
- **Primitives involved:** TextBlock, RecordBlock, ActionBlock, SuggestionBlock (existing); composition functions (today.ts, library.ts)
- **Process-owner perspective:** Alex becomes an active capability advisor who notices gaps and suggests solutions using the user's own words. Intensity tapers from aggressive (onboarding) to subtle (month 2+).
- **Interaction states:** See UX spec — 11 states including review-overloaded (Insight-142) and paused-process.
- **Designer input:** `docs/research/capability-awareness-ux.md` — reviewed, PASS with 6 FLAGs all addressed.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Token overlap matching | TF-IDF information retrieval | pattern | Lightweight, deterministic, no external dependency |
| Suggestion dismissal (30-day cooldown) | Existing Ditto pattern (Brief 110) | — | Reuse existing infrastructure |
| Intensity curve (HIGH→MINIMAL) | Original to Ditto | — | Calibrated to emotional journey in personas.md |
| User's words as match reason | Insight-049, Insight-073 | — | Consultative, user language |
| Review-load suppression | Insight-142 | — | Don't overload users with supervised processes |
| Contextual signal injection | Existing `<briefing_signal>` pattern in self.ts | — | Proven pattern for Self context signals |
| RecordBlock capability rendering | Existing Library composition | — | Reuse existing block type |

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: engine/product boundary correct, no LLM in matcher hot path, token budget analysis, content block composability, trigger signal pattern consistent with existing signals
3. Present work + review findings to human for approval
