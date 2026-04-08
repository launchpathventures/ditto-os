# Brief 098: Alex's Continuous Operation — The Pulse

**Date:** 2026-04-07
**Status:** draft
**Depends on:** Brief 097 (integration tools — hands Alex can use)
**Unlocks:** Autonomous advisor operation, ongoing user relationship via email, proactive status reporting, nurture cycles, follow-up sequences

## Goal

- **Roadmap phase:** Phase 12: Network Agent Execution
- **Capabilities:** Continuous process scanning, chain execution, inbound email intelligence, proactive status reporting, delayed/scheduled process creation

## Context

Brief 097 gives Alex hands (integration tools to send emails, record interactions, create contacts). This brief gives Alex a **clock** — the continuous operation loop that makes Alex an autonomous advisor rather than a one-shot task executor.

Today, `fullHeartbeat()` executes a burst of steps when called, then returns. Nothing wakes Alex up to:
- Follow up on outreach that got no reply after 5 days
- Send weekly pipeline briefings or Monday priority updates
- Check on nurture contacts who haven't been touched in 14 days
- Report status back to the user on what Alex has been doing
- Process inbound emails and route them to the right process

The chain triggers in process templates (follow-up-sequences, pipeline-tracking, network-nurture) are YAML documentation only — zero execution code. The `ProcessDefinition` interface doesn't even include a `chain` field.

Alex currently makes promises and goes silent. This brief makes Alex keep those promises.

### The Architectural Insight (Insight-159)

The Self and Alex are the same entity operating in different modes. The pulse is not "a system monitoring Alex's work" — it's **Alex's internal clock**, the same way a great EA checks their calendar every morning, follows up on outstanding items, and prepares briefings without being asked. The cognitive core (`cognitive/core.md`) is Alex's brain. The pulse is Alex's discipline.

## Objective

After this brief ships, Alex operates continuously: checking for outstanding work every 5 minutes, executing chain triggers when processes complete, detecting no-reply timeouts, composing and sending status updates, processing inbound emails, and maintaining nurture relationships — all without manual intervention. The user experiences Alex as a teammate who keeps working, keeps following up, and keeps them informed.

## Non-Goals

- Building new process templates beyond `weekly-briefing` (existing templates are correct — they just need the pulse to start them)
- Implementing the full Coverage Agent (Insight-142) — that's a separate capability
- Workspace upsell logic — manual for now
- Multi-user credential isolation — single-user MVP
- External workflow infrastructure (Temporal, Inngest, Trigger.dev) — build on existing node-cron + SQLite
- MCP server for internal tools — direct function dispatch is simpler for MVP

## Inputs

1. `docs/research/continuous-operation-and-integration-tools.md` — research report with 5 options evaluated
2. `docs/insights/141-proactive-operating-layer-pattern.md` — OpenClaw heartbeat pattern analysis
3. `docs/insights/076-proactive-attention-management.md` — five proactive attention dimensions
4. `docs/insights/159-self-is-alex-modes-not-entities.md` — Self = Alex architectural clarification
5. `src/engine/heartbeat.ts` — existing execution engine (`fullHeartbeat`, `startSystemAgentRun`, `resumeHumanStep`)
6. `src/engine/scheduler.ts` — existing cron scheduler (node-cron, schedule table)
7. `src/engine/tool-resolver.ts` — existing built-in tools pattern (`builtInTools` record)
8. `packages/core/src/harness/harness.ts` — `ProcessDefinition` interface (needs `chain` field)
9. `src/engine/channel.ts` — AgentMail adapter (inbound email via webhooks)
10. `processes/templates/front-door-intake.yaml` — chain definitions that need execution
11. `.context/journey-system-alignment.md` — full gap analysis across all user journeys
12. `.context/alex-continuous-operation.md` — detailed pulse architecture analysis

## Constraints

- Build on existing `scheduler.ts` (node-cron) — no new infrastructure dependencies
- Use SQLite for delayed runs and event registrations — no Redis
- Pulse interval configurable via env var (`PULSE_INTERVAL_MS`, default 300000 = 5 minutes)
- Pulse must be idempotent — safe to run multiple times, safe to crash and restart
- Chain execution must respect trust tiers — supervised chains pause for approval
- Inbound email handler must return 200 immediately, process async (AgentMail webhook pattern)
- Inbound webhook MUST validate AgentMail signature header before processing — reject unsigned requests
- `ChainDefinition` type in `packages/core/` must be minimal (trigger type, target process, raw inputs). Variable substitution logic (`{personId}` → actual value) stays in `src/engine/chain-executor.ts` (product layer)
- Status composition must respect "silence is a feature" — don't email users when there's nothing to report
- `ProcessDefinition` changes go to `packages/core/` first (engine primitive)
- All other changes stay in `src/engine/` (Ditto product code)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Periodic pulse scanning | OpenClaw heartbeat (Insight-141) | pattern | Validated proactive checking pattern; adapted from LLM-driven to code-driven for cost |
| Built-in tools for CRM | Ditto `tool-resolver.ts` builtInTools | existing | Pattern already works for `knowledge.search` — extend to CRM operations |
| Delayed runs via DB | BullMQ job scheduler concept | pattern | Idempotent delayed execution without Redis — use SQLite `delayed_runs` table |
| Event registration via DB | Inngest event fan-out concept | pattern | Store event handlers in DB, check on inbound — no external event bus |
| Webhook → process routing | AgentMail webhook-agent example | pattern | Background processing pattern for inbound email |
| Chain definitions | Ditto process templates (existing YAML) | existing | Chain syntax already designed — just needs execution engine |
| Status composition | Pipeline-tracking template (existing) | existing | Template defines what to include — pulse triggers it |

