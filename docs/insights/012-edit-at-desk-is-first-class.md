# Insight-012: "Edit @ Desk" Is a First-Class Mobile-to-Desktop Interaction

**Date:** 2026-03-19
**Trigger:** Designer research into mobile review patterns — identified a gap where no existing tool handles complex review handoff between mobile and desktop
**Layers affected:** L6 Human, L3 Harness
**Status:** active

## The Insight

When a process owner reviews agent output on mobile, they face a three-way choice: approve, reject, or... what? If the output has an issue they agree with but can't fix on a phone (code change, document restructure, data correction), neither approve nor reject is right:

- **Approve** passes work they know has an issue
- **Reject** sends it back to the agent unnecessarily (the agent didn't get it wrong — it needs a human edit)
- **Defer** is passive — it doesn't communicate "I've seen this and acknowledged the issue"

"Edit @ desk" is a fourth action: **active acknowledgment with deferred resolution.** The process owner says: "I agree with the flagged issue. I'll fix it when I have the right tools. Don't block anything else on this."

This is not "save for later" (passive, no decision made). It's "I've triaged this, my decision is to edit, I'll execute that decision at my desk" (active, decision made, execution deferred).

No existing mobile tool implements this pattern. GitHub Mobile has approve/reject/comment but no "I'll edit this at my desk." Linear has snooze but no "acknowledged, pending my edit." Email has defer/snooze but no "I've decided what to do, I just can't do it here."

## Implications

- Review Queue items need a new state: "acknowledged — pending desktop edit" (distinct from "pending review" and "deferred")
- The desktop dashboard must surface "Edit @ desk" items prominently when the user opens it — this is a handoff, not a todo buried in a list
- The item state must be visible to the harness — downstream processes should know "this is being held by the human for editing" vs "this hasn't been reviewed yet"
- This pattern preserves the pipeline: other items continue to be reviewed and approved while one item waits for desktop editing
- Feedback capture still works — when the user eventually edits at desktop, the edit IS the feedback, same as any other edit

## Where It Should Land

Human-layer doc — as an interaction pattern for the Review Queue. Architecture spec — the `harnessDecisions` or step run state model needs to accommodate this state. The mobile UX spec references this as a core interaction.
