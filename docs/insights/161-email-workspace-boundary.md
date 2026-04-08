# Insight 161: Email vs Workspace — Arms-Length Before Embedded

**Date:** 2026-04-07
**Status:** active
**Emerged from:** Brief 098b discussion — what can Alex do over email vs what needs a workspace
**Affects:** Process templates, front door flow, workspace provisioning triggers

## The Insight

Users without a workspace are operating at arms-length with Alex. Email is the interface. This creates a natural boundary on what Alex can do — and that boundary is a feature, not a limitation.

### Email is good for (arms-length)
- Briefings — weekly, ad-hoc status updates
- Research results — "here's what I found"
- Notifications — "Jane replied positively"
- Simple approvals — "reply yes/no to send this"
- Sequential one-at-a-time decisions

### Email breaks down when
- User needs to review 5+ items at once (draft introductions, target lists)
- User wants to see process progress in real time
- User wants to adjust trust tiers or process definitions
- User asks for something that requires interactive editing
- Multiple processes are running simultaneously and the user needs oversight

### The workspace trigger
Alex should proactively suggest a workspace when:
- 3+ processes are active simultaneously
- User needs batch review (e.g., "review these 10 intros")
- User's replies suggest they want more control ("can I see the pipeline?")
- Complexity of a single process exceeds what email can carry

The suggestion should be natural: "This is getting complex enough that you'd benefit from a workspace — I can set one up where you can see everything in one place. Want me to?"

### Implementation implications
1. Process templates should have a `surface` field: `email | workspace | any`
2. The front-door intake should flag when a process would benefit from workspace
3. The status composer should track complexity and suggest workspace when thresholds met
4. Email-only users should get simpler output formatting (no interactive blocks)

### When the workspace is installed

The user now has two surfaces where Alex exists:
- **Workspace** — real-time UI, process views, trust controls, Self conversation
- **Network** — Alex's professional work continues (introductions, outreach, nurture)

Notification routing changes via `notifyUser()`:

| Event type | Email-only user | Workspace user |
|-----------|----------------|----------------|
| Process completion | Email | Workspace (SSE run-complete already handles) |
| Status briefing | Email | Workspace (richer in-app briefing) |
| Contact replied positively | Email (immediate) | Workspace + email fallback |
| Pending review | Email | Workspace (gate-pause SSE) |
| Weekly briefing | Email | Workspace |
| Urgent/actionable | Email | Both (workspace + email fallback) |

The workspace doesn't replace email entirely — it becomes the primary surface. Email becomes the fallback for when the user isn't actively in the workspace. This mirrors how Slack/email coexist: important things go to both, routine things go to the primary surface.

The key: `notifyUser()` checks `networkUsers.status`. When `"workspace"`, it checks if the workspace is online (via health check or last-seen timestamp) and routes accordingly.

## What this is NOT
- NOT a paywall — the workspace is a better experience, not a premium tier
- NOT artificial limitation — email genuinely can't carry batch review UX
- NOT a one-time decision — users can start email-only and migrate naturally

## Relationship to Other Insights
- Insight-154 (value before identity): Deliver value over email first, workspace is a natural graduation
- Insight-160 (trust context): Arms-length users don't supervise Alex's professional work — Ditto admin does
- Feedback: feedback_workspace_not_automation.md — workspace is a living surface, not a dashboard
