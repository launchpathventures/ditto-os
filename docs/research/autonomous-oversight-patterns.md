# How Should Agent OS Calibrate Human Attention?

**Research date:** 2026-03-20
**Question:** How do real systems balance autonomous execution with human oversight — and how should Agent OS ensure processes run independently without becoming noisy, overwhelming, or unnecessarily busy?
**Inputs:** `docs/architecture.md`, `docs/landscape.md`, `docs/human-layer.md`, `docs/adrs/007-trust-earning.md`, web research across agent platforms, management science, statistical quality control, content moderation, financial compliance, autonomous systems
**Related:** Insight-030 (Structure Is the Missing Layer)

---

## Why This Research Exists

Agent OS's trust tiers (supervised → spot-checked → autonomous → critical) and trust-earning algorithm (ADR-007) provide the foundation for graduated oversight. But the current design has a gap: **the system's primary interaction model is per-output review** — every process output that needs human eyes flows through the Review Queue as an individual item to approve, edit, or reject.

The concern: even with trust tiers, this could make Agent OS feel like a system that demands constant attention rather than one that runs independently and pulls the human in only when their judgment is needed. The aspiration is a workspace that feels like managing a reliable team — periodic check-ins calibrated to importance and trust, not a queue of approvals.

This research investigates how real systems solve this problem, across agent platforms, management science, statistical quality control, and autonomous systems.

---

## The Two Sides of the Problem

The research surfaced a convergent finding: the oversight problem and the input problem are two sides of the same coin.

**The input side:** Users of raw AI chat (Claude, ChatGPT) don't know how to interact effectively. They lack structure, guidance, standards, goal orientation, quality control, and abstraction of complexity. They end up using AI in primitive, unsophisticated ways. Agent OS solves this by providing structural scaffolding — processes, meta-agents, industry standards, goal ancestry — so the user doesn't need to be a prompt engineer. (See Insight-030.)

**The execution side:** Once work is structured and running, the system must execute autonomously and pull the human in only when their judgment genuinely adds value. The system should feel quiet when things are working and loud only when something needs attention.

**The unified principle:** The system does the cognitive work. The human does the judgment work. On the input side, this means the system guides the human through process definition. On the execution side, this means the system monitors quality and only escalates what matters.

---

## Five Patterns for Calibrating Human Attention

### Pattern 1: Confidence-Based Routing (Per-Output Self-Assessment)

**How it works:** Each output is scored on confidence/risk. High-confidence outputs auto-advance. Low-confidence outputs are blocked. Only the uncertain middle band reaches a human.

**Who does this:**

| System | Auto-approve rate | Human review rate | Routing mechanism |
|--------|------------------|------------------|-------------------|
| TikTok content moderation | ~85% auto-removed + ~10% auto-approved | ~5% uncertain band | ML confidence score, three-band model (>0.7 auto-act, 0.3-0.7 human, <0.3 auto-approve) |
| Insurance underwriting (STP) | 75-90% straight-through | 10-25% | Risk score + complexity + policy value |
| AML transaction monitoring | 65-85% auto-resolved | 15-35% | Risk score + rule triggers |
| Claude Code (Anthropic research, approximate) | ~85% autonomous | ~15% routed to human | Task complexity + confidence + user trust level |

**The mechanism:** The agent producing the output also assesses its own confidence. This is not the same as the trust tier (which is process-level, historical). Confidence is per-output, per-invocation: "I'm 95% sure this invoice reconciliation is correct" vs "I'm 60% sure — the amounts are close but the descriptions don't match well."

**Gap in Agent OS:** Trust tiers operate at the process level — a spot-checked process reviews ~20% of outputs, selected by deterministic sampling (SHA-256 hash). This means the sampling is random, not informed. A routine output and a weird output have the same probability of being reviewed. Confidence-based routing would let the agent flag uncertain outputs regardless of the sampling schedule.

**Sources:** TikTok transparency reports, Swiss Re underwriting automation research, Anthropic "Measuring Agent Autonomy" (Feb 2026), Visa fraud monitoring program documentation.

---

### Pattern 2: Batch/Digest Review (Periodic, Not Per-Output)

