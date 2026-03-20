---
title: "Trust gate treats all executor types identically"
severity: medium
status: deferred
scope: "src/engine/harness-handlers/trust-gate.ts"
source: review
reentry: "When a supervised process with deterministic script steps causes friction from unnecessary human review pauses"
created: 2026-03-19
resolved: null
---

## What

The trust gate applies the process's trust tier uniformly to all non-human steps regardless of executor type (ai-agent, script, handoff). A supervised process pauses for human review even on deterministic script steps that always produce the same output.

See also: Insight-005 (trust scope is per-process, not per-executor).

## Why Deferred

Trust tier reflects confidence in the *process*, not in individual executors. A newly-created process is supervised because the human hasn't validated that the overall flow works — including script steps producing expected inputs for downstream steps. Uniform enforcement validates the whole pipeline during early trust building. Differentiating by executor type introduces complexity in the trust model before we have data on whether it's needed.

## Re-entry Condition

When users report friction from script steps pausing unnecessarily in supervised/spot-checked processes. At that point, the trust gate could auto-advance deterministic steps in higher trust tiers, or support per-step `always_review: false` overrides.
