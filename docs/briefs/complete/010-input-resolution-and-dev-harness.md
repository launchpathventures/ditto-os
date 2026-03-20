# Brief: Input Resolution & Dev Harness Fixes

**Date:** 2026-03-20
**Status:** complete
**Depends on:** Phase 2 (complete)
**Unlocks:** Phase 3 (trust earning needs grounded outputs to produce meaningful trust data)

## Goal

- **Roadmap phase:** Pre-Phase 3 — unblocks meaningful trust earning
- **Capabilities:** Agent codebase access via tool use, DB schema enforcement, smoke test infrastructure

## Context

First real execution of the engine (2026-03-20) exposed three gaps that were invisible to architecture review and type-checking:

1. **Input resolution gap:** Process definitions declare `inputs: [brief, codebase, conventions]` but the engine only passes the `brief` string. The Claude adapter receives no codebase context. The architecture spec (Layer 2, Agent Harness) explicitly describes "authorised tools for this agent" and "tools: authorised tools resolved from integration registry" — but tool resolution was never implemented. Agents produce generic, ungrounded output.

2. **DB schema drift:** The Drizzle schema (`src/db/schema.ts`) evolved across Phase 2 — adding `memories`, `harnessDecisions`, and `trustChanges` tables, plus a `parallelGroupId` column — but the actual SQLite DB was never migrated. Three tables and one column were missing on first run. `drizzle-kit push` is configured in `package.json` but was never run.

3. **No execution verification:** The dev process review checklist (10 points) checks architecture compliance, provenance, security — but not "does it actually run?" Phase 2 was marked complete without ever executing the engine. Insight-019 captured this.

## Objective

After this brief is implemented: `pnpm cli sync && pnpm cli start feature-implementation --input brief="Add a health-check endpoint"` produces a plan that correctly identifies the project as TypeScript with tsx, Drizzle ORM, SQLite, and references actual files in the codebase. The DB is guaranteed in sync with the schema. Every future brief requires a smoke test.

## Architecture Note

The architecture spec (Layer 2) describes tools as "resolved from integration registry." The integration registry does not exist yet (Phase 6). This brief uses a pragmatic shortcut: tools are hardcoded in the Claude adapter and included based on step input types. When the integration registry lands in Phase 6, tool resolution should move out of the adapter and into the harness assembly step. This is a known simplification, not an oversight.

## Non-Goals

- Full integration registry (Phase 6) — we're giving agents tools, not building a generic integration framework
- MCP protocol support — direct tool use via Claude API is sufficient for now
- Agent permission enforcement — tools are granted per step definition, not per agent identity (Phase 12)
- Web UI changes — CLI only
- Process definition schema changes — the existing `inputs` declarations work as context hints; tool use is the mechanism
- Output piping between steps — Debt-004 remains deferred; steps get run inputs + tool access, not prior step outputs

## Inputs

1. `docs/architecture.md` — Layer 2 agent harness describes tool access pattern
2. `src/adapters/claude.ts` — current Claude adapter (prompt-only, no tool use)
3. `src/engine/harness-handlers/step-execution.ts` — calls `executeStep()` with `context.processRun.inputs`
4. `src/db/index.ts` — DB initialisation (no schema sync)
5. `drizzle.config.ts` — Drizzle Kit config (configured but unused)
6. `docs/insights/019-smoke-test-before-building-on.md` — the insight that prompted this work
7. `docs/review-checklist.md` — needs a new point for execution verification

## Constraints

