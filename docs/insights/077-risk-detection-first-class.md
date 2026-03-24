# Insight-077: Risk Detection is a First-Class Concept, Not Just Exception Handling

**Date:** 2026-03-24
**Trigger:** User observation during Phase 10 design review: "Risk-based thinking is critical — users should be introduced to it. Should Ditto be flagging risks being detected?"
**Layers affected:** L3 Harness (risk as a check type), L4 Awareness (cross-process risk patterns), L6 Human (risk surfacing in Self), Conversational Self (ADR-016)
**Status:** active

## The Insight

The engine currently handles quality (criteria checks), trust (progressive oversight), and exceptions (failures, anomalies). But **risk** — the probability of something going wrong that hasn't gone wrong yet — is not a first-class concept. It should be.

Risk detection is fundamentally different from exception handling:

| Concept | When it fires | What it tells you |
|---------|--------------|-------------------|
| **Exception** | Something went wrong | "The supplier API failed" |
| **Quality check** | Output doesn't meet criteria | "The margin is below 20%" |
| **Risk** | Something *could* go wrong based on patterns | "Your bathroom estimates have been low 3 times — the next bathroom quote is at risk of being underpriced" |

Exceptions are reactive. Quality checks are per-run. **Risk is predictive and cross-cutting.** It connects patterns across time, across processes, and across the user's business to surface threats before they materialise.

But risk is broader than "will the process fail." There are three distinct layers:

| Layer | Question | Signal source |
|-------|----------|---------------|
| **Operational risk** | "Will the work execute correctly?" | Process health: correction rates, data freshness, integration reliability, quality drift |
| **Effectiveness risk** | "Is the work actually achieving what it should?" | Outcome data: did the quote win? Did the content drive traffic? Did the hire work out? The process runs fine but isn't delivering real-world results. |
| **Strategic risk** | "Are the fundamentals of the user's approach sound?" | Cross-process patterns: 80% reactive / 20% growth ratio. Three biggest clients haven't reordered in 60 days. No customer-facing processes at all. The risk isn't to any one process — it's to the business strategy the processes serve. |

Most systems only handle operational risk. Effectiveness risk requires closing the loop between "process completed" and "outcome achieved" — tracking what happened in the real world after Ditto's work was delivered. Strategic risk requires the Self to reason across *all* of the user's work, not just individual processes, and compare against what businesses like theirs typically need (Insight-078: Standards Library).

**The gap between process health and outcome health is where the most valuable risks live.** A process with perfect quality metrics that consistently produces quotes the client rejects is a bigger risk than a process with a rising correction rate. The system can see both — but only if risk is modelled across all three layers.

### Why This Matters for Our Personas

Our personas' core anxiety is "things going wrong silently." They've been burned by delegation failures. Risk detection directly addresses this — the system doesn't just catch problems, it anticipates them:

**Rob:**
- *Operational:* "Your bathroom labour estimates have been low 3 times — the next bathroom quote is at risk of being underpriced" (pattern risk)
- *Operational:* "Henderson hasn't responded in 4 days — risk of losing the job" (temporal risk)
- *Effectiveness:* "Your last 4 quotes were technically accurate but your win rate has dropped from 60% to 35% — the quotes might be right but something about how they're landing has changed" (outcome gap)
- *Strategic:* "You're spending 3x more time on maintenance quotes than new business — that's shifted over the last two months" (balance risk)

**Lisa:**
- *Operational:* "Your product descriptions haven't mentioned sustainability for the last 5 — risk of brand voice drift" (quality drift)
- *Effectiveness:* "You've published 12 new product descriptions this month but conversion rate hasn't moved — the content quality is good but something else is the bottleneck" (effort-result mismatch)
- *Strategic:* "Holiday season is 6 weeks out but no seasonal content process is set up — businesses like yours typically start this 8 weeks out" (coverage gap, informed by standards library)
- *Strategic:* "All your content processes are about products — there's nothing for customer retention. Similar businesses typically have at least a post-purchase nurture" (capability gap)

**Jordan:**
- *Operational:* "The reference checking API changed schema last week — risk of the HR process failing on the next run" (integration risk)
- *Effectiveness:* "Finance reconciliation runs perfectly but the team is still doing manual spot-checks on everything — the process isn't earning trust in practice" (misaligned success)
- *Strategic:* "You've built 8 processes for back-office functions and zero for client-facing work — your operation is efficient internally but clients don't feel it" (balance risk)

