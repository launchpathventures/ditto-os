# Insight-018: Skills Have Two Invocation Modes

**Date:** 2026-03-19
**Trigger:** Dev Researcher session — process discovery research was strategic/exploratory, but the skill's hardcoded handoff assumed it was brief-directed
**Layers affected:** L6 Human (dev process)
**Status:** absorbed into `docs/dev-process.md` (Invocation Modes section + Pattern E) and `.claude/commands/dev-*.md` (conditional handoffs)

## The Insight

Every dev role skill (PM, Researcher, Architect, Designer, Builder, Reviewer, Documenter) can be invoked in two distinct modes:

1. **In-flow** — part of the Research → Design → Build → Review pipeline. The skill is invoked after the previous role and hands off to the next role. Handoffs are predictable: Researcher → Architect → Builder → Reviewer.

2. **Standalone** — invoked independently for the role's specific capability, outside the main pipeline. Examples:
   - Researcher exploring a strategic question that informs the roadmap/architecture (not a brief)
   - Architect evaluating research against the architecture and proposing amendments (not designing a solution for a brief)
   - PM triaging priorities without initiating a build flow
   - Designer exploring UX concepts that feed back into personas/human-layer docs
   - Reviewer auditing existing work for architecture drift
   - Documenter running a standalone state audit

Currently, all skills assume in-flow invocation and end with a hardcoded handoff ("Next step: invoke /dev-architect"). This is wrong for standalone invocations — it pressures the user toward a brief when the work's purpose is strategic absorption (updating roadmap, amending architecture, capturing insights).

## Implications

- **All seven skill commands** need to handle both modes. The fix should be lightweight — no upfront mode flag. The skill does its work, then presents appropriate next steps based on what was produced rather than assuming the linear handoff.
- **State updates still happen in both modes** — what was produced and where it lives. The difference is in the "next step" guidance.
- **The Documenter role** is relevant in both modes — if state changed, the Documenter should still run.
- **This is the same pattern Agent OS itself handles** — processes have variations, and the harness adapts. We're hitting it in our own dev process.

## Where It Should Land

`docs/dev-process.md` — should document the two invocation modes and how handoffs work in each. All seven skill commands in `.claude/commands/dev-*.md` should be updated to handle both modes. The Architect should design the specific changes.
