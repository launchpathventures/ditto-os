# Brief: Pre-Phase 4 — Dev Pipeline Orchestrator + Mobile Review

**Date:** 2026-03-20
**Status:** complete
**Depends on:** Pre-Phase 3 (Input Resolution — Brief 010) complete
**Unlocks:** Phase 4 (Workspace Foundation) — informed by lived experience running the orchestrator

## Goal

- **Roadmap phase:** Pre-Phase 4 (stepping stone, same pattern as Pre-Phase 3)
- **Capabilities:** Automate the dev pipeline (PM → Researcher → Designer → Architect → Builder → Reviewer → Documenter) with mobile review gates. Proves ADR-010's workspace interaction model on the dev process before building it into the engine.

## Context

The person building Agent OS is currently the orchestrator meta-process. They manually invoke `/dev-pm`, then `/dev-researcher`, then `/dev-architect`, etc. — sitting in Claude Code, copying context between sessions, deciding what to invoke next. This is operationally identical to the problem Agent OS solves for its personas (Rob manually writing quotes, Lisa manually rewriting product descriptions).

The dev pipeline is already fully defined: role contracts in `.claude/commands/dev-*.md`, process definitions in `processes/feature-implementation.yaml`, handoff rules in `docs/dev-process.md`, review gates in `docs/review-checklist.md`. Everything needed for automation exists — except the automation.

Pre-Phase 3 (Brief 010) set the precedent: a small, focused task that unblocks meaningful work in the next phase. This brief follows the same pattern — a practical stepping stone that also generates lived experience to inform Phase 4's design.

See Insight-032 for the full rationale.

## Objective

The human says `pnpm dev-pipeline "Build Phase 4"` or sends `/start Build Phase 4` via Telegram. The orchestrator runs the dev pipeline through each role, pausing at review gates. The human reviews and provides feedback from their phone via Telegram. The pipeline resumes. The human goes from "manual orchestrator" to "reviewer at gates."

## Non-Goals

- **Not a general-purpose orchestrator.** This is specifically for the Agent OS dev pipeline. Phase 4 builds the general workspace model.
- **Not replacing the engine.** The engine's heartbeat/harness/adapter layer is untouched. This is parallel infrastructure using `claude -p`.
- **Not implementing trust earning for dev roles.** All gates are supervised (human reviews everything). Trust progression is a Phase 4 concept.
- **Not building a web dashboard.** Telegram is the mobile surface. The web dashboard is Phase 10.
- **Not implementing the full conversation layer.** Commands are discrete (`/start`, `/status`, `/approve`), not conversational threads.
- **Not implementing pattern detection / "Teach this".** Feedback is captured but not analysed for patterns. That's Phase 8.
- **Not implementing quiet hours / morning digest.** The UX section illustrates the concept, but batching overnight results is deferred. All notifications are real-time in the first build.

## Inputs

1. `.claude/commands/dev-*.md` — role contracts (system prompts for each dev role)
2. `docs/dev-process.md` — handoff rules, invocation modes, pipeline flow
3. `docs/review-checklist.md` — what the reviewer checks
4. `docs/research/phase-4-composition-sweep.md` — composition patterns (especially Capability 3: Human Step Suspend/Resume)
5. `docs/research/phase-4-workspace-cli-ux.md` — CLI UX principles (silence is happy path, verbs not nouns, consistent item format)
6. `docs/adrs/010-workspace-interaction-model.md` — workspace model this proves
7. `docs/adrs/011-attention-model.md` — attention model principles (silence as feature, confidence-based routing)
8. `docs/insights/032-dev-process-is-first-workspace.md` — rationale for this work

## Constraints

