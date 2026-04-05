# Brief 075: Proactive Operating Layer — Enabling EA-Class Harness Patterns

**Date:** 2026-04-02
**Status:** draft
**Depends on:** Phase 10 complete (conversation experience, composition intents, ContentBlocks), ADR-005 (integration architecture), ADR-016 (Conversational Self), Brief 071 (universal work loop)
**Unlocks:** EA-class use cases (executive assistant, business development, daily task management), personal agent workflows, proactive attention delivery, schedule-driven process execution

## Goal

- **Roadmap phase:** Phase 11+ — extends the workspace interaction model to support proactive, schedule-driven, deeply personalized agent workflows
- **Capabilities:** Schedule triggers on processes, heartbeat definition as a Self capability, bidirectional shared artifacts, structured personalization capture, integration execution for external services (Gmail, Calendar, Sheets)

## Context

Ryan Carson's "clawchief" repo (snarktank/clawchief) demonstrates the highest-value agent pattern emerging in the wild: a **proactive operating layer** that transforms a reactive chat agent into an executive assistant / chief of staff. The setup delivers inbox triage, calendar management, task list management, CRM updates, proactive follow-ups, and daily task prep — through six architectural primitives: skills as behavioral blocks, workspace files as durable state, heartbeat-driven proactive checks, cron-based recurring execution, a canonical task list as single source of truth, and private context files for deep personalization.

This pattern went viral because it works. But it requires a developer to assemble manually from markdown files and cron jobs. It's fragile (no governance), doesn't learn (no feedback loops), and can't be set up by non-technical users (Rob, Lisa, Jordan, Nadia).

**Ditto's architecture already designs for every primitive clawchief uses** — but several are not yet implemented. This brief designs the harness-level support that makes EA-class workflows a first-class capability: not building the EA itself, but ensuring the harness can host it.

See Insight-141 for the full pattern analysis and gap mapping.

## Non-Goals

- **Building a specific EA process.** This brief enables the pattern; specific EA skills/processes are downstream deliverables (process templates).
- **Building a clawchief clone.** Ditto is not OpenClaw. The patterns transfer; the implementation is native to Ditto's harness architecture.
- **Full integration implementation.** ADR-005 covers the integration architecture. This brief activates the minimum integration executor needed for the EA pattern (Gmail, Calendar, Sheets via existing GOG/gws CLI).
- **Mobile push notifications.** Important for EA use cases but a separate brief (mobile is already designed as seamless-not-primary in personas.md).
- **Voice capture.** Deferred to a future brief.
- **Multi-user/team EA patterns.** This brief is for single outcome-owner use cases (Rob, Lisa). Nadia's team pattern is a separate extension.

## Inputs

1. `docs/insights/141-proactive-operating-layer-pattern.md` — the pattern analysis and gap mapping that motivates this brief
2. `docs/architecture.md` — L1 process triggers (schedule), L2 heartbeat execution, L3 trust tiers, L4 awareness layer, ADR-005 integration architecture
3. `docs/adrs/016-conversational-self.md` — Self-scoped memory, user model, proactive attention
4. `docs/adrs/005-integration-architecture.md` — multi-protocol integration, credential management
5. `docs/insights/076-proactive-attention-management.md` — the five proactive dimensions (focus, attention, opportunities, coverage, upcoming)
6. `docs/insights/079-conversation-is-intake-process-is-the-product.md` — gathering → proposing → working through
7. `docs/insights/069-skills-packages-as-agent-capabilities.md` — skills as capability extensions
8. `docs/personas.md` — Rob (trades, mobile-first, quoting), Lisa (ecommerce, content, pricing), Jordan (generalist, cross-department), Nadia (team manager)
9. `snarktank/clawchief` — the source repo demonstrating the pattern in the wild

## Constraints

