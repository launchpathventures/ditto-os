# Insight 160: Trust Context Determines Initial Tier — Not All Processes Start Supervised

**Date:** 2026-04-07
**Status:** active
**Emerged from:** Brief 098b review — questioning why Alex needs user approval to send an email to the user themselves
**Affects:** All process templates, trust gate design, user experience

## The Insight

The trust system was treating all processes identically: start at `supervised`, earn your way to `autonomous`. But there are fundamentally different trust contexts that determine where a process should *start*:

### Context 1: Alex → User (direct communication)
**Processes:** weekly-briefing, front-door-cos-intake (briefing steps), analytics-reporting, pipeline-tracking, inbox-triage, meeting-prep, network-intelligence, relationship-scoring

The user IS the recipient. Asking the user to approve an email sent to themselves is absurd friction. The natural feedback loop (reply with corrections) IS the trust signal. These should start at `autonomous` — the downgrade triggers catch quality problems, and the user can always reply "this was wrong."

### Context 2: Alex as Ditto's network professional
**Processes:** front-door-intake, connecting-introduction, connecting-research, warm-path-finder, network-nurture, person-research, outreach-quality-review

Alex IS the professional connector. This is Ditto's value proposition. The quality-gate (critical, never bypassed) already protects reputation. Alex's cognitive core has house values baked in. The right tier: `autonomous` — Alex is empowered to act. The quality-gate is the safety net, and downgrade triggers catch quality problems. Treating Alex as anything less than autonomous in his professional domain makes him feel like a tool, not a colleague.

**Who reviews on downgrade:** If quality degrades and Alex is downgraded, the *Ditto admin team* reviews, not the end user. The user never sees approval flows for Alex's professional connector work. The trust gate is reviewer-agnostic (it just pauses), but the admin interface is where Ditto staff review. This is how a real company works — a manager reviews an employee's work quality, not the client.

**Implementation (Brief 108, 2026-04-08):** `notifyAdmin()` / `notifyAdminOfDowngrade()` fire email to `ADMIN_EMAIL` on system-triggered downgrades via `executeTierChange()` in `trust.ts` (dynamic import, fire-and-forget). Admin dashboard at `/admin/users/[userId]` shows the downgraded user's processes, trust tiers, recent runs, and quality metrics. Admin can add feedback (`adminFeedback` table — surfaces as context to Self), pause/resume user processes (`pauseUserProcesses`/`resumeUserProcesses` sets `pausedAt` on `networkUsers`), or act-as-Alex (`sendAsAlex()`). This closes the open question documented above.

### Context 3: Alex on behalf of user's business
**Processes:** selling-outreach, follow-up-sequences, social-publishing, content-creation, objection-handling

The user's personal reputation is on the line. Alex sends emails that look like they come from the user's business. `supervised` makes total sense — you want to see what Alex says in your name.

### Context 4: System safety gates
**Processes:** quality-gate, opt-out-management

`critical` — these are system invariants. No trust to earn. Non-negotiable.

### Context 5: Internal analysis (no external action)
**Processes:** channel-router

Pure internal routing decisions. No external communication. Should be `autonomous` — if routing is wrong, the downstream process catches it.

## Why This Matters

Starting everything at `supervised` creates a paradoxical user experience: the user has to approve Alex sending them their own briefing. This makes Ditto feel like an approval queue, not a teammate. The insight from feedback_quiet_oversight.md applies here — "Ditto must feel like a quiet reliable team, not a noisy approval queue."

The trust tiers are correct as a mechanism. The error was in initial tier assignment — treating all processes as if they had equal risk profiles.

## Implementation

The `initial_tier` in each process YAML determines the starting trust level. Changes:
- Context 1 (Alex → User): `initial_tier: autonomous` with quality-based downgrades
- Context 2 (Alex as professional): `initial_tier: autonomous` — quality-gate is the safety net
- Context 3 (User's business): `initial_tier: supervised` (unchanged)
- Context 4 (System gates): `initial_tier: critical` (unchanged)
- Context 5 (Internal): `initial_tier: autonomous`

## Relationship to Other Insights

- Insight-073 (quiet oversight): Trust should match real management — periodic, exception-driven
- Feedback: feedback_quiet_oversight.md — "not a noisy approval queue"
- Feedback: feedback_not_project_management.md — "active orchestrator, not passive container"
