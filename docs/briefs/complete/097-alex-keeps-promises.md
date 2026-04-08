# Brief 097: Alex Keeps Promises — Integration Tools & Interaction Recording

**Date:** 2026-04-07
**Status:** draft
**Depends on:** Brief 093 (front door chat), Brief 079/080 (people & interactions), Brief 088 (network API auth)
**Unlocks:** Brief 098 (Alex's continuous operation — the pulse), admin teammate view with real data, trust tier progression based on actual outcomes

## Goal

- **Roadmap phase:** Phase 12: Network Agent Execution
- **Capabilities:** Built-in CRM tools for process steps (send email, record interaction, create person), atomic send-and-record for all outreach, interaction recording for front door emails

## Context

The front door conversation works. Alex creates process runs with correct inputs. But the steps fail because:
1. `send-email` — declared in process YAML but no tool registered
2. `record-interaction` — declared but no tool registered
3. `create-person` — declared but no tool registered
4. `interactions` table is never written to — the admin teammate view shows 0 comms

The research report (`docs/research/continuous-operation-and-integration-tools.md`) and reviewer Flag 1 identified that **`builtInTools` already exists** in `tool-resolver.ts` — the `knowledge.search` tool proves the pattern. CRM tools follow the same mechanism: add entries to the `builtInTools` record with a definition + execute function. No new protocol handler, no YAML registry entry, no new infrastructure.

This brief is focused: give Alex the tools to send emails, record interactions, and create contacts within process steps. Brief 098 handles the continuous operation loop (pulse, chains, inbound email, status reporting).

## Objective

Every email Alex sends is recorded as an interaction. Process steps that need to send email, record interactions, or create contacts have working tools. The admin teammate view shows real activity.

## Non-Goals

- Inbound email handling (Brief 098b)
- Chain execution and follow-up scheduling (Brief 098a)
- Status composition and weekly briefings (Brief 098b)
- Reply classification (Brief 099)
- `rules` executor (deferred — the pulse in 098a handles delayed/scheduled work more robustly)
- Building new process templates
- Workspace app changes

## Inputs

1. `src/engine/tool-resolver.ts` — `builtInTools` pattern (lines 40-74). Existing `knowledge.search` registration
2. `src/engine/channel.ts` — AgentMail adapter (`createAgentMailAdapterForPersona`)
3. `src/engine/people.ts` — `createPerson()`, `recordInteraction()`, `getPersonByEmail()`
4. `src/engine/self-tools/network-tools.ts` — `sendActionEmail()`, `sendCosActionEmail()`, `startIntake()`
5. `src/engine/network-chat.ts` — ACTIVATE block where front door emails are sent but not tracked
6. `src/adapters/claude.ts` — tool use loop that dispatches built-in tools (lines 359-375)
7. `processes/templates/front-door-intake.yaml` — tools: send-email, record-interaction, create-person
8. `processes/templates/front-door-cos-intake.yaml` — same tool references
9. `docs/research/continuous-operation-and-integration-tools.md` — research report, Option A / reviewer Flag 1
10. `docs/insights/159-self-is-alex-modes-not-entities.md` — Self = Alex, same entity

## Constraints

- Use the existing `builtInTools` pattern in `tool-resolver.ts`. Do NOT create a new `internal` protocol handler or `ditto-crm.yaml` registry entry — the built-in tools mechanism is simpler, already proven, and avoids unnecessary indirection.
- Use the existing channel adapter (`createAgentMailAdapterForPersona`). Don't create a second email path.
- Every email sent MUST be recorded as an interaction. No silent sends. `sendAndRecord()` is the single path.
- Every interaction record MUST include `processRunId` (when available) to link back to the process.
- Trust tiers must be respected — supervised processes always pause for human review before sending outreach.
- Test mode (`DITTO_TEST_MODE`) must suppress real email sends while still recording interactions and advancing processes.
- Process template tool references (`send-email`, `record-interaction`, `create-person`) must be updated to built-in qualified names (`crm.send_email`, etc.). The resolver uses dot notation for lookup keys but LLM tool definition names use underscores (`crm_send_email`) — following the existing `knowledge.search` → `knowledge_search` convention.
- `sendAndRecord()` must accept `userId` alongside `personId` — `recordInteraction()` in `people.ts` requires both. For front door emails, `userId` is "founder" (single-user MVP). For process step emails, derive from the process run's context.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Built-in tools pattern | Ditto `src/engine/tool-resolver.ts` lines 40-74 | existing | `knowledge.search` proves the pattern — add CRM tools the same way |
| AgentMail adapter | Ditto `src/engine/channel.ts` | existing | Already sends email — wrap with interaction recording |
| CRM operations | Ditto `src/engine/people.ts` | existing | `createPerson`, `recordInteraction` already implemented |
| Atomic send + record | Original to Ditto | original | `sendAndRecord()` ensures no email goes untracked |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/tool-resolver.ts` | **Modify:** Add three built-in tools to `builtInTools` record: `crm.send_email` (send via channel adapter + record interaction), `crm.record_interaction` (write to interactions table), `crm.create_person` (create person record). Each follows the `knowledge.search` pattern: definition + execute function. |
| `src/engine/channel.ts` | **Modify:** Add `sendAndRecord()` — sends email via adapter AND records interaction atomically. Takes: to, subject, body, personaId, mode, personId, processRunId. Returns: success boolean + interaction ID. This becomes the single path for all outreach. |
| `src/engine/self-tools/network-tools.ts` | **Modify:** `sendActionEmail()`, `sendCosActionEmail()`, and `sendIntroEmail()` → use `sendAndRecord()` so all front door emails are tracked as interactions. |
| `src/engine/network-chat.ts` | **Modify:** Pass `personId` to the email functions so `sendAndRecord()` can link interactions to the correct person. Currently `startIntake()` returns `personId` but it's not passed through to the email sends. |
| `processes/templates/front-door-intake.yaml` | **Modify:** Update tool names in steps to match built-in names: `crm.send_email`, `crm.record_interaction`, `crm.create_person`. Remove `schedule-follow-ups` step (deferred to Brief 098a pulse + chains). |
| `processes/templates/front-door-cos-intake.yaml` | **Modify:** Same tool name updates. |

## User Experience

- **Jobs affected:** Review (user reviews draft intros — process steps can now actually send them after approval)
- **Primitives involved:** Interaction (every email tracked), Work Item (human approval steps work end-to-end)
- **Process-owner perspective:** No visible change to the user. The difference is behind the scenes — emails that were sent but not tracked are now tracked. Process steps that failed silently now execute. The admin teammate view shows real interactions.
- **Interaction states:** N/A — no UI changes
- **Designer input:** Not invoked — backend infrastructure only

## Acceptance Criteria

1. [ ] `crm.send_email` built-in tool exists in `builtInTools` with LLM tool definition (name: `crm_send_email`, underscore convention matching `knowledge_search`) and execute function that calls `sendAndRecord()`
2. [ ] `crm.record_interaction` built-in tool writes to `interactions` table with: type, channel, mode, subject, summary, outcome, personId, processRunId
3. [ ] `crm.create_person` built-in tool calls `people.createPerson()` and returns the new person ID
4. [ ] `sendAndRecord()` accepts: to, subject, body, personaId, mode, personId, userId, processRunId. Atomically sends email via channel adapter AND records interaction — no email goes untracked
5. [ ] `sendActionEmail()`, `sendCosActionEmail()`, `sendIntroEmail()` use `sendAndRecord()` — front door emails appear in interactions table
6. [ ] Process step `send-outreach` in `front-door-intake` can execute using `crm.send_email` tool — the step no longer fails with "unknown tool"
7. [ ] Process step `draft-first-briefing` in `front-door-cos-intake` steps can use `crm.send_email` when they need to email the user
8. [ ] Every interaction record includes `processRunId` when the email was sent by a process step
9. [ ] Trust gate enforces supervised tier: all outreach steps pause for human review before `crm.send_email` executes
10. [ ] Test mode (`DITTO_TEST_MODE=true`) suppresses real sends but still records interactions and advances steps
11. [ ] Admin teammate view (`/admin`) shows interactions for people after front door emails are sent
12. [ ] `pnpm run type-check` passes, all existing tests pass, new tests cover: tool resolution for CRM tools, `sendAndRecord()` atomicity, interaction recording with processRunId

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - CRM tools use the existing `builtInTools` pattern (no new protocol handler)
   - `sendAndRecord()` is the single path for all outreach (no untracked emails)
   - Trust tiers respected (supervised = always pause before send)
   - Test mode works correctly
   - Tool names in process templates resolve correctly
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Start the dev server
pnpm dev

# 2. Visit /welcome, chat with Alex, submit email
#    Expected: intro email sent + interaction recorded

# 3. Check admin view (/admin)
#    Expected: person visible with at least 1 interaction (intro email)

# 4. Check tool resolution works for process steps
pnpm cli process start front-door-intake --inputs '{"email":"test@example.com","name":"Test","need":"clients","targetType":"property managers","conversationSummary":"Test conversation"}'
# Expected: research-targets step executes, draft-intros step executes
# Expected: user-approval step pauses (waiting_human)
# Expected: NO "unknown tool" errors in logs

# 5. Verify interactions table has entries
pnpm cli network people --interactions
# Expected: at least intro_email interaction with personId
```

## After Completion

1. Update `docs/state.md` — CRM built-in tools wired, interaction recording working, front door emails tracked
2. Update `docs/roadmap.md` — Phase 12: integration tools delivered
3. Retrospective: how the builtInTools pattern scaled, any rough edges in sendAndRecord atomicity
4. Capture Insight: "Every promise Alex makes must be backed by infrastructure" — the trust integrity principle
