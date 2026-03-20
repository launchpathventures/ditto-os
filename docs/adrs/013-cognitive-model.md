# ADR-013: Cognitive Model

**Date:** 2026-03-20
**Status:** accepted

## Context

Agent OS models what humans do with work (six interaction jobs), how work flows (processes, harness, meta-processes), what deserves attention (ADR-011 attention model), and how trust is earned (ADR-007). These answer:

- **What** gets reviewed? → Trust tiers
- **How often?** → Trust tiers
- **In what form?** → Attention model
- **At what cost?** → Budget model (ADR-012)

But none of these answer: **What kind of thinking does the human need to bring?**

When Rob reviews a quote, he applies 20 years of intuition in 30 seconds. When Lisa reviews a product description, she holds brand voice and audience empathy simultaneously. When Nadia reviews an analyst's report, she checks formatting compliance AND assesses whether the analysis is sound. These are fundamentally different cognitive acts — yet the system presents them identically: approve / edit / reject.

Research (`docs/research/human-cognition-models-for-agent-os.md`) surveyed cognitive science frameworks (Kahneman, Dreyfus, Klein, Polanyi, Simon, Weick, Edmondson, Bloom) and applied AI/HCI systems across 8 areas. It identified seven cognitive dimensions the architecture doesn't model, and found no surveyed AI platform that implements cognitive modeling for work oversight (Insight-037).

### Design forces

- **Rob** is an expert who reviews quotes intuitively (Dreyfus expert stage / Klein RPD). His review is System 1 — fast, pattern-matching, gut-check. The system shouldn't present his quote review with the same weight as a novel, high-stakes output.
- **Lisa** reviews product descriptions with taste (Insight-013: skills are a separate axis from jobs). Her review is creative/aesthetic — "does this feel like us?" — not analytical. The review framing should match.
- **Nadia** switches cognitive modes constantly — compliance checking on formatting, analytical assessment on content, empathetic judgment on tone. Each report needs different mental postures.
- **Jordan** demonstrates value to leadership. He needs the system to surface structural insights ("your reference checking process saves 4 days"), not just individual corrections. The abstraction ladder matters.
- **Insight-013:** Human jobs (what) vs skills (how) are two distinct axes. The cognitive model makes this operational.
- **Insight-024:** Design and engineering are different cognitive orientations. This generalises: every output type demands a cognitive orientation.
- **ADR-011:** The attention model determines oversight form (item review / digest / alert). The cognitive model determines what *kind* of human thinking is requested when the human IS pulled in. These are complementary, not competing.
- **ADR-011 §6 (deferred):** Process importance classification (reversibility, blast radius, novelty, cost of delay) was deferred with re-entry at Phase 10+. The research validates and enriches this with Simon's satisficing framework — stakes awareness is the cognitive science grounding for that deferred concept.

## Decision

### 1. Introduce a cognitive model as a cross-cutting architectural concern

The cognitive model defines **what kind of human thinking** the system is requesting. Trust tiers determine what gets reviewed. The attention model determines in what form. The cognitive model determines what cognitive posture the review demands.

This is a design concept — a way of thinking about the system — not a single feature. Like the attention model, it manifests through specific mechanisms shipped incrementally across phases.

### 2. Three mechanisms that ship incrementally

Of the seven research dimensions, three are architecturally actionable as concrete mechanisms. The remaining four are design principles that inform those mechanisms.

**Mechanism A: Cognitive mode on process steps**

Process definitions gain an optional `cognitive_mode` field per step (or at process level as default):

```yaml
steps:
  - name: draft_product_description
    executor: ai-agent
    cognitive_mode: creative    # affects review framing + feedback capture
  - name: check_pricing_rules
    executor: script
    cognitive_mode: analytical  # affects review framing + feedback capture
```

Two modes ship initially, two are deferred:

