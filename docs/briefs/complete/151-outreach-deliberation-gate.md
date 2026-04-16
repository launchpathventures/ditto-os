# Brief 151: Outreach Dedup, Context Injection, and Staged Dispatch Wiring

**Date:** 2026-04-14
**Status:** complete
**Depends on:** Brief 149 (Outreach Strategy Layer — plan-approve-execute)
**Unlocks:** Reliable outreach cadence, test mode correctness, staged dispatch pipeline

## Goal

- **Roadmap phase:** Phase 10 — GTM Pipeline
- **Capabilities:** Outreach deduplication safety net, interaction-history-aware cycle execution, staged outbound dispatch wiring, status email quality

## Context

Production observation: Alex created 261 duplicate "Reached out to Tim" interactions in a single status period. Root cause analysis reveals three compounding failures:

1. **Cycle auto-restart passes the same prospect list without interaction history.** When a sales-marketing or network-connecting cycle completes and auto-restarts (`heartbeat.ts:1024-1087`), it passes `previousCycleRunId` and `learnOutputs` to the new run, but the LLM-driven SENSE/ASSESS steps have no visibility into what outreach was already done. The LLM rationally re-selects Tim because it can't see it already contacted him.

2. **`sendAndRecord()` records interactions unconditionally.** In test mode (`DITTO_TEST_MODE=true`), the channel adapter suppresses the actual send but returns `success: true`. The interaction is recorded regardless (`channel.ts:994`). There is no deduplication or deliberation before recording.

3. **`dispatchStagedAction` is never wired up.** The staged outbound pipeline (`crm.send_email` marked `staged: true` in `tool-resolver.ts:58`) queues actions during step execution, but the product layer never provides the `dispatchStagedAction` callback when creating the harness context (`heartbeat.ts:604`). Staged actions are approved by the outbound-quality-gate but silently disappear because the dispatch callback is null.

The design principle (Insight-184): **Trigger-Think-Act, not Trigger-Act.** Triggers decide WHEN to consider an action. Thinking decides WHETHER and WHAT to do. Acting executes the decision. The current system conflates trigger and act.

## Objective

Three mechanical fixes that together prevent the 261-duplicate problem and enable the Trigger-Think-Act pattern (Insight-184) going forward:

1. **Dedup safety net** — `sendAndRecord()` rejects duplicate outreach to the same person within the same process run, preventing runaway loops regardless of what the LLM decides.
2. **Context injection** — cycle auto-restart injects recent outreach history so the LLM's SENSE/ASSESS steps (the existing "Think" layer) can see what was already done.
3. **Staged dispatch wiring** — `dispatchStagedAction` callback is wired so the outbound-quality-gate pipeline actually delivers emails instead of silently discarding them.

Plus: status email highlights aggregated by person instead of listing each interaction, and the relationship pulse time gate relaxed to let the LLM deliberation run more often.

This brief is infrastructure for Insight-184. It does not add a new LLM deliberation gate — the existing SENSE/ASSESS/ACT steps and relationship-pulse LLM are the "Think" layer. This brief gives them the right context and prevents damage when they fail.

## Non-Goals

- Replacing the time-based triggers (pulse tick, cron schedule). These remain as the mechanical "when to consider" layer.
- Building a full conversation-aware outreach sequencing system (future brief).
- Changing the trust tier model or introducing new trust concepts.
- Modifying the outreach strategy sub-process (Brief 149) — the plan-approve-execute flow is correct; this brief fixes the execution layer underneath it.
- Redesigning the relationship pulse architecture — it already follows the right pattern (snapshot → LLM → act/silence). This brief extends that pattern to cycle-driven outreach.

## Inputs

1. `src/engine/relationship-pulse.ts` — good architectural pattern: `buildUserSnapshot()` → `composeProactiveMessage()` → act/silence. The model to extend.
2. `src/engine/channel.ts:871-1027` — `sendAndRecord()` function. Where the per-person recency context needs to be checked.
3. `src/engine/heartbeat.ts:1024-1087` — cycle auto-restart. Where interaction history needs to be injected into the new run's inputs.
4. `src/engine/tool-resolver.ts:55-118` — `crm.send_email` built-in tool, `staged: true`. Where the staging pipeline starts.
5. `src/engine/harness-handlers/memory-assembly.ts:432` — where `resolveTools()` passes `stagedOutboundActions`. The staged queue is wired here.
6. `packages/core/src/harness/handlers/outbound-quality-gate.ts:86-87` — where `dispatchStagedAction` is called for approved actions.
7. `src/engine/status-composer.ts:183-191` — outreach highlight loop. Where per-person aggregation is missing.
8. `src/engine/people.ts:182-228,247-265` — `recordInteraction()` and `hasInteractionSince()`. The interaction history query layer.
9. `docs/insights/184-trigger-think-act-not-trigger-act.md` — the design insight driving this brief.
10. `docs/insights/182-outreach-requires-plan-approve-execute.md` — plan-approve-execute pattern.
11. `docs/insights/145-relationship-first-beats-volume.md` — quality over volume principle.

