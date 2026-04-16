# Brief 167: Capability Matcher + Self Context

**Date:** 2026-04-16
**Status:** draft
**Depends on:** None
**Unlocks:** Brief 168 (Library & Today Personalization)

## Goal

- **Roadmap phase:** Cross-cutting (L2 Agent / L4 Awareness)
- **Capabilities:** Capability matching engine, Self context awareness, conversational capability discovery

## Context

Brief 166 (parent) establishes the design: Alex should always know what the user COULD be doing. This sub-brief builds the engine that powers it — a deterministic capability matcher and the Self context signals that let Alex weave capability awareness into natural conversation.

Once this brief is complete, Alex will proactively suggest capabilities at natural moments: post-onboarding, post-trust-upgrade, when new context is learned, and in daily briefings. The passive surfaces (Library personalization, Today view) come in Brief 168.

## Objective

Build the capability matching engine and wire it into Self context assembly so Alex naturally surfaces unactivated capabilities during conversation.

## Non-Goals

- Library/Today composition changes (Brief 168)
- New content block types (compose from existing blocks)
- Multi-tenant team matching (Phase 12+)
- Changes to the coverage-agent system agent
- Changes to the suggestion-dismissals mechanism

## Inputs

1. `docs/research/capability-awareness-ux.md` — UX interaction spec (7 trigger moments, intensity curve, anti-patterns)
2. `docs/insights/193-continuous-capability-awareness.md` — design principle
3. `src/engine/self.ts` — Self context assembly (where capability signals go)
4. `src/engine/self-tools/suggest-next.ts` — existing suggestion tool (matcher augments this)
5. `src/engine/process-data.ts` — `getProcessCapabilities()` (template metadata source)
6. `src/engine/user-model.ts` — `getUserModel()` (user context source)
7. `src/engine/suggestion-dismissals.ts` — existing dismissal mechanism
8. `cognitive/self.md` — proactive guidance instructions
9. `processes/onboarding.yaml` — onboarding flow

## Constraints

