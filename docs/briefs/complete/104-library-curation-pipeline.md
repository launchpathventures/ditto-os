# Brief 104: Process Model Library Curation Pipeline

**Date:** 2026-04-08
**Status:** draft
**Depends on:** Brief 103 (find-or-build routing — processes are dynamically created, library needs quality control)
**Unlocks:** Community intelligence (Phase 13+), Process Model Library content scaling

## Goal

- **Roadmap phase:** Phase 11+ (Process Model Foundation)
- **Capabilities:** AI process-validator agent for quality assurance, standardisation pipeline, Ditto admin review gate, library publication with versioning and tagging

## Context

The Process Model Library (Insight-099) is load-bearing infrastructure for three concerns:
1. **Cost amortization** — pre-built models are cheap to adopt; build-from-scratch is expensive
2. **Decomposition quality** — the orchestrator decomposes against library patterns, not from blank page
3. **Process consolidation** — parameterised models prevent proliferation of narrow single-use processes

With Brief 103 enabling dynamic process creation, processes will be generated on-the-fly. Some will be good. Some will be garbage. The library needs a quality pipeline: a unified `process-validator` system agent pre-screens (edge-case testing, compliance, efficiency, duplicate detection), a standardisation step parameterises and documents, and a Ditto admin human gate ensures nothing garbage enters the library.

V1 uses a single `process-validator` agent that performs all four validation functions in one pass. If evidence emerges that specialisation is needed (e.g., compliance scanning needs different trust earning from edge-case testing), the agent can be split into focused agents in a future brief. Start unified, split when warranted.

The process-validator is a system agent running through the harness — it earns trust, accumulates memory, and improves. The curation pipeline eats its own cooking.

## Objective

Build the quality pipeline that governs which processes enter the Process Model Library: a unified `process-validator` system agent validates process quality (edge-cases, compliance, efficiency, duplicates), a standardisation step normalises and documents, and a Ditto admin review gate provides human quality assurance. All components run through the harness.

## Non-Goals

- **Populating the library with initial content** — this brief builds the pipeline, not the models. Initial content is hand-curated by the team using the existing templates.
- **Cross-instance community intelligence** — automatic model refinement from many users' corrections is Phase 13+. This brief handles single-instance quality assurance.
- **Abstract action taxonomy** — the full app-binding abstraction from Insight-099 is separate. This brief uses existing process templates as the initial Process Model format.
- **Public model marketplace** — no buying/selling. Models ship with Ditto.
- **Automated library publication** — admin review is always required in V1 (can earn trust to spot-checked later)

## Inputs

1. `docs/insights/099-process-model-library-with-app-binding.md` — Process Model Library design
2. `docs/insights/142-coverage-agent-proactive-gap-detection.md` — library curation section
3. `docs/insights/163-find-or-build-orchestration.md` — library as load-bearing infrastructure
4. `src/engine/system-agents/` — existing system agent pattern to follow
5. `processes/templates/` — existing templates (initial library content)
6. `docs/adrs/008-system-agents-and-process-templates.md` — system agent constraints
7. `docs/adrs/015-meta-process-architecture.md` — meta-process architecture

## Constraints

- The `process-validator` is a system agent — it goes through the harness, earns trust, gets corrected (ADR-008). V1 is a single unified agent; split into specialised agents only when evidence warrants (e.g., compliance needs separate trust tier from edge-case testing)
- Admin review is ALWAYS required for library publication in V1 (cannot be bypassed, even by autonomous-trust battle-testing agents)
- The pipeline is itself a process in `processes/` — it runs through the harness it governs
- Parameterisation must be meaningful — `marketplace-listing(platform=X)` not `etsy-listing` + `gumroad-listing` + `shutterstock-listing`
- Library entries must be tagged by industry, function, and complexity for discoverability
- Published models are versioned — updates don't break existing adoptions
- Battle-testing must produce structured evidence (not just pass/fail) for admin review

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| AI pre-screening before human review | App store review (Apple/Google) | pattern | AI flags issues, human makes final call |
| Adversarial testing | Spec-testing review pattern (existing in harness) | adopt | Same pattern: test against quality criteria with adversarial inputs |
| Process standardisation | Package linting (eslint, prettier for code) | pattern | Normalise structure before publication |
| Versioned library entries | Semantic versioning (npm) | pattern | Updates don't break existing consumers |
| Battle-testing as system agents | System agent pattern (ADR-008) | adopt | Same trust/harness/feedback infrastructure |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `processes/library-curation.yaml` | Create: Process definition for the curation pipeline — 5 steps: nomination → validate → standardise → admin-review → publish |
| `src/engine/system-agents/process-validator.ts` | Create: Unified system agent that performs four validation functions in one pass: (1) edge-case testing (missing/malformed inputs, unexpected formats), (2) compliance scanning (credential handling, PII, trust tier), (3) efficiency analysis (parameterisation, step consolidation), (4) duplicate detection against existing library. Produces structured validation report with per-check evidence. |
| `src/engine/library-manager.ts` | Create: Library management functions — `nominateForLibrary()`, `getLibraryModels()`, `publishToLibrary()`, `archiveModel()`. Library entries stored in `process_models` table with metadata (industry, function, complexity, version, status). Also updates `findProcessModel()` from Brief 103 to query the DB table instead of filesystem. |
| `packages/core/src/db/schema-process-models.ts` | Create: `processModels` table schema — id, slug, name, description, industry, function, complexity, version, status (nominated/testing/standardised/review/published/archived), processDefinition (YAML), qualityCriteria, validationReport, createdAt, updatedAt, publishedAt. Lives in core (engine primitive). |
| `src/engine/system-agents/process-validator.test.ts` | Create: Unit tests for all four validation functions |
| `src/engine/library-manager.test.ts` | Create: Unit tests for library management functions |

