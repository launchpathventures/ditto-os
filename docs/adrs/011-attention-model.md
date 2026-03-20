# ADR-011: Attention Model

**Date:** 2026-03-20
**Status:** proposed

## Context

Agent OS's trust tiers (ADR-007) determine **how often** a human reviews process outputs — supervised reviews everything, spot-checked samples ~20%, autonomous reviews exceptions only. But trust tiers don't determine **in what form** the human is pulled in. Today, every output that reaches the human arrives as an individual item in the Review Queue — approve, edit, or reject.

The concern: even with trust tiers, a workspace running 10+ processes could feel like a noisy approval queue rather than a quietly productive team. The user's aspiration — expressed directly — is for Agent OS to feel like a real-world manager overseeing a reliable team: periodic check-ins calibrated to importance and trust, not a stream of individual approvals. The last thing Agent OS should be is noisy, overwhelming, or unnecessarily busy.

Research (`docs/research/autonomous-oversight-patterns.md`) surveyed patterns across content moderation, ISO quality control, management science, autonomous vehicles, and agent platforms. It identified a missing architectural concept: the **attention model** — when, how, and in what form the system pulls the human in.

### Design forces

- **Rob** is on job sites 60% of the day. His phone buzzes for every approved quote — he ignores the buzzes and misses the one that actually needed his eye.
- **Lisa** checks her morning brief on the commute. She wants to see "content process: 8 descriptions published, 0 corrections needed" — not 8 individual review items that auto-advanced.
- **Jordan** has 4 processes across 3 departments. A per-item review queue for each would be overwhelming. He needs a portfolio view with exception surfacing.
- **Nadia** governs quality across her team. She needs process-level health signals, not a queue of individually-approved reports.
- **Insight-030:** Structure is the missing layer. The system does the cognitive work; the human does the judgment work. This applies to the oversight experience too.
- **ADR-007:** Trust tiers are sound and validated by ISO 2859, Hersey-Blanchard, SAE levels. This ADR builds ON trust tiers, not replaces them.

## Decision

### 1. Introduce three attention modes

The attention model defines **how** the human experiences process outputs. Trust tiers (L3) determine **what** gets reviewed. Attention modes (cross-cutting, bridging L3 and L6) determine **how** the human sees it.

| Mode | What the human sees | When it's used | Human effort |
|------|--------------------|--------------|----|
| **Item review** | Individual output in Review Queue. Requires action: approve / edit / reject. | Supervised tier (all outputs), spot-checked tier (sampled outputs), any output flagged as uncertain | Active — human makes a decision per item |
| **Digest** | Summary in Daily Brief or process-level report. No action required unless the human chooses to drill in. | Autonomous tier (all outputs), spot-checked tier (non-sampled outputs) | Passive — human scans a summary |
| **Alert** | Process-level health notification triggered by metric deviation. Surfaces as an Improvement Card or process health warning. | Any tier when metrics cross thresholds (correction rate spike, downstream rejection, auto-check failures) | Reactive — human investigates an exception |

These are not mutually exclusive per process. A spot-checked process uses item review for sampled outputs and digest for the rest. An autonomous process uses digest normally and alert when something goes wrong.

### 2. Trust tier → default attention mode mapping

| Trust tier | Default attention mode | What overrides this |
|------------|----------------------|-------------------|
| **Supervised** | Item review for every output | Nothing — this is the starting state |
| **Spot-checked** | Item review for sampled outputs; digest for the rest | Low confidence → item review regardless of sampling |
| **Autonomous** | Digest only; no individual items in Review Queue | Low confidence → item review; metric deviation → alert |
| **Critical** | Item review for every output, canAutoAdvance=false | Nothing — architectural invariant |

**Silence is a feature.** When an autonomous process runs cleanly, the human sees nothing until the next digest (Daily Brief or on-demand process summary). No notification, no queue item, no badge. The absence of noise IS the signal that things are working.

### 3. Per-output confidence scoring

The agent producing an output includes a **confidence signal** as metadata on the step run. This is not a trust score (which is process-level and historical) — it is a per-output, per-invocation self-assessment: "how certain am I that this specific output is correct?"

**Mechanism:**
- The agent's system prompt includes instruction to assess its own confidence for each output
- Confidence is expressed as a categorical signal: `high`, `medium`, `low` (not a numeric score — LLMs are poorly calibrated on numeric confidence)
- The harness uses confidence alongside the trust tier to route:
  - `low` confidence → escalate to item review regardless of trust tier (the agent is saying "I need human eyes on this")
  - `medium` confidence → follow the trust tier's default attention mode
  - `high` confidence → follow the trust tier's default attention mode