## What Changes (Work Products)

This brief is sized for two focused build sessions. Split into sub-briefs:

### Sub-brief 098a: The Pulse Engine + Chain Execution

| File | Action |
|------|--------|
| `packages/core/src/harness/harness.ts` | **Modify:** Add `chain?: ChainDefinition[]` to `ProcessDefinition`. Define `ChainDefinition` type: `{ trigger: "schedule" \| "delay" \| "event", interval?: string, delay?: string, event?: string, process: string, inputs: Record<string, string> }` |
| `src/db/schema.ts` | **Modify:** Add `delayed_runs` table (id, processSlug, inputs JSON, executeAt timestamp, status, createdByRunId). Add `event_handlers` table (id, eventName, processSlug, inputs JSON, createdByRunId, active boolean) |
| `src/engine/pulse.ts` | **Create:** The continuous operation loop. On each tick: (1) scan for due delayed runs → start them, (2) scan completed process runs for unprocessed chains → execute chain definitions, (3) check for no-reply timeouts via interaction queries → trigger follow-up processes. Registered as a cron job in scheduler. |
| `src/engine/chain-executor.ts` | **Create:** Read chain definitions from completed process, create delayed runs / schedules / event handlers. Variable substitution from process outputs (`{personId}` → actual value). |
| `src/engine/heartbeat.ts` | **Modify:** After process completion in `heartbeat()`, call `processChains(processRunId)` to handle chain definitions. Mark chains as processed to prevent re-execution. |
| `src/engine/process-loader.ts` | **Modify:** Parse `chain` section from YAML into `ProcessDefinition.chain` field |

### Sub-brief 098b: Inbound Email + Status Composition + Weekly Briefing

| File | Action |
|------|--------|
| `packages/web/app/api/v1/network/inbound/route.ts` | **Create:** AgentMail webhook endpoint. Returns 200 immediately, processes async. Parses sender email → matches person → classifies intent → routes to action. |
| `src/engine/inbound-email.ts` | **Create:** Inbound processing: match person, check for waiting_human step (resume), classify intent (approval/new-request/reply/opt-out), record interaction, trigger appropriate process if needed. |
| `src/engine/status-composer.ts` | **Create:** For each active user, query recent interactions, active process runs, pending approvals, completed work. Compose a concise status update. Respect "silence is a feature" — only send when there's something worth reporting. |
| `processes/templates/weekly-briefing.yaml` | **Create:** gather-state → draft-briefing → send-briefing → process-reply. Trust: supervised → spot_checked → autonomous. Self-referencing chain (7d schedule). |
| `src/engine/pulse.ts` | **Extend (from 098a):** Add status composition cycle — check if any user is due for a status update based on activity level and last contact. |

## User Experience

