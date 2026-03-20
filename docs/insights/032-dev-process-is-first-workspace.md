# Insight-032: The Dev Process Is the First Workspace Dogfood

**Date:** 2026-03-20
**Trigger:** PM session — human observed they are manually being the orchestrator meta-process, invoking dev roles one at a time in Claude Code. This is exactly the problem Agent OS solves for Rob, Lisa, Jordan, and Nadia.
**Layers affected:** L2 Agent, L3 Harness, L6 Human
**Status:** active

## The Insight

The person building Agent OS is currently the orchestrator. They manually invoke `/dev-pm`, then `/dev-researcher`, then `/dev-architect`, then `/dev-builder`, then `/dev-reviewer`, then `/dev-documenter` — sitting in Claude Code chats, copying context between sessions, deciding what to invoke next. This is operationally identical to Rob sitting at his kitchen table manually writing quotes, or Lisa rewriting product descriptions by hand.

The dev pipeline is already defined as process definitions (YAML in `processes/`), the role contracts exist (`.claude/commands/dev-*.md`), the handoff rules are documented (`docs/dev-process.md`), and the review gates are established (review checklist, trust gates). Everything needed for automation exists — except the automation itself.

Building a lightweight orchestrator for the dev process before Phase 4 serves three purposes:
1. **Removes the human as bottleneck** — they become a reviewer at gates, not the orchestrator
2. **Proves the workspace interaction model** (ADR-010) on a real process before building it into the engine
3. **Generates lived experience** that informs the Phase 4 design — decisions about suspend/resume, mobile review, session context, and attention modes come from using them, not just designing them

## Implications

- Pre-Phase 4 should include a dev pipeline orchestrator as a stepping stone (same pattern as Pre-Phase 3: Input Resolution)
- The orchestrator uses `claude -p` (headless CLI) to chain roles — same subscription, no API token cost
- A mobile review surface (Telegram bot) enables the human to be away from the desk while the pipeline runs — proving the mobile review patterns from the mobile UX research
- This IS Phase 5's verification target applied early: "a single work item enters → gets classified → routed → executed → human completes → resumes → reviewed → trust updated"
- Debt-005 (dev memory not dogfooding) begins to resolve — the dev process starts running through governed, structured orchestration

## Where It Should Land

- Brief 015 (Pre-Phase 4 dev pipeline orchestrator — the brief this insight accompanies)
- `docs/dev-process.md` — update to reference the orchestrator as the primary invocation method
- Phase 4 design — learnings from running the orchestrator inform the engine's workspace model