- **Must use `claude -p` (headless CLI), not the Anthropic API SDK.** The human has a Claude subscription — `claude -p` runs through it. No API token cost.
- **Must not modify existing engine code.** This is parallel infrastructure. `src/engine/`, `src/adapters/`, `src/db/`, `src/cli.ts` are untouched.
- **Must authenticate Telegram interactions.** Only the configured chat ID can approve/reject/send commands. No public access.
- **Must not expose secrets in suspend payloads.** Telegram messages must not contain API keys, tokens, or sensitive file contents.
- **Must checkpoint state to files, not memory.** A fresh `claude -p` session starts with a context-loading preamble from files, not conversation history. Sessions are stateless; files are durable.
- **Must work without Telegram.** The orchestrator script must be usable standalone from the terminal (with terminal-based review gates) if Telegram is not configured. Telegram is an enhancement, not a requirement.
- **Role definitions stay in `.claude/commands/`.** The orchestrator reads them; it does not duplicate them.
- **Error recovery via checkpoint.** If `claude -p` fails mid-execution (timeout, crash, rate limit), the pipeline pauses at the current step, logs the error, and notifies the human. The session file reflects the failure. `--resume` retries the failed role.
- **Telegram uses long-polling, not webhooks.** Avoids HTTPS/TLS infrastructure requirements. The `grammy` framework supports both; long-polling is the simpler default for single-user dogfood.
- **Telegram message content policy.** File paths and code snippets in messages are acceptable. Credentials, tokens, `.env` contents, and raw API keys must never appear in Telegram messages. The bot token itself must be treated as a secret equivalent to an API key.

## Relationship to Phase 4

This infrastructure is a **bridge, not a permanent fixture.** When Phase 4's engine can run the dev pipeline as a process (work items, meta-processes, human step suspend/resume), this orchestrator is expected to be retired. Lessons learned during its use directly inform the engine's design.

Specifically:
- Session context management patterns → inform Phase 4's heartbeat context assembly
- Review gate UX (what the human needs to see at a gate) → informs human step executor design
- Mobile review feedback patterns → informs Telegram/messaging integration in Phase 6
- `claude -p` limitations discovered → inform adapter design for future CLI-as-adapter pattern

