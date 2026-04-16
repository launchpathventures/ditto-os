# Insight-191: Step Output Activity Labels for Digest Summarization

**Date:** 2026-04-15
**Trigger:** Brief 158 MP-3.1 — building the autonomous digest required human-readable summaries of what auto-advanced steps actually did
**Layers affected:** L3 Harness, L6 Human
**Status:** active

## The Insight

Step outputs can carry a `_activityLabel` string that the briefing digest uses to build human-readable summaries. Without this, the digest falls back to inferring activity from step IDs (pattern matching on "email", "send", "quote", etc.), which is fragile.

The convention is lightweight: any step handler can set `outputs._activityLabel = "emails sent"` or `"responses received"` and the digest will aggregate these into natural summaries like "3 emails sent, 2 responses received." This is a soft contract — the system works without it but produces better summaries with it.

## Implications

- Step executor implementations should set `_activityLabel` when the step's activity has a meaningful human description
- Process template authors should be aware of this convention when designing steps
- The `_` prefix signals this is framework metadata, not domain output

## Where It Should Land

Process definition guide or process template documentation, when those exist. Could also be formalized as a typed field on step outputs in the core schema if adoption grows.