**Why categorical, not numeric:** LLM confidence scores are notoriously poorly calibrated. A three-level categorical signal ("I'm sure / I'm not sure / I'm uncertain") is more reliable than a 0.0-1.0 score that looks precise but isn't. The system can track calibration over time (does the agent's "high confidence" actually correlate with clean approvals?) and adjust the routing accordingly — but that's a Layer 5 learning concern, not a routing mechanism.

**Why three levels, not two:** Only `low` produces a routing override today. `medium` and `high` both follow the trust tier default. The distinction exists for Layer 5 calibration tracking — the learning layer can compare `medium` vs `high` approval rates to assess whether the agent's self-assessment is meaningful. If calibration data shows no distinction, the system can collapse to two levels. Three levels cost nothing in routing complexity (only `low` branches) but provide a richer calibration signal.

**Where it lives:** Confidence is metadata on the `stepRuns` record. The harness reads it during the trust gate phase to decide routing. The agent adapter is responsible for extracting it from the agent's response.

**Provenance:** Content moderation three-band model (TikTok, YouTube). SAE Level 3 (system knows when it's out of its depth). Insurance STP (risk-score routing). Adapted from numeric scores to categorical signals for LLM reliability.

### 4. Digest as a review surface

The Daily Brief (Primitive 1) already functions as a digest — "here's what happened overnight." This ADR extends the digest concept to be an explicit attention mode for autonomous processes:

- Autonomous process outputs are **not** added to the Review Queue as individual items
- Instead, they accumulate as **process run summaries** accessible from the Process Card or Daily Brief
- The summary includes: run count, pass/fail rate, any quality criteria results, downstream acceptance, trend
- The human can drill into individual outputs from the summary if they choose — but they're not asked to

**The Review Queue's role narrows:** With this ADR, the Review Queue becomes the surface for outputs that genuinely need human judgment — supervised outputs, sampled spot-checked outputs, and confidence-flagged outputs. It is no longer the surface for all outputs that pass through the harness. This is a scope refinement, not a redesign — the Review Queue becomes more focused and higher-signal.

**Process-level digest example:**
```
Invoice Reconciliation — last 7 days
├── 12 runs completed
├── 0 exceptions flagged
├── Quality: all criteria met
├── Downstream: 100% accepted by Xero process
├── Cost: $2.40 total
└── [View individual runs] [View trends]
```

**Provenance:** Zapier Digest (batch review as first-class feature). GitHub Copilot Coding Agent (PR as batch artifact). Management by Exception / Active MBE (monitor metrics, alert on deviation).

### 5. Process-level health alerts

When metrics deviate from expected bounds, the system surfaces a **process-level alert** — not individual flagged outputs. This is the Management by Exception pattern: the harness monitors quality metrics continuously and escalates when patterns indicate degradation.

This already exists in concept:
- Layer 5 (Learning) detects performance degradation
- The Improvement Card (Primitive 13) surfaces diagnosis + evidence + suggestion
- ADR-007's downgrade triggers fire when correction rate or rejection rate spikes

What this ADR adds: **alerts are the primary escalation mechanism for autonomous processes.** An autonomous process that degrades doesn't suddenly fill the Review Queue with individual items — it produces a single process-level alert that says "Invoice Reconciliation accuracy dropped 15% this week — here's why, here's a suggestion."

The alert may trigger an automatic downgrade to supervised (per ADR-007). But the human's first experience is the alert, not a flood of individual review items.

**Provenance:** PagerDuty Event Intelligence (98% noise reduction, only actionable alerts reach humans). SPC Western Electric rules (alert on statistical anomaly, not per-output). Waymo fleet response (vehicle contacts human only on ambiguity).

### 6. Process importance classification — deferred

The research identified process importance (reversibility, blast radius, novelty, cost of delay) as a potential fourth dimension. This ADR **defers** importance classification to a later phase.

**Rationale:** Trust tier + confidence already provides two dimensions of routing. The `critical` tier already handles the highest-risk case. Adding a third dimension (importance) increases complexity without proportional value at current scale. When the system has 10+ processes competing for human attention, importance classification becomes valuable for prioritisation within the Review Queue and Daily Brief. That's a Phase 10+ concern.

**Re-entry condition:** When a user has 10+ active processes and the Daily Brief needs to prioritise between them, importance classification should be evaluated as a prioritisation input.

## Consequences

### What this enables

- **Quiet workspace.** Autonomous processes run silently. The human sees summaries, not items. Noise is proportional to uncertainty, not volume.
- **Manager experience.** The Daily Brief + digest mode + health alerts create the periodic-review pattern real managers use. The human checks in on their schedule, not the system's.
- **Attention budget.** Each process consumes attention proportional to its trust tier and the agent's confidence. A human overseeing 20 processes isn't overwhelmed because 15 of them are autonomous and show only in digests.
- **Smart escalation.** The agent can say "I need help with this one" regardless of the process's trust tier. The system catches degradation at the process level before individual failures pile up.
- **Insight-030 fulfilled.** The system does the cognitive work (monitoring, assessing confidence, summarising) and the human does the judgment work (reviewing flagged items, responding to alerts, scanning digests).

### What changes in the architecture

- **L3 (Harness):** Trust gate gains confidence-based routing. Step run records gain confidence metadata.
- **L6 (Human):** Review Queue scope narrows to items genuinely needing human judgment. Digest becomes an explicit attention mode for autonomous processes. Daily Brief gains process-level summaries.
- **Cross-cutting:** Attention model added as a new cross-cutting concern (like Governance and Integrations), bridging L3 and L6.
- **Primitive 1 (Daily Brief):** Gains process-level digest summaries for autonomous processes.
- **Primitive 5 (Review Queue):** Scope refined — items in the queue are those the system determined need human judgment, not all outputs that pass through the harness.
- **Primitive 13 (Improvement Card):** Gains role as primary alert mechanism for autonomous process degradation.

### What doesn't change

- Trust tiers (4 tiers, earning algorithm, downgrade triggers) — unchanged
- Trust earning (ADR-007 algorithm, conjunctive upgrade, disjunctive downgrade) — unchanged
- Feedback capture (edits as feedback, correction patterns) — unchanged
- The principle that humans decide trust upgrades — unchanged
- The principle that the system never auto-fixes — unchanged

### Risks

- **Agent confidence calibration.** LLM self-assessment may be poorly calibrated initially. Mitigation: start with categorical (high/medium/low), track calibration in Layer 5, treat `low` as reliable (agents are better at knowing when they're unsure than when they're sure).
- **Digest blindness.** If digests become routine, the human may stop reading them. Mitigation: the alert mechanism bypasses the digest — degradation surfaces as an active notification, not buried in a summary.
- **Review Queue identity.** Narrowing the Review Queue's scope is a meaningful change to the "single most important UI element." Mitigation: the queue becomes higher-signal (every item genuinely needs judgment), which should increase trust in the queue itself.

## Relationship to other ADRs

- **ADR-007 (Trust Earning):** This ADR builds on trust tiers. Trust tiers determine review frequency; the attention model determines review form. No changes to ADR-007.
- **ADR-008 (System Agents):** System agents (trust-evaluator, improvement-scanner) are the engines that power health alerts and digest summaries. No changes to ADR-008.
- **ADR-009 (Runtime Composable UI):** Trust-aware UI density (ADR-009 design principle 2) is complementary — autonomous processes get less dense UI (digest), supervised get more dense (item review). No conflict.
- **ADR-010 (Workspace Interaction Model):** The attention model fulfils ADR-010's promise that the workspace "pulls the human in only when their judgment is needed." Strengthens ADR-010.

## Build Phasing

The attention model is a design concept, not a single build item. Its mechanisms ship incrementally:

| Mechanism | Earliest phase | Rationale |
|-----------|---------------|-----------|
| Per-output confidence metadata on stepRuns | Phase 4 (Workspace Foundation) | One field + one system prompt instruction + one routing branch in trust gate |
| Digest mode (autonomous outputs not in Review Queue) | Phase 5 (Work Evolution Verification) | Requires Daily Brief to support process-level summaries |
| Process-level health alerts as primary escalation | Phase 8 (Layer 5 — Learning Full) | Requires degradation detection and Improvement Card |
| Confidence calibration tracking | Phase 8 (Layer 5 — Learning Full) | Requires feedback data correlating confidence with outcomes |
| Importance classification | Phase 10+ | Deferred — re-entry when 10+ processes compete for attention |
