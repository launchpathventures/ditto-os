# Insight-160: Every Promise Alex Makes Must Be Backed by Infrastructure

**Date:** 2026-04-07
**Trigger:** Brief 097 build — discovered that Alex was sending emails and making promises in front door conversations without any infrastructure to track or execute those promises
**Layers affected:** L2 Agent, L3 Harness, L4 Awareness
**Status:** active

## The Insight

When an AI agent makes a promise to a user — "I'll send you an email," "I'll research targets," "I'll get back to you within 24 hours" — that promise must be backed by infrastructure that ensures it actually happens and is tracked.

Before Brief 097, Alex was sending emails that weren't recorded as interactions, creating process runs with tools that didn't exist, and making commitments that the system had no way to verify were fulfilled. The gap between what Alex *said* and what the system could *deliver* was invisible until someone checked the admin view and found zero interactions.

The principle: **no promise without plumbing**. Every user-facing commitment requires: (1) an execution mechanism (tool, process step, scheduled job), (2) a tracking record (interaction, work item, activity), and (3) a verification path (admin view, status report, audit trail).

## Implications

- New agent capabilities must be validated end-to-end: can the agent actually *do* what its prompt says it can do?
- The `sendAndRecord()` atomic pattern should be the model: every side-effecting action should be paired with a record.
- Process template tool declarations must resolve to real registered tools — unresolvable tools should be a sync-time error, not a runtime silent failure.
- The admin/teammate view is the canary: if it shows no data, promises are being broken.

## Where It Should Land

Architecture spec — Layer 2 (Agent) constraint: "Agent capabilities must be infrastructure-backed." Could also become an ADR if the principle extends to a formal pre-flight check for process template tool declarations at sync time.
