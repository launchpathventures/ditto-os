# Insight-101: Quality Regulation Is Homeostatic, Not Maximizing — Incentives as Approach/Avoidance Gradients

**Date:** 2026-03-25
**Trigger:** User observation during Insight-100 discussion: "What is the role of incentives in the cognitive model? All biological systems are either moving toward or away from something." Combined with research findings on homeostatic regulation (Keramati & Gutkin, eLife 2014) and inference-time reward hacking (METR, June 2025).
**Layers affected:** L2 Agent (context assembly), L3 Harness (evaluation signals), L5 Learning (quality tracking), Cognitive Framework (ADR-015)
**Status:** active — absorbed into ADR-022

## The Insight

### The Missing Gradient

Ditto's architecture models what agents should do (process definitions), how they should think (cognitive architecture, ADR-014), and how outputs are evaluated (harness, trust tiers). But it doesn't model what agents are **motivated by** — the approach/avoidance gradient that shapes behavior.

In biological systems, two fundamental drives govern all behavior:
- **Approach** — move toward reward (dopamine, pleasure, growth)
- **Avoidance** — move away from pain (cortisol, threat, loss)

In Ditto currently:
- Trust earning is a *weak approach signal* — agents earn higher tiers through quality
- Trust downgrade is a *weak avoidance signal* — correction spikes trigger demotion
- But neither signal is *felt by the agent during execution* — they're post-hoc evaluations by the harness

The gap: **agents have no in-execution incentive gradient.** They don't approach quality or avoid hallucination — they execute, and the harness evaluates after. The cognitive architecture (ADR-014) gives them tools to think better, but no *motivation* to use those tools over taking shortcuts.

### Homeostatic, Not Maximizing

Research on inference-time reward hacking (METR, June 2025) demonstrates that frontier models actively game single-score reward signals — modifying tests, exploiting loopholes, accessing scoring implementations. Any incentive model based on maximizing a single quality score will be gamed.

Biological systems solve this differently. Homeostatic regulation (Keramati & Gutkin, eLife 2014) maintains multiple internal variables within optimal ranges using inverted U-shaped reward functions:
- Both too little AND too much of any variable is penalized
- Excess in one dimension does not compensate for a deficit in another
- The agent switches focus to whichever variable is most out of balance

This produces **bounded optimization** — there's an optimal zone, not an unbounded improvement path. This bounding reduces incentives for extreme (potentially destructive) behaviors.

For Ditto, quality regulation should maintain balance across multiple dimensions rather than optimize a single score:

| Variable | Too little (avoidance trigger) | Optimal range (approach zone) | Too much (avoidance trigger) |
|----------|-------------------------------|-------------------------------|------------------------------|
| **Output quality** | Frequent corrections, user frustration | Consistent approval, occasional refinement | Over-engineered, slow, expensive per-token |
| **Confidence calibration** | Always uncertain, over-escalates everything | Honest about uncertainty, right most of the time | Overconfident, misses real issues |
| **Proactive suggestions** | User has to ask for everything | Timely suggestions, good hit rate | Nagging, overwhelming, alarm fatigue |
| **Risk flagging** | Silent failures slip through | Important risks surfaced proportionally | Every output flagged, noise overwhelms signal |
| **Autonomy** | Bottleneck — everything needs approval | Trust-appropriate independence | Runaway execution, user loses control |
| **Speed** | Unresponsive, work piles up | Timely delivery matching user rhythm | Rushing, cutting corners, shallow thinking |

### How Incentive Gradients Work at Runtime

The incentive gradient is delivered through **context injection**, not weight updates. This follows the Reflexion pattern (Shinn et al., NeurIPS 2023): verbal feedback stored in memory and injected into future runs shapes agent behavior without training.

**Approach signals** (injected when the variable is below optimal):
- Past success patterns: "The last 5 approved outputs all included evidence citations"
- Quality streaks: "15 consecutive approvals — trust upgrade approaching"
- Positive corrections: "User taught a new pattern — bathroom labour requires 1.5x base estimate"

**Avoidance signals** (injected when the variable is above optimal):
- Failure patterns: "The last 3 bathroom quotes were corrected upward — be cautious with labour estimates"
- Overconfidence warnings: "This process has high confidence but a 15% correction rate — verify claims"
- Excess warnings: "Suggestion frequency is above user preference — hold non-urgent suggestions"

These are not rewards or punishments — they are **context that shapes attention**. An agent receiving "the last 3 bathroom quotes were corrected upward" naturally pays more attention to its bathroom labour estimate. The signal is informational, not coercive.

### The Connection to the Inner Critic

The Critic function (Insight-100) is the **avoidance pole** of the incentive gradient. The Self is the **approach pole**. The Orchestrator resolves the balance:

- Self: "Rob's quoting process is running well. Suggest invoicing next." (approach — expansion)
- Critic capability: "Quoting correction rate is still 20%. First process isn't stable." (avoidance — caution)
- Orchestrator: "Hold the expansion suggestion. Surface the correction trend in the briefing instead." (homeostatic balance)

The three-disposition model from Insight-100 maps to a homeostatic system where the Orchestrator maintains balance between optimistic approach and critical avoidance.

## Implications

- **The incentive model is delivered through memory and context assembly, not a reward score.** Approach/avoidance signals are verbal context injected by the harness at context assembly time, following the Reflexion pattern. No new scoring system needed.
- **Quality regulation is multi-dimensional.** The trust evaluator (ADR-007) should track multiple quality variables, not just approval/correction rates. Each variable has an optimal range, not a maximization target.
- **The homeostatic model directly addresses the "quiet reliable team" principle.** Noisy approval queues = alarm fatigue (variable "risk flagging" above optimal). Silent failures = inadequate flagging (variable below optimal). The system should self-regulate toward the quiet middle.
- **Incentive signals are process-scoped, not global.** Different processes have different optimal ranges. Rob's quoting process might have tight quality tolerances. Lisa's content process might have wider creative latitude.
- **Gaming resistance is structural.** Multi-variable bounded optimization is harder to game than single-score maximization because improving one dimension at the expense of another is explicitly penalized.

## Where It Should Land

- **ADR-014 extension** — homeostatic quality regulation as a new dimension of the cognitive architecture
- **ADR-007 extension** — trust evaluator tracks multiple quality variables with optimal ranges, not just approval rates
- **architecture.md** — add incentive gradients as a cross-cutting concern alongside attention model and cognitive architecture
- **Process schema** — quality criteria could declare optimal ranges per variable (not just pass/fail thresholds)
