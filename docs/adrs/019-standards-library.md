# ADR-019: Standards Library — Living Quality Benchmarks

**Date:** 2026-03-24
**Status:** accepted

## Context

Ditto's process definitions already include `quality_criteria` (string array), `feedback.metrics` (name/description/target), and `trust` (initial tier, upgrade paths, downgrade triggers). These define "what good looks like" per process. But they have three limitations:

1. **Frozen at creation.** Quality criteria are hand-written when the process is defined and don't evolve unless manually edited. There is no mechanism for the learning loop to update them based on accumulated feedback.

2. **No baselines.** Quality criteria are pass/fail statements ("Brand voice issues are specific") without quantitative baselines. Risk detection (Insight-077) needs baselines to compare against: "typical correction rate for content review is 15% — yours is at 25%." The system has no concept of "what's normal."

3. **No composition.** Each process defines its own criteria from scratch. A new content review process doesn't inherit community-proven criteria. There's no "Sonar way" equivalent — no curated default that captures what Ditto already knows about quality for this type of work.

These limitations compound. Without living baselines, the learning loop (L5) can only look inward at a single process's own history. Without composition, every new process starts from zero. Without evolution, quality standards become stale.

### Design forces

**From research** (`docs/research/standards-library-community-intelligence.md`, `docs/research/quality-standards-for-agent-execution.md`):

- Every quality system separates **what to measure** from **what thresholds define good** (SonarQube, APQC, Great Expectations).
- Living standards require **feedback loops** — execution results refine the standards themselves (Grammarly, EvalLM, process mining conformance cycling).
- Quality standards compose via **inheritance cascade** — built-in → domain → personal (ESLint, SonarQube profile inheritance).
- **Trailing window baselines** (ML monitoring) are superior to fixed thresholds — baselines shift with recent data.
- **Taxonomy/benchmark separation** (APQC) allows the same process type to have different quality profiles in different contexts.
- **Quality as configuration** (CrewAI, Constitutional AI) — standards are first-class data objects, not embedded logic.
- **Three-layer quality** is universal: structural (schema) + semantic (rubric) + outcome (KPI).

**From insights:**

- **Insight-078:** Standards library is the runtime expression of "research before design." The learning loop should scout the gold standard before proposing improvements.
- **Insight-077:** Risk detection needs baselines across three layers (operational, effectiveness, strategic). Standards provide those baselines.
- **Insight-064:** Benchmark Before Keep — every pipeline handler must justify its place against measurable benchmarks. Standards provide those benchmarks.
- **Insight-069:** Skills packages are a specific type of quality standard that composes into the harness pipeline.
- **Insight-072:** Everything gets a process. Standards must work for both domain processes (repeatable) and generated processes (living roadmaps).

**From architecture:**

- Layer 5 already tracks three feedback signals: output quality, process efficiency, outcome impact. Standards extend this by providing *expected ranges* for those signals.
- ADR-014's cognitive toolkit (Layer B) already provides content-based cognitive tools as markdown files. Standards follow the same pattern — quality intelligence as content, not code.
- ADR-015's Feedback & Evolution meta-process (`improvement-scanner`) is the natural consumer of standards — it compares actual against expected to detect drift and propose improvements.
- The `quality_criteria` field on `ProcessDefinition` is a string array. Standards need richer structure: criteria + baseline + threshold + provenance.

## Decision

### 1. Quality Profile as a first-class concept

A **Quality Profile** is a structured, versioned, composable definition of "what good looks like" for a type of work. It is separate from the process definition (APQC taxonomy/benchmark separation) but referenced by it.

