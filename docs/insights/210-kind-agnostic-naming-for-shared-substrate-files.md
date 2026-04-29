# Insight-210: Kind-Agnostic Naming for Shared-Substrate Files in Multi-Adapter Phases

**Date:** 2026-04-27
**Trigger:** Brief 216 (Routine dispatcher) + Brief 217 (Managed Agents dispatcher) running in parallel sessions. Brief 216 created `routine-prompt.ts` and `routine-fallback.ts`. Brief 217 immediately had to rename them to `cloud-runner-prompt.ts` and `cloud-runner-fallback.ts` because both adapters needed the same composer + the same GitHub fallback logic. The rename produced two churn commits (`ef268b7`, `4eeb5ab`), a stash-pop conflict-resolution commit (`f106ef5`), and ate ~30 minutes of integration time across both sessions.
**Layers affected:** L3 Harness (runner adapter substrate), L1 Process (development workflow).
**Status:** active

## The Insight

When a phase ships ≥2 adapters of the same shape (cloud runners, integration handlers, system agents), files that those adapters share at the substrate level should be named by the **shared shape**, not by the **first adapter's kind**. Naming by the first adapter's kind locks the file's identity to that adapter — every sibling adapter will then either (a) duplicate the file under their own kind name, or (b) rename it kind-agnostic mid-build, which produces merge churn across parallel sessions and a chain of kind-renaming commits.

For Brief 216 specifically:
- `routine-prompt.ts` → should have been `cloud-runner-prompt.ts` from day one (Brief 217 needed identical prompt-composition logic; the only kind-specific part is the `runnerKind` literal in the callback section).
- `routine-fallback.ts` → should have been `cloud-runner-fallback.ts` from day one (GitHub `pull_request` / `workflow_run` / `deployment_status` events are vendor-/repo-/workflow-agnostic; the kind discriminator is per-row, not per-file).
- `routineStateToDispatchStatus()` → should have been `cloudRunnerStateToDispatchStatus()` from day one (the state-mapping table is kind-identical across all cloud runners that send `succeeded|failed|cancelled|running`).

## Implications

1. **Sub-brief #1 of any multi-adapter phase sets the naming convention for the rest.** When the architect writes the first sub-brief, scan the parent brief's adapter list — if ≥2 share the same shape, the substrate names go kind-agnostic in sub-brief #1. The "first adapter's kind" is a lazy default that creates work later.

2. **Apply only to substrate; per-adapter logic stays per-adapter.** `claude-code-routine.ts` is correctly named after its kind. The composer / fallback / state-mapper that ALL cloud runners share is the substrate layer that goes kind-agnostic.

3. **Parallel-session merge cost is real.** Brief 216 + Brief 217 ran in parallel with significant overlap. Each rename produced a stash conflict on the file, a manual conflict resolution, and downstream import-path updates in 3-5 callers. Multiplied across multiple files, this is hours of integration time that's pure churn.

4. **Backwards-compatible aliases are cheap and worth shipping.** When the rename does happen mid-phase, the renaming brief should ship a back-compat alias for the old name (e.g., `routineStateToDispatchStatus = cloudRunnerStateToDispatchStatus`). Brief 217 did this correctly. Tests for the old name still pass; new code reaches for the new name.

5. **The same logic applies to schema/contract definitions in `@ditto/core`.** `claudeCodeRoutineStatusPayload` was filled per Brief 216 §D9, but Brief 217 §D10 had to define `claudeManagedAgentStatusPayload` with the IDENTICAL inline shape. A single `cloudRunnerStatusPayload` Zod schema parameterized by `runner_kind` literal would have been the kind-agnostic substrate. The two payloads are defined separately and kept identical by convention; one drift away from a real divergence.

## Where It Should Land

- `docs/dev-process.md` — add a "Multi-Adapter Phases" section under "How Work Gets Done" that names the kind-agnostic-substrate convention.
- `docs/architecture.md` L3 (Harness) — call out adapter substrate vs adapter implementation as separate layer concerns; substrate is shared, implementation is per-kind.
- Apply retroactively at the next adapter rename: when GitHub Action adapter (Brief 218) lands, the substrate files are already kind-agnostic; the `github-action.ts` adapter just plugs in.

## Counter-considerations

- **YAGNI risk.** If only one adapter of a kind is ever shipped, kind-agnostic naming is over-engineering. The trigger should be "≥2 adapters in the parent brief's adapter list" — not "might someday have a sibling."
- **Naming drift the other direction.** "cloud-runner" is correct for routine + managed-agent + github-action because all three are cloud runners. If a fourth adapter shipped that wasn't a cloud runner (e.g., `local-vm-runner`), the prefix would be wrong. Use the **smallest common shape** for the prefix; expand the prefix if a wider sibling lands.
