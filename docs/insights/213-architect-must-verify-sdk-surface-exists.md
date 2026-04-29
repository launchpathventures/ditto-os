# Insight-213: Architect Must Verify SDK Surface Exists Before Citing It in a Brief

**Date:** 2026-04-27
**Trigger:** Brief 217 (Managed Agents dispatcher) cited `sdk.beta.managedAgents.sessions.create(...)` and `sdk.beta.managedAgents.sessions.events.create(...)` in §"What Changes" as the dispatch path. The Builder discovered at implementation time that the bundled `@anthropic-ai/sdk@0.65.0` did NOT expose a `beta.managedAgents.sessions.*` surface — the SDK only ships `beta.messages`, `beta.files`, `beta.skills`, and `beta.models` for the Managed Agents preview-era. The Builder fell back to raw `fetch` against the documented HTTP contract (consistent with Brief 216's routine adapter pattern), which produced a deviation note in the adapter docstring + landscape entry. The deviation would have been avoided if the Architect had run a quick SDK surface check before naming an SDK call in the brief.
**Layers affected:** L1 Process (development workflow — Architect role).
**Status:** active

## The Insight

When a brief references an SDK call by name (e.g., `sdk.beta.managedAgents.sessions.create(...)`), the Architect must verify the named surface exists in the actually-installed SDK version BEFORE the brief leaves draft. Citing a surface that doesn't exist forces the Builder to either (a) silently swap to raw HTTP at implementation time and flag a deviation, or (b) bump the SDK version mid-build, which is a separate scope decision the Architect didn't authorize.

Beta APIs are the highest-risk class. Anthropic, OpenAI, GitHub, and similar providers ship beta features in three stages: HTTP contract documented → SDK skeleton merged with stubs → SDK surface generally available. The brief must distinguish which stage the target SDK is in:

- **HTTP contract only:** brief cites raw `fetch` against the documented endpoints. No SDK call names.
- **SDK skeleton with stubs:** brief cites the SDK version that ships the working surface, AND verifies that version is in `package.json`. Bump the version in a separate prep brief if needed.
- **GA SDK:** brief cites `sdk.beta.X.Y.Z(...)` confidently.

Brief 217 was at stage 1 (HTTP contract documented, SDK shipped without the surface); the brief incorrectly cited it as if at stage 3.

## Implications

1. **Architect surface-check is part of brief drafting.** Before any brief lists `sdk.X.Y.Z(...)` in a constraint or §"What Changes" row, the Architect runs `ls node_modules/<sdk>/dist/...` or `grep -r "X.Y" node_modules/<sdk>` to confirm the named surface compiles. 30 seconds of checking saves hours of mid-build pivot.

2. **Beta APIs default to raw HTTP in the brief.** The brief's reference shape for any "beta" / "preview" / "research preview" feature is raw `fetch` against the documented endpoints. The brief can note "SDK surface preferred when available" but the implementation language is HTTP until proven otherwise. Brief 216 (Routine) followed this pattern correctly; Brief 217 deviated.

3. **Builder discipline doesn't compensate for Architect omission.** Builder's job is to ship the brief as written. When the brief is wrong about substrate (SDK surface, schema column, env var name), the Builder should flag it for Architect (Insight-043) but is not the right role to redesign substrate mid-build. Brief 217 worked out OK because the deviation was small (raw fetch vs SDK call), but a larger substrate gap would have blocked the build.

4. **The spike test is the canary.** Brief 217's spike test at `src/engine/spike-tests/managed-agent-dispatch.spike.test.ts` was deliberately written with raw `fetch` (Insight-180 spike-first pattern). If the Architect had drafted the brief AFTER the spike landed, the SDK-surface mistake would not have appeared — the spike's HTTP roundtrip is the proof-of-shape that the brief should mirror.

## Where It Should Land

Adopt into `docs/dev-process.md` §"Dev Architect" role contract: add a checklist item "Before naming SDK call surfaces in a brief, verify the surface exists in the installed package version. For beta/preview features, default to raw HTTP." Also adopt into `docs/insights/180-spike-test-every-new-api.md` as a corollary — the spike's choice of HTTP-vs-SDK is the canonical reference shape for the brief's §What Changes.
