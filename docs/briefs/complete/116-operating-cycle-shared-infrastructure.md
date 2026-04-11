# Brief 116: Operating Cycle — Shared Infrastructure (Harness Handlers + Schema)

**Date:** 2026-04-09
**Status:** draft
**Depends on:** Brief 114 (cognitive mode extensions — complete)
**Unlocks:** Brief 117 (cycle definitions + process reorganisation), Brief 118 (self-tools & front door)

## Goal

- **Roadmap phase:** Phase 3: Network Agent & Continuous Operation
- **Capabilities:** Harness-level infrastructure for outbound quality enforcement, audience-size trust routing, sending identity resolution, voice calibration, and step-category trust graduation

## Context

Brief 115 (parent) defines the Operating Cycle Archetype — a coarse, judgment-driven process pattern for all Alex capabilities. This sub-brief delivers the **shared infrastructure layer** that all cycles depend on: four new harness handlers, trust gate extensions, schema additions, and HarnessContext enrichments.

These are engine-level primitives. They belong in `packages/core/` because any consumer of `@ditto/core` (ProcessOS, etc.) could use outbound quality gates, audience classification, identity routing, and step-level trust overrides. The cycle-specific definitions and product-layer tools are in Briefs 117 and 118.

## Objective

Add four new harness handlers to the pipeline, extend the trust gate with step-category overrides, extend the database schema with cycle and outbound tracking columns/tables, and enrich HarnessContext with the fields these handlers need.

## Non-Goals

- Cycle YAML definitions — Brief 117
- Self-tools for cycle management — Brief 118
- Sub-process invocation in heartbeat — Brief 117
- Front door prompt changes — Brief 118
- Scheduler dual-trigger support — Brief 118
- Specific house value content (the handler enforces structure; the actual values are configuration)
- Channel integration adapters (LinkedIn, email) — future briefs

## Inputs

1. `docs/briefs/115-operating-cycle-archetype.md` — parent brief: full design context
2. `docs/insights/168-operating-cycle-archetype.md` — the seven structural components
3. `docs/insights/167-broadcast-supervised-direct-autonomous.md` — broadcast/direct trust split
4. `docs/insights/166-connection-first-commerce-follows.md` — three sending identities
5. `packages/core/src/harness/harness.ts` — current pipeline, HarnessContext, StepDefinition, ProcessDefinition
6. `packages/core/src/harness/handlers/trust-gate.ts` — current trust gate (to extend)
7. `packages/core/src/db/schema.ts` — current schema (to extend)
8. `packages/core/src/harness/handlers/step-execution.ts` — current step execution handler
9. `docs/architecture.md` — six-layer spec, harness pipeline

## Constraints

- **All new handlers go in `packages/core/src/harness/handlers/`.** No Ditto-specific opinions (Self, personas, network) in core. Handlers are generic; they operate on context fields set by the product layer.
- **No architectural rebuilds.** Extend the existing pipeline pattern. New handlers implement the same `HarnessHandler` interface.
- **House values are configuration, not hardcoded.** The outbound quality gate handler receives house value rules via context or a config function — it doesn't contain Ditto-specific values.
- **Broadcast/direct classification is deterministic.** Based on channel + action type metadata on context, not LLM judgment.
- **Step-category trust overrides can only relax within the process trust tier.** A supervised process can have autonomous internal steps, but an autonomous process cannot have critical steps relaxed further. Override direction: same as session trust overrides — relaxation only within bounds.
- **Broadcast classification forcing to critical takes absolute precedence over step-category overrides.** A broadcast action is always critical, regardless of step or process trust configuration. Trust gate evaluation order: (1) check broadcast classification — if broadcast, force critical and stop; (2) check `stepDefinition.trustOverride`; (3) fall back to process-level tier. This is a security invariant — broadcast content must always receive human review.
- **Type-check must pass.** `pnpm run type-check` at root after all changes.
- **Backward compatible.** All new HarnessContext fields are optional (nullable). Existing pipelines without these handlers produce identical behaviour.
- **Cross-user rate limiting is a Network-level concern.** The `outboundActions` table is shared across the centralized Ditto Network (ADR-025). The `recordOutboundAction` callback provided by the product layer is responsible for writing to and querying the shared table. In single-user workspace deployments, rate limiting is per-user only. The handler itself is deployment-agnostic — it receives rate check results via the callback, not by querying directly.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Chain-of-responsibility pipeline | Sim Studio (simstudio) | adopt | Already adopted in harness.ts — new handlers follow the same pattern |
| Step-category trust | Ditto Insight-168 | pattern | Original — extends trust-gate with per-step overrides |
| Broadcast/direct split | Ditto Insight-167 | pattern | Original — audience-size trust routing |
| Identity routing | Ditto Insight-166 | pattern | Original — three sending identities |
| Outbound quality gate | Sales operations practice | pattern | BDR compliance checks before send — structural, not judgment-based |
| Voice calibration | Memory assembly pattern | pattern | Extension of existing memory-assembly — loads voice model alongside other memories |

