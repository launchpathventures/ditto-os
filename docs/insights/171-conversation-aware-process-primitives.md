# Insight 171: Conversation-Aware Process Primitives

**Status:** Active
**Emerged from:** Front door → email transition redesign
**Affects:** All process templates, harness pipeline, step execution

## The Problem

Process templates were treating email as a delivery channel (fire-and-forget outputs)
rather than a conversation medium. This produced:

- **Email firehose**: 4 separate emails hitting the user on day 1 from parallel processes
- **Fixed cadence**: Steps firing on timers regardless of user engagement
- **No feedback loop**: User replies couldn't influence running processes
- **Broken threads**: Each email was standalone, not part of a conversation

A real advisor has ONE ongoing conversation with you. They send, wait for your
response, and adapt. Process templates need to model this.

## Three New Step Primitives

Added to `StepDefinition` in `@ditto/core`:

### 1. `wait_for` — Pause Until External Event

```yaml
wait_for:
  event: reply    # or "approval"
  timeout: "48h"  # defaults to 48h
```

The step executes (e.g., sends an email), then the process suspends until the
event arrives or timeout expires. On timeout, the step completes with
`{ timedOut: true }` in outputs so downstream steps can route on it.

**When to use:** Any step that sends a message and needs the response before
the next step can do meaningful work. Action emails, feedback requests, approvals.

**Pattern:** Send → Wait → Route (on reply content or timeout)

### 2. `gate` — Engagement-Conditional Execution

```yaml
gate:
  engagement: silent   # "replied" | "silent" | "any"
  since_step: report-back
  fallback: skip       # "skip" | "defer"
```

Checked by the heartbeat before step execution. If the condition is NOT met,
the step is skipped or deferred.

**When to use:** Nurture sequences where the next step depends on whether the
user is engaged. Don't send a "check-in" email if they already replied. Don't
send a follow-up if they're actively responding.

**Key insight:** Silent users get FEWER emails, not more. Engaged users get
responses to their messages, not canned sequences. The gate inverts the typical
drip-campaign pattern.

### 3. `email_thread` — Conversation Grouping

```yaml
email_thread: "user-onboarding"
```

Steps with the same `email_thread` value share an email thread (via In-Reply-To
/ References headers). The first email creates the thread; subsequent emails
reply to it.

**When to use:** ANY sequence of emails to the same person about the same topic.
The user should see ONE conversation in their inbox, not 6 standalone emails.

**Cross-process:** The thread ID is scoped to the person + process chain.
Child processes (user-nurture-first-week) can reference the same thread started
by the parent (front-door-intake).

## Bonus: `schedule` — Relative Timing

```yaml
schedule:
  delay: "24h"
  after: trigger  # or a step ID
```

When to execute relative to the process start or a previous step. The heartbeat
checks `executeAt` before running the step.

## How These Compose

A typical advisor conversation flow:

```yaml
steps:
  - id: initial-email
    email_thread: "onboarding"
    wait_for: { event: reply, timeout: "48h" }
    # Sends email, waits up to 48h for reply

  - id: research
    depends_on: [initial-email]
    # Runs when reply arrives (with their details) or after 48h timeout
    # Can check initial-email.outputs.timedOut to adjust behavior

  - id: day-2-nudge
    email_thread: "onboarding"
    schedule: { delay: "24h", after: trigger }
    gate: { engagement: silent, since_step: initial-email, fallback: skip }
    # Only fires if user hasn't replied. Skipped if they're already engaged.

  - id: report-back
    email_thread: "onboarding"
    depends_on: [research]
    wait_for: { event: reply, timeout: "5d" }
    # Reports results, waits for feedback
```

## Applying to Other Processes

These patterns apply to ANY process that communicates with a person:

- **follow-up-sequences**: Gate on "silent" before sending next touch.
  Skip if the user already replied.
- **weekly-briefing**: Use email_thread so weekly briefings are one thread.
  Gate on engagement to adjust depth (engaged users get more detail).
- **network-nurture**: Gate on relationship freshness. Wait for reply after
  a warm check-in before sending the next one.
- **pipeline-tracking**: Use email_thread to keep pipeline updates in one thread.
  Don't send if the user just replied to another email in the last 24h.

## Anti-Patterns

- **Never fire emails on a fixed timer without checking engagement.** Use `gate`.
- **Never start a new email thread for related communications.** Use `email_thread`.
- **Never proceed with research when you're missing details the user could provide.** Use `wait_for`.
- **Never send more emails to silent users.** Gate on "silent" and back off.
