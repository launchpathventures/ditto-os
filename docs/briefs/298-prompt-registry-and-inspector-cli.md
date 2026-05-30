# Brief 298: Prompt Registry + `ditto prompts` Inspector (P2)

**Date:** 2026-05-30
**Status:** draft
**Depends on:** Brief 296 (parent). Independent of 297 — can run in parallel.
**Unlocks:** a single surface to read/tune every system prompt; later backs a `packages/web` admin page.

## Goal

- **Roadmap phase:** Engine Hardening — Agent-Brain Transfer (Brief 296).
- **Capabilities:** P2 — one registry + inspector for every system prompt. **Tim's explicit priority — do not defer.**

## Context

There is no single place to read or tune Ditto's system prompts. They're scattered across ~6 surfaces: `src/adapters/claude.ts` `buildSystemPrompt()` (10 inline role prompts); `src/engine/system-agents/` (`router.ts`, `goal-decomposition.ts`, `knowledge-extractor.ts`, `build-on-gap.ts`); `src/engine/harness-handlers/review-pattern.ts` (maker-checker/adversarial/spec-testing) + `metacognitive-check.ts`; `src/engine/network-chat-prompt.ts` (Alex/front-door); `cognitive/core.md` + `cognitive/self.md`; `.claude/commands/*.md` (8 role contracts). Tuning the Agent's behavior means hunting across all of them. ProcessOS's `/~/agents/prompts` inspection surface proved this is worth centralizing.

## Objective

`ditto prompts` lists every system prompt with its source path; `ditto prompts <id>` renders any one verbatim — the exact text that ships. The registry is structured so a web admin view is just another renderer.

## Non-Goals

- **No prompt editing/versioning** in this brief — read/inspect only. (Editing is a later brief.)
- No web admin page yet — build the registry so the web view *can* be added, but don't add it.
- Do not move or rewrite the prompts themselves — the registry references them where they live.

## Inputs

1. `docs/briefs/296-agent-brain-transfer-parent.md` — parent context.
2. `.context/attachments/A7hasF/pasted_text_2026-05-30_23-39-22.txt` — P2 build detail + the full scattered-prompt inventory.
3. `src/cli.ts` — existing citty command structure to extend.
4. All prompt source files listed in Context — each becomes a registry entry.

## Constraints

- **Engine scope: product** (`src/engine/`) — these are Ditto-specific prompts. The registry *shape* could later inform a core pattern, but keep it product-side now.
- Each entry must call the **real builder** with representative/empty-state defaults so rendered text matches what ships — never a hand-copied duplicate that can drift.
- **ADR-052 (write during Design):** the registry entry contract (`{ id, name, surface, sourcePath, getPrompt(), note? }`), how runtime-context builders render an empty-state snapshot, and the "every new prompt registers here" rule.
- Add the registration rule to `AGENTS.md` / `CLAUDE.md` so it doesn't drift.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Prompt registry + inspector | ProcessOS/Catalyst Mastra port (`/~/agents/prompts`) | pattern | Single inspection surface proven valuable; reimplemented Ditto-native (registry module + CLI) |
| CLI command | unjs/citty (already in `src/cli.ts`) | depend | Existing routing |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/prompts/registry.ts` | Create: one entry per prompt `{ id, name, surface: role\|system-agent\|review\|cognitive\|network, sourcePath, getPrompt(): string \| Promise<string>, note? }` |
| `src/engine/prompts/registry.test.ts` | Create: every entry renders non-empty; ids unique; sourcePaths exist |
| `src/cli.ts` | Modify: add `ditto prompts` (list) and `ditto prompts <id>` (render verbatim) |
| `docs/adrs/052-prompt-registry-and-inspector.md` | Create |
| `AGENTS.md` / `CLAUDE.md` | Modify: "every new system prompt registers in `prompts/registry.ts`" rule |

## User Experience

- **Jobs affected:** Define, Orient — the operator can read/tune how the Agent thinks.
- **Primitives involved:** None (developer/operator tooling).
- **Process-owner perspective:** one command to see exactly what any Agent surface is told.
- **Interaction states:** CLI (list / single-render / unknown-id error).
- **Designer input:** Not invoked.

## Acceptance Criteria

1. [ ] `src/engine/prompts/registry.ts` exists with one entry per prompt surface in the Context inventory.
2. [ ] Each entry's `getPrompt()` calls the **real** builder (empty-state snapshot for context-composing builders) — no duplicated literals.
3. [ ] Every entry has a unique `id`, a `surface`, and a `sourcePath` that resolves to a real file.
4. [ ] `ditto prompts` lists every prompt with id, name, surface, and source path.
5. [ ] `ditto prompts <id>` renders that prompt verbatim; unknown id gives a clear error + the list.
6. [ ] A vitest asserts every registry entry renders non-empty and every `sourcePath` exists on disk.
7. [ ] All currently-shipping system prompts (claude role prompts, system-agents, review patterns, metacognitive-check, network-chat, cognitive core/self) are represented.
8. [ ] The "register every new prompt here" rule is documented in `AGENTS.md`/`CLAUDE.md`.
9. [ ] ADR-052 written; root + core type-check pass.

## Review Process

1. Spawn fresh-context Reviewer with `docs/architecture.md` + `docs/review-checklist.md`.
2. Verify: registry calls real builders (not copies); coverage is complete (grep the Context inventory); the web-renderer seam is clean (no CLI-only coupling).
3. Present work + findings to human.

## Smoke Test

```bash
pnpm ditto prompts            # lists all, with source paths
pnpm ditto prompts <some-id>  # renders one verbatim
pnpm vitest run src/engine/prompts/registry.test.ts
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` (Phase 2).
3. Retrospective.
4. ADR-052 finalized; AGENTS.md/CLAUDE.md rule landed.