**Nadia:**
- *Operational:* "Chen's correction rate is climbing — 3 of the last 5 needed fixes" (quality drift)
- *Effectiveness:* "The team is producing more reports but client satisfaction scores haven't improved — volume isn't the lever" (effort-result mismatch)
- *Strategic:* "Two of your three biggest clients haven't placed new work in 60 days — that's unusual for this time of year" (concentration risk)

### Risk Categories

The system should detect and surface risks across all three layers:

**Operational risks** — will the work execute correctly?

| Category | Signal | Example |
|----------|--------|---------|
| **Pattern risk** | Repeated corrections trending in one direction | Labour estimates consistently low for a job type |
| **Temporal risk** | Items aging without action, deadlines approaching | Quote unanswered, payment overdue, deadline near |
| **Data staleness risk** | Inputs haven't been refreshed, external data changed | Price list outdated, API schema changed, competitor moved |
| **Quality drift risk** | Gradual degradation in output quality over time | Correction rate climbing, downstream rejection increasing |
| **Integration risk** | Connected systems changed or became unreliable | API errors increasing, schema changes, service degradation |
| **Cross-process risk** | One process's output affects another's quality | Stale data flowing downstream, conflicting outputs from parallel processes |

**Effectiveness risks** — is the work achieving real-world results?

| Category | Signal | Example |
|----------|--------|---------|
| **Outcome gap risk** | Process outputs are good but real-world results are poor | Quotes win rate declining despite quality metrics being stable |
| **Effort-result mismatch** | Work volume increasing but outcomes flat or declining | More content published but traffic/conversion unchanged |
| **Diminishing returns risk** | Each additional run/correction produces less improvement | Follow-up emails getting longer but response rate unchanged |
| **Misaligned success risk** | Process optimising for the wrong metric | Quote process optimised for speed but margin is what matters |

**Strategic risks** — are the fundamentals of the user's approach sound?

| Category | Signal | Example |
|----------|--------|---------|
| **Coverage gap risk** | Business area has no process or inadequate process | No customer-facing processes at all; seasonal prep missing |
| **Balance risk** | Work allocation skewed in a potentially harmful way | 80% reactive / 20% growth; all processes serve one client segment |
| **Concentration risk** | Over-dependence on few clients, channels, or processes | Three biggest clients = 70% of revenue, none reordered in 60 days |
| **Competitive risk** | External signals indicating market shift | Competitor pricing, new entrant, regulation change |
| **Capability gap risk** | User's operation lacks processes that similar businesses run | Standards library (Insight-078) shows peers have X — user doesn't |
| **Strategy drift risk** | Day-to-day work has gradually diverged from stated goals | User said growth is priority but all new processes are maintenance |

### How Risks Surface

Risks are NOT a separate risk dashboard or a risk register. They surface through the Self as part of the proactive attention model (Insight-076):

> Self: "Morning Rob. Henderson quote first — they called yesterday. One thing to watch: copper prices are up 8% since your last quote but your price list hasn't been updated. I'll use the latest prices for Henderson, but your next few quotes might be at risk of low margins until I update the full list. Want me to do that now?"

The Self weaves risks into the briefing alongside focus, attention, opportunities, coverage, and upcoming items. Risk is a lens that cuts across all five proactive dimensions, not a sixth dimension.

### How Risks Are Detected

Risk detection is an engine capability, not a UI concern. Each risk layer maps to different engine capabilities:

**Operational risks (L3 Harness + L4 Awareness):**
1. **Harness layer (L3):** Each process run produces quality check data. The harness tracks trends — a rising correction rate is a quality drift risk signal.
2. **Awareness layer (L4):** Cross-process pattern recognition detects when one process's output quality affects another. Integration health monitoring detects API/data changes.

**Effectiveness risks (L5 Learning + outcome data):**
3. **Learning layer (L5) + outcome tracking:** This requires closing the feedback loop — knowing not just "did the process run well?" but "did the outcome work in the real world?" Sources: user-reported outcomes ("we won the Henderson job"), integration data (CRM win/loss, analytics metrics, payment received), or absence of data (no response after 2 weeks = probable loss). Pattern extraction across outcome data identifies effectiveness risks — "quotes are passing quality checks but win rate is declining."