| Mode | Core question | Review framing | Feedback signal | Theoretical basis | Phase |
|------|-------------|----------------|-----------------|-------------------|-------|
| **analytical** | "Is it correct?" | Check against rules/spec | Binary: right/wrong, graduated severity | Kahneman System 2, Bloom Evaluate | Phase 5 (default — current behaviour) |
| **creative** | "Is it good?" | Taste, brand, aesthetic judgment | Multidimensional: tone, voice, resonance | Kahneman System 1, Bloom Create | Phase 5 |
| **critical** | "What's wrong with it?" | Adversarial, stress-test, find flaws | Issues found, severity, blindspots | Edmondson challenge, Klein RPD | Deferred — re-entry when adversarial review pattern needs mode-specific framing beyond analytical |
| **strategic** | "Is this the right direction?" | Evaluate against goals, context, timing | Alignment, priorities, trade-offs | Simon satisficing, Weick sensemaking | Deferred — re-entry when improvement proposals need distinct framing from standard review |

**Rationale for two-mode start:** The strongest use case is the analytical/creative distinction — Rob's quote review vs. Lisa's product description. `critical` overlaps heavily with the existing adversarial review pattern, and `strategic` overlaps with the human step executor (strategic judgment IS why human steps exist). Ship the high-signal distinction first; add modes when evidence shows the analytical/creative pair is insufficient.

**Default:** `analytical` (safe default — current behaviour). Agents cannot set their own cognitive mode — it's declared in the process definition by the human, because it reflects how the *human* thinks about that output, not how the *agent* produced it.

**What this changes in the system:**
- **L3 (Harness):** Review pattern selection becomes mode-aware. Analytical outputs use spec-testing. Creative outputs use a "taste review" framing (adapted adversarial — the reviewer assesses "does this feel right?" not "does this meet spec?").
- **L5 (Learning):** Feedback capture becomes mode-aware. Corrections on creative outputs capture aesthetic preference tags (tone, voice, brand, audience), not just diffs. Corrections on analytical outputs capture the standard binary signals.
- **L6 (Human):** Review interface signals the cognitive mode. Creative review: "Does this match the brand voice?" Analytical review: "Do the numbers check out?" The interface doesn't change structurally — it adapts the framing text, the feedback options, and the evidence displayed. Note: this touches the primary review surface and should be costed as medium, not low.
- **Attention model interaction:** When cognitive mode is `creative` on an output from an autonomous process, the attention model's default form (digest) still applies — the mode shapes *how* review is framed IF the human drills in, not *whether* they see it. Low confidence still overrides to item review as per ADR-011. The modes are orthogonal: attention determines whether the human is pulled in, cognitive mode determines how the review is framed when they are.

**Mechanism B: Enriched feedback vocabulary**

The current feedback model captures explicit corrections (approve/edit/reject + diff). This misses pre-articulate knowledge — the "feels wrong" signal that experts apply but can't decompose (Polanyi's tacit knowledge).

Extend the rejection/edit flow with optional lightweight signals:

| Signal | When used | What it captures | How it feeds learning |
|--------|----------|-----------------|----------------------|
| Specific edit (current) | Human knows what's wrong | Diff of what changed | Concrete correction pattern |
| Tagged rejection | Human knows the domain but not the specific fix | Category tag: "tone", "accuracy", "completeness", "timing", "not sure" | Clusters by tag, detects patterns |
| Gut rejection | Human knows something's wrong but can't articulate it | Flag + optional freetext | Accumulates; system asks for pattern after 3+ clustered gut rejections |

The "not sure" tag is critical — it gives the human permission to say "I don't know what's wrong but it's not right." Over time, the system detects what output characteristics correlate with gut rejections and surfaces a hypothesis: "You tend to reject descriptions under 100 words. Is length part of the quality criteria?"

This is the **elicitation** mechanism from the tacit knowledge literature — the system helps the human articulate what they already know but haven't expressed.

**Mechanism C: Insight escalation ladder**

The learning layer (L5) currently plans to detect correction patterns and propose improvements. The cognitive model adds explicit **abstraction levels** to this pipeline:

| Level | What it detects | What it proposes | Human cognitive demand |
|-------|----------------|-----------------|----------------------|
| **Correction** | Individual errors | "Fix this specific output" | System 1 (quick) |
| **Pattern** | Recurring corrections in same category | "Teach this: you always fix X" | System 2 (deliberate) |
| **Structural** | Patterns that point to a model flaw | "The underlying approach may be wrong because [evidence]" | Creative synthesis |
| **Strategic** | Structural insights that suggest goal-level changes | "Consider restructuring how you [domain action]" | Evaluation against business goals |

The escalation is automatic in detection, human-gated in action:
- Corrections: captured automatically
- Patterns: detected when 3+ corrections cluster on the same characteristic; system proposes "Teach this" (existing mechanism)
- Structural: detected when 3+ patterns share a common cause; system proposes a process definition change with evidence. **Implementation note:** "common cause" detection is the hardest mechanism in this ADR. It likely requires LLM-based reasoning over accumulated pattern data — the improvement-scanner system agent (ADR-008, Phase 9) is the natural home for this capability. The specific detection approach should be detailed in the Phase 8/9 brief, not prescribed here.
- Strategic: detected when structural insights across multiple processes point to a business-level opportunity; system proposes in the Daily Brief with evidence trail

The human decides at every level. The system never auto-escalates to implementation — it escalates the *framing*, presenting the same data at a higher abstraction level.

**Provenance:**
- Abstraction ladder: Weick's sensemaking (retrospective pattern detection), Bloom's taxonomy (Analyze → Evaluate → Create). Soar's impasse-driven learning (automatically compile problem-solving experience into chunks).
- Thresholds (3+ corrections = pattern, 3+ patterns = structural): Pattern from Agent OS's existing trust earning (ADR-007 uses similar accumulation thresholds). Specific numbers are tunable.

### 3. Four dimensions that inform but don't ship as mechanisms

The research identified seven dimensions. Three ship as mechanisms (above). Four are design principles that shape those mechanisms and other parts of the system:

**Expertise Level (Dreyfus):** The trust tier system already implicitly tracks expertise trajectory. Making this explicit per-human-per-domain is valuable but requires multi-user support (Phase 12+). For now, the insight is: trust tiers track *process* reliability, which is a proxy for human expertise in that domain. This is adequate for single-user dogfood. Re-entry: when Nadia manages multiple team members with different expertise levels.

**Challenge Orientation (Edmondson):** Agent constructive pushback is valuable but requires agents to reason about task appropriateness, not just output quality. This extends confidence metadata (ADR-011) from "I'm unsure about my output" to "I'm unsure about the task." Implementation: extend the confidence signal to include an optional `concern` field — structured text explaining *why* confidence is low. This is a small extension to ADR-011's existing per-output confidence, not a new mechanism. Build phasing: Phase 4c (when confidence metadata ships).

**Stakes Awareness (Simon):** Enriches ADR-011's deferred "process importance classification" concept. Process definitions could gain a `stakes_profile` declaration (financial impact, reputational risk, reversibility, time pressure). This modulates review depth: low-stakes items get a one-tap approve interface, high-stakes items get full context with evidence trail. Build phasing: this is ADR-011 §6 with cognitive science grounding. Re-entry condition unchanged (Phase 10+, when 10+ processes compete for attention).

**Relational Context (Zep/Graphiti):** Entity memory — temporal knowledge graph with entity nodes, relationship edges, and validity windows — is a significant infrastructure addition. It would complement (not replace) the existing two-scope memory (agent + process) as a third scope. This is the highest-value but highest-cost dimension. Build phasing: Phase 10+ (requires integration connectors from Phase 6 to ingest entity data from CRM, email, etc.). Zep/Graphiti's open-source architecture is the build-from candidate (Python, would need TypeScript port or service integration).

### 4. Architecture amendments

