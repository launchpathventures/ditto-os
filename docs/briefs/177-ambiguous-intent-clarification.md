# Brief: Ambiguous Intent Clarification (P0 UX)

**Date:** 2026-04-16
**Status:** complete

> **Scope adjustment (2026-04-16):** Chose the cognitive-extension pattern
> over a hard pre-tool short-circuit: the specificity score extends the
> system prompt with a named clarifying question and explicit instruction
> to ask before calling mutating tools. Keeps multi-turn flows working
> naturally (LLM can still proceed when prior context resolves the gap),
> zero runtime cost beyond the probe. `userPreferences.clarifyBeforeAct`
> opt-out deferred — operators can silence the hint by turning off the
> cognitive extension wholesale if needed.
**Depends on:** Brief 169 (parent)
**Unlocks:** User messages that are genuinely ambiguous get a clarifying question instead of a silent best-guess tool call.

## Goal

- **Roadmap phase:** Phase 14 / cognitive orchestration
- **Capabilities:** Closes P0 UX gap: Self currently responds to vague asks ("handle this for me", "set up something for follow-ups") by immediately calling a tool it picked via the LLM. The user has no chance to correct the direction before work starts. The cost when it's wrong is high: process drafts to discard, false-start runs, lost trust.

## Context

`self.ts:219-233` plus the compact delegation guidance both instruct Self to "draft early" and iterate with the user via `generate_process(save=false)`. That works when the user's intent has enough signal to draft a process. It breaks down for:

1. **Shape-ambiguous asks**: "help me with invoicing" — is this quote → invoice → payment → reconcile? Which bit is the user asking for?
2. **Scope-ambiguous asks**: "follow up with my customers" — outbound sequences? Reply handling? Reminders? All three?
3. **Tool-ambiguous asks**: "send a message to Sarah" — CoS action? Network outreach? Direct draft?

A pre-tool "specificity probe" — small, deterministic, runs before the LLM picks a tool — catches these and asks one or two clarifying questions first. Under-specificity is detected by counting "specificity signals" present in the message + assembled context (named person, named process, specific action verb, measurable outcome, concrete artefact, temporal anchor).

## Objective

When Self is about to call a mutating tool (`generate_process(save=true)`, `start_pipeline`, `create_work_item`, `orchestrate_work`, any `edit_*` / `activate_*`) and the accumulated specificity signal is below threshold, Self asks a clarifying question instead. Threshold is calibrated to err on the side of drafting-with-preview, not on silent-ask.

## Non-Goals

- Semantic drift detection across turns (audit P2).
- Multi-intent decomposition (audit P2).
- Out-of-scope refusal (audit P1) — separate future brief.
- Touching read-only / preview tools (`generate_process(save=false)`, `get_briefing`, `detect_risks`).

## Inputs

1. `src/engine/self.ts` — tool-use loop, delegation guidance
2. `src/engine/self-delegation.ts` — guidance selection
3. `src/engine/capability-matcher.ts` — existing token-overlap scoring to reuse
4. `cognitive/self.md` — where the clarification principle should be cognitively framed
5. Audit findings: P0 #3 — ambiguous intent

## Constraints

- Zero extra LLM call in the pre-tool probe — pure function, deterministic.
- Threshold must be override-able per-user (advanced users can opt out of clarifying prompts).
- Clarifying question is asked via the normal streaming path, not a blocking modal.
- Preview tools (`save=false` variants) are always allowed without the probe — draft-first remains cheap.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Specificity signal scoring | Named-entity + verb-type lexicon (Sketch Engine style) | pattern | Deterministic, local, tiny |
| Clarification-before-action pattern | OpenAI cookbook: "Ask before act on ambiguous user intent" | pattern | Standard alignment practice |
| Pre-tool gate in Self loop | `self.ts` current tool loop structure | adopt | Fits cleanly before the existing tool dispatch |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/self-specificity.ts` | Create: pure function `scoreSpecificity(message: string, context: AssembledContext): { score: number; signals: string[] }`. Signals: named-person match (via people table tokens), named-process match (via process slugs), action verb ("send", "create", "schedule", "quote"...), temporal anchor ("today", "tomorrow", "this week", date format), measurable outcome ("X emails", "N clients"), concrete artefact ("invoice", "quote", "PR"). Each signal +1. |
| `src/engine/self.ts` | Modify: before calling a *mutating* tool, invoke `scoreSpecificity`. If `score < 2` AND the tool is in the mutating set, don't call the tool — return a clarifying question chosen by Self via a tiny prompt ("what would you like me to clarify?") or, simpler, via a deterministic question builder keyed to the top missing signals. Prefer the deterministic path to keep this zero-LLM-cost. |
| `cognitive/self.md` | Modify: add a "clarify before act" section (<60 tokens). |
| `src/engine/self-specificity.test.ts` | Create: unit tests for scoring across the audit's example strings ("handle this for me", "send quote to Sarah by Friday", "do follow-ups"). |
| `src/engine/self.test.ts` | Modify: test "low specificity + mutating tool → clarifying question, no tool call". |
| `packages/core/src/db/schema.ts` | Modify: add `userPreferences.clarifyBeforeAct: boolean default true` |
| `drizzle/NNNN_clarify_pref.sql` | Create: migration |

## User Experience

- **Jobs affected:** Delegate, Define, Capture.
- **Process-owner perspective:** Vague asks get *one* friendly clarifying question ("Which customers — the three you quoted last week, or your whole list?") before Self spins up work. Clear asks continue to run immediately.
- **Interaction states:** question message → user reply → standard tool routing.

## Acceptance Criteria

1. [ ] `scoreSpecificity` exists, pure, with documented signal set.
2. [ ] Self's tool loop consults it before any mutating tool call; skips for preview tools.
3. [ ] Threshold default = 2 signals. Configurable via user preference.
4. [ ] Test: "handle this for me" → score 0 → clarification, no tool call.
5. [ ] Test: "send quote to Sarah by Friday" → score ≥ 2 (person + action + temporal) → normal tool call.
6. [ ] Test: power-user preference `clarifyBeforeAct: false` bypasses the probe.
7. [ ] Cognitive extension adds <60 tokens to the Self prompt budget.
8. [ ] Migration journal index is next available.

## Review Process

1. Review agent samples 10 canonical asks (drawn from `docs/personas.md`) and manually scores them; compares against function output.
2. Confirms preview tools are exempt — user experience of drafting remains unchanged.
3. Checks the clarifying question is friendly, specific, and cites the missing signal.

## Smoke Test

```bash
pnpm test -- self-specificity self
```
Manual: open chat, type "handle this for me" → expect a single clarifying question, not a tool call.

## After Completion

Update `docs/state.md`: "Brief 177 — ambiguous intent clarification (2026-04-16, complete): pre-tool specificity probe (`scoreSpecificity`) gates mutating tool calls. Vague asks produce one clarifying question; clear asks run unchanged. Power-user opt-out via preference."
