# Brief: {Phase/Task Name}

**Date:** {YYYY-MM-DD}
**Status:** draft | ready | in_progress | complete
**Depends on:** {prior brief or phase — "none" if standalone}
**Unlocks:** {what becomes buildable after this — "none" if standalone}

<!--
Template provenance:
- Goal → Issue → Work Product → Approval structure from Paperclip (paperclipai/paperclip)
  /packages/db/src/schema/goals.ts, /packages/db/src/schema/issues.ts
- Non-Goals section from Rust RFC template (rust-lang/rfcs)
- Acceptance criteria as boolean pass/fail from compound-product (snarktank/compound-product)
- Constraints pattern from antfarm agent AGENTS.md (snarktank/antfarm)
- Provenance section original to Agent OS
- Review gate from Paperclip pr-report skill (.agents/skills/pr-report/SKILL.md)
- Status lifecycle from ADR convention (Michael Nygard pattern, same as docs/adrs/)

Status lifecycle:
- draft: architect is designing, not yet reviewed
- ready: reviewed and approved by human, available for builder
- in_progress: builder is implementing
- complete: built, reviewed, approved, merged

Naming convention:
- Briefs are numbered sequentially: 001, 002, 003, ...
- When a parent brief is split into sub-phases, each sub-brief gets its OWN
  sequential number (not a letter suffix). Example: parent brief 007 split into
  sub-phases → 008, 009. NOT 007a, 007b.
- The parent brief's "Depends on" / "Unlocks" fields link sub-briefs together.
- This keeps `ls` sorting predictable and avoids inconsistent naming.
-->

## Goal

Which roadmap item(s) does this brief serve? Link to `docs/roadmap.md` phase and capability.

- **Roadmap phase:** {Phase N: Name}
- **Capabilities:** {specific roadmap rows this brief delivers}

## Context

Why does this work exist? What prompted it? What's the current situation?

## Objective

What does success look like? One or two sentences.

## Non-Goals

What this brief explicitly does NOT cover. Prevents scope creep.

- ...

## Inputs

What to read before starting. List specific files with their purpose:

1. `{file path}` — {why to read it}
2. ...

## Constraints

What NOT to do. Boundaries. Things that must be preserved.

- ...

## Provenance

Where do the patterns for this work come from? Include why each source was chosen.

| What | Source | Why this source |
|------|--------|----------------|
| {pattern/approach} | {project} `{file path}` | {why it fits} |
| ... | ... | ... |

## What Changes (Work Products)

What files are created, modified, or deleted? These are the deliverables.

| File | Action |
|------|--------|
| `{file path}` | {Create / Rewrite / Modify / Delete}: {what specifically changes} |
| ... | ... |

## User Experience

Which of the six human jobs does this work affect? (Orient, Review, Define, Delegate, Capture, Decide)

- **Jobs affected:** {list, or "None — no user-facing changes"}
- **Primitives involved:** {which of the 16 primitives, or "None"}
- **Process-owner perspective:** {how does the person using Agent OS experience this change?}
- **Interaction states:** {loading, empty, error, success, partial — for any UI-touching work, or "N/A"}
- **Designer input:** {reference to Designer's interaction spec at `docs/research/*-ux.md`, or "Not invoked — lightweight UX section only"}

## Acceptance Criteria

How do we verify this work is complete? Each criterion is boolean: pass or fail.

1. [ ] {testable criterion}
2. [ ] {testable criterion}
3. ...

## Review Process

How to validate the work after completion:

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: {specific things to verify for this task}
3. Present work + review findings to human for approval

## Smoke Test

Describe the manual test that proves this brief is working. This is not optional.

```bash
# Commands to run and what to expect
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for completed items
3. Phase retrospective: what worked, what surprised, what to change
4. Write ADR if a significant decision was made (use `docs/adrs/000-template.md`)