**New cross-cutting section in `architecture.md`:** "Cross-Cutting: Cognitive Model (ADR-013)" — alongside the attention model, governance, and integrations sections.

Framing:

> Trust tiers determine oversight **rate** (how often). The attention model determines oversight **form** (item review, digest, alert). The cognitive model determines oversight **quality** — what kind of human thinking the system is requesting and how it adapts to support that thinking.

**Layer impacts:**

| Layer | What changes |
|-------|-------------|
| **L1 (Process)** | Process/step definitions gain optional `cognitive_mode` field (analytical / creative / critical / strategic). Default: analytical. |
| **L3 (Harness)** | Review pattern selection becomes mode-aware. New review framing concept: the same review pattern adapts its prompts and human-facing text based on cognitive mode. |
| **L5 (Learning)** | Feedback capture becomes mode-aware (creative captures aesthetic tags, analytical captures binary signals). Insight escalation ladder: correction → pattern → structural → strategic. |
| **L6 (Human)** | Review interface signals cognitive mode via framing text and feedback options. Enriched rejection vocabulary (tagged rejection, gut rejection). Escalated insights surface in Daily Brief at appropriate abstraction level. |

**What doesn't change:**
- Trust tiers (4 tiers, earning algorithm, downgrade triggers) — unchanged
- Attention model (3 modes, confidence routing, silence as feature) — unchanged
- Memory architecture (two-scope, salience scoring) — unchanged (entity memory is deferred)
- Process definition structure — extended, not changed (new optional fields)
- Review Queue scope — unchanged (ADR-011's narrowed scope stands)

## Provenance

**Cognitive mode concept:** Kahneman (System 1/System 2), Dreyfus (5-stage skill acquisition), Bloom (revised taxonomy: Remember → Create). Applied as process/step-level declaration that adapts review experience. No AI platform implements this for work oversight. **Original to Agent OS.**

**Enriched feedback / tacit knowledge capture:** Polanyi (tacit knowledge). Knowledge elicitation literature (Springer 2022 — cooperative games + ontologies). Applied as structured rejection vocabulary with elicitation prompts. **Original to Agent OS.**

**Insight escalation ladder:** Weick (sensemaking — retrospective pattern detection across levels). Soar cognitive architecture (impasse-driven learning — automatic compilation). Bloom (Analyze → Evaluate → Create progression). Applied as four-level abstraction-aware learning pipeline. **Original to Agent OS.**

**Challenge orientation:** Edmondson (psychological safety). Principal-agent theory (CMR 2025). SAE Level 3 (self-assessment). Applied as extension of ADR-011 confidence with optional `concern` field. **Original to Agent OS.**

**Stakes awareness:** Simon (bounded rationality, satisficing). Cognitive Load Theory (Springer 2026). Applied as enrichment of ADR-011 §6 deferred importance classification. **Original to Agent OS.**

**Entity memory / relational context:** Zep/Graphiti temporal knowledge graph (open source, Python, 2025). Three-scope model (short-term + long-term + reasoning from Neo4j Labs 2025). Applied as third memory scope alongside agent + process. **Build FROM Zep/Graphiti; integration is Original.**

## Consequences

### What this enables

- **Mode-appropriate review.** Rob reviews a quote with "quick check" framing, not a full analytical review. Lisa reviews a product description with "does this feel right?" framing, not "does this meet the spec?" The system respects how the human actually thinks.
- **Tacit knowledge capture.** Lisa can say "not right" without knowing why. The system accumulates those signals and surfaces hypotheses. Over time, Lisa's brand sense gets partially encoded in the harness.
- **Insight escalation.** Jordan doesn't just see individual corrections — he sees "your reference checking process has a structural issue: the questionnaire template doesn't cover [X]." The system climbs the abstraction ladder.
- **Agent self-awareness extension.** The agent can flag "I completed this, but I'm concerned about [X]" — reducing information asymmetry (principal-agent problem).
- **Cognitive load management.** By matching review framing to cognitive mode and stakes, the system reduces extraneous cognitive load. The human's working memory (3-5 items) is devoted to the actual judgment, not to figuring out what kind of judgment is needed.

### What this does NOT do

- Does NOT change the review flow (approve/edit/reject remains the action set).
- Does NOT add new review patterns (the existing four — maker-checker, adversarial, spec-testing, ensemble — are reframed, not replaced).
- Does NOT require entity memory for initial implementation (deferred to Phase 10+).
- Does NOT require multi-user support for initial implementation (expertise level tracking deferred to Phase 12+).
- Does NOT introduce AI-driven cognitive mode detection — the human declares the mode in the process definition. The system may suggest modes based on output type in future phases, but never overrides the human's declaration.

### Risks

- **Mode over-engineering.** Mitigated by shipping only two modes (analytical, creative) and deferring critical/strategic with explicit re-entry conditions. If two modes prove sufficient, stop there.
- **Elicitation fatigue.** If the system asks "what specifically feels off?" too often, it becomes a burden. Mitigation: elicitation prompts are triggered only after 3+ gut rejections cluster. The system earns the right to ask by accumulating evidence first.
- **Abstraction over-reach.** The system may surface "structural insights" that are actually just noise. Mitigation: every escalated insight includes the evidence trail. The human evaluates and can dismiss. Dismissed insights reduce the escalation sensitivity.

### Relationship to other ADRs

- **ADR-007 (Trust Earning):** Unchanged. Trust tiers track process reliability. Cognitive model tracks human thinking.
- **ADR-011 (Attention Model):** Complementary. Attention determines form (item/digest/alert). Cognitive model determines quality (what thinking is needed). Challenge orientation extends ADR-011's confidence with `concern` field. Stakes awareness enriches ADR-011 §6's deferred importance classification.
- **ADR-012 (Context Engineering):** Complementary. Context assembly can be mode-aware — creative outputs include brand voice memories, analytical outputs include accuracy benchmarks.
- **ADR-003 (Memory):** Entity memory (Dimension 7) extends ADR-003's two-scope model with a third scope. Deferred to Phase 10+.

## Build Phasing

The cognitive model ships incrementally, like the attention model:

| Mechanism | Earliest phase | What ships | Cost |
|-----------|---------------|-----------|------|
| `cognitive_mode` field on process definitions | Phase 4a | One optional YAML field + schema column. No runtime effect yet. | Trivial |
| Challenge concern field on confidence | Phase 4c | One optional text field on stepRuns alongside existing confidence. | Trivial |
| Mode-aware review framing in CLI (analytical + creative) | Phase 5 | Review prompts adapt based on cognitive mode. Touches primary review surface. | Medium |
| Enriched rejection vocabulary (tags + gut) | Phase 5 | 2 new feedback signal types alongside existing approve/edit/reject. | Low |
| Insight escalation: correction → pattern | Phase 8 | "Teach this" already planned. Formalise as level 2 of 4. | Already planned |
| Mode-aware feedback capture (aesthetic tags for creative) | Phase 8 | Feedback capture adds mode-specific signal types. | Low |
| Insight escalation: pattern → structural | Phase 8/9 | New: LLM-based root cause detection via improvement-scanner agent. | Medium-High |
| Insight escalation: structural → strategic | Phase 10 | New: cross-process structural insight aggregation. Surface in Daily Brief. | Medium |
| Stakes profile on process definitions | Phase 10+ | Enriches ADR-011 §6. Re-entry condition unchanged. | Low |
| Entity memory (temporal knowledge graph) | Phase 10+ | Third memory scope. Build FROM Zep/Graphiti. | High |
| Additional cognitive modes (critical, strategic) | Phase 10+ | Re-entry: when analytical/creative pair proves insufficient. | Low |
| Per-human expertise tracking | Phase 12+ | Requires multi-user. Enriches trust with Dreyfus level per domain. | Medium |