**How it works:** Instead of interrupting the human per output, the system accumulates outputs and presents them as a batch — on a schedule, at a threshold, or on demand.

**Who does this:**

| System | Batch mechanism | Human interaction |
|--------|----------------|-------------------|
| GitHub Copilot Coding Agent | Agent works autonomously, produces a draft PR with all changes | Human reviews the PR (batch artifact) at their convenience |
| Zapier Digest | First-class batching feature — collects items across automation runs, releases on schedule (daily/weekly) | Human reviews the digest, not individual items |
| Devin Session Insights | Post-hoc analysis of completed session with issue timeline and metrics | Human reviews the "report card" after autonomous work |
| Daily email digests (Jira, Confluence, Notion) | Summarise activity into a single notification | Human scans the summary |
| AML transaction monitoring | Low-risk alerts batched for periodic review, not real-time | Analyst reviews batch during scheduled review window |

**The mechanism:** The human's review cadence is decoupled from the agent's execution cadence. The agent runs on its heartbeat. The human reviews on their schedule. The system accumulates, prioritises, and presents.

**Agent OS has the foundation:** The Daily Brief (Primitive 1) is already designed as a digest — "here's what happened overnight, here's what needs your attention today." But the Review Queue (Primitive 5) is designed as a per-item approval surface. The gap is the space between these two: a mode where routine outputs accumulate silently and are presented as a batch summary, not as individual review items.

**Architectural note:** The architecture spec defines the Review Queue as "the single most important UI element" and "the human's primary workspace." Adding a digest mode is not just a feature addition — it redefines the Review Queue's scope from purely item-level review to a dual-mode surface. The Architect should evaluate whether this broadens Primitive 5 or warrants a separate primitive.

**Key design question:** Should the Review Queue have two modes?
- **Active review** (current design) — individual items, approve/edit/reject each one. Used for supervised and spot-checked processes, and for any output the agent flagged as uncertain.
- **Digest review** — accumulated outputs presented as a summary with metrics. Used for autonomous processes. Human scans the summary, drills into exceptions. "Your invoice reconciliation ran 12 times this week. All within parameters. 0 exceptions. [View details]"

**Sources:** GitHub Copilot Coding Agent blog, Zapier Digest documentation, Devin Session Insights documentation.

---

### Pattern 3: Management by Exception (Threshold-Based Escalation)

**How it works:** The system monitors metrics continuously and only alerts the human when outcomes deviate from expected thresholds. Silence IS the signal that things are working.

**Who does this:**

| System | Exception mechanism | Silence meaning |
|--------|-------------------|-----------------|
| PagerDuty Event Intelligence | ML filters 98% of alerts as noise; only genuinely actionable incidents reach humans | If you're not paged, everything is fine |
| Waymo fleet response | Vehicles contact humans only when encountering ambiguous situations; "vast majority resolved without assistance" | Vehicle operating normally |
| SPC control charts (manufacturing) | Western Electric run rules detect statistical anomalies; no alert = process in control | Process running within control limits |
| Autonomous driving (SAE Level 4) | System handles its own failures within defined domain; human only needed outside operational design domain | System managing itself |

**The formal management science:** Management by Exception (MBE) has two variants:
- **Active MBE:** Manager proactively monitors dashboards/metrics and intervenes when deviation is detected. Maps to Agent OS's Process Card health indicators and Performance Sparklines.
- **Passive MBE:** Manager only acts when problems are brought to their attention. Maps to exception-only alerts from autonomous processes.

**The Hersey-Blanchard progression:** Situational Leadership maps directly to trust tiers:
- S1 (Telling) → Supervised: high direction, review everything
- S2 (Coaching) → Spot-checked: high direction on flagged items, support on the rest
- S3 (Participating) → early Autonomous: low direction, human available for consultation
- S4 (Delegating) → mature Autonomous: exception-only, human reviews summaries

**Gap in Agent OS:** The architecture describes trust tier downgrades when error rates exceed thresholds (correction rate >30%, any rejection, auto-check failure >20%). These are the "exception" triggers. But the current design surfaces these as individual events in the Review Queue. The MBE pattern suggests they should surface as **process-level alerts** — "Invoice Reconciliation has degraded: correction rate hit 35% over last 10 runs" — not as individual flagged outputs.