## User Experience

- **Jobs affected:** Review (admin reviews library nominations), Orient (admin sees curation pipeline status)
- **Primitives involved:** ReviewCardBlock (battle-test results for admin review), StatusCardBlock (pipeline progress), AlertBlock (duplicate detection warnings)
- **Process-owner perspective:** For end users: invisible. They adopt models from the library; they never see the curation pipeline. For Ditto admins: they review battle-test results and approve/reject library additions. The AI agents do the heavy lifting; admins make the final call.
- **Interaction states:** Nominated (awaiting testing), testing (battle-test in progress), standardised (awaiting admin), published (available for adoption), archived (deprecated)
- **Designer input:** Not invoked — admin-facing UX, lightweight section only

## Acceptance Criteria

1. [ ] `library-curation.yaml` defines a 5-step process: nomination → validate → standardise → admin-review → publish
2. [ ] `process-validator` system agent performs four checks in one pass: (a) edge-case testing (missing/empty/malformed inputs, unexpected data types), (b) compliance scanning (no hardcoded secrets, PII flagged, trust tier recommendation), (c) efficiency analysis (parameterisation opportunities, step consolidation), (d) duplicate detection against library (keyword overlap + structural similarity, merge recommendation when >70%)
3. [ ] `process-validator` is registered as a system agent (ADR-008 pattern) with `systemRole` entry
4. [ ] `processModels` table schema lives in `packages/core/src/db/` (engine primitive) and stores: slug, name, description, industry tags, function tags, complexity (simple/moderate/complex), version, status lifecycle, YAML definition, validation report
5. [ ] `nominateForLibrary()` creates a library entry in `nominated` status and starts the curation process run
6. [ ] `publishToLibrary()` requires admin approval (human step in the curation process) — cannot be bypassed
7. [ ] Published models are versioned: updates create new versions, existing adoptions reference specific versions
8. [ ] `getLibraryModels()` supports filtering by industry, function, and complexity
9. [ ] `findProcessModel()` from Brief 103 is updated to query the `processModels` DB table (replacing the filesystem-based `templates/` lookup)
10. [ ] Validation reports include structured evidence per check (check name, input used, expected behaviour, actual behaviour, pass/fail) — not just a summary
11. [ ] Unit tests cover: validation with good and bad processes (all four check types), duplicate detection with similar and dissimilar processes, library lifecycle (nominate → validate → publish), `findProcessModel()` querying DB

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: consistency with ADR-008 (system agent pattern), ADR-015 (meta-process architecture), existing test infrastructure, schema migration safety
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Unit tests for process-validator
pnpm test -- --grep "process-validator"

# Unit tests for library manager
pnpm test -- --grep "library"

# Verify schema migration
pnpm cli sync

# Verify curation process loads
pnpm cli status | grep library-curation

# Type check
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with library curation pipeline
2. Update ADR-008 — add `process-validator` system agent. Update ADR-015 Section 7 ("no new system agents" is now stale). Update system agent count in architecture.md.
3. Update `docs/architecture.md` — library curation pipeline in meta-process table, updated agent count
4. Phase retrospective: is process-validator catching real quality issues? Is admin review adding value or rubber-stamping? Is there evidence to split the validator into specialised agents?