- MUST use Claude API tool_use (not prompt stuffing) for codebase access — context window is finite; tool use scales to large codebases
- MUST NOT give agents unrestricted filesystem access — scope to the project's working directory
- MUST NOT allow agents to modify files — read-only tools only (agents produce output text, not file mutations)
- MUST use `drizzle-kit push` for dev schema sync (not `generate` + `migrate`) — we're in dev mode, not production
- MUST preserve all existing CLI commands unchanged
- MUST NOT change process YAML format — existing definitions should work better, not differently
- MUST keep tool definitions simple and composable — each tool does one thing

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Claude tool_use API | Anthropic API docs, Claude Agent SDK | Native tool use — the model was trained for this. No wrapper library needed. |
| Read file tool | Claude Code's own `Read` tool pattern | Proven: file path + optional line range. We use it every day. |
| Search/grep tool | Claude Code's `Grep` tool pattern | Proven: regex search across codebase. Essential for agent orientation. |
| List files tool | Claude Code's `Glob` tool pattern | Proven: pattern-based file discovery. Agents need to explore structure. |
| `drizzle-kit push` | Drizzle Kit docs, standard dev workflow | Official Drizzle approach for dev: push schema directly to DB without migration files |
| Smoke test as AC | Insight-019 | Emerged from this exact failure — review without execution missed 4 bugs |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/adapters/claude.ts` | **Modify:** Add tool definitions (read_file, search_files, list_files) and tool_use loop to the Claude adapter. When a step has codebase-type inputs, include tools in the API call and handle tool_use responses in a loop until the model produces a final text response. |
| `src/engine/tools.ts` | **Create:** Tool definitions and handlers. Three tools: `read_file(path, start_line?, end_line?)`, `search_files(pattern, path?, glob?)`, `list_files(path, pattern?)`. All read-only. All scoped to `process.cwd()`. |
| `src/db/index.ts` | **Modify:** Add schema push on DB init via `drizzle-kit push` (programmatic invocation). This handles both first-run (creates all tables) and schema evolution (diffs and applies changes). |
| `docs/review-checklist.md` | **Modify:** Add point 11: "Execution Verification — has the changed code been run end-to-end, not just type-checked?" |
| `docs/briefs/000-template.md` | **Modify:** Add "Smoke Test" section to the template: "Describe the manual test that proves this brief is working. This is not optional." |
| `.env.example` | **Modify:** Remove stale Postgres reference, update to SQLite-only |

## User Experience

- **Jobs affected:** None directly — this is engine infrastructure. Indirectly improves all jobs because agent outputs will be grounded in the actual codebase.
- **Primitives involved:** None
- **Process-owner perspective:** No visible change. Outputs from AI steps will be substantially more useful because agents can now read and search the codebase they're working on.
- **Interaction states:** N/A
- **Designer input:** Not invoked — no user-facing UX change

## Acceptance Criteria

### Input Resolution (Tool Use)

1. [ ] `src/engine/tools.ts` exports three tool definitions in Claude API `tool` format: `read_file`, `search_files`, `list_files`
2. [ ] `read_file` reads a file relative to `process.cwd()`, returns contents with line numbers, supports optional `start_line`/`end_line` parameters, rejects paths outside working directory (path traversal prevention)
3. [ ] `search_files` searches file contents using a regex pattern (via Node `child_process` calling `grep -rn` or equivalent), returns matching lines with file paths and line numbers, supports optional `path` (subdirectory) and `glob` (file filter) parameters
4. [ ] `list_files` lists files matching a glob pattern relative to `process.cwd()`, returns file paths sorted by name
5. [ ] Claude adapter includes tools in `messages.create()` call when the step's declared inputs (resolved by name from the process-level `inputs` array) include any with `type: "repository"` or `type: "document"` with `source: "file"` or `source: "git"`. Resolution logic: for each name in `step.inputs`, look up the matching entry in `processDefinition.inputs` to find its type and source.
6. [ ] Claude adapter handles `tool_use` stop reason: extracts tool calls, executes them via tool handlers, appends tool results, re-calls the API in a loop until `stop_reason` is `end_turn` or `max_tokens`
7. [ ] Tool use loop has a safety limit (max 25 tool calls per step execution) to prevent runaway loops
8. [ ] `pnpm cli start feature-implementation --input brief="Add a health-check endpoint"` produces a plan that references actual files in this codebase (e.g., `src/cli.ts`, `package.json`, TypeScript, Drizzle)

### DB Schema Enforcement

9. [ ] `pnpm cli sync` ensures DB schema matches code schema before syncing process definitions — no manual migration needed
10. [ ] A fresh clone with no `data/agent-os.db` can run `pnpm install && pnpm cli sync` and have a working database with all tables

### Dev Harness Fixes

11. [ ] `docs/review-checklist.md` has a new point 11: "Execution Verification"
12. [ ] `docs/briefs/000-template.md` has a "Smoke Test" section
13. [ ] `.env.example` references SQLite (not Postgres) and documents `ANTHROPIC_API_KEY`
14. [ ] Type-check passes: `pnpm run type-check` exits 0

### Smoke Test (this brief's own)

15. [ ] End-to-end: `pnpm cli sync && pnpm cli start feature-implementation --input brief="Add a health-check endpoint"` completes the first step (plan) and produces output that references real files in this repo
16. [ ] The planner's output mentions TypeScript, tsx, SQLite, or Drizzle (proving it read the codebase)

## Security Considerations

- **Path traversal:** `read_file` MUST reject paths that resolve outside `process.cwd()` after normalisation (e.g., `../../etc/passwd`). Use `path.resolve()` and verify the resolved path starts with the working directory.
- **No write access:** Tools are strictly read-only. No file creation, modification, or deletion.
- **No command execution:** `search_files` uses a controlled search implementation, not arbitrary shell execution. If using `child_process`, inputs must be sanitised to prevent command injection.
- **Symlink traversal:** After `path.resolve()`, also resolve symlinks via `fs.realpathSync()` and verify the real path starts with the working directory. A symlink inside the project could point outside it.
- **API key exposure:** All three tools (`read_file`, `search_files`, `list_files`) must exclude files matching secret patterns from their results. Use a configurable deny-list (not hardcoded): `.env*`, `*credentials*`, `*secret*`, `*.pem`, `*.key`, `*token*`, `id_rsa*`. The deny-list should be a constant that can be extended without code changes.
- **Token budget:** Tool results are included in Claude API context. Large files should be truncated (e.g., max 500 lines per `read_file` call) to prevent context overflow and cost explosion.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Tool definitions match Claude API tool_use spec
   - Path traversal prevention is robust (not just string prefix check)
   - Secret file filtering is comprehensive
   - DB schema sync approach is reliable (not just first-run but also schema evolution)
   - Tool use loop has proper termination conditions
   - Existing CLI commands still work identically
3. Run `pnpm run type-check` — must pass
4. **Run the smoke test** (AC 15-16) — must pass
5. Present work + review findings to human for approval

## Smoke Test

```bash
# Fresh DB test
rm -f data/agent-os.db*
pnpm cli sync
# Should succeed with no errors, DB created with all tables

# Grounded output test
pnpm cli start feature-implementation --input brief="Add a health-check endpoint"
# First step (plan) should pause for review
# Review output should reference actual repo files
pnpm cli review <run-id>
# Output should mention TypeScript, tsx, Drizzle, or SQLite
```

## After Completion

1. Update `docs/state.md`: input resolution working, DB schema enforcement added, review checklist expanded
2. Update `docs/roadmap.md`: note this as pre-Phase 3 prerequisite (completed)
3. Proceed to Phase 3a (trust data & scoring) — now with grounded outputs that produce meaningful trust signals