- MUST NOT require the user to write markdown files, cron jobs, or configuration. The harness must make these capabilities accessible through conversation with the Self.
- MUST NOT bypass trust tiers. Schedule-triggered processes go through the same harness pipeline as manually-triggered ones. A recurring process at supervised tier still pauses for human review every run.
- MUST NOT expose credentials to agents. Integration calls go through the credential vault (ADR-005).
- MUST preserve the "one process must be valuable" constraint. The proactive operating layer must work for a single process (e.g., just inbox triage), not require a portfolio.
- MUST use existing engine primitives where possible (heartbeat execution, process definitions, memory assembly, trust gate).
- MUST trace patterns to sources per Insight-068.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Skills as behavioral building blocks | OpenClaw skills (snarktank/clawchief `skills/`) | pattern | Proves the concept; Ditto's process definitions are the equivalent |
| Cron-driven recurring execution | clawchief `cron/jobs.template.json`, node-cron | depend (node-cron) / pattern (clawchief) | Standard cron scheduling; clawchief proves the application pattern |
| Heartbeat proactive checks | clawchief `HEARTBEAT.md`, Ditto Insight-076 | pattern | Combines clawchief's practical pattern with Ditto's five-dimension model |
| Canonical task list (shared artifact) | clawchief `tasks/current.md` | pattern | Proves bidirectional artifact concept |
| Durable context / personalization | clawchief `SOUL.md`, `USER.md`, `IDENTITY.md`; Ditto ADR-016 Self-scoped memory | pattern | clawchief proves personalization depth matters; Ditto's memory is the governed equivalent |
| Multi-protocol integration | ADR-005, Composio credential brokering, gws CLI | pattern / depend | ADR-005 is designed; gws CLI provides Gmail/Calendar/Sheets |
| Schedule trigger execution | Temporal schedules, Inngest cron triggers, GitHub Actions cron | pattern | Standard patterns for schedule-driven execution |
| Proactive attention routing | PagerDuty Event Intelligence, ADR-011 attention model | pattern | Noise reduction + attention form routing |

## What Changes (Work Products)

This is a **parent brief**. The work is split into sub-briefs along dependency seams. Each sub-brief is independently testable and shippable.

### Sub-Brief 076: Schedule Trigger Engine
| File | Action |
|------|--------|
| `src/engine/scheduler.ts` | Create: Cron-based scheduler that triggers process runs on schedule |
| `src/engine/process-loader.ts` | Modify: Parse `trigger: schedule` with cron expression from process definitions |
| `src/db/schema.ts` | Modify: Add `schedules` table (processId, cronExpression, enabled, lastRunAt, nextRunAt) |
| `src/cli/commands/schedule.ts` | Create: CLI commands to list/enable/disable scheduled processes |
| `processes/templates/recurring-check.yaml` | Create: Template process definition with schedule trigger |

### Sub-Brief 077: Proactive Monitor Definition & Attention Routing

**Naming note:** Architecture.md defines "heartbeat" as the agent execution model (wake/execute/sleep — L2). This sub-brief introduces "proactive monitor" as a distinct concept: a declaration of what the Self should check proactively. The proactive monitor *runs on* the heartbeat execution model but is not the same thing. Clawchief calls this "HEARTBEAT.md" but we disambiguate to avoid overloading the term.

| File | Action |
|------|--------|
| `src/engine/system-agents/proactive-monitor.ts` | Create: System agent that executes proactive checks per the monitor definition |
| `src/engine/proactive-monitor-definition.ts` | Create: Schema and loader for proactive monitor definitions (what to check, how often, attention routing) |
| `src/engine/harness-handlers/proactive-routing.ts` | Create: Routes monitor findings to the appropriate attention mode (alert, digest, item review) per ADR-011 |
| Self memory assembly | Modify: Include monitor findings in Self's context for proactive briefing |

**Feedback capture for unattended runs:** Scheduled processes that run while the user is away follow the existing attention model (ADR-011): supervised tier → queued for item review (appears in morning brief review queue); spot-checked tier → sampled items queued, rest digested; autonomous tier → digest only in Daily Brief. The proactive routing handler tags each output with its attention mode. The brief-synthesizer weaves overnight findings into the Today composition narrative.

