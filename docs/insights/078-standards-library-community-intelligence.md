# Insight-078: Standards Library — The Learning Loop's External Benchmark

**Date:** 2026-03-24
**Trigger:** User observation during PM triage: "introduce a standards library for what good process agents and outcomes/outputs look, sound, feel like — potentially a shared community resource." Extended: "Standards are what the learning and evolution loop uses when it goes looking externally before creating, defining, or improving something."
**Layers affected:** L2 Agent (toolkit/cognitive context), L3 Harness (quality gates, risk baseline), L5 Learning (pattern extraction, community feedback, evolution loop), L6 Human (trust calibration, output evaluation)
**Status:** active

## The Insight

Ditto's core dev principles are: research before design, composition over invention, benchmark before keep. These aren't just how Ditto gets *built* — they're the principles for how Ditto should *run*.

When the Learning layer (L5) detects a correction pattern and goes to improve a process, it should do what the Dev Researcher does: **scout the gold standard before proposing a change.** When a new process is being created, the system should check what excellent looks like for this type of work *right now*, not just use whatever defaults were baked in at ship time. When the metacognitive check evaluates an agent's output, it should evaluate against current best practice, not a frozen rubric.

The standards library is the runtime expression of "research before design." It ensures that every component of the system — agents, processes, quality gates, risk detection — operates against the latest knowledge about what good looks like, not just its own history.

This is fundamentally different from a static quality checklist. It's a **living benchmark** that the learning and evolution loop consults before creating, defining, or improving anything. The same way a great firm brings current market intelligence to every engagement, Ditto brings current standards intelligence to every process run, every improvement proposal, every new process creation.

Ditto already has the mechanics: `quality_criteria` on process definitions, `feedback.metrics` with targets, trust tiers with upgrade thresholds, the metacognitive check, and skills packages (Insight-069). But these are all *per-process, per-deployment* — each Ditto instance defines its own standards from scratch, and they stay frozen at creation time unless manually updated.

What's missing is a **standards library**: a living, evolving body of knowledge about what good looks like — consulted at the point of creation, evaluation, and improvement. Not just "did it pass?" but "what does excellent look like right now, based on the latest knowledge and wisdom?"

### Three Layers of Standards

**1. Agent behaviour standards — how good agents work**

What distinguishes a high-quality agent execution from a mediocre one, independent of the specific output:

- **Reasoning patterns:** Does the agent decompose the problem before acting? Does it consider alternatives? Does it flag uncertainty honestly?
- **Tool use patterns:** Does it gather context before generating? Does it verify its outputs? Does it use tools efficiently (not redundant calls)?
- **Communication patterns:** Is the output structured for the human's decision, not just "here's what I did"? Does it distinguish confidence levels? Does it lead with the decision, not the process?
- **Failure patterns:** Does it fail gracefully? Does it escalate clearly? Does it avoid confident-sounding wrong answers?

These are agent-agnostic — they apply whether the agent is writing code, reviewing content, or reconciling invoices. The cognitive architecture (ADR-014) provides the *mechanism* (toolkit, reflection); the standards library provides the *content* (what good looks like when using those mechanisms).

**2. Output standards — what good outputs look, sound, feel like**

Per-domain, per-output-type quality patterns:

- **Content review outputs** should: cite specific phrases not vague feedback, distinguish blocking issues from suggestions, provide a clear recommendation
- **Financial outputs** should: show their working, flag assumptions, include confidence ranges on estimates
- **Quote/proposal outputs** should: address the client's stated need (not template-fill), flag items where pricing is estimated vs confirmed, include expiry
- **Research outputs** should: cite sources, distinguish facts from interpretations, flag gaps in coverage
- **Code outputs** should: follow existing patterns, include tests for new behaviour, not over-engineer

These are the standards that Insight-069 (skills packages) would deliver at the agent level — but packaged as learnable, auditable, shareable criteria rather than opaque agent behaviour.

**3. Process standards — what good processes look like**

Patterns for process design that correlate with successful outcomes:

- **Decomposition patterns:** When to break a step into sub-steps, when to keep it atomic
- **Review placement:** Where human checkpoints add value vs create bottleneck
- **Trust calibration:** Starting trust levels by domain and risk (financial processes start supervised, content processes can start spot-checked)
- **Feedback loop design:** What to capture, what metrics to track, what thresholds trigger action
- **Risk criteria:** What risks are relevant per process type (ties directly to Insight-077)

### Standards as the Learning Loop's Output

Standards aren't a separate system — they're what the learning loop produces when it looks outward. The same way Ditto's dev process works:

| Dev process principle | Runtime equivalent |
|----------------------|-------------------|
| Research before design → Dev Researcher scouts gold standard | Learning loop scouts current standards before proposing improvements |
| Composition over invention → build from existing | New processes inherit current best-practice defaults, not blank slates |
| Benchmark before keep → handlers justify their place | Quality gates and risk thresholds are calibrated against what's achievable, not arbitrary |
| Plan before build → define the framework | Process creation starts with "what does good look like for this type of work?" |

The learning loop (L5) currently looks inward: correction patterns, feedback trends, performance data. Standards extend it to look outward: what is the current gold standard for this type of agent behaviour, this type of output, this type of process?

### Three Scopes of Standards Evolution

**Built-in standards** — Ditto ships with knowledge about what good looks like, drawn from research and first principles. These are the starting point — the system's day-one intelligence about quality.

**Personal standards** — Each Ditto instance accumulates feedback. Corrections, overrides, and explicit "teach this" moments refine the standards for this user's context. "Rob always wants supplier names in quotes, never codes" becomes a personal standard. The learning loop incorporates these into the user's instance.

**Community standards** — Across Ditto instances, the learning loops converge. If 80% of users with content review processes converge on the same quality criteria refinements, that's community intelligence. The library evolves not through prescriptive editorial but through aggregated learning:

- **Correction convergence:** When many users make the same correction, the standard absorbs it
- **Quality metric benchmarking:** "Content review processes typically achieve 85% accuracy by run 20" — gives new users a baseline
- **Risk pattern sharing:** "Invoice reconciliation processes commonly encounter data staleness after 7 days" — pre-loaded risk criteria from community experience (Insight-077)
- **Template evolution:** Process templates in `templates/` become community-informed, not just hand-authored
- **Approach evolution:** When new techniques or tools emerge, the standards update — every process benefits, not just new ones

This is the compound intelligence flywheel: each user's corrections make the standards smarter → smarter standards make new users' processes better from day one → better starting points mean higher quality corrections → the library improves faster. And critically, the standards themselves evolve — they're not frozen at any point in time. The learning loop keeps consulting external knowledge, so the definition of "good" tracks with the state of the art.

### Connection to Risk (Insight-077)

Risk detection needs baselines. You can't detect "quality drift" without knowing what quality looks like normally. You can't flag "correction rate climbing" without knowing what a healthy correction rate is for this type of process.

The standards library provides these baselines:
- **Pattern risk:** "Content processes typically have <15% correction rate after 20 runs — yours is at 25%"
- **Quality drift:** "Invoice processes should maintain >90% accuracy — yours has dropped from 94% to 82% over the last month"
- **Coverage gap:** "Businesses in your sector typically have processes for X, Y, Z — you're missing Y"
- **Process design risk:** "Processes without a review step on financial outputs have 3x the downstream correction rate"

Without the standards library, risk detection is limited to trend analysis within the user's own history. With it, risk detection can compare against community baselines — "this is unusual compared to how this type of work typically goes."

### What This Is NOT

- Not a marketplace (no buying/selling)
- Not an app store (not pre-built automations)
- Not a certification programme (no compliance badges)
- Not prescriptive rules (always advisory, never mandatory)
- Not a frozen reference library — it's a living output of the learning loop

It's **the system's continuously updated understanding of what good looks like**, informed by research, refined by use, and shared across instances. The same principle that makes Ditto's dev process strong — always check the gold standard before acting — applied to the running system itself.

## Implications

- **Process schema:** `quality_criteria` and `feedback.metrics` already exist on process definitions. The standards library provides *default values* for these based on process type/domain. Users can override, but they start informed.
- **Agent cognitive context (ADR-014):** Standards for agent behaviour feed directly into the cognitive toolkit layer — "before generating, verify your inputs" is a standard that becomes a cognitive prompt.
- **Trust calibration:** Community baselines inform starting trust tiers and upgrade thresholds — a new content review process can start with thresholds proven across thousands of community instances.
- **Risk detection (Insight-077):** Standards provide the baselines that risk detection compares against. Without baselines, risk detection is limited to self-referential trend analysis.
- **Template system:** Templates become richer — they carry not just process structure but community-calibrated quality criteria, feedback targets, trust thresholds, and risk criteria.
- **Community infrastructure:** Eventually needs a way to contribute and consume standards. But the MVP is Ditto's own built-in defaults — community sharing is a growth feature, not a launch feature.

## Where It Should Land

- **architecture.md** — standards library as a cross-cutting concept that informs L2 (agent quality), L3 (harness gates), L5 (learning baselines)
- **ADR-014** — agent behaviour standards as cognitive toolkit content
- **Insight-077** — risk detection baselines sourced from standards library
- **Process schema** — default `quality_criteria` and `feedback.metrics` populated from standards library based on process type
- **Phase 10 brief** — standards surface in the UI as "how good is this compared to typical?" context on review items
- **Future ADR** — community intelligence architecture (contribution, aggregation, privacy, opt-in)
