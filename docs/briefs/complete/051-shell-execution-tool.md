# Brief 051: Shell Execution Tool for AI-Agent Executor

**Date:** 2026-03-29
**Status:** ready
**Depends on:** Brief 050 (ArtifactBlock + Markdown Rendering — TextBlock renders markdown, block system renders artifact content)
**Unlocks:** Builder can verify code (type-check, tests), Reviewer can validate with evidence, Brief 052 (Pipeline Bridge)

## Goal

- **Roadmap phase:** Phase 10 — Web Dashboard (Composable Workspace Architecture, ADR-024)
- **Capabilities:** `run_command` codebase tool for ai-agent executor, command allowlist security model, command output as ContentBlocks

## Context

The ai-agent executor has 4 codebase tools: `read_file`, `write_file`, `search_files`, `list_files`. It cannot execute shell commands. This means:

- The Builder role contract says "MUST run `pnpm run type-check` and `pnpm test`" — but it has no tool to do this
- The Reviewer role contract says "MUST verify Builder ran tests" — but there's no evidence because Builder can't run them
- Neither role can run smoke tests from the brief

The cli-agent executor (spawns `claude -p` subprocess) has implicit shell access, but it's unreliable from the web server and is dogfood debt (Insight: Ditto owns its execution layer).

The codebase tool system is synchronous, path-validated, and has a deny-list for secrets. Adding `run_command` follows this established pattern. The integration handler system (async, YAML-declared, retry/backoff) exists for external services — overkill for local shell commands.

### Architectural Principle

Command output flows through the ContentBlock system. `run_command` results become CodeBlocks (stdout/stderr). Test summaries become ChecklistBlocks (pass/fail per suite). Type-check results become AlertBlocks (pass/fail). No bespoke "test results dashboard" — the block system handles it.

## Objective

Give the ai-agent executor the ability to run allowlisted shell commands so the Builder can verify code and the Reviewer can validate with evidence. Command output flows through ContentBlocks for rendering on any surface.

## Non-Goals

- Arbitrary shell execution — only allowlisted commands
- Integration-style shell execution (YAML-declared, async, retry) — overkill for local commands
- Test framework setup (Playwright, vitest config for web) — Brief 054
- Remote/sandboxed execution — commands run in the project directory on the server
- Interactive commands (stdin required) — only non-interactive commands
- Long-running processes (dev servers, watchers) — only finite commands with timeout

## Inputs

1. `src/engine/tools.ts` — codebase tool definitions (`readOnlyTools`, `readWriteTools`, `executeTool()`)
2. `src/adapters/claude.ts` — ai-agent executor, tool dispatch (line 357-372), tool merging (line 282-284)
3. `src/adapters/script.ts` — existing shell execution pattern (`execAsync` with timeout/buffer)
4. `src/engine/step-executor.ts` — executor dispatch
5. `.claude/commands/dev-builder.md` — builder role contract (expects type-check, test, smoke test)
6. `.claude/commands/dev-reviewer.md` — reviewer role contract (expects test evidence)
7. `src/engine/content-blocks.ts` — CodeBlock, ChecklistBlock, AlertBlock types
8. `src/engine/self-stream.ts` — `toolResultToContentBlocks()` for block emission

## Constraints

- **Executable + subcommand allowlist** — not just executable-level gating, but subcommand-level. See allowlist table below. Builder cannot `rm`, `curl`, `ssh`, `mv`, `cp` with this tool.
- **Tool interface uses `executable: string` + `args: string[]`** — NOT a single command string. This eliminates command parsing ambiguity and aligns with `execFile(file, args)` API. Agent must specify executable and args separately.
- Must use `execFile` (not `exec`) to avoid shell interpretation attacks
- Path validation: working directory must be within project root (same pattern as `read_file`)
- Timeout: 120 seconds per command (matches script adapter and integration CLI handler)
- Output buffer: 10MB max (matches integration CLI handler)
- All commands logged in step execution audit trail (existing `toolCalls` tracking)
- Output scrubbing: filename-based pattern matching (reuse `SECRET_PATTERNS`). Limitation: this catches references to secret files in output but does NOT detect inline secrets (API keys, tokens). This is an accepted limitation — content-based secret detection is a separate concern.
- Tool availability controlled by step config: new `tools: "read-write-exec"` value (superset of read-write)
- Standalone dev role processes (`dev-*-standalone.yaml`) updated to use `tools: read-write-exec` for builder and reviewer roles
- Reviewer has exec access by design — the point is to run tests on Builder's code. The trust gate between Builder and Reviewer steps mitigates Builder-to-Reviewer trap risk at `supervised` trust level.