### Sub-Brief 078: Integration Executor (MVP — Gmail, Calendar, Sheets)
| File | Action |
|------|--------|
| `src/engine/integration-executor.ts` | Create: Executor that resolves service + protocol from integration registry and executes |
| `src/engine/step-executor.ts` | Modify: Add `integration` executor type routing |
| `integrations/google-workspace.yaml` | Create: Integration registry entry for Google Workspace (CLI via gws) |
| `src/engine/harness-handlers/integration-auth.ts` | Create: Credential resolution for integration calls (vault-first, env-fallback per ADR-005) |

### Sub-Brief 079: Bidirectional Shared Artifacts
| File | Action |
|------|--------|
| `src/engine/artifacts.ts` | Create: Artifact read/write semantics with versioning and change attribution |
| `src/db/schema.ts` | Modify: Add `artifacts` table (processId, type, path, lastModifiedBy, version) |
| `src/engine/harness-handlers/artifact-sync.ts` | Create: Detects external changes to shared artifacts, reconciles with process state |

### Sub-Brief 080: Structured Personalization Capture
| File | Action |
|------|--------|
| `src/engine/system-agents/personalization-agent.ts` | Create: System agent that conducts structured personalization interviews |
| Self-scoped memory schema | Modify: Add structured personalization categories (business profile, communication preferences, channels, schedule, interruption tolerance) |
| `processes/templates/personalization-capture.yaml` | Create: Template process for initial and ongoing personalization |

## User Experience

- **Jobs affected:** Orient (proactive briefing with heartbeat findings), Define (set up recurring processes through conversation), Delegate (trust tiers apply to scheduled processes), Capture (personalization through structured interview)
- **Primitives involved:** Composition intents (Today — heartbeat findings woven into briefing), conversation (Self conducts personalization capture), process status blocks (scheduled process health)
- **Process-owner perspective:**
  - **Rob** says "Check my email every 15 minutes and tell me if anything urgent comes in." The Self proposes a recurring inbox-triage process with a 15-minute schedule trigger. Rob approves. The process runs supervised at first — Rob reviews what it flagged. After 2 weeks, it earns spot-checked trust. Rob's morning brief now includes overnight email triage results alongside his quoting queue.
  - **Lisa** says "Watch competitor prices daily." The Self sets up a daily scheduled process that checks 3 competitor sites. Findings appear in Lisa's morning brief as a digest. Only significant changes (>15% gap) escalate to item review.
  - **Jordan** says "Run the reference check process every time HR adds a new candidate." This is an event trigger (not schedule) and is **out of scope for this brief** — event/webhook triggers are a natural follow-on that shares the same harness pipeline but requires webhook listener infrastructure not designed here. Jordan's in-scope scenario is schedule-based: "Run the reconciliation check every Monday at 8am."
- **Interaction states:** Schedule creation via conversation (gathering → proposing → confirming), heartbeat findings in Today composition (digest or alert), scheduled process health in process status blocks
- **Designer input:** Not invoked — lightweight UX section. Recommend Designer review before sub-briefs move to builder.

## Acceptance Criteria (Parent Brief — Design Level)