The retrospective (After Completion, step 3) is where these lessons are captured.

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| `claude -p` headless mode | Claude Code CLI | Same subscription, no API cost, same tools and permissions as interactive mode |
| Orchestrator-worker pattern | Anthropic multi-agent research (cited in ADR-010) | Lead orchestrator decomposes, worker subagents execute, results synthesised |
| Suspend/resume at review gates | Mastra snapshot pattern (composition sweep, Capability 3) | Serialize execution state, skip completed steps on resume |
| Session context management | Original | Proactive nudge to start fresh session when context is heavy — no existing tool does this |
| Pinned status message | Telegram Bot API `pinChatMessage` | Always-visible cold-start context — user opens chat and sees current state immediately |
| Inline keyboards for review | Telegram Bot API `InlineKeyboardMarkup` | One-tap approve/reject/feedback without typing |
| Phase transition banners | Original (informed by CLI UX spec's interaction states) | Clear visual breaks between pipeline stages in chat history |
| Morning digest / quiet hours | ADR-011 attention model (silence as feature) | Batch overnight results into single morning message instead of 3am pings (deferred — see Non-Goals) |
| `claude -p` subprocess orchestration | Original | No existing tool chains headless Claude CLI in a role-constrained pipeline loop. CLI-as-subprocess is standard; the specific pattern of chaining role-constrained `claude -p` calls with file-based context passing is novel |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/dev-pipeline.ts` | Create: Orchestrator script — reads role defs, chains `claude -p`, manages gates and context |
| `src/dev-bot.ts` | Create: Telegram bot — review notifications, inline keyboards, commands, pinned status |
| `src/dev-session.ts` | Create: Session state management — pipeline state, checkpoints, context tracking (shared between pipeline and bot) |
| `package.json` | Modify: Add `grammy` (Telegram bot framework), add `dev-pipeline` and `dev-bot` scripts |
| `.env.example` | Modify: Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` |
| `docs/dev-process.md` | Modify: Reference orchestrator as primary invocation method alongside manual skill invocation |

## User Experience

- **Jobs affected:** Orient (status via pinned message), Review (approve/reject/feedback at gates), Capture (kick off work via `/start`), Decide (feedback that shapes next role's output)
- **Primitives involved:** Daily Brief (pinned status message), Review Queue (Telegram review items), Quick Capture (`/start` command), Feedback Widget (text replies at gates)
- **Process-owner perspective:** The human goes from sitting in Claude Code invoking skills to checking Telegram between other activities. They review outputs, provide feedback, and kick off work — from their phone, their desk, or their truck. The pipeline runs while they're away.
- **Interaction states:** See detailed states below
- **Designer input:** Not invoked — this is dev tooling, not user-facing product. UX principles from `docs/research/phase-4-workspace-cli-ux.md` applied (silence is happy path, consistent item format, never leak implementation).

### Telegram Interaction States

**Pinned status message (always visible, edited in-place):**
```
📌 Agent OS Dev Pipeline
━━━━━━━━━━━━━━━━━━━━━━
Phase: Phase 4a (Architect → writing brief)
Status: ⏳ Running
Pending review: 0
Today: 1 gate approved, 0 feedback rounds

Last action: you approved PM recommendation (35m ago)
```

**Review gate notification:**
```
━━━ ✓ PM COMPLETE ━━━━━━━━━━━━━━
Recommendation: Build Phase 4 brief
Sub-phasing: 4 sub-phases (4a-4d)
Key decision: include Teach-this? → deferred
Duration: 4 min
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Architect is next. The PM recommends:
- Write parent brief + 4 sub-briefs
- Address Designer's 2 open questions
- Include composition sweep patterns

[Approve ✓] [Reject ✗] [Feedback 💬] [Desk 🖥]
```

**Feedback flow:**
```
User taps [Feedback 💬]

Bot: "What feedback should the Architect receive?"

User: "Separate human steps into its own sub-phase,
       it's the riskiest piece"

Bot: "✓ Feedback captured. Injecting into Architect
     context. Starting Architect with your guidance."
```

**Kick off work:**
```
User: /start Build Phase 4

Bot: "Starting dev pipeline for: Build Phase 4
     First role: PM (reading state.md, roadmap.md)
     Will notify when PM has a recommendation."
```

**Status query:**
```
User: /status

Bot: "📌 Phase 4 Pipeline
     ━━━━━━━━━━━━━━━━━━
     ✓ PM — complete (approved)
     ✓ Researcher — complete (approved)
     ⏳ Architect — running (12 min)
     ○ Builder — waiting
     ○ Reviewer — waiting
     ○ Documenter — waiting"
```

**Session context nudge:**
```
Bot: "⚠️ Session context at ~75% for current
     Architect run. Recommend fresh session
     after this review gate.

     State checkpoint saved. New session will
     pick up from: Architect, writing sub-brief 4c.

     [Continue anyway] [Fresh session]"
```

**Morning digest (quiet hours batch):**
```
Bot: "☀️ Morning — overnight activity:

     Builder completed Phase 4a (12/12 AC pass).
     Reviewer found 2 issues (both minor).
     Phase 4a ready for your final approval.

     [Review now] [Later]"
```

### Terminal Interaction States (no Telegram)

When `TELEGRAM_BOT_TOKEN` is not set, the orchestrator runs in terminal mode:

```
$ pnpm dev-pipeline "Build Phase 4"

Starting dev pipeline: Build Phase 4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Running PM...

━━━ ✓ PM COMPLETE ━━━━━━━━━━━━━━━━━
Recommendation: Build Phase 4 brief
Duration: 4 min
Output: docs/state.md updated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[a]pprove  [r]eject  [f]eedback  [q]uit
> f
Feedback: Separate human steps into its own sub-phase
✓ Feedback captured. Starting Architect...
```

## Acceptance Criteria

### Orchestrator (`src/dev-pipeline.ts`)

1. [ ] `pnpm dev-pipeline "<task description>"` starts the dev pipeline with PM as the first role
2. [ ] Each role executes via `claude -p` with its role contract loaded from `.claude/commands/dev-*.md` and a context preamble that includes: task description, accumulated outputs from prior roles (as file references), and any human feedback from the previous gate
3. [ ] Pipeline pauses at review gates between roles and waits for human input (approve, reject, or feedback)
4. [ ] When feedback is provided at a gate, the feedback text is injected into the next role's context preamble alongside the prior role's output
5. [ ] Pipeline state is checkpointed to a session file (`data/dev-session.json`) before every review gate — includes: current role, completed roles, task description, file references to each role's output, accumulated feedback
6. [ ] `pnpm dev-pipeline --resume` continues a paused pipeline from the last checkpoint
7. [ ] Pipeline tracks cumulative `claude -p` output size and warns at ~75% of practical context limits, recommending a fresh session at the next gate
8. [ ] Pipeline works in terminal-only mode (no Telegram) with interactive approve/reject/feedback prompts when `TELEGRAM_BOT_TOKEN` is not configured

### Telegram Bot (`src/dev-bot.ts`)

9. [ ] Bot authenticates by chat ID — only the configured `TELEGRAM_CHAT_ID` can interact. Messages from other chats are ignored.
10. [ ] At each review gate, bot sends a message with inline keyboard buttons: Approve, Reject, Feedback, Desk (defer to desktop)
11. [ ] "Feedback" button prompts the user for text input, captures it, and injects it into the pipeline's next role context
12. [ ] `/start <description>` command creates a new pipeline run and starts the PM role
13. [ ] `/status` command returns current pipeline state (which role is running, which are complete, what's pending)
14. [ ] Bot maintains a pinned status message that is edited in-place after every state change (role transitions, gate outcomes, pipeline start/complete)
15. [ ] Phase transition banners provide clear visual breaks in chat history between pipeline stages (role name, duration, key output summary)

### Session Management (`src/dev-session.ts`)

16. [ ] Session state is serialized to `data/dev-session.json` — survives process restarts
17. [ ] Each role's output is saved to a timestamped file in `data/sessions/<session-id>/` for context passing between roles
18. [ ] If a `claude -p` role execution fails (non-zero exit, timeout), the pipeline pauses, logs the error, and notifies the human (terminal or Telegram) with the option to retry or skip the role

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Does this brief serve the workspace interaction model (ADR-010) without duplicating or conflicting with Phase 4's engine work?
   - Are the `claude -p` constraints sound? (subscription billing, tool access, session isolation)
   - Is the Telegram security model sufficient? (chat ID authentication)
   - Does the brief respect the "composition over invention" principle? (using existing role definitions, not reinventing them)
   - Is the brief sized correctly? (17 AC — at the upper boundary of the 8-17 heuristic)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Terminal mode (no Telegram)
# 1. Start a pipeline
pnpm dev-pipeline "Write a brief for a hello-world process"

# Expected: PM role runs via claude -p, produces recommendation
# Expected: Terminal shows review gate with [a]pprove [r]eject [f]eedback

# 2. Provide feedback
> f
> Keep it simple, just 3 acceptance criteria

# Expected: Feedback captured, Architect starts with feedback in context

# 3. Approve the architect output
> a

# Expected: Builder starts, produces a brief file

# 4. Resume a paused pipeline
# (Ctrl+C during a role execution, then:)
pnpm dev-pipeline --resume

# Expected: Resumes from the last checkpoint, not from the beginning

# Telegram mode (with TELEGRAM_BOT_TOKEN set)
# 5. Send /start Hello world process via Telegram
# Expected: Bot acknowledges, PM starts, pinned message updates
# 6. Receive review gate notification with inline buttons
# Expected: Approve/Reject/Feedback/Desk buttons visible
# 7. Tap Approve
# Expected: Next role starts, pinned message updates, phase transition banner sent

# Error recovery
# 8. Kill claude -p during a role execution (Ctrl+C or send SIGTERM)
# Then: pnpm dev-pipeline --resume
# Expected: Pipeline resumes from the last checkpoint, retries the failed role
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/dev-process.md` to reference the orchestrator
3. Retrospective: what worked about the orchestrator, what surprised us, what to carry into Phase 4's engine design
4. Capture any design discoveries as insights (especially around session context management, review gate UX, and mobile feedback patterns)
