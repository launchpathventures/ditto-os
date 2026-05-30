# Brief 300: Enforce the LLM Boundary with Lint (P7)

**Date:** 2026-05-30
**Status:** draft
**Depends on:** Brief 296 (parent). Best landed after 297 (which touches `llm.ts`) to avoid churn, but technically independent.
**Unlocks:** the `src/engine/llm.ts` provider-SDK boundary stops drifting as the team grows.

## Goal

- **Roadmap phase:** Engine Hardening — Agent-Brain Transfer (Brief 296).
- **Capabilities:** P7 — an ESLint rule that import-locks the provider SDKs to `src/engine/llm.ts`.

## Context

The `src/engine/llm.ts` boundary — Ditto calls `@anthropic-ai/sdk` / `openai` / `@google/generative-ai` directly *only* here — is convention-only. There is no lint rule, so it drifts silently as contributors grow. There is exactly one intentional exception: `src/engine/web-search.ts` imports OpenAI for Perplexity.

## Objective

The provider SDKs are import-locked to `src/engine/llm.ts` by lint, with `web-search.ts` exempted; a violation fails lint.

## Non-Goals

- Do not change any LLM provider behavior — this is pure tooling/hardening.
- Do not block the `packages/web` ai-sdk streaming transport (out of scope of this rule).

## Inputs

1. `docs/briefs/296-agent-brain-transfer-parent.md` — parent.
2. `.context/attachments/A7hasF/pasted_text_2026-05-30_23-39-22.txt` — P7 build detail.
3. Repo ESLint config (`.eslintrc*` / `eslint.config.*`).
4. `src/engine/llm.ts` (the only allowed importer) + `src/engine/web-search.ts` (the exception).

## Constraints

- **Engine scope: product tooling.** Rule scoped to `src/` + `packages/core` engine code; do not restrict `packages/web`.
- Use `no-restricted-imports` (or `no-restricted-modules`) with path-based overrides exempting `llm.ts` and `web-search.ts`.
- The rule must catch deep imports too (e.g. `@anthropic-ai/sdk/...`).

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Import-boundary lint | ProcessOS/Catalyst Mastra port + ESLint `no-restricted-imports` | pattern + depend | Standard mechanism to make a convention enforceable |

## What Changes (Work Products)

| File | Action |
|------|--------|
| ESLint config | Modify: `no-restricted-imports` blocking `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` outside `llm.ts`; exempt `llm.ts` + `web-search.ts` |
| `package.json` (lint script) | Verify: lint runs in CI / `pnpm lint` |
| (optional) a fixture test | Create: a deliberately-violating import fails lint |

## User Experience

- **Jobs affected:** None — developer-facing hardening.
- **Primitives involved:** None.
- **Process-owner perspective:** invisible; protects engine integrity.
- **Interaction states:** N/A.
- **Designer input:** Not invoked.

## Acceptance Criteria

1. [ ] ESLint blocks importing `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` (incl. deep paths) anywhere in engine code except `src/engine/llm.ts`.
2. [ ] `src/engine/web-search.ts` is exempted (OpenAI/Perplexity import passes).
3. [ ] A deliberately-violating import in any other engine file fails `pnpm lint`.
4. [ ] The existing codebase passes the new rule with zero violations (proves the exemptions are correct and complete).
5. [ ] Lint runs in CI / `pnpm lint`.

## Review Process

1. Spawn fresh-context Reviewer with `docs/review-checklist.md`.
2. Verify: rule catches deep imports; exemptions are exactly `llm.ts` + `web-search.ts` (no over-broad escape hatch); current tree is clean.
3. Present work + findings to human.

## Smoke Test

```bash
pnpm lint   # clean
# Add `import OpenAI from "openai"` to e.g. src/engine/self.ts → pnpm lint FAILS. Revert.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` (Phase 4).
3. Retrospective.