**Strategic risks (Self + standards library):**
4. **Self (L6) + cross-process reasoning:** The Self reasons across all the user's work — not just individual processes. It detects balance shifts, concentration patterns, coverage gaps, and strategy drift by comparing work allocation patterns against the user's stated goals and against community baselines (Insight-078: Standards Library). Strategic risk detection is uniquely the Self's domain — no individual process can see its own strategic context.

The key architectural implication: operational risks flow *up* from the engine. Strategic risks flow *down* from the Self. Effectiveness risks require *outside* data — real-world outcomes that close the loop.

### Risk Severity and Tone

Risks should be surfaced proportionally — not every risk is urgent:

| Severity | Self tone | Example |
|----------|-----------|---------|
| **Watch** | Mentioned in passing | "By the way, copper's up a bit — I'll adjust" |
| **Flag** | Highlighted, action suggested | "Your correction rate is climbing. Might be worth looking at the baseline numbers Chen's using." |
| **Alert** | Prominent, action needed | "The supplier API has been unreliable for 3 days. Risk of missing tomorrow's morning updates. Want to switch to the backup?" |

The Self never uses "risk" as a label with the user (Insight-073). Instead: "something to watch," "heads up," "you might want to check," "there's a chance that..."

### What This Teaches Users

Over time, the Self's risk surfacing teaches the user to think in risk terms without using the word "risk." They learn:

- To look for leading indicators, not just lagging ones
- That correction patterns predict future problems
- That aging items and stale data are warning signs
- That gaps in coverage are risks, not just "things we haven't got to yet"
- That the system is watching for them — the core anxiety ("what if something goes wrong silently?") is addressed

This is the "firm, not playbook" principle applied to risk: Ditto doesn't give the user a risk management methodology. It bakes risk thinking into the daily experience until the user naturally thinks that way.

## Implications

- **Architecture:** Risk is three-layered (operational, effectiveness, strategic), not one concept. Each layer has different signal sources and detection mechanisms. Operational risks flow up from the engine. Strategic risks flow down from the Self. Effectiveness risks require outside data.
- **Outcome tracking:** Effectiveness risk requires a new data loop — knowing what happened after the process delivered. This connects to Process I/O (Brief 036) and integrations: CRM data, analytics, payment confirmations, client responses. The system should be able to ask "did that work?" and learn from the answer.
- **Process schema:** Risk criteria could be added to process definitions alongside quality criteria — "flag when correction rate exceeds X" or "alert when this data source is more than N days old." Outcome tracking could be a process-level declaration — "track win/loss on quotes."
- **Self tools:** The Self needs a `detect_risks` tool or the ability to consume risk signals from the engine. But strategic risk detection is the Self's native capability — it reasons across all work, compares against standards (Insight-078), and detects pattern shifts that no individual process can see.
- **Standards library (Insight-078):** Provides baselines for all three risk layers. Operational: "typical correction rate for this process type." Effectiveness: "typical win rate for quotes in this sector." Strategic: "businesses like yours typically have processes for X, Y, Z."
- **Feed items:** Risk-related information appears in existing feed card types (woven into shift report, flagged on review items, surfaced as insights) — no separate "risk card" type needed.
- **MVP scope:** Basic operational risk detection (temporal, data staleness, pattern trends) should be in the MVP. Effectiveness risk requires outcome tracking infrastructure — can start simple ("did this work? yes/no" after delivery). Strategic risk requires enough processes to reason across — meaningful after 3+ processes are active.

## Where It Should Land

- **architecture.md** — risk as a three-layered concept: operational (L3/L4), effectiveness (L5 + outcomes), strategic (Self). Not just a harness concern.
- **Phase 10 MVP brief** — risk surfacing through the Self and in feed items. Operational risk in MVP; effectiveness risk when outcome tracking exists; strategic risk when 3+ processes active.
- **ADR-011** — risk signals as a factor in attention/notification priority
- **Process schema** — risk criteria alongside quality criteria. Outcome tracking declarations.
- **human-layer.md** — risk surfacing patterns within the Self's proactive behaviour model
- **Insight-078** — Standards Library provides baselines for all three risk layers
- **Future ADR** — Outcome tracking loop as an architecture concept (connecting process delivery to real-world results)