**Sources:** PagerDuty AIOps documentation, Waymo Fleet Response blog (Oct 2024), Splunk alert fatigue best practices, Hersey-Blanchard Situational Leadership (toolshero.com).

---

### Pattern 4: Adaptive Sampling (Earned Reduced Inspection)

**How it works:** The review sampling rate is not fixed — it adapts based on demonstrated quality. Consecutive successes earn reduced inspection. Any failure resets to full inspection.

**Who does this:**

| System | Mechanism | Trust earning | Trust loss |
|--------|-----------|--------------|------------|
| ISO 2859-1 (acceptance sampling) | Three-state switching: Normal → Tightened → Reduced → Discontinued | 10 consecutive clean lots + switching score → Reduced | 2-of-5 failures → Tightened; 5 consecutive under Tightened → Discontinued |
| Skip-lot sampling (NIST SkSP-2) | After qualifying streak, skip entire lots — inspect only fraction f | 10-15 consecutive lots accepted → inspect 1-in-5 | Any single failure → revert to 100% inspection |
| FDA pharmaceutical QA | Sampling frequency calibrated to demonstrated process capability | Well-validated process earns reduced monitoring | Process deviation triggers increased monitoring |
| Agent OS trust tiers (current) | Fixed rates: supervised=100%, spot-checked=20%, autonomous=exceptions | Conjunctive upgrade conditions (ADR-007) | Disjunctive downgrade triggers (ADR-007) |

**Agent OS already has this** via trust tiers and ADR-007's switching rules. The ISO 2859 switching rules validate the approach — Agent OS's "10 runs at ≥85% approval" for supervised→spot-checked is in the same family as ISO's "10 consecutive clean lots" for normal→reduced.

**What ISO 2859 adds that Agent OS doesn't have:** The concept of a **fourth state — Discontinued/Suspended** — where the process is halted entirely until the root cause is addressed. Agent OS downgrades to supervised but doesn't have a "suspended" state where the process stops running.

**Also:** ISO 2859's switching is based on consecutive successes (streak-based), while Agent OS uses a sliding window average. Streak-based is more conservative — one failure breaks the streak regardless of the overall rate. This is worth considering for the upgrade path.

**Sources:** ISO 2859-1 comprehensive guide (testcoo.com), NIST skip-lot sampling handbook, FDA Process Validation guidance, AQL inspection level documentation.

---

### Pattern 5: Autonomy Level Frameworks (The Information Flow Spectrum)

**How it works:** The level of autonomy determines not just who decides, but what information flows to the human and when.

**Sheridan & Verplank's 10 Levels of Automation (1978):**

| Level | Description | Agent OS mapping |
|-------|------------|-----------------|
| 5 | Computer executes if human approves | Supervised tier |
| 6 | Computer executes, human can veto within limited time | — (not in current design) |
| 7 | Computer executes, then informs human | Spot-checked / Autonomous with digest |
| 8 | Computer executes, informs human only if asked | Autonomous with on-demand review |
| 9 | Computer executes, informs human only if it decides to | Autonomous with confidence routing |

**Key insight:** Levels 5-9 are all about the **timing and conditionality of human notification**, not about who makes the decision. Agent OS's trust tiers currently map to levels 5 (supervised) and ~7 (spot-checked). The architecture doesn't yet distinguish between levels 7-9, which represent meaningfully different oversight experiences:
- Level 7: "I did this, FYI" (digest/batch)
- Level 8: "I did this, ask me if you want to know" (on-demand)
- Level 9: "I did this, I'll tell you if I think you need to know" (confidence routing)

**SAE autonomous driving levels:** The critical transition is at Level 3, where the **system** is responsible for knowing when it's out of its depth and escalating. This maps to confidence-based routing — the agent must self-assess and escalate, not rely on random sampling to catch problems.

**Military multi-UAV research:** Optimal operator-to-vehicle ratios are 1:2 to 1:4. Performance degrades significantly above 1:10. This is directly relevant — a human overseeing 20 processes at supervised tier is overloaded. The attention budget is finite, and each process's autonomy level determines how much of that budget it consumes.