1. [ ] Schedule triggers are a first-class trigger type in process definitions, with cron expression syntax
2. [ ] Scheduled processes go through the full harness pipeline (trust gate, review patterns, feedback capture)
3. [ ] A proactive monitor definition declares what to check proactively, with configurable frequency and attention routing (distinct from the heartbeat execution model — see sub-brief 077 naming note)
4. [ ] Proactive monitor findings are woven into the Self's proactive briefing (Today composition)
5. [ ] The integration executor resolves service + protocol from the integration registry and executes external calls
6. [ ] Integration calls are governed (credential vault, activity logging, trust-aware)
7. [ ] Bidirectional artifacts support both agent and human read/write with version tracking and change attribution
8. [ ] Structured personalization capture populates Self-scoped memory with business profile, preferences, channels, schedule
9. [ ] The Self can propose and set up recurring processes through conversation (no manual config files)
10. [ ] A single scheduled process delivers value without requiring other scheduled processes (one-process-must-be-valuable)
11. [ ] Rob can set up "check my email every 15 minutes" through conversation and receive proactive findings in his morning brief
12. [ ] Schedule enable/disable is available via CLI (and later via conversation)
13. [ ] All five clawchief primitives have governed Ditto equivalents (see Insight-141 mapping table — all gaps closed)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/insights/141-proactive-operating-layer-pattern.md`
2. Review agent checks: Does the design close every gap identified in Insight-141? Does it preserve all six architecture layers? Does each sub-brief have a clear dependency seam? Does it serve Rob/Lisa/Jordan personas? Is the schedule trigger design consistent with the existing heartbeat execution model?
3. Present work + review findings to human for approval

## Smoke Test (Parent Brief)

The parent brief is a design document — no code to test. Each sub-brief will have its own smoke test. The integration test across all sub-briefs:

```bash
# After all sub-briefs are implemented:
# 1. Define a process with schedule trigger
pnpm cli sync  # loads process with trigger: schedule, cron: "*/15 * * * *"

# 2. Verify scheduler picked it up
pnpm cli schedule list  # shows the process with next run time

# 3. Wait for trigger (or manually trigger)
pnpm cli start inbox-triage --trigger=scheduled

# 4. Verify it went through harness pipeline
pnpm cli status  # shows the run with trust gate, review if supervised

# 5. Check heartbeat findings in briefing
pnpm cli status --today  # morning brief includes heartbeat findings

# 6. Verify personalization was captured
pnpm cli memory list --scope=self  # shows structured personalization data
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — add Phase 11+ capabilities for proactive operating layer
3. Update `docs/architecture.md` — schedule triggers, heartbeat definition, bidirectional artifacts, integration executor
4. Update ADR-005 with integration executor implementation notes
5. Update ADR-016 with heartbeat definition as Self capability
6. Phase retrospective: was the clawchief pattern analysis accurate? What surprised us during implementation?
7. Consider: should "EA process template pack" be a follow-on brief?

## Sub-Brief Dependency Order

```
076 Schedule Trigger Engine ──────────┐
                                      ├──→ (all sub-briefs independently testable)
077 Proactive Monitor Definition ─────┤
         ↑ depends on 076             │
                                      │
078 Integration Executor (MVP) ───────┤
         (independent)                │
                                      │
079 Bidirectional Shared Artifacts ───┤
         (independent)                │
                                      │
080 Personalization Capture ──────────┘
         (independent)
```

**Build order recommendation:** 076 (schedule triggers) first — it's the foundation. 078 (integration executor) can run in parallel. 077 (proactive monitor) depends on 076. 079 and 080 are independent and can run in parallel with anything.

## Reviewer Feedback (Incorporated)

Review verdict: **APPROVE WITH NOTES**. Reviewer: Dev Reviewer (fresh context, 2026-04-02).

**Addressed:**
- P1-1 (heartbeat naming overload): Renamed "heartbeat definition" to "proactive monitor definition" throughout. Added naming note in sub-brief 077 explaining the distinction from the L2 heartbeat execution model.
- P2-1 (Jordan event trigger): Clarified event triggers are out of scope. Replaced Jordan's scenario with a schedule-based one.
- P2-2 (AC 11 conflates sub-briefs): Acknowledged — this is an integration-level AC appropriate for the parent brief. Sub-briefs will have narrower ACs.
- P2-3 (artifact storage model): Deferred to sub-brief 079 — the artifact can be either filesystem or database depending on the process definition's output type.
- P2-4 (feedback capture for unattended runs): Added explicit attention model routing for overnight/unattended scheduled runs in sub-brief 077 section.

**Reviewer questions answered:**
- Heartbeat naming: Resolved by renaming to "proactive monitor."
- Event triggers: Deferred — not in scope for this brief.
- Artifact storage: Deferred to sub-brief 079.
- Nadia: Out of scope for this brief. Her team-governance pattern is a follow-on extension.