### Command Allowlist

| Executable | Allowed subcommands/flags | Denied | Why |
|-----------|--------------------------|--------|-----|
| `pnpm` | `run`, `test`, `exec`, `install --frozen-lockfile` | `publish`, `link` | Build/test only, no publishing |
| `npm` | `run`, `test` | `exec`, `publish`, `link`, `install` | `npm exec` downloads arbitrary packages — use pnpm instead |
| `node` | File paths only (args[0] must end in `.js`, `.ts`, `.mjs`, `.cjs`) | `-e`, `--eval`, `--input-type`, `-p`, `--print` | Prevents arbitrary code injection via eval flags |
| `git` | `status`, `log`, `diff`, `show`, `branch`, `ls-files`, `rev-parse` | `push`, `reset`, `checkout`, `clean`, `merge`, `rebase` | Read-only git operations |
| `npx` | **Not allowed** | All | Downloads and executes arbitrary packages from npm |

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Codebase tool pattern | `src/engine/tools.ts` | pattern | Extending our existing tool system |
| Shell execution | `src/adapters/script.ts` | pattern | Existing execAsync pattern with timeout/buffer |
| `execFile` over `exec` | Node.js security best practices | pattern | Prevents shell injection |
| Command allowlist | Common sandbox pattern (Docker, CI runners) | pattern | Established security model for agent shell access |
| Output as ContentBlocks | ADR-021 Surface Protocol | pattern | Command output renders through block system |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/tools.ts` | Modify: Add `run_command` tool definition (LlmToolDefinition) with `executable: string`, `args: string[]`, and optional `timeout: number` parameters. Add `executeCommand()` handler with executable+subcommand allowlist validation, `execFile(executable, args)` dispatch, path validation, output scrubbing, timeout. Add to new `execTools` array. Export `COMMAND_ALLOWLIST` for testing. |
| `src/adapters/claude.ts` | Modify: Handle `tools: "read-write-exec"` config — merges `readWriteTools` + `execTools`. Add `run_command` to `CODEBASE_TOOL_NAMES` set for sync dispatch. |
| `processes/dev-builder-standalone.yaml` | Modify: Change `config.tools` from `read-write` to `read-write-exec`. |
| `processes/dev-reviewer-standalone.yaml` | Modify: Change `config.tools` from `read-only` to `read-write-exec` (reviewer needs to run tests but also to read code; exec enables test running). |
| `.claude/commands/dev-builder.md` | Modify: Add "Shell Execution" section documenting `run_command` tool, allowlisted commands, requirement to run type-check + test + smoke test and include output evidence. |
| `.claude/commands/dev-reviewer.md` | Modify: Add "Verification" section documenting `run_command` tool, requirement to independently run type-check and tests (not just trust builder's claim). |
| `src/engine/self-stream.ts` | Modify: Update `toolResultToContentBlocks()` — when `start_dev_role` result includes command output sections (delimited markers), parse into CodeBlock (stdout/stderr) and ChecklistBlock (test pass/fail summary). |
| `src/engine/tools.test.ts` | Modify: Add tests for `run_command`: allowlist enforcement, path validation, timeout, output scrubbing, `execFile` not `exec`. |

## User Experience

- **Jobs affected:** Review (primary — seeing verified test results, not just claims), Delegate (confidence that Builder actually verified its work)
- **Primitives involved:** Output Viewer (command output as CodeBlock in artifact mode), Review Interface (test results as ChecklistBlock)
- **Process-owner perspective:** The user delegates "build feature X" to the dev pipeline. The Builder writes code, then runs `pnpm run type-check` and `pnpm test` via `run_command`. The output appears in the step result as a CodeBlock (command output) and ChecklistBlock (test summary). The Reviewer independently runs the same commands to verify. When the user reviews the Builder's output in artifact mode, they see the actual test results — not just a claim that tests pass. The Reviewer's verdict includes independent verification evidence.
- **Interaction states:**
  - **Running:** Status message "Running pnpm run type-check..." visible during streaming
  - **Success:** CodeBlock with stdout, ChecklistBlock with pass/fail items
  - **Failure:** CodeBlock with stderr, AlertBlock with error summary
  - **Timeout:** AlertBlock with "Command timed out after 120s" message
  - **Denied:** AlertBlock with "Command not in allowlist" message (if agent tries disallowed command)
- **Designer input:** Not invoked — no new UI components. Output renders through existing block registry.

## Acceptance Criteria

1. [ ] `run_command` tool definition added to `src/engine/tools.ts` with `executable: string`, `args: string[]`, and optional `timeout: number` (default 120s) parameters.
2. [ ] Executable + subcommand allowlist enforced per the allowlist table in Constraints. `npx` rejected entirely. `node -e`/`--eval` rejected. `npm exec` rejected. Attempting disallowed executable or subcommand returns error message (not exception).
3. [ ] `git` subcommand restriction: only `status`, `log`, `diff`, `show`, `branch`, `ls-files`, `rev-parse`. All other git subcommands rejected.
4. [ ] Commands executed via `execFile(executable, args)` — no shell interpretation. No command string parsing needed (executable and args are separate parameters).
5. [ ] Working directory validated: must resolve to within project root. Traversal attempts rejected.
6. [ ] Output scrubbing: stdout/stderr scanned for patterns matching `SECRET_PATTERNS`. Matches replaced with `[REDACTED]`.
7. [ ] Timeout enforced: commands killed after timeout (default 120s). Timeout error returned as structured message.
8. [ ] Output buffer capped at 10MB. Overflow returns truncated output with warning.
9. [ ] `claude.ts` adapter handles `tools: "read-write-exec"` — merges read-write tools + exec tools. `run_command` dispatched via sync `executeTool()` path.
10. [ ] `dev-builder-standalone.yaml` and `dev-reviewer-standalone.yaml` updated to `tools: read-write-exec`.
11. [ ] Builder role contract updated: documents `run_command`, lists allowed commands, requires running type-check + test + smoke test with output evidence.
12. [ ] Reviewer role contract updated: documents independent verification via `run_command`.
13. [ ] Tests in `tools.test.ts`: allowlist enforcement (positive + negative), path validation, timeout handling, output scrubbing, `execFile` usage.
14. [ ] `pnpm run type-check` passes with 0 errors.
15. [ ] Existing `read-only` and `read-write` tool configs continue to work (no regression).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - **Security**: Allowlist actually enforced (test with disallowed commands). `execFile` not `exec`. No shell interpretation. Path validation. Secret scrubbing.
   - **Composability**: Command output flows through ContentBlocks (CodeBlock, ChecklistBlock, AlertBlock). No bespoke output rendering.
   - **Engine integration**: Tool follows existing codebase tool pattern. Config-driven enablement (`read-write-exec`).
   - No regressions to existing tool configs.
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run existing tests to verify no regression
cd /Users/thg/conductor/workspaces/agent-os/paris
pnpm test

# 2. Start web app and trigger builder
pnpm dev
# In conversation: "Run the Builder to implement Brief 050"
# Builder should:
#   - Write code changes
#   - Call run_command("pnpm run type-check")
#   - Call run_command("pnpm test")
#   - Include output in step result
#
# 3. Verify command output appears as CodeBlock in conversation/artifact
# 4. Verify: try disallowed command (Builder asks to run `curl` or `rm`) → rejected
# 5. Verify: pnpm run type-check passes
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark "Shell Execution Tool" as done
3. Update `docs/architecture.md` — add `read-write-exec` to tool config documentation and document `run_command` tool with allowlist
3. Phase retrospective: Is the allowlist sufficient? Did the builder actually run tests? Did output flow through blocks correctly?
4. Next: Brief 052 (Pipeline Bridge) — Self can now start full pipeline since Builder/Reviewer can verify code.
