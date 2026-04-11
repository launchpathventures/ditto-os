# Brief: Cognitive Mode Extensions — Mode-Dependent Judgment for Alex's Engine

**Date:** 2026-04-09
**Status:** draft
**Depends on:** Brief 029 (cognitive framework), Brief 098 (Alex continuous operation)
**Unlocks:** Mode-aware process execution, per-mode quality gates, mode-specific refusal behavior

## Goal

- **Roadmap phase:** Phase 11+ (Network Agent maturation)
- **Capabilities:** Mode-dependent cognitive judgment, mode-aware context assembly, mode-specific quality thresholds

## Context

The cognitive core (`cognitive/core.md`) provides universal judgment — house values, consultative protocol, trade-off heuristics, metacognitive checks. But Alex operates in fundamentally different modes (Connecting, Nurturing, Selling, Chief of Staff) where the same cognitive machinery needs to optimize for different goals.

Currently, mode differences live only in the character bible (prose) and individual process YAML files (per-step instructions). There's no cognitive-level encoding of how judgment shifts between modes. This means the same metacognitive check — "Should I send this?" — has identical thresholds across all modes, when in practice:

- **Connector mode** needs high confidence (Alex's institutional reputation is on the line)
- **Nurture mode** needs moderate confidence but very strong silence bias
- **Selling mode** needs moderate confidence with different quality criteria (the user's brand, not Alex's)
- **Chief of Staff mode** needs variable confidence by action type

The Architect has designed cognitive mode extension files following the `cognitive/self.md` pattern, plus mode-switching logic, a reputation/user tension framework, and a Mode Context section in `core.md`. This brief covers wiring them into the cognitive loader so they're available at runtime.

## Non-Goals

- Changing the character bible or persona voice definitions (character is a separate concern from cognition)
- Building mode detection from conversation content (mode is determined by process operator + type, not NLP)
- Changing trust tier logic (mode extensions affect cognitive judgment, not trust computation)
- Adding new process templates (existing templates already declare operators; they'll naturally get the right mode)
- Gear 1 (digital acquisition) cognitive extension — Gear 1 has lighter cognitive needs; deferred
- Ghost mode (Alex-as-User) cognitive extension — Insight-166 identifies this as a future mode; deferred until ghost mode process templates exist

## Inputs

1. `cognitive/core.md` — updated with Mode Context section (already done by Architect)
2. `cognitive/modes/connecting.md` — connecting mode extension (already written)
3. `cognitive/modes/nurturing.md` — nurturing mode extension (already written)
4. `cognitive/modes/selling.md` — selling mode extension (already written)
5. `cognitive/modes/chief-of-staff.md` — chief-of-staff mode extension (already written)
6. `cognitive/modes/README.md` — mode resolution rules, switching logic, tension framework
7. `packages/core/src/cognitive/index.ts` — current cognitive loader (extend this)
8. `src/engine/cognitive-core.ts` — Ditto's re-export of core loader (may need extension)
9. `docs/insights/159-self-is-alex-modes-not-entities.md` — Self IS Alex, modes not entities
10. `docs/insights/160-trust-context-not-universal.md` — trust context varies by context
11. `docs/insights/164-alex-acts-as-professional-not-assistant.md` — consent to approach model
12. `docs/insights/166-connection-first-commerce-follows.md` — three litmus tests for commercially-motivated connections, ghost mode identity

## Constraints

- **Token budget — two contexts.** Mode extensions are ~600-800 tokens each. Full core.md is ~1,900 tokens. These cannot be combined naively. The design uses two loading strategies: **(a) Process execution** (memory-assembly): use `getCognitiveCoreCompact()` (~200 tokens: trade-off heuristics + escalation sensitivity) + mode extension (~700 tokens) = ~900 tokens. Processes don't need the full consultative protocol — they need judgment calibration. **(b) Conversational surfaces** (assembleSelfContext): full core.md + self.md, no mode extension. Mode governs process execution, not conversation. Mode extensions are never loaded alongside self.md.
- **Extension pattern, not replacement.** `core.md` stays universal. Mode extensions layer on top. A surface that loads no mode extension still works correctly with core alone.
- **Engine-first rule.** The generic mode-loading capability belongs in `packages/core/` (any consumer could have modes). The mode resolution logic (which operator maps to which mode) is Ditto product code in `src/engine/`.
- **House values invariant.** Mode extensions can add mode-specific heuristics but cannot soften or override the 7 house values in core.md.
- **Three-layer persona architecture.** Selling mode applies to the User's Agent, not Alex/Mira. The loader must not allow selling mode to be loaded for an `alex-or-mira` operator.
- **No changes to process YAML schema.** Mode is resolved from existing fields (operator, process id/type), not a new YAML field.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Layered cognitive loading | Existing `cognitive/self.md` pattern | pattern | Already proven in codebase — extend the same approach |
| Mode-specific prompt injection | MeMo (Guan et al., 2024) via ADR-014 | pattern | Toolkit-not-prescription: provide mode context, let the model use it |
| Mode resolution from process metadata | Original to Ditto | original | No prior art for process-operator-to-cognitive-mode mapping |
| Reputation tension framework | Original to Ditto (Insights 153, 159, 160, 164) | original | Derived from Ditto's three-layer persona architecture |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/cognitive/index.ts` | Modify: Add `getCognitiveModeExtension(mode: string)` function. Resolution: `{configuredPath}/modes/{mode}.md`, fallback to `{cwd}/cognitive/modes/{mode}.md`. Cache per mode. Return empty string if file not found (graceful — no mode is valid). **Doc comment must state:** "Raw loader — performs no persona-safety checks. Ditto consumers must use `resolveModeFromProcess()` to enforce persona boundaries." |
| `src/engine/cognitive-core.ts` | Modify: Re-export `getCognitiveModeExtension`. Add `resolveModeFromProcess(operator: string, processId: string): string | null` — Ditto-specific mode resolution logic per the rules in `cognitive/modes/README.md`. Resolution checks BOTH operator AND process ID pattern (see Mode Resolution Rules below). |
| `src/engine/harness-handlers/memory-assembly.ts` | Modify: When assembling context for a process step, resolve mode from the process definition's operator and id. Load compact core (`getCognitiveCoreCompact()`) + mode extension. Include both in the agent's system prompt. Log the resolved mode string on the `stepRuns` record (new nullable `cognitiveMode` field). |
| `packages/core/src/harness/harness.ts` | Modify: Add optional `operator?: string` field to `ProcessDefinition` interface. The YAML files already declare `operator:` but the TypeScript interface doesn't parse it. YAML.parse already captures it — this just types it. |
| `src/engine/process-loader.ts` | Modify: Add optional `operator?: string` field to the local `ProcessDefinition` interface (mirrors the core type). |
| `packages/core/src/db/schema.ts` | Modify: Add nullable `cognitiveMode` column (text) to `stepRuns` table. Records which mode extension was loaded for audit trail. |
| Tests | Create: Unit tests for `getCognitiveModeExtension()` (found, not found, cached). Unit tests for `resolveModeFromProcess()` (all operator/type combinations including edge cases). Integration test: memory-assembly includes mode extension for a connecting-introduction process and records mode on stepRun. |

## Mode Resolution Rules

`resolveModeFromProcess(operator, processId)` checks BOTH operator AND process ID pattern. Both must match for a mode to resolve. The logic:

```
if operator is "alex-or-mira":
  if processId starts with "connecting-" → "connecting"
  if processId contains "nurture" → "nurturing"
  if processId starts with "selling-" → null (BLOCKED — persona guard)
  else → null

if operator is "user-agent":
  if processId starts with "selling-" or "follow-up-" → "selling"
  else → null

if operator is "ditto":
  if processId matches "weekly-briefing", "front-door-cos-*", "analytics-*",
     "pipeline-*", "inbox-*", "meeting-*" → "chief-of-staff"
  else → null

if operator is undefined/null → null (always)
```

Priority: operator is checked first. Within an operator, process ID patterns are checked in order. No pattern can match multiple modes (modes don't blend). If a process ID could theoretically match multiple patterns, the first match wins — but this should not happen with well-named processes.

## User Experience

- **Jobs affected:** None directly — mode extensions are invisible cognitive infrastructure. The user experiences better judgment (more appropriate refusals, better-calibrated outreach) without seeing the mechanism.
- **Primitives involved:** None
- **Process-owner perspective:** Alex's connector introductions feel more carefully curated. Nurture touchpoints feel warmer and less mechanical. Sales outreach feels more commercially sharp while still respecting boundaries. No new UI surfaces.
- **Interaction states:** N/A
- **Designer input:** Not invoked — this is cognitive infrastructure with no UI changes.

## Acceptance Criteria

1. [ ] `getCognitiveModeExtension("connecting")` returns the contents of `cognitive/modes/connecting.md`
2. [ ] `getCognitiveModeExtension("nonexistent")` returns empty string (no error)
3. [ ] Mode extension is cached after first load (second call doesn't re-read file)
4. [ ] `clearCognitiveCoreCache()` also clears mode extension cache
5. [ ] `resolveModeFromProcess("alex-or-mira", "connecting-introduction")` returns `"connecting"`
6. [ ] `resolveModeFromProcess("alex-or-mira", "network-nurture")` returns `"nurturing"`
7. [ ] `resolveModeFromProcess("user-agent", "selling-outreach")` returns `"selling"`
8. [ ] `resolveModeFromProcess("ditto", "weekly-briefing")` returns `"chief-of-staff"`
9. [ ] `resolveModeFromProcess(undefined, "some-process")` returns `null` — mode requires both a known operator AND a matching process ID pattern
10. [ ] `resolveModeFromProcess("ditto", "some-unknown-process")` returns `null` — operator alone is insufficient; process ID must also match a known pattern
11. [ ] Memory-assembly handler uses compact core (`getCognitiveCoreCompact()`) + mode extension in agent system prompt when process has a resolvable mode
12. [ ] Memory-assembly handler uses compact core alone (no mode content) when process has no resolvable mode
13. [ ] `assembleSelfContext()` does NOT load mode extensions — mode governs process execution only, not conversation
14. [ ] Combined token count of compact core + any single mode extension stays under 1000 tokens
15. [ ] Selling mode cannot be resolved for operator `alex-or-mira` (guard against persona violation)
16. [ ] Resolved mode is recorded on `stepRuns.cognitiveMode` when a mode is loaded
17. [ ] `stepRuns.cognitiveMode` is null when no mode is resolved
18. [ ] `getCognitiveModeExtension()` has a doc comment warning that it performs no persona-safety checks
19. [ ] All existing tests pass (no regressions)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Engine-first boundary respected (generic loader in core, resolution logic in src/engine)
   - Mode extensions don't override house values (content review)
   - Token budget stays within limits
   - Three-layer persona architecture respected (selling ≠ Alex)
   - No changes to process YAML schema
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Type-check passes
pnpm run type-check

# 2. Unit tests pass
pnpm test

# 3. Manual verification: check mode resolution
# In a Node REPL or test file:
import { getCognitiveModeExtension } from '@ditto/core'
import { resolveModeFromProcess } from './src/engine/cognitive-core'

# Should return connecting.md content
getCognitiveModeExtension('connecting')

# Should return 'connecting'
resolveModeFromProcess('alex-or-mira', 'connecting-introduction')

# Should return null (no operator)
resolveModeFromProcess(undefined, 'some-process')

# Should NOT return 'selling' for alex-or-mira
resolveModeFromProcess('alex-or-mira', 'selling-outreach') // null or throws
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for completed items
3. Update `docs/architecture.md` Cross-Cutting: Agent Cognitive Architecture section to reference mode extensions as a judgment calibration layer within Layer B
4. Add a note to `docs/adrs/014-agent-cognitive-architecture.md` referencing mode-dependent judgment as a realized extension of Layer B (Cognitive Toolkit)
5. Verify `cognitive/modes/README.md` mode resolution table matches implementation
6. Phase retrospective: what worked, what surprised, what to change
