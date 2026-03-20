# Phase 5 Orchestrator UX — Interaction Spec

**Date:** 2026-03-21
**Status:** Active
**Consumers:** Phase 5 brief (Architect), ADR-010 (orchestrator agent)
**Surface:** CLI (Phase 4). Web dashboard concepts noted for Phase 10 continuity.

---

## 1. Goal Setting — "What do you want to achieve?"

**Human jobs served:** Define, Delegate
**Primitives:** Conversation Thread, Process Builder, Quick Capture

### The Process Owner's Experience

The user has something they want done. It might be simple ("reconcile this month's invoices") or complex ("build out the next phase of our system"). The orchestrator needs to understand the goal and agree on scope before work begins.

**Current state:** `aos capture` classifies and routes a work item. There is no goal-scoping conversation — the work item goes directly to a process.

**What's missing:** For goals (vs tasks), the orchestrator should negotiate scope before decomposing. A task is "do this thing." A goal is "achieve this outcome" — the path isn't known yet.

### Interaction Pattern: Goal Negotiation

The user enters a goal. The orchestrator responds with a proposed scope — what it understands the goal to be, what it plans to do, what it won't do, and what it needs from the human.

**CLI flow:**
```
$ aos capture "Build out Phase 5 of the roadmap"

  Classifying... goal (high confidence)
  Routing to: orchestrator

  ┌─────────────────────────────────────────────┐
  │  GOAL: Build out Phase 5                     │
  │                                              │
  │  I understand this as:                       │
  │  Verify the full work evolution cycle and    │
  │  build the goal-directed orchestrator.       │
  │                                              │
  │  PROPOSED SCOPE                              │
  │  ✓ Orchestrator goal decomposition           │
  │  ✓ End-to-end cycle verification             │
  │  ✓ 2-3 non-coding process templates          │
  │  ○ Cognitive model fields (deferred — Phase 8)│
  │  ○ Digest mode (deferred — needs more data)  │
  │                                              │
  │  ESTIMATED WORK                              │
  │  4-6 tasks across dev-pipeline process       │
  │                                              │
  │  NEEDS FROM YOU                              │
  │  • Confirm scope                             │
  │  • Review architectural decisions             │
  │                                              │
  │  [Approve scope]  [Adjust]  [Cancel]         │
  └─────────────────────────────────────────────┘
```

**Key UX decisions:**
- The orchestrator proposes, the human confirms. Never start work without agreement.
- Excluded items are visible with reasons — "deferred" is not hidden, it's explained.
- "Needs from you" sets expectations upfront about human involvement. Rob knows he'll need to review quotes; Lisa knows she'll approve content; the orchestrator tells the user what role they'll play.
- The scope is editable — the user can add, remove, or adjust items before work begins.

**Scope boundary:** Goal negotiation only triggers for work items classified as `goal` or `outcome`. Tasks and questions bypass negotiation and route directly to processes — no scope proposal, no confirmation step.

**Persona test:**
- **Rob:** "Reconcile this month's invoices" → classified as task, routes directly. No negotiation friction. "Set up quoting for bathroom renos" → classified as goal, orchestrator proposes scope.
- **Lisa:** "I want all product descriptions to match our brand voice" → goal. Orchestrator proposes: audit existing descriptions, define brand rules, retrain content process. Lisa adjusts — she only wants new products, not a retroactive audit.
- **Jordan:** "Automate the HR reference checking process" → orchestrator proposes: define process, set up integrations, run first batch supervised. Jordan adjusts scope based on what leadership approved.
- **Nadia:** "Get my team's report formatting process to autonomous" → orchestrator proposes: review correction patterns, address top 3 recurring issues, run 10 more supervised cycles. Nadia sees the path to autonomy.

### Interaction States

| State | What the user sees | What happens |
|-------|-------------------|--------------|
| Classifying | "Classifying..." spinner | Intake-classifier runs |
| Goal detected | Scope proposal card | Orchestrator analyses and proposes |
| Scope confirmed | "Starting work on: [goal]" | Orchestrator decomposes and begins |
| Scope rejected | Back to capture prompt | User can rephrase or cancel |
| Classification uncertain | "I'm not sure what kind of work this is — [options]" | Fallback to interactive selection |

---

## 2. Decomposition Visibility — "What's the plan?"

**Human jobs served:** Orient, Delegate
**Primitives:** Process Graph (simplified for CLI), Activity Feed

### The Process Owner's Experience

After confirming scope, the orchestrator decomposes the goal into tasks. The user needs to see the plan — not because they'll manage it, but because they need to trust the decomposition is reasonable and they understand what's coming.

### Interaction Pattern: Goal Tree