## What Changes (Work Products)

### New Handlers (4 files)

| File | Action |
|------|--------|
| `packages/core/src/harness/handlers/outbound-quality-gate.ts` | Create: post-execution handler that checks outbound actions against configurable house value rules. Receives rules via `HarnessContext.outboundQualityRules` (injected by product layer). Checks: rule violations (flags `reviewResult: 'flag'`), volume limits (per-recipient rate), opt-out enforcement. Non-bypassable — runs regardless of trust tier. Only activates when `context.outboundAction` is set (steps that don't produce outbound actions skip this handler). Records action to `outboundActions` table via a DB callback on context. |
| `packages/core/src/harness/handlers/broadcast-direct-classifier.ts` | Create: post-execution handler that classifies outbound actions by audience size. Deterministic lookup: channel + action type → `broadcast` or `direct`. Classification table is configurable via `HarnessContext.audienceClassificationRules` (injected by product layer, e.g., `{ 'linkedin.post': 'broadcast', 'linkedin.dm': 'direct', 'email.single': 'direct', 'email.campaign': 'broadcast' }`). Sets `context.audienceClassification`. |
| `packages/core/src/harness/handlers/identity-router.ts` | Create: pre-execution handler that resolves sending identity. Reads `stepDefinition.sendingIdentity` (explicit) or falls back to `ProcessDefinition.defaultIdentity` → sets `context.sendingIdentity`. Three values: `'principal'` (the entity itself — Alex), `'agent-of-user'` (branded agent), `'ghost'` (as the user). Generic labels — Ditto maps these to alex-as-alex, user-agent, alex-as-user in the product layer. |
| `packages/core/src/harness/handlers/voice-calibration.ts` | Create: pre-execution handler that loads voice model from memories when `context.sendingIdentity === 'ghost'`. Receives a memory query callback via `HarnessContext.voiceModelLoader` (injected by product layer — queries memories of type `voice_model`). Sets `context.voiceModel` (string content for prompt injection). No-op when identity is not ghost. **Note:** This is forward-looking infrastructure — no current cycle uses ghost as primary identity. Building it now is an investment: the handler is minimal (~30 lines), the memory type and context field are needed regardless, and deferring it would fragment the identity routing model (2 of 3 identities supported). Acceptable to defer if the builder wants to reduce scope — flag and revisit. |

### Modified Files

| File | Action |
|------|--------|
| `packages/core/src/harness/handlers/trust-gate.ts` | Modify: evaluation order: (1) if `context.audienceClassification === 'broadcast'`, force `effectiveTier = 'critical'` and skip further overrides (Insight-167 — security invariant); (2) else if `stepDefinition.trustOverride` is present, use it as `effectiveTier`; (3) else use process-level tier. Session trust overrides (existing) apply after this chain but cannot override broadcast forcing. |
| `packages/core/src/db/schema.ts` | Modify: (1) Add `cycleType` (text, nullable) and `cycleConfig` (text/JSON, nullable) and `parentCycleRunId` (text, nullable) to `processRuns` table. (2) Add `'voice_model'` to `memoryTypeValues`. (3) Add `'sub-process'` to `stepExecutorValues`. (4) Add `stepCategory` (text, nullable) to `trustSuggestions` table. (5) Create `outboundActions` table: id, processRunId, stepRunId, channel, sendingIdentity, recipientId, contentSummary, blocked (integer boolean), blockReason (nullable), createdAt. |
| `packages/core/src/harness/harness.ts` | Modify: (1) Add to `StepDefinition`: `trustOverride?: string` (step-category trust), `sendingIdentity?: string`. (2) Add to `ProcessDefinition`: `defaultIdentity?: string`. (3) Add to `HarnessContext`: `sendingIdentity: string \| null`, `audienceClassification: 'broadcast' \| 'direct' \| null`, `voiceModel: string \| null`, `outboundAction: { channel: string; actionType: string; recipientId?: string; content?: string } \| null`, `outboundQualityRules: OutboundQualityRule[] \| null`, `audienceClassificationRules: Record<string, 'broadcast' \| 'direct'> \| null`, `voiceModelLoader: ((processId: string, userId: string) => Promise<string \| null>) \| null`, `recordOutboundAction: ((action: OutboundActionRecord) => Promise<void>) \| null`. (4) Update `createHarnessContext()` to initialise new fields as null. (5) Export `OutboundQualityRule` and `OutboundActionRecord` interfaces. |

### Pipeline Registration Order

The updated handler registration order:

```
1. memory-assembly        (existing — product layer)
2. voice-calibration      (NEW — core, pre-execution)
3. identity-router        (NEW — core, pre-execution)
4. step-execution         (existing — core)
5. metacognitive-check    (existing — product layer)
6. broadcast-direct-classifier (NEW — core, post-execution)
7. outbound-quality-gate  (NEW — core, post-execution)
8. review-pattern         (existing — product layer)
9. routing                (existing — core)
10. trust-gate            (MODIFIED — core)
11. feedback-recorder     (existing — product layer)
```

The product layer registers its handlers at the right positions. Core handlers are exported for registration — the consuming application controls the pipeline order (existing pattern).

## User Experience

- **Jobs affected:** None directly — this is invisible infrastructure
- **Primitives involved:** None — no new UI surfaces
- **Process-owner perspective:** No visible change. These handlers activate when cycle processes run (Brief 117+118). Existing processes are unaffected (all new context fields are null by default).
- **Interaction states:** N/A
- **Designer input:** Not invoked — pure infrastructure

## Acceptance Criteria

1. [ ] Outbound quality gate handler blocks a step output that matches a configured house value rule (test: rule matches → `reviewResult` set to `'flag'`, `shortCircuit` not set — downstream handlers still run)
2. [ ] Outbound quality gate handler passes a step output that doesn't match any rules (test: no rules match → context unchanged)
3. [ ] Broadcast/direct classifier sets `audienceClassification = 'broadcast'` for a configured broadcast channel+action (test: `'linkedin.post'` → `'broadcast'`)
4. [ ] Broadcast/direct classifier sets `audienceClassification = 'direct'` for a configured direct channel+action (test: `'email.single'` → `'direct'`)
5. [ ] Trust gate forces `critical` tier when `audienceClassification === 'broadcast'` regardless of process trust tier (test: autonomous process + broadcast → `trustAction: 'pause'`, `canAutoAdvance: false`)
6. [ ] Trust gate respects `stepDefinition.trustOverride` — an autonomous step in a supervised process gets `trustAction: 'advance'` (test: supervised process, step with `trustOverride: 'autonomous'` → advance)
7. [ ] Identity router sets `context.sendingIdentity` from `stepDefinition.sendingIdentity` when present
8. [ ] Identity router falls back to `processDefinition.defaultIdentity` when step doesn't specify
9. [ ] Voice calibration handler calls `voiceModelLoader` and sets `context.voiceModel` when identity is `'ghost'`
10. [ ] Voice calibration handler is a no-op when identity is not `'ghost'` (test: identity `'principal'` → `voiceModel` stays null)
11. [ ] Schema migration adds `cycleType`, `cycleConfig`, `parentCycleRunId` to processRuns without breaking existing rows
12. [ ] Schema adds `outboundActions` table with all specified columns
13. [ ] `memoryTypeValues` includes `'voice_model'`, `stepExecutorValues` includes `'sub-process'`
14. [ ] All new HarnessContext fields initialise to null in `createHarnessContext()`
15. [ ] New core handlers are registered in `buildPipeline()` in `src/engine/heartbeat.ts` at the positions specified in the pipeline order table (voice-calibration after memory-assembly, identity-router before step-execution, broadcast-direct-classifier and outbound-quality-gate after metacognitive-check)
16. [ ] `pnpm run type-check` passes at root
17. [ ] All existing tests pass (no regressions)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/insights/168-operating-cycle-archetype.md`
2. Review agent checks:
   - Are all new handlers in `packages/core/` with no Ditto-specific opinions?
   - Does the outbound quality gate use configurable rules (not hardcoded values)?
   - Is the broadcast/direct classification deterministic (lookup table, not LLM)?
   - Do step-category trust overrides compose correctly with process-level trust and broadcast forcing?
   - Are all new HarnessContext fields properly nullable for backward compatibility?
   - Is the pipeline order correct (pre-execution handlers before step-execution, post-execution before trust-gate)?
   - Does the schema extension maintain backward compatibility (all new columns nullable)?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Type-check passes
pnpm run type-check

# 2. Outbound quality gate
pnpm run test -- --grep "outbound.*quality.*gate"

# 3. Broadcast/direct classification
pnpm run test -- --grep "broadcast.*direct.*classif"

# 4. Step-category trust override
pnpm run test -- --grep "step.*category.*trust\|trust.*override"

# 5. Identity router
pnpm run test -- --grep "identity.*router"

# 6. Voice calibration
pnpm run test -- --grep "voice.*calibration"

# 7. All existing tests still pass
pnpm run test
```

## After Completion

1. Update `docs/state.md` with: Brief 116 complete — 4 new core harness handlers, trust gate extended, schema extended
2. Proceed to Brief 117 (cycle definitions + process reorganisation)
3. No architecture.md update yet — save for Brief 115 parent completion when all sub-briefs are done