## Constraints

- Side-effecting functions must require `stepRunId` parameter per Insight-180. The `dispatchStagedAction` callback receives the staged action which carries `stepRunId` — this must be threaded through to `sendAndRecord()`.
- The deliberation gate must be deterministic where possible (Insight-116): check interaction history via SQL, not LLM. Only escalate to LLM deliberation for ambiguous cases (e.g., same person, different goal context).
- Must not break the existing test suite. All existing `channel.test.ts`, `relationship-pulse.test.ts`, `status-composer.test.ts`, `heartbeat` tests must continue to pass.
- `@ditto/core` boundary: the `dispatchStagedAction` callback type is defined in core (`packages/core/src/harness/harness.ts:340`). The implementation is product-layer (Ditto). No changes to `@ditto/core` are needed — only the product layer needs to wire the callback.
- The deliberation gate must not add latency to the critical path for single-person outreach. Batch deliberation (cycle steps contacting multiple people) can absorb the interaction history lookup.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Snapshot → deliberation → act/silence | `relationship-pulse.ts` `buildUserSnapshot()` + `composeProactiveMessage()` | pattern | Proven in production, same codebase |
| Per-person interaction recency check | `people.ts` `hasInteractionSince()` | adopt | Already exists, just not called at the right point |
| Staged action dispatch | `@ditto/core` `outbound-quality-gate.ts` `dispatchStagedAction` | adopt | Interface exists in core, product layer just needs to implement the callback |
| Status highlight aggregation by person | `outreach-table.ts` person-grouped rendering | pattern | Same codebase — outreach table already groups by personId |
| Trigger-Think-Act separation | Original (Insight-184) | — | Emerged from this investigation |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/channel.ts` | Modify: (1) Add optional `stepRunId` field to `SendAndRecordInput` interface (Insight-180 compliance). (2) In `sendAndRecord()`, before recording, query `getRecentInteractionsForPerson(personId, "outreach_sent", 24h)` — if any exist with the same `processRunId`, log `[channel] DUPLICATE SUPPRESSED: already sent outreach to {personId} in run {processRunId}` and return `{ success: false, error: "duplicate_outreach_suppressed" }`. Also log via `logActivity()` with outcome "suppressed" (Insight-184 corollary 3: record what was decided, not just what was done). (3) Add a hard per-person daily cap: max 3 `outreach_sent` to same `personId` in 24 hours, regardless of processRunId. This prevents LLM over-eagerness across cycle iterations. |
| `src/engine/heartbeat.ts` | Modify: (1) In cycle auto-restart block (~line 1048-1057), query recent `outreach_sent` interactions by joining `interactions` where `processRunId = completingRunId` — no lineage walk needed, just "what did THIS run do." Inject as `recentOutreach` array into `updatedInputs` for the new run. (2) In `createHarnessContext()` call (~line 604), wire `dispatchStagedAction` callback. The callback maps the staged action's args to `sendAndRecord()` input, threading `stepRunId` from the staged action's context. |
| `src/engine/tool-resolver.ts` | Modify: in the `crm.send_email` execute function (~line 104-118), pass `stepRunId` (available from the resolver's `stepRunId` parameter) through to `sendAndRecord()`. Same for `crm.send_social_dm`. |
| `src/engine/status-composer.ts` | Modify: in the outreach highlights block (~line 183-191), aggregate by `personId` instead of listing each interaction individually. Output "Reached out to {name} ({count} times)" when count > 1, plus the "...and N more" summary for remaining people. |
| `src/engine/relationship-pulse.ts` | Modify: reduce `MIN_HOURS_BETWEEN_OUTREACH` from 24 to 4 hours (not 1 hour — reviewer correctly flagged that pulse ticks every 5 minutes, giving the LLM too many chances). 4 hours means max 6 deliberation opportunities per day. Combined with the per-person daily cap of 3 in `sendAndRecord()`, even if the LLM decides "yes" every time, it's bounded. The LLM still needs something substantive to say (the prompt already enforces this). |
| `src/engine/people.ts` | Modify: add `getRecentInteractionsForPerson(personId, type, since)` function that returns interaction records (not just boolean). This is used by both the cycle auto-restart context injection and the `sendAndRecord` dedup check. |
| `src/engine/channel.test.ts` | Modify: add tests for duplicate outreach suppression in `sendAndRecord()`. |
| `src/engine/status-composer.test.ts` | Modify: add test for per-person aggregation in highlights. |
| `src/engine/relationship-pulse.test.ts` | Modify: update tests for changed time-gate behavior (1-hour safety floor instead of 24-hour hard gate). |

## User Experience

- **Jobs affected:** Orient (status emails now show aggregated outreach per person, not duplicated lines)
- **Primitives involved:** Brief (status digest), Notification (email updates)
- **Process-owner perspective:** The user receives status emails that read like an advisor's report ("Reached out to Tim, Sarah at BuildCo, and 3 others") instead of a log dump ("Reached out to Tim, Reached out to Tim, Reached out to Tim..."). Outreach volume matches what a thoughtful advisor would do — no more 261-duplicate storms.
- **Interaction states:** N/A — no new UI surfaces
- **Designer input:** Not invoked — lightweight UX section only. The change is in email content quality, not interaction design.

## Acceptance Criteria

1. [ ] `sendAndRecord()` checks for existing `outreach_sent` interaction to the same `personId` with the same `processRunId` in the last 24 hours. If found, returns `{ success: false, error: "duplicate_outreach_suppressed" }` and logs `[channel] DUPLICATE SUPPRESSED: ...`.
2. [ ] `sendAndRecord()` enforces a per-person daily cap: max 3 `outreach_sent` interactions to the same `personId` in 24 hours, regardless of `processRunId`. Returns `{ success: false, error: "daily_person_cap_exceeded" }` when hit.
3. [ ] Suppressed outreach is recorded via `logActivity("outreach.suppressed", ...)` with the personId and reason — not just a console.log (Insight-184 corollary 3).
4. [ ] `SendAndRecordInput` includes optional `stepRunId` field (Insight-180). The `crm.send_email` and `crm.send_social_dm` execute functions in `tool-resolver.ts` pass `stepRunId` through.
5. [ ] Cycle auto-restart injects `recentOutreach` (array of `{ personId, personName, channel, sentAt, subject }`) into the new run's inputs. Data sourced from `outreach_sent` interactions where `processRunId` matches the completing run.
6. [ ] `dispatchStagedAction` callback is wired in `heartbeat.ts` when creating the harness context. Callback maps staged action args to `sendAndRecord()` input, threading `stepRunId`.
7. [ ] After wiring `dispatchStagedAction`, a staged `crm.send_email` call in a process step results in an actual email send (or test-mode suppression), not a silent discard.
8. [ ] Status composer aggregates outreach highlights by `personId`. Single outreach: "Reached out to Tim at BuildCo". Multiple: "Reached out to Tim at BuildCo (3 messages)". Overflow: "...and 4 more people contacted".
9. [ ] Relationship pulse `MIN_HOURS_BETWEEN_OUTREACH` reduced from 24 to 4 hours. The LLM deliberation runs more often but per-person daily cap (AC2) prevents over-sending.
10. [ ] `getRecentInteractionsForPerson(personId, type, since)` function exists in `people.ts` and returns interaction records with `personName`, `channel`, `sentAt`, `subject`.
11. [ ] All existing tests in `channel.test.ts`, `relationship-pulse.test.ts`, `status-composer.test.ts` pass (no regressions).
12. [ ] New test: `sendAndRecord()` with duplicate personId+processRunId returns suppressed result.
13. [ ] New test: `sendAndRecord()` with 3 existing interactions to same personId in 24h returns daily cap exceeded.
14. [ ] New test: status composer with 5 outreach interactions to the same person produces 1 highlight line, not 5.
15. [ ] New test: relationship pulse with 2-hour-old `lastNotifiedAt` is still blocked (< 4 hours), 5-hour-old is not blocked.
16. [ ] Cycle auto-restart log includes count of recent outreach interactions injected.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Layer alignment (L2 Agent for pulse changes, L3 Harness for staged dispatch, L4 Awareness for interaction history injection)
   - Insight-180 compliance (stepRunId threading through dispatchStagedAction)
   - Insight-116 alignment (deterministic dedup check, not LLM-based)
   - Trust model preservation (no trust tier changes)
   - `@ditto/core` boundary respected (no core changes)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run type check
pnpm run type-check

# 2. Run affected tests
pnpm vitest run src/engine/channel.test.ts
pnpm vitest run src/engine/status-composer.test.ts
pnpm vitest run src/engine/relationship-pulse.test.ts

# 3. Manual verification: trigger a test-mode cycle and verify:
#    - Cycle auto-restart log shows "injecting N recent outreach interactions"
#    - Second cycle iteration does NOT create duplicate outreach_sent for same person
#    - Status email shows aggregated highlights (not duplicated lines)
#    - dispatchStagedAction log shows "dispatching staged crm.send_email to {email}"
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark outreach deliberation gate as done
3. Phase retrospective: what worked, what surprised, what to change
4. Verify Insight-184 is accurate post-implementation or update