**CLI flow (after scope confirmed):**
```
$ aos status

  GOAL: Build out Phase 5                    in progress
  ├── Research orchestrator patterns          ✓ complete
  ├── Design orchestrator UX                  ● running
  ├── Write Phase 5 brief                     ○ waiting (depends on research + design)
  ├── Build orchestrator                      ○ waiting (depends on brief)
  │   ├── Goal decomposition engine           ○ not started
  │   ├── Work-queue scheduler                ○ not started
  │   └── Confidence-based stopping           ○ not started
  ├── Review                                  ○ waiting (depends on build)
  └── Verify end-to-end cycle                 ○ waiting (depends on build)

  Progress: 1/7 tasks complete
  Next: Design completing → Brief starts
  Blocked: nothing
  Your attention needed: nothing right now
```

**Key UX decisions:**
- Tree structure mirrors how the user thinks about work decomposition — goals contain tasks, tasks may contain subtasks.
- Status uses three markers: ✓ complete, ● running, ○ waiting. Minimal. No colour needed in CLI.
- Dependencies are implicit in ordering and explicit in "waiting (depends on X)."
- "Your attention needed" is the single most important line — it tells the user whether they need to act now or can check back later.
- The decomposition can change as work progresses — the orchestrator replans. When it does, the tree updates and the user sees what changed in the Activity Feed.

**Persona test:**
- **Rob:** For a simple quoting goal, the tree has 2-3 items. Glanceable on phone.
- **Lisa:** Brand voice rollout shows 5 items: audit → define rules → update process → supervised run → verify. Lisa checks progress on her commute — "3/5 complete, brand rules awaiting my review."
- **Jordan:** For a multi-department automation rollout, the tree has 10-15 items across departments. Jordan screenshots this for the leadership meeting.
- **Nadia:** Sees her team's goals as separate trees. Each analyst's process improvement has its own tree.

### When Decomposition Changes

The orchestrator may replan after learning from completed tasks. When this happens:

```
  Activity Feed:
  2 min ago — Orchestrator updated plan
    Added: "Fix schema migration" (discovered during build)
    Reason: Builder found schema needs updating before
    orchestrator can track goal decomposition.
    [View updated plan]
```

The user sees what changed and why. No silent replanning.

---

## 3. Progress and Routing — "What's happening now?"

**Human jobs served:** Orient, Review
**Primitives:** Activity Feed, Process Card, Review Queue

### The Process Owner's Experience

Work is in progress. Some tasks are running, some are blocked at trust gates, some the orchestrator routed around. The user needs to see the current state without being overwhelmed.

### Interaction Pattern: Status with Trust Gate Awareness

**CLI flow:**
```
$ aos status

  GOAL: Build out Phase 5                    in progress
  ├── Research orchestrator patterns          ✓ complete
  ├── Design orchestrator UX                  ✓ complete
  ├── Write Phase 5 brief                     ⏸ awaiting review
  │   └── Trust gate: supervised — needs your approval
  ├── Build orchestrator                      ○ waiting (depends on brief)
  ├── Process template: invoice reconciliation ● running
  │   └── Routed around blocked brief — independent work
  ├── Process template: content review         ● running
  │   └── Routed around blocked brief — independent work
  └── Verify end-to-end cycle                 ○ waiting

  Progress: 2/7 complete, 2 running, 1 awaiting review
  Blocked: Brief awaiting your approval
  Routed around: 2 independent tasks started while brief waits

  YOUR ATTENTION (1 item)
  ┌─────────────────────────────────────────────┐
  │  Phase 5 brief — Architect output            │
  │  Confidence: high │ Trust: supervised         │
  │  Pre-reviewed: ✓ Architecture checklist pass  │
  │  [Review now]  [Approve]  [Edit]  [Reject]   │
  └─────────────────────────────────────────────┘
```

**Key UX decisions:**
- Trust gate pauses surface inline in the tree with a clear action: "needs your approval."
- Routed-around tasks are visible and explained: "Routed around blocked brief — independent work." The user understands the orchestrator is being productive, not waiting.
- "YOUR ATTENTION" section is separate from the tree — it's the action surface. The tree is orientation; the attention section is action.
- The orchestrator's routing decisions are transparent: the user sees what was routed around and why, not just the current state.

**Persona test:**
- **Rob:** On phone between jobs. Sees "1 item needs attention." Taps review, approves quote, back to work. Doesn't need to understand the tree — the attention section is what matters.
- **Lisa:** Sees 2 content tasks running and 1 pricing alert waiting for review. Approves the alert on her commute. Content tasks continue.
- **Nadia:** Sees her team's processes — 3 running, 1 awaiting her review, 2 routed around the blocked one. She knows the team isn't idle.

### Activity Feed for Routing Decisions

```
  Activity Feed:
  5 min ago — Orchestrator routed around trust gate
    "Phase 5 brief" paused at trust gate (supervised).
    Started "invoice reconciliation template" and
    "content review template" — no dependency on brief.
    [View routing decision]

  12 min ago — Builder completed "Design orchestrator UX"
    Output: interaction spec at docs/research/phase-5-orchestrator-ux.md
    Confidence: high
    [View output]
```

