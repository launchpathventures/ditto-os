# Insight-015: Mobile Must Be Seamless, Not Primary

**Date:** 2026-03-19
**Trigger:** User direction during persona definition — mobile is critical, but as a seamless supporting surface, not the primary one
**Layers affected:** L6 Human, product strategy
**Status:** active (refines Insight-011)

## The Insight

Most work happens at the desk. Process setup, complex editing, deep review, data analysis, demos — these are desktop activities. But the desk is not the only place decisions happen. Users are regularly away from their desks — on job sites, in client meetings, commuting, at the warehouse — and work doesn't pause because they're not at a screen.

Mobile is a **seamless supporting surface**. The user must be able to continue work, nudge things forward, and perform jobs from their phone without friction — not as a degraded experience, but as a natural extension of the desktop.

The key word is **seamless**. The transition between mobile and desktop must be invisible: same queue, same state, no sync friction. A decision started on mobile (triage, approve) can be completed at the desk (edit, deep review). "Edit @ desk" (Insight-012) is the bridge interaction.

This refines Insight-011 ("Mobile is Operate mode"). The insight stands — mobile primarily serves Operate, not Explore. But the framing shifts from "mobile is primary" to "mobile must be seamless." The desk is where most work happens. The phone keeps work moving in the gaps.

## Implications

- Desktop is the primary design surface — design for desktop first, then ensure mobile flows naturally
- Simple Operate actions (approve, reject, capture, scan brief) must work on mobile without compromise
- Complex actions (edit output, set up process, analyse data) belong on desktop
- The "Edit @ desk" pattern is critical — it's how mobile triage connects to desktop completion
- Push notifications are a first-class interface — they surface what needs attention and let the user decide: act now on phone, or wait for the desk
- The architecture's "progressive enhancement" approach to mobile (Phase 12) is roughly right — but seamless Operate mode should come earlier, potentially alongside the web dashboard

## Where It Should Land

Architecture spec — L6 Human Layer should describe the desktop-primary, mobile-seamless model. Human-layer doc — interaction patterns should specify which actions are mobile-capable vs desktop-only. Personas doc — already incorporated.