- **Jobs affected:** Orient (status updates tell user what's happening), Review (pending approvals surfaced proactively), Delegate (user requests via email → Alex acts)
- **Primitives involved:** Briefing (status composition), Work Item (pending approvals), Interaction (every touchpoint recorded)
- **Process-owner perspective:** The user does nothing different. They continue working via email with Alex. The difference is that Alex keeps working between emails — following up, nurturing, tracking, reporting. The user experiences this as "Alex is on top of things" rather than "I need to check in on Alex."
- **Interaction states:** N/A — email-driven, no new UI states. Admin teammate view shows more data as interactions accumulate.
- **Designer input:** Not invoked — email-driven UX follows existing persona voice

## Acceptance Criteria

### 098a: Pulse Engine + Chain Execution (12 AC)

1. [ ] `ProcessDefinition` in `packages/core/` includes `chain?: ChainDefinition[]` with minimal types (trigger, process, inputs). Variable substitution logic stays in `src/engine/chain-executor.ts`
2. [ ] `delayed_runs` table exists in schema with: id, processSlug, inputs, executeAt, status, createdByRunId
3. [ ] Pulse runs on configurable interval (`PULSE_INTERVAL_MS` env var, default 5 min), registered as cron job in scheduler
4. [ ] When a process run completes, `processChains()` reads chain definitions and creates delayed runs and/or schedules
5. [ ] Chain variable substitution works: `{personId}` in chain inputs resolves to actual process output value (implemented in product layer, not core)
6. [ ] Delayed runs whose `executeAt` has passed are started by the pulse and marked as executed
7. [ ] Schedule-type chains create recurring schedule records (picked up by existing scheduler)
8. [ ] Pulse is idempotent — running twice in quick succession does not duplicate work (DB-backed state, not in-memory)
9. [ ] Chain execution respects trust tiers — created process runs inherit parent's trust context
10. [ ] Unit tests cover: pulse idempotency, chain variable substitution, delayed run lifecycle. `pnpm run type-check` passes
11. [ ] Event-type chains (`trigger: "event"`) are parsed but deferred — logged as "event handler registered (not yet active)" with a note that inbound email classification (098b) will activate specific handlers. No `event_handlers` table needed yet (YAGNI until 098b proves the pattern)
12. [ ] Layer classification documented: chain definitions = L1 (Process), pulse = L2 (Agent/Heartbeat), inbound webhook = L6 (Human/entry point)

### 098b: Inbound Email + Status + Weekly Briefing (12 AC)

1. [ ] Inbound email webhook at `/api/v1/network/inbound` receives AgentMail POST, returns 200 immediately
2. [ ] Webhook validates AgentMail signature header — rejects unsigned/invalid requests with 401
3. [ ] Sender email matched to person record via `getPersonByEmail()`
4. [ ] If person has a `waiting_human` process step, inbound email resumes it via `resumeHumanStep()` with email text as input
5. [ ] If no waiting step, interaction recorded (type: `reply_received`) with email subject and summary
6. [ ] Basic reply classification: opt-out detection (triggers `opt-out-management`), positive-reply detection (fires event for chain triggers like `connecting-introduction`). Full intent classification (new requests, mode switching) deferred to Brief 099
7. [ ] `weekly-briefing` process template exists with: gather-state, draft-briefing, send-briefing steps. Trust: supervised → spot_checked → autonomous
8. [ ] Status composer queries interactions, active runs, and pending approvals for a user
9. [ ] Status composer respects "silence is a feature" — sends only when: (a) at least 1 new interaction, completed run, or pending approval since last status, AND (b) at least 3 days since last status email
10. [ ] Pulse triggers status composition check each cycle; sends via email when thresholds met
11. [ ] Weekly briefing process can be started by chain trigger from `front-door-cos-intake`
12. [ ] `pnpm run type-check` passes, all existing tests pass, new tests cover inbound webhook routing and status composition silence logic

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - `ProcessDefinition` change goes to `packages/core/` (engine primitive)
   - Chain execution uses existing patterns (scheduler, heartbeat)
   - Pulse is idempotent and crash-safe (SQLite-backed state, not in-memory timers)
   - Inbound email handler is async (returns 200 first)
   - Status composer follows "silence is a feature" principle
   - No new external dependencies introduced
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 098a: Pulse + Chains
# 1. Start the server — pulse should register as cron job
pnpm dev
# Expected: "[pulse] Registered pulse at 5-minute interval"

# 2. Create a test process run that completes (with chain definitions)
pnpm cli process start front-door-intake --inputs '{"email":"test@example.com",...}'
# Let it complete (or mock completion)
# Expected: "[chain] Processing chains for run <id>"
# Expected: "[chain] Created schedule: pipeline-tracking (7d)"
# Expected: "[chain] Created delayed run: follow-up-sequences (5d)"

# 3. Wait 5 minutes (or trigger pulse manually)
pnpm cli pulse trigger
# Expected: "[pulse] Scanning delayed runs... found 0 due"
# Expected: "[pulse] Scanning completed chains... found 0 unprocessed"

# 098b: Inbound Email + Status
# 4. Simulate inbound email webhook
curl -X POST http://localhost:3000/api/v1/network/inbound \
  -H "Content-Type: application/json" \
  -d '{"event_type":"message.received","message":{"from":"test@example.com","text":"Looks good, go ahead","subject":"Re: Here'\''s the plan"}}'
# Expected: 200 OK
# Expected: Person matched, interaction recorded or step resumed

# 5. Check admin view shows interactions
# Visit /admin → person should have interaction recorded
```

## After Completion

1. Update `docs/state.md` — pulse engine operational, chains execute, inbound email wired
2. Update `docs/roadmap.md` — Phase 12 capabilities: continuous operation, chain execution, inbound routing
3. Update `docs/architecture.md` — add `chain` to ProcessDefinition documentation, document pulse as L2 infrastructure
4. Write ADR if chain execution design evolves during build
5. Retrospective: what worked, what was harder than expected, what to improve