**Sources:** Sheridan & Verplank (1978) via ResearchGate, SAE J3016 (synopsys.com), NASA DSA project, PMC multi-UAV control research.

---

## Synthesis: What Agent OS Needs

### What's already right

1. **Trust tiers** — the four-tier model (supervised, spot-checked, autonomous, critical) is sound and validated by every pattern surveyed.
2. **Trust earning algorithm** (ADR-007) — conjunctive upgrade / disjunctive downgrade with grace period is well-aligned with ISO 2859 switching rules and real-world asymmetric trust models.
3. **Implicit feedback capture** — edits-as-feedback is the right approach; real systems confirm that structured feedback forms don't scale.
4. **Daily Brief** — already designed as a digest/summary, which is the right entry point for the "manager experience."
5. **"Auto-approve similar"** in the Review Queue — already designed for trust building through the review surface.

### What's missing (four gaps)

**Gap 1: Per-output confidence scoring**

The agent should self-assess each output and communicate confidence to the harness. The harness uses confidence alongside the trust tier to route:
- High-confidence + autonomous tier → auto-advance, include in digest
- Low-confidence + any tier → route to human review regardless of tier
- Uncertain + spot-checked → included in the sampling pool with higher weight

This is not a redesign of trust tiers. It's a second dimension: trust tiers are process-level and historical; confidence is output-level and per-invocation. The product of both determines the human's experience.

**Gap 2: Batch/digest review mode**

The Review Queue should support two interaction patterns:
- **Item review** (current) — individual outputs, approve/edit/reject. Used when the trust tier or confidence score routes an output to the human.
- **Digest review** — accumulated outputs from autonomous processes presented as a summary. "Invoice reconciliation: 12 runs, 0 exceptions, 100% downstream acceptance." Human scans, drills into detail if curious. No action required unless something looks wrong.

The Daily Brief already does this at the day level. Digest review does it at the process level, available on demand or on a configurable cadence.

**Gap 3: Process importance classification**

Not all processes should earn autonomy at the same rate or be reviewed at the same cadence. A content draft and a financial reconciliation have different blast radii. The architecture has the `critical` tier (never upgrades), but there's no explicit importance/risk classification that modulates the oversight model for non-critical processes.

Factors from the research:
- **Reversibility** — can the output be undone? (Email sent vs. draft saved)
- **Blast radius** — how much damage can a bad output cause? (Internal report vs. client-facing quote)
- **Novelty** — is this a routine run or a new input pattern? (Same supplier vs. new supplier)
- **Cost of delay** — does adding a review step slow things unacceptably? (Time-sensitive vs. batch)

These could be declared per-process (like trust tier is today) or inferred from process characteristics.

**Gap 4: Process-level health alerts (not just output-level review)**

When a process degrades, the human should see a process-level alert — "Invoice Reconciliation accuracy dropped 15% this week" — not just individual flagged outputs appearing in the queue. This is the Management by Exception pattern: monitor metrics, alert on deviation, leave the human alone when metrics are within bounds.

The architecture already describes this in Layer 5 (Learning — performance decay detection) and the Improvement Card (Primitive 13). The gap is making this the *primary* escalation mechanism for autonomous processes, rather than the Review Queue.

### The attention model (new concept)

These four gaps point to a missing architectural concept: the **attention model** — how the system decides when, how, and in what form to pull the human in.

| Trust tier | Default attention mode | Override triggers |
|------------|----------------------|-------------------|
| **Supervised** | Item review — every output in Review Queue | None (this is the starting state) |
| **Spot-checked** | Item review for sampled outputs + digest for the rest | Low confidence → item review regardless of sample |
| **Autonomous** | Digest only — summary in Daily Brief, detail on demand | Low confidence → item review; metric deviation → process alert; auto-downgrade → supervised |
| **Critical** | Item review — every output, always | None (architectural invariant) |

The attention model is the missing link between trust tiers (which determine oversight *rate*) and the human experience (which determines oversight *form*). Trust tiers answer "how often?" The attention model answers "in what form?" Together they determine whether Agent OS feels like a noisy approval queue or a quiet workspace that pulls you in when it matters.

