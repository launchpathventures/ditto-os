# Brief: Phase 10b — Self Extensions

**Date:** 2026-03-24
**Status:** draft
**Depends on:** Brief 039 (Web Foundation)
**Unlocks:** Brief 043 (Proactive Engine)

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard
- **Capabilities:** Full conversational operating surface — work creation, process definition, trust changes, quick capture, inline data rendering, confirmation model

## Context

Brief 039 delivers the Self streaming to the browser with its existing 5 tools. This brief extends the Self to be the full operating surface: creating work, defining processes, adjusting trust, capturing context, and presenting decision-supporting data inline — all through conversation.

## Objective

The Self can handle every primary user action through conversation: create work items, define new processes, approve/edit/reject outputs, adjust trust levels, capture quick notes, and present data inline for decisions. The confirmation model prevents irreversible actions from firing on ambiguous input.

## Non-Goals

- Proactive briefing assembly (Brief 043)
- Risk detection engine (Brief 043)
- Feed / workspace UI (Brief 041)
- Voice input (future phase)
- "Teach this" Learning engine (Phase 8 — we capture feedback data but don't automate pattern extraction)

## Inputs

1. `docs/briefs/038-phase-10-mvp-architecture.md` — Self Extensions section (incl. integration auth)
2. `docs/research/phase-10-mvp-dashboard-ux.md` — sections 2.2-2.6, 7.1.1
3. `docs/research/integration-auth-reality.md` — auth types analysis, API key MVP path, masked input requirement
4. `src/engine/self.ts` + `self-delegation.ts` — existing Self
5. `src/engine/review-actions.ts` — existing approve/edit/reject
6. `src/engine/credential-vault.ts` — existing vault (Brief 035)
7. `docs/adrs/016-conversational-self.md` — Self as outermost harness

## Constraints

- MUST add tools via the existing Self tool_use mechanism (not a new dispatch system)
- MUST implement confirmation model for irreversible actions (UX spec 7.1.1)
- MUST NOT auto-execute irreversible actions without explicit user confirmation
- MUST capture user model data from onboarding conversation as structured self-scoped memory
- MUST render inline data (tables, progress bars, knowledge synthesis cards, work item cards) as structured content blocks the frontend can render — not as ASCII art. These are the conversation component catalog (ADR-009 v2 pattern, `docs/research/self-meta-processes-ux.md`)
- MUST NOT bypass trust gates — `adjust_trust` only proposes changes through existing trust-diff.ts

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Self tool_use pattern | ADR-016, existing `self-delegation.ts` | extend | Proven mechanism, 5 tools already working |
| Work item creation | Existing `workItems` table + intake-classifier | extend | Route through existing system agents |
| Process generation | Existing `process-loader.ts` + YAML | extend | Self writes YAML, loader validates |
| Inline data rendering | Vercel AI SDK tool result rendering | pattern | Tool results can include structured data components |
| Confirmation pattern | UX spec 7.1.1 | original | Self restates action, awaits confirmation |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/self-delegation.ts` | Modify: add 6 new tool definitions (briefing/risks/suggestions deferred to Brief 043) |
| `src/engine/self-tools/create-work-item.ts` | Create: work item creation tool |
| `src/engine/self-tools/generate-process.ts` | Create: conversational process definition tool |
| `src/engine/self-tools/quick-capture.ts` | Create: capture + classify tool |
| `src/engine/self-tools/adjust-trust.ts` | Create: trust level change tool (goes through trust-diff) |
| `src/engine/self-tools/get-process-detail.ts` | Create: process detail retrieval tool |
| `src/engine/self-tools/connect-service.ts` | Create: conversational integration auth — guides user, presents masked input, stores to credential vault, verifies connection |
| `src/engine/self.ts` | Modify: confirmation model — Self recognizes irreversible tool calls and confirms before executing |
| `src/engine/user-model.ts` | Create: structured user model read/write from self-scoped memory |
| `src/engine/integration-registry.ts` | Modify: add `connection` metadata (auth_type, provider_name, setup_url, setup_instructions) to registry schema |
| `packages/web/components/self/inline-data.tsx` | Create: components for rendering inline tables, progress bars, trend indicators in conversation |
| `packages/web/components/self/masked-input.tsx` | Create: masked credential input field — value never written to conversation history or activity logs |
| `packages/web/app/api/chat/route.ts` | Modify: handle structured content blocks from Self tool results |
| `packages/web/app/api/credential/route.ts` | Create: Route Handler for masked credential submission (goes directly to vault, bypasses conversation log) |

## User Experience

- **Jobs affected:** Define (work creation, process definition), Delegate (trust adjustment), Capture (quick notes), Review (approve/edit/reject via conversation), Decide (inline data for decisions)
- **Primitives involved:** Conversation Thread, Quick Capture, Trust Control, Feedback Widget (conversational)
- **Process-owner perspective:** Rob says "I need to sort out invoicing" → Self asks questions → process exists in 15 minutes. Rob says "bump the labour and send" → Self confirms → quote sent. Rob voice-captures "Henderson also wants HW" → captured and routed.
- **Interaction states:**
  - *Confirmation pending:* Self states action, awaits "yes"/"go ahead"
  - *Process being defined:* Self asks questions one at a time, no dual-pane builder
  - *Tool executing:* "Working on it..." indicator
  - *Tool failed:* Self explains what went wrong and suggests alternatives
- **Designer input:** UX spec sections 2.2-2.6, 7.1.1 (confirmation model)

## Acceptance Criteria

1. [ ] `create_work_item` tool: Self creates work item from natural language, routes through intake-classifier
2. [ ] `generate_process` tool: Self defines a process YAML from conversation, validates via process-loader, saves to DB
3. [ ] `quick_capture` tool: stores raw text as a capture work item, auto-classifies via intake-classifier
4. [ ] `adjust_trust` tool: proposes trust change through `trust-diff.ts`, returns evidence data, applies only after user confirms
5. [ ] `get_process_detail` tool: returns process steps, trust data, recent runs, correction rates
6. [ ] Confirmation model: Self identifies irreversible actions (send external, trust change, archive) and confirms with user before executing
7. [ ] User model: structured data across 9 dimensions (problems, vision, work, challenges, concerns, frustrations, goals, tasks, communication preferences) stored as self-scoped memory. Populated progressively — most important first (problems, tasks for immediate value), deepened across sessions (vision, goals for strategic guidance). (Insight-093)
8. [ ] Inline data rendering: conversation UI renders tables (≤5 rows), progress indicators, and trend arrows from Self tool results
9. [ ] Self's onboarding flow: multi-session deep intake process (not a single form-like conversation). First session captures enough for first process + immediate value. Subsequent sessions deepen understanding. Self drives — asks open questions, picks up signals, suggests where to start. (Insight-093)
10. [ ] AI coaching moments: Self naturally teaches users to be better collaborators — "when you tell me *why* you changed that, I learn faster", "you've taught me 4 things this week — here's what I know now". Woven into corrections and reviews, not as a separate mode. (Insight-093)
11. [ ] `connect_service` tool: Self detects need, guides API key setup, presents masked input, stores to vault, verifies with test call
12. [ ] Masked credential input: API keys entered via secure field, never written to conversation history, activity logs, or stepRuns
13. [ ] Integration registry extended with `connection` metadata (auth_type, provider_name, setup_url, setup_instructions)
14. [ ] All new tools execute server-side — no engine functions callable from browser
15. [ ] Existing 5 Self tools continue working unchanged

## Review Process

1. Spawn review agent with architecture.md + review-checklist.md + this brief + UX spec
2. Review checks: confirmation model covers all irreversible actions, trust changes go through trust-diff, process generation validates YAML, no engine exposure to browser
3. Present + review to human

## Smoke Test

```bash
# 1. Open app, new user
# Expected: Self greets and starts onboarding conversation

# 2. Answer Self's questions: "I run a plumbing company, 12 staff, quoting takes too long"
# Expected: User model populated, Self suggests starting with quoting

# 3. Describe quoting process through conversation
# Expected: Self generates process YAML, validates, saves. "Your quoting is set up."

# 4. Say: "Henderson wants a bathroom reno quote, here are the details..."
# Expected: Self creates work item, routes to quoting process

# 5. When quote is ready, Self presents it. Say: "bump labour to 22 hours and send"
# Expected: Self confirms: "Sending Henderson quote for $15,140 — go ahead?"
# Say: "yes" → Self confirms sent

# 6. Say: "remember that copper prices went up 20%"
# Expected: Self captures as quick note, acknowledges

# 7. Check conversation for inline data
# Expected: Trust data, process detail shown as rendered tables/indicators, not ASCII
```

## After Completion

1. Update `docs/state.md` — Self extensions shipped
2. Brief 043 is unblocked
3. Update ADR-016 with new tool list and confirmation model