```yaml
# standards/content-review.yaml
id: content-review
name: Content Review Quality Profile
version: 1
domain: marketing

# What to check (criteria) — currently string[], now structured
criteria:
  - id: specific-citations
    description: Brand voice issues cite exact phrases, not vague feedback
    layer: semantic        # structural | semantic | outcome
    check: llm             # code | llm | human | metric

  - id: blocking-vs-suggestion
    description: Review distinguishes blocking issues from suggestions
    layer: semantic
    check: llm

  - id: clear-recommendation
    description: Recommendation is one of: approve, minor edits, rewrite
    layer: structural
    check: code

# What thresholds define "good" (baselines) — NEW
baselines:
  correction_rate:
    description: Percentage of outputs needing human correction
    initial: 0.30           # expected at supervised tier
    target: 0.15            # expected at spot-checked tier
    window: 20              # trailing window size (runs)

  approval_rate:
    description: Percentage approved without modification
    initial: 0.60
    target: 0.80
    window: 20

  review_time_seconds:
    description: Average human review time per output
    initial: 300            # 5 minutes
    target: 120             # 2 minutes
    window: 20

# Risk thresholds (Insight-077) — derived from baselines
risk_thresholds:
  correction_rate:
    watch: 0.20              # flag when above this
    alert: 0.35              # alert when above this
  approval_rate:
    watch: 0.65              # flag when below this
  staleness:
    alert_days: 7            # data older than this = stale risk

# Trust calibration — recommended starting points
trust_defaults:
  initial_tier: supervised
  upgrade_path:
    - after: "15 runs at > 85% approval"
      upgrade_to: spot_checked
    - after: "30 runs at > 90% approval"
      upgrade_to: autonomous
```

Quality Profiles are **YAML files** stored in `standards/` (like processes in `processes/`, templates in `templates/`). The process loader reads them. They are version-controlled alongside process definitions.

### 2. Separation: Process definition references a Quality Profile

Process definitions continue to work exactly as today. The new capability is **referencing** a quality profile:

```yaml
# processes/content-review.yaml (existing — new field added)
name: Content Review
quality_profile: content-review    # NEW — reference to standards/content-review.yaml

# Existing fields still work — they override the profile
quality_criteria:                  # overrides profile criteria (if present)
  - "Must check competitor pricing"
trust:                             # overrides profile trust_defaults (if present)
  initial_tier: spot_checked
```

**Override semantics (ESLint cascade):**
- If `quality_profile` is set: profile provides defaults for `quality_criteria`, `feedback.metrics`, `trust`, and baselines.
- If the process also defines `quality_criteria` or `trust`: process-level values **extend** (for criteria) or **override** (for trust/baselines) the profile.
- If no `quality_profile`: works exactly as today. Zero breaking changes.

**TypeScript type strategy:** The `ProcessDefinition` interface keeps `quality_criteria`, `feedback`, and `trust` as required fields. The process loader resolves profile defaults at load time — when a process references a `quality_profile`, the loader reads the profile YAML, then merges profile values with process-level values, producing a fully-populated `ProcessDefinition`. This means downstream consumers (spec-testing, metacognitive check, trust gate) see no change — they always receive a complete `ProcessDefinition` with `quality_criteria` populated.

The new `quality_profile` field is an optional string on `ProcessDefinition`. A new `resolved_baselines` field (optional) carries the computed baselines from the profile, accessible to the Self and review context but invisible to existing pipeline handlers.

### 3. Trailing window baselines (dynamic, not static)

Baselines in the quality profile are **starting values**. Once a process has enough runs, the system computes **actual baselines** from a trailing window of recent runs (pattern from ML monitoring: WhyLabs, Evidently).

The trailing window approach already exists in Ditto — trust earning uses a 20-run sliding window (ADR-007). Quality baselines use the same mechanism: the `window` field on each baseline metric determines how many recent runs are included.

**Baseline evolution:**
1. **Profile baseline** (static) — the starting value from the quality profile. Used until enough runs accumulate.
2. **Computed baseline** (dynamic) — computed from trailing window of actual runs. Takes over when `window` runs are available.
3. **Drift detection** — when the computed baseline deviates significantly from the profile baseline (>2σ or >25% relative), the system surfaces this as a potential standard refinement (Grammarly correction-to-rule pattern).

This is how the learning loop produces updated standards (Insight-078): accumulated execution data → computed baselines → deviation from profile → system proposes profile update → human approves → profile evolves.

### 4. Risk detection baselines (Insight-077)

Quality profiles include `risk_thresholds` that provide the baselines Insight-077 requires for operational risk detection:

- **Quality drift:** Correction rate above `correction_rate_watch` → Self mentions it; above `correction_rate_alert` → Self highlights it
- **Data staleness:** Input data older than `staleness_days` → temporal risk
- **Process health:** Approval rate below `approval_rate_watch` → pattern risk