Every routing decision is logged and visible. The user can drill into "View routing decision" to see the orchestrator's reasoning.

---

## 4. Stopping Condition UX — "I need your help to continue"

**Human jobs served:** Decide, Orient
**Primitives:** Review Queue (extended), Conversation Thread

### The Process Owner's Experience

The orchestrator has been working but now it's uncertain about how to proceed. This is not a trust gate (which is about oversight) — this is the orchestrator saying "I don't know what to do next."

### Interaction Pattern: Uncertainty Escalation

The four-way escalation taxonomy from the research applies here. Each type surfaces differently:

**Type 1 — Blocked (knows what it needs):**
```
  ┌─────────────────────────────────────────────┐
  │  ⏸ Orchestrator paused: missing input        │
  │                                              │
  │  Working on: Process template for invoices   │
  │  Needs: Access to a sample invoice format    │
  │  to build the extraction step.               │
  │                                              │
  │  [Provide input]  [Skip this task]  [Cancel] │
  └─────────────────────────────────────────────┘
```

**Type 2 — Uncertain (doesn't know the right approach):**
```
  ┌─────────────────────────────────────────────┐
  │  ⏸ Orchestrator paused: needs your judgment  │
  │                                              │
  │  Working on: Goal decomposition engine       │
  │  Uncertainty: Should decomposition happen     │
  │  at capture time (eager) or at first          │
  │  heartbeat (lazy)?                            │
  │                                              │
  │  Option A: Eager — decompose immediately      │
  │    Pro: User sees the plan right away          │
  │    Con: May decompose before enough context    │
  │                                              │
  │  Option B: Lazy — decompose when work starts  │
  │    Pro: More context available                 │
  │    Con: User waits to see the plan             │
  │                                              │
  │  [Choose A]  [Choose B]  [Discuss]            │
  └─────────────────────────────────────────────┘
```

**Type 3 — Error (system failure):**
```
  ┌─────────────────────────────────────────────┐
  │  ⚠ Orchestrator error: API failure           │
  │                                              │
  │  Step: Router agent classification           │
  │  Error: Anthropic API rate limit exceeded    │
  │  Retried: 3 times over 5 minutes             │
  │                                              │
  │  Other work continues unaffected.            │
  │                                              │
  │  [Retry now]  [Skip step]  [Cancel goal]     │
  └─────────────────────────────────────────────┘
```

**Type 4 — Too much uncertainty (aggregate):**
```
  ┌─────────────────────────────────────────────┐
  │  ⏸ Orchestrator stopped: too much uncertainty │
  │                                              │
  │  GOAL: Build out Phase 5                      │
  │                                              │
  │  Completed: 4/7 tasks                         │
  │  Remaining: 3 tasks, all have open questions  │
  │                                              │
  │  The remaining work requires decisions I       │
  │  can't make confidently:                       │
  │  1. Schema design for goal decomposition       │
  │     (2 valid approaches, different trade-offs) │
  │  2. Template format (no clear standard)        │
  │  3. E2E test scope (depends on 1 and 2)        │
  │                                              │
  │  Confidence: low — too many interdependent     │
  │  decisions for me to proceed without input.    │
  │                                              │
  │  [Resume with guidance]  [Reassign to human]   │
  │  [Reduce scope]  [Pause goal]                  │
  └─────────────────────────────────────────────┘
```

**Key UX decisions:**
- Each stop type has a distinct visual treatment and distinct actions. Blocked ≠ uncertain ≠ error ≠ aggregate uncertainty.
- The orchestrator explains what it was trying to do, why it stopped, and what would unblock it.
- "Resume with guidance" opens a Conversation Thread where the user can provide direction and the orchestrator replans.
- The orchestrator's confidence is visible — the user learns to calibrate: "low confidence from the orchestrator means I need to make a decision."
- Aggregate uncertainty (Type 4) is the process-level stopping condition from Insight-045. It's not a single question — it's "the remaining work has too many open questions for me to be useful."

**Persona test:**
- **Rob:** Sees Type 1 (blocked) most often — "need your pricing rules for bathroom renos." Provides input on phone, work resumes.
- **Lisa:** Sees Type 2 (uncertain) — "should product descriptions lead with features or benefits?" Lisa makes the brand call.
- **Jordan:** Sees Type 4 (aggregate) — "three departments want different formats, I need you to decide the standard." Jordan brings it to the leadership meeting.
- **Nadia:** Sees per-team-member uncertainty — "Chen's process keeps getting corrected on the same thing. Should I escalate to you or keep trying?"

---

## 5. Process Templates — "What's available?"

**Human jobs served:** Define, Delegate
**Primitives:** Conversation Thread, Process Builder, Quick Capture

### The Process Owner's Experience

The user wants to add a new process. Instead of describing it from scratch, they can browse templates — pre-built process definitions for common work patterns. Templates include governance declarations (trust config, quality criteria, feedback loops) — not just workflow steps.

### Interaction Pattern: Template Discovery

**CLI flow:**
```
$ aos capture "I need to track and follow up on overdue invoices"

  Classifying... task (high confidence)
  Routing to: orchestrator

  I found 2 templates that match:

  ┌─────────────────────────────────────────────┐
  │  1. Invoice Follow-Up                        │
  │     Tracks overdue invoices, sends reminders, │
  │     escalates after configurable thresholds.  │
  │     Steps: 4 │ Inputs: accounting system      │
  │     Trust: starts supervised                  │
  │     Used by: 0 (new template)                 │
  │     [Preview]  [Adopt]                        │
  ├─────────────────────────────────────────────┤
  │  2. Accounts Receivable Management           │
  │     Full AR pipeline: invoice generation,     │
  │     payment tracking, follow-up, reporting.   │
  │     Steps: 8 │ Inputs: accounting + CRM       │
  │     Trust: starts supervised                  │
  │     Used by: 0 (new template)                 │
  │     [Preview]  [Adopt]                        │
  └─────────────────────────────────────────────┘

  Or describe what you need and I'll help build it from scratch.
  [Build from scratch]
```

**After adopting a template:**
```
  Adopting: Invoice Follow-Up

  I need to customise this for your setup:

  1. Where are your invoices? (accounting system)
     ○ Xero  ○ QuickBooks  ○ MYOB  ○ Other: ___

  2. When is an invoice "overdue"?
     Current setting: 30 days past due
     [Keep]  [Change to: ___ days]

  3. Who should receive escalation alerts?
     [You]  [Accounts team]  [Other: ___]

  ─────────────────────────────────────────────
  Preview of customised process: [View]
  [Activate supervised]  [Edit further]  [Cancel]
```

**Key UX decisions:**
- Templates surface through natural language capture, not a catalogue browse. The user describes what they need; the system finds matching templates. This is the "capability catalog, not app store" principle from human-layer.md.
- Templates include governance declarations — trust config, quality criteria, feedback loops. Not just workflow steps. The user sees what oversight looks like from day one.
- Customisation is conversational — one question at a time, matching the Boiling Frog principle.
- "Build from scratch" is always available — templates are a shortcut, not a requirement.
- "Used by" count provides social proof as the template library grows.

**Persona test:**
- **Rob:** "I need to send quotes" → template match: "Quote Generation for Trades." Three customisation questions (pricing source, margin rules, output format). Active in 10 minutes.
- **Lisa:** "I need product descriptions" → template match: "Product Content Generation." Customisation: brand voice, differentiator fields, competitor reference sources. Lisa edits the quality criteria to add her specific brand rules.
- **Jordan:** Browses templates across departments. Picks "Reference Checking" for HR, "Expense Reconciliation" for Finance. Shows leadership: "here are the 8 templates I'm rolling out."
- **Nadia:** Adopts "Report Formatting" template, customises per analyst (each gets slightly different quality criteria based on their recurring corrections).

---

## Reference Doc Status

- **docs/personas.md:** Checked. All four personas tested. Jordan missing from section 3 persona test (minor — his multi-department scenario is covered in sections 2 and 5).
- **docs/human-layer.md:** Checked. All six human jobs represented. Primitives mapped to each section. No updates needed.
- **docs/architecture.md:** Checked. ADR-010 orchestrator definition aligns with proposed interactions. No drift.

---

## Summary: Primitive Mapping

| Interaction area | Human jobs | Primitives used |
|-----------------|------------|-----------------|
| Goal setting | Define, Delegate | Conversation Thread, Process Builder, Quick Capture |
| Decomposition visibility | Orient, Delegate | Process Graph (CLI tree), Activity Feed |
| Progress and routing | Orient, Review | Activity Feed, Process Card, Review Queue |
| Stopping condition | Decide, Orient | Review Queue (extended), Conversation Thread |
| Process templates | Define, Delegate | Conversation Thread, Process Builder, Quick Capture |

## Gaps — Original to Agent OS

1. **Four-way escalation UX** — No surveyed product distinguishes blocked/uncertain/error/aggregate-uncertainty with distinct UX treatments. Most show a single "needs attention" state.
2. **Route-around visibility** — No surveyed product shows the user that the orchestrator continued on independent work while something is blocked. Most either stop entirely or hide the routing decision.
3. **Goal negotiation before execution** — Most agent systems start executing immediately. The "agree scope before work begins" interaction is original.
4. **Template adoption with governance declarations** — Templates in n8n/Zapier/Notion include workflow steps only. Including trust config, quality criteria, and feedback loops in the template is original.