- Capability matcher MUST be deterministic — no LLM calls, no external API calls. Pure function: (userModel, activeProcesses, templates) → ranked matches.
- `<capability_awareness>` section in Self context MUST be ≤1200 chars (~300 tokens). Conditionally loaded — omitted when no unmatched capabilities exist or user has 5+ active processes.
- Trigger signals MUST follow the existing `<briefing_signal>` / `<first_session_signal>` pattern in `assembleSelfContext()`.
- MUST respect existing suppression rules: zero suggestions during exceptions, 30-day dismiss cooldown, dedup against active processes (MP-10.1 `isDuplicateOfExistingProcess`).
- MUST suppress capability suggestions when user has 2+ processes at supervised tier (review-overloaded, Insight-142).
- Capability matcher MUST accept optional `teamId?: string` parameter (unused for now, forward-compatible for Phase 12).
- No side effects — the matcher reads data and produces scores. Insight-180 stepRunId guard not applicable.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Token overlap scoring | TF-IDF information retrieval | pattern | Lightweight, deterministic, proven for short-text matching |
| Dimension weighting | Original to Ditto | — | problems > challenges > tasks (pragmatic priority order) |
| Signal injection in Self context | Existing `<briefing_signal>` in self.ts | — | Proven pattern, Alex decides timing |
| Suggestion suppression rules | Existing suggest-next.ts + Insight-142 | — | Reuse proven guardrails |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/capability-matcher.ts` | **Create:** Deterministic matcher function. Input: user model entries + active process slugs + all template metadata. Output: `CapabilityMatch[]` with `templateSlug`, `relevanceScore` (0-1), `matchReason` (string using user's own words). Scoring: token overlap between user model content and template name+description+quality_criteria, weighted by dimension. |
| `src/engine/capability-matcher.test.ts` | **Create:** Tests for matching algorithm — problem match, challenge match, industry pattern fallback, dedup, suppression rules. |
| `src/engine/self.ts` | **Modify:** Add `<capability_awareness>` section to `assembleSelfContext()`. Calls matcher, formats top 3 unmatched capabilities with match reasons. Conditionally loaded (5+ processes → omit, no user model → omit, no unmatched → omit). Add trigger signals: `<capability_signal>` for post-onboarding, post-trust-upgrade, new-context-learned moments. |
| `src/engine/self-tools/suggest-next.ts` | **Modify:** Replace inline matching logic with imported `matchCapabilities()` from capability-matcher.ts. Preserves existing output format and suppression rules. |
| `cognitive/self.md` | **Modify:** Update "Proactive Guidance" section (~50 tokens). Add capability awareness framing: reference `<capability_awareness>` context naturally in conversation, use user's own words, observe→connect→offer pattern, intensity guidance (heavier first 2 weeks, lighter once 4+ processes). |
| `processes/onboarding.yaml` | **Modify:** Enhance `propose-first-process` step description. After first process proposal, instruct Self to present 2-3 additional matched capabilities as a package using existing block types (TextBlock header + RecordBlock per capability + ActionBlock). |

## User Experience

- **Jobs affected:** Define (what to set up next), Decide (which capability to activate)
- **Primitives involved:** TextBlock, RecordBlock, ActionBlock (existing — composed for capability package)
- **Process-owner perspective:** Alex naturally mentions capabilities at 5 moments: onboarding ("here's what I'd set up"), post-trust-upgrade ("now that X runs itself..."), new context learned ("you mentioned hiring — I can handle reference checking"), briefings ("one gap I'm noticing..."), and post-approval ("while I have you..."). Uses the user's own words as match reasons.
- **Interaction states:**
  - No user model → no capability signals (onboarding handles discovery)
  - 1-4 active processes → full capability awareness in Self context
  - 5+ active processes → capability signals suppressed (portfolio built)
  - 2+ supervised → capability signals suppressed (review-overloaded)
  - During exceptions → all suggestions suppressed (existing rule)
  - Suggestion dismissed → 30-day cooldown for that slug (existing mechanism)
- **Designer input:** `docs/research/capability-awareness-ux.md` — triggers #1-5 inform Self context signals, intensity curve informs conditional loading thresholds

## Acceptance Criteria

1. [ ] **Capability matcher exists** at `src/engine/capability-matcher.ts`. Exports `matchCapabilities(userModel, activeProcessSlugs, templates, options?)` returning `CapabilityMatch[]` sorted by `relevanceScore` descending. Options includes optional `teamId?: string` (unused, forward-compatible).

2. [ ] **Dimension-weighted scoring.** Matcher computes token overlap between user model entries and template metadata (name + description + quality_criteria). Weights: problems=1.0, challenges=0.8, tasks=0.7, frustrations=0.6, goals=0.4, vision=0.3. A user model entry "follow-ups are falling through the cracks" matches `follow-up-sequences` template regardless of industry.

3. [ ] **Match reason uses user's words.** Each `CapabilityMatch` includes `matchReason` string constructed from the user model entry that produced the highest score. Example: `"You mentioned follow-ups falling through"` — not `"Industry pattern: follow-up sequences"`.

4. [ ] **Dedup and suppression.** Matcher excludes: (a) active processes (slug match), (b) paused processes (slug match — paused processes count toward portfolio size per UX spec), (c) dismissed suggestions within 30 days (via `getActiveDismissalHashes`), (d) internal/system processes (existing `INTERNAL_SLUGS` list). Returns empty array when user has 5+ active-or-paused processes (paused processes count toward the threshold).

5. [ ] **Review-overload suppression (Insight-142).** When 2+ active processes are at supervised tier, matcher returns empty array. Checked by querying process trust tiers.

6. [ ] **Self context `<capability_awareness>` section.** `assembleSelfContext()` calls matcher and includes a `<capability_awareness>` section listing user's active processes by category + top 3 unmatched capabilities with match reasons. Section is ≤1200 chars. Omitted when matcher returns empty. **Branch behavior:** Included in established-user and new-user (post-first-process) branches. Excluded from inbound branch (async email/voice flows don't benefit from capability suggestions). Excluded from first-session-signal path (onboarding handles initial discovery). If matcher throws, section is silently omitted (non-fatal, consistent with conditional loading).

7. [ ] **Post-onboarding capability signal.** When Self context detects: (a) first process was recently created (within current session or last 24h) AND (b) matched capabilities exist, include `<capability_signal type="post_onboarding">` with matched template slugs and reasons. Instructs Self to present as a capability package using TextBlock + RecordBlock + ActionBlock composition.

8. [ ] **Post-trust-upgrade signal.** When Self context detects a pending trust milestone (from `assembleTrustMilestones`), include `<capability_signal type="post_trust_upgrade">` suggesting expansion. Only fires if the graduating process freed review capacity AND matched capabilities exist.

9. [ ] **New-context-learned signal.** When `assembleSelfContext()` detects a `update_user_model` tool call in the current session's turn history (check session turns for tool_name="update_user_model"), include `<capability_signal type="new_context">` with ALL current matches. The Self will naturally mention the most relevant one. No comparison against previous match state needed — the signal fires on any user model update, and the Self's judgment (guided by cognitive/self.md) handles whether to mention it. Max once per session (track via session metadata flag `capabilitySignalFired`).

10. [ ] **Post-approval contextual signal.** When Self context detects a review was approved in the current session (check session turns for tool_name="approve_review"), include `<capability_signal type="post_approval">` with the top 1 match contextually related to the approved process's domain. Signal instructs Self to mention as a P.S. — one sentence max, "While I have you —" tone. Max once per session (same `capabilitySignalFired` flag as AC9). If no contextual match exists, no signal.

11. [ ] **Cognitive guidance updated.** `cognitive/self.md` Proactive Guidance section updated (~50 tokens added). Instructs Self to reference `<capability_awareness>` context naturally: observe→connect→offer, user's own words, max 1-2 per conversation, heavier first 2 weeks, lighter once 4+ processes active. Never as a list. Never during exceptions.

12. [ ] **Onboarding enhanced.** `processes/onboarding.yaml` `propose-first-process` step description includes instruction for Self to present 2-3 matched capabilities alongside the first process proposal, composed from existing content blocks. Capability package renders as: TextBlock header + RecordBlock per capability (status: `{ label: "Recommended", variant: "info" }` for recommended, `{ label: "Running", variant: "positive" }` for active, `{ label: "Available", variant: "neutral" }` for available; accent left as default) + ActionBlock for "Set up [top match]" primary action.

13. [ ] **suggest-next refactored.** `suggest-next.ts` imports and uses `matchCapabilities()` from capability-matcher.ts instead of inline matching logic. Existing output format and suppression rules preserved. Tests pass.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: matcher is deterministic (no LLM), token budget respected, signal pattern consistent with existing briefing_signal, suppression rules complete, onboarding YAML changes don't break existing flow
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run matcher tests
pnpm vitest run src/engine/capability-matcher.test.ts

# 2. Run type-check
pnpm run type-check

# 3. Manual: Start web app, create a new user session
# Describe a plumbing business in conversation
# Verify Alex mentions follow-ups/scheduling capabilities naturally
# Verify the <capability_awareness> section appears in Self context (check logs)

# 4. Manual: Create first process, return to conversation
# Verify Alex presents a capability package (2-3 additional capabilities)
# Verify package uses RecordBlock + ActionBlock (no new block type)
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — note capability awareness engine complete
3. Brief 168 (Library & Today Personalization) is now unblocked
4. Retrospective: did the token budget hold? Did the matcher produce good results with deterministic scoring?