### Concrete numbers as targets

From real systems, a practical equilibrium for mature processes:
- **~15% human review rate** for mixed workloads (approximate, from Anthropic Claude Code usage research — directional, not a design target without further validation)
- **75-90% auto-advance rate** for well-understood, routine processes (insurance STP)
- **~5% human review** for high-volume, well-calibrated processes (content moderation)
- **0% routine review** for autonomous processes — digest only, exception alerts

---

## Relationship to Existing Architecture

| Existing concept | Status | Research finding |
|-----------------|--------|-----------------|
| Trust tiers (L3) | Validated | Aligned with ISO 2859, Hersey-Blanchard, SAE levels |
| Trust earning (ADR-007) | Validated | Switching rules match ISO 2859 pattern |
| Review Queue (L6) | Needs evolution | Should support both item review and digest modes |
| Daily Brief (L6) | Validated | Already the right pattern for digest-level oversight |
| Improvement Card (L6) | Validated | Right pattern for process-level health alerts |
| Layer 5 Learning | Needs extension | Should drive the attention model, not just improvement proposals |
| Process definition (L1) | Needs extension | Should include importance/risk classification |
| Agent confidence | Missing | New concept: per-output self-assessment by the executing agent |
| Attention model | Missing | New cross-cutting concept linking trust tiers to notification form |

---

## Options for the Architect

This research presents findings, not recommendations. The Architect should evaluate:

1. **Where does the attention model live?** Cross-cutting (like governance) or within L3 (Harness) or L6 (Human)?
2. **Should per-output confidence be an agent responsibility or a harness responsibility?** The agent knows its own uncertainty; the harness knows the process history. Both have information.
3. **Should importance classification be declared per-process or inferred?** Declared is simpler and more transparent. Inferred is less burden on the user.
4. **Should digest review be a separate primitive or a mode of the Review Queue?** Adding a mode keeps the primitive count at 16. A separate primitive might be cleaner.
5. **When should these gaps be addressed?** Phase 4 (Workspace Foundation) is the next build phase. Some of these concepts (attention model, digest mode) are foundational to the workspace experience. Others (per-output confidence) may be better deferred until the agent layer is more mature.

---

## Provenance

| Pattern | Source | Relevance |
|---------|--------|-----------|
| Three-band confidence routing | TikTok, YouTube, Meta content moderation | HIGH — per-output routing |
| Straight-through processing | Insurance underwriting (Swiss Re, RGA) | HIGH — importance-based auto-advance |
| ISO 2859 switching rules | International standard for acceptance sampling | HIGH — validates trust tier transitions |
| Skip-lot sampling | NIST SkSP-2 | MEDIUM — earned reduced inspection |
| SPC Western Electric rules | Manufacturing quality control | MEDIUM — anomaly detection for process drift |
| Management by Exception | Management science (active/passive MBE) | HIGH — formal name for the oversight pattern |
| Hersey-Blanchard Situational Leadership | Leadership theory | HIGH — maps directly to trust tier progression |
| Sheridan & Verplank 10 Levels | Human-machine interaction (1978) | HIGH — information flow spectrum |
| SAE J3016 autonomous driving | Automotive industry standard | MEDIUM — system self-assessment escalation |
| PagerDuty Event Intelligence | DevOps/SRE | MEDIUM — 98% noise reduction via ML filtering |
| Zapier Digest | Automation platform | MEDIUM — batch review as first-class feature |
| GitHub Copilot Coding Agent | Developer tools | MEDIUM — PR as batch artifact pattern |
| Waymo fleet response | Autonomous vehicles | MEDIUM — question-and-answer exception model |
| AML transaction monitoring | Financial compliance | MEDIUM — tiered response by risk score |
| FDA pharmaceutical QA | Regulated industry | LOW — validates risk-based sampling |
| Military multi-UAV control | Defence research | LOW — attention budget across multiple agents |
| Anthropic Claude Code research | AI agent empirical data | HIGH — only empirical data on agent oversight frequency evolution (~15% review equilibrium) |