These are operational risk baselines (Layer 1 of Insight-077's three layers). Effectiveness and strategic risk baselines require outcome tracking and cross-process reasoning, which are out of scope for this ADR.

### 5. Built-in profiles as "Ditto way" defaults

Ditto ships with built-in quality profiles for common work types (SonarQube's "Sonar way" pattern). These are the system's day-one intelligence about quality:

| Profile | Domain | What it encodes |
|---------|--------|-----------------|
| `general` | Any | Basic agent behaviour standards: specific output, clear reasoning, honest uncertainty |
| `content-review` | Marketing | Brand voice, factual accuracy, recommendation clarity |
| `financial` | Finance | Calculation accuracy, assumption flagging, margin tracking |
| `quote-proposal` | Sales | Client need addressed, pricing transparent, expiry included |
| `research` | Research | Sources cited, facts vs interpretation distinguished, gaps flagged |
| `data-reconciliation` | Operations | Match rate, exception handling, audit trail |

These are not process templates (those live in `templates/`). They are quality intelligence: what "good" looks like for this type of work, independent of the specific process structure. A content review process with 3 steps and one with 7 steps can share the same quality profile.

### 6. Composition model: built-in → domain → personal

Quality profiles compose via override cascade (ESLint pattern):

```
built-in (standards/general.yaml)        # Ditto's base quality intelligence
  └── domain (standards/content-review.yaml)  # Domain-specific standards
        └── process-level overrides             # Per-process customisation
```

A process definition's `quality_profile: content-review` loads:
1. `standards/general.yaml` (always — base agent behaviour standards)
2. `standards/content-review.yaml` (domain-specific criteria and baselines)
3. Process-level `quality_criteria` and `trust` fields (per-process overrides)

Later values override earlier values. Criteria arrays are merged (additive). Scalar values (trust tier, baseline numbers) are replaced.

**Note on implicit coupling:** `standards/general.yaml` is always loaded as the cascade base. This means every process with a `quality_profile` implicitly depends on the general profile. Changes to `general.yaml` cascade to all profiled processes. This is intentional — the general profile encodes universal agent behaviour standards (honest uncertainty, clear reasoning, specific output) that should apply everywhere. A process can opt out entirely by omitting `quality_profile` and defining its own `quality_criteria` directly.

### 7. Community intelligence — phased, not now

The research identified three architecture options (A/B/C). This ADR implements **Option A with the foundation for Option B:**

- **Option A (now):** Built-in profiles with feedback refinement. Quality profiles as YAML, trailing window baselines, learning loop proposes updates.
- **Option B foundation (designed but not built):** The composition model supports external profile packages. When community sharing is added, community-published profiles slot into the cascade between built-in and domain.
- **Option C (deferred):** Federated community intelligence — cross-instance aggregation via differential privacy. This requires infrastructure that doesn't exist yet (telemetry pipeline, aggregation service). Re-entry: when Ditto has 100+ active instances.

The cascade model (`built-in → community → domain → personal`) is designed now but the `community` layer is a no-op until community infrastructure exists.

### 8. What does NOT change

- **`quality_criteria` string array** stays on `ProcessDefinition`. It continues to work as today. Quality profiles add structured criteria *alongside* the existing string-based ones. **Merge semantics:** profile structured criteria are converted to string descriptions and concatenated with process-level `quality_criteria` to form the final list. Spec-testing and metacognitive check evaluate the merged list. No cross-type overriding — process-level string criteria add to, not replace, profile criteria. The structured `criteria` objects in the profile (with `layer` and `check` fields) are future-facing — the MVP treats them as string descriptions during evaluation.
- **`feedback.metrics`** stays. Quality profiles add baselines but don't replace the process-defined metric structure.
- **Trust earning (ADR-007)** stays exactly as is. Quality profiles provide recommended starting trust, but process definitions can override.
- **Metacognitive check (Brief 034b)** stays. Quality profiles provide richer criteria for it to evaluate against, but the check mechanism doesn't change.
- **Review patterns (harness pipeline)** stay. Spec-testing already uses `quality_criteria` — it will also use profile criteria if available.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Quality profile as YAML config | SonarQube Quality Profiles | pattern | Standards as structured data, separate from code |
| Inheritance cascade | ESLint shareable configs | pattern | Composable override semantics |
| Taxonomy/benchmark separation | APQC Process Classification Framework | pattern | Process definition independent of quality profile |
| Trailing window baselines | WhyLabs/Evidently ML monitoring | pattern | Dynamic baselines that evolve with data |
| Criteria co-evolution from feedback | Grammarly correction loop, EvalLM/EvalGen | pattern | Learning loop refines standards |
| Three-layer quality model | Research cross-cutting pattern | pattern | Structural + semantic + outcome |
| Risk thresholds from quality baselines | Insight-077 | original | Risk detection as first-class concept |
| Standards as learning loop output | Insight-078 | original | Runtime expression of "research before design" |

## Consequences

**What becomes easier:**
- New processes start with intelligent defaults — quality criteria, baselines, trust calibration, and risk thresholds inherited from domain profiles
- Risk detection (Insight-077) has quantitative baselines — the Self can compare actual performance against expected
- The learning loop (L5) can detect drift: "your correction rate has diverged from the standard baseline for content review"
- The improvement scanner can propose standard updates with evidence: "based on 50 runs, the correction_rate baseline should be 0.12 not 0.15"
- Phase 10 review items can show quality context: "typically 85% approval rate for this type of work — this process is at 72%"

**What becomes harder:**
- Standard profiles must be maintained — stale profiles with wrong baselines are worse than no profiles (they create false risk signals)
- The cascade override semantics add complexity to the process loader — must resolve profile → process overrides correctly
- Profile criteria and process `quality_criteria` need to be merged coherently for spec-testing and metacognitive check

**New constraints:**
- Quality profiles MUST be versioned (the `version` field is a monotonic integer, informational only — processes do not pin to a specific version. The version tracks when the profile was last meaningfully updated, enabling the learning loop to detect stale profiles.)
- The learning loop MUST NOT auto-update profiles — it proposes changes, the human approves (consistent with "never auto-fixes" in architecture.md)
- Built-in profiles MUST be re-evaluated when the engine gains new capabilities (e.g., outcome tracking enables effectiveness baselines)

**Follow-up decisions:**
- Brief for implementing quality profiles (process loader extension, standards directory, built-in profiles)
- Architecture.md Layer 5 update: add quality profiles as a concept
- When outcome tracking exists: extend baselines to effectiveness layer (Insight-077 Layer 2)
- When community infrastructure exists: activate the community layer of the cascade (Option C)

## Impact on existing ADRs

| ADR | Impact |
|-----|--------|
| ADR-007 (Trust Earning) | No change. Quality profiles provide recommended trust defaults, but ADR-007's algorithm is unchanged. |
| ADR-011 (Attention Model) | Risk thresholds from quality profiles feed the attention model. ADR-011 should reference quality profiles as a signal source. |
| ADR-013 (Cognitive Model) | No change. Cognitive mode is about how the human reviews, not about quality baselines. |
| ADR-014 (Cognitive Architecture) | Quality profiles are a new toolkit-layer content source. Agent behaviour standards in `standards/general.yaml` function like cognitive toolkit content. ADR-014 should acknowledge this. |
| ADR-015 (Meta Process Architecture) | The Feedback & Evolution meta process is the natural consumer of quality profiles. `improvement-scanner` compares actual against profile baselines. |

## Phasing

Phase 10 is the current active work (web dashboard). Despite having a higher number, it ships before Phases 7-9 because the roadmap is not strictly sequential — see `docs/roadmap.md` for the actual build order. Quality profiles ship as part of Phase 10 because the dashboard needs quality context for review items, and profiles provide that context.

| Milestone | What ships | Depends on |
|-----------|-----------|-----------|
| **Phase 10 MVP (current)** | Quality profiles YAML format. Process loader resolves `quality_profile` references. 3-4 built-in profiles. Trailing window baseline computation. Profile baselines surfaced in review context. | Nothing — can ship alongside dashboard |
| **Phase 8 (Learning — future)** | Learning loop proposes profile updates from accumulated feedback. Improvement scanner uses profile baselines as drift detection thresholds. | Phase 10 MVP profiles exist |
| **Phase 9 (Self-Improvement — future)** | `improvement-scanner` system agent consumes quality profiles as benchmarks. Proposes profile refinements with evidence. | Phase 8 learning loop |
| **Post-launch** | Community profile sharing. Federated quality signal aggregation. Cross-instance baselines. | 100+ active instances, telemetry infrastructure |

### Deferred capabilities (not in scope for this ADR)

- **Active runtime scouting of external best practice** (Insight-078's "Dev Researcher at runtime") is not addressed by this ADR. The feedback-driven evolution mechanism updates profiles from internal data. External scouting requires additional design.
- **Effectiveness and strategic risk baselines** (Insight-077 Layers 2-3) require outcome tracking infrastructure that doesn't exist yet.
- **Agentic coding platform survey** — the research flagged that Devin, Cursor, and similar systems were not surveyed. The originality claims in this ADR are qualified accordingly.
